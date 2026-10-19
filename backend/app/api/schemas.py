"""Contract-v1 HTTP models; domain time is converted only at the boundary."""
from typing import Annotated, Literal
import unicodedata

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.planner.types import Preferences

Evidence = Literal["verified", "estimate", "unknown"]
LegSource = Literal["provider_route", "straight_line_estimate", "unknown"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Origin(Model):
    lat: float = Field(ge=-90, le=90, strict=True)
    lon: float = Field(ge=-180, le=180, strict=True)


class MapsLink(Model):
    index: int = Field(ge=1)
    of: int = Field(ge=1)
    url: str = Field(max_length=2048)
    from_stop: int | None
    to_stop: int
    waypoint_count: int = Field(ge=0, le=3)
    url_length: int = Field(le=2048)
    point_kinds: list[Literal['latlng', 'address']]


class MapsSkippedStop(Model):
    stop_order: int
    venue_id: str
    reason: Literal['no_usable_point', 'url_too_long']


class MapsLinksResponse(Model):
    status: Literal['ok', 'partial', 'unavailable']
    travelmode: Literal['walking', 'driving']
    provider: Literal['google_maps_urls'] = 'google_maps_urls'
    uses_api: Literal[False] = False
    links: list[MapsLink]
    skipped: list[MapsSkippedStop]
    notes: list[str]


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
    meal: Literal["breakfast", "lunch", "snack", "dinner", "late"] | None = None
    audience: Literal["solo", "friends", "family"] | None = None
    interests: list[str] = Field(default_factory=list, max_length=10)
    exclusions: list[str] = Field(default_factory=list, max_length=10)
    allergies: list[Annotated[str, Field(min_length=1, max_length=40)]] = Field(default_factory=list, max_length=10)
    max_leg_min: int = Field(default=20, ge=3, le=60, strict=True)
    max_stops: int = Field(default=3, ge=1, le=5, strict=True)
    mode: Literal["explore", "strict"] = "explore"

    @field_validator('allergies', mode='before')
    @classmethod
    def safe_allergies(cls, value):
        if isinstance(value, list):
            for term in value:
                if isinstance(term, str) and any(unicodedata.category(c) in ('Cc', 'Cf', 'Cs') for c in term):
                    raise ValueError('invalid allergy term')
            return [term.strip() if isinstance(term, str) else term for term in value]
        return value

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
        values["allergies"] = tuple(values["allergies"])
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
            allergies=list(prefs.allergies),
            max_stops=prefs.max_stops, max_leg_min=prefs.max_leg_min, mode=prefs.mode, meal=prefs.meal, audience=prefs.audience,
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


class Rating(Model):
    value: float | None = Field(default=None, ge=0, le=5)
    count: int | None = Field(default=None, ge=0, le=10_000_000)
    source_scale_max: float | None = Field(default=None, gt=0)

    @field_validator('value')
    @classmethod
    def round_value(cls, value):
        return round(value, 2) if value is not None else None


class Amenities(Model):
    yes: list[str] = Field(default_factory=list)
    no: list[str] = Field(default_factory=list)


class MessageBudget(Model):
    limit: int = Field(ge=0)
    remaining: int = Field(ge=0)
    exhausted: bool


class LLMBudget(MessageBudget):
    session_cap: int | None = None
    reserve: int | None = None
    used: int = Field(ge=0)
    resets_at: str
    window: Literal["pacific_midnight"] = "pacific_midnight"


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
    rating: Rating = Field(default_factory=Rating)
    capacity_value: int | None = Field(default=None, ge=1, le=100000, description="theo nguồn")
    prep_time_min: int | None = Field(default=None, ge=0, le=1440, description="theo nguồn")
    prep_time_max: int | None = Field(default=None, ge=0, le=1440, description="theo nguồn")
    rating_quality: float | None = Field(default=None, ge=0, le=5, description="theo nguồn")
    rating_location: float | None = Field(default=None, ge=0, le=5, description="theo nguồn")
    rating_service: float | None = Field(default=None, ge=0, le=5, description="theo nguồn")
    rating_space: float | None = Field(default=None, ge=0, le=5, description="theo nguồn")
    rating_price: float | None = Field(default=None, ge=0, le=5, description="theo nguồn")
    suitable_meals: list[str] = Field(default_factory=list)
    audiences: list[str] = Field(default_factory=list)
    cuisine_styles: list[str] = Field(default_factory=list)
    amenities: Amenities = Field(default_factory=Amenities)
    source_fetched_at: str | None = None
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


class WhyReason(Model):
    code: Literal["match_interest", "near_origin", "short_walk", "well_rated", "fits_meal", "diverse"]
    text: str


class StopView(Model):
    why: list[WhyReason] = Field(default_factory=list)
    venue: VenueView | None = None
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
    chat: dict | None = None
    preferences: PreferencesSchema
    missing_slots: list[str]
    questions: list[str]
    notes: list[str] = Field(default_factory=list)
    tour: TourView | None
    revision: int
    dataset_source: Literal["private", "synthetic"]
    dataset_version: str
    extraction_source: Literal["rules", "llm", "cache"] | None = None
    llm_calls: Literal[0, 1] = 0
    llm_budget: MessageBudget | None = None


class EvidenceOverlayCounts(Model):
    entries_loaded: int = Field(default=0, ge=0)
    entries_rejected: int = Field(default=0, ge=0)
    hours_verified: int = Field(default=0, ge=0)
    prices_verified: int = Field(default=0, ge=0)


class GeocodingHealth(Model):
    status: Literal['ready', 'unavailable']
    last_error: str | None = None


class RankingHealth(Model):
    quality_weight: float = Field(ge=0)


class Health(Model):
    build_commit: str | None = Field(default=None, pattern=r'^[a-f0-9]{7,40}$')
    assistant_provider: Literal['gemini', 'rules'] = 'rules'
    web_search_configured: bool = False
    ranking: RankingHealth
    llm_budget: LLMBudget | None = None
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


class FeaturesConfig(Model):
    ui_v2: bool
    chat_v2: bool = False
    guided_ui: bool = False


class ClientConfig(Model):
    features: FeaturesConfig
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


class ChatInput(Model):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)

    @model_validator(mode="before")
    @classmethod
    def safe_strings(cls, value):
        def visit(node):
            if isinstance(node, str) and any(unicodedata.category(c) in ('Cc', 'Cf', 'Cs') for c in node):
                raise ValueError('invalid characters')
            if isinstance(node, dict):
                for key, item in node.items():
                    visit(key)
                    visit(item)
            elif isinstance(node, list):
                for item in node:
                    visit(item)
        visit(value)
        return value


class ChatPatch(ChatInput):
    party_size: int | None = Field(default=None, ge=1, le=20)
    budget_vnd: int | None = Field(default=None, gt=0)
    budget_scope: Literal['per_person', 'group'] | None = None
    start_time: str | None = Field(default=None, pattern=r'^(?:[01]\d|2[0-3]):[0-5]\d$')
    end_time: str | None = Field(default=None, pattern=r'^(?:[01]\d|2[0-3]):[0-5]\d$')
    duration_min: int | None = Field(default=None, ge=30, le=720)
    vehicle: Literal['walk', 'motorbike', 'car', 'taxi'] | None = None
    max_leg_min: int | None = Field(default=None, ge=3, le=60)
    audience: Literal['solo', 'friends', 'family'] | None = None

    @model_validator(mode='before')
    @classmethod
    def no_null_values(cls, value):
        if isinstance(value, dict) and any(v is None for v in value.values()):
            raise ValueError('patch values must have their declared type')
        return value


class ChatLocation(ChatInput):
    district: str | None = Field(default=None, max_length=60)
    label: str | None = Field(default=None, max_length=60)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)


Criterion = Literal['distance', 'price', 'rating', 'audience', 'meal', 'parking_car', 'outdoor', 'capacity', 'prep_time', 'hours', 'quiet', 'crowd', 'elderly']
ChatID = Annotated[str, Field(min_length=1, max_length=64)]


class Action(ChatInput):
    type: Literal['add', 'remove', 'keep', 'compare', 'pick_option', 'confirm_yes', 'confirm_no', 'edit_profile', 'set_location', 'request_plan', 'search']
    venue_id: ChatID | None = None
    venue_ids: list[ChatID] | None = Field(default=None, max_length=4)
    option_id: ChatID | None = None
    criteria: list[Criterion] | None = Field(default=None, max_length=3)
    patch: ChatPatch | None = None
    location: ChatLocation | None = None
    query: str | None = Field(default=None, max_length=200)


class ChatRequest(ChatInput):
    text: str | None = Field(default=None, min_length=1, max_length=1000)
    action: Action | None = None
    revision: int = Field(ge=0)
    web_search: bool = Field(default=False, strict=True)

    @model_validator(mode='after')
    def exclusive(self):
        if (self.text is None) == (self.action is None):
            raise ValueError('exactly one text/action required')
        if self.web_search and self.action is not None:
            raise ValueError('web search requires an explicit text query')
        return self


class TextBlock(Model):
    type: Literal['text']
    text: str


class NoticeBlock(Model):
    type: Literal['notice']
    level: Literal['info', 'warning', 'safety']
    code: str
    text: str


class DishSuggestion(Model):
    dish_group: str
    blurb: str
    venue_count: int | None
    radius_m: int
    kind: Literal['general_knowledge']


class DishSuggestionsBlock(Model):
    type: Literal['dish_suggestions']
    items: list[DishSuggestion]


class CodeText(Model):
    code: str
    text: str


class ChatVenue(Model):
    id: str
    name: str
    district: str
    address: str
    dish_tags: list[str]
    price: Price | None
    hours: Hours | None
    rating: Rating | None


class VenueCard(Model):
    label: str
    venue: ChatVenue
    distance_m: int | None
    distance_source: Literal['straight_line_estimate', 'unknown']
    why: list[CodeText]
    flags: list[CodeText]
    in_shortlist: bool


class VenueCardsBlock(Model):
    type: Literal['venue_cards']
    title: str | None = None
    cards: list[VenueCard]


class CompareCriterion(Model):
    id: str
    label: str


class CompareColumn(Model):
    label: str
    venue_id: str
    name: str


class CompareCell(Model):
    value: str | None
    status: Literal['source', 'estimate', 'unknown']
    note: str | None = None


class CompareRow(Model):
    criterion_id: str
    cells: list[CompareCell]


class UnsupportedCriterion(Model):
    criterion: str
    text: str


class CompareTableBlock(Model):
    type: Literal['compare_table']
    criteria: list[CompareCriterion]
    columns: list[CompareColumn]
    rows: list[CompareRow]
    unsupported: list[UnsupportedCriterion]


class ChatOption(Model):
    option_id: str
    label: str


class ClarifyBlock(Model):
    model_config = ConfigDict(extra='allow')
    type: Literal['clarify']
    pending_id: str
    question: str
    options: list[ChatOption] = Field(max_length=8)
    slot: str | None = None
    free_text: bool | None = None


class SummaryItem(Model):
    id: str
    label: str
    value: str | None
    status: Literal['user', 'inferred', 'default', 'missing']
    editable: bool


class SummaryVenue(Model):
    venue_id: str
    name: str
    status: Literal['considering', 'kept']


class ConfirmSummaryBlock(Model):
    type: Literal['confirm_summary']
    items: list[SummaryItem]
    shortlist: list[SummaryVenue]
    missing: list[str]
    warnings: list[CodeText]


class TourReadyBlock(Model):
    type: Literal['tour_ready']
    revision: int


class UnderstoodItem(Model):
    model_config = ConfigDict(extra='allow')
    id: Literal['allergy', 'dish', 'stops', 'day_part', 'budget', 'budget_scope', 'duration', 'leg_time', 'party', 'area', 'time', 'vehicle']
    label: str
    value: str | None
    status: Literal['user', 'ai', 'inferred', 'missing']
    editable: bool


class UnderstoodAllergy(Model):
    model_config = ConfigDict(extra='allow')
    term: str
    family: str | None
    status: Literal['user', 'ai_unconfirmed']


class UnderstoodBlock(Model):
    model_config = ConfigDict(extra='allow')
    type: Literal['understood']
    items: list[UnderstoodItem]
    allergies: list[UnderstoodAllergy]
    style_note: str | None = None


class WebSource(Model):
    title: str = Field(max_length=160)
    url: str = Field(max_length=2048)
    snippet: str = Field(max_length=500)

    @field_validator('url')
    @classmethod
    def public_source_url(cls, value):
        import ipaddress
        from urllib.parse import urlsplit
        if any(ord(char) <= 32 or ord(char) == 127 for char in value) or '\\' in value:
            raise ValueError('invalid source URL')
        try:
            parts = urlsplit(value)
            host = parts.hostname or ''
            if (parts.scheme != 'https' or not host or parts.username or parts.password or parts.port not in (None, 443)
                    or host == 'localhost' or host.endswith(('.localhost', '.local', '.internal', '.lan'))):
                raise ValueError('invalid source URL')
            try:
                address = ipaddress.ip_address(host)
            except ValueError:
                if '.' not in host or any(not (char.isalnum() or char in '.-') for char in host):
                    raise ValueError('invalid source host')
            else:
                if not address.is_global:
                    raise ValueError('private source URL')
        except (ValueError, TypeError):
            raise ValueError('invalid source URL') from None
        return value


class WebSearchBlock(Model):
    type: Literal['web_search']
    status: Literal['ok', 'disabled', 'unavailable', 'quota', 'rejected']
    sources: list[WebSource] = Field(max_length=3)
    fetched_at: str | None
    credits: Literal[0, 1]
    cached: bool


Block = Annotated[TextBlock | NoticeBlock | DishSuggestionsBlock | VenueCardsBlock | CompareTableBlock | ClarifyBlock | ConfirmSummaryBlock | TourReadyBlock | UnderstoodBlock | WebSearchBlock, Field(discriminator='type')]


class ChatReply(Model):
    blocks: list[Annotated[Block | dict, Field(union_mode='left_to_right')]]


class CoverageSignal(Model):
    kind: Literal['allergy', 'dish', 'stops', 'day_part', 'budget', 'budget_scope', 'duration', 'leg_time', 'party', 'area', 'time', 'vehicle']
    status: Literal['captured', 'uncovered', 'asked']


class TurnCoverage(Model):
    signals: list[CoverageSignal]
    complete: bool


class TurnBudget(Model):
    session_used: int = Field(ge=0, le=2**31-1)
    session_cap: int = Field(ge=0, le=2**31-1)
    daily_remaining_public: Literal['ok', 'low', 'exhausted', 'unavailable']


class ChatTurnInfo(Model):
    intent: str
    tools: list[str]
    understanding: Literal['rules', 'llm', 'cache', 'action']
    trigger_reason: Literal['low_conf', 'uncovered', 'multi_clause', 'conflict'] | None = None
    coverage: TurnCoverage | None = None
    llm_calls: Literal[0, 1] | None = None
    llm_budget: TurnBudget | None = None


class AssistantStatus(Model):
    status: Literal['ok', 'disabled', 'unavailable', 'quota', 'rejected', 'skipped']
    provider: str
    llm_calls: Literal[0, 1] = 0


class ChatTurn(SessionView):
    chat: dict
    reply: ChatReply
    turn: ChatTurnInfo
    assistant: AssistantStatus | None = None
