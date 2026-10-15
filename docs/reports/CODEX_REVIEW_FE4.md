# REVIEW-FE-4 — independent browser gate

Reviewer: Codex; review owner: Claude. Date: 2026-10-15. Reviewed HEAD `c8452d726f6af383d103f735705b4ec2735bbddb` after `git merge foodtour-claude-coordinator` (fast-forward). The reviewed production commit changes only `MapView.jsx` and `ReplaceDiffModal.jsx`.

**Recommendation: MERGE-AFTER-FIXES.** F8/B1 is closed in current Edge. F9/B2 is partially closed: ordinary Tab wrapping and Escape restoration pass, but successful replacement loses focus and the pending request leaves keyboard focus outside the modal. Both remaining modal cases below block this gate. Passing unit/SSR suites do not cover them.

## Findings

| Severity / status | Evidence and concrete failure | Suggested fix |
| --- | --- | --- |
| P2 / blocking / F9-B2 partially open | `frontend/app/components/ReplaceDiffModal.jsx:53-61` saves a DOM node and restores only if it is still connected. `frontend/app/components/TourTimeline.jsx:78` keys a stop by venue identity. A successful server replacement unmounts the invoking button. After clicking “Hoàn tất & xem lịch trình”, Edge reports `original:false, newStopButton:false, activeTag:'BODY', body:true`. Escape before replacement correctly restores the original control. | Have the parent provide a stable restoration target, such as the replacement control at the same stop order, with a focusable timeline heading fallback. Restore after the new DOM commits; test successful replacement followed by Done and Escape from the completed diff. |
| P2 / blocking / F9 busy-state failure | `frontend/app/components/ReplaceDiffModal.jsx:32-34` prevents Tab with zero focusable elements; the dialog at lines 90-94 has no focusable fallback. All action/close buttons become disabled (`:125`, `:207`, `:224`). Hold the actual `/tour/replace` response: focus becomes `BODY`, enabled buttons = 0; real Tab and Escape leave the dialog open with focus still outside. The user cannot navigate to the pending dialog while the request is outstanding. | Make the dialog focusable (`tabIndex=-1`) and move focus there when the focused action becomes disabled; contain Tab on that fallback. Keep dismissal policy deliberate while busy and restore focus on completion/error. Test with a deliberately delayed response, including initial focus recovery. |
| P3 / nonblocking compatibility limitation | `frontend/app/components/MapView.jsx:38-45`: if `ResizeObserver` is unavailable, initial hidden-to-visible activation still retains width 600 for a 332px container. The map is not blank, but markers are horizontally displaced by about 134px relative to tile coordinates. Dispatching orientationchange corrects width to 332. | If browsers without ResizeObserver are supported, trigger measurement when the tab becomes visible or provide a small fallback observer. Otherwise explicitly require ResizeObserver-capable browsers. |

## Independent real-browser verification

Used a fresh headless Microsoft Edge 155.0.4283.45 process and native CDP WebSocket commands from an external Node probe. This is live React DOM and real `Input.dispatchKeyEvent`, not the QA SSR tests. The scratch Next.js dev server calls this branch's own uvicorn on `127.0.0.1:18120`; frontend runs on `127.0.0.1:13320`. A nonexistent absolute FOODTOUR_DATA_PATH forces the labelled synthetic fixture. No private rows were read. Tile network requests were blocked: marker agreement is checked against actual DOM tile positions plus independently calculated Web Mercator coordinates; this does not claim downloaded tile imagery or a live routing provider was validated.

At mobile startup the map is hidden. Clicked “Bản đồ”, read the SVG viewBox and container clientWidth, then resized and dispatched orientationchange:

```text
390x844 initial hidden -> visible: container=332 viewBoxWidth=332 markers=1
430x844 resize:                    container=372 viewBoxWidth=372 markers=1
844x390 orientation:               container=359 viewBoxWidth=359 markers=1
1280x900 desktop:                  container=577 viewBoxWidth=577 markers=1
```

The viewBox/container width difference is zero in all four cases. Marker-vs-tile projection differences were 0.00022–0.24998 CSS px horizontally and approximately 1.00003px vertically (the existing bordered viewport/380px overlay sizing; approximately 1px, not a stale-width scaling displacement). This closes the original stale 600px mobile defect. No blank map occurred in these cases.

Generated a real three-stop synthetic tour, focused the second stop's replace button, opened the modal, and used keyboard events. Delayed the actual replacement fetch response in the page only to observe busy state; then released it and used the returned server replacement:

```text
Tab last->first true
ShiftTab first->last true
eight Tabs contained true
Escape restore true
busy initial { inside: false, enabledButtons: 0, activeTag: 'BODY' }
busy Tab/Escape { stillOpen: true, inside: false }
confirm original connected false
confirm focus restore {
  original: false, newStopButton: false, activeTag: 'BODY', body: true
}
no ResizeObserver initial {
  container: 332, viewBoxWidth: 600, deltaX: 133.99998, markers: 1
}
no ResizeObserver orientation {
  container: 332, viewBoxWidth: 332, deltaX: 0.00022, markers: 1
}
probe_exit=0
```

The probe exits zero when the observation run completes; the false observations above are review failures, not passing assertions. Ordinary Tab/Shift+Tab containment and Escape restoration are fixed. Successful confirmation restoration and busy focus recovery are not fixed.

Static lifecycle review: `MapView.jsx:46-49` disconnects its observer and removes both resize/orientation listeners; `ReplaceDiffModal.jsx:48-50` removes its key handler before effect replacement/unmount. No accumulating listener mechanism was found. The existing 50ms focus timeout at `ReplaceDiffModal.jsx:64-70` is not cancelled, so rapid transition/double-focus behavior deserves a cleanup guard; no additional persistent leak or double-focus regression was demonstrated. No heap-duration soak or assistive-technology run was performed.

## Commands and actual results

All frontend npm work was in the external archive copy:
`C:/Users/tuana/AppData/Local/Temp/foodtour-fe4-aafc87a06b204a1cbc29bdc695e01d9a`.
The repository test script uses its own scratch frontend build. No production file was edited during this review.

```powershell
git merge foodtour-claude-coordinator
# Updating 472a7a0..c8452d7; Fast-forward

powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
```

Actual captured output (`C:/Users/tuana/AppData/Local/Temp/foodtour-fe4-test.log`):

```text
EXPECTED-SKIP: legacy data/venues.json absent; this source-specific test requires
private Foody rows and URLs, not the synthetic Venue fixture.
[test_planner.PlannerTests.test_budget_and_source]
Ran 81 tests in 2.274s
OK (skipped=1)
OpenAPI matches server schema
Compiled successfully in 1178ms
ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
PASS: all available checks passed; expected skips are listed above
script_exit=0
```

Scratch creation and npm commands:

```powershell
$reviewScratch='C:/Users/tuana/AppData/Local/Temp/foodtour-fe4-aafc87a06b204a1cbc29bdc695e01d9a'
git archive --format=tar HEAD frontend qa/e2e -o "$reviewScratch/source.tar"
tar -xf "$reviewScratch/source.tar" -C $reviewScratch
# In scratch-root/frontend:
npm ci
npm run build
npm test
```

The archive extraction was also repeated after the probes to verify it still matches HEAD. Actual npm output:

```text
added 20 packages, and audited 21 packages in 13s
2 vulnerabilities (1 moderate, 1 high)
Next.js 15.5.28
Compiled successfully in 3.1s
Generating static pages (4/4)
ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
scratch_build_exit=0 scratch_test_exit=0
```

These existing dependency audit findings were not changed or remediated in a report-only task.

Local service commands (backend working directory, then scratch frontend working directory):

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:FOODTOUR_DATA_PATH=Join-Path ([IO.Path]::GetTempPath()) 'foodtour-fe4-absent.json'
$env:WEB_ORIGIN='http://127.0.0.1:13320'
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18120 --no-access-log
# Application startup complete; Uvicorn running on http://127.0.0.1:18120

$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18120'
npm run dev -- --hostname 127.0.0.1 --port 13320
# Ready in 1701ms
```

From scratch root:

```powershell
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18120'
node qa/e2e/test_api_scenarios.mjs
node qa/e2e/test_components.mjs
node C:/Users/tuana/AppData/Local/Temp/foodtour-fe4-aafc87a06b204a1cbc29bdc695e01d9a/probe.mjs
```

```text
QA-01 TEST SUMMARY: 36/36 PASSED
COMPONENT TESTS SUMMARY: 11/11 PASSED
api_exit=0 component_exit=0
probe_exit=0
```

QA output was captured locally; token-prefix output from the existing suite is excluded from this report. The external probe and logs remain local temporary review artifacts, not committed data. Only this report belongs in the commit. Claude should address the two blocking F9 cases and obtain another browser check before accepting this gate.
