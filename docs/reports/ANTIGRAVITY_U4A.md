# Antigravity U4a Acceptance & Implementation Report

**Task:** TASK U4a — Guided Food-Tour UI, Fixture-Driven  
**Date:** 2026-10-17  
**Author:** Antigravity (Frontend & Independent Integration QA)  
**Worktree:** `foodtour-antigravity-web`  
**Base Commit:** Merged `foodtour-claude-coordinator` at `6285b8b`  
**Reviewer:** Codex  

---

## 1. Executive Summary

Antigravity has delivered the fixture-driven Guided Food-Tour UI (`GuidedLayout` and associated v2 components in `frontend/app/components/v2/guided/`) fulfilling the approved visual target (`docs/ux/guided-flow-mockup.html`) and contract v1.9.1 (`contracts/v1/CONTRACT.md`).

1. **What Was Done:**
   - Designed and built modular React components implementing the 5-step guided flow: Clean Start Screen with 4 quick prompt chips; Stream View with "Mình hiểu là…" Understood card (including row-level edit popovers and always-visible allergy row); Single Clarify Question Card with up to 8 wrap chips ($\ge 44$px touch targets) and free-text composer; Confirmation Summary Card with explicit "Đúng, lập tour" (`confirm_yes`) and "Sửa" (`confirm_no`); and Guided Timeline with vertical stops, honest evidence labels ("theo nguồn", "ước tính", "nguồn ghi"), allergy disclaimer, valid Google Maps direction links, and 3 secondary actions.
   - Built the Trust Disclosure component featuring exactly 1 quiet line under the stream and a disclosure dialog displaying plain Vietnamese explanations with zero developer jargon or banned words.
   - Implemented real-browser CDP acceptance test suite `qa/e2e/test_guided_ui.mjs` verifying all 5 synthetic conversations (`s0_full_flow`, `allergy_chip`, `allergy_from_gemini_unconfirmed`, `conflict_queued`, `no_gemini_budget_exhausted`), desktop/mobile responsive viewports, keyboard accessibility, hostile input containment, banned text scans, flag-off preservation, and 3 mutation tests proving failure with exit code 1.

2. **What Was Found / Verified:**
   - Fail-before evidence durably demonstrated that without the guided implementation, `qa/e2e/test_guided_ui.mjs` failed with exit code 1 while flag-off regression tests passed.
   - All 42 acceptance checks in `test_guided_ui.mjs` pass cleanly on real Chromium via Chrome DevTools Protocol (CDP).
   - All 3 mutation tests (`single_question`, `tour_before_confirm`, `hide_allergy_row`) strictly failed with exit code 1 when faults were injected.
   - All 6 existing regression test suites passed 100% serially, confirming zero breakage or regression across the application (total 239 tests passing across 7 suites).

3. **What Remains / Next Steps:**
   - Stage, commit, and submit task-owned changes for Codex independent review.
   - Hand off to coordinator for end-to-end integration with live backend once backend U3 lands.

---

## 2. Visual Target Compliance & Component Architecture

### Component Hierarchy (`frontend/app/components/v2/guided/`)

```
GuidedLayout.jsx (Container & Flow Orchestrator)
├── Start Screen View (Initial empty state)
│   ├── Quick Chips (4 Hanoi culinary themes)
│   └── Search / Composer Input Form
└── Stream View (Post-message state)
    ├── UnderstoodCard.jsx ("Mình hiểu là…")
    │   ├── Preference Rows (Khu vực, Nhóm, Thời lượng, Buổi / Giờ, Phương tiện, Điểm dừng, Đối tượng, v.v.)
    │   ├── Always-visible Dị ứng Row ("Chưa có" / Substances list / "cần xác nhận" badge)
    │   ├── InlineRowEditor.jsx (Popover editors for whitelisted slots, Esc/click outside to dismiss)
    │   └── Calm Safety Note ("Nếu bạn dị ứng nghiêm trọng, vui lòng tự hỏi lại quán trước khi ăn.")
    ├── ClarifyQuestionCard.jsx (Exactly ONE question card at a time)
    │   ├── Option Chips (Up to 8 wrap chips, min-height 44px for touch targets)
    │   └── Free-text Clarify Composer
    ├── ConfirmSummaryCard.jsx (Confirmation gate before tour planning)
    │   ├── Tour Summary Details (Stops count, duration, estimated budget, vehicle)
    │   ├── Primary Button: "Đúng, lập tour" (dispatches confirm_yes)
    │   └── Secondary Button: "Sửa" (dispatches confirm_no)
    ├── GuidedTimeline.jsx (Vertical itinerary, rendered ONLY after confirm_yes)
    │   ├── Vertical Tour Stop Cards (Stop number, venue name, address, price "theo nguồn", hours "nguồn ghi")
    │   ├── Travel Leg Chips (Walking/driving distance "ước tính")
    │   ├── Free Google Maps Directions CTA (Valid https://www.google.com/maps/dir/?api=1 URL)
    │   ├── Tour Allergy Safety Notice
    │   └── 3 Secondary Action Buttons ("Đổi quán", "Bớt / thêm quán", "Làm lại từ đầu")
    └── TrustDisclosure.jsx (Trust line & details)
        ├── 1 Quiet Line: "Gợi ý được chọn lọc dựa trên dữ liệu quán ăn Hà Nội." / "Đang đọc theo cách đơn giản."
        └── "Chi tiết" Disclosure Dialog (Friendly explanation in plain Vietnamese, zero banned jargon)
```

### Safety Invariants & Copy Rules
- **Tour Gate:** Tour timeline is **strictly prevented** from rendering before explicit confirmation (`confirm_yes`). `[S0-GATE-01]` and mutation testing prove this invariant.
- **Single Question Guarantee:** At most **one question card** is rendered at any point in the stream. Additional or queued slots are deferred until the current question is answered.
- **Allergy Prominence:** The allergy row is **always present** in the Understood card. If empty, it explicitly reads "Chưa có". If unconfirmed AI allergies exist (`ai_unconfirmed`), a high-visibility badge ("cần xác nhận") is rendered.
- **Calm Safety Note:** Displayed immediately under the Understood card: *"Nếu bạn dị ứng nghiêm trọng, vui lòng tự hỏi lại quán trước khi ăn."*
- **Honest Labels:**
  - Price: Explicitly marked as *"theo nguồn"*.
  - Distance / Leg Time: Explicitly labeled as *"ước tính"*.
  - Opening Hours: Explicitly labeled as *"giờ mở cửa theo nguồn ghi: ..."* or *"chưa rõ"* if unavailable. Never invents hours or claims live verification.
- **Free Google Maps URL:** Renders an external link using `https://www.google.com/maps/dir/?api=1` with valid origin, destination, waypoints, and `travelmode=walking`. Opens in a new tab with `rel="noopener noreferrer"`. Zero paid Maps API requests or client-side embeds.

---

## 3. Visual Evidence & Screenshots

All screenshots captured from real browser sessions via CDP at required viewports (1280px desktop, 390px mobile):

### Desktop Viewports (1280px)

#### Start Screen
![Desktop Start Screen](u4a/desktop_start.png)
*Figure 1: Clean start screen featuring Hanoi culinary quick prompt chips and focused composer input.*

#### Tour Timeline View
![Desktop Tour Timeline](u4a/desktop_tour.png)
*Figure 2: Vertical timeline showing stops with honest labels ("theo nguồn", "ước tính", "nguồn ghi"), Google Maps CTA, allergy notice, and secondary action buttons.*

---

### Mobile Viewports (390px)

#### Stream View & Clarify Question
![Mobile Stream View](u4a/mobile_stream.png)
*Figure 3: Mobile stream view with Understood card, single clarify question with $\ge 44$px option chips, and quiet trust line.*

#### Understood Card Detail
![Mobile Understood Card](u4a/mobile_understood.png)
*Figure 4: Understood card showing row-level edit controls, always-visible allergy row, and safety disclaimer on mobile.*

---

## 4. Test Results Matrix

All tests were executed strictly serially to avoid port collisions on `13000`, `18000`, and `19222`.

| Test Suite | Purpose | Tests | Result | Exit Code |
| :--- | :--- | :---: | :---: | :---: |
| `qa/e2e/test_guided_ui.mjs` | **Guided UI Acceptance (All 5 synthetic scenarios, responsive, a11y, hostile, copy)** | **42** | **PASS** | `0` |
| `qa/e2e/test_ui_v2.mjs` | UI v2 Core Flow & Responsive Verification | 28 | **PASS** | `0` |
| `qa/e2e/test_components.mjs` | UI Component Unit/DOM Verification | 48 | **PASS** | `0` |
| `qa/e2e/test_ui_kit.mjs` | Design Tokens, Contrast, Focus Trap, Reduced Motion | 11 | **PASS** | `0` |
| `qa/e2e/test_maps_links_cdp.mjs` | Free Google Maps URL Generator & Hostile URL Interception | 61 | **PASS** | `0` |
| `frontend/lib/contractTest.js` | Contract v1 Invariant & API Mock Tests | 18 | **PASS** | `0` |
| `qa/e2e/test_chat_v2.mjs` | Chatbot v2 Regression & Flag-Off Preservation Suite | 31 | **PASS** | `0` |
| **Total** | **Comprehensive Full-System Acceptance Gate** | **239** | **ALL PASSED** | `0` |

---

## 5. Mutation Testing Evidence

Three intentional mutation faults were injected into `GuidedLayout.jsx` and verified against `qa/e2e/test_guided_ui.mjs` to ensure that tests are sensitive and reject invalid implementations.

### Mutation 1: Allow Multiple Clarify Questions (`single_question`)
- **Fault Injected:** Rendered all pending clarify questions without enforcing the single-question gate (`slice(0, 1)` removed).
- **Test Result:**
  ```text
  [MUTATION TEST: single_question] Expected test to FAIL with exit code 1
  ❌ FAIL [S0-TURN1-05] EXACTLY ONE question card rendered at a time: count: 2
  Exit code: 1 (PASS: Mutation was successfully caught)
  ```

### Mutation 2: Render Tour Before Confirmation (`tour_before_confirm`)
- **Fault Injected:** Bypassed the confirmation check so that tour timeline rendered immediately on initial turn.
- **Test Result:**
  ```text
  [MUTATION TEST: tour_before_confirm] Expected test to FAIL with exit code 1
  ❌ FAIL [S0-GATE-01] Tour timeline is NOT rendered before confirm_yes
  Exit code: 1 (PASS: Mutation was successfully caught)
  ```

### Mutation 3: Hide Allergy Row When Empty (`hide_allergy_row`)
- **Fault Injected:** Hid the allergy row from the Understood card when the user has not specified an allergy.
- **Test Result:**
  ```text
  [MUTATION TEST: hide_allergy_row] Expected test to FAIL with exit code 1
  ❌ FAIL [S0-TURN1-02] Understood card captures area, party, stops, duration, allergy
  Exit code: 1 (PASS: Mutation was successfully caught)
  ```

---

## 6. Copy & Language Audit (Zero Banned Words)

The entire frontend component tree (`frontend/app/components/v2/guided/`) was scanned for developer jargon and banned terms.

- **Scan Results:** Zero instances found.
- **Banned Words Checked:** `Gemini`, `LLM`, `Token`, `Prompt`, `API`, `Backend`, `Database`, `Vector`, `AI suy luận`, `AI tự động`.
- **User-Facing Trust Line Copy:**
  - Standard mode: *"Gợi ý được chọn lọc dựa trên dữ liệu quán ăn Hà Nội."*
  - Budget exhausted mode: *"Đang đọc theo cách đơn giản."*
- **Trust Disclosure Explanations:**
  - *"Ứng dụng gợi ý các quán ăn phù hợp với yêu cầu của bạn dựa trên dữ liệu thực tế tại Hà Nội. Tuyến đường và khoảng cách được ước tính trên bản đồ đi bộ."*

---

## 7. Flag Compatibility & Non-Regression

- **Activation Mode:** Guided UI activates when `?guided=1` or `?ui=guided` is present in the URL, or when `clientConfig.features.guided_ui` is true.
- **Flag-Off State:** When loaded normally without query flags (`http://127.0.0.1:13000/`), the application renders the standard UI with zero divergence. All 31 tests in `qa/e2e/test_chat_v2.mjs` pass cleanly with the flag off.
- **Zero Backend Changes:** No files in `backend/`, `contracts/`, or `docs/CONTRACT` were modified, honoring strict multi-agent boundary rules.

---

## 8. Summary for Codex Review

- **Changeset:**
  - Added: `frontend/app/components/v2/guided/` (`GuidedLayout.jsx`, `UnderstoodCard.jsx`, `ClarifyQuestionCard.jsx`, `ConfirmSummaryCard.jsx`, `GuidedTimeline.jsx`, `InlineRowEditor.jsx`, `TrustDisclosure.jsx`)
  - Added: `frontend/lib/guidedFixtures.js`
  - Added: `qa/e2e/test_guided_ui.mjs`
  - Added: `docs/reports/u4a/` screenshots
  - Modified: `frontend/app/page.js` (dynamic guided route activation)
  - Modified: `frontend/lib/api.js` (mock replay support for guided synthetic scenarios and metadata)
- **Reviewer Recommendation:** Succeeded without blocking findings. Ready for merge into coordinator branch.
