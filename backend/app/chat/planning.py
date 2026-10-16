"""Turn a confirmed shortlist into a tour: the selected venues are the pool, none may be dropped silently.

If the constraints cannot hold ALL selected venues the result is a `no_solution` tour that names the conflict and
the options (never a smaller tour the user did not ask for). Planner invariants (validate_tour) are unchanged.
"""
from __future__ import annotations

from dataclasses import replace
from typing import Optional

from app.planner import allergens, engine
from app.planner.interfaces import StraightLineEstimator
from app.planner.types import Preferences, Tour

# Average urban speeds for non-walking vehicles: ETA is an ESTIMATE (straight-line x detour), never a service quote.
VEHICLE_SPEED_KMH = {"walk": 4.8, "motorbike": 20.0, "car": 16.0, "taxi": 16.0}


def routing_for(vehicle: Optional[str], default):
    if vehicle in (None, "walk"):
        return default
    return StraightLineEstimator(speed_kmh=VEHICLE_SPEED_KMH.get(vehicle, 16.0))


def plan_selected(venues_by_id: dict, ids: list, prefs: Preferences, routing, vehicle: Optional[str] = None,
                  quality_weight: float = 1.0) -> Tour:
    pool = [venues_by_id[i] for i in ids if i in venues_by_id]
    if not pool:
        return Tour("no_solution", reasons=("Danh sách quán đã chọn không còn trong dữ liệu.",),
                    proposed_changes=("Chọn lại quán.",))
    blocked = [v.name for v in pool if allergens.allergen_excluded(v, prefs.allergies)]
    if blocked:
        return Tour("no_solution", reasons=("Quán " + ", ".join(blocked) + " có tên/nhóm món liên quan tới tác nhân dị ứng bạn nêu.",),
                    proposed_changes=("Bỏ quán đó khỏi danh sách hoặc kiểm tra lại với quán trước khi quyết định.",))
    p = replace(prefs, interests=(), max_stops=min(5, len(pool)))  # discovery interests are irrelevant; every hard preference stays (mode, exclusions, allergies, budget)
    r = routing_for(vehicle, routing)
    tour = engine.plan_tour(pool, p, r, quality_weight=quality_weight)
    if tour.status == "insufficient_evidence" and not tour.stops:
        return tour  # strict mode: the planner states what evidence is missing; never relaxed here
    if tour.status == "no_solution" or len(tour.stops) < len(pool):
        got = len(tour.stops)
        reasons = (f"Không thể xếp đủ {len(pool)} quán bạn đã chọn trong các ràng buộc hiện tại (chỉ xếp được {got}).",) + tuple(tour.reasons)
        return Tour("no_solution", reasons=reasons,
                    proposed_changes=("Tăng thời lượng hoặc bỏ bớt một quán.", "Nới giới hạn đi bộ mỗi chặng hoặc đổi phương tiện.",
                                      "Đổi quán quá xa các quán còn lại."),
                    unknowns=tour.unknowns)
    errors = engine.validate_tour(tour, pool, p, r)
    if errors:
        return Tour("no_solution", reasons=("Lịch trình không qua kiểm tra nội bộ nên mình không hiển thị.",), proposed_changes=())
    return tour
