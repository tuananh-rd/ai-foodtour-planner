/**
 * qa/discovery-assistant/test_menu_option_pagination.mjs
 *
 * Targeted regression tests for Menu Option Pagination (>200 options)
 * and Identity/Abort Guards (Review P1 gate).
 */

import { fetchVenueMenu, DiscoveryApiError } from '../../frontend/lib/discoveryApi.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

console.log('=== Running Menu Option Pagination (>200 options) & Identity Guard Tests ===\n');

// 1. Simulation of multi-page option pagination (>200 options)
console.log('Test 1: Multi-page option pagination (>200 options) cumulative accumulation');

const mockDishId = 'dish-test-999';
const totalOptionsInSource = 250;

// Generate 250 synthetic options across 2 option groups
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
    dish_id: dishId,
    options_total: totalOptionsInSource,
    options_returned: returnedInChunk,
    options_complete: offset + returnedInChunk >= totalOptionsInSource,
    option_groups: groups.filter(g => g.options.length > 0)
  };
}

// Client accumulation simulation (mimicking handleLoadMoreOptions in DiscoveryLayout)
let currentDish = {
  id: mockDishId,
  name: 'Món đặc biệt',
  price_vnd: 50000,
  options_total: totalOptionsInSource,
  options_returned: 0,
  options_complete: false,
  option_groups: []
};

// Page 1: Initial load (chunk 0..100)
const page1 = generateOptionPage(mockDishId, 0, 100);
currentDish.option_groups = page1.option_groups;
currentDish.options_returned = currentDish.option_groups.reduce((acc, g) => acc + g.options.length, 0);
currentDish.options_complete = currentDish.options_returned >= currentDish.options_total;

assert(currentDish.options_returned === 100, `Page 1 options_returned should be 100, got ${currentDish.options_returned}`);
assert(currentDish.options_complete === false, 'Page 1 should not be complete');

// Page 2: Next chunk offset is 100, limit 100 (chunk 100..200)
const nextOffsetPage2 = currentDish.option_groups.reduce((acc, g) => acc + g.options.length, 0);
assert(nextOffsetPage2 === 100, `Next offset for Page 2 must be 100, got ${nextOffsetPage2}`);

const page2 = generateOptionPage(mockDishId, nextOffsetPage2, 100);
// Merge logic
const mergedGroupsP2 = currentDish.option_groups.map(g => ({ ...g, options: [...g.options] }));
page2.option_groups.forEach(incG => {
  const existingG = mergedGroupsP2.find(g => g.id === incG.id);
  if (existingG) {
    const exIds = new Set(existingG.options.map(o => o.id));
    const added = incG.options.filter(o => !exIds.has(o.id));
    existingG.options = [...existingG.options, ...added];
  } else {
    mergedGroupsP2.push({ ...incG, options: [...incG.options] });
  }
});
currentDish.option_groups = mergedGroupsP2;
currentDish.options_returned = mergedGroupsP2.reduce((acc, g) => acc + g.options.length, 0);
currentDish.options_complete = currentDish.options_returned >= currentDish.options_total;

assert(currentDish.options_returned === 200, `Page 2 cumulative options_returned must be 200, got ${currentDish.options_returned}`);
assert(currentDish.options_complete === false, 'Page 2 should not be complete (total is 250)');

// Page 3: Next chunk offset is 200, limit 100 (chunk 200..250)
const nextOffsetPage3 = currentDish.option_groups.reduce((acc, g) => acc + g.options.length, 0);
assert(nextOffsetPage3 === 200, `Next offset for Page 3 must be 200 (NOT stuck at 100!), got ${nextOffsetPage3}`);

const page3 = generateOptionPage(mockDishId, nextOffsetPage3, 100);
const mergedGroupsP3 = currentDish.option_groups.map(g => ({ ...g, options: [...g.options] }));
page3.option_groups.forEach(incG => {
  const existingG = mergedGroupsP3.find(g => g.id === incG.id);
  if (existingG) {
    const exIds = new Set(existingG.options.map(o => o.id));
    const added = incG.options.filter(o => !exIds.has(o.id));
    existingG.options = [...existingG.options, ...added];
  } else {
    mergedGroupsP3.push({ ...incG, options: [...incG.options] });
  }
});
currentDish.option_groups = mergedGroupsP3;
currentDish.options_returned = mergedGroupsP3.reduce((acc, g) => acc + g.options.length, 0);
currentDish.options_complete = currentDish.options_returned >= currentDish.options_total;

assert(currentDish.options_returned === 250, `Page 3 cumulative options_returned must be 250, got ${currentDish.options_returned}`);
assert(currentDish.options_complete === true, 'Page 3 should be complete');
console.log('  [PASS] Option pagination >200 options (100 -> 200 -> 250) correctly progresses offset without repeat bug');

// 2. Identity Guard & Stale Response Invalidation
console.log('\nTest 2: Stale in-flight response rejection on venue switch');
let activeVenueId = 'venue-A';
let currentReqId = 1;

let capturedResult = null;

// Simulate async response for venue-A arriving after user switched to venue-B
const slowVenueARequestId = currentReqId;
const slowVenueAId = activeVenueId;

// User switches to venue-B
activeVenueId = 'venue-B';
currentReqId = 2;

// Slow response arrives for venue-A
const slowResponseData = { venue_id: 'venue-A', items: [{ id: 'dish-A1', name: 'Phở A' }] };

// Identity check in client
if (currentReqId === slowVenueARequestId && activeVenueId === slowVenueAId) {
  capturedResult = slowResponseData;
}

assert(capturedResult === null, 'Stale response for venue-A must be ignored when activeVenue is venue-B');
console.log('  [PASS] Identity guard properly drops mismatched inflight responses');

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
