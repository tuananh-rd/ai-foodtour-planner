# C6g Gate Resolution & Independent Verification Report

Date: 2026-10-17  
Owner: Antigravity (Frontend & Integration QA)  
Reviewer: Codex (Independent verification)  
Coordinator: Claude  

---

## 1. Executive Summary

This report documents the resolution of all 5 frontend gate findings identified in `docs/reports/CODEX_C6_FINAL.md`, as well as test harness hardening across the test suites. All modifications were confined strictly to `frontend/`, `qa/e2e/`, and this report `qa/reports/C6g.md`. No `backend/` production code was altered.

Every fix was validated with a real-API or DOM test that fails before the fix. All test suites pass 100% when run serially. Furthermore, all 3 required mutation gates (`fallback`, `allergy`, and `guard`) demonstrably fail with exit code 1 when their respective safeguards are mutated.

---

## 2. Core Gate Findings Resolved

### 2.1 ProfileBar Group-Budget Edit & Scope Validation (Finding 1)
- **Defect:** Entering `600k cả nhóm` emitted `{ budget_vnd: 600000, budget_scope: 'total' }`. The backend `ChatPatch` schema rejects `'total'` with 422, accepting only `'per_person'` or `'group'`. Furthermore, entering an amount without scope (e.g., `600k`) lacked validation.
- **Fix:** In `frontend/app/components/v2/chat/ProfileBar.jsx`:
  - Updated regex parser to map Vietnamese keywords `cả nhóm|tổng` to `'group'` and `mỗi người|/người` to `'per_person'`.
  - Added scope presence validation: When an amount is entered without a recognizable scope, `parseProfileField` returns an error: `"Vui lòng ghi rõ ngân sách 'mỗi người' hoặc 'cả nhóm' (ví dụ: 250k mỗi người, 600k cả nhóm)."`.
  - An inline alert (`role="alert"`, `data-testid="profile-inline-error"`) is displayed in the chip editor dialog. No patch is emitted and zero network calls are made.
- **Verification:**
  - Added `CH-13a-BUDGET-VALIDATION` in `qa/e2e/test_chat_v2.mjs`:
    - Entering `600k` displays the inline error alert; network observer confirms 0 API calls sent.
    - Entering `600k cả nhóm` successfully emits `{ budget_vnd: 600000, budget_scope: 'group' }`, returning 200 and updating the chip display.

### 2.2 ProfileBar Vehicle Edit & Supported Mapping (Finding 2)
- **Defect:** Entering `đi bộ` emitted `vehicle: "walking"`, which backend schema rejects with 422 (accepts `walk`, `motorbike`, `car`, `taxi`). Unknown text silently defaulted to walking.
- **Fix:** In `frontend/app/components/v2/chat/ProfileBar.jsx`:
  - Mapped inputs explicitly: `đi bộ` -> `'walk'`, `xe máy|xe gắn máy` -> `'motorbike'`, `ô tô|oto|xe hơi` -> `'car'`, `taxi|grab` -> `'taxi'`.
  - Any unmapped text returns an inline validation error: `"Phương tiện chưa hỗ trợ. Chọn: đi bộ, xe máy, ô tô hoặc taxi."`. No patch is sent.
- **Verification:**
  - Added `CH-13b-VEHICLE-VALIDATION` in `qa/e2e/test_chat_v2.mjs`:
    - Entering `tàu bay` displays inline alert; 0 API calls sent.
    - Entering `xe máy` emits `{ vehicle: 'motorbike' }`, returning 200.

### 2.3 Itinerary 'Đổi quán' Button Action (Finding 3)
- **Defect:** Clicking `Đổi quán` on an itinerary stop emitted `{ action: { type: 'replace_stop', venue_id: ..., order: ..., text: ... } }`. The API returns 422 because `replace_stop` is not in `Action.type`, and `order`/`text` are forbidden action keys.
- **Fix:** In `frontend/app/components/v2/chat/BlockRenderer.jsx` and `StopCard.jsx`:
  - When clicking `Đổi quán` for stop with order `n`, the component emits a natural language text turn: `đổi quán thứ <n>` (e.g. `đổi quán thứ 2`) with `action: null` and no extra keys.
  - The server understands ordinal replacement naturally, replaces the selected stop while preserving locked stops, and returns the updated `tour_ready` block.
- **Verification:**
  - Added `CH-12-REPLACE-STOP` in `qa/e2e/test_chat_v2.mjs`:
    - Browser clicks `[data-replace-button]` on stop 2.
    - CDP network listener confirms payload sent has `text: "đổi quán thứ 2"` and `action: null`.
    - API returns 200; itinerary refreshes with updated tour preserving stop 1.
  - Downstream `c6_final_verify.txt` additionally validates natural language ordinal replacement (`đổi quán thứ hai`) passing 21/21.

### 2.4 Hostile / Long Server Strings Containment (Finding 4)
- **Defect:** Synthetic 5,000-character unbroken strings in venue names and addresses caused layout overflow (`scrollWidth > clientWidth`) in the Explore column and standalone review blocks.
- **Fix:**
  - In `frontend/app/components/v2/chat/BlockRenderer.jsx`, `StopCard.jsx`, `ChatV2Layout.jsx`, and `ExploreColumn.jsx`:
    - Applied `overflowWrap: 'anywhere'`, `wordBreak: 'break-word'`, `minWidth: 0`, and `maxWidth: '100%'` across all text elements, cards, compare table headers and cells, clarify options, and confirm summaries.
    - Fixed CSS grid column tracks to `minmax(0, 1fr)`.
    - Compare table includes `overflowX: 'auto'` container and bounded cell widths (`maxWidth: 180px`).
    - Added `<SafeText>` component for safe text clipping and rendering.
- **Verification:**
  - `node qa/chat/c6_final_runner.mjs hostile`:
    - Injects 5,000-char synthetic name and 5,000-char synthetic address via CDP Fetch on desktop (1280×800) and mobile (390×844).
    - Result: **2/2 PASSED** (`scrollWidth == clientWidth` at both viewports; zero XSS).
  - `CH-10b` in `qa/e2e/test_chat_v2.mjs`:
    - Intercepts real `/chat` response, injects 5k synthetic venue names and addresses, and asserts `document.scrollWidth <= window.innerWidth` and `exploreColumn.scrollWidth <= exploreColumn.clientWidth + 1` at both 1280 and 390. Result: **PASSED**.

### 2.5 Test Gate: 'Chưa rõ' Fallback Mutation Gate (Finding 5)
- **Defect:** When mutating `cell.value || 'Chưa rõ'` to `cell.value || ''`, the author suite previously passed because compare tables generated by backend fixtures did not have null/empty cells.
- **Fix:**
  - In `qa/e2e/test_chat_v2.mjs` (Scenario 2, `CH-03b`):
    - Enabled CDP `Fetch.enable` to intercept the `/chat` compare response and inject `null` for `block.rows[0].cells[0].value`, `.note`, and `.status`.
    - Asserted that `injectedCellFound: true` and `noEmptyCells: true` (ensuring every cell displays a non-empty string, falling back to `'Chưa rõ'`).
  - In `qa/e2e/test_components.mjs`:
    - Added `TC-COMPARE-NULL-FALLBACK` rendering a compare table with `null` and `""` cell values, asserting rendered text is `'Chưa rõ'`.
- **Verification:**
  - Mutating `cell.value || 'Chưa rõ'` to `cell.value || ''` immediately causes `CH-03b` to fail with `noEmpty: false, injectedCell: ""` and exits with code 1.

---

## 3. Harness & Quality Hardening

1. **Wait Mechanism (`qa/e2e/test_chat_v2.mjs`):**
   - Replaced polling on `chat-send.disabled` with polling the `chat-column` container's `aria-busy` attribute (`[data-testid="chat-column"]`). This prevents false turn completions or premature timeouts when the input composer is empty.
2. **Hard Timeout & Safe Port Handling:**
   - Implemented a 9-minute overall test watchdog (`TEST_HARD_TIMEOUT_MS`) that cleanly terminates child processes and exits non-zero if exceeded.
   - Added environment variable overrides: `UI_CHAT_PORT_API`, `UI_CHAT_PORT_WEB`, `UI_CHAT_PORT_CDP`.
   - `freePort()` only kills processes when `FORCE_FREE_PORTS=1` is explicitly set; otherwise it fails fast with a clear diagnostic message if ports are occupied.
3. **Deterministic Focus Emulation (`qa/e2e/test_ui_v2.mjs`):**
   - In `TC-V2-05b`, enabled `Emulation.setFocusEmulationEnabled({ enabled: true })` via CDP before checking the focus ring. This eliminates dependency on OS window focus in headless Chrome, making the focus-ring assertion 100% deterministic (28/28 pass).
4. **Vietnamese Map Disclosures (`frontend/lib/mapsUrlValidation.js`):**
   - Added `translateServerNote(note)` mapping known server note codes/texts (`estimated route geometry`, `route geometry not verified`, `straight line distance`, etc.) to clear Vietnamese descriptions. Never invents claims.

---

## 4. Mutation Gate Results

All 3 mutation gates were executed against `qa/chat/c6_final_runner.mjs` and failed with exit code 1 as required:

| Mutation Case | Injected Code Change | Expected Failure | Actual Result |
|---|---|---|---|
| **fallback** | `cell.value \|\| 'Chưa rõ'` -> `cell.value \|\| ''` | `CH-03b` fails `noEmptyCells` | **FAILED (Exit 1)**: `CH-03b: { chuaRo: true, noEmpty: false, injectedCell: "" }` |
| **allergy** | `{hasAllergyUnknown && (` -> `{false && (` | `CH-06` fails allergy notice | **FAILED (Exit 1)**: `CH-06: { allergyBlock: true, cardsWarned: false }` |
| **guard** | Remove double-click / inFlight guards | `CH-08` fails concurrency count | **FAILED (Exit 1)**: `CH-08-DOUBLECLICK: { sentCalls: 2 }` |

---

## 5. Test Suite Verification Matrix

All suites were executed serially:

| Suite | Command | Assertions | Result | Notes |
|---|---|---|---|---|
| Chat V2 Author Suite | `node qa/e2e/test_chat_v2.mjs` | 26/26 | **PASS** (Exit 0) | Real API, real browser, CDP Fetch injections |
| C6 Final Verify | `node qa/chat/c6_final_runner.mjs verify` | 26/26 | **PASS** (Exit 0) | Downstream independent verification harness |
| Hostile Strings Gate | `node qa/chat/c6_final_runner.mjs hostile` | 2/2 | **PASS** (Exit 0) | 5k name + address at 1280 & 390 viewports |
| UI V2 Smoke & Flow | `node qa/e2e/test_ui_v2.mjs` | 28/28 | **PASS** (Exit 0) | Deterministic focus emulation enabled |
| Component Unit Tests | `node qa/e2e/test_components.mjs` | 48/48 | **PASS** (Exit 0) | Includes `TC-COMPARE-NULL-FALLBACK` |
| UI Kit Visual System | `node qa/e2e/test_ui_kit.mjs` | 11/11 | **PASS** (Exit 0) | Legacy fallback & token system |
| Maps CDP Validation | `node qa/e2e/test_maps_links_cdp.mjs` | 61/61 | **PASS** (Exit 0) | Google Maps link format & Vietnamese notes |
| Contract Drift Check | `node frontend/lib/contractTest.js` | 18/18 | **PASS** (Exit 0) | Client-server schema alignment |

---

## 6. Limitations and Residual Risks

1. **Local Synthetic Environment:** All tests run locally against synthetic fixtures and mock LLM services. No live Google Maps, Foody, or third-party paid providers were queried.
2. **Walking Geometry:** Walking routes and durations are synthetic estimates; real road geometry and pedestrian walking paths are not validated in this local prototype.
3. **Data Provenance:** Venue datasets in `data/` and synthetic fixtures are local experimental data and remain quarantined outside of public Git commits.
