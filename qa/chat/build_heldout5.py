"""Independent synthetic C6d labels, frozen before target evaluation/rule reading."""
import json
import logging
from build_heldout2 import ROOT, SEARCH, CONFIRM, bootstrap
from run_scenarios import fold

logging.disable(logging.CRITICAL)
PLANNED = CONFIRM + [{'type': 'confirm_yes'}]
GROUPS = [
('ASK_DETAIL', SEARCH, [
 'Dạ quý khách xin hỏi A có ghế cho bé 4 tuổi không ạ?',
 'B ni có mái che khi mưa không rứa?',
 'Could you explain giá quán A includes những gì?',
 'Em đi học về lúc 17h. Mẹ đón em muộn. Cho em hỏi B có chỗ rửa tay không?',
 'A có nhận tiền mặt k, hỏi thông tin thôi nha.']),
('SEARCH_VENUES', SEARCH[:1], [
 'Dạ nhờ bộ phận hỗ trợ tìm quán bánh cuốn ở Hoàn Kiếm ạ.',
 'Tìm quán bún chả cho bé với mẹ quanh hồ nha cô.',
 'Kiếm tiệm bánh mì gần Hồ Gươm giùm tui nghen.',
 'Hôm nay họp dài quá. Laptop cũng hết pin. Search quán phở quanh Hoàn Kiếm please.',
 'Tìm quán cà phê phố cổ dc ko bạn?']),
('DISCOVER_DISH', [], [
 'Có thêm món gì không ngoài phở để cháu thử ạ?',
 'Hà Nội có thêm món gì cho người mới tới hông?',
 'Any more món địa phương nào hay hay để khám phá?',
 'Mẹ bảo cháu được tự chọn. Cháu chưa biết món nào. Cô gợi ý món Hà Nội cho cháu nhé.',
 'Ngoài bánh mì còn có thêm món chi ngon ở Hà Nội rứa?']),
('COMPARE', SEARCH, [
 'Dạ xin đối chiếu A với B về giá để gia đình cân nhắc ạ.',
 'A vs B chỗ mô lên món nhanh hơn hè?',
 'Compare A and B giúp tui về parking nha.',
 'Bé nhà em ăn chậm. Nhà em còn đi bảo tàng. So sánh A với B về khoảng cách đi bộ giúp em.',
 'So sánh giá A vs B dc k, chưa chọn quán nào đâu.']),
('ADD', SEARCH, [
 'Kính nhờ bạn thêm quán B vào danh sách đã chọn ạ.',
 'Cô ơi thêm quán A vào danh sách cho con nha.',
 'Thêm B vô danh sách giùm tui nghen, tui chọn rồi.',
 'My lunch break is short. Thêm A vào danh sách giúp mình. Thanks for helping.',
 'Thêmm quán B vào list giúp em với ạ.']),
('REMOVE', PLANNED, [
 'Dạ xin xóa quán đầu ra khỏi danh sách lựa chọn ạ.',
 'Cô bỏ quán A ra khỏi danh sách của con nha.',
 'Gỡ điểm đầu khỏi danh sách giùm tui hen.',
 'I checked with my family. Remove quán đầu khỏi list please. We will choose later.',
 'Xoáa A khỏi danh sách giúp mình, không đi đó nữa.']),
('KEEP', PLANNED, [
 'Dạ vui lòng giữ nguyên quán A trong tour cho gia đình ạ.',
 'Cô khóa quán đầu lại cho con nhé, con thích chỗ đó.',
 'Giữ nguyên A nghe, chỗ ni bà ngoại chọn rồi.',
 'We agreed yesterday. Keep quán đầu nguyên trong tour giúp mình. Other stops can wait.',
 'Giữr quán đầu lại nha bạn, đừng thay chỗ ấy.']),
('UPDATE_PROFILE', [], [
 'Dạ xin điều chỉnh số người của đoàn thành 7 người ạ.',
 'Nhà con đi 4 người cô nhớ ghi lại nhé.',
 'Ngân sách cả nhóm đổi qua 820k nghen bạn.',
 'Work ends late today. Set giờ bắt đầu thành 18:30 giúp mình. That is the only update.',
 'Đi bộ trong 95 phút nha, ms đổi thời lượng đó.']),
('SET_ALLERGY', [], [
 'Dạ xin ghi nhận bé nhà tôi dị ứng đậu phộng ạ.',
 'Con bị dị ứng trứng cô nhớ cho con nhé.',
 'Tui dị ứng cua nghe, nhớ lưu điều kiện ni.',
 'Just a dietary update. Tôi bị dị ứng sữa. Please remember it.',
 'Em bị dị ứng tôm, lưu lại vs ạ.']),
('SET_AVOID', [], [
 'Dạ đoàn chúng tôi kiêng thịt bò, xin lưu vào điều kiện ăn uống.',
 'Cô nhớ con kiêng sữa nha cô.',
 'Tui kiêng trứng nghe, ghi lại giùm tui với.',
 'Please avoid đậu phộng trong mọi món của mình nhé.',
 'Lưu điều kiện kiêng tôm cho em vs, em mới nhắn r đó.']),
('REQUEST_PLAN', CONFIRM[:-1], [
 'Dạ nhờ bạn lập tour từ danh sách gia đình vừa chọn ạ.',
 'Cô lên lịch trình mấy quán con chọn cho con xem nha.',
 'Lập tour từ danh sách ni giùm tui với hè.',
 'I finished choosing. Please tạo lịch trình từ các quán đã chọn. Send me the summary.',
 'Lậpp tour từ list này cho em xem dc k?']),
('MODIFY_PLAN', PLANNED, [
 'Dạ xin thay quán đầu trong lịch trình đã lập bằng quán khác ạ.',
 'Cô đổi quán đầu trong tour cho con với nha.',
 'Thay điểm đầu tour ni giùm tui, mấy điểm sau giữ vậy.',
 'Plans changed after the call. Replace quán đầu trong tour giúp mình. Everything else is fine.',
 'Đổii quán đầu trong lịch trình này giúp em vs.']),
('CONFIRM_YES', CONFIRM, [
 'Dạ gia đình xác nhận tóm tắt, vui lòng tạo tour ngay ạ.',
 'Con đồng ý tóm tắt rồi, cô lập tour luôn nhé.',
 'Tui xác nhận tạo tour theo bản tóm tắt ni nghe.',
 'I have reviewed it. Tôi đồng ý tạo lịch trình bây giờ theo tóm tắt.',
 'Xác nhận đồng ý tạo tour r nha, làm giúp em.']),
('CONFIRM_NO', CONFIRM, [
 'Dạ cảm ơn, gia đình chưa đồng ý tạo tour lúc này ạ.',
 'Cô đừng tạo tour nha, con chưa hỏi mẹ xong.',
 'Khoan lập tour nghe bạn, tui chưa chốt mô.',
 'Thanks for the summary. Please đừng tạo lịch trình bây giờ. I need more time.',
 'Chưa xác nhận đâu, ko tạo tour nhé bạn.']),
('OUT_OF_SCOPE', [], [
 'Dạ bộ phận hỗ trợ có đặt khách sạn ở Huế được không ạ?',
 'Cô xem dự báo thời tiết Hà Nội chiều nay cho con được không?',
 'Bạn đặt bàn nhà hàng giùm tui được hông?',
 'Could you pay the bill hộ mình được không?',
 'Tìm tour ăn uống ở Cần Thơ giúp em vs.']),
('GREET_OR_SMALLTALK', [], [
 'Dạ kính chào bộ phận hỗ trợ chuyến ăn uống ạ.',
 'Con chào cô hướng dẫn ạ!',
 'Chào bạn nghe, tui mới ghé ứng dụng nè.',
 'Hello hello, chúc bạn một buổi tối vui vẻ.',
 'Cảm ơn bạn nhiều nha, helpful quá trời.']),
('AMBIGUOUS_ACK', CONFIRM, [
 'Dạ đã tiếp nhận thông tin, xin chờ người nhà phản hồi ạ.',
 'Con thấy rồi cô ơi, để con đọc cho mẹ nghe đã.',
 'Ừ nghe rứa đó, tui còn xem lại chút nghe.',
 'Received, currently reviewing with my family.',
 'ok r, ms đọc thôi chứ chưa chốt nha',
 'Vâng cảm ơn, xin phép chưa quyết định lúc này.',
 'Hay quá ha, đọc một phát là phải quyết luôn chắc?',
 'Em đọc dòng "tạo tour ngay" rồi, em chỉ trích lại thôi.']),
('UNKNOWN', SEARCH, [
 'Có người nhắn "thêm A"; tôi đang hỏi nghĩa của câu đó.',
 'Cô ơi chữ "bỏ B" là nghĩa sao vậy cô?',
 'Tui thấy dòng "giữ A", đang kể lại chứ chưa nhờ làm chi.',
 'Bạn giải thích từ "thêm" trong nút bấm được không?',
 'A hay B nhỉ, nhà em chưa thống nhất đâu.',
 'Nếu mai chọn thì tính, giờ tui đang nghĩ thôi nghen.',
 'Great, cứ thêm A đi để tôi phá sản à? Tôi nói mỉa đó.',
 'Mình gõ nháp: "xóa A". Chưa gửi yêu cầu thao tác nhé.',
 '17:45 rồi, A hay B thì vẫn chưa quyết được.',
 'Cái phía bên kia ấy, mà thôi để em hỏi mẹ lại.']),
('UNKNOWN', [], [
 'Dạ cho phép em suy nghĩ thêm một chút ạ.',
 'Con chưa biết nhờ cô làm gì nữa.',
 'Mô tê răng rứa, tui chưa nghĩ ra câu hỏi.',
 'Maybe something later, chưa có yêu cầu đâu bạn.',
 'k biết nữa, để lát ms nhắn tiếp',
 'Tin nhắn nháp ghi "ngân sách 100k", chưa phải cập nhật hồ sơ.',
 'Tôi đang đọc ví dụ "dị ứng tôm", đây không phải thông tin của tôi.']),
]

if __name__ == '__main__':
    seen = {fold(json.loads(line)['text']) for name in
            ('utterances.jsonl','heldout.jsonl','heldout2.jsonl','heldout3.jsonl','heldout4.jsonl')
            for line in (ROOT/'qa/chat'/name).read_text(encoding='utf-8-sig').splitlines() if line.strip()}
    rows = []
    for intent, actions, texts in GROUPS:
        context = bootstrap(actions)  # Public setup only; no target evaluation.
        for text in texts:
            assert fold(text) not in seen, f'Fold duplicate: {text}'
            assert len(text) <= 1000
            seen.add(fold(text))
            rows.append(dict(id=f'H5-{len(rows)+1:03d}',text=text,intent=intent,
                             setup_actions=actions,context=context,synthetic=True))
    assert len(rows) == 105
    (ROOT/'qa/chat/heldout5.jsonl').write_text(
        ''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8')
    print('105 independent synthetic rows; 25 explicit no-change labels; folded duplicates: zero.')
