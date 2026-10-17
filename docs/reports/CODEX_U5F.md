# U5f independent final confirmation

Reviewer: Codex; production authors: Antigravity (UI) and Claude (engine). Date: 2026-10-17. Reviewed `c93b10a..579f1e6`, after a clean fast-forward merge from `foodtour-claude-coordinator`. This review changes only its driver and report; Claude owns review/integration of this commit.

**Verdict: REQUEST-CHANGES.** The normal v1.9.2 flow and all existing regression gates pass, but the legacy tour endpoint bypasses the guided safety/confirmation gate, confirmation content changes on reload, and real concurrent recovery can hide the current safety question behind a stale confirmation.

## Findings and reproduction

### Major F1 — legacy tour endpoint bypasses an open safety obligation

1. Create a guided session, submit S0, choose group scope, and submit 19h, reaching the combined proposal/confirmation.
2. Submit `mình bị dị ứng nhẹ với mấy thứ rang giòn`; the engine replaces confirmation with an unresolved allergy question.
3. Without confirming, POST `/v1/sessions/{id}/tour` with the owned session token and current `base_revision`.
4. Observe HTTP 200 and a `conditional` tour with **two stops**.

`backend/app/api/routes.py:335` calls the planner directly and commits its result without inspecting guided pending state or obligations. This route predates the reviewed diff; the new chat safeguards do not cover it. Guard all tour-generation entry points for guided sessions, preserving intentional legacy behavior only outside guided sessions. The independent driver records status/stop count only, never session credentials or returned venue records. Chat-action bypass checks separately pass.

### Major F2 — reload changes the confirmation the user is asked to approve

Replay S0, choose `Mỗi người`, submit 19h, then reload before confirmation. Before reload the confirmation names three synthetic venues and displays `khoảng 34 phút` per venue. After reload the venue names become internal IDs and the visit row becomes `khoảng 30 phút/quán`. Scope and start time remain correct; no tour is created merely by reloading.

`GuidedLayout.jsx:149` reconstructs confirmation from `profileToUnderstoodItems` and `chat.shortlist`; the former omits `visit_min`, and the latter contains IDs/status rather than names. `ConfirmSummaryCard.jsx:41` supplies a hardcoded 30-minute fallback, while line 94 falls back to venue IDs. Preserve or regenerate the canonical confirmation names and inferred visit minutes on restoration rather than substituting different assumptions. This is directly relevant to the new combined proposal/confirmation card.

### Major F3 — real 409 recovery retains confirmation and hides the new safety question

1. In the browser reach S0's combined proposal/confirmation.
2. In another owned client for that same session, submit `mình bị dị ứng nhẹ với mấy thứ rang giòn`, replacing server confirmation with a safety question and incrementing revision. The driver performs this as a separate HTTP client; its earlier second-tab tests use a real second Chrome target.
3. Click the first tab's stale `Đúng, lập tour` button. The server correctly rejects the old revision with 409, and the UI fetches the current session.
4. Observe the resync error banner, the **old confirmation card and active confirm buttons**, and **zero allergy question cards/chips**. No tour is created. Reload restores the allergy question.

`GuidedLayout.jsx:486` accepts the latest message's confirmation even when refreshed `chatState.pending` is now a different kind. Line 510 consequently suppresses clarification. The 409 handler updates chat/revision but does not replace the old message blocks. Derive the active decision from the current pending state, discarding an incompatible previous confirmation and reconstructing the current question. This is the remaining U5e F1 case: ordinary nudges, same-question injected conflicts, and reload pass, but a real conflict that changes the pending decision fails. The backend chat safety guard holds; the failure leaves the user unable to answer through the displayed decision controls.

## Method and scope

Read the complete changed backend engine, guided components, contract text, generated guided fixtures, and QA diffs. Used installed Chrome/CDP, isolated uvicorn/SQLite, a scratch production Next build, and labeled synthetic venues. Only ports 13100/18100/19300 were allocated. Child environments exclude credential variables; API uses mock extraction, estimated routing, and no geocoder. No production edits, dependency changes, push, deployment, billing, live Gemini calls, Maps API calls, or reading environment files/private CSVs.

The independent driver retains the earlier desktop and keyboard-only mobile journeys, expected-error console monitoring, stale controls, second-tab session restoration, hostile input, feature flags, free Maps link opening with external navigation blocked, and accessibility/contrast checks. Added v1.9.2 checks cover transport actions against open obligations, preplaced shortlist/default provenance, stale confirmation revision, repair before reconfirmation, new safety cues after proposals, entire mobile confirmation geometry, action counts, vehicle preservation and editing, venue removal after Sửa, confirmation reload fidelity, actual concurrent revision recovery, and the legacy tour endpoint.

## Verified improvements

The normal S0 flow is initial request → budget scope → start time → combined proposal/confirmation → explicit confirmation → timeline/Maps. Independent semantic counting gives four actions after initial submission: choose budget scope; type/submit 19h; confirm; open Maps. Both 1280×800 and 390×844 meet this definition. Counting typing and its submission as separate physical actions remains a different metric; focus/scroll/Tab and deliberate duplicate activation are excluded from semantic counts.

Walking is stored with source `default` and disclosed as `Đi bộ (mặc định)` in the confirmation. A stated motorbike survives the default, and Sửa followed by a vehicle change works. No dedicated vehicle row is displayed in the understood card; editing is through the repair/text path.

Initial confirmation renders venue names, an inferred visit-minutes row, correct group/per-person scope, and a single decision question. The complete card fits both tested viewports without fixed-bar overlap. Sửa exits confirmation; a subsequent natural-language removal acknowledges removal and creates no tour.

Unanswered allergy questions survive ordinary nudges, injected 409 resync, reload, stale chips, and second-tab attempts in the covered cases. Direct chat request_plan, confirm_yes, pick_option with confirm_yes or obsolete propose:use, and confirm_no do not bypass an open obligation. With a preplaced shortlist, request_plan presents confirmation, stale revisions receive 409, confirmation immediately after Sửa does not plan, and a new unresolved allergy cue prevents chat planning.

## Execution ledger

Backend unittest discovery: 557 tests, OK, one skipped, 50.037 seconds (51.55 seconds including runner overhead). OpenAPI drift: matches server schema.

| Existing serial gate | Result | Wall seconds |
|---|---:|---:|
| test_guided_ui | 42/42 | 38.57 |
| test_guided_e2e | 24/24 | 65.57 |
| test_ui_v2 | 28/28 | 25.80 |
| test_components | 48/48 | 0.79 |
| test_ui_kit | 11/11 | 17.65 |
| test_maps_links_cdp | 61/61 | 35.75 |
| frontend/lib/contractTest.js | 18/18 | 0.13 |
| test_chat_v2 | 31/31 | 94.08 |

All eight existing frontend gates exit zero, 263 assertions total. The intermediate independent driver passed before the additional recovery/bypass probes were added; the final driver is authoritative for this report. All suites ran serially with the allocated port overrides and installed Chrome/worktree Python. Generated screenshot rewrites were restored from the reviewed revision; they are excluded from the commit.

Final independent run: **157 assertions, 153 pass / 4 fail, exit 1, no harness fatal error**. This adds **30 independent assertions** over the merged 127-check driver. The failures map to F1 (one assertion), F2 (names and minutes, two assertions), and F3 (one assertion). There are **zero runtime exceptions and zero application console.error emissions**, including the validation/500/409/offline paths, resolving U5e F4. The browser target recorded 403 requests including 44 chat POSTs, with zero Google Maps API requests; direct Node transport probes are additional and excluded from those browser counts. The bundle scan covered 25 static files, zero credential-pattern matches.

Reproduce with `node qa/e2e/codex_guided_review.mjs`; output defaults to the OS temp file `codex-u5f-evidence.json` or `U5F_OUTPUT`. It starts and tears down its own API/web/Chrome processes and refuses occupied allocated ports. The reviewed integration intentionally returns nonzero until these findings are resolved. S0 has five semantic actions from an empty page, four after its initial submission, on both desktop and keyboard-only mobile; Maps opens a real second Chrome target with external navigation blocked. The confirmation card is fully visible on both widths and contains no overlapping fixed bars. Unsupported-area input gives calm clarification with no tour; this is not claimed as live geocoder or exhaustive zero-result search validation.

## Limits

Finite synthetic/local tests do not establish allergy safety, live provider correctness, production database behavior, or exhaustive natural-language coverage. Earlier scratch mutation hooks remain in the driver. Reports contain synthetic interaction evidence and aggregates only; no session credentials or private venue datasets are committed. The confirmation UI hides its text composer and exposes explicit decision buttons; the underlying legacy chat parser also accepts natural-language confirmation, so this report does not claim that an API can prove a physical mouse click. Author fixes and Claude cross-review/integration remain outstanding; this commit is an independent review, not self-approval of production changes.
