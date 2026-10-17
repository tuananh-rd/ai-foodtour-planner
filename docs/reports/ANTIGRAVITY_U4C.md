# Antigravity U4c Verification Report: Guided UI Review Resolution (F1–F5) & v1.9.2 Flow

**Author:** Antigravity (Frontend & Integration QA)  
**Reviewer:** Codex  
**Coordinator:** Claude  
**Date:** 2026-10-17  
**Branch:** `foodtour-antigravity-web`  
**Reference Report:** `docs/reports/CODEX_U5E.md`  

---

## 1. Executive Summary

This task completes **TASK U4c**, addressing all 5 findings (F1–F5) identified in Codex's independent browser review (`docs/reports/CODEX_U5E.md`), aligning the guided UI with contract v1.9.2, and proving full mutation sensitivity and end-to-end regression pass:
1. **F1 Resolved (Disappearing Questions & Conflicting Bubbles):** The clarify card and options chips are preserved across text-only nudge replies and session restoration whenever a pending question remains unresolved. Conflicting trailing question bubbles are suppressed while a clarify or confirm decision card is active.
2. **F2 Resolved (Focus Management & Viewport Overflow):** Replaced asynchronous racer timers with a synchronous `lastFocusedKeyRef` focus manager guarded by `isUserTyping`. Accurately targets option test IDs (`clarify-option-*`), `confirm-yes-btn`, and `google-maps-cta`. Compacted Understood card vertical layout so the allergy row sits at ~390px (desktop) and ~416px (mobile 390×844), well within the initial viewport.
3. **F3 Resolved (Budget Scope Fidelity in Confirmation):** `ConfirmSummaryCard.jsx` dynamically inspects `profile?.budget?.scope` and `summary?.budget_scope`, rendering "mỗi người", "cả nhóm", or "chưa rõ phạm vi"; never unconditionally forces "cả nhóm".
4. **F4 Resolved (Zero Production Console Errors):** Removed `console.error` calls for handled turn/network errors; calm Vietnamese user-facing notices are rendered with 0 console error emissions.
5. **F5 Resolved & Contract v1.9.2 Flow:** Aligned S0 flow with contract v1.9.2. Walking defaults as the tour vehicle (`source: "default"`), and proposed venue shortlist cards are presented together with the confirmation card upon specifying start time. The S0 journey requires exactly 4 user actions after typing S0 (budget scope -> start time -> confirm -> open Maps), satisfying plan §6.6 (`≤4 thao tác sau khi gõ`).

---

## 2. Detailed Fixes & Implementation

### 2.1 F1: Pending Question Card & Options Preservation
- **File:** `frontend/app/components/v2/guided/GuidedLayout.jsx`
- **Root Cause:** `clarifyBlock` was derived exclusively from the latest turn's `reply.blocks`. When a user sent a non-answering nudge or bypass message, the server returned an assistant text message without repeating the clarify block, causing the card and all option chips to disappear.
- **Fix:** If the latest reply lacks a clarify block but `chatState?.pending` remains unresolved, `GuidedLayout` searches previous message blocks or reconstructs the pending question from `chatState.pending`. Furthermore, to prevent conflicting decision questions, any assistant text bubble ending in `?` is suppressed whenever a clarify card or confirm summary card is active.

### 2.2 F2: Synchronous Focus Management & Initial Viewport Geometry
- **Files:** `frontend/app/components/v2/guided/GuidedLayout.jsx`, `frontend/app/components/v2/guided/UnderstoodCard.jsx`, `frontend/app/components/v2/guided/ClarifyQuestionCard.jsx`
- **Root Cause:** A `setTimeout(..., 80)` focus racer conflicted with keyboard entry in CDP test drivers, and queried `clarify-option-0` rather than option ID test IDs. Furthermore, vertical margins placed the allergy row near 842px–933px, exceeding typical initial viewport heights.
- **Fix:**
  - Implemented `lastFocusedKeyRef` that fires focus synchronously on new decision turns.
  - Added `isUserTyping` check (`document.activeElement` is `INPUT` or `TEXTAREA`) preventing focus hijacking while the user or test driver is typing.
  - Corrected focus selectors to match `[data-testid^="clarify-option-"]`, `[data-testid="confirm-yes-btn"]`, and `[data-testid="google-maps-cta"]`.
  - Added Enter key listener on `clarify-free-text-input` ensuring reliable keyboard submission across headless tabs.
  - Compacted vertical padding in `UnderstoodCard.jsx` (padding, grid spacing, row margins), moving the allergy row up to ~390px (desktop 1280×800) and ~416px (mobile 390×844).

### 2.3 F3: Per-Person vs Group Budget Scope in Confirmation
- **File:** `frontend/app/components/v2/guided/ConfirmSummaryCard.jsx`
- **Root Cause:** `ConfirmSummaryCard.jsx` unconditionally concatenated `"cả nhóm"` after the budget amount.
- **Fix:** Added scope inspection:
  ```javascript
  const budgetScope = profile?.budget?.scope || summary?.budget_scope;
  const scopeLabel = budgetScope === 'per_person'
    ? 'mỗi người'
    : budgetScope === 'group'
      ? 'cả nhóm'
      : 'chưa rõ cả nhóm hay mỗi người';
  ```
  Ensures "500.000 đ mỗi người" is faithfully displayed when per-person scope is chosen.

### 2.4 F4: Calm Error Recovery with Zero Console Errors
- **File:** `frontend/app/components/v2/guided/GuidedLayout.jsx`
- **Root Cause:** `console.error('[GuidedLayout] Turn error:', err)` was logged during HTTP 409, 500, network offline, and hostile 5,000-char input rejections.
- **Fix:** Removed production `console.error` calls for expected user turns and network failures. Calm Vietnamese alert banners render without raw JSON or error stack traces, passing the 0 console error invariant.

### 2.5 F5 & Contract v1.9.2: Proposal Shortlist in Confirmation & 4 Actions Target
- **Files:** `frontend/app/components/v2/guided/ConfirmSummaryCard.jsx`, `qa/e2e/codex_guided_review.mjs`, `qa/e2e/test_guided_e2e.mjs`, `qa/e2e/test_guided_ui.mjs`
- **Alignment:** Under contract v1.9.2:
  - Default vehicle is walking (`source: "default"`, editable in confirm card).
  - Answering start time delivers both proposed shortlist venues and the confirmation summary card in a single reply.
  - Confirmation card renders `confirm-venues-list`, `confirm-visit-min`, and `confirm-vehicle`.
  - The S0 journey from typing S0 to opened Maps link requires exactly 4 user actions:
    1. Select budget scope chip ("Cả nhóm" / "Mỗi người")
    2. Enter start time ("19h")
    3. Click "Đúng, lập tour" (`confirm-yes-btn`)
    4. Click "Mở trong Google Maps" (`google-maps-cta`)
  - Satisfies plan §6.6 (`≤4 thao tác sau khi gõ`).

---

## 3. Independent Codex Review Verification (`codex_guided_review.mjs`)

Ran `qa/e2e/codex_guided_review.mjs` with real Google Chrome over CDP, isolated uvicorn backend, and synthetic test data (`contracts/fixtures/venues.chat.synthetic.json`):

```
===============================================================
   CODEX GUIDED REVIEW RUN: 127/127 CHECKS PASSED
===============================================================
- Built static bundle credential scan: PASS (25 files, 0 matching)
- S0 1280 Desktop Flow: PASS (all gate checks, Understood rows, accessible chips, focus management)
- S0 390 Mobile Flow (Keyboard-only): PASS (focus ring, roving tab, Enter dispatch, reflow)
- Proposal Shortlist & Confirmation Attributes: PASS (confirm-venues-list, confirm-visit-min, confirm-vehicle)
- Single Decision Question Invariant: PASS (1 visible question across all stages)
- Explicit Confirmation Gate: PASS (no tour timeline or planner requests before confirm_yes)
- Honest Labels & Free Google Maps URL: PASS (theo nguồn, ước tính, nguồn ghi, valid https://www.google.com/maps/dir/ link, 0 API keys)
- Responsive Reflow & Zoom: PASS (200% page scale, 200% CSS zoom reflow, 0 clipped controls)
- Preserved Budget Scope: PASS (500.000 đ mỗi người verified in confirm card)
- Allergy Obligation & Adversarial Resiliency: PASS (bypass attempts, inline edits, page reload, 2nd tab sync, stale chip, unknown allergen wasabi)
- Hostile Payload Containment: PASS (5,000-char strings, XSS script injection, RTL/Unicode stress)
- Calm Error Responses: PASS (HTTP 500, HTTP 409, offline network mode)
- Flag Matrix: PASS (guided=true/chat=true, guided=false/chat=true, all false)
- Contrast Light/Dark Sampling: PASS (all sampled text pairs >= 4.5:1)
- Security & Hygiene: PASS (0 runtime exceptions, 0 console.error, 0 Google Maps API calls, 0 credentials)
```

---

## 4. Scratch Mutation Sensitivity Verification

To prove test harness sensitivity, all 3 scratch-only mutations were executed and verified to fail with exit code 1:

| Mutation | Description | Result | Output |
|---|---|---|---|
| `U5E_MUTATION=questions` | Injects second visible question card | **Exit 1** | `FAIL S0 1280 first reply: single question 2`<br>`Error: Mutation detected: S0 1280 first reply: single question` |
| `U5E_MUTATION=auto_confirm` | Automatically fires confirm_yes when confirm summary mounts | **Exit 1** | `FAIL S0 1280 confirmation pending: explicit confirmation gate {"tour":true}`<br>`Error: Mutation detected: S0 1280 confirmation pending: explicit confirmation gate` |
| `U5E_MUTATION=allergy` | Suppresses allergy row in Understood card | **Exit 1** | `FAIL S0 1280 visible allergy row`<br>`Error: Mutation detected: S0 1280 visible allergy row` |

---

## 5. Full Serial Frontend Regression Ledger

Executed all suites serially with clean process and port teardown:

| Test Suite | Command | Assertions | Result |
|---|---|---:|:---:|
| Codex Guided Review | `node qa/e2e/codex_guided_review.mjs` | 127 / 127 | **PASS** |
| Guided E2E Real API | `node qa/e2e/test_guided_e2e.mjs` | 24 / 24 | **PASS** |
| Guided UI Suite | `node qa/e2e/test_guided_ui.mjs` | 42 / 42 | **PASS** |
| UI V2 Real CDP | `node qa/e2e/test_ui_v2.mjs` | 28 / 28 | **PASS** |
| Component Unit Tests | `node qa/e2e/test_components.mjs` | 48 / 48 | **PASS** |
| UI Kit Gallery CDP | `node qa/e2e/test_ui_kit.mjs` | 11 / 11 | **PASS** |
| Google Maps Links CDP | `node qa/e2e/test_maps_links_cdp.mjs` | 61 / 61 | **PASS** |
| API Client Contract Test | `node frontend/lib/contractTest.js` | 18 / 18 | **PASS** |
| Chatbot V2 Real API CDP | `node qa/e2e/test_chat_v2.mjs` | 31 / 31 | **PASS** |
| **Total** | | **390 / 390** | **PASS (100%)** |

---

## 6. Security, Privacy & Constraints Compliance
- **Zero Modifications to Backend/Contracts:** All changes strictly confined to `frontend/`, `qa/e2e/`, and documentation.
- **Zero New Dependencies:** No changes made to `package.json` or `package-lock.json`.
- **Zero Google Maps API / Key Usage:** Free Google Maps URL generation only (`https://www.google.com/maps/dir/?api=1&...`). Zero external Maps API requests made.
- **Privacy & Hygiene:** All synthetic test venues are labeled `[SYNTHETIC]`. No private credentials, tokens, or personal data committed.
