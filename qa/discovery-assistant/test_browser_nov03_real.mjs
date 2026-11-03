/**
 * qa/discovery-assistant/test_browser_nov03_real.mjs
 *
 * Real Browser QA Suite for Discovery Assistant & OpenStreetMap Upgrade
 * Executed on Port 3350 (served build with commit 01c1508)
 * CDP Port: 19795 (designated by Coordinator)
 * Safety Guard: Refuses execution if 8250 reports live LLM provider.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const WEB_URL = process.env.DISCOVERY_WEB || 'http://127.0.0.1:3350';
const API_URL = process.env.DISCOVERY_API || 'http://127.0.0.1:8250';
const CDP_PORT = Number(process.env.DISCOVERY_CDP || 19795);
const OUT_DIR = path.resolve('docs/reports/nov03-frontend-qa');

fs.mkdirSync(OUT_DIR, { recursive: true });

const evidence = {
  testedAt: new Date().toISOString(),
  webUrl: WEB_URL,
  apiUrl: API_URL,
  cdpPort: CDP_PORT,
  browser: null,
  checks: [],
  screenshots: []
};

function record(name, pass, note = {}) {
  evidence.checks.push({
    name,
    result: pass ? 'PASS' : 'FAIL',
    ...note
  });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}`, Object.keys(note).length ? JSON.stringify(note) : '');
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(fn, timeoutMs = 25000, stepMs = 100) {
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
  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms. Last error: ${lastErr}`);
}

async function run() {
  console.log('=== Starting Real Browser QA on 3350 via CDP 19795 ===\n');

  // 1. Safety check against API 8250
  let health;
  try {
    const res = await fetch(`${API_URL}/health`);
    health = await res.json();
    record('API 8250 accessible', res.ok && health.status === 'ok', { status: health.status });
  } catch (err) {
    record('API 8250 accessible', false, { error: err.message });
    process.exit(1);
  }

  const isSafe = health.llm !== 'live';
  record('Safety Guard: Offline rules/mock lane verified (no live Gemini consumed)', isSafe, {
    llm: health.llm,
    provider: health.assistant_provider
  });
  if (!isSafe) {
    console.error('Refusing execution against live provider.');
    process.exit(2);
  }

  // 2. Locate Browser executable
  const BROWSER_PATH = process.env.BROWSER || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ].find(fs.existsSync);

  if (!BROWSER_PATH) {
    console.error('No suitable Chrome/Edge browser found.');
    process.exit(1);
  }
  evidence.browser = BROWSER_PATH;
  record('Browser binary located', true, { path: BROWSER_PATH });

  // 3. Launch Browser on CDP 19795 with isolated profile
  const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'foodtour-cdp-19795-'));
  const browserProc = spawn(BROWSER_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tempProfile}`,
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  const cleanup = () => {
    try {
      if (process.platform === 'win32' && browserProc.pid) {
        execFileSync('taskkill', ['/pid', String(browserProc.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        browserProc.kill('SIGKILL');
      }
    } catch (_) {}
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (_) {}
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  let ws, msgSeq = 0;
  const pending = new Map();
  const assistantRequests = new Set();
  let latestAssistant = null;

  try {
    // Wait for CDP endpoint
    let target;
    await until(async () => {
      const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      const list = await listRes.json();
      target = list.find((x) => x.type === 'page');
      return Boolean(target);
    }, 15000);

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Network.responseReceived' && m.params.response.url.endsWith('/assistant')) {
        assistantRequests.add(m.params.requestId);
      }
      if (m.method === 'Network.loadingFinished' && assistantRequests.has(m.params.requestId)) {
        assistantRequests.delete(m.params.requestId);
        cdp('Network.getResponseBody', { requestId: m.params.requestId }).then(r => {
          const body = JSON.parse(r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body);
          if (body.contract === 'discovery-v1') latestAssistant = body;
        }).catch(() => {});
      }
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message));
        else p.resolve(m.result);
      }
    };

    const cdp = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++msgSeq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, 15000);
      pending.set(id, {
        resolve: (val) => { clearTimeout(timer); resolve(val); },
        reject: (err) => { clearTimeout(timer); reject(err); }
      });
      ws.send(JSON.stringify({ id, method, params }));
    });

    const ev = async (expr) => {
      const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval failed: ' + r.exceptionDetails.text);
      return r.result.value;
    };

    const sel = (id) => `[data-testid="${id}"]`;
    const S = (s) => (s.startsWith('[') || s.startsWith('.') ? s : sel(s));
    const exists = (s) => ev(`!!document.querySelector(${JSON.stringify(S(s))})`);

    async function click(s) {
      const q = S(s);
      await ev(`document.querySelector(${JSON.stringify(q)})?.scrollIntoView({block:'center'})`);
      const pt = await ev(`(()=>{
        const e = document.querySelector(${JSON.stringify(q)});
        if (!e || e.disabled || !e.getClientRects().length) return null;
        const r = e.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      if (!pt) throw new Error('Control not clickable: ' + s);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...pt });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...pt });
    }

    async function idle() {
      await until(() => ev(`!!document.querySelector('[data-testid="discovery-input"]') && !document.querySelector('[data-testid="discovery-input"]').disabled && !document.querySelector('[aria-busy="true"]')`), 25000);
      await pause(160);
    }

    async function fillValue(id, text) {
      await click(id);
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
      await cdp('Input.insertText', { text });
    }

    async function send(text) {
      await idle();
      await fillValue('discovery-input', text);
      await click('discovery-send-btn');
      await idle();
    }

    const captureScreenshot = async (name) => {
      const res = await cdp('Page.captureScreenshot', { format: 'png' });
      const imgPath = path.join(OUT_DIR, name);
      fs.writeFileSync(imgPath, Buffer.from(res.data, 'base64'));
      evidence.screenshots.push({ name, path: imgPath });
      console.log(`  [Screenshot saved] ${name}`);
    };

    // Enable domains
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Network.enable');
    await cdp('DOM.enable');

    // Desktop Viewport 1440x1024
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1024,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Clear origin storage before navigating
    try {
      await cdp('Storage.clearDataForOrigin', { origin: WEB_URL, storageTypes: 'all' });
    } catch (_) {}

    console.log(`Navigating to ${WEB_URL}...`);
    await cdp('Page.navigate', { url: WEB_URL });

    await until(() => exists('discovery-input'), 25000);
    await idle();
    record('Browser loaded discovery-v1 assistant and reached idle state', true);

    // -------------------------------------------------------------
    // Step 1: Typed search for "phở tại Đống Đa"
    // -------------------------------------------------------------
    console.log('\n--- Step 1: Typing and submitting "tôi muốn ăn phở tại Đống Đa" ---');
    await send('tôi muốn ăn phở tại Đống Đa');
    record('Chat search "tôi muốn ăn phở tại Đống Đa" submitted successfully', true);

    // Wait for venue results
    await until(() => ev(`document.querySelectorAll('.nn-restaurant-card, [data-testid="restaurant-card"]').length > 0`), 20000);
    const searchStats = await ev(`(() => {
      const cards = document.querySelectorAll('.nn-restaurant-card, [data-testid="restaurant-card"]');
      const text = document.body.innerText;
      const hasOriginMissing = text.includes('chưa chọn điểm xuất phát') || text.includes('Chưa rõ khoảng cách');
      return { cardCount: cards.length, hasOriginMissing };
    })()`);

    record('Venue cards rendered on search results', searchStats.cardCount > 0, { count: searchStats.cardCount });
    record('Truthful distance display without origin (origin_missing note)', searchStats.hasOriginMissing);

    await captureScreenshot('browser_1440_search_results.png');

    // -------------------------------------------------------------
    // Step 2: Full Menu Modal Opening on Venue with Menu
    // -------------------------------------------------------------
    console.log('\n--- Step 2: Opening Full Menu Modal ---');

    // Find a venue that has canonical menu dishes (e.g. Ánh Sáng or first card with menu preview)
    const openedMenu = await ev(`(() => {
      const cards = Array.from(document.querySelectorAll('.nn-restaurant-card, [data-testid="restaurant-card"]'));
      // Prefer card with Ánh Sáng or matching menu items
      let targetCard = cards.find(c => c.innerText.includes('Ánh Sáng') || c.querySelector('.nn-matching-dishes-list'));
      if (!targetCard && cards.length > 0) targetCard = cards[0];

      if (targetCard) {
        const btn = targetCard.querySelector('button[data-testid="view-full-menu"]') ||
          Array.from(targetCard.querySelectorAll('button')).find(b => b.innerText.includes('Xem thực đơn') || b.innerText.includes('Chi tiết'));
        if (btn) {
          btn.click();
          return { ok: true, venueText: targetCard.querySelector('h4, h3, .nn-restaurant-name')?.innerText || '' };
        }
      }
      return { ok: false };
    })()`);

    record('Opened detail modal on venue', openedMenu?.ok === true, openedMenu);

    await until(() => exists('venue-menu-section'), 15000);
    record('Full menu section modal rendered with [data-testid="venue-menu-section"]', true);

    // Wait for menu items or settled state
    await until(() => ev(`(() => {
      const sec = document.querySelector('[data-testid="venue-menu-section"]');
      if (!sec) return false;
      return !sec.querySelector('[data-testid="venue-menu-loading"]');
    })()`), 20000);

    // If first venue had no menu, switch to venue with menu (Ánh Sáng)
    const isUnavailable = await ev(`!!document.querySelector('[data-testid="venue-menu-unavailable"]')`);
    if (isUnavailable) {
      console.log('First venue menu unavailable, closing and clicking venue with active menu (Ánh Sáng)...');
      await ev(`(() => {
        const closeBtn = document.querySelector('button[aria-label*="Đóng"]') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Đóng');
        closeBtn?.click();
      })()`);
      await pause(500);

      await ev(`(() => {
        const cards = Array.from(document.querySelectorAll('.nn-restaurant-card, [data-testid="restaurant-card"]'));
        const anhSangCard = cards.find(c => c.innerText.includes('Ánh Sáng')) || cards[cards.length - 1];
        if (anhSangCard) {
          const btn = anhSangCard.querySelector('button[data-testid="view-full-menu"]') || Array.from(anhSangCard.querySelectorAll('button')).find(b => b.innerText.includes('Xem thực đơn') || b.innerText.includes('Chi tiết'));
          btn?.click();
        }
      })()`);

      await until(() => exists('venue-menu-section'), 15000);
      await until(() => ev(`(() => {
        const sec = document.querySelector('[data-testid="venue-menu-section"]');
        if (!sec) return false;
        return !sec.querySelector('[data-testid="venue-menu-loading"]');
      })()`), 20000);
    }

    const menuData = await ev(`(() => {
      const sec = document.querySelector('[data-testid="venue-menu-section"]');
      const title = sec.querySelector('[data-testid="venue-menu-title"]')?.innerText;
      const source = sec.querySelector('[data-testid="venue-menu-source"]')?.innerText;
      const searchInput = !!sec.querySelector('[data-testid="venue-menu-search-input"]');
      const groups = sec.querySelectorAll('.nn-venue-menu-group-chip').length;
      const items = sec.querySelectorAll('.nn-venue-menu-dish-card').length;
      const availabilityBadges = sec.querySelectorAll('.nn-dish-availability-badge').length;
      const minTotals = sec.querySelectorAll('.nn-dish-min-total').length;
      const optionGroups = sec.querySelectorAll('.nn-dish-option-groups').length;

      // Check absence of repetitive price disclaimers
      const fullText = sec.innerText;
      const hasRepetitiveDisclaimer = fullText.includes('giá tham khảo') || fullText.includes('không phải giá tại quán');

      return {
        title,
        source,
        searchInput,
        groups,
        items,
        availabilityBadges,
        minTotals,
        optionGroups,
        hasRepetitiveDisclaimer
      };
    })()`);

    record('Full menu title rendered with item count', Boolean(menuData.title), { title: menuData.title });
    record('Unobtrusive single source badge present (Nguồn: ShopeeFood)', Boolean(menuData.source), { source: menuData.source });
    record('Menu search input present', menuData.searchInput);
    record('Repetitive price disclaimers stripped from menu modal', !menuData.hasRepetitiveDisclaimer);
    record('Menu items and group chips rendered', menuData.items > 0, { items: menuData.items, groups: menuData.groups });

    await captureScreenshot('browser_1440_menu_modal.png');

    // Test searching inside menu
    if (menuData.items > 0) {
      console.log('Testing in-modal menu search: "phở"...');
      await ev(`(() => {
        const input = document.querySelector('[data-testid="venue-menu-search-input"]');
        if (input) {
          input.value = 'phở';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await ev(`document.querySelector('[data-testid="venue-menu-search-submit"]')?.click()`);
      await pause(600);
      record('In-modal menu search submitted', true);

      // Clear filter
      const clearBtn = await ev(`!!document.querySelector('[data-testid="venue-menu-search-clear"]')`);
      if (clearBtn) {
        await ev(`document.querySelector('[data-testid="venue-menu-search-clear"]')?.click()`);
        await pause(400);
        record('Cleared menu search filter', true);
      }
    }

    // Close modal
    await ev(`(() => {
      const closeBtn = document.querySelector('button[aria-label*="Đóng"]') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Đóng');
      closeBtn?.click();
    })()`);
    await pause(400);

    // -------------------------------------------------------------
    // Step 3: Map Interaction & Draft Pin
    // -------------------------------------------------------------
    console.log('\n--- Step 3: Map Interaction & Draft Pin ---');

    // Click pilot-map-toggle to switch viewMode to 'map'
    await click('pilot-map-toggle');
    console.log('Clicked pilot-map-toggle, waiting for MapLibre container...');

    // Wait for MapLibre container
    await until(() => ev(`!!document.querySelector('.maplibregl-map')`), 20000);
    record('MapLibre container rendered via pilot-map-toggle', true);

    // Wait for OSM attribution
    await until(() => ev(`(() => {
      const attrib = document.querySelector('[data-testid="map-attribution"], .nn-map-attribution');
      return attrib && attrib.innerText.includes('OpenStreetMap');
    })()`), 15000);
    record('OpenStreetMap visible attribution present', true);

    // Click map canvas to place draft draggable pin via CDP native mouse event
    console.log('Clicking map canvas to place draft origin pin...');
    const canvasPt = await ev(`(() => {
      const canvas = document.querySelector('.maplibregl-canvas') || document.querySelector('.maplibregl-map');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);

    if (canvasPt) {
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...canvasPt });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...canvasPt });
    }
    await pause(1200);

    // Check if draft pin or draft bar appeared
    const draftStatus = await ev(`(() => {
      const draftPin = !!document.querySelector('[data-testid="pilot-draft-origin-marker"], .nn-map-draft-origin-marker');
      const draftBarBtn = !!document.querySelector('[data-testid="map-use-draft-bar-btn"], [data-testid="map-use-draft-location"]');
      return { draftPin, draftBarBtn };
    })()`);
    record('Draft draggable origin pin placed on map click', draftStatus.draftPin || draftStatus.draftBarBtn, draftStatus);

    // Click "Sử dụng vị trí này" to commit location
    if (draftStatus.draftBarBtn) {
      const originBefore = JSON.stringify(latestAssistant?.profile?.origin);
      const revisionBefore = latestAssistant?.revision ?? -1;
      await ev(`document.querySelector('[data-testid="map-use-draft-bar-btn"], [data-testid="map-use-draft-location"]')?.click()`);
      console.log('Clicked "Sử dụng vị trí này", waiting for location resolution...');
      await until(() => latestAssistant?.revision > revisionBefore && latestAssistant?.location?.source === 'map'
        && JSON.stringify(latestAssistant?.profile?.origin) !== originBefore, 25000);
      record('Used draft map pin location via explicit action (resolve_address: true)', latestAssistant.location.source === 'map');
    } else {
      record('Used draft map pin location via explicit action (resolve_address: true)', false, { note: 'No usable draft control' });
    }

    await captureScreenshot('browser_1440_map_origin.png');

    // -------------------------------------------------------------
    // Step 4: Add Venue to Tour Selection & Confirmation Card
    // -------------------------------------------------------------
    console.log('\n--- Step 4: Adding Venue to Tour Selection ---');
    // Switch back to schematic to see tour and cards
    await click('view-mode-schematic-btn');
    await pause(600);

    const addBtn = await ev(`!!(document.querySelector('button[data-testid="venue-action-add"]') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('+ Thêm vào tour') || b.innerText.includes('Thêm vào tour')))`);
    if (addBtn) {
      const selectedBefore = latestAssistant?.selection?.length ?? 0;
      await ev(`(document.querySelector('button[data-testid="venue-action-add"]') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('+ Thêm vào tour') || b.innerText.includes('Thêm vào tour')))?.click()`);
      await until(() => (latestAssistant?.selection?.length ?? 0) > selectedBefore, 15000);
      record('Added venue to foodtour selection', latestAssistant.selection.length > selectedBefore);
    } else {
      record('Added venue to foodtour selection', false, { note: 'No explicit add action verified' });
    }

    // -------------------------------------------------------------
    // Step 5: Mobile Viewport Emulation (390x844)
    // -------------------------------------------------------------
    console.log('\n--- Step 5: Mobile Viewport Emulation (390x844) ---');
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await pause(800);

    const mobileMetrics = await ev(`(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const noHorizontalOverflow = scrollWidth <= clientWidth + 2;
      return { scrollWidth, clientWidth, noHorizontalOverflow };
    })()`);

    record('Mobile 390x844 viewport fits without horizontal overflow', mobileMetrics.noHorizontalOverflow, mobileMetrics);
    await captureScreenshot('browser_390_mobile.png');

  } catch (err) {
    console.error('Browser QA Execution Error:', err);
    record('Browser QA execution completed without unhandled exceptions', false, { error: err.message });
  } finally {
    if (ws) {
      try { ws.close(); } catch (_) {}
    }
    cleanup();
  }

  // Write Evidence File
  const evidencePath = path.join(OUT_DIR, 'browser-evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
  console.log(`\nBrowser QA Evidence saved to: ${evidencePath}`);

  const passedCount = evidence.checks.filter(c => c.result === 'PASS').length;
  const totalCount = evidence.checks.length;
  console.log(`\n=== Browser QA Summary: ${passedCount}/${totalCount} checks PASSED ===`);

  if (passedCount < totalCount) {
    process.exit(1);
  }
}

run();
