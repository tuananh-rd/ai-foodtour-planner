# QA Report C6j — ProfileBar Budget Unit Tamper Rejection & Max-Leg Editor Delivery

**Date:** 2026-10-17  
**Agent:** Antigravity (Frontend & Independent Integration QA)  
**Branch:** `foodtour-antigravity-web`  
**Reviewer:** Codex / Claude  
**Reference Report:** `docs/reports/CODEX_C6_FINAL_3.md`

---

## 1. Executive Summary

In Task C6j, Antigravity resolved the final two findings identified in Codex's C6-final-3 review (`docs/reports/CODEX_C6_FINAL_3.md`):
1. **ProfileBar Budget Unit Tamper Rejection:** Removed `parseInt(budgetUnit, 10) || 1000` fallback entirely. Enforced strict validation against the exact offered options: đồng (`1`), nghìn (`1000`), triệu (`1000000`). Any tampered or unknown option value displays an inline Vietnamese error alert (`[data-testid="profile-edit-error"]`) and sends zero network requests. Tested with failing-first evidence replicating Codex's DOM tampering method.
2. **Max-Leg Production Chip & Editor:** Added the production chip (`data-testid="chip-profile-max-leg"`) displaying `"Đi bộ tối đa mỗi chặng: N phút"` (or `"Đi bộ tối đa mỗi chặng: chưa đặt"` when missing) with source badge and styling, opening the existing 3..60 editor. Real-API CDP E2E verification proves boundary values 2 and 61 are blocked inline with zero requests, values 3, 10, and 60 are accepted with HTTP 200, and the chip persists and reflects `chat.state.profile.max_leg_min` after full page reload mid-session.
3. **Whole Gate Verification:** Executed the complete test gate serially on dedicated ports (13000/18000/19222 and 13100/18100/19300). All test suites passed (`test_chat_v2`: 31/31, `test_components`: 48/48, `contractTest`: 18/18, `test_ui_v2`: 28/28, `test_ui_kit`: 11/11, `test_maps_links_cdp`: 61/61). All four scratch mutation checks (`allergy`, `fallback`, `guard`, `budget`) built cleanly and failed the intended assertions with exit code 1.

---

## 2. Technical Implementation Details

### 2.1 ProfileBar Budget Unit Strict Validation (`frontend/app/components/v2/chat/ProfileBar.jsx`)
- **Root cause in C6-final-3:** Line 239 previously used `const unitNum = parseInt(budgetUnit, 10) || 1000;`. When a user or test tampered the option value to `'garbage'`, `parseInt` produced `NaN`, which silently defaulted to `1000`, altering the meaning of the input without user awareness or server error.
- **Fix:**
  ```javascript
  const ALLOWED_BUDGET_UNITS = {
    '1': 1,
    '1000': 1000,
    '1000000': 1000000,
  };
  const rawUnit = String(budgetUnit);
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_BUDGET_UNITS, rawUnit)) {
    setErrorMsg('Đơn vị tiền tệ không hợp lệ. Vui lòng chọn đồng, nghìn hoặc triệu.');
    return;
  }
  const unitNum = ALLOWED_BUDGET_UNITS[rawUnit];
  ```
- **Guarantees:**
  - Zero requests sent if unit is tampered or unknown.
  - User receives inline Vietnamese error: `"⚠️ Đơn vị tiền tệ không hợp lệ. Vui lòng chọn đồng, nghìn hoặc triệu."`
  - Dialog remains open to let user correct selection.
  - Zero `parseInt(...)||1000` fallback anywhere in profile editors.

### 2.2 Max-Leg Chip & Editor Accessibility (`frontend/app/components/v2/chat/ProfileBar.jsx`)
- **Root cause in C6-final-3:** The editor logic and 3..60 range validation for `max_leg_min` were implemented in `ProfileBar.jsx`, but no rendered button/chip called `handleOpenEdit('max_leg_min', ...)`.
- **Fix:**
  - Added text formatter:
    ```javascript
    const maxLegText = profile.max_leg_min?.value !== null && profile.max_leg_min?.value !== undefined && profile.max_leg_min?.value !== ''
      ? `${profile.max_leg_min.value} phút`
      : 'chưa đặt';
    ```
  - Added production chip button placed between vehicle and tastes chips:
    ```jsx
    {/* Max Leg Chip */}
    <button
      type="button"
      disabled={busy}
      data-testid="chip-profile-max-leg"
      data-testid-alt="chip-profile-max_leg_min"
      onClick={(e) => handleOpenEdit('max_leg_min', maxLegText, e)}
      style={getChipStyle(profile.max_leg_min)}
    >
      <span>⏱️</span>
      <span>Đi bộ tối đa mỗi chặng: <strong>{maxLegText}</strong></span>
      {getSourceBadge(profile.max_leg_min?.source)}
    </button>
    ```
  - Enhanced `handleOpenEdit` to parse both string and numeric existing values:
    ```javascript
    } else if (fieldKey === 'max_leg_min') {
      const existingLeg = profile.max_leg_min?.value;
      const num = Number(existingLeg);
      setMaxLeg(!isNaN(num) && num >= 3 && num <= 60 ? num : 15);
    }
    ```
  - Added `noValidate` to dialog `<form>`: allows React validation handler to execute on submit and set explicit inline Vietnamese error alerts (`[data-testid="profile-edit-error"]`) while maintaining HTML5 constraint validity checks (`input.checkValidity()`).

---

## 3. Test Evidence

### 3.1 Failing-First Verification
Prior to applying the `ProfileBar.jsx` fix, the new assertions were added to `qa/e2e/test_chat_v2.mjs` and executed:
```
❌ FAIL [CH-13c-BUDGET-UNIT-TAMPER] ProfileBar budget unit rejects tampered unit value with inline Vietnamese error and sends ZERO requests (no parseInt fallback to 1000) -> alert: "", dialogOpen: false, noReqSent: false

Real-API Chatbot V2 CDP test suite failed with error:
 Error: Assertion failed in [CH-13c-BUDGET-UNIT-TAMPER] ProfileBar budget unit rejects tampered unit value with inline Vietnamese error and sends ZERO requests (no parseInt fallback to 1000): alert: "", dialogOpen: false, noReqSent: false
```
This confirmed that unmodified code silently sent HTTP requests with fallback `1000` multiplier and closed the dialog without error.

### 3.2 Real-API CDP Suite Passing Verification (`qa/e2e/test_chat_v2.mjs`)
After applying the fixes, the entire suite passed:
```
✅ PASS [CH-13a-BUDGET-VALIDATION] ProfileBar budget structured editor requires scope ('cả nhóm'/'mỗi người'), blocks submission with inline error when scope is missing, patches {budget_vnd: 600000, budget_scope: 'group'}
✅ PASS [CH-13b-VEHICLE-VALIDATION] ProfileBar vehicle editor is a structured select restricted to the four supported values (walk, motorbike, car, taxi), patches 'motorbike'
✅ PASS [CH-13c-BUDGET-UNIT-TAMPER] ProfileBar budget unit rejects tampered unit value with inline Vietnamese error and sends ZERO requests (no parseInt fallback to 1000) -> alert: "⚠️ Đơn vị tiền tệ không hợp lệ. Vui lòng chọn đồng, nghìn hoặc triệu.", dialogOpen: true, noReqSent: true
✅ PASS [CH-13d-MAX-LEG-VALIDATION] Max-leg editor: production chip opens 3..60 editor; 2 and 61 blocked inline with zero requests; 3, 10, 60 accepted (HTTP 200); chip reflects chat.state.profile.max_leg_min after reload -> initialChip: {"exists":true,"text":"⏱️\nĐi bộ tối đa mỗi chặng: chưa đặt\n(thiếu)","hasInitialLabel":true}, 2Blocked: true, 61Blocked: true, 3Req: true, 60Req: true, 10Req: true, postReload: {"exists":true,"text":"⏱️\nĐi bộ tối đa mỗi chặng: 10 phút","reflectsState":true}

===============================================================
   REAL-API CHATBOT V2 CDP E2E ACCEPTANCE: 31/31 PASSED
===============================================================
```

### 3.3 Serial Test Gate Results

| Test Suite / Command | Scope / Description | Result |
|---|---|---|
| `node qa/e2e/test_chat_v2.mjs` | Real-API CDP chatbot v2 acceptance suite (14 scenarios) | **31/31 PASSED** (exit 0) |
| `node qa/e2e/test_components.mjs` | DOM render, keyboard a11y, EvidenceStrip matrix | **48/48 PASSED** (exit 0) |
| `node frontend/lib/contractTest.js` | API client contract invariant tests (v1..v1.8) | **18/18 PASSED** (exit 0) |
| `node qa/e2e/test_ui_v2.mjs` | Production scratch responsive tokens & computed styles | **28/28 PASSED** (exit 0) |
| `node qa/e2e/test_ui_kit.mjs` | Base components, WCAG contrast, tabular numbers | **11/11 PASSED** (exit 0) |
| `node qa/e2e/test_maps_links_cdp.mjs` | Free Google Maps URLs order & disclaimer mutations | **61/61 PASSED** (exit 0) |

### 3.4 Mutation Checks Evidence

| Mutation | Injected Mutation in Scratch | Expected Assertion Failure | Actual Result |
|---|---|---|---|
| `allergy` | Injected `{false && (` for allergy unknown warning | CH-06 `cardsWarned: false` | **Exit 1** (as expected) |
| `fallback` | Replaced compare table cell fallback with empty string | CH-03b `noEmpty: false`, empty injected cell | **Exit 1** (as expected) |
| `guard` | Stripped `inFlight`/`isSubmitting` guards from components | CH-08-DOUBLECLICK `sentCalls: 3` (> 1) | **Exit 1** (as expected) |
| `budget` | Replaced budget scope check with `false && !budgetScope` | CH-13a `noReqSent: false` | **Exit 1** (as expected) |

---

## 4. Conclusion

Both issues raised in `docs/reports/CODEX_C6_FINAL_3.md` are completely resolved in `frontend/app/components/v2/chat/ProfileBar.jsx` and verified through independent real-API browser automation in `qa/e2e/test_chat_v2.mjs`. No production source code outside `frontend/` was modified. All tests and mutation checks pass serially without overlapping ports.
