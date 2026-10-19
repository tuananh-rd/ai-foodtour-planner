# Báo cáo Kiểm định Giao diện & Độ chuẩn xác Figma Warm Editorial (Frame 1:145)

**Dự án:** AI FoodTour Planner  
**Chỉ đạo người dùng:** 2026-10-19 — Triển khai Figma frame 1:145, "02 — Măm Măm / Warm editorial", sử dụng ảnh gốc 1440×1024 PNG làm mục tiêu trực quan.  
**Ảnh tham chiếu chuẩn:** `qa/figma-warm-editorial/reference-1440x1024.png` (đã chuyển khỏi thư mục public để không xuất bản ra môi trường web ngoài ý muốn).  
**Tác vụ / Điều phối:** Task `task_53af11905ca6`, Dispatch `ctx_0e9c06b07142`, Run `run_928fb169d5d9`  
**Điều phối viên:** Codex (`term_24c3a210-7070-4dd5-b703-f12f516a70b0`)  
**Thực hiện & Kiểm định:** Antigravity  
**Bộ kiểm thử tự động:** `qa/figma-warm-editorial/run_qa.mjs` (chạy trên cổng cô lập 13600, 18600, 19800)  
**File dữ liệu chứng cứ:** `qa/figma-warm-editorial/evidence.json`  

---

## 1. Tóm tắt điều hành (Executive Summary)

1. **Việc đã thực hiện:** Em đã triển khai giao diện "Warm editorial" theo đúng frame Figma 1:145 (1440×1024) và hoàn thiện 4 nhóm ưu tiên kỹ thuật từ Codex: loại bỏ dữ liệu giả tưởng trong trạng thái rỗng (dùng gạch ngang `—`, nhãn `ước tính đi bộ`, nhãn phạm vi ngân sách thực tế, các bước chỉ dẫn trung tính `BƯỚC 1/2/3` không có giờ đến giả), chuyển các gợi ý thanh bên thành thẻ `<button>` bản địa nhãn `GỢI Ý NHANH` hỗ trợ bàn phím, điều chỉnh hình học chuẩn xác `y=98`, tiêu đề 2 dòng, badge điểm dừng nằm ngang `x=973/1019`, và tinh gọn chiều cao để thẻ Dark CTA không bị trôi khỏi màn hình 886px.
2. **Kết quả kiểm chứng:** Bộ kiểm thử tự động `qa/figma-warm-editorial/run_qa.mjs` ghi nhận **38/38 checks PASS (100%)** với 0 FAIL. Bảng tính toán độ tương phản màu sắc được trích xuất động trực tiếp từ DOM `window.getComputedStyle`: chữ chat chính đạt 17.16:1 (AAA), thanh bên đạt 10.42:1 (AAA), nút CTA đất nung `#C44A24` đạt 4.83:1 (AA), và thẻ Dark CTA đạt 14.43:1 (AAA). Quy trình đổi quán thực tế được commit thành công từ máy chủ (`[SYNTHETIC] Chè Thử 12` đổi thành `[SYNTHETIC] Kem Thử 24`), và số lượng marker bản đồ đồng bộ chuẩn xác với số điểm dừng.
3. **Hiện trạng & Bàn giao:** Toàn bộ bằng chứng trực quan (`desktop_1440x1024_initial.png`, `desktop_1440x1024_tour.png`, `side_by_side_comparison.png`, `overlay_diff.png`, `mobile_390x844.png`) và file `evidence.json` đã được tạo đầy đủ. Không chỉnh sửa backend, contracts, biến môi trường hay động chạm tới các cổng điều phối (3060/8060/8080).

---

## 2. Bảng kết quả kiểm định tự động (38/38 PASS)

| STT | Mã kiểm thử | Nội dung kiểm tra | Kết quả | Chi tiết đo lường |
|:---:|:---|:---|:---:|:---|
| 1 | `PREFLIGHT_PORTS` | Kiểm tra từ chối cổng độc lập 13600, 18600, 19800 | **PASS** | Hoàn toàn sạch, không chiếm dụng cổng điều phối |
| 2 | `BACKEND_HEALTH` | Khởi chạy backend cô lập với fixture tổng hợp | **PASS** | `status: ok`, `dataset: synthetic` |
| 3 | `FRONTEND_BUILD` | Biên dịch Next.js build từ mã nguồn mới | **PASS** | Build thành công 0 lỗi trong môi trường scratch |
| 4 | `FRONTEND_RUNNING` | Frontend phản hồi HTTP 200 trên port 13600 | **PASS** | Phản hồi ổn định |
| 5 | `SCROLL_NORMALIZED` | Khởi đầu màn hình desktop scrollY = 0 | **PASS** | `scrollY: 0` |
| 6 | `SIDEBAR_GEOMETRY` | Thanh bên rust: rộng 232px, tọa độ x=0, y=0 | **PASS** | `x: 0, y: 0, width: 232px, height: 1024px` |
| 7 | `CHAT_CARD_GEOMETRY` | Thẻ Chat card: rộng 668px, tọa độ x=264, y=98 | **PASS** | `x: 264px, y: 98px, width: 668px, height: 886px` |
| 8 | `TOUR_COLUMN_GEOMETRY`| Cột Tour: rộng 452px, tọa độ x=956, y=98 | **PASS** | `x: 956px, y: 98px, width: 452px, height: 886px` |
| 9 | `EMPTY_METRICS_HONEST` | Thông số rỗng trung thực: `—` điểm, `—` khoảng cách | **PASS** | Điểm dừng `—`, khoảng cách `—`, nhãn `ước tính đi bộ` |
| 10 | `EMPTY_STEPS_INSTRUCTIONAL` | Các bước hướng dẫn `BƯỚC 1/2/3` không có giờ bịa | **PASS** | Danh sách bước `["BƯỚC 1", "BƯỚC 2", "BƯỚC 3"]` |
| 11 | `SIDEBAR_SUGGESTIONS_NATIVE` | Gợi ý thanh bên là thẻ `<button>` mang nhãn GỢI Ý NHANH | **PASS** | 3 buttons bản địa, nhãn `GỢI Ý NHANH` |
| 12 | `NO_FAKE_CONTROLS` | Không có nút giả "Lưu chuyến đi" hay mũi tên `˅` ảo | **PASS** | Loại bỏ hoàn toàn affordance ảo |
| 13 | `KEYBOARD_SUGGESTION_POPULATES` | Kích hoạt phím/click gợi ý tự động điền vào ô chat | **PASS** | Điền đúng chuỗi `"Một tối ẩm thực quanh Hồ Gươm"` |
| 14 | `USER_BUBBLE_STYLE` | Bong bóng người dùng tone màu đào (peach) | **PASS** | `backgroundColor: rgb(249, 225, 207)` |
| 15 | `FOCUS_CLARIFY_CARD` | Điều hướng focus vào thẻ làm rõ start_time | **PASS** | Focus trúng `clarify-option-time:18:00` |
| 16 | `UNDERSTOOD_CARD_PRESENT` | Thẻ đã hiểu hiển thị đầy đủ hàng tiêu chí | **PASS** | 11 dòng tiêu chí chuẩn hóa (bao gồm dị ứng đậu phộng) |
| 17 | `FOCUS_CONFIRM_BTN` | Focus tự động đáp vào nút Xác nhận | **PASS** | `document.activeElement === confirm-yes-btn` |
| 18 | `TOUR_STOPS_RENDERED` | Lập lịch trình thành công với 3 điểm dừng | **PASS** | Đủ 3 điểm dừng theo đúng tiêu chí |
| 19 | `STOP_BADGE_GEOMETRY` | Badge điểm dừng nằm ngang: x=973, nội dung tại x=1019 | **PASS** | `badgeRect.x: 973, bodyRect.x: 1019` (lệch ≤ 1px so với 972/1018) |
| 20 | `STOP_STAGE_NEUTRAL` | Giai đoạn dùng nhãn điểm dừng trung tính | **PASS** | `18:04 · ĐIỂM DỪNG 1` (không gắn mác món ăn khi thiếu dữ liệu) |
| 21 | `DARK_CTA_VISIBLE` | Thẻ Dark CTA hiển thị trọn vẹn không cần cuộn | **PASS** | `bottom: 924px <= 1024px`, nằm trọn trong viewport |
| 22 | `GOOGLE_MAPS_CTA` | Nút CTA dẫn đường Google Maps đi bộ miễn phí | **PASS** | URL hợp lệ `travelmode=walking`, focus tự động |
| 23 | `GOOGLE_MAPS_DISCLOSURE` | Minh bạch liên kết ngoài miễn phí, không API trả phí | **PASS** | Đoạn text minh bạch hiện diện rõ ràng |
| 24 | `REPLACE_MODAL_OPENS` | Mở hộp thoại đổi quán khi bấm nút Đổi quán | **PASS** | Hộp thoại mở với nút `replace-modal-confirm-btn` |
| 25 | `REPLACE_DIFF_RENDERED` | Máy chủ trả về diff so sánh trước/sau khi đổi quán | **PASS** | Diff hiển thị với nút `replace-modal-done-btn` |
| 26 | `REPLACE_MODAL_COMMITTED` | Đóng hộp thoại đổi quán sau khi hoàn tất xác nhận | **PASS** | Modal đóng sạch sẽ sau khi commit |
| 27 | `STOP_REPLACEMENT_APPLIED` | Cập nhật điểm dừng thực tế trong lịch trình | **PASS** | Điểm dừng 1 đổi từ `[SYNTHETIC] Chè Thử 12` thành `[SYNTHETIC] Kem Thử 24` |
| 28 | `PILOT_MAP_ACTIVE` | Chuyển đổi sang chế độ Bản đồ PMTiles | **PASS** | Canvas `pilot-map-canvas` kích hoạt |
| 29 | `MAP_MARKERS_SYNC` | Số marker bản đồ đồng bộ với số điểm dừng | **PASS** | 3 marker số xuất hiện trên bản đồ nội bộ Hoàn Kiếm |
| 30 | `VIEW_MODE_SCHEMATIC` | Quay trở lại chế độ xem Sơ đồ | **PASS** | Giao diện danh sách điểm dừng khôi phục |
| 31 | `RELOAD_PERSISTENCE` | Tải lại trang (F5) phục hồi đầy đủ tour | **PASS** | Phục hồi nguyên vẹn 3 điểm dừng, không cướp focus |
| 32 | `MOBILE_ZERO_OVERFLOW` | Kiểm tra mobile 390px không tràn ngang | **PASS** | `scrollWidth: 390, rootScrollWidth: 390` (0px tràn) |
| 33 | `MOBILE_TAB_CHAT` | Tab Khám phá trên mobile hiển thị khung chat | **PASS** | Khung chat active, không bị ẩn |
| 34 | `MOBILE_TAB_TOUR` | Tab Lịch trình trên mobile hiển thị cột tour | **PASS** | Cột tour active, hiển thị rõ ràng |
| 35 | `CONTRAST_CHAT_TEXT` | Độ tương phản chữ chat chính (#231815/#FFFEFA)| **PASS** | **17.16:1** (đo từ DOM, vượt chuẩn AAA ≥ 7.0:1) |
| 36 | `CONTRAST_SIDEBAR` | Độ tương phản thanh bên (#FFFFFF/#702914) | **PASS** | **10.42:1** (đo từ DOM, vượt chuẩn AAA ≥ 7.0:1) |
| 37 | `CONTRAST_CTA_BUTTON` | Độ tương phản nút CTA (#FFFFFF/#C44A24) | **PASS** | **4.83:1** (đo từ DOM, đạt chuẩn AA ≥ 4.5:1) |
| 38 | `CONTRAST_DARK_CTA` | Độ tương phản thẻ CTA tối (#FFFFFF/#312820) | **PASS** | **14.43:1** (đo từ DOM, vượt chuẩn AAA ≥ 7.0:1) |

---

## 3. Độ sai lệch hình học so với Figma Frame 1:145

| Khối giao diện | Figma Frame 1:145 (Mục tiêu) | Triển khai thực tế | Độ sai lệch | Đánh giá |
|:---|:---:|:---:|:---:|:---|
| Toàn bộ Canvas | 1440 × 1024 | 1440 × 1024 | 0 px | Khớp tuyệt đối độ phân giải chuẩn |
| Màu nền Canvas | `#F9C53D` | `#F9C53D` | 0 | Khớp mã màu vàng ấm editorial |
| Thanh bên (Sidebar) | Rộng 232px, x=0, y=0 | Rộng 232px, x=0, y=0 | 0 px | Khớp tuyệt đối |
| Màu nền Thanh bên | `#702914` | `#702914` | 0 | Khớp mã màu nâu đỏ ấm |
| Khung thẻ Chat | Rộng 668px, x=264, y=98 | Rộng 668px, x=264, y=98 | 0 px | Khớp tuyệt đối tọa độ x và y |
| Khung cột Lịch trình | Rộng 452px, x=956, y=98 | Rộng 452px, x=956, y=98 | 0 px | Khớp tuyệt đối tọa độ x và y |
| Tiêu đề Chat | 2 dòng (~42-44px/50px) | 2 dòng (42px/50px) | 0 px | Khớp phân ngắt và nhịp điệu chữ |
| Tiêu đề Hero Tour | 2 dòng (~30-32px/36px) | 2 dòng (30px/36px) | 0 px | Khớp phân ngắt 2 dòng |
| Badge số điểm dừng | Tròn 32px tại x=972, nội dung x=1018 | Tròn 32px tại x=973, nội dung x=1019 | ≤ 1 px | Khớp căn ngang horizontal flex |
| Thẻ thông số 3 cột | Cao ~56px, nền kem | Cao 56px, nền kem | 0 px | Cân đối, giá trị rỗng trung thực `—` |
| Chiều cao thẻ Dark CTA | Nằm gọn trong cột 886px | Đáy thẻ tại y=924px | 0 px tràn | Hiển thị trọn vẹn không cần cuộn |

---

## 4. Bằng chứng trực quan (Artifacts)

Tất cả các file bằng chứng kiểm định nằm trong thư mục `qa/figma-warm-editorial/`:
1. `desktop_1440x1024_initial.png`: Ảnh chụp màn hình khởi đầu với dữ liệu rỗng trung thực và gợi ý bàn phím.
2. `desktop_1440x1024_tour.png`: Ảnh chụp màn hình hoàn chỉnh sau khi lập tour, đổi quán và tải lại trang.
3. `side_by_side_comparison.png`: Ảnh ghép song song 2880×1024 (bản tham chiếu Figma bên trái, mã nguồn thực tế bên phải).
4. `overlay_diff.png`: Ảnh phủ mờ 50% đối chiếu độ trùng khớp layout giữa thiết kế Figma và giao diện web.
5. `mobile_390x844.png`: Ảnh chụp giao diện di động 390px, chứng minh hiển thị rõ ràng, không bị tràn viền ngang (0px overflow).
6. `evidence.json`: File JSON ghi nhận toàn bộ 38 chỉ số runtime và giá trị tính toán độ tương phản trực tiếp từ DOM.

---

## 5. Giới hạn & Tuân thủ kỹ thuật (Limitations & Compliance)

- **Môi trường phông chữ:** Do phông chữ hệ thống trên Windows (Segoe UI/Arial) có độ dày nét (glyph rasterization) hơi khác biệt so với phông xuất tĩnh từ canvas Figma, các khoảng ngắt từ phụ có sự xê dịch khoảng vài pixel nhưng cấu trúc layout 2 dòng được bảo toàn trọn vẹn bằng thẻ `<br className="nn-heading-break" />`.
- **Tài sản tham chiếu:** File ảnh thiết kế chuẩn đã được chuyển sang thư mục nội bộ kiểm định `qa/figma-warm-editorial/reference-1440x1024.png` và loại bỏ khỏi thư mục public phân phối sản phẩm.
- **Không gọi dịch vụ có phí:** Không kích hoạt API ngoài, không thăm dò live provider (bảo toàn quota), Google Maps chỉ sử dụng URL chỉ đường đi bộ miễn phí.
- **Bảo toàn cổng và máy chủ:** Toàn bộ quá trình chạy thử nghiệm được thực hiện trên các cổng độc lập (`13600`, `18600`, `19800`); các máy chủ điều phối của Đại Ca (`3060`, `8060`, `8080`) hoàn toàn không bị ảnh hưởng.
