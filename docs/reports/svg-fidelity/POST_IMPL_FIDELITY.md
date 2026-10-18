# SVG Visual Fidelity Implementation & QA Acceptance Report

## 1. Executive Summary
- **Ownership Scope:** Antigravity implemented the 6 authorized leaf components (`UnderstoodCard.jsx`, `ClarifyQuestionCard.jsx`, `ConfirmSummaryCard.jsx`, `GuidedTimeline.jsx`, `TrustDisclosure.jsx`, `InlineRowEditor.jsx`) and `frontend/app/components/v2/guided/guided-leaves.css` per Claude visual specifications (`a0d3b43` / `5633203` / `14bafaf`) and coordinator instructions (`msg_c8134362d0a1`, `msg_8f32bae63760`, `msg_a5a6833263ed`).
- **Card Compaction & Layout Refinement:** Timeline stop cards were compacted from an initial 216px down to **130px** (conforming to the reference target of 129h for two-line descriptions and 107h for one-line descriptions). Replaced the redundant inline card hour and action rows by moving the replace button ("Đổi quán") and lock status to the right side of the pill row (visual 34h with >=44px touch hit area), and embedding source hours compactly into the description. Coordinated a single `"Lộ trình"` section heading (18.3px / 600, line-height 28px, margin-bottom 11px) with the status badge aligned to the right.
- **Harness & Tooling:** Reusable CDP visual fidelity suite at `qa/visual/capture_fidelity.mjs`, running on isolated ports (Web: 13400, API: 18400, CDP: 19600) with TCP preflight refusal, synthetic health pre-check (`health.dataset_source === "synthetic"`), Google host blocking, strict scroll normalization (`window.scrollY === 0`), and unmasked 2880×1024 side-by-side and 1440×1024 50% overlay composites.
- **Provenance & Environment:**
  - `sourceHead`: `2dcdc8ab84ce62bbdf30e7a4a88d90e1a57a1142`
  - `frontendDirty`: `false`
  - Viewport: `innerWidth: 1440`, `clientHeight: 1024`, `clientWidth: 1425` (15px default scrollbar gutter), `scrollY: 0`
  - Font family: `"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif`
- **Regression & Probe Suites:**
  - `tools/check_ngonngon_render.cjs` executed 13 React SSR semantic probes — **13/13 PASSED (100%)**, verifying zero-minute leg format (`0 phút`), explicit zero venue range (`0k`), explicit missing hours (`giờ mở cửa: chưa rõ`), and walking Maps links.
  - `qa/e2e/test_ngonngon_qa.mjs` executed 66 interaction checks across desktop (1440×1024) and mobile (390×844) — **66/66 PASSED (100%)**, outputting cleanly to isolated `docs/reports/svg-fidelity/author-regression/`. Historical `docs/reports/ngonngon/*.png` evidence was cleanly preserved at `5633203`.
- **Visual Gate:** Final visual acceptance is owned exclusively by Claude Sonnet 5.5.

---

## 2. Before vs. After Measured Metrics (1440×1024 Desktop)

| Component Property | Reference SVG Spec | Baseline (Before) | Initial Post-Impl | Compacted Post-Impl (Latest) | Status / Classification |
|---|---|---|---|---|---|
| **Timeline Column Width** | 500 px | 537 px | 500 px | **500 px** (`x: 560, w: 500`) | Exact Geometry Match |
| **Stop Card Dimensions** | 500w × 129h / 107h | Flex (~537px) | 500w × 216h | **500w × 130h** (y: 613, 799, 985) | **Target Match** (130h vs 129h ref, down from 216h) |
| **Stop Item Structure** | Dual Pill Row + Card | Single badge in card | Pill row + card | **Time pill (34h) + Meta pill (35h) + Pill Actions + Card (130h)** | Conforming to Claude spec |
| **Stop Card Radius** | 8 px (`--nn-r-card`) | 16 px | 8 px | **8 px** (`var(--nn-r-card, 8px)`) | Exact Geometry Match |
| **Stop Card Border** | `#D9D9D9` (`--nn-card-line`) | `#DDE7E1` | `#D9D9D9` | **`1px solid rgb(217, 217, 217)`** | Audited Color Match |
| **Stop Card Title Typography** | 23.7 px / 400, `#1E1E1E` | 18 px / 700, `#17352B` | 23.7 px / 400 | **23.7 px / 400, `rgb(30, 30, 30)`** | Audited Typography Match |
| **Stop Card Desc Typography** | 16 px / 1.35, `#757575` | 13 px, `#62736D` | 16 px / 1.35 | **16 px / 22px line, `rgb(117, 117, 117)`** | Audited Typography Match |
| **Stop Actions** | Pill row action (visual 34h / 44h hit) | Rectangular buttons | Card bottom row | **Pill action button (`.nn-pill-action-btn`, 34h visual, 44h hit)** | Conforming |
| **Route Aside Panel** | 306w × 615h, mint `#EFF7F1`, r24 | 300w × 380h, white | 291w × 615h | **306w × 615h** (`x: 1078`, mint `#EFF7F1`, r24) | **Exact Match** (306w × 615h at x1078) |
| **Understood Card Style** | N/A (not in SVG) | White bordered box | Mint bubble | **Mint bubble (`.nn-assistant-bubble`, `#EFF7F1`, r16)** | Derived Extension (Provisional) |
| **Understood Rows** | N/A (not in SVG) | Gray table | Label/Val rows | **Label 13 mute, Val 15/600, 1px line, Dị ứng always visible** | Derived Extension (Provisional) |
| **Clarify Options** | N/A (not in SVG) | Square buttons | Reference pills | **Reference pills (`.nn-pill`, 35h/44h, green selected)** | Derived Extension (Provisional) |
| **Confirm Primary Action** | N/A (not in SVG) | Orange button | Green pill | **Green pill (`.nn-confirm-primary`, 44h, `#166B52`)** | Derived Extension (Provisional) |
| **Trust Disclosure** | N/A (not in SVG) | Boxed panel | Mute line | **Single 12px line + `.nn-dialog` portal modal** | Derived Extension (Provisional) |
| **Inline Row Editor** | N/A (not in SVG) | Simple box | Popover r16 | **Popover r16, shadow, input r8, focus ring 2px green** | Derived Extension (Provisional) |

---

## 3. Verified Artifacts Produced
- `docs/reports/svg-fidelity/baseline_composite_side_by_side_1440.png` — Baseline 2880×1024 unmasked side-by-side
- `docs/reports/svg-fidelity/baseline_composite_overlay_1440.png` — Baseline 1440×1024 unmasked 50% overlay
- `docs/reports/svg-fidelity/baseline_metrics.json` — Pre-implementation DOM geometry
- `docs/reports/svg-fidelity/BASELINE_FIDELITY.md` — Baseline deviation enumeration
- `docs/reports/svg-fidelity/post_impl_desktop_1440_empty.png` — Compacted empty state
- `docs/reports/svg-fidelity/post_impl_desktop_1440_tour.png` — Compacted planned tour state (`scrollY === 0`)
- `docs/reports/svg-fidelity/post_impl_mobile_390_tour.png` — Mobile tour tab (390×844)
- `docs/reports/svg-fidelity/post_impl_mobile_390_chat.png` — Mobile chat tab (390×844)
- `docs/reports/svg-fidelity/post_impl_composite_side_by_side_1440.png` — Compacted 2880×1024 unmasked side-by-side
- `docs/reports/svg-fidelity/post_impl_composite_overlay_1440.png` — Compacted 1440×1024 unmasked 50% overlay
- `docs/reports/svg-fidelity/post_impl_metrics.json` — Compacted DOM bounding boxes, computed styles, and provenance

---

## 4. Regression & Behavioral Verification
- **Functional Gates Preserved:**
  - Null vs 0 distinction preserved across duration, stops, and visit minutes.
  - Allergy safety disclaimer preserved with calm warning in peach box (`--nn-peach`).
  - Budget ceiling note and dynamic scope restore (`mỗi người` vs `cả nhóm`) fully preserved.
  - Single clarify question rule and confirmation gate preserved.
  - Stop replacement 409 revision conflict handling & state reconstruction preserved.
  - Free Google Maps walking directions CTA without paid API keys preserved (`https://www.google.com/maps/dir/?api=1&travelmode=walking...`).
- **Accessibility & Mobile UX:**
  - Zero horizontal overflow at 390px mobile viewport (`scrollWidth <= 390`).
  - Touch targets for all buttons and tabs >= 44px.
  - Accessible focus trapping and background inertness (`aria-hidden="true"`, `container.inert = true`) on modals.
