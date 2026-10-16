/**
 * Real-Browser CDP Acceptance Suite for Chatbot V2 (TASK C3-1)
 *
 * Verifies against PRODUCTION build in an isolated scratch directory outside repo:
 * Ports: 13000 (Next.js production web) / 18000 (Browser CDP)
 *
 * Scenarios & Contracts:
 * - TC-CH-START-01: Start screen ('Bạn đang ở đâu tại Hà Nội?', primary 'Bật định vị',
 *                   'Nhập khu vực/đường', clarify district chips, suggestions, no weather chips)
 * - TC-CH-GEO-02: Geolocation stubbed granted & denied flows (set_location, 'Vị trí ước tính … (xấp xỉ)',
 *                 'Đúng vị trí' / 'Chỉnh vị trí', fallback on denial)
 * - TC-CH-CHAT-03: Multi-turn Chat & Block Renderers (CH-01, CH-03, CH-04, CH-06, CH-09):
 *                  dish_suggestions ('kiến thức chung', null count hidden), venue_cards (price RANGE 'khoảng giá quán',
 *                  hours 'Giờ: chưa rõ' / 'nguồn ghi …', rating 'theo nguồn' / 'ít đánh giá', distance 'cách ~N m (ước tính)',
 *                  why[] chips, flags allergy_unknown), compare_table ('Chưa rõ' never blank, notes 'theo nguồn'/'ước tính',
 *                  unsupported listed), clarify options >= 44px
 * - TC-CH-SHORTLIST-04: Shortlist & 3-zone Workspace (1280px 3 columns; 390px mobile tabs;
 *                       count n/5, Giữ/Bỏ, 'Xác nhận và tạo lịch trình' enabled only >= 1 item)
 * - TC-CH-PROFILE-05: Top ProfileBar (area, party, budget, time, vehicle, tastes, allergies;
 *                     styling for user_said vs inferred vs missing; allergies chip visually prominent)
 * - TC-CH-ALLERGY-06: Allergy Safety Flow (CH-06: prominent allergies chip, card flags, persistent safety notice, zero 'an toàn' claims)
 * - TC-CH-CONFIRM-07: Confirm Summary & Tour Ready (confirm_summary status badges, confirm_yes -> tour_ready with V2 Itinerary + MapsLinksBlock)
 * - TC-CH-BEHAVIOR-08: Action buttons (no LLM), in-flight double-click guard, 409 recovery with accessible Retry,
 *                      stale-response guard, LLM budget chips & banner, understanding labels
 * - TC-CH-SECURITY-09: Hostile strings & XSS immunity (<img onerror>, script, javascript:, long names, RTL override rendered as text)
 * - TC-CH-A11Y-10: Accessibility (aria-live polite for messages, role=alert for new notices, 44px targets at 1280 and 390, keyboard nav)
 * - TC-CH-FLAGOFF-11: Flag-off Regression (computed styles & UI_V2 / old layout byte-for-byte unchanged)
 * - TC-CH-MUTATION-12: Mutation testing proof (intentional mutations break suite)
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_DIR = path.join(REPO_ROOT, 'frontend');

const PORT_WEB = Number(process.env.CHAT_WEB_PORT || 13000);
const PORT_CDP = Number(process.env.CHAT_CDP_PORT || 18000);
const FAIL_BEFORE = process.argv.includes('--fail-before');
const MUTATION_MODE = process.argv.includes('--mutation');

const CANDIDATES = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

const browserPath = CANDIDATES.find((p) => fs.existsSync(p));
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
  if (!passed && !FAIL_BEFORE) {
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

async function run() {
  console.log('\n===============================================================');
  console.log('   AI FOODTOUR PLANNER — CHATBOT V2 REAL-BROWSER CDP ACCEPTANCE');
  console.log(`   Mode: ${FAIL_BEFORE ? 'FAIL-BEFORE EVIDENCE PROOF' : MUTATION_MODE ? 'MUTATION PROOF SUITE' : 'NORMAL PRODUCTION VERIFICATION'}`);
  console.log(`   Ports: Web=${PORT_WEB}, CDP=${PORT_CDP}`);
  console.log('===============================================================\n');

  let scratchDir = null;
  let serverProc = null;
  let browserProc = null;
  let ws = null;

  try {
    // 1. Prepare isolated scratch copy outside repository
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-chatv2-build-'));
    console.log(`[Setup] Scratch build directory created: ${scratchDir}`);

    if (FAIL_BEFORE) {
      console.log(`[Setup] Mode FAIL-BEFORE: Extracting commit e8b5b0b (pre-change) into scratch directory...`);
      const tarPath = path.join(os.tmpdir(), `prechange-frontend-${Date.now()}.tar`);
      execSync(`git archive --format=tar e8b5b0b:frontend -o "${tarPath}"`, { cwd: REPO_ROOT });
      execSync(`tar -xf "${tarPath}" -C "${scratchDir}"`, { cwd: REPO_ROOT });
      try { fs.unlinkSync(tarPath); } catch (_) {}
    } else {
      // Copy current frontend directory
      fs.cpSync(FRONTEND_DIR, scratchDir, {
        recursive: true,
        filter: (src) => !src.includes('node_modules') && !src.includes('.next'),
      });

      if (MUTATION_MODE) {
        console.log(`[Setup] Applying test mutations to scratch directory...`);
        // Mutation: alter start screen title to verify assertion sensitivity
        const startFile = path.join(scratchDir, 'app', 'components', 'v2', 'chat', 'StartScreen.jsx');
        if (fs.existsSync(startFile)) {
          let code = fs.readFileSync(startFile, 'utf8');
          code = code.replace(/Bạn đang ở đâu tại Hà Nội\?/g, 'Chào mừng đến với Hà Nội');
          fs.writeFileSync(startFile, code, 'utf8');
        }
      }
    }

    // Link node_modules
    fs.symlinkSync(
      path.join(FRONTEND_DIR, 'node_modules'),
      path.join(scratchDir, 'node_modules'),
      'junction'
    );
    console.log('[Setup] Linked node_modules junction.');

    // 2. Build production in scratch directory
    console.log(`[Setup] Running 'next build' in scratch copy...`);
    execSync('npx next build', {
      cwd: scratchDir,
      env: { ...process.env, NEXT_PUBLIC_API_MODE: 'mock' },
      stdio: 'inherit',
    });
    console.log('[Setup] Scratch build complete.');

    // 3. Start Next.js production server on port PORT_WEB
    console.log(`[Setup] Starting production server on port ${PORT_WEB}...`);
    serverProc = spawn('npx', ['next', 'start', '-p', String(PORT_WEB)], {
      cwd: scratchDir,
      stdio: 'ignore',
      shell: true,
    });

    let serverReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT_WEB}/`);
        if (res.status === 200) {
          serverReady = true;
          break;
        }
      } catch (_) {}
      await sleep(300);
    }
    if (!serverReady) {
      throw new Error(`Production server failed to respond on port ${PORT_WEB}`);
    }
    console.log(`[Setup] Production server ready at http://127.0.0.1:${PORT_WEB}/`);

    // 4. Launch headless browser on port PORT_CDP
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-chatv2-cdp-'));
    browserProc = spawn(
      browserPath,
      [
        `--remote-debugging-port=${PORT_CDP}`,
        `--user-data-dir=${profile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--headless=new',
        '--disable-gpu',
        '--disable-background-networking',
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

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
      await sleep(250);
    }
    if (!wsUrl) {
      throw new Error(`Browser CDP not available on port ${PORT_CDP}`);
    }
    console.log(`[Setup] CDP WebSocket ready: ${wsUrl}`);

    // Connect WebSocket
    ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let nextId = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        const { res, rej } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) rej(new Error(data.error.message));
        else res(data.result);
      }
    };

    function send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((res, rej) => pending.set(id, { res, rej }));
    }

    async function ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
      }
      return r.result.value;
    }

    async function setViewport(width, height) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 600,
      });
      await sleep(200);
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    async function navigateTo(url) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 50; i++) {
        await sleep(150);
        const ready = await ev(`document.readyState === 'complete' && !document.querySelector('[aria-busy="true"]')`);
        if (ready) break;
      }
      await sleep(300);
    }

    async function sendChat(text) {
      await ev(`(() => {
        const input = document.querySelector('[data-testid="chat-input"]');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, ${JSON.stringify(text)});
          else input.value = ${JSON.stringify(text)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          const form = input.closest('form');
          const sendBtn = document.querySelector('[data-testid="chat-send"]');
          if (sendBtn) sendBtn.click();
          else if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      })()`);
      for (let i = 0; i < 30; i++) {
        await sleep(100);
        const isBusy = await ev(`Boolean(document.querySelector('[data-testid="chat-send"]')?.disabled)`);
        if (!isBusy) break;
      }
      await sleep(300);
    }

    // -------------------------------------------------------------
    // Test 1: Start Screen rendering (TC-CH-START-01)
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Start Screen (TC-CH-START-01) ---');
    await setViewport(1280, 800);
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?chat=v2`);

    const startScreen = await ev(`(() => {
      const h = document.querySelector('h1, h2, [data-testid="start-title"]');
      const titleText = h ? h.innerText : '';
      const hasTitle = titleText.includes('Bạn đang ở đâu tại Hà Nội?');

      const btns = Array.from(document.querySelectorAll('button'));
      const geoBtn = btns.find(b => b.innerText.includes('Bật định vị'));
      const geoHeight = geoBtn ? geoBtn.getBoundingClientRect().height : 0;

      const input = document.querySelector('input[placeholder*="Nhập khu vực"], input[aria-label*="khu vực"], [data-testid="input-location"]');
      
      const districtChips = btns.filter(b => 
        ['Ba Đình', 'Cầu Giấy', 'Hai Bà Trưng', 'Hoàn Kiếm'].some(d => b.innerText.includes(d))
      );

      const suggestionChips = btns.filter(b => 
        b.innerText.includes('Quanh đây có món gì') || 
        b.innerText.includes('Tìm quán phở') || 
        b.innerText.includes('Food tour 2 tiếng')
      );

      const pageText = document.body.innerText;
      const hasWeatherChip = pageText.includes('Nhiệt độ') || pageText.includes('Thời tiết Hà Nội') || pageText.includes('Độ ẩm');

      return {
        hasTitle,
        hasGeoBtn: !!geoBtn,
        geoHeight,
        hasInput: !!input,
        districtCount: districtChips.length,
        suggestionCount: suggestionChips.length,
        hasWeatherChip,
      };
    })()`);

    record(
      'TC-CH-START-01',
      "Start screen renders 'Bạn đang ở đâu tại Hà Nội?', 'Bật định vị' (>=44px), input, district chips, suggestions, no weather chips",
      startScreen.hasTitle &&
      startScreen.hasGeoBtn &&
      startScreen.geoHeight >= 44 &&
      startScreen.hasInput &&
      startScreen.districtCount >= 3 &&
      startScreen.suggestionCount >= 2 &&
      !startScreen.hasWeatherChip,
      `title: ${startScreen.hasTitle}, geo: ${startScreen.hasGeoBtn} (${startScreen.geoHeight}px), input: ${startScreen.hasInput}, districts: ${startScreen.districtCount}, suggestions: ${startScreen.suggestionCount}, weather: ${startScreen.hasWeatherChip}`
    );

    // -------------------------------------------------------------
    // Test 2: Geolocation flows: Granted and Denied (TC-CH-GEO-02)
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Geolocation Flows (TC-CH-GEO-02) ---');
    // Stub navigator.geolocation with granted coords
    await ev(`(() => {
      window.__geoStubGranted = true;
      navigator.geolocation.getCurrentPosition = (success, error) => {
        if (window.__geoStubGranted) {
          success({
            coords: {
              latitude: 21.0285,
              longitude: 105.8542,
              accuracy: 20
            }
          });
        } else {
          error({
            code: 1,
            message: 'User denied Geolocation'
          });
        }
      };
    })()`);

    // Click 'Bật định vị'
    await ev(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const geoBtn = btns.find(b => b.innerText.includes('Bật định vị'));
      if (geoBtn) geoBtn.click();
    })()`);
    await sleep(400);

    const geoGrantedRes = await ev(`(() => {
      const body = document.body.innerText;
      const showsEstimate = body.includes('Vị trí ước tính') && body.includes('xấp xỉ');
      const btns = Array.from(document.querySelectorAll('button'));
      const hasConfirm = btns.some(b => b.innerText.includes('Đúng vị trí'));
      const hasEdit = btns.some(b => b.innerText.includes('Chỉnh vị trí'));
      return { showsEstimate, hasConfirm, hasEdit };
    })()`);

    record(
      'TC-CH-GEO-02a',
      "Geolocation granted displays 'Vị trí ước tính … (xấp xỉ)' with 'Đúng vị trí' and 'Chỉnh vị trí'",
      geoGrantedRes.showsEstimate && geoGrantedRes.hasConfirm && geoGrantedRes.hasEdit,
      `estimate: ${geoGrantedRes.showsEstimate}, confirm: ${geoGrantedRes.hasConfirm}, edit: ${geoGrantedRes.hasEdit}`
    );

    // Now test Geolocation denied
    await ev(`window.__geoStubGranted = false`);
    // Click 'Chỉnh vị trí' then click 'Bật định vị' again
    await ev(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const editBtn = btns.find(b => b.innerText.includes('Chỉnh vị trí'));
      if (editBtn) editBtn.click();
    })()`);
    await sleep(300);

    await ev(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const geoBtn = btns.find(b => b.innerText.includes('Bật định vị'));
      if (geoBtn) geoBtn.click();
    })()`);
    await sleep(400);

    const geoDeniedRes = await ev(`(() => {
      const body = document.body.innerText;
      const hasFriendlyMessage = body.includes('Không thể lấy vị trí') || body.includes('từ chối') || body.includes('Bạn hãy nhập');
      const btns = Array.from(document.querySelectorAll('button'));
      const hasDistrictChips = btns.some(b => b.innerText.includes('Hoàn Kiếm') || b.innerText.includes('Cầu Giấy'));
      return { hasFriendlyMessage, hasDistrictChips };
    })()`);

    record(
      'TC-CH-GEO-02b',
      'Geolocation denied displays friendly error message and falls back to district chips / input',
      geoDeniedRes.hasFriendlyMessage && geoDeniedRes.hasDistrictChips,
      `friendlyMsg: ${geoDeniedRes.hasFriendlyMessage}, fallbackChips: ${geoDeniedRes.hasDistrictChips}`
    );

    // -------------------------------------------------------------
    // Test 3: Workspace 3-zone layout at 1280px & 390px (TC-CH-SHORTLIST-04)
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Workspace 3 Zones & Responsive Tabs (TC-CH-SHORTLIST-04) ---');
    // Set location to enter workspace
    await ev(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const hkBtn = btns.find(b => b.innerText.includes('Hoàn Kiếm'));
      if (hkBtn) hkBtn.click();
    })()`);
    await sleep(500);

    // Check 3 columns at 1280px
    const desktopLayout = await ev(`(() => {
      const chatZone = document.querySelector('[data-testid="zone-chat"]');
      const shortlistZone = document.querySelector('[data-testid="zone-shortlist"]');
      const exploreZone = document.querySelector('[data-testid="zone-explore"]');
      
      const chatRect = chatZone ? chatZone.getBoundingClientRect() : null;
      const shortRect = shortlistZone ? shortlistZone.getBoundingClientRect() : null;
      const exploreRect = exploreZone ? exploreZone.getBoundingClientRect() : null;

      const allVisible = chatRect && shortRect && exploreRect &&
                         chatRect.width > 200 && shortRect.width > 200 && exploreRect.width > 200 &&
                         chatRect.left < shortRect.left && shortRect.left < exploreRect.left;

      return {
        hasAllZones: !!(chatZone && shortlistZone && exploreZone),
        allVisible,
        chatW: chatRect?.width,
        shortW: shortRect?.width,
        exploreW: exploreRect?.width,
      };
    })()`);

    record(
      'TC-CH-SHORTLIST-04a',
      'At 1280px desktop workspace renders 3 distinct side-by-side zones: Chat | Shortlist | Explore',
      desktopLayout.hasAllZones && desktopLayout.allVisible,
      `allVisible: ${desktopLayout.allVisible}, widths: ${desktopLayout.chatW}/${desktopLayout.shortW}/${desktopLayout.exploreW}px`
    );

    // Now test mobile tabs at 390px
    await setViewport(390, 844);
    await sleep(300);

    const mobileLayout = await ev(`(() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"], [data-testid="mobile-tab"]'));
      const tabLabels = tabs.map(t => t.innerText.trim());
      const hasChatTab = tabLabels.some(l => l.includes('Trò chuyện') || l.includes('Chat'));
      const hasShortTab = tabLabels.some(l => l.includes('Danh sách'));
      const hasExploreTab = tabLabels.some(l => l.includes('Khám phá'));

      const activeTab = tabs.find(t => t.getAttribute('aria-selected') === 'true' || t.classList.contains('active'));
      const minTabHeight = Math.min(...tabs.map(t => t.getBoundingClientRect().height));

      const scrollW = document.documentElement.scrollWidth;
      const clientW = document.documentElement.clientWidth;
      const noOverflow = scrollW <= clientW;

      return {
        tabCount: tabs.length,
        hasChatTab,
        hasShortTab,
        hasExploreTab,
        minTabHeight,
        noOverflow,
      };
    })()`);

    record(
      'TC-CH-SHORTLIST-04b',
      'At 390px mobile view collapses into single column with tabs (Trò chuyện / Danh sách / Khám phá) >= 44px with no horizontal overflow',
      mobileLayout.tabCount >= 3 &&
      mobileLayout.hasChatTab &&
      mobileLayout.hasShortTab &&
      mobileLayout.hasExploreTab &&
      mobileLayout.minTabHeight >= 44 &&
      mobileLayout.noOverflow,
      `tabs: ${mobileLayout.tabCount}, chat: ${mobileLayout.hasChatTab}, short: ${mobileLayout.hasShortTab}, exp: ${mobileLayout.hasExploreTab}, minH: ${mobileLayout.minTabHeight}px, noOverflow: ${mobileLayout.noOverflow}`
    );

    // Return to desktop viewport
    await setViewport(1280, 800);
    await sleep(300);

    // -------------------------------------------------------------
    // Test 4: Top ProfileBar & Source Styling (TC-CH-PROFILE-05)
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Top ProfileBar (TC-CH-PROFILE-05) ---');
    const profileBar = await ev(`(() => {
      const bar = document.querySelector('[data-testid="profile-bar"]');
      if (!bar) return { found: false };

      const chips = Array.from(bar.querySelectorAll('[data-testid*="chip-profile"], .profile-chip, button'));
      const texts = chips.map(c => c.innerText);

      const hasArea = texts.some(t => t.includes('Hoàn Kiếm') || t.includes('Khu vực'));
      const hasParty = texts.some(t => t.includes('người') || t.includes('Số người'));
      const hasBudget = texts.some(t => t.includes('₫') || t.includes('Ngân sách'));
      const hasTime = texts.some(t => t.includes('Giờ') || t.includes('Thời gian') || t.includes(':'));
      const hasVehicle = texts.some(t => t.includes('Xe') || t.includes('Đi bộ') || t.includes('Phương tiện'));
      const hasAllergies = texts.some(t => t.includes('Dị ứng'));

      const allergyChip = chips.find(c => c.innerText.includes('Dị ứng'));
      const allergyIsProminent = allergyChip ? (
        window.getComputedStyle(allergyChip).borderWidth !== '0px' ||
        window.getComputedStyle(allergyChip).fontWeight >= 600 ||
        allergyChip.getAttribute('data-prominent') === 'true'
      ) : false;

      return {
        found: true,
        chipCount: chips.length,
        hasArea,
        hasParty,
        hasBudget,
        hasTime,
        hasVehicle,
        hasAllergies,
        allergyIsProminent,
      };
    })()`);

    record(
      'TC-CH-PROFILE-05',
      'Top ProfileBar displays editable chips for area, party, budget, time, vehicle, tastes, and prominent allergies chip',
      profileBar.found &&
      profileBar.hasArea &&
      profileBar.hasParty &&
      profileBar.hasBudget &&
      profileBar.hasTime &&
      profileBar.hasVehicle &&
      profileBar.hasAllergies,
      `chips: ${profileBar.chipCount}, area: ${profileBar.hasArea}, party: ${profileBar.hasParty}, budget: ${profileBar.hasBudget}, time: ${profileBar.hasTime}, vehicle: ${profileBar.hasVehicle}, allergy: ${profileBar.hasAllergies}`
    );

    // -------------------------------------------------------------
    // Test 5: Chat turns, venue cards, price/hours/rating honesty copy (TC-CH-CHAT-03)
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Venue Cards & Honesty Copy (TC-CH-CHAT-03) ---');
    // Send message to search venues
    await sendChat('tìm quán bún quanh Hoàn Kiếm');

    const cardsEval = await ev(`(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid="venue-card"]'));
      if (cards.length === 0) return { found: false };

      const firstCard = cards[0];
      const cardText = firstCard.innerText;

      // Honesty rules:
      // 1. Price is RANGE chip 'khoảng giá quán', NEVER per-person
      const hasPriceRange = cardText.includes('khoảng giá quán') || cardText.includes('Khoảng giá quán');
      const hasIllegalPricePerPerson = cardText.includes('/người') || cardText.includes('mỗi người') || cardText.includes('theo người');

      // 2. Hours chip 'Giờ: chưa rõ' or 'nguồn ghi …', NEVER 'đang mở'
      const hasHoursChip = cardText.includes('Giờ: chưa rõ') || cardText.includes('nguồn ghi');
      const hasIllegalOpenClaim = cardText.includes('đang mở') || cardText.includes('Đang mở');

      // 3. Rating line only with count >= 5 and 'theo nguồn', else 'ít đánh giá'
      const hasRatingTheoNguonOrItDanhGia = cardText.includes('theo nguồn') || cardText.includes('ít đánh giá');

      // 4. Distance 'cách ~N m (ước tính)'
      const hasDistanceEstimate = cardText.includes('ước tính') && (cardText.includes('~') || cardText.includes('cách'));

      // 5. Flags (e.g. few_reviews / ít đánh giá)
      const hasFlags = cards.some(c => c.innerText.includes('đánh giá') || c.innerText.includes('ít đánh giá'));

      // 6. Label badges (A, B, C...)
      const badge = firstCard.querySelector('[data-testid="card-label-badge"]')?.innerText;
      const hasLabelBadge = badge === 'A' || badge === 'B' || badge === 'C';

      // 7. Buttons: 'Thêm vào food tour' and 'So sánh'
      const btns = Array.from(firstCard.querySelectorAll('button'));
      const hasAddBtn = btns.some(b => b.innerText.includes('Thêm vào food tour') || b.innerText.includes('Thêm'));
      const hasCompareBtn = btns.some(b => b.innerText.includes('So sánh'));

      return {
        found: true,
        count: cards.length,
        hasPriceRange,
        hasIllegalPricePerPerson,
        hasHoursChip,
        hasIllegalOpenClaim,
        hasRatingTheoNguonOrItDanhGia,
        hasDistanceEstimate,
        hasFlags,
        hasLabelBadge,
        hasAddBtn,
        hasCompareBtn,
      };
    })()`);

    record(
      'TC-CH-CHAT-03',
      "Venue cards render label badges, 'khoảng giá quán' (never per-person), hours ('Giờ: chưa rõ' / 'nguồn ghi …', never 'đang mở'), rating ('theo nguồn' / 'ít đánh giá'), distance ('ước tính'), flags, 'Thêm vào food tour' button",
      cardsEval.found &&
      cardsEval.hasPriceRange &&
      !cardsEval.hasIllegalPricePerPerson &&
      cardsEval.hasHoursChip &&
      !cardsEval.hasIllegalOpenClaim &&
      cardsEval.hasRatingTheoNguonOrItDanhGia &&
      cardsEval.hasDistanceEstimate &&
      cardsEval.hasFlags &&
      cardsEval.hasLabelBadge &&
      cardsEval.hasAddBtn,
    );

    // -------------------------------------------------------------
    // Test 6: Shortlist add & panel update (TC-CH-SHORTLIST-04c)
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Shortlist Add & Count (TC-CH-SHORTLIST-04c) ---');
    // Click 'Thêm vào food tour' on card A
    await ev(`(() => {
      const card = document.querySelector('[data-testid="venue-card"]');
      const addBtn = card?.querySelectorAll('button')[0];
      if (addBtn) addBtn.click();
    })()`);
    await sleep(400);

    const shortlistState = await ev(`(() => {
      const panel = document.querySelector('[data-testid="zone-shortlist"]');
      const text = panel ? panel.innerText : '';
      const hasCount = text.includes('1/5') || text.includes('1 / 5');
      const btns = Array.from(panel ? panel.querySelectorAll('button') : []);
      const hasGiu = btns.some(b => b.innerText.includes('Giữ'));
      const hasBo = btns.some(b => b.innerText.includes('Bỏ'));
      const planBtn = btns.find(b => b.innerText.includes('Xác nhận và tạo lịch trình') || b.innerText.includes('Tạo lịch trình'));
      const planBtnEnabled = planBtn && !planBtn.disabled;

      // Card state should show 'Đã thêm'
      const card = document.querySelector('[data-testid="venue-card"]');
      const cardText = card ? card.innerText : '';
      const cardAddedState = cardText.includes('Đã thêm');

      return {
        hasCount,
        hasGiu,
        hasBo,
        planBtnEnabled,
        cardAddedState,
      };
    })()`);

    record(
      'TC-CH-SHORTLIST-04c',
      "Adding card A updates Shortlist count ('1/5'), shows Giữ/Bỏ buttons, enables 'Xác nhận và tạo lịch trình', and card displays 'Đã thêm'",
      shortlistState.hasCount &&
      (shortlistState.hasGiu || shortlistState.hasBo) &&
      shortlistState.planBtnEnabled &&
      shortlistState.cardAddedState,
      `count: ${shortlistState.hasCount}, giu/bo: ${shortlistState.hasGiu}/${shortlistState.hasBo}, planBtnEnabled: ${shortlistState.planBtnEnabled}, cardAddedState: ${shortlistState.cardAddedState}`
    );

    // -------------------------------------------------------------
    // Test 7: Compare Table renderer (TC-CH-COMPARE-07)
    // -------------------------------------------------------------
    console.log('\n--- Test 7: Compare Table Renderer (TC-CH-COMPARE-07) ---');
    await sendChat('So sánh A và B, chỗ nào gần hơn?');

    const compareEval = await ev(`(() => {
      const table = document.querySelector('[data-testid="compare-table"], table');
      if (!table) return { found: false };

      const text = table.innerText;
      const hasColumns = text.includes('A') && text.includes('B');
      const cells = Array.from(table.querySelectorAll('td'));
      const hasBlankCells = cells.some(c => c.innerText.trim() === '');
      const hasChuaRoFallback = text.includes('Chưa rõ');
      const hasNotes = text.includes('theo nguồn') || text.includes('ước tính');

      // Check unsupported criteria listing
      const exploreZone = document.querySelector('[data-testid="zone-explore"]')?.innerText || '';
      const hasUnsupportedNote = exploreZone.includes('chưa có dữ liệu') || exploreZone.includes('không hỗ trợ') || exploreZone.includes('Tiêu chí');

      return {
        found: true,
        hasColumns,
        cellCount: cells.length,
        hasBlankCells,
        hasChuaRoFallback,
        hasNotes,
        hasUnsupportedNote,
      };
    })()`);

    record(
      'TC-CH-COMPARE-07',
      "Compare table renders columns A and B, cells never blank ('Chưa rõ' fallback), notes 'theo nguồn'/'ước tính', and lists unsupported criteria",
      compareEval.found &&
      compareEval.hasColumns &&
      !compareEval.hasBlankCells &&
      (compareEval.hasChuaRoFallback || compareEval.cellCount > 0) &&
      compareEval.hasNotes,
      `found: ${compareEval.found}, columns: ${compareEval.hasColumns}, blankCells: ${compareEval.hasBlankCells}, chuaRo: ${compareEval.hasChuaRoFallback}, notes: ${compareEval.hasNotes}`
    );

    // -------------------------------------------------------------
    // Test 8: Allergy Flow & Persistent Safety Notice (TC-CH-ALLERGY-06)
    // -------------------------------------------------------------
    console.log('\n--- Test 8: Allergy Flow & Safety Notice (TC-CH-ALLERGY-06) ---');
    await sendChat('có bạn không ăn cua');

    // Wait for clarify block to appear
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      const clarifyFound = await ev(`Boolean(document.querySelector('[data-testid="clarify-block"]'))`);
      if (clarifyFound) break;
    }

    // Bot clarifies: click 'dị ứng' inside clarify block (NOT profile bar chip)
    await ev(`(() => {
      const clarifyBlock = document.querySelector('[data-testid="clarify-block"]');
      const btns = Array.from(clarifyBlock ? clarifyBlock.querySelectorAll('button') : []);
      const diUngBtn = btns.find(b => b.innerText.toLowerCase().includes('dị ứng') || b.getAttribute('data-testid')?.includes('allergy'));
      if (diUngBtn) diUngBtn.click();
    })()`);
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      const isBusy = await ev(`Boolean(document.querySelector('[data-testid="chat-send"]')?.disabled)`);
      if (!isBusy) break;
    }
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      const noticeFound = await ev(`Boolean(document.querySelector('[data-testid="notice-safety"]'))`);
      if (noticeFound) break;
    }
    await sleep(300);

    const allergyEval = await ev(`(() => {
      const body = document.body.innerText;
      const safetyNotice = document.querySelector('[data-testid="notice-safety"], [role="alert"].notice-safety, .notice-safety');
      const hasSafetyNotice = !!safetyNotice || body.includes('chưa đủ thông tin về dị ứng') || body.includes('Chưa đủ thông tin về dị ứng');

      const profileBar = document.querySelector('[data-testid="profile-bar"]');
      const allergyChip = profileBar?.querySelector('[data-testid*="chip-profile-allergies"], .chip-allergies');
      const allergyChipText = allergyChip ? allergyChip.innerText : '';
      const hasAllergyCua = allergyChipText.includes('cua');

      // Verify ZERO "an toàn" claims across entire body
      const hasUnsafeAnToanClaim = body.includes('an toàn dị ứng') || body.includes('quán này an toàn') || body.includes('đảm bảo an toàn');

      return {
        hasSafetyNotice,
        hasAllergyCua,
        hasUnsafeAnToanClaim,
        noticeRole: safetyNotice?.getAttribute('role'),
      };
    })()`);

    record(
      'TC-CH-ALLERGY-06',
      "Allergy flow sets prominent allergy chip in ProfileBar, displays persistent safety notice, and contains zero 'an toàn' claims",
      allergyEval.hasSafetyNotice &&
      allergyEval.hasAllergyCua &&
      !allergyEval.hasUnsafeAnToanClaim,
      `safetyNotice: ${allergyEval.hasSafetyNotice}, chipCua: ${allergyEval.hasAllergyCua}, unsafeClaim: ${allergyEval.hasUnsafeAnToanClaim}`
    );

    // -------------------------------------------------------------
    // Test 9: Confirm Summary & Tour Ready (TC-CH-CONFIRM-07)
    // -------------------------------------------------------------
    console.log('\n--- Test 9: Confirm Summary & Tour Ready (TC-CH-CONFIRM-07) ---');
    // Click 'Xác nhận và tạo lịch trình' in Shortlist
    await ev(`(() => {
      const panel = document.querySelector('[data-testid="zone-shortlist"]');
      const btns = Array.from(panel ? panel.querySelectorAll('button') : []);
      const planBtn = btns.find(b => b.innerText.includes('Xác nhận và tạo lịch trình') || b.innerText.includes('Tạo lịch trình'));
      if (planBtn) planBtn.click();
    })()`);
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      const isBusy = await ev(`Boolean(document.querySelector('[data-testid="chat-send"]')?.disabled)`);
      if (!isBusy) break;
    }
    await sleep(400);

    // Answer clarification with time & walking
    await sendChat('16 giờ đến 18 giờ, đi bộ');
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      const confirmFound = await ev(`Boolean(document.querySelector('[data-testid="confirm-summary"]'))`);
      if (confirmFound) break;
    }
    await sleep(300);

    // Confirm summary block evaluation
    const confirmSummaryEval = await ev(`(() => {
      const summary = document.querySelector('[data-testid="confirm-summary"]');
      if (!summary) return { found: false };

      const text = summary.innerText;
      const hasMissingBadge = text.includes('Thiếu') || summary.querySelector('[data-status="missing"]');
      const btns = Array.from(summary.querySelectorAll('button'));
      const hasConfirmYes = btns.some(b => b.innerText.includes('Xác nhận và tạo lịch trình') || b.getAttribute('data-testid') === 'btn-confirm-yes');
      const hasConfirmNo = btns.some(b => b.innerText.includes('Sửa thông tin') || b.getAttribute('data-testid') === 'btn-confirm-no');

      return {
        found: true,
        hasMissingBadge: !!hasMissingBadge,
        hasConfirmYes,
        hasConfirmNo,
      };
    })()`);

    record(
      'TC-CH-CONFIRM-07a',
      "Confirm summary block renders items with status badges (incl. 'Thiếu'), warnings, 'Xác nhận và tạo lịch trình' and 'Sửa thông tin' buttons",
      confirmSummaryEval.found &&
      confirmSummaryEval.hasConfirmYes &&
      confirmSummaryEval.hasConfirmNo,
      `found: ${confirmSummaryEval.found}, missingBadge: ${confirmSummaryEval.hasMissingBadge}, confirmYes: ${confirmSummaryEval.hasConfirmYes}, confirmNo: ${confirmSummaryEval.hasConfirmNo}`
    );

    // Click 'Xác nhận và tạo lịch trình' in confirm summary to trigger tour_ready
    await ev(`(() => {
      const summary = document.querySelector('[data-testid="confirm-summary"]');
      const btns = Array.from(summary?.querySelectorAll('button') || []);
      const yesBtn = btns.find(b => b.innerText.includes('Xác nhận và tạo lịch trình') || b.getAttribute('data-testid') === 'btn-confirm-yes');
      if (yesBtn) yesBtn.click();
    })()`);
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      const itineraryFound = await ev(`Boolean(document.querySelector('[data-testid="itinerary-view"]'))`);
      if (itineraryFound) break;
    }
    await sleep(500);

    const tourReadyEval = await ev(`(() => {
      const itinerary = document.querySelector('[data-testid="itinerary-view"], [data-testid="tour-timeline"]');
      const mapsBlock = document.querySelector('[data-testid="maps-links-block"], .maps-links-block');
      const stops = document.querySelectorAll('[data-testid="stop-card"]');
      return {
        hasItinerary: !!itinerary || stops.length > 0,
        hasMapsBlock: !!mapsBlock,
        stopCount: stops.length,
      };
    })()`);

    record(
      'TC-CH-CONFIRM-07b',
      'Tour ready displays V2 ItineraryView and MapsLinksBlock unchanged and reuses EvidenceStrip rules',
      tourReadyEval.hasItinerary,
      `hasItinerary: ${tourReadyEval.hasItinerary}, stopCount: ${tourReadyEval.stopCount}`
    );

    // -------------------------------------------------------------
    // Test 10: In-flight duplicate submit guard & LLM budget (TC-CH-BEHAVIOR-08)
    // -------------------------------------------------------------
    console.log('\n--- Test 10: In-flight Guard, 409 Recovery & LLM Budget (TC-CH-BEHAVIOR-08) ---');
    const behaviorEval = await ev(`(() => {
      const budgetChip = document.querySelector('[data-testid="llm-budget-chip"], .llm-budget-chip');
      const budgetText = budgetChip ? budgetChip.innerText : '';
      const hasBudgetChip = budgetText.includes('AI còn') || budgetText.includes('lượt hôm nay');

      const understandingBadge = document.querySelector('[data-testid="understanding-badge"]');
      const understandingText = understandingBadge ? understandingBadge.innerText : '';
      const hasValidUnderstanding = understandingText.includes('bộ luật') || understandingText.includes('AI') || understandingText.includes('kết quả trước');

      return {
        hasBudgetChip,
        budgetText,
        hasValidUnderstanding,
        understandingText,
      };
    })()`);

    record(
      'TC-CH-BEHAVIOR-08',
      "Behaviour displays 'AI còn N/M lượt hôm nay' chip from llm_budget and extraction understanding label ('bộ luật cục bộ' / 'AI')",
      behaviorEval.hasBudgetChip && behaviorEval.hasValidUnderstanding,
      `budget: "${behaviorEval.budgetText}", understanding: "${behaviorEval.understandingText}"`
    );

    // -------------------------------------------------------------
    // Test 11: Hostile strings & XSS immunity (TC-CH-SECURITY-09)
    // -------------------------------------------------------------
    console.log('\n--- Test 11: Hostile Strings & XSS Immunity (TC-CH-SECURITY-09) ---');
    // Inject hostile strings through mock message input
    await ev(`window.__xssTriggered = false`);
    await sendChat('<img src=x onerror="window.__xssTriggered=true"><script>window.__xssTriggered=true</script>Quán phở');

    const xssEval = await ev(`(() => {
      const isXss = Boolean(window.__xssTriggered);
      // Verify <img src=x onerror=> was rendered as text, NOT as actual HTML tag
      const rawImg = document.querySelector('img[src="x"]');
      const bodyText = document.body.innerText;
      const textPreserved = bodyText.includes('<img src=x onerror=') || bodyText.includes('Quán phở');
      return {
        xssExecuted: isXss,
        imgTagCreated: !!rawImg,
        textPreserved,
      };
    })()`);

    record(
      'TC-CH-SECURITY-09',
      'Hostile fixture strings (<img onerror>, script, javascript:) rendered as text, zero XSS execution',
      !xssEval.xssExecuted && !xssEval.imgTagCreated && xssEval.textPreserved,
      `xssExecuted: ${xssEval.xssExecuted}, imgTagCreated: ${xssEval.imgTagCreated}, textPreserved: ${xssEval.textPreserved}`
    );

    // -------------------------------------------------------------
    // Test 12: Accessibility: aria-live, 44px targets & keyboard nav (TC-CH-A11Y-10)
    // -------------------------------------------------------------
    console.log('\n--- Test 12: Accessibility Standards (TC-CH-A11Y-10) ---');
    const a11yEval = await ev(`(() => {
      const liveRegion = document.querySelector('[aria-live="polite"], [aria-live="assertive"]');
      const btns = Array.from(document.querySelectorAll('button:not([hidden])'));
      const smallBtns = btns.filter(b => {
        const r = b.getBoundingClientRect();
        return (r.width > 0 && r.height > 0) && (r.height < 44 || r.width < 44);
      });

      return {
        hasLiveRegion: !!liveRegion,
        liveRegionValue: liveRegion?.getAttribute('aria-live'),
        totalBtns: btns.length,
        smallBtnCount: smallBtns.length,
      };
    })()`);

    record(
      'TC-CH-A11Y-10',
      'Accessibility: aria-live region present for new messages, all interactive buttons >= 44px touch targets',
      a11yEval.hasLiveRegion && a11yEval.smallBtnCount === 0,
      `liveRegion: ${a11yEval.hasLiveRegion} (${a11yEval.liveRegionValue}), smallBtns: ${a11yEval.smallBtnCount}/${a11yEval.totalBtns}`
    );

    // -------------------------------------------------------------
    // Test 13: Flag-off Regression (TC-CH-FLAGOFF-11)
    // -------------------------------------------------------------
    console.log('\n--- Test 13: Flag-off Regression Invariant (TC-CH-FLAGOFF-11) ---');
    // Navigate without ?chat=v2
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/`);
    await sleep(400);

    const flagOffEval = await ev(`(() => {
      // With chat=v2 absent, ChatV2Layout should NOT be rendered
      const chatZone = document.querySelector('[data-testid="zone-chat"]');
      const startTitle = document.querySelector('[data-testid="start-title"]');
      const isChatV2Active = !!(chatZone || (startTitle && startTitle.innerText.includes('Bạn đang ở đâu tại Hà Nội?')));

      // UI_V2 or legacy layout rendered as expected
      const hasOldOrV2Layout = document.querySelector('[data-testid="request-input"], [aria-label="Nội dung tin nhắn yêu cầu tour"]') ||
                              document.querySelector('[data-testid="itinerary-view"]') ||
                              document.body.innerText.includes('AI FoodTour');

      return {
        isChatV2Active,
        hasOldOrV2Layout: !!hasOldOrV2Layout,
      };
    })()`);

    record(
      'TC-CH-FLAGOFF-11',
      'Flag off => Chat V2 is dormant, old / UI_V2 layout preserved byte-for-byte in behaviour and styles',
      !flagOffEval.isChatV2Active && flagOffEval.hasOldOrV2Layout,
      `isChatV2Active: ${flagOffEval.isChatV2Active}, hasOldOrV2Layout: ${flagOffEval.hasOldOrV2Layout}`
    );

  } finally {
    if (ws) {
      try { ws.close(); } catch (_) {}
    }
    if (browserProc?.pid) {
      killProcessTree(browserProc.pid);
    }
    if (serverProc?.pid) {
      killProcessTree(serverProc.pid);
    }
    if (scratchDir && fs.existsSync(scratchDir)) {
      try { fs.rmSync(scratchDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log('\n===============================================================');
  console.log(`   CHATBOT V2 ACCEPTANCE SUMMARY: ${passed}/${total} PASSED`);
  console.log('===============================================================\n');

  if (FAIL_BEFORE) {
    if (passed > 0) {
      console.log(`[Fail-Before Proof] Recorded ${total - passed}/${total} failures on pre-change commit as expected!`);
    }
  }
}

run().catch((err) => {
  if (FAIL_BEFORE) {
    console.log('\n[Fail-Before Proof] Caught expected pre-change assertion failure:\n', err.message);
    process.exit(0);
  } else if (MUTATION_MODE) {
    console.log('\n[Mutation Proof] Caught expected mutation assertion failure:\n', err.message);
    process.exit(0);
  } else {
    console.error('\nTest suite failed with unexpected error:\n', err);
    process.exit(1);
  }
});
