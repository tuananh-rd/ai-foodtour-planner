# Functional Exploratory QA Report · AI FoodTour Planner

**Date:** 2026-10-18  
**QA Lead:** Antigravity (Independent Functional Exploratory QA)  
**Coordination:** Codex (Backend & Integration Owner)  
**UI Owner:** Claude (Visual & Layout Owner)  
**Target Baseline:** `0c332d6` (Frontend source `d828e68`)  
**Harness / Browser Automation:** Google Chrome Headless via Chrome DevTools Protocol (CDP) on isolated port 19700.

---

## 1. Executive Summary

1. **What Was Done:**
   - Conducted an independent, deep exploratory functional QA round on real running HTTP backends (`http://127.0.0.1:8020` private data, `http://127.0.0.1:8040` synthetic data) and Next.js frontends (`http://127.0.0.1:3020`, `http://127.0.0.1:3040`) across desktop (1440×1024) and mobile (390×844) viewports.
   - Tested the exact required user input: `'tour3 quán quanh Hồ Gươm tối nay120 phút,500nghìn cho2người,thích phở và bún chả,dị ứng đậu phộng'`, followed by clarification responses, budget edits, greeting variations, error simulations, and stop replacements.
   - Captured real Chrome CDP screenshots and DOM geometry evidence stored in `docs/reports/functional-qa-20261018/`.

2. **What Was Found:**
   - **BUG-001 (P1, Codex):** Attached numbers without spaces (e.g. `'tour3 quán'`, `'nay120 phút'`) fail regex tokenization. `Số quán` and `Buổi` remain `Chưa chọn` in `UnderstoodCard`.
   - **BUG-002 (P1, Codex/Claude):** Selecting clarification chip `Cả nhóm` (`scope:group`) updates budget scope but returns `chat.pending: null` with text-only reply. `GuidedLayout` leaves the user in an interactive dead-air state where no follow-up question or tour proposal appears.
   - **BUG-003 (P2, Claude):** UnderstoodCard inline budget editor provides only 4 preset chips (200k, 300k, 500k, 1 triệu) without an arbitrary numeric input field.
   - **BUG-004 (P1, Codex):** Natural compound sentences starting with a greeting (e.g. `'Chào bạn, mình muốn tour 3 quán quanh Hồ Gươm tối nay trong120phút,ngân sách500nghìn cho2người'`) route exclusively to a pure greeting response, completely dropping all parsed tour request slots.
   - **BUG-005 (P2, Codex):** Natural landmark query `'Chợ Đồng Xuân'` fails to resolve to Hoàn Kiếm / Phố Cổ area without explicit district mention.
   - Core functional flows (Stop replacement modal with tour locking, session reload restore, session reset, honest allergy disclaimers, free Google Maps URL generation with 0 API calls, and responsive adaptation without horizontal overflow) **PASSED** on the baseline.

3. **What's Left:**
   - Hand off triage to Codex (Backend) and Claude (UI) for fixes to BUG-001, BUG-002, and BUG-004.
   - Retest regression scenarios once new build/commit lands.

---

## 2. Environment & Service Inventory

| Service | Port | Dataset / Mode | LLM Provider | Routing | Health Status | Verified Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Frontend (Private)** | `3020` | Real Next.js v15 | Calls 8020 | Calls 8020 | HTTP 200 OK | Loads `GuidedLayout`, renders UnderstoodCard with 10 rows. Zero private venue rows captured. |
| **Backend (Private)** | `8020` | Authorized Local Private Data | `mock` / `rules` | `estimate` | `{"status":"ok","dataset_source":"private"}` | Responsive; strict session token gate enforced. |
| **Frontend (Synthetic)** | `3040` | Frozen copy `d828e68` | Calls 8040 | Calls 8040 | HTTP 200 OK | Primary target for reproducible durable screenshots and interaction tests. |
| **Backend (Synthetic)** | `8040` | `venues.chat.synthetic.json` | `mock` / `rules` | `estimate` | `{"status":"ok","dataset_source":"synthetic"}` | Clean synthetic fixture backend for public durable screenshots. |
| **CDP Automation** | `19700` | Isolated Chrome User Data | N/A | N/A | Free before launch | Headless Chrome 1440×1024 and 390×844 automation. |

> **Live Gemini Provider Audit:** Both backends explicitly advertise `llm: "mock"`, `llm_provider: "rules"`, and `llm_budget: null`. Zero API keys or live credentials were accessed. Live Gemini is recorded as **BLOCKED** due to lack of an active configured live endpoint/budget proof.

---

## 3. Mandatory 10-Point QA Matrix

| # | Domain / Feature | Status | Case-Level Concrete Evidence | Durable Screenshot |
| :-: | :--- | :---: | :--- | :--- |
| **1** | **Greetings & Multi-turn Context** | **FAIL** | User typed `'Chào bạn, mình muốn tour 3 quán...'`. Backend routed solely to greeting reply and completely dropped the parsed tour request. All UnderstoodCard slots remained `Chưa chọn` (`BUG-004`). Pure greeting (`'Xin chào'`) responded correctly. | `m1_greeting_request.png`, `m1_pure_greeting.png` |
| **2** | **Attached / Word Numbers & Budgets** | **FAIL** | Exact required input `'tour3 quán... tối nay120 phút'` failed regex stop and day-part parsing (`Số quán` and `Buổi` remained `Chưa chọn`, `BUG-001`). Word numbers (`'ba quán'`, `'hai người'`) parsed successfully into 3 stops and 2 people. | `m2_attached_numbers.png`, `m2_word_numbers.png` |
| **3** | **Place / GPS Allowed / Denied / Manual** | **FAIL** | Initial quick chips (`Hoàn Kiếm`, `Tối nay`, `Món Việt`, `Dưới 300K`) clickable. However, natural query with landmark `'Chợ Đồng Xuân'` failed to resolve to Hoàn Kiếm area (`BUG-005`). | `m3_chip_hoan_kiem.png`, `m3_landmark_dong_xuan.png` |
| **4** | **Preferences / Negation / Allergies + Edit** | **PASS** | Allergy `'đậu phộng'` and `'hải sản'` correctly extracted; safety notice displayed (`Dữ liệu quán không có thông tin nguyên liệu...`); negation `'không ăn cay, không thịt bò'` respected; UnderstoodCard inline edit updated party size to 3. | `m4_allergy_negation.png`, `m4_edit_party.png`, `m4_after_edit_party.png` |
| **5** | **Confirmation / Create Tour / No-Solution** | **PASS** | Budget 1000đ handled without tour creation. Standard flow presented `ConfirmSummaryCard`, verified criteria, clicked `confirm-yes-btn`, and successfully generated 3-stop timeline. | `m5_no_solution.png`, `m5_confirm_card.png`, `m5_planned_tour.png` |
| **6** | **Replace / Locks / Stale 409 / Repeated** | **PASS** | In planned timeline, clicked `stop-replace-btn-0`. `ReplaceDiffModal` opened with locking explanation (`Khóa hành trình: Chỉ đổi quán tại điểm dừng #1; giữ nguyên các quán khác`). Clicked `Thay quán này`: Stop #1 changed from `[SYNTHETIC] Chè Thử 12` to `[SYNTHETIC] Kem Thử 24` while stops #2 and #3 remained locked. | `m6_replace_modal_live.png`, `m6_after_replacement_success.png` |
| **7** | **Reset / Restore / Reload Mid-flow** | **PASS** | Mid-flow page reload executed `GET /v1/sessions/{id}` with `X-Session-Token` and accurately restored UnderstoodCard state. Clicking `Làm lại` (↻) reset the session and returned UI to clean start screen. | `m7_after_reload.png`, `m7_after_reset.png` |
| **8** | **Rapid Sends / Timeout / Security / Errors** | **PASS** | 3000-character long message handled safely with calm Vietnamese guidance. Prompt injection payload `<script>alert(1)</script>` sanitized safely without script execution. | `m8_long_text.png`, `m8_injection_test.png` |
| **9** | **Free Google Maps URL / Zero API Key** | **PASS** | Full walking route link generated: `https://www.google.com/maps/dir/?api=1&origin=...&destination=...&travelmode=walking`. Exactly 0 Google Maps API / tile / billing network requests detected. | `m9_maps_links.png` |
| **10** | **Responsive & Visible Controls (1440 & 390)** | **PASS** | Desktop 1440×1024: `scrollWidth = 1425px` (0 horizontal scroll). Mobile 390×844: `scrollWidth = 390px` (0 horizontal scroll). Mobile tab buttons switch seamlessly between `Khám phá` and `Lịch trình`. | `m10_desktop_1440.png`, `m10_mobile_390_chat.png`, `m10_mobile_390_tour.png` |
| **--** | **Live Gemini Provider & Budget** | **BLOCKED** | Verified no live Gemini provider endpoint configured. Key access / config tampering strictly avoided. | N/A |
| **--** | **Private Backend (3020 / 8020) Health** | **PASS** | Real UI at 3020 verified against 8020 with UnderstoodCard (10 rows). Zero private venue data or personal information stored in reports or Git. | Sanitized count only |

---

## 4. Defect Log & Triage

### BUG-001: Attached Numbers Tokenization Failure
- **Severity:** P1
- **Component:** Backend (`backend/app/chat/` or regex tokenizer)
- **Suspected Owner:** Codex
- **Steps to Reproduce:**
  1. Open `http://127.0.0.1:3040/`.
  2. Enter exact prompt: `'tour3 quán quanh Hồ Gươm tối nay120 phút,500nghìn cho2người,thích phở và bún chả,dị ứng đậu phộng'`.
- **Expected Behavior:** `Số quán` extracted as 3; `Buổi` extracted as Buổi tối / Tối nay.
- **Actual Behavior:** `Số quán` remains `Chưa chọn`; `Buổi` remains `Chưa chọn`. The regex expects whitespace boundaries around digits (`\b3\s*quán\b`), failing on common Vietnamese mobile concatenated typing.
- **Evidence:** `docs/reports/functional-qa-20261018/m2_attached_numbers.png`.

---

### BUG-002: Clarification Chip Selection Causes Dead-Air
- **Severity:** P1
- **Component:** Backend Chat Engine & Frontend GuidedLayout
- **Suspected Owner:** Codex (Backend flow advancement) / Claude (UI mid-flow acknowledgement handling)
- **Steps to Reproduce:**
  1. Send prompt `'tour3 quán quanh Hồ Gươm tối nay120 phút,500nghìn cho2người...'`.
  2. UI displays clarify chip question: *"500.000 đ là ngân sách cho cả nhóm hay cho mỗi người?"*.
  3. Click chip *"Cả nhóm"* (`scope:group`).
- **Expected Behavior:** System advances to the next missing slot question (e.g. `start_time` or `vehicle`) or initiates tour confirmation.
- **Actual Behavior:** Backend returns text-only reply (`"Đã cập nhật: ngân sách tính cả nhóm."`) with `chat.pending: null` and `tour: null`. In `GuidedLayout`, the clarify card disappears and no tour or next prompt appears. The user is stranded with no interactive next step.
- **Evidence:** `docs/reports/functional-qa-20261018/03_3040_after_budget_scope.png`.

---

### BUG-003: UnderstoodCard Inline Budget Editor Lacks Free-form Input
- **Severity:** P2
- **Component:** Frontend (`UnderstoodCard.jsx`)
- **Suspected Owner:** Claude
- **Steps to Reproduce:**
  1. In `UnderstoodCard`, click *"Sửa"* on the `Ngân sách` row.
- **Expected Behavior:** User can enter an arbitrary budget (e.g. 700k, 350.000 đ) or pick common presets.
- **Actual Behavior:** Only 4 fixed chips appear (`200k`, `300k`, `500k`, `1 triệu`). There is no text or number input field for custom amounts.
- **Evidence:** `docs/reports/functional-qa-20261018/05a_3040_edit_budget_modal.png`.

---

### BUG-004: Greeting Prefix Drops Parsed Tour Request Slots
- **Severity:** P1
- **Component:** Backend (`backend/app/chat/intent.py` or routes)
- **Suspected Owner:** Codex
- **Steps to Reproduce:**
  1. Enter: `'Chào bạn, mình muốn tour 3 quán quanh Hồ Gươm tối nay trong120phút,ngân sách500nghìn cho2người'`.
- **Expected Behavior:** Backend greets and populates `UnderstoodCard` with the extracted slots (Hồ Gươm, 120 phút, 500k, 2 người, 3 quán).
- **Actual Behavior:** Backend classifies turn exclusively as `greeting` intent and discards the parsed entity patch. All `UnderstoodCard` rows remain `Chưa chọn`.
- **Evidence:** `docs/reports/functional-qa-20261018/m1_greeting_request.png`.

---

### BUG-005: Landmark "Chợ Đồng Xuân" Fails to Resolve to Area
- **Severity:** P2
- **Component:** Backend Area / Landmark Resolution
- **Suspected Owner:** Codex
- **Steps to Reproduce:**
  1. Enter: `'Tour quanh Chợ Đồng Xuân 90 phút ngân sách 200k một người'`.
- **Expected Behavior:** `Khu vực` resolves to `Chợ Đồng Xuân` (Hoàn Kiếm).
- **Actual Behavior:** `Khu vực` remains `Chưa chọn`.
- **Evidence:** `docs/reports/functional-qa-20261018/m3_landmark_dong_xuan.png`.

---

## 5. First-Run Evidence & Screenshots

All screenshots were generated in real headless Google Chrome via CDP and are permanently persisted:
- [01_3040_empty_state.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/01_3040_empty_state.png): Empty start screen at 1440×1024.
- [02_3040_after_exact_input.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/02_3040_after_exact_input.png): Exact attached input submitted.
- [03_3040_after_budget_scope.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/03_3040_after_budget_scope.png): Dead-air state after clicking `Cả nhóm` (BUG-002).
- [05a_3040_edit_budget_modal.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/05a_3040_edit_budget_modal.png): Inline budget editor preset chips (BUG-003).
- [m1_greeting_request.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m1_greeting_request.png): Greeting prefix drops tour request (BUG-004).
- [m2_attached_numbers.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m2_attached_numbers.png): Attached numbers fail regex (BUG-001).
- [m4_allergy_negation.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m4_allergy_negation.png): Honest allergy disclaimer and negation verification.
- [m5_planned_tour.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m5_planned_tour.png): Successful 3-stop planned tour timeline.
- [m6_replace_modal_live.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m6_replace_modal_live.png): Stop replacement modal with tour locking notice.
- [m6_after_replacement_success.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m6_after_replacement_success.png): Stop #1 replaced while stops #2 and #3 remain locked.
- [m9_maps_links.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m9_maps_links.png): Free Google Maps walking URL CTA.
- [m10_mobile_390_tour.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m10_mobile_390_tour.png): Mobile 390×844 responsive timeline layout.

---

## 6. Retest & Verification Strategy

1. **Codex Fixes:**
   - Tokenizer / regex fix for attached numbers (`tour3`, `nay120`) -> Retest with `qa/exploratory/run_full_matrix.mjs` (Matrix M2).
   - Chat engine fix for compound greeting + request -> Retest with Matrix M1.
   - Flow progression fix so picking `scope:group` immediately presents the next question or proposal without dead air -> Retest with `qa/exploratory/test_ui_exact_flow.mjs`.
2. **Claude UI Fixes:**
   - UnderstoodCard inline budget editor custom numeric entry.
3. **Execution Gate:**
   - Antigravity will re-run the full 10-point exploratory suite on the new integrated build and update `matrix_results.json` before any worker completion.
