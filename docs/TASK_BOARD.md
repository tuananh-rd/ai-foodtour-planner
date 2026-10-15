# Task board — phase 4 (Google Maps platform), Run run_95a2350b2712, see docs/PHASE4.md and docs/HANDOVER_P4.md
worker_done is not an integrated product; evidence is Claude's re-run on the merged branch.

| ID | Owner | Status | Evidence |
|---|---|---|---|
| PH4-ARCH plan + contract v1.5 | Claude | DONE | docs/PHASE4.md, CONTRACT.md |
| PH4-BE Routes/geocode/client-config/venue map | Codex | DONE, accepted | 3e6c0a3, 3e33c9c |
| PH4-AI planner/Gemini origin trust | Claude | DONE | 2d55dc1, 1fc3880, ced11e9 |
| PH4-QA black-box integration | Antigravity | DONE, accepted | 189df89 (162/162 re-run) |
| PH4-FE Google Maps UI + fixes | Antigravity | ACCEPTED (merged through 6158034) | Claude re-run on production build: cold-bootstrap 15/15, component 15/15, browser 28/28, API 36/36; independent Codex closure be90b28. Real Google (keys) still unverified |
| PH4-FINAL-VERIFY-FE | Codex | DONE | ab58162: N1-N4 closed, F1/F2 -> FIX-3 |
| PH4-LAST-LOOK F1/F2 closure | Codex | DONE: MERGE | be90b28: TC-COLD-15 fails on 045db0e, strengthened TC-COLD-11 fails on b4f9c2b, no blocking regressions |
| PH4-LIVE real Google smoke | Claude | BLOCKED: needs GOOGLE_MAPS_BROWSER_KEY + MAP_ID + GOOGLE_MAPS_SERVER_KEY | qa/live/google_smoke.py ready |
