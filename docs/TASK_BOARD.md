# Task board — phase 4 (Google Maps platform), Run run_95a2350b2712, see docs/PHASE4.md
worker_done is not an integrated product; evidence below is Claude's re-run on the merged branch.

| ID | Owner | Status | Evidence |
|---|---|---|---|
| PH4-ARCH plan + contract v1.5 | Claude | DONE | docs/PHASE4.md, CONTRACT.md v1.5 + addenda |
| PH4-BE Routes/geocode/client-config/venue map | Codex | DONE, accepted | 3e6c0a3, 3e33c9c; 211 backend tests, drift OK |
| PH4-AI planner fields, Gemini origin_text, eval | Claude | DONE | 2d55dc1, 1fc3880, ced11e9; Codex confirmed P4-R1..R5 closed |
| PH4-QA black-box integration | Antigravity | DONE, accepted | 189df89; 162/162 re-run by Claude |
| PH4-REVIEW-FE | Codex | DONE | 5d16a82: FE1-FE6 blocking |
| PH4-FE-FIX FE1-FE6 | Antigravity | PARTIAL (b4f9c2b merged) | Codex re-review: FE1-FE5 behaviours closed in production Edge probes; FE6 partial, geolocation loading stuck after supersede, clusters broken after reset; cold-bootstrap suite passes on pre-fix code (vacuous) |
| PH4-FE-FIX-2 | Antigravity | In progress | dispatch ctx_6b7195d7b7fb (turn observed): real CDP cold-bootstrap test with fail-before proof, remove test hooks, reset races |
| PH4-REREVIEW-FE independent closure + fail-before/pass-after | Codex | In progress | dispatch ctx_9fd044f46c00 |
| PH4-LIVE real Google/Gemini smoke | Claude | BLOCKED: needs GOOGLE_MAPS_BROWSER_KEY + MAP_ID + GOOGLE_MAPS_SERVER_KEY | qa/live/google_smoke.py ready |

Known minor: production code contains a test hook (window.__TEST_FAKE_GOOGLE_MAPS__ and 'TEST_KEY' fallback) - Codex asked to assess; gating to be decided after re-review.
