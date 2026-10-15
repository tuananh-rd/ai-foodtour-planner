# ADR-001 — Architecture for the local MVP

Status: accepted (Claude, 2026-10-15). Consumer reviewers: Codex (backend), Antigravity (frontend).

## Decisions
1. Keep the layout: `backend/` (FastAPI), `frontend/` (Next.js), `tools/`, `db/`. No monorepo rewrite.
2. Fixed pipeline: extract (LLM adapter) -> validate -> plan (deterministic) -> check -> explain. No autonomous agent runtime.
3. The planner is a pure, stdlib-only package `backend/app/planner/` with typed inputs (`types.py`) and injected providers (`interfaces.py`). No I/O, so it is testable without FastAPI, DB or network.
4. LLM sits behind the `PreferenceExtractor` protocol in `backend/app/llm/`. Default is a rule-based `MockExtractor`; with no credentials the status is explicitly `unavailable`, never fake live success.
5. Routing sits behind `RouteMatrixProvider`. The default `StraightLineEstimator` labels every leg `straight_line_estimate`; strict mode refuses it. A real provider is Codex BE-02 and needs approved credentials.
6. API source of truth is FastAPI-generated OpenAPI, exported to `contracts/v1/openapi.json` with a drift test. `contracts/v1/CONTRACT.md` is the semantic contract. Legacy `POST /v1/plans` stays until deliberately replaced.
7. Venue data is a private local input read from `FOODTOUR_DATA_PATH` (default `data/venues.json`), falling back to labeled synthetic fixtures. Raw or derived data never enters Git.
8. Locks preserve venue identity and sequence; times are recalculated. Changing this needs a new ADR.

## Ownership
See AGENTS.md. Planner/LLM interface changes need Claude approval; API shape changes need Claude plus consumer review.

## Consequences
Evidence for hours and price is mostly missing, so most tours are `conditional`. This is intended and must be visible in the UI.
