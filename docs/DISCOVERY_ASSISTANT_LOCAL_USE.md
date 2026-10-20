# Local discovery assistant

Open **http://127.0.0.1:3300**. Current mode is immutable production UI from`4fdfe92`, actual API8300, private local venue dataset and configured Gemini`gemini-3.5-flash-lite`. Existing caps/keys/ledger are preserved. The authorized native smoke already used3 chat turns/5 model requests total; no additional automated live probe should repeat it. Actual response/tool/call-count evidence is in`reports/DISCOVERY_VIEWPORT_EMOJI_LIVE.md`.

For the fixture journey below, use **http://127.0.0.1:3310** (actual API8210, explicitly synthetic/rules, no provider calls). `[SYNTHETIC]` venues are fictional. Historical3200 is no longer the current delivery URL.

Start with “Chào bạn” or ask about a dish. To exercise the populated fixture area, send “Tìm quán quanh Hồ Gươm”, then “So sánh A với B”. Choose a result with its button or “Thêm A rồi tìm chè ít ngọt”. The app retains selection/preferences and reports unknown sweetness/ingredients instead of inventing matches.

“500k cho2người” means a group budget. “20phút mỗi chặng” is a leg limit, not total tour time. A venue price range is not a dish price or per-person meal cost. Searching “phở quanh Xuân Thủy dưới70k” never requires people/stops/duration first; this synthetic fixture may lack matching venues there and must say so.

Ask “Tạo lịch trình” when ready. Only then does the assistant collect the next necessary detail; the optional trip panel remains available. For example, explicitly state “Xuất phát từ Hồ Gươm lúc18h, tổng120phút, đi bộ,2người”. Check the short confirmation and warnings, then press the explicit confirmation button. A generic “ok” does not authorize planning. Unknown allergy evidence blocks strict planning; constraints are never silently removed.

After a tour, “Đổi quán” opens actual selection editing. Unlock explicitly before removing a locked venue, select another venue and request/review a new confirmation. Reload preserves the session; reset creates a new one. Conflicts refresh current state without replaying mutations and retain failed draft text. Network/provider/tool failures remain visible.

The map is a local Hoàn Kiếm PMTiles/OSM pilot with attribution and marker toggle. It is not a road-routing engine. Free Google Maps links contain the chosen origin and ordered stops and are sent to Google when opened; no paid Maps API/key is used. Motorbike navigation uses driving URLs with an explicit approximation note. Geographic coverage is limited; missing coordinates never become0,0.

Tavily lookup, opt-in and web citations are retired. Venue source links describe provenance, not live web search. Weather is unavailable and does not block discovery chat.

Gemini native tool calling uses existing server configuration/caps in `backend/.env`, with a bounded loop and explicit fallback. The authorized smoke recorded an initial schema HTTP400, then four actual native HTTP200 responses after repair, all naming `gemini-3.5-flash-lite`; total3 turns/5 requests, zero automatic retries. Search and comparison used bounded local projections without exporting records. Final bootstrap/resize made no assistant POST and consumed no model allowance. Broad private-data browser tour quality remains untested; synthetic/rules E2E passed63 checks. No key should be pasted into chat, frontend or Git. Existing keys/ledgers/accounts and billing settings are preserved. See `reports/DISCOVERY_VIEWPORT_EMOJI_LIVE.md` and `reports/DISCOVERY_ASSISTANT_ACCEPTANCE.md` for source-specific evidence and limits.
