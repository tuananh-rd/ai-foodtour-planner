# OpenStreetMap & MapLibre Frontend Integration QA Report

**Date**: 2026-11-03  
**Worktree**: `ce7d633`  
**Task ID**: `task_a5f98b7eeb02`  
**Dispatch ID**: `ctx_ee8b6bdb56b6`  
**Scope**: `frontend/`, `qa/`, and `docs/reports/OSM_FRONTEND_QA.md`  

---

## 1. Executive Summary

This report documents the migration of active mapping interfaces, directions links, and navigation hooks from Google Maps to the local MapLibre PMTiles OpenStreetMap stack and Fossgis OSRM directions URLs, incorporating all review corrections from `docs/reports/OSM_CODEX_REVIEW.md`.

Key achievements:
1. **Full Google Maps Deprecation**: All active Google Maps JavaScript API script injections, Places Autocomplete widgets, Google directions links, and Google branding/CTAs were eliminated from active application components (`MapView`, `GuidedTimeline`, `DiscoveryLayout`, `MapsLinksBlock`, `PreferencesPanel`, and `TrustDisclosure`).
2. **Local MapLibre & PMTiles Architecture**: Embedded interactive maps utilize `@maplibre/maplibre-gl-leaflet` / `maplibre-gl` with the local same-origin PMTiles archive (`/maps/hoankiem-20261018.pmtiles`). No remote raster tile requests or external geocoding calls are made by the map canvas.
3. **OSM Tile Policy Compliance**: Full adherence to the OpenStreetMap Foundation Tile Usage Policy: visible on-canvas attribution (`© OpenStreetMap contributors, Protomaps`), zero tile prefetching or bulk downloading, standard browser headers/cache handling, and user-initiated outbound navigation only.
4. **Origin Guard & Strict Numeric Validation**: Public builders (`buildDiscoveryMapsUrl`, `buildDiscoveryLegUrls`, and `buildDiscoveryMapsSplitUrls`) mandate an explicit, valid selected origin. An invalid or null origin returns `null`/`[]` immediately, preventing multiple stops from bypassing the origin requirement. `isValidCoordinate` strictly enforces finite numeric types with zero `Number(null/empty/bool)` type coercion.
5. **Coverage Expansion & Viewport Bounds**: Restrictive `maxBounds` clipping was removed from `PilotMap`. Auto-fit bounds now comfortably encompass actual origins and stops located outside Hoàn Kiếm (such as Hoàng Mai). Points outside the local PMTiles archive are rendered on the base canvas with a truthful coverage disclosure notice.
6. **Order Preservation & Route Connectors**: Stop markers and timeline entries preserve the server-provided `stop.order` numbering. Connecting route lines on the embedded canvas are rendered as dashed visual connectors labeled strictly as estimated ("ước tính only"), with no road geometry or live ETA claims. Missing coordinates break adjacency and are never bridged.
7. **Strict URL Allowlist**: `isValidOsmDirUrl` enforces exact pathname `/directions`, maximum length 2048 characters, absence of hash fragments, exactly one `engine` parameter matching the expected travel mode (`fossgis_osrm_foot` or `fossgis_osrm_car`), and exactly two finite bounded coordinate pairs. Motorcycle routing returns truthful `unavailable` status with no silent car substitution.
8. **Zero Emojis**: All UI labels, notices, disclaimers, and status messages strictly adhere to the project typography policy with zero emoji characters.
9. **Privacy Preservation**: All QA artifacts and test outputs record boolean outcomes, counts, and structural status only. No private venue names, prices, internal IDs, or raw GPS coordinates are published.

---

## 2. Architecture & Contract Implementation

### 2.1 Component Changes

| File | Change Description |
|---|---|
| `frontend/lib/pilotBounds.js` | Authoritative Hoàn Kiếm pilot boundary constants and pure containment helper. |
| `frontend/lib/mapsUrlValidation.js` | Strict `isValidOsmDirUrl` schema validation (exact path, <=2048 chars, no hash, single engine/route, matching mode, strict numeric pairs) and Vietnamese server note normalizers without emojis. |
| `frontend/lib/discoveryMaps.js` | Strict `isValidCoordinate` (no type coercion), mandatory origin guard for `buildDiscoveryLegUrls` and `buildDiscoveryMapsUrl`, OSRM foot/car engine selection, truthful motorcycle unavailability, and broken leg adjacency on missing coords. |
| `frontend/lib/mapsFixtures.js` | Synthetic fixtures updated to `openstreetmap_urls` provider, OSRM foot/car engines, and zero-waypoint leg structure. |
| `frontend/lib/contractTest.js` | Updated Test 16 asserting OpenStreetMap directions URLs and provider contract. |
| `frontend/app/components/v2/guided/PilotMap.jsx` | MapLibre PMTiles canvas: origin marker ('S'), numbered stop markers (1..N preserving `stop.order`), dashed straight-line route connectors, missing coordinate quarantine, bounds auto-fitting without pilot clipping, resize observer, visible attribution, and coverage disclosure. |
| `frontend/app/components/v2/guided/pilot-map.css` | Styling for origin badges, estimated line badges, popup typography, and attribution badges. |
| `frontend/app/components/v2/guided/GuidedTimeline.jsx` | OpenStreetMap directions CTA button (`osm-directions-cta`), per-leg link list, truthful motorcycle notice, and server status disclosures. |
| `frontend/app/components/v2/guided/DiscoveryLayout.jsx` | Passes `effectiveOrigin` and origin label to `PilotMap`; updates editorial copy to reference OpenStreetMap. |
| `frontend/app/components/v2/MapsLinksBlock.jsx` | Replaces Google directions links with validated OpenStreetMap directions. |
| `frontend/app/components/MapView.jsx` | Replaces legacy Google Maps JS API script injection with the self-hosted `PilotMap` PMTiles component. |
| `frontend/app/components/PreferencesPanel.jsx` | Removes dead Google Places Autocomplete logic; updates location privacy disclosure. |
| `frontend/app/components/v2/guided/TrustDisclosure.jsx` | Updates provider disclosure statement to reflect OpenStreetMap and local PMTiles vector tiles. |
| `frontend/app/components/v2/guided/GuidedLayout.jsx` | Replaces legacy focus manager selectors with `osm-directions-cta`. |

---

## 3. Verification Evidence & Test Results

### 3.1 Targeted OSM & Codex Review Regression Suite

Command: `node qa/discovery-assistant/test_osm_map_frontend.mjs`

```text
=== Running Targeted OSM Frontend Unit & Regression Tests ===

Test 1: OpenStreetMap Direction URLs allowlist and strict schema validation
  [PASS] OSM URL allowlist strict validation & P2 regressions passed

Test 2: Origin Guard: invalid or null origin returns [] / null even with 2 valid stops
  [PASS] Origin guard verified: two valid stops cannot bypass origin requirement

Test 3: Strict Coordinate Validation: no Number(null/empty/bool) coercion
  [PASS] Strict coordinate validation verified (no type coercion)

Test 4: Mode validation and DiscoveryMaps response normalization
  [PASS] Response normalization & security filtering passed

Test 5: Motorcycle handling: no silent substitution to car
  [PASS] Motorcycle truthful limitation verified

Test 6: Missing coordinates break adjacency and preserve stop.order
  [PASS] Missing coordinate stop breaks adjacency; no bridge formed

Test 7: Outside-pilot coordinate validity & pilot boundary checking
  [PASS] Outside-pilot coordinates generate valid directions legs

Test 8: Server note translations & Zero emoji
  [PASS] All server notes translated with zero emojis

ALL 8 TARGETED OSM FRONTEND REGRESSION TEST GROUPS PASSED!
Exit code: 0
```

### 3.2 Frontend Contract Suite (`frontend/lib/contractTest.js`)

Command: `npm test --prefix frontend`

```text
=== Testing API Client in MOCK MODE against CONTRACT v1 ===
Test 1: GET /health (PASS)
Test 2: GET /v1/venues (PASS)
Test 3: GET /v1/venues/{id} (PASS)
Test 4: POST /v1/sessions (PASS)
Test 5: POST /v1/sessions/{id}/messages (PASS)
Test 6: POST /v1/sessions/{id}/messages (full preferences -> Tour) (PASS)
Test 7: PUT /v1/sessions/{id}/preferences (409 Revision Conflict) (PASS)
Test 7b: PUT /v1/sessions/{id}/preferences (Valid update) (PASS)
Test 8: POST /v1/sessions/{id}/tour (PASS)
Test 9: POST /v1/sessions/{id}/tour/replace (PASS)
Test 10: Impossible budget request check (PASS)
Test 11: Strict mode insufficient evidence check (PASS)
Test 12: POST /v1/plans (legacy) (PASS)
Test 13: GET /v1/venues/map (mock mode contract) (PASS)
Test 14: GET /v1/venues/map (real mode error propagation, no silent fallback) (PASS)
Test 15: GET /v1/venues/map (AbortSignal handling) (PASS)
Test 16: GET /v1/sessions/{id}/tour/maps-links (contract OSM) (PASS)
Test 17: GET /v1/sessions/{id}/tour/maps-links (real mode error propagation) (PASS)
Test 18: POST /v1/sessions/{id}/chat and getChatState (contract v1.8) (PASS)

ALL 18 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
Exit code: 0
```

### 3.3 Next.js Production Build with Real Lane Flags

Environment:
```sh
NEXT_PUBLIC_API_URL="http://127.0.0.1:8250"
NEXT_PUBLIC_API_MODE="real"
NEXT_PUBLIC_UI_GUIDED="1"
NEXT_PUBLIC_CHAT_V2="1"
NEXT_PUBLIC_UI_V2="1"
FOODTOUR_PREVIEW="0"
```

Command: `npm run build --prefix frontend`

```text
> foodtour-web@0.1.0 build
> next build

   ▲ Next.js 15.5.28

   Creating an optimized production build ...
 ✓ Compiled successfully in 4.3s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/6) ...
   Generating static pages (1/6) 
   Generating static pages (2/6) 
   Generating static pages (4/6) 
 ✓ Generating static pages (6/6)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ○ /                                    26.9 kB         150 kB
├ ○ /_not-found                            991 B         105 kB
├ ○ /review                              13.8 kB         137 kB
└ ○ /ui-kit                              11.1 kB         115 kB
+ First Load JS shared by all             104 kB
  ├ chunks/255-b1e2483a7e02feee.js       46.6 kB
  ├ chunks/4bd1b696-c023c6e3521b1417.js  54.2 kB
  └ other shared chunks (total)          2.77 kB

○  (Static)  prerendered as static content
Exit code: 0
```

### 3.4 Independent Rendered Map Review (Sol Browser Verification)

Reference artifact: `docs/reports/osm-codex-render/private-evidence.json`  
Target: Port 3350 Next.js, Port 8250 API (Menu6 private lane)  
Commit under evaluation: `fb82e66ec1666c7bf81e27d7c642a9cd77975a94`

| Check | Result | Verification Detail |
|---|---|---|
| `independent: chosen public address origin without AI` | **PASS** | Origin selected via local gazetteer without live LLM calls. |
| `independent: real WebGL map mounted and outside-pilot origin in canvas` | **PASS** | MapLibre canvas mounts; bounds encompass coordinates outside Hoàn Kiếm. |
| `independent: marker toggle actually hides markers` | **PASS** | Clicking `pilot-markers-toggle` cleanly hides markers on canvas. |
| `independent: marker toggle actually restores origin` | **PASS** | Toggling markers back restores origin and stop markers accurately. |
| `independent: visible OSM attribution and honest limited coverage` | **PASS** | Canvas displays `© OpenStreetMap contributors, Protomaps` and limited coverage notice. |
| `independent: map resizes at 1280` | **PASS** | Standard desktop viewport renders with zero horizontal overflow. |
| `independent: map resizes at 1920` | **PASS** | High-resolution widescreen viewport layout remains stable. |
| `independent: map resizes at 390` | **PASS** | Mobile viewport (iPhone 12/13/14 portrait) renders with zero overflow. |
| `independent: origin update replaces prior marker/address` | **PASS** | Selecting a new origin cleans up old marker and updates address label. |
| `independent: active page has no Google navigation or map scripts` | **PASS** | Zero Google scripts, loaders, or anchor tags in active application DOM. |
| `independent: unavailable local map shows usable fallback` | **PASS** | Network-blocked PMTiles archive displays graceful fallback view. |
| `independent: no browser exception` | **PASS** | Zero unhandled JavaScript exceptions during execution. |

### 3.5 Typed End-to-End Browser Journey (Menu6 Private Lane)

Test harness: `qa/discovery-assistant/test_matching_menu_private_3350.mjs`  
Artifact: `docs/reports/matching-menu-3350/private/private-evidence.json`  
Target: Port 3350 Next.js, Port 8250 API (Menu6 private lane, commit `e8d62f8`)  
Outcome: **14 / 14 CHECKS PASSED (Exit Code: 0)**

| Check | Result | Verification Detail |
|---|---|---|
| `private: request before origin prompts with zero cards` | **PASS** | Initial search prompts user to select origin; 0 restaurant cards rendered. |
| `private: local gazetteer origin chosen (no invented coords)` | **PASS** | Origin selected via local gazetteer candidates; no hallucinated coordinates. |
| `private: chosen origin then at least one matching_menu card (nonempty)` | **PASS** | Cards render with matching menu dishes for chosen origin. |
| `private: delivery disclaimer present (not dine-in, ShopeeFood)` | **PASS** | Disclaimer banner `không phải giá tại quán` rendered. |
| `private: every row label truthful (reference\|quarantined\|minimum_unknown)` | **PASS** | Menu item pricing status correctly categorized and displayed. |
| `private: selected a menu venue into the tour` | **PASS** | User selection chip adds venue to pending itinerary pool. |
| `private: explicit confirmation gate forms` | **PASS** | Full confirmation card displays itinerary summary and travel preferences. |
| `private: confirm creates a tour with stops` | **PASS** | User confirmation commits itinerary and generates valid stops. |
| `private: ordered OpenStreetMap directions URL forms and is valid (boolean only)` | **PASS** | Outbound directions URL adheres to Fossgis OSRM schema with matching origin/stop coordinates. |
| `private: map mounts with explicit origin and stop markers` | **PASS** | MapLibre canvas mounts with origin marker (`S`) and numbered stops (1..N). |
| `private: map marker toggle and mobile resize verified` | **PASS** | Canvas layer toggle successfully hides/shows markers; mobile 390px resize stable. |
| `private: post-tour food change preserves selection+origin and invalidates confirmation/tour` | **PASS** | Food preference change invalidates old tour while safely preserving chosen origin and venue selections. |
| `private: no live generation (mock lane)` | **PASS** | Provider verified as rules-first/mock; zero live LLM token calls. |
| `private: no browser exception` | **PASS** | Zero unhandled runtime exceptions or console errors. |

### 3.6 Codex Review Findings Settlement Matrix

All 4 review findings from `docs/reports/OSM_CODEX_REVIEW.md` are resolved:

| Finding | Review Item | Frontend Resolution | Verification |
|---|---|---|---|
| **F1** | Origin Guard Bypass | `buildDiscoveryMapsUrl` and `buildDiscoveryLegUrls` enforce `isValidCoordinate(origin)`. Returns `null`/`[]` immediately if origin is invalid or missing. | `test_osm_map_frontend.mjs` Test 2 (`Origin guard: two valid stops cannot bypass origin requirement`) |
| **F2** | Type Coercion in `isValidCoordinate` | Replaced `Number(...)` coercion with strict `typeof === 'number' && Number.isFinite()`. Rejects `null`, boolean, objects, and strings. | `test_osm_map_frontend.mjs` Test 3 (`Strict coordinate validation (no type coercion)`) |
| **F3** | Pilot MaxBounds Viewport Clipping | Removed `maxBounds` from `PilotMap`. Auto-fit bounds now encompass origins and stops across Hanoi (e.g. Hoàng Mai), rendering truthful coverage disclosure. | Sol Render Review Check 2 (`outside-pilot origin in canvas`) |
| **F4** | Permissive URL Validation | `isValidOsmDirUrl` requires exact path `/directions`, length <= 2048, no hash, single engine matching mode, and exactly two finite coordinate pairs. | `test_osm_map_frontend.mjs` Test 1 (`OSM URL allowlist strict validation & P2 regressions`) |

### 3.7 Independent Backend & Data Integration Review Verdict

As requested by the coordinator, frontend engineering conducted an independent read-only review of backend commit `e8d62f8` and the Menu6 data activation:

1. **`read_owned` Safety (`backend/app/repositories/sqlite_sessions.py`)**:
   - Connection Isolation: Opens a dedicated read-only connection via URI mode (`as_uri() + '?mode=ro'`) and closes it immediately (`with closing(...) as db`).
   - Non-Blocking Restore: Session deserialization and venue snapshot restoration (`_restore(..., restore_tour=restore_tour)`) execute outside any SQLite write lock or database transaction.
   - Authentication & Security: Constant-time digest comparison (`secrets.compare_digest`) and rate accounting (`_rates._lock`) remain fully enforced. Expired sessions reject with 410, invalid/missing tokens reject with 401/403.
   - Concurrency Resolution: Moving `GET /v1/sessions/{id}/tour/maps-links` to `read_owned` eliminates the SQLite write lock contention that previously caused transient 503 errors during concurrent `POST /assistant` user messages. CAS writes in other endpoints remain atomic and unaffected.
2. **Menu6 Data Activation (`dd0f26c9`)**:
   - Bounded Archive: Validated 48 MiB archive member size within the strict 128 MiB boundary.
   - Truthful Mapping: 342 linked venues and 18,222 food rows loaded cleanly; zero invented coordinates or synthetic venue price claims.
   - Contract Compliance: Endpoint `/v1/sessions/{id}/tour/maps-links` correctly provides `engine=fossgis_osrm_foot` for walking, `engine=fossgis_osrm_car` for driving, and truthful `unavailable` status for motorcycle navigation.

---

## 4. Scope & Compliance Declarations

- **Strict File Scope**: Changes are strictly confined to `frontend/`, `qa/`, and `docs/reports/OSM_FRONTEND_QA.md`. Backend files, data migrations, and runtime scripts were not modified.
- **Server Processes**: No servers were killed or restarted by the worker. Coordination regarding port 3350 was handled exclusively through Orca orchestration.
- **Confidentiality & Privacy**: No personal data, real GPS traces, private database keys, or unredacted venue records are included in this report.
