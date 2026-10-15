# Phase 4 — Google Maps platform, Gemini quality, location, restaurant markers

Date: 2026-10-15. Human direction: restore the three-agent division; Google Maps (not a substitute map), real Gemini calls, current-location permission + Google-Maps-style manual location path, restaurant markers with an explicit show/hide toggle, real Google Routes output for map routes. The phase-3 "Claude alone" override is **revoked**; AGENTS.md / PROJECT_RULES.md ownership and cross-review rules apply again.

Unchanged: no invented evidence; private venue data never in Git; keys only in ignored local files or process env, never printed/committed; no account signup, billing activation, paid purchase, public deploy, push or history rewrite; do not disturb the human's running dev process; integration branch `foodtour-claude-coordinator`, `main` untouched. The human authorized real provider calls once valid credentials/config exist.

## Official-documentation facts this plan relies on (fetched 2026-10-15)
- **Routes API**: `POST https://routes.googleapis.com/directions/v2:computeRoutes` and `POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`; headers `X-Goog-Api-Key` and a mandatory `X-Goog-FieldMask` (wildcard discouraged); `travelMode: WALK`; intermediates ≤ 25; matrix ≤ 625 elements (origins × destinations); matrix elements carry `originIndex`, `destinationIndex`, `status`, `condition` (`ROUTE_EXISTS` / `ROUTE_NOT_FOUND`), `distanceMeters`, `duration`; route legs carry `polyline`; `polylineEncoding` is `ENCODED_POLYLINE` (default) or `GEO_JSON_LINESTRING`. **WALK is beta: "You must display this warning to the user for all walking … routes"** (response `routes[].warnings[]`). Include `status` in matrix field masks.
- **Maps JavaScript API**: load with the inline bootstrap loader / `google.maps.importLibrary()` (or `@googlemaps/js-api-loader` v2 `setOptions` + `importLibrary`); `key` required; Advanced Markers require a **Map ID** (`DEMO_MAP_ID` allowed for development); `PlaceAutocompleteElement` (web component, `gmp-select` event, `placePrediction.toPlace().fetchFields({fields:['displayName','formattedAddress','location']})`) requires **Places API (New)** enabled; session billing is automatic in the widget.
- **Places API (New)** `POST https://places.googleapis.com/v1/places:autocomplete` (server-side option), field mask required.
- **Geocoding API** `https://maps.googleapis.com/maps/api/geocode/json` (`address`, `components`, `bounds`, `region`, `language`, `key`; statuses `OK`, `ZERO_RESULTS`, `OVER_QUERY_LIMIT`, `REQUEST_DENIED`, …); v4 exists — implementer must re-read the current page before coding.
- **Key security**: browser keys → HTTP-referrer ("Websites") restriction + API restrictions; server keys → IP restriction (impractical for dynamic IPs) + API restrictions; use separate keys/projects for client and server.
- **Gemini**: `generateContent` + JSON schema; stable models listed on https://ai.google.dev/gemini-api/docs/models (verified earlier today: `gemini-3.5-flash-lite`, `gemini-3.8-flash`, `gemini-3.6-flash`).

## Keys and Google Cloud APIs (config-only; provided by the human later)
| Key (local ignored `backend/.env`) | Used by | APIs to enable on the project | Restrictions to apply |
|---|---|---|---|
| `GOOGLE_MAPS_BROWSER_KEY` + `GOOGLE_MAPS_MAP_ID` | Browser: map tiles, Advanced Markers, Place Autocomplete | **Maps JavaScript API**, **Places API (New)** | Application: Websites `http://localhost:3000/*`, `http://127.0.0.1:3000/*` (add production origin later); API restriction: those two APIs only |
| `GOOGLE_MAPS_SERVER_KEY` | Backend only: Routes (matrix + directions with geometry) and Geocoding fallback | **Routes API**, **Geocoding API** | API restriction: those two only; IP restriction to your egress IP if static; never sent to the browser |
| `GEMINI_API_KEY` | Backend only | Gemini API (AI Studio / Generative Language API) | Restrict to that API; separate from Maps keys |

The browser key is by nature visible to the browser; it is protected by referrer + API restrictions, not secrecy. It is delivered at runtime by `GET /v1/client-config`, never baked into the build or committed.

## Data sent to Google (must be shown to the user)
| Feature | Goes to Google | Notes |
|---|---|---|
| Map tiles / markers | Browser requests tiles; marker coordinates are drawn client-side | The app never uploads the venue list to Google |
| Place Autocomplete / manual address | Characters typed in the address box (+ session token) | Only after the user types there; manual lat/lon entry sends nothing |
| Current location | The app sends nothing to Google by itself. **The browser's own Geolocation implementation may contact its vendor's location service (browser-dependent); this is outside the app's control.** | The app asks only on an explicit click; the coordinates become the origin, are held in the session (TTL) and are then sent to the server and, when planning a route, to Routes API |
| Walking routes | Origin + candidate/stop coordinates (≤ 16 points per plan, ≤ 45 when replacing) via the **server** key | Venue coordinates come from the private dataset; user must accept this to enable Routes |
| Gemini | Chat text and prior preferences; explanation facts contain no venue identity | Unchanged from phase 3 |

## Work split (non-overlapping paths)
| Agent | Worktree / branch | Owns (paths) | Tasks |
|---|---|---|---|
| Claude | coordinator | `docs/`, `contracts/`, `backend/app/planner/`, `backend/app/llm/`, `qa/eval/`, `qa/live/`, integration | PH4-ARCH (this plan + contract v1.5), PH4-AI (Gemini origin_text, quality eval, route-warning semantics), PH4-INT |
| Codex | `foodtour-codex-backend` | `backend/app/providers/`, `backend/app/api/`, `backend/app/repositories/`, `backend/app/config.py`, `backend/app/main.py`, `backend/tests/{providers,api,repositories}`, `contracts/v1/openapi.json` (generated) | PH4-BE-1 Google Routes provider (matrix + geometry + warnings) behind existing walking-provider interface; PH4-BE-2 `GET /v1/client-config`, `GET /v1/venues/map`, `POST /v1/geocode` (server Google Geocoding), key redaction + limits + fake-server tests; PH4-BE-3 persistence of origin label/source, security review notes |
| Antigravity | `foodtour-antigravity-web` | `frontend/`, `qa/e2e/` frontend probes | PH4-FE-1 Google Maps JS map (Map ID, Advanced Markers), unavailable-state UX; PH4-FE-2 current-location permission + Autocomplete + manual lat/lon fallback; PH4-FE-3 restaurant markers + clustering + visible show/hide toggle; PH4-FE-4 route polylines + mandatory walking warning, accessibility/mobile/browser QA |

## Acceptance (observable)
1. With **no** Google keys: app runs; map area shows a labelled "Google Maps chưa được cấu hình" state with manual coordinates still working; no OSM tiles, no estimated line presented as a route.
2. With a browser key + Map ID: Google map renders; origin from (a) explicit "Dùng vị trí hiện tại" click → browser permission prompt, (b) Autocomplete selection, (c) manual lat/lon; denial/timeout/unavailable each show a message and keep (b)/(c).
3. Restaurant markers appear only when the toggle is ON, are removed when OFF, cluster at city zoom, and the toggle state is reachable by keyboard with `aria-pressed`.
4. With a server key: legs show `source=provider_route` with `route_provider=google_routes`, polylines come from Routes output, and the Google walking warning text is rendered; without it: legs stay `straight_line_estimate`, no route is drawn.
5. Fake-server tests prove: key never in responses/logs, field masks sent, matrix limits respected, errors map to labelled states; real-call smoke scripts exist and pass only when keys are present.
6. Each agent reports commit hash, test output and limitations; cross-review: Claude reviews Codex, Codex reviews Claude and Antigravity, Antigravity runs independent browser QA on the integrated build.
