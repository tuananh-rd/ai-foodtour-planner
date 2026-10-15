"""Contract-v1 HTTP models; domain time is converted only at the boundary."""
from typing import Literal
import unicodedata

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.planner.types import Preferences

Evidence = Literal["verified", "estimate", "unknown"]
LegSource = Literal["provider_route", "straight_line_estimate", "unknown"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Origin(Model):
    lat: float = Field(ge=-90, le=90, strict=True)
    lon: float = Field(ge=-180, le=180, strict=True)


class PreferencesSchema(Model):
    city: str = Field(default="Hà Nội", max_length=100)
    origin: Origin | None = None
    origin_label: str | None = Field(default=None, max_length=120)
    origin_source: Literal['current_location', 'place', 'manual_coordinates', 'landmark', 'geocoded'] | None = None

    start_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    weekday: int | None = Field(default=None, ge=0, le=6, strict=True)
    duration_min: int | None = Field(default=None, ge=30, le=720, strict=True)
    budget_vnd: int | None = Field(default=None, gt=0, strict=True)
    budget_scope: Literal["per_person", "group"] | None = None
    party_size: int | None = Field(default=None, ge=1, le=20, strict=True)
    interests: list[str] = Field(default_factory=list, max_length=10)
    exclusions: list[str] = Field(default_factory=list, max_length=10)
    max_stops: int = Field(default=3, ge=1, le=5, strict=True)
    mode: Literal["explore", "strict"] = "explore"

    @field_validator('origin_label')
    @classmethod
    def safe_label(cls, value):
        if value is not None and any(unicodedata.category(c) in ('Cc', 'Cf', 'Cs') for c in value):
            raise ValueError('invalid label')
        return value

    def domain(self):
        values = self.model_dump(exclude={"start_time", "origin"})
        values["origin"] = (self.origin.lat, self.origin.lon) if self.origin else None
        values["start_time_min"] = (
            int(self.start_time[:2]) * 60 + int(self.start_time[3:]) if self.start_time else None
        )
        values["interests"] = tuple(values["interests"])
        values["exclusions"] = tuple(values["exclusions"])
        return Preferences(**values)

    @classmethod
    def from_domain(cls, prefs):
        return cls(
            city=prefs.city,
            origin=Origin(lat=prefs.origin[0], lon=prefs.origin[1]) if prefs.origin else None,
            origin_label=prefs.origin_label, origin_source=prefs.origin_source,
            start_time=clock(prefs.start_time_min), weekday=prefs.weekday,
            duration_min=prefs.duration_min, budget_vnd=prefs.budget_vnd,
            budget_scope=prefs.budget_scope, party_size=prefs.party_size,
            interests=list(prefs.interests), exclusions=list(prefs.exclusions),
            max_stops=prefs.max_stops, mode=prefs.mode,
        )


def clock(minutes):
    if minutes is None:
        return None
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


class MessageRequest(Model):
    text: str = Field(min_length=1, max_length=1000)


class RevisionRequest(Model):
    base_revision: int = Field(ge=0, strict=True)


class PreferencesRequest(RevisionRequest):
    preferences: PreferencesSchema


class ReplaceRequest(RevisionRequest):
    venue_id: str = Field(min_length=1, max_length=200)


class SessionCreated(Model):
    session_id: str
    token: str
    revision: int


class Price(Model):
    min_vnd: int | None
    max_vnd: int | None
    semantics: Literal["venue_range", "per_person"] = "venue_range"
    evidence: Evidence


class Hours(Model):
    status: Evidence
    display: str | None
    open_at_arrival: bool | None = None


class VenueView(Model):
    id: str
    name: str
    city: str
    address: str
    district: str
    lat: float
    lon: float
    source_url: str
    dish_tags: list[str]
    online_only: bool
    geo_ok: bool
    synthetic: bool
    price: Price
    hours: Hours
    dataset_source: Literal["private", "synthetic"]
    dataset_version: str


class VenueListItem(VenueView):
    """Explicit legacy aliases over validated snapshot fields, never raw rows."""
    foody_id: str
    dish_groups: str
    cuisine_styles: None = None  # The canonical snapshot does not retain this field.
    venue_types: Literal["Shop Online"] | None
    geo_status: Literal["ok", "unknown"]
    price_min_vnd_norm: int | None
    price_max_vnd_norm: int | None
    price_status: Literal["ok", "unknown"]
    price_semantics: Literal["venue_range", "per_person"] = "venue_range"
    hours_displayed: str | None
    hours_status: Literal["unknown", "verified"] = "unknown"


class VenueList(Model):
    items: list[VenueListItem]
    total: int
    limit: int
    offset: int
    dataset_source: Literal["private", "synthetic"]
    dataset_version: str


class LegView(Model):
    minutes: int | None
    km: float
    source: LegSource
    # Route polyline [[lat, lon], ...] from the routing provider; present only for provider_route legs.
    geometry: list[list[float]] | None = None


class StopView(Model):
    venue_id: str
    name: str
    address: str
    district: str
    lat: float
    lon: float
    source_url: str
    order: int
    arrive: str | None
    depart: str | None
    leg_from_previous: LegView
    price: Price
    hours: Hours
    synthetic: bool


class Totals(Model):
    venue_range_upper_sum_vnd: int
    walk_minutes: int | None
    leg_source: LegSource
    route_provider: Literal['google_routes', 'ors', 'osrm'] | None = None


class TourView(Model):
    revision: int
    status: Literal["verified_feasible", "conditional", "insufficient_evidence", "no_solution"]
    stops: list[StopView]
    reasons: list[str]
    proposed_changes: list[str]
    unknowns: list[str]
    totals: Totals
    explanation: str | None
    explanation_source: Literal["template", "llm"] = "template"
    locks: list[str]
    assumptions: dict = Field(default_factory=dict)
    route_warnings: list[str] = Field(default_factory=list)


class SessionView(Model):
    preferences: PreferencesSchema
    missing_slots: list[str]
    questions: list[str]
    notes: list[str] = Field(default_factory=list)
    tour: TourView | None
    revision: int
    dataset_source: Literal["private", "synthetic"]
    dataset_version: str
    extraction_source: Literal["rules", "llm"] | None = None


class EvidenceOverlayCounts(Model):
    entries_loaded: int = Field(default=0, ge=0)
    entries_rejected: int = Field(default=0, ge=0)
    hours_verified: int = Field(default=0, ge=0)
    prices_verified: int = Field(default=0, ge=0)


class GeocodingHealth(Model):
    status: Literal['ready', 'unavailable']
    last_error: str | None = None


class Health(Model):
    status: str
    dataset_loaded: bool
    llm: Literal["mock", "live", "unavailable"]
    routing: Literal["straight_line_estimate", "provider_route", "unknown"]
    llm_configured: bool = True
    routing_configured: bool = True
    llm_provider: Literal["rules", "gemini", "http", "off"] = "rules"
    llm_model: str | None = None
    explanation_provider: Literal["template", "gemini"] = "template"
    routing_provider: Literal["estimate", "ors", "osrm", "google_routes"] = "estimate"
    routing_last_error: str | None = None
    dataset_source: Literal["private", "synthetic"]
    dataset_version: str
    evidence_overlay: EvidenceOverlayCounts = Field(default_factory=EvidenceOverlayCounts)
    geocoding: GeocodingHealth = Field(default_factory=lambda: GeocodingHealth(status='unavailable'))


class GeocodeRequest(Model):
    query: str = Field(min_length=1, max_length=200)

    @field_validator('query')
    @classmethod
    def nonblank(cls, value):
        if not value.strip() or any(ord(c) < 32 or ord(c) == 127 for c in value):
            raise ValueError('invalid query')
        return value.strip()


class GeocodeResult(Model):
    label: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    place_id: str | None = None


class GeocodeResponse(Model):
    status: Literal['ok', 'zero_results', 'unavailable', 'quota']
    provider: Literal['google_geocoding'] = 'google_geocoding'
    results: list[GeocodeResult] = Field(default_factory=list, max_length=5)


class MapVenue(Model):
    id: str
    name: str
    lat: float
    lon: float
    district: str
    dish_tags: list[str]
    price_max_vnd: int | None
    synthetic: bool


class MapVenues(Model):
    items: list[MapVenue]
    total_in_view: int
    truncated: bool
    dataset_source: Literal['private', 'synthetic']
    dataset_version: str


class MapsConfig(Model):
    provider: Literal['google'] = 'google'
    status: Literal['ready', 'unavailable']
    reason: Literal['not_configured'] | None
    js_api_key: str | None
    map_id: str | None
    language: Literal['vi'] = 'vi'
    region: Literal['VN'] = 'VN'
    default_center: Origin
    default_zoom: int = 15


class ServiceConfig(Model):
    status: Literal['ready', 'unavailable']


class RoutingConfig(ServiceConfig):
    provider: Literal['google_routes', 'ors', 'osrm', 'estimate']


class PrivacyConfig(Model):
    sent_to_google: list[Literal['map_tiles', 'autocomplete_text', 'route_coordinates']]
    doc: Literal['docs/PHASE4.md'] = 'docs/PHASE4.md'


class ClientConfig(Model):
    maps: MapsConfig
    geocoding: ServiceConfig
    routing: RoutingConfig
    privacy: PrivacyConfig


class ErrorDetail(Model):
    code: str
    message: str
    details: dict | list | None = None


class ErrorResponse(Model):
    error: ErrorDetail
