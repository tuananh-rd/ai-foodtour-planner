# Kế hoạch nâng cấp tiếp theo: hiểu câu tự nhiên đáng tin + giao diện đơn giản cho người đi ăn

> Trạng thái: **Proposed — awaiting user approval** (17/10/2026). Chưa sửa mã, chưa tạo worker.
> Người soạn: Claude (điều phối/kiến trúc/AI). Nối tiếp C0–C6 (đã đóng, `45308ad`), là một đợt riêng, tạm gọi **U-series (U0–U6)**.

## 0. Tóm tắt cho người duyệt

- **Gốc lỗi (ĐÃ HIỆU CHỈNH ở U0, xem `docs/reports/U0_S0_FAIL_BEFORE.md`):** chuỗi "Trích xuất thông tin (bộ luật cục bộ)" chỉ tồn tại ở **panel chat cũ v1** (`POST /messages`). Trên cả v1 và v2, bộ luật **có ghi dị ứng "đậu phộng"**; panel v1 chỉ *hiển thị* thời lượng/ngân sách/món/chế độ nên trông như bỏ sót dị ứng. Gemini không chạy vì v1 chỉ gọi khi thiếu điểm xuất phát/thời lượng, còn v2 chỉ nhìn độ tin cậy ý định (0,95 ≥ 0,75). Ở v2 những thứ thật sự bị rơi: món thích, số quán và "tối nay" (chưa là slot), không hỏi phạm vi ngân sách, không có thẻ "Mình hiểu là…". Bản nháp đầu của kế hoạch nói "mất dị ứng ở engine" là **sai**; mình sửa lại sau khi chạy test thật.
- **Hướng sửa AI:** thêm lớp *"kiểm kê phủ"* (coverage audit) tất định: mỗi tín hiệu có trong câu (dị ứng, món, số quán, thời điểm, ngân sách, phạm vi) phải được ghi lại hoặc bị đánh dấu "chưa hiểu". Có tín hiệu chưa ghi nhận → hạ tin cậy + (nếu còn hạn mức) gọi Gemini; hết hạn mức → hỏi lại đúng chỗ thiếu, **không bao giờ im lặng bỏ dị ứng**. Lớp an toàn dị ứng luôn chạy bằng luật, không phụ thuộc Gemini.
- **Hướng sửa UI:** một luồng dẫn duy nhất *Nói nhu cầu → Bot chép lại & hỏi bổ sung → Xác nhận → Tour → Mở Google Maps*; ẩn mọi thứ kỹ thuật (nguồn dữ liệu, Gemini/luật, bộ đếm) vào mục "Chi tiết" thu gọn; chỉ còn một dòng trạng thái tin cậy.
- **Ràng buộc giữ nguyên:** không Google Maps API/key/billing (chỉ URL miễn phí), không push/deploy, không lộ `.env`/CSV, tôn trọng hạn mức Gemini free-tier.
- **Cần bạn duyệt:** mục 9 (9 câu, mặc định đề xuất in đậm). Chưa có dòng code nào được viết trước khi bạn duyệt.

## 1. Chẩn đoán và ranh giới rủi ro

### 1.1 Chuỗi nguyên nhân (đã kiểm chứng ở mức chỉ đọc)

| # | Quan sát | Nguyên nhân (đã xác nhận / giả thuyết) |
|---|---|---|
| D1 | Câu đa ý → chỉ một `intent` thắng (`SET_ALLERGY`) | Xác nhận: `understand()` trả một ý định chính; phần còn lại phụ thuộc `parse_slots`. |
| D2 | Người dùng thấy "không ghi nhận" dị ứng | **Đã hiệu chỉnh:** dị ứng được ghi ở cả v1 và v2; panel v1 không hiển thị nó (`ChatPanel.jsx:131-143`). |
| D3 | Mất món "phở", "bún chả" | Xác nhận: không có trong patch. Sở thích món chỉ được nhận khi là ý định riêng. |
| D4 | Mất "tối nay", "3 quán" | Xác nhận: không có `start_time`/`stops` trong patch. "Tối nay" mơ hồ (giờ bắt đầu? khung giờ?) — cần quy tắc rõ, không tự đoán giờ. |
| D5 | Ngân sách 500k "cho 2 người" ghi `budget_vnd` nhưng không có phạm vi | Xác nhận: patch không có `budget_scope`. Câu mơ hồ (500k tổng hay mỗi người) phải được hỏi, không đoán. |
| D6 | Gemini không được gọi | Xác nhận: v1 `needs_llm()` chỉ gọi khi thiếu origin/duration; v2 `confidence 0.95 ≥ 0.75`. Cả hai không xét độ phủ. |
| D7 | Bot hỏi dài, rườm rà | Giả thuyết: do có nhiều slot thiếu được hỏi cùng lúc/ tuần tự thay vì gom và chép lại những gì đã hiểu. |
| D8 | UI giống công cụ dev | Xác nhận từ phản hồi người dùng + rà code: ProfileBar nhiều ô điều khiển, banner nguồn dữ liệu/Gemini/bản đồ, huy hiệu "bộ luật cục bộ" (`ChatColumn.jsx`). Hiển thị thuật ngữ nội bộ cho người dùng thường. |

### 1.1a Lỗi trích xuất dị ứng (ghi rõ, đã hiệu chỉnh)

- **Không có lỗi trích xuất dị ứng trên S0** ở `MockExtractor` (v1) và `ChatEngine` (v2): đều ghi `đậu phộng` (family `peanut`). Test A1, A1b, A5, A8 pass trên C6 và được ghim làm kiểm soát hồi quy.
- **Lỗi thật (UX, an toàn gián tiếp):** panel v1 không hiển thị dị ứng, số người, khu vực, số quán, bữa; người dùng không có cách kiểm chứng điều hệ thống đã ghi. Đây là khoảng trống minh bạch trong an toàn, sẽ được đóng bằng thẻ "Mình hiểu là…" (có mục Dị ứng luôn hiện, kể cả khi trống: "Dị ứng: chưa có").
- **Rủi ro còn lại cần chặn bằng test:** cú pháp dị ứng khác S0 (câu ghép dài, không dấu, "không ăn được lạc", cue không kèm chất) chưa được đo trên tập mù; U1 đo lại, không giả định đã an toàn.
- Yêu cầu giữ: lexicon chạy trên toàn câu gốc, độc lập ý định thắng; cue không chất ⇒ hỏi bắt buộc.

### 1.1b Chính sách escalation Gemini (tóm tắt có thể kiểm thử)

| Điều kiện | Hành động |
|---|---|
| Nút bấm (action), chào hỏi, luật phủ đủ mọi tín hiệu và tin cậy ≥ 0,75 | Không gọi Gemini |
| Tin cậy < 0,75, **hoặc** có tín hiệu (dị ứng, món, số quán, thời điểm, tiền, phạm vi) chưa vào slot, **hoặc** câu đa ý mà luật phủ < 50%, **hoặc** slot mâu thuẫn | Gọi Gemini **tối đa 1 lần/lượt**, `retry=False`, nếu còn cap phiên (6) và dự trữ ngày (3); dùng cache trước |
| Hết cap / lỗi / không cấu hình | Không gọi; hỏi đúng phần thiếu bằng nút; dị ứng thiếu chất → hỏi bắt buộc |
| Kết quả Gemini | Qua `sanitize`; dị ứng hợp (union) với luật, không xoá; slot mâu thuẫn → hỏi lại; phạm vi ngân sách và giờ không do Gemini tự quyết |
| Ghi nhận | `trigger_reason`, `llm_calls`, `budget_state` trong `TurnResult`; test khẳng định bằng các trường này |

### 1.2 Ranh giới rủi ro (không được vượt)

1. **Dị ứng là ưu tiên an toàn cao nhất:** nếu câu có tín hiệu dị ứng mà không trích được chất cụ thể, hệ thống **phải hỏi lại** chứ không lập tour, và không bao giờ gắn nhãn "an toàn". Giữ nguyên quy tắc hiện có: tour có dị ứng luôn kèm `unknowns: allergy_ingredients`.
2. **Gemini chỉ đề xuất, không quyết định:** đầu ra qua `sanitize` (whitelist + kiểm khoảng), mọi dị ứng do Gemini đưa ra phải được luật an toàn xác minh lại hoặc hiển thị để người dùng xác nhận; Gemini không bao giờ *xoá* một dị ứng mà luật đã bắt được.
3. **Không bịa:** không đoán phạm vi ngân sách, giờ cụ thể từ "tối nay", hay chất dị ứng. Thiếu → hỏi.
4. **Hạn mức:** giữ cap theo phiên (6), dự trữ ngày (3), cache TTL, một lượt một cuộc gọi, không retry. Không tăng hạn mức, không bật billing.
5. **Riêng tư:** không ghi/in `.env`, khoá, hàng CSV Foody; log và báo cáo chỉ có số tổng hợp. Không gửi dữ liệu venue thô tới Gemini ngoài ngữ cảnh đã whitelist hiện tại.
6. **Maps:** chỉ URL miễn phí dựng ở client/chuỗi; không gọi Maps API từ backend.
7. **Giới hạn trung thực:** đây là hệ thống hội thoại có phạm vi hẹp (đi ăn Hà Nội). Không hứa "hiểu mọi câu"; ngoài phạm vi thì nói rõ và đưa lựa chọn.

## 2. Ca chấp nhận dựa trên câu gốc của bạn

Câu gốc **S0**: *"Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin."*

| ID | Điều kiện | Kết quả bắt buộc |
|---|---|---|
| A1 Dị ứng | S0, **mọi chế độ** (có/không Gemini, hết hạn mức) | Hồ sơ ghi dị ứng **đậu phộng** (`peanut`) ngay lượt 1, hiển thị trong phần "Mình hiểu là…". Không lượt nào được lập tour khi dị ứng chưa ghi. |
| A2 Dị ứng, mutation | Tắt riêng phần trích dị ứng | Test **fail** (kiểm tra đột biến), chứng minh test thật sự bắt lỗi. |
| A3 Sở thích | S0 | `interests = {phở, bún chả}`. |
| A4 Số quán | S0 | `stops = 3` (có thể sửa được ở bước xác nhận). |
| A5 Thời gian: tổng vs đoạn đi | S0 "120 phút" | Hiểu là **tổng thời lượng tour** (120), **không** phải thời gian di chuyển giữa 2 quán (`max_leg_min`). Câu "không quá 10 phút giữa các quán" mới là `max_leg_min`. Hiển thị rõ nhãn khác nhau. |
| A6 Ngân sách | S0 "500 nghìn cho 2 người" | `budget_vnd=500000`, nhưng **phạm vi mơ hồ** → bot hỏi 1 câu ("500 nghìn là cả nhóm hay mỗi người?") với 2 nút; không đoán. Nếu câu nói rõ ("mỗi người 500 nghìn") thì ghi thẳng. |
| A7 "Tối nay" | S0 | Ghi ý "buổi tối, hôm nay"; **không tự gán giờ bắt đầu**. Hỏi giờ bắt đầu bằng chip nhanh (18:00 / 19:00 / 20:00 / nhập giờ). Nếu người dùng gõ giờ thì dùng giờ đó. Ngoài ra gắn cờ "nguồn ghi giờ mở cửa" chứ không khẳng định đang mở. |
| A8 Câu "hãy hỏi tôi nếu thiếu" | S0 | Là chỉ thị phong cách (hỏi trước khi làm), **không** phải mệnh lệnh lập tour và không được làm rơi các slot khác. |
| A9 Xác nhận | Sau khi đủ thông tin | Bot hiện thẻ tóm tắt một màn hình; chỉ lập tour sau "Đúng, lập tour" tường minh. "Ừ", "ok" mơ hồ khi không có câu hỏi treo → hỏi lại, không lập. |
| A10 Phản hồi trung thực | Hết hạn mức Gemini | UI nói bằng ngôn ngữ thường ("Mình đang hiểu theo cách đơn giản, bạn kiểm tra giúp phần tóm tắt nhé"), không thuật ngữ nội bộ. |
| A11 Đếm gọi | S0 lặp lại cùng phiên | Gọi Gemini ≤ 1 lần cho S0; lần lặp dùng cache = 0 lần; bộ đếm ngày tăng đúng bằng số lần gọi thật. |

Biến thể bắt buộc trong corpus: "dị ứng đậu phộng/lạc/đậu phụng", "không ăn được tôm", "bé 5 tuổi", "tối nay/chiều mai/cuối tuần", "500k / 500 nghìn / nửa triệu", "mỗi người/cả nhóm/tổng", câu mỉa mai, trích dẫn, giả định ("nếu tôi bị dị ứng…" — không ghi).

## 3. Chiến lược hội thoại đề xuất

### 3.1 Kiến trúc ba lớp

```
Tin nhắn ─► [L1 An toàn tất định]  luôn chạy, không phụ thuộc mạng
              dị ứng/chống chỉ định, UNSAFE, giả định/trích dẫn/mỉa mai không hành động
          ─► [L2 Trích xuất luật + KIỂM KÊ PHỦ]
              mỗi tín hiệu trong câu → slot đã ghi  HOẶC  "chưa hiểu: <loại>"
              độ tin cậy = f(ý định, độ phủ, mâu thuẫn)
          ─► [L3 Gemini (tuỳ chọn)] chỉ khi L2 báo "chưa phủ đủ" và còn hạn mức
              ─► sanitize ─► hợp nhất theo quy tắc ưu tiên (mục 3.3)
          ─► Bộ máy hội thoại hiện có (pending, xác nhận, planner sau xác nhận)
```

### 3.2 Bộ kích hoạt Gemini mới (thay vì chỉ `confidence < 0.75`)

Gọi Gemini khi **bất kỳ** điều nào sau đúng và còn hạn mức:
1. `confidence < CONFIDENT` (như hiện nay);
2. **Tín hiệu chưa phủ:** từ khoá dị ứng/ăn kiêng/bệnh lý, từ chỉ số lượng quán, thời điểm, tiền, hoặc món ăn xuất hiện trong câu nhưng không có slot tương ứng được ghi;
3. **Câu đa ý** (≥ 3 mệnh đề mang tín hiệu) mà luật chỉ trích được < một nửa;
4. Mâu thuẫn giữa các slot (ví dụ 500k + 3 quán + 2 người + 120 phút không khả thi) — để xin làm rõ chứ không để đoán.

Không gọi Gemini khi: ca chỉ là nút bấm (action), chào hỏi, ca luật đã phủ đủ, hoặc đã hết cap/ dự trữ (→ mục 3.4).

### 3.3 Hợp nhất kết quả (quy tắc ưu tiên)

- **Dị ứng/an toàn:** hợp (union). Luật bắt được thì Gemini không xoá được. Gemini thêm dị ứng mới → hiện "Mình hiểu bạn dị ứng X, đúng không?" nếu độ chắc thấp.
- **Slot số/giờ/tiền:** nếu luật và Gemini mâu thuẫn → hỏi lại, không chọn ngầm.
- **Slot trống:** Gemini điền, đánh dấu nguồn `ai` (giữ provenance hiện có).
- Phạm vi ngân sách và giờ bắt đầu: **không bao giờ** do Gemini tự quyết khi câu không nói.

### 3.4 Khi không có Gemini (hết hạn mức / lỗi / chưa cấu hình)

- Hỏi lại **đúng phần chưa hiểu**, gom thành một thẻ có nút, tối đa 1 câu hỏi chính mỗi lượt (không đổ cả danh sách).
- Luôn hiện thẻ "Mình hiểu là…" để người dùng sửa; dị ứng chưa trích được → hỏi trực tiếp "Bạn dị ứng với chất gì?" kèm chip phổ biến (đậu phộng, hải sản, sữa, trứng, gluten…).
- Không im lặng, không hạ cấp thành "tour tạm" thiếu dị ứng.

### 3.5 Phản hồi thấy được nhưng không kỹ thuật

- Thay huy hiệu "bộ luật cục bộ"/"AI" bằng một dòng nhẹ: **"Mình đã hiểu: …"** (tóm tắt slot), cộng biểu tượng nhỏ "đã kiểm tra" khi mọi tín hiệu đã phủ.
- Chi tiết kỹ thuật (nguồn hiểu, số lần gọi, trạng thái Gemini) chỉ nằm trong mục **"Chi tiết"** thu gọn, dành cho debug.
- Khi Gemini đang chạy: chỉ báo "Đang đọc kỹ yêu cầu…" (có giới hạn thời gian, rồi quay về luật).

### 3.6 Đếm gọi có thể kiểm thử, ngân sách, riêng tư

- Mỗi `TurnResult` ghi `llm_calls`, `trigger_reason` (`low_conf` / `uncovered:<loại>` / `multi_clause` / `conflict`), `budget_state`. Kiểm thử đọc các trường này, không đọc log.
- **Sổ đếm bền**: kể cả các script smoke phải dùng cùng bộ đếm ngày bền (tồn đọng cũ: 11 lượt trước không vào sổ). Kế hoạch bổ sung: harness smoke đọc/ghi bộ đếm bền của backend (qua cùng cổng `LLMBudget`).
- Kiểm tra bất biến: tổng cuộc gọi ≤ cap phiên; ≥ dự trữ ngày luôn còn; tìm trong log/báo cáo không có khoá, không có hàng CSV (quét tự động).
- Smoke thật: tối đa **8 lượt** cho cả đợt (xem mục 8), có đo lường trước/sau.

## 4. Thiết kế lại giao diện cho người đi ăn thường

### 4.1 Nguyên tắc

1. **Một luồng chính** duy nhất, mỗi màn chỉ một việc chính.
2. **Tiết lộ dần (progressive disclosure):** mặc định ẩn bộ lọc, trạng thái dữ liệu, bản đồ nhúng, thông số; mở khi cần.
3. **Ngôn ngữ đời thường:** "Mình hiểu là…", "Bạn muốn đi mấy quán?", không "intent", "pending", "provenance", "slot", "nguồn: bộ luật".
4. **Một dòng tin cậy:** thay các banner bằng một thanh nhỏ: *"Dữ liệu quán từ Foody • giờ & giá là theo nguồn ghi • khoảng cách ước tính"* (bấm để xem chi tiết).
5. **Mobile-first**, thao tác một tay, vùng chạm ≥ 44px.

### 4.2 Luồng trước/sau

**Trước (hiện tại):** Màn chat + ProfileBar nhiều ô + cột khám phá + cột danh sách + banner trạng thái → người dùng không biết bắt đầu từ đâu.

**Sau:**
```
① Bắt đầu    Một ô nhập lớn + 3-4 gợi ý ("Ăn tối 2 người quanh Hồ Gươm"…)
② Mình hiểu là…   Thẻ tóm tắt có thể sửa từng mục (khu vực, số người, ngân sách, thời gian,
                  dị ứng, món thích). Thiếu gì → đúng MỘT câu hỏi + nút/chip
③ Xác nhận   "Lập tour 3 quán, ~120 phút, ≤500k cả nhóm, tránh đậu phộng?"  [Đúng, lập tour] [Sửa]
④ Tour       Danh sách theo thứ tự: giờ ước tính • tên quán • món gợi ý • giá theo nguồn
             • lưu ý dị ứng ("Hỏi quán về thành phần") — dạng dòng thời gian dọc, chữ lớn
⑤ Mở Maps    Nút chính "Mở lộ trình trong Google Maps" (URL miễn phí); phụ: từng quán
```
Sau tour: "Đổi quán", "Bớt/ thêm", "Làm lại từ đầu" — chỉ 3 hành động.

### 4.3 Bố cục và hành vi

- **Desktop:** cột chat ở giữa (rộng vừa phải); tour hiện thành bảng bên phải **chỉ sau xác nhận**; bản đồ nhúng/khám phá nằm sau nút phụ.
- **Mobile:** một cột; thẻ tóm tắt cuộn ngang; thanh hành động dính đáy (Xác nhận / Mở Maps); không đặt hai thanh cố định chồng nhau.
- **Dị ứng/chống chỉ định:** luôn có chip riêng dễ thấy, kèm mô tả "Mình không thể bảo đảm an toàn — hãy hỏi quán".
- **Tiếp cận:** nhãn cho mọi điều khiển, thứ tự Tab hợp lý, `aria-live` cho tin nhắn mới và lỗi, tương phản ≥ 4,5:1, không dựa chỉ vào màu, hỗ trợ `prefers-reduced-motion`, phóng chữ 200% không vỡ bố cục.
- **Lỗi/trạng thái rỗng:** thông báo đời thường + việc kế tiếp ("Mình chưa thấy quán hợp… Bạn muốn nới ngân sách hay đổi khu vực?").
- Giữ cờ `FOODTOUR_UI_V2` (giao diện cũ vẫn truy cập được khi tắt).

### 4.4 Những gì ẩn/gộp (so với hiện tại)

| Hiện tại | Đề xuất |
|---|---|
| ProfileBar đủ ô cùng lúc | Thẻ "Mình hiểu là…", mở sửa từng mục |
| Banner Gemini/dữ liệu/bản đồ | Một dòng tin cậy + mục "Chi tiết" thu gọn |
| Huy hiệu "bộ luật cục bộ" | Bỏ khỏi đường chính, chỉ ở "Chi tiết" |
| Cột khám phá + danh sách luôn mở | Mặc định ẩn; mở khi người dùng bấm "Xem thêm quán" |

## 5. Phân rã tác vụ theo đợt và phân công

Nguyên tắc: tác giả ≠ người review; `worker_done` chưa phải tích hợp (Claude chạy lại test trên nhánh gộp); test mới phải có bằng chứng fail-trước; Antigravity bắt buộc cho phần UI (không thay thế); mỗi worker một lần dispatch, không trùng.

| Đợt | Nội dung | Chủ | Phụ thuộc | Cổng review |
|---|---|---|---|---|
| **U0** | Chốt: tái hiện S0 thành test fail-trước, bảng ca A1–A11, hợp đồng nhỏ (trường `coverage`, `trigger_reason`, `budget_scope` prompt), quyết định mục 9 | Claude | Duyệt kế hoạch | Codex review hợp đồng (≤1 vòng) |
| **U1** | Lớp L1+L2: kiểm kê phủ, sửa trích dị ứng/món/số quán/"tối nay"/phạm vi ngân sách, phân biệt 120 phút tổng vs đoạn đi, "hãy hỏi tôi" = chỉ thị phong cách | Claude | U0 | Codex độc lập: bộ held-out mù, mutation (A2), fuzz |
| **U2** | Bộ kích hoạt Gemini mới + hợp nhất + dự phòng + sổ đếm bền + lộ trường kiểm thử; prompt cập nhật | Claude (AI) + Codex (tích hợp `routes`/ngân sách bền, test API) | U1 | Codex review + đo gọi/ca; Claude chạy lại trên nhánh gộp |
| **U3** | Dữ liệu hiển thị: API trả `understood` (tóm tắt slot), `question` (một câu hỏi + lựa chọn), `confirm_summary` thân thiện | Codex | U0 hợp đồng | Claude review hợp đồng/drift |
| **U4** | Thiết kế lại UI: luồng ①–⑤, thẻ "Mình hiểu là…", dòng tin cậy, "Chi tiết", mobile, a11y, timeline tour, CTA Maps | **Antigravity** (bắt buộc) | U3 (API) và mockup duyệt ở U0 | Codex review tích hợp + Claude QA; kiểm thử trình duyệt (mục 6.5) |
| **U5** | Đánh giá tổng: corpus, regression/adversarial, smoke Gemini ≤ 8, quét riêng tư, thử người dùng nhỏ | Codex (soạn corpus mù, chạy) + Claude (chạy lại) | U2, U4 | Báo cáo accept/request-changes độc lập |
| **U6** | Tích hợp cuối, cập nhật tài liệu, đóng đợt | Claude | U5 ACCEPT | Bộ test đầy đủ tuần tự |

Giữ nguyên quy ước vận hành: một harness trình duyệt tại một thời điểm; cổng test 13000/18000/19222 hoặc 13100/18100/19300; không đụng cổng 3000/8000 của bạn.

## 6. Kiểm thử và đánh giá

### 6.1 Corpus tiếng Việt

- Mở rộng `qa/chat` với **≥ 150 câu mới** do Codex soạn và đóng băng trước khi chạy (tách khỏi bộ dev): câu đa ý, dị ứng (biến thể chính tả/không dấu/viết tắt), tiền (k/nghìn/triệu/nửa triệu), thời điểm (tối nay, chiều mai, cuối tuần), số quán/thời lượng/đoạn đi, câu chỉ thị phong cách ("hỏi tôi nếu thiếu"), mỉa mai, trích dẫn, giả định, phủ định.
- Mỗi câu gắn nhãn đúng: tập slot kỳ vọng + mức an toàn (an toàn nhất = hỏi lại).

### 6.2 Hồi quy và đối kháng

- Giữ nguyên toàn bộ bộ cũ (backend 424 test, 26 kịch bản CH/ADV, fuzz có hạt giống); thêm kịch bản A1–A11; thêm đột biến (tắt trích dị ứng, tắt kiểm kê phủ, tắt hạn mức) — phải **fail đúng**.
- Fuzz: đầu vào ngẫu nhiên không bao giờ sinh tour khi chưa xác nhận hoặc khi dị ứng chưa rõ.

### 6.3 Smoke Gemini thật (giới hạn)

- Tối đa **8 lượt cho cả đợt**, chạy ở U2 (trước/sau) hoặc U5, qua sổ đếm bền; ghi loại lỗi. Không chạy trong CI. Kết quả chỉ được báo là *quan sát trên mẫu nhỏ*, không phải độ chính xác tổng quát.

### 6.4 Riêng tư/bảo mật

- Quét tự động: không `.env`/khoá/CSV trong git, log, báo cáo; chuỗi dữ liệu từ dataset vẫn qua `clean_text`; URL Maps chỉ chứa chuỗi miễn phí; xác nhận không có gọi Maps API.

### 6.5 Trình duyệt E2E và khả dụng

- CDP E2E trên bản production: S0 end-to-end (desktop + mobile 390px), kiểm tra hiển thị "Mình hiểu là…" đúng, chip dị ứng, một câu hỏi mỗi lượt, tour hiển thị đọc được, nút Maps mở đúng URL.
- A11y: kiểm tra tự động (axe-core hoặc tương đương nếu đã có trong repo; nếu chưa — dùng kiểm tra thủ công có danh sách, **không thêm phụ thuộc mới khi chưa duyệt**), Tab-order, `aria-live`, tương phản, zoom 200%.
- Khả dụng: 5 kịch bản nhiệm vụ do bạn hoặc Codex đóng vai người dùng thường; đo số thao tác và số chỗ nhầm.

### 6.6 Tiêu chí thoát (đo được)

| Chỉ số | Ngưỡng |
|---|---|
| S0 và 10 biến thể: dị ứng ghi đúng ngay lượt 1 (luật, không Gemini) | **100%** |
| Tour được lập khi dị ứng/phạm vi ngân sách còn mơ hồ | **0** ca (corpus + fuzz) |
| Corpus mù mới — slot an toàn (không ghi sai, không bỏ dị ứng; chấp nhận "hỏi lại") | **≥ 95%** |
| Corpus mù — độ chính xác đầy đủ (slot đúng hết) | báo cáo trung thực; mục tiêu **≥ 85%** (đợt trước chỉ ~77%; nếu không đạt phải ghi rõ, không che) |
| Đột biến A2 và 2 đột biến khác | fail như kỳ vọng |
| Số lần Gemini / lượt ≤ 1; / phiên ≤ cap; sổ đếm bền khớp số gọi thật | 100% |
| Backend test, drift, 5 bộ frontend + `test_chat_v2` | xanh, chạy lại tuần tự bởi Claude |
| UI: S0 hoàn thành bởi người dùng thường trong ≤ 4 thao tác sau khi gõ | đạt ở ≥ 4/5 lượt thử |
| Quét riêng tư/ khoá/ CSV | 0 phát hiện |
| Độ trễ (trừ Gemini) lượt hội thoại | p95 ≤ 500 ms trên backend cục bộ |

**Không hứa:** hiểu mọi câu, đúng 100% ngôn ngữ tự nhiên, hay chất lượng Gemini tổng quát — chỉ hứa các bất biến an toàn và các chỉ số đo được ở bảng trên.

## 7. Rủi ro và giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Gọi Gemini nhiều hơn khiến cạn 20 lượt/ngày | Bộ kích hoạt hẹp (chỉ khi chưa phủ), cache, dự trữ ngày, dự phòng hỏi lại tất định; đo lượt/ca ở U2 |
| Kiểm kê phủ gây hỏi thừa | Đo "tỉ lệ hỏi thừa" trên corpus; mục tiêu ≤ 1 câu hỏi/lượt |
| Luật lại quá khớp (overfit) như đợt trước | Corpus mù do Codex soạn, báo cáo lần chạy đầu và sau sửa riêng |
| Redesign UI đổi nhiều, làm hỏng tính năng đã chấp nhận | Giữ `FOODTOUR_UI_V2` + bộ E2E hiện có chạy xuyên suốt; giao diện cũ vẫn bật được |
| Antigravity không khả dụng | Dừng việc UI, báo lỗi và hành động đăng nhập tối thiểu; không thay thế bằng agent khác |
| Dị ứng sai ở bước Gemini | Hợp (union) + người dùng xác nhận trước lập tour |

## 8. Phạm vi không nằm trong đợt này

Giao diện di động riêng (app), Postgres, xác thực tài khoản, thời tiết, bản đồ kéo ghim, lưu/chia sẻ lịch trình, Google Maps API/Places/Directions (bất kỳ dạng nào), push/deploy, viết lại lịch sử git, tăng hạn mức Gemini.

## 9. Quyết định cần bạn duyệt trước khi bắt đầu code

(Mặc định đề xuất **in đậm**.)

1. **Chấp nhận U0–U6 như một đợt tách khỏi C6?** (**Có**.)
2. **Cho Gemini kích hoạt khi "tín hiệu chưa phủ" (không chỉ khi tin cậy thấp)?** (**Có, tối đa 1 lượt/lượt hội thoại**; thay thế: giữ ngưỡng cũ và chỉ hỏi lại bằng luật.)
3. **Ngân sách mơ hồ ("500 nghìn cho 2 người"): luôn hỏi phạm vi?** (**Có, hỏi bằng 2 nút**; thay thế: mặc định "cả nhóm" và hiện để sửa.)
4. **"Tối nay": không tự gán giờ, hỏi chip 18/19/20h?** (**Có**; thay thế: mặc định 18:00.)
5. **Dị ứng chưa trích được chất → bắt buộc hỏi trước khi lập tour?** (**Có**.)
6. **UI: thay luồng chính bằng luồng ①–⑤ và đưa chi tiết kỹ thuật vào "Chi tiết" thu gọn?** (**Có**; có muốn xem mockup tĩnh trước khi Antigravity làm? **Có, bắt buộc ở U0**.)
7. **Smoke Gemini thật tối đa 8 lượt cho cả đợt, qua sổ đếm bền (sửa tồn đọng bộ đếm trong bộ nhớ)?** (**Có**.)
8. **Cho phép thêm thư viện kiểm tra a11y (axe-core) làm devDependency?** (**Không — dùng danh sách kiểm tra tay/CDP sẵn có**; nếu bạn đồng ý thì Codex thêm vào `package.json` ở U5.)
9. **Mức mục tiêu độ chính xác đầy đủ trên corpus mù: 85%?** (**Có, nhưng chấp nhận báo cáo trung thực nếu thấp hơn, miễn các bất biến an toàn đạt 100%**.)

## 10. Phạm vi chính xác của lượt này

- Chỉ thêm tài liệu: file này + một dòng "Proposed — awaiting user approval" trong `docs/TASK_BOARD.md`.
- **Không** sửa mã sản phẩm, manifest phụ thuộc, cấu hình, hành vi server; **không** tạo worker; không push/deploy.
- Việc tái hiện S0 ở mục 0/1 chỉ là chạy hàm hiểu bằng bộ dữ liệu giả lập, không gọi mạng, không gọi Gemini, không chạm `.env`/CSV.

## 11. Trạng thái triển khai (cập nhật 17/10/2026, Run `run_4cd95f8d40ed`)

Người dùng đã duyệt toàn bộ kế hoạch và 9 quyết định mặc định. Ghi chú theo đợt (chi tiết ở `docs/TASK_BOARD.md`):

| Đợt | Trạng thái | Bằng chứng |
|---|---|---|
| U0 hợp đồng v1.9/1.9.1, test fail-trước S0, mockup | Xong | `contracts/v1/CONTRACT.md`, `backend/tests/chat/test_u0_s0.py`, `docs/reports/U0_S0_FAIL_BEFORE.md`, `docs/ux/guided-flow-mockup.html`; Codex review U0 = REQUEST-CHANGES (chặn dị ứng bị bỏ qua qua `edit_profile→request_plan→confirm_yes`) → đã sửa và đóng băng ở v1.9.1 |
| U1 engine (kiểm kê phủ, slot, luồng một câu hỏi, thẻ "Mình hiểu là…") | Xong, test xanh | `backend/app/chat/coverage.py`, `engine.py`; 557 test backend |
| U2 Gemini theo độ phủ + hợp nhất an toàn | Xong; smoke thật 4/8 lượt | `qa/live/guided_gemini_smoke.py`; dị ứng do AI đề xuất luôn `ai_unconfirmed`; mô tả/triệu chứng bị loại |
| U3 API (cờ `guided_ui`, metadata, sổ đếm bền, cổng chặn kế hoạch) | Xong, Codex `cc50d50` | `docs/reports/CODEX_U3_API.md` |
| U4a giao diện dẫn dắt (fixture) | Xong, Antigravity `f0954e3`, Claude chạy lại 42/42 | `docs/reports/ANTIGRAVITY_U4A.md` |
| U4b/U4c/U4d giao diện với API thật, sửa theo review độc lập | Xong (Antigravity `f3da507`, `0f29013`, U4d); driver Chrome độc lập của Codex 157/157 | `docs/reports/ANTIGRAVITY_U4B.md`, `U4C`, `U4D`, ảnh ở `docs/reports/u4b/` |
| U5 đánh giá độc lập (Codex: v1, v2, v3, v4 mù) | Xong, REQUEST-CHANGES ở mỗi vòng → đã sửa | `docs/reports/CODEX_U5A*.md`, `CODEX_U5C.md`, `CODEX_U5D.md` |
| U6 tích hợp cuối | Xong (xem bảng dưới) | `docs/TASK_BOARD.md` |

### Số liệu mù trung thực (lần chạy đầu của từng bộ, động cơ bộ luật, không Gemini)
| Bộ | Số ca | An toàn (bất biến) | Đúng toàn bộ slot |
|---|---|---|---|
| v1 (mù, trước khi sửa) | 190 | 94,7% | 66,8% |
| v2 (mù, giữ lại) | 152 | 100% | 73,7% |
| v3 (mù) | 225 | 89,8% | 50,7% |
| **v4 (mù, mới nhất)** | 220 | **78,6%** | **32,3%** |

Sau mỗi vòng, các ca thất bại được sửa tổng quát hoá nên v1–v4 hiện chỉ còn là **bộ phát triển (không còn mù)**: v1/v2 100%, v3 an toàn 98,7% / slot 89,3%, v4 an toàn 84,1% / slot 80,5% (chấm theo khớp đúng từ, nên "sữa" so với "sữa bò" bị tính là sai). **Kết luận trung thực:** bộ luật cục bộ không đạt "hiểu tự nhiên đáng tin" trên câu mới lạ; mỗi bộ mù mới vẫn tìm ra lỗi mới. Vì vậy an toàn dựa vào cấu trúc chứ không dựa vào độ chính xác của luật: nghĩa vụ dị ứng/ngân sách bền vững, cổng chặn lập tour ở cả engine lẫn API, dị ứng do AI luôn cần xác nhận, câu trả lời tự do ngoài từ điển phải được xác nhận, và thẻ "Mình hiểu là…" luôn hiện dòng Dị ứng. Độ chính xác slot cần Gemini (hoặc người dùng sửa trên thẻ) mới tốt hơn; chưa đo được trên quy mô lớn do hạn mức 20 lượt/ngày.

### U6 — kết quả tích hợp cuối (17/10/2026)
- Backend 559 test OK (1 skip có sẵn), OpenAPI không lệch; kiểm tra API thật trên uvicorn 26/26 (`qa/e2e/test_guided_api.py`).
- Giao diện: guided_ui 44/44, guided real-API e2e 25/25 (đột biến fail đúng), driver Chrome độc lập của Codex `codex_guided_review.mjs` 157/157, ui_v2 28, components 48, ui_kit 11, maps 61, contractTest 18, chat_v2 31 (cờ tắt).
- Luồng S0: 4 thao tác sau khi gõ (chọn phạm vi ngân sách, chọn giờ, "Đúng, lập tour", mở Maps) — Codex đo độc lập trên desktop và mobile.
- Gemini thật: 7/8 lượt dùng cho cả đợt (hạt/vỏ cứng/đồ biển/không nhớ tên); không có vi phạm bất biến; mô tả mơ hồ và triệu chứng bị loại; chất do AI đề xuất luôn cần xác nhận.
- Nhật ký các vòng review độc lập: U0 (chặn), U3, U5a/a2/c/d (4 bộ mù), U5e/U5f (trình duyệt) — mỗi vòng đều REQUEST-CHANGES và đều đã sửa; các lỗ hổng đáng kể đã tìm ra gồm: bỏ qua nghĩa vụ dị ứng qua `edit_profile→request_plan→confirm_yes`, qua `POST /tour` cũ, qua câu trả lời tự do kiểu "lập tour đi", và xoá nhầm dị ứng của người đi cùng.
