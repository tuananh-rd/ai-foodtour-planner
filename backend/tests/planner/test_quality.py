import unittest
from dataclasses import replace

from app.planner.engine import plan_tour, replace_stop, validate_tour
from app.planner.quality import (effective_meal, meal_from_minutes, smoothed_rating, soft_score, well_rated)
from app.planner.types import Preferences, Stop, Venue


def V(i, rating=None, count=None, tags=("Bún",), meals=(), aud=(), lat=21.0300, lon=105.8500, **kw):
    return Venue(id=i, name=f"Quán {i}", lat=lat, lon=lon, price_min_vnd=10000, price_max_vnd=40000,
                 dish_tags=tuple(tags), rating=rating, review_count=count, suitable_meals=tuple(meals),
                 audiences=tuple(aud), synthetic=True, **kw)


def P(**kw):
    base = dict(origin=(21.03, 105.85), duration_min=240, budget_vnd=500000, budget_scope="per_person",
                max_stops=1, max_leg_min=30)
    base.update(kw)
    return Preferences(**base)


class Smoothing(unittest.TestCase):
    def test_few_reviews_are_pulled_toward_the_mean(self):
        prior = 3.5
        one = smoothed_rating(V("a", 5.0, 1), prior)
        many = smoothed_rating(V("b", 4.4, 400), prior)
        self.assertLess(one, many)
        self.assertIsNone(smoothed_rating(V("c"), prior))
        self.assertIsNone(smoothed_rating(V("d", 7.0, 10), prior))  # out of 0..5 is not trusted

    def test_well_rated_needs_enough_reviews(self):
        self.assertTrue(well_rated(V("a", 4.5, 20)))
        self.assertFalse(well_rated(V("a", 4.9, 19)))
        self.assertFalse(well_rated(V("a", 3.9, 500)))
        self.assertFalse(well_rated(V("a", None, None)))


class Meals(unittest.TestCase):
    def test_meal_from_start_time(self):
        cases = {6 * 60: "breakfast", 12 * 60: "lunch", 15 * 60: "snack", 19 * 60: "dinner", 23 * 60: "late",
                 2 * 60: "late"}
        for minutes, want in cases.items():
            self.assertEqual(meal_from_minutes(minutes), want, minutes)
        self.assertIsNone(meal_from_minutes(None))
        self.assertEqual(effective_meal(P(start_time_min=19 * 60, meal="breakfast")), "breakfast")  # user wins


class RankingIsSoftAndSafe(unittest.TestCase):
    def test_rating_never_beats_interest_relevance(self):
        match = V("MATCH", 3.0, 5, tags=("Chè",))
        star = V("STAR", 5.0, 900, tags=("Bún",))  # excellent but not what was asked
        t = plan_tour([match, star], P(interests=("chè",)))
        self.assertEqual([s.venue_id for s in t.stops], ["MATCH"])

    def test_quality_breaks_ties_between_equally_relevant_venues(self):
        ok = V("OK", 3.2, 30, lat=21.0300)
        good = V("GOOD", 4.6, 300, lat=21.0302)  # slightly farther
        t = plan_tour([ok, good], P(interests=("bún",)))
        self.assertEqual(t.stops[0].venue_id, "GOOD")
        off = plan_tour([ok, good], P(interests=("bún",)), quality_weight=0)
        self.assertEqual(off.stops[0].venue_id, "OK")  # flag off => previous behaviour (nearest wins)

    def test_meal_and_audience_are_soft_signals(self):
        a = V("A", meals=("Buổi sáng",), lat=21.0300)
        b = V("B", meals=("Buổi tối",), lat=21.0300)
        t = plan_tour([a, b], P(start_time_min=19 * 60, weekday=0, interests=("bún",)))
        self.assertEqual(t.stops[0].venue_id, "B")
        fam = V("FAM", aud=("Ăn gia đình",), lat=21.0301)
        oth = V("OTH", aud=("Họp nhóm",), lat=21.0300)
        t2 = plan_tour([oth, fam], P(audience="family", interests=("bún",)))
        self.assertEqual(t2.stops[0].venue_id, "FAM")

    def test_soft_score_is_bounded_and_zero_when_disabled(self):
        v = V("A", 5.0, 1000, meals=("Buổi trưa",), aud=("Ăn gia đình",))
        p = P(start_time_min=12 * 60, audience="family")
        self.assertLessEqual(soft_score(v, p, 3.5), 3.3)
        self.assertEqual(soft_score(v, p, 3.5, weight=0), 0.0)


class WhyReasons(unittest.TestCase):
    def test_reasons_are_built_from_facts(self):
        vs = [V("A", 4.6, 120, tags=("Bún", "Chả"), meals=("Buổi trưa",), lat=21.0300),
              V("B", 4.9, 3, tags=("Chè",), lat=21.0304)]
        t = plan_tour(vs, P(max_stops=2, interests=("bún", "chè"), start_time_min=12 * 60, weekday=0))
        by = {s.venue_id: {c for c, _ in s.why} for s in t.stops}
        self.assertTrue({"match_interest", "near_origin", "well_rated", "fits_meal"} <= by["A"], by)
        self.assertNotIn("well_rated", by["B"])  # only 3 reviews: no "well rated" claim
        self.assertIn("diverse", by["B"])
        txt = " ".join(text for s in t.stops for _, text in s.why)
        self.assertNotIn("đang mở", txt)
        self.assertNotIn("mỗi người", txt)

    def test_tampered_reasons_fail_validation(self):
        vs = [V("A", 4.6, 120)]
        p = P(interests=("bún",))
        t = plan_tour(vs, p)
        self.assertEqual(validate_tour(t, vs, p), [])
        s0 = t.stops[0]
        fake = replace(t, stops=(replace(s0, why=(("well_rated", "Quán ngon nhất Hà Nội"),)),))
        self.assertTrue(any("reasons mismatch" in x for x in validate_tour(fake, vs, p)))

    def test_replace_keeps_reasons_and_locks(self):
        vs = [V("A", lat=21.0300), V("B", lat=21.0302), V("C", lat=21.0304), V("D", 4.8, 200, lat=21.0306)]
        p = P(max_stops=2, interests=("bún",))
        t = plan_tour(vs, p)
        r = replace_stop(vs, p, t, t.stops[1].venue_id)
        self.assertTrue(r.ok)
        self.assertTrue(all(isinstance(s.why, tuple) for s in r.tour.stops))
        self.assertEqual(validate_tour(r.tour, vs, p), [])


class SoftHintExtraction(unittest.TestCase):
    def test_rules_extract_meal_and_audience(self):
        from app.llm.extract import MockExtractor
        x = MockExtractor()
        r = x.extract("ăn tối cùng gia đình quanh Hồ Gươm 2 giờ")
        self.assertEqual((r.preferences.meal, r.preferences.audience), ("dinner", "family"))
        r2 = x.extract("đi một mình ăn sáng quanh phố cổ 90 phút")
        self.assertEqual((r2.preferences.meal, r2.preferences.audience), ("breakfast", "solo"))
        r3 = x.extract("ăn bún quanh Hồ Gươm 2 giờ")
        self.assertEqual((r3.preferences.meal, r3.preferences.audience), (None, None))
        # editing keeps earlier hints
        r4 = x.extract("đổi sang 4 quán", r.preferences)
        self.assertEqual((r4.preferences.meal, r4.preferences.audience), ("dinner", "family"))


if __name__ == "__main__":
    unittest.main()
