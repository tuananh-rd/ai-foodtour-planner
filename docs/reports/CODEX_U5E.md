# U5e independent guided-flow review

Reviewer: Codex. Author: Antigravity; engine: Claude. Date: 2026-10-17.
Reviewed integration: `f3da507`, merged from `foodtour-claude-coordinator` by fast-forward into `foodtour-codex-backend`. Reviewer changes are limited to this report and `qa/e2e/codex_guided_review.mjs`; no production fixes or contract changes.

**Verdict: REQUEST-CHANGES.** No tested path created a tour with an open allergy obligation, and Maps remained a free URL link. However, pending questions disappear on ordinary replies, focus management fails, and confirmation misstates a per-person budget as a group budget.

## Ranked findings and reproduction

### Major F1 — an unanswered safety question and all its chips disappear

1. From an empty guided page, enter `Tour 3 quán quanh Hồ Gươm tối nay, mình bị dị ứng nhẹ với mấy thứ rang giòn`.
2. Enter `lập tour đi`, then `ok` in the UI.
3. Observe the reply: `Mình vẫn đang chờ bạn trả lời câu hỏi ở trên (bấm một nút hoặc gõ câu trả lời) rồi mình làm tiếp.`
4. There are **zero** question cards and no allergy chips. `xác nhận` also leaves no question. The allergy remains unresolved and no tour is created.

Reload restores the allergy question. A user can also type the missing substance, but the displayed instruction points at controls that no longer exist. `GuidedLayout.jsx` derives `clarifyBlock` exclusively from the latest reply; a nudge does not repeat that block. Preserve/reconstruct the persisted pending question until it is answered, including after concurrent revision recovery. This is a UI failure, not an observed planner bypass.

There is also obsolete discovery copy at the confirmation stage: an assistant bubble asks whether to find more dishes while the confirmation card asks whether to create the tour. Counting only `clarify-question-card` misses these two simultaneous visible decision questions.

### Major F2 — focus does not move to the next question; the safety row and next task are below the viewport

After submitting S0, the active element has no question-chip test ID on both viewports. The effect queries `[data-testid="clarify-option-0"]`, but actual chips use option IDs such as `clarify-option-budget_group`. Keyboard completion succeeds by manually tabbing through the page; automatic focus management does not.

Measured after the first reply, without the driver's subsequent scroll-to-target:

| Element | Desktop 1280×800 top/bottom | Mobile 390×844 top/bottom |
|---|---:|---:|
| Allergy row | 842 / 899 px | 933 / 990 px |
| Budget question card | 1005 / 1201 px | 1115 / 1332 px |

The required allergy information and next action are outside the initial viewport. The driver's mouse path scrolls controls into view, and Tab scrolls the keyboard path; neither proves the advertised focus behavior. Fix the selector and focus/scroll the current question with a sensible route to the summary. The author's screenshots named `03_time_chips`, `06_confirm_card`, and `07_tour_timeline_maps` likewise show the top summary rather than the named controls.

### Major F3 — confirmation changes the meaning of a per-person budget

Replay S0, select `Mỗi người`, enter `19h`, select `Đi bộ`, then `Dùng những quán này`. The understood budget row correctly shows `500.000 đ (mỗi người)`, while the confirmation details show `2 người • từ 19:00 • tối đa 500.000 đ cả nhóm`. `ConfirmSummaryCard.jsx` appends `cả nhóm` unconditionally. Preserve the selected scope in the explicit confirmation; it is a material financial preference, even though venue prices remain source ranges. No tour was created in this test.

### Minor F4 — expected failure paths emit production console errors

The 5000-character rejection, rapid invalid submission, injected HTTP 500, injected HTTP 409, and offline request emit `[GuidedLayout] Turn error: ApiError...` via `console.error`. There were no uncaught runtime exceptions. The visible messages are calm Vietnamese and contain no raw JSON, but the task's zero-console-errors condition is not satisfied. Handle expected validation/conflict/offline failures without production error-stack logging.

### Minor F5 — seven semantic actions are not seven physical actions or the original plan's four remaining actions

The author's count is reproducible **using its definition**: type/send S0; choose group budget; type/send 19h; choose walking; accept proposals; confirm; open Maps. Counting each typed entry and its submit separately gives nine actions before focus, scrolling, or Tab presses; double-confirm stress adds one attempted activation. This is six semantic actions after the first submission, so it does not satisfy plan §6.6's `≤4 thao tác sau khi gõ`. Do not state compliance with that stricter target without changing the flow or explicitly revising the metric.

## Independent method and evidence by requested item

The independent driver uses installed Google Chrome through CDP, a real uvicorn API, an isolated SQLite database, and a scratch production Next build. It sends text with CDP input events and activates real controls by pointer coordinates or Tab/Enter; it does not substitute backend calls for the user's S0 journey. Both 1280×800 and 390×844 complete S0; the mobile pass is keyboard-only. Synthetic input is the labeled `contracts/fixtures/venues.chat.synthetic.json` fixture. Backend configuration is `FOODTOUR_LLM=mock`, `FOODTOUR_CHAT_V2=1`, `FOODTOUR_UI_GUIDED=1`, routing estimate, geocoder off; credential-like environment variables are removed from child environments. Only ports **13100 / 18100 / 19300** were used for browser harnesses, serially. No live Gemini, Google Maps API, billing, push, or deployment.

1. **Exact S0 and every visible stage.** Initial summary → budget-scope question → start-time question → walking question → proposed venues → confirmation → timeline → Maps. Summary rows show Hồ Gươm; 2 people; 3 stops; 120 minutes total; evening; phở and bún chả; 500,000 VND with `chưa rõ phạm vi`; peanut allergy. No start time is invented from evening. Every normal clarification has one question card. Chips are HTML buttons with nonempty accessible names. Chrome's accessibility tree also names both text inputs using their placeholders. First reply has a populated polite live region. F1 covers the missing-question exception.
2. **Confirmation and safety.** Network tracking covers chat POST bodies and responses as well as tour endpoints. No confirmation action or tour request precedes the explicit confirm click; no timeline appears early. Double activation sends one `confirm_yes` request in each viewport. Cue-only allergy, typed `lập tour đi`/`ok`/`xác nhận`, inline edits, visible non-answer controls, reload, a second tab with the same session, a detached stale chip, and unknown free-text `wasabi` are exercised. The second tab restores the obligation and its typed planning attempt creates no tour. Wasabi prompts explicit confirmation. No open-obligation tour was observed. This is finite adversarial testing, not proof for all natural-language input.
3. **Honest itinerary and Maps.** Timeline prices say `theo nguồn`, leg times `ước tính`, and hours `nguồn ghi`, including the source-hours uncertainty. The allergy note explicitly says no venue has been confirmed safe and asks the diner to check ingredients. The anchor opens an actual second browser target with an `https://www.google.com/maps/dir/` URL. Google navigation is blocked before external loading; the link itself is inspected, not Google's live routing behavior. No Maps API requests, key query parameters, or key patterns in DOM/static bundle were found.
4. **Robustness and accessibility.** 5000 characters, HTML/script payload, repeated RTL/emoji/zero-width input, and rapid double submits produce no script execution or horizontal overflow at 390px. HTTP 500 and 409 are injected at the POST transport boundary; OPTIONS is allowed through. Errors show Vietnamese messages without the sentinel private debug field, raw JSON, or internal error codes. CDP offline mode gives a calm retry message. F4 records console logging. Keyboard-only S0 completes; F2 records failed focus behavior. No fixed/sticky bars were found, so there are no overlapping fixed bars. CDP page scale 2 and CSS zoom 2 reflow were checked; relevant controls stay inside the viewport. This is automated zoom/reflow evidence, not a separate manual browser-menu zoom test.
5. **Contrast sampling.** Emulated `prefers-color-scheme: light` and `dark` return the same light palette. Main ink `#231f1a` on white: **16.38:1**; ink on chip `#f3ece0`: **13.95:1**; warning `#92400e` on `#fef3c7`: **6.37:1**. All sampled pairs pass 4.5:1. This is token sampling, not an exhaustive WCAG or screen-reader certification.
6. **Flags via client-config.** CDP intercepts only the client-config response and changes feature booleans; no URL override is used. Guided off/chat on gives classic chat v2. Guided/chat/ui-v2 off gives the original v1 panel. Guided/chat on restores guided mode. The full author regression gates below additionally exercise legacy behavior.
7. **Privacy/security.** Git tracks no `.env`, `.env.local`, `.env.production`, or CSV dataset; `.env.example` is a template. Scanned all 555 tracked text files for credential patterns: zero matching files; separately scanned tracked docs/QA text for private Foody venue URLs and raw CSV headers: zero matches. Two earlier security scripts contain regex expressions, not credentials. Inspected all four U4a and fourteen U4b screenshots visually: no key, environment file, token, or private venue record visible; venue names in confirmation screenshots are explicitly `[SYNTHETIC]`. Source rows were not copied into this report. Twenty-five built static JS files were scanned for Google-key and credential-query patterns: zero matching files. Diff versus `45308ad` is empty for frontend package manifests/lockfile, Next config, and backend security middleware; main.py's changes do not alter CORS/header setup. CSP/headers and dependencies are unchanged by this series. No `.env` or private CSV was opened.
8. **Usability.** Independently counted seven semantic actions to an opened Maps target on each viewport. A DOM MutationObserver measured submit-to-rendered-reply at **74.7 ms desktop / 90.6 ms mobile**; the enclosing driver calls took **453 / 503 ms**, including its fixed waits and input overhead. These are two local mock samples, not backend p95 measurements. The author's 1.0–1.4 s cannot be treated as a direct speed comparison: its helper inserts roughly 0.95 s of sleeps around each turn. No live-model latency or five-human-user study was performed. F5 explains the action-count definitions.
9. **Mutation sensitivity and serial regression.** Recorded in the execution ledger below. Faults affect scratch source only; production source remains unchanged.

## Execution ledger

Backend: `PYTHONPATH=backend .venv/Scripts/python.exe -m unittest discover -s backend/tests -t backend` — **557 tests, OK, one skipped**, 66.903 s. OpenAPI: `.venv/Scripts/python.exe tools/export_openapi.py --check` — **matches server schema**.

| Serial suite | Result |
|---|---:|
| `node qa/e2e/test_guided_ui.mjs` | 42/42 pass |
| `node qa/e2e/test_guided_e2e.mjs` | 24/24 pass |
| `node qa/e2e/test_ui_v2.mjs` | 28/28 pass |
| `node qa/e2e/test_components.mjs` | 48/48 pass |
| `node qa/e2e/test_ui_kit.mjs` | 11/11 pass |
| `node qa/e2e/test_maps_links_cdp.mjs` | 61/61 pass |
| `node frontend/lib/contractTest.js` | 18/18 pass |
| `node qa/e2e/test_chat_v2.mjs` | 31/31 pass |

All browser gate port variables (`UI_CHAT_*`, `UI_GUIDED_*`, `UI_V2_*`, `UI_KIT_*`, `MAPS_*`) were overridden to the allocated ports; `BROWSER` points to installed Google Chrome and `PYTHON` to this worktree's virtual environment. Incidental screenshot rewrites by the existing suites are restored from the reviewed Git revision and excluded from this review commit.

Independent final run: **127 assertions; 119 pass, 8 fail; exit 1, no harness fatal error**. Failures map to the reported findings: two focus assertions, two conflicting-question assertions, per-person confirmation, two missing pending-question assertions, and console errors. The app target recorded **304 requests, including 37 chat POSTs; zero Google Maps API requests**. Screenshot/key/privacy evidence is separate from these assertion counts.

All eight existing frontend gates exit 0 (**263 assertions**). The independent driver intentionally exits nonzero for the observed review defects.

| Scratch-only mutation | Observed independent failure | Exit |
|---|---|---:|
| Render a second question | `S0 1280 first reply: single question`, count **2** | 1 |
| Automatically invoke confirmation when the summary arrives | `S0 1280 confirmation pending: explicit confirmation gate`, real API tour already exists before the driver's confirm click | 1 |
| Remove the allergy row | `S0 1280 visible allergy row`, false | 1 |

Each mutation completed a production build and reached its intended browser assertion; none is a syntax/build-error substitute. The automatic-confirm mutation performs a real premature chat confirmation, rather than merely adding a fake timeline element. Source modifications stayed inside the harness's temporary frontend copy. No mutation changes are in this commit.

Reproduce with `node qa/e2e/codex_guided_review.mjs`; choose a fault with `U5E_MUTATION=questions`, `auto_confirm`, or `allergy` in the environment. The default JSON evidence output is the OS temp file `codex-u5e-evidence.json`; set `U5E_OUTPUT` to retain separate runs. It contains only synthetic review interactions and derived check results, so do not run this harness against a private dataset. Review checks are intentionally red on this reviewed integration until the reported production defects are fixed.

## Handoff

Request Antigravity to fix F1–F3 and add nudge/reload, focus, and budget-scope regression coverage, then have Codex re-review the focused changes and Claude rerun the integrated gate. Preserve the successful deterministic obligation gates and free Maps URL behavior. Backend/provider tests used mocks/synthetic data; no live provider, production DB, or allergy-safety certification is claimed. Review of this report/driver and integration ownership remain with Claude; this is not a self-approved merge.
