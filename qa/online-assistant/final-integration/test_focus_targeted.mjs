// qa/online-assistant/final-integration/test_focus_targeted.mjs
// Targeted verification of GuidedLayout focus fixes and transitions on isolated test servers.
// Ports: Web 13100, API 18100, CDP 19300 (never touches 3060/8060).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = path.resolve(__dirname, '../../..');

function dirname(p) {
  return path.dirname(p);
}

const PORT_WEB = 13100;
const PORT_API = 18100;
const PORT_CDP = 19300;
const S0 = 'Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin.';
const BROWSER_PATH = process.env.BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PYTHON_PATH = path.join(root, '.venv/Scripts/python.exe');

const pause = (ms) => new Promise((res) => setTimeout(res, ms));

async function until(fn, timeoutMs = 25000, stepMs = 100) {
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

const children = [];
const evidence = {
  testedAt: new Date().toISOString(),
  cases: []
};

function recordCase(id, name, pass, details = {}) {
  const item = { id, name, pass: Boolean(pass), details };
  evidence.cases.push(item);
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id}: ${name} ${details ? JSON.stringify(details) : ''}`);
  if (!pass) {
    console.error(`Case failed: ${id} - ${name}`);
  }
}

async function main() {
  console.log('=== TARGETED FOCUS & TRANSITION VERIFICATION ===');

  // Verify ports are free before start
  for (const port of [PORT_WEB, PORT_API, PORT_CDP]) {
    let busy = false;
    try {
      await fetch(`http://127.0.0.1:${port}`);
      busy = true;
    } catch {}
    if (busy) throw new Error(`Required test port is occupied: ${port}`);
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-focus-test-'));
  const sessionDb = path.join(scratch, 'sessions.sqlite');

  const env = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    FOODTOUR_PREVIEW: '0',
    FOODTOUR_LLM: 'mock',
    FOODTOUR_CHAT_V2: '1',
    FOODTOUR_UI_GUIDED: '1',
    FOODTOUR_UI_V2: '1',
    FOODTOUR_ROUTING: 'estimate',
    FOODTOUR_GEOCODER: 'off',
    FOODTOUR_RATE_LIMIT_TOKEN: '10000',
    FOODTOUR_RATE_LIMIT_IP: '10000',
    WEB_ORIGIN: `http://127.0.0.1:${PORT_WEB}`,
    PYTHONPATH: path.join(root, 'backend'),
    PYTHONIOENCODING: 'utf-8',
    FOODTOUR_DATA_PATH: path.join(root, 'contracts/fixtures/venues.chat.synthetic.json'),
    FOODTOUR_SESSION_DB: sessionDb,
    NEXT_PUBLIC_API_URL: `http://127.0.0.1:${PORT_API}`,
    NEXT_PUBLIC_API_MODE: 'real',
    NEXT_PUBLIC_UI_GUIDED: '1',
    NEXT_PUBLIC_CHAT_V2: '1',
    NEXT_PUBLIC_UI_V2: '1'
  };

  // Start isolated backend
  console.log(`Starting isolated backend on ${PORT_API}...`);
  const backendProc = spawn(
    PYTHON_PATH,
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(PORT_API)],
    { cwd: root, env, stdio: 'ignore', windowsHide: true }
  );
  children.push(backendProc);

  await until(async () => {
    const res = await fetch(`http://127.0.0.1:${PORT_API}/health`);
    return res.ok;
  }, 15000);
  console.log('Isolated backend is healthy.');

  // Prepare scratch frontend build
  const webScratch = path.join(scratch, 'web');
  console.log(`Copying frontend into ${webScratch}...`);
  fs.cpSync(path.join(root, 'frontend'), webScratch, {
    recursive: true,
    filter: (s) => !s.split(path.sep).some((x) => x === 'node_modules' || x.startsWith('.next') || x.startsWith('.env'))
  });
  fs.symlinkSync(path.join(root, 'frontend/node_modules'), path.join(webScratch, 'node_modules'), 'junction');

  console.log('Building scratch frontend with updated GuidedLayout.jsx...');
  execFileSync(
    process.execPath,
    [path.join(root, 'frontend/node_modules/next/dist/bin/next'), 'build'],
    { cwd: webScratch, env, stdio: 'pipe', timeout: 120000 }
  );
  console.log('Scratch frontend build complete.');

  // Start isolated frontend
  console.log(`Starting isolated frontend on ${PORT_WEB}...`);
  const frontendProc = spawn(
    process.execPath,
    [path.join(root, 'frontend/node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(PORT_WEB)],
    { cwd: webScratch, env, stdio: 'ignore', windowsHide: true }
  );
  children.push(frontendProc);

  await until(async () => {
    const res = await fetch(`http://127.0.0.1:${PORT_WEB}`);
    return res.ok;
  }, 20000);
  console.log('Isolated frontend is ready.');

  // Start Chrome CDP
  console.log(`Starting Chrome CDP on ${PORT_CDP}...`);
  const browserProc = spawn(
    BROWSER_PATH,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--disable-background-networking',
      `--remote-debugging-port=${PORT_CDP}`,
      `--user-data-dir=${path.join(scratch, 'chrome')}`,
      'about:blank'
    ],
    { stdio: 'ignore', windowsHide: true }
  );
  children.push(browserProc);

  const cleanup = () => {
    console.log('Cleaning up child processes...');
    for (const p of children) {
      try { p.kill(); } catch {}
    }
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {}
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

    for (const d of ['Page', 'Runtime', 'DOM']) await cdp(`${d}.enable`);

    async function ev(expr) {
      const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      }
      return r.result?.value;
    }

    async function waitIdle() {
      await pause(100);
      await until(async () => !(await ev(`!!document.querySelector('[aria-busy="true"]')`)), 25000);
      await pause(150);
    }

    async function click(selector) {
      await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);
      const box = await ev(`(()=>{
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2 };
      })()`);
      if (!box) throw new Error(`Element not found for click: ${selector}`);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...box });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...box });
      await pause(100);
    }

    async function typeAndEnter(text) {
      await click('[data-testid="guided-input"]');
      await pause(50);
      await cdp('Input.insertText', { text });
      await pause(80);
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
      await waitIdle();
    }

    // ========================================================
    // CASE 1: Desktop 1280x800 first chip focus after Enter submission of S0
    // ========================================================
    console.log('\n--- Case 1: Desktop 1280x800 First Chip Focus ---');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT_WEB}/?guided=1&conv=case1_desktop` });
    await until(async () => ev(`!!document.querySelector('[data-testid="guided-container"]')`));
    await waitIdle();

    await typeAndEnter(S0);
    console.log('Waiting for clarify question card and first chip...');
    await until(async () => ev(`!!document.querySelector('[data-testid="clarify-question-card"]') && !document.querySelector('[aria-busy="true"]')`));

    // Sample activeElement over time
    const samples = [];
    for (let i = 0; i < 6; i++) {
      const s = await ev(`(()=>{
        const a = document.activeElement;
        return { tag: a?.tagName, testid: a?.getAttribute('data-testid') };
      })()`);
      samples.push(s);
      await pause(50);
    }
    console.log('Case 1 focus samples:', samples);

    const case1Active = samples[samples.length - 1];
    recordCase('CASE-01', 'Desktop 1280x800 first chip focused after Enter S0',
      case1Active.testid && case1Active.testid.startsWith('clarify-option-'),
      case1Active
    );

    // ========================================================
    // CASE 2: Mobile 390x844 first chip focus after Enter submission of S0
    // ========================================================
    console.log('\n--- Case 2: Mobile 390x844 First Chip Focus ---');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT_WEB}/?guided=1&conv=case2_mobile` });
    await until(async () => ev(`!!document.querySelector('[data-testid="guided-container"]')`));
    await waitIdle();

    await typeAndEnter(S0);
    await until(async () => ev(`!!document.querySelector('[data-testid="clarify-question-card"]') && !document.querySelector('[aria-busy="true"]')`));
    await pause(200);

    const case2Active = await ev(`(()=>{
      const active = document.activeElement;
      return {
        tag: active?.tagName,
        testid: active?.getAttribute('data-testid'),
        text: active?.textContent?.trim()
      };
    })()`);
    recordCase('CASE-02', 'Mobile 390x844 first chip focused after Enter S0',
      case2Active.testid && case2Active.testid.startsWith('clarify-option-'),
      case2Active
    );

    // ========================================================
    // CASE 3: Next Clarification Progression Focus
    // ========================================================
    console.log('\n--- Case 3: Next Clarification Progression Focus ---');
    // We are on case2; pick option 'Cả nhóm'
    await click('[data-testid="clarify-option-scope:group"]');
    await waitIdle();
    await until(async () => ev(`!document.querySelector('[aria-busy="true"]')`));
    await pause(250);

    const case3Active = await ev(`(()=>{
      const active = document.activeElement;
      const questionText = document.querySelector('[data-testid="clarify-question-text"]')?.textContent?.trim();
      return {
        questionText,
        activeTag: active?.tagName,
        activeTestId: active?.getAttribute('data-testid')
      };
    })()`);
    const isCase3Focused = Boolean(
      case3Active.activeTestId &&
      (case3Active.activeTestId.startsWith('clarify-option-') || case3Active.activeTestId === 'clarify-free-text-input')
    );
    recordCase('CASE-03', 'Advances to next clarification and auto-focuses first option/input',
      isCase3Focused && case3Active.questionText?.includes('mấy giờ'),
      case3Active
    );

    // ========================================================
    // CASE 4: Active New Draft Not Stolen
    // ========================================================
    console.log('\n--- Case 4: Active New Draft Focus Not Stolen ---');
    // Focus guided-input and type draft text
    await ev(`document.querySelector('[data-testid="guided-input"]')?.focus()`);
    await cdp('Input.insertText', { text: 'Tôi muốn đổi địa điểm' });
    await pause(200);

    const case4Focus = await ev(`(()=>{
      const active = document.activeElement;
      return {
        tag: active?.tagName,
        testid: active?.getAttribute('data-testid'),
        value: active?.value
      };
    })()`);
    recordCase('CASE-04', 'Active composer draft is not stolen by clarify block',
      case4Focus.testid === 'guided-input' && case4Focus.value === 'Tôi muốn đổi địa điểm',
      case4Focus
    );

    // ========================================================
    // CASE 5: Session Restore Does Not Steal Focus
    // ========================================================
    console.log('\n--- Case 5: Session Restore Does Not Steal Focus ---');
    // Reload page with same session conv
    await cdp('Page.reload');
    await until(async () => ev(`!!document.querySelector('[data-testid="guided-container"]')`));
    await waitIdle();
    await pause(300);

    const case5Focus = await ev(`(()=>{
      const active = document.activeElement;
      return {
        tag: active?.tagName,
        testid: active?.getAttribute('data-testid')
      };
    })()`);
    // On restore, focus should NOT jump to chips (remains on BODY or default)
    recordCase('CASE-05', 'Restored session preserves focus without stealing',
      case5Focus.tag === 'BODY',
      case5Focus
    );

    // ========================================================
    // CASE 6: Confirmation Transition Focuses confirm-yes-btn
    // ========================================================
    console.log('\n--- Case 6: Confirmation Transition Focuses confirm-yes-btn ---');
    // Send "19h" to advance to confirm stage
    await typeAndEnter('19h');
    await until(async () => ev(`!!document.querySelector('[data-testid="confirm-summary-card"]') && !document.querySelector('[aria-busy="true"]')`));
    await pause(250);

    const case6Focus = await ev(`(()=>{
      const active = document.activeElement;
      return {
        tag: active?.tagName,
        testid: active?.getAttribute('data-testid'),
        confirmYesExists: !!document.querySelector('[data-testid="confirm-yes-btn"]')
      };
    })()`);
    recordCase('CASE-06', 'Confirmation card transition focuses confirm-yes-btn',
      case6Focus.testid === 'confirm-yes-btn',
      case6Focus
    );

    // ========================================================
    // CASE 7: Tour Transition Focuses google-maps-cta
    // ========================================================
    console.log('\n--- Case 7: Tour Transition Focuses google-maps-cta ---');
    await click('[data-testid="confirm-yes-btn"]');
    await waitIdle();
    await until(async () => ev(`!!document.querySelector('[data-testid="guided-timeline"]') && !document.querySelector('[aria-busy="true"]')`));
    await pause(300);

    const case7Focus = await ev(`(()=>{
      const active = document.activeElement;
      const mapsCta = document.querySelector('[data-testid="google-maps-cta"]');
      return {
        tag: active?.tagName,
        testid: active?.getAttribute('data-testid'),
        isMapsCta: active === mapsCta,
        href: mapsCta?.getAttribute('href')
      };
    })()`);
    recordCase('CASE-07', 'Tour transition focuses google-maps-cta',
      case7Focus.testid === 'google-maps-cta' || case7Focus.isMapsCta,
      case7Focus
    );

    // Write evidence artifact
    const evidencePath = path.join(__dirname, 'focus_verification_evidence.json');
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    console.log(`\nTargeted focus evidence saved to ${evidencePath}`);

    const allPassed = evidence.cases.every((c) => c.pass);
    console.log(`=== TARGETED TEST RESULT: ${allPassed ? 'ALL PASSED' : 'FAILURES DETECTED'} ===`);

    if (!allPassed) {
      process.exit(1);
    }
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('Fatal error in targeted test harness:', err);
  process.exit(1);
});
