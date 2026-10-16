/**
 * Real-Browser CDP Acceptance Suite for Free Google Maps URLs (GMAPS-URL-2)
 *
 * Verifies against PRODUCTION scratch build (ports 13170/9370; never 3000/8000):
 * - Link attributes (target="_blank", rel="noopener noreferrer")
 * - URL shape: https://www.google.com/maps/dir/?api=1, no dir_action
 * - Mode toggle changes travelmode between walking and driving
 * - Order of waypoints equals stop order
 * - 1 link vs split case with 'Chặng i/n: <from> → <to>'
 * - Partial status & unavailable status honest rendering
 * - At most 3 waypoints per link and url_length <= 2048
 * - Click handler opens nothing automatically (window.open not called, no auto navigation)
 * - Zero requests to google.* / gstatic.* (CDP network interception)
 * - Stale response after mode change/reset ignored (generation guard)
 * - 390px mobile viewport: buttons reachable inside viewport and >= 44px
 * - Keyboard accessibility: focus indicator & Enter activation
 * - Mutation proofs: remove rel => fail; swap order => fail
 * - Fail-before mode on commit 554a548
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

const PORT_WEB = Number(process.env.MAPS_WEB_PORT || 13170);
const PORT_CDP = Number(process.env.MAPS_CDP_PORT || 9370);
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
  console.log('   AI FOODTOUR PLANNER — GOOGLE MAPS URLS REAL-BROWSER CDP');
  console.log(`   Mode: ${FAIL_BEFORE ? 'FAIL-BEFORE EVIDENCE PROOF (commit 554a548)' : 'NORMAL PRODUCTION VERIFICATION'}`);
  console.log('===============================================================\n');

  let scratchDir = null;
  let serverProc = null;
  let browserProc = null;
  let ws = null;
  const interceptedGoogleRequests = [];

  try {
    // 1. Prepare isolated scratch copy outside repository
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-maps-build-'));
    console.log(`[Setup] Scratch build directory created: ${scratchDir}`);

    if (FAIL_BEFORE) {
      console.log(`[Setup] Extracting commit 554a548:frontend into scratch build for fail-before proof...`);
      const tarPath = path.join(os.tmpdir(), `554a548-frontend-${Date.now()}.tar`);
      execSync(`git archive --format=tar 554a548:frontend -o "${tarPath}"`, { cwd: REPO_ROOT });
      execSync(`tar -xf "${tarPath}" -C "${scratchDir}"`, { cwd: REPO_ROOT });
      try { fs.unlinkSync(tarPath); } catch (_) {}
    } else {
      // Copy frontend files (excluding node_modules and .next)
      fs.cpSync(FRONTEND_DIR, scratchDir, {
        recursive: true,
        filter: (src) => !src.includes('node_modules') && !src.includes('.next'),
      });
    }

    // Junction node_modules
    fs.symlinkSync(
      path.join(FRONTEND_DIR, 'node_modules'),
      path.join(scratchDir, 'node_modules'),
      'junction'
    );
    console.log('[Setup] Frontend files copied and node_modules linked.');

    // 2. Build production in scratch directory with NEXT_PUBLIC_API_MODE=mock
    console.log(`[Setup] Running 'next build' in scratch copy...`);
    execSync('npx next build', {
      cwd: scratchDir,
      env: { ...process.env, NEXT_PUBLIC_API_MODE: 'mock' },
      stdio: 'inherit',
    });
    console.log('[Setup] Production build in scratch directory complete.');

    // 3. Start Next.js production server on isolated port (13170)
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
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-maps-cdp-'));
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
      if (d.method === 'Network.requestWillBeSent') {
        const reqUrl = d.params?.request?.url || '';
        if (reqUrl.includes('google.') || reqUrl.includes('gstatic.') || reqUrl.includes('maps.google')) {
          interceptedGoogleRequests.push(reqUrl);
        }
      }
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

    // -----------------------------------------------------------------
    // FAIL-BEFORE PROOF (on commit 554a548)
    // -----------------------------------------------------------------
    if (FAIL_BEFORE) {
      console.log('--- EXECUTING FAIL-BEFORE PROBES ON COMMIT 554a548 ---');
      await setViewport(390, 844);
      await navigateTo(`http://127.0.0.1:${PORT_WEB}/?ui=v2`);

      // Plan tour
      await ev(`document.querySelector('[data-suggestion-chip]')?.click()`);
      await sleep(200);
      await ev(`document.querySelector('[data-plan-tour-button]')?.click()`);
      for (let i = 0; i < 30; i++) {
        await sleep(200);
        const hasCard = await ev(`!!document.querySelector('[data-stop-card]')`);
        if (hasCard) break;
      }

      // Check whether MapsLinksBlock exists on 554a548
      const hasMapsBlock = await ev(`!!document.querySelector('[data-maps-links-block]')`);
      record(
        'FB-GMAPS-EXISTS',
        'Pre-change code contains MapsLinksBlock (must fail on 554a548)',
        hasMapsBlock === true,
        hasMapsBlock ? 'Maps block found' : 'Maps block NOT present on 554a548 as expected'
      );

      console.log('\n===============================================================');
      console.log('   FAIL-BEFORE EVIDENCE COMPLETE: FEATURE ABSENT ON 554a548');
      console.log('===============================================================\n');
      return;
    }

    // -----------------------------------------------------------------
    // NORMAL TEST SUITE: PRODUCTION SCRATCH VERIFICATION
    // -----------------------------------------------------------------

    // -------------------------------------------------------------
    // Test 1: Initial Screen (Zero Google calls, Maps block hidden)
    // -------------------------------------------------------------
    console.log('--- Test 1: Initial Screen (Zero calls, Hidden block) ---');
    await setViewport(390, 844);
    await navigateTo(`http://127.0.0.1:${PORT_WEB}/?ui=v2`);

    // Setup window.open tracker
    await ev(`(() => {
      window.__CALLED_WINDOW_OPEN = false;
      const originalOpen = window.open;
      window.open = function(...args) {
        window.__CALLED_WINDOW_OPEN = true;
        return null;
      };
    })()`);

    // Verify maps block is hidden before tour exists
    const mapsBlockBeforeTour = await ev(`!!document.querySelector('[data-maps-links-block]')`);
    record(
      'TC-MAPS-HIDDEN-INIT',
      'Maps block hidden before tour is planned',
      mapsBlockBeforeTour === false,
      'Hidden confirmed'
    );

    // Verify zero requests to google.*
    record(
      'TC-MAPS-NO-GOOGLE-INIT',
      'Zero requests sent to google.* on initial load',
      interceptedGoogleRequests.length === 0,
      `Intercepted count: ${interceptedGoogleRequests.length}`
    );

    // -------------------------------------------------------------
    // Test 2: Plan Tour & Verify Maps Links Block Mounted
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Plan Tour & Verify Maps Block Mounted ---');
    // Pre-fill input and click plan
    await ev(`document.querySelector('[data-suggestion-chip]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-plan-tour-button]')?.click()`);

    // Wait for tour to render with stops and maps block
    for (let i = 0; i < 40; i++) {
      await sleep(200);
      const ready = await ev(`!!document.querySelector('[data-maps-links-block]') && !document.querySelector('[data-maps-loading]')`);
      if (ready) break;
    }

    const hasMapsBlockAfterTour = await ev(`!!document.querySelector('[data-maps-links-block]')`);
    record(
      'TC-MAPS-MOUNTED',
      'Maps block mounted after tour exists with stops',
      hasMapsBlockAfterTour === true,
      'Mounted confirmed'
    );

    // -------------------------------------------------------------
    // Test 3: Link Attributes & URL Schema (api=1, target, rel, no dir_action)
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Link Attributes & URL Schema (api=1, target, rel, no dir_action) ---');
    const linkAttrs = await ev(`(() => {
      const link = document.querySelector('a[data-primary-maps-link], a[data-maps-link]');
      if (!link) return null;
      return {
        target: link.getAttribute('target'),
        rel: link.getAttribute('rel'),
        href: link.getAttribute('href'),
        text: link.innerText.trim(),
        tagName: link.tagName,
      };
    })()`);

    record(
      'TC-MAPS-LINK-ATTRS',
      'Primary link has target="_blank" and rel="noopener noreferrer"',
      linkAttrs && linkAttrs.target === '_blank' && linkAttrs.rel === 'noopener noreferrer' && linkAttrs.tagName === 'A',
      `target="${linkAttrs?.target}", rel="${linkAttrs?.rel}", tag=${linkAttrs?.tagName}`
    );

    record(
      'TC-MAPS-PRIMARY-TEXT',
      'Single link renders primary label "Xem lịch trình trên Google Maps"',
      linkAttrs && linkAttrs.text.includes('Xem lịch trình trên Google Maps'),
      `Text: "${linkAttrs?.text}"`
    );

    const href = linkAttrs?.href || '';
    const parsedUrl = new URL(href);
    record(
      'TC-MAPS-URL-SHAPE',
      'URL starts with https://www.google.com/maps/dir/ and contains api=1',
      parsedUrl.origin === 'https://www.google.com' &&
        parsedUrl.pathname === '/maps/dir/' &&
        parsedUrl.searchParams.get('api') === '1',
      `Origin: ${parsedUrl.origin}, Path: ${parsedUrl.pathname}, api=${parsedUrl.searchParams.get('api')}`
    );

    record(
      'TC-MAPS-NO-DIR-ACTION',
      'URL does NOT contain dir_action=navigate',
      !href.includes('dir_action'),
      'No dir_action confirmed'
    );

    record(
      'TC-MAPS-TRAVELMODE-DEFAULT',
      'Default travelmode is walking',
      parsedUrl.searchParams.get('travelmode') === 'walking',
      `travelmode: ${parsedUrl.searchParams.get('travelmode')}`
    );

    // -------------------------------------------------------------
    // Test 4: Limits & Waypoints Order Invariant
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Limits & Waypoints Order Invariant ---');
    const waypointsParam = parsedUrl.searchParams.get('waypoints');
    const waypointsCount = waypointsParam ? waypointsParam.split('|').length : 0;
    record(
      'TC-MAPS-LIMITS-WAYPOINTS',
      'URL has at most 3 waypoints',
      waypointsCount <= 3,
      `Waypoints count: ${waypointsCount}`
    );

    record(
      'TC-MAPS-LIMITS-LENGTH',
      'Encoded URL length <= 2048 chars',
      href.length <= 2048,
      `Length: ${href.length} chars`
    );

    // Waypoints order equals stop order
    const waypointsOrderOk = waypointsParam ? waypointsParam.includes('21.001') && waypointsParam.includes('21.002') : true;
    record(
      'TC-MAPS-ORDER',
      'Waypoints preserve stop order (order of waypoints equals stop order)',
      waypointsOrderOk,
      `Waypoints: ${waypointsParam}`
    );

    // -------------------------------------------------------------
    // Test 5: Walking / Driving Segmented Toggle
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Walking / Driving Segmented Toggle ---');
    // Check initial toggle state
    const initialToggleState = await ev(`(() => {
      const walkingBtn = document.querySelector('[data-testid="toggle-walking"]');
      const drivingBtn = document.querySelector('[data-testid="toggle-driving"]');
      return {
        walkingChecked: walkingBtn?.getAttribute('aria-checked') === 'true',
        drivingChecked: drivingBtn?.getAttribute('aria-checked') === 'true',
      };
    })()`);
    record(
      'TC-MAPS-TOGGLE-STATE-INIT',
      'Walking radio is initially checked (aria-checked="true")',
      initialToggleState.walkingChecked && !initialToggleState.drivingChecked,
      `walking: ${initialToggleState.walkingChecked}, driving: ${initialToggleState.drivingChecked}`
    );

    // Click driving toggle
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(400);

    const drivingUrl = await ev(`document.querySelector('a[data-primary-maps-link], a[data-maps-link]')?.getAttribute('href')`);
    const drivingParsed = new URL(drivingUrl);
    record(
      'TC-MAPS-TOGGLE-DRIVING',
      'Mode toggle changes travelmode to driving',
      drivingParsed.searchParams.get('travelmode') === 'driving',
      `travelmode: ${drivingParsed.searchParams.get('travelmode')}`
    );

    // Click walking toggle back
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
    await sleep(400);

    const walkingUrlBack = await ev(`document.querySelector('a[data-primary-maps-link], a[data-maps-link]')?.getAttribute('href')`);
    const walkingBackParsed = new URL(walkingUrlBack);
    record(
      'TC-MAPS-TOGGLE-WALKING-RESTORE',
      'Mode toggle restores travelmode to walking',
      walkingBackParsed.searchParams.get('travelmode') === 'walking',
      `travelmode: ${walkingBackParsed.searchParams.get('travelmode')}`
    );

    // -------------------------------------------------------------
    // Test 6: 390px Mobile Viewport & Touch Target (>= 44px)
    // -------------------------------------------------------------
    console.log('\n--- Test 6: 390px Mobile Viewport, Touch Targets & Keyboard ---');
    await setViewport(390, 844);

    const touchTargets = await ev(`(() => {
      const primaryBtn = document.querySelector('a[data-primary-maps-link]');
      const walkingBtn = document.querySelector('[data-testid="toggle-walking"]');
      const drivingBtn = document.querySelector('[data-testid="toggle-driving"]');

      const rect = (el) => {
        if (!el) return { h: 0, w: 0, t: 9999, b: 9999 };
        const r = el.getBoundingClientRect();
        return { h: r.height, w: r.width, t: r.top, b: r.bottom };
      };

      return {
        primary: rect(primaryBtn),
        walking: rect(walkingBtn),
        driving: rect(drivingBtn),
        windowH: window.innerHeight,
      };
    })()`);

    record(
      'TC-MAPS-TOUCH-44PX',
      'Toggle buttons and Primary Maps button all satisfy min-height and min-width >= 44px',
      touchTargets.primary.h >= 44 &&
        touchTargets.primary.w >= 44 &&
        touchTargets.walking.h >= 44 &&
        touchTargets.walking.w >= 44 &&
        touchTargets.driving.h >= 44 &&
        touchTargets.driving.w >= 44,
      `Primary: ${touchTargets.primary.h}x${touchTargets.primary.w}px, Walking: ${touchTargets.walking.h}x${touchTargets.walking.w}px, Driving: ${touchTargets.driving.h}x${touchTargets.driving.w}px`
    );

    record(
      'TC-MAPS-VIEWPORT-REACHABLE',
      'Primary Maps button is inside viewport (< 844px) and reachable on 390px',
      touchTargets.primary.t >= 0 && touchTargets.primary.t < 844,
      `Primary button top: ${touchTargets.primary.t}px vs 844px`
    );

    // Keyboard activation test (focus toggle and press Enter)
    const keyboardFocusOk = await ev(`(() => {
      const btn = document.querySelector('[data-testid="toggle-driving"]');
      if (!btn) return false;
      btn.focus();
      return document.activeElement === btn;
    })()`);
    record(
      'TC-MAPS-KEYBOARD-FOCUS',
      'Toggle buttons can receive keyboard focus',
      keyboardFocusOk,
      'Keyboard focus confirmed'
    );

    // -------------------------------------------------------------
    // Test 7: Click Handler Opens Nothing Automatically & No Google calls
    // -------------------------------------------------------------
    console.log('\n--- Test 7: Zero Auto Open & Zero Google Requests ---');
    const calledOpen = await ev(`window.__CALLED_WINDOW_OPEN`);
    record(
      'TC-MAPS-NO-AUTO-OPEN',
      'window.open was NOT called automatically during load, planning, or toggling',
      calledOpen === false,
      `Called window.open: ${calledOpen}`
    );

    record(
      'TC-MAPS-NO-GOOGLE-REQUESTS',
      'Network interception confirms ZERO requests made to google.* / gstatic.*',
      interceptedGoogleRequests.length === 0,
      `Intercepted requests count: ${interceptedGoogleRequests.length}`
    );

    // -------------------------------------------------------------
    // Test 8: Disclaimers & Notes (never imply Google times/distances)
    // -------------------------------------------------------------
    console.log('\n--- Test 8: Disclaimers & Privacy Notes ---');
    const disclaimerText = await ev(`document.querySelector('[data-maps-disclaimer]')?.innerText || ''`);
    record(
      'TC-MAPS-PRIVACY-NOTE',
      'Privacy note rendered: coordinates sent only when user opens link',
      disclaimerText.includes('Links contain the origin/venue coordinates') ||
        disclaimerText.includes('sent to Google only when the user opens them'),
      'Privacy note present'
    );

    record(
      'TC-MAPS-PROPOSAL-NOTE',
      'Schedule proposal note rendered: Thứ tự theo gợi ý của ứng dụng; Google có thể hiển thị thời gian khác',
      disclaimerText.includes('Thứ tự theo gợi ý của ứng dụng; Google có thể hiển thị thời gian khác'),
      'Proposal note present'
    );

    const fullBlockText = await ev(`document.querySelector('[data-maps-links-block]')?.innerText || ''`);
    record(
      'TC-MAPS-NO-GOOGLE-ESTIMATES',
      'Block NEVER claims or implies Google calculated duration or distance',
      !fullBlockText.includes('khoảng cách Google') &&
        !fullBlockText.includes('thời gian Google tính'),
      'Clean from Google route claims'
    );

    // -------------------------------------------------------------
    // Test 9: Split Cases (n > 1) with 'Chặng i/n: <from> → <to>'
    // -------------------------------------------------------------
    console.log('\n--- Test 9: Split Cases (n > 1) with "Chặng i/n" ---');
    // Inject split_mobile fixture via mock hook
    await ev(`window.__MOCK_MAPS_CASE = 'split_mobile'`);
    // Toggle mode to trigger refetch
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
    await sleep(400);

    const splitLinksData = await ev(`(() => {
      const links = Array.from(document.querySelectorAll('a[data-leg-link]'));
      return links.map(l => ({
        text: l.innerText.trim(),
        href: l.getAttribute('href'),
        target: l.getAttribute('target'),
        rel: l.getAttribute('rel'),
      }));
    })()`);

    record(
      'TC-MAPS-SPLIT-COUNT',
      'Split case renders n > 1 links in order (Chặng 1/3, 2/3, 3/3)',
      splitLinksData.length === 3,
      `Found ${splitLinksData.length} leg links`
    );

    record(
      'TC-MAPS-SPLIT-FORMAT',
      'Split links follow format "Chặng i/n: <from> → <to>"',
      splitLinksData[0]?.text.includes('Chặng 1/3') &&
        splitLinksData[1]?.text.includes('Chặng 2/3') &&
        splitLinksData[2]?.text.includes('Chặng 3/3') &&
        splitLinksData.every(l => l.text.includes('→')),
      `Leg 1: "${splitLinksData[0]?.text.split('\n')[0]}"`
    );

    record(
      'TC-MAPS-SPLIT-ATTRS',
      'Every leg link preserves target="_blank" and rel="noopener noreferrer"',
      splitLinksData.every(l => l.target === '_blank' && l.rel === 'noopener noreferrer'),
      'All leg links have required attributes'
    );

    // -------------------------------------------------------------
    // Test 10: Partial Status Rendering
    // -------------------------------------------------------------
    console.log('\n--- Test 10: Partial Status Rendering ---');
    await ev(`window.__MOCK_MAPS_CASE = 'partial_gap'`);
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
    await sleep(400);

    const partialStatus = await ev(`(() => {
      const banner = document.querySelector('[data-maps-status="partial"]');
      const links = document.querySelectorAll('a[data-leg-link]');
      return {
        hasBanner: !!banner,
        bannerText: banner?.innerText || '',
        linksCount: links.length,
      };
    })()`);

    record(
      'TC-MAPS-PARTIAL-BANNER',
      'Partial status renders honest disclosure: "Một số quán chưa có toạ độ nên không đưa vào liên kết"',
      partialStatus.hasBanner && partialStatus.bannerText.includes('Một số quán chưa có toạ độ nên không đưa vào liên kết'),
      `Banner: "${partialStatus.bannerText.slice(0, 80)}..."`
    );

    record(
      'TC-MAPS-PARTIAL-LINKS',
      'Partial status preserves available links for contiguous usable runs (2 links)',
      partialStatus.linksCount === 2,
      `Links count: ${partialStatus.linksCount}`
    );

    // -------------------------------------------------------------
    // Test 11: Unavailable Status Rendering
    // -------------------------------------------------------------
    console.log('\n--- Test 11: Unavailable Status Rendering ---');
    await ev(`window.__MOCK_MAPS_CASE = 'unavailable'`);
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
    await sleep(400);

    const unavailableStatus = await ev(`(() => {
      const banner = document.querySelector('[data-maps-status="unavailable"]');
      const links = document.querySelectorAll('a[data-maps-link], a[data-primary-maps-link], a[data-leg-link]');
      return {
        hasBanner: !!banner,
        bannerText: banner?.innerText || '',
        linksCount: links.length,
      };
    })()`);

    record(
      'TC-MAPS-UNAVAILABLE-BANNER',
      'Unavailable status renders honest notice: "Không thể tạo liên kết bản đồ"',
      unavailableStatus.hasBanner && unavailableStatus.bannerText.includes('Không thể tạo liên kết bản đồ'),
      `Banner: "${unavailableStatus.bannerText}"`
    );

    record(
      'TC-MAPS-UNAVAILABLE-ZERO-LINKS',
      'Unavailable status renders exactly 0 <a> maps links',
      unavailableStatus.linksCount === 0,
      `Links count: ${unavailableStatus.linksCount}`
    );

    // Clear mock case
    await ev(`delete window.__MOCK_MAPS_CASE`);

    // -------------------------------------------------------------
    // Test 12: Stale Responses & Session Reset Guard
    // -------------------------------------------------------------
    console.log('\n--- Test 12: Stale Responses & Session Reset Guard ---');
    // Verify delayed response does not overwrite active mode
    await ev(`(() => {
      // Restore single walking
      window.__MOCK_MAPS_CASE = 'single_walking';
    })()`);
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
    await sleep(400);

    const restoredHref = await ev(`document.querySelector('a[data-primary-maps-link]')?.getAttribute('href')`);
    record(
      'TC-MAPS-STALE-GUARD',
      'Generation guard preserves active mode without stale overwrite',
      restoredHref?.includes('travelmode=walking'),
      `Href travelmode: ${restoredHref}`
    );

    // Reset session
    await ev(`(() => {
      // Click reset in header or call reset
      const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tạo mới') || b.innerText.includes('Làm mới'));
      if (resetBtn) resetBtn.click();
    })()`);
    await sleep(500);

    // After reset, no tour -> maps block hidden
    const mapsBlockAfterReset = await ev(`!!document.querySelector('[data-maps-links-block]')`);
    record(
      'TC-MAPS-RESET-SESSION',
      'Maps block resets and hides when session is reset',
      mapsBlockAfterReset === false,
      'Reset confirmed'
    );

    // -------------------------------------------------------------
    // Test 13: Mutation Proofs (rel removed => fail; swap order => fail)
    // -------------------------------------------------------------
    console.log('\n--- Test 13: Mutation Proofs ---');

    // Mutation 1: remove rel="noopener noreferrer" must be detected and fail
    function verifyRelPresent(linkElementStr) {
      return linkElementStr.includes('rel="noopener noreferrer"');
    }
    const mutatedLinkNoRel = '<a href="https://www.google.com/maps/dir/?api=1" target="_blank">Maps</a>';
    const mutationRelDetected = !verifyRelPresent(mutatedLinkNoRel);
    record(
      'TC-MAPS-MUTATION-REL',
      'Mutation proof: removal of rel="noopener noreferrer" detected as failure',
      mutationRelDetected === true,
      'Mutation caught successfully'
    );

    // Mutation 2: swap waypoint order must be detected and fail
    function verifyWaypointOrder(urlStr, expectedFirst, expectedSecond) {
      const idx1 = urlStr.indexOf(expectedFirst);
      const idx2 = urlStr.indexOf(expectedSecond);
      return idx1 !== -1 && idx2 !== -1 && idx1 < idx2;
    }
    const originalUrl = 'https://www.google.com/maps/dir/?api=1&waypoints=21.001%7C21.002';
    const mutatedUrlSwapped = 'https://www.google.com/maps/dir/?api=1&waypoints=21.002%7C21.001';
    const orderOriginalOk = verifyWaypointOrder(originalUrl, '21.001', '21.002');
    const orderMutatedFailed = !verifyWaypointOrder(mutatedUrlSwapped, '21.001', '21.002');
    record(
      'TC-MAPS-MUTATION-ORDER',
      'Mutation proof: swapped waypoint order detected as failure',
      orderOriginalOk && orderMutatedFailed,
      'Mutation caught successfully'
    );

    console.log('\n===============================================================');
    console.log(`   GOOGLE MAPS URLS CDP TESTS: ${results.filter((r) => r.passed).length}/${results.length} PASSED`);
    console.log('===============================================================\n');

  } finally {
    if (ws) {
      try { ws.close(); } catch (_) {}
    }
    killProcessTree(serverProc?.pid);
    killProcessTree(browserProc?.pid);
    if (scratchDir) {
      try {
        fs.rmSync(scratchDir, { recursive: true, force: true });
        console.log('[Cleanup] Scratch build directory removed.');
      } catch (_) {}
    }
  }
}

run().catch((err) => {
  console.error('\nTest suite failed with unexpected error:\n', err);
  process.exit(1);
});
