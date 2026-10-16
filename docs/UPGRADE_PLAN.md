# Kế hoạch nâng cấp toàn diện AI FoodTour Planner (local-first, miễn phí)

Ngày 2026-10-16 · Tác giả: Claude (kiến trúc/sản phẩm) · Trạng thái: **kế hoạch, chưa triển khai** · Nhánh: `foodtour-claude-coordinator`

Phạm vi bản này: tài liệu kế hoạch. Không đổi mã ứng dụng, không bật billing, không dùng key, không deploy/push.

---

## 0. Ràng buộc và quyết định nền (đã được người dùng chốt)

| # | Ràng buộc | Hệ quả cho kế hoạch |
|---|---|---|
| C1 | Chạy local, dữ liệu riêng 1.702 quán từ CSV (`D:\Downloads\restaurants_enriched (2).csv`) | Dữ liệu không vào Git; mọi kiểm thử dùng bộ tổng hợp có nhãn |
| C2 | Gemini **Free Tier**, giới hạn **20 lượt/ngày** | Gemini là tài nguyên khan hiếm → "rules-first, LLM khi cần", có bộ đếm, bộ nhớ đệm, giao diện nói rõ |
| C3 | Routing = ước tính nội bộ; Google Maps/Routes/Geocoding **hoãn** vì không muốn billing | Bản nâng cấp không phụ thuộc Google; Google chỉ là tuỳ chọn về sau (mục 4.5) |
| C4 | Trung thực bằng chứng: giờ mở cửa/giá theo người chưa xác minh | UX phải nói rõ "chưa biết", không giấu |
| C5 | Quy trình 3 agent: Claude / Codex / Antigravity qua Orca, có review chéo | Mục 7 |

---

## 1. Hiện trạng (audit thực tế 2026-10-16)

### 1.1 Cái đã có
- Backend FastAPI + planner thuần (`backend/app/planner`), hợp đồng v1.0–v1.5, 211 test; frontend Next.js (≈6.000 dòng, 7 component lớn); QA: 15 contract, 15 component, 15 cold-bootstrap CDP, 36 API, 28 trình duyệt, 162 hộp đen.
- Máy chủ đang chạy: dữ liệu `private` (1.702 dòng, phiên bản `936eb167cf00`), Gemini `gemini-3.5-flash-lite`, giải thích = mẫu, định tuyến = ước tính, geocoding = không khả dụng.
- Trích xuất tiếng Việt (Gemini + bộ luật dự phòng), chống chèn lệnh, bộ kiểm giải thích, tour luôn qua `validate_tour`.

### 1.2 Vấn đề trải nghiệm (bằng chứng từ ảnh chụp thật ở 1280px và 390px)

| ID | Vấn đề | Bằng chứng | Mức |
|---|---|---|---|
| UX-01 | **Kết quả chính (lịch trình) nằm dưới màn hình đầu**: sau khi lập tour trang cao 3.404px (desktop), tour ở dưới chat + form; trên mobile bị 3 banner đẩy xuống | ảnh `tour_desktop`, `tour_mobile`; `scrollHeight` 3404/2102 | Cao |
| UX-02 | Thuật ngữ nhà phát triển lộ ra người dùng: badge "CONTRACT V1.4", nút "Chuyển sang Mock Mode", "Bản #0", "[landmark]", "(Conditional)", mã trường `hours`, `price_per_person`, `route` | ảnh + DOM | Cao |
| UX-03 | **Trùng lặp thông tin**: lời giải thích dài xuất hiện ở bong bóng chat, banner trạng thái và danh sách chặng; ghi nguồn lặp lại | ảnh `tour_*` | Trung bình |
| UX-04 | Bản đồ chiếm nửa màn hình nhưng **trống** ("Google Maps chưa khả dụng") dù Google đã hoãn; tiêu đề vẫn ghi "Google Maps" | ảnh `live_desktop` | Cao |
| UX-05 | Header mobile chiếm ~45% khung nhìn đầu, ô nhập chat bị đẩy khỏi màn hình đầu; 4 tab bị ngắt dòng | ảnh `live_mobile` | Cao |
| UX-06 | Biểu mẫu tuỳ chọn dài (15 ô nhập, 28 nút) nằm dưới chat; người dùng phải chọn giữa "chat" và "biểu mẫu" | DOM: 28 nút, 15 input | Trung bình |
| UX-07 | Mục tiêu chạm nhỏ: nút cao tối thiểu **25px** (< 44px khuyến nghị) | đo `getBoundingClientRect` | Trung bình |
| UX-08 | Không có chỉ báo **hạn mức Gemini**; người dùng không biết khi nào AI hết lượt và hệ thống đã rơi về bộ luật | `/health` không có bộ đếm; chỉ có ghi chú sau khi xảy ra | Cao |
| UX-09 | Chip gợi ý chạy ngang ẩn một phần; ví dụ khó khám phá | ảnh | Thấp |
| UX-10 | Trạng thái trống/lỗi/chờ chưa nhất quán (spinner chữ, hộp xanh/vàng/đỏ khác nhau) | đọc mã `page.js` | Trung bình |

### 1.3 Giới hạn kỹ thuật/dữ liệu (đã xác minh)

| ID | Giới hạn | Gốc |
|---|---|---|
| L1 | Giờ mở cửa **không biết** cho mọi quán; giá chỉ là khoảng giá của quán | Nguồn thiếu ánh xạ thứ trong tuần |
| L2 | **CSV có sẵn nhiều trường chưa được dùng**: `rating_value`, `review_count`, `suitable_meals`, `audiences`, `cuisine_styles`, `amenities_*`, `prep_time_*`, `capacity_value`, `hours_displayed`, `fetched_at` — loader chỉ giữ tên, toạ độ, nhãn món, giá, `hours_display` | `backend/app/data/loader.py`, `planner/types.py:Venue` |
| L3 | Nhãn món thô: một nhãn "Bún" phủ ~494 quán, nên liên quan chỉ ở mức danh mục | audit ds-1 |
| L4 | Khoảng cách là ước tính đường chim bay × hệ số, không có tuyến thật | định tuyến hoãn |
| L5 | Ngân sách Gemini mặc định trong mã là **200/ngày** (`FOODTOUR_LLM_DAILY_BUDGET`, trừ khi bạn đã đặt) trong khi hạn mức thật là 20; mỗi tin nhắn tốn 1 lượt, giải thích có thể tốn thêm tới 2–3 lượt (thử lại) | `gemini.py:35`, `explain.py:184` |
| L6 | Bộ đếm lượt đặt lại theo UTC; Google đặt lại hạn mức theo **nửa đêm giờ Thái Bình Dương** | tài liệu rate-limits; hạn mức tính theo **project**, không theo key |
| L7 | Marker/cụm quán chỉ hoạt động khi có Google Maps | phụ thuộc Google |
| L8 | Phiên SQLite có sẵn nhưng giao diện không có "hành trình đã lưu" | — |
| L9 | Chưa có đánh giá bởi người dùng thật về chất lượng tour | — |

---

## 2. Tầm nhìn sản phẩm, persona, luồng chính, nguyên tắc UX

### 2.1 Tầm nhìn
> "Cho tôi một vòng ăn Hà Nội đi bộ vừa sức trong 30 giây — và nói thật lòng cái gì còn chưa chắc."

Người dùng nhận một **hành trình có thứ tự, thời gian ước tính, lý do chọn từng quán**, chỉnh được từng điểm; hệ thống không bịa giờ mở cửa/giá.

### 2.2 Persona
| Persona | Bối cảnh | Nhu cầu chính | Điều làm họ bỏ app |
|---|---|---|---|
| **Linh, 27, dân văn phòng** | Đi nhóm 3–4 người sau giờ làm, dùng điện thoại | Kết quả nhanh, ít gõ, chia sẻ cho nhóm | Biểu mẫu dài, thuật ngữ kỹ thuật |
| **Minh, 34, khách từ tỉnh khác** | Có ~3 giờ ở Phố Cổ, chưa quen khu | Gợi ý đúng món, đi bộ gọn, biết quán nào đáng | Lịch trình đi vòng, không biết chắc quán mở không |
| **Hà, 45, đưa gia đình** | Có người lớn tuổi/trẻ em | Quãng đi ngắn, chỗ ngồi, tránh món | Không có cảnh báo trung thực, nhiều bước |

### 2.3 Luồng chính (đích: ≤ 3 thao tác từ mở app đến có hành trình)
1. **Mở app** → thấy một câu hỏi duy nhất + 4 gợi ý bấm một chạm.
2. **Nói/chọn nhu cầu** (chat *hoặc* chip) → hệ thống điền các "ô tóm tắt" có thể sửa.
3. **Xuất phát từ đâu** → mặc định gợi ý khu vực phổ biến; "Vị trí của tôi" (xin quyền khi bấm) hoặc nhập địa điểm.
4. **Lập hành trình** → màn hình kết quả thay thế màn hình nhập (không cuộn).
5. **Điều chỉnh**: đổi một quán (chọn trong 3 phương án), đổi số quán/ngân sách, "làm lại".
6. **Dùng**: sao chép/in/mở chỉ đường từng chặng.

### 2.4 Nguyên tắc UX/UI
1. **Một việc chính mỗi màn hình**; kết quả luôn nằm trong khung nhìn đầu.
2. **Trung thực nhưng dễ đọc**: "Giờ mở cửa: chưa rõ" thay vì mã trường; ba mức bằng chứng bằng icon + chữ (không chỉ màu).
3. **Gỡ mọi thuật ngữ nhà phát triển** khỏi chế độ thường (đưa vào `?dev=1`).
4. **Chat là công cụ chỉnh sửa, không phải khuôn bắt buộc**; biểu mẫu thu gọn là "tóm tắt có thể sửa".
5. **Chi phí AI hiển thị được**: người dùng thấy AI còn lượt hay đang dùng bộ luật.
6. **Mobile-first, một tay**: hành động chính ở nửa dưới; mục tiêu chạm ≥ 44px.
7. **Lỗi có đường ra**: mọi lỗi có nút hành động tiếp theo.
8. **Riêng tư rõ ràng**: nói gì được gửi đi đâu, ngắn gọn, tại chỗ.

---

## 3. Thiết kế UX/UI theo màn hình

### 3.0 Hệ thiết kế
- **Chữ**: font hệ thống hỗ trợ tiếng Việt (giữ stack hiện tại để không tải font ngoài); thang 12/14/16/20/24/32, `line-height` 1.5 cho nội dung, tiêu đề đậm 700; số liệu dùng `font-variant-numeric: tabular-nums`.
- **Màu (token)**: nền `--bg #FBF8F3`, chữ `--text #1F1B16`, nhấn `--accent #C8431A` (đỏ ớt, đạt tương phản ≥ 4.5:1 với chữ trắng), phụ `--muted #6B6259`. Ba trạng thái bằng chứng: **Đã xác minh** (xanh lục + ✓), **Ước tính** (hổ phách + ≈), **Chưa rõ** (xám + ?). Chế độ tối qua `prefers-color-scheme` với token riêng.
- **Thành phần**: Button (primary/secondary/ghost, cao ≥ 44px), Chip (chọn một/nhiều, `aria-pressed`), Card, StopCard, EvidenceChip, Banner (info/cảnh báo/lỗi — chỉ 1 banner hiển thị tại một thời điểm, có hàng đợi), Sheet (bottom sheet mobile / side panel desktop), Toast, Skeleton.
- **Chuyển động**: ≤ 200ms, tôn trọng `prefers-reduced-motion`.
- **Khả năng truy cập**: focus nhìn thấy được, thứ tự Tab theo thị giác, `aria-live="polite"` cho trạng thái lập tour, nhãn đầy đủ, không chỉ dùng màu.

### 3.1 Màn hình A — Bắt đầu / nhập nhu cầu (trạng thái trống)
```
┌────────────────────────────────────────────┐
│ 🍜 FoodTour Hà Nội                [⋯ menu]│  ← 1 dòng, không badge kỹ thuật
├────────────────────────────────────────────┤
│  Hôm nay bạn muốn ăn gì?                    │
│  ┌──────────────────────────────────────┐  │
│  │ Ví dụ: phở và chè quanh Hồ Gươm, 2 giờ│  │  ← ô nhập lớn, autofocus (desktop)
│  └──────────────────────────────[Gợi ý ▸]┘  │
│  [🍜 Ăn sáng 2 giờ] [🌙 Ăn vặt chiều tối]   │  ← chip 1 chạm, tự điền
│  [👨‍👩‍👧 Đi gia đình] [💸 Dưới 100k/người]    │
│  Dữ liệu: 1.702 quán Hà Nội · cập nhật <ngày> │
│  AI: Gemini còn 14/20 lượt hôm nay ⓘ        │
└────────────────────────────────────────────┘
```
Hành vi: chip điền ô nhập và tự gửi nếu đủ thông tin; "Gợi ý" mở danh sách ví dụ; chân trang chỉ 1 dòng trạng thái dữ liệu + AI.

### 3.2 Màn hình B — Xác nhận cấu hình tour (sau khi hiểu nhu cầu)
```
Mình hiểu như thế này — sửa nếu chưa đúng:
┌ Xuất phát ─ Hồ Hoàn Kiếm   [Đổi]  [📍 Vị trí của tôi] ┐
┌ Thời gian ─ 3 giờ · bắt đầu 18:30                       ┐
┌ Ngân sách ─ ≤ 200.000đ / người   (khoảng giá của quán)  ┐
┌ Món ─ bún, chè      Tránh: ốc         [+ thêm]          ┐
┌ Số quán ─ 3   Đi bộ tối đa mỗi chặng ─ 15 phút         ┐
                         [ Lập hành trình ▸ ]   (nút dính đáy trên mobile)
```
- Mỗi hàng là một "ô tóm tắt" mở thành Sheet khi bấm; ô thiếu bắt buộc viền cảnh báo kèm câu hỏi một dòng ("Bạn xuất phát từ đâu?").
- **Vị trí**: nút "Dùng vị trí hiện tại" chỉ xin quyền khi bấm; từ chối/hết giờ/không an toàn → thông báo cụ thể + nhập tay; ô nhập địa điểm (xem 4.5 về dịch vụ tìm địa chỉ); "chọn khu phổ biến" (Phố Cổ, Tây Hồ, Hoàn Kiếm…), nhập toạ độ chỉ trong "Nâng cao".
- Ghi chú riêng tư dưới ô vị trí: "Vị trí chỉ dùng làm điểm xuất phát, lưu trong phiên này (hết hạn tự xoá)".

### 3.3 Màn hình C — Đang lập tour (loading)
Skeleton 3 StopCard + dòng trạng thái: "Đang chọn quán phù hợp…" → "Đang sắp xếp thứ tự đi bộ…". Nếu AI chờ > 4s hiện: "AI đang bận, dùng bộ luật cục bộ" (không chặn). Huỷ được.

### 3.4 Màn hình D — Hành trình (kết quả; **màn hình quan trọng nhất**)
```
┌ Hành trình của bạn ─ 3 quán · ~27 phút đi bộ · ≤ 145.000đ ┐
│ ⚠ Chưa chắc: giờ mở cửa · giá theo người (xem chi tiết ▾)  │ ← MỘT dải bằng chứng, thu gọn
├─────────────────────────────────────────────────────────┤
│ ① Bún chả Hàng Quạt                         [Đổi quán]   │
│    Hoàn Kiếm · 4,3★ (1,2k đánh giá trên nguồn)           │
│    Vì sao: khớp "bún", gần điểm xuất phát (4 phút)        │
│    ≈ 30–50k · Giờ: chưa rõ (nguồn ghi 07:00–23:00)        │
│    🚶 4 phút (ước tính)          [Chỉ đường ↗]            │
│  ───── 🚶 10 phút ─────                                   │
│ ② Chè Bà Thắng …                                          │
├─────────────────────────────────────────────────────────┤
│ [📍 Xem bản đồ]  [📋 Sao chép]  [🖨 In]  [↺ Làm lại]     │
└─────────────────────────────────────────────────────────┘
```
- **Lịch trình là phần tử đầu tiên** trong khung nhìn; bản đồ là tab/Sheet thứ hai trên mobile, cột phải trên desktop.
- "Vì sao" sinh từ dữ kiện đã kiểm tra (mẫu), không cần LLM; Gemini chỉ diễn đạt khi còn lượt và qua bộ kiểm hiện có.
- "Đổi quán" mở Sheet **3 phương án** (tên, lý do, chênh lệch quãng đi/giá), người dùng chọn; các quán còn lại được khoá và có huy hiệu "giữ nguyên".
- "Chỉ đường ↗" là liên kết mở ứng dụng bản đồ (xem 4.5, không cần key).

### 3.5 Màn hình E — Danh sách quán / khám phá
Tab "Quán ăn": tìm theo tên/món/quận, lọc (quận, nhóm món, khoảng giá, "phù hợp bữa: sáng/trưa/tối", "đi nhóm/gia đình"), sắp theo "phù hợp nhất/gần nhất/đánh giá". Mỗi dòng: tên, quận, nhãn món, ★ và số đánh giá (kèm "theo nguồn, thu thập ngày …"), khoảng giá, nút "Thêm vào hành trình" (đưa vào danh sách ưu tiên của lần lập sau). Phân trang 50/trang (API sẵn có).

### 3.6 Màn hình F — Bản đồ (miễn phí)
- Mặc định: **không bắt buộc**. Phương án miễn phí: Leaflet + ô OSM (chính sách ô OSM cho phép xem tương tác nhẹ, **bắt buộc** ghi nguồn rõ ràng, URL HTTPS chuẩn, Referer hợp lệ, tôn trọng cache, **cấm** tải hàng loạt/offline; không bảo đảm SLA) — quyết định D2.
- Không vẽ đường thẳng như tuyến đi; chỉ đánh số điểm và đường nét đứt có chú thích "khoảng cách đường chim bay" (đã có ràng buộc trong hợp đồng v1.4).
- Marker quán có nút Hiện/Ẩn (`aria-pressed`), mặc định tắt, gom cụm.

### 3.7 Trạng thái hệ thống
| Trạng thái | Thông điệp & hành động |
|---|---|
| Trống (chưa có tour) | Màn hình A |
| Hết lượt Gemini | Dải nhỏ: "AI hết lượt hôm nay (đặt lại ~14:00–15:00 giờ VN) — vẫn dùng được chip và biểu mẫu" · không chặn |
| Gemini lỗi/chậm | "Dùng bộ luật cục bộ cho yêu cầu này" + nút "Thử lại bằng AI" (nếu còn lượt) |
| Không có kết quả | Lý do cụ thể + 2–3 nút "nới" (tăng ngân sách, đổi bán kính…) từ `proposed_changes` |
| Chưa đủ thông tin | Hỏi đúng ô thiếu, không hỏi lại ô đã có |
| Dữ liệu đã đổi (`dataset_changed`) | "Dữ liệu vừa cập nhật" + "Lập lại" giữ tuỳ chọn |
| Lỗi mạng/máy chủ | Thông báo + "Thử lại"; giữ nội dung đã nhập |
| Quyền vị trí bị từ chối | Hướng dẫn 1 dòng + nhập tay |

### 3.8 Responsive
- **≤ 599px**: một cột, thanh hành động dính đáy, Sheet toàn chiều rộng, header 1 dòng (≤ 56px).
- **600–1023px**: một cột rộng + bản đồ dạng Sheet.
- **≥ 1024px**: hai cột (trái: nhu cầu/hành trình; phải: bản đồ/chi tiết), nội dung chính luôn trong khung nhìn đầu.

---

## 4. Backlog tính năng (MoSCoW) và phát hành

### 4.1 Must (R1)
| ID | Tính năng | Giá trị |
|---|---|---|
| M1 | Bố cục mới: kết quả ở khung nhìn đầu, gỡ thuật ngữ nhà phát triển, một dải bằng chứng thu gọn | UX-01/02/03/05 |
| M2 | Luồng "nhu cầu → xác nhận → hành trình" với chip một chạm | UX-06/09 |
| M3 | Bộ đếm hạn mức Gemini (hiển thị, căn theo giờ Thái Bình Dương, mặc định 18/ngày) + bộ nhớ đệm + "rules-first" | UX-08, L5, L6 |
| M4 | Dùng trường dữ liệu có sẵn: đánh giá/số lượt, bữa phù hợp, đối tượng, tiện ích | L2 |
| M5 | "Vì sao chọn quán này" theo từng điểm dừng (mẫu, từ dữ kiện đã kiểm tra) | UX-03, niềm tin |
| M6 | Mục tiêu chạm ≥ 44px, tương phản, bàn phím, `prefers-reduced-motion` | UX-07 |
| M7 | Đổi quán với 3 phương án | trải nghiệm chỉnh sửa |

### 4.2 Should (R2)
S1 danh sách/khám phá quán có lọc · S2 bản đồ miễn phí (Leaflet+OSM, nếu D2 chốt) · S3 hành trình đã lưu (SQLite + danh sách) · S4 sao chép/in/chia sẻ dạng văn bản · S5 mở chỉ đường từng chặng bằng liên kết bản đồ · S6 chế độ tối · S7 chỉ số quan sát cục bộ (không PII) · S8 hiệu chỉnh hệ số ước tính đi bộ theo đo thật.

### 4.3 Could (R3)
C1 ngữ cảnh múi giờ/giờ ăn thông minh ("giờ cao điểm") · C2 gợi ý theo thời tiết (cần nguồn, hoãn) · C3 so sánh 2 hành trình · C4 PWA (cài đặt, ngoại tuyến cho giao diện) · C5 nhập giờ/giá đã xác minh bằng giao diện cho overlay · C6 xuất `.ics`.

### 4.4 Won't (bản này)
Tài khoản, thanh toán, đặt bàn, nhiều phương tiện, deploy công khai, dữ liệu thời gian thực (đang mở/đông), đánh giá do người dùng viết.

### 4.5 Bản miễn phí vs phần phải hoãn (cần dịch vụ trả phí hoặc đăng ký)

| Khả năng | Miễn phí/local ngay | Cần đăng ký (không billing) | Cần billing → **hoãn** |
|---|---|---|---|
| Hiểu yêu cầu | Bộ luật + Gemini Free (20/ngày) | — | Gemini trả phí để tăng hạn mức |
| Bản đồ | Leaflet + ô OSM (đúng chính sách) | Nhà cung cấp ô khác có gói miễn phí | Google Maps JS |
| Định tuyến | Ước tính (hiệu chỉnh, ghi nhãn) | openrouteservice (gói miễn phí, cần đăng ký tài khoản) | Google Routes |
| Tìm địa chỉ | Chọn khu phổ biến + toạ độ + liên kết | Nominatim công cộng (chính sách sử dụng nghiêm) — quyết định D4 | Google Places/Geocoding |
| Chỉ đường | Liên kết "Maps URL" mở ứng dụng bản đồ (không key, cần xác minh tài liệu trước khi làm) | — | — |
| Giờ/giá xác minh | Overlay tệp cục bộ (đã có) | — | — |

---

## 5. Kiến trúc và dữ liệu

### 5.1 Sơ đồ logic (không đổi nền tảng)
`Frontend (Next.js) ⇄ API v1.x (FastAPI) ⇄ {Loader/Repository, Planner thuần, LLM boundary, Provider adapters, SessionStore}`. Bổ sung: **Policy layer** (ngân sách LLM, đệm), **Feature layer** (đặc trưng quán từ CSV), **Metrics sink** cục bộ.

### 5.2 Hợp đồng API (đề xuất v1.6, chỉ thêm — không phá v1.x)
| Thay đổi | Mô tả |
|---|---|
| `GET /health` + `llm_budget` | `{limit, used, remaining, resets_at (ISO), window: "pacific_midnight"}`; không lộ key |
| `POST /v1/sessions/{id}/messages` | phản hồi thêm `extraction_source: rules|llm|cache` và `llm_budget.remaining` |
| `GET /v1/venues` | thêm `rating`, `review_count`, `suitable_meals`, `audiences`, `amenities` (cờ), `source_fetched_at`; mọi trường nhãn "theo nguồn" |
| `Tour.stops[].why` | `[ {code, text} ]` mã lý do (ví dụ `match_interest`, `near_origin`, `well_rated`) + câu tiếng Việt từ mẫu |
| `POST /v1/sessions/{id}/tour/alternatives` | `{venue_id}` → ≤ 3 phương án đã qua `validate_tour` kèm chênh lệch; `replace` nhận `venue_id` mới |
| `Preferences.meal` | `breakfast|lunch|snack|dinner|null` (suy ra từ giờ bắt đầu, sửa được) |
| `Preferences.audience` | `solo|friends|family|null` |
| `GET /v1/sessions` (có token) | danh sách hành trình đã lưu (id, tiêu đề, thời điểm) |

### 5.3 Planner và chuỗi dự phòng AI
1. **Rules-first**: bộ luật trích xuất; nếu đủ slot bắt buộc (điểm xuất phát + thời lượng) và không mơ hồ → **không gọi Gemini**.
2. **Gemini khi cần**: câu tự do, địa điểm ngoài danh sách, chỉnh sửa phức tạp; một lượt/tin nhắn, **không thử lại tự động** (trừ 5xx một lần nếu còn ngân sách).
3. **Đệm**: khoá = hash(văn bản chuẩn hoá + prior rút gọn) → kết quả trích xuất đã kiểm tra (TTL ngắn, bộ nhớ).
4. **Giải thích**: mẫu theo mặc định; Gemini chỉ khi người dùng bấm "Diễn đạt lại" **và** còn lượt.
5. **Ngân sách**: giới hạn cứng mặc định 18/ngày (chừa 2 lượt), theo dõi theo ngày Thái Bình Dương; 429 từ Google là nguồn sự thật → khoá lượt đến lần reset kế.
6. Khi hết: bộ luật + chip + biểu mẫu vẫn dùng được đầy đủ (không tính năng nào chỉ có ở Gemini).

Cải tiến chấm điểm (`planner`): `score = relevance + w_q·chất lượng (rating, review_count có làm mượt Bayes) + w_d·đa dạng − w_w·đi bộ + w_m·khớp bữa`; vẫn **không** dùng rating để bịa độ tin cậy; trọng số cấu hình, kiểm bằng bộ đánh giá offline (4 chỉ số ở mục 8.4).

### 5.4 Dữ liệu, chất lượng, riêng tư
- **Nguồn**: CSV cục bộ (quyền tái sử dụng công khai chưa xác lập). Không commit, không gửi toàn bộ danh sách ra ngoài.
- **Nạp thêm trường**: `rating_value`/`rating_scale_max` (chuẩn hoá 0–5), `review_count`, `suitable_meals`, `audiences`, `amenities_yes/no`, `cuisine_styles`, `prep_time`, `capacity_value`, `fetched_at`. Mọi giá trị mang nhãn "theo nguồn, thu thập ngày …".
- **Chất lượng**: báo cáo tổng hợp khi nạp (số thiếu, trùng toạ độ, lệch quận) — `qa/eval/geo_audit.py` đã có; thêm kiểm tra phân phối rating/review.
- **Riêng tư**: toạ độ vị trí hiện tại lưu theo phiên (TTL), không log, không gửi LLM (đã làm); tin nhắn gửi Gemini (đã ghi trong tài liệu); báo cáo/screenshot chỉ dữ liệu tổng hợp.

### 5.5 Phiên, đệm, quan sát
- SQLite đã có; thêm danh sách hành trình đã lưu (chỉ id quán + tuỳ chọn, dựng lại bằng `build_tour`).
- Quan sát cục bộ: bộ đếm (số tour, % dùng LLM/đệm/bộ luật, độ trễ p50/p95, tỉ lệ fallback, lỗi theo loại) — in-memory/SQLite, không PII, hiển thị ở `/health/details` khi `FOODTOUR_DEV=1`.

### 5.6 Bảo mật khoá và kiểm soát chi phí
- Khoá chỉ phía server qua `backend/.env` (git ignore); `/health` và log không bao giờ chứa khoá; quét khoá trong CI cục bộ.
- Hạn mức: ngân sách LLM cứng (5.3), ngân sách định tuyến/geocode theo nhà cung cấp (đã có), giới hạn theo token/IP (đã có).
- Mọi nhà cung cấp ngoài: allowlist host (đã có), không proxy/redirect, bật rõ ràng bằng biến môi trường.

---

## 6. Bảng task (đủ nhỏ để giao)

Quy ước: **A** = Antigravity (frontend/UX/QA trình duyệt), **C** = Codex (backend/dữ liệu/bảo mật/review), **CL** = Claude (kiến trúc/sản phẩm/planner-AI/tích hợp). Mỗi task có DoD kèm "bằng chứng lệnh thật".

### R0 — Nền tảng (hợp đồng + dữ liệu), ~1–2 ngày
| ID | Task | Chủ | Phụ thuộc | File/module dự kiến | Kiểm thử | DoD |
|---|---|---|---|---|---|---|
| R0-1 | Hợp đồng v1.6 (mục 5.2) + ví dụ JSON + bảng lỗi | CL | — | `contracts/v1/CONTRACT.md` | review chéo C+A đọc | A và C ký xác nhận hiểu; không mâu thuẫn v1.5 |
| R0-2 | Nạp trường mới từ CSV vào `Venue` + loader (rating, reviews, meals, audiences, amenities, fetched_at) với chuẩn hoá & nhãn nguồn | C | R0-1 | `backend/app/data/loader.py`, `planner/types.py` (CL phê duyệt kiểu) | unit: null/0/out-of-range/thang điểm khác; fixture tổng hợp mới | đếm tổng hợp khớp báo cáo; 0 dữ liệu riêng trong Git |
| R0-3 | Bộ đếm hạn mức LLM: theo ngày Thái Bình Dương, mặc định 18, lưu cục bộ; `/health.llm_budget` | C | R0-1 | `providers/gemini.py`, `api/routes.py`, `schemas.py` | giả lập đồng hồ; 429 khoá tới reset; không lộ key | test + OpenAPI drift OK |
| R0-4 | Rules-first + đệm trích xuất + không thử lại tự động | CL | R0-3 | `llm/provider.py`, `llm/extract.py` | kịch bản: đủ slot → 0 lượt; lặp lại → đệm; 5xx → tối đa 1 | đo số lượt/kịch bản (8.4) |
| R0-5 | Chấm điểm có chất lượng + bữa + lý do `why` | CL | R0-2 | `planner/relevance.py`, `engine.py` | bất biến: mọi tour qua `validate_tour`; so sánh exact baseline nhỏ | bộ đánh giá không hồi quy |

### R1 — Trải nghiệm cốt lõi, ~3–5 ngày
| ID | Task | Chủ | Phụ thuộc | File/module | Kiểm thử | DoD |
|---|---|---|---|---|---|---|
| R1-1 | Hệ token thiết kế + component nền (Button, Chip, Card, Banner, Sheet, Skeleton) | A | R0-1 | `frontend/app/styles/*`, `frontend/app/components/ui/*` | component test (render, a11y attr) | kích thước chạm ≥ 44px đo bằng script |
| R1-2 | Màn hình A (bắt đầu) + chip + chân trang trạng thái | A | R1-1, R0-3 | `app/page.js` tách `StartScreen` | CDP: 4 chip → điền ô; hiển thị lượt AI | không còn "CONTRACT/Mock" ở chế độ thường |
| R1-3 | Màn hình B (xác nhận) với ô tóm tắt + Sheet sửa | A | R1-1 | `components/SummaryRow`, `PreferencesSheet` | CDP: sửa 1 ô giữ các ô khác (bất biến slot) | nút "Lập hành trình" dính đáy mobile |
| R1-4 | Vị trí: nút xin quyền khi bấm, từ chối/timeout, khu phổ biến, nhập tay | A | R1-3 | `components/OriginPicker`, giữ cơ chế epoch/reset | CDP: nhánh denied/timeout/insecure; reset không rò | test cold-bootstrap tương đương cho OriginPicker |
| R1-5 | Màn hình D (hành trình) + dải bằng chứng thu gọn + StopCard + "Vì sao" | A | R0-5, R1-1 | `components/TourView`, `StopCard`, `EvidenceStrip` | CDP: tour nằm trong khung nhìn đầu (≤ 1 lần cuộn) ở 390 & 1280 | đo `getBoundingClientRect` |
| R1-6 | `tour/alternatives` + Sheet 3 phương án | C (API) + A (UI) | R0-1, R0-5 | `api/routes.py`, `engine.replace_stop` mở rộng (CL) | API: 3 phương án hợp lệ, khoá giữ nguyên; UI: chọn → cập nhật | e2e đổi quán giữ 2 quán còn lại |
| R1-7 | Trạng thái hệ thống đồng bộ (3.7) + hàng đợi banner | A | R1-1 | `components/StatusBanner` | CDP: giả lập hết lượt, lỗi 5xx, dataset_changed | mỗi trạng thái có nút hành động |
| R1-8 | A11y pass: bàn phím, focus, `aria-live`, tương phản, reduced-motion | A | R1-2..7 | toàn `frontend/` | axe-like script (không thêm dịch vụ) + kiểm tay | 0 lỗi mức nghiêm trọng đã biết |
| R1-9 | Kiểm thử hộp đen API v1.6 + quét rò khoá/token | A | R0-2..R1-6 | `qa/integration/` | script HTTP | 100% pass; báo cáo khuyết tật theo chủ |

### R2 — Khám phá & tiện ích, ~3–4 ngày
| ID | Task | Chủ | Phụ thuộc | File | Kiểm thử | DoD |
|---|---|---|---|---|---|---|
| R2-1 | Màn hình E: danh sách quán + lọc + phân trang | A (+C nếu cần tham số) | R0-2 | `components/VenueBrowser`, `api/routes.py` | CDP lọc → số lượng khớp API | 50/trang, không tải 1.702 dòng |
| R2-2 | Bản đồ miễn phí (Leaflet+OSM) — **sau quyết định D2** | A | D2, R1-5 | `components/MapPanel` | CDP: ô OSM đúng URL chuẩn, có ghi nguồn, không prefetch | ghi nguồn hiển thị; không tải hàng loạt |
| R2-3 | Hành trình đã lưu (`GET /v1/sessions`, danh sách UI) | C + A | R0-1 | `repositories/sqlite_sessions.py`, `components/History` | restart server → khôi phục; token cô lập | không lưu toạ độ chính xác lâu hơn TTL |
| R2-4 | Sao chép/in + liên kết chỉ đường từng chặng | A | R1-5 | `components/ShareBar` | CDP: nội dung sao chép không chứa token/toạ độ ngoài chủ ý | in đẹp ở A4 |
| R2-5 | Hiệu chỉnh ước tính đi bộ + nhãn | CL | — | `planner/interfaces.py` | so sánh với số đo thật do người dùng cung cấp (nếu có), nêu độ không chắc | hệ số ghi tài liệu, UI ghi "~" |
| R2-6 | Chế độ tối + token | A | R1-1 | styles | ảnh chụp 2 chế độ | đạt tương phản |
| R2-7 | Quan sát cục bộ + `/health/details` (chỉ dev) | C | R0-3 | `api/` | test không PII | không có văn bản người dùng trong log |

### R3 — Hoàn thiện (tuỳ chọn)
R3-1 so sánh 2 hành trình (A+CL) · R3-2 PWA (A) · R3-3 nhập giờ/giá xác minh qua giao diện (A+C) · R3-4 xuất `.ics` (A) · R3-5 đánh giá người dùng thật (CL tổ chức, người dùng thực hiện).

### Task xuyên suốt
| ID | Task | Chủ |
|---|---|---|
| X-1 | Review chéo mỗi PR theo bảng mục 7.3 | theo cổng |
| X-2 | Cập nhật `docs/RUNNING.md`, `docs/TASK_BOARD.md`, bàn giao từng release | CL |
| X-3 | Hồi quy tự động (`scripts/test.ps1` + cold-bootstrap + eval bộ luật) trước mỗi merge | C |

---

## 7. Quy trình tích hợp (Orca, worktree, review, rollback)

### 7.1 Worktree/nhánh (không tạo trùng)
| Vai trò | Worktree (đã có) | Nhánh | Đường dẫn sở hữu |
|---|---|---|---|
| CL | `foodtour-claude-coordinator` | `foodtour-claude-coordinator` (nhánh tích hợp) | `docs/`, `contracts/`, `backend/app/planner/`, `backend/app/llm/`, `qa/eval/` |
| C | `foodtour-codex-backend` | `foodtour-codex-backend` | `backend/app/{api,data,providers,repositories}`, `backend/tests/*`, `scripts/`, `tools/` |
| A | `foodtour-antigravity-web` | `foodtour-antigravity-web` | `frontend/`, `qa/e2e/`, `qa/integration/` |
- Mỗi worker bắt đầu bằng `git merge foodtour-claude-coordinator` (merge, không rebase/force).
- **Chống lặp worker**: trước mỗi `worker-start` kiểm `orchestration worker-list --run <run>`; dùng lại terminal đã giữ (`--terminal`) hoặc worktree hiện có; nếu `outcome_unknown`/bản nháp chưa gửi thì chỉ nhấn Enter, không chạy lại.
- **Antigravity bắt buộc tham gia**: tất cả task UI (R1-1…R1-8, R2-1/2/4/6) giao cho A; trước khi khởi chạy làn sóng xác minh có heartbeat/turn thật; nếu đăng nhập lỗi thì dừng và báo người dùng, **không** thay bằng agent khác.

### 7.2 Thứ tự merge
`R0-1 (hợp đồng)` → `R0-2/R0-3 (C)` → `R0-4/R0-5 (CL)` → API đổi (R1-6) → frontend (R1-x) → QA hộp đen (R1-9) → tài liệu/bàn giao. Không merge frontend trước khi API tương ứng đã vào nhánh tích hợp.

### 7.3 Cổng review
| Thay đổi của | Reviewer độc lập | Bằng chứng bắt buộc |
|---|---|---|
| Claude (planner/llm/contract) | Codex | lệnh test thật + probe lỗi |
| Codex (backend/provider/bảo mật) | Claude | chạy lại test, đọc mã nhạy cảm |
| Antigravity (frontend) | Codex (mã) + Antigravity QA khác task | CDP trên **bản build production**, chứng minh fail-before |
Quy tắc: `worker_done` không phải sản phẩm; chỉ nhận khi Claude chạy lại bộ test trên nhánh đã merge. Bài học phase 4: test dùng bản giả phải chạy **mã sản phẩm** và có bằng chứng fail-before.

### 7.4 Hoàn tác
Mỗi release là một chuỗi commit sau thẻ `release/rN-pre`; hoàn tác = `git revert` merge commit (không viết lại lịch sử). Cờ tính năng (`FOODTOUR_UI_V2`, `FOODTOUR_RANK_QUALITY`) cho phép bật/tắt không cần revert; dữ liệu mới là cộng thêm (không đổi khoá cũ) nên phiên cũ vẫn dựng lại được (`dataset_changed`).

---

## 8. Rủi ro, quyết định cần chốt, đo lường

### 8.1 Rủi ro
| ID | Rủi ro | Xác suất/Tác động | Giảm thiểu |
|---|---|---|---|
| K1 | Hạn mức Gemini 20/ngày cạn giữa buổi | Cao/Trung bình | M3: rules-first, đệm, bộ đếm hiển thị; UI không phụ thuộc AI |
| K2 | Chất lượng "đánh giá" nguồn không đồng nhất (thang điểm, ít đánh giá) | Trung bình/Trung bình | làm mượt Bayes, ngưỡng tối thiểu, ghi "theo nguồn", trọng số nhỏ |
| K3 | Ước tính đi bộ lệch thực tế | Cao/Trung bình | hiển thị "~", khoảng, hiệu chỉnh R2-5; tuỳ chọn routing miễn phí (D3) |
| K4 | Tái thiết kế UI gây hồi quy | Trung bình/Cao | cờ `UI_V2`, giữ test cold-bootstrap, tách component theo màn hình |
| K5 | Quyền sử dụng dữ liệu CSV chưa rõ | Cao/Cao | không công khai, không commit; nêu rõ trong tài liệu |
| K6 | Chính sách OSM thay đổi/chặn | Thấp/Thấp | URL ô cấu hình được; bản đồ là tuỳ chọn |
| K7 | Antigravity không đăng nhập được | Trung bình/Cao | cổng turn thật; báo người dùng; không thay thế âm thầm |
| K8 | Test xanh nhưng sai (như bản đồ phase 4) | Trung bình/Cao | kiểm trên bản build production, fail-before bắt buộc |

### 8.2 Quyết định cần người dùng chốt
| ID | Câu hỏi | Khuyến nghị |
|---|---|---|
| D1 | Chấp nhận bố cục mới (kết quả trước, chat phụ) thay giao diện hiện tại? | Có; giữ chế độ cũ sau cờ trong R1 |
| D2 | Dùng Leaflet + ô OSM cho bản đồ miễn phí (chấp nhận chính sách OSM, không SLA)? | Có, chỉ xem tương tác nhẹ, có ghi nguồn |
| D3 | Cho phép đăng ký tài khoản **miễn phí** openrouteservice để có tuyến thật (không billing)? | Hoãn; làm sau R2 nếu muốn tuyến thật |
| D4 | Tìm địa chỉ: chỉ chọn khu/toạ độ, hay dùng Nominatim công cộng (gửi chuỗi tìm kiếm ra ngoài)? | R1 chỉ chọn khu + toạ độ; Nominatim để sau |
| D5 | Ngân sách Gemini mặc định 18/ngày (chừa 2)? Có muốn tắt hẳn giải thích bằng LLM? | 18/ngày; giải thích bằng mẫu mặc định |
| D6 | Dùng rating/số đánh giá của nguồn để xếp hạng (nhãn "theo nguồn")? | Có, trọng số nhỏ, tắt được |
| D7 | Có muốn tổ chức đợt thử với 3–5 người thật (tự bạn)? | Có, sau R1 |

### 8.3 Điều kiện hoãn (cần trả phí/đăng ký)
Google Maps JS/Places/Routes/Geocoding; Gemini trả phí. Mã tích hợp Google đã có (phase 4) và vẫn nằm sau cờ cấu hình; **không** là điều kiện của R0–R2.

### 8.4 Đo thành công (mục tiêu đề xuất, đo bằng harness cục bộ — chưa phải kết quả)
| Chỉ số | Cách đo | Mục tiêu |
|---|---|---|
| Thao tác tới hành trình | CDP đếm bước từ chip tới tour | ≤ 3 |
| Tour trong khung nhìn đầu | `getBoundingClientRect` ở 390/1280 | 100% kịch bản |
| Lượt Gemini/hành trình | bộ đếm trên 20 kịch bản | ≤ 0,5 trung bình; 0 khi đủ slot |
| Tỷ lệ tour hợp lệ (`validate_tour`) | harness | 100% |
| Trích xuất đúng khi model trả lời | `qa/eval` | ≥ 95% (hiện: 39/39 lượt có phản hồi, gộp 6 lần chạy × 7 kịch bản; 3 lượt Gemini không phản hồi) |
| Thời gian lập tour | p50/p95 (bộ luật; có LLM) | p95 < 2 s; < 12 s |
| Mục tiêu chạm / tương phản | script đo | 100% ≥ 44px; tương phản ≥ 4,5:1 |
| Hồi quy | bộ test hiện có | 0 hỏng |
| Thử nghiệm người dùng | 3–5 người, nhiệm vụ "lập tour 3 quán" | ≥ 80% hoàn thành không trợ giúp; SUS ≥ 70 (đo thật, ghi trung thực mẫu nhỏ) |

---

## 9. Khuyến nghị khởi động

**Phase đầu nhỏ nhất có giá trị: "R0 + R1-lite" (≈ 3–4 ngày)** — làm kết quả hiện ngay trong khung nhìn đầu, gỡ thuật ngữ, và kiểm soát hạn mức Gemini; **không** phụ thuộc quyết định nào về bản đồ/định tuyến.

| Bắt đầu ngay sau khi bạn chốt D1, D5, D6 | Cần quyết định thêm trước khi làm |
|---|---|
| R0-1 hợp đồng v1.6 (CL) | R2-2 bản đồ (cần D2) |
| R0-3 bộ đếm Gemini + `/health.llm_budget` (C) | tuyến đi bộ thật (cần D3) |
| R0-2 nạp trường CSV mới (C) | tìm địa chỉ bằng dịch vụ ngoài (cần D4) |
| R0-4 rules-first + đệm (CL) | thử nghiệm người dùng (cần D7) |
| R1-1 token + component nền, R1-5 màn hình Hành trình (A) | — |
| R1-9 QA hộp đen (A) | — |

Thứ tự gợi ý: ngày 1 R0-1 → ngày 1–2 R0-2/R0-3 song song + R1-1 → ngày 2–3 R0-4/R0-5 + R1-5 → ngày 3–4 tích hợp, R1-9, phát hành nội bộ sau cờ `FOODTOUR_UI_V2`.

---

### Phụ lục A — Bằng chứng audit
- Ảnh chụp thật (1280px/390px): trạng thái trống của máy chủ đang chạy và trạng thái có hành trình (môi trường tạm, bộ luật, dữ liệu tổng hợp để không tốn hạn mức Gemini). Số đo: `scrollHeight` 2.271/927 (trống) và 3.404/2.102 (có tour); 28 nút, 15 ô nhập; nút nhỏ nhất 25px.
- Tài liệu chính thức đã đọc 2026-10-16: chính sách ô OSM (`operations.osmfoundation.org/policies/tiles`), rate-limits Gemini (`ai.google.dev/gemini-api/docs/rate-limits`: hạn mức tính theo project, đặt lại nửa đêm giờ Thái Bình Dương), cùng các tài liệu Routes/Maps/Places/Gemini của phase 4.
- Hạn mức Gemini 20/ngày là số do người dùng cung cấp; trang rate-limits không liệt kê con số theo model — kiểm tra thực tế trong AI Studio.

### Phụ lục B — Việc cố ý không làm trong bản kế hoạch này
Không đổi mã, không chạy dịch vụ trả phí, không gọi Gemini (không tốn hạn mức), không đọc nội dung dòng dữ liệu riêng (chỉ tên cột và số liệu tổng hợp).
