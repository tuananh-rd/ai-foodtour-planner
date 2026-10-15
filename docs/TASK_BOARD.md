# Task board — phase 2 (professional upgrade), Run run_b0634cf639d3
Phase 1 (local MVP) is complete; see git history and docs/RUNNING.md. Roadmap and gates: docs/ROADMAP.md. Antigravity is out of this phase (human decision); Claude owns frontend/QA/architecture/planner; Codex owns backend/security/review.

| ID | Item | Owner | Reviewer | Status | Evidence / blocker |
|---|---|---|---|---|---|
| U1 | Interest relevance ranking | Claude | Codex | DONE (b33fde1 + extractor fixes), review pending | 85 tests; see qa/reports/EVAL01.md |
| U2 | Quality evaluation harness | Claude | Codex | DONE (qa/eval), review pending | extraction 7/7, invalid tours 0, p95 70 ms on 1702 rows |
| U3+U4 | BE-04 persistent sessions + security hardening | Codex | Claude | In progress | dispatch ctx_9e3c76f9ba45 (draft unsent; Enter sent; Working observed) |
| U5 | Frontend residuals + UX | Claude | Codex | Residuals F4/F7 DONE (this commit); Codex browser verification pending | build + 11/11 |
| U6 | Real-browser E2E suite | Claude | Codex | DONE (qa/e2e/browser_flow.mjs, 16/16 x3 runs), Codex review pending | found + fixed: input accepted before session ready (busy initial true) |
| U7 | Provider adapters vs local fakes | Codex/Claude | Claude | Blocked on U3/U4; live use needs credentials | USER GATE for live |
| U8 | Hours/price evidence ingestion | Codex/Claude | Claude | Blocked: needs verified source + permission | USER GATE |
| U9 | Postgres/PostGIS | Codex | Claude | Blocked: DB infra | USER GATE |
| U10 | Deployment | - | - | Out of scope | USER GATE |
