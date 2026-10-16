export const SYNTHETIC_MAPS_LINKS = {
  "single_walking": {
    "status": "ok",
    "travelmode": "walking",
    "provider": "google_maps_urls",
    "uses_api": false,
    "links": [
      {
        "index": 1,
        "of": 1,
        "url": "https://www.google.com/maps/dir/?api=1&origin=21.000000%2C105.850000&destination=21.003000%2C105.850000&waypoints=21.001000%2C105.850000%7C21.002000%2C105.850000&travelmode=walking",
        "from_stop": null,
        "to_stop": 3,
        "waypoint_count": 2,
        "url_length": 180,
        "point_kinds": [
          "latlng",
          "latlng",
          "latlng",
          "latlng"
        ]
      }
    ],
    "skipped": [],
    "notes": [
      "Links contain the origin/venue coordinates or fallback addresses and are sent to Google only when the user opens them.",
      "The schedule is the app's proposal; Google may show different times."
    ]
  },
  "single_driving": {
    "status": "ok",
    "travelmode": "driving",
    "provider": "google_maps_urls",
    "uses_api": false,
    "links": [
      {
        "index": 1,
        "of": 1,
        "url": "https://www.google.com/maps/dir/?api=1&origin=21.000000%2C105.850000&destination=21.003000%2C105.850000&waypoints=21.001000%2C105.850000%7C21.002000%2C105.850000&travelmode=driving",
        "from_stop": null,
        "to_stop": 3,
        "waypoint_count": 2,
        "url_length": 180,
        "point_kinds": [
          "latlng",
          "latlng",
          "latlng",
          "latlng"
        ]
      }
    ],
    "skipped": [],
    "notes": [
      "Links contain the origin/venue coordinates or fallback addresses and are sent to Google only when the user opens them.",
      "The schedule is the app's proposal; Google may show different times."
    ]
  },
  "split_mobile": {
    "status": "ok",
    "travelmode": "walking",
    "provider": "google_maps_urls",
    "uses_api": false,
    "links": [
      {
        "index": 1,
        "of": 3,
        "url": "https://www.google.com/maps/dir/?api=1&origin=21.000000%2C105.850000&destination=21.004000%2C105.850000&waypoints=21.001000%2C105.850000%7C21.002000%2C105.850000%7C21.003000%2C105.850000&travelmode=walking",
        "from_stop": null,
        "to_stop": 4,
        "waypoint_count": 3,
        "url_length": 205,
        "point_kinds": [
          "latlng",
          "latlng",
          "latlng",
          "latlng",
          "latlng"
        ]
      },
      {
        "index": 2,
        "of": 3,
        "url": "https://www.google.com/maps/dir/?api=1&origin=21.004000%2C105.850000&destination=21.008000%2C105.850000&waypoints=21.005000%2C105.850000%7C21.006000%2C105.850000%7C21.007000%2C105.850000&travelmode=walking",
        "from_stop": 4,
        "to_stop": 8,
        "waypoint_count": 3,
        "url_length": 205,
        "point_kinds": [
          "latlng",
          "latlng",
          "latlng",
          "latlng",
          "latlng"
        ]
      },
      {
        "index": 3,
        "of": 3,
        "url": "https://www.google.com/maps/dir/?api=1&origin=21.008000%2C105.850000&destination=21.012000%2C105.850000&waypoints=21.009000%2C105.850000%7C21.010000%2C105.850000%7C21.011000%2C105.850000&travelmode=walking",
        "from_stop": 8,
        "to_stop": 12,
        "waypoint_count": 3,
        "url_length": 205,
        "point_kinds": [
          "latlng",
          "latlng",
          "latlng",
          "latlng",
          "latlng"
        ]
      }
    ],
    "skipped": [],
    "notes": [
      "Links contain the origin/venue coordinates or fallback addresses and are sent to Google only when the user opens them.",
      "The schedule is the app's proposal; Google may show different times."
    ]
  },
  "address_fallback": {
    "status": "ok",
    "travelmode": "walking",
    "provider": "google_maps_urls",
    "uses_api": false,
    "links": [
      {
        "index": 1,
        "of": 1,
        "url": "https://www.google.com/maps/dir/?api=1&origin=21.000000%2C105.850000&destination=21.003000%2C105.850000&waypoints=12+Ph%E1%BB%91+Hu%E1%BA%BF+%26+B%C3%BAn+%2B+Ch%C3%A8+%231%2C+Synthetic+H%C3%A0+N%E1%BB%99i%7C21.002000%2C105.850000&travelmode=walking",
        "from_stop": null,
        "to_stop": 3,
        "waypoint_count": 2,
        "url_length": 248,
        "point_kinds": [
          "latlng",
          "address",
          "latlng",
          "latlng"
        ]
      }
    ],
    "skipped": [],
    "notes": [
      "Links contain the origin/venue coordinates or fallback addresses and are sent to Google only when the user opens them.",
      "The schedule is the app's proposal; Google may show different times."
    ]
  },
  "partial_gap": {
    "status": "partial",
    "travelmode": "walking",
    "provider": "google_maps_urls",
    "uses_api": false,
    "links": [
      {
        "index": 1,
        "of": 2,
        "url": "https://www.google.com/maps/dir/?api=1&origin=21.000000%2C105.850000&destination=21.002000%2C105.850000&waypoints=21.001000%2C105.850000&travelmode=walking",
        "from_stop": null,
        "to_stop": 2,
        "waypoint_count": 1,
        "url_length": 155,
        "point_kinds": [
          "latlng",
          "latlng",
          "latlng"
        ]
      },
      {
        "index": 2,
        "of": 2,
        "url": "https://www.google.com/maps/dir/?api=1&origin=21.004000%2C105.850000&destination=21.005000%2C105.850000&travelmode=walking",
        "from_stop": 4,
        "to_stop": 5,
        "waypoint_count": 0,
        "url_length": 122,
        "point_kinds": [
          "latlng",
          "latlng"
        ]
      }
    ],
    "skipped": [
      {
        "stop_order": 3,
        "venue_id": "synthetic-maps-3",
        "reason": "no_usable_point"
      }
    ],
    "notes": [
      "Links contain the origin/venue coordinates or fallback addresses and are sent to Google only when the user opens them.",
      "The schedule is the app's proposal; Google may show different times.",
      "Skipped stops break the itinerary into separate usable runs; missing legs are not connected. Reasons are listed in skipped, including adjacent points that exceed the encoded URL limit."
    ]
  },
  "unavailable": {
    "status": "unavailable",
    "travelmode": "walking",
    "provider": "google_maps_urls",
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
      "Links contain the origin/venue coordinates or fallback addresses and are sent to Google only when the user opens them.",
      "The schedule is the app's proposal; Google may show different times.",
      "Skipped stops break the itinerary into separate usable runs; missing legs are not connected. Reasons are listed in skipped, including adjacent points that exceed the encoded URL limit."
    ]
  },
  "long_addresses": {
    "status": "ok",
    "travelmode": "walking",
    "provider": "google_maps_urls",
    "uses_api": false,
    "links": [
      {
        "index": 1,
        "of": 4,
        "url": "https://www.google.com/maps/dir/?api=1&origin=21.000000%2C105.850000&destination=%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF1&waypoints=%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF0&travelmode=walking",
        "from_stop": null,
        "to_stop": 2,
        "waypoint_count": 1,
        "url_length": 1463,
        "point_kinds": [
          "latlng",
          "address",
          "address"
        ]
      },
      {
        "index": 2,
        "of": 4,
        "url": "https://www.google.com/maps/dir/?api=1&origin=%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF1&destination=%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF2&travelmode=walking",
        "from_stop": 2,
        "to_stop": 3,
        "waypoint_count": 0,
        "url_length": 1430,
        "point_kinds": [
          "address",
          "address"
        ]
      },
      {
        "index": 3,
        "of": 4,
        "url": "https://www.google.com/maps/dir/?api=1&origin=%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF2&destination=%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF3&travelmode=walking",
        "from_stop": 3,
        "to_stop": 4,
        "waypoint_count": 0,
        "url_length": 1430,
        "point_kinds": [
          "address",
          "address"
        ]
      },
      {
        "index": 4,
        "of": 4,
        "url": "https://www.google.com/maps/dir/?api=1&origin=%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF3&destination=%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF%E1%BA%BF4&travelmode=walking",
        "from_stop": 4,
        "to_stop": 5,
        "waypoint_count": 0,
        "url_length": 1430,
        "point_kinds": [
          "address",
          "address"
        ]
      }
    ],
    "skipped": [],
    "notes": [
      "Links contain the origin/venue coordinates or fallback addresses and are sent to Google only when the user opens them.",
      "The schedule is the app's proposal; Google may show different times."
    ]
  }
};
