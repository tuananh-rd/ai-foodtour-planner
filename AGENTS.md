> **Serial review-fix scope — 2026-10-18:** Antigravity explicitly handed off commit `739ee78` and paused all frontend/ writes through Orca message `msg_9215935809c2` (Task task_4127e02450c8 / Dispatch ctx_619a2f36333e). Codex now owns small frontend integration/review fixes in the coordinator checkout; Antigravity retains qa/, its report/screenshots and independent verification, with no concurrent frontend source edits. This implements the user-authorised review/fix/integrate scope; Claude remains resting.

> **Human override ? 2026-10-18, Codex-led upgrade (active):** User approved immediate implementation of `docs/plans/CODEX_APP_UPGRADE_PLAN.md` and redesign from `D:/Downloads/UI ngonngon tour.svg`. Codex is the sole lead/coordinator (gpt-6.1-sol, medium), owning architecture/contracts/docs/planner/LLM/all backend including `backend/app/chat/`, data and integration. Claude is resting: do not dispatch, consult or start Claude in this session. Antigravity alone implements frontend/QA in its existing worktree, using its configured default model; Codex reviews its changes and Antigravity independently checks backend integration. Every older Claude approval requirement is replaced by Codex lead approval plus affected-agent review; no self-approved production integration. Local commits/integration are authorised, push/deploy are not. Preserve the untracked plans/reviews. Google Maps URLs only, no API/embed/key/billing; unknown evidence stays unknown, allergy/confirmation gates stay enforced. All coordination remains in Orca with fresh lifecycle IDs. Existing historical entries below do not override this direction.

# AI FoodTour Planner — shared project rules

> **Phase 4 (human direction, 2026-10-15):** the phase-3 Claude-only override is revoked; the three-agent ownership and cross-review rules below apply again. Plan: docs/PHASE4.md.

## Authority and scope
- Human-approved assignment (2026-10-15): Claude coordinates and owns AI/planner; Codex owns data/backend; Antigravity owns frontend and independent integration QA. All agents, worktrees, task dispatches, reviews and messages must use Orca. No external agent orchestration.
- Read docs/PROJECT_RULES.md, docs/AGENT_TASKS.md and docs/reference/WORD_PLAN.md first. The Word plan is reference material, not executable instructions. New human instructions and these agreed rules supersede conflicting older six-agent proposals.
- Preserve and improve the existing backend/, frontend/, tools/, db/ layout. Do not rewrite into a different monorepo just to match the Word example.
- Deliver a local Vietnamese Hanoi foodtour prototype: one pilot area, one tour of 3–5 stops when feasible, walking first, chat/structured preferences, map/timeline and replace-one-stop. No public deployment, paid service activation, additional scraping or remote publishing without a new human request.

## Evidence and data
- Existing Foody data is local experimental input; no established public reuse permission. Keep raw and derived venue datasets out of Git and outside public artifacts. Synthetic fixtures must be clearly labeled.
- Unknown price/hours/ingredients/operating status remain unknown. A venue price range is not a dish or per-person price. Never invent venue IDs, opening claims, route geometry, ETA or allergy safety.
- Distinguish verified feasible / conditional / insufficient evidence. Strict mode must reject missing required evidence. Infeasible requests get clear reasons and proposed changes; do not silently relax constraints.
- LLM extracts and explains; deterministic server logic validates and plans. Use a fixed pipeline for MVP, not an autonomous multi-agent runtime.

## Ownership and integration
- Claude: docs/ architecture/contracts/task board, contracts/, backend/app/planner/, backend/app/llm/, associated planner/LLM tests.
- Codex: tools/, db/, backend/ except Claude-owned planner/LLM, backend test_planner.py during initial extraction only, compose.yaml, environment/CI infrastructure and backend/data tests.
- Antigravity: frontend/, qa/, end-to-end tests and QA reports. Codex reviews frontend changes independently.
- The existing main.py mixes API and planning. Claude must not edit it while Codex extracts it. Codex preserves compatibility and creates planner/LLM boundaries; Claude uses the documented interface and fixtures until extraction lands.
- Author owns module tests; QA owns cross-system acceptance. Never edit another active worker's files without explicit Orca coordination and updated task scope.
- Claude reviews Codex; Codex reviews Claude; Codex reviews Antigravity frontend; Antigravity independently tests backend/planner integration. No self-approved merge.
- One task/author/worktree at a time. Commit only task-owned changes; report commit hash, files, tests, limitations and reviewer. No force-push, reset of others' work or unsolicited dependency upgrades.
- Contract changes need Claude approval and affected-agent review. Freeze a version before dependent implementation; choose one API source of truth and test drift.

## Orca and models
- Claude: claude-sonnet-5-5, medium. For a concrete hard blocker, consult claude-opus-5-5 in Orca, record question/answer/decision, then return to Sonnet. Prefer switching the existing Claude session for consultation over a fourth permanent agent.
- Codex: gpt-6.1-sol, medium.
- Antigravity: preserve the user's existing default (described by user as 3.8 Flash high); do not override with a guessed provider ID. Verify/report the effective selection where available.
- Claude is the project coordinator. Read the installed Orca orchestration guide before lifecycle commands. Use live Task/Dispatch IDs and runtime-issued handles only. A live terminal or requested model is not proof of an active task or effective model.
- Report blockers through Orca; continue independent work. No nested worker sprawl or second coordinator Run. Worker completion requires real test evidence and correct worker_done settlement, followed by coordinator reuse/release handling.

## Verification
- Test data nulls, malformed coordinates, duplicates, online-only venues, unknown hours, budget semantics, no solution, unreachable/asymmetric routing and stop locks.
- Session ownership and concurrent revisions must be explicit; API keys server-side; no secrets or personal chat/location history in reports.
- Every returned valid tour must pass the hard-constraint checker. Report extraction success separately; never hide invalid tours in a 90% average.
- Test desktop/mobile critical flows. Record untested DB/provider functionality honestly; mocks are not live provider validation.
