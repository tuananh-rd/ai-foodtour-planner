# FIX-01 and independent REVIEW-FE-2

2026-10-15. Author/reviewer: Codex. Review owner: Claude.
Task task_cb372fb53ef4 / dispatch ctx_48afd613e058.
Merged coordinator first: fast-forward 8ed069b..1c6dba0.
Reviewed frontend/ and qa/e2e at **7d7afed**; `git diff --quiet 7d7afed HEAD -- frontend qa/e2e` exited 0.

**DEF-01 fixed; frontend recommendation: merge after fixes.**
Remaining blocking findings from the first review: F2, F3, F4, F6. API E2E success
does not establish DOM behavior or closure of these findings.

## A. Backend fix

GET /v1/venues now reads request.app.state.venues.snapshot(), the same versioned
snapshot used by venue detail and health. It no longer calls legacy.load().
POST /v1/plans and legacy load/plan are unchanged.

- Keeps top-level items. Adds total (after exact city filtering), limit, offset,
  dataset_source and dataset_version.
- Defaults to limit=50, offset=0; validates 1<=limit<=200 and offset>=0. Invalid
  bounds return 422 validation_error. It never sends the whole 1,700-row snapshot
  by default or when an oversized limit is requested.
- Uses explicit Pydantic allowlists (VenueView/VenueListItem/VenueList). Canonical
  price/hours, online/geo flags and synthetic metadata are not copied from raw
  arbitrary source columns.
- Preserves available legacy aliases: id/foody_id, dish_groups, geo_status,
  price_min_vnd_norm/price_max_vnd_norm, price_status, hours_displayed. venue_types
  is Shop Online only when that source flag exists, otherwise null; cuisine_styles
  remains null because the canonical snapshot does not retain it. Missing values
  and hours stay unknown. IDs are copied from the existing snapshot, not invented.
- List and detail use one serializer for their common allowlisted fields.
  Snapshot changes between separate requests can still change the active version;
  responses expose their version for the consumer.
- Generated OpenAPI was regenerated using tools/export_openapi.py, not hand-edited.
  No contract Markdown, loader, planner, LLM or frontend source was changed.

Four new tests cover labeled synthetic list/detail agreement, city/pagination,
bounds/error envelope, and a configured temporary CSV via FOODTOUR_DATA_PATH. The
CSV has 251 explicitly synthetic rows (250 in the selected city), exercises
50/200 limits, unknown zero price, online-only aliases, detail lookup, version hash
and exclusion of an extra private-shaped column. No real private input was read.

One existing API test was updated to stop asserting that the deliberately changed
list endpoint returns raw legacy rows; its legacy POST response-equality checks
remain intact.

## B. Frontend closure against 7d7afed

Line references are frontend/ paths at that exact reviewed commit.

| Finding | Status | Evidence and remaining action |
|---|---|---|
| F1 — live wrappers treated as bare tours | **Closed (wrapper consumption)** | app/page.js:116–125 applies wrapper preferences/questions/notes/tour/revision/provenance; :244 and :285 call it for plan/replace. lib/api.js now returns mock wrappers and creation revision 0. Live QA wrapper checks pass. Mock PUT invalidation remains under F4. |
| F2 — list crash / misleading replacement preview | **Partially closed; blocking** | lib/api.js:476–480 aliases items to venues; app/page.js:258–265 accepts items, and DEF-01 fixes server data availability. But the UI still chooses a candidate locally and :278–284 sends only the old venue_id. components/ReplaceDiffModal.jsx:14–16 and :122–141 still display that unrelated candidate/default address and price difference. Live probe: previewMatchesActual=false; previewFlatPricePresent=false. Show actual server-selected replacement and evidence, or coordinate an actual preview contract before candidate-specific confirmation. |
| F3 — reset/mode/provenance contamination | **Partially closed; blocking** | app/page.js:128–147 clears tour/notes/missing/questions/highlight and reads health provenance; components/MockBanner.jsx:3–7 labels server synthetic fallback. But initSession does not clear credentials/preferences/modal target/candidate before awaiting; reset/toggle controls are not disabled during requests and there is no request-generation/cancellation guard. A late old-session message can repopulate tour/preferences after reset, while new credentials are active. Fully isolate transitions and discard stale replies. This remaining race is established by source inspection, not an executed browser race. |
| F4 — null/rejected tours and preference replacement | **Partially closed; blocking** | app/page.js:122–123 now applies notes and tour=null correctly. However :238 still submits newPrefs directly, and :769 calls it with only {mode:'explore'}; lib/api.js:729–743 fills omitted slots with null/defaults before PUT. Live probe confirms origin and budget are cleared. components/PreferencesPanel.jsx:39–54 still ignores null resets. Mock updatePreferences at lib/api.js:700–720 keeps the old tour; probe gives wrapper revision 2 vs tour revision 1 after strict PUT. Merge the full preference document for partial UI edits, clear nullable controls and invalidate mock tours on PUT. |
| F5 — invented fallback hours | **Closed** | components/EvidenceBadge.jsx:76 uses supplied hours.display or 'Chưa rõ giờ mở cửa'; render probe confirms no invented 07:00 interval and null is not displayed as open. |
| F6 — route geometry/source gate | **Partially closed; blocking** | components/MapView.jsx:202 now suppresses polylines for unknown/straight_line_estimate. But :120 still builds geometry from marker endpoints, and provider_route alone enables it with a real-provider claim at :323–326. Component has no supplied route geometry input. Probe: unknown=false, estimate=false, provider=true for polyline. Gate on actual provider geometry, not only an enum; otherwise keep markers only. |
| F7 — error recovery | **Partially closed** | app/page.js:94–109 distinguishes no_candidates, auth, 429 and 503, with dedicated panels. HTTP 410 session_expired is not included in auth recovery; generic Retry at :565 still invokes plan regardless of the failed operation, and 409 sync creates a new session. Track/retry the actual operation and distinguish expiry from provider/auth errors. |
| F8 — responsive map alignment | **Open** | components/MapView.jsx:68–69 retains fixed 600x400 projection, :98–104 fixed tile CSS positions, :193–199 responsive SVG scaling. app/page.js:697 keeps a 360px grid minimum; :707/:724/:740/:808 use render-time window width. Existing mobile map alignment/overflow/hydration analysis remains applicable. No browser resize run was performed here. |
| F9 — keyboard/form labels | **Open** | MapView marker g elements still have pointer handlers but no tabIndex/keyboard handler; TourTimeline articles are also pointer-only. ReplaceDiffModal still has no focus trap/initial focus/Escape/restore logic; PreferencesPanel labels still lack htmlFor/control IDs. Native primary buttons remain usable, but those specific keyboard/accessibility gaps remain. |
| F10 — budget-scope quick answer | **Open** | app/page.js:207 sends 'Ngân sách tính cho mỗi người' without the amount; live two-message probe confirms budget_scope remains missing. Use a complete structured edit or coordinate extractor support for standalone scope clarification. |

### New defects / uncovered mismatches

**N1 — Medium: pagination metadata is discarded by the frontend.**
frontend/lib/api.js:476–480 returns total=items.length instead of data.total and
drops dataset_source/version. Against the fixed endpoint, limit=2 yields server
total=13 but client total=2. Preserve authoritative total/limit/offset/provenance;
do not derive the collection count from a page length.

**N2 — Medium: timeline claims a 30-minute dwell while backend uses 45 minutes.**
frontend/app/components/TourTimeline.jsx:172 hardcodes '(ước tính 30p dừng)'.
Backend Preferences.visit_minutes defaults to 45 and the Tour exposes
assumptions.visit_minutes_per_stop. Render that assumption (or an unknown label),
rather than a contradictory hardcoded duration.

**QA scope gap, not a frontend fix:** qa/e2e/test_api_scenarios.mjs checks API
hours.display and leg-source enums in TC-27/TC-28; it does not render HoursBadge
or MapView, exercise reset races, or compare the preview with the chosen
replacement. Therefore its 28/28 result does not close the remaining UI findings.
TC-03 also logs a token prefix; outputs included below redact it and the session
identity. Production client tokens remain in state/headers, not URLs or storage;
no production raw-HTML sink or new dependency addition was found.

## Commands and actual results

Environment: Python 3.14.4 in existing .venv, Node v24.19.0/npm 11.17.0. No
dependency files changed. Current npm advisory count remains 1 moderate/1 high.

### Backend/API and OpenAPI

From root:

```powershell
$env:PYTHONPATH='backend'
$env:PYTHONDONTWRITEBYTECODE='1'
./.venv/Scripts/python.exe tools/export_openapi.py
./.venv/Scripts/python.exe -m unittest discover -s backend/tests/api -t backend
```

Actual output:

```text
Exported contracts/v1/openapi.json
............................
----------------------------------------------------------------------
Ran 28 tests in 1.449s

OK
```

### Required script

Ran `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1`.
Full output was captured outside Git at C:/Users/tuana/AppData/Local/Temp/foodtour-fix01-test.log.
Actual excerpts, exit 0:

```text
Bootstrap interpreter: Python 3.14.4
EXPECTED-SKIP: legacy data/venues.json absent; this source-specific test requires private Foody rows and URLs, not the synthetic Venue fixture. [test_planner.PlannerTests.test_budget_and_source]
Ran 81 tests in 2.817s
OK (skipped=1)
OpenAPI matches server schema
> foodtour-web@0.1.0 build
> next build
   ▲ Next.js 15.5.28
 ✓ Compiled successfully in 2.3s
> foodtour-web@0.1.0 test
> node lib/contractTest.js
=== Testing API Client in MOCK MODE against CONTRACT v1 ===
🎉 ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
PASS: all available checks passed; expected skips are listed above
test_script_exit=0
```

There is exactly one expected legacy skip; the frontend test script now exists and
runs, unlike OPS-01's baseline. The Starlette/httpx deprecation warning remains.

### Frozen frontend scratch build/tests

Used git archive to export only frontend/ and qa/e2e from 7d7afed into
C:/Users/tuana/AppData/Local/Temp/foodtour-fe2-9d3eff3632894fae94b7051463b5c604.
No source checkout switch or frontend/qa edit occurred. From scratch frontend/:

```powershell
npm ci
if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}
npm run build
$buildExit=$LASTEXITCODE
npm test
$testExit=$LASTEXITCODE
```

Actual output excerpts:

```text
added 20 packages, and audited 21 packages in 22s
2 vulnerabilities (1 moderate, 1 high)
> foodtour-web@0.1.0 build
> next build
   ▲ Next.js 15.5.28
 ✓ Compiled successfully in 3.3s
 ✓ Generating static pages (4/4)
Route (app)                                 Size  First Load JS
┌ ○ /                                    18.9 kB         122 kB
└ ○ /_not-found                            993 B         104 kB
> foodtour-web@0.1.0 test
> node lib/contractTest.js
=== Testing API Client in MOCK MODE against CONTRACT v1 ===
  ✓ Session created: mock-session-1792059021126 revision: 0
🎉 ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
scratch_build_exit=0 scratch_test_exit=0
```

### Live QA E2E against this backend branch

Started a task-owned server from backend/ (no paid/remote provider):

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:FOODTOUR_DATA_PATH=Join-Path ([IO.Path]::GetTempPath()) 'foodtour-fix01-absent.json'
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18100
```

Actual startup: process 13480, Application startup complete, Uvicorn running on
http://127.0.0.1:18100. Then from root:

```powershell
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18100'
node qa/e2e/test_api_scenarios.mjs
```

Captured outside Git at C:/Users/tuana/AppData/Local/Temp/foodtour-fix01-e2e.log;
printed/report output redacts TC-03 session identity/token prefix. Actual results:

```text
Target API: http://127.0.0.1:18100
Mode: REAL LOCAL API (Default)
PASS TC-01 health ok/loaded
PASS TC-02 source synthetic, version 13a60c7460..., straight_line_estimate
PASS TC-03 create revision 0 [session_id/token REDACTED]
PASS TC-04 origin and revision 1
PASS TC-05 duration 120 and origin preserved
PASS TC-06 structured update preserves supplied prior fields
PASS TC-07 missing slots and questions
PASS TC-08 missing budget_scope question
PASS TC-09 explore conditional tour
PASS TC-10 strict insufficient_evidence, no stops
PASS TC-11 impossible budget no_solution
PASS TC-12 base tour has 3 stops
PASS TC-13 replace preserves count and other identities/order
PASS TC-14 locks match preserved stops
PASS TC-15 stale preferences 409
PASS TC-16 stale tour 409
PASS TC-17 injection retains budget/mode
PASS TC-18 injection warning note
PASS TC-19 cross-session token rejected
PASS TC-20 missing token rejected
PASS TC-21 network refusal mapped to provider_unavailable
PASS TC-22 unknown open_at_arrival is null
PASS TC-23 venue_range price semantics
PASS TC-24 straight_line_estimate leg
PASS TC-25 SessionView wrapper
PASS TC-26 items/venues aliases, both length 5
PASS TC-27 server hours display null
PASS TC-28 route-source enum estimate
QA-01 TEST SUMMARY: 28/28 PASSED
e2e_exit=0
```

TC-21 is a connection-refusal simulation, not validation of a real upstream LLM
failure. The task-owned uvicorn was stopped after the independent probes; no
shared server was stopped.

### Independent render and live-client probes

Created review-probe.mjs only in scratch frontend/, compiled unchanged JSX with the
installed Next SWC and rendered through ReactDOMServer. API probes used only the
local synthetic snapshot and do not print tokens. Command:

```powershell
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18100'
node review-probe.mjs
```

Actual output, exit 0:

```text
F5 inventedInterval= false nullShownOpen= false
F6 source= unknown polyline= false hasRouteGeometryInput= false
F6 source= straight_line_estimate polyline= false hasRouteGeometryInput= false
F6 source= provider_route polyline= true hasRouteGeometryInput= false
F2 previewMatchesActual= false previewFlatPricePresent= false
new paginationTotal server= 13 client= 2
F4 modeOnlyPut retainsOrigin= false retainsBudget= false
F10 scopeStillMissing= true
F4 mockPutOldTourRetained= true wrapperRevision= 2 tourRevision= 1
```

The render probe supplies origin/stop coordinates and no route geometry, exactly
the component's current input contract. The live probes use the page's first
eligible list candidate rule, then compare it with the actual replacement;
submit only {mode:'explore'} through the real client; and send an amount followed
by the scope chip's exact clarification. No browser/DOM race or screen-reader
run is claimed.

## Merge and remaining work

DEF-01 backend fix is ready for Claude review. **FE merge recommendation remains
merge after fixes**, with F2/F3/F4/F6 blocking. F7 is partial, F8–F10 remain open,
and N1/N2 should be corrected before claiming accurate pagination/timeline UI.
F1's core wrapper handling and F5's unknown-hours rendering are verified closed.

Only API schemas/routes/tests, generated OpenAPI and this report changed.
No frontend/QA/planner/LLM/contract-Markdown files were edited. No private venue
data, external deployment, DB/provider validation or dependency upgrade is included.
