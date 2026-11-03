# Báo cáo Kiểm thử Cơ học và Tích hợp Frontend: Nâng cấp Khám phá & Bản đồ OSM (03/11/2026)

> **Thực thi:** Antigravity (Frontend & Mechanical QA Worker)  
> **Điều phối & Tích hợp Backend:** Codex  
> **Phạm vi sở hữu:** `frontend/`, `qa/`, `docs/reports/NOV03_FRONTEND_QA.md`  
> **Nguyên tắc an toàn:** Không gọi Gemini/Tavily trực tiếp, không tăng hạn mức/billing, bảo tồn bí mật, ledgers và phiên làm việc.

---

## 1. Tóm tắt điều hành (Executive Summary)

Em đã hoàn thành trọn vẹn việc nâng cấp giao diện Khám phá (Discovery Assistant) và tích hợp Bản đồ OpenStreetMap trực tuyến theo đúng đặc tả hợp đồng đóng băng tại `docs/DISCOVERY_UPGRADE_NOV03_CONTRACT.md` cùng toàn bộ hướng dẫn P1 từ Điều phối viên:

1. **Bản đồ OpenStreetMap trực tuyến với MapLibre GL**:
   - Sử dụng nguồn raster ngói OSM chuẩn `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (cấu hình qua `NEXT_PUBLIC_OSM_TILE_URL`).
   - Tuân thủ chính sách OSM: bộ đệm HTTP trình duyệt thông thường, gửi tiêu đề Referer chuẩn, thiết lập `prefetchZoomDelta: 0` và `cancelPendingTileRequestsWhileZooming: true` (không nạp trước lưu lượng lớn).
   - Hiển thị đầy đủ tên đường, phố trên toàn địa bàn Hà Nội (Đống Đa, Cầu Giấy, Hoàng Mai...) ngoài trung tâm Hoàn Kiếm ở các mức phóng thu hữu dụng (zoom 6–19).
   - Ghi nhận nguồn bản quyền minh bạch: `(c) OpenStreetMap contributors`.
   - Đường nối chặng: dạng nét đứt ước tính thẳng, ngắt quãng trung thực khi điểm dừng thiếu toạ độ (không bắc cầu giả định).

2. **Ghim vị trí xuất phát tạm thời có thể kéo thả (Draft Draggable Origin Pin)**:
   - Cho phép nhấp trực tiếp trên bản đồ để đặt ghim tạm (`pilot-draft-origin-marker`) với nhãn thân thiện "Vị trí đã chọn trên bản đồ (chờ xác nhận)".
   - Ghim tạm có thể kéo thả trực tiếp (`dragend`) để điều chỉnh tọa độ.
   - Nút hành động rõ ràng "Sử dụng vị trí này" (`map-use-draft-location`, `map-use-draft-bar-btn`) kích hoạt hành động `coordinates` với `source: 'map'` và `resolve_address: true`, thực hiện qua cơ chế địa chỉ hóa ngược Photon có giới hạn.
   - Tuyệt đối không tự động kích hoạt GPS ngầm.

3. **Tìm kiếm theo khu vực không cần điểm xuất phát & Rào chắn xác nhận**:
   - Người dùng có thể tìm kiếm ẩm thực theo khu vực (ví dụ: "phở tại Đống Đa") ngay từ đầu mà không bị chặn bởi bước chọn điểm xuất phát.
   - Khoảng cách hiển thị trung thực `distance_m = null`, lý do `Chưa rõ khoảng cách (chưa chọn điểm xuất phát)`.
   - Nút xác nhận lịch trình (`btn-confirm-itinerary`) bắt buộc phải có điểm xuất phát; khi chưa có, nút bị vô hiệu hóa kèm thông báo hướng dẫn rõ ràng (`confirm-missing-origin-notice`).

4. **Thực đơn đầy đủ theo phân trang (Paginated Full Menu)**:
   - Tích hợp endpoint `GET /v1/sessions/{id}/venues/{venue_id}/menu` có kèm mã xác thực `X-Session-Token` từ `latestSessionRef`.
   - Hiển thị đầy đủ nhóm món (`groups`), tìm kiếm món (`q`), danh sách món chính tắc (`items`) không bị trùng lặp.
   - Hiển thị chi tiết các nhóm tùy chọn (bắt buộc / tùy chọn, giới hạn số lượng, giá cộng thêm).
   - Phân trang tùy chọn lũy kế (>200 tùy chọn): tích lũy số lượng tùy chọn thực tế đã nạp qua các trang (100 -> 200 -> 250), đảm bảo offset tiếp theo luôn chính xác và không bị lặp.
   - Cơ chế bảo vệ danh tính yêu cầu (`menuRequestIdRef`): hủy bỏ dữ liệu trễ khi người dùng chuyển quán hoặc phiên khác trong lúc yêu cầu đang bay trên mạng.

5. **Xóa bỏ các cảnh báo giá lặp lại**:
   - Đã loại bỏ toàn bộ các chuỗi lặp "giá tham khảo", "không phải giá tại quán", huy hiệu giao hàng trên thẻ quán, hộp thoại chat và chi tiết quán.
   - Thay thế bằng dòng ghi nhận nguồn dữ liệu tinh gọn duy nhất: `Nguồn: ShopeeFood`.
   - Giá hiển thị dạng số tiền rõ ràng (ví dụ: `45.000 đ`); giá bị cách ly hoặc chưa có bằng chứng hiển thị trung thực `Giá chưa xác minh`.

---

## 2. Bằng chứng Kiểm thử Cơ học (Mechanical Test Evidence)

### 2.1 Kiểm thử Đơn vị & Hợp đồng Frontend (`test_menu_option_pagination.mjs` & `test_osm_map_frontend.mjs`)
- **Phân trang tùy chọn >200**:
  - Trang 1 (0..100): đã nạp 100 tùy chọn, `options_complete = false`.
  - Trang 2 (offset 100..200): tích lũy đạt 200 tùy chọn, offset trang tiếp theo được tính lũy kế đúng bằng 200.
  - Trang 3 (offset 200..250): tích lũy đạt đủ 250 tùy chọn, `options_complete = true`.
  - Kết quả: **PASS** (loại bỏ hoàn toàn lỗi kẹt offset ở 100).
- **Bộ lọc danh tính trễ (Identity Guard)**:
  - Khi chuyển từ Quán A sang Quán B, phản hồi trễ của Quán A bị hủy bỏ, không ghi đè vào Quán B.
  - Kết quả: **PASS**.
- **Chính sách Bản đồ OSM & Chỉ đường MapLibre**:
  - URL chỉ đường OSM đi bộ (`fossgis_osrm_foot`) và lái xe (`fossgis_osrm_car`) được kiểm định nghiêm ngặt theo regex cho phép.
  - Ngăn chặn hoàn toàn việc thay thế ngầm phương tiện xe máy thành ô tô.
  - Điểm dừng thiếu tọa độ làm đứt đoạn đường nối ước tính, không bắc cầu giả tạo.
  - Kết quả: **PASS (8/8 nhóm bài kiểm thử)**.

### 2.2 Kiểm thử Tương tác API Thực tế (`test_nov03_mechanical_qa.mjs`)
Chạy trực tiếp với máy chủ nội bộ 8250 (nguồn `4e910a2`):

| Mục kiểm tra | Kết quả mong đợi | Thực tế đo đạc | Đánh giá |
|---|---|---|---|
| Kiểm tra an toàn | LLM offline rules/mock, không tiêu tốn quota Gemini | `llm: mock`, `provider: rules`, API keys rỗng | **PASS** |
| Thao tác toạ độ `map` | Chấp nhận `source: 'map'` và `resolve_address: true` | Hợp đồng chấp nhận, backend chọn toạ độ và gán nhãn | **PASS** |
| Phản hồi địa chỉ Photon | Định danh điểm đã ghim trên bản đồ | `Phố Trần Nguyên Hãn, Hoàn Kiếm, Hà Nội` | **PASS** |
| Phở Đống Đa | Phở nước truyền thống, loại trừ phô mai/tào phớ/phở cuốn | 5 quán Đống Đa; 0 món phô mai, 0 tào phớ, 0 phở cuốn | **PASS** |
| Tương phản Gà rán | Đống Đa có 0 quán thực đơn chính tắc vs Cầu Giấy dương tính | Đống Đa có 0 món khớp chính tắc; Cầu Giấy có đủ món khớp | **PASS** |
| Món ăn không xác định | "món lạ xyzqwer" trả về 0 kết quả | 0 kết quả (không nới lỏng tiêu chí) | **PASS** |
| Thực đơn đầy đủ | Endpoint trả về cấu trúc món chính tắc và nhóm món | HTTP 200, trả về danh mục món, giá và nhóm tuỳ chọn | **PASS** |
| Biên dịch Next.js | `npm run build` thành công, không lỗi JSX/TypeScript | `✓ Compiled successfully`, tạo đủ 6 trang tĩnh | **PASS** |

---

## 3. Danh sách Tệp tin Sở hữu & Chỉnh sửa

- `frontend/lib/discoveryApi.js`: Hỗ trợ `source: 'map'`, gán cờ `resolve_address: true`, hàm `fetchVenueMenu` kèm token xác thực, định dạng giá và khoảng cách tinh gọn.
- `frontend/app/components/v2/guided/PilotMap.jsx`: Nguồn ngói raster OSM trực tuyến, cờ `prefetchZoomDelta: 0`, ghim kéo thả tạm thời với nút "Sử dụng vị trí này", nhãn chờ xác nhận.
- `frontend/app/components/v2/guided/pilot-map.css`: Giao diện ghim tạm, thanh điều khiển ghim nổi và nút hành động.
- `frontend/app/components/v2/guided/DiscoveryLayout.jsx`: Xử lý chọn vị trí từ bản đồ, tích hợp modal thực đơn đầy đủ có bảo vệ danh tính (`menuRequestIdRef`), tích lũy tùy chọn lũy kế, rào chắn xác nhận điểm xuất phát, loại bỏ cảnh báo giá lặp lại.
- `frontend/app/components/v2/guided/discovery-visual.css`: Kiểu dáng cho thực đơn phân trang, nhóm tùy chọn món và nhãn nguồn dữ liệu tinh gọn.
- `frontend/app/components/v2/guided/ConfirmSummaryCard.jsx`: Tinh chỉnh ghi chú ngân sách trung thực.
- `qa/discovery-assistant/test_osm_map_frontend.mjs`: Bộ kiểm thử hồi quy đơn vị bản đồ OSM và MapLibre.
- `qa/discovery-assistant/test_menu_option_pagination.mjs`: Bộ kiểm thử phân trang tùy chọn >200 và bảo vệ danh tính yêu cầu.
- `qa/discovery-assistant/test_nov03_mechanical_qa.mjs`: Bộ kiểm thử cơ học tự động bao quát toàn bộ hợp đồng nâng cấp ngày 03/11.
