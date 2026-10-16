"""Synthetic-only 1,702-candidate micro/whole-planner benchmark; run from repo root."""
from statistics import median
from time import perf_counter
import json

from app.planner.engine import plan_tour, validate_tour
from app.planner.relevance import excluded, fold, interest_score
from app.planner.types import Preferences, Venue


def main():
    venues = tuple(Venue(id=f'SYN-BENCH-{i}', name=f'Synthetic cafe {i}',
        lat=21.028 + (i % 17) * .0001, lon=105.85 + (i % 23) * .0001,
        dish_tags=('bún', 'cà phê', 'chè')[i % 3:i % 3 + 1],
        price_min_vnd=20000, price_max_vnd=40000, synthetic=True) for i in range(1702))
    prefs = Preferences(origin=(21.029, 105.851), duration_min=180,
        interests=('bún', 'cà phê', 'chè'), exclusions=('private exclusion',))
    def scoring():
        return sum(interest_score(v, prefs.interests) for v in venues
                   if not excluded(v, prefs.exclusions))
    def planning():
        tour = plan_tour(venues, prefs)
        assert not validate_tour(tour, venues, prefs)
        assert len(tour.stops) == 3
    result = {}
    for name, fn in [('scoring', scoring), ('planning', planning)]:
        fold.cache_clear()
        fn()
        samples = []
        for _ in range(9):
            start = perf_counter()
            fn()
            samples.append((perf_counter() - start) * 1000)
        result[name + '_median_ms'] = round(median(samples), 3)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
