"""Deterministic, bounded tools over the existing read-only dataset and planner."""
import copy
import secrets
from urllib.parse import urlsplit
from pydantic import ValidationError
from app.chat import tools as local_tools
from app.chat.gazetteer import Gazetteer
from app.chat.planning import plan_selected, routing_for
from app.planner.types import Preferences
from .schemas import TOOL_INPUTS


def safe_source(value):
    try:
        u = urlsplit(value or '')
        if u.scheme in ('http', 'https') and u.hostname and '.' in u.hostname and not u.username and not u.password:
            if u.port in (None, 80, 443) and u.hostname not in ('localhost',) and not u.hostname.replace('.', '').isdigit():
                return value[:2048]
    except ValueError:
        pass
    return None


def minute(value):
    return int(value[:2]) * 60 + int(value[3:]) if value else None


class Tools:
    def __init__(self, state, data, routing, *, quality_weight=1.0):
        self.state, self.data, self.routing = state, data, routing
        self.by_id = {v.id: v for v in data.venues}
        self.gz = Gazetteer(data.venues)
        self.quality_weight = quality_weight
        self.planned_tour = None
        self.calls = 0
        self.authorized_confirmation = False
        if state.dataset_version and state.dataset_version != data.dataset_version:
            state.selection = [x for x in state.selection if x['id'] in self.by_id]
            state.selection_version += 1
            state.results, state.comparison = [], []
            state.invalidate()
        state.dataset_version = data.dataset_version

    def preferences(self):
        p = self.state.profile
        return Preferences(origin=(p.origin.lat, p.origin.lon) if p.origin else None,
            origin_label=p.area, origin_source='place' if p.origin else None,
            start_time_min=minute(p.start_time), duration_min=p.duration_min, party_size=p.party_size,
            budget_vnd=p.budget_vnd, budget_scope=p.budget_scope, interests=tuple(p.tastes),
            exclusions=tuple(p.exclusions), allergies=tuple(p.allergies),
            max_leg_min=p.max_leg_min if p.max_leg_min is not None else 20,
            max_stops=max(1, len(self.state.selection)), mode='strict' if p.allergies else 'explore')

    def restaurant(self, identity, label=None):
        v = self.by_id[identity]
        result = local_tools.venue_view(v)
        result.update(lat=v.lat if v.geo_ok else None, lon=v.lon if v.geo_ok else None,
            source_url=safe_source(v.source_url), source_fetched_at=v.source_fetched_at,
            unknowns=['ingredient_allergy_safety', 'sweetness', 'dish_price', 'current_open_status'],
            locked=any(x['id'] == identity and x['locked'] for x in self.state.selection))
        if result['price'] is None:
            result['unknowns'].append('price')
        if not result['hours']:
            result['unknowns'].append('hours')
        if label:
            result['label'] = label
        return result

    def run(self, name, arguments):
        self.calls += 1
        if self.calls > 6:
            return self.result('tool_error', 'Đã đạt giới hạn thao tác của lượt này; các thay đổi đã xác thực vẫn được giữ.')
        try:
            schema = TOOL_INPUTS.get(name)
            if schema is None:
                return self.result('tool_error', 'Công cụ không được hỗ trợ; chưa thay đổi dữ liệu.')
            args = schema.model_validate(arguments)
            return getattr(self, name)(**args.model_dump())
        except (ValidationError, ValueError, KeyError, TypeError):
            return self.result('tool_error', 'Thông tin thao tác chưa hợp lệ; chưa thay đổi lựa chọn.')
        except TimeoutError:
            return self.result('tool_error', 'Công cụ phản hồi chậm; lựa chọn trước đó vẫn được giữ. Hãy thử lại khi sẵn sàng.')

    @staticmethod
    def result(status, text, question=None, **extra):
        return {'status': status, 'text': text, 'question': question, **extra}

    def search_restaurants(self, dish=None, area=None, max_price_vnd=None):
        area = area or self.state.profile.area
        self.state.pending_search = {'dish': dish, 'area': area, 'max_price_vnd': max_price_vnd} if not area else None
        place = self.gz.resolve(area) if area else None
        if area and place is None:
            self.state.results = []
            return self.result('unknown', 'Dữ liệu địa điểm hiện có chưa xác định được khu vực bạn nêu; chưa thể khẳng định có quán phù hợp quanh đó.')
        centre = (place.lat, place.lon) if place else None
        found = local_tools.search(self.data.venues, centre, dish=dish, prefs=self.preferences(),
            allergies=self.state.profile.allergies, max_price=max_price_vnd, limit=5)
        self.state.results = [v.id for v in found.venues]
        self.state.comparison = []
        if not found.venues:
            return self.result('no_results', 'Chưa tìm thấy quán trong dữ liệu đáp ứng bộ lọc này; có thể đổi món hoặc khu vực, các yêu cầu khác vẫn được giữ.')
        text = f'Có {len(found.venues)} quán trong dữ liệu để bạn xem và so sánh.'
        if place:
            text += f' Khu vực được hiểu là {local_tools.clean_text(place.label, 120)} (xấp xỉ); khoảng cách không phải đường đi thực.'
        if max_price_vnd:
            text += ' Bộ lọc dựa trên khoảng giá quán theo nguồn; chưa chứng minh giá món cụ thể dưới mức bạn nêu.'
        if self.state.profile.tastes:
            text += ' Khẩu vị đã được giữ; dữ liệu chưa chứng minh quán điều chỉnh được độ ngọt/cay.'
        if self.state.profile.allergies:
            text += ' Chưa có quán nào được xác nhận an toàn dị ứng.'
        question = 'Bạn muốn tìm ở khu vực nào tại Hà Nội?' if not area else None
        return self.result('unknown' if max_price_vnd or self.state.profile.allergies else 'ok', text, question,
                           restaurants=[self.restaurant(i, chr(65+n)) for n, i in enumerate(self.state.results)])

    def get_restaurant_details(self, venue_id):
        if venue_id not in self.by_id:
            return self.result('no_results', 'ID quán không có trong dữ liệu hiện tại; chưa thêm hay thay đổi quán.')
        self.state.results = [venue_id]
        return self.result('ok', 'Thông tin chi tiết theo nguồn; giá món, độ ngọt và an toàn dị ứng chưa được xác minh.',
                           restaurant=self.restaurant(venue_id, 'A'))

    def compare_restaurants(self, venue_ids):
        if len(set(venue_ids)) != len(venue_ids) or any(i not in self.by_id for i in venue_ids):
            return self.result('tool_error', 'Hãy chọn từ hai quán có ID hợp lệ trong dữ liệu để so sánh.')
        self.state.comparison = list(venue_ids)
        return self.result('unknown', 'Có thể đối chiếu địa chỉ, khoảng giá quán và giờ theo nguồn; chỗ ngồi, độ ngọt và mức phù hợp người lớn tuổi vẫn chưa rõ.',
                           restaurants=[self.restaurant(i) for i in venue_ids])

    def update_preferences(self, patch):
        # Profile validation is atomic; omission never erases another field.
        changes = copy.deepcopy(patch)
        if changes.get('origin'):
            origin = changes['origin']
            if not self.gz.inside_hanoi(origin['lat'], origin['lon']):
                return self.result('tool_error', 'Điểm xuất phát nằm ngoài vùng Hà Nội thí điểm; chưa cập nhật.')
        changed = self.state.patch(changes)
        return self.result('ok', 'Đã cập nhật thông tin bạn vừa sửa và giữ các yêu cầu còn lại.' if changed else 'Thông tin này đã được giữ, không cần nhập lại.')

    def update_foodtour_selection(self, operation, venue_ids, selection_version):
        if selection_version != self.state.selection_version:
            return self.result('tool_error', 'Danh sách lựa chọn đã thay đổi; hãy tải trạng thái mới trước khi thao tác.', code='selection_conflict')
        if len(set(venue_ids)) != len(venue_ids) or any(i not in self.by_id for i in venue_ids):
            return self.result('tool_error', 'Có ID quán không hợp lệ; chưa thay đổi danh sách.')
        known = set(self.state.results) | set(self.state.comparison) | {x['id'] for x in self.state.selection}
        if any(i not in known for i in venue_ids):
            return self.result('tool_error', 'Hãy tìm hoặc xem quán trước khi thêm; không nhận ID chưa được hiển thị.')
        items = copy.deepcopy(self.state.selection)
        if operation == 'add':
            for identity in venue_ids:
                if not any(x['id'] == identity for x in items):
                    items.append({'id': identity, 'locked': False})
            if len(items) > 5:
                return self.result('tool_error', 'Danh sách thí điểm tối đa năm quán; chưa thêm vượt giới hạn.')
        else:
            if any(not any(x['id'] == identity for x in items) for identity in venue_ids):
                return self.result('tool_error', 'Quán không nằm trong danh sách đã chọn; chưa thay đổi danh sách.')
            if operation == 'remove':
                if any(x['locked'] for x in items if x['id'] in venue_ids):
                    return self.result('tool_error', 'Quán đang khóa; hãy mở khóa trước khi bỏ.')
                items = [x for x in items if x['id'] not in venue_ids]
            else:
                for item in items:
                    if item['id'] in venue_ids:
                        item['locked'] = operation == 'lock'
        if items != self.state.selection:
            self.state.selection = items
            self.state.selection_version += 1
            self.state.invalidate()
        return self.result('ok', {'add': 'Đã thêm quán hợp lệ vào lựa chọn.', 'remove': 'Đã bỏ quán khỏi lựa chọn.',
            'lock': 'Đã khóa quán trong lựa chọn.', 'unlock': 'Đã mở khóa quán trong lựa chọn.'}[operation])

    def create_itinerary(self):
        self.state.plan_requested = True
        p = self.state.profile
        if not self.state.selection:
            return self.result('unknown', 'Bạn có thể tìm, so sánh rồi thêm quán trước; hiện chưa có quán nào được chọn.', 'Bạn muốn khám phá món hoặc khu vực nào?')
        if p.allergies:
            self.state.confirmation = None
            return self.result('unknown', 'Chưa có bằng chứng nguyên liệu để xác nhận các quán an toàn dị ứng. Chế độ dị ứng nghiêm ngặt chưa cho phép tạo lịch; không tự bỏ hay nới ràng buộc.')
        needed = [('origin', p.origin is None, 'Bạn muốn xuất phát ở địa chỉ hoặc mốc nào?'),
                  ('start_time', not p.start_time, 'Bạn muốn bắt đầu lúc mấy giờ?'),
                  ('duration_min', p.duration_min is None and not p.end_time, 'Bạn muốn kết thúc lúc mấy giờ hoặc dành tổng bao lâu?'),
                  ('vehicle', p.vehicle is None, 'Bạn sẽ đi bộ, xe máy hay ô tô?'),
                  ('party_size', p.party_size is None, 'Chuyến đi có bao nhiêu người?'),
                  ('budget_scope', p.budget_vnd is not None and p.budget_scope is None, 'Ngân sách bạn nêu là cho cả nhóm hay mỗi người?')]
        for slot, missing, question in needed:
            if missing:
                self.state.pending_slot = slot
                self.state.confirmation = None
                return self.result('unknown', 'Danh sách quán và các yêu cầu đã biết vẫn được giữ; chỉ cần làm rõ bước tiếp theo.', question)
        self.state.pending_slot = None
        if p.end_time:
            duration = minute(p.end_time) - minute(p.start_time)
            if not 30 <= duration <= 720:
                return self.result('tool_error', 'Khoảng giờ chưa hợp lệ hoặc qua nửa đêm; chưa tạo lịch.')
            if p.duration_min is not None and p.duration_min != duration:
                return self.result('unknown', 'Giờ kết thúc và tổng thời lượng chưa khớp; chưa tạo lịch.', 'Bạn muốn giữ khoảng giờ hay tổng thời lượng vừa nêu?')
            self.state.patch({'duration_min': duration})
            p = self.state.profile
        warnings = ['Khoảng giá quán không phải hóa đơn hoặc giá mỗi người; giờ nguồn ghi không chứng minh đang mở.',
                    'Thời gian tại mỗi quán đề xuất 45 phút; chặng di chuyển ước tính, không phải tuyến đường thực.']
        if p.max_leg_min is None:
            warnings.append('Giới hạn mỗi chặng đề xuất 20 phút, chỉ áp dụng sau xác nhận này.')
        self.state.confirmation = {'id': secrets.token_urlsafe(18), 'profile_version': self.state.profile_version,
            'selection_version': self.state.selection_version,
            'summary': {'profile': p.model_dump(), 'venue_ids': [x['id'] for x in self.state.selection],
                        'names': [self.restaurant(x['id'])['name'] for x in self.state.selection]}, 'warnings': warnings}
        return self.result('ok', 'Đây là bản xác nhận ngắn theo các quán bạn chọn; chưa tạo lịch trình. Hãy kiểm tra cảnh báo trước khi xác nhận.')

    def revise_itinerary(self):
        self.state.invalidate()
        return self.create_itinerary()

    def confirm(self, identity):
        c = self.state.confirmation
        if not c or not secrets.compare_digest(identity, c.get('id', '')) or c.get('profile_version') != self.state.profile_version or c.get('selection_version') != self.state.selection_version:
            return self.result('tool_error', 'Bản xác nhận đã hết hiệu lực; hãy xem bản mới trước khi tạo lịch.')
        if self.state.profile.allergies:
            return self.result('unknown', 'Thiếu bằng chứng an toàn dị ứng; chưa tạo lịch.')
        self.state.confirmation = None
        prefs = self.preferences()
        tour = plan_selected(self.by_id, [x['id'] for x in self.state.selection], prefs, self.routing,
                             self.state.profile.vehicle, self.quality_weight)
        self.planned_tour = tour
        if tour.status in ('no_solution', 'insufficient_evidence') or not tour.stops:
            self.state.tour_stale = True
            return self.result('no_solution', 'Chưa xếp được lịch đáp ứng mọi quán/ràng buộc. ' + ' '.join(tour.reasons),
                               proposed_changes=list(tour.proposed_changes))
        locks = tuple(x['id'] for x in self.state.selection if x['locked'])
        self.planned_tour = tour.with_locks(locks)
        self.state.tour_stale = False
        self.state.plan_requested = False
        return self.result('ok', 'Planner đã tạo lịch và kiểm tra ràng buộc; giờ/giá/chặng ước tính và các điểm chưa xác minh được ghi rõ trong lịch trình.')
