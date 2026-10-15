# Báo Cáo Kiểm Định Hiện Trạng Giao Diện & QA (Baseline Report)

- **Mã nhiệm vụ Orca:** `task_ee160cdc8794` (Dispatch: `ctx_43e3477b9c9b`)
- **Tác giả:** Antigravity (Frontend & QA Specialist)
- **Ngày thực hiện:** 15/10/2026
- **Phạm vi kiểm tra:** Thư mục `frontend/`, tích hợp API hiện hữu `http://localhost:8000`, tương thích hiển thị trên Desktop và Mobile.
- **Tài liệu nghiệm thu đi kèm:** `qa/ACCEPTANCE.md`

---

## 1. Tóm Tắt Điều Hành (Executive Summary)

Đợt kiểm định này đã tái lập thành công quy trình cài đặt và đóng gói build của ứng dụng web `frontend/`, đồng thời kiểm tra toàn diện hành vi người dùng trên các kích thước màn hình máy tính (Desktop: 1280px / 1000px) và điện thoại di động (Mobile: 375px / 390px / 414px).

### Kết quả chính:
1. **Khả năng Build:** Ứng dụng `frontend/` (Next.js 15.5.28, React 19.0.0) thực hiện lệnh `npm ci` và `npm run build` thành công 100%, không phát sinh lỗi biên dịch cú pháp.
2. **Hiện trạng Test:** Dự án **hoàn toàn chưa có bộ kiểm thử tự động** nào cho frontend (không có `test` script trong `package.json`, không có Jest/Vitest/Playwright). Lệnh `npm test` thất bại do thiếu script.
3. **Hiện trạng UX/UI:** Bản nguyên mẫu hiện tại là một biểu mẫu HTML thô sơ (21 dòng mã), thiếu hẳn giao diện chat tiếng Việt, thiếu bản đồ tương tác (chỉ có link trỏ ra ngoài OpenStreetMap), thiếu cơ chế đổi điểm dừng (replace stop), và không có nhãn hiển thị 3 trạng thái minh bạch dữ liệu (`VERIFIED`, `ESTIMATE`, `UNKNOWN`).
4. **Tích hợp API:** Đã kiểm thử kết nối trực tiếp đến backend đang chạy tại cổng 8000: API `/health` trả về `ok`, API `/v1/plans` phản hồi đúng logic `explore` (3 quán với các giả định) và `strict` (từ chối do thiếu bằng chứng). Tuy nhiên, frontend hiện nuốt mất mã lỗi chi tiết khi backend trả về HTTP 422.

---

## 2. Môi Trường Thực Nghiệm & Lệnh Kiểm Tra

### 2.1. Thông số môi trường
- **Hệ điều hành:** Windows (PowerShell)
- **Node.js:** `v24.19.0`
- **npm:** `11.17.0`
- **Framework frontend:** Next.js `15.5.28`, React `19.0.0`, React-DOM `19.0.0`
- **Dịch vụ backend:** FastAPI `0.1.0` (chạy trên cổng `8000`)
- **Dịch vụ frontend:** Next.js dev/start (chạy trên cổng `3000`)

### 2.2. Kết quả chạy các lệnh thực tế (Actual Command Outputs)

#### A. Cài đặt phụ thuộc (`npm ci`)
```powershell
PS C:\Users\tuana\orca\workspaces\ai-foodtour-planner\foodtour-antigravity-web\frontend> npm ci
added 20 packages, and audited 21 packages in 18s

5 packages are looking for funding
  run `npm fund` for details

2 vulnerabilities (1 moderate, 1 high)
```
*Đánh giá:* Cài đặt thành công, không gặp lỗi xung đột phiên bản `package-lock.json`.

#### B. Đóng gói sản phẩm (`npm run build`)
```powershell
PS C:\Users\tuana\orca\workspaces\ai-foodtour-planner\foodtour-antigravity-web\frontend> npm run build

> foodtour-web@0.1.0 build
> next build

   ▲ Next.js 15.5.28

   Creating an optimized production build ...
 ✓ Compiled successfully in 2.3s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/4) ...
   Generating static pages (1/4) 
   Generating static pages (2/4) 
   Generating static pages (3/4) 
 ✓ Generating static pages (4/4)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ○ /                                    1.92 kB         105 kB
└ ○ /_not-found                            992 B         104 kB
+ First Load JS shared by all             103 kB
  ├ chunks/255-b1e2483a7e02feee.js       46.6 kB
  ├ chunks/4bd1b696-c023c6e3521b1417.js  54.2 kB
  └ other shared chunks (total)          1.95 kB

○  (Static)  prerendered as static content
```
*Đánh giá:* Quá trình build hoàn thành trơn tru trong 2.3 giây, tạo ra 4 trang tĩnh với kích thước bundle gọn gàng (~105 kB First Load JS).

#### C. Chạy kiểm thử tự động (`npm test`)
```powershell
PS C:\Users\tuana\orca\workspaces\ai-foodtour-planner\foodtour-antigravity-web\frontend> npm test
npm error Missing script: "test"
npm error 
npm error To see a list of scripts, run:
npm error   npm run
```
*Đánh giá:* **Thiếu hoàn toàn test runner**. `package.json` chỉ khai báo `dev`, `build`, `start`. Cần bổ sung framework kiểm thử E2E / component trong các task tiếp theo (FE-01 / QA-01).

#### D. Kiểm tra kết nối Backend & Phản hồi API
```powershell
# 1. Health check
PS> curl.exe -s http://localhost:8000/health
{"status":"ok","dataset_loaded":true}

# 2. Tạo tour chế độ explore (Hà Nội, 200.000 ₫, 120 phút)
PS> node -e "fetch('http://localhost:8000/v1/plans', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({city:'Hà Nội',lat:21.03,lon:105.85,budget_vnd:200000,duration_min:120,interests:[],mode:'explore'})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)))"
{
  "status": "conditional_suggestions",
  "stops": [
    {
      "id": "82828",
      "name": "Bún Dọc Mùng - Bát Đàn",
      "address": "18 Bát Đàn",
      "district": "Quận Hoàn Kiếm",
      "dish_groups": "Trà | Bún | Món nước | Thức uống | Bia | Nước ngọt",
      "price_min_vnd_norm": 30000,
      "price_max_vnd_norm": 50000,
      "hours_displayed": "07:00 - 23:00",
      "straight_line_leg_km": 0.495,
      "source_url": "https://www.foody.vn/ha-noi/bun-doc-mung-bat-dan"
    },
    {
      "id": "6734",
      "name": "Xôi Yến - Nguyễn Hữu Huân",
      "address": "35B Nguyễn Hữu Huân",
      "district": "Quận Hoàn Kiếm",
      "dish_groups": "Xôi | Ăn vặt - Ăn nhẹ",
      "price_min_vnd_norm": 35000,
      "price_max_vnd_norm": 44000,
      "hours_displayed": "06:30 - 23:00",
      "straight_line_leg_km": 0.721,
      "source_url": "https://www.foody.vn/ha-noi/xoi-yen-nguyen-huu-huan"
    },
    {
      "id": "111781",
      "name": "Bún Ốc Sườn - Hai Bà Trưng",
      "address": "57 Hai Bà Trưng, P. Trần Hưng Đạo",
      "district": "Quận Hoàn Kiếm",
      "dish_groups": "Bún | Hải sản | Món nước | Nghêu - Sò - Ốc",
      "price_min_vnd_norm": 30000,
      "price_max_vnd_norm": 40000,
      "hours_displayed": "14:30 - 22:00",
      "straight_line_leg_km": 1.309,
      "source_url": "https://www.foody.vn/ha-noi/bun-oc-suon-hai-ba-trung"
    }
  ],
  "venue_range_upper_sum_vnd": 134000,
  "straight_line_total_km": 2.525,
  "schedule_verified": false,
  "budget_guaranteed": false,
  "warnings": [
    "Giờ theo ngày chưa xác minh; cần liên hệ quán.",
    "Khoảng giá của quán không bảo đảm chi phí mỗi người.",
    "Khoảng cách đường chim bay; chưa có tuyến đường hay thời gian di chuyển thực."
  ],
  "assumptions": {
    "visit_minutes_per_stop": 30,
    "travel_minutes": null
  },
  "requested_duration_min": 120
}

# 3. Tạo tour chế độ strict (Nghiêm ngặt)
PS> node -e "fetch('http://localhost:8000/v1/plans', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({city:'Hà Nội',lat:21.03,lon:105.85,budget_vnd:200000,duration_min:120,interests:[],mode:'strict'})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)))"
{
  "status": "insufficient_evidence",
  "stops": [],
  "warnings": [
    "Giờ theo ngày chưa xác minh; cần liên hệ quán.",
    "Khoảng giá của quán không bảo đảm chi phí mỗi người.",
    "Khoảng cách đường chim bay; chưa có tuyến đường hay thời gian di chuyển thực."
  ],
  "reason": "Chưa có giờ theo ngày, giá khẩu phần và ma trận định tuyến đã xác minh."
}
```

---

## 3. Khảo Sát Chi Tiết Trải Nghiệm Người Dùng (UX Inspection)

### 3.1. Bố cục Hiện Tại trên Desktop (Chiều rộng 1280px / 1000px)

```
+---------------------------------------------------------------------------------------+
|  BẢN THỬ NGHIỆM · DỮ LIỆU HÀ NỘI                                                      |
|  Khám phá một vòng vị ngon                                                            |
|  Gợi ý có nguồn dẫn. Giờ mở cửa, chi phí mỗi người và tuyến đi cần xác minh.          |
|                                                                                       |
|  +------------------------------------------------------+                             |
|  | [Form nhập liệu - max 520px]                         |                             |
|  | Thành phố: [ Hà Nội                              ]   |                             |
|  | Vĩ độ điểm xuất phát: [ 21.03                    ]   |   (Khoảng trống mênh mông   |
|  | Kinh độ: [ 105.85                                ]   |    bên phải: KHÔNG CÓ       |
|  | Ngân sách tham khảo (VND): [ 200000              ]   |    BẢN ĐỒ, KHÔNG CÓ         |
|  | Thời lượng mong muốn (phút): [ 120               ]   |    CHAT PANEL)              |
|  | Nhóm món yêu thích: [ Ví dụ: Bún                 ]   |                             |
|  | Chế độ: [ Khám phá có điều kiện           v ]   |                             |
|  | [ Tìm gợi ý ]                                        |                             |
|  +------------------------------------------------------+                             |
|                                                                                       |
|  Gợi ý để kiểm tra                                                                    |
|  * Giờ theo ngày chưa xác minh; cần liên hệ quán.                                     |
|  * Khoảng giá của quán không bảo đảm chi phí mỗi người.                               |
|  * Khoảng cách đường chim bay; chưa có tuyến đường hay thời gian di chuyển thực.       |
|                                                                                       |
|  +---------------------------------------------------------------------------------+  |
|  | [Card 1] Bún Dọc Mùng - Bát Đàn                                                 |  |
|  | 18 Bát Đàn · Quận Hoàn Kiếm                                                     |  |
|  | Nhóm món từ nguồn: Trà | Bún | Món nước...                                      |  |
|  | Khoảng giá quán: 30.000–50.000 ₫                                                |  |
|  | Giờ hiển thị: 07:00 - 23:00 · chưa xác minh ngày                                |  |
|  | Chặng đường chim bay: 0.495 km                                                  |  |
|  | Xem nguồn Foody · Xem vị trí trên bản đồ (link ngoài OpenStreetMap)             |  |
|  +---------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------+
```

### 3.2. Bố cục Hiện Tại trên Mobile (Chiều rộng 375px / 390px)

```
+-----------------------------------+
| BẢN THỬ NGHIỆM · DỮ LIỆU HÀ NỘI   |
| Khám phá một vòng vị ngon         |
| Gợi ý có nguồn dẫn...             |
|                                   |
| [Form bị chật do padding 24px]    |
| Thành phố [ Hà Nội             ]  |
| Vĩ độ [ 21.03                  ]  |  <-- Bắt nhập float vĩ độ trên điện thoại!
| Kinh độ [ 105.85               ]  |
| Ngân sách [ 200000             ]  |
| Thời lượng [ 120               ]  |
| Nhóm món [ Ví dụ: Bún          ]  |
| Chế độ [ Khám phá có đ... v ]    |
| [ Tìm gợi ý ]                     |  <-- Nút nhỏ, khó bấm ngón tay
|                                   |
| Gợi ý để kiểm tra                 |
| • Giờ theo ngày chưa xác minh...  |
|                                   |
| [Card 1] Bún Dọc Mùng...          |
| 18 Bát Đàn · Quận Hoàn Kiếm       |
| Khoảng giá: 30.000–50.000 ₫       |
| Xem nguồn · Xem vị trí (out app)  |  <-- Bấm vào bị nhảy sang trang OSM ngoài
+-----------------------------------+
```

---

## 4. Danh Sách Khiếm Khuyết & Khoảng Cách Nghiệm Thu (Defect & Gap Register)

Dưới đây là các khiếm khuyết được phát hiện khi đối chiếu sản phẩm hiện tại với bản yêu cầu và tiêu chí nghiệm thu tại `qa/ACCEPTANCE.md`.

| Mã lỗi / Thiếu sót | Mức độ | Hiện trạng quan sát được | Yêu cầu theo tiêu chuẩn nghiệm thu | Tác động đến người dùng |
| :--- | :---: | :--- | :--- | :--- |
| **DEF-01: Bắt buộc nhập tọa độ thô (Raw Lat/Lon)** | **P0** (Nghiêm trọng) | Biểu mẫu bắt buộc nhập `lat` (21.03) và `lon` (105.85) dạng số thập phân. | Phải cho phép người dùng chọn điểm xuất phát theo khu vực (Phố Cổ, Hồ Gươm, Ba Đình...) hoặc qua ô tìm kiếm địa chỉ/chat. | Người dùng phổ thông trên điện thoại không thể biết vĩ độ/kinh độ của mình để nhập số. |
| **DEF-02: Hoàn toàn không có Chat tự nhiên** | **P0** (Nghiêm trọng) | Chỉ có biểu mẫu HTML tĩnh, không có khung hội thoại hoặc hỗ trợ câu lệnh tiếng Việt. | Cần có khung chat song song với tùy chọn nhanh, trích xuất thực thể từ câu nói tiếng Việt. | Trải nghiệm xa lạ so với định vị "AI FoodTour Planner", biến ứng dụng thành một form lọc SQL đơn giản. |
| **DEF-03: Thiếu Bản đồ tương tác nội tuyến** | **P0** (Nghiêm trọng) | Không có Leaflet / OSM canvas. Chỉ có thẻ `<a>` trỏ link ra trang web bên ngoài `openstreetmap.org`. | Bản đồ tương tác hiển thị ngay trên trang (bên phải trên desktop, tab riêng trên mobile) vẽ markers và tuyến nối chặng. | Người dùng bấm xem bản đồ bị điều hướng rời khỏi ứng dụng, đứt gãy luồng trải nghiệm tour. |
| **DEF-04: Thiếu chức năng Đổi điểm dừng (Replace Stop)** | **P0** (Nghiêm trọng) | Không có nút "Đổi quán" hay cơ chế khóa dừng (locks). | Cho phép bấm đổi từng điểm dừng, giữ nguyên các điểm còn lại, so sánh trước/sau khi đổi. | Người dùng không thể cá nhân hóa hoặc loại bỏ quán mình không thích mà phải submit lại toàn bộ form từ đầu. |
| **DEF-05: Thiếu nhãn 3 trạng thái minh bạch dữ liệu** | **P1** (Lớn) | Chỉ in chuỗi cảnh báo text dài ở đầu kết quả. Trên từng card không có badge phân biệt `VERIFIED`, `ESTIMATE`, `UNKNOWN`. | Mỗi chỉ số (tọa độ, giờ, giá, khoảng cách) phải có badge màu tương ứng (`VERIFIED`, `ESTIMATE`, `UNKNOWN`). | Người dùng khó phân biệt thông tin nào là thật, thông tin nào là ước tính tham khảo. |
| **DEF-06: Lỗi giao diện khi không có quán (`no_candidates`)** | **P1** (Lớn) | Khi tìm kiếm không có quán (ví dụ `city = "Hải Phòng"`), trang vẫn hiện tiêu đề: *"Gợi ý để kiểm tra"* cùng khoảng trống rỗng. | Phải hiển thị Empty State rõ ràng: *"Không tìm thấy hành trình phù hợp"* kèm lý do và nút điều chỉnh bộ lọc. | Người dùng bối rối tưởng hệ thống bị lỗi hoặc đang tải dở dang. |
| **DEF-07: Nuốt mất thông điệp lỗi xác thực (422)** | **P1** (Lớn) | Khi người dùng nhập sai (ví dụ `budget = -1` hoặc `duration = 10`), giao diện hiển thị câu chung chung: *"Yêu cầu không hợp lệ hoặc máy chủ chưa sẵn sàng."* | Bóc tách mảng `detail` từ HTTP 422 của FastAPI và báo đúng trường bị lỗi (ví dụ: *"Thời lượng phải từ 30 phút trở lên"*). | Người dùng không biết mình nhập sai ô nào để sửa. |
| **DEF-08: Thiếu bộ test tự động (Automated Tests)** | **P1** (Lớn) | `package.json` không có lệnh `test`. Thư mục `frontend/` không có bất kỳ file test nào. | Cần có test tự động (Playwright E2E hoặc Jest/Vitest component tests) để chặn hồi quy. | Nguy cơ vỡ giao diện trong các đợt refactor tiếp theo do không có rào chắn CI. |
| **DEF-09: Bố cục Mobile chưa tối ưu (Chưa có Tabs)** | **P2** (Vừa) | Toàn bộ form và kết quả dồn chung trên một màn hình cuộn dọc dài; padding 24px làm co hẹp bề ngang; nút bấm kích thước nhỏ. | Áp dụng bố cục Tabs trên mobile: `[Tùy chọn]` / `[Lịch trình]` / `[Bản đồ]`. Chiều cao nút $\ge 44px$. | Thao tác trên điện thoại một tay gặp khó khăn, dễ bấm trượt. |
| **DEF-10: Mất sạch dữ liệu khi F5 (No Session Persistence)** | **P2** (Vừa) | Refresh trình duyệt làm mất sạch kết quả tour vừa tìm được. | Lưu trạng thái vào `sessionStorage` gắn kèm `session_id` để phục hồi tự động khi tải lại trang. | Người dùng mất tour đang xem nếu vô tình chạm tay reload trang trên điện thoại. |

---

## 5. Đánh Giá Khả Năng Tương Thích & Tuân Thủ Hợp Đồng (Contract Drift)

1. **Giao thức API `/v1/plans`:**
   - Trường gửi lên: `{ city, lat, lon, budget_vnd, duration_min, interests, mode }`.
   - Kết quả trả về: Khớp đúng với backend `main.py` hiện tại (`status`, `stops`, `warnings`, `assumptions`).
   - Rủi ro trôi hợp đồng: Backend trả về `price_semantics: "venue price range..."` và `hours_status: "day_mapping_unknown"`. Frontend hiện tại chỉ hiển thị thô mà chưa chuẩn hóa thành component badge trực quan.
2. **Quy tắc bảo mật dữ liệu:**
   - Frontend không chứa bất kỳ khóa API bí mật nào (`NEXT_PUBLIC_API_URL` trỏ về local backend).
   - Dữ liệu Foody tư nhân không bị commit hay lộ trong mã nguồn frontend.

---

## 6. Kế Hoạch Đề Xuất Cho Các Giai Đoạn Tiếp Theo

1. **Khắc phục tầng vỏ (Mobile-First Shell Refinement - Tùy chọn trong FE-QA-00):**
   - Tinh chỉnh giao diện `frontend/app/page.js` và `layout.js` theo hướng Mobile-first: bổ sung bộ chọn vị trí nhanh Phố Cổ Hà Nội, cải thiện style các trường nhập liệu, thêm badge 3 trạng thái (`VERIFIED`, `ESTIMATE`, `UNKNOWN`), khắc phục trạng thái rỗng `no_candidates` và hiển thị trực quan bản đồ lộ trình chặng SVG/tọa độ ngay trong trang mà không vi phạm nguyên tắc nâng cấp thư viện.
2. **Kế hoạch cho FE-01 (Chat & Structured Preferences UI):**
   - Triển khai giao diện Chat tiếng Việt với streaming/stateful chips theo hợp đồng OpenAPI chính thức do Claude ban hành.
3. **Kế hoạch cho QA-01 (E2E Test Matrix):**
   - Thiết lập Playwright test suite chạy đa kích thước màn hình (Desktop 1280x800, Mobile iPhone 14 390x844), tự động kiểm thử 30 ca kịch bản (kể cả kịch bản bất khả thi và prompt injection).
