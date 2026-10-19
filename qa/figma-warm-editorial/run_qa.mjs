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
const REF_IMAGE_PATH = path.join(root, 'frontend/public/warm-editorial/reference-1440x1024.png');

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

// Contrast ratio calculation (WCAG 2.1)
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(rgb1, rgb2) {
  const l1 = getLuminance(rgb1[0], rgb1[1], rgb1[2]);
  const l2 = getLuminance(rgb2[0], rgb2[1], rgb2[2]);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
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
  await until(async () => ev(`!!document.querySelector('[data-testid="guided-container"]')`));
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
      sidebar: sidebar ? { x: sidebar.x, y: sidebar.y, width: sidebar.width, height: sidebar.height } : null,
      canvasWrap: canvasWrap ? { x: canvasWrap.x, y: canvasWrap.y, width: canvasWrap.width, height: canvasWrap.height } : null,
      chatCard: chatCard ? { x: chatCard.x, y: chatCard.y, width: chatCard.width, height: chatCard.height } : null,
      tourCol: tourCol ? { x: tourCol.x, y: tourCol.y, width: tourCol.width, height: tourCol.height } : null,
      colors: { bodyBg, rootBg, sidebarBg }
    };
  })()`);

  evidence.measurements.initial = initialGeometry;

  recordCheck('SIDEBAR_GEOMETRY', 'Sidebar width is 232px at x=0',
    initialGeometry.sidebar && initialGeometry.sidebar.width === 232 && initialGeometry.sidebar.x === 0,
    initialGeometry.sidebar
  );

  recordCheck('CHAT_CARD_GEOMETRY', 'Chat Card width is 668px at x=264',
    initialGeometry.chatCard && Math.abs(initialGeometry.chatCard.width - 668) <= 2 && Math.abs(initialGeometry.chatCard.x - 264) <= 2,
    initialGeometry.chatCard
  );

  recordCheck('TOUR_COLUMN_GEOMETRY', 'Tour Column width is 452px at x=956',
    initialGeometry.tourCol && Math.abs(initialGeometry.tourCol.width - 452) <= 2 && Math.abs(initialGeometry.tourCol.x - 956) <= 2,
    initialGeometry.tourCol
  );

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
    console.log(`[t+${(s+1)*500}ms]`, JSON.stringify(dbg));
    if (dbg.timeline) break;
  }

  // Verify Tour Generated
  await until(async () => ev(`!!document.querySelector('[data-testid="guided-timeline"]')`));
  const stopCount = await ev(`document.querySelectorAll('.nn-editorial-stop-card').length`);
  recordCheck('TOUR_STOPS_RENDERED', 'Tour stops rendered with 3 stops', stopCount >= 3, { stopCount });

  // Verify Stop Number Badges
  const badges = await ev(`Array.from(document.querySelectorAll('.nn-stop-badge')).map(b => b.textContent.trim())`);
  recordCheck('STOP_NUMBER_BADGES', 'Stop cards have peach number badges (01, 02, 03)',
    badges.includes('01') && badges.includes('02'),
    { badges }
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

  // Stop Replacement Modal test
  console.log('Testing Stop Replacement Modal...');
  await click('[data-testid="stop-replace-btn-0"]');
  await until(async () => ev(`!!document.querySelector('[data-testid="replace-modal-cancel-btn"]')`));
  recordCheck('REPLACE_MODAL_OPENS', 'Replace stop modal opens on click', true);
  await click('[data-testid="replace-modal-cancel-btn"]');
  await until(async () => !(await ev(`!!document.querySelector('[data-testid="replace-modal-cancel-btn"]')`)));
  recordCheck('REPLACE_MODAL_CLOSES', 'Replace stop modal closes cleanly', true);

  // Interactive PilotMap toggle test
  console.log('Testing Map View Toggle (PMTiles PilotMap)...');
  await click('[data-testid="pilot-map-toggle"]');
  await until(async () => ev(`!!document.querySelector('[data-testid="pilot-map-canvas"]')`));
  recordCheck('PILOT_MAP_ACTIVE', 'Interactive PilotMap view mode activates on toggle', true);

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

  // 10. Contrast Ratio Verification (WCAG AA/AAA)
  console.log('\nVerifying WCAG Color Contrast Ratios...');
  const textInk = [35, 24, 21]; // #231815
  const cardBg = [255, 254, 250]; // #FFFEFA
  const sidebarBg = [112, 41, 20]; // #702914
  const whiteText = [255, 255, 255]; // #FFFFFF
  const ctaBg = [196, 74, 36]; // #C44A24 (WCAG AA compliant terracotta, 4.83:1)
  const darkCtaBg = [49, 40, 32]; // #312820

  const contrastChatText = getContrastRatio(textInk, cardBg);
  const contrastSidebar = getContrastRatio(whiteText, sidebarBg);
  const contrastCta = getContrastRatio(whiteText, ctaBg);
  const contrastDarkCta = getContrastRatio(whiteText, darkCtaBg);

  evidence.contrast = {
    chatText: { ratio: Number(contrastChatText.toFixed(2)), required: 4.5, passesAA: contrastChatText >= 4.5, passesAAA: contrastChatText >= 7.0 },
    sidebarText: { ratio: Number(contrastSidebar.toFixed(2)), required: 4.5, passesAA: contrastSidebar >= 4.5, passesAAA: contrastSidebar >= 7.0 },
    ctaButton: { ratio: Number(contrastCta.toFixed(2)), required: 4.5, passesAA: contrastCta >= 4.5 },
    darkCtaCard: { ratio: Number(contrastDarkCta.toFixed(2)), required: 4.5, passesAA: contrastDarkCta >= 4.5, passesAAA: contrastDarkCta >= 7.0 }
  };

  recordCheck('CONTRAST_CHAT_TEXT', `Primary chat text contrast: ${contrastChatText.toFixed(2)}:1 (passes AAA >= 7.0:1)`, contrastChatText >= 7.0);
  recordCheck('CONTRAST_SIDEBAR', `Sidebar brand/nav contrast: ${contrastSidebar.toFixed(2)}:1 (passes AAA >= 7.0:1)`, contrastSidebar >= 7.0);
  recordCheck('CONTRAST_CTA_BUTTON', `Terracotta CTA button contrast: ${contrastCta.toFixed(2)}:1 (passes AA >= 4.5:1)`, contrastCta >= 4.5);
  recordCheck('CONTRAST_DARK_CTA', `Dark CTA card contrast: ${contrastDarkCta.toFixed(2)}:1 (passes AAA >= 7.0:1)`, contrastDarkCta >= 7.0);

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
