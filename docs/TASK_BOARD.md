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
| R1-5 UI_V2 itinerary-first | Antigravity | DONE, accepted (CDP) | a2735e8 (merge 82f05de); Claude re-ran on production build: test_ui_v2 15/15, test_components 24/24, test_ui_kit 11/11. test_cold_bootstrap not re-run (needs the fake Google config harness; flag-off layout covered by TC-V2-15 and components). Codex frontend review pending |
| GMAPS-URL contract v1.7 | Claude | DONE | e659608; free Maps URLs, no API/key/billing/backend Google call |
| GMAPS-URL-1 backend | Codex | DONE, accepted | 519b0ac (merged): Claude re-ran 274 tests OK, OpenAPI drift OK; independent probe 7 stops driving -> 2 links (3+2 waypoints, join stop 4, 205/180 chars, api=1, no dir_action) |
| GMAPS-URL-2 UI + browser QA | Antigravity | Queued after R1-9 (single worker; no duplicate) | fixtures contracts/fixtures/maps_links.synthetic.json |
| R1-REVIEW frontend review of R1-5 | Codex | In progress | dispatch ctx_c41b51f063d7 (term_653be71d); Enter sent once for unsent draft |
| R1-9 black-box API+UI QA v1.6 | Antigravity | In progress | reuse of a settled worker's terminal failed at agent_readiness (ctx_c30ca3f008c1, released/retained); fresh Antigravity worker ctx_d6bd5e161f9d (term_899cd8c8) turn observed |
