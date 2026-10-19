/**
 * Visual Evidence Capture Suite for Online Assistant UI Extension
 * Task ID: task_529bb1dff2e5
 * Ports: Web 3070, API 8070, CDP 9370
 * Viewports: Desktop 1440x1024, Mobile 390x844
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
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'reports', 'online-assistant', 'evidence');

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

const PORT_WEB = 3070;
const PORT_API = 8070;
const PORT_CDP = 9370;

const BROWSER_PATH = process.env.BROWSER ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe',
   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);

if (!BROWSER_PATH) {
  console.error('No suitable Chrome/Edge browser found for CDP visual capture');
  process.exit(1);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-ui-evidence-'));
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
  FOODTOUR_SESSION_DB: sessionDb,
  WEB_ORIGIN: `http://127.0.0.1:${PORT_WEB}`,
  PYTHONPATH: path.join(REPO_ROOT, 'backend'),
  PYTHONIOENCODING: 'utf-8',
  FOODTOUR_DATA_PATH: path.join(REPO_ROOT, 'contracts/fixtures/venues.chat.synthetic.json'),
  NEXT_PUBLIC_API_URL: `http://127.0.0.1:${PORT_API}`,
  NEXT_PUBLIC_API_MODE: 'mock',
  NEXT_PUBLIC_UI_GUIDED: '1',
  NEXT_PUBLIC_CHAT_V2: '1',
  NEXT_PUBLIC_UI_V2: '1'
};

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

const pause = (ms) => new Promise((res) => setTimeout(res, ms));

async function until(fn, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await fn()) return true;
    } catch (_) {}
    await pause(150);
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

async function main() {
  let ws = null;
  try {
    console.log('=== Preflight Port Refusal Check (3070, 8070, 9370) ===');
    for (const port of [PORT_WEB, PORT_API, PORT_CDP]) {
      const free = await checkPortFree(port);
      if (!free) throw new Error(`Port ${port} is in use; preflight aborted.`);
      console.log(`Port ${port} is free.`);
    }

    console.log('\n=== Starting Next.js Production Server on Port 3070 ===');
    const nextBin = path.join(REPO_ROOT, 'frontend/node_modules/next/dist/bin/next');
    startProcess(process.execPath, [
      nextBin,
      'start',
      path.join(REPO_ROOT, 'frontend'),
      '-H', '127.0.0.1',
      '-p', String(PORT_WEB)
    ]);

    await until(async () => {
      const res = await fetch(`http://127.0.0.1:${PORT_WEB}/`);
      return res.ok;
    });
    console.log(`Next.js ready at http://127.0.0.1:${PORT_WEB}/`);

    console.log('\n=== Launching Headless Chrome via CDP ===');
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
    const networkRequests = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Network.requestWillBeSent' && m.params?.request?.url) {
        networkRequests.push(m.params.request.url);
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

    for (const domain of ['Page', 'Runtime', 'DOM', 'Network']) {
      await cdp(`${domain}.enable`);
    }

    async function ev(expr) {
      const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      }
      return r.result?.value;
    }

    async function snapScreenshot(filename) {
      const filepath = path.join(EVIDENCE_DIR, filename);
      const res = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
      console.log(`Saved screenshot: ${filename} (${(res.data.length * 0.75 / 1024).toFixed(1)} KB)`);
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
    }

    // ==========================================
    // CAPTURE 1: Desktop 1440x1024 Start Screen
    // ==========================================
    console.log('\n--- Capture 1: Desktop Start Screen with "Tra web" opt-in ---');
    await setViewport(1440, 1024, false);
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT_WEB}/` });
    await until(async () => ev(`!!document.querySelector('[data-testid="guided-container"]')`));
    await waitIdle();
    await snapScreenshot('01_desktop_start_with_web_optin.png');

    // ==========================================
    // CAPTURE 2: Desktop "Tra web" Checked Explanation
    // ==========================================
    console.log('\n--- Capture 2: Desktop Web Opt-in Checked Explanation ---');
    await click('[data-testid="web-search-optin-checkbox"]');
    await pause(300);
    await snapScreenshot('02_desktop_web_optin_checked_explanation.png');

    // ==========================================
    // CAPTURE 3: Honest Web Search Status & Disclaimer
    // ==========================================
    console.log('\n--- Capture 3: Honest Web Search Status & Disclaimer ---');
    await ev(`(() => {
      const inp = document.querySelector('[data-testid="guided-input"]');
      if (inp) {
        inp.value = 'Quán cà phê trứng nào ngon ở Hoàn Kiếm?';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await pause(200);
    await click('[data-testid="guided-send-btn"]');
    await waitIdle();
    await pause(600);
    await snapScreenshot('03_desktop_honest_web_search_unavailable.png');

    // ==========================================
    // CAPTURE 4: Route Panel "Bản đồ" Interactive View
    // ==========================================
    console.log('\n--- Capture 4: Route Panel "Bản đồ" Interactive View ---');
    await click('[data-testid="view-mode-map-btn"]');
    await pause(1000); // Allow MapLibre canvas to render local PMTiles vector tiles
    await snapScreenshot('04_desktop_interactive_map_view.png');

    // ==========================================
    // CAPTURE 5: Trust Disclosure Modal with Privacy Disclosures
    // ==========================================
    console.log('\n--- Capture 5: Trust Disclosure Modal ---');
    await click('[data-testid="trust-disclosure-btn"]');
    await pause(400);
    await snapScreenshot('05_desktop_trust_disclosure_modal.png');
    await click('[data-testid="trust-disclosure-close"]');
    await pause(200);

    // ==========================================
    // CAPTURE 6: Mobile 390x844 Chat Tab
    // ==========================================
    console.log('\n--- Capture 6: Mobile 390x844 Chat Tab & Opt-in ---');
    await setViewport(390, 844, true);
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT_WEB}/` });
    await until(async () => ev(`!!document.querySelector('[data-testid="guided-container"]')`));
    await waitIdle();
    await snapScreenshot('06_mobile_390_chat_and_optin.png');

    // ==========================================
    // CAPTURE 7: Mobile 390x844 Tour Tab & Map Mode
    // ==========================================
    console.log('\n--- Capture 7: Mobile 390x844 Tour Tab & Map Mode ---');
    await click('[data-testid="mobile-tab-tour"]');
    await pause(300);
    await click('[data-testid="view-mode-map-btn"]');
    await pause(1000);
    await snapScreenshot('07_mobile_390_map_view.png');

    // Verify Network Invariant: Assert zero remote map/tile requests
    const remoteTileCalls = networkRequests.filter((url) =>
      url.includes('tile.openstreetmap.org') ||
      url.includes('maps.googleapis.com') ||
      url.includes('api.maptiler.com') ||
      url.includes('api.mapbox.com')
    );
    if (remoteTileCalls.length > 0) {
      throw new Error(`FATAL: Remote tile servers were contacted! Calls: ${remoteTileCalls.join(', ')}`);
    }
    console.log('✓ Network invariant passed: Zero remote map/tile requests detected.');

    console.log('\n🎉 ALL 7 EVIDENCE SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } finally {
    if (ws) {
      try { ws.close(); } catch (_) {}
    }
    cleanup();
  }
}

main().catch((err) => {
  console.error('Fatal in capture_ui_evidence:', err);
  process.exit(1);
});
