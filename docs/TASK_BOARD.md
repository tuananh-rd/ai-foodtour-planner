# Task board — phase 4 (Google Maps platform), Run run_95a2350b2712, see docs/PHASE4.md
Three-agent division restored.

| ID | Owner | Status | Evidence |
|---|---|---|---|
| PH4-ARCH plan + contract v1.5 | Claude | DONE | docs/PHASE4.md, CONTRACT.md v1.5 (+addenda) |
| PH4-GATE Antigravity live | Antigravity | PASSED | turnStart=observed; heartbeats from ctx_7bdc35ecf1e9 (term_bd9c5a5b) |
| PH4-FE Google Maps UI, location, markers, routes, QA | Antigravity | In progress | dispatch ctx_7bdc35ecf1e9; phase=implementing |
| PH4-BE Routes/geocode/client-config/venue map | Codex | DONE, accepted | 3e6c0a3 (merged); Claude re-ran 201 tests OK, OpenAPI drift OK; live smoke not run (no server key) |
| PH4-BE-2 polylineQuality HIGH_QUALITY, cost table, review of Claude | Codex | In progress | dispatch ctx_30e409d0b55c |
| PH4-AI Gemini origin_text, planner fields, eval | Claude | DONE | 2d55dc1; Gemini live 9/9 on free-text-origin scenarios |
| PH4-INT integration, cross-review, live smoke when keys exist | Claude | Waiting on PH4-FE | - |

User gates: Google Cloud keys (browser + server) and Map ID; see docs/PHASE4.md key matrix.
