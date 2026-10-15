# Bàn giao phase 4 — Google Maps, Gemini, vị trí, marker quán, tuyến Google Routes

Ngày 2026-10-16. Run Orca `run_95a2350b2712`. Nhánh tích hợp `foodtour-claude-coordinator` (chưa merge `main`, chưa push). Phân vai: Claude = kiến trúc/AI/planner/Gemini/tích hợp; Codex = backend, Google server-side, bảo mật, review độc lập; Antigravity = frontend Google Maps, vị trí, marker, QA trình duyệt. Chạy và cấu hình: `docs/RUNNING.md`. Kế hoạch/bảng khoá: `docs/PHASE4.md`. Hợp đồng: `contracts/v1/CONTRACT.md` (v1.5).

## Ma trận: đã làm / đã kiểm tra / chưa thể xác minh

| Hạng mục | Đã làm | Đã kiểm tra thật (trên máy này) | Chưa thể xác minh |
|---|---|---|---|
| Bản đồ Google Maps JS (không còn OSM) | Bootstrap loader + `importLibrary`, Map ID, Advanced Markers, trạng thái "chưa cấu hình/khoá bị từ chối" có nhãn | Test CDP trên **bản build production**, chặn `maps.googleapis.com` và trả bootstrap giả đúng cơ chế; chứng minh fail-before (bản cũ không tạo được `Map`) | Hiển thị bản đồ với **key và Map ID thật** |
| Vị trí hiện tại | Chỉ khi người dùng bấm; nhánh bị từ chối/timeout/không an toàn; lùi về nhập tay | Nhánh từ chối, supersede, reset phiên | Hành vi trên thiết bị thật; trình duyệt có thể dùng dịch vụ vị trí của hãng |
| Chọn địa điểm kiểu Google Maps | `PlaceAutocompleteElement` (`gmp-select`), dự phòng `POST /v1/geocode`, nhập toạ độ tay | Khởi tạo nguội, chọn trễ qua reset bị loại | Places API (New) thật, tính phí theo phiên |
| Marker quán + nút Hiện/Ẩn | Mặc định TẮT, `aria-pressed`, bbox + abort + debounce, cụm marker, chỉ quán vật lý | Bật/tắt, abort, cụm theo zoom (cả sau reset) | Hiệu năng ở dữ liệu thật lớn trên thiết bị yếu |
| Tuyến đi bộ Google Routes | `computeRouteMatrix` WALK 25×25 + `computeRoutes` (geometry, `HIGH_QUALITY`, cảnh báo bắt buộc), ngân sách, cache, cooldown | Server giả (field mask, ROUTE_NOT_FOUND, lỗi/timeout, giới hạn); tuyến chỉ vẽ cho chặng `provider_route` | **Chưa gọi Google Routes thật**; tên trường phản hồi `geoJsonLinestring` cần một lần gọi thật |
| Geocoding phía server | `POST /v1/geocode`, token phiên, giới hạn, ngân sách | Server giả; không rò khoá | Google Geocoding thật |
| Gemini | Trích xuất (schema), `origin_text` được kiểm chứng "grounded", không nhận toạ độ/nhãn thô từ model, lời giải thích có bộ kiểm | **Gọi Gemini thật**: 9/9 kịch bản, 0 tour sai (xem `qa/reports/EVAL_P3.md` cho phương pháp) | Tải/chi phí kéo dài |
| Quyền riêng tư | Bảng dữ liệu gửi Google, chữ giao diện khớp hành vi, LLM không nhận toạ độ chính xác | Review độc lập của Codex + probe | Tuân thủ pháp lý (không thuộc phạm vi) |
| Bảo mật khoá | Khoá server chỉ phía server; khoá trình duyệt giao qua `/v1/client-config` lúc chạy; `.env` bị ignore | Quét 160 phản hồi + log: 0 khoá/token | Hạn chế referrer/IP phải bạn đặt trên Google Cloud |

## Bằng chứng kiểm thử (Claude chạy lại trên bản tích hợp, build ở bản sao tạm)
- Backend 211 test OK (1 skip legacy có giải trình), OpenAPI drift OK.
- Frontend: build OK; contract 15/15; component 15/15; **cold-bootstrap CDP 15/15**; API E2E 36/36; **browser 28/28**; QA hộp đen **162/162**.
- Fail-before do Claude tự chạy: `3a43515` → không tạo được `Map`; `045db0e` → TC-COLD-15 FAIL (rò nhãn + toạ độ qua phiên mới), nay PASS.
- Codex độc lập: `5d16a82` (FE1–FE6), `04b9201` (re-review), `ab58162` (final verify), cùng báo cáo review Claude (P4-R1…R5, đã đóng và Codex xác nhận).

## Lỗi quan trọng phát hiện trong phase này (để minh bạch)
- Bản đồ thật không khởi tạo được (sai cấp destructuring) mà toàn bộ test xanh vì bản giả không giống Google — chỉ phát hiện nhờ review độc lập; đã sửa và thay bằng test chạy mã sản phẩm.
- Gemini từng có thể đặt toạ độ/nhãn xuất phát và `origin_text` bịa → server nay sở hữu ánh xạ landmark và bắt buộc `origin_text` có trong tin nhắn.
- Prior gửi Gemini từng chứa toạ độ chính xác → nay chỉ cờ "đã có điểm xuất phát" + nhãn khi không phải vị trí hiện tại.

## Cần bạn cung cấp / quyết định
1. **Key (ghi `backend/.env`, đừng dán vào chat)**: `GOOGLE_MAPS_BROWSER_KEY` + `GOOGLE_MAPS_MAP_ID` (bật Maps JavaScript API, Places API (New); referrer `http://localhost:3000/*`, `http://127.0.0.1:3000/*`); `GOOGLE_MAPS_SERVER_KEY` (bật Routes API, Geocoding API); `FOODTOUR_ROUTING=google`, `FOODTOUR_GEOCODER=google`, `FOODTOUR_LLM=gemini`.
2. Khởi động lại dev server bằng `scripts/dev.ps1 -Frontend` (tiến trình hiện chạy mã cũ, đọc `backend/.env` qua `app.server:app`).
3. Chấp nhận gửi toạ độ quán ứng viên tới Google Routes (dữ liệu riêng) và tin nhắn chat tới Gemini.
4. Merge `main`/push — chỉ khi bạn yêu cầu.

Khi có key: `python qa/live/google_smoke.py` (Routes + Geocoding trên mốc công khai) rồi mở giao diện để kiểm tra bản đồ, Autocomplete và tuyến thật; báo kết quả cho tôi.
