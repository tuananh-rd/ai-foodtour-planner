# Discovery location, verified models and optional web upgrade

Date: 2026-10-20. Baseline200405a/frontend4fdfe92. Codex owns backend/contracts/runtime/integration; Antigravity owns dispatched frontend/QA and affected review; Claude inactive. This report concerns the new allowance and must not be combined with the previous delivery's smoke counts.

## Acceptance status

Backend implemented and hermetic/actual synthetic HTTP checks passed. UI correction review and actual browser integration are in progress. Full live natural-chat acceptance and a second available verified model are **BLOCKED**, not passed.

## Screenshot root cause and fix

The exact request is `tôi muốn ăn phở với tráng miệng ở hai bà trưng`. The screenshot shows a stale Phố cổ preference and a generic tool authorization denial. An offline engine-level RED/GREEN transcript reproduces that denial using the200405a engine and current synthetic State/Tools for both cases; see `discovery-upgrade-authorization.json`. This isolates the authorization/parser change and is not a full old-runtime browser replay. The parser previously missed plain `ở` in this request, and read-only search incorrectly shared preference-mutation authorization restrictions.

Read-only search now uses server-bound area/food/price intent; details and comparison require known visible IDs. Explicit area/compound-food preferences replace stale criteria, clear old result/comparison cards and preserve selected venues. A/B references bind to the results at the start of the turn, and selection permission binds to its own clause: `So sánh A với B và thêm A` compares two and adds only A. Unknown IDs, selection versions, explicit confirmation nonces, allergies, session ownership and CAS remain enforced. District filters never silently become a same-named street when district coverage is absent; that edge case is verified with a deliberately limited fixture.

## Origin, distances and Maps

General chat remains available without onboarding. Venue search asks one origin question and retains pending food/area intent. Explicit catalog resolution presents server-issued candidates for selection; it does not claim arbitrary-address geocoding. Coordinates must be finite and inside the pilot region; unknown/wrong candidates do not replace an existing origin. No automatic Hoàn Kiếm default is introduced.

Result/selected/comparison distances come from the backend using validated venue coordinates and chosen origin. Haversine is labeled straight-line distance, with unknown values represented by null; no zero-coordinate fallback, road distance or ETA is invented. Changing origin recalculates ranking/distances and invalidates tour/confirmation while preserving selection order/locks. Actual origin and location-source fields remain compatible with legacy session rendering.

Existing free Maps URL construction preserves planner order and actual origin, uses HTTPS/api=1/travelmode, limits waypoints to three and encoded URLs to2048 characters, and splits contiguous legs. Missing points are disclosed; stored-address fallback does not invent addresses. No Maps API request occurs in these tests.

## Models and optional Tavily

The additive `discovery-v1` capabilities/settings endpoints separate Gemini chat model selection from default-off Tavily. Changing a model creates a session-local client identity sharing the existing ledger/transport/caps; it never mutates the global client or resets usage. Hermetic two-model fixtures validate isolation; they are not evidence of two live supported models.

Production lists only previously full-loop-verified `gemini-3.5-flash-lite`; it is currently unavailable because usable quota is exhausted. The actual key-scoped metadata endpoint also listed `gemini-3.1-flash-lite`, but metadata and its successful first native response do not prove a completed tool loop. Candidate3.1 remains outside the production registry after its continuation timed out. The user-visible limitation is a single verified, quota-disabled choice; a second actual model is not fabricated.

The original Tavily provider, transport and sanitizers are restored with the separate existing credit ledger. Free-plan/PAYGO/key-limit checks remain fail-closed, including null limits. Availability is not claimed until eligibility is proven. Synthetic QA forces the provider off. Web queries exclude private GPS/health/contact information; bounded sources carry URL/retrieval time/untrusted status and cannot modify preferences, selection, hours or allergy evidence. No live Tavily call, source-page fetch, billing or credit purchase occurred.

## Verification evidence

| Check | Evidence | Result |
|---|---|---|
| Backend targeted regression and restored free-only provider guards |137 unittest checks, including discovery, protocol, presentation, upgrade, Tavily/search safety/transport, conversation, extractor and Maps links | PASS |
| Actual synthetic HTTP journey | [discovery-upgrade-api.json](discovery-upgrade-api.json), backendcbe95af,57 checks | PASS; actual replies/results inspected,3-stop planner/explicit240minutes/Maps origin tested;0 provider requests |
| Deterministic schema | `tools/export_openapi.py --check` | PASS |
| Key-scoped model metadata | [discovery-upgrade-model-metadata.json](discovery-upgrade-model-metadata.json) |1 metadata GET, no generate/debit,13→13 |
| New live Gemini/local dataset | [discovery-upgrade-live.json](discovery-upgrade-live.json) | BLOCKED;1 user turn/2 model transports/0 retries |
| Frontend mock contract/build | Antigravity author9e6e8b8, UI QA report |46 unit/25 mock-browser checks initially passed; source-review corrections and actual browser acceptance pending |

The HTTP probe initially contained an incorrect fixture assumption that Hai Bà Trưng had no rows; inspection showed real synthetic rows and the check was corrected to validate district membership. An explicit unknown-area request separately tests no-data behavior. Its first3-stop plan at120minutes was correctly infeasible; the accepted journey explicitly requests240minutes. These are harness/fixture corrections, not hidden product passes or silent constraint relaxation.

## Live blocker and quota accounting

The new smoke uses the actual configured local dataset through application routes without exporting records, IDs, personal GPS, health or keys. Before this smoke the persistent ledger already contained13/18 calls; earlier activity is not attributed to this task. Lower existing limits allowed only one planned user turn/two requests despite the new upper allowance of3/6.

Request1 returned HTTP200, response model `gemini-3.1-flash-lite`, STOP, with two native search calls. Server-validated local results showed the new area/foods, preserved two selected venues and created no tour. Request2, returning function results to the model, timed out. The app retained validated tool results with an explicit incomplete-explanation message. This is useful fallback evidence, **not natural model reply success**. `provider.reply_source` now distinguishes model/tools/rules independently of configured provider mode.

Afterward usage is15/18, remaining3 equals reserve3; reset2026-10-20T07:00:00Z (14:00 Asia/Saigon). No further live request, retry, cap increase, paid model/provider change or billing activation is performed. The one-shot verifier refuses replay when its evidence artifact exists. Finishing live chat quality/multiple-model verification requires legitimately available quota in a later explicitly bounded test; the current implementation does not auto-probe after reset.

## Runtime and integration checkpoint

New task-owned API8230 is synthetic/rules; API8320 uses private local data and the existing Gemini configuration, currently quota-blocked. Existing user-facing3300/8300 and3310/8210 lanes remain untouched. New sessions use the `discovery-upgrade` namespace; old sessions/private datasets/secrets/ledgers are preserved. Final browser URLs/source commits will be recorded after frontend review and isolated production builds.
