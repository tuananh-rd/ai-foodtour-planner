# Báo cáo Kiểm định Giao diện & Độ chuẩn xác Figma Warm Editorial (Frame 1:145)

**Dự án:** AI FoodTour Planner  
**Chỉ đạo người dùng:** 2026-10-19 — Thay thế mục tiêu SVG cũ bằng frame Figma 1:145 "02 — Măm Măm / Warm editorial" (1440×1024)  
**Ảnh tham chiếu chuẩn:** `frontend/public/warm-editorial/reference-1440x1024.png` (SHA256: `14301327851af17d61c6ec25e71ef2fc456d32265fc507560e10150fd8c5f3dd`)  
**Tác vụ / Điều phối:** Task `task_9aa61f3769fc`, Dispatch `ctx_fc219ec5727d`, Run `run_928fb169d5d9`  
**Điều phối viên:** Codex (`term_24c3a210-7070-4dd5-b703-f12f516a70b0`)  
**Thực hiện & Kiểm định:** Antigravity  
**Baseline Git:** Fast-forwarded an toàn từ `fc09d2c`  
**Bộ kiểm thử tự động:** `qa/figma-warm-editorial/run_qa.mjs`  
**File bằng chứng chi tiết:** `qa/figma-warm-editorial/evidence.json`

---

## 1. Tóm tắt điều hành (Executive Summary)

1. **Việc đã thực hiện:** Em đã triển khai giao diện "Warm editorial" theo đúng frame Figma 1:145 (1440×1024) vào hệ thống component guided (`GuidedLayout.jsx`, `GuidedTimeline.jsx`, `guided-visual.css`, `guided-leaves.css`), giữ nguyên 100% logic chức năng, các testid ổn định, cổng an toàn, bộ lọc dị ứng, cơ chế khóa đổi quán và bản đồ PMTiles.
2. **Kết quả kiểm chứng:** Toàn bộ 28/28 bài kiểm tra tự động (Preflight, Build, Đo kích thước pixel, Chu trình người dùng tiếng Việt, Focus repair 6816b23, Modal đổi quán, Toggle PilotMap, Phục hồi phiên sau F5, Mobile 390px zero-overflow và Độ tương phản WCAG) đều đạt **100% PASS** với 0 lỗi.
3. **Hiện trạng & Bàn giao:** Toàn bộ bằng chứng hình ảnh (ảnh chụp 1440×1024 ban đầu và khi hoàn tất tour, ảnh ghép side-by-side 2880×1024, ảnh overlay sai lệch 50%, ảnh mobile 390×844) và file JSON evidence đã được tạo đầy đủ; không chỉnh sửa backend, contracts, biến môi trường hay động chạm tới server điều phối (3060/8060/8080).

---

## 2. Bảng kết quả kiểm định tự động (28/28 PASS)

| STT | Mã kiểm thử | Nội dung kiểm tra | Kết quả | Chi tiết đo lường |
|:---:|:---|:---|:---:|:---|
| 1 | `PREFLIGHT_PORTS` | Kiểm tra từ chối cổng độc lập 13600, 18600, 19800 | **PASS** | Hoàn toàn sạch, không chiếm dụng cổng điều phối |
| 2 | `BACKEND_HEALTH` | Khởi chạy backend cô lập với fixture tổng hợp | **PASS** | `status: ok`, `dataset: synthetic` |
| 3 | `FRONTEND_BUILD` | Biên dịch Next.js build từ mã nguồn mới | **PASS** | Build thành công 0 lỗi trong môi trường scratch |
| 4 | `FRONTEND_RUNNING` | Frontend phản hồi HTTP 200 trên port 13600 | **PASS** | Phản hồi ổn định |
| 5 | `SCROLL_NORMALIZED` | Khởi đầu màn hình desktop scrollY = 0 | **PASS** | `scrollY: 0` |
| 6 | `SIDEBAR_GEOMETRY` | Thanh bên rust: rộng 232px, tọa độ x=0 | **PASS** | `x: 0, y: 0, width: 232px, height: 1024px` (lệch 0px) |
| 7 | `CHAT_CARD_GEOMETRY` | Thẻ Chat card: rộng 668px, tọa độ x=264 | **PASS** | `x: 264px, y: 90px, width: 668px, height: 886px` (lệch 0px) |
| 8 | `TOUR_COLUMN_GEOMETRY`| Cột Tour: rộng 452px, tọa độ x=956 | **PASS** | `x: 956px, y: 90px, width: 452px, height: 886px` (lệch 0px) |
| 9 | `USER_BUBBLE_STYLE` | Bong bóng người dùng tone màu đào (peach) | **PASS** | `backgroundColor: rgb(249, 225, 207)` |
| 10 | `FOCUS_CLARIFY_CARD` | Điều hướng focus vào thẻ làm rõ start_time | **PASS** | Focus trúng `clarify-option-time:18:00` |
| 11 | `UNDERSTOOD_CARD_PRESENT` | Thẻ đã hiểu hiển thị đầy đủ hàng tiêu chí | **PASS** | 11 dòng tiêu chí (bao gồm dị ứng đậu phộng) |
| 12 | `FOCUS_CONFIRM_BTN` | Focus tự động đáp vào nút Xác nhận | **PASS** | `document.activeElement === confirm-yes-btn` |
| 13 | `TOUR_STOPS_RENDERED` | Lập lịch trình thành công với 3 điểm dừng | **PASS** | Đủ 3 điểm dừng theo đúng tiêu chí |
| 14 | `STOP_NUMBER_BADGES` | Điểm dừng mang badge số tròn màu đào | **PASS** | Badges `["01", "02", "03"]` |
| 15 | `GOOGLE_MAPS_CTA` | Nút CTA dẫn đường Google Maps đi bộ miễn phí | **PASS** | URL hợp lệ `travelmode=walking`, focus tự động |
| 16 | `GOOGLE_MAPS_DISCLOSURE` | Minh bạch liên kết ngoài miễn phí, không API trả phí | **PASS** | Đoạn text minh bạch hiện diện rõ ràng |
| 17 | `REPLACE_MODAL_OPENS` | Mở hộp thoại đổi quán khi bấm nút Đổi quán | **PASS** | Hộp thoại mở với cơ chế khóa hành trình |
| 18 | `REPLACE_MODAL_CLOSES` | Đóng hộp thoại đổi quán an toàn | **PASS** | Đóng sạch sẽ khi bấm Hủy |
| 19 | `PILOT_MAP_ACTIVE` | Chuyển đổi sang chế độ Bản đồ PMTiles | **PASS** | Canvas `pilot-map-canvas` kích hoạt |
| 20 | `VIEW_MODE_SCHEMATIC` | Quay trở lại chế độ xem Sơ đồ | **PASS** | Giao diện danh sách điểm dừng khôi phục |
| 21 | `RELOAD_PERSISTENCE` | Tải lại trang (F5) phục hồi đầy đủ tour | **PASS** | Phục hồi nguyên vẹn 3 điểm dừng, không cướp focus |
| 22 | `MOBILE_ZERO_OVERFLOW` | Kiểm tra mobile 390px không tràn ngang | **PASS** | `scrollWidth: 390, rootScrollWidth: 390` (0px tràn) |
| 23 | `MOBILE_TAB_CHAT` | Tab Khám phá trên mobile hiển thị khung chat | **PASS** | Khung chat active, không bị ẩn |
| 24 | `MOBILE_TAB_TOUR` | Tab Lịch trình trên mobile hiển thị cột tour | **PASS** | Cột tour active, hiển thị rõ ràng |
| 25 | `CONTRAST_CHAT_TEXT` | Độ tương phản chữ chat chính (#231815/#FFFEFA)| **PASS** | **17.16:1** (vượt xa chuẩn AAA ≥ 7.0:1) |
| 26 | `CONTRAST_SIDEBAR` | Độ tương phản thanh bên (#FFFFFF/#702914) | **PASS** | **10.42:1** (vượt xa chuẩn AAA ≥ 7.0:1) |
| 27 | `CONTRAST_CTA_BUTTON` | Độ tương phản nút CTA (#FFFFFF/#C44A24) | **PASS** | **4.83:1** (đạt chuẩn AA ≥ 4.5:1) |
| 28 | `CONTRAST_DARK_CTA` | Độ tương phản thẻ CTA tối (#FFFFFF/#312820) | **PASS** | **14.43:1** (vượt xa chuẩn AAA ≥ 7.0:1) |

---

## 3. Độ sai lệch hình học so với Figma Frame 1:145

| Khối giao diện | Figma Frame 1:145 (Chuẩn) | Triển khai thực tế | Độ lệch | Đánh giá |
|:---|:---:|:---:|:---:|:---|
| Toàn bộ Canvas | 1440 × 1024 | 1440 × 1024 | 0 px | Trùng khớp tuyệt đối |
| Màu nền Canvas | `#F9C53D` | `#F9C53D` | 0 | Khớp mã màu chỉ định |
| Thanh bên (Sidebar) | Rộng 232px, x=0, y=0 | Rộng 232px, x=0, y=0 | 0 px | Khớp tuyệt đối |
| Màu nền Thanh bên | `#702914` | `#702914` | 0 | Khớp mã màu |
| Khung thẻ Chat | Rộng 668px, x=264, y=90-98 | Rộng 668px, x=264, y=90 | 0 px chiều rộng | Khớp tuyệt đối tỷ lệ |
| Khung cột Lịch trình | Rộng 452px, x=956, y=90-98 | Rộng 452px, x=956, y=90 | 0 px chiều rộng | Khớp tuyệt đối tỷ lệ |
| Bo góc thẻ (Chat/Hero) | ~24-26px | 26px / 24px | < 1 px | Mềm mại đúng tinh thần editorial |
| Hero Tour card | Rộng 452px, cam đất | Rộng 452px, cam đất | 0 px | Khớp cấu trúc |
| Thẻ thông số 3 cột | Cao ~66px, nền kem | Cao 66px, nền kem | 0 px | 3 cột cân đối |
| Badges số thứ tự | Tròn màu đào `01`, `02`, `03` | Tròn màu đào `01`, `02`, `03` | 0 | Khớp layout |
| Thẻ CTA cuối trang | Nền đen than `#312820` | Nền đen than `#312820` | 0 | Khớp layout |

---

## 4. Bằng chứng trực quan (Artifacts)

Tất cả các file bằng chứng đã được ghi nhận trực tiếp tại thư mục `qa/figma-warm-editorial/`:
1. `desktop_1440x1024_initial.png`: Ảnh chụp màn hình chào mừng lúc khởi đầu.
2. `desktop_1440x1024_tour.png`: Ảnh chụp màn hình hoàn chỉnh sau khi tạo tour và tải lại trang.
3. `side_by_side_comparison.png`: Ảnh ghép song song 2880×1024 (ảnh Figma chuẩn bên trái, giao diện web thực tế bên phải).
4. `overlay_diff.png`: Ảnh phủ mờ 50% đối chiếu trực tiếp độ trùng khít giữa thiết kế Figma và mã nguồn thực tế.
5. `mobile_390x844.png`: Ảnh chụp chế độ di động 390px, chứng minh giao diện gọn gàng, không bị tràn viền ngang.
6. `evidence.json`: File dữ liệu kiểm định JSON chi tiết từng thông số runtime.

---

## 5. Giới hạn & Tuân thủ kỹ thuật (Limitations & Compliance)

- **Không gọi dịch vụ bên ngoài:** Không kích hoạt API có phí, không thăm dò Tavily live (giữ hạn mức tín dụng), không gọi Google Maps API tính phí (chỉ dùng URL chỉ đường đi bộ miễn phí gắn tọa độ).
- **Phạm vi sở hữu nghiêm ngặt:** Chỉ can thiệp trong phạm vi được giao (`frontend/app/components/v2/guided/`, `qa/figma-warm-editorial/`, `docs/reports/`). Không sửa đổi backend, schemas, contract hay cấu hình môi trường.
- **Bảo toàn quy tắc dự án:** Không tắt server điều phối (`3060`, `8060`, `8080`). Toàn bộ kiểm thử chạy độc lập trên các cổng an toàn (`13600`, `18600`, `19800`).
