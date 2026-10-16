"""C0-HF: allergy/avoidance must never be dropped silently; party-size edits must apply (planner/extractor level)."""
import unittest

from app.llm.extract import MockExtractor
from app.planner import engine
from app.planner.allergens import allergen_excluded, family_of
from app.planner.types import Preferences, Venue

ORIGIN = (21.0285, 105.8522)


def venue(i, name, tags=(), dx=0.0):
    return Venue(f"v{i}", name, 21.0285 + dx, 105.8522, dish_tags=tuple(tags), synthetic=True,
                 price_min_vnd=30000, price_max_vnd=60000)


class Extraction(unittest.TestCase):
    def setUp(self):
        self.m = MockExtractor()

    def test_allergy_is_recorded_not_dropped(self):
        r = self.m.extract("tôi dị ứng cua, 4 người, 600k cả nhóm")
        self.assertEqual(r.preferences.allergies, ("cua",))
        self.assertEqual((r.preferences.party_size, r.preferences.budget_vnd), (4, 600000))
        self.assertIn("allergies", r.updated_fields)
        self.assertTrue(any("không quán nào được xác nhận an toàn" in n for n in r.notes))

    def test_multi_term_and_no_diacritics(self):
        r = self.m.extract("di ung tom va dau phong")
        self.assertEqual(r.preferences.allergies, ("tom", "dau phong"))

    def test_allergen_never_becomes_interest(self):
        r = self.m.extract("di ung hai san, muon an bun")
        self.assertNotIn("hải sản", r.preferences.interests)
        self.assertIn("bún", r.preferences.interests)

    def test_allergy_accumulates_with_prior(self):
        first = self.m.extract("dị ứng cua").preferences
        second = self.m.extract("còn dị ứng sữa nữa", first).preferences
        self.assertEqual(second.allergies, ("cua", "sữa"))

    def test_plain_dislike_asks_allergy_or_preference(self):
        r = self.m.extract("có bạn không ăn cua")
        self.assertEqual(r.preferences.allergies, ())
        self.assertIn("cua", r.preferences.exclusions)
        self.assertTrue(any("dị ứng hay chỉ là không thích" in n for n in r.notes))

    def test_unrecognised_allergen_is_disclosed(self):
        r = self.m.extract("bị dị ứng măng cụt")
        self.assertEqual(r.preferences.allergies, ("măng cụt",))
        self.assertTrue(any("Chưa có quy tắc" in n for n in r.notes))

    def test_party_size_edits(self):
        prior = Preferences(party_size=3)
        for text, n in (("đổi thành 4 người", 4), ("còn 5 người thôi", 5), ("đi 6 người", 6),
                        ("đổi thành bốn người", 4), ("nhóm 2 người", 2)):
            self.assertEqual(self.m.extract(text, prior).preferences.party_size, n, text)

    def test_party_size_not_taken_from_prices(self):
        r = self.m.extract("ăn bún 200k mỗi người, 3 quán")
        self.assertIsNone(r.preferences.party_size)
        r = self.m.extract("ngân sách 500k/người")
        self.assertIsNone(r.preferences.party_size)

    def test_party_size_out_of_range_is_rejected_not_silent(self):
        r = self.m.extract("đổi thành 50 người")
        self.assertIn("party_size", r.rejected_fields)

    def test_no_allergy_phrase_no_allergy(self):
        self.assertEqual(self.m.extract("ăn phở quanh hồ gươm 2 giờ").preferences.allergies, ())


class Planner(unittest.TestCase):
    prefs = dict(origin=ORIGIN, duration_min=240, interests=(), max_stops=3)

    def pool(self):
        return [venue(1, "Quán Cua Biển Đỏ", ("Hải sản",), 0.0005),
                venue(2, "Phở Bò Hà Nội", ("Món nước",), 0.001),
                venue(3, "Bún Chả Phố", ("Bún",), 0.0015),
                venue(4, "Lẩu Hải Sản Sao", ("Hải sản", "Lẩu"), 0.002),
                venue(5, "Chè Ba Miền", ("Chè",), 0.0025)]

    def test_families(self):
        self.assertEqual(family_of("cua"), "crustacean")
        self.assertEqual(family_of("sữa bò"), "dairy")
        self.assertIsNone(family_of("măng cụt"))

    def test_seafood_family_excludes_by_name_and_dish_group(self):
        v = self.pool()
        ex = [x.id for x in v if allergen_excluded(x, ("cua",))]
        self.assertEqual(ex, ["v1", "v4"])  # name "Cua" and dish group "Hải sản"

    def test_tour_excludes_allergen_venues_and_is_never_verified(self):
        tour = engine.plan_tour(self.pool(), Preferences(**self.prefs, allergies=("cua",)))
        ids = {s.venue_id for s in tour.stops}
        self.assertTrue(ids)
        self.assertFalse(ids & {"v1", "v4"})
        self.assertEqual(tour.status, "conditional")
        self.assertIn("allergy_ingredients", tour.unknowns)
        self.assertEqual(engine.validate_tour(tour, self.pool(), Preferences(**self.prefs, allergies=("cua",))), [])

    def test_strict_mode_with_allergy_has_no_verified_tour(self):
        tour = engine.plan_tour(self.pool(), Preferences(**self.prefs, allergies=("cua",), mode="strict"))
        self.assertNotEqual(tour.status, "verified_feasible")

    def test_without_allergy_nothing_changes(self):
        tour = engine.plan_tour(self.pool(), Preferences(**self.prefs))
        self.assertNotIn("allergy_ingredients", tour.unknowns)

    def test_unrecognised_term_excludes_only_exact_name_or_tag_matches(self):
        pool = self.pool() + [venue(6, "Măng Cụt Xanh", ("Sinh tố",), 0.003)]
        tour = engine.plan_tour(pool, Preferences(**{**self.prefs, "max_stops": 5}, allergies=("măng cụt",)))
        self.assertNotIn("v6", {s.venue_id for s in tour.stops})


if __name__ == "__main__":
    unittest.main()


class CodexReviewC0HF(unittest.TestCase):
    """Findings from the independent review (escalation msg): fail before the follow-up fix."""

    def setUp(self):
        self.m = MockExtractor()

    def test_allergy_followed_by_count_is_not_dropped(self):
        r = self.m.extract("dị ứng cua 4 người")
        self.assertEqual((r.preferences.allergies, r.preferences.party_size), (("cua",), 4))
        self.assertTrue(any("không quán nào được xác nhận an toàn" in n for n in r.notes))

    def test_negated_allergy_is_not_recorded(self):
        self.assertEqual(self.m.extract("không bị dị ứng gì").preferences.allergies, ())
        self.assertEqual(self.m.extract("mình không dị ứng cua").preferences.allergies, ())

    def test_retracted_allergy_is_removed(self):
        prior = self.m.extract("dị ứng cua và tôm").preferences
        after = self.m.extract("hết dị ứng cua rồi", prior).preferences
        self.assertEqual(after.allergies, ("tôm",))

    def test_markup_never_reaches_notes(self):
        r = self.m.extract("dị ứng <b>cua</b>")
        self.assertEqual(r.preferences.allergies, ("cua",))
        self.assertFalse(any("<" in n or ">" in n for n in r.notes))

    def test_model_answer_keeps_rule_safety_note(self):
        from app.llm.provider import LLMExtractor, RulesFirstExtractor

        class Stub:
            def complete(self, text, prior, deadline_s=8.0):
                return '{"duration_min":120,"origin_text":"chợ Đồng Xuân"}'
        rf = RulesFirstExtractor(self.m, LLMExtractor(Stub()))
        r = rf.extract("dị ứng cua, ăn bún quanh chợ Đồng Xuân hai tiếng")
        self.assertEqual(r.source, "live")
        self.assertEqual(r.preferences.allergies, ("cua",))
        self.assertTrue(any("an toàn" in n for n in r.notes))
