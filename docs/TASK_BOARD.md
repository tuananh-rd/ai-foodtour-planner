# Task board — phase 4 (Google Maps platform), Run run_95a2350b2712, see docs/PHASE4.md
worker_done is not an integrated product; evidence below is Claude's re-run on the merged branch.

| ID | Owner | Status | Evidence |
|---|---|---|---|
| PH4-ARCH plan + contract v1.5 | Claude | DONE | docs/PHASE4.md, CONTRACT.md v1.5 + addenda |
| PH4-BE Routes/geocode/client-config/venue map | Codex | DONE, accepted | 3e6c0a3, 3e33c9c; 211 backend tests, drift OK |
| PH4-AI planner fields, Gemini origin_text, eval | Claude | DONE | 2d55dc1; Codex P4-R1..R5 closed (confirmed by Codex) in 1fc3880; LLM prior no longer carries precise origin (ced11e9) |
| PH4-QA black-box backend/planner integration | Antigravity | DONE, accepted | 189df89; Claude re-ran qa/integration: 162/162 |
| PH4-REVIEW-FE independent frontend review | Codex | DONE | 5d16a82: MERGE-AFTER-FIXES, FE1-FE6 blocking (cold Map constructor, bbox/abort venue fetch, silent fixtures in real mode, cold Autocomplete, false privacy text, stale place overwrite) |
| PH4-FE Google Maps UI | Antigravity | NOT ACCEPTED yet | 537a26e/a03a5ad merged but real Google map cannot initialise (B1); fixes in PH4-FE-FIX |
| PH4-FE-FIX FE1-FE6 | Antigravity | In progress | dispatch ctx_8446ad36cca8 (turn observed) |
| PH4-LIVE real Google/Gemini smoke | Claude | BLOCKED: needs GOOGLE_MAPS_BROWSER_KEY + MAP_ID + GOOGLE_MAPS_SERVER_KEY | qa/live/google_smoke.py ready |
