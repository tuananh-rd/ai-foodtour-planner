/**
 * Automated shape & invariant test for frontend/lib/api.js.
 * Verifies that mock responses strictly adhere to contracts/v1/CONTRACT.md.
 */

import {
  isMockMode,
  setRuntimeMockMode,
  getHealth,
  getVenues,
  getVenueById,
  createSession,
  sendMessage,
  updatePreferences,
  planTour,
  replaceTourStop,
  planTourLegacy,
  getVenuesMap,
  getMapsLinks,
  chatTurn,
  getChatState,
  ApiError
} from './api.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log("=== Testing API Client in MOCK MODE against CONTRACT v1 ===");
  setRuntimeMockMode(true);
  assert(isMockMode() === true, "Must be in mock mode");

  // 1. Health endpoint
  console.log("Test 1: GET /health");
  const health = await getHealth();
  assert(health.status === "ok", "health.status must be 'ok'");
  assert(health.dataset_loaded === true, "health.dataset_loaded must be true");
  assert(health.is_mock === true, "health.is_mock must be true");
  console.log("  ✓ Health passed:", health);

  // 2. Venues endpoint
  console.log("Test 2: GET /v1/venues");
  const venuesRes = await getVenues({ limit: 5, offset: 0 });
  assert(Array.isArray(venuesRes.venues), "venues must be an array");
  assert(venuesRes.venues.length === 5, "venues length must be 5");
  assert(venuesRes.total >= 8, "venues total must be >= 8");
  assert(venuesRes.is_mock === true, "is_mock must be true");
  console.log("  ✓ Venues list passed:", venuesRes.venues.length, "items");

  // 3. Venue detail
  console.log("Test 3: GET /v1/venues/{id}");
  const venue = await getVenueById("SYN-001");
  assert(venue.id === "SYN-001", "id must match SYN-001");
  assert(venue.synthetic === true, "must be synthetic");
  assert(typeof venue.lat === "number" && typeof venue.lon === "number", "coords must be numbers");
  console.log("  ✓ Venue detail passed:", venue.name);

  // 4. Create Session
  console.log("Test 4: POST /v1/sessions");
  const session = await createSession();
  assert(session.session_id.startsWith("mock-session"), "session_id format");
  assert(typeof session.token === "string" && session.token.length > 5, "token valid");
  assert(session.revision === 0, "initial revision must be 0");
  console.log("  ✓ Session created:", session.session_id, "revision:", session.revision);

  // 5. Send message with missing slot
  console.log("Test 5: POST /v1/sessions/{id}/messages (missing slot)");
  const missingRes = await sendMessage(session.session_id, "Tìm quán bún ngon quanh Phố Cổ", session.token);
  assert(missingRes.revision === 1, "revision incremented to 1");
  assert(missingRes.tour === null, "tour must be null when missing required slots");
  assert(Array.isArray(missingRes.missing_slots) && missingRes.missing_slots.length > 0, "missing_slots present");
  assert(Array.isArray(missingRes.questions) && missingRes.questions.length > 0, "questions present");
  assert(missingRes.dataset_source === "synthetic", "dataset_source must be synthetic");
  console.log("  ✓ Missing slot handled properly. Missing:", missingRes.missing_slots, "Questions:", missingRes.questions);

  // 6. Send message with full details -> Generates Tour
  console.log("Test 6: POST /v1/sessions/{id}/messages (full preferences -> Tour)");
  const fullRes = await sendMessage(session.session_id, "Đi 2 tiếng, ngân sách 150k mỗi người, thích phở và chè quanh Hoàn Kiếm", session.token);
  assert(fullRes.revision === 2, "revision incremented to 2");
  assert(fullRes.missing_slots.length === 0, "no missing slots");
  assert(fullRes.tour !== null, "tour generated");
  assert(fullRes.tour.status === "conditional", "status is conditional");
  assert(fullRes.tour.stops.length === 3, "tour has 3 stops");
  assert(fullRes.tour.unknowns.includes("hours"), "unknowns contains hours");
  assert(fullRes.tour.unknowns.includes("route"), "unknowns contains route");
  assert(fullRes.tour.totals.venue_range_upper_sum_vnd > 0, "upper sum > 0");
  assert(fullRes.tour.totals.leg_source === "straight_line_estimate", "leg source is straight line estimate");
  assert(fullRes.tour.assumptions.pool_truncated === false, "assumptions.pool_truncated present");
  // Check stop structure
  const stop1 = fullRes.tour.stops[0];
  assert(stop1.order === 1, "stop order is 1");
  assert(stop1.hours.open_at_arrival === null, "open_at_arrival must be null, never true without verification");
  assert(stop1.price.semantics === "venue_range", "price semantics must be venue_range");
  console.log("  ✓ Full tour generated properly. Stops:", fullRes.tour.stops.map(s => s.name).join(" -> "));

  // 7. Update preferences with revision conflict check
  console.log("Test 7: PUT /v1/sessions/{id}/preferences (409 Revision Conflict)");
  let threwConflict = false;
  try {
    // Send stale baseRevision 0 when current revision is 2
    await updatePreferences(session.session_id, 0, { mode: "strict" }, session.token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && err.code === "revision_conflict") {
      threwConflict = true;
      console.log("  ✓ Expected 409 revision conflict caught successfully:", err.message);
    }
  }
  assert(threwConflict, "Must throw 409 revision conflict on stale base_revision");

  // Valid update
  console.log("Test 7b: PUT /v1/sessions/{id}/preferences (Valid update)");
  const updateRes = await updatePreferences(session.session_id, 2, { max_stops: 4 }, session.token);
  assert(updateRes.revision === 3, "revision incremented to 3");
  assert(updateRes.preferences.max_stops === 4, "max_stops updated");
  console.log("  ✓ Preferences updated successfully. Revision:", updateRes.revision);

  // 8. Plan tour
  console.log("Test 8: POST /v1/sessions/{id}/tour");
  const planRes = await planTour(session.session_id, 3, session.token);
  assert(planRes.revision === 4, "tour revision incremented to 4");
  assert(planRes.tour.stops.length === 3, "tour has stops");
  console.log("  ✓ Plan tour succeeded. Revision:", planRes.revision);

  // 9. Replace one stop with locks
  console.log("Test 9: POST /v1/sessions/{id}/tour/replace");
  const stopToReplace = planRes.tour.stops[1]; // Replace 2nd stop (SYN-002)
  const replaceRes = await replaceTourStop(session.session_id, 4, stopToReplace.venue_id, session.token);
  assert(replaceRes.revision === 5, "replace revision incremented to 5");
  assert(replaceRes.tour.stops.length === 3, "still has 3 stops");
  assert(replaceRes.tour.stops[1].venue_id !== stopToReplace.venue_id, "2nd stop was replaced with new venue");
  assert(replaceRes.tour.locks.includes(planRes.tour.stops[0].venue_id), "stop 1 must be locked");
  assert(replaceRes.tour.locks.includes(planRes.tour.stops[2].venue_id), "stop 3 must be locked");
  assert(!replaceRes.tour.locks.includes(stopToReplace.venue_id), "replaced stop is not locked");
  console.log("  ✓ Replace stop succeeded with locks!");
  console.log("    Before:", planRes.tour.stops.map(s => s.venue_id));
  console.log("    After: ", replaceRes.tour.stops.map(s => s.venue_id));
  console.log("    Locks: ", replaceRes.tour.locks);

  // 10. Impossible request check
  console.log("Test 10: Impossible budget request check");
  const impRes = await sendMessage(session.session_id, "Ngân sách 10k", session.token);
  assert(impRes.tour.status === "no_solution", "status must be no_solution");
  assert(impRes.tour.reasons.length > 0, "reasons must be present");
  assert(impRes.tour.proposed_changes.length > 0, "proposed_changes must be present");
  console.log("  ✓ Impossible request handled properly. Reasons:", impRes.tour.reasons);

  // 11. Strict mode insufficient evidence check
  console.log("Test 11: Strict mode insufficient evidence check");
  await updatePreferences(session.session_id, impRes.revision, { mode: "strict", budget_vnd: 200000 }, session.token);
  const strictRes = await planTour(session.session_id, impRes.revision + 1, session.token);
  assert(strictRes.tour.status === "insufficient_evidence", "status must be insufficient_evidence");
  assert(strictRes.tour.reasons.length > 0, "reasons must be present");
  assert(strictRes.tour.proposed_changes.length > 0, "proposed_changes must be present");
  console.log("  ✓ Strict mode insufficient evidence handled properly. Reasons:", strictRes.tour.reasons);

  // 12. Legacy endpoint
  console.log("Test 12: POST /v1/plans (legacy)");
  const legacyRes = await planTourLegacy({
    city: "Hà Nội",
    lat: 21.033,
    lon: 105.850,
    budget_vnd: 200000,
    duration_min: 120,
    interests: ["phở"]
  });
  assert(legacyRes.stops.length > 0, "legacy stops present");
  assert(legacyRes.is_mock === true, "legacy is_mock true");
  console.log("  ✓ Legacy endpoint passed:", legacyRes.stops.length, "stops");

  // 13. getVenuesMap in MOCK mode
  console.log("Test 13: GET /v1/venues/map (mock mode contract)");
  setRuntimeMockMode(true);
  const mapRes = await getVenuesMap({
    min_lat: 21.02,
    min_lon: 105.84,
    max_lat: 21.04,
    max_lon: 105.86,
    limit: 10
  });
  assert(Array.isArray(mapRes.items), "mapRes.items must be an array");
  assert(mapRes.is_mock === true, "mapRes.is_mock must be true");
  assert(mapRes.dataset_source === "synthetic", "mapRes.dataset_source must be synthetic");
  assert(mapRes.items.every(v => !v.online_only), "items must not contain online-only venues");
  console.log("  ✓ Mock map venues passed:", mapRes.items.length, "items, truncated:", mapRes.truncated);

  // 14. getVenuesMap in REAL mode: must NOT fall back to synthetic fixtures on error
  console.log("Test 14: GET /v1/venues/map (real mode error propagation, no silent fallback)");
  setRuntimeMockMode(false);
  let caughtRealError = false;
  try {
    // Port 19999 is intentionally unreachable
    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:19999';
    await getVenuesMap({ min_lat: 21.0, min_lon: 105.0, max_lat: 22.0, max_lon: 106.0 });
  } catch (err) {
    caughtRealError = true;
    assert(err instanceof ApiError || err.name === 'TypeError', "Must throw an error");
    assert(err.message.includes('Không thể kết nối') || err.message.includes('fetch'), "Must reflect network error");
  } finally {
    delete process.env.NEXT_PUBLIC_API_URL;
    setRuntimeMockMode(true);
  }
  assert(caughtRealError === true, "Real mode getVenuesMap MUST throw on failure instead of fabricating synthetic data");
  console.log("  ✓ Real mode getVenuesMap properly propagated error without synthetic fallback");

  // 15. getVenuesMap AbortSignal handling: must propagate AbortError
  console.log("Test 15: GET /v1/venues/map (AbortSignal handling)");
  setRuntimeMockMode(false);
  const abortController = new AbortController();
  abortController.abort();
  let caughtAbort = false;
  try {
    await getVenuesMap({ min_lat: 21.0, min_lon: 105.0, max_lat: 22.0, max_lon: 106.0 }, { signal: abortController.signal });
  } catch (err) {
    caughtAbort = true;
    assert(err.name === 'AbortError', `Expected AbortError, got ${err.name}`);
  } finally {
    setRuntimeMockMode(true);
  }
  assert(caughtAbort === true, "Must propagate AbortError when signal is aborted");
  console.log("  ✓ AbortError properly propagated without being swallowed");

  // 16. getMapsLinks contract v1.7 (mock mode, travelmode, limits, 409 no_tour)
  console.log("Test 16: GET /v1/sessions/{id}/tour/maps-links (contract v1.7)");
  const emptySession = await createSession();
  let caughtNoTour = false;
  try {
    await getMapsLinks(emptySession.session_id, 'walking', emptySession.token);
  } catch (err) {
    caughtNoTour = true;
    assert(err.code === 'no_tour' || err.status === 409, `Expected 409 no_tour, got ${err.code}`);
  }
  assert(caughtNoTour === true, "Must throw 409 no_tour when session has no tour stops");

  // Switch session back to explore mode and plan valid tour:
  await updatePreferences(session.session_id, strictRes.revision, { mode: "explore" }, session.token);
  const validPlan = await planTour(session.session_id, strictRes.revision + 1, session.token);
  assert(validPlan.tour.stops.length > 0, "tour must have stops");

  // With full tour generated in session:
  const walkingLinks = await getMapsLinks(session.session_id, 'walking', session.token);
  assert(walkingLinks.status === 'ok', "status must be ok");
  assert(walkingLinks.travelmode === 'walking', "travelmode must be walking");
  assert(walkingLinks.provider === 'google_maps_urls', "provider must be google_maps_urls");
  assert(walkingLinks.uses_api === false, "uses_api must be false");
  assert(Array.isArray(walkingLinks.links) && walkingLinks.links.length > 0, "links must be a non-empty array");
  for (const l of walkingLinks.links) {
    assert(l.url.startsWith('https://www.google.com/maps/dir/'), "url origin and path");
    assert(l.url.includes('api=1'), "api=1 must be present");
    assert(!l.url.includes('dir_action'), "dir_action must NEVER be present");
    assert(l.waypoint_count <= 3, "waypoint_count must be <= 3");
    assert(l.url_length <= 2048 && l.url.length <= 2048, "url_length must be <= 2048");
  }

  // Driving mode toggle
  const drivingLinks = await getMapsLinks(session.session_id, 'driving', session.token);
  assert(drivingLinks.travelmode === 'driving', "travelmode must be driving");
  assert(drivingLinks.links[0].url.includes('travelmode=driving'), "url travelmode driving");
  console.log("  ✓ Free Google Maps URLs contract v1.7 verified in mock mode");

  // 17. getMapsLinks real mode error propagation
  console.log("Test 17: GET /v1/sessions/{id}/tour/maps-links (real mode error propagation)");
  setRuntimeMockMode(false);
  let caughtRealMapsErr = false;
  try {
    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:19999';
    await getMapsLinks(session.session_id, 'walking', session.token);
  } catch (err) {
    caughtRealMapsErr = true;
    assert(err instanceof ApiError || err.name === 'TypeError', "Must throw error");
  } finally {
    delete process.env.NEXT_PUBLIC_API_URL;
    setRuntimeMockMode(true);
  }
  assert(caughtRealMapsErr === true, "Real mode must propagate errors without fabricating URLs");
  console.log("  ✓ Real mode getMapsLinks error propagation passed");

  // 18. chatTurn and getChatState (contract v1.8)
  console.log("Test 18: POST /v1/sessions/{id}/chat and getChatState (contract v1.8)");
  const chatSession = await createSession();
  assert(chatSession.session_id, "session_id required");

  // Turn 1: discover without location
  const turn1 = await chatTurn(chatSession.session_id, {
    text: "Chiều nay nóng quá, quanh đây ăn gì được?",
    action: null,
    revision: 0
  }, chatSession.token);

  assert(turn1.reply && Array.isArray(turn1.reply.blocks), "turn1 must have reply.blocks");
  assert(turn1.reply.blocks.some(b => b.type === 'text'), "turn1 must have text block");
  assert(turn1.reply.blocks.some(b => b.type === 'clarify'), "turn1 must have clarify block");
  assert(turn1.chat && turn1.chat.phase === 'discover', "turn1 chat phase must be discover");
  assert(turn1.revision === 1, "revision must increment to 1");

  // Verify getChatState returns same chat state
  const state1 = await getChatState(chatSession.session_id, chatSession.token);
  assert(state1 && state1.phase === 'discover', "getChatState must return matching chat state");

  // Turn 2: 409 revision conflict check
  let caughtChatConflict = false;
  try {
    await chatTurn(chatSession.session_id, {
      text: "Quán phở",
      action: null,
      revision: 0 // out of date!
    }, chatSession.token);
  } catch (err) {
    caughtChatConflict = true;
    assert(err.status === 409 || err.code === 'revision_conflict', "Expected 409 revision conflict");
  }
  assert(caughtChatConflict === true, "Must catch 409 revision conflict on stale revision");

  // Turn 3: Action set_location with current revision
  const turn3 = await chatTurn(chatSession.session_id, {
    text: null,
    action: { type: "set_location", location: { district: "Cầu Giấy" } },
    revision: 1
  }, chatSession.token);
  assert(turn3.revision === 2, "revision must increment to 2");
  const areaVal = turn3.chat.profile.area.value;
  assert(areaVal === "Cầu Giấy" || areaVal?.label === "Cầu Giấy" || areaVal?.district === "Cầu Giấy", "profile.area must be updated to Cầu Giấy");
  console.log("  ✓ Conversational chat turn and getChatState contract v1.8 verified");

  console.log("\n🎉 ALL 18 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!");
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
