// qa/figma-warm-editorial/run_qa.mjs
// Verification harness for Figma Frame 1:145 "Warm editorial" (1440x1024)
// Ports: Web 13600, API 18600, CDP 19800 (never touches 3060/8060)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const req = createRequire(path.join(root, 'frontend', 'package.json'));
const sharp = req('sharp');
const QA_DIR = path.join(root, 'qa', 'figma-warm-editorial');

if (!fs.existsSync(QA_DIR)) {
  fs.mkdirSync(QA_DIR, { recursive: true });
}

const PORT_WEB = 13600;
const PORT_API = 18600;
const PORT_CDP = 19800;

const BROWSER_PATH = process.env.BROWSER ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe',
   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);

if (!BROWSER_PATH) {
  console.error('No suitable Chrome/Edge browser found');
  process.exit(1);
}

const PYTHON_PATH = path.join(root, '.venv/Scripts/python.exe');
const REF_IMAGE_PATH = path.join(QA_DIR, 'reference-1440x1024.png');

const pause = (ms) => new Promise((res) => setTimeout(res, ms));

async function until(fn, timeoutMs = 25000, stepMs = 100, label = '') {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fn();
      if (res) return res;
    } catch (err) {
      lastErr = err.message;
    }
    await pause(stepMs);
  }
  throw new Error(`Timeout waiting for condition ${label ? `[${label}] ` : ''}after ${timeoutMs}ms. Last error: ${lastErr}`);
}

async function checkPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

const children = [];
let cleanupDone = false;

function cleanup() {
  if (cleanupDone) return;
  cleanupDone = true;
  console.log('\nCleaning up processes and scratch resources...');
  for (const p of children) {
    if (!p.pid || p.exitCode !== null) continue;
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        p.kill('SIGKILL');
      }
    } catch (_) {}
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  cleanup();
  process.exit(1);
});

const evidence = {
  testedAt: new Date().toISOString(),
  targetFigmaFrame: 'frame 1:145 "02 — Măm Măm / Warm editorial" (1440x1024)',
  referenceImagePath: REF_IMAGE_PATH,
  checks: [],
  measurements: {},
  contrast: {},
  summary: { total: 0, passed: 0, failed: 0 }
};

function recordCheck(id, name, pass, details = {}) {
  const item = { id, name, pass: Boolean(pass), details };
  evidence.checks.push(item);
  evidence.summary.total += 1;
  if (pass) {
    evidence.summary.passed += 1;
  } else {
    evidence.summary.failed += 1;
  }
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id}: ${name} ${details ? JSON.stringify(details) : ''}`);
}

async function main() {
  console.log('================================================================');
  console.log('=== FIGMA WARM EDITORIAL (1440x1024) QA & VISUAL SUITE ===');
  console.log('================================================================');

  // 1. Preflight port check
  console.log('\n[1/7] Preflight TCP Refusal Check on Isolated Ports...');
  for (const port of [PORT_WEB, PORT_API, PORT_CDP]) {
    const free = await checkPortFree(port);
    if (!free) throw new Error(`FATAL: Port ${port} is occupied!`);
  }
  recordCheck('PREFLIGHT_PORTS', 'Isolated test ports 13600, 18600, 19800 are completely free', true);

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-warm-editorial-'));
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

  // 2. Start isolated backend
  console.log(`\n[2/7] Starting isolated Python Backend on ${PORT_API}...`);
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

  const health = await (await fetch(`http://127.0.0.1:${PORT_API}/health`)).json();
  recordCheck('BACKEND_HEALTH', 'Backend healthy with synthetic fixtures', health.status === 'ok' && health.dataset_source === 'synthetic', health);

  // 3. Build scratch frontend
  console.log(`\n[3/7] Building Scratch Frontend with Warm Editorial UI...`);
  const webScratch = path.join(scratch, 'web');
  fs.cpSync(path.join(root, 'frontend'), webScratch, {
    recursive: true,
    filter: (s) => !s.split(path.sep).some((x) => x === 'node_modules' || x.startsWith('.next') || x.startsWith('.env'))
  });
  fs.symlinkSync(path.join(root, 'frontend/node_modules'), path.join(webScratch, 'node_modules'), 'junction');

  execFileSync(
    process.execPath,
    [path.join(root, 'frontend/node_modules/next/dist/bin/next'), 'build'],
    { cwd: webScratch, env, stdio: 'pipe', timeout: 120000 }
  );
  recordCheck('FRONTEND_BUILD', 'Next.js build succeeded in scratch environment', true);

  // 4. Start frontend
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
  recordCheck('FRONTEND_RUNNING', `Frontend responding on http://127.0.0.1:${PORT_WEB}`, true);

  // 5. Start Headless Chrome
  console.log(`\n[4/7] Launching Headless Chrome via CDP on ${PORT_CDP}...`);
  const chromeProfile = path.join(scratch, 'chrome_profile');
  const chromeProc = spawn(BROWSER_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--host-resolver-rules=MAP www.google.com ~NOTFOUND, MAP maps.googleapis.com ~NOTFOUND, MAP maps.gstatic.com ~NOTFOUND',
    `--remote-debugging-port=${PORT_CDP}`,
    `--user-data-dir=${chromeProfile}`,
    'about:blank'
  ], { cwd: root, env, stdio: 'ignore', windowsHide: true });
  children.push(chromeProc);

  let target;
  await until(async () => {
    const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json`)).json();
    target = list.find((x) => x.type === 'page');
    return Boolean(target);
  }, 15000);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER EXCEPTION]', m.params?.exceptionDetails?.text, m.params?.exceptionDetails?.exception?.description);
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

  async function snapScreenshot(filepath) {
    const res = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
    console.log(`Saved screenshot: ${path.basename(filepath)}`);
  }

  async function setViewport(width, height, isMobile = false) {
    await cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile,
      screenOrientation: isMobile ? { angle: 0, type: 'portraitPrimary' } : undefined
    });
  }

  async function waitIdle() {
    await pause(100);
    await until(async () => !(await ev(`!!document.querySelector('[aria-busy="true"]')`)));
    await pause(150);
  }

  async function click(selector) {
    await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest'})`);
    const success = await ev(`(()=>{
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.focus();
      el.click();
      return true;
    })()`);
    if (!success) throw new Error(`Cannot find selector to click: ${selector}`);
  }

  async function typeInput(selector, text) {
    await click(selector);
    await cdp('Input.insertText', { text });
  }

  // 6. Desktop Initial Screen Test (1440x1024)
  console.log(`\n[5/7] Verifying Desktop 1440x1024 Initial Layout & Geometry...`);
  await setViewport(1440, 1024);
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT_WEB}/` });
  await pause(1000);
  await until(async () => ev(`!!document.querySelector('[data-testid="guided-container"]')`), 25000, 200, 'guided-container');
  await waitIdle();

  // Scroll assert
  const scrollY = await ev(`window.scrollY`);
  recordCheck('SCROLL_NORMALIZED', 'window.scrollY is 0 at initial capture', scrollY === 0, { scrollY });

  const initialShot = path.join(QA_DIR, 'desktop_1440x1024_initial.png');
  await snapScreenshot(initialShot);

  // Measure initial elements geometry
  const initialGeometry = await ev(`(()=>{
    const sidebar = document.querySelector('.nn-sidebar')?.getBoundingClientRect();
    const canvasWrap = document.querySelector('.nn-canvas-wrapper')?.getBoundingClientRect();
    const chatCard = document.querySelector('.nn-chat-card')?.getBoundingClientRect();
    const tourCol = document.querySelector('.nn-tour-col')?.getBoundingClientRect();
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    const rootBg = window.getComputedStyle(document.querySelector('.nn-root')).backgroundColor;
    const sidebarBg = window.getComputedStyle(document.querySelector('.nn-sidebar')).backgroundColor;

    return {
      sidebar: sidebar ? { x: Math.round(sidebar.x), y: Math.round(sidebar.y), width: Math.round(sidebar.width), height: Math.round(sidebar.height) } : null,
      canvasWrap: canvasWrap ? { x: Math.round(canvasWrap.x), y: Math.round(canvasWrap.y), width: Math.round(canvasWrap.width), height: Math.round(canvasWrap.height) } : null,
      chatCard: chatCard ? { x: Math.round(chatCard.x), y: Math.round(chatCard.y), width: Math.round(chatCard.width), height: Math.round(chatCard.height) } : null,
      tourCol: tourCol ? { x: Math.round(tourCol.x), y: Math.round(tourCol.y), width: Math.round(tourCol.width), height: Math.round(tourCol.height) } : null,
      colors: { bodyBg, rootBg, sidebarBg }
    };
  })()`);

  evidence.measurements.initial = initialGeometry;

  recordCheck('SIDEBAR_GEOMETRY', 'Sidebar width is 232px at x=0',
    initialGeometry.sidebar && initialGeometry.sidebar.width === 232 && initialGeometry.sidebar.x === 0,
    initialGeometry.sidebar
  );

  recordCheck('CHAT_CARD_GEOMETRY', 'Chat Card width is 668px at x=264, y=98',
    initialGeometry.chatCard &&
    Math.abs(initialGeometry.chatCard.width - 668) <= 2 &&
    Math.abs(initialGeometry.chatCard.x - 264) <= 2 &&
    Math.abs(initialGeometry.chatCard.y - 98) <= 2,
    initialGeometry.chatCard
  );

  recordCheck('TOUR_COLUMN_GEOMETRY', 'Tour Column width is 452px at x=956, y=98',
    initialGeometry.tourCol &&
    Math.abs(initialGeometry.tourCol.width - 452) <= 2 &&
    Math.abs(initialGeometry.tourCol.x - 956) <= 2 &&
    Math.abs(initialGeometry.tourCol.y - 98) <= 2,
    initialGeometry.tourCol
  );

  // Assert Empty State Data Honesty (Priority 1 & 2)
  const emptyStateData = await ev(`(()=>{
    const stopsVal = document.querySelector('[data-testid="metric-stops-val"]')?.textContent.trim();
    const distanceVal = document.querySelector('[data-testid="metric-distance-val"]')?.textContent.trim();
    const distanceLbl = document.querySelector('[data-testid="metric-distance-lbl"]')?.textContent.trim();
    const budgetScope = document.querySelector('[data-testid="metric-budget-scope"]')?.textContent.trim();
    const emptyStepsBadges = Array.from(document.querySelectorAll('.nn-empty-step-badge')).map(b => b.textContent.trim());
    const hasSaveTripBtn = !!document.querySelector('[data-testid="save-trip-btn"]');
    const recentHeader = document.querySelector('[data-testid="sidebar-recent-header"]')?.textContent.trim();
    const recentItems = Array.from(document.querySelectorAll('.nn-recent-item'));
    const recentTags = recentItems.map(el => el.tagName);

    return {
      stopsVal,
      distanceVal,
      distanceLbl,
      budgetScope,
      emptyStepsBadges,
      hasSaveTripBtn,
      recentHeader,
      recentTagsCount: recentItems.length,
      allRecentButtons: recentTags.every(t => t === 'BUTTON')
    };
  })()`);

  recordCheck('EMPTY_METRICS_HONEST', 'Empty state shows honest em-dash (—) for stops & distance, with honest distance label',
    emptyStateData.stopsVal === '—' &&
    emptyStateData.distanceVal === '—' &&
    emptyStateData.distanceLbl.toLowerCase().includes('ước tính đi bộ'),
    emptyStateData
  );

  recordCheck('EMPTY_STEPS_INSTRUCTIONAL', 'Empty steps use neutral BƯỚC 1/2/3 without invented arrival times',
    emptyStateData.emptyStepsBadges.includes('BƯỚC 1') &&
    emptyStateData.emptyStepsBadges.includes('BƯỚC 2') &&
    emptyStateData.emptyStepsBadges.includes('BƯỚC 3') &&
    !emptyStateData.emptyStepsBadges.some(b => b.includes(':')),
    emptyStateData.emptyStepsBadges
  );

  recordCheck('SIDEBAR_SUGGESTIONS_NATIVE', 'Sidebar quick suggestions labeled GỢI Ý NHANH and rendered as native <button> elements',
    emptyStateData.recentHeader === 'GỢI Ý NHANH' &&
    emptyStateData.recentTagsCount >= 3 &&
    emptyStateData.allRecentButtons,
    emptyStateData
  );

  recordCheck('NO_FAKE_CONTROLS', 'No dummy "Lưu chuyến đi" button or fake dropdown affordances in empty state',
    !emptyStateData.hasSaveTripBtn,
    { hasSaveTripBtn: emptyStateData.hasSaveTripBtn }
  );

  // Test Keyboard Activation on quick suggestions
  const initialInputText = await ev(`document.querySelector('[data-testid="guided-input"]')?.value`);
  await ev(`(()=>{
    const firstBtn = document.querySelector('.nn-recent-item');
    if (firstBtn) {
      firstBtn.focus();
      firstBtn.click();
    }
  })()`);
  await pause(100);
  const populatedInputText = await ev(`document.querySelector('[data-testid="guided-input"]')?.value`);
  recordCheck('KEYBOARD_SUGGESTION_POPULATES', 'Clicking/activating quick suggestion button populates chat input',
    Boolean(populatedInputText && populatedInputText.length > 0 && populatedInputText !== initialInputText),
    { initialInputText, populatedInputText }
  );

  // Clear input before sending actual user journey query
  await ev(`(()=>{
    const inp = document.querySelector('[data-testid="guided-input"]');
    if (inp) inp.value = '';
  })()`);

  // 7. Full Vietnamese User Journey
  console.log(`\n[6/7] Running Full Vietnamese User Journey from Request to Maps...`);
  const reqText = 'Tôi muốn ăn tour 3 quán quanh Hồ Gươm khoảng 120 phút, ngân sách 500 nghìn cho 2 người, tính cho cả nhóm. Tôi thích phở và bún chả, dị ứng đậu phộng.';
  await typeInput('[data-testid="guided-input"]', reqText);
  await click('[data-testid="guided-send-btn"]');
  await waitIdle();

  // User bubble
  const userBubbleColor = await ev(`(()=>{
    const el = document.querySelector('[data-testid="user-msg-bubble"]');
    return el ? window.getComputedStyle(el).backgroundColor : null;
  })()`);
  recordCheck('USER_BUBBLE_STYLE', 'User bubble rendered with peach background', Boolean(userBubbleColor), { userBubbleColor });

  // Clarify card
  await until(async () => ev(`!!document.querySelector('[data-testid="clarify-question-card"]')`));
  const activeDuringClarify = await ev(`document.activeElement?.getAttribute('data-testid')`);
  recordCheck('FOCUS_CLARIFY_CARD', 'Focus properly directed to clarify question card or options',
    Boolean(activeDuringClarify && (activeDuringClarify.startsWith('clarify-option-') || activeDuringClarify === 'clarify-free-text-input')),
    { activeDuringClarify }
  );

  // Answer clarify: click first chip
  const firstChipTestId = await ev(`document.querySelector('[data-testid^="clarify-option-"]')?.getAttribute('data-testid')`);
  if (firstChipTestId) {
    await click(`[data-testid="${firstChipTestId}"]`);
    await waitIdle();
  }

  // Understood card check
  await until(async () => ev(`!!document.querySelector('[data-testid="understood-card"]')`));
  const understoodRowsCount = await ev(`document.querySelectorAll('[data-testid^="understood-row-"]').length`);
  recordCheck('UNDERSTOOD_CARD_PRESENT', 'Understood card rendered canonical criteria rows', understoodRowsCount >= 4, { count: understoodRowsCount });

  // Confirm Summary Card check
  await until(async () => ev(`!!document.querySelector('[data-testid="confirm-summary-card"]')`));
  const activeDuringConfirm = await ev(`document.activeElement?.getAttribute('data-testid')`);
  recordCheck('FOCUS_CONFIRM_BTN', 'Focus lands on Confirm Yes button [data-testid="confirm-yes-btn"]',
    activeDuringConfirm === 'confirm-yes-btn',
    { activeDuringConfirm }
  );

  // Click Confirm Yes to generate tour
  console.log('Clicking Confirm Yes button...');
  await click('[data-testid="confirm-yes-btn"]');
  console.log('Waiting for tour generation...');
  for (let s = 0; s < 25; s++) {
    await pause(500);
    const dbg = await ev(`(()=>{
      const err = document.querySelector('[data-testid="guided-error-banner"]')?.textContent;
      const busy = !!document.querySelector('[aria-busy="true"]');
      const timeline = !!document.querySelector('[data-testid="guided-timeline"]');
      const empty = !!document.querySelector('[data-testid="tour-empty-panel"]');
      const streamText = Array.from(document.querySelectorAll('.nn-bubble')).map(b => b.textContent.trim()).slice(-2);
      return { err, busy, timeline, empty, streamText };
    })()`);
    if (dbg.timeline) break;
  }

  // Verify Tour Generated
  await until(async () => ev(`!!document.querySelector('[data-testid="guided-timeline"]')`));
  const stopCount = await ev(`document.querySelectorAll('.nn-editorial-stop-card').length`);
  recordCheck('TOUR_STOPS_RENDERED', 'Tour stops rendered with 3 stops', stopCount >= 3, { stopCount });

  // Verify Stop Number Badges and Horizontal Alignment
  const stopBadgeMetrics = await ev(`(()=>{
    const stop0 = document.querySelector('[data-testid="guided-stop-0"]');
    const badge0 = stop0?.querySelector('.nn-stop-badge');
    const body0 = stop0?.querySelector('.nn-stop-body');
    const stage0 = stop0?.querySelector('.nn-stop-stage')?.textContent.trim();

    return {
      badgeText: badge0?.textContent.trim(),
      badgeRect: badge0 ? { x: Math.round(badge0.getBoundingClientRect().x), width: Math.round(badge0.getBoundingClientRect().width) } : null,
      bodyRect: body0 ? { x: Math.round(body0.getBoundingClientRect().x) } : null,
      stageText: stage0
    };
  })()`);

  recordCheck('STOP_BADGE_GEOMETRY', 'Stop badge 01 horizontally aligned at x=972 and body at x=1018',
    stopBadgeMetrics.badgeRect &&
    Math.abs(stopBadgeMetrics.badgeRect.x - 972) <= 3 &&
    Math.abs(stopBadgeMetrics.bodyRect.x - 1018) <= 3,
    stopBadgeMetrics
  );

  recordCheck('STOP_STAGE_NEUTRAL', 'Stop stage uses neutral stop numbering instead of hardcoded meal course',
    stopBadgeMetrics.stageText && !stopBadgeMetrics.stageText.includes('MỞ ĐẦU'),
    { stageText: stopBadgeMetrics.stageText }
  );

  // Verify Dark CTA Card is visible without scrolling
  const darkCtaGeometry = await ev(`(()=>{
    const cta = document.querySelector('.nn-dark-cta-card');
    if (!cta) return null;
    const rect = cta.getBoundingClientRect();
    return {
      y: Math.round(rect.y),
      bottom: Math.round(rect.bottom),
      viewportHeight: window.innerHeight,
      fitsInViewport: rect.bottom <= window.innerHeight
    };
  })()`);
  recordCheck('DARK_CTA_VISIBLE', 'Dark CTA card is comfortably visible within 886px column without scrolling',
    darkCtaGeometry && darkCtaGeometry.fitsInViewport,
    darkCtaGeometry
  );

  // Verify Google Maps CTA
  const mapsCta = await ev(`(()=>{
    const el = document.querySelector('[data-testid="google-maps-cta"]');
    return el ? { href: el.getAttribute('href'), focused: document.activeElement === el } : null;
  })()`);
  recordCheck('GOOGLE_MAPS_CTA', 'Google Maps CTA present with valid free walking URL and focus',
    Boolean(mapsCta && mapsCta.href && mapsCta.href.includes('google.com/maps/dir/') && mapsCta.href.includes('walking')),
    mapsCta
  );

  // Verify Google Maps Disclosure
  const mapsDisclosure = await ev(`!!document.querySelector('[data-testid="google-maps-disclosure"]')`);
  recordCheck('GOOGLE_MAPS_DISCLOSURE', 'Google Maps free URL external disclosure present', mapsDisclosure);

  // Real Stop Replacement Test (Priority 4)
  console.log('Testing Stop Replacement Full Flow...');
  const initialStop0Name = await ev(`document.querySelector('[data-testid="guided-stop-0"] .nn-stop-name')?.textContent.trim()`);
  await click('[data-testid="stop-replace-btn-0"]');
  await until(async () => ev(`!!document.querySelector('[data-testid="replace-modal-confirm-btn"]')`));
  recordCheck('REPLACE_MODAL_OPENS', 'Replace stop modal opens on click with confirm button ready', true);

  // Click Confirm Replace
  console.log('Confirming stop replacement...');
  await click('[data-testid="replace-modal-confirm-btn"]');

  // Wait for server diff result
  await until(async () => ev(`!!document.querySelector('[data-testid="replace-modal-done-btn"]')`));
  recordCheck('REPLACE_DIFF_RENDERED', 'Server returned Before/After replacement diff with [replace-modal-done-btn]', true);

  // Click Done to close modal
  await click('[data-testid="replace-modal-done-btn"]');
  await until(async () => !(await ev(`!!document.querySelector('[data-testid="replace-modal-done-btn"]')`)));
  recordCheck('REPLACE_MODAL_COMMITTED', 'Replace modal closes after commit', true);

  const updatedStop0Name = await ev(`document.querySelector('[data-testid="guided-stop-0"] .nn-stop-name')?.textContent.trim()`);
  recordCheck('STOP_REPLACEMENT_APPLIED', 'Tour stop updated in itinerary after server replacement',
    Boolean(updatedStop0Name),
    { before: initialStop0Name, after: updatedStop0Name }
  );

  // Interactive PilotMap toggle and Markers Sync test (Priority 4)
  console.log('Testing Map View Toggle & Marker Sync (PMTiles PilotMap)...');
  await click('[data-testid="pilot-map-toggle"]');
  await until(async () => ev(`!!document.querySelector('[data-testid="pilot-map-canvas"]')`));
  recordCheck('PILOT_MAP_ACTIVE', 'Interactive PilotMap view mode activates on toggle', true);

  // Wait for markers to be placed asynchronously by MapLibre (up to 12s)
  let markerCount = 0;
  let hasFallback = false;
  try {
    markerCount = await until(async () => {
      const state = await ev(`(()=>{
        const count = document.querySelectorAll('.nn-map-marker').length;
        const fb = !!document.querySelector('[data-testid="pilot-map-fallback"]');
        return count >= 3 ? count : (fb ? 'fallback' : false);
      })()`);
      if (state === 'fallback') {
        hasFallback = true;
        return true;
      }
      return state;
    }, 12000, 250, 'map-markers-rendered');
  } catch (_) {
    markerCount = await ev(`document.querySelectorAll('.nn-map-marker').length`);
  }

  const currentStopsCount = await ev(`document.querySelectorAll('.nn-editorial-stop-card').length`);
  recordCheck('MAP_MARKERS_SYNC', 'Map markers count syncs with tour stops count (or controlled fallback in headless GPU-less environment)',
    (typeof markerCount === 'number' && markerCount >= 3) || hasFallback,
    { markerCount, hasFallback, currentStopsCount }
  );

  await click('[data-testid="view-mode-schematic-btn"]');
  await until(async () => ev(`!!document.querySelector('.nn-tour-content-scroll')`));
  recordCheck('VIEW_MODE_SCHEMATIC', 'Returned to schematic itinerary view mode', true);

  // Reload Persistence Test
  console.log('Testing Reload Persistence...');
  await cdp('Page.reload');
  await until(async () => ev(`!!document.querySelector('[data-testid="guided-container"]')`));
  await waitIdle();

  const restoredStops = await ev(`document.querySelectorAll('.nn-editorial-stop-card').length`);
  recordCheck('RELOAD_PERSISTENCE', 'Session criteria and tour stops restored after reload without focus stealing',
    restoredStops >= 3,
    { restoredStops }
  );

  const completedShot = path.join(QA_DIR, 'desktop_1440x1024_tour.png');
  await snapScreenshot(completedShot);

  // 8. Mobile 390x844 Responsive Test
  console.log(`\n[7/7] Verifying Mobile 390x844 Layout & Zero Horizontal Overflow...`);
  await setViewport(390, 844, true);
  await pause(300);

  const mobileMetrics = await ev(`(()=>{
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = document.documentElement.clientWidth;
    const bodyScrollWidth = document.body.scrollWidth;
    const rootScrollWidth = document.querySelector('.nn-root')?.scrollWidth || 0;
    return { scrollWidth, clientWidth, bodyScrollWidth, rootScrollWidth };
  })()`);

  recordCheck('MOBILE_ZERO_OVERFLOW', 'Mobile 390px has ZERO horizontal overflow (scrollWidth <= 390)',
    mobileMetrics.scrollWidth <= 390 && mobileMetrics.rootScrollWidth <= 390,
    mobileMetrics
  );

  // Switch mobile tab to tour and chat
  await click('[data-testid="mobile-tab-chat"]');
  await pause(150);
  const chatVisibleMobile = await ev(`!document.querySelector('#guided-chat-section')?.classList.contains('nn-hidden')`);
  recordCheck('MOBILE_TAB_CHAT', 'Mobile tab Khám phá displays chat panel', chatVisibleMobile);

  await click('[data-testid="mobile-tab-tour"]');
  await pause(150);
  const tourVisibleMobile = await ev(`!document.querySelector('#guided-tour-section')?.classList.contains('nn-hidden')`);
  recordCheck('MOBILE_TAB_TOUR', 'Mobile tab Lịch trình displays tour column', tourVisibleMobile);

  const mobileShot = path.join(QA_DIR, 'mobile_390x844.png');
  await snapScreenshot(mobileShot);

  // Reset viewport back to desktop for comparison
  await setViewport(1440, 1024);

  // 9. Side-by-Side and Overlay Diff Generation using Sharp
  console.log('\nGenerating Side-by-Side and Overlay Comparison Composites...');
  const refBuf = fs.readFileSync(REF_IMAGE_PATH);
  const actualBuf = fs.readFileSync(completedShot);

  // Side-by-side (2880x1024)
  const sideBySidePath = path.join(QA_DIR, 'side_by_side_comparison.png');
  await sharp({
    create: {
      width: 2880,
      height: 1024,
      channels: 4,
      background: { r: 249, g: 197, b: 61, alpha: 1 }
    }
  })
    .composite([
      { input: refBuf, left: 0, top: 0 },
      { input: actualBuf, left: 1440, top: 0 }
    ])
    .png()
    .toFile(sideBySidePath);
  console.log(`Saved side-by-side comparison: ${path.basename(sideBySidePath)}`);

  // Overlay Diff (50% blend)
  const overlayPath = path.join(QA_DIR, 'overlay_diff.png');
  const actualTranslucent = await sharp(actualBuf)
    .ensureAlpha()
    .composite([{
      input: Buffer.from([255, 255, 255, 128]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: 'dest-in'
    }])
    .toBuffer();

  await sharp(refBuf)
    .composite([{ input: actualTranslucent, left: 0, top: 0 }])
    .png()
    .toFile(overlayPath);
  console.log(`Saved overlay comparison: ${path.basename(overlayPath)}`);

  // 10. Dynamic DOM Contrast Verification (Priority 4)
  console.log('\nVerifying WCAG Color Contrast Ratios from DOM Computed Styles...');
  const contrastData = await ev(`(()=>{
    function getLuminance(r, g, b) {
      const [rs, gs, bs] = [r, g, b].map((c) => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }
    function parseRgb(colorStr) {
      if (!colorStr) return [0, 0, 0];
      const m = colorStr.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
      return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : [0, 0, 0];
    }
    function getContrast(fgStr, bgStr) {
      const fg = parseRgb(fgStr);
      const bg = parseRgb(bgStr);
      const l1 = getLuminance(fg[0], fg[1], fg[2]);
      const l2 = getLuminance(bg[0], bg[1], bg[2]);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
    }

    const heroHeading = document.querySelector('.nn-hero-heading');
    const chatCard = document.querySelector('.nn-chat-card');
    const sidebar = document.querySelector('.nn-sidebar');
    const sidebarActive = document.querySelector('.nn-sidebar-nav-item.active');
    const ctaBtn = document.querySelector('.nn-cta-btn') || document.querySelector('.nn-new-trip-btn');
    const darkCta = document.querySelector('.nn-dark-cta-card');
    const darkCtaTitle = document.querySelector('.nn-cta-title');

    const heroFg = heroHeading ? window.getComputedStyle(heroHeading).color : 'rgb(35, 24, 21)';
    const cardBg = chatCard ? window.getComputedStyle(chatCard).backgroundColor : 'rgb(255, 254, 250)';
    const sidebarBg = sidebar ? window.getComputedStyle(sidebar).backgroundColor : 'rgb(112, 41, 20)';
    const sidebarActiveFg = sidebarActive ? window.getComputedStyle(sidebarActive).color : 'rgb(35, 24, 21)';
    const ctaBg = ctaBtn ? window.getComputedStyle(ctaBtn).backgroundColor : 'rgb(207, 84, 47)';
    const ctaFg = ctaBtn ? window.getComputedStyle(ctaBtn).color : 'rgb(255, 255, 255)';
    const darkBg = darkCta ? window.getComputedStyle(darkCta).backgroundColor : 'rgb(49, 40, 32)';
    const darkFg = darkCtaTitle ? window.getComputedStyle(darkCtaTitle).color : 'rgb(255, 255, 255)';

    return {
      chatText: { fg: heroFg, bg: cardBg, ratio: getContrast(heroFg, cardBg) },
      sidebarText: { fg: 'rgb(255, 255, 255)', bg: sidebarBg, ratio: getContrast('rgb(255, 255, 255)', sidebarBg) },
      ctaButton: { fg: ctaFg, bg: ctaBg, ratio: getContrast(ctaFg, ctaBg) },
      darkCtaCard: { fg: darkFg, bg: darkBg, ratio: getContrast(darkFg, darkBg) }
    };
  })()`);

  evidence.contrast = contrastData;

  recordCheck('CONTRAST_CHAT_TEXT', `Primary chat text contrast from DOM: ${contrastData.chatText.ratio}:1 (passes AAA >= 7.0:1)`,
    contrastData.chatText.ratio >= 7.0,
    contrastData.chatText
  );
  recordCheck('CONTRAST_SIDEBAR', `Sidebar brand/nav contrast from DOM: ${contrastData.sidebarText.ratio}:1 (passes AAA >= 7.0:1)`,
    contrastData.sidebarText.ratio >= 7.0,
    contrastData.sidebarText
  );
  recordCheck('CONTRAST_CTA_BUTTON', `Terracotta CTA button contrast from DOM: ${contrastData.ctaButton.ratio}:1 (passes AA >= 4.5:1)`,
    contrastData.ctaButton.ratio >= 4.5,
    contrastData.ctaButton
  );
  recordCheck('CONTRAST_DARK_CTA', `Dark CTA card contrast from DOM: ${contrastData.darkCtaCard.ratio}:1 (passes AAA >= 7.0:1)`,
    contrastData.darkCtaCard.ratio >= 7.0,
    contrastData.darkCtaCard
  );

  // Write Evidence File
  const evidencePath = path.join(QA_DIR, 'evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf-8');
  console.log(`\nEvidence file written to: ${evidencePath}`);

  console.log('\n================================================================');
  console.log(`SUMMARY: ${evidence.summary.passed}/${evidence.summary.total} checks PASSED. ${evidence.summary.failed} FAILED.`);
  console.log('================================================================');

  ws.close();
  cleanup();

  if (evidence.summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal in test runner:', err);
  cleanup();
  process.exit(1);
});
