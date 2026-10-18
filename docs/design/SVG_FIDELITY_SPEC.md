# SVG fidelity spec — NgonNgon Tour desktop (owner: Claude)

Reference: `D:/Downloads/UI ngonngon tour.svg`, sha256 `f73364241a53daf697fd92521ee7aab5ff4cba843c2bf27fb0b14063428eb41d` (844 982 bytes; all text is outlined paths). Rendered with Chrome headless at 1440×1024, DPR 1, and visually inspected by Claude. The SVG is **design data only**: nothing is copied as a static UI, no sample content (Saigon/Quận 1/Tuấn/prices) is shipped. All numbers below were extracted from the SVG geometry (rect/path bounds), colours from its fills/strokes.

## 1. Global tokens (CSS variables in `frontend/app/components/v2/guided/guided-visual.css`, scope `.nn-root`)
| token | value | use |
|---|---|---|
| `--nn-bg` | `#F7F8F2` | page background, composer fill, map canvas |
| `--nn-card` | `#FFFFFF` | header, chat panel, cards, pills |
| `--nn-ink` | `#17352B` | headings, body text, bubble text |
| `--nn-mute` | `#62736D` | secondary text, placeholders |
| `--nn-line` | `#DDE7E1` | every 1px border/divider (header bottom, cards, pills, composer) |
| `--nn-green` | `#166B52` | primary: time pill, active nav pill, user bubble, route line/nodes, tip card |
| `--nn-mint` | `#EFF7F1` | assistant bubbles, metric tile 1, route panel |
| `--nn-peach` | `#FFF6EC` | metric tile 2 (and honest warning surface) |
| `--nn-lime` | `#DFF46A` | assistant avatar tile, star glyph in brand tile |
| `--nn-orange` | `#FF7A45` | send button, last route node |
| `--nn-track` | `#E0E8E0` | route canvas road bars |
| `--nn-card-line` | `#D9D9D9` | timeline card outline (original: outlined path fill `#D9D9D9`; pills keep `--nn-line`) |
| `--nn-card-title` | `#1E1E1E` | timeline card title (original `#1E1E1E`) |
| `--nn-card-desc` | `#757575` | timeline card description (original `#757575`) |
Tokens are defined on `.nn-root, .nn-dialog`: portals (TrustDisclosure dialog, ReplaceDiffModal) must put class `nn-dialog` on their wrapper. Radii: cards (timeline) 8px · tiles/bubbles/composer/avatar tiles/inner map card 16px · panels (chat, route) 24px · pills fully round. Panel shadow: `0 8px 24px rgba(10,46,31,.10)` (chat panel only). Spacing scale 8/12/16/24/32. Font: no web-font request; stack `"Segoe UI", system-ui…` (token `--nn-font`). The reference face is Inter-like; sizes below are **calibrated for Segoe UI so rendered string widths match the reference within ±2%** (measured in Chrome).

Type scale (px, weight): brand 18/600 · tour title 36.9/600 · chat title 18/600 · chat h2 24.6/600 · section heading 18.3/500→use 600 · timeline card title 23.7/400 (lh 1.25) · body/desc 16/400 `--nn-mute` · paragraph under h2 15/400 · metric value 18/600 · metric label 12.5/400 · metadata/pills 13/500 · eyebrow 12.8/600 letter-spacing .02em uppercase · caption/legal 12/400.

## 2. Desktop geometry @1440×1024 (all absolute px of the reference)
- Header: y0–80, white, 1px bottom `--nn-line`. Brand tile 42×42 r16 at (32,18.5) `--nn-green` with lime 4-point star; brand name x84, 18/600, subtitle 12 `--nn-mute`; nav pills start x250 (gap 8): active 89×34 `--nn-green` white 14/500; inactive 88×35 white 1px line; profile avatar 32px circle at x1311, name 13/600 + 12 caption at x1353, right padding 32.
- Page padding 32. **Chat panel** x32–512 (480 w) y108–996 (888 h), white, r24, shadow, inner padding 24 (content x56–488 = 432 w). Assistant tile 42×42 r16 `--nn-lime` at (56,132) with green star; title x110 18/600 (two lines: title + 12px subtitle); status pill right: 103×35, white, 1px line, 13px. `h2` 24.6/600 baseline ≈ y207; paragraph 15/1.5 width 432, wraps to 2 lines; chip row at y300 (pills h34–35, gap 8, padding 0 14, text 13/500: *selected* = filled `--nn-green` white, otherwise white + 1px line); divider 1px `--nn-line` at y352 (x56–488); messages from y369: assistant bubble `--nn-mint` r16, padding 16/16, text 16/1.45, max width 410; user bubble `--nn-green` white, max 356, left-aligned to x56 in the reference (we right-align? NO: keep reference alignment: both bubbles start at x56); vertical gap 12. Composer: box x56.5–487.5 (431 w), y914.5–971.5 (57 h), `--nn-bg` fill, 1px line, r16; placeholder 15 `--nn-mute`; send button 42×42 circle `--nn-orange` at (437,922) with white arrow; panel bottom padding 24.
- **Tour column** x560–1384 (824 w). Eyebrow y≈141; title 36.9/600 y≈158–200; subtitle 16 `--nn-mute` y≈214; action button top-right x1265.5–1383.5, y159–198 (118×39, r8, fill #E3E3E3, 1px #767676, 16px text) — in our build this slot holds a REAL action only (“Làm lại”), never “Lưu lịch trình”.
- **Metric tiles** y243.5–338.5 (95 h), 3 columns of 265.7 w, gap 12.5, r16, 1px line, fills mint / peach / white, padding 16 left 16 top; value 18/600 at y≈272, label 12.5 at y≈297.
- Section heading “Lộ trình …” 18.3 at y≈371.
- **Timeline** column x560–1060 (500 w): each item = pill row (time pill h34, `--nn-green`, white 13/500, padding 0 14, e.g. 63×34; meta pill h35 white 1px line, 13px, margin-left 8) then card (500 w, r8, white, 1px line, padding 24, title 23.7/400 `--nn-ink`, desc 16/1.35 `--nn-mute`); pill-row y396, card y439–568 (129 h: 2-line desc), next pill row y581 (gap 13 after card), card height 107 for 1-line desc.
- **Route panel** x1078–1384 (306 w) y357–972 (615 h), `--nn-mint`, r24, padding 18; title 18.4 at x1096 y≈393; mode pill (60×35 white line) at x1305.5; inner map card x1096–1366 (270 w) y425–862 (437 h) fill `--nn-bg`, r16, with 3 road bars (`--nn-track`, 10 h, r5, widths 300/220 spanning card), a vertical 8px `--nn-green` line x1214 from y485 to 785, nodes 40px circles (numbers white 14/700; last node `--nn-orange`), label tags white r10 h28 left/right of nodes (13px); tip card x1096–1366, y876–954 (270×78) `--nn-green`, r16, title lime 13/600, text white 12px.

## 3. Honesty mapping (what the reference shows vs what we may show)
| reference | our build |
|---|---|
| “Tuấn / TP. Hà Nội”, “Chào Tuấn”, Saigon, Quận 1 | never; anonymous local profile “Khách / Hà Nội” |
| “Đang online” pill | “Hà Nội” (no live-status claim) |
| “Bộ sưu tập”, “Lưu lịch trình” | omitted/replaced by real controls |
| “≈ 450K ngân sách/người”, “1,8 km” | real `budget` (+ scope text) / real leg km only when `source!=unknown`, else “Chưa rõ”; legit 0 stays 0 |
| route graphic | ordered-stop schematic titled “Sơ đồ tuyến” + caption “Thứ tự điểm dừng, không phải bản đồ thật”; free Google Maps link CTA inside the panel |
| “Mẹo nhỏ: Xuất phát trước 18:10…” | static honest tip about checking hours/prices; no invented traffic claim |
| assistant bubbles | the real assistant blocks (text, understood, clarify, confirm) rendered as mint bubbles |

## 4. Leaf brief for Antigravity (exact paths; all must keep every `data-testid`, handler prop, aria role and the strings the regression tests assert)
Antigravity may edit ONLY: `frontend/app/components/v2/guided/{UnderstoodCard,ClarifyQuestionCard,ConfirmSummaryCard,GuidedTimeline,TrustDisclosure,InlineRowEditor}.jsx` and create `frontend/app/components/v2/guided/guided-leaves.css` (import it from the leaves). It must NOT touch `GuidedLayout.jsx`, `guided-visual.css`, `ReplaceDiffModal.jsx`, globals, backend, contracts. Use `var(--nn-*)` tokens (defined on `.nn-root`, an ancestor of every leaf); never redefine them.
1. **GuidedTimeline.jsx** (right column, width 500): render each stop as the reference pair: *pill row* (time pill = `stop.arrive` else “Chưa rõ giờ”; meta pill = `{leg minutes}` “phút” only when known (label “ước tính”), plus venue price range short form “45–65K” only when `price.min/max` exist and the text “theo nguồn”; unknown values are “Chưa rõ”, 0 stays 0) then a *card* (500 w, r8, 1px line, padding 24): title (venue name, 23.7/400), description line (dish tags / address, 16 mute), hours line “nguồn ghi: …” 13px mute, evidence badge, and the real actions (Khoá/Mở khoá, Đổi quán) as small ghost pills (min-height 44 hit area, visual 34). Gap between items 13. Top: section heading “Lộ trình” 18.3/600 and, below the last card, the status/warning area (conditional/insufficient evidence, allergy `unknowns`, free Google Maps CTA = primary green pill 44h, “Làm lại” secondary). Warnings are MANDATORY before confirmation and in the timeline; keep them visible above the first card.
2. **UnderstoodCard.jsx / ClarifyQuestionCard.jsx / ConfirmSummaryCard.jsx** (inside the chat panel, width ≤410, they replace the reference’s bubbles): outer element = assistant bubble style (`--nn-mint`, r16, padding 16, text 16/1.45, no heavy shadow). Understood rows: label 13 mute left, value 15/600 right, 1px `--nn-line` separators, “Sửa” as 44px-hit text button; the Dị ứng row is ALWAYS visible; allergy/safety notices on `--nn-peach` with `--nn-warn-*`. Clarify: question text 16/600, option chips = reference pills (h34 visual / 44 hit, 13/500, 1px line, selected = filled green), free-text row = reference composer style (r16, `--nn-bg`). Confirm: summary rows as above, then warnings block (peach), shortlist with venue NAMES, “Đúng, lập tour” primary green pill (44h, white 14/600) + “Sửa” secondary; budget scope text from the real scope (mỗi người / cả nhóm / chưa rõ).
3. **TrustDisclosure.jsx**: reduce to one 12px mute line + “Chi tiết” disclosure, placed under the composer, no extra box.
4. **InlineRowEditor.jsx**: popover r16, white, 1px line, shadow `0 8px 24px rgba(10,46,31,.10)`, inputs r8, buttons as above; focus ring 2px `--nn-green`.
Mobile (≤1000px): leaves are width:100%, no fixed widths, chips wrap, touch targets ≥44, no horizontal scroll at 390.
Evidence required from Antigravity: Playwright/CDP screenshots at 1440×1024 and 390×844 of empty/clarify/confirm/tour (synthetic, labelled), plus the existing regression suites listed in AGENTS.md; Claude does the visual verdict.

## 5. Residual log
See `docs/reports/CLAUDE_VISUAL_FIDELITY.md` (measured deviations after implementation).
