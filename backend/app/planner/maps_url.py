"""Pure per-leg OpenStreetMap links; no routing/network or inferred coordinates."""
import math
from urllib.parse import urlencode


def _point(coordinates):
    if isinstance(coordinates, (tuple, list)) and len(coordinates) == 2:
        lat, lon = coordinates
        if (all(type(v) in (int, float) and math.isfinite(v) for v in (lat, lon))
                and -90 <= lat <= 90 and -180 <= lon <= 180):
            return f'{lat:.6f},{lon:.6f}'
    return None


def build_maps_links(origin, origin_address, stops, venues, mode='walking', vehicle=None):
    """Never bridge an unknown point, resolve an address, or substitute vehicle modes."""
    if mode not in ('walking', 'driving'):
        raise ValueError('unsupported travelmode')
    result = {'status': 'unavailable', 'travelmode': mode, 'provider': 'openstreetmap_urls',
              'uses_api': False, 'links': [], 'skipped': [], 'notes': [
                  'Coordinates are shared with OpenStreetMap and its routing service only when you open a link.',
                  'Each link opens one ordered leg. Map connectors are estimates, not road routes or live travel times.']}
    if vehicle == 'motorbike':
        result['notes'].append('Motorcycle routing is unavailable; no car route is substituted. Use the numbered map stops.')
        return result
    if vehicle in ('walk', 'car', 'taxi') and mode != ('walking' if vehicle == 'walk' else 'driving'):
        result['notes'].append('Requested mode differs from the confirmed tour vehicle; choose the matching mode.')
        return result
    previous = _point(origin)
    previous_order = None
    if previous is None:
        result['notes'].append('A valid selected origin is required; no origin or address is inferred.')
        return result
    by_id = {v.id: v for v in venues}
    engine = 'fossgis_osrm_foot' if mode == 'walking' else 'fossgis_osrm_car'
    for stop in stops:
        venue = by_id.get(stop.venue_id)
        point = _point((venue.lat, venue.lon)) if venue else None
        if point is None:
            result['skipped'].append({'stop_order': stop.order, 'venue_id': stop.venue_id,
                                      'reason': 'no_usable_point'})
        elif previous is not None:
            url = 'https://www.openstreetmap.org/directions?' + urlencode({
                'engine': engine, 'route': f'{previous};{point}'})
            result['links'].append({'index': len(result['links'])+1, 'of': 0, 'url': url,
                'from_stop': previous_order, 'to_stop': stop.order, 'waypoint_count': 0,
                'url_length': len(url), 'point_kinds': ['latlng', 'latlng']})
        previous, previous_order = point, stop.order
    for link in result['links']:
        link['of'] = len(result['links'])
    if result['skipped']:
        result['notes'].append('Missing-coordinate stops break the itinerary; no missing leg is connected or address guessed.')
    if result['links']:
        result['status'] = 'partial' if result['skipped'] else 'ok'
    return result
