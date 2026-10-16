"""Generate contracts/fixtures/venues.chat.synthetic.json (deterministic, 144 clearly synthetic venues).

Used only by chat scenarios/tests. Real street/district names are public geography; venue names are fictional.
Run: python tools/gen_chat_fixture.py
"""
import json
from pathlib import Path

DISTRICTS = {  # district -> (lat, lon, [streets])
    "Hoàn Kiếm": (21.0285, 105.8522, ["Hàng Bún", "Hàng Gai", "Lò Sũ", "Tạ Hiện"]),
    "Ba Đình": (21.0368, 105.8342, ["Hàng Bột", "Đội Cấn", "Nguyễn Thái Học"]),
    "Cầu Giấy": (21.0371, 105.7886, ["Xuân Thủy", "Trần Thái Tông", "Phạm Văn Đồng"]),
    "Đống Đa": (21.0187, 105.8270, ["Tây Sơn", "Khâm Thiên", "Láng Hạ"]),
    "Hai Bà Trưng": (21.0095, 105.8570, ["Bạch Mai", "Phố Huế", "Minh Khai"]),
    "Tây Hồ": (21.0690, 105.8230, ["Xuân Diệu", "Quảng An", "Lạc Long Quân"]),
}
DISHES = [  # (tag list, name stem, price range, meals, cuisine)
    (["Bún", "Món nước"], "Bún Thử", (30000, 60000), ["Buổi trưa", "Buổi tối"]),
    (["Món nước", "Phở"], "Phở Thử", (35000, 75000), ["Buổi sáng", "Buổi trưa"]),
    (["Hải sản", "Cua"], "Cua Biển Thử", (150000, 450000), ["Buổi tối"]),
    (["Hải sản", "Ốc"], "Ốc Thử", (40000, 120000), ["Buổi xế", "Buổi tối"]),
    (["Bánh mì", "Ăn vặt - Ăn nhẹ"], "Bánh Mì Thử", (15000, 40000), ["Buổi sáng", "Buổi xế"]),
    (["Chè", "Tráng miệng"], "Chè Thử", (15000, 45000), ["Buổi xế", "Buổi tối"]),
    (["Cà phê", "Thức uống"], "Cà Phê Thử", (25000, 70000), ["Buổi sáng", "Buổi xế"]),
    (["Nem", "Ăn vặt - Ăn nhẹ"], "Nem Thử", (30000, 80000), ["Buổi trưa", "Buổi xế"]),
    (["Lẩu", "Bò"], "Lẩu Bò Thử", (120000, 300000), ["Buổi tối"]),
    (["Cơm", "Gà"], "Cơm Gà Thử", (40000, 90000), ["Buổi trưa", "Buổi tối"]),
    (["Trà sữa", "Thức uống"], "Trà Sữa Thử", (25000, 60000), ["Buổi xế", "Buổi tối"]),
    (["Kem", "Tráng miệng"], "Kem Thử", (20000, 50000), ["Buổi xế"]),
]
AMEN = ["Có wifi", "Giữ xe máy miễn phí", "Có máy lạnh & điều hòa", "Có bàn ngoài trời", "Có chỗ đậu ôtô", "Nên đặt trước"]
AUD = [["Ăn gia đình"], ["Họp nhóm"], ["Ăn gia đình", "Họp nhóm"], [], ["Hẹn hò"], ["Ăn một mình"]]


def build():
    rows, n = [], 0
    for di, (district, (lat, lon, streets)) in enumerate(DISTRICTS.items()):
        for k, (tags, stem, price, meals) in enumerate(d for d in DISHES for _ in (0, 1)):
            n += 1
            i = di * 7 + k * 3 + (k % 2) * 5
            street = streets[(di + k) % len(streets)]
            count = [1, 3, 8, 22, 47, 130, 260][(di + k * 2) % 7]
            rating10 = [None, 6.5, 7.4, 8.1, 8.8, 9.3][(di * 5 + k) % 6]
            row = {
                "id": f"CHT-{n:03d}", "name": f"[SYNTHETIC] {stem} {n}", "city": "Hà Nội", "district": district,
                "address": f"Số {10 + n} {street}, {district}, Hà Nội",
                "lat": round(lat + ((i % 9) - 4) * 0.0011, 6), "lon": round(lon + ((i % 7) - 3) * 0.0013, 6),
                "source_url": f"https://example.invalid/synthetic/{n}", "dish_tags": tags, "online_only": False, "geo_ok": True,
                "price_min_vnd": price[0], "price_max_vnd": price[1], "price_evidence": "estimate",
                "hours": None, "hours_display": "Nguồn ghi: 07:00 - 22:00 (chưa rõ áp dụng ngày nào)",
                "synthetic": True, "rating_value": rating10, "rating_scale_max": 10 if rating10 else None,
                "review_count": count if rating10 else None, "suitable_meals": meals,
                "audiences": AUD[(di + k) % len(AUD)], "cuisine_styles": ["Món Việt"],
                "amenities_yes": [a for j, a in enumerate(AMEN) if (n + j) % 3 == 0],
                "amenities_no": [], "capacity_value": [None, 20, 40, 80, 120][(n % 5)],
                "prep_time_min": [None, 5, 10, 15][(n % 4)], "source_fetched_at": "2026-10-01T00:00:00Z",
            }
            row["prep_time_max"] = row["prep_time_min"] + 10 if row["prep_time_min"] is not None else None
            for j, key in enumerate(("rating_quality", "rating_location", "rating_service", "rating_space", "rating_price")):
                row[key] = round(max(0, min(10, rating10 + (j - 2) * 0.2)), 1) if rating10 is not None else None
            rows.append(row)
    return {"_label": "SYNTHETIC chat fixture - fictional venues, public street names only", "synthetic": True, "venues": rows}


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "contracts" / "fixtures" / "venues.chat.synthetic.json"
    out.write_text(json.dumps(build(), ensure_ascii=False, indent=1), encoding="utf-8")
    print("wrote", out, len(build()["venues"]), "venues")
