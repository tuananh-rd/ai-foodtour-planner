# Contract v1 (frozen 2026-10-15)

Version `1.0`. Machine truth: FastAPI OpenAPI exported to `contracts/v1/openapi.json` (Codex OPS-01 adds export + drift check). Field names below are normative.

## Enums
- `TourStatus`: `verified_feasible` | `conditional` | `insufficient_evidence` | `no_solution`
- `Evidence`: `verified` | `estimate` | `unknown`
- `LegSource`: `provider_route` | `straight_line_estimate` | `unknown`
- `Mode`: `explore` | `strict`
- `BudgetScope`: `per_person` | `group` | null

## Preferences
```
city: string = "Hà Nội"
origin: {lat, lon} | null
start_time: "HH:MM" | null      # local, Asia/Ho_Chi_Minh
weekday: 0..6 | null            # 0 = Monday
duration_min: int 30..720 | null
budget_vnd: int > 0 | null
budget_scope: BudgetScope       # required when budget_vnd is set
party_size: int 1..20 | null
interests: string[] (<=10)
exclusions: string[] (<=10)
max_stops: int 1..5 = 3
mode: Mode = "explore"
```
Required to plan: `origin`, `duration_min`. Required for budget checks: `budget_vnd` + `budget_scope`. Missing slots come back as `missing_slots` plus Vietnamese `questions`.

## Tour
```
revision: int
status: TourStatus
stops: Stop[]
reasons: string[]            # why status is not verified_feasible
proposed_changes: string[]   # suggestions, never auto-applied
unknowns: string[]
totals: {venue_range_upper_sum_vnd, walk_minutes: int|null, leg_source: LegSource}
explanation: string | null   # checked text only
locks: string[]              # pinned venue_ids
```
Stop:
```
venue_id, name, address, district, lat, lon, source_url, order
arrive: "HH:MM"|null, depart: "HH:MM"|null
leg_from_previous: {minutes: int|null, km: number, source: LegSource}
price: {min_vnd, max_vnd, semantics: "venue_range", evidence: Evidence}
hours: {status: Evidence, display: string|null, open_at_arrival: true|false|null}
```
`open_at_arrival = null` means unknown, never `true`.

## Endpoints
| Method / path | Purpose |
|---|---|
| `GET /health` | `{status, dataset_loaded, llm: mock/live/unavailable, routing: ...}` |
| `GET /v1/venues`, `GET /v1/venues/{id}` | search / detail with evidence fields |
| `POST /v1/sessions` | -> `{session_id, token, revision: 0}`; token sent as `X-Session-Token` |
| `POST /v1/sessions/{id}/messages` `{text}` | extract + merge -> `{preferences, missing_slots, questions, tour\|null, revision}` |
| `PUT /v1/sessions/{id}/preferences` `{base_revision, preferences}` | structured edit; 409 `revision_conflict` if stale |
| `POST /v1/sessions/{id}/tour` `{base_revision}` | plan with current preferences |
| `POST /v1/sessions/{id}/tour/replace` `{base_revision, venue_id}` | replace one stop, others locked |
| `POST /v1/plans` | legacy prototype endpoint, unchanged |

Errors: `{error: {code, message, details?}}`. Codes: `validation_error`, `unauthorized_session`, `session_expired`, `revision_conflict` (409), `provider_unavailable` (503), `rate_limited` (429), `no_candidates`.

## Invariants (tested)
1. Every tour with `stops` passes `validate_tour`.
2. Replace keeps all other `venue_id`s and their order; the new venue is not already in the tour.
3. Unspecified preference slots survive a message revision.
4. `verified_feasible` needs provider routes, known hours covering arrival..depart, and per-person price evidence within budget; otherwise at best `conditional`, and strict mode returns `insufficient_evidence`.
5. Sessions are isolated by token; the LLM never receives another session's data.
