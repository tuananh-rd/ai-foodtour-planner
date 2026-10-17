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

## v1.6 additions (additive, upgrade R0/R1 — see docs/UPGRADE_PLAN.md §5.2)
Normative for Codex (server) and Antigravity (browser). Field names are fixed. Items marked **planned** are defined now so the UI does not guess; they are NOT implemented in R0/R1-lite.

### `/health.llm_budget` (null unless an LLM provider with a budget is active)
```
"llm_budget": { "limit": int, "used": int, "remaining": int, "exhausted": bool,
                "resets_at": "ISO-8601 UTC", "window": "pacific_midnight" }
```
Default `limit` = 18 (`FOODTOUR_LLM_DAILY_BUDGET`, configurable; the free tier allows 20 and 2 are reserved). The daily window resets at **midnight US Pacific time** (matches the provider's quota reset); an HTTP 429 from the provider is authoritative: it marks the budget `exhausted` until the next reset regardless of the local counter. No key material is ever included.
Persistence: the counter and the exhausted flag live in a dedicated SQLite file (`<FOODTOUR_SESSION_DB>.budget.sqlite`, override `FOODTOUR_BUDGET_DB`; in-process when no session DB is configured) using short transactions, separate from the session store, so it never contends with session transactions held across a provider call. The counter is monotonic within a window.

### Messages response (additive)
`extraction_source: "rules" | "llm" | "cache"` (adds `cache`), `llm_calls: 0 | 1` (1 = the model was invoked for THIS message, including when it then failed and the rule result was returned; a purely local budget refusal is 0; the daily budget `used` counts every transport attempt once, so a transient-5xx retry can raise `used` by 2 while `llm_calls` stays 1), `llm_budget: {limit, remaining, exhausted} | null`. The rule extractor answers without any provider call when the required slots (origin and duration) are present and nothing needs the model (see UPGRADE_PLAN §5.3).

### Venue evidence fields (additive on `GET /v1/venues`, `GET /v1/venues/{id}`, tour stops' `venue`; every value is "as reported by the source")
```
"rating":  { "value": number|null,   // normalised to 0..5 using the source scale
             "count": int|null,      // review_count
             "source_scale_max": number|null },
"suitable_meals": [string],          // as in the source (e.g. breakfast/lunch/dinner labels, Vietnamese)
"audiences": [string],
"cuisine_styles": [string],
"amenities": {"yes": [string], "no": [string]},
"source_fetched_at": "ISO-8601"|null   // CSV fetched_at; UI says "thu thập ngày …"
```
`rating.count < 5` or a missing value is shown as "ít đánh giá"/"chưa có", never as a score. None of these fields is evidence of opening hours or per-person price.

### Tour stops (additive)
Each stop may carry a nested optional `venue` object (the venue evidence view above) in addition to the existing flattened fields.
`why: [{ "code": "match_interest"|"near_origin"|"short_walk"|"well_rated"|"fits_meal"|"diverse", "text": string }]` — text is generated from validated facts by templates (no LLM needed); `well_rated` appears only when `rating.count >= 20`.

### Preferences (additive)
`meal: "breakfast"|"lunch"|"snack"|"dinner"|"late"|null` (`late` = after 22:00 / before 05:00; source label "Buổi khuya") (defaults from `start_time`, user-editable, display + soft ranking only), `audience: "solo"|"friends"|"family"|null` (soft ranking only). Neither is a hard constraint: they never change hard feasibility (hours, budget, time, legs). `why[]` texts are recomputed from venue + preferences + start time and compared by `validate_tour`, so changing `meal` may legitimately change the explanations of an otherwise identical tour. `meal` is the explicit value (null when the user did not say); the meal used for ranking is `meal` or, when null, derived from `start_time`. `meal`/`audience` come from the structured API or the local rules; the LLM extraction schema does not carry them, and rule-detected values survive an LLM answer. Source-controlled strings (tags, names) are never interpolated into `why[].text`.

### `/v1/client-config` (additive)
`"features": {"ui_v2": bool}` — from server env `FOODTOUR_UI_V2=1`; the frontend may also honour `?ui=v2` for development. When false the existing layout is shown (rollback switch).

### Planned (documented now, implemented later)
- `POST /v1/sessions/{id}/tour/alternatives` `{venue_id}` → `{items: [≤3 {venue, why[], delta_walk_minutes, delta_price_max_vnd}]}` (R1-6).
- `GET /v1/sessions` (token) → saved itineraries list (R2-3).
- `GET /health/details` (only when `FOODTOUR_DEV=1`): local counters without PII (R2-7).

### Compatibility
All additions are optional for old clients; no existing field changes meaning. OpenAPI is regenerated by Codex (`tools/export_openapi.py`) and drift-tested.

## v1.7 additions (additive, GMAPS-URL — free Google Maps URLs, no API)

Open the proposed itinerary in Google Maps through the public **Maps URLs** scheme. This uses **no Maps API, no API key, no billing and no backend call to Google**: the server only *builds strings*; the browser opens them when the user clicks. Source of the scheme: https://developers.google.com/maps/documentation/urls/get-started (api=1, no key, 2,048-char URL limit, max 3 waypoints on mobile — 9 elsewhere, waypoints keep the given order).

### `GET /v1/sessions/{id}/tour/maps-links?mode=walking|driving` (X-Session-Token; `mode` default `walking`)
Valid only when the session has a tour with stops (else `409 no_tour`). Idempotent, read-only, makes no provider call.
```
{ "status": "ok" | "partial" | "unavailable",
  "travelmode": "walking" | "driving",
  "provider": "google_maps_urls", "uses_api": false,
  "links": [ { "index": 1, "of": 2, "url": string, "from_stop": int|null,   // null = tour origin
               "to_stop": int, "waypoint_count": 0..3, "url_length": int,
               "point_kinds": ["latlng"|"address", ...] } ],                // origin, waypoints…, destination
  "skipped": [ { "stop_order": int, "venue_id": string, "reason": "no_usable_point"|"url_too_long" } ],
  "notes": [string] }
```
Rules (all tested without calling Google):
1. URL shape: `https://www.google.com/maps/dir/?api=1&origin=…&destination=…[&waypoints=a|b|c]&travelmode=walking|driving`, built with a standard encoder (`urllib.parse.urlencode`, `|` between waypoints then percent-encoded). `api=1` always present; `dir_action=navigate` is never used.
2. Points: `lat,lng` (finite, in range, 6 decimals) of the tour origin and of each venue; only if unusable, the normalised full address (trimmed, whitespace collapsed, ≤200 chars, control chars removed) with `point_kinds` `address`. A point with neither is `no_usable_point`.
3. Order is exactly the planner's stop order; Google is never asked to optimise or re-order, and the response never claims Google time/distance.
4. Limits: at most **3 waypoints per link** and `url_length` (after encoding) **≤ 2,048**. A tour with more points is split into consecutive links; the destination of link *i* is the origin of link *i+1* (repeated join point), order unchanged. If a link is too long the builder uses fewer waypoints in that link (more links). If even a link with no waypoints exceeds the limit its stops are listed in `skipped` (`url_too_long`).
5. `partial` = at least one link was built but some stops are in `skipped`; the contiguous usable runs get links, nothing is silently dropped or reordered, `notes` explains. `unavailable` = no link could be built; `links` is empty. `ok` = every stop covered.
6. `notes` always includes the privacy sentence: links contain the origin/venue coordinates and are sent to Google only when the user opens them. UI copy must say the schedule is the app's proposal and that Google may show different times.
7. UI contract: primary button "Xem lịch trình trên Google Maps" (one link) or "Chặng i/n: <from> → <to>" per link; `target="_blank"` and `rel="noopener noreferrer"`; a walking/driving toggle (default walking); no map embed, tiles or API.

## v1.6.1 additions (additive, C0-HF — allergy never silently dropped)
- `Preferences.allergies: string[]` (≤10 items, each ≤40 chars, no control/format characters; default `[]`): ingredients/foods the user reports as an **allergy or medical avoidance**, distinct from `exclusions` (taste). Written by the rules extractor (`dị ứng …`, `kiêng …`, `không ăn được …`) and editable in the form; accumulates across messages.
- The dataset has **no ingredient/menu/allergen data**, so no venue is ever "safe": the planner only *excludes* venues whose name or dish groups point at the allergen (conservative vocabulary in `planner/allergens.py`; unknown terms match only an exact name/tag). While `allergies` is non-empty every tour carries `unknowns` entry `"allergy_ingredients"` (status is never `verified_feasible`; strict mode therefore yields `insufficient_evidence`), and explanations say "hãy hỏi quán trước khi ăn".
- `POST …/messages` records the allergy, adds a `notes` entry stating the above, and a bare "không ăn X" for a known allergen goes to `exclusions` plus a note asking "dị ứng hay không thích?". Party-size edits ("đổi thành 4 người") apply; out-of-range values are reported in `notes`/rejected, not ignored.

## v1.8 additions (additive, conversation upgrade — docs/CHATBOT_UPGRADE_PLAN.vi.md)

Flag: `features.chat_v2` in `GET /v1/client-config` (server env `FOODTOUR_CHAT_V2=1`, default false). `POST …/messages` keeps its v1.6 behaviour unchanged; v1.8 adds `POST …/chat` and a read-only `chat` object on `GET /v1/sessions/{id}`. Every fact in a reply comes from an internal tool over the dataset (never from the LLM); the LLM, when used, only *understands* the user's turn (docs plan §3).

### `POST /v1/sessions/{id}/chat` (X-Session-Token; 404 when the flag is off)
Request: `{ "text": string(1..1000) | null, "action": Action | null, "revision": int }` — exactly one of `text` / `action` is non-null (else 422). `revision` is the client's last known revision (409 `revision_conflict` as elsewhere).
`Action = { "type": "add"|"remove"|"keep"|"compare"|"pick_option"|"confirm_yes"|"confirm_no"|"edit_profile"|"set_location"|"request_plan"|"search", "venue_id"?: string, "venue_ids"?: string[≤4], "option_id"?: string, "criteria"?: string[≤3], "patch"?: object, "location"?: {"district"?: string, "label"?: string, "lat"?: number, "lon"?: number}, "query"?: string(≤200) }`. Buttons send actions (deterministic, 0 LLM calls); typed text is understood by rules first, then at most one LLM call (§ budget).
Response: the existing `SessionView` **plus** `"reply": {"blocks": Block[]}` and `"chat": ChatState` and `"turn": {"intent": string, "tools": string[], "understanding": "rules"|"llm"|"cache"|"action"}` (`extraction_source`, `llm_calls`, `llm_budget` as in v1.6). `tour` is non-null only after an explicit `confirm_yes` on a `confirm_plan` pending (or `request_plan` followed by confirmation); exploration turns never create a tour.

### Blocks (`type` discriminator; unknown types must be ignored by clients)
- `text` `{text}`; `notice` `{level:"info"|"warning"|"safety", code, text}` (e.g. `allergy_unknown`, `no_weather_data`, `price_not_per_person`, `outside_hanoi`).
- `dish_suggestions` `{items:[{dish_group, blurb, venue_count:int, radius_m:int, kind:"general_knowledge"}]}` — blurb is general knowledge; `venue_count` is counted in the dataset around `profile.area`.
- `venue_cards` `{title?, cards:[{label:"A"|"B"|…, venue:{id,name,district,address,dish_tags[],price:{min_vnd,max_vnd,semantics:"venue_range",evidence}|null,hours:{status,display}|null,rating:{value,count}|null}, distance_m:int|null, distance_source:"straight_line_estimate"|"unknown", why:[{code,text}], flags:[{code:"allergy_unknown"|"allergen_excluded"|"hours_unknown"|…,text}], in_shortlist:bool}]}` — labels are the handles the user may refer to ("A", "quán đầu"); they are stored in `chat.last_results`.
- `compare_table` `{criteria:[{id,label}], columns:[{label,venue_id,name}], rows:[{criterion_id,cells:[{value:string|null,status:"source"|"estimate"|"unknown",note?}]}], unsupported:[{criterion,text}]}` — only criteria the data supports (distance estimate, price range, rating "theo nguồn", meal/audience labels, listed amenities, capacity "theo nguồn", prep time "theo nguồn"); `amenities_no` is empty in the source, so absence is never stated; unsupported requests (quiet, crowded, elderly-friendly…) go to `unsupported`.
- `clarify` `{pending_id, question, options:[{option_id,label}≤4]}` — also stored as `chat.pending`; answered by `pick_option`, by a short yes/no, or by typing.
- `confirm_summary` `{items:[{id,label,value:string|null,status:"user"|"inferred"|"default"|"missing",editable:bool}], shortlist:[{venue_id,name,status}], missing:string[], warnings:[{code,text}]}` + implicit pending `confirm_plan`.
- `tour_ready` `{revision}` — the full tour is in `SessionView.tour`.

### `ChatState`
`{ "phase":"discover"|"choose"|"confirm"|"planned", "profile":{ "area":F, "party_size":F, "audience":F, "budget":F, "start_time":F, "end_time":F, "duration_min":F, "vehicle":F, "tastes":F, "max_leg_min":F }, "allergies":[{"term","family"|null,"source":"user_said"|"ui_form","venue_confirmations":[{"venue_id","text","at"}]}], "shortlist":[{"venue_id","status":"considering"|"kept","note"?}], "last_results":[{"label","venue_id"}], "pending":null|{"pending_id","kind":"clarify_slot"|"clarify_intent"|"pick_venue"|"confirm_plan","options":[…]}, "turn_count":int }` where `F = {"value":any|null,"source":"user_said"|"ui_form"|"inferred"|"default"|"missing","turn":int,"confirmed":bool}`. A confirmed field is never asked again; "đổi thành 4 người" overwrites and marks dependants (`tour`, totals) stale. `inferred`/`default` values are shown for correction and are never used as hard constraints.

### Rules (tested by the CH-01…CH-12 scenarios)
1. Only `confirm_yes` on `pending.kind="confirm_plan"` may call the planner; a bare "ok" with another pending resolves *that* pending, with none it yields a `clarify` (never a tour).
2. The same slot question is never asked twice while the slot is `confirmed` or while the same `pending` is open.
3. Allergies: no venue is ever labelled safe; venues whose name/dish groups point at an allergen are removed (`allergen_excluded`), all others carry `allergy_unknown`; a user-reported call to the venue is stored as `venue_confirmations` ("Người dùng xác nhận", not independent verification) and still leaves the tour `conditional` with `allergy_ingredients`.
4. No weather, per-person price, verified hours, real routing or reverse-geocoded address is ever claimed; estimates are labelled "ước tính".
5. LLM budget: ≤1 call per turn, per-session cap (`FOODTOUR_LLM_SESSION_CAP`, default 6), daily reserve (`FOODTOUR_LLM_RESERVE`, default 3) — when refused, the turn is answered by rules + a `clarify` block and `turn.understanding` stays `rules`.
6. Errors reuse the existing error frame; `422 invalid_action` for unknown/ill-formed actions; `409 no_tour`-style errors are not used for exploration.
7. `GET /v1/sessions/{id}` returns `chat` (read-only) when the flag is on, so the UI can restore after a reload.

### v1.8 addendum — Preferences and planning (conversation)
- `Preferences.max_leg_min: int 3..60` (default 20) — maximum minutes of any single leg (was a planner-internal default; now round-trips so "không đi bộ quá 10 phút mỗi chặng" survives reloads). Additive.
- Confirmed plan: the planner receives **only the shortlisted venues** as its pool, keeps every hard preference (mode, exclusions, allergies, budget, `max_leg_min`) and only drops discovery `interests`; if all shortlisted venues cannot be scheduled the response is `no_solution` with `reasons` + `proposed_changes` (never a smaller tour); strict mode keeps its `insufficient_evidence` semantics. Vehicle changes the ETA estimate (average speeds, still labelled `straight_line_estimate`), never the label.
- `confirm_summary.items[].status` ∈ `user|inferred|default|missing`; `compare_table` unknown cells have `value:"Chưa rõ"` (optional `note`, e.g. "ít đánh giá"); `dish_suggestions.items[].venue_count` is `int|null`.

## v1.9 additions (additive, U-series — docs/CHATBOT_UX_AI_V2_PLAN.vi.md; status: PROPOSED→frozen by U0 review)

Flags: `features.chat_v2` (unchanged) and new `features.guided_ui` in `GET /v1/client-config` (env `FOODTOUR_UI_GUIDED=1`, default false). With the flag off no v1.8 behaviour changes (guided questions, coverage trigger and the `understood` block are off); new fields are additive (e.g. `profile.stops`, `profile.day_part`, `turn.trigger_reason`) and clients must ignore unknown ones. The engine takes `guided: bool` (routes pass `features.guided_ui`).

### Turn metadata (`turn`, additive; all optional for old clients)
`turn.trigger_reason: null | "low_conf" | "uncovered" | "multi_clause" | "conflict"` — why the LLM was (or would have been) consulted this turn; `null` when rules sufficed or the turn was an action. `turn.coverage: {"signals":[{"kind":Signal,"status":"captured"|"uncovered"|"asked"}], "complete": bool}` where `Signal ∈ allergy|dish|stops|day_part|budget|budget_scope|duration|leg_time|party|area|time|vehicle`. `turn.llm_calls: int 0..1`; `turn.llm_budget: {"session_used","session_cap","daily_remaining_public": "ok"|"low"|"exhausted"}` (the exact daily counter is never exposed). `turn.understanding` keeps `"rules"|"llm"|"cache"|"action"`. These fields contain no user text and no secrets.

### Profile additions (`ChatState.profile`, additive)
`stops: F` (int 1..5, maps to `Preferences.max_stops`), `day_part: F` ("morning"|"noon"|"afternoon"|"evening"|"late", maps to `Preferences.meal` as a soft hint: evening→dinner, late→late). `start_time` is **never inferred** from a day part. `budget` keeps `scope` ("per_person"|"group"); when the user gives an amount for N≥2 people without saying which, `scope` stays `null` and a `clarify` with slot `budget_scope` is mandatory before `confirm_plan`.

### New block `understood`
`{ "items":[{"id":Signal,"label":string,"value":string|null,"status":"user"|"ai"|"inferred"|"missing","editable":bool}], "allergies":[{"term":string,"family":string|null,"status":"user"|"ai_unconfirmed"}], "style_note"?: string }` — the human-readable "Mình hiểu là…" card, emitted on every text turn that changed the profile. `status:"ai"` means filled by the LLM and shown for user correction. `style_note` records instructions about conversation style (e.g. "hỏi tôi nếu còn thiếu"); it never triggers an action.

### `clarify` additions (additive)
`slot?: string|null` (e.g. `allergy_term`, `allergy_confirm`, `budget_scope`, `start_time`, `plan_slots`, `propose`, `conflict`, `area`) and `free_text?: bool` (emitted on the guided path; typed answers are allowed). The former `chips` field is dropped: `options` (≤8 on the guided path) are the chips. At most **one** `clarify` per reply. `allergy_term` options are the common allergen families (đậu phộng, hải sản, sữa, trứng, gluten, đậu nành, mè, khác) — selecting one is `pick_option`.

### Rules
1. **Allergy signal ⇒ term or question.** If the text contains an allergy cue (dị ứng/không ăn được/kiêng + a substance, or the cue alone) the lexicon extractor runs on the **whole raw message**, independent of the winning intent and of deferred-clause trimming. A captured term is stored (`source:"user_said"`). A cue without a term ⇒ pending `clarify_slot` slot `allergy_term`; `confirm_plan`/`tour` are impossible while it is open. Quoted, hypothetical and sarcastic allergy mentions are still not recorded (v1.8 rules).
2. **Coverage audit.** Every signal detected in the raw text must end `captured` or `asked`; a signal left `uncovered` lowers rules confidence below `CONFIDENT` and sets `trigger_reason:"uncovered"`.
3. **LLM escalation** (≤1 call/turn, `retry=false`, same session cap 6 and daily reserve 3 as v1.8): called when rules `confidence<CONFIDENT`, or a signal is `uncovered`, or ≥3 signal-bearing clauses were detected with <50% captured, or slots conflict. Never for `action` turns, greetings, or fully-covered confident turns. Cache first. Refused/failed ⇒ rules result + the single most important `clarify`.
4. **Merge.** Allergies: union (LLM can add `ai_unconfirmed`, never remove a rule-captured term; an `ai_unconfirmed` allergy requires user confirmation before `confirm_plan`). Numbers/times/money: rule vs LLM disagreement ⇒ `clarify`, not a silent pick. `budget.scope`, `start_time` and `day_part`→time are never decided by the LLM when the text does not state them.
5. **Durations.** "N phút" with tour/lịch trình/ăn/đi chơi context ⇒ `duration_min` (total). "N phút giữa các quán / mỗi chặng / đi bộ không quá N" ⇒ `max_leg_min`. Ambiguous ⇒ `clarify`.
6. **Style directives** ("hỏi tôi nếu thiếu", "đừng lập tour vội") never act and never suppress capture of the other slots in the same message.
7. **Honesty/safety unchanged:** no venue is "safe" for allergies, planner only after explicit `confirm_yes`, no weather/verified-hours/per-person-price claims.
8. **One-shot tour request (guided).** When `guided` and the user asks for a tour ("tour/lịch trình/hành trình") the engine sets `chat.goal="tour"` (private) and asks, one per turn and in this order: unconfirmed LLM allergy → `budget_scope` (when budget known, scope null, party ≥ 2 or unknown) → area → `start_time` (chips by `day_part`) → vehicle → then, if the shortlist is empty, **proposes** up to `stops` venues (one per liked dish near the area, allergens excluded) as `venue_cards` plus `clarify` slot `propose` (`propose:use` | `propose:self`) → `confirm_summary` → explicit `confirm_yes` → planner over the shortlist (v1.8 rule unchanged). No tour exists before `confirm_yes`.

### v1.9.1 freeze (disposition of docs/reports/CODEX_U0_REVIEW.md; supersedes conflicting text above)
**Flag matrix.** `features.guided_ui` is reported true only when `chat_v2` is also on. (a) chat_v2 off: `/chat` 404, `/messages` unchanged. (b) chat_v2 on, guided_ui off: v1.8 engine behaviour and wire exactly as v1.8 including the top-level `llm_budget {limit,remaining,exhausted}`; no v1.9 field is added except additive profile keys (`stops`, `day_part`) which old clients ignore. (c) both on: the engine runs with `guided=true`; `turn.trigger_reason`, `turn.coverage`, `turn.llm_calls`, `turn.llm_budget` are present; the **top-level `llm_budget` is omitted** (the exact daily count is not exposed in guided mode); blocks `understood` and the guided `clarify` fields appear.
**Durable obligations (rule 1 strengthened).** The server keeps `chat.allergy_unresolved` (private, persisted) set when an allergy cue is heard without a substance; it is cleared only by a recorded substance or an explicit "không dị ứng". Together with (i) any `ai_unconfirmed` allergy and (ii) budget amount with `scope=null` and party ≥ 2, it is an *obligation* that blocks planning **regardless of which pending is open or was replaced**: the engine re-asks instead of presenting `confirm_summary` or honouring `confirm_yes`, and **the API must additionally refuse to execute any `plan_request` while an obligation is open** (defence in depth: no planner call, no new tour, `409 obligation_open` is NOT used — respond with the engine's clarify reply instead). Tests must cover: edit_profile → request_plan → confirm_yes with a seeded `allergy_term` pending; stale `confirm_plan`; reload of persisted state; party-size change after a budget.
**Ask order** when several obligations/slots are open (one `clarify` per reply): allergy_term → allergy_confirm → budget_scope → area → start_time → vehicle → propose → confirm.
**Wire shape.** On the guided path `profile.budget.scope` is serialised as an explicit `null` when unknown. `clarify.options` may carry up to **8** entries on the guided path (allergy chips); `pick_option` validates against the persisted `pending.options`; unknown/stale ids give the existing stale-option reply.
**day_part mapping.** morning→breakfast, noon→lunch, afternoon→snack, evening→dinner, late→late; applied to `Preferences.meal` only when the user/form has not set a meal; never changes an existing `start_time`.
**Metadata hygiene.** `trigger_reason ∈ {null, low_conf, uncovered, multi_clause, conflict}` (precedence: `conflict` when rules and LLM disagreed this turn, else `low_conf`, else `uncovered`, else `multi_clause`); `coverage.signals[].kind ∈ {allergy,dish,stops,day_part,budget,budget_scope,duration,leg_time,party,area,time,vehicle}`, `status ∈ {captured,uncovered,asked}`; the API allow-lists these and degrades to `null`/omitted on anything else; no free text ever. `llm_calls ∈ {0,1}`. `turn.llm_budget = {session_used:int≥0, session_cap:int≥0, daily_remaining_public: "ok"|"low"|"exhausted"|"unavailable"}` with `exhausted` iff daily_remaining ≤ reserve (the same condition that refuses a call), `low` iff ≤ reserve+2, `unavailable` when no provider is configured (session_used/session_cap = 0).
