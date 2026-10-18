# SVG Visual Fidelity Implementation & QA Acceptance Report

## 1. Executive Summary
- **Ownership Scope:** Antigravity implemented the 6 authorized leaf components (`UnderstoodCard.jsx`, `ClarifyQuestionCard.jsx`, `ConfirmSummaryCard.jsx`, `GuidedTimeline.jsx`, `TrustDisclosure.jsx`, `InlineRowEditor.jsx`) and created `frontend/app/components/v2/guided/guided-leaves.css` per Claude specification `a0d3b43` / `5633203` and Codex timeline color audit.
- **Harness & Tooling:** Reusable CDP visual fidelity suite at `qa/visual/capture_fidelity.mjs`, running on isolated ports (Web: 13400, API: 18400, CDP: 19600) with TCP preflight refusal, synthetic health pre-check (`health.dataset_source === "synthetic"`), Google host blocking, and strict scroll normalization (`window.scrollY === 0`).
- **Regression Suite:** `qa/e2e/test_ngonngon_qa.mjs` executed 66 interaction checks across desktop (1440×1024) and mobile (390×844) — **66/66 PASSED (100%)**.

---

## 2. Before vs. After Measured Metrics (1440×1024 Desktop)

| Component Property | Reference SVG Spec | Baseline (Before) | Post-Implementation (After) | Status |
|---|---|---|---|---|
| **Timeline Column Width** | 500 px | 537 px | **500 px** (`x: 560, w: 500`) | Exact Match (0px diff) |
| **Stop Card Width** | 500 px | Dynamic flex (~537px) | **500 px** (`x: 560, w: 500`) | Exact Match (0px diff) |
| **Stop Item Structure** | Dual Pill Row + Card | Single badge inside card | **Time pill (34h green) + Meta pill (35h outline) + Card** | Exact Match |
| **Stop Card Radius** | 8 px (`--nn-r-card`) | 16 px | **8 px** (`var(--nn-r-card, 8px)`) | Exact Match |
| **Stop Card Border** | `#D9D9D9` (`--nn-card-line`) | `#DDE7E1` | **`#D9D9D9`** (`var(--nn-card-line, #D9D9D9)`) | Audited Match |
| **Stop Card Title Font & Color** | 23.7 px / 400, `#1E1E1E` | 18 px / 700, `#17352B` | **23.7 px / 400, `#1E1E1E`** | Audited Match |
| **Stop Card Desc Font & Color** | 16 px / 1.35, `#757575` | 13 px, `#62736D` | **16 px / 1.35, `#757575`** | Audited Match |
| **Stop Actions** | Ghost pills (34h visual, 44h hit) | Rectangular buttons | **Ghost pills (`.nn-ghost-pill`, 34h/44h)** | Exact Match |
| **Understood Card Style** | Mint bubble (`#EFF7F1`, r16) | White bordered box | **Mint bubble (`.nn-assistant-bubble`, `#EFF7F1`, r16)** | Exact Match |
| **Understood Rows** | Label 13 mute, Val 15/600, 1px line | Inconsistent gray table | **Label 13 mute, Val 15/600, 1px line dividers** | Exact Match |
| **Clarify Options** | Reference pills (34h visual, 44h hit) | Generic square buttons | **Reference pills (`.nn-pill`, 35h/44h, green selected)** | Exact Match |
| **Confirm Primary Action** | Green pill (44h, white text) | Orange button | **Green pill (`.nn-confirm-primary`, 44h, `#166B52`)** | Exact Match |
| **Trust Disclosure** | Single 12px mute line under composer | Boxed panel | **Single 12px line + `.nn-dialog` portal modal** | Exact Match |
| **Inline Row Editor** | Popover r16, input r8, focus ring | Simple box | **Popover r16, shadow, input r8, focus ring 2px green** | Exact Match |
| **Route Aside Panel** | 306w, r24, mint `#EFF7F1`, h: 615 | 300w, white `#FFFFFF`, h: 380 | **x: 1078, w: 291px, h: 615px, mint `#EFF7F1`, r24** | Near Exact |

---

## 3. Verified Artifacts Produced
- `docs/reports/svg-fidelity/baseline_composite_side_by_side_1440.png` — Baseline 2880×1024 unmasked side-by-side
- `docs/reports/svg-fidelity/baseline_composite_overlay_1440.png` — Baseline 1440×1024 unmasked 50% overlay
- `docs/reports/svg-fidelity/post_impl_desktop_1440_empty.png` — Post-implementation empty state
- `docs/reports/svg-fidelity/post_impl_desktop_1440_tour.png` — Post-implementation planned tour state (`scrollY === 0`)
- `docs/reports/svg-fidelity/post_impl_mobile_390_tour.png` — Post-implementation mobile tour tab (390×844)
- `docs/reports/svg-fidelity/post_impl_mobile_390_chat.png` — Post-implementation mobile chat tab (390×844)
- `docs/reports/svg-fidelity/post_impl_composite_side_by_side_1440.png` — Post-implementation 2880×1024 unmasked side-by-side
- `docs/reports/svg-fidelity/post_impl_composite_overlay_1440.png` — Post-implementation 1440×1024 unmasked 50% overlay
- `docs/reports/svg-fidelity/post_impl_metrics.json` — Exact DOM bounding boxes and computed styles

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
