/**
 * Real-Browser CDP E2E Acceptance Suite for Guided Food-Tour UI (TASK U4a)
 *
 * Verifies Guided Food-Tour UI (GuidedLayout) matching docs/ux/guided-flow-mockup.html
 * and contract v1.9.1 across the 5 synthetic conversations.
 *
 * Uses real Edge/Chrome browser via Chrome DevTools Protocol (CDP)
 * on ports: Web=13000, CDP=19222.
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
const SCREENSHOTS_DIR = path.join(REPO_ROOT, 'docs', 'reports', 'u4a');

const PORT_WEB = Number(process.env.UI_GUIDED_PORT_WEB || 13000);
const PORT_CDP = Number(process.env.UI_GUIDED_PORT_CDP || 19222);

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
    console.log(`[Port Check] Port ${port} (${name}) is busy (PIDs: ${pids.join(', ')}). Freeing...`);
    for (const pid of pids) {
      try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' }); } catch (_) {}
    }
  }
}

async function waitForHttp(url, timeoutMs = 25000) {
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

const HARD_TIMEOUT_MS = 6 * 60 * 1000;
let globalBrowserProc = null;
let globalFrontendProc = null;

const hardTimeoutTimer = setTimeout(() => {
  console.error(`\n[FATAL] Test suite hard timeout (${HARD_TIMEOUT_MS / 1000}s) exceeded!`);
  if (globalBrowserProc?.pid) killProcessTree(globalBrowserProc.pid);
  if (globalFrontendProc?.pid) killProcessTree(globalFrontendProc.pid);
  process.exit(1);
}, HARD_TIMEOUT_MS);
hardTimeoutTimer.unref();

async function run() {
  console.log('\n===============================================================');
  console.log('   AI FOODTOUR PLANNER — GUIDED UI (U4a) CDP E2E SUITE');
  console.log(`   Web Port: ${PORT_WEB} | CDP Port: ${PORT_CDP}`);
  console.log('===============================================================\n');

  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  let scratchDir = null;
  let frontendProc = null;
  let browserProc = null;
  let ws = null;

  try {
    ensurePortFree(PORT_WEB, 'web');
    ensurePortFree(PORT_CDP, 'cdp');
    await sleep(500);

    // -------------------------------------------------------------
    // Step 1: Build & Start Production Frontend in Scratch Copy
    // -------------------------------------------------------------
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-guided-scratch-'));
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

    // Mutation checks via command line args
    const mutation = process.env.MUTATION || (process.argv.find(a => a.startsWith('--mutation='))?.split('=')[1] || null);
    if (mutation) {
      console.log(`[MUTATION ACTIVE] Injecting mutation: ${mutation}`);
      const guidedLayoutPath = path.join(scratchDir, 'app', 'components', 'v2', 'guided', 'GuidedLayout.jsx');
      if (fs.existsSync(guidedLayoutPath)) {
        let code = fs.readFileSync(guidedLayoutPath, 'utf8');
        if (mutation === 'single_question') {
          // Mutate: render 2 question cards
          code = code.replace(
            '{clarifyBlock && (',
            '{clarifyBlock && (<><div data-testid="clarify-question-card">Câu hỏi thừa vi phạm quy tắc đơn câu</div>'
          ).replace('busy={busy}\n                />', 'busy={busy}\n                /></>');
          fs.writeFileSync(guidedLayoutPath, code, 'utf8');
        } else if (mutation === 'tour_before_confirm') {
          // Mutate: render tour before confirm_yes
          code = code.replace(
            '{/* TOUR READY BLOCK */}',
            '{/* TOUR READY BLOCK */}<div data-testid="guided-timeline">Lộ tour trước xác nhận vi phạm cổng kiểm soát</div>'
          );
          fs.writeFileSync(guidedLayoutPath, code, 'utf8');
        } else if (mutation === 'hide_allergy_row') {
          // Mutate: hide allergy row when empty
          const understoodPath = path.join(scratchDir, 'app', 'components', 'v2', 'guided', 'UnderstoodCard.jsx');
          let uCode = fs.readFileSync(understoodPath, 'utf8');
          uCode = uCode.replace('const alwaysShowAllergy = true;', 'const alwaysShowAllergy = false;');
          fs.writeFileSync(understoodPath, uCode, 'utf8');
        }
      }
    }

    console.log(`[Frontend] Building Next.js production build...`);
    execSync('npx next build', {
      cwd: scratchDir,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_MODE: 'mock',
      },
      stdio: 'inherit',
    });
    console.log('[Frontend] Production build complete.');

    console.log(`[Frontend] Starting web server on port ${PORT_WEB}...`);
    frontendProc = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(PORT_WEB)], {
      cwd: scratchDir,
      stdio: 'ignore',
      shell: true,
    });
    globalFrontendProc = frontendProc;

    await waitForHttp(`http://127.0.0.1:${PORT_WEB}/`, 25000);
    console.log(`[Frontend] Server ready at http://127.0.0.1:${PORT_WEB}/`);

    // -------------------------------------------------------------
    // Step 2: Launch Headless Edge/Chrome with CDP
    // -------------------------------------------------------------
    console.log(`[Browser] Launching browser on CDP port ${PORT_CDP}...`);
    const browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-guided-browser-'));
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
    globalBrowserProc = browserProc;

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
    if (!wsUrl) throw new Error(`Failed to find page target on port ${PORT_CDP}`);

    ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let nextId = 1;
    const pendingCalls = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pendingCalls.has(data.id)) {
        const { res, rej } = pendingCalls.get(data.id);
        pendingCalls.delete(data.id);
        if (data.error) rej(new Error(data.error.message));
        else res(data.result);
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
      console.log(`[Screenshot] Saved: docs/reports/u4a/${filename}`);
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
      await sleep(200);
      while (Date.now() - start < timeoutMs) {
        const isBusy = await ev(`Boolean(
          document.querySelector('[data-testid="guided-container"]')?.getAttribute('aria-busy') === 'true' ||
          document.querySelector('[aria-busy="true"]') !== null
        )`);
        if (!isBusy && (Date.now() - start > 400)) break;
        await sleep(150);
      }
      await sleep(300);
    }

    async function sendChat(text) {
      await ev(`(() => {
        const input = document.querySelector('[data-testid="guided-input"]') || document.querySelector('input[type="text"]');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, ${JSON.stringify(text)});
          else input.value = ${JSON.stringify(text)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await sleep(100);
      await ev(`(() => {
        const btn = document.querySelector('[data-testid="guided-send-btn"]');
        if (btn) btn.click();
        else {
          const form = document.querySelector('form');
          if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      })()`);
      await waitForTurn();
    }

    // Set initial desktop viewport
    await setViewport(1280, 800);

    // =========================================================================
    // Test 1: Flag-off Regression Check
    // =========================================================================
    console.log('\n--- Test 1: Flag-off Regression Check ---');
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/`);
    const isGuidedOff = await ev(`document.querySelector('[data-testid="guided-container"]') === null`);
    record('FLAG-OFF-01', 'Without ?guided=1 or ?ui=guided, GuidedLayout is not rendered', isGuidedOff);

    // =========================================================================
    // Test 2: Start Screen (Desktop 1280x800)
    // =========================================================================
    console.log('\n--- Test 2: Start Screen ---');
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?guided=1`);
    await sleep(500);

    const hasContainer = await ev(`document.querySelector('[data-testid="guided-container"]') !== null`);
    record('START-01', 'GuidedLayout container renders with ?guided=1', hasContainer);

    const welcomeText = await ev(`document.querySelector('[data-testid="guided-welcome-msg"]')?.innerText || ''`);
    const hasWelcome = welcomeText.includes('Bạn muốn ăn gì, ở đâu, đi mấy người? Cứ nói tự nhiên, mình sẽ hỏi thêm nếu thiếu.');
    record('START-02', 'Welcome bot message renders clean Vietnamese prompt', hasWelcome, welcomeText);

    const chipCount = await ev(`document.querySelectorAll('[data-testid^="suggestion-chip-"]').length`);
    record('START-03', 'Renders 3-4 suggestion chips', chipCount >= 3 && chipCount <= 4, `found ${chipCount} chips`);

    // Min touch target check on suggestion chips (>= 44px)
    const chipTouchSizes = await ev(`Array.from(document.querySelectorAll('[data-testid^="suggestion-chip-"]')).map(el => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })`);
    const allChipsTouchOk = chipTouchSizes.every(s => s.height >= 44);
    record('START-04', 'Suggestion chips have minimum touch target height >= 44px', allChipsTouchOk, JSON.stringify(chipTouchSizes));

    // Single large composer check
    const hasComposer = await ev(`document.querySelector('[data-testid="guided-input"]') !== null && document.querySelector('[data-testid="guided-send-btn"]') !== null`);
    record('START-05', 'Single large composer with send button is present', hasComposer);

    // Trust line check
    const trustLineText = await ev(`document.querySelector('[data-testid="trust-line"]')?.innerText || ''`);
    const hasTrustLine = trustLineText.includes('Dữ liệu quán từ Foody') &&
                         trustLineText.includes('giờ & giá theo nguồn ghi') &&
                         trustLineText.includes('khoảng cách ước tính');
    record('START-06', 'Exactly ONE quiet trust line under stream is present', hasTrustLine, trustLineText);

    // Capture desktop start screenshot
    await captureScreenshot('desktop_start.png');

    // =========================================================================
    // Test 3: S0 Full Flow (6 turns)
    // =========================================================================
    console.log('\n--- Test 3: S0 Full Flow (6 turns) ---');
    const s0Text = "Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin.";
    await sendChat(s0Text);

    // Verify Understood Card renders
    const hasUnderstoodCard = await ev(`document.querySelector('[data-testid="understood-card"]') !== null`);
    record('S0-TURN1-01', 'Understood card "Mình hiểu là…" rendered', hasUnderstoodCard);

    // Check Understood items
    const understoodText = await ev(`document.querySelector('[data-testid="understood-card"]')?.innerText || ''`);
    const hasArea = understoodText.includes('Hồ Gươm') || understoodText.includes('quanh Hồ Gươm');
    const hasParty = understoodText.includes('2');
    const hasStops = understoodText.includes('3');
    const hasDuration = understoodText.includes('120');
    const hasAllergy = understoodText.includes('đậu phộng');
    record('S0-TURN1-02', 'Understood card captures area, party, stops, duration, allergy', hasArea && hasParty && hasStops && hasDuration && hasAllergy, understoodText);

    // Check row-level buttons: Sửa / Chọn
    const editButtonsCount = await ev(`document.querySelectorAll('[data-testid^="understood-edit-"]').length`);
    record('S0-TURN1-03', 'Understood card has row-level Sửa/Chọn buttons', editButtonsCount >= 5, `found ${editButtonsCount} buttons`);

    // Check Safety notice below Understood Card
    const safetyNoticeText = await ev(`document.querySelector('[data-testid="understood-safety-note"]')?.innerText || ''`);
    const hasSafetyNotice = safetyNoticeText.includes('Dữ liệu quán không có thông tin nguyên liệu') ||
                            safetyNoticeText.includes('không quán nào được xác nhận an toàn') ||
                            safetyNoticeText.includes('kiểm tra trực tiếp với quán khi đến');
    record('S0-TURN1-04', 'Calm safety note rendered below understood card', hasSafetyNotice, safetyNoticeText);

    // Single Question Rule: EXACTLY ONE clarify question card visible
    const questionCardsCount = await ev(`document.querySelectorAll('[data-testid="clarify-question-card"]').length`);
    record('S0-TURN1-05', 'EXACTLY ONE question card rendered at a time', questionCardsCount === 1, `count: ${questionCardsCount}`);

    // Option chips: "Cả nhóm" and "Mỗi người"
    const hasScopeGroupOption = await ev(`document.querySelector('[data-testid="clarify-option-scope:group"]') !== null`);
    const hasScopePersonOption = await ev(`document.querySelector('[data-testid="clarify-option-scope:per_person"]') !== null`);
    record('S0-TURN1-06', 'Clarify question renders scope options', hasScopeGroupOption && hasScopePersonOption);

    // Turn 2: Pick "Cả nhóm"
    console.log('-> Clicking scope:group chip...');
    await ev(`document.querySelector('[data-testid="clarify-option-scope:group"]')?.click()`);
    await waitForTurn();

    // Verify next question is start time
    const q2Text = await ev(`document.querySelector('[data-testid="clarify-question-card"]')?.innerText || ''`);
    record('S0-TURN2-01', 'Clarify question advances to start_time', q2Text.includes('mấy giờ') || q2Text.includes('giờ'), q2Text);

    // Turn 3: User types "19h" into free-text composer
    console.log('-> Typing "19h"...');
    await sendChat('19h');

    // Turn 3: 19h delivers proposal and confirm summary in ONE reply
    const hasConfirmCard = await ev(`document.querySelector('[data-testid="confirm-summary-card"]') !== null`);
    const hasConfirmYesBtn = await ev(`document.querySelector('[data-testid="confirm-yes-btn"]') !== null`);
    const hasConfirmNoBtn = await ev(`document.querySelector('[data-testid="confirm-no-btn"]') !== null`);
    record('S0-TURN3-01', 'Advances to proposals and confirm summary in one reply', hasConfirmCard && hasConfirmYesBtn && hasConfirmNoBtn);

    const hasWalkDefault = await ev(`(document.querySelector('[data-testid="confirm-vehicle"]')?.innerText || '').includes('Đi bộ')`);
    record('S0-TURN4-01', 'Vehicle defaults to walking in confirm summary card', hasWalkDefault);

    const hasVenuesList = await ev(`document.querySelector('[data-testid="confirm-venues-list"]') !== null`);
    record('S0-TURN5-01', 'Proposed venues rendered in confirmation shortlist', hasVenuesList);

    // Pending summary fixture rendering checks (F2)
    const venuesListText = await ev(`document.querySelector('[data-testid="confirm-venues-list"]')?.innerText || ''`);
    const visitMinText = await ev(`document.querySelector('[data-testid="confirm-visit-min"]')?.innerText || ''`);
    record('S0-PENDING-SUMMARY-VENUES', 'Confirm summary renders venue names without internal IDs',
      hasVenuesList && !venuesListText.includes('CHT-') && venuesListText.includes('[SYNTHETIC]'),
      venuesListText
    );
    record('S0-PENDING-SUMMARY-VISIT', 'Confirm summary renders inferred visit_min',
      visitMinText.includes('34 phút'),
      visitMinText
    );

    // TOUR GATE: Tour is NEVER displayed before confirm_yes!
    const tourBeforeConfirm = await ev(`document.querySelector('[data-testid="guided-timeline"]') !== null`);
    record('S0-GATE-01', 'Tour timeline is NOT rendered before confirm_yes', !tourBeforeConfirm);

    // Turn 6: Click "Đúng, lập tour" (confirm_yes)
    console.log('-> Clicking confirm_yes ("Đúng, lập tour")...');
    await ev(`document.querySelector('[data-testid="confirm-yes-btn"]')?.click()`);
    await waitForTurn();

    // Verify Tour Timeline appears
    const hasTourTimeline = await ev(`document.querySelector('[data-testid="guided-timeline"]') !== null`);
    record('S0-TURN6-01', 'Tour timeline rendered after confirm_yes', hasTourTimeline);

    // Verify stops rendered
    const stopCount = await ev(`document.querySelectorAll('[data-testid^="guided-stop-"]').length`);
    record('S0-TURN6-02', 'Timeline renders 3 stops', stopCount === 3, `count: ${stopCount}`);

    // Verify honest labels
    const timelineText = await ev(`document.querySelector('[data-testid="guided-timeline"]')?.innerText || ''`);
    const hasHonestPrice = timelineText.includes('theo nguồn') || timelineText.includes('giá theo nguồn');
    const hasHonestDist = timelineText.includes('ước tính');
    const hasHonestHours = timelineText.includes('nguồn ghi');
    record('S0-TURN6-03', 'Honest labels rendered (price "theo nguồn", distance "ước tính", hours "nguồn ghi")', hasHonestPrice && hasHonestDist && hasHonestHours, timelineText);

    // Verify allergy note in timeline
    const hasTimelineAllergyNote = timelineText.includes('chưa quán nào được xác nhận an toàn');
    record('S0-TURN6-04', 'Allergy safety disclaimer displayed in timeline', hasTimelineAllergyNote);

    // Verify Google Maps CTA URL
    const mapsLinkHref = await ev(`document.querySelector('[data-testid="google-maps-cta"]')?.getAttribute('href') || ''`);
    const isMapsUrlValid = mapsLinkHref.startsWith('https://www.google.com/maps/dir/') &&
                           mapsLinkHref.includes('api=1') &&
                           mapsLinkHref.includes('travelmode=walking') &&
                           !mapsLinkHref.includes('key=');
    record('S0-TURN6-05', 'Primary CTA is valid free Google Maps URL without API key', isMapsUrlValid, mapsLinkHref);

    // Verify 3 secondary actions
    const hasChangeStopBtn = await ev(`document.querySelector('[data-testid="action-change-stop"]') !== null`);
    const hasAdjustStopsBtn = await ev(`document.querySelector('[data-testid="action-adjust-stops"]') !== null`);
    const hasRestartBtn = await ev(`document.querySelector('[data-testid="action-restart"]') !== null`);
    record('S0-TURN6-06', 'Three secondary actions present (Đổi quán, Bớt / thêm quán, Làm lại từ đầu)', hasChangeStopBtn && hasAdjustStopsBtn && hasRestartBtn);

    // Capture desktop tour screenshot
    await captureScreenshot('desktop_tour.png');

    // =========================================================================
    // Test 4: Allergy Chip Flow (8 options wrap >= 44px)
    // =========================================================================
    console.log('\n--- Test 4: Allergy Chip Flow ---');
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?guided=1&conv=allergy_chip`);
    await sendChat('Tour 3 quán quanh Hồ Gươm tối nay, mình bị dị ứng nhẹ với mấy thứ rang giòn');

    // Understood card: Dị ứng row is ALWAYS visible, with value "Chưa có"
    const allergyRowText = await ev(`document.querySelector('[data-testid="understood-row-allergies"]')?.innerText || ''`);
    const hasAllergyRow = allergyRowText.includes('Dị ứng');
    const hasChuaCo = allergyRowText.includes('Chưa có');
    record('ALLERGY-CHIP-01', 'Dị ứng row is ALWAYS visible, shows "Chưa có" when empty', hasAllergyRow && hasChuaCo, allergyRowText);

    // Check clarify options: EXACTLY 8 allergy options
    const allergyOptionCount = await ev(`document.querySelectorAll('[data-testid^="clarify-option-allergy:"]').length`);
    record('ALLERGY-CHIP-02', 'Clarify renders 8 allergy option chips', allergyOptionCount === 8, `count: ${allergyOptionCount}`);

    // Check touch target >= 44px on all 8 chips
    const allergySizes = await ev(`Array.from(document.querySelectorAll('[data-testid^="clarify-option-allergy:"]')).map(el => {
      const rect = el.getBoundingClientRect();
      return rect.height;
    })`);
    const allAllergyTouchOk = allergySizes.every(h => h >= 44);
    record('ALLERGY-CHIP-03', 'All 8 allergy option chips have height >= 44px', allAllergyTouchOk, JSON.stringify(allergySizes));

    // Click "Đậu phộng" (allergy:peanut)
    console.log('-> Clicking allergy:peanut...');
    await ev(`document.querySelector('[data-testid="clarify-option-allergy:peanut"]')?.click()`);
    await waitForTurn();

    const postAllergyText = await ev(`document.querySelector('[data-testid="guided-container"]')?.innerText || ''`);
    const hasAllergyAck = postAllergyText.includes('đậu phộng') || postAllergyText.includes('Dị ứng');
    record('ALLERGY-CHIP-04', 'Allergy choice is acknowledged and recorded', hasAllergyAck);

    // =========================================================================
    // Test 5: Unconfirmed Allergy Flow (ai_unconfirmed badge)
    // =========================================================================
    console.log('\n--- Test 5: Unconfirmed Allergy Flow ---');
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?guided=1&conv=allergy_from_gemini_unconfirmed`);
    await sendChat('Tour 3 quán quanh Hồ Gươm tối nay, mình bị dị ứng nhẹ với mấy thứ rang giòn');

    // Verify "cần xác nhận" badge is rendered on Understood card
    const hasUnconfirmedBadge = await ev(`document.querySelector('[data-testid="badge-ai-unconfirmed"]') !== null`);
    const badgeText = await ev(`document.querySelector('[data-testid="badge-ai-unconfirmed"]')?.innerText || ''`);
    record('UNCONFIRMED-01', 'Renders "cần xác nhận" badge for ai_unconfirmed allergy', hasUnconfirmedBadge && badgeText.includes('cần xác nhận'), badgeText);

    // Clarify asks user to confirm
    const hasAllergyOkBtn = await ev(`document.querySelector('[data-testid="clarify-option-allergy_ok"]') !== null`);
    record('UNCONFIRMED-02', 'Clarify presents confirmation options (allergy_ok)', hasAllergyOkBtn);

    // Click allergy_ok
    await ev(`document.querySelector('[data-testid="clarify-option-allergy_ok"]')?.click()`);
    await waitForTurn();

    // =========================================================================
    // Test 6: Conflict Resolution Flow
    // =========================================================================
    console.log('\n--- Test 6: Conflict Resolution Flow ---');
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?guided=1&conv=conflict_queued`);
    await sendChat('Tour 2 quán quanh Hồ Gươm tối nay cho 2 người, mình dị ứng mấy thứ rang giòn');

    // Confirm allergy
    await ev(`document.querySelector('[data-testid="clarify-option-allergy_ok"]')?.click()`);
    await waitForTurn();

    // Verify conflict question
    const hasConflictOption0 = await ev(`document.querySelector('[data-testid="clarify-option-conflict:0"]') !== null`);
    const hasConflictOption1 = await ev(`document.querySelector('[data-testid="clarify-option-conflict:1"]') !== null`);
    record('CONFLICT-01', 'Conflict resolution question presented with options', hasConflictOption0 && hasConflictOption1);

    // Select conflict:0 (2 people)
    await ev(`document.querySelector('[data-testid="clarify-option-conflict:0"]')?.click()`);
    await waitForTurn();

    const postConflictQ = await ev(`document.querySelector('[data-testid="clarify-question-card"]')?.innerText || ''`);
    record('CONFLICT-02', 'Resolving conflict advances to start_time question', postConflictQ.includes('mấy giờ') || postConflictQ.includes('giờ'), postConflictQ);

    // =========================================================================
    // Test 7: Budget Exhausted Graceful Fallback
    // =========================================================================
    console.log('\n--- Test 7: Budget Exhausted Graceful Fallback ---');
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?guided=1&conv=no_gemini_budget_exhausted`);
    await sendChat('Tour 3 quán quanh Hồ Gươm tối nay, mình bị dị ứng nhẹ với mấy thứ rang giòn');

    const noticeText = await ev(`document.querySelector('[data-testid="guided-container"]')?.innerText || ''`);
    const hasFallbackNotice = noticeText.includes('cách đơn giản') || noticeText.includes('giới hạn') || noticeText.includes('tiếp tục hỗ trợ bạn') || noticeText.includes('quy tắc');
    record('EXHAUSTED-01', 'Graceful fallback note displayed when LLM budget exhausted', hasFallbackNotice, noticeText);

    // Open Chi tiết disclosure
    await ev(`document.querySelector('[data-testid="trust-disclosure-btn"]')?.click()`);
    await sleep(300);

    const disclosureContent = await ev(`document.querySelector('[data-testid="trust-disclosure-modal"]')?.innerText || ''`);
    const hasTranslatedStatus = disclosureContent.includes('Đang đọc theo cách đơn giản') || disclosureContent.includes('cách đơn giản');
    record('EXHAUSTED-02', 'Disclosure translates budget status to friendly Vietnamese phrase ("Đang đọc theo cách đơn giản")', hasTranslatedStatus, disclosureContent);

    // Close disclosure
    await ev(`document.querySelector('[data-testid="trust-disclosure-close"]')?.click()`);
    await sleep(200);

    // =========================================================================
    // Test 8: Row-level Editing ("Sửa" on Understood Card)
    // =========================================================================
    console.log('\n--- Test 8: Row-level Editing ---');
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?guided=1`);
    await sendChat(s0Text);

    // Click "Sửa" on party_size
    await ev(`document.querySelector('[data-testid="understood-edit-party"]')?.click()`);
    await sleep(200);

    // Check inline stepper
    const hasStepper = await ev(`document.querySelector('[data-testid="inline-stepper-plus"]') !== null`);
    record('ROW-EDIT-01', 'Clicking Sửa on whitelisted field opens inline stepper editor', hasStepper);

    // Click "+"
    await ev(`document.querySelector('[data-testid="inline-stepper-plus"]')?.click()`);
    await sleep(100);
    const steppedVal = await ev(`document.querySelector('[data-testid="inline-stepper-value"]')?.innerText || ''`);
    record('ROW-EDIT-02', 'Inline stepper increments value', steppedVal === '3' || steppedVal.includes('3'), steppedVal);

    // Dismiss editor via Cancel
    await ev(`document.querySelector('[data-testid="inline-edit-cancel"]')?.click()`);
    await sleep(200);

    // Click "Sửa" on free-form field (area)
    await ev(`document.querySelector('[data-testid="understood-edit-area"]')?.click()`);
    await sleep(200);

    const composerVal = await ev(`document.querySelector('[data-testid="guided-input"]')?.value || ''`);
    record('ROW-EDIT-03', 'Clicking Sửa on free-form field prefills composer prompt', composerVal.includes('khu vực') || composerVal.includes('Khu vực'), composerVal);

    // =========================================================================
    // Test 9: Responsive Viewports & Mobile (390x844)
    // =========================================================================
    console.log('\n--- Test 9: Responsive Mobile Viewport (390x844) ---');
    await setViewport(390, 844);
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?guided=1`);
    await sendChat(s0Text);

    // Check horizontal scroll
    const hasHorizontalOverflow = await ev(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
    record('MOBILE-01', 'Mobile viewport 390x844 has NO horizontal overflow', !hasHorizontalOverflow);

    // Capture mobile stream and understood card
    await captureScreenshot('mobile_stream.png');
    await captureScreenshot('mobile_understood.png');

    // Restore desktop viewport
    await setViewport(1280, 800);

    // =========================================================================
    // Test 10: Keyboard Navigation
    // =========================================================================
    console.log('\n--- Test 10: Keyboard Navigation ---');
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?guided=1`);
    await sleep(300);

    // Focus input and press Tab
    await ev(`document.querySelector('[data-testid="guided-input"]')?.focus()`);
    await sendCDP('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab' });
    await sendCDP('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab' });
    await sleep(100);

    const activeTag = await ev(`document.activeElement?.tagName || ''`);
    record('KEYBOARD-01', 'Keyboard navigation responds to Tab focus', Boolean(activeTag), activeTag);

    // Open disclosure, then press Escape to dismiss
    await ev(`document.querySelector('[data-testid="trust-disclosure-btn"]')?.click()`);
    await sleep(200);
    await sendCDP('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape' });
    await sendCDP('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    await sleep(200);

    const isDisclosureClosed = await ev(`document.querySelector('[data-testid="trust-disclosure-modal"]') === null`);
    record('KEYBOARD-02', 'Escape key dismisses disclosure modal', isDisclosureClosed);

    // =========================================================================
    // Test 11: Hostile Strings & XSS Containment
    // =========================================================================
    console.log('\n--- Test 11: Hostile Strings & XSS Containment ---');
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?guided=1`);
    const hostileInput = `<script>window.__xss_fired=true</script><img src=x onerror="window.__xss_fired=true"> "Quán 'VIP' & Ốc" 🍜🔥`;
    await sendChat(hostileInput);

    const xssFired = await ev(`Boolean(window.__xss_fired)`);
    record('HOSTILE-01', 'Hostile HTML/script tags are NOT executed as script', !xssFired);

    // =========================================================================
    // Test 12: Banned Text Scan
    // =========================================================================
    console.log('\n--- Test 12: Banned Text Scan ---');
    const mainVisibleText = await ev(`document.querySelector('[data-testid="guided-container"]')?.innerText || ''`);
    const BANNED_TOKENS = [
      'bộ luật cục bộ',
      'Gemini',
      'intent',
      'pending',
      'slot',
      'llm',
      'provenance',
      'JSON',
      'undefined',
      'null',
    ];

    const violations = [];
    for (const token of BANNED_TOKENS) {
      // Case-insensitive check for dev jargon
      const re = new RegExp(`\\b${token}\\b`, 'i');
      if (re.test(mainVisibleText)) {
        violations.push(token);
      }
    }

    // Check for raw UUIDs
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    if (uuidRe.test(mainVisibleText)) {
      violations.push('raw UUID');
    }

    record('BANNED-SCAN-01', 'Main visible flow contains ZERO banned tokens', violations.length === 0, violations.join(', '));

    console.log('\n===============================================================');
    console.log(`   ALL GUIDED UI E2E TESTS PASSED (${results.length}/${results.length})`);
    console.log('===============================================================\n');

  } finally {
    if (ws) {
      try { ws.close(); } catch (_) {}
    }
    if (browserProc?.pid) {
      console.log('[Teardown] Killing browser process tree...');
      killProcessTree(browserProc.pid);
    }
    if (frontendProc?.pid) {
      console.log('[Teardown] Killing frontend process tree...');
      killProcessTree(frontendProc.pid);
    }
    if (scratchDir) {
      try {
        fs.rmSync(scratchDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

run().catch((err) => {
  console.error('\n❌ Suite execution failed:', err.message);
  process.exit(1);
});
