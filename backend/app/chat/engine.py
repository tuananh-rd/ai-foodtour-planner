"""Conversation engine: one deterministic reducer per user turn (contract v1.8).

handle(state, prefs, text|action) -> TurnResult. The engine never calls the planner or a provider itself: it returns
`plan_request` when (and only when) the user confirmed a `confirm_plan` pending, and asks an optional `llm` callable to
understand low-confidence text. Every fact in a reply comes from `tools`; missing data is "Chưa rõ".
"""
from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Callable, Optional

from app.llm import safety_parse
from app.planner import allergens
from app.planner.relevance import fold_uncached
from app.planner.types import Preferences
from . import knowledge, tools
from .gazetteer import Gazetteer, Place
from .state import (MAX_ALLERGIES, MAX_SHORTLIST, Allergy, ChatState, Field_, Pending, ShortItem)
from .understand import CONFIDENT, Understanding, understand

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
    llm_calls: int = 0
    error: Optional[str] = None


def text_b(t): return {"type": "text", "text": t}
def notice_b(level, code, t): return {"type": "notice", "level": level, "code": code, "text": t}


class ChatEngine:
    def __init__(self, venues, gazetteer: Optional[Gazetteer] = None):
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
        if action:
            u = self._action_understanding(action, st)
            R.understanding = "action"
            if u is None:
                R.error = "invalid_action"
                return R
        else:
            u = understand(text or "", st, self.gz, prefs)
            if u.confidence < CONFIDENT and llm is not None:
                out = llm(text or "", self.compact(st), st.llm_used)  # app.chat.llm_understand.Outcome
                R.llm_calls = out.calls
                st.llm_used += out.calls
                llm_status = out.status or llm_status
                cand = self._from_llm(out.data) if out.data else None
                if cand:
                    u, R.understanding = cand, ("cache" if out.calls == 0 else "llm")
            st.remember("user", text or "", u.intent)
            if u.source == "rules" and u.confidence < LOW_CONFIDENCE:
                R.intent = "UNKNOWN"
                self._low_confidence(R, u, llm_status)
                return self._finish(R)
        R.intent = u.intent
        pend0 = st.pending
        self._dispatch(R, u)
        if pend0 is not None and R.state.pending is pend0 and "nudge" not in R.tools and R.intent not in ("ANSWER_PENDING", "AMBIGUOUS_ACK", "CONFIRM_YES", "CONFIRM_NO"):
            # The user moved on: a stale question must not linger (confirm_plan survives plain profile edits only).
            if not (pend0.kind == "confirm_plan" and R.intent in ("UPDATE_PROFILE", "ASK_DETAIL")):
                R.state.pending = None
        return self._finish(R)

    def _finish(self, R: TurnResult) -> TurnResult:
        R.prefs = self._to_prefs(R.state, R.prefs)
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
            return Understanding("ANSWER_PENDING", {"option": a["option_id"]}, [], 1.0, "action")
        if t in ("confirm_yes", "confirm_no"):
            return Understanding(t.upper(), {}, [], 1.0, "action")
        if t == "set_location":
            loc = a.get("location") or {}
            return Understanding("UPDATE_PROFILE", {"location": loc}, [], 1.0, "action")
        if t == "edit_profile":
            patch = {k: v for k, v in (a.get("patch") or {}).items() if k in
                     ("party_size", "budget_vnd", "budget_scope", "start_time", "end_time", "duration_min", "vehicle", "max_leg_min", "audience")}
            return Understanding("UPDATE_PROFILE", patch, [], 1.0, "action") if patch else None
        if t == "request_plan":
            return Understanding("REQUEST_PLAN", {}, [], 1.0, "action")
        if t == "search":
            q = (a.get("query") or "").strip()[:200]
            return Understanding("SEARCH_VENUES", {"dish": q} if q else {}, [], 1.0, "action")
        return None

    def _nudge(self, R, prefix=""):
        """Help answering the open question without repeating it (wording alternates, buttons stay in the earlier block)."""
        st = R.state
        p = st.pending
        n = sum(1 for a in st.asked if a.get("pending_id") == p.pending_id)
        st.asked.append({"pending_id": p.pending_id, "turn": st.turn_count})
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

    def _from_llm(self, data: dict) -> Optional[Understanding]:
        """`data` was already whitelisted/range-checked by llm_understand.sanitize; map it to an Understanding."""
        intent = data.get("intent")
        patch = dict(data.get("patch") or {})
        extra = {}
        terms = patch.pop("allergy", None)
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
        return {"type": "clarify", "pending_id": p.pending_id, "question": question, "options": list(p.options)}

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
            st2.turn_count = st.turn_count
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
        if u.patch.get("no_allergy"):
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
                st.allergies.append(Allergy(term, allergens.family_of(term), "user_said"))
                added.append(term)
        for term in sp.removed:
            st.allergies = [a for a in st.allergies if fold_uncached(a.term) != fold_uncached(term)]
            R.blocks.append(text_b(f"Đã bỏ \"{term}\" khỏi danh sách dị ứng. Bạn có thể thêm lại bất cứ lúc nào."))
        if added:
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
            R.blocks.append(text_b(msg))
        if sp.avoid:
            self._ask_avoid(R, sp.avoid)
        if u.patch and any(k in u.patch for k in ("party_size", "budget_vnd", "budget_scope", "start_time", "end_time", "duration_min",
                                                   "vehicle", "audience", "max_leg_min")):
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
        sp = u.extra.get("safety")
        self._ask_avoid(R, sp.avoid)
        R.tools.append("clarify")

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
            else:
                R.blocks.append(text_b("Mình chưa hiểu lựa chọn đó; bạn nói lại giúp mình nhé."))
            R.tools.append("answer_pending")
        elif pend.kind == "pick_venue":
            ids, bad = self._refs(u.refs or ([f"id:{u.patch['option']}"] if u.patch.get("option") else []), st, "results")
            if not ids:
                cands = pend.context.get("candidates") or []
                pick = next((c for c in cands if c == u.patch.get("option")), None)
                ids = [pick] if pick in self.by_id else []
            if not ids:
                R.blocks.append(text_b("Mình chưa rõ bạn chọn quán nào; hãy chọn một nút hoặc nói \"quán A\"."))
                return
            st.pending = None
            self._add_ids(R, ids)
            R.tools.append("shortlist_add")
        elif pend.kind == "confirm_plan":
            self._do_confirm_yes(R, u)

    def _option_to_patch(self, opt: str, patch: dict) -> dict:
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
            names.append(self.by_id[vid].name)
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
            opts.append({"option_id": vid, "label": f"{lab + ' — ' if lab else ''}{self.by_id[vid].name}"[:60]})
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
        gone = [self.by_id[i].name for i in ids if any(s.venue_id == i for s in st.shortlist)]
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

    def _present_summary(self, R):
        st = R.state

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
        short = [{"venue_id": s.venue_id, "name": self.by_id[s.venue_id].name, "status": s.status} for s in st.shortlist]
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
            R.blocks.append(text_b(f"{tools.CRITERIA[crit]} của {v.name}: {cell['value']}" + (f" ({cell['note']})" if cell.get("note") else "") + "."))
        else:
            R.blocks.append({"type": "venue_cards", "title": None, "cards": [tools.card("A", v, tools.distance_m(self._centre(st), v), self._to_prefs(st, R.prefs),
                                                                                      allergies=[a.term for a in st.allergies])]})
        R.tools.append("detail")

    def _do_modify_plan(self, R, u):
        st = R.state
        if st.phase != "planned" and not st.tour_stale:
            R.blocks.append(text_b("Mình chưa lập lịch trình. Khi có lịch trình, bạn có thể nói \"đổi quán thứ hai\" hoặc dùng nút Đổi quán."))
        else:
            R.blocks.append(text_b("Để đổi quán trong lịch trình, hãy dùng nút Đổi quán trên lịch trình; mình sẽ giữ nguyên các quán còn lại."))
        R.tools.append("none")

    def _do_unknown(self, R, u):
        st = R.state
        R.blocks.append(text_b("Mình chưa hiểu rõ ý bạn. Bạn có thể hỏi món ăn, nhờ tìm quán quanh một khu vực, hoặc nói \"so sánh A và B\"."))
        if not st.pending:
            self._set_pending(st, "clarify_intent", [{"option_id": "search", "label": "Tìm quán gần tôi"}, {"option_id": "discover", "label": "Gợi ý món"}], None, {})
            R.blocks.append(self._clarify_block(st, "Bạn muốn bắt đầu bằng cách nào?"))
        R.tools.append("clarify")
