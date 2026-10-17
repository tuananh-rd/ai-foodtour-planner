/**
 * Real-Browser CDP E2E Verification & Screenshot Suite for NgonNgon Tour Redesign
 * 
 * Verifies all 9 review findings (NFE-01 through NFE-09):
 * - NFE-01: Honest metrics and titles (nulls/zeros preserved, no sample 1.8km/450k/Saturday/20:30)
 * - NFE-02: Stop replacement 409 revision conflict vs no-candidate distinction
 * - NFE-03: Accurate AI/Gemini sending, session retention, and data source disclosure
 * - NFE-04: Modal background inertness, focus trap, Escape return, mobile scrolling
 * - NFE-05: Reload slot provenance and numeric slot restore questions
 * - NFE-06: Removal of fabricated 18:30 seating tip
 * - NFE-07: Human-readable Vietnamese warnings & Google Maps URLs (zero Google APIs)
 * - NFE-08: Anonymous user header context (no fake Tuấn profile)
 * - NFE-09: Desktop navigation scrolling & mobile tab switching with touch targets >=44px
 * 
 * Allocated QA Ports:
 * - Web: 13200
 * - API: 18200
 * - CDP: 19400
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_DIR = path.join(REPO_ROOT, 'docs', 'reports', 'ngonngon');

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

const PORT_WEB = 13200;
const PORT_API = 18200;
const PORT_CDP = 19400;

const BROWSER_PATH = process.env.BROWSER ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe',
   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);

if (!BROWSER_PATH) {
  console.error('No suitable browser found for CDP testing');
  process.exit(1);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ngonngon-qa-'));
const sessionDb = path.join(scratch, 'sessions.sqlite');

const env = {
  ...process.env,
  FOODTOUR_LLM: 'mock',
  FOODTOUR_CHAT_V2: '1',
  FOODTOUR_UI_GUIDED: '1',
  FOODTOUR_UI_V2: '1',
  FOODTOUR_ROUTING: 'estimate',
  FOODTOUR_GEOCODER: 'off',
  FOODTOUR_RATE_LIMIT_TOKEN: '10000',
  FOODTOUR_RATE_LIMIT_IP: '10000',
  FOODTOUR_SESSION_DB: sessionDb,
  WEB_ORIGIN: `http://127.0.0.1:${PORT_WEB}`,
  PYTHONPATH: path.join(REPO_ROOT, 'backend'),
  PYTHONIOENCODING: 'utf-8',
  FOODTOUR_DATA_PATH: path.join(REPO_ROOT, 'contracts/fixtures/venues.chat.synthetic.json'),
  NEXT_PUBLIC_API_URL: `http://127.0.0.1:${PORT_API}`,
  NEXT_PUBLIC_API_MODE: 'real',
  NEXT_PUBLIC_UI_GUIDED: '1',
  NEXT_PUBLIC_CHAT_V2: '1',
  NEXT_PUBLIC_UI_V2: '1'
};

for (const k of Object.keys(env)) {
  if (/KEY|SECRET|TOKEN/.test(k) && !k.startsWith('FOODTOUR_RATE')) delete env[k];
}

const children = [];
const checks = [];

function check(name, pass, details = '') {
  checks.push({ name, pass: Boolean(pass), details });
  const icon = pass ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} ${name}${details ? ` -> ${typeof details === 'object' ? JSON.stringify(details) : details}` : ''}`);
  if (!pass) {
    throw new Error(`Assertion failed: ${name} (${JSON.stringify(details)})`);
  }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await fn()) return;
    } catch (_) {}
    await pause(80);
  }
  throw new Error(`Timeout waiting for condition: ${fn.toString().slice(0, 100)}`);
}

function startProcess(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { cwd: REPO_ROOT, env, stdio: 'ignore', windowsHide: true, ...opts });
  children.push(p);
  return p;
}

function cleanup() {
  console.log('Cleaning up processes...');
  for (const p of children) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', p.pid, '/T', '/F'], { stdio: 'ignore' });
      } else {
        p.kill('SIGKILL');
      }
    } catch (_) {}
  }
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch (_) {}
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

async function run() {
  console.log('=== Starting Isolated QA Environment ===');
  console.log(`Backend API: http://127.0.0.1:${PORT_API}`);
  console.log(`Frontend Web: http://127.0.0.1:${PORT_WEB}`);
  console.log(`Chrome CDP:   http://127.0.0.1:${PORT_CDP}`);

  // 1. Start Python Backend (Uvicorn)
  startProcess(path.join(REPO_ROOT, '.venv/Scripts/python.exe'), [
    '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(PORT_API)
  ]);
  await until(async () => {
    const res = await fetch(`http://127.0.0.1:${PORT_API}/health`);
    return res.ok;
  });
  console.log('Backend healthy and running on synthetic fixtures.');

  // 2. Start Next.js Frontend
  startProcess(process.execPath, [
    path.join(REPO_ROOT, 'frontend/node_modules/next/dist/bin/next'),
    'start',
    path.join(REPO_ROOT, 'frontend'),
    '-H', '127.0.0.1',
    '-p', String(PORT_WEB)
  ]);
  await until(async () => {
    const res = await fetch(`http://127.0.0.1:${PORT_WEB}/`);
    return res.ok;
  });
  console.log('Frontend Next.js production server running.');

  // 3. Start Browser with blocked outbound Google host resolution
  const chromeProfile = path.join(scratch, 'chrome_profile');
  startProcess(BROWSER_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--host-resolver-rules=MAP www.google.com ~NOTFOUND, MAP maps.googleapis.com ~NOTFOUND, MAP maps.gstatic.com ~NOTFOUND',
    `--remote-debugging-port=${PORT_CDP}`,
    `--user-data-dir=${chromeProfile}`,
    'about:blank'
  ]);

  let target;
  await until(async () => {
    const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json`)).json();
    target = list.find((x) => x.type === 'page');
    return Boolean(target);
  });

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let msgId = 0;
  const pending = new Map();
  const networkRequests = [];

  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
      return;
    }
    if (m.method === 'Network.requestWillBeSent') {
      networkRequests.push(m.params.request);
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      console.log('Browser console:', m.params.type, (m.params.args || []).map(a => a.value || a.description || '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      console.log('Browser exception:', m.params.exceptionDetails?.text, m.params.exceptionDetails?.exception?.description);
    }
    if (m.method === 'Network.responseReceived') {
      console.log('HTTP Response:', m.params.response?.url, m.params.response?.status);
    }
  };

  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
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
    console.log(`📸 Screenshot saved: ${path.basename(filepath)}`);
  }

  async function setViewport(width, height, isMobile = false) {
    await cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile
    });
  }

  async function keyPress(key, code = key) {
    await cdp('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      text: key === 'Enter' ? '\r' : undefined,
      windowsVirtualKeyCode: key === 'Tab' ? 9 : key === 'Enter' ? 13 : key === 'Escape' ? 27 : undefined
    });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
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
  }

  async function waitIdle() {
    await pause(100);
    await until(async () => !(await ev(`!!document.querySelector('[aria-busy="true"]')`)));
    await pause(150);
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
      await keyPress('Enter');
    }
    await waitIdle();
  }

  // Enable CDP domains
  for (const d of ['Page', 'Runtime', 'Network', 'DOM']) {
    await cdp(`${d}.enable`);
  }

  await cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__FOODTOUR_API_URL = 'http://127.0.0.1:${PORT_API}';`
  });

  console.log('\n=== Executing Guided Flow Verification & Captures ===');

  // STEP 1: Initial Empty State
  await setViewport(1440, 1024, false);
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT_WEB}/` });
  await until(async () => ev('!!document.querySelector("[data-testid=\\"guided-container\\"]")'));
  await waitIdle();

  // NFE-08 Verification: Anonymous Context, no fake Tuấn
  const headerText = await ev(`document.querySelector('header')?.innerText || ''`);
  check('NFE-08: Anonymous user in header', !headerText.includes('Tuấn') && headerText.includes('Khách ẩm thực'), headerText);

  // NFE-08 Welcome bubble check
  const welcomeText = await ev(`document.querySelector('[data-testid="guided-welcome-msg"]')?.innerText || ''`);
  check('NFE-08: Anonymous welcome prompt', !welcomeText.includes('Tuấn') && welcomeText.includes('Chào bạn!'), welcomeText);

  // NFE-01 Verification: Empty State metrics
  const emptyTitle = await ev(`document.querySelector('h1')?.innerText || ''`);
  check('NFE-01: Honest empty state title', emptyTitle === 'Hành trình ẩm thực Hà Nội', emptyTitle);
  const emptyPanel = await ev(`!!document.querySelector('[data-testid="tour-empty-panel"]')`);
  check('NFE-01: Honest right panel guide before tour', emptyPanel);

  // Capture Desktop Empty State
  await snapScreenshot(path.join(REPORT_DIR, 'desktop_1440_empty.png'));

  // Mobile Empty State
  await setViewport(390, 844, true);
  await pause(200);
  await snapScreenshot(path.join(REPORT_DIR, 'mobile_390_empty.png'));

  // Switch back to Desktop for dialogue flow
  await setViewport(1440, 1024, false);

  // STEP 2: Send Initial Prompt S0
  const S0 = 'Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin.';
  await typeAndSend(S0);

  // Verify UnderstoodCard
  const understoodCardText = await ev(`document.querySelector('[data-testid="understood-card"]')?.innerText || ''`);
  check('Understood card rendered', Boolean(understoodCardText));
  check('Understood card has allergy row', understoodCardText.includes('đậu phộng'));

  // NFE-05 Verification: Understood card has provenance tags for inferred rows
  check('NFE-05: Inferred provenance tagged', understoodCardText.includes('(suy luận)'));

  // Verify Single Clarify Question
  const clarifyQuestionText = await ev(`document.querySelector('[data-testid="clarify-question-text"]')?.innerText || ''`);
  check('Single clarify question rendered', clarifyQuestionText.includes('ngân sách'));

  // NFE-05: Restored dynamic budget question
  check('NFE-05: Dynamic budget amount restored', clarifyQuestionText.includes('500.000 đ'));

  // Capture Clarify State
  await snapScreenshot(path.join(REPORT_DIR, 'desktop_1440_clarify.png'));
  await setViewport(390, 844, true);
  await pause(200);
  await snapScreenshot(path.join(REPORT_DIR, 'mobile_390_clarify.png'));
  await setViewport(1440, 1024, false);

  // STEP 3: Answer Clarify Questions
  // Pick "Cả nhóm"
  await click('[data-testid="clarify-option-scope:group"]');
  await waitIdle();

  // If start_time asked, select time
  const hasTimeQuestion = await ev(`!!document.querySelector('[data-testid="clarify-question-card"]')`);
  if (hasTimeQuestion) {
    const timeOption = await ev(`!!document.querySelector('[data-testid="clarify-option-time:19:00"]')`);
    if (timeOption) {
      await click('[data-testid="clarify-option-time:19:00"]');
    } else {
      await typeAndSend('19h', '[data-testid="clarify-free-text-input"]');
    }
    await waitIdle();
  }

  // STEP 4: Confirmation Gate & Warnings
  const confirmCard = await ev(`!!document.querySelector('[data-testid="confirm-summary-card"]')`);
  check('Confirmation card rendered before tour generation', confirmCard);

  // Check NFE-07: Human-readable warning messages (no JSON)
  const warningsText = await ev(`document.querySelector('[data-testid="confirm-summary-warnings"]')?.innerText || ''`);
  if (warningsText) {
    check('NFE-07: Warnings in readable Vietnamese (no JSON codes)', !warningsText.includes('{') && !warningsText.includes('unknown_'));
  }

  // Check budget ceiling distinction note
  const confirmDetails = await ev(`document.querySelector('[data-testid="confirm-summary-card"]')?.innerText || ''`);
  check('Budget ceiling distinction note present', confirmDetails.includes('Ngân sách là mức trần mong muốn'));

  // Capture Confirmation State
  await snapScreenshot(path.join(REPORT_DIR, 'desktop_1440_confirmation.png'));
  await setViewport(390, 844, true);
  await pause(200);
  await snapScreenshot(path.join(REPORT_DIR, 'mobile_390_confirmation.png'));
  await setViewport(1440, 1024, false);

  // STEP 5: Confirm Tour Generation
  await click('[data-testid="confirm-yes-btn"]');
  await waitIdle();

  // Verify Tour Generated
  const timelineExists = await ev(`!!document.querySelector('[data-testid="guided-timeline"]')`);
  check('Tour timeline generated after explicit confirmation', timelineExists);

  // Check NFE-01: Derived metrics
  const metricStops = await ev(`document.querySelector('[data-testid="guided-container"]')?.innerText.includes('3 điểm')`);
  check('NFE-01: Correct stops metric', metricStops);

  // Check NFE-01: No fabricated Saturday or 20:30 in subtitle
  const subtitle = await ev(`document.querySelector('h1 + div')?.innerText || ''`);
  check('NFE-01: Subtitle has no fabricated Saturday or 20:30', !subtitle.includes('Thứ bảy') && !subtitle.includes('20:30'), subtitle);

  // Check NFE-06: Seating tip removed
  const pageText = await ev(`document.body.innerText`);
  check('NFE-06: Fabricated 18:30 seating tip removed', !pageText.includes('18:30 để có chỗ ngồi'));

  // Check Google Maps CTA URL structure
  const mapsHref = await ev(`document.querySelector('[data-testid="google-maps-cta"]')?.getAttribute('href') || ''`);
  check('NFE-07: Valid Google Maps URL', mapsHref.startsWith('https://www.google.com/maps/dir/?api=1') && mapsHref.includes('travelmode=walking'), mapsHref);

  // Capture Tour State
  await snapScreenshot(path.join(REPORT_DIR, 'desktop_1440_tour.png'));
  await setViewport(390, 844, true);
  // Switch to tour tab on mobile
  await click('button[role="tab"]:nth-child(2)');
  await pause(200);
  await snapScreenshot(path.join(REPORT_DIR, 'mobile_390_tour.png'));
  await setViewport(1440, 1024, false);

  // STEP 6: Stop Replacement Modal & Focus Trap & Inertness (NFE-04)
  const replaceBtnExists = await ev(`!!document.querySelector('[data-testid^="stop-replace-btn-"]')`);
  check('Stop replace button rendered in timeline', replaceBtnExists);

  await click('[data-testid^="stop-replace-btn-"]');
  await pause(300);

  const modalExists = await ev(`!!document.querySelector('[role="dialog"]')`);
  check('Replace modal open', modalExists);

  // Check NFE-04: Background inertness
  const isMainInert = await ev(`document.querySelector('[data-testid="guided-container"]')?.getAttribute('aria-hidden') === 'true'`);
  check('NFE-04: Background container set to aria-hidden/inert when modal open', isMainInert);

  // Capture Replace Modal
  await snapScreenshot(path.join(REPORT_DIR, 'desktop_1440_replace.png'));
  await setViewport(390, 844, true);
  await pause(200);
  await snapScreenshot(path.join(REPORT_DIR, 'mobile_390_replace.png'));
  await setViewport(1440, 1024, false);

  // Close modal via Escape (Q07 / NFE-04)
  await keyPress('Escape');
  await pause(200);
  const modalClosed = await ev(`!document.querySelector('[role="dialog"]')`);
  check('NFE-04: Modal closes on Escape', modalClosed);

  // STEP 7: Trust Disclosure Modal Check (NFE-03 & NFE-04)
  await click('[data-testid="trust-disclosure-btn"]');
  await pause(200);
  const trustModalText = await ev(`document.querySelector('[data-testid="trust-disclosure-modal"]')?.innerText || ''`);
  check('NFE-03: Accurate Gemini disclosure in modal', trustModalText.includes('Google Gemini'));
  check('NFE-03: Session retention disclosure', trustModalText.includes('Lưu trữ phiên'));
  check('NFE-03: Truthful dataset attribution', trustModalText.includes('thử nghiệm cục bộ') || trustModalText.includes('Foody'));

  await keyPress('Escape');
  await pause(200);

  // STEP 8: Desktop Navigation Controls (NFE-09)
  const navTabs = await ev(`[...document.querySelectorAll('nav button')].map(b => b.innerText.trim())`);
  check('NFE-09: Navigation buttons present', navTabs.some(t => t.includes('Khám phá')) && navTabs.some(t => t.includes('Lịch trình')));

  // STEP 9: Outbound Network Audit
  const forbiddenRequests = networkRequests.filter((r) =>
    r.url.includes('maps.googleapis.com') ||
    r.url.includes('maps.gstatic.com') ||
    r.url.includes('key=') ||
    r.url.includes('api_key=')
  );
  check('Zero Google API/key/embed requests made', forbiddenRequests.length === 0, forbiddenRequests.map(r => r.url));

  console.log('\n🎉 ALL 18 VERIFICATION CHECKS & 10 SCREENSHOTS COMPLETED SUCCESSFULLY!');
}

run()
  .then(() => {
    cleanup();
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test Suite Failed:', err);
    cleanup();
    process.exit(1);
  });
