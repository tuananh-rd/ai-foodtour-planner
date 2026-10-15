# Task board (Run run_b0634cf639d3)

| Task | Owner | Status | Commit | Reviewer | Evidence / blocker |
|---|---|---|---|---|---|
| DATA-BE-00 | Codex | DONE, accepted | 078226d | Claude | baseline 4 pass / 1 fail (private data absent) |
| FE-QA-00 | Antigravity | DONE, accepted | 3ca3fc9 | Claude | build OK, 10 defects |
| ARCH-01 | Claude | DONE | a35741e, 464a0de | Codex, Antigravity | PRD, ADR-001, contract v1 + v1.1 |
| PLAN-01/02, AI-01 | Claude | DONE, reviewed by Codex | a35741e..36b79da | Codex | 48 planner/llm tests; Codex found 2 high + 3 medium, all fixed |
| DATA-01 | Codex | DONE, accepted | 4d3fa1b | Claude | 38 tests; ds-1 aggregates verified |
| BE-01 | Codex | DONE, accepted | 6ab3632 | Claude | 72 tests pass (re-run by Claude); OpenAPI drift passes; live smoke on ds-1 passed (chat->tour->replace, 409, 403, injection) |
| FE-01 | Antigravity | DONE, accepted; NOT merged | 9ebe3b4 | Claude; Codex REVIEW-FE | build OK, 12 mock tests |
| REVIEW-FE | Codex | DONE, accepted | ad815c9 (merged) | Claude | merge FE after fixes; F1-F6 blocking, F7-F10 medium; forwarded to Antigravity |
| QA-01 + FE real-API integration | Antigravity | DONE, accepted (F1-F6 closure pending Codex verification) | 7d7afed (merged 1c6dba0) | Claude; Codex REVIEW-FE-2 | 28/28 E2E pass (re-run by Claude on synthetic); DEF-01 backend: GET /v1/venues empty |
| FIX-01 + REVIEW-FE-2 | Codex | In progress | - | Claude | dispatch ctx_48afd613e058 (draft was unsent; Enter sent; Working observed) |
| OPS-01 | Codex | DONE, accepted | 8ed069b (merged f183788) | Claude | scripts/test.ps1 passes on coordinator tree: 77 backend + 1 explicit legacy skip + OpenAPI drift + frontend build; npm test EXPECTED-SKIP; Linux/remote CI untested |
| INT-01 | Claude | Pending | - | Codex | merge FE-01 after F1-F6 closure, combined checks, docs/RUNNING.md |

Known limitations: single-process volatile sessions; bounded search pool (disclosed); estimated straight-line routing; hours unknown for all venues; price is venue range; no live LLM/routing provider (BE-02 not started, needs approved credentials).
