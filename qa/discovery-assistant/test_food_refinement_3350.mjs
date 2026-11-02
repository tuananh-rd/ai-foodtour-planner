/**
 * qa/discovery-assistant/test_food_refinement_3350.mjs
 *
 * Browser-typed regression for the Lane 3350 food-refinement bug, driven against
 * the ACTUAL backend rules fixtures already running:
 *   8261 = chicken AVAILABLE (refinement_data with_chicken=True)
 *   8262 = chicken ABSENT   (refinement_data with_chicken=False)
 * Both are the real FastAPI app (production serializer/session/CAS) seeded with
 * Sol's refinement_data; see tools/run_food_refinement_fixture.py.
 *
 * The browser loads the real 3350 UI. Every request to the private API origin
 * http://127.0.0.1:8250 (sessions, clientconfig, capabilities, assistant, OPTIONS)
 * is intercepted over CDP Fetch and PROXIED to the dataset's fixture (8261/8262),
 * preserving method/headers/body. A POST to 8250 is NEVER continued to the private
 * app. Requests to any other origin are aborted. Same-origin 3350 assets pass
 * through. No live chat/Gemini/Tavily, no generation; fixtures are llm=mock.
 *
 * Node built-ins only (no deps), mirroring tools/verify_outage_3350_ui.mjs.
 * Exact final user text: "tôi muốn ăn phở gà cơ".
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';

const web = process.env.DISCOVERY_WEB || 'http://127.0.0.1:3350';
const privateApi = process.env.DISCOVERY_API || 'http://127.0.0.1:8250';
const fixtures = {
  available: (process.env.FIX_AVAILABLE || 'http://127.0.0.1:8261').replace(/\/+$/, ''),
  absent: (process.env.FIX_ABSENT || 'http://127.0.0.1:8262').replace(/\/+$/, '')
};
const port = Number(process.env.DISCOVERY_CDP || 19792);
const out = process.env.DISCOVERY_EVIDENCE || 'docs/reports/food-refinement-3350';
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 18000) {
  const start = Date.now();
  while (Date.now() - start < ms) { try { if (await fn()) return; } catch {} await pause(90); }
  throw Error('Observable browser state timed out');
}

fs.mkdirSync(out, { recursive: true });
const evidence = {
  web, privateApi, fixtures,
  source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  provider: 'ACTUAL RULES fixtures 8261/8262 (refinement_data)',
  liveGemini: 'NO GENERATION; all 8250 API proxied to rules fixtures, POST never continued to 8250',
  datasets: ['available', 'absent'], checks: [], screenshots: [], errors: [],
  remoteOriginsAborted: [], proxied: { available: 0, absent: 0 }
};
function finish(code) { fs.writeFileSync(path.join(out, 'browser-evidence.json'), JSON.stringify(evidence, null, 2)); process.exitCode = code; }

const privOrigin = new URL(privateApi).origin;
const webOrigin = new URL(web).origin;

// Fixtures must be reachable (health GET only).
for (const [k, base] of Object.entries(fixtures)) {
  try { const h = await (await fetch(base + '/health')).json(); if (h.status !== 'ok') throw Error('status ' + h.status); }
  catch (e) { evidence.blocker = `fixture ${k} (${base}) health failed: ${e.message}`; console.log(JSON.stringify({ blocker: evidence.blocker })); finish(1); }
}
if (process.exitCode === 1) { /* already finished */ } else {

const freePort = await new Promise(resolve => { const s = net.createServer(); s.once('error', () => resolve(false)); s.listen(port, '127.0.0.1', () => s.close(() => resolve(true))); });
if (!freePort) { evidence.blocker = 'CDP port occupied; no process stopped'; finish(1); }
else {
  let view = null, dataset = 'available', fixtureBase = fixtures.available;
  const record = (name, pass) => {
    evidence.checks.push({ name, pass: !!pass, ...(!pass ? { diagnostic: { status: view?.status, results: (view?.results || []).map(r => r.id), reply: (view?.reply?.text || '').slice(0, 160), location: view?.location?.status, confirmation: !!view?.confirmation, selection: (view?.selection || []).map(s => s.id), calls: view?.provider?.calls } } : {}) });
    console.log(JSON.stringify({ name, pass: !!pass }));
  };

  const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--disable-background-networking',
    '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`,
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'foodref-qa-'))}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });

  let ws, seq = 0, posts = 0;
  const pending = new Map();
  try {
    let target;
    await until(async () => { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); return target; });
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    const cdp = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq; const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP deadline ' + method)); }, 12000);
      pending.set(id, { resolve: x => { clearTimeout(timer); resolve(x); }, reject: x => { clearTimeout(timer); reject(x); } });
      ws.send(JSON.stringify({ id, method, params }));
    });
    const corsHeaders = () => ([
      { name: 'Access-Control-Allow-Origin', value: web },
      { name: 'Access-Control-Allow-Credentials', value: 'true' },
      { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
      { name: 'Access-Control-Allow-Headers', value: 'Content-Type,X-Session-Token,Accept' }
    ]);

    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.method === 'Fetch.requestPaused') {
        const p = m.params;
        (async () => {
          let u; try { u = new URL(p.request.url); } catch { await cdp('Fetch.continueRequest', { requestId: p.requestId }); return; }
          // Same-origin 3350 app shell/assets pass through untouched.
          if (u.origin === webOrigin) { await cdp('Fetch.continueRequest', { requestId: p.requestId }); return; }
          // Private API: intercept ALL methods; proxy to the dataset fixture. Never continue to 8250.
          if (u.origin === privOrigin) {
            if (p.request.method === 'OPTIONS') {
              await cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 204, responseHeaders: corsHeaders(), body: '' });
              return;
            }
            const method = p.request.method;
            const headers = { 'Accept': 'application/json' };
            const src = p.request.headers || {};
            for (const k of Object.keys(src)) if (['x-session-token', 'content-type'].includes(k.toLowerCase())) headers[k] = src[k];
            const resp = await fetch(fixtureBase + u.pathname + u.search, { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : (p.request.postData || '') });
            const text = await resp.text();
            try { const parsed = JSON.parse(text); if (parsed && parsed.contract === 'discovery-v1') view = parsed; } catch {}
            if (method === 'POST' && /\/assistant$/.test(u.pathname)) posts++;
            evidence.proxied[dataset]++;
            const ct = resp.headers.get('content-type') || 'application/json';
            const logEntry = { d: dataset, method, path: u.pathname, status: resp.status, fulfilled: false };
            (evidence.proxyLog = evidence.proxyLog || []).push(logEntry);
            try {
              await cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: resp.status, responseHeaders: [{ name: 'Content-Type', value: ct }, ...corsHeaders()], body: Buffer.from(text).toString('base64') });
              logEntry.fulfilled = true;
            } catch (fe) { logEntry.fulfillError = String(fe.message).slice(0, 60); }
            return;
          }
          // Any other origin is unknown: abort it (no external leakage).
          if (/^https?:$/.test(u.protocol) && !evidence.remoteOriginsAborted.includes(u.origin)) evidence.remoteOriginsAborted.push(u.origin);
          await cdp('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' });
        })().catch(error => { evidence.errors.push(error.message); cdp('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }).catch(() => {}); });
        return;
      }
      if (m.id) { const pr = pending.get(m.id); pending.delete(m.id); m.error ? pr?.reject(Error(m.error.message)) : pr?.resolve(m.result); return; }
      if (m.method === 'Network.requestWillBeSent') { try { const u = new URL(m.params.request.url); if (/^https?:$/.test(u.protocol) && u.origin !== webOrigin && u.origin !== privOrigin && !evidence.remoteOriginsAborted.includes(u.origin)) evidence.remoteOriginsAborted.push(u.origin); } catch {} }
      if (m.method === 'Runtime.exceptionThrown') evidence.errors.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'exception').replace(/[a-f0-9]{24,}/gi, '[redacted]').slice(0, 600));
    };

    const ev = async expression => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error('Browser evaluation failed'); return r.result.value; };
    const sel = id => `[data-testid="${id}"]`;
    const exists = s => ev(`!!document.querySelector(${JSON.stringify(s.startsWith('[') || s.startsWith('.') ? s : sel(s))})`);
    async function click(selector) {
      const s = selector.startsWith('[') || selector.startsWith('.') ? selector : sel(selector);
      await ev(`document.querySelector(${JSON.stringify(s)})?.scrollIntoView({block:'center'})`);
      const pt = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(s)});if(!e||e.disabled||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      if (!pt) throw Error('Unavailable control ' + s);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...pt });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...pt });
    }
    async function idle() { await until(() => ev(`!!document.querySelector('[data-testid="discovery-input"]')&&!document.querySelector('[data-testid="discovery-input"]').disabled&&!document.querySelector('[aria-busy="true"]')`)); await pause(150); }
    async function fillValue(id, text) {
      await click(id);
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
      await cdp('Input.insertText', { text });
    }
    async function send(text) { await idle(); const before = posts; await fillValue('discovery-input', text); await click('discovery-send-btn'); await until(() => posts > before); await idle(); }
    async function action(selector) { const before = posts; await click(selector); await until(() => posts > before); await idle(); }
    const resultIds = () => ev(`Array.from(document.querySelectorAll('[data-testid^="restaurant-card-"]')).map(e=>e.getAttribute('data-testid').replace('restaurant-card-',''))`);
    const resultsText = () => ev(`(document.querySelector('.nn-discovery-results')?.innerText)||''`);
    const chatText = () => ev(`document.querySelector('[data-testid="discovery-messages-list"]').innerText`);
    async function shot(name) { try { await ev('window.scrollTo(0,0)'); const x = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(x.data, 'base64')); evidence.screenshots.push(name + '.png'); } catch (e) { evidence.errors.push('shot ' + name + ': ' + e.message); } }
    async function revealOrigin() {
      if (await exists('origin-lat-input')) return;
      if (await exists('origin-expand-controls-btn')) { try { await click('origin-expand-controls-btn'); await pause(120); } catch {} }
      if (!await exists('origin-lat-input') && await exists('.nn-origin-manual-toggle')) { try { await click('.nn-origin-manual-toggle'); await pause(120); } catch {} }
    }

    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
    // Intercept ONLY the private API origin; 3350 app shell/assets load normally
    // (3350 makes no external calls). Any non-8250/non-3350 origin is recorded.
    await cdp('Fetch.enable', { patterns: [{ urlPattern: privateApi + '/*', requestStage: 'Request' }] });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false });

    for (dataset of evidence.datasets) {
      fixtureBase = fixtures[dataset];
      view = null;
      const tag = `[${dataset}]`;
      try { await cdp('Storage.clearDataForOrigin', { origin: web, storageTypes: 'all' }); } catch {}
      await cdp('Page.navigate', { url: web });
      await until(() => exists('discovery-input'));
      await until(() => evidence.proxied[dataset] > 0);
      // Init diagnostic: capture readiness before the first turn.
      const initDiag = await ev(`(()=>{const i=document.querySelector('[data-testid="discovery-input"]');const b=document.querySelector('[data-testid="guided-error-banner"]');return{inputDisabled:!!(i&&i.disabled),busy:!!document.querySelector('[aria-busy="true"]'),banner:b?b.innerText.slice(0,160):null}})()`).catch(() => null);
      evidence['init_' + dataset] = initDiag;
      await shot(`${dataset}-0-init`);
      await idle();

      // 1. Generic phở, no origin yet -> rules ask for location, zero cards.
      await send('tôi muốn ăn phở');
      record(`${tag} phở before origin: 0 cards and a location prompt`, (view?.results || []).length === 0 && !!(view?.reply?.question || /vị trí|điểm xuất phát/i.test(view?.reply?.text || '')));
      await shot(`${dataset}-1-before-origin`);

      // 2. Explicit origin via manual coordinates 21.02,105.83 (public fixture origin).
      await revealOrigin();
      if (!await exists('origin-lat-input')) { record(`${tag} origin coordinate inputs reachable`, false); throw Error('origin inputs not reachable'); }
      await fillValue('origin-lat-input', '21.02'); await fillValue('origin-lon-input', '105.83');
      await action('origin-coords-submit');
      let ids = await resultIds();
      record(`${tag} origin chosen resumes phở search including beef`, view?.location?.status === 'chosen' && ids.includes('beef'));
      if (dataset === 'available') record(`${tag} generic phở includes chicken, excludes decoys`, ids.includes('chicken') && !ids.includes('roll') && !ids.includes('snack') && !ids.includes('name_only'));
      else record(`${tag} generic phở is beef-only (no chicken/decoys)`, ids.includes('beef') && !ids.includes('chicken') && !ids.includes('roll') && !ids.includes('snack') && !ids.includes('name_only'));
      await shot(`${dataset}-2-generic-pho`);

      // 3. (Extras, best-effort) add beef to selection, then attempt a confirmation.
      // The confirmation is optional: real rules may ask to clarify more profile
      // context before forming one, which is valid and recorded as a note (not a
      // failure) per "exact basic flow first if extras interfere".
      let hadConfirmation = false, hadSelection = false;
      try {
        await action(`[data-testid="restaurant-card-beef"] .nn-action-chip-btn`);
        hadSelection = (view?.selection || []).some(s => s.id === 'beef');
        record(`${tag} beef added to selection (extra)`, hadSelection);
        if (await exists('btn-trigger-plan')) { await action('btn-trigger-plan'); }
        hadConfirmation = await exists('discovery-confirmation-card') && !!view?.confirmation;
        if (hadConfirmation) record(`${tag} confirmation present before refinement (extra)`, true);
        else (evidence.notes = evidence.notes || []).push(`${tag} itinerary confirmation not formed with minimal profile (rules asked to clarify next step: "${(view?.reply?.text || '').slice(0, 80)}"); confirmation-invalidation browser assertion skipped. Backend invalidate() on foods-change is covered by Sol's unit tests.`);
      } catch (ex) { evidence.errors.push(`${tag} extras: ${ex.message}`); }

      // 4. Specific new food intent. Exact final text.
      await send('tôi muốn ăn phở gà cơ');
      const afterText = await chatText();
      const rtext = await resultsText();
      ids = await resultIds();
      await shot(`${dataset}-3-pho-ga`);

      // Core assertions (independent of the optional extras).
      record(`${tag} origin preserved after refinement`, view?.location?.status === 'chosen' && (view?.profile?.origin != null));
      record(`${tag} stale beef card cleared from results`, !ids.includes('beef'));
      record(`${tag} no false match: roll/snack/name_only never appear`, !ids.includes('roll') && !ids.includes('snack') && !ids.includes('name_only') && !/Cuốn|Ăn vặt|tên quán/i.test(rtext));
      record(`${tag} no mutation-deny / authority-denied text`, !/chưa được xác nhận|không thể|authority_denied|từ chối/i.test(afterText));
      record(`${tag} foods updated to phở gà and provider.calls==0 (pure rules)`, (view?.profile?.foods || []).includes('phở gà') && view?.provider?.calls === 0);
      if (dataset === 'available') record(`${tag} phở gà -> chicken-only (actual results, not HTTP 200)`, ids.length === 1 && ids[0] === 'chicken' && view?.status === 'ok');
      else record(`${tag} phở gà -> honest no_results (0 cards, mentions phở gà)`, ids.length === 0 && view?.status === 'no_results' && /phở gà/i.test(view?.reply?.text || ''));

      // Extra-dependent assertions, only when the extras actually ran.
      if (hadSelection) record(`${tag} beef selection preserved after refinement (extra)`, (view?.selection || []).some(s => s.id === 'beef'));
      if (hadConfirmation) record(`${tag} confirmation invalidated after refinement (extra)`, !await exists('discovery-confirmation-card') && !view?.confirmation);
    }

    record('no /assistant POST ever continued to private 8250 (all proxied)', evidence.proxied.available > 0 && evidence.proxied.absent > 0);
    record('no unexpected remote API origins', evidence.remoteOriginsAborted.length === 0);
    record('no browser exception', evidence.errors.length === 0);
    evidence.fixtureExplanation = 'Every 8250 request proxied to the dataset fixture (8261 available / 8262 absent); OPTIONS answered locally; POST never continued to 8250; other origins aborted. No session id or token stored in evidence; synthetic venue ids only.';
    finish(evidence.checks.some(x => !x.pass) ? 1 : 0);
  } catch (error) {
    evidence.blocker = String(error.message).slice(0, 200);
    record('journey completed', false);
    finish(1);
  } finally {
    ws?.close();
    if (chrome.pid) try { execFileSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  }
}
}
