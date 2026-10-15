"""Contract-v1 endpoints. All session mutations are atomic and checked."""
from dataclasses import asdict

from fastapi import APIRouter, Header, Query, Request
from pydantic import ValidationError

from app.api import legacy
from app.api.errors import APIError
from app.api.schemas import (
    ErrorResponse, Health, Hours, LegView, MessageRequest, PreferencesRequest,
    PreferencesSchema, Price, ReplaceRequest, RevisionRequest, SessionCreated,
    SessionView, StopView, Totals, TourView, VenueView, VenueList, VenueListItem, clock,
)
from app.data import DatasetLoadError
from app.llm.explain import explain
from app.llm.extract import QUESTIONS, UnavailableExtractor
from app.llm.provider import LLMExtractor
from app.providers.routing import HttpRouteProvider
from app.planner import engine

router = APIRouter(responses={
    code: {"model": ErrorResponse} for code in (401, 403, 404, 405, 409, 410, 413, 422, 429, 500, 503)
})


def snapshot(request):
    try:
        return request.app.state.venues.snapshot()
    except DatasetLoadError:
        raise APIError(503, "provider_unavailable", "Không thể đọc bộ dữ liệu địa điểm.") from None


def price(v):
    return Price(min_vnd=v.price_min_vnd, max_vnd=v.price_max_vnd, evidence=v.price_evidence)


def public_source(data):
    return "synthetic" if data.dataset_source == "synthetic" else "private"


def render_tour(tour, data, prefs, revision, routes):
    if tour is None:
        return None
    if any(value is not None and not 0 <= value < 1440
           for stop in tour.stops for value in (stop.arrive_min, stop.depart_min)):
        raise APIError(422, "validation_error", "Lịch trình qua nửa đêm chưa được hỗ trợ; hãy đổi giờ hoặc thời lượng.")
    if engine.validate_tour(tour, data.venues, prefs, routes):
        raise APIError(500, "internal_validation_failed", "Lịch trình không vượt qua kiểm tra; chưa trả điểm dừng.")
    by_id = {v.id: v for v in data.venues}
    stops = []
    for stop in tour.stops:
        venue = by_id[stop.venue_id]
        stops.append(StopView(
            venue_id=venue.id, name=venue.name, address=venue.address,
            district=venue.district, lat=venue.lat, lon=venue.lon,
            source_url=venue.source_url, order=stop.order,
            arrive=clock(stop.arrive_min), depart=clock(stop.depart_min),
            leg_from_previous=LegView(**asdict(stop.leg_from_previous)),
            price=price(venue), hours=Hours(status=stop.hours_evidence,
                display=venue.hours_display, open_at_arrival=stop.open_at_arrival),
            synthetic=venue.synthetic,
        ))
    return TourView(
        revision=revision, status=tour.status, stops=stops, reasons=list(tour.reasons),
        proposed_changes=list(tour.proposed_changes), unknowns=list(tour.unknowns),
        totals=Totals(venue_range_upper_sum_vnd=tour.venue_range_upper_sum_vnd,
                      walk_minutes=tour.walk_minutes, leg_source=tour.leg_source),
        explanation=explain(tour, data.venues), locks=list(tour.locks),
        assumptions=dict(tour.assumptions),
    )


def state_view(prefs, tour, data, revision, routes):
    missing = engine.missing_slots(prefs)
    return SessionView(
        preferences=PreferencesSchema.from_domain(prefs), missing_slots=missing,
        questions=[QUESTIONS[m] for m in missing if m in QUESTIONS],
        tour=render_tour(tour, data, prefs, revision, routes), revision=revision,
        dataset_source=public_source(data), dataset_version=data.dataset_version,
    )


def commit(session, prefs, tour, data, request, notes=()):
    revision = session.revision + 1
    view = state_view(prefs, tour, data, revision, request.app.state.routing)
    view.notes = list(dict.fromkeys((*session.notes, *notes)))
    session.preferences, session.tour, session.snapshot = prefs, tour, data
    session.revision = revision
    return view


@router.get("/health", response_model=Health)
def health(request: Request):
    data = snapshot(request)
    extractor, routing = request.app.state.extractor, request.app.state.routing
    llm_mode = "unavailable" if isinstance(extractor, UnavailableExtractor) else (
        "live" if isinstance(extractor, LLMExtractor) else "mock")
    route_mode = ("provider_route" if routing.configured and routing.reachable else "unknown"
                  ) if isinstance(routing, HttpRouteProvider) else "straight_line_estimate"
    return Health(status="ok", dataset_loaded=bool(data.venues),
                  llm=llm_mode, llm_configured=llm_mode != "unavailable",
                  routing=route_mode, routing_configured=getattr(routing, "configured", True),
                  dataset_source=public_source(data),
                  dataset_version=data.dataset_version)


def venue_view(v, data):
    return VenueView(
        id=v.id, name=v.name, city=v.city, address=v.address, district=v.district,
        lat=v.lat, lon=v.lon, source_url=v.source_url, dish_tags=list(v.dish_tags),
        online_only=v.online_only, geo_ok=v.geo_ok, synthetic=v.synthetic,
        price=price(v), hours=Hours(status="unknown", display=v.hours_display),
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
        view = state_view(session.preferences, tour, data, session.revision, request.app.state.routing)
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
        data = snapshot(request)
        tour = None if engine.missing_slots(prefs) or result.rejected_fields else engine.plan_tour(data.venues, prefs, request.app.state.routing)
        return commit(session, prefs, tour, data, request, result.notes)


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
        result = engine.plan_tour(data.venues, session.preferences, request.app.state.routing)
        return commit(session, session.preferences, result, data, request)


@router.post("/v1/sessions/{session_id}/tour/replace", response_model=SessionView)
def replace(session_id: str, body: ReplaceRequest, request: Request,
            x_session_token: str | None = Header(default=None)):
    with request.app.state.sessions.owned(session_id, x_session_token) as session:
        request.app.state.sessions.check_revision(session, body.base_revision)
        if session.tour is None or not session.tour.stops:
            raise APIError(409, "no_candidates", "Phiên chưa có điểm dừng để thay thế.")
        data = session.snapshot
        result = engine.replace_stop(data.venues, session.preferences, session.tour,
                                     body.venue_id, request.app.state.routing)
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
