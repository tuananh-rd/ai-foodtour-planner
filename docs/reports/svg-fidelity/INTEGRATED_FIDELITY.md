# SVG Visual Fidelity Integrated Final Report

## 1. Executive Summary
- **Ownership Scope:** Antigravity implemented and compacted the 6 authorized leaf components (`UnderstoodCard.jsx`, `ClarifyQuestionCard.jsx`, `ConfirmSummaryCard.jsx`, `GuidedTimeline.jsx`, `TrustDisclosure.jsx`, `InlineRowEditor.jsx`) and `frontend/app/components/v2/guided/guided-leaves.css` per Claude visual specifications and coordinator guidance.
- **Root & Shell Integration:** Merged Claude's final shell commits `14bafaf` (single heading coordination), `051f168` (gutter absorption), and `e419ca8` (compact "Khách" header profile at 97w, x1296) and Codex's test output isolation `ab253fc`.
- **Spacing Normalization:** Removed redundant `marginBottom: 11` on heading and `marginBottom: 13` on the warning container in `GuidedTimeline.jsx`, allowing `.nn-timeline`'s `gap: 13px` to act as the sole outer vertical spacing. This shifted stop card 0 up to `y: 589` (from initial `y: 637`). Stop card 2 starts at `y: 961` inside the initial 1024 viewport (bottom at `y: 1091`, with remaining content reachable via natural scroll).
- **Harness & Tooling:** Reusable CDP visual fidelity suite at `qa/visual/capture_fidelity.mjs`, running on isolated ports (Web: 13400, API: 18400, CDP: 19600) with TCP preflight refusal, synthetic health pre-check (`health.dataset_source === "synthetic"`), Google host blocking, strict scroll normalization (`window.scrollY === 0`), and unmasked 2880×1024 side-by-side and 1440×1024 50% overlay composites under `--tag integrated`.
- **Provenance & Environment:**
  - `sourceHead`: `beb246cf1e311f31a5b9e6302f775a1e894d3c8d`
  - `frontendDirty`: `false`
  - Viewport: `innerWidth: 1440`, `clientHeight: 1024`, `clientWidth: 1425` (15px default scrollbar gutter), `scrollY: 0`
  - Mobile Viewport: 390×844 with active tab validation via `aria-controls` for both Khám phá (`#guided-chat-section`) and Lịch trình (`#guided-tour-section`), scrollWidth exactly 390px (zero horizontal overflow), and `scrollY === 0`.
  - Font family: `"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif`
- **Regression Suite:**
  - `tools/check_ngonngon_render.cjs`: **13/13 PASSED (100%)** (zero-minute `0 phút`, explicit zero price range `0k`, explicit missing hours `giờ mở cửa: chưa rõ`, walking Maps URLs without keys).
  - `qa/e2e/test_ngonngon_qa.mjs`: **66/66 PASSED (100%)**, outputting cleanly to isolated `docs/reports/svg-fidelity/author-regression/`. Historical `docs/reports/ngonngon/*.png` preserved at `5633203`.
- **Visual Gate:** Final visual verdict is owned exclusively by Claude Sonnet 5.5.

---

## 2. Integrated Measured Metrics (1440×1024 Desktop)

| Component Property | Reference SVG Spec | Baseline (Before) | Compacted Integrated (Final) | Status / Classification |
|---|---|---|---|---|
| **Header Profile Slot** | ~97 px width | 130 px ("Khách ẩm thực") | **97 px** (`x: 1296, w: 97, h: 32`) | **Exact Geometry Match** |
| **Timeline Column Width** | 500 px | 537 px | **500 px** (`x: 560, w: 500`) | **Exact Geometry Match** |
| **Stop Card Dimensions** | 500w × 129h / 107h | Flex (~537px) × 216h | **500w × 130h** (y: 589, 775, 961) | **Target Match** (130h vs 129h ref, down from 216h) |
| **Stop Card 3 Viewport** | Scrollable below fold | Off-screen (>1260) | **Starts at y: 961, bottom 1091** | Truthfully reported (top visible in 1024 viewport) |
| **Stop Item Structure** | Dual Pill Row + Card | Single badge in card | **Time pill (34h) + Meta pill (35h) + Pill Actions + Card (130h)** | Conforming to Claude spec |
| **Stop Card Radius** | 8 px (`--nn-r-card`) | 16 px | **8 px** (`var(--nn-r-card, 8px)`) | Exact Geometry Match |
| **Stop Card Border** | `#D9D9D9` (`--nn-card-line`) | `#DDE7E1` | **`1px solid rgb(217, 217, 217)`** | Audited Color Match |
| **Stop Card Title Typography** | 23.7 px / 400, `#1E1E1E` | 18 px / 700, `#17352B` | **23.7 px / 400, `rgb(30, 30, 30)`** | Audited Typography Match |
| **Stop Card Desc Typography** | 16 px / 1.35, `#757575` | 13 px, `#62736D` | **16 px / 22px line, `rgb(117, 117, 117)`** | Audited Typography Match |
| **Stop Actions** | Pill row action (visual 34h / 44h hit) | Rectangular buttons | **Pill action button (`.nn-pill-action-btn`, 34h visual, 44h hit)** | Conforming |
| **Route Aside Panel** | 306w × 615h, mint `#EFF7F1`, r24 | 300w × 380h, white | **306w × 615h** (`x: 1078, y: 358`, mint `#EFF7F1`, r24) | **Exact Match** (306w × 615h at x1078) |
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
  - Stop replacement 409 revision conflict handling & state reconstruction preserved.
  - Free Google Maps walking directions CTA without paid API keys preserved (`https://www.google.com/maps/dir/?api=1&travelmode=walking...`).
- **Accessibility & Mobile UX:**
  - Zero horizontal overflow at 390px mobile viewport (`scrollWidth <= 390`).
  - Touch targets for all buttons and tabs >= 44px.
  - Accessible focus trapping and background inertness (`aria-hidden="true"`, `container.inert = true`) on modals.
