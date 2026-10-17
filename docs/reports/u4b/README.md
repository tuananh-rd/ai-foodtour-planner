# Bằng chứng giao diện Giao diện Dẫn dắt (Guided UI - Task U4b)

Tài liệu này thuyết minh 14 ảnh chụp màn hình thực tế (trên cả hai độ phân giải Desktop 1280x800 và Mobile 390x844) được ghi nhận tự động bằng trình duyệt thật qua CDP trong bộ kiểm thử `qa/e2e/test_guided_e2e.mjs` chạy cùng backend FastAPI thực tế và Next.js production build.

---

## Danh mục 14 ảnh chụp màn hình

### 1. Màn hình khởi đầu (Start Screen)
- **Desktop (1280px):** `01_start_screen_1280.png`
- **Mobile (390px):** `01_start_screen_390.png`
- **Mô tả:** Giao diện mở đầu tinh gọn, không gây choáng ngợp. Gồm thanh tiêu đề nhận diện, khung nhập văn bản mở rộng tự nhiên và 4 gợi ý nhanh (chips) có chiều cao cảm ứng đạt chuẩn $\ge 44\text{px}$. Chân trang có dòng tin cậy trung thực duy nhất và nút "Chi tiết" giải thích nguồn dữ liệu.

### 2. Thẻ "Mình hiểu là…" & Câu hỏi phạm vi ngân sách
- **Desktop (1280px):** `02_understood_scope_1280.png`
- **Mobile (390px):** `02_understood_scope_390.png`
- **Mô tả:** Sau khi người dùng gửi câu mở đầu (S0), thẻ "Mình hiểu là…" ngay lập tức hiển thị có cấu trúc tất cả các thông tin đã trích xuất: Khu vực (Hồ Gươm), Số người (2), Số quán (3), Tổng thời gian (120 phút), Buổi (Buổi tối), Thích (phở, bún chả), Dị ứng (đậu phộng) và ghi chú an toàn dị ứng điềm tĩnh. Chỉ có duy nhất 1 câu hỏi làm rõ hiển thị tại một thời điểm: làm rõ ngân sách 500k là "Mỗi người" hay "Cả nhóm" kèm 2 chip chọn nhanh. Tuyệt đối không hiển thị lộ trình hay gọi planner trước khi xác nhận.

### 3. Làm rõ giờ bắt đầu (Start Time Chips)
- **Desktop (1280px):** `03_time_chips_1280.png`
- **Mobile (390px):** `03_time_chips_390.png`
- **Mô tả:** Sau khi chọn phạm vi ngân sách, hệ thống chuyển tiếp mượt mà sang câu hỏi làm rõ giờ bắt đầu phù hợp với buổi tối kèm 3 gợi ý nhanh ("18:00", "19:00", "20:00") và ô nhập giờ tuỳ ý.

### 4. Lựa chọn phương tiện di chuyển (Vehicle Chips)
- **Desktop (1280px):** `04_vehicle_chips_1280.png`
- **Mobile (390px):** `04_vehicle_chips_390.png`
- **Mô tả:** Nhập "19h", hệ thống hiểu ngay và đưa ra câu hỏi về phương tiện với 4 lựa chọn: "Đi bộ", "Xe máy", "Ô tô", "Taxi/Grab".

### 5. Đề xuất quán sơ bộ (Venue Proposals)
- **Desktop (1280px):** `05_venue_proposals_1280.png`
- **Mobile (390px):** `05_venue_proposals_390.png`
- **Mô tả:** Sau khi chọn "Đi bộ", giao diện hiển thị 3 thẻ quán ứng viên phù hợp với sở thích và bán kính đi bộ, kèm nút hành động nhanh "Dùng những quán này" để người dùng không phải gõ phím.

### 6. Thẻ tóm tắt xác nhận (Confirm Summary Card)
- **Desktop (1280px):** `06_confirm_card_1280.png`
- **Mobile (390px):** `06_confirm_card_390.png`
- **Mô tả:** Toàn bộ thông số tour được cô đọng trong thẻ xác nhận cuối cùng với đúng 2 lựa chọn rõ ràng: nút chính "Đúng, lập tour" và nút phụ "Sửa". Cổng kiểm soát (Gate 1) tiếp tục được giữ vững: lộ trình tour vẫn chưa được render cho tới khi người dùng bấm xác nhận.

### 7. Lịch trình hoàn tất & Liên kết Google Maps miễn phí (Tour Ready)
- **Desktop (1280px):** `07_tour_timeline_maps_1280.png`
- **Mobile (390px):** `07_tour_timeline_maps_390.png`
- **Mô tả:** Sau khi bấm xác nhận, lộ trình 3 quán chính thức được tạo và hiển thị trực quan. Mọi thông tin đều gắn nhãn trung thực ("giá theo nguồn", "đi bộ ước tính", "giờ mở cửa theo nguồn ghi"), kèm cảnh báo an toàn dị ứng đậu phộng. Nút hành động chính là liên kết mở Google Maps trực tiếp (`https://www.google.com/maps/dir/...`) không dùng Google API key, không phát sinh chi phí hay vi phạm quyền riêng tư.

---

## Chỉ số đo lường trải nghiệm người dùng (Usability Metrics)
- **Thời gian phản hồi lượt đầu (Time-to-first-reply):** $\sim 1.013\text{ms} - 1.444\text{ms}$ (hoàn thành phản hồi trong vòng dưới 1.5 giây).
- **Số thao tác tới bản đồ:** Đúng 7 thao tác người dùng (nhập văn bản ban đầu $\rightarrow$ chọn ngân sách cả nhóm $\rightarrow$ nhập 19h $\rightarrow$ chọn đi bộ $\rightarrow$ dùng quán đề xuất $\rightarrow$ bấm đúng lập tour $\rightarrow$ mở Google Maps), nằm gọn trong ngân sách tối đa $\le 8$ thao tác theo quy định.
- **Tính trọn vẹn di động:** Ở độ rộng $390\text{px}$, không xuất hiện bất kỳ thanh cuộn ngang nào (`scrollWidth <= clientWidth`), các nút bấm và chip đều đạt chiều cao tối thiểu $\ge 44\text{px}$.
