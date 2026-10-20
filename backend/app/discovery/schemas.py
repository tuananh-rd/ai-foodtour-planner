"""Strict tool inputs; no model-supplied authority, prices or route calculations."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.api.schemas import Origin
from app.api.schemas import TourView


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, validate_assignment=True)


class Profile(StrictModel):
    area: str | None = Field(default=None, max_length=120)
    origin: Origin | None = None
    party_size: int | None = Field(default=None, ge=1, le=20)
    budget_vnd: int | None = Field(default=None, gt=0, le=100_000_000)
    budget_scope: Literal['group', 'per_person'] | None = None
    start_time: str | None = Field(default=None, pattern=r'^(?:[01]\d|2[0-3]):[0-5]\d$')
    end_time: str | None = Field(default=None, pattern=r'^(?:[01]\d|2[0-3]):[0-5]\d$')
    duration_min: int | None = Field(default=None, ge=30, le=720)
    vehicle: Literal['walk', 'motorbike', 'car', 'taxi'] | None = None
    tastes: list[str] = Field(default_factory=list, max_length=10)
    foods: list[str] = Field(default_factory=list, max_length=10)
    exclusions: list[str] = Field(default_factory=list, max_length=10)
    allergies: list[str] = Field(default_factory=list, max_length=10)
    max_leg_min: int | None = Field(default=None, ge=3, le=60)

    @model_validator(mode='after')
    def bounded_terms(self):
        for name in ('tastes', 'foods', 'exclusions', 'allergies'):
            limit = 40 if name == 'allergies' else 80
            if any(not x.strip() or len(x) > limit or any(ord(c) < 32 for c in x) for x in getattr(self, name)):
                raise ValueError('invalid preference term')
        return self


class Search(StrictModel):
    dish: str | None = Field(default=None, max_length=80)
    area: str | None = Field(default=None, max_length=120)
    max_price_vnd: int | None = Field(default=None, gt=0, le=100_000_000)


class Details(StrictModel):
    venue_id: str = Field(min_length=1, max_length=200)


class Compare(StrictModel):
    venue_ids: list[str] = Field(min_length=2, max_length=5)


class PreferenceUpdate(StrictModel):
    patch: dict


class SelectionUpdate(StrictModel):
    operation: Literal['add', 'remove', 'lock', 'unlock']
    venue_ids: list[str] = Field(min_length=1, max_length=5)
    selection_version: int = Field(ge=0)


class Empty(StrictModel):
    pass


TOOL_INPUTS = {'search_restaurants': Search, 'get_restaurant_details': Details,
               'compare_restaurants': Compare, 'update_preferences': PreferenceUpdate,
               'update_foodtour_selection': SelectionUpdate, 'create_itinerary': Empty,
               'revise_itinerary': Empty}


class SettingsInput(StrictModel):
    chat_model: str | None = Field(default=None, min_length=3, max_length=64)
    web_search_enabled: bool | None = None

    @model_validator(mode='after')
    def supplied(self):
        if not self.model_fields_set or any(getattr(self, k) is None for k in self.model_fields_set):
            raise ValueError('explicit settings required')
        return self


class LocationInput(StrictModel):
    operation: Literal['resolve', 'choose', 'coordinates', 'clear']
    query: str | None = Field(default=None, min_length=2, max_length=160)
    candidate_id: str | None = Field(default=None, min_length=1, max_length=64)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    source: Literal['gps', 'coordinates'] | None = None

    @model_validator(mode='after')
    def shape(self):
        expected = {'resolve': {'query'}, 'choose': {'candidate_id'},
                    'coordinates': {'lat', 'lon', 'source'}, 'clear': set()}[self.operation]
        if self.model_fields_set - {'operation'} != expected or any(getattr(self, k) is None for k in expected):
            raise ValueError('invalid location action')
        return self


class Action(StrictModel):
    type: Literal['tool', 'confirm', 'settings', 'location']
    name: str | None = None
    arguments: dict = Field(default_factory=dict)
    confirmation_id: str | None = Field(default=None, max_length=100)

    @model_validator(mode='after')
    def valid_action(self):
        if self.type == 'tool':
            if self.name not in TOOL_INPUTS or self.confirmation_id is not None:
                raise ValueError('unknown tool')
            TOOL_INPUTS[self.name].model_validate(self.arguments)
        elif self.type in ('settings', 'location'):
            if self.name is not None or self.confirmation_id is not None:
                raise ValueError('invalid settings/location action')
            (SettingsInput if self.type == 'settings' else LocationInput).model_validate(self.arguments)
        elif self.name is not None or self.arguments or not self.confirmation_id:
            raise ValueError('explicit confirmation ID required')
        return self


class Turn(StrictModel):
    revision: int = Field(ge=0)
    text: str | None = Field(default=None, min_length=1, max_length=1000)
    action: Action | None = None

    @model_validator(mode='after')
    def exactly_one(self):
        if (self.text is None) == (self.action is None) or (self.text is not None and not self.text.strip()):
            raise ValueError('one text or action required')
        return self


class RestaurantPrice(StrictModel):
    min_vnd: int
    max_vnd: int
    semantics: Literal['venue_range']
    evidence: str


class RestaurantHours(StrictModel):
    status: Literal['verified', 'unknown']
    display: str


class RestaurantRating(StrictModel):
    value: float
    count: int | None


class Restaurant(StrictModel):
    id: str
    name: str
    address: str
    district: str
    lat: float | None
    lon: float | None
    dish_tags: list[str]
    price: RestaurantPrice | None
    hours: RestaurantHours | None
    rating: RestaurantRating | None = None
    source_url: str | None
    source_fetched_at: str | None
    unknowns: list[str]
    locked: bool
    label: str | None = None
    distance_m: float | None = None
    distance_source: Literal['haversine'] | None = None
    distance_reason: str | None = None


class Reply(StrictModel):
    text: str
    question: str | None


class Message(StrictModel):
    role: Literal['user', 'assistant']
    text: str


class Confirmation(StrictModel):
    id: str
    profile_version: int
    selection_version: int
    summary: dict
    warnings: list[str]


class Comparison(StrictModel):
    venues: list[Restaurant]
    criteria: list[str]
    unknowns: list[str]


class Source(StrictModel):
    dataset_source: Literal['synthetic', 'private']
    dataset_version: str


class Provider(StrictModel):
    mode: Literal['rules', 'gemini', 'mock']
    calls: int = Field(ge=0, le=2)
    reason: str | None = None
    model: str | None = None


class Diagnostics(StrictModel):
    tool_calls: int = Field(ge=0)
    elapsed_ms: float
    weather: Literal['unavailable']


class AssistantView(StrictModel):
    contract: Literal['discovery-v1']
    session_id: str
    revision: int
    profile_version: int
    selection_version: int
    status: Literal['ok', 'unknown', 'no_results', 'tool_error', 'unavailable', 'no_solution']
    reply: Reply
    profile: Profile
    results: list[Restaurant]
    selection: list[Restaurant]
    comparison: Comparison | None
    confirmation: Confirmation | None
    messages: list[Message]
    tour: TourView | None
    source: Source
    provider: Provider
    diagnostics: Diagnostics
    settings: dict = Field(default_factory=dict)
    location: dict = Field(default_factory=dict)
    web: dict = Field(default_factory=dict)
