# Bàn giao phase 3 — tuyến đi bộ thật, Gemini, các giới hạn còn lại

Ngày 2026-10-15. Thực hiện: Claude một mình (kiến trúc, data, AI/planner, backend, frontend, QA/security, tích hợp). Mọi đánh giá dưới đây là **tự kiểm tra của Claude, không phải review độc lập**. Nhánh: `foodtour-claude-coordinator` (chưa merge vào `main`, chưa push).

Cách chạy và cấu hình: `docs/RUNNING.md`. Số liệu đánh giá: `qa/reports/EVAL_P3.md`. Roadmap/kiểm kê: `docs/PHASE3.md`.

## Ma trận: đã làm / đã kiểm thật / chưa thể xác minh

| Hạng mục | Đã làm (code) | Đã kiểm thật | Chưa thể xác minh / phụ thuộc |
|---|---|---|---|
| Transport provider | HTTPS chỉ tới host allowlist (+ host chính thức của provider đã bật), loopback cho test, không proxy/redirect, giới hạn kích thước/thời gian | Unit test; gọi thật tới Gemini qua transport này | DNS rebinding với host allowlist không được chặn riêng (chỉ host công khai đã biết) |
| Trích xuất bằng Gemini | `generateContent` + JSON schema, khoá chỉ phía server, landmark enum (model không tự đưa toạ độ), thử lại 1 lần cho 5xx, ngân sách theo ngày, fallback bộ luật có nhãn | **Gọi thật**: 39/39 đúng khi model trả lời (42 lượt, 3 lượt không phản hồi), chống chèn lệnh đúng; trình duyệt 18/18 với Gemini | Tải cao/rate limit kéo dài, chi phí/ngày, hội thoại tự do ngoài 7 kịch bản |
| Giải thích bằng Gemini | Chỉ từ dữ kiện tour đã kiểm tra, không gửi danh tính quán; bộ kiểm claim/số/độ bất định; thử lại trong ngân sách 12 s; fallback văn bản mẫu | **Gọi thật**: 18/22 qua bộ kiểm, 4 bị loại (số viết bằng chữ) → hiển thị mẫu | Chất lượng diễn đạt theo cảm nhận người dùng |
| Định tuyến đi bộ thật + hình học | openrouteservice `foot-walking` (matrix + directions GeoJSON) và OSRM-compatible (`table` + `route`); prefetch 1 matrix mỗi lần lập/thay; hình học chỉ cho chặng `provider_route`; ngân sách/cache | Server giả (unit test, API đầu-cuối, `routing_smoke.py` với server giả) | **Chưa gọi provider định tuyến thật nào** — thiếu key/endpoint do bạn cấp |
| Bản đồ | Vẽ tuyến thật (nét liền) chỉ khi có hình học từ provider + ghi nguồn; ước tính vẫn là nét đứt có chú thích; zoom/căn giữa theo pixel (sửa lỗi marker ra ngoài khung) | Component test; trình duyệt 18/18 (gồm kiểm tra mọi marker trong khung) | Hiển thị tuyến thật trên dữ liệu thật (cần provider) |
| Nhãn nguồn trong UI | Trạng thái provider ở header, "(Gemini…)" / "(bộ luật cục bộ)" dưới trích xuất, nhãn lời giải thích Gemini, gợi ý chờ khi gọi Gemini | Ảnh chụp + DOM probe | — |
| Mã `dataset_changed` | 409 khi thay quán trên dữ liệu/overlay đã đổi | Unit/API test | — |
| Giờ mở cửa / giá theo người | Pipeline overlay có nguồn + ngày xác minh (từ phase 2); planner chỉ `verified_feasible` khi đủ bằng chứng | Test với overlay **giả lập** | **Cần nguồn đã xác minh và quyền sử dụng** — không có thì vẫn "chưa biết" |
| Geoverify toạ độ | `qa/eval/geo_audit.py` (cờ hợp lý) | Chạy trên ds-1: 0 ngoài khung, 11 trùng toạ độ, 29 xa trung vị quận > 4 km | Không phải geoverify; cần nguồn đối chiếu |
| Persistence / DB | SQLite (phase 2) | Test phase 2 | PostGIS cần hạ tầng (không có Docker) |
| CI | Workflow chạy `scripts/test.*` (nay gồm component test, eval bộ luật, geo audit trên dữ liệu giả) | Từng bước chạy cục bộ | **Chưa chạy trên CI từ xa** (không push) |
| Đánh giá người dùng | Harness đo tính hợp lệ, không đo mức hài lòng | — | Cần người dùng thật |

## Kiểm thử cuối (máy này)
Backend 175 test OK (1 skip legacy có giải trình), OpenAPI drift OK, API E2E 36/36, component 13/13, trình duyệt 18/18 (bộ luật) và 18/18 (Gemini thật), eval bộ luật 7/7 + 0 tour sai. `scripts/test.ps1` không chạy được trọn gói vì tiến trình `scripts/local.py dev` của bạn đang giữ khoá trong worktree này; các bước tương đương đã chạy riêng.

## Ghi chú trung thực về quá trình
- Trong lúc đo, dữ kiện giải thích từng chứa tên quán từ ds-1; khoảng 4 tour đã được gửi tên quán tới Gemini trước khi tôi sửa (nay không còn gửi danh tính quán; có test).
- Vài lần `npm run build` đã chạy trong `frontend/` dùng chung `.next/` với `next dev` của bạn; dev server vẫn trả 200. Lượt kiểm cuối build trong bản sao tạm.
- Tiến trình dev của bạn chạy `app.main:app` khởi động từ trước, nên chưa có các thay đổi phase 3 cho tới khi bạn khởi động lại (script dev nay dùng `app.server:app`, đọc `backend/.env`).

## Cần bạn quyết định / cung cấp
1. **Provider định tuyến** (để xác minh tuyến đi bộ thật): `ORS_API_KEY` của openrouteservice (bạn tự đăng ký gói miễn phí), *hoặc* endpoint OSRM có profile `foot` (tự host, hoặc host công khai bạn chấp nhận điều khoản — khi đó thêm vào `FOODTOUR_PROVIDER_HOSTS`). Lưu ý: định tuyến gửi toạ độ quán (thuộc dữ liệu riêng) tới nhà cung cấp.
2. Đồng ý hay không việc gửi tin nhắn chat người dùng tới Gemini khi bật `FOODTOUR_LLM=gemini` (dữ liệu quán không được gửi).
3. Nguồn giờ mở cửa / giá theo người đã xác minh và quyền sử dụng (nếu muốn có `verified_feasible`).
4. Merge/fast-forward `main`, push hay CI từ xa — chỉ khi bạn yêu cầu.
