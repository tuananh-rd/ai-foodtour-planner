"""Session-local options and explicit local location resolution; no implicit network discovery."""
import copy
import math
import secrets
from datetime import datetime, timezone
from app.planner.relevance import fold_uncached
from app.presentation import plain_text
from app.assistant.conversation import is_health_or_allergy_disclosure
from app.chat.conversation_reply import private_turn
from app.providers.search_safety import public_food_query, public_source_url
from .schemas import SettingsInput, LocationInput


# Retained actual native function + continuation evidence, not inferred from a name.
# Further IDs can be added only after key/API and bounded native compatibility verification.
VERIFIED_MODELS = {
    'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
}


class ChatModels:
    def __init__(self, base):
        self.base = base

    @property
    def default(self):
        identity = getattr(getattr(self.base, 'client', None), 'model', None)
        return identity if identity in VERIFIED_MODELS else None

    def available(self, identity, reserve):
        client = getattr(self.base, 'client', None)
        if identity not in VERIFIED_MODELS:
            return False, 'model_not_verified'
        if not client or not client.configured:
            return False, 'key_unavailable'
        if client.budget.snapshot()['remaining'] <= reserve:
            return False, 'quota'
        return True, None

    def catalog(self, reserve):
        rows = []
        for identity, label in VERIFIED_MODELS.items():
            available, reason = self.available(identity, reserve)
            rows.append({'id': identity, 'label': label, 'available': available,
                         'reason': reason, 'native_tools_verified': True})
        return rows

    def select(self, identity):
        if identity is None:
            return self.base
        if identity not in VERIFIED_MODELS:
            return None
        # Separate model identity; same ledger/limits/transport. Never mutate the global client.
        model = copy.copy(self.base)
        if getattr(model, 'client', None) is None:
            return None
        model.client = copy.copy(model.client)
        model.client.model = identity
        return model


def capabilities(app):
    search = app.web_search
    configured = bool(search and getattr(search, 'configured', False))
    return {'contract': 'discovery-v1', 'default_chat_model': app.chat_models.default,
            'chat_models': app.chat_models.catalog(app.llm_reserve),
            'web_search': {'provider': 'tavily', 'configured': configured, 'available': False,
                           'free_only': True, 'reason': 'free_plan_unverified' if configured else 'unavailable'},
            'location': {'mode': 'local_catalog', 'coordinates_supported': True,
                         'arbitrary_address_geocoding': False}}


def settings_action(state, tools, arguments, app, llm_used):
    supplied = SettingsInput.model_validate(arguments).model_dump(exclude_unset=True)
    identity = supplied.get('chat_model')
    if identity is not None:
        available, reason = app.chat_models.available(identity, app.llm_reserve)
        if not available or llm_used >= app.llm_session_cap:
            return tools.result('unavailable', 'Model này chưa khả dụng hoặc đã đạt giới hạn; lựa chọn hiện tại được giữ.',
                                code=reason or 'session_quota')
        state.chat_model = identity
    if 'web_search_enabled' in supplied:
        state.web_search_enabled = supplied['web_search_enabled']
        state.web = {'enabled': state.web_search_enabled,
                     'status': 'unavailable' if state.web_search_enabled else 'off',
                     'reason': 'not_requested' if state.web_search_enabled else None, 'sources': []}
    return tools.result('ok', 'Đã cập nhật lựa chọn trợ lý cho phiên này; lịch trình và quán đã chọn được giữ.')


def location_action(state, tools, arguments):
    a = LocationInput.model_validate(arguments)
    if a.operation == 'resolve':
        query = fold_uncached(a.query.strip())
        matches = []
        seen = set()
        for table in (tools.gz.landmarks, tools.gz.streets, tools.gz.districts):
            for key, place in table.items():
                if (query not in key and key not in query) or len(query) < 2:
                    continue
                identity = (place.label, place.lat, place.lon)
                if identity in seen:
                    continue
                seen.add(identity)
                matches.append({'id': secrets.token_hex(10), 'label': plain_text(place.label)[:120],
                                'lat': float(place.lat), 'lon': float(place.lon), 'kind': place.kind,
                                'approximate': True})
        state.location = {**state.location, 'status': 'candidates' if matches else 'not_found',
                          'candidates': matches[:5]}
        if matches:
            return tools.result('unknown', 'Đây là các mốc/khu vực có trong danh mục local, tọa độ chỉ xấp xỉ.',
                                'Bạn chọn vị trí nào trong danh sách?')
        return tools.result('unknown', 'Danh mục local chưa xác định được địa chỉ này; chưa đổi vị trí đang chọn.',
                            'Bạn muốn chọn một mốc có trong danh mục hay nhập tọa độ?')
    if a.operation == 'clear':
        state.patch({'origin': None})
        state.location = {'status': 'unset', 'label': None, 'source': None, 'approximate': False, 'candidates': []}
        return tools.result('unknown', 'Đã bỏ vị trí xuất phát; quán đã chọn vẫn được giữ.',
                            'Bạn muốn dùng vị trí hiện tại hay nhập vị trí?')
    if a.operation == 'choose':
        candidate = next((c for c in state.location.get('candidates', []) if c['id'] == a.candidate_id), None)
        if candidate is None:
            return tools.result('tool_error', 'Lựa chọn địa điểm không còn hợp lệ; hãy tìm lại, chưa đổi vị trí.')
        lat, lon, label, source = candidate['lat'], candidate['lon'], candidate['label'], 'local'
    else:
        lat, lon, source = a.lat, a.lon, a.source
        label = 'Vị trí hiện tại' if source == 'gps' else 'Tọa độ đã nhập'
    if not all(math.isfinite(v) for v in (lat, lon)) or not tools.gz.inside_hanoi(lat, lon):
        return tools.result('tool_error', 'Tọa độ chưa hợp lệ hoặc ngoài vùng Hà Nội thí điểm; chưa đổi vị trí.')
    state.patch({'origin': {'lat': lat, 'lon': lon}})
    state.location = {'status': 'chosen', 'label': label, 'source': source,
                      'approximate': source == 'local', 'candidates': []}
    tools.refresh_result_order()
    if state.pending_search or state.last_search:
        pending = copy.deepcopy(state.pending_search or state.last_search)
        return tools.run('search_restaurants', pending)
    return tools.result('ok', 'Đã chọn vị trí xuất phát. Khoảng cách đường chim bay đã cập nhật; tour cũ cần xác nhận lại.')


def refresh_web(state, text, search):
    """Only explicit opt-in public food/area requests. Never GPS, health, history or full state."""
    state.web = {'enabled': state.web_search_enabled, 'status': 'off', 'reason': None, 'sources': []}
    if not state.web_search_enabled:
        return
    if private_turn(text) or is_health_or_allergy_disclosure(text) or public_food_query(text) is None:
        state.web.update(status='blocked', reason='private_or_nonpublic_query')
        return
    if not search or not getattr(search, 'configured', False):
        state.web.update(status='unavailable', reason='provider_unavailable')
        return
    # The restored provider verifies free account/PAYGO/key limits before POST and
    # retains its original persistent ledger/null-limit fail-closed fuse.
    try:
        result = search.search(public_food_query(text), deadline_s=6.0)
    except Exception:
        state.web.update(status='unavailable', reason='provider_error')
        return
    if not isinstance(result, dict):
        state.web.update(status='unavailable', reason='bad_response')
        return
    status = result.get('status')
    if status != 'ok':
        state.web.update(status='quota' if status == 'quota' else 'unavailable', reason=str(status)[:40])
        return
    from app.providers.tavily import _is_source_unsafe
    timestamp = result.get('fetched_at')
    try:
        if not isinstance(timestamp, str) or len(timestamp) > 40 or datetime.fromisoformat(timestamp.replace('Z', '+00:00')).tzinfo is None:
            raise ValueError('invalid source timestamp')
    except (ValueError, TypeError):
        timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    sources = []
    items = result.get('sources')
    if not isinstance(items, list):
        state.web.update(status='unavailable', reason='bad_response')
        return
    for item in items[:3]:
        if not isinstance(item, dict):
            continue
        title, snippet, url = item.get('title', ''), item.get('snippet', ''), item.get('url')
        if (not isinstance(title, str) or not isinstance(snippet, str) or not public_source_url(url)
                or _is_source_unsafe(title, snippet)):
            continue
        sources.append({'title': plain_text(title)[:160], 'url': url, 'snippet': plain_text(snippet)[:400],
                        'retrieved_at': timestamp, 'untrusted': True})
    state.web.update(status='ok' if sources else 'no_results', sources=sources)
