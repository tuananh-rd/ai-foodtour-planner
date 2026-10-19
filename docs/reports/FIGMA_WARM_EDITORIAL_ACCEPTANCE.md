# Warm editorial — local integration accepted with recorded visual limits

Codex reviewed and integrated Antigravity frontend changes through fef4d34 at9af6126. The new Figma frame1:145 replaces the historical SVG target. Same existing Antigravity terminal was reused; Claude remained inactive. Original PNG was visually inspected and retained internally, never shipped as static product UI.

## Current verification

| Scope | Result | Evidence / limits |
|---|---|---|
| Implementer targeted UI checks | PASS50/50 | qa/figma-warm-editorial/evidence.json; synthetic/rules, isolated13600/18600 |
| Integrated independent browser regression | PASS190/190 | figma-warm-editorial-regression-accepted.json; repaired200% reflow and source metadata; earlier25cd216 run187/190 retained separately |
| Production build9af6126 | PASS147kB first load | Private immutable snapshot .venv/warm-editorial-9af6126/frontend; compiled API8100 |
| Actual production UI desktop/mobile | PASS60/60 | figma-warm-editorial-delivery/browser-evidence.json; console errors0, external browser origins0, real PMTiles206/tiles/markers/toggle/keyboard, Maps/replace/reload/offline |
| Citation/mock-provider lane | PASS32/32 desktop/mobile | figma-warm-editorial-mock-citations-final/browser-evidence.json; actual production UI, only external provider fixture, zero external calls; citations/time/cache/quota/retry/offline/injection/privacy/state invariance |
| Backend/contracts | Retained prior evidence | Backend/API contracts unchanged;661 backend tests/one optional private-data skip, OpenAPI drift and18 contracts were already green; no full repeat |
| Live providers | NOT PROBED | Tavily account-metadata blocker unchanged; Gemini PARTIAL, no new calls or cap increases |

## Runtime and visual limits

Test URL: **http://127.0.0.1:3100**. Production frontend9af6126, real synthetic/rules API8100 reporting builddcd0fbd (same backend source), search disabled in this isolated process. Local backend/.env and provider caps remain unchanged. Old3060/8060/8080 servers were preserved. The test target never represents synthetic venues as live data.

Actual1440x1024 and390px captures are in figma-warm-editorial-delivery/. Initial-state side-by-side/overlay are figma-initial-comparison-side.png and figma-initial-comparison-overlay.png; generated from the actual captured image and original PNG. Tour comparison also records automatic scroll to the Maps CTA; this scrolled state must not be mistaken for missing hero/metrics. Geographic mobile screenshot shows actual local tile rendering, marker popup and attribution.

Core sidebar232px, left chat668px at264/98, right column452px at956/98 match the reference anchors. Remaining differences: system-font/glyph rendering and some baseline/wrap positions; hero starts170 versus reference158 (+12px), metrics372 versus364 (+8px); source metadata, warnings, real controls and natural scroll enlarge dynamic cards. Unsupported saved/history/account/share affordances were removed/replaced with truthful local actions. Sidebar sample trips are explicitly quick suggestions. Pixel sample sidebar matches112/41/20; canvas sample248/195/61 versus reference249/197/61 reflects actual shading rather than a claim of pixel identity. Sampled contrast results do not establish full WCAG conformance or physical-device validation.

Fixed review findings include invented times/prices/counts, group budget mislabeled per-person, fabricated recent history/no-op controls, hidden price/leg metadata, mobile hidden-composer focus and200% clipped controls. Unknown facts remain unknown; allergy/confirmation/privacy/revision gates and free Google Maps navigation remain required.

Production probe driver was updated for separate map/list views: switch through actual controls before replacement and before verifying an offline tour still exists. Earlier driver failures are not product data-loss evidence. No push/deploy, paid activation or user-server shutdown occurred.

The separate mock-citation pointer driver opened the trust-disclosure modal on mobile, trapping focus and timing out before sending a query. The final probe uses native checkbox focus/Space opt-in and verifies composer focus, passes both viewports and records zero external network calls. Earlier diagnostic folders remain local and are not represented as product failures or passing live evidence. Mouse opt-in is separately exercised by the production60-check lane. No source change followed the accepted190-check run; subsequent changes only adapt test drivers/documentation.

Local UI gates are accepted by Codex after independent source/image review and final integrated testing. Remaining visual deviations and unverified live-provider quality above are explicit limits, not hidden unfinished tests. Same Antigravity remains retained with no active task. Full-provider/physical-device/WCAG certification is outside this acceptance.
