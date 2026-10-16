"""C6e blind annotations: never run target text while authoring contexts."""
import json
import logging
from build_heldout2 import ROOT, SEARCH, CONFIRM, PROFILE, bootstrap
from run_scenarios import fold

logging.disable(logging.CRITICAL)
READY = CONFIRM[:-1]
PLANNED = CONFIRM + [{'type':'confirm_yes'}]
# Explicit permitted protected effects are authored with labels before evaluation.
GROUPS = [
('ADD', SEARCH, ['add'], [
 'A thôi', 'B nhé bạn', 'Lấy A cho mình', 'Chọn đúng B nha',
 'Thêm mỗi A, B để sau', 'Cho B vào list ăn thử', 'Mình lấy quán đầu nhé',
 'A vào danh sách, rồi tìm thêm chè', 'Chốt quán B, giá chưa rõ cũng được',
 'Cho mình thêm A và xem thông tin B']),
('SEARCH_VENUES', SEARCH[:1], [], [
 'Bún riêu', 'Bánh tôm', 'Chả cá', 'Cà phê trứng', 'Xôi xéo',
 'Bún ốc quanh đây', 'Bánh đúc nóng gần mình', 'Tìm phở rồi cho xem giá tham khảo',
 'Có chỗ ăn nem cua bể gần đây chứ?', 'Tìm chè, chưa thêm vào danh sách nha']),
('ANSWER_PENDING', [{'type':'search','query':'bún'}], ['profile:area'], [
 'Phố cổ thôi nha', 'Ở Hoàn Kiếm ấy', 'Đống Đa bạn ạ', 'Ba Đình thôi',
 'Quanh Hồ Gươm nhé bạn', 'Chọn khu Cầu Giấy', 'À nhầm, phố cổ',
 'Không phải, phố cổ', 'Mình muốn tìm ở Tây Hồ', 'Long Biên nha bạn']),
('UPDATE_PROFILE', SEARCH[:1], ['profile:area'], [
 'Hoàn Kiếm', 'Phố cổ', 'Ba Đình', 'Đống Đa', 'Tây Hồ',
 'Đổi khu sang Cầu Giấy nhé', 'Chuyển qua Long Biên giúp mình',
 'Không phải Hoàn Kiếm, mình chọn Ba Đình', 'À nhầm địa điểm, Đống Đa cơ',
 'Khu vực là Hoàn Kiếm, giữ các lựa chọn khác']),
('UPDATE_PROFILE', READY, ['profile:party_size','plan'], [
 'À nhầm, 4 người', 'Không phải hai, đoàn có 6 người', '3 người thôi bạn',
 'Sửa số người thành 5', 'Giờ chỉ còn 2 người đi', 'Nhóm tăng lên 7 người',
 '4 người lớn nhé', 'Đi 8 người, chưa lập tour vội',
 'Chốt số người là 3, giữ ngân sách', 'À còn mình nữa, tổng 5 người nhé']),
('UPDATE_PROFILE', READY, ['profile:budget','plan'], [
 'Rẻ hơn', 'Giảm tiền xuống 350k cả nhóm', 'Đổi ngân sách mỗi người 180k',
 'Tổng nhóm tối đa 720000 đồng', 'À nhầm tiền, 650k cả đoàn',
 'Giữ 2 người, tiền cả nhóm đổi 480k', 'Tăng lên 900k cho cả nhóm nhé',
 'Ngân sách 220 nghìn một người', 'Mỗi người 160000 VND thôi',
 'Khoản ăn uống cả nhóm là 580k']),
('UPDATE_PROFILE', READY, ['profile:start_time','plan'], [
 '18:45', 'Bắt đầu 09:15 nhé', 'À nhầm, xuất phát lúc 17h20',
 'Đổi giờ sang 11:30', '19h05 bắt đầu nha']),
('UPDATE_PROFILE', READY, ['profile:duration_min','plan'], [
 'Chỉ có 90 phút', 'Thời lượng đổi 150 phút nha', 'Đi trong 2 tiếng thôi',
 'Rút xuống 75 phút nhé', 'Cho lịch kéo dài 180 phút']),
('ANSWER_PENDING', [{'say':'Ngân sách 735k'}], ['profile:budget'], [
 'Tính chung cả đoàn', 'Đó là tiền mỗi người', 'Tổng cho cả nhóm đó',
 '735k cho một người', 'Phần ngân sách tính theo nhóm']),
('REMOVE', READY, ['remove','plan'], [
 'Bỏ B đi nhé', 'Xóa quán đã chọn ra', 'Bỏ quán thứ nhất, giữ nguyên hồ sơ',
 'Thôi không ăn ở B, gỡ khỏi list', 'Gỡ B rồi tìm bánh cuốn giúp mình']),
('KEEP', READY, ['keep'], [
 'Giữ đúng B nhé', 'Khóa B lại giúp mình', 'Quán đã chọn phải giữ nguyên',
 'Đừng thay B trong tour nha', 'Giữ quán đầu, còn giờ có thể đổi']),
('SET_ALLERGY', [], ['allergy'], [
 'Mình dị ứng hạt điều', 'Nhớ là em dị ứng cá nhé', 'Bé đi cùng bị dị ứng sữa bò',
 'Nhóm có người dị ứng tôm, nhớ giúp', 'Dị ứng cua và trứng nha bạn']),
('SET_AVOID', [], ['profile:avoid'], [
 'Mình kiêng hành tây', 'Ghi lại là kiêng thịt lợn', 'Kiêng đậu phộng nhé bạn',
 'Nhớ điều kiện kiêng sữa bò', 'Tụi mình kiêng cua']),
('REQUEST_PLAN', READY, [], [
 'Lên tour các quán trong list nhé', 'Cho xem bản tóm tắt để tạo tour',
 'Lập hành trình từ quán vừa chọn', 'Mình chọn xong, lên lịch giúp',
 'Tạo tour đi bộ từ danh sách hiện tại nhé']),
('CONFIRM_YES', CONFIRM, ['plan'], [
 'Tôi xác nhận, lập tour theo tóm tắt này', 'Đồng ý bản tóm tắt, tạo luôn nhé',
 'Chốt các điều kiện trên và tạo lịch trình', 'Xác nhận lập tour như vừa nêu',
 'Đúng hết rồi, tôi đồng ý tạo tour']),
('MODIFY_PLAN', PLANNED, ['add','remove','plan'], [
 'Đổi điểm đầu sang quán khác nhé', 'Thay quán B trong tour vừa tạo',
 'Muốn đổi quán đầu, phần còn lại giữ nguyên', 'Đổi một điểm đầu tour giúp mình',
 'Thay điểm dừng thứ nhất của lịch trình']),
('UNKNOWN', SEARCH, [], [
 'Cái kia', 'Chỗ đó ấy', 'Quán nào nhỉ', 'A hay B ta', 'Để hỏi bạn đi cùng đã',
 'Mình chưa chọn được đâu', 'Chưa quyết quán nào nha',
 'A thôi à, còn B thì sao nhỉ?', 'Mình đang phân vân hai chỗ', 'Lát nữa mình chọn nhé']),
('AMBIGUOUS_ACK', CONFIRM, [], [
 'Đã thấy tóm tắt', 'Để mình đọc kỹ lại', 'Nhận được rồi, chờ mình nhé',
 'Ừ, mình đang xem các điều kiện', 'Cho mình một phút suy nghĩ']),
('ASK_DETAIL', SEARCH, [], [
 'A bán món gì vậy bạn?', 'B có chỗ ngồi trong nhà chứ?', 'A giá khoảng bao nhiêu tiền?',
 'Quán B có giờ mở cửa không?', 'A có biết thành phần món ăn không?']),
('COMPARE', SEARCH, [], [
 'A hay B rẻ hơn vậy?', 'Hai quán A B bên nào gần mình hơn?',
 'So A với B về điểm đánh giá', 'A và B khác nhau mức giá thế nào?',
 'Quán đầu với quán sau chỗ nào lên đồ nhanh hơn?']),
]

if __name__ == '__main__':
    seen = {fold(json.loads(line)['text']) for name in
            ('utterances.jsonl','heldout.jsonl','heldout2.jsonl','heldout3.jsonl','heldout4.jsonl','heldout5.jsonl')
            for line in (ROOT/'qa/chat'/name).read_text(encoding='utf-8-sig').splitlines() if line.strip()}
    rows = []
    for intent, actions, allowed, texts in GROUPS:
        context = bootstrap(actions)
        for text in texts:
            assert fold(text) not in seen, f'Fold duplicate: {text}'
            seen.add(fold(text))
            rows.append(dict(id=f'H6-{len(rows)+1:03d}',text=text,intent=intent,
                             setup_actions=actions,context=context,synthetic=True,allowed_effects=allowed))
    assert len(rows)>=120
    (ROOT/'qa/chat/heldout6.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8')
    print(f'{len(rows)} frozen synthetic rows; zero folded duplicates; targets not evaluated.')
