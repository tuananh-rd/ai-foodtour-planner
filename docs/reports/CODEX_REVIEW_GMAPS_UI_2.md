# Codex independent re-review: GMAPS-URL-2b

Decision: **REQUEST CHANGES** for the remaining L1 radio keyboard defect and the conditional M3 unmount guard gap described below. H1, M1 and M2 are fixed, and ordinary M3 races pass; no new high/medium regression was found with the unmodified adapter in the exercised synthetic flows. Reviewer: Codex (not the implementation author); implementation reviewed: `97fbb55`, merged through `foodtour-claude-coordinator` at `b377a49`. There is no subsequent frontend/QA diff between that implementation and the merged HEAD. Only this report is authored by this review.

## Finding disposition

| Finding | Status | Independent result |
| --- | --- | --- |
| H1: unsafe destinations | **FIXED** | Every requested hostile URL rejected in single and mixed split responses; accepted URL remains verbatim. Rejection disclosed; all rejected becomes unavailable. |
| M1: banner/reset/refetch loop | **FIXED** | Banner persists; exactly one real Retry button, 71.09×44px; keyboard Enter retries. Persistent failure remains at one request during idle, user retry increments to two, recovery retry to three. |
| M2: inaccurate URL-limit explanations/omitted notes | **FIXED** | Both partial and unavailable `url_too_long` fixtures explain URL limits, preserve notes and avoid the missing-coordinate explanation. HTML/script note payloads are escaped. |
| M3: order/race/mutation evidence | **NOT FIXED** (conditional unmount guard gap) | Order, ordinary delayed races, and four independent source mutation checks pass. With a scratch transport that completes delayed requests despite abort, an error after reset escapes the unmounted component into the shared banner queue. |
| L1: radio keyboard behavior | **NOT FIXED** | Roving tabindex and movement between the two choices work, but arrow navigation fails to wrap at boundaries. Details below. |

## Remaining L1 — arrow keys do not wrap

Location: `frontend/app/components/v2/MapsLinksBlock.jsx:149` (`handleToggleKeyDown`); coverage: `qa/e2e/test_maps_links_cdp.mjs:543`.

Right/Down always select driving; Left/Up always select walking. This fixes the previous absence of arrow handling, but leaves the radio-group keyboard pattern incomplete: pressing Right/Down on the last radio must return to the first, and Left/Up on the first must move to the last. Native Tab/Enter/Space behavior is not a substitute for those radio semantics.

Reproduction in the production scratch browser at 390×844: select/focus driving, then dispatch a browser `Input.dispatchKeyEvent` ArrowRight key-down/key-up pair. Driving remains `aria-checked=true`, `tabIndex=0`, and focused; walking remains unchecked with `tabIndex=-1`. Expected: walking selected and focused. The committed suite tests only walking→Right→driving and driving→Left→walking, so it passes despite this defect.

Required correction: choose the adjacent radio relative to the focused/current option and wrap at either end (for two options, each arrow selects the other). Add browser key-event coverage for both boundaries and all four arrows, retaining one tab stop and focus on the newly selected option. This is a residual low finding, not a new high/medium regression.

The trusted-key matrix confirmed walking→Right→driving passes, while driving→Right→walking, walking→Left→driving, driving→Down→walking and walking→Up→driving all fail. This is browser input evidence, in addition to source inspection and the suite's dispatched DOM key events.

## Conditional M3 — unmount relies exclusively on transport cancellation

Locations: `MapsLinksBlock.jsx:109` (catch side effect) and `MapsLinksBlock.jsx:140` (effect cleanup).

The unmodified adapter passes the supplemental delayed-error-after-reset test. To distinguish cancellation from generation/epoch protection, a separate scratch build changed only the delayed mock adapter's abort check from `if (options?.signal?.aborted)` to `if (options?.signal?.aborted && pendingDelay === 0)`. The real component, request-generation checks, reset flow and shared StatusQueue were unchanged. This deliberately permits an already-started delayed response to settle even after cancellation; it is not evidence that browser fetch ignores abort or that a live provider failure was reproduced.

Under that transport stress condition, the old success/error after a newer request tests still pass, but the delayed-error-after-reset test fails. Reset removes the component without running its next `[sessionId, sessionEpoch]` effect. Cleanup aborts the controller but does not advance `generationRef` or mark the instance unmounted, so a later non-AbortError still passes both ref comparisons and enqueues a global error after reset. Component-local state disappearing does not suppress that external queue side effect.

The captured state was `block:false` with banner text “Không thể tạo liên kết bản đồ / OWN delayed reset error / Thử lại”. The diagnostic rerun deliberately continued after that assertion to collect final network/desktop evidence: **69/70 assertions**, one failure (`OWN-RESET-ERROR`). Its process exit 0 reflects that diagnostic continuation and must not be interpreted as a passing stress suite. The earlier fail-fast stress run exited 1 at the same assertion.

Required correction: invalidate pending generations on unmount/effect cleanup (or check a lifetime token before any state/queue side effect), alongside abort. Add a committed delayed error after reset/unmount test that actually delivers the completion rather than being short-circuited into AbortError. This is a conditional robustness finding; normal browser behavior with the current cooperative transport remains passing.

## Independent browser evidence

- Ran `node qa/e2e/test_maps_links_cdp.mjs`: **53/53 assertions passed**, including URL filtering, exact order, split sequence, URL-limit explanations, error/retry count and delayed mode/reset responses. The initial PowerShell wrapper exited 1 after Node's DEP0190 warning despite reaching the full success summary and cleanup; this run is assertion evidence, not a claimed clean wrapper exit.
- Ran a UTF-8 temporary harness derived from that committed suite, preserving its acceptance assertions and adding independent probes: **70/70 passed**, Node exit **0** (only DEP0190 suppressed). It enabled CDP Fetch interception before navigation, retained Network observation throughout, and measured the final request count rather than only the initial screen.
- Supplemental single and split probes covered `evil.example`, HTTP, `www.google.com.evil.example`, `/other/`, credentials, port 8443 and `javascript:alert(1)`. Each single hostile response rendered zero anchors; each mixed split rendered precisely the original valid URL. No hostile link was clicked.
- Notes `<img src=x onerror="window.__pwned=1">` and `<script>window.__pwned=2</script>` appeared as `&lt;img`/`&lt;script`, with no corresponding element or execution (`__pwned=0`).
- Persistent error remained at request count **1** after an additional **1.8 seconds** beyond the suite's idle check. Exactly **one** action button existed. With the page brought to front and focus emulation enabled, actual CDP Enter key events invoked Retry: counts **2**, then **3**, with stable failure followed by recovery. An initial supplemental attempt omitted the Enter text/focus setup and did not activate the native button; the corrected run supersedes it.
- A supplemental **700ms delayed error** was consumed before clicking session reset; after completion, both the Maps block and error banner remained absent. The committed suite independently exercises a **600ms delayed success** after reset and delayed success/error after a newer **50ms** request.
- Final Google/gstatic request list was **[]** across planning, modes, hostile responses, failure/retry, races and reset. Fetch interception would block matching outbound requests; none reached it. `window.open` count was **0**, its second tracker remained **false**, and final location remained `http://127.0.0.1:13000/?ui=v2`. No Google navigation was invoked.
- At **390×844**, `document.documentElement.scrollWidth` and viewport width were both **390**. Walking/driving measured **81.75×44px** and **84.78×44px**; Retry measured **71.09×44px**. The screenshot was inspected: the persistent error, Retry, mode controls and privacy/proposal copy were visible and reachable without horizontal scrolling. Role/label/tabindex checks pass except the boundary navigation above. No screen-reader session was run.
- At **1440×900**, the V2 shell and one Maps block remained mounted; document scroll width **1425** was within viewport width **1440**. This is a desktop layout smoke check, not a second full desktop acceptance run.
- Flag-off navigation (`/?ui=legacy`, no flag in mock client config) rendered the legacy “AI FoodTour Hà Nội / CONTRACT V1.4” screen and no MapsLinksBlock. The implementation diff does not change `page.js`, the legacy map or feature-flag selection. This is an initial-screen regression check, not full legacy end-to-end certification.

## Independent real-source mutation runs

Each mutation changed only the scratch application's source before a fresh `next build`, then ran the committed acceptance assertions unchanged. These are not tests against hardcoded helper strings or merely post-render DOM removals. All builds succeeded, each browser run reached its expected failing assertion, and each cleaned up its server/browser and scratch build.

| Scratch mutation | First committed assertion that failed | Observed evidence |
| --- | --- | --- |
| Remove `rel="noopener noreferrer"` from application anchors | `TC-MAPS-LINK-ATTRS` | `target="_blank"`, `rel=null`, tag `A` |
| Reverse actual primary-anchor waypoint order while rendering | `TC-MAPS-ORDER` | Actual `[21.002000…,21.001000…]` differs from expected `[21.001000…,21.002000…]` |
| Remove disclaimer marker and its privacy/proposal sentences from component source | `TC-MAPS-PRIVACY-NOTE` | Rendered disclaimer acceptance fails |
| Remove exact-host rejection from the real URL validator | `TC-MAPS-HOSTILE-EVIL_DOMAIN` | Hostile anchor count 1, disclosure false, unavailable false |

The committed suite's own mutation section still uses DOM changes/response injection. Its ordinary acceptance assertions now demonstrably detect all four independently rebuilt implementation regressions; the independent proof above is stronger than that self-contained mutation section.

## Commands, scope and limits

- `node frontend/lib/contractTest.js`: **17/17**, exit 0.
- `node qa/e2e/test_components.mjs`: **41/41**, exit 0.
- Production scratch builds were outside the repository under `%TEMP%\foodtour-maps-build-*`; only synthetic frontend mock data was used. Frontend had no environment file to copy. Only web **13000** and CDP **18000** were used; no API server or private dataset was started/read, and no provider/key/live backend result is claimed.
- Local, unpublished evidence: `%TEMP%\codex-gmaps2-{baseline,rel,order,disclaimer,allowlist,supplement,noncooperative}.log`, temporary harness/generator files with the same prefix, and `%TEMP%\codex-gmaps2-mobile.png`. Build directories and server/browser processes were cleaned by the harness. These logs/screenshots contain synthetic fixtures only and are not committed/public artifacts.
- English privacy text remains inside the Vietnamese UI as before; it is visible and truthful in these checks. No new high/medium regression was demonstrated with the unmodified adapter. Final acceptance requires the remaining L1 boundary behavior and conditional M3 unmount guard/test to be corrected; implementation changes belong to the frontend owner.
