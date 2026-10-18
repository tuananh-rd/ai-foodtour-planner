# SVG Visual Fidelity Baseline Report (1440×1024 & 390×844)

## 1. Executive Summary & Harness Architecture
- **Harness Path:** `qa/visual/capture_fidelity.mjs`
- **Design Reference:** `D:/Downloads/UI ngonngon tour.svg` (verified SHA256: `f73364241a53daf697fd92521ee7aab5ff4cba843c2bf27fb0b14063428eb41d`), rasterized reference at `docs/design/ngonngon-tour-reference.png` (1440×1024, DPR 1).
- **Isolated Ports:** Web 13400, API 18400, CDP 19600 with strict preflight TCP refusal checks ensuring zero collisions with user or coordinator services.
- **Data Integrity:** Strict preflight verification asserting `health.dataset_source === "synthetic"`, `FOODTOUR_LLM = "mock"`, `FOODTOUR_PREVIEW = "0"`, and Chrome launched with blocked outbound Google host resolution (`--host-resolver-rules=MAP www.google.com ~NOTFOUND, MAP maps.googleapis.com ~NOTFOUND...`).
- **Scroll Normalization:** Explicit `window.scrollTo(0, 0)` reset and strict assertion `scrollY === 0` prior to capture and DOM geometry extraction, eliminating spatial comparison drift.
- **Deterministic Canvas Composites:** Headless browser 2D canvas generation for unmasked side-by-side (`2880×1024`) and 50% opacity overlay (`1440×1024`) without header-obscuring overlays.

---

## 2. Baseline Visual Artifacts Captured
1. `baseline_desktop_1440_empty.png` — Real UI empty/welcome state (1440×1024)
2. `baseline_desktop_1440_tour.png` — Real UI planned tour state at top scroll `scrollY === 0` (1440×1024)
3. `baseline_mobile_390_tour.png` — Real UI mobile itinerary tab (390×844)
4. `baseline_mobile_390_chat.png` — Real UI mobile conversation tab (390×844)
5. `reference_svg_1440.png` — Exact 1440×1024 rasterization of design reference
6. `baseline_composite_side_by_side_1440.png` — 2880×1024 unmasked side-by-side (Reference SVG Left vs Baseline Real UI Right)
7. `baseline_composite_overlay_1440.png` — 1440×1024 unmasked 50% transparency overlay
8. `baseline_metrics.json` — Bounding boxes, typography, colors, padding, and gaps extracted from DOM.

---

## 3. Measured Deviations vs. Reference Specification

| Component / Area | Reference SVG (1440×1024) | Baseline Real UI (Measured) | Deviation & Large Gaps |
|---|---|---|---|
| **Chat Container** | x: 32, w: 480px, h: 888px, r: 24px, shadow `0 8px 24px rgba(10,46,31,.10)` | x: 32, w: 460px, h: 880px, r: 24px | Width is 20px narrower (460 vs 480px). |
| **Assistant Cards (Understood / Clarify / Confirm)** | Mint bubble style (`#EFF7F1`, r: 16px, padding 16px, text 16/1.45) | White card containers (`#FFFFFF`), borders `#DDE7E1`, gray tables | UnderstoodCard lacks mint bubble background; inconsistent row typography; Clarify and Confirm cards have divergent padding. |
| **Tour Right Column** | x: 560, w: 824px, gap: 48px | x: 532, w: 861px, gap: 40px | Offset by -28px due to 460px left column. |
| **Metric Tiles (Row of 3)** | 3 cols × 265.7w × 95h, gap: 12.5px, fills: mint (`#EFF7F1`), peach (`#FFF6EC`), white (`#FFFFFF`) | 3 cols × 276w × 88h, gap: 16px, fills: `#F0F6F2`, `#FAF2EA`, `#FFFFFF` | Tiles are 10px wider and 7px shorter; token tints slightly diverge from SVG fills. |
| **Timeline Column Width** | 500px fixed width (x: 560–1060) | 537px dynamic flex | Width is 37px wider than reference 500px. |
| **Stop Item Structure** | Distinct pill row (time pill 34h green `#166B52` + meta pill 35h white outline) above card | Single time badge inline inside or above card; meta duration/price not separated into distinct pill | Missing dual pill-row (time pill + meta pill) above stop card. |
| **Stop Card Geometry & Styling** | 500w, r: 8px, 1px outline `#D9D9D9`, padding: 24px | Dynamic width, r: 16px, border `#DDE7E1`, padding: 18px | Card radius is 16px (spec is 8px); border is `#DDE7E1` (spec is audited `#D9D9D9`). |
| **Stop Card Typography & Colors** | Title: 23.7px/400 `#1E1E1E` (lh 1.25); Desc: 16px/1.35 `#757575` | Title: 18px/700 `#17352B`; Desc: 13px `#62736D` | Title is bold and smaller; description is 13px instead of 16px; colors use shell ink/mute rather than audited `#1E1E1E` and `#757575`. |
| **Stop Actions (Lock / Replace)** | Small ghost pills (visual 34h, hit 44h) | Standard rectangular blue/gray button | Needs ghost pill styling matching reference aesthetic. |
| **Route Overview Aside** | x: 1078–1384 (306w), r: 24px, mint `#EFF7F1`, inner card `#F7F8F2` with road bars + green line + orange/green nodes | x: 1093 (300w), r: 20px, white `#FFFFFF` | Aside container is white instead of mint; lacks reference inner card with road bars and schematic nodes. |
| **Trust Disclosure** | Disclosed subtle text under composer | Boxed panel with detailed borders | Needs simplification to 12px mute line + "Chi tiết" toggle. |

---

## 4. Immediate Action Plan (Six Leaf Implementation)
Per coordinator dispatch (`msg_9ce9bbf7b5e3`) and Claude specification `a0d3b43`:
1. Create `frontend/app/components/v2/guided/guided-leaves.css` defining leaf-scoped styles, pill rows, typography, and card tokens.
2. Implement `GuidedTimeline.jsx` with 500px width, dual pill row (time pill `#166B52` + meta pill), 8px radius cards, padding 24px, title 23.7px `#1E1E1E`, desc 16px `#757575`, outline `#D9D9D9`, and ghost pill action buttons.
3. Implement `UnderstoodCard.jsx`, `ClarifyQuestionCard.jsx`, and `ConfirmSummaryCard.jsx` inside mint bubbles (`#EFF7F1`, r: 16px) with clean row layout and reference chips.
4. Implement `TrustDisclosure.jsx` as single 12px mute line.
5. Implement `InlineRowEditor.jsx` popover with 16px radius, shadow, and 8px input radius.
6. Retain all test IDs, handlers, ARIA accessibility attributes, allergy/budget/confirmation gates, and 409 conflict handling.
