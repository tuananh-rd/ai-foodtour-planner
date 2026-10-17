> **Serial review-fix scope — 2026-10-18:** Antigravity explicitly handed off commit `739ee78` and paused all frontend/ writes through Orca message `msg_9215935809c2` (Task task_4127e02450c8 / Dispatch ctx_619a2f36333e). Codex now owns small frontend integration/review fixes in the coordinator checkout; Antigravity retains qa/, its report/screenshots and independent verification, with no concurrent frontend source edits. This implements the user-authorised review/fix/integrate scope; Claude remains resting.

> **Human override ? 2026-10-18, Codex-led upgrade (active):** User approved immediate implementation of `docs/plans/CODEX_APP_UPGRADE_PLAN.md` and redesign from `D:/Downloads/UI ngonngon tour.svg`. Codex is the sole lead/coordinator (gpt-6.1-sol, medium), owning architecture/contracts/docs/planner/LLM/all backend including `backend/app/chat/`, data and integration. Claude is resting: do not dispatch, consult or start Claude in this session. Antigravity alone implements frontend/QA in its existing worktree, using its configured default model; Codex reviews its changes and Antigravity independently checks backend integration. Every older Claude approval requirement is replaced by Codex lead approval plus affected-agent review; no self-approved production integration. Local commits/integration are authorised, push/deploy are not. Preserve the untracked plans/reviews. Google Maps URLs only, no API/embed/key/billing; unknown evidence stays unknown, allergy/confirmation gates stay enforced. All coordination remains in Orca with fresh lifecycle IDs. Existing historical entries below do not override this direction.

# Working agreement — 2026-10-15

The human approved implementation by three agents entirely in Orca. Claude has authority to sequence tasks, approve routine architecture choices, arrange cross-review and integrate local commits. The human remains the owner of product scope, public release and unresolved data permissions.

## MVP decisions
- Preserve existing code and its tests. Audit its real behavior before claiming anything is complete.
- One local Hanoi pilot, walking, one tour and replacing one stop. No accounts, top-three alternative tours, multiple travel modes, admin web app or sharing features in P0.
- Conditional exploration can operate with clearly disclosed unknowns. Strict feasibility needs reliable hours, actual routing and adequate cost semantics. Source timestamps do not prove facts were verified.
- Budget must specify per-person vs group and currency. Do not add venue ranges and present them as an actual meal bill.
- Locks initially preserve venue identity and sequence; times can be recalculated. Changing this needs an ADR and updated tests.
- Use server-generated FastAPI OpenAPI as API implementation source of truth; export a versioned contract for frontend, reviewed by Claude, with drift checks. Preserve current /v1/plans compatibility until replacement is deliberate and documented.
- Use fixed extraction -> validation -> planner -> checked explanation. Credentials absent: mock providers and explicit unavailable status, never fake live success.

## Coordination
Claude creates one Orca Run from its own valid terminal and dispatches Codex and Antigravity into their dedicated worktrees. Initial independent work is data/backend audit and UX/acceptance audit while Claude finalizes contracts. Then proceed in waves, merging reviewed contracts before dependent changes. Track task outcome, commit, reviewer, evidence and blockers in docs/TASK_BOARD.md.

Task specifications must include goal, inputs, outputs, allowed/forbidden paths, dependencies, observable acceptance, test commands, reviewer and escalation triggers. Keep tasks bounded and reviewable. The initial coordinator handoff is for continuing the local MVP, not stopping after writing a plan.

Each worker reports only verified results through Orca. Claude processes questions and completion messages, checks evidence and explicitly reuses or releases settled workers. Retain terminals only with human authorization. Follow the runtime's exact recovery receipts; never restart a worker on an ambiguous timeout.

## Model escalation
Only Claude's hard architecture/planning blockers justify Opus 5.5 consultation: unresolved tradeoffs, repeated failures with evidence, security-sensitive design uncertainty. Record the narrow question, relevant evidence and outcome. Do not silently replace the user's requested models or change global agent defaults.

## Data access
Existing local input is under the main checkout's ignored data/ directory. A worker may read it by absolute path for internal auditing; don't commit or copy it to public test fixtures. All worktrees must remain runnable using labeled synthetic fixtures when that private input is absent.

## Gates
1. Baseline reproduced; audit and contract accepted by affected owners.
2. Data/API, planner and UI unit checks pass with truthful conditional behavior.
3. Integrated chat -> tour -> map -> replacement passes desktop/mobile tests, including provider failure.
4. Independent cross-review and security checks; document unresolved limitations. Local MVP handoff only; public deployment remains outside current authorization.
