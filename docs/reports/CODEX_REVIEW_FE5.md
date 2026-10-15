# REVIEW-FE-5 — final narrow browser verification

Codex review for Claude, 2026-10-15. Reviewed `138e158e9566cac6388f92d7f93cb80216b6d5a9` after `git merge foodtour-claude-coordinator` (fast-forward). Only this report is changed by the reviewer.

**Overall MVP frontend gate: MERGE-AFTER-FIXES.** Two F9 acceptance cases remain blocking. The fallback map fix is verified, ordinary keyboard navigation remains working, and all required suites pass. No additional regression was demonstrated in this narrow review.

## Closure and blocking findings

| Check | Status | File/line evidence and browser observation |
| --- | --- | --- |
| Busy state immediately focuses dialog | **OPEN — P2 blocker** | `frontend/app/components/ReplaceDiffModal.jsx:58-62` only focuses if activeElement is outside the dialog at effect time. After a real CDP mouse click on Confirm and a held server response, waiting 300ms still reports BODY, not dialog. All buttons are disabled. The guarded effect does not reliably recover focus when disabling the previously focused control. |
| Busy Tab containment/recovery | Closed | `ReplaceDiffModal.jsx:26-30`: Tab moves focus to the dialog and prevents leakage; Escape leaves the busy modal open. This repairs recovery by Tab but does not satisfy initial busy focus above. |
| Completed replacement restores to fallback | **OPEN — P2 blocker** | `ReplaceDiffModal.jsx:74-77` looks for `[data-focus-fallback], main, [role="main"]`. The real page contains **zero** matching elements (`frontend/app/page.js:421` returns a div; `frontend/app/layout.js:19` renders children directly inside body). After replacing the second stop and closing the server diff, focus remains BODY after 300ms. The original invoker is disconnected, as expected. |
| Cancel restores invoker | Closed | `ReplaceDiffModal.jsx:65-80`: “Giữ quán cũ” closes and returns focus to the actual invoking replace button. |
| Normal Tab/Shift+Tab and Escape | Closed | `ReplaceDiffModal.jsx:18-55`: last-to-first Tab and first-to-last Shift+Tab pass; eight consecutive Tabs stay inside; Escape restores the connected invoker. |
| Normal map, hidden-to-visible mobile / desktop | Closed | `frontend/app/components/MapView.jsx:29-54`: 390px viewport yields container/viewBox 332/332; 1280px yields 577/577. Resize and orientation also pass. |
| Map without ResizeObserver | Closed | `MapView.jsx:46-50`: deleting ResizeObserver before document load, then revealing the hidden mobile map, corrects width within **343ms** without a resize/orientation event. Desktop also settles to 577/577. |

Required fixes: move focus reliably to the dialog whenever busy disables its focused action, regardless of whether the old action was contained during the effect; provide an actual connected, focusable fallback target in the rendered page (or resolve a stable replacement control by stop order). Test the integrated page, not only the modal component with an assumed main element. These are residual failures of REVIEW-FE-4, not new scope requests.

## Independent browser method and output

Fresh headless Edge 155.0.4283.45, native CDP WebSocket, actual React DOM and real keyboard/mouse input. Scratch frontend: `C:/Users/tuana/AppData/Local/Temp/foodtour-fe5-review/frontend`; dev port 13330; own uvicorn port 18130, synthetic fallback forced by a nonexistent absolute data path. No private data. The actual `/tour/replace` fetch response was held in the page to observe busy state, then released. A real mouse click activated Confirm; both busy and completed-close focus were inspected after 300ms, avoiding a transient immediate-read explanation.

```text
mobile initial: container=332 viewBoxWidth=332
mobile resize:  container=372 viewBoxWidth=372
orientation:    container=359 viewBoxWidth=359
desktop:        container=577 viewBoxWidth=577
Tab last->first true
ShiftTab first->last true
eight Tabs contained true
Escape restore true
busy initial {
  inside: false, enabledButtons: 0, activeTag: 'BODY', dialogFocused: false
}
busy Tab/Escape { stillOpen: true, inside: true }
confirm original connected false
confirm focus restore {
  original: false, newStopButton: false, activeTag: 'BODY',
  body: true, fallback: false, fallbackTargets: 0
}
cancel restore true
no ResizeObserver measured in ms 343
no ResizeObserver mobile:  container=332 viewBoxWidth=332
no ResizeObserver desktop: container=577 viewBoxWidth=577
probe_exit=0
```

Probe exit zero means the observation run completed; the false focus observations are failures. An initial diagnostic pass independently showed the same BODY failures and 340ms map correction. One intermediate attempt to activate Confirm with a synthetic Enter timed out before initiating a request; the completed verification used CDP mousePressed/mouseReleased and the actual response hold instead.

Tile requests were blocked to avoid external requests. Independently projecting the initial origin against actual DOM tile x/y and placement gives horizontal differences of 0.00022–0.24998px and an existing approximately 1px vertical border/overlay offset, consistent with REVIEW-FE-4. No stale-width marker displacement remains after settling. A no-ResizeObserver desktop check initially caught a transient 584/577 during layout change; waiting for the poll settled it to 577/577. This is consistent with the intended 400ms fallback, not a persistent map regression.

Lifecycle review: `MapView.jsx:48-53` clears the fallback interval, disconnects the observer and removes resize/orientation listeners. The modal removes its key handler at `ReplaceDiffModal.jsx:55`. The existing uncancelled 50ms primary-focus timeout remains at `:83-90`; no additional double-focus or persistent listener leak was demonstrated. No assistive-technology or long-duration heap test was performed.

## Required suites and real output

Commands from repository root:

```powershell
git merge foodtour-claude-coordinator
# Updating 6768e4d..138e158; Fast-forward
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
```

Captured at `C:/Users/tuana/AppData/Local/Temp/foodtour-fe5-test.log`:

```text
Ran 81 tests in 2.052s
OK (skipped=1)
OpenAPI matches server schema
Compiled successfully in 1243ms
ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
PASS: all available checks passed; expected skips are listed above
script_exit=0
```

The expected skip is legacy `test_planner.PlannerTests.test_budget_and_source`, which requires absent private Foody rows/source URLs. PowerShell also decorated pip's upgrade notice on stderr as NativeCommandError; the script completed successfully with exit zero and the above passing checks. No dependencies were upgraded.

Scratch commands:

```powershell
$reviewScratch=Join-Path ([IO.Path]::GetTempPath()) 'foodtour-fe5-review'
New-Item -ItemType Directory -Force $reviewScratch | Out-Null
git archive --format=tar HEAD frontend qa/e2e -o "$reviewScratch/source.tar"
tar -xf "$reviewScratch/source.tar" -C $reviewScratch
Set-Location "$reviewScratch/frontend"
npm ci
npm run build
npm test
```

```text
added 20 packages, and audited 21 packages in 12s
2 vulnerabilities (1 moderate, 1 high)
Next.js 15.5.28
Compiled successfully in 4.8s
Generating static pages (4/4)
ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
ci_exit=0 build_exit=0 test_exit=0
```

Started backend from `backend/`, frontend from scratch frontend:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:FOODTOUR_DATA_PATH=Join-Path ([IO.Path]::GetTempPath()) 'foodtour-fe5-absent.json'
$env:WEB_ORIGIN='http://127.0.0.1:13330'
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18130 --no-access-log
# Application startup complete
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18130'
npm run dev -- --hostname 127.0.0.1 --port 13330
# Ready in 1369ms
```

From scratch root, with the same API URL:

```powershell
node qa/e2e/test_api_scenarios.mjs
node qa/e2e/test_components.mjs
node C:/Users/tuana/AppData/Local/Temp/foodtour-fe5-review/probe.mjs
```

```text
QA-01 TEST SUMMARY: 36/36 PASSED
COMPONENT TESTS SUMMARY: 11/11 PASSED
api_exit=0 component_exit=0
probe_exit=0
```

No tokens or private venue details are included. The existing npm audit findings remain outside this report-only assignment. Scope is the requested narrow follow-up combined with prior gate reviews; previous tests of unrelated frontend flows were not all repeated in a browser. Claude must resolve the two remaining F9 blockers and obtain independent browser confirmation before the MVP frontend gate can be MERGE.
