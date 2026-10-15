# Phase-4 frontend re-verification

Reviewer: Codex. Review owner: Claude. Date: 2026-10-15.

**Recommendation: MERGE-AFTER-FIXES.** FE1–FE5 are closed for their reported failures; FE6 is **partial** because a pending place response can still cross a real session reset. Blocking follow-ups are N1 (reset isolation), N2 (stuck origin-loading state), N3 (zoom/clustering after reset), and N4 (gate/remove production test hooks). The supplied new tests also have the fail-before gaps detailed below; green suite totals alone do not close these items.

## Revision and isolation

Merged coordinator first to **b4f9c2b**, including Claude's LLM-prior privacy fix **ced11e9**, board **9cdd0bc**, and Antigravity's FE1–FE6 fix. Compared the same new test files against **3a43515** and **b4f9c2b**. Codex changed only this report.

Current scratch copy: `C:/Users/tuana/AppData/Local/Temp/foodtour-ph4-rereview-fzn1u2ao` (also `$ctx.current` in the commands below). Pre-fix copy reused the previous isolated `foodtour-ph4-review-ut9v3o3k` tree; its MapView source was checked byte-content-equivalent after newline normalization to `git show 3a43515:frontend/app/components/MapView.jsx` before running current tests against it. A final comparison of all 18 tracked frontend files against that commit found 0 mismatches. Its frontend source was unchanged; current qa/e2e files were copied into its scratch qa directory. The current copy excluded node_modules/.next/.env and installed/built afresh. The human's 3000/8000 servers and shared frontend/.next were untouched.

Owned test services used API 127.0.0.1:18185, scratch production Next server 127.0.0.1:13185, and headless Edge/CDP 9361–9363. Backend configuration used labelled synthetic data, mock extraction, estimated routing, no DB/evidence overlay and empty Google keys. Independent SDK probes intercepted script insertion with the actual bootstrap callback/importLibrary shape; they did not pre-install Google classes on window.google.maps or set the app's test flag, except in the separate explicit production-hook test. Google resource hosts were blocked in CDP. No live credentials or private venue data were used.

## FE1–FE6 closure

| Finding | Status | Independent evidence / current source |
| --- | --- | --- |
| FE1 cold Map cannot construct | **Closed** | From a page with no window.google: one bootstrap load and one actual Map construction, unavailable banner absent. MapView.jsx:118 now reads the maps library before extracting Map. |
| FE2 viewport bbox / debounce / abort / online-only | **Closed on tested paths** | Exactly one /venues/map request with all bbox values and AbortSignal; 11 physical markers instead of the old 12 including an online-only item. Three immediate idle events generated zero requests at 150ms and one by the end of the 400ms debounce; OFF aborted a held in-flight request and removed all markers. MapView.jsx:315–437 implements bounds/idle/debounce/cancellation. N3 is a separate reset-related clustering problem. |
| FE3 real-mode synthetic fallback | **Closed** | Offline real-mode helper throws provider_unavailable after one request; aborted helper throws AbortError after one request. Neither returns items or calls /v1/venues. api.js:1072 now directly returns safeFetch; fixture generation remains in explicit mock branch. |
| FE4 cold PlaceAutocomplete construction | **Closed** | One actual PlaceAutocompleteElement constructed on the first cold page, using the shared loader. PreferencesPanel.jsx:108–137 loads the places library, uses VN region/Hanoi bias, and sets its accessible name. |
| FE5 privacy disclosure / precise origin in prior | **Closed for structured origin flow** | New text at PreferencesPanel.jsx:663–675 discloses server TTL/SQLite, Save Preferences, candidate/stop coordinates sent to Routes and browser-vendor location behavior. Own Save Preferences + authenticated GET retained origin in the TTL session. Captured LLM prior has no origin object, coordinate values or current-location label; only origin_set. Backend provider.py:173 uses the ced11e9 minimized prior. |
| FE6 stale place overwrites newer origin | **Partial** | Normal A-slow/B-fast race is fixed: LATEST PLACE remains after A resolves. But a slow result resolved while a new-session POST is held still applies and persists into the new session (N1). Superseding geolocation also leaves loading stuck (N2). |

Privacy qualification: ced11e9 minimizes structured prior preferences, not the user's raw chat. The absolute phrase “GPS coordinates never go to Gemini” should be scoped to automatically attached origin preferences; a user can explicitly type coordinates into chat. Named place/geocoded labels still may enter prior by design. The tested current-location label and numeric origin do not.

Actual independent browser measurements:

```json
{"probe":"cold_bootstrap","scriptLoads":1,"mapConstructors":1,"autocompleteConstructors":1,"unavailableBanner":false,"automaticGeolocations":0}
{"probe":"venue_fetch","requests":[{"mapEndpoint":true,"hasBbox":true,"hasSignal":true}],"markers":11}
{"probe":"cluster_before_reset","zoom":12,"clusters":2}
{"probe":"debounce_early","extraRequests":0}
{"probe":"viewport_refresh","requestsAfterPan":2,"hasIdleListener":true,"hasBoundsListener":false}
{"probe":"toggle_off","pressed":"false","markers":0,"autocompleteConstructors":1,"abortedPending":1}
{"probe":"marker_label_xss","executed":false,"htmlImage":false,"literal":true}
{"probe":"provider_geometry_and_warning","activePolylines":1,"warningVisible":true,"warningHtml":false,"browserKeyInStorage":false,"browserKeyInPageUrl":false}
{"probe":"autocomplete_out_of_order","latestBefore":true,"oldOverridesLatest":false}
{"probe":"place_during_session_reset","staleAppliedDuringReset":true,"stalePersistsAfterReset":true}
{"probe":"cancelled_geolocation","buttonStillDisabled":true,"stillLoading":true}
{"probe":"cluster_after_reset","zoom":12,"clusters":0,"individuals":11}
{"probe":"network","osmRequests":0}
```

Actual helper/backend privacy measurements:

```json
{"probe":"offline","calls":1,"returned":false,"error":"provider_unavailable"}
{"probe":"abort","calls":1,"returned":false,"error":"AbortError"}
{"probe":"clustering","input":100,"represented":100,"highZoom":100}
{"probe":"llm_prior_privacy","has_origin_object":false,"precise_values_present":false,"current_location_label_present":false,"origin_set":true}
{"probe":"save_location","saved_status":200,"read_status":200,"origin_retained":true,"ttl_bounded":true}
```

## Remaining findings

### N1 — HIGH, blocking — pending place result crosses session reset

Evidence: PreferencesPanel.jsx:73–91 synchronizes preference fields but does not invalidate originGenerationRef on a session change. The generation is invalidated on unmount (:64–70) and clientConfig effect cleanup (:180–182), while page.js:204 starts session reset immediately and only fetches/replaces clientConfig after creating a new server session. The component remains mounted through reset.

Real-browser failing sequence: dispatch a gmp-select whose fetchFields is deferred; click “Tạo phiên mới”; hold the new-session POST response so config cleanup cannot yet run; resolve the old place request; release session creation. `STALE AFTER RESET` appeared during the reset and was still selected after it completed. No test-local generation simulation was used.

Fix: give PreferencesPanel an explicit session/reset generation from the parent and invalidate all origin requests immediately when reset begins, before awaiting session creation. Clear/reset local origin form state even if the parent default-preferences object has the same identity. Cancel manual geocoding, clear request busy flags, and guard every completion against that session generation. Add this real reset-timing case to a component/browser test.

### N2 — MEDIUM, blocking — superseded origin lookup leaves controls disabled

Evidence: PreferencesPanel.jsx:209 and :220 return on a stale geolocation generation **before** setGeoLoading(false). Preset/manual changes increment the generation (:292, :613, :633) but do not reset that loading flag. Manual geocode has a related conditional finally at :274–275; invalidating its generation can also prevent cleanup of geocodingLoading.

Own browser sequence: click Current Location with its callback deferred; select another preset; deliver the old success callback. The old coordinates are correctly ignored, but the Current Location button remains disabled and says it is still locating. It cannot be used again in that page state.

Fix: centralize origin-request invalidation to cancel owned requests and clear their loading indicators; use per-operation ownership so a stale operation cannot clear a newer operation's spinner. Cover supersede/reset/error completions for geolocation and manual geocoding.

### N3 — MEDIUM, blocking — clustering stops following zoom after new session

Evidence: MapView.jsx:143 registers zoom_changed only inside the “create a new map” block. Its callback captures the initialization effect's active variable. Client-config changes on reset run cleanup (:177), setting that variable false, but the reused map never receives a replacement zoom listener. The old listener also is not removed.

Own Edge probe: before reset, zoom 12 creates 2 clusters; after reset, the same map at zoom 12 shows **0 clusters and 11 individual markers**. The pure clusterer count-conservation probe still passes; this is the map/listener lifecycle, not the arithmetic function.

Fix: manage the zoom listener independently of per-session client-config identity, remove it on cleanup, and reattach when reusing a map. Test low/high zoom before and after reset and config retry. Avoid leaving dead callbacks attached to the map.

### N4 — MEDIUM, blocking — production global test hook can load Google with TEST_KEY

Evidence: MapView.jsx:99–119 and PreferencesPanel.jsx:99–110 accept window.__TEST_FAKE_GOOGLE_MAPS__ as an unguarded configuration bypass and pass literal TEST_KEY when runtime config has no browser key. Both register the test-init event in production. There is no production-build exclusion.

Own probe against the **next build / next start** bundle, backend keys absent: set only that global flag before load, intercept script insertion, and observe the loader preparing an official Google script URL whose key is TEST_KEY. The fake key did not appear in storage, the page URL or captured application console output. The request was intercepted/blocked, not sent to Google.

```json
{"probe":"production_test_hook","fakeKeyLoaderReachable":true,"browserKeyInStorage":false,"fakeKeyInAppUrl":false}
{"probe":"console_key_scan","fakeKeyLogged":false}
```

This is a client configuration/test-boundary defect, not server authentication bypass or secret exfiltration. Fix: remove the magic fallback and test branches from production. If a development seam is retained, statically gate it outside production and require an already-installed fake SDK so it can never initiate a network load with a fake key. Production browser tests can intercept client-config and the SDK script while exercising the normal loader, as this review's cold probe does.

### N5 — MEDIUM, verification gap — new cold tests mostly pass the broken pre-fix frontend

Evidence and exact assertions are in the fail-before section below. Tests :303–367 instantiate fake Map/Places directly in the test; :379–413 reimplement a generation guard locally; :425 onward extracts bounds from the fake map directly. They never mount MapView/PreferencesPanel. They therefore prove neither cold consumer correctness, UI cancellation, nor real reset isolation. Replace simulations with actual component effects or CDP interactions; keep helper tests as helper tests with accurate names.

## Required fail-before / pass-after comparison

Copied the **same current** qa/e2e/test_cold_bootstrap.mjs and test_components.mjs into both scratch trees; frontend code stayed at its respective revision. Ran the unmodified scripts first.

| New/updated assertion | Pre-fix 3a43515 | Current b4f9c2b | Meaning |
| --- | --- | --- | --- |
| TC-COLD-01–04 environment/bootstrap/loader dictionary | All PASS | All PASS | Baseline loader already had this behavior. Under the requested fail-before criterion, vacuous as regression gates for these fixes; useful helper checks only. |
| TC-COLD-05–10 consumer constructors, Map/marker/Places | All PASS | All PASS | Vacuous for FE1/FE4: constructors are extracted/instantiated by test code, not by the broken consumer components. |
| TC-COLD-11–12 selection race/reset | Both PASS | Both PASS | Vacuous for FE6: test-local simulatePlaceSelection implements its own originGen; neither frontend is exercised. |
| TC-COLD-13 bbox extraction | PASS | PASS | Vacuous for FE2: reads the fake map directly, not MapView's request. |
| TC-COLD-14 AbortError | **FAIL**, script exit 1 | **PASS**, 14/14, exit 0 | Meaningful helper regression for FE3. It starts with an already-aborted signal; despite its title it does not test cancelling an in-flight UI request. Own browser probe above covers that. |
| TC-DOM-11 address input label association | **FAIL**, script exit 1 | **PASS** | Meaningful markup regression. |
| TC-DOM-12 privacy disclosure | Not reached by original fail-fast pre-fix run; **FAIL** in diagnostic continuation | **PASS**, component summary 15/15 | Distinguishes markup versions, but checks headings/test ID rather than actual truth of the disclosure. Own backend/data-flow probes are needed for FE5. |

To observe the pre-fix privacy assertion after TC-DOM-11 failed, made a **scratch-only diagnostic copy** of test_components.mjs that removes the throw in record while leaving every assertion condition unchanged. It produced **13/15 passed**, failing TC-DOM-11 and TC-DOM-12. This was not substituted for the primary unmodified test result. No repository test was edited.

Actual before output excerpts:

```text
PASS [TC-COLD-01] ...
... TC-COLD-02 through TC-COLD-13 also PASS ...
FAIL [TC-COLD-14] In-flight cancellation cleanly throws AbortError without fallback to synthetic
BEFORE_COLD_EXIT=1

FAIL [TC-DOM-11] PreferencesPanel connects form labels and controls with htmlFor and id
BEFORE_COMPONENTS_EXIT=1

Diagnostic continuation only:
FAIL [TC-DOM-11] PreferencesPanel connects form labels and controls with htmlFor and id
FAIL [TC-DOM-12] PreferencesPanel privacy disclosure renders accurate Phase 4 data flows
COMPONENT TESTS SUMMARY: 13/15 PASSED
```

Actual current output:

```text
COLD-BOOTSTRAP SUMMARY: 14/14 PASSED
AFTER_COLD_EXIT=0
COMPONENT TESTS SUMMARY: 15/15 PASSED
AFTER_COMPONENTS_EXIT=0
```

## Other security / rendering checks

No venue-name InfoWindow concatenation was introduced. An HTML-looking venue name in the actual marker selection card remained literal text, with no img element or executed handler. Warnings with embedded markup remained literal React text. One provider_route leg plus two estimated legs carrying deliberate test geometry produced exactly one active polyline and a visible unchanged warning.

No server key is referenced by the frontend. Normal runtime browser keys come from client-config and were absent from app URL/storage; only the intended Google bootstrap query carries the restricted browser key. Application warnings now use fixed messages rather than raw provider exceptions. N4 is the separate fake-key fallback issue. No OSM/tile request appeared in the independent Network.requestWillBeSent scan (count 0), and there is no OSM renderer in current source.

The pure grid clusterer conserved 100 inputs and produced 100 individuals at high zoom; low-zoom centers/counts remain consistent with the prior probe. N3 prevents the UI from invoking it with the current zoom after reset. Native toggle aria-pressed, marker keyboard handlers and normal replace-dialog behavior remain intact in the supplied browser flow.

## Commands and actual verification

Context file outside Git: `$env:TEMP/foodtour-ph4-rereview-context.json` holds pre/current paths. Google test doubles/probes and their logs are in those scratch directories, not repository files.

```powershell
$ctx=Get-Content "$env:TEMP/foodtour-ph4-rereview-context.json" | ConvertFrom-Json
Push-Location -LiteralPath $ctx.pre
node qa/e2e/test_cold_bootstrap.mjs
node qa/e2e/test_components.mjs
node qa/e2e/components_diagnostic.mjs  # diagnostic continuation only
Pop-Location
Push-Location -LiteralPath (Join-Path $ctx.current 'frontend')
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18185'
$env:NEXT_TELEMETRY_DISABLED='1'
npm.cmd ci
npm.cmd run build
npm.cmd test
Pop-Location
Push-Location -LiteralPath $ctx.current
node qa/e2e/test_cold_bootstrap.mjs
node qa/e2e/test_components.mjs
$env:WEB_URL='http://127.0.0.1:13185'
$env:CDP_PORT='9361'
node independent.cdp.mjs
$env:CDP_PORT='9362'
node test-hook.cdp.mjs
node api-recheck.mjs
$env:CDP_PORT='9363'
node qa/e2e/test_api_scenarios.mjs
node qa/e2e/browser_flow.mjs
Pop-Location
```

Owned API started with `.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18185`; scratch Next with `node frontend/node_modules/next/dist/bin/next start -p 13185 --hostname 127.0.0.1` from its frontend directory. Both readiness checks returned HTTP 200. No .env was copied or loaded into test services. New backend privacy probes used a capturing ExtractionProvider and TestClient; only booleans/statuses were printed, never origin coordinates, labels, tokens or bodies.

```text
NPM_CI_EXIT=0
BUILD_EXIT=0
ALL 15 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
NPM_TEST_EXIT=0
API_E2E_EXIT=0
BROWSER FLOW SUMMARY: 28/28 passed
BROWSER_EXIT=0
CDP_EXIT=0
HOOK_PROBE_EXIT=0
```

npm ci retained the locked dependencies and reported the existing 2 vulnerabilities (1 moderate, 1 high); no upgrade or audit-fix was performed. The new cold test prints its own hardcoded dummy-key script URL and public test coordinates; this report omits those unnecessary values. Independent probes print only aggregate/boolean measurements. Probe exit 0 means measurement completed, not that the failing N1–N4 behaviors pass the gate.

Live Google credentials/referrer restrictions, actual Places/Routes service behavior and real-device geolocation were not tested. All frontend source/builds stayed in scratch. Claude should route N1–N4 and real-component regression coverage back to Antigravity, then request narrow independent verification before accepting the phase-4 frontend.

Both owned review servers were stopped after verification; scratch artifacts remain outside Git for reviewer inspection.
