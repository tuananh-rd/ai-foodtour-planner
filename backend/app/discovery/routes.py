"""Auth/CAS before tools; never hold the session-store lock during model transport."""
import copy
import time
from dataclasses import replace
from fastapi import APIRouter, Header, Request
from .schemas import Turn, AssistantView
from .state import State
from .tools import Tools, routing_for
from .engine import handle

router = APIRouter()


def context(session, request):
    from app.api.routes import snapshot
    data = snapshot(request)
    state = State.from_session(session)
    tools = Tools(state, data, request.app.state.routing, quality_weight=request.app.state.quality_weight)
    return state, tools, data


def view(identity, session, state, tools, data, request, result=None, provider=None, elapsed_ms=0):
    from app.api.routes import render_tour
    result = result or {'status': 'ok', 'text': '', 'question': None}
    tour = None
    if session.tour is not None and not state.tour_stale:
        tour = render_tour(session.tour, data, session.tour_preferences or session.preferences, session.revision,
                           routing_for(session.tour_vehicle, request.app.state.routing), None)
        if hasattr(tour, 'model_dump'):
            tour = tour.model_dump()
    return {'contract': 'discovery-v1', 'session_id': identity, 'revision': session.revision,
            'profile_version': state.profile_version, 'selection_version': state.selection_version,
            'profile': state.profile.model_dump(), 'status': result['status'],
            'reply': {'text': result['text'], 'question': result.get('question')},
            'results': [tools.restaurant(i, chr(65+n)) for n, i in enumerate(state.results) if i in tools.by_id],
            'selection': [tools.restaurant(x['id']) for x in state.selection if x['id'] in tools.by_id],
            'comparison': {'venues': [tools.restaurant(i) for i in state.comparison if i in tools.by_id],
                'criteria': ['address', 'price', 'hours'], 'unknowns': ['sweetness', 'ingredient_allergy_safety', 'elderly_access']} if state.comparison else None,
            'confirmation': state.confirmation, 'messages': state.messages, 'tour': tour,
            'source': {'dataset_source': 'synthetic' if data.dataset_source == 'synthetic' else 'private', 'dataset_version': data.dataset_version},
            'provider': provider or {'mode': getattr(request.app.state.discovery_model, 'mode', 'gemini') if request.app.state.discovery_model.configured else 'rules', 'calls': 0},
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
        old_used = persisted.chat.llm_used
        reserve = min(2, max(0, request.app.state.llm_session_cap - old_used)) if body.text and model.configured else 0
        persisted.chat.llm_used += reserve  # conservative atomic session-call reservation
        session = copy.deepcopy(persisted)
    state, tools, data = context(session, request)
    try:
        if body.action:
            a = body.action
            result = tools.confirm(a.confirmation_id) if a.type == 'confirm' else tools.run(a.name, a.arguments)
            provider = {'mode': 'rules', 'calls': 0}
        else:
            state.remember('user', body.text)
            result, provider = handle(body.text, tools, model=model, llm_used=old_used,
                session_cap=old_used + reserve if model.configured else request.app.state.llm_session_cap,
                reserve=request.app.state.llm_reserve)
        if result.get('proposed_changes'):
            result['text'] += ' Có thể cân nhắc: ' + '; '.join(result['proposed_changes'])
        if not result.get('text'):
            result = tools.result('tool_error', 'Chưa hoàn tất thao tác; lựa chọn đã xác thực trước đó vẫn được giữ.')
    except Exception:
        result, provider = tools.result('tool_error', 'Công cụ gặp lỗi; chưa xác nhận thao tác thành công. Hãy thử lại sau.'), {'mode': 'rules', 'calls': 0, 'reason': 'tool_error'}
    state.remember('assistant', result['text'] + (' ' + result['question'] if result.get('question') else ''))
    with store.owned(session_id, x_session_token) as current:
        store.check_revision(current, body.revision)  # no replay against a concurrently changed version
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
        return view(session_id, current, state, tools, data, request, result, provider, (time.monotonic()-started)*1000)
