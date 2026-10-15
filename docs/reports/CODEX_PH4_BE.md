# PH4-BE — Google Routes, Geocoding and contract v1.5

Author: Codex. Reviewer: Claude. Date: 2026-10-15.

Implemented and ready for independent review. Full backend discovery passes: **201 tests, 1 documented expected skip**, exit 0; generated OpenAPI matches. Real Google validation remains unavailable: the public-landmark smoke exits 2 because no server key exists in this worktree's environment or ignored backend/.env, with zero calls.

## Scope and integration

Read AGENTS.md, project rules, docs/PHASE4.md, and contract v1.4/v1.5 before implementation. Merged `foodtour-claude-coordinator` (merge only), including `2d55dc1`, `ba136f1`, and current base `cd4df65`. Claude supplied the planner fields and origin-text contract addendum; no planner, LLM, frontend, or contract Markdown edits are part of this change.

The recorded Orca clarification approved token-only geocode authentication, HTTP 200 provider outcome wrappers, geocoding health shape, explicit null client-config keys when unavailable, conservative 25x25 matrix chunks, and rejection beyond 50 unique points.

- GoogleRoutesProvider implements prepare/leg/geometry with fixed URLs and field masks, directed legs, bounded LRU caches, per-call deadlines, process-local daily HTTP call budget, and a 30-second failed-matrix cooldown. Status errors and missing routes remain unknown; no straight-line substitution occurs inside a Google provider.
- Matrix chunks are at most 25 origins x 25 destinations (625 elements, 50 total waypoints). More than 50 unique input points is refused before network activity. Directions allows at most 27 total points (25 intermediates), without truncation.
- Tour responses include route_provider and route_warnings. Per-leg GeoJSON is converted from longitude/latitude to the existing latitude/longitude representation only for provider_route legs. Provider warnings pass through unchanged; the documented walking beta warning is used when no warning is supplied, including geometry failure. Estimated tours have no route provider, geometry, or route warnings.
- Geocoding uses a fixed Google endpoint, country VN restriction and Hanoi bounds bias, vi language, at most five validated results, bounded responses, deadlines, daily budget, and the existing session-token rate allowance. Missing token gives 401, invalid/expired token 403, rate exhaustion 429. Provider quota/unavailable/zero-results remain labelled HTTP 200 wrappers, as approved.
- Client-config exposes only the restricted browser key and map ID when both are configured; missing configuration returns explicit null values. Known server-secret reuse in either browser setting is rejected. Cache-Control is no-store. Health exposes configuration/error kinds only.
- Venue map results use the current versioned snapshot, bbox filtering, bounded limit (default 200, max 500), optional text filter, deterministic ID order, physical valid-geo records only, total_in_view/truncated, and an explicit field allowlist. No opening-hours or per-person price claims are added.
- Origin labels reject control/format/surrogate characters and length >120; origin sources use the contract enum. Existing SQLite preference JSON persists these fields and reads them after a new store instance without schema migration. Free-text origin resolution happens server-side only when geocoding is ready; unsuccessful resolution clears origin and returns a missing slot. Built-in landmarks make no geocoding request.

## Current official API documentation checked

Read before coding on 2026-10-15:

- [computeRouteMatrix](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRouteMatrix)
- [computeRoutes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes)
- [RouteTravelMode](https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteTravelMode)
- [Geocoding request/response documentation](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding)

Exact API requests and masks:

```text
POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix
X-Goog-FieldMask: originIndex,destinationIndex,status,condition,distanceMeters,duration
X-Goog-Api-Key: [server-side environment value, never logged]
travelMode: WALK

POST https://routes.googleapis.com/directions/v2:computeRoutes
X-Goog-FieldMask: routes.legs.polyline.geoJsonLinestring,routes.warnings
X-Goog-Api-Key: [server-side environment value, never logged]
travelMode: WALK
polylineEncoding: GEO_JSON_LINESTRING

GET https://maps.googleapis.com/maps/api/geocode/json
Parameters: address, key, components=country:VN,
            bounds=20.5,105.4|21.5,106.2, region=vn, language=vi
```

The fixed fallback warning is the RouteTravelMode documentation's beta warning. No field-mask wildcards, client-provided endpoints, redirects, proxies, credentials in URLs returned by this app, or vendor default guesses are used. Geocoding's official API requires its server key in the outgoing query; the transport neither logs that URL nor includes it in errors.

## Verification — commands actually run

Repository root, Windows PowerShell, existing .venv / Python 3.14.4. No dependency installation or upgrades. Synthetic venues and literal 127.0.0.1 threaded HTTP fakes only in tests.

```powershell
$env:PYTHONPATH='backend'
./.venv/Scripts/python.exe -m unittest backend.tests.providers.test_google_maps -q
```

Actual focused output after cooldown addition:

```text
----------------------------------------------------------------------
Ran 11 tests in 1.326s

OK
```

The API focused run before the additional secret-reflection test also passed (10 tests in 1.071s). Final full discovery below includes all 22 new provider/API tests, including that additional reflection test.

```powershell
./.venv/Scripts/python.exe tools/export_openapi.py
./.venv/Scripts/python.exe scripts/run_unittests.py *> $env:TEMP/foodtour-ph4-unittest-final.txt
$testResult=$LASTEXITCODE
Get-Content $env:TEMP/foodtour-ph4-unittest-final.txt -Tail 5
Write-Output "UNITTEST_EXIT=$testResult"
./.venv/Scripts/python.exe tools/export_openapi.py --check
```

Actual final output:

```text
Exported contracts/v1/openapi.json

----------------------------------------------------------------------
Ran 201 tests in 12.711s

OK (skipped=1)
UNITTEST_EXIT=0
OpenAPI matches server schema
```

The expected skip is legacy `test_planner.PlannerTests.test_budget_and_source`: absent private data/venues.json; its Foody source assertions cannot be exercised by synthetic fixtures. All discovered planner, LLM, data, provider, API, repository, and other legacy tests ran. Existing Starlette/httpx TestClient deprecation warning remains; dependencies were unchanged. Full runner transcript is preserved below (PowerShell wrapping retained; trailing whitespace removed).

```powershell
./.venv/Scripts/python.exe qa/live/google_smoke.py
Write-Output "SMOKE_EXIT=$LASTEXITCODE"
```

Actual output:

```json
{"status": "unavailable", "reason": "server_key_absent", "calls": 0}
```

```text
SMOKE_EXIT=2
```

The smoke script, when explicitly supplied a server key, sends only three hardcoded PUBLIC Hanoi landmarks to Routes and one public landmark to Geocoding, and prints aggregate counts/error kinds only. It was not run with credentials here.

New tests cover: exact masks/WALK headers and duration conversion; four chunks for 50 points and rejection of 51; non-OK status/ROUTE_NOT_FOUND/malformed values; 429/500/malformed/oversize/timeout; daily budget zero/exhaustion; cache bounds; failed-batch retry cooldown/recovery; GeoJSON coordinate order and leg count; verbatim and fallback warnings; fixed-country/bounds geocoding with <=5 results; encoded secret reflection; refused external endpoint override; unavailable Google factory without opening transport; map limits/bbox/truncated/provenance/allowlist; client-config nulls and restricted-browser-only exposure; health; geocode ownership/expiry/rate limit; no server key, session token or query sentinel in captured responses/access logs; origin-text success/failure/local-landmark semantics; origin validation and SQLite restart persistence.

## Security review and limitations

- Existing CORS, security headers, access-log allowlist, constant-time token comparisons and error envelopes are retained. Token-only geocode authentication compares SHA-256 digests with secrets.compare_digest, without exposing a session ID. Query text, request bodies, coordinates, and server keys are absent from access telemetry.
- Google official hosts are registered by their adapters only when explicitly selected by composition. Runtime endpoints are fixed; test injection accepts literal loopback only, even if another external host has been allowlisted. A URL-looking geocode query remains an encoded address parameter and is never fetched as a URL.
- Response size limits: Routes 2 MiB, Geocoding 128 KiB; timeouts default to 10s/8s respectively. No automatic HTTP retries. Each matrix chunk and directions call consumes one routing budget unit. This is a local call-count budget, **not a billing-cost cap**: matrix billing may count elements. Budgets/caches/rate counters are process-local, reset on restart, and not a distributed quota or Google Cloud billing control.
- Up to four matrix calls can occur in prepare(50 points); deadlines are per HTTP call. Successful ROUTE_NOT_FOUND/unknown matrix cells remain cached until LRU eviction or process restart. Transient whole-batch failures recover after the short cooldown.
- Ready means configured, not proof of provider reachability, billing/API enablement, key restriction correctness, live walking quality, or geocoding accuracy. Hanoi bounds are a documented bias, not a geographic guarantee. A geocoded origin is editable and labelled; it is not verified venue evidence.
- No live Google calls, account/billing actions, browser Maps UI validation, or private-data audits were performed in this task. Real walking times/geometry/warnings and key restrictions still require the authorized live smoke and independent frontend integration review once credentials exist.
- No new dependencies. No private dataset, real credentials, personal origin, or chat content is included in the changes or this report. Public landmark coordinates occur only in the opt-in smoke script.

## Full backend runner transcript

<details>
<summary>Actual output of the final full discovery command (includes allowlisted access telemetry)</summary>

```text
./.venv/Scripts/python.exe : C:\Users\tuana\orca\workspaces\ai-foodtour-planner\foodtour-codex-backend\.venv\Lib\site-p
ackages\fastapi\testclient.py:1: StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated;
install `httpx2` instead.
At line:30 char:1
+ ./.venv/Scripts/python.exe scripts/run_unittests.py *> $env:TEMP/food ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (C:\Users\tuana\...ttpx2` instead.:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError

  from starlette.testclient import TestClient as TestClient  # noqa
EXPECTED-SKIP: legacy data/venues.json absent; this source-specific test requires private Foody rows and URLs, not the synthetic Venue fixture. [test_planner.PlannerTests.test_budget_and_source]
test_budget_and_source (test_planner.PlannerTests.test_budget_and_source) ... skipped 'EXPECTED-SKIP: legacy
data/venues.json absent; this source-specific test requires private Foody rows and URLs, not the synthetic Venue
fixture.'
test_no_match (test_planner.PlannerTests.test_no_match) ... ok
test_strict_refuses_unknown (test_planner.PlannerTests.test_strict_refuses_unknown) ... ok
test_unknown_price_never_free (test_planner.PlannerTests.test_unknown_price_never_free) ... ok
test_validation (test_planner.PlannerTests.test_validation) ... {"request_id": "8be704d9ea7d4cbfbd42b502251b4f0e",
"route": "/v1/plans", "status": 422, "latency_ms": 25.16}
{"request_id": "97189343ad6643f08f398cbf1887d7c5", "route": "/v1/plans", "status": 200, "latency_ms": 0.872}
ok
test_bounded_search_assumptions_are_exposed (tests.api.test_api.APITests.test_bounded_search_assumptions_are_exposed)
... {"request_id": "d23cb721dd53462e8e146d1c8d367c81", "route": "/v1/sessions", "status": 200, "latency_ms": 26.494}
{"request_id": "10a27921a7704aa1bf8568714a06fee4", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 20.32}
ok
test_concurrent_same_revision_exactly_one_commit
(tests.api.test_api.APITests.test_concurrent_same_revision_exactly_one_commit) ... {"request_id":
"7b8fef835bed477e81f8181f739929c0", "route": "/v1/sessions", "status": 200, "latency_ms": 24.774}
{"request_id": "dbe84402fbab498a9ee45ee6e6c6f22e", "route": "/v1/sessions/{session_id}/preferences", "status": 409,
"latency_ms": 1.283}
{"request_id": "d87da15b88dc48de8a4e7855db05569b", "route": "/v1/sessions/{session_id}/preferences", "status": 200,
"latency_ms": 2.575}
ok
test_cors_allows_revision_and_token_header (tests.api.test_api.APITests.test_cors_allows_revision_and_token_header)
... {"request_id": "5c9bf1e0e9bb499395a119774172e9c7", "route": "<unmatched>", "status": 200, "latency_ms": 0.06}
ok
test_cross_midnight_has_no_invalid_clock_and_guard_is_atomic
(tests.api.test_api.APITests.test_cross_midnight_has_no_invalid_clock_and_guard_is_atomic) ... {"request_id":
"7d117cfc137d45eebd747c3aaaabbeb4", "route": "/v1/sessions", "status": 200, "latency_ms": 23.129}
{"request_id": "63477b4527b7423d917af189b8d5e0d4", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 17.969}
{"request_id": "05914c3520784ca7b524b5798832aac0", "route": "/v1/sessions/{session_id}/preferences", "status": 200,
"latency_ms": 2.121}
{"request_id": "3055ad1c9e484c52b5195b733ecc22f7", "route": "/v1/sessions/{session_id}/tour", "status": 200,
"latency_ms": 2.015}
{"request_id": "4578e3f788c64b458b64f8e4de5490f8", "route": "/v1/sessions", "status": 200, "latency_ms": 0.595}
{"request_id": "47bb937dde9d422fbb3327f778d8a300", "route": "/v1/sessions/{session_id}/messages", "status": 422,
"latency_ms": 15.585}
ok
test_expired_tombstones_are_bounded (tests.api.test_api.APITests.test_expired_tombstones_are_bounded) ...
{"request_id": "3801289c01a0449d9631dd282e96cb95", "route": "/v1/sessions", "status": 200, "latency_ms": 24.719}
{"request_id": "9d2efa2ca2c24e3abf8f09177d0c35c5", "route": "/v1/sessions", "status": 200, "latency_ms": 0.59}
{"request_id": "883f1b17b5c24b07969fc3760607aab6", "route": "/v1/sessions", "status": 200, "latency_ms": 0.552}
{"request_id": "e59fd401e5c14fe4b912ac46ef99a6c8", "route": "/v1/sessions", "status": 200, "latency_ms": 0.521}
{"request_id": "ea04bdd1ca004f8e9d3d2efde4dcd48c", "route": "/v1/sessions", "status": 200, "latency_ms": 0.605}
{"request_id": "bda46584f0094785b1fb68a1b0fd0ff1", "route": "/v1/sessions", "status": 200, "latency_ms": 0.565}
{"request_id": "ffd14cd168ce4549933e3aefedd9e22b", "route": "/v1/sessions", "status": 200, "latency_ms": 0.601}
ok
test_expiry_and_wrong_token_does_not_disclose_expiry
(tests.api.test_api.APITests.test_expiry_and_wrong_token_does_not_disclose_expiry) ... {"request_id":
"dd6ae260eac548d2b54d60ea2dfd079d", "route": "/v1/sessions", "status": 200, "latency_ms": 27.252}
{"request_id": "2b7f1bd64bba4db88045b8cb2b7418d0", "route": "/v1/sessions/{session_id}/tour", "status": 403,
"latency_ms": 1.651}
{"request_id": "1471e400ea074118abffe1899462b668", "route": "/v1/sessions/{session_id}/tour", "status": 410,
"latency_ms": 0.875}
ok
test_fail_closed_tampered_planner_result_and_no_commit
(tests.api.test_api.APITests.test_fail_closed_tampered_planner_result_and_no_commit) ... {"request_id":
"ae2e73fc44aa4bf09b1afea0555cea0d", "route": "/v1/sessions", "status": 200, "latency_ms": 24.149}
{"request_id": "3585947ba0404f80a8049f7eabfd71ad", "route": "/v1/sessions/{session_id}/messages", "status": 500,
"latency_ms": 15.483}
ok
test_health_detail_labels_and_repository_version_cache
(tests.api.test_api.APITests.test_health_detail_labels_and_repository_version_cache) ... {"request_id":
"aa2dfbd44f4449b9a2b488271f5fc7be", "route": "/health", "status": 200, "latency_ms": 32.07}
{"request_id": "d7bfa307ff0f40f7a01444d5878b7864", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.625}
{"request_id": "673dbb49187e4675894a23ce3213fb0b", "route": "/v1/venues/{venue_id}", "status": 404, "latency_ms":
1.057}
ok
test_legacy_exports_and_response_unchanged (tests.api.test_api.APITests.test_legacy_exports_and_response_unchanged)
... {"request_id": "bd023580b05d4c6c8f2bb73463c0874d", "route": "/v1/plans", "status": 200, "latency_ms": 27.913}
{"request_id": "5b02b07830f44fe1876a911ffbbf100a", "route": "/v1/plans", "status": 200, "latency_ms": 0.659}
{"request_id": "c751da855f5f4fde85b2f892404a0881", "route": "/v1/plans", "status": 422, "latency_ms": 0.252}
ok
test_malformed_snapshot_is_service_error_not_empty_success
(tests.api.test_api.APITests.test_malformed_snapshot_is_service_error_not_empty_success) ... {"request_id":
"677f1d9df3224d81b8cef32fe05a223c", "route": "/health", "status": 503, "latency_ms": 24.796}
ok
test_missing_slots_then_message_tour_and_followup_retention
(tests.api.test_api.APITests.test_missing_slots_then_message_tour_and_followup_retention) ... {"request_id":
"483f8520c24c4fbe9d70a85dcadbe130", "route": "/v1/sessions", "status": 200, "latency_ms": 24.648}
{"request_id": "7f12f192a0ea451ab516136b25eb97b5", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 1.878}
{"request_id": "d06d14f572484aae828d48a5628b394b", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 15.95}
{"request_id": "5bdecb63891647dd8f4a862e79b442dc", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 17.466}
{"request_id": "056174c772ba4ea8b6e0c2cd77426370", "route": "/v1/sessions/{session_id}/tour", "status": 200,
"latency_ms": 15.635}
ok
test_preferences_clear_old_tour_revision_and_strict
(tests.api.test_api.APITests.test_preferences_clear_old_tour_revision_and_strict) ... {"request_id":
"7b8f64239f1c45c7942a608765ded40d", "route": "/v1/sessions", "status": 200, "latency_ms": 23.422}
{"request_id": "134f8d0ad4a9416cb27efb3504d2d15d", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 15.507}
{"request_id": "e288b9cc2269431ab2c69614fefcb080", "route": "/v1/sessions/{session_id}/preferences", "status": 200,
"latency_ms": 1.51}
{"request_id": "d59f1dc1dc28418a9b70b36f538a3382", "route": "/v1/sessions/{session_id}/preferences", "status": 409,
"latency_ms": 0.661}
{"request_id": "883ce320e96a4561b86ff9ae3fa2f0f3", "route": "/v1/sessions/{session_id}/tour", "status": 200,
"latency_ms": 14.731}
ok
test_prompt_injection_cannot_change_mode_or_budget
(tests.api.test_api.APITests.test_prompt_injection_cannot_change_mode_or_budget) ... {"request_id":
"52fe9ae7c5f848b7880a0d2d76d13f3b", "route": "/v1/sessions", "status": 200, "latency_ms": 24.974}
{"request_id": "62dd3bda32fc41be9b3c52ff6a14f154", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 15.847}
{"request_id": "6f503fa0dcd54d00916bf237749b445d", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 15.194}
ok
test_rate_limit_resets_and_bounded_session_capacity
(tests.api.test_api.APITests.test_rate_limit_resets_and_bounded_session_capacity) ... {"request_id":
"7478157391e8440581026643609da8d9", "route": "/v1/sessions", "status": 200, "latency_ms": 22.13}
{"request_id": "61caa0b1f9ec42c8acc3ccb10954d4e0", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 1.691}
{"request_id": "c9348fa3a4764037aa42291e66eb379f", "route": "/v1/sessions/{session_id}/messages", "status": 429,
"latency_ms": 0.691}
{"request_id": "e49581ec3fd344bd95a33c28d2adadbc", "route": "/v1/sessions/{session_id}/messages", "status": 429,
"latency_ms": 0.608}
{"request_id": "c14e3ec2e7c84314aebbe65520404042", "route": "/v1/sessions/{session_id}/messages", "status": 410,
"latency_ms": 0.559}
{"request_id": "aa1f39bc90464a4ea60f872d627490ff", "route": "/v1/sessions", "status": 200, "latency_ms": 0.6}
{"request_id": "65b1a420e8b8401397107f2c4eb08fc2", "route": "/v1/sessions", "status": 429, "latency_ms": 0.433}
ok
test_rate_window_recovery_before_ttl (tests.api.test_api.APITests.test_rate_window_recovery_before_ttl) ...
{"request_id": "dc1f06e783fd4edab1988a534a0d9f82", "route": "/v1/sessions", "status": 200, "latency_ms": 26.731}
{"request_id": "d474627567954e319447ef344c6f7431", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 1.715}
{"request_id": "6403ec6063e84561a29c836c1b011c12", "route": "/v1/sessions/{session_id}/messages", "status": 429,
"latency_ms": 0.62}
{"request_id": "eef19679b586439fa0916452a608b8fa", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 1.604}
ok
test_rejected_extracted_constraints_do_not_replan_with_old_values
(tests.api.test_api.APITests.test_rejected_extracted_constraints_do_not_replan_with_old_values) ... {"request_id":
"5ab5c2545ba1432e9b463b29c0f044b4", "route": "/v1/sessions", "status": 200, "latency_ms": 25.869}
{"request_id": "3b35aae1045c41c18bc4ddfd999ed7a3", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 16.405}
{"request_id": "22f48c9de6584acfb6eab63a0b9415b8", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 2.518}
ok
test_replace_lock_claim_is_checked_before_commit
(tests.api.test_api.APITests.test_replace_lock_claim_is_checked_before_commit) ... {"request_id":
"baf938b1586d41f690bb5e7fc556e4bb", "route": "/v1/sessions", "status": 200, "latency_ms": 25.119}
{"request_id": "44cd0c084a6b44c7a09b40860cdccf9e", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 15.817}
{"request_id": "f776aaf0dd104e3c932db153f5b0eed6", "route": "/v1/sessions/{session_id}/tour/replace", "status": 500,
"latency_ms": 2.508}
ok
test_replace_preserves_other_stops_and_stale_conflicts
(tests.api.test_api.APITests.test_replace_preserves_other_stops_and_stale_conflicts) ... {"request_id":
"2c59784379fe4b34b7b1ae89b4511de8", "route": "/v1/sessions", "status": 200, "latency_ms": 23.529}
{"request_id": "a8cf114932f04da8abf50acc9fd00935", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 15.486}
{"request_id": "c8df82f5c25941fea6ee52a9ed9a6801", "route": "/v1/sessions/{session_id}/tour/replace", "status": 200,
"latency_ms": 1.317}
{"request_id": "32887071b5d24aecb97399a457a4f4e1", "route": "/v1/sessions/{session_id}/tour/replace", "status": 409,
"latency_ms": 0.689}
{"request_id": "0a4aab1a65ca4029a815a2d01e1d49aa", "route": "/v1/sessions/{session_id}/tour/replace", "status": 409,
"latency_ms": 0.705}
ok
test_session_tokens_hashed_and_cross_session_isolated
(tests.api.test_api.APITests.test_session_tokens_hashed_and_cross_session_isolated) ... {"request_id":
"4b5707a1d96746efb651ca0b8110f233", "route": "/v1/sessions", "status": 200, "latency_ms": 24.079}
{"request_id": "6f3b8e7465444533836cb6bae8715d50", "route": "/v1/sessions", "status": 200, "latency_ms": 0.712}
{"request_id": "96475ca077d14c44b52fb8166e661ed3", "route": "/v1/sessions/{session_id}/tour", "status": 401,
"latency_ms": 0.722}
{"request_id": "f3f034701ba044669f521c6491b26d6e", "route": "/v1/sessions/{session_id}/tour", "status": 403,
"latency_ms": 0.66}
ok
test_snapshot_versions_change_and_replace_stays_pinned
(tests.api.test_api.APITests.test_snapshot_versions_change_and_replace_stays_pinned) ... {"request_id":
"695ec14e6bd24b8e97d3be90d61e6560", "route": "/v1/sessions", "status": 200, "latency_ms": 22.491}
{"request_id": "fb1b3b57020f4925af8e25a717d4697f", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 16.884}
{"request_id": "df00fe90c92d4ae0a1f649b54642b85a", "route": "/health", "status": 200, "latency_ms": 0.922}
{"request_id": "2b46c3f30c724be28fbe13086decdea3", "route": "/v1/sessions/{session_id}/tour/replace", "status": 200,
"latency_ms": 1.174}
ok
test_unavailable_llm_health_and_no_session_mutation
(tests.api.test_api.APITests.test_unavailable_llm_health_and_no_session_mutation) ... {"request_id":
"42c219a6817f4f37babbb3702c29c423", "route": "/health", "status": 200, "latency_ms": 26.919}
{"request_id": "1ad39ff6477342c8bfbdfe371881ebe0", "route": "/v1/sessions", "status": 200, "latency_ms": 0.408}
{"request_id": "751caa4188d2474c89c5559bdfa5b879", "route": "/v1/sessions/{session_id}/messages", "status": 503,
"latency_ms": 0.464}
ok
test_untrusted_extractor_output_is_validated
(tests.api.test_api.APITests.test_untrusted_extractor_output_is_validated) ... {"request_id":
"d1fae8718de64a0690d7fb3ea4affe08", "route": "/v1/sessions", "status": 200, "latency_ms": 25.188}
{"request_id": "f7ee5fab27f64246b5d8e216b621b993", "route": "/v1/sessions/{session_id}/messages", "status": 422,
"latency_ms": 0.745}
ok
test_validation_envelope_redacts_private_input
(tests.api.test_api.APITests.test_validation_envelope_redacts_private_input) ... {"request_id":
"8b0c7e8d8fd349979f76bbb3a6569381", "route": "/v1/sessions", "status": 200, "latency_ms": 24.694}
{"request_id": "0e3691e642374b4d82c1ce10cf6fbcdf", "route": "/v1/sessions/{session_id}/messages", "status": 422,
"latency_ms": 0.335}
{"request_id": "bfebcdf1f50545f697e0befe43d90291", "route": "/v1/sessions/{session_id}/preferences", "status": 422,
"latency_ms": 0.335}
{"request_id": "e09f10accc34495bb62d757d18741e10", "route": "/v1/sessions/{session_id}/preferences", "status": 422,
"latency_ms": 0.313}
{"request_id": "7749612e7e1e4421a803f8e9588a5ce4", "route": "/v1/sessions/{session_id}/preferences", "status": 422,
"latency_ms": 0.297}
{"request_id": "6df1a2f779284d94b04e7cb284ef368c", "route": "/v1/sessions/{session_id}/preferences", "status": 422,
"latency_ms": 0.278}
{"request_id": "932bf0bde80c46e499ef29a923c28e2e", "route": "/v1/sessions/{session_id}/preferences", "status": 422,
"latency_ms": 0.258}
{"request_id": "73490706137c4cb2a0075d5a65f20612", "route": "/v1/sessions/{session_id}/preferences", "status": 422,
"latency_ms": 0.257}
{"request_id": "56aebccc0770492b8573c69ff3f3c06d", "route": "/v1/sessions/{session_id}/preferences", "status": 422,
"latency_ms": 0.292}
{"request_id": "a4e458af141a4f0a93ab0f1aa5dfcfbe", "route": "/v1/sessions/{session_id}/preferences", "status": 422,
"latency_ms": 0.272}
ok
test_generated_openapi_matches_versioned_export
(tests.api.test_api.OpenAPIDriftTests.test_generated_openapi_matches_versioned_export) ... ok
test_configured_invalid_overlay_is_redacted_503_never_cached_success
(tests.api.test_evidence.EvidenceAPI.test_configured_invalid_overlay_is_redacted_503_never_cached_success) ...
{"request_id": "0aea4d2e61bf4990a18baccf47216217", "route": "/health", "status": 200, "latency_ms": 24.642}
{"request_id": "4f25ed6ad8564be69d6feeefd9fa8aca", "route": "/health", "status": 503, "latency_ms": 1.44}
{"request_id": "54e161586fbf4c0d843e277090324923", "route": "/v1/venues", "status": 503, "latency_ms": 1.4}
{"request_id": "818d6a59751e41669a8419e8782c9c06", "route": "/v1/venues/{venue_id}", "status": 503, "latency_ms":
1.067}
ok
test_default_estimate_stays_conditional_even_with_complete_overlay
(tests.api.test_evidence.EvidenceAPI.test_default_estimate_stays_conditional_even_with_complete_overlay) ...
{"request_id": "183fe60aa89947759cfdf6eaae330cd2", "route": "/v1/sessions", "status": 200, "latency_ms": 40.679}
{"request_id": "985d6492f9594ca1aee09f54b538b472", "route": "/v1/sessions/{session_id}/preferences", "status": 200,
"latency_ms": 4.135}
{"request_id": "6234e5f279834063b61dee189ae4f94c", "route": "/v1/sessions/{session_id}/tour", "status": 200,
"latency_ms": 19.279}
ok
test_in_memory_replace_cannot_reuse_stale_or_removed_verified_overlay
(tests.api.test_evidence.EvidenceAPI.test_in_memory_replace_cannot_reuse_stale_or_removed_verified_overlay) ...
{"request_id": "1a360c5d836046469d58d1a71273652d", "route": "/v1/sessions", "status": 200, "latency_ms": 26.464}
{"request_id": "8e90369b4ff84aeb9fa28adde4163027", "route": "/v1/sessions/{session_id}/preferences", "status": 200,
"latency_ms": 1.792}
{"request_id": "25ba19ee4c3543a68c5624cee5e8069f", "route": "/v1/sessions/{session_id}/tour", "status": 200,
"latency_ms": 71.36}
{"request_id": "eec366a8d7c443c4b1a6631591a50148", "route": "/v1/sessions/{session_id}/tour/replace", "status": 503,
"latency_ms": 1.486}
{"request_id": "4e2aeadba4e548a7921177d58d526672", "route": "/v1/sessions/{session_id}/tour/replace", "status": 409,
"latency_ms": 1.511}
{"request_id": "68c1af53de0a4f60add45c7c25422fcc", "route": "/v1/sessions/{session_id}/tour/replace", "status": 409,
"latency_ms": 1.014}
ok
test_overlay_version_change_invalidates_persistent_tour_on_read
(tests.api.test_evidence.EvidenceAPI.test_overlay_version_change_invalidates_persistent_tour_on_read) ...
{"request_id": "3660a8be5bd9469ab4b2de71af9bdbea", "route": "/v1/sessions", "status": 200, "latency_ms": 37.586}
{"request_id": "c55004cbb69747cf9fa6005de1f00553", "route": "/v1/sessions/{session_id}/preferences", "status": 200,
"latency_ms": 9.109}
{"request_id": "bf9628e93084453c8e3ef8d56eb04426", "route": "/v1/sessions/{session_id}/tour", "status": 200,
"latency_ms": 57.151}
{"request_id": "476ac93bcfd8483da08a8b77dd966b19", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms":
4.749}
{"request_id": "9b98f5fd759e4f018bb2148cbcd38545", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms":
4.848}
ok
test_strict_overlay_and_local_osrm_fake_are_verified_end_to_end
(tests.api.test_evidence.EvidenceAPI.test_strict_overlay_and_local_osrm_fake_are_verified_end_to_end) ...
{"request_id": "09b5fe3b9ff64919b030df2e48644e98", "route": "/v1/sessions", "status": 200, "latency_ms": 28.361}
{"request_id": "267836a4e33e402691956a7866223a81", "route": "/v1/sessions/{session_id}/preferences", "status": 200,
"latency_ms": 2.144}
{"request_id": "409181081f88483fb3a79916a1aae993", "route": "/v1/sessions/{session_id}/tour", "status": 200,
"latency_ms": 74.022}
{"request_id": "58d5b86d9a6b464d9fbae2e428f4a44d", "route": "/health", "status": 200, "latency_ms": 1.616}
{"request_id": "2bfa2335486a43ada623a54b8a935f6c", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.515}
{"request_id": "fbfdc7f3ce4f4ca8b38a4b0167ca2c05", "route": "/v1/venues", "status": 200, "latency_ms": 1.758}
ok
test_api_geocode_quota_validation_and_no_key_in_logs_responses
(tests.api.test_google_maps.GoogleAPI.test_api_geocode_quota_validation_and_no_key_in_logs_responses) ...
{"request_id": "246ac2d1b50d4a369711c0a146eccf97", "route": "/v1/sessions", "status": 200, "latency_ms": 25.843}
ok
test_config_unavailable_null_keys_and_ready_browser_key_only
(tests.api.test_google_maps.GoogleAPI.test_config_unavailable_null_keys_and_ready_browser_key_only) ... {"request_id":
"9e74670fc221479caead8437315dc76d", "route": "/v1/client-config", "status": 200, "latency_ms": 25.406}
{"request_id": "f94735ea1f5940c484954eab02b0d442", "route": "/v1/client-config", "status": 200, "latency_ms": 2.341}
{"request_id": "a94ba6ea13b841e08c2fe7d094a7d48f", "route": "/v1/client-config", "status": 200, "latency_ms": 1.068}
ok
test_factory_google_unconfigured_no_network
(tests.api.test_google_maps.GoogleAPI.test_factory_google_unconfigured_no_network) ... {"request_id":
"4b709ef191f74194b8b09d472cf6e69e", "route": "/health", "status": 200, "latency_ms": 24.166}
{"request_id": "8671d75e75824fbcad2d84d779d9dcae", "route": "/health", "status": 200, "latency_ms": 2.065}
{"request_id": "772246587a954493b4c738e388dc2f8f", "route": "/v1/client-config", "status": 200, "latency_ms": 0.572}
ok
test_geocode_auth_expiry_rate_and_unavailable
(tests.api.test_google_maps.GoogleAPI.test_geocode_auth_expiry_rate_and_unavailable) ... {"request_id":
"e22c431872b443c3bd3546bb5ce68d19", "route": "/v1/geocode", "status": 401, "latency_ms": 26.461}
{"request_id": "173f078e1c0146f2b6e9e4fd38d91919", "route": "/v1/geocode", "status": 403, "latency_ms": 1.117}
{"request_id": "44e5ae928982410cb79ef9ac99d6117d", "route": "/v1/sessions", "status": 200, "latency_ms": 1.47}
{"request_id": "967c443d0e3d493bac6398ead2ad3c5e", "route": "/v1/geocode", "status": 200, "latency_ms": 37.536}
{"request_id": "809d518756b04173b02653b2346054f4", "route": "/v1/geocode", "status": 429, "latency_ms": 0.66}
{"request_id": "a72bff7e929a4557ad7003204bcd4863", "route": "/v1/geocode", "status": 403, "latency_ms": 1.022}
{"request_id": "89ebed0b552d4703b21011c8278fdad7", "route": "/v1/sessions", "status": 200, "latency_ms": 1.778}
{"request_id": "65e25099b5b04c39a1fd0b078c96add4", "route": "/v1/geocode", "status": 200, "latency_ms": 0.926}
ok
test_health_routing_and_geocoding_no_secrets
(tests.api.test_google_maps.GoogleAPI.test_health_routing_and_geocoding_no_secrets) ... {"request_id":
"3ce69a4372ba4843a7e7e87d2a3b109d", "route": "/health", "status": 200, "latency_ms": 26.011}
{"request_id": "923e3539deff472199d2f75191383eb7", "route": "/health", "status": 200, "latency_ms": 1.201}
ok
test_landmark_does_not_call_geocoder (tests.api.test_google_maps.GoogleAPI.test_landmark_does_not_call_geocoder) ...
{"request_id": "509d808ab2254f66910e8fcb115beaa5", "route": "/v1/sessions", "status": 200, "latency_ms": 29.469}
{"request_id": "475e15bcdfd8418199de8f84241e03cd", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 97.729}
ok
test_map_bbox_limit_truncated_q_allowlist_and_bounds
(tests.api.test_google_maps.GoogleAPI.test_map_bbox_limit_truncated_q_allowlist_and_bounds) ... {"request_id":
"379fe26de0ab429ea6e5b6b037f6bd78", "route": "/v1/venues/map", "status": 200, "latency_ms": 39.815}
{"request_id": "c3d8b6f747fa4ab8a806c2cf484cb452", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.303}
{"request_id": "e577f34c66de4c449ad1489c855eba71", "route": "/v1/venues/map", "status": 200, "latency_ms": 1.235}
{"request_id": "8b7cdb28598c4d7d9bb2a2be0557f74a", "route": "/v1/venues/map", "status": 200, "latency_ms": 2.147}
{"request_id": "7465a967b16443e78d77d217b36bbce8", "route": "/v1/venues/map", "status": 422, "latency_ms": 0.58}
{"request_id": "4894347acef84807bed783240b0ece0a", "route": "/v1/venues/map", "status": 422, "latency_ms": 0.314}
{"request_id": "fb6327a31c7f4ca0b786e79670089c68", "route": "/v1/venues/map", "status": 422, "latency_ms": 0.572}
{"request_id": "5e1a40035eae4132a4d0161f5838105b", "route": "/v1/venues/map", "status": 422, "latency_ms": 0.223}
ok
test_origin_text_resolves_and_unavailable_remains_missing
(tests.api.test_google_maps.GoogleAPI.test_origin_text_resolves_and_unavailable_remains_missing) ... {"request_id":
"50f0e09c7b6142bc9ae735ae254555c5", "route": "/v1/sessions", "status": 200, "latency_ms": 26.146}
{"request_id": "1719a5c784e24fddad47eed7d03ae929", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 117.582}
{"request_id": "b7df546e116a4024a1f09ff5f1b0ddc5", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 34.121}
{"request_id": "99a6c0cbd07044e5b34a6def9ba53ae9", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 45.338}
{"request_id": "154463ebccef44f6b351c95aa8231e81", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 43.222}
{"request_id": "205d3a7ff4984c2cb87efd11600b9eab", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 2.816}
ok
test_origin_validation_and_sqlite_restart
(tests.api.test_google_maps.GoogleAPI.test_origin_validation_and_sqlite_restart) ... {"request_id":
"fbd7219ff6444b65b82bf31815474de9", "route": "/v1/sessions", "status": 200, "latency_ms": 47.735}
{"request_id": "8fdd26a93af04f098f82d8fcf207ac51", "route": "/v1/sessions/{session_id}/preferences", "status": 422,
"latency_ms": 0.407}
{"request_id": "b95b20e3f643435faca2b39ff1db341b", "route": "/v1/sessions/{session_id}/preferences", "status": 422,
"latency_ms": 0.358}
{"request_id": "39a0412dff404f4490acd083a1a2b1d9", "route": "/v1/sessions/{session_id}/preferences", "status": 422,
"latency_ms": 0.328}
{"request_id": "d3155c251138432589a6c62508006c64", "route": "/v1/sessions/{session_id}/preferences", "status": 422,
"latency_ms": 0.315}
{"request_id": "0f8ce026dc624819ab812e269bc4ce34", "route": "/v1/sessions/{session_id}/preferences", "status": 200,
"latency_ms": 6.909}
{"request_id": "4313a2e0d7c7495ca49b827eba03b7c2", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms":
2.821}
{"request_id": "bbad3bf725d04b70abb0c42441b7fa12", "route": "/v1/geocode", "status": 200, "latency_ms": 32.265}
{"request_id": "eee62efa2c1144229ebf828306169a67", "route": "/v1/geocode", "status": 403, "latency_ms": 2.542}
ok
test_provider_tour_geometry_warnings_and_estimate_empty
(tests.api.test_google_maps.GoogleAPI.test_provider_tour_geometry_warnings_and_estimate_empty) ... {"request_id":
"87972d6d8dda429aa63cf2ea20c4c817", "route": "/v1/sessions", "status": 200, "latency_ms": 22.767}
{"request_id": "9bfdb156645543008887df69e4f5c468", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 68.48}
{"request_id": "44d48ad2df3a4ea0aac7df65338afb76", "route": "/v1/sessions/{session_id}/tour", "status": 200,
"latency_ms": 15.836}
ok
test_reflected_secret_cannot_reach_geocode_response
(tests.api.test_google_maps.GoogleAPI.test_reflected_secret_cannot_reach_geocode_response) ... {"request_id":
"5177ea658eba480d8d5a158ecb5d6a9c", "route": "/v1/sessions", "status": 200, "latency_ms": 26.721}
{"request_id": "1248086d9ecd45f78355e21b1abbb34a", "route": "/v1/geocode", "status": 200, "latency_ms": 39.376}
ok
test_blank_data_and_database_environment_are_unset
(tests.api.test_security.SecurityTests.test_blank_data_and_database_environment_are_unset) ... {"request_id":
"d8ea12b68d8e408a94c84a53ac2d4a1e", "route": "/health", "status": 200, "latency_ms": 34.273}
{"request_id": "ced1e6d6fd0d4972a57ee5550aa47642", "route": "/health", "status": 200, "latency_ms": 22.531}
ok
test_cors_comma_separated_origins_for_localhost_and_loopback
(tests.api.test_security.SecurityTests.test_cors_comma_separated_origins_for_localhost_and_loopback) ...
{"request_id": "a45df775a3364fcc92b736266f60e3c7", "route": "/health", "status": 200, "latency_ms": 26.137}
{"request_id": "e7b30a7dcbae495b94652bdf67fd8815", "route": "<unmatched>", "status": 413, "latency_ms": 0.087}
{"request_id": "b9f81f3add9d4346b9ce23cbe9e4bc05", "route": "/health", "status": 200, "latency_ms": 1.293}
{"request_id": "0aad3edcd8e64763808b961ad1804915", "route": "<unmatched>", "status": 413, "latency_ms": 0.067}
{"request_id": "182f5f87e97b45d19eb9b8220cdf10d8", "route": "/health", "status": 200, "latency_ms": 1.124}
ok
test_cors_exact_origin_including_guard_errors
(tests.api.test_security.SecurityTests.test_cors_exact_origin_including_guard_errors) ... {"request_id":
"b3bce46829704053849c198f776c668d", "route": "/health", "status": 200, "latency_ms": 26.475}
{"request_id": "24b3064aadf54acd9f51db27b5f769b2", "route": "<unmatched>", "status": 413, "latency_ms": 0.086}
{"request_id": "e076d4cd2cbf47d4814a4a52323d3d4a", "route": "<unmatched>", "status": 200, "latency_ms": 0.063}
{"request_id": "0e73cb99ae3e4c00b12a336e78ab08c3", "route": "/health", "status": 200, "latency_ms": 1.37}
{"request_id": "7988a2518b934a12b12b94c7bbef460c", "route": "<unmatched>", "status": 413, "latency_ms": 0.069}
{"request_id": "5805874ef2584ef8a3b6e29d0a9a3bdc", "route": "<unmatched>", "status": 400, "latency_ms": 0.068}
ok
test_declared_and_streamed_body_limits_precede_session_creation
(tests.api.test_security.SecurityTests.test_declared_and_streamed_body_limits_precede_session_creation) ...
{"request_id": "3cff1c128b1a462894066be6981a3854", "route": "<unmatched>", "status": 413, "latency_ms": 0.214}
{"request_id": "ed1dbdca44ec4c2bb2fea91edbcb9011", "route": "<unmatched>", "status": 413, "latency_ms": 0.081}
{"request_id": "a1eb2405db444a5cbd9f8449829f55b9", "route": "<unmatched>", "status": 413, "latency_ms": 0.054}
ok
test_ip_rate_limit_includes_create_and_ignores_forwarded_header
(tests.api.test_security.SecurityTests.test_ip_rate_limit_includes_create_and_ignores_forwarded_header) ...
{"request_id": "94a6b394055e4209aed5f4f28332f14c", "route": "/v1/sessions", "status": 200, "latency_ms": 28.765}
{"request_id": "6bae4e6cac0a4f10896cb8d6ebcff3d3", "route": "/v1/sessions", "status": 200, "latency_ms": 0.651}
{"request_id": "d3acd4c976a54c768274944768d5cadb", "route": "<unmatched>", "status": 429, "latency_ms": 0.07}
ok
test_known_and_unknown_tokens_use_constant_time_comparison
(tests.api.test_security.SecurityTests.test_known_and_unknown_tokens_use_constant_time_comparison) ... ok
test_limit_windows_reset_and_memory_is_bounded
(tests.api.test_security.SecurityTests.test_limit_windows_reset_and_memory_is_bounded) ... ok
test_logs_have_only_allowlisted_fields_and_route_template
(tests.api.test_security.SecurityTests.test_logs_have_only_allowlisted_fields_and_route_template) ... {"request_id":
"b5bfb17cba0d43c88b0cd39ac52dc6ff", "route": "/v1/sessions", "status": 200, "latency_ms": 23.569}
ok
test_session_headers_and_server_issued_request_ids
(tests.api.test_security.SecurityTests.test_session_headers_and_server_issued_request_ids) ... {"request_id":
"c6f948ef855140488a41c52c8cc93fe5", "route": "/health", "status": 200, "latency_ms": 1.206}
ok
test_token_rate_limit_is_configurable_and_isolated
(tests.api.test_security.SecurityTests.test_token_rate_limit_is_configurable_and_isolated) ... {"request_id":
"4fff33d3e29741ddbc0a7413ee7eaa4b", "route": "/v1/sessions", "status": 200, "latency_ms": 25.106}
{"request_id": "1a85e2b5a5e14a37a388cc7bd8b468b2", "route": "/v1/sessions", "status": 200, "latency_ms": 0.706}
{"request_id": "5df7544a87e84871bee4fcad3c993b99", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms":
1.373}
{"request_id": "87b793e53b0e4c73981780246d8b77e0", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms":
1.234}
{"request_id": "f9e20e8853d346c69fbf04267f5cddc0", "route": "<unmatched>", "status": 429, "latency_ms": 0.059}
{"request_id": "5c81d42e85db4ae68f6206b3e13837d7", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms":
2.033}
ok
test_uniform_errors_no_input_echo_or_traceback
(tests.api.test_security.SecurityTests.test_uniform_errors_no_input_echo_or_traceback) ... {"request_id":
"78822baa8d9f40ab9f0c1a0160608183", "route": "<unmatched>", "status": 404, "latency_ms": 23.026}
{"request_id": "676fbeca2fe0468a94a19a1dbe6d0ebb", "route": "/v1/sessions", "status": 405, "latency_ms": 0.199}
{"request_id": "30beaac03361495d9bbcf7a60949e611", "route": "/v1/sessions/{session_id}/messages", "status": 422,
"latency_ms": 0.353}
{"request_id": "3bd9d889e3f041be9997ea8a5380fcc7", "route": "<unmatched>", "status": 413, "latency_ms": 0.07}
{"request_id": "abc5c1d89e524f648a035147663fbccd", "route": "/crash", "status": 500, "latency_ms": 1.481}
ok
test_wildcard_cors_config_fails_closed (tests.api.test_security.SecurityTests.test_wildcard_cors_config_fails_closed)
... {"request_id": "8b111f125007447aa7f6e8173370ad2a", "route": "/health", "status": 200, "latency_ms": 24.454}
{"request_id": "908ea917c4844764b20240d176d7fb8c", "route": "/health", "status": 200, "latency_ms": 23.015}
{"request_id": "6e19f2a3116b4f53a4014fe377d29b9d", "route": "/health", "status": 200, "latency_ms": 28.371}
ok
test_configured_csv_bounded_and_allowlisted_not_legacy_load
(tests.api.test_venues.VenueListTests.test_configured_csv_bounded_and_allowlisted_not_legacy_load) ... {"request_id":
"cbfcf9b17527482688ce9a1d914a173e", "route": "/v1/venues", "status": 200, "latency_ms": 28.597}
{"request_id": "2fd9efb946184c2dbd6bd76bbb5ce967", "route": "/v1/venues", "status": 200, "latency_ms": 6.005}
{"request_id": "6453f1aebf9a4bb9bfd5ffb2b18a5725", "route": "/v1/venues", "status": 200, "latency_ms": 9.776}
{"request_id": "c58ace68cce046ca921f2ef06a7dd1d4", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.543}
{"request_id": "8f9f63992e794c04aec43e391ae6f50b", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.016}
{"request_id": "c9a31c5c4a534010a821dd0291d8fcb5", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.831}
{"request_id": "349c4bfe90e14101b7c1e55abf797987", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.192}
{"request_id": "c63b2f4309124ce09fe034717aaa2a42", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.853}
{"request_id": "32756f1074e749e88876484244fec960", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.057}
{"request_id": "f132bfb3c4e441db9660855d5ed99895", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.126}
{"request_id": "ee5b5f52a9854fea9a47ea9fcc246b0e", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.918}
{"request_id": "ce33cf7df65c4849a3d2a719b5f76fd0", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.917}
{"request_id": "82792ae69d244e6097c6a092b16f54af", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.763}
{"request_id": "66fae6c88e2f44de85c59850c63b94a5", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.955}
{"request_id": "2035ce27a7b142308dd55bfd54901951", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.308}
{"request_id": "f4ab065bcd854e18a7994858f179762b", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 3.95}
{"request_id": "fe33f06ddd4a4525838242932ecf06ca", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.413}
{"request_id": "adf19e61be5b4804b09911795f9d0c55", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.168}
{"request_id": "e7c09253c85849449f976dbae1046ea2", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.161}
{"request_id": "8f2fd72889124f13b1525f6c194ddade", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.822}
{"request_id": "f95153a3ca384cad89daecc326d0416b", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.856}
{"request_id": "7d955fbf395d4a86a12468e35ceae21d", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 3.82}
{"request_id": "22f8f66f1bda4d769522e65ead49719d", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.205}
{"request_id": "2e049d0c3b554bbaadc2b0109c1816a4", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.944}
{"request_id": "a4bd1545367a49faae181bfe926c55d0", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.024}
{"request_id": "b6906b2521b741d9bd38cf7abfb7ce23", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.938}
{"request_id": "fd62509e82d2473b8beeca8e38ba16a1", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 4.09}
{"request_id": "6c6ff37475a64c39b2516dc19e1cd233", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 4.72}
{"request_id": "03e583e75ce94b40ace769df53b5369b", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.268}
{"request_id": "73348a6f2752454e87fcb63b72d1ae52", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.301}
{"request_id": "6ce6d9131f7f4284b3d97a2180df410b", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 5.42}
{"request_id": "52dd8b9b647f49ffac2ce559d5999637", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.267}
{"request_id": "426931b34d404ba6b081a0724a2c99dc", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.427}
{"request_id": "e86ea47d3b454cba98c5bd26f7ec652b", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.294}
{"request_id": "e0f4585e6ac9480586be6d31b68591ab", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.147}
{"request_id": "d870fd6813894868a6a714ddd6cd5c45", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.281}
{"request_id": "03c1be21bd624ff1acbbc56131932e0f", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.066}
{"request_id": "2f26a416295f4ae289603f602ee78b95", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.308}
{"request_id": "c5f3718c62ea403a836c7292f4f63c82", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.118}
{"request_id": "96892aedba574777a8ea1621009dddf6", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.898}
{"request_id": "7633a09d347c44d3b470f5d9f43b8783", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.122}
{"request_id": "08ac9cca448b4befa47a11e154f57ce2", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.007}
{"request_id": "fd2f6c877bc148999674de0d68cb5bbf", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.984}
{"request_id": "961011bdbe2847d1be1ea72bd5ca8156", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 3.94}
{"request_id": "7be90e24230b4a1bb41c815c3fd90e4d", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.032}
{"request_id": "a72756704cb44a5d8d35911dfda7958e", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.004}
{"request_id": "3bd9a8cfa77a4b388582e9a0dc12c705", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.928}
{"request_id": "984151287af644fb9eb00a7382af9903", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
3.853}
{"request_id": "d27ca68ba93044beb3e25d21952dc50f", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.118}
{"request_id": "782c1b8958354175bfbafd913613b48f", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms": 4.01}
{"request_id": "7ce06a228ca549b8bd015f51b733d4de", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.291}
{"request_id": "e135fe6afef543c8aa140fb808c32cc0", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
5.304}
{"request_id": "1b6bf55b1d5f40f897851792164fc252", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
4.116}
ok
test_pagination_and_city_filter (tests.api.test_venues.VenueListTests.test_pagination_and_city_filter) ...
{"request_id": "37e9b9699918469aac7f2107c9c7f710", "route": "/v1/venues", "status": 200, "latency_ms": 34.172}
{"request_id": "7f3ad7cc065a4c2ebb9f821948d4d88e", "route": "/v1/venues", "status": 200, "latency_ms": 1.822}
{"request_id": "7f85fc44ea6742ccb8aaaa46fc90f8bd", "route": "/v1/venues", "status": 200, "latency_ms": 1.21}
{"request_id": "d9638b72306546e390bf1b7c6226c00a", "route": "/v1/venues", "status": 200, "latency_ms": 1.125}
ok
test_pagination_bounds_are_enveloped_errors
(tests.api.test_venues.VenueListTests.test_pagination_bounds_are_enveloped_errors) ... {"request_id":
"b0d6a0541cc448eebc22184148274bf2", "route": "/v1/venues", "status": 422, "latency_ms": 22.653}
{"request_id": "3d892d162a934c9f83e41d84e5ef2fa7", "route": "/v1/venues", "status": 422, "latency_ms": 0.321}
{"request_id": "254c0f0f478441128b8f7f658b41d51b", "route": "/v1/venues", "status": 422, "latency_ms": 0.295}
{"request_id": "74f299309ac64f9bbce94bbf28f26c48", "route": "/v1/venues", "status": 422, "latency_ms": 0.238}
{"request_id": "5324d8f4d554443f99ee8901e8a93625", "route": "/v1/venues", "status": 422, "latency_ms": 0.233}
{"request_id": "88fd85832a4a47da8c8b5a0a4af04e64", "route": "/v1/venues", "status": 422, "latency_ms": 0.209}
{"request_id": "8f0abd8c18a44f29b6f25d52febef642", "route": "/v1/venues", "status": 200, "latency_ms": 1.918}
ok
test_synthetic_default_list_and_detail_share_snapshot
(tests.api.test_venues.VenueListTests.test_synthetic_default_list_and_detail_share_snapshot) ... {"request_id":
"8f0909beda6c492ba9d5193c3c995471", "route": "/v1/venues", "status": 200, "latency_ms": 26.663}
{"request_id": "0e7cdee0abe5442cacbc5ee0e165a66c", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.194}
{"request_id": "094ca56e63eb48eb9253d75739cd588f", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.135}
{"request_id": "37c21e0240e243738e83f31ae13a1ebf", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.403}
{"request_id": "fe28d9c71f084ead8664fdca2ad667c4", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.387}
{"request_id": "154efc1a624548a68c34c44613fb5e26", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.382}
{"request_id": "ed177eba3d5647c898a4038a9b2095df", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.367}
{"request_id": "b81a64cb68624743b2b7eeac2c9d8915", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.407}
{"request_id": "b44ef63ae82e432a8bc0eb8a6cb57213", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.173}
{"request_id": "51cf83a603104b3a94245e046e5e4a0e", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.089}
{"request_id": "b999dea84df74d88b8b5756c891d479d", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
0.994}
{"request_id": "b3ce38c400e84c5c98fc9a5ba1c9db8b", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.157}
{"request_id": "660db5daafcf457a9dfd1b6ee7941088", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.137}
{"request_id": "424410a50f9d4ec4bb7faee2e86dd573", "route": "/v1/venues/{venue_id}", "status": 200, "latency_ms":
1.704}
ok
test_adjacent_unsorted_intervals_and_verified_closed_days
(tests.data.test_evidence.EvidenceTests.test_adjacent_unsorted_intervals_and_verified_closed_days) ... ok
test_cache_and_version_invalidate_for_every_overlay_byte_change
(tests.data.test_evidence.EvidenceTests.test_cache_and_version_invalidate_for_every_overlay_byte_change) ... ok
test_fields_require_independent_source_and_valid_date
(tests.data.test_evidence.EvidenceTests.test_fields_require_independent_source_and_valid_date) ... ok
test_invalid_rows_do_not_prevent_other_entries_loading
(tests.data.test_evidence.EvidenceTests.test_invalid_rows_do_not_prevent_other_entries_loading) ... ok
test_invalid_times_overlap_reverse_and_partial_week_rejected
(tests.data.test_evidence.EvidenceTests.test_invalid_times_overlap_reverse_and_partial_week_rejected) ... ok
test_partial_field_is_loaded_and_rejected_without_promoting_price
(tests.data.test_evidence.EvidenceTests.test_partial_field_is_loaded_and_rejected_without_promoting_price) ... ok
test_price_type_order_and_negative_values_rejected
(tests.data.test_evidence.EvidenceTests.test_price_type_order_and_negative_values_rejected) ... ok
test_unknown_and_all_duplicate_id_entries_rejected_rest_loads
(tests.data.test_evidence.EvidenceTests.test_unknown_and_all_duplicate_id_entries_rejected_rest_loads) ... ok
test_unreadable_malformed_oversized_and_relative_files_fail_closed
(tests.data.test_evidence.EvidenceTests.test_unreadable_malformed_oversized_and_relative_files_fail_closed) ... ok
test_unset_or_blank_is_identical_to_original_dataset
(tests.data.test_evidence.EvidenceTests.test_unset_or_blank_is_identical_to_original_dataset) ... ok
test_valid_fixture_merges_minutes_prices_and_count_only_report
(tests.data.test_evidence.EvidenceTests.test_valid_fixture_merges_minutes_prices_and_count_only_report) ... ok
test_verified_feasibility_requires_all_three_evidence_types
(tests.data.test_evidence.EvidenceTests.test_verified_feasibility_requires_all_three_evidence_types) ... ok
test_absent_path_fallback_label_hash_and_planner_integration
(tests.data.test_loader.LoaderTests.test_absent_path_fallback_label_hash_and_planner_integration) ... ok
test_csv_bom_roundtrip_matches_json (tests.data.test_loader.LoaderTests.test_csv_bom_roundtrip_matches_json) ... ok
test_duplicate_id_then_url_and_deterministic_order
(tests.data.test_loader.LoaderTests.test_duplicate_id_then_url_and_deterministic_order) ... ok
test_environment_and_default_path (tests.data.test_loader.LoaderTests.test_environment_and_default_path) ... ok
test_existing_empty_file_and_unreadable_directory_do_not_fallback
(tests.data.test_loader.LoaderTests.test_existing_empty_file_and_unreadable_directory_do_not_fallback) ... ok
test_file_bytes_not_modified (tests.data.test_loader.LoaderTests.test_file_bytes_not_modified) ... ok
test_geo_status_and_online_are_flags_for_planner
(tests.data.test_loader.LoaderTests.test_geo_status_and_online_are_flags_for_planner) ... ok
test_integral_decimal_csv_prices_supported
(tests.data.test_loader.LoaderTests.test_integral_decimal_csv_prices_supported) ... ok
test_malformed_csv_rejected (tests.data.test_loader.LoaderTests.test_malformed_csv_rejected) ... ok
test_malformed_json_and_wrong_shape_do_not_fallback
(tests.data.test_loader.LoaderTests.test_malformed_json_and_wrong_shape_do_not_fallback) ... ok
test_missing_urls_do_not_collapse_distinct_ids
(tests.data.test_loader.LoaderTests.test_missing_urls_do_not_collapse_distinct_ids) ... ok
test_normalization_and_no_evidence_promotion
(tests.data.test_loader.LoaderTests.test_normalization_and_no_evidence_promotion) ... ok
test_null_zero_malformed_nonfinite_and_bounds_coordinates
(tests.data.test_loader.LoaderTests.test_null_zero_malformed_nonfinite_and_bounds_coordinates) ... ok
test_rejection_and_flags_report_contains_only_counts
(tests.data.test_loader.LoaderTests.test_rejection_and_flags_report_contains_only_counts) ... ok
test_relative_path_rejected (tests.data.test_loader.LoaderTests.test_relative_path_rejected) ... ok
test_unknown_zero_negative_fractional_inverted_prices
(tests.data.test_loader.LoaderTests.test_unknown_zero_negative_fractional_inverted_prices) ... ok
test_basic_vietnamese (tests.planner.test_extract_explain.ExtractTests.test_basic_vietnamese) ... ok
test_edit_preserves_unspecified_slots
(tests.planner.test_extract_explain.ExtractTests.test_edit_preserves_unspecified_slots) ... ok
test_exclusion_not_interest (tests.planner.test_extract_explain.ExtractTests.test_exclusion_not_interest) ... ok
test_explain_flags_unknowns (tests.planner.test_extract_explain.ExtractTests.test_explain_flags_unknowns) ... ok
test_missing_slots_asked_not_guessed
(tests.planner.test_extract_explain.ExtractTests.test_missing_slots_asked_not_guessed) ... ok
test_prompt_injection_is_just_text
(tests.planner.test_extract_explain.ExtractTests.test_prompt_injection_is_just_text) ... ok
test_unavailable_never_fakes (tests.planner.test_extract_explain.ExtractTests.test_unavailable_never_fakes) ... ok
test_no_diacritics_and_whole_word (tests.planner.test_extract_explain.FoldedTerms.test_no_diacritics_and_whole_word)
... ok
test_substring_inside_other_word_is_ignored
(tests.planner.test_extract_explain.FoldedTerms.test_substring_inside_other_word_is_ignored) ... ok
test_injection_sentence_yields_no_slots
(tests.planner.test_extract_explain.InjectionHardening.test_injection_sentence_yields_no_slots) ... ok
test_legit_sentence_survives_next_to_injection
(tests.planner.test_extract_explain.InjectionHardening.test_legit_sentence_survives_next_to_injection) ... ok
test_out_of_range_values_are_rejected_not_clamped
(tests.planner.test_extract_explain.NoSilentClamp.test_out_of_range_values_are_rejected_not_clamped) ... ok
test_negative_zero_and_out_of_range_are_rejected_and_reported
(tests.planner.test_extract_explain.RangeRejection.test_negative_zero_and_out_of_range_are_rejected_and_reported) ...
ok
test_prior_includes_start_time_and_weekday
(tests.planner.test_llm_provider.Hardening.test_prior_includes_start_time_and_weekday) ... ok
test_unknown_field_names_not_reflected
(tests.planner.test_llm_provider.Hardening.test_unknown_field_names_not_reflected) ... ok
test_bad_responses_are_unavailable_never_success
(tests.planner.test_llm_provider.LLMBoundary.test_bad_responses_are_unavailable_never_success) ... ok
test_injection_sentences_are_not_sent_to_provider
(tests.planner.test_llm_provider.LLMBoundary.test_injection_sentences_are_not_sent_to_provider) ... ok
test_origin_must_be_in_pilot_area (tests.planner.test_llm_provider.LLMBoundary.test_origin_must_be_in_pilot_area) ...
ok
test_prior_slots_preserved_when_model_omits_or_nulls
(tests.planner.test_llm_provider.LLMBoundary.test_prior_slots_preserved_when_model_omits_or_nulls) ... ok
test_provider_errors_are_unavailable
(tests.planner.test_llm_provider.LLMBoundary.test_provider_errors_are_unavailable) ... ok
test_terms_validated (tests.planner.test_llm_provider.LLMBoundary.test_terms_validated) ... ok
test_unknown_and_out_of_range_dropped_not_clamped
(tests.planner.test_llm_provider.LLMBoundary.test_unknown_and_out_of_range_dropped_not_clamped) ... ok
test_valid_output_is_applied_and_marked_live
(tests.planner.test_llm_provider.LLMBoundary.test_valid_output_is_applied_and_marked_live) ... ok
test_free_text_place_is_carried_not_resolved
(tests.planner.test_llm_provider.OriginText.test_free_text_place_is_carried_not_resolved) ... ok
test_landmark_sets_label_and_source (tests.planner.test_llm_provider.OriginText.test_landmark_sets_label_and_source)
... ok
test_model_cannot_set_label_or_source_without_landmark
(tests.planner.test_llm_provider.OriginText.test_model_cannot_set_label_or_source_without_landmark) ... ok
test_rules_extractor_labels_landmarks
(tests.planner.test_llm_provider.OriginText.test_rules_extractor_labels_landmarks) ... ok
test_cheap_venue_beyond_pool_cap_is_found
(tests.planner.test_planner_core.BudgetPruneBeforeCap.test_cheap_venue_beyond_pool_cap_is_found) ... ok
test_rebuild_matches_planned_tour_and_rejects_bad_input
(tests.planner.test_planner_core.BuildTour.test_rebuild_matches_planned_tour_and_rejects_bad_input) ... ok
test_more_stops_than_max_is_rejected
(tests.planner.test_planner_core.BuildTourMaxStops.test_more_stops_than_max_is_rejected) ... ok
test_malformed_coordinates_do_not_raise
(tests.planner.test_planner_core.CheckedProviderMalformedInput.test_malformed_coordinates_do_not_raise) ... ok
test_bad_provider_output_becomes_unknown_leg
(tests.planner.test_planner_core.CheckedProviderTests.test_bad_provider_output_becomes_unknown_leg) ... ok
test_cross_midnight_is_rejected_not_wrapped
(tests.planner.test_planner_core.Midnight.test_cross_midnight_is_rejected_not_wrapped) ... ok
test_budget_infeasible_gives_reasons
(tests.planner.test_planner_core.PlannerCore.test_budget_infeasible_gives_reasons) ... ok
test_closed_at_arrival_is_hard_reject
(tests.planner.test_planner_core.PlannerCore.test_closed_at_arrival_is_hard_reject) ... ok
test_conditional_tour_is_valid_and_labelled
(tests.planner.test_planner_core.PlannerCore.test_conditional_tour_is_valid_and_labelled) ... ok
test_duration_too_short (tests.planner.test_planner_core.PlannerCore.test_duration_too_short) ... ok
test_excludes_online_nogeo_noprice (tests.planner.test_planner_core.PlannerCore.test_excludes_online_nogeo_noprice)
... ok
test_far_venue_not_chosen (tests.planner.test_planner_core.PlannerCore.test_far_venue_not_chosen) ... ok
test_interest_and_exclusion (tests.planner.test_planner_core.PlannerCore.test_interest_and_exclusion) ... ok
test_matches_exact_baseline_on_small_fixture
(tests.planner.test_planner_core.PlannerCore.test_matches_exact_baseline_on_small_fixture)
Search must equal brute force over all permutations of the eligible pool. ... ok
test_missing_slots (tests.planner.test_planner_core.PlannerCore.test_missing_slots) ... ok
test_replace_failure_returns_reason_and_unchanged_tour
(tests.planner.test_planner_core.PlannerCore.test_replace_failure_returns_reason_and_unchanged_tour) ... ok
test_replace_keeps_other_stops (tests.planner.test_planner_core.PlannerCore.test_replace_keeps_other_stops) ... ok
test_strict_refuses_without_evidence
(tests.planner.test_planner_core.PlannerCore.test_strict_refuses_without_evidence) ... ok
test_unreachable_leg (tests.planner.test_planner_core.PlannerCore.test_unreachable_leg) ... ok
test_validate_catches_tampering (tests.planner.test_planner_core.PlannerCore.test_validate_catches_tampering) ... ok
test_verified_feasible_requires_all_evidence
(tests.planner.test_planner_core.PlannerCore.test_verified_feasible_requires_all_evidence) ... ok
test_truncation_is_disclosed (tests.planner.test_planner_core.PoolTruncation.test_truncation_is_disclosed) ... ok
test_ineligible_venue_fails (tests.planner.test_planner_core.ValidateRecompute.test_ineligible_venue_fails) ... ok
test_order_swap_fails_and_clean_passes
(tests.planner.test_planner_core.ValidateRecompute.test_order_swap_fails_and_clean_passes) ... ok
test_strict_pref_rejects_conditional_tour
(tests.planner.test_planner_core.ValidateRecompute.test_strict_pref_rejects_conditional_tour) ... ok
test_tampered_leg_totals_and_timeline_fail
(tests.planner.test_planner_core.ValidateRecompute.test_tampered_leg_totals_and_timeline_fail) ... ok
test_diacritics_optional_in_query (tests.planner.test_relevance.Relevance.test_diacritics_optional_in_query) ... ok
test_eligible_requires_match_when_interests_set
(tests.planner.test_relevance.Relevance.test_eligible_requires_match_when_interests_set) ... ok
test_exclusion_whole_word (tests.planner.test_relevance.Relevance.test_exclusion_whole_word) ... ok
test_fold_is_diacritic_insensitive (tests.planner.test_relevance.Relevance.test_fold_is_diacritic_insensitive) ... ok
test_relevance_beats_distance_under_pool_cap
(tests.planner.test_relevance.Relevance.test_relevance_beats_distance_under_pool_cap) ... ok
test_synonym_sweets (tests.planner.test_relevance.Relevance.test_synonym_sweets) ... ok
test_whole_word_not_substring (tests.planner.test_relevance.Relevance.test_whole_word_not_substring) ... ok
test_failed_batch_cooldown_recovers_without_per_leg_retry
(tests.providers.test_google_maps.GoogleFakeCase.test_failed_batch_cooldown_recovers_without_per_leg_retry) ... ok
test_failures_and_quota_never_raise_or_retry_each_leg
(tests.providers.test_google_maps.GoogleFakeCase.test_failures_and_quota_never_raise_or_retry_each_leg) ... ok
test_geocode_errors (tests.providers.test_google_maps.GoogleFakeCase.test_geocode_errors) ... ok
test_geocode_fixed_country_bias_five_results_and_budget
(tests.providers.test_google_maps.GoogleFakeCase.test_geocode_fixed_country_bias_five_results_and_budget) ... ok
test_geometry_coordinate_order_warnings_and_limits
(tests.providers.test_google_maps.GoogleFakeCase.test_geometry_coordinate_order_warnings_and_limits) ... ok
test_geometry_malformed_and_lru_bound
(tests.providers.test_google_maps.GoogleFakeCase.test_geometry_malformed_and_lru_bound) ... ok
test_matrix_chunk_limits_no_truncation
(tests.providers.test_google_maps.GoogleFakeCase.test_matrix_chunk_limits_no_truncation) ... ok
test_matrix_fixed_mask_walk_duration_and_cache
(tests.providers.test_google_maps.GoogleFakeCase.test_matrix_fixed_mask_walk_duration_and_cache) ... ok
test_secret_reflection_and_no_external_override
(tests.providers.test_google_maps.GoogleFakeCase.test_secret_reflection_and_no_external_override) ... ok
test_status_and_not_found_never_estimated
(tests.providers.test_google_maps.GoogleFakeCase.test_status_and_not_found_never_estimated) ... ok
test_timeout (tests.providers.test_google_maps.GoogleFakeCase.test_timeout) ... ok
test_api_live_uses_validation_health_and_failure_envelopes
(tests.providers.test_http.LocalProviders.test_api_live_uses_validation_health_and_failure_envelopes) ...
{"request_id": "b1f30b86e99f4c6e902771eae7798f74", "route": "/health", "status": 200, "latency_ms": 27.593}
{"request_id": "bd7ef7c81875460393d2464893e8bed6", "route": "/health", "status": 200, "latency_ms": 3.152}
{"request_id": "77a11386b7694fe197fd1df33293d152", "route": "/v1/sessions", "status": 200, "latency_ms": 0.536}
{"request_id": "fd466e93d0d14e9f905215c986464186", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 17.655}
{"request_id": "ee493a56701d4b1889b73d76896fcedc", "route": "/v1/sessions/{session_id}/messages", "status": 503,
"latency_ms": 24.65}
ok
test_extraction_failures_have_safe_kinds
(tests.providers.test_http.LocalProviders.test_extraction_failures_have_safe_kinds) ... ok
test_extraction_json_post_key_from_env_and_validation
(tests.providers.test_http.LocalProviders.test_extraction_json_post_key_from_env_and_validation) ... ok
test_health_flags_no_endpoint_no_sockets_no_secrets
(tests.providers.test_http.LocalProviders.test_health_flags_no_endpoint_no_sockets_no_secrets) ... {"request_id":
"1ad39c46f1384f5ba213bd9008e0fea4", "route": "/health", "status": 200, "latency_ms": 26.777}
ok
test_model_injection_output_is_schema_checked_before_planning
(tests.providers.test_http.LocalProviders.test_model_injection_output_is_schema_checked_before_planning) ... ok
test_no_non_loopback_socket_redirect_or_proxy
(tests.providers.test_http.LocalProviders.test_no_non_loopback_socket_redirect_or_proxy) ... ok
test_quota_is_thread_safe_and_cache_hits_cost_no_calls
(tests.providers.test_http.LocalProviders.test_quota_is_thread_safe_and_cache_hits_cost_no_calls) ... ok
test_route_failures_never_raise_or_upgrade_evidence
(tests.providers.test_http.LocalProviders.test_route_failures_never_raise_or_upgrade_evidence) ... ok
test_route_rejects_invalid_numbers_and_no_route
(tests.providers.test_http.LocalProviders.test_route_rejects_invalid_numbers_and_no_route) ... ok
test_route_success_foot_units_direction_and_lru
(tests.providers.test_http.LocalProviders.test_route_success_foot_units_direction_and_lru) ... ok
test_slow_drip_obeys_total_body_deadline
(tests.providers.test_http.LocalProviders.test_slow_drip_obeys_total_body_deadline) ... ok
test_strict_mode_cannot_succeed_on_unavailable_routes
(tests.providers.test_http.LocalProviders.test_strict_mode_cannot_succeed_on_unavailable_routes) ... ok
test_estimate_mode_never_has_geometry
(tests.providers.test_phase3.ApiWithProviders.test_estimate_mode_never_has_geometry) ... {"request_id":
"4cb736a7902243328a7229eeb3ca1799", "route": "/v1/sessions", "status": 200, "latency_ms": 22.739}
{"request_id": "16d4a60139aa43dab7d17f65299ad662", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 15.499}
ok
test_tour_legs_carry_provider_geometry_and_health_labels
(tests.providers.test_phase3.ApiWithProviders.test_tour_legs_carry_provider_geometry_and_health_labels) ...
{"request_id": "74098f401e9749edb5b0a9473993a532", "route": "/health", "status": 200, "latency_ms": 23.53}
{"request_id": "2be88738fcfa4aa09d400edf55231508", "route": "/v1/sessions", "status": 200, "latency_ms": 0.424}
{"request_id": "9c837d4287164cf596c739063b769d5f", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 86.782}
ok
test_adversarial_texts_fail (tests.providers.test_phase3.ExplanationChecker.test_adversarial_texts_fail) ... ok
test_truthful_text_passes (tests.providers.test_phase3.ExplanationChecker.test_truthful_text_passes) ... ok
test_facts_sent_to_llm_contain_no_venue_identity
(tests.providers.test_phase3.ExplanationPrivacy.test_facts_sent_to_llm_contain_no_venue_identity) ... ok
test_retry_only_when_enough_time_remains
(tests.providers.test_phase3.ExplanationTimeBudget.test_retry_only_when_enough_time_remains) ... ok
test_daily_budget_and_missing_key (tests.providers.test_phase3.GeminiFake.test_daily_budget_and_missing_key) ... ok
test_explainer_uses_checked_llm_text_or_template
(tests.providers.test_phase3.GeminiFake.test_explainer_uses_checked_llm_text_or_template) ... ok
test_failures_map_to_kinds_and_fallback_is_labelled
(tests.providers.test_phase3.GeminiFake.test_failures_map_to_kinds_and_fallback_is_labelled) ... ok
test_model_cannot_supply_coordinates_or_unknown_landmark
(tests.providers.test_phase3.GeminiFake.test_model_cannot_supply_coordinates_or_unknown_landmark) ... ok
test_request_shape_and_key_header (tests.providers.test_phase3.GeminiFake.test_request_shape_and_key_header) ... ok
test_single_retry_only_for_transient_server_errors
(tests.providers.test_phase3.GeminiFake.test_single_retry_only_for_transient_server_errors) ... ok
test_only_project_keys_and_no_override (tests.providers.test_phase3.LocalEnv.test_only_project_keys_and_no_override)
... ok
test_budget_and_no_key (tests.providers.test_phase3.ORSFake.test_budget_and_no_key) ... ok
test_matrix_prefetch_one_call_and_geometry_split
(tests.providers.test_phase3.ORSFake.test_matrix_prefetch_one_call_and_geometry_split) ... ok
test_replace_uses_one_bounded_matrix (tests.providers.test_phase3.ORSFake.test_replace_uses_one_bounded_matrix) ... ok
test_unreachable_null_and_failures_are_unknown
(tests.providers.test_phase3.ORSFake.test_unreachable_null_and_failures_are_unknown) ... ok
test_allowlist_rules (tests.providers.test_phase3.Transport.test_allowlist_rules) ... ok
test_refused_destination_opens_no_socket
(tests.providers.test_phase3.Transport.test_refused_destination_opens_no_socket) ... ok
test_capacity_and_expired_rows_bound
(tests.repositories.test_sessions.DurableSessions.test_capacity_and_expired_rows_bound) ... ok
test_corrupt_row_and_schema_fail_closed
(tests.repositories.test_sessions.DurableSessions.test_corrupt_row_and_schema_fail_closed) ... ok
test_dataset_change_discards_tour_keeps_preferences
(tests.repositories.test_sessions.DurableSessions.test_dataset_change_discards_tour_keeps_preferences) ... ok
test_env_selects_store_and_new_app_reads_database
(tests.repositories.test_sessions.DurableSessions.test_env_selects_store_and_new_app_reads_database) ...
{"request_id": "0b081c32a28b41e9b07fb7eb01d4a1f4", "route": "/v1/sessions", "status": 200, "latency_ms": 37.215}
{"request_id": "e26bd26e7c4d4d989c5fd28cc5760ae0", "route": "/v1/sessions/{session_id}/messages", "status": 200,
"latency_ms": 30.266}
{"request_id": "0b91984b8915408f8a6224e5841c2930", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms":
27.054}
ok
test_get_stale_or_missing_venue_returns_null_note_repeatedly
(tests.repositories.test_sessions.DurableSessions.test_get_stale_or_missing_venue_returns_null_note_repeatedly) ...
{"request_id": "df6291bc13304610ad58c0cea605c447", "route": "/v1/sessions/{session_id}", "status": 401, "latency_ms":
25.297}
{"request_id": "973f22ab6fef4ebfba9b440d35fd015f", "route": "/v1/sessions/{session_id}", "status": 403, "latency_ms":
2.056}
{"request_id": "35f25cacd5e948139585da300931dc15", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms":
4.174}
{"request_id": "4f5f934702444c07a64d2a6c91e1276f", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms":
4.346}
{"request_id": "24ec0636fdcb454cbf86e55b5c2a70c0", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms":
3.019}
{"request_id": "394bc4b798a440da99df2fa00470b7f8", "route": "/v1/sessions/{session_id}", "status": 200, "latency_ms":
3.507}
ok
test_isolation_and_expiry_survive_restart
(tests.repositories.test_sessions.DurableSessions.test_isolation_and_expiry_survive_restart) ... ok
test_locked_and_corrupt_db_are_redacted_503
(tests.repositories.test_sessions.DurableSessions.test_locked_and_corrupt_db_are_redacted_503) ... {"request_id":
"f5b4db3f73764f749eb594ad906055be", "route": "/v1/sessions", "status": 503, "latency_ms": 339.406}
{"request_id": "81f8fb809ae24d81a75f7d56b31c7fc0", "route": "/v1/sessions", "status": 503, "latency_ms": 55.275}
ok
test_restart_rebuilds_exact_order_from_ids_without_private_payload
(tests.repositories.test_sessions.DurableSessions.test_restart_rebuilds_exact_order_from_ids_without_private_payload)
... ok
test_transaction_rollback (tests.repositories.test_sessions.DurableSessions.test_transaction_rollback) ... ok
test_two_writers_have_one_atomic_conflict
(tests.repositories.test_sessions.DurableSessions.test_two_writers_have_one_atomic_conflict) ... ok

----------------------------------------------------------------------
Ran 201 tests in 12.711s

OK (skipped=1)

```

</details>

## PH4-BE-2 follow-up — precise geometry and request volume

Reviewed the current [computeRoutes reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes#PolylineQuality) again on 2026-10-15. `HIGH_QUALITY` is accepted; omitting quality defaults to OVERVIEW. Directions now sends `polylineQuality: HIGH_QUALITY` together with `GEO_JSON_LINESTRING` and `WALK`. The exact response field mask remains `routes.legs.polyline.geoJsonLinestring,routes.warnings`. The existing fake-server geometry test now asserts all three body values and the unchanged mask. More detailed polylines may be larger; existing response/geometry limits still fail closed if exceeded.

### Volume table (no prices assumed)

Cold cache, successful HTTP calls, current API planner defaults unless stated. A matrix element is one origin/destination pair, including diagonals and both directions. The daily routing setting counts **HTTP calls**, not elements, so it is not a monetary cap.

| Operation / phase | Google matrix HTTP calls | Matrix elements requested | Directions HTTP calls | Geocoding HTTP calls |
| --- | --- | --- | --- | --- |
| Successful new plan, n total unique origin + candidate points | 1 for n <=16 | n x n; conservative envelope 256 at n=16; actual default POOL_CAP=14 gives n<=15 and <=225 | 0–1 for the final returned provider-route tour | 0, unless triggered by message origin_text below |
| Failed/strict-insufficient plan diagnosis | Up to 1 additional matrix when diagnostic candidate set differs and is not cached | Up to 15 x 15 =225 additional elements; current default complete plan+diagnosis can therefore request up to 450 | 0 if no stops returned | 0 |
| Replace one stop, n<=45 (corrected in Claude commit 5e49644) | Up to 4 | At 45: 25x25 + 25x20 + 20x25 + 20x20 =625+500+500+400 =2025 | 0–1 for the selected replacement tour | 0 |
| Cold SQLite restore of an existing 5-stop tour before an operation | Up to 1 additional matrix | Up to (origin + 5 stops)^2 =36; those cells may then be re-requested by a larger cold chunk | A rendered session read may make 1 geometry request if not cached | 0 |
| Message without free-text origin (including built-in landmark) | Planning costs above only when required slots are present | As above | As above | 0 |
| Message with valid origin_text and ready geocoder | Planning costs above only if geocoding fills required origin | As above | As above | At most 1, including zero_results/unavailable/quota responses; no automatic retry |
| Explicit POST /v1/geocode | 0 | 0 | 0 | At most 1 per authorized, rate-admitted request |
| Missing configuration, auth/rate/budget rejection before HTTP | 0 for rejected phase | 0 for rejected phase | 0 for rejected phase | 0 for rejected phase |

Caches reduce calls when complete requested chunks or final geometry are already available. Partial chunk overlap can be requested again; repeated new origins, diagnostics, session restores, expiry/eviction, and process restarts change volume. A failed matrix has a 30-second cooldown; an actual failed HTTP attempt still consumes a local budget unit. Geocoding has no result cache. Google Cloud quota/billing controls and current official billing units still need human review; no prices or currency conversion were guessed.

The original replace expression allowed 46 points with five current stops. This was raised via Orca; Claude fixed the planner in **5e49644**, which was merged here without modifying Claude-owned files. The new planner cap regression test is included in this run. Plan's n<=16 is a conservative envelope; current default is 15.

### Follow-up verification

```powershell
$env:PYTHONPATH='backend'
./.venv/Scripts/python.exe -m unittest backend.tests.providers.test_google_maps -q
./.venv/Scripts/python.exe scripts/run_unittests.py *> $env:TEMP/foodtour-ph4-be2-tests.txt
$testResult=$LASTEXITCODE
Get-Content $env:TEMP/foodtour-ph4-be2-tests.txt -Tail 5
Write-Output "UNITTEST_EXIT=$testResult"
./.venv/Scripts/python.exe tools/export_openapi.py --check
```

Actual focused output:

```text
----------------------------------------------------------------------
Ran 11 tests in 1.326s

OK
```

Actual complete-suite output after merging 5e49644:

```text
----------------------------------------------------------------------
Ran 202 tests in 18.694s

OK (skipped=1)
UNITTEST_EXIT=0
OpenAPI matches server schema
```

The same documented legacy private-data skip and existing TestClient deprecation warning apply. No live Google request or dependency change was made during this follow-up. Independent review of Claude's phase-4 changes is reported separately in CODEX_REVIEW_P4_CLAUDE.md.
