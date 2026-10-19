# Final Integration QA Report: Online Assistant, Clarify Focus Resolution & HTTP State

- **Date:** 2026-10-19
- **Evaluator:** Antigravity (Frontend Implementer & Independent Integration QA)
- **Coordinator:** Codex (`term_24c3a210-7070-4dd5-b703-f12f516a70b0`)
- **Task & Dispatch:** `task_1ecaea329bef` / `ctx_8b0140949551` (superseding `task_773e0849bceb` / `ctx_bc7440d9491f`)
- **Baseline Git HEAD:** `e1c86af`
- **Scoped Product Modification:** [`frontend/app/components/v2/guided/GuidedLayout.jsx`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/app/components/v2/guided/GuidedLayout.jsx)
- **Servers Tested:**
  - Production Composed Runtime: Web `http://127.0.0.1:3060` / API `http://127.0.0.1:8060`
  - Isolated Verification Runtime: Web `http://127.0.0.1:13100` / API `http://127.0.0.1:18100` (CDP 19300)
- **Evidence Artifacts:**
  - Focus Verification Suite: [`focus_verification_evidence.json`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/online-assistant/final-integration/focus_verification_evidence.json)
  - Full Journey Suite: [`final_integration_evidence.json`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/online-assistant/final-integration/final_integration_evidence.json)

---

## 1. Executive Summary

Antigravity investigated the first-clarification focus failures across Desktop (1280x800) and Mobile (390x844), confirmed the root causes in [`GuidedLayout.jsx`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/app/components/v2/guided/GuidedLayout.jsx), and implemented a bounded product fix that marks keys only upon verified focus success, adds timer cleanup, and stops session restore flags from suppressing initial interaction focus. The fix was verified on an isolated test server across 7 targeted browser scenarios—including Enter submission, mobile viewport, next clarification progression, new draft typing preservation, restore non-theft, and confirmation/tour transitions—with all 7 tests passing cleanly without touching running coordinator servers. Codex's integration wiring changes and accurate HTTP tests in `test_online_search_wiring.py` are confirmed and approved, with honest evidence boundaries recorded for downstream coordinator regression.

---

## 2. Affected-Implementer Review of Integration Code

Antigravity reviewed the integration changes committed by Codex:

1. **`backend/app/main.py` (Tavily Factory Wiring):**
   - Clean dependency injection via `app.state.web_search = web_search if web_search is not None else TavilySearch.from_env()`.
   - Guarded instantiation prevents unconfigured crashes, allowing fail-closed downstream behavior.
2. **`backend/app/assistant/search_transport.py` (Quota & Error Mapping):**
   - Explicitly intercepts HTTP status codes 429 (rate limit), 432, and 433 (quota limits), translating them to `ProviderError('quota', status=response.status)`.
   - Prevents client/server retry loops when search limits are reached.
3. **`backend/tests/api/test_online_search_wiring.py` (Actual Test Suite Verification):**
   - Verified 3/3 tests passing synchronously in `0.45s` against the real test functions:
     - `test_missing_key_default_factory_stays_disabled_without_outbound`: PASS
     - `test_actual_factory_adapter_cache_revision_and_read_only_http_state`: PASS
     - `test_explicit_falsey_injection_is_preserved`: PASS

**Verdict:** **APPROVED**.

---

## 3. Test Matrix & Capability Status

| Capability / Section | Viewport / Scope | Status | Evidence / Notes |
| :--- | :--- | :---: | :--- |
| **API Health & Metadata** | API 8060 / 18100 | **PASS** | `dataset_source: synthetic`, `dataset_version: bd561f...`, `assistant_provider: rules` |
| **Understood Card & Safety Notice** | Desktop 1440x1024 | **PASS** | Displays parsed preferences, area, party, stops, duration, and calm allergy safety disclaimer |
| **Clarify Progression & Confirmation** | Desktop 1440x1024 | **PASS** | Progresses from clarify scope chip to start time to `confirm-summary-card` with `confirm-yes-btn` |
| **Tour Timeline Generation** | Desktop 1440x1024 | **PASS** | Renders 3 stops (`[SYNTHETIC] Chè Thử 12`, `[SYNTHETIC] Chè Thử 11`, `[SYNTHETIC] Phở Thử 4`) |
| **Free Google Maps Navigation** | Desktop 1440x1024 | **PASS** | Primary CTA uses `https://www.google.com/maps/dir/?api=1&origin=...&destination=...&travelmode=walking&waypoints=...`; zero paid keys or embeds |
| **Single Stop Replacement** | Desktop 1440x1024 | **PASS** | Replaced `[SYNTHETIC] Chè Thử 12` with `[SYNTHETIC] Kem Thử 24` via `replace-modal-confirm-btn`; timeline updated immediately |
| **Session & Tour Reload Persistence** | Desktop 1440x1024 | **PASS** | Tour and 3 stops intact after hard page reload when `conv` session parameter is retained |
| **Web Search Honesty (No Key)** | Desktop 1440x1024 | **PASS** | With `web_search: true` and no API key, server flags unconfigured; UI displays honest disabled badge, 0 sources, zero fabricated facts |
| **Desktop Layout DOM Structure** | Desktop 1440x1024 | **PASS** | Verified header, 2-column chat stream and tour side panel render without DOM collision (Note: basic structural check only, does not constitute full side-by-side SVG pixel fidelity) |
| **Mobile Layout DOM Structure** | Mobile 390x844 | **PASS** | Verified mobile navigation tabs (`mobile-tab-chat`, `mobile-tab-tour`) function with 0 horizontal overflow (structural responsive check only) |
| **Clarify Chip Focus (Desktop 1280x800)** | Desktop 1280x800 | **PASS (FIXED)** | Focus lands on first option chip `clarify-option-scope:group` after Enter submission of S0 ([`CASE-01`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/online-assistant/final-integration/focus_verification_evidence.json)) |
| **Clarify Chip Focus (Mobile 390x844)** | Mobile 390x844 | **PASS (FIXED)** | Focus lands on first option chip `clarify-option-scope:group` after Enter submission of S0 ([`CASE-02`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/online-assistant/final-integration/focus_verification_evidence.json)) |
| **Next Clarification Progression Focus** | Desktop / Mobile | **PASS (FIXED)** | Advances to next question and focuses first chip (`clarify-option-time:18:00`) ([`CASE-03`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/online-assistant/final-integration/focus_verification_evidence.json)) |
| **Active Composer Draft Preservation** | Desktop | **PASS (FIXED)** | User draft typing in `guided-input` is never stolen by arriving clarify blocks ([`CASE-04`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/online-assistant/final-integration/focus_verification_evidence.json)) |
| **Session Restore Non-Theft** | Desktop | **PASS (FIXED)** | Reloading restored session does not steal focus or force jump ([`CASE-05`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/online-assistant/final-integration/focus_verification_evidence.json)) |
| **Confirmation Transition Focus** | Desktop | **PASS (FIXED)** | Focus cleanly lands on `confirm-yes-btn` ([`CASE-06`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/online-assistant/final-integration/focus_verification_evidence.json)) |
| **Tour Transition Focus** | Desktop | **PASS (FIXED)** | Focus cleanly lands on `google-maps-cta` ([`CASE-07`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/online-assistant/final-integration/focus_verification_evidence.json)) |
| **Live External Web Search** | Live Provider | **BLOCKED** | Live Tavily API key intentionally absent; fail-closed fallback verified |
| **Live Gemini Assistant Provider** | Live Provider | **PARTIAL** | Active provider is deterministic `rules` mock; live Gemini API not invoked |
| **Paid Google Maps APIs / Embeds** | External | **NOT TESTED** | Strictly prohibited by project rules; system only generates free external navigation URLs |

---

## 4. Root Cause Analysis & Product Fix

### Defect Analysis
1. **Premature Key Marking in [`GuidedLayout.jsx`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/app/components/v2/guided/GuidedLayout.jsx):**
   In previous code, `lastFocusedKeyRef.current = clarifyKey` was set unconditionally before attempting focus or verifying that focus succeeded. If child option chips had not yet mounted, or if an unmounted timer was cleared by a quick re-render, subsequent renders permanently skipped focusing the same key because the ref already matched.
2. **Lingering `restoredRef.current` Flag:**
   When opening a fresh session via query parameter (`conv=...`), `getSession` returned a session with no restored content (`tour: null, pending: null`). However, `restoredRef.current` was set to `true` unconditionally on load and never reset because the guard `if (restoredRef.current && (showTour || confirmSummaryBlock || clarifyBlock))` evaluated to false. When the user subsequently sent their first message (S0), the arrival of `clarifyBlock` tripped this lingering flag, treating the user's active submission as a restored session and skipping auto-focus.

### Product Fix Implemented
In [`frontend/app/components/v2/guided/GuidedLayout.jsx`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/app/components/v2/guided/GuidedLayout.jsx):
1. **Verified Focus Success:** `lastFocusedKeyRef.current` is only updated to `clarifyKey` once `document.activeElement === firstChip` (or `freeInput`).
2. **Attempt Retry Loop with Timer Cleanup:** Added `focusTimerRef` to retry focus across initial render ticks (up to 12 attempts of 25ms) and cancel pending timers on unmount or new effects.
3. **Draft Preservation:** Checked `isUserTypingNewDraft` (`active.value.trim().length > 0`) so user-initiated typing is never stolen.
4. **Accurate Restore Flagging:** `restoredRef.current` is only set to `true` if `s.tour` or `s.chat?.pending` actually contains restorable content, and is explicitly cleared whenever `executeTurn` or `handleRestart` runs.

---

## 5. Evidence Limitations & Boundary Disclosure

- **Test Fixtures:** All tests were run with synthetic fixtures (`venues.chat.synthetic.json`) and deterministic rules assistants. No external network traffic was permitted.
- **Provider State:** Live Tavily search is fail-closed (0 credits used, 0 external calls). Live Gemini model calls were not executed.
- **Visual Fidelity:** This QA checked responsive layout constraints and DOM container visibility only; it does not establish pixel matching. Current online-assistant authority is Codex coordination/review/integration and bounded Antigravity implementation, with Claude inactive. Separate actual SVG comparison artifacts are maintained in the coordinator's acceptance evidence.
- **Server Safety:** Isolated verification was executed strictly on `127.0.0.1:13100` / `18100` / `19300`. Coordinator servers `3060` and `8060` remained running and unmodified.
