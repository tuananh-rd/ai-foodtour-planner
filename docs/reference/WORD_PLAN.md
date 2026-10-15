TÀI LIỆU THIẾT KẾ & TRIỂN KHAI
AI FoodTour Planner
Kế hoạch dự án chi tiết • Kiến trúc hệ thống • Kiểm định dữ liệu thực • Phân công 6 vai trò agent trong Orca
Trạng thái: CONDITIONAL GO — có thể làm prototype, chưa đạt điều kiện mở rộng/triển khai công khai với bộ dữ liệu hiện tại.
Phiên bản: 1.0  |  Ngày: 15/10/2026  |  Ngôn ngữ sản phẩm: Tiếng Việt
Nguồn đánh giá: restaurants_enriched (1).csv (mới), restaurants.csv (tham chiếu); tài liệu chính thức của Orca và Geoapify được kiểm tra ngày 15/10/2026.
Tài liệu dùng để thảo luận, phân chia nhiệm vụ và thiết lập tiêu chí nghiệm thu trước khi giao việc lập trình.
QUY ƯỚC TRẠNG THÁI
Nhóm
Diễn giải
Đã kiểm chứng
Chỉ áp dụng cho số liệu tự đo trong file CSV người dùng đã cung cấp.
Đề xuất
Phương án thiết kế/triển khai; có thể thay đổi khi quyết định kiến trúc.
Giả định
Chỉ để lập kế hoạch, không phải số liệu hiện thực.
Chặn triển khai
Điều kiện bắt buộc phải xử lý trước khi dùng trong sản phẩm công khai.


MỤC LỤC NỘI DUNG
01. Tóm tắt điều hành & điểm quyết định
02. Kiểm định dữ liệu CSV thực tế
03. Dữ liệu nguồn, bản quyền và chuẩn chất lượng
04. Định vị sản phẩm, người dùng, luồng sử dụng
05. Phạm vi MVP, P1/P2 và tiêu chí phi chức năng
06. Kiến trúc ứng dụng và lựa chọn công nghệ
07. Thiết kế dữ liệu, schema và quy trình ETL
08. Thiết kế REST API và chuẩn phản hồi
09. AI runtime: tool calling và kiểm soát hallucination
10. Thuật toán gợi ý và lập hành trình
11. Thiết kế giao diện, bản đồ và trải nghiệm
12. Cấu trúc monorepo và môi trường làm việc
13. Sáu vai trò coding agent trong Orca
14. Quy trình Orca orchestration và Git worktree
15. Backlog chi tiết, phụ thuộc và giao việc
16. Lộ trình triển khai & checkpoints
17. Chiến lược kiểm thử, benchmark và an toàn
18. Chi phí vận hành, bảo mật và triển khai
19. Rủi ro, phương án dự phòng, quyết định cần chốt
20. Phụ lục: prompt mẫu, checklist và nguồn tham khảo
Mục lục liệt kê các phần theo thứ tự đọc; không cố định số trang để đảm bảo tài liệu vẫn dễ chỉnh sửa.
1. TÓM TẮT ĐIỀU HÀNH & QUYẾT ĐỊNH CHÍNH
Xây dựng chatbot web bằng tiếng Việt giúp người dùng lập foodtour cá nhân hóa theo khu vực, ngày giờ, ngân sách, số người, món muốn thử, hạn chế ăn uống, phương tiện và thời lượng. Trả về 3–5 điểm dừng có lý do lựa chọn, lịch trình, chi phí ước tính có nhãn tin cậy, và bản đồ tuyến đường. Người dùng có thể yêu cầu đổi một điểm dừng và tái tối ưu mà không đánh mất các điều kiện còn lại.
Quyết định
Đề xuất cụ thể
Tính chất
MVP
Web responsive, không ứng dụng native
Đề xuất
Thành phố v1
Hà Nội do file hiện có tập trung tại đây; chốt cụm quán sau bước dữ liệu
Tạm thời
Công nghệ
Next.js + TypeScript, FastAPI, PostgreSQL/PostGIS, Leaflet, Routing API, Gemini/LLM tool calling
Đề xuất
Logic lập tour
Bộ lọc + ranking có giải thích + heuristic/2-opt + API đường bộ
Đề xuất
Nguồn dữ liệu
Dataset thử nghiệm, sau đó bộ địa điểm có quyền sử dụng & bằng chứng
Bắt buộc
Tiến độ
5–6 mốc nghiệm thu; làm tuần tự theo phụ thuộc và song song theo module
Đề xuất
Tình trạng GO
Cho phép viết prototype trên máy cục bộ; không dùng CSV Foody làm dữ liệu công khai khi chưa có quyền
Chặn triển khai công khai

2. KIỂM ĐỊNH DỮ LIỆU THỰC TẾ
2.1. File, phương pháp đo và kết quả
Đã đọc bằng pandas/UTF-8-sig trong phiên này. Bộ enriched có 36 dòng × 43 cột. So sánh tham chiếu file cũ 80 dòng × 18 cột. Các tỷ lệ phản ánh độ có mặt trường dữ liệu, không bảo đảm nội dung còn hiệu lực trong thực tế.
Tiêu chí
Đo được
Hàm ý
Bản ghi
36
Có thể demo kết quả tìm kiếm
Số cột
43
Schema enrichment đa dạng
ID duy nhất
36/36
Không trùng ID
Tên/địa chỉ
36/36 và 36/36
Tìm kiếm, hiển thị
Tọa độ hợp lệ sơ bộ
36/36
Bản đồ, khoảng cách sơ bộ
Thành phố
Hà Nội (36/36)
Chưa có dữ liệu đa tỉnh
Quận
10
Phân bố rải rác
Nhóm món (dish_groups)
36/36
Nhãn danh mục; không phải menu
Khoảng giá đã chuẩn hóa
35/36
Chỉ giá tham khảo của địa điểm
Giờ có nhãn ngày trong tuần xác minh
0/36
Không thể đảm bảo mở cửa theo ngày
Điểm đánh giá/review
36/36 và 36/36
Dữ liệu nguồn, có thể cũ
Nguồn URL
36/36
Có dấu vết truy xuất
Lặp nguyên dòng
0
Không có trùng nguyên dòng

2.2. Phân bố địa lý và độ dày mạng lưới
Quận
Số địa điểm
Quận Hai Bà Trưng
6
Quận Cầu Giấy
6
Quận Đống Đa
5
Quận Hoàn Kiếm
4
Quận Long Biên
3
Quận Thanh Xuân
3
Quận Ba Đình
3
Quận Hà Đông
3
Quận Hoàng Mai
2
Quận Tây Hồ
1

Tọa độ trải từ vĩ độ 20.9641718–21.056988 và kinh độ 105.7718147–105.8740686. Khoảng cách Haversine đến quán gần nhất có trung vị ~0,62 km; 30/36 địa điểm có ít nhất một địa điểm khác trong bán kính 1 km. Đây là khoảng cách đường chim bay, KHÔNG phải thời gian hay quãng đường đi bộ thực tế.
Tập Hoàn Kiếm có 4 địa điểm; Hai Bà Trưng và Cầu Giấy mỗi nơi 6. Cần một pipeline tập trung vào cụm phố/ô lưới thay vì cứ bổ sung quán trên toàn thành phố. Một foodtour 4 điểm liên tiếp cần sự đa dạng món và giờ mở cửa tương thích, không chỉ gần nhau.
2.3. Kiểm tra các trường trọng yếu
Trường
Vấn đề được quan sát
Hành động bắt buộc
opening_hours_raw
36/36 có dữ liệu, nhưng hours_status đều day_mapping_unknown, hours_day_codes_raw đều [4].
Không kết luận thứ trong tuần; chỉ hiển thị “giờ tham khảo, chưa xác minh”; ưu tiên xác minh lại.
price_min/max
35/36 có giá >0 hợp lệ; 1 quán “Cơm Tấm Minh Nhật - Tây Sơn” có giá nguồn 0, normalized null.
Giữ null cho giá chưa biết; cấm dùng giá quán làm giá từng món hoặc cam kết ngân sách.
dish_groups
36/36 có nhóm món, ví dụ trà, bún, cơm; có nhiều nhãn nối bằng |.
Chuẩn hóa tag; không biến tag thành khẳng định về menu/đồ ăn hiện bán.
venue_types
Có 2 bản ghi thuộc “Shop Online”.
Loại khỏi điểm dừng ăn tại chỗ trừ khi xác minh có cơ sở vật lý.
rating_value / reviews
36/36 có điểm; số review dao động 1–485; quy mô mẫu khác nhau.
Chuẩn hóa thang 10, làm mượt rating theo số review, ghi nguồn và thời gian.
source_url
36/36 dẫn tới foody.vn; không có cột source_license trong file enriched.
Lưu provenance, xác minh giấy phép/tính hợp pháp tái sử dụng trước khi xuất bản.
fetched_at
Giá trị nằm trong 15/10/2026 UTC.
Đây là thời điểm crawl, không phải thời điểm kiểm chứng hoạt động.
source_flags (file cũ)
79/80 có IsInactive:true, 1/80 false. Semantics chưa được tài liệu hóa.
Không suy đoán “đóng cửa”; đánh dấu cần đối chiếu trạng thái cửa hàng.

2.4. Đánh giá tính năng theo mức độ sẵn sàng
Tính năng
Tình trạng
Lý do
Hiển thị bản đồ, danh sách quán
Đạt cho bản mẫu
Có tên, tọa độ, địa chỉ 36/36; chưa xác nhận tính còn hoạt động.
Lọc theo kiểu quán/nhóm món
Đạt có điều kiện
Có tag nhóm món/loại quán, có thể không phản ánh menu hiện tại.
Gợi ý theo rating
Đạt có điều kiện
Có rating + review_count; cần weighting và kiểm tra độ mới.
Chọn 3–5 quán có tuyến ngắn
Có điều kiện
Đủ tọa độ để thử, nhưng dữ liệu rải rác và chưa có đường đi thực.
Kiểm soát ngân sách chính xác
Chưa đạt
Chỉ khoảng giá cấp quán, không có giá món/khẩu phần.
Lọc “đang mở” theo ngày giờ
Chưa đạt
Không rõ mapping ngày, thiếu lịch tuần đầy đủ và kiểm tra mới nhất.
Tương thích dị ứng/ăn kiêng
Chưa đạt
Không có bảng nguyên liệu và xác nhận từ cửa hàng.
Triển khai công khai từ Foody
Chưa đạt
Không chứng minh quyền tái sử dụng/bản quyền.

KẾT LUẬN DATA GATE: CONDITIONAL GO — có thể viết và kiểm thử prototype bằng tập dữ liệu mẫu nội bộ có kiểm soát. Trước khi demo công khai hay triển khai production phải giải quyết quyền dữ liệu, chọn cụm địa điểm hoạt động thực và xác minh các thông tin quyết định tính khả thi tour.
3. CHIẾN LƯỢC DỮ LIỆU, GIẤY PHÉP & TIÊU CHUẨN
3.1. Ba lớp dữ liệu
01. Lớp A — Primary POI: tên, tọa độ, địa chỉ, loại quán từ nguồn được phép (ví dụ OSM với ODbL và attribution đúng).
02. Lớp B — Verified enrichment: loại món, khung giá/giá món, giờ mở cửa, thời gian phục vụ, trạng thái tại chỗ do nhóm kiểm chứng với nguồn + thời điểm.
03. Lớp C — Runtime: kết quả routing, thời gian di chuyển, metadata phiên chat. Dữ liệu có tính động và tuân theo điều khoản lưu trữ của nhà cung cấp API.
3.2. Data contract & provenance
Nhóm
Trường bắt buộc
Quy tắc
POI core
external_source_id, name, latitude, longitude, address, city, district, venue_type
Tên và tọa độ không null; check bounds, duplicate và phép nhập.
Source
provider, source_url, license_id, attribution_text, permitted_use, fetched_at
Không import production khi chưa có quyết định pháp lý/giấy phép.
Price
price_min_vnd, price_max_vnd, price_type, verified_at, confidence
Các giá trị null phải giữ null; phân biệt venue_range/dish_price.
Hours
weekday_iso, start_local, end_local, exception_date, time_zone, verified_at
Chỉ kết luận open_at khi mapping ngày xác thực và dữ liệu đủ gần.
Dish
dish_name, food_tags, ingredient_info, confirmed_by, verified_at
Không suy ra thành phần/dị ứng từ tên món; không có thì unknown.

3.3. Quy trình ETL/ELT & kiểm định
01. Intake: nhận CSV/API bằng adapter riêng từng nguồn; lưu raw snapshot có SHA-256 và nhật ký provenance.
02. Legal gate: xác minh điều khoản trang/API, phạm vi lưu trữ, quyền hiển thị, điều kiện attribution, tần suất cập nhật.
03. Parse: mã hóa UTF-8, normalize Unicode, chuẩn hóa giá VND, tên, quận và trường nhiều tag.
04. Deduplicate: ưu tiên ID nguồn; tiếp theo đối sánh tên đã normalize + khoảng cách địa lý + địa chỉ (review nếu thiếu chắc chắn).
05. Enrichment: thu thập qua nguồn hợp lệ, kiểm tra người thật đối với 30–50 POI lõi; đánh dấu verified/rejected/unknown.
06. Quality gate: không có tọa độ sai, không có price inversion; mỗi POI có nguồn; chỉ quán có service_mode=dine_in được tính điểm dừng.
07. Publish snapshot có version; không trộn trực tiếp dữ liệu chưa qua kiểm định vào production.
3.4. Mục tiêu dataset cho MVP
Gợi ý tăng lên 100–150 POI đã phân loại ở một hoặc hai cụm khu phố; trong đó tối thiểu 30–50 POI được xác minh thủ công đủ tên/tọa độ/loại món/trạng thái phục vụ/giờ dự kiến/nguồn. Những mốc này là mục tiêu triển khai, không phải tuyên bố hiện có. Nếu chưa thể bổ sung, vẫn demo thuật toán trên 36 địa điểm kèm thông báo giới hạn.
3.5. Các điều cấm đối với dữ liệu
• Không lấy dữ liệu từ Foody và cho rằng việc crawl đồng nghĩa quyền tái sử dụng; phải có quyền/đánh giá điều khoản trước khi công khai.
• Không chuyển giá khoảng 30–50k của quán thành “món cụ thể giá 40k”.
• Không khẳng định một quán đang mở khi bản ghi chỉ có giờ thô một ngày với mapping chưa rõ.
• Không đưa tên/quán không có trong nguồn đã được hệ thống đối soát vào tour thực tế.
4. SẢN PHẨM, NHÓM NGƯỜI DÙNG & LUỒNG SỬ DỤNG
4.1. Product statement
AI FoodTour Planner là công cụ lập hành trình thưởng thức ẩm thực dựa trên dữ liệu có nguồn, giảm công sức tự tìm quán và di chuyển lòng vòng. Độ tin cậy/khả thi được ưu tiên hơn khả năng tạo câu trả lời hoa mỹ.
4.2. Personas
Persona
Nhu cầu
Điểm rủi ro
Sinh viên/nhóm bạn
Đi 3–5 người, chi phí thấp, nhiều đồ ăn vặt, đi bộ/xe máy
Chia ngân sách, thời gian xếp hàng
Khách du lịch
Muốn món đặc sản, điểm gần nơi ở, lịch nửa ngày
Quán nghỉ/không có menu tiếng Anh
Cặp đôi
Quán ngồi đẹp, đa dạng món, tránh vòng vèo
Không gian/khung giờ chưa được xác minh
Người có hạn chế ăn uống
Loại món theo yêu cầu; cần thông tin đáng tin cậy
Dị ứng: thiếu dữ liệu không thể đảm bảo an toàn

4.3. User journey chuẩn
01. Người dùng nhập: “Tối nay 2 người, 250k/người, thích bún và đồ ngọt, đi bộ tối đa 3 km từ Hồ Gươm”.
02. Chatbot trích xuất constraint: location, date/time, duration, people, budget, food_tags, travel_mode, dietary exclusions.
03. Hệ thống đặt câu hỏi chỉ cho thuộc tính thiết yếu đang thiếu (ví dụ điểm bắt đầu). Nếu có thể thì dùng default rõ ràng và cho chỉnh lại.
04. Planner truy vấn POI đã qua legal/data gate, kiểm tra opening-hours confidence và tình trạng phục vụ tại chỗ.
05. Ranker tìm tổ hợp 3–5 địa điểm, cân bằng món và tuyến; định tuyến walking thật nếu API sẵn có.
06. Trả về timeline, món gợi ý theo tag, giá dưới dạng “ước tính/không xác minh”, khoảng cách, nguồn.
07. Người dùng sửa: “Đổi quán thứ 2” hoặc “đi ít hơn”; hệ thống khóa các stop còn lại nếu khả thi và tái tối ưu.
4.4. Các user stories ưu tiên
• US-01: Là người đi foodtour, tôi nhập nhu cầu bằng tiếng Việt để nhận lịch trình theo 3–5 địa điểm.
• US-02: Tôi xem bản đồ/timeline/chi phí ước tính và nguồn của từng địa điểm.
• US-03: Tôi có thể thay một quán, thay ngân sách, thay phương tiện và vẫn giữ các điều kiện đã chốt.
• US-04: Nếu dữ liệu không đủ, tôi nhận lý do và các phương án nới điều kiện.
• US-05: Tôi không nhận địa điểm chưa tồn tại trong database như một lời khẳng định thực tế.
• US-06: Người quản trị có thể review POI và khóa những bản ghi thiếu quyền/độ tin cậy.
5. PHẠM VI MVP & YÊU CẦU PHI CHỨC NĂNG
Hạng mục
MVP (P0)
Sau MVP (P1/P2)
Chat
Tiếng Việt, structured slots, 1 vòng chỉnh sửa
Đa ngôn ngữ, hồ sơ người dùng
Tìm và lọc
Vùng, tag món, loại quán, ngân sách mềm, travel mode
Lọc sâu theo tiện nghi/dietary đã xác minh
Lập tour
3–5 stop, timeline, diversity, ưu tiên đi bộ
Nhiều ngày, nhiều phương tiện, tuyến khứ hồi
Thông tin
Nguồn, freshness, trường unknown hiện rõ
Realtime opening giờ, queue, booking
Map
Marker và tuyến bằng routing API, fallback chỉ khoảng cách đường chim bay có nhãn
Offline map, điều hướng turn-by-turn
Quản trị
Import CSV và script kiểm định, thao tác bằng CLI
Dashboard POI/admin CMS
Chia sẻ
Copy nội dung hoặc URL trạng thái ẩn danh có expiry (tùy tiến độ)
Tài khoản, lịch sử/đánh giá/collab

5.1. Non-functional requirements
• Mục tiêu p95 API không gọi LLM < 500ms ở môi trường thử nghiệm; tạo tour tổng hợp < 12s ở p95 khi upstream hoạt động (SLO dự kiến, đo thực tế sau triển khai).
• Không lộ API key từ frontend, không commit .env; least-privilege, rate limit IP/session và log không chứa thông tin nhạy cảm.
• Các request tạo tour có request_id, dữ liệu source_id, algorithm_version và dataset_version để truy vết.
• Khi LLM hoặc Routing API lỗi: lỗi rõ ràng; có thể hiển thị kết quả lọc POI đơn giản, không bịa quãng đường/giờ mở.
• UI mobile-first, keyboard usable, trạng thái loading/error/empty rõ ràng; accessibility WCAG 2.1 AA đặt làm mục tiêu.
• Không yêu cầu tài khoản để tạo tour MVP; session ẩn danh có TTL; chỉ lưu nội dung hội thoại cần thiết với quyền xóa.
6. KIẾN TRÚC HỆ THỐNG VÀ STACK
[Next.js Web / Chat + Timeline + Map]
             |
         HTTPS REST
             |
        [FastAPI]
             |
 [Session & Slot Extraction] ---> [LLM Adapter / Tool Calling]
             |                          |
        [Trip Planner] <----- [Tool Validation Layer]
          /       [PostgreSQL/PostGIS] [Routing Provider Adapter]
          |
 [Approved Import Pipeline / Verified POI Snapshot]
6.1. Stack đã đề xuất
Lớp
Công nghệ
Lý do
Frontend
Next.js App Router, TypeScript, Tailwind, shadcn/ui
Giao diện rõ, hệ thống component/type thuận tiện cho agent.
Map
Leaflet/react-leaflet + tile provider cho phép usage
Marker, route polyline; nhớ attribution.
Backend
Python 3.12+, FastAPI + Pydantic v2
Tách schema, route service và thuật toán.
DB
PostgreSQL 16+ / PostGIS; Alembic, SQLAlchemy
Query ST_DWithin, location indexing, migration.
AI
Gemini hoặc LLM tool-calling qua adapter có cấu trúc
Thay model không đổi domain logic.
Routing
Geoapify Routing / thay bằng adapter tương thích
Tính walking/driving thực, không tự ước lượng.
Testing
Pytest, Ruff, MyPy (selective), Vitest, Playwright
Unit, integration, e2e.
Infra
Docker Compose local; web/API/DB deploy tách rời
Dev đồng bộ, dễ CI/CD và chẩn đoán.

6.2. Ownership & boundary
Frontend chỉ render model trả về, không quyết định quán/tuyến. Backend API là cổng duy nhất. Planner quyết định sự hợp lệ và chi phí. LLM chỉ hiểu, hỏi bổ sung và giải thích dựa trên output có nguồn. Tất cả truy vấn/quãng đường dùng tool đã kiểm soát, có timeout và quota.
6.3. Điều kiện fail-safe
• Không có địa điểm hợp lệ → thông báo thiếu dữ liệu và đề xuất khu vực/budget khác.
• Không có routing → không phát hành ETA hay km tuyến đi bộ; hiển thị đánh dấu “chưa tính đường thực”.
• Không có giá chi tiết → tổng chi phí theo khoảng giả định có nhãn, hoặc không tính nếu độ thiếu lớn.
• Thay điểm khiến tour bất khả thi → đề xuất bỏ điểm/giãn thời gian trước khi tạo timeline.
7. SCHEMA DỮ LIỆU & PIPELINE
7.1. Bảng lõi (PostgreSQL/PostGIS)
Table
Trường tiêu biểu
Index/quan hệ
cities
id, name, slug, country_code
unique(slug)
sources
id, provider, source_url, license_id, allowed_use, attribution, fetched_at
permission reviewed flag
venues
id, city_id, source_id, ext_id, name, address, location geography(Point,4326), venue_type, dine_in_status, active_status, verified_at
GIST(location), unique(source_id,ext_id)
food_tags
id, kind, name, normalized_slug
unique(kind,slug)
venue_tags
venue_id, tag_id, source_id, confidence
unique(venue_id,tag_id)
dishes
id, venue_id, dish_name, price_vnd_nullable, ingredients_verified, verified_at
fk venue
venue_prices
venue_id, min_vnd, max_vnd, price_semantics, verified_at
CHECK min<=max; null allowed
opening_rules
venue_id, weekday_iso, open_time, close_time, verified_at, timezone
weekday 1..7, exception table
opening_exceptions
venue_id, date, is_closed, open/close
unique(venue_id,date)
foodtours
id, session_id, city_id, params_json, dataset_version, created_at
opaque ID
foodtour_stops
tour_id, venue_id, seq, arrival_at, stay_minutes, spend_min/max, route_leg_json
unique(tour_id,seq)
chat_sessions
id, slots_json, messages_redacted, expires_at
TTL + retention policy
data_quality_events
id, venue_id, severity, rule, payload_json, timestamp
for audit

7.2. Một số quy tắc schema
• location dùng kiểu geography Point SRID 4326; API nhận latitude/longitude rõ nghĩa; lưu điểm thực theo (lon,lat) cho PostGIS.
• price_semantics enum: venue_range / dish_price / per_person_estimate / unknown; không tính tổng cứng cho venue_range.
• hours_verified_status: verified / source_raw_only / unknown; không ép source_raw_only thành khả năng mở cửa chắc chắn.
• active_status là unknown/verified_open/verified_closed; không map source flag mơ hồ thành đóng cửa.
• dataset_version và import_batch_id giúp tái hiện kết quả tour; thêm unique/source attribution.
7.3. Import pipeline
raw_csv -> adapter (source specific) -> validate -> normalize
        -> de-duplicate -> manual review queue -> publish snapshot
        -> PostgreSQL/PostGIS -> quality report / audit trail
8. REST API CONTRACT (MVP)
Method/Path
Input chính
Output / lỗi
GET /healthz
–
200 service status
GET /v1/venues
bbox/center+radius, tags, type, limit, cursor
venues[], page, source + completeness
GET /v1/venues/{id}
id
venue detail, tags, price/hours provenance
POST /v1/chat/interpret
session_id, utterance, slots(optional)
slots, missing_required, followup_question
POST /v1/tours
session_id, preferences, start_point, date/time
tour_id, stops[], route, cost_band, warnings
GET /v1/tours/{id}
id
stored tour + snapshot_version
PATCH /v1/tours/{id}
replace_stop / change_preferences / lock_stop
replanned stops, changes, warnings
POST /v1/admin/imports (CLI or admin only)
dataset + source permission metadata
import report, rejected counts
GET /v1/meta/tags
city_id
supported food types/tags

8.1. Contract của tạo tour (minh họa)
POST /v1/tours
{
  "city_id": "hanoi", "party_size": 2,
  "budget_per_person_vnd": 300000, "duration_minutes": 240,
  "date_local": "2026-10-17", "start_local": "15:00",
  "start_point": {"lat": 21.0278, "lon": 105.8520},
  "travel_mode": "walking", "food_tags": ["bun", "dessert"],
  "dietary_exclusions": [], "stop_count": 4
}
-> {"tour_id":"...", "stops":[...], "route":{...},
    "budget_status":"estimate_only", "warnings":[...],
    "dataset_version":"v...", "trace_id":"..."}
Date và tọa độ phía trên chỉ là ví dụ hợp đồng API, không biểu thị lịch trình đã kiểm chứng. API trả HTTP 422 cho validation, 409 khi ràng buộc bất khả thi, 503 cho upstream cần thiết, 429 cho quota/rate limit. Mọi lỗi đều có code, message tiếng Việt và suggestions phù hợp.
9. AI RUNTIME: PROMPT, TOOLS VÀ CHỐNG HALLUCINATION
9.1. Chat flow
user -> Slot Parser (LLM structured JSON) -> Pydantic validation
     -> Missing-slot policy -> Tool router -> Planner deterministic
     -> Output verifier -> LLM summary from grounded facts
     -> frontend
9.2. Bộ tool phía server
Tool
Input
Output
search_venues
city, bbox, food_tags, exclude_ids, confidence_floor
venue IDs and bounded attributes
get_venue_details
venue_ids[]
authorized fields + provenance
get_route_matrix
coordinates[], mode
distance/time matrix with provider status
build_tour
constraints + candidates + matrix
feasible stops + objective scores
replace_tour_stop
tour_id, seq, new_constraints
new tour with locks and diff
validate_tour
tour + constraints
violations, warnings, uncertainty

9.3. Security prompt rules
• LLM không tạo venue ID; chỉ tham chiếu ID hợp lệ từ tool.
• Mọi mức giá/giờ mở cửa/đặc điểm an toàn thực phẩm phải có dữ liệu nguồn tương ứng.
• Không cho nội dung tự do từ venue/nguồn web hoạt động như chỉ dẫn hệ thống (prompt injection).
• Structured output được validate lại ở server; không gọi tool với tham số ngoài miền cho phép.
• Không gửi thông tin cá nhân không cần thiết vào LLM; log redacted, giữ trace ID.
• Dùng một agent LLM điều phối tools trong runtime, không cần chạy đồng thời 6 coding agents cho mỗi cuộc chat.
9.4. Conversation memory
Lưu session slots (vùng, ngân sách, số người, phương tiện, ngày giờ), locks (giữ stop nào), last_tour_id, user_confirmed và history rút gọn. Follow-up chỉ thay đúng tham số được nêu; yêu cầu “đổi quán thứ 2” không được tự đổi ngân sách và số người.
10. GỢI Ý QUÁN & TỐI ƯU LỊCH TRÌNH
10.1. Ràng buộc cứng vs mềm
Ràng buộc cứng
Tiêu chí tối ưu mềm
Điểm thực trong dataset, được phép dùng và có tọa độ
Giảm km hoặc phút di chuyển
Dine-in phù hợp cho tour tại chỗ
Khớp món yêu thích, đa dạng món
Các dị ứng/loại trừ chỉ được xử lý an toàn khi đã xác minh thành phần; nếu không phải nói không chắc
Cân bằng đánh giá và độ mới
Giới hạn duration, party size nếu đã có dữ liệu tin cậy
Giảm vượt mức ngân sách ước tính
Không tuyên bố mở cửa nếu dữ liệu không đủ
Khuyến khích điểm nổi bật/giá trị khác biệt

10.2. Scoring và tối ưu
Bước 1 lọc quán theo vùng/loại/dữ liệu; bước 2 chấm điểm venue (món phù hợp 35%, khoảng cách 25%, chất lượng review đã làm mượt 15%, tính đa dạng 15%, độ tin cậy dữ liệu 10%) — các trọng số chỉ là baseline cần tuning; bước 3 tạo các tập 3–5 điểm; bước 4 nearest-neighbor rồi 2-opt hoặc beam search; bước 5 tính tuyến qua Routing API và xác minh timeline; bước 6 trả top-3 tour để AI giải thích. Không tối ưu thuần hình học nếu thiếu actual route network.
10.3. Chi phí & thời gian
• Mỗi stop: prep_time_known hoặc default có ghi rõ giả định; eat_time = cấu hình theo loại venue, không phải thời gian thực được kiểm chứng.
• Total duration = travel duration theo provider + dwell time + buffer. Nếu không có routing, không tuyên bố tour fit chính xác.
• Price: nếu chỉ có venue_range thì hiển thị mức tham khảo theo quán, không cộng như hóa đơn chắc chắn.
• Nếu dữ liệu giờ không đủ, kết quả có warning “chưa xác minh mở cửa”; đối với chế độ strict open-now, quán này không được pass.
• Chế độ relax constraints: nới bán kính/giảm stop count/tăng ngân sách nếu người dùng đồng ý.
10.4. Baseline đánh giá
Benchmark 30–50 ca lệnh với kỳ vọng 0 địa điểm hallucinated; >90% thỏa các ràng buộc có dữ liệu xác minh; đo tỷ lệ tour cần nới điều kiện, quãng đường tuyến, phản hồi khi thiếu dữ liệu. Trọng số được thử A/B qua bộ test fixture trước khi triển khai công khai.
11. UX, GIAO DIỆN & BẢN ĐỒ
11.1. Các trang & component
Trang
Thành phần
Trạng thái cần có
Landing
Giá trị sản phẩm, quick prompts, chọn vùng
loading/empty/no-city-data
Planner
Chat panel + preference chips + button tạo tour
message/error/restore session
Tour detail
Timeline 3–5 stop, chi phí, nguồn, warning, nút replace
replan diff/loading/partial route
Map
Marker theo thứ tự, route polyline, switch walk/drive
map provider unavailable/attribution
Data transparency
Badge verified/estimate/unknown, nguồn từng quán
source unavailable/expired

11.2. UX rules
• Desktop: chat 35–40% chiều ngang, bản đồ/timeline 60–65%; mobile: tab Chat / Lịch trình / Bản đồ, mỗi view một nhiệm vụ rõ.
• Mỗi card hiển thị tên, khoảng cách, nhóm món, giờ/giá với mức độ tin cậy và nguồn; không chỉ show rating.
• Thay stop thông qua menu “Đổi quán”, bộ lọc gợi ý; cho xem tour trước/sau và xác nhận.
• Tương tác trên bản đồ có keyboard/focus, không lạm dụng animation, font đủ lớn trên điện thoại.
12. CẤU TRÚC REPOSITORY & DEV ENVIRONMENT
foodtour-ai/
  apps/
    web/                     # Next.js UI
    api/
      app/api/               # routes
      app/ai/                # LLM extraction, policies
      app/planner/           # ranking, scheduling, route
      app/db/                # repositories, SQLAlchemy
      app/providers/         # Geoapify + LLM adapters
  data/
    fixtures/                # synthetic/licensed fixtures ONLY
    audit/                   # quality reports
  scripts/ingestion/         # adapters / validators / approvals
  db/migrations/             # Alembic
  contracts/openapi.yaml     # API source of truth
  docs/
    PRD.md ARCHITECTURE.md DATA_POLICY.md
    AGENT_PLAYBOOK.md TASK_BOARD.md ADR/
  tests/unit/ tests/integration/ tests/e2e/
  .github/workflows/ci.yml
  docker-compose.yml .env.example README.md
12.1. Nguyên tắc integration
• Khởi tạo mono-repo + API contract + DB migration skeleton trước khi chia branch.
• Mỗi agent sở hữu vùng file mặc định; chỉnh sửa ngoài vùng cần ghi rõ trong task và được coordinator duyệt.
• Không nhập dữ liệu Foody vào sample repo public; tách fixtures đã tạo tổng hợp hoặc được cấp phép.
• Format/lint/test nằm trong CI; các PR không sửa migration dùng chung khi đang có PR migration khác.
• Version dependency được lock qua package-lock/pnpm-lock và uv/requirements lock; không tự ý nâng package trên task không liên quan.
13. CHARTER CHI TIẾT CỦA 6 CODING AGENTS
Sáu vai trò dưới đây là agent tham gia PHÁT TRIỂN ở Orca; không có nghĩa ứng dụng cần chạy 6 LLM agent ở thời gian thực. Một worker = một task/dispatch được giám sát, có thể được chạy bởi Codex/Claude/Cursor… tùy agent đã cài trong Orca.
A0 — Architect / Orchestrator
• Sứ mệnh: Giữ kiến trúc và quyết định; phân rã tasks, dependency graph, phê duyệt thay đổi, merge và release.
• Ownership: docs/ARCHITECTURE.md, docs/ADR/, contracts/openapi.yaml, TASK_BOARD.md, root config
• Đầu vào: PRD, audit, stakeholder decisions
• Đầu ra bắt buộc: Architecture v1, task specs, API/schema gates, integration report
• Definition of Done: Mọi worker nhận input/output rõ, coverage review, không còn blocker ẩn
• Phụ thuộc: Dữ liệu audit + quyết định scope
• Không được: Code trực tiếp lên các vùng worker đang sở hữu hoặc merge thiếu CI
A1 — Data Engineer
• Sứ mệnh: Xây parser/adapters/QA/provenance/legal guard cho dataset.
• Ownership: scripts/ingestion/, data/audit/, tests/data/
• Đầu vào: CSV sample + source policy + canonical schema
• Đầu ra bắt buộc: DATA_AUDIT.md, import report, normalization, metadata nguồn
• Definition of Done: Có test xử lý null/duplicates/bad coords/unknown hours, import idempotent
• Phụ thuộc: Schema draft từ A0 + migrations A3
• Không được: Suy diễn giờ/giá hoặc đẩy dữ liệu chưa được phép vào production
A2 — AI / Planner Engineer
• Sứ mệnh: Xây slot parser/tool routing, scoring, route-optimization, grounded response.
• Ownership: apps/api/app/ai/, apps/api/app/planner/, tests/planner/
• Đầu vào: Contracts + repository interface + fixture đã được duyệt
• Đầu ra bắt buộc: Planner thuần hàm, reason codes, deterministic fallback, LLM structured schema
• Definition of Done: 30+ test scenario, không xuất ID ngoài candidate set, constraint checks
• Phụ thuộc: A0 contracts + A3 POI interface
• Không được: Gọi DB trực tiếp phá abstraction hoặc hardcode dữ liệu Foody vào prompt
A3 — Backend Engineer
• Sứ mệnh: Database, migrations, API, session, security boundary, provider integration.
• Ownership: apps/api/app/api/, db/, apps/api/app/db/, apps/api/app/providers/, tests/api/
• Đầu vào: contracts, schema, provider terms
• Đầu ra bắt buộc: REST endpoints, migrations, OpenAPI, auth admin/rate-limit, validation
• Definition of Done: Test migrations up/down + integration + idempotency + clean errors
• Phụ thuộc: A0 contracts; phối hợp A1/A2
• Không được: Tự đổi response JSON mà chưa cập nhật contracts
A4 — Frontend Engineer
• Sứ mệnh: Responsive UI, chat, timeline, map, replace stop, warning provenance.
• Ownership: apps/web/, tests/e2e/fixtures/
• Đầu vào: OpenAPI mock/fixtures + UI acceptance
• Đầu ra bắt buộc: Screens, components, state machine, map tiles attribution
• Definition of Done: Playwright critical flow desktop/mobile, accessible empty/loading/error
• Phụ thuộc: A0 contracts và schema mock, A3 integration sau
• Không được: Tự tạo dữ liệu quán giả rồi trình như thông tin đã được xác minh
A5 — QA / Security Engineer
• Sứ mệnh: Xác minh độc lập, kiểm soát hồi quy, bảo mật và release gate.
• Ownership: tests/, reports/qa/, .github/workflows/ci.yml (được A0 duyệt)
• Đầu vào: User stories + contracts + env mẫu
• Đầu ra bắt buộc: Test matrix, CI, security checklist, evaluation report
• Definition of Done: Không có P0/P1 lỗi mở; smoke deploy; đo chỉ số có log
• Phụ thuộc: Có fixtures và các endpoints chạy được
• Không được: Tự sửa logic production trong PR QA mà không tách task
13.1. Quy tắc review chéo
PR từ
Reviewer chính
Người duyệt merge
A1 Data
A3 Backend + A5 QA
A0
A2 Planner
A3 Backend + A5 QA
A0
A3 Backend
A2 Planner + A5 QA
A0
A4 Frontend
A3 Backend + A5 QA
A0
A5 QA/CI
A0 + agent ảnh hưởng
A0

14. ORCA ORCHESTRATION & GIT WORKTREE PLAYBOOK
14.1. Cách sử dụng thực tế
Theo tài liệu công khai của dự án stablyai/orca, Orchestration gồm Run → Task → Dispatch → Worker; cần bật trong Settings → Experimental. Kiểm tra runtime bằng “orca status --json”, rồi đọc hướng dẫn hiện có bằng “orca skills get orchestration --full”. Lệnh chính xác phải được đối chiếu phiên bản Orca trên máy, không giả định đang bật sẵn.
# Minh họa CLI đã xuất hiện trong tài liệu Orca (không chạy tự động)
orca status --json
orca skills get orchestration --full
orca orchestration run-create --objective "FoodTour MVP, data-first" --json
orca orchestration task-create --spec "Implement validated POI ingestion" --task-title "Data ingestion" --json
orca orchestration worker-start --task <taskId> --worktree new-child --name data-ingestion --agent codex --setup run --json
orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 900000 --json
Ghi chú: worker-start trả task/dispatch ID; worker khi hoàn thành phải gửi worker_done một lần và kèm cả taskId + dispatchId. Sau khi accepted, coordinator có thể release worker. Không tự reset orchestration state hoặc xóa worktree khi vẫn có dispatch active.
14.2. DAG phân công và nhóm song song
GATE D0: dataset audit + legal decision
  -> ARCH-001: PRD + ADR + OpenAPI + schema (A0)
        -> DATA-001: import/quality (A1) ------┐
        -> BE-001: migrations/API skeleton (A3) | -> INT-001 integrated tour
        -> AI-001: planner on fixtures (A2) ----|
        -> FE-001: UI on mocked OpenAPI (A4) --┘
  -> QA-001 CI + benchmark fixtures (A5; starts early)
INT-001 -> E2E-001 -> RELEASE GATE -> DEPLOY-001
14.3. Branch & merge policy
• Main protected: build/lint/tests pass; task branches theo ID (feat/DATA-001-...), 1 PR/task.
• Worker tạo worktree new-child khi nhiệm vụ độc lập; tránh nhiều worker cùng worktree khi có ghi file.
• Migrations/contract changes đi trước những branch tiêu thụ; tài liệu API dùng mock để frontend không bị chặn.
• PR template gồm scope, file modified, screenshot/API contract diff, test outputs, risks, source permission.
• Coordinator nhận mọi worker_done, re-check trạng thái và chỉ merge sau review/CI; không coi thông báo agent đã xong là QA.
• Daily integration window: chốt checkpoint trước khi cắt nhánh tiếp; tránh rebase khi agent đang chạy.
14.4. Cấu hình model/agent
Không ràng buộc một nhà cung cấp model cho một vai trò. Hãy chọn agent đã được Orca hỗ trợ và đã kết nối tài khoản; ví dụ các agent ID trong tài liệu có codex, claude, cursor, antigravity, muse. Ưu tiên một loại worker ổn định trong sprint 0; mở rộng model nếu có lý do đánh giá chất lượng hoặc chi phí. Tránh tạo nhiều agent có quyền chỉnh sửa toàn repo.
15. BACKLOG CHI TIẾT VÀ PHỤ THUỘC
Effort ước lượng theo ngày công agent (không phải lịch/ETA cam kết). Các task nhỏ phù hợp dispatch riêng, có trạng thái TODO. P0: bắt buộc MVP; P1: có thể sau MVP.
ID
Owner
Nhiệm vụ + đầu ra chính
Phụ thuộc
ƯT
DATA-000
A1
Kiểm tra giấy phép nguồn; phân loại quyền reuse; lập audit 36/43; DATA_POLICY + report; gate source
-
P0
ARCH-001
A0
Chốt PRD, personas, feature scope, ADR; PRD/ADR versioned, user flows
DATA-000
P0
ARCH-002
A0
OpenAPI schemas, errors, shared DTO + API examples; contract validated
ARCH-001
P0
ARCH-003
A0
Bootstrap monorepo + docker-compose + env sample; local boot README
ARCH-001
P0
DB-001
A3
PostGIS schema, Alembic migration + seed fixture; migration/test/rollback
ARCH-002/003
P0
DATA-001
A1
Foody-to-canonical adapter local audit, no public import; validation + reject report
ARCH-002
P0
DATA-002
A1
Licensed POI adapter (OSM/Geoapify), provenance records; attribution, legal scope tags
DATA-000/DB-001
P0
DATA-003
A1
Quality rules + dedupe + manual review queue; QA report/idempotent imports
DATA-001/002
P0
DATA-004
A1
Pilot-cluster selection and verified sample set; 30+ eligible for test or recorded blocker
DATA-003
P0
BE-001
A3
GET venues/search/detail and filter validation; OpenAPI+tests
DB-001
P0
BE-002
A3
Tour/session persistence, PATCH replace contract; CRUD+ttl tests
DB-001/ARCH-002
P0
BE-003
A3
Routing API adapter, retry/timeouts/quotas; mock tests+provider errors
ARCH-002
P0
AI-001
A2
Pydantic slot schema + extraction + follow-up policy; slot tests ≥30
ARCH-002
P0
AI-002
A2
Candidate filter, scoring, diversity explainability; ranking unit tests
BE-001
P0
AI-003
A2
Route matrix/planning heuristic and 2-opt; deterministic feasible tours
BE-003/AI-002
P0
AI-004
A2
Grounded generation + output verifier + replace stop; no hallucination on eval
AI-001/003/BE-002
P0
FE-001
A4
Design tokens, responsive shell, landing/chat; mobile mock flows
ARCH-002
P0
FE-002
A4
Timeline cards, source badges, budget warnings; display verified/unknown
FE-001
P0
FE-003
A4
Map route layers, provider errors, attribution; markers + route + fallback
FE-001
P0
FE-004
A4
Replace-one-stop + preference edits; replan UX e2e
FE-002/ARCH-002
P0
QA-001
A5
CI lint/type/unit, commit secret scan; green CI
ARCH-003
P0
QA-002
A5
Fixtures, test matrix, property tests for planner; edge cases green
AI-003/BE-001
P0
QA-003
A5
Prompt injection / API abuse / rate limit tests; security report
AI-004/BE-002
P0
INT-001
A0+A3
Integrate FE/BE/AI/data adapters; local end-to-end working
AI-004/FE-003/BE-002/DATA-004
P0
E2E-001
A5
Playwright mobile/desktop + 30–50 scenario eval; report with thresholds
INT-001/FE-004
P0
OPS-001
A3+A5
Deploy staging, backup/health/logs/quotas; smoke + rollback
E2E-001
P0
REL-001
A0
Sign-off with data/quality/license gates; release decision documented
OPS-001
P0
P1-001
A4
Save/share tours with expiry; privacy review
REL-001
P1
P1-002
A1
Incremental updates, freshness policy; scheduled update tests
REL-001
P1
P1-003
A2
Advanced preference & feedback ranking; offline eval improvement
REL-001
P1

15.1. Task card bắt buộc
Mỗi task của Orca phải ghi rõ: Goal, Input artifacts, Output artifacts, Allowed file paths, Forbidden changes, Dependencies, Acceptance tests, Test command, Evidence required, Escalation trigger, Priority, Reviewer. Mỗi task giữ tối đa một phần việc có thể code-review riêng.
16. MILESTONES, GATES VÀ KẾ HOẠCH TÍCH HỢP
Mốc
Kết quả
Điều kiện pass
M0: Data/legal
D0 audit, legal provenance, pilot cluster
GO/NO-GO công khai minh bạch; no unauthorized reuse
M1: Blueprint
PRD, ADR, OpenAPI, schema và repo
Contract freeze v1; all agents accept file ownership
M2: Skeleton
Migration, search API, mock frontend, import sample
Docker local boot, unit test, CI
M3: Planner
Tool calls, candidate filter/rank, route matrix, tour
Không bịa IDs, constrained tours, trace
M4: Integrated UX
Chat → timeline → map → replace stop
Playwright critical path desktop/mobile
M5: Staging & release
Health/logging/deploy, legal data gate, docs
No P0/P1 bugs; source permission; QA signoff

Đề xuất chia 2–3 waves coding đồng thời để giảm merge conflict, không chia 5 worker cùng commit vào API ngay từ đầu. Wave 1 gồm contracts, fixtures, UI mocks, CI. Wave 2 phát triển Data/Backend/AI/Frontend trên interface đã frozen. Wave 3 QA integration, fix và staging.
17. TEST, ĐÁNH GIÁ & RELEASE QUALITY GATE
17.1. Nhóm kiểm thử
Lớp
Ví dụ test
Tiêu chí
Data quality
Thiếu tọa độ, 0 price, duplicate ID, giờ [4] chưa rõ, venue online
Không bịa fallback; flags/reject đúng
Unit planner
Budget null, 0/1/3 POI, constraint clash, varied travel mode
Không crash; constraint checking deterministic
AI eval
30–50 utterances, tên món/địa điểm lạ, thay một stop
0 unknown venue ID; slot retention
Routing
Provider 429/500, timeout, invalid coord, zero distance
Graceful degradation; no invented ETA
API/security
422, 409, 429, injection, oversized prompt, CORS
No secrets; stable error codes
E2E
Chat → tour → map → change stop; mobile viewport
Không block, warnings surfaced
Manual usability
5–10 người test lần đầu nếu có thể
Thu nhận confusion, task success

17.2. Exit criteria gợi ý
• 0 quán không có trong dataset được xuất dưới dạng địa điểm xác minh; không có “đang mở” thiếu chứng cứ.
• 100% dữ liệu production phải có source/permission record; kiểm tra attribution trên bản đồ.
• ≥90% benchmark có constraint rõ được giữ đúng, tính trên ca có đủ dữ liệu cho validation; báo denominator.
• 0 lỗi P0/P1 chưa xử lý; mọi API quan trọng có integration tests; CI xanh.
• Các ca không đủ dữ liệu phải có lời giải thích, không trả về lịch trình mang tính khẳng định.
18. DEVOPS, BẢO MẬT & CHI PHÍ ƯỚC TÍNH
18.1. Môi trường & triển khai
01. Local: Docker Compose PostgreSQL+PostGIS, FastAPI reload, Next.js dev, fixtures synthetic/approved.
02. CI: lint/format/type check, unit/integration, SQL migration verify, test on PR.
03. Staging: web/API/DB tách secrets, sample POI đã duyệt; manual smoke trên mobile và desktop.
04. Production khi qua legal gate: HTTPS, rate limit, LLM API quota, DB backup, rotate API keys, incident process và rollback.
18.2. Mô hình chi phí và giả định
Chi phí thực sẽ phụ thuộc lượng người dùng, số route legs, hình nền bản đồ và tokens LLM. Chưa có số liệu tải và mức sử dụng nên KHÔNG chốt tổng tiền. Geoapify công bố Free plan 3.000 credits/ngày, 5 requests/giây (tại thời điểm tra cứu); Routing API có credit theo mỗi cặp waypoint và một số option phụ. Nếu sử dụng bản đồ tiles của Geoapify, tiles cũng trừ credits. Tham khảo https://www.geoapify.com/pricing/ và https://www.geoapify.com/pricing-details/.
Khoản
MVP demo
Theo dõi
DB
Docker local / hosted low-tier hoặc trial
Dung lượng, kết nối, backup
Web/API hosting
Có thể miễn phí/trial tùy nhà cung cấp nhưng có giới hạn
Cold start, egress, uptime, free-tier change
LLM
Đặt token cap per session, cache extraction khi phù hợp
Requests, prompt/completion tokens, failure rate
Routing/maps
Dùng quota thấp và cache theo điều khoản
Credits/day, p95, 429, map tiles
Vận hành
Secrets, domain nếu cần, monitoring cơ bản
Alert / incident / backups

18.3. Quy tắc an toàn
• Không commit Foody CSV nếu chưa rõ quyền; không public Git history chứa dataset/raw scrape.
• Dùng secrets server-side; OAuth/tài khoản chưa cần ở MVP.
• Xóa/ẩn nhật ký chat cá nhân theo TTL; cho người dùng từ chối lưu nội dung không cần thiết.
• Rate limit, CORS whitelist, input length/type validation, URL allowlist và retry backoff.
• Ưu tiên dữ liệu mở/được cấp phép; nêu rõ attribution (OSM ODbL, provider tiles) và điều khoản.
19. RỦI RO, PHƯƠNG ÁN DỰ PHÒNG & QUYẾT ĐỊNH
Rủi ro
Mức
Giảm thiểu / fallback
Foody dataset không có quyền công bố
Cao
Tách audit nội bộ; chuyển sang OSM/dataset có giấy phép + khảo sát thủ công
Giờ mở cửa không đáng tin
Cao
Không lọc open-at trừ verified; gắn warning
Giá quán không phải giá món
Cao
Hiển thị khoảng tham khảo; phát triển dataset dish-level riêng
Ít điểm trong một cụm
Cao
Chọn cụm có đủ 3–5 POI đa dạng, bổ sung dữ liệu
API route/quota bị giới hạn
Trung bình
Adapter swap, cache theo điều khoản, fail gracefully
Hallucination từ LLM
Cao
Tool whitelist, ID validation, grounded response, regression tests
Các agent sửa cùng file
Trung bình
Owner matrix, contracts freeze, worktree PR riêng
Model API/Orca đổi tính năng
Trung bình
Adapter, kiểm tra CLI, lock dependencies

19.1. Các quyết định cần xác nhận trong buổi thảo luận Work
01. Mức sử dụng dataset Foody: chỉ thử nghiệm nội bộ hay có giấy phép sử dụng/dự định xin quyền? Đây là gate bắt buộc.
02. Thành phố thí điểm: ưu tiên chọn cụm có dữ liệu dày trong Hà Nội, hay khảo sát thêm thành phố khác trước code?
03. Phạm vi địa điểm: chỉ quán ăn ngồi lại hay cho cả hàng rong/cafe/take-away?
04. Dữ liệu giờ mở cửa: cho phép cảnh báo “không xác minh” hay bắt buộc kiểm tra lại trước khi lập tour?
05. Mức chi phí: cho phép giá khoảng không chính xác hay phải có giá từng món để hứa tổng ngân sách?
06. Model provider: Gemini API hay provider khác, giới hạn chi phí/test budget?
07. Chế độ chạy Orca: số worker song song tối đa và agent ID nào đang được kết nối?
08. Mục tiêu đầu tiên: demo trên laptop, deploy public để nhóm người dùng test, hay dự án học thuật cần báo cáo kỹ thuật?
19.2. Quyết định kiến trúc đề xuất trước code
Khóa scope “Hà Nội, 1 khu vực thí điểm, 3–5 stops, đi bộ ưu tiên, một buổi, website tiếng Việt”. Bắt đầu bằng repo/schemas và dataset synthetic/approved; chỉ khi data gate hợp lệ mới import POI ngoài vào build public. Orca dùng 1 Coordinator + tối đa 3–4 worker song song ở wave code để kiểm soát merge và chi phí. Đây là đề xuất có thể chỉnh sửa, chưa phải cấu hình người dùng đã chấp thuận.
20. PHỤ LỤC A — MẪU PROMPT GIAO TASK CHO ORCA
20.1. Master prompt cho A0 (Coordinator)
Bạn là Coordinator cho AI FoodTour Planner.
Đọc docs/PRD.md, ARCHITECTURE.md, DATA_POLICY.md, contracts/openapi.yaml.
Chia công việc thành task nhỏ, mỗi task có ownership, input/output, phụ thuộc, test.
Không cho worker viết ngoài ownership nếu chưa duyệt. Tạo worktree riêng.
Bật legal gate: KHÔNG xuất bản/công khai dữ liệu Foody nếu chưa có quyền.
Đọc worker_done, kiểm tra diff và test evidence; review + merge sau CI.
Nếu thiếu dữ liệu, mark blocked, không giả định quán/giá/giờ mở cửa.
Mỗi integration checkpoint báo: done, evidence, blockers, next tasks.
20.2. Task worker template
ROLE: <Agent role>
TASK ID: <ID>   PRIORITY: <P0/P1>
GOAL: <outcome>
READ FIRST: <docs, contract, fixture>
OWNED PATHS: <allowed files>
DO NOT MODIFY: <forbidden paths>
DEPENDENCIES: <task IDs>
IMPLEMENTATION REQUIREMENTS: <behavior + error handling>
ACCEPTANCE: <observable assertions>
TEST COMMANDS: <commands and expected result>
OUTPUT: <modified paths, tests, screenshots/report, known limitations>
ESCALATE IF: <schema/contract change, license blocker, unknown scope>
SEND worker_done with both taskId and dispatchId only after checks.
20.3. Prompt mẫu AI-003
Implement AI-003: Build deterministic tour planner using candidate venue IDs,
route matrix durations, stay duration and constraints. Implement nearest-neighbor
and 2-opt baseline; add validity checker (no duplicates, within max duration,
walking route possible, optional budget unknown), and explicit warnings.
Only modify apps/api/app/planner/ and tests/planner/.
Never fabricate venue, dish price or open hours. Add tests for 0-5 candidates,
missing matrix, impossible constraints, replace-one-stop with locks.
Report algorithm tradeoffs and all test commands. Do not modify OpenAPI/schema.
21. PHỤ LỤC B — CHECKLIST KÍCH HOẠT DỰ ÁN
• [ ] Confirm legal provenance/permission of imported datasets before public release.
• [ ] Select pilot cluster and quantify approved, usable venue count.
• [ ] Approve PRD v1, API contract v1, source of truth docs.
• [ ] Confirm Orca installed: status --json; skills get orchestration --full.
• [ ] Create repo, protection and shared pre-commit/CI checks.
• [ ] Create task board, assign file ownership, dispatch Wave 1.
• [ ] Confirm all P0 unit, API, E2E tests and data gates.
• [ ] Review cloud provider attribution, quotas, privacy and rollback.
22. PHỤ LỤC C — NGUỒN & GIỚI HẠN THÔNG TIN
• File người dùng: restaurants_enriched (1).csv — 36 × 43, fetched_at 2026-10-15 UTC; số liệu audit trực tiếp.
• File người dùng: restaurants.csv — 80 × 18, tham chiếu trạng thái source_flags và source_license; nội dung không khẳng định sự thật ngoài nguồn.
• Orca orchestration (chính thức): https://github.com/stablyai/orca/blob/main/docs/site/content/docs/cli/orchestration.mdx (kiểm tra 15/10/2026).
• Orca CLI overview: https://github.com/stablyai/orca/blob/main/docs/site/content/docs/cli/overview.mdx
• Geoapify routing: https://apidocs.geoapify.com/docs/routing/
• Geoapify pricing: https://www.geoapify.com/pricing/ và https://www.geoapify.com/pricing-details/
• OpenStreetMap dataset Vietnam: https://download.geofabrik.de/asia/vietnam.html
• OSM license: https://www.openstreetmap.org/copyright (cần kiểm tra ODbL và cách ghi attribution trước khi dùng).
• Chưa thực hiện xác minh trực tiếp quán/giờ/menu và chưa chứng minh quyền tái phân phối dữ liệu Foody. Các mục liên quan phải tiếp tục audit trước khi triển khai công khai.
