"""Print count-only pilot evidence gaps. No raw/derived venue export, paths or IDs."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.data.loader import load_dataset, aggregate_report, DatasetLoadError


def report(dataset):
    clusters = defaultdict(list)
    for venue in dataset.venues:
        # Public district names are not needed in this diagnostic: anonymous cluster numbers suffice.
        clusters[venue.district].append(venue)
    summaries = []
    for venues in clusters.values():
        eligible = [v for v in venues if v.geo_ok and not v.online_only]
        summaries.append({'loaded': len(venues), 'dine_in_candidates': len(eligible),
                          'known_hours': sum(v.hours is not None for v in eligible),
                          'verified_per_person_price': sum(v.price_evidence == 'verified' for v in eligible),
                          'enough_candidates_for_three_stops': len(eligible) >= 3})
    return {'dataset_source': dataset.dataset_source, 'synthetic': all(v.synthetic for v in dataset.venues),
            **aggregate_report(dataset),
            'clusters': sorted(summaries, key=lambda s: -s['dine_in_candidates']),
            'routing_verified': False, 'ingredients_verified': False,
            'interpretation': 'Candidate counts do not prove walkability, operating status, hours freshness or allergy safety; Google Maps URLs are not routing evidence.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(report(load_dataset(args.data)), ensure_ascii=True, indent=2))
    except DatasetLoadError:
        print(json.dumps({'error': 'dataset_unavailable'}))
        raise SystemExit(1)
