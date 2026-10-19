import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';

const PORT_CDP = 19700;
const BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPORT_DIR = path.resolve('docs/reports/functional-qa-20261018');

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

async function checkPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const free = await checkPortFree(PORT_CDP);
  if (!free) throw new Error(`Port ${PORT_CDP} is not free!`);

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-exact-'));
  const chromeProfile = path.join(scratch, 'profile');

  const chromeProc = spawn(BROWSER_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--remote-debugging-port=${PORT_CDP}`,
    `--user-data-dir=${chromeProfile}`,
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  const cleanup = () => {
    try {
      if (chromeProc.pid) {
        execFileSync('taskkill', ['/pid', String(chromeProc.pid), '/T', '/F'], { stdio: 'ignore' });
      }
    } catch (_) {}
    try {
      fs.rmSync(scratch, { recursive: true, force: true });
    } catch (_) {}
  };

  process.on('exit', cleanup);

  try {
    let target = null;
    for (let i = 0; i < 50; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json`)).json();
        target = list.find((x) => x.type === 'page');
        if (target) break;
      } catch (_) {}
      await pause(100);
    }
    if (!target) throw new Error('CDP target not found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let msgId = 0;
    const pending = new Map();
    const networkCalls = [];
    const consoleLogs = [];

    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Network.requestWillBeSent') {
        networkCalls.push({ url: m.params.request.url, method: m.params.request.method, postData: m.params.request.postData });
      }
      if (m.method === 'Network.responseReceived') {
        const req = networkCalls.find(r => r.url === m.params.response.url);
        if (req) req.status = m.params.response.status;
      }
      if (m.method === 'Runtime.consoleAPICalled') {
        consoleLogs.push(m.params.args.map(a => a.value || a.description).join(' '));
      }
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

    await cdp('Page.enable');
    await cdp('Network.enable');
    await cdp('Runtime.enable');
    await cdp('DOM.enable');

    async function setViewport(width, height, isMobile = false) {
      await cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: isMobile,
        screenOrientation: isMobile ? { angle: 0, type: 'portraitPrimary' } : undefined
      });
    }

    async function ev(expr) {
      const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      }
      return r.result?.value;
    }

    async function snapScreenshot(filepath) {
      const res = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
      console.log(`Saved screenshot: ${path.basename(filepath)}`);
    }

    async function waitIdle(ms = 300) {
      await pause(ms);
      for (let i = 0; i < 40; i++) {
        const busy = await ev(`!!document.querySelector('[aria-busy="true"]')`);
        if (!busy) break;
        await pause(100);
      }
      await pause(200);
    }

    async function click(selector) {
      await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);
      const box = await ev(`(()=>{
        const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
        return r && { x: r.x + r.width/2, y: r.y + r.height/2 };
      })()`);
      if (!box) throw new Error(`Cannot find selector to click: ${selector}`);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...box });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...box });
      await waitIdle();
    }

    async function typeAndSend(text, selector = '[data-testid="guided-input"]') {
      await ev(`(()=>{
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) {
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(el, ${JSON.stringify(text)});
          else el.value = ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await pause(100);
      const sendBtn = await ev(`!!document.querySelector('[data-testid="guided-send-btn"]:not([disabled])')`);
      if (sendBtn) {
        await click('[data-testid="guided-send-btn"]');
      } else {
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
      }
      await waitIdle();
    }

    console.log('=== Step 1: Open 3040 (Synthetic) at Desktop 1440x1024 ===');
    await setViewport(1440, 1024, false);
    await cdp('Page.navigate', { url: 'http://127.0.0.1:3040/' });
    await waitIdle(2000);

    await snapScreenshot(path.join(REPORT_DIR, '01_3040_empty_state.png'));

    console.log('=== Step 2: Send Exact Input ===');
    const exactInput = 'tour3 quán quanh Hồ Gươm tối nay120 phút,500nghìn cho2người,thích phở và bún chả,dị ứng đậu phộng';
    console.log(`Sending: "${exactInput}"`);
    await typeAndSend(exactInput);
    await pause(1500);

    await snapScreenshot(path.join(REPORT_DIR, '02_3040_after_exact_input.png'));

    // Inspect Understood card and Clarify card
    const cardsState1 = await ev(`(() => {
      const understood = document.querySelector('[data-testid="understood-card"]');
      const clarify = document.querySelector('[data-testid="clarify-question-card"]');
      const notice = document.querySelector('.nn-notice-safety, [data-testid="allergy-warning-card"], .nn-allergy-notice');
      const chips = Array.from(document.querySelectorAll('[data-testid^="clarify-option-"]')).map(c => ({
        id: c.getAttribute('data-testid'),
        text: c.innerText.trim()
      }));
      const understoodItems = Array.from(document.querySelectorAll('[data-testid^="understood-row-"], .understood-item, [data-testid="understood-items"] > div')).map(r => r.innerText.trim());

      return {
        hasUnderstood: !!understood,
        understoodText: understood?.innerText,
        understoodItems,
        hasClarify: !!clarify,
        clarifyText: clarify?.innerText,
        chips,
        noticeText: notice?.innerText,
        chatText: document.querySelector('#guided-chat-section')?.innerText
      };
    })()`);

    console.log('Cards state 1:', JSON.stringify(cardsState1, null, 2));

    console.log('=== Step 3: Answer Clarification (budget_scope: group) ===');
    const hasGroupChip = await ev(`!!document.querySelector('[data-testid="clarify-option-scope:group"]')`);
    console.log('Has clarify-option-scope:group chip:', hasGroupChip);
    if (hasGroupChip) {
      await click('[data-testid="clarify-option-scope:group"]');
      await pause(1500);
      await snapScreenshot(path.join(REPORT_DIR, '03_3040_after_budget_scope.png'));
    }

    const cardsState2 = await ev(`(() => {
      const clarify = document.querySelector('[data-testid="clarify-question-card"]');
      const chips = Array.from(document.querySelectorAll('[data-testid^="clarify-option-"]')).map(c => ({
        id: c.getAttribute('data-testid'),
        text: c.innerText.trim()
      }));
      return {
        hasClarify: !!clarify,
        clarifyText: clarify?.innerText,
        chips
      };
    })()`);
    console.log('Cards state 2:', JSON.stringify(cardsState2, null, 2));

    // Follow-up question if any (e.g. start_time)
    if (cardsState2.hasClarify) {
      console.log('Answering follow-up question...');
      const has19 = await ev(`!!document.querySelector('[data-testid="clarify-option-time:19:00"]')`);
      if (has19) {
        await click('[data-testid="clarify-option-time:19:00"]');
      } else {
        const hasFirstChip = cardsState2.chips[0];
        if (hasFirstChip) {
          await click(`[data-testid="${hasFirstChip.id}"]`);
        } else {
          await typeAndSend('19h', '[data-testid="clarify-free-text-input"]');
        }
      }
      await pause(1500);
      await snapScreenshot(path.join(REPORT_DIR, '04_3040_after_followup.png'));
    }

    // Now test changing budget as requested: "then answer clarifications and change budget"
    console.log('=== Step 4: Change Budget in Mid-Flow ===');
    console.log('Attempting to edit budget row or send budget change message...');
    const editBudgetBtn = await ev(`!!document.querySelector('[data-testid="understood-edit-budget"], button[aria-label*="ngân sách"], button[aria-label*="budget"]')`);
    console.log('Has edit budget button:', editBudgetBtn);
    if (editBudgetBtn) {
      await click('[data-testid="understood-edit-budget"], button[aria-label*="ngân sách"], button[aria-label*="budget"]');
      await pause(500);
      await snapScreenshot(path.join(REPORT_DIR, '05a_3040_edit_budget_modal.png'));
    } else {
      console.log('Typing budget change into chat input: "đổi ngân sách thành 700 nghìn"');
      await typeAndSend('đổi ngân sách thành 700 nghìn');
      await pause(1500);
      await snapScreenshot(path.join(REPORT_DIR, '05b_3040_after_budget_change.png'));
    }

    const cardsState3 = await ev(`(() => {
      const understood = document.querySelector('[data-testid="understood-card"]');
      const clarify = document.querySelector('[data-testid="clarify-question-card"]');
      const confirm = document.querySelector('[data-testid="confirm-summary-card"]');
      const timeline = document.querySelector('[data-testid="guided-timeline"]');
      return {
        understoodText: understood?.innerText,
        hasClarify: !!clarify,
        clarifyText: clarify?.innerText,
        hasConfirm: !!confirm,
        confirmText: confirm?.innerText,
        hasTimeline: !!timeline
      };
    })()`);
    console.log('Cards state 3:', JSON.stringify(cardsState3, null, 2));

    ws.close();
    console.log('\n=== Exact Flow Execution Finished ===');
  } finally {
    cleanup();
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
