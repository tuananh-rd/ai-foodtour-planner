# Task board — phase 2 (professional upgrade), Run run_b0634cf639d3
Phase 1 (local MVP) is complete; see git history and docs/RUNNING.md. Roadmap and gates: docs/ROADMAP.md. Antigravity is out of this phase (human decision); Claude owns frontend/QA/architecture/planner; Codex owns backend/security/review.

| ID | Item | Owner | Reviewer | Status | Evidence / blocker |
|---|---|---|---|---|---|
| U1 | Interest relevance ranking | Claude | Codex | Starting | - |
| U2 | Quality evaluation harness | Claude | Codex | Queued (after U1) | - |
| U3+U4 | BE-04 persistent sessions + security hardening | Codex | Claude | In progress | dispatch ctx_9e3c76f9ba45 (draft unsent; Enter sent; Working observed) |
| U5 | Frontend residuals + UX | Claude | Codex | Queued | F4 form defaults, F7 initial retry |
| U6 | Real-browser E2E suite in scripts/test | Claude | Codex | Queued (after U5) | - |
| U7 | Provider adapters vs local fakes | Codex/Claude | Claude | Blocked on U3/U4; live use needs credentials | USER GATE for live |
| U8 | Hours/price evidence ingestion | Codex/Claude | Claude | Blocked: needs verified source + permission | USER GATE |
| U9 | Postgres/PostGIS | Codex | Claude | Blocked: DB infra | USER GATE |
| U10 | Deployment | - | - | Out of scope | USER GATE |
