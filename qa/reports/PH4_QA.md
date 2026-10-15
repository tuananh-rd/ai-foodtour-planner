# Báo Cáo Nghiệm Thu QA Độc Lập Phase 4: Tích Hợp Backend & Planner HTTP API (PH4-QA)

- **Mã nhiệm vụ Orca:** `task_897ee1a5beba`
- **Mã phân phối (Dispatch ID):** `ctx_0ceeb4205bdf`
- **Tác giả:** Antigravity (Frontend & Independent Integration QA)
- **Điều phối viên / Người thẩm định (Review Owner):** Claude (`term_a08c6353-9bd2-4bae-820f-4d66ed153569`)
- **Chủ quản Backend:** Codex (`foodtour-codex-backend`)
- **Ngày thực hiện:** 15/10/2026
- **Môi trường thực thi:**
  - Python: `3.14.4` (`foodtour-codex-backend/.venv/Scripts/python.exe`)
  - Server: `uvicorn app.server:app` chạy trên cổng động tự do (ephemeral port `62808` / `62809`, không ảnh hưởng cổng dev `3000`/`8000`)
  - Dữ liệu: Bộ dữ liệu nhân tạo chuẩn `contracts/fixtures/venues.synthetic.json` (`FOODTOUR_DATA_PATH` unset)
  - Cấu hình provider: `FOODTOUR_LLM=mock`, `FOODTOUR_ROUTING=estimate`, các biến khóa Google/Gemini không được cấp và được unset tuyệt đối.

---

## 1. Tóm Tắt Điều Hành (Executive Summary)

1. **Những gì đã thực hiện (What was done):**
   Đã hợp nhất nhánh tích hợp `foodtour-claude-coordinator` (commit `2145d07`) vào worktree của Antigravity, thiết kế và thực thi toàn diện bộ kiểm thử độc lập black-box HTTP API mới tại `qa/integration/test_ph4_api.py` bao phủ 100% các kịch bản nghiệm thu Contract v1.5 của backend và planner trên máy chủ FastAPI cục bộ.

2. **Những gì đã phát hiện (What was found):**
   Toàn bộ **162/162 bài kiểm tra** đều đạt kết quả **PASS (100%)** qua 7 kịch bản kiểm thử: định dạng `/v1/client-config` đúng chuẩn không khóa với header `no-store`; lọc bbox và áp trần `limit<=500` chuẩn xác loại trừ toàn bộ quán online-only và quán lỗi tọa độ; `/v1/geocode` xác thực token nghiêm ngặt, áp hạn mức rate-limit 429 sau 60 request và không phản hồi lộ query; metadata `origin_label` và `origin_source` được kiểm tra chặt chẽ không làm thay đổi kết quả lập lịch; luồng tin nhắn quy tắc xử lý đúng mốc địa danh và hỏi bổ sung khi gặp địa điểm lạ; tuyến ước tính không chứa polyline geometry hay route provider; quét toàn bộ 160 giao dịch HTTP và nhật ký máy chủ khẳng định 0 rò rỉ token hay API key.

3. **Những gì còn lại (What's left):**
   Các dịch vụ đám mây thực tế của Google (Routes API, Geocoding API, Maps JS Loader) và Gemini LLM được ghi nhận trung thực trong danh mục chưa kiểm thử do chưa có khóa dịch vụ theo chỉ thị dự án; kịch bản (8) về ngữ nghĩa dữ liệu cũ (`stale/dataset_changed`) được bỏ qua vì đã do Codex phụ trách.

---

## 2. Bảng Tổng Hợp Kết Quả Kịch Bản (Scenarios 1–8)

| Kịch bản | Mô tả kiểm thử Contract v1.5 | Kết quả | Số lượng kiểm tra | Ghi chú & Chủ quản liên quan |
|:---|:---|:---:|:---:|:---|
| **(1) Client Config** | `GET /v1/client-config`: cấu trúc unavailable, `js_api_key` và `map_id` có giá trị `null` (không bị omit), không lộ secrets, header `Cache-Control: no-store`. | **PASS** | 14/14 | Khớp hoàn toàn Contract v1.5 (Codex BE) |
| **(2) Venue Map** | `GET /v1/venues/map`: tính đúng đắn lọc bbox so với `/v1/venues`, trần `limit<=500` (501 -> 422), cờ `truncated`, thứ tự xác định, chỉ trả quán vật lý tọa độ chuẩn, không chứa thông tin giờ mở cửa hay giá theo người, xử lý bbox ngược/lỗi. | **PASS** | 32/32 | Loại bỏ đúng SYN-009 (online) và SYN-010 (geo lỗi) (Codex BE) |
| **(3) Geocode** | `POST /v1/geocode`: 401 khi thiếu token, 403 khi sai token, trạng thái `unavailable` khi chưa cấu hình provider, kiểm tra độ dài query (>200) & ký tự điều khiển, rate limit 429 sau đợt burst, không phản hồi lộ query trong lỗi. | **PASS** | 19/19 | Rate limit chạm tại request 61 per token (Codex BE) |
| **(4) Session Origin Metadata** | `PUT /v1/sessions/{id}/preferences`: từ chối ký tự điều khiển trong `origin_label`, độ dài > 120, enum không hợp lệ; chấp nhận tất cả enum hợp lệ; lưu trữ bền vững qua `GET /v1/sessions/{id}`; khẳng định `origin_source` không bao giờ làm đổi kết quả lập tour. | **PASS** | 43/43 | Độc lập hoàn toàn giữa metadata hiển thị và thuật toán planner (Codex BE / Claude Planner) |
| **(5) Free-text Origin Message Flow** | `POST /v1/sessions/{id}/messages`: với bộ trích xuất quy tắc (`MockExtractor`) không tạo `origin_text`; xác nhận câu hỏi bổ sung khi gặp địa điểm chưa biết; địa danh có sẵn (Hồ Gươm) tự động gán `origin_label` và `origin_source=landmark` và lập tour. | **PASS** | 19/19 | Hoạt động trích xuất quy tắc fail-closed chuẩn mực (Claude LLM / Codex BE) |
| **(6) Tour Output** | Chặng ước tính (`straight_line_estimate`): `geometry` là `null`, `totals.route_provider` là `null`, `route_warnings` là mảng rỗng `[]`. | **PASS** | 8/8 | Tuyệt đối không sinh polyline ảo cho chặng ước tính (Claude Planner) |
| **(7) Injection & Privacy Scanning** | Quét toàn bộ phản hồi HTTP (160 requests) và stdout/stderr của uvicorn: không có chuỗi định dạng API key hay token phiên bị rò rỉ ra ngoài. | **PASS** | 2/2 | 0 token leak, 0 API key pattern (An toàn bảo mật) |
| **(8) Stale / Dataset Changed** | Ngữ nghĩa thay đổi bộ dữ liệu giữa các phiên. | **SKIPPED** | — | Bỏ qua theo chỉ thị nhiệm vụ (Codex đã bao phủ) |

---

## 3. Chi Tiết Từng Kịch Bản Kiểm Thử & Nhật Ký Giao Dịch HTTP

### Kịch bản 1: `GET /v1/client-config`
- **Mục tiêu:** Xác minh khi không có khóa Google Maps, endpoint trả về trạng thái `unavailable` an toàn, cấu hình mặc định tại Hà Nội, không lộ secret, có header `Cache-Control: no-store`, và quan trọng nhất là các trường `js_api_key` và `map_id` phải xuất hiện rõ ràng với giá trị `null` trong JSON thay vì bị loại bỏ khỏi schema.
- **Yêu cầu & Phản hồi thực tế:**
  - `GET /v1/client-config` -> HTTP 200 OK (Latency: 1.1ms)
  - Headers quan sát: `Cache-Control: no-store`, `x-content-type-options: nosniff`
  - Thân phản hồi JSON:
    ```json
    {
      "maps": {
        "provider": "google",
        "status": "unavailable",
        "reason": "not_configured",
        "js_api_key": null,
        "map_id": null,
        "language": "vi",
        "region": "VN",
        "default_center": {
          "lat": 21.0285,
          "lon": 105.8522
        },
        "default_zoom": 15
      },
      "geocoding": {
        "status": "unavailable"
      },
      "routing": {
        "provider": "estimate",
        "status": "unavailable"
      },
      "privacy": {
        "sent_to_google": [
          "map_tiles",
          "autocomplete_text",
          "route_coordinates"
        ],
        "doc": "docs/PHASE4.md"
      }
    }
    ```
- **Đánh giá:** **PASS**. Các trường `js_api_key: null` và `map_id: null` có mặt nguyên vẹn trong JSON thô, tuân thủ đúng cam kết Contract v1.5 cho giao diện người dùng.

---

### Kịch bản 2: `GET /v1/venues/map`
- **Mục tiêu:** Xác minh tính toàn vẹn của dữ liệu địa điểm phục vụ hiển thị bản đồ:
  1. Kiểm tra lọc bounding box so với danh sách chuẩn từ `GET /v1/venues`.
  2. Kiểm tra giới hạn: `limit=501` trả về 422; `limit=0` trả về 422; `limit=500` thành công.
  3. Kiểm tra cờ `truncated`: khi `limit=2` (< tổng 10 quán trong vùng), `truncated=true`, trả về đúng 2 quán nhưng trường `total_in_view=10`.
  4. Kiểm tra sắp xếp xác định theo `id`.
  5. Loại bỏ quán không hợp lệ: quán online-only (`SYN-009`) và quán lỗi tọa độ (`SYN-010`) không bao giờ xuất hiện.
  6. An toàn dữ liệu: các mục trong danh sách bản đồ chỉ chứa trường cho phép (`MapVenue`), tuyệt đối không có thông tin giờ mở cửa (`hours`, `hours_display`) hay tuyên bố giá theo người (`price_semantics`, `per_person`).
  7. Bbox lỗi: `min_lat > max_lat` hoặc `min_lon > max_lon` hoặc tọa độ ngoài phạm vi [-90, 90], [-180, 180] đều trả về 422 `validation_error`.
- **Yêu cầu & Phản hồi mẫu:**
  - `GET /v1/venues/map?min_lat=21.025&max_lat=21.040&min_lon=105.845&max_lon=105.860&limit=500` -> HTTP 200 OK.
    - `total_in_view`: 10
    - `truncated`: false
    - `items`: 10 quán vật lý (`SYN-001`, `SYN-002`, `SYN-003`, `SYN-004`, `SYN-005`, `SYN-006`, `SYN-007`, `SYN-008`, `SYN-011`, `SYN-012`). Không có `SYN-009` và `SYN-010`.
  - `GET /v1/venues/map?...&limit=501` -> HTTP 422 Unprocessable Entity
    ```json
    {
      "error": {
        "code": "validation_error",
        "message": "Yêu cầu không hợp lệ."
      }
    }
    ```
  - `GET /v1/venues/map?min_lat=22.0&max_lat=21.0&min_lon=105.0&max_lon=106.0` (vĩ độ đảo ngược) -> HTTP 422 Unprocessable Entity
    ```json
    {
      "error": {
        "code": "validation_error",
        "message": "Giới hạn bản đồ không hợp lệ."
      }
    }
    ```
- **Đánh giá:** **PASS**. Dữ liệu quán trên bản đồ nhẹ, sạch, không có tuyên bố giờ giấc hay giá chưa kiểm chứng.

---

### Kịch bản 3: `POST /v1/geocode`
- **Mục tiêu:** Kiểm tra cơ chế định vị địa chỉ phụ trợ trên máy chủ:
  1. Thiếu header `X-Session-Token` -> HTTP 401 `unauthorized_session`.
  2. Header `X-Session-Token` sai -> HTTP 403 `unauthorized_session`.
  3. Token hợp lệ nhưng provider chưa cấu hình -> HTTP 200 với `status: "unavailable"`, `results: []` (theo đúng Contract v1.5 addendum thay vì 503).
  4. Query quá dài (>200 ký tự), rỗng, toàn khoảng trắng hoặc chứa ký tự điều khiển ASCII -> HTTP 422 `validation_error`.
  5. Bảo vệ riêng tư: không phản ánh (no-echo) nội dung query bị từ chối vào thông báo lỗi.
  6. Rate limiting: gửi liên tục yêu cầu trong cùng phiên làm việc, kích hoạt HTTP 429 `rate_limited` khi vượt ngưỡng hạn ngạch.
- **Yêu cầu & Phản hồi mẫu:**
  - `POST /v1/geocode` (Không có header token) -> HTTP 401
    ```json
    {
      "error": {
        "code": "unauthorized_session",
        "message": "Thiếu thông tin xác thực phiên."
      }
    }
    ```
  - `POST /v1/geocode` (Token hợp lệ, query: "Hồ Gươm") -> HTTP 200
    ```json
    {
      "status": "unavailable",
      "provider": "google_geocoding",
      "results": []
    }
    ```
  - `POST /v1/geocode` (Query probe chứa chuỗi bí mật và ký tự byte `\x07`) -> HTTP 422
    ```json
    {
      "error": {
        "code": "validation_error",
        "message": "Yêu cầu không hợp lệ."
      }
    }
    ```
    *(Xác nhận: chuỗi bí mật hoàn toàn không xuất hiện trong body lỗi)*
  - `POST /v1/geocode` (Burst call thứ 61) -> HTTP 429
    ```json
    {
      "error": {
        "code": "rate_limited",
        "message": "Quá nhiều yêu cầu; vui lòng thử lại sau."
      }
    }
    ```
- **Đánh giá:** **PASS**. Cơ chế bảo vệ phiên và giới hạn tần suất hoạt động chính xác.

---

### Kịch bản 4: Metadata Xuất Phát Phiên (`origin_label` & `origin_source`)
- **Mục tiêu:** Xác minh các trường metadata bổ sung của Contract v1.5 trong tùy chọn người dùng:
  1. `origin_label`: Độ dài tối đa 120 ký tự; không chứa ký tự điều khiển Unicode (`Cc`, `Cf`, `Cs`).
  2. `origin_source`: Thuộc tập enum hợp lệ: `'current_location' \| 'place' \| 'manual_coordinates' \| 'landmark' \| 'geocoded' \| null`.
  3. Giá trị được lưu trữ nguyên vẹn và đọc lại chính xác qua `GET /v1/sessions/{id}`.
  4. Bất biến kiến trúc quan trọng: `origin_source` chỉ mang tính chất hiển thị UI, **tuyệt đối không làm thay đổi kết quả thuật toán lập lịch**.
- **Yêu cầu & Phản hồi mẫu:**
  - `PUT /v1/sessions/{id}/preferences` với `origin_label: "Hồ Gươm\n"` -> HTTP 422 (chứa ký tự newline).
  - `PUT /v1/sessions/{id}/preferences` với `origin_label: "A"*121` -> HTTP 422 (vượt 120 ký tự).
  - `PUT /v1/sessions/{id}/preferences` với `origin_source: "gps"` -> HTTP 422 (sai enum).
  - `PUT /v1/sessions/{id}/preferences` với `origin_source: "manual_coordinates"`, `origin_label: "22 Hàng Buồm"` -> HTTP 200 OK.
  - So sánh lập lịch tour giữa hai phiên có cùng tọa độ và thời lượng:
    - Phiên A: `origin_source: "current_location"`, `origin_label: "Vị trí GPS"`
    - Phiên B: `origin_source: "manual_coordinates"`, `origin_label: "Tọa độ bản đồ"`
    - Kết quả trả về: Cả hai tour đều có cùng 2 điểm dừng (`SYN-006` và `SYN-011`), cùng giờ đến/đi, cùng chi phí và thời gian đi bộ.
- **Đánh giá:** **PASS**. Thuật toán quy hoạch tuyến hoàn toàn độc lập với nguồn gốc điểm xuất phát.

---

### Kịch bản 5: Luồng Tin Nhắn Với Xuất Phát Tự Do (Rule Extractor)
- **Mục tiêu:** Xác minh tương tác tin nhắn chat khi chạy với bộ trích xuất quy tắc mặc định (`MockExtractor`):
  1. `MockExtractor` không phát sinh trường `origin_text` (chỉ bộ trích xuất LLM mới sinh ra `origin_text`).
  2. Khi người dùng nhắn địa điểm chưa biết trong từ điển ("Cầu Giấy"): hệ thống không tự bịa tọa độ, để trống `origin`, đưa `origin` vào `missing_slots`, đưa câu hỏi hỏi điểm xuất phát vào `questions`, và `tour` là `null`.
  3. Khi người dùng nhắn địa danh có sẵn ("Hồ Gươm"): hệ thống nhận diện từ điển neo, gán `origin = [21.0285, 105.8522]`, `origin_label = "Hồ Gươm"`, `origin_source = "landmark"`, xóa `origin` khỏi `missing_slots` và lập lịch thành công tour.
- **Yêu cầu & Phản hồi mẫu:**
  - `POST /v1/sessions/{id}/messages` ("Mình muốn xuất phát từ Cầu Giấy, đi 2 tiếng") -> HTTP 200 OK:
    - `preferences.origin`: null
    - `missing_slots`: `["origin"]`
    - `questions`: `["Bạn muốn xuất phát từ đâu (ví dụ: Hồ Gươm, Phố cổ)?"]`
    - `tour`: null
    - `extraction_source`: "rules"
  - `POST /v1/sessions/{id}/messages` ("Mình xuất phát từ Hồ Gươm, đi 2 tiếng") -> HTTP 200 OK:
    - `preferences.origin`: `{"lat": 21.0285, "lon": 105.8522}`
    - `preferences.origin_label`: "Hồ Gươm"
    - `preferences.origin_source`: "landmark"
    - `missing_slots`: `[]`
    - `tour`: Tour hoàn chỉnh gồm 2 điểm dừng (`SYN-006` và `SYN-011`).
- **Đánh giá:** **PASS**. Hành vi quy tắc an toàn, không suy diễn sai vị trí.

---

### Kịch bản 6: Định Dạng Tour Đầu Ra Khi Định Tuyến Ước Tính
- **Mục tiêu:** Kiểm tra cấu trúc đối tượng `TourView` khi chạy với `FOODTOUR_ROUTING=estimate`:
  1. `totals.route_provider`: Phải là `null` (không gán tên provider khi chỉ ước tính).
  2. `totals.leg_source`: Là `'straight_line_estimate'`.
  3. `tour.route_warnings`: Là mảng rỗng `[]` (cảnh báo đi bộ chỉ xuất hiện khi gọi Google Routes thật).
  4. Các chặng dừng (`stop.leg_from_previous`):
     - `source`: `'straight_line_estimate'`
     - `geometry`: Phải là `null` (tuyệt đối không sinh mảng tọa độ polyline ảo cho chặng ước tính).
- **Phản hồi mẫu quan sát:**
  ```json
  {
    "totals": {
      "venue_range_upper_sum_vnd": 105000,
      "walk_minutes": 2,
      "leg_source": "straight_line_estimate",
      "route_provider": null
    },
    "route_warnings": [],
    "stops": [
      {
        "venue_id": "SYN-006",
        "order": 1,
        "leg_from_previous": {
          "minutes": 1,
          "km": 0.444,
          "source": "straight_line_estimate",
          "geometry": null
        }
      },
      {
        "venue_id": "SYN-011",
        "order": 2,
        "leg_from_previous": {
          "minutes": 1,
          "km": 0.573,
          "source": "straight_line_estimate",
          "geometry": null
        }
      }
    ]
  }
  ```
- **Đánh giá:** **PASS**. Tuân thủ nghiêm ngặt nguyên tắc trung thực dữ liệu, không vẽ tuyến đường khi chưa có tính toán định tuyến thực.

---

### Kịch bản 7: Kiểm Tra An Toàn Bảo Mật & Rò Rỉ Khóa / Token
- **Mục tiêu:** Quét tự động toàn bộ dữ liệu phản hồi từ 160 giao dịch HTTP và nhật ký thực thi của máy chủ uvicorn:
  1. Token phiên làm việc (`token`) chỉ được phép xuất hiện duy nhất một lần tại phản hồi của `POST /v1/sessions`; không bao giờ được lặp lại ở các endpoint khác hay bị ghi vào nhật ký stdout/stderr.
  2. Chuỗi có định dạng khóa Google (`AIza[0-9A-Za-z-_]{35}`), khóa bí mật (`sk-...`), hoặc `Bearer ...` không được phép xuất hiện.
- **Kết quả quét:**
  - Tổng số phiên được khởi tạo trong bộ test: 7 phiên (7 tokens phân biệt).
  - Số lần phát hiện rò rỉ token ngoài `POST /v1/sessions`: **0**
  - Số lần phát hiện rò rỉ token trong stdout/stderr máy chủ: **0**
  - Số lần phát hiện mẫu API key trong phản hồi HTTP hoặc nhật ký máy chủ: **0**
- **Đánh giá:** **PASS**.

---

### Kịch bản 8: Ngữ Nghĩa Thay Đổi Dữ Liệu (`stale/dataset_changed`)
- **Tình trạng:** **BỎ QUA THEO CHỈ THỊ (SKIPPED per coordinator direction)**.
- **Lý do:** Nội dung kiểm thử này thuộc phạm vi xác minh tính bền vững SQLite và phiên làm việc do Codex (`foodtour-codex-backend`) sở hữu và đã được kiểm chứng độc lập trong báo cáo `docs/reports/CODEX_PH4_BE.md`.

---

## 4. Ghi Nhận Khuyết Tật & Phân Định Trách Nhiệm (Defects & Ownership)

Qua quá trình thẩm định black-box độc lập trên nhánh tip tích hợp `foodtour-claude-coordinator`:
- **Khuyết tật chức năng chặn (Blockers):** **0**
- **Lỗi sai lệch hợp đồng (Contract Drift):** **0**
- Toàn bộ các phát hiện trước đó từ đợt đánh giá P4-R1..R5 của Codex (về ranh giới tin cậy tọa độ model, xác thực ký tự điều khiển Unicode, và kiểm tra tuyên bố giờ mở cửa) đã được Claude xử lý triệt để trong commit `1fc3880`.
- **Lưu ý kỹ thuật hạ tầng kiểm thử:** Khi chạy kiểm thử tải nhanh trên hệ điều hành Windows, việc uvicorn ghi nhật ký access log JSON trực tiếp ra pipe có thể gây tràn bộ đệm pipe OS (4KB). Bộ kiểm thử `qa/integration/test_ph4_api.py` đã được thiết kế tối ưu chuyển hướng ghi log ra tệp đĩa `qa/integration/server_test.log`, loại bỏ hoàn toàn nguy cơ deadlock và lưu giữ đầy đủ bằng chứng để quét bảo mật tại Kịch bản 7.

---

## 5. Danh Mục Chưa Kiểm Thử (Untested Items & Boundaries)

Theo đúng quy tắc trung thực bằng chứng của dự án:
1. **Google Maps JS API & Map ID:** Chưa kiểm thử hiển thị bản đồ Google Maps và Advanced Markers trực tiếp trên trình duyệt do chưa có `GOOGLE_MAPS_BROWSER_KEY` và `GOOGLE_MAPS_MAP_ID`.
2. **Google Routes API & Geocoding API trực tiếp:** Chưa kiểm thử gọi mạng ra máy chủ Google thật do chưa có `GOOGLE_MAPS_SERVER_KEY`.
3. **Gemini Live AI:** Chưa kiểm thử gọi model Gemini thật qua mạng do chưa có `GEMINI_API_KEY`.
4. **Môi trường:** Tất cả kiểm thử trên được chạy trên máy tính Windows cục bộ với Python `3.14.4` và bộ dữ liệu synthetic 13 quán.

---

## 6. Hướng Dẫn Tái Hiện Kiểm Thử

Để chạy lại toàn bộ bộ kiểm thử tích hợp độc lập:
```powershell
# Chạy bộ test tích hợp và xuất dữ liệu kiểm toán JSON
& "C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-codex-backend/.venv/Scripts/python.exe" qa/integration/test_ph4_api.py --export-data qa/integration/results_ph4_qa.json
```
Kết quả kiểm thử trả về mã thoát `0` và hiển thị tóm tắt:
`INTEGRATION QA SUMMARY: 162/162 checks passed (0 failed)`.
