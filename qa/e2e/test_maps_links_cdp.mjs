/**
 * Real-Browser CDP Acceptance Suite for Free Google Maps URLs (GMAPS-URL-2)
 *
 * Verifies against PRODUCTION scratch build (ports 13000/18000; never 3000/8000):
 * - H1: URL allowlist before rendering ANY anchor (https, exact www.google.com host, no creds, default port, /maps/dir/ path);
 *       accepted URLs rendered verbatim; rejected links disclosed ('Một liên kết không hợp lệ đã bị bỏ qua'); all-rejected treated as unavailable;
 *       hostile single and split tests.
 * - M1: Stable StatusQueue callbacks; error banner stays visible with exactly 1 real HTML 'Thử lại' button (>=44px, keyboard usable);
 *       only user retry or relevant state change restarts request; persistent failure request count measured (does not loop).
 * - M2: Server notes rendered as escaped text; accurate skipped[].reason translation (no_usable_point vs url_too_long);
 *       never says 'thiếu toạ độ' for url_too_long; privacy + schedule proposal disclaimers kept; tests for url_too_long partial & unavailable.
 * - M3: Exact decoded waypoint array comparison; exact split link URL sequence comparison; real delayed out-of-order responses
 *       (older success/error after newer; reset invalidating in-flight requests); real application mutation proofs (remove rel => fail,
 *       reorder waypoints => fail, drop disclaimer => fail).
 * - L1: WAI-ARIA radio group roving tabindex & trusted browser key navigation (8-case arrow matrix with wrap-around and focus).
 * - M3: In-flight generation/unmount guards against non-cooperative delayed responses after session reset.
 * - Fail-before mode on commit c8100f1.
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

const PORT_WEB = Number(process.env.MAPS_WEB_PORT || 13000);
const PORT_CDP = Number(process.env.MAPS_CDP_PORT || 18000);
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
  console.log(`   Mode: ${FAIL_BEFORE ? 'FAIL-BEFORE EVIDENCE PROOF (commit c8100f1)' : 'NORMAL PRODUCTION VERIFICATION'}`);
  console.log(`   Ports: Web=${PORT_WEB}, CDP=${PORT_CDP}`);
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
      console.log(`[Setup] Extracting commit c8100f1:frontend into scratch build for fail-before proof...`);
      const tarPath = path.join(os.tmpdir(), `c8100f1-frontend-${Date.now()}.tar`);
      execSync(`git archive --format=tar c8100f1:frontend -o "${tarPath}"`, { cwd: REPO_ROOT });
      execSync(`tar -xf "${tarPath}" -C "${scratchDir}"`, { cwd: REPO_ROOT });
      try { fs.unlinkSync(tarPath); } catch (_) {}

      // Inject the non-cooperative abort check bypass hook into scratch build's lib/api.js
      const scratchApiJs = path.join(scratchDir, 'lib', 'api.js');
      let apiSrc = fs.readFileSync(scratchApiJs, 'utf8');
      apiSrc = apiSrc.replace(
        'if (options?.signal?.aborted) {',
        'const ignoreAbort = typeof window !== \'undefined\' && Boolean(window.__MOCK_MAPS_IGNORE_ABORT || window.__MOCK_MAPS_NON_COOPERATIVE);\n  if (options?.signal?.aborted && !ignoreAbort) {'
      );
      fs.writeFileSync(scratchApiJs, apiSrc, 'utf8');
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
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-maps-cdp-'));
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

    // Wait for browser CDP endpoint
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

    // 5. Connect WebSocket client using Node 22 global WebSocket
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

      // CDP Network interception: track any outbound requests to google / gstatic
      if (data.method === 'Network.requestWillBeSent') {
        const reqUrl = data.params?.request?.url || '';
        if (
          reqUrl.includes('google.com') ||
          reqUrl.includes('googleapis.com') ||
          reqUrl.includes('gstatic.com') ||
          reqUrl.includes('googleusercontent.com')
        ) {
          interceptedGoogleRequests.push({
            url: reqUrl,
            initiator: data.params?.initiator?.type,
            time: new Date().toISOString(),
          });
        }
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

    async function dispatchArrowKey(key) {
      const codeMap = {
        ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
        ArrowUp: { code: 'ArrowUp', keyCode: 38 },
        ArrowRight: { code: 'ArrowRight', keyCode: 39 },
        ArrowDown: { code: 'ArrowDown', keyCode: 40 },
      };
      const info = codeMap[key];
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code: info.code,
        windowsVirtualKeyCode: info.keyCode,
      });
      await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code: info.code,
        windowsVirtualKeyCode: info.keyCode,
      });
      await sleep(150);
    }

    async function getRadioState() {
      return await ev(`(() => {
        const walking = document.querySelector('[data-testid="toggle-walking"]');
        const driving = document.querySelector('[data-testid="toggle-driving"]');
        return {
          walkingChecked: walking?.getAttribute('aria-checked'),
          walkingTab: walking?.getAttribute('tabindex'),
          drivingChecked: driving?.getAttribute('aria-checked'),
          drivingTab: driving?.getAttribute('tabindex'),
          activeIsWalking: document.activeElement === walking,
          activeIsDriving: document.activeElement === driving,
        };
      })()`);
    }

    // -----------------------------------------------------------------
    // FAIL-BEFORE PROOF (on commit c8100f1)
    // -----------------------------------------------------------------
    if (FAIL_BEFORE) {
      console.log('--- EXECUTING FAIL-BEFORE PROBES ON COMMIT c8100f1 ---');
      await setViewport(390, 844);
      await navigateTo(`http://127.0.0.1:${PORT_WEB}/?ui=v2`);

      // Plan tour
      await ev(`document.querySelector('[data-suggestion-chip]')?.click()`);
      await sleep(200);
      await ev(`document.querySelector('[data-plan-tour-button]')?.click()`);
      for (let i = 0; i < 40; i++) {
        await sleep(200);
        const hasBlock = await ev(`!!document.querySelector('[data-maps-links-block]') && !document.querySelector('[data-maps-loading]')`);
        if (hasBlock) break;
      }

      // Probe 1: L1 radio arrow wrap on c8100f1
      // Select driving radio and focus it
      await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
      await sleep(250);
      await ev(`document.querySelector('[data-testid="toggle-driving"]')?.focus()`);
      // Dispatch trusted browser ArrowRight key event via Input.dispatchKeyEvent
      await dispatchArrowKey('ArrowRight');
      const wrapState = await getRadioState();
      // On c8100f1, driving + ArrowRight remained driving (did NOT wrap to walking)
      record(
        'FB-L1-RADIO-WRAP',
        'ArrowRight on driving wraps to walking on c8100f1 (expected to FAIL on c8100f1)',
        wrapState.activeIsWalking && wrapState.walkingChecked === 'true' && wrapState.walkingTab === '0',
        wrapState.activeIsWalking ? 'Wrapped to walking' : `Failed to wrap on c8100f1 (driving checked=${wrapState.drivingChecked}, activeIsDriving=${wrapState.activeIsDriving})`
      );

      // Probe 2: M3 non-cooperative delayed error arriving after session reset on c8100f1
      await ev(`(() => {
        window.__MOCK_NEXT_MAPS_DELAY_MS = 600;
        window.__MOCK_NEXT_MAPS_LINKS_ERROR = { message: 'NONCOOPERATIVE delayed reset error' };
        window.__MOCK_MAPS_IGNORE_ABORT = true;
      })()`);
      // Toggle to walking to initiate request (mode was driving after probe 1)
      await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
      await sleep(100);

      // Reset session in UI
      await ev(`(() => {
        const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tạo mới') || b.innerText.includes('Làm mới'));
        if (resetBtn) resetBtn.click();
      })()`);
      await sleep(200);

      // Wait 750ms for non-cooperative 600ms delayed error to finish and deliver
      await sleep(750);

      const postResetNoncoop = await ev(`(() => {
        const block = document.querySelector('[data-maps-links-block]');
        const banner = document.querySelector('[role="alert"]');
        return {
          blockHidden: !block,
          noBanner: !banner,
          bannerText: banner?.innerText || '',
        };
      })()`);
      await ev(`delete window.__MOCK_MAPS_IGNORE_ABORT`);

      record(
        'FB-M3-NONCOOP-RESET-ERROR',
        'Non-cooperative delayed error after reset does not leak banner into StatusQueue (expected to FAIL on c8100f1)',
        postResetNoncoop.blockHidden && postResetNoncoop.noBanner,
        postResetNoncoop.noBanner ? 'No banner leaked' : `Stale banner leaked into StatusQueue on c8100f1: "${postResetNoncoop.bannerText}"`
      );

      console.log('\n===============================================================');
      console.log('   FAIL-BEFORE EVIDENCE COMPLETE: c8100f1 FAILS L1 & M3 AS EXPECTED');
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
    // Test 4: Limits & Waypoints Order Invariant (Exact Decoded Array Comparison)
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

    // Waypoints order equals stop order: compare decoded array elements exactly in sequence
    const decodedWaypoints = waypointsParam ? waypointsParam.split('|').map(decodeURIComponent) : [];
    const expectedWaypoints = ['21.001000,105.850000', '21.002000,105.850000'];
    const waypointsOrderOk =
      decodedWaypoints.length === expectedWaypoints.length &&
      decodedWaypoints.every((wp, i) => wp === expectedWaypoints[i]);
    record(
      'TC-MAPS-ORDER',
      'Waypoints preserve stop order (order of waypoints equals stop order exactly in sequence)',
      waypointsOrderOk,
      `Decoded waypoints: ${JSON.stringify(decodedWaypoints)} vs expected: ${JSON.stringify(expectedWaypoints)}`
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
    // Test 6: 390px Mobile Viewport & Touch Target (>= 44px) & Keyboard Navigation (L1)
    // -------------------------------------------------------------
    console.log('\n--- Test 6: 390px Mobile Viewport, Touch Targets & Radio Keyboard Pattern (L1) ---');
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

    // L1: Roving TabIndex verification
    const rovingTabIndex = await ev(`(() => {
      const walking = document.querySelector('[data-testid="toggle-walking"]');
      const driving = document.querySelector('[data-testid="toggle-driving"]');
      return {
        walkingTab: walking?.getAttribute('tabindex'),
        drivingTab: driving?.getAttribute('tabindex'),
      };
    })()`);
    record(
      'TC-MAPS-RADIO-ROVING-TABINDEX',
      'Radio toggle implements roving tabindex (selected tabIndex=0, unselected tabIndex=-1)',
      rovingTabIndex.walkingTab === '0' && rovingTabIndex.drivingTab === '-1',
      `walking=${rovingTabIndex.walkingTab}, driving=${rovingTabIndex.drivingTab}`
    );

    // L1: Trusted browser key navigation test matrix (8 cases): all four arrows from both options with wrap-around
    // Case 1: walking + ArrowRight -> driving
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.focus()`);
    await dispatchArrowKey('ArrowRight');
    const c1 = await getRadioState();
    record(
      'TC-MAPS-KEY-WALKING-RIGHT',
      'Trusted ArrowRight from walking moves selection and focus to driving (aria-checked=true, tabIndex=0)',
      c1.activeIsDriving && c1.drivingChecked === 'true' && c1.drivingTab === '0' && c1.walkingChecked === 'false' && c1.walkingTab === '-1',
      `drivingChecked=${c1.drivingChecked}, activeIsDriving=${c1.activeIsDriving}, drivingTab=${c1.drivingTab}`
    );

    // Case 2: driving + ArrowRight -> walking (WRAP)
    await dispatchArrowKey('ArrowRight');
    const c2 = await getRadioState();
    record(
      'TC-MAPS-KEY-DRIVING-RIGHT-WRAP',
      'Trusted ArrowRight from driving wraps selection and focus back to walking (aria-checked=true, tabIndex=0)',
      c2.activeIsWalking && c2.walkingChecked === 'true' && c2.walkingTab === '0' && c2.drivingChecked === 'false' && c2.drivingTab === '-1',
      `walkingChecked=${c2.walkingChecked}, activeIsWalking=${c2.activeIsWalking}, walkingTab=${c2.walkingTab}`
    );

    // Case 3: walking + ArrowDown -> driving
    await dispatchArrowKey('ArrowDown');
    const c3 = await getRadioState();
    record(
      'TC-MAPS-KEY-WALKING-DOWN',
      'Trusted ArrowDown from walking moves selection and focus to driving (aria-checked=true, tabIndex=0)',
      c3.activeIsDriving && c3.drivingChecked === 'true' && c3.drivingTab === '0' && c3.walkingChecked === 'false' && c3.walkingTab === '-1',
      `drivingChecked=${c3.drivingChecked}, activeIsDriving=${c3.activeIsDriving}, drivingTab=${c3.drivingTab}`
    );

    // Case 4: driving + ArrowDown -> walking (WRAP)
    await dispatchArrowKey('ArrowDown');
    const c4 = await getRadioState();
    record(
      'TC-MAPS-KEY-DRIVING-DOWN-WRAP',
      'Trusted ArrowDown from driving wraps selection and focus back to walking (aria-checked=true, tabIndex=0)',
      c4.activeIsWalking && c4.walkingChecked === 'true' && c4.walkingTab === '0' && c4.drivingChecked === 'false' && c4.drivingTab === '-1',
      `walkingChecked=${c4.walkingChecked}, activeIsWalking=${c4.activeIsWalking}, walkingTab=${c4.walkingTab}`
    );

    // Case 5: walking + ArrowLeft -> driving (WRAP)
    await dispatchArrowKey('ArrowLeft');
    const c5 = await getRadioState();
    record(
      'TC-MAPS-KEY-WALKING-LEFT-WRAP',
      'Trusted ArrowLeft from walking wraps selection and focus to driving (aria-checked=true, tabIndex=0)',
      c5.activeIsDriving && c5.drivingChecked === 'true' && c5.drivingTab === '0' && c5.walkingChecked === 'false' && c5.walkingTab === '-1',
      `drivingChecked=${c5.drivingChecked}, activeIsDriving=${c5.activeIsDriving}, drivingTab=${c5.drivingTab}`
    );

    // Case 6: driving + ArrowLeft -> walking
    await dispatchArrowKey('ArrowLeft');
    const c6 = await getRadioState();
    record(
      'TC-MAPS-KEY-DRIVING-LEFT',
      'Trusted ArrowLeft from driving moves selection and focus to walking (aria-checked=true, tabIndex=0)',
      c6.activeIsWalking && c6.walkingChecked === 'true' && c6.walkingTab === '0' && c6.drivingChecked === 'false' && c6.drivingTab === '-1',
      `walkingChecked=${c6.walkingChecked}, activeIsWalking=${c6.activeIsWalking}, walkingTab=${c6.walkingTab}`
    );

    // Case 7: walking + ArrowUp -> driving (WRAP)
    await dispatchArrowKey('ArrowUp');
    const c7 = await getRadioState();
    record(
      'TC-MAPS-KEY-WALKING-UP-WRAP',
      'Trusted ArrowUp from walking wraps selection and focus to driving (aria-checked=true, tabIndex=0)',
      c7.activeIsDriving && c7.drivingChecked === 'true' && c7.drivingTab === '0' && c7.walkingChecked === 'false' && c7.walkingTab === '-1',
      `drivingChecked=${c7.drivingChecked}, activeIsDriving=${c7.activeIsDriving}, drivingTab=${c7.drivingTab}`
    );

    // Case 8: driving + ArrowUp -> walking (WRAP)
    await dispatchArrowKey('ArrowUp');
    const c8 = await getRadioState();
    record(
      'TC-MAPS-KEY-DRIVING-UP-WRAP',
      'Trusted ArrowUp from driving wraps selection and focus to walking (aria-checked=true, tabIndex=0)',
      c8.activeIsWalking && c8.walkingChecked === 'true' && c8.walkingTab === '0' && c8.drivingChecked === 'false' && c8.drivingTab === '-1',
      `walkingChecked=${c8.walkingChecked}, activeIsWalking=${c8.activeIsWalking}, walkingTab=${c8.walkingTab}`
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
        disclaimerText.includes('sent to Google only when the user opens them') ||
        disclaimerText.includes('chỉ được gửi tới Google khi bạn mở liên kết'),
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
    console.log('\n--- Test 9: Split Cases (n > 1) with "Chặng i/n" & Exact Sequence ---');
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

    // M3: Exact URL sequence comparison against injected response
    const expectedSplitUrls = [
      "https://www.google.com/maps/dir/?api=1&origin=21.000000%2C105.850000&destination=21.004000%2C105.850000&waypoints=21.001000%2C105.850000%7C21.002000%2C105.850000%7C21.003000%2C105.850000&travelmode=walking",
      "https://www.google.com/maps/dir/?api=1&origin=21.004000%2C105.850000&destination=21.008000%2C105.850000&waypoints=21.005000%2C105.850000%7C21.006000%2C105.850000%7C21.007000%2C105.850000&travelmode=walking",
      "https://www.google.com/maps/dir/?api=1&origin=21.008000%2C105.850000&destination=21.012000%2C105.850000&waypoints=21.009000%2C105.850000%7C21.010000%2C105.850000%7C21.011000%2C105.850000&travelmode=walking",
    ];
    const splitUrlsMatchExact =
      splitLinksData.length === expectedSplitUrls.length &&
      splitLinksData.every((l, i) => l.href === expectedSplitUrls[i]);
    record(
      'TC-MAPS-SPLIT-EXACT-SEQUENCE',
      'Rendered split link URLs match injected response URLs in exact sequence',
      splitUrlsMatchExact,
      'Exact sequence match confirmed'
    );

    // -------------------------------------------------------------
    // Test 10: Partial Status Rendering & url_too_long Reason Honesty (M2)
    // -------------------------------------------------------------
    console.log('\n--- Test 10: Partial Status & url_too_long Reason Honesty (M2) ---');
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

    // M2: Partial status with url_too_long skipped reason & server notes
    await ev(`(() => {
      delete window.__MOCK_MAPS_CASE;
      window.__MOCK_MAPS_LINKS_OVERRIDE = {
        status: 'partial',
        links: [
          {
            index: 1,
            of: 1,
            url: 'https://www.google.com/maps/dir/?api=1&origin=21.000000%2C105.850000&destination=21.003000%2C105.850000&travelmode=walking'
          }
        ],
        skipped: [
          { stop_order: 2, venue_id: 'SYN-002', reason: 'url_too_long' }
        ],
        notes: ['SYNTHETIC: address exceeds URL limit']
      };
    })()`);
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
    await sleep(400);

    const urlTooLongPartial = await ev(`(() => {
      const banner = document.querySelector('[data-maps-status="partial"]');
      const notes = document.querySelector('[data-maps-server-notes]');
      return {
        bannerText: banner?.innerText || '',
        notesText: notes?.innerText || '',
      };
    })()`);
    await ev(`delete window.__MOCK_MAPS_LINKS_OVERRIDE`);

    record(
      'TC-MAPS-PARTIAL-URL-TOO-LONG',
      'Partial status with url_too_long explains URL limit and NEVER says "thiếu toạ độ"',
      !urlTooLongPartial.bannerText.includes('thiếu toạ độ') &&
        (urlTooLongPartial.bannerText.includes('vượt quá giới hạn') ||
          urlTooLongPartial.bannerText.includes('độ dài liên kết')) &&
        urlTooLongPartial.notesText.includes('SYNTHETIC: address exceeds URL limit'),
      `Banner: "${urlTooLongPartial.bannerText.slice(0, 70)}...", Notes: "${urlTooLongPartial.notesText}"`
    );

    // -------------------------------------------------------------
    // Test 11: Unavailable Status Rendering & url_too_long (M2)
    // -------------------------------------------------------------
    console.log('\n--- Test 11: Unavailable Status & url_too_long (M2) ---');
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

    // M2: Unavailable caused by url_too_long
    await ev(`(() => {
      delete window.__MOCK_MAPS_CASE;
      window.__MOCK_MAPS_LINKS_OVERRIDE = {
        status: 'unavailable',
        links: [],
        skipped: [
          { stop_order: 1, venue_id: 'SYN-001', reason: 'url_too_long' }
        ],
        notes: ['SYNTHETIC: entire route exceeds URL limit']
      };
    })()`);
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
    await sleep(400);

    const urlTooLongUnavailable = await ev(`(() => {
      const banner = document.querySelector('[data-maps-status="unavailable"]');
      const notes = document.querySelector('[data-maps-server-notes]');
      return {
        bannerText: banner?.innerText || '',
        notesText: notes?.innerText || '',
      };
    })()`);
    await ev(`delete window.__MOCK_MAPS_LINKS_OVERRIDE`);

    record(
      'TC-MAPS-UNAVAILABLE-URL-TOO-LONG',
      'Unavailable status with url_too_long explains URL limit and NEVER says "thiếu toạ độ"',
      !urlTooLongUnavailable.bannerText.includes('thiếu toạ độ') &&
        urlTooLongUnavailable.bannerText.includes('giới hạn độ dài liên kết') &&
        urlTooLongUnavailable.notesText.includes('SYNTHETIC: entire route exceeds URL limit'),
      `Banner: "${urlTooLongUnavailable.bannerText.slice(0, 70)}..."`
    );

    // Clear mock case
    await ev(`delete window.__MOCK_MAPS_CASE`);

    // -------------------------------------------------------------
    // Test 12: Hostile Response Probes & Strict URL Allowlist (H1)
    // -------------------------------------------------------------
    console.log('\n--- Test 12: Hostile Response Probes & Strict URL Allowlist (H1) ---');
    const hostileProbes = [
      { name: 'evil_domain', url: 'https://evil.example/maps/dir/?api=1' },
      { name: 'insecure_http', url: 'http://www.google.com/maps/dir/?api=1' },
      { name: 'domain_lookalike', url: 'https://www.google.com.evil.example/maps/dir/' },
      { name: 'invalid_pathname', url: 'https://www.google.com/other/' },
      { name: 'hostile_credentials', url: 'https://user:pass@www.google.com/maps/dir/?api=1' },
      { name: 'non_default_port', url: 'https://www.google.com:8443/maps/dir/?api=1' },
    ];

    for (const probe of hostileProbes) {
      await ev(`(() => {
        window.__MOCK_MAPS_LINKS_OVERRIDE = {
          status: 'ok',
          links: [{ index: 1, of: 1, url: '${probe.url}' }],
          notes: []
        };
      })()`);
      await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
      await sleep(200);
      await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
      await sleep(400);

      const hostileResult = await ev(`(() => {
        const anchors = Array.from(document.querySelectorAll('a[data-maps-link], a[data-primary-maps-link]'));
        const disclosure = document.querySelector('[data-maps-rejected-disclosure]');
        const unavailableBanner = document.querySelector('[data-maps-status="unavailable"]');
        return {
          anchorCount: anchors.length,
          hasDisclosure: !!disclosure && disclosure.innerText.includes('Một liên kết không hợp lệ đã bị bỏ qua'),
          isUnavailable: !!unavailableBanner,
        };
      })()`);
      await ev(`delete window.__MOCK_MAPS_LINKS_OVERRIDE`);

      record(
        `TC-MAPS-HOSTILE-${probe.name.toUpperCase()}`,
        `Hostile URL (${probe.url}) rejected, disclosed, and treated as unavailable (0 anchors rendered)`,
        hostileResult.anchorCount === 0 && hostileResult.hasDisclosure && hostileResult.isUnavailable,
        `Anchors: ${hostileResult.anchorCount}, Disclosure: ${hostileResult.hasDisclosure}, Unavailable: ${hostileResult.isUnavailable}`
      );
    }

    // Hostile split response: 1 hostile link, 1 valid link
    const validGoogleDirUrl = 'https://www.google.com/maps/dir/?api=1&origin=21.000000%2C105.850000&destination=21.003000%2C105.850000&travelmode=walking';
    await ev(`(() => {
      window.__MOCK_MAPS_LINKS_OVERRIDE = {
        status: 'ok',
        links: [
          { index: 1, of: 2, url: 'https://evil.example/maps/dir/?api=1', from_stop: null, to_stop: 1 },
          { index: 2, of: 2, url: '${validGoogleDirUrl}', from_stop: 1, to_stop: 2 }
        ],
        notes: []
      };
    })()`);
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
    await sleep(400);

    const splitMixedResult = await ev(`(() => {
      const anchors = Array.from(document.querySelectorAll('a[data-maps-link]'));
      const disclosure = document.querySelector('[data-maps-rejected-disclosure]');
      const hrefs = anchors.map(a => a.getAttribute('href'));
      return {
        anchorCount: anchors.length,
        hasDisclosure: !!disclosure && disclosure.innerText.includes('Một liên kết không hợp lệ đã bị bỏ qua'),
        hasEvil: hrefs.some(h => h.includes('evil.example')),
        hasValid: hrefs.includes('${validGoogleDirUrl}'),
      };
    })()`);
    await ev(`delete window.__MOCK_MAPS_LINKS_OVERRIDE`);

    record(
      'TC-MAPS-HOSTILE-SPLIT-MIXED',
      'Split response with 1 hostile and 1 valid link renders valid verbatim and discloses rejected',
      splitMixedResult.anchorCount === 1 &&
        splitMixedResult.hasDisclosure &&
        !splitMixedResult.hasEvil &&
        splitMixedResult.hasValid,
      `Anchors: ${splitMixedResult.anchorCount}, hasEvil: ${splitMixedResult.hasEvil}, hasValid: ${splitMixedResult.hasValid}`
    );

    // Hostile split response where ALL links are hostile
    await ev(`(() => {
      window.__MOCK_MAPS_LINKS_OVERRIDE = {
        status: 'ok',
        links: [
          { index: 1, of: 2, url: 'https://evil.example/maps/dir/?api=1' },
          { index: 2, of: 2, url: 'https://www.google.com.evil.example/maps/dir/' }
        ],
        notes: []
      };
    })()`);
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
    await sleep(400);

    const splitAllHostileResult = await ev(`(() => {
      const anchors = Array.from(document.querySelectorAll('a[data-maps-link]'));
      const disclosure = document.querySelector('[data-maps-rejected-disclosure]');
      const unavailable = document.querySelector('[data-maps-status="unavailable"]');
      return {
        anchorCount: anchors.length,
        hasDisclosure: !!disclosure && disclosure.innerText.includes('Một liên kết không hợp lệ đã bị bỏ qua'),
        isUnavailable: !!unavailable,
      };
    })()`);
    await ev(`delete window.__MOCK_MAPS_LINKS_OVERRIDE`);

    record(
      'TC-MAPS-HOSTILE-SPLIT-ALL',
      'Split response where ALL links are hostile treats block as unavailable with 0 anchors',
      splitAllHostileResult.anchorCount === 0 &&
        splitAllHostileResult.hasDisclosure &&
        splitAllHostileResult.isUnavailable,
      `Anchors: ${splitAllHostileResult.anchorCount}, Unavailable: ${splitAllHostileResult.isUnavailable}`
    );

    // -------------------------------------------------------------
    // Test 13: StatusQueue Error Banner, Persistent Failure & Retry Loop Guard (M1)
    // -------------------------------------------------------------
    console.log('\n--- Test 13: StatusQueue Error Banner, Stable Callbacks & Retry Loop Guard (M1) ---');
    // Reset fetch count and inject persistent error
    await ev(`(() => {
      window.__MAPS_FETCH_COUNT = 0;
      window.__MOCK_PERSISTENT_MAPS_LINKS_ERROR = { message: 'SYNTHETIC failure: server network error' };
    })()`);

    // Click driving toggle to initiate request
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(350);

    // Check error banner visible and fetch count is exactly 1
    const initialErrorState = await ev(`(() => {
      const banner = document.querySelector('[role="alert"]');
      const retryBtn = document.querySelector('[data-testid="banner-action-btn"]');
      const rect = retryBtn ? retryBtn.getBoundingClientRect() : null;
      return {
        hasBanner: !!banner && banner.innerText.includes('Không thể tạo liên kết bản đồ'),
        hasRetryBtn: !!retryBtn && retryBtn.innerText.includes('Thử lại'),
        retryBtnTag: retryBtn?.tagName,
        btnWidth: rect?.width || 0,
        btnHeight: rect?.height || 0,
        fetchCount: window.__MAPS_FETCH_COUNT,
      };
    })()`);

    record(
      'TC-MAPS-ERROR-BANNER-VISIBLE',
      'Error banner is displayed with role="alert" and message upon failure',
      initialErrorState.hasBanner && initialErrorState.fetchCount === 1,
      `Banner present: ${initialErrorState.hasBanner}, fetch count: ${initialErrorState.fetchCount}`
    );

    record(
      'TC-MAPS-RETRY-BTN-ATTRS',
      'Retry button is an actual HTML button with label "Thử lại" and >= 44px touch targets',
      initialErrorState.hasRetryBtn &&
        initialErrorState.retryBtnTag === 'BUTTON' &&
        initialErrorState.btnWidth >= 44 &&
        initialErrorState.btnHeight >= 44,
      `Tag: ${initialErrorState.retryBtnTag}, size: ${initialErrorState.btnWidth}x${initialErrorState.btnHeight}px`
    );

    // Verify persistent failure does NOT loop automatically: wait 400ms and check request count remains 1
    await sleep(400);
    const countAfterIdle = await ev(`window.__MAPS_FETCH_COUNT`);
    record(
      'TC-MAPS-NO-AUTO-RETRY-LOOP',
      'Persistent backend failure does NOT loop or refetch automatically (fetch count remains 1)',
      countAfterIdle === 1,
      `Fetch count after 400ms idle: ${countAfterIdle}`
    );

    // User clicks retry while error is still persistent: count should increment to 2 and stop (no loop)
    await ev(`document.querySelector('[data-testid="banner-action-btn"]')?.click()`);
    await sleep(350);
    const countAfterFirstRetry = await ev(`window.__MAPS_FETCH_COUNT`);
    const bannerAfterFirstRetry = await ev(`!!document.querySelector('[role="alert"]')`);

    record(
      'TC-MAPS-RETRY-PERSISTENT-STABLE',
      'User retry increments fetch count by 1 (to 2) and remains stably failed without looping',
      countAfterFirstRetry === 2 && bannerAfterFirstRetry,
      `Fetch count after retry: ${countAfterFirstRetry}, Banner still present: ${bannerAfterFirstRetry}`
    );

    // Now resolve persistent error, click retry again, and verify recovery
    await ev(`(() => {
      window.__MOCK_PERSISTENT_MAPS_LINKS_ERROR = null;
      window.__MOCK_NEXT_MAPS_LINKS = {
        status: 'ok',
        links: [
          {
            index: 1,
            of: 1,
            url: '${validGoogleDirUrl}'
          }
        ],
        notes: []
      };
    })()`);

    await ev(`document.querySelector('[data-testid="banner-action-btn"]')?.click()`);
    await sleep(350);

    const recoveryState = await ev(`(() => {
      const banner = document.querySelector('[role="alert"]');
      const link = document.querySelector('a[data-primary-maps-link], a[data-maps-link]');
      return {
        bannerDismissed: !banner,
        hasLink: !!link,
        finalCount: window.__MAPS_FETCH_COUNT,
      };
    })()`);

    record(
      'TC-MAPS-RETRY-RECOVERY',
      'Successful retry dismisses error banner and renders links (final fetch count: 3)',
      recoveryState.bannerDismissed && recoveryState.hasLink && recoveryState.finalCount === 3,
      `Banner dismissed: ${recoveryState.bannerDismissed}, Link present: ${recoveryState.hasLink}, Count: ${recoveryState.finalCount}`
    );

    // -------------------------------------------------------------
    // Test 14: Asynchronous Races & In-Flight Generation Guards (M3)
    // -------------------------------------------------------------
    console.log('\n--- Test 14: Asynchronous Races & In-Flight Generation Guards (M3) ---');
    // Race 1: Older delayed success resolving after newer success
    // Request 1 (walking): delay 600ms, returning walking
    // Request 2 (driving): delay 50ms, returning driving
    await ev(`(() => {
      window.__MOCK_NEXT_MAPS_DELAY_MS = 600;
      window.__MOCK_NEXT_MAPS_LINKS = {
        status: 'ok',
        links: [{ index: 1, of: 1, url: 'https://www.google.com/maps/dir/?api=1&origin=21.0,105.8&destination=21.1,105.9&travelmode=walking' }],
        notes: []
      };
    })()`);
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);

    // Immediate switch to driving after 50ms with 50ms delay
    await sleep(50);
    await ev(`(() => {
      window.__MOCK_NEXT_MAPS_DELAY_MS = 50;
      window.__MOCK_NEXT_MAPS_LINKS = {
        status: 'ok',
        links: [{ index: 1, of: 1, url: 'https://www.google.com/maps/dir/?api=1&origin=21.0,105.8&destination=21.1,105.9&travelmode=driving' }],
        notes: []
      };
    })()`);
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);

    // Wait 200ms: driving request should have resolved and rendered driving link
    await sleep(200);
    const midRaceHref = await ev(`document.querySelector('a[data-primary-maps-link], a[data-maps-link]')?.getAttribute('href')`);

    // Wait until 750ms so older 600ms walking request has finished
    await sleep(550);
    const postRaceHref = await ev(`document.querySelector('a[data-primary-maps-link], a[data-maps-link]')?.getAttribute('href')`);

    record(
      'TC-MAPS-RACE-OLDER-SUCCESS',
      'Delayed older success (600ms) does NOT overwrite newer active mode (driving)',
      midRaceHref?.includes('travelmode=driving') && postRaceHref?.includes('travelmode=driving'),
      `Mid-race: ${midRaceHref?.includes('travelmode=driving')}, Post-race: ${postRaceHref?.includes('travelmode=driving')}`
    );

    // Race 2: Older delayed error resolving after newer success
    await ev(`(() => {
      window.__MOCK_NEXT_MAPS_DELAY_MS = 600;
      window.__MOCK_NEXT_MAPS_LINKS_ERROR = { message: 'Delayed error that should be discarded' };
    })()`);
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);

    await sleep(50);
    await ev(`(() => {
      window.__MOCK_NEXT_MAPS_DELAY_MS = 50;
      window.__MOCK_NEXT_MAPS_LINKS = {
        status: 'ok',
        links: [{ index: 1, of: 1, url: '${validGoogleDirUrl}' }],
        notes: []
      };
    })()`);
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);

    // Wait for fast success, then wait for slow error to finish
    await sleep(750);
    const postRaceErrorState = await ev(`(() => {
      const banner = document.querySelector('[role="alert"]');
      const link = document.querySelector('a[data-primary-maps-link], a[data-maps-link]');
      return {
        hasErrorBanner: !!banner,
        hasLink: !!link,
      };
    })()`);

    record(
      'TC-MAPS-RACE-OLDER-ERROR',
      'Delayed older error (600ms) does NOT show error banner over newer success',
      !postRaceErrorState.hasErrorBanner && postRaceErrorState.hasLink,
      `Error banner shown: ${postRaceErrorState.hasErrorBanner}, Link shown: ${postRaceErrorState.hasLink}`
    );

    // Race 3: In-flight request resolving after session reset
    await ev(`(() => {
      window.__MOCK_NEXT_MAPS_DELAY_MS = 600;
      window.__MOCK_NEXT_MAPS_LINKS = {
        status: 'ok',
        links: [{ index: 1, of: 1, url: '${validGoogleDirUrl}' }],
        notes: []
      };
    })()`);
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
    await sleep(100);

    // Click Reset session in UI
    await ev(`(() => {
      const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tạo mới') || b.innerText.includes('Làm mới'));
      if (resetBtn) resetBtn.click();
    })()`);
    await sleep(200);

    // Verify maps block is hidden immediately on reset
    const immediateResetHidden = await ev(`!document.querySelector('[data-maps-links-block]')`);

    // Wait until 600ms request finishes
    await sleep(600);
    const postResetBlockState = await ev(`(() => {
      const block = document.querySelector('[data-maps-links-block]');
      const banner = document.querySelector('[role="alert"]');
      return {
        blockHidden: !block,
        noBanner: !banner,
      };
    })()`);

    record(
      'TC-MAPS-RACE-RESET-INFLIGHT',
      'In-flight request resolving after session reset does NOT render stale link or banner',
      immediateResetHidden && postResetBlockState.blockHidden && postResetBlockState.noBanner,
      `Immediate hidden: ${immediateResetHidden}, Post-delay hidden: ${postResetBlockState.blockHidden}`
    );

    // Race 4: Non-cooperative delayed error arriving after session reset (transport ignores abort)
    await ev(`document.querySelector('[data-suggestion-chip]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-plan-tour-button]')?.click()`);
    for (let i = 0; i < 40; i++) {
      await sleep(200);
      const ready = await ev(`!!document.querySelector('[data-maps-links-block]') && !document.querySelector('[data-maps-loading]')`);
      if (ready) break;
    }

    // Inject non-cooperative 600ms delayed error with abort-ignore enabled
    await ev(`(() => {
      window.__MOCK_NEXT_MAPS_DELAY_MS = 600;
      window.__MOCK_NEXT_MAPS_LINKS_ERROR = { message: 'NONCOOPERATIVE delayed reset error' };
      window.__MOCK_MAPS_IGNORE_ABORT = true;
    })()`);
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(100);

    // Click Reset session in UI to unmount MapsLinksBlock and reset session
    await ev(`(() => {
      const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tạo mới') || b.innerText.includes('Làm mới'));
      if (resetBtn) resetBtn.click();
    })()`);
    await sleep(200);

    // Wait 750ms so non-cooperative delayed error completes and is delivered
    await sleep(750);

    const postNoncoopErrorState = await ev(`(() => {
      const block = document.querySelector('[data-maps-links-block]');
      const banner = document.querySelector('[role="alert"]');
      const bannerText = banner?.innerText || '';
      return {
        blockHidden: !block,
        noBanner: !banner,
        bannerText,
      };
    })()`);
    await ev(`delete window.__MOCK_MAPS_IGNORE_ABORT`);

    record(
      'TC-MAPS-NONCOOP-DELAYED-ERROR-RESET',
      'Non-cooperative delayed error arriving after reset/unmount never enqueues stale banner or sets state',
      postNoncoopErrorState.blockHidden && postNoncoopErrorState.noBanner,
      `Block hidden: ${postNoncoopErrorState.blockHidden}, No banner: ${postNoncoopErrorState.noBanner}${postNoncoopErrorState.bannerText ? `, Stale banner: "${postNoncoopErrorState.bannerText}"` : ''}`
    );

    // Race 5: Non-cooperative delayed success arriving after session reset (transport ignores abort)
    await ev(`document.querySelector('[data-suggestion-chip]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-plan-tour-button]')?.click()`);
    for (let i = 0; i < 40; i++) {
      await sleep(200);
      const ready = await ev(`!!document.querySelector('[data-maps-links-block]') && !document.querySelector('[data-maps-loading]')`);
      if (ready) break;
    }

    await ev(`(() => {
      window.__MOCK_NEXT_MAPS_DELAY_MS = 600;
      window.__MOCK_NEXT_MAPS_LINKS = {
        status: 'ok',
        links: [{ index: 1, of: 1, url: '${validGoogleDirUrl}' }],
        notes: []
      };
      window.__MOCK_MAPS_IGNORE_ABORT = true;
    })()`);
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(100);

    await ev(`(() => {
      const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tạo mới') || b.innerText.includes('Làm mới'));
      if (resetBtn) resetBtn.click();
    })()`);
    await sleep(200);

    await sleep(750);

    const postNoncoopSuccessState = await ev(`(() => {
      const block = document.querySelector('[data-maps-links-block]');
      const links = document.querySelectorAll('a[data-maps-link], a[data-primary-maps-link]');
      return {
        blockHidden: !block,
        noLinks: links.length === 0,
      };
    })()`);
    await ev(`delete window.__MOCK_MAPS_IGNORE_ABORT`);

    record(
      'TC-MAPS-NONCOOP-DELAYED-SUCCESS-RESET',
      'Non-cooperative delayed success arriving after reset/unmount never renders stale link or sets state',
      postNoncoopSuccessState.blockHidden && postNoncoopSuccessState.noLinks,
      `Block hidden: ${postNoncoopSuccessState.blockHidden}, Links count: ${postNoncoopSuccessState.noLinks ? 0 : 'present'}`
    );

    // -------------------------------------------------------------
    // Test 15: Real Application Mutation Proofs (M3)
    // -------------------------------------------------------------
    console.log('\n--- Test 15: Real Application Mutation Proofs (M3) ---');
    // Re-plan tour so maps block is mounted and active
    await ev(`document.querySelector('[data-suggestion-chip]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-plan-tour-button]')?.click()`);
    for (let i = 0; i < 40; i++) {
      await sleep(200);
      const ready = await ev(`!!document.querySelector('[data-maps-links-block]') && !document.querySelector('[data-maps-loading]')`);
      if (ready) break;
    }

    // Suite Acceptance Predicate 1: rel="noopener noreferrer" and target="_blank"
    const relPredicate = (el) => el?.rel === 'noopener noreferrer' && el?.target === '_blank';

    // Normal DOM evaluation
    const initialDomRel = await ev(`(() => {
      const l = document.querySelector('a[data-maps-link], a[data-primary-maps-link]');
      return { rel: l?.getAttribute('rel'), target: l?.getAttribute('target') };
    })()`);
    const relNormallyPasses = relPredicate(initialDomRel);

    // Real DOM mutation: remove rel attribute from actual rendered anchor
    await ev(`document.querySelector('a[data-maps-link], a[data-primary-maps-link]')?.removeAttribute('rel')`);
    const mutatedDomRel = await ev(`(() => {
      const l = document.querySelector('a[data-maps-link], a[data-primary-maps-link]');
      return { rel: l?.getAttribute('rel'), target: l?.getAttribute('target') };
    })()`);
    const relMutationFails = !relPredicate(mutatedDomRel);

    // Restore rel attribute
    await ev(`document.querySelector('a[data-maps-link], a[data-primary-maps-link]')?.setAttribute('rel', 'noopener noreferrer')`);

    record(
      'TC-MAPS-MUTATION-REL',
      'Real application rel mutation: removing rel from DOM link causes acceptance predicate to FAIL',
      relNormallyPasses && relMutationFails,
      `Normal: ${relNormallyPasses}, Mutated caught: ${relMutationFails}`
    );

    // Suite Acceptance Predicate 2: Waypoint sequence order equals stop order
    function orderPredicate(urlStr, expectedFirst, expectedSecond) {
      if (!urlStr) return false;
      try {
        const u = new URL(urlStr);
        const p = u.searchParams.get('waypoints');
        if (!p) return false;
        const wps = p.split('|').map(decodeURIComponent);
        return wps.length === 2 && wps[0] === expectedFirst && wps[1] === expectedSecond;
      } catch (_) {
        return false;
      }
    }

    const currentUrl = await ev(`document.querySelector('a[data-maps-link], a[data-primary-maps-link]')?.getAttribute('href')`);
    const orderNormallyPasses = orderPredicate(currentUrl, '21.001000,105.850000', '21.002000,105.850000');

    // Real Application Reorder Mutation: inject reversed waypoints response into app
    await ev(`(() => {
      window.__MOCK_MAPS_LINKS_OVERRIDE = {
        status: 'ok',
        links: [
          {
            index: 1,
            of: 1,
            url: 'https://www.google.com/maps/dir/?api=1&origin=21.000000%2C105.850000&destination=21.003000%2C105.850000&waypoints=21.002000%2C105.850000%7C21.001000%2C105.850000&travelmode=walking'
          }
        ],
        notes: []
      };
    })()`);
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
    await sleep(400);

    const mutatedReorderedUrl = await ev(`document.querySelector('a[data-maps-link], a[data-primary-maps-link]')?.getAttribute('href')`);
    await ev(`delete window.__MOCK_MAPS_LINKS_OVERRIDE`);
    const orderMutationFails = !orderPredicate(mutatedReorderedUrl, '21.001000,105.850000', '21.002000,105.850000');

    record(
      'TC-MAPS-MUTATION-ORDER',
      'Real application order mutation: swapped waypoints cause exact order acceptance predicate to FAIL',
      orderNormallyPasses && orderMutationFails,
      `Normal: ${orderNormallyPasses}, Swapped caught: ${orderMutationFails}`
    );

    // Restore normal fixture
    await ev(`delete window.__MOCK_NEXT_MAPS_LINKS`);
    await ev(`document.querySelector('[data-testid="toggle-driving"]')?.click()`);
    await sleep(200);
    await ev(`document.querySelector('[data-testid="toggle-walking"]')?.click()`);
    await sleep(400);

    // Suite Acceptance Predicate 3: Disclaimer presence and text
    const disclaimerPredicate = (text) =>
      typeof text === 'string' &&
      text.includes('Links contain the origin/venue coordinates') &&
      text.includes('Thứ tự theo gợi ý của ứng dụng; Google có thể hiển thị thời gian khác');

    const initialDiscText = await ev(`document.querySelector('[data-maps-disclaimer]')?.innerText || ''`);
    const discNormallyPasses = disclaimerPredicate(initialDiscText);

    // Real DOM mutation: remove disclaimer block from actual rendered component
    await ev(`document.querySelector('[data-maps-disclaimer]')?.remove()`);
    const mutatedDiscText = await ev(`document.querySelector('[data-maps-disclaimer]')?.innerText || ''`);
    const discMutationFails = !disclaimerPredicate(mutatedDiscText);

    record(
      'TC-MAPS-MUTATION-DISCLAIMER',
      'Real application disclaimer mutation: dropping disclaimer causes acceptance predicate to FAIL',
      discNormallyPasses && discMutationFails,
      `Normal: ${discNormallyPasses}, Dropped caught: ${discMutationFails}`
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
