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
  formatUnknownLabel,
  DiscoveryApiError
} from '../../frontend/lib/discoveryApi.js';

import {
  buildDiscoveryMapsUrl,
  buildDiscoveryMapsSplitUrls
} from '../../frontend/lib/discoveryMaps.js';

import { isValidGoogleMapsDirUrl } from '../../frontend/lib/mapsUrlValidation.js';

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

assertThrows(() => updateSettingsAction({ chat_model: null }), 'invalid_action', 'updateSettingsAction rejects null chat_model');
assertThrows(() => validateDiscoveryAction({ type: 'settings', arguments: { chat_model: null } }), 'invalid_action', 'validateDiscoveryAction rejects chat_model: null');
assertThrows(() => validateDiscoveryAction({ type: 'settings', arguments: { web_search_enabled: null } }), 'invalid_action', 'validateDiscoveryAction rejects web_search_enabled: null');

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
assertThrows(() => setCoordinatesLocationAction('', 105.8), 'invalid_action', 'setCoordinatesLocationAction rejects empty string latitude');
assertThrows(() => setCoordinatesLocationAction(21.0, ''), 'invalid_action', 'setCoordinatesLocationAction rejects empty string longitude');

// 3. Format Server-Computed Distance Display
console.log('\n[3] Testing Server Distance Display Formatting...');
assert(formatDistanceDisplay({ distance_m: 450 }) === '~450 m (đường chim bay)', 'Formats distance < 1000m in meters with (đường chim bay)');
assert(formatDistanceDisplay({ distance_m: 1250 }) === '~1.3 km (đường chim bay)', 'Formats distance >= 1000m in kilometers rounded to 1 decimal');
assert(formatDistanceDisplay({ distance_m: 0 }) === '~0 m (đường chim bay)', 'Formats 0 meters correctly without null-fallthrough');
assert(formatDistanceDisplay({ distance_m: null }) === 'Chưa có khoảng cách', 'Formats null distance_m as "Chưa có khoảng cách"');
assert(formatDistanceDisplay({ distance_m: null, distance_reason: 'origin_missing' }) === 'Chưa có khoảng cách (chưa có điểm xuất phát)', 'Translates origin_missing reason');
assert(formatDistanceDisplay({ distance_m: null, distance_reason: 'venue_coordinates_missing' }) === 'Chưa có khoảng cách (quán thiếu toạ độ)', 'Translates venue_coordinates_missing reason');
assert(formatDistanceDisplay({ distance_m: null, distance_reason: 'custom_reason' }) === 'Chưa có khoảng cách (custom_reason)', 'Passes through custom distance_reason when distance_m is null');
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

// 5. GPS Delayed Callback Lifecycle & Stale Session Protection
console.log('\n[5] Testing GPS Delayed Callback & Stale Session Protection...');
let currentSession = { sessionId: 'sess-1', sessionToken: 'tok-1', revision: 1 };
const dispatchedActions = [];

function mockHandleDispatchAction(action) {
  dispatchedActions.push({ session: { ...currentSession }, action });
}

function simulateGpsTrigger(getLatestSession, onStaleIgnored) {
  const invokedSessionId = getLatestSession().sessionId;
  const invokedToken = getLatestSession().sessionToken;

  return function onGpsSuccess(lat, lon) {
    const live = getLatestSession();
    if (invokedSessionId !== live.sessionId || invokedToken !== live.sessionToken) {
      onStaleIgnored({ invokedSessionId, liveSessionId: live.sessionId });
      return;
    }
    mockHandleDispatchAction(setCoordinatesLocationAction(lat, lon, 'gps'));
  };
}

let staleCount = 0;
const gpsCallback = simulateGpsTrigger(() => currentSession, () => { staleCount += 1; });

// Simulate user resets session while GPS callback is in-flight
currentSession = { sessionId: 'sess-2', sessionToken: 'tok-2', revision: 0 };

// Geolocation callback executes now
gpsCallback(21.0285, 105.8542);

assert(dispatchedActions.length === 0, 'No action dispatched to old or new session when session changed');
assert(staleCount === 1, 'Stale GPS callback ignored when session ID changed');

// Test with unchanged session
const matchingCallback = simulateGpsTrigger(() => currentSession, () => {});
matchingCallback(21.033, 105.85);
assert(dispatchedActions.length === 1, 'Action dispatched when session is unchanged');
assert(dispatchedActions[0].session.sessionId === 'sess-2', 'Dispatched to correct live session');
assert(dispatchedActions[0].action.arguments.lat === 21.033, 'Dispatched with correct coordinates');

// 6. Unknown Labels & elderly_access Translation
console.log('\n[6] Testing Unknown Labels & elderly_access Vietnamese Translation...');
assert(formatUnknownLabel('elderly_access') === 'tiếp cận người cao tuổi / đi lại thuận tiện', 'Translates elderly_access to Vietnamese without English leak');
assert(formatUnknownLabel('ingredient_allergy_safety') === 'an toàn thành phần dị ứng', 'Translates ingredient_allergy_safety');
assert(formatUnknownLabel('sweetness') === 'độ ngọt món ăn', 'Translates sweetness');

// 7. Discovery Maps URL and Split Multi-Run Chains
console.log('\n[7] Testing Discovery Maps URLs & Multi-Run Split Chains...');
const sampleOrigin = { lat: 21.0285, lon: 105.8542, label: 'Khách sạn Hà Nội' };
const stops1 = [{ name: 'Quán 1', lat: 21.030, lon: 105.850 }];
const stops4 = [
  { name: 'Quán 1', lat: 21.030, lon: 105.850 },
  { name: 'Quán 2', lat: 21.031, lon: 105.851 },
  { name: 'Quán 3', lat: 21.032, lon: 105.852 },
  { name: 'Quán 4', lat: 21.033, lon: 105.853 }
];
const stops5 = [
  ...stops4,
  { name: 'Quán 5', lat: 21.034, lon: 105.854 }
];
const stops6 = [
  ...stops5,
  { name: 'Quán 6', lat: 21.035, lon: 105.855 }
];

// No origin must return empty array / null
assert(buildDiscoveryMapsUrl({ origin: null, stops: stops4 }) === null, 'buildDiscoveryMapsUrl returns null without valid origin');
assert(buildDiscoveryMapsSplitUrls({ origin: null, stops: stops4 }).length === 0, 'buildDiscoveryMapsSplitUrls returns empty array without valid origin');

// Single stop with origin
const split1 = buildDiscoveryMapsSplitUrls({ origin: sampleOrigin, stops: stops1 });
assert(split1.length === 1, '1-stop tour produces exactly 1 split link');
assert(isValidGoogleMapsDirUrl(split1[0].url), '1-stop split URL is valid Google Maps dir URL');
assert(split1[0].waypointCount === 0, '1-stop split URL has 0 waypoints');

// 4 stops with origin (5 points total: origin + 3 waypoints + destination)
const split4 = buildDiscoveryMapsSplitUrls({ origin: sampleOrigin, stops: stops4 });
assert(split4.length === 1, '4-stop tour produces 1 link fitting max 3 waypoints');
assert(isValidGoogleMapsDirUrl(split4[0].url), '4-stop URL is valid Google Maps dir URL');
assert(split4[0].waypointCount === 3, '4-stop URL has exactly 3 waypoints');
const url4Info = buildDiscoveryMapsUrl({ origin: sampleOrigin, stops: stops4 });
assert(url4Info !== null && url4Info.isSplit === false, '4-stop buildDiscoveryMapsUrl has isSplit: false');

// 5 stops with origin (6 points total: origin + 5 stops)
// Must split into 2 links: Link 1 (points 0..4, 3 waypoints), Link 2 (points 4..5, 0 waypoints)
const split5 = buildDiscoveryMapsSplitUrls({ origin: sampleOrigin, stops: stops5 });
assert(split5.length === 2, '5-stop tour with origin splits into exactly 2 links to bound waypoints <= 3');
assert(isValidGoogleMapsDirUrl(split5[0].url), 'Split 5 link 1 is valid');
assert(isValidGoogleMapsDirUrl(split5[1].url), 'Split 5 link 2 is valid');
assert(split5[0].waypointCount <= 3, 'Split 5 link 1 has <= 3 waypoints');
assert(split5[1].waypointCount <= 3, 'Split 5 link 2 has <= 3 waypoints');
assert(split5[0].toName === split5[1].fromName, 'Split 5 links chain contiguously (zero stops dropped)');
const url5Info = buildDiscoveryMapsUrl({ origin: sampleOrigin, stops: stops5 });
assert(url5Info !== null && url5Info.isSplit === true, '5-stop buildDiscoveryMapsUrl indicates isSplit: true');
assert(url5Info.splitLinks.length === 2, '5-stop buildDiscoveryMapsUrl includes all splitLinks');

// 6 stops with origin (7 points total)
const split6 = buildDiscoveryMapsSplitUrls({ origin: sampleOrigin, stops: stops6 });
assert(split6.length === 2, '6-stop tour with origin splits into 2 links');
assert(split6[0].waypointCount <= 3 && split6[1].waypointCount <= 3, 'All 6-stop links have waypoints <= 3');
assert(split6[0].toName === split6[1].fromName, '6-stop links chain contiguously without dropping stops');

// 8. Shared Synchronous Operation Lock & Concurrency Simulation
console.log('\n[8] Testing Shared Operation Lock across GPS pending and Chat...');
class MockOperationManager {
  constructor() {
    this.operationLock = false;
    this.gpsPending = false;
    this.chatCalls = 0;
    this.gpsSuccessCalls = 0;
  }

  triggerChat(text) {
    if (this.operationLock || this.gpsPending) return false;
    this.operationLock = true;
    try {
      this.chatCalls += 1;
      return true;
    } finally {
      this.operationLock = false;
    }
  }

  triggerGps(mockPosCallback, mockErrCallback) {
    if (this.operationLock || this.gpsPending) return false;
    this.operationLock = true;
    this.gpsPending = true;

    // Simulate async geolocation API
    this._resolveGps = (pos) => {
      // Release lock BEFORE callback dispatch
      this.operationLock = false;
      this.gpsPending = false;
      if (mockPosCallback) mockPosCallback(pos);
    };

    this._rejectGps = (err) => {
      this.operationLock = false;
      this.gpsPending = false;
      if (mockErrCallback) mockErrCallback(err);
    };

    return true;
  }
}

const mgr = new MockOperationManager();
assert(mgr.triggerGps(() => { mgr.gpsSuccessCalls += 1; }), 'Initial GPS trigger acquires lock and starts');
assert(mgr.gpsPending === true, 'gpsPending is true while waiting for browser geolocation');
assert(mgr.operationLock === true, 'operationLock is held while GPS is pending');

// Concurrent chat while GPS pending must be blocked
const chatBlocked = mgr.triggerChat('Tìm quán phở');
assert(chatBlocked === false, 'Chat dispatch is blocked while GPS is pending');
assert(mgr.chatCalls === 0, 'No chat message processed during GPS pending');

// GPS callback completes
mgr._resolveGps({ coords: { latitude: 21.0285, longitude: 105.8542 } });
assert(mgr.gpsPending === false, 'gpsPending released on callback completion');
assert(mgr.operationLock === false, 'operationLock released before action dispatch');
assert(mgr.gpsSuccessCalls === 1, 'GPS success callback executed');

// Now chat can proceed cleanly
const chatAllowed = mgr.triggerChat('Tìm quán bún chả');
assert(chatAllowed === true, 'Chat dispatch succeeds after GPS lock is released');
assert(mgr.chatCalls === 1, 'Chat processed successfully');

// Test error callback releases lock
const mgrErr = new MockOperationManager();
mgrErr.triggerGps(null, () => {});
assert(mgrErr.operationLock === true, 'Lock acquired on second GPS trigger');
mgrErr._rejectGps(new Error('Permission denied'));
assert(mgrErr.operationLock === false, 'Lock released on GPS error');
assert(mgrErr.gpsPending === false, 'gpsPending released on GPS error');

console.log('\n================================================================');
console.log(`DISCOVERY UPGRADE UNIT TESTS: Passed: ${passed} | Failed: ${failed}`);
console.log('================================================================');
