# Local discovery assistant

Open **http://127.0.0.1:3200**. Current validated mode is production UI, actual backend/planner/SQLite and explicitly synthetic Hanoi venue fixtures with deterministic rules. `[SYNTHETIC]` venues are fictional test data. This URL does not demonstrate live Gemini quality or private-dataset browser coverage. Existing local dataset separately passed backend search/compare/selection smoke without exporting venue records.

Start with “Chào bạn” or ask about a dish. To exercise the populated fixture area, send “Tìm quán quanh Hồ Gươm”, then “So sánh A với B”. Choose a result with its button or “Thêm A rồi tìm chè ít ngọt”. The app retains selection/preferences and reports unknown sweetness/ingredients instead of inventing matches.

“500k cho2người” means a group budget. “20phút mỗi chặng” is a leg limit, not total tour time. A venue price range is not a dish price or per-person meal cost. Searching “phở quanh Xuân Thủy dưới70k” never requires people/stops/duration first; this synthetic fixture may lack matching venues there and must say so.

Ask “Tạo lịch trình” when ready. Only then does the assistant collect the next necessary detail; the optional trip panel remains available. For example, explicitly state “Xuất phát từ Hồ Gươm lúc18h, tổng120phút, đi bộ,2người”. Check the short confirmation and warnings, then press the explicit confirmation button. A generic “ok” does not authorize planning. Unknown allergy evidence blocks strict planning; constraints are never silently removed.

After a tour, “Đổi quán” opens actual selection editing. Unlock explicitly before removing a locked venue, select another venue and request/review a new confirmation. Reload preserves the session; reset creates a new one. Conflicts refresh current state without replaying mutations and retain failed draft text. Network/provider/tool failures remain visible.

The map is a local Hoàn Kiếm PMTiles/OSM pilot with attribution and marker toggle. It is not a road-routing engine. Free Google Maps links contain the chosen origin and ordered stops and are sent to Google when opened; no paid Maps API/key is used. Motorbike navigation uses driving URLs with an explicit approximation note. Geographic coverage is limited; missing coordinates never become0,0.

Tavily lookup, opt-in and web citations are retired. Venue source links describe provenance, not live web search. Weather is unavailable and does not block discovery chat.

Gemini native tool calling is implemented using existing server configuration/caps in `backend/.env`, with a bounded loop and local fallback. Current acceptance intentionally makes0 live provider calls. No key should be pasted into chat, frontend or Git. Existing keys and durable ledgers are preserved; no account/billing setting is changed. Live native-tool conversational quality, service quota and free-account eligibility are not proven by configuration or mocked tests. See `reports/DISCOVERY_ASSISTANT_ACCEPTANCE.md` for precise limits and screenshots.
