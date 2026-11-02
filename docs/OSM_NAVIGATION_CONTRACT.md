# OSM navigation contract

This supersedes Google navigation acceptance for the current discovery app (2026-11-03).
The embedded map uses existing MapLibre GL JS and local OSM-derived PMTiles where available.
No Google scripts, navigation URLs or billing are required in the active journey.

`GET /v1/sessions/{id}/tour/maps-links` retains authenticated, read-only response fields.
Provider is `openstreetmap_urls`, `uses_api=false`; `mode` is walking/driving.
Each link is one adjacent ordered leg:
`https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=LAT,LON;LAT,LON`.
Driving uses `fossgis_osrm_car`. The first origin is the explicitly selected session origin;
subsequent pairs follow supplied tour order. URL-encoded separators are equivalent.
`from_stop=null` means the selected origin, `to_stop` is the actual supplied stop order.
`waypoint_count=0`, two `point_kinds=latlng`, contiguous `index/of`, URL≤2048characters.

Coordinates must be finite numeric pairs in geographic bounds; no address geocoding/fallback,
zero substitution, route reordering or skipping over an unknown point. Missing stops are listed
in `skipped` and break adjacency; an invalid origin returns unavailable. Links after a gap
require two consecutive known stops and keep their original numbers. Partial status and notes
remain visible. A motorcycle tour has no supported motorcycle router and returns unavailable;
the numbered embedded map remains usable. Confirmed walking/car/taxi modes must match requests.

The app does not call a public routing server automatically. Clicking an OSM directions link
shares that leg's coordinates with OSM/FOSSGIS. The external service calculates its own road
route and may be unavailable. Estimated connectors in the app must be dashed and labelled;
they do not prove road access, travel time, opening hours or allergy safety. Existing road-route
adapters may be used only when their configured profile genuinely supports the selected mode;
no default driving endpoint may masquerade as pedestrian routing.

Official references reviewed2026-11-03:

- [MapLibre documentation](https://maplibre.org/maplibre-gl-js/docs/): existing map library,
  resize/fit-bounds and visible attribution.
- [Leaflet documentation](https://leafletjs.com/reference.html): considered, no extra library
  needed because MapLibre is already installed.
- [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/): visible attribution,
  normal browser caching/Referer, HTTPS, no tile prefetch, bulk downloads or offline scraping.
- [FOSSGIS routing policy](https://routing.openstreetmap.de/about.html): foot/car profiles,
  maximum1request/second, no heavy use, route requests logged. No service SLA is inferred.

Do not add automatic geocoder autocomplete or send origin to LLM/search providers. The user
chooses location explicitly. Local map rendering does not constitute live routing acceptance.
