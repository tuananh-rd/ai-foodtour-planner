# Discovery-first assistant task board

Direct user request2026-10-19. Baselinebe2bb8f; rules and requirements supersede historical Tavily/checklist behavior. Codex coordinator/backend/contracts/review, Antigravity bounded frontend/QA, Claude inactive. No Tavily calls or new live probes/cap increases. Preserve private inputs/ledgers/WIP/servers.

| Phase | Owner | State | Gate |
|---|---|---|---|
| D0 requirements/contracts | Codex | DONE | Full attachment read/archived; direct instructions distinguished; discovery-v1 frozen |
| D1 state/tools/selection | Codex | IMPLEMENTED, INTEGRATION PENDING | Commits2a0a1f7/249e267; validated tools, bounded local search/details/compare, versioned profile/selection and SQLite persistence, legacy explicit/allergy obligations preserved without copying assumed defaults |
| D2 natural UI / remove web | Antigravity | FINAL INTEGRATION FIXES RUNNING |8256a2d/b6dad61/9deb5ee integrated as88c7a59/5e060eb/ae01bdd. Previous task settled, terminal retained/reused. Current task_cbddafbb1462 / ctx_f0fa5d06505b fixes session readiness, body timeout, actual TourView totals and real selection editing. Mock26 assertions are not integrated acceptance. |
| D3 Gemini + confirmation/planner | Codex | IMPLEMENTED, LIVE NOT TESTED | Single native function-calling loop with existing budgets, strict user confirmation/allergy gates; protocol/privacy/race tests mock only |
| D4 runtime retirement/integration | Codex + affected implementer | PENDING D1–3 | No active Tavily route/provider dependency, source provenance retained; endpoint/default UI switch reviewed |
| D5 acceptance | Antigravity QA, Codex independent review | PENDING | Required conversational scenarios, target tests then integrated E2E/build1440/390, honest synthetic/mock/live/data coverage |

Reference architecture mentions PostGIS/weather, but neither is a required dependency or authorized migration/service. No weather data is reported honestly without blocking chat. Gemini live currently unverified for the new loop; synthetic/mock tests never establish live natural quality. Report blocker if configured model/quota/cap cannot support the bounded loop; do not increase budget or use credits.

Backend checkpoint:16 initial discovery tests passed;8 additional native-protocol/privacy/SQLite/concurrency tests passed; area-only follow-up targeted test passed. These are hermetic tests, not live Gemini proof. Codex owns only backend/contracts/docs; Antigravity owns its dispatched frontend/QA files. Previous dispatch ctx_8c53644bd48e settled with corrected task ID after one rejected mismatched completion; terminal retained and reused. No Tavily calls have been made for this implementation.

21:02 recovery: verified QA node25540/parent27792 had finished writing26 assertions at20:29:49 but stayed alive due success-path open server/WebSocket/children and exit-only cleanup. Codex stopped ONLY positively identified QA node; worker resumed and settled correct task_6d373f53c224/ctx_fd0058920726 with9deb5ee. No user/worker process was killed. Original forced exit is a harness defect, not product PASS; bounded normal-exit evidence requested. Independent actual UI3200/API8200 then found real confirmation HTTP500 after selection + taste change; Codex reproduced and fixed439980f (planner validation context),3 targeted tests PASS. Final production build/E2E remains pending current frontend fixes. Existing3200 is integration DEV, synthetic/rules; no live Gemini/Tavily calls.
