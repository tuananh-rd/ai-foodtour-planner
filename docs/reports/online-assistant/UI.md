# Online Assistant UI Extension Implementation & Review Report

- **Date:** 2026-10-19
- **Implementer:** Antigravity (dispatched frontend worker)
- **Coordinator / Integrator:** Codex (`term_24c3a210-7070-4dd5-b703-f12f516a70b0`)
- **Authority & Specification:** `docs/design/ONLINE_ASSISTANT_UI_SCOPE.md`, `contracts/v1/openapi.json`, `docs/design/SVG_FIDELITY_SPEC.md`
- **Task ID:** `task_ff3a8db281f6`
- **Dispatch ID:** `ctx_c59210e209bb`

---

## 1. Executive Summary

Antigravity implemented and verified the approved UI extension for the Conversational Assistant and self-hosted local map per `docs/design/ONLINE_ASSISTANT_UI_SCOPE.md` without modifying SVG geometry tokens or existing allergy/confirmation safety gates.
The implementation introduces a one-turn "Tra web" opt-in with Tavily BASIC retrieval, honest non-fabricated mock statuses, and safe HTTPS citations, alongside an interactive local PMTiles vector basemap of Hoàn Kiếm rendered client-only with exact MapLibre 6.15.0 and PMTiles 4.5.0 inside the existing route panel under a "Sơ đồ" / "Bản đồ" toggle.
All contract invariant test suites, mock verification tests, bounds checkers, and Next.js production builds pass cleanly with zero external map network requests.

---

## 2. Read-Only Affected-Agent Review of Codex Commits

Per the current implementation authority (2026-10-19) and dispatch instructions, Antigravity conducted a read-only technical review of Codex's recent backend and conversation commits:

### 2.1. Commit `4411b8f`: `feat(assistant): wire read-only conversation and explicit search contracts`
- **Scope & Changes:**
  - Wires read-only conversational assistant contracts in `contracts/v1/openapi.json` and `backend/app/api/schemas.py`.
  - Defines `ChatTurnRequest` with `web_search: Optional[bool]` and `WebSearchBlock` schema with strict statuses: `ok`, `disabled`, `quota`, `unavailable`, `rejected`.
  - Integrates bounded `search_transport.py` for Tavily BASIC queries with context minimization: transmits only the short user query of the current turn without GPS coordinates or conversation history.
  - Implements integration tests in `backend/tests/api/test_conversation_integration.py` and `backend/tests/providers/test_search_transport.py`.
- **Review Assessment:**
  - **Contract Invariance:** Strict alignment with OpenAPI v1 contract specifications. No breaking changes to existing endpoints (`/v1/sessions`, `/v1/sessions/{id}/chat`, `/v1/sessions/{id}/tour`).
  - **Security & Privacy:** Query isolation is verified. No sensitive user history, tokens, or GPS coordinates are forwarded to external search transport.
  - **Verdict:** **APPROVED**.

### 2.2. Commit `e0d3213`: `fix(chat): preserve legacy replies and bound repeated allergy parsing`
- **Scope & Changes:**
  - Preserves legacy reply structures for backward compatibility across previous test harnesses.
  - Bounded repeated allergy parsing in `backend/app/llm/safety_parse.py` by caching whole-clause evaluations per request, avoiding redundant parser executions for identical clause tokens.
  - Refines `search_transport.py` error handling and prevents malformed query leaks.
- **Review Assessment:**
  - **Safety Boundaries & Finite Limits:** Applies finite clause-level memoization for repeated allergy terms during a single request turn. While this bounds repeated executions for identical tokens in targeted suites, it represents a finite engineering guard rather than an absolute guarantee eliminating all hypothetical LLM invocations.
  - **Backward Compatibility:** Guarantees that existing guided clients and legacy test suites continue functioning without regressions.
  - **Verdict:** **APPROVED**.

### 2.3. Commit `2389908`: `fix(assistant): finish reviewed conversation checkpoint with grounded numbers`
- **Scope & Changes:**
  - Updates `backend/app/assistant/conversation.py` and `backend/tests/assistant/test_conversation.py`.
  - Enforces that numbers in conversational assistant responses align with authoritative structured state (`safe_state.profile`) across targeted test cases.
  - Formally documents the reviewed checkpoint in `docs/reports/ONLINE_ASSISTANT_BOARD.md`.
- **Review Assessment:**
  - **Targeted Grounding & Finite Bounds:** Implements finite regex and state-replacement boundaries to ground candidate counts and budgets to authoritative session state in targeted conversation tests. While highly effective across tested patterns, deterministic confirmation and server-side hard constraint checkers remain the sole authoritative safety gates.
  - **Verdict:** **APPROVED**.

---

## 3. UI Component Implementation & Verification

### 3.1. Dependency Upgrades (`frontend/package.json`)
- Installed exact `maplibre-gl@6.15.0` and `pmtiles@4.5.0` as authorized by the specification.
- Verified that MapLibre 6 named ESM exports (`Map`, `addProtocol`, `Marker`, `Popup`) load cleanly without WebGL / SSR crashes.
- Verified that PMTiles 4 `Protocol` instance registers correctly via `maplibre.addProtocol('pmtiles', protocol.tile)`.

### 3.2. Versioned PMTiles Asset & Scoped Cache Header (`frontend/next.config.mjs`)
- Authorized scoped extension in `frontend/next.config.mjs`:
  ```javascript
  headers: async () => [
    {
      source: '/maps/hoankiem-20261018.pmtiles',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable'
        }
      ]
    }
  ]
  ```
- Local asset: `frontend/public/maps/hoankiem-20261018.pmtiles` (2,138,597 bytes, SHA256 `5e5cdc69f227a8c843a0a328b7358990e872a05f75842c6a7e5e730ca37e4609`).
- Provenance documentation preserved in `frontend/public/maps/README.md`.

### 3.3. Web Search Opt-in & Citations (`OnlineSearchResults.jsx` & `GuidedLayout.jsx`)
- **Opt-in Control:** Compact, initially unchecked checkbox `"Tra web"` situated cleanly above the composer.
- **One-Turn Behavior:** The opt-in applies strictly to the next text query. Upon submission, `webSearch` resets to `false`. On send failure, the draft text and opt-in state are preserved for deliberate user retry.
- **Action Turns:** Action turns (`confirm_yes`, `confirm_no`, `select_option`) omit `web_search`.
- **Display Component (`OnlineSearchResults.jsx`):**
  - Displays status badges for all OpenAPI states: `ok`, `disabled`, `quota`, `unavailable`, `rejected`.
  - In `ok` status: Renders at most 3 source citations with escaped title, snippet, and public HTTPS link (`target="_blank"`, `rel="noopener noreferrer"`).
  - Mandatory disclaimer: *"Nguồn web chưa được xác minh; không xác nhận quán đang mở hoặc an toàn dị ứng."*
  - Escaped text rendering: never uses `dangerouslySetInnerHTML`.
  - Non-HTTPS or localhost links are sanitized out of clickable anchor elements.
- **Mock Mode Honesty:** In mock/preview mode, `chatTurn` returns honest `{ status: 'unavailable', sources: [], fetched_at: null, credits: 0, cached: false }` without fabricating fake citations.

### 3.4. Local Interactive Pilot Map (`PilotMap.jsx`)
- **Route Panel Integration:** Placed inside `<aside className="nn-route">` replacing `.nn-canvas` when the `"Bản đồ"` view mode is selected. Preserves panel height (615px desktop), token styles, and the tip box below.
- **View Mode Toggle:** Accessible radio/group buttons `"Sơ đồ"` (default) and `"Bản đồ"`.
- **Pilot Boundaries:** Hoàn Kiếm bounding box (`west: 105.835, south: 21.018, east: 105.866, north: 21.046`). Viewport is restricted to pilot bounds.
- **Out-of-Coverage Reporting:** Venues outside the bounding box are not clamped; the component displays a clear notification banner (e.g., *"1 quán nằm ngoài phạm vi bản đồ thử nghiệm Hoàn Kiếm"*).
- **Marker Synchronization:** Numbered circular markers match the tour order. Synchronizes automatically on replace, reset, or reload.
- **Safe Popups:** DOM elements created with `document.createElement` and `textContent`. Real directions open via existing free Google Maps URLs.
- **Cooperative Gestures:** `cooperativeGestures: true` prevents page scroll hijacking on both desktop wheel and mobile touch.
- **Attribution:** Clearly attributes `© OpenStreetMap contributors` and `Protomaps`, noting map freshness (`2026-10-18`) distinctly from venue verification.

### 3.5. Disclosures Update (`TrustDisclosure.jsx`)
- Updated modal copy with calm product voice:
  - Discloses context minimization (only the last 4 turns and necessary criteria are sent; GPS and identity are not sent).
  - Discloses that `"Tra web"` sends only the short query of that turn to Tavily Search.
  - Discloses third-party free-tier privacy policies (advising users not to enter personal or sensitive secrets).

---

## 4. Verification Evidence & Test Results

### 4.1. Contract Invariant Tests (`npm test`)
```
> foodtour-web@0.1.0 test
> node lib/contractTest.js

=== Testing API Client in MOCK MODE against CONTRACT v1 ===
Test 1: GET /health - PASSED
Test 2: GET /v1/venues - PASSED
Test 3: GET /v1/venues/{id} - PASSED
Test 4: POST /v1/sessions - PASSED
Test 5: POST /v1/sessions/{id}/messages (missing slot) - PASSED
Test 6: POST /v1/sessions/{id}/messages (full preferences -> Tour) - PASSED
Test 7: PUT /v1/sessions/{id}/preferences (409 Revision Conflict) - PASSED
Test 7b: PUT /v1/sessions/{id}/preferences (Valid update) - PASSED
Test 8: POST /v1/sessions/{id}/tour - PASSED
Test 9: POST /v1/sessions/{id}/tour/replace - PASSED
Test 10: Impossible budget request check - PASSED
Test 11: Strict mode insufficient evidence check - PASSED
Test 12: POST /v1/plans (legacy) - PASSED
Test 13: GET /v1/venues/map (mock mode contract) - PASSED
Test 14: GET /v1/venues/map (real mode error propagation) - PASSED
Test 15: GET /v1/venues/map (AbortSignal handling) - PASSED
Test 16: GET /v1/sessions/{id}/tour/maps-links (contract v1.7) - PASSED
Test 17: GET /v1/sessions/{id}/tour/maps-links (real mode error propagation) - PASSED
Test 18: POST /v1/sessions/{id}/chat and getChatState (contract v1.8) - PASSED

🎉 ALL 18 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
```

### 4.2. Web Search UI QA Tests (`qa/online-assistant/test_web_search_ui.mjs`)
- **Test 1:** Mock mode `web_search` returns honest status `unavailable` with empty sources, credits 0, fetched_at null, and preserves originating query. (PASSED)
- **Test 2:** Action turns omit `web_search` blocks. (PASSED)
- **Test 3:** Mock `web_search` short-circuit state mutation check (ensures slots/tour are untouched). (PASSED)
- **Test 4:** `OnlineSearchResults` enforces mandatory disclaimer, all 5 OpenAPI statuses, safe HTTPS validation, and text escaping. (PASSED)
- **Test 5:** `TrustDisclosure` contains minimized context and free-tier third-party privacy notices. (PASSED)
- **Test 6:** `GuidedLayout` integration of opt-in checkbox, view mode toggle, and stable testids. (PASSED)

### 4.3. Pilot Map Contract Tests (`qa/online-assistant/test_pilot_map_contracts.mjs`)
- **Test 1:** Dependencies exact versions in `frontend/package.json` (`maplibre-gl@6.15.0`, `pmtiles@4.5.0`). (PASSED)
- **Test 2:** MapLibre 6 named exports (`Map`, `addProtocol`, `Marker`, `Popup`) and PMTiles 4 `Protocol` initialization. (PASSED)
- **Test 3:** Scoped immutable cache-control header in `frontend/next.config.mjs`. (PASSED)
- **Test 4:** PMTiles asset provenance, size (2,138,597 bytes), and README verification. (PASSED)
- **Test 5:** `PilotMap` component contracts: same-origin asset loading, DOM popups (zero `innerHTML`), cooperative gestures, visible OSM/Protomaps attribution, exact maxBounds, 8000ms timeout fallback, and review gates. (PASSED)

### 4.4. Next.js Production Build
```
   ▲ Next.js 15.5.28
   Creating an optimized production build ...
 ✓ Compiled successfully in 23.2s
   Linting and checking validity of types ...
   Collecting page data ...
 ✓ Generating static pages (6/6)
   Finalizing page optimization ...
   Collecting build traces ...
Route (app)                                 Size  First Load JS
┌ ○ /                                    27.2 kB         148 kB
├ ○ /_not-found                            992 B         105 kB
├ ○ /review                              13.4 kB         134 kB
└ ○ /ui-kit                              10.5 kB         114 kB
+ First Load JS shared by all             104 kB
```

---

## 5. Visual Evidence Artifacts

Visual evidence screenshots captured under isolated test environment (Ports 3070 / 8070 / 19760, zero remote tile calls):

| Filename | Viewport | Description |
| :--- | :--- | :--- |
| `01_desktop_start_with_web_optin.png` | 1440×1024 | Initial start screen with "Tra web" checkbox unchecked above composer |
| `02_desktop_web_optin_checked_explanation.png` | 1440×1024 | "Tra web" checked showing privacy & context minimization explanation |
| `03_desktop_honest_web_search_unavailable.png` | 1440×1024 | Honest unavailable status & safety disclaimer rendered in mock mode |
| `04_desktop_interactive_map_view.png` | 1440×1024 | Interactive Hoàn Kiếm MapLibre/PMTiles basemap with rendered roads, water, earth, and markers |
| `05_desktop_trust_disclosure_modal.png` | 1440×1024 | Trust disclosure modal showing updated AI, web search, and privacy copy |
| `06_mobile_390_chat_and_optin.png` | 390×844 | Mobile responsive chat view with compact "Tra web" control |
| `07_mobile_390_map_view.png` | 390×844 | Mobile responsive tour tab page-top itinerary view in "Bản đồ" mode (the interactive map canvas sits below the viewport fold and is not directly visible in this page-top capture) |

> [!NOTE]
> **Mobile Screenshot Evidence Limitation:** As confirmed by coordinator inspection, `07_mobile_390_map_view.png` captures the page-top itinerary header on the 390×844 mobile viewport where the interactive map canvas is positioned below the viewport fold. This screenshot documents tab/mode activation and layout continuity, but does not visually prove mobile canvas rendering.

> [!NOTE]
> **Candidate Image Remediation:** In early candidate testing (`d9c2971`), MapLibre 6 failed to resolve the bundled web worker under Next.js webpack mode, resulting in an unhandled worker load error and blank canvas. This has been fully resolved via upstream bundler worker URL configuration and versioned same-origin asset `/maps/maplibre-gl-worker-6.15.0.mjs` (518,806 bytes, 3-Clause BSD). Fresh evidence confirms real geographic vector tiles (`Range: 487845-605035/2138597`) and non-blank canvas rendering.

---

## 6. Constraints & Safety Adherence Verification

1. **No Layout-Wide Redesign:** The accepted SVG geometry, header, left/right panels, token variables, and cards in `SVG_FIDELITY_SPEC.md` remain strictly intact.
2. **Deterministic Safety Gates:** Allergy detection, confirmation gates, stop locks, and revision checks are fully preserved and independently tested.
3. **Zero Remote Map Dependencies:** MapLibre vector style uses only local layers from same-origin `/maps/hoankiem-20261018.pmtiles`. Zero calls to remote tile or style servers (`remoteOrigins: []`).
4. **No Paid Services or Secrets:** No paid API activations, external geocoders, or secret keys in source or reports.
5. **Clean Server Isolation:** Coordinator servers on ports 3060/8060 were preserved untouched during test execution. All testing executed on isolated ports 3070/8070.

---

## 7. Coordinator Review Remediation & Review Gate Status

The review items from coordinator reviews have been audited and implemented across targeted code and contract tests. However, review gates are not claimed as fully settled across all possible real-world operational scopes; specific boundaries between verified technical evidence and open operational items are detailed below:

1. **Test Harness Deduplication (`msg_a8f9d964e263`):** Removed duplicate helper in `qa/online-assistant/test_pilot_map_contracts.mjs`.
2. **Review Gate & Protocol Verification (`msg_bf32e15b19ef`):** Added explicit contract assertions verifying MapLibre 6 named exports and PMTiles 4 Protocol initialization without side-effects.
3. **Map Lifecycle & Bounded Timeout (`msg_faf7d262813c`, `msg_edbb8aee33c9`):** Added bounded 8000ms load timeout in `PilotMap.jsx`, controlled fallback UI, and full `cleanupMap` destroying both MapLibre instance and active markers on error, unmount, and generation changes.
4. **Mock Mode State Short-Circuit & Contract Invariants (`msg_9b93380962c7`):** In `frontend/lib/api.js`, queries with `body.text && body.web_search` increment `session.revision` by 1 and return honest unavailable block with 100% UNCHANGED preferences, profile slots, shortlist, and tour. Subsequent requests with stale revision fail with HTTP 409 `revision_conflict`. Requests combining `action` with `web_search: true` reject immediately with HTTP 422 `validation_error` before modifying state.
5. **Stable TestIDs (`msg_2080f40e03ee`):** Added stable selector attributes:
   - `data-testid="pilot-map-canvas"`
   - `data-testid="pilot-markers-toggle"`
   - `data-testid="pilot-map-fallback"`
   - `data-testid="online-search-results"`
   - `data-testid="web-search-card"`
   - `data-testid="online-search-toggle"`
   - `data-testid="pilot-map-toggle"` (placed directly on native `<button>` element)
6. **Exact Pilot MaxBounds (`msg_1b00b24b7fe4`):** Strictly restricted `maxBounds` in `PilotMap.jsx` to Hoàn Kiếm pilot bounds `[[105.835, 21.018], [105.866, 21.046]]` with no expanded offset.
7. **Marker Performance & Keyboard Accessibility (`msg_edbb8aee33c9`, `msg_39645df36c4c`):** Implemented synchronous initial marker rendering on map creation, eliminating the map-ready marker initialization race condition. Used native `<button>` marker elements with `tabindex="0"`, Enter/Space activation, and safe popup focus management. Zero `innerHTML` used.
8. **Strict Search Safety & Citation Metadata (`msg_a5159ea4ba02`):** Aligned `isSafeHttpsUrl` in `OnlineSearchResults.jsx` with backend `search_safety.py` (rejecting user/password in URLs, non-443 ports, IPv6, private IPv4, carrier-grade NAT 100.64/10, ambiguous numeric/octal, localhost, and `.local`/`.internal` domains). Formatted timestamp with both date and time in `vi-VN` locale. Rendered cached badge strictly on `status === 'ok' && cached`.
9. **HTTP 200 Search Error Retry (`msg_f85f4fb4e860`, `msg_92055f58d7bc`):** Stored originating `query` directly on `web_search` block and assistant message. Added inline retry button calling `onRetry(block.query)` to replay search with `webSearch: true` using immutable originating query without falling back to unrelated drafts or transport errors.
10. **MapLibre 6 Web Worker Bundling & Provenance (`msg_bf938d69f59e`, `msg_e3dafa936cac`):** Configured upstream worker URL pattern with versioned local asset fallback `/maps/maplibre-gl-worker-6.15.0.mjs` (518,806 bytes, exact SHA256 `1c69066368331aae63967ed24a9affcf962cf55fcc6d8f532a8b040f736dbcfa`) with full 3-Clause BSD license text documented in `frontend/public/maps/README.md`.
11. **API Origin Isolation (`getApiBaseUrl`):** Restored strict `process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:18000'` without runtime `window` or URL query parsing overrides, preventing origin injection regressions.

> [!IMPORTANT]
> **Review Gate Boundaries:**
> While technical fixes for all 11 items have been committed and verified against unit/contract test suites, this report acknowledges that automated tests and browser probes represent smoke evidence. Extended manual accessibility verification across multiple assistive technologies, exhaustive offline tile caching scenarios, and extended real-world network partition recovery remain operational QA scopes rather than fully settled gates.

---

## 8. Independent Real Browser CDP QA Evidence (`tools/probe_online_ui.mjs`)

> [!NOTE]
> **Evidence Scope & Boundary:**
> While the automated 33-check CDP probe provides positive evidence of real vector tile decoding (HTTP 206), non-blank canvas rendering, marker synchronization, and basic keyboard focus, it represents automated smoke evidence. It does not constitute full extended keyboard/offline/retry acceptance.

Executed full candidate journey with `tools/probe_online_ui.mjs` connecting frontend on port 3070 to real synthetic backend on port 8070 (started with `WEB_ORIGIN` allowing port 3070):

```json
{
  "web": "http://127.0.0.1:3070",
  "api": "http://127.0.0.1:8070",
  "build_commit": "2602cd61d14f35ce762541f336c4b54c782cc80d",
  "dataset": "synthetic",
  "provider": "rules",
  "all_checks_passed": true,
  "checks_count": 35,
  "network": {
    "remoteOrigins": [],
    "pmtilesRanges": [
      { "status": 206, "range": "bytes 0-16383/2138597" },
      { "status": 206, "range": "bytes 487845-605035/2138597" },
      { "status": 206, "range": "bytes 0-16383/2138597" },
      { "status": 206, "range": "bytes 487845-605035/2138597" }
    ]
  }
}
```

- **35/35 checks PASSED (exact recorded count in `docs/reports/online-assistant/evidence/browser-evidence.json`):**
  - `real PMTiles HTTP Range206/header`: PASS
  - `desktop/mobile no horizontal overflow 1440 & 390`: PASS
  - `attached Vietnamese request preserves allergy and slots`: PASS
  - `no tour before confirmation`: PASS
  - `allergy warning before confirm`: PASS
  - `actual three-stop tour`: PASS
  - `free Maps URL actual navigation`: PASS
  - `actual geographic map canvas`: PASS
  - `attribution visible`: PASS
  - `markers match tour (initial 3 markers rendered without race)`: PASS
  - `marker toggle off & on`: PASS
  - `tour reload retained`: PASS
  - `missing Tavily key honest disabled`: PASS
  - `keyboard focus exists`: PASS
  - `no external map/provider requests in deterministic UI lane`: PASS
  - `map made real partial-content requests`: PASS
- **Zero remote map origins:** Verified `origins.size === 0`.
- **True HTTP Range 206 tile decoding:** Vector tile data byte range `487845-605035/2138597` decoded and rendered by the MapLibre web worker.
- **Integration Boundary:** Codex's separate coordinator probe independently captures the scrolled mobile map region as well as extended keyboard, retry, and offline resilience checks for final integration.


