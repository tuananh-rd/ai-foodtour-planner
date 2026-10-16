"""Local place resolution (no geocoder): districts, streets and a few landmarks derived from the dataset itself.

Resolution is approximate by design: the reply always says "đã hiểu là … (xấp xỉ)" so the user can correct it.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

from app.planner.relevance import fold_uncached

# Public landmarks (approximate coordinates; not dataset rows).
LANDMARKS = {
    "ho guom": ("Hồ Gươm", 21.0285, 105.8522), "ho hoan kiem": ("Hồ Gươm", 21.0285, 105.8522),
    "pho co": ("Phố cổ", 21.0340, 105.8510), "nha tho lon": ("Nhà thờ Lớn", 21.0287, 105.8490),
    "ho tay": ("Hồ Tây", 21.0583, 105.8231), "van mieu": ("Văn Miếu", 21.0293, 105.8356),
    "lang bac": ("Lăng Bác", 21.0368, 105.8346),
}
# Places outside the Hà Nội dataset coverage (public geography): politely refused.
OUTSIDE = ("sa pa", "sapa", "da nang", "ho chi minh", "sai gon", "hue", "hai phong", "nha trang", "da lat", "ha long",
           "quang ninh", "can tho", "vung tau", "phu quoc", "hoi an", "tokyo", "seoul", "bangkok", "paris", "london")
_PREFIX = re.compile(r"^(?:quan|huyen|thi xa|phuong|xa)\s+")
_NUM = re.compile(r"^\s*(?:so\s+)?\d+[a-z0-9/\-]*\s*")
HANOI_BBOX = (20.55, 105.28, 21.40, 106.05)  # min_lat, min_lon, max_lat, max_lon (generous)


@dataclass(frozen=True)
class Place:
    kind: str  # district | street | landmark
    label: str
    lat: float
    lon: float
    district: Optional[str] = None

    def to_json(self) -> dict:
        return {"kind": self.kind, "label": self.label, "lat": self.lat, "lon": self.lon, "district": self.district}


class Gazetteer:
    def __init__(self, venues) -> None:
        d_acc, s_acc, s_dist = defaultdict(list), defaultdict(list), {}
        d_disp = {}
        s_disp = {}
        for v in venues:
            if not v.geo_ok:
                continue
            dist = (v.district or "").strip()
            if dist:
                key = _PREFIX.sub("", fold_uncached(dist))
                d_acc[key].append((v.lat, v.lon))
                d_disp.setdefault(key, re.sub(r"^(?:Quận|Huyện)\s+", "", dist))
            first = (v.address or "").split(",")[0].strip()
            street = _NUM.sub("", fold_uncached(first)).strip()
            if len(street) >= 4 and len(street.split()) <= 4 and not street.isdigit():
                s_acc[street].append((v.lat, v.lon))
                s_dist.setdefault(street, dist)
                s_disp.setdefault(street, re.sub(r"^(?:[Ss]ố\s+)?\d+[A-Za-z0-9/\-]*\s+", "", first))
        self.districts = {k: Place("district", d_disp[k], sum(a for a, _ in c) / len(c), sum(b for _, b in c) / len(c))
                          for k, c in d_acc.items()}
        self.streets = {k: Place("street", s_disp[k], sum(a for a, _ in c) / len(c), sum(b for _, b in c) / len(c),
                                 re.sub(r"^(?:Quận|Huyện)\s+", "", s_dist[k]) or None)
                        for k, c in s_acc.items() if len(c) >= 1}
        self.landmarks = {k: Place("landmark", n, la, lo) for k, (n, la, lo) in LANDMARKS.items()}

    @staticmethod
    def _has(text: str, phrase: str) -> bool:
        return re.search(r"(?<![a-z0-9])" + re.escape(phrase) + r"(?![a-z0-9])", text) is not None

    def outside(self, folded: str) -> Optional[str]:
        for name in OUTSIDE:
            if self._has(folded, name):
                return name
        return None

    def resolve(self, text: str) -> Optional[Place]:
        """Best place named in the text: streets > landmarks > districts (longest phrase wins within a class)."""
        f = fold_uncached(text)
        for table in (self.streets, self.landmarks, self.districts):
            hits = [(len(k), p) for k, p in table.items() if self._has(f, k)]
            if hits:
                return max(hits, key=lambda x: x[0])[1]
        return None

    def district_names(self) -> list:
        return sorted(p.label for p in self.districts.values())

    @staticmethod
    def inside_hanoi(lat: float, lon: float) -> bool:
        a, b, c, d = HANOI_BBOX
        return a <= lat <= c and b <= lon <= d

    def nearest_label(self, lat: float, lon: float) -> Optional[str]:
        """Approximate "near <street/district>" for browser geolocation from the nearest dataset street/district."""
        best = None
        for p in list(self.streets.values()) + list(self.districts.values()):
            d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2
            if best is None or d < best[0]:
                best = (d, p)
        return best[1].label if best else None
