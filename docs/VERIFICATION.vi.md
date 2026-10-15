# Bằng chứng triển khai

Kiểm tra ngày 15/10/2026 trong Work Windows.

- Audit chạy trực tiếp bản đính kèm mới: 36 bản ghi, 43 trường, UTF-8 strict. Hash và đường dẫn tại audit.json. Đã giữ bản raw local trong data/raw (Git ignore) để không phụ thuộc tệp tạm.
- Kiểm tra bổ sung: 0 giá min > max; các chuỗi giờ raw đúng HH:mm trong miền 00:00–23:59; 5 quán có hai khoảng giờ. Điều này chỉ kiểm cú pháp, không xác minh lịch ngày. Không có ký tự Unicode replacement U+FFFD trong dữ liệu parse.
- `python -m unittest discover -v` tại backend: **5/5 pass**. Gồm strict từ chối, tổng cận trên tham khảo trong budget, loại online, không match thành phố, giá unknown không thành miễn phí, HTTP schema validation. Có cảnh báo deprecation của Starlette TestClient/httpx; chưa ảnh hưởng kết quả.
- `npm install` thành công; package-lock.json được tạo. `npm run build`: **exit 0**, Next.js 15.5.28, compile và prerender thành công.
- FastAPI khởi chạy loopback cổng 8000. HTTP request thực POST /v1/plans trả conditional_suggestions, 3 stop, tổng cận trên khoảng giá quán 134.000 VND cho request mẫu 200.000 VND. Không phải chi phí ăn thực tế được xác nhận. Response giữ nguồn và cảnh báo; lưu sample-response.json.
- OpenAPI lấy từ server chạy thực và lưu openapi.json.
- Chưa kiểm thử trình duyệt tương tác/E2E, database migration trên PostgreSQL, routing provider, LLM hoặc deploy remote. Không có kết luận chúng đã hoạt động.
- Orca runtime reachable, repository được đăng ký. run-create lỗi no_active_sender_terminal. Không Run/Task/Dispatch/worker hoặc worktree nào được tạo. Sáu vai trò trong PLAN là phân công đề xuất, không phải báo cáo agent đã làm việc.
- Git repository đã init main, chưa có commit/PR/remote. Dữ liệu chưa có giấy phép xác nhận; không phát hành public.
