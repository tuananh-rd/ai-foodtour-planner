"""Checked explanations: text is generated from validated Tour fields only, never free LLM claims."""
from __future__ import annotations

from app.planner.types import Tour, Venue

LABEL = {
    "verified_feasible": "Lịch trình đã đủ bằng chứng.",
    "conditional": "Gợi ý có điều kiện: một số thông tin chưa được xác minh.",
    "insufficient_evidence": "Chưa đủ bằng chứng để lập lịch trình đáng tin cậy.",
    "no_solution": "Không tìm được lịch trình thoả các ràng buộc.",
}
UNKNOWN_LABEL = {
    "hours": "giờ mở cửa theo ngày", "price_per_person": "giá theo người", "route": "tuyến đi bộ thực tế",
    "party_size": "số người", "origin": "điểm xuất phát", "duration_min": "thời lượng", "budget_scope": "phạm vi ngân sách",
}


def explain(tour: Tour, venues: list) -> str:
    by_id = {v.id: v for v in venues}
    parts = [LABEL[tour.status]]
    if tour.stops:
        names = [by_id[s.venue_id].name for s in tour.stops if s.venue_id in by_id]
        parts.append("Các điểm dừng: " + " → ".join(names) + ".")
        if tour.walk_minutes is not None:
            kind = "ước tính đường chim bay" if tour.leg_source == "straight_line_estimate" else "theo tuyến"
            parts.append(f"Tổng đi bộ khoảng {tour.walk_minutes} phút ({kind}).")
        parts.append("Tổng khoảng giá tối đa của quán: {:,} ₫ (không phải hoá đơn mỗi người).".format(
            tour.venue_range_upper_sum_vnd).replace(",", "."))
    if tour.unknowns:
        parts.append("Chưa biết: " + ", ".join(UNKNOWN_LABEL.get(u, u) for u in tour.unknowns) + ".")
    parts.extend(tour.reasons if not tour.stops else ())
    if tour.proposed_changes:
        parts.append("Đề xuất: " + " ".join(tour.proposed_changes))
    return " ".join(parts)
