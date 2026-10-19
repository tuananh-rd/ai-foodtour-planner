"""Versioned discovery state stored inside existing bounded session JSON (no DB migration)."""
from dataclasses import dataclass, field
import copy
import json
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
    def from_session(cls, session):
        if session.chat.discovery:
            return cls.restore(session.chat.discovery)
        # Preserve explicit legacy preferences and safety obligations on UI upgrade.
        obj, changes = cls(), {}
        for name in ('party_size', 'start_time', 'end_time', 'duration_min', 'vehicle', 'tastes', 'max_leg_min'):
            old = session.chat.profile.get(name)
            if old and old.source in ('user_said', 'ui_form') and old.value is not None:
                changes[name] = copy.deepcopy(old.value)
        budget = session.chat.profile.get('budget')
        if budget and budget.source in ('user_said', 'ui_form') and budget.value is not None:
            changes.update(budget_vnd=budget.value, budget_scope=budget.scope)
        area = session.chat.profile.get('area')
        if area and area.source in ('user_said', 'ui_form') and isinstance(area.value, dict):
            changes['area'] = area.value.get('label')
            if area.value.get('lat') is not None and area.value.get('lon') is not None:
                changes['origin'] = {'lat': area.value['lat'], 'lon': area.value['lon']}
        changes['allergies'] = list(dict.fromkeys([a.term for a in session.chat.allergies] + list(session.preferences.allergies)))[:10]
        if session.chat.allergy_unresolved and not changes['allergies']:
            changes['allergies'] = ['chưa xác định tác nhân']
        changes['exclusions'] = list(session.preferences.exclusions)[:10]
        obj.patch(changes)
        ids = list(session.tour_selected_ids) or [x.venue_id for x in session.chat.shortlist]
        locks = set(getattr(session.tour, 'locks', ()))
        obj.selection = [{'id': i, 'locked': i in locks} for i in dict.fromkeys(ids)][:5]
        obj.selection_version = 1 if obj.selection else 0
        obj.results = [x.get('venue_id') for x in session.chat.last_results if isinstance(x, dict) and isinstance(x.get('venue_id'), str)][:5]
        for item in session.chat.turns[-8:]:
            obj.remember(item.get('role', 'assistant'), item.get('text', ''))
        # Old confirmations are never transferable to a new contract; old tours remain
        # available only if no unresolved allergy or stale obligation exists.
        obj.tour_stale = bool(session.chat.tour_stale or obj.profile.allergies)
        return obj

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
        result = {**self.__dict__, 'profile': self.profile.model_dump(), 'messages': list(self.messages)}
        # UTF-8 storage budget matters more than character count for Vietnamese.
        # Retain authoritative preferences/selection; trim oldest replay only.
        while result['messages'] and len(json.dumps(result, ensure_ascii=False).encode('utf-8')) > 20000:
            result['messages'].pop(0)
        return result

    def remember(self, role, text):
        # Keep a bounded local replay; credentials and exact coordinates are redacted.
        safe = redact_sensitive(str(text))[:700].encode('utf-8')[:900].decode('utf-8', errors='ignore')
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
