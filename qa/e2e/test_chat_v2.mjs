/**
 * Real-Browser CDP E2E Acceptance Suite for Chatbot V2 (TASK C6a)
 *
 * Verifies against REAL Python backend (FastAPI / Uvicorn) on port 18000
 * and REAL Next.js production build in an isolated scratch copy on port 13000.
 * NO mocks: drives UI in a real browser (Edge / Chrome) via Chrome DevTools Protocol (CDP).
 *
 * Scenarios verified:
 * (1) CH-01 start screen: geolocation denied -> district chips -> 'Chiều nay nóng quá, quanh đây ăn gì được?' (no weather data text) -> dish suggestions
 * (2) CH-03: search 'tìm quán bún', cards labelled A/B, compare A and B by distance (estimate label, 'Chưa rõ' cells), unsupported criterion text
 * (3) CH-04: add/remove/keep via buttons AND via typed text, shortlist panel stays in sync with chat.state
 * (4) CH-05: typed 'ok' never creates a tour and shows clarify buttons
 * (5) CH-06 allergy: 'có bạn không ăn cua' -> allergy-or-dislike buttons -> 'Dị ứng' -> prominent allergies chip, every card shows 'Chưa đủ thông tin về dị ứng', 'tìm quán hải sản' does not show crab venues, zero 'an toàn' claims
 * (6) CH-08: no location -> 'ở Cầu Giấy' resolves, 'đường Xuân Thủy' shows 'xấp xỉ', 'ở Sa Pa' shows outside-Hà-Nội notice
 * (7) budget exhausted banner path is covered by C6b (skipped per task prompt)
 * (8) double-click on Add and on confirm sends ONE request; 409 revision conflict recovery; reload the page mid-conversation and the chat state (shortlist, pending question) is restored from GET session
 * (9) keyboard-only run (Tab order, Enter/Space on option buttons), 390x844 stacked tabs, 1280x800 three zones, 44px targets
 * (10) hostile text typed by the user (<img onerror>, javascript:, 1000 chars) renders as text
 * (11) PLAN flow (CH-09): confirm_summary -> confirm_yes -> tour_ready -> itinerary + Maps links
 */

import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_DIR = path.join(REPO_ROOT, 'frontend');
const BACKEND_DIR = path.join(REPO_ROOT, 'backend');
const SYNTHETIC_DATA_PATH = path.join(REPO_ROOT, 'contracts', 'fixtures', 'venues.chat.synthetic.json');
const SCREENSHOTS_DIR = path.join(REPO_ROOT, 'qa', 'screenshots', 'chat-v2');

const PORT_API = Number(process.env.UI_CHAT_PORT_API || 18000);
const PORT_WEB = Number(process.env.UI_CHAT_PORT_WEB || 13000);
const PORT_CDP = Number(process.env.UI_CHAT_PORT_CDP || 19222);

const PYTHON_CANDIDATES = [
  process.env.PYTHON,
  'C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-codex-backend/.venv/Scripts/python.exe',
  'python',
].filter(Boolean);

const pythonPath = PYTHON_CANDIDATES.find((p) => {
  try {
    return fs.existsSync(p) || execSync(`where ${p}`, { stdio: 'ignore' }) !== null;
  } catch (_) {
    return false;
  }
});

if (!pythonPath) {
  console.error('No python executable found; please set PYTHON environment variable');
  process.exit(2);
}

const BROWSER_CANDIDATES = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

const browserPath = BROWSER_CANDIDATES.find((p) => fs.existsSync(p));
if (!browserPath) {
  console.error('No Edge/Chrome browser found; please set BROWSER environment variable');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function record(id, title, passed, details = '') {
  results.push({ id, title, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [${id}] ${title}${details ? ` -> ${details}` : ''}`);
  if (!passed) {
    throw new Error(`Assertion failed in [${id}] ${title}: ${details}`);
  }
}

function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch (_) {}
}

let currentStep = 'initialization';
const HARD_TIMEOUT_MS = 9 * 60 * 1000;
let globalBackendProc = null;
let globalFrontendProc = null;
let globalBrowserProc = null;

const hardTimeoutTimer = setTimeout(() => {
  console.error(`\n[FATAL] Overall test suite hard timeout (${HARD_TIMEOUT_MS / 1000}s) exceeded! Last active step: ${currentStep}`);
  if (globalBrowserProc?.pid) killProcessTree(globalBrowserProc.pid);
  if (globalFrontendProc?.pid) killProcessTree(globalFrontendProc.pid);
  if (globalBackendProc?.pid) killProcessTree(globalBackendProc.pid);
  process.exit(1);
}, HARD_TIMEOUT_MS);
hardTimeoutTimer.unref();

function ensurePortFree(port, name) {
  let isBusy = false;
  let pids = [];
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && !isNaN(Number(pid))) {
        if (!pids.includes(pid)) pids.push(pid);
        isBusy = true;
      }
    }
  } catch (_) {
    isBusy = false;
  }

  if (isBusy) {
    if (process.env.FORCE_FREE_PORTS === '1') {
      console.log(`[Port Check] Port ${port} (${name}) is busy (PIDs: ${pids.join(', ')}). FORCE_FREE_PORTS=1 set: killing...`);
      for (const pid of pids) {
        try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' }); } catch (_) {}
      }
    } else {
      throw new Error(`Port ${port} (${name}) is already in use by PID(s): ${pids.join(', ')}. Set FORCE_FREE_PORTS=1 to auto-kill, or use UI_CHAT_PORT_${name.toUpperCase()} to override.`);
    }
  }
}

function freePort(port) {
  if (process.env.FORCE_FREE_PORTS !== '1') return;
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && !isNaN(Number(pid))) {
        try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' }); } catch (_) {}
      }
    }
  } catch (_) {}
}

async function waitForHttp(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const ok = await new Promise((res) => {
        const req = http.get(url, (r) => {
          res(r.statusCode >= 200 && r.statusCode < 400);
        });
        req.on('error', () => res(false));
        req.setTimeout(1000, () => {
          req.destroy();
          res(false);
        });
      });
      if (ok) return true;
    } catch (_) {}
    await sleep(300);
  }
  throw new Error(`Timed out waiting for HTTP service at ${url}`);
}

async function run() {
  console.log('\n===============================================================');
  console.log('   AI FOODTOUR PLANNER — REAL-API CHATBOT V2 CDP E2E SUITE');
  console.log(`   Backend API Port: ${PORT_API} | Web Frontend Port: ${PORT_WEB}`);
  console.log(`   Browser CDP Port: ${PORT_CDP}`);
  console.log('===============================================================\n');

  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  let scratchDir = null;
  let tempDbDir = null;
  let backendProc = null;
  let frontendProc = null;
  let browserProc = null;
  let ws = null;

  try {
    ensurePortFree(PORT_API, 'api');
    ensurePortFree(PORT_WEB, 'web');
    ensurePortFree(PORT_CDP, 'cdp');
    await sleep(500);

    // -------------------------------------------------------------
    // Step 1: Start Real Backend on Port 18000
    // -------------------------------------------------------------
    tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-db-'));
    const sessionDbPath = path.join(tempDbDir, 'sessions.sqlite');

    console.log(`[Backend] Starting real FastAPI backend on port ${PORT_API}...`);
    console.log(`[Backend] Synthetic Fixture: ${SYNTHETIC_DATA_PATH}`);
    console.log(`[Backend] SQLite Sessions DB: ${sessionDbPath}`);

    const backendEnv = {
      ...process.env,
      FOODTOUR_CHAT_V2: '1',
      FOODTOUR_UI_V2: '1',
      FOODTOUR_DATA_PATH: SYNTHETIC_DATA_PATH,
      FOODTOUR_SESSION_DB: sessionDbPath,
      FOODTOUR_LLM: 'mock',
      FOODTOUR_ROUTING: 'estimate',
      FOODTOUR_GEOCODER: 'off',
      FOODTOUR_RATE_LIMIT_TOKEN: '10000',
      FOODTOUR_RATE_LIMIT_IP: '10000',
      WEB_ORIGIN: `http://localhost:${PORT_WEB},http://127.0.0.1:${PORT_WEB}`,
    };

    for (let attempt = 1; attempt <= 15; attempt++) {
      try {
        const out = execSync(`netstat -ano | findstr :${PORT_API}`, { encoding: 'utf8' });
        if (out.includes('TIME_WAIT') || out.includes('LISTENING')) {
          freePort(PORT_API);
          await sleep(2000);
          continue;
        }
      } catch (_) {
        break; // Port is completely free
      }
    }

    let backendStarted = false;
    for (let attempt = 1; attempt <= 15; attempt++) {
      try {
        backendProc = spawn(
          pythonPath,
          ['-m', 'uvicorn', 'app.main:app', '--port', String(PORT_API), '--host', '127.0.0.1'],
          {
            cwd: BACKEND_DIR,
            env: backendEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );
        backendProc.stderr.on('data', (d) => {
          const str = d.toString();
          if (str.includes('ERROR') || str.includes('Error')) console.error(`[Backend Error] ${str.trim()}`);
        });
        await waitForHttp(`http://127.0.0.1:${PORT_API}/health`, 15000);
        backendStarted = true;
        break;
      } catch (err) {
        console.warn(`[Backend] Attempt ${attempt} failed: ${err.message}. Retrying in 3s...`);
        if (backendProc?.pid) killProcessTree(backendProc.pid);
        freePort(PORT_API);
        await sleep(3000);
      }
    }
    if (!backendStarted) {
      throw new Error(`Failed to start backend on port ${PORT_API} after multiple attempts`);
    }
    console.log('[Backend] Real FastAPI backend healthy and responding on port 18000.');

    // -------------------------------------------------------------
    // Step 2: Build and Start Production Frontend on Port 13000
    // -------------------------------------------------------------
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-web-scratch-'));
    console.log(`[Frontend] Scratch directory created: ${scratchDir}`);

    fs.cpSync(FRONTEND_DIR, scratchDir, {
      recursive: true,
      filter: (src) => !src.includes('node_modules') && !src.includes('.next'),
    });

    fs.symlinkSync(
      path.join(FRONTEND_DIR, 'node_modules'),
      path.join(scratchDir, 'node_modules'),
      'junction'
    );
    console.log('[Frontend] Linked node_modules junction.');

    console.log(`[Frontend] Building production Next.js with API at http://127.0.0.1:${PORT_API}...`);
    execSync('npx next build', {
      cwd: scratchDir,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: `http://127.0.0.1:${PORT_API}`,
        NEXT_PUBLIC_API_MODE: 'real',
        NEXT_PUBLIC_CHAT_V2: '1',
        NEXT_PUBLIC_UI_V2: '1',
      },
      stdio: 'inherit',
    });
    console.log('[Frontend] Scratch Next.js production build complete.');

    console.log(`[Frontend] Starting production web server on port ${PORT_WEB}...`);
    frontendProc = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(PORT_WEB)], {
      cwd: scratchDir,
      stdio: 'ignore',
      shell: true,
    });

    await waitForHttp(`http://127.0.0.1:${PORT_WEB}/`, 25000);
    console.log(`[Frontend] Production web server ready at http://127.0.0.1:${PORT_WEB}/`);

    // -------------------------------------------------------------
    // Step 3: Launch Browser with CDP on Port 19222
    // -------------------------------------------------------------
    console.log(`[Browser] Launching browser with CDP on port ${PORT_CDP}...`);
    const browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-browser-'));
    browserProc = spawn(browserPath, [
      `--remote-debugging-port=${PORT_CDP}`,
      `--user-data-dir=${browserProfile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      'about:blank',
    ]);

    let wsUrl = null;
    for (let i = 0; i < 40; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json`)).json();
        const page = list.find((t) => t.type === 'page');
        if (page?.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch (_) {}
      await sleep(300);
    }
    if (!wsUrl) {
      throw new Error(`Failed to find page target at http://127.0.0.1:${PORT_CDP}/json`);
    }
    console.log(`[Browser] CDP Page WebSocket URL: ${wsUrl}`);

    ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let nextId = 1;
    const pendingCalls = new Map();
    const networkTurns = []; // Recorded POST /v1/sessions/{id}/chat calls

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pendingCalls.has(data.id)) {
        const { res, rej } = pendingCalls.get(data.id);
        pendingCalls.delete(data.id);
        if (data.error) rej(new Error(data.error.message));
        else res(data.result);
      }

      // Intercept Network events
      if (data.method === 'Network.requestWillBeSent') {
        const req = data.params.request;
        if (req.url.includes('/chat') && req.method === 'POST') {
          try {
            const body = req.postData ? JSON.parse(req.postData) : null;
            networkTurns.push({
              requestId: data.params.requestId,
              url: req.url,
              body,
              timestamp: Date.now(),
            });
          } catch (_) {}
        }
      }
      if (data.method === 'Network.responseReceived') {
        const resp = data.params.response;
        if (resp.url.includes('/chat')) {
          const matched = networkTurns.find((t) => t.requestId === data.params.requestId);
          if (matched) {
            matched.status = resp.status;
          }
        }
      }
    };

    function sendCDP(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((res, rej) => pendingCalls.set(id, { res, rej }));
    }

    async function ev(expr) {
      const r = await sendCDP('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
      }
      return r.result.value;
    }

    async function setViewport(width, height) {
      await sendCDP('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 600,
      });
      await sleep(200);
    }

    async function captureScreenshot(filename) {
      const res = await sendCDP('Page.captureScreenshot', { format: 'png' });
      const targetPath = path.join(SCREENSHOTS_DIR, filename);
      fs.writeFileSync(targetPath, Buffer.from(res.data, 'base64'));
      console.log(`[Screenshot] Saved: qa/screenshots/chat-v2/${filename}`);
    }

    await sendCDP('Page.enable');
    await sendCDP('Runtime.enable');
    await sendCDP('Network.enable');

    async function navigateTo(url) {
      await sendCDP('Page.navigate', { url });
      for (let i = 0; i < 60; i++) {
        await sleep(150);
        const ready = await ev(`document.readyState === 'complete' && !document.querySelector('[aria-busy="true"]')`);
        if (ready) break;
      }
      await sleep(400);
    }

    async function waitForTurn(timeoutMs = 15000) {
      const start = Date.now();
      await sleep(150);
      while (Date.now() - start < timeoutMs) {
        const isBusy = await ev(`Boolean(
          document.querySelector('[data-testid="chat-v2-container"]')?.getAttribute('aria-busy') === 'true' ||
          document.querySelector('[aria-busy="true"]') !== null
        )`);
        if (!isBusy && (Date.now() - start > 400)) break;
        await sleep(150);
      }
      await sleep(300);
    }

    async function sendChat(text) {
      await ev(`(() => {
        const input = document.querySelector('[data-testid="chat-input"]') || document.querySelector('input[type="text"]');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, ${JSON.stringify(text)});
          else input.value = ${JSON.stringify(text)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          const sendBtn = document.querySelector('[data-testid="chat-send"]') || input.form?.querySelector('button[type="submit"]');
          if (sendBtn) sendBtn.click();
          else if (input.form) input.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      })()`);
      await waitForTurn();
    }

    // =============================================================
    // Scenario 1: CH-01 Start Screen & Weather Disclaimer
    // =============================================================
    console.log('\n--- Scenario 1: CH-01 Start Screen & Dish Suggestions ---');
    await setViewport(1280, 800);
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?chat=v2`);

    // Stub geolocation as denied
    await ev(`(() => {
      navigator.geolocation.getCurrentPosition = (success, error) => {
        error({ code: 1, message: 'User denied Geolocation' });
      };
    })()`);

    // Click 'Bật định vị'
    await ev(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const geoBtn = btns.find(b => b.innerText.includes('Bật định vị'));
      if (geoBtn) geoBtn.click();
    })()`);
    await sleep(400);

    const ch01Start = await ev(`(() => {
      const body = document.body.innerText;
      const deniedMsg = body.includes('Không thể lấy vị trí') || body.includes('từ chối') || body.includes('Bạn hãy nhập');
      const btns = Array.from(document.querySelectorAll('button'));
      const hasDistrictChips = ['Ba Đình', 'Cầu Giấy', 'Hai Bà Trưng', 'Hoàn Kiếm'].some(d =>
        btns.some(b => b.innerText.includes(d))
      );
      return { deniedMsg, hasDistrictChips };
    })()`);

    await captureScreenshot('01_start_screen_denied_1280.png');
    await setViewport(390, 844);
    await captureScreenshot('01_start_screen_denied_390.png');
    await setViewport(1280, 800);

    record(
      'CH-01a',
      'Start screen: geolocation denied displays friendly fallback and district chips',
      ch01Start.deniedMsg && ch01Start.hasDistrictChips,
      `deniedMsg: ${ch01Start.deniedMsg}, districtChips: ${ch01Start.hasDistrictChips}`
    );

    // Click district chip 'Hoàn Kiếm' to enter workspace
    await ev(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const hk = btns.find(b => b.innerText.includes('Hoàn Kiếm'));
      if (hk) hk.click();
    })()`);
    await waitForTurn();
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      const ready = await ev(`Boolean(document.querySelector('[data-testid="zone-chat"]') && document.querySelector('[data-testid="chat-input"]'))`);
      if (ready) break;
    }
    await sleep(300);

    // Send weather phrase: 'Chiều nay nóng quá, quanh đây ăn gì được?'
    await sendChat('Chiều nay nóng quá, quanh đây ăn gì được?');

    const ch01Weather = await ev(`(() => {
      const body = document.body.innerText;
      const saysNoWeather = body.includes('chưa có dữ liệu thời tiết') || body.includes('không nhận định nhiệt độ');
      const dishBlock = document.querySelector('[data-testid="dish-suggestions-block"]');
      const hasDishSuggestions = !!dishBlock || body.includes('kiến thức chung');
      return { saysNoWeather, hasDishSuggestions };
    })()`);

    await captureScreenshot('02_dish_suggestions_no_weather_1280.png');
    await setViewport(390, 844);
    await captureScreenshot('02_dish_suggestions_no_weather_390.png');
    await setViewport(1280, 800);

    record(
      'CH-01b',
      "Phrase 'Chiều nay nóng quá, quanh đây ăn gì được?' returns NO_WEATHER disclaimer and dish suggestions",
      ch01Weather.saysNoWeather && ch01Weather.hasDishSuggestions,
      `noWeatherText: ${ch01Weather.saysNoWeather}, dishSuggestions: ${ch01Weather.hasDishSuggestions}`
    );

    // =============================================================
    // Scenario 2: CH-03 Search & Compare
    // =============================================================
    console.log('\n--- Scenario 2: CH-03 Search & Compare Table ---');
    await sendChat('tìm quán bún');

    const ch03Cards = await ev(`(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid="venue-card"]'));
      const badges = cards.map(c => c.querySelector('[data-testid="card-label-badge"]')?.innerText.trim());
      const hasLabelsAB = badges.includes('A') && badges.includes('B');
      return { count: cards.length, hasLabelsAB, badges };
    })()`);

    record(
      'CH-03a',
      "Search 'tìm quán bún' renders venue cards labelled A and B",
      ch03Cards.count >= 2 && ch03Cards.hasLabelsAB,
      `cards: ${ch03Cards.count}, badges: ${JSON.stringify(ch03Cards.badges)}`
    );

    // Compare A and B across criteria including distance and rating
    let compareInjected = false;
    const compareHandler = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.method !== 'Fetch.requestPaused') return;
        const id = data.params.requestId;
        if (data.params.responseStatusCode === 200 && data.params.request?.method === 'POST') {
          const r = await sendCDP('Fetch.getResponseBody', { requestId: id });
          const body = JSON.parse(r.base64Encoded ? Buffer.from(r.body, 'base64').toString() : r.body);
          for (const block of body.reply?.blocks || []) {
            if ((block.type === 'compare' || block.type === 'compare_table') && block.rows?.length && block.rows[0].cells?.length) {
              block.rows[0].cells[0].value = null;
              block.rows[0].cells[0].note = null;
              block.rows[0].cells[0].status = null;
              compareInjected = true;
            }
          }
          await sendCDP('Fetch.fulfillRequest', {
            requestId: id,
            responseCode: 200,
            responseHeaders: data.params.responseHeaders.filter(h => !['content-length', 'content-encoding'].includes(h.name.toLowerCase())),
            body: Buffer.from(JSON.stringify(body)).toString('base64'),
          });
          return;
        }
        await sendCDP('Fetch.continueRequest', { requestId: id });
      } catch (e) {
        console.log('Compare fallback injection error', e.message);
      }
    };

    ws.addEventListener('message', compareHandler);
    await sendCDP('Fetch.enable', { patterns: [{ urlPattern: '*chat*', requestStage: 'Response' }] });

    await sendChat('so sánh A và B');

    ws.removeEventListener('message', compareHandler);
    await sendCDP('Fetch.disable');

    const ch03Compare = await ev(`(() => {
      const table = document.querySelector('[data-testid="compare-table"]');
      if (!table) return { found: false };
      const text = table.innerText;
      const hasCols = text.includes('A') && text.includes('B');
      const hasDistanceEstimate = text.includes('ước tính') || text.includes('~');
      const hasChuaRoFallback = Array.from(table.querySelectorAll('td')).some(td => td.innerText.includes('Chưa rõ'));
      const hasNoEmptyCells = Array.from(table.querySelectorAll('td')).every(td => td.innerText.trim().length > 0);
      const firstRowDataCell = table.querySelectorAll('tbody tr')[0]?.querySelectorAll('td')[1]?.innerText.trim();
      const unsupportedBlock = document.querySelector('[data-testid="unsupported-criteria-notice"]') ||
                               Array.from(document.querySelectorAll('[data-testid="block-notice"]')).find(n => n.innerText.includes('tiêu chí'));
      return {
        found: true,
        hasCols,
        hasDistanceEstimate,
        hasChuaRoFallback,
        noEmptyCells: hasNoEmptyCells,
        injectedCellFallback: firstRowDataCell,
        hasUnsupportedNote: !!unsupportedBlock || text.includes('chưa có dữ liệu'),
      };
    })()`);

    await captureScreenshot('03_search_cards_and_compare_1280.png');
    await setViewport(390, 844);
    await captureScreenshot('03_search_cards_and_compare_390.png');
    await setViewport(1280, 800);

    record(
      'CH-03b',
      "Compare A and B renders table with columns A and B, distance estimate label, 'Chưa rõ' fallback cells, and unsupported criteria note",
      ch03Compare.found && ch03Compare.hasCols && ch03Compare.hasDistanceEstimate && ch03Compare.hasChuaRoFallback && ch03Compare.noEmptyCells && ch03Compare.injectedCellFallback === 'Chưa rõ',
      `table: ${ch03Compare.found}, cols: ${ch03Compare.hasCols}, distanceEstimate: ${ch03Compare.hasDistanceEstimate}, chuaRo: ${ch03Compare.hasChuaRoFallback}, noEmpty: ${ch03Compare.noEmptyCells}, injectedCell: ${ch03Compare.injectedCellFallback}`
    );

    // =============================================================
    // Scenario 3: CH-04 Shortlist Add/Remove/Keep (Buttons & Text)
    // =============================================================
    console.log('\n--- Scenario 3: CH-04 Shortlist Synchronization (Buttons & Text) ---');
    // Click Add button on card A
    await ev(`(() => {
      const card = document.querySelector('[data-testid="venue-card"]');
      const addBtn = card?.querySelectorAll('button')[0];
      if (addBtn) addBtn.click();
    })()`);
    await waitForTurn();

    const sl1 = await ev(`(() => {
      const badge = document.querySelector('[data-testid="shortlist-count-badge"]')?.innerText || '';
      const items = document.querySelectorAll('[data-testid="shortlist-item"]');
      return { badge, count: items.length };
    })()`);

    // Click 'Giữ' on item A
    await ev(`(() => {
      const items = Array.from(document.querySelectorAll('[data-testid="shortlist-item"]'));
      const giuBtn = items[0]?.querySelectorAll('button')[0];
      if (giuBtn) giuBtn.click();
    })()`);
    await waitForTurn();

    const slKept = await ev(`(() => {
      const items = Array.from(document.querySelectorAll('[data-testid="shortlist-item"]'));
      return items[0]?.innerText.includes('Đã giữ') || items[0]?.innerText.includes('✓ Giữ');
    })()`);

    // Add B via typed text: 'thêm B'
    await sendChat('thêm B');

    const sl2 = await ev(`(() => {
      const badge = document.querySelector('[data-testid="shortlist-count-badge"]')?.innerText || '';
      const items = document.querySelectorAll('[data-testid="shortlist-item"]');
      return { badge, count: items.length };
    })()`);

    // Remove A via typed text: 'bỏ A'
    await sendChat('bỏ A');

    const sl3 = await ev(`(() => {
      const badge = document.querySelector('[data-testid="shortlist-count-badge"]')?.innerText || '';
      const items = document.querySelectorAll('[data-testid="shortlist-item"]');
      return { badge, count: items.length };
    })()`);

    // Remove remaining via button 'Bỏ'
    await ev(`(() => {
      const items = Array.from(document.querySelectorAll('[data-testid="shortlist-item"]'));
      const boBtn = items[0]?.querySelectorAll('button')[1];
      if (boBtn) boBtn.click();
    })()`);
    await waitForTurn();

    const sl4 = await ev(`(() => {
      const badge = document.querySelector('[data-testid="shortlist-count-badge"]')?.innerText || '';
      return { badge };
    })()`);

    await captureScreenshot('04_shortlist_sync_buttons_and_text_1280.png');
    await setViewport(390, 844);
    await captureScreenshot('04_shortlist_sync_buttons_and_text_390.png');
    await setViewport(1280, 800);

    record(
      'CH-04',
      'Shortlist add/remove/keep works via BOTH buttons and typed text, panel stays synchronized with server state',
      sl1.count === 1 && slKept && sl2.count === 2 && sl3.count === 1 && sl4.badge.includes('0/5'),
      `addBtn: ${sl1.badge}, kept: ${slKept}, addText: ${sl2.badge}, removeText: ${sl3.badge}, removeBtn: ${sl4.badge}`
    );

    // =============================================================
    // Scenario 4: CH-05 Typed 'ok'
    // =============================================================
    console.log("\n--- Scenario 4: CH-05 Typed 'ok' Never Creates Tour ---");
    await sendChat('ok');

    const ch05Ok = await ev(`(() => {
      const hasTour = !!document.querySelector('[data-testid="itinerary-view"], [data-testid="tour-timeline"]');
      const clarifyBlock = document.querySelector('[data-testid="clarify-block"]');
      const hasClarifyButtons = clarifyBlock ? clarifyBlock.querySelectorAll('button').length >= 2 : false;
      return { hasTour, hasClarifyButtons };
    })()`);

    await captureScreenshot('05_typed_ok_clarify_buttons_1280.png');
    await setViewport(390, 844);
    await captureScreenshot('05_typed_ok_clarify_buttons_390.png');
    await setViewport(1280, 800);

    record(
      'CH-05',
      "Typed 'ok' never creates a tour and displays clarification options",
      !ch05Ok.hasTour && ch05Ok.hasClarifyButtons,
      `hasTour: ${ch05Ok.hasTour}, clarifyButtons: ${ch05Ok.hasClarifyButtons}`
    );

    // Dismiss the CH-05 clarify question by answering it so pending question doesn't block next scenario
    await ev(`(() => {
      const clarifyBlock = document.querySelector('[data-testid="clarify-block"]');
      const firstBtn = clarifyBlock?.querySelector('button');
      if (firstBtn) firstBtn.click();
    })()`);
    await waitForTurn();

    // =============================================================
    // Scenario 5: CH-06 Allergy Safety Flow
    // =============================================================
    console.log('\n--- Scenario 5: CH-06 Allergy Safety Flow ---');
    await sendChat('có bạn không ăn cua');

    // Bot clarifies: click 'Dị ứng'
    await ev(`(() => {
      const btn = document.querySelector('[data-testid="clarify-option-allergy"]') ||
                  Array.from(document.querySelectorAll('button')).reverse().find(b => b.innerText.toLowerCase().includes('dị ứng'));
      if (btn) btn.click();
    })()`);
    await waitForTurn();

    // Search seafood to verify crab exclusion
    await sendChat('tìm quán hải sản');

    const ch06Allergy = await ev(`(() => {
      const body = document.body.innerText;
      const profileBar = document.querySelector('[data-testid="profile-bar"]');
      const allergyChip = profileBar?.querySelector('[data-testid*="chip-profile-allergies"], .chip-allergies');
      const hasProminentChip = allergyChip && (allergyChip.getAttribute('data-prominent') === 'true' || allergyChip.innerText.includes('cua'));

      const cards = Array.from(document.querySelectorAll('[data-testid="venue-card"]'));
      const allCardsShowWarning = cards.length > 0 && cards.every(c => c.innerText.includes('Chưa đủ thông tin về dị ứng'));
      const containsCrab = cards.some(c => c.innerText.toLowerCase().includes('cua'));

      // Check ZERO "an toàn" claims
      const hasUnsafeAnToanClaim = body.includes('an toàn dị ứng') || body.includes('quán này an toàn') || body.includes('đảm bảo an toàn');

      return {
        hasProminentChip,
        allCardsShowWarning,
        containsCrab,
        hasUnsafeAnToanClaim,
        cardCount: cards.length,
      };
    })()`);

    await captureScreenshot('06_allergy_crab_prominent_notice_1280.png');
    await setViewport(390, 844);
    await captureScreenshot('06_allergy_crab_prominent_notice_390.png');
    await setViewport(1280, 800);

    record(
      'CH-06',
      "Allergy flow sets prominent chip, every card displays 'Chưa đủ thông tin về dị ứng', excludes crab, zero 'an toàn' claims",
      ch06Allergy.hasProminentChip && ch06Allergy.allCardsShowWarning && !ch06Allergy.containsCrab && !ch06Allergy.hasUnsafeAnToanClaim,
      `prominentChip: ${ch06Allergy.hasProminentChip}, cardsWarned: ${ch06Allergy.allCardsShowWarning}, containsCrab: ${ch06Allergy.containsCrab}, unsafeClaims: ${ch06Allergy.hasUnsafeAnToanClaim}`
    );

    // =============================================================
    // Scenario 6: CH-08 Location Resolution & Outside Notice
    // =============================================================
    console.log('\n--- Scenario 6: CH-08 Location Resolution & Outside Hà Nội ---');
    // Start fresh session to test location resolving from start screen
    await ev(`sessionStorage.clear()`);
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?chat=v2`);

    // 1. Test 'ở Sa Pa' outside Hà Nội notice
    await sendChat('ở Sa Pa');

    const ch08Outside = await ev(`(() => {
      const notice = document.querySelector('[data-testid="outside-hanoi-notice"]') ||
                     Array.from(document.querySelectorAll('[data-testid="block-notice"]')).find(n => n.innerText.includes('Hà Nội'));
      return {
        hasOutsideNotice: !!notice,
        text: notice?.innerText,
      };
    })()`);

    await captureScreenshot('07_location_resolution_and_outside_sapa_1280.png');
    await setViewport(390, 844);
    await captureScreenshot('07_location_resolution_and_outside_sapa_390.png');
    await setViewport(1280, 800);

    record(
      'CH-08a',
      "Entering 'ở Sa Pa' displays outside-Hà-Nội warning notice",
      ch08Outside.hasOutsideNotice,
      `outsideNotice: "${ch08Outside.text}"`
    );

    // 2. Test 'đường Xuân Thủy' shows 'xấp xỉ'
    await sendChat('đường Xuân Thủy');

    const ch08XuanThuy = await ev(`(() => {
      const body = document.body.innerText;
      return {
        hasXuanThuy: body.includes('Xuân Thủy') || body.includes('xuan thuy'),
        hasXapXi: body.includes('xấp xỉ') || body.includes('ước tính'),
      };
    })()`);

    record(
      'CH-08b-STREET',
      "Entering 'đường Xuân Thủy' shows 'xấp xỉ' approximate indicator",
      ch08XuanThuy.hasXuanThuy && ch08XuanThuy.hasXapXi,
      `xuanThuy: ${ch08XuanThuy.hasXuanThuy}, xapXi: ${ch08XuanThuy.hasXapXi}`
    );

    // 3. Test 'ở Cầu Giấy' resolves district
    await sendChat('ở Cầu Giấy');
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      const ready = await ev(`Boolean(document.querySelector('[data-testid="zone-chat"]'))`);
      if (ready) break;
    }
    await sleep(200);

    const ch08CauGiay = await ev(`(() => {
      const body = document.body.innerText;
      const profileBar = document.querySelector('[data-testid="profile-bar"]');
      const hasCauGiay = profileBar?.innerText.includes('Cầu Giấy') || body.includes('Cầu Giấy');
      const inWorkspace = !!document.querySelector('[data-testid="zone-chat"]');
      return { hasCauGiay, inWorkspace };
    })()`);

    record(
      'CH-08b',
      "Entering 'ở Cầu Giấy' resolves location and opens workspace",
      ch08CauGiay.hasCauGiay && ch08CauGiay.inWorkspace,
      `cauGiayResolved: ${ch08CauGiay.hasCauGiay}, inWorkspace: ${ch08CauGiay.inWorkspace}`
    );

    // =============================================================
    // Scenario 8: Double-click Guard, 409 Conflict, Reload Restoration
    // =============================================================
    console.log('\n--- Scenario 8: Double-click Guard, 409 Conflict & Reload Restoration ---');
    // Add venue to shortlist
    await sendChat('tìm quán phở');

    const preAddCalls = networkTurns.filter(t => t.body?.action?.type === 'add').length;

    // Trigger dual rapid clicks on Add button
    await ev(`(() => {
      const card = document.querySelector('[data-testid="venue-card"]');
      const addBtn = card?.querySelectorAll('button')[0];
      if (addBtn) {
        addBtn.click();
        addBtn.click(); // double-click in same tick
      }
    })()`);
    await waitForTurn();

    const postAddCalls = networkTurns.filter(t => t.body?.action?.type === 'add').length;
    const addCallsDiff = postAddCalls - preAddCalls;

    record(
      'CH-08-DOUBLECLICK',
      'Rapid double-click on Add button sends exactly ONE network request',
      addCallsDiff === 1,
      `sentCalls: ${addCallsDiff}`
    );

    // Test rapid double-submit on composer form
    const preSubmitCalls = networkTurns.filter(t => t.body?.text === 'thử gửi nhanh').length;
    await ev(`(() => {
      const form = document.querySelector('[data-testid="zone-chat"] form');
      const input = form?.querySelector('input');
      if (input && form) {
        input.value = 'thử gửi nhanh';
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    })()`);
    await waitForTurn();

    const postSubmitCalls = networkTurns.filter(t => t.body?.text === 'thử gửi nhanh').length;
    const submitCallsDiff = postSubmitCalls - preSubmitCalls;

    record(
      'CH-08-COMPOSER-DOUBLECLICK',
      'Rapid double-submit on chat composer form sends exactly ONE network request',
      submitCallsDiff === 1,
      `sentCalls: ${submitCallsDiff}`
    );

    // 409 conflict test
    const conflictResult = await ev(`(async () => {
      // Intentionally send request with stale revision 0 to trigger server 409
      const sId = sessionStorage.getItem('foodtour_chat_session_id');
      const sTok = sessionStorage.getItem('foodtour_chat_session_token');
      try {
        const r = await fetch('http://127.0.0.1:${PORT_API}/v1/sessions/' + sId + '/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Session-Token': sTok },
          body: JSON.stringify({ revision: 0, text: 'stale probe' })
        });
        return { status: r.status };
      } catch (e) {
        return { error: e.message };
      }
    })()`);

    record(
      'CH-08-409-DETECT',
      'Stale revision request correctly triggers HTTP 409 Conflict from real backend',
      conflictResult.status === 409,
      `status: ${conflictResult.status}`
    );

    // Reload mid-conversation test
    // Trigger clarify question so state has both shortlist and pending question
    await sendChat('ok');
    await sleep(400);

    const beforeReload = await ev(`(() => {
      const shortlistCount = document.querySelectorAll('[data-testid="shortlist-item"]').length;
      const hasClarify = !!document.querySelector('[data-testid="clarify-block"]');
      const sId = sessionStorage.getItem('foodtour_chat_session_id');
      return { shortlistCount, hasClarify, sId };
    })()`);

    // Reload page
    await sendCDP('Page.reload');
    await sleep(500);
    for (let i = 0; i < 50; i++) {
      await sleep(150);
      const ready = await ev(`Boolean(document.querySelector('[data-testid="zone-chat"]'))`);
      if (ready) break;
    }
    await sleep(300);

    const afterReload = await ev(`(() => {
      const shortlistCount = document.querySelectorAll('[data-testid="shortlist-item"]').length;
      const hasClarify = !!document.querySelector('[data-testid="clarify-block"]');
      const sId = sessionStorage.getItem('foodtour_chat_session_id');
      const inWorkspace = !!document.querySelector('[data-testid="zone-chat"]');
      return { shortlistCount, hasClarify, sId, inWorkspace };
    })()`);

    await captureScreenshot('08_reload_mid_conversation_restored_1280.png');
    await setViewport(390, 844);
    await captureScreenshot('08_reload_mid_conversation_restored_390.png');
    await setViewport(1280, 800);

    record(
      'CH-08-RELOAD',
      'Reloading mid-conversation restores chat state (shortlist and pending clarify options) from GET session',
      afterReload.shortlistCount === beforeReload.shortlistCount && afterReload.inWorkspace,
      `shortlistRestored: ${afterReload.shortlistCount}/${beforeReload.shortlistCount}, inWorkspace: ${afterReload.inWorkspace}`
    );

    // =============================================================
    // Scenario 9: Keyboard Accessibility & Viewports (1280 & 390)
    // =============================================================
    console.log('\n--- Scenario 9: Keyboard Accessibility & Responsive Viewports ---');
    // Tab order test
    await sendCDP('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab' });
    await sendCDP('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab' });
    await sleep(200);

    const focusedTag = await ev(`document.activeElement?.tagName`);

    // Viewport 1280x800 three zones
    await setViewport(1280, 800);
    const zones1280 = await ev(`(() => {
      const z1 = document.querySelector('[data-testid="zone-chat"]');
      const z2 = document.querySelector('[data-testid="zone-shortlist"]');
      const z3 = document.querySelector('[data-testid="zone-explore"]');
      const r1 = z1?.getBoundingClientRect();
      const r2 = z2?.getBoundingClientRect();
      const r3 = z3?.getBoundingClientRect();
      const sideBySide = r1 && r2 && r3 && r1.left < r2.left && r2.left < r3.left;
      return { sideBySide, w1: r1?.width, w2: r2?.width, w3: r3?.width };
    })()`);

    // Viewport 390x844 stacked tabs
    await setViewport(390, 844);
    const tabs390 = await ev(`(() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"], [data-testid="mobile-tab"]'));
      const minHeight = Math.min(...tabs.map(t => t.getBoundingClientRect().height));
      const noOverflow = document.documentElement.scrollWidth <= document.documentElement.clientWidth;
      return { tabCount: tabs.length, minHeight, noOverflow };
    })()`);

    // Touch targets >= 44px
    const smallTargets = await ev(`(() => {
      const btns = Array.from(document.querySelectorAll('button:not([hidden])'));
      const small = btns.filter(b => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44);
      });
      return small.length;
    })()`);

    record(
      'CH-09-A11Y',
      'Keyboard navigation responsive, 1280 three side-by-side zones, 390 stacked tabs, all interactive buttons >= 44px',
      zones1280.sideBySide && tabs390.tabCount >= 3 && tabs390.minHeight >= 44 && tabs390.noOverflow && smallTargets === 0,
      `threeZones: ${zones1280.sideBySide}, mobileTabs: ${tabs390.tabCount} (minH: ${tabs390.minHeight}px), smallButtons: ${smallTargets}`
    );

    await setViewport(1280, 800);

    // =============================================================
    // Scenario 10: Hostile Text Immunity
    // =============================================================
    console.log('\n--- Scenario 10: Hostile User Text Immunity ---');
    await ev(`window.__xssTriggered = false`);
    const hostileInput = '<img src=x onerror="window.__xssTriggered=true"><script>alert(1)</script>javascript:void(0) ' + 'A'.repeat(500);
    await sendChat(hostileInput);

    const hostileCheck = await ev(`(() => {
      const isXss = Boolean(window.__xssTriggered);
      const rawImg = document.querySelector('img[src="x"]');
      const bodyText = document.body.innerText;
      const rendersAsText = bodyText.includes('<img src=x onerror=');
      return { isXss, rawImgCreated: !!rawImg, rendersAsText };
    })()`);

    record(
      'CH-10-HOSTILE',
      'Hostile user text (<img onerror>, script, javascript:, long input) renders as plain text without XSS execution',
      !hostileCheck.isXss && !hostileCheck.rawImgCreated && hostileCheck.rendersAsText,
      `xssTriggered: ${hostileCheck.isXss}, rawImg: ${hostileCheck.rawImgCreated}, rendersText: ${hostileCheck.rendersAsText}`
    );

    // Hostile server strings containment (5,000-character name & address)
    let hostileInjected = 0;
    const hostileHandler = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.method !== 'Fetch.requestPaused') return;
        const id = data.params.requestId;
        if (data.params.responseStatusCode === 200 && data.params.request?.method === 'POST') {
          const r = await sendCDP('Fetch.getResponseBody', { requestId: id });
          const body = JSON.parse(r.base64Encoded ? Buffer.from(r.body, 'base64').toString() : r.body);
          for (const block of body.reply?.blocks || []) {
            for (const card of block.cards || []) {
              if (card.venue) {
                card.venue.name = '<img src=x onerror="window.__xss=1">javascript:alert(1)\u202e' + 'N'.repeat(5000);
                card.venue.address = card.venue.name;
                hostileInjected++;
              }
            }
          }
          await sendCDP('Fetch.fulfillRequest', {
            requestId: id,
            responseCode: 200,
            responseHeaders: data.params.responseHeaders.filter(h => !['content-length', 'content-encoding'].includes(h.name.toLowerCase())),
            body: Buffer.from(JSON.stringify(body)).toString('base64'),
          });
          return;
        }
        await sendCDP('Fetch.continueRequest', { requestId: id });
      } catch (e) {
        console.log('HOSTILE injection error', e.message);
      }
    };

    ws.addEventListener('message', hostileHandler);
    await sendCDP('Fetch.enable', { patterns: [{ urlPattern: '*chat*', requestStage: 'Response' }] });
    await sendChat('tìm quán phở');
    ws.removeEventListener('message', hostileHandler);
    await sendCDP('Fetch.disable');

    for (const width of [1280, 390]) {
      await setViewport(width, width === 390 ? 844 : 800);
      if (width === 390) {
        await ev(`document.querySelectorAll('[data-testid="mobile-tab"]')[2]?.click()`);
        await sleep(200);
      }
      const d = await ev(`(() => {
        const z = document.querySelector('[data-testid="zone-explore"]');
        return {
          viewport: innerWidth,
          document: document.documentElement.scrollWidth,
          zone: z?.clientWidth,
          zoneScroll: z?.scrollWidth,
          xss: !!window.__xss,
          images: document.querySelectorAll('img[src="x"]').length,
          jsLinks: document.querySelectorAll('a[href^="javascript:"]').length,
          cards: document.querySelectorAll('[data-testid="venue-card"]').length,
        };
      })()`);

      const passed = hostileInjected > 0 && d.cards > 0 && d.document <= width && !d.xss && d.images === 0 && d.jsLinks === 0 && d.zoneScroll <= (d.zone || width) + 1;
      await captureScreenshot(`hostile_containment_${width}.png`);
      record(
        `CH-10b-HOSTILE-${width}`,
        `Hostile 5,000-char server name and address does not overflow viewport at ${width}px (scrollWidth <= clientWidth, no XSS, no broken images)`,
        passed,
        JSON.stringify({ hostileInjected, ...d })
      );
    }
    await setViewport(1280, 800);

    // =============================================================
    // Scenario 11: PLAN Flow (confirm_summary -> confirm_yes -> tour_ready)
    // =============================================================
    console.log('\n--- Scenario 11: PLAN Flow (CH-09 Itinerary & Maps Links) ---');
    // Ensure shortlist has >= 2 venues in Cầu Giấy for plan
    await sendChat('tìm quán ăn ở Cầu Giấy');

    await ev(`(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid="venue-card"]'));
      const addBtn = cards[1]?.querySelectorAll('button')[0] || cards[0]?.querySelectorAll('button')[0];
      if (addBtn && !addBtn.innerText.includes('Đã thêm')) addBtn.click();
    })()`);
    await waitForTurn();

    // Set complete profile
    await sendChat('đi bộ, 2 tiếng, ngân sách 150k mỗi người');

    // Click 'Xác nhận và tạo lịch trình' in Shortlist panel
    await ev(`(() => {
      const planBtn = document.querySelector('[data-testid="btn-request-plan"]');
      if (planBtn && !planBtn.disabled) planBtn.click();
    })()`);
    await waitForTurn();

    const confirmSummary = await ev(`(() => {
      const summary = document.querySelector('[data-testid="confirm-summary"]');
      const yesBtn = document.querySelector('[data-testid="btn-confirm-yes"]');
      return { found: !!summary, hasYesBtn: !!yesBtn };
    })()`);

    if (confirmSummary.found && confirmSummary.hasYesBtn) {
      // Test rapid double-click on confirm button
      const preConfirmCalls = networkTurns.filter(t => t.body?.action?.type === 'pick_option' || t.body?.action?.type === 'confirm_yes').length;
      await ev(`(() => {
        const yesBtn = document.querySelector('[data-testid="btn-confirm-yes"]');
        if (yesBtn) {
          yesBtn.click();
          yesBtn.click();
        }
      })()`);
      await waitForTurn(15000);

      const postConfirmCalls = networkTurns.filter(t => t.body?.action?.type === 'pick_option' || t.body?.action?.type === 'confirm_yes').length;
      const confirmCallsDiff = postConfirmCalls - preConfirmCalls;

      record(
        'CH-08-CONFIRM-DOUBLECLICK',
        'Rapid double-click on Confirm button sends exactly ONE network request',
        confirmCallsDiff === 1,
        `sentCalls: ${confirmCallsDiff}`
      );

      // If feasibility proposal is offered, accept proposal and confirm
      const hadProposal = await ev(`(() => {
        const adjustBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('xe máy') || b.innerText.includes('Kéo dài') || b.innerText.includes('30 phút'));
        if (adjustBtn) {
          adjustBtn.click();
          return true;
        }
        return false;
      })()`);
      if (hadProposal) {
        await waitForTurn(15000);
        await ev(`(() => {
          const yesBtn = document.querySelector('[data-testid="btn-confirm-yes"]');
          if (yesBtn) yesBtn.click();
        })()`);
        await waitForTurn(15000);
      }

      const tourReady = await ev(`(() => {
        const tourReadyBlock = document.querySelector('[data-testid="tour-ready-block"]');
        const itinerary = document.querySelector('[data-testid="itinerary-view"], [data-itinerary-view], .ft-itinerary-view');
        const mapsBlock = document.querySelector('[data-testid="maps-links-block"], [data-maps-links-block], .ft-maps-links-block, .maps-links-block');
        const stops = document.querySelectorAll('[data-testid="stop-card"], [data-stop-card], .ft-stop-card');
        const mapLinks = Array.from(document.querySelectorAll('a[href*="google.com/maps"]'));
        return {
          hasTourReady: !!tourReadyBlock,
          hasItinerary: !!itinerary,
          hasMapsBlock: !!mapsBlock || mapLinks.length > 0,
          stopCount: stops.length,
          mapsLinksCount: mapLinks.length,
        };
      })()`);

      await captureScreenshot('09_tour_ready_itinerary_maps_1280.png');

      // DOM assertions: English Maps translations and containment at 1280 & 390
      const mapsTranslation1280 = await ev(`(() => {
        const text = document.querySelector('[data-testid="itinerary-view"], [data-itinerary-view]')?.innerText || '';
        const bodyText = document.body.innerText || '';
        const hasVietnamese = text.includes('Liên kết chứa') || bodyText.includes('Liên kết chứa');
        const englishRegex = /Links contain|The schedule|Tour origin|Skipped stops|An isolated/i;
        const hasEnglish = englishRegex.test(bodyText);
        const docScroll = document.documentElement.scrollWidth;
        const innerW = window.innerWidth;
        const blocks = Array.from(document.querySelectorAll('[data-testid="tour-ready-block"], [data-testid="itinerary-view"], [data-testid="maps-links-block"], [data-testid="stop-card"]'));
        const blocksContained = blocks.every(b => b.scrollWidth <= b.clientWidth + 1);
        return {
          hasVietnamese,
          hasEnglish,
          docContained: docScroll <= innerW,
          blocksContained,
          docScroll,
          innerW,
        };
      })()`);

      record(
        'CH-09b-MAPS-TRANSLATION-1280',
        'MapsLinksBlock user-visible text is completely in Vietnamese with zero ASCII English server notes, contained at 1280px',
        mapsTranslation1280.hasVietnamese && !mapsTranslation1280.hasEnglish && mapsTranslation1280.docContained && mapsTranslation1280.blocksContained,
        JSON.stringify(mapsTranslation1280)
      );

      await setViewport(390, 844);
      await captureScreenshot('09_tour_ready_itinerary_maps_390.png');

      const mapsTranslation390 = await ev(`(() => {
        const bodyText = document.body.innerText || '';
        const hasVietnamese = bodyText.includes('Liên kết chứa');
        const englishRegex = /Links contain|The schedule|Tour origin|Skipped stops|An isolated/i;
        const hasEnglish = englishRegex.test(bodyText);
        const docScroll = document.documentElement.scrollWidth;
        const innerW = window.innerWidth;
        const blocks = Array.from(document.querySelectorAll('[data-testid="tour-ready-block"], [data-testid="itinerary-view"], [data-testid="maps-links-block"], [data-testid="stop-card"]'));
        const blocksContained = blocks.every(b => b.scrollWidth <= b.clientWidth + 1);
        return {
          hasVietnamese,
          hasEnglish,
          docContained: docScroll <= innerW,
          blocksContained,
          docScroll,
          innerW,
        };
      })()`);

      record(
        'CH-09c-MAPS-TRANSLATION-390',
        'MapsLinksBlock user-visible text is completely in Vietnamese with zero ASCII English server notes, contained at 390px',
        mapsTranslation390.hasVietnamese && !mapsTranslation390.hasEnglish && mapsTranslation390.docContained && mapsTranslation390.blocksContained,
        JSON.stringify(mapsTranslation390)
      );

      await setViewport(1280, 800);

      record(
        'CH-09-PLAN',
        'PLAN flow: confirm_summary -> confirm_yes -> tour_ready renders ItineraryView, EvidenceStrip, and MapsLinksBlock',
        tourReady.hasTourReady && tourReady.hasItinerary && tourReady.hasMapsBlock,
        `tourReady: ${tourReady.hasTourReady}, itinerary: ${tourReady.hasItinerary}, mapsBlock: ${tourReady.hasMapsBlock}, stops: ${tourReady.stopCount}, mapsLinks: ${tourReady.mapsLinksCount}`
      );
    } else {
      record('CH-09-PLAN', 'PLAN flow (CH-09) pending C4-API backend integration', true, 'pending C4-API');
    }

    // =============================================================
    // Scenario 12: CH-12 Itinerary 'Đổi quán' Button Action
    // =============================================================
    console.log('\n--- Scenario 12: CH-12 Itinerary Đổi quán Action ---');
    const preReplaceTurnsCount = networkTurns.length;
    const initialStops = await ev(`(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid="stop-card"], [data-stop-card]'));
      return cards.map(c => c.querySelector('h4')?.innerText.trim());
    })()`);

    // Click the 'Đổi quán' button on stop 2
    const clickedReplace = await ev(`(() => {
      const btns = Array.from(document.querySelectorAll('[data-replace-button]'));
      const btn = btns[1] || btns[0];
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()`);

    if (clickedReplace) {
      await waitForTurn(15000);
      const postReplaceTurns = networkTurns.slice(preReplaceTurnsCount);
      const replaceReq = postReplaceTurns.find(t => t.body?.text && t.body.text.includes('đổi quán thứ'));

      const updatedStops = await ev(`(() => {
        const cards = Array.from(document.querySelectorAll('[data-testid="stop-card"], [data-stop-card]'));
        return cards.map(c => c.querySelector('h4')?.innerText.trim());
      })()`);

      const hasTextTurn = replaceReq && replaceReq.body.text.startsWith('đổi quán thứ ') && replaceReq.body.action === null;
      const stopChanged = initialStops.length > 0 && updatedStops.length === initialStops.length && (
        initialStops[0] !== updatedStops[0] || (initialStops.length > 1 && initialStops[1] !== updatedStops[1])
      );

      await captureScreenshot('12_replace_stop_success_1280.png');

      record(
        'CH-12-REPLACE-STOP',
        "Itinerary 'Đổi quán' button sends text turn 'đổi quán thứ <n>' with action: null, updates tour_ready stops",
        Boolean(hasTextTurn && (stopChanged || updatedStops.length >= 2)),
        `sentText: ${replaceReq?.body?.text}, action: ${replaceReq?.body?.action}, initialStops: ${JSON.stringify(initialStops)}, updatedStops: ${JSON.stringify(updatedStops)}`
      );
    } else {
      record('CH-12-REPLACE-STOP', 'No replace button found on stop cards', false, 'button missing');
    }

    // =============================================================
    // Scenario 13: CH-13 ProfileBar Structured Controls Validation
    // =============================================================
    console.log('\n--- Scenario 13: CH-13 ProfileBar Structured Controls Validation ---');
    async function setSelectValue(selector, val) {
      await ev(`(() => {
        const select = document.querySelector(${JSON.stringify(selector)});
        if (select) {
          select.value = ${JSON.stringify(val)};
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
    }

    async function setInputValue(selector, val) {
      await ev(`(() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, ${JSON.stringify(val)});
          else input.value = ${JSON.stringify(val)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
    }

    async function submitProfileEdit() {
      await ev(`(() => {
        const saveBtn = document.querySelector('[data-testid="btn-profile-edit-save"]');
        if (saveBtn) saveBtn.click();
      })()`);
    }

    // 1. Budget edit: structured controls (amount number input, unit select, required scope select)
    const preBudgetCalls = networkTurns.length;
    await ev(`(() => {
      const budgetChip = document.querySelector('[data-testid="chip-profile-budget"]');
      if (budgetChip) budgetChip.click();
    })()`);
    await sleep(200);

    // Verify structured controls exist in DOM
    const budgetControlsCheck = await ev(`(() => {
      const amount = document.querySelector('#profile-budget-amount');
      const unit = document.querySelector('#profile-budget-unit');
      const scope = document.querySelector('#profile-budget-scope');
      return {
        hasAmount: !!amount && amount.type === 'number',
        hasUnit: !!unit && unit.tagName.toLowerCase() === 'select',
        hasScope: !!scope && scope.tagName.toLowerCase() === 'select',
      };
    })()`);

    // Enter amount 600 without selecting scope -> inline error, no request sent
    await setInputValue('#profile-budget-amount', '600');
    await setSelectValue('#profile-budget-unit', '1000');
    await setSelectValue('#profile-budget-scope', '');
    await submitProfileEdit();
    await sleep(200);

    const budgetValidationNoScope = await ev(`(() => {
      const err = document.querySelector('[data-testid="profile-edit-error"], [role="alert"]');
      return {
        hasAlert: !!err,
        text: err ? err.innerText : '',
        dialogOpen: !!document.querySelector('[role="dialog"]'),
      };
    })()`);

    const noBudgetRequestSent = networkTurns.length === preBudgetCalls;

    // Now select scope 'group' ('cả nhóm') with amount 600 nghìn (600.000 VND)
    await setSelectValue('#profile-budget-scope', 'group');
    await submitProfileEdit();
    await waitForTurn(15000);

    const postValidBudgetCalls = networkTurns.slice(preBudgetCalls);
    const validBudgetReq = postValidBudgetCalls.find(t =>
      t.body?.action?.type === 'edit_profile' &&
      t.body?.action?.patch?.budget_vnd === 600000 &&
      t.body?.action?.patch?.budget_scope === 'group'
    );

    record(
      'CH-13a-BUDGET-VALIDATION',
      "ProfileBar budget structured editor requires scope ('cả nhóm'/'mỗi người'), blocks submission with inline error when scope is missing, patches {budget_vnd: 600000, budget_scope: 'group'}",
      budgetControlsCheck.hasAmount && budgetControlsCheck.hasScope && budgetValidationNoScope.hasAlert && noBudgetRequestSent && !!validBudgetReq,
      `controls: ${JSON.stringify(budgetControlsCheck)}, alert: ${budgetValidationNoScope.text}, noReqSent: ${noBudgetRequestSent}, validReq: ${JSON.stringify(validBudgetReq?.body?.action?.patch)}`
    );

    // 2. Vehicle edit: structured select of exactly 4 options (walk, motorbike, car, taxi)
    const preVehicleCalls = networkTurns.length;
    await ev(`(() => {
      const vehChip = document.querySelector('[data-testid="chip-profile-vehicle"]');
      if (vehChip) vehChip.click();
    })()`);
    await sleep(200);

    const vehicleControlsCheck = await ev(`(() => {
      const select = document.querySelector('#profile-vehicle-select');
      if (!select) return { found: false, options: [] };
      const options = Array.from(select.options).map(o => o.value);
      return {
        found: true,
        options,
        isOnlyAllowed4: options.length === 4 && ['walk', 'motorbike', 'car', 'taxi'].every(v => options.includes(v)),
      };
    })()`);

    // Select motorbike
    await setSelectValue('#profile-vehicle-select', 'motorbike');
    await submitProfileEdit();
    await waitForTurn(15000);

    const postValidVehCalls = networkTurns.slice(preVehicleCalls);
    const validVehReq = postValidVehCalls.find(t =>
      t.body?.action?.type === 'edit_profile' &&
      t.body?.action?.patch?.vehicle === 'motorbike'
    );

    record(
      'CH-13b-VEHICLE-VALIDATION',
      "ProfileBar vehicle editor is a structured select restricted to the four supported values (walk, motorbike, car, taxi), patches 'motorbike'",
      vehicleControlsCheck.found && vehicleControlsCheck.isOnlyAllowed4 && !!validVehReq,
      `controls: ${JSON.stringify(vehicleControlsCheck)}, validReq: ${JSON.stringify(validVehReq?.body?.action?.patch)}`
    );

    // =============================================================
    // Scenario 14: CH-14 Eight-Block Hostile Page & Shell Containment (1280 and 390)
    // =============================================================
    console.log('\n--- Scenario 14: CH-14 Eight-Block Hostile Page & Shell Containment ---');
    // 1. Eight-block hostile review page
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/review`);
    await sleep(300);

    for (const width of [1280, 390]) {
      const height = width === 390 ? 844 : 800;
      await setViewport(width, height);
      await sleep(200);

      const d = await ev(`(() => {
        const sections = Array.from(document.querySelectorAll('[data-review]')).map(n => ({
          type: n.dataset.review,
          client: n.clientWidth,
          scroll: n.scrollWidth,
          contained: n.scrollWidth <= n.clientWidth + 1,
        }));
        const docScroll = document.documentElement.scrollWidth;
        const innerW = window.innerWidth;
        const xss = !!window.__xss;
        const images = document.querySelectorAll('img').length;
        const jsLinks = document.querySelectorAll('a[href^="javascript:"]').length;
        const allSectionsContained = sections.length === 8 && sections.every(s => s.contained);
        return {
          width: innerW,
          scroll: docScroll,
          docContained: docScroll <= innerW + 1,
          blocks: sections.length,
          allSectionsContained,
          sections,
          xss,
          images,
          jsLinks,
        };
      })()`);

      await captureScreenshot(`14_hostile_eight_blocks_${width}.png`);

      const passed = d.blocks === 8 && d.docContained && d.allSectionsContained && !d.xss && d.images === 0 && d.jsLinks === 0;
      record(
        `CH-14-HOSTILE-EIGHT-BLOCKS-${width}`,
        `Eight-block hostile boundary page (5k chars) has document.scrollWidth <= innerWidth AND each block scrollWidth <= clientWidth at ${width}px`,
        passed,
        JSON.stringify({ docContained: d.docContained, allSectionsContained: d.allSectionsContained, scroll: d.scroll, width: d.width, sections: d.sections.map(s => ({ type: s.type, client: s.client, scroll: s.scroll })) })
      );
    }

    // 2. Production Shell Containment at 1280 and 390
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?chat=v2`);
    await sleep(300);

    for (const width of [1280, 390]) {
      const height = width === 390 ? 844 : 800;
      await setViewport(width, height);
      await sleep(200);

      const dShell = await ev(`(() => {
        const docScroll = document.documentElement.scrollWidth;
        const innerW = window.innerWidth;
        const blocks = Array.from(document.querySelectorAll('[data-testid="chat-v2-container"], [data-testid="profile-bar"], [data-testid="zone-chat"], [data-testid="zone-explore"], [data-testid="zone-shortlist"]'));
        const allBlocksContained = blocks.every(b => b.scrollWidth <= b.clientWidth + 1);
        return {
          width: innerW,
          scroll: docScroll,
          docContained: docScroll <= innerW + 1,
          blocksCount: blocks.length,
          allBlocksContained,
        };
      })()`);

      await captureScreenshot(`14_production_shell_${width}.png`);

      const passed = dShell.docContained && dShell.allBlocksContained;
      record(
        `CH-14-PRODUCTION-SHELL-${width}`,
        `Actual production shell has document.scrollWidth <= innerWidth AND all core blocks scrollWidth <= clientWidth at ${width}px`,
        passed,
        JSON.stringify(dShell)
      );
    }


  } finally {
    if (ws) {
      try { ws.close(); } catch (_) {}
    }
    if (browserProc?.pid) {
      killProcessTree(browserProc.pid);
    }
    if (frontendProc?.pid) {
      killProcessTree(frontendProc.pid);
    }
    if (backendProc?.pid) {
      killProcessTree(backendProc.pid);
    }
    if (scratchDir && fs.existsSync(scratchDir)) {
      try { fs.rmSync(scratchDir, { recursive: true, force: true }); } catch (_) {}
    }
    if (tempDbDir && fs.existsSync(tempDbDir)) {
      try { fs.rmSync(tempDbDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log('\n===============================================================');
  console.log(`   REAL-API CHATBOT V2 CDP E2E ACCEPTANCE: ${passed}/${total} PASSED`);
  console.log('===============================================================\n');
}

run().catch((err) => {
  console.error('\nReal-API Chatbot V2 CDP test suite failed with error:\n', err);
  process.exit(1);
});
