# Báo cáo Triển khai Giao diện & Kiểm thử Độc lập — NgonNgon Tour

**Ngày:** 18/10/2026  
**Tác giả & Độc lập QA:** Antigravity (Frontend Implementer & Independent QA)  
**Điều phối & Trưởng nhóm:** Codex Lead (gpt-6.1-sol)  
**Mã commit cơ sở được kiểm thử (Tested Base Commit):** `01d13ec` (đồng bộ hoàn tất từ coordinator tip: bao gồm `6415d61` an toàn dị ứng trước tour, `ac05fc8` cô lập preview cache, `702ae37` biên bản tích hợp và `01d13ec` tinh chỉnh khóa điểm dừng)  
**Thiết kế tham chiếu:** `D:/Downloads/UI ngonngon tour.svg` & `docs/design/ngonngon-tour-reference.png`  
**Trạng thái rà soát:** **Đã đóng hoàn tất toàn bộ 9 điểm phản hồi (NFE-01..09) trong `CODEX_N_FRONTEND_REVIEW.md` với bằng chứng kiểm thử thực tế.**

---

## 1. Tóm tắt Thay đổi & So sánh Trực quan với Thiết kế SVG

Ứng dụng đã chuyển đổi hoàn toàn sang giao diện chuẩn thiết kế NgonNgon Tour (màu nền ngà ấm `#F7F8F2`, xanh rừng đậm `#166B52`, cam điểm nhấn `#FF6B4A`, thẻ bo tròn 16–24px, hệ font có chân hệ thống, phân cột hai bên desktop 1440px và responsive chuẩn 390px trên thiết bị di động):

| Khía cạnh thiết kế | Thiết kế SVG gốc (`UI ngonngon tour.svg`) | Triển khai Frontend Thực tế (`6415d61`) |
|---|---|---|
| **Header (Đầu trang)** | Logo NgonNgon Tour, slogan "Ăn ngon • Đi đúng gu", các tab "Khám phá", "Lịch trình", avatar người dùng | Header 80px cố định, thương hiệu chuẩn, nút bấm tab ≥44px chuyển đổi/cuộn, avatar ẩn danh "Khách ẩm thực • Hà Nội" (trung thực, không tạo tài khoản giả). Trên mobile 390px, header tự động ngắt dòng gọn gàng, không bị tràn chiều ngang. |
| **Cột trái (Tương tác)** | Thẻ trợ lý Măm Măm, 4 gợi ý nhanh Phố Cổ, dòng trò chuyện câu hỏi & câu trả lời, thanh nhập gắn chân có nút gửi cam | Thẻ Măm Măm bo tròn 24px, chip gợi ý nhanh, UnderstoodCard hiển thị tiêu chí và dị ứng, thẻ hỏi ClarifyCard từng câu hỏi một, thanh nhập kèm nút gửi cam `#FF6B4A`, chỉ báo tải lịch sự (`aria-busy`). |
| **Cột phải (Lịch trình)** | Tiêu đề tour, 3 thẻ chỉ số (số quán, cự ly km, ngân sách), lộ trình các điểm dừng, nút mở Google Maps, mẹo nhỏ | Tiêu đề tour trung thực theo dữ liệu thật, 3 thẻ chỉ số động (không gán cứng 1.8km hay 450k), lộ trình timeline thẻ rời kèm viên thuốc giờ xanh lá (`#166B52`), nhãn khóa quán, cảnh báo dị ứng rõ ràng, nút mở Google Maps walking URL chuẩn (0 API), lưu ý giờ/giá trung thực. |
| **Trạng thái Trống (Honest Empty)** | SVG minh họa khi đã có lịch trình | Hiển thị bảng hướng dẫn 3 bước trung thực khi chưa tạo tour: không vẽ lộ trình giả định trước khi người dùng xác nhận điều kiện; chỉ số header giữ trạng thái chưa khởi tạo (null / "—"). |
| **Di động (Mobile 390px)** | Cần thích ứng màn hình dọc hẹp | Thanh điều hướng linh hoạt giữa 2 nút "Khám phá" và "Lịch trình" (minHeight ≥ 44px), hiển thị đơn cột rõ ràng, `clientWidth === 390px`, `scrollWidth <= 390px` (zero horizontal overflow across all states). |

---

## 2. Chi tiết Đóng các Điểm Đánh giá (NFE-01 đến NFE-09)

| Mã ID | Mức độ | Yêu cầu rà soát từ Codex Lead | Bằng chứng khắc phục & Kết quả kiểm thử trên `6415d61` |
|---|---|---|---|
| **NFE-01** | P1 | Giữ nguyên null/zero cho giờ đến, cự ly, ngân sách; không gán cứng 20:30, Thứ bảy, Hoàn Kiếm, 1.8 km, 450k; phân biệt trần ngân sách với giá món ăn theo quán. | Đã loại bỏ toàn bộ giá trị mẫu: phụ đề tour hiển thị giờ thực tế `19:04–20:55 • Hoàn Kiếm` (hoặc linh hoạt), cự ly tính theo mét thực tế (`tour.totals.distance_m`), ngân sách hiển thị theo trần mong muốn (`≈ 500K / cả nhóm`). Đạt 100% kiểm tra `NFE-01`. |
| **NFE-02** | P1 | Xử lý mã 409 trong đổi quán: phân biệt xung đột phiên bản (`revision_conflict`) với hết ứng viên (`no_candidates`) hoặc câu hỏi còn mở (`obligation_open`). | Đã kiểm thử thực tế cả 3 trường hợp: (1) `no_candidates` đóng modal, giữ nguyên tour cũ kèm thông báo "Không có quán thay thế thoả các ràng buộc. Lịch trình hiện tại được giữ nguyên."; (2) Đổi quán thành công hiển thị diff và đánh dấu khóa (locks) cho các điểm dừng còn lại; (3) Sửa đổi đồng thời mở nghĩa vụ dị ứng (`obligation_open`) gây 409 khi đổi quán: giao diện tự động đồng bộ lại phiên, đóng modal cũ, và hiển thị câu hỏi an toàn dị ứng mới lên trước lịch trình được giữ lại. |
| **NFE-03** | P2 | Minh bạch AI & Dữ liệu: Nêu rõ Gemini được gọi có điều kiện; phiên làm việc chỉ lưu tạm thời theo phiên ẩn danh; nguồn dữ liệu thể hiện đúng chế độ chạy (synthetic / thử nghiệm cục bộ). | Dòng chữ tóm tắt: "Dữ liệu quán từ Foody • giờ & giá theo nguồn ghi • khoảng cách ước tính". Modal chi tiết nêu rõ văn bản yêu cầu có thể gửi ẩn danh đến Google Gemini, phiên lưu tạm thời không lưu danh tính cá nhân, và nguồn dữ liệu thể hiện đúng `Dữ liệu tổng hợp (synthetic), chỉ để kiểm thử`. |
| **NFE-04** | P2 | Quản lý tiêu điểm modal: Bẫy tiêu điểm (Tab/Shift+Tab), đóng bằng Escape và trả tiêu điểm về nút kích hoạt; cô lập hộp thoại ngoài cây nền bị trơ (`inert` / `aria-hidden`); hỗ trợ cuộn dọc trên di động. | Đã chuyển `ReplaceDiffModal` và `TrustDisclosure` sang cơ chế `createPortal(..., document.body)`. Kiểm thử khẳng định `dialog.closest('[inert]') === null` và `dialog.closest('[aria-hidden="true"]') === null`, trong khi `[data-testid="guided-container"]` nhận `aria-hidden="true"` và `inert`. Phím Tab giữ tiêu điểm trong hộp thoại, phím Escape đóng hộp thoại và trả tiêu điểm về đúng nút kích hoạt. |
| **NFE-05** | P2 | Nguồn gốc tiêu chí (provenance) & phục hồi câu hỏi: Dữ liệu suy luận (`inferred`) hoặc mặc định (`default`) không bị đổi thành `user`; phục hồi đúng câu hỏi số lượng/ngân sách động (150k, 300k, 1m, v.v.). | `profileToUnderstoodItems` giữ nguyên `.source`; `UnderstoodCard` hiển thị nhãn `(suy luận)` cho thời gian mỗi quán; kiểm thử tự động xác nhận câu hỏi ngân sách động phục hồi chính xác cho các mức `150.000 đ`, `300.000 đ`, `500.000 đ` và `1.000.000 đ`. |
| **NFE-06** | P2 | Bỏ lời khuyên bịa đặt về chỗ ngồi trước 18:30 không có căn cứ. | Đã loại bỏ hoàn toàn lời khuyên 18:30; chỉ hiển thị cảnh báo hoạt động trung thực: "Giờ mở cửa và mức giá thực tế của quán có thể thay đổi tùy thời điểm". |
| **NFE-07** | P2 | Cảnh báo trạng thái bằng tiếng Việt tự nhiên (không in JSON thô); liên kết Google Maps trung thực, hỗ trợ các chặng riêng khi tour từ 4–5 quán; không gọi API/Embed của Google. | Các cảnh báo được hiển thị bằng tiếng Việt rõ nghĩa; liên kết Google Maps sử dụng URL điều hướng đi bộ miễn phí (`travelmode=walking`) không chứa khóa API; kiểm thử mạng độc lập ghi nhận 0 yêu cầu gọi đến máy chủ Google. |
| **NFE-08** | P2 | Bỏ danh tính/tài khoản giả Tuấn trong ứng dụng ẩn danh. | Header hiển thị avatar trung thực `🍜` "Khách ẩm thực • Hà Nội"; lời chào mở đầu chuẩn mực "Chào bạn! Bạn muốn ăn gì, ở đâu, đi mấy người?...". |
| **NFE-09** | P2 | Điều hướng desktop cuộn đến khu vực thực tế; nút tab di động chuyển đổi giao diện với vùng chạm ≥44px và ngữ nghĩa trợ năng. | Trên desktop: nút "Khám phá" và "Lịch trình" cuộn mượt và kích hoạt vùng tương ứng. Trên di động: nút tab "Khám phá" và "Lịch trình" có chiều cao ≥44px, chuyển đổi mượt mà giữa chế độ xem trò chuyện và lịch trình tour, không gây tràn ngang. |

---

## 3. Bằng chứng Ảnh chụp Màn hình (Screenshots)

Toàn bộ 10 ảnh chụp màn hình được tạo lại bằng trình duyệt Chromium thật qua Chrome DevTools Protocol (CDP) trên nền tảng độc lập cô lập (Web: 13200, API: 18200, CDP: 19400) tại thư mục `docs/reports/ngonngon/`:

| Tên tệp ảnh | Độ phân giải | Mô tả trạng thái kiểm chứng |
|---|---|---|
| [desktop_1440_empty.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/ngonngon/desktop_1440_empty.png) | 1440x1024 | Trạng thái ban đầu trung thực: Cột trái nhận yêu cầu, cột phải hướng dẫn 3 bước minh bạch, chỉ số chưa gán giá trị giả. |
| [desktop_1440_clarify.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/ngonngon/desktop_1440_clarify.png) | 1440x1024 | Trạng thái làm rõ: Một câu hỏi ngân sách động 500.000 đ, UnderstoodCard có dị ứng đậu phộng và nhãn suy luận. |
| [desktop_1440_confirmation.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/ngonngon/desktop_1440_confirmation.png) | 1440x1024 | Cổng xác nhận rõ ràng: Thẻ xác nhận tổng hợp, phân biệt trần ngân sách với giá quán, danh sách cảnh báo tiếng Việt. |
| [desktop_1440_tour.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/ngonngon/desktop_1440_tour.png) | 1440x1024 | Lịch trình tour hoàn chỉnh: 3 quán, giờ đến xanh lá (`#166B52`), thẻ timeline riêng biệt, cự ly thực tế, nút mở Google Maps đi bộ. |
| [desktop_1440_replace.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/ngonngon/desktop_1440_replace.png) | 1440x1024 | Hộp thoại đổi quán: Portaled ra ngoài vùng trơ, bẫy tiêu điểm Tab/Escape, hiển thị quy tắc khóa điểm dừng. |
| [mobile_390_empty.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/ngonngon/mobile_390_empty.png) | 390x844 | Giao diện di động trạng thái trống: Chạm bấm ≥44px, clientWidth = 390, scrollWidth = 390 (zero overflow), header ngắt dòng chuẩn. |
| [mobile_390_clarify.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/ngonngon/mobile_390_clarify.png) | 390x844 | Giao diện di động làm rõ: Đơn cột rõ ràng, không tràn ngang, các nút lựa chọn vừa vặn màn hình dọc. |
| [mobile_390_confirmation.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/ngonngon/mobile_390_confirmation.png) | 390x844 | Giao diện di động xác nhận: Toàn bộ thẻ quyết định hiển thị đầy đủ bên dưới header cố định, nút bấm rõ ràng. |
| [mobile_390_tour.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/ngonngon/mobile_390_tour.png) | 390x844 | Giao diện di động xem lịch trình: Kích hoạt tab Lịch trình, hiển thị đơn cột thẻ timeline, cự ly đi bộ rõ ràng. |
| [mobile_390_replace.png](file:///C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-antigravity-web/docs/reports/ngonngon/mobile_390_replace.png) | 390x844 | Hộp thoại đổi quán trên di động: Khả năng cuộn dọc mượt mà trên 390px, nút hành động ≥44px không bị che khuất. |

---

## 4. Kết quả Thực thi Kiểm thử Độc lập

### 4.1. Bộ Kiểm thử Bất biến Hợp đồng Giao diện (`npm --prefix frontend test`)
- **18/18 bài kiểm tra PASS 100%:**
  - GET `/health`
  - GET `/v1/venues` & detail
  - POST `/v1/sessions`
  - POST `/v1/sessions/{id}/messages` (thiếu slot & tạo tour)
  - PUT `/v1/sessions/{id}/preferences` (bắt 409 revision conflict & cập nhật hợp lệ)
  - POST `/v1/sessions/{id}/tour`
  - POST `/v1/sessions/{id}/tour/replace` (xác thực locks bảo toàn quán khác)
  - Ràng buộc ngân sách bất khả thi & chế độ strict mode thiếu bằng chứng
  - GET `/v1/sessions/{id}/tour/maps-links` (Hợp đồng URL Google Maps v1.7)
  - POST `/v1/sessions/{id}/chat` & `getChatState` (Hợp đồng đối thoại v1.8)

### 4.2. Bộ Kiểm tra SSR Render Invariants (`node tools/check_ngonngon_render.cjs`)
- **11/11 bài kiểm tra PASS 100%:**
  - PASS empty understood card does not invent location/time/party defaults
  - PASS confirmation retains [SYNTHETIC] Giờ chưa xác minh
  - PASS confirmation retains [SYNTHETIC] Giá chưa xác minh
  - PASS confirmation retains [SYNTHETIC] Thiếu bằng chứng
  - PASS null timeline never invents 19:00 or five-minute legs
  - PASS conditional status is explicit
  - PASS route warning survives timeline render
  - PASS zero-minute leg remains zero
  - PASS 3-stop Maps links are HTTPS walking URLs without keys
  - PASS 4-stop Maps links are HTTPS walking URLs without keys
  - PASS 5-stop Maps links are HTTPS walking URLs without keys

### 4.3. Kiểm thử Tích hợp Trình duyệt Thực tế (`qa/e2e/test_ngonngon_qa.mjs`)
- Môi trường: Bản dựng Next.js sạch trong thư mục scratch (`NEXT_PUBLIC_API_URL=http://127.0.0.1:18200`), uvicorn backend cổng `18200`, Chrome CDP cổng `19400`.
- Chặn mạng: `--host-resolver-rules=MAP www.google.com ~NOTFOUND, MAP maps.googleapis.com ~NOTFOUND, MAP maps.gstatic.com ~NOTFOUND`.
- Kết quả: **62/62 bài kiểm tra tương tác và hồi quy đạt PASS tuyệt đối (0 lỗi, 0 exception):**
  - Khởi tạo giao diện ẩn danh (NFE-08) và trạng thái trống trung thực (NFE-01).
  - Điều hướng desktop cuộn mượt và kích hoạt vùng tương ứng (NFE-09).
  - Xử lý đối thoại làm rõ, bảo lưu dị ứng, phục hồi câu hỏi ngân sách động (NFE-05).
  - Cổng xác nhận với cảnh báo tiếng Việt và giải thích mức trần ngân sách (NFE-07).
  - Lập lịch trình tour, kiểm tra cự ly/thời gian thực tế và liên kết Google Maps đi bộ miễn phí.
  - Hộp thoại đổi quán: Portaled bên ngoài vùng trơ, bẫy tiêu điểm Tab, đóng bằng Escape/Cancel và hoàn trả tiêu điểm (NFE-04).
  - Bảo toàn lịch trình khi hết ứng viên (`no_candidates`) kèm thông báo rõ ràng (NFE-02).
  - Đổi quán thành công với cơ chế khóa các điểm dừng còn lại (`tour.locks`) (NFE-02).
  - Xung đột phiên bản an toàn khi có sửa đổi dị ứng đồng thời (`obligation_open` / 409): Tự động đồng bộ lại phiên, đóng hộp thoại cũ, khôi phục câu hỏi dị ứng mới lên trước lịch trình và bảo toàn qua tải lại trang (NFE-02).
  - Minh bạch AI và dữ liệu trong TrustDisclosure modal (NFE-03 & NFE-04).
  - Khôi phục câu hỏi ngân sách động cho các mức 150k, 300k, 1 triệu (NFE-05).
  - Kiểm tra hình học di động 390px: `clientWidth === 390px`, `scrollWidth <= 390px` xuyên suốt các trạng thái, chuyển đổi tab Khám phá / Lịch trình với vùng chạm ≥ 44px (NFE-09).
  - Kiểm toán mạng: 0 yêu cầu gọi đến bất kỳ dịch vụ hoặc API trả phí nào của Google.

### 4.4. Bộ Kiểm thử Độc lập từ Coordinator (`tools/review_ngonngon_interactions.mjs`)
- Kết quả kiểm chứng bổ sung của Coordinator trên nhánh `6415d61`: **22/22 PASS**.
- Backend kiểm thử toàn diện: **575 OK / 1 private-CSV skip**.

---

## 5. Giới hạn & Đánh giá Tính trung thực

1. **Dữ liệu cục bộ & Chưa kiểm chứng thực địa:** Toàn bộ thông tin quán ăn, giờ mở cửa và khoảng giá trong nguyên mẫu được lấy từ tập dữ liệu thử nghiệm cục bộ (`venues.chat.synthetic.json`); chưa có bằng chứng thực địa về thành phần chi tiết của món ăn nhằm đảm bảo an toàn dị ứng tuyệt đối. Ứng dụng đã thông báo rõ ràng cho người dùng phải hỏi trực tiếp nhân viên quán trước khi gọi món.
2. **Không triển khai môi trường công khai:** Bản dựng hiện tại phục vụ hoàn toàn cho mục đích nghiệm thu nội bộ trên môi trường cục bộ cô lập, không yêu cầu bất kỳ dịch vụ trả phí, khóa API hay quyền truy cập ngoài luồng nào.
3. **Claude nghỉ ngơi:** Toàn bộ công việc trong phiên thực hiện dưới sự điều phối trực tiếp của Codex Lead và thực thi kiểm thử độc lập bởi Antigravity theo đúng chỉ thị người dùng; Claude được giữ nghỉ ngơi hoàn toàn.
