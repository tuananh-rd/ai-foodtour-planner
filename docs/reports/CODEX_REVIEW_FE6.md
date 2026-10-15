# REVIEW-FE-6 — final frontend MVP gate

Reviewer: Codex. Review owner: Claude. Date: 2026-10-15.
Reviewed HEAD `8f55933d4ca7997dbd1eae2058184e7bbaee8bd0` after the requested `git merge foodtour-claude-coordinator` (fast-forward from `5eb39ab`). Only this report is changed by this review.

**Recommendation: MERGE for the local MVP. Blocking list: none.** The two remaining F9 failures from REVIEW-FE-5 are closed in the integrated page with real browser input. This gate carries forward the independent F1–F10/N1/N2 review evidence, checks the intervening diff, and reruns the required suites. It does not claim every earlier browser scenario was rerun during this narrow follow-up, or authorize public deployment.

## F1–F10, N1 and N2 disposition

| Item | Final status | Current evidence and limits |
| --- | --- | --- |
| F1 live wrapper consumption | Closed | `frontend/app/page.js:179-188` consumes preferences, nullable tour, revision, missing slots/questions and provenance. Live API suite passes; the actual page generates a tour and consumes replacement output in this probe. Mock contract checks pass. |
| F2 replacement preview | Closed | `page.js:362-389` obtains the replacement from the server; `frontend/app/components/ReplaceDiffModal.jsx:169-221` presents neutral confirmation before the request, with completed server diff afterward. Current browser probe waits for that returned diff, then closes it. Prior independent before/after identity checks remain applicable; this logic is unchanged. |
| F3 reset/stale replies/provenance | Closed for reviewed race | `page.js:79-104` request generations/AbortController and `:192-210` reset cleanup remain unchanged. REVIEW-FE-3's forced stale response test remains applicable. Current QA cancellation check passes; `MockBanner.jsx:3-7` still derives synthetic warning from dataset_source. |
| F4 null state/full preference edits | Partial, nonblocking follow-up | `page.js:179-188` applies tour=null and `:312-339` merges full preferences; prior live mode-edit probe preserved required fields. `PreferencesPanel.jsx:43-53` still substitutes duration 120 and retains coordinate draft when server origin becomes null. Keep this draft/default distinction visible or clear null fields. No old-tour corruption was demonstrated; unchanged since the previous nonblocking disposition. |
| F5 invented hours/null-open | Closed | `EvidenceBadge.jsx:68-88` requires true plus verified evidence to show opening, with unknown display otherwise. Current component suite passes; prior browser unknown-hours evidence remains applicable. |
| F6 route geometry | Closed under current v1 contract | `MapView.jsx:150-153`, `:262-270`, `:318` permit only a captioned dashed straight-line hint, with no provider_route polyline. Current component/API suites pass. No street geometry is invented. |
| F7 recovery/errors | Partial, nonblocking follow-up | `page.js:136-176` keeps 409/auth/410/429/503 handling and recorded-operation retries. The known init retry gap persists: `:235` records type init but `:160-176` has no init branch, falling through to plan; explicit new-session action remains available at `:465`. Add initSession retry and clear recorded failure during reset. Current API error cases pass; no new regression in changed code. |
| F8 responsive map/layout | Closed | `MapView.jsx:29-54` observes dimensions and polls every 400ms when ResizeObserver is absent. Current live browser checks pass at 390/1280, resize/orientation, and no-ResizeObserver hidden-tab activation within 342ms. |
| F9 keyboard/focus/labels | Closed for the reviewed MVP cases | `ReplaceDiffModal.jsx:26-30`, `:58-67`, `:70-85`, `:248` now contain busy focus, synchronously focus before disabling Confirm, restore a connected invoker or fallback; `page.js:882` supplies the real persistent focus target. All 28 sampled busy frames focus the dialog, completion focuses the data-focus-fallback element, cancel/Escape restore the invoker, normal Tab/Shift+Tab wrap. Existing labelled controls and timeline keyboard checks pass the component suite. |
| F10 scope chip | Closed | `page.js:289-298` submits structured budget_scope through the merged preference update. Prior independent DOM request proof preserved budget and set per_person; unchanged and covered by current suites. |
| N1 pagination total | Closed | `frontend/lib/api.js:475-494` preserves server total, limit, offset and provenance. Prior independent live pagination probe remains applicable; current live suite passes. |
| N2 dwell duration | Closed | `TourTimeline.jsx:181` uses tour.assumptions.visit_minutes_per_stop; current component suite passes, and prior live DOM showed server's 45-minute value. |

The three extra items from REVIEW-FE-3 retain closed status: scope chip sends budget_scope; mock tour and wrapper revisions agree; getVenues preserves total and exposes limit/offset. Existing tests rerun successfully; these paths did not change in the F8/F9 fixes.

`git diff 4b8991a HEAD -- frontend qa` is limited to the map/modal fixes, the persistent timeline wrapper, and redaction of QA session/token logging. There are no new dependencies or API-client changes. The earlier review found no raw-HTML sink, persistent browser token storage, URL token transport or production token logging; those production paths are unchanged. QA now redacts the session/token message at `qa/e2e/test_api_scenarios.mjs:82`.

## Independent Edge/CDP probe

Fresh headless Edge 155.0.4283.45 and native CDP against the actual React page. Scratch frontend port 13340 calls this branch's own uvicorn on port 18140, with an absent absolute FOODTOUR_DATA_PATH selecting the labelled synthetic fixture. No private input was read. An actual `Input.dispatchMouseEvent` press/release clicks Confirm. The real replacement response is held in the browser; requestAnimationFrame samples focus while all dialog actions are disabled, including before the response hold is observed and during a further 450ms wait. The response is then released and the completed diff is closed. No stop names or tokens are recorded.

```text
mobile initial (390x844): container=332 viewBoxWidth=332
mobile resize (430x844):  container=372 viewBoxWidth=372
orientation (844x390):    container=359 viewBoxWidth=359
desktop (1280x900):       container=577 viewBoxWidth=577
Tab last->first true
ShiftTab first->last true
eight Tabs contained true
Escape restore true
busy frame samples { count: 28, allDialog: true, outsideFrames: 0 }
busy initial {
  inside: true, enabledButtons: 0, activeTag: 'DIV', dialogFocused: true
}
busy Tab/Escape { stillOpen: true, inside: true }
confirm original connected false
confirm focus restore {
  original: false, newStopButton: false, activeTag: 'DIV',
  body: false, fallback: true, fallbackTargets: 1
}
cancel restore true
no ResizeObserver measured in ms 342
no ResizeObserver mobile:  container=332 viewBoxWidth=332
no ResizeObserver desktop: container=577 viewBoxWidth=577
probe_exit=0
```

Fallback true here means the active element matches the fallback selector; there is exactly one target, the data-focus-fallback region. Original/newStopButton false is intentional: successful replacement removes the original button and restoration uses the persistent region. Cancel retains/restores the original control.

Tile requests are blocked, so this verifies DOM tile placement/projection, not downloaded imagery. Independently projected origin vs marker differences remain approximately 0–0.25px horizontally and the existing approximately 1px vertical border/overlay offset. ViewBox/container widths match exactly in settled cases. No blank map, busy BODY frame, or new focus regression was observed. The map interval/listeners and modal rAF have cleanup paths; the existing uncancelled 50ms initial-focus timeout remains a nonblocking cleanup opportunity. No screen-reader or long-duration heap test was performed. F4/F7 residuals above remain explicit follow-up work rather than being marked fixed.

## Commands and real output

Repository root:

```powershell
git merge foodtour-claude-coordinator
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
```

Captured at `C:/Users/tuana/AppData/Local/Temp/foodtour-fe6-test.log`:

```text
Ran 81 tests in 2.311s
OK (skipped=1)
OpenAPI matches server schema
Compiled successfully in 1372ms
ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
PASS: all available checks passed; expected skips are listed above
script_exit=0
```

The documented skip is `test_planner.PlannerTests.test_budget_and_source`, requiring absent private Foody data/source URLs. It is not a skipped frontend failure.

Scratch setup/build (all frontend npm operations outside the repository):

```powershell
$reviewScratch=Join-Path ([IO.Path]::GetTempPath()) 'foodtour-fe6-review'
New-Item -ItemType Directory -Force $reviewScratch | Out-Null
git archive --format=tar HEAD frontend qa/e2e -o "$reviewScratch/source.tar"
tar -xf "$reviewScratch/source.tar" -C $reviewScratch
Set-Location "$reviewScratch/frontend"
npm ci
npm run build
npm test
```

```text
added 20 packages, and audited 21 packages in 21s
2 vulnerabilities (1 moderate, 1 high)
Next.js 15.5.28
Compiled successfully in 3.0s
Generating static pages (4/4)
ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
ci_exit=0 build_exit=0 test_exit=0
```

The audit findings predate these fixes and remain documented; no dependency changes or upgrades were made.

Backend working directory, then scratch frontend working directory:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:FOODTOUR_DATA_PATH=Join-Path ([IO.Path]::GetTempPath()) 'foodtour-fe6-absent.json'
$env:WEB_ORIGIN='http://127.0.0.1:13340'
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18140 --no-access-log
# Application startup complete
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18140'
npm run dev -- --hostname 127.0.0.1 --port 13340
# Ready in 1466ms
```

Scratch root with NEXT_PUBLIC_API_URL unchanged:

```powershell
node qa/e2e/test_api_scenarios.mjs
node qa/e2e/test_components.mjs
node C:/Users/tuana/AppData/Local/Temp/foodtour-fe6-review/probe.mjs
```

```text
QA-01 TEST SUMMARY: 36/36 PASSED
COMPONENT TESTS SUMMARY: 11/11 PASSED
api_exit=0 component_exit=0
probe_exit=0
```

Local scratch logs/probe are review artifacts outside Git. No production files were edited by the reviewer. Claude remains the integration/review owner.
