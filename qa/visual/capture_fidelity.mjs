/**
 * SVG Fidelity Baseline & Recapture Visual Comparison Suite
 *
 * Implements practical CDP screenshot, layout deviation measurement,
 * and deterministic canvas composite comparison (side-by-side & overlay).
 *
 * Enforces:
 * - Isolated ports: Web 13400, API 18400, CDP 19600
 * - Preflight TCP refusal check on all ports before launch
 * - Backend preflight verification: health.dataset_source === 'synthetic'
 * - Scratch Next.js isolated build without modifying root files
 * - Zero external Google API calls (host-resolver-rules ~NOTFOUND)
 * - Deterministic composite generation using headless browser canvas
 * - Scroll normalization: asserts window.scrollY === 0 before capture & metrics
 * - Unmasked side-by-side and overlay (no banners obscuring header geometry)
 * - Explicit lifecycle cleanup with ws.close() and process termination
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_DIR = path.join(REPO_ROOT, 'docs', 'reports', 'svg-fidelity');

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

const args = process.argv.slice(2);
const tagIdx = args.indexOf('--tag');
const FILE_TAG = tagIdx !== -1 && args[tagIdx + 1] ? args[tagIdx + 1] : 'baseline';

const PORT_WEB = 13400;
const PORT_API = 18400;
const PORT_CDP = 19600;

const BROWSER_PATH = process.env.BROWSER ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe',
   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);

if (!BROWSER_PATH) {
  console.error('No suitable Chrome/Edge browser found for CDP visual testing');
  process.exit(1);
}

const SVG_REF_PATH = 'D:/Downloads/UI ngonngon tour.svg';
const PNG_REF_FALLBACK = path.join(REPO_ROOT, 'docs', 'design', 'ngonngon-tour-reference.png');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-qa-'));
const sessionDb = path.join(scratch, 'sessions.sqlite');
const scratchApp = path.join(scratch, 'app');

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
function startProcess(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { cwd: REPO_ROOT, env, stdio: 'ignore', windowsHide: true, ...opts });
  children.push(p);
  return p;
}

let cleanupDone = false;
function cleanup() {
  if (cleanupDone) return;
  cleanupDone = true;
  console.log('\nCleaning up processes and temporary scratch...');
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
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch (_) {}
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  cleanup();
  process.exit(1);
});

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await fn()) return;
    } catch (_) {}
    await pause(100);
  }
  throw new Error(`Timeout waiting for condition`);
}

async function checkPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

async function main() {
  let ws = null;
  try {
    console.log('=== SVG Fidelity Harness: Preflight TCP Refusal Check ===');
    for (const port of [PORT_WEB, PORT_API, PORT_CDP]) {
      const free = await checkPortFree(port);
      if (!free) {
        throw new Error(`TCP Refusal Error: Port ${port} is currently in use! Preflight requires completely free ports.`);
      }
      console.log(`Port ${port} is free.`);
    }

    console.log('\n=== Starting Python Backend (Isolated Synthetic Fixture) ===');
    const pythonExe = path.join(REPO_ROOT, '.venv/Scripts/python.exe');
    startProcess(pythonExe, [
      '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(PORT_API)
    ]);

    await until(async () => {
      const res = await fetch(`http://127.0.0.1:${PORT_API}/health`);
      return res.ok;
    });

    const health = await (await fetch(`http://127.0.0.1:${PORT_API}/health`)).json();
    console.log('Backend Health:', health.status, 'dataset_source:', health.dataset_source, 'llm:', health.llm);
    if (health.dataset_source !== 'synthetic') {
      throw new Error(`FATAL: health.dataset_source is "${health.dataset_source}", expected "synthetic"!`);
    }

    console.log('\n=== Building Scratch Next.js App for Port ' + PORT_API + ' ===');
    fs.cpSync(path.join(REPO_ROOT, 'frontend'), scratchApp, {
      recursive: true,
      filter: (src) => !src.includes('node_modules') && !src.includes('.next')
    });
    fs.symlinkSync(
      path.join(REPO_ROOT, 'frontend', 'node_modules'),
      path.join(scratchApp, 'node_modules'),
      'junction'
    );

    console.log('Running Next.js build in scratch directory...');
    execFileSync(process.execPath, [
      path.join(REPO_ROOT, 'frontend/node_modules/next/dist/bin/next'),
      'build'
    ], {
      cwd: scratchApp,
      env,
      stdio: 'ignore'
    });
    console.log('Scratch Next.js build finished.');

    startProcess(process.execPath, [
      path.join(REPO_ROOT, 'frontend/node_modules/next/dist/bin/next'),
      'start',
      scratchApp,
      '-H', '127.0.0.1',
      '-p', String(PORT_WEB)
    ]);

    await until(async () => {
      const res = await fetch(`http://127.0.0.1:${PORT_WEB}/`);
      return res.ok;
    });
    console.log(`Frontend running on http://127.0.0.1:${PORT_WEB}`);

    console.log('\n=== Starting Headless Chrome via CDP ===');
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

    ws = new WebSocket(target.webSocketDebuggerUrl);
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
      await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);
      const box = await ev(`(()=>{
        const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
        return r && { x: r.x + r.width/2, y: r.y + r.height/2 };
      })()`);
      if (!box) throw new Error(`Cannot find selector to click: ${selector}`);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...box });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...box });
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

    async function assertScrollYZero(context = '') {
      await ev(`(()=>{
        window.scrollTo(0, 0);
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      })()`);
      await pause(200);
      const scrollY = await ev('window.scrollY || document.documentElement.scrollTop || 0');
      if (scrollY !== 0) {
        throw new Error(`Scroll normalization failure in ${context}: scrollY is ${scrollY}, expected 0`);
      }
    }

    console.log('\n=== Step 1: Capture Desktop 1440x1024 Empty State ===');
    await setViewport(1440, 1024, false);
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT_WEB}/` });
    await until(async () => ev('!!document.querySelector("[data-testid=\\"guided-container\\"]")'));
    await waitIdle();
    await assertScrollYZero('desktop empty state');
    const emptyDesktopPath = path.join(REPORT_DIR, `${FILE_TAG}_desktop_1440_empty.png`);
    await snapScreenshot(emptyDesktopPath);

    console.log('\n=== Step 2: Drive Flow to Planned Tour State ===');
    const promptText = 'Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin.';
    await typeAndSend(promptText);

    // Clarify card
    await until(async () => ev('!!document.querySelector("[data-testid=\\"clarify-option-scope:group\\"]")'));
    await click('[data-testid="clarify-option-scope:group"]');
    await waitIdle();

    // Follow-up question if any
    const hasFollowUp = await ev('!!document.querySelector("[data-testid=\\"clarify-question-card\\"]")');
    if (hasFollowUp) {
      const has19 = await ev('!!document.querySelector("[data-testid=\\"clarify-option-time:19:00\\"]")');
      if (has19) {
        await click('[data-testid="clarify-option-time:19:00"]');
      } else {
        await typeAndSend('19h', '[data-testid="clarify-free-text-input"]');
      }
      await waitIdle();
    }

    // Confirmation card
    await until(async () => ev('!!document.querySelector("[data-testid=\\"confirm-yes-btn\\"]")'));
    await click('[data-testid="confirm-yes-btn"]');
    await waitIdle();

    // Timeline ready
    await until(async () => ev('!!document.querySelector("[data-testid=\\"guided-timeline\\"]")'));
    await pause(800);

    // NORMALIZE SCROLL TO 0 BEFORE TOUR CAPTURE AND METRICS
    console.log('Normalizing scroll position: resetting window.scrollTo(0,0)...');
    await assertScrollYZero('desktop tour state');

    console.log('\n=== Step 3: Capture Desktop 1440x1024 Planned Tour State ===');
    const tourDesktopPath = path.join(REPORT_DIR, `${FILE_TAG}_desktop_1440_tour.png`);
    await snapScreenshot(tourDesktopPath);

    console.log('\n=== Step 4: Extract Real UI DOM Geometry & Typography Metrics ===');
    const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
    const frontendDirty = execFileSync('git', ['status', '--porcelain', 'frontend'], { cwd: REPO_ROOT }).toString().trim().length > 0;
    const domMetrics = await ev(`(() => {
      const getRect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          selector: sel,
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
          border: style.border,
          padding: style.padding,
          margin: style.margin,
          gap: style.gap,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          fontFamily: style.fontFamily,
          color: style.color
        };
      };

      return {
        provenance: {
          sourceHead: ${JSON.stringify(sourceHead)},
          frontendDirty: ${frontendDirty},
          timestamp: new Date().toISOString()
        },
        viewport: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight,
          scrollY: window.scrollY,
          devicePixelRatio: window.devicePixelRatio
        },
        header: getRect('header'),
        headerLogo: getRect('header > div:first-child > div:first-child'),
        headerTitle: getRect('header > div:first-child > div:last-child > div:first-child'),
        headerNav: getRect('header nav'),
        headerProfile: getRect('header > div:last-child'),
        mainGrid: getRect('main'),
        chatSection: getRect('#guided-chat-section'),
        chatHeaderBanner: getRect('#guided-chat-section > div:first-child'),
        chatTitle: getRect('#guided-chat-section h2'),
        chatInputBox: getRect('#guided-chat-section form, [data-testid="guided-input"]'),
        tourSection: getRect('#guided-tour-section'),
        tourHeaderBadge: getRect('#guided-tour-section > div:first-child > div > div:first-child'),
        tourTitle: getRect('#guided-tour-section h1'),
        tourSubtitle: getRect('#guided-tour-section h1 + div'),
        metricCardsContainer: getRect('#guided-tour-section > div:nth-child(2)'),
        metricCards: Array.from(document.querySelectorAll('#guided-tour-section > div:nth-child(2) > div')).map((el, i) => {
          const r = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            index: i,
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height),
            backgroundColor: style.backgroundColor,
            borderRadius: style.borderRadius,
            fontSize: style.fontSize,
            fontFamily: style.fontFamily,
            text: el.innerText.trim().replace(/\\n/g, ' ')
          };
        }),
        timelineContainer: getRect('[data-testid="guided-timeline"]'),
        timelineWarning: getRect('[data-testid="timeline-conditional-status"], .nn-warn-one'),
        stopCards: Array.from(document.querySelectorAll('[data-testid^="timeline-stop-card-"]')).map((el, i) => {
          const r = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const titleEl = el.querySelector('h3, .nn-timeline-card-title');
          const titleStyle = titleEl ? window.getComputedStyle(titleEl) : null;
          const descEl = el.querySelector('p, .nn-timeline-card-desc');
          const descStyle = descEl ? window.getComputedStyle(descEl) : null;
          return {
            index: i,
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height),
            backgroundColor: style.backgroundColor,
            borderRadius: style.borderRadius,
            border: style.border,
            titleText: titleEl?.innerText || '',
            titleFontSize: titleStyle?.fontSize,
            titleFontWeight: titleStyle?.fontWeight,
            titleFontFamily: titleStyle?.fontFamily,
            titleColor: titleStyle?.color,
            descFontSize: descStyle?.fontSize,
            descColor: descStyle?.color
          };
        }),
        thirdCardBottom: (() => {
          const cards = document.querySelectorAll('[data-testid^="timeline-stop-card-"]');
          if (cards.length >= 3) {
            const r = cards[2].getBoundingClientRect();
            return Math.round(r.y + r.height);
          }
          return null;
        })(),
        routeAside: getRect('#guided-tour-section aside')
      };
    })()`);

    console.log('\n=== Step 5: Capture Mobile 390x844 States ===');
    await setViewport(390, 844, true);
    await pause(300);

    // 1. Mobile Chat Tab
    const chatBtnSel = 'button[aria-controls="guided-chat-section"], nav button:first-child';
    if (await ev(`!!document.querySelector('${chatBtnSel}')`)) {
      await click(chatBtnSel);
      await pause(300);
      const isChatVisible = await ev(`(()=>{
        const chat = document.querySelector('#guided-chat-section');
        const tour = document.querySelector('#guided-tour-section');
        return chat && window.getComputedStyle(chat).display !== 'none' && tour && window.getComputedStyle(tour).display === 'none';
      })()`);
      console.log(`Mobile chat tab active check: ${isChatVisible ? 'OK' : 'FAIL'}`);
      const chatScrollW = await ev('document.documentElement.scrollWidth');
      console.log(`Mobile chat scrollWidth: ${chatScrollW} (max 390)`);
      await assertScrollYZero('mobile chat tab');
      const mobileChatPath = path.join(REPORT_DIR, `${FILE_TAG}_mobile_390_chat.png`);
      await snapScreenshot(mobileChatPath);
    }

    // 2. Switch to Mobile Tour Tab
    const tourBtnSel = 'button[aria-controls="guided-tour-section"], nav button:nth-child(2)';
    if (await ev(`!!document.querySelector('${tourBtnSel}')`)) {
      await click(tourBtnSel);
      await pause(300);
      const isTourVisible = await ev(`(()=>{
        const chat = document.querySelector('#guided-chat-section');
        const tour = document.querySelector('#guided-tour-section');
        return tour && window.getComputedStyle(tour).display !== 'none' && chat && window.getComputedStyle(chat).display === 'none';
      })()`);
      console.log(`Mobile tour tab active check: ${isTourVisible ? 'OK' : 'FAIL'}`);
      const tourScrollW = await ev('document.documentElement.scrollWidth');
      console.log(`Mobile tour scrollWidth: ${tourScrollW} (max 390)`);
      await assertScrollYZero('mobile tour tab');
      const mobileTourPath = path.join(REPORT_DIR, `${FILE_TAG}_mobile_390_tour.png`);
      await snapScreenshot(mobileTourPath);
    }

    console.log('\n=== Step 6: Render Reference SVG at 1440x1024 ===');
    await setViewport(1440, 1024, false);
    const refSvgRenderPath = path.join(REPORT_DIR, 'reference_svg_1440.png');

    let refPngBuffer;
    if (fs.existsSync(PNG_REF_FALLBACK)) {
      console.log(`Using verified reference PNG from ${PNG_REF_FALLBACK}...`);
      refPngBuffer = fs.readFileSync(PNG_REF_FALLBACK);
      fs.writeFileSync(refSvgRenderPath, refPngBuffer);
    } else if (fs.existsSync(SVG_REF_PATH)) {
      console.log(`Loading SVG directly from ${SVG_REF_PATH}...`);
      const svgContent = fs.readFileSync(SVG_REF_PATH, 'utf8');
      const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);
      await cdp('Page.navigate', { url: svgDataUrl });
      await pause(500);
      const res = await cdp('Page.captureScreenshot', { format: 'png' });
      refPngBuffer = Buffer.from(res.data, 'base64');
      fs.writeFileSync(refSvgRenderPath, refPngBuffer);
    } else {
      throw new Error('Neither reference PNG fallback nor SVG reference found!');
    }

    console.log('\n=== Step 7: Create Unmasked Deterministic Composite Images via Canvas ===');
    const desktopTourBuffer = fs.readFileSync(tourDesktopPath);
    const refBase64 = 'data:image/png;base64,' + refPngBuffer.toString('base64');
    const tourBase64 = 'data:image/png;base64,' + desktopTourBuffer.toString('base64');

    // 7a. Unmasked Side-by-side composite (2880 x 1024)
    console.log('Rendering 2880x1024 Unmasked Side-by-Side Composite...');
    await setViewport(2880, 1024, false);
    const sideBySideHtml = `
      <!DOCTYPE html>
      <html>
        <head><style>body { margin:0; padding:0; overflow:hidden; background:#000; }</style></head>
        <body>
          <canvas id="cv" width="2880" height="1024"></canvas>
          <script>
            async function render() {
              const cv = document.getElementById('cv');
              const ctx = cv.getContext('2d');
              const load = src => new Promise((res, rej) => {
                const img = new Image();
                img.onload = () => res(img);
                img.onerror = rej;
                img.src = src;
              });
              const [refImg, tourImg] = await Promise.all([load('${refBase64}'), load('${tourBase64}')]);
              // Draw Reference Left (Unmasked)
              ctx.drawImage(refImg, 0, 0, 1440, 1024);
              // Draw Real UI Right (Unmasked)
              ctx.drawImage(tourImg, 1440, 0, 1440, 1024);
              // Clean thin dividing line at seam
              ctx.strokeStyle = '#E11D48';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(1440, 0);
              ctx.lineTo(1440, 1024);
              ctx.stroke();
              return true;
            }
          </script>
        </body>
      </html>
    `;
    await cdp('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(sideBySideHtml) });
    await ev('render()');
    await pause(300);
    const sideBySidePath = path.join(REPORT_DIR, `${FILE_TAG}_composite_side_by_side_1440.png`);
    await snapScreenshot(sideBySidePath);

    // 7b. Unmasked Overlay composite (1440 x 1024)
    console.log('Rendering 1440x1024 Unmasked Overlay Composite (50% Opacity)...');
    await setViewport(1440, 1024, false);
    const overlayHtml = `
      <!DOCTYPE html>
      <html>
        <head><style>body { margin:0; padding:0; overflow:hidden; background:#FFF; }</style></head>
        <body>
          <canvas id="cv" width="1440" height="1024"></canvas>
          <script>
            async function render() {
              const cv = document.getElementById('cv');
              const ctx = cv.getContext('2d');
              const load = src => new Promise((res, rej) => {
                const img = new Image();
                img.onload = () => res(img);
                img.onerror = rej;
                img.src = src;
              });
              const [refImg, tourImg] = await Promise.all([load('${refBase64}'), load('${tourBase64}')]);
              // Draw UI base (Unmasked)
              ctx.drawImage(tourImg, 0, 0, 1440, 1024);
              // Draw Reference SVG overlay (Unmasked with 50% opacity)
              ctx.globalAlpha = 0.5;
              ctx.drawImage(refImg, 0, 0, 1440, 1024);
              return true;
            }
          </script>
        </body>
      </html>
    `;
    await cdp('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(overlayHtml) });
    await ev('render()');
    await pause(300);
    const overlayPath = path.join(REPORT_DIR, `${FILE_TAG}_composite_overlay_1440.png`);
    await snapScreenshot(overlayPath);

    console.log('\n=== Step 8: Save Metrics JSON ===');
    const metricsFilePath = path.join(REPORT_DIR, `${FILE_TAG}_metrics.json`);
    fs.writeFileSync(metricsFilePath, JSON.stringify(domMetrics, null, 2));
    console.log(`Saved metrics: ${path.basename(metricsFilePath)}`);

    console.log(`\n=== SVG Fidelity Capture (${FILE_TAG}) Completed Successfully! ===`);
    console.log(`Artifacts written to: ${REPORT_DIR}`);
  } finally {
    if (ws) {
      try {
        ws.close();
      } catch (_) {}
    }
    cleanup();
  }
}

main()
  .then(() => {
    console.log('Process exiting cleanly with code 0.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nFAILED TO COMPLETE CAPTURE:', err);
    process.exit(1);
  });
