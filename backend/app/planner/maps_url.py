"""Pure Maps URLs builder: no providers, configuration, I/O or route claims."""
import math
import unicodedata
from urllib.parse import urlencode, urlunsplit


PRIVACY_NOTE = ('Links contain the origin/venue coordinates or fallback addresses and are sent '
                'to Google only when the user opens them.')


def _point(coordinates, address):
    if isinstance(coordinates, (tuple, list)) and len(coordinates) == 2:
        lat, lon = coordinates
        if (all(type(v) in (int, float) and math.isfinite(v) for v in (lat, lon))
                and -90 <= lat <= 90 and -180 <= lon <= 180):
            return f'{lat:.6f},{lon:.6f}', 'latlng'
    if isinstance(address, str):
        # Whitespace controls separate words; other controls must not reach the URL.
        cleaned = ''.join(' ' if c.isspace() else c for c in address
                          if c.isspace() or unicodedata.category(c) not in ('Cc', 'Cf', 'Cs'))
        cleaned = ' '.join(cleaned.split())[:200].strip()
        if cleaned:
            return cleaned, 'address'
    return None


def _url(points, mode):
    query = {'api': '1', 'origin': points[0]['value'], 'destination': points[-1]['value']}
    if len(points) > 2:
        query['waypoints'] = '|'.join(p['value'] for p in points[1:-1])
    query['travelmode'] = mode
    return urlunsplit(('https', 'www.google.com', '/maps/dir/', urlencode(query), ''))


def build_maps_links(origin, origin_address, stops, venues, mode='walking'):
    """Preserve supplied planner sequence; gaps form separate contiguous runs.

    A singleton run uses the same point as both ends and is disclosed in notes.
    Oversized adjacent pairs are skipped explicitly; they never bridge a gap.
    """
    if mode not in ('walking', 'driving'):
        raise ValueError('unsupported travelmode')
    by_id = {v.id: v for v in venues}
    result = {'status': 'unavailable', 'travelmode': mode, 'provider': 'google_maps_urls',
              'uses_api': False, 'links': [], 'skipped': [], 'notes': [PRIVACY_NOTE,
              "The schedule is the app's proposal; Google may show different times."]}
    runs, run = [], []
    point = _point(origin, origin_address)
    if point:
        run.append({'order': None, 'venue_id': None, 'value': point[0], 'kind': point[1]})
    else:
        result['notes'].append('Tour origin has no usable point; links start at the first usable stop.')

    def skip(point, reason):
        if point['order'] is not None:
            entry = {'stop_order': point['order'], 'venue_id': point['venue_id'], 'reason': reason}
            if entry not in result['skipped']:
                result['skipped'].append(entry)

    for stop in stops:
        venue = by_id.get(stop.venue_id)
        point = _point((venue.lat, venue.lon), venue.address) if venue else None
        item = {'order': stop.order, 'venue_id': stop.venue_id}
        if point is None:
            skip(item, 'no_usable_point')
            if run:
                runs.append(run)
            run = []
        else:
            run.append(dict(item, value=point[0], kind=point[1]))
    if run:
        runs.append(run)

    for run in runs:
        start = 0
        while start < len(run):
            if start == len(run) - 1:
                if start > 0 or run[start]['order'] is None:
                    break
                points = [run[start], run[start]]
                end = start
                result['notes'].append('An isolated usable stop has identical origin and destination; no missing leg is inferred.')
            else:
                end = min(start + 4, len(run) - 1)
                points = run[start:end + 1]
                while len(_url(points, mode)) > 2048 and end > start + 1:
                    end -= 1
                    points = run[start:end + 1]
            url = _url(points, mode)
            if len(url) > 2048:
                for point in points:
                    skip(point, 'url_too_long')
                start = end + 1
                continue
            result['links'].append({'index': len(result['links']) + 1, 'of': 0, 'url': url,
                'from_stop': points[0]['order'], 'to_stop': points[-1]['order'],
                'waypoint_count': len(points) - 2, 'url_length': len(url),
                'point_kinds': [p['kind'] for p in points]})
            if end == start:
                break
            start = end
    for link in result['links']:
        link['of'] = len(result['links'])
    if result['skipped']:
        result['notes'].append('Skipped stops break the itinerary into separate usable runs; missing legs are not connected. '
                               'Reasons are listed in skipped, including adjacent points that exceed the encoded URL limit.')
    if result['links']:
        result['status'] = 'partial' if result['skipped'] else 'ok'
    return result
