# ANTIGRAVITY U4d — Resolution Report: UI Findings of Codex U5f Review

**Agent:** Antigravity (Frontend & Independent Integration QA)  
**Date:** 2026-10-17  
**Task ID:** `task_4631fbb5e8ba`  
**Dispatch ID:** `ctx_1cea799c0010`  
**Branch / Worktree:** `foodtour-antigravity-web`  
**Reviewed by:** Codex (`foodtour-codex-backend`) & Claude (`foodtour-claude-coordinator`)

---

## 1. Executive Summary
Antigravity resolved the two remaining UI findings from the Codex U5f review: (F2) reload fidelity for confirmation summaries and (F3) client recovery when a real HTTP 409 revision conflict replaces confirmation with a newly introduced allergy obligation. After fast-forward merging `foodtour-claude-coordinator` (`b6f143d`, Contract v1.9.3), all updates were implemented strictly within `frontend/` and `qa/e2e/`, modifying zero backend or contract files. All 157 checks in the Codex reviewer driver (`qa/e2e/codex_guided_review.mjs`) and all 25 real-API scenarios in `qa/e2e/test_guided_e2e.mjs` pass cleanly (totaling 405/405 automated assertions across the entire regression pyramid).

---

## 2. Findings Addressed & Root Causes

### Finding F2: Confirmation Reload Fidelity
- **Issue:** On full-page reload or session restoration at the confirmation gate, the confirmation card reverted to a hardcoded `'khoảng 30 phút/quán'` fallback and displayed internal IDs or lost venue names because `chat.pending.summary` was not retained on session restoration and `venue_cards` were dropped.
- **Root Cause:**
  1. `ConfirmSummaryCard.jsx` had a fallback to `'khoảng 30 phút/quán'` when `visit_min` was undefined.
  2. `GuidedLayout.jsx` mount-time session restoration only reconstructed `chat.pending` as a generic clarify question or incomplete confirm card without parsing `chat.pending.summary` introduced in contract v1.9.3.
  3. `profileToUnderstoodItems()` omitted `visit_min`, preventing duration-per-stop inference.
- **Fix:**
  - In `ConfirmSummaryCard.jsx`: Removed the hardcoded fallback; now renders `visitMinItem?.value || (summary?.visit_min ? ... : '')`. Shortlist display strictly uses `s.name || 'Quán chưa rõ tên'` without raw IDs.
  - In `GuidedLayout.jsx`: On mount/restore and 409 resync, derives `confirm_summary` from `chat.pending.summary` and attaches `venue_cards` from `chat.last_results`. Added `visit_min` mapping to `profileToUnderstoodItems()`.
  - In `guidedFixtures.js`: Populated `chat.pending.summary` for mock confirm turns.

### Finding F3: Client 409 Revision Conflict Recovery
- **Issue:** When a concurrent client introduced a new safety obligation (e.g. allergy cue `mình bị dị ứng nhẹ với mấy thứ rang giòn`) directly via API, the first client's stale `confirm-yes-btn` click triggered an HTTP 409 conflict. The client failed to cleanly discard the stale confirmation card and confirm button, and failed to render the active allergy obligation card and chips.
- **Root Cause:**
  1. Active decisions in `GuidedLayout.jsx` were falling back to previous assistant message history even when `chatState.pending.kind` had changed to a clarify question (`clarify_slot`).
  2. The 409 catch handler in `executeTurn()` did not await `getSession()`, causing `finally { setBusy(false); }` to fire prematurely, leaving session and message state out of sync.
- **Fix:**
  - In `GuidedLayout.jsx`: Active decision rendering is strictly bound to `chatState.pending`. If `chatState.pending.kind !== 'confirm_plan'`, `confirmSummaryBlock` is guaranteed `null` (stale confirm card and button vanish immediately), and `clarifyBlock` is derived from the new pending clarify slot (rendering the allergy question and chips).
  - In `executeTurn()`: Safely resolved `activeSessionId` and `activeToken`, and awaited `getSession()` so state is fully synchronized with the server before `busy` is released.
  - In `qa/e2e/test_guided_e2e.mjs`: Added `U4D-02-REAL-409-CONFLICT-RECOVERY` which simulates a concurrent client advancing the server revision with an allergy cue, clicks the stale confirm button, verifies HTTP 409 handling, confirms removal of the confirm button, renders the calm error banner (`⚠️ Phiên làm việc đã thay đổi...`), and asserts the allergy question card and option chips.

---

## 3. Verification & Acceptance Evidence

### A. Codex Independent Review Driver
- Command: `node qa/e2e/codex_guided_review.mjs`
- Result: **157/157 PASS (exit code 0)**
- Evidence includes:
  - `409 replacing confirmation with safety question shows current obligation` -> PASS
  - `reload after real conflict shows current obligation` -> PASS
  - `pending safety question survives 409 resync` -> PASS
  - `pending safety question survives 409 and reload` -> PASS
  - `stated motorbike survives walking default` -> PASS
  - `same-session second tab obligation restored` -> PASS

### B. Guided Real-API Acceptance Suite
- Command: `node qa/e2e/test_guided_e2e.mjs`
- Result: **25/25 PASS (exit code 0)**
- Key assertions:
  - `U4D-01-RELOAD-FIDELITY`: Confirmation reload preserves venue names, visit minutes, and details (PASS)
  - `U4D-02-REAL-409-CONFLICT-RECOVERY`: Real 409 conflict replaces confirmation with allergy question and removes confirm button (PASS)
  - `U4B-01` through `U4B-24` (All pass, including Start Screen, S0 flow, Zero Google API calls, Hostile input containment, Flag matrix, and Keyboard navigation).

### C. Full Regression Pyramid
| Suite | Command | Checks | Result |
| :--- | :--- | :---: | :---: |
| Codex Review Driver | `node qa/e2e/codex_guided_review.mjs` | 157 | **157/157 PASS** |
| Guided Real-API E2E | `node qa/e2e/test_guided_e2e.mjs` | 25 | **25/25 PASS** |
| Guided UI Component E2E | `node qa/e2e/test_guided_ui.mjs` | 44 | **44/44 PASS** |
| UI Component Unit / DOM | `node qa/e2e/test_components.mjs` | 48 | **48/48 PASS** |
| UI Kit Design Tokens / A11y | `node qa/e2e/test_ui_kit.mjs` | 11 | **11/11 PASS** |
| Maps Links CDP Acceptance | `node qa/e2e/test_maps_links_cdp.mjs` | 61 | **61/61 PASS** |
| UI V2 Real-Browser CDP | `node qa/e2e/test_ui_v2.mjs` | 28 | **28/28 PASS** |
| Chat V2 Real-API E2E | `node qa/e2e/test_chat_v2.mjs` | 31 | **31/31 PASS** |
| **Total Pyramid** | | **405** | **405/405 PASS (100%)** |

---

## 4. Modified Files
- `frontend/app/components/v2/guided/ConfirmSummaryCard.jsx`
- `frontend/app/components/v2/guided/GuidedLayout.jsx`
- `frontend/lib/guidedFixtures.js`
- `qa/e2e/test_guided_e2e.mjs`
- `qa/e2e/test_guided_ui.mjs`
- `docs/reports/ANTIGRAVITY_U4D.md`

## 5. Non-Regression & Scope Boundaries
- **Backend & Contracts:** Untouched (`git diff backend/ contracts/` is empty).
- **Dependencies:** Zero new packages added to `package.json`.
- **Maps API:** Free Google Maps public URLs only; zero paid API calls made.
