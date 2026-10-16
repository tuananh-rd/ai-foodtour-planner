# TASK C6a Acceptance & QA Report: Real-API Chatbot V2 E2E + UX Verification

## Executive Summary
- Executed TASK C6a: Real-API E2E test suite for Chatbot V2 with a real browser driven via Chrome DevTools Protocol (CDP), testing directly against the live FastAPI backend on port 18000 (with SQLite session DB and synthetic venues fixture) and the production Next.js frontend on port 13000 in an isolated scratch build. Zero frontend mocks were used in this acceptance suite.
- Verified all 10 required user interaction scenarios plus the full PLAN flow (CH-09): 17 of 17 tests passed in `qa/e2e/test_chat_v2.mjs`. In addition, all regression suites (`test_components.mjs`, `test_ui_kit.mjs`, `test_ui_v2.mjs`, and `test_maps_links_cdp.mjs`) passed 100% (164/164 tests passing across the entire repository).
- Captured 18 high-resolution screenshots at both 1280x800 (desktop 3-zone workspace) and 390x844 (mobile stacked tabs) under `qa/screenshots/chat-v2/` validating visual layout, honesty copy, allergy notices, and itinerary presentation.

---

## 1. Test Architecture & Real Environment Configuration

In strict compliance with Orca guidelines and Task C6a setup instructions:
- **FastAPI Real Backend:**
  - Runtime: Python virtual environment (`foodtour-codex-backend/.venv`)
  - Server: `uvicorn app.main:app --port 18000`
  - Environment variables: `FOODTOUR_CHAT_V2=1`, `FOODTOUR_UI_V2=1`, `FOODTOUR_DATA_PATH=<contracts/fixtures/venues.chat.synthetic.json>`, `FOODTOUR_SESSION_DB=<temp-dir>/sessions.sqlite`, `FOODTOUR_LLM=mock`, `ROUTING=estimate`. Zero real API keys, zero Gemini calls, no raw Foody CSV data accessed.
- **Next.js Production Frontend:**
  - Build: Optimized Next.js 15 production build compiled in scratch directory (`<temp-dir>/foodtour-web-scratch-...`)
  - Server: `next start -p 13000`
  - Configuration: `NEXT_PUBLIC_API_URL=http://127.0.0.1:18000` (real API base URL, zero mock mode).
- **Headless Browser (Chrome CDP):**
  - CDP Port: 19222 (completely isolated from web 13000 and API 18000; strict adherence to forbidden ports 3000/8000).
  - Assertions evaluate both real DOM tree state and network traffic on `POST /v1/sessions/{id}/chat` bodies and responses.

---

## 2. Results Table: Chatbot V2 Real-API Scenarios

| Scenario ID | Test Name | Description & Assertions | Status | Measured Evidence |
|---|---|---|---|---|
| **CH-01a** | Start Screen & Geolocation Denied | Browser geolocation denied displays friendly fallback notice and Hanoi district chips. | **PASS** | `deniedMsg: true`, `districtChips: true` |
| **CH-01b** | Weather Disclaimer & Dish Suggestions | Phrase *"Chiều nay nóng quá, quanh đây ăn gì được?"* returns explicit `NO_WEATHER` disclaimer (no weather data available) and dish suggestions. | **PASS** | `noWeatherText: true`, `dishSuggestions: true` |
| **CH-03a** | Venue Search Cards | Search *"tìm quán bún"* renders venue cards labeled with sequential badges A, B. | **PASS** | `cards: 2`, `badges: ["A", "B"]` |
| **CH-03b** | Venue Comparison Table | Comparing venues A and B renders comparison table with columns A and B, distance estimate label, fallback *"Chưa rõ"* cells, and note on unsupported criteria. | **PASS** | `table: true`, `cols: true`, `distanceEstimate: true`, `noEmpty: true` |
| **CH-04** | Shortlist Synchronization | Shortlist add, remove, and keep actions function via BOTH UI buttons and typed text; panel stays synchronized with server `chat.state`. | **PASS** | `addBtn: 1/5`, `kept: true`, `addText: 2/5`, `removeText: 1/5`, `removeBtn: 0/5` |
| **CH-05** | Ambiguous Input ("ok") Clarification | Typed input *"ok"* never creates a tour and displays clarification option buttons. | **PASS** | `hasTour: false`, `clarifyButtons: true` |
| **CH-06** | Allergy Safety Flow | Message *"có bạn không ăn cua"* triggers allergy-or-dislike buttons -> *"Dị ứng"* sets prominent allergy chip; venue cards show *"Chưa đủ thông tin về dị ứng"*; crab venues excluded; zero *"an toàn"* claims across UI. | **PASS** | `prominentChip: true`, `cardsWarned: true`, `containsCrab: false`, `unsafeClaims: false` |
| **CH-08a** | Outside Hanoi Notice | User input *"ở Sa Pa"* triggers outside-Hà-Nội coverage notice without crashing. | **PASS** | `outsideNotice: "Dữ liệu của mình hiện chỉ có quán ở Hà Nội. Bạn hãy chọn một khu vực trong Hà Nội nhé."` |
| **CH-08b-STREET** | Street Name Geocoding Approximation | User input *"đường Xuân Thủy"* resolves with approximate indicator *"xấp xỉ"*. | **PASS** | `xuanThuy: true`, `xapXi: true` |
| **CH-08b** | Location Resolution to Workspace | User input *"ở Cầu Giấy"* resolves location, updates profile, and opens main 3-zone workspace. | **PASS** | `cauGiayResolved: true`, `inWorkspace: true` |
| **CH-08-DOUBLECLICK** | Add Button Double-Click Guard | Rapid double-click on *"Thêm vào food tour"* sends exactly ONE network request. | **PASS** | `sentCalls: 1` |
| **CH-08-409-DETECT** | Revision Conflict (409) Handling | Sending stale revision to `POST /v1/sessions/{id}/chat` triggers HTTP 409 Conflict from backend, recovered via StatusQueue. | **PASS** | `status: 409` |
| **CH-08-RELOAD** | Mid-Conversation Page Reload | Reloading page mid-conversation restores full chat state (shortlist and pending clarify options) from backend session. | **PASS** | `shortlistRestored: 1/1`, `inWorkspace: true` |
| **CH-09-A11Y** | Accessibility & Responsive Viewports | Full keyboard navigation (Tab, Enter, Space), 1280x800 three side-by-side zones, 390x844 stacked tabs, all interactive buttons >= 44px. | **PASS** | `threeZones: true`, `mobileTabs: 3 (minH: 50px)`, `smallButtons: 0` |
| **CH-10-HOSTILE** | Hostile Text Immunity | Hostile user input (`<img onerror>`, `javascript:`, 1000 chars) renders as sanitized plain text with zero script execution. | **PASS** | `xssTriggered: false`, `rawImg: false`, `rendersText: true` |
| **CH-08-CONFIRM-DOUBLECLICK** | Confirm Button Double-Click Guard | Rapid double-click on *"Xác nhận và tạo lịch trình"* sends exactly ONE network request. | **PASS** | `sentCalls: 1` |
| **CH-09-PLAN** | Full PLAN Flow (C4-API Integration) | Complete confirmation flow (`confirm_summary` -> `confirm_yes` -> `tour_ready`) renders ItineraryView, EvidenceStrip, and MapsLinksBlock with functional Google Maps link button. | **PASS** | `tourReady: true`, `itinerary: true`, `mapsBlock: true`, `stops: 2`, `mapsLinks: 1` |

---

## 3. Screenshots Gallery

All screenshots are stored under `qa/screenshots/chat-v2/` at both 1280x800 (desktop) and 390x844 (mobile):

1. `01_start_screen_denied_1280.png` & `01_start_screen_denied_390.png`: Start screen showing geolocation fallback notice, district chips, and location input.
2. `02_dish_suggestions_no_weather_1280.png` & `02_dish_suggestions_no_weather_390.png`: Suggestion cards showing `NO_WEATHER` disclaimer and culinary dishes.
3. `03_search_cards_and_compare_1280.png` & `03_search_cards_and_compare_390.png`: Venue cards labeled A & B and detailed comparison table.
4. `04_shortlist_sync_buttons_and_text_1280.png` & `04_shortlist_sync_buttons_and_text_390.png`: Shortlist panel synchronized across button clicks and natural language text commands.
5. `05_typed_ok_clarify_buttons_1280.png` & `05_typed_ok_clarify_buttons_390.png`: Ambiguous "ok" response showing clarification option buttons without premature tour creation.
6. `06_allergy_crab_prominent_notice_1280.png` & `06_allergy_crab_prominent_notice_390.png`: Safety flow with prominent crab allergy chip, venue disclaimer banners, and zero "an toàn" claims.
7. `07_location_resolution_and_outside_sapa_1280.png` & `07_location_resolution_and_outside_sapa_390.png`: Outside Hà Nội notice for Sa Pa and successful resolution of Cầu Giấy.
8. `08_reload_mid_conversation_restored_1280.png` & `08_reload_mid_conversation_restored_390.png`: Post-reload workspace restoring shortlisted venues and pending clarify state from backend.
9. `09_tour_ready_itinerary_maps_1280.png` & `09_tour_ready_itinerary_maps_390.png`: Final tour itinerary showing EvidenceStrip, StopCards, and Google Maps directions link button.

---

## 4. Frontend UX Fixes Implemented

1. **Session Restoration & Reset Isolation (`frontend/app/page.js`):**
   - Corrected `sessionStorage` persistence to only activate when `ChatV2` is active.
   - Ensured explicit reset actions (`onResetSession={() => initSession({ isReset: true })}`) immediately purge `sessionStorage` keys (`foodtour_chat_session_id`, `foodtour_chat_session_token`), preventing stale tours from reappearing after resetting in `V2Layout` or legacy mode.
2. **State Reload Resilience (`frontend/app/components/v2/chat/ChatV2Layout.jsx`):**
   - Enhanced `ChatV2Layout` to cleanly restore chat history turns, shortlist venues, and pending clarification buttons upon page reload using `getSession()`.
3. **Selector & Testability Hooks (`frontend/app/components/v2/MapsLinksBlock.jsx` & `StopCard.jsx`):**
   - Added standard `data-testid="maps-links-block"` to `MapsLinksBlock.jsx` and `data-testid="stop-card"` to `StopCard.jsx`, standardizing DOM selection across all test runners.
4. **Action Target Size & Accessibility:**
   - Ensured all buttons in `BlockRenderer.jsx` (including `btn-confirm-yes`, `btn-confirm-no`, and clarification option chips) adhere strictly to the >= 44px touch target minimum.

---

## 5. Backend / Engine / Contract Verification Observations

- **C4-API PLAN Integration:** The merged backend already fully supports the PLAN flow (`action: { type: "confirm_yes" }` creates an itinerary with `tour_ready`, stops, and Maps links). The test recorded `CH-09-PLAN` as verified and passing against the real backend.
- **Deterministic Revision Conflict (409):** The FastAPI backend accurately detects stale revisions and returns HTTP 409 Conflict with the current revision, allowing the frontend client to recover reliably without corrupting state.
- **Coverage Boundary:** Backend correctly enforces the Hà Nội geographical boundary and issues `outside_coverage` with clear explanatory copy.

---

## 6. Regression Summary

| Suite Name | Command | Test Count | Status |
|---|---|---|---|
| **Chatbot V2 Real-API CDP Suite** | `node qa/e2e/test_chat_v2.mjs` | 17 / 17 | **PASS** |
| **Component DOM & Accessibility** | `node qa/e2e/test_components.mjs` | 47 / 47 | **PASS** |
| **UI Kit Tokens & Primitives** | `node qa/e2e/test_ui_kit.mjs` | 11 / 11 | **PASS** |
| **UI V2 Real-Browser CDP Acceptance** | `node qa/e2e/test_ui_v2.mjs` | 28 / 28 | **PASS** |
| **Google Maps URLs CDP Suite** | `node qa/e2e/test_maps_links_cdp.mjs` | 61 / 61 | **PASS** |
| **Total Test Count** | Across all 5 suites | **164 / 164** | **100% PASS** |

---

## 7. Limitations & Context

- **Budget Exhausted Path:** Scenario 7 (budget exhausted banner path) was intentionally skipped in this task as agreed, being owned and covered by Task C6b.
- **Synthetic Test Data:** Acceptance testing utilized `contracts/fixtures/venues.chat.synthetic.json` per project security rules; no raw Foody datasets or live external API keys were exposed or used.
