# Task board — phase 2 (professional upgrade), Run run_b0634cf639d3
Phase 1 (local MVP) and phase 2 local/no-credential work are complete. Roadmap and gates: docs/ROADMAP.md; run guide: docs/RUNNING.md. Antigravity is out (human decision); Claude owns frontend/QA/architecture/planner; Codex owns backend/security/review. Integration stays on foodtour-claude-coordinator; main untouched.

| ID | Item | Owner | Reviewer | Status | Evidence |
|---|---|---|---|---|---|
| U1 | Interest relevance ranking | Claude | Codex | DONE | b33fde1; Codex review CODEX_REVIEW_P2 (R1-R5 fixed e82caf7) |
| U2 | Quality evaluation harness | Claude | Codex | DONE | qa/eval; extraction 7/7, invalid tours 0, p95 ~70 ms on 1702 rows |
| U3 | Persistent sessions (SQLite) | Codex | Claude | DONE | bb3c98e |
| U4 | Security hardening | Codex | Claude | DONE | d0e527f, docs/reports/SEC01.md |
| U5 | Frontend residuals + UX | Claude | Codex | DONE | cd5bb74, 7e2a2a5, 6ad625e |
| U6 | Real-browser E2E probe | Claude | Codex | DONE | qa/e2e/browser_flow.mjs 16/16 |
| U7 | Provider adapters vs local fakes | Codex + Claude | Claude | DONE (loopback only; live use is a USER GATE) | 3484c48; a5212df |
| U8a | Verified-evidence overlay pipeline | Codex | Claude | DONE (synthetic only) | e48ad40; real evidence source = USER GATE |
| U8b | Real hours/price evidence + reuse permission | human | - | BLOCKED: USER GATE | - |
| U9 | Postgres/PostGIS | Codex | Claude | BLOCKED: DB infra | USER GATE |
| U10 | Deployment | - | - | Out of scope | USER GATE |

Final verification (Claude, integration branch): backend 151 tests OK (x2), OpenAPI drift OK, API E2E 36/36, components 12/12, browser flow 16/16, eval 7/7 with 0 invalid tours.
Open follow-ups (non-blocking): live LLM/routing with approved credentials; hours overnight intervals; freshness policy for attestations; Linux/remote CI untested; geoverification; persisted-session encryption at rest; human evaluation of tour quality.
