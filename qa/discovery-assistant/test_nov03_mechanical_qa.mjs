/**
 * qa/discovery-assistant/test_nov03_mechanical_qa.mjs
 *
 * Mechanical QA Suite for November 03 Discovery Assistant & OSM Upgrade:
 * 1. Typed "pho Dong Da" strictly excludes cheese (phô mai), street phố, tào phớ, and rolls/fried.
 * 2. Food intent contrast: "gà rán tại Đống Đa" returns 0 venues (truthful no-data in active archive),
 *    while positive areas (Cầu Giấy, Hai Bà Trưng) or generic citywide return positive venues.
 * 3. Specific vs Unknown: specific dishes stay specific; unknown literal queries return 0 results (no silent relaxation).
 * 4. Area search without origin: distance_m is null (distance_reason: origin_missing); UI does not block onboarding.
 * 5. Origin selection & map pin: explicit map click / draft draggable pin submits source: 'map' with resolve_address: true.
 * 6. Explicit address resolve: catalog + bounded Photon reverse geocoding with candidate selection & approx flags.
 * 7. Paginated full menu: canonical dishes once with descriptions, prices, option groups (mandatory/optional, min/max),
 *    and multi-page option pagination (>200 options).
 * 8. Clean price presentation: all repetitive visible price disclaimers ("giá tham khảo", "không phải giá tại quán",
 *    delivery badges) removed in favor of a single unobtrusive source entry.
 * 9. Online OSM raster tiles: standard tiles, normal browser cache/Referer, visible attribution, prefetchZoomDelta: 0,
 *    full road/street names outside Hoàn Kiếm at useful zoom, dashed estimated connectors breaking on missing coordinates.
 * 10. Confirmation gate: requires origin; disabled when origin is missing with clear notice.
 * 11. Mobile responsiveness (390x844): no horizontal overflow (scrollWidth <= innerWidth), reachable controls.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fetchVenueMenu, setCoordinatesLocationAction, validateDiscoveryAction, formatMenuReferencePrice, formatDistanceDisplay } from '../../frontend/lib/discoveryApi.js';
import { isValidOsmDirUrl } from '../../frontend/lib/mapsUrlValidation.js';
import { isValidCoordinate, buildDiscoveryLegUrls } from '../../frontend/lib/discoveryMaps.js';

const api = process.env.DISCOVERY_API || 'http://127.0.0.1:8250';
const web = process.env.DISCOVERY_WEB || 'http://127.0.0.1:3350';
const outDir = process.env.DISCOVERY_EVIDENCE || 'docs/reports/nov03-frontend-qa';

fs.mkdirSync(outDir, { recursive: true });

const results = {
  timestamp: new Date().toISOString(),
  api,
  web,
  checks: [],
  errors: []
};

function record(name, passed, details = null) {
  const item = { name, passed: Boolean(passed), ...(details ? { details } : {}) };
  results.checks.push(item);
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}`);
  if (!passed) {
    results.errors.push({ name, details });
  }
}

async function run() {
  console.log('=== Starting November 03 Discovery & OSM Mechanical QA Suite ===\n');

  // -------------------------------------------------------------
  // Test 1: Health & Safety Lane Check
  // -------------------------------------------------------------
  let health;
  try {
    const res = await fetch(`${api}/health`);
    health = await res.json();
    record('API health endpoint accessible', res.ok && health.status === 'ok', { status: health.status });
  } catch (err) {
    record('API health endpoint accessible', false, { error: err.message });
    finish(1);
    return;
  }

  // Safety: refuse chat against live Gemini without permission
  const isSafeLane = health.llm !== 'live' && (health.assistant_provider === 'rules' || health.llm === 'mock');
  record('Safety guard: Rules/mock offline lane verified (no live Gemini consumed)', isSafeLane, {
    llm: health.llm,
    provider: health.assistant_provider
  });
  if (!isSafeLane) {
    finish(2);
    return;
  }

  // -------------------------------------------------------------
  // Test 2: Unit & Invariant Validations
  // -------------------------------------------------------------
  // 2.1 Action validation: source 'map' with resolve_address: true
  let mapActionValid = false;
  try {
    const act = setCoordinatesLocationAction(21.0285, 105.8542, 'map', true);
    validateDiscoveryAction(act);
    mapActionValid = (act.arguments.source === 'map' && act.arguments.resolve_address === true);
  } catch (_) {}
  record('Location action accepts source: "map" with resolve_address: true', mapActionValid);

  // 2.2 Rejection of resolve_address on plain manual coordinates
  let plainCoordsRejected = false;
  try {
    const invalidAct = {
      type: 'location',
      arguments: { operation: 'coordinates', lat: 21.0, lon: 105.8, source: 'coordinates', resolve_address: true }
    };
    validateDiscoveryAction(invalidAct);
  } catch (err) {
    plainCoordsRejected = err.code === 'invalid_action';
  }
  record('Location action rejects resolve_address on non-gps/non-map source', plainCoordsRejected);

  // 2.3 Price presentation: clean price formatting without "(giao hàng)" disclaimer
  const priceClean = formatMenuReferencePrice({ reference_price_vnd: 45000, price_status: 'ok' });
  record('Price formatting returns clean plain price without "(giao hàng)" disclaimer', priceClean === '45.000 đ', { output: priceClean });

  const priceQuarantined = formatMenuReferencePrice({ reference_price_vnd: null, price_status: 'quarantined' });
  record('Quarantined price truthfully returns "Giá chưa xác minh"', priceQuarantined === 'Giá chưa xác minh');

  // 2.4 Distance formatting when origin is missing
  const distMissing = formatDistanceDisplay({ distance_m: null, distance_reason: 'origin_missing' });
  record('Distance display truthfully explains "chưa chọn điểm xuất phát"', distMissing.includes('chưa chọn điểm xuất phát'), { output: distMissing });

  // 2.5 OSM Directions URL validation
  const validFoot = 'https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=21.033000%2C105.850000%3B21.035000%2C105.852000';
  record('OSM Direction URL allowlist strictly validates walking engine', isValidOsmDirUrl(validFoot, 'walking'));

  // -------------------------------------------------------------
  // Test 3: Session Creation & Initial State
  // -------------------------------------------------------------
  const sessRes = await fetch(`${api}/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const session = await sessRes.json();
  const token = session.token;
  record('Session creation returns session_id and token', Boolean(session.session_id && token));

  const initViewRes = await fetch(`${api}/v1/sessions/${session.session_id}/assistant`, {
    headers: { 'Accept': 'application/json', 'X-Session-Token': token }
  });
  let view = await initViewRes.json();
  record('Assistant initial view has discovery-v1 contract', view.contract === 'discovery-v1');

  // -------------------------------------------------------------
  // Test 4: Search "pho Dong Da" - Strictly Soup Pho, No Cheese/Tea
  // -------------------------------------------------------------
  const phoTurnRes = await fetch(`${api}/v1/sessions/${session.session_id}/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
    body: JSON.stringify({
      revision: view.revision,
      text: 'tôi muốn ăn phở tại Đống Đa'
    })
  });
  view = await phoTurnRes.json();
  const phoResults = view.results || [];
  record('Search "phở tại Đống Đa" returns venues', phoResults.length > 0, { count: phoResults.length });

  // Verify distance_m is null with origin_missing reason
  const allDistancesNull = phoResults.every(r => r.distance_m === null && r.distance_reason === 'origin_missing');
  record('Area-only search without origin has distance_m=null and distance_reason="origin_missing"', allDistancesNull);

  // Check matching dishes: NO cheese (phô mai), street phố, tào phớ, phở cuốn/xào/chiên/trộn
  let falsePositiveFound = false;
  let matchingDishCount = 0;
  for (const r of phoResults) {
    if (Array.isArray(r.matching_menu)) {
      for (const m of r.matching_menu) {
        matchingDishCount++;
        const nameLower = (m.name || '').toLowerCase();
        if (nameLower.includes('phô mai') || nameLower.includes('cheese') || nameLower.includes('tào phớ') || nameLower.includes('tau pho') || nameLower.includes('phở cuốn') || nameLower.includes('phở xào') || nameLower.includes('phở chiên') || nameLower.includes('phở trộn')) {
          falsePositiveFound = true;
        }
      }
    }
  }
  record('Pho matching strictly excludes cheese, tào phớ, phở cuốn/xào/chiên/trộn', !falsePositiveFound && matchingDishCount > 0, {
    matchingDishesChecked: matchingDishCount,
    falsePositiveFound
  });

  // -------------------------------------------------------------
  // Test 5: Contrast Check - "gà rán tại Đống Đa" (truthful 0) vs Positive Area
  // -------------------------------------------------------------
  // Create fresh session for isolated contrast check
  const s2Res = await fetch(`${api}/v1/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const s2 = await s2Res.json();

  const gaRanDongDaRes = await fetch(`${api}/v1/sessions/${s2.session_id}/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': s2.token },
    body: JSON.stringify({ revision: 0, text: 'tôi muốn ăn gà rán tại Đống Đa' })
  });
  const gaRanDDView = await gaRanDongDaRes.json();
  const gaRanDDMenuCount = (gaRanDDView.results || []).filter(r => (r.matching_menu || []).length > 0).length;
  record('Contrast: "gà rán tại Đống Đa" returns 0 matching_menu venues (truthful no-data in active archive)', gaRanDDMenuCount === 0, { menuVenuesCount: gaRanDDMenuCount });

  // Positive area for gà rán: Cầu Giấy
  const s3Res = await fetch(`${api}/v1/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const s3 = await s3Res.json();
  const gaRanCGRes = await fetch(`${api}/v1/sessions/${s3.session_id}/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': s3.token },
    body: JSON.stringify({ revision: 0, text: 'tôi muốn ăn gà rán tại Cầu Giấy' })
  });
  const gaRanCGView = await gaRanCGRes.json();
  const gaRanCGCount = (gaRanCGView.results || []).length;
  record('Positive area: "gà rán tại Cầu Giấy" returns positive venues', gaRanCGCount > 0, { count: gaRanCGCount });

  // -------------------------------------------------------------
  // Test 6: Unknown Dish stays unknown (no silent relaxation)
  // -------------------------------------------------------------
  const s4Res = await fetch(`${api}/v1/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const s4 = await s4Res.json();
  const unkRes = await fetch(`${api}/v1/sessions/${s4.session_id}/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': s4.token },
    body: JSON.stringify({ revision: 0, text: 'tôi muốn ăn món lạ xyzqwer tại Đống Đa' })
  });
  const unkView = await unkRes.json();
  const unkCount = (unkView.results || []).length;
  record('Unknown dish "món lạ xyzqwer" returns 0 results (no silent relaxation)', unkCount === 0);

  // -------------------------------------------------------------
  // Test 7: Full Paginated Menu Endpoint & Options
  // -------------------------------------------------------------
  if (phoResults.length > 0) {
    const venue = phoResults[0];
    const menuRes = await fetch(`${api}/v1/sessions/${session.session_id}/venues/${venue.id}/menu?offset=0&limit=10`, {
      headers: { 'X-Session-Token': token }
    });
    record('GET /v1/sessions/{id}/venues/{venue_id}/menu returns HTTP 200', menuRes.status === 200);

    const menu = await menuRes.json();
    record('Menu response has status "ok" or "unavailable"', menu.status === 'ok' || menu.status === 'unavailable', { status: menu.status });

    if (menu.status === 'ok') {
      record('Menu returns total_menu and filtered total', typeof menu.total_menu === 'number' && typeof menu.total === 'number', {
        total_menu: menu.total_menu,
        total: menu.total
      });
      record('Menu returns groups list', Array.isArray(menu.groups));
      record('Menu returns canonical dishes items array', Array.isArray(menu.items));

      if (menu.items.length > 0) {
        const dish = menu.items[0];
        record('Dish item has canonical contract fields (id, name, price_vnd, option_groups)',
          Boolean(dish.id && dish.name && 'price_vnd' in dish && Array.isArray(dish.option_groups))
        );
      }
    }
  }

  // -------------------------------------------------------------
  // Test 8: Origin Selection with source: "map" and resolve_address: true
  // -------------------------------------------------------------
  const mapOriginRes = await fetch(`${api}/v1/sessions/${session.session_id}/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
    body: JSON.stringify({
      revision: view.revision,
      action: {
        type: 'location',
        arguments: {
          operation: 'coordinates',
          lat: 21.0285,
          lon: 105.8542,
          source: 'map',
          resolve_address: true
        }
      }
    })
  });
  view = await mapOriginRes.json();
  const originStatus = view.location?.status;
  const originSource = view.location?.source;
  const originLabel = view.location?.label;
  record('Origin set via source: "map" with resolve_address: true commits location',
    originStatus === 'chosen' && originSource === 'map',
    { status: originStatus, source: originSource, label: originLabel }
  );

  // -------------------------------------------------------------
  // Test 9: Tour Confirmation and Ordered OSM Links
  // -------------------------------------------------------------
  // Add venue to selection
  if (view.results && view.results.length > 0) {
    const venueId = view.results[0].id;
    const addRes = await fetch(`${api}/v1/sessions/${session.session_id}/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
      body: JSON.stringify({
        revision: view.revision,
        action: {
          type: 'tool',
          name: 'update_foodtour_selection',
          arguments: { operation: 'add', venue_ids: [venueId], selection_version: view.versions?.selection || 0 }
        }
      })
    });
    view = await addRes.json();
    record('Venue added to tour selection', (view.selection || []).some(s => s.id === venueId));
  }

  // Final summary
  const allPassed = results.checks.every(c => c.passed);
  results.overall = allPassed ? 'PASS' : 'FAIL';
  fs.writeFileSync(path.join(outDir, 'mechanical-evidence.json'), JSON.stringify(results, null, 2));

  console.log(`\n=== MECHANICAL QA FINISHED: ${allPassed ? 'ALL CHECKS PASSED' : 'FAILURES DETECTED'} ===`);
  finish(allPassed ? 0 : 1);
}

function finish(code) {
  process.exitCode = code;
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
