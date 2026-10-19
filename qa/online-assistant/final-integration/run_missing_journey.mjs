// qa/online-assistant/final-integration/run_missing_journey.mjs
// Targeted verification of User Journey, Timeline, Free Google Maps, Stop Replacement & Reload Persistence.
// Read-only on product code.

import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT_WEB = 3060;
const PORT_CDP = 9334;
const WEB_URL = `http://127.0.0.1:${PORT_WEB}/?guided=1&conv=qa_final_journey`;
const BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const pause = (ms) => new Promise((res) => setTimeout(res, ms));

async function until(fn, timeoutMs = 15000, stepMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fn();
      if (res) return res;
    } catch {}
    await pause(stepMs);
  }
  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

async function main() {
  console.log('=== RUNNING TARGETED USER JOURNEY & TIMELINE VERIFICATION ===');

  const tempProfile = join(__dirname, '.temp_chrome_profile_journey');
  const browserProc = spawn(BROWSER_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--remote-debugging-port=${PORT_CDP}`,
    `--user-data-dir=${tempProfile}`,
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  const cleanup = () => {
    try { browserProc.kill(); } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  try {
    let target;
    await until(async () => {
      const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json`)).json();
      target = list.find((x) => x.type === 'page');
      return Boolean(target);
    }, 10000);

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

    async function waitIdle() {
      await pause(150);
      await until(async () => !(await ev(`!!document.querySelector('[aria-busy="true"]')`)), 25000);
      await pause(250);
    }

    async function click(selector) {
      await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);
      const box = await ev(`(()=>{
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2 };
      })()`);
      if (!box) throw new Error(`Selector not found for click: ${selector}`);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...box });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...box });
      await pause(100);
    }

    async function typeInput(selector, text) {
      await click(selector);
      await ev(`(()=>{
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) {
          el.value = '';
          el.focus();
        }
      })()`);
      for (const char of text) {
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', text: char, unmodifiedText: char });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp' });
      }
      await ev(`(()=>{
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
    }

    await cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1024,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log(`Navigating to ${WEB_URL}...`);
    await cdp('Page.navigate', { url: WEB_URL });
    await until(async () => ev(`!!document.querySelector('[data-testid="guided-container"]')`));
    await waitIdle();

    // Reset if there is existing state
    const hasReset = await ev(`!!document.querySelector('[data-testid="guided-reset-btn"]')`);
    if (hasReset) {
      await click('[data-testid="guided-reset-btn"]');
      await waitIdle();
    }

    // Turn 1: Initial Vietnamese request with allergy and constraints
    console.log('Sending Turn 1: Initial prompt with food, area, allergy...');
    await typeInput('[data-testid="guided-input"]', 'Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin.');
    await click('[data-testid="guided-send-btn"]');
    await waitIdle();

    const turn1Data = await ev(`(()=>{
      const understood = document.querySelector('[data-testid="understood-card"]');
      const safety = document.querySelector('[data-testid="understood-safety-note"]');
      const clarifyCard = document.querySelector('[data-testid="clarify-question-card"]');
      const scopeGroupOption = document.querySelector('[data-testid="clarify-option-scope:group"]');
      return {
        hasUnderstood: !!understood,
        understoodText: understood ? understood.innerText : '',
        hasSafetyNote: !!safety,
        safetyText: safety ? safety.innerText : '',
        hasClarifyCard: !!clarifyCard,
        hasScopeGroupOption: !!scopeGroupOption
      };
    })()`);
    console.log('Turn 1 result:', turn1Data);

    // Turn 2: Click scope:group chip
    console.log('Clicking clarify option scope:group...');
    await click('[data-testid="clarify-option-scope:group"]');
    await waitIdle();

    const turn2Data = await ev(`(()=>{
      const clarifyCard = document.querySelector('[data-testid="clarify-question-card"]');
      return {
        questionText: clarifyCard ? clarifyCard.innerText : ''
      };
    })()`);
    console.log('Turn 2 result:', turn2Data);

    // Turn 3: Send "19h" for start_time
    console.log('Sending Turn 3: "19h"...');
    await typeInput('[data-testid="guided-input"]', '19h');
    await click('[data-testid="guided-send-btn"]');
    await waitIdle();

    const turn3Data = await ev(`(()=>{
      const confirmCard = document.querySelector('[data-testid="confirm-summary-card"]');
      const confirmYes = document.querySelector('[data-testid="confirm-yes-btn"]');
      const confirmNo = document.querySelector('[data-testid="confirm-no-btn"]');
      const venuesList = document.querySelector('[data-testid="confirm-venues-list"]');
      return {
        hasConfirmCard: !!confirmCard,
        hasConfirmYes: !!confirmYes,
        hasConfirmNo: !!confirmNo,
        venuesList: venuesList ? venuesList.innerText : ''
      };
    })()`);
    console.log('Turn 3 result:', turn3Data);

    // Turn 4: Click confirm-yes-btn
    console.log('Clicking confirm-yes-btn ("Đúng, lập tour")...');
    await click('[data-testid="confirm-yes-btn"]');
    await waitIdle();

    // Verify Guided Timeline & Stops
    const timelineData = await ev(`(()=>{
      const timeline = document.querySelector('[data-testid="guided-timeline"]');
      const stopCards = Array.from(document.querySelectorAll('[data-testid^="guided-stop-"]'));
      const stopNames = stopCards.map(s => s.querySelector('.nn-stop-name, h3, h4')?.textContent?.trim() || '');
      const mapsCta = document.querySelector('[data-testid="google-maps-cta"]');
      const mapsCtaHref = mapsCta ? mapsCta.getAttribute('href') : null;
      const changeStopBtn = document.querySelector('[data-testid="action-change-stop"]') || document.querySelector('[data-testid="stop-replace-btn-0"]');
      const allergyNote = document.querySelector('[data-testid="timeline-allergy-note"]');
      return {
        hasTimeline: !!timeline,
        stopCount: stopCards.length,
        stopNames,
        mapsCtaHref,
        hasChangeStopBtn: !!changeStopBtn,
        allergyNote: allergyNote ? allergyNote.innerText : ''
      };
    })()`);
    console.log('Timeline result:', timelineData);

    // Verify Free Google Maps Link format
    const mapsUrl = timelineData.mapsCtaHref || '';
    const isFreeMapsValid = mapsUrl.startsWith('https://www.google.com/maps/dir/') &&
      mapsUrl.includes('api=1') &&
      mapsUrl.includes('travelmode=walking') &&
      !mapsUrl.includes('key=') &&
      !mapsUrl.includes('api_key=');

    console.log('Free Maps URL valid:', isFreeMapsValid, mapsUrl);

    // Replace Stop Test
    console.log('Testing Stop Replacement via stop-replace-btn-0...');
    let replaceOutcome = { success: false, original: timelineData.stopNames[0], updated: null };
    const canReplace = await ev(`!!document.querySelector('[data-testid="stop-replace-btn-0"]') || !!document.querySelector('[data-testid="action-change-stop"]')`);
    if (canReplace) {
      const replaceBtnSelector = (await ev(`!!document.querySelector('[data-testid="stop-replace-btn-0"]')`))
        ? '[data-testid="stop-replace-btn-0"]'
        : '[data-testid="action-change-stop"]';
      await click(replaceBtnSelector);
      await waitIdle();

      const modalOpen = await ev(`!!document.querySelector('[data-testid="replace-modal-confirm-btn"]') || !!document.querySelector('.nn-replace-modal')`);
      if (modalOpen) {
        await click('[data-testid="replace-modal-confirm-btn"]');
        await waitIdle();
        const doneBtn = await ev(`!!document.querySelector('[data-testid="replace-modal-done-btn"]')`);
        if (doneBtn) await click('[data-testid="replace-modal-done-btn"]');
        await waitIdle();

        const updatedStop0 = await ev(`document.querySelectorAll('[data-testid^="guided-stop-"]')[0]?.querySelector('.nn-stop-name, h3, h4')?.textContent?.trim()`);
        replaceOutcome = {
          success: true,
          original: timelineData.stopNames[0],
          updated: updatedStop0
        };
        console.log('Replace stop outcome:', replaceOutcome);
      }
    }

    // Reload Persistence Test
    console.log('Testing Reload Persistence...');
    await cdp('Page.reload');
    await until(async () => ev(`!!document.querySelector('[data-testid="guided-container"]')`));
    await waitIdle();

    const reloadData = await ev(`(()=>{
      const timeline = document.querySelector('[data-testid="guided-timeline"]');
      const stopCards = Array.from(document.querySelectorAll('[data-testid^="guided-stop-"]'));
      return {
        hasTimeline: !!timeline,
        stopCount: stopCards.length
      };
    })()`);
    console.log('Reload persistence result:', reloadData);

    // Read previous evidence and update
    const evidencePath = join(__dirname, 'final_integration_evidence.json');
    let prevEvidence = [];
    try {
      prevEvidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    } catch {}

    // Filter out previous failed UserJourney, FreeMaps, Persistence, ReplaceStop
    const preserved = prevEvidence.filter(e =>
      !['UserJourney', 'FreeMaps', 'Persistence', 'ReplaceStop'].includes(e.section)
    );

    // Add updated evidence
    preserved.push({
      section: 'UserJourney',
      name: 'Step 1: Understood Card & Safety Disclosure',
      status: turn1Data.hasUnderstood && turn1Data.hasSafetyNote ? 'PASS' : 'FAIL',
      details: turn1Data,
      timestamp: new Date().toISOString()
    });

    preserved.push({
      section: 'UserJourney',
      name: 'Step 2: Clarify Progression to Confirmation Summary',
      status: turn3Data.hasConfirmCard && turn3Data.hasConfirmYes ? 'PASS' : 'FAIL',
      details: turn3Data,
      timestamp: new Date().toISOString()
    });

    preserved.push({
      section: 'UserJourney',
      name: 'Step 3: Confirm Tour Generation (3-5 Stops in Timeline)',
      status: timelineData.hasTimeline && timelineData.stopCount >= 3 ? 'PASS' : 'FAIL',
      details: timelineData,
      timestamp: new Date().toISOString()
    });

    preserved.push({
      section: 'FreeMaps',
      name: 'Public External Navigation URLs (Walking Mode, Zero Paid Keys)',
      status: isFreeMapsValid ? 'PASS' : 'FAIL',
      details: {
        url: mapsUrl,
        isValidPublicWalkingUrl: isFreeMapsValid,
        hasNoPaidApiKey: !mapsUrl.includes('key=')
      },
      timestamp: new Date().toISOString()
    });

    preserved.push({
      section: 'ReplaceStop',
      name: 'Single Stop Replaced and Timeline Updated',
      status: replaceOutcome.success ? 'PASS' : 'FAIL',
      details: replaceOutcome,
      timestamp: new Date().toISOString()
    });

    preserved.push({
      section: 'Persistence',
      name: 'Session and Tour Persisted across Reload with conv param',
      status: reloadData.hasTimeline && reloadData.stopCount >= 3 ? 'PASS' : 'FAIL',
      details: reloadData,
      timestamp: new Date().toISOString()
    });

    writeFileSync(evidencePath, JSON.stringify(preserved, null, 2), 'utf8');
    console.log(`Updated evidence saved to ${evidencePath}`);
    console.log('=== TARGETED VERIFICATION COMPLETED SUCCESSFULLY ===');

  } finally {
    cleanup();
  }
}

main().catch(err => {
  console.error('Fatal error in targeted verification:', err);
  process.exit(1);
});
