# Codex final independent review: GMAPS-URL-2

Decision: **ACCEPT** for GMAPS-URL-2 overall. Both remaining findings from `CODEX_REVIEW_GMAPS_UI_2.md` are fixed, and the exercised acceptance flows show no new blocking regression. Reviewer: Codex, not the implementation author; reviewed implementation `6b53d0e` (R1-5e), merged with `git merge foodtour-claude-coordinator` to `94213e4`. This review authors only this report.

## L1: fixed

The committed suite and independent supplemental harness both exercised trusted browser `Input.dispatchKeyEvent` key-down/key-up pairs at 390×844. All eight combinations passed:

| Starting option | Right | Down | Left | Up |
| --- | --- | --- | --- | --- |
| Walking | Driving | Driving | Driving (wrap) | Driving (wrap) |
| Driving | Walking (wrap) | Walking (wrap) | Walking | Walking |

Each assertion checks actual focus on the destination, destination `aria-checked=true` and `tabIndex=0`, and the other option `aria-checked=false` and `tabIndex=-1`. These are browser input events, not manually dispatched DOM KeyboardEvents. The implementation now computes the next option relative to the originating option, modulo the number of options.

## Conditional M3: fixed

The production component now invalidates generations in effect cleanup, marks lifetime unmount, and checks lifetime/generation/epoch before delayed success or error side effects. Retry also checks lifetime before dispatching another request.

For an independent transport stress, I changed only the scratch mock transport's abort condition to `if (options?.signal?.aborted && pendingDelay === 0)`. Every delayed response therefore completes despite abort, independently of the author's `__MOCK_MAPS_IGNORE_ABORT` hook. Immediately after this condition, instrumentation records the delivered response type and aborted signal. Component instrumentation wraps the original state setters and enqueue call, recording calls after an independently observed lifetime cleanup without suppressing calls or changing application guards.

| Scenario | Transport completion observed | Post-unmount setter/enqueue calls | UI result |
| --- | --- | --- | --- |
| 600ms delayed error after UI session reset | Error, signal aborted | 0 | No block or banner |
| 600ms delayed success after UI session reset | Success, signal aborted | 0 | No block or stale link |
| 700ms delayed error after separate parent unmount | Error, signal aborted | 0 | No block; shared queue empty |
| 700ms delayed success after separate parent unmount | Success, signal aborted | 0 | No block; shared queue empty |

The separate scratch parent keeps the StatusQueue provider mounted and unmounts the real MapsLinksBlock without changing session ID or epoch. Requests were confirmed consumed before unmount. Thus these checks distinguish lifetime protection from cancellation, session reset, and React silently ignoring setters. Ordinary older-success/older-error after a newer request also pass with this independent transport override.

The committed `--fail-before` probes rebuild `c8100f1:frontend`, injecting only the abort-bypass transport hook. Both assertions fail against that source: driving+Right remains driving, and the delayed error after reset leaks `NONCOOPERATIVE delayed reset error` into the shared banner. The committed diagnostic mode intentionally continues and exits **0**, so that exit is not a passing acceptance result. A temporary copy retaining the exact same predicates but restoring throw-on-failure for the M3 assertion additionally exits **1** at `FB-M3-NONCOOP-RESET-ERROR`; no production fix was backported to the old source.

## Regression evidence

- `node qa/e2e/test_maps_links_cdp.mjs`: **61/61**, exit **0**, production scratch build.
- Independent temporary harness derived from that suite: **86/86**, exit **0**. It retains acceptance assertions and adds transport/call observations, a separate parent unmount, hostile single/mixed split cases, escaped notes, longer idle, native keyboard Retry, final network observation, desktop smoke and flag-off smoke.
- `node frontend/lib/contractTest.js`: **17/17**, exit **0**.
- `node qa/e2e/test_components.mjs`: **47/47**, exit **0**.
- Hostile `evil.example`, HTTP, Google lookalike host, invalid path, credentials, port 8443 and JavaScript URLs are rejected. Mixed split responses retain the original valid URL verbatim; all rejected responses disclose rejection and become unavailable. No hostile link was clicked.
- Partial/unavailable `url_too_long` explanations and server notes pass. HTML/script notes remain escaped text without injected elements or execution. Exact decoded waypoint order, exact split URL sequence, link attributes and privacy/proposal disclosures pass.
- Persistent failure stays at request count **1**, including an additional **1.8s** idle check. Exactly one real Retry button exists. Browser Enter activation advances the count to **2**, preserving stable failure, then **3**, recovering and dismissing the banner.
- Google/gstatic request observation remains **[]** through the complete independent acceptance run. CDP Fetch blocking was enabled before navigation as a precaution; no matching request was observed. No Google link was opened; automatic-open checks pass.
- At **390×844**, document and viewport widths are both **390**. Retry is **71.09×44px**, walking **81.75×44px**, driving **84.78×44px**. The production screenshot was visually inspected: persistent error, Retry, mode controls and privacy/proposal copy are visible and usable without horizontal overflow. Primary-link touch-target and reachability assertions also pass.
- At **1440×900**, the V2 shell retains its Maps block without horizontal overflow. Flag-off `/?ui=legacy` renders the legacy `AI FoodTour Hà Nội / CONTRACT V1.4` screen with no MapsLinksBlock. This is a smoke check, not complete legacy acceptance or screen-reader certification.

## Independent source mutations

Each mutation changes the actual scratch application source before a fresh production build and runs the committed acceptance predicates. All four builds succeed and all four browser runs exit **1** at the expected assertion below. The suite's own DOM/response mutations also pass, but are not used as substitutes for these source regressions.

| Scratch source mutation | Expected failing acceptance assertion |
| --- | --- |
| Remove anchor `rel="noopener noreferrer"` | `TC-MAPS-LINK-ATTRS` (`rel=null`) |
| Reverse primary-link waypoint order during rendering | `TC-MAPS-ORDER` (actual decoded order reversed) |
| Remove disclaimer marker and privacy/proposal text | `TC-MAPS-PRIVACY-NOTE` |
| Remove exact-host rejection from actual URL validator | `TC-MAPS-HOSTILE-EVIL_DOMAIN` (hostile anchor rendered) |

## Scope and evidence locations

All builds use `%TEMP%\foodtour-maps-build-*`, outside the repository, with synthetic mock data and only web **13000** / CDP **18000**. No backend server, private dataset, provider credential, paid service or public artifact was used. Temporary component instrumentation, isolated route and transport changes exist only in scratch builds; no frontend or QA implementation file is authored by this review.

Local unpublished evidence: `%TEMP%\codex-gmaps3-{baseline,fail-before,independent,rel,order,disclaimer,allowlist,negative}.log`, the corresponding temporary harness/generator files, exit receipts and `%TEMP%\codex-gmaps3-mobile.png`. These contain synthetic fixtures only. Build/server/browser cleanup is performed by each harness. Live backend/provider behavior remains outside this frontend mock review; English privacy text inside the Vietnamese UI remains as previously disclosed.
