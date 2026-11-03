"""Auth/CAS before tools; never hold the session-store lock during model transport."""
import copy
import time
from dataclasses import replace
from fastapi import APIRouter, Header, Request
from .schemas import Turn, AssistantView
from .state import State
from .tools import Tools, routing_for
from .engine import handle
from app.presentation import plain_text
from .experience import capabilities, settings_action, location_action, refresh_web

router = APIRouter()


@router.get('/v1/sessions/{session_id}/venues/{venue_id}/menu')
def venue_menu(session_id: str, venue_id: str, request: Request,
               offset: int = 0, limit: int = 25, q: str = '', group: str | None = None,
               dish_id: str | None = None, option_offset: int = 0, option_limit: int = 100,
               x_session_token: str | None = Header(default=None)):
    from app.api.errors import APIError
    from app.data.menu_catalog import catalog
    import os
    if not (0<=offset<=20000 and 1<=limit<=50 and len(q)<=160 and
            0<=option_offset<=200000 and 1<=option_limit<=500 and
            all(x is None or len(x)<=200 for x in (group,dish_id))):
        raise APIError(422,'validation_error','Phân trang thực đơn không hợp lệ.')
    session=request.app.state.sessions.read_owned(session_id,x_session_token)
    state=State.from_session(session)
    visible=set(state.results)|set(state.comparison)|{r['id'] for r in state.selection}
    if venue_id not in visible:
        raise APIError(403,'venue_not_visible','Hãy tìm hoặc chọn quán trước khi xem thực đơn.')
    data=request.app.state.venues.snapshot()
    if venue_id not in {v.id for v in data.venues}:
        raise APIError(409,'venue_stale','Quán không còn trong dữ liệu hiện tại; hãy tìm lại.')
    path=os.getenv('FOODTOUR_MENU_PATH','').strip()
    if not path:
        return {'status':'unavailable','venue_id':venue_id,'dataset_version':data.dataset_version,
            'menu_version':None,'source_channel':None,'total_menu':0,'total':0,'offset':offset,
            'limit':limit,'has_more':False,'groups':[],'items':[]}
    result=catalog(path,venue_id,offset=offset,limit=limit,q=q,group=group,dish_id=dish_id,
                   option_offset=option_offset,option_limit=option_limit)
    return {**result,'dataset_version':data.dataset_version}


@router.get('/v1/assistant/capabilities')
def assistant_capabilities(request: Request):
    return capabilities(request.app.state)


def context(session, request):
    from app.api.routes import snapshot
    data = snapshot(request)
    state = State.from_session(session)
    tools = Tools(state, data, request.app.state.routing, quality_weight=request.app.state.quality_weight)
    return state, tools, data


def view(identity, session, state, tools, data, request, result=None, provider=None, elapsed_ms=0):
    from app.api.routes import render_tour
    result = result or {'status': 'ok', 'text': '', 'question': None}
    if provider is None and state.last_provider_failure:
        provider = {'mode': 'rules', 'calls': 0, 'reply_source': 'rules',
                    'reason': state.last_provider_failure['kind'] + '_rules_fallback',
                    'failure': state.last_provider_failure}
    tour = None
    if session.tour is not None and not state.tour_stale:
        tour = render_tour(session.tour, data, session.tour_preferences or session.preferences, session.revision,
                           routing_for(session.tour_vehicle, request.app.state.routing), None)
        if hasattr(tour, 'model_dump'):
            tour = tour.model_dump()
    return {'contract': 'discovery-v1', 'session_id': identity, 'revision': session.revision,
            'profile_version': state.profile_version, 'selection_version': state.selection_version,
            'profile': state.profile.model_dump(), 'status': result['status'],
            'reply': {'text': plain_text(result['text']),
                      'question': plain_text(result['question']) if result.get('question') else None},
            'results': [tools.restaurant(i, chr(65+n)) for n, i in enumerate(state.results) if i in tools.by_id],
            'selection': [tools.restaurant(x['id']) for x in state.selection if x['id'] in tools.by_id],
            'comparison': {'venues': [tools.restaurant(i) for i in state.comparison if i in tools.by_id],
                'criteria': ['address', 'price', 'hours'], 'unknowns': ['sweetness', 'ingredient_allergy_safety', 'elderly_access']} if state.comparison else None,
            'confirmation': state.confirmation,
            'messages': [{**m, 'text': plain_text(m['text'])} if m['role'] == 'assistant' else m
                         for m in state.messages], 'tour': tour,
            'source': {'dataset_source': 'synthetic' if data.dataset_source == 'synthetic' else 'private', 'dataset_version': data.dataset_version},
            'provider': provider or {'mode': getattr(request.app.state.discovery_model, 'mode', 'gemini') if request.app.state.discovery_model.configured else 'rules', 'calls': 0},
            'settings': {'chat_model': state.chat_model or request.app.state.chat_models.default,
                         'web_search_enabled': state.web_search_enabled,
                         'remaining_session_calls': max(0, request.app.state.llm_session_cap - session.chat.llm_used)},
            'location': state.location,
            'web': state.web,
            'diagnostics': {'tool_calls': tools.calls, 'elapsed_ms': round(elapsed_ms, 2), 'weather': 'unavailable'}}


@router.get('/v1/sessions/{session_id}/assistant', response_model=AssistantView, response_model_exclude_unset=True)
def read(session_id: str, request: Request, x_session_token: str | None = Header(default=None)):
    with request.app.state.sessions.owned(session_id, x_session_token) as session:
        state, tools, data = context(session, request)
        if state.tour_stale:
            session.tour = None
        session.chat.discovery = state.dump()
        return view(session_id, session, state, tools, data, request)


@router.post('/v1/sessions/{session_id}/assistant', response_model=AssistantView, response_model_exclude_unset=True)
def turn(session_id: str, body: Turn, request: Request, x_session_token: str | None = Header(default=None)):
    store, model = request.app.state.sessions, request.app.state.discovery_model
    started = time.monotonic()
    with store.owned(session_id, x_session_token) as persisted:
        store.check_revision(persisted, body.revision)
        stored_state = State.from_session(persisted)
        model = (request.app.state.chat_models.select(stored_state.chat_model) if stored_state.chat_model
                 else request.app.state.discovery_model)
        old_used = persisted.chat.llm_used
        reserve = min(2, max(0, request.app.state.llm_session_cap - old_used)) if body.text and model and model.configured else 0
        persisted.chat.llm_used += reserve  # conservative atomic session-call reservation
        session = copy.deepcopy(persisted)
    state, tools, data = context(session, request)
    try:
        if body.action:
            a = body.action
            if a.type == 'settings':
                result = settings_action(state, tools, a.arguments, request.app.state, old_used)
            elif a.type == 'location':
                result = location_action(state, tools, a.arguments, request.app.state.reverse_address)
            else:
                result = tools.confirm(a.confirmation_id) if a.type == 'confirm' else tools.run(a.name, a.arguments)
            provider = {'mode': 'rules', 'calls': 0, 'reason': result.get('code')}
        else:
            state.remember('user', body.text)
            refresh_web(state, body.text, request.app.state.web_search)
            result, provider = handle(body.text, tools, model=model, llm_used=old_used,
                session_cap=old_used + reserve if model and model.configured else request.app.state.llm_session_cap,
                reserve=request.app.state.llm_reserve)
            provider['model'] = getattr(getattr(model, 'client', None), 'model', None) if provider['mode'] in ('gemini','apithat') else None
        if result.get('proposed_changes'):
            result['text'] += ' Có thể cân nhắc: ' + '; '.join(result['proposed_changes'])
        if not result.get('text'):
            result = tools.result('tool_error', 'Chưa hoàn tất thao tác; lựa chọn đã xác thực trước đó vẫn được giữ.')
    except Exception:
        result, provider = tools.result('tool_error', 'Công cụ gặp lỗi; chưa xác nhận thao tác thành công. Hãy thử lại sau.'), {'mode': 'rules', 'calls': 0, 'reason': 'tool_error'}
    if body.text:
        if provider.get('failure'):
            state.last_provider_failure = copy.deepcopy(provider['failure'])
        elif provider.get('mode') in ('gemini','apithat') and provider.get('calls', 0) > 0:
            state.last_provider_failure = None  # a real response, not a local action, clears outage state
    state.remember('assistant', result['text'] + (' ' + result['question'] if result.get('question') else ''))
    if body.text and provider.get('reply_source') == 'model':
        from app.chat.conversation_reply import private_turn
        from app.assistant.conversation import is_health_or_allergy_disclosure
        if (not private_turn(body.text) and not is_health_or_allergy_disclosure(body.text)
                and not private_turn(result['text']) and not is_health_or_allergy_disclosure(result['text'])):
            state.public_dialogue = (state.public_dialogue + [
                {'role': 'user', 'text': body.text[:700]},
                {'role': 'assistant', 'text': result['text'][:700]}])[-6:]
    with store.owned(session_id, x_session_token) as current:
        store.check_revision(current, body.revision)  # no replay against a concurrently changed version
        # Refund only unused reservation after a successful CAS. Failed/concurrent
        # turns retain conservative admission so a reset or race cannot refund use.
        current.chat.llm_used = max(old_used, current.chat.llm_used - max(0, reserve - provider['calls']))
        current.chat.discovery = state.dump()
        current.preferences = tools.preferences()
        if state.tour_stale:
            current.tour, current.snapshot = None, None
        if tools.planned_tour is not None:
            current.tour, current.snapshot = tools.planned_tour, data
            # Match plan_selected's validation context: explicitly chosen venues
            # replace discovery taste ranking, never allergy/exclusion/budget gates.
            current.tour_preferences = replace(tools.preferences(), interests=())
            current.tour_vehicle = state.profile.vehicle
            current.tour_selected_ids = tuple(x['id'] for x in state.selection)
        current.revision += 1
        request.scope['foodtour_pipeline'] = {'contract': 'discovery-v1', 'provider_attempted': provider['calls'], 'tool_calls': tools.calls}
        failure = provider.get('failure') or {}
        request.scope['foodtour_pipeline'].update(
            reply_source=provider.get('reply_source'), provider_failure_kind=failure.get('kind'),
            provider_failure_source=failure.get('source'), provider_http_status=failure.get('http_status'))
        return view(session_id, current, state, tools, data, request, result, provider, (time.monotonic()-started)*1000)
