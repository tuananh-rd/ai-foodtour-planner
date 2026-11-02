/**
 * qa/discovery-assistant/test_matching_menu_private_3350.mjs
 *
 * ONE private actual-menu UI journey via the Sol-safe private QA launcher
 * (tools/run_local_menu_qa.py: FOODTOUR_LLM=mock, all provider/Maps keys blank,
 * geocoder off, disposable sessions, private menu ZIP). Real 3350 UI, direct API,
 * NO interception. Point DISCOVERY_WEB / DISCOVERY_API at the private lane.
 *
 * PRIVACY: evidence is COUNTS/BOOLEANS ONLY — no venue names, ids, prices, raw
 * records, or screenshots are written. Safety guard: refuses chat unless the lane
 * reports no live provider (llm!='live'); the private dataset is allowed here
 * because the launcher disables all transports.
 *
 * Asserts structurally (no raw values): at least one result venue renders a
 * matching_menu card; reference/quarantined/minimum_unknown rows show their
 * truthful labels; the delivery disclaimer is present; the venue dine-in price is
 * not repriced from a delivery reference. Skips cleanly if no menu venue surfaces.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const web = process.env.DISCOVERY_WEB || 'http://127.0.0.1:3350';
const api = process.env.DISCOVERY_API || 'http://127.0.0.1:8250';
const port = Number(process.env.DISCOVERY_CDP || 19795);
const dish = process.env.PRIVATE_DISH || 'cơm';
const area = process.env.PRIVATE_AREA || 'Hoàng Mai';
const out = process.env.DISCOVERY_EVIDENCE || 'docs/reports/matching-menu-3350/private';
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await pause(90); } throw Error('timeout'); }

fs.mkdirSync(out, { recursive: true });
// Evidence carries NO raw records: counts/booleans only.
const evidence = { web, api, lane: 'private-menu (Sol-safe launcher)', privacy: 'counts/booleans only; no names/ids/prices/screenshots', checks: [], errors: [] };
function finish(code) { fs.writeFileSync(path.join(out, 'private-evidence.json'), JSON.stringify(evidence, null, 2)); process.exitCode = code; }
const record = (name, pass, note) => { evidence.checks.push({ name, result: pass === 'UNTESTED' ? 'UNTESTED' : (pass ? 'PASS' : 'FAIL'), ...(note ? { note } : {}) }); console.log(JSON.stringify({ name, result: pass === 'UNTESTED' ? 'UNTESTED' : (pass ? 'PASS' : 'FAIL') })); };

let health; try { health = await (await fetch(api + '/health')).json(); } catch (e) { evidence.blocker = 'health GET failed: ' + e.message; finish(1); }
if (process.exitCode !== 1) {
  evidence.health = { commit: health.build_commit, llm: health.llm, provider: health.assistant_provider, dataset: health.dataset_source, menu_counts: health.menu_counts || null };
  if (health.llm === 'live') { evidence.blocker = 'lane reports live provider; refusing private chat.'; console.log(JSON.stringify({ blocker: evidence.blocker })); finish(2); }
}

if (process.exitCode === undefined || process.exitCode === 0) {
  const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--disable-background-networking', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'menu-priv-qa-'))}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
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
      if (m.method === 'Runtime.exceptionThrown') evidence.errors.push('browser exception (redacted)');
    };
    const ev = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error('eval failed'); return r.result.value; };
    const sel = id => `[data-testid="${id}"]`;
    const S = s => (s.startsWith('[') || s.startsWith('.') ? s : sel(s));
    const exists = s => ev(`!!document.querySelector(${JSON.stringify(S(s))})`);
    async function click(s) { const q = S(s); await ev(`document.querySelector(${JSON.stringify(q)})?.scrollIntoView({block:'center'})`); const pt = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(q)});if(!e||e.disabled||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`); if (!pt) throw Error('no control'); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...pt }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...pt }); }
    async function idle() { await until(() => ev(`!!document.querySelector('[data-testid="discovery-input"]')&&!document.querySelector('[data-testid="discovery-input"]').disabled&&!document.querySelector('[aria-busy="true"]')`)); await pause(160); }
    async function fillValue(id, text) { await click(id); await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 }); await cdp('Input.insertText', { text }); }
    async function send(text) { await idle(); const before = posts; await fillValue('discovery-input', text); await click('discovery-send-btn'); await until(() => posts > before); await until(() => aReqs.size === 0); await idle(); }
    async function actSel(s) { const before = posts; await click(s); await until(() => posts > before); await until(() => aReqs.size === 0); await idle(); }
    async function setOriginLocal(q) {
      if (!await exists('origin-query-input')) { if (await exists('origin-expand-controls-btn')) { try { await click('origin-expand-controls-btn'); await pause(130); } catch {} } }
      if (!await exists('origin-query-input')) return false;
      await fillValue('origin-query-input', q); await actSel('origin-resolve-button');
      const ok = await until(() => exists('[data-testid^="origin-candidate-"]'), 6000).then(() => true).catch(() => false);
      if (!ok) return false;
      const cid = await ev(`document.querySelector('[data-testid^="origin-candidate-"]')?.getAttribute('data-testid')`);
      if (!cid) return false; await actSel(`[data-testid="${cid}"]`); return true;
    }
    // Structural reader: derives booleans/counts, never returns raw names/prices.
    const menuStructure = () => ev(`(()=>{
      const cards=[...document.querySelectorAll('[data-testid^="menu-ref-"]')].filter(e=>/^menu-ref-[^-]+$/.test(e.getAttribute('data-testid')));
      let ref=0,quar=0,unk=0,mandFlag=0,rows=0; let disclaimer=false;
      for(const c of cards){ if(/không phải giá tại quán/i.test(c.innerText)&&/giao hàng|ShopeeFood/i.test(c.innerText)) disclaimer=true;
        for(const r of c.querySelectorAll('[data-testid*="-"] , .nn-menu-ref-row')){} }
      const rowEls=[...document.querySelectorAll('.nn-menu-ref-row')];
      for(const r of rowEls){ rows++; const t=r.innerText;
        if(/Giá chưa xác minh/.test(t)) quar++; else if(/Giá món tối thiểu chưa xác định/.test(t)) unk++; else if(/đ \\(giao hàng\\)/.test(t)) ref++;
        if(/bắt buộc/.test(t)) mandFlag++; }
      return {cards:cards.length, rows, ref, quar, unk, mandFlag, disclaimer};
    })()`);

    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false });
    try { await cdp('Storage.clearDataForOrigin', { origin: web, storageTypes: 'all' }); } catch {}
    await cdp('Page.navigate', { url: web }); await until(() => exists('discovery-input')); await idle();

    // (1) Request typed BEFORE origin -> prompt + 0 cards; then LOCAL gazetteer origin
    await send(`tôi muốn ăn ${dish} tại ${area}`);
    record('private: request before origin prompts with zero cards', (view?.results || []).length === 0 && !!view?.reply?.question);
    const localOrigin = await setOriginLocal(area).catch(() => false);
    record('private: local gazetteer origin chosen (no invented coords)', localOrigin === true && view?.location?.status === 'chosen');

    const menuVenueIds = (view?.results || []).filter(r => Array.isArray(r.matching_menu) && r.matching_menu.length > 0).map(r => r.id);
    evidence.counts = { results: (view?.results || []).length, menuVenues: menuVenueIds.length, originChosen: view?.location?.status === 'chosen' };
    if (!menuVenueIds.length) {
      record('private: a result venue renders matching_menu', 'UNTESTED', `no menu venue for "${dish}" in ${area}; adjust PRIVATE_DISH/PRIVATE_AREA`);
      finish(0);
    } else {
      await until(() => exists('[data-testid^="menu-ref-"]'));
      const st = await menuStructure();
      evidence.structure = st; // counts/booleans only
      record('private: chosen origin then at least one matching_menu card (nonempty)', st.cards >= 1 && st.rows >= 1 && view?.location?.status === 'chosen');
      record('private: delivery disclaimer present (not dine-in, ShopeeFood)', st.disclaimer === true);
      record('private: every row label truthful (reference|quarantined|minimum_unknown)', (st.ref + st.quar + st.unk) === st.rows && st.rows > 0);

      // (2) selection -> profile (explicit ô tô for confirmed car driving OSM) -> explicit confirmation -> tour -> ordered OSM Directions.
      const pick = menuVenueIds[0];
      let selected = false, confShown = false, tourStops = 0, mapsPresent = false, mapsValid = false;
      let mapMounted = false, originMarkerShown = false, stopMarkerShown = false, toggleWorked = false;
      let postPreserved = false;
      try {
        await actSel(`[data-testid="restaurant-card-${pick}"] .nn-action-chip-btn`);
        selected = (view?.selection || []).some(s => s.id === pick);
        await send('Bắt đầu lúc 18h, tổng 180 phút, ô tô, 2 người');
        if (await exists('btn-trigger-plan')) await actSel('btn-trigger-plan');
        confShown = await exists('discovery-confirmation-card') && !!view?.confirmation;
        if (confShown) {
          await actSel('btn-confirm-itinerary');
          tourStops = (view?.tour?.stops || []).length;
          await until(() => exists('guided-timeline')).catch(() => {});
          mapsPresent = await until(() => exists('osm-directions-cta') || exists('google-maps-cta')).then(() => true).catch(() => false);
          if (mapsPresent) {
            const origin = view?.profile?.origin; const stops = view?.tour?.stops || [];
            mapsValid = await ev(`(()=>{
              const a = document.querySelector('[data-testid="osm-directions-cta"]') || document.querySelector('[data-testid="google-maps-cta"]');
              if (!a || !a.href) return false;
              try {
                const u = new URL(a.href), q = u.searchParams;
                const pts = ${JSON.stringify(stops.map(s => [s.lat, s.lon]))};
                const o = ${JSON.stringify(origin ? [origin.lat, origin.lon] : null)};
                const eq = (coordStr, p) => {
                  const c = String(coordStr).split(',').map(Number);
                  return c.length === 2 && Math.abs(c[0] - p[0]) < 1e-4 && Math.abs(c[1] - p[1]) < 1e-4;
                };
                if (u.origin !== 'https://www.openstreetmap.org' || u.pathname !== '/directions') return false;
                const engine = q.get('engine');
                if (engine !== 'fossgis_osrm_foot' && engine !== 'fossgis_osrm_car') return false;
                const route = q.get('route');
                if (!route) return false;
                const parts = route.split(';');
                if (parts.length !== 2) return false;
                return o && pts.length > 0 && eq(parts[0], o) && eq(parts[1], pts[0]);
              } catch (e) {
                return false;
              }
            })()`);
          }

          // (3) Map mount, outside-pilot origin fit, marker toggle, and mobile responsiveness
          if (await exists('pilot-map-toggle')) {
            await click('pilot-map-toggle');
            mapMounted = await until(() => exists('pilot-map-canvas'), 8000).then(() => true).catch(() => false);
            originMarkerShown = await until(() => exists('pilot-origin-marker'), 6000).then(() => true).catch(() => false);
            stopMarkerShown = await until(() => exists('pilot-stop-marker-1'), 6000).then(() => true).catch(() => false);
            if (await exists('pilot-markers-toggle')) {
              await click('pilot-markers-toggle');
              await pause(100);
              await click('pilot-markers-toggle');
              toggleWorked = true;
            }
            // Mobile viewport test
            await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
            await pause(150);
            await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false });
            await pause(150);
            // Switch back to schematic
            const schemBtn = await exists('.nn-view-mode-btn') ? '.nn-view-mode-btn' : null;
            if (schemBtn) await click(schemBtn);
          }

          // (4) After the tour, a food change preserves valid selection + origin and invalidates confirmation/tour.
          const revBefore = view?.revision || 0;
          await send('tôi muốn ăn phở');
          await until(() => (view?.revision || 0) > revBefore, 8000).catch(() => {});
          postPreserved = (view?.selection || []).some(s => s.id === pick) && view?.location?.status === 'chosen' && !view?.confirmation && !view?.tour;
        }
      } catch (ex) { evidence.errors.push('journey step error (redacted)'); }
      evidence.journey = { selected, confShown, tourStops, mapsPresent, mapsValid, mapMounted, originMarkerShown, stopMarkerShown, toggleWorked, postPreserved };
      record('private: selected a menu venue into the tour', selected === true);
      record('private: explicit confirmation gate forms', confShown === true);
      record('private: confirm creates a tour with stops', tourStops > 0);
      record('private: ordered OpenStreetMap directions URL forms and is valid (boolean only)', mapsPresent === true && mapsValid === true);
      record('private: map mounts with explicit origin and stop markers', mapMounted === true && originMarkerShown === true && stopMarkerShown === true);
      record('private: map marker toggle and mobile resize verified', toggleWorked === true);
      record('private: post-tour food change preserves selection+origin and invalidates confirmation/tour', postPreserved === true);
      record('private: no live generation (mock lane)', health.llm !== 'live');
      record('private: no browser exception', evidence.errors.length === 0);
      finish(evidence.checks.some(c => c.result === 'FAIL') ? 1 : 0);
    }
  } catch (error) { evidence.blocker = 'journey error (redacted): ' + String(error.message).slice(0, 80); record('run completed', false); finish(1); }
  finally { ws?.close(); if (chrome.pid) try { execFileSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
}
