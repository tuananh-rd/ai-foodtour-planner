# Professional-upgrade roadmap (phase 2) — 2026-10-15

Authorization: local, no credentials, no public deployment, no scraping, no paid services. Antigravity is out of this phase. Claude owns architecture, frontend, QA and planner/LLM boundary; Codex owns backend implementation, security and independent review. Integration stays on `foodtour-claude-coordinator`; `main` is not touched without a human request.

## Priorities (value / risk reduction first)

| # | Item | Owner | Reviewer | Depends | Acceptance evidence | Needs user? |
|---|---|---|---|---|---|---|
| U1 | Interest relevance: normalized dish-tag index, match strength, relevance-aware ranking before pool cap | Claude | Codex | none | planner unit tests incl. 'bún' not matching unrelated tags; before/after relevance table on synthetic + private snapshot (aggregates only) | no |
| U2 | Quality evaluation harness: golden scenarios, extraction success reported separately from plan validity, 100% validity gate, latency p50/p95 on 1702-row snapshot | Claude | Codex | U1 | `qa/eval/` script + report; validate_tour passes for every returned tour | no |
| U3 | Persistent sessions (SQLite, stdlib) behind store interface; dataset_version-aware stale tours; atomic revisions | Codex | Claude | none | restart-persistence, conflict atomicity, isolation tests | no |
| U4 | Security hardening: body limits, uniform error envelope, headers, request ids, PII-free logs, CORS, dependency audit, threat model | Codex | Claude | none | tests + `docs/reports/SEC01.md` | no |
| U5 | Frontend residuals + UX: F4 form defaults, F7 initial-load retry, onboarding examples, empty/loading skeletons, copy, i18n-ready strings, print-friendly tour | Claude | Codex (real-browser) | none | build + E2E + CDP probes at 390/1280 | no |
| U6 | Real E2E in CI-ready form: browser tests for the critical flow (desktop + mobile) without new runtime deps in the app | Claude | Codex | U5 | scripted CDP/Playwright-free probe suite, reproducible via scripts/test.ps1 | no |
| U7 | Provider adapters with contract tests against local fakes: LLM extraction (JSON schema, deadlines, quota, error mapping) and walking-route matrix | Codex (impl), Claude (interfaces) | Claude | U3, U4 | fake-server tests; live path disabled by default | **live use needs credentials + approval** |
| U8 | Hours mapping and per-person price evidence ingestion with provenance | Codex (pipeline), Claude (policy) | Claude | human-verified source | verified fields flow to `verified_feasible` in tests | **needs verified data / permission** |
| U9 | Postgres/PostGIS storage, migrations | Codex | Claude | U3 | live DB tests | Docker/DB availability |
| U10 | Deployment, public access, domain, TLS, monitoring | — | — | all | — | **explicit deployment approval; out of scope now** |

## Gates needing the user later
Provider credentials (LLM/routing) and approval to call them; a verified opening-hours/price source and reuse permission for the dataset; DB infrastructure; any deployment/publishing; reversal of the Antigravity decision.

## Working rules carried over
Truthful evidence states; private data never in Git; every returned tour passes `validate_tour`; author != reviewer; evidence from real command output; no self-approved merge.
