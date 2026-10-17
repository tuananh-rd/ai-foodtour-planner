> **Human override ? 2026-10-18, Codex-led upgrade (active):** User approved immediate implementation of `docs/plans/CODEX_APP_UPGRADE_PLAN.md` and redesign from `D:/Downloads/UI ngonngon tour.svg`. Codex is the sole lead/coordinator (gpt-6.1-sol, medium), owning architecture/contracts/docs/planner/LLM/all backend including `backend/app/chat/`, data and integration. Claude is resting: do not dispatch, consult or start Claude in this session. Antigravity alone implements frontend/QA in its existing worktree, using its configured default model; Codex reviews its changes and Antigravity independently checks backend integration. Every older Claude approval requirement is replaced by Codex lead approval plus affected-agent review; no self-approved production integration. Local commits/integration are authorised, push/deploy are not. Preserve the untracked plans/reviews. Google Maps URLs only, no API/embed/key/billing; unknown evidence stays unknown, allergy/confirmation gates stay enforced. All coordination remains in Orca with fresh lifecycle IDs. Existing historical entries below do not override this direction.

# Three-agent execution backlog

## Claude — coordinator / architect / AI
1. ARCH-01: Reconcile original Word plan, current prototype and approved scope. Deliver PRD, architecture ADR, contract v1, task board and shared fixtures/interfaces. Codex and Antigravity review the consumed interfaces.
2. AI-01: Structured Vietnamese extraction, missing-slot questions and stateful edits; preserve unspecified slots. Coordinate LLM adapter boundary with Codex.
3. PLAN-01: Pure deterministic candidate-set selection and ordering, diversity scored at tour level, actual route-matrix interface, feasible/conditional/no-solution validation. Compare small fixtures against an exact baseline.
4. PLAN-02: Replace-one-stop with identity/order locks; no duplicate venues and explicit failure reasons. Checked explanations only.
5. INT-01: Integrate reviewed commits, run combined checks, route failures to owners and report checkpoint evidence. Codex must review Claude's own production changes.

## Codex — data / backend
1. DATA-BE-00 (independent first task): Read and reproduce current baseline tests; audit local data without publishing it. Deliver docs/reports/CODEX_BASELINE.md with commands, actual results and proposed extraction boundary. Avoid changing shared production files before interface agreement.
2. DATA-01: Canonical validation, provenance, idempotent import, rejection report and synthetic fixtures. Null/zero/duplicate/online-only/unknown hours tests.
3. BE-01: Extract main.py API vs planner boundaries with preserved behavior; storage interface, DB/migrations and venue search/detail. Coordinate planner ownership before edits.
4. BE-02: Routing + LLM provider adapters, deadlines/quotas/errors; no outbound paid service without configured approval and credentials.
5. BE-03: Tour/session API, ownership, expiry, revision conflict semantics, validation/rate limits and server-only secrets.
6. OPS-01: Local boot, CI and contract export/drift check. Review Claude planner and Antigravity frontend independently.

## Antigravity — frontend / integration QA
1. FE-QA-00 (independent first task): Reproduce frontend build, inspect current UX, write qa/ACCEPTANCE.md and qa/reports/BASELINE.md. Start mobile-first shell refinement in frontend/ only where API-independent; label mock data and do not change backend.
2. FE-01: Chat/preferences UI, timeline, sources, unknown/estimate/verified states, loading/error/empty behavior on agreed contract.
3. FE-02: Real route vs unknown routing map states, proper attribution, responsive keyboard-usable interactions.
4. FE-03: Replace-stop and preference revisions with before/after changes and lock display.
5. QA-01: Independent deterministic fixtures and E2E across desktop/mobile; preserve slots, impossible requests, upstream timeouts, no invented claims, session isolation and prompt injection.
6. QA-02: Evidence report and regression checks after fixes; Codex independently reviews frontend.

## Initial launch preferences
Claude coordinator: claude-sonnet-5-5, medium. Hard questions: consult claude-opus-5-5 in Orca, then resume Sonnet.
Codex worker: gpt-6.1-sol, medium.
Antigravity worker: leave --model and --effort omitted, inheriting the user's configured 3.8 Flash high default. Report effective selection if runtime exposes it; don't invent a model ID.

Use the existing worktrees listed in docs/ORCA_LAUNCH.json if present; do not create duplicate workers. First two worker tasks above are independent of contract finalization. Subsequent tasks follow real interface dependencies.
