# Task board (Run run_b0634cf639d3)

| Task | Owner | Status | Commit | Reviewer | Evidence / blocker |
|---|---|---|---|---|---|
| DATA-BE-00 | Codex | DONE, accepted | 078226d (merged dc9c363) | Claude | Baseline 4 pass / 1 fail (private data absent); report docs/reports/CODEX_BASELINE.md |
| FE-QA-00 | Antigravity | DONE, accepted | 3ca3fc9 (not yet merged) | Claude; Codex for frontend/ code | npm build OK; 10 defects in qa/reports/BASELINE.md |
| ARCH-01 | Claude | DONE | a35741e | Codex, Antigravity consume | PRD, ADR-001, contract v1, synthetic fixture |
| PLAN-01/02 | Claude | DONE (module level) | a35741e | Codex | 22 unit tests pass; exact-baseline comparison; replace with locks |
| AI-01 | Claude | DONE (mock extractor) | a35741e | Codex | Rule-based Vietnamese; live LLM adapter pending BE-02 |
| DATA-01 | Codex | In progress | - | Claude | dispatch ctx_d30d06fc3af7; turn start unverified |
| FE-01 | Antigravity | In progress | - | Claude + Codex | dispatch ctx_ce9c33709837 |
| BE-01 | Codex | Queued after DATA-01 | - | Claude | main.py extraction + sessions API + planner wiring |
| REVIEW-FE | Codex | Queued | - | - | independent review of frontend/ (3ca3fc9) |
