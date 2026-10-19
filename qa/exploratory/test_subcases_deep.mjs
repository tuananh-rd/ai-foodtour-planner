import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';

const PORT_CDP = 19700;
const BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPORT_DIR = path.resolve('docs/reports/functional-qa-20261018');

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

async function checkPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

class CDPClient {
  constructor(port = PORT_CDP) {
    this.port = port;
    this.proc = null;
    this.scratch = null;
    this.ws = null;
    this.msgId = 0;
    this.pending = new Map();
    this.networkLogs = [];
  }

  async start() {
    const free = await checkPortFree(this.port);
    if (!free) throw new Error(`Port ${this.port} is in use`);

    this.scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-rigorous-'));
    const profile = path.join(this.scratch, 'profile');

    this.proc = spawn(BROWSER_PATH, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${profile}`,
      'about:blank'
    ], { stdio: 'ignore', windowsHide: true });

    let target = null;
    for (let i = 0; i < 60; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${this.port}/json`)).json();
        target = list.find((x) => x.type === 'page');
        if (target) break;
      } catch (_) {}
      await pause(100);
    }
    if (!target) throw new Error('CDP target page not found');

    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });

    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Network.requestWillBeSent') {
        this.networkLogs.push({
          url: m.params.request.url,
          method: m.params.request.method,
          postData: m.params.request.postData
        });
      }
      if (m.method === 'Network.responseReceived') {
        const r = this.networkLogs.find(x => x.url === m.params.response.url);
        if (r) r.status = m.params.response.status;
      }
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message));
        else p.resolve(m.result);
      }
    };

    for (const d of ['Page', 'Network', 'Runtime', 'DOM']) {
      await this.send(`${d}.enable`);
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result?.value;
  }

  async setViewport(width, height, isMobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile,
      screenOrientation: isMobile ? { angle: 0, type: 'portraitPrimary' } : undefined
    });
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const filepath = path.join(REPORT_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
    console.log(`[Screenshot] ${filename}`);
    return filepath;
  }

  async waitIdle(ms = 300) {
    await pause(ms);
    for (let i = 0; i < 40; i++) {
      const busy = await this.eval(`!!document.querySelector('[aria-busy="true"]')`);
      if (!busy) break;
      await pause(100);
    }
    await pause(200);
  }

  async click(selector) {
    await this.eval(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);
    const box = await this.eval(`(()=>{
      const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
      return r && { x: r.x + r.width/2, y: r.y + r.height/2 };
    })()`);
    if (!box) throw new Error(`Cannot find selector to click: ${selector}`);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...box });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...box });
    await this.waitIdle();
  }

  async clickByText(tag, text) {
    const box = await this.eval(`(()=>{
      const els = Array.from(document.querySelectorAll(${JSON.stringify(tag)}));
      const el = els.find(e => e.innerText && e.innerText.includes(${JSON.stringify(text)}));
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width/2, y: r.y + r.height/2 };
    })()`);
    if (!box) throw new Error(`Cannot find ${tag} with text: ${text}`);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...box });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...box });
    await this.waitIdle();
  }

  async typeAndSend(text, selector = '[data-testid="guided-input"]') {
    await this.eval(`(()=>{
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
    const sendBtn = await this.eval(`!!document.querySelector('[data-testid="guided-send-btn"]:not([disabled])')`);
    if (sendBtn) {
      await this.click('[data-testid="guided-send-btn"]');
    } else {
      await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
    }
    await this.waitIdle();
  }

  async resetFreshSession(url) {
    this.networkLogs.length = 0;
    await this.send('Page.navigate', { url });
    await this.waitIdle(1000);
    await this.eval(`(()=>{
      try { sessionStorage.clear(); } catch (_) {}
      try { localStorage.clear(); } catch (_) {}
    })()`);
    await this.send('Page.reload');
    await this.waitIdle(1500);
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }
    try {
      if (this.proc?.pid) {
        execFileSync('taskkill', ['/pid', String(this.proc.pid), '/T', '/F'], { stdio: 'ignore' });
      }
    } catch (_) {}
    try {
      if (this.scratch) fs.rmSync(this.scratch, { recursive: true, force: true });
    } catch (_) {}
  }
}

async function run() {
  const cdp = new CDPClient(PORT_CDP);
  const results = [];
  const bugs = [];

  function record(id, title, status, details, evidence = null) {
    results.push({ id, title, status, details, evidence });
    console.log(`[TEST ${status}] ${id}: ${title} -> ${details}`);
  }

  function bug(id, severity, component, title, steps, expected, actual, evidence, owner) {
    bugs.push({ id, severity, component, title, steps, expected, actual, evidence, owner });
    console.log(`[BUG ${id} | ${severity}] ${title}`);
  }

  try {
    await cdp.start();
    await cdp.setViewport(1440, 1024, false);

    // =========================================================================
    // CASE 1: Reproduce BUG-006 (Compound No-Allergy Dead-Air) on Fresh 3050 Session
    // =========================================================================
    console.log('\n=== Case 1: Reproducing BUG-006 on Fresh 3050 Session ===');
    await cdp.resetFreshSession('http://127.0.0.1:3050/');

    const noAllergyPrompt = 'Tour ba quán quanh Hồ Gươm tối nay một tiếng rưỡi, năm trăm nghìn cả hội cho hai người, không dị ứng gì';
    await cdp.typeAndSend(noAllergyPrompt);
    await pause(1500);
    await cdp.screenshot('bug006_no_allergy_initial.png');

    const c1State1 = await cdp.eval(`(() => {
      const u = document.querySelector('[data-testid="understood-card"]')?.innerText || '';
      const clarify = !!document.querySelector('[data-testid="clarify-question-card"]');
      const timeline = !!document.querySelector('[data-testid="guided-timeline"]');
      return { u, clarify, timeline };
    })()`);

    // In turn 2, send '19h'
    await cdp.typeAndSend('19h');
    await pause(1500);
    await cdp.screenshot('bug006_no_allergy_after_19h.png');

    const c1State2 = await cdp.eval(`(() => {
      const u = document.querySelector('[data-testid="understood-card"]')?.innerText || '';
      const clarify = !!document.querySelector('[data-testid="clarify-question-card"]');
      const clarifyText = document.querySelector('[data-testid="clarify-question-card"]')?.innerText || '';
      const timeline = !!document.querySelector('[data-testid="guided-timeline"]');
      return { u, clarify, clarifyText, timeline };
    })()`);

    const bug006Confirmed = !c1State1.clarify && !c1State2.timeline && c1State2.clarifyText.includes('Bạn muốn mình làm gì trước');
    if (bug006Confirmed) {
      bug(
        'BUG-006',
        'P1',
        'Backend Engine (No-Allergy Compound Goal Discard)',
        'Explicit "không dị ứng gì" in compound tour prompt clears pending and drops tour proposal',
        `Send: "${noAllergyPrompt}" -> Turn 1 leaves pending=null -> Send: "19h"`,
        'UnderstoodCard displays preferences and prompts for start time or proposes tour',
        'Turn 1 leaves chat.pending=null with no clarify card; sending "19h" triggers clarify_intent ("Bạn muốn mình làm gì trước?") and start_time remains Chưa chọn',
        'bug006_no_allergy_initial.png',
        'Codex'
      );
      record('CASE-1', 'Compound no-allergy prompt flow', 'FAIL', 'Reproduced BUG-006: explicit "không dị ứng gì" causes goal none and dead-air state', 'bug006_no_allergy_initial.png');
    } else {
      record('CASE-1', 'Compound no-allergy prompt flow', 'PASS', 'Compound no-allergy prompt correctly advanced flow', 'bug006_no_allergy_initial.png');
    }

    // =========================================================================
    // CASE 2: Retest BUG-001 (Attached Numbers) on Fixed Preview 3050
    // =========================================================================
    console.log('\n=== Case 2: Retesting BUG-001 on Fixed Preview 3050 ===');
    await cdp.resetFreshSession('http://127.0.0.1:3050/');

    const attachedPrompt = 'tour3 quán quanh Hồ Gươm tối nay120 phút,500nghìn cho2người,thích phở và bún chả,dị ứng đậu phộng';
    await cdp.typeAndSend(attachedPrompt);
    await pause(1500);
    await cdp.screenshot('retest_3050_attached_numbers.png');

    const uAttached = await cdp.eval(`document.querySelector('[data-testid="understood-card"]')?.innerText || ''`);
    // POSITIVE ASSERTIONS: require exact values present, not negated checks
    const has3Stops = uAttached.includes('Số quán\n3');
    const hasEvening = uAttached.includes('Buổi\nBuổi tối');
    const has120Min = uAttached.includes('Tổng thời gian\n120 phút');
    const has2Party = uAttached.includes('Số người\n2');
    const hasHoanKiem = uAttached.includes('Hồ Gươm');

    const attachedFullyFixed = has3Stops && hasEvening && has120Min && has2Party && hasHoanKiem;
    record(
      'CASE-2',
      'Retest BUG-001 (Attached numbers) on Fixed 3050',
      attachedFullyFixed ? 'PASS' : 'FAIL',
      `Positive checks: 3 stops (${has3Stops}), evening (${hasEvening}), 120m (${has120Min}), party 2 (${has2Party}), Hồ Gươm (${hasHoanKiem})`,
      'retest_3050_attached_numbers.png'
    );

    // =========================================================================
    // CASE 3: Retest BUG-004 (Greeting Prefix) on Fixed Preview 3050
    // =========================================================================
    console.log('\n=== Case 3: Retesting BUG-004 on Fixed Preview 3050 ===');
    await cdp.resetFreshSession('http://127.0.0.1:3050/');

    const greetingRequest = 'Chào bạn, mình muốn tour 3 quán quanh Hồ Gươm tối nay trong120phút,ngân sách500nghìn cho2người';
    await cdp.typeAndSend(greetingRequest);
    await pause(1500);
    await cdp.screenshot('retest_3050_greeting_request.png');

    const uGreeting = await cdp.eval(`document.querySelector('[data-testid="understood-card"]')?.innerText || ''`);
    const gHasArea = uGreeting.includes('Hồ Gươm');
    const gHasStops = uGreeting.includes('Số quán\n3');
    const gHasDuration = uGreeting.includes('Tổng thời gian\n120 phút');
    const gHasParty = uGreeting.includes('Số người\n2');

    const greetingFullyFixed = gHasArea && gHasStops && gHasDuration && gHasParty;
    record(
      'CASE-3',
      'Retest BUG-004 (Greeting prefix) on Fixed 3050',
      greetingFullyFixed ? 'PASS' : 'FAIL',
      `Positive checks: Hồ Gươm (${gHasArea}), 3 stops (${gHasStops}), 120m (${gHasDuration}), party 2 (${gHasParty})`,
      'retest_3050_greeting_request.png'
    );

    // =========================================================================
    // CASE 4: Real Concurrent 409 Revision Conflict & Resync (Matrix M6)
    // =========================================================================
    console.log('\n=== Case 4: Real Concurrent 409 Conflict & Resync Test ===');
    await cdp.resetFreshSession('http://127.0.0.1:3050/');

    const promptS0 = 'Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin.';
    await cdp.typeAndSend(promptS0);
    await pause(1500);

    // Answer budget scope & time
    if (await cdp.eval(`!!document.querySelector('[data-testid="clarify-option-scope:group"]')`)) {
      await cdp.click('[data-testid="clarify-option-scope:group"]');
      await pause(1000);
    }
    if (await cdp.eval(`!!document.querySelector('[data-testid="clarify-option-time:19:00"]')`)) {
      await cdp.click('[data-testid="clarify-option-time:19:00"]');
      await pause(1000);
    }

    // Verify confirm card is present before conflict
    const hasConfirmBefore = await cdp.eval(`!!document.querySelector('[data-testid="confirm-yes-btn"]')`);
    console.log('Has confirm-yes-btn before concurrent edit:', hasConfirmBefore);

    // Extract current session credentials from browser sessionStorage
    const sessionCreds = await cdp.eval(`({
      sessionId: sessionStorage.getItem('foodtour_chat_session_id'),
      token: sessionStorage.getItem('foodtour_chat_session_token')
    })`);
    console.log('Browser session credentials for 409 test:', sessionCreds.sessionId);

    // Read current session revision directly from backend
    const currentSessionRes = await fetch(`http://127.0.0.1:8050/v1/sessions/${sessionCreds.sessionId}`, {
      headers: { 'X-Session-Token': sessionCreds.token }
    });
    const currentSession = await currentSessionRes.json();
    console.log('Current backend revision before out-of-band edit:', currentSession.revision);

    // ADVANCE REVISION OUT-OF-BAND (simulate concurrent client mutation)
    const outOfBandRes = await fetch(`http://127.0.0.1:8050/v1/sessions/${sessionCreds.sessionId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': sessionCreds.token
      },
      body: JSON.stringify({
        text: 'mình bị dị ứng thêm hạt điều nữa nhé',
        revision: currentSession.revision
      })
    });
    console.log('Out-of-band turn status:', outOfBandRes.status);

    // NOW CLICK STALE 'confirm-yes-btn' IN UI (which holds old revision)
    cdp.networkLogs.length = 0;
    await cdp.click('[data-testid="confirm-yes-btn"]');
    await pause(2000);
    await cdp.screenshot('m6_real_409_conflict_observed.png');

    // Check network for 409 response
    const has409Network = cdp.networkLogs.some(n => n.status === 409);
    const hasResyncGet = cdp.networkLogs.some(n => n.method === 'GET' && n.url.includes(`/v1/sessions/${sessionCreds.sessionId}`));
    const uiStateAfter409 = await cdp.eval(`(() => {
      const text = document.body.innerText;
      const hasCashew = text.includes('hạt điều') || text.includes('đậu phộng');
      const hasErrorOrAlert = text.includes('thay đổi trên máy chủ') || text.includes('đồng bộ');
      return { text: text.slice(0, 300), hasCashew, hasErrorOrAlert };
    })()`);
    console.log('409 verification outcomes:', { has409Network, hasResyncGet, uiStateAfter409 });

    record(
      'CASE-4',
      'Real Concurrent 409 Conflict and Auto-Resync',
      (has409Network && hasResyncGet) ? 'PASS' : 'FAIL',
      `Observed 409 on stale UI confirm: ${has409Network}; GET resync executed: ${hasResyncGet}; State restored: ${uiStateAfter409.hasCashew}`,
      'm6_real_409_conflict_observed.png'
    );

    // =========================================================================
    // CASE 5: Real Offline Network Failure & Calm Error Banner (Matrix M8)
    // =========================================================================
    console.log('\n=== Case 5: Real Offline Network Failure Test ===');
    await cdp.resetFreshSession('http://127.0.0.1:3050/');

    // Emulate real network disconnection via CDP
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0
    });

    console.log('Sending message while offline...');
    await cdp.typeAndSend('Tìm quán ăn quanh Phố Cổ');
    await pause(1500);
    await cdp.screenshot('m8_offline_calm_error.png');

    const offlineUiState = await cdp.eval(`(() => {
      const text = document.body.innerText;
      const hasCalmMsg = text.includes('Không thể kết nối') || text.includes('máy chủ') || text.includes('thử lại');
      const noRawError = !text.includes('Failed to fetch') && !text.includes('NetworkError') && !text.includes('"detail"');
      const hasRetryBtn = !!document.querySelector('[data-testid="guided-error-retry-btn"]');
      return { hasCalmMsg, noRawError, hasRetryBtn, preview: text.slice(0, 300) };
    })()`);
    console.log('Offline UI State:', offlineUiState);

    // Restore network
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1
    });

    record(
      'CASE-5',
      'Real Offline Network Disconnection Handling',
      (offlineUiState.hasCalmMsg && offlineUiState.noRawError) ? 'PASS' : 'FAIL',
      `Calm Vietnamese message: ${offlineUiState.hasCalmMsg}; No raw JS error leaked: ${offlineUiState.noRawError}; Retry button: ${offlineUiState.hasRetryBtn}`,
      'm8_offline_calm_error.png'
    );

    // =========================================================================
    // CASE 6: Strict Google Maps Stop Order & Coordinates Alignment (Matrix M9)
    // =========================================================================
    console.log('\n=== Case 6: Strict Google Maps URL Stop Order Alignment ===');
    await cdp.resetFreshSession('http://127.0.0.1:3050/');
    await cdp.typeAndSend(promptS0);
    await pause(1500);
    if (await cdp.eval(`!!document.querySelector('[data-testid="clarify-option-scope:group"]')`)) {
      await cdp.click('[data-testid="clarify-option-scope:group"]');
      await pause(1000);
    }
    if (await cdp.eval(`!!document.querySelector('[data-testid="clarify-option-time:19:00"]')`)) {
      await cdp.click('[data-testid="clarify-option-time:19:00"]');
      await pause(1000);
    }
    if (await cdp.eval(`!!document.querySelector('[data-testid="confirm-yes-btn"]')`)) {
      await cdp.click('[data-testid="confirm-yes-btn"]');
      await pause(2000);
    }

    // Read session tour data directly from backend
    const sId = await cdp.eval(`sessionStorage.getItem('foodtour_chat_session_id')`);
    const sTok = await cdp.eval(`sessionStorage.getItem('foodtour_chat_session_token')`);
    const sessionTour = await (await fetch(`http://127.0.0.1:8050/v1/sessions/${sId}`, { headers: { 'X-Session-Token': sTok } })).json();
    const tourStops = sessionTour.tour?.stops || [];

    const mapsData = await cdp.eval(`(() => {
      const a = document.querySelector('a[data-testid="google-maps-cta"]');
      if (!a) return null;
      const u = new URL(a.href);
      return {
        href: a.href,
        origin: decodeURIComponent(u.searchParams.get('origin') || ''),
        destination: decodeURIComponent(u.searchParams.get('destination') || ''),
        waypoints: decodeURIComponent(u.searchParams.get('waypoints') || ''),
        travelmode: u.searchParams.get('travelmode'),
        hasApiKey: u.searchParams.has('key')
      };
    })()`);
    await cdp.screenshot('m9_strict_stop_order.png');

    const expectedOrigin = `${tourStops[0]?.lat},${tourStops[0]?.lon}`;
    const expectedDest = `${tourStops[tourStops.length - 1]?.lat},${tourStops[tourStops.length - 1]?.lon}`;
    const expectedWaypoints = tourStops.length > 2 ? tourStops.slice(1, -1).map(s => `${s.lat},${s.lon}`).join('|') : '';

    const originMatches = mapsData?.origin === expectedOrigin;
    const destMatches = mapsData?.destination === expectedDest;
    const waypointsMatch = (mapsData?.waypoints || '') === expectedWaypoints;
    const modeIsWalking = mapsData?.travelmode === 'walking';
    const noKey = !mapsData?.hasApiKey;

    const strictMapsOk = originMatches && destMatches && waypointsMatch && modeIsWalking && noKey;
    record(
      'CASE-6',
      'Google Maps URL Stop Order and Mode Rigorous Alignment',
      strictMapsOk ? 'PASS' : 'FAIL',
      `Origin match: ${originMatches} (${expectedOrigin}); Dest match: ${destMatches} (${expectedDest}); Waypoints match: ${waypointsMatch}; Walking: ${modeIsWalking}; NoKey: ${noKey}`,
      'm9_strict_stop_order.png'
    );

    // =========================================================================
    // CASE 7: Repeated Stop Replacement & Persistent Locking (Matrix M6)
    // =========================================================================
    console.log('\n=== Case 7: Repeated Stop Replacement & Persistent Locking ===');
    const stopNamesInit = await cdp.eval(`Array.from(document.querySelectorAll('[data-testid^="timeline-stop-card-"] h3')).map(h => h.innerText.trim())`);
    console.log('Initial timeline stops:', stopNamesInit);

    const has3NonEmptyInit = stopNamesInit.length >= 3 && stopNamesInit.every(Boolean);

    // Replace Stop #0 (1st time)
    await cdp.click('[data-testid="stop-replace-btn-0"]');
    await pause(1000);
    await cdp.clickByText('button', 'Thay quán này');
    await pause(2000);
    await cdp.clickByText('button', 'Hoàn tất & xem lịch trình');
    await pause(1000);

    const stopNamesAfter1 = await cdp.eval(`Array.from(document.querySelectorAll('[data-testid^="timeline-stop-card-"] h3')).map(h => h.innerText.trim())`);
    console.log('Stops after 1st replace:', stopNamesAfter1);

    // Replace Stop #0 (2nd time)
    await cdp.click('[data-testid="stop-replace-btn-0"]');
    await pause(1000);
    await cdp.clickByText('button', 'Thay quán này');
    await pause(2000);
    await cdp.clickByText('button', 'Hoàn tất & xem lịch trình');
    await pause(1000);

    const stopNamesAfter2 = await cdp.eval(`Array.from(document.querySelectorAll('[data-testid^="timeline-stop-card-"] h3')).map(h => h.innerText.trim())`);
    console.log('Stops after 2nd replace:', stopNamesAfter2);
    await cdp.screenshot('m6_repeated_replace_verified.png');

    // Strict assertions:
    // 1. stop 0 changed in step 1
    const stop0Changed1 = stopNamesAfter1[0] !== stopNamesInit[0];
    // 2. stop 0 changed in step 2 (different candidate picked)
    const stop0Changed2 = stopNamesAfter2[0] !== stopNamesAfter1[0];
    // 3. stop 1 remained unchanged across both replacements
    const stop1Locked = (stopNamesAfter1[1] === stopNamesInit[1]) && (stopNamesAfter2[1] === stopNamesInit[1]);
    // 4. stop 2 remained unchanged across both replacements
    const stop2Locked = (stopNamesAfter1[2] === stopNamesInit[2]) && (stopNamesAfter2[2] === stopNamesInit[2]);

    const repeatedReplaceOk = has3NonEmptyInit && stop0Changed1 && stop0Changed2 && stop1Locked && stop2Locked;
    record(
      'CASE-7',
      'Repeated Stop Replacement and Persistent Lock Integrity',
      repeatedReplaceOk ? 'PASS' : 'FAIL',
      `3 present stops: ${has3NonEmptyInit}; Stop0 changed 1st: ${stop0Changed1}; Stop0 changed 2nd: ${stop0Changed2}; Stop1 locked: ${stop1Locked}; Stop2 locked: ${stop2Locked}`,
      'm6_repeated_replace_verified.png'
    );

    // =========================================================================
    // CASE 8: Real Keyboard-Only Focus Traversal (Matrix M10)
    // =========================================================================
    console.log('\n=== Case 8: Real Keyboard-Only Focus Traversal Test ===');
    await cdp.resetFreshSession('http://127.0.0.1:3050/');

    // Focus composer input
    await cdp.eval(`document.querySelector('[data-testid="guided-input"]')?.focus()`);
    const initialFocused = await cdp.eval(`document.activeElement?.getAttribute('data-testid')`);

    // Type via keyboard events
    for (const char of 'Phở') {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: char });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp' });
    }
    await pause(200);

    // Tab to Send button
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab' });
    await pause(200);

    const activeAfterTab = await cdp.eval(`({
      tag: document.activeElement?.tagName,
      testid: document.activeElement?.getAttribute('data-testid'),
      hasOutline: window.getComputedStyle(document.activeElement).outlineStyle !== 'none' || window.getComputedStyle(document.activeElement).boxShadow !== 'none'
    })`);
    console.log('Keyboard focus destination:', activeAfterTab);
    await cdp.screenshot('m10_keyboard_traversal.png');

    const focusReachable = activeAfterTab.tag === 'BUTTON' && activeAfterTab.testid === 'guided-send-btn';
    record(
      'CASE-8',
      'Keyboard Focus Traversal to Interactive Controls',
      focusReachable ? 'PASS' : 'FAIL',
      `Initial focus: ${initialFocused}; Tab focused target: ${activeAfterTab.tag} [data-testid="${activeAfterTab.testid}"]`,
      'm10_keyboard_traversal.png'
    );

    // =========================================================================
    // CASE 9: GPS / Location Capability Audit (Matrix M3)
    // =========================================================================
    console.log('\n=== Case 9: Location & GPS Capability Audit ===');
    const hasGpsInvoke = await cdp.eval(`!!document.querySelector('button[aria-label*="vị trí"], button[title*="vị trí"], [data-testid="gps-btn"]')`);
    record(
      'CASE-9',
      'Browser Geolocation / GPS Capability Status',
      'NOT TESTED',
      `Application UI does not implement an HTML5 Geolocation invocation button (hasGpsInvoke: ${hasGpsInvoke}). Manual location chips and text addresses are the supported input mode.`,
      null
    );

    // =========================================================================
    // CASE 10: Private Preview 3051 Full E2E Flow (Sanitized Booleans Only)
    // =========================================================================
    console.log('\n=== Case 10: Private Preview 3051 Full E2E Verification ===');
    await cdp.resetFreshSession('http://127.0.0.1:3051/');
    await cdp.typeAndSend(promptS0);
    await pause(1500);

    const pHasUnderstood = await cdp.eval(`!!document.querySelector('[data-testid="understood-card"]')`);
    const pRowCount = await cdp.eval(`document.querySelectorAll('[data-testid^="understood-row-"], .understood-item').length`);

    if (await cdp.eval(`!!document.querySelector('[data-testid="clarify-option-scope:group"]')`)) {
      await cdp.click('[data-testid="clarify-option-scope:group"]');
      await pause(1000);
    }
    if (await cdp.eval(`!!document.querySelector('[data-testid="clarify-option-time:19:00"]')`)) {
      await cdp.click('[data-testid="clarify-option-time:19:00"]');
      await pause(1000);
    }
    const pHasConfirm = await cdp.eval(`!!document.querySelector('[data-testid="confirm-yes-btn"]')`);
    if (pHasConfirm) {
      await cdp.click('[data-testid="confirm-yes-btn"]');
      await pause(2000);
    }
    const pHasTimeline = await cdp.eval(`!!document.querySelector('[data-testid="guided-timeline"]')`);
    const pStopCount = await cdp.eval(`document.querySelectorAll('[data-testid^="timeline-stop-card-"]').length`);
    const pHasHonestRefusal = await cdp.eval(`document.body.innerText.includes('Không thể xếp đủ') || document.body.innerText.includes('ràng buộc') || document.body.innerText.includes('Chỉ tìm được')`);

    console.log('Private 3051 E2E Outcomes (Booleans):', {
      pHasUnderstood,
      pRowCount,
      pHasConfirm,
      pHasTimeline,
      pStopCount,
      pHasHonestRefusal
    });

    const privateOutcomePass = (pHasTimeline && pStopCount >= 2) || pHasHonestRefusal;
    record(
      'CASE-10',
      'Private Preview 3051 Full E2E Flow (Aggregate Booleans)',
      privateOutcomePass ? 'PASS' : 'FAIL',
      `UnderstoodCard: ${pHasUnderstood} (${pRowCount} rows); Confirm: ${pHasConfirm}; Honest Tour/No-Solution Gate: ${privateOutcomePass} (Timeline: ${pHasTimeline}, HonestRefusal: ${pHasHonestRefusal}). Zero private venue rows/coordinates exposed.`,
      null
    );

    // Write Rigorous Subcase JSON
    const subcaseReport = {
      timestamp: new Date().toISOString(),
      preview_synthetic_url: 'http://127.0.0.1:3050',
      preview_private_url: 'http://127.0.0.1:3051',
      subcases: results,
      bugs
    };
    fs.writeFileSync(path.join(REPORT_DIR, 'rigorous_subcases.json'), JSON.stringify(subcaseReport, null, 2));
    console.log('\n=== All Deep Subcases Completed Successfully ===');

  } finally {
    await cdp.close();
  }
}

run().catch(err => {
  console.error('Fatal Error in Rigorous Runner:', err);
  process.exit(1);
});
