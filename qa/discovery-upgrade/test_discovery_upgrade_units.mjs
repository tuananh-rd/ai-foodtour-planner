/**
 * qa/discovery-upgrade/test_discovery_upgrade_units.mjs
 * Unit test suite for Discovery-v1 upgrade:
 * - validateDiscoveryAction (settings, location operations, tool, confirm)
 * - action creator helpers (updateSettingsAction, resolveLocationAction, etc.)
 * - formatDistanceDisplay ("đường chim bay", unknown coordinates, reason formatting)
 * - emoji normalization across new contract fields (settings, location, web sources, distance)
 */

import {
  validateDiscoveryAction,
  updateSettingsAction,
  resolveLocationAction,
  chooseLocationCandidateAction,
  setCoordinatesLocationAction,
  clearLocationAction,
  formatDistanceDisplay,
  DiscoveryApiError
} from '../../frontend/lib/discoveryApi.js';

import {
  normalizeDisplayText,
  sanitizeRestaurantForDisplay,
  sanitizeViewForDisplay
} from '../../frontend/lib/emojiSanitizer.js';

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

function assertThrows(fn, expectedCode, message) {
  try {
    fn();
    console.error(`[FAIL] ${message} (Did not throw)`);
    failed += 1;
    throw new Error(`Expected throw: ${message}`);
  } catch (err) {
    if (err instanceof DiscoveryApiError && err.code === expectedCode) {
      console.log(`[PASS] ${message} (Threw ${expectedCode})`);
      passed += 1;
    } else if (err.name === 'DiscoveryApiError' && (!expectedCode || err.code === expectedCode)) {
      console.log(`[PASS] ${message}`);
      passed += 1;
    } else {
      console.error(`[FAIL] ${message} (Unexpected error: ${err.message})`);
      failed += 1;
      throw err;
    }
  }
}

console.log('=== RUNNING DISCOVERY UPGRADE UNIT TESTS ===\n');

// 1. Settings Action Validation & Creators
console.log('[1] Testing Settings Action Validation & Action Creator...');
const s1 = updateSettingsAction({ chat_model: 'gemini-2.5-flash', web_search_enabled: true });
assert(s1.type === 'settings' && s1.arguments.chat_model === 'gemini-2.5-flash' && s1.arguments.web_search_enabled === true, 'updateSettingsAction creates valid payload');
assert(validateDiscoveryAction(s1) === s1, 'validateDiscoveryAction accepts full settings action');

const s2 = updateSettingsAction({ web_search_enabled: false });
assert(validateDiscoveryAction(s2).arguments.web_search_enabled === false, 'validateDiscoveryAction accepts web_search_enabled alone');

const s3 = updateSettingsAction({ chat_model: null });
assert(validateDiscoveryAction(s3).arguments.chat_model === null, 'validateDiscoveryAction accepts chat_model: null');

assertThrows(() => validateDiscoveryAction({ type: 'settings', arguments: {} }), 'invalid_action', 'Rejects empty settings arguments');
assertThrows(() => validateDiscoveryAction({ type: 'settings', arguments: { chat_model: 123 } }), 'invalid_action', 'Rejects numeric chat_model');
assertThrows(() => validateDiscoveryAction({ type: 'settings', arguments: { web_search_enabled: 'yes' } }), 'invalid_action', 'Rejects non-boolean web_search_enabled');

// 2. Location Action Validation & Creators
console.log('\n[2] Testing Location Action Validation & Action Creators...');
const lResolve = resolveLocationAction('Chợ Hôm');
assert(lResolve.type === 'location' && lResolve.arguments.operation === 'resolve' && lResolve.arguments.query === 'Chợ Hôm', 'resolveLocationAction creates valid resolve action');
assert(validateDiscoveryAction(lResolve) === lResolve, 'validateDiscoveryAction accepts resolve operation');

const lChoose = chooseLocationCandidateAction('cand-hn-123');
assert(lChoose.type === 'location' && lChoose.arguments.operation === 'choose' && lChoose.arguments.candidate_id === 'cand-hn-123', 'chooseLocationCandidateAction creates choose action');
assert(validateDiscoveryAction(lChoose) === lChoose, 'validateDiscoveryAction accepts choose operation');

const lGps = setCoordinatesLocationAction(21.0285, 105.8542, 'gps');
assert(lGps.type === 'location' && lGps.arguments.operation === 'coordinates' && lGps.arguments.lat === 21.0285 && lGps.arguments.source === 'gps', 'setCoordinatesLocationAction creates GPS coordinates action');
assert(validateDiscoveryAction(lGps) === lGps, 'validateDiscoveryAction accepts valid GPS coordinates');

const lClear = clearLocationAction();
assert(lClear.type === 'location' && lClear.arguments.operation === 'clear', 'clearLocationAction creates clear action');
assert(validateDiscoveryAction(lClear) === lClear, 'validateDiscoveryAction accepts clear operation');

assertThrows(() => validateDiscoveryAction({ type: 'location', arguments: { operation: 'unknown' } }), 'invalid_action', 'Rejects unsupported location operation');
assertThrows(() => validateDiscoveryAction({ type: 'location', arguments: { operation: 'resolve', query: '' } }), 'invalid_action', 'Rejects empty resolve query');
assertThrows(() => validateDiscoveryAction({ type: 'location', arguments: { operation: 'choose' } }), 'invalid_action', 'Rejects choose without candidate_id');
assertThrows(() => validateDiscoveryAction({ type: 'location', arguments: { operation: 'coordinates', lat: 999, lon: 105.8 } }), 'invalid_action', 'Rejects out-of-range latitude');

// 3. Format Server-Computed Distance Display
console.log('\n[3] Testing Server Distance Display Formatting...');
assert(formatDistanceDisplay({ distance_m: 450 }) === '~450 m (đường chim bay)', 'Formats distance < 1000m in meters with (đường chim bay)');
assert(formatDistanceDisplay({ distance_m: 1250 }) === '~1.3 km (đường chim bay)', 'Formats distance >= 1000m in kilometers rounded to 1 decimal');
assert(formatDistanceDisplay({ distance_m: 0 }) === '~0 m (đường chim bay)', 'Formats 0 meters correctly without null-fallthrough');
assert(formatDistanceDisplay({ distance_m: null }) === 'Chưa có khoảng cách', 'Formats null distance_m as "Chưa có khoảng cách"');
assert(formatDistanceDisplay({ distance_m: null, distance_reason: 'Chưa chọn điểm xuất phát' }) === 'Chưa có khoảng cách (Chưa chọn điểm xuất phát)', 'Appends distance_reason when distance_m is null');
assert(formatDistanceDisplay(null) === null, 'Returns null on null input');

// 4. Emoji Sanitization on New Contract Fields
console.log('\n[4] Testing Emoji Sanitization on New Discovery-v1 Fields...');
const rawVenueWithDistance = {
  id: 'venue-101',
  name: 'Phở 🍜 Thìn',
  address: '13 Lò Đúc 📍',
  distance_m: 850,
  distance_source: 'haversine',
  distance_reason: 'Khoảng cách 🧭 thực tế'
};
const cleanVenue = sanitizeRestaurantForDisplay(rawVenueWithDistance);
assert(cleanVenue.id === 'venue-101', 'Preserves raw venue ID');
assert(cleanVenue.name === 'Phở Thìn', 'Sanitizes restaurant name');
assert(cleanVenue.address === '13 Lò Đúc', 'Sanitizes restaurant address');
assert(cleanVenue.distance_m === 850, 'Preserves numeric distance_m without mutation');
assert(cleanVenue.distance_source === 'haversine', 'Preserves distance_source string');
assert(cleanVenue.distance_reason === 'Khoảng cách thực tế', 'Sanitizes distance_reason text');

const rawViewWithNewContract = {
  contract: 'discovery-v1',
  session_id: 'sess-test-456',
  token: 'raw-token-abc',
  revision: 5,
  settings: {
    chat_model: 'gemini-2.5-flash',
    web_search_enabled: true
  },
  location: {
    status: 'candidates',
    label: 'Chợ Hôm 🛒',
    source: 'catalog',
    approximate: true,
    candidates: [
      { id: 'cand-1', label: 'Chợ Hôm Đức Viên 🏬', lat: 21.018, lon: 105.852, approximate: false },
      { id: 'cand-2', label: 'Phố Huế 📍', lat: 21.020, lon: 105.850, approximate: true }
    ]
  },
  web: {
    enabled: true,
    status: 'ok',
    reason: 'Tìm kiếm thành công 🔍',
    sources: [
      {
        title: 'Review Phở Bát Đàn 🍜',
        url: 'https://example.com/pho',
        retrieved_at: '2026-10-20T08:00:00Z',
        snippet: 'Nước dùng ngọt thanh đậm đà 😋',
        untrusted: true
      }
    ]
  }
};

const cleanView = sanitizeViewForDisplay(rawViewWithNewContract);
assert(cleanView.session_id === 'sess-test-456', 'Preserves raw session_id');
assert(cleanView.token === 'raw-token-abc', 'Preserves raw session token');
assert(cleanView.settings.chat_model === 'gemini-2.5-flash', 'Preserves settings chat_model ID');
assert(cleanView.settings.web_search_enabled === true, 'Preserves settings web_search_enabled');
assert(cleanView.location.status === 'candidates', 'Preserves location status');
assert(cleanView.location.label === 'Chợ Hôm', 'Sanitizes location label');
assert(cleanView.location.candidates[0].id === 'cand-1', 'Preserves candidate id');
assert(cleanView.location.candidates[0].label === 'Chợ Hôm Đức Viên', 'Sanitizes candidate 1 label');
assert(cleanView.location.candidates[1].label === 'Phố Huế', 'Sanitizes candidate 2 label');
assert(cleanView.location.candidates[1].approximate === true, 'Preserves candidate approximate flag');
assert(cleanView.web.reason === 'Tìm kiếm thành công', 'Sanitizes web reason text');
assert(cleanView.web.sources[0].title === 'Review Phở Bát Đàn', 'Sanitizes web source title');
assert(cleanView.web.sources[0].snippet === 'Nước dùng ngọt thanh đậm đà', 'Sanitizes web source snippet');
assert(cleanView.web.sources[0].url === 'https://example.com/pho', 'Preserves raw web source URL');
assert(cleanView.web.sources[0].untrusted === true, 'Preserves untrusted source flag');

console.log('\n================================================================');
console.log(`DISCOVERY UPGRADE UNIT TESTS: Passed: ${passed} | Failed: ${failed}`);
console.log('================================================================');
