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

## v1.1 additions (additive, 2026-10-15, agreed with Codex BE-01)
- Mutating session endpoints (`messages`, `preferences`, `tour`, `tour/replace`) return one wrapper: `{preferences, missing_slots, questions, tour|null, revision, dataset_source, dataset_version}`. `Tour.revision == revision`. `POST /v1/sessions` returns only `{session_id, token, revision: 0}`.
- `messages` body is `{text}` only; messages serialize per session (no base_revision).
- Failed replacement: HTTP 409 `no_candidates`; session and tour unchanged.
- Unavailable extractor: HTTP 503 `provider_unavailable`.
- `GET /v1/venues` keeps legacy `items`; `GET /v1/venues/{id}` uses v1 evidence fields.
- Optional metadata `dataset_source` (`private`/`synthetic`), `dataset_version`, `synthetic` may accompany responses and `/health` so fallback data is labelled in the UI.
- Fail-closed: a tour that fails `validate_tour` is never returned; error code `internal_validation_failed`, no stops.

## v1.2 additions (additive, 2026-10-15)
- `GET /v1/sessions/{id}` (header `X-Session-Token`) returns the same SessionView wrapper as mutating endpoints, rebuilt from the current dataset. If the stored tour's `dataset_version` differs from the loaded one, or any stored venue is no longer valid, `tour` is `null` and `notes` explains that data changed; preferences are preserved.
- Planner rebuild uses the public `planner.engine.build_tour(venues, prefs, venue_ids)`; stored tours are never trusted without recomputation.

## v1.3 additions (additive, 2026-10-15; verified-evidence overlay)
- `Price.semantics` and `VenueListItem.price_semantics` enum is `venue_range | per_person`. `per_person` is emitted ONLY for prices that come from an accepted verified overlay entry (with source and verified_at); every other price stays `venue_range` with evidence `estimate`.
- `dataset_version` is the combined hash of input and overlay content when an overlay is configured (unchanged otherwise), so stored sessions are invalidated correctly.
- `/health.evidence_overlay` carries counts only: `{entries_loaded, entries_rejected, hours_verified, prices_verified}`. A configured but missing/malformed overlay fails closed (redacted 503), never silently serves unverified data as verified.
- Error code `dataset_changed` (HTTP 409, no mutation): returned by `tour/replace` (and any tour action) when the session's stored tour was built on a different dataset/overlay version than the one now loaded. The client should re-plan (`POST /tour`). It is distinct from `no_candidates` (no valid replacement exists).

## v1.4 additions (additive, phase 3)
- `Stop.leg_from_previous.geometry`: `[[lat, lon], ...] | null`. Present only when `source = provider_route` and the routing provider returned a route; display-only. Never present for estimated legs. Durations/distances come from the provider's walking matrix.
- `Tour.explanation_source`: `template | llm`. `llm` only when a Gemini-worded text passed `check_explanation` against facts of the validated tour; otherwise the template text is returned.
- `SessionView.extraction_source` (messages only): `rules | llm`. When the LLM fails, the rule extractor answers and `notes` says so.
- `/health` additive: `llm_provider (rules|gemini|http|off)`, `llm_model`, `explanation_provider (template|gemini)`, `routing_provider (estimate|ors|osrm)`, `routing_last_error`. Never contains keys.
- `routing` mode `osrm` now uses OSRM `table` + `route` (foot profile, GeoJSON steps); `ors` uses openrouteservice `foot-walking` matrix + directions.

## v1.5 additions (additive, phase 4 — Google Maps platform)
Normative for Codex (server) and Antigravity (browser). Field names below are fixed.

### `GET /v1/client-config` (no auth, no secrets beyond the restricted browser key)
```
{ "maps": { "provider": "google",
            "status": "ready" | "unavailable",
            "reason": null | "not_configured",       // never a key name or value
            "js_api_key": string | null,             // GOOGLE_MAPS_BROWSER_KEY (referrer-restricted browser key)
            "map_id": string | null,                 // GOOGLE_MAPS_MAP_ID (required for Advanced Markers)
            "language": "vi", "region": "VN",
            "default_center": {"lat": 21.0285, "lon": 105.8522}, "default_zoom": 15 },
  "geocoding": {"status": "ready" | "unavailable"},   // server-side POST /v1/geocode
  "routing":   {"provider": "google_routes" | "ors" | "osrm" | "estimate", "status": "ready" | "unavailable"},
  "privacy":   {"sent_to_google": ["map_tiles", "autocomplete_text", "route_coordinates"], "doc": "docs/PHASE4.md"} }
```
`js_api_key` is returned only when `status = ready`.

### `GET /v1/venues/map?min_lat&min_lon&max_lat&max_lon&limit<=500&q?`
```
{ "items": [{"id","name","lat","lon","district","dish_tags": [string], "price_max_vnd": int|null, "synthetic": bool}],
  "total_in_view": int, "truncated": bool, "dataset_source", "dataset_version" }
```
Physical venues with valid geo only (`online_only=false`, `geo_ok=true`), deterministic order, never more than `limit`. Evidence fields stay unknown-safe: no opening-hours or per-person claims here.

### `POST /v1/geocode` `{ "query": string (<=200) }` — manual address fallback (server key)
```
{ "status": "ok" | "zero_results" | "unavailable" | "quota",
  "provider": "google_geocoding",
  "results": [{"label": string, "lat": number, "lon": number, "place_id": string|null}]  // <= 5, Hà Nội-biased
}
```
Rate limited per token; the query text goes to Google (documented). Never returns the key.

### Preferences additions
`origin_label: string | null` (<=120, display only) and `origin_source: "current_location" | "place" | "manual_coordinates" | "landmark" | "geocoded" | null`. They never affect planning. `current_location` coordinates are session data (TTL) and are never logged.

### Tour additions
- `totals.route_provider: "google_routes" | "ors" | "osrm" | null`
- `tour.route_warnings: string[]` — **Google's `routes[].warnings[]` for walking routes; the UI must display them** (Google requires showing the walking warning) next to any drawn route. Empty when estimated.
- `leg_from_previous.geometry` (v1.4) is produced from Google Routes output only when `source = provider_route`.
- Estimated legs (`straight_line_estimate`) are NEVER drawn as a route; at most a clearly captioned dashed hint (or nothing).

### Errors / states
`provider_unavailable` (503) for routing/geocoding provider failures keeps its envelope. The frontend must show labelled unavailable states for: map not configured, geolocation permission denied / timeout / insecure context, autocomplete unavailable, geocode `quota` / `unavailable`, routes unavailable.

### Configuration (server only, git-ignored `backend/.env`)
`GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_MAP_ID`, `GOOGLE_MAPS_SERVER_KEY`, `FOODTOUR_ROUTING=google`, `FOODTOUR_GEOCODER=google`; plus existing `GEMINI_API_KEY`, `FOODTOUR_LLM=gemini`. Daily budgets: `FOODTOUR_ROUTING_DAILY_BUDGET`, `FOODTOUR_GEOCODE_DAILY_BUDGET`.

### v1.5 addendum — free-text origins (Claude/Gemini ↔ API)
The extractor may return `origin_text` (a place phrase the user wrote that is not a built-in landmark). The API layer, not the model, resolves it: if the geocoder is `ready`, call it server-side; on `ok` with ≥1 result use the first result, set `origin`, `origin_label = result.label`, `origin_source = "geocoded"` and add a note ("Điểm xuất phát lấy theo kết quả tìm kiếm Google: …; bạn có thể sửa"); on `zero_results`/`unavailable`/`quota` leave `origin` unset (missing slot, ask the user) and add a labelled note. Geocoding never happens without `origin_text`, and `origin_text` is never logged. Built-in landmarks resolve locally (`origin_source = "landmark"`, no Google call).
- `POST /v1/geocode` requires `X-Session-Token` (any valid session): 401 missing, 403 invalid/expired, 429 rate limit. Provider outcomes return HTTP 200 with `status` = `ok | zero_results | unavailable | quota`. `/health.geocoding = {status: ready|unavailable, last_error: kind|null}`. `/v1/client-config` always includes `js_api_key` and `map_id` (null when unavailable), never omitted.
