# Codex C6b independent frontend review

**Decision: REQUEST CHANGES.** Reviewed C3-1 `56b70a2`, present in merged coordinator `c3213c2`; no C6a changes are present on this reviewed tree. Reviewer: Codex; implementation owner: Antigravity; Claude reviews Codex evidence. No repository frontend or author E2E files were modified. All mutations and instrumented pages were confined to production scratch copies outside the repository, using web 13000 and CDP 18000 only.

## HIGH — profile edits fail the real API, including allergy edits

`frontend/app/components/v2/chat/ProfileBar.jsx:124` assigns `editVal.trim()` to a generic patch field. Real browser captures from the unchanged component are `{party_size:"3"}`, `{budget:"250k mỗi người"}`, `{allergies:"cua"}` and `{tastes:"ít cay"}`. Reproduction: open each profile chip, enter the quoted value, save; replay the captured action through real POST /chat using a fresh synthetic session. **All four requests return HTTP 422**, with no accepted update. Party size requires a strict integer, budget needs budget_vnd/budget_scope, and allergy/taste fields are not accepted ChatPatch keys. The mock acceptance test checks chip presence or sends natural language instead of validating these editor requests. Evidence: C6_FRONTEND_diagnostics.json profileActions and C6_FRONTEND_PROFILE_API.json; `review_c3_profile_api.py` replays the exact browser captures. Use contract-supported structured actions or the agreed text flow and show a successful saved state before claiming allergy/preferences were recorded.

## HIGH — 409 Retry never adopts the server revision

`ChatV2Layout.jsx:188` calls getChatState and updates chat only. `frontend/lib/api.js:1672` discards the session revision when returning chat; the layout never changes its revision after a conflict. Independent browser reproduction uses the real layout and a scratch-only deterministic transport: one initial success, two synchronous submissions, then server revision advances to 9 and returns 409 for stale revisions. The layout fetches chat, displays “đã được đồng bộ”, and Retry sends revision **2 again**; a second 409 and second refetch occur. Captured request revisions before retry `[0,1,1,2]`, after `[0,1,1,2,2]`; GET count increases from 1 to 2. Restore a complete session snapshot/revision and retry using current state. This is a controlled transport simulation, not a live concurrent-session test.

## MEDIUM — duplicate submissions pass the asynchronous state guard

`ChatV2Layout.jsx:108` uses React state for its guard and sets state only after checking it. With a 200 ms transport delay, dispatch two submit events on the actual chat form in one browser evaluation before React commits busy. **Both requests reach transport with revision 1** (calls increase from 1 to 3), and two user bubbles appear. Reproduction is in review_c3_browser.txt; the component/form source is unchanged. A synchronous ref guard is needed at the shared dispatch boundary. The monotonic request token does discard the older request's result within one mounted layout, but does not prevent the extra mutation attempt. Cross-session switching/unmount cancellation was not dynamically validated; the request token is not tied to a session epoch.

## MEDIUM — safety/concurrency test gates survive removal

Run `node qa/chat/review_c3_frontend.mjs <mode>`; each run copies real source into a fresh scratch build and runs the author's entire E2E suite, without using its --mutation success override:

| Independent mutation | Observed author-suite result |
|---|---|
| allergy: replace `{hasAllergyUnknown && (` with `{false && (` in BlockRenderer | **16/16 PASS**, exit 0 |
| fallback: replace `cell.value || 'Chưa rõ'` with `cell.value || ''` | **16/16 PASS**, exit 0 |
| guard: remove layout guard, composer busy check and busy propagation/disable checks | **16/16 PASS**, exit 0 |

Evidence: C6_FRONTEND_MUTATION_ALLERGY/FALLBACK/GUARD.txt. The unmodified suite also passes **16/16** in C6_FRONTEND_CLEAN_OUTPUT.txt. These are semantic mutations that compile, not build-failure evidence. Compare assertions explicitly accept any nonempty table (`hasChuaRoFallback || cellCount>0` at E2E line 710); behavior test line 888 checks only budget/understanding labels and never submits twice or causes a 409; allergy test checks profile/safety notice rather than the card flag. Tour-ready test line 860 accepts an empty wrapper; its passing output has **stopCount=0**. Security test submits hostile user text instead of delivering hostile server strings to every renderer. Flag-off assertion checks a generic title rather than comparing computed styles. Add focused tests with unknown cells, allergic card flags, delayed duplicate requests, actual 409 recovery and populated itinerary/maps assertions.

## MEDIUM — keyboard focus escapes profile dialog

Open the real profile editor, then Tab five times: focus begins in the input, reaches Cancel and Save, then leaves the dialog for BODY and a background button. Escape leaves the dialog open. No focus trap, aria-modal, Escape handler, input label or return-focus mechanism is implemented. Browser evidence: dialogFocus and dialogAfterEscape=true. This dialog was opened with a click; Tab and Escape were actual CDP keyboard events. Normal workspace traversal was also sampled, but this is not a screen-reader audit. New assistant messages have an aria-live=polite region; sampled visible workspace buttons are all at least 44px, and the author's mobile tab/44px checks pass.

## MEDIUM — hostile long names break layout

All eight block types were rendered from the real BlockRenderer in a scratch-only route, passing hostile server fields containing `<img onerror>`, `javascript:`, an RTL override and 5,000-character names. **Zero script execution, injected images or javascript anchors** occurred, including tour_ready with a populated stop. React text escaping is effective in these probes; no raw HTML insertion or server-controlled executable URL was found in the reviewed renderers/delegates. However the combined renderer harness grows to **100,538 CSS pixels** at a 1,280-pixel viewport and still overflows under mobile emulation. Long names in card/summary flex children lack adequate wrapping/min-width bounds; bidi controls are retained without isolation. The width measurement is from a standalone renderer harness, not a production-shell overflow measurement. Reproduce /review using review_c3_scratch.txt and compare scrollWidth to viewport; constrain/wrap untrusted labels and verify inside the real responsive shell too.

## MEDIUM — old tour can remain after server invalidates it (source finding)

`ChatV2Layout.jsx:138` updates tour only when res.tour is truthy. Reproduction from source: receive a valid tour, then an accepted profile edit whose API response explicitly has tour=null and only text/notice blocks. The old tour state and latestExploreBlocks remain, so the previous tour_ready remains available. The existing API contract invalidates prior tours on relevant preference changes; handle explicit null and clear dependent exploration state. This transition was inspected in source, not independently exercised in the browser.

## LOW — reused itinerary/evidence components have mismatched props

`BlockRenderer.jsx:649` passes status/reasons/unknowns separately to EvidenceStrip, whose only data input is tour. It therefore always uses missing-tour fallback; the nested ItineraryView renders another EvidenceStrip with tour. `BlockRenderer.jsx:662` supplies a no-op onInitiateReplace, so the existing itinerary replace button cannot dispatch a chat replacement. Session and token are passed to the separate MapsLinksBlock but not ItineraryView's nested maps component, and onResetTour/preferences/map handlers are omitted. Exercise populated itinerary controls and pass the existing component interface explicitly before calling integration complete.

## Compatibility, honesty, performance and limits

Independent pre-change `e8b5b0b` versus current production snapshots compare all visible element computed colors/background/font/box/layout properties and rectangles, control labels/disabled states and visible text at 1280×800. Both flag-off routes (`/` legacy and `/?ui=v2`) **match exactly**. This finite initial-state comparison does not prove every legacy interaction unchanged. The original tests additionally exercise mobile tabs at 390px and geolocation granted/denied stubs. Source handles unsupported geolocation and timeout with fallback text and does not transmit coordinates until confirmation; repeated geolocation request races were not tested.

Card templates correctly distinguish venue price ranges, unknown/source hours, estimates and low review counts. Weather fixture text acknowledges lack of weather data; no positive unsupported open-now, per-person meal price or allergy-safe assertion was found in the ordinary UI copy reviewed. “Lưu ý an toàn” is a caution label, not an assurance. Hostile source assertions are escaped as text rather than semantically sanitized by the frontend, so the server's cleaned content boundary remains necessary.

Production bundle and first-load transfer measurements are retained in C6_FRONTEND_PERF_OUTPUT.txt and C6_FRONTEND_perf.json, with the pre-change comparison in C6_FRONTEND_PRECHANGE_OUTPUT.txt/C6_FRONTEND_prechange.json. Measurements are cold-cache local browser loads; performance entries report encoded JS bytes, not parse/execute time or a field performance score. The chat fixture is statically imported into lib/api.js even flag-off, so lazy UI activation does not remove all added data/client code from the old path. No paid or live external service was used.

| Route | Pre-change encoded JS bytes | Current encoded JS bytes |
|---|---:|---:|
| `/`, chat flag off | 138,299 | 143,695 |
| `/?ui=v2`, chat flag off | 154,191 | 160,344 |
| `/?chat=v2` | N/A | 162,498 |

These final measurements use uninstrumented frontend source, with no review pages or transport substitutions. Chat-on adds 18,803 encoded bytes over current legacy flag-off in this run; flag-off itself increases 5,396 bytes versus pre-change. Next production build reports `/` 40.4 kB and first-load JS 143 kB. Cold navigation/compilation timing was not benchmarked across repeated samples. The final uninstrumented current snapshots also exactly match pre-change for all 163 visible legacy elements and 45 visible UI v2 elements, controls and text.

Validation: clean author E2E **16/16**, three semantic mutations **16/16 each (gate failure)**, frontend contract tests **18/18**, independent hostile-renderer/concurrency/409/profile/focus diagnostics and real in-process API replays. Initial Edge CDP startup failed; Chrome completed the durable final runs. A first Chrome run ended before suite summary and is not counted as a pass. No public deployment, secrets, private datasets, real chat histories or venue rows were used. Reports and review harnesses only; Antigravity must implement fixes and receive independent re-review.
