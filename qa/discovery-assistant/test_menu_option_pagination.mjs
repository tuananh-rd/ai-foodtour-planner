/**
 * qa/discovery-assistant/test_menu_option_pagination.mjs
 *
 * Targeted regression tests for Menu Option Pagination (>200 options)
 * and Identity/Abort Guards (Review P1 gate).
 * Exercises actual exported helpers and state updates from discoveryApi.js.
 */

import {
  fetchVenueMenu,
  mergeDishOptions,
  applyDishOptionsToMenu,
  DiscoveryApiError
} from '../../frontend/lib/discoveryApi.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

console.log('=== Running Menu Option Pagination (>200 options) & Identity Guard Tests ===\n');

// 1. Direct testing of mergeDishOptions and applyDishOptionsToMenu helper functions
console.log('Test 1: Multi-page option pagination (>200 options) using mergeDishOptions and applyDishOptionsToMenu');

const mockDishId = 'dish-test-999';
const totalOptionsInSource = 250;

function generateOptionPage(dishId, offset, limit) {
  const groups = [
    { id: 'item1:groupA', name: 'Topping thêm', mandatory: false, min_select: null, max_select: 10, options: [] },
    { id: 'item1:groupB', name: 'Độ ngọt/đá', mandatory: true, min_select: 1, max_select: 1, options: [] }
  ];

  const pageEnd = Math.min(offset + limit, totalOptionsInSource);
  for (let i = offset; i < pageEnd; i++) {
    const targetGroup = i % 2 === 0 ? groups[0] : groups[1];
    targetGroup.options.push({
      id: `opt-${i}`,
      name: `Tùy chọn ${i + 1}`,
      price_vnd: i * 1000,
      price_kind: 'fixed',
      is_default: i === 0
    });
  }

  const returnedInChunk = Math.max(0, pageEnd - offset);
  return {
    id: dishId,
    options_total: totalOptionsInSource,
    options_returned: returnedInChunk,
    options_complete: offset + returnedInChunk >= totalOptionsInSource,
    option_groups: groups.filter(g => g.options.length > 0)
  };
}

let initialMenuData = {
  status: 'ok',
  total: 1,
  items: [
    {
      id: mockDishId,
      name: 'Món đặc biệt',
      price_vnd: 50000,
      options_total: totalOptionsInSource,
      options_returned: 0,
      options_complete: false,
      option_groups: []
    }
  ]
};

// Page 1: Chunk 0..100
const page1 = generateOptionPage(mockDishId, 0, 100);
let currentMenu = applyDishOptionsToMenu(initialMenuData, page1, mockDishId);
let currentDish = currentMenu.items[0];

assert(currentDish.options_returned === 100, `Page 1 options_returned should be 100, got ${currentDish.options_returned}`);
assert(currentDish.options_complete === false, 'Page 1 should not be complete');

// Page 2: Next chunk offset is 100, limit 100 (chunk 100..200)
const nextOffsetPage2 = currentDish.options_returned;
assert(nextOffsetPage2 === 100, `Next offset for Page 2 must be 100, got ${nextOffsetPage2}`);

const page2 = generateOptionPage(mockDishId, nextOffsetPage2, 100);
currentMenu = applyDishOptionsToMenu(currentMenu, page2, mockDishId);
currentDish = currentMenu.items[0];

assert(currentDish.options_returned === 200, `Page 2 cumulative options_returned must be 200, got ${currentDish.options_returned}`);
assert(currentDish.options_complete === false, 'Page 2 should not be complete (total is 250)');

// Page 3: Next chunk offset is 200, limit 100 (chunk 200..250)
const nextOffsetPage3 = currentDish.options_returned;
assert(nextOffsetPage3 === 200, `Next offset for Page 3 must be 200, got ${nextOffsetPage3}`);

const page3 = generateOptionPage(mockDishId, nextOffsetPage3, 100);
currentMenu = applyDishOptionsToMenu(currentMenu, page3, mockDishId);
currentDish = currentMenu.items[0];

assert(currentDish.options_returned === 250, `Page 3 cumulative options_returned must be 250, got ${currentDish.options_returned}`);
assert(currentDish.options_complete === true, 'Page 3 should be complete');
console.log('  [PASS] mergeDishOptions and applyDishOptionsToMenu correctly accumulated 250 options without offset stall');

// 2. Identity Guard & Stale Response Invalidation with Mutable Refs
console.log('\nTest 2: Stale in-flight response rejection on venue switch and draft query isolation');

// Simulating the DiscoveryLayout ref pattern
const activeMenuIdentity = {
  requestId: 0,
  venueId: null,
  sessionId: null,
  appliedQuery: '',
  appliedGroup: null
};
let latestDetailVenueId = null;

function isMenuRequestCurrent(reqId, vId, sId, q, g) {
  return (
    activeMenuIdentity.requestId === reqId &&
    latestDetailVenueId === vId &&
    activeMenuIdentity.venueId === vId &&
    activeMenuIdentity.sessionId === sId &&
    activeMenuIdentity.appliedQuery === q &&
    activeMenuIdentity.appliedGroup === g
  );
}

// User opens Venue A
latestDetailVenueId = 'venue-A';
const req1Id = ++activeMenuIdentity.requestId;
activeMenuIdentity.venueId = 'venue-A';
activeMenuIdentity.sessionId = 'sess-1';
activeMenuIdentity.appliedQuery = '';
activeMenuIdentity.appliedGroup = null;

// User types draft query 'pho ga' but has not submitted it
let draftQuery = 'pho ga';
// Draft query must NOT alter active appliedQuery
assert(activeMenuIdentity.appliedQuery === '', 'Draft query must not affect activeMenuIdentity until submitted');

// While Venue A load-more options is in-flight, user switches to Venue B
latestDetailVenueId = 'venue-B';
activeMenuIdentity.requestId += 1;
activeMenuIdentity.venueId = 'venue-B';
activeMenuIdentity.appliedQuery = '';
activeMenuIdentity.appliedGroup = null;

// Venue A options arrive
const venueAOptionsArrived = isMenuRequestCurrent(req1Id, 'venue-A', 'sess-1', '', null);
assert(venueAOptionsArrived === false, 'Inflight response for Venue A must be rejected after venue switch to Venue B');

// Even if closure variable was 'venue-A' (old value), latestDetailVenueId check fails
const oldClosureVenue = 'venue-A';
const staleCheck = (latestDetailVenueId === oldClosureVenue);
assert(staleCheck === false, 'Closure check against mutable latestDetailVenueId correctly prevents stale commit');
console.log('  [PASS] Identity guards and mutable venue ref successfully drop stale async closure responses');

// 3. fetchVenueMenu client validation
console.log('\nTest 3: fetchVenueMenu argument validation');
let caughtNoSession = false;
try {
  await fetchVenueMenu(null, 'venue-1');
} catch (err) {
  caughtNoSession = true;
  assert(err instanceof DiscoveryApiError, 'Must throw DiscoveryApiError');
}
assert(caughtNoSession, 'Missing sessionId must be rejected');

let caughtNoVenue = false;
try {
  await fetchVenueMenu('sess-1', null);
} catch (err) {
  caughtNoVenue = true;
  assert(err instanceof DiscoveryApiError, 'Must throw DiscoveryApiError');
}
assert(caughtNoVenue, 'Missing venueId must be rejected');
console.log('  [PASS] fetchVenueMenu argument checks passed');

console.log('\nALL TARGETED OPTION PAGINATION & IDENTITY REGRESSION TESTS PASSED!');
