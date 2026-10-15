# REVIEW-FE-3 — final independent frontend gate

2026-10-15. Reviewer: Codex. Review owner: Claude.
Task task_2c892c51529a / dispatch ctx_9efcb27a50de.
Reviewed target: **4b8991a**, merged by the requested initial
`git merge foodtour-claude-coordinator` (bd30c74..4b8991a fast-forward).

**Recommendation: MERGE-AFTER-FIXES.** Blocking list: **B1 (F8 map sizing on tab
visibility)** and **B2 (F9 modal focus containment/restoration)**. Most original
correctness/evidence defects are closed. Passing API/static-render suites alone
miss these two real browser behaviors.

## Blocking findings reproduced independently

### B1 — Medium, F8 partial: initially hidden mobile map uses stale 600px projection

Evidence: frontend/app/components/MapView.jsx:25–43 measures clientWidth in a mount
effect and on window resize only. The map is initially hidden by the Chat tab.
frontend/app/page.js:932 (map visibility) reveals it without a window resize.

Headless Edge, mobile 390x844, open page then click Bản đồ without resizing:

```text
DOM mobile initial map: {
  viewBox: '0 0 600 380',
  containerWidth: 332,
  bodyWidth: 390,
  viewport: 390
}
```

The hidden element had clientWidth=0 when the effect ran, so width stays at its
600px initial state. Tiles use CSS pixels while the SVG scales a 600px coordinate
space into 332px; markers/hints therefore disagree with the tile map. Overall
mobile page overflow is fixed (390px body), but map alignment is not.

Suggested fix: observe the actual map container with ResizeObserver, or remeasure
on visibility/tab changes as well as resize. Verify first opening the mobile map
without resizing, then resize/hide/reopen, and ensure viewBox and content pixel
dimensions agree before displaying markers/tiles. No frontend edit made here.

### B2 — Medium, F9 partial: modal Tab escapes to background; close loses focus

Evidence: frontend/app/components/ReplaceDiffModal.jsx:15–34 implements Escape and
initial-button focus, but no Tab containment, background inertness or trigger
restoration. Setting aria-modal does not implement those behaviors.

In the actual browser, opened replace from its trigger, waited for initial focus,
focused the last dialog button, and sent a real CDP Tab key; then Escape:

```text
DOM neutral replace/focus: { onlyCurrentStopHeading: true, focusInside: true }
DOM modal traps Tab: false
DOM modal restores focus: false
```

Initial focus and Escape work; focus then moves outside a declared modal and is
not restored to the originating replace button. Users can interact with background
controls while a dialog claims modality.

Suggested fix: implement a complete modal focus lifecycle (or native modal dialog)
including first/last Tab wrapping, background inertness, and return to the invoking
control when it still exists. Retain busy-state protection and Escape behavior.
Also retain a visible focus indicator for map markers; MapView currently sets
outline:none at its focusable marker group.

## Per-finding disposition at 4b8991a

| Item | Status | File:line evidence / independent result |
|---|---|---|
| F1 live wrapper consumption | **Closed** | frontend/app/page.js:179–188 applies preferences, missing/questions, notes, nullable tour, revision and provenance; plan/replace call it at :347/:387. Actual DOM tour renders after live messages and plan/mode operations. Mock/client wrappers and revision 0 are covered by independent checks plus suites. |
| F2 replacement preview | **Closed** | page.js:362–368 opens neutral confirmation without fetching/choosing a candidate; :377–389 stores old stop and obtains new stop from the returned tour at the same order. ReplaceDiffModal.jsx:128 onward has neutral pre-request content and a server-confirmed diff. DOM: only current-stop heading before request; before matches original, after matches updated timeline, names differ; no client venue-list request occurs. |
| F3 reset/stale replies/provenance | **Closed for reviewed race** | page.js:79–104 uses request generations/AbortController; :192–210 clears credentials, preferences, tour, modal and other session state; all async result/catch/finally paths check generation. Forced a delayed message response, invoked the actual reset callback, then released an otherwise successful stale response: no stale note/tour reappeared. MockBanner.jsx:3–7 handles server synthetic source and busy toggle. DOM synthetic warning visible. |
| F4 null/rejected state and full preference edits | **Partial; nonblocking residual form defaults** | page.js:179–188 applies tour=null/notes and :312/:339 merges complete prior preferences. DOM strict-to-explore sends origin, duration 240 and budget 500000, preserving them. Mock PUT invalidates tour. PreferencesPanel.jsx:41–53 still turns missing duration into 120 and updates coordinates only when origin is truthy, so a server-null origin can retain old form coordinates; the UI draft is not a literal mirror of all nullable server slots. Label deliberate suggested defaults clearly or clear these controls. No old-tour corruption was reproduced. |
| F5 invented hours/null-open | **Closed** | EvidenceBadge.jsx:69–88 uses an unknown string when display is null; opening requires open_at_arrival===true and verified evidence. DOM: inventedHours=false, unknownShownOpen=false. |
| F6 route geometry gate | **Closed under current v1 no-geometry contract** | MapView.jsx:135–139 defines straight-line-only hint; :247–257 draws dashed polyline only for that source. Independent rendering: provider_route and unknown have no polyline; estimate has dashed line/caption. No provider enum upgrades endpoint segments into street geometry. This final gate explicitly permits a captioned straight-distance hint. |
| F7 recovery/errors | **Partial; nonblocking residual init retry** | page.js:136–149 distinguishes 409 no_candidates, auth/410, 429 and 503. :160–176 retries the recorded plan/message/preferences/replace operation. However initSession records type='init' (:235), and handleRetry has no init branch, so generic Retry can fall through to handlePlanTour with sessionId=null. The separately visible new-session action remains available. Add an initSession retry branch and clear lastFailedAction during reset. |
| F8 responsive geometry/layout | **Partial / BLOCKING B1** | New measured dimensions and resize effect exist; grid minmax fits 390px and render-time viewport branches moved to resize state. Actual hidden-to-visible map width still stale, as above. |
| F9 keyboard/labels | **Partial / BLOCKING B2** | PreferencesPanel.jsx:147 onward links labels/IDs; DOM found 11 linked labels. MapView.jsx:273–286 and TourTimeline.jsx:80–90 add focusability/Enter/Space. Modal initial focus/Escape/close label work, but actual Tab/focus restoration fail. |
| F10 scope chip | **Closed** | page.js:289–298 sends a structured budget_scope edit through the full merged update. Actual DOM chip request sets per_person and retains budget=150000. |
| N1 server pagination total | **Closed** | frontend/lib/api.js:488–494 preserves data.total, limit/offset and provenance. Independent live check: server total=13, client total=13, limit=2, offset=1, version present. |
| N2 dwell-time label | **Closed** | TourTimeline.jsx:180–182 uses tour.assumptions.visit_minutes_per_stop instead of 30. DOM displays 45p for the real server assumption. |

### Three coordinator extra items

- **Scope chip sets budget_scope: closed**, verified through the actual page DOM
  and captured structured request (value only; no token printed).
- **Mock Tour.revision equals wrapper revision: closed**, independently checked
  message/plan/replace, all true; PUT correctly returns tour=null.
- **getVenues preserves total and exposes limit/offset: closed**, verified against
  the actual local server, not only mocked expectations.

## Token, HTML and provenance checks

Actual browser network capture found no token query parameter; authenticated
session requests carried X-Session-Token. Source review finds no production
console token logging, localStorage/sessionStorage persistence or raw-HTML sink.
Text remains React-escaped; target=_blank source/OSM links retain rel=noreferrer.
No secret values were printed by independent probes.

QA's API suite still prints the first eight token characters at
qa/e2e/test_api_scenarios.mjs:82. That is not production client logging and not a
full credential, but should be removed/redacted. Suite output included in reports
is sanitized; no token prefix/session identity is copied here.

Synthetic provenance is visible in the live-transport DOM when server source is
synthetic. Checked original known null hours and estimate price labels. No real
venue data, real location history or allergy/opening guarantees were introduced.
Unchanged dependency files still resolve the same Next/React dependencies;
npm ci reports 1 moderate/1 high advisory. No upgrade or advisory remediation was
performed in this report-only task.

## Requested command evidence

Windows, Python 3.14.4 existing .venv, Node v24.19.0/npm 11.17.0.
No tracked source changes except this report. `git diff --quiet 4b8991a HEAD -- frontend qa`
exited 0 before review completion.

### scripts/test.ps1

From worktree root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
```

Actual output excerpts, captured externally in
C:/Users/tuana/AppData/Local/Temp/foodtour-fe3-test.log:

```text
EXPECTED-SKIP: legacy data/venues.json absent; this source-specific test requires private Foody rows and URLs, not the synthetic Venue fixture. [test_planner.PlannerTests.test_budget_and_source]
Ran 81 tests in 2.191s
OK (skipped=1)
OpenAPI matches server schema
 ✓ Compiled successfully in 1248ms
🎉 ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
PASS: all available checks passed; expected skips are listed above
script_exit=0
```

One expected legacy skip only; no hidden frontend-test skip. Known
Starlette/httpx deprecation warning remains.

### Scratch install/build/test and QA suites

Exported only frontend/ and qa/e2e from 4b8991a using git archive into
C:/Users/tuana/AppData/Local/Temp/foodtour-fe3-14a06c200edc4dec8f4cf040ecd67e4d.
This is a disposable code export, not another Git worktree or worker. No edits to
repo frontend/ or qa/.

From scratch frontend/ ran npm ci, npm run build, npm test sequentially:

```text
added 20 packages, and audited 21 packages in 13s
2 vulnerabilities (1 moderate, 1 high)
> foodtour-web@0.1.0 build
> next build
   ▲ Next.js 15.5.28
 ✓ Compiled successfully in 2.8s
 ✓ Generating static pages (4/4)
Route (app)                                 Size  First Load JS
┌ ○ /                                    20.8 kB         124 kB
└ ○ /_not-found                            993 B         104 kB
> foodtour-web@0.1.0 test
> node lib/contractTest.js
🎉 ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
scratch_build_exit=0 scratch_test_exit=0
```

Started this branch's uvicorn from backend/ with PYTHONDONTWRITEBYTECODE=1,
FOODTOUR_DATA_PATH pointing to an absent temporary filename for synthetic fallback,
and WEB_ORIGIN=http://127.0.0.1:13310:

```powershell
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18110 --no-access-log
```

Task-owned process 29064, application startup complete. From scratch export root:

```powershell
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18110'
node qa/e2e/test_api_scenarios.mjs
node qa/e2e/test_components.mjs
```

Actual output summary:

```text
PASS TC-31 F10: scope structured update
PASS TC-32 Mock PUT invalidates tour, revision stays coherent
PASS TC-33 getVenues keeps total 13 and pagination/provenance
PASS TC-34 visit_minutes_per_stop: 45
PASS TC-35 no invented route geometry in API fields
PASS TC-36 AbortError rethrown, not converted to 503
QA-01 TEST SUMMARY: 36/36 PASSED
api_suite_exit=0

PASS TC-DOM-01..03 neutral replace/current stop/dialog attributes
PASS TC-DOM-04 server before/after markup
PASS TC-DOM-05 dashed hint/caption
PASS TC-DOM-06 leg source details
PASS TC-DOM-07 marker keyboard attributes
PASS TC-DOM-08 provider_route has no polyline
PASS TC-DOM-09 dynamic 45p dwell
PASS TC-DOM-10 timeline keyboard attributes
PASS TC-DOM-11 label/ID associations
COMPONENT TESTS SUMMARY: 11/11 PASSED
component_suite_exit=0
```

The component suite renders static HTML, so its success does not test focus
movement or effects when hidden panels become visible. TC-35 checks API fields,
not browser geometry. Connection-refusal cases are simulations, not live provider
validation.

## Independent probes beyond the supplied suites

Created review-dom.mjs at the scratch export root and review-contract.mjs inside
scratch frontend/ only. Ran them with node, using the same local API.

The DOM probe launches a separate headless Edge via CDP on an ephemeral port,
using a fresh temporary profile; no visible app window or existing browser
session is controlled. OSM tile requests are blocked for this functional review.
It sends real keyboard events for text/Tab/Escape, inspects rendered elements,
and captures only request method/body/header-presence checks. It does not print
or persist credential values. Viewports: mobile 390x844 and desktop 1280x900.

For the stale-response check, the probe holds a successful message response,
adds a sentinel note, invokes the actual React reset callback directly to force
the otherwise-disabled transition, then releases that response even after abort.
This specifically tests the generation guard, beyond ordinary button disabling.

Final actual DOM output, exit 0:

```text
DOM mobile initial map: {
  viewBox: '0 0 600 380',
  containerWidth: 332,
  bodyWidth: 390,
  viewport: 390
}
DOM scope chip: { scope: 'per_person', budgetPreserved: true }
DOM evidence: {
  synthetic: true,
  inventedHours: false,
  unknownShownOpen: false,
  dwell45: true
}
DOM mode toggle: { mode: 'explore', fullSlots: true }
DOM neutral replace/focus: { onlyCurrentStopHeading: true, focusInside: true }
DOM modal traps Tab: false
DOM modal restores focus: false
DOM server replacement diff: { beforeMatches: true, afterMatchesTimeline: true, changed: true }
DOM replacement used client list: false
DOM stale reply discarded: true
DOM labels linked: { count: 11, allLinked: true }
DOM token transport: { tokenInUrl: false, authenticatedHeader: true }
```

An initial probe expected zero neutral-modal headings even though the current
stop correctly has one, and waited for a case-sensitive text string transformed
to uppercase by CSS. Those probe predicates were corrected; no product source
was changed. The final output above uses current-stop count and resulting DOM
structure instead.

Independent SWC/ReactDOMServer plus live-client probe output, exit 0:

```text
independent map: provider_route { polyline: false, dashed: false, caption: false }
independent map: unknown { polyline: false, dashed: false, caption: true }
independent map: straight_line_estimate { polyline: true, dashed: true, caption: true }
independent pagination: {
  serverTotal: 13,
  clientTotal: 13,
  limit: 2,
  offset: 1,
  versionPresent: true
}
independent mock revisions: { message: true, plan: true, replace: true, putInvalidates: true }
```

The probe deliberately supplies no provider geometry, matching contract v1.
Actual synthetic backend routes are estimated; real routing was never claimed.

## Cleanup and gate

Stopped the task-owned uvicorn and scratch Next.js dev server; the headless Edge
probe closes its own process tree. Get-NetTCPConnection for 18110/13310 returned
zero remaining listeners. No shared server was stopped, and no private data,
frontend/qa source, dependency file or deployed artifact was changed.

**MERGE-AFTER-FIXES: B1 and B2 must close.** Recheck the actual hidden-map transition
and modal Tab/return-focus behavior after owner fixes. F4/F7 residual draft/retry
issues and the QA token-prefix log should be tracked explicitly; this review does
not convert their partial status into full closure. No DB/live-provider,
public-data permission or complete screen-reader compliance claim is made.
