# Task board (Run run_b0634cf639d3)

| Task | Owner | Status | Commit | Reviewer | Evidence / blocker |
|---|---|---|---|---|---|
| DATA-BE-00 | Codex | DONE, accepted | 078226d (merged dc9c363) | Claude | Baseline 4 pass / 1 fail (private data absent); report docs/reports/CODEX_BASELINE.md |
| FE-QA-00 | Antigravity | DONE, accepted | 3ca3fc9 (not yet merged) | Claude; Codex for frontend/ code | npm build OK; 10 defects in qa/reports/BASELINE.md |
| ARCH-01 | Claude | DONE | a35741e | Codex, Antigravity consume | PRD, ADR-001, contract v1, synthetic fixture |
| PLAN-01/02 | Claude | DONE (module level) | a35741e | Codex | 22 unit tests pass; exact-baseline comparison; replace with locks |
| AI-01 | Claude | DONE (mock extractor) | a35741e | Codex | Rule-based Vietnamese; live LLM adapter pending BE-02 |
| DATA-01 | Codex | DONE, accepted | 4d3fa1b (merged) | Claude | 38 tests pass (re-run by Claude); ds-1 aggregates verified by Codex; hours None, price estimate |
| FE-01 | Antigravity | DONE, accepted (UX pending integration); NOT merged | 9ebe3b4 | Claude; Codex REVIEW-FE required before merge | build OK, 12 mock contract tests pass; finding: mock session revision starts at 1 but contract says 0; mock tests prove only client/mock, re-run vs real API in INT-01 |
| BE-01 | Codex | In progress | - | Claude | dispatch ctx_4e1639c9fd30. Receipt was start_unknown: prompt sat unsent in composer (draft 8638 chars). Coordinator submitted it with a single Enter (no resend); turn observed running (git merge, reading llm/) 2026-10-15 |
| REVIEW-FE | Codex | Queued | - | - | independent review of frontend/ (3ca3fc9) |
