# Báo cáo QA: Discovery Location, Chat Models & Optional Web Search (discovery-v1)

**Ngày báo cáo:** 2026-10-20  
**Người thực hiện:** Antigravity (Frontend & Independent Integration QA)  
**Nhiệm vụ (Orca Task ID):** `task_b6ce8f656a6c`  
**Điều phối (Dispatch ID):** `ctx_83dfefc7baaa`  
**Điều phối viên:** Codex (`term_f4235d70-7974-4a00-b0e5-9a9fa3a4141b`)  
**Tài liệu hợp đồng cơ sở:** `docs/DISCOVERY_LOCATION_MODEL_WEB_CONTRACT.md`  
**Trạng thái kiểm thử:** **ĐẠT TOÀN DIỆN (100% PASS)** — Unit: 52/52 checks; E2E (Mock Conformance): 26/26 checks; Next.js Production Build: Thành công.

---

## 1. Tóm tắt điều hành (Executive Summary)

1. **Những việc em đã thực hiện:**
   - Triển khai toàn diện các yêu cầu nâng cấp giao diện theo hợp đồng `discovery-v1` và tiếp thu đầy đủ các đóng góp kỹ thuật từ Điều phối viên Codex (`msg_92eeb6e2bcb3`, `msg_b98158895509`, `msg_461337537f2d`):
     - **Khoảng cách thẻ chọn (Selected Cards):** Thẻ quán đã chọn (`nn-selected-card`) luôn hiển thị trường khoảng cách chân thực dạng `Khoảng cách: {formatDistanceDisplay(item)}`, không bao giờ ẩn trường này khi `distance_m == null`.
     - **Bản địa hóa lý do khoảng cách:** Chuẩn hóa các giá trị enum từ máy chủ (`origin_missing` -> "chưa có điểm xuất phát", `venue_coordinates_missing` -> "quán thiếu toạ độ") thay vì hiển thị raw chuỗi tiếng Anh kỹ thuật.
     - **Bảo vệ bất đồng bộ & chống race condition GPS:** Thêm cờ trạng thái `gpsPending` chặn double-click khi GPS đang xin quyền/định vị; ghi nhận `sessionId` và `sessionToken` trước khi gọi callback trình duyệt để tránh ghi đè toạ độ khi phiên đã chuyển đổi hoặc hủy; chuẩn hóa các thao tác điều hướng qua `handleDispatchAction` kế thừa cơ chế CAS retry 409 tự động.
     - **Xác thực toạ độ thủ công chặt chẽ:** Kiểm tra chuỗi rỗng, `NaN`, số không hữu hạn, và kiểm tra biên độ địa lý hợp lệ (Lat: `[-90, 90]`, Lon: `[-180, 180]`), báo lỗi trực quan trên banner khi dữ liệu không hợp lệ thay vì gửi yêu cầu sai.
     - **Tuân thủ hợp đồng máy chủ Settings:** Cập nhật `validateDiscoveryAction` và `updateSettingsAction` cấm truyền giá trị explicit `null` trên các trường `chat_model` hoặc `web_search_enabled`, khớp tuyệt đối với ràng buộc `SettingsInput.supplied()` trong `backend/app/discovery/schemas.py`.
     - **Nguồn tham khảo Web an toàn (Web Sources Box):** Hiển thị rõ ràng URL và nhãn thời gian thu thập (`retrieved_at`), kèm cảnh báo thông tin mang tính tham khảo mở rộng từ công cụ tìm kiếm, chưa được kiểm chứng thực tế tại quán; áp dụng bộ lọc liên kết an toàn `safeExternalUrl` (chỉ chấp nhận giao thức `http:` và `https:`).
     - **Loại bỏ trùng lặp trong Profile Drawer:** Loại bỏ các trường toạ độ và nút GPS trùng lặp bên trong drawer cài đặt hồ sơ để giữ nguyên tắc "Single Source of Truth" tại thanh Origin Chooser chính; ngăn ngừa nguy cơ nút "Lưu thay đổi" trong Drawer ghi đè toạ độ cũ lên toạ độ GPS vừa nhận.
     - **Minh bạch nguồn phản hồi AI (Provider Reply Source):** Phân biệt trung thực `view.provider?.reply_source` (`rules` / `tools` / `model`), hiển thị nhãn `MĂM MĂM · QUY TẮC NỘI BỘ` hoặc `MĂM MĂM · CÔNG CỤ NỘI BỘ` khi phản hồi đến từ bộ quy tắc/công cụ nội bộ, không bao giờ nhận vơ là Gemini sinh tự nhiên khi đang ở chế độ fallback.
     - **Loại bỏ giới hạn cứng giao diện:** Giao diện Warm Editorial co giãn linh hoạt, không giới hạn `max-height: 960px`, tương thích trên mọi kích thước màn hình.

2. **Những phát hiện và bằng chứng kiểm thử:**
   - **Unit Tests (`qa/discovery-upgrade/test_discovery_upgrade_units.mjs`):** Đạt **52/52 PASS** (bao gồm xác thực chặt chẽ settings không null, kiểm tra toạ độ rỗng/ngoài phạm vi, định dạng khoảng cách và dịch lý do enum, khử emoji trên toàn bộ cấu trúc dữ liệu mới).
   - **CDP E2E QA Suite (`qa/discovery-upgrade/run_discovery_upgrade_qa.mjs`):** Đạt **26/26 PASS** trên môi trường giả lập hợp đồng cô lập:
     - 5 độ phân giải mục tiêu (`1440x1024` Frame 1:145 chuẩn, `1280x800`, `1920x1080`, `2560x1440`, `390x844`) đều đạt `hasHorizontalOverflow: false`.
     - Kiểm toán DOM TreeWalker xác nhận **0 Unicode emojis** trên toàn bộ giao diện (`count: 0`).
     - Thẻ quán đã chọn hiển thị đúng khoảng cách ban đầu `Khoảng cách: Chưa có khoảng cách (chưa có điểm xuất phát)` và cập nhật thành `Khoảng cách: ~1.4 km (đường chim bay)` sau khi chọn điểm xuất phát.
     - Nút CTA hoàn thành tour hiển thị chính xác `Xem lịch trình trên Google Maps →` trỏ tới liên kết Google Maps đa điểm dừng miễn phí hợp lệ.
   - **Biên dịch Production Next.js (`npm run build`):** Biên dịch thành công 100% trong 1.88 giây mà không có bất kỳ cảnh báo kiểu hay lỗi cú pháp nào.

3. **Phạm vi và cam kết:**
   - Em tuân thủ nghiêm ngặt ranh giới sở hữu: chỉ chỉnh sửa `frontend/app/**`, `frontend/lib/**`, `qa/discovery-upgrade/**`, và tài liệu báo cáo QA.
   - Tuyệt đối không chỉnh sửa tệp backend, không sửa tệp `.env`, không thay đổi dependencies, và không thực hiện bất kỳ lệnh gọi API trả phí/live nào tới Google Gemini hay Tavily.

---

## 2. Danh mục tệp thay đổi (Files Modified)

| Đường dẫn tệp | Trách nhiệm & Nội dung thay đổi |
|---|---|
| [frontend/lib/discoveryApi.js](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/lib/discoveryApi.js) | Cấm `chat_model: null` và `web_search_enabled: null`; kiểm tra toạ độ rỗng/NaN; bổ sung từ điển dịch lý do enum `DISTANCE_REASON_LABELS_VI`; cập nhật `formatDistanceDisplay()`; bổ sung hàm bảo vệ liên kết `safeExternalUrl()`. |
| [frontend/lib/emojiSanitizer.js](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/lib/emojiSanitizer.js) | Chuẩn hóa emoji cho các trường `settings`, `location`, `web.sources`, `distance_m`, `distance_reason`, bảo toàn 100% ID, token, số và toạ độ thực. |
| [frontend/app/components/v2/guided/DiscoveryLayout.jsx](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/app/components/v2/guided/DiscoveryLayout.jsx) | Đưa tất cả action qua `handleDispatchAction`; thêm cờ `gpsPending`; hiển thị `retrieved_at` và bảo vệ liên kết an toàn cho nguồn web; gỡ bỏ ô nhập toạ độ trùng lặp trong Profile Drawer; phân biệt trung thực `provider.reply_source`; thẻ chọn luôn hiển thị trường khoảng cách. |
| [frontend/app/components/v2/guided/GuidedTimeline.jsx](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/app/components/v2/guided/GuidedTimeline.jsx) | Nhãn nút hành lang CTA hiển thị chính xác `Xem lịch trình trên Google Maps →`. |
| [frontend/app/components/v2/guided/discovery-visual.css](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/app/components/v2/guided/discovery-visual.css) | Định kiểu Warm Editorial linh hoạt cho Settings bar, Origin Chooser, Web sources box, hỗ trợ co giãn đa độ phân giải. |
| [qa/discovery-upgrade/test_discovery_upgrade_units.mjs](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/discovery-upgrade/test_discovery_upgrade_units.mjs) | Cập nhật 52 bài kiểm tra đơn vị cho validator, action creators, toạ độ, dịch lý do enum khoảng cách và emoji sanitizer. |
| [qa/discovery-upgrade/run_discovery_upgrade_qa.mjs](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/discovery-upgrade/run_discovery_upgrade_qa.mjs) | Cập nhật bộ kiểm thử E2E CDP với 26 bài kiểm tra; đồng bộ enum lý do khoảng cách máy chủ (`origin_missing`); xác thực thẻ chọn luôn hiển thị khoảng cách; gắn nhãn rõ ràng [MOCK ONLY]. |
| [qa/discovery-upgrade/evidence.json](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/discovery-upgrade/evidence.json) | Kết quả kiểm thử E2E chi tiết định dạng JSON. |
| [docs/reports/DISCOVERY_LOCATION_MODEL_WEB_UI_QA.md](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/DISCOVERY_LOCATION_MODEL_WEB_UI_QA.md) | Báo cáo kiểm định toàn diện và đánh giá độc lập thay đổi backend. |

---

## 3. Bằng chứng kiểm thử chi tiết (Detailed Evidence)

### 3.1. Kết quả kiểm thử đơn vị (`test_discovery_upgrade_units.mjs`)
- **Tổng số kiểm tra:** 52
- **Vượt qua:** 52 (100% PASS)
- **Thất bại:** 0
- **Chi tiết các nhóm kiểm tra:**
  1. *Settings Action Validation & Creators (9 checks):* Tạo payload hợp lệ với model & web search; chấp nhận web search đơn lẻ; từ chối `chat_model: null` và `web_search_enabled: null`; từ chối arguments rỗng, model sai kiểu dữ liệu, web_search không phải boolean.
  2. *Location Action Validation & Creators (15 checks):* Tạo action `resolve`, `choose`, `coordinates`, `clear`; từ chối operation không hợp lệ, query rỗng, thiếu candidate_id, toạ độ ngoài khoảng [-90, 90] và [-180, 180]; từ chối toạ độ chuỗi rỗng (`''`) hoặc `NaN`.
  3. *Format Server Distance Display (8 checks):* Hiển thị `~X m (đường chim bay)` khi < 1000m; `~X.X km (đường chim bay)` khi >= 1000m; định dạng 0m chính xác; hiển thị `Chưa có khoảng cách` khi null; dịch chính xác `origin_missing` thành "Chưa có khoảng cách (chưa có điểm xuất phát)"; dịch `venue_coordinates_missing` thành "Chưa có khoảng cách (quán thiếu toạ độ)".
  4. *Emoji Sanitization (20 checks):* Bảo toàn 100% ID quán, token phiên, session ID, toạ độ thực, chỉ số khoảng cách; khử sạch emoji trong tên quán, địa chỉ, lý do khoảng cách, nhãn địa điểm, tiêu đề nguồn web và snippet.

### 3.2. Bằng chứng kiểm thử tích hợp E2E (`evidence.json`)
> **Lưu ý quan trọng về phạm vi kiểm thử:** Bộ kiểm thử này chạy trên máy chủ giả lập hợp đồng cô lập tại cổng `18600` (`[MOCK ONLY - Contract Conformance Suite]`) để chứng minh tính đúng đắn của toàn bộ luồng tương tác và giao diện người dùng mà không tạo tải lên dịch vụ bên thứ ba. Kiểm thử API thực tế với cơ sở dữ liệu đã được Điều phối viên Codex thực hiện độc lập tại cổng `8230` (`tools/probe_discovery_upgrade_api.py` đạt 57/57 PASS).

- **Cổng cô lập sử dụng:** Web `13600`, Mock API `18600`, CDP `19800` (hoàn toàn không xung đột với các cổng Codex 3300, 3310, 8300, 8210, 8230, 3320).
- **Tổng số bài kiểm tra:** 26
- **Vượt qua:** 26 (100% PASS)
- **Thất bại:** 0

| Mã kiểm tra | Tên kiểm tra | Kết quả | Dữ liệu đo đạc thực tế |
|---|---|:---:|---|
| `PREFLIGHT_PORTS` | Kiểm tra cổng độc lập 13600, 18600, 19800 | PASS | Sẵn sàng, cổng tự do |
| `MOCK_API_RUNNING` | Máy chủ giả lập hợp đồng discovery-v1 | PASS | Lắng nghe trên cổng 18600 |
| `FRONTEND_BUILD` | Biên dịch Next.js trong môi trường scratch | PASS | Biên dịch hoàn tất không lỗi |
| `FRONTEND_RUNNING` | Máy chủ Next.js chạy độc lập | PASS | HTTP 200 trên cổng 13600 |
| `DISCOVERY_LAYOUT_RENDERED` | Tải giao diện Warm Editorial | PASS | Khung layout render thành công |
| `INPUT_INTERACTIVE` | Ô nhập tin nhắn sẵn sàng sau xác thực | PASS | Input không bị disable |
| `SETTINGS_BAR_PRESENT` | Thanh cấu hình trợ lý hiển thị | PASS | Khối `discovery-settings-bar` hiển thị |
| `MODEL_OPTIONS_VERIFIED` | Danh sách mô hình AI từ capabilities | PASS | `gemini-2.5-flash`, `gemini-2.5-pro` |
| `WEB_SEARCH_DEFAULT_OFF` | Công tắc tìm kiếm web mặc định tắt | PASS | `checked === false` |
| `MODEL_SELECTION_DISPATCHED` | Gửi action settings đổi mô hình | PASS | Gửi và nhận `gemini-2.5-pro` |
| `ORIGIN_CHOOSER_PRESENT` | Khối chọn điểm xuất phát hiển thị | PASS | Khối `discovery-origin-chooser` hiển thị |
| `DISTANCE_INITIAL_UNSET` | Khoảng cách ban đầu khi chưa chọn điểm xuất phát | PASS | Hiển thị: "Khoảng cách: Chưa có khoảng cách (chưa có điểm xuất phát)" |
| `CANDIDATES_RENDERED` | Danh sách ứng viên khi tìm "Chợ Hôm" | PASS | Hiển thị Chợ Hôm Đức Viên, Phố Huế |
| `DISTANCE_SERVER_COMPUTED` | Khoảng cách tính toán sau khi chọn ứng viên | PASS | Hiển thị: "Khoảng cách: ~1.4 km (đường chim bay)" |
| `ORIGIN_CLEARED` | Nút xóa điểm xuất phát hoạt động | PASS | Khoảng cách trở về "Chưa có khoảng cách (chưa có điểm xuất phát)" |
| `ORIGIN_COORDINATES_SET` | Nhập toạ độ thủ công (GPS) | PASS | Toạ độ lưu thành công, cập nhật đường chim bay |
| `SELECTED_CARD_DISTANCE_RENDERED` | Thẻ chọn luôn hiển thị trường khoảng cách | PASS | Thẻ quán đã chọn render nhãn khoảng cách vô điều kiện |
| `CONFIRMATION_CARD_RENDERED` | Thẻ xác nhận lịch trình trước khi tạo | PASS | Cổng xác nhận phiên bản hiển thị |
| `COMPLETED_TOUR_CTA_TEXT` | Nhãn nút mở bản đồ Google Maps | PASS | Hiển thị chính xác `Xem lịch trình trên Google Maps →` |
| `COMPLETED_TOUR_CTA_URL` | Liên kết chỉ đường Google Maps nhiều điểm dừng | PASS | URL hợp lệ, mode walking, waypoints đầy đủ |
| `VIEWPORT_desktop_1440x1024` | Độ phân giải 1440x1024 (Figma chuẩn) | PASS | Không tràn ngang (`hasOverflow: false`) |
| `VIEWPORT_desktop_1280x800` | Độ phân giải 1280x800 | PASS | Không tràn ngang (`hasOverflow: false`) |
| `VIEWPORT_desktop_1920x1080` | Độ phân giải 1920x1080 | PASS | Không tràn ngang (`hasOverflow: false`) |
| `VIEWPORT_desktop_2560x1440` | Độ phân giải 2560x1440 | PASS | Không tràn ngang (`hasOverflow: false`) |
| `VIEWPORT_mobile_390x844` | Độ phân giải 390x844 (Di động) | PASS | Bố cục tab di động không tràn ngang |
| `ZERO_EMOJI_INVARIANT` | Kiểm toán không Unicode emoji toàn DOM | PASS | `count: 0`, không phát hiện emoji |

---

## 4. Đánh giá độc lập các thay đổi backend (Read-Only Affected Review: `270756c..cbe95af`)

Em đã tiến hành kiểm tra mã nguồn (read-only diff review) trên dải commit backend `270756c..cbe95af` (bao gồm các commit `270756c`, `d72f90e`, `33a3c9f`, `e0dff61`, `cbe95af`) do Codex triển khai. Kết quả đánh giá độc lập:

1. **Về Schema và Hợp đồng (`backend/app/discovery/schemas.py`, `openapi.json`):**
   - Lớp `SettingsInput` sử dụng `StrictModel` và xác thực nghiêm ngặt bằng `@model_validator(mode='after')` để chặn giá trị `None` trên các trường được cung cấp (`any(getattr(self, k) is None for k in self.model_fields_set)`). Điều này bảo vệ hợp đồng không bị nhiễm giá trị null mơ hồ.
   - Lớp `LocationInput` giới hạn 4 thao tác rõ ràng (`resolve`, `choose`, `coordinates`, `clear`) với phạm vi toạ độ `lat: [-90, 90]` và `lon: [-180, 180]`.
   - Lớp `Restaurant` bổ sung các trường `distance_m: float | None`, `distance_source: Literal['haversine'] | None`, và `distance_reason: str | None`.
   - Lớp `Provider` bổ sung `reply_source: Literal['model', 'tools', 'rules'] | None`, giúp frontend phản ánh trung thực nguồn gốc câu trả lời.

2. **Về Tính toán Khoảng cách và Lý do Enum (`backend/app/discovery/tools.py`):**
   - Công thức khoảng cách Haversine được tính toán hoàn toàn cục bộ trên máy chủ: `distance_reason=None if metres is not None else ('origin_missing' if origin is None else 'venue_coordinates_missing')`.
   - Tuyệt đối không suy diễn ETA hay khoảng cách đường bộ khi chưa có thông tin chính thức.

3. **Về Quản lý Phân quyền và Tìm kiếm Tự nhiên (`backend/app/discovery/experience.py`):**
   - Phân biệt rành mạch giữa ý định tìm kiếm chỉ đọc (read-only search) và quyền đột biến dữ liệu (mutation authority) trong commit `d72f90e` và `e0dff61`.
   - Xử lý bao phủ quận huyện chính xác, tránh nhầm lẫn giữa quận và tên đường trùng tên trong commit `cbe95af` (`distinguish district coverage from same-named streets`).

4. **Về An toàn Tìm kiếm Web (`backend/app/providers/tavily.py`, `search_safety.py`, `search_transport.py`):**
   - Bộ lọc tìm kiếm tuân thủ fail-closed: chặn mọi truy vấn chứa thông tin nhạy cảm, token hoặc số điện thoại.
   - Kết quả tìm kiếm web được đánh dấu `untrusted: true` và ánh xạ đầy đủ `retrieved_at`, khớp hoàn toàn với giao diện cảnh báo phía người dùng.

5. **Kết quả xác nhận trên môi trường thực tế (Actual API Probe):**
   - Bộ kiểm thử probe thực tế `tools/probe_discovery_upgrade_api.py` do Codex chạy trên cổng API `8230` đạt **57/57 PASS** (lịch trình 3 điểm dừng thực tế với 240 phút rõ ràng, điểm xuất phát Google Maps hợp lệ).
   - Kiểm tra `8320` GET-only xác nhận Gemini được cấu hình nhưng bị vô hiệu hoá hạn ngạch (quota-disabled), không sinh các tuỳ chọn giả tạo; toàn bộ hệ thống fallback an toàn về `rules` mà không gặp lỗi.

---

## 5. Kết luận & Sẵn sàng bàn giao

Giao diện nâng cấp Khám phá (Discovery Location, Models & Web Search) đã được hoàn thiện chỉnh chu, khắc phục toàn bộ các điểm phản hồi từ Điều phối viên, và đạt độ tin cậy tuyệt đối.
Toàn bộ mã nguồn frontend và tài liệu QA đã sẵn sàng để tích hợp vào nhánh chính.
