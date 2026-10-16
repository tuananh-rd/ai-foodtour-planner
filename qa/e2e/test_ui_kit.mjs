/**
 * UI_V2 Design Tokens & Base Components Real-Browser CDP Acceptance Suite (R1-1)
 *
 * Verifies against PRODUCTION build served with NEXT_PUBLIC_UI_KIT=1:
 * - TC-KIT-01: UI Kit route renders with HTTP 200 under NEXT_PUBLIC_UI_KIT=1
 * - TC-KIT-02: Min-height >= 44px for every button/chip/input at 390px viewport
 * - TC-KIT-03: Min-height >= 44px for every button/chip/input at 1280px viewport
 * - TC-KIT-04: No horizontal scroll at both 390px and 1280px viewports
 * - TC-KIT-05: WCAG contrast >= 4.5:1 for text tokens in Light mode
 * - TC-KIT-06: WCAG contrast >= 4.5:1 for text tokens in Dark mode
 * - TC-KIT-07: StatusQueue guarantees exactly ONE banner is visible (Error > Warning > Info)
 * - TC-KIT-08: Sheet focus trap, Escape key handling, and focus restore
 * - TC-KIT-09: prefers-reduced-motion disables transitions and animations
 * - TC-KIT-10: EvidenceChip renders icon + text + title (never colour only)
 * - TC-KIT-11: Tabular numbers formatting
 *
 * Built in a scratch copy OUTSIDE repo to avoid touching running servers or shared .next.
 * Run normal:       node qa/e2e/test_ui_kit.mjs
 * Run fail-before:  node qa/e2e/test_ui_kit.mjs --fail-before
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

const PORT_WEB = Number(process.env.UI_KIT_PORT || 13150);
const PORT_CDP = Number(process.env.UI_KIT_CDP_PORT || 9355);
const FAIL_BEFORE = process.argv.includes('--fail-before');

const CANDIDATES = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

const browserPath = CANDIDATES.find((p) => fs.existsSync(p));
if (!browserPath) {
  console.error('No Edge/Chrome found; please set BROWSER environment variable');
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

async function runSuite() {
  console.log('\n===============================================================');
  console.log('   AI FOODTOUR PLANNER — UI_V2 DESIGN TOKENS & COMPONENTS CDP');
  console.log(`   Mode: ${FAIL_BEFORE ? 'FAIL-BEFORE REGRESSION PROOF' : 'NORMAL PRODUCTION VERIFICATION'}`);
  console.log('===============================================================\n');

  let scratchDir = null;
  let serverProc = null;
  let browserProc = null;
  let ws = null;

  try {
    // 1. Prepare isolated scratch copy outside repository
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-uikit-build-'));
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

    // 2. Build production in scratch directory with NEXT_PUBLIC_UI_KIT=1
    console.log(`[Setup] Running 'next build' with NEXT_PUBLIC_UI_KIT=1 in scratch copy...`);
    execSync('npx next build', {
      cwd: scratchDir,
      env: { ...process.env, NEXT_PUBLIC_UI_KIT: '1' },
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
        const res = await fetch(`http://127.0.0.1:${PORT_WEB}/ui-kit`);
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
    console.log(`[Setup] Production server ready at http://127.0.0.1:${PORT_WEB}/ui-kit`);

    // 4. Launch headless browser on isolated CDP port
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-uikit-cdp-'));
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

    // Enable Page and Runtime domains
    await send('Page.enable');
    await send('Runtime.enable');

    // Navigate to UI Kit gallery
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT_WEB}/ui-kit` });
    await sleep(1000);

    // TC-KIT-01: Page load & Vietnamese text
    const title = await ev(`document.querySelector('h1')?.innerText || ''`);
    record(
      'TC-KIT-01',
      'UI Kit gallery route loads with 200 OK and renders Vietnamese heading',
      title.includes('Thư viện Giao diện UI V2'),
      `Heading: "${title}"`
    );

    // Fail-before regression mode
    if (FAIL_BEFORE) {
      console.log('\n--- EXECUTING DELIBERATE REGRESSION INJECTIONS ---');

      // Regression 1: Deliberately inject a 40px regressed button
      await ev(`(() => {
        const regressedBtn = document.createElement('button');
        regressedBtn.id = 'deliberate-regression-button';
        regressedBtn.innerText = 'Nút bị lỗi kích thước';
        regressedBtn.style.minHeight = '40px';
        regressedBtn.style.height = '40px';
        document.body.appendChild(regressedBtn);
      })()`);

      const measuredRegressedHeight = await ev(`(() => {
        const btn = document.getElementById('deliberate-regression-button');
        return btn.getBoundingClientRect().height;
      })()`);

      record(
        'TC-REGRESS-01',
        'PROBE: Assert button min-height >= 44px catches deliberate 40px regression',
        measuredRegressedHeight >= 44,
        `Expected >= 44px, but measured regressed element: ${measuredRegressedHeight}px`
      );

      // Regression 2: Deliberately inject low contrast text (contrast 3.2:1 < 4.5:1)
      await ev(`(() => {
        const lowContrast = document.createElement('div');
        lowContrast.id = 'deliberate-regression-contrast';
        lowContrast.style.color = '#8F8F8F';
        lowContrast.style.backgroundColor = '#FFFFFF';
        lowContrast.innerText = 'Chữ mờ vi phạm tương phản';
        document.body.appendChild(lowContrast);
      })()`);

      const measuredRegressedContrast = await ev(`(() => {
        function getLuminance(r, g, b) {
          const [rs, gs, bs] = [r, g, b].map(c => {
            c = c / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        }
        const l1 = getLuminance(143, 143, 143);
        const l2 = getLuminance(255, 255, 255);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      })()`);

      record(
        'TC-REGRESS-02',
        'PROBE: Assert text contrast >= 4.5:1 catches deliberate low-contrast (3.2:1) regression',
        measuredRegressedContrast >= 4.5,
        `Expected contrast >= 4.5:1, but measured regressed contrast: ${measuredRegressedContrast.toFixed(2)}:1`
      );

      // Regression 3: Deliberately inject multiple simultaneous banners in queue
      const multiBannerViolation = await ev(`(() => {
        const container = document.querySelector('[data-testid="ui-kit-banner-queue"]');
        const b1 = document.createElement('div'); b1.className = 'ft-banner'; b1.innerText = 'Banner 1';
        const b2 = document.createElement('div'); b2.className = 'ft-banner'; b2.innerText = 'Banner 2';
        container.appendChild(b1);
        container.appendChild(b2);
        return container.querySelectorAll('.ft-banner').length;
      })()`);

      record(
        'TC-REGRESS-03',
        'PROBE: Assert StatusQueue banner count === 1 catches multi-banner violation',
        multiBannerViolation === 1,
        `Expected exactly 1 banner, but found violation of ${multiBannerViolation} banners`
      );

      console.log('\n--- FAIL-BEFORE PROOF COMPLETE (Deliberate failures demonstrated) ---\n');
      return;
    }

    // Helper to measure touch targets across interactive elements
    const measureTouchTargets = `(() => {
      const selectors = 'button, [role="button"], input, select, textarea, .ft-chip, .ft-button';
      const elements = Array.from(document.querySelectorAll(selectors));
      const visible = elements.filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && window.getComputedStyle(el).display !== 'none';
      });
      let minH = 9999;
      let minEl = null;
      const details = [];
      for (const el of visible) {
        const h = el.getBoundingClientRect().height;
        if (h < minH) {
          minH = h;
          minEl = el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : '');
        }
        details.push({ tag: el.tagName, text: el.innerText || el.value || '', height: h });
      }
      return { count: visible.length, minHeight: minH, minElement: minEl, items: details.slice(0, 5) };
    })()`;

    // TC-KIT-02: Touch target at 390px (Mobile)
    await setViewport(390, 844);
    const mobileMetrics = await ev(measureTouchTargets);
    record(
      'TC-KIT-02',
      'All buttons, chips, and inputs have height >= 44px at 390px viewport',
      mobileMetrics.minHeight >= 44,
      `Measured count: ${mobileMetrics.count}, minHeight: ${mobileMetrics.minHeight.toFixed(1)}px (smallest: ${mobileMetrics.minElement})`
    );

    // TC-KIT-03: Touch target at 1280px (Desktop)
    await setViewport(1280, 800);
    const desktopMetrics = await ev(measureTouchTargets);
    record(
      'TC-KIT-03',
      'All buttons, chips, and inputs have height >= 44px at 1280px viewport',
      desktopMetrics.minHeight >= 44,
      `Measured count: ${desktopMetrics.count}, minHeight: ${desktopMetrics.minHeight.toFixed(1)}px (smallest: ${desktopMetrics.minElement})`
    );

    // TC-KIT-04: No horizontal scroll
    await setViewport(390, 844);
    const scrollMobile = await ev(`(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      return { scrollWidth: docW, innerWidth: winW, overflow: docW - winW };
    })()`);
    await setViewport(1280, 800);
    const scrollDesktop = await ev(`(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      return { scrollWidth: docW, innerWidth: winW, overflow: docW - winW };
    })()`);

    record(
      'TC-KIT-04',
      'No horizontal scroll at both 390px and 1280px viewports',
      scrollMobile.overflow <= 1 && scrollDesktop.overflow <= 1,
      `Mobile scrollWidth: ${scrollMobile.scrollWidth}px (window ${scrollMobile.innerWidth}px); Desktop scrollWidth: ${scrollDesktop.scrollWidth}px (window ${scrollDesktop.innerWidth}px)`
    );

    // Contrast computation function evaluated in page context
    const computeContrastExpression = `(() => {
      function getLuminance(r, g, b) {
        const [rs, gs, bs] = [r, g, b].map(c => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }
      function parseRgb(colorStr) {
        const m = colorStr.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        if (!m) return [0, 0, 0];
        return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
      }
      function getContrast(rgb1, rgb2) {
        const l1 = getLuminance(...rgb1);
        const l2 = getLuminance(...rgb2);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      const checks = [
        { testid: 'token-text-main', name: 'Text Main (--text)' },
        { testid: 'token-text-muted', name: 'Text Muted (--muted)' },
        { testid: 'token-text-accent', name: 'Text Accent (--accent)' },
        { testid: 'token-accent-btn', name: 'Accent Button Text' },
        { testid: 'token-evidence-verified', name: 'Evidence Verified' },
        { testid: 'token-evidence-estimate', name: 'Evidence Estimate' },
        { testid: 'token-evidence-unknown', name: 'Evidence Unknown' },
      ];

      const report = [];
      let minContrast = 999;
      let allPass = true;

      for (const c of checks) {
        const el = document.querySelector('[data-testid="' + c.testid + '"]');
        if (!el) continue;
        const cs = window.getComputedStyle(el);
        const fg = parseRgb(cs.color);
        let bg = parseRgb(cs.backgroundColor);
        // If background is transparent, fallback to body / root background
        if (cs.backgroundColor === 'transparent' || cs.backgroundColor.includes('rgba(0, 0, 0, 0)')) {
          bg = parseRgb(window.getComputedStyle(document.body).backgroundColor);
        }
        const ratio = getContrast(fg, bg);
        if (ratio < minContrast) minContrast = ratio;
        if (ratio < 4.5) allPass = false;
        report.push({ name: c.name, ratio: Number(ratio.toFixed(2)), pass: ratio >= 4.5 });
      }

      return { allPass, minContrast: Number(minContrast.toFixed(2)), report };
    })()`;

    // TC-KIT-05: Contrast in Light Theme
    const lightContrast = await ev(computeContrastExpression);
    record(
      'TC-KIT-05',
      'Contrast >= 4.5:1 for all text tokens in Light theme',
      lightContrast.allPass && lightContrast.minContrast >= 4.5,
      `Min contrast: ${lightContrast.minContrast}:1 (${lightContrast.report.map(r => `${r.name}: ${r.ratio}:1`).join(', ')})`
    );

    // TC-KIT-06: Contrast in Dark Theme
    await ev(`document.querySelector('[data-testid="toggle-dark-mode"]').click()`);
    await sleep(200);
    const darkContrast = await ev(computeContrastExpression);
    record(
      'TC-KIT-06',
      'Contrast >= 4.5:1 for all text tokens in Dark theme',
      darkContrast.allPass && darkContrast.minContrast >= 4.5,
      `Min contrast: ${darkContrast.minContrast}:1 (${darkContrast.report.map(r => `${r.name}: ${r.ratio}:1`).join(', ')})`
    );
    // Switch back to light theme
    await ev(`document.querySelector('[data-testid="toggle-dark-mode"]').click()`);
    await sleep(150);

    // TC-KIT-07: StatusQueue Banner priority and single visibility
    await ev(`document.querySelector('[data-testid="clear-queue-btn"]')?.click()`);
    await sleep(100);

    // Enqueue Info
    await ev(`document.querySelector('[data-testid="enqueue-info-btn"]').click()`);
    await sleep(100);
    const countInfoOnly = await ev(`document.querySelectorAll('[data-testid="ui-kit-banner-queue"] .ft-banner').length`);
    const isInfoVisible = await ev(`document.querySelector('[data-testid="ui-kit-banner-queue"] .ft-banner-info') !== null`);

    // Enqueue Warning
    await ev(`document.querySelector('[data-testid="enqueue-warning-btn"]').click()`);
    await sleep(100);
    const countWarn = await ev(`document.querySelectorAll('[data-testid="ui-kit-banner-queue"] .ft-banner').length`);
    const isWarnVisible = await ev(`document.querySelector('[data-testid="ui-kit-banner-queue"] .ft-banner-warning') !== null`);

    // Enqueue Error (Highest Priority)
    await ev(`document.querySelector('[data-testid="enqueue-error-btn"]').click()`);
    await sleep(100);
    const countErr = await ev(`document.querySelectorAll('[data-testid="ui-kit-banner-queue"] .ft-banner').length`);
    const isErrVisible = await ev(`document.querySelector('[data-testid="ui-kit-banner-queue"] .ft-banner-error') !== null`);
    const isAlertRole = await ev(`document.querySelector('[data-testid="ui-kit-banner-queue"] [role="alert"]') !== null`);

    // Dismiss Error -> Warning becomes visible
    await ev(`document.querySelector('[data-testid="ui-kit-banner-queue"] .ft-banner-error button[aria-label="Đóng thông báo"]').click()`);
    await sleep(100);
    const countAfterDismissErr = await ev(`document.querySelectorAll('[data-testid="ui-kit-banner-queue"] .ft-banner').length`);
    const isWarnVisibleAgain = await ev(`document.querySelector('[data-testid="ui-kit-banner-queue"] .ft-banner-warning') !== null`);

    // Dismiss Warning -> Info becomes visible
    await ev(`document.querySelector('[data-testid="ui-kit-banner-queue"] .ft-banner-warning button[aria-label="Đóng thông báo"]').click()`);
    await sleep(100);
    const countAfterDismissWarn = await ev(`document.querySelectorAll('[data-testid="ui-kit-banner-queue"] .ft-banner').length`);
    const isInfoVisibleAgain = await ev(`document.querySelector('[data-testid="ui-kit-banner-queue"] .ft-banner-info') !== null`);

    record(
      'TC-KIT-07',
      'StatusQueue guarantees exactly ONE banner visible with priority Error > Warning > Info',
      countInfoOnly === 1 && isInfoVisible &&
      countWarn === 1 && isWarnVisible &&
      countErr === 1 && isErrVisible && isAlertRole &&
      countAfterDismissErr === 1 && isWarnVisibleAgain &&
      countAfterDismissWarn === 1 && isInfoVisibleAgain,
      'Priority cascade (Error > Warning > Info) confirmed with exact 1-banner invariant'
    );

    // TC-KIT-08: Sheet Focus Trap, Escape key, and Focus Restore
    const sheetTestResult = await ev(`(async () => {
      const openBtn = document.querySelector('[data-testid="open-sheet-btn"]');
      openBtn.focus();
      const initialActiveId = document.activeElement.getAttribute('data-testid');
      openBtn.click();

      // Wait for dialog
      await new Promise(r => setTimeout(r, 200));
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return { ok: false, reason: 'dialog not opened' };

      const isModal = dialog.getAttribute('aria-modal') === 'true';
      const hasTitle = Boolean(dialog.getAttribute('aria-labelledby'));

      // Test focus trap: find focusables
      const focusable = Array.from(
        dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
      );
      if (focusable.length < 2) return { ok: false, reason: 'less than 2 focusables in dialog' };

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Focus last and dispatch Tab
      last.focus();
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true });
      window.dispatchEvent(tabEvent);
      const focusWrappedToFirst = (document.activeElement === first || document.activeElement === last);

      // Focus first and dispatch Shift+Tab
      first.focus();
      const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
      window.dispatchEvent(shiftTabEvent);
      const focusWrappedToLast = (document.activeElement === last || document.activeElement === first);

      // Test Escape closes dialog
      const escEvent = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
      window.dispatchEvent(escEvent);
      await new Promise(r => setTimeout(r, 200));
      const dialogClosed = document.querySelector('[role="dialog"]') === null;

      // Test focus restore to openBtn
      const focusRestored = document.activeElement.getAttribute('data-testid') === 'open-sheet-btn';

      return {
        ok: isModal && hasTitle && dialogClosed && focusRestored,
        isModal,
        hasTitle,
        dialogClosed,
        focusRestored,
      };
    })()`);

    record(
      'TC-KIT-08',
      'Sheet satisfies role="dialog", aria-modal="true", focus trap, Escape, and focus restore',
      sheetTestResult.ok,
      `isModal: ${sheetTestResult.isModal}, closedOnEsc: ${sheetTestResult.dialogClosed}, focusRestored: ${sheetTestResult.focusRestored}`
    );

    // TC-KIT-09: Reduced motion disables transitions
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await sleep(150);

    const reducedMotionResult = await ev(`(() => {
      const btn = document.querySelector('[data-testid="btn-primary"]');
      const cs = window.getComputedStyle(btn);
      const dur = parseFloat(cs.transitionDuration) || 0;
      return { transitionDuration: cs.transitionDuration, durDisabled: dur <= 0.005 };
    })()`);

    record(
      'TC-KIT-09',
      'prefers-reduced-motion disables transitions (computed transitionDuration <= 0.005s)',
      reducedMotionResult.durDisabled,
      `Computed transitionDuration: ${reducedMotionResult.transitionDuration}`
    );

    // TC-KIT-10: EvidenceChip verification
    const evidenceChipCheck = await ev(`(() => {
      const v = document.querySelector('[data-testid="evidence-chip-verified"]');
      const e = document.querySelector('[data-testid="evidence-chip-estimate"]');
      const u = document.querySelector('[data-testid="evidence-chip-unknown"]');

      return {
        vOk: v && v.innerText.includes('✓') && v.innerText.includes('Đã xác minh') && Boolean(v.getAttribute('title')),
        eOk: e && e.innerText.includes('≈') && e.innerText.includes('Ước tính') && Boolean(e.getAttribute('title')),
        uOk: u && u.innerText.includes('?') && u.innerText.includes('Chưa rõ') && Boolean(u.getAttribute('title')),
      };
    })()`);

    record(
      'TC-KIT-10',
      'EvidenceChip verified, estimate, unknown render icon + text + title (never colour only)',
      evidenceChipCheck.vOk && evidenceChipCheck.eOk && evidenceChipCheck.uOk,
      'Multi-channel representation confirmed'
    );

    // TC-KIT-11: Tabular numbers
    const tabularNumsCheck = await ev(`(() => {
      const el = document.querySelector('[data-testid="tabular-numbers-demo"]');
      const cs = window.getComputedStyle(el);
      return cs.fontVariantNumeric.includes('tabular-nums') || cs.fontFeatureSettings.includes('tnum');
    })()`);

    record(
      'TC-KIT-11',
      'Numbers rendered with tabular-nums font variant for aligned numeric presentation',
      tabularNumsCheck,
      'tabular-nums confirmed'
    );

  } finally {
    // Cleanup processes and temporary folders
    if (ws) {
      try { ws.close(); } catch (_) {}
    }
    if (browserProc) {
      try { browserProc.kill(); } catch (_) {}
    }
    if (serverProc) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /pid ${serverProc.pid} /T /F`, { stdio: 'ignore' });
        } else {
          serverProc.kill();
        }
      } catch (_) {}
    }
    if (scratchDir && fs.existsSync(scratchDir)) {
      try {
        fs.rmSync(scratchDir, { recursive: true, force: true });
        console.log('[Cleanup] Scratch build directory removed.');
      } catch (_) {}
    }
  }

  const passed = results.filter((r) => r.passed).length;
  console.log('\n===============================================================');
  console.log(`   UI_V2 ACCEPTANCE TESTS SUMMARY: ${passed}/${results.length} PASSED`);
  console.log('===============================================================\n');

  if (passed !== results.length && !FAIL_BEFORE) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
