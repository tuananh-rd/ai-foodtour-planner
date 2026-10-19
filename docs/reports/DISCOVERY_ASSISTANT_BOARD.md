# Discovery-first assistant task board

Direct user request2026-10-19. Baselinebe2bb8f; rules and requirements supersede historical Tavily/checklist behavior. Codex coordinator/backend/contracts/review, Antigravity bounded frontend/QA, Claude inactive. No Tavily calls or new live probes/cap increases. Preserve private inputs/ledgers/WIP/servers.

| Phase | Owner | State | Gate |
|---|---|---|---|
| D0 requirements/contracts | Codex | DONE | Full attachment read/archived; direct instructions distinguished; discovery-v1 frozen |
| D1 state/tools/selection | Codex | IMPLEMENTING | Validated tools, bounded local search/details/compare, versioned profile/selection persistence without DB migration |
| D2 natural UI / remove web | Antigravity | READY FOR DISPATCH | New discovery layout/API adapter on frozen contract; collapsed optional profile, real result/selection cards, no checklist/Tavily UI; Warm editorial retained |
| D3 Gemini + confirmation/planner | Codex | PENDING D1 | Single native function-calling loop with existing budgets, strict user confirmation and allergy gates; no silent tool success |
| D4 runtime retirement/integration | Codex + affected implementer | PENDING D1–3 | No active Tavily route/provider dependency, source provenance retained; endpoint/default UI switch reviewed |
| D5 acceptance | Antigravity QA, Codex independent review | PENDING | Required conversational scenarios, target tests then integrated E2E/build1440/390, honest synthetic/mock/live/data coverage |

Reference architecture mentions PostGIS/weather, but neither is a required dependency or authorized migration/service. No weather data is reported honestly without blocking chat. Gemini live currently unverified for the new loop; synthetic/mock tests never establish live natural quality. Report blocker if configured model/quota/cap cannot support the bounded loop; do not increase budget or use credits.
