"""C6c independent labels: do not import/read classifier rules or evaluate targets.

Personas: older accentless typist, teen, bilingual tourist, dictation, formal.
The final twenty rows deliberately lack enough commitment/reference for action.
"""
import json
import logging
from build_heldout2 import ROOT, SEARCH, CONFIRM, bootstrap
from run_scenarios import fold

logging.disable(logging.CRITICAL)
PLANNED = CONFIRM + [{'type': 'confirm_yes'}]
GROUPS = [
('ASK_DETAIL', SEARCH, [
 'bac hoi quan A co cho ngoi trong nha khong chau',
 'B có wifi free cho em ngồi làm bài hông zạ',
 'May I ask giờ đóng cửa của A ạ?',
 'cho tôi hỏi chút quán đầu ấy nhà đi cùng trẻ nhỏ thì có ghế trẻ em không',
 'Xin cung cấp địa chỉ cụ thể của quán B để tôi tham khảo.',
 'A cho gửi xe ở đâu vậy ní, hỏi trước khi chọn nha',
 'Quán B nhận payment bằng thẻ hay tiền mặt?',
 'Thưa bạn, thông tin giá của A là giá món hay khoảng giá quán?']),
('SEARCH_VENUES', SEARCH[:1], [
 'chau tim cho bac quan pho gan ho voi',
 'Săn quán bún chả phố cổ cho tụi em điii',
 'Find giúp mình quán bánh mì near Hồ Gươm please',
 'tôi đang đói đây tìm quán bánh cuốn quanh chỗ tôi đứng với nhé',
 'Kính nhờ bạn tìm một số quán bún đậu tại Hoàn Kiếm.',
 'Cho em xem các quán cà phê quanh hồ nha bestie']),
('COMPARE', SEARCH, [
 'bac muon so sanh A voi B ve gia truoc khi chon',
 'So kèo A B về review coi ní ơi',
 'Compare A với B về walking distance please',
 'tôi thấy hai quán rồi giờ so sánh giúp giá cả và thời gian lên món nhé',
 'Vui lòng đối chiếu A và B về chỗ đỗ xe.',
 'Chưa thêm đâu, so sánh A với B về wifi đã nhé']),
('ADD', SEARCH, [
 'chau them quan B vao danh sach cho bac nhe',
 'Chốt thêm A vô list nha ní ơi',
 'Please add quán thứ hai vào danh sách của mình',
 'tôi xem xong rồi lấy quán đầu tiên thêm vào danh sách đi nhé',
 'Đề nghị thêm quán A vào danh sách lựa chọn.',
 'Khỏi so sánh nữa, thêm B vào danh sách giúp em']),
('UPDATE_PROFILE', [], [
 'bac di 6 nguoi ca nha chau ghi lai nhe',
 'Budget đổi thành 750k cả nhóm nha bro',
 'Our group có 3 người, update giúp mình nhé',
 'tôi nói lại nhé xuất phát lúc 11h và đi bộ trong 180 phút',
 'Xin cập nhật ngân sách thành 250 nghìn mỗi người.',
 'Khẩu vị em là không thích rau mùi, lưu sở thích đó nha']),
('SET_AVOID', [], [
 'bac kieng sua chau ghi vao dieu kien an uong nhe',
 'Né tôm trong mọi món giúp em với ní',
 'Please tránh đậu phộng trong món ăn của mình nhé',
 'ghi giúp tôi là kiêng trứng trong cả chuyến này nhé',
 'Vui lòng không chọn món có thịt bò cho đoàn.',
 'Em tránh cua, lưu điều kiện này rồi hãy tìm đồ ăn']),
('SET_ALLERGY', [], [
 'bac bi di ung tom chau luu lai giup bac',
 'Dị ứng sữa nha bro nhớ giùm em đó',
 'I have dị ứng đậu phộng, please ghi lại',
 'tôi nhắc thêm là con tôi bị dị ứng trứng nhé đừng quên',
 'Xin ghi nhận tôi có dị ứng cua.',
 'Nhà em có người dị ứng hải sản, lưu vào hồ sơ nha']),
('MODIFY_PLAN', PLANNED, [
 'chau doi diem dau cua tour sang quan khac cho bac',
 'Đổi quán đầu trong tour này đi ní, còn lại để y vậy',
 'Please replace quán đầu tiên trong lịch trình hiện tại',
 'tôi muốn thay điểm cuối của tour bằng một chỗ khác nhé',
 'Xin thay thế quán thứ nhất trong lịch trình đã tạo.',
 'Tour có rồi, giờ thay quán đầu chứ vẫn muốn đi tiếp nha']),
('REMOVE', PLANNED, [
 'chau xoa A ra khoi danh sach cho bac nhe',
 'Gỡ quán đầu khỏi list đi ní, em bỏ chỗ đó',
 'Please remove quán cuối khỏi danh sách của mình',
 'tôi không lấy quán đầu nữa xóa nó khỏi danh sách nhé',
 'Đề nghị bỏ quán A khỏi danh sách hiện tại.',
 'Bỏ điểm đầu khỏi danh sách luôn, không cần thay quán khác']),
('KEEP', PLANNED, [
 'chau giu nguyen quan dau cho bac dung doi',
 'Khóa A lại nha bro, em hẹn bạn ở đó rùi',
 'Please keep quán thứ nhất nguyên trong tour nhé',
 'tôi muốn giữ lại quán đầu tiên đừng thay chỗ ấy nhé',
 'Xin khóa quán A trong hành trình hiện tại.',
 'Giữ quán cuối lại giúp em nha, chỗ khác tính sau']),
('OUT_OF_SCOPE', [], [
 'Cháu xem hộ bác thời tiết Đà Lạt ngày mai được không?',
 'Ê tối nay trời mưa ở Hà Nội hả ní?',
 'Can you book a table cho mình ở quán phở không?',
 'tôi hỏi xem ứng dụng có thanh toán hộ hóa đơn được không nhé',
 'Xin hỏi bạn có thể đặt khách sạn tại Hải Phòng không?',
 'Nếu muốn foodtour ở Huế thì bạn hỗ trợ được chứ?']),
('CONFIRM_YES', CONFIRM, [
 'bac dong y ban tom tat nay chau tao tour di',
 'Xác nhận tạo tour theo tóm tắt nha ní ✅',
 'I confirm, tạo lịch trình đúng bản tóm tắt giúp mình',
 'Tôi đã đọc bản tóm tắt và đồng ý lập tour bây giờ.']),
('CONFIRM_NO', CONFIRM, [
 'bac chua dong y tao tour dau chau cho bac nghi da',
 'Khoan tạo tour ní ơi, em chưa chốt đâu',
 'Please đừng tạo lịch trình lúc này, mình chưa đồng ý',
 'Tôi từ chối xác nhận bản tóm tắt này, chưa lập tour.']),
('REQUEST_PLAN', CONFIRM[:-1], [
 'chau lap tour tu danh sach nay cho bac xem voi',
 'Lên lịch trình từ list đã chọn giúp em nha ní',
 'Please tạo tour bằng các quán mình vừa chọn',
 'Xin lập hành trình dựa trên danh sách lựa chọn hiện tại.']),
('DISCOVER_DISH', [], [
 'bac moi ra ha noi chau goi y mon gi de thu nhe',
 'Gợi ý món Hà Nội cho newbie đi ní ơi',
 'What món should I try lần đầu tới Hà Nội?',
 'Tôi chưa chọn món nào, xin gợi ý món ăn địa phương.']),
('AMBIGUOUS_ACK', CONFIRM, [
 'ừm để bác xem lại đã', 'ok tui đang đọc nè ní',
 'Got it, mình còn đang cân nhắc', 'Vâng tôi đã thấy thông tin, xin chờ chút.',
 '👌 để em nghĩ thêm', 'nghe rồi nha, chưa quyết gì hết']),
('UNKNOWN', SEARCH, [
 'chỗ ấy ấy cháu hiểu không', 'cái kia đi hay cái nọ ta',
 'A hoặc B cũng có thể, mình chưa quyết', 'Nếu đổi thì sao nhỉ, tôi chỉ đang nghĩ thôi.',
 'thêm hay bỏ thì cái nào hợp hơn ta', 'Giữ hay đổi quán nào bây giờ nhỉ?',
 'quán đó đó, mà thôi để hỏi lại bạn đã', 'the other one maybe, let me think']),
('UNKNOWN', [], [
 'bác chưa biết nói sao nữa', 'này là sao nhỉ hmm',
 'Maybe later, chưa có yêu cầu cụ thể đâu', 'Xin đợi, tôi còn đang soạn câu hỏi.',
 'hình như thế mà cũng chưa chắc', 'ừ thì cái vụ hôm nọ ấy']),
]

if __name__ == '__main__':
    seen = {fold(json.loads(line)['text']) for name in
            ('utterances.jsonl','heldout.jsonl','heldout2.jsonl','heldout3.jsonl')
            for line in (ROOT/'qa/chat'/name).read_text(encoding='utf-8-sig').splitlines() if line.strip()}
    rows = []
    for intent, actions, texts in GROUPS:
        context = bootstrap(actions)  # Only public setup, never target text.
        for text in texts:
            assert fold(text) not in seen, 'Folded duplicate'
            assert len(text) <= 1000
            seen.add(fold(text))
            rows.append({'id':f'H4-{len(rows)+1:03d}', 'text':text, 'intent':intent,
                         'setup_actions':actions, 'context':context, 'synthetic':True})
    assert len(rows) >= 100
    (ROOT/'qa/chat/heldout4.jsonl').write_text(
        ''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in rows),encoding='utf-8')
    print(f'Frozen {len(rows)} independent labels, including 20 deliberately ambiguous rows; targets not evaluated.')
