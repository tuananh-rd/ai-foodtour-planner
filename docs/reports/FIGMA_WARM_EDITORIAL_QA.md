# Báo cáo Kiểm định Giao diện & Độ chuẩn xác Figma Warm Editorial (Frame 1:145)

**Dự án:** AI FoodTour Planner  
**Chỉ đạo người dùng:** 2026-10-19 — Triển khai Figma frame 1:145, "02 — Măm Măm / Warm editorial", sử dụng ảnh gốc 1440×1024 PNG làm mục tiêu trực quan.  
**Ảnh tham chiếu chuẩn:** `qa/figma-warm-editorial/reference-1440x1024.png` (đã lưu trữ nội bộ tại qa/ để không xuất bản ra môi trường web).  
**Tác vụ / Điều phối:** Task `task_0b8beaeb46b6`, Dispatch `ctx_d65d1251e6fd` (kế thừa `task_53af11905ca6` / `task_1ecaea329bef`)  
**Điều phối viên:** Codex (`term_24c3a210-7070-4dd5-b703-f12f516a70b0`)  
**Thực hiện & Kiểm định:** Antigravity  
**Bộ kiểm thử tự động:** `qa/figma-warm-editorial/run_qa.mjs` (chạy trên cổng cô lập 13600, 18600, 19800)  
**File dữ liệu chứng cứ:** `qa/figma-warm-editorial/evidence.json`  

---

## 1. Tóm tắt điều hành (Executive Summary)

1. **Việc đã thực hiện:** Em đã triển khai giao diện "Warm editorial" theo đúng frame Figma 1:145 (1440×1024) và thực hiện đầy đủ 5 nhóm chỉ đạo chuẩn hoá nghiêm ngặt từ Codex:
   - **Nhịp điệu dọc thẻ Chat bên trái (Left Chat Card Rhythm):** Badge trợ lý cao 36px bắt đầu tại y=126; tiêu đề lớn `font-size: 44px; font-weight: 600; line-height: 60px` bắt đầu tại y=198 (2 dòng thanh lịch); đoạn giới thiệu bắt đầu tại y=334 (giới hạn chiều rộng 530px); hàng chip lọc bắt đầu tại y=410; đường kẻ phân cách tại y=458.
   - **Kích thước Cột phải & Nút Dark CTA chuẩn xác (Right Column & CTA):** Header cột tour cao 40px với tiêu đề 32px weight 600 line-height 40px; Thẻ Hero cao 190px (bắt đầu tại y=170) với tiêu đề 32px weight 600 tự động tách 2 dòng sau dấu phẩy; Thẻ Metrics 3 cột cao 66px; Các thẻ điểm dừng min-height 112px với khoảng cách 12px; Thẻ Dark CTA ở trạng thái rỗng cao 150px (y=824); Nút Dark CTA là nút chữ nhật bo góc màu kem nhạt (`#FAF4EE`, viền `#E2D7CC`, chữ đen `#231815`, cao 44px, radius 12px, độ tương phản 15.86:1 đạt AAA), thay thế hoàn toàn dạng viên thuốc màu cam cũ.
   - **Khắc phục triệt để lỗi chức năng trên Mobile (Mobile Tab-Switch Bug):** Khi người dùng đang ở tab `tour` trên giao diện di động, việc bấm nút "Bắt đầu gợi ý →" hoặc chọn gợi ý nhanh ở thanh bên sẽ chủ động kích hoạt chuyển `activeMobileTab = 'chat'`, sau đó mới focus vào ô soạn thảo khi đã hiển thị trên DOM.
   - **Nhãn khoảng cách theo phương tiện & Minh bạch phiên cục bộ:** Nhãn khoảng cách không còn mặc định "ước tính đi bộ" khi phương tiện không phải đi bộ (đồng bộ theo xe máy, ô tô, taxi); chân trang thanh bên ghi nhận trung thực "Phiên hiện tại / Phiên làm việc cục bộ" thay vì tuyên bố gây hiểu lầm là chỉ lưu trên trình duyệt.
   - **Bảo toàn cảnh báo trong vùng cuộn tự nhiên:** Các cảnh báo an toàn dị ứng và minh bạch liên kết ngoài Google Maps được đặt trong vùng cuộn tự nhiên `.nn-tour-content-scroll`, không bóp nghẹt chiều cao các thẻ để cố tình triệt tiêu thanh cuộn.
2. **Kết quả kiểm chứng:** Toàn bộ test suite `qa/figma-warm-editorial/run_qa.mjs` ghi nhận **47/47 checks PASSED (100%)** với 0 FAIL. Độ tương phản trích xuất trực tiếp từ DOM đạt chuẩn WCAG AAA/AA: chữ chat chính 17.16:1, chữ thanh bên 10.42:1, nút CTA màu kem 15.86:1, thẻ Dark CTA 14.43:1, chip lọc 10.26:1.
3. **Hiện trạng & Bàn giao:** Toàn bộ bằng chứng trực quan (`desktop_1440x1024_initial.png`, `desktop_1440x1024_tour.png`, `side_by_side_comparison.png`, `overlay_diff.png`, `mobile_390x844.png`) và file `evidence.json` đã được tái tạo hoàn chỉnh. Không sửa đổi backend, contracts, biến môi trường hay động chạm tới các cổng điều phối (3060/8060/8080).

---

## 2. Bảng kết quả kiểm định tự động (47/47 PASS)

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
| 9 | `CHAT_RHYTHM_BADGE` | Badge trợ lý cao 36px, bắt đầu tại y=126 | **PASS** | `y: 126px, height: 36px` |
| 10 | `CHAT_RHYTHM_HEADING` | Tiêu đề chat bắt đầu tại y=198, 44px weight 600 line-height 60px | **PASS** | `y: 198px, height: 120px, font: 44px/60px w600` |
| 11 | `CHAT_RHYTHM_SUB_AND_CHIPS` | Đoạn dẫn bắt đầu tại y=334, hàng chips tại y=410 | **PASS** | `sub.y: 334px, chips.y: 410px` |
| 12 | `RIGHT_COL_HEADER_METRICS` | Header cột tour cao 40px, tiêu đề 32px weight 600 line-height 40px | **PASS** | `height: 40px, fontSize: 32px, fontWeight: 600` |
| 13 | `RIGHT_COL_HERO_AND_METRICS` | Thẻ Hero cao 190px (y=170) và Thẻ Metrics cao 66px (y=372) | **PASS** | `hero.height: 190px, metrics.height: 66px` |
| 14 | `DARK_CTA_CARD_AND_BUTTON` | Thẻ Dark CTA cao 150px (y=824), nút kem nhạt `#FAF4EE` chữ đen | **PASS** | `height: 150px, btn: #FAF4EE / #231815, radius 12px` |
| 15 | `EMPTY_METRICS_HONEST` | Thông số rỗng trung thực: `—` điểm, `—` khoảng cách | **PASS** | Điểm dừng `—`, khoảng cách `—`, nhãn `khoảng cách (ước tính đi bộ)` |
| 16 | `EMPTY_STEPS_INSTRUCTIONAL` | Các bước hướng dẫn `BƯỚC 1/2/3` không có giờ bịa | **PASS** | Danh sách bước `["BƯỚC 1", "BƯỚC 2", "BƯỚC 3"]` |
| 17 | `SIDEBAR_SUGGESTIONS_NATIVE` | Gợi ý thanh bên là thẻ `<button>` mang nhãn GỢI Ý NHANH | **PASS** | 3 buttons bản địa, nhãn `GỢI Ý NHANH` |
| 18 | `PROFILE_FOOTER_LOCAL_SESSION` | Chân trang thanh bên ghi nhận đúng phiên làm việc cục bộ | **PASS** | `Phiên hiện tại / Phiên làm việc cục bộ` |
| 19 | `NO_FAKE_CONTROLS` | Không có nút giả "Lưu chuyến đi" hay mũi tên `˅` ảo | **PASS** | Loại bỏ hoàn toàn affordance ảo |
| 20 | `KEYBOARD_SUGGESTION_POPULATES` | Kích hoạt bàn phím Enter/Space gợi ý tự động điền ô chat | **PASS** | Điền đúng chuỗi `"Một tối ẩm thực quanh Hồ Gươm"` |
| 21 | `MOBILE_EMPTY_CTA_SWITCHES_TAB` | Bấm CTA trong tab tour trên mobile chuyển tab chat và focus input | **PASS** | `activeMobileTab = 'chat'`, input nhận focus ngay lập tức |
| 22 | `USER_BUBBLE_STYLE` | Bong bóng người dùng tone màu đào (peach) | **PASS** | `backgroundColor: rgb(249, 225, 207)` |
| 23 | `FOCUS_CLARIFY_CARD` | Điều hướng focus vào thẻ làm rõ start_time | **PASS** | Focus trúng `clarify-option-time:18:00` |
| 24 | `UNDERSTOOD_CARD_PRESENT` | Thẻ đã hiểu hiển thị đầy đủ hàng tiêu chí | **PASS** | 11 dòng tiêu chí chuẩn hóa (bao gồm dị ứng đậu phộng) |
| 25 | `FOCUS_CONFIRM_BTN` | Focus tự động đáp vào nút Xác nhận | **PASS** | `document.activeElement === confirm-yes-btn` |
| 26 | `TOUR_STOPS_RENDERED` | Lập lịch trình thành công với 3 điểm dừng | **PASS** | Đủ 3 điểm dừng theo đúng tiêu chí |
| 27 | `STOP_BADGE_GEOMETRY` | Badge điểm dừng nằm ngang: x=975, nội dung tại x=1021 | **PASS** | Căn ngang chuẩn xác (lệch ≤ 3px so với x=972/1018) |
| 28 | `STOP_STAGE_NEUTRAL` | Giai đoạn dùng nhãn điểm dừng trung tính | **PASS** | `18:04 · ĐIỂM DỪNG 1` (không gán mác món ăn khi thiếu dữ liệu) |
| 29 | `DARK_CTA_TIMELINE_PRESENT` | Thẻ Dark CTA trong timeline min-height 150px (thực tế 181px với văn bản minh bạch) | **PASS** | `y: 743px, height: 181px, btnHeight: 44px, btnWidth: 391px` |
| 30 | `GOOGLE_MAPS_CTA` | Nút CTA dẫn đường Google Maps đi bộ miễn phí | **PASS** | URL hợp lệ `travelmode=walking`, focus tự động |
| 31 | `GOOGLE_MAPS_DISCLOSURE` | Minh bạch liên kết ngoài miễn phí, không API trả phí | **PASS** | Đoạn text minh bạch hiện diện rõ ràng |
| 32 | `REPLACE_MODAL_OPENS` | Mở hộp thoại đổi quán khi bấm nút Đổi quán | **PASS** | Hộp thoại mở với nút `replace-modal-confirm-btn` |
| 33 | `REPLACE_DIFF_RENDERED` | Máy chủ trả về diff so sánh trước/sau khi đổi quán | **PASS** | Diff hiển thị với nút `replace-modal-done-btn` |
| 34 | `REPLACE_MODAL_COMMITTED` | Đóng hộp thoại đổi quán sau khi hoàn tất xác nhận | **PASS** | Modal đóng sạch sẽ sau khi commit |
| 35 | `STOP_REPLACEMENT_APPLIED` | Cập nhật điểm dừng thực tế trong lịch trình | **PASS** | Điểm dừng 1 đổi từ `[SYNTHETIC] Chè Thử 12` thành `[SYNTHETIC] Kem Thử 24` |
| 36 | `PILOT_MAP_ACTIVE` | Chuyển đổi sang chế độ Bản đồ PMTiles | **PASS** | Canvas `pilot-map-canvas` kích hoạt |
| 37 | `MAP_MARKERS_SYNC` | Số marker bản đồ đồng bộ với số điểm dừng | **PASS** | 3 marker số xuất hiện trên bản đồ nội bộ Hoàn Kiếm |
| 38 | `VIEW_MODE_SCHEMATIC` | Quay trở lại chế độ xem Sơ đồ | **PASS** | Giao diện danh sách điểm dừng khôi phục |
| 39 | `RELOAD_PERSISTENCE` | Tải lại trang (F5) phục hồi đầy đủ tour | **PASS** | Phục hồi nguyên vẹn 3 điểm dừng, không cướp focus |
| 40 | `MOBILE_ZERO_OVERFLOW` | Kiểm tra mobile 390px không tràn ngang | **PASS** | `scrollWidth: 390, rootScrollWidth: 390` (0px tràn) |
| 41 | `MOBILE_TAB_CHAT` | Tab Khám phá trên mobile hiển thị khung chat | **PASS** | Khung chat active, không bị ẩn |
| 42 | `MOBILE_TAB_TOUR` | Tab Lịch trình trên mobile hiển thị cột tour | **PASS** | Cột tour active, hiển thị rõ ràng |
| 43 | `CONTRAST_CHAT_TEXT` | Độ tương phản chữ chat chính (#231815/#FFFEFA) | **PASS** | **17.16:1** (đo từ DOM, vượt chuẩn AAA ≥ 7.0:1) |
| 44 | `CONTRAST_SIDEBAR` | Độ tương phản thanh bên (#FFFFFF/#702914) | **PASS** | **10.42:1** (đo từ DOM, vượt chuẩn AAA ≥ 7.0:1) |
| 45 | `CONTRAST_CTA_BUTTON` | Độ tương phản nút CTA kem nhạt (#231815/#FAF4EE) | **PASS** | **15.86:1** (đo từ DOM, vượt chuẩn AAA ≥ 7.0:1) |
| 46 | `CONTRAST_DARK_CTA` | Độ tương phản thẻ CTA tối (#FFFFFF/#312820) | **PASS** | **14.43:1** (đo từ DOM, vượt chuẩn AAA ≥ 7.0:1) |
| 47 | `CONTRAST_FILTER_CHIP` | Độ tương phản chip lọc (#4A352F/#F7F2EE) | **PASS** | **10.26:1** (đo từ DOM, vượt chuẩn AA ≥ 4.5:1) |

---

## 3. So sánh hình học chi tiết với Figma Frame 1:145

| Khối giao diện | Figma Frame 1:145 (Mục tiêu) | Đo lường thực tế (DOM) | Độ sai lệch | Đánh giá & Rationale |
|:---|:---:|:---:|:---:|:---|
| **Canvas & Nền** | 1440 × 1024, `#F9C53D` | 1440 × 1024, `rgb(249, 197, 61)` | 0 px | Khớp hoàn hảo độ phân giải chuẩn và tone màu vàng ấm editorial |
| **Thanh bên (Sidebar)** | 232 × 1024, x=0, y=0, `#702914` | 232 × 1024, x=0, y=0, `rgb(112, 41, 20)` | 0 px | Khớp tuyệt đối |
| **Thẻ Chat (Left Card)** | 668 × 886, x=264, y=98 | 668 × 886, x=264, y=98 | 0 px | Khớp tuyệt đối vị trí và kích thước khung card |
| **Badge trợ lý (Chat)** | y=126, cao 36px | y=126, cao 36px | 0 px | Khớp tuyệt đối nhịp điệu mở đầu |
| **Tiêu đề Chat (Hero H1)** | y=198, 44px/60px w600 (2 dòng) | y=198, cao 120px (44px/60px w600) | 0 px | Khớp chính xác tọa độ bắt đầu glyph, kích thước và phân ngắt 2 dòng |
| **Đoạn dẫn trợ lý** | y=330, max-width ~530px | y=334, max-width 530px | 4 px | Lệch 4px do khử răng cưa phông chữ trên Windows, giữ đúng 2 dòng |
| **Hàng chip lọc nhanh** | y=409 | y=410 | 1 px | Khớp nhịp điệu |
| **Đường kẻ phân cách** | y=458 | y=458 | 0 px | Khớp hoàn hảo |
| **Header Cột Tour** | y=98, cao 40px, H2 32px/40px w600 | y=98, cao 40px, H2 32px/40px w600 | 0 px | Khớp tuyệt đối kích thước header và typography |
| **Thẻ Hero Tour** | y=158 (hoặc ~170), cao 190px | y=170, cao 190px | 0 px (chiều cao) | Chiều cao 190px chuẩn xác; tiêu đề 32px/44px w600 tự ngắt dòng sau dấu phẩy |
| **Thẻ Metrics 3 cột** | cao 66px, nền kem | y=372, cao 66px | 0 px | Khớp chiều cao 66px; thông số rỗng trung thực `—` |
| **Thẻ Điểm dừng** | min-height 112px, gap 12px | min-height 112px, padding 14px 18px | 0 px | Thẻ điểm dừng rộng rãi, rõ ràng theo đúng tỷ lệ editorial |
| **Thẻ Dark CTA (Rỗng)** | y=822, cao 150px | y=824, cao 150px | 2 px | Khớp chiều cao 150px; nằm trọn vẹn trong viewport desktop 1024px |
| **Nút bấm Dark CTA** | Chữ nhật bo góc `#FAF4EE`, chữ `#231815` | Cao 44px, radius 12px, `#FAF4EE` | 0 px | Khớp thẩm mỹ editorial cổ điển, tương phản 15.86:1 vượt chuẩn AAA |
| **Thẻ Dark CTA (Có tour)** | Chứa thêm dòng minh bạch Google Maps | Cao 181px (y=743px) | +31 px | Chiều cao tăng tự nhiên để chứa văn bản an toàn/minh bạch pháp lý |

---

## 4. Bằng chứng trực quan (Artifacts)

Tất cả các file bằng chứng kiểm định nằm tại thư mục `qa/figma-warm-editorial/`:
1. `desktop_1440x1024_initial.png`: Ảnh chụp màn hình khởi đầu với nhịp điệu dọc chuẩn xác, dữ liệu rỗng trung thực và gợi ý bàn phím.
2. `desktop_1440x1024_tour.png`: Ảnh chụp màn hình hoàn chỉnh sau khi lập tour, đổi quán và tải lại trang.
3. `side_by_side_comparison.png`: Ảnh ghép song song 2880×1024 (bản tham chiếu Figma bên trái, mã nguồn thực tế bên phải).
4. `overlay_diff.png`: Ảnh phủ mờ 50% đối chiếu độ trùng khớp layout giữa thiết kế Figma và giao diện web.
5. `mobile_390x844.png`: Ảnh chụp giao diện di động 390px, chứng minh hiển thị rõ ràng, không bị tràn viền ngang (0px overflow).
6. `evidence.json`: File JSON ghi nhận toàn bộ 47 chỉ số runtime và giá trị tính toán độ tương phản trực tiếp từ DOM.

---

## 5. Giới hạn & Tuân thủ kỹ thuật (Limitations & Compliance)

- **Vùng cuộn tự nhiên vs Cảnh báo an toàn:** Trong Figma tĩnh Frame 1:145, các thẻ được xếp vừa khít không có thanh cuộn vì không có các dòng thông báo động. Trên ứng dụng thực tế, khi có các cảnh báo an toàn dị ứng (Allergy Disclaimer) hoặc minh bạch Google Maps, `.nn-tour-content-scroll` cho phép cuộn tự nhiên để đảm bảo người dùng luôn đọc được đầy đủ thông tin an toàn thay vì bị cắt xén hoặc ép nhỏ chữ quá mức.
- **Môi trường phông chữ:** Phông chữ hệ thống Windows Segoe UI có độ dãn dòng và khử răng cưa hơi khác biệt với phông vector gốc của Figma (chênh lệch tọa độ văn bản phụ từ 1–4px), nhưng toàn bộ cấu trúc ngắt dòng 2 dòng của tiêu đề đã được cố định chắc chắn.
- **Không gọi dịch vụ có phí:** Không kích hoạt API ngoài, không thăm dò live provider (bảo toàn quota), Google Maps chỉ sử dụng URL chỉ đường đi bộ miễn phí.
- **Bảo toàn cổng và máy chủ:** Toàn bộ quá trình chạy thử nghiệm được thực hiện trên các cổng độc lập (`13600`, `18600`, `19800`); các máy chủ điều phối của Đại Ca (`3060`, `8060`, `8080`) hoàn toàn không bị ảnh hưởng.
