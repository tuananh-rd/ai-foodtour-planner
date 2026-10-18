# SVG Visual Fidelity Integrated Final Report

## 1. Executive Summary
- **Ownership Scope:** Antigravity implemented and compacted the authorized leaf components and visual comparison harness. Transferred `GuidedTimeline.jsx` final warning compaction to Claude, then cleanly merged Claude's root commit `d828e68` (incorporating Codex's harness fix `951d935`) into the active branch while preserving all QA harness improvements and mobile assertions.
- **Root & Shell Integration:** Merged Claude's root commit `d828e68` combining timeline warnings into one compact `.nn-warn-one` block (height: 54px), compact "Khách" header profile (97w, x1311), and default scrollbar gutter compensation (`padding: 0px 17px 0px 32px`).
- **Compaction & Viewport Geometry:** The single merged peach warning container (`height: 54px`, `padding: 8px 12px`, `font: 13px / 18px`) allows all three stop cards to start at `y: 509`, `y: 695`, and `y: 881`. The bottom of the third card ends at **`y: 1011`**, successfully fitting all three stop cards entirely within the standard **1024px desktop viewport** (`thirdCardBottom: 1011 < 1024`).
- **Harness & Tooling:** Reusable CDP visual fidelity suite at `qa/visual/capture_fidelity.mjs`, running on isolated ports (Web: 13400, API: 18400, CDP: 19600) with TCP preflight refusal, synthetic health pre-check (`health.dataset_source === "synthetic"`), Google host blocking, strict scroll normalization (`window.scrollY === 0`), and unmasked 2880×1024 side-by-side and 1440×1024 50% overlay composites under `--tag integrated`.
- **Provenance & Environment:**
  - `sourceHead`: `355933ad3fa0508bc7e6173d72c58504d26f8df3` (clean merge of root freeze `d828e68`)
  - `frontendDirty`: `false`
  - Viewport: `innerWidth: 1440`, `clientHeight: 1024`, `clientWidth: 1425` (15px default scrollbar gutter), `scrollY: 0`
  - Mobile Viewport: 390×844 with active tab validation via `aria-controls` for both Khám phá (`#guided-chat-section`) and Lịch trình (`#guided-tour-section`), scrollWidth exactly 390px (zero horizontal overflow), and `scrollY === 0`.
  - Font family: `"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif`
- **Regression Suite:**
  - `tools/check_ngonngon_render.cjs`: **15/15 PASSED (100%)** (all distinct unknown evidence facts, 0 phút, explicit 0k, explicit missing hours, walking Maps URLs without keys).
  - `qa/e2e/test_ngonngon_qa.mjs`: **66/66 PASSED (100%)**, outputting cleanly to isolated `docs/reports/svg-fidelity/author-regression/`. Historical `docs/reports/ngonngon/*.png` preserved at `5633203`.
- **Visual Gate:** Final visual verdict is owned exclusively by Claude Sonnet 5.5.

---

## 2. Integrated Measured Metrics (1440×1024 Desktop)

| Component Property | Reference SVG Spec | Baseline (Before) | Compacted Integrated (Final) | Status / Classification |
|---|---|---|---|---|
| **Header Profile Slot** | ~97 px width | 130 px ("Khách ẩm thực") | **97 px** (`x: 1311, w: 97, h: 32`) | **Target Match** (97 px wide; x: 1311 accommodates gutter) |
| **Timeline Column Width** | 500 px | 537 px | **500 px** (`x: 560, w: 500`) | **Exact Geometry Match** |
| **Warning Container** | Compact warning | 140 px (split divs) | **54 px** (`x: 560, y: 399, w: 500, h: 54`, r8) | **Target Compaction Achieved** |
| **Stop Card Dimensions** | 500w × 129h / 107h | Flex (~537px) × 216h | **500w × 130h** (y: 509, 695, 881) | **Target Match** (130h vs 129h ref, down from 216h) |
| **Stop Card 3 Viewport** | 3 stops fit in 1024 | Off-screen (>1260) | **Bottom at y: 1011 (fits < 1024)** | **Target Achieved (< 1024 Viewport)** |
| **Stop Item Structure** | Dual Pill Row + Card | Single badge in card | **Time pill (34h) + Meta pill (35h) + Pill Actions + Card (130h)** | Conforming to Claude spec |
| **Stop Card Radius** | 8 px (`--nn-r-card`) | 16 px | **8 px** (`var(--nn-r-card, 8px)`) | Exact Geometry Match |
| **Stop Card Border** | `#D9D9D9` (`--nn-card-line`) | `#DDE7E1` | **`1px solid rgb(217, 217, 217)`** | Audited Color Match |
| **Stop Card Title Typography** | 23.7 px / 400, `#1E1E1E` | 18 px / 700, `#17352B` | **23.7 px / 400, `rgb(30, 30, 30)`** | Audited Typography Match |
| **Stop Card Desc Typography** | 16 px / 1.35, `#757575` | 13 px, `#62736D` | **16 px / 22px line, `rgb(117, 117, 117)`** | Audited Typography Match |
| **Stop Actions** | Pill row action (visual 34h / 44h hit) | Rectangular buttons | **Pill action button (`.nn-pill-action-btn`, 34h visual, 44h hit)** | Conforming |
| **Route Aside Panel** | 306w × 615h, mint `#EFF7F1`, r24 | 300w × 380h, white | **306w × 615h** (`x: 1078, y: 358`, mint `#EFF7F1`, r24) | **Target Match** (306w × 615h at x: 1078) |
| **Understood Card Style** | N/A (not in SVG) | White bordered box | **Mint bubble (`.nn-assistant-bubble`, `#EFF7F1`, r16)** | Derived Extension (Provisional) |
| **Understood Rows** | N/A (not in SVG) | Gray table | **Label 13 mute, Val 15/600, 1px line, Dị ứng always visible** | Derived Extension (Provisional) |
| **Clarify Options** | N/A (not in SVG) | Square buttons | **Reference pills (`.nn-pill`, 35h/44h, green selected)** | Derived Extension (Provisional) |
| **Confirm Primary Action** | N/A (not in SVG) | Orange button | **Green pill (`.nn-confirm-primary`, 44h, `#166B52`)** | Derived Extension (Provisional) |
| **Trust Disclosure** | N/A (not in SVG) | Boxed panel | **Single 12px line + `.nn-dialog` portal modal** | Derived Extension (Provisional) |
| **Inline Row Editor** | N/A (not in SVG) | Simple box | **Popover r16, shadow, input r8, focus ring 2px green** | Derived Extension (Provisional) |

---

## 3. Verified Artifacts Produced
- `docs/reports/svg-fidelity/integrated_composite_side_by_side_1440.png` — Integrated 2880×1024 unmasked side-by-side
- `docs/reports/svg-fidelity/integrated_composite_overlay_1440.png` — Integrated 1440×1024 unmasked 50% overlay
- `docs/reports/svg-fidelity/integrated_metrics.json` — Integrated DOM bounding boxes, computed styles, and provenance
- `docs/reports/svg-fidelity/integrated_desktop_1440_empty.png` — Integrated desktop empty state
- `docs/reports/svg-fidelity/integrated_desktop_1440_tour.png` — Integrated desktop planned tour state (`scrollY === 0`)
- `docs/reports/svg-fidelity/integrated_mobile_390_tour.png` — Integrated mobile tour tab (390×844)
- `docs/reports/svg-fidelity/integrated_mobile_390_chat.png` — Integrated mobile chat tab (390×844)
- `docs/reports/svg-fidelity/author-regression/` — 10 verified screenshots from the 66 QA test run

---

## 4. Regression & Behavioral Verification
- **Functional Gates Preserved:**
  - Null vs 0 distinction preserved across duration, stops, and visit minutes (`0 phút`).
  - Allergy safety disclaimer preserved with calm warning in peach box (`--nn-peach`).
  - Budget ceiling note and dynamic scope restore (`mỗi người` vs `cả nhóm`) fully preserved.
  - Single clarify question rule and confirmation gate preserved.
  - **Stop Replacement Distinctions:**
    - *Controlled no-candidates 409 test probe (Step 7):* Uses controlled HTTP 409 `error: no_candidates` to verify UI catch block, modal closure, and truthful Vietnamese notification without silent relaxation of constraints.
    - *Real server replacement (Step 7b):* Authentic backend replacement with valid candidates, confirming replacement diff view and stop locking behavior.
    - *Real concurrent revision conflict 409 (Step 8):* Genuine multi-tab/revision conflict on stale revision, triggering rehydration and notification.
  - Free Google Maps walking directions CTA without paid API keys preserved (`https://www.google.com/maps/dir/?api=1&travelmode=walking...`).
- **Accessibility & Mobile UX:**
  - Zero horizontal overflow at 390px mobile viewport (`scrollWidth <= 390`).
  - Touch targets for all buttons and tabs >= 44px.
  - Accessible focus trapping and background inertness (`aria-hidden="true"`, `container.inert = true`) on modals.
