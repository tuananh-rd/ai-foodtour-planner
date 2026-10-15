# PRD — AI FoodTour Planner (local MVP)

Status: v1, 2026-10-15. Owner: Claude (coordinator). Scope authority: human approval recorded in AGENTS.md.

## Goal
A user describes in Vietnamese (chat or structured form) a food outing in one Hanoi pilot area. The system returns one walking tour of 3–5 stops when evidence allows, shows it on a timeline and map, and lets the user replace exactly one stop while the others stay fixed.

## Flows (P0)
1. Describe: free text or structured form -> preferences. Missing required slots are asked back, never guessed.
2. Plan: server validates and plans deterministically; status is one of `verified_feasible`, `conditional`, `insufficient_evidence`, `no_solution`.
3. Inspect: each stop shows source link, per-field evidence state (`verified` / `estimate` / `unknown`), and the walking leg with its source (`provider_route` / `straight_line_estimate` / `unknown`).
4. Replace one stop: the rest keep venue identity and order; times are recalculated; failures return reasons.
5. Revise preferences: unspecified slots are preserved from the prior revision.

## Non-goals (P0)
Accounts, top-3 alternative tours, multiple travel modes, admin web app, sharing, public deployment, paid services, new scraping.

## Truthfulness requirements
- Unknown price/hours/ingredients/status stay unknown. A venue price range is not a per-person bill.
- Strict mode rejects missing required evidence. Infeasible requests return reasons plus proposed changes; constraints are never silently relaxed.
- No invented venue IDs, opening claims, route geometry, ETA or allergy safety.
- The LLM only extracts preferences and words explanations of already-checked results.

## Success criteria
- Every returned tour passes the hard-constraint checker (`planner.validate_tour`). Extraction success is reported separately.
- Local run: chat -> tour -> map -> replace stop works on desktop and mobile with mock providers and with provider failure.
- Works without the private dataset using labeled synthetic fixtures (`contracts/fixtures/`).
