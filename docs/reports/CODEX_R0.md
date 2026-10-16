# Codex R0-2 / R0-3 delivery — 2026-10-16

Implementation commit: `982fa0765eec9b39eaef192b8c3b67d3b3e02d38`.
Reviewer: Claude (independent review and coordinator integration pending).
Task `task_3d5b201b0889`, dispatch `ctx_a6468868f5e6`.

## Delivered

- CSV/JSON loading retains source-reported rating, reviews, meal/audience/cuisine/amenity tags and collection timestamp. Rating is normalized to 0..5 with a valid positive finite source scale; invalid/missing values remain null. Zero ratings and zero reviews survive; negative/fractional/nonfinite review counts are null. Tags are trimmed, deduplicated and sorted. Invalid timestamps are null; valid source offsets are preserved. Aggregate-only flags count missing ratings, review counts and meals.
- Venue list/detail and optional nested `StopView.venue` expose the same v1.6 metadata. The existing flattened stop fields retain their meaning. Ratings/tags/timestamps never promote hours, price semantics, routing or allergy evidence.
- Daily Gemini reservations default to 18; non-integer/negative configuration falls back to 18 and zero intentionally disables calls. An injected clock and `zoneinfo.ZoneInfo('America/Los_Angeles')` provide Pacific midnight resets, including 23/25-hour DST days. Each transport attempt reserves once before transport, including the single transient 5xx retry and explanation calls. HTTP 429 persists authoritative exhaustion until reset; a delayed 429 for yesterday cannot exhaust today's window.
- Health exposes the budget or null; messages expose `rules|llm|cache`, extraction attempt indicator 0/1, and budget summary. Claude's RulesFirstExtractor is wired for Gemini, including cache/fallback/local quota metadata. Rules remain available without a key and health does not claim a configured live provider in that case. Explanations remain template by default.
- Regenerated OpenAPI and added synthetic-only loader, API and budget tests. Updated the old venue-list test to expect an empty cuisine tag list rather than the former null placeholder.

## Coordination decisions and scope

Merged `foodtour-claude-coordinator` before implementation and again through `b5467ed` before final verification. This incorporates v1.6, R0-4 (`b7c89c3`), the nested venue/count clarification (`e898f40`), adapter attempt override (`c581dc6`) and the approved persistence deviation (`b5467ed`).

Claude approved through Orca:

1. `llm_calls` is an extraction attempt indicator: 1 if at least one transport was attempted, including failure/fallback; 0 for rules/cache/local admission refusal. A transient retry can increase daily `used` by 2 while `llm_calls` stays 1. Explanation calls consume the same daily budget, while this API field describes extraction only.
2. **Dedicated budget SQLite file**, replacing the dispatch's original same-session-file requirement: `FOODTOUR_BUDGET_DB` overrides; otherwise `<FOODTOUR_SESSION_DB>.budget.sqlite`; neither configured means in-process storage. Existing session `owned` transactions hold a write lock over provider execution, so a second budget connection to that same DB would deadlock. Session transaction/ownership/revision behavior is untouched. Budget storage uses WAL, busy timeout, bounded retries for initial Windows WAL acquisition, and short `BEGIN IMMEDIATE` read/modify/commit transactions. Tests prove reservations work with session `owned` open and independent processes share the limit.
3. Optional nested `venue: VenueView` on stops.
4. `backend/requirements.txt` added only `tzdata>=2026.1`, a scope extension explicitly authorized by Claude, because Windows lacks a system IANA timezone database. Local venv initially raised `ZoneInfoNotFoundError`; installed `tzdata 2026.5` and exercised real Pacific DST rules. A handled last-resort fallback logs a static warning and uses fixed UTC-08:00; **that fallback does not follow daylight saving time**, so its reset is one hour later during PDT. Normal supported installs use declared tzdata and correct DST.

The only edit to Claude-owned production code is the authorized additive `Venue` fields in `backend/app/planner/types.py`: `rating`, `rating_scale_max`, `review_count`, `suitable_meals`, `audiences`, `cuisine_styles`, `amenities_yes`, `amenities_no`, `source_fetched_at`. All have safe defaults. No worker-authored edits to `llm/`, planner engine/relevance, frontend, QA E2E, task board or contract text.

## Files

- `backend/app/data/loader.py`
- `backend/app/planner/types.py` (additive Venue metadata only)
- `backend/app/api/routes.py`, `backend/app/api/schemas.py`
- `backend/app/providers/gemini.py`, `backend/app/repositories/llm_budget.py`
- `backend/app/main.py`, `backend/requirements.txt`
- `backend/tests/data/test_r0_evidence.py`, `backend/tests/providers/test_llm_budget.py`, `backend/tests/api/test_venues.py`
- `contracts/fixtures/venues.evidence.synthetic.json` (labelled SYNTHETIC raw-source extension; original fixture unchanged)
- `contracts/v1/openapi.json` (generated)
- `docs/reports/CODEX_R0.md` (this report, committed separately)

## Verification and limits

Commands use `./.venv/Scripts/python.exe` (Python 3.14.4). Bare `python` is a Windows Store alias on this host.

- Data discovery: 33 tests passed before splitting the raw-source fixture; final source-evidence focused rerun: 5 passed.
- Final focused budget tests: 17 passed, including thread and independent-process contention, restart, session-lock coexistence, midnight/DST, local refusal after a first 503, 429 persistence, cache/rules metadata, corrupt storage refusal, and key absence from HTTP responses/access logs.
- `./.venv/Scripts/python.exe tools/export_openapi.py` regenerated the artifact; `./.venv/Scripts/python.exe tools/export_openapi.py --check` returned `OpenAPI matches server schema`.
- `git diff --check` passed. Earlier full discovery caught source-field fixtures breaking direct Venue construction and an obsolete cuisine null expectation; both corrected. A subsequent focused concurrent run exposed a Windows WAL initialization race; acquisition retries fixed it, with 17 budget tests passing afterward.
- Final full discovery: 241 tests ran, 240 passed and 1 expected private-data skip; exit code 0. Full output is recorded below. One legacy source-specific test is expected to skip when ignored private `data/venues.json` is absent. This is disclosed separately from passing tests.
- Existing Starlette TestClient/httpx deprecation warning remains; no unsolicited dependency upgrade.
- No live Gemini/provider, Google, paid service, DB server or browser/mobile integration validation. Provider behavior uses mocked transport/local fake servers; persistence uses actual local SQLite and independent OS processes. No private CSV, source rows, keys or chat/location history were committed or published. Claude review and Antigravity independent integration QA remain outstanding.

## Full final backend discovery output

Command: `./.venv/Scripts/python.exe scripts/run_unittests.py`

```text
C:\Users\tuana\orca\workspaces\ai-foodtour-planner\foodtour-codex-backend\.venv\Lib\site-packages\fastapi\testclient.py:1: StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
  from starlette.testclient import TestClient as TestClient  # noqa
EXPECTED-SKIP: legacy data/venues.json absent; this source-specific test requires private Foody rows and URLs, not the synthetic Venue fixture. [test_planner.PlannerTests.test_budget_and_source]
test_budget_and_source (test_planner.PlannerTests.test_budget_and_source) ... skipped 'EXPECTED-SKIP: legacy data/venues.json absent; this source-specific test requires private Foody rows and URLs, not the synthetic Venue fixture.'
test_no_match (test_planner.PlannerTests.test_no_match) ... ok
test_strict_refuses_unknown (test_planner.PlannerTests.test_strict_refuses_unknown) ... ok
test_unknown_price_never_free (test_planner.PlannerTests.test_unknown_price_never_free) ... ok
test_validation (test_planner.PlannerTests.test_validation) ... {"request_id": "8bb294fa7dc74f3dbf7ccf188f1a20f9", "route": "/v1/plans", "status": 422, "latency_ms": 57.475}
{"request_id": "597f0aa4d1a843b99b41571282ba2e29", "route": "/v1/plans", "status": 200, "latency_ms": 2.65}
ok
test_bounded_search_assumptions_are_exposed (tests.api.test_api.APITests.test_bounded_search_assumptions_are_exposed) ... {"request_id": "b38294966ce14ac6a2eb26944a16ef03", "route": "/v1/sessions", "status": 200, "latency_ms": 92.631}
{"request_id": "5afba78b82aa4daf93db3ac606cf8204", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 53.63}
ok
test_concurrent_same_revision_exactly_one_commit (tests.api.test_api.APITests.test_concurrent_same_revision_exactly_one_commit) ... {"request_id": "b370eb05d0264038a66e25dfe1f94a8d", "route": "/v1/sessions", "status": 200, "latency_ms": 53.491}
{"request_id": "c4cb3ddc9dd747f2bcae079f131a0724", "route": "/v1/sessions/{session_id}/preferences", "status": 409, "latency_ms": 3.613}
{"request_id": "95bda9cd21374867ae91dd084e97cadf", "route": "/v1/sessions/{session_id}/preferences", "status": 200, "latency_ms": 6.251}
ok
test_cors_allows_revision_and_token_header (tests.api.test_api.APITests.test_cors_allows_revision_and_token_header) ... {"request_id": "9070fcf17e0b4f4895ffd95055649558", "route": "<unmatched>", "status": 200, "latency_ms": 0.213}
ok
test_cross_midnight_has_no_invalid_clock_and_guard_is_atomic (tests.api.test_api.APITests.test_cross_midnight_has_no_invalid_clock_and_guard_is_atomic) ... {"request_id": "47819d8a0fe249b8a810355a9ab44932", "route": "/v1/sessions", "status": 200, "latency_ms": 75.332}
{"request_id": "08ac495d8b784cbbb541e733e1799278", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 54.936}
{"request_id": "f158b4d1ea4f49d59edc7286afe5a595", "route": "/v1/sessions/{session_id}/preferences", "status": 200, "latency_ms": 4.133}
{"request_id": "28b95d7e5d5e48eda2137f5f76c72b18", "route": "/v1/sessions/{session_id}/tour", "status": 200, "latency_ms": 4.634}
{"request_id": "f654ec3db31342bd83a108a5716a45cc", "route": "/v1/sessions", "status": 200, "latency_ms": 2.305}
{"request_id": "8e3969ce5a2242c48a8d794b4305c54b", "route": "/v1/sessions/{session_id}/messages", "status": 422, "latency_ms": 36.315}
ok
test_expired_tombstones_are_bounded (tests.api.test_api.APITests.test_expired_tombstones_are_bounded) ... {"request_id": "dabb0e7357fd4498a36e2c12a52fb9b3", "route": "/v1/sessions", "status": 200, "latency_ms": 60.274}
{"request_id": "a875bedb8f434446a781cbcee2140478", "route": "/v1/sessions", "status": 200, "latency_ms": 1.98}
{"request_id": "ca4c817bc8ee445ab05166b80ce35aac", "route": "/v1/sessions", "status": 200, "latency_ms": 2.907}
{"request_id": "72df031dce2244a98543c35131efa966", "route": "/v1/sessions", "status": 200, "latency_ms": 2.263}
{"request_id": "0c9c3890f76140deab99d15d7f6ba51d", "route": "/v1/sessions", "status": 200, "latency_ms": 2.184}
{"request_id": "7c7c67bae0bb4761a37e857461099da6", "route": "/v1/sessions", "status": 200, "latency_ms": 2.392}
{"request_id": "c1139f80816749f89f479a7bc4abab66", "route": "/v1/sessions", "status": 200, "latency_ms": 3.158}
ok
test_expiry_and_wrong_token_does_not_disclose_expiry (tests.api.test_api.APITests.test_expiry_and_wrong_token_does_not_disclose_expiry) ... {"request_id": "b3b2d468907c43bdb69214fdfb5ca59d", "route": "/v1/sessions", "status": 200, "latency_ms": 95.895}
{"request_id": "7a7ea5c1e7834039b0e8eac1dce390d5", "route": "/v1/sessions/{session_id}/tour", "status": 403, "latency_ms": 2.124}
{"request_id": "02d118c4f10d4ca0a6f36f601c558657", "route": "/v1/sessions/{session_id}/tour", "status": 410, "latency_ms": 2.369}
ok
test_fail_closed_tampered_planner_result_and_no_commit (tests.api.test_api.APITests.test_fail_closed_tampered_planner_result_and_no_commit) ... {"request_id": "eb063777f23c4ce5bb0eee585a7408a1", "route": "/v1/sessions", "status": 200, "latency_ms": 62.16}
{"request_id": "740298e4f5c74ef4989b12f223445b71", "route": "/v1/sessions/{session_id}/messages", "status": 500, "latency_ms": 32.679}
ok
test_health_detail_labels_and_repository_version_cache (tests.api.test_api.APITests.test_health_detail_labels_and_repository_version_cache) ... {"request_id": "7501d5290a02460a8dd765fa971583b2", "route": "/health", "status": 200, "latency_ms": 89.885}
{"request_id": "b6b0dc0e0a0341b7911f3819efc5159f", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 7.29}
{"request_id": "2a297f3d8ea945839e04c30b675c5b7a", "route": "/v1/venues/{venue_id}", "status": 404, "latency_ms": 5.74}
ok
test_legacy_exports_and_response_unchanged (tests.api.test_api.APITests.test_legacy_exports_and_response_unchanged) ... {"request_id": "dd5d2bcdd20544298b21a2029b5400dc", "route": "/v1/plans", "status": 200, "latency_ms": 125.005}
{"request_id": "001e2fead6b846cc98f472774c61fe96", "route": "/v1/plans", "status": 200, "latency_ms": 3.894}
{"request_id": "e072010daf144f538169d2e20ae59cea", "route": "/v1/plans", "status": 422, "latency_ms": 1.118}
ok
test_malformed_snapshot_is_service_error_not_empty_success (tests.api.test_api.APITests.test_malformed_snapshot_is_service_error_not_empty_success) ... {"request_id": "1581aeb539064e33872d57f05da9f92c", "route": "/health", "status": 503, "latency_ms": 124.19}
ok
test_missing_slots_then_message_tour_and_followup_retention (tests.api.test_api.APITests.test_missing_slots_then_message_tour_and_followup_retention) ... {"request_id": "c3006a29ebef4b3098ed446949837671", "route": "/v1/sessions", "status": 200, "latency_ms": 81.26}
{"request_id": "62f9218ba22c4b86844f7b893d398830", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 5.523}
{"request_id": "444d944494bf4592979c6b9031f18586", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 57.639}
{"request_id": "c42a28d4374f4b9a98caa403939d8800", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 50.72}
{"request_id": "f9fd90db3dc44decb3f750b77689dca1", "route": "/v1/sessions/{session_id}/tour", "status": 200, "latency_ms": 50.157}
ok
test_preferences_clear_old_tour_revision_and_strict (tests.api.test_api.APITests.test_preferences_clear_old_tour_revision_and_strict) ... {"request_id": "d63d8e0a2adb423b995443e13956f9f7", "route": "/v1/sessions", "status": 200, "latency_ms": 106.215}
{"request_id": "0566ad0ca6d14dd4b30d412952d621ac", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 67.165}
{"request_id": "f9586e7aa9344ae9af38664340d706ac", "route": "/v1/sessions/{session_id}/preferences", "status": 200, "latency_ms": 7.762}
{"request_id": "0bc22a4be6314e1f9061e06c3be19ac9", "route": "/v1/sessions/{session_id}/preferences", "status": 409, "latency_ms": 3.514}
{"request_id": "bfaa6d62bbe847c4b2287928b13d8891", "route": "/v1/sessions/{session_id}/tour", "status": 200, "latency_ms": 49.533}
ok
test_prompt_injection_cannot_change_mode_or_budget (tests.api.test_api.APITests.test_prompt_injection_cannot_change_mode_or_budget) ... {"request_id": "abf796e2de324fe683c004bfbb956d61", "route": "/v1/sessions", "status": 200, "latency_ms": 70.594}
{"request_id": "32aae30194fb496ab09fe1ed4bc0a218", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 39.317}
{"request_id": "5dfe6b59ff504e008d182a4e429fec78", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 35.591}
ok
test_rate_limit_resets_and_bounded_session_capacity (tests.api.test_api.APITests.test_rate_limit_resets_and_bounded_session_capacity) ... {"request_id": "3b4addc622b34ee5a36b73603f7c31d4", "route": "/v1/sessions", "status": 200, "latency_ms": 61.17}
{"request_id": "0bec95bfa6c54554856941255c05ef8b", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 4.511}
{"request_id": "b511e82b73fc49489d098c86f9d1cca7", "route": "/v1/sessions/{session_id}/messages", "status": 429, "latency_ms": 1.986}
{"request_id": "a73ac4ba41fb4d6faeb07ae27f904a28", "route": "/v1/sessions/{session_id}/messages", "status": 429, "latency_ms": 2.878}
{"request_id": "fca0b7b9e02643d88e113b2235e2e8ca", "route": "/v1/sessions/{session_id}/messages", "status": 410, "latency_ms": 4.786}
{"request_id": "28a63261f44d4820a5c1098463ff8241", "route": "/v1/sessions", "status": 200, "latency_ms": 3.557}
{"request_id": "118a9907b3f74128891b4ff890486185", "route": "/v1/sessions", "status": 429, "latency_ms": 3.72}
ok
test_rate_window_recovery_before_ttl (tests.api.test_api.APITests.test_rate_window_recovery_before_ttl) ... {"request_id": "fc5db619e2254a078bc955e997623085", "route": "/v1/sessions", "status": 200, "latency_ms": 218.168}
{"request_id": "25cc69ba80b841eb93352267ce7fa12c", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 12.345}
{"request_id": "48e0ccf7899349f399126014a53d4b33", "route": "/v1/sessions/{session_id}/messages", "status": 429, "latency_ms": 5.205}
{"request_id": "1a8aff7c73e442dc86f0d7c57c96e09e", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 11.316}
ok
test_rejected_extracted_constraints_do_not_replan_with_old_values (tests.api.test_api.APITests.test_rejected_extracted_constraints_do_not_replan_with_old_values) ... {"request_id": "7049c23529804b90aaa5b06085036ceb", "route": "/v1/sessions", "status": 200, "latency_ms": 223.079}
{"request_id": "9a417a5231c146cbb79f37ed8ede6ce6", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 163.699}
{"request_id": "77bc1e70980c4581a977a001aeb7f70a", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 18.201}
ok
test_replace_lock_claim_is_checked_before_commit (tests.api.test_api.APITests.test_replace_lock_claim_is_checked_before_commit) ... {"request_id": "ce8696285bfb48c3a07b2e4326b54868", "route": "/v1/sessions", "status": 200, "latency_ms": 278.294}
{"request_id": "887a936b847945588268f345bd5e53aa", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 145.318}
{"request_id": "68d5b3a01b684ee8bdfaeb577f70f0e0", "route": "/v1/sessions/{session_id}/tour/replace", "status": 500, "latency_ms": 9.754}
ok
test_replace_preserves_other_stops_and_stale_conflicts (tests.api.test_api.APITests.test_replace_preserves_other_stops_and_stale_conflicts) ... {"request_id": "632cd583547a49c8a6a232fe166c193e", "route": "/v1/sessions", "status": 200, "latency_ms": 759.051}
{"request_id": "b376ddfdea2240429b0b28106a1c2309", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 196.467}
{"request_id": "7ca0b6d8b0e34f64becf53871026c76d", "route": "/v1/sessions/{session_id}/tour/replace", "status": 200, "latency_ms": 10.785}
{"request_id": "c916fe9976bd46efbcd3fd4e9c4b1128", "route": "/v1/sessions/{session_id}/tour/replace", "status": 409, "latency_ms": 4.801}
{"request_id": "bfc5fee626d043b49bd7c98d01ab8442", "route": "/v1/sessions/{session_id}/tour/replace", "status": 409, "latency_ms": 9.975}
ok
test_session_tokens_hashed_and_cross_session_isolated (tests.api.test_api.APITests.test_session_tokens_hashed_and_cross_session_isolated) ... {"request_id": "ce337bf7ca5041949843a795621237b3", "route": "/v1/sessions", "status": 200, "latency_ms": 293.462}
{"request_id": "40be4624e5b44047b17473a19e9444ba", "route": "/v1/sessions", "status": 200, "latency_ms": 7.954}
{"request_id": "2513b51ccaf44a3ebc77456fc01cba94", "route": "/v1/sessions/{session_id}/tour", "status": 401, "latency_ms": 5.857}
{"request_id": "79335e59fc744f7c88a2511a6b3ec5ab", "route": "/v1/sessions/{session_id}/tour", "status": 403, "latency_ms": 9.796}
ok
test_snapshot_versions_change_and_replace_stays_pinned (tests.api.test_api.APITests.test_snapshot_versions_change_and_replace_stays_pinned) ... {"request_id": "bb6022cfb2714826a44184faaf8cceac", "route": "/v1/sessions", "status": 200, "latency_ms": 266.11}
{"request_id": "4b66c9e47a234ad6872c883847d7743c", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 142.3}
{"request_id": "8cebd0e88f2d4547b364f1d91ce0754c", "route": "/health", "status": 200, "latency_ms": 5.918}
{"request_id": "8c78c85bbdaf44c584202073b6fd4873", "route": "/v1/sessions/{session_id}/tour/replace", "status": 200, "latency_ms": 11.221}
ok
test_unavailable_llm_health_and_no_session_mutation (tests.api.test_api.APITests.test_unavailable_llm_health_and_no_session_mutation) ... {"request_id": "4d91989c65ea4f759d6f1319313edee9", "route": "/health", "status": 200, "latency_ms": 252.524}
{"request_id": "7c5a65dbd59e414ab1627c798842ddbe", "route": "/v1/sessions", "status": 200, "latency_ms": 3.698}
{"request_id": "42e7997d7004426e9988e0ba73a16dc8", "route": "/v1/sessions/{session_id}/messages", "status": 503, "latency_ms": 3.509}
ok
test_untrusted_extractor_output_is_validated (tests.api.test_api.APITests.test_untrusted_extractor_output_is_validated) ... {"request_id": "c8b887a770c44affb6579e3c4681acaa", "route": "/v1/sessions", "status": 200, "latency_ms": 247.573}
{"request_id": "73b4da0853e84620a32ba39de9031344", "route": "/v1/sessions/{session_id}/messages", "status": 422, "latency_ms": 6.246}
ok
test_validation_envelope_redacts_private_input (tests.api.test_api.APITests.test_validation_envelope_redacts_private_input) ... {"request_id": "425ef5a70e3f4602ac93ce459d438fe1", "route": "/v1/sessions", "status": 200, "latency_ms": 236.134}
{"request_id": "a23e2f00aa2a46d4bc0638ae7f6d1df7", "route": "/v1/sessions/{session_id}/messages", "status": 422, "latency_ms": 2.068}
{"request_id": "a9333ea3bd1d469685a0431516d03e8a", "route": "/v1/sessions/{session_id}/preferences", "status": 422, "latency_ms": 1.969}
{"request_id": "af1d2cdb786e44c884e283233339456d", "route": "/v1/sessions/{session_id}/preferences", "status": 422, "latency_ms": 2.06}
{"request_id": "5cb26a3c6d2e4f94b47e57e002ac3fbc", "route": "/v1/sessions/{session_id}/preferences", "status": 422, "latency_ms": 2.156}
{"request_id": "a0a00012a14e420ea2b1320aaa096010", "route": "/v1/sessions/{session_id}/preferences", "status": 422, "latency_ms": 1.786}
{"request_id": "e334afaa5b1a4fbeb892cf24de9f1124", "route": "/v1/sessions/{session_id}/preferences", "status": 422, "latency_ms": 2.011}
{"request_id": "f52f12e0eb3b40c293368d6f6b60ffc2", "route": "/v1/sessions/{session_id}/preferences", "status": 422, "latency_ms": 2.141}
{"request_id": "7a20e94b586b4c55b015494465a25e76", "route": "/v1/sessions/{session_id}/preferences", "status": 422, "latency_ms": 2.12}
{"request_id": "03dff8025c7548b09c83a7a2e0506ac5", "route": "/v1/sessions/{session_id}/preferences", "status": 422, "latency_ms": 2.061}
ok
test_generated_openapi_matches_versioned_export (tests.api.test_api.OpenAPIDriftTests.test_generated_openapi_matches_versioned_export) ... ok
test_configured_invalid_overlay_is_redacted_503_never_cached_success (tests.api.test_evidence.EvidenceAPI.test_configured_invalid_overlay_is_redacted_503_never_cached_success) ... {"request_id": "9b21309f503e47abbd2f60a307c24482", "route": "/health", "status": 200, "latency_ms": 215.138}
{"request_id": "028aba28e91444999b6e4b9c2a49fe02", "route": "/health", "status": 503, "latency_ms": 7.58}
{"request_id": "6562b80c9c924f549b9190085b47170e", "route": "/v1/venues", "status": 503, "latency_ms": 12.652}
{"request_id": "03beb32de4be48419cfc7cc89f667169", "route": "/v1/venues/{venue_id}", "status": 503, "latency_ms": 10.257}
ok
test_default_estimate_stays_conditional_even_with_complete_overlay (tests.api.test_evidence.EvidenceAPI.test_default_estimate_stays_conditional_even_with_complete_overlay) ... {"request_id": "4f63f2c413d648ad847a147748d5ef3b", "route": "/v1/sessions", "status": 200, "latency_ms": 228.867}
{"request_id": "f8b6f4b031954a0f9efea08e79b465fd", "route": "/v1/sessions/{session_id}/preferences", "status": 200, "latency_ms": 14.413}
{"request_id": "1f5e6c54e6c343e78dcbfe6ed1ac642f", "route": "/v1/sessions/{session_id}/tour", "status": 200, "latency_ms": 134.767}
ok
test_in_memory_replace_cannot_reuse_stale_or_removed_verified_overlay (tests.api.test_evidence.EvidenceAPI.test_in_memory_replace_cannot_reuse_stale_or_removed_verified_overlay) ... {"request_id": "af071a4bba9d40dcbca3a0ecfec9e9e2", "route": "/v1/sessions", "status": 200, "latency_ms": 227.274}
{"request_id": "7d7ab955d1db4291b950630c95d86541", "route": "/v1/sessions/{session_id}/preferences", "status": 200, "latency_ms": 14.479}
{"request_id": "3712a2f3b6d34984b0fde3c78664398b", "route": "/v1/sessions/{session_id}/tour", "status": 200, "latency_ms": 407.346}
{"request_id": "108563b334764b8d8bc31bd75cdba60f", "route": "/v1/sessions/{session_id}/tour/replace", "status": 503, "latency_ms": 8.07}
{"request_id": "2b1daf950d8f4fb3961102e480d4fb11", "route": "/v1/sessions/{session_id}/tour/replace", "status": 409, "latency_ms": 10.379}
{"request_id": "3472091b225d4d57b7c1fe7f17a1a384", "route": "/v1/sessions/{session_id}/tour/replace", "status": 409, "latency_ms": 7.92}
ok
test_overlay_version_change_invalidates_persistent_tour_on_read (tests.api.test_evidence.EvidenceAPI.test_overlay_version_change_invalidates_persistent_tour_on_read) ... {"request_id": "5dca4ea0f6b84aefb5458447193233cd", "route": "/v1/sessions", "status": 200, "latency_ms": 254.315}
{"request_id": "96ee63af82fb4f84a4199f4d2eeecf06", "route": "/v1/sessions/{session_id}/preferences", "status": 200, "latency_ms": 44.39}
{"request_id": "0a9308bd4eb24886b45400c82641a1a9", "route": "/v1/sessions/{session_id}/tour", "status": 200, "latency_ms": 405.934}
{"request_id": "fc60c811f4cf4d22bfaa4d0029138823", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms": 44.912}
{"request_id": "d96306db4eb4486fb71ad31a7bb4401c", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms": 30.179}
ok
test_strict_overlay_and_local_osrm_fake_are_verified_end_to_end (tests.api.test_evidence.EvidenceAPI.test_strict_overlay_and_local_osrm_fake_are_verified_end_to_end) ... {"request_id": "590b89470c1a4c288832ea55e2b7217e", "route": "/v1/sessions", "status": 200, "latency_ms": 216.746}
{"request_id": "f11cd50408b54bcf8df56ec44ee9a891", "route": "/v1/sessions/{session_id}/preferences", "status": 200, "latency_ms": 12.385}
{"request_id": "a8b5dc301f2f48d699c9d891a396161f", "route": "/v1/sessions/{session_id}/tour", "status": 200, "latency_ms": 328.146}
{"request_id": "d0a5155488114ddfa647f87fb7ea594c", "route": "/health", "status": 200, "latency_ms": 9.5}
{"request_id": "158bb811d345497e923b4f9ebf182fc7", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 10.443}
{"request_id": "8aed4fc88f3841628ed94d08ae639bc3", "route": "/v1/venues", "status": 200, "latency_ms": 13.175}
ok
test_api_geocode_quota_validation_and_no_key_in_logs_responses (tests.api.test_google_maps.GoogleAPI.test_api_geocode_quota_validation_and_no_key_in_logs_responses) ... {"request_id": "34a21af88df04e0fb885b05d33d7874e", "route": "/v1/sessions", "status": 200, "latency_ms": 219.328}
ok
test_config_unavailable_null_keys_and_ready_browser_key_only (tests.api.test_google_maps.GoogleAPI.test_config_unavailable_null_keys_and_ready_browser_key_only) ... {"request_id": "a5104aff7f704ddd88272e317e742012", "route": "/v1/client-config", "status": 200, "latency_ms": 192.795}
{"request_id": "ad9df879d2284fe0b7f32248621afe52", "route": "/v1/client-config", "status": 200, "latency_ms": 5.599}
{"request_id": "52aeec5faab642a99c2481c3613dfc90", "route": "/v1/client-config", "status": 200, "latency_ms": 6.657}
ok
test_factory_google_unconfigured_no_network (tests.api.test_google_maps.GoogleAPI.test_factory_google_unconfigured_no_network) ... {"request_id": "272aab85d6de4fea90666b6bc39f09c8", "route": "/health", "status": 200, "latency_ms": 214.451}
{"request_id": "9bc1c513944a4a2690fe2f57d810963a", "route": "/health", "status": 200, "latency_ms": 6.805}
{"request_id": "8887ac58aa6348478cc43d752331b993", "route": "/v1/client-config", "status": 200, "latency_ms": 4.1}
ok
test_geocode_auth_expiry_rate_and_unavailable (tests.api.test_google_maps.GoogleAPI.test_geocode_auth_expiry_rate_and_unavailable) ... {"request_id": "752cd23afee24f0dbe8ef253f67865ef", "route": "/v1/geocode", "status": 401, "latency_ms": 237.968}
{"request_id": "24b5964b9c84498bb17c661f4230a8b7", "route": "/v1/geocode", "status": 403, "latency_ms": 5.972}
{"request_id": "d599fc29dd464794af93ae56d111fe86", "route": "/v1/sessions", "status": 200, "latency_ms": 5.27}
{"request_id": "4a78ae3e6e6d49a89f0862496b62dca5", "route": "/v1/geocode", "status": 200, "latency_ms": 107.15}
{"request_id": "d3df0823d6f2429eadaddbb91c4f297b", "route": "/v1/geocode", "status": 429, "latency_ms": 4.797}
{"request_id": "7f21f04a5b694e22bf2fea849ff87daf", "route": "/v1/geocode", "status": 403, "latency_ms": 4.847}
{"request_id": "09076fdc7b1648b9afeb4ca5ad251b5b", "route": "/v1/sessions", "status": 200, "latency_ms": 4.881}
{"request_id": "5fa39b6dd6c24ed9b68e15a11a417b1a", "route": "/v1/geocode", "status": 200, "latency_ms": 5.293}
ok
test_health_routing_and_geocoding_no_secrets (tests.api.test_google_maps.GoogleAPI.test_health_routing_and_geocoding_no_secrets) ... {"request_id": "4d1a4eed779c48c0a23cef4cf4a5c391", "route": "/health", "status": 200, "latency_ms": 210.392}
{"request_id": "db733ccdedfd4de0ade0a461692bbec9", "route": "/health", "status": 200, "latency_ms": 8.099}
ok
test_landmark_does_not_call_geocoder (tests.api.test_google_maps.GoogleAPI.test_landmark_does_not_call_geocoder) ... {"request_id": "76d0b21f97ba4db6b1985a0d173d72e8", "route": "/v1/sessions", "status": 200, "latency_ms": 257.57}
{"request_id": "47bb6bab60304999999b65da1658b113", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 345.432}
ok
test_map_bbox_limit_truncated_q_allowlist_and_bounds (tests.api.test_google_maps.GoogleAPI.test_map_bbox_limit_truncated_q_allowlist_and_bounds) ... {"request_id": "d4ace7f93f7a45cc913032202114378a", "route": "/v1/venues/map", "status": 200, "latency_ms": 211.251}
{"request_id": "bc7e66b4e4924101a4b0d6dda9b70c5c", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 9.554}
{"request_id": "ecdc5a0233154cc3bd4ead656d6869ff", "route": "/v1/venues/map", "status": 200, "latency_ms": 8.462}
{"request_id": "116b3f3daccc4e2daf8ee75bd4e753a8", "route": "/v1/venues/map", "status": 200, "latency_ms": 8.857}
{"request_id": "07daa3e487b0488e8966cb16c718c843", "route": "/v1/venues/map", "status": 422, "latency_ms": 2.797}
{"request_id": "6f5fc1c1afdc46a6b31a336f42dace2f", "route": "/v1/venues/map", "status": 422, "latency_ms": 3.872}
{"request_id": "67d417e92a954da98fad4837b7d836fd", "route": "/v1/venues/map", "status": 422, "latency_ms": 5.685}
{"request_id": "5b48eb4de0234b719384187f35807724", "route": "/v1/venues/map", "status": 422, "latency_ms": 2.24}
ok
test_origin_text_resolves_and_unavailable_remains_missing (tests.api.test_google_maps.GoogleAPI.test_origin_text_resolves_and_unavailable_remains_missing) ... {"request_id": "a90d8987f6b746b7b7d26db85309edd3", "route": "/v1/sessions", "status": 200, "latency_ms": 198.494}
{"request_id": "215669a8b5d944f4968bff62ee024df6", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 567.716}
{"request_id": "b4041eb8587d4a4b8fe9922e8ef0c1ee", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 137.797}
{"request_id": "73c774b05b3b44bb906be4ea2f991079", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 118.414}
{"request_id": "396595924a9c4270af2cfe7e65987a60", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 111.917}
{"request_id": "214142cd924e4075b19a88710defe6b1", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 10.819}
ok
test_origin_validation_and_sqlite_restart (tests.api.test_google_maps.GoogleAPI.test_origin_validation_and_sqlite_restart) ... {"request_id": "1b8a9a95055b44fa890327e78cd5e7c7", "route": "/v1/sessions", "status": 200, "latency_ms": 309.264}
{"request_id": "76d1e9195a3b47169606ef5fe73f8438", "route": "/v1/sessions/{session_id}/preferences", "status": 422, "latency_ms": 2.195}
{"request_id": "2782a9cc36d746e9b9ecd88db5b02fe3", "route": "/v1/sessions/{session_id}/preferences", "status": 422, "latency_ms": 2.171}
{"request_id": "ae8ba8b8f0414d46ad8f4c94615537d2", "route": "/v1/sessions/{session_id}/preferences", "status": 422, "latency_ms": 2.968}
{"request_id": "c6404f75bd8c4f3692e57736d5025660", "route": "/v1/sessions/{session_id}/preferences", "status": 422, "latency_ms": 2.558}
{"request_id": "823c4e7837a845129100925a3771730d", "route": "/v1/sessions/{session_id}/preferences", "status": 200, "latency_ms": 40.176}
{"request_id": "c086378ffa4d4b6096db0f7744c5d520", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms": 22.954}
{"request_id": "b0b2a91da5d045fcab25f88c93a7f85d", "route": "/v1/geocode", "status": 200, "latency_ms": 113.691}
{"request_id": "80a4249f242d449f8a8932d8a49b807a", "route": "/v1/geocode", "status": 403, "latency_ms": 17.624}
ok
test_provider_tour_geometry_warnings_and_estimate_empty (tests.api.test_google_maps.GoogleAPI.test_provider_tour_geometry_warnings_and_estimate_empty) ... {"request_id": "7dcd72ba8f0749cd953279ff41821518", "route": "/v1/sessions", "status": 200, "latency_ms": 301.191}
{"request_id": "b6a9e96127a849d0856caf6029339c7d", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 406.64}
{"request_id": "cc71373f8e554826ab622ef70bdc4fb0", "route": "/v1/sessions/{session_id}/tour", "status": 200, "latency_ms": 146.842}
ok
test_reflected_secret_cannot_reach_geocode_response (tests.api.test_google_maps.GoogleAPI.test_reflected_secret_cannot_reach_geocode_response) ... {"request_id": "fbf9990581414c7b9096e832c482f3a8", "route": "/v1/sessions", "status": 200, "latency_ms": 265.374}
{"request_id": "d44cd61161fb4756bd139ba0e165c489", "route": "/v1/geocode", "status": 200, "latency_ms": 108.969}
ok
test_blank_data_and_database_environment_are_unset (tests.api.test_security.SecurityTests.test_blank_data_and_database_environment_are_unset) ... {"request_id": "22713fb064b8415a868dc349e3c39f94", "route": "/health", "status": 200, "latency_ms": 255.705}
{"request_id": "65ced2e7eb4745c4a55713c03bb8b576", "route": "/health", "status": 200, "latency_ms": 270.393}
ok
test_cors_comma_separated_origins_for_localhost_and_loopback (tests.api.test_security.SecurityTests.test_cors_comma_separated_origins_for_localhost_and_loopback) ... {"request_id": "009f8544707a45898af8936cf821a066", "route": "/health", "status": 200, "latency_ms": 200.763}
{"request_id": "e1b3e004291a44bb9eee602f9a3b86de", "route": "<unmatched>", "status": 413, "latency_ms": 0.545}
{"request_id": "bc69c725235843579ab1ea4a3851d40f", "route": "/health", "status": 200, "latency_ms": 6.223}
{"request_id": "3d1d537fdc0c411d872ef03640cb292b", "route": "<unmatched>", "status": 413, "latency_ms": 0.327}
{"request_id": "b172be1ac34e411bbb622199bb056480", "route": "/health", "status": 200, "latency_ms": 7.786}
ok
test_cors_exact_origin_including_guard_errors (tests.api.test_security.SecurityTests.test_cors_exact_origin_including_guard_errors) ... {"request_id": "3f2d07225d5c4190b35d631e425e6781", "route": "/health", "status": 200, "latency_ms": 229.447}
{"request_id": "9d05ae37fe794f05add603626bfe4e30", "route": "<unmatched>", "status": 413, "latency_ms": 1.018}
{"request_id": "a6c0f270f4ef4860ba762cce93c34d0f", "route": "<unmatched>", "status": 200, "latency_ms": 0.295}
{"request_id": "eb78c97e5a4e4c859316d4c6f9273eb7", "route": "/health", "status": 200, "latency_ms": 10.82}
{"request_id": "42de6c144e9c41df86993a64d6434aff", "route": "<unmatched>", "status": 413, "latency_ms": 0.373}
{"request_id": "7e61798548c54e29bc69d5561c3fbdcb", "route": "<unmatched>", "status": 400, "latency_ms": 0.278}
ok
test_declared_and_streamed_body_limits_precede_session_creation (tests.api.test_security.SecurityTests.test_declared_and_streamed_body_limits_precede_session_creation) ... {"request_id": "ca2b266e61cc4a509d910b6dfc921b45", "route": "<unmatched>", "status": 413, "latency_ms": 0.248}
{"request_id": "e84cda08f5b64ed49bd1be1f37b8227c", "route": "<unmatched>", "status": 413, "latency_ms": 0.272}
{"request_id": "37ef06b1efed431a898a986a807f7d59", "route": "<unmatched>", "status": 413, "latency_ms": 0.384}
ok
test_ip_rate_limit_includes_create_and_ignores_forwarded_header (tests.api.test_security.SecurityTests.test_ip_rate_limit_includes_create_and_ignores_forwarded_header) ... {"request_id": "491656734bac4b2d90ae32d1577cd155", "route": "/v1/sessions", "status": 200, "latency_ms": 201.5}
{"request_id": "db33fced0f6f477fa046219cffbe0780", "route": "/v1/sessions", "status": 200, "latency_ms": 3.231}
{"request_id": "c59453c74ec64ab593ace5a1069831ba", "route": "<unmatched>", "status": 429, "latency_ms": 0.242}
ok
test_known_and_unknown_tokens_use_constant_time_comparison (tests.api.test_security.SecurityTests.test_known_and_unknown_tokens_use_constant_time_comparison) ... ok
test_limit_windows_reset_and_memory_is_bounded (tests.api.test_security.SecurityTests.test_limit_windows_reset_and_memory_is_bounded) ... ok
test_logs_have_only_allowlisted_fields_and_route_template (tests.api.test_security.SecurityTests.test_logs_have_only_allowlisted_fields_and_route_template) ... {"request_id": "8e9eefccdb1a47a2a8078274574e842f", "route": "/v1/sessions", "status": 200, "latency_ms": 236.791}
ok
test_session_headers_and_server_issued_request_ids (tests.api.test_security.SecurityTests.test_session_headers_and_server_issued_request_ids) ... {"request_id": "7e31e1448afd428aa2259f83bfea4035", "route": "/health", "status": 200, "latency_ms": 8.881}
ok
test_token_rate_limit_is_configurable_and_isolated (tests.api.test_security.SecurityTests.test_token_rate_limit_is_configurable_and_isolated) ... {"request_id": "3c8250f00c6a490595ef4259e67385d4", "route": "/v1/sessions", "status": 200, "latency_ms": 244.344}
{"request_id": "34bd4e72e3f340838c3cc34ef1068e1e", "route": "/v1/sessions", "status": 200, "latency_ms": 5.02}
{"request_id": "42329d6e274644ac9c3b1e485cd1ffe6", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms": 10.184}
{"request_id": "19b849d3f23047e5b4e597a9fa5a72a7", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms": 9.489}
{"request_id": "cede7e473fb241d2809bd65bb4c618ed", "route": "<unmatched>", "status": 429, "latency_ms": 0.36}
{"request_id": "994fedd7c4f24170b82e8a8d89d3ca69", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms": 9.535}
ok
test_uniform_errors_no_input_echo_or_traceback (tests.api.test_security.SecurityTests.test_uniform_errors_no_input_echo_or_traceback) ... {"request_id": "0b584a6e00164ee4abb6872c4bf77bb8", "route": "<unmatched>", "status": 404, "latency_ms": 219.928}
{"request_id": "74c450891c8b4c7da022947f5a2ed223", "route": "/v1/sessions", "status": 405, "latency_ms": 1.051}
{"request_id": "9759749e28b7475a959ca33b12da9361", "route": "/v1/sessions/{session_id}/messages", "status": 422, "latency_ms": 1.795}
{"request_id": "0b13dba5d25640ee9e6326ab7cf1341f", "route": "<unmatched>", "status": 413, "latency_ms": 0.443}
{"request_id": "2b7d3530c2c94b0daee6f45f0c14b1e2", "route": "/crash", "status": 500, "latency_ms": 7.274}
ok
test_wildcard_cors_config_fails_closed (tests.api.test_security.SecurityTests.test_wildcard_cors_config_fails_closed) ... {"request_id": "f577120096a7457cb8e0eb2c92e7fa84", "route": "/health", "status": 200, "latency_ms": 225.333}
{"request_id": "b4af28e7f33143da9284080c2f2ae8f2", "route": "/health", "status": 200, "latency_ms": 211.004}
{"request_id": "a33a0cbb27f740bebf2dc32ea6b9c827", "route": "/health", "status": 200, "latency_ms": 285.811}
ok
test_configured_csv_bounded_and_allowlisted_not_legacy_load (tests.api.test_venues.VenueListTests.test_configured_csv_bounded_and_allowlisted_not_legacy_load) ... {"request_id": "c4dc837a56c643e4a134f9ee0e737efa", "route": "/v1/venues", "status": 200, "latency_ms": 260.932}
{"request_id": "6b8af7a2d8184528af73a518ad6b6e9f", "route": "/v1/venues", "status": 200, "latency_ms": 48.952}
{"request_id": "9f36c81b1ca9423c84b3e866e87a7f12", "route": "/v1/venues", "status": 200, "latency_ms": 74.087}
{"request_id": "2cd56750ceb8422ba5eb2c97bf7ce32f", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 33.677}
{"request_id": "0c2ed2e7e13d459396a3167fdb42bd75", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 37.28}
{"request_id": "bd86d57540e340f3a9d3cc6ff94f8339", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 37.605}
{"request_id": "a82bc2b3c36740de9ef992f40b041805", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 38.458}
{"request_id": "3994b05a11a24201a5f017407b182514", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 39.724}
{"request_id": "626cf440b18b4c599178ed0e0b379267", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 36.687}
{"request_id": "22f946d7b9894d90895cf27ff9ac562d", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 36.431}
{"request_id": "182693aa99d1418ba115475111d4f098", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 36.534}
{"request_id": "d588cb2d76e04d14be5ae42a32fee420", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 35.33}
{"request_id": "1acce7f69aac4a0980956abfe5d2b8dc", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 38.743}
{"request_id": "58b04328d8864f29bb1544887c6d3d03", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 36.304}
{"request_id": "7ff7aecea93b470098c17d4f49d949e0", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 36.379}
{"request_id": "b427bb47b7fa4ca9a39321f3176b5a83", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 38.578}
{"request_id": "b5c62b222083445696c957c89f1f4bea", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 34.824}
{"request_id": "bb5362f368ba400181ca606b8324f1d2", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 35.03}
{"request_id": "559e56b9a4be4f328d3fa53d5cb9c3bb", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 38.162}
{"request_id": "0259d3ec3aec41e58ea445148a515c11", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 41.084}
{"request_id": "f9849fe8c90d4bf38a337d7c61a34423", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 39.573}
{"request_id": "55d4cb233ddb4711a5401dc0d6c2a04a", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 38.843}
{"request_id": "41d40279706844549d251d55db69e832", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 42.342}
{"request_id": "5fc71f3125f145aea35dfe613f33310e", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 38.429}
{"request_id": "503f40b5de1747aaadea414146322cb1", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 39.343}
{"request_id": "1db9bd554acc449589befd7283d69f2f", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 37.691}
{"request_id": "b5058d05101a456a8d1f0f24aae2d2fc", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 39.442}
{"request_id": "8d0031e9c2364dcc8f42c56546505019", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 35.864}
{"request_id": "46860864f6c14fa2ab9cfe859ab986f3", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 34.41}
{"request_id": "e83468abcb784f88aafd52659957469b", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 36.239}
{"request_id": "4d110f24d0514ff694899a389b34e67c", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 38.751}
{"request_id": "067aaa4af4394a7ea14dafdc9b94b0a1", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 36.405}
{"request_id": "1c95431843c649c4b25b2b097c991e73", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 35.007}
{"request_id": "3087657115614f3a8bfad79d40b9add9", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 34.481}
{"request_id": "e3967485baa8483798c87b3a1f44892c", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 36.141}
{"request_id": "18e006f36afc4256bc4bee9d0eadcf2e", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 35.347}
{"request_id": "9cce84652e1b4675888ea7c1114bb021", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 36.837}
{"request_id": "d78b35b05fb9481aa7160de75fd3d7f7", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 38.28}
{"request_id": "99a29f751445480c86e4714068f01967", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 34.58}
{"request_id": "5bd7d46e7d45492ab2e1cd6867d4ed0e", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 42.348}
{"request_id": "be71478e83644d10844737507483ebcc", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 110.013}
{"request_id": "ea8fffc6bc0440acbaf0fda66fa72987", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 226.793}
{"request_id": "5f581030018047d8af67a9fcc9ebddb3", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 105.961}
{"request_id": "3c1a282515134bcea1e94aa932c64444", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 37.368}
{"request_id": "73fb95b1c2ce41538384c89d730b167b", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 36.48}
{"request_id": "6ba60a6c0e274cd78df3b5a081d85428", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 39.443}
{"request_id": "1fe3241bceeb4d58ac3fbe5dabdddd0b", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 35.886}
{"request_id": "d58b710343ae471295ad8b1cac2b1f65", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 34.516}
{"request_id": "24d8ea47a45f4db5991746eb69621478", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 35.932}
{"request_id": "fa5a9a997bbd4cc38564112e3851d335", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 32.672}
{"request_id": "8b101edae0dc4f9191ad96253936ab6d", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 37.601}
{"request_id": "d7861451921f4a3bbd847440d459ed85", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 36.777}
{"request_id": "67cdc19e16b34a1289c8e68bd661362d", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 37.913}
ok
test_pagination_and_city_filter (tests.api.test_venues.VenueListTests.test_pagination_and_city_filter) ... {"request_id": "3f45843e02544fe1b4544ec97756908c", "route": "/v1/venues", "status": 200, "latency_ms": 203.709}
{"request_id": "b563392bd3c542fa9201d43a3bab221e", "route": "/v1/venues", "status": 200, "latency_ms": 10.111}
{"request_id": "9d72ecae3479470482b24657f87e23f2", "route": "/v1/venues", "status": 200, "latency_ms": 12.791}
{"request_id": "02c4b7bb612341699521cc241f545416", "route": "/v1/venues", "status": 200, "latency_ms": 9.767}
ok
test_pagination_bounds_are_enveloped_errors (tests.api.test_venues.VenueListTests.test_pagination_bounds_are_enveloped_errors) ... {"request_id": "5f528405efbf4814870580406d777bea", "route": "/v1/venues", "status": 422, "latency_ms": 199.764}
{"request_id": "a409f3e0996a49878bca38ec66e5cbe7", "route": "/v1/venues", "status": 422, "latency_ms": 1.217}
{"request_id": "186dc3bf0e0c458e967dd81c42f3c4c5", "route": "/v1/venues", "status": 422, "latency_ms": 1.53}
{"request_id": "82e58b92fdde4f22bb1d79708e6ad2aa", "route": "/v1/venues", "status": 422, "latency_ms": 1.322}
{"request_id": "9fdfbe38234b4be5977a5debffcac8c6", "route": "/v1/venues", "status": 422, "latency_ms": 1.509}
{"request_id": "0c422a2f6afe41c481e7aea548bc2f7a", "route": "/v1/venues", "status": 422, "latency_ms": 1.611}
{"request_id": "08613e63e7954fbb83f453836e6b6559", "route": "/v1/venues", "status": 200, "latency_ms": 14.168}
ok
test_synthetic_default_list_and_detail_share_snapshot (tests.api.test_venues.VenueListTests.test_synthetic_default_list_and_detail_share_snapshot) ... {"request_id": "8f0ad47c2f2241acae02464fd1e48033", "route": "/v1/venues", "status": 200, "latency_ms": 260.211}
{"request_id": "08db029a33ff4989ba678c5c57e70e7a", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 15.591}
{"request_id": "9e9b2b84f6b24d2aa3aa7b231b4aad50", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 8.866}
{"request_id": "0d8523fa1a724dc19a269845e030e50b", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 10.355}
{"request_id": "3835b919de29482b89ee4765bd52d574", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 8.459}
{"request_id": "adf0b01e14404fdab60bbe792d1d267f", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 8.509}
{"request_id": "fcba42d0dd0f47bcb863d743f1913c43", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 8.888}
{"request_id": "746c39a37e764094b2cbbd1b885f5704", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 9.568}
{"request_id": "6f65066f945a421d94996beecd2b3746", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 8.951}
{"request_id": "c62de46405774fbda3cf8b18e75100dc", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 8.616}
{"request_id": "5da40ff4b7144d38a9df18f269b00269", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 8.871}
{"request_id": "a4394c3feef84460938198e2e09f64fa", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 9.273}
{"request_id": "d0e065d3468c4c7d92950851e1a2130d", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 12.691}
{"request_id": "1fb7e250fa024c5fbb7d29a7b79d0f8e", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 11.049}
ok
test_adjacent_unsorted_intervals_and_verified_closed_days (tests.data.test_evidence.EvidenceTests.test_adjacent_unsorted_intervals_and_verified_closed_days) ... ok
test_cache_and_version_invalidate_for_every_overlay_byte_change (tests.data.test_evidence.EvidenceTests.test_cache_and_version_invalidate_for_every_overlay_byte_change) ... ok
test_fields_require_independent_source_and_valid_date (tests.data.test_evidence.EvidenceTests.test_fields_require_independent_source_and_valid_date) ... ok
test_invalid_rows_do_not_prevent_other_entries_loading (tests.data.test_evidence.EvidenceTests.test_invalid_rows_do_not_prevent_other_entries_loading) ... ok
test_invalid_times_overlap_reverse_and_partial_week_rejected (tests.data.test_evidence.EvidenceTests.test_invalid_times_overlap_reverse_and_partial_week_rejected) ... ok
test_partial_field_is_loaded_and_rejected_without_promoting_price (tests.data.test_evidence.EvidenceTests.test_partial_field_is_loaded_and_rejected_without_promoting_price) ... ok
test_price_type_order_and_negative_values_rejected (tests.data.test_evidence.EvidenceTests.test_price_type_order_and_negative_values_rejected) ... ok
test_unknown_and_all_duplicate_id_entries_rejected_rest_loads (tests.data.test_evidence.EvidenceTests.test_unknown_and_all_duplicate_id_entries_rejected_rest_loads) ... ok
test_unreadable_malformed_oversized_and_relative_files_fail_closed (tests.data.test_evidence.EvidenceTests.test_unreadable_malformed_oversized_and_relative_files_fail_closed) ... ok
test_unset_or_blank_is_identical_to_original_dataset (tests.data.test_evidence.EvidenceTests.test_unset_or_blank_is_identical_to_original_dataset) ... ok
test_valid_fixture_merges_minutes_prices_and_count_only_report (tests.data.test_evidence.EvidenceTests.test_valid_fixture_merges_minutes_prices_and_count_only_report) ... ok
test_verified_feasibility_requires_all_three_evidence_types (tests.data.test_evidence.EvidenceTests.test_verified_feasibility_requires_all_three_evidence_types) ... ok
test_absent_path_fallback_label_hash_and_planner_integration (tests.data.test_loader.LoaderTests.test_absent_path_fallback_label_hash_and_planner_integration) ... ok
test_csv_bom_roundtrip_matches_json (tests.data.test_loader.LoaderTests.test_csv_bom_roundtrip_matches_json) ... ok
test_duplicate_id_then_url_and_deterministic_order (tests.data.test_loader.LoaderTests.test_duplicate_id_then_url_and_deterministic_order) ... ok
test_environment_and_default_path (tests.data.test_loader.LoaderTests.test_environment_and_default_path) ... ok
test_existing_empty_file_and_unreadable_directory_do_not_fallback (tests.data.test_loader.LoaderTests.test_existing_empty_file_and_unreadable_directory_do_not_fallback) ... ok
test_file_bytes_not_modified (tests.data.test_loader.LoaderTests.test_file_bytes_not_modified) ... ok
test_geo_status_and_online_are_flags_for_planner (tests.data.test_loader.LoaderTests.test_geo_status_and_online_are_flags_for_planner) ... ok
test_integral_decimal_csv_prices_supported (tests.data.test_loader.LoaderTests.test_integral_decimal_csv_prices_supported) ... ok
test_malformed_csv_rejected (tests.data.test_loader.LoaderTests.test_malformed_csv_rejected) ... ok
test_malformed_json_and_wrong_shape_do_not_fallback (tests.data.test_loader.LoaderTests.test_malformed_json_and_wrong_shape_do_not_fallback) ... ok
test_missing_urls_do_not_collapse_distinct_ids (tests.data.test_loader.LoaderTests.test_missing_urls_do_not_collapse_distinct_ids) ... ok
test_normalization_and_no_evidence_promotion (tests.data.test_loader.LoaderTests.test_normalization_and_no_evidence_promotion) ... ok
test_null_zero_malformed_nonfinite_and_bounds_coordinates (tests.data.test_loader.LoaderTests.test_null_zero_malformed_nonfinite_and_bounds_coordinates) ... ok
test_rejection_and_flags_report_contains_only_counts (tests.data.test_loader.LoaderTests.test_rejection_and_flags_report_contains_only_counts) ... ok
test_relative_path_rejected (tests.data.test_loader.LoaderTests.test_relative_path_rejected) ... ok
test_unknown_zero_negative_fractional_inverted_prices (tests.data.test_loader.LoaderTests.test_unknown_zero_negative_fractional_inverted_prices) ... ok
test_csv_and_json_tags_and_aggregate_only (tests.data.test_r0_evidence.SourceEvidence.test_csv_and_json_tags_and_aggregate_only) ... ok
test_evidence_in_list_detail_and_nested_stop (tests.data.test_r0_evidence.SourceEvidence.test_evidence_in_list_detail_and_nested_stop) ... {"request_id": "7428b95e4e084dac8bdc4dd16460cf8e", "route": "/v1/venues", "status": 200, "latency_ms": 211.102}
{"request_id": "9e9dc8f3665742d488baaa7e4ffdb36e", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 6.342}
{"request_id": "e8203fc0460e4aa3ab68089195a84dff", "route": "/v1/sessions", "status": 200, "latency_ms": 2.691}
{"request_id": "bcf0646a798d496682580226a0aeed0c", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 223.142}
{"request_id": "5691bcbc38264103b1eb3aef53e15808", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 7.763}
{"request_id": "272921d871cb4ef39f09b243ed445f86", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 8.664}
{"request_id": "3ab5ba7d481641f3be877e28748c0ce7", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 16.735}
ok
test_rating_bounds_scales_and_nonfinite (tests.data.test_r0_evidence.SourceEvidence.test_rating_bounds_scales_and_nonfinite) ... ok
test_review_count_zero_and_invalid (tests.data.test_r0_evidence.SourceEvidence.test_review_count_zero_and_invalid) ... ok
test_timestamp_unknown_and_source_offset (tests.data.test_r0_evidence.SourceEvidence.test_timestamp_unknown_and_source_offset) ... ok
test_basic_vietnamese (tests.planner.test_extract_explain.ExtractTests.test_basic_vietnamese) ... ok
test_edit_preserves_unspecified_slots (tests.planner.test_extract_explain.ExtractTests.test_edit_preserves_unspecified_slots) ... ok
test_exclusion_not_interest (tests.planner.test_extract_explain.ExtractTests.test_exclusion_not_interest) ... ok
test_explain_flags_unknowns (tests.planner.test_extract_explain.ExtractTests.test_explain_flags_unknowns) ... ok
test_missing_slots_asked_not_guessed (tests.planner.test_extract_explain.ExtractTests.test_missing_slots_asked_not_guessed) ... ok
test_prompt_injection_is_just_text (tests.planner.test_extract_explain.ExtractTests.test_prompt_injection_is_just_text) ... ok
test_unavailable_never_fakes (tests.planner.test_extract_explain.ExtractTests.test_unavailable_never_fakes) ... ok
test_no_diacritics_and_whole_word (tests.planner.test_extract_explain.FoldedTerms.test_no_diacritics_and_whole_word) ... ok
test_substring_inside_other_word_is_ignored (tests.planner.test_extract_explain.FoldedTerms.test_substring_inside_other_word_is_ignored) ... ok
test_injection_sentence_yields_no_slots (tests.planner.test_extract_explain.InjectionHardening.test_injection_sentence_yields_no_slots) ... ok
test_legit_sentence_survives_next_to_injection (tests.planner.test_extract_explain.InjectionHardening.test_legit_sentence_survives_next_to_injection) ... ok
test_out_of_range_values_are_rejected_not_clamped (tests.planner.test_extract_explain.NoSilentClamp.test_out_of_range_values_are_rejected_not_clamped) ... ok
test_negative_zero_and_out_of_range_are_rejected_and_reported (tests.planner.test_extract_explain.RangeRejection.test_negative_zero_and_out_of_range_are_rejected_and_reported) ... ok
test_provider_error_llm_calls_attribute_wins (tests.planner.test_llm_provider.AdapterReportedAttempt.test_provider_error_llm_calls_attribute_wins) ... ok
test_prior_includes_start_time_and_weekday (tests.planner.test_llm_provider.Hardening.test_prior_includes_start_time_and_weekday) ... ok
test_unknown_field_names_not_reflected (tests.planner.test_llm_provider.Hardening.test_unknown_field_names_not_reflected) ... ok
test_bad_responses_are_unavailable_never_success (tests.planner.test_llm_provider.LLMBoundary.test_bad_responses_are_unavailable_never_success) ... ok
test_injection_sentences_are_not_sent_to_provider (tests.planner.test_llm_provider.LLMBoundary.test_injection_sentences_are_not_sent_to_provider) ... ok
test_origin_must_be_in_pilot_area (tests.planner.test_llm_provider.LLMBoundary.test_origin_must_be_in_pilot_area) ... ok
test_prior_slots_preserved_when_model_omits_or_nulls (tests.planner.test_llm_provider.LLMBoundary.test_prior_slots_preserved_when_model_omits_or_nulls) ... ok
test_provider_errors_are_unavailable (tests.planner.test_llm_provider.LLMBoundary.test_provider_errors_are_unavailable) ... ok
test_terms_validated (tests.planner.test_llm_provider.LLMBoundary.test_terms_validated) ... ok
test_unknown_and_out_of_range_dropped_not_clamped (tests.planner.test_llm_provider.LLMBoundary.test_unknown_and_out_of_range_dropped_not_clamped) ... ok
test_valid_output_is_applied_and_marked_live (tests.planner.test_llm_provider.LLMBoundary.test_valid_output_is_applied_and_marked_live) ... ok
test_free_text_place_is_carried_not_resolved (tests.planner.test_llm_provider.OriginText.test_free_text_place_is_carried_not_resolved) ... ok
test_landmark_sets_label_and_source (tests.planner.test_llm_provider.OriginText.test_landmark_sets_label_and_source) ... ok
test_model_cannot_set_label_or_source_without_landmark (tests.planner.test_llm_provider.OriginText.test_model_cannot_set_label_or_source_without_landmark) ... ok
test_rules_extractor_labels_landmarks (tests.planner.test_llm_provider.OriginText.test_rules_extractor_labels_landmarks) ... ok
test_gemini_adapter_does_not_launder_raw_origin (tests.planner.test_llm_provider.OriginTrustBoundary.test_gemini_adapter_does_not_launder_raw_origin) ... ok
test_landmark_must_be_mentioned_in_the_message (tests.planner.test_llm_provider.OriginTrustBoundary.test_landmark_must_be_mentioned_in_the_message) ... ok
test_origin_text_must_be_a_phrase_from_the_message (tests.planner.test_llm_provider.OriginTrustBoundary.test_origin_text_must_be_a_phrase_from_the_message) ... ok
test_raw_model_origin_label_source_are_rejected (tests.planner.test_llm_provider.OriginTrustBoundary.test_raw_model_origin_label_source_are_rejected) ... ok
test_raw_origin_only_for_explicitly_trusted_providers (tests.planner.test_llm_provider.OriginTrustBoundary.test_raw_origin_only_for_explicitly_trusted_providers) ... ok
test_unicode_control_characters_rejected_at_extraction (tests.planner.test_llm_provider.OriginTrustBoundary.test_unicode_control_characters_rejected_at_extraction) ... ok
test_precise_origin_never_sent_to_the_model (tests.planner.test_llm_provider.PriorPrivacy.test_precise_origin_never_sent_to_the_model) ... ok
test_cache_expires (tests.planner.test_llm_provider.RulesFirst.test_cache_expires) ... ok
test_complete_requests_never_call_the_model (tests.planner.test_llm_provider.RulesFirst.test_complete_requests_never_call_the_model) ... ok
test_local_budget_refusal_is_not_a_provider_call (tests.planner.test_llm_provider.RulesFirst.test_local_budget_refusal_is_not_a_provider_call) ... ok
test_missing_origin_with_place_cue_calls_model_once_then_cache (tests.planner.test_llm_provider.RulesFirst.test_missing_origin_with_place_cue_calls_model_once_then_cache) ... ok
test_model_failure_falls_back_to_rules_and_counts_the_call (tests.planner.test_llm_provider.RulesFirst.test_model_failure_falls_back_to_rules_and_counts_the_call) ... ok
test_out_of_range_values_are_not_sent_to_the_model (tests.planner.test_llm_provider.RulesFirst.test_out_of_range_values_are_not_sent_to_the_model) ... ok
test_short_messages_skip_the_model (tests.planner.test_llm_provider.RulesFirst.test_short_messages_skip_the_model) ... ok
test_cheap_venue_beyond_pool_cap_is_found (tests.planner.test_planner_core.BudgetPruneBeforeCap.test_cheap_venue_beyond_pool_cap_is_found) ... ok
test_rebuild_matches_planned_tour_and_rejects_bad_input (tests.planner.test_planner_core.BuildTour.test_rebuild_matches_planned_tour_and_rejects_bad_input) ... ok
test_more_stops_than_max_is_rejected (tests.planner.test_planner_core.BuildTourMaxStops.test_more_stops_than_max_is_rejected) ... ok
test_malformed_coordinates_do_not_raise (tests.planner.test_planner_core.CheckedProviderMalformedInput.test_malformed_coordinates_do_not_raise) ... ok
test_bad_provider_output_becomes_unknown_leg (tests.planner.test_planner_core.CheckedProviderTests.test_bad_provider_output_becomes_unknown_leg) ... ok
test_cross_midnight_is_rejected_not_wrapped (tests.planner.test_planner_core.Midnight.test_cross_midnight_is_rejected_not_wrapped) ... ok
test_budget_infeasible_gives_reasons (tests.planner.test_planner_core.PlannerCore.test_budget_infeasible_gives_reasons) ... ok
test_closed_at_arrival_is_hard_reject (tests.planner.test_planner_core.PlannerCore.test_closed_at_arrival_is_hard_reject) ... ok
test_conditional_tour_is_valid_and_labelled (tests.planner.test_planner_core.PlannerCore.test_conditional_tour_is_valid_and_labelled) ... ok
test_duration_too_short (tests.planner.test_planner_core.PlannerCore.test_duration_too_short) ... ok
test_excludes_online_nogeo_noprice (tests.planner.test_planner_core.PlannerCore.test_excludes_online_nogeo_noprice) ... ok
test_far_venue_not_chosen (tests.planner.test_planner_core.PlannerCore.test_far_venue_not_chosen) ... ok
test_interest_and_exclusion (tests.planner.test_planner_core.PlannerCore.test_interest_and_exclusion) ... ok
test_matches_exact_baseline_on_small_fixture (tests.planner.test_planner_core.PlannerCore.test_matches_exact_baseline_on_small_fixture)
Search must equal brute force over all permutations of the eligible pool. ... ok
test_missing_slots (tests.planner.test_planner_core.PlannerCore.test_missing_slots) ... ok
test_replace_failure_returns_reason_and_unchanged_tour (tests.planner.test_planner_core.PlannerCore.test_replace_failure_returns_reason_and_unchanged_tour) ... ok
test_replace_keeps_other_stops (tests.planner.test_planner_core.PlannerCore.test_replace_keeps_other_stops) ... ok
test_strict_refuses_without_evidence (tests.planner.test_planner_core.PlannerCore.test_strict_refuses_without_evidence) ... ok
test_unreachable_leg (tests.planner.test_planner_core.PlannerCore.test_unreachable_leg) ... ok
test_validate_catches_tampering (tests.planner.test_planner_core.PlannerCore.test_validate_catches_tampering) ... ok
test_verified_feasible_requires_all_evidence (tests.planner.test_planner_core.PlannerCore.test_verified_feasible_requires_all_evidence) ... ok
test_truncation_is_disclosed (tests.planner.test_planner_core.PoolTruncation.test_truncation_is_disclosed) ... ok
test_replace_never_sends_more_than_45_points_to_a_provider (tests.planner.test_planner_core.ReplaceRoutePointCap.test_replace_never_sends_more_than_45_points_to_a_provider) ... ok
test_ineligible_venue_fails (tests.planner.test_planner_core.ValidateRecompute.test_ineligible_venue_fails) ... ok
test_order_swap_fails_and_clean_passes (tests.planner.test_planner_core.ValidateRecompute.test_order_swap_fails_and_clean_passes) ... ok
test_strict_pref_rejects_conditional_tour (tests.planner.test_planner_core.ValidateRecompute.test_strict_pref_rejects_conditional_tour) ... ok
test_tampered_leg_totals_and_timeline_fail (tests.planner.test_planner_core.ValidateRecompute.test_tampered_leg_totals_and_timeline_fail) ... ok
test_diacritics_optional_in_query (tests.planner.test_relevance.Relevance.test_diacritics_optional_in_query) ... ok
test_eligible_requires_match_when_interests_set (tests.planner.test_relevance.Relevance.test_eligible_requires_match_when_interests_set) ... ok
test_exclusion_whole_word (tests.planner.test_relevance.Relevance.test_exclusion_whole_word) ... ok
test_fold_is_diacritic_insensitive (tests.planner.test_relevance.Relevance.test_fold_is_diacritic_insensitive) ... ok
test_relevance_beats_distance_under_pool_cap (tests.planner.test_relevance.Relevance.test_relevance_beats_distance_under_pool_cap) ... ok
test_synonym_sweets (tests.planner.test_relevance.Relevance.test_synonym_sweets) ... ok
test_whole_word_not_substring (tests.planner.test_relevance.Relevance.test_whole_word_not_substring) ... ok
test_failed_batch_cooldown_recovers_without_per_leg_retry (tests.providers.test_google_maps.GoogleFakeCase.test_failed_batch_cooldown_recovers_without_per_leg_retry) ... ok
test_failures_and_quota_never_raise_or_retry_each_leg (tests.providers.test_google_maps.GoogleFakeCase.test_failures_and_quota_never_raise_or_retry_each_leg) ... ok
test_geocode_errors (tests.providers.test_google_maps.GoogleFakeCase.test_geocode_errors) ... ok
test_geocode_fixed_country_bias_five_results_and_budget (tests.providers.test_google_maps.GoogleFakeCase.test_geocode_fixed_country_bias_five_results_and_budget) ... ok
test_geometry_coordinate_order_warnings_and_limits (tests.providers.test_google_maps.GoogleFakeCase.test_geometry_coordinate_order_warnings_and_limits) ... ok
test_geometry_malformed_and_lru_bound (tests.providers.test_google_maps.GoogleFakeCase.test_geometry_malformed_and_lru_bound) ... ok
test_matrix_chunk_limits_no_truncation (tests.providers.test_google_maps.GoogleFakeCase.test_matrix_chunk_limits_no_truncation) ... ok
test_matrix_fixed_mask_walk_duration_and_cache (tests.providers.test_google_maps.GoogleFakeCase.test_matrix_fixed_mask_walk_duration_and_cache) ... ok
test_secret_reflection_and_no_external_override (tests.providers.test_google_maps.GoogleFakeCase.test_secret_reflection_and_no_external_override) ... ok
test_status_and_not_found_never_estimated (tests.providers.test_google_maps.GoogleFakeCase.test_status_and_not_found_never_estimated) ... ok
test_timeout (tests.providers.test_google_maps.GoogleFakeCase.test_timeout) ... ok
test_api_live_uses_validation_health_and_failure_envelopes (tests.providers.test_http.LocalProviders.test_api_live_uses_validation_health_and_failure_envelopes) ... {"request_id": "ee6b134ddcd84384adf83800364d2511", "route": "/health", "status": 200, "latency_ms": 187.794}
{"request_id": "ee3c15e5f73c4a2facb15c86d5e7a9f9", "route": "/health", "status": 200, "latency_ms": 6.887}
{"request_id": "2859e6b39e614665aa4b8e5820cce301", "route": "/v1/sessions", "status": 200, "latency_ms": 3.81}
{"request_id": "90204c6f82f0451eb39b3386ec53f73a", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 113.787}
{"request_id": "2c2ed896ea0142519f84b9a5ed01d3a0", "route": "/v1/sessions/{session_id}/messages", "status": 503, "latency_ms": 90.468}
ok
test_extraction_failures_have_safe_kinds (tests.providers.test_http.LocalProviders.test_extraction_failures_have_safe_kinds) ... ok
test_extraction_json_post_key_from_env_and_validation (tests.providers.test_http.LocalProviders.test_extraction_json_post_key_from_env_and_validation) ... ok
test_health_flags_no_endpoint_no_sockets_no_secrets (tests.providers.test_http.LocalProviders.test_health_flags_no_endpoint_no_sockets_no_secrets) ... {"request_id": "6382c908aba841b0ba2a33ab5b2c014b", "route": "/health", "status": 200, "latency_ms": 230.495}
ok
test_model_injection_output_is_schema_checked_before_planning (tests.providers.test_http.LocalProviders.test_model_injection_output_is_schema_checked_before_planning) ... ok
test_no_non_loopback_socket_redirect_or_proxy (tests.providers.test_http.LocalProviders.test_no_non_loopback_socket_redirect_or_proxy) ... ok
test_quota_is_thread_safe_and_cache_hits_cost_no_calls (tests.providers.test_http.LocalProviders.test_quota_is_thread_safe_and_cache_hits_cost_no_calls) ... ok
test_route_failures_never_raise_or_upgrade_evidence (tests.providers.test_http.LocalProviders.test_route_failures_never_raise_or_upgrade_evidence) ... ok
test_route_rejects_invalid_numbers_and_no_route (tests.providers.test_http.LocalProviders.test_route_rejects_invalid_numbers_and_no_route) ... ok
test_route_success_foot_units_direction_and_lru (tests.providers.test_http.LocalProviders.test_route_success_foot_units_direction_and_lru) ... ok
test_slow_drip_obeys_total_body_deadline (tests.providers.test_http.LocalProviders.test_slow_drip_obeys_total_body_deadline) ... ok
test_strict_mode_cannot_succeed_on_unavailable_routes (tests.providers.test_http.LocalProviders.test_strict_mode_cannot_succeed_on_unavailable_routes) ... ok
test_429_persists_until_next_window_and_late_429_does_not_poison_new_day (tests.providers.test_llm_budget.BudgetClock.test_429_persists_until_next_window_and_late_429_does_not_poison_new_day) ... ok
test_concurrent_reservations_never_exceed_limit (tests.providers.test_llm_budget.BudgetClock.test_concurrent_reservations_never_exceed_limit) ... ok
test_documented_fixed_offset_last_resort (tests.providers.test_llm_budget.BudgetClock.test_documented_fixed_offset_last_resort) ... ok
test_dst_short_and_long_days (tests.providers.test_llm_budget.BudgetClock.test_dst_short_and_long_days) ... ok
test_independent_processes_share_one_hard_limit (tests.providers.test_llm_budget.BudgetClock.test_independent_processes_share_one_hard_limit) ... ok
test_midnight_pacific_not_utc (tests.providers.test_llm_budget.BudgetClock.test_midnight_pacific_not_utc) ... ok
test_restart_preserves_used_and_limit_zero (tests.providers.test_llm_budget.BudgetClock.test_restart_preserves_used_and_limit_zero) ... ok
test_429_blocks_further_transport (tests.providers.test_llm_budget.GeminiBudget.test_429_blocks_further_transport) ... ok
test_budget_write_while_session_owned_and_restart_and_no_key_in_api_or_logs (tests.providers.test_llm_budget.GeminiBudget.test_budget_write_while_session_owned_and_restart_and_no_key_in_api_or_logs) ... ok
test_explicit_budget_db_and_corrupt_storage_fail_closed_without_secrets (tests.providers.test_llm_budget.GeminiBudget.test_explicit_budget_db_and_corrupt_storage_fail_closed_without_secrets) ... {"request_id": "d3bd64272d77432a948ed509a44e8ae7", "route": "/health", "status": 503, "latency_ms": 198.641}
ok
test_invalid_limit_defaults_to_18 (tests.providers.test_llm_budget.GeminiBudget.test_invalid_limit_defaults_to_18) ... ok
test_message_429_reports_attempt_and_authoritative_exhaustion (tests.providers.test_llm_budget.GeminiBudget.test_message_429_reports_attempt_and_authoritative_exhaustion) ... {"request_id": "f5aed8f8a3854f81a395aeee400bfd85", "route": "/v1/sessions", "status": 200, "latency_ms": 183.308}
{"request_id": "3ace12e71c8848d5ae7a031c4a4f756b", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 9.835}
{"request_id": "a05f459ca9f74d7cb79f990696cf1c36", "route": "/health", "status": 200, "latency_ms": 6.389}
ok
test_no_key_keeps_rules_available_without_claiming_live_provider (tests.providers.test_llm_budget.GeminiBudget.test_no_key_keeps_rules_available_without_claiming_live_provider) ... {"request_id": "d52ce9afaa7946d79cb607201c5a3659", "route": "/health", "status": 200, "latency_ms": 189.86}
{"request_id": "79bd21833fa34d8ea00635c43fdeaaad", "route": "/v1/sessions", "status": 200, "latency_ms": 4.343}
{"request_id": "256346a1a44849e48fcf8fc9f6eff795", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 73.479}
ok
test_retry_refused_locally_still_reports_first_attempt (tests.providers.test_llm_budget.GeminiBudget.test_retry_refused_locally_still_reports_first_attempt) ... ok
test_rules_cache_local_quota_message_metadata (tests.providers.test_llm_budget.GeminiBudget.test_rules_cache_local_quota_message_metadata) ... {"request_id": "0b062d2fc32b4802a07ebaf9c865a3d3", "route": "/v1/sessions", "status": 200, "latency_ms": 197.202}
{"request_id": "7f05f353595e41e58d78bbd47eb8490b", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 73.735}
{"request_id": "c0e2c111d1264187b5fd74c742648399", "route": "/v1/sessions", "status": 200, "latency_ms": 3.735}
{"request_id": "547c3be0bc8f4370ac65ed138fe095b5", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 10.359}
{"request_id": "90c9b0b2ae954e6ca68b09e5981c7e16", "route": "/v1/sessions", "status": 200, "latency_ms": 3.849}
{"request_id": "a4b621ae99f84bb49ee85dc2c39dec1e", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 10.106}
{"request_id": "ef43984b67494cf5a18434fe4d3835fd", "route": "/v1/sessions", "status": 200, "latency_ms": 3.357}
{"request_id": "b0b194439fdd4db89e9fc2f4c2c9f081", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 10.688}
ok
test_transport_retry_and_explanation_each_count_once (tests.providers.test_llm_budget.GeminiBudget.test_transport_retry_and_explanation_each_count_once) ... ok
test_unbudgeted_provider_health_is_null (tests.providers.test_llm_budget.GeminiBudget.test_unbudgeted_provider_health_is_null) ... {"request_id": "fb898c2f257f46aa857f0c8f5033f34e", "route": "/health", "status": 200, "latency_ms": 453.394}
ok
test_estimate_mode_never_has_geometry (tests.providers.test_phase3.ApiWithProviders.test_estimate_mode_never_has_geometry) ... {"request_id": "95a087e9397c4d779cdabe68b023b2ea", "route": "/v1/sessions", "status": 200, "latency_ms": 194.729}
{"request_id": "5ed26a12fd134bd0811ebfef566966d5", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 126.539}
ok
test_tour_legs_carry_provider_geometry_and_health_labels (tests.providers.test_phase3.ApiWithProviders.test_tour_legs_carry_provider_geometry_and_health_labels) ... {"request_id": "60bd3ce452d245979bba485d7e9757ff", "route": "/health", "status": 200, "latency_ms": 195.581}
{"request_id": "25045214eae34599bd16912c0784db31", "route": "/v1/sessions", "status": 200, "latency_ms": 3.194}
{"request_id": "dfa1e341802842a4a54f8359b498d125", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 340.775}
ok
test_adversarial_texts_fail (tests.providers.test_phase3.ExplanationChecker.test_adversarial_texts_fail) ... ok
test_truthful_text_passes (tests.providers.test_phase3.ExplanationChecker.test_truthful_text_passes) ... ok
test_facts_sent_to_llm_contain_no_venue_identity (tests.providers.test_phase3.ExplanationPrivacy.test_facts_sent_to_llm_contain_no_venue_identity) ... ok
test_retry_only_when_enough_time_remains (tests.providers.test_phase3.ExplanationTimeBudget.test_retry_only_when_enough_time_remains) ... ok
test_daily_budget_and_missing_key (tests.providers.test_phase3.GeminiFake.test_daily_budget_and_missing_key) ... ok
test_explainer_uses_checked_llm_text_or_template (tests.providers.test_phase3.GeminiFake.test_explainer_uses_checked_llm_text_or_template) ... ok
test_failures_map_to_kinds_and_fallback_is_labelled (tests.providers.test_phase3.GeminiFake.test_failures_map_to_kinds_and_fallback_is_labelled) ... ok
test_model_cannot_supply_coordinates_or_unknown_landmark (tests.providers.test_phase3.GeminiFake.test_model_cannot_supply_coordinates_or_unknown_landmark) ... ok
test_request_shape_and_key_header (tests.providers.test_phase3.GeminiFake.test_request_shape_and_key_header) ... ok
test_single_retry_only_for_transient_server_errors (tests.providers.test_phase3.GeminiFake.test_single_retry_only_for_transient_server_errors) ... ok
test_only_project_keys_and_no_override (tests.providers.test_phase3.LocalEnv.test_only_project_keys_and_no_override) ... ok
test_budget_and_no_key (tests.providers.test_phase3.ORSFake.test_budget_and_no_key) ... ok
test_matrix_prefetch_one_call_and_geometry_split (tests.providers.test_phase3.ORSFake.test_matrix_prefetch_one_call_and_geometry_split) ... ok
test_replace_uses_one_bounded_matrix (tests.providers.test_phase3.ORSFake.test_replace_uses_one_bounded_matrix) ... ok
test_unreachable_null_and_failures_are_unknown (tests.providers.test_phase3.ORSFake.test_unreachable_null_and_failures_are_unknown) ... ok
test_truthful_uncertainty_still_passes (tests.providers.test_phase3.OpeningClaimVariants.test_truthful_uncertainty_still_passes) ... ok
test_variants_rejected (tests.providers.test_phase3.OpeningClaimVariants.test_variants_rejected) ... ok
test_allowlist_rules (tests.providers.test_phase3.Transport.test_allowlist_rules) ... ok
test_refused_destination_opens_no_socket (tests.providers.test_phase3.Transport.test_refused_destination_opens_no_socket) ... ok
test_capacity_and_expired_rows_bound (tests.repositories.test_sessions.DurableSessions.test_capacity_and_expired_rows_bound) ... ok
test_corrupt_row_and_schema_fail_closed (tests.repositories.test_sessions.DurableSessions.test_corrupt_row_and_schema_fail_closed) ... ok
test_dataset_change_discards_tour_keeps_preferences (tests.repositories.test_sessions.DurableSessions.test_dataset_change_discards_tour_keeps_preferences) ... ok
test_env_selects_store_and_new_app_reads_database (tests.repositories.test_sessions.DurableSessions.test_env_selects_store_and_new_app_reads_database) ... {"request_id": "b6122b30d1974917a1d135d2189bb7d7", "route": "/v1/sessions", "status": 200, "latency_ms": 231.094}
{"request_id": "85242120101046c79f30e7922c0e7716", "route": "/v1/sessions/{session_id}/messages", "status": 200, "latency_ms": 203.146}
{"request_id": "a01f1e333e344d65bfbb688335824cc9", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms": 213.319}
ok
test_get_stale_or_missing_venue_returns_null_note_repeatedly (tests.repositories.test_sessions.DurableSessions.test_get_stale_or_missing_venue_returns_null_note_repeatedly) ... {"request_id": "e62d8e242cf5419dadee638083e1da8e", "route": "/v1/sessions/{session_id}", "status": 401, "latency_ms": 219.443}
{"request_id": "10708ab0955e4ebeb818cad1b3c6fa8c", "route": "/v1/sessions/{session_id}", "status": 403, "latency_ms": 12.857}
{"request_id": "b9aeed1926a542afb7cac09ea8bc1d53", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms": 22.53}
{"request_id": "cc135ee35b9541658b3a08b1f4d28d35", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms": 23.72}
{"request_id": "23f5df7e2fb34b5681fdf570152e63ac", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms": 23.144}
{"request_id": "a84bd046e4a74e8f9866d1aa532932af", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms": 21.822}
ok
test_isolation_and_expiry_survive_restart (tests.repositories.test_sessions.DurableSessions.test_isolation_and_expiry_survive_restart) ... ok
test_locked_and_corrupt_db_are_redacted_503 (tests.repositories.test_sessions.DurableSessions.test_locked_and_corrupt_db_are_redacted_503) ... {"request_id": "b29a356c30ba42efb92b8f5eb4f95792", "route": "/v1/sessions", "status": 503, "latency_ms": 474.546}
{"request_id": "0c24b0a8b2d34cc9b017a8bc9c2e642a", "route": "/v1/sessions", "status": 503, "latency_ms": 197.716}
ok
test_restart_rebuilds_exact_order_from_ids_without_private_payload (tests.repositories.test_sessions.DurableSessions.test_restart_rebuilds_exact_order_from_ids_without_private_payload) ... ok
test_transaction_rollback (tests.repositories.test_sessions.DurableSessions.test_transaction_rollback) ... ok
test_two_writers_have_one_atomic_conflict (tests.repositories.test_sessions.DurableSessions.test_two_writers_have_one_atomic_conflict) ... ok

----------------------------------------------------------------------
Ran 241 tests in 96.925s

OK (skipped=1)
```
