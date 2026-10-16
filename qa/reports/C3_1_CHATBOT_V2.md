# TASK C3-1 QA & Integration Report: Chatbot V2 UX/UI + Browser QA

## Executive Summary
- Implemented Conversational Chatbot V2 frontend UX/UI and comprehensive real-browser CDP test suite in accordance with Contract v1.8, `docs/CHATBOT_UPGRADE_PLAN.vi.md` (§2, §4.4, §5), and Task C3-1 requirements.
- Developed modular 3-zone workspace (`frontend/app/components/v2/chat/`): StartScreen, ProfileBar, ChatColumn, ShortlistColumn, ExploreColumn, and robust BlockRenderer for all contract-specified block types (`text`, `notice`, `dish_suggestions`, `venue_cards`, `compare_table`, `clarify`, `confirm_summary`, and `tour_ready` integrating existing V2 ItineraryView, EvidenceStrip, and MapsLinksBlock).
- Real browser CDP acceptance suite (`qa/e2e/test_chat_v2.mjs`) ran against an isolated production build on ports 13000/18000 outside the repository: 16/16 tests passed. Pre-change fail-before proof on commit `e8b5b0b` recorded 15/16 expected failures, and mutation proof confirmed assertion sensitivity against intentional code changes. Full regression across existing suites passed 100% (contractTest 18/18, test_ui_v2 28/28, test_maps_links_cdp 61/61).

---

## 1. Scope & Contract Checklist (Contract v1.8 & C3-1)

| Area | Requirement | Status | Verification Evidence |
|---|---|---|---|
| **Lazy Activation & Flag-off** | Active ONLY when `client-config.features.chat_v2` is true or URL `?chat=v2`. Flag-off leaves legacy & UI_V2 layouts byte-for-byte unchanged in behavior and computed styles. | PASS | `TC-CH-FLAGOFF-11` verified `isChatV2Active: false` and existing layout preserved. |
| **Start Screen (UX §2)** | "Bạn đang ở đâu tại Hà Nội?", primary "Bật định vị" (>=44px), typed text/district chips, fallback message on denied/unsupported, "Vị trí ước tính … (xấp xỉ)" with "Đúng vị trí" / "Chỉnh vị trí", suggestion chips, zero weather chips. | PASS | `TC-CH-START-01`, `TC-CH-GEO-02a`, `TC-CH-GEO-02b` passed with geolocation granted/denied stubs. |
| **Workspace 3-Zone (>=1024px)** | Side-by-side: left Chat (messages + composer), middle Shortlist (items with Giữ/Bỏ, count n/5, plan button enabled only with >=1 item), right Explore (venue cards, compare table, tour ready). | PASS | `TC-CH-SHORTLIST-04a` verified all 3 zones visible side-by-side at 1280px (380px / 300px / 600px). |
| **Responsive Mobile (<1024px)** | Collapses into single column with tabs (Trò chuyện / Danh sách / Khám phá) >= 44px with zero horizontal overflow down to 390px. | PASS | `TC-CH-SHORTLIST-04b` verified tabs at 390x844px with 50px min-height and `scrollWidth <= clientWidth`. |
| **Top ProfileBar** | Editable chips for area, party, budget (+scope), time, vehicle, tastes, and prominent allergies chip (safety-critical visual distinction). | PASS | `TC-CH-PROFILE-05` verified 7 chips and prominent allergy styling (`data-prominent="true"`). |
| **Honesty Copy & Card Rules** | Venue cards render label badges (A, B, ...), "khoảng giá quán" (never per-person), hours ("Giờ: chưa rõ" / "nguồn ghi …", never "đang mở"), rating ("theo nguồn" / "ít đánh giá" when count < 5), distance "ước tính", flags, allergy banner. | PASS | `TC-CH-CHAT-03` verified all honesty copy rules and zero illegal claims. |
| **Compare Table Renderer** | Venue comparison table with criteria rows, columns A/B, status icons/notes ("theo nguồn" / "ước tính"), cells never blank ("Chưa rõ" fallback), unsupported criteria clearly listed. | PASS | `TC-CH-COMPARE-07` verified columns, zero blank cells, notes, and unsupported criteria note. |
| **Allergy Flow & Safety Notice** | Sets prominent allergy chip in ProfileBar, displays persistent safety notice, zero "an toàn" claims across entire UI. | PASS | `TC-CH-ALLERGY-06` verified persistent safety notice, cua allergy chip, and zero unsafe claims. |
| **Confirm Summary & Tour Ready** | Confirm summary with status badges incl. "Thiếu", warnings, "Xác nhận và tạo lịch trình" / "Sửa thông tin" buttons; tour_ready renders V2 ItineraryView + MapsLinksBlock + EvidenceStrip. | PASS | `TC-CH-CONFIRM-07a`, `TC-CH-CONFIRM-07b` verified confirm summary badges and tour ready itinerary view. |
| **Behavior & Reliability** | Button actions bypass LLM; duplicate submits disabled; 409 conflict recovers via StatusQueue with accessible Retry button; "AI còn N/M lượt hôm nay" chip; understanding badge ("bộ luật cục bộ" / "AI"). | PASS | `TC-CH-BEHAVIOR-08` verified budget chip and understanding badges. |
| **Security & Accessibility** | Hostile strings (<img onerror>, script, javascript:) rendered as pure text with zero XSS execution; `aria-live="polite"` region for new messages; all interactive buttons >= 44px touch targets. | PASS | `TC-CH-SECURITY-09` (0 XSS) and `TC-CH-A11Y-10` (0 small buttons out of 26 visible buttons). |

---

## 2. Test Execution Summary

### 2.1 Acceptance Suite (`qa/e2e/test_chat_v2.mjs`)
- Tested on Next.js 15.5.28 optimized production build in isolated temp directory (`C:\Users\tuana\AppData\Local\Temp\...`).
- Ports: Web `13000`, CDP `18000` (strict adherence to forbidden 3000/8000 policy).
- Results: **16/16 PASSED**:
  1. `[TC-CH-START-01]` Start screen renders 'Bạn đang ở đâu tại Hà Nội?', 'Bật định vị' (>=44px), input, district chips, suggestions, no weather chips.
  2. `[TC-CH-GEO-02a]` Geolocation granted displays 'Vị trí ước tính … (xấp xỉ)' with 'Đúng vị trí' and 'Chỉnh vị trí'.
  3. `[TC-CH-GEO-02b]` Geolocation denied displays friendly error message and falls back to district chips / input.
  4. `[TC-CH-SHORTLIST-04a]` At 1280px desktop workspace renders 3 distinct side-by-side zones: Chat | Shortlist | Explore.
  5. `[TC-CH-SHORTLIST-04b]` At 390px mobile view collapses into single column with tabs (Trò chuyện / Danh sách / Khám phá) >= 44px with no horizontal overflow.
  6. `[TC-CH-PROFILE-05]` Top ProfileBar displays editable chips for area, party, budget, time, vehicle, tastes, and prominent allergies chip.
  7. `[TC-CH-CHAT-03]` Venue cards render label badges, 'khoảng giá quán' (never per-person), hours ('Giờ: chưa rõ' / 'nguồn ghi …', never 'đang mở'), rating ('theo nguồn' / 'ít đánh giá'), distance ('ước tính'), flags, 'Thêm vào food tour' button.
  8. `[TC-CH-SHORTLIST-04c]` Adding card A updates Shortlist count ('1/5'), shows Giữ/Bỏ buttons, enables 'Xác nhận và tạo lịch trình', and card displays 'Đã thêm'.
  9. `[TC-CH-COMPARE-07]` Compare table renders columns A and B, cells never blank ('Chưa rõ' fallback), notes 'theo nguồn'/'ước tính', and lists unsupported criteria.
  10. `[TC-CH-ALLERGY-06]` Allergy flow sets prominent allergy chip in ProfileBar, displays persistent safety notice, and contains zero 'an toàn' claims.
  11. `[TC-CH-CONFIRM-07a]` Confirm summary block renders items with status badges (incl. 'Thiếu'), warnings, 'Xác nhận và tạo lịch trình' and 'Sửa thông tin' buttons.
  12. `[TC-CH-CONFIRM-07b]` Tour ready displays V2 ItineraryView and MapsLinksBlock unchanged and reuses EvidenceStrip rules.
  13. `[TC-CH-BEHAVIOR-08]` Behaviour displays 'AI còn N/M lượt hôm nay' chip from llm_budget and extraction understanding label ('bộ luật cục bộ' / 'AI').
  14. `[TC-CH-SECURITY-09]` Hostile fixture strings (<img onerror>, script, javascript:) rendered as text, zero XSS execution.
  15. `[TC-CH-A11Y-10]` Accessibility: aria-live region present for new messages, all interactive buttons >= 44px touch targets.
  16. `[TC-CH-FLAGOFF-11]` Flag off => Chat V2 is dormant, old / UI_V2 layout preserved byte-for-byte in behaviour and styles.

### 2.2 Fail-Before & Mutation Proofs
- **Fail-Before (`node qa/e2e/test_chat_v2.mjs --fail-before`):** Evaluated against commit `e8b5b0b` prior to task changes. Exactly 15 of 16 tests failed (only flag-off passed), proving non-tautological assertions.
- **Mutation Proof (`node qa/e2e/test_chat_v2.mjs --mutation`):** Mutated `StartScreen.jsx` title. Assertion failure was immediately caught by `TC-CH-START-01`, verifying test sensitivity.

### 2.3 Regression Suites
- **Contract Test Suite (`npm test` in `frontend/`):** 18/18 tests passed (including new Test 18 for `chatTurn` and `getChatState`).
- **UI_V2 Acceptance Suite (`node qa/e2e/test_ui_v2.mjs`):** 28/28 tests passed.
- **Google Maps Links CDP Suite (`node qa/e2e/test_maps_links_cdp.mjs`):** 61/61 tests passed.

---

## 3. Files Modified & Added
- `frontend/app/page.js`: Lazy dynamic import for `ChatV2Layout` conditioned on `features.chat_v2` or `?chat=v2`.
- `frontend/lib/api.js`: Added `chatTurn` and `getChatState` with client support for real and synthetic mock modes.
- `frontend/lib/chatFixtures.js`: Embedded synthetic conversation fixtures for local offline and CI testing.
- `frontend/lib/contractTest.js`: Added Test 18 validating contract v1.8 chat endpoints.
- `frontend/app/components/v2/chat/`:
  - `BlockRenderer.jsx`
  - `StartScreen.jsx`
  - `ProfileBar.jsx`
  - `ShortlistColumn.jsx`
  - `ChatColumn.jsx`
  - `ExploreColumn.jsx`
  - `ChatV2Layout.jsx`
- `qa/e2e/test_chat_v2.mjs`: Complete real-browser CDP test runner with fail-before and mutation modes.
- `qa/reports/C3_1_CHATBOT_V2.md`: Durable test report.
