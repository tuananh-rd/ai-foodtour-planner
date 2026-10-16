"""User preference text must not survive in global normalization caches."""
import unittest
import re
import unicodedata

from app.llm.extract import MockExtractor, UnavailableExtractor
from app.llm.provider import LLMExtractor, RulesFirstExtractor
from app.planner.relevance import excluded, fold, interest_score
from app.planner.types import Venue


class PreferenceCacheTests(unittest.TestCase):
    def test_unicode_folding_keeps_original_semantics(self):
        for text in ('Bún chả', 'ĐẶC SẢN', 'a\u1ab0b', 'a\u034fb', '東京 bún', 'a\u0483b', 'x-y / z'):
            normalized = unicodedata.normalize('NFD', text.casefold().replace('đ', 'd'))
            normalized = ''.join(ch for ch in normalized if unicodedata.category(ch) != 'Mn')
            expected = re.sub(r'[^a-z0-9]+', ' ', normalized).strip()
            self.assertEqual(fold.__wrapped__(text), expected)

    def test_phrases_cannot_cross_dish_tag_boundaries(self):
        venue = Venue('SYN', 'Unrelated name', 21.03, 105.85, dish_tags=('bun', 'cha'))
        self.assertEqual(interest_score(venue, ('bun cha',)), 0)
        self.assertFalse(excluded(venue, ('bun cha',)))

    def test_interest_and_exclusion_terms_are_not_memoized(self):
        venue = Venue('SYN', 'Synthetic cafe', 21.03, 105.85, dish_tags=('coffee',))
        fold.cache_clear()
        self.addCleanup(fold.cache_clear)
        interest_score(venue, ('private interest alpha',))
        excluded(venue, ('private exclusion beta',))
        before = fold.cache_info()
        fold('private interest alpha')
        fold('private exclusion beta')
        after = fold.cache_info()
        self.assertEqual(after.misses - before.misses, 2)
        # Venue text remains cached for repeated candidate scoring.
        before = fold.cache_info()
        interest_score(venue, ('private interest gamma',))
        self.assertGreaterEqual(fold.cache_info().hits - before.hits, 2)

    def test_expired_entries_purged_on_miss_even_when_provider_fails(self):
        class Provider:
            def complete(self, *args, **kwargs):
                return '{"duration_min": 120}'

        now = [0.0]
        extractor = RulesFirstExtractor(MockExtractor(), LLMExtractor(Provider()),
                                        ttl_s=10, clock=lambda: now[0])
        extractor.extract('food near synthetic street alpha 2 hours')
        self.assertEqual(len(extractor._cache), 1)
        now[0] = 11
        extractor.llm = UnavailableExtractor()
        result = extractor.extract('food near synthetic street beta 2 hours')
        self.assertNotEqual(result.source, 'cache')
        self.assertEqual(len(extractor._cache), 0)
