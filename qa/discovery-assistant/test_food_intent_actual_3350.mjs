/**
 * qa/discovery-assistant/test_food_intent_actual_3350.mjs
 *
 * Independent USER QA for broader food intent on Lane 3350, against the ACTUAL
 * rules/synthetic food-matrix lane on 8250 (tools/run_food_refinement_fixture.py).
 * The browser types into the REAL 3350 UI and the UI fetches 8250 DIRECTLY.
 * NO CDP Fetch interception / NO mock API. Responses are only OBSERVED (read-only
 * via Network.getResponseBody) to assert on the actual view, never rewritten.
 *
 * SAFETY: refuses to submit chat unless 8250 is a rules-only synthetic lane
 * (llm != 'live', provider 'rules', dataset_source 'synthetic') so the live Gemini
 * reserve can never be consumed.
 *
 * EXACT-ID GREEN acceptance (derived from the live food-matrix fixture):
 *   phở gà -> chicken0..2 | phở bò -> beef0..2 | phở cuốn -> roll0..2 |
 *   gà rán -> fried0..2+fried_hbt | bún chả -> bun0..2 | cơm -> rice0..2 |
 *   unknown dish -> no_results. Each dish returns ONLY its own ids (no cross match),
 *   with and without accents, and only after an origin is set (before -> prompt).
 * Plus: area change, reload/session restore, compare (2), select 3, profile context
 *   "Bắt đầu lúc 18h, tổng 180 phút, đi bộ, 2 người", explicit confirmation, tour (3
 *   stops), ordered Google Maps links. A supporting direct-API tour proof is recorded.
 *
 * The pre-fix RED (rejected intent) is preserved separately in red-prefix-evidence.json.
 * Node built-ins only; sanitized evidence + screenshots. Synthetic ids/text only.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const web = process.env.DISCOVERY_WEB || 'http://127.0.0.1:3350';
const api = process.env.DISCOVERY_API || 'http://127.0.0.1:8250';
const port = Number(process.env.DISCOVERY_CDP || 19793);
const out = process.env.DISCOVERY_EVIDENCE || 'docs/reports/food-intent-actual-3350';
const supplement = process.env.QA_SUPPLEMENT === '1';
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await pause(90); } throw Error('timeout'); }
const setEq = (a, b) => { const x = [...new Set(a)].sort(), y = [...new Set(b)].sort(); return x.length === y.length && x.every((v, i) => v === y[i]); };

const EXPECT = {
  'phở gà': ['chicken0', 'chicken1', 'chicken2'],
  'phở bò': ['beef0', 'beef1', 'beef2'],
  'phở cuốn': ['roll0', 'roll1', 'roll2'],
  'gà rán': ['fried0', 'fried1', 'fried2', 'fried_hbt'],
  'bún chả': ['bun0', 'bun1', 'bun2'],
  'cơm': ['rice0', 'rice1', 'rice2'],
  'unknown': []
};
const MATRIX = [
  { dish: 'phở gà', variants: ['tôi muốn ăn phở gà', 'toi muon an pho ga'] },
  { dish: 'phở bò', variants: ['tôi muốn ăn phở bò', 'toi muon an pho bo'] },
  { dish: 'phở cuốn', variants: ['tôi muốn ăn phở cuốn', 'toi muon an pho cuon'] },
  { dish: 'gà rán', variants: ['tôi muốn ăn gà rán', 'toi muon an ga ran'] },
  { dish: 'bún chả', variants: ['tôi muốn ăn bún chả', 'toi muon an bun cha'] },
  { dish: 'cơm', variants: ['tôi muốn ăn cơm', 'toi muon an com'] },
  { dish: 'unknown', variants: ['tôi muốn ăn món lạ xyzqwer', 'toi muon an mon la xyzqwer'] }
];
// Đống Đa-constrained expectations (area text filters gà rán to its Đống Đa venues only).
const EXPECT_DD = { ...EXPECT, 'gà rán': ['fried0', 'fried1', 'fried2'] };
// origin-AFTER cells: dish typed BEFORE origin (asserts prompt), then LOCAL Đống Đa origin resumes.
// Both accented and ascii, with explicit " tại Đống Đa" / " tai dong da" so area is Đống Đa.
const MATRIX_AFTER = [
  { dish: 'phở gà', variants: ['tôi muốn ăn phở gà tại Đống Đa', 'toi muon an pho ga tai dong da'] },
  { dish: 'phở bò', variants: ['tôi muốn ăn phở bò tại Đống Đa', 'toi muon an pho bo tai dong da'] },
  { dish: 'phở cuốn', variants: ['tôi muốn ăn phở cuốn tại Đống Đa', 'toi muon an pho cuon tai dong da'] },
  { dish: 'gà rán', variants: ['tôi muốn ăn gà rán tại Đống Đa', 'toi muon an ga ran tai dong da'] },
  { dish: 'bún chả', variants: ['tôi muốn ăn bún chả tại Đống Đa', 'toi muon an bun cha tai dong da'] },
  { dish: 'cơm', variants: ['tôi muốn ăn cơm tại Đống Đa', 'toi muon an com tai dong da'] },
  { dish: 'unknown', variants: ['tôi muốn ăn món lạ xyzqwer tại Đống Đa', 'toi muon an mon la xyzqwer tai dong da'] }
];

fs.mkdirSync(out, { recursive: true });
const evidence = {
  web, api, source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  mode: 'REAL 3350 UI -> direct 8250 fetch; observed only (no interception)',
  executor: supplement ? 'Sol integration supplement after Claude coding usage limit' : 'Claude independent QA',
  checks: [], screenshots: [], errors: [], transient: [], remoteOrigins: [] };
function finish(code) { fs.writeFileSync(path.join(out, 'browser-evidence.json'), JSON.stringify(evidence, null, 2)); process.exitCode = code; }
const record = (name, pass, note) => { evidence.checks.push({ name, result: pass === 'UNTESTED' ? 'UNTESTED' : (pass ? 'PASS' : 'FAIL'), ...(note ? { note } : {}) }); console.log(JSON.stringify({ name, result: pass === 'UNTESTED' ? 'UNTESTED' : (pass ? 'PASS' : 'FAIL') })); };

let health;
try { health = await (await fetch(api + '/health')).json(); } catch (e) { evidence.blocker = 'health GET failed: ' + e.message; finish(1); }
if (process.exitCode !== 1) {
  evidence.health = { commit: health.build_commit, llm: health.llm, provider: health.assistant_provider, dataset: health.dataset_source, dataset_version: health.dataset_version };
  const rulesLane = health.llm !== 'live' && (health.assistant_provider === 'rules' || health.llm === 'mock') && health.dataset_source === 'synthetic';
  if (!rulesLane) { evidence.blocker = `8250 not a rules-only synthetic lane (llm=${health.llm}); refusing chat.`; console.log(JSON.stringify({ blocker: evidence.blocker })); finish(2); }
}

if (process.exitCode === undefined || process.exitCode === 0) {
  const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--disable-background-networking', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'foodintent-qa-'))}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let ws, seq = 0, view = null, posts = 0;
  const pending = new Map(), reqMeta = new Map(), assistantReqs = new Set();
  try {
    let target; await until(async () => { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); return target; });
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; const t = setTimeout(() => { pending.delete(id); reject(Error('CDP ' + method)); }, 12000); pending.set(id, { resolve: x => { clearTimeout(t); resolve(x); }, reject: x => { clearTimeout(t); reject(x); } }); ws.send(JSON.stringify({ id, method, params })); });
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id) { const pr = pending.get(m.id); pending.delete(m.id); m.error ? pr?.reject(Error(m.error.message)) : pr?.resolve(m.result); return; }
      if (m.method === 'Network.requestWillBeSent') { reqMeta.set(m.params.requestId, { url: m.params.request.url, method: m.params.request.method }); try { const u = new URL(m.params.request.url); if (/^https?:$/.test(u.protocol) && ![new URL(web).origin, new URL(api).origin].includes(u.origin) && !evidence.remoteOrigins.includes(u.origin)) evidence.remoteOrigins.push(u.origin); } catch {} }
      if (m.method === 'Network.responseReceived') { const meta = reqMeta.get(m.params.requestId); if (meta && /\/assistant$/.test(new URL(meta.url).pathname)) { assistantReqs.add(m.params.requestId); if (meta.method === 'POST') posts++; } }
      if (m.method === 'Network.loadingFinished' && assistantReqs.has(m.params.requestId)) { assistantReqs.delete(m.params.requestId); cdp('Network.getResponseBody', { requestId: m.params.requestId }).then(r => { try { const b = JSON.parse(r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body); if (b.contract === 'discovery-v1' && (!view || b.revision >= view.revision)) view = b; } catch {} }).catch(() => {}); }
      if (m.method === 'Runtime.exceptionThrown') evidence.errors.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'exception').replace(/[a-f0-9]{24,}/gi, '[redacted]').slice(0, 500));
    };
    const ev = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error('eval failed'); return r.result.value; };
    const sel = id => `[data-testid="${id}"]`;
    const S = s => (s.startsWith('[') || s.startsWith('.') ? s : sel(s));
    const exists = s => ev(`!!document.querySelector(${JSON.stringify(S(s))})`);
    async function click(s) { const q = S(s); await ev(`document.querySelector(${JSON.stringify(q)})?.scrollIntoView({block:'center'})`); const pt = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(q)});if(!e||e.disabled||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`); if (!pt) throw Error('no control ' + q); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...pt }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...pt }); }
    async function clickText(txt) { await ev(`[...document.querySelectorAll('button')].find(e=>e.offsetParent&&e.textContent.includes(${JSON.stringify(txt)}))?.scrollIntoView({block:'center'})`); await pause(80); const r = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&e.textContent.includes(${JSON.stringify(txt)}));if(!b||!b.getClientRects().length)return null;const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`); if (!r) throw Error('no button text ' + txt); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...r }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...r }); }
    async function idle() { await until(() => ev(`!!document.querySelector('[data-testid="discovery-input"]')&&!document.querySelector('[data-testid="discovery-input"]').disabled&&!document.querySelector('[aria-busy="true"]')`)); await pause(160); }
    async function fillValue(id, text) { await click(id); await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 }); await cdp('Input.insertText', { text }); }
    async function send(text) { await idle(); const before = posts; await fillValue('discovery-input', text); await click('discovery-send-btn'); await until(() => posts > before); await idle(); }
    async function actSel(s) { const before = posts; await click(s); await until(() => posts > before); await idle(); }
    async function actText(t) { const before = posts; await clickText(t); await until(() => posts > before); await idle(); }
    const resultIds = () => ev(`Array.from(document.querySelectorAll('[data-testid^="restaurant-card-"]')).map(e=>e.getAttribute('data-testid').replace('restaurant-card-',''))`);
    async function shot(name) { try { await ev('window.scrollTo(0,0)'); const x = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(x.data, 'base64')); evidence.screenshots.push(name + '.png'); } catch (e) { evidence.transient.push('shot ' + name + ': ' + e.message); } }
    async function freshSession() { try { await cdp('Storage.clearDataForOrigin', { origin: web, storageTypes: 'all' }); } catch {} view = null; await cdp('Page.navigate', { url: web }); await until(() => exists('discovery-input')); await idle(); }
    async function setOrigin() {
      if (!await exists('origin-lat-input')) { if (await exists('origin-expand-controls-btn')) { try { await click('origin-expand-controls-btn'); await pause(130); } catch {} } }
      if (!await exists('origin-lat-input') && await exists('.nn-origin-manual-toggle')) { try { await click('.nn-origin-manual-toggle'); await pause(130); } catch {} }
      if (!await exists('origin-lat-input')) throw Error('origin inputs not reachable');
      await fillValue('origin-lat-input', '21.02'); await fillValue('origin-lon-input', '105.83'); await actSel('origin-coords-submit');
    }
    async function setOriginLocal() {
      // Local gazetteer resolve of "đống đa" then choose the first candidate.
      if (!await exists('origin-query-input')) { if (await exists('origin-expand-controls-btn')) { try { await click('origin-expand-controls-btn'); await pause(130); } catch {} } }
      if (!await exists('origin-query-input')) throw Error('origin query input not reachable');
      await fillValue('origin-query-input', 'đống đa'); await actSel('origin-resolve-button');
      await until(() => exists('[data-testid^="origin-candidate-"]'), 8000);
      const cid = await ev(`document.querySelector('[data-testid^="origin-candidate-"]')?.getAttribute('data-testid')`);
      if (!cid) throw Error('no origin candidate'); await actSel(`[data-testid="${cid}"]`);
    }

    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false });

    // ---- A. EXACT-ID matrix: 7 dishes x accents, origin set first ------------
    for (const { dish, variants } of MATRIX) {
      for (const text of variants) {
        if (supplement && !(dish === 'unknown' && text.startsWith('toi '))) continue;
        try {
          await freshSession(); await setOrigin(); await send(text);
          const ids = await resultIds(); const expect = EXPECT[dish];
          const ok = setEq(ids, expect) && (expect.length === 0 ? view?.status === 'no_results' : view?.status === 'ok') && !view?.tour;
          record(`A [${dish}] "${text}" -> exact ids ${JSON.stringify(expect)} (${view?.status})`, ok, ok ? undefined : `got ${JSON.stringify(ids)} status=${view?.status}`);
        } catch (ex) { record(`A [${dish}] "${text}"`, 'UNTESTED', 'transient: ' + String(ex.message).slice(0, 60)); evidence.transient.push(`${dish}/${text}: ${ex.message}`); }
      }
    }

    // ---- B. origin before/after -------------------------------------------
    try {
      for (const {dish,variants} of MATRIX_AFTER) for (const text of variants) {
        await freshSession(); await send(text);
        record(`B [${dish}] ${text}: before origin prompts with zero cards`, (await resultIds()).length === 0 && !!view?.reply?.question);
        await setOriginLocal();
        const fold = s => s.normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/g,'d').toLowerCase();
        const wanted = dish === 'unknown' ? 'la xyzqwer' : fold(dish);
        record(`B [${dish}] ${text}: local origin resumes exact literal search`,
          setEq(await resultIds(),EXPECT_DD[dish]) && view?.location?.status === 'chosen'
          && view?.status === (dish === 'unknown' ? 'no_results' : 'ok')
          && setEq((view?.profile?.foods || []).map(fold),[wanted]));
      }
    } catch (ex) { record('B origin before/after', 'UNTESTED', 'transient: ' + String(ex.message).slice(0, 60)); evidence.transient.push('B: ' + ex.message); }

    // ---- C. food change clears stale; area change filters ------------------
    try {
      await freshSession(); await setOrigin();
      await send('tôi muốn ăn phở bò'); const beef = await resultIds();
      await actSel('[data-testid="restaurant-card-beef0"] .nn-action-chip-btn');
      await send('tôi muốn ăn gà rán'); const fried = await resultIds();
      record('C food change clears old dish, swaps to exact new ids', !fried.some(id => beef.includes(id)) && setEq(fried, EXPECT['gà rán']));
      await send('đổi khu vực sang Hai Bà Trưng'); const area = await resultIds();
      record('C second area changes exact results while preserving selection',setEq(area,['fried_hbt'])
        && view?.profile?.area === 'Hai Bà Trưng' && (view?.selection || []).some(s=>s.id==='beef0'));
      await shot('supplement-second-area');
    } catch (ex) { record('C food/area change', 'UNTESTED', 'transient: ' + String(ex.message).slice(0, 60)); evidence.transient.push('C: ' + ex.message); }

    // ---- D. compare two venues --------------------------------------------
    if (!supplement) try {
      await freshSession(); await setOrigin(); await send('tôi muốn ăn phở bò');
      await click('btn-compare-venue-beef0'); await pause(250); await click('btn-compare-venue-beef1'); await pause(250);
      evidence.compareStages = [];
      evidence.compareStages.push('toggled');
      await until(() => ev(`[...document.querySelectorAll('button')].some(e=>e.offsetParent&&e.textContent.includes('Bắt đầu so sánh'))`), 8000);
      evidence.compareStages.push('trigger-present');
      const before = posts;
      await clickText('Bắt đầu so sánh');
      evidence.compareStages.push('clicked-execute');
      await until(() => posts > before, 12000);
      evidence.compareStages.push('post-observed');
      await until(() => exists('discovery-comparison-view'), 8000); await idle();
      evidence.compareStages.push('comparison-rendered');
      const cmp = view?.comparison;
      record('D compare 2 venues -> comparison view of exactly those 2', await exists('discovery-comparison-view') && Array.isArray(cmp?.venues) && cmp.venues.length === 2 && setEq(cmp.venues.map(v => v.id), ['beef0', 'beef1']));
    } catch (ex) { record('D compare two venues', 'UNTESTED', 'transient: ' + String(ex.message).slice(0, 60)); evidence.transient.push('D: ' + ex.message); }

    // ---- E. reload / session restore --------------------------------------
    if (!supplement) try {
      await freshSession(); await setOrigin(); await send('tôi muốn ăn phở bò');
      await actSel(`[data-testid="restaurant-card-beef0"] .nn-action-chip-btn`);
      const selBefore = (view?.selection || []).map(s => s.id);
      await cdp('Page.reload', {}); await until(() => exists('discovery-input')); await idle(); await until(() => view && view.location);
      record('E reload restores origin + selection (no message replay)', view?.location?.status === 'chosen' && setEq((view?.selection || []).map(s => s.id), selBefore) && selBefore.includes('beef0'));
      await shot('green-reload-restore');
    } catch (ex) { record('E reload/session restore', 'UNTESTED', 'transient: ' + String(ex.message).slice(0, 60)); evidence.transient.push('E: ' + ex.message); }

    // ---- F. FULL JOURNEY: 3 selected + profile context + confirm + tour + Maps
    try {
      await freshSession(); await setOrigin(); await send('tôi muốn ăn phở bò');
      for (const id of ['beef0', 'beef1', 'beef2']) await actSel(`[data-testid="restaurant-card-${id}"] .nn-action-chip-btn`);
      record('F three venues selected', setEq((view?.selection || []).map(s => s.id), ['beef0', 'beef1', 'beef2']));
      await send('Bắt đầu lúc 18h, tổng 180 phút, đi bộ, 2 người');
      record('F profile context preserved selection', setEq((view?.selection || []).map(s => s.id), ['beef0', 'beef1', 'beef2']));
      await shot('green-before-plan');
      if (await exists('btn-trigger-plan')) await actSel('btn-trigger-plan');
      const conf = await exists('discovery-confirmation-card') && !!view?.confirmation;
      record('F explicit confirmation gate shown', conf);
      if (conf) {
        await actSel('btn-confirm-itinerary');
        const stops = view?.tour?.stops || [];
        record('F confirm creates tour with 3 ordered stops', !!view?.tour && stops.length === 3 && stops.every((s, i) => (s.order ?? i + 1) === i + 1));
        await until(() => exists('guided-timeline')).catch(() => {});
        const maps = await until(() => exists('google-maps-cta')).then(() => true).catch(() => false);
        record('F ordered Google Maps links rendered', maps);
        const hrefs = await ev(`Array.from(document.querySelectorAll('[data-testid="google-maps-cta"]')).map(a=>a.href).filter(Boolean)`);
        const origin = view.profile.origin;
        const points = stops.map(s=>({lat:s.lat,lon:s.lon}));
        const coordEq=(value,p)=>{const c=String(value).split(',').map(Number);return c.length===2 && Math.abs(c[0]-p.lat)<.000001 && Math.abs(c[1]-p.lon)<.000001};
        const linksValid = hrefs.length===1 && hrefs.every(h=>{
          const u=new URL(h),q=u.searchParams;
          const order=[...(q.get('waypoints')?.split('|') || []),q.get('destination')];
          return u.origin==='https://www.google.com' && u.pathname==='/maps/dir/'
            && q.get('api')==='1' && q.get('travelmode')==='walking' && coordEq(q.get('origin'),origin)
            && order.length===points.length && order.every((p,i)=>coordEq(p,points[i])) && h.length<=2048;
        });
        evidence.syntheticMapsHrefs=hrefs;
        record('F Maps URL uses actual origin, walking and ordered coordinates within2048',linksValid);
        await shot('green-tour-maps');
      } else { record('F confirm creates tour with 3 ordered stops', 'UNTESTED', 'confirmation gate not shown'); record('F ordered Google Maps links rendered', 'UNTESTED'); }
    } catch (ex) { record('F full journey', false, 'error: ' + String(ex.message).slice(0, 80)); evidence.errors.push('F: ' + ex.message); }

    // ---- G. direct-API tour proof (supporting; rules lane) -----------------
    if (!supplement) try {
      const s = await (await fetch(api + '/v1/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
      const T = async p => { const r = await fetch(`${api}/v1/sessions/${s.session_id}/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Token': s.token }, body: JSON.stringify({ revision: s.revision, ...p }) }); const v = await r.json(); if (typeof v.revision === 'number') s.revision = v.revision; if (typeof v.selection_version === 'number') s.selver = v.selection_version; return v; };
      await T({ action: { type: 'location', arguments: { operation: 'coordinates', source: 'coordinates', lat: 21.02, lon: 105.83 } } });
      const se = await T({ text: 'tôi muốn ăn phở bò' });
      for (const id of (se.results || []).slice(0, 3).map(r => r.id)) await T({ action: { type: 'tool', name: 'update_foodtour_selection', arguments: { operation: 'add', venue_ids: [id], selection_version: s.selver || 0 } } });
      await T({ text: 'Bắt đầu lúc 18h, tổng 180 phút, đi bộ, 2 người' });
      const plan = await T({ action: { type: 'tool', name: 'create_itinerary', arguments: {} } });
      let conf = null, ml = null;
      if (plan.confirmation?.id) { conf = await T({ action: { type: 'confirm', confirmation_id: plan.confirmation.id } }); ml = await (await fetch(`${api}/v1/sessions/${s.session_id}/tour/maps-links?mode=walking`, { headers: { 'X-Session-Token': s.token } })).json(); }
      evidence.apiTourProof = { confirmation: !!plan.confirmation, tourStops: (conf?.tour?.stops || []).length, mapsStatus: ml?.status, mapsLinks: Array.isArray(ml?.links) ? ml.links.length : null };
      record('G API tour proof: confirmation -> 3 stops -> ordered maps links', !!plan.confirmation && (conf?.tour?.stops || []).length === 3 && Array.isArray(ml?.links) && ml.links.length >= 1);
    } catch (ex) { record('G API tour proof', 'UNTESTED', 'transient: ' + String(ex.message).slice(0, 60)); evidence.transient.push('G: ' + ex.message); }

    record('no unexpected remote origins', evidence.remoteOrigins.length === 0, JSON.stringify(evidence.remoteOrigins));
    record('no browser exception', evidence.errors.length === 0, evidence.errors.length ? JSON.stringify(evidence.errors.slice(0, 2)) : undefined);
    const after = await (await fetch(api + '/health')).json();
    record('no live generation (rules lane, budget null/unchanged)', (health.llm_budget == null) || (after.llm_budget?.used === health.llm_budget?.used));
    const fails = evidence.checks.filter(c => c.result !== 'PASS').length;
    finish(fails ? 1 : 0);
  } catch (error) { evidence.blocker = String(error.message).slice(0, 200); record('run completed', false); finish(1); }
  finally { ws?.close(); if (chrome.pid) try { execFileSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
}
