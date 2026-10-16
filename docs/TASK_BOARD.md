# Task board — upgrade R0 + R1-lite (docs/UPGRADE_PLAN.md), Run run_6b3e047f1a69
Defaults chốt: D1 UI_V2 sau cờ; D5 Gemini 18/ngày + giải thích template; D6 rating/review theo nguồn, trọng số nhỏ. D2/D3/D4/D7 hoãn.

| ID | Owner | Status | Evidence |
|---|---|---|---|
| R0-1 contract v1.6 | Claude | DONE | 43f5fee (+ clarification) |
| R0-2 CSV evidence fields | Codex | In progress | dispatch ctx_a6468868f5e6 (prompt unsent -> Enter -> Working) |
| R0-3 LLM daily budget (Pacific reset) | Codex | In progress | same dispatch |
| R0-4 rules-first + cache + llm_calls | Claude | DONE (module) | b7c89c3: 218 tests OK; wiring in main.py by Codex |
| R0-5 quality/meal scoring + why[] | Claude | Queued (needs R0-2 Venue fields) | - |
| R1-1 tokens + base UI components | Antigravity | In progress | dispatch ctx_ece0f501f38b (heartbeat phase=investigating) |
| R1-5 itinerary-first screen (UI_V2) | Antigravity | Queued (after R0-5 merge) | - |
| R1-9 black-box API QA v1.6 | Antigravity | Queued | - |
