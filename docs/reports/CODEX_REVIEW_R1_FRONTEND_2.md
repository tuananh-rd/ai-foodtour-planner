# Independent Codex re-review — R1-5b UI_V2

Date: 2026-10-16. Reviewer: Codex, independent of author Antigravity. Reviewed fix commit `554a548` at integration HEAD `5f94721`, after the requested `git merge foodtour-claude-coordinator` fast-forward. Baseline findings: `docs/reports/CODEX_REVIEW_R1_FRONTEND.md` (F01–F09).

**Decision: REQUEST CHANGES.** The three original high-severity interaction failures are repaired, but evidence rendering now makes unsupported verification claims, and flag-off styling still changes legacy controls. A new quick-answer workflow also resends an already submitted answer instead of planning. Only this report was changed; no implementation or QA files were edited.

## Execution and isolation

- Read the project rules, ownership/task documents, Word reference, Phase 4 plan, and installed Orca guides. All coordination used the assigned Orca Dispatch; no additional workers or external channels.
- Ran `$env:UI_V2_PORT='13000'; node qa/e2e/test_ui_v2.mjs`: production build succeeded, **23/23 PASS**. Mobile first-stop top was **773.5px** at 390×844; desktop **497px** at 1280×800. These pass the supplied viewport threshold, with much less mobile headroom than the prior 316px result.
- Independently exercised a production build with `NEXT_PUBLIC_API_MODE=real`, `NEXT_PUBLIC_API_URL=http://127.0.0.1:18000`, a local synthetic Node HTTP fixture server on **18000**, and headless Edge/CDP against Next on **13000**. No server used 3000/8000. No private dataset, DB, provider credentials, paid calls, or public artifacts were used.
- Builds/source copies were outside the repository under `%TEMP%`. Independent real-mode build: `codex-r1-review2-3W9cML`; controlled baseline: `foodtour-uiv2-build-Eat5RP`. Scratch harnesses: `codex-r1-review2*.mjs`, `codex-r1-baseline2.mjs`, `codex-r1-mutation2.mjs`, `codex-r1-rating-mutation2.mjs`, and `codex-r1-verified-price2.mjs`. They are convenience files, not required report dependencies.
- Controlled baseline restored `app/page.js`, `app/globals.css`, `app/layout.js`, and `lib/api.js` from `a2735e8^` within a scratch copy, retaining installed Next 15.5.28/dependencies. Restoring layout matters because R1-5b moved token imports there. This compares the legacy page against its pre-R1-5 presentation; it is not a complete historical repository benchmark.
- Independent harnesses spawned Next directly and terminated their own server/browser processes. Expected mutation failures below are intentional test results. An initial probe clicked a suggestion and submit in one JavaScript turn before React state updated; that harness error was corrected by separating the interactions, then the clarification probes passed. Independent harnesses print observations rather than registering suite cases, so their `0/0` footer is not acceptance evidence.

## Disposition of original findings

| Finding | Disposition | Reproduction and evidence |
|---|---|---|
| F01 — banner object crashes | **FIXED** | Actual HTTP 422, 401, 410, 409, 503, and 500 responses each produced exactly one `.ft-banner`, an accessible action button, and no application-error page. Clicking 422/500 retry issued `/tour` and rendered three cards; 401/410 created a new session; 409 retried the operation; 503 opened preferences. Shared Banner now renders object actions as buttons. Page's existing `handleRetry` dispatches the saved operation context. |
| F02 — discarded outcomes / hardcoded evidence | **NOT FIXED** | Empty-stop `no_solution` and `insufficient_evidence` now both show synthetic reason, proposed change, and checked explanation; the original silent loss is fixed. Conditional tour also shows these fields. However, the new EvidenceStrip misreads evidence fields and can claim verified hours without verification; see R2-N01. This prevents closing the whole finding. |
| F03 — hidden clarification | **FIXED** | Actual `/messages` response containing `missing_slots:["duration_min"]`, `questions:["SYNTHETIC_QUESTION_DURATION"]`, and `notes:["SYNTHETIC_NOTE"]` visibly rendered question, note, and quick-answer controls. Conversation text is rendered. New quick-answer resend regression is recorded separately as R2-N02. |
| F04 — null walking becomes zero | **FIXED** | Three-stop fixture with `walk_minutes:null` and `venue_range_upper_sum_vnd:null` rendered `chưa rõ thời gian đi bộ` and `chưa rõ khoảng giá quán`, with neither `~0 phút` nor `≤ chưa rõ`. Numeric walking values are tested by type rather than truthiness. |
| F05 — fabricated venue count / missing synthetic disclosure | **FIXED** | Mock suite and independent real-mode response with `dataset_source=synthetic` both visibly showed `DỮ LIỆU GIẢ LẬP` / `Mẫu thử giả lập (synthetic)` without `dev=1`. Hardcoded 1,702 count is removed; missing count metadata no longer invents a count. |
| F06 — focus and open-sheet targets | **FIXED** | Real Tab from header reset focused the request input with `:focus-visible=true` and computed solid 2px accent outline. At 390×844, open preferences preset, latitude, longitude, duration each measured **44px** high. Supplied suite measured 30 open-sheet controls with zero undersized controls, including selects. Scope leakage of this fix is F07. |
| F07 — flag-off presentation rollback | **NOT FIXED** | Reset/mode buttons and root tokens now match baseline: 30px/26px and absent `--bg`/`--shadow-lg`. But legacy preferences change: baseline preset/lat/lon/duration = **40/36/36/40px**, current = **44/44/44/44px**. Both measured after opening legacy preferences at `/`, feature false and no V2 query. Unscoped IDs in tokens.css still affect the old layout. |
| F08 — assertions pass with missing why/rating | **FIXED** | Unmodified suite passed 23/23. Injecting the original removal of `[data-why-chip], [data-venue-rating]` immediately before `const stopDetails` now fails **TC-V2-10**, `0/3`, exit 1. A separate rating-only deletion preserves why `3/3` but fails **TC-V2-11**, `Ratings: []`, exit 1. Suite also now triggers real mock error states and opens both sheets. Remaining coverage limits are below. |
| F09 — eager inactive V2 / gallery shipping | **FIXED** | `next/dynamic` separates V2. First-load JS is **135 kB**, down from original R1-5 **143 kB**, versus controlled baseline **133 kB**. Flag-off browser resource list omitted V2 dynamic chunk `489.db66135cc1c5661e.js` and its companion `50-cb86cd16f59c1340.js`; manifest identifies both as V2 imports. `/ui-kit` returned **HTTP 404** without its opt-in env flag. Gallery build artifacts remain, so this is runtime/initial-load isolation, not complete removal of gallery code from output. |

## Remaining and new findings

### R2-N01 — HIGH — evidence strip infers verification from object presence

Location: `frontend/app/components/v2/EvidenceStrip.jsx:38`, `:42`, and expanded detail text. This is a regression within F02's evidence correction.

`hoursUnknown` only tests whether the entire `stop.hours` object is absent or `tour.unknowns` includes hours. The API provides an Hours object with `status`, `display`, and `open_at_arrival`; object presence does not establish verification. Independent synthetic response used three stops with `hours:{status:"unknown",display:"<synthetic source text>",open_at_arrival:null}`, a conditional tour, and no hours entry in the aggregate unknown list. Expanding the evidence strip displayed:

> Giờ mở cửa: Đã xác thực theo lịch hoạt động thực tế của từng quán trong hành trình.

The response explicitly says unknown. This adversarial field-consistency probe is not a claim that the deterministic planner currently emits that combination; it proves the UI promotes unknown field evidence into a verification claim rather than handling the discrepancy conservatively.

There is also a straightforward valid-field mismatch: the API's Price uses `stop.price.evidence` values `verified|estimate|unknown`, but the strip tests `stop.price_evidence !== 'verified_exact'`. A second probe supplied verified per-person prices (`min_vnd=max_vnd=40000`, `semantics:'per_person'`, `evidence:'verified'`), verified hours, and a conditional tour with `unknowns:['route']`. The strip still displayed `Chưa chắc: giá theo người` and said prices were a general venue range rather than per-person evidence. `verified_exact` is not an API Evidence enum value.

Required: consume the frozen nested evidence fields, retain unknown status on disagreements, and derive price/routing/hour copy from those fields. Add normal and contradictory synthetic evidence tests; object presence must never justify a verified claim.

### F07 follow-up — MEDIUM — token scoping remains incomplete

Location: `frontend/app/ui/tokens.css:275`–`:278`. The selector list ends with global `#pref-origin-preset`, `#pref-custom-lat`, `#pref-custom-lon`, and `#pref-duration`, with `min-height:44px !important`. These IDs also exist in legacy PreferencesPanel. The observed 40/36/36/40 → 44/44/44/44px change is reproducible on the flag-off page. Scope these selectors to V2/sheets or obtain an explicit revision of the rollback requirement. TC-V2-15 only checks header buttons/root tokens and misses the regression.

### R2-N02 — MEDIUM — quick clarification answer remains pending after being sent

Location: `frontend/app/components/v2/RequestArea.jsx:236`–`:285`.

Quick-answer handlers both set input text and immediately call `onSendMessage`. After clicking the 60-minute answer, the browser input still contained `Đi trong 60 phút` after the response completed. Clicking `Lập hành trình` next issued another **POST `/messages`**, with no `/tour` call. The already sent answer is submitted a second time, potentially spending another extraction request and confusing the clarification-to-planning path. The same handler pattern affects all five quick-answer buttons.

Required: either prefill only and let the user submit, or send immediately and clear the input. Prove one answer yields one message submission and the following plan action reaches `/tour` once required preferences are complete.

## Additional regression checks and limits

- Reset/stale response: delayed `/tour` by 700ms; invoked the actual header reset callback after 100ms to exercise cancellation despite its disabled busy button. After completion, zero stale cards and plan enabled. This is a forced callback race, not a user click on a disabled control.
- Pending geolocation across reset: retained the old callback, reset, reopened preferences, then delivered old coordinates (19,103). New fields remained defaults (21.033,105.85).
- Sheet keyboard checks: focus entered the dialog; Tab from its last enabled control wrapped to the close button; Escape closed and focus restored to the explicitly focused invoker. Reduced-motion emulation yielded `transitionDuration=1e-06s`.
- Lazy-loading flag-off initial resources were checked independently; V2 later loaded and worked through the same production page. No lazy-load chunk failure was observed. No network throttling/chunk-download failure simulation was performed.
- Supplied map check opens MapSheet, but no configured Google provider was exercised. A zero route-layer count in an unavailable map remains weaker than testing a map provider double with both real-route and estimate geometries. No live Maps/Places/Routes validation is claimed.
- Suite comments advertise more coverage than implemented: the normal error test exercises 422/503, not 401/410/409; this review independently covered those. It tests no_solution, not insufficient_evidence; this review covered both. Evidence cardinality/collapsed state is still an existence predicate, and rollback is not a full computed-style comparison. Mutation sensitivity itself is now genuinely demonstrated.
- Restoring TourStatusBanner also brings English `Conditional`, `Insufficient Evidence`, and `No Solution` text into normal V2 outcomes. The jargon check runs on the initial screen and misses later `Conditional`. This is a remaining presentation cleanup, not an additional safety blocker.

| Production measurement | `/` page size | `/` first-load JS | `/ui-kit` build-reported first-load JS |
|---|---:|---:|---:|
| Controlled pre-R1-5 page/layout/API | 30 kB | 133 kB | 112 kB |
| Original R1-5 (prior review) | 36.8 kB | 143 kB | 112 kB |
| R1-5b, independently rebuilt mock and real | 32.7 kB | 135 kB | 113 kB; runtime 404 by default |

No contrast audit, screen-reader session, live geolocation hardware, DB, paid provider, or latency benchmark was performed. Reviewer for this report/integration disposition: Claude coordinator. R1-5b needs author corrections for R2-N01, F07, and R2-N02, followed by independent review; this report does not approve merge or enablement.
