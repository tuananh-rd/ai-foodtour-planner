# Đánh giá dữ liệu ngày 15/10/2026

## Kết luận: CONDITIONAL GO cho prototype nội bộ

GO cho tìm kiếm, lọc nhóm món, hiển thị nguồn và vị trí, gợi ý khám phá có điều kiện. NO-GO ở trạng thái hiện tại cho cam kết tour đúng ngân sách mỗi người, đúng giờ mở cửa hoặc thời gian di chuyển. Chưa đủ điều kiện phát hành thương mại bộ dữ liệu.

Đường dẫn yêu cầu `/mnt/data/restaurants_enriched (1).csv` không tồn tại trên máy Windows của phiên Work. Đã phân tích đúng bản đính kèm **restaurants_enriched (1).csv** do `read_thread` trả về tại `C:\Users\tuana\AppData\Local\Temp\codex-file-preview-fahJf3\restaurants_enriched (1).csv`; không dùng restaurants.csv cũ. Không thể khẳng định hai đường dẫn có nội dung giống nhau nếu chưa có mã băm của tệp /mnt/data. SHA-256 bản thực tế: `7af0b2a23dbbe6ed41e8bdc38237f054d6c3f911d23e106f99f3c58cc96e3c14`. Báo cáo máy đọc và toàn bộ schema: [audit.json](audit.json).

## Kết quả đo thực tế

- 46.423 byte; UTF-8 đọc strict thành công, không BOM; CSV 36 bản ghi dữ liệu và 43 cột. Không có hàng lệch số trường khi parse CSV. Số bản ghi không phải số dòng vật lý.
- Không thiếu tên, địa chỉ, ID, source URL, thành phố, quận, lat/lon. Không trùng ID, URL, cặp tên–địa chỉ hay cặp tọa độ theo so sánh chuẩn hóa NFC/trim/casefold. Chưa kiểm chứng trùng thực thể bằng khảo sát; tên khác nhau vẫn có thể cùng quán.
- 36/36 tọa độ nằm trong miền hợp lệ toàn cầu và vùng Hà Nội: lat 20.9641718–21.056988; lon 105.7718147–105.8740686. `geo_status=ok` chỉ là nhãn của pipeline nguồn; chưa chứng minh điểm ở đúng cửa quán, đúng đường đi bộ, hoặc còn hoạt động. Không có nguồn geocoding/độ chính xác riêng.
- Tất cả thuộc Hà Nội, phân bố 10 nhãn quận của nguồn: Hai Bà Trưng 6, Cầu Giấy 6, Đống Đa 5, Hoàn Kiếm 4, Long Biên 3, Thanh Xuân 3, Ba Đình 3, Hà Đông 3, Hoàng Mai 2, Tây Hồ 1. Các nhãn quận phải giữ dạng raw, không mặc nhiên coi là đơn vị hành chính hiện hành.
- Phân loại: Quán ăn 17; Café/Dessert 8; Nhà hàng 5; Shop Online 2; Ăn vặt/vỉa hè 3; nhãn kết hợp Ăn vặt/vỉa hè | Quán ăn 1. Loại hai Shop Online khỏi tour ghé trực tiếp. Mẫu nhỏ, rải rộng, có chuỗi café: chưa đại diện ẩm thực địa phương hay bảo đảm đủ cụm quán đi bộ.
- Có dish_groups ở 36/36, 49 nhãn nhóm món; đây là taxonomy của nguồn, không phải menu, món còn bán hoặc bằng chứng nguyên liệu. Có Bún 10 quán, Ăn vặt–Ăn nhẹ 10, Cơm 9; chỉ 1 nhãn Phở. Thiếu cuisine_styles 3, audiences 5. Không suy luận món cụ thể từ tên quán; không suy luận chay/halal/dị ứng từ taxonomy.
- Giá chuẩn hóa có ở 35/36, khoảng cực trị 5.000–500.000 VND. Cơm Tấm Minh Nhật – Tây Sơn (1252693) có raw 0/0, `unknown_zero`, norm null: không được hiểu là miễn phí. Cột price_semantics xác nhận đây là khoảng giá quán, không bảo đảm giá món/chi phí mỗi người. Không cộng khoảng này rồi gọi là ngân sách chắc chắn; prototype chỉ hiển thị tổng cận trên tham khảo.
- 36/36 có giờ raw JSON và giờ hiển thị, nhưng **36/36 `day_mapping_unknown`, tất cả day code `[4]`**. Không gán 4 thành thứ Năm hay áp dụng cho cả tuần. `00:00–23:59` cũng chưa chứng minh mở 24/7. Cần xác minh quy ước mã ngày, lịch tuần đầy đủ, nghỉ lễ, qua đêm, giờ bếp đóng.
- Thiếu prep_time 4, capacity 4, holiday 4; thời gian chuẩn bị không phải thời gian ăn hay chờ thực tế. Rating 1–9,5 trên thang 10, review_count 1–485: không so ngang với thang 5, cần giảm trọng số quán ít đánh giá. Thiếu điểm thành phần 4–7 dòng tùy cột. amenities_no trống 36/36; amenities_unknown không phải false. amenities_yes thiếu 3.
- Tất cả URL nguồn Foody, fetched_at từ 2026-10-15 04:34:28 đến 04:36:13 UTC (11:34–11:36 giờ Việt Nam). fetched_at là thời điểm lấy, không phải thời điểm quán cập nhật. Không có bằng chứng giấy phép tái sử dụng, raw response hash, parser version hay lịch sử xác minh từng trường.

## Điều kiện mở gate

1. Xác minh trực tiếp tối thiểu một cụm 10–15 quán ghé được; tọa độ tại lối vào, trạng thái hoạt động, món/khẩu phần/giá và thời điểm kiểm tra. Đây là tiêu chí pilot đề xuất, không phải thống kê hiện có.
2. Lấy lịch ngày có căn cứ; trường chưa biết tiếp tục null/unknown. Khi không đủ bằng chứng trả insufficient_evidence hoặc đề nghị người dùng tự xác nhận.
3. Bổ sung giá món và đơn vị giá (món, suất, người), phụ phí, bằng chứng và hạn sử dụng; dietary/allergen cần xác minh riêng. Có budget buffer do người dùng chọn, không biến buffer thành bảo đảm.
4. Dùng ma trận thời gian/đường đi theo mode từ nhà cung cấp được phép sử dụng; đường chim bay chỉ để lọc ứng viên, không làm ETA hay polyline tuyến đường.
5. Xác lập quyền sử dụng nguồn trước khi công khai dữ liệu; có quy trình sửa/xóa và ngừng phát hành khi quyền sử dụng bị thu hồi.

## Rủi ro nguồn và giấy phép

Đã kiểm tra trang chính thức [Thỏa thuận sử dụng Foody](https://www.foody.vn/thoa-thuan-su-dung) và [Quy định sử dụng](https://www.foody.vn/dieu-khoan-su-dung). Điều khoản nói đến quyền sở hữu trí tuệ, giới hạn truy cập và quyền từ chối dịch vụ; không thể suy ra giấy phép tái phân phối CSV chỉ vì trang công khai. Cần đối chiếu điều khoản với cách crawler đã thu thập và có quyền cho việc lưu trữ, hiển thị, enrichment, sử dụng thương mại. Ghi nguồn không thay cho quyền sử dụng. Không vượt kiểm soát truy cập; robots.txt không tự cấp giấy phép. Không đưa ảnh/review nguyên văn vào sản phẩm khi chưa có quyền. Cân nhắc dữ liệu do quán tự xác nhận hoặc nguồn có giấy phép rõ; mỗi nguồn giữ attribution và điều kiện riêng. Đây là đánh giá rủi ro vận hành, không phải kết luận pháp lý về việc thu thập đã diễn ra.
