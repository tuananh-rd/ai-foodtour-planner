# Chạy AI FoodTour Planner trên máy local

Phạm vi: chạy cục bộ trên Windows, không Docker, không triển khai công khai. Gemini và định tuyến thật chỉ được dùng khi bạn tự cấu hình (xem mục "Cấu hình provider").

## Yêu cầu
- Python 3.11+ (máy này đã kiểm chứng với Python 3.14.4; đặt biến `PYTHON` nếu `python` không có trong PATH).
- Node.js 20+ và npm (đã kiểm chứng Node 24).

## Chạy nhanh (PowerShell, từ thư mục gốc repo)
```powershell
# API + giao diện web; tạo .venv và cài đúng backend/requirements.txt lần đầu
powershell -File scripts/dev.ps1 -Frontend
# Mở http://localhost:3000   (API: http://127.0.0.1:8000, xem /health)
```
Chỉ chạy API: `powershell -File scripts/dev.ps1` (thêm `-Port 18000` nếu 8000 đang bận). Bash: `scripts/dev.sh`.
Script dev chạy `uvicorn app.server:app`, entrypoint này đọc tệp cấu hình cục bộ `backend/.env` (bị git ignore). Chạy trực tiếp `app.main:app` thì **không** đọc `.env` (dùng cho test).

## Cấu hình provider (phase 3)
Sao chép `backend/.env.example` thành `backend/.env` rồi bỏ ghi chú các dòng cần dùng. Biến môi trường của tiến trình luôn được ưu tiên hơn tệp. Khoá API chỉ nằm phía server; không bao giờ được in, trả về trong `/health` hay commit.

| Mục đích | Biến | Ghi chú |
|---|---|---|
| Trích xuất bằng Gemini | `FOODTOUR_LLM=gemini`, `GEMINI_API_KEY` | Model mặc định `gemini-3.5-flash-lite` (đổi bằng `FOODTOUR_GEMINI_MODEL`). Gọi REST `generateContent` với JSON schema; mọi trường vẫn bị kiểm tra phía server. Nếu Gemini lỗi/quá hạn, bộ luật cục bộ trả lời và giao diện ghi rõ "(bộ luật cục bộ)". |
| Lời giải thích bằng Gemini | `FOODTOUR_EXPLAIN=gemini` | Gemini chỉ nhận dữ kiện của tour đã kiểm tra, **không có tên/địa chỉ/URL quán**. Văn bản phải qua bộ kiểm (không khẳng định đang mở cửa/giá mỗi người/an toàn dị ứng, mọi con số phải có trong dữ kiện, phải nói rõ điểm chưa xác minh); không đạt thì dùng văn bản mẫu. |
| Ngân sách gọi Gemini | `FOODTOUR_LLM_DAILY_BUDGET` (mặc định 200) | Tính theo tiến trình, theo ngày UTC. Lỗi máy chủ tạm thời (5xx) được thử lại đúng 1 lần; 429 (hết hạn mức) không thử lại. |
| Định tuyến đi bộ thật | `FOODTOUR_ROUTING=ors`, `ORS_API_KEY` | openrouteservice `foot-walking`: 1 lần gọi matrix cho mỗi lần lập tour/thay quán + 1 lần gọi directions (GeoJSON) cho hình học tuyến. Gói miễn phí của ORS cần bạn tự đăng ký; giới hạn công bố (chưa kiểm chứng lại): directions 2.000/ngày, matrix 500/ngày. |
| Định tuyến qua OSRM | `FOODTOUR_ROUTING=osrm`, `FOODTOUR_ROUTING_ENDPOINT` | Máy chủ OSRM có profile `foot` (tự host ở 127.0.0.1:port, hoặc host HTTPS bạn thêm vào `FOODTOUR_PROVIDER_HOSTS`). Dùng `table` + `route` (steps GeoJSON). |
| Ngân sách định tuyến | `FOODTOUR_ROUTING_DAILY_BUDGET` (mặc định 400) | Đếm số lần gọi matrix/route. |
| Host HTTPS được phép | `FOODTOUR_PROVIDER_HOSTS` | Danh sách chính xác, phân tách dấu phẩy. Host chính thức của provider bạn đã bật (Gemini, ORS) được tự thêm. Mọi host khác bị từ chối trước khi mở socket; không proxy, không redirect. |

Kiểm tra cấu hình: `curl http://127.0.0.1:8000/health` → `llm_provider`, `llm_model`, `explanation_provider`, `routing_provider`, `routing` (`provider_route` chỉ sau khi provider thật sự trả lời), `routing_last_error`.

**Vị trí hiện tại**: ứng dụng chỉ xin vị trí khi bạn bấm nút; tuỳ trình duyệt, chính trình duyệt có thể dùng dịch vụ vị trí của hãng trình duyệt (ngoài tầm kiểm soát của ứng dụng). Toạ độ này trở thành điểm xuất phát, được giữ trong phiên (có TTL) và gửi tới máy chủ và, khi lập tuyến, tới Google Routes.

**Dữ liệu được gửi ra ngoài khi bật provider**: Gemini nhận tin nhắn chat của người dùng và sở thích trước đó (tránh nhập thông tin cá nhân); lời giải thích chỉ gửi dữ kiện số/nhãn, không gửi danh tính quán. Định tuyến gửi **toạ độ** điểm xuất phát và các quán ứng viên (≤ 15 điểm mỗi lần lập tour, ≤ 45 khi thay quán) tới nhà cung cấp định tuyến — toạ độ quán là một phần của bộ dữ liệu riêng, nên chỉ bật khi bạn chấp nhận điều này.

## Dữ liệu
- Mặc định: **fixture tổng hợp có gắn nhãn** `contracts/fixtures/venues.synthetic.json`; UI hiện "DỮ LIỆU GIẢ LẬP".
- Dữ liệu riêng cục bộ (không đưa vào Git): `FOODTOUR_DATA_PATH` = đường dẫn tuyệt đối tới CSV/JSON. `/health` báo `dataset_source: private` và `dataset_version` (sha256). Chưa có quyền tái sử dụng công khai cho dữ liệu này.
- Bằng chứng đã xác minh (tuỳ chọn): `FOODTOUR_EVIDENCE_PATH` — xem mục cuối.
- Phiên bền vững: `FOODTOUR_SESSION_DB` = đường dẫn tuyệt đối tới tệp SQLite.

## Kiểm thử
```powershell
powershell -File scripts/test.ps1   # unit (planner, llm, data, api, providers với server giả) + OpenAPI drift + build frontend
node qa/e2e/test_api_scenarios.mjs  # E2E trên API thật (API ở http://127.0.0.1:18000)
node qa/e2e/test_components.mjs     # kiểm tra render component
```
Test **không** gọi dịch vụ thật (Gemini/định tuyến dùng server giả trên 127.0.0.1). Kỳ vọng hiện biết: 1 test legacy (`test_budget_and_source`) skip khi không có `data/venues.json`.

Đánh giá chất lượng:
```powershell
$env:PYTHONPATH='backend'
python qa/eval/run_eval.py                                   # bộ luật, không gọi mạng
python qa/eval/run_eval.py --extractor gemini --explain gemini # GỌI GEMINI THẬT (tốn hạn mức)
python qa/eval/geo_audit.py --data <đường dẫn tuyệt đối>     # cờ hợp lý toạ độ (không phải geoverify)
```

Kiểm thử trình duyệt thật:
```powershell
# 1) API: từ backend/, PYTHONPATH=.  $env:WEB_ORIGIN='http://127.0.0.1:13000'; python -m uvicorn app.main:app --port 18000
# 2) Web: cd frontend; $env:NEXT_PUBLIC_API_URL='http://127.0.0.1:18000'; npm run build; npx next start -p 13000
node qa/e2e/browser_flow.mjs   # 18 kiểm tra ở 390px và 1280px (Edge/Chrome headless qua CDP)
```

## Thử bằng tay (luồng chính)
1. "Muốn ăn bún và chè quanh Hồ Gươm" → hệ thống hỏi thời lượng.
2. "3 giờ, ngân sách 200k mỗi người, 3 quán" → tour 3 điểm, trạng thái **conditional**. Nhãn dưới tin nhắn cho biết trích xuất bằng Gemini hay bộ luật.
3. "Đổi quán" ở một điểm → các điểm khác được khoá, thứ tự giữ nguyên.
4. Chế độ nghiêm ngặt → `insufficient_evidence` trừ khi giờ, giá theo người và tuyến thật đều đã xác minh.

## Giới hạn trung thực (phải đọc)
- **Giờ mở cửa chưa xác minh** cho mọi quán; **giá là khoảng giá của quán**, không phải hoá đơn mỗi người. Chỉ overlay bằng chứng có nguồn mới thay đổi được điều này.
- **Tuyến đi bộ thật chỉ có khi bạn cấu hình ORS/OSRM.** Mặc định vẫn là ước tính đường chim bay, được gắn nhãn và vẽ nét đứt có chú thích "không phải tuyến đi". Code định tuyến thật mới được kiểm bằng server giả; **chưa có lần gọi provider định tuyến thật nào** (chưa có key/endpoint).
- Gemini: trích xuất và lời giải thích đã được gọi thật và đo (xem `qa/reports/EVAL_P3.md`); kết quả của model có dao động giữa các lần gọi, có lúc quá hạn — hệ thống tự rơi về bộ luật/văn bản mẫu và ghi rõ.
- Toạ độ chưa được geoverify; `geo_audit.py` chỉ gắn cờ bất thường.
- Chưa có DB/PostGIS thật (SQLite cho phiên), chưa chạy CI từ xa, chưa có đánh giá của người dùng thật về chất lượng tour.

## Bằng chứng đã xác minh (overlay cục bộ, tuỳ chọn)
Đặt `FOODTOUR_EVIDENCE_PATH` (đường dẫn tuyệt đối) tới JSON `{"schema":1,"entries":[...]}`; mỗi mục cần `venue_id` và, cho từng nhóm trường, `hours` (đủ 7 khóa "0".."6", "0"=Thứ Hai; danh sách rỗng = đóng cửa) + `hours_source` + `hours_verified_at` (YYYY-MM-DD), và/hoặc `price_per_person_vnd {min,max}` + `price_source` + `price_verified_at`. Mục thiếu nguồn hoặc ngày xác minh bị từ chối từng trường; tệp cấu hình mà thiếu/hỏng khiến API trả 503 (không phục vụ dữ liệu "đã xác minh" giả). Ví dụ giả lập: `contracts/fixtures/evidence.synthetic.json`. Tour chỉ thành `verified_feasible` khi giờ, giá theo người **và** tuyến (`provider_route`) đều đã xác minh.
