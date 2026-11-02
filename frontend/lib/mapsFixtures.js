export const SYNTHETIC_MAPS_LINKS = {
  "single_walking": {
    "status": "ok",
    "travelmode": "walking",
    "provider": "openstreetmap_urls",
    "uses_api": false,
    "links": [
      {
        "index": 1,
        "of": 3,
        "url": "https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=21.000000%2C105.850000%3B21.001000%2C105.850000",
        "from_stop": null,
        "to_stop": 1,
        "waypoint_count": 0,
        "url_length": 115,
        "point_kinds": [
          "latlng",
          "latlng"
        ]
      },
      {
        "index": 2,
        "of": 3,
        "url": "https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=21.001000%2C105.850000%3B21.002000%2C105.850000",
        "from_stop": 1,
        "to_stop": 2,
        "waypoint_count": 0,
        "url_length": 115,
        "point_kinds": [
          "latlng",
          "latlng"
        ]
      },
      {
        "index": 3,
        "of": 3,
        "url": "https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=21.002000%2C105.850000%3B21.003000%2C105.850000",
        "from_stop": 2,
        "to_stop": 3,
        "waypoint_count": 0,
        "url_length": 115,
        "point_kinds": [
          "latlng",
          "latlng"
        ]
      }
    ],
    "skipped": [],
    "notes": [
      "Coordinates are shared with OpenStreetMap and its routing service only when you open a link.",
      "Each link opens one ordered leg. Map connectors are estimates, not road routes or live travel times."
    ]
  },
  "single_driving": {
    "status": "ok",
    "travelmode": "driving",
    "provider": "openstreetmap_urls",
    "uses_api": false,
    "links": [
      {
        "index": 1,
        "of": 3,
        "url": "https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=21.000000%2C105.850000%3B21.001000%2C105.850000",
        "from_stop": null,
        "to_stop": 1,
        "waypoint_count": 0,
        "url_length": 114,
        "point_kinds": [
          "latlng",
          "latlng"
        ]
      },
      {
        "index": 2,
        "of": 3,
        "url": "https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=21.001000%2C105.850000%3B21.002000%2C105.850000",
        "from_stop": 1,
        "to_stop": 2,
        "waypoint_count": 0,
        "url_length": 114,
        "point_kinds": [
          "latlng",
          "latlng"
        ]
      },
      {
        "index": 3,
        "of": 3,
        "url": "https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=21.002000%2C105.850000%3B21.003000%2C105.850000",
        "from_stop": 2,
        "to_stop": 3,
        "waypoint_count": 0,
        "url_length": 114,
        "point_kinds": [
          "latlng",
          "latlng"
        ]
      }
    ],
    "skipped": [],
    "notes": [
      "Coordinates are shared with OpenStreetMap and its routing service only when you open a link.",
      "Each link opens one ordered leg. Map connectors are estimates, not road routes or live travel times."
    ]
  },
  "split_mobile": {
    "status": "ok",
    "travelmode": "walking",
    "provider": "openstreetmap_urls",
    "uses_api": false,
    "links": [
      {
        "index": 1,
        "of": 2,
        "url": "https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=21.000000%2C105.850000%3B21.001000%2C105.850000",
        "from_stop": null,
        "to_stop": 1,
        "waypoint_count": 0,
        "url_length": 115,
        "point_kinds": [
          "latlng",
          "latlng"
        ]
      },
      {
        "index": 2,
        "of": 2,
        "url": "https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=21.001000%2C105.850000%3B21.002000%2C105.850000",
        "from_stop": 1,
        "to_stop": 2,
        "waypoint_count": 0,
        "url_length": 115,
        "point_kinds": [
          "latlng",
          "latlng"
        ]
      }
    ],
    "skipped": [],
    "notes": [
      "Coordinates are shared with OpenStreetMap and its routing service only when you open a link.",
      "Each link opens one ordered leg. Map connectors are estimates, not road routes or live travel times."
    ]
  },
  "partial_gap": {
    "status": "partial",
    "travelmode": "walking",
    "provider": "openstreetmap_urls",
    "uses_api": false,
    "links": [
      {
        "index": 1,
        "of": 2,
        "url": "https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=21.000000%2C105.850000%3B21.001000%2C105.850000",
        "from_stop": null,
        "to_stop": 1,
        "waypoint_count": 0,
        "url_length": 115,
        "point_kinds": [
          "latlng",
          "latlng"
        ]
      },
      {
        "index": 2,
        "of": 2,
        "url": "https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=21.003000%2C105.850000%3B21.004000%2C105.850000",
        "from_stop": 3,
        "to_stop": 4,
        "waypoint_count": 0,
        "url_length": 115,
        "point_kinds": [
          "latlng",
          "latlng"
        ]
      }
    ],
    "skipped": [
      {
        "stop_order": 2,
        "venue_id": "synthetic-maps-2",
        "reason": "no_usable_point"
      }
    ],
    "notes": [
      "Coordinates are shared with OpenStreetMap and its routing service only when you open a link.",
      "Each link opens one ordered leg. Map connectors are estimates, not road routes or live travel times.",
      "Missing-coordinate stops break the itinerary; no missing leg is connected or address guessed."
    ]
  },
  "unavailable": {
    "status": "unavailable",
    "travelmode": "walking",
    "provider": "openstreetmap_urls",
    "uses_api": false,
    "links": [],
    "skipped": [
      {
        "stop_order": 1,
        "venue_id": "synthetic-maps-1",
        "reason": "no_usable_point"
      }
    ],
    "notes": [
      "Coordinates are shared with OpenStreetMap and its routing service only when you open a link.",
      "A valid selected origin is required; no origin or address is inferred."
    ]
  },
  "motorbike_unavailable": {
    "status": "unavailable",
    "travelmode": "walking",
    "provider": "openstreetmap_urls",
    "uses_api": false,
    "links": [],
    "skipped": [],
    "notes": [
      "Coordinates are shared with OpenStreetMap and its routing service only when you open a link.",
      "Each link opens one ordered leg. Map connectors are estimates, not road routes or live travel times.",
      "Motorcycle routing is unavailable; no car route is substituted. Use the numbered map stops."
    ]
  }
};
