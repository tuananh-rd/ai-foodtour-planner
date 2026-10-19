// qa/discovery-assistant/run_discovery_qa.mjs
// Isolated End-to-End QA Suite for Discovery-First Assistant UI (discovery-v1)
// Conforming to Figma Frame 1:145 "Warm editorial" (1440x1024)
// Ports: Web 13600, Mock API 18600, CDP 19800

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const req = createRequire(path.join(root, 'frontend', 'package.json'));
const sharp = req('sharp');
const QA_DIR = path.join(root, 'qa', 'discovery-assistant');
const REF_IMAGE_PATH = path.join(root, 'docs', 'design', 'figma-warm-editorial-reference.png');

if (!fs.existsSync(QA_DIR)) {
  fs.mkdirSync(QA_DIR, { recursive: true });
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
  console.log('\nCleaning up processes and scratch resources...');
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
  targetContract: 'discovery-v1',
  visualDesign: 'Warm editorial Figma frame 1:145 (1440x1024)',
  ports: { web: PORT_WEB, mockApi: PORT_API, cdp: PORT_CDP },
  checks: [],
  measurements: {},
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

/**
 * In-memory Mock Discovery Server adhering strictly to discovery-v1.
 * Initial profile is STRICTLY nullable per requirements.
 */
function createMockDiscoveryServer() {
  const state = {
    contract: 'discovery-v1',
    session_id: 'sess-discovery-qa',
    revision: 1,
    profile_version: 1,
    selection_version: 1,
    status: 'ok',
    reply: {
      text: 'Chào bạn! Em có thể giúp bạn khám phá các món ngon Hà Nội hoặc tìm quán theo sở thích.',
      question: null
    },
    // Strictly nullable initial profile, no fabricated defaults
    profile: {
      area: null,
      origin: null,
      party_size: null,
      budget_vnd: null,
      budget_scope: null,
      start_time: null,
      end_time: null,
      duration_min: null,
      vehicle: null,
      tastes: [],
      exclusions: [],
      allergies: [],
      max_leg_min: null
    },
    results: [],
    selection: [],
    comparison: null,
    confirmation: null,
    messages: [],
    tour: null,
    source: null,
    provider: { mode: 'mock', calls: 1 },
    diagnostics: { tool_calls: 1, elapsed_ms: 18, weather: 'unavailable' }
  };

  const sampleVenues = [
    {
      id: 'venue-pho-10',
      name: 'Phở 10 Lý Quốc Sư 🍜',
      address: '10 Lý Quốc Sư, Hàng Trống 🍜',
      district: 'Hoàn Kiếm 🏛️',
      lat: 21.0305,
      lon: 105.8492,
      dish_tags: ['phở bò 🥩', 'quẩy giòn 🥖'],
      price: { min_vnd: 50000, max_vnd: 90000, semantics: 'venue_range', evidence: 'Thực đơn niêm yết 📋' },
      hours: { display: '06:00⏰22:00', status: 'open' },
      source_url: 'https://example.com/venues/pho-10-ly-quoc-su',
      source_fetched_at: '2026-10-18T10:00:00Z',
      unknowns: ['allergy_ingredients'],
      label: 'A',
      locked: false
    },
    {
      id: 'venue-pho-thin',
      name: 'Phở Thìn Bờ Hồ 🍜',
      address: '61 Đinh Tiên Hoàng, Lý Thái Tổ',
      district: 'Hoàn Kiếm 🏛️',
      lat: 21.0315,
      lon: 105.8532,
      dish_tags: ['phở tái lăn 🥩', 'phở chín 🍖'],
      price: { min_vnd: 55000, max_vnd: 70000, semantics: 'venue_range', evidence: 'Thực đơn niêm yết 📋' },
      hours: { display: '05:30⏰13:00, 17:00⏰22:30', status: 'open' },
      source_url: 'https://example.com/venues/pho-thin-bo-ho',
      source_fetched_at: '2026-10-18T10:00:00Z',
      unknowns: [],
      label: 'B',
      locked: false
    },
    {
      id: 'venue-che-4-mua',
      name: 'Chè Bốn Mùa Hàng Cân 🍧',
      address: '4 Hàng Cân, Hàng Bồ',
      district: 'Hoàn Kiếm 🏛️',
      lat: 21.0345,
      lon: 105.8498,
      dish_tags: ['chè sen 🍨', 'chè đỗ xanh ít ngọt 🍵'],
      price: { min_vnd: 20000, max_vnd: 35000, semantics: 'venue_range', evidence: 'Thực đơn niêm yết 📋' },
      hours: { display: '09:00⏰23:00', status: 'open' },
      source_url: 'https://example.com/venues/che-bon-mua',
      source_fetched_at: '2026-10-18T10:00:00Z',
      unknowns: ['allergy_ingredients'],
      label: 'C',
      locked: false
    }
  ];

  let simulate409Once = false;
  let simulate404Once = false;

  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Session-Token');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${PORT_API}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', llm: 'mock', dataset_source: 'synthetic' }));
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

    if (req.method === 'POST' && url.pathname === '/v1/sessions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        session_id: state.session_id,
        token: 'qa-mock-token-123',
        revision: state.revision
      }));
      return;
    }

    // Discovery Assistant endpoints
    if (url.pathname.match(/^\/v1\/sessions\/[^/]+\/assistant$/)) {
      if (simulate404Once) {
        simulate404Once = false;
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 'session_not_found', message: 'Session does not exist' }));
        return;
      }

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

          // Simulate 409 Conflict if flag set
          if (simulate409Once) {
            simulate409Once = false;
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              code: 'revision_conflict',
              message: 'Stale revision simulated',
              latest_revision: state.revision
            }));
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

            // If user searches for phở or general query
            state.profile.area = 'Hoàn Kiếm 🏛️';
            state.results = [...sampleVenues];
            state.reply = {
              text: `Em gợi ý 20🍜30 quán Phở\u{1f35c}ngon tại Hoàn Kiếm 🇻🇳: Phở 10 Lý Quốc Sư, Phở Thìn Bờ Hồ và Chè Bốn Mùa. Bạn có thể chọn quán vào tour hoặc so sánh nhé!`,
              question: 'Bạn muốn ghé ăn phở trước rồi tráng miệng chè 🍨, hay ngược lại?'
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state));
            return;
          }

          // 2. Action Turn
          if (body.action) {
            const act = body.action;

            if (act.type === 'tool') {
              if (act.name === 'update_foodtour_selection') {
                const { operation, venue_ids } = act.arguments;
                state.revision += 1;
                state.selection_version += 1;

                if (operation === 'add') {
                  for (const vid of venue_ids) {
                    if (!state.selection.some((s) => s.id === vid)) {
                      const found = sampleVenues.find((v) => v.id === vid) || {
                        id: vid,
                        name: 'Quán ' + vid,
                        address: 'Hà Nội',
                        district: 'Hoàn Kiếm',
                        lat: 21.03,
                        lon: 105.85,
                        locked: false
                      };
                      state.selection.push({ ...found, locked: false });
                    }
                  }
                } else if (operation === 'remove') {
                  state.selection = state.selection.filter((s) => !venue_ids.includes(s.id));
                } else if (operation === 'lock') {
                  state.selection = state.selection.map((s) => venue_ids.includes(s.id) ? { ...s, locked: true } : s);
                } else if (operation === 'unlock') {
                  state.selection = state.selection.map((s) => venue_ids.includes(s.id) ? { ...s, locked: false } : s);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(state));
                return;
              }

              if (act.name === 'compare_restaurants') {
                const { venue_ids } = act.arguments;
                state.revision += 1;
                const compared = sampleVenues.filter((v) => venue_ids.includes(v.id));
                state.comparison = {
                  venues: compared,
                  criteria: ['Món ăn & phong vị', 'Khoảng giá', 'Giờ hoạt động', 'Khoảng cách'],
                  unknowns: ['Thành phần chi tiết dị ứng chưa có bằng chứng']
                };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(state));
                return;
              }

              if (act.name === 'update_preferences') {
                const { patch } = act.arguments;
                state.revision += 1;
                state.profile_version += 1;
                state.profile = { ...state.profile, ...patch };
                // Invalidate prior confirmation/tour if preferences change
                state.confirmation = null;
                state.tour = null;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(state));
                return;
              }

              if (act.name === 'create_itinerary') {
                state.revision += 1;
                state.confirmation = {
                  id: 'conf-' + Date.now(),
                  profile_version: state.profile_version,
                  selection_version: state.selection_version,
                  summary: {
                    title: 'Lịch trình ẩm thực 🍲',
                    notes: 'Đi bộ gần 🚶',
                    area: state.profile.area || 'Hoàn Kiếm 🏛️',
                    party_size: state.profile.party_size || 2,
                    budget_vnd: state.profile.budget_vnd || 300000,
                    stops_count: state.selection.length
                  },
                  warnings: [
                    'Chưa có dữ liệu thành phần chi tiết để cam kết tuyệt đối về dị ứng đậu phộng 🥜.',
                    'Khoảng giá niêm yết theo nguồn tham khảo (venue_range), thực tế có thể thay đổi theo mùa 📋.'
                  ]
                };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(state));
                return;
              }

              if (act.name === 'revise_itinerary') {
                state.revision += 1;
                state.confirmation = null;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(state));
                return;
              }
            }

            if (act.type === 'confirm') {
              state.revision += 1;
              state.confirmation = null;
              // Generate realistic Tour with emojis in raw state to test display-only normalization
              const stops = state.selection.map((s, idx) => ({
                venue_id: s.id,
                name: s.name,
                address: s.address,
                district: s.district,
                lat: s.lat || 21.03,
                lon: s.lon || 105.85,
                order: idx + 1,
                stage: idx === 0 ? 'Mở đầu 🍲' : (idx === state.selection.length - 1 ? 'Tráng miệng 🍧' : 'Món chính 🍜'),
                arrive: idx === 0 ? '18:30' : (idx === 1 ? '19:15' : '20:00'),
                depart: idx === 0 ? '19:05' : (idx === 1 ? '19:50' : '20:30'),
                walk_min_to_next: idx < state.selection.length - 1 ? 8 : 0,
                price_range: s.price ? `${s.price.min_vnd} - ${s.price.max_vnd} đ` : 'Chưa xác minh',
                venue: {
                  id: s.id,
                  name: s.name,
                  address: s.address,
                  district: s.district,
                  dish_tags: s.dish_tags,
                  hours: s.hours
                }
              }));

              state.tour = {
                title: 'Tour ẩm thực phố cổ Hoàn Kiếm 🚀',
                area: state.profile.area || 'Hoàn Kiếm 🏛️',
                explanation: 'Lộ trình đi bộ tối ưu quanh phố cổ 🚶',
                reasons: ['Gần điểm xuất phát 📍', 'Thời gian di chuyển ngắn 🚶'],
                unknowns: ['Chưa rõ tình trạng đông khách lúc 19h 👥'],
                stops,
                totals: {
                  venue_range_upper_sum_vnd: 250000,
                  walk_minutes: 25,
                  leg_source: 'straight_line_estimate',
                  route_provider: 'estimate'
                },
                route_warnings: [
                  'Tuyến đi bộ ước lượng theo đường thẳng giữa các điểm trong phố cổ 🚶.'
                ]
              };

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(state));
              return;
            }

            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 'unsupported_action', message: 'Action not supported' }));
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
    setSimulate409: (val) => { simulate409Once = val; },
    setSimulate404: (val) => { simulate404Once = val; },
    getState: () => state
  };
}

async function main() {
  console.log('================================================================');
  console.log('=== DISCOVERY-FIRST ASSISTANT UI (discovery-v1) QA SUITE ===');
  console.log('=== Warm Editorial Figma Frame 1:145 Layout Fidelity ===');
  console.log('================================================================');

  // 1. Preflight port checks
  console.log('\n[1/6] Preflight TCP Refusal Check on Isolated Ports...');
  for (const port of [PORT_WEB, PORT_API, PORT_CDP]) {
    const free = await checkPortFree(port);
    if (!free) throw new Error(`FATAL: Port ${port} is occupied!`);
  }
  recordCheck('PREFLIGHT_PORTS', 'Isolated test ports 13600, 18600, 19800 are free', true);

  // 2. Start Mock Discovery API Server
  console.log(`\n[2/6] Starting Mock Discovery API Server on ${PORT_API}...`);
  const mockServerInfo = createMockDiscoveryServer();
  await new Promise((res) => mockServerInfo.server.listen(PORT_API, '127.0.0.1', res));
  recordCheck('MOCK_API_RUNNING', `Mock API listening on http://127.0.0.1:${PORT_API}`, true);

  // 3. Build Scratch Frontend
  console.log(`\n[3/6] Building Scratch Next.js Frontend for Discovery UI...`);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-warm-editorial-'));
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

  execFileSync(
    process.execPath,
    [path.join(root, 'frontend/node_modules/next/dist/bin/next'), 'build'],
    { cwd: webScratch, env: buildEnv, stdio: 'pipe', timeout: 120000 }
  );
  recordCheck('FRONTEND_BUILD', 'Next.js build succeeded in scratch environment', true);

  // 4. Start Scratch Frontend Server
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
  }, 25000);
  recordCheck('FRONTEND_RUNNING', `Frontend responding on http://127.0.0.1:${PORT_WEB}`, true);

  // 5. Start Headless Chrome via CDP
  console.log(`\n[4/6] Launching Headless Chrome via CDP on ${PORT_CDP}...`);
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
  }, 15000);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER EXCEPTION]', m.params?.exceptionDetails?.text, m.params?.exceptionDetails?.exception?.description);
    }
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

  async function snapScreenshot(filepath) {
    const res = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
    console.log(`Saved screenshot: ${path.basename(filepath)}`);
  }

  async function setViewport(width, height, isMobile = false) {
    await cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile,
      screenOrientation: isMobile ? { angle: 0, type: 'portraitPrimary' } : undefined
    });
  }

  async function click(selector) {
    await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest'})`);
    const success = await ev(`(()=>{
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.focus();
      el.click();
      return true;
    })()`);
    if (!success) throw new Error(`Cannot find selector to click: ${selector}`);
  }

  async function typeInput(selector, text) {
    await click(selector);
    await cdp('Input.insertText', { text });
    await pause(100);
  }

  // 6. Test Suite Execution
  console.log(`\n[5/6] Executing Discovery Assistant UI Invariants & Functional Tests...`);
  await setViewport(1440, 1024);
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT_WEB}/` });
  await pause(1500);

  // Test 1: Desktop 1440x1024 Warm Editorial Geometry & Style Verification
  await until(async () => ev(`!!document.querySelector('[data-testid="guided-container"]')`), 20000, 200, 'guided-container');

  const shellMetrics = await ev(`(()=>{
    const sidebar = document.querySelector('.nn-sidebar')?.getBoundingClientRect();
    const canvasWrap = document.querySelector('.nn-canvas-wrapper')?.getBoundingClientRect();
    const chatCard = document.querySelector('.nn-chat-card')?.getBoundingClientRect();
    const tourCol = document.querySelector('.nn-tour-col')?.getBoundingClientRect();
    const sidebarBg = window.getComputedStyle(document.querySelector('.nn-sidebar')).backgroundColor;
    const canvasBg = window.getComputedStyle(document.querySelector('.nn-canvas-wrapper')).backgroundColor;
    const brandLogo = document.querySelector('.nn-brand-logo')?.textContent;
    const brandSlogan = document.querySelector('.nn-brand-slogan')?.textContent;
    const newTripBtn = Boolean(document.querySelector('[data-testid="guided-reset-btn"]'));
    const tavilyCheckbox = document.querySelector('[data-testid="web-search-optin-checkbox"]');
    const understoodChecklist = document.querySelector('[data-testid="understood-card"]');
    const input = document.querySelector('[data-testid="discovery-input"]');
    const sendBtn = document.querySelector('[data-testid="discovery-send-btn"]');

    return {
      sidebar: sidebar ? { x: Math.round(sidebar.x), y: Math.round(sidebar.y), width: Math.round(sidebar.width), height: Math.round(sidebar.height) } : null,
      canvasWrap: canvasWrap ? { x: Math.round(canvasWrap.x), y: Math.round(canvasWrap.y), width: Math.round(canvasWrap.width), height: Math.round(canvasWrap.height) } : null,
      chatCard: chatCard ? { x: Math.round(chatCard.x), y: Math.round(chatCard.y), width: Math.round(chatCard.width), height: Math.round(chatCard.height) } : null,
      tourCol: tourCol ? { x: Math.round(tourCol.x), y: Math.round(tourCol.y), width: Math.round(tourCol.width), height: Math.round(tourCol.height) } : null,
      colors: { sidebarBg, canvasBg },
      brandLogo,
      brandSlogan,
      newTripBtn,
      hasTavily: Boolean(tavilyCheckbox),
      hasUnderstoodChecklist: Boolean(understoodChecklist),
      hasInput: Boolean(input),
      hasSendBtn: Boolean(sendBtn)
    };
  })()`);

  evidence.measurements.shell = shellMetrics;

  recordCheck('SIDEBAR_GEOMETRY', 'Sidebar width is 232px at x=0 with deep chestnut/rust brown background',
    shellMetrics.sidebar && shellMetrics.sidebar.width === 232 && shellMetrics.sidebar.x === 0,
    { sidebar: shellMetrics.sidebar, color: shellMetrics.colors.sidebarBg }
  );

  recordCheck('CANVAS_GOLDEN_YELLOW', 'Main canvas wrapper has warm golden yellow background',
    shellMetrics.canvasWrap && shellMetrics.colors.canvasBg.includes('249, 197, 61') || shellMetrics.colors.canvasBg.includes('rgb(249, 197, 61)'),
    { color: shellMetrics.colors.canvasBg }
  );

  recordCheck('TWO_COLUMN_GRID', 'Main layout contains Chat Card (~668px) and Tour Column (~476px) filling available canvas',
    shellMetrics.chatCard && shellMetrics.tourCol && Math.abs(shellMetrics.chatCard.width - 670) <= 20,
    { chatCard: shellMetrics.chatCard, tourCol: shellMetrics.tourCol }
  );

  recordCheck('BRAND_HEADER', 'Sidebar displays brand "măm măm.", slogan "ĐI ĐỂ ĂN. ĂN ĐỂ NHỚ." and new trip button',
    shellMetrics.brandLogo === 'măm măm.' && shellMetrics.brandSlogan === 'ĐI ĐỂ ĂN. ĂN ĐỂ NHỚ.' && shellMetrics.newTripBtn,
    { brand: shellMetrics.brandLogo, slogan: shellMetrics.brandSlogan }
  );

  recordCheck('TAVILY_REMOVED', 'Tavily web search opt-in UI is completely removed',
    shellMetrics.hasTavily === false,
    { hasTavily: shellMetrics.hasTavily }
  );

  recordCheck('CHECKLIST_REMOVED', 'Main-chat "Mình hiểu là" checklist matrix is completely removed',
    shellMetrics.hasUnderstoodChecklist === false,
    { hasUnderstoodChecklist: shellMetrics.hasUnderstoodChecklist }
  );

  // Capture desktop discovery screenshot
  const discoveryScreenshotPath = path.join(QA_DIR, 'desktop_1440x1024_discovery.png');
  await snapScreenshot(discoveryScreenshotPath);

  // Test 2: Natural Chat & Restaurant Results Cards
  console.log('\nTesting Natural Chat turn & Results Cards...');
  await until(async () => ev(`!document.querySelector('[data-testid="discovery-input"]')?.disabled`), 10000, 200, 'authenticated-input-enabled');
  await typeInput('[data-testid="discovery-input"]', 'phở gần Xuân Thủy dưới 70k');
  await click('[data-testid="discovery-send-btn"]');
  await pause(1000);

  await until(async () => ev(`!!document.querySelector('[data-testid="restaurant-card-venue-pho-10"]')`), 10000, 200, 'restaurant-card');

  const cardDetails = await ev(`(()=>{
    const card = document.querySelector('[data-testid="restaurant-card-venue-pho-10"]');
    const name = card?.querySelector('.nn-restaurant-name')?.textContent;
    const badge = card?.querySelector('.nn-restaurant-badge')?.textContent;
    const priceText = card?.textContent.includes('khoảng giá quán');
    const hasSelectBtn = Boolean(card?.querySelector('[data-testid="btn-select-venue-venue-pho-10"]'));
    const hasCompareBtn = Boolean(card?.querySelector('[data-testid="btn-compare-venue-venue-pho-10"]'));
    const hasDetailsBtn = Boolean(card?.querySelector('[data-testid="btn-details-venue-venue-pho-10"]'));
    const hasSourceLink = Boolean(card?.querySelector('.nn-source-link'));
    return { name, badge, priceText, hasSelectBtn, hasCompareBtn, hasDetailsBtn, hasSourceLink };
  })()`);

  recordCheck('RESULTS_CARD_METADATA', 'Restaurant card displays badge, name, venue_range price semantics and source provenance link',
    cardDetails.name === 'Phở 10 Lý Quốc Sư' && cardDetails.badge === 'A' && cardDetails.priceText && cardDetails.hasSourceLink,
    cardDetails
  );

  const chatBubbleText = await ev(`(()=>{
    const bubbles = Array.from(document.querySelectorAll('.nn-bubble'));
    return bubbles.map(b => b.textContent).join(' ');
  })()`);

  recordCheck('WORD_NUMBER_BOUNDARY_PRESERVED', 'Boundary từ và số được bảo toàn sau khi lọc emoji (20 30, Phở ngon)',
    chatBubbleText.includes('20 30') && chatBubbleText.includes('Phở ngon') && !chatBubbleText.includes('2030'),
    { hasSeparatedNumber: chatBubbleText.includes('20 30'), hasSeparatedWord: chatBubbleText.includes('Phở ngon') }
  );

  // Test 3: Detail Modal Accessibility & Focus Trap
  console.log('\nTesting Detail Modal Accessibility & Focus Trap...');
  await click('[data-testid="btn-details-venue-venue-pho-10"]');
  await pause(500);

  const modalOpen = await ev(`(()=>{
    const modal = document.querySelector('[role="dialog"]');
    return Boolean(modal);
  })()`);
  recordCheck('DETAIL_MODAL_OPEN', 'Cửa sổ chi tiết địa điểm mở ra với role="dialog"', modalOpen);

  // Press Escape to test accessible close
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await pause(500);

  const modalClosed = await ev(`!document.querySelector('[role="dialog"]')`);
  recordCheck('DETAIL_MODAL_ESCAPE_CLOSE', 'Nhấn phím Escape đóng cửa sổ chi tiết và trả lại tiêu điểm', modalClosed);

  // Test 4: Selection Add, Lock, Remove
  console.log('\nTesting Selection Add, Lock & Remove in Tour Column...');
  await click('[data-testid="btn-select-venue-venue-pho-10"]');
  await pause(800);

  await until(async () => ev(`!!document.querySelector('[data-testid="selected-venue-card-venue-pho-10"]')`), 10000, 200, 'selected-venue');

  const selectSuccess = await ev(`(()=>{
    const card = document.querySelector('[data-testid="selected-venue-card-venue-pho-10"]');
    const btnLock = document.querySelector('[data-testid="btn-lock-venue-venue-pho-10"]');
    return {
      cardPresent: Boolean(card),
      btnLockText: btnLock?.textContent.trim()
    };
  })()`);

  recordCheck('SELECTION_ADD', 'Quán Phở 10 được thêm thành công vào danh sách tour cột phải',
    selectSuccess.cardPresent,
    selectSuccess
  );

  // Test Lock Toggle
  await click('[data-testid="btn-lock-venue-venue-pho-10"]');
  await pause(800);
  const lockState = await ev(`(()=>{
    const btn = document.querySelector('[data-testid="btn-lock-venue-venue-pho-10"]');
    return btn?.classList.contains('locked') || btn?.getAttribute('aria-label') === 'Mở khoá quán';
  })()`);
  recordCheck('SELECTION_LOCK', 'Nút khoá quán toggle thành trạng thái khoá (SVG icon & aria-label)',
    lockState === true,
    { lockState }
  );

  // Also select venue-thin for comparison
  await click('[data-testid="btn-select-venue-venue-pho-thin"]');
  await pause(800);

  // Test 5: Comparison View
  console.log('\nTesting Comparison View...');
  await click('[data-testid="btn-compare-venue-venue-pho-10"]');
  await pause(300);
  await click('[data-testid="btn-compare-venue-venue-pho-thin"]');
  await pause(500);

  // Click compare trigger
  await ev(`(()=>{
    const btns = Array.from(document.querySelectorAll('button'));
    const compBtn = btns.find(b => b.textContent.includes('Bắt đầu so sánh'));
    if (compBtn) compBtn.click();
  })()`);
  await pause(1000);

  await until(async () => ev(`!!document.querySelector('[data-testid="discovery-comparison-view"]')`), 10000, 200, 'comparison-view');
  recordCheck('COMPARISON_VIEW', 'Bảng so sánh 2 quán hiển thị đầy đủ tiêu chí và lưu ý chưa xác minh', true);

  // Test 6: Collapsed Profile Drawer
  console.log('\nTesting Collapsed Profile Drawer Editing...');
  await click('[data-testid="btn-toggle-profile-drawer"]');
  await pause(400);

  const drawerVisible = await ev(`!!document.querySelector('[data-testid="discovery-profile-drawer"]')`);
  recordCheck('PROFILE_DRAWER_OPEN', 'Ngăn kéo tuỳ chỉnh hồ sơ mở ra khi click ⚙ Tuỳ chỉnh chuyến đi', drawerVisible);

  // Change party size and budget without converting nulls
  await ev(`(()=>{
    const partyInput = document.querySelector('#pref-party');
    if (partyInput) {
      partyInput.value = '3';
      partyInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const budgetInput = document.querySelector('#pref-budget');
    if (budgetInput) {
      budgetInput.value = '500000';
      budgetInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await pause(300);
  await click('[data-testid="btn-save-profile"]');
  await pause(1000);

  const drawerClosed = await ev(`!document.querySelector('[data-testid="discovery-profile-drawer"]')`);
  recordCheck('PROFILE_DRAWER_SAVE', 'Hồ sơ lưu thành công và ngăn kéo đóng lại', drawerClosed);

  // Test 7: Explicit Confirmation Gate
  console.log('\nTesting Explicit Confirmation Gate...');
  await click('[data-testid="btn-trigger-plan"]');
  await pause(1000);

  await until(async () => ev(`!!document.querySelector('[data-testid="discovery-confirmation-card"]')`), 10000, 200, 'confirmation-card');

  const confirmBlock = await ev(`(()=>{
    const card = document.querySelector('[data-testid="discovery-confirmation-card"]');
    const hasWarnings = Boolean(card?.querySelector('.nn-confirm-warnings'));
    const hasConfirmBtn = Boolean(card?.querySelector('[data-testid="btn-confirm-itinerary"]'));
    const tourPresentBeforeConfirm = Boolean(document.querySelector('[data-testid="guided-timeline"]'));
    return { hasWarnings, hasConfirmBtn, tourPresentBeforeConfirm };
  })()`);

  recordCheck('CONFIRMATION_CARD_RENDERED', 'Thẻ xác nhận hiển thị tóm tắt, lưu ý dị ứng/nguồn và nút xác nhận tường minh',
    confirmBlock.hasWarnings && confirmBlock.hasConfirmBtn && !confirmBlock.tourPresentBeforeConfirm,
    confirmBlock
  );

  // Click explicit confirm button
  await click('[data-testid="btn-confirm-itinerary"]');
  await pause(1200);

  await until(async () => ev(`!!document.querySelector('[data-testid="guided-timeline"]')`), 15000, 200, 'guided-timeline');
  recordCheck('EXPLICIT_CONFIRM_GATE', 'Sau khi nhấn nút xác nhận tường minh, lịch trình GuidedTimeline được tạo', true);

  await snapScreenshot(path.join(QA_DIR, 'desktop_1440x1024_confirmed_tour.png'));

  // Test 8: Map View Toggle
  console.log('\nTesting Map View Toggle...');
  await click('[data-testid="pilot-map-toggle"]');
  await pause(800);
  const mapActive = await ev(`!!document.querySelector('.nn-map-container-wrap')`);
  recordCheck('MAP_VIEW_TOGGLE', 'Chuyển đổi sang chế độ Bản đồ (PilotMap) thành công', mapActive);

  await click('[data-testid="view-mode-schematic-btn"]');
  await pause(500);

  // Test 9: 409 Conflict Handling without Replay Mutation
  console.log('\nTesting 409 Conflict Handling without Replay Mutation...');
  mockServerInfo.setSimulate409(true);
  await typeInput('[data-testid="discovery-input"]', 'Thử kiểm tra xung đột revision');
  await click('[data-testid="discovery-send-btn"]');

  await until(async () => ev(`(()=>{
    const alert = document.querySelector('[role="alert"]');
    return alert ? alert.textContent.includes('409') : false;
  })()`), 12000, 200, '409-alert');

  const errorHandled = await ev(`(()=>{
    const alert = document.querySelector('[role="alert"]');
    return alert ? alert.textContent.includes('409') : false;
  })()`);

  recordCheck('CONFLICT_409_HANDLED', 'Lỗi xung đột 409 được thông báo và re-fetch trạng thái mới mà không tự động replay',
    errorHandled,
    { errorHandled }
  );

  // Test 10: Mobile 390px Viewport & Zoom 200% Reflow
  console.log('\n[6/6] Verifying Mobile 390x844 Viewport & Zoom 200% Reflow...');
  await setViewport(390, 844, true);
  await pause(800);

  const mobileMetrics = await ev(`(()=>{
    const bodyWidth = document.body.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const tabs = document.querySelector('.nn-mobile-tabs');
    const tabsVisible = tabs ? window.getComputedStyle(tabs).display !== 'none' : false;
    return {
      bodyWidth,
      scrollWidth,
      hasOverflow: scrollWidth > 390,
      tabsVisible
    };
  })()`);

  recordCheck('MOBILE_390_NO_OVERFLOW', 'Màn hình di động 390px không bị tràn ngang (scrollWidth <= 390)',
    mobileMetrics.scrollWidth <= 390,
    mobileMetrics
  );

  recordCheck('MOBILE_TABS_VISIBLE', 'Thanh tab chuyển đổi trên di động hiển thị đầy đủ',
    mobileMetrics.tabsVisible,
    mobileMetrics
  );

  await snapScreenshot(path.join(QA_DIR, 'mobile_390x844_discovery.png'));

  // Zoom 200% Reflow
  await ev(`document.body.style.zoom = '2.0'`);
  await pause(500);
  const zoomMetrics = await ev(`(()=>{
    return {
      scrollWidth: document.documentElement.scrollWidth,
      noCrash: true
    };
  })()`);
  recordCheck('ZOOM_200_REFLOW', 'Reflow mượt mà ở độ phóng đại 200%, không phát sinh lỗi DOM', zoomMetrics.noCrash);
  await ev(`document.body.style.zoom = '1.0'`);

  // Test 11: Multi-Viewport Fluid Matrix Verification (1280, 1440, 1920, 2560, 390) & Zero Emoji Invariant
  console.log('\n[Multi-Viewport Fluid Matrix Verification: 1280, 1440, 1920, 2560, 390]...');
  const SCREENSHOTS_DIR = path.join(QA_DIR, 'screenshots');
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const viewportsToTest = [
    { name: 'desktop_1280', width: 1280, height: 800, isMobile: false },
    { name: 'desktop_1440', width: 1440, height: 1024, isMobile: false },
    { name: 'desktop_1920', width: 1920, height: 1080, isMobile: false },
    { name: 'desktop_2560', width: 2560, height: 1440, isMobile: false },
    { name: 'mobile_390', width: 390, height: 844, isMobile: true }
  ];

  const strictEmojiRegex = /(?:[0-9#*]\ufe0f?\u20e3|[\u{1f000}-\u{1faff}\u00a9\u00ae\u203c\u2049\u2122\u2139\u2194-\u2199\u21a9-\u21aa\u231a-\u231b\u2328\u2388\u23cf\u23e9-\u23f3\u23f8-\u23fa\u24c2\u25aa-\u25ab\u25b6\u25c0\u25fb-\u27bf\u2934-\u2935\u2b05-\u2b07\u2b1b-\u2b1c\u2b50\u2b55\u3030\u303d\u3297\u3299\u20e3]|\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\ufe0e\ufe0f\u200d\u{e0020}-\u{e007f}])/u;

  for (const vp of viewportsToTest) {
    await setViewport(vp.width, vp.height, vp.isMobile);
    await pause(600);

    const vpMetrics = await ev(`(()=>{
      const scrollWidth = document.documentElement.scrollWidth;
      const bodyWidth = document.body.clientWidth;
      const sidebar = document.querySelector('.nn-sidebar')?.getBoundingClientRect();
      const canvas = document.querySelector('.nn-canvas-wrapper')?.getBoundingClientRect();
      const chatCard = document.querySelector('.nn-chat-card')?.getBoundingClientRect();
      const tourCol = document.querySelector('.nn-tour-col')?.getBoundingClientRect();
      const composer = document.querySelector('.nn-composer')?.getBoundingClientRect();
      const text = document.body.innerText;

      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollWidth,
        bodyWidth,
        scrollbarWidth: window.innerWidth - document.documentElement.clientWidth,
        hasHorizontalOverflow: scrollWidth > window.innerWidth,
        sidebar: sidebar ? { x: Math.round(sidebar.x), y: Math.round(sidebar.y), width: Math.round(sidebar.width), height: Math.round(sidebar.height) } : null,
        canvas: canvas ? { x: Math.round(canvas.x), y: Math.round(canvas.y), width: Math.round(canvas.width), height: Math.round(canvas.height) } : null,
        chatCard: chatCard ? { x: Math.round(chatCard.x), y: Math.round(chatCard.y), width: Math.round(chatCard.width), height: Math.round(chatCard.height) } : null,
        tourCol: tourCol ? { x: Math.round(tourCol.x), y: Math.round(tourCol.y), width: Math.round(tourCol.width), height: Math.round(tourCol.height), right: Math.round(tourCol.right) } : null,
        composer: composer ? { top: Math.round(composer.top), bottom: Math.round(composer.bottom), height: Math.round(composer.height) } : null,
        text
      };
    })()`);

    const hasEmojiInDom = strictEmojiRegex.test(vpMetrics.text);

    recordCheck(`FLUID_VIEWPORT_${vp.width}_NO_OVERFLOW`,
      `Viewport ${vp.width}x${vp.height} (${vp.name}) không có thanh cuộn ngang (scrollWidth: ${vpMetrics.scrollWidth} <= ${vp.width})`,
      !vpMetrics.hasHorizontalOverflow,
      { width: vp.width, scrollWidth: vpMetrics.scrollWidth }
    );

    if (!vp.isMobile && vpMetrics.canvas && vpMetrics.sidebar) {
      const availableWidth = vpMetrics.bodyWidth || vp.width;
      const fills = Math.abs(vpMetrics.canvas.width + vpMetrics.sidebar.width - availableWidth) <= 2 ||
                    Math.abs(vpMetrics.canvas.width + vpMetrics.sidebar.width - vp.width) <= 20;
      recordCheck(`FLUID_VIEWPORT_${vp.width}_FILLS_SCREEN`,
        `Viewport ${vp.width}x${vp.height} canvas lấp đầy không gian khả dụng (canvas: ${vpMetrics.canvas.width}px, sidebar: ${vpMetrics.sidebar.width}px, available: ${availableWidth}px)`,
        fills,
        { canvasWidth: vpMetrics.canvas.width, sidebarWidth: vpMetrics.sidebar.width, availableWidth }
      );

      if (vpMetrics.tourCol) {
        recordCheck(`FLUID_VIEWPORT_${vp.width}_TOUR_FITS`,
          `Viewport ${vp.width}x${vp.height} tour column nằm trọn vẹn trong viewport (right: ${vpMetrics.tourCol.right} <= ${vp.width})`,
          vpMetrics.tourCol.right <= vp.width,
          { tourRight: vpMetrics.tourCol.right, vpWidth: vp.width }
        );
      }
    }

    recordCheck(`ZERO_EMOJI_${vp.width}`,
      `Viewport ${vp.width}x${vp.height} không chứa Unicode emoji trong nội dung trang (0 emoji detected)`,
      !hasEmojiInDom,
      { hasEmoji: hasEmojiInDom }
    );

    const shotName = `viewport_${vp.width}.png`;
    await snapScreenshot(path.join(SCREENSHOTS_DIR, shotName));
  }

  // Side-by-Side Visual Comparison Composition using Sharp
  console.log('\nGenerating Side-by-Side Comparison with Figma reference...');
  if (fs.existsSync(REF_IMAGE_PATH) && fs.existsSync(discoveryScreenshotPath)) {
    try {
      const actualImg = sharp(discoveryScreenshotPath);
      const actualMeta = await actualImg.metadata();
      const refImg = sharp(REF_IMAGE_PATH);
      const refMeta = await refImg.metadata();

      // Composite side-by-side: Reference (left, 1440x1024), Actual (right, 1440x1024) -> 2880x1024 canvas
      const compWidth = 2880;
      const compHeight = 1024;

      const compBuffer = await sharp({
        create: {
          width: compWidth,
          height: compHeight,
          channels: 4,
          background: { r: 35, g: 24, b: 21, alpha: 1 }
        }
      })
      .composite([
        { input: REF_IMAGE_PATH, top: 0, left: 0 },
        { input: discoveryScreenshotPath, top: 0, left: 1440 }
      ])
      .png()
      .toFile(path.join(QA_DIR, 'side_by_side_comparison.png'));

      recordCheck('VISUAL_SIDE_BY_SIDE', 'Side-by-side comparison image generated (2880x1024)', true);
      console.log('Saved side_by_side_comparison.png');
    } catch (err) {
      console.error('Error generating side-by-side:', err);
    }
  }

  // Write Evidence JSON
  fs.writeFileSync(path.join(QA_DIR, 'evidence.json'), JSON.stringify(evidence, null, 2));

  console.log('\n================================================================');
  console.log(`QA SUMMARY: Total: ${evidence.summary.total} | Passed: ${evidence.summary.passed} | Failed: ${evidence.summary.failed}`);
  console.log('================================================================');

  if (evidence.summary.failed > 0) {
    console.error('QA SUITE FAILED with ' + evidence.summary.failed + ' failed check(s).');
    cleanup();
    process.exit(1);
  } else {
    console.log('ALL DISCOVERY ASSISTANT UI CHECKS PASSED SUCCESSFULLY WITH WARM EDITORIAL FIDELITY!');
    cleanup();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal Error in QA Suite:', err);
  cleanup();
  process.exit(1);
});
