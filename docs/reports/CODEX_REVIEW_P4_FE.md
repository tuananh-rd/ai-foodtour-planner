# Independent phase-4 frontend gate

Author/reviewer: Codex. Review owner: Claude. Date: 2026-10-15.

**Recommendation: MERGE-AFTER-FIXES. Blocking items: FE1–FE6 below.** The previously reported Claude findings P4-R1–P4-R5 are closed for their original failing inputs, but the integrated frontend does not yet satisfy the phase-4 map/location gate. All supplied suites pass; independent cold-start, API-failure and asynchronous-selection probes expose gaps those suites miss.

## Reviewed revision and isolation

Merged `foodtour-claude-coordinator` first, advancing to **3a4351522b771fd5b8756eaed075d315a97955e0**. Reviewed `git diff 3a43515^1..3a43515 -- frontend qa` (Antigravity **537a26e / a03a5ad**), Claude fix **1fc3880365e7353070f43ae74446888de214247c**, and the integrated backend **3e6c0a3 / 3e33c9c**. Read current contract v1.5 and docs/PHASE4.md data-transfer table.

All npm installation/build/test and e2e scripts ran in a scratch copy outside the repository: `C:/Users/tuana/AppData/Local/Temp/foodtour-ph4-review-ut9v3o3k`. Copy excluded node_modules, .next and .env files; frontend/ and qa/e2e/ retained their relative layout. A new synthetic-only API ran on 127.0.0.1:18174, the scratch production frontend on 127.0.0.1:13174, and headless Edge used separate profiles/CDP ports 9359/9360. The human's ports 3000/8000 and shared frontend/.next were untouched. Only this report is changed by this task.

## First gate — Claude P4-R1 through P4-R5

Own probes used stub model dictionaries through the real GeminiExtractionProvider/LLMExtractor, not just Claude's tests. No provider credentials were used.

| Prior finding | Status against 1fc3880 | Reused failing input / observed result | Evidence |
| --- | --- | --- | --- |
| P4-R1 raw model coordinates and claimed landmark source | **Closed** | Same invented in-box origin object + origin_source=landmark + origin_label, without a valid origin_landmark: origin now absent; rejected origin and unknown_field. | backend/app/llm/provider.py:123, :137, :153, :186; backend/app/providers/gemini.py:169. Default LLMExtractor refuses raw origins; explicit allow_raw_origin is reserved for trusted callers. |
| P4-R2 place absent from current user input | **Closed** | Model origin_text='Invented place not in input', user text='an quanh mot noi trong 2 gio': origin_text now absent, rejected origin_text. | backend/app/llm/provider.py:69, :161, :200. Both free-text and landmark paths are grounded against cleaned input. |
| P4-R3 unsupported all-day opening claim | **Closed for reported input** | 'Goi y co dieu kien: tat ca quan mo suot ngay.' on a conditional tour with unknown hours: opening_claim is now reported. | backend/app/llm/explain.py:144–148. This remains a linguistic blacklist, not proof that every possible paraphrase is supported. |
| P4-R4 eval accepts expected substring plus invented extra place | **Closed** | Expected 'dong xuan', actual 'dong xuan; then invent another place': now reports not exactly the expected place. Rules-only eval also explicitly counts skipped LLM-only scenarios. | qa/eval/run_eval.py:46–55, :80, :142. |
| P4-R5 Unicode control accepted by extraction | **Closed** | origin_text containing U+200B, even present in the user input: rejected origin_text. Direct model origin labels/sources are no longer accepted. | backend/app/llm/provider.py:58–66, :119. |

Actual aggregate probe output:

```json
{"probe": "R1", "origin_accepted": false, "rejected": ["origin", "unknown_field"]}
{"probe": "R2", "accepted": false, "rejected": ["origin_text"]}
{"probe": "R3", "checker_problems": ["opening_claim", "opening_claim"]}
{"probe": "R4", "checker_problems": ["origin_text present but is not exactly the expected place"]}
{"probe": "R5", "accepted": false, "rejected": ["origin_text"]}
```

Also ran the LLM/provider regression modules myself:

```powershell
$env:PYTHONPATH='backend'
./.venv/Scripts/python.exe -m unittest backend.tests.planner.test_llm_provider backend.tests.providers.test_phase3 -q
```

```text
Ran 41 tests in 3.666s
OK
LLM_TESTS_EXIT=0
```

## Frontend findings, ranked

### FE1 — HIGH, blocking — first Google Maps load cannot construct a map

**Evidence:** frontend/app/components/MapView.jsx:142 destructures `{ Map }` from loadGoogleMaps, then :152 executes new Map. frontend/lib/googleMapsLoader.js:136–142 returns a library dictionary `{maps: {Map, ...}, marker: {...}, places: {...}}`; its existing-loaded path at :108–114 has the same nested shape. MapView's separate already-loaded-SDK branch at :99 works, masking the mismatch in tests.

**Failure:** open a clean page with ready client-config and successfully load the Google library. The returned top-level Map is undefined; map construction throws and the UI reports unavailable. My Edge/CDP probe intercepted the bootstrap script, supplied a documented-shape fake importLibrary implementation and completed the bootstrap callback: one script load, **zero map constructors**, unavailable banner. No real Maps key was needed.

**Fix:** explicitly use the maps library from the returned bundle, or standardize the loader's return contract and all callers. Add a browser test that begins without window.google, loads through the actual loader and asserts a constructed visible map. Do not rely solely on a test event that skips the cold path.

### FE2 — HIGH, blocking — restaurant fetching does not use the viewport or abort, and displays an online-only venue

**Evidence:** MapView.jsx:344 calls getVenuesMap({limit:500}) without min/max lat/lon or a signal. The effect at :332–360 depends only on showVenues; there is no idle/bounds_changed fetch listener. frontend/lib/api.js:1065–1084 sends the incomplete bbox request, then retries the unrelated legacy list; :1088 filters only geo_status and retains online_only records.

**Failure:** toggle restaurants ON. The integrated API correctly returns 422 for the missing bbox; the client silently loads the first legacy page instead. Pan anywhere: there is no new viewport request. In the synthetic dataset, the fallback produced **12 markers including 1 online-only venue**, while the actual bbox endpoint returned **11 physical venues**. OFF removes rendered markers (passes), but the fetch has no AbortController and cleanup only sets active=false; it does not stop in-flight requests.

**Fix:** obtain current map bounds, debounce idle/viewport changes, pass all four bbox values and a fresh AbortSignal, cancel on OFF/unmount/new viewport, and guard latest response application. Consume the real endpoint's total/truncated/provenance. Do not substitute a city-wide legacy page for a failed bbox request. If compatibility fallback is retained deliberately, it must enforce the exact bbox, physical/geo rules and correct pagination metadata.

### FE3 — HIGH, blocking — real mode silently fabricates map records after errors or cancellation

**Evidence:** frontend/lib/api.js:1078–1122 catches every map/legacy failure, including AbortError and 429, and returns SYNTHETIC_VENUES while isMockMode remains false. MapView.jsx:344–347 consumes items/truncated only, ignoring dataset_source/version. The selected-venue card has no dedicated synthetic badge and the page's dataset banner still describes the parent session dataset, not this substituted map data.

**Failure:** with real mode enabled, reject both fetches; getVenuesMap returns eight synthetic records even for limit=1 and a bbox excluding Hanoi. The fallback also hardcodes total_in_view=5 while returning eight items. Abort the request: it returns synthetic success rather than cancellation. A private/live session can therefore show fabricated restaurant pins without an explicit mode switch or map-level provenance warning.

**Fix:** propagate cancellation immediately; show labelled map-data unavailable/rate-limit/error states in real mode and return no substituted records. Synthetic fixture generation must be confined to explicit mock mode. Preserve server count/bbox/limit semantics and expose the current map dataset provenance independently if needed.

### FE4 — HIGH, blocking — Autocomplete misses library readiness on a clean page

**Evidence:** frontend/app/components/PreferencesPanel.jsx:79–128 only initializes when window.google.maps.importLibrary already exists and retries only when clientConfig changes. The sibling MapView initiates SDK loading after that same clientConfig update. The shared Maps library completing does not notify the preferences effect.

**Failure:** in the clean bootstrap probe, the library loaded and the MapView test re-init could later create a map, yet **zero PlaceAutocompleteElement constructors** ran. The widget appeared only after an unrelated new-session/config cycle, when the global SDK was already present. Even fixing FE1's Map destructuring alone does not establish this readiness handoff.

**Fix:** share an awaited loader/readiness promise (using the correct library bundle contract) or explicitly load/await the places library from this component when config is ready. Show a labelled unavailable/retry state instead of leaving a blank autocomplete container. Add a cold-load widget test; use the current documented includedRegionCodes=['vn'] and Hanoi locationBias/restriction to avoid worldwide IP-biased suggestions for this Hanoi-only UI.

### FE5 — HIGH, blocking — location privacy statement contradicts actual storage and transfers

**Evidence:** PreferencesPanel.jsx:577 says current location is stored only in the browser, and origin coordinates are sent to routing only when the user clicks plan. However :241–247 puts the coordinates into the full preference payload; :260–264 sends that payload on Save Preferences as well. The backend session store retains preferences under TTL and optionally in SQLite. With Gemini enabled, backend/app/llm/provider.py:173–184 includes prior origin in the extraction request. Planning/replacing sends origin **and candidate/stop coordinates** to Routes, as docs/PHASE4.md explains.

**Failure:** click Current Location, then Save Preferences. Exact six-decimal origin coordinates leave the browser and are stored in the server session even though no plan was requested. A later chat can send prior preferences to Gemini; that is not limited to a plan-button action.

**Fix:** replace the browser-only/plan-only guarantee with accurate, visible text: origin is sent to the backend and retained in its TTL session (SQLite when enabled); configured Gemini can receive chat/prior preferences; Google Routes receives origin plus candidate/stop coordinates for planning/replacement; address text goes to the appropriate Google search/geocode service. Distinguish venue identities/list uploads from routing coordinates. Match the approved phase-4 data-transfer table and any required consent interaction.

### FE6 — MEDIUM, blocking — a stale Place Details response overwrites the user's newer origin

**Evidence:** PreferencesPanel.jsx:94–110 awaits place.fetchFields then unconditionally changes origin coordinates/label/source. It never checks the effect's active flag after that await and has no per-selection generation guard. Cleanup at :126–128 does not remove the listener or invalidate an in-flight selection. Manual geocoding and geolocation also lack a common origin-selection generation.

**Failure:** dispatch selection A with a delayed fetchFields; dispatch B and resolve it immediately; then resolve A. Own Edge probe first saw LATEST PLACE, then **OLD SLOW PLACE replaced it**. The same callback can outlive widget replacement/session reset because this preferences component persists.

**Fix:** use a selection/session generation token, invalidate it on each origin action/reset/unmount, and check it after every async completion before applying origin state. Remove old listeners/widgets. Cancel manual-geocode fetches where supported; do not assume Place.fetchFields supports an AbortSignal. Add out-of-order and reset-during-request browser cases.

## Other reviewed areas and limits

- **Official Places usage:** re-read [Place Autocomplete Widget documentation](https://developers.google.com/maps/documentation/javascript/place-autocomplete-new) on 2026-10-15, including current gmp-select example and automatic widget-session management. The code correctly uses PlaceAutocompleteElement, placePrediction.toPlace(), and fetchFields with displayName/formattedAddress/location. No manual Google session token is required for the widget; app session authentication remains in X-Session-Token for the server geocode endpoint. FE4/FE6 are lifecycle bugs, not obsolete event naming.
- **API keys:** only client-config's browser key is used. No server-key environment reference, build-time Maps key, key persistence, or app-auth token in the Maps loader was found. Own DOM probe found no browser key in localStorage/sessionStorage or the page URL. The restricted browser key is necessarily present in the official Google bootstrap script query at googleMapsLoader.js:67; that is the intended public browser-key transport, not a server-secret leak. Application code does not explicitly print a key. Raw third-party errors are passed to console.warn at MapView.jsx:320/:349/:466 and PreferencesPanel.jsx:113; replace these with fixed diagnostic codes to avoid relying on third-party error strings staying free of URL/query details. Live Google internal console output was not validated.
- **XSS:** names/place labels are assigned as string properties/attributes or rendered as React text. The marker innerHTML templates interpolate static styles and contract numeric order/count values, not venue names. Injecting an HTML-looking venue name created no image and executed no handler; its selected-card text remained literal. Walking warning markup also stayed literal. No InfoWindow HTML concatenation exists. Existing outbound venue links retain rel protections; this diff introduces no target=_blank link.
- **Routes/warnings:** an injected synthetic response with one provider_route leg and two estimated legs (all carrying geometry deliberately) created exactly **one active polyline**. The walking warning appeared unchanged next to the map, with embedded markup treated as text. Estimated legs were not drawn; no OSM implementation remains. Real Google geometry/key authorization is not established by these fakes.
- **Geolocation:** explicit click-only call confirmed; cold load made zero geolocation calls. Code has denied/unavailable/timeout/insecure-context branches; supplied Edge flow exercised denied and retained manual entry. Successful coordinates are rounded to six decimals before state/payload, displayed to four decimals, and are not stored by frontend localStorage. Server retention/disclosure is FE5. Late-result behavior needs the FE6 generation guard across origin inputs.
- **Toggle/clustering:** default OFF and aria-pressed pass. OFF removes markers; network cancellation fails FE2. Own clustering probe conserved 100 inputs in one low-zoom bucket, with center inside its bounds, and returned 100 individuals at zoom 15. The local grid is an approximation rather than an exact pixel-radius Google projection algorithm; no added dependency is involved.
- **Accessibility:** toggle is a native button; restaurant/cluster pins expose role/button/tabindex, labels, and Enter/Space handlers. Existing replace-dialog keyboard checks pass on mobile/desktop. Manual latitude/longitude have label associations; address search input :407 relies on placeholder instead of a persistent label—add a visible label. No live Google-widget keyboard/screen-reader validation was performed; FE4 prevents normal first-load use.
- **Dependencies:** no package.json/package-lock additions in the reviewed diff. npm ci's existing audit reported 2 vulnerabilities (1 moderate, 1 high); no upgrade/audit-fix was attempted. The local grid implementation adds no package. Review dependency remediation separately from these functional findings.

## Independent probe evidence

The cold-load CDP probe starts with no window.google, serves a synthetic ready client-config, intercepts the Google script insertion, installs a documented-shape fake SDK, and resolves its bootstrap callback. Final probes block Google API/static resource hosts via CDP. After recording the genuine cold-path failure, the probe explicitly invokes the test-only already-loaded-SDK event to inspect later marker/render behavior. That forced branch is **not** counted as a successful production bootstrap. No real credentials or private venue data were used.

```json
{"probe":"cold_bootstrap","scriptLoads":1,"mapConstructors":0,"autocompleteConstructors":0,"unavailableBanner":true,"automaticGeolocations":0}
{"probe":"venue_fetch","requests":[{"mapEndpoint":true,"hasBbox":false,"hasSignal":false},{"mapEndpoint":false,"hasBbox":false,"hasSignal":false}],"markers":12}
{"probe":"viewport_refresh","requestsAfterPan":2,"hasIdleListener":false,"hasBoundsListener":false}
{"probe":"toggle_off","pressed":"false","markers":0,"autocompleteConstructors":0}
{"probe":"marker_label_xss","executed":false,"htmlImage":false,"literal":true}
{"probe":"provider_geometry_and_warning","activePolylines":1,"warningVisible":true,"warningHtml":false,"browserKeyInStorage":false,"browserKeyInPageUrl":false}
{"probe":"autocomplete_out_of_order","latestBefore":true,"oldOverridesLatest":true}
```

Separate Node probes import the unmodified scratch API/loader and inject fetch failures/AbortError:

```json
{"probe":"real_mode_offline","isMock":false,"datasetSource":"synthetic","syntheticItems":8,"items":8,"limitIgnored":true,"requests":["map","legacy"]}
{"probe":"abort","returnedSynthetic":true,"items":8}
{"probe":"loader_shape","rootMap":"undefined","nestedMap":"function"}
{"probe":"online_only_fallback","onlineMarkerItems":1,"fallbackItems":12,"correctPhysicalItems":11}
{"probe":"cluster_counts","input":100,"clustered":1,"represented":100,"highZoomIndividuals":100,"centersWithinBounds":true}
```

Both final independent probe commands exited 0 because they completed their measurements; the values above demonstrate the application failures and do not mean those behaviors passed the gate. Harness-only setup attempts (early document.head access, then PowerShell/UTF-8 scratch-script encoding) were corrected before the final run.

## Commands and real output

Scratch frontend build with API URL compiled for the dedicated test port:

```powershell
$ctx=Get-Content "$env:TEMP/foodtour-ph4-review-context.json" | ConvertFrom-Json
Push-Location -LiteralPath (Join-Path $ctx.scratch 'frontend')
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18174'
$env:NEXT_TELEMETRY_DISABLED='1'
npm.cmd ci
npm.cmd run build
npm.cmd test
Pop-Location
```

Actual output excerpts:

```text
added 20 packages, and audited 21 packages in 15s
2 vulnerabilities (1 moderate, 1 high)
NPM_CI_EXIT=0

> foodtour-web@0.1.0 build
> next build
▲ Next.js 15.5.28
✓ Compiled successfully in 3.7s
✓ Generating static pages (4/4)
Route (app)                                 Size  First Load JS
┌ ○ /                                    28.3 kB         131 kB
└ ○ /_not-found                            995 B         104 kB
BUILD_EXIT=0

ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
NPM_TEST_EXIT=0
```

The initial Push-Location expression was rejected by PowerShell; corrected to Join-Path before the successful install/build. Repository git status was checked clean after that setup failure; no source/build/lockfile changes occurred in the shared tree.

Started only owned test servers: `.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18174` from backend/, with synthetic absent data path, empty evidence/session DB paths, LLM mock, routing estimate, Google keys empty and WEB_ORIGIN=http://127.0.0.1:13174; `node frontend/node_modules/next/dist/bin/next start -p 13174 --hostname 127.0.0.1` from the scratch frontend. Both readiness requests returned HTTP 200.

```powershell
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18174'
$env:WEB_URL='http://127.0.0.1:13174'
$env:CDP_PORT='9359'
Push-Location -LiteralPath $ctx.scratch
node qa/e2e/test_api_scenarios.mjs
node qa/e2e/test_components.mjs
node qa/e2e/browser_flow.mjs
$env:CDP_PORT='9360'
node independent.cdp.mjs
node independent-api.mjs
$env:REVIEW_MODULE=([System.Uri](Join-Path $ctx.scratch 'frontend/lib/api.js')).AbsoluteUri
node online-probe.mjs
node cluster-probe.mjs
Pop-Location
```

Actual suite summaries:

```text
QA-01 TEST SUMMARY: 36/36 PASSED
API_E2E_EXIT=0
COMPONENT TESTS SUMMARY: 14/14 PASSED
COMPONENTS_EXIT=0
BROWSER FLOW SUMMARY: 28/28 passed
BROWSER_FLOW_EXIT=0
INDEPENDENT_PROBE_EXIT=0
API_PROBE_EXIT=0
```

The supplied browser suite injects Google libraries only **after** asserting the unavailable-key state (qa/e2e/browser_flow.mjs:146–207), then exercises MapView's already-loaded/test-init branch. It never boots through the real loader, instantiates PlaceAutocompleteElement, asserts bbox query values, or checks AbortSignal. The component suite is server-side static markup and cannot execute those effects. Their green results therefore do not close FE1–FE6. capture_screenshots.mjs is an artifact-capture helper, not an assertion suite, and was not run.

No live Google key/referrer restrictions, production map tiles, genuine Places billing sessions, real device geolocation or screen-reader behavior were validated. Claude owns review/merge; Antigravity should fix FE1–FE6 and rerun cold-load, bbox/error/cancellation, privacy and out-of-order-origin checks before this frontend gate is accepted.

Both owned review server processes were stopped after verification; scratch logs/probes remain outside the repository for review.
