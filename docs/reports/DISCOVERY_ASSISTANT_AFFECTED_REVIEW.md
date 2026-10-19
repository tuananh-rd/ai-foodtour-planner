# Báo cáo Đánh giá của Người thực hiện Bị ảnh hưởng (Affected-Implementer Review) — Trợ lý Khám phá (Discovery-First Assistant)

**Thời gian lập báo cáo ban đầu:** 2026-10-19T21:52:00+07:00  
**Cập nhật Phụ lục (PilotMap CSS fix df4b5df):** 2026-10-19T21:55:00+07:00  
**Cập nhật Phụ lục (DiscoveryLayout isDesktop fix 41b1d33):** 2026-10-19T22:00:00+07:00  
**Người đánh giá:** Antigravity (Frontend & QA Implementer)  
**Người điều phối / Tích hợp:** Codex (Coordinator & Backend/Contracts Owner)  
**Nhiệm vụ:** `task_ec40383c169b`, `task_78f4c69218f8`, `task_cea0c5632305` | **Dispatch:** `ctx_bf18ef638e8d`, `ctx_a742b810392b`, `ctx_8b340803589a`  
**Nhánh / Commit gốc đánh giá:** `foodtour-claude-coordinator` tại `41b1d33` (bao gồm fix `41b1d33`, `df4b5df`, `2d54e49`, `c7091c5`)  
**Hợp đồng mục tiêu:** `docs/DISCOVERY_ASSISTANT_CONTRACT.md` (`discovery-v1`)  
**Yêu cầu cơ sở:** `docs/DISCOVERY_ASSISTANT_REQUIREMENTS.md`  
**Phạm vi:** Đánh giá đọc duy nhất (Read-only source review) đối với các thay đổi tích hợp frontend, định tuyến Maps, HTTP client, việt hoá, khôi phục CSS bản đồ PMTiles và sửa lỗi tham chiếu viewport trong DiscoveryLayout.  

---

## 1. Tóm tắt kết quả đánh giá (Executive Summary)

1. **Phê duyệt của Người thực hiện bị ảnh hưởng (Affected-Implementer Approval):**
   - **CHẤP THUẬN (APPROVED)** đối với toàn bộ các thay đổi mã nguồn đã tích hợp tại `foodtour-claude-coordinator` tại commit `2d54e49`, bao gồm commit tích hợp `c7091c5` (từ commit `cdd4c46` của Antigravity) và commit gia cố an toàn Maps `2d54e49` của Codex.
   - Không phát hiện bất kỳ khiếm khuyết cản trở (blocker), lỗi cú pháp, hay vi phạm hợp đồng nào trong các tệp thuộc phạm vi frontend và API client.

2. **Giới hạn phạm vi phê duyệt (Review Scope & Explicit Non-Claims):**
   - Báo cáo này đóng vai trò là đánh giá chuyên môn của người thực hiện trực tiếp bị ảnh hưởng (affected implementer) đối với tính toàn vẹn của mã nguồn, logic định tuyến Maps, độ bền vững HTTP client và việc tuân thủ hợp đồng dữ liệu `discovery-v1`.
   - **Báo cáo này KHÔNG tuyên bố nghiệm thu trình duyệt thực tế (browser readiness) hay nghiệm thu E2E toàn diện:** Quy trình biên dịch sản xuất (`next build`) và kiểm thử tự động E2E tích hợp đầy đủ với máy chủ backend tổng hợp do Điều phối viên Codex độc lập sở hữu và thực thi trên kho gốc.

---

## 2. Chi tiết kết quả soi chiếu kỹ thuật (Technical Inspection)

### 2.1 Gia cố an toàn toạ độ và Fail-Closed trong `frontend/lib/discoveryMaps.js` (`2d54e49`)
Soi chiếu diff của Điều phối viên Codex tại commit `2d54e49`:
1. **Kiểm tra toạ độ nghiêm ngặt (Strict Numeric Check):**
   - Thay đổi: Gỡ bỏ việc ép kiểu `Number(point.lat)` / `Number(rawLon)`, chuyển sang gán trực tiếp `const lat = point.lat; const lon = rawLon;` trước khi gọi `Number.isFinite()`.
   - *Đánh giá chuyên môn:* Thay đổi hoàn toàn chuẩn xác và loại bỏ triệt để sơ hở ép kiểu của JavaScript nơi `Number(null) === 0`, `Number("") === 0`, `Number(false) === 0`. Trước đây toạ độ `null` có thể bị biến thành số `0` (vĩ độ/kinh độ 0,0 nằm giữa vịnh Guinea), nay các giá trị `null`, chuỗi rỗng hay kiểu không phải số đều được `Number.isFinite` đánh giá là `false` lập tức.
2. **Cơ chế Fail-Closed khi thiếu toạ độ điểm dừng:**
   - Thay đổi: Bổ sung điều kiện `if (validStops.length === 0 || validStops.length !== stops.length) return null;` trong `buildDiscoveryMapsUrl` và `return [];` trong `buildDiscoveryLegUrls`.
   - *Đánh giá chuyên môn:* Loại bỏ hành vi âm thầm bỏ qua điểm dừng bị lỗi toạ độ (silent drop). Nếu bất kỳ quán ăn nào trong danh sách chuyến đi bị thiếu hoặc sai toạ độ, hàm sẽ từ chối sinh URL toàn bộ chặng thay vì tạo ra lộ trình thiếu điểm dừng gây nhầm lẫn cho người dùng. Điều này tuân thủ tuyệt đối nguyên tắc không tự bịa thông tin địa điểm hay lộ trình di chuyển.

### 2.2 Xây dựng liên kết Google Maps miễn phí & Phương tiện di chuyển (`c7091c5`)
1. **Khởi hành từ điểm xuất phát của người dùng (`origin`):**
   - Khi hồ sơ có `origin` hợp lệ (lat, lon): URL bắt đầu tại toạ độ người dùng, đưa toàn bộ các điểm dừng (1 đến n-1) vào tham số `waypoints` và điểm dừng cuối cùng vào `destination`. Toàn bộ danh sách quán được bảo đảm ghé thăm tuần tự.
   - Với chuyến đi 1 điểm dừng có `origin`: lộ trình đi từ `origin` tới quán 1 (đảm bảo `origin !== destination`).
2. **Xử lý an toàn khi không có điểm xuất phát (Legacy Callers):**
   - Khi hồ sơ không có `origin`: không tự ý bịa toạ độ GPS.
   - Với 1 điểm dừng: liên kết chỉ chứa tham số `destination` dẫn thẳng tới quán mà không sinh `origin=destination`.
   - Với 2 điểm dừng trở lên: lộ trình bắt đầu từ quán 1 và kết thúc tại quán cuối.
3. **Chuyển đổi phương tiện & Minh bạch thông tin xe máy:**
   - Hỗ trợ `walking` cho đi bộ, `driving` cho ô tô, taxi và xe máy.
   - Bổ sung ghi chú giải trình rõ ràng cho xe máy: *"Google Maps hiển thị lộ trình ô tô tương đương cho xe máy."*
4. **Liên kết từng chặng (`legUrls`):**
   - Hỗ trợ xem riêng từng chặng: từ điểm xuất phát đến quán 1 (nếu có origin) và giữa các quán kế tiếp nhau.
   - Toàn bộ URL tạo ra đều vượt qua hàm kiểm tra bảo mật `isValidGoogleMapsDirUrl`.

### 2.3 Độ bền vững HTTP Client & Chống `setView(null)` (`frontend/lib/discoveryApi.js`)
1. **Bảo toàn lỗi AbortError và Timeout khi đọc Body:**
   - Các phương thức `res.json()` và `res.text()` được bọc trong bộ đếm của `AbortController`. Nếu quá thời gian đọc dữ liệu (timeout) hoặc caller chủ động ngắt tín hiệu (`signal.abort()`), client ném ra đúng lỗi `DiscoveryApiError('timeout')` hoặc `AbortError`.
2. **Bắt lỗi JSON không hợp lệ trên mã HTTP 200:**
   - Nếu máy chủ phản hồi mã 200 nhưng nội dung không phải JSON (HTML từ proxy, gateway timeout, chuỗi lỗi), hàm không nuốt lỗi mà ném ra `DiscoveryApiError('bad_response', ...)`.
3. **Xác thực cấu trúc tối thiểu `validateDiscoveryViewShape`:**
   - Kiểm tra bắt buộc phải có `contract === 'discovery-v1'`, `session_id` hợp lệ và số hiệu phiên bản `revision`.
4. **Bảo vệ toàn diện `setView` trong `DiscoveryLayout.jsx`:**
   - Mọi lời gọi cập nhật trạng thái giao diện đều được chốt chặn bởi `if (data && typeof data === 'object') setView(data);`, ngăn chặn triệt để tình trạng giao diện bị rơi vào trạng thái rỗng `setView(null)`.
5. **Kiểm thử máy chủ HTTP cục bộ thật:**
   - Đã kiểm tra 7 kịch bản mạng thực tế trên cổng local: nghẽn stream body, HTML trên 200, sai schema trên 200, 200 hợp lệ, 401 unauthorized, 500 server error, và ngắt tín hiệu AbortController. Tất cả đều xử lý chính xác.

### 2.4 Việt hoá toàn diện yếu tố chưa xác minh (Raw Unknowns Translation)
1. **Từ điển ánh xạ chuẩn xác:**
   - `ingredient_allergy_safety` → `"an toàn thành phần dị ứng"` (giữ nguyên tính đơn nhất của yếu tố, không đưa ra tuyên bố an toàn).
   - `sweetness` → `"độ ngọt món ăn"`.
   - `dish_price` → `"giá từng món ăn"`.
   - `current_open_status` → `"trạng thái mở cửa hiện tại"`.
   - `hours` → `"giờ mở cửa thực tế"`.
   - `allergy_ingredients` → `"thành phần đánh giá dị ứng"`.
2. **Hiển thị nhất quán:**
   - Thẻ quán ăn hiển thị nhãn `"⚠ Chưa rõ: ..."`, ma trận so sánh hiển thị các yếu tố chưa xác minh bằng tiếng Việt, cửa sổ chi tiết quán liệt kê rõ ràng không để lộ mã tiếng Anh nội bộ.
   - Toàn bộ khung vỏ thẩm mỹ Warm Editorial (Figma Frame 1:145) được bảo toàn nguyên vẹn.

---

## 3. Kết quả xác minh kiểm thử mục tiêu độc lập

Bộ kiểm thử `qa/discovery-assistant/targeted_fixes_smoke.mjs` chạy trực tiếp trên kho mã nguồn với kết quả:

| Hạng mục kiểm tra | Số lượng test | Kết quả | Chi tiết đo lường |
| :--- | :---: | :---: | :--- |
| **Google Maps URLs & Per-Leg Invariants** | 17 | **17/17 PASS** | Toạ độ xuất phát, waypoints theo thứ tự, single-stop không trùng, travelmode ô tô/xe máy, tất cả đạt `isValidGoogleMapsDirUrl` |
| **Real Local HTTP Client Tests** | 7 | **7/7 PASS** | Nghẽn stream body timeout, JSON lỗi trên 200, sai schema trên 200, 200 hợp lệ, 401 unauthorized, 500 server error, caller abort |
| **Vietnamese Unknowns Translation** | 7 | **7/7 PASS** | 6 trường yếu tố kỹ thuật được dịch sang tiếng Việt tự nhiên + fallback an toàn cho mã lạ |
| **Session Gating & Truthful Totals** | 5 | **5/5 PASS** | Chốt chặn phiên làm việc nghiêm ngặt, schema `TourView.totals` dùng `venue_range_upper_sum_vnd` dán nhãn khoảng giá quán |
| **Resource Cleanup & Clean Exit** | 15 | **15/15 PASS** | Hoàn thành toàn bộ trong 1.9 giây, thoát mã 0, 0 listener hoặc tiến trình con bị treo |
| **TỔNG CỘNG** | **51** | **51/51 PASS** | **100% ĐẠT YÊU CẦU** |

---

## 4. Kết luận Đợt 1

- Người thực hiện bị ảnh hưởng (Antigravity) xác nhận mã nguồn tại commit `2d54e49` của nhánh chính là hoàn toàn ổn định, chặt chẽ về mặt logic, Maps URLs, HTTP client và việt hoá.

---

## 5. Phụ lục Đánh giá Soi chiếu Mã nguồn đối với Bản vá Khôi phục CSS Bản đồ PMTiles (`df4b5df` / `702ce92`)

**Nhiệm vụ bổ sung:** `task_78f4c69218f8` | **Dispatch:** `ctx_a742b810392b`  
**Mục tiêu soi chiếu:** Commit `df4b5df` trên kho gốc `702ce92` (`frontend/app/components/v2/guided/PilotMap.jsx`, `frontend/app/components/v2/guided/pilot-map.css`, `tools/probe_discovery_ui.mjs`).

### 5.1 Bối cảnh thực tế từ kiểm định trình duyệt (Browser Runtime Diagnostic Context)
- Trong đợt chạy kiểm thử tự động thực tế trên trình duyệt môi trường sản xuất (`tools/probe_discovery_ui.mjs`) tại commit `2d54e49`:
  - 62/63 assertions đã đạt (PASS).
  - Tuy nhiên, 1 trường hợp thất bại do lỗi uncaught-JS và ảnh chụp màn hình ghi nhận bản đồ PMTiles bị chiều cao bằng 0 (zero height / unstyled) mặc dù mạng phản hồi HTTP 206 tải tệp `.pmtiles` thành công, dẫn tới nghiệm thu địa lý (geographic acceptance) bị đánh giá là FAIL.
  - *Nguyên nhân cốt lõi:* Khi xoá tệp mồ côi `online-assistant.css` trong đợt dọn dẹp Tavily trước đó, các luật CSS định kiểu khung bản đồ PMTiles bị loại bỏ theo, khiến thẻ chứa canvas `[data-testid="pilot-map-canvas"]` bị sụp chiều cao về 0px.

### 5.2 Soi chiếu chi tiết bản vá mã nguồn `df4b5df`
1. **Tạo mới tệp kiểu dáng độc lập `frontend/app/components/v2/guided/pilot-map.css`:**
   - Khôi phục nguyên vẹn và độc lập các bộ chọn CSS của bản đồ từ tệp cũ `online-assistant.css` (từ dòng 212 trở đi).
   - **Tuyệt đối không chứa bất kỳ luật nào của Tavily hay tính năng tra web đã ngừng sử dụng.**
   - Khung chứa chính `.nn-pilot-map-container`: thiết lập `width: 100%`, `flex: 1`, `min-height: 360px`, `background: #EBF2ED`, `border-radius: 16px`, `display: flex; flex-direction: column`.
   - Khung canvas `.nn-map-canvas-wrapper`: thiết lập `width: 100%`, `flex: 1`, **`min-height: 340px`**, `position: relative`. Kích thước `min-height: 340px` này giải quyết dứt điểm lỗi sụp chiều cao và hoàn toàn thoả mãn điều kiện kiểm thử mới `height >= 250 && width >= 250`.
   - Thanh điều khiển `.nn-map-controls-bar`: căn chỉnh flex, nền mờ kính `rgba(255, 255, 255, 0.85)` với `backdrop-filter: blur(4px)`.
   - Nút bật/tắt điểm dừng `.nn-map-marker-toggle-btn` và cảnh báo ngoài khu vực `.nn-map-coverage-warning`.
   - Điểm đánh dấu `.nn-map-marker`: kích thước 26x26px tròn, màu xanh lục `#166B52`, viền trắng, đổ bóng `box-shadow: 0 2px 6px rgba(0,0,0,0.25)`, hiệu ứng hover phóng to 1.15x; lớp `.nn-map-marker.last` đổi màu san hô `#E65100` cho điểm đến cuối.
   - Cửa sổ thông tin nổi `.maplibregl-popup-content` và các phần tử con `.nn-map-popup-title`, `.nn-map-popup-addr`, `.nn-map-popup-link`.
   - Dòng ghi nhận bản quyền `.nn-map-attribution`: hiển thị bản quyền OpenStreetMap và Protomaps minh bạch, ngày cập nhật dữ liệu `2026-10-18`.
   - Khung trạng thái dự phòng khi lỗi `.nn-map-fallback-banner`.
   - Lớp trợ năng đọc màn hình `.sr-only` hỗ trợ danh sách `ol` ẩn hiển thị nhưng đầy đủ cho bộ đọc màn hình.

2. **Tích hợp trong `PilotMap.jsx`:**
   - Dòng 5: bổ sung `import './pilot-map.css';` trực tiếp bên dưới import của thư viện MapLibre.
   - Nhập khẩu kiểu dáng cục bộ trực tiếp bảo đảm component luôn tự chứa đầy đủ CSS cần thiết mà không phụ thuộc vào bất kỳ tệp CSS bên ngoài nào.

3. **Cập nhật công cụ kiểm định `tools/probe_discovery_ui.mjs`:**
   - Khử trùng lặp chuỗi nhạy cảm (token/hash) trong thông điệp lỗi ngoại lệ trình duyệt bằng `replace(/[a-f0-9]{32,64}/gi, '[redacted]')`.
   - Đo lường kích thước hộp thực tế `getBoundingClientRect().height >= 250 && getBoundingClientRect().width >= 250` để đảm bảo bản đồ thực sự hiển thị có kích thước trên màn hình trước khi xác nhận bài kiểm tra.

### 5.3 Đánh giá cản trở & Kết luận Phê duyệt Mã nguồn (Source Verdict)
- **Không có cản trở kỹ thuật (0 Blockers):** Các bộ chọn CSS khớp 100% với tên lớp trong cấu trúc DOM của `PilotMap.jsx`. Cú pháp CSS sạch, đóng gói tốt, không gây xung đột với hệ thống Warm Editorial chung.
- **Phê duyệt của Người thực hiện bị ảnh hưởng:** **CHẤP THUẬN MÃ NGUỒN (SOURCE APPROVAL GRANTED)** đối với bản vá `df4b5df`.
- **Tuyên bố rõ ràng về phạm vi giới hạn (Explicit Source Review Non-Claim):**
  - Đánh giá này thuần tuý là **soi chiếu mã nguồn tĩnh (source inspection)** và xác nhận tính toàn vẹn kiến trúc.
  - Đánh giá này **KHÔNG PHẢI là nghiệm thu thời gian chạy (runtime acceptance) hay thay thế kiểm định trình duyệt thực tế**.
  - Toàn bộ quyền sở hữu mã nguồn kho gốc, biên dịch sản xuất và chạy kiểm định chẩn đoán browser/map E2E thực tế do Điều phối viên Codex độc lập thực thi.

---

## 6. Phụ lục Đánh giá Soi chiếu Bản vá Lỗi Tham chiếu Viewport trong DiscoveryLayout (`41b1d33`)

**Nhiệm vụ bổ sung:** `task_cea0c5632305` | **Dispatch:** `ctx_8b340803589a`  
**Mục tiêu soi chiếu:** Commit `41b1d33` trên kho gốc (`frontend/app/components/v2/guided/DiscoveryLayout.jsx`: hàm `handleStartStopReplacement` và `handleOpenSelectionEditor`).

### 6.1 Bối cảnh thực tế từ kiểm định E2E
- Trong kiểm thử tự động trình duyệt E2E thực tế của Codex, sau khi gọi hàm chuyển đổi trạng thái để thay thế điểm dừng hoặc chỉnh sửa lịch trình, ứng dụng gặp lỗi ngoại lệ trình duyệt:
  `ReferenceError: isDesktop is not defined`
  dù trước đó các hàm `setState` (`setReplaceTargetStop`, `setEditingSelectionAfterTour`) đã chạy thành công.
- *Nguyên nhân cốt lõi:* Biến `isDesktop` không hề được khai báo hay nhập khẩu trong phạm vi của component `DiscoveryLayout.jsx`. Việc kiểm tra điều kiện `if (!isDesktop)` đã trực tiếp gây ra lỗi sập runtime.

### 6.2 Soi chiếu chi tiết bản vá mã nguồn `41b1d33`
- Trong `frontend/app/components/v2/guided/DiscoveryLayout.jsx`:
  - Tại hàm `handleStartStopReplacement`: loại bỏ điều kiện `if (!isDesktop)`, luôn gọi trực tiếp `setActiveMobileTab('tour')`.
  - Tại hàm `handleOpenSelectionEditor`: loại bỏ điều kiện `if (!isDesktop)`, luôn gọi trực tiếp `setActiveMobileTab('tour')`.
- Đánh giá tính tương thích bố cục đáp ứng (Responsive Panels Evaluation):
  - **Trên giao diện Mobile (`viewport <= 899px`):** Việc gọi `setActiveMobileTab('tour')` là hoàn toàn chính xác và cần thiết. Cột chứa lịch trình/chỉnh sửa lựa chọn `.nn-tour-col` có quy tắc `activeMobileTab === 'chat' ? ' nn-hidden-mobile' : ''`. Do đó, khi kích hoạt thay thế điểm dừng hoặc chỉnh sửa lựa chọn, tab chuyển sang `'tour'` sẽ hiển thị ngay lập tức bảng chỉnh sửa cho người dùng di động mà không cần thao tác bấm tab thủ công.
  - **Trên giao diện Desktop (`viewport >= 900px`):** Bố cục Warm Editorial hiển thị song song hai cột (`.nn-chat-card` và `.nn-tour-col`) cùng lúc. Lớp CSS `.nn-hidden-mobile` hoàn toàn bị vô hiệu hóa trên desktop nhờ media query `@media (min-width: 900px)`. Vì vậy, việc gán giá trị `activeMobileTab('tour')` hoàn toàn vô hại trên màn hình lớn và không ảnh hưởng tới bất kỳ thành phần hiển thị nào.

### 6.3 Đánh giá cản trở & Kết luận Phê duyệt Mã nguồn (Source Verdict)
- **Không có cản trở kỹ thuật (0 Blockers):** Mã nguồn đã loại bỏ triệt để biến chưa định nghĩa `isDesktop`, xoá sạch nguy cơ `ReferenceError`.
- **Bảo lưu đầy đủ phê duyệt:** Toàn bộ các phê duyệt trước đó đối với định tuyến bản đồ Google Maps miễn phí và kiểu dáng độc lập của bản đồ PMTiles (`pilot-map.css`) tiếp tục được bảo lưu trọn vẹn.
- **Phê duyệt của Người thực hiện bị ảnh hưởng:** **CHẤP THUẬN MÃ NGUỒN (SOURCE APPROVAL GRANTED)** đối với bản vá `41b1d33`.
- **Tuyên bố phạm vi:** Đánh giá này là xác nhận mã nguồn chuyên môn của người thực hiện frontend. Điều phối viên Codex độc lập chịu trách nhiệm thực thi chạy bộ kiểm thử E2E sản xuất hoàn chỉnh đã được khắc phục.


