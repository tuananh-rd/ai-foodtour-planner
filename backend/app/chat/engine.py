"""Conversation engine: one deterministic reducer per user turn (contract v1.8).

handle(state, prefs, text|action) -> TurnResult. The engine never calls the planner or a provider itself: it returns
`plan_request` when (and only when) the user confirmed a `confirm_plan` pending, and asks an optional `llm` callable to
understand low-confidence text. Every fact in a reply comes from `tools`; missing data is "Chưa rõ".
"""
from __future__ import annotations

import copy
import re
from types import SimpleNamespace
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Callable, Optional

from app.llm import safety_parse
from app.planner import allergens
from app.planner.relevance import fold_uncached
from app.planner.types import Preferences
from . import coverage, knowledge, tools
from .gazetteer import Gazetteer, Place
from .state import (MAX_ALLERGIES, MAX_SHORTLIST, Allergy, ChatState, Field_, Pending, ShortItem)
from .understand import CONFIDENT, Understanding, effective_text, is_third_party, understand

ALLERGY_CHIPS = {"peanut": "đậu phộng", "seafood": "hải sản", "milk": "sữa", "egg": "trứng", "gluten": "gluten", "soy": "đậu nành", "sesame": "mè"}
LABEL_OF = {"peanut": "Đậu phộng", "seafood": "Hải sản", "milk": "Sữa", "egg": "Trứng", "gluten": "Gluten", "soy": "Đậu nành", "sesame": "Mè", "other": "Khác"}
SLOT_KEYS = ("party_size", "budget_vnd", "budget_scope", "start_time", "end_time", "duration_min", "vehicle", "max_leg_min", "audience")
SLOT_SWEEP_INTENTS = frozenset({"SET_ALLERGY", "REQUEST_PLAN", "SEARCH_VENUES", "DISCOVER_DISH", "SET_AVOID", "GREET_OR_SMALLTALK", "ASK_DETAIL", "UPDATE_PROFILE"})
SYMPTOM_WORDS = frozenset({"ngứa", "họng", "mẩn", "phát", "sưng", "đau", "bụng", "nôn", "tiêu", "chảy", "thở", "mề", "đay", "ho", "mũi", "khó", "chóng", "ngạt"})  # accent-sensitive: "đậu" is a bean, "đau" is pain
PASSIVE = frozenset({"ANSWER_PENDING", "CONFIRM_YES", "CONFIRM_NO", "AMBIGUOUS_ACK", "GREET_OR_SMALLTALK", "UNSAFE", "OUT_OF_SCOPE",
                     "UNKNOWN", "ADD", "REMOVE", "KEEP", "COMPARE", "ASK_DETAIL", "MODIFY_PLAN"})
LOW_CONFIDENCE = 0.55  # below this and no LLM: ask instead of guessing
VEHICLES = {"walk": "đi bộ", "motorbike": "xe máy", "car": "ô tô", "taxi": "taxi/Grab"}
NO_WEATHER = "Mình chưa có dữ liệu thời tiết nên không nhận định nhiệt độ hay mưa nắng; mình chỉ dựa vào điều bạn nói."
SAFETY_LINE = ("Dữ liệu quán không có thông tin nguyên liệu nên mình chỉ loại các quán có tên/nhóm món liên quan; "
               "không quán nào được xác nhận an toàn — hãy hỏi quán trước khi ăn.")


@dataclass
class TurnResult:
    state: ChatState
    prefs: Preferences
    blocks: list
    intent: str
    tools: list = field(default_factory=list)
    understanding: str = "rules"
    plan_request: Optional[dict] = None
    replace_request: Optional[dict] = None  # {"refs": [...]}: the API layer resolves tour stops and calls the planner
    llm_calls: int = 0
    error: Optional[str] = None
    trigger_reason: Optional[str] = None  # null | low_conf | uncovered | multi_clause | conflict (contract v1.9)
    coverage: list = field(default_factory=list)


def text_b(t): return {"type": "text", "text": t}
def notice_b(level, code, t): return {"type": "notice", "level": level, "code": code, "text": t}


class ChatEngine:
    def __init__(self, venues, gazetteer: Optional[Gazetteer] = None, guided: bool = False):
        self.guided = guided  # contract v1.9 behaviours (coverage audit, guided questions); off = v1.8 behaviour
        self.venues = list(venues)
        self.by_id = {v.id: v for v in self.venues}
        self.gz = gazetteer or Gazetteer(self.venues)

    # ------------------------------------------------------------------ public
    def handle(self, state: ChatState, prefs: Preferences, *, text: Optional[str] = None, action: Optional[dict] = None,
               llm: Optional[Callable] = None, llm_status: Optional[str] = None) -> TurnResult:
        st = copy.deepcopy(state)
        st.turn_count += 1
        self._sync_from_prefs(st, prefs)
        R = TurnResult(st, prefs, [], "UNKNOWN")
        snap0 = self._snapshot(st)
        if action:
            u = self._action_understanding(action, st)
            R.understanding = "action"
            if u is None:
                R.error = "invalid_action"
                return R
        else:
            u = understand(text or "", st, self.gz, prefs, self.guided)
            if self.guided and u.intent == "UNKNOWN" and u.source == "rules" and not st.pending and any(k in u.patch for k in ("stops", "day_part", "interests", "duration_min", "max_leg_min", "party_size", "budget_vnd", "start_time", "end_time", "vehicle")):
                u = Understanding("UPDATE_PROFILE", u.patch, [], 0.8)  # "Muốn ăn tour tối nay": slots only, nothing to ask about the intent
            if self.guided:
                R.coverage = self._signals(text or "", u, st)
            reason = "low_conf" if u.confidence < CONFIDENT else (
                (coverage.trigger(R.coverage) or ("multi_clause" if coverage.multi_clause(R.coverage) else None))
                if self.guided and u.intent not in PASSIVE else None)
            R.trigger_reason = reason
            if reason and llm is not None:
                out = llm(text or "", self.compact(st), st.llm_used)  # app.chat.llm_understand.Outcome
                if out is None or not hasattr(out, "calls"):
                    out = SimpleNamespace(data=None, calls=0, status="error")  # a misbehaving callable must degrade to rules
                R.llm_calls = out.calls
                st.llm_used += out.calls
                llm_status = out.status or llm_status
                cand = self._from_llm(out.data, st) if out.data else None
                if self.guided and not cand and reason != "low_conf":
                    R.blocks.append(notice_b("info", "llm_unavailable", "Mình đang đọc yêu cầu theo cách đơn giản nên có thể sót ý; bạn kiểm tra giúp phần \"Mình hiểu là…\" nhé."))
                if cand:
                    R.understanding = "cache" if out.calls == 0 else "llm"
                    u = self._merge(u, cand, R, text or "") if self.guided else cand
            elif reason in ("uncovered", "multi_clause") and self.guided:
                R.blocks.append(notice_b("info", "llm_unavailable", "Mình đang đọc yêu cầu theo cách đơn giản nên có thể sót ý; bạn kiểm tra giúp phần \"Mình hiểu là…\" nhé."))
            if u.intent == "UNKNOWN" and not st.pending:
                u = self._fragment(text or "", st, u)  # dish-name-only / "A thôi"-style fragments
            st.remember("user", text or "", u.intent)
            if u.source == "rules" and u.confidence < LOW_CONFIDENCE:
                R.intent = "UNKNOWN"
                self._low_confidence(R, u, llm_status)
                return self._finish(R)
        R.intent = u.intent
        pend0 = st.pending
        self._dispatch(R, u)
        if self.guided:
            self._guided_after(R, u, snap0, text or "")
        if pend0 is not None and R.state.pending is pend0 and "nudge" not in R.tools and R.intent not in ("ANSWER_PENDING", "AMBIGUOUS_ACK", "CONFIRM_YES", "CONFIRM_NO"):
            # The user moved on: a stale question must not linger (confirm_plan survives plain profile edits only).
            if not (pend0.kind == "confirm_plan" and R.intent in ("UPDATE_PROFILE", "ASK_DETAIL")):
                R.state.pending = None
        return self._finish(R)

    def _finish(self, R: TurnResult) -> TurnResult:
        R.prefs = self._to_prefs(R.state, R.prefs)
        if self.guided:
            cl = [b for b in R.blocks if b["type"] == "clarify"]
            if len(cl) > 1:  # contract v1.9: one question per reply - keep the one that matches the open pending
                keep = next((b for b in cl if R.state.pending and b.get("pending_id") == R.state.pending.pending_id), cl[-1])
                R.blocks = [b for b in R.blocks if b["type"] != "clarify" or b is keep]
        R.state.remember("assistant", " ".join(b.get("text", "") for b in R.blocks if b["type"] == "text")[:200], R.intent)
        R.state.phase = self._phase(R.state, R.plan_request)
        return R

    def compact(self, st: ChatState) -> dict:
        """Privacy-minimal state for an LLM call: no names, coordinates, addresses or free text history."""
        return {"phase": st.phase, "pending": st.pending.kind if st.pending else None,
                "known": [k for k, f in st.profile.items() if f.known()], "results": len(st.last_results),
                "shortlist": len(st.shortlist), "has_allergy": bool(st.allergies)}

    # ------------------------------------------------------------------ state <-> preferences
    def _sync_from_prefs(self, st: ChatState, p: Preferences) -> None:
        """Form edits (PUT /preferences) win: record them as `ui_form` when they differ from the profile."""
        def upd(name, value, scope=None):
            cur = st.profile[name]
            if value is not None and (cur.value != value or (scope and cur.scope != scope)):
                st.set_field(name, value, "ui_form", scope)
        upd("party_size", p.party_size)
        if p.budget_vnd is not None:
            upd("budget", p.budget_vnd, p.budget_scope)
        if p.start_time_min is not None:
            upd("start_time", f"{p.start_time_min // 60:02d}:{p.start_time_min % 60:02d}")
        if p.duration_min is not None and not st.profile["end_time"].known():
            upd("duration_min", p.duration_min)
        upd("audience", p.audience)
        if p.max_stops != 3:
            upd("stops", p.max_stops)
        if p.max_leg_min != 20:
            upd("max_leg_min", p.max_leg_min)
        if p.origin and (not st.profile["area"].known() or
                         (st.profile["area"].source == "ui_form" or not self._same_point(st.profile["area"].value, p.origin))):
            if not st.profile["area"].known() or not self._same_point(st.profile["area"].value, p.origin):
                kind = {"current_location": "geolocation", "landmark": "landmark", "place": "district"}.get(p.origin_source or "", "coordinates")
                st.set_field("area", {"kind": kind, "label": p.origin_label or "Điểm xuất phát", "lat": p.origin[0], "lon": p.origin[1],
                                      "district": None}, "ui_form")
        known = {fold_uncached(a.term) for a in st.allergies}
        for term in p.allergies:
            if fold_uncached(term) not in known and len(st.allergies) < MAX_ALLERGIES:
                st.allergies.append(Allergy(term, allergens.family_of(term), "ui_form"))

    @staticmethod
    def _same_point(area, origin) -> bool:
        return bool(area) and abs(area.get("lat", 0) - origin[0]) < 1e-6 and abs(area.get("lon", 0) - origin[1]) < 1e-6

    def _to_prefs(self, st: ChatState, p: Preferences) -> Preferences:
        a = st.profile["area"].value
        kw = {}
        if a:
            kw["origin"] = (a["lat"], a["lon"])
            kw["origin_label"] = (a.get("label") or "")[:120] or None
            kw["origin_source"] = {"landmark": "landmark", "geolocation": "current_location", "coordinates": "manual_coordinates"}.get(a.get("kind"), "place")
        if st.profile["party_size"].known():
            kw["party_size"] = st.profile["party_size"].value
        b = st.profile["budget"]
        if b.known():
            kw["budget_vnd"], kw["budget_scope"] = b.value, b.scope
        s, e = st.profile["start_time"], st.profile["end_time"]
        if s.known():
            kw["start_time_min"] = int(s.value[:2]) * 60 + int(s.value[3:])
        if s.known() and e.known():
            d = (int(e.value[:2]) * 60 + int(e.value[3:])) - kw["start_time_min"]
            if 30 <= d <= 720:
                kw["duration_min"] = d
        elif st.profile["duration_min"].known():
            kw["duration_min"] = st.profile["duration_min"].value
        if st.profile["audience"].known():
            kw["audience"] = st.profile["audience"].value
        if st.profile["max_leg_min"].known():
            kw["max_leg_min"] = st.profile["max_leg_min"].value
        if st.profile["stops"].known():
            kw["max_stops"] = st.profile["stops"].value
        if st.profile["day_part"].known():
            if p.meal is None:
                kw["meal"] = coverage.MEAL_OF.get(st.profile["day_part"].value)
        kw["allergies"] = tuple(a_.term for a_ in st.allergies)
        return replace(p, **kw)

    # ------------------------------------------------------------------ actions -> understanding
    def _action_understanding(self, a: dict, st: ChatState) -> Optional[Understanding]:
        t = a.get("type")
        refs = [a["venue_id"]] if a.get("venue_id") else list(a.get("venue_ids") or [])
        refs = [f"id:{r}" for r in refs]
        if t in ("add", "remove", "keep"):
            if not refs:
                return None
            return Understanding(t.upper(), {}, refs, 1.0, "action")
        if t == "compare":
            return Understanding("COMPARE", {"criteria": list(a.get("criteria") or [])}, refs, 1.0, "action")
        if t == "pick_option":
            if not a.get("option_id") or not st.pending:
                return Understanding("AMBIGUOUS_ACK", {}, [], 1.0, "action") if not st.pending else None
            oid = a["option_id"]
            if oid not in {o["option_id"] for o in st.pending.options}:
                return Understanding("ANSWER_PENDING", {"option": None}, [], 1.0, "action", {"stale_option": True})
            if st.pending.kind == "confirm_plan":  # only an explicit confirm_yes can ever plan
                if oid == "confirm_yes":
                    return Understanding("CONFIRM_YES", {}, [], 1.0, "action")
                if oid == "confirm_no":
                    return Understanding("CONFIRM_NO", {}, [], 1.0, "action")
            return Understanding("ANSWER_PENDING", {"option": oid}, [], 1.0, "action")
        if t in ("confirm_yes", "confirm_no"):
            return Understanding(t.upper(), {}, [], 1.0, "action")
        if t == "set_location":
            loc = a.get("location") or {}
            return Understanding("UPDATE_PROFILE", {"location": loc}, [], 1.0, "action")
        if t == "edit_profile":
            patch = {k: v for k, v in (a.get("patch") or {}).items() if k in
                     ("party_size", "budget_vnd", "budget_scope", "start_time", "end_time", "duration_min", "vehicle", "max_leg_min", "audience")}
            ranges = {"party_size": (1, 20), "budget_vnd": (1, 100_000_000), "duration_min": (30, 720), "max_leg_min": (3, 60)}
            for k, (lo, hi) in ranges.items():
                if k in patch and not (isinstance(patch[k], int) and not isinstance(patch[k], bool) and lo <= patch[k] <= hi):
                    return None  # same bounds as llm_understand.RANGES: a direct action cannot widen what text/LLM may set
            return Understanding("UPDATE_PROFILE", patch, [], 1.0, "action") if patch else None
        if t == "request_plan":
            return Understanding("REQUEST_PLAN", {}, [], 1.0, "action")
        if t == "search":
            q = (a.get("query") or "").strip()[:200]
            return Understanding("SEARCH_VENUES", {"dish": q} if q else {}, [], 1.0, "action")
        return None

    def _fragment(self, text: str, st: ChatState, u: Understanding) -> Understanding:
        """A very short message that is just a dish present in the data ("Chả cá") means a search for it."""
        f = fold_uncached(text)
        words = f.split()
        if 1 <= len(words) <= 3 and not any(c.isdigit() for c in f):
            phrase = " ".join(words)
            if any(tools.matches(v, (phrase,)) for v in self.venues):
                return Understanding("SEARCH_VENUES", {"dish": text.strip()[:40]}, [], 0.7)
        return u

    def _nudge(self, R, prefix=""):
        """Help answering the open question without repeating it (wording alternates, buttons stay in the earlier block)."""
        st = R.state
        p = st.pending
        n = sum(1 for a in st.asked if a.get("pending_id") == p.pending_id)
        st.asked.append({"pending_id": p.pending_id, "turn": st.turn_count})
        st.asked = st.asked[-20:]
        labels = ", ".join(o["label"] for o in p.options[:4])
        if p.slot == "area":
            tail = (["Nếu chưa chắc, cứ chọn một quận gần bạn (" + labels + ") hoặc bấm \"Dùng vị trí của tôi\"; sau này sửa được.",
                     "Mình cần một khu vực để đo khoảng cách. Bạn có thể gõ tên quận/đường hoặc nói \"gợi ý món\" để xem món trước, chưa cần vị trí."][n % 2])
        elif p.options:
            tail = ["Bạn bấm một lựa chọn ở trên (" + labels + ") hoặc gõ câu trả lời ngắn.",
                    "Chưa rõ câu trả lời của bạn với câu hỏi trước; chọn một trong: " + labels + "."][n % 2]
        else:
            tail = ["Bạn trả lời ngắn câu hỏi ở trên giúp mình nhé.", "Mình vẫn đang chờ câu trả lời cho câu hỏi trước."][n % 2]
        R.blocks.append(text_b(prefix + tail))
        R.tools.append("nudge")

    def _low_confidence(self, R, u, llm_status):
        st = R.state
        why = ""
        if llm_status == "exhausted":
            why = "AI hết lượt hôm nay nên mình chưa đọc hiểu được câu dài; "
        elif llm_status == "capped":
            why = "Phiên này đã dùng hết lượt AI; "
        if st.pending:
            # A question is already open: never replace or repeat it, help the user answer it instead.
            self._nudge(R, why)
            return
        self._set_pending(st, "clarify_intent", [{"option_id": "search", "label": "Tìm quán"}, {"option_id": "discover", "label": "Gợi ý món"},
                                                 {"option_id": "plan", "label": "Lập lịch trình"}], None, {})
        R.blocks.append(text_b(why + "Mình chưa chắc hiểu đúng ý bạn trong câu này, nên mình hỏi lại thay vì đoán. "
                               "Bạn bấm một lựa chọn hoặc chia nhỏ yêu cầu giúp mình nhé."))
        R.blocks.append(self._clarify_block(st, "Bạn muốn mình làm gì trước?"))
        R.tools.append("clarify")

    def _from_llm(self, data: dict, st: Optional[ChatState] = None) -> Optional[Understanding]:
        """`data` was already whitelisted/range-checked by llm_understand.sanitize; map it to an Understanding."""
        intent = data.get("intent")
        if st is not None:  # state-dependent intents are only valid in the matching state
            if intent == "MODIFY_PLAN" and st.phase != "planned":
                return None
            if intent in ("CONFIRM_YES", "CONFIRM_NO") and not (st.pending and st.pending.kind == "confirm_plan"):
                return None
            if intent == "ANSWER_PENDING" and not st.pending:
                return None
        patch = dict(data.get("patch") or {})
        extra = {}
        terms = patch.pop("allergy", None)
        if terms and intent not in ("SET_ALLERGY", "SET_AVOID"):
            extra["llm_allergy"] = list(terms)  # kept for the guided merge (never recorded directly)
        if intent in ("SET_ALLERGY", "SET_AVOID") and terms:
            sp = safety_parse.SafetyParse(mentioned=True)
            (sp.allergies if intent == "SET_ALLERGY" else sp.avoid).extend(terms)
            extra["safety"] = sp
        elif intent in ("SET_ALLERGY", "SET_AVOID"):
            return None  # an allergy statement without a concrete term is never guessed
        return Understanding(intent, patch, list(data.get("refs") or []), 0.8, "llm", extra)

    # ------------------------------------------------------------------ dispatch
    def _dispatch(self, R: TurnResult, u: Understanding) -> None:
        st = R.state
        h = getattr(self, "_do_" + u.intent.lower(), None)
        if h is None:
            self._do_unknown(R, u)
            return
        h(R, u)

    # ------------------------------------------------------------------ guided flow (contract v1.9)
    def _signals(self, text: str, u: Understanding, st: ChatState) -> list:
        eff = effective_text(text)
        f = fold_uncached(eff)
        sp = u.extra.get("safety") or safety_parse.parse(eff)
        patch = dict(u.patch)
        patch.update(coverage.extras(eff, f))
        return coverage.audit(eff, f, patch, allergy_terms=sp.allergies, allergy_negated=sp.negated or bool(sp.removed),
                              has_budget=st.profile["budget"].known(), has_party=st.profile["party_size"].known())

    def _merge(self, rules: Understanding, cand: Understanding, R, text: str = "") -> Understanding:
        """Rules stay in charge of what they captured. The LLM may add what they missed; numbers/times/money that disagree
        are asked, never picked silently; allergy terms are unioned and the LLM-only ones need the user's confirmation."""
        if rules.confidence < CONFIDENT:
            base = cand
        else:
            base = Understanding(rules.intent, dict(rules.patch), list(rules.refs), rules.confidence, rules.source, dict(rules.extra))
            for k, v in cand.patch.items():
                if k not in base.patch:
                    base.patch[k] = v
        f = fold_uncached(effective_text(text))
        clock = r"\d{1,2}\s*(?:h|gio|:)\s*(?:\d{2}|ruoi)?"
        grounded = {"budget_scope": r"moi nguoi|dau nguoi|ca nhom|theo nhom|theo nguoi|\bchung\s+(?:tien|ngan sach|\d)|mot nguoi|ca ban|ca hoi|tong\s+(?:ngan sach|cong|so tien|chi)|tong\s+\d[\d.,]*\s*(?:k\b|nghin|ngan|trieu|tr\b|d\b|dong)",
                    "start_time": clock, "end_time": r"(?:ket thuc|xong|ve truoc|truoc luc|truoc|den|toi)\s*(?:luc\s*)?" + clock}
        for k, rx in grounded.items():
            if k not in rules.patch and k in base.patch and not re.search(rx, f):
                base.patch.pop(k, None)  # the model may not decide what the user never said (contract v1.9 rule 4)
        base.extra["ai_keys"] = [k for k in base.patch if k not in rules.patch and k not in ("area", "location", "option", "refs")]
        conflicts = {}
        for k in ("party_size", "budget_vnd", "duration_min", "start_time", "end_time", "stops", "max_leg_min"):
            if k in rules.patch and k in cand.patch and rules.patch[k] != cand.patch[k]:
                conflicts[k] = (rules.patch[k], cand.patch[k])
                base.patch.pop(k, None)
        if conflicts:
            base.extra["conflicts"] = conflicts
            R.trigger_reason = "conflict"
        rs, cs = rules.extra.get("safety"), cand.extra.get("safety")
        known = {fold_uncached(t) for t in (rs.allergies if rs is not None else [])}
        cterms = list(cs.allergies if cs is not None else []) + list(cand.extra.get("llm_allergy") or [])
        fresh = [t for t in dict.fromkeys(cterms) if fold_uncached(t) not in known and not SYMPTOM_WORDS & set(t.casefold().split()) and self._concrete(t)]  # a symptom or a description is not a food
        if rs is not None:
            base.extra["safety"] = rs  # the rules' own parse stays authoritative
        else:
            base.extra.pop("safety", None)  # an LLM-only allergy is never recorded as the user's word
            if base.intent == "SET_ALLERGY":
                base.extra["safety"] = safety_parse.SafetyParse(mentioned=True)
        base.extra.pop("llm_allergy", None)
        if fresh:
            base.extra["ai_allergies"] = fresh
        return base

    @staticmethod
    def _concrete(term: str) -> bool:
        """A model-proposed allergen must be a named food: lexicon hit, or a short phrase without vague/descriptive words."""
        if allergens.family_of(term) and allergens.core_term(term) == term:
            return True
        words = [fold_uncached(w) for w in term.split()]
        return 0 < len(words) <= 2 and not (safety_parse._VAGUE & set(words)) and words[0] != "co"

    def _snapshot(self, st: ChatState) -> str:
        return repr(sorted((k, repr(f.value), f.scope) for k, f in st.profile.items())) + repr(sorted(a.term for a in st.allergies)) + repr(len(st.shortlist))

    def _guided_after(self, R, u: Understanding, snap0: str, text: str) -> None:
        """After the intent handler ran: apply the slots it ignores, add LLM-only allergies, then ask ONE next thing."""
        st = R.state
        extra_keys = {k: v for k, v in u.patch.items() if k in ("stops", "day_part", "interests", "_stops_rejected")}
        if R.intent in SLOT_SWEEP_INTENTS:  # slot extraction does not depend on how the sentence was classified ("…được không?" is still a request)
            slot_keys = {k: v for k, v in u.patch.items() if k in SLOT_KEYS}
            if R.intent in ("SEARCH_VENUES", "DISCOVER_DISH") and not any(k in u.patch for k in ("stops", "duration_min", "party_size", "budget_scope")):
                slot_keys.pop("budget_vnd", None)  # "quán phở dưới 50k" is a price cap for the search, not the tour budget
                slot_keys.pop("budget_scope", None)
            extra_keys.update(slot_keys)
        if R.intent in SLOT_SWEEP_INTENTS and extra_keys and not R.plan_request:
            self._apply_patch(R, extra_keys)
        if R.intent in PASSIVE and R.intent not in ("ANSWER_PENDING", "GREET_OR_SMALLTALK", "ASK_DETAIL") or R.plan_request or st.phase == "planned" and R.intent != "UPDATE_PROFILE":
            return
        eff = effective_text(text)
        for term in u.extra.get("ai_allergies") or ():
            if all(fold_uncached(term) != fold_uncached(a.term) for a in st.allergies) and len(st.allergies) < MAX_ALLERGIES:
                st.allergies.append(Allergy(term, allergens.family_of(term), "ai_unconfirmed"))
        if re.search(r"\b(?:tour|lich trinh|hanh trinh)\b", fold_uncached(eff)) and R.intent in ("SET_ALLERGY", "UPDATE_PROFILE", "REQUEST_PLAN", "SEARCH_VENUES", "DISCOVER_DISH", "ASK_DETAIL"):
            st.goal = "tour"
        ai_map = {"party_size": "party_size", "budget_vnd": "budget", "duration_min": "duration_min", "max_leg_min": "max_leg_min", "start_time": "start_time",
                  "end_time": "end_time", "vehicle": "vehicle", "audience": "audience", "stops": "stops", "day_part": "day_part", "interests": "tastes"}
        for key in u.extra.get("ai_keys") or ():
            fld = st.profile.get(ai_map.get(key, ""))
            if fld is not None and fld.known() and fld.source == "user_said" and fld.turn == st.turn_count:
                fld.source, fld.confirmed = "ai", False  # filled by the model, shown for the user's correction
        for key, vals in (u.extra.get("conflicts") or {}).items():
            if all(c.get("key") != key for c in st.conflicts):
                st.conflicts.append({"key": key, "values": list(vals)})
        if u.extra.get("ai_allergies") and st.pending is not None and st.pending.slot == "allergy_term":
            gone = st.pending.pending_id
            st.pending = None  # the model proposed a substance: confirm it instead of asking the open question again
            R.blocks = [b for b in R.blocks if not (b["type"] == "clarify" and b.get("pending_id") == gone)]
        if st.pending is None:
            self._guided_continue(R, full=st.goal == "tour")
        changed = self._snapshot(st) != snap0
        if changed and R.intent not in PASSIVE:
            self._attach_understood(R)
            R.tools.append("understood")

    def _ask_conflict(self, R, conflicts: dict) -> None:
        st = R.state
        key, (a, b) = next(iter(conflicts.items()))
        label = {"party_size": "số người", "budget_vnd": "ngân sách", "duration_min": "thời lượng", "start_time": "giờ bắt đầu",
                 "end_time": "giờ kết thúc", "stops": "số quán", "max_leg_min": "thời gian mỗi chặng"}[key]
        fmt = (lambda v: tools.fmt_vnd(v)) if key == "budget_vnd" else (lambda v: str(v))
        self._set_pending(st, "clarify_slot", [{"option_id": "conflict:0", "label": fmt(a)}, {"option_id": "conflict:1", "label": fmt(b)}],
                          "conflict", {"key": key, "values": [a, b]})
        R.blocks.append(self._clarify_block(st, f"Mình đọc {label} chưa khớp giữa hai cách hiểu. Bạn muốn dùng giá trị nào?"))
        R.tools.append("clarify")

    # one question per turn, in a fixed priority order; returns True when it asked something
    def _guided_continue(self, R, full: bool = True) -> bool:
        st = R.state
        if st.pending is not None or R.plan_request:
            return False
        if any(a.source == "ai_unconfirmed" for a in st.allergies):
            terms = [a.term for a in st.allergies if a.source == "ai_unconfirmed"]
            self._set_pending(st, "clarify_slot", [{"option_id": "allergy_ok", "label": "Đúng, mình dị ứng"}, {"option_id": "allergy_no", "label": "Không phải"}],
                              "allergy_confirm", {"terms": terms})
            R.blocks.append(self._clarify_block(st, "Mình hiểu bạn dị ứng với: " + ", ".join(terms) + ". Đúng không?"))
            R.tools.append("clarify")
            return True
        if st.allergy_unresolved:
            self._set_pending(st, "clarify_slot", [{"option_id": "allergy:" + k, "label": LABEL_OF[k]} for k in LABEL_OF], "allergy_term", {})
            R.blocks.append(self._clarify_block(st, "Bạn dị ứng với thực phẩm nào? Chọn một nút hoặc gõ tên (ví dụ: cua, tôm, lạc)."))
            R.tools.append("clarify")
            return True
        if st.conflicts:
            c = st.conflicts.pop(0)
            self._ask_conflict(R, {c["key"]: tuple(c["values"][:2])})
            return True
        b = st.profile["budget"]
        if b.known() and not b.scope and (st.profile["party_size"].value or 2) >= 2:
            self._set_pending(st, "clarify_slot", [{"option_id": "scope:group", "label": "Cả nhóm"}, {"option_id": "scope:per_person", "label": "Mỗi người"}],
                              "budget_scope", {})
            R.blocks.append(self._clarify_block(st, f"{tools.fmt_vnd(b.value)} là ngân sách cho cả nhóm hay cho mỗi người?"))
            R.tools.append("clarify")
            return True
        if not full:
            return False
        if not st.profile["area"].known():
            self._ask_area(R, "REQUEST_PLAN", {})
            return True
        if not st.profile["start_time"].known() and not st.profile["end_time"].known():
            chips = {"morning": ("07:00", "08:00", "09:00"), "noon": ("11:30", "12:00", "13:00"), "afternoon": ("14:00", "15:00", "16:00"),
                     "late": ("21:00", "22:00", "23:00")}.get(st.profile["day_part"].value, ("18:00", "19:00", "20:00"))
            self._set_pending(st, "clarify_slot", [{"option_id": "time:" + c, "label": c} for c in chips], "start_time", {})
            when = coverage.DAY_PARTS.get(st.profile["day_part"].value or "", "").lower()
            R.blocks.append(self._clarify_block(st, "Bạn muốn bắt đầu lúc mấy giờ" + (f" ({when})" if when else "") + "? Chọn một giờ hoặc gõ giờ khác."))
            R.tools.append("clarify")
            return True
        if not st.profile["vehicle"].known():
            self._ask_plan_slots(R, ["vehicle"])
            return True
        if not st.shortlist:
            return self._propose(R)
        self._present_summary(R)
        return True

    def _propose(self, R) -> bool:
        """The user asked for a whole tour: offer one venue per liked dish near the area; the tour is still built only from
        venues the user keeps and only after an explicit confirmation."""
        st = R.state
        centre = self._centre(st)
        n = st.profile["stops"].value or 3
        prefs = self._to_prefs(st, R.prefs)
        allergies = [a.term for a in st.allergies]
        picks, seen = [], set()
        for taste in (st.profile["tastes"].value or []):
            res = tools.search(self.venues, centre, dish=taste, radius_km=1.5, prefs=prefs, allergies=allergies, exclude_ids=tuple(seen))
            for v in res.venues[:1]:
                picks.append((v, res.dists.get(v.id), taste))
                seen.add(v.id)
        if len(picks) < n:
            res = tools.search(self.venues, centre, radius_km=1.5, prefs=prefs, allergies=allergies, exclude_ids=tuple(seen))
            for v in res.venues[: n - len(picks)]:
                picks.append((v, res.dists.get(v.id), None))
        picks = picks[:n]
        if not picks:
            st.goal = None
            R.blocks.append(text_b("Mình chưa tìm thấy quán phù hợp quanh khu vực này trong dữ liệu. Bạn thử mở rộng khu vực hoặc đổi món nhé."))
            return True
        cards, last = [], []
        for i, (v, d, taste) in enumerate(picks):
            lab = tools.LABELS[i]
            cards.append(tools.card(lab, v, d, prefs, dish=taste, allergies=allergies, in_shortlist=False))
            last.append({"label": lab, "venue_id": v.id})
        st.last_results, st.results_stale = last, False
        R.blocks.append(text_b(f"Mình gợi ý {len(cards)} quán quanh {self._area_label(st)} (khoảng cách ước tính, giá theo khoảng giá của quán)."))
        if allergies:
            R.blocks.append(notice_b("safety", "allergy_unknown", SAFETY_LINE))
        R.blocks.append({"type": "venue_cards", "title": None, "cards": cards})
        self._set_pending(st, "clarify_slot", [{"option_id": "propose:use", "label": "Dùng những quán này"}, {"option_id": "propose:self", "label": "Mình tự chọn"}],
                          "propose", {"ids": [v.id for v, _d, _t in picks]})
        R.blocks.append(self._clarify_block(st, "Bạn muốn dùng những quán này cho tour không?"))
        R.tools.append("propose_shortlist")
        return True

    def _attach_understood(self, R) -> None:
        st = R.state

        def st_of(f):
            return ("user" if f.source in ("user_said", "ui_form") else f.source) if f.known() else "missing"

        def item(i, label, f, fmt=str):
            return {"id": i, "label": label, "value": fmt(f.value) if f.known() else None, "status": st_of(f), "editable": True}
        b = st.profile["budget"]
        items = [
            item("area", "Khu vực", st.profile["area"], lambda v: v.get("label", "")),
            item("party", "Số người", st.profile["party_size"], lambda v: f"{v} người"),
            item("stops", "Số quán", st.profile["stops"], lambda v: f"{v} quán"),
            item("duration", "Tổng thời gian", st.profile["duration_min"], lambda v: f"{v} phút (cả tour)"),
            item("day_part", "Buổi", st.profile["day_part"], lambda v: coverage.DAY_PARTS.get(v, v)),
            item("time", "Bắt đầu lúc", st.profile["start_time"]),
            {"id": "budget", "label": "Ngân sách", "value": (tools.fmt_vnd(b.value) + {"per_person": " mỗi người", "group": " cả nhóm"}.get(b.scope, " (chưa rõ cả nhóm hay mỗi người)")) if b.known() else None,
             "status": st_of(b), "editable": True},
            item("dish", "Thích", st.profile["tastes"], lambda v: ", ".join(v)),
        ]
        if st.profile["max_leg_min"].known():
            items.append(item("leg_time", "Đi mỗi chặng tối đa", st.profile["max_leg_min"], lambda v: f"{v} phút"))
        items = [i for i in items if i["value"] is not None or i["id"] in ("time", "budget", "area")]
        card = {"type": "understood", "items": items,
                "allergies": [{"term": a.term, "family": a.family, "status": "ai_unconfirmed" if a.source == "ai_unconfirmed" else "user"} for a in st.allergies]}
        idx = next((i for i, x in enumerate(R.blocks) if x["type"] == "clarify"), len(R.blocks))
        R.blocks = [x for x in R.blocks if not (x["type"] == "text" and x.get("text", "").startswith("Đã cập nhật:"))]
        idx = next((i for i, x in enumerate(R.blocks) if x["type"] == "clarify"), len(R.blocks))
        R.blocks.insert(idx, card)

    # ---- helpers
    def _centre(self, st):
        a = st.profile["area"].value
        return (a["lat"], a["lon"]) if a else None

    def _area_label(self, st) -> str:
        a = st.profile["area"].value
        if not a:
            return ""
        approx = " (xấp xỉ)" if a.get("kind") in ("district", "street", "landmark", "geolocation") else ""
        return f"{a.get('label')}{approx}"

    def _set_pending(self, st, kind, options=(), slot=None, context=None) -> Pending:
        st.pending = Pending(f"p{st.turn_count}", kind, list(options), slot, context or {})
        return st.pending

    def _clarify_block(self, st, question) -> dict:
        p = st.pending
        block = {"type": "clarify", "pending_id": p.pending_id, "question": question, "options": list(p.options)}
        if self.guided:  # contract v1.9: the options ARE the chips; `slot` tells the UI which question this is
            block["slot"] = p.slot
            block["free_text"] = True
        return block

    def _district_options(self, n=3) -> list:
        counts = {}
        for v in self.venues:
            key = re.sub(r"^(?:Quận|Huyện)\s+", "", v.district or "")
            if key:
                counts[key] = counts.get(key, 0) + 1
        top = sorted(counts, key=lambda k: (-counts[k], k))[:n]
        return [{"option_id": "geo", "label": "Dùng vị trí của tôi"}] + [{"option_id": f"district:{d}", "label": d} for d in top]

    def _ask_area(self, R, resume_intent, resume_patch, extra_blocks=()):
        st = R.state
        if st.pending and st.pending.slot == "area" and st.pending.kind == "clarify_slot":
            # Same question is already open: do not repeat it, keep the original resume target.
            R.blocks += list(extra_blocks) + [text_b("Mình vẫn cần biết khu vực bạn muốn tìm — chọn một nút bên dưới hoặc gõ tên quận/đường/mốc nổi tiếng.")]
            return
        self._set_pending(st, "clarify_slot", self._district_options(), "area", {"resume": {"intent": resume_intent, "patch": resume_patch}})
        R.blocks += list(extra_blocks) + [self._clarify_block(st, "Bạn muốn tìm quanh khu vực nào ở Hà Nội? (ví dụ: Cầu Giấy, phố cổ, đường Xuân Thủy)")]
        R.tools.append("clarify")

    def _apply_area(self, st, place_json: dict, source="user_said"):
        v = dict(place_json)
        if v.get("kind") == "district" and not v.get("district"):
            v["district"] = v.get("label")
        st.set_field("area", v, source)
        st.results_stale = bool(st.last_results)
        st.tour_stale = st.tour_stale or st.phase == "planned"

    def _resolve_location(self, loc: dict, st) -> Optional[dict]:
        if loc.get("lat") is not None and loc.get("lon") is not None:
            lat, lon = float(loc["lat"]), float(loc["lon"])
            if not self.gz.inside_hanoi(lat, lon):
                return {"outside": True}
            near = self.gz.nearest_label(lat, lon)
            kind = "geolocation" if not loc.get("label") else "coordinates"
            return {"kind": kind, "label": loc.get("label") or (f"gần {near}" if near else "vị trí của bạn"), "lat": lat, "lon": lon, "district": None}
        name = loc.get("district") or loc.get("label") or ""
        if not name:
            return None
        if self.gz.outside(fold_uncached(name)):
            return {"outside": True}
        pl = self.gz.resolve(name)
        return pl.to_json() if pl else {"unknown": name}

    def _refs(self, refs, st, scope):
        """Resolve user references to venue ids. scope: 'results' (labels/ordinals of last_results) or 'shortlist'."""
        out, bad = [], []
        res = st.last_results
        sl = [s.venue_id for s in st.shortlist]
        for r in refs:
            vid = None
            if r.startswith("id:"):
                vid = r[3:]
            elif r == "all":
                out += sl if scope == "shortlist" else [x["venue_id"] for x in res]
                continue
            elif r == "last":
                seq = sl if scope == "shortlist" else [x["venue_id"] for x in res]
                vid = seq[-1] if seq else None
            elif r.isdigit():
                seq = sl if scope == "shortlist" else [x["venue_id"] for x in res]
                i = int(r) - 1
                vid = seq[i] if 0 <= i < len(seq) else None
            else:
                vid = next((x["venue_id"] for x in res if x["label"] == r), None)
            if vid and vid in self.by_id:
                out.append(vid)
            else:
                bad.append(r)
        return list(dict.fromkeys(out)), bad

    # ---- profile
    def _apply_patch(self, R, patch: dict) -> list:
        st, said = R.state, []
        if patch.get("reset"):
            R.state = st2 = ChatState()
            st2.turn_count, st2.llm_used = st.turn_count, st.llm_used  # starting over never refunds spent AI calls
            R.blocks.append(text_b("Đã làm lại từ đầu. Mình có thể gợi ý món hoặc tìm quán gần bạn."))
            return ["reset"]
        loc = patch.get("location")
        if loc is not None:
            res = self._resolve_location(loc, st)
            if res and res.get("outside"):
                R.blocks.append(notice_b("warning", "outside_hanoi", "Dữ liệu của mình hiện chỉ có quán ở Hà Nội; hãy chọn một địa điểm trong Hà Nội."))
            elif res and res.get("unknown"):
                R.blocks.append(text_b(f"Mình chưa nhận ra khu vực \"{res['unknown']}\" trong dữ liệu Hà Nội; hãy chọn quận hoặc đường khác."))
            elif res:
                self._apply_area(st, res)
                said.append(f"khu vực: {self._area_label(st)}")
        a = patch.get("area")
        if isinstance(a, dict) and a.get("lat") is not None:
            self._apply_area(st, a)
            said.append(f"khu vực: {self._area_label(st)}")
        if "party_size" in patch:
            st.set_field("party_size", patch["party_size"])
            said.append(f"{patch['party_size']} người")
            st.tour_stale = st.tour_stale or st.phase == "planned"
        if "budget_vnd" in patch:
            scope = patch.get("budget_scope") or st.profile["budget"].scope
            st.set_field("budget", patch["budget_vnd"], "user_said", scope)
            said.append("ngân sách " + tools.fmt_vnd(patch["budget_vnd"]) + (" mỗi người" if scope == "per_person" else " cả nhóm" if scope == "group" else " (chưa rõ tính theo người hay cả nhóm)"))
        elif "budget_scope" in patch and st.profile["budget"].known():
            b = st.profile["budget"]
            st.set_field("budget", b.value, "user_said", patch["budget_scope"])
            said.append("ngân sách tính " + ("mỗi người" if patch["budget_scope"] == "per_person" else "cả nhóm"))
        for k in ("start_time", "end_time", "duration_min", "vehicle", "max_leg_min", "audience"):
            if k in patch:
                st.set_field(k, patch[k])
                st.tour_stale = st.tour_stale or st.phase == "planned"
                said.append({"start_time": f"bắt đầu {patch.get('start_time')}", "end_time": f"kết thúc trước {patch.get('end_time')}",
                             "duration_min": f"{patch.get('duration_min')} phút", "vehicle": VEHICLES.get(patch.get("vehicle"), ""),
                             "max_leg_min": f"không đi bộ quá {patch.get('max_leg_min')} phút mỗi chặng",
                             "audience": {"family": "đi cùng gia đình", "friends": "đi cùng bạn bè", "solo": "đi một mình"}.get(patch.get("audience"), "")}[k])
        if "stops" in patch:
            st.set_field("stops", patch["stops"])
            said.append(f"{patch['stops']} quán")
            st.tour_stale = st.tour_stale or st.phase == "planned"
        if patch.get("_stops_rejected"):
            R.blocks.append(notice_b("warning", "value_rejected", "Mình chỉ ghép tour từ 1 đến 5 quán. Bạn chọn lại số quán giúp mình nhé."))
        if "day_part" in patch:
            st.set_field("day_part", patch["day_part"])
            said.append(coverage.DAY_PARTS.get(patch["day_part"], "").lower())
        if patch.get("interests"):
            cur = st.profile["tastes"].value or []
            st.set_field("tastes", list(dict.fromkeys(cur + list(patch["interests"])))[:8])
            said.append("thích: " + ", ".join(patch["interests"]))
        if patch.get("taste"):
            cur = st.profile["tastes"].value or []
            st.set_field("tastes", list(dict.fromkeys(cur + [patch["taste"]])))
            said.append("khẩu vị: " + patch["taste"])
        return [s for s in said if s]

    def _after_patch_notes(self, R, patch):
        st = R.state
        if patch.get("_rejected"):
            R.blocks.append(notice_b("warning", "value_rejected", "Có giá trị nằm ngoài khoảng hợp lệ nên chưa áp dụng: " + ", ".join(patch["_rejected"]) + ". Bạn nhập lại giúp mình nhé."))
        b = st.profile["budget"]
        if b.known() and not b.scope:
            self._set_pending(st, "clarify_slot", [{"option_id": "scope:group", "label": "Cả nhóm"}, {"option_id": "scope:per_person", "label": "Mỗi người"}],
                              "budget_scope", {})
            R.blocks.append(self._clarify_block(st, "Ngân sách này tính cho mỗi người hay cả nhóm?"))

    # ================================================================== intents
    def _do_greet_or_smalltalk(self, R, u):
        if u.patch.get("absent_person"):
            gone = [a.term for a in R.state.allergies if a.who == "other"]
            R.state.allergies = [a for a in R.state.allergies if a.who != "other"]
            R.blocks.append(notice_b("info", "allergy_cleared", "Mình đã bỏ dị ứng của người không đi cùng (" + ", ".join(gone) + "). Nếu mình hiểu nhầm, bạn nói lại nhé."))
            R.tools.append("none")
            return
        if u.patch.get("absent_allergy"):
            R.blocks.append(text_b("Ok, mình không tính dị ứng của người không đi cùng. Nếu bạn hoặc người đi cùng có dị ứng, hãy nói để mình lưu ý."))
            R.tools.append("none")
            return
        if u.patch.get("no_allergy"):
            st0 = R.state
            st0.allergy_unresolved = False
            if self.guided and st0.allergies:
                gone = ", ".join(a.term for a in st0.allergies)
                st0.allergies = []  # an explicit "no allergy at all" retracts what was recorded; the card and this notice make it visible and reversible
                R.blocks.append(notice_b("info", "allergy_cleared", f"Mình đã bỏ dị ứng đã ghi ({gone}). Nếu mình hiểu nhầm, bạn nói lại dị ứng nhé."))
                R.tools.append("none")
                return
            R.blocks.append(text_b("Ok, mình không ghi nhận dị ứng nào. Nếu sau này có, bạn cứ nói để mình lưu ý."))
        else:
            R.blocks.append(text_b("Chào bạn! Mình giúp bạn khám phá món ngon ở Hà Nội, so sánh quán rồi mới ghép thành food tour. "
                                   "Bạn đang ở khu nào, hay muốn mình gợi ý món trước?"))
        R.tools.append("none")

    def _do_unsafe(self, R, u):
        R.blocks.append(notice_b("safety", "unsafe_request", "Mình bỏ qua phần yêu cầu đổi quy tắc hoặc xác nhận an toàn. "
                                 "Mình không thể khẳng định một quán an toàn cho người dị ứng vì dữ liệu không có thông tin nguyên liệu."))
        R.tools.append("none")

    def _do_out_of_scope(self, R, u):
        reason = u.patch.get("reason")
        if reason == "outside_hanoi":
            R.blocks.append(notice_b("warning", "outside_hanoi", "Dữ liệu của mình hiện chỉ có quán ở Hà Nội. Bạn hãy chọn một khu vực trong Hà Nội nhé."))
        elif reason == "no_weather_data":
            R.blocks.append(notice_b("info", "no_weather_data", NO_WEATHER))
        elif reason == "not_supported_yet":
            R.blocks.append(notice_b("info", "not_supported_yet", "Mình chưa hỗ trợ đặt bàn, đặt xe, thanh toán hay lưu/chia sẻ lịch trình; hiện mình có thể mở lịch trình bằng liên kết Google Maps sau khi lập tour."))
        else:
            R.blocks.append(text_b("Mình chỉ tư vấn ăn uống và lập food tour ở Hà Nội. Bạn muốn tìm món hay quán nào không?"))
        R.tools.append("none")

    def _do_set_allergy(self, R, u):
        st = R.state
        sp = u.extra.get("safety") or safety_parse.parse(" ".join(x["text"] for x in st.turns[-1:]))
        added = []
        for term in sp.allergies:
            if all(fold_uncached(term) != fold_uncached(a.term) for a in st.allergies) and len(st.allergies) < MAX_ALLERGIES:
                said = (st.turns[-1]["text"] if st.turns else "").casefold()
                other = is_third_party(said)
                st.allergies.append(Allergy(term, allergens.family_of(term), "user_said", who="other" if other else "self"))
                added.append(term)
        for term in sp.removed:
            st.allergies = [a for a in st.allergies if fold_uncached(a.term) != fold_uncached(term)]
            R.blocks.append(text_b(f"Đã bỏ \"{term}\" khỏi danh sách dị ứng. Bạn có thể thêm lại bất cứ lúc nào."))
        if added:
            st.allergy_unresolved = False
            R.blocks.append(notice_b("safety", "allergy_unknown", f"Đã ghi nhận dị ứng: {', '.join(added)}. {SAFETY_LINE}"))
            odd = allergens.unrecognised(tuple(added))
            if odd:
                R.blocks.append(text_b("Mình chưa có quy tắc riêng cho: " + ", ".join(odd) + "; mình chỉ loại quán có tên/món chứa đúng từ này."))
            if st.last_results:
                st.results_stale = True
        vc = u.extra.get("venue_confirmation")
        if vc:
            ids, _ = self._refs([vc], st, "results")
            if ids:
                said = (u.extra.get("said") or "")[:160]
                tgt = [a for a in st.allergies if fold_uncached(a.term) in fold_uncached(said)] or st.allergies
                lab = next((x["label"] for x in st.last_results if x["venue_id"] == ids[0]), vc)
                for a in tgt:
                    a.venue_confirmations.append({"venue_id": ids[0], "label": lab, "text": said, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
                R.blocks.append(notice_b("safety", "user_confirmed", f"Mình ghi lại: Người dùng xác nhận với quán {lab} (không phải xác minh độc lập). "
                                         "Tour vẫn được đánh dấu chưa đủ bằng chứng về nguyên liệu."))
            else:
                R.blocks.append(text_b("Mình chưa biết quán bạn nói tới (danh sách quán đã đổi). Bạn chọn lại quán trong danh sách nhé."))
        if sp.issues and (not added or "empty" in sp.issues):
            msg = {"people": "Mỗi người dị ứng với gì? Hãy liệt kê từng tác nhân (ví dụ: tôm, lạc).",
                   "example": "Bạn đang nêu ví dụ phải không? Mình chưa ghi nhận dị ứng nào; hãy nói rõ bạn hoặc người đi cùng dị ứng với gì.",
                   "long": "Tên tác nhân dị ứng quá dài hoặc không rõ nên chưa được ghi nhận; hãy nhập ngắn gọn từng thứ (ví dụ: cua, tôm, lạc)."}.get(
                sp.issues[0], ("Bạn còn nhắc tới một dị ứng nữa nhưng mình chưa biết là gì; hãy nói tên thực phẩm đó." if added else "Bạn dị ứng với thực phẩm nào? Mình chưa ghi nhận dị ứng cụ thể nào; hãy nói tên (ví dụ: cua, tôm, sữa)."))
            if self.guided and (any(i in ("empty", "people", "long", "vague") for i in sp.issues) or (not added and not sp.removed)):
                st.allergy_unresolved = True  # a cue without a usable substance stays open even if another term was captured
            if self.guided and st.allergy_unresolved and st.pending is None:
                self._set_pending(st, "clarify_slot", [{"option_id": "allergy:" + k, "label": LABEL_OF[k]} for k in LABEL_OF], "allergy_term", {})
                R.blocks.append(self._clarify_block(st, msg))
                R.tools.append("clarify")
            else:
                R.blocks.append(text_b(msg))
        if sp.avoid:
            self._ask_avoid(R, sp.avoid)
        if u.patch and any(k in u.patch for k in ("party_size", "budget_vnd", "budget_scope", "start_time", "end_time", "duration_min",
                                                   "vehicle", "audience", "max_leg_min", "area", "location")):
            said = self._apply_patch(R, u.patch)
            if said:
                R.blocks.append(text_b("Đã cập nhật: " + "; ".join(said) + "."))
        pend = st.pending
        if pend and pend.kind == "clarify_slot" and pend.slot == "plan_slots":
            st.pending = None  # the same message answered the plan questions as well
            miss = self._plan_missing(st)
            if miss:
                self._ask_plan_slots(R, miss)
            else:
                self._present_summary(R)
        R.tools.append("set_allergy")

    def _ask_avoid(self, R, terms):
        st = R.state
        self._set_pending(st, "clarify_intent", [{"option_id": "allergy", "label": "Dị ứng"}, {"option_id": "dislike", "label": "Chỉ là không thích"}],
                          None, {"terms": list(terms)})
        R.blocks.append(self._clarify_block(st, f"Bạn không ăn {', '.join(terms)}: đây là dị ứng hay chỉ là không thích?"))

    def _do_set_avoid(self, R, u):
        if u.patch.get("dislike"):
            self._do_update_profile(R, Understanding("UPDATE_PROFILE", {"dislike": u.patch["dislike"]}, u.refs, u.confidence))
            return
        sp = u.extra.get("safety")
        other = [t for t in getattr(sp, "avoid_any", []) if t not in sp.avoid]
        if other:  # taste-level avoidance of a non-allergen term: filter only when the dataset actually has such dishes
            hit = [t for t in other if any(tools.matches(v, tools.dish_phrases(t)) for v in self.venues)]
            miss = [t for t in other if t not in hit]
            if hit:
                R.prefs = replace(R.prefs, exclusions=tuple(dict.fromkeys(R.prefs.exclusions + tuple(tools.clean_text(t, 40) for t in hit)))[:10])
                R.blocks.append(text_b(f"Đã ghi nhận bạn muốn tránh: {', '.join(hit)} (sở thích, không phải dị ứng). Nếu là dị ứng hãy nói \"dị ứng …\"."))
            if miss:
                R.blocks.append(text_b(f"Mình chưa thấy {', '.join(miss)} trong dữ liệu quán nên chưa lọc được."))
        if sp.avoid:
            self._ask_avoid(R, sp.avoid)
        R.tools.append("clarify" if sp.avoid else "set_profile")

    def _do_update_profile(self, R, u):
        st = R.state
        patch = u.patch
        if patch.get("dish_replace"):
            R.blocks.append(text_b("Ok, mình sẽ ưu tiên: " + ", ".join(patch["dish_replace"][:2]) + " khi tìm quán."))
            R.tools.append("set_profile")
            return
        if patch.get("dislike"):
            R.prefs = replace(R.prefs, exclusions=tuple(dict.fromkeys(R.prefs.exclusions + (str(patch["dislike"])[:40],)))[:10])
            R.blocks.append(text_b(f"Đã ghi nhận bạn không thích: {patch['dislike']}. Đây là sở thích, không phải dị ứng — nếu là dị ứng hãy nói \"dị ứng {patch['dislike']}\"."))
            R.tools.append("set_profile")
            return
        pend = st.pending
        said = self._apply_patch(R, patch)
        st = R.state
        if not said and "location" not in patch and not patch.get("_rejected"):
            self._do_unknown(R, u)
            return
        if pend and pend.kind == "clarify_slot" and pend.slot == "area" and st.profile["area"].known() and pend.pending_id == (st.pending.pending_id if st.pending else None):
            st.pending = None
            if said:
                R.blocks.append(text_b("Đã cập nhật: " + "; ".join(said) + "."))
            resume = pend.context.get("resume")
            if resume:
                self._dispatch(R, Understanding(resume["intent"], dict(resume.get("patch", {})), [], 0.9, "rules"))
            return
        if said and said != ["reset"]:
            a = st.profile["area"].value
            extra = ""
            if "area" in patch and a:
                extra = " Mình hiểu khu vực này là xấp xỉ; bạn có thể sửa nếu chưa đúng." if a.get("kind") != "coordinates" else ""
            R.blocks.append(text_b("Đã cập nhật: " + "; ".join(said) + "." + extra))
            if st.tour_stale:
                R.blocks.append(notice_b("info", "tour_stale", "Thông tin đã đổi nên lịch trình trước đó cần tính lại."))
        self._after_patch_notes(R, patch)
        if st.pending and st.pending.kind == "confirm_plan" and st.pending.pending_id != f"p{st.turn_count}":
            self._present_summary(R)
        R.tools.append("set_profile")

    def _do_answer_pending(self, R, u):
        st, pend = R.state, R.state.pending
        if pend is None:
            self._do_ambiguous_ack(R, u)
            return
        if u.extra.get("stale_option"):
            R.blocks.append(text_b("Lựa chọn đó không còn hiệu lực với câu hỏi hiện tại; bạn chọn lại ở các nút mới nhất nhé."))
            R.tools.append("nudge")
            return
        if pend.kind == "clarify_slot" and pend.slot in ("allergy_term", "allergy_confirm", "allergy_clear", "propose", "conflict") and self._answer_guided_slot(R, pend, u):
            return
        if pend.kind == "clarify_slot":
            patch = dict(u.patch)
            opt = patch.pop("option", None)
            if opt:
                patch = self._option_to_patch(opt, patch)
            had_area = pend.slot == "area"
            said = self._apply_patch(R, patch)
            st.pending = None
            if had_area and not st.profile["area"].known():
                self._ask_area(R, (pend.context.get("resume") or {}).get("intent", "SEARCH_VENUES"), (pend.context.get("resume") or {}).get("patch", {}))
                return
            if said:
                R.blocks.append(text_b("Đã cập nhật: " + "; ".join(said) + "."))
            resume = pend.context.get("resume")
            if resume:
                self._dispatch(R, Understanding(resume["intent"], dict(resume.get("patch", {})), [], 0.9, "rules"))
            else:
                self._after_patch_notes(R, patch)
            R.tools.append("answer_pending")
        elif pend.kind == "clarify_intent":
            opt = u.patch.get("option")
            st.pending = None
            terms = pend.context.get("terms")
            if opt == "allergy" and terms:
                for t in terms:
                    if all(fold_uncached(t) != fold_uncached(a.term) for a in st.allergies):
                        st.allergies.append(Allergy(t, allergens.family_of(t), "user_said"))
                R.blocks.append(notice_b("safety", "allergy_unknown", f"Đã ghi nhận dị ứng: {', '.join(terms)}. {SAFETY_LINE}"))
                st.results_stale = bool(st.last_results)
            elif opt == "dislike" and terms:
                R.prefs = replace(R.prefs, exclusions=tuple(dict.fromkeys(R.prefs.exclusions + tuple(terms)))[:10])
                R.blocks.append(text_b(f"Ok, mình ghi là bạn không thích {', '.join(terms)} (không phải dị ứng) và sẽ tránh khi tìm quán."))
            elif opt == "choose_venue":
                self._pick_venue_prompt(R, pend.context.get("candidates"))
            elif opt == "plan":
                self._do_request_plan(R, Understanding("REQUEST_PLAN"))
            elif opt == "search":
                self._do_search_venues(R, Understanding("SEARCH_VENUES", {}))
            elif opt == "discover":
                self._do_discover_dish(R, Understanding("DISCOVER_DISH", {}))
            elif opt == "add_more":
                self._do_search_venues(R, Understanding("SEARCH_VENUES", {}))
            elif opt and opt.startswith(("relax_leg:", "vehicle:", "drop:", "time:")):
                self._apply_conflict_option(R, opt)
            elif opt in ("widen",) or (opt or "").startswith("dish:") or opt == "area":
                self._no_result_option(R, opt, pend)
            else:
                R.blocks.append(text_b("Mình chưa hiểu lựa chọn đó; bạn nói lại giúp mình nhé."))
            R.tools.append("answer_pending")
        elif pend.kind == "pick_venue":
            cands = [c for c in (pend.context.get("candidates") or []) if c in self.by_id]
            ids = []
            if u.patch.get("option") in cands:
                ids = [u.patch["option"]]
            else:
                got, _bad = self._refs(u.refs, st, "results") if u.refs else ([], [])
                ids = [i for i in got if i in cands]  # only venues that were actually offered
                for r in u.refs:
                    if r.isdigit() and 1 <= int(r) <= len(cands) and cands[int(r) - 1] not in ids and not got:
                        ids.append(cands[int(r) - 1])
            if not ids:
                R.blocks.append(text_b("Mình chưa rõ bạn chọn quán nào trong các quán vừa đưa ra; hãy bấm một nút hoặc nói \"quán A\"."))
                R.tools.append("nudge")
                return
            st.pending = None
            self._add_ids(R, ids)
            R.tools.append("shortlist_add")
        elif pend.kind == "confirm_plan":
            opt = u.patch.get("option") or ""
            if opt.startswith("scope:"):
                self._apply_patch(R, {"budget_scope": opt.split(":", 1)[1]})
                self._present_summary(R)
            else:
                R.blocks.append(text_b("Để lập lịch trình, bạn bấm \"Xác nhận và tạo lịch trình\" hoặc nói rõ \"xác nhận\"; mình chưa tạo gì."))
                R.tools.append("nudge")

    def _answer_guided_slot(self, R, pend, u) -> bool:
        """Answers to the v1.9 questions (allergy_term, allergy_confirm, propose, conflict). True when handled."""
        st = R.state
        opt = u.patch.get("option") or ""
        slot = pend.slot
        if slot == "allergy_term":
            term = None
            if opt.startswith("allergy:") and opt != "allergy:other":
                term = ALLERGY_CHIPS.get(opt.split(":", 1)[1])
            elif u.patch.get("allergy_text"):
                term = str(u.patch["allergy_text"])[:40]
            if not term:
                R.blocks.append(text_b("Bạn gõ tên thực phẩm gây dị ứng giúp mình (ví dụ: cua, tôm, lạc)."))
                R.tools.append("nudge")
                return True
            st.pending = None
            st.allergy_unresolved = False
            if all(fold_uncached(term) != fold_uncached(a.term) for a in st.allergies) and len(st.allergies) < MAX_ALLERGIES:
                st.allergies.append(Allergy(term, allergens.family_of(term), "user_said"))
            R.blocks.append(notice_b("safety", "allergy_unknown", f"Đã ghi nhận dị ứng: {term}. {SAFETY_LINE}"))
            if st.last_results:
                st.results_stale = True
            R.tools.append("answer_pending")
            return True
        if slot == "allergy_confirm":
            terms = {fold_uncached(t) for t in pend.context.get("terms", [])}
            st.pending = None
            if opt == "allergy_ok":
                st.allergy_unresolved = False
                for a in st.allergies:
                    if a.source == "ai_unconfirmed" and fold_uncached(a.term) in terms:
                        a.source = "user_said"
                R.blocks.append(text_b("Đã ghi nhận. " + SAFETY_LINE))
            else:
                st.allergies = [a for a in st.allergies if not (a.source == "ai_unconfirmed" and fold_uncached(a.term) in terms)]
                R.blocks.append(text_b("Ok, mình bỏ phần đó. Nếu bạn có dị ứng, hãy nói tên thực phẩm cụ thể nhé."))
            R.tools.append("answer_pending")
            return True
        if slot == "allergy_clear":
            st.pending = None
            if opt == "allergy_clear:yes":
                st.allergies = []
                st.allergy_unresolved = False
                R.blocks.append(text_b("Đã bỏ các dị ứng đã ghi. Nếu có dị ứng, bạn cứ nói để mình lưu ý."))
            else:
                R.blocks.append(text_b("Ok, mình giữ nguyên dị ứng đã ghi để an toàn."))
            R.tools.append("answer_pending")
            return True
        if slot == "propose":
            st.pending = None
            if opt == "propose:use":
                self._add_ids(R, [i for i in pend.context.get("ids", []) if i in self.by_id])
            else:
                st.goal = None
                R.blocks.append(text_b("Ok, bạn tự chọn bằng nút Thêm trên từng quán nhé; chọn xong cứ nói \"lập lịch trình\"."))
            R.tools.append("answer_pending")
            return True
        if slot == "conflict":
            st.pending = None
            vals = pend.context.get("values") or []
            if opt in ("conflict:0", "conflict:1") and len(vals) == 2:
                key = pend.context.get("key")
                self._apply_patch(R, {key: vals[int(opt[-1])]})
            R.tools.append("answer_pending")
            return True
        return False

    def _option_to_patch(self, opt: str, patch: dict) -> dict:
        if opt.startswith("veh:") and opt.split(":", 1)[1] in VEHICLES:
            patch["vehicle"] = opt.split(":", 1)[1]
            return patch
        if opt.startswith("time:"):
            patch["start_time"] = opt.split(":", 1)[1]
            return patch
        if opt.startswith("district:"):
            pl = self.gz.resolve(opt.split(":", 1)[1])
            if pl:
                patch["area"] = pl.to_json()
        elif opt == "geo":
            patch["_need_geo"] = True
        elif opt.startswith("scope:"):
            patch["budget_scope"] = opt.split(":", 1)[1]
        return patch

    # ---- discover / search / compare
    def _do_discover_dish(self, R, u):
        st = R.state
        blocks = []
        if u.patch.get("mood") == "cool":
            blocks.append(text_b("Bạn nói trời nóng nên mình ưu tiên món mát/đồ uống. " + NO_WEATHER))
        elif u.patch.get("mood") == "warm":
            blocks.append(text_b("Bạn nói trời lạnh nên mình ưu tiên món nóng. " + NO_WEATHER))
        if not self._centre(st):
            self._ask_area(R, "DISCOVER_DISH", u.patch, blocks)
            return
        items = tools.discover(self.venues, self._centre(st), mood=u.patch.get("mood"), meal=u.patch.get("meal"), dish=u.patch.get("dish"))
        R.blocks += blocks
        if not items or all(i["venue_count"] == 0 for i in items):
            R.blocks.append(text_b(f"Quanh {self._area_label(st)} (bán kính 1.500 m) mình không có quán nào khớp các món này trong dữ liệu."))
            R.blocks.append(notice_b("info", "no_results", "Bạn có thể đổi khu vực hoặc hỏi món khác."))
        else:
            R.blocks.append(text_b(f"Gợi ý món quanh {self._area_label(st)}. Phần mô tả là kiến thức chung; số quán đếm từ dữ liệu của mình (ước tính đường chim bay):"))
            R.blocks.append({"type": "dish_suggestions", "items": items})
        R.tools.append("discover_dishes")

    def _do_search_venues(self, R, u):
        st = R.state
        patch = u.patch
        if isinstance(patch.get("area"), dict) and patch["area"].get("lat") is not None:
            self._apply_area(st, patch["area"])
        if not self._centre(st):
            self._ask_area(R, "SEARCH_VENUES", {k: v for k, v in patch.items() if k != "area"})
            return
        if patch.get("unsupported"):
            R.blocks.append(notice_b("info", "criterion_unsupported", "Dữ liệu chưa có tiêu chí: " + ", ".join(tools.UNSUPPORTED[c] for c in patch["unsupported"]) +
                                     "; mình không suy diễn từ sao hay ảnh nên chưa lọc theo các tiêu chí này."))
        prefs = self._to_prefs(st, R.prefs)
        radius_m = int(patch.get("radius_m") or 1500)
        allergies = [a.term for a in st.allergies]
        dish = patch.get("dish") or None
        res = tools.search(self.venues, self._centre(st), dish=dish, radius_km=radius_m / 1000.0, prefs=prefs, allergies=allergies,
                           max_price=patch.get("budget_vnd") if u.intent == "SEARCH_VENUES" else None, amenity=patch.get("amenity"))
        if not res.venues:
            self._no_results(R, res, dish, radius_m, allergies)
            return
        sl = {s.venue_id for s in st.shortlist}
        cards, last = [], []
        for i, v in enumerate(res.venues):
            lab = tools.LABELS[i]
            cards.append(tools.card(lab, v, res.dists.get(v.id), prefs, dish=dish, allergies=allergies, in_shortlist=v.id in sl))
            last.append({"label": lab, "venue_id": v.id})
        st.last_results, st.results_stale = last, False
        head = f"Mình tìm thấy {len(cards)} quán" + (f" {dish}" if dish else "") + f" quanh {self._area_label(st)} (bán kính {radius_m} m, khoảng cách ước tính đường chim bay)."
        R.blocks.append(text_b(head))
        if allergies:
            note = SAFETY_LINE
            if res.excluded_allergen:
                note = f"Đã loại {res.excluded_allergen} quán có tên/nhóm món liên quan tới {', '.join(allergies)}. " + note
            R.blocks.append(notice_b("safety", "allergy_unknown", note))
        tastes = " ".join(st.profile["tastes"].value or []) if st.profile["tastes"].known() else ""
        if re.search(r"ngot|duong", fold_uncached(tastes + " " + str(patch.get("taste") or ""))):
            R.blocks.append(text_b("Chưa rõ có giảm đường được không (nguồn không ghi); cần hỏi quán."))
        R.blocks.append({"type": "venue_cards", "title": None, "cards": cards})
        R.tools.append("search_venues")

    def _no_results(self, R, res, dish, radius_m, allergies):
        st = R.state
        what = dish or "phù hợp"
        why = ""
        if allergies and res.excluded_allergen:
            why = f" Mình đã loại {res.excluded_allergen} quán có tên/nhóm món liên quan tới {', '.join(allergies)} (dị ứng bạn nêu)."
        R.blocks.append(text_b(f"Mình không tìm thấy quán {what} trong bán kính {radius_m} m quanh {self._area_label(st)} "
                               f"(đã xét {res.considered} quán trong phạm vi).{why}"))
        opts = []
        if radius_m < 5000:
            opts.append({"option_id": "widen", "label": f"Mở rộng bán kính {min(radius_m * 2, 5000)} m"})
        near = [i for i in tools.discover(self.venues, self._centre(st), radius_km=max(radius_m, 1500) / 1000.0, limit=2) if i["venue_count"]]
        for it in near:
            opts.append({"option_id": "dish:" + it["dish_group"], "label": f"Xem {it['dish_group']} ({it['venue_count']} quán)"})
        opts.append({"option_id": "area", "label": "Đổi khu vực"})
        self._set_pending(st, "clarify_intent", opts[:4], None, {"dish": dish, "radius_m": radius_m, "kind": "no_results"})
        R.blocks.append(notice_b("info", "no_results", "Mình không bịa kết quả; bạn có thể mở rộng phạm vi, đổi món hoặc đổi khu vực."))
        R.blocks.append(self._clarify_block(st, "Bạn muốn làm gì tiếp?"))
        st.last_results = []

    def _results_for(self, R, refs, minimum=2) -> Optional[list]:
        st = R.state
        if st.results_stale and st.last_results:
            self._stale_results(R)
            return None
        ids, bad = self._refs(refs, st, "results") if refs else ([], [])
        if not ids:
            ids = [x["venue_id"] for x in st.last_results][:3]
        if len(ids) < minimum:
            R.blocks.append(text_b("Mình cần ít nhất hai quán để so sánh. Hãy nhờ mình tìm quán trước (ví dụ: \"tìm quán phở gần đây\")."))
            return None
        return ids[:4]

    def _stale_results(self, R):
        st = R.state
        self._set_pending(st, "clarify_intent", [{"option_id": "search", "label": "Tìm lại quán"}], None, {})
        R.blocks.append(text_b("Danh sách trước đó đã cũ vì bạn vừa đổi khu vực hoặc điều kiện, nên mình không thể dùng nhãn A/B/C cũ. Mình tìm lại nhé?"))
        R.blocks.append(self._clarify_block(st, "Bạn muốn tìm lại quán theo điều kiện mới?"))

    def _do_compare(self, R, u):
        st = R.state
        ids = self._results_for(R, u.refs)
        if ids is None:
            return
        pairs = []
        for vid in ids:
            lab = next((x["label"] for x in st.last_results if x["venue_id"] == vid), "?")
            pairs.append((lab, self.by_id[vid]))
        table = tools.compare(pairs, self._centre(st), u.patch.get("criteria") or [])
        R.blocks.append(text_b("So sánh " + " và ".join(f"{lab}" for lab, _ in pairs) + " theo " + ", ".join(c["label"].lower() for c in table["criteria"]) + ":"))
        for un in table["unsupported"]:
            R.blocks.append(notice_b("info", "criterion_unsupported", un["text"]))
        if table["rows"] and (u.patch.get("criteria") or table["criteria"]) and table["criteria"]:
            R.blocks.append({"type": "compare_table", **table})
        R.tools.append("compare")

    # ---- shortlist
    def _add_ids(self, R, ids):
        st = R.state
        names = []
        for vid in ids:
            if any(s.venue_id == vid for s in st.shortlist):
                continue
            if len(st.shortlist) >= MAX_SHORTLIST:
                R.blocks.append(notice_b("warning", "shortlist_full", f"Danh sách tối đa {MAX_SHORTLIST} quán; hãy bỏ bớt một quán trước khi thêm."))
                break
            st.shortlist.append(ShortItem(vid))
            names.append(tools.clean_text(self.by_id[vid].name, 80, "quán này"))
        if names:
            R.blocks.append(text_b(f"Mình đã thêm {', '.join(names)} vào danh sách ({len(st.shortlist)}/{MAX_SHORTLIST}). Bạn muốn tìm thêm món khác hay xem tiếp một lựa chọn nữa?"))
        st.tour_stale = st.tour_stale or st.phase == "planned"

    def _pick_venue_prompt(self, R, candidates=None):
        st = R.state
        ids = candidates or [x["venue_id"] for x in st.last_results][:4]
        if not ids:
            R.blocks.append(text_b("Chưa có quán nào để chọn; mình tìm quán trước nhé."))
            return
        opts = []
        for vid in ids:
            lab = next((x["label"] for x in st.last_results if x["venue_id"] == vid), None)
            opts.append({"option_id": vid, "label": f"{lab + ' — ' if lab else ''}{tools.clean_text(self.by_id[vid].name, 80, "quán này")}"[:60]})
        self._set_pending(st, "pick_venue", opts[:4], None, {"candidates": ids})
        R.blocks.append(self._clarify_block(st, "Bạn chọn quán nào?"))

    def _do_add(self, R, u):
        st = R.state
        if st.results_stale and st.last_results and u.refs:
            self._stale_results(R)
            return
        ids, bad = self._refs(u.refs, st, "results") if u.refs else ([], [])
        if u.refs and not ids:
            self._set_pending(st, "clarify_intent", [{"option_id": "search", "label": "Tìm quán"}, {"option_id": "discover", "label": "Gợi ý món"}], None, {})
            R.blocks.append(text_b("Mình chưa thấy quán bạn nói trong danh sách vừa hiện (danh sách đã đổi hoặc chưa có kết quả)."))
            R.blocks.append(self._clarify_block(st, "Bạn muốn mình tìm quán trước chứ?"))
            return
        if ids:
            self._add_ids(R, ids)
            R.tools.append("shortlist_add")
            if u.extra.get("then_search"):
                self._do_search_venues(R, Understanding("SEARCH_VENUES", {k: v for k, v in u.patch.items() if k != "area"}))
            return
        if not u.patch.get("dish"):
            if not st.last_results:
                self._set_pending(st, "clarify_intent", [{"option_id": "search", "label": "Tìm quán"}], None, {})
                R.blocks.append(self._clarify_block(st, "Mình chưa có danh sách quán để chọn. Bạn muốn tìm quán trước không?"))
            else:
                self._pick_venue_prompt(R, None)  # "thêm một quán": show the candidates, never pick silently
            R.tools.append("shortlist_add")
            return
        # "thêm một quán chè": never pick silently - show candidates
        self._do_search_venues(R, Understanding("SEARCH_VENUES", dict(u.patch)))
        if st.last_results:
            R.blocks.append(text_b("Mình chưa tự thêm quán nào; hãy chọn quán bạn muốn trong danh sách trên (ví dụ: \"thêm A\")."))
        R.tools.append("shortlist_add")

    def _do_remove(self, R, u):
        st = R.state
        if not st.shortlist:
            R.blocks.append(text_b("Danh sách chọn đang trống nên chưa có quán để bỏ."))
            return
        refs = u.refs
        scope = "shortlist"
        if refs and all(r.isalpha() and len(r) == 1 and r.isupper() for r in refs):
            scope = "results"
        ids, bad = self._refs(refs, st, scope) if refs else ([], [])
        if not ids:
            R.blocks.append(text_b("Mình chưa rõ bạn muốn bỏ quán nào; hãy nói \"bỏ quán thứ hai\" hoặc bấm nút bỏ trên quán."))
            return
        gone = [tools.clean_text(self.by_id[i].name, 80, "quán này") for i in ids if any(s.venue_id == i for s in st.shortlist)]
        st.shortlist = [s for s in st.shortlist if s.venue_id not in ids]
        R.blocks.append(text_b(("Đã bỏ " + ", ".join(gone) + f" khỏi danh sách ({len(st.shortlist)}/{MAX_SHORTLIST}).") if gone else "Quán đó không có trong danh sách chọn."))
        st.tour_stale = st.tour_stale or st.phase == "planned"
        R.tools.append("shortlist_remove")

    def _do_keep(self, R, u):
        st = R.state
        scope = "results" if u.refs and all(r.isalpha() and len(r) == 1 for r in u.refs) else "shortlist"
        ids, _ = self._refs(u.refs, st, scope) if u.refs else ([], [])
        hit = False
        for s in st.shortlist:
            if s.venue_id in ids:
                s.status, hit = "kept", True
        if hit:
            R.blocks.append(text_b("Đã đánh dấu giữ quán này: khi lập lịch trình mình sẽ không loại nó."))
        else:
            R.blocks.append(text_b("Quán đó chưa nằm trong danh sách chọn; hãy thêm quán trước (ví dụ: \"thêm A\")."))
        R.tools.append("shortlist_keep")

    # ---- acknowledgement / confirmation
    def _do_ambiguous_ack(self, R, u):
        st = R.state
        if st.pending:
            R.blocks.append(text_b("Mình vẫn đang chờ bạn trả lời câu hỏi ở trên (bấm một nút hoặc gõ câu trả lời) rồi mình làm tiếp."))
            return
        last = next((t["intent"] for t in reversed(st.turns[:-1]) if t["role"] == "assistant"), "")
        if last == "COMPARE" and len(st.last_results) >= 2:
            self._set_pending(st, "clarify_intent", [{"option_id": "choose_venue", "label": "Chọn một quán để thêm"}, {"option_id": "plan", "label": "Lập lịch trình"}],
                              None, {"candidates": [x["venue_id"] for x in st.last_results][:4]})
            R.blocks.append(self._clarify_block(st, "Bạn muốn mình làm gì tiếp?"))
        elif st.shortlist:
            self._set_pending(st, "clarify_intent", [{"option_id": "plan", "label": "Lập lịch trình"}, {"option_id": "add_more", "label": "Tìm thêm quán"}], None, {})
            R.blocks.append(self._clarify_block(st, "Bạn muốn lập lịch trình với các quán đã chọn hay tìm thêm quán?"))
        else:
            self._set_pending(st, "clarify_intent", [{"option_id": "search", "label": "Tìm quán gần tôi"}, {"option_id": "discover", "label": "Gợi ý món"}], None, {})
            R.blocks.append(self._clarify_block(st, "Bạn muốn mình làm gì tiếp?"))
        R.tools.append("clarify")

    def _do_confirm_yes(self, R, u):
        st = R.state
        if st.pending and st.pending.kind == "confirm_plan" and self._open_obligation(st):
            st.pending = None
            self._guided_continue(R)
            return
        if st.pending and st.pending.kind == "confirm_plan":
            miss = self._plan_missing(st)
            if miss:
                st.pending = None
                self._ask_plan_slots(R, miss)
                return
            ids = [s.venue_id for s in st.shortlist]
            st.pending = None
            R.plan_request = {"venue_ids": ids, "kept": [s.venue_id for s in st.shortlist if s.status == "kept"]}
            R.tools.append("generate_tour")
            return
        self._do_ambiguous_ack(R, u)

    def _do_confirm_no(self, R, u):
        st = R.state
        if st.pending and st.pending.kind == "confirm_plan":
            st.pending = None
            R.blocks.append(text_b("Ok, mình chưa lập lịch trình. Bạn muốn sửa thông tin nào (xuất phát, giờ, phương tiện, ngân sách, danh sách quán)?"))
        elif st.pending:
            st.pending = None
            R.blocks.append(text_b("Ok, mình bỏ câu hỏi đó. Bạn muốn làm gì tiếp?"))
        else:
            R.blocks.append(text_b("Ok. Bạn muốn làm gì tiếp?"))

    # ---- plan flow
    def _plan_missing(self, st) -> list:
        miss = []
        if not st.profile["area"].known():
            miss.append("area")
        if not st.profile["start_time"].known() and not st.profile["duration_min"].known():
            miss.append("time")
        elif st.profile["start_time"].known() and not (st.profile["end_time"].known() or st.profile["duration_min"].known()):
            miss.append("end")
        if not st.profile["vehicle"].known():
            miss.append("vehicle")
        return miss

    def _ask_plan_slots(self, R, miss):
        st = R.state
        parts = []
        if "area" in miss:
            self._ask_area(R, "REQUEST_PLAN", {})
            return
        if "time" in miss:
            parts.append("bắt đầu lúc nào, kết thúc trước mấy giờ")
        if "end" in miss:
            parts.append("kết thúc trước mấy giờ")
        if "vehicle" in miss:
            parts.append("đi bằng phương tiện gì (đi bộ, xe máy, ô tô, taxi/Grab)")
        q = "Bạn muốn " + " và ".join(parts) + "?"
        if "time" in miss:
            q = "Bạn muốn bắt đầu lúc nào, kết thúc trước mấy giờ" + (" và đi bằng phương tiện gì?" if "vehicle" in miss else "?")
        self._set_pending(st, "clarify_slot", [{"option_id": "veh:walk", "label": "Đi bộ"}, {"option_id": "veh:motorbike", "label": "Xe máy"},
                                               {"option_id": "veh:car", "label": "Ô tô"}, {"option_id": "veh:taxi", "label": "Taxi/Grab"}] if "vehicle" in miss else [],
                          "plan_slots", {"resume": {"intent": "REQUEST_PLAN", "patch": {}}, "missing": miss})
        R.blocks.append(self._clarify_block(st, q))
        R.tools.append("clarify")

    def _do_request_plan(self, R, u):
        st = R.state
        if not st.shortlist and self.guided:
            st.goal = "tour"
            if u.patch:
                self._apply_patch(R, u.patch)
            if not self._guided_continue(R):
                self._present_summary(R)
            return
        if not st.shortlist:
            self._set_pending(st, "clarify_intent", [{"option_id": "search", "label": "Tìm quán gần tôi"}, {"option_id": "discover", "label": "Gợi ý món"}], None, {})
            R.blocks.append(text_b("Danh sách chọn đang trống — mình chỉ lập lịch trình từ các quán bạn đã chọn."))
            R.blocks.append(self._clarify_block(st, "Bạn muốn tìm quán hay xem gợi ý món trước?"))
            return
        if u.patch:
            self._apply_patch(R, u.patch)
        miss = self._plan_missing(st)
        if miss:
            self._ask_plan_slots(R, miss)
            return
        self._present_summary(R)

    def obligation_open(self, st) -> bool:
        """Public: True while an allergy/budget-scope obligation forbids planning (the API refuses a plan_request then)."""
        return self._open_obligation(st)

    def _open_obligation(self, st) -> bool:
        """Safety/scope questions that must be answered before any plan, whatever pending replaced them (contract v1.9 rule 1)."""
        if not self.guided:
            return False
        b = st.profile["budget"]
        return bool(st.allergy_unresolved or any(a.source == "ai_unconfirmed" for a in st.allergies)
                    or (b.known() and not b.scope and (st.profile["party_size"].value or 2) >= 2))

    def _present_summary(self, R):
        st = R.state
        if self._open_obligation(st):
            st.pending = None
            if self._guided_continue(R):
                return

        def status(f):
            """Contract v1.8 summary status: user | inferred | default | missing."""
            return ("user" if f.source in ("user_said", "ui_form") else f.source) if f.known() else "missing"

        def item(i, label, f, fmt=lambda v: str(v)):
            return {"id": i, "label": label, "value": fmt(f.value) if f.known() else None,
                    "status": status(f), "editable": True}
        b = st.profile["budget"]
        items = [
            item("area", "Điểm xuất phát", st.profile["area"], lambda v: v.get("label", "")),
            item("start_time", "Bắt đầu", st.profile["start_time"]),
            item("end_time", "Kết thúc trước", st.profile["end_time"]),
            item("party_size", "Số người", st.profile["party_size"], lambda v: f"{v} người"),
            item("vehicle", "Phương tiện", st.profile["vehicle"], lambda v: VEHICLES.get(v, v)),
            {"id": "budget", "label": "Ngân sách", "value": (tools.fmt_vnd(b.value) + {"per_person": " mỗi người", "group": " cả nhóm"}.get(b.scope, " (chưa rõ phạm vi)")) if b.known() else None,
             "status": status(b), "editable": True},
            item("tastes", "Khẩu vị", st.profile["tastes"], lambda v: ", ".join(v)),
            {"id": "allergies", "label": "Dị ứng", "value": ", ".join(a.term for a in st.allergies) or None,
             "status": "user" if st.allergies else "missing", "editable": True},
            item("max_leg_min", "Đi bộ tối đa mỗi chặng", st.profile["max_leg_min"], lambda v: f"{v} phút"),
        ]
        warnings = []
        if st.allergies:
            warnings.append({"code": "allergy_unknown", "text": SAFETY_LINE})
        if not b.known() or not b.scope:
            warnings.append({"code": "price_not_per_person", "text": "Giá quán là khoảng giá của quán, không phải giá theo người; mình không khẳng định tổng chi phí hay ngân sách."})
        if st.profile["vehicle"].known() and st.profile["vehicle"].value != "walk":
            warnings.append({"code": "eta_estimate", "text": "Thời gian di chuyển chỉ là ước tính theo tốc độ trung bình, không phải thời gian thực của dịch vụ xe."})
        warnings.append({"code": "hours_unknown", "text": "Giờ mở cửa theo nguồn chưa rõ áp dụng ngày nào nên mình không khẳng định quán đang mở."})
        short = [{"venue_id": s.venue_id, "name": tools.clean_text(self.by_id[s.venue_id].name, 80, "Quán (tên không hiển thị được)"), "status": s.status} for s in st.shortlist]
        self._set_pending(st, "confirm_plan", [{"option_id": "confirm_yes", "label": "Xác nhận và tạo lịch trình"}, {"option_id": "confirm_no", "label": "Sửa thông tin"}], None, {})
        R.blocks.append(text_b("Mình tóm tắt trước khi lập lịch trình. Bạn xem và xác nhận nhé."))
        R.blocks.append({"type": "confirm_summary", "items": items, "shortlist": short, "missing": [], "warnings": warnings})

    def _phase(self, st, plan_request):
        if plan_request:
            return "planned"
        if st.pending and st.pending.kind == "confirm_plan":
            return "confirm"
        if st.phase == "planned":
            return "planned"  # stays planned until the user starts over; tour_stale tells the UI it needs recomputing
        if st.shortlist:
            return "choose"
        return "discover"

    # ---- detail / modify / unknown
    def _do_ask_detail(self, R, u):
        st = R.state
        fld = u.patch.get("field", "detail")
        if fld == "allergy_safety":
            R.blocks.append(notice_b("safety", "allergy_unknown", "Mình không thể nói một quán an toàn cho người dị ứng: " + SAFETY_LINE))
            return
        scope = "results" if u.refs and all(len(r) == 1 and r.isalpha() for r in u.refs) else "shortlist" if u.refs and not st.last_results else "results"
        ids, _ = self._refs(u.refs, st, scope) if u.refs else ([], [])
        if not ids and len(st.last_results) == 1:
            ids = [st.last_results[0]["venue_id"]]
        if not ids:
            R.blocks.append(text_b("Mình chưa rõ bạn hỏi quán nào; hãy nói theo nhãn (ví dụ: \"quán A mở lúc mấy giờ\")."))
            return
        v = self.by_id[ids[0]]
        crit = {"hours": "hours", "price": "price", "parking_car": "parking_car", "address": None, "menu": None, "detail": None}.get(fld)
        if fld == "address":
            R.blocks.append(text_b(f"Địa chỉ theo nguồn: {v.address or 'chưa rõ'}."))
        elif fld == "menu":
            R.blocks.append(text_b("Dữ liệu của mình không có thực đơn hay món/giá từng món nên chưa rõ quán có món hoặc điều chỉnh (ví dụ ít đường) hay không; bạn cần hỏi quán."))
        elif crit:
            cell = tools._cell(crit, v, self._centre(st))
            R.blocks.append(text_b(f"{tools.CRITERIA[crit]} của {tools.clean_text(v.name)}: {cell['value']}" + (f" ({cell['note']})" if cell.get("note") else "") + "."))
        else:
            R.blocks.append({"type": "venue_cards", "title": None, "cards": [tools.card("A", v, tools.distance_m(self._centre(st), v), self._to_prefs(st, R.prefs),
                                                                                      allergies=[a.term for a in st.allergies])]})
        R.tools.append("detail")

    def _do_modify_plan(self, R, u):
        st = R.state
        if st.phase != "planned":
            R.blocks.append(text_b("Mình chưa lập lịch trình. Khi có lịch trình, bạn có thể nói \"đổi quán thứ hai\" hoặc dùng nút Đổi quán."))
        elif u.refs:
            R.replace_request = {"refs": list(u.refs)}
            R.blocks.append(text_b("Mình sẽ tìm quán thay thế cho quán đó và giữ nguyên các quán còn lại."))
        else:
            R.blocks.append(text_b("Bạn muốn đổi quán nào trong lịch trình? Hãy nói \"đổi quán thứ hai\" hoặc bấm Đổi quán trên lịch trình."))
        R.tools.append("modify_plan")

    # ---- results of planning (called by the API layer after the planner ran)
    def after_plan(self, st: ChatState, tour) -> list:
        """Blocks for the planner outcome. A conflict becomes concrete options; nothing is relaxed silently."""
        R = TurnResult(st, Preferences(), [], "REQUEST_PLAN")
        if tour.stops:
            st.phase, st.tour_stale = "planned", False
            names = [tools.clean_text(self.by_id[x.venue_id].name, 80, "quán") for x in tour.stops if x.venue_id in self.by_id]
            walk = f" Tổng đi bộ khoảng {tour.walk_minutes} phút (ước tính)." if tour.walk_minutes is not None else ""
            return [text_b("Mình đã lập lịch trình từ đúng " + str(len(names)) + " quán bạn đã chọn: " + " → ".join(names) + "." + walk +
                           " Giờ mở cửa, giá theo người và tuyến đường thật chưa được xác minh — xem phần bằng chứng.")]
        st.phase = "choose"
        reasons = " ".join(tools.clean_text(r, 240) for r in tour.reasons)  # reasons may quote venue names: dataset text stays neutralised
        blocks = [notice_b("warning", "plan_conflict", reasons or "Chưa lập được lịch trình thoả các ràng buộc hiện tại.")]
        if tour.status == "insufficient_evidence":
            blocks.append(text_b("Chế độ nghiêm ngặt cần bằng chứng đã xác minh mà dữ liệu hiện chưa có; bạn có thể chuyển sang chế độ khám phá."))
            return blocks
        opts = []
        leg = st.profile["max_leg_min"]
        cur = leg.value if leg.known() else 20
        if cur < 40:
            opts.append({"option_id": f"relax_leg:{min(60, cur + 10)}", "label": f"Cho phép đi tối đa {min(60, cur + 10)} phút mỗi chặng"})
        veh = st.profile["vehicle"].value
        if veh in (None, "walk"):
            opts.append({"option_id": "vehicle:motorbike", "label": "Đi xe máy thay vì đi bộ"})
        if st.profile["end_time"].known() or st.profile["duration_min"].known():
            opts.append({"option_id": "time:+60", "label": "Kéo dài thêm 1 giờ"})
        if len(st.shortlist) > 1:
            far = self._farthest(st)
            if far:
                opts.append({"option_id": "drop:" + far, "label": "Bỏ " + tools.clean_text(self.by_id[far].name, 40)})
        self._set_pending(st, "clarify_intent", opts[:4], None, {"conflict": True})
        blocks.append(self._clarify_block(st, "Bạn muốn điều chỉnh thế nào? (mình không tự đổi gì khi chưa hỏi bạn)"))
        return blocks

    def _farthest(self, st):
        from app.planner.interfaces import haversine_km
        pts = [(s.venue_id, (self.by_id[s.venue_id].lat, self.by_id[s.venue_id].lon)) for s in st.shortlist if s.venue_id in self.by_id and s.status != "kept"]
        if not pts:
            return None
        cx = sum(p[1][0] for p in pts) / len(pts)
        cy = sum(p[1][1] for p in pts) / len(pts)
        return max(pts, key=lambda p: (haversine_km((cx, cy), p[1]), p[0]))[0]

    def _apply_conflict_option(self, R, opt: str):
        st = R.state
        kind, _, val = opt.partition(":")
        if kind == "relax_leg":
            st.set_field("max_leg_min", int(val))
            R.blocks.append(text_b(f"Ok, mình cho phép đi tối đa {val} phút mỗi chặng."))
        elif kind == "vehicle":
            st.set_field("vehicle", val)
            R.blocks.append(text_b(f"Ok, mình đổi phương tiện sang {VEHICLES.get(val, val)} (thời gian vẫn chỉ là ước tính)."))
        elif kind == "time":
            if st.profile["end_time"].known():
                h, m = int(st.profile["end_time"].value[:2]), int(st.profile["end_time"].value[3:])
                t = min(23 * 60 + 59, h * 60 + m + 60)
                st.set_field("end_time", f"{t // 60:02d}:{t % 60:02d}")
            elif st.profile["duration_min"].known():
                st.set_field("duration_min", min(720, st.profile["duration_min"].value + 60))
            R.blocks.append(text_b("Ok, mình kéo dài thêm 1 giờ."))
        elif kind == "drop":
            st.shortlist = [x for x in st.shortlist if x.venue_id != val]
            R.blocks.append(text_b("Ok, mình bỏ quán đó khỏi danh sách."))
        if st.shortlist:
            self._present_summary(R)  # the user confirms again; nothing is planned silently

    def _no_result_option(self, R, opt, pend):
        st = R.state
        ctx = pend.context or {}
        if opt == "widen":
            self._do_search_venues(R, Understanding("SEARCH_VENUES", {"dish": ctx.get("dish"), "radius_m": min(5000, int(ctx.get("radius_m", 1500)) * 2)}))
        elif opt.startswith("dish:"):
            name = opt.split(":", 1)[1]
            e = next((d for d in knowledge.DISHES if d[1] == name), None)
            self._do_search_venues(R, Understanding("SEARCH_VENUES", {"dish": (e[1].lower() if e else name)}))
        else:
            st.profile["area"] = Field_()
            self._ask_area(R, "SEARCH_VENUES", {"dish": ctx.get("dish")} if ctx.get("dish") else {})

    def swap_shortlist(self, st: ChatState, old_id: str, new_id: str) -> None:
        for s in st.shortlist:
            if s.venue_id == old_id:
                s.venue_id = new_id

    def _do_unknown(self, R, u):
        st = R.state
        R.blocks.append(text_b("Mình chưa hiểu rõ ý bạn. Bạn có thể hỏi món ăn, nhờ tìm quán quanh một khu vực, hoặc nói \"so sánh A và B\"."))
        if not st.pending:
            self._set_pending(st, "clarify_intent", [{"option_id": "search", "label": "Tìm quán gần tôi"}, {"option_id": "discover", "label": "Gợi ý món"}], None, {})
            R.blocks.append(self._clarify_block(st, "Bạn muốn bắt đầu bằng cách nào?"))
        R.tools.append("clarify")
