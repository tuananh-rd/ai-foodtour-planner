# Task board — upgrade R0 + R1-lite (docs/UPGRADE_PLAN.md), Run run_6b3e047f1a69
Defaults chốt: D1 UI_V2 sau cờ; D5 Gemini 18/ngày + giải thích template; D6 rating/review theo nguồn, trọng số nhỏ. D2/D3/D4/D7 hoãn.

| ID | Owner | Status | Evidence |
|---|---|---|---|
| R0-1 contract v1.6 | Claude | DONE | 43f5fee, b5467ed, edac994 |
| R0-2 CSV evidence fields | Codex | DONE, accepted | 982fa07, e2b50cd; Claude re-ran 241 tests OK, drift OK; ds-1 vocabulary: 565/1701 quán < 5 review, rating mean 3.51 |
| R0-3 LLM daily budget (Pacific reset, own SQLite) | Codex | DONE, accepted | 982fa07; /health.llm_budget limit 18, resets_at 07:00Z (=00:00 PDT); complete message -> rules, 0 calls |
| R0-4 rules-first + cache + llm_calls | Claude | DONE | b7c89c3, c581dc6 |
| R0-5 quality/meal/audience scoring + why[] | Claude | DONE | 887e54b: 252 tests OK; eval ds-1 p50 125 ms, 0 invalid tours |
| R0-6 API wiring (meal/audience/why/quality weight) | Codex | DONE, accepted | c079fa2 (merged b4a5203): Claude re-ran 260 tests OK (1 documented legacy skip), drift OK; real-CSV smoke: meal=dinner, audience=family, why codes, ratings with counts; dispatch ctx_fedcc0dd5c08 released |
| R0-REVIEW independent review of R0-4/R0-5 | Codex | DONE: MERGE-AFTER-FIXES (6c2997d) | R01-R08 fixed by Claude in the next commit (7 regression tests, fail-before proven on 6c2997d; 262 tests OK; 5-stop synthetic plan 72 s -> 1.4 s with node budget). R09 (client-config features.ui_v2 missing) and rating rounding assigned to Codex backend follow-up R0-7 |
| R1-1 tokens + base UI components | Antigravity | DONE, accepted | d62e50d merge; Claude re-ran: ui-kit CDP 11/11 on a production build, components 24/24; default build: /ui-kit -> 404 |
| R1-5 itinerary-first UI_V2 screen | Antigravity | In progress | new terminal term_4f9c48c5 verified signed in; retry dispatch ctx_981a93074c80 (old failed ctx_ad191c293ca4 released); R1-9 after R1-5 |
| R1-9 black-box API QA v1.6 | Antigravity | Queued (needs sign-in) | - |

Known minor: the /ui-kit gallery chunk exists in the default build but the route returns 404 (acceptable for local-first).

Minor findings carried forward: (1) API rating.value shows float artefacts (3.5999999999999996): round to 2 decimals at the API boundary (Codex, next backend task) and format with toFixed(1) in the UI; (2) legacy test_budget_and_source stays an EXPECTED-SKIP without data/venues.json.
Inbox: all deliveries processed and acknowledged; no unprocessed messages.

### 2026-10-16 update (coordinator)
| Item | Owner | Status | Evidence |
|---|---|---|---|
| R0 review fixes R01-R08 | Claude | DONE | 324a651; 7 regression tests fail-before on 6c2997d; 5-stop plan 72 s -> 1.4 s |
| R0-7 backend follow-up | Codex | DONE, accepted | aaa67d2 merged; Claude re-ran 265 tests OK, OpenAPI drift OK; open: user text still enters global fold LRU in `relevance._phrases`, extraction-cache TTL purge is lazy (low) |
| R1-5 UI_V2 itinerary-first | Antigravity | ACCEPTANCE WITHDRAWN: Codex review REQUEST CHANGES (3 HIGH, 5 MED, 1 LOW; 5e75912) | author fixes R1-5b dispatch ctx_047c7b3cb35b; independent re-review required |
| GMAPS-URL contract v1.7 | Claude | DONE | e659608; free Maps URLs, no API/key/billing/backend Google call |
| GMAPS-URL-1 backend | Codex | DONE, accepted | 519b0ac (merged): Claude re-ran 274 tests OK, OpenAPI drift OK; independent probe 7 stops driving -> 2 links (3+2 waypoints, join stop 4, 205/180 chars, api=1, no dir_action) |
| GMAPS-URL-2 UI + browser QA | Antigravity | Queued after R1-9 (single worker; no duplicate) | fixtures contracts/fixtures/maps_links.synthetic.json |
| R1-REVIEW frontend review of R1-5 | Codex | In progress | dispatch ctx_c41b51f063d7 (term_653be71d); Enter sent once for unsent draft |
| R1-9 black-box API+UI QA v1.6 | Antigravity | In progress | reuse of a settled worker's terminal failed at agent_readiness (ctx_c30ca3f008c1, released/retained); fresh Antigravity worker ctx_d6bd5e161f9d (term_899cd8c8) turn observed |
| R1-9 black-box QA v1.6 | Antigravity | DONE (report), 5de6950 | 48/48 own assertions; 3 loader discrepancies -> Codex R0-8 (dispatch ctx_d1710c046c37). Claude to re-run test_api_v16 on merged branch |
| R1-5b fixes | Antigravity | Codex re-review (7b97825): REQUEST CHANGES — F01,F03-F06,F08,F09 FIXED; F02 (evidence strip claims verification from object presence; price enum `verified_exact` not in API), F07 (global #pref-* 44px !important leaks into flag-off) NOT FIXED; new R2-N02 quick-answer sent but input not cleared (duplicate /messages) | R1-5c fix round queued after GMAPS-URL-2 (same worktree, one Antigravity worker at a time) |
| GMAPS-URL-2 UI+QA | Antigravity | In progress | ctx_8460d9fdf320 |
| R0-8 loader honesty/fixtures | Codex | DONE, accepted | a2a7607: Claude re-ran 283 tests OK, drift OK; planning 1702 venues 145->120 ms |
| GMAPS-URL-2 UI+QA | Antigravity | REQUEST CHANGES (Codex, docs/reports/CODEX_REVIEW_GMAPS_UI.md): H1 hostile URLs rendered as Google links (allowlist https://www.google.com/maps/dir/ required), M1 error banner auto-cleared (effect depends on changing queue callbacks), M2 notes/skipped reasons ignored (false "no coordinates" copy), M3 order/rel/stale tests not real mutations, L1 radio keyboard | fix round GMAPS-URL-2b queued after R1-5c (same worktree) |
| R1-5c fixes (R2-N01, F07, R2-N02) | Antigravity | In progress | ctx_39e1569598bf |
| R1-5c fixes | Antigravity | Done, pending Codex re-review (ctx_38b3d834cc98) | 0b4ac0c (merged): Claude re-ran test_ui_v2 26/26, components 37/37, ui_kit 11/11, maps_links 33/33 on production scratch build |
| GMAPS-URL-2b fixes | Antigravity | In progress | ctx_2702cc359456 |
| Recovery 2026-10-16 (machine/network restart) | Claude | Done | Run rebound to coordinator terminal term_dafccc6b (consumer_generation 2); inbox 0; all earlier dispatches settled (none live); git clean at e165ac1 |
| R1-REVIEW3 (Codex, 377f634) | Codex | DONE: REQUEST CHANGES | R2-N01 routing: provider total overrides explicit estimate/unknown stop legs (14/128 unsafe); F07 and R2-N02 FIXED; hours/price 768 combos 0 failures |
| GMAPS-URL-2b (Antigravity, 97fbb55) | Antigravity | Done, pending Codex re-review | Claude re-ran test_maps_links_cdp 53/53, test_ui_v2 26/26, components 41/41, ui_kit 11/11 on production scratch build |
| R1-5d routing evidence | Antigravity | In progress | ctx_787b3317690f (single task) |
| GMAPS-REVIEW2 | Codex | In progress | first start ctx_734eaddfc1d3 failed at agent_readiness (Codex CLI update prompt; chose "Skip until next version", did NOT install updates); retry ctx_b9ba22972bcc turn observed |
| GMAPS-REVIEW2 (Codex, cb61c0a) | Codex | DONE: REQUEST CHANGES (narrow) | H1/M1/M2 FIXED (70/70 supplemental, 0 Google requests, 4 real-source mutations caught); remaining L1 radio arrow wrapping, conditional M3 unmount invalidation. Fix folded into R1-5e (queued after R1-5d, same worktree) |
| R1-5d (Antigravity, c8100f1) | Antigravity | DONE, ACCEPTED by Codex (82cbecd) and Claude re-run | 128+512 routing combos 0 unsafe canonical claims; 768 hours/price 0 failures; loosened-predicate mutation caught (TC-EVID-07). R1-5 UI_V2 itself closed pending nothing; GMAPS L1+M3 in R1-5e |
| R1-5e radio wrap + unmount invalidation | Antigravity | In progress | ctx_7777a121447d |
| R1-5e (Antigravity, 6b53d0e) | Antigravity | Done, pending final Codex review (ctx_5d02a435f886) | Claude re-ran on production scratch build: test_maps_links_cdp 61/61, test_ui_v2 28/28, components 47/47, ui_kit 11/11 |
| GMAPS-URL-2 (final) | Antigravity | ACCEPTED | Codex GMAPS-REVIEW3 ACCEPT (cf128d0): 61/61 own, 86/86 independent stress, 4 source mutations + pre-fix probe fail as expected; Claude re-ran 61/61 + ui_v2 28/28 + components 47/47 + ui_kit 11/11; backend 283 OK, drift OK |
| Run state 2026-10-16 | Claude | R0, R1-lite (R1-1,R1-5..5e,R1-9), GMAPS-URL v1.7 all accepted; nothing pushed/deployed; no key/billing/Google call | Not done (deferred by user decision D2/D3/D4/D7): Leaflet/OSM map, routing service, address service, user study; R1-6 alternatives |

### Chatbot upgrade — PLANNING ONLY (2026-10-16), chưa dispatch
Kế hoạch: `docs/CHATBOT_UPGRADE_PLAN.vi.md` (chẩn đoán có bằng chứng, orchestrator + công cụ nội bộ, chính sách LLM/budget/privacy, hợp đồng v1.8 dự kiến, 12 kịch bản hội thoại, đợt C0–C6, 9 quyết định cần duyệt). Chưa có worker nào được giao; chờ người dùng duyệt (đặc biệt Q1–Q9 và C0-HF).
| ID | Owner | Status |
|---|---|---|
| C0-HF allergy/party hotfix in /messages | Claude + Codex | Proposed, awaiting approval |
| C0-1 contract v1.8, C0-2 scenario corpus | Claude / Codex | Proposed |
| C1 state+/chat, C2 tools+gazetteer+allergen map, C3 chat UI v2, C4 planner integration, C5 Gemini turn understanding, C6 E2E | Claude / Codex / Antigravity | Proposed |

### Chatbot upgrade — IMPLEMENTATION STARTED (user approved plan + Q1–Q9, 2026-10-16)
| ID | Owner | Status | Evidence |
|---|---|---|---|
| C0-HF-A allergy/party domain+extractor+planner | Claude | DONE (pending Codex review) | 90a419d: `Preferences.allergies`, `planner/allergens.py`, extractor allergy/avoid/party rules, engine unknown `allergy_ingredients`, contract v1.6.1; 16 new tests, full suite 299 OK; pre-change archive fails (module absent) |
| C0-HF-B API schema + persistence + independent review + API tests | Codex | In progress | ctx_799eec8f21ff; gate: Claude re-runs suite on merged branch, behavioural fail-before; C0-1/C0-2 start only after acceptance |
| C0-1 contract v1.8, C0-2 scenario corpus | Claude / Codex | Blocked on C0-HF acceptance | — |
| C3 chat UI | Antigravity | Not started (by user decision; no early worker) | — |
| C0-HF-B (Codex 856f2bf) | Codex | DONE: API allergies + 8 API tests accepted by Claude (312→316 tests OK) | review rounds 1–2 found extractor gaps → Claude fixed (231c001, e9ca4ae, 933af18: clause-based safety parser) |
| C0-HF-D final review + C0-2 runner | Codex | In progress | ctx_e1377f3efb28; C0-HF acceptance pending |
| C0-1 contract v1.8 | Claude | DONE | b2a11fc |
| C0-2 corpus | Claude | DONE (runner by Codex in progress) | 624df8c: 144-venue synthetic chat fixture, 165 labelled utterances, CH-01..12 |
| C1 engine (state/gazetteer/knowledge/tools) | Claude | In progress | backend/app/chat/* (state, gazetteer, knowledge, tools committed; understand/engine next) |
| C0-2 runner (Codex f660b9f) | Codex | DONE (merged) | API runner qa/chat/run_scenarios.py, 14 adversarial scenarios, intent evaluator; Claude re-ran backend: 341 tests OK (1 skip until /chat) |
| C0-HF | Claude/Codex | Round-4 fixes d7ff7c3; Codex final verification in C1-API Part A | acceptance pending |
| C1 engine | Claude | DONE (pending API wiring + review) | backend/app/chat/*: rules-first understanding 100% on dev corpus (held-out via Codex adversarial), engine scenarios 11/12 + plan_request; plan_selected (never drops a selected venue); fixtures chat_turns.synthetic.json |
| C1-API | Codex | In progress | ctx_92a5468c2fb8 |
| C5 (Claude ae32883) | Claude | DONE (engine side) | llm_understand.py: schema, sanitize (whitelists/ranges), LLMUnderstander gate (session cap 6, daily reserve 3, cache), engine integration; 354 tests OK; route wiring (provider from env, `understand` callable) = C5-API for Codex after C1-API; real Gemini smoke ≤8 calls at C6 |
| C3-1 chat v2 UI | Antigravity | In progress | ctx_33e86e9f534b (fixtures-based; real-API E2E at C6) |
| C0-HF | Claude/Codex | ACCEPTED (Codex addendum on 239f28b: ACCEPT) | CODEX_REVIEW_C0HF_3.md; Claude suite 385 OK |
| C1-API (Codex e77e67e) | Codex | DONE, accepted by Claude | /chat route flag-gated, schemas, atomic persistence, 385 tests OK + drift OK, API scenarios 26/26 (CH-01..12 + ADV-01..14) |
| C5-API + C2-DATA + C1-REVIEW | Codex | In progress | ctx_9bbe99761a8d: LLM understander wiring, capacity/prep/sub-rating fields, independent engine review + held-out utterances |
| C3-1 chat v2 UI | Antigravity | In progress | ctx_33e86e9f534b |
| C5-API/C2-DATA/C1-REVIEW (Codex) | Codex | DONE (review REQUEST CHANGES → Claude fixed HIGH/MEDIUM in 0157a16, e33a2a6, 8ca4ae4) | wiring fdd74db/857ca04, data c3a4ed5/1e65a18; held-out v1 68/70 after fixes (was 46/70) |
| C4-API + heldout2 (blind ≥85%) + C1 re-review | Codex | In progress | ctx_4adbdeac00eb |
