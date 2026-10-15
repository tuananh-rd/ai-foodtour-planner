# Final independent phase-4 frontend verification

Reviewer: Codex. Review owner: Claude. Date: 2026-10-15.

**Recommendation: MERGE-AFTER-FIXES. One application blocker remains: F1, a completed unsaved origin survives a new-session reset.** The specifically targeted N1 delayed-response race, N2 loading cleanup, N3 zoom listener and N4 production test-hook failures are fixed on the independently exercised paths. The new cold suite catches FE1 and FE4, but its N3 assertion can still pass the broken old code (F2). Backend discovery: 211 tests, OK with one documented skip; OpenAPI drift clean.

## Scope and isolation

Merged coordinator to **045db0e**, then reviewed `git diff 3a43515..045db0e -- frontend qa/e2e`. This report is the only repository edit. All npm builds, browser servers, doubles and probes were outside the repository. The human's 3000/8000 services and shared frontend/.next were untouched.

Current production scratch build: `C:/Users/tuana/AppData/Local/Temp/foodtour-ph4-final-vvvvagh3`; pre-fix production scratch: `C:/Users/tuana/AppData/Local/Temp/foodtour-ph4-review-ut9v3o3k`. All **18 tracked pre-fix frontend files** were compared against commit **3a43515**, with **0 mismatches** after text newline normalization. Both scratch trees received the same current qa/e2e scripts. Current API/web used 18197/13197; pre-fix API/web used 18174/13174. Each API used the current backend, synthetic fallback input, rules/template/estimate providers, no session DB, no overlay, and a clearly fake browser-only key plus DEMO_MAP_ID for the intercepted SDK test. No server/provider credentials were used.

Own probes began without window.google, intercepted the real loader's script insertion, supplied only the documented per-library importLibrary dictionary, and completed google.maps.__ib__. No application test flag was used for the current normal-path probes. Google resource hosts were blocked in CDP. Separate temporary Edge profiles/ports isolated all runs.

## N1–N4 closure from own probes

| Item | Result | Independent verification / current evidence |
| --- | --- | --- |
| N1 delayed Place Details across held session reset | **Closed for the delayed-response defect** | Start deferred fetchFields, click New Session, hold its POST response, then resolve the old request before releasing creation. Old result is absent during and after reset. page.js:207 advances sessionEpoch; PreferencesPanel.jsx:176 checks both epoch and generation. F1 below is a distinct completed-form-state reset gap. |
| N1 manual geocode across reset | **Closed** | A transport double deliberately ignored cancellation and delivered old results during the held reset. Signal was aborted; no old result list appeared; controls recovered. |
| N2 superseded geolocation and manual lookup loading | **Closed** | Deferred geolocation superseded by a preset left the button enabled and not loading; late callback had no effect. Deferred manual geocode superseded by a preset was aborted, ignored and left its input enabled. Shared invalidation at PreferencesPanel.jsx:46–60 clears busy flags. |
| N3 clusters follow zoom after reset | **Closed** | Own probe enters reset at zoom 15, then changes reused map to 12: two clusters are created after reset (old frontend: zero). Separate zoom effect at MapView.jsx:168–201 manages the listener independently from client-config identity. |
| N4 production test hook / fake fallback key | **Closed** | Old magic global set before load with unavailable config cannot initiate fake-key loading. Scanned all 57 production static/server build files: zero occurrences of __TEST_FAKE_GOOGLE_MAPS__, __TEST_INIT_FAKE_MAPS__, or TEST_KEY. Current MapView/PreferencesPanel require ready config and pass only its key. |

Actual current own-probe output:

```json
{"probe":"cold_bootstrap","scriptLoads":1,"mapConstructors":1,"autocompleteConstructors":1,"unavailableBanner":false,"automaticGeolocations":0}
{"probe":"venue_fetch","requests":[{"mapEndpoint":true,"hasBbox":true,"hasSignal":true}],"markers":11}
{"probe":"cluster_before_reset","zoom":12,"clusters":2}
{"probe":"debounce_early","extraRequests":0}
{"probe":"viewport_refresh","requestsAfterPan":2,"hasIdleListener":true,"hasBoundsListener":false}
{"probe":"toggle_off","pressed":"false","markers":0,"autocompleteConstructors":1,"abortedPending":1}
{"probe":"autocomplete_out_of_order","latestBefore":true,"oldOverridesLatest":false}
{"probe":"place_during_session_reset","staleAppliedDuringReset":false,"stalePersistsAfterReset":false,"oldUnsavedSelectionPersists":true,"oldUnsavedCoordinatesPersist":true}
{"probe":"cancelled_geolocation","buttonStillDisabled":false,"stillLoading":false}
{"probe":"cluster_after_reset","zoom":12,"clusters":2,"individuals":1}
{"probe":"geocode_across_reset","aborted":true,"oldResultsVisible":false,"inputDisabled":false}
{"probe":"superseded_geocode","aborted":true,"oldResultsVisible":false,"inputDisabled":false}
{"probe":"production_test_hook","fakeKeyLoaderReachable":false,"browserKeyInStorage":false,"fakeKeyInAppUrl":false}
{"probe":"console_key_scan","fakeKeyLogged":false}
{"probe":"production_bundle_scan","files_scanned":57,"files_with_test_hooks":0}
```

## Findings ranked

### F1 — MEDIUM, blocking — completed unsaved origin remains in the new session's form

Evidence: `frontend/app/components/PreferencesPanel.jsx:89`–99 invalidates requests on the new session epoch, but resets origin fields only when `!preferences.origin`. Its separate synchronization effect at :102–119 depends only on preferences object identity. `frontend/app/page.js:207` advances the epoch, then :213 sets the same DEFAULT_PREFERENCES object, whose origin is non-null.

Isolated failing sequence on a fresh production page:

1. Select a place in Autocomplete; let fetchFields complete. Do not save preferences or request a tour.
2. Click “Tạo phiên mới” and wait for new session/config completion.
3. The previous place label **and its coordinates** remain in the form. The parent preferences/map origin have been reset; submitting the form can silently send the old location into the new session.

This is completed local state, not the already-fixed delayed-response race. It was reproduced independently without holding a request, and with a short separate browser script:

```json
{"probe":"completed_unsaved_place_reset","oldLabelPersists":true,"oldCoordinatesPersist":true}
```

Suggested fix: synchronize/reset all local form fields from the new session's preferences on sessionEpoch even when origin is non-null and preferences has the same reference. Alternatively remount the form by epoch while preserving the intended defaults. Include the preset, label/source and address-search state consistently. Add an unsaved-place→reset regression case, checking both label and coordinate values rather than only absence of a late callback's label.

### F2 — MEDIUM, verification gap — cold suite N3 assertion still passes the broken old listener

Evidence: `qa/e2e/test_cold_bootstrap.mjs:533` leaves clustering at zoom 12 before reset. At :569 and :573 it calls setZoom(15) then setZoom(12), but :580 only asserts clusters>0 at the end. With the old stale listener, React's currentZoom stays frozen at 12, so the previously rendered clusters satisfy the final assertion even though zoom handling is broken.

Actual diagnostic result on **3a43515**, after bypassing only its fatal FE1 Map construction with that old frontend's existing test-init event:

```text
FAIL [TC-COLD-04] PlaceAutocompleteElement constructed with includedRegionCodes: ["vn"] and Hanoi locationBias
FAIL [TC-COLD-08] Toggling ON fetches /v1/venues/map with bounding box ...
PASS [TC-COLD-10] ... pre-reset -> Clusters at zoom 12: 2
PASS [TC-COLD-11] Map zoom and idle listeners survive session reset ... -> Clusters after reset: 2
```

This diagnostic does not count as a cold-load pass; it isolates the downstream assertion that the primary old run cannot reach. Current application N3 is closed by my stronger independent probe, but TC-COLD-11 alone is not a fail-before regression for it.

Suggested fix: enter reset with individual markers at zoom 15, then require new clusters at zoom 12; or explicitly assert zero clusters/individual markers at the intermediate zoom 15 after reset before asserting clusters at 12. Verify that exact assertion fails on the old implementation.

Related test-title limits: TC-COLD-09 (:519–524) checks only marker removal, not an in-flight abort; the own held-request probe above supplies that evidence. `qa/e2e/browser_flow.mjs:161` accepts zero markers when unavailableBanner is present despite saying “markers visible”; treat that as unavailable-state coverage, not working-map marker coverage.

## Fail-before / pass-after: FE1, FE4 and N3

Ran the unmodified current cold script against both production builds. On **3a43515** it records the SDK request/importLibrary, then stops at `timeout waiting for Map construction`; on **045db0e** it completes **14/14**. The new script is therefore no longer the old test-local constructor/generation simulation. Its early fatal wait does, however, prevent later assertions from being evaluated on the untouched pre-fix run.

| Target | Pre-fix evidence | Current evidence | Test sensitivity conclusion |
| --- | --- | --- | --- |
| FE1 cold Map | Supplied script fatal timeout; own cold probe mapConstructors=0, banner present | Supplied TC-COLD-03 passes; own Map count 1, banner absent | Meaningful fail-before/pass-after. |
| FE4 cold Places | Own cold probe autocompleteConstructors=0; downstream diagnostic TC-COLD-04 explicitly FAILS | Own constructor count 1; supplied TC-COLD-04 passes | Meaningful; untouched old script cannot reach TC-COLD-04 because FE1 aborts first. |
| N3 reset zoom | Own old probe begins reset at zoom 15: zoom 12 afterwards has 0 clusters, 12 individuals | Same sequence on current: 2 clusters, 1 individual | Own probe is meaningful. Supplied TC-COLD-11 passes old frozen-12 state when reached, so its assertion still has the F2 gap. |

Pre-fix own measurements (the old map was forced ready only **after** recording the failed genuine cold path, to isolate later behavior):

```json
{"probe":"cold_bootstrap","scriptLoads":1,"mapConstructors":0,"autocompleteConstructors":0,"unavailableBanner":true,"automaticGeolocations":0}
{"probe":"cluster_before_reset","zoom":12,"clusters":2}
{"probe":"cluster_after_reset","zoom":12,"clusters":0,"individuals":12}
```

The diagnostic copy of the supplied test additionally stops after TC-COLD-11 to avoid unrelated later failures; it uses the same original assertion conditions and no frontend edit. Primary before/after runs used the unmodified script.

## Other final-diff checks

Names/place labels still render as string attributes or React text. Injected HTML-looking names created no img element and executed no handler. Warnings containing markup stayed literal. A synthetic tour response with one provider_route leg and two estimated legs deliberately carrying geometry produced exactly one active polyline and a visible unchanged warning.

```json
{"probe":"marker_label_xss","executed":false,"htmlImage":false,"literal":true}
{"probe":"provider_geometry_and_warning","activePolylines":1,"warningVisible":true,"warningHtml":false,"browserKeyInStorage":false,"browserKeyInPageUrl":false}
{"probe":"network","osmRequests":0}
```

No new dependency, OSM renderer or server-key reference was introduced in the final frontend diff. Public browser keys use the intended Google script query; they were absent from the app URL, local/session storage and captured application console. Source and production build scans confirm the old app test hooks/fake-key fallback are gone. The revised privacy flow and minimized Gemini prior from ced11e9 remain unchanged; this task uses no real location or provider credentials. Free-form user chat is not covered by the structured-origin minimization guarantee.

## Commands and actual results

Context file outside Git: `$env:TEMP/foodtour-ph4-final-context.json` contains current/pre paths and owned process IDs. Created a clean current frontend copy excluding node_modules/.next/.env, copied current qa/e2e to both scratch trees, installed/built current, and served both with dedicated loopback APIs. The pre-fix build's compiled API URL remains 18174; current was built for 18197.

```powershell
$ctx=Get-Content "$env:TEMP/foodtour-ph4-final-context.json" | ConvertFrom-Json
Push-Location -LiteralPath (Join-Path $ctx.current 'frontend')
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18197'
$env:NEXT_TELEMETRY_DISABLED='1'
npm.cmd ci
npm.cmd run build
npm.cmd test
Pop-Location
Push-Location -LiteralPath $ctx.current
$env:WEB_URL='http://127.0.0.1:13197'; $env:CDP_PORT='9364'
node qa/e2e/test_cold_bootstrap.mjs
node qa/e2e/test_components.mjs
$env:CDP_PORT='9365'; node independent.cdp.mjs
$env:CDP_PORT='9366'; node test-hook.cdp.mjs
$env:CDP_PORT='9370'; node unsaved-reset.cdp.mjs
node qa/e2e/test_api_scenarios.mjs
Pop-Location
Push-Location -LiteralPath $ctx.pre
$env:WEB_URL='http://127.0.0.1:13174'; $env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18174'
$env:CDP_PORT='9367'; node qa/e2e/test_cold_bootstrap.mjs
$env:CDP_PORT='9368'; node final-independent-before.mjs
$env:CDP_PORT='9369'; node qa/e2e/cold_downstream_diagnostic.mjs
Pop-Location
./.venv/Scripts/python.exe scripts/run_unittests.py
./.venv/Scripts/python.exe tools/export_openapi.py --check
```

Actual outputs/summaries:

```text
NPM_CI_EXIT=0
Next.js 15.5.28
Compiled successfully in 2.9s
BUILD_EXIT=0
ALL 15 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
NPM_TEST_EXIT=0
COLD-BOOTSTRAP SUMMARY: 14/14 PASSED
COLD_EXIT=0
COMPONENT TESTS SUMMARY: 15/15 PASSED
COMPONENTS_EXIT=0
QA-01 TEST SUMMARY: 36/36 PASSED
API_E2E_EXIT=0
OWN_CDP_EXIT=0
HOOK_EXIT=0
UNSAVED_PROBE_EXIT=0

Pre-fix unmodified cold suite:
Fatal error in real-browser suite: Error: timeout waiting for Map construction
BEFORE_COLD_EXIT=1
BEFORE_OWN_EXIT=0
DIAGNOSTIC_EXIT=1

Ran 211 tests in 17.939s
OK (skipped=1)
BACKEND_EXIT=0
OpenAPI matches server schema
```

Probe exit 0 means measurements completed; the true old-origin persistence booleans are the failing application behavior. The pre-fix failures are intentional regression evidence. Backend's one skip remains the documented legacy private-data source assertion. Existing TestClient deprecation and npm's locked-dependency audit notice (2 vulnerabilities: 1 moderate, 1 high) remain; no dependency changes were made. I did not independently rerun browser_flow in this task; the production ready-map, reset, keyboard-input and cancellation interactions above are my own CDP probes, and the coordinator's separate 28/28 result is not presented as my run.

No live Google credentials, real-device geolocation or vendor billing behavior were validated. All doubles/probes/logs are in scratch, and the human's server processes were left alone. F1 needs a form-state reset fix; F2 needs a genuinely sensitive N3 regression assertion. Claude remains the merge reviewer.

All four owned scratch API/web server processes were stopped after verification.
