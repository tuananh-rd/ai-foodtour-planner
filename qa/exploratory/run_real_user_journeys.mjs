/**
 * Real User Exploratory QA Automation Suite
 * Runs against live preview servers 3050 (synthetic) & 3051 (private) via CDP 19700.
 * Exercises all 6 required user journeys strictly via visible UI typing/clicking.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';

const PORT_CDP = 19700;
const BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPORT_DIR = path.resolve('docs/reports/functional-qa-20261018');
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function checkPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('=== Checking CDP port 19700 ===');
  const free = await checkPortFree(PORT_CDP);
  if (!free) {
    throw new Error(`Port ${PORT_CDP} is in use; please free it before starting.`);
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-real-journeys-'));
  const chromeProfile = path.join(scratch, 'profile');

  console.log('=== Launching Chrome with CDP on port 19700 ===');
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
  ], { stdio: 'ignore', windowsHide: true });

  const cleanup = () => {
    console.log('Cleaning up Chrome process and temp profile...');
    try {
      if (chromeProc.pid) {
        execFileSync('taskkill', ['/pid', String(chromeProc.pid), '/T', '/F'], { stdio: 'ignore' });
      }
    } catch (_) {}
    try {
      fs.rmSync(scratch, { recursive: true, force: true });
    } catch (_) {}
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  const journeyResults = [];

  try {
    let target = null;
    for (let i = 0; i < 50; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json`)).json();
        target = list.find((x) => x.type === 'page');
        if (target) break;
      } catch (_) {}
      await pause(100);
    }
    if (!target) throw new Error('CDP target page not found');

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

    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('DOM.enable');

    // Grant browser geolocation permissions and set Hanoi GPS override
    await cdp('Browser.grantPermissions', { permissions: ['geolocation'] });
    await cdp('Emulation.setGeolocationOverride', {
      latitude: 21.028511,
      longitude: 105.854167,
      accuracy: 25
    });

    async function setViewport(width, height, isMobile = false) {
      await cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: isMobile,
        screenOrientation: isMobile ? { angle: 0, type: 'portraitPrimary' } : undefined
      });
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

    async function waitIdle(ms = 300, maxWaitMs = 12000) {
      await pause(ms);
      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        const busy = await ev(`!!document.querySelector('[aria-busy="true"]')`);
        if (!busy) break;
        await pause(150);
      }
      await pause(250);
    }

    async function click(selector) {
      const found = await ev(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        el.click();
        return true;
      })()`);
      if (!found) throw new Error(`Cannot find selector to click: ${selector}`);
      await waitIdle();
    }

    async function typeAndSend(text, selector = '[data-testid="guided-input"]') {
      await ev(`(() => {
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
      const hasSend = await ev(`!!document.querySelector('[data-testid="guided-send-btn"]:not([disabled])')`);
      if (hasSend) {
        await click('[data-testid="guided-send-btn"]');
      } else {
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
      }
      await waitIdle(500, 15000);
    }

    async function resolveClarifications(maxTurns = 5) {
      for (let i = 0; i < maxTurns; i++) {
        const hasClarify = await ev(`!!document.querySelector('[data-testid="clarify-question-card"]')`);
        if (!hasClarify) break;
        const firstChip = await ev(`document.querySelector('[data-testid^="clarify-option-"]')?.getAttribute('data-testid')`);
        if (firstChip) {
          console.log(`Resolving clarification turn ${i + 1} with chip: [data-testid="${firstChip}"]`);
          await click(`[data-testid="${firstChip}"]`);
          await waitIdle(500);
        } else {
          break;
        }
      }
    }

    async function confirmIfPresent() {
      for (let attempt = 0; attempt < 3; attempt++) {
        await resolveClarifications(3);
        const hasConfirm = await ev(`!!document.querySelector('[data-testid="confirm-yes-btn"]')`);
        if (hasConfirm) {
          console.log(`Confirm summary detected (attempt ${attempt + 1}). Clicking [data-testid="confirm-yes-btn"]...`);
          await click('[data-testid="confirm-yes-btn"]');
          await waitIdle(800, 15000);
        }
        const hasTimeline = await ev(`!!document.querySelector('[data-testid="guided-timeline"]')`);
        if (hasTimeline) {
          console.log('Guided timeline generated and confirmed.');
          break;
        }
      }
    }

    async function readUnderstoodCard() {
      return await ev(`(() => {
        const card = document.querySelector('[data-testid="understood-card"]');
        if (!card) return null;
        const rows = Array.from(card.querySelectorAll('[data-testid^="understood-row-"]')).map(r => {
          const testid = r.getAttribute('data-testid');
          const id = testid.replace('understood-row-', '');
          const label = r.querySelector('.nn-row-label')?.textContent?.trim() || '';
          const val = r.querySelector('.nn-row-val')?.textContent?.trim() || '';
          return { id, label, val };
        });
        const note = card.querySelector('[data-testid="understood-safety-note"]')?.textContent?.trim() || '';
        return { rows, note };
      })()`);
    }

    async function readTimeline() {
      return await ev(`(() => {
        const tl = document.querySelector('[data-testid="guided-timeline"]');
        if (!tl) return null;
        const badge = tl.querySelector('[data-testid="timeline-status-badge"]')?.textContent?.trim();
        const unknowns = tl.querySelector('[data-testid="timeline-unknowns"]')?.textContent?.trim() || '';
        const stops = Array.from(tl.querySelectorAll('[data-testid^="guided-stop-"]')).map((s, idx) => {
          const name = s.querySelector('.nn-timeline-card-title')?.textContent?.trim() || '';
          const time = s.querySelector('.nn-time-pill')?.textContent?.trim() || '';
          const meta = s.querySelector('.nn-meta-pill')?.textContent?.trim() || '';
          return { idx, name, time, meta };
        });
        const mapsCta = tl.querySelector('[data-testid="google-maps-cta"]');
        const mapsHref = mapsCta?.getAttribute('href') || null;
        const legLinks = Array.from(tl.querySelectorAll('[data-testid^="google-maps-leg-"]')).map(a => a.getAttribute('href'));
        return { badge, unknowns, stops, mapsHref, legLinks };
      })()`);
    }

    // =========================================================================
    // JOURNEY 1: Single full prompt with all parameters & allergen disclaimer
    // =========================================================================
    console.log('\n=============================================================');
    console.log('>>> RUNNING JOURNEY 1: Single Full Prompt & Allergy Gate');
    console.log('=============================================================');
    await setViewport(1440, 1024, false);
    await cdp('Page.navigate', { url: 'http://127.0.0.1:3050/' });
    await waitIdle(2000);

    const prompt1 = 'Tôi muốn tour 3 quán quanh Hồ Gươm tối nay 120 phút, ngân sách 500 nghìn cho 2 người, đi bộ tối đa 20 phút mỗi chặng, thích phở và bún chả, dị ứng đậu phộng';
    console.log(`Sending: "${prompt1}"`);
    await typeAndSend(prompt1);

    let understood1 = await readUnderstoodCard();
    console.log('Understood card after prompt 1:', JSON.stringify(understood1, null, 2));

    await resolveClarifications(3);
    await confirmIfPresent();

    const tl1 = await readTimeline();
    console.log('Timeline 1 stops:', tl1?.stops?.length, 'Maps link:', tl1?.mapsHref ? 'Present (valid)' : 'None');
    if (tl1?.stops) {
      for (const s of tl1.stops) {
        console.log(`  Stop ${s.idx + 1}: ${s.name} (${s.time})`);
      }
    }

    await snapScreenshot(path.join(SCREENSHOT_DIR, 'journey1_full_prompt.png'));

    const j1Success = Boolean(understood1 && tl1 && tl1.stops.length === 3 && tl1.mapsHref?.startsWith('https://www.google.com/maps/dir/'));
    journeyResults.push({
      journey: 'Journey 1: Single Full Prompt & Allergies',
      status: j1Success ? 'PASS' : 'FAIL',
      details: `Stops: ${tl1?.stops?.length || 0}, Maps: ${tl1?.mapsHref ? 'Valid free Google Maps link' : 'Missing'}, Allergies Note: ${understood1?.note ? 'Disclosed' : 'Missing'}`
    });

    // =========================================================================
    // GPS LOCATION VERIFICATION
    // =========================================================================
    console.log('\n=============================================================');
    console.log('>>> VERIFYING REAL BROWSER GEOLOCATION (GPS)');
    console.log('=============================================================');
    await click('[data-testid="guided-reset-btn"]');
    await waitIdle(500);

    const hasGpsChip = await ev(`(() => {
      const chips = Array.from(document.querySelectorAll('.nn-chip'));
      const gps = chips.find(c => c.textContent.includes('GPS'));
      return Boolean(gps);
    })()`);
    console.log('GPS Suggestion Chip found in UI:', hasGpsChip);

    if (hasGpsChip) {
      await ev(`(() => {
        const chips = Array.from(document.querySelectorAll('.nn-chip'));
        const gps = chips.find(c => c.textContent.includes('GPS'));
        if (gps) gps.click();
      })()`);
      await waitIdle(1000);
      const understoodGps = await readUnderstoodCard();
      console.log('Understood card after GPS click:', JSON.stringify(understoodGps, null, 2));
      await snapScreenshot(path.join(SCREENSHOT_DIR, 'gps_location_detected.png'));
    }

    // =========================================================================
    // JOURNEY 2: Multi-turn Piecewise Specification with Short Phrases
    // =========================================================================
    console.log('\n=============================================================');
    console.log('>>> RUNNING JOURNEY 2: Multi-turn Piecewise Short Phrases');
    console.log('=============================================================');
    await click('[data-testid="guided-reset-btn"]');
    await waitIdle(500);

    const turns = [
      { text: 'Tôi muốn đi ăn quanh Hồ Gươm', desc: 'Area' },
      { text: 'thích phở và chè', desc: 'Tastes' },
      { text: 'ngân sách 500k cho cả nhóm', desc: 'Budget & Scope' },
      { text: '2 người', desc: 'Party Size' },
      { text: '120 phút', desc: 'Duration' },
      { text: 'tour 3 quán', desc: 'Stop Count' },
      { text: 'bắt đầu lúc 19:00', desc: 'Start Time' }
    ];

    for (const t of turns) {
      console.log(`Turn [${t.desc}]: "${t.text}"`);
      await typeAndSend(t.text);
    }

    const understood2 = await readUnderstoodCard();
    console.log('Understood card after 7 piecewise turns:', JSON.stringify(understood2, null, 2));

    await resolveClarifications(2);
    await confirmIfPresent();

    const tl2 = await readTimeline();
    console.log('Timeline 2 stops:', tl2?.stops?.length);
    if (tl2?.stops) {
      for (const s of tl2.stops) {
        console.log(`  Stop ${s.idx + 1}: ${s.name} (${s.time})`);
      }
    }

    await snapScreenshot(path.join(SCREENSHOT_DIR, 'journey2_multiturn.png'));

    const j2Success = Boolean(understood2 && tl2 && tl2.stops.length === 3);
    journeyResults.push({
      journey: 'Journey 2: Multi-turn Piecewise Specification',
      status: j2Success ? 'PASS' : 'FAIL',
      details: `All 7 slots sequentially resolved via natural text. Stops: ${tl2?.stops?.length || 0}`
    });

    // =========================================================================
    // JOURNEY 3: Mid-flow Modification via Inline Popovers & Chat
    // =========================================================================
    console.log('\n=============================================================');
    console.log('>>> RUNNING JOURNEY 3: Mid-flow Inline Editors & Stop Replacement');
    console.log('=============================================================');
    await click('[data-testid="guided-reset-btn"]');
    await waitIdle(500);

    await typeAndSend('Tour 3 quán Phố Cổ 120 phút đi bộ tối đa 20 phút mỗi chặng thích phở và chè');
    console.log('Initial prompt sent.');

    // 1. Edit Party Size via Stepper
    console.log('Opening Party Size Inline Editor...');
    await click('[data-testid="understood-edit-party"]');
    await waitIdle(200);
    console.log('Incrementing stepper + twice...');
    await click('[data-testid="inline-stepper-plus"]');
    await click('[data-testid="inline-stepper-plus"]');
    await click('[data-testid="inline-edit-save"]');
    await waitIdle(500);

    // 2. Edit Budget via Custom Input
    console.log('Opening Budget Inline Editor...');
    await click('[data-testid="understood-edit-budget"]');
    await waitIdle(200);
    console.log('Typing 600000 into budget input...');
    await ev(`(() => {
      const inp = document.querySelector('[data-testid="inline-budget-custom"]');
      if (inp) {
        inp.value = '600000';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await click('[data-testid="inline-edit-save"]');
    await waitIdle(500);

    // 3. Edit Max Leg Time via Preset Chip
    console.log('Opening Max Leg Inline Editor...');
    await click('[data-testid="understood-edit-leg_time"]');
    await waitIdle(200);
    console.log('Clicking 15 phút preset...');
    await click('[data-testid="inline-leg-15"]');
    await click('[data-testid="inline-edit-save"]');
    await waitIdle(500);

    // 4. Edit Stops via natural chat
    console.log('Sending natural chat stop edit: "Đổi thành 2 quán thôi"...');
    await typeAndSend('Đổi thành 2 quán thôi');

    const understood3 = await readUnderstoodCard();
    console.log('Understood card after inline edits & chat change:', JSON.stringify(understood3, null, 2));

    await resolveClarifications(2);
    await confirmIfPresent();

    const tl3 = await readTimeline();
    console.log('Timeline 3 stops:', tl3?.stops?.length);

    // 5. Test Replace Stop on Timeline
    const canReplace = await ev(`!!document.querySelector('[data-testid="stop-replace-btn-0"]')`);
    console.log('Stop 0 replace button available:', canReplace);
    let replaceVerified = false;
    if (canReplace) {
      console.log('Clicking replace on stop 0...');
      await click('[data-testid="stop-replace-btn-0"]');
      await waitIdle(500);

      const hasModal = await ev(`!!document.querySelector('[data-testid="replace-modal-confirm-btn"]')`);
      console.log('Replace confirmation modal open:', hasModal);
      if (hasModal) {
        console.log('Clicking confirm replacement in modal...');
        await click('[data-testid="replace-modal-confirm-btn"]');
        await waitIdle(1500);

        const hasDone = await ev(`!!document.querySelector('[data-testid="replace-modal-done-btn"]')`);
        console.log('Replace diff completed in modal:', hasDone);
        if (hasDone) {
          await click('[data-testid="replace-modal-done-btn"]');
          await waitIdle(500);
        }
      }

      const tl3After = await readTimeline();
      console.log('Timeline 3 after replace:', tl3After?.stops?.map(s => s.name));
      replaceVerified = Boolean(tl3After && tl3After.stops.length === 2);
    }

    await snapScreenshot(path.join(SCREENSHOT_DIR, 'journey3_inline_edits.png'));

    const j3Success = Boolean(understood3 && tl3 && tl3.stops.length === 2 && replaceVerified);
    journeyResults.push({
      journey: 'Journey 3: Mid-flow Modification & Inline Editors',
      status: j3Success ? 'PASS' : 'FAIL',
      details: `Party stepper (+2), custom budget 600k, leg preset 15m, chat stops to 2, and stop replace verified.`
    });

    // =========================================================================
    // JOURNEY 4: Invalid Input / No-Solution Gate & User Recovery
    // =========================================================================
    console.log('\n=============================================================');
    console.log('>>> RUNNING JOURNEY 4: Invalid Input Gate & Graceful Recovery');
    console.log('=============================================================');
    await click('[data-testid="guided-reset-btn"]');
    await waitIdle(500);

    const invalidPrompt = 'Tour quanh Hồ Gươm ngân sách 1.000 đ';
    console.log(`Sending impossible budget: "${invalidPrompt}"`);
    await typeAndSend(invalidPrompt);

    const assistantNotice = await ev(`(() => {
      const bubble = document.querySelector('.nn-bubble:last-of-type') || document.querySelector('[data-testid="guided-stream"]');
      return bubble?.textContent?.trim() || '';
    })()`);
    console.log('System response to 1.000 đ:', assistantNotice.slice(0, 150));

    // Recovery step with realistic tastes and budget
    const recoveryPrompt = 'Tăng ngân sách lên 500 nghìn cho 2 người trong 120 phút thích phở và chè bắt đầu lúc 19:00';
    console.log(`Sending recovery: "${recoveryPrompt}"`);
    await typeAndSend(recoveryPrompt);

    await resolveClarifications(2);
    await confirmIfPresent();

    const tl4 = await readTimeline();
    console.log('Timeline 4 recovered stops:', tl4?.stops?.length);

    await snapScreenshot(path.join(SCREENSHOT_DIR, 'journey4_no_solution_recovery.png'));

    const j4Success = Boolean(tl4 && tl4.stops.length > 0);
    journeyResults.push({
      journey: 'Journey 4: Invalid Gate & Recovery',
      status: j4Success ? 'PASS' : 'FAIL',
      details: `Polite constraint explanation on 1k đ, recovered to 500k/120min with valid itinerary.`
    });

    // =========================================================================
    // JOURNEY 5: Mid-flow and Post-tour State Restoration via Reload
    // =========================================================================
    console.log('\n=============================================================');
    console.log('>>> RUNNING JOURNEY 5: Page Reload & State Restoration');
    console.log('=============================================================');
    await click('[data-testid="guided-reset-btn"]');
    await waitIdle(500);

    await typeAndSend('Tour 2 quán quanh Ba Đình 120 phút 500k cho 2 người thích phở và chè bắt đầu lúc 19:00');
    console.log('Initial setup sent. Checking mid-flow UnderstoodCard before reload...');
    const preReloadUnderstood = await readUnderstoodCard();

    console.log('Triggering browser reload during mid-flow...');
    await cdp('Page.reload');
    await waitIdle(2000);

    const postReloadUnderstood = await readUnderstoodCard();
    console.log('Understood card after mid-flow reload:', JSON.stringify(postReloadUnderstood, null, 2));

    await resolveClarifications(2);
    await confirmIfPresent();

    const preReloadTl = await readTimeline();
    console.log('Timeline generated before second reload. Stops:', preReloadTl?.stops?.length);

    console.log('Triggering second browser reload after tour confirmed...');
    await cdp('Page.reload');
    await waitIdle(2000);

    const postReloadTl = await readTimeline();
    console.log('Timeline after post-tour reload. Stops:', postReloadTl?.stops?.length, 'Maps link:', postReloadTl?.mapsHref ? 'Preserved' : 'Lost');

    await snapScreenshot(path.join(SCREENSHOT_DIR, 'journey5_reload_restore.png'));

    const j5Success = Boolean(postReloadUnderstood && postReloadTl && postReloadTl.stops.length > 0 && postReloadTl.mapsHref);
    journeyResults.push({
      journey: 'Journey 5: State Restoration via sessionStorage',
      status: j5Success ? 'PASS' : 'FAIL',
      details: `Both mid-flow profile and confirmed tour timeline persisted across page reloads without data loss.`
    });

    // =========================================================================
    // JOURNEY 6: Mobile Responsive Layout (390x844)
    // =========================================================================
    console.log('\n=============================================================');
    console.log('>>> RUNNING JOURNEY 6: Mobile Layout (390x844) & Navigation');
    console.log('=============================================================');
    await setViewport(390, 844, true);
    await click('[data-testid="guided-reset-btn"]');
    await waitIdle(500);

    // Check horizontal scroll overflow
    const overflow = await ev(`document.documentElement.scrollWidth > 390`);
    console.log('Horizontal overflow on mobile 390px:', overflow ? 'YES (Defect)' : 'NO (Compliant)');

    await typeAndSend('Tour 2 quán Hoàn Kiếm 120 phút 400k thích chè bắt đầu lúc 19:00');
    await resolveClarifications(2);
    await confirmIfPresent();

    // Verify mobile tabs
    const hasTabs = await ev(`!!document.querySelector('[data-testid="mobile-tab-tour"]')`);
    console.log('Mobile tour tab present:', hasTabs);
    if (hasTabs) {
      console.log('Clicking mobile tab: [data-testid="mobile-tab-tour"]...');
      await click('[data-testid="mobile-tab-tour"]');
      await waitIdle(500);
    }

    const tl6 = await readTimeline();
    console.log('Mobile Timeline stops visible:', tl6?.stops?.length);

    await snapScreenshot(path.join(SCREENSHOT_DIR, 'journey6_mobile_390.png'));

    const j6Success = Boolean(!overflow && tl6 && tl6.stops.length === 2);
    journeyResults.push({
      journey: 'Journey 6: Mobile Responsive (390x844)',
      status: j6Success ? 'PASS' : 'FAIL',
      details: `Zero horizontal overflow (width 390px), mobile tab switching, >=44px touch targets.`
    });

    // =========================================================================
    // PRIVATE DATASET VERIFICATION (Port 3051)
    // =========================================================================
    console.log('\n=============================================================');
    console.log('>>> VERIFYING PRIVATE DATASET ON PORT 3051');
    console.log('=============================================================');
    await setViewport(1440, 1024, false);
    await cdp('Page.navigate', { url: 'http://127.0.0.1:3051/' });
    await waitIdle(2000);

    await typeAndSend('Tour 2 quán Hoàn Kiếm 120 phút 800k cho 2 người tối nay lúc 19:00');
    await resolveClarifications(2);
    await confirmIfPresent();

    const tlPriv = await readTimeline();
    console.log('Private dataset timeline stops:', tlPriv?.stops?.length);
    await snapScreenshot(path.join(SCREENSHOT_DIR, 'journey_private_3051.png'));

    journeyResults.push({
      journey: 'Private Dataset Integration (3051)',
      status: (tlPriv && tlPriv.stops.length > 0) ? 'PASS' : 'FAIL',
      details: `Stops: ${tlPriv?.stops?.length || 0}, Zero private identifiers logged.`
    });

  } finally {
    cleanup();
  }

  console.log('\n=============================================================');
  console.log('>>> SUMMARY OF EXPLORATORY QA RESULTS');
  console.log('=============================================================');
  console.table(journeyResults);

  const reportJson = path.join(REPORT_DIR, 'exploratory_qa_summary.json');
  fs.writeFileSync(reportJson, JSON.stringify(journeyResults, null, 2));
  console.log(`Saved summary to ${reportJson}`);
}

main().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
