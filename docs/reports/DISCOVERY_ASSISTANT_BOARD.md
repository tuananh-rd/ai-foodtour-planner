# Discovery-first assistant task board

Direct user request2026-10-19. Baselinebe2bb8f; rules and requirements supersede historical Tavily/checklist behavior. Codex coordinator/backend/contracts/review, Antigravity bounded frontend/QA, Claude inactive. No Tavily calls or new live probes/cap increases. Preserve private inputs/ledgers/WIP/servers.

| Phase | Owner | State | Gate |
|---|---|---|---|
| D0 requirements/contracts | Codex | DONE | Full attachment read/archived; direct instructions distinguished; discovery-v1 frozen |
| D1 state/tools/selection | Codex | DONE | Validated tools, versioned state, actual local dataset smoke and integrated HTTP/SQLite/CAS regression; legacy safety obligations preserved |
| D2 natural UI / remove web | Antigravity, Codex integration | DONE LOCAL | cdd4c46 integratedc7091c5, Codex map/input fixes2d54e49/df4b5df/41b1d33 reviewed by affected implementer; production browser63/63 desktop/mobile |
| D3 Gemini + confirmation/planner | Codex | IMPLEMENTED, LIVE NOT TESTED | Single native function-calling loop with existing budgets, strict user confirmation/allergy gates; protocol/privacy/race tests mock only |
| D4 runtime retirement/integration | Codex + affected implementer | DONE | Tavily runtime/UI/probes removed, venue provenance and private keys/ledgers preserved; source reviews APPROVE |
| D5 acceptance | Antigravity QA, Codex independent review | PASS LOCAL, LIVE NOT TESTED | Production41b1d33, actual synthetic/rules API99d64ce,63/63 browser,0 JS exceptions, PMTiles206 + geographic screenshots,41 module/51 client checks; live Gemini quality unverified |

Reference architecture mentions PostGIS/weather, but neither is a required dependency or authorized migration/service. No weather data is reported honestly without blocking chat. Gemini live currently unverified for the new loop; synthetic/mock tests never establish live natural quality. Report blocker if configured model/quota/cap cannot support the bounded loop; do not increase budget or use credits.

FINAL LOCAL DELIVERY: **http://127.0.0.1:3200**, production, explicitly synthetic/rules. Read DISCOVERY_ASSISTANT_ACCEPTANCE.md for exact commit/evidence matrix, retained failures and remaining visual/live limitations; DISCOVERY_ASSISTANT_LOCAL_USE.md for the user flow. Final affected reviewf13b0bc integratedc10ff0c, all current dispatches settled/terminal retained,0 reclaimable resources. Old checkpoints below are historical; do not reuse their pending states or old URLs.

Backend checkpoint:16 initial discovery tests passed;8 additional native-protocol/privacy/SQLite/concurrency tests passed; area-only follow-up targeted test passed. These are hermetic tests, not live Gemini proof. Codex owns only backend/contracts/docs; Antigravity owns its dispatched frontend/QA files. Previous dispatch ctx_8c53644bd48e settled with corrected task ID after one rejected mismatched completion; terminal retained and reused. No Tavily calls have been made for this implementation.

21:02 recovery: verified QA node25540/parent27792 had finished writing26 assertions at20:29:49 but stayed alive due success-path open server/WebSocket/children and exit-only cleanup. Codex stopped ONLY positively identified QA node; worker resumed and settled correct task_6d373f53c224/ctx_fd0058920726 with9deb5ee. No user/worker process was killed. Original forced exit is a harness defect, not product PASS; bounded normal-exit evidence requested. Independent actual UI3200/API8200 then found real confirmation HTTP500 after selection + taste change; Codex reproduced and fixed439980f (planner validation context),3 targeted tests PASS. Final production build/E2E remains pending current frontend fixes. Existing3200 is integration DEV, synthetic/rules; no live Gemini/Tavily calls.
