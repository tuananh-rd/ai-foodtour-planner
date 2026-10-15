"""FastAPI composition with backward-compatible legacy imports."""
import os
import logging
from urllib.parse import urlsplit
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from app.api.errors import APIError
from app.api.legacy import PlanRequest, load, plan
from app.api.routes import router
from app.api.security import SecurityMiddleware, configure_access_logging, setting
from app.llm.extract import MockExtractor, UnavailableExtractor
from app.llm.explain import CheckedExplainer
from app.llm.provider import FallbackExtractor, LLMExtractor
from app.providers.extraction import HttpExtractionProvider
from app.providers.routing import HttpRouteProvider
from app.providers.gemini import GeminiClient, GeminiExplanationProvider, GeminiExtractionProvider
from app.providers.walking import ORSWalkingProvider, OSRMWalkingProvider
from app.providers.google_maps import GoogleRoutesProvider, GoogleGeocoder
from app.planner.interfaces import StraightLineEstimator
from app.repositories.sessions import SessionStore, SessionStoreInterface
from app.repositories.sqlite_sessions import SQLiteSessionStore
from app.repositories.venues import VenueRepository


def create_app(*, data_path=None, sessions: SessionStoreInterface | None = None, extractor=None):
    configure_access_logging()
    app = FastAPI(title="AI FoodTour Planner", version="1.0.0")
    app.state.venues = VenueRepository(data_path)
    llm_mode = os.getenv("FOODTOUR_LLM", "mock").strip().casefold()
    info = {"llm_provider": "rules", "llm_model": None, "explanation_provider": "template",
            "routing_provider": "estimate"}
    gemini = None
    if extractor is not None:
        app.state.extractor = extractor
    elif llm_mode == "mock":
        app.state.extractor = MockExtractor()
    elif llm_mode == "gemini":
        gemini = GeminiClient()
        info.update(llm_provider="gemini", llm_model=gemini.model)
        # Gemini first; if it fails the rule extractor answers and the response says so.
        app.state.extractor = (FallbackExtractor(LLMExtractor(GeminiExtractionProvider(gemini), deadline_s=15.0),
                                                 MockExtractor())
                               if gemini.configured else UnavailableExtractor())
    elif llm_mode == "live":
        provider = HttpExtractionProvider(os.getenv("FOODTOUR_LLM_ENDPOINT"))
        info["llm_provider"] = "http"
        app.state.extractor = LLMExtractor(provider) if provider.configured else UnavailableExtractor()
    else:
        info["llm_provider"] = "off"
        app.state.extractor = UnavailableExtractor()
    explain_mode = os.getenv("FOODTOUR_EXPLAIN", "template").strip().casefold()
    if explain_mode == "gemini":
        gemini = gemini or GeminiClient()
        info["explanation_provider"] = "gemini"
        info["llm_model"] = info["llm_model"] or gemini.model
        app.state.explainer = CheckedExplainer(GeminiExplanationProvider(gemini) if gemini.configured else None)
    else:
        app.state.explainer = CheckedExplainer(None)
    routing_mode = os.getenv("FOODTOUR_ROUTING", "estimate").strip().casefold()
    if routing_mode == "google":
        app.state.routing = GoogleRoutesProvider()
    elif routing_mode == "ors":
        app.state.routing = ORSWalkingProvider()
    elif routing_mode == "osrm" and os.getenv("FOODTOUR_OSRM_LEGACY", "").strip() == "1":
        app.state.routing = HttpRouteProvider(os.getenv("FOODTOUR_ROUTING_ENDPOINT"))
    elif routing_mode == "osrm":
        app.state.routing = OSRMWalkingProvider(os.getenv("FOODTOUR_ROUTING_ENDPOINT"))
    elif routing_mode == "estimate":
        app.state.routing = StraightLineEstimator()
    else:
        app.state.routing = HttpRouteProvider(None)  # unknown mode: unconfigured, never estimated
    info["routing_provider"] = 'google_routes' if routing_mode == 'google' else (
        routing_mode if routing_mode in ("ors", "osrm") else "estimate")
    app.state.geocoder = (GoogleGeocoder() if os.getenv('FOODTOUR_GEOCODER', '').strip().casefold() == 'google'
                           else GoogleGeocoder(base_url=None))
    app.state.provider_info = info
    web_origins = []
    for configured in os.getenv("WEB_ORIGIN", "http://localhost:3000").split(","):
        origin = configured.strip()
        try:
            parts = urlsplit(origin)
            valid = (parts.scheme in ("http", "https") and parts.hostname
                     and not parts.username and not parts.password
                     and not parts.path and not parts.query and not parts.fragment and "*" not in origin)
        except ValueError:
            valid = False
        if valid and origin not in web_origins:
            web_origins.append(origin)
    db_path = os.getenv("FOODTOUR_SESSION_DB", "").strip() or None
    rate_limit = setting("FOODTOUR_RATE_LIMIT_TOKEN", 60)
    rate_window = setting("FOODTOUR_RATE_WINDOW_SECONDS", 60)
    app.state.sessions = sessions if sessions is not None else (
        SQLiteSessionStore(db_path, app.state.venues, app.state.routing,
                           rate_limit=rate_limit, rate_window=rate_window) if db_path else
        SessionStore(rate_limit=rate_limit, rate_window=rate_window)
    )
    app.add_middleware(
        CORSMiddleware, allow_origins=web_origins,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Content-Type", "X-Session-Token", "X-Request-ID"], expose_headers=["X-Request-ID"],
    )
    app.add_middleware(SecurityMiddleware,
        body_limit=setting("FOODTOUR_BODY_LIMIT_BYTES", 8192), token_limit=rate_limit,
        ip_limit=setting("FOODTOUR_RATE_LIMIT_IP", 240), window=rate_window,
        web_origins=web_origins)
    # Uvicorn's default access formatter includes raw URLs; only allowlisted JSON access logs remain.
    logging.getLogger("uvicorn.access").disabled = True

    @app.exception_handler(APIError)
    async def api_error(request: Request, exc: APIError):
        return JSONResponse(status_code=exc.status, content=exc.body())

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422, content=APIError(
            422, "validation_error", "Yêu cầu không hợp lệ."
        ).body())

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content=APIError(
            exc.status_code, "validation_error", "Không thể xử lý yêu cầu."
        ).body())

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        return JSONResponse(status_code=500, content=APIError(
            500, "internal_validation_failed", "Không thể xác minh kết quả; chưa trả điểm dừng."
        ).body())

    app.include_router(router)
    return app


app = create_app()
