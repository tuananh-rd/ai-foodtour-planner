# PH4-LAST-LOOK — independent narrow review

Date: 2026-10-16. Author: Codex. Reviewer: Claude.

**Recommendation: MERGE. Blocking findings: none.** F1 and F2 are closed within this review's scope. No new actionable regression was reproduced.

## Scope and closure evidence

Merged `foodtour-claude-coordinator` by fast-forward to `6158034`. Reviewed only `git diff 045db0e..6158034 -- frontend qa/e2e`: PreferencesPanel origin cleanup, the fresh default-preferences object in page.js, and cold-bootstrap assertions. No production files changed during this task.

| Item | Status | Evidence |
| --- | --- | --- |
| F1: completed unsaved place survives reset | Closed | `frontend/app/components/PreferencesPanel.jsx:133` now invalidates outstanding operations and clears input, error, loading, query and results on epoch changes; lines 142–152 restore coordinates/metadata from current preferences. `frontend/app/page.js:214` creates fresh defaults. My independent browser probe held the next session POST unresolved: the completed old label, coordinates and widget input were already cleared before that response. The same probe fails on `045db0e`. |
| Saved origin accidentally erased | No regression reproduced | Saved a synthetic selected origin through the real API PUT; compared the returned server preferences with the rendered coordinates and label after synchronization. All matched. The reset effect copies the supplied origin rather than replacing it with hardcoded default coordinates. New Session deliberately starts a different session with defaults. |
| Manual coordinates wiped within the same session | No regression reproduced | Entered manual coordinates using native input events, then changed budget. Coordinates survived. Local form edits do not change the parent `preferences` dependency. Server preference responses still synchronize the form, as before this diff (`PreferencesPanel.jsx:155`). |
| Geolocation/geocode state survives reset | Closed | Created a geolocation denial and separately held a geocode request while its input was disabled; after reset, denial disappeared, query was empty, input was enabled, and releasing the old response could not restore its origin. |
| Repeated fetches caused by the new effect | No regression reproduced | After saving and settling, venue-fetch count stayed fixed over another 700 ms; no unsolicited geocode call occurred. The new effect has no network call; widget setup still depends on client config (`PreferencesPanel.jsx:263`). |
| F2: TC-COLD-11 could pass with a frozen zoom | Closed | `qa/e2e/test_cold_bootstrap.mjs:551` establishes zoom 15 with individual pins before reset. Its assertion at line 591 requires zero clusters before/after reset and positive clusters after zoom 12. On `b4f9c2b`, this exact assertion fails with zero clusters after zoom 12; on `6158034`, it passes with two. |

## Independent production-browser probe

Used headless Edge/CDP with a separate profile, a cold bootstrap recording double returning the normal per-library exports, and real local API sessions. Google hosts were blocked. My separate probe did not call the supplied cold-suite assertions. Its fake autocomplete contains an actual shadow-root input in addition to value/clear operations. It holds session creation and geocoding responses explicitly, uses React-compatible native input events, and records booleans only.

Scratch: `$env:TEMP/foodtour-ph4-last-03s5kumo`. API/web ports: 18208/13208. Older builds used isolated 18197/13197 and 18185/13185. All six owned processes were stopped after verification. Human servers and shared `frontend/.next` were untouched.

Command, from the repository PowerShell:

```powershell
$env:WEB_URL='http://127.0.0.1:13208'; $env:CDP_PORT='9411'
node "$env:TEMP/foodtour-ph4-last-03s5kumo/independent-last.cdp.mjs"
```

Actual output (exit 0):

```text
{"probe":"cold_bootstrap","scriptLoads":1,"mapConstructors":1,"autocompleteConstructors":1,"unavailableBanner":false,"automaticGeolocations":0}
{"probe":"unsaved_selection_present","pass":true}
{"probe":"held_reset_clears_completed_unsaved_origin_and_widget","pass":true}
{"probe":"same_session_manual_coordinates_survive_unrelated_edit","pass":true}
{"probe":"saved_origin_matches_server_and_survives_preferences_sync","pass":true}
{"probe":"no_repeating_lookup_or_venue_fetch_after_sync","pass":true}
{"probe":"geolocation_error_created","pass":true}
{"probe":"reset_clears_geolocation_error","pass":true}
{"probe":"geocode_loading_created","pass":true}
{"probe":"reset_clears_geocode_loading_and_text","pass":true}
{"probe":"late_geocode_does_not_restore_origin","pass":true}
```

Repeated the exact probe against `045db0e` with WEB_URL port 13197 and CDP_PORT 9412: exit 1. The held-reset origin/widget assertion, geolocation-error cleanup assertion and geocode-loading/text cleanup assertion failed; the other seven assertions passed. This directly reproduces the old completed-state cleanup defect independently of TC-COLD-15.

## Supplied regression tests: fail before / pass after

Copied the **current** test script into each scratch checkout, leaving each checkout's frontend source and build unchanged. Verified all 18 tracked frontend files against their respective Git revisions: zero mismatches for `b4f9c2b`, `045db0e`, and `6158034`.

For each row ran:

```powershell
$env:NEXT_PUBLIC_API_URL="http://127.0.0.1:$apiPort"
$env:WEB_URL="http://127.0.0.1:$webPort"
$env:CDP_PORT="$cdpPort"
node "$scratch/qa/e2e/test_cold_bootstrap.mjs"
```

Actual command values and output summaries:

| Frontend | Scratch under `$env:TEMP` | API / web / CDP ports | Actual result |
| --- | --- | --- | --- |
| `6158034` | `foodtour-ph4-last-03s5kumo` | 18208 / 13208 / 9408 | Exit 0; `COLD-BOOTSTRAP SUMMARY: 15/15 PASSED` |
| `045db0e` | `foodtour-ph4-final-vvvvagh3` | 18197 / 13197 / 9409 | Exit 1; `14/15 PASSED`; only TC-COLD-15 fails |
| `b4f9c2b` | `foodtour-ph4-rereview-fzn1u2ao` | 18185 / 13185 / 9410 | Exit 1; `12/15 PASSED`; TC-COLD-11, 13 and 15 fail |

TC-COLD-11 measured, in each build: 10 pins and zero clusters before reset; zero clusters after reset at zoom 15. After zoom 12: **0** clusters on `b4f9c2b`, **2** on `045db0e` and `6158034`. Therefore the strengthened test detects the older N3 defect; it is expected to pass `045db0e`, where that production defect was already fixed.

TC-COLD-15 confirmed its unsaved-selection precondition in all three builds. Old label and nondefault coordinates persisted on `045db0e` and `b4f9c2b`; neither persisted on `6158034`. Widget value was empty after completed reset even on the older builds because client-config refresh reconstructs it. Consequently the combined assertion is meaningful for label/coordinates, while its widget subassertion alone does not distinguish old/new behavior after full reset. My held-response probe additionally checks input clearing before reconstruction.

## Build and contract checks

Fresh current scratch copy excluded `.next`, `node_modules` and environment files. From its frontend directory:

```powershell
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18208'
$env:NEXT_TELEMETRY_DISABLED='1'
npm.cmd ci
npm.cmd run build
npm.cmd test
```

Actual results:

```text
npm ci exit=0
npm build exit=0
Generating static pages (4/4)
Route (app) /: 30 kB; First Load JS: 133 kB
npm test exit=0
ALL 15 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
```

## Limitations

This is the requested narrow diff gate, not a repeat of the full backend or earlier frontend review. No live Google SDK/provider validation or external requests were performed by browser probes. The fake widget verifies the cleanup paths and reset lifecycle, but cannot prove compatibility with every internal implementation of Google's autocomplete shadow DOM. The production code tries value/clear and accessible input fallbacks defensively; normal completed reset also recreates the widget. No private venue data, tokens, keys, personal locations or request bodies are included in this report.

The only committed artifact is this report; its commit hash is reported through Orca after commit. Claude remains the merge reviewer.
