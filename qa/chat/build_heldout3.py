"""Independent C6b labels; bootstrap public contexts without evaluating targets."""
import json
import logging
from build_heldout2 import ROOT, SEARCH, CONFIRM, bootstrap
from run_scenarios import fold

logging.disable(logging.CRITICAL)
PLANNED = CONFIRM + [{'type':'confirm_yes'}]
GROUPS = [
('SET_AVOID', [], [
 'Kiêng trứng nhé, nhớ lưu lại hộ chị', 'Tui tránh sữa, đừng chọn món có sữa nghen',
 'khong an dau phong dau nha em', 'Không ăn hải sản, ghi vào điều kiện giúp tôi',
 'Đừng cho cua vào món đã chọn nghe bồ', 'Kiêng thịt bò suốt chuyến này nhé',
 'Tránh tôm cho nhà em, rồi tìm quán phở sau', 'ko an sua nhe, luu dum tui']),
('SET_ALLERGY', [], [
 'Cả đoàn có một bạn dị ứng trứng gà đó', 'di ung lac, nho ghi lai nha',
 'Dị ứng tôm 🦐, tìm phở cũng phải nhớ chuyện này', 'Mình bị dị ứng cua nặng lắm ạ',
 'Nhắc lại để bạn lưu: dị ứng sữa bò', 'Bé nhà chị dị ứng đậu phộng nhé',
 'Tui dị ứng hải sản nha bồ ơi', 'di ung tom va sua, dung quen nghe']),
('UPDATE_PROFILE', [], [
 'Tui không thích mùi rau mùi đâu, cập nhật gu giùm', 'Khẩu vị của em: ghét hành sống',
 'Sở thích mới: không thích món quá ngọt', 'Tui thích ít dầu mỡ và ít cay nha',
 'Cập nhật nhóm thành 5 người nha bồ', 'doi ngan sach thanh 420k cho ca nhom',
 'Ngân sách mỗi người là 180 nghìn, cập nhật giúp em', 'Mình muốn đi xe máy thay vì đi bộ nhé']),
('ASK_DETAIL', SEARCH, [
 'A có wifi hông rứa?', 'B có chỗ gửi xe máy không vậy?',
 'Quán đầu tiên có ghế cho trẻ em không?', 'Ở quán thứ hai có nhà vệ sinh chứ?',
 'Cho hỏi A đóng cửa mấy giờ?', 'gio mo cua cua B la may gio a',
 'Quán A có điều hòa không bồ?', 'Quán B có thanh toán thẻ không?',
 'Tui muốn biết địa chỉ của A trước đã, thêm sau', 'Chỗ A có bàn ngoài trời không ạ?']),
('COMPARE', SEARCH, [
 'So hai quán A B coi bên nào ít tốn tiền hơn', 'Giữa B và A, quán mô đông review hơn?',
 'Đặt A cạnh B, so về tốc độ lên đồ giùm', 'so sanh A B coi ben nao de gui xe hon',
 'So sánh hai chỗ đầu về wifi nha', 'So sánh A với B về khoảng cách đi bộ',
 'A và B khác nhau thế nào về không gian ngồi?', 'So A và B theo giá thôi, thêm quán để sau']),
('MODIFY_PLAN', PLANNED, [
 'Trong tour đang có, đổi điểm đầu sang chỗ khác', 'Tui muốn thay quán thứ nhất của lịch trình',
 'Doi diem cuoi trong tour dum tui', 'Điểm A của tour đổi được hông bồ?',
 'Thay quán đầu trong lịch trình rồi giữ các chỗ còn lại', 'Lịch trình này đổi quán cuối đi nhé']),
('REMOVE', PLANNED, [
 'Quán A bỏ khỏi danh sách giùm mình', 'Bỏ điểm đầu tiên ra khỏi danh sách nha',
 'bo quan thu nhat khoi danh sach di ne', 'Xóa quán cuối khỏi danh sách, tui đổi ý',
 'Trong danh sách, bỏ A rồi hãy nói chuyện tiếp', 'Gỡ quán A khỏi danh sách giúp chị']),
('KEEP', PLANNED, [
 'Quán A giữ nguyên cho tui nghen', 'Giữ điểm đầu tiên lại, đừng đổi nó',
 'giu quan thu nhat trong danh sach nha bo', 'Khóa quán A giúp chị, đã hẹn ở đó',
 'Trong danh sách này, quán cuối giữ lại nhé', 'Điểm A phải giữ nguyên trong tour nha']),
('ADD', SEARCH, [
 'Nhìn hai chỗ thì tui chọn A vào danh sách', 'Quán thứ hai thêm vô danh sách giúp chị',
 'Lấy quán cuối cùng vào danh sách nha bồ', 'them quan dau vao danh sach nha ban iu',
 'A đó, thêm vô cho tui đã rồi tìm tiếp', 'Thêm B vào danh sách, so sánh để sau']),
('SEARCH_VENUES', SEARCH[:1], [
 'Tìm giúp quán bánh mì quanh chỗ này nghen', 'kiem quan bun cha gan tui nha bo oi',
 'Muốn xem quán bún đậu ở Hoàn Kiếm, chớ chưa lập tour', 'Tìm địa điểm bán bánh cuốn quanh Hồ Gươm',
 'Cho tui danh sách quán phở ở đây với nhen', 'Tìm quán cà phê quanh phố cổ nha ☕']),
('DISCOVER_DISH', [], [
 'Gợi ý món cho bữa khuya giúp chị với', 'Nên ăn món gì ở Hà Nội lần đầu đến?',
 'Tui chưa có ý tưởng, gợi ý món gì ngon đi bồ', 'goi y mon an ha noi cho khach moi nha',
 'Gợi ý món Hà Nội rồi hẵng tìm quán sau', 'Bữa sáng nên ăn gì rứa?']),
('AMBIGUOUS_ACK', [], ['👍🍜✨', '🦀🥛🙃', '🙂🙂🙂', '👌✅', 'ừ ha để coi sao nghen', 'okela tui ngẫm tiếp đã']),
('CONFIRM_NO', CONFIRM, [
 'Từ từ, chưa xác nhận tạo lịch trình đâu', 'Đừng tạo tour lúc này, tui còn suy nghĩ',
 'khong dong y tao lich trinh nha bo', 'Khoan nha, đừng tạo lịch trình vội']),
('CONFIRM_YES', CONFIRM, [
 'Đồng ý bản tóm tắt này, tạo lịch trình nhé', 'Xác nhận phần trên rồi, tạo tour giúp chị',
 'dong y tao tour theo tom tat do nha', 'Chốt tạo lịch trình theo thông tin vừa xem ✅']),
('ANSWER_PENDING', [{'type':'search','query':'bún chả'}], [
 'Hoàn Kiếm đó bồ, tui đang đứng gần hồ', 'Quận Cầu Giấy nhé chị ơi',
 'ba dinh nha, tim o do giup minh', 'Tui ở Đống Đa, tìm quanh đó nha']),
('ANSWER_PENDING', [{'say':'620k'}], [
 'Tổng cho cả nhóm nha, không phải từng người', 'moi nguoi 620k do bo',
 'Cả nhóm ạ, tiền gom chung đó', 'Mỗi người nhé chị, chia riêng từng phần']),
('REQUEST_PLAN', CONFIRM[:-1], [
 'Tạo tour từ những chỗ trong danh sách này cho chị', 'Lập lịch trình ăn uống theo các quán đã chọn nhé',
 'tao lich trinh tu danh sach nay nha bo oi',
 'Lập lịch trình giúp tui với ' + 'tui muốn xem kỹ trước khi đi vì cả nhà còn cân nhắc nhiều thứ '.strip() * 22 + ' nhớ cho xem tóm tắt trước nhé']),
]

if __name__ == '__main__':
    seen = {fold(json.loads(line)['text']) for name in ('utterances.jsonl','heldout.jsonl','heldout2.jsonl')
            for line in (ROOT/'qa/chat'/name).read_text(encoding='utf-8-sig').splitlines() if line.strip()}
    rows = []
    for intent, actions, texts in GROUPS:
        context = bootstrap(actions)
        for text in texts:
            assert fold(text) not in seen, 'Duplicate annotation'
            seen.add(fold(text))
            rows.append({'id':f'H3-{len(rows)+1:03d}', 'text':text, 'intent':intent,
                         'setup_actions':actions, 'context':context, 'synthetic':True})
    assert len(rows) >= 100
    (ROOT/'qa/chat/heldout3.jsonl').write_text(''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in rows),encoding='utf-8')
    print(f'Frozen {len(rows)} independent primary labels; target utterances NOT evaluated.')
