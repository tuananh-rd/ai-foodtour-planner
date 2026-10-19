# Final Integration QA Report: Online Assistant & Composed HTTP State

- **Date:** 2026-10-19
- **Evaluator:** Antigravity (Independent Frontend & Integration QA)
- **Coordinator:** Codex (`term_24c3a210-7070-4dd5-b703-f12f516a70b0`)
- **Task & Dispatch:** `task_773e0849bceb` / `ctx_bc7440d9491f`
- **Target Git Commit:** `1509005f591a9b474d63e8565aab724c12bdf230`
- **Target Servers:**
  - Production Web Server: `http://127.0.0.1:3060`
  - Composed API Server: `http://127.0.0.1:8060`
- **Evidence Artifact:** [`final_integration_evidence.json`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/online-assistant/final-integration/final_integration_evidence.json)

---

## 1. Executive Summary

Antigravity completed independent verification of commit `1509005` across composed backend wiring, live browser user flows, and responsive SVG layout fidelity. Codex's integration changes—including the `main.py` Tavily factory instantiation, `search_transport.py` 429/432/433 quota mapping, and 3/3 passing HTTP wiring tests—are reviewed and **APPROVED**. Live exploratory testing verified that the full food tour journey (Vietnamese prompt, budget clarification, allergy gating, confirmation summary, 3-stop tour timeline, free walking Google Maps navigation without API keys, stop replacement, and reload persistence) functions smoothly, with unconfigured web search failing closed honestly; the only functional issue identified is a previously flagged clarify-chip focus bypass in [`GuidedLayout.jsx`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/app/components/v2/guided/GuidedLayout.jsx#L778-L780) caused by premature ref assignment during input active state.

---

## 2. Affected-Implementer Review of Integration Code

Antigravity reviewed the integration changes committed by Codex under commit `1509005`:

1. **`backend/app/main.py` (Tavily Factory Wiring):**
   - Clean dependency injection via `app.state.web_search = web_search if web_search is not None else TavilySearch.from_env()`.
   - Guarded instantiation prevents unconfigured crashes, allowing fail-closed downstream behavior.
2. **`backend/app/assistant/search_transport.py` (Quota & Error Mapping):**
   - Explicitly intercepts HTTP status codes 429 (rate limit), 432, and 433 (quota limits), translating them to `ProviderError('quota', status=response.status)`.
   - This prevents wasteful and dangerous client/server retry storms when quota limits are reached.
3. **`backend/tests/api/test_online_search_wiring.py` (HTTP Integration Suite):**
   - Verified 3/3 tests passing synchronously in `0.45s`:
     - `test_search_wiring_when_search_disabled`: PASS
     - `test_search_wiring_when_search_enabled_without_keys`: PASS
     - `test_search_wiring_quota_exhaustion_mapping`: PASS

**Verdict:** **APPROVED**.

---

## 3. Test Matrix & Capability Status

| Capability / Section | Viewport / Scope | Status | Evidence / Notes |
| :--- | :--- | :---: | :--- |
| **API Health & Metadata** | API 8060 | **PASS** | `build_commit: 1509005...`, `dataset_source: synthetic`, `dataset_version: bd561f...`, `assistant_provider: rules` |
| **Understood Card & Safety Notice** | Desktop 1440x1024 | **PASS** | Displays parsed preferences, area, party, stops, duration, and calm allergy safety disclaimer |
| **Clarify Progression & Confirmation** | Desktop 1440x1024 | **PASS** | Progresses from clarify scope chip to start time to `confirm-summary-card` with `confirm-yes-btn` |
| **Tour Timeline Generation** | Desktop 1440x1024 | **PASS** | Renders 3 stops (`[SYNTHETIC] Chè Thử 12`, `[SYNTHETIC] Chè Thử 11`, `[SYNTHETIC] Phở Thử 4`) |
| **Free Google Maps Navigation** | Desktop 1440x1024 | **PASS** | Primary CTA uses `https://www.google.com/maps/dir/?api=1&origin=...&destination=...&travelmode=walking&waypoints=...`; zero paid keys or embeds |
| **Single Stop Replacement** | Desktop 1440x1024 | **PASS** | Replaced `[SYNTHETIC] Chè Thử 12` with `[SYNTHETIC] Kem Thử 24` via `replace-modal-confirm-btn`; timeline updated immediately |
| **Session & Tour Reload Persistence** | Desktop 1440x1024 | **PASS** | Tour and 3 stops intact after hard page reload when `conv` session parameter is retained |
| **Web Search Honesty (No Key)** | Desktop 1440x1024 | **PASS** | With `web_search: true` and no API key, server flags unconfigured; UI displays honest disabled badge, 0 sources, zero fabricated facts |
| **Desktop Layout Structure** | Desktop 1440x1024 | **PASS** | 1440x1024 layout adheres to SVG hierarchy; header, chat stream, and tour side panel render cleanly |
| **Mobile Layout Structure** | Mobile 390x844 | **PASS** | Mobile navigation tabs (`mobile-tab-chat`, `mobile-tab-tour`) functional, 0 horizontal overflow |
| **Clarify Chip Auto-Focus (Desktop)** | Desktop 1280x1024 | **FAIL** | Focus remains on `BODY`; first chip `[data-testid^="clarify-option-"]` is not auto-focused (`BUG-01`) |
| **Clarify Chip Auto-Focus (Mobile)** | Mobile 390x844 | **FAIL** | Focus remains on `BODY`; first chip is not auto-focused (`BUG-01`) |
| **Live External Web Search** | Live Provider | **BLOCKED** | Live Tavily API key intentionally absent; fail-closed fallback verified |
| **Live Gemini Assistant Provider** | Live Provider | **PARTIAL** | Active provider is deterministic `rules` mock; live Gemini API not invoked |
| **Paid Google Maps APIs / Embeds** | External | **NOT TESTED** | Prohibited by project constraints; system strictly uses free external navigation URLs |

---

## 4. Defect Report & Root Cause Analysis

### `BUG-01`: Clarify Chip Auto-Focus Bypass on Input Blur

- **Severity:** Low / UX Glitch (Keyboard Accessibility)
- **Affects:** Desktop 1280x1024 and Mobile 390x844
- **Reproduction Steps:**
  1. Open `http://127.0.0.1:3060/?guided=1`.
  2. Type `Tìm quán ăn quanh Hoàn Kiếm` into `[data-testid="guided-input"]` and submit.
  3. Observe focus position when `busy` becomes `false` and the clarify card renders.
- **Expected:**
  Focus should automatically land on the first clarify option chip (`[data-testid^="clarify-option-"]`) or clarify free text input to streamline keyboard/screen-reader flow.
- **Actual:**
  Focus lands on `document.body` (`activeTagName: "BODY"`).
- **Exact Root Cause:**
  In [`frontend/app/components/v2/guided/GuidedLayout.jsx`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/app/components/v2/guided/GuidedLayout.jsx#L778-L780):
  ```javascript
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  const isUserTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  ...
  lastFocusedKeyRef.current = clarifyKey;
  if (!isUserTyping) {
    tryFocus();
  }
  ```
  When the turn completes, the user's active focus is still within the `guided-input` element. Therefore, `isUserTyping` evaluates to `true`. Because `lastFocusedKeyRef.current = clarifyKey` is set unconditionally before evaluating `!isUserTyping`, `tryFocus()` is bypassed. When the input subsequently blurs or unmounts, focus defaults to `body`. On subsequent re-renders, the check `lastFocusedKeyRef.current !== clarifyKey` evaluates to `false`, permanently preventing the chip from being focused.
- **Recommended Fix (for upcoming bugfix dispatch):**
  Only update `lastFocusedKeyRef.current = clarifyKey` *after* successfully acquiring focus or when `!isUserTyping` holds.

---

## 5. Artifacts and Test Harness

- **Test Harness Scripts:**
  - [`run_exploratory_qa.mjs`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/online-assistant/final-integration/run_exploratory_qa.mjs): Native CDP suite covering health checks, DOM traces, honesty checks, and layout fidelity.
  - [`run_missing_journey.mjs`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/online-assistant/final-integration/run_missing_journey.mjs): Targeted end-to-end journey verification covering turns 1-4, timeline generation, Google Maps CTA validation, stop replacement, and reload persistence.
- **Captured Evidence:**
  - [`final_integration_evidence.json`](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/online-assistant/final-integration/final_integration_evidence.json)

---

## 6. Sign-off

Antigravity independently signs off on commit `1509005` as production-ready for the composed online assistant pipeline, subject to the documented low-severity clarify focus bug (`BUG-01`) being scheduled for resolution in the next maintenance dispatch.
