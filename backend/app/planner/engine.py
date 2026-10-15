"""Deterministic tour planning, replace-one-stop and hard-constraint validation.

No I/O, no LLM. Unknown evidence is carried through as unknown, never defaulted to a pass.
"""
from __future__ import annotations

from typing import Optional

from .interfaces import RouteMatrixProvider, StraightLineEstimator
from .types import Leg, Preferences, ReplaceResult, Stop, Tour, Venue

POOL_CAP = 14
MIN_PREFERRED_STOPS = 3


def missing_slots(prefs: Preferences) -> list:
    out = []
    if prefs.origin is None:
        out.append("origin")
    if prefs.duration_min is None:
        out.append("duration_min")
    if prefs.budget_vnd is not None and prefs.budget_scope is None:
        out.append("budget_scope")
    return out


def _text(v: Venue) -> str:
    return (v.name + " " + " ".join(v.dish_tags)).casefold()


def eligible(v: Venue, prefs: Preferences) -> bool:
    if v.city != prefs.city or v.online_only or not v.geo_ok:
        return False
    if not (-90 <= v.lat <= 90 and -180 <= v.lon <= 180) or (v.lat == 0 and v.lon == 0):
        return False
    if v.price_min_vnd is not None and v.price_min_vnd < 0:
        return False
    if prefs.budget_vnd is not None and v.price_max_vnd is None:
        return False  # budget can't be checked; unknown price is never free
    t = _text(v)
    if any(x.strip().casefold() in t for x in prefs.exclusions if x.strip()):
        return False
    wanted = [x.strip().casefold() for x in prefs.interests if x.strip()]
    if wanted and not any(w in t for w in wanted):
        return False
    return True


def _open_at(v: Venue, weekday: int, start: int, end: int) -> bool:
    return any(s <= start and end <= e for s, e in v.hours.get(weekday, []))


def _possible_alone(v: Venue, prefs: Preferences) -> bool:
    """Necessary conditions any single stop must meet; safe to prune before the search pool cap."""
    if prefs.duration_min is not None and prefs.visit_minutes > prefs.duration_min:
        return False
    if prefs.budget_vnd is not None and v.price_max_vnd is not None:
        spend = v.price_max_vnd * (prefs.party_size or 1) if prefs.budget_scope == "group" else v.price_max_vnd
        if spend > prefs.budget_vnd:
            return False
    return True


def _evaluate(seq: list, prefs: Preferences, routes: RouteMatrixProvider) -> tuple:
    """Return (Tour, None) or (None, violation)."""
    if prefs.origin is None or prefs.duration_min is None:
        return None, "missing required slots"
    stops, point, clock, walk_total, upper = [], prefs.origin, prefs.start_time_min, 0, 0
    legs_sources = set()
    for i, v in enumerate(seq):
        leg: Leg = routes.leg(point, (v.lat, v.lon))
        if leg.minutes is None:
            return None, f"leg to {v.id} has unknown duration"
        if leg.minutes > prefs.max_leg_min:
            return None, f"leg to {v.id} is {leg.minutes} min, over {prefs.max_leg_min}"
        legs_sources.add(leg.source)
        walk_total += leg.minutes
        arrive = clock + leg.minutes if clock is not None else None
        depart = arrive + prefs.visit_minutes if arrive is not None else None
        if depart is not None and depart >= 1440:
            return None, f"{v.id} visit would cross midnight (no day-offset in contract v1)"
        h_ev, open_now = "unknown", None
        if v.hours is not None and arrive is not None and prefs.weekday is not None:
            open_now = _open_at(v, prefs.weekday, arrive, depart)
            h_ev = "verified"
            if not open_now:
                return None, f"{v.id} is closed at arrival"
        stops.append(Stop(v.id, i + 1, leg, arrive, depart, h_ev, open_now, v.price_evidence))
        upper += v.price_max_vnd or 0
        clock, point = depart, (v.lat, v.lon)
    if walk_total + prefs.visit_minutes * len(seq) > prefs.duration_min:
        return None, "total time exceeds duration"
    unknowns = set()
    if prefs.budget_vnd is not None:
        spend = upper * (prefs.party_size or 1) if prefs.budget_scope == "group" else upper
        if spend > prefs.budget_vnd:
            return None, "venue range upper sum exceeds budget"
        if prefs.budget_scope == "group" and prefs.party_size is None:
            unknowns.add("party_size")
    if any(s.hours_evidence != "verified" for s in stops):
        unknowns.add("hours")
    if any(s.price_evidence != "verified" for s in stops):
        unknowns.add("price_per_person")
    if "provider_route" not in legs_sources or legs_sources != {"provider_route"}:
        unknowns.add("route")
    src = "provider_route" if legs_sources == {"provider_route"} else (
        "straight_line_estimate" if "straight_line_estimate" in legs_sources else "unknown")
    status = "verified_feasible" if not unknowns else "conditional"
    reasons = tuple(f"Chưa xác minh: {u}" for u in sorted(unknowns))
    return Tour(status, tuple(stops), reasons, (), tuple(sorted(unknowns)), upper, walk_total, src,
                (), {"visit_minutes_per_stop": prefs.visit_minutes, "max_leg_min": prefs.max_leg_min}), None


def _strict_ok(t: Tour) -> bool:
    return t.status == "verified_feasible"


def _diversity(seq) -> int:
    return len({tag.casefold() for v in seq for tag in v.dish_tags})


def _diagnose(venues, prefs, routes) -> tuple:
    reasons, changes = [], []
    city = [v for v in venues if v.city == prefs.city]
    if not city:
        return (f"Không có quán nào ở '{prefs.city}'.",), ("Chọn khu vực có dữ liệu.",)
    base = [v for v in city if not v.online_only and v.geo_ok]
    if not base:
        return ("Không có quán hợp lệ (đều online hoặc thiếu toạ độ).",), ()
    pool = [v for v in base if eligible(v, prefs)]
    if not pool:
        reasons.append("Không quán nào khớp sở thích/loại trừ hoặc có giá để kiểm tra ngân sách.")
        changes.append("Nới sở thích hoặc bỏ bớt loại trừ.")
        return tuple(reasons), tuple(changes)
    if prefs.duration_min is not None and prefs.duration_min < prefs.visit_minutes:
        reasons.append("Thời lượng ngắn hơn thời gian ghé một quán.")
        changes.append(f"Tăng thời lượng lên ít nhất {prefs.visit_minutes} phút.")
    near = [v for v in pool if prefs.origin and routes.leg(prefs.origin, (v.lat, v.lon)).minutes is not None
            and routes.leg(prefs.origin, (v.lat, v.lon)).minutes <= prefs.max_leg_min]
    if not near:
        reasons.append(f"Không quán nào trong {prefs.max_leg_min} phút đi bộ từ điểm xuất phát.")
        changes.append("Chọn điểm xuất phát gần khu ăn uống hơn hoặc tăng giới hạn đi bộ.")
    elif prefs.budget_vnd is not None and min(v.price_max_vnd for v in near) > prefs.budget_vnd:
        reasons.append("Ngân sách thấp hơn mức giá cao nhất của mọi quán gần đó.")
        changes.append("Tăng ngân sách hoặc chọn nhóm món rẻ hơn.")
    if prefs.start_time_min is not None and prefs.weekday is not None:
        reasons.append("Có thể mọi quán gần đó đóng cửa vào giờ đã chọn.")
        changes.append("Đổi giờ bắt đầu hoặc ngày.")
    if not reasons:
        reasons.append("Không có lộ trình thoả đồng thời thời gian, ngân sách và giờ mở cửa.")
        changes.append("Giảm số điểm dừng hoặc tăng thời lượng/ngân sách.")
    return tuple(reasons), tuple(changes)


def plan_tour(venues: list, prefs: Preferences, routes: Optional[RouteMatrixProvider] = None,
              pool_cap: int = POOL_CAP) -> Tour:
    routes = routes or StraightLineEstimator()
    missing = missing_slots(prefs)
    if missing:
        return Tour("insufficient_evidence", reasons=(f"Thiếu thông tin bắt buộc: {', '.join(missing)}",),
                    proposed_changes=("Bổ sung thông tin còn thiếu.",), unknowns=tuple(missing))
    ranked = sorted((v for v in venues if eligible(v, prefs) and _possible_alone(v, prefs)),
                    key=lambda v: (routes.leg(prefs.origin, (v.lat, v.lon)).km, v.id))
    pool = ranked[:pool_cap]
    truncated = len(ranked) > len(pool)
    best = {"key": None, "tour": None}
    limit = max(1, min(prefs.max_stops, 5))

    def consider(seq):
        tour, _ = _evaluate(seq, prefs, routes)
        if tour is None or (prefs.mode == "strict" and not _strict_ok(tour)):
            return
        key = (-len(seq), -_diversity(seq), tour.walk_minutes, tuple(v.id for v in seq))
        if best["key"] is None or key < best["key"]:
            best["key"], best["tour"] = key, tour

    def dfs(seq):
        if seq:
            consider(seq)
        if len(seq) == limit:
            return
        for v in pool:
            if v in seq:
                continue
            nxt = seq + [v]
            # Prune: a prefix that violates a hard constraint cannot be repaired by extending.
            tour, _ = _evaluate(nxt, prefs, routes)
            if tour is None:
                continue
            dfs(nxt)

    dfs([])
    t = best["tour"]
    if t is None:
        reasons, changes = _diagnose(venues, prefs, routes)
        status = "no_solution"
        if prefs.mode == "strict" and any(eligible(v, prefs) for v in venues):
            status = "insufficient_evidence"
            reasons = ("Chế độ nghiêm ngặt cần giờ mở cửa, giá theo người và tuyến đường đã xác minh; "
                       "chưa có đủ bằng chứng.",) + reasons
            changes = ("Dùng chế độ khám phá để xem gợi ý có điều kiện.",) + changes
        if truncated:
            reasons = reasons + (f"Chỉ tìm trong {len(pool)} quán gần nhất trong {len(ranked)} quán phù hợp; "
                                 "có thể còn lựa chọn xa hơn chưa được xét.",)
        return Tour(status, reasons=reasons, proposed_changes=changes,
                    assumptions={"search_pool": len(pool), "eligible_total": len(ranked), "pool_truncated": truncated})
    if truncated:
        t = Tour(t.status, t.stops, t.reasons, t.proposed_changes, t.unknowns, t.venue_range_upper_sum_vnd,
                 t.walk_minutes, t.leg_source, t.locks,
                 {**t.assumptions, "search_pool": len(pool), "eligible_total": len(ranked), "pool_truncated": True})
    if len(t.stops) < MIN_PREFERRED_STOPS and limit >= MIN_PREFERRED_STOPS:
        t = Tour(t.status, t.stops, t.reasons + (f"Chỉ tìm được {len(t.stops)} điểm dừng thoả ràng buộc.",),
                 ("Tăng thời lượng hoặc ngân sách để có thêm điểm dừng.",), t.unknowns,
                 t.venue_range_upper_sum_vnd, t.walk_minutes, t.leg_source, t.locks, t.assumptions)
    return t


def replace_stop(venues: list, prefs: Preferences, tour: Tour, venue_id: str,
                 routes: Optional[RouteMatrixProvider] = None) -> ReplaceResult:
    """Replace one stop; every other stop keeps venue identity and position (locks)."""
    routes = routes or StraightLineEstimator()
    ids = [s.venue_id for s in tour.stops]
    if venue_id not in ids:
        return ReplaceResult(False, tour, (f"Quán {venue_id} không nằm trong tour.",))
    by_id = {v.id: v for v in venues}
    if any(i not in by_id for i in ids):
        return ReplaceResult(False, tour, ("Dữ liệu quán của tour không còn đầy đủ.",))
    pos = ids.index(venue_id)
    locks = tuple(i for i in ids if i != venue_id)
    base = [by_id[i] for i in ids]
    best_key, best_tour = None, None
    for c in venues:
        if c.id in ids or not eligible(c, prefs):
            continue
        seq = base[:pos] + [c] + base[pos + 1:]
        t, _ = _evaluate(seq, prefs, routes)
        if t is None or (prefs.mode == "strict" and not _strict_ok(t)):
            continue
        key = (-_diversity(seq), t.walk_minutes, c.id)
        if best_key is None or key < best_key:
            best_key, best_tour = key, t
    if best_tour is None:
        return ReplaceResult(False, tour, ("Không có quán thay thế thoả mọi ràng buộc với các điểm dừng đã khoá.",))
    return ReplaceResult(True, best_tour.with_locks(locks), ())


def validate_tour(tour: Tour, venues: list, prefs: Preferences,
                  routes: Optional[RouteMatrixProvider] = None) -> list:
    """Hard-constraint checker. Empty list means valid."""
    routes = routes or StraightLineEstimator()
    if not tour.stops:
        return [] if tour.status in ("insufficient_evidence", "no_solution") else ["tour without stops claims success"]
    if tour.status in ("insufficient_evidence", "no_solution"):
        return ["tour has stops but a failure status"]
    by_id = {v.id: v for v in venues}
    ids = [s.venue_id for s in tour.stops]
    out = []
    if len(set(ids)) != len(ids):
        out.append("duplicate venue")
    if len(ids) > prefs.max_stops:
        out.append("too many stops")
    missing = [i for i in ids if i not in by_id]
    if missing:
        return out + [f"unknown venue ids: {missing}"]
    seq = [by_id[i] for i in ids]
    for v in seq:
        if not eligible(v, prefs):
            out.append(f"{v.id} is not eligible for these preferences")
    if len(seq) > 1 and out:
        return out
    t, why = _evaluate(seq, prefs, routes)
    if t is None:
        return out + [why]
    # Compare every returned claim with an independent recomputation (no trust in the payload).
    if tour.status != t.status:
        out.append(f"status {tour.status} != recomputed {t.status}")
    if prefs.mode == "strict" and t.status != "verified_feasible":
        out.append("strict mode requires verified_feasible")
    if tour.venue_range_upper_sum_vnd != t.venue_range_upper_sum_vnd:
        out.append("venue_range_upper_sum_vnd mismatch")
    if tour.walk_minutes != t.walk_minutes:
        out.append("walk_minutes mismatch")
    if tour.leg_source != t.leg_source:
        out.append("leg_source mismatch")
    if set(tour.unknowns) != set(t.unknowns):
        out.append("unknowns mismatch")
    for got, want in zip(tour.stops, t.stops):
        if (got.venue_id, got.order) != (want.venue_id, want.order):
            out.append(f"stop order mismatch at {want.order}")
        if got.leg_from_previous != want.leg_from_previous:
            out.append(f"leg mismatch at {want.venue_id}")
        if (got.arrive_min, got.depart_min) != (want.arrive_min, want.depart_min):
            out.append(f"timeline mismatch at {want.venue_id}")
        if (got.hours_evidence, got.open_at_arrival, got.price_evidence) != (
                want.hours_evidence, want.open_at_arrival, want.price_evidence):
            out.append(f"evidence mismatch at {want.venue_id}")
    return out
