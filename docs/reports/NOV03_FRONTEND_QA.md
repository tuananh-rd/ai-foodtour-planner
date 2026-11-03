# Báo cáo Kiểm thử Cơ học và Tích hợp Frontend: Nâng cấp Khám phá & Bản đồ OSM (03/11/2026)

**Đơn vị thực thi:** Antigravity (Frontend & Mechanical QA Worker)  
**Điều phối & Tích hợp:** Codex (Coordinator)  
**Phạm vi sở hữu:** `frontend/`, `qa/`, `docs/reports/NOV03_FRONTEND_QA.md`  
**Nguyên tắc an toàn:** Không gọi live LLM/Tavily, không tăng quota/billing, bảo tồn bí mật, ledgers và phiên làm việc nội bộ.

---

## 1. Tóm tắt Kỹ thuật (Technical Summary)

Báo cáo ghi nhận tiến độ triển khai giao diện Khám phá (Discovery Assistant) và tích hợp Bản đồ OpenStreetMap trực tuyến theo đặc tả hợp đồng đóng băng tại `docs/DISCOVERY_UPGRADE_NOV03_CONTRACT.md` và các hướng dẫn điều phối kỹ thuật (commit `0786a52`):

1. **Bản đồ OpenStreetMap trực tuyến (MapLibre GL)**:
   - Sử dụng nguồn raster ngói OSM chuẩn `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (biến môi trường `NEXT_PUBLIC_OSM_TILE_URL`).
   - Tuân thủ chính sách kỹ thuật OSM: bộ đệm HTTP trình duyệt thông thường, tiêu đề Referer chuẩn, thiết lập `cancelPendingTileRequestsWhileZooming: true` và `refreshExpiredTiles: false`. Loại bỏ tùy chọn không hỗ trợ `prefetchZoomDelta`.
   - Hiển thị tên đường, phố trên toàn địa bàn Hà Nội ở các mức zoom hữu dụng (6–19).
   - Ghi nhận bản quyền minh bạch: `(c) OpenStreetMap contributors` với liên kết quy chuẩn tại `[data-testid="map-attribution"]`.
   - Đường nối chặng: dạng nét đứt ước tính thẳng, ngắt quãng trung thực khi điểm dừng thiếu tọa độ (không bắc cầu giả định).

2. **Ghim vị trí xuất phát tạm thời có thể kéo thả (Draft Draggable Origin Pin)**:
   - Cho phép nhấp trên bản đồ để đặt ghim tạm (`pilot-draft-origin-marker`) với nhãn "Vị trí đã chọn trên bản đồ (chờ xác nhận)".
   - Ghim tạm có thể kéo thả trực tiếp (`dragend`) để điều chỉnh tọa độ.
   - Nút hành động "Sử dụng vị trí này" (`map-use-draft-location`, `map-use-draft-bar-btn`) kích hoạt hành động `coordinates` với `source: 'map'` và `resolve_address: true`.
   - Không tự động kích hoạt GPS ngầm.

3. **Tìm kiếm theo khu vực không cần điểm xuất phát & Rào chắn xác nhận**:
   - Cho phép tìm kiếm ẩm thực theo khu vực (ví dụ: "phở tại Đống Đa") mà không bị chặn bởi bước chọn điểm xuất phát.
   - Khoảng cách hiển thị trung thực `distance_m = null`, lý do `origin_missing` ("chưa chọn điểm xuất phát").
   - Nút xác nhận lịch trình (`btn-confirm-itinerary`) yêu cầu bắt buộc có điểm xuất phát; khi chưa có, hiển thị thông báo hướng dẫn (`confirm-missing-origin-notice`).

4. **Thực đơn đầy đủ theo phân trang (Paginated Full Menu Modal) & Trung thực Dữ liệu**:
   - Tích hợp endpoint `GET /v1/sessions/{id}/venues/{venue_id}/menu` có kèm mã xác thực `X-Session-Token` từ `latestSessionRef`.
   - Tăng giới hạn thời gian chờ yêu cầu thực đơn lên 25.000 ms (`options.timeoutMs || 25000`) để xử lý các gói lưu trữ lớn đã qua xác thực.
   - Tách biệt truy vấn áp dụng (`menuAppliedQuery`) khỏi bản nháp nhập liệu (`menuSearchQuery`).
   - Bảo vệ danh tính đóng (Async Closure & Identity Guards): sử dụng `latestDetailVenueRef` và `activeMenuIdentityRef` ghi nhận `requestId`, `venueId`, `sessionId`, `appliedQuery`, `appliedGroup`. Hủy bỏ phản hồi trễ khi chuyển đổi quán hoặc phiên.
   - Phân trang tùy chọn lũy kế (>200 tùy chọn): sử dụng hàm thuần `mergeDishOptions` và `applyDishOptionsToMenu` để tích lũy số lượng tùy chọn thực tế qua các trang (100 -> 200 -> 250), tính toán `options_complete` chuẩn xác.
   - Trung thực dữ liệu món và tùy chọn:
     - Khả dụng: `source_available` hiển thị "Nguồn ghi nhận có món"; `unavailable`/`out_of_stock` hiển thị "Tạm hết món" kèm kiểu mờ card; fallback hiển thị "Chưa rõ tình trạng".
     - Mức giá tối thiểu: hiển thị `min_total_vnd` khi có tùy chọn bắt buộc cộng thêm tiền.
     - Nhóm tùy chọn: gắn nhãn chuẩn xác `Bắt buộc` / `Tùy chọn` / `Chưa rõ bắt buộc`; giới hạn lựa chọn không tự suy diễn `0–nhiều` khi null.
     - Giá tùy chọn: hiển thị số tiền cụ thể hoặc `(Chưa rõ giá)`, không tự động coi là miễn phí.

5. **Loại bỏ cảnh báo giá lặp lại**:
   - Loại bỏ các chuỗi lặp "giá tham khảo", "không phải giá tại quán", huy hiệu giao hàng trên thẻ quán, hộp thoại chat, thẻ xác nhận và chi tiết quán.
   - Thay thế bằng dòng ghi nhận nguồn dữ liệu duy nhất: `Nguồn: ShopeeFood` (`data-testid="venue-menu-source"`).
   - Giá hiển thị dạng số tiền rõ ràng (ví dụ: `45.000 đ`); giá bị cách ly hoặc chưa có bằng chứng hiển thị `Giá chưa xác minh`.

---

## 2. Bằng chứng Kiểm thử (Test Evidence)

### 2.1 Kiểm thử Đơn vị & Hợp đồng Frontend (`test_menu_option_pagination.mjs` & `test_osm_map_frontend.mjs`)
- **Phân trang tùy chọn >200**:
  - Trang 1 (0..100): 100 tùy chọn, `options_complete = false`.
  - Trang 2 (offset 100..200): 200 tùy chọn, offset trang tiếp theo tính lũy kế đúng bằng 200.
  - Trang 3 (offset 200..250): 250 tùy chọn, `options_complete = true`.
  - Kết quả: **PASS**.
- **Bộ lọc danh tính trễ & Bảo vệ Closure**:
  - Chuyển từ Quán A sang Quán B trong lúc tải tùy chọn: phản hồi Quán A bị hủy bỏ.
  - Bản nháp ô tìm kiếm (`draftQuery`) không làm biến đổi `appliedQuery` của phiên.
  - Kết quả: **PASS**.
- **Chính sách Bản đồ OSM & Chỉ đường MapLibre**:
  - URL chỉ đường OSM đi bộ (`fossgis_osrm_foot`) và lái xe (`fossgis_osrm_car`) được kiểm định theo regex cho phép.
  - Không thay thế ngầm phương tiện xe máy thành ô tô.
  - Điểm dừng thiếu tọa độ làm đứt đoạn đường nối ước tính, không bắc cầu giả tạo.
  - Kết quả: **PASS (8/8 nhóm bài kiểm thử)**.

### 2.2 Kiểm thử Tương tác API Cơ học (`test_nov03_mechanical_qa.mjs`)
Thực thi với máy chủ nội bộ 8250 (nguồn offline rules/mock):

| Mục kiểm tra | Kết quả mong đợi | Thực tế đo đạc | Đánh giá |
|---|---|---|---|
| Kiểm tra an toàn | LLM offline rules/mock, không tiêu tốn quota Gemini | `llm: mock`, `provider: rules`, API keys rỗng | **PASS** |
| Thao tác toạ độ `map` | Chấp nhận `source: 'map'` và `resolve_address: true` | Hợp đồng chấp nhận, backend chọn toạ độ và gán nhãn | **PASS** |
| Phản hồi địa chỉ Photon | Định danh điểm đã ghim trên bản đồ | `Phố Trần Nguyên Hãn, Hoàn Kiếm, Hà Nội` | **PASS** |
| Phở Đống Đa | Phở nước truyền thống, loại trừ phô mai/tào phớ/phở cuốn | 5 quán Đống Đa; 0 món phô mai, 0 tào phớ, 0 phở cuốn | **PASS** |
| Tương phản Gà rán | Đống Đa có 0 quán thực đơn chính tắc vs Cầu Giấy dương tính | Đống Đa có 0 món khớp chính tắc; Cầu Giấy có đủ món khớp | **PASS** |
| Món ăn không xác định | "món lạ xyzqwer" trả về 0 kết quả | 0 kết quả (không nới lỏng tiêu chí) | **PASS** |
| Thực đơn đầy đủ | Endpoint trả về cấu trúc món chính tắc và nhóm món | HTTP 200, trả về danh mục món, giá và nhóm tuỳ chọn | **PASS** |
| Biên dịch Next.js | Cấu hình đầy đủ biến môi trường 8250 | `✓ Compiled successfully`, nạp đủ cờ 8250 vào chunk tĩnh (exit code 0) | **PASS** |

### 2.3 Bằng chứng Khởi tạo Giao diện Trình duyệt (`test_browser_nov03_real.mjs`)
Thực thi trên Chrome/Edge thực tế kết nối qua CDP cổng 19795 với máy chủ giao diện web 3350:

- Xác nhận khởi tạo giao diện trên cổng 3350, xóa sạch dữ liệu lưu trữ phiên cũ.
- Thực thi tìm kiếm có gõ thực tế: "tôi muốn ăn phở tại Đống Đa", nhận 5 thẻ quán phở nước Đống Đa kèm chỉ báo khoảng cách `origin_missing`.
- Mở modal thực đơn `[data-testid="venue-menu-section"]`: ghi nhận tiêu đề thực đơn kèm số lượng món, huy hiệu nguồn `Nguồn: ShopeeFood`, ô tìm kiếm món ăn, danh mục món và nhóm món, không có cảnh báo giá lặp lại.
- Chuyển chế độ xem bản đồ `[data-testid="pilot-map-toggle"]`: nạp thành công vùng chứa MapLibre và thông tin bản quyền `(c) OpenStreetMap contributors`.
- Tương tác đặt ghim tọa độ tạm thời trên bản đồ và kích hoạt hành động "Sử dụng vị trí này".
- Giả lập khung nhìn di động 390x844: bố cục hiển thị phù hợp, không bị tràn màn hình theo chiều ngang (`scrollWidth <= clientWidth`).

Dữ liệu chi tiết tổng hợp dạng số lượng và giá trị logic được lưu trữ tại `docs/reports/nov03-frontend-qa/browser-evidence.json` (tuân thủ bảo mật, không xuất bản dữ liệu thô ra Git). Các bước kiểm thử hành trình đa điểm dừng và xác nhận lịch trình tiếp theo được thực hiện độc lập tại harness điều phối trung tâm.

---

## 3. Danh sách Tệp tin Sở hữu & Chỉnh sửa

- `frontend/lib/discoveryApi.js`: Hỗ trợ `source: 'map'`, gán cờ `resolve_address: true`, hàm `fetchVenueMenu` kèm token xác thực và thời gian chờ 25.000 ms, hàm tiện ích `mergeDishOptions` và `applyDishOptionsToMenu`, định dạng giá và khoảng cách tinh gọn.
- `frontend/app/components/v2/guided/PilotMap.jsx`: Nguồn ngói raster OSM trực tuyến, loại bỏ cờ `prefetchZoomDelta` không tương thích, ghim kéo thả tạm thời với nút "Sử dụng vị trí này", nhãn chờ xác nhận.
- `frontend/app/components/v2/guided/pilot-map.css`: Giao diện ghim tạm, thanh điều khiển ghim nổi và nút hành động.
- `frontend/app/components/v2/guided/DiscoveryLayout.jsx`: Xử lý chọn vị trí từ bản đồ, tích hợp modal thực đơn đầy đủ có bảo vệ danh tính closure (`activeMenuIdentityRef`, `latestDetailVenueRef`), tách biệt `menuAppliedQuery` khỏi `menuSearchQuery`, tích lũy tùy chọn lũy kế qua `applyDishOptionsToMenu`, rào chắn xác nhận điểm xuất phát, loại bỏ cảnh báo giá lặp lại, hiển thị trung thực tính khả dụng của món và giá tối thiểu.
- `frontend/app/components/v2/guided/discovery-visual.css`: Kiểu dáng cho thực đơn phân trang, nhóm tùy chọn món, nút xóa lọc tìm kiếm, nhãn nguồn dữ liệu tinh gọn và huy hiệu tình trạng món.
- `frontend/app/components/v2/guided/ConfirmSummaryCard.jsx`: Tinh chỉnh ghi chú ngân sách trung thực, loại bỏ đoạn văn cảnh báo giá dư thừa.
- `qa/discovery-assistant/test_osm_map_frontend.mjs`: Bộ kiểm thử hồi quy đơn vị bản đồ OSM và MapLibre.
- `qa/discovery-assistant/test_menu_option_pagination.mjs`: Bộ kiểm thử phân trang tùy chọn >200 và bảo vệ danh tính yêu cầu, thực thi trực tiếp các hàm tiện ích từ `discoveryApi.js`.
- `qa/discovery-assistant/test_nov03_mechanical_qa.mjs`: Bộ kiểm thử cơ học tự động bao quát toàn bộ hợp đồng nâng cấp ngày 03/11.
- `qa/discovery-assistant/test_browser_nov03_real.mjs`: Kịch bản kiểm thử giao diện trình duyệt thực tế qua CDP cổng 19795.
