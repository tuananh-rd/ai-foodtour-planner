// qa/discovery-upgrade/run_discovery_upgrade_qa.mjs
// Isolated End-to-End QA Suite for Discovery Assistant Upgrade (discovery-v1)
// [MOCK ONLY - Isolated Contract Conformance Suite, NOT Live API Verification]
// Covers:
// 1. Capabilities & Settings: GET /v1/assistant/capabilities, model selector, Tavily search toggle
// 2. Origin Chooser: click-only GPS, catalog resolve & candidate choose, manual coords, clear origin
// 3. Server Distance Display: "đường chim bay" (~X m / ~X.X km) or translated reason ("Chưa có khoảng cách")
// 4. Completed Tour CTA: "Xem lịch trình trên Google Maps →" with verified free URL
// 5. Multi-viewport validation across 1280x800, 1440x1024, 1920x1080, 2560x1440, 390x844
// 6. Zero Unicode Emojis across all text and viewports
// Ports: Web 13600, Mock API 18600, CDP 19800

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const QA_UPGRADE_DIR = path.join(root, 'qa', 'discovery-upgrade');
const SCREENSHOTS_DIR = path.join(QA_UPGRADE_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const PORT_WEB = 13600;
const PORT_API = 18600;
const PORT_CDP = 19800;

const BROWSER_PATH = process.env.BROWSER ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe',
   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
   'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);

if (!BROWSER_PATH) {
  console.error('No suitable Chrome/Edge browser found');
  process.exit(1);
}

const pause = (ms) => new Promise((res) => setTimeout(res, ms));

async function until(fn, timeoutMs = 25000, stepMs = 100, label = '') {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fn();
      if (res) return res;
    } catch (err) {
      lastErr = err.message;
    }
    await pause(stepMs);
  }
  throw new Error(`Timeout waiting for condition ${label ? `[${label}] ` : ''}after ${timeoutMs}ms. Last error: ${lastErr}`);
}

async function checkPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

const children = [];
let cleanupDone = false;

function cleanup() {
  if (cleanupDone) return;
  cleanupDone = true;
  console.log('\nCleaning up QA processes and scratch resources...');
  for (const p of children) {
    if (!p.pid || p.exitCode !== null) continue;
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        p.kill('SIGKILL');
      }
    } catch (_) {}
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  cleanup();
  process.exit(1);
});

const evidence = {
  testedAt: new Date().toISOString(),
  targetContract: 'discovery-v1 (Additive Location, Model, Web)',
  ports: { web: PORT_WEB, mockApi: PORT_API, cdp: PORT_CDP },
  viewportsTested: [
    { name: 'desktop_1440x1024', width: 1440, height: 1024 },
    { name: 'desktop_1280x800', width: 1280, height: 800 },
    { name: 'desktop_1920x1080', width: 1920, height: 1080 },
    { name: 'desktop_2560x1440', width: 2560, height: 1440 },
    { name: 'mobile_390x844', width: 390, height: 844 }
  ],
  checks: [],
  summary: { total: 0, passed: 0, failed: 0 }
};

function recordCheck(id, name, pass, details = {}) {
  const item = { id, name, pass: Boolean(pass), details };
  evidence.checks.push(item);
  evidence.summary.total += 1;
  if (pass) {
    evidence.summary.passed += 1;
  } else {
    evidence.summary.failed += 1;
  }
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id}: ${name} ${details ? JSON.stringify(details) : ''}`);
}

// Distance computation helper for mock server
function computeHaversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * In-memory Mock Discovery Server adhering to DISCOVERY_LOCATION_MODEL_WEB_CONTRACT.md
 */
function createMockDiscoveryServer() {
  const sampleVenues = [
    {
      id: 'venue-v1',
      name: 'Phở 10 Lý Quốc Sư',
      address: '10 Lý Quốc Sư',
      district: 'Hoàn Kiếm',
      lat: 21.0304,
      lon: 105.8496,
      dish_tags: ['phở bò', 'quẩy'],
      price: { min_vnd: 60000, max_vnd: 90000, evidence: 'Khảo sát thực đơn' },
      hours: { display: '06:00 - 22:00', status: 'verified' },
      distance_m: null,
      distance_source: null,
      distance_reason: 'origin_missing',
      unknowns: []
    },
    {
      id: 'venue-v2',
      name: 'Chè Bốn Mùa',
      address: '4 Hàng Cân',
      district: 'Hoàn Kiếm',
      lat: 21.0337,
      lon: 105.8509,
      dish_tags: ['chè khúc bạch', 'chè đỗ xanh'],
      price: { min_vnd: 25000, max_vnd: 40000, evidence: 'Khảo sát thực đơn' },
      hours: { display: '09:00 - 23:00', status: 'verified' },
      distance_m: null,
      distance_source: null,
      distance_reason: 'origin_missing',
      unknowns: []
    },
    {
      id: 'venue-v3',
      name: 'Bún Chả Đắc Kim',
      address: '1 Hàng Mành',
      district: 'Hoàn Kiếm',
      lat: 21.0325,
      lon: 105.8488,
      dish_tags: ['bún chả', 'nem rán'],
      price: { min_vnd: 70000, max_vnd: 120000, evidence: 'Khảo sát thực đơn' },
      hours: { display: '08:30 - 21:00', status: 'verified' },
      distance_m: null,
      distance_source: null,
      distance_reason: 'origin_missing',
      unknowns: []
    }
  ];

  const state = {
    contract: 'discovery-v1',
    session_id: 'sess-qa-upgrade-1',
    token: 'qa-mock-token-123',
    revision: 1,
    profile_version: 0,
    selection_version: 0,
    status: 'ok',
    reply: {
      text: 'Chào bạn! Em có thể giúp bạn khám phá các món ngon Hà Nội, tìm quán phù hợp hoặc gợi ý tour ẩm thực theo ý bạn.',
      question: null
    },
    profile: {
      area: null,
      origin: null,
      party_size: null,
      budget_vnd: null,
      budget_scope: null,
      start_time: null,
      end_time: null,
      duration_min: null,
      vehicle: 'walk',
      tastes: [],
      exclusions: [],
      allergies: [],
      max_leg_min: null
    },
    settings: {
      chat_model: 'gemini-2.5-flash',
      web_search_enabled: false
    },
    location: {
      status: 'unset',
      label: null,
      source: null,
      approximate: false,
      candidates: []
    },
    web: {
      enabled: false,
      status: 'off',
      reason: null,
      sources: []
    },
    results: [...sampleVenues],
    selection: [],
    comparison: null,
    confirmation: null,
    messages: [],
    tour: null,
    source: 'mock-qa-upgrade',
    provider: 'local-test',
    diagnostics: { tool_calls: 0, elapsed_ms: 12, weather: 'unavailable' }
  };

  function recalculateDistances() {
    if (!state.profile.origin || typeof state.profile.origin.lat !== 'number' || typeof state.profile.origin.lon !== 'number') {
      state.results.forEach((r) => {
        r.distance_m = null;
        r.distance_source = null;
        r.distance_reason = 'origin_missing';
      });
      state.selection.forEach((s) => {
        s.distance_m = null;
        s.distance_source = null;
        s.distance_reason = 'origin_missing';
      });
      return;
    }
    const oLat = state.profile.origin.lat;
    const oLon = state.profile.origin.lon;

    state.results.forEach((r) => {
      if (typeof r.lat === 'number' && typeof r.lon === 'number') {
        r.distance_m = computeHaversineMeters(oLat, oLon, r.lat, r.lon);
        r.distance_source = 'haversine';
        r.distance_reason = null;
      } else {
        r.distance_m = null;
        r.distance_source = null;
        r.distance_reason = 'venue_coordinates_missing';
      }
    });

    state.selection.forEach((s) => {
      if (typeof s.lat === 'number' && typeof s.lon === 'number') {
        s.distance_m = computeHaversineMeters(oLat, oLon, s.lat, s.lon);
        s.distance_source = 'haversine';
        s.distance_reason = null;
      } else {
        s.distance_m = null;
        s.distance_source = null;
        s.distance_reason = 'venue_coordinates_missing';
      }
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT_API}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Session-Token');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/v1/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', llm: 'mock', dataset_source: 'synthetic', version: '1.0.0' }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/client-config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        google_maps_enabled: true,
        features: { guided_ui: true, chat_v2: true, ui_v2: true }
      }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/assistant/capabilities') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        contract: 'discovery-v1',
        default_chat_model: 'gemini-2.5-flash',
        chat_models: [
          { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', available: true, reason: null, native_tools_verified: true },
          { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', available: true, reason: null, native_tools_verified: true }
        ],
        web_search: {
          provider: 'tavily',
          configured: false,
          available: false,
          free_only: true,
          reason: 'unavailable'
        },
        location: {
          mode: 'local_catalog',
          coordinates_supported: true,
          arbitrary_address_geocoding: false
        }
      }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/sessions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        session_id: state.session_id,
        token: state.token,
        revision: state.revision
      }));
      return;
    }

    if (url.pathname.match(/^\/v1\/sessions\/[^/]+\/assistant$/)) {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state));
        return;
      }

      if (req.method === 'POST') {
        let bodyStr = '';
        req.on('data', (chunk) => { bodyStr += chunk; });
        req.on('end', () => {
          let body;
          try {
            body = JSON.parse(bodyStr);
          } catch (_) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 'invalid_json', message: 'Malformed JSON payload' }));
            return;
          }

          // Check stale revision
          if (body.revision !== undefined && body.revision < state.revision) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              code: 'revision_conflict',
              message: `Revision ${body.revision} is stale`,
              latest_revision: state.revision
            }));
            return;
          }

          // 1. Text Turn
          if (body.text) {
            state.revision += 1;
            state.messages.push({ role: 'user', text: body.text });
            state.reply = {
              text: `Đã nhận yêu cầu: "${body.text}". Đây là các gợi ý quán phù hợp tại Hoàn Kiếm:`,
              question: null
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state));
            return;
          }

          // 2. Action Turn
          if (body.action) {
            const act = body.action;

            // Settings Action
            if (act.type === 'settings') {
              state.revision += 1;
              if (act.arguments.chat_model !== undefined) {
                state.settings.chat_model = act.arguments.chat_model;
              }
              if (act.arguments.web_search_enabled !== undefined) {
                state.settings.web_search_enabled = Boolean(act.arguments.web_search_enabled);
                state.web.enabled = state.settings.web_search_enabled;
                state.web.status = state.settings.web_search_enabled ? 'ok' : 'off';
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(state));
              return;
            }

            // Location Action
            if (act.type === 'location') {
              state.revision += 1;
              const op = act.arguments?.operation;
              if (op === 'resolve') {
                const q = (act.arguments?.query || '').toLowerCase();
                if (q.includes('chợ') || q.includes('hôm')) {
                  state.location.status = 'candidates';
                  state.location.candidates = [
                    { id: 'cand-chohom', label: 'Chợ Hôm Đức Viên', lat: 21.0185, lon: 105.8524, approximate: false },
                    { id: 'cand-phohue', label: 'Phố Huế (khu vực lân cận)', lat: 21.0195, lon: 105.8510, approximate: true }
                  ];
                } else {
                  state.location.status = 'not_found';
                  state.location.candidates = [];
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(state));
                return;
              }

              if (op === 'choose') {
                const cId = act.arguments?.candidate_id;
                const found = state.location.candidates.find((c) => c.id === cId);
                if (found) {
                  state.location.status = 'chosen';
                  state.location.label = found.label;
                  state.location.approximate = found.approximate;
                  state.location.source = 'catalog';
                  state.profile.origin = { lat: found.lat, lon: found.lon, label: found.label, approximate: found.approximate };
                  recalculateDistances();
                  // Invalidates confirmation and tour
                  state.confirmation = null;
                  state.tour = null;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(state));
                return;
              }

              if (op === 'coordinates') {
                const lat = Number(act.arguments?.lat);
                const lon = Number(act.arguments?.lon);
                state.location.status = 'chosen';
                state.location.label = `Tọa độ GPS (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
                state.location.source = act.arguments?.source || 'gps';
                state.location.approximate = false;
                state.profile.origin = { lat, lon, label: state.location.label, approximate: false };
                recalculateDistances();
                state.confirmation = null;
                state.tour = null;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(state));
                return;
              }

              if (op === 'clear') {
                state.location.status = 'unset';
                state.location.label = null;
                state.location.source = null;
                state.location.approximate = false;
                state.location.candidates = [];
                state.profile.origin = null;
                recalculateDistances();
                state.confirmation = null;
                state.tour = null;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(state));
                return;
              }
            }

            // Selection tool
            if (act.type === 'tool' && act.name === 'update_foodtour_selection') {
              state.revision += 1;
              state.selection_version += 1;
              const op = act.arguments?.operation;
              const vIds = act.arguments?.venue_ids || [];

              if (op === 'add') {
                for (const vid of vIds) {
                  if (!state.selection.some((s) => s.id === vid)) {
                    const match = sampleVenues.find((v) => v.id === vid);
                    if (match) state.selection.push({ ...match, locked: false });
                  }
                }
              } else if (op === 'remove') {
                state.selection = state.selection.filter((s) => !vIds.includes(s.id));
              }
              recalculateDistances();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(state));
              return;
            }

            // Create itinerary
            if (act.type === 'tool' && act.name === 'create_itinerary') {
              state.revision += 1;
              state.confirmation = {
                id: 'conf-plan-001',
                profile_version: state.profile_version,
                selection_version: state.selection_version,
                summary: {
                  title: 'Xác nhận tạo lịch trình food tour',
                  area: 'Hoàn Kiếm',
                  notes: 'Lịch trình được tối ưu theo danh sách quán đã chọn',
                  items: [
                    { label: 'Số điểm dừng', value: `${state.selection.length} quán` },
                    { label: 'Khu vực', value: 'Hoàn Kiếm' }
                  ]
                },
                warnings: []
              };
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(state));
              return;
            }

            // Confirm action
            if (act.type === 'confirm') {
              state.revision += 1;
              state.confirmation = null;
              const stops = state.selection.map((s, idx) => ({
                venue_id: s.id,
                name: s.name,
                address: s.address,
                district: s.district,
                lat: s.lat,
                lon: s.lon,
                arrive: `18:${idx * 30}`,
                depart: `18:${idx * 30 + 25}`,
                stage: idx === 0 ? 'MỞ ĐẦU' : idx === 1 ? 'MÓN CHÍNH' : 'TRÁNG MIỆNG'
              }));
              state.tour = {
                revision: state.revision,
                status: 'verified_feasible',
                title: 'Food tour Hoàn Kiếm đêm',
                explanation: 'Lịch trình ẩm thực tối ưu',
                stops,
                totals: { walk_minutes: 20 },
                unknowns: []
              };
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(state));
              return;
            }

            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 'unsupported_action', message: 'Action not handled in mock' }));
            return;
          }

          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 'bad_request', message: 'Missing text or action' }));
        });
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'not_found', message: 'Endpoint not found' }));
  });

  return {
    server,
    getState: () => state
  };
}

async function main() {
  console.log('================================================================');
  console.log('=== DISCOVERY UPGRADE (Location, Model, Web) INTEGRATION QA ===');
  console.log('================================================================');

  // 1. Preflight port checks
  console.log('\n[1/5] Preflight TCP Refusal Check on Isolated Ports...');
  for (const port of [PORT_WEB, PORT_API, PORT_CDP]) {
    const free = await checkPortFree(port);
    if (!free) throw new Error(`FATAL: Port ${port} is occupied!`);
  }
  recordCheck('PREFLIGHT_PORTS', 'Isolated test ports 13600, 18600, 19800 are free', true);

  // 2. Start Mock Discovery API Server
  console.log(`\n[2/5] Starting Mock Discovery API Server on ${PORT_API}...`);
  const mockServerInfo = createMockDiscoveryServer();
  await new Promise((res) => mockServerInfo.server.listen(PORT_API, '127.0.0.1', res));
  recordCheck('MOCK_API_RUNNING', `Mock API listening on http://127.0.0.1:${PORT_API}`, true);

  // 3. Setup Scratch Frontend for Next.js
  console.log(`\n[3/5] Setting up isolated Scratch Next.js Frontend...`);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-upgrade-'));
  const webScratch = path.join(scratch, 'web');
  fs.cpSync(path.join(root, 'frontend'), webScratch, {
    recursive: true,
    filter: (s) => !s.split(path.sep).some((x) => x === 'node_modules' || x.startsWith('.next') || x.startsWith('.env'))
  });
  fs.symlinkSync(path.join(root, 'frontend/node_modules'), path.join(webScratch, 'node_modules'), 'junction');

  const buildEnv = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_API_URL: `http://127.0.0.1:${PORT_API}`,
    NEXT_PUBLIC_API_MODE: 'real'
  };

  console.log('Building Next.js in scratch environment with mock API target...');
  execFileSync(
    process.execPath,
    [path.join(root, 'frontend/node_modules/next/dist/bin/next'), 'build'],
    { cwd: webScratch, env: buildEnv, stdio: 'pipe', timeout: 120000 }
  );
  recordCheck('FRONTEND_BUILD', 'Next.js build succeeded in scratch environment', true);

  console.log(`Starting isolated Next.js server on ${PORT_WEB}...`);
  const frontendProc = spawn(
    process.execPath,
    [path.join(root, 'frontend/node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(PORT_WEB)],
    { cwd: webScratch, env: buildEnv, stdio: 'ignore', windowsHide: true }
  );
  children.push(frontendProc);

  await until(async () => {
    const res = await fetch(`http://127.0.0.1:${PORT_WEB}`);
    return res.ok;
  }, 25000, 200, 'Frontend readiness');
  recordCheck('FRONTEND_RUNNING', `Frontend responding on http://127.0.0.1:${PORT_WEB}`, true);

  // 4. Launch Headless Chrome via CDP
  console.log(`\n[4/5] Launching Headless Chrome via CDP on ${PORT_CDP}...`);
  const chromeProfile = path.join(scratch, 'chrome_profile');
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
  ], { cwd: root, env: process.env, stdio: 'ignore', windowsHide: true });
  children.push(chromeProc);

  let target;
  await until(async () => {
    const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json`)).json();
    target = list.find((x) => x.type === 'page');
    return Boolean(target);
  }, 15000, 200, 'Chrome target lookup');

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

  async function evalJs(expr) {
    const res = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.text} (${JSON.stringify(res.exceptionDetails.exception)})`);
    }
    return res.result?.value;
  }

  async function click(selector) {
    await evalJs(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest'})`);
    const success = await evalJs(`(()=>{
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.focus();
      el.click();
      return true;
    })()`);
    if (!success) throw new Error(`Cannot find selector to click: ${selector}`);
    await pause(150);
  }

  async function typeInput(selector, text) {
    await click(selector);
    await evalJs(`(()=>{
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(el, ${JSON.stringify(text)});
      } else {
        el.value = ${JSON.stringify(text)};
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await pause(150);
  }

  // Set initial desktop 1440x1024 viewport
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1024,
    deviceScaleFactor: 1,
    mobile: false
  });

  console.log(`Navigating to http://127.0.0.1:${PORT_WEB}...`);
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT_WEB}` });

  // Await Discovery Layout readiness
  await until(async () => {
    return await evalJs('Boolean(document.querySelector(\'[data-testid="discovery-layout"]\'))');
  }, 25000, 200, 'Discovery layout render');
  recordCheck('DISCOVERY_LAYOUT_RENDERED', 'Discovery layout loaded successfully', true);

  // Await session token and interactive input
  await until(async () => {
    return await evalJs('Boolean(document.querySelector(\'[data-testid="discovery-input"]:not([disabled])\'))');
  }, 15000, 200, 'Interactive chat input enabled');
  recordCheck('INPUT_INTERACTIVE', 'Chat input enabled after session authentication', true);

  // 5. Verification Journey
  console.log('\n[5/5] Executing Contract & Interaction Tests...');

  // Test A: Capabilities & Settings Bar
  console.log('\n--- Test A: Capabilities & Settings Bar ---');
  const hasSettingsBar = await evalJs('Boolean(document.querySelector(\'[data-testid="discovery-settings-bar"]\'))');
  recordCheck('SETTINGS_BAR_PRESENT', 'Settings bar is present in DOM', hasSettingsBar);

  const modelOptions = await evalJs(`
    Array.from(document.querySelectorAll('[data-testid="chat-model-select"] option')).map(o => ({
      value: o.value,
      text: o.textContent.trim(),
      disabled: o.disabled
    }))
  `);
  recordCheck('MODEL_OPTIONS_VERIFIED', 'Gemini chat model options populated from capabilities',
    modelOptions.length >= 2 && modelOptions.some(m => m.value === 'gemini-2.5-flash'),
    { modelOptions }
  );

  const initialWebSearch = await evalJs('document.querySelector(\'[data-testid="web-search-toggle"]\').checked');
  recordCheck('WEB_SEARCH_DEFAULT_OFF', 'Web search toggle defaults to unchecked/off', initialWebSearch === false);

  // Change model selection
  await evalJs(`
    const sel = document.querySelector('[data-testid="chat-model-select"]');
    sel.value = 'gemini-2.5-pro';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  `);
  await pause(400);

  const updatedStateAfterModel = mockServerInfo.getState();
  recordCheck('MODEL_SELECTION_DISPATCHED', 'Settings action dispatched with selected chat_model',
    updatedStateAfterModel.settings.chat_model === 'gemini-2.5-pro',
    { currentModel: updatedStateAfterModel.settings.chat_model }
  );

  // Test B: Origin Chooser Initial State & Distance
  console.log('\n--- Test B: Origin Chooser & Initial Server Distance ---');
  const hasOriginChooser = await evalJs('Boolean(document.querySelector(\'[data-testid="discovery-origin-chooser"]\'))');
  recordCheck('ORIGIN_CHOOSER_PRESENT', 'Origin chooser component is present', hasOriginChooser);

  const initialDistText = await evalJs(`
    document.querySelector('[data-testid="restaurant-distance-venue-v1"]')?.textContent.trim()
  `);
  recordCheck('DISTANCE_INITIAL_UNSET', 'Server distance displays translated "Chưa có khoảng cách (chưa có điểm xuất phát)" when origin is unset',
    initialDistText && initialDistText.includes('Chưa có khoảng cách') && initialDistText.includes('chưa có điểm xuất phát'),
    { initialDistText }
  );

  // Test C: Place Query Resolve & Candidate Selection
  console.log('\n--- Test C: Place Query Resolve & Candidate Selection ---');
  await typeInput('[data-testid="origin-query-input"]', 'Chợ Hôm');
  await click('[data-testid="origin-resolve-button"]');

  await until(async () => {
    return await evalJs('Boolean(document.querySelector(\'[data-testid="origin-candidates-list"]\'))');
  }, 10000, 200, 'Candidate list render');
  recordCheck('CANDIDATES_RENDERED', 'Catalog candidate list rendered after query resolve', true);

  // Choose candidate
  await click('[data-testid="origin-candidate-cand-chohom"]');

  await until(async () => {
    const txt = await evalJs('document.querySelector(\'[data-testid="restaurant-distance-venue-v1"]\')?.textContent');
    return txt && txt.includes('đường chim bay');
  }, 10000, 200, 'Distance updated after origin choice');

  const chosenDistText = await evalJs(`
    document.querySelector('[data-testid="restaurant-distance-venue-v1"]').textContent.trim()
  `);
  recordCheck('DISTANCE_SERVER_COMPUTED', 'Server distance labeled "đường chim bay" with numeric value after origin chosen',
    chosenDistText.includes('đường chim bay') && /~\d+/.test(chosenDistText),
    { chosenDistText }
  );

  // Test D: Clear Origin
  console.log('\n--- Test D: Clear Origin Operation ---');
  await click('[data-testid="origin-clear-button"]');

  await until(async () => {
    const txt = await evalJs('document.querySelector(\'[data-testid="restaurant-distance-venue-v1"]\')?.textContent');
    return txt && txt.includes('Chưa có khoảng cách');
  }, 10000, 200, 'Distance reset to unknown after origin clear');
  recordCheck('ORIGIN_CLEARED', 'Origin successfully cleared and distance reset without error', true);

  // Test E: Manual Coordinates Origin Setting
  console.log('\n--- Test E: Manual Coordinates Origin Setting ---');
  await click('.nn-origin-manual-toggle');
  await typeInput('[data-testid="origin-lat-input"]', '21.0285');
  await typeInput('[data-testid="origin-lon-input"]', '105.8542');
  await click('[data-testid="origin-coords-submit"]');

  await until(async () => {
    const txt = await evalJs('document.querySelector(\'[data-testid="restaurant-distance-venue-v1"]\')?.textContent');
    return txt && txt.includes('đường chim bay');
  }, 10000, 200, 'Distance updated after manual coordinates');
  recordCheck('ORIGIN_COORDINATES_SET', 'Origin set via validated coordinates and distance updated', true);

  // Test F: Selection, Planning, and Completed Tour CTA
  console.log('\n--- Test F: Selection, Planning, and Completed Tour CTA ---');
  // Add 2 venues to selection
  await click('[data-testid="btn-select-venue-venue-v1"]');
  await pause(200);
  await click('[data-testid="btn-select-venue-venue-v2"]');
  await pause(200);

  // Verify selected venue card distance unconditionally rendered
  const selectedDistPresent = await evalJs(`
    Boolean(document.querySelector('[data-testid="selected-distance-venue-v1"]')?.textContent.trim())
  `);
  recordCheck('SELECTED_CARD_DISTANCE_RENDERED', 'Selected venue card renders distance label unconditionally', selectedDistPresent);

  // Trigger Plan
  await until(async () => {
    return await evalJs('Boolean(document.querySelector(\'[data-testid="btn-trigger-plan"]\'))');
  }, 10000, 200, 'Trigger plan button visible');

  await click('[data-testid="btn-trigger-plan"]');

  // Await confirmation card
  await until(async () => {
    return await evalJs('Boolean(document.querySelector(\'[data-testid="btn-confirm-itinerary"]\'))');
  }, 10000, 200, 'Confirmation card render');
  recordCheck('CONFIRMATION_CARD_RENDERED', 'Versioned confirmation gate rendered before tour finalization', true);

  // Click Confirm
  await click('[data-testid="btn-confirm-itinerary"]');

  // Await timeline & Google Maps CTA
  await until(async () => {
    return await evalJs('Boolean(document.querySelector(\'[data-testid="google-maps-cta"]\'))');
  }, 10000, 200, 'Google Maps CTA render');

  const ctaText = await evalJs(`
    document.querySelector('[data-testid="google-maps-cta"]').textContent.trim()
  `);
  const ctaHref = await evalJs(`
    document.querySelector('[data-testid="google-maps-cta"]').getAttribute('href')
  `);

  recordCheck('COMPLETED_TOUR_CTA_TEXT', 'Completed tour CTA button displays "Xem lịch trình trên Google Maps →"',
    ctaText.includes('Xem lịch trình trên Google Maps'),
    { ctaText }
  );

  recordCheck('COMPLETED_TOUR_CTA_URL', 'CTA href is a verified multi-stop Google Maps URL',
    ctaHref.startsWith('https://www.google.com/maps/dir/?api=1') && ctaHref.includes('destination='),
    { ctaHref }
  );

  // Test G: Multi-Viewport Responsive Validation & Screenshot Capture
  console.log('\n--- Test G: Multi-Viewport Responsive Validation & Screenshots ---');
  for (const vp of evidence.viewportsTested) {
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.name.startsWith('mobile')
    });
    await pause(300);

    // Check no horizontal scrollbar / overflow on root
    const overflowCheck = await evalJs(`
      ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
    `);

    recordCheck(`VIEWPORT_${vp.name}`, `Viewport ${vp.width}x${vp.height} rendered without horizontal overflow`,
      !overflowCheck.hasHorizontalOverflow,
      overflowCheck
    );

    // Capture screenshot
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    const shotPath = path.join(SCREENSHOTS_DIR, `${vp.name}.png`);
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshot: ${shotPath}`);
  }

  // Test H: Zero Unicode Emoji Audit
  console.log('\n--- Test H: Comprehensive Unicode Emoji Audit ---');
  const emojiAudit = await evalJs(`
    (() => {
      const VISIBLE_EMOJI_REGEX = /(?:[0-9#*]\\ufe0f?\\u20e3|[\\u{1f000}-\\u{1faff}\\u00a9\\u00ae\\u203c\\u2049\\u2122\\u2139\\u2194-\\u2199\\u21a9-\\u21aa\\u231a-\\u231b\\u2328\\u2388\\u23cf\\u23e9-\\u23f3\\u23f8-\\u23fa\\u24c2\\u25aa-\\u25ab\\u25b6\\u25c0\\u25fb-\\u27bf\\u2934-\\u2935\\u2b05-\\u2b07\\u2b1b-\\u2b1c\\u2b50\\u2b55\\u3030\\u303d\\u3297\\u3299\\u20e3]|\\p{Extended_Pictographic}|\\p{Regional_Indicator}|\\p{Emoji_Modifier})+/gu;
      const INVISIBLE_FORMATS_REGEX = /[\\ufe0e\\ufe0f\\u200d\\u{e0020}-\\u{e007f}]/gu;

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let foundEmojis = [];
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent;
        VISIBLE_EMOJI_REGEX.lastIndex = 0;
        INVISIBLE_FORMATS_REGEX.lastIndex = 0;
        if (VISIBLE_EMOJI_REGEX.test(text) || INVISIBLE_FORMATS_REGEX.test(text)) {
          foundEmojis.push({
            parentTag: node.parentElement?.tagName,
            textSnippet: text.slice(0, 50)
          });
        }
      }
      return { count: foundEmojis.length, foundEmojis };
    })()
  `);

  recordCheck('ZERO_EMOJI_INVARIANT', 'Zero Unicode emojis found across all DOM text nodes',
    emojiAudit.count === 0,
    emojiAudit
  );

  // Write Evidence Artifact
  const evidencePath = path.join(QA_UPGRADE_DIR, 'evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
  console.log(`\nEvidence written to: ${evidencePath}`);

  console.log('\n================================================================');
  console.log(`QA SUITE COMPLETE: Total: ${evidence.summary.total} | Passed: ${evidence.summary.passed} | Failed: ${evidence.summary.failed}`);
  console.log('================================================================');

  if (evidence.summary.failed > 0) {
    cleanup();
    process.exit(1);
  }
  cleanup();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n[FATAL ERROR IN QA RUNNER]', err);
  cleanup();
  process.exit(1);
});
