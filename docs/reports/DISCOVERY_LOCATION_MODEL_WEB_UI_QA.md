# Báo cáo QA: Discovery Location, Chat Models & Optional Web Search (discovery-v1)

**Ngày báo cáo:** 2026-10-20  
**Người thực hiện:** Antigravity (Frontend & Integration QA)  
**Nhiệm vụ (Orca Task ID):** `task_c31403b7fbd8`  
**Điều phối (Dispatch ID):** `ctx_32d10036ce1c`  
**Điều phối viên:** Codex (`term_f4235d70-7974-4a00-b0e5-9a9fa3a4141b`)  
**Tài liệu hợp đồng cơ sở:** `docs/DISCOVERY_LOCATION_MODEL_WEB_CONTRACT.md`  
**Trạng thái kiểm thử:** **ĐẠT TOÀN DIỆN (100% PASS)** — Unit: 46/46 checks; E2E: 25/25 checks; Production Build: Thành công.

---

## 1. Tóm tắt điều hành (Executive Summary)

1. **Những việc em đã thực hiện:**
   - Hợp nhất cơ sở `26ad4f2` sạch sẽ và triển khai đầy đủ các yêu cầu bổ sung theo hợp đồng `discovery-v1`:
     - Cập nhật `frontend/lib/discoveryApi.js`: Bổ sung hàm tải cấu hình `getAssistantCapabilities()`, xác thực chặt chẽ hành động `settings` (`chat_model`, `web_search_enabled`) và `location` (`resolve`, `choose`, `coordinates`, `clear`), các hàm tạo action payload và hàm định dạng khoảng cách `formatDistanceDisplay()`.
     - Cập nhật `frontend/lib/emojiSanitizer.js`: Chuẩn hóa emoji hiển thị cho `settings`, `location`, `web.sources`, `distance_m`, `distance_reason`, bảo toàn 100% các định danh gốc, toạ độ, token phiên, URL và số.
     - Cập nhật `frontend/app/components/v2/guided/DiscoveryLayout.jsx`: Tích hợp thanh cấu hình trợ lý (`data-testid="discovery-settings-bar"`) với bộ chọn mô hình Gemini và công tắc tìm web Tavily (mặc định tắt; Tavily không bao giờ là mô hình chat); tích hợp bộ chọn điểm xuất phát `Origin Chooser` (`data-testid="discovery-origin-chooser"`) hỗ trợ GPS qua click chuột, tìm kiếm địa danh nội bộ, chọn ứng viên, nhập toạ độ thủ công, và nút xóa điểm xuất phát; hiển thị khoảng cách máy chủ tính toán dạng "đường chim bay" hoặc "Chưa có khoảng cách"; hiển thị hộp tham khảo web (`data-testid="web-sources-box"`) với cảnh báo an toàn dị ứng/giờ mở cửa.
     - Cập nhật `frontend/app/components/v2/guided/GuidedTimeline.jsx`: Nút hành lang CTA hiển thị chính xác dòng chữ `Xem lịch trình trên Google Maps →` dẫn tới liên kết Google Maps đa chặng miễn phí đã xác thực.
     - Thêm quy tắc CSS phong cách Warm Editorial trong `discovery-visual.css` hỗ trợ bố cục co giãn linh hoạt trên mọi kích thước màn hình, loại bỏ giới hạn cứng `max-height: 960px`.

2. **Những phát hiện và bằng chứng kiểm thử:**
   - Bộ kiểm thử đơn vị (`qa/discovery-upgrade/test_discovery_upgrade_units.mjs`) vượt qua **46/46** kiểm tra.
   - Bộ kiểm thử tích hợp E2E tự động qua giao thức Chrome DevTools Protocol (CDP) (`qa/discovery-upgrade/run_discovery_upgrade_qa.mjs`) vượt qua **25/25** kiểm tra:
     - Xác thực thành công 5 độ phân giải mục tiêu: `1440x1024` (chuẩn Figma Frame 1:145), `1280x800`, `1920x1080`, `2560x1440`, và `390x844` (di động). Không xảy ra tràn thanh cuộn ngang (`hasHorizontalOverflow: false`).
     - Quét toàn bộ cây DOM (DOM TreeWalker) xác nhận **0 Unicode emojis** trên toàn bộ giao diện (`count: 0`).
     - Tương tác chọn mô hình gửi đúng action `settings`, chọn ứng viên "Chợ Hôm Đức Viên" cập nhật điểm xuất phát và kích hoạt tính toán khoảng cách đường chim bay (`~1.4 km (đường chim bay)`), xóa điểm xuất phát đưa khoảng cách về `Chưa có khoảng cách`.
     - Lộ trình hoàn thành sinh URL Google Maps nhiều điểm dừng hợp lệ: `https://www.google.com/maps/dir/?api=1&origin=21.0285%2C105.8542&destination=21.0337%2C105.8509&travelmode=walking&waypoints=21.0304%2C105.8496`.
     - Bản build Next.js (`npm run build`) hoàn thành sạch sẽ trong 1.5 giây.

3. **Phạm vi và phần việc còn lại:**
   - Toàn bộ công việc thuộc phạm vi frontend và QA độc lập đã hoàn tất đầy đủ.
   - Em không chỉnh sửa bất kỳ tệp backend nào, không sửa đổi `.env`, không thay đổi gói phụ thuộc và không thực hiện bất kỳ lệnh gọi live nào tới Gemini/Tavily. Sẵn sàng bàn giao cho Codex nghiệm thu và tích hợp.

---

## 2. Danh mục tệp thay đổi (Files Modified)

| Đường dẫn tệp | Trách nhiệm & Thay đổi |
|---|---|
| [frontend/lib/discoveryApi.js](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/lib/discoveryApi.js) | Bổ sung `getAssistantCapabilities()`, xác thực action `settings` & `location`, bổ sung action creators, hàm `formatDistanceDisplay()`. |
| [frontend/lib/emojiSanitizer.js](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/lib/emojiSanitizer.js) | Mở rộng chuẩn hóa cho `settings`, `location`, `web.sources`, `distance_m`, `distance_reason`, giữ nguyên định danh và số. |
| [frontend/app/components/v2/guided/GuidedTimeline.jsx](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/app/components/v2/guided/GuidedTimeline.jsx) | Cập nhật nhãn CTA thành `Xem lịch trình trên Google Maps →`. |
| [frontend/app/components/v2/guided/DiscoveryLayout.jsx](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/app/components/v2/guided/DiscoveryLayout.jsx) | Thêm thanh cấu hình mô hình & tìm web, bộ chọn điểm xuất phát Origin Chooser, hiển thị khoảng cách máy chủ, hiển thị nguồn web. |
| [frontend/app/components/v2/guided/discovery-visual.css](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/frontend/app/components/v2/guided/discovery-visual.css) | Định kiểu Warm Editorial cho Settings bar, Origin Chooser, Web sources reference box. |
| [qa/discovery-upgrade/test_discovery_upgrade_units.mjs](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/discovery-upgrade/test_discovery_upgrade_units.mjs) | Bộ kiểm thử đơn vị cho validator, action creators, distance format, emoji sanitizer (46 checks). |
| [qa/discovery-upgrade/run_discovery_upgrade_qa.mjs](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/discovery-upgrade/run_discovery_upgrade_qa.mjs) | Bộ kiểm thử tích hợp tự động qua CDP headless (25 checks). |
| [qa/discovery-upgrade/evidence.json](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/discovery-upgrade/evidence.json) | Bằng chứng kết quả chạy kiểm thử JSON. |
| [qa/discovery-upgrade/screenshots/](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/qa/discovery-upgrade/screenshots/) | Ảnh chụp màn hình 5 độ phân giải: 1440x1024, 1280x800, 1920x1080, 2560x1440, 390x844. |

---

## 3. Bằng chứng kiểm thử chi tiết (Detailed Evidence)

### 3.1. Kết quả kiểm thử đơn vị (`test_discovery_upgrade_units.mjs`)
- **Tổng số:** 46
- **Vượt qua:** 46
- **Thất bại:** 0
- **Chi tiết:**
  - Nhóm 1: Xác thực action `settings` và helper `updateSettingsAction`: chấp nhận `chat_model` hợp lệ hoặc null, chấp nhận `web_search_enabled` dạng boolean; chặn rỗng hoặc sai kiểu dữ liệu.
  - Nhóm 2: Xác thực action `location` và các helpers: chấp nhận `resolve`, `choose`, `coordinates`, `clear`; từ chối các thao tác ngoài danh mục hoặc toạ độ ngoài phạm vi [-90, 90], [-180, 180].
  - Nhóm 3: Định dạng khoảng cách máy chủ: hiển thị `~X m (đường chim bay)` khi < 1000m, `~X.X km (đường chim bay)` khi >= 1000m; hiển thị `Chưa có khoảng cách` khi null, không suy diễn ETA hay khoảng cách đường bộ.
  - Nhóm 4: Khử emoji trên các trường mới: bảo toàn nguyên vẹn ID, token, toạ độ thực, chỉ lọc các ký tự emoji hiển thị.

### 3.2. Kết quả kiểm thử tích hợp E2E (`evidence.json`)
- **Cổng cô lập sử dụng:** Web `13600`, Mock API `18600`, CDP `19800` (không xung đột với các cổng Codex 3300, 3310, 8300, 8210).
- **Tổng số kiểm tra:** 25
- **Vượt qua:** 25 (100%)
- **Thất bại:** 0

| Mã kiểm tra | Tên kiểm tra | Kết quả | Dữ liệu đo đạc |
|---|---|:---:|---|
| `PREFLIGHT_PORTS` | Kiểm tra cổng độc lập 13600, 18600, 19800 | PASS | Sẵn sàng, không xung đột |
| `MOCK_API_RUNNING` | Máy chủ giả lập hợp đồng discovery-v1 | PASS | Đang lắng nghe trên cổng 18600 |
| `FRONTEND_BUILD` | Biên dịch Next.js trong môi trường scratch | PASS | Biên dịch hoàn tất không lỗi |
| `FRONTEND_RUNNING` | Máy chủ Next.js chạy độc lập | PASS | Phản hồi HTTP 200 trên cổng 13600 |
| `DISCOVERY_LAYOUT_RENDERED` | Tải giao diện Warm Editorial | PASS | Render container thành công |
| `INPUT_INTERACTIVE` | Ô nhập tin nhắn sẵn sàng sau xác thực | PASS | Input không bị disable |
| `SETTINGS_BAR_PRESENT` | Thanh cấu hình trợ lý hiển thị | PASS | Container hiển thị đúng vị trí |
| `MODEL_OPTIONS_VERIFIED` | Danh sách mô hình AI từ capabilities | PASS | `gemini-2.5-flash`, `gemini-2.5-pro` |
| `WEB_SEARCH_DEFAULT_OFF` | Công tắc tìm kiếm web mặc định tắt | PASS | `checked === false` |
| `MODEL_SELECTION_DISPATCHED` | Gửi action settings đổi mô hình | PASS | Máy chủ ghi nhận `gemini-2.5-pro` |
| `ORIGIN_CHOOSER_PRESENT` | Khối chọn điểm xuất phát hiển thị | PASS | Hiển thị đầy đủ các nút chức năng |
| `DISTANCE_INITIAL_UNSET` | Khoảng cách ban đầu khi chưa chọn điểm xuất phát | PASS | `Chưa có khoảng cách (Chưa chọn điểm xuất phát)` |
| `CANDIDATES_RENDERED` | Danh sách ứng viên khi tìm "Chợ Hôm" | PASS | Hiển thị Chợ Hôm Đức Viên, Phố Huế |
| `DISTANCE_SERVER_COMPUTED` | Khoảng cách tính toán sau khi chọn ứng viên | PASS | `Khoảng cách: ~1.4 km (đường chim bay)` |
| `ORIGIN_CLEARED` | Nút xóa điểm xuất phát hoạt động | PASS | Khoảng cách trở về `Chưa có khoảng cách` |
| `ORIGIN_COORDINATES_SET` | Nhập toạ độ thủ công (GPS) | PASS | Toạ độ lưu thành công, khoảng cách cập nhật |
| `CONFIRMATION_CARD_RENDERED` | Thẻ xác nhận lịch trình trước khi tạo | PASS | Cổng xác nhận phiên bản hiển thị |
| `COMPLETED_TOUR_CTA_TEXT` | Nhãn nút mở bản đồ Google Maps | PASS | `Xem lịch trình trên Google Maps →` |
| `COMPLETED_TOUR_CTA_URL` | Liên kết chỉ đường Google Maps nhiều điểm dừng | PASS | URL hợp lệ, chế độ walking, có waypoints |
| `VIEWPORT_desktop_1440x1024` | Độ phân giải 1440x1024 (Figma chuẩn) | PASS | Không tràn ngang (`hasOverflow: false`) |
| `VIEWPORT_desktop_1280x800` | Độ phân giải 1280x800 | PASS | Không tràn ngang (`hasOverflow: false`) |
| `VIEWPORT_desktop_1920x1080` | Độ phân giải 1920x1080 | PASS | Không tràn ngang (`hasOverflow: false`) |
| `VIEWPORT_desktop_2560x1440` | Độ phân giải 2560x1440 | PASS | Không tràn ngang (`hasOverflow: false`) |
| `VIEWPORT_mobile_390x844` | Độ phân giải 390x844 (Di động) | PASS | Bố cục tab di động không tràn ngang |
| `ZERO_EMOJI_INVARIANT` | Kiểm toán không Unicode emoji toàn DOM | PASS | `count: 0`, không phát hiện emoji |

### 3.3. Ảnh chụp màn hình kiểm thử (Screenshots)
Các ảnh chụp được lưu trữ lâu bền tại `qa/discovery-upgrade/screenshots/`:
- `desktop_1440x1024.png` (Chuẩn Frame 1:145 Warm Editorial)
- `desktop_1280x800.png`
- `desktop_1920x1080.png`
- `desktop_2560x1440.png`
- `mobile_390x844.png`

---

## 4. Kết luận và Bàn giao

Bản nâng cấp giao diện Khám phá (Discovery) theo hợp đồng `docs/DISCOVERY_LOCATION_MODEL_WEB_CONTRACT.md` đã đáp ứng 100% các tiêu chí chất lượng:
1. Độc lập an toàn: không can thiệp backend, không sửa `.env`, không gọi live Gemini/Tavily.
2. Tương tác mượt mà: hỗ trợ chọn mô hình, tìm web, định vị điểm xuất phát linh hoạt, tính khoảng cách chân thực không bịa đặt.
3. Thẩm mỹ chuẩn mực: giữ vững ngôn ngữ thiết kế Warm Editorial, không emoji, tương thích mượt mà từ di động tới màn hình siêu rộng 2.5K.
4. Báo cáo kiểm thử và mã nguồn đã sẵn sàng để Codex tích hợp.
