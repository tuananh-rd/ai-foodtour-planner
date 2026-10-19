// qa/online-assistant/final-integration/reproduce_focus.mjs
// Exact reproduction of S0 clarify chip focus behavior on 1280x800 and 390x844
// Running against production 3060 / API 8060.

import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT_WEB = 3060;
const PORT_CDP = 9335;
const BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const S0 = 'Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin.';

const pause = (ms) => new Promise((res) => setTimeout(res, ms));

async function until(fn, timeoutMs = 20000, stepMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fn();
      if (res) return res;
    } catch {}
    await pause(stepMs);
  }
  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

async function main() {
  console.log('=== EXACT FOCUS REPRODUCTION ON 1280x800 AND 390x844 ===');
  const tempProfile = join(__dirname, '.temp_chrome_focus_trace');
  const browserProc = spawn(BROWSER_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--remote-debugging-port=${PORT_CDP}`,
    `--user-data-dir=${tempProfile}`,
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  const cleanup = () => {
    try { browserProc.kill(); } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  try {
    let target;
    await until(async () => {
      const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json`)).json();
      target = list.find((x) => x.type === 'page');
      return Boolean(target);
    }, 10000);

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let msgId = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message));
        else p.resolve(m.result);
      }
    };

    function cdp(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++msgId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    for (const domain of ['Page', 'Runtime', 'DOM']) {
      await cdp(`${domain}.enable`);
    }

    async function ev(expr) {
      const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      }
      return r.result?.value;
    }

    async function key(k) {
      await cdp('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: k,
        code: k,
        text: k === 'Enter' ? '\r' : undefined,
        windowsVirtualKeyCode: k === 'Tab' ? 9 : k === 'Enter' ? 13 : undefined
      });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k });
    }

    async function waitIdle() {
      await pause(100);
      await until(async () => !(await ev(`!!document.querySelector('[aria-busy="true"]')`)), 25000);
      await pause(150);
    }

    const results = [];

    for (const vp of [
      { name: 'Desktop 1280x800', w: 1280, h: 800, mobile: false },
      { name: 'Mobile 390x844', w: 390, h: 844, mobile: true }
    ]) {
      console.log(`\n--- Testing ${vp.name} ---`);
      await cdp('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 1,
        mobile: vp.mobile
      });

      const url = `http://127.0.0.1:${PORT_WEB}/?guided=1&conv=trace_focus_${vp.w}`;
      console.log(`Navigating to ${url}...`);
      await cdp('Page.navigate', { url });
      await until(async () => ev(`!!document.querySelector('[data-testid="guided-container"]')`));
      await waitIdle();

      // Reset session if exists
      const hasReset = await ev(`!!document.querySelector('[data-testid="guided-reset-btn"]')`);
      if (hasReset) {
        await ev(`document.querySelector('[data-testid="guided-reset-btn"]')?.click()`);
        await waitIdle();
      }

      await ev(`(()=>{
        window.__events = [];
        document.addEventListener('focusin', e => {
          window.__events.push({ type: 'focusin', tag: e.target.tagName, testid: e.target.getAttribute('data-testid'), time: Math.round(performance.now()) });
        });
        document.addEventListener('focusout', e => {
          window.__events.push({ type: 'focusout', tag: e.target.tagName, testid: e.target.getAttribute('data-testid'), time: Math.round(performance.now()) });
        });
      })()`);

      // Focus input by clicking
      console.log('Focusing input...');
      await ev(`document.querySelector('[data-testid="guided-input"]')?.focus()`);
      await pause(100);

      const activeBeforeType = await ev(`document.activeElement?.getAttribute('data-testid')`);
      console.log('Active element before typing:', activeBeforeType);

      // Insert text S0
      console.log('Inserting S0 text...');
      await cdp('Input.insertText', { text: S0 });
      await pause(80);

      // Submit via Enter key
      console.log('Submitting via Enter key...');
      await key('Enter');

      // Wait for reply to arrive (wait for clarify card or chips to render)
      console.log('Waiting for clarify question card and first chip...');
      await until(async () => {
        return await ev(`!!document.querySelector('[data-testid="clarify-question-card"]') && !document.querySelector('[aria-busy="true"]')`);
      }, 25000);

      // Give 200ms for any focus effects or timeouts
      await pause(200);

      // Now capture comprehensive focus trace
      const trace = await ev(`(()=>{
        const active = document.activeElement;
        const firstChip = document.querySelector('[data-testid^="clarify-option-"]');
        const freeInput = document.querySelector('[data-testid="clarify-free-text-input"]');
        const clarifyCard = document.querySelector('[data-testid="clarify-question-card"]');
        const guidedInput = document.querySelector('[data-testid="guided-input"]');

        return {
          activeTagName: active ? active.tagName : null,
          activeTestId: active ? active.getAttribute('data-testid') : null,
          activeClassName: active ? active.className : null,
          activeValue: active ? active.value : null,
          isFirstChipFocused: active === firstChip,
          firstChipDetails: firstChip ? {
            tagName: firstChip.tagName,
            testId: firstChip.getAttribute('data-testid'),
            disabled: firstChip.disabled,
            text: firstChip.textContent.trim(),
            rect: firstChip.getBoundingClientRect()
          } : null,
          freeInputDetails: freeInput ? {
            tagName: freeInput.tagName,
            testId: freeInput.getAttribute('data-testid')
          } : null,
          clarifyCardRendered: !!clarifyCard,
          guidedInputValue: guidedInput ? guidedInput.value : null,
          guidedInputFocused: active === guidedInput
        };
      })()`);

      const manualFocus = await ev(`(()=>{
        const chip = document.querySelector('[data-testid^="clarify-option-"]');
        if (chip) chip.focus();
        return { activeTag: document.activeElement?.tagName, activeTestId: document.activeElement?.getAttribute('data-testid') };
      })()`);
      console.log('Manual focus on chip test:', manualFocus);

      const eventLog = await ev('window.__events');
      console.log('Focus event log:', JSON.stringify(eventLog, null, 2));
      console.log('Trace result:', JSON.stringify(trace, null, 2));
      results.push({ viewport: vp.name, eventLog, manualFocus, ...trace });
    }

    console.log('\n=== REPRODUCTION SUMMARY ===');
    for (const r of results) {
      console.log(`${r.viewport}: isFirstChipFocused = ${r.isFirstChipFocused}, activeElement = ${r.activeTagName}#${r.activeTestId || ''}`);
    }

  } finally {
    cleanup();
  }
}

main().catch(err => {
  console.error('Error during focus reproduction:', err);
  process.exit(1);
});
