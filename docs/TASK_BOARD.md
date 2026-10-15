# Task board (Run run_b0634cf639d3) — local MVP gate reached

| Task | Owner | Status | Commit | Reviewer | Evidence |
|---|---|---|---|---|---|
| DATA-BE-00 | Codex | DONE | 078226d | Claude | baseline 4 pass / 1 fail (private data absent) |
| FE-QA-00 | Antigravity | DONE | 3ca3fc9 | Claude | build OK, 10 defects |
| ARCH-01 | Claude | DONE | a35741e, 464a0de | Codex, Antigravity | PRD, ADR-001, contract v1 + v1.1 |
| PLAN-01/02, AI-01 | Claude | DONE | a35741e..36b79da | Codex (2 high + 3 medium fixed) | 48 planner/llm tests |
| DATA-01 | Codex | DONE | 4d3fa1b | Claude | 38 tests; ds-1 aggregates verified |
| BE-01 | Codex | DONE | 6ab3632 | Claude | 72 tests; live smoke on ds-1 |
| FE-01 | Antigravity | DONE | 9ebe3b4 | Claude + Codex | build OK |
| REVIEW-FE .. REVIEW-FE-6 | Codex | DONE | ad815c9, 472a7a0, 6768e4d, 5eb39ab, e0f7a9f | Claude | F1-F10, N1, N2 closed; final recommendation MERGE, no blockers |
| QA-01 | Antigravity | DONE | 7d7afed | Claude + Codex | 28 then 36 API E2E, 11 component |
| OPS-01 | Codex | DONE | 8ed069b | Claude | scripts/test.ps1, dev.ps1, ci.yml (not enabled) |
| FIX-01 | Codex | DONE | bd30c74 | Claude | GET /v1/venues from snapshot, 81 tests |
| FE-FIX-01 | Antigravity | DONE | 4b8991a | Claude + Codex | F2/F3/F4/F6 + extras |
| FE-FIX-02 | Antigravity -> Claude (temporary) | DONE | c8452d7, 138e158, 8f55933 | Codex REVIEW-FE-4/5/6 | map sizing, modal focus; Antigravity CLI stuck at sign-in |
| INT-01 | Claude | DONE | e654aa3 | Codex | combined: scripts/test.ps1 81 OK (1 explicit skip), drift, build, 12 contract, API E2E 36/36, components 11/11 |

Temporary ownership: Antigravity is out of the workflow by human instruction until sign-in is fixed (docs/OWNERSHIP_CHANGE.md); Claude owns remaining frontend/qa, Codex verifies.
Run guide: docs/RUNNING.md.

Open follow-ups (non-blocking): F4 residual form defaults, F7 initial-load retry; BE-02 live LLM/routing providers (needs approved credentials); real hours mapping; per-person price semantics; persistent sessions/DB; Linux/remote CI untested; geoverification of coordinates; interest matching relevance (broad dish-group tags); docs/audit.json (pre-existing, baseline commit) contains one source URL.
