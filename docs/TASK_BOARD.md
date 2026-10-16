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
| R0-REVIEW independent review of R0-4/R0-5 | Codex | In progress | dispatch ctx_53db4b841a81 (turn observed); first attempt to reuse the old terminal returned agent_unconfigured -> released dispatches, fresh Codex worker (same model/effort) |
| R1-1 tokens + base UI components | Antigravity | DONE, accepted | d62e50d merge; Claude re-ran: ui-kit CDP 11/11 on a production build, components 24/24; default build: /ui-kit -> 404 |
| R1-5 itinerary-first UI_V2 screen | Antigravity | BLOCKED: CLI not signed in | dispatch ctx_ad191c293ca4 failed at agent_readiness (timeout); terminal term_45d767cf retained for the user to sign in; no retry, no substitute agent |
| R1-9 black-box API QA v1.6 | Antigravity | Queued (needs sign-in) | - |

Known minor: the /ui-kit gallery chunk exists in the default build but the route returns 404 (acceptable for local-first).

Minor findings carried forward: (1) API rating.value shows float artefacts (3.5999999999999996): round to 2 decimals at the API boundary (Codex, next backend task) and format with toFixed(1) in the UI; (2) legacy test_budget_and_source stays an EXPECTED-SKIP without data/venues.json.
Inbox: all deliveries processed and acknowledged; no unprocessed messages.
