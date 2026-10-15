# Chạy bản MVP local — AI FoodTour Planner

Phạm vi: chạy cục bộ trên Windows, không Docker, không dịch vụ trả phí, không triển khai công khai.

## Yêu cầu
- Python 3.11+ (máy này đã kiểm chứng với Python 3.14.4; đặt biến `PYTHON` nếu `python` không có trong PATH).
- Node.js 20+ và npm (đã kiểm chứng Node 24).

## Chạy nhanh (PowerShell, từ thư mục gốc repo)
```powershell
# API + giao diện web; tạo .venv và cài đúng backend/requirements.txt lần đầu
powershell -File scripts/dev.ps1 -Frontend
# Mở http://localhost:3000   (API: http://127.0.0.1:8000, /health xem dataset_source)
```
Chỉ chạy API: `powershell -File scripts/dev.ps1` (thêm `-Port 18000` nếu 8000 đang bận).
Bash: `scripts/dev.sh`.

## Dữ liệu
- Mặc định (không đặt gì): dùng **fixture tổng hợp có gắn nhãn** `contracts/fixtures/venues.synthetic.json`; UI hiện "DỮ LIỆU GIẢ LẬP".
- Dữ liệu riêng cục bộ (không đưa vào Git): đặt đường dẫn tuyệt đối tới CSV/JSON trước khi chạy:
  ```powershell
  $env:FOODTOUR_DATA_PATH = 'C:/đường/dẫn/tuyệt/đối/restaurants_enriched.csv'
  powershell -File scripts/dev.ps1 -Frontend
  ```
  `/health` sẽ báo `dataset_source: private` và `dataset_version` (sha256). Không có quyền tái sử dụng công khai đã được xác lập cho dữ liệu này.

## Kiểm thử
```powershell
powershell -File scripts/test.ps1   # unit (planner, llm, data, api) + OpenAPI drift + build frontend
node qa/e2e/test_api_scenarios.mjs  # E2E trên API thật (cần API chạy ở http://127.0.0.1:18000)
```
Kỳ vọng hiện biết: 1 test legacy (`test_budget_and_source`) được đánh dấu skip khi không có `data/venues.json`; `npm test` frontend báo `EXPECTED-SKIP` nếu cây chưa có script test.

## Thử bằng tay (luồng chính)
1. Nhập: "Muốn ăn bún và chè quanh Hồ Gươm" → hệ thống hỏi thời lượng.
2. Nhập: "3 giờ, ngân sách 200k mỗi người, 3 quán" → tour 3 điểm, trạng thái **conditional**.
3. Chọn một điểm dừng → thay thế; các điểm còn lại được khoá, thứ tự giữ nguyên.
4. Đổi sang chế độ nghiêm ngặt → `insufficient_evidence` (giờ/giá/tuyến chưa xác minh).

## Giới hạn trung thực (phải đọc)
- Giờ mở cửa **chưa xác minh** cho mọi quán (ánh xạ thứ trong tuần chưa rõ); giá là **khoảng giá của quán**, không phải hoá đơn mỗi người.
- Quãng đường là **ước tính đường chim bay** (`straight_line_estimate`), chưa có định tuyến thật; bản đồ không vẽ tuyến khi chưa có `provider_route`.
- Phần trích xuất tiếng Việt là bộ luật mock, **không phải LLM live**; chưa có nhà cung cấp LLM/định tuyến vì chưa được phê duyệt/credential.
- Phiên lưu trong bộ nhớ một tiến trình (mất khi khởi động lại); tìm kiếm có giới hạn pool (có thông báo khi bị cắt).
- Chưa chạy thử trên Linux/CI từ xa, chưa có DB/PostGIS thật, chưa geoverify toạ độ.
- Tính năng chưa thuộc P0: tài khoản, nhiều tour thay thế, nhiều phương tiện, chia sẻ, triển khai công khai.
