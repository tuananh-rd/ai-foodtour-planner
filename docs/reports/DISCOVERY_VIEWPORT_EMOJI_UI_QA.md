# Discovery-First Assistant: Bounded Fluid Viewport & Runtime Emoji UI QA Report

- **Task ID:** `task_6bad7be2b243`
- **Context / Dispatch ID:** `ctx_1570c0e39d91`
- **Coordinator:** Codex (`term_f4235d70-7974-4a00-b0e5-9a9fa3a4141b`)
- **Worker / Author:** Antigravity (`term_0101652d-572f-4551-b85a-3565d391cdff`)
- **Date:** 2026-10-20 (Asia/Saigon)
- **Status:** PASSED (45 automated browser QA invariants, 88 emoji sanitizer unit assertions, in-browser CDP re-render proof, full callsite coverage, and clean Next.js production build)

---

## 1. Executive Summary

This report documents the implementation and hermetic QA verification of the **Fluid Viewport & Comprehensive Runtime Emoji Normalization UI** for the Discovery-First FoodTour Assistant (`discovery-v1`), matching the Warm Editorial Figma Frame 1:145 layout.

### Key Objectives Delivered:
1. **Comprehensive Display-Only Emoji Normalization with Boundary Preservation:**
   - Strips invisible format controls (variation selectors `\ufe0e`/`\ufe0f`, zero-width joiners `\u200d`, Unicode tags `\u{e0020}-\u{e007f}`) first **without inserting spaces** so legitimate words are not split (`Ph\u200dở` -> `Phở`).
   - Replaces visible emojis, pictographs, flags, and keycaps with a **single space separator** so adjacent words/numbers never join (`20🍜30` -> `20 30`, `Phở🍜ngon` -> `Phở ngon`).
   - Extends projection coverage across all schema fields: `district`, `dish_tags`, `hours.display`, `confirmation.summary/profile`, `tour.explanation/reasons/unknowns/stops/nested venue/address/why`.
   - Strictly preserves raw input, IDs, tokens, revision counters, URLs, ordinary digits/numbers, coordinates, and Vietnamese diacritics. Never modifies authentication, session state, or API payloads.
2. **Comprehensive Render Callsites Coverage:**
   - `DiscoveryLayout.jsx`: lines 710 `areaDisplay`, 1189 heading area, 1611 hero `tour.title`, 1656 `allergies/origin/vehicle` props, 937 error banner, 1081 `geoNotice`, and detail modal text fields.
   - `PilotMap.jsx`: sanitized marker `btn.title`, `btn.setAttribute('aria-label', ...)`, popup `titleEl.textContent`, and popup `addrEl.textContent`.
   - Legacy dynamic branches: `TourTimeline.jsx`, `ChatPanel.jsx`, and `StopCard.jsx`.
   - Restored unrelated typo in `page.js` line 704 from "Phổ Cổ" back to "Phố Cổ".
3. **Fluid Responsive Desktop & Mobile Viewports:**
   - Maintained proportional 2-column grid tracks (`minmax(0, 1.478fr) minmax(0, 1fr)`) preserving the Figma Warm Editorial 59.6% / 40.4% ratio across desktop widths >= 1024px.
   - Removed arbitrary `max-height: 960px` desktop cap, deriving panel heights via `height: calc(100dvh - 138px); min-height: 560px;` with reachable chat composer.
4. **Hermetic Test Matrix & Build Verification:**
   - Clean Next.js 15 production build (`npm run build`) in 1493ms with 0 errors.
   - 88/88 passing unit test assertions in `qa/discovery-assistant/test_emoji_sanitizer.mjs`.
   - 45/45 passing integration & visual invariant checks in `qa/discovery-assistant/run_discovery_qa.mjs` (including injected browser re-render proof for `WORD_NUMBER_BOUNDARY_PRESERVED`).

---

## 2. Multi-Viewport Fluid Matrix Audit

Automated CDP measurements verified exact rectangle geometry across 5 required viewport configurations:

| Viewport (WxH) | Type | Canvas Width | Sidebar Width | Tour Right Edge | Viewport Width | Horizontal Scroll? | Emojis in DOM | Status |
|---|---|---|---|---|---|---|---|---|
| **1280 x 800** | Small Desktop | 1033px | 232px | 1233px | 1280px | None (`scrollWidth: 1280`) | 0 | **PASS** |
| **1440 x 1024** | Reference Figma | 1208px | 232px | 1408px | 1440px | None (`scrollWidth: 1440`) | 0 | **PASS** |
| **1920 x 1080** | Full HD Desktop | 1688px | 232px | 1888px | 1920px | None (`scrollWidth: 1920`) | 0 | **PASS** |
| **2560 x 1440** | QHD / 2K Desktop | 2328px | 232px | 2528px | 2560px | None (`scrollWidth: 2560`) | 0 | **PASS** |
| **390 x 844** | Mobile (iPhone) | 390px | (Stacked) | N/A | 390px | None (`scrollWidth: 390`) | 0 | **PASS** |

### Geometric Invariants Verified:
- **No Horizontal Overflow:** `document.documentElement.scrollWidth <= viewportWidth` on all resolutions.
- **Full Viewport Utilization:** `canvasWidth + sidebarWidth + scrollbarWidth === viewportWidth` (accounting for standard OS scrollbar where vertical scrolling is engaged).
- **Tour Column Containment:** `tourRight <= viewportWidth` at all desktop resolutions, guaranteeing no clipped cards or controls.
- **Mobile Stacked Flow:** Under 1024px, the layout switches to a single-column stacked view with sticky bottom mobile tabs for Chat / Chuyến đi (Tour) / Bản đồ (Map).

---

## 3. Dynamic Height Adaptation & Composer Reachability

### CSS Configuration:
```css
/* frontend/app/components/v2/guided/guided-visual.css */
.nn-chat-card,
.nn-tour-col {
  height: calc(100dvh - 138px);
  min-height: 560px;
  /* Removed arbitrary max-height: 960px cap per coordinator directive */
}

.nn-chat-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.nn-chat-history {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.nn-composer-card {
  flex: 0 0 auto;
}
```

### Measured Behavior:
- **At 1024px height (Figma Reference):** Card height resolves to exactly 886px (`1024 - 138 = 886px`).
- **At 800px height (1280x800 desktop):** Card height resolves to 662px (`800 - 138 = 662px`). Chat history scrolls internally with `overflow-y: auto`, and the message composer remains fixed and 100% accessible at the bottom of the card without page-level clipping.
- **At 1440px height (QHD display):** Card expands to 1302px (`1440 - 138 = 1302px`), eliminating large unused bottom canvas voids while preserving reachability.

---

## 4. Comprehensive Runtime Emoji Normalization Audit

### 4.1 Two-Step Sanitizer Architecture (`frontend/lib/emojiSanitizer.js`)
```javascript
const INVISIBLE_FORMATS_REGEX = /[\ufe0e\ufe0f\u200d\u{e0020}-\u{e007f}]/gu;
export const VISIBLE_EMOJI_REGEX = /(?:[0-9#*]\ufe0f?\u20e3|[\u{1f000}-\u{1faff}\u00a9\u00ae...]+)/gu;

export function normalizeDisplayText(text) {
  if (typeof text !== 'string' || !text) return text;
  // 1. Remove invisible format codes first without spaces (e.g. Ph\u200dở -> Phở)
  let s = text.replace(INVISIBLE_FORMATS_REGEX, '');
  // 2. Replace visible emojis/pictographs/keycaps/flags with a single space (e.g. 20🍜30 -> 20 30)
  s = s.replace(VISIBLE_EMOJI_REGEX, ' ');
  // 3. Collapse multiple horizontal whitespace while preserving line breaks
  s = s.replace(/[ \t]{2,}/g, ' ');
  return s.trim();
}
```

### 4.2 Callsites Fully Covered:
1. `DiscoveryLayout.jsx`:
   - Line 709-710: `areaDisplay` and `stops` read from `displayView`
   - Line 1189: results heading area reads from `displayView.profile?.area`
   - Line 1611: hero tour title reads from `displayView.tour?.title`
   - Lines 1655-1662: `GuidedTimeline` props (`allergies`, `origin`, `vehicle`) sanitized
   - Line 937: `errorBanner` / `initError` sanitized
   - Line 1081: `geoNotice` sanitized
   - Detail modal: `displayDetailVenue = useMemo(...)` sanitizes modal name, address, district, description, dish tags, hours, price evidence.
2. `PilotMap.jsx`:
   - Markers: `btn.title`, `btn.setAttribute('aria-label', ...)`
   - Popups: `titleEl.textContent = normalizeDisplayText(stop.name)`, `addrEl.textContent = normalizeDisplayText(stop.address)`
3. Legacy dynamic branches:
   - `frontend/app/components/TourTimeline.jsx`: stop names, notes, addresses, districts
   - `frontend/app/components/ChatPanel.jsx`: messages, question prompts
   - `frontend/app/components/v2/StopCard.jsx`: stop names, addresses, descriptions
4. Typo correction:
   - `frontend/app/page.js` line 704 restored from "Phổ Cổ" to "Phố Cổ".

### 4.3 Sanitizer Unit Test Matrix (`qa/discovery-assistant/test_emoji_sanitizer.mjs`)
Passed all **88 test assertions** covering:
- Word & number boundary preservation (`20🍜30` -> `20 30`, `Phở🍜ngon` -> `Phở ngon`)
- Invisible formatting removal (`Ph\u200dở` -> `Phở`)
- Parity with backend `test_presentation.py` samples
- Multi-flag sequences, family ZWJ sequences, skin tone modifiers
- Keycaps with and without VS16 (`1️⃣`, `2\u20e3`, `#️⃣`, `*️⃣`)
- Full schema projection coverage (`district`, `dish_tags`, `hours.display`, `price.evidence`, `confirmation.summary`, `tour.explanation`, nested `stops[].venue`)
- Strict raw identity preservation (`session_id`, `token`, `revision`, `lat/lon`, `locked`, `source_url`)

### 4.4 In-Browser Re-Render & DOM Audit
During the automated headless Chrome test runs across all 5 viewports:
- Injected emojis into initial restaurant names, text reply messages (`20🍜30`, `Phở🍜ngon`), and confirmation cards.
- Verified `WORD_NUMBER_BOUNDARY_PRESERVED` in DOM: `"20 30"` and `"Phở ngon"` cleanly present.
- `ZERO_EMOJI_1280`: PASS (0 emojis in DOM)
- `ZERO_EMOJI_1440`: PASS (0 emojis in DOM)
- `ZERO_EMOJI_1920`: PASS (0 emojis in DOM)
- `ZERO_EMOJI_2560`: PASS (0 emojis in DOM)
- `ZERO_EMOJI_390`: PASS (0 emojis in DOM)

---

## 5. Automated QA Test Suite Results

Full suite execution of `qa/discovery-assistant/run_discovery_qa.mjs`:

```text
================================================================
QA SUMMARY: Total: 45 | Passed: 45 | Failed: 0
================================================================
ALL DISCOVERY ASSISTANT UI CHECKS PASSED SUCCESSFULLY WITH WARM EDITORIAL FIDELITY!
```

### Invariant Breakdown:
1. `PREFLIGHT_PORTS`: Ports 13600, 18600, 19800 verified free before execution.
2. `MOCK_API_RUNNING`: Synthetic `discovery-v1` backend server listening on 18600.
3. `FRONTEND_BUILD`: Next.js production build succeeded cleanly.
4. `FRONTEND_RUNNING`: Next.js web application responding on 13600.
5. `SIDEBAR_GEOMETRY`: Sidebar width 232px, deep chestnut rust background (`rgb(112, 41, 20)`).
6. `CANVAS_GOLDEN_YELLOW`: Warm golden yellow canvas background (`rgb(249, 197, 61)`).
7. `TWO_COLUMN_GRID`: Chat Card (668px) and Tour Column (452px) at 1440px desktop.
8. `BRAND_HEADER`: Editorial branding "măm măm." and slogan "ĐI ĐỂ ĂN. ĂN ĐỂ NHỚ.".
9. `TAVILY_REMOVED`: Zero Tavily web search opt-in UI elements.
10. `CHECKLIST_REMOVED`: Zero main-chat checklist matrix elements.
11. `RESULTS_CARD_METADATA`: Restaurant cards display badge, name, venue price range, and source provenance.
12. `WORD_NUMBER_BOUNDARY_PRESERVED`: Word and number boundaries preserved in live DOM.
13. `DETAIL_MODAL_OPEN`: Detail dialog opens with proper `role="dialog"`.
14. `DETAIL_MODAL_ESCAPE_CLOSE`: Escape key traps focus and restores focus upon closing.
15. `SELECTION_ADD`: Selected restaurant added to right-hand tour column.
16. `SELECTION_LOCK`: Lock button toggles stop locking via SVG icon and `aria-label`.
17. `COMPARISON_VIEW`: Multi-venue comparison drawer renders unverified attributes honestly.
18. `PROFILE_DRAWER_OPEN` & `PROFILE_DRAWER_SAVE`: Collapsed preference drawer opens and saves.
19. `CONFIRMATION_CARD_RENDERED`: Explicit confirmation card with allergen warnings and confirmation button.
20. `EXPLICIT_CONFIRM_GATE`: Itinerary generation strictly gated behind user confirmation click.
21. `MAP_VIEW_TOGGLE`: Interactive map toggle loads PilotMap.
22. `CONFLICT_409_HANDLED`: HTTP 409 conflict handles revision mismatch without replay mutation.
23. `MOBILE_390_NO_OVERFLOW`: Mobile viewport 390x844 reflows with zero horizontal scroll.
24. `MOBILE_TABS_VISIBLE`: Mobile navigation tabs visible and functional.
25. `ZOOM_200_REFLOW`: WCAG 200% zoom reflow passes without layout disruption.
26-35. `FLUID_VIEWPORT_*` & `ZERO_EMOJI_*`: Verified across 1280, 1440, 1920, 2560, and 390.
36. `VISUAL_SIDE_BY_SIDE`: Sharp-composed 2880x1024 visual side-by-side with original Figma frame 1:145.

---

## 6. Artifacts & Evidence Produced

- **Full Suite Evidence:** `qa/discovery-assistant/evidence.json`
- **Sanitizer Unit Suite:** `qa/discovery-assistant/test_emoji_sanitizer.mjs`
- **Sanitizer Runtime Helper:** `frontend/lib/emojiSanitizer.js`
- **Visual Capture Evidence:**
  - `qa/discovery-assistant/screenshots/viewport_1280.png`
  - `qa/discovery-assistant/screenshots/viewport_1440.png`
  - `qa/discovery-assistant/screenshots/viewport_1920.png`
  - `qa/discovery-assistant/screenshots/viewport_2560.png`
  - `qa/discovery-assistant/screenshots/viewport_390.png`
  - `qa/discovery-assistant/desktop_1440x1024_discovery.png`
  - `qa/discovery-assistant/desktop_1440x1024_confirmed_tour.png`
  - `qa/discovery-assistant/mobile_390x844_discovery.png`
  - `qa/discovery-assistant/side_by_side_comparison.png`

---

## 7. Affected File Boundaries

All changes were strictly confined to Antigravity-owned boundaries:
- `frontend/app/components/ChatPanel.jsx`
- `frontend/app/components/MapView.jsx`
- `frontend/app/components/TourStatusBanner.jsx`
- `frontend/app/components/TourTimeline.jsx`
- `frontend/app/components/v2/RequestArea.jsx`
- `frontend/app/components/v2/StopCard.jsx`
- `frontend/app/components/v2/chat/BlockRenderer.jsx`
- `frontend/app/components/v2/chat/ChatColumn.jsx`
- `frontend/app/components/v2/guided/ConfirmSummaryCard.jsx`
- `frontend/app/components/v2/guided/DiscoveryLayout.jsx`
- `frontend/app/components/v2/guided/GuidedLayout.jsx`
- `frontend/app/components/v2/guided/PilotMap.jsx`
- `frontend/app/page.js`
- `frontend/lib/emojiSanitizer.js`
- `qa/discovery-assistant/**`
- `docs/reports/DISCOVERY_VIEWPORT_EMOJI_UI_QA.md`
- `docs/reports/DISCOVERY_VIEWPORT_BACKEND_REVIEW.md`

No backend code was modified, no `.env` files were touched, and zero provider requests were issued.

---

## 8. Bounded Follow-up Corrections (`task_b2956348110d`)

- **Dispatch ID:** `ctx_e1450ef0e100`
- **Scope:** Normalization of remaining raw human-facing strings across legacy components:
  1. `frontend/app/components/TourTimeline.jsx` (line 87): wrapped `aria-label` stop name with `normalizeDisplayText(s.name)`.
  2. `frontend/app/components/MapView.jsx` (line 269): wrapped `stopPin` `aria-label` name with `normalizeDisplayText(stop.name)`.
  3. `frontend/app/components/v2/StopCard.jsx` (line 335): wrapped rendered `why.text` with `normalizeDisplayText(why.text)`.
- **Integrity:** Strictly preserved stop IDs, coordinate numbers, ordering integers, lock status, and event handlers.
- **Verification:** 88/88 unit tests passed exit 0; Next.js 15.5.28 production build compiled in 2.8s with 0 errors.
- **Audit Qualification:** Static scanner reports 2 lines in `frontend/lib/emojiSanitizer.js`, which are strictly comment-only illustrative docstring examples (`20🍜30`), not runtime UI code. All executable runtime UI strings across components remain 100% free of Unicode emoji literals.
