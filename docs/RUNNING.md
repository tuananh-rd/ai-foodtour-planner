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
| Ngân sách gọi Gemini | `FOODTOUR_LLM_DAILY_BUDGET` (mặc định 18, free tier ~20/ngày) | Đặt lại lúc nửa đêm giờ Thái Bình Dương; lưu bền trong file SQLite riêng `<FOODTOUR_SESSION_DB>.budget.sqlite` (đổi bằng `FOODTOUR_BUDGET_DB`). Luật cục bộ chạy trước, chỉ gọi LLM khi luật không đủ; 429 đánh dấu hết lượt; `/health.llm_budget` hiển thị còn bao nhiêu. Lỗi 5xx tạm thời thử lại đúng 1 lần. |
| Xếp hạng theo điểm nguồn | `FOODTOUR_RANK_QUALITY_WEIGHT` (mặc định 1.0, 0 = tắt) | Rating/review chỉ làm tie-break nhỏ sau mức khớp sở thích, làm mượt Bayes; hiển thị `/health.ranking`. |
| Giao diện hành trình trước (UI_V2) | `FOODTOUR_UI_V2=1` hoặc `?ui=v2` | Mặc định tắt (bố cục cũ giữ nguyên). Thuật ngữ kỹ thuật chỉ hiện với `?dev=1`. Kiểm thử: `node qa/e2e/test_ui_v2.mjs`, `test_components.mjs`, `test_ui_kit.mjs`, `test_maps_links_cdp.mjs`, `test_api_v16.mjs` (build production trong thư mục tạm, không chạm cổng 3000/8000). |
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
node qa/e2e/browser_flow.mjs   # 28 kiểm tra ở 390px và 1280px (Edge/Chrome headless qua CDP)
```

Kiểm thử khởi động nguội Google Maps (chạy mã sản phẩm thật, **không cần key thật**): chạy API với key giả trong môi trường tiến trình để `/v1/client-config` ở trạng thái `ready`, build frontend trỏ tới API đó, rồi:
```powershell
# API:  $env:GOOGLE_MAPS_BROWSER_KEY='fake-test-key'; $env:GOOGLE_MAPS_MAP_ID='fake-map'; python -m uvicorn app.main:app --port 18000  (từ backend/, PYTHONPATH=.)
node qa/e2e/test_cold_bootstrap.mjs   # chặn request tới maps.googleapis.com và trả bootstrap script giả đúng cơ chế importLibrary
python qa/integration/test_ph4_api.py   # (python) kiểm thử hộp đen API phase 4: client-config, venues/map, geocode, origin metadata, rò rỉ khoá
```
Các test này dùng bản giả của Google chỉ trong trình duyệt kiểm thử; chúng **không** thay thế việc kiểm với key thật (xem `qa/live/google_smoke.py`).

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

## Google Maps URLs miễn phí (không cần key)

`GET /v1/sessions/{id}/tour/maps-links?mode=walking|driving` cần `X-Session-Token` và tour có điểm dừng; mặc định `walking`, thiếu tour trả `409 no_tour`. Backend chỉ tạo URL, không gọi Google API, không cần key, cấu hình hay billing. Ví dụ giả lập cho frontend: `contracts/fixtures/maps_links.synthetic.json`.

Theo [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), mỗi URL giới hạn 2.048 ký tự và dùng tối đa 3 waypoint để phù hợp trình duyệt di động; một số client có thể bỏ qua waypoint. Các link liên tiếp trong cùng đoạn lặp lại điểm nối, giữ thứ tự tour; địa chỉ thay thế có thể được Google hiểu khác. `partial`/`unavailable`, `skipped` và `notes` giải thích điểm không dùng được; không nối qua khoảng trống. Link gửi tọa độ/địa chỉ tới Google chỉ khi người dùng mở. Lịch trình là đề xuất của ứng dụng; Google có thể hiển thị thời gian khác, backend không xác nhận thời gian hay khoảng cách của Google. UI mở link với `target="_blank" rel="noopener noreferrer"` và hiển thị mọi ghi chú.

## Bằng chứng đã xác minh (overlay cục bộ, tuỳ chọn)
Đặt `FOODTOUR_EVIDENCE_PATH` (đường dẫn tuyệt đối) tới JSON `{"schema":1,"entries":[...]}`; mỗi mục cần `venue_id` và, cho từng nhóm trường, `hours` (đủ 7 khóa "0".."6", "0"=Thứ Hai; danh sách rỗng = đóng cửa) + `hours_source` + `hours_verified_at` (YYYY-MM-DD), và/hoặc `price_per_person_vnd {min,max}` + `price_source` + `price_verified_at`. Mục thiếu nguồn hoặc ngày xác minh bị từ chối từng trường; tệp cấu hình mà thiếu/hỏng khiến API trả 503 (không phục vụ dữ liệu "đã xác minh" giả). Ví dụ giả lập: `contracts/fixtures/evidence.synthetic.json`. Tour chỉ thành `verified_feasible` khi giờ, giá theo người **và** tuyến (`provider_route`) đều đã xác minh.

## Chat hội thoại v2 (FOODTOUR_CHAT_V2)

Guided chat (contract v1.9.1): set `FOODTOUR_UI_GUIDED=1` together with
`FOODTOUR_CHAT_V2=1`; both default to false. `features.guided_ui` in client-config
is true only when both flags are on. The cached engine is rebuilt when this flag
changes. With chat off, `/chat` returns 404; `/messages` keeps its legacy wire.
With chat on and guided off, `/chat` keeps the v1.8 wire including top-level
`llm_budget`. With both on, `/chat` omits that top-level counter and returns
`turn.trigger_reason`, `turn.coverage`, `turn.llm_calls`, and `turn.llm_budget`.
The latter contains bounded session counts and only a public daily status:
`exhausted` when remaining <= reserve, `low` when remaining <= reserve+2,
otherwise `ok`; no configured chat provider means `unavailable` with zero session
counts. Guided public budget scope is explicitly null until known.
Unresolved allergy, unconfirmed AI allergy, and ambiguous budget scope block
planner execution independently of the displayed pending question.

QA scripts can share the persisted daily ledger without constructing a provider:

```python
from app.repositories.llm_budget import ledger_record, ledger_remaining
ledger_record(calls=1, source="smoke")  # record an already-made transport attempt
remaining = ledger_remaining()         # internal script use only
```

Use the same `FOODTOUR_BUDGET_DB` absolute path and `FOODTOUR_LLM_DAILY_BUDGET`
(default 18) as the app. If the budget path is unset, both app and scripts use
`FOODTOUR_SESSION_DB + ".budget.sqlite"`. The script helpers require one of these
persistent paths; they refuse an isolated in-memory ledger. `source` accepts only
`app` or `smoke`; counts must be nonnegative integers. Recording is atomic across
processes, uses the app's Pacific-midnight reset and exhausted status, and counts
already-made attempts even beyond the limit. App transport admissions already
increment the counter: do not record them twice. This helper grants no permission
to make live calls.

Bật bằng `FOODTOUR_CHAT_V2=1` (mặc định tắt; `/messages` cũ không đổi). `GET /v1/client-config` trả `features.chat_v2`; `POST /v1/sessions/{id}/chat` nhận `{text|action, revision}` và trả các khối phản hồi (văn bản, thẻ quán, bảng so sánh, câu hỏi làm rõ, bản xác nhận, `tour_ready`). Chỉ khi người dùng xác nhận (`confirm_yes`) mới lập tour, từ **đúng các quán đã chọn**.

| Cấu hình | Mặc định | Ý nghĩa |
|---|---|---|
| `FOODTOUR_LLM_SESSION_CAP` | 6 | Số lượt Gemini tối đa cho một phiên chat |
| `FOODTOUR_LLM_RESERVE` | 3 | Số lượt/ngày dành lại, không dùng cho hiểu tin nhắn |

Hiểu tin nhắn: luật cục bộ trước (0 lượt Gemini); chỉ khi luật không chắc mới gọi Gemini tối đa 1 lần/lượt, gửi văn bản lượt hiện tại và trạng thái rút gọn (không tên quán, không toạ độ, không địa chỉ). Hết lượt/lỗi: hỏi làm rõ có nút bấm. Dị ứng: không quán nào được gắn "an toàn" (dữ liệu không có nguyên liệu).

Kiểm thử: `python qa/chat/run_scenarios.py` (CH-01…12 + ADV-01…14, dữ liệu mô phỏng `contracts/fixtures/venues.chat.synthetic.json`), `python qa/chat/eval_utterances.py`, `python -m unittest discover -s backend/tests`. Gemini thật (tối đa 8 lượt): `PYTHONPATH=backend python qa/live/chat_gemini_smoke.py` — chỉ chạy khi được phép vì tiêu hạn mức ngày.
