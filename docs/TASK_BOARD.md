# Task board — phase 2 (professional upgrade), Run run_b0634cf639d3
Phase 1 (local MVP) complete; see docs/RUNNING.md. Roadmap and gates: docs/ROADMAP.md. Antigravity is out of this phase (human decision); Claude owns frontend/QA/architecture/planner; Codex owns backend/security/review. Integration stays on foodtour-claude-coordinator; main untouched.

| ID | Item | Owner | Reviewer | Status | Evidence / blocker |
|---|---|---|---|---|---|
| U1 | Interest relevance ranking | Claude | Codex | DONE; Codex review in BE-05 part A | b33fde1; whole-word diacritic-insensitive; relevance-first pool ranking |
| U2 | Quality evaluation harness | Claude | Codex | DONE; review in BE-05 | qa/eval; extraction 7/7, invalid tours 0, p95 70 ms on 1702 rows; found + fixed unaccented/"3 giờ 10k"/scope bugs |
| U3 | Persistent sessions (SQLite) | Codex | Claude | DONE, accepted | bb3c98e; restart persistence, atomic conflicts |
| U4 | Security hardening | Codex | Claude | DONE, accepted | d0e527f; SEC01 report; 117 tests, drift OK |
| U5 | Frontend residuals + UX | Claude | Codex | DONE (F4/F7 + busy-initial fix); browser re-verification in BE-05 | cd5bb74, 7e2a2a5 |
| U6 | Real-browser E2E probe | Claude | Codex | DONE; 16/16 x3 runs; review in BE-05 | qa/e2e/browser_flow.mjs |
| U7 | Provider adapters vs local fakes | Codex (impl), Claude (boundary) | Claude | Boundary DONE (a5212df: LLMExtractor validation, CheckedRouteProvider); adapters IN PROGRESS BE-05 part B | live use = USER GATE (credentials + approval) |
| BE-05 | Review P2 + adapters | Codex | Claude | In progress | dispatch ctx_a000007d82ba (draft unsent; Enter sent; Working observed) |
| U8 | Hours/price evidence ingestion | Codex/Claude | Claude | Blocked: needs verified source + permission | USER GATE |
| U9 | Postgres/PostGIS | Codex | Claude | Blocked: DB infra | USER GATE |
| U10 | Deployment | - | - | Out of scope | USER GATE |

Notes: a `scripts/local.py dev --frontend` process (not started by Claude) holds the dev/test lock in the coordinator worktree; Claude runs unittest directly instead of scripts/test.ps1 to avoid disturbing it.
