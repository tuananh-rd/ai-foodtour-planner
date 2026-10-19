# Approved assistant UI extension — bounded specification

Preserve the accepted SVG geometry/tokens in SVG_FIDELITY_SPEC.md. This initiative authorizes Codex coordination/review and bounded Antigravity implementation; Claude is inactive. Existing controls, safety warnings and focus/revision/reload behaviors remain required.

## Chat and web lookup

- Keep the existing composer and conversation hierarchy. A compact, initially unchecked opt-in labelled “Tra web” applies only to the next explicit text query. Explain before sending: only the short query is sent to Tavily; GPS/history are not sent; do not enter private information. Regular send continues the tour conversation. Web lookup must not modify tour preferences, pending confirmation or allergies.
- `chatTurn` must forward `web_search` only when true; action turns omit it. In frontend fixture/mock mode show honest unavailable status, never fabricated search results.
- Render additive `web_search` blocks as a small component inside the existing mint conversation area: status, at most3 source links and exact source quotation/snippet, retrieval timestamp and “Nguồn web chưa được xác minh; không xác nhận quán đang mở hoặc an toàn dị ứng.” Treat content as escaped text, never HTML. Link HTTPS only, target blank with noopener noreferrer. No automatic source-page fetch.
- Disabled/missing key, quota429, offline/provider failure and rejected sensitive query have distinct useful copy. Show no success badge for these. Preserve query on failure and allow deliberate retry; never background retry automatically. Loading is real and existing busy gating prevents duplicate sends.
- Conversation mode metadata reflects actual assistant status. Do not label configured Gemini as proven live quality. Mention minimized context and free-tier privacy disclosure in the existing disclosure, without changing product voice.

## Local interactive map

- Keep the existing route panel position, width, tokens and canvas height. Keep the accepted schematic as the default; add a real “Bản đồ” / “Sơ đồ” control within the route panel, with keyboard semantics and a clear active state. No layout-wide redesign.
- New dependencies only: exact `maplibre-gl`6.15.0 and `pmtiles`4.5.0 (official release/registry verified). MapLibre6 uses ESM named exports; check upstream migration. Dynamic client-only import avoids SSR/WebGL issues. Existing dependency versions are untouched.
- Asset is same-origin `/maps/hoankiem-20261018.pmtiles`; provenance and exact bytes/hash in `frontend/public/maps/README.md`. No remote style, glyph, sprite or tile dependencies. Local vector style uses actual earth/water/roads/buildings layers, with existing palette. Missing/WebGL/Range errors produce an honest retry/fallback to schematic and free Maps URLs, never a fake successful map.
- Bounds west105.835/south21.018/east105.866/north21.046; archive zoom10–15, overscaling is allowed. Restrict map viewport to pilot bounds. Do not clamp/fabricate venue coordinates; count/report stops outside coverage. No route line on this geographic map: markers show actual stop locations/order only. Real directions remain the existing Google Maps URLs.
- Marker visibility toggle works, markers synchronize after replace/reload/reset and preserve sequence. Popup uses safe DOM text, no innerHTML; accessible ordered list remains available. No GPS requests on map activation and no GPS/history sent to any map provider. Avoid hijacking page scroll; two-finger mobile gestures and keyboard controls must remain usable.
- Visible attribution: © OpenStreetMap contributors (copyright link), Protomaps. Show map source freshness (2026-10-18) separately from venue verification. Same-origin asset still requires actual206 Range/cache/error testing; cross-origin hosting is not activated.

## Evidence and ownership gate

Antigravity receives an exact file list in a fresh Orca dispatch before editing. Codex owns backend/contracts/security and does not concurrently edit the scoped frontend files. Evidence must include actual desktop1440×1024 and mobile390×844 UI, map/toggle/replace/reload/error, citation success mocked distinctly from real disabled behavior, keyboard/focus, no remote map requests, and original-reference side-by-side/overlay with measured residuals. Preserve the existing testids and journeys. No claim of pixel identity or live retrieval quality from mock fixtures.
