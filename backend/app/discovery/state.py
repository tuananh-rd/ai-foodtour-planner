"""Versioned discovery state stored inside existing bounded session JSON (no DB migration)."""
from dataclasses import dataclass, field
import copy
from app.assistant.conversation import redact_sensitive
from .schemas import Profile


@dataclass
class State:
    profile: Profile = field(default_factory=Profile)
    profile_version: int = 0
    selection_version: int = 0
    selection: list = field(default_factory=list)
    results: list = field(default_factory=list)
    comparison: list = field(default_factory=list)
    confirmation: dict | None = None
    messages: list = field(default_factory=list)
    dataset_version: str | None = None
    plan_requested: bool = False
    tour_stale: bool = False
    pending_search: dict | None = None
    pending_slot: str | None = None

    @classmethod
    def restore(cls, raw):
        if not isinstance(raw, dict) or not raw:
            return cls()
        obj = cls(profile=Profile.model_validate(raw.get('profile', {})))
        for key in ('profile_version', 'selection_version'):
            value = raw.get(key, 0)
            if type(value) is not int or not 0 <= value <= 1_000_000:
                raise ValueError('invalid discovery version')
            setattr(obj, key, value)
        obj.selection = copy.deepcopy(raw.get('selection', []))[:5]
        if any(not isinstance(x, dict) or set(x) != {'id', 'locked'} or not isinstance(x['id'], str)
               or len(x['id']) > 200 or type(x['locked']) is not bool for x in obj.selection):
            raise ValueError('invalid selection')
        for key in ('results', 'comparison'):
            value = raw.get(key, [])
            if not isinstance(value, list) or any(not isinstance(x, str) or len(x) > 200 for x in value):
                raise ValueError('invalid result references')
            setattr(obj, key, value[:5])
        obj.confirmation = copy.deepcopy(raw.get('confirmation'))
        obj.messages = [x for x in raw.get('messages', []) if isinstance(x, dict)
                        and x.get('role') in ('user', 'assistant') and isinstance(x.get('text'), str)
                        and len(x['text']) <= 700][-16:]
        obj.dataset_version = raw.get('dataset_version')
        obj.plan_requested = raw.get('plan_requested') is True
        obj.tour_stale = raw.get('tour_stale') is True
        pending = raw.get('pending_search')
        if isinstance(pending, dict):
            from .schemas import Search
            obj.pending_search = Search.model_validate(pending).model_dump()
        if raw.get('pending_slot') in ('origin', 'start_time', 'duration_min', 'vehicle', 'party_size', 'budget_scope'):
            obj.pending_slot = raw['pending_slot']
        return obj

    def dump(self):
        return {**self.__dict__, 'profile': self.profile.model_dump()}

    def remember(self, role, text):
        # Keep a bounded local replay; credentials and exact coordinates are redacted.
        safe = redact_sensitive(str(text))[:700]
        self.messages.append({'role': role, 'text': safe})
        self.messages = self.messages[-16:]

    def invalidate(self):
        self.confirmation = None
        self.tour_stale = True

    def patch(self, changes):
        new = Profile.model_validate({**self.profile.model_dump(), **changes})
        if new != self.profile:
            self.profile = new
            self.profile_version += 1
            self.invalidate()
            return True
        return False
