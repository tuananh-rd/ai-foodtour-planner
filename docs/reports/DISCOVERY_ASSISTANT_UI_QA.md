# Báo cáo Kiểm thử Giao diện Trợ lý Khám phá (Discovery-First Assistant UI) — Warm Editorial Frame 1:145

**Thời gian kiểm định ban đầu:** 2026-10-19T20:20:00+07:00  
**Cập nhật khắc phục khiếm khuyết:** 2026-10-19T21:20:00+07:00  
**Người thực hiện:** Antigravity (Frontend & QA Implementer)  
**Người điều phối / Tích hợp:** Codex (Coordinator & Backend/Contracts Owner)  
**Nhiệm vụ:** `task_6d373f53c224` & `task_cbddafbb1462` | **Dispatch:** `ctx_fd0058920726` & `ctx_f0fa5d06505b`  
**Hợp đồng mục tiêu:** `docs/DISCOVERY_ASSISTANT_CONTRACT.md` (`discovery-v1`)  
**Yêu cầu cơ sở:** `docs/DISCOVERY_ASSISTANT_REQUIREMENTS.md`  
**Thiết kế chuẩn thẩm mỹ:** Khung Figma 1:145 "02 — Măm Măm / Warm editorial" (1440x1024, tệp gốc `docs/design/figma-warm-editorial-reference.png`)  

---

## 1. Tóm tắt kết quả (Executive Summary)

1. **Khôi phục toàn diện khung giao diện Warm Editorial (Figma Frame 1:145):**
   - Đã thay thế bố cục cũ bằng khung vỏ chuẩn Warm editorial kế thừa từ hệ thống visual styles đã được phê duyệt (`guided-visual.css`):
     - **Thanh bên điều hướng màu hạt dẻ/rỉ sét (Rust Sidebar):** Rộng đúng **232px** tại `x = 0`, nền màu nâu hạt dẻ đậm `#702914`. Hiển thị logo thương hiệu `măm măm.` kiểu serif in đậm, khẩu hiệu `ĐI ĐỂ ĂN. ĂN ĐỂ NHỚ.`, nút `+ Chuyến đi mới` (`.nn-new-trip-btn`), menu chức năng chính (`✦ Trò chuyện`, `◇ Chuyến đi`, `⚙ Tuỳ chỉnh hồ sơ`), danh sách gợi ý nhanh (`GỢI Ý KHÁM PHÁ`), thẻ vàng bản địa (`Ăn như người bản địa`) và chân trang định danh phiên.
     - **Không gian canvas màu vàng ấm (Warm Golden Yellow Canvas):** Màu nền `#F9C53D` phủ trọn vẹn không gian làm việc. Thanh tiêu đề trên (`.nn-topbar`) hiển thị breadcrumb `KHÁM PHÁ / TRỢ LÝ FOOD TOUR`, huy hiệu khu vực khảo sát và lựa chọn ngôn ngữ `Tiếng Việt ⌄`.
     - **Lưới 2 cột đặc trưng Warm Editorial:** Cột trái là thẻ chat bo tròn góc 24px (`.nn-chat-card`, rộng 668px, nền ngà `#FFFEFA`); cột phải là cột chuyến đi (`.nn-tour-col`, rộng 452–476px).
   - Đã gỡ bỏ hiển thị thanh tab mobile trên desktop (ẩn hoàn toàn trên màn hình >= 1024px, chỉ kích hoạt khi màn hình <= 1024px và 390px).

2. **Khắc phục triệt để hợp đồng hồ sơ ban đầu (Strict Nullable Profile):**
   - Không còn bất kỳ giá trị mặc định giả mạo nào (không tự bịa Hoàn Kiếm, 2 người, 18:30, 120 phút, đi bộ, hoặc metadata nguồn tổng hợp). Toàn bộ các trường hồ sơ ban đầu (`area`, `origin`, `party_size`, `budget_vnd`, `budget_scope`, `start_time`, `end_time`, `duration_min`, `vehicle`, `max_leg_min`) đều là `null` hoặc mảng rỗng `[]`.
   - Trạng thái nguồn dữ liệu (`source`) bắt đầu bằng `null` cho đến khi máy chủ phản hồi chính thức.

3. **Cơ chế xử lý lỗi máy chủ & phục hồi trạng thái:**
   - **Xử lý GET 404:** Coi 404 là lỗi phiên không tồn tại thực sự (`session_not_found`), hiển thị cảnh báo rõ ràng và khoá toàn bộ chức năng nhập liệu/mutation cho đến khi người dùng khởi tạo phiên mới qua nút "Chuyến đi mới".
   - **Xử lý xung đột 409:** Bắt mã 409, thông báo người dùng và tải lại trạng thái mới nhất từ `GET /v1/sessions/{id}/assistant` mà **không tự động replay mutation**. Đặc biệt, văn bản nháp của người dùng trong ô chat được giữ nguyên, không bị xoá mất.
   - **Bảo vệ bất đồng bộ & Timeout:** Thêm `AbortController` và `fetchWithTimeout` (15s mặc định) trong `discoveryApi.js`. Theo dõi số hiệu yêu cầu `requestTokenRef` để tự động loại bỏ các phản hồi cũ/bị huỷ khi chuyển phiên.
   - **Lỗi xác thực 422:** Hàm `formatValidationError` trích xuất thông điệp chi tiết từ schema lỗi (Pydantic/FastAPI) và hiển thị dạng tiếng Việt rõ ràng, dễ hiểu.

4. **Ngăn kéo hồ sơ thu gọn & Khả năng tiếp cận Modal:**
   - **Profile Drawer:** Chỉ đóng gói (`patch`) các trường người dùng thực sự thay đổi. Các trường số để trống không bao giờ bị chuyển đổi thành số 0; hỗ trợ nút lấy tọa độ GPS thực tế (`navigator.geolocation`) kèm thông báo bảo mật, không tự ý gán tâm khu vực làm điểm xuất phát.
   - **Detail Venue Modal:** Đáp ứng đầy đủ tiêu chuẩn trợ năng WAI-ARIA (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`), tích hợp bẫy tiêu điểm bàn phím (Focus Trap), phím `Escape` để đóng cửa sổ và tự động trả lại tiêu điểm bàn phím cho nút đã kích hoạt trước đó.

5. **Kết quả kiểm thử tự động & Minh bạch giải phóng tiến trình:**
   - Bộ kiểm thử giao diện `qa/discovery-assistant/run_discovery_qa.mjs` chạy hoàn toàn trên các cổng cô lập (Web 13600, Mock API 18600, CDP 19800) xác nhận **26/26 bài kiểm tra đạt (100% PASS)** và kết xuất ảnh so sánh song song `side_by_side_comparison.png`.
   - **Minh bạch về sự cố tiến trình ban đầu:** Trong lần chạy đầu tiên, dù 26 assertions đã pass, tiến trình Node.js của test harness đã bị treo giữ event loop suốt 32 phút do các tiến trình con (`next start` và trình duyệt headless CDP) không tự giải phóng triệt để, buộc Điều phối viên Codex phải can thiệp cưỡng chế dừng tiến trình PID 25540. Sau đó, Antigravity đã bổ sung khối hàm `cleanup()` dọn dẹp toàn bộ process con và gọi `process.exit(0)`.
   - **Bộ kiểm thử mục tiêu độc lập (`targeted_fixes_smoke.mjs`):** Để kiểm chứng 5 lỗi phát hiện trong phiên đánh giá mà không cần chạy lại toàn bộ harness tốn kém tài nguyên, Antigravity đã thiết kế bộ smoke test chuyên biệt kiểm tra: (1) timeout bao trùm việc đọc body, (2) logic chốt chặn phiên làm việc, (3) tính trung thực của schema số liệu `TourView.totals`, (4) luồng đổi điểm dừng sau tour qua các tool hợp lệ, và (5) khả năng thoát tiến trình sạch. Kết quả: **20/20 checks PASS trong 1.4s, 0 hanging listeners, clean exit 0**.
   - Biên dịch sản xuất `next build` hoàn tất với **0 lỗi lint, 0 lỗi TypeScript/build**.

---

## 2. Bảng bằng chứng kiểm thử tự động (26/26 PASS)

Dữ liệu chi tiết trích xuất từ `qa/discovery-assistant/evidence.json`:

| STT | Mã kiểm tra | Hạng mục kiểm tra | Kết quả | Chi tiết đo lường / Bằng chứng |
| :---: | :--- | :--- | :---: | :--- |
| 1 | `PREFLIGHT_PORTS` | Kiểm tra TCP Refusal các cổng cô lập (13600, 18600, 19800) | **PASS** | Hoàn toàn giải phóng trước khi khởi động |
| 2 | `MOCK_API_RUNNING` | Khởi động máy chủ mô phỏng chuẩn `discovery-v1` trên cổng 18600 | **PASS** | Cung cấp đúng hợp đồng `discovery-v1` |
| 3 | `FRONTEND_BUILD` | Biên dịch Next.js trong môi trường scratch độc lập | **PASS** | Biên dịch thành công |
| 4 | `FRONTEND_RUNNING` | Máy chủ Next.js phản hồi trên cổng 13600 | **PASS** | HTTP 200 OK |
| 5 | `SIDEBAR_GEOMETRY` | Thanh bên điều hướng rộng 232px tại x=0, màu hạt dẻ đậm `#702914` | **PASS** | `width: 232px, x: 0, color: rgb(112, 41, 20)` |
| 6 | `CANVAS_GOLDEN_YELLOW`| Không gian canvas màu vàng ấm Warm Editorial | **PASS** | `color: rgb(249, 197, 61)` |
| 7 | `TWO_COLUMN_GRID` | Lưới 2 cột gồm Thẻ chat (668px) và Cột chuyến đi (452px) | **PASS** | `chatCard: 668px, tourCol: 452px` |
| 8 | `BRAND_HEADER` | Thanh bên hiển thị logo "măm măm.", khẩu hiệu và nút chuyến đi mới | **PASS** | Đúng định dạng font, cỡ chữ và typography |
| 9 | `TAVILY_REMOVED` | Gỡ bỏ hoàn toàn hộp kiểm và tính năng tra web ngoài Tavily | **PASS** | `hasTavily: false` |
| 10 | `CHECKLIST_REMOVED` | Gỡ bỏ hoàn toàn checklist "Mình hiểu là" trong khung chat chính | **PASS** | `hasUnderstoodChecklist: false` |
| 11 | `RESULTS_CARD_METADATA` | Thẻ quán ăn hiển thị badge (A-E), tên, giá quán `venue_range`, nguồn | **PASS** | Phở 10 Lý Quốc Sư, nhãn A, ngữ nghĩa giá quán |
| 12 | `DETAIL_MODAL_OPEN` | Mở cửa sổ chi tiết quán với `role="dialog"` chuẩn WAI-ARIA | **PASS** | Hộp thoại mở ra và kích hoạt tiêu điểm |
| 13 | `DETAIL_MODAL_ESCAPE_CLOSE`| Nhấn phím Escape đóng cửa sổ và trả tiêu điểm về nút kích hoạt | **PASS** | Tiêu điểm phục hồi đúng vị trí ban đầu |
| 14 | `SELECTION_ADD` | Thêm quán vào danh sách chuyến đi cột phải | **PASS** | Thẻ quán xuất hiện trong cột Chuyến đi |
| 15 | `SELECTION_LOCK` | Khoá/Mở khoá quán thành công (`🔒`/`🔓`) | **PASS** | Trạng thái toggle chính xác |
| 16 | `COMPARISON_VIEW` | Bảng so sánh 2–5 quán đa tiêu chí và cảnh báo thiếu bằng chứng | **PASS** | Lưới so sánh hiển thị đầy đủ thông tin |
| 17 | `PROFILE_DRAWER_OPEN` | Mở ngăn kéo tuỳ chỉnh hồ sơ (⚙ Tuỳ chỉnh hồ sơ) | **PASS** | Hiển thị bảng điều khiển ngoài luồng chat |
| 18 | `PROFILE_DRAWER_SAVE` | Cập nhật số người, ngân sách, không biến null thành 0 | **PASS** | Gửi action `update_preferences` chính xác |
| 19 | `CONFIRMATION_CARD_RENDERED` | Thẻ xác nhận hiển thị tóm tắt, lưu ý dị ứng và nút xác nhận tường minh | **PASS** | Chưa tạo tour khi chưa bấm nút xác nhận |
| 20 | `EXPLICIT_CONFIRM_GATE` | Cổng xác nhận tường minh qua nút `btn-confirm-itinerary` | **PASS** | Lịch trình `GuidedTimeline` được tạo sau khi xác nhận |
| 21 | `MAP_VIEW_TOGGLE` | Chuyển đổi hiển thị Sơ đồ / Bản đồ (PilotMap PMTiles tự lưu trữ) | **PASS** | Chuyển đổi bản đồ mượt mà |
| 22 | `CONFLICT_409_HANDLED` | Xử lý xung đột 409: giữ bản nháp tin nhắn, re-fetch không replay | **PASS** | `errorHandled: true`, bảo toàn nội dung người dùng |
| 23 | `MOBILE_390_NO_OVERFLOW` | Màn hình di động 390px không bị tràn ngang | **PASS** | `scrollWidth: 390`, `hasOverflow: false` |
| 24 | `MOBILE_TABS_VISIBLE` | Thanh tab di động (Trò chuyện, Chuyến đi, Bản đồ) hiển thị đầy đủ | **PASS** | `tabsVisible: true` |
| 25 | `ZOOM_200_REFLOW` | Độ phóng đại 200% reflow mượt mà, không vỡ layout | **PASS** | `noCrash: true` |
| 26 | `VISUAL_SIDE_BY_SIDE` | Tạo ảnh so sánh trực quan song song (2880x1024) | **PASS** | Tệp `side_by_side_comparison.png` hoàn tất |

---

## 3. Đánh giá thị giác song song (Side-by-Side Visual Comparison)

Ảnh đối chiếu trực tiếp được lưu tại `qa/discovery-assistant/side_by_side_comparison.png` (kích thước 2880x1024, nửa trái là bản thiết kế Figma gốc, nửa phải là bản dựng thực tế):

1. **Các điểm tương đồng chuẩn xác (Matched Elements):**
   - **Thanh bên Rust Sidebar:** Chiều rộng 232px, màu nền nâu rỉ sét `#702914`, logo `măm măm.` kiểu chữ serif, nút bấm `+ Chuyến đi mới`, các mục menu pill bo tròn, thẻ quảng cáo vàng `Ăn như người bản địa` và khối thông tin người dùng ở góc dưới.
   - **Canvas Vàng Ấm:** Nền vàng rực `#F9C53D` bao bọc toàn bộ bố cục, thanh topbar với breadcrumb và các chip định vị / ngôn ngữ.
   - **Thẻ Chat Trái:** Chiều rộng 668px, góc bo tròn 24px, màu nền ngà `#FFFEFA`, badge `✦ MĂM MĂM AI`, tiêu đề anh hùng lớn "Hôm nay, mình ăn cả Hà Nội nhé?", các chip gợi ý phong cách, dòng phân cách mỏng và ô nhập tin nhắn kèm nút gửi màu gạch terracotta `#C44A24`.
   - **Cột Chuyến Đi Phải:** Thẻ tiêu đề terracotta "Đi một vòng, ngon một tối." kèm nhãn "HANOI AFTER HOURS", khối 3 chỉ số (điểm dừng, thời lượng, ngân sách), các thẻ điểm dừng kèm huy hiệu số tròn màu đào (`01`, `02`, `03`) và thẻ kêu gọi hành động tối màu ở dưới cùng.

2. **Các điểm khác biệt có chủ đích theo yêu cầu Discovery-First (Genuine Functional Deviations):**
   - **Bản vẽ Figma Frame 1:145 là mockup đồ hoạ tĩnh:** Bản vẽ chứa dữ liệu giả lập cố định (đoạn text trích dẫn, ảnh minh hoạ tĩnh, các nhãn số liệu cứng `3 điểm · 1.5h · 450k`).
   - **Giao diện thực tế Discovery-First là hệ thống ứng dụng tương tác động:**
     - **Thanh tiêu đề & Phiên làm việc:** Topbar hiển thị trạng thái phiên xác thực (`sessionId`, `sessionToken`) và ngôn ngữ hoạt động; vô hiệu hoá toàn bộ tương tác cho đến khi phiên hợp lệ được nạp thành công từ máy chủ.
     - **Cột Trò chuyện (Chat Card):** Thay vì text tĩnh, giao diện kết xuất các thẻ quán ăn đề xuất thực tế (A, B, C...) với huy hiệu chữ cái, giá trần quán minh bạch, nguồn dữ liệu xác thực, kèm các nút thao tác chức năng: "Thêm vào chuyến đi", "So sánh", "Chi tiết".
     - **Ma trận so sánh & Modal chi tiết:** Hỗ trợ mở bảng so sánh đa tiêu chí 2–5 quán và modal thông tin chi tiết chuẩn WAI-ARIA với Focus Trap và phím Escape.
     - **Cột Chuyến Đi (Tour Column):**
       - Khi chưa tạo lịch trình: hiển thị danh sách quán đang chọn (`SelectionList`), hỗ trợ thao tác khoá/mở khoá (`🔒`/`🔓`), xoá quán, và nút kích hoạt lập tour.
       - Cổng xác nhận tường minh: khi tạo lịch trình, giao diện hiển thị thẻ `ConfirmationCard` tóm tắt ràng buộc thời gian, ngân sách, cảnh báo dị ứng/chế độ ăn; bắt buộc người dùng bấm "Xác nhận lịch trình" mới chuyển sang tour chính thức.
       - Khi đã có tour: hiển thị lộ trình thời gian thực `GuidedTimeline` hoặc chuyển đổi sang bản đồ vector tự lưu trữ `PilotMap` (PMTiles).
       - Luồng đổi/điều chỉnh điểm dừng sau khi đã có tour (`onReplaceStop` / `onChangeStop`): mở lại trình biên tập danh sách quán kèm banner thông báo quán mục tiêu cần thay thế, cho phép người dùng thêm/bớt quán mà không tự ý nới lỏng ràng buộc, và bắt buộc qua cổng xác nhận tường minh mới áp dụng tour mới.
     - **Số liệu tổng hợp chuyến đi (Truthful Metrics):** Không sử dụng các giá trị phỏng đoán như `duration_min` hay `estimated_cost_vnd`. Tuân thủ nghiêm ngặt schema `TourView.totals`: thời lượng suy xuất từ giờ đến/đi thực tế của các chặng hoặc số phút yêu cầu; giá tiền hiển thị tổng khoảng giá trần của các quán (`venue_range_upper_sum_vnd`) và dán nhãn minh bạch là "khoảng giá quán", tuyệt đối không mạo nhận là chi phí bữa ăn cá nhân hay bình quân mỗi người.

---

## 4. Danh sách tệp scoped đã cập nhật

- `frontend/lib/discoveryApi.js`: Bổ sung timeout bao trùm cả quá trình đọc body (`res.json()`, `res.text()`), định dạng lỗi 422 chi tiết, ném `DiscoveryApiError('timeout')`.
- `frontend/app/components/v2/guided/DiscoveryLayout.jsx`: Xây dựng lại hoàn chỉnh khung vỏ Warm editorial (Sidebar 232px, Canvas vàng `#F9C53D`, Card chat 668px), hợp đồng hồ sơ nullable, chốt chặn phiên làm việc nghiêm ngặt (chỉ cho phép nhập liệu khi có token và GET khởi tạo thành công), xử lý reset phiên lập tức, số liệu tour trung thực, và luồng thay thế điểm dừng sau tour.
- `frontend/app/components/v2/guided/discovery-visual.css`: Thêm các luật responsive ẩn thanh tab mobile trên desktop, kiểu dáng cho banner chỉnh sửa điểm dừng sau tour (`.nn-edit-selection-banner`, `.nn-replace-target-tag`).
- `frontend/app/components/v2/guided/GuidedTimeline.jsx`: Dán nhãn trung thực cho nút điều chỉnh điểm dừng (`✏️ Điều chỉnh điểm dừng`) thay vì nhãn sai lệch.
- `frontend/app/page.js`: Định tuyến dynamic import và truyền tham số session chuẩn xác.
- `frontend/lib/api.js`: Loại bỏ toàn bộ nhánh tra cứu `body.web_search` cũ; từ chối mọi yêu cầu có `web_search !== undefined && web_search !== false` bằng mã HTTP 422 `validation_error`.
- `frontend/app/components/v2/guided/GuidedLayout.jsx`: Gỡ bỏ hoàn toàn hộp kiểm/UI opt-in tra web Tavily (`.nn-web-optin-container`), tham số `webSearch` trong lượt gửi, và khối hiển thị kết quả `OnlineSearchResults`.
- `frontend/app/components/v2/guided/OnlineSearchResults.jsx`: Đã xoá (`git rm`) tệp component kết quả tra web ngoài đã ngừng sử dụng.
- `frontend/app/components/v2/guided/online-assistant.css`: Đã xoá (`git rm`) tệp kiểu CSS tra web ngoài đã ngừng sử dụng.
- `qa/discovery-assistant/run_discovery_qa.mjs`: Bộ test cô lập 26 kịch bản kiểm thử kèm bộ tạo ảnh so sánh song song, dọn dẹp tiến trình con và chuẩn hoá fixture theo schema `TourView.totals`.
- `qa/discovery-assistant/targeted_fixes_smoke.mjs`: Bộ test mục tiêu độc lập kiểm chứng 5 lỗi phát hiện trong phiên đánh giá, thực thi nhanh 1.4s và thoát tiến trình sạch (clean exit 0).
- `qa/discovery-assistant/evidence.json`: Bằng chứng kết quả đo lường và trạng thái kiểm thử (26 UI tests + 20 targeted smoke checks PASS).
- `docs/reports/DISCOVERY_ASSISTANT_UI_QA.md`: Báo cáo kiểm định hoàn thiện.

---

## 5. Dọn dẹp dứt điểm Tavily / Tra cứu Web ngoài (Retired Tavily Cleanup)

Thực hiện theo chỉ đạo bổ sung của Điều phối viên Codex (`msg_1788c6810c8e`):
1. **Frontend API Contract (`frontend/lib/api.js`):**
   - Đã gỡ bỏ toàn bộ logic giả lập trả kết quả tra web (`web_search`), không còn gắn khối `type: 'web_search'` vào phản hồi `chatTurn`.
   - Bổ sung chốt chặn xác thực tại đầu hàm `chatTurn`: nếu yêu cầu chứa `body.web_search !== undefined && body.web_search !== false`, ném ngay lỗi `ApiError('validation_error', 'Tính năng tra web (web_search) đã ngừng hỗ trợ và bị loại bỏ.', null, 422)`.
   - Gỡ bỏ hoàn toàn tham số `reqBody.web_search` trong bộ dựng dữ liệu gửi lên máy chủ thật.
2. **Giao diện Guided Tour (`GuidedLayout.jsx`):**
   - Gỡ bỏ import `OnlineSearchResults` và `online-assistant.css`.
   - Gỡ bỏ state `webSearch`, tham số `webSearch` trong `executeTurn` và `handleSendMessage`.
   - Gỡ bỏ khối giao diện hộp kiểm opt-in tra web Tavily (`.nn-web-optin-container`) ở chân thẻ trò chuyện.
   - Gỡ bỏ component render `OnlineSearchResults` trong luồng tin nhắn.
3. **Xoá tệp mồ côi:**
   - Đã loại bỏ hoàn toàn `frontend/app/components/v2/guided/OnlineSearchResults.jsx` và `frontend/app/components/v2/guided/online-assistant.css` khỏi cây mã nguồn bằng `git rm`.
4. **Kiểm tra biên dịch & hồi quy:**
   - Chạy `npm run build` trên thư mục `frontend/`: biên dịch thành công 100% trong 1.7 giây, không còn bất kỳ tham chiếu nào đến các tệp đã xoá.

---

## 6. Khắc phục triệt để 5 khiếm khuyết từ phiên đánh giá (Review Defect Fixes & Targeted Smoke Verification)

Thực hiện theo điều phối tại `task_cbddafbb1462` / `ctx_f0fa5d06505b`:

1. **Khuyết điểm 1 — Chốt chặn phiên làm việc nghiêm ngặt (Strict Session Gating & Invalidation):**
   - *Vấn đề:* Giao diện trước đây cho phép nhập liệu khi chưa xác thực hoặc khi phản hồi GET ban đầu bị lỗi (401/404/500), và không dọn dẹp sạch trạng thái nháp khi đổi phiên.
   - *Khắc phục:*
     - Bổ sung cờ `initialLoaded` kết hợp với `sessionId`, `sessionToken`, `!parentInitializing`, `!sessionError` để tạo biến `sessionReady`. Toàn bộ ô nhập chat, nút gửi, các gợi ý, thao tác thêm/khoá quán, nút lập tour đều bị `disabled` khi `!sessionReady`.
     - Lỗi ban đầu (401, 404, 500, lỗi mạng) giữ `initialLoaded = false` và hiển thị banner lỗi tương ứng.
     - Khi đổi phiên (`sessionId`/`sessionToken` thay đổi): huỷ ngay lập tức token yêu cầu `requestTokenRef`, abort controller đang chạy, đưa `view` về mặc định, xoá bản nháp ô chat (`inputText = ''`), đóng tất cả modal và drawer, xoá trạng thái chỉnh sửa tour dở dang.

2. **Khuyết điểm 2 — Giới hạn thời gian đọc body trong `fetchWithTimeout`:**
   - *Vấn đề:* Hàm `fetchWithTimeout` trước đây xoá timer ngay sau khi nhận được headers từ `fetch()`, dẫn tới nếu kết nối bị nghẽn trong lúc gọi `res.json()` thì yêu cầu sẽ bị treo vĩnh viễn.
   - *Khắc phục:* Bọc lại các phương thức `res.json()` và `res.text()` trong `frontend/lib/discoveryApi.js` để việc đọc body cũng nằm trong giới hạn thời gian của timeout controller. Nếu quá thời gian trong lúc phân tích JSON, hàm sẽ huỷ luồng đọc và ném ra lỗi chuẩn hoá `DiscoveryApiError('timeout')`.

3. **Khuyết điểm 3 — Số liệu tổng hợp chuyến đi trung thực (`TourView.totals` Schema Truthfulness):**
   - *Vấn đề:* Schema backend `TourView.totals` chỉ chứa `venue_range_upper_sum_vnd`, `walk_minutes`, `leg_source`, `route_provider`; không chứa `duration_min` hay `estimated_cost_vnd`. Việc hiển thị chi phí bữa ăn/người hoặc thời lượng giả định là không trung thực.
   - *Khắc phục:*
     - Hàm `deriveTourDuration`: ưu tiên tính toán từ giờ đến/đi thực tế của các chặng trong timeline (ví dụ: `1.5h lịch trình`), nếu chưa có thì lấy từ yêu cầu hồ sơ (`90p yêu cầu`), hoặc giữ nguyên ký tự khuyết `— thời lượng`.
     - Hàm `deriveTourPriceInfo`: sử dụng `venue_range_upper_sum_vnd` và dán nhãn minh bạch là "khoảng giá quán" (tổng khoảng giá trần của các quán), tuyệt đối không mạo nhận là chi phí bữa ăn hay chi phí bình quân mỗi người. Nếu không có số liệu, hiển thị ngân sách mong muốn trong hồ sơ hoặc `— khoảng giá`.
     - Cập nhật fixture kiểm thử trong `qa/discovery-assistant/run_discovery_qa.mjs` tuân thủ đúng schema này.

4. **Khuyết điểm 4 — Luồng thay thế / điều chỉnh điểm dừng thực tế sau khi có tour:**
   - *Vấn đề:* Nút đổi điểm dừng trước đây chỉ gọi lại hành động xác nhận lại danh sách cũ mà không mở luồng chỉnh sửa thực sự.
   - *Khắc phục:*
     - Khi người dùng bấm "Đổi quán" trên timeline hoặc "Điều chỉnh điểm dừng", hệ thống kích hoạt chế độ `editingSelectionAfterTour` và hiển thị banner thông báo quán mục tiêu cần thay (`Quán cần đổi`).
     - Người dùng có thể tự do gỡ quán cũ, thêm quán mới từ kết quả khám phá, hoặc thay đổi trạng thái khoá/mở khoá thông qua các công cụ hợp lệ (`update_foodtour_selection`).
     - Không tự động nới lỏng ràng buộc hay mở khoá ngoài ý muốn. Sau khi chọn xong, người dùng bấm "Lập lại lịch trình" (`create_itinerary`), xem lại thẻ xác nhận `ConfirmationCard` và bấm "Xác nhận lịch trình" tường minh. Chỉ khi máy chủ trả về tour mới thành công thì timeline mới được cập nhật.

5. **Khuyết điểm 5 — Bộ kiểm thử mục tiêu độc lập & Giải phóng tiến trình sạch (`targeted_fixes_smoke.mjs`):**
   - *Khắc phục:* Tạo tệp kiểm thử `qa/discovery-assistant/targeted_fixes_smoke.mjs` kiểm tra cô lập cả 5 nội dung trên:
     1. Bắt timeout khi luồng đọc stream body bị treo (timeout chính xác sau ~410ms, ném `DiscoveryApiError('timeout')`).
     2. Kiểm tra toàn bộ ma trận trạng thái chốt chặn phiên làm việc (7/7 trường hợp đạt).
     3. Kiểm tra tính trung thực của các hàm tính toán chỉ số theo schema `TourView.totals` (5/5 trường hợp đạt).
     4. Kiểm tra luồng hành động thay thế điểm dừng và cổng xác nhận (6/6 trường hợp đạt).
     5. Kiểm tra giải phóng tài nguyên và thoát tiến trình tự động (`process.exit(0)`).
   - *Kết quả thực thi:* **20/20 PASS**, thời gian chạy 1.4s, 0 listener bị treo, thoát sạch với mã exit 0. Đã cập nhật kết quả vào `qa/discovery-assistant/evidence.json`.

