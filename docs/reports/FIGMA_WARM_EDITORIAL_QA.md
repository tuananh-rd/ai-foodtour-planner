# Báo cáo Kiểm định Giao diện & Độ chuẩn xác Figma Warm Editorial (Frame 1:145)

**Dự án:** AI FoodTour Planner  
**Chỉ đạo người dùng:** 2026-10-19 — Triển khai Figma frame 1:145, "02 — Măm Măm / Warm editorial", sử dụng ảnh gốc 1440×1024 PNG làm mục tiêu trực quan.  
**Ảnh tham chiếu chuẩn:** `qa/figma-warm-editorial/reference-1440x1024.png` (đã lưu trữ nội bộ tại qa/ để không xuất bản ra môi trường web).  
**Tác vụ / Điều phối:** Task `task_f223894221b3`, Dispatch `ctx_bd4c51ddf03e` (kế thừa `task_0b8beaeb46b6` / `25cd216`)  
**Điều phối viên:** Codex (`term_24c3a210-7070-4dd5-b703-f12f516a70b0`)  
**Thực hiện & Kiểm định:** Antigravity  
**Bộ kiểm thử tự động:** `qa/figma-warm-editorial/run_qa.mjs` (chạy trên cổng cô lập 13600, 18600, 19800)  
**File dữ liệu chứng cứ:** `qa/figma-warm-editorial/evidence.json`  

---

## 1. Tóm tắt điều hành (Executive Summary)

1. **Việc đã thực hiện:** Em đã khắc phục triệt để 3 vấn đề kỹ thuật thực tế được Codex phát hiện trong đợt kiểm thử độc lập 190-check trên bản tích hợp `25cd216`:
   - **Xử lý triệt để lỗi tràn nút khi CSS zoom 200% ở viewport 390px (Zero Clipping):** Bổ sung quy tắc responsive wrapping linh hoạt cho header cột tour (`.nn-tour-col-header`), khối nút chuyển chế độ (`.nn-view-mode-toggle`) và hàng thao tác điểm dừng (`.nn-stop-stage-row`, `.nn-stop-actions`), giúp các nút điều khiển (`pilot-map-toggle` và `stop-replace-btn-0/1/2`) tự động co giãn và xuống dòng tự nhiên thay vì bị đẩy tràn khỏi mép màn hình.
   - **Khôi phục hiển thị trực quan thông tin giá và chặng di chuyển (Visible Price & Leg Info):** Loại bỏ việc giấu thông tin trong `.nn-sr`, khôi phục thẻ hiển thị nhỏ gọn (`.nn-stop-meta-line .nn-meta-pill`) hiển thị rõ ràng giá theo nguồn (ví dụ: `🏷️ Khoảng giá ≈15k–45k (theo nguồn)` hoặc `giá theo nguồn: chưa rõ`) và chặng di chuyển ước tính (`🚶 ~3 phút (ước tính)` hoặc `🚶 0 phút`), bảo toàn dữ liệu trung thực cho người dùng mắt thường.
   - **Đồng bộ từ ngữ xuất xứ nguồn mở cửa (Provenance Wording):** Bảo toàn chuẩn xác xuất xứ nguồn ghi nhận cho giờ mở cửa (`nguồn ghi giờ mở cửa: ...` hoặc `giờ mở cửa theo nguồn: chưa rõ`), đảm bảo lộ trình tour chứa đầy đủ 3 cụm từ minh bạch: `"theo nguồn"`, `"ước tính"`, `"nguồn ghi"` và cảnh báo an toàn dị ứng.
2. **Kết quả kiểm chứng:** Bộ kiểm thử tự động `qa/figma-warm-editorial/run_qa.mjs` ghi nhận **50/50 checks PASSED (100%)** với 0 FAIL. Tái hiện chính xác chuỗi kiểm tra `document.documentElement.style.zoom='2'` từ `qa/e2e/codex_guided_review.mjs` lines 135-137 ghi nhận **0 nút bị clip (clippingCount: 0)**, toàn bộ nút đều nằm trọn vẹn trong `innerWidth <= 391px`.
3. **Hiện trạng & Bàn giao:** Toàn bộ bằng chứng trực quan (`desktop_1440x1024_initial.png`, `desktop_1440x1024_tour.png`, `side_by_side_comparison.png`, `overlay_diff.png`, `mobile_390x844.png`, `mobile_390x844_zoom200.png`) và file `evidence.json` đã được tái tạo hoàn chỉnh. Không chỉnh sửa backend, contracts, biến môi trường hay động chạm tới các cổng điều phối (3060/8060/8080).

---

## 2. Bảng kết quả kiểm định tự động (50/50 PASS)

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
| 29 | `TIMELINE_PROVENANCE_LABELS` | Lộ trình chứa đủ "theo nguồn", "ước tính", "nguồn ghi" và dị ứng | **PASS** | `hasTheoNguon: true, hasUocTinh: true, hasNguonGhi: true, hasAllergySafe: true` |
| 30 | `VISIBLE_PRICE_AND_LEG_PILLS` | Giá và chặng ước tính hiển thị trực quan (visible, not sr-only) | **PASS** | 5 pills hiển thị rõ ràng trên DOM với giá và số phút chặng |
| 31 | `DARK_CTA_TIMELINE_PRESENT` | Thẻ Dark CTA trong timeline min-height 150px (thực tế 181px với văn bản minh bạch) | **PASS** | `y: 743px, height: 181px, btnHeight: 44px, btnWidth: 391px` |
| 32 | `GOOGLE_MAPS_CTA` | Nút CTA dẫn đường Google Maps đi bộ miễn phí | **PASS** | URL hợp lệ `travelmode=walking`, focus tự động |
| 33 | `GOOGLE_MAPS_DISCLOSURE` | Minh bạch liên kết ngoài miễn phí, không API trả phí | **PASS** | Đoạn text minh bạch hiện diện rõ ràng |
| 34 | `REPLACE_MODAL_OPENS` | Mở hộp thoại đổi quán khi bấm nút Đổi quán | **PASS** | Hộp thoại mở với nút `replace-modal-confirm-btn` |
| 35 | `REPLACE_DIFF_RENDERED` | Máy chủ trả về diff so sánh trước/sau khi đổi quán | **PASS** | Diff hiển thị với nút `replace-modal-done-btn` |
| 36 | `REPLACE_MODAL_COMMITTED` | Đóng hộp thoại đổi quán sau khi hoàn tất xác nhận | **PASS** | Modal đóng sạch sẽ sau khi commit |
| 37 | `STOP_REPLACEMENT_APPLIED` | Cập nhật điểm dừng thực tế trong lịch trình | **PASS** | Điểm dừng 1 đổi từ `[SYNTHETIC] Chè Thử 12` thành `[SYNTHETIC] Kem Thử 24` |
| 38 | `PILOT_MAP_ACTIVE` | Chuyển đổi sang chế độ Bản đồ PMTiles | **PASS** | Canvas `pilot-map-canvas` kích hoạt |
| 39 | `MAP_MARKERS_SYNC` | Số marker bản đồ đồng bộ với số điểm dừng | **PASS** | 3 marker số xuất hiện trên bản đồ nội bộ Hoàn Kiếm |
| 40 | `VIEW_MODE_SCHEMATIC` | Quay trở lại chế độ xem Sơ đồ | **PASS** | Giao diện danh sách điểm dừng khôi phục |
| 41 | `RELOAD_PERSISTENCE` | Tải lại trang (F5) phục hồi đầy đủ tour | **PASS** | Phục hồi nguyên vẹn 3 điểm dừng, không cướp focus |
| 42 | `MOBILE_ZERO_OVERFLOW` | Kiểm tra mobile 390px không tràn ngang | **PASS** | `scrollWidth: 390, rootScrollWidth: 390` (0px tràn) |
| 43 | `MOBILE_TAB_CHAT` | Tab Khám phá trên mobile hiển thị khung chat | **PASS** | Khung chat active, không bị ẩn |
| 44 | `MOBILE_TAB_TOUR` | Tab Lịch trình trên mobile hiển thị cột tour | **PASS** | Cột tour active, hiển thị rõ ràng |
| 45 | `MOBILE_ZOOM_200_NO_CLIPPING` | Tái hiện CSS zoom 200% ở viewport 390px không bị clip nút | **PASS** | `clippingCount: 0`, toàn bộ buttons nằm trọn trong `innerWidth` |
| 46 | `CONTRAST_CHAT_TEXT` | Độ tương phản chữ chat chính (#231815/#FFFEFA) | **PASS** | **17.16:1** (đo từ DOM, vượt chuẩn AAA ≥ 7.0:1) |
| 47 | `CONTRAST_SIDEBAR` | Độ tương phản thanh bên (#FFFFFF/#702914) | **PASS** | **10.42:1** (đo từ DOM, vượt chuẩn AAA ≥ 7.0:1) |
| 48 | `CONTRAST_CTA_BUTTON` | Độ tương phản nút CTA kem nhạt (#231815/#FAF4EE) | **PASS** | **15.86:1** (đo từ DOM, vượt chuẩn AAA ≥ 7.0:1) |
| 49 | `CONTRAST_DARK_CTA` | Độ tương phản thẻ CTA tối (#FFFFFF/#312820) | **PASS** | **14.43:1** (đo từ DOM, vượt chuẩn AAA ≥ 7.0:1) |
| 50 | `CONTRAST_FILTER_CHIP` | Độ tương phản chip lọc (#4A352F/#F7F2EE) | **PASS** | **10.26:1** (đo từ DOM, vượt chuẩn AA ≥ 4.5:1) |

---

## 3. Phân tích chi tiết 3 phát hiện từ Codex Review

### 3.1. Vấn đề 1: Lỗi clip nút điều khiển khi CSS zoom 200% ở viewport 390px
- **Hiện tượng ban đầu:** Khi thực hiện phóng to `document.documentElement.style.zoom='2'` trên màn hình di động 390px, thanh công cụ header cột tour và hàng nút thao tác điểm dừng bị cố định không cho phép xuống dòng (`flex-wrap: nowrap`). Kết quả là nút `pilot-map-toggle` bị đẩy sang toạ độ `right = 422px` và các nút `stop-replace-btn-0/1/2` bị đẩy sang toạ độ `right = 427px`, vượt khỏi chiều rộng màn hình 390px.
- **Biện pháp khắc phục:**
  - Bổ sung `flex-wrap: wrap; gap: 8px;` cho `.nn-tour-col-header`, điều chỉnh kích thước chữ tiêu đề `.nn-tour-heading` trên di động thành `font-size: 20px; line-height: 26px; word-break: break-word;` và gán `flex-shrink: 0;` cho `.nn-view-mode-toggle`.
  - Bổ sung `flex-wrap: wrap; gap: 6px;` cho `.nn-stop-stage-row` và `.nn-stop-actions`, cho phép nút `stop-replace-btn` tự động xuống dòng an toàn khi chiều ngang bị thu hẹp do phóng to 200%.
- **Kết quả đo lường thực tế:** Kiểm tra `MOBILE_ZOOM_200_NO_CLIPPING` ghi nhận `clippingCount: 0`, không còn bất kỳ nút nào vượt quá giới hạn 391px.

### 3.2. Vấn đề 2: Dữ liệu giá và thông tin chặng bị giấu trong `.nn-sr`
- **Hiện tượng ban đầu:** Các thông tin giá tham khảo theo nguồn và thời gian di chuyển chặng ước tính (`metaDisplay`) bị đóng gói trong `<div className="nn-timeline-pills nn-sr">`. Điều này khiến người dùng mắt thường không nhìn thấy giá và khoảng cách/thời gian di chuyển giữa các điểm dừng.
- **Biện pháp khắc phục:**
  - Khôi phục hàng hiển thị trực quan `.nn-stop-meta-line`: hiển thị thẻ giá nhỏ gọn `nn-meta-pill` mang nhãn `🏷️ Khoảng giá ≈... (theo nguồn)` hoặc `giá theo nguồn: chưa rõ` (bảo toàn trung thực khi thiếu dữ liệu giá) và thẻ di chuyển `🚶 ~... phút (ước tính)` (bảo toàn `0 phút` khi hai điểm liền kề).
  - Định dạng thẩm mỹ editorial tinh tế: chiều cao nhỏ gọn 24px, màu nền kem `#F7F2EE`, viền `#EAE2D9`, chữ `#5C4740`, không làm thô hay phá vỡ cấu trúc thẻ điểm dừng Figma 1:145.
- **Kết quả đo lường thực tế:** Kiểm tra `VISIBLE_PRICE_AND_LEG_PILLS` xác nhận 100% các thẻ giá và chặng di chuyển đều có `visible: true` và hiển thị rõ ràng trên màn hình.

### 3.3. Vấn đề 3: Từ ngữ xuất xứ nguồn giờ mở cửa (Provenance Wording)
- **Hiện tượng ban đầu:** Kiểm tra sự hiện diện của từ ngữ xuất xứ trong văn bản lộ trình yêu cầu có đầy đủ cụm từ `"nguồn ghi"`, `"theo nguồn"`, và `"ước tính"`.
- **Biện pháp khắc phục:**
  - Chuẩn hoá câu mô tả giờ mở cửa: `stop.hours?.display ? ' · nguồn ghi giờ mở cửa: ' + stop.hours.display : ' · giờ mở cửa theo nguồn: chưa rõ'`.
  - Kết hợp với thẻ giá `... (theo nguồn)` và thẻ chặng `... (ước tính)`, toàn bộ văn bản lộ trình đáp ứng đầy đủ và tự nhiên cả 3 tiêu chí xuất xứ mà không cần thêm văn bản ẩn nhân tạo.
- **Kết quả đo lường thực tế:** Kiểm tra `TIMELINE_PROVENANCE_LABELS` ghi nhận `hasTheoNguon: true, hasUocTinh: true, hasNguonGhi: true, hasAllergySafe: true`.

---

## 4. Bằng chứng trực quan (Artifacts)

Tất cả các file bằng chứng kiểm định nằm tại thư mục `qa/figma-warm-editorial/`:
1. `desktop_1440x1024_initial.png`: Ảnh chụp màn hình khởi đầu với nhịp điệu dọc chuẩn xác, dữ liệu rỗng trung thực và gợi ý bàn phím.
2. `desktop_1440x1024_tour.png`: Ảnh chụp màn hình hoàn chỉnh sau khi lập tour, hiển thị rõ ràng giá và chặng ước tính.
3. `side_by_side_comparison.png`: Ảnh ghép song song 2880×1024 (bản tham chiếu Figma bên trái, mã nguồn thực tế bên phải).
4. `overlay_diff.png`: Ảnh phủ mờ 50% đối chiếu độ trùng khớp layout giữa thiết kế Figma và giao diện web.
5. `mobile_390x844.png`: Ảnh chụp giao diện di động 390px ở kích thước chuẩn, chứng minh không bị tràn ngang (0px overflow).
6. `mobile_390x844_zoom200.png`: Ảnh chụp giao diện di động 390px khi bật CSS zoom 200%, chứng minh toàn bộ nút điều khiển wrap an toàn, không bị clip khỏi màn hình.
7. `evidence.json`: File JSON ghi nhận toàn bộ 50 chỉ số runtime và giá trị tính toán độ tương phản trực tiếp từ DOM.

---

## 5. Giới hạn & Tuân thủ kỹ thuật (Limitations & Compliance)

- **Vùng cuộn tự nhiên vs Cảnh báo an toàn:** Trong Figma tĩnh Frame 1:145, các thẻ được xếp vừa khít không có thanh cuộn vì không có các dòng thông báo động. Trên ứng dụng thực tế, khi có các cảnh báo an toàn dị ứng (Allergy Disclaimer) hoặc minh bạch Google Maps, `.nn-tour-content-scroll` cho phép cuộn tự nhiên để đảm bảo người dùng luôn đọc được đầy đủ thông tin an toàn thay vì bị cắt xén hoặc ép nhỏ chữ quá mức.
- **Không gọi dịch vụ có phí:** Không kích hoạt API ngoài, không thăm dò live provider (bảo toàn quota), Google Maps chỉ sử dụng URL chỉ đường đi bộ miễn phí.
- **Bảo toàn cổng và máy chủ:** Toàn bộ quá trình chạy thử nghiệm được thực hiện trên các cổng độc lập (`13600`, `18600`, `19800`); các máy chủ điều phối của Đại Ca (`3060`, `8060`, `8080`) hoàn toàn không bị ảnh hưởng.
