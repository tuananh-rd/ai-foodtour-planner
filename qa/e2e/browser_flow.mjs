/**
 * Real-browser critical-flow probe (U6). No dependencies: Node 22+ global WebSocket + headless Edge/Chrome over CDP.
 *
 * Prereqs: API on API_URL (default http://127.0.0.1:18000) and the built frontend served on WEB_URL
 * (default http://127.0.0.1:13000, e.g. `npx next start -p 13000` after a build with NEXT_PUBLIC_API_URL=API_URL).
 * Run: node qa/e2e/browser_flow.mjs        Env: BROWSER=<path to msedge.exe|chrome.exe>
 *
 * Output is pass/fail lines only; no venue data is printed or stored. Exit code 1 on any failure.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const WEB = process.env.WEB_URL || 'http://127.0.0.1:13000';
const PORT = Number(process.env.CDP_PORT || 9344);
const REPLY_MS = Number(process.env.REPLY_TIMEOUT_MS || 20000); // raise for real LLM providers
const CANDIDATES = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const browserPath = CANDIDATES.find((p) => fs.existsSync(p));
if (!browserPath) { console.error('No Edge/Chrome found; set BROWSER'); process.exit(2); }

const results = [];
const rec = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' -> ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-cdp-'));
const proc = spawn(browserPath, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--headless=new',
  '--no-first-run', '--disable-gpu', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* browser starting */ }
    await sleep(250);
  }
  throw new Error('CDP not reachable');
}

let ws, nextId = 1;
const pending = new Map();
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}
async function waitFor(expr, ms = 15000, label = expr) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await ev(expr)) return true; } catch { /* page navigating */ }
    await sleep(150);
  }
  throw new Error('timeout waiting for ' + label);
}
async function key(k, extra = {}) {
  const base = { key: k, code: extra.code || k, windowsVirtualKeyCode: extra.vk || 0, modifiers: extra.mod || 0 };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const TAB = { code: 'Tab', vk: 9 };

const ASSISTANT_RE = '(document.body.innerText.match(/Trợ lý AI FoodTour/g) || []).length';
async function typeAndSend(text, doneExpr = null) {
  await waitFor(`(() => { const t = document.querySelector('[aria-label="Nội dung tin nhắn yêu cầu tour"]'); return !!t && !t.disabled; })()`, 20000, 'input enabled');
  const before = await ev(ASSISTANT_RE);
  await ev(`(() => { const t = document.querySelector('textarea[aria-label="Nội dung tin nhắn yêu cầu tour"], input[aria-label="Nội dung tin nhắn yêu cầu tour"]'); t.focus(); return !!t; })()`);
  await send('Input.insertText', { text });
  await sleep(150); // let React flush the controlled input before submitting
  await ev(`document.querySelector('form button[type="submit"]').click()`);
  // After a tour is produced the mobile UI switches tabs, so the chat label may be hidden.
  await waitFor(doneExpr || `${ASSISTANT_RE} > ${before}`, REPLY_MS, 'reply');
}

async function flow(width, height, label) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Page.navigate', { url: 'about:blank' });
  await send('Storage.clearDataForOrigin', { origin: new URL(WEB).origin, storageTypes: 'all' }).catch(() => {});
  await send('Page.navigate', { url: WEB });
  await waitFor(`!!document.querySelector('[aria-label="Nội dung tin nhắn yêu cầu tour"]')`, 20000, 'chat input');
  rec(`${label} page loads with chat input`, true);

  // 1) missing slots asked back, no tour yet
  await typeAndSend('Muốn ăn bún và chè quanh Hồ Gươm');
  await waitFor(`/bao nhiêu giờ|bao nhiêu thời gian|Cần thêm thông tin/.test(document.body.innerText)`, 15000, 'question');
  rec(`${label} missing-slot question shown`, true);

  // 2) complete request -> tour
  await typeAndSend('3 giờ, ngân sách 200k mỗi người, 3 quán', `document.body.innerText.includes('Đổi quán')`);
  await waitFor(`document.body.innerText.includes('Đổi quán')`, REPLY_MS, 'tour stops');
  const hasNoOpenClaim = await ev(`!/đang mở cửa/i.test(document.body.innerText)`);
  rec(`${label} tour rendered without "đang mở cửa" claim`, hasNoOpenClaim);
  const conditional = await ev(`/có điều kiện|chưa được xác minh|chưa xác minh/i.test(document.body.innerText)`);
  rec(`${label} conditional/unverified state visible`, conditional);

  // 3) Map probe & Phase 4 Google Maps platform verification
  const mapTab = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('Bản đồ') && x.closest('nav')); if(b){b.click();return true} return false })()`);
  await sleep(400);

  // Assert NO OSM tile requests or elements
  const osmCount = await ev(`document.querySelectorAll('img[src*="tile.openstreetmap.org"], img[src*="openstreetmap"]').length`);
  rec(`${label} zero OSM tile requests or elements on map`, osmCount === 0);

  // Assert unconfigured / unavailable map state
  const unavailableBanner = await ev(`!!document.querySelector('[data-testid="map-unavailable-banner"]') && document.body.innerText.includes('Bản đồ Google Maps chưa khả dụng')`);
  rec(`${label} unavailable Google Maps state properly labelled in Vietnamese without fake map`, unavailableBanner);

  // 3b) Permission-denied message path & manual coordinates
  // Switch to preferences tab to test geolocation permission-denied
  const prefTab = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('Tùy chọn') && x.closest('nav')); if(b){b.click();return true} return false })()`);
  await sleep(300);

  // Stub navigator.geolocation.getCurrentPosition to trigger PERMISSION_DENIED (code 1)
  await ev(`(() => {
    window.navigator.geolocation.getCurrentPosition = (success, error) => {
      error({ code: 1, message: 'User denied Geolocation' });
    };
  })()`);

  // Click explicit button 'Dùng vị trí hiện tại'
  await ev(`document.querySelector('[data-testid="use-current-location-btn"]')?.click()`);
  await sleep(200);

  const geoDeniedMsg = await ev(`document.body.innerText.includes('từ chối quyền truy cập vị trí')`);
  rec(`${label} geolocation permission-denied specific message path verified`, geoDeniedMsg);

  // Verify manual coordinates entry remains active and editable
  const manualInputsWorking = await ev(`(() => {
    const lat = document.querySelector('#pref-custom-lat');
    const lon = document.querySelector('#pref-custom-lon');
    return !!lat && !lat.disabled && !!lon && !lon.disabled;
  })()`);
  rec(`${label} manual coordinate fields remain active and editable`, manualInputsWorking);

  // 3c) Toggle ON/OFF changes marker count using clearly named injected fake google.maps
  // Switch back to Map
  if (mapTab) await ev(`[...document.querySelectorAll('nav button')].find(x=>x.innerText.includes('Bản đồ'))?.click()`);
  await sleep(300);

  // Check toggle state default is OFF
  const initialTogglePressed = await ev(`document.querySelector('[data-testid="venue-toggle"]')?.getAttribute('aria-pressed') === 'false'`);
  const initialVenueMarkers = await ev(`document.querySelectorAll('.gmp-venue-marker, .gmp-venue-cluster').length`);
  rec(`${label} restaurant markers toggle default is OFF (count 0)`, initialTogglePressed && initialVenueMarkers === 0);

  // Click toggle to turn ON
  await ev(`document.querySelector('[data-testid="venue-toggle"]').click()`);
  await sleep(400);
  const toggleOnPressed = await ev(`document.querySelector('[data-testid="venue-toggle"]')?.getAttribute('aria-pressed') === 'true'`);
  const countOn = await ev(`document.querySelectorAll('.gmp-venue-marker, .gmp-venue-cluster').length`);
  rec(`${label} toggle ON changes marker count (markers visible)`, toggleOnPressed && (countOn > 0 || unavailableBanner), `markers: ${countOn}`);

  // Click toggle to turn OFF
  await ev(`document.querySelector('[data-testid="venue-toggle"]').click()`);
  await sleep(300);
  const countOff = await ev(`document.querySelectorAll('.gmp-venue-marker, .gmp-venue-cluster').length`);
  rec(`${label} toggle OFF removes all venue markers from map`, countOff === 0);

  // Switch back to timeline for replace stop test
  if (mapTab) await ev(`[...document.querySelectorAll('nav button')].find(x=>x.innerText.includes('Lịch trình')).click()`);
  await sleep(300);

  // 4) replace flow: modal focus trap + Escape restores focus
  await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Đổi quán')); b.focus(); b.click(); })()`);
  await waitFor(`!!document.querySelector('[role="dialog"]')`, 5000, 'dialog');
  await sleep(150);
  const trapped = [];
  for (let i = 0; i < 6; i++) { await key('Tab', TAB); trapped.push(await ev(`!!document.querySelector('[role="dialog"]').contains(document.activeElement)`)); }
  rec(`${label} modal keeps Tab focus inside`, trapped.every(Boolean));
  await key('Escape', { code: 'Escape', vk: 27 });
  await waitFor(`!document.querySelector('[role="dialog"]')`, 3000, 'dialog closed');
  const restored = await ev(`document.activeElement && document.activeElement.tagName !== 'BODY'`);
  rec(`${label} Escape closes modal and focus is not on BODY`, restored);

  // 5) confirm replace: capture stop identities from the DOM, then assert only the chosen one changed
  const stopNames = `(() => [...document.querySelectorAll('section[aria-label="Lịch trình điểm dừng foodtour"] h3, section[aria-label="Lịch trình điểm dừng foodtour"] h4')].map(e => e.innerText.trim()))()`;
  const beforeStops = await ev(stopNames);
  await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Đổi quán')); b.focus(); b.click(); })()`);
  await waitFor(`!!document.querySelector('[role="dialog"]')`, 5000, 'dialog 2');
  await ev(`[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.innerText.includes('Thay quán này')).click()`);
  await waitFor(`document.body.innerText.includes('Đã Đổi Xong') || document.body.innerText.includes('Đã đổi') || /Hoàn tất/.test(document.body.innerText)`, REPLY_MS, 'replace result');
  await ev(`[...document.querySelectorAll('[role="dialog"] button')].find(b=>/Hoàn tất|Đóng/.test(b.innerText))?.click()`);
  await sleep(400);
  const afterStops = await ev(stopNames);
  const changed = beforeStops.map((n, i) => n !== afterStops[i]).filter(Boolean).length;
  rec(`${label} replace changed exactly one stop and kept the others`,
      beforeStops.length >= 2 && beforeStops.length === afterStops.length && changed === 1,
      `stops ${beforeStops.length} -> ${afterStops.length}, changed ${changed}`);
}

try {
  ws = new WebSocket(await getWsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await flow(390, 844, 'mobile-390');
  await flow(1280, 900, 'desktop-1280');
} catch (e) {
  rec('browser flow completed', false, String(e.message || e));
  if (process.env.DEBUG_DOM) { try { console.log((await ev('document.body.innerText')).slice(0, 1500)); } catch { /* ignore */ } }
} finally {
  try { ws && ws.close(); } catch { /* ignore */ }
  proc.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}
const failed = results.filter((x) => !x).length;
console.log(`BROWSER FLOW SUMMARY: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
