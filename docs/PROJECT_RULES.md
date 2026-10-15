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
