"""ConversationState: what the bot knows, with provenance, plus the open question. JSON round-trippable."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

PROFILE_FIELDS = ("area", "party_size", "audience", "budget", "start_time", "end_time", "duration_min",
                  "vehicle", "tastes", "max_leg_min")
SOURCES = ("user_said", "ui_form", "inferred", "default", "missing")
MAX_TURNS = 8
MAX_SHORTLIST = 5
MAX_ALLERGIES = 10


@dataclass
class Field_:
    value: Any = None
    source: str = "missing"
    turn: int = 0
    confirmed: bool = False
    scope: Optional[str] = None  # budget scope: per_person|group

    def known(self) -> bool:
        return self.value is not None and self.source != "missing"

    def to_json(self) -> dict:
        out = {"value": self.value, "source": self.source, "turn": self.turn, "confirmed": self.confirmed}
        if self.scope:
            out["scope"] = self.scope
        return out

    @classmethod
    def from_json(cls, data: dict) -> "Field_":
        return cls(data.get("value"), data.get("source", "missing"), int(data.get("turn", 0)),
                   bool(data.get("confirmed", False)), data.get("scope"))


@dataclass
class Allergy:
    term: str
    family: Optional[str] = None
    source: str = "user_said"
    venue_confirmations: list = field(default_factory=list)  # [{"venue_id","text","at"}]

    def to_json(self) -> dict:
        return {"term": self.term, "family": self.family, "source": self.source,
                "venue_confirmations": list(self.venue_confirmations)}

    @classmethod
    def from_json(cls, d: dict) -> "Allergy":
        return cls(d.get("term", ""), d.get("family"), d.get("source", "user_said"), list(d.get("venue_confirmations", [])))


@dataclass
class ShortItem:
    venue_id: str
    status: str = "considering"  # considering|kept
    note: Optional[str] = None

    def to_json(self) -> dict:
        out = {"venue_id": self.venue_id, "status": self.status}
        if self.note:
            out["note"] = self.note
        return out


@dataclass
class Pending:
    pending_id: str
    kind: str  # clarify_slot|clarify_intent|pick_venue|confirm_plan
    options: list = field(default_factory=list)  # [{"option_id","label"}]
    slot: Optional[str] = None  # for clarify_slot: which profile slot(s) the answer fills
    context: dict = field(default_factory=dict)  # private to the engine (e.g. candidate venue ids, original intent)

    def to_json(self, public: bool = True) -> dict:
        out = {"pending_id": self.pending_id, "kind": self.kind, "options": list(self.options)}
        if self.slot:
            out["slot"] = self.slot
        if not public:
            out["context"] = dict(self.context)
        return out

    @classmethod
    def from_json(cls, d: dict) -> "Pending":
        return cls(d["pending_id"], d["kind"], list(d.get("options", [])), d.get("slot"), dict(d.get("context", {})))


@dataclass
class ChatState:
    phase: str = "discover"  # discover|choose|confirm|planned
    profile: dict = field(default_factory=lambda: {k: Field_() for k in PROFILE_FIELDS})
    allergies: list = field(default_factory=list)
    shortlist: list = field(default_factory=list)
    last_results: list = field(default_factory=list)  # [{"label","venue_id"}]
    results_stale: bool = False
    pending: Optional[Pending] = None
    turn_count: int = 0
    turns: list = field(default_factory=list)  # [{"role","text","intent"}] last MAX_TURNS, sanitised
    asked: list = field(default_factory=list)  # [{"slot","turn"}] slot questions already asked (no repeats)
    llm_used: int = 0  # Gemini calls consumed by this session (per-session cap)
    tour_stale: bool = False

    def to_json(self, private: bool = False) -> dict:
        out = {
            "phase": self.phase,
            "profile": {k: self.profile[k].to_json() for k in PROFILE_FIELDS},
            "allergies": [a.to_json() for a in self.allergies],
            "shortlist": [s.to_json() for s in self.shortlist],
            "last_results": list(self.last_results),
            "pending": self.pending.to_json(public=not private) if self.pending else None,
            "turn_count": self.turn_count,
        }
        if private:
            out.update({"results_stale": self.results_stale, "turns": list(self.turns), "asked": list(self.asked),
                        "llm_used": self.llm_used, "tour_stale": self.tour_stale})
        return out

    @classmethod
    def from_json(cls, d: Optional[dict]) -> "ChatState":
        if not d:
            return cls()
        st = cls(phase=d.get("phase", "discover"))
        for k in PROFILE_FIELDS:
            if k in (d.get("profile") or {}):
                st.profile[k] = Field_.from_json(d["profile"][k])
        st.allergies = [Allergy.from_json(a) for a in d.get("allergies", [])]
        st.shortlist = [ShortItem(s["venue_id"], s.get("status", "considering"), s.get("note")) for s in d.get("shortlist", [])]
        st.last_results = list(d.get("last_results", []))
        st.results_stale = bool(d.get("results_stale", False))
        st.pending = Pending.from_json(d["pending"]) if d.get("pending") else None
        st.turn_count = int(d.get("turn_count", 0))
        st.turns = list(d.get("turns", []))[-MAX_TURNS:]
        st.asked = list(d.get("asked", []))
        st.llm_used = int(d.get("llm_used", 0))
        st.tour_stale = bool(d.get("tour_stale", False))
        return st

    # -- helpers used by the engine -------------------------------------------------
    def set_field(self, name: str, value: Any, source: str = "user_said", scope: Optional[str] = None) -> None:
        self.profile[name] = Field_(value, source, self.turn_count, source in ("user_said", "ui_form"), scope)

    def remember(self, role: str, text: str, intent: str = "") -> None:
        self.turns.append({"role": role, "text": text[:300], "intent": intent})
        self.turns = self.turns[-MAX_TURNS:]
