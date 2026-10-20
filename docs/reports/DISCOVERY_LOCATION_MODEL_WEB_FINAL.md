# Location/model/web local integration acceptance

Date: 2026-10-20. Production frontend source: `3e7d1f0c4743e3ef15ea3fa18490ddce00554115`.

Local test URL: **http://127.0.0.1:3320**; actual backend: **http://127.0.0.1:8230**. This lane is explicitly **synthetic dataset / rules**, not live Gemini. The production snapshot excludes environment files and is independent of the source build directory. Final HTTP check returned 200; acceptance below comes from inspected responses and rendered behavior, not that status alone.

## Integrated changes and review

Antigravity checkpoint `a99cdc1` was rejected because completed build/unit output did not resolve Maps lifecycle and coverage findings. Codex Luna/high corrected them in `1cf74e7`; a bounded same-worker follow-up was committed by the coordinator as `076edd2` to avoid repeated Git-index permission prompts. Integration commits are `c61f9ea`, `f38869d`, and `3e7d1f0`. Sol reviewed the changes; Luna supplied focused checks and documented its browser-testing limitation before coordinator acceptance.

Completed-tour navigation now uses authenticated backend `getDiscoveryMapsLinks`, retains ordered split links and validated address fallback, displays partial/unavailable/skipped reasons and translated sanitized notes, and avoids client legs for authoritative incomplete responses. Session/token/revision/origin/mode/stop identity and abort cleanup prevent stale responses from restoring previous links. Origin and destination are required; URL allowlist, api=1, expected mode, three-waypoint and 2048-character bounds are checked. Hooks run before conditional return. GPS shares the chat operation lock, and callback identity prevents old GPS completion from changing a new request/session.

## Evidence

| Verification | Result and scope |
|---|---|
| Worker focused checks | `qa/discovery-upgrade/test_maps_gps_lifecycle.mjs` PASS on final follow-up; mocked endpoint/helpers plus source guards. The existing 93/0 unit result and earlier worker build remain separate evidence; coordinator did not rerun them. |
| Rendered Maps lifecycle | `discovery-upgrade-maps-rendered.json`: **10/10 PASS**, real headless browser rendering the actual component in an isolated Next dev snapshot with controlled endpoint responses. Covers loading without coordinate fallback, partial/address link and translated skipped notes, session switch, empty reply, transport error, driving mode, late stale response, absent origin, and null-tour hook transition. No JS exceptions. |
| Final production build | `discovery-upgrade-final-build.json`: **exit 0**, one final integration build, source `3e7d1f0`; retained output `discovery-upgrade-final-build.log`. |
| Actual API + production browser | `discovery-upgrade-final-browser.json`: **17 checks PASS** before a GPS harness readiness timeout. Actual synthetic backend: exact screenshot sentence asks for origin without blanket authorization denial; chosen origin gives distances; explicit confirmation creates a five-stop planner tour. Browser session restore displays every authoritative server Maps link in order. No overflow/emoji at 1280, 1440, 1920, 2560 and 390 widths. This sets up the tour through API actions, then verifies the rendered production app; it is not evidence of typing the whole journey through the UI. |
| GPS production-browser continuation | `discovery-upgrade-gps-browser.json`: **10/10 PASS**, fresh actual application session with simulated browser geolocation callbacks. No request on initial load; pending locks chat; denied/unavailable/timeout and synchronous failure release state; success saves chosen coordinates through the actual backend. No JS exceptions. Physical GPS and a browser session-reset race while GPS is pending were not exercised; callback identity/reset paths have focused source/mock evidence. |

Initial failures are preserved: `discovery-upgrade-maps-rendered-initial.json` expected an untranslated mock transport string even though the API client intentionally replaces it with Vietnamese; the corrected assertion checks the visible error element without a CTA. The first integration browser artifact retains its GPS readiness timeout: the harness clicked a disabled origin button during session initialization. The GPS-only continuation waits for readiness. `discovery-upgrade-gps-browser-initial.json` used a textarea selector for the product's input control; the corrected selector tests the real `discovery-input`. No product source was changed for these harness corrections, no successful test was rerun without a failure, and no additional production build occurred.

The earlier backend regression remains 138 PASS at `f98f099` and actual API evidence remains 73 PASS at `e01590f`; these were not replayed. Synthetic fixture coordinates and records only were used in new evidence. No private dataset/profile export, provider request, paid Maps API, Tavily call, cap increase, billing activation, push or deployment occurred.

## Live limitations and ownership

Live Gemini quality remains **BLOCKED**, not passed: existing evidence records one user turn/two requests, initial native tool response then continuation timeout, ledger 15/18 with remaining three equal to reserve three. No new probe or retry occurred during this integration. Only the previously verified model is listed; another available compatible model is not invented. Tavily remains default off and unavailable because the authorized environment lacks configuration and free-only eligibility has not been proven; this does not block the synthetic/local UI lane.

Codex Sol owns backend/runtime/review/integration; the single retained Codex Luna/high terminal owns frontend/QA follow-ups. Antigravity has been removed; Claude is inactive. All settled workers have a retention/release decision, and the Run has zero reclaimable worker terminals. Shell/Git metadata permission handling was scoped to the relevant command or coordinator commit; no global/bypass setting was introduced. The helper recovery uses invocation-only `windows.sandbox=mxc` with workspace-write/on-request and a successful worker `Get-Location` preflight.
