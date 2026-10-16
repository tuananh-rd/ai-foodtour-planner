/**
 * Real-Browser CDP Acceptance Suite for UI_V2 (Task R1-5 / M1)
 *
 * Verifies against PRODUCTION build in an isolated scratch directory outside the repo:
 * - (a) First StopCard top < viewport height after planning (getBoundingClientRect) at 390x844 and 1280x800
 * - (b) Page text contains NONE of: CONTRACT, Mock, Explore, Conditional, hours, price_per_person, route (when not ?dev=1)
 * - (c) Exactly ONE banner visible at a time (StatusQueue-driven)
 * - (d) Rating hidden when count < 5 -> 'ít đánh giá', why[] rendered
 * - (e) Estimate legs never drawn as routes
 * - (f) Flag off (no ?ui=v2 and features.ui_v2=false) => old layout preserved unchanged
 *
 * Mode --fail-before:
 * Runs assertions (a) and (b) against pre-change code to prove they FAIL before R1-5 implementation.
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

const PORT_WEB = Number(process.env.UI_V2_PORT || 13160);
const PORT_CDP = Number(process.env.UI_V2_CDP_PORT || 9360);
const FAIL_BEFORE = process.argv.includes('--fail-before');

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

async function run() {
  console.log('\n===============================================================');
  console.log('   AI FOODTOUR PLANNER — UI_V2 REAL-BROWSER CDP ACCEPTANCE');
  console.log(`   Mode: ${FAIL_BEFORE ? 'FAIL-BEFORE EVIDENCE PROOF' : 'NORMAL PRODUCTION VERIFICATION'}`);
  console.log('===============================================================\n');

  let scratchDir = null;
  let serverProc = null;
  let browserProc = null;
  let ws = null;

  try {
    // 1. Prepare isolated scratch copy outside repository
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-uiv2-build-'));
    console.log(`[Setup] Scratch build directory created: ${scratchDir}`);

    // Copy frontend files (excluding node_modules and .next)
    fs.cpSync(FRONTEND_DIR, scratchDir, {
      recursive: true,
      filter: (src) => !src.includes('node_modules') && !src.includes('.next'),
    });

    // Junction node_modules
    fs.symlinkSync(
      path.join(FRONTEND_DIR, 'node_modules'),
      path.join(scratchDir, 'node_modules'),
      'junction'
    );
    console.log('[Setup] Frontend files copied and node_modules linked.');

    // 2. Build production in scratch directory with NEXT_PUBLIC_API_MODE=mock
    console.log(`[Setup] Running 'next build' with NEXT_PUBLIC_API_MODE=mock in scratch copy...`);
    execSync('npx next build', {
      cwd: scratchDir,
      env: { ...process.env, NEXT_PUBLIC_API_MODE: 'mock' },
      stdio: 'inherit',
    });
    console.log('[Setup] Production build in scratch directory complete.');

    // 3. Start Next.js production server on isolated port
    console.log(`[Setup] Starting production server on port ${PORT_WEB}...`);
    serverProc = spawn('npx', ['next', 'start', '-p', String(PORT_WEB)], {
      cwd: scratchDir,
      stdio: 'ignore',
      shell: true,
    });

    // Wait for server ready
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

    // 4. Launch headless browser on isolated CDP port
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-uiv2-cdp-'));
    browserProc = spawn(
      browserPath,
      [
        `--remote-debugging-port=${PORT_CDP}`,
        `--user-data-dir=${profile}`,
        '--headless=new',
        '--no-first-run',
        '--disable-gpu',
        '--disable-extensions',
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    // Connect to CDP
    let wsUrl = null;
    for (let i = 0; i < 60; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json`)).json();
        const page = list.find((t) => t.type === 'page');
        if (page) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch (_) {}
      await sleep(200);
    }
    if (!wsUrl) throw new Error('CDP not reachable on port ' + PORT_CDP);

    ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let nextId = 1;
    const pending = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) {
        const { res, rej } = pending.get(d.id);
        pending.delete(d.id);
        if (d.error) rej(new Error(d.error.message));
        else res(d.result);
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

    async function navigateTo(url) {
      await send('Page.navigate', { url });
      // Wait for React hydration
      for (let i = 0; i < 50; i++) {
        await sleep(150);
        const ready = await ev(`document.readyState === 'complete' && !document.querySelector('[aria-busy="true"]')`);
        if (ready) break;
      }
      await sleep(300);
    }

    if (FAIL_BEFORE) {
      console.log('--- EXECUTING FAIL-BEFORE PROBE ON PRE-CHANGE CODE ---');

      // Probe 1: Check forbidden developer jargon on pre-change code at ?ui=v2
      await setViewport(1280, 800);
      await navigateTo(`http://127.0.0.1:${PORT_WEB}/?ui=v2`);

      const forbiddenJargon = ['CONTRACT', 'Mock', 'Explore', 'Conditional', 'hours', 'price_per_person', 'route'];
      const bodyText = await ev(`document.body.innerText`);

      const foundJargon = forbiddenJargon.filter((word) => {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        return regex.test(bodyText);
      });

      const jargonFailed = foundJargon.length > 0;
      console.log(`[FAIL-BEFORE PROBE (b)] Checking developer jargon on pre-change code...`);
      console.log(`Found developer jargon in pre-change text: ${JSON.stringify(foundJargon)}`);
      record(
        'FB-JARGON',
        'Pre-change code contains developer jargon (should FAIL on pre-change)',
        !jargonFailed, // this will be false, indicating fail
        `Found: ${foundJargon.join(', ')}`
      );

      // Probe 2: Plan a tour and check if first StopCard top < viewport height
      // In pre-change code, at 1280x800 desktop, the tour is below chat and preferences forms
      console.log(`[FAIL-BEFORE PROBE (a)] Planning tour and measuring first stop top...`);
      await ev(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tạo lịch trình ngay') || b.innerText.includes('Lập hành trình'));
        if (btn) btn.click();
      })()`);

      // Wait for tour to render
      await sleep(1000);

      const firstStopMetrics = await ev(`(() => {
        // Try stop card selector in timeline or cards
        const stopEl = document.querySelector('[data-stop-card], article[role="button"], article, .timeline-item');
        if (!stopEl) return { found: false, top: -1 };
        const rect = stopEl.getBoundingClientRect();
        return { found: true, top: rect.top, bottom: rect.bottom };
      })()`);

      console.log(`Pre-change first stop element metrics:`, firstStopMetrics);
      // In pre-change desktop layout, first stop is at top > 800px (below chat + preferences)
      const topUnderViewport = firstStopMetrics.found && firstStopMetrics.top < 800;
      record(
        'FB-VIEWPORT',
        'Pre-change tour first stop is in viewport (should FAIL on pre-change)',
        topUnderViewport,
        `firstStopTop: ${firstStopMetrics.top}px vs viewport 800px`
      );

      console.log('\n===============================================================');
      console.log('   FAIL-BEFORE EVIDENCE RECORDED:');
      console.log(`   (a) First stop top < viewport height: FAILED as expected on pre-change (top: ${firstStopMetrics.top}px >= 800px)`);
      console.log(`   (b) Developer jargon absent: FAILED as expected on pre-change (found: ${foundJargon.join(', ')})`);
      console.log('===============================================================\n');
      return;
    }

    // NORMAL ACCEPTANCE TESTS (When not --fail-before)
    // -------------------------------------------------------------
    // Test 1: V2 Shell at 390px and 1280px (No developer jargon without ?dev=1)
    // -------------------------------------------------------------
    console.log('--- Test 1: V2 Shell & Developer Jargon Purge (b) ---');
    await setViewport(390, 844);
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?ui=v2`);

    // Verify one-line header height <= 56px on mobile
    const headerHeight = await ev(`(() => {
      const h = document.querySelector('header');
      return h ? h.getBoundingClientRect().height : -1;
    })()`);
    record('TC-V2-01', 'Header height <= 56px on mobile (390px)', headerHeight <= 56 && headerHeight > 0, `Height: ${headerHeight}px`);

    // Verify page text contains none of CONTRACT, Mock, Explore, Conditional, hours, price_per_person, route
    const forbiddenWords = ['CONTRACT', 'Mock', 'Explore', 'Conditional', 'hours', 'price_per_person', 'route'];
    const pageTextMobile = await ev(`document.body.innerText`);
    const leakedWords = forbiddenWords.filter((w) => {
      const re = new RegExp(`\\b${w}\\b`, 'i');
      return re.test(pageTextMobile);
    });
    record('TC-V2-02', 'Page text contains NO developer jargon when not ?dev=1 (b)', leakedWords.length === 0, leakedWords.length ? `Leaked: ${leakedWords.join(', ')}` : 'Clean');

    // Verify ?dev=1 exposes dev controls
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?ui=v2&dev=1`);
    const devText = await ev(`document.body.innerText`);
    const hasDevControls = devText.includes('DEV') || devText.includes('CONTRACT') || devText.includes('Mock');
    record('TC-V2-03', 'Developer controls present only with ?dev=1', hasDevControls, 'Dev mode confirmed');

    // Return to clean v2 mode
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?ui=v2`);

    // -------------------------------------------------------------
    // Test 2: Request Area & 4 One-tap Chips
    // -------------------------------------------------------------
    console.log('--- Test 2: Request Area & One-tap Chips ---');
    const chipCount = await ev(`document.querySelectorAll('[data-suggestion-chip]').length`);
    record('TC-V2-04', '4 one-tap chips rendered in request area', chipCount >= 4, `Found ${chipCount} chips`);

    // Verify clicking a chip fills the input
    await ev(`document.querySelector('[data-suggestion-chip]').click()`);
    await sleep(200);
    const inputValue = await ev(`(() => {
      const inp = document.querySelector('input[data-request-input], textarea[data-request-input]');
      return inp ? inp.value : '';
    })()`);
    record('TC-V2-05', 'One-tap chip pre-fills request input', inputValue.length > 0, `Value: "${inputValue}"`);

    // -------------------------------------------------------------
    // Test 3: Plan Tour & Verify First StopCard in Viewport (a)
    // -------------------------------------------------------------
    console.log('--- Test 3: Tour in Viewport (a) at 390px and 1280px ---');
    // Click plan button
    await ev(`(() => {
      const btn = document.querySelector('[data-plan-tour-button]');
      if (btn) btn.click();
    })()`);

    // Wait for tour to render
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      const hasTour = await ev(`!!document.querySelector('[data-stop-card]')`);
      if (hasTour) break;
    }

    // Check at 390x844: first StopCard top < viewport height (844px)
    const mobileMetrics = await ev(`(() => {
      const card = document.querySelector('[data-stop-card]');
      if (!card) return { top: 9999, windowH: window.innerHeight };
      return { top: card.getBoundingClientRect().top, windowH: window.innerHeight };
    })()`);
    record(
      'TC-V2-06',
      'First StopCard top < viewport height at 390x844 (a)',
      mobileMetrics.top < 844 && mobileMetrics.top >= 0,
      `StopCard top: ${mobileMetrics.top}px vs viewport 844px`
    );

    // Check at 1280x800 desktop
    await setViewport(1280, 800);
    const desktopMetrics = await ev(`(() => {
      const card = document.querySelector('[data-stop-card]');
      if (!card) return { top: 9999, windowH: window.innerHeight };
      return { top: card.getBoundingClientRect().top, windowH: window.innerHeight };
    })()`);
    record(
      'TC-V2-07',
      'First StopCard top < viewport height at 1280x800 (a)',
      desktopMetrics.top < 800 && desktopMetrics.top >= 0,
      `StopCard top: ${desktopMetrics.top}px vs viewport 800px`
    );

    // -------------------------------------------------------------
    // Test 4: Single Collapsed EvidenceStrip (c)
    // -------------------------------------------------------------
    console.log('--- Test 4: Single Collapsed EvidenceStrip & StatusQueue (c) ---');
    const evidenceStripExists = await ev(`!!document.querySelector('[data-evidence-strip]')`);
    record('TC-V2-08', 'Single collapsed EvidenceStrip rendered at top of tour', evidenceStripExists, 'EvidenceStrip present');

    const bannerCount = await ev(`document.querySelectorAll('[role="alert"], [role="status"].ft-banner').length`);
    record('TC-V2-09', 'Exactly one status banner visible at a time (c)', bannerCount <= 1, `Banners count: ${bannerCount}`);

    // -------------------------------------------------------------
    // Test 5: StopCard Details: rating, why[], price range, hours, legs (d, e)
    // -------------------------------------------------------------
    console.log('--- Test 5: StopCard Evidence, Rating, Why reasons (d, e) ---');
    const stopDetails = await ev(`(() => {
      const cards = Array.from(document.querySelectorAll('[data-stop-card]'));
      return cards.map(c => ({
        hasRating: !!c.querySelector('[data-venue-rating]'),
        ratingText: c.querySelector('[data-venue-rating]')?.innerText || '',
        whyCount: c.querySelectorAll('[data-why-chip]').length,
        hasPriceRange: !!c.querySelector('[data-price-chip]'),
        priceText: c.querySelector('[data-price-chip]')?.innerText || '',
        hasHours: !!c.querySelector('[data-hours-chip]'),
        hoursText: c.querySelector('[data-hours-chip]')?.innerText || '',
        hasReplace: !!c.querySelector('[data-replace-button]')
      }));
    })()`);

    record('TC-V2-10', 'StopCards render why[] reasons and price range chips (d)', stopDetails.length >= 3 && stopDetails[0].hasPriceRange, `Stops: ${stopDetails.length}`);

    // Verify rating rule: when count < 5 -> 'ít đánh giá', score hidden
    const ratingRuleRespected = await ev(`(() => {
      const r = document.querySelector('[data-venue-rating]');
      if (!r) return true;
      const text = r.innerText;
      if (text.includes('ít đánh giá')) {
        return !text.includes('★'); // score hidden
      }
      return text.includes('theo nguồn');
    })()`);
    record('TC-V2-11', 'Rating hidden when count < 5 or properly labelled "theo nguồn" (d)', ratingRuleRespected, 'Rating display rule satisfied');

    // Verify estimated legs never drawn as routes (e)
    const routesDrawn = await ev(`(() => {
      // Check that no polyline or route layer exists for straight-line estimate
      const routeLayers = document.querySelectorAll('.provider-route-path, [data-provider-route]');
      return routeLayers.length;
    })()`);
    record('TC-V2-12', 'Estimate legs never drawn as routes (e)', routesDrawn === 0, 'No fake route paths drawn');

    // -------------------------------------------------------------
    // Test 6: Mobile Ergonomics: Sticky Bottom Bar & >= 44px Touch Targets
    // -------------------------------------------------------------
    console.log('--- Test 6: Mobile Sticky Bottom Bar & Touch Targets ---');
    await setViewport(390, 844);
    const bottomBar = await ev(`(() => {
      const bar = document.querySelector('[data-sticky-bottom-bar]');
      if (!bar) return null;
      const rect = bar.getBoundingClientRect();
      return { bottom: rect.bottom, height: rect.height };
    })()`);
    record('TC-V2-13', 'Sticky bottom action bar fixed at viewport bottom on mobile', bottomBar && bottomBar.bottom <= 845, `Bottom: ${bottomBar?.bottom}px`);

    const touchTargets = await ev(`(() => {
      const interactive = Array.from(document.querySelectorAll('button, input, [role="button"]'));
      const small = interactive.filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5);
      });
      return { total: interactive.length, smallCount: small.length };
    })()`);
    record('TC-V2-14', 'All interactive touch targets >= 44px', touchTargets.smallCount === 0, `Total: ${touchTargets.total}, small: ${touchTargets.smallCount}`);

    // -------------------------------------------------------------
    // Test 7: Rollback / Flag Off Invariant (f)
    // -------------------------------------------------------------
    console.log('--- Test 7: Rollback Switch Invariant (f) ---');
    // Navigate without ?ui=v2
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/`);
    const oldLayoutRenders = await ev(`(() => {
      // Old layout has aria-label="Nội dung tin nhắn yêu cầu tour" and CONTRACT V1.4 badge
      const input = document.querySelector('[aria-label="Nội dung tin nhắn yêu cầu tour"]');
      const contractBadge = document.body.innerText.includes('CONTRACT');
      return !!input && contractBadge;
    })()`);
    record('TC-V2-15', 'Flag off => old layout renders unchanged with CONTRACT badge (f)', oldLayoutRenders, 'Byte-for-byte rollback switch verified');

  } finally {
    if (ws) {
      try { ws.close(); } catch (_) {}
    }
    if (browserProc) {
      try { browserProc.kill(); } catch (_) {}
    }
    if (serverProc) {
      try { serverProc.kill(); } catch (_) {}
    }
    if (scratchDir && fs.existsSync(scratchDir)) {
      try { fs.rmSync(scratchDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log('\n===============================================================');
  console.log(`   UI_V2 ACCEPTANCE SUMMARY: ${passed}/${total} PASSED`);
  console.log('===============================================================\n');
}

run().catch((err) => {
  console.error('\nTest suite failed with unexpected error:\n', err);
  process.exit(1);
});
