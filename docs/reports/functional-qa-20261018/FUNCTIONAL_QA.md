# Functional Exploratory QA Report · AI FoodTour Planner

**Date:** 2026-10-18  
**QA Lead:** Antigravity (Independent Functional Exploratory QA)  
**Coordination:** Codex (Backend & Integration Owner)  
**UI Owner:** Claude (Visual & Layout Owner)  
**Target Baseline:** `0c332d6` (Frontend source `d828e68`)  
**Verified Previews:** Synthetic UI `http://127.0.0.1:3050` (API `8050`), Private Local UI `http://127.0.0.1:3051` (API `8051`)  
**Harness / Browser Automation:** Google Chrome Headless via Chrome DevTools Protocol (CDP) on isolated port 19700.

---

## 1. Executive Summary

1. **What Was Done:**
   - Conducted an independent, deep exploratory functional QA round on real running HTTP backends (`http://127.0.0.1:8020` private baseline, `http://127.0.0.1:8040` synthetic baseline, `http://127.0.0.1:8050` synthetic fixed preview, `http://127.0.0.1:8051` private fixed preview) and Next.js frontends (`3020`, `3040`, `3050`, `3051`).
   - Driven via real headless Google Chrome automation using Chrome DevTools Protocol (CDP) on dedicated port 19700. Purged `sessionStorage` and `localStorage` before every independent case to eliminate session contamination.
   - Tested the exact required user input: `'tour3 quán quanh Hồ Gươm tối nay120 phút,500nghìn cho2người,thích phở và bún chả,dị ứng đậu phộng'`, followed by clarification responses, budget edits, greeting variations, error simulations, and stop replacements.
   - Executed deep verification of edge cases: real out-of-band 409 revision conflicts, real offline network disconnection, strict Maps waypoint coordinates alignment, repeated stop replacements with persistent locks, keyboard focus traversal, and honest private local data constraints.

2. **What Was Found:**
   - **BUG-001 (P1, Codex - FIXED on 3050):** On baseline `0c332d6`, attached numbers without spaces (`'tour3 quán'`, `'nay120 phút'`) failed regex tokenization (`Số quán` and `Buổi` remained `Chưa chọn`). Verified **PASS** on fixed preview 3050 (extracted `Số quán: 3`, `Buổi: Buổi tối`).
   - **BUG-002 (P1, Codex/Claude - FIXED on 3050):** On baseline, picking clarification chip `Cả nhóm` (`scope:group`) left `chat.pending: null` in dead air. On 3050, picking `Cả nhóm` immediately presents the follow-up start-time question with chips (`18:00`, `19:00`, `20:00`).
   - **BUG-003 (P2, Claude):** UnderstoodCard inline budget editor provides only 4 preset chips (200k, 300k, 500k, 1 triệu) without an arbitrary numeric input field (routed to Claude UI).
   - **BUG-004 (P1, Codex - FIXED on 3050):** On baseline, greeting prefix in compound request (`'Chào bạn, mình muốn tour 3 quán...'`) dropped all parsed slots. Verified **PASS** on fixed preview 3050 (Hồ Gươm, 120 phút, 3 quán, 2 người preserved).
   - **BUG-005 (P2, Codex):** Natural landmark query `'Chợ Đồng Xuân'` failed to resolve to Hoàn Kiếm / Phố Cổ area without explicit district mention.
   - **BUG-006 (P1, Codex - NEW REPRODUCED):** Compound prompt with explicit `"không dị ứng gì"` (`'Tour ba quán quanh Hồ Gươm tối nay một tiếng rưỡi, năm trăm nghìn cả hội cho hai người, không dị ứng gì'`) parses preferences but leaves `chat.pending: null` without a clarify card. Follow-up input `'19h'` is rejected as `clarify_intent` (`"Bạn muốn mình làm gì trước?"`), start time remains `Chưa chọn`, and the tour is never proposed.
   - **Verified Core Features (PASS):** Real concurrent 409 conflict and auto-resync, real offline disconnection recovery with calm Vietnamese banner, repeated stop replacement with persistent locks on other stops, strict Google Maps URL waypoint coordinate order with walking mode, and honest private dataset constraint enforcement (`plan_conflict` when real venues cannot satisfy constraints).

3. **What's Left:**
   - Codex fix for `BUG-006` (compound no-allergy goal preservation) pending review/integration.
   - Claude fix for `BUG-003` (custom numeric entry in UnderstoodCard inline budget editor).
   - Final retest on integrated master build before formal sign-off.

---

## 2. Environment & Service Inventory

| Service | Port | Dataset / Mode | LLM Provider | Routing | Health Status | Verified Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Frontend (Baseline Private)** | `3020` | Next.js v15 | Calls 8020 | Calls 8020 | HTTP 200 OK | Loads `GuidedLayout`, renders UnderstoodCard with 10 rows. Zero private venue rows captured. |
| **Backend (Baseline Private)** | `8020` | Authorized Local Private Data | `mock` / `rules` | `estimate` | `{"status":"ok","dataset_source":"private"}` | Responsive; strict session token gate enforced. |
| **Frontend (Baseline Synthetic)** | `3040` | Frozen copy `d828e68` | Calls 8040 | Calls 8040 | HTTP 200 OK | Used for initial baseline bug reproduction (BUG-001, BUG-002, BUG-004). |
| **Backend (Baseline Synthetic)** | `8040` | `venues.chat.synthetic.json` | `mock` / `rules` | `estimate` | `{"status":"ok","dataset_source":"synthetic"}` | Clean synthetic fixture backend for public durable screenshots. |
| **Frontend (Fixed Preview Synthetic)** | `3050` | Source `8d3a379` | Calls 8050 | Calls 8050 | HTTP 200 OK | Retested BUG-001 (PASS) & BUG-004 (PASS); reproduced BUG-006. |
| **Backend (Fixed Preview Synthetic)** | `8050` | `venues.chat.synthetic.json` | `mock` / `rules` | `estimate` | `{"status":"ok","dataset_source":"synthetic"}` | Verified backend fix for numeric prefix & greeting context. |
| **Frontend (Fixed Preview Private)** | `3051` | Source `8d3a379` | Calls 8051 | Calls 8051 | HTTP 200 OK | Verified full conversational flow against private local dataset. |
| **Backend (Fixed Preview Private)** | `8051` | Authorized Local Private Data | `mock` / `rules` | `estimate` | `{"status":"ok","dataset_source":"private"}` | Enforces honest hard constraints (`plan_conflict` when venues insufficient). |
| **CDP Automation** | `19700` | Isolated Chrome User Data | N/A | N/A | Free before launch | Headless Chrome 1440×1024 and 390×844 automation. |

> **Live Gemini Provider Audit:** All backends explicitly report `llm: "mock"`, `llm_provider: "rules"`, and `llm_budget: null`. Zero API keys or live credentials were accessed. Live Gemini is recorded as **BLOCKED** due to lack of an active configured live endpoint/budget proof.

---

## 3. Comprehensive Matrix & Deep Subcases

### 3.1 Mandatory 10-Domain Functional Matrix

| # | Domain / Feature | Status | Case-Level Concrete Evidence | Durable Screenshot |
| :-: | :--- | :---: | :--- | :--- |
| **1** | **Greetings & Multi-turn Context** | **FAIL (Baseline) / PASS (3050)** | Baseline `3040`: `'Chào bạn, mình muốn tour 3 quán...'` dropped all slots (`BUG-004`). Retested on fixed `3050`: `Hồ Gươm`, `120 phút`, `3 quán`, `2 người` all positively preserved in `UnderstoodCard`. Pure greeting (`'Xin chào'`) responds cleanly. | `m1_greeting_request.png`, `retest_3050_greeting_request.png` |
| **2** | **Attached / Word Numbers & Budgets** | **FAIL (Baseline) / PASS (3050)** | Baseline `3040`: Attached numbers `'tour3 quán... tối nay120 phút'` failed regex (`Số quán` and `Buổi` remained `Chưa chọn`, `BUG-001`). Retested on fixed `3050`: Positive assertions confirmed `Số quán: 3`, `Buổi: Buổi tối`, `Tổng thời gian: 120 phút`. Word numbers (`'ba quán'`, `'hai người'`) parse accurately. | `m2_attached_numbers.png`, `retest_3050_attached_numbers.png` |
| **3** | **Place / GPS Allowed / Denied / Manual** | **FAIL (Landmark) / NOT TESTED (GPS)** | Quick chip `Hoàn Kiếm` and manual address (`'12 Tràng Thi, Hoàn Kiếm'`) resolve origin correctly. Landmark `'Chợ Đồng Xuân'` failed to resolve area (`BUG-005`). Application UI implements no HTML5 Geolocation button; GPS permission marked **NOT TESTED / UNSUPPORTED**. | `m3_chip_hoan_kiem.png`, `m3_manual_address.png` |
| **4** | **Preferences / Negation / Allergies + Edit** | **PASS** | Allergy `'đậu phộng'` and `'hải sản'` extracted; honest disclaimer notice displayed (`Dữ liệu quán không có thông tin nguyên liệu...`); negation `'không ăn cay, không thịt bò'` respected; UnderstoodCard inline edit updated party size to 3. | `m4_allergy_negation.png`, `m4_after_edit_party.png` |
| **5** | **Confirmation / Create Tour / No-Solution** | **PASS** | Budget 1000đ handled without tour creation. Standard flow presented `ConfirmSummaryCard`, verified criteria, clicked `confirm-yes-btn`, and successfully generated 3-stop timeline. | `m5_no_solution.png`, `m5_planned_tour.png` |
| **6** | **Replace / Locks / Stale 409 / Repeated** | **PASS** | 1. Stop replacement modal opened with locking notice. Clicked `Thay quán này`: Stop #1 changed from `[SYNTHETIC] Chè Thử 12` to `[SYNTHETIC] Kem Thử 24` while stops #2 and #3 remained locked.<br>2. Repeated replacement on Stop #1 changed it to a third candidate while stops #2 and #3 remained locked.<br>3. Real concurrent 409 conflict: out-of-band mutation advanced revision on backend -> stale UI confirm click triggered 409 network response -> UI triggered `GET /v1/sessions` auto-resync -> cashew allergy restored. | `m6_replace_modal_live.png`, `m6_after_replacement_success.png`, `m6_real_409_conflict_observed.png`, `m6_repeated_replace_verified.png` |
| **7** | **Reset / Restore / Reload Mid-flow** | **PASS** | Mid-flow page reload executed `GET /v1/sessions/{id}` with `X-Session-Token` and accurately restored UnderstoodCard state. Clicking `Làm lại` (↻) reset the session and returned UI to clean start screen. | `m7_after_reload.png`, `m7_after_reset.png` |
| **8** | **Rapid Sends / Timeout / Security / Errors** | **PASS** | 1. 3000-character long message handled safely with calm Vietnamese guidance.<br>2. Prompt injection payload `<script>alert(1)</script>` sanitized safely without script execution.<br>3. Real offline network disconnection (CDP `Network.emulateNetworkConditions` offline: true) triggered calm Vietnamese error banner and retry button (`guided-error-retry-btn`), with zero raw JS error leakage. | `m8_long_text.png`, `m8_injection_test.png`, `m8_offline_calm_error.png` |
| **9** | **Free Google Maps URL / Zero API Key** | **PASS** | Strict waypoint coordinate check against session tour stops: `origin = 21.0263,105.8522` (Stop 0), `waypoints = 21.0274,105.8509` (Stop 1), `destination = 21.0296,105.8483` (Stop 2). Walking mode (`travelmode=walking`) verified; exactly 0 Google Maps API / billing requests. | `m9_maps_links.png`, `m9_strict_stop_order.png` |
| **10** | **Responsive & Visible Controls (1440 & 390)** | **PASS** | 1. Desktop 1440×1024: `scrollWidth = 1425px` (0 horizontal scroll). Mobile 390×844: `scrollWidth = 390px` (0 horizontal scroll). Tab navigation switches cleanly between `Khám phá` and `Lịch trình`.<br>2. Keyboard focus traversal: Tab key from composer focuses Send button (`BUTTON [data-testid="guided-send-btn"]`) with active outline. | `m10_desktop_1440.png`, `m10_mobile_390_tour.png`, `m10_keyboard_traversal.png` |

---

### 3.2 Deep Rigorous Subcase Results (`rigorous_subcases.json`)

| Subcase ID | Test Scenario | Target URL | Measured Outcome | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **CASE-1** | Compound No-Allergy Prompt Flow | `http://127.0.0.1:3050` | **FAIL (BUG-006)**: Explicit `"không dị ứng gì"` causes empty pending; follow-up `'19h'` is rejected as `clarify_intent`, start time remains `Chưa chọn`, and tour is never proposed. | `bug006_no_allergy_initial.png`, `bug006_no_allergy_after_19h.png` |
| **CASE-2** | Retest BUG-001 on Fixed Preview | `http://127.0.0.1:3050` | **PASS**: Positive exact checks: 3 stops (`true`), evening (`true`), 120m (`true`), party 2 (`true`), Hồ Gươm (`true`). | `retest_3050_attached_numbers.png` |
| **CASE-3** | Retest BUG-004 on Fixed Preview | `http://127.0.0.1:3050` | **PASS**: Positive exact checks: Hồ Gươm (`true`), 3 stops (`true`), 120m (`true`), party 2 (`true`). | `retest_3050_greeting_request.png` |
| **CASE-4** | Real Concurrent 409 Conflict & Auto-Resync | `http://127.0.0.1:3050` | **PASS**: Observed 409 on stale UI confirm (`true`); GET resync executed (`true`); Cashew allergy restored (`true`). | `m6_real_409_conflict_observed.png` |
| **CASE-5** | Real Offline Network Disconnection | `http://127.0.0.1:3050` | **PASS**: Calm Vietnamese message (`true`); No raw JS error leaked (`true`); Retry button present (`true`). | `m8_offline_calm_error.png` |
| **CASE-6** | Strict Google Maps URL Stop Order Alignment | `http://127.0.0.1:3050` | **PASS**: Origin match (`21.0263,105.8522`); Dest match (`21.0296,105.8483`); Waypoints match (`21.0274,105.8509`); Walking mode (`true`); No API key (`true`). | `m9_strict_stop_order.png` |
| **CASE-7** | Repeated Stop Replacement & Persistent Locking | `http://127.0.0.1:3050` | **PASS**: Stop 0 changed on 1st replace (`true`); Stop 0 changed on 2nd replace (`true`); Stop 1 locked across both (`true`); Stop 2 locked across both (`true`). | `m6_repeated_replace_verified.png` |
| **CASE-8** | Keyboard Focus Traversal to Interactive Controls | `http://127.0.0.1:3050` | **PASS**: Tab from composer focuses Send button (`BUTTON [data-testid="guided-send-btn"]`) with active focus ring. | `m10_keyboard_traversal.png` |
| **CASE-9** | Browser Geolocation / GPS Capability Status | `http://127.0.0.1:3050` | **NOT TESTED**: UI does not implement an HTML5 Geolocation button (`hasGpsInvoke: false`). Manual landmark/address is the supported mode. | N/A |
| **CASE-10** | Private Preview 3051 Full E2E Flow | `http://127.0.0.1:3051` | **PASS**: UnderstoodCard (`true`, 10 rows); Confirm card (`true`); Honest Tour/No-Solution Gate (`true`: returns explicit `plan_conflict` warning when venues insufficient, refusing to invent fake tours). Zero private venue data exposed. | Aggregate booleans only |

---

## 4. Defect Log & Triage

### BUG-001: Attached Numbers Tokenization Failure
- **Severity:** P1
- **Component:** Backend (`backend/app/chat/` regex tokenizer)
- **Status:** **FIXED** on preview build `8d3a379` (`http://127.0.0.1:3050`).
- **Steps:** Send `'tour3 quán quanh Hồ Gươm tối nay120 phút,500nghìn cho2người,thích phở và bún chả,dị ứng đậu phộng'`.
- **Baseline Behavior:** `Số quán` and `Buổi` remained `Chưa chọn`.
- **Fixed Behavior:** `Số quán: 3`, `Buổi: Buổi tối`, `Tổng thời gian: 120 phút` extracted positively.
- **Evidence:** `retest_3050_attached_numbers.png`.

---

### BUG-002: Clarification Chip Selection Causes Dead-Air
- **Severity:** P1
- **Component:** Backend Chat Engine & Frontend GuidedLayout
- **Status:** **FIXED** on preview build `8d3a379` (`http://127.0.0.1:3050`).
- **Steps:** Send S0 prompt -> Click chip *"Cả nhóm"* (`scope:group`).
- **Baseline Behavior:** Backend returned text-only reply with `chat.pending: null`; UI clarify card disappeared with no next prompt.
- **Fixed Behavior:** System immediately advances to `start_time` question with chips (`18:00`, `19:00`, `20:00`).

---

### BUG-003: UnderstoodCard Inline Budget Editor Lacks Free-form Input
- **Severity:** P2
- **Component:** Frontend (`UnderstoodCard.jsx` / `InlineRowEditor.jsx`)
- **Status:** **OPEN** (Routed to Claude UI owner).
- **Steps:** In `UnderstoodCard`, click *"Sửa"* on `Ngân sách` row.
- **Actual Behavior:** Only 4 fixed preset chips appear (`200k`, `300k`, `500k`, `1 triệu`) without arbitrary numeric input field.
- **Evidence:** `05a_3040_edit_budget_modal.png`.

---

### BUG-004: Greeting Prefix Drops Parsed Tour Request Slots
- **Severity:** P1
- **Component:** Backend (`backend/app/chat/intent.py`)
- **Status:** **FIXED** on preview build `8d3a379` (`http://127.0.0.1:3050`).
- **Steps:** Send `'Chào bạn, mình muốn tour 3 quán quanh Hồ Gươm tối nay trong120phút,ngân sách500nghìn cho2người'`.
- **Baseline Behavior:** All `UnderstoodCard` slots remained `Chưa chọn`.
- **Fixed Behavior:** Positively extracts Hồ Gươm, 120 phút, 3 quán, 2 người.
- **Evidence:** `retest_3050_greeting_request.png`.

---

### BUG-005: Landmark "Chợ Đồng Xuân" Fails to Resolve to Area
- **Severity:** P2
- **Component:** Backend Area / Landmark Resolution (Coverage Limitation)
- **Status:** **OPEN** (Codex).
- **Steps:** Send `'Tour quanh Chợ Đồng Xuân 90 phút ngân sách 200k một người'`.
- **Actual Behavior:** `Khu vực` remains `Chưa chọn` because gazetteer lacks Đồng Xuân landmark and geocoder is disabled per project rules.
- **Evidence:** `m3_landmark_dong_xuan.png`.

---

### BUG-006: Explicit "Không Dị Ứng Gì" Drops Tour Goal
- **Severity:** P1
- **Component:** Backend Engine (`backend/app/chat/engine.py`)
- **Status:** **OPEN** (Codex fix candidate `7f05832` pending integration).
- **Steps to Reproduce:**
  1. Open fresh session on `http://127.0.0.1:3050/`.
  2. Send prompt: `'Tour ba quán quanh Hồ Gươm tối nay một tiếng rưỡi, năm trăm nghìn cả hội cho hai người, không dị ứng gì'`.
  3. Observe Turn 1 response.
  4. Send follow-up: `'19h'`.
- **Expected Behavior:** System recognizes tour goal, registers `allergies: []`, and prompts for start time or proposes candidate venues.
- **Actual Behavior:** Turn 1 registers preferences (`Khu vực: Chưa chọn`, `Số người: 2`, `Số quán: 3`, `90 phút`, `500k cả nhóm`) but leaves `chat.pending: null` with no clarify card. Sending `'19h'` is rejected as `clarify_intent` (`"Bạn muốn mình làm gì trước?"`), start time remains `Chưa chọn`, and the tour proposal is completely dropped.
- **Evidence:** `bug006_no_allergy_initial.png`, `bug006_no_allergy_after_19h.png`.

---

## 5. Durable Screenshots & Provenance

All screenshots were captured in real headless Google Chrome via Chrome DevTools Protocol (CDP) on port 19700 and are permanently committed:
- [`01_3040_empty_state.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/01_3040_empty_state.png): Empty start screen at 1440×1024.
- [`02_3040_after_exact_input.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/02_3040_after_exact_input.png): Exact attached input submitted.
- [`03_3040_after_budget_scope.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/03_3040_after_budget_scope.png): Dead-air state after clicking `Cả nhóm` (BUG-002 on baseline).
- [`05a_3040_edit_budget_modal.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/05a_3040_edit_budget_modal.png): Inline budget editor preset chips (BUG-003).
- [`m1_greeting_request.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m1_greeting_request.png): Greeting prefix drops tour request (BUG-004 on baseline).
- [`m2_attached_numbers.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m2_attached_numbers.png): Attached numbers fail regex (BUG-001 on baseline).
- [`retest_3050_attached_numbers.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/retest_3050_attached_numbers.png): Retest of BUG-001 on fixed build 3050 (PASS).
- [`retest_3050_greeting_request.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/retest_3050_greeting_request.png): Retest of BUG-004 on fixed build 3050 (PASS).
- [`bug006_no_allergy_initial.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/bug006_no_allergy_initial.png): Reproduction of BUG-006 Turn 1 dead-air state.
- [`bug006_no_allergy_after_19h.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/bug006_no_allergy_after_19h.png): Reproduction of BUG-006 Turn 2 rejected start time.
- [`m6_real_409_conflict_observed.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m6_real_409_conflict_observed.png): Real concurrent 409 revision conflict and auto-resync in UI.
- [`m6_repeated_replace_verified.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m6_repeated_replace_verified.png): Repeated stop replacement with persistent locks on stops #2 and #3.
- [`m8_offline_calm_error.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m8_offline_calm_error.png): Real offline network disconnection handling and retry button.
- [`m9_strict_stop_order.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m9_strict_stop_order.png): Strict Google Maps URL waypoint coordinate alignment.
- [`m10_keyboard_traversal.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m10_keyboard_traversal.png): Real keyboard focus traversal with visible outline.
- [`m10_mobile_390_tour.png`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/functional-qa-20261018/m10_mobile_390_tour.png): Mobile 390×844 responsive timeline layout.
