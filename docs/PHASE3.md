# Phase 3 — real routing, real LLM (Gemini), remaining limitations

Date: 2026-10-15. Human instruction (this phase): **Claude alone** performs every role (architecture, data, AI/planner, backend, frontend, QA/security, integration, handover). No Codex, Antigravity or subagent dispatch. This overrides, for phase 3 only, the cross-review and ownership rules in AGENTS.md / docs/PROJECT_RULES.md / docs/OWNERSHIP_CHANGE.md. Reviews in this phase are **self-reviews and tests by Claude, not independent reviews**.

Unchanged rules: no invented evidence; private data never in Git; API keys server-side only from ignored local config or process env, never printed or committed; no account sign-up, billing, purchases, public deployment, push or history rewrite; do not disturb the human's running dev process; integration stays on `foodtour-claude-coordinator`, `main` untouched. The human authorized calling Gemini and a real walking-routing provider for testing **when valid configuration/credentials have been provided for this project**; explicitly configured/allowlisted HTTPS provider hosts replace the old loopback-only restriction.

## Inventory of limitations at phase start

| # | Limitation | Root cause | Can phase 3 close it? |
|---|---|---|---|
| L1 | Distances are straight-line estimates | no routing provider | Yes in code; **real verification needs a routing provider configured by the human** (key for openrouteservice, or an OSRM-compatible foot endpoint) |
| L2 | Map has no real route geometry | same | Same as L1 |
| L3 | Extraction is a rule-based mock, not an LLM | no provider | Yes: Gemini via `generateContent`; `GEMINI_API_KEY` is present in the process environment |
| L4 | Explanations are templates | no LLM | Yes, Gemini explanation constrained to checked tour facts, with template fallback |
| L5 | Opening hours unknown for all venues | source lacks weekday mapping | **No** without a verified source; overlay pipeline exists (U8a) |
| L6 | Price is a venue range, not per person | source semantics | **No** without verified source; overlay pipeline exists |
| L7 | Coordinates not geoverified | no ground truth | Partially: plausibility checks (bbox, duplicates, district outliers) — flags only, never "verified" |
| L8 | Sessions persistence | — | Done in phase 2 (SQLite); PostGIS needs DB infra |
| L9 | CI not run remotely | no push allowed | Workflow file only; local scripts are the evidence |
| L10 | Tour quality not evaluated by users | needs humans | **No**; harness measures validity, not satisfaction |

## Roadmap (dependencies → acceptance)

| ID | Work | Depends | Acceptance (observable) |
|---|---|---|---|
| P3-0 | Rules, inventory, roadmap (this file), board | — | committed |
| P3-1 | Provider transport: HTTPS only to explicitly allowlisted hosts (`FOODTOUR_PROVIDER_HOSTS`), loopback HTTP for tests, no proxy/redirect, size/time caps; local `backend/.env` loader (ignored) | — | unit tests: allowlist accept/refuse, redirect refused, oversize/timeouts |
| P3-2 | Gemini extraction provider (`generateContent`, JSON schema, `x-goog-api-key`), daily call budget, error mapping; labelled fallback to rule-based mock | P3-1 | fake-server tests; **live call with the configured key** returns schema-valid slots for Vietnamese scenarios (aggregate results recorded) |
| P3-3 | Gemini checked explanation: input = validated tour facts only; output schema; claim checker (no opening/per-person/allergy claims, numbers must come from facts, venue ids must match); template fallback | P3-2 | adversarial fake outputs rejected; live explanation passes checker or falls back |
| P3-4 | Walking routing providers with geometry: openrouteservice (`foot-walking` matrix + directions GeoJSON) and OSRM-compatible (`table` + `route` geojson); matrix prefetch in planner; per-leg geometry attached to final tour; quotas/caches | P3-1 | fake-server tests incl. geometry; strict/verified only with `provider_route`; live test **only when the human configures a provider** |
| P3-5 | Frontend: real route polylines only for `provider_route` legs with attribution; LLM/explanation source labels; provider-unavailable states | P3-3, P3-4 | build, component tests, browser probe |
| P3-6 | Health/config/docs: provider names, model id, configured flags, budgets; `.env.example`; RUNNING.md | P3-2..5 | health test; docs |
| P3-7 | Data backlog: geo plausibility flags (aggregate report), hours/price overlay guidance | — | report with counts; no "verified" claims |
| P3-8 | Handover matrix: done / tested for real / not verifiable | all | docs/HANDOVER_P3.md |
