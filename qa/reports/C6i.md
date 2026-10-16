# QA Report C6i — Final Frontend Fixes for Codex C6-final-2 Findings

**Date:** 2026-10-17  
**Agent:** Antigravity (Frontend & Independent Integration QA)  
**Branch:** `foodtour-antigravity-web`  
**Reviewer:** Codex / Claude  
**Reference Report:** `docs/reports/CODEX_C6_FINAL_2.md`

---

## 1. Executive Summary

In Task C6i, Antigravity implemented comprehensive fixes for all outstanding findings identified in Codex's C6-final-2 review (`docs/reports/CODEX_C6_FINAL_2.md`):
1. **ProfileBar Structured Controls:** Completely removed all client-side free-text parsing of values. Implemented dedicated structured HTML form controls (number inputs, selects, time pickers) with strict client-side validation, inline Vietnamese error alerts (`role="alert"`), labels for all controls, and focus-trap/Escape support. All regression cases (e.g. `1,5 triệu cả nhóm -> 15000`, `600k cả nhóm 3 người -> 6003000`, `-250k`, 30-digit numbers, `máy bay -> motorbike`, `bộ đàm -> walk`) are now structurally impossible.
2. **Containment on Eight-Block Hostile Boundary & Production Shell:** Applied containment rules (`overflow-wrap: anywhere`, `word-break: break-word`, `min-width: 0` on flex/grid children, `max-width: 100%`, `white-space: normal` inside buttons/chips, `table-layout: fixed`) across all renderers (`ItineraryView`, `StopCard`, `EvidenceStrip`, `MapsLinksBlock`, `BlockRenderer`, and `ProfileBar`). Verified `document.scrollWidth <= innerWidth` AND each block's `scrollWidth <= clientWidth` at both 1280px and 390px for both the 8-block hostile page (`/review`) and the actual production shell.
3. **MapsLinksBlock Complete Vietnamese Localization:** Eliminated the English parenthetical from the privacy disclosure line (~L642). Updated `frontend/lib/mapsUrlValidation.js` to translate all 5 known server notes and provide a neutral Vietnamese fallback (`"Ghi chú thêm từ máy chủ"`) for unknown notes. Added DOM assertions confirming zero ASCII-English notes are visible.
4. **Serial Test Execution & Mutation Verification:** All seven test suites passed serially with exit code 0. The three original mutations (`allergy`, `fallback`, `guard`) plus a new structured budget validation mutation (`budget`) were executed and confirmed to fail with exit code 1.

---

## 2. Detailed Technical Fixes

### 2.1 ProfileBar Structured Controls (`frontend/app/components/v2/chat/ProfileBar.jsx`)
- **Removed free-text parsing:** Deleted `parseProfileField` heuristic parsing function.
- **Dedicated structured controls:**
  - **Party size:** `<input type="number" min="1" max="20">`
  - **Budget:**
    - Amount input: `<input type="number" min="1" max="100000000">` (digits only, 1..100,000,000 VND)
    - Unit select: `<select>` with options `đồng` (1), `nghìn` (1,000), `triệu` (1,000,000)
    - Required scope select: `<select>` with options `mỗi người` (`per_person`), `cả nhóm` (`group`). Leaving scope unselected blocks submission with an inline alert.
    - Emits payload: `{ budget_vnd: int, budget_scope: 'per_person' | 'group' }`.
  - **Vehicle:** `<select>` restricted strictly to the 4 supported values:
    - Đi bộ (`walk`)
    - Xe máy (`motorbike`)
    - Ô tô (`car`)
    - Taxi / Grab (`taxi`)
  - **Times:** `<input type="time">` -> `HH:MM`
  - **Max leg:** `<input type="number" min="3" max="60">`
  - **Audience:** `<select>` with valid audience options.
  - **Allergies & tastes:** Handled as text turns routed to the server parser.
- **Validation & A11y:**
  - Inline error alert container: `<div role="alert" data-testid="profile-edit-error">`
  - Control labels: explicitly associated via `htmlFor` and `id`
  - Dialog focus trap and `Escape` key dismissal preserved.

### 2.2 Hostile Boundary Containment (`frontend/app/review/page.jsx`, `frontend/app/components/v2/`)
- Created `/review` page rendering all 8 block types populated with 5,000-character adversarial hostile strings (`<img src=x onerror="window.__xss=1">javascript:alert(1)\u202e` + `'N'.repeat(5000)`).
- Applied containment styles to:
  - `ItineraryView.jsx`: Root container, summary line, action buttons, stop cards list.
  - `StopCard.jsx`: Root container, header flex layout, `h4`, address, district, why chips, price chip, hours chip, and replace button.
  - `EvidenceStrip.jsx`: Container, toggle button (`white-space: normal`), title text, details container, and list items.
  - `MapsLinksBlock.jsx`: Root container, header flex row, status banners (partial/unavailable), server notes, leg link items, privacy note, and schedule disclaimer.
  - `BlockRenderer.jsx`: `dish_suggestions` container & items, `compare_table` with `table-layout: fixed`, `clarify` option buttons, and `confirm_summary` labels/values/buttons.
  - `ProfileBar.jsx`: `flex-wrap: wrap`, `box-sizing: border-box`, `white-space: normal` on chips.
- **Verification:**
  - 1280px Desktop: `document.scrollWidth = 1265px <= 1280px`; all 8 sections `scrollWidth = 1265px == clientWidth = 1265px`.
  - 390px Mobile: `document.scrollWidth = 390px <= 390px`; all 8 sections `scrollWidth = 390px == clientWidth = 390px`.
  - Actual production shell at 1280px and 390px: `document.scrollWidth <= innerWidth` and core blocks `scrollWidth <= clientWidth`.

### 2.3 MapsLinksBlock Complete Localization (`frontend/app/components/v2/MapsLinksBlock.jsx`, `frontend/lib/mapsUrlValidation.js`)
- Replaced the privacy line English parenthetical with pure Vietnamese:
  `🔒 Liên kết chứa toạ độ điểm xuất phát/quán ăn hoặc địa chỉ dự phòng và chỉ được gửi tới Google khi bạn mở liên kết.`
- Updated `translateServerNote` mapping in `frontend/lib/mapsUrlValidation.js`:
  - 5 known English server notes mapped to natural Vietnamese translations.
  - Fallback for unknown server notes: `"Ghi chú thêm từ máy chủ"`, ensuring raw ASCII English is never leaked to the DOM.
- Added DOM test assertions in `qa/e2e/test_chat_v2.mjs` (`CH-09b`, `CH-09c`) confirming zero occurrences of English phrases.

---

## 3. Serial Verification Results

All suites were executed serially with verified clean port state between runs (no concurrent harnesses):

| Test Suite | Command | Result | Details |
|---|---|---|---|
| Chat V2 CDP Real API | `node qa/e2e/test_chat_v2.mjs` | **29/29 PASSED** (exit 0) | Real FastAPI backend, Next.js production build, CDP Chrome. All scenarios CH-01 through CH-14 passed. |
| C6 Final Runner Hostile Shell | `node qa/chat/c6_final_runner.mjs hostile` | **2/2 PASSED** (exit 0) | Hostile 5k strings injected into live production shell explore zone; 1280 & 390 bounded, 0 XSS, 0 broken images. |
| UI V2 Real-Browser CDP | `node qa/e2e/test_ui_v2.mjs` | **28/28 PASSED** (exit 0) | Header height, dev jargon purge, request chips, viewport containment, evidence strip, ratings, touch targets. |
| Component Unit / Integration | `node qa/e2e/test_components.mjs` | **48/48 PASSED** (exit 0) | Replace modal, mapview, timeline, preferences, UI V2 tokens, maps links, evidence strip 128-matrix. |
| UI Kit Design Tokens CDP | `node qa/e2e/test_ui_kit.mjs` | **11/11 PASSED** (exit 0) | 44px touch targets at 390 and 1280, no horizontal scroll, contrast >= 4.5:1, StatusQueue invariant, reduced motion. |
| Google Maps URLs CDP | `node qa/e2e/test_maps_links_cdp.mjs` | **61/61 PASSED** (exit 0) | Segmented toggle, 44px targets, radio keyboard navigation, 0 auto-open, 0 Google calls, honest partial/unavailable, race conditions. |
| Contract Invariant Tests | `node frontend/lib/contractTest.js` | **18/18 PASSED** (exit 0) | All Contract v1.0–v1.8 API invariants verified. |

---

## 4. Mutation Sensitivity Evidence

All four mutations were tested against `qa/chat/c6_final_runner.mjs` to verify test sensitivity:

1. **Allergy Banner Mutation (`allergy`):**
   - Mutation: Replaces `{hasAllergyUnknown && (` with `{false && (` in `BlockRenderer.jsx`.
   - Result: **FAILED** on `CH-06` with `cardsWarned: false`. Exited with code 1.
2. **Null Cell Fallback Mutation (`fallback`):**
   - Mutation: Replaces `cell.value || 'Chưa rõ'` with `cell.value || ''` in `BlockRenderer.jsx`.
   - Result: **FAILED** on `CH-03b` with `noEmpty: false, injectedCell: ""`. Exited with code 1.
3. **In-Flight Guard Mutation (`guard`):**
   - Mutation: Strips synchronous in-flight and busy guards across all chat components.
   - Result: **FAILED** on `CH-08-DOUBLECLICK` with `sentCalls: 3`. Exited with code 1.
4. **Structured Budget Validation Mutation (`budget`):**
   - Mutation: Bypasses `budgetScope` requirement check in `ProfileBar.jsx`.
   - Result: **FAILED** on `CH-13a-BUDGET-VALIDATION` with `noReqSent: false, validReq: undefined`. Exited with code 1.

---

## 5. Modified Files Summary

- `frontend/app/components/v2/chat/ProfileBar.jsx`: Structured controls, validation, inline alerts, flex wrapping.
- `frontend/app/components/v2/chat/BlockRenderer.jsx`: Containment on `dish_suggestions`, `table-layout: fixed` on `compare_table`, preserved anchors.
- `frontend/app/components/v2/ItineraryView.jsx`: Containment on summary header line, buttons, and stops list container.
- `frontend/app/components/v2/StopCard.jsx`: Containment on card root, header, `h4`, district, address, why chips, price chip, hours chip, replace button.
- `frontend/app/components/v2/EvidenceStrip.jsx`: Containment on strip container, toggle button, details container, and list items.
- `frontend/app/components/v2/MapsLinksBlock.jsx`: Removed English parenthetical from privacy line; containment on status banners and server notes.
- `frontend/lib/mapsUrlValidation.js`: Added 5 Vietnamese note translations and neutral fallback.
- `frontend/app/review/page.jsx`: New static review page for the 8-block hostile boundary tests.
- `qa/e2e/test_chat_v2.mjs`: Added assertions for Maps translations (`CH-09b/c`), structured controls (`CH-13a/b`), and 8-block + production shell containment at 1280 & 390 (`CH-14`).
- `qa/e2e/test_components.mjs`: Updated `TC-MAPS-09` for translated server notes.
- `qa/e2e/test_maps_links_cdp.mjs`: Updated `TC-MAPS-PRIVACY-NOTE` and `TC-MAPS-UNAVAILABLE-URL-TOO-LONG` for translated server notes.
- `qa/chat/c6_final_runner.mjs`: Added `mode === 'budget'` mutation.
- `qa/chat/c6_final2_runner.mjs`: Added `mode === 'budget'` mutation.

---

## 6. Residual Limitations

- **Local Synthetic Environment:** All tests run with synthetic fixtures (`venues.chat.synthetic.json`) and temporary SQLite databases. No external/paid Google Maps API or real scraping data is used.
- **Evidence Conservatism:** Operating hours, per-person dining prices, and walking route geometry remain conditional / unknown where source data lacks verification.
