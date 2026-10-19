# Báo cáo Kiểm thử Giao diện Trợ lý Khám phá (Discovery-First Assistant UI) — discovery-v1

**Thời gian kiểm định:** 2026-10-19T20:06:00+07:00  
**Người thực hiện:** Antigravity (Frontend & QA Implementer)  
**Người điều phối / Tích hợp:** Codex (Coordinator & Backend/Contracts Owner)  
**Hợp đồng mục tiêu:** `docs/DISCOVERY_ASSISTANT_CONTRACT.md` (`discovery-v1`)  
**Yêu cầu cơ sở:** `docs/DISCOVERY_ASSISTANT_REQUIREMENTS.md`  
**Giao diện thẩm mỹ:** Khung Figma 1:145 "02 — Măm Măm / Warm editorial" (1440x1024)  

---

## 1. Tóm tắt kết quả (Executive Summary)

1. **Loại bỏ hoàn toàn tính năng & UI cũ:**
   - **Tavily web search:** Đã loại bỏ hoàn toàn checkbox tra web Tavily, opt-in explanation và runtime tra web ngoài. Không có bất kỳ truy vấn nào gửi đến Tavily hay dịch vụ ngoài.
   - **Checklist "Mình hiểu là":** Đã gỡ bỏ toàn bộ khối checklist ma trận trong khung chat chính theo đúng chỉ đạo mới nhất của Đại Ca. Chat trở về luồng hội thoại tự nhiên, phản hồi trực tiếp và gợi ý thẻ địa điểm.

2. **Triển khai mới Giao diện Khám phá (Discovery-First UI):**
   - Đã tạo `frontend/lib/discoveryApi.js` tuân thủ nghiêm ngặt hợp đồng HTTP `discovery-v1`: các action `tool` theo allowlist (`search_restaurants`, `get_restaurant_details`, `compare_restaurants`, `update_preferences`, `update_foodtour_selection`, `create_itinerary`, `revise_itinerary`) và action `confirm` kèm `confirmation_id`.
   - Đã tạo component `frontend/app/components/v2/guided/DiscoveryLayout.jsx` và CSS `discovery-visual.css` mang phong cách Warm editorial:
     - Thẻ kết quả quán ăn (badge A–E, tên, địa chỉ, thẻ món, ngữ nghĩa khoảng giá quán `venue_range`, giờ mở cửa, lưu ý yếu tố chưa xác minh `unknowns`, liên kết nguồn dữ liệu gốc `source_url`).
     - Tương tác chọn quán (`+ Chọn vào tour` / `✓ Đã chọn`), so sánh (`So sánh`), xem chi tiết (`Chi tiết`).
     - Bảng so sánh 2–5 quán (`nn-comparison-card`) so sánh trực quan đa tiêu chí.
     - Cột phải hiển thị danh sách quán đã chọn (tối đa 5 quán) với nút Khoá/Mở khoá (`🔒`/`🔓`) và nút Xoá (`✕`).
     - Thẻ kêu gọi tạo lịch trình với nút màu kem nhạt `#FAF4EE` (`nn-plan-trigger-btn`).
     - Ngăn kéo tuỳ chỉnh hồ sơ chuyến đi (`nn-profile-drawer`) thu gọn bên ngoài luồng tin nhắn, hỗ trợ cập nhật linh hoạt khu vực, số người, ngân sách, phạm vi ngân sách (`group` vs `per_person`), giờ bắt đầu, thời lượng, phương tiện và dị ứng.
     - Thẻ xác nhận (`nn-discovery-confirmation`) chỉ hiển thị khi máy chủ cung cấp bản tóm tắt xác nhận kèm lưu ý dị ứng và nút xác nhận tường minh (`btn-confirm-itinerary`).
     - Tích hợp `GuidedTimeline` khi lịch trình được xác nhận, hỗ trợ chỉ đường Google Maps đi bộ miễn phí và chuyển đổi bản đồ tự lưu trữ `PilotMap` (PMTiles).
     - Khối thông tin chẩn đoán kỹ thuật thứ cấp (`<details className="nn-diagnostics-details">`) hiển thị lượt gọi công cụ, thời gian phản hồi, trạng thái thời tiết không khả dụng và nguồn dữ liệu.
     - Cơ chế xử lý xung đột 409: thông báo người dùng và tự động tải lại trạng thái mới nhất từ `GET /v1/sessions/{id}/assistant` mà **không tự động replay mutation** gây sai lệch ý định người dùng.

3. **Kết quả kiểm thử tự động (QA Suite):**
   - Đã thiết lập bộ kiểm thử độc lập `qa/discovery-assistant/run_discovery_qa.mjs` chạy trên các cổng cô lập (Web 13600, Mock API 18600, CDP 19800), không ảnh hưởng đến bất kỳ cổng sản phẩm hay dịch vụ nào khác.
   - **20/20 bài kiểm tra đạt (100% PASS)**, bao gồm toàn bộ luồng hội thoại, chọn quán, so sánh, khoá quán, sửa hồ sơ, cổng xác nhận tường minh, xử lý 409, chuyển đổi bản đồ, và kiểm tra hiển thị di động 390px (0 tràn ngang, `scrollWidth <= 390`) cùng khả năng phóng to 200% (zoom reflow).
   - Bản build sản xuất (`next build`) vượt qua thành công với 0 lỗi lint, 0 lỗi TypeScript/biên dịch.

---

## 2. Bảng bằng chứng kiểm thử (Test Matrix Evidence)

Dữ liệu chi tiết trích xuất từ `qa/discovery-assistant/evidence.json`:

| Mã kiểm tra | Tên hạng mục kiểm tra | Kết quả | Chi tiết ghi nhận |
| :--- | :--- | :---: | :--- |
| `PREFLIGHT_PORTS` | Kiểm tra TCP Refusal cổng cô lập (13600, 18600, 19800) | **PASS** | Hoàn toàn giải phóng trước khi chạy |
| `MOCK_API_RUNNING` | Khởi động máy chủ mô phỏng chuẩn `discovery-v1` trên 18600 | **PASS** | Endpoint `/v1/sessions/:id/assistant` sẵn sàng |
| `FRONTEND_BUILD` | Biên dịch Next.js trên thư mục tạm scratch | **PASS** | Không phát sinh lỗi đóng gói |
| `FRONTEND_RUNNING` | Máy chủ Next.js phản hồi trên cổng 13600 | **PASS** | HTTP 200 OK |
| `INITIAL_LAYOUT_BRAND` | Thương hiệu "MĂM MĂM", giao diện Warm editorial sẵn sàng | **PASS** | Thương hiệu đúng chuẩn, trường chat sẵn sàng |
| `TAVILY_REMOVED` | Đã gỡ bỏ hoàn toàn UI/runtime tra web Tavily | **PASS** | `hasTavily: false` |
| `CHECKLIST_REMOVED` | Đã gỡ bỏ hoàn toàn checklist "Mình hiểu là" | **PASS** | `hasUnderstoodChecklist: false` |
| `RESULTS_CARD_METADATA` | Thẻ quán hiển thị badge (A-E), tên, giá quán `venue_range`, nguồn gốc | **PASS** | Phở 10 Lý Quốc Sư (A), giá quán, liên kết nguồn gốc rõ ràng |
| `SELECTION_ADD` | Thêm quán vào danh sách tour cột phải | **PASS** | Card xuất hiện trong cột Chuyến đi |
| `SELECTION_LOCK` | Khoá quán thành công (`🔒`/`🔓`) | **PASS** | Icon toggle chính xác, giữ trạng thái máy chủ |
| `COMPARISON_VIEW` | Bảng so sánh 2–5 quán đa tiêu chí | **PASS** | Hiển thị bảng so sánh kèm cảnh báo yếu tố chưa xác minh |
| `PROFILE_DRAWER_OPEN` | Mở ngăn kéo tuỳ chỉnh hồ sơ (⚙ Tuỳ chỉnh chuyến đi) | **PASS** | Mở bảng điều khiển ngoài luồng chat |
| `PROFILE_DRAWER_SAVE` | Cập nhật ngân sách, số người, phương tiện, đóng ngăn kéo | **PASS** | Gửi action `update_preferences` thành công |
| `CONFIRMATION_CARD_RENDERED` | Thẻ xác nhận hiển thị tóm tắt, lưu ý dị ứng và nút xác nhận | **PASS** | Hiển thị cảnh báo an toàn trước khi tạo tour |
| `EXPLICIT_CONFIRM_GATE` | Cổng xác nhận tường minh qua nút `btn-confirm-itinerary` | **PASS** | Chỉ tạo `GuidedTimeline` sau khi click nút xác nhận |
| `MAP_VIEW_TOGGLE` | Chuyển đổi hiển thị Sơ đồ / Bản đồ (PilotMap PMTiles) | **PASS** | Chuyển đổi mượt mà, định vị điểm dừng chính xác |
| `CONFLICT_409_HANDLED` | Xử lý xung đột 409: thông báo và re-fetch không replay | **PASS** | Bắt mã 409, giữ thông báo và đồng bộ lại trạng thái |
| `MOBILE_390_NO_OVERFLOW` | Độ rộng màn hình 390px không bị tràn ngang | **PASS** | `scrollWidth: 390`, `hasOverflow: false` |
| `MOBILE_TABS_VISIBLE` | Thanh tab chuyển đổi trên di động (Trò chuyện, Chuyến đi, Bản đồ) | **PASS** | Tabs hiển thị đầy đủ và điều hướng chuẩn xác |
| `ZOOM_200_REFLOW` | Kiểm tra phóng đại 200% không phát sinh vỡ khung hay lỗi DOM | **PASS** | Không phát sinh lỗi DOM |

---

## 3. Ảnh chụp bằng chứng (Screenshots)

Các tệp ảnh lưu trữ tại `qa/discovery-assistant/`:
1. `desktop_1440x1024_discovery.png`: Giao diện khám phá trên màn hình 1440x1024, thẻ kết quả quán, bảng so sánh và danh sách quán đã chọn.
2. `desktop_1440x1024_confirmed_tour.png`: Lịch trình chi tiết `GuidedTimeline` sau khi nhấn nút xác nhận tường minh.
3. `mobile_390x844_discovery.png`: Giao diện trên thiết bị di động 390x844 với hệ thống tab điều hướng.

---

## 4. Danh sách tệp đã tạo & sửa đổi (Scoped Files)

- `frontend/lib/discoveryApi.js` (Tạo mới: client API chuẩn `discovery-v1`)
- `frontend/app/components/v2/guided/discovery-visual.css` (Tạo mới: scoped CSS Warm editorial)
- `frontend/app/components/v2/guided/DiscoveryLayout.jsx` (Tạo mới: component giao diện chính)
- `frontend/app/page.js` (Chỉnh sửa: dynamic import và render `DiscoveryLayout`)
- `qa/discovery-assistant/run_discovery_qa.mjs` (Tạo mới: harness kiểm thử tự động)
- `qa/discovery-assistant/evidence.json` (Tạo mới: bằng chứng kết quả kiểm thử)
- `docs/reports/DISCOVERY_ASSISTANT_UI_QA.md` (Tạo mới: báo cáo kiểm định hoàn thiện)

**Cam kết tuân thủ ranh giới:**
- Không chỉnh sửa bất kỳ tệp backend hay contracts/task-board nào do Codex làm chủ.
- Không phát sinh cuộc gọi đến bất kỳ dịch vụ hay mô hình trả phí bên ngoài nào.
- Đảm bảo kiểm thử trên các cổng riêng biệt, giữ nguyên các máy chủ đang hoạt động của người dùng.
