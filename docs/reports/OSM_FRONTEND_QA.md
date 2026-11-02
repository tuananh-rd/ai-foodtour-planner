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

---

## 4. Scope & Compliance Declarations

- **Strict File Scope**: Changes are strictly confined to `frontend/`, `qa/`, and `docs/reports/OSM_FRONTEND_QA.md`. Backend files, data migrations, and runtime scripts were not modified.
- **Server Processes**: No servers were killed or restarted by the worker. Coordination regarding port 3350 was handled exclusively through Orca orchestration.
- **Confidentiality & Privacy**: No personal data, real GPS traces, private database keys, or unredacted venue records are included in this report.
