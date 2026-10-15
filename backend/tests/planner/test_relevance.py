import unittest

from app.planner.engine import eligible, plan_tour
from app.planner.relevance import excluded, fold, interest_score
from app.planner.types import Preferences, Venue


def V(i, name="Quán", tags=(), **kw):
    return Venue(id=i, name=name, lat=21.03, lon=105.85, price_min_vnd=10000, price_max_vnd=40000,
                 dish_tags=tuple(tags), synthetic=True, **kw)


class Relevance(unittest.TestCase):
    def test_fold_is_diacritic_insensitive(self):
        self.assertEqual(fold("Bún Chả"), "bun cha")
        self.assertEqual(fold("Đặc sản"), "dac san")

    def test_whole_word_not_substring(self):
        self.assertEqual(interest_score(V("a", "Trường học", ["Cơm"]), ("ốc",)), 0)
        self.assertEqual(interest_score(V("b", "Quán", ["Nghêu - Sò - Ốc"]), ("ốc",)), 3)
        self.assertEqual(interest_score(V("c", "Bún ốc Hà Nội", []), ("ốc",)), 2)

    def test_diacritics_optional_in_query(self):
        self.assertEqual(interest_score(V("a", tags=["Phở"]), ("pho",)), 3)
        self.assertEqual(interest_score(V("a", tags=["Bánh mì"]), ("banh mi",)), 3)
        self.assertEqual(interest_score(V("a", tags=["Bánh - Kẹo"]), ("banh mi",)), 0)

    def test_synonym_sweets(self):
        self.assertGreater(interest_score(V("a", tags=["Chè"]), ("đồ ngọt",)), 0)
        self.assertEqual(interest_score(V("a", tags=["Bánh mì"]), ("đồ ngọt",)), 0)

    def test_exclusion_whole_word(self):
        self.assertTrue(excluded(V("a", tags=["Nghêu - Sò - Ốc"]), ("ốc",)))
        self.assertFalse(excluded(V("a", "Trường học", ["Cơm"]), ("ốc",)))

    def test_eligible_requires_match_when_interests_set(self):
        p = Preferences(origin=(21.03, 105.85), duration_min=120, interests=("phở",))
        self.assertTrue(eligible(V("a", tags=["Phở"]), p))
        self.assertFalse(eligible(V("b", tags=["Cơm"]), p))

    def test_relevance_beats_distance_under_pool_cap(self):
        near = [Venue(id=f"N{i}", name="Gần", lat=21.0300, lon=105.8500 + i * 1e-5, price_min_vnd=1000,
                      price_max_vnd=30000, dish_tags=("Bánh - Kẹo", "Bún"), synthetic=True) for i in range(5)]
        best = Venue(id="BEST", name="Chè xa", lat=21.0305, lon=105.8505, price_min_vnd=1000, price_max_vnd=30000,
                     dish_tags=("Chè",), synthetic=True)
        p = Preferences(origin=(21.03, 105.85), duration_min=120, interests=("chè", "bún"), max_stops=1,
                        budget_vnd=100000, budget_scope="per_person")
        t = plan_tour(near + [best], p, pool_cap=2)
        self.assertEqual(t.status, "conditional")
        self.assertEqual(t.assumptions["relevance_score"], 3)
        # both interests are served across multiple stops when allowed
        p2 = Preferences(origin=(21.03, 105.85), duration_min=240, interests=("chè", "bún"), max_stops=2,
                         budget_vnd=100000, budget_scope="per_person")
        t2 = plan_tour(near + [best], p2)
        self.assertIn("BEST", [s.venue_id for s in t2.stops])


if __name__ == "__main__":
    unittest.main()
