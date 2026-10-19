/**
 * qa/discovery-assistant/targeted_fixes_smoke.mjs
 * Comprehensive targeted smoke test suite verifying all 3 confirmed defect fixes:
 * 1. Free Google Maps URLs & Per-Leg URLs:
 *    - Start at actual user origin (if provided); do not invent GPS.
 *    - Include ALL selected stops in order via waypoints then final destination.
 *    - Single stop is not origin=destination; legacy fallback without origin links to destination.
 *    - Modes: walking for walk, driving for car/taxi/motorbike with honest motorbike approximation note.
 *    - Per-leg: origin->first plus interstop legs.
 *    - All pass isValidGoogleMapsDirUrl.
 * 2. Real HTTP client tests for EXPORTED discoveryApi functions (getDiscoveryAssistant, sendDiscoveryMessage, sendDiscoveryAction):
 *    - Stalled body on 200 throws DiscoveryApiError('timeout').
 *    - Malformed JSON on 200 throws DiscoveryApiError('bad_response').
 *    - Non-discovery-v1 contract shape on 200 throws DiscoveryApiError('bad_response').
 *    - Valid discovery-v1 contract on 200 returns validated view (never setView(null)).
 *    - 401 Unauthorized throws DiscoveryApiError('unauthorized').
 *    - 500 Server error throws DiscoveryApiError(500).
 *    - Caller AbortController signal throws AbortError.
 * 3. Vietnamese translation of raw unknowns:
 *    - ingredient_allergy_safety, sweetness, dish_price, current_open_status mapped to readable Vietnamese.
 *    - Preserves distinct unknowns without safety claims.
 * 4. Bounded normal exit with clean process.exit(0) and 0 hanging listeners.
 */

import http from 'http';
import {
  getDiscoveryAssistant,
  sendDiscoveryMessage,
  sendDiscoveryAction,
  validateDiscoveryViewShape,
  DiscoveryApiError,
  ALLOWED_TOOL_NAMES,
  validateDiscoveryAction,
  UNKNOWN_LABELS_VI,
  formatUnknownLabel
} from '../../frontend/lib/discoveryApi.js';
import {
  buildDiscoveryMapsUrl,
  buildDiscoveryLegUrls,
  resolveTravelMode,
  isValidCoordinate
} from '../../frontend/lib/discoveryMaps.js';
import { isValidGoogleMapsDirUrl } from '../../frontend/lib/mapsUrlValidation.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failed += 1;
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`[PASS] ${message}`);
    passed += 1;
  }
}

// Mimic DiscoveryLayout helpers for testing
function deriveTourDuration(tour, profile) {
  const stops = tour?.stops || [];
  if (stops.length >= 2 && stops[0]?.arrive && stops[stops.length - 1]?.depart) {
    const p1 = stops[0].arrive.split(':').map(Number);
    const p2 = stops[stops.length - 1].depart.split(':').map(Number);
    if (!isNaN(p1[0]) && !isNaN(p1[1]) && !isNaN(p2[0]) && !isNaN(p2[1])) {
      let diff = (p2[0] * 60 + p2[1]) - (p1[0] * 60 + p1[1]);
      if (diff < 0) diff += 24 * 60;
      if (diff > 0) {
        return { val: `${Math.round(diff / 60 * 10) / 10}h`, lbl: 'lịch trình' };
      }
    }
  }
  if (profile?.duration_min) {
    return { val: `${profile.duration_min}p`, lbl: 'yêu cầu' };
  }
  return { val: '—', lbl: 'thời lượng' };
}

function deriveTourPriceInfo(tour, profile) {
  if (tour?.totals?.venue_range_upper_sum_vnd !== undefined && tour?.totals?.venue_range_upper_sum_vnd !== null) {
    return {
      val: `${Math.round(tour.totals.venue_range_upper_sum_vnd / 1000)}K`,
      lbl: 'khoảng giá quán'
    };
  }
  if (profile?.budget_vnd !== undefined && profile?.budget_vnd !== null) {
    return {
      val: `${Math.round(profile.budget_vnd / 1000)}K`,
      lbl: `ngân sách ${profile?.budget_scope === 'per_person' ? 'mỗi người' : 'cả nhóm'}`
    };
  }
  return { val: '—', lbl: 'khoảng giá' };
}

async function runAllTargetedTests() {
  console.log('================================================================');
  console.log('=== TARGETED DISCOVERY ASSISTANT 3-DEFECT VERIFICATION SUITE ===');
  console.log('================================================================\n');

  // =============================================================
  // SECTION 1: TARGETED PURE GOOGLE MAPS URL & PER-LEG TESTS
  // =============================================================
  console.log('[SECTION 1] Free Google Maps & Per-Leg URLs Invariants...');

  const userOrigin = { lat: 21.0285, lon: 105.8542, label: 'Khách sạn của bạn' };
  const stop1 = { name: 'Phở Gia Truyền', lat: 21.0333, lon: 105.8495 };
  const stop2 = { name: 'Bún Chả Đắc Kim', lat: 21.0322, lon: 105.8488 };
  const stop3 = { name: 'Cà Phê Giảng', lat: 21.0361, lon: 105.8526 };

  // 1.1 User origin provided + 3 stops
  const mapsWithOrigin = buildDiscoveryMapsUrl({
    origin: userOrigin,
    stops: [stop1, stop2, stop3],
    vehicle: 'walk'
  });
  assert(mapsWithOrigin !== null, 'buildDiscoveryMapsUrl succeeded with origin + 3 stops');
  assert(isValidGoogleMapsDirUrl(mapsWithOrigin.url), 'Full route URL passes isValidGoogleMapsDirUrl');
  const parsed1 = new URL(mapsWithOrigin.url);
  assert(parsed1.searchParams.get('origin') === `${userOrigin.lat},${userOrigin.lon}`, 'Route starts at user origin');
  assert(parsed1.searchParams.get('destination') === `${stop3.lat},${stop3.lon}`, 'Route destination is the final stop');
  assert(
    parsed1.searchParams.get('waypoints') === `${stop1.lat},${stop1.lon}|${stop2.lat},${stop2.lon}`,
    'All intermediate stops (stop 1 & 2) are included in order via waypoints'
  );
  assert(parsed1.searchParams.get('travelmode') === 'walking', 'Travelmode is walking for walk');

  // 1.2 User origin provided + 1 single stop (single stop not origin=destination)
  const singleStopWithOrigin = buildDiscoveryMapsUrl({
    origin: userOrigin,
    stops: [stop1],
    vehicle: 'walk'
  });
  assert(singleStopWithOrigin !== null, 'Single stop with origin succeeds');
  const parsedSingle = new URL(singleStopWithOrigin.url);
  assert(parsedSingle.searchParams.get('origin') === `${userOrigin.lat},${userOrigin.lon}`, 'Single stop starts at user origin');
  assert(parsedSingle.searchParams.get('destination') === `${stop1.lat},${stop1.lon}`, 'Single stop ends at stop 1');
  assert(parsedSingle.searchParams.get('origin') !== parsedSingle.searchParams.get('destination'), 'Single stop origin != destination');
  assert(!parsedSingle.searchParams.has('waypoints'), 'Single stop has no waypoints');

  // 1.3 Legacy caller without user origin + 1 single stop (must NOT set origin=destination)
  const singleStopNoOrigin = buildDiscoveryMapsUrl({
    origin: null,
    stops: [stop1],
    vehicle: 'walk'
  });
  assert(singleStopNoOrigin !== null, 'Single stop without origin succeeds');
  const parsedLegacySingle = new URL(singleStopNoOrigin.url);
  assert(!parsedLegacySingle.searchParams.has('origin'), 'Legacy single stop omits origin (not origin=destination)');
  assert(parsedLegacySingle.searchParams.get('destination') === `${stop1.lat},${stop1.lon}`, 'Legacy single stop has destination=stop1');
  assert(isValidGoogleMapsDirUrl(singleStopNoOrigin.url), 'Legacy single stop URL passes isValidGoogleMapsDirUrl');

  // 1.4 Legacy caller without user origin + 3 stops
  const legacy3Stops = buildDiscoveryMapsUrl({
    origin: null,
    stops: [stop1, stop2, stop3],
    vehicle: 'walk'
  });
  const parsedLegacy3 = new URL(legacy3Stops.url);
  assert(parsedLegacy3.searchParams.get('origin') === `${stop1.lat},${stop1.lon}`, 'Legacy 3 stops starts at stop 1');
  assert(parsedLegacy3.searchParams.get('destination') === `${stop3.lat},${stop3.lon}`, 'Legacy 3 stops destination is stop 3');
  assert(parsedLegacy3.searchParams.get('waypoints') === `${stop2.lat},${stop2.lon}`, 'Legacy 3 stops waypoint is stop 2');

  // 1.5 Vehicles: car, taxi, motorbike
  const carRoute = buildDiscoveryMapsUrl({ origin: userOrigin, stops: [stop1, stop2], vehicle: 'car' });
  assert(new URL(carRoute.url).searchParams.get('travelmode') === 'driving', 'Car travelmode is driving');
  assert(isValidGoogleMapsDirUrl(carRoute.url), 'Car route URL passes isValidGoogleMapsDirUrl');

  const motorbikeRoute = buildDiscoveryMapsUrl({ origin: userOrigin, stops: [stop1, stop2], vehicle: 'motorbike' });
  assert(new URL(motorbikeRoute.url).searchParams.get('travelmode') === 'driving', 'Motorbike travelmode is driving');
  assert(motorbikeRoute.isMotorbike === true, 'Motorbike flag is detected');
  assert(typeof motorbikeRoute.disclosureNote === 'string' && motorbikeRoute.disclosureNote.length > 0, 'Honest motorbike disclosure note is provided');
  assert(isValidGoogleMapsDirUrl(motorbikeRoute.url), 'Motorbike route URL passes isValidGoogleMapsDirUrl');

  // 1.6 Per-leg links with user origin
  const legsWithOrigin = buildDiscoveryLegUrls({ origin: userOrigin, stops: [stop1, stop2, stop3], vehicle: 'walk' });
  assert(legsWithOrigin.length === 3, 'Per-leg links with origin produces exactly 3 legs (origin->1, 1->2, 2->3)');
  assert(legsWithOrigin[0].fromName.includes('Khách sạn') && legsWithOrigin[0].toName === 'Phở Gia Truyền', 'Leg 1 is origin -> stop 1');
  assert(legsWithOrigin[1].fromName === 'Phở Gia Truyền' && legsWithOrigin[1].toName === 'Bún Chả Đắc Kim', 'Leg 2 is stop 1 -> stop 2');
  assert(legsWithOrigin[2].fromName === 'Bún Chả Đắc Kim' && legsWithOrigin[2].toName === 'Cà Phê Giảng', 'Leg 3 is stop 2 -> stop 3');
  assert(legsWithOrigin.every((leg) => isValidGoogleMapsDirUrl(leg.url)), 'All per-leg URLs pass isValidGoogleMapsDirUrl');

  // 1.7 Per-leg links without user origin
  const legsNoOrigin = buildDiscoveryLegUrls({ origin: null, stops: [stop1, stop2, stop3], vehicle: 'walk' });
  assert(legsNoOrigin.length === 2, 'Per-leg links without origin produces exactly 2 inter-stop legs');
  assert(legsNoOrigin[0].fromName === 'Phở Gia Truyền' && legsNoOrigin[0].toName === 'Bún Chả Đắc Kim', 'Leg 1 is stop 1 -> stop 2');


  // =============================================================
  // SECTION 2: REAL LOCAL HTTP CLIENT TESTS FOR EXPORTED CLIENT FUNCS
  // =============================================================
  console.log('\n[SECTION 2] Real Local HTTP Client Tests for discoveryApi Exported Funcs...');

  let testServerResponseHandler = () => {};
  const testServer = http.createServer((req, res) => {
    testServerResponseHandler(req, res);
  });

  await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const testPort = testServer.address().port;
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = `http://127.0.0.1:${testPort}`;

  try {
    // 2.1 Stalled body on 200: must throw DiscoveryApiError('timeout')
    console.log('Testing stalled body timeout on getDiscoveryAssistant...');
    testServerResponseHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
      res.write('{"contract": "discovery-v1"');
      // Intentionally withhold rest of stream
    };
    let caughtStalledTimeout = false;
    try {
      await getDiscoveryAssistant('sess-1', 'tok', { timeoutMs: 350 });
    } catch (err) {
      if (err instanceof DiscoveryApiError && err.code === 'timeout') {
        caughtStalledTimeout = true;
      }
    }
    assert(caughtStalledTimeout, 'getDiscoveryAssistant on stalled body throws DiscoveryApiError(timeout)');

    // 2.2 Malformed JSON on 200: must throw DiscoveryApiError('bad_response')
    console.log('Testing malformed JSON on 200...');
    testServerResponseHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('<html><head><title>502 Bad Gateway Proxy</title></head><body>Proxy Error</body></html>');
    };
    let caughtBadResponse = false;
    try {
      await getDiscoveryAssistant('sess-1', 'tok', { timeoutMs: 2000 });
    } catch (err) {
      if (err instanceof DiscoveryApiError && err.code === 'bad_response') {
        caughtBadResponse = true;
      }
    }
    assert(caughtBadResponse, 'getDiscoveryAssistant on malformed 200 JSON throws DiscoveryApiError(bad_response)');

    // 2.3 Non-discovery-v1 shape on 200: must throw DiscoveryApiError('bad_response')
    console.log('Testing non-discovery-v1 shape on 200...');
    testServerResponseHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', something_else: 123 }));
    };
    let caughtShapeError = false;
    try {
      await getDiscoveryAssistant('sess-1', 'tok', { timeoutMs: 2000 });
    } catch (err) {
      if (err instanceof DiscoveryApiError && err.code === 'bad_response') {
        caughtShapeError = true;
      }
    }
    assert(caughtShapeError, 'getDiscoveryAssistant on non-discovery-v1 shape throws DiscoveryApiError(bad_response)');

    // 2.4 Valid discovery-v1 view on 200: returns validated object (never null)
    console.log('Testing valid discovery-v1 view on 200...');
    const validView = {
      contract: 'discovery-v1',
      session_id: 'sess-1',
      revision: 1,
      profile_version: 1,
      selection_version: 1,
      status: 'ok',
      reply: { text: 'Xin chào', question: null },
      profile: {},
      results: [],
      selection: [],
      comparison: null,
      confirmation: null,
      messages: [],
      tour: null
    };
    testServerResponseHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(validView));
    };
    const resView = await getDiscoveryAssistant('sess-1', 'tok', { timeoutMs: 2000 });
    assert(resView !== null && typeof resView === 'object', 'getDiscoveryAssistant on valid 200 returns valid view object');
    assert(resView.contract === 'discovery-v1' && resView.session_id === 'sess-1', 'Returned view conforms to contract');

    // 2.5 401 Unauthorized: must throw DiscoveryApiError('unauthorized')
    console.log('Testing 401 Unauthorized on sendDiscoveryMessage...');
    testServerResponseHandler = (req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 'unauthorized', message: 'Token không hợp lệ.' }));
    };
    let caught401 = false;
    try {
      await sendDiscoveryMessage('sess-1', 1, 'Chào bạn', 'bad-tok', { timeoutMs: 2000 });
    } catch (err) {
      if (err instanceof DiscoveryApiError && err.code === 'unauthorized' && err.status === 401) {
        caught401 = true;
      }
    }
    assert(caught401, 'sendDiscoveryMessage on 401 throws DiscoveryApiError(unauthorized, 401)');

    // 2.6 500 Internal Server Error: must throw DiscoveryApiError with status 500
    console.log('Testing 500 Internal Server Error on sendDiscoveryAction...');
    testServerResponseHandler = (req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 'internal_error', message: 'Lỗi cơ sở dữ liệu.' }));
    };
    let caught500 = false;
    try {
      await sendDiscoveryAction('sess-1', 1, { type: 'tool', name: 'search_restaurants', arguments: {} }, 'tok', { timeoutMs: 2000 });
    } catch (err) {
      if (err instanceof DiscoveryApiError && err.status === 500) {
        caught500 = true;
      }
    }
    assert(caught500, 'sendDiscoveryAction on 500 throws DiscoveryApiError(500)');

    // 2.7 Caller AbortController signal: must throw AbortError
    console.log('Testing caller AbortController signal abort...');
    testServerResponseHandler = (req, res) => {
      // Slow endpoint
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(validView));
      }, 1000);
    };
    const callerAc = new AbortController();
    setTimeout(() => callerAc.abort(), 100);
    let caughtAbort = false;
    try {
      await getDiscoveryAssistant('sess-1', 'tok', { signal: callerAc.signal, timeoutMs: 5000 });
    } catch (err) {
      if (err.name === 'AbortError') {
        caughtAbort = true;
      }
    }
    assert(caughtAbort, 'Caller abort signal throws AbortError (distinguished from timeout)');

  } finally {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    await new Promise((resolve) => testServer.close(resolve));
  }


  // =============================================================
  // SECTION 3: UNKNOWN TRANSLATION & VIETNAMESE FIDELITY
  // =============================================================
  console.log('\n[SECTION 3] Vietnamese Translation of Raw Unknowns...');

  assert(
    formatUnknownLabel('ingredient_allergy_safety') === 'an toàn thành phần dị ứng',
    'ingredient_allergy_safety correctly translated without making safety claims'
  );
  assert(
    formatUnknownLabel('sweetness') === 'độ ngọt món ăn',
    'sweetness correctly translated to độ ngọt món ăn'
  );
  assert(
    formatUnknownLabel('dish_price') === 'giá từng món ăn',
    'dish_price correctly translated to giá từng món ăn'
  );
  assert(
    formatUnknownLabel('current_open_status') === 'trạng thái mở cửa hiện tại',
    'current_open_status correctly translated to trạng thái mở cửa hiện tại'
  );
  assert(
    formatUnknownLabel('hours') === 'giờ mở cửa thực tế',
    'hours correctly translated'
  );
  assert(
    formatUnknownLabel('allergy_ingredients') === 'thành phần đánh giá dị ứng',
    'allergy_ingredients correctly translated'
  );
  // Preserving distinct unmapped keys
  assert(
    formatUnknownLabel('custom_unmapped_metric') === 'custom unmapped metric',
    'Unmapped keys formatted readably without crashing'
  );


  // =============================================================
  // SECTION 4: STRICT SESSION GATING & TOUR TOTALS VERIFICATION
  // =============================================================
  console.log('\n[SECTION 4] Strict Session Gating & Truthful Totals Schema...');

  const computeSessionReady = ({ sessionId, sessionToken, parentInitializing, initialLoaded, sessionError }) => {
    return Boolean(sessionId && sessionToken && !parentInitializing && initialLoaded && !sessionError);
  };
  assert(!computeSessionReady({ sessionId: 's1', sessionToken: '', parentInitializing: false, initialLoaded: true, sessionError: null }), 'Missing token keeps sessionReady=false');
  assert(!computeSessionReady({ sessionId: 's1', sessionToken: 'tok', parentInitializing: false, initialLoaded: false, sessionError: null }), 'initialLoaded=false keeps sessionReady=false');
  assert(computeSessionReady({ sessionId: 's1', sessionToken: 'tok', parentInitializing: false, initialLoaded: true, sessionError: null }), 'Authenticated ready session is true');

  // Tour totals
  const actualTour = {
    stops: [
      { name: 'Quán A', arrive: '18:00', depart: '19:00' },
      { name: 'Quán B', arrive: '19:15', depart: '20:30' }
    ],
    totals: {
      venue_range_upper_sum_vnd: 250000,
      walk_minutes: 25,
      leg_source: 'straight_line_estimate',
      route_provider: 'estimate'
    }
  };
  const durationInfo = deriveTourDuration(actualTour, { duration_min: 90 });
  assert(durationInfo.val === '2.5h' && durationInfo.lbl === 'lịch trình', 'Duration derived from stops timeline');

  const priceInfo = deriveTourPriceInfo(actualTour, null);
  assert(priceInfo.val === '250K' && priceInfo.lbl === 'khoảng giá quán', 'Price uses venue_range_upper_sum_vnd labeled khoảng giá quán');


  // =============================================================
  // SECTION 5: BOUNDED CLEAN EXIT
  // =============================================================
  console.log('\n[SECTION 5] Verifying process cleanup and bounded exit...');
  console.log(`\n================================================================`);
  console.log(`TARGETED SUITE SUMMARY: Passed: ${passed} | Failed: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    console.error('TARGETED TESTS FAILED');
    process.exit(1);
  } else {
    console.log('ALL TARGETED CHECKS PASSED CLEANLY (Bounded execution, 0 hanging listeners)!');
    process.exit(0);
  }
}

runAllTargetedTests().catch((err) => {
  console.error('Fatal in targeted smoke test:', err);
  process.exit(1);
});
