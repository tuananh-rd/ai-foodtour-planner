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

## Kiểm thử trình duyệt thật (U6)
```powershell
# 1) API với origin của web:  $env:WEB_ORIGIN='http://127.0.0.1:13000'; python -m uvicorn app.main:app --port 18000   (từ backend/, PYTHONPATH=.)
# 2) Frontend build trỏ tới API rồi serve:
cd frontend; $env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18000'; npm run build; npx next start -p 13000
# 3) Probe (Edge/Chrome headless qua CDP, không thêm phụ thuộc):
node qa/e2e/browser_flow.mjs        # 16 kiểm tra ở 390px và 1280px
```
Đánh giá chất lượng (không cần trình duyệt): `PYTHONPATH=backend python qa/eval/run_eval.py [--data <đường dẫn tuyệt đối>]`.

## Provider cấu hình (chỉ vòng lặp cục bộ — chưa dùng dịch vụ thật)
Biến môi trường: `FOODTOUR_LLM=mock|live|off` (mặc định `mock`), `FOODTOUR_LLM_ENDPOINT`, `FOODTOUR_LLM_API_KEY`, `FOODTOUR_ROUTING=estimate|osrm` (mặc định `estimate`), `FOODTOUR_ROUTING_ENDPOINT`, `FOODTOUR_SESSION_DB` (SQLite, đường dẫn tuyệt đối), `WEB_ORIGIN` (danh sách origin phân tách bằng dấu phẩy). Trong phase này mọi endpoint provider phải là địa chỉ loopback (127.0.0.1); host ngoài bị từ chối cho tới khi bạn phê duyệt và cung cấp credential. `/health` báo `llm_configured`/`routing_configured`, không bao giờ trả khoá.

## Bằng chứng đã xác minh (overlay cục bộ, tuỳ chọn)
Mặc định giờ mở cửa và giá theo người là **chưa biết** nên tour tối đa là `conditional`. Khi bạn có nguồn đã xác minh, đặt `FOODTOUR_EVIDENCE_PATH` (đường dẫn tuyệt đối) tới một tệp JSON `{"schema":1,"entries":[...]}`; mỗi mục cần `venue_id` và, cho từng nhóm trường, `hours` (đủ 7 khóa "0".."6", "0"=Thứ Hai; danh sách rỗng = đóng cửa) + `hours_source` + `hours_verified_at` (YYYY-MM-DD), và/hoặc `price_per_person_vnd {min,max}` + `price_source` + `price_verified_at`. Mục thiếu nguồn hoặc ngày xác minh bị từ chối từng trường; tệp cấu hình mà thiếu/hỏng sẽ khiến API trả 503 đã che thông tin (không phục vụ dữ liệu "đã xác minh" giả). Ví dụ giả lập: `contracts/fixtures/evidence.synthetic.json`. Một tour chỉ thành `verified_feasible` khi giờ, giá theo người **và** tuyến (`provider_route`) đều đã xác minh.
