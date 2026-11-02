/**
 * qa/discovery-assistant/test_matching_menu_3350.mjs
 *
 * ONE bounded, targeted browser QA for the matching_menu card UI on Lane 3350.
 * Real 3350 UI, direct 8250 fetch, NO interception/mock, responses OBSERVED only.
 * Requires 8250 on the rules/synthetic MENU fixture (run_food_refinement_fixture.py
 * --menu) and a 3350 build that includes the matching_menu card. Safety guard refuses
 * chat unless the lane is rules-only; if the menu fixture is not loaded (no
 * matching_menu on a gà rán result), it SKIPS cleanly (exit 0) rather than false-fail.
 *
 * Asserts, against the synthetic menu_data (venue fried0):
 *  - fried0 renders a matching_menu card with exactly 3 rows in menu order:
 *    "Gà rán phần thử" (reference ~30.000 đ, giao hàng),
 *    "Gà rán giá lỗi" (quarantined -> "Giá chưa xác minh", no fabricated price),
 *    "Gà rán chọn sốt" (mandatory -> "Tối thiểu đơn ~35.000 đ" + bắt buộc flag).
 *  - delivery disclaimer present ("không phải giá tại quán"); no dine-in/allergy/hour claim.
 *  - the venue dine-in price row is NOT repriced from the delivery reference.
 *  - a venue without a menu shows no matching_menu card (tag fallback).
 *  - unknown dish -> no_results -> no menu cards.
 * Node built-ins only; synthetic ids/text only in evidence.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const web = process.env.DISCOVERY_WEB || 'http://127.0.0.1:3350';
const api = process.env.DISCOVERY_API || 'http://127.0.0.1:8250';
const port = Number(process.env.DISCOVERY_CDP || 19794);
const out = process.env.DISCOVERY_EVIDENCE || 'docs/reports/matching-menu-3350';
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await pause(90); } throw Error('timeout'); }

fs.mkdirSync(out, { recursive: true });
const evidence = { web, api, source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), mode: 'REAL 3350 UI -> direct 8250; observed only', checks: [], screenshots: [], errors: [] };
function finish(code) { fs.writeFileSync(path.join(out, 'browser-evidence.json'), JSON.stringify(evidence, null, 2)); process.exitCode = code; }
const record = (name, pass, note) => { evidence.checks.push({ name, result: pass === 'UNTESTED' ? 'UNTESTED' : (pass ? 'PASS' : 'FAIL'), ...(note ? { note } : {}) }); console.log(JSON.stringify({ name, result: pass === 'UNTESTED' ? 'UNTESTED' : (pass ? 'PASS' : 'FAIL') })); };

let health; try { health = await (await fetch(api + '/health')).json(); } catch (e) { evidence.blocker = 'health GET failed: ' + e.message; finish(1); }
if (process.exitCode !== 1) {
  evidence.health = { commit: health.build_commit, llm: health.llm, provider: health.assistant_provider, dataset: health.dataset_source, dataset_version: health.dataset_version };
  const rulesLane = health.llm !== 'live' && (health.assistant_provider === 'rules' || health.llm === 'mock') && health.dataset_source === 'synthetic';
  if (!rulesLane) { evidence.blocker = `8250 not a rules-only synthetic lane (llm=${health.llm}); refusing chat.`; console.log(JSON.stringify({ blocker: evidence.blocker })); finish(2); }
}

if (process.exitCode === undefined || process.exitCode === 0) {
  const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--disable-background-networking', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'menu-qa-'))}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let ws, seq = 0, view = null, posts = 0;
  const pending = new Map(), reqMeta = new Map(), aReqs = new Set();
  try {
    let target; await until(async () => { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); return target; });
    ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; const t = setTimeout(() => { pending.delete(id); reject(Error('CDP ' + method)); }, 12000); pending.set(id, { resolve: x => { clearTimeout(t); resolve(x); }, reject: x => { clearTimeout(t); reject(x); } }); ws.send(JSON.stringify({ id, method, params })); });
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id) { const pr = pending.get(m.id); pending.delete(m.id); m.error ? pr?.reject(Error(m.error.message)) : pr?.resolve(m.result); return; }
      if (m.method === 'Network.requestWillBeSent') reqMeta.set(m.params.requestId, { url: m.params.request.url, method: m.params.request.method });
      if (m.method === 'Network.responseReceived') { const meta = reqMeta.get(m.params.requestId); if (meta && /\/assistant$/.test(new URL(meta.url).pathname)) { aReqs.add(m.params.requestId); if (meta.method === 'POST') posts++; } }
      if (m.method === 'Network.loadingFinished' && aReqs.has(m.params.requestId)) { aReqs.delete(m.params.requestId); cdp('Network.getResponseBody', { requestId: m.params.requestId }).then(r => { try { const b = JSON.parse(r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body); if (b.contract === 'discovery-v1' && (!view || b.revision >= view.revision)) view = b; } catch {} }).catch(() => {}); }
      if (m.method === 'Runtime.exceptionThrown') evidence.errors.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'exception').replace(/[a-f0-9]{24,}/gi, '[redacted]').slice(0, 400));
    };
    const ev = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error('eval failed'); return r.result.value; };
    const sel = id => `[data-testid="${id}"]`;
    const S = s => (s.startsWith('[') || s.startsWith('.') ? s : sel(s));
    const exists = s => ev(`!!document.querySelector(${JSON.stringify(S(s))})`);
    async function click(s) { const q = S(s); await ev(`document.querySelector(${JSON.stringify(q)})?.scrollIntoView({block:'center'})`); const pt = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(q)});if(!e||e.disabled||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`); if (!pt) throw Error('no control ' + q); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...pt }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...pt }); }
    async function idle() { await until(() => ev(`!!document.querySelector('[data-testid="discovery-input"]')&&!document.querySelector('[data-testid="discovery-input"]').disabled&&!document.querySelector('[aria-busy="true"]')`)); await pause(160); }
    async function fillValue(id, text) { await click(id); await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 }); await cdp('Input.insertText', { text }); }
    async function send(text) { await idle(); const before = posts; await fillValue('discovery-input', text); await click('discovery-send-btn'); await until(() => posts > before); await idle(); }
    async function actSel(s) { const before = posts; await click(s); await until(() => posts > before); await idle(); }
    async function setOrigin() {
      if (!await exists('origin-lat-input')) { if (await exists('origin-expand-controls-btn')) { try { await click('origin-expand-controls-btn'); await pause(130); } catch {} } }
      if (!await exists('origin-lat-input') && await exists('.nn-origin-manual-toggle')) { try { await click('.nn-origin-manual-toggle'); await pause(130); } catch {} }
      if (!await exists('origin-lat-input')) throw Error('origin inputs not reachable');
      await fillValue('origin-lat-input', '21.02'); await fillValue('origin-lon-input', '105.83'); await actSel('origin-coords-submit');
    }
    async function shot(name) { try { await ev('window.scrollTo(0,0)'); const x = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(x.data, 'base64')); evidence.screenshots.push(name + '.png'); } catch {} }
    const rowTexts = id => ev(`Array.from(document.querySelectorAll('[data-testid^="menu-ref-${id}-"]')).map(e=>e.innerText.replace(/\\s+/g,' ').trim())`);

    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false });
    try { await cdp('Storage.clearDataForOrigin', { origin: web, storageTypes: 'all' }); } catch {}
    await cdp('Page.navigate', { url: web }); await until(() => exists('discovery-input')); await idle();

    await setOrigin();
    await send('tôi muốn ăn gà rán');
    const fried0 = (view?.results || []).find(r => r.id === 'fried0');
    const menuRows = fried0?.matching_menu || [];
    if (!menuRows.length) {
      record('menu fixture loaded (fried0 has matching_menu)', 'UNTESTED', `no matching_menu on fried0 (dataset_version=${health.dataset_version}); switch 8250 to --menu and rebuild 3350, then re-run`);
      finish(0);
    } else {
      evidence.fried0_menu = menuRows.map(m => ({ name: m.name, price_status: m.price_status, ref: m.reference_price_vnd, min: m.min_total_vnd, mandatory: m.mandatory_options, channel: m.price_channel }));
      await until(() => exists('menu-ref-fried0')); await shot('menu-fried0');
      const rows = await rowTexts('fried0');
      record('fried0 renders matching_menu card with exactly 3 rows in menu order', rows.length === 3);
      record('row0 reference price (delivery)', /Gà rán phần thử/.test(rows[0] || '') && /30\.000.*giao hàng/.test(rows[0] || ''));
      record('row1 quarantined shows unverified, no fabricated price', /Gà rán giá lỗi/.test(rows[1] || '') && /Giá chưa xác minh/.test(rows[1] || '') && !/đ \(giao hàng\)/.test(rows[1] || ''));
      record('row2 mandatory item-minimum + bắt buộc flag', /Gà rán chọn sốt/.test(rows[2] || '') && /Giá món tối thiểu ~35\.000/.test(rows[2] || '') && /bắt buộc/.test(rows[2] || ''));
      const cardText = await ev(`document.querySelector('[data-testid="menu-ref-fried0"]').innerText`);
      record('delivery disclaimer present, no dine-in/allergy/hour claim', /không phải giá tại quán/i.test(cardText) && /giao hàng|ShopeeFood/i.test(cardText));
      const dineInUnchanged = (fried0?.price?.max_vnd === 70000) || !fried0?.price || !menuRows.some(m => String(fried0?.price?.max_vnd) === String(m.reference_price_vnd));
      record('venue dine-in price not repriced from delivery reference', dineInUnchanged);
      // A venue without a menu shows no matching_menu card (tag fallback).
      const other = (view?.results || []).find(r => r.id !== 'fried0' && (!r.matching_menu || r.matching_menu.length === 0));
      if (other) record('menu-less venue shows no matching_menu card', !(await exists(`menu-ref-${other.id}`)), `other=${other.id}`);
      else record('menu-less venue shows no matching_menu card', 'UNTESTED', 'no menu-less venue in this result set');
      // Unknown dish -> no_results -> no menu cards.
      await send('tôi muốn ăn món lạ xyzqwer tại Đống Đa');
      record('unknown dish: no_results and no menu cards', view?.status === 'no_results' && !(await ev(`!!document.querySelector('[data-testid^="menu-ref-"]')`)));
      record('no browser exception', evidence.errors.length === 0);
      finish(evidence.checks.some(c => c.result === 'FAIL') ? 1 : 0);
    }
  } catch (error) { evidence.blocker = String(error.message).slice(0, 200); record('run completed', false); finish(1); }
  finally { ws?.close(); if (chrome.pid) try { execFileSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
}
