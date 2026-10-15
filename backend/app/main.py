"""FastAPI composition with backward-compatible legacy imports."""
import os
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from app.api.errors import APIError
from app.api.legacy import PlanRequest, load, plan
from app.api.routes import router
from app.llm.extract import MockExtractor, UnavailableExtractor
from app.planner.interfaces import StraightLineEstimator
from app.repositories.sessions import SessionStore
from app.repositories.venues import VenueRepository


def create_app(*, data_path=None, sessions=None, extractor=None):
    app = FastAPI(title="AI FoodTour Planner", version="1.0.0")
    app.state.venues = VenueRepository(data_path)
    app.state.sessions = sessions if sessions is not None else SessionStore()
    app.state.extractor = extractor if extractor is not None else (
        UnavailableExtractor() if os.getenv("FOODTOUR_LLM", "mock").casefold() == "off" else MockExtractor()
    )
    app.state.routing = StraightLineEstimator()
    app.add_middleware(
        CORSMiddleware, allow_origins=[os.getenv("WEB_ORIGIN", "http://localhost:3000")],
        allow_methods=["GET", "POST", "PUT"], allow_headers=["Content-Type", "X-Session-Token"],
    )

    @app.exception_handler(APIError)
    async def api_error(request: Request, exc: APIError):
        return JSONResponse(status_code=exc.status, content=exc.body())

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError):
        details = [{"loc": list(e["loc"]), "type": e["type"]} for e in exc.errors()]
        return JSONResponse(status_code=422, content=APIError(
            422, "validation_error", "Yêu cầu không hợp lệ.", details
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
