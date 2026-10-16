"""Contract-v1 endpoints. All session mutations are atomic and checked."""
from dataclasses import asdict, replace as domain_replace
import os

from fastapi import APIRouter, Header, Query, Request, Response
from pydantic import ValidationError

from app.api import legacy
from app.api.errors import APIError
from app.api.schemas import (
    ErrorResponse, Health, Hours, LegView, MessageRequest, MessageBudget, PreferencesRequest,
    PreferencesSchema, Price, ReplaceRequest, RevisionRequest, SessionCreated,
    SessionView, StopView, Totals, TourView, VenueView, VenueList, VenueListItem, clock,
    GeocodeRequest, GeocodeResponse, MapVenues, MapVenue, ClientConfig,
)
from app.data import DatasetLoadError
from app.llm.explain import explain
from app.llm.extract import QUESTIONS, UnavailableExtractor
from app.llm.provider import FallbackExtractor, LLMExtractor, RulesFirstExtractor, ProviderError
from app.providers.routing import HttpRouteProvider
from app.providers.walking import WalkingRouteProvider
from app.planner import engine

router = APIRouter(responses={
    code: {"model": ErrorResponse} for code in (401, 403, 404, 405, 409, 410, 413, 422, 429, 500, 503)
})


def snapshot(request):
    try:
        return request.app.state.venues.snapshot()
    except DatasetLoadError:
        raise APIError(503, "provider_unavailable", "Không thể đọc bộ dữ liệu địa điểm.") from None


def budget_snapshot(request):
    try:
        budget = request.app.state.llm_budget
        return budget.snapshot() if budget is not None else None
    except ProviderError:
        raise APIError(503, "provider_unavailable", "Ngân sách AI tạm thời không khả dụng.") from None


def price(v):
    return Price(min_vnd=v.price_min_vnd, max_vnd=v.price_max_vnd, evidence=v.price_evidence,
                 semantics="per_person" if v.price_evidence == "verified" else "venue_range")


def public_source(data):
    return "synthetic" if data.dataset_source == "synthetic" else "private"


def render_tour(tour, data, prefs, revision, routes, explainer=None):
    if tour is None:
        return None
    if any(value is not None and not 0 <= value < 1440
           for stop in tour.stops for value in (stop.arrive_min, stop.depart_min)):
        raise APIError(422, "validation_error", "Lịch trình qua nửa đêm chưa được hỗ trợ; hãy đổi giờ hoặc thời lượng.")
    if engine.validate_tour(tour, data.venues, prefs, routes):
        raise APIError(500, "internal_validation_failed", "Lịch trình không vượt qua kiểm tra; chưa trả điểm dừng.")
    by_id = {v.id: v for v in data.venues}
    lines, points = None, []
    if tour.stops and tour.leg_source == "provider_route" and hasattr(routes, "geometry"):
        # Display-only polylines from the same provider; never drawn for estimated legs.
        points = [prefs.origin] + [(by_id[s.venue_id].lat, by_id[s.venue_id].lon) for s in tour.stops]
        lines = routes.geometry(points)
    stops = []
    for index, stop in enumerate(tour.stops):
        venue = by_id[stop.venue_id]
        leg = asdict(stop.leg_from_previous)
        if lines is not None and stop.leg_from_previous.source == "provider_route":
            leg["geometry"] = [[round(lat, 6), round(lon, 6)] for lat, lon in lines[index]]
        stops.append(StopView(
            venue=venue_view(venue, data),
            venue_id=venue.id, name=venue.name, address=venue.address,
            district=venue.district, lat=venue.lat, lon=venue.lon,
            source_url=venue.source_url, order=stop.order,
            arrive=clock(stop.arrive_min), depart=clock(stop.depart_min),
            leg_from_previous=LegView(**leg),
            price=price(venue), hours=Hours(status=stop.hours_evidence,
                display=venue.hours_display, open_at_arrival=stop.open_at_arrival),
            synthetic=venue.synthetic, why=[{"code": code, "text": text} for code, text in stop.why],
        ))
    text, text_source = explainer.explain(tour, data.venues) if explainer else (explain(tour, data.venues), "template")
    return TourView(
        revision=revision, status=tour.status, stops=stops, reasons=list(tour.reasons),
        proposed_changes=list(tour.proposed_changes), unknowns=list(tour.unknowns),
        totals=Totals(venue_range_upper_sum_vnd=tour.venue_range_upper_sum_vnd,
                      walk_minutes=tour.walk_minutes, leg_source=tour.leg_source,
                      route_provider=(getattr(routes, 'name', None)
                          if tour.leg_source == 'provider_route' and getattr(routes, 'name', None)
                          in ('google_routes', 'ors', 'osrm') else None)),
        explanation=text, explanation_source=text_source, locks=list(tour.locks),
        assumptions=dict(tour.assumptions),
        route_warnings=(routes.warnings(points) if points and getattr(routes, 'name', '') == 'google_routes' else []),
    )


def state_view(prefs, tour, data, revision, routes, explainer=None):
    missing = engine.missing_slots(prefs)
    return SessionView(
        preferences=PreferencesSchema.from_domain(prefs), missing_slots=missing,
        questions=[QUESTIONS[m] for m in missing if m in QUESTIONS],
        tour=render_tour(tour, data, prefs, revision, routes, explainer), revision=revision,
        dataset_source=public_source(data), dataset_version=data.dataset_version,
    )


def commit(session, prefs, tour, data, request, notes=()):
    revision = session.revision + 1
    view = state_view(prefs, tour, data, revision, request.app.state.routing, request.app.state.explainer)
    view.notes = list(dict.fromkeys((*session.notes, *notes)))
    session.preferences, session.tour, session.snapshot = prefs, tour, data
    session.revision = revision
    return view


@router.get("/health", response_model=Health)
def health(request: Request):
    data = snapshot(request)
    extractor, routing = request.app.state.extractor, request.app.state.routing
    llm_mode = "unavailable" if isinstance(extractor, UnavailableExtractor) else (
        "live" if isinstance(extractor, (LLMExtractor, FallbackExtractor, RulesFirstExtractor)) else "mock")
    if isinstance(extractor, RulesFirstExtractor) and isinstance(extractor.llm, UnavailableExtractor):
        llm_mode = "mock"
    route_mode = ("provider_route" if routing.configured and routing.reachable else "unknown"
                  ) if isinstance(routing, (HttpRouteProvider, WalkingRouteProvider)) else "straight_line_estimate"
    info = request.app.state.provider_info
    return Health(ranking={"quality_weight": request.app.state.quality_weight},
                  llm_budget=budget_snapshot(request),
                  status="ok", dataset_loaded=bool(data.venues),
                  llm=llm_mode, llm_configured=(llm_mode != "unavailable" and not (
                      isinstance(extractor, RulesFirstExtractor) and isinstance(extractor.llm, UnavailableExtractor))),
                  routing=route_mode, routing_configured=getattr(routing, "configured", True),
                  dataset_source=public_source(data),
                  dataset_version=data.dataset_version, evidence_overlay=data.evidence_overlay,
                  llm_provider=info["llm_provider"], llm_model=info["llm_model"],
                  explanation_provider=info["explanation_provider"], routing_provider=info["routing_provider"],
                  routing_last_error=getattr(routing, "last_error", None),
                  geocoding={'status': 'ready' if request.app.state.geocoder.configured else 'unavailable',
                             'last_error': request.app.state.geocoder.last_error})


@router.get('/v1/client-config', response_model=ClientConfig)
def client_config(request: Request, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    key = os.getenv('GOOGLE_MAPS_BROWSER_KEY', '').strip()
    map_id = os.getenv('GOOGLE_MAPS_MAP_ID', '').strip()
    secrets = [os.getenv(name, '').strip() for name in ('GOOGLE_MAPS_SERVER_KEY', 'GEMINI_API_KEY', 'ORS_API_KEY')]
    ready = bool(key and map_id and not any(secret and (secret in key or secret in map_id) for secret in secrets))
    return {'features': {'ui_v2': os.getenv('FOODTOUR_UI_V2', '').strip().casefold() in ('1', 'true', 'yes')},
        'maps': {'provider': 'google', 'status': 'ready' if ready else 'unavailable',
        'reason': None if ready else 'not_configured', 'js_api_key': key if ready else None,
        'map_id': map_id if ready else None, 'language': 'vi', 'region': 'VN',
        'default_center': {'lat': 21.0285, 'lon': 105.8522}, 'default_zoom': 15},
        'geocoding': {'status': 'ready' if request.app.state.geocoder.configured else 'unavailable'},
        'routing': {'provider': request.app.state.provider_info['routing_provider'],
                    'status': 'ready' if getattr(request.app.state.routing, 'configured', False) else 'unavailable'},
        'privacy': {'sent_to_google': ['map_tiles', 'autocomplete_text', 'route_coordinates'], 'doc': 'docs/PHASE4.md'}}


@router.post('/v1/geocode', response_model=GeocodeResponse)
def geocode(body: GeocodeRequest, request: Request, x_session_token: str | None = Header(default=None)):
    request.app.state.sessions.authorize_token(x_session_token)
    return request.app.state.geocoder.geocode(body.query)


@router.get('/v1/venues/map', response_model=MapVenues)
def map_venues(request: Request, min_lat: float = Query(ge=-90, le=90), min_lon: float = Query(ge=-180, le=180),
               max_lat: float = Query(ge=-90, le=90), max_lon: float = Query(ge=-180, le=180),
               limit: int = Query(default=200, ge=1, le=500), q: str | None = Query(default=None, max_length=200)):
    if min_lat > max_lat or min_lon > max_lon:
        raise APIError(422, 'validation_error', 'Giới hạn bản đồ không hợp lệ.')
    data = snapshot(request)
    selected = sorted((v for v in data.venues if not v.online_only and v.geo_ok
        and min_lat <= v.lat <= max_lat and min_lon <= v.lon <= max_lon
        and (not q or q.strip().casefold() in (' '.join((v.name, v.district, *v.dish_tags))).casefold())), key=lambda v: v.id)
    return MapVenues(items=[MapVenue(id=v.id, name=v.name, lat=v.lat, lon=v.lon, district=v.district,
        dish_tags=list(v.dish_tags), price_max_vnd=v.price_max_vnd, synthetic=v.synthetic)
        for v in selected[:limit]], total_in_view=len(selected), truncated=len(selected) > limit,
        dataset_source=public_source(data), dataset_version=data.dataset_version)


def venue_view(v, data):
    return VenueView(
        rating={"value": v.rating, "count": v.review_count, "source_scale_max": v.rating_scale_max},
        suitable_meals=list(v.suitable_meals), audiences=list(v.audiences),
        cuisine_styles=list(v.cuisine_styles),
        amenities={"yes": list(v.amenities_yes), "no": list(v.amenities_no)},
        source_fetched_at=v.source_fetched_at,
        id=v.id, name=v.name, city=v.city, address=v.address, district=v.district,
        lat=v.lat, lon=v.lon, source_url=v.source_url, dish_tags=list(v.dish_tags),
        online_only=v.online_only, geo_ok=v.geo_ok, synthetic=v.synthetic,
        price=price(v), hours=Hours(status="verified" if v.hours is not None else "unknown", display=v.hours_display),
        dataset_source=public_source(data), dataset_version=data.dataset_version,
    )


@router.get("/v1/venues", response_model=VenueList)
def venues(request: Request, city: str = Query(default="Hà Nội", max_length=100),
           limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0)):
    data = snapshot(request)
    selected = [v for v in data.venues if v.city == city]
    items = [VenueListItem(
        **venue_view(v, data).model_dump(), foody_id=v.id,
        dish_groups=" | ".join(v.dish_tags), venue_types="Shop Online" if v.online_only else None,
        geo_status="ok" if v.geo_ok else "unknown", price_min_vnd_norm=v.price_min_vnd,
        price_max_vnd_norm=v.price_max_vnd,
        price_status="ok" if v.price_min_vnd is not None and v.price_max_vnd is not None else "unknown",
        hours_displayed=v.hours_display,
        price_semantics="per_person" if v.price_evidence == "verified" else "venue_range",
        hours_status="verified" if v.hours is not None else "unknown",
    ) for v in selected[offset:offset + limit]]
    return VenueList(items=items, total=len(selected), limit=limit, offset=offset,
                     dataset_source=public_source(data), dataset_version=data.dataset_version)


@router.get("/v1/venues/{venue_id}", response_model=VenueView)
def venue_detail(venue_id: str, request: Request):
    data = snapshot(request)
    v = next((v for v in data.venues if v.id == venue_id), None)
    if v is None:
        raise APIError(404, "no_candidates", "Không tìm thấy địa điểm.")
    return venue_view(v, data)


@router.post("/v1/plans")
def create_plan(req: legacy.PlanRequest):
    return legacy.plan(req, legacy.load())


@router.post("/v1/sessions", response_model=SessionCreated)
def create_session(request: Request):
    return request.app.state.sessions.create()


@router.get("/v1/sessions/{session_id}", response_model=SessionView)
def read_session(session_id: str, request: Request,
                 x_session_token: str | None = Header(default=None)):
    from app.repositories.sqlite_sessions import CHANGED
    with request.app.state.sessions.owned(session_id, x_session_token) as session:
        data = snapshot(request)
        tour = session.tour
        notes = session.notes
        if tour is not None and session.snapshot is not None:
            if data.dataset_version != session.snapshot.dataset_version:
                tour, notes = None, (CHANGED,)
            elif tour.stops:
                rebuilt, why = engine.build_tour(data.venues, session.preferences,
                    [s.venue_id for s in tour.stops], request.app.state.routing)
                tour = rebuilt.with_locks(tour.locks) if rebuilt is not None and not why else None
                if tour is None:
                    notes = (CHANGED,)
        view = state_view(session.preferences, tour, data, session.revision, request.app.state.routing,
                          request.app.state.explainer)
        view.notes = list(notes)
        return view


@router.post("/v1/sessions/{session_id}/messages", response_model=SessionView)
def message(session_id: str, body: MessageRequest, request: Request,
            x_session_token: str | None = Header(default=None)):
    with request.app.state.sessions.owned(session_id, x_session_token) as session:
        result = request.app.state.extractor.extract(body.text, session.preferences)
        if result.status != "ok":
            raise APIError(503, "provider_unavailable", "Chưa có dịch vụ hiểu yêu cầu; hãy dùng biểu mẫu.")
        try:
            prefs = PreferencesSchema.from_domain(result.preferences).domain()
        except (ValidationError, TypeError, ValueError, IndexError):
            raise APIError(422, "validation_error", "Thông tin trích xuất không hợp lệ; hãy dùng biểu mẫu.") from None
        notes = list(result.notes)
        if result.origin_text:
            prefs = domain_replace(prefs, origin=None, origin_label=None, origin_source=None)
            found = (request.app.state.geocoder.geocode(result.origin_text)
                if request.app.state.geocoder.configured else {'status': 'unavailable', 'results': []})
            if found['status'] == 'ok' and found['results']:
                chosen = found['results'][0]
                prefs = domain_replace(prefs, origin=(chosen['lat'], chosen['lon']),
                    origin_label=chosen['label'][:120], origin_source='geocoded')
                notes.append('Điểm xuất phát lấy theo kết quả tìm kiếm Google: ' + chosen['label'][:120] + '; bạn có thể sửa.')
            else:
                notes.append('Chưa xác định được điểm xuất phát qua Google (' + found['status'] + '); hãy chọn hoặc nhập tọa độ.')
        prefs = PreferencesSchema.from_domain(prefs).domain()
        data = snapshot(request)
        tour = None if engine.missing_slots(prefs) or result.rejected_fields else engine.plan_tour(
            data.venues, prefs, request.app.state.routing, quality_weight=request.app.state.quality_weight)
        view = commit(session, prefs, tour, data, request, notes)
        view.extraction_source = {"live": "llm", "cache": "cache"}.get(result.source, "rules")
        view.llm_calls = result.llm_calls
        if request.app.state.llm_budget:
            budget = budget_snapshot(request)
            view.llm_budget = MessageBudget(**{k: budget[k] for k in ("limit", "remaining", "exhausted")})
        return view


@router.put("/v1/sessions/{session_id}/preferences", response_model=SessionView)
def preferences(session_id: str, body: PreferencesRequest, request: Request,
                x_session_token: str | None = Header(default=None)):
    with request.app.state.sessions.owned(session_id, x_session_token) as session:
        request.app.state.sessions.check_revision(session, body.base_revision)
        return commit(session, body.preferences.domain(), None, snapshot(request), request)


@router.post("/v1/sessions/{session_id}/tour", response_model=SessionView)
def tour(session_id: str, body: RevisionRequest, request: Request,
         x_session_token: str | None = Header(default=None)):
    with request.app.state.sessions.owned(session_id, x_session_token) as session:
        request.app.state.sessions.check_revision(session, body.base_revision)
        data = snapshot(request)
        result = engine.plan_tour(data.venues, session.preferences, request.app.state.routing,
                                  quality_weight=request.app.state.quality_weight)
        return commit(session, session.preferences, result, data, request)


@router.post("/v1/sessions/{session_id}/tour/replace", response_model=SessionView)
def replace(session_id: str, body: ReplaceRequest, request: Request,
            x_session_token: str | None = Header(default=None)):
    with request.app.state.sessions.owned(session_id, x_session_token) as session:
        request.app.state.sessions.check_revision(session, body.base_revision)
        if session.tour is None or not session.tour.stops:
            raise APIError(409, "no_candidates", "Phiên chưa có điểm dừng để thay thế.")
        data = session.snapshot
        if (os.getenv("FOODTOUR_EVIDENCE_PATH", "").strip()
                or data.evidence_overlay["hours_verified"] or data.evidence_overlay["prices_verified"]):
            current = snapshot(request)
            if current.dataset_version != data.dataset_version:
                raise APIError(409, "dataset_changed", "Dữ liệu đã đổi; hãy lập lại lịch trình trước khi thay quán.")
            data = current
        result = engine.replace_stop(data.venues, session.preferences, session.tour,
                                     body.venue_id, request.app.state.routing,
                                     quality_weight=request.app.state.quality_weight)
        if not result.ok:
            raise APIError(409, "no_candidates", "Không có phương án thay thế thoả ràng buộc.",
                           {"reasons": list(result.reasons)})
        old_ids = [s.venue_id for s in session.tour.stops]
        new_ids = [s.venue_id for s in result.tour.stops]
        locks = tuple(i for i in old_ids if i != body.venue_id)
        preserves_others = (len(old_ids) == len(new_ids) and body.venue_id in old_ids
            and all(a == b for a, b in zip(old_ids, new_ids) if a != body.venue_id)
            and body.venue_id not in new_ids and tuple(result.tour.locks) == locks)
        if not preserves_others:
            raise APIError(500, "internal_validation_failed", "Phương án thay thế không giữ các điểm đã khoá.")
        return commit(session, session.preferences, result.tour, data, request)
