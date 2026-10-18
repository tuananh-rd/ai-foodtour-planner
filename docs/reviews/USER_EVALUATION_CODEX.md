# Đánh giá độc lập trải nghiệm người dùng — Codex

Ngày kiểm tra: 17/10/2026. Commit: `228ea0e17ff899aa10205d3e921e6e8d0034a6b6`.

## Kết luận

Chưa nên nghiệm thu trải nghiệm người dùng lần đầu. Luồng hỏi từng thông tin và yêu cầu xác nhận có nền tảng tốt; tuy nhiên ngôn ngữ tự nhiên còn làm mất hoặc hiểu sai yêu cầu, giao diện thay dữ liệu chưa biết bằng giá trị cụ thể, và bước xác nhận bỏ qua cảnh báo quan trọng. Không phát hiện P0 trong phạm vi kiểm tra; có 3 nhóm P1 cần xử lý trước nghiệm thu.

Đây là đánh giá bởi một agent đóng vai người dùng Việt Nam, không phải nghiên cứu với người dùng thật. Không thể hoàn thành thao tác trực quan trong browser; không khẳng định đã kiểm tra thành công desktop/mobile, bàn phím, screen reader hay mở Google Maps thực tế.

## Phạm vi và phương pháp

- Frontend `http://127.0.0.1:3010/`: HTTP 200, tài liệu HTML trả về; tiêu đề tab Orca đúng tên sản phẩm.
- Backend `http://127.0.0.1:8010`: `/health` và `/v1/client-config` đều HTTP 200. Dữ liệu đang dùng là private, định tuyến là `straight_line_estimate`; số giờ/giá có bằng chứng xác minh trong overlay đều bằng 0. Google Maps JavaScript/geocoding chưa cấu hình.
- Gemini được cấu hình với model `gemini-3.5-flash-lite`; không đồng nghĩa mọi lượt chat sử dụng Gemini hoặc Gemini thành công. Các lượt cơ bản được xử lý bằng rules. Một ca dị ứng ghi nhận `llm_calls=1` nhưng kết quả cuối vẫn `understanding=rules`; chưa có bằng chứng một lượt hiểu thành công bằng LLM.
- Tạo các phiên kiểm thử riêng bằng HTTP; không sửa hay xoá phiên người dùng. Không đọc hoặc sửa `.env`, không sao chép dataset, không ghi token, tên/ID/toạ độ quán riêng vào báo cáo. Chỉ ghi câu nhập giả định của người đánh giá.
- Orca tạo tab được, nhưng `snapshot` treo rồi trả `runtime_unavailable` (runtime đóng kết nối); `eval` cũng không cung cấp kết quả sử dụng được. Lần khởi chạy Chrome dự phòng bị chính sách thực thi chặn. Coordinator đã trả lời qua Orca: tiếp tục API, source-supported UX checks và test có sẵn, ghi rõ giới hạn, không khởi chạy Chrome khác.
- Dùng Next SWC đang cài và `react-dom/server` để render trực tiếp các component hiện tại với dữ liệu synthetic trong bộ nhớ. Đây là kiểm chứng HTML render của component, không phải kiểm chứng bố cục, sự kiện tương tác hoặc browser hydration. Không thêm test/dependency/file mã nguồn.
- Chỉ tạo báo cáo này trong repo; không commit/merge/push/deploy, không gọi Google Maps API hoặc mở liên kết Google.

## Kịch bản đã thực hiện và kết quả

| Mã | Kịch bản | Bằng chứng và kết quả |
| --- | --- | --- |
| S01 | Người dùng lần đầu mở ứng dụng | Frontend HTTP 200; config bật `chat_v2` và `guided_ui`. Source có lời chào tiếng Việt, ví dụ và ô nhập. Chưa đánh giá trực quan vị trí/độ dễ đọc. |
| S02 | “Mình muốn tour 3 quán quanh Hồ Gươm tối nay, 120 phút, 300 nghìn cho 3 người, thích phở và chè.” | HTTP 200; ghi nhận 3 người, 3 quán, 120 phút, 300.000 đ, phở/chè, buổi tối. Hỏi ngân sách cả nhóm/mỗi người; sau chọn cả nhóm hỏi giờ bắt đầu. `19h` thành `19:00`, giữ các slot trước và trình bản xác nhận, chưa tạo tour. Các lượt đầu khoảng 422–623 ms; không phải benchmark hiệu năng. |
| S03 | Xác nhận S02 | Trả `plan_conflict`, câu hỏi điều chỉnh và lựa chọn cụ thể; không trả tour giả hoặc tự nới điều kiện. Chưa hoàn tất tour với dữ liệu hiện chạy. |
| S04 | “Đi bộ tour 3 quán quanh Hồ Gươm tối nay lúc 19h, thời gian 240 phút, ngân sách 1 triệu cho cả nhóm 2 người.” | Trình xác nhận; xác nhận gặp `plan_conflict`. Chọn đúng option đang được cung cấp `relax_leg:30`, xác nhận; vẫn conflict. Chọn option kế tiếp `relax_leg:40`, xác nhận; vẫn conflict. Profile cập nhật lần lượt 30/40 phút, thời lượng vẫn 240. Không tự chuyển xe máy. Không kết luận mọi yêu cầu đều bất khả thi. |
| S05 | Câu tự nhiên: “Tụi mình đi ba đứa, chỉ rảnh một tiếng rưỡi chiều nay quanh Hồ Gươm, túi tiền bốn trăm nghìn cho cả hội, muốn ba hàng ăn nhẹ.” | HTTP 200 trong khoảng 672 ms; `party_size=3`, `duration_min=60` (đúng phải là 90), budget và stops còn null, không có câu hỏi làm rõ, `coverage.complete=true`, `llm_calls=0`. Xem E01. |
| S06 | Dị ứng chưa biết tên nguyên liệu | Nhập “Mình muốn tour 3 quán quanh Hồ Gươm tối nay, dị ứng mấy thứ rang giòn, chưa nhớ tên nguyên liệu.” Hỏi nguyên liệu, `pending.slot=allergy_term`, `llm_calls=1`, không suy ra chất dị ứng. Gửi `confirm_yes` vẫn không có tour và giữ câu hỏi dị ứng. Lượt ban đầu khoảng 1.886 ms. |
| S07 | Phiên thay đổi/sai quyền | Trên phiên S06, gửi revision cũ nhận HTTP 409; đọc bằng token sai nhận HTTP 403. Không kiểm thử UI retry/error bằng browser. |
| S08 | Timeline với dữ liệu chưa biết | Render synthetic 3 stops, `arrive=null`, `leg.minutes=null`, `source=unknown`: HTML chứa `19:00` 3 lần và `~5` phút đi bộ. Cảnh báo route truyền vào không xuất hiện. Xem E02/E03. |
| S09 | Google Maps URL miễn phí | Trong render S08, URL là HTTPS, host `www.google.com`, `travelmode=walking`, không có `key`, 1 waypoint cho 3 stops, anchor có `target=_blank` và `rel=noopener noreferrer`. Chỉ phân tích URL, không gửi đến Google; chưa xác minh Google nhận waypoint hoặc hiển thị tuyến đi bộ. |
| S10 | Xác nhận và phục hồi câu hỏi | Render summary synthetic với budget 300.000/cả nhóm và warning hours/price: số tiền đúng nhưng warning không hiện. Hàm phục hồi budget question trả cố định “500.000 đ...” dù câu gốc là 300.000. Xem E03/E04. |
| S11 | Hồi quy guided API với fixture synthetic | `.venv/Scripts/python.exe -X utf8 qa/e2e/test_guided_api.py --port 18267`: **26/26 PASS**, exit 0. Server riêng trên 18267, mock LLM; kiểm tra xác nhận mới tạo tour, giữ nghĩa vụ dị ứng, restore summary, giới hạn input, injection và từ chối endpoint legacy khi còn nghĩa vụ. Không phải bằng chứng live Gemini/private dataset. |
| S12 | Hợp đồng frontend mock | `npm --prefix frontend test`: **18/18 PASS**, exit 0. Bao gồm tour, replacement/locks, 409, strict thiếu bằng chứng, không âm thầm chuyển synthetic khi real API lỗi, Google Maps URL contract. Không phải kiểm thử browser hoặc provider thật. |

Lưu ý phương pháp: một lần thử HTTP ban đầu vướng encoding stdout PowerShell/Python; đã sửa encoding của tiến trình thử và chạy lại. Một lần gửi trực tiếp field `guided` nhận 422 do field không thuộc schema; frontend thực tế loại field đó trước khi gửi trong `lib/api.js`, nên đây không được tính là lỗi sản phẩm. Những lần gửi lại `request_plan`/option cũ trong probe ban đầu không được dùng để kết luận vòng lặp lỗi; S04 dùng đúng các option mới đang được cung cấp.

## Phát hiện và mức độ

Quy ước: P0 = rủi ro nghiêm trọng tức thời; P1 = cản nghiệm thu luồng chính hoặc sai lệch thông tin quyết định; P2 = ma sát/tính minh bạch/accessibility cần sửa; P3 = cải thiện nhỏ. Không phát hiện P0; các nhận xét chưa thao tác browser đều ghi rõ phương pháp.

### E01 — P1: “Cứ nói tự nhiên” nhưng âm thầm hiểu sai thời lượng và bỏ ngân sách

**Bằng chứng trực tiếp:** S05 hiểu “một tiếng rưỡi” thành 60 phút; mất “bốn trăm nghìn cho cả hội” và “ba hàng”; không hỏi lại, coverage vẫn complete, không gọi Gemini. Câu nhập là giả định, không chứa dữ liệu cá nhân thật.

**Tác động:** người mới phải biết dùng cú pháp máy mới tránh lập tour sai. Sai thời lượng làm thay đổi số quán/khả năng hoàn thành; bỏ ngân sách làm mất điều kiện quan trọng. Hiện trạng cấu hình Gemini không bảo đảm bắt được câu này.

**Quick win:** nhận diện số tiếng Việt, “tiếng rưỡi”, “cả hội” và “hàng ăn”; khi phát hiện tín hiệu thời lượng/ngân sách chưa bao phủ phải hỏi lại hoặc dùng fallback hợp lệ. Hiện phần đã hiểu và phần còn thiếu trước khi mời xác nhận.

**Tiêu chí chấp nhận:** cùng câu S05 phải ghi nhận 90 phút, 400.000 đ/cả nhóm, 3 người, 3 stops, hoặc hỏi rõ từng phần còn mơ hồ; không được tự ghi 60 phút hay báo coverage hoàn tất khi mất điều kiện.

### E02 — P1: Dữ liệu chưa biết biến thành thông tin cụ thể trên UI

**Bằng chứng component render và source:** `GuidedTimeline.jsx` dùng `stop.arrive || '19:00'` và `leg?.minutes || 5`; S08 tái hiện giờ/ETA giả định khi contract cho phép null. Biểu thức `|| 5` còn đổi chặng 0 phút thành 5 phút. `UnderstoodCard.jsx` tạo các row thiếu bằng Hồ Gươm, 2 người, 3 quán, 120 phút, Tối nay và gán status `user`; render với `items=[]` tái hiện địa điểm/thời lượng/buổi mặc định. Chưa chứng minh tần suất tình huống này trong browser live.

**Tác động:** thông tin suy đoán trông như điều người dùng đã nói hoặc lịch trình đã tính; vi phạm ranh giới unknown. Người dùng có thể tin vào giờ và thời gian di chuyển chưa có căn cứ.

**Quick win:** hiển thị “chưa rõ/chưa tính được”, giữ 0 khi hợp lệ, không gán giá trị fallback là do người dùng cung cấp. Chỉ đề xuất mặc định khi có nhãn và bước xác nhận.

**Tiêu chí chấp nhận:** null giờ/ETA không sinh 19:00/~5; source unknown phải giữ trạng thái unknown. Row thiếu trong profile không tự nhận Hồ Gươm/2/3/120/Tối nay là dữ liệu người dùng.

### E03 — P1: Bước xác nhận và timeline bỏ cảnh báo quyết định

**Bằng chứng component render và source:** `ConfirmSummaryCard.jsx` không render `summary.warnings`/`missing`; S10 truyền 2 warning hours/price nhưng cả hai vắng trong HTML. Component có câu “tối đa …” hiển thị ngân sách yêu cầu nhưng thiếu câu phân biệt mức trần mong muốn và chi phí được bảo đảm. `GuidedTimeline.jsx` không render `tour.status`, `unknowns`, `route_warnings`, `reasons` hoặc `assumptions`; S08 có route warning nhưng HTML không chứa nó. Backend source `chat/engine.py` tạo summary warnings nên thông tin đã có ở server.

**Tác động:** quyết định xác nhận thiếu ngữ cảnh giá cấp quán, giờ chưa xác minh và tính có điều kiện. Có dòng disclosure chung và ghi chú dị ứng, nhưng chúng không thay thế cảnh báo cụ thể của tour.

**Quick win:** trước nút xác nhận, hiện các warning liên quan bằng tiếng Việt; timeline hiện nhãn “Gợi ý có điều kiện” và các unknown quan trọng. Ghi ngân sách là “mức bạn muốn chi”, giá quán không phải tổng tiền ăn theo người.

**Tiêu chí chấp nhận:** mọi warning truyền vào summary hiện hoặc được gộp có nghĩa tương đương; tour conditional/insufficient evidence không có cùng cách trình bày với verified feasible; không mất cảnh báo route và không tuyên bố bảo đảm ngân sách khi chưa có giá theo người.

### E04 — P2: Reload có thể đổi câu hỏi ngân sách thành 500.000 đ

**Bằng chứng API + source/execution:** S02 trả pending `budget_scope` không có question/prompt; câu đúng 300.000 đ nằm trong reply. Khi restore, `GuidedLayout.jsx` gọi `getClarifyQuestionText('budget_scope')`, hàm luôn trả “500.000 đ là ngân sách cho cả nhóm hay cho mỗi người?”. Đã thực thi riêng hàm hiện tại và nhận chuỗi này. Chưa reload browser thành công.

**Tác động:** người dùng tưởng mất/thay ngân sách và không biết đang xác nhận số nào.

**Quick win:** dùng số tiền trong profile khi phục hồi hoặc giữ nguyên nội dung câu hỏi của server; dùng “Ngân sách này…” nếu không có giá trị.

**Tiêu chí chấp nhận:** nhập 300k rồi reload tại câu hỏi phạm vi phải còn 300.000 đ, cùng phạm vi chưa rõ; kiểm tra thêm 150k/1 triệu để tránh hardcode.

### E05 — P2: Điều chỉnh sau “chưa lập được tour” chưa đưa người dùng tới kết quả

**Bằng chứng trực tiếp:** S03 không có tour; S04 tăng thời lượng lên 240 phút và thử đúng hai lựa chọn cho phép đi 30 rồi 40 phút mỗi chặng vẫn không có tour. Mỗi lần đều phải xác nhận lại. Đây là kết quả của các ca thử cụ thể, chưa chứng minh planner sai hoặc dữ liệu chắc chắn có lời giải.

**Tác động:** người dùng mất nhiều lượt mà không biết thay đổi nào thực sự có khả năng giúp; đề nghị xe máy cũng xa kỳ vọng walking-first.

**Quick win:** giải thích constraint nào đang cản, đưa phương án giảm/đổi điểm gần hơn trong khu thí điểm; nếu đề nghị nới điều kiện chỉ là thử nghiệm thì nói rõ chưa bảo đảm có lời giải. Không tiếp tục gợi thay đổi đã thử mà không có thông tin mới.

**Tiêu chí chấp nhận:** tái hiện S04; sau điều chỉnh, hoặc có tour được hard-constraint checker chấp nhận, hoặc nêu rõ điều kiện còn thiếu và đề xuất thay đổi có căn cứ. Không cần trả tour khi thực sự bất khả thi; cần chốt được trạng thái no solution rõ ràng và hành động tiếp theo hữu ích.

### E06 — P2: Thiếu giải thích cụ thể về dữ liệu gửi Gemini/Google ở luồng guided

**Bằng chứng source/render:** `TrustDisclosure.jsx` nói nguồn, giờ/giá, khoảng cách và “cách hiểu” nhưng không giải thích nội dung yêu cầu có thể chuyển đến nhà cung cấp AI. Disclosure chỉ có sau khi đã trò chuyện. `GuidedTimeline.jsx` tạo URL Google trực tiếp và không có câu dữ liệu chỉ gửi khi mở hoặc thời gian Google có thể khác; S09 xác minh URL chứa các điểm và không có key. Component `MapsLinksBlock.jsx` ở luồng khác có cách trình bày riêng, không chứng minh guided đã có cùng thông tin.

**Tác động:** người dùng khó biết khi nào câu chat/địa điểm rời ứng dụng. Không có bằng chứng lộ key trong các dữ liệu đã xem; không kiểm toán toàn bộ bundle hoặc payload outbound server trong lần đánh giá này.

**Quick win:** trước gửi yêu cầu, thêm giải thích ngắn với chi tiết có thể mở; cạnh CTA Maps ghi liên kết chứa vị trí các điểm, gửi tới Google khi mở, lịch trình ở Google có thể khác. Không cần đưa thuật ngữ nội bộ/quota vào luồng chính.

**Tiêu chí chấp nhận:** người dùng đọc được dữ liệu gửi đi, bên nhận và thời điểm gửi trước hành động liên quan; guided dùng cùng chính sách minh bạch như luồng Maps URL khác; không đòi key Google trả phí để mở URL.

### E07 — P2: Dialog disclosure thiếu quản lý focus bàn phím

**Bằng chứng chỉ từ source:** `TrustDisclosure.jsx` có `role=dialog`, `aria-modal`, tên dialog và Escape, nhưng không có initial focus, giữ Tab trong dialog hoặc trả focus về nút mở. Chưa thao tác Tab/screen reader thực tế.

**Tác động dự kiến:** người dùng bàn phím có thể tiếp tục tương tác nền khi dialog còn mở; người dùng screen reader khó biết nội dung mới nằm ở đâu.

**Quick win:** dùng dialog/sheet accessible sẵn có, tập trung vào nút đóng/tiêu đề khi mở và khôi phục focus khi đóng.

**Tiêu chí chấp nhận:** trên desktop và mobile có bàn phím, focus vào dialog khi mở, Tab/Shift+Tab nằm trong dialog, Escape đóng và focus trở về “Chi tiết”; nền không nhận tương tác khi modal mở.

### E08 — P2: Loading chưa có phản hồi hữu hình đủ rõ

**Bằng chứng source:** `GuidedLayout.jsx` đặt busy, vô hiệu hoá input/button và có `aria-busy`; live region chỉ được cập nhật sau khi nhận reply. Không tìm thấy thông báo đang xử lý hoặc indicator theo busy trong màn guided. S06 mất khoảng 1,9 giây; chưa đo UI với mạng chậm/provider timeout.

**Tác động dự kiến:** người dùng thấy điều khiển tắt nhưng không rõ đang đọc yêu cầu, bị lỗi hay phải chờ bao lâu. Error đã có chuỗi tiếng Việt và nút thử lại trong source, nhưng chưa kiểm chứng thao tác retry/recovery.

**Quick win:** thêm trạng thái “Đang đọc yêu cầu…”/“Đang lập lịch trình…” và thông báo polite ngay lúc bắt đầu; giữ nội dung nhập khi lỗi.

**Tiêu chí chấp nhận:** kiểm tra delay có kiểm soát và lỗi 5xx/offline/409: loading được nhìn/đọc thấy, không gửi trùng, lỗi có hướng xử lý, retry thành công giữ slot; không để nút tắt vô thời hạn.

## Mobile và accessibility cơ bản

Source có các điểm tích cực: container max-width 720 với padding; chip wrap, phần lớn CTA có chiều cao 44–48 px; câu hỏi có ô nhập riêng, button thật; `aria-live`, `aria-busy`, nhãn nút và logic chuyển focus theo bước. Không coi các dấu hiệu này là mobile/accessibility PASS.

Cần kiểm tra thực tế 390×844 và 1280×800: bàn phím ảo có che ô nhập/CTA không, có tràn ngang khi tên dài không, focus có nhảy khi đang gõ không, zoom 200%, contrast và screen reader đọc câu hỏi/lỗi. Stepper số người trong source là 36×36 px, nên tăng mục tiêu chạm lên 44 px là quick win; chưa đo vùng bấm sau CSS/layout thực tế. Dialog E07 là phần ưu tiên kiểm tra bàn phím.

## Điều kiện nghiệm thu đề nghị

1. Sửa E01–E03; dữ liệu chưa biết luôn còn unknown, không biến mặc định thành thông tin người dùng hoặc giờ/ETA thật.
2. Chạy lại S02/S04 với dữ liệu local được phép: nhận tour hợp lệ 3–5 stops khi có lời giải; khi không có lời giải, thông báo rõ và không âm thầm nới constraint. Mọi tour hợp lệ phải qua hard-constraint checker; không gộp lỗi tour vào tỷ lệ extraction thành công.
3. Hoàn tất browser flow độc lập: nhập → hỏi rõ → xác nhận → timeline → kiểm tra Google Maps URL → đổi một quán; giữ các quán khoá và phát hiện không có phương án thay. Thành công fixture không thay thế thành công trên dữ liệu local thực tế.
4. Xác minh E04 và E06–E08 qua browser; kiểm tra offline/5xx/delay có kiểm soát, reload giữa câu hỏi, session conflict và retry. Không gây lỗi bằng cách tắt server đang dùng chung.
5. Kiểm tra desktop/mobile và bàn phím như trên. Không còn P1 chưa xử lý; P2 còn lại phải có quyết định chấp nhận và owner rõ ràng.
6. Tách các bằng chứng: rules extraction, lượt provider được thử, lượt LLM thành công, planner hợp lệ, UI thành công. Trong lần này live có một lượt provider được thử nhưng chưa xác minh LLM understanding thành công; Maps chỉ được kiểm tra cấu trúc URL, không phải routing/ETA thật.

## Giới hạn còn lại và bàn giao

Chưa hoàn tất tour với dataset private ở 8010, nên timeline/Maps/replacement trên chính dataset đó chưa được nghiệm thu. Tour synthetic trong test API và render component được ghi nhận riêng. Không khẳng định mọi quán/phương án đều không khả thi, không kết luận provider thật thất bại từ trường `understanding=rules`, và không đưa ảnh fixture cũ làm bằng chứng thao tác mới.

Không tạo commit; reviewer là Claude coordinator, frontend owner Antigravity cần rà E02–E04/E06–E08, planner/LLM owner cần rà E01/E05. Báo cáo là đầu ra duy nhất; không thay code, config hoặc dataset.
