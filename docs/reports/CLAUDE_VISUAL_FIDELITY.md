# Claude visual fidelity report (owner: Claude) — task_7c68da1f86e6

Status: **INTERIM (shell checkpoint 5633203 + follow-up).** Final verdict is issued only after Codex supplies integrated leaf (Antigravity) + browser evidence.

## 1. Reference inspection
- Original: `D:/Downloads/UI ngonngon tour.svg`, sha256 `f73364241a53daf697fd92521ee7aab5ff4cba843c2bf27fb0b14063428eb41d`, 844 982 bytes, `viewBox 0 0 1440 1024`, text outlined to paths (no fonts embedded). Treated as untrusted design data; nothing from it is executed or shipped as a static UI. Only two icon glyph paths (4-point star, send arrow) are inlined as decorative SVG.
- Rendered by Claude with Chrome headless at 1440×1024, DPR 1 → `claude-svg-fidelity/original_render_1440x1024.png` (191 177 bytes) and **viewed** before implementation. Geometry (x/y/w/h/radii), colours and shadow were extracted from the SVG shapes (see `docs/design/SVG_FIDELITY_SPEC.md`).
- Font sizes were calibrated so that rendered string widths in Segoe UI equal the reference widths (measured in Chrome for 14 reference strings; ±2%). The reference face is Inter-like; no web-font request is made.

## 2. What was implemented (owned files only)
`frontend/app/components/v2/guided/GuidedLayout.jsx` (shell JSX moved from inline styles to classes; all hooks/handlers/testids/aria and the functional logic above the render are unchanged), `frontend/app/components/v2/guided/guided-visual.css` (tokens + shell, scoped under `.nn-root`/`.nn-dialog`), `docs/design/SVG_FIDELITY_SPEC.md`, this report, evidence in `docs/reports/claude-svg-fidelity/`.

Shell geometry reproduced at 1440×1024: header 80px (brand tile 42, nav pills from x250, anonymous profile), chat panel 32,108 480×888 r24 with shadow `0 8px 24px rgba(10,46,31,.10)` and 24px padding (assistant tile, 24.6px h2, 15px lead, pill chips, divider at y352, mint/green bubbles, composer 57px with 42px orange send), tour column x560–1384 (eyebrow, 36.9px title, subtitle, three 96px tiles r16 mint/peach/white), timeline column 500px + route panel 306×615 (mint r24, schematic canvas with road bars, 8px green line, 40px nodes, white tags, caption, 78px green tip card). Route panel is fixed 615px and sticky so a long real timeline does not stretch it.

## 3. Honest differences by design (not residual bugs)
| reference | shipped | reason |
|---|---|---|
| “Tuấn / TP. Hà Nội”, “Chào Tuấn”, Saigon/Quận 1 | “Khách ẩm thực / Hà Nội”, real chat text | no invented identity/location |
| “Đang online” pill | “Hà Nội” pill (same 103×35 slot) | no live-status claim |
| “Bộ sưu tập” pill, “Lưu lịch trình” button | omitted; “Làm lại” (real) takes the button slot, same 118×39 geometry/colours | no fake features |
| “1,8 km”, “≈450K”, sample venues/times | real values or “Chưa rõ”/“—” | no invented facts |
| route graphic as a map | titled “Sơ đồ tuyến” with caption “không phải bản đồ thật” | no invented geometry |
| privacy + trust lines | placed above the composer (small), composer box keeps its reference y | mandatory honesty copy |

## 4. Measured comparison (shell checkpoint, synthetic data)
Method: `docs/reports/claude-svg-fidelity/compare_*` are PIL composites of the reference render and the real UI screenshot (same size 1440×1024): side-by-side, 50% overlay and absolute difference; the numbers below are mean absolute RGB difference per region (0 = identical, 255 = max). Text content differs by design so even a perfect frame has a non-zero floor.

| region | empty state | tour state | note |
|---|---|---|---|
| header | 5.9 | 6.0 | text/identity differences only; nav pill x250 aligned |
| chat panel | 20.0 | 25.7 | leaf cards (understood/clarify/confirm) still use the old inline styles until Antigravity lands the leaf brief |
| tour head | 18.2 | 16.7 | different title/subtitle strings |
| metrics | 5.8 | 5.7 | frame, fills and text lines coincide |
| timeline column | 10.8 | 22.2 | tour state uses the unrestyled GuidedTimeline leaf |
| route panel | 9.7 | 5.2 | canvas bars/nodes/tip coincide; tags carry real names |

Visually (overlay): header, chat panel frame, composer, divider, metric tiles, timeline card frames, route panel, canvas, bars, line, nodes and tip card coincide within ~1–2 px. Known measured residuals at this checkpoint: (a) profile avatar sits ~32px left of the reference because “Khách ẩm thực” is wider than “Tuấn”; (b) first chip row widths differ (“Hoàn Kiếm” vs “Quận 1”); (c) leaf cards (see §5); (d) timeline pills/cards not yet at reference typography (Antigravity scope).

## 5. Open until integration
- Leaf restyle (Antigravity, routed by Codex): UnderstoodCard, ClarifyQuestionCard, ConfirmSummaryCard, GuidedTimeline, TrustDisclosure, InlineRowEditor.
- Final side-by-side/overlay of the integrated build, mobile review (390×844), regression evidence — to be recorded here with the final verdict.

## 6. Regression evidence for the shell commit
- `qa/e2e/test_ngonngon_qa.mjs` (66 interaction/regression checks, synthetic isolated build): **66/66 PASS** on 5633203 and on the follow-up tweaks. (The run overwrites tracked `docs/reports/ngonngon/*.png`; I restored them with `git checkout`, nothing committed.)
- `qa/e2e/test_guided_ui.mjs`: FAILS at START-02 **before any of my changes too** (the assertion expects a welcome sentence ending “nếu thiếu.” while the shipped text — which I did not alter — continues “nếu thiếu thông tin để xếp lịch trình chuẩn nhất.”); reported to Codex, not masked.
- Mobile 390×844 screenshots reviewed: no horizontal overflow (scrollWidth 390), stacked chat → tour tabs, composer reachable.

## 7. Decision-state fix (Codex finding: confirmation card cropped at 1280×800)
Root cause: the confirm card was the last item of an internally scrolling stream, below the understood card. Fix (shell only): the pending Clarify or Confirm card is pinned first in the chat panel (`.nn-pin`, order -1); while deciding, the intro (h2/lead/chips/rule) collapses, and the confirming panel grows (`height:auto`, not sticky) instead of scrolling inside itself. All warnings stay in the card; nothing hidden or removed; mobile stacked layout unchanged.

Measured (synthetic, default scrollbars, Chrome 1280×800, scrollY 0, innerWidth 1280, documentElement.clientWidth 1265 = 15px gutter):
- confirm card y202–657.3; "Đúng, lập tour" button y564.3–612.3 (fully inside 800).
- clarify card y202–419.5 (question + options in first viewport).
- route panel stays 306 wide (x903) with the gutter; at 1440×1024 without scroll clientWidth 1440, route x1078 w306, tiles 824 wide; with the 15px gutter (clientWidth 1425) tiles are 809 wide, route still 306.
- `qa/e2e/test_ngonngon_qa.mjs`: 66/66 PASS after the fix (tracked `docs/reports/ngonngon` restored, not committed).
- Icon glyphs calibrated to reference: star 13.824², arrow 16.326×12.06.

## 8. Native gutter / frame sizing (on integrated root e3f8251)
Problem: with a 15px default scrollbar (innerWidth 1440, clientWidth 1425) the tour column shrank to 809, so with the route panel fixed at 306 the timeline cards became 485 instead of 500.
Fix: `.nn-main` right padding is `clamp(32px, 56px - (1440px - 100%), 56px)`: the 15px gutter is absorbed by the right page padding (56 to 41) instead of squeezing the content; no scaling, no masking, no `scrollbar-gutter` hack. Measured at 1440×1024 default scrollbars (clientWidth 1425, scrollY 0): tiles x560 w824, route panel x1078 w306 (exactly the reference columns); at 1280×800 (clientWidth 1265): route x927 w306, tiles w673. Tip card text no longer clipped (display:block span, 78px).
Residual (honest): below ~1425px the tour column shrinks, as designed for responsive desktop; the reference exists only at 1440.
Post-tour stream: the chat stream keeps normal chat behaviour (scrolls to latest bubble); intro stays as in the reference. No facts removed.
Regression: test_ngonngon_qa 66/66 PASS on this change.

## 9. Header profile slot (approved by coordinator)
Profile name shortened to the truthful "Khách" (sub "Hà Nội"); `.nn-profile` fixed 97px so the avatar sits at x1311 and the name at x1353 exactly like the reference (measured 1440×1024). No identity or status invented. After compact warnings (2dcdc8a) the first pill row starts at y≈570 (was 594); heading→warning gap (~24px) and warning→unknowns gap (~0–8px) remain; the deliberate warning block height is assessed separately from the reference in the final verdict.

## 10. Final visual findings on integrated b31a4f1 (INTERIM until corrected mobile capture)
Viewed: original render, `svg-fidelity/integrated_composite_{side_by_side,overlay}_1440.png`, Codex `interactions/mobile-{tour,confirm}.png`, plus my own re-render at 390×844.
**Matches (frame):** header 80px; chat panel 32/108 480×888; tour column 824 (tiles x560); route panel x1078 306×615 (also with a 15px default scrollbar gutter, absorbed by page padding); metric tiles; "Lộ trình" heading row; compact stop cards 130px (reference 129/107); pill row (time pill, meta pill; real "Đổi quán" at the right); route canvas, nodes, tip card; composer/send; star/arrow glyph sizes; header profile avatar x1311 / name x1353.
**Deviations (enumerated):**
1. Third card bottom y1091 > 1024 (3 full cards not visible): cause is the mandatory warning stack (~140px) above the first pill row; reference has none. Brief: merge into one block (see below), target ≤ ~55px, third card bottom ≈1000.
2. Card title/desc strings and metric values are real or "[SYNTHETIC]" data, not the reference sample content (by design). Descriptions include "nguồn ghi" hours text, so card text is 2 lines where the reference has 1-2.
3. Header: "Bộ sưu tập" and "Tuấn/TP. Hà Nội"/"Đang online" intentionally absent (no fake features/identity); nav shows "Lịch trình (3)".
4. "Lưu lịch trình" is the real "Làm lại" (same 118×39 slot).
5. Chat bubble content differs (real chat; the intro and a "Minh hiểu là…" card sit in the stream); the chat stream scrolls internally.
6. Mobile: header now one row (brand, Làm lại, avatar) after my fix (it had wrapped the avatar to row 2); tour tab and confirm views are legible with no horizontal scroll.
**Residual measured:** only the items above; not claimed as 1–2px overall: the tour state differs by the warning height and real strings.

## 11. Correction: header profile at default scrollbars
Correction to sections 9/10: my x1311/x1353 measurement was taken with hidden scrollbars (clientWidth 1440). At the DEFAULT scrollbar (innerWidth 1440, clientWidth 1425) the header still had fixed 32px right padding, so the profile sat at x1296 (avatar) / x1338 (name), 15px left of the reference. Fix: header right padding `clamp(16px, calc(32px - (1440px - 100%)), 32px)` (17px at clientWidth 1425, 32px at 1440; mobile media query overrides to 16px, unchanged). Re-measured with default scrollbars (clientWidth 1425): avatar x1311 y23.5 32×32, name x1353 (also x1311/x1353 at clientWidth 1440); route panel x1078 w306 in both. Mobile 390: header one row, avatar x342, no overflow. Earlier claim "avatar exact" applied only to the hidden-scrollbar case; it now holds in both captures, to be confirmed by Codex's default-scrollbar integrated capture.

## 12. Merged evidence warning (GuidedTimeline.jsx, ownership released to Claude)
The two stacked blocks (conditional status + unknowns) became ONE peach block above the first card: "⚠️ Lịch trình có điều kiện: Chưa xác minh: thành phần để đánh giá dị ứng · giờ mở cửa · giá theo người · tuyến đường thực." Testids kept (`timeline-conditional-status` outer, `timeline-unknowns` inner span, `timeline-route-warnings` unchanged); all four distinct unknowns kept, unrecognised ones appended with full text; no hide/clamp; no allergy-safety claim. Measured (Chrome 1440×1024, default scrollbars, clientWidth 1425, synthetic fixture): warning box 500×54 (was ~140 total); cards y509/695/881, h130 each; third card bottom y1011 ≤ 1024 → three full cards visible. SSR `tools/check_ngonngon_render.cjs` 15/15 PASS.
