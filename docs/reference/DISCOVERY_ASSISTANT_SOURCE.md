# Báo cáo định hướng tích hợp API AI cho AI FoodTour Planner

**Phạm vi:** Ứng dụng web trên máy tính, dữ liệu quán tại Hà Nội.  
**Mục đích:** Thống nhất vai trò của AI, Backend và Planner để đội phát triển triển khai.

## 1. Định hướng chung

API AI đảm nhiệm việc trò chuyện, hiểu nhu cầu, điều phối công cụ và giải thích kết quả. Backend quản lý dữ liệu, trạng thái và các phép tính. Planner kiểm tra tính khả thi và lập lộ trình.

Luồng trải nghiệm thống nhất:

**Xác định vị trí → trò chuyện khám phá món → tìm và so sánh quán → chọn quán vào danh sách → xác nhận → tạo lịch trình.**

Người dùng có thể trò chuyện để khám phá mà chưa cần lập tour. Hệ thống chỉ tạo lịch trình khi người dùng xác nhận rõ và đã có đủ thông tin cần thiết.

## 2. Các nhiệm vụ sử dụng API AI

| Nhiệm vụ | Yêu cầu thực hiện |
|---|---|
| Hiểu câu chat | Trích xuất địa điểm, thời gian, số người, ngân sách, phương tiện, món muốn ăn, khẩu vị và ràng buộc. |
| Nhận diện ý định | Phân biệt tìm món, tìm quán, so sánh, thêm/bỏ quán, sửa yêu cầu và tạo lịch trình. |
| Hỏi thông tin thiếu | Chỉ hỏi những thông tin cần cho bước tiếp theo; không hỏi lại dữ liệu đã xác nhận. |
| Tư vấn món | Đề xuất theo khu vực, thời điểm, thời tiết nếu có và nhu cầu của nhóm. |
| Điều phối công cụ | Gọi các chức năng Backend để lấy dữ liệu hoặc yêu cầu thực hiện hành động. |
| So sánh và giải thích | Diễn đạt ưu/nhược điểm từ dữ liệu trả về; chỉ rõ thông tin chưa có. |
| Hiểu yêu cầu chỉnh sửa | Xác định đúng quán hoặc điều kiện cần thay đổi, giữ lại các yêu cầu còn hiệu lực. |
| Trình bày lịch trình | Giải thích kết quả do Planner tạo, gồm thứ tự, thời gian, chi phí và các điểm chưa được xác minh. |

AI có thể giới thiệu kiến thức chung về món ăn. Khi gắn một món với quán cụ thể, đưa giá hoặc thông tin phục vụ, phải có dữ liệu nguồn tương ứng.

## 3. Phân chia trách nhiệm

| Thành phần | Trách nhiệm |
|---|---|
| Frontend — Next.js | Hiển thị chat, vị trí, card quán, bảng so sánh, danh sách food tour, bản xác nhận, timeline và bản đồ. |
| Backend — FastAPI | Quản lý phiên, hồ sơ yêu cầu, dữ liệu quán, danh sách lựa chọn, kiểm tra hành động, tính chi phí và tích hợp API ngoài. |
| PostgreSQL/PostGIS | Lưu dữ liệu quán, tọa độ, nguồn, thời điểm cập nhật; hỗ trợ tìm theo vị trí. |
| AI — LLM tool calling | Hiểu ngôn ngữ, hỏi bổ sung, chọn công cụ và diễn đạt thông tin. |
| Planner | Lọc ràng buộc, sắp thứ tự, tính thời gian, kiểm tra ngân sách và trả các xung đột. |
| Dịch vụ ngoài | Cung cấp định vị địa chỉ, tuyến đường và thời tiết theo khả năng của dịch vụ được chọn. |

AI đưa ra yêu cầu hành động; Backend kiểm tra trước khi thực hiện. Ví dụ, yêu cầu thêm quán phải có ID hợp lệ và quán phải tồn tại trong dữ liệu.

## 4. Các công cụ cần cung cấp cho AI

Tên dưới đây là tên chức năng đề xuất; đội Backend và AI thống nhất cấu trúc đầu vào/đầu ra trước khi triển khai.

| Công cụ | Chức năng |
|---|---|
| `search_restaurants` | Tìm quán theo vị trí, món, mức giá và ràng buộc. |
| `get_restaurant_details` | Lấy chi tiết quán, nguồn, thời điểm cập nhật và dữ liệu còn thiếu. |
| `compare_restaurants` | Trả dữ liệu so sánh giữa các quán theo tiêu chí được yêu cầu. |
| `update_preferences` | Cập nhật hồ sơ nhu cầu của phiên. |
| `update_foodtour_selection` | Thêm, bỏ, thay hoặc đánh dấu giữ một quán. |
| `get_weather` | Lấy thời tiết theo tọa độ và thời điểm được hỗ trợ. |
| `create_itinerary` | Tạo lịch trình sau bước xác nhận. |
| `revise_itinerary` | Tính lại lịch trình khi yêu cầu hoặc lựa chọn thay đổi. |

Kết quả công cụ cần phân biệt rõ: có dữ liệu, không tìm thấy, thiếu dữ liệu và lỗi dịch vụ. AI không được diễn giải lỗi công cụ thành kết luận “không có quán”.

## 5. Quản lý trạng thái hội thoại

Backend lưu hồ sơ phiên, gồm:

- Vị trí hiện tại, khu vực khám phá và điểm xuất phát.
- Ngày, giờ bắt đầu, thời lượng hoặc giờ kết thúc.
- Số người và nhu cầu của nhóm.
- Ngân sách, đơn vị theo người/cả nhóm và phạm vi tính tiền.
- Phương tiện di chuyển.
- Sở thích, khẩu vị, kiêng kỵ và dị ứng.
- Danh sách quán đã chọn, các điểm muốn giữ.
- Thông tin còn thiếu và trạng thái xác nhận.

Cần phân biệt thông tin người dùng đã xác nhận với giả định hệ thống đề xuất. Trước khi tạo lịch trình, các trường quan trọng phải được xác nhận.

Khi người dùng sửa yêu cầu, Backend cập nhật hồ sơ và đánh dấu kết quả bị ảnh hưởng cần tính lại. Việc đổi số người, phương tiện hoặc danh sách quán có thể làm bản xác nhận trước đó hết hiệu lực.

Lịch sử chat hỗ trợ ngữ cảnh; hồ sơ lưu trong hệ thống là cơ sở để quản lý trạng thái nhất quán.

## 6. Luồng xử lý mẫu

**Bước 1 — Tìm quán**

Người dùng:

> “Quanh Xuân Thủy có quán phở nào dưới 70 nghìn không?”

AI nhận diện nhu cầu rồi gọi `search_restaurants`. Backend trả các quán phù hợp cùng giá, vị trí, nguồn và dữ liệu còn thiếu. Frontend hiển thị card; AI giải thích ngắn gọn.

**Bước 2 — So sánh**

Người dùng:

> “So sánh A với B, tôi đi cùng bố mẹ.”

AI gọi công cụ so sánh. Nếu nhu cầu di chuyển chưa rõ, có thể hỏi thêm. Những tiêu chí chưa có dữ liệu như cầu thang, chỗ ngồi hoặc gửi ô tô phải ghi “chưa rõ”.

**Bước 3 — Chọn quán**

Người dùng:

> “Thêm A, rồi tìm chè ít ngọt.”

Backend thêm A sau khi kiểm tra ID. AI tiếp tục tìm quán chè, giữ nguyên các ràng buộc của nhóm. Không tự khẳng định quán điều chỉnh được độ ngọt khi thiếu dữ liệu.

**Bước 4 — Xác nhận**

Người dùng:

> “Tạo lịch từ 16 giờ đến 18 giờ, đi xe máy.”

Hệ thống kiểm tra thông tin còn thiếu và hiển thị bản tóm tắt gồm danh sách quán, giờ, phương tiện, ngân sách và ràng buộc. Người dùng xác nhận.

**Bước 5 — Lập lịch**

Backend gọi Planner. Planner trả lộ trình và các xung đột nếu có. AI diễn đạt kết quả, không tự sửa số liệu hoặc tự thay quán để làm tour có vẻ khả thi.

## 7. Các quy tắc bắt buộc

### Dữ liệu và phép tính

- Khoảng cách, tuyến đường và ETA lấy từ công cụ phù hợp; không để AI tự ước lượng rồi trình bày như kết quả đã tính.
- Tổng tiền và kiểm tra ngân sách do Backend thực hiện.
- Chi phí thiếu phải được ghi rõ; không kết luận “trong ngân sách” khi chưa đủ thành phần.
- Giá tham khảo của Grab/taxi không được trình bày như báo giá đặt xe.
- Giờ mở cửa theo dữ liệu cũ không đồng nghĩa quán đang mở hoặc còn chỗ.

### Dị ứng, kiêng kỵ và khẩu vị

- Phân biệt dị ứng với sở thích.
- Loại các vi phạm đã biết bằng quy tắc kiểm tra.
- Dữ liệu nguyên liệu chưa rõ không được coi là đáp ứng yêu cầu dị ứng.
- AI phải giải thích phần chưa rõ; không tự khẳng định quán an toàn.
- Các yêu cầu ít ngọt, ăn nhạt hoặc không cay chỉ được khẳng định đáp ứng khi có dữ liệu hỗ trợ.

### Xác nhận và chỉnh sửa

- Không tự tạo lịch trình trong giai đoạn khám phá.
- Không coi mọi câu “ok” là xác nhận tạo tour.
- Phương tiện phải được xác nhận trước khi lập lộ trình.
- Không âm thầm bỏ quán, thay phương tiện hoặc nới ràng buộc.
- Không thông báo “đã thêm”, “đã lưu” hoặc “đã tạo” khi Backend chưa xác nhận thành công.

## 8. Cách gọi API AI trong MVP

Sử dụng một luồng AI thống nhất có tool calling. Chưa cần chia thành nhiều AI agent.

Mỗi lượt cần thiết gửi cho AI:

- Tin nhắn mới và phần hội thoại liên quan.
- Hồ sơ yêu cầu hiện tại.
- Danh sách quán đang chọn.
- Kết quả công cụ cần dùng để trả lời.

Không gửi toàn bộ dataset trong mỗi lượt. Backend tìm và lọc dữ liệu trước, sau đó trả nhóm kết quả liên quan.

Một lượt người dùng có thể cần nhiều lần gọi model: hiểu yêu cầu → gọi công cụ → nhận kết quả → trả lời. Cần đặt giới hạn vòng gọi công cụ, thời gian xử lý và xử lý lỗi để tránh chạy lặp.

Các nút thêm/bỏ quán, lưu tour, sửa thông tin hoặc mở bản đồ có thể gọi Backend trực tiếp. Chỉ gọi AI khi cần hiểu ngôn ngữ, tư vấn hoặc giải thích.

## 9. Phạm vi triển khai

**MVP:**

- Hiểu hội thoại tiếng Việt và quản lý yêu cầu nhiều lượt.
- Tìm món/quán, so sánh và chọn quán.
- Tool calling với Backend.
- Hiểu vị trí cụ thể tại Hà Nội.
- Dùng thời gian và thời tiết khi có dữ liệu.
- Xác nhận trước khi tạo lịch trình.
- Giải thích kết quả Planner và hỗ trợ chỉnh sửa.
- Xử lý dữ liệu thiếu, lỗi công cụ và ràng buộc mâu thuẫn.

**Giai đoạn sau:**

- Cá nhân hóa dài hạn.
- Tìm kiếm ngữ nghĩa nâng cao nếu kiểm chứng được nhu cầu.
- Theo dõi và điều chỉnh trong chuyến đi trên điện thoại.
- Tích hợp còn bàn, đặt bàn, đặt xe và thanh toán.

## 10. Tiêu chí nghiệm thu

| Nhóm kiểm tra | Điều kiện đạt |
|---|---|
| Hiểu yêu cầu | Trích xuất đúng thông tin; làm rõ trường mơ hồ thay vì tự đoán. |
| Ghi nhớ | Không hỏi lặp; cập nhật đúng khi người dùng sửa yêu cầu. |
| Dữ liệu | Quán có ID hợp lệ; thông tin thực tế có căn cứ; dữ liệu thiếu hiển thị rõ. |
| Công cụ | Gọi đúng chức năng; kiểm tra đầu vào; xử lý được lỗi và kết quả rỗng. |
| Lựa chọn | Chat và danh sách food tour thống nhất sau mỗi thao tác. |
| Xác nhận | Chỉ tạo lịch trình sau khi xác nhận và đủ dữ liệu bắt buộc. |
| Planner | Timeline, bản đồ, chi phí và phương tiện nhất quán; xung đột được nêu rõ. |
| Dị ứng | Không coi thiếu dữ liệu là đáp ứng; không đề xuất vi phạm đã biết. |
| Vận hành | Có giới hạn vòng tool calling và ghi nhận lỗi, độ trễ, mức sử dụng API để đánh giá. |

## 11. Thứ tự triển khai đề xuất

1. Kiểm tra dataset Hà Nội và chuẩn hóa thông tin nguồn.
2. Thống nhất hồ sơ phiên, danh sách lựa chọn và hợp đồng công cụ.
3. Xây tìm kiếm, lọc, so sánh và cập nhật danh sách bằng Backend.
4. Tích hợp AI để trò chuyện và điều phối công cụ.
5. Hoàn thiện bước xác nhận và kết nối Planner.
6. Tích hợp thời tiết, lưu/chia sẻ và các trạng thái lỗi.
7. Kiểm thử toàn bộ hành trình bằng các hội thoại thực tế.

Tài liệu này xác lập hướng triển khai. Model, nhà cung cấp API và dịch vụ bản đồ/thời tiết sẽ được lựa chọn dựa trên thử nghiệm tiếng Việt, chất lượng tool calling, độ phủ dữ liệu, chi phí và độ trễ.