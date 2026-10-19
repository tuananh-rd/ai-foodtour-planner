# Self-hosted Hoan Kiem pilot basemap

Public OSM-derived data only. No experimental/private venue data is included.

- Source: https://build.protomaps.com/20261018.pmtiles (Protomaps basemap 4.15.2).
- Source index: https://maps.protomaps.com/builds/.
- OSM replication timestamp in archive metadata: 2026-10-18T04:00:00Z.
- Bounds requested: west105.835, south21.018, east105.866, north21.046. Extraction includes intersecting tiles; visible viewport must stay within pilot bounds.
- Zooms10–15, 33 extracted tiles. Exact archive size: 2,138,597 bytes.
- SHA256: `5e5cdc69f227a8c843a0a328b7358990e872a05f75842c6a7e5e730ca37e4609`.
- Tool: upstream go-pmtiles v1.31.2, Windows x86_64; ZIP SHA256 verified against upstream release digest `a658baa4d7e55020aef6ca17bd9ff9faa1582671266b36f58c52db0ac8e785a1`.
- Command: `pmtiles extract https://build.protomaps.com/20261018.pmtiles hoankiem-20261018.pmtiles --bbox=105.835,21.018,105.866,21.046 --minzoom=10 --maxzoom=15 --download-threads=2`.

Attribution must remain visible: © OpenStreetMap contributors, https://www.openstreetmap.org/copyright; basemap by Protomaps. OSM data is under ODbL1.0: https://opendatacommons.org/licenses/odbl/1-0/. This tile archive is an OSM-derived Produced Work under the source's documented terms (https://docs.protomaps.com/basemaps/downloads). Natural Earth inputs are public domain. Attribution is not evidence of venue opening, prices or allergy safety.

Serve this versioned asset from the same local origin with HTTP byte ranges and cache headers. Do not fall back to remote public tiles. Regenerate deliberately when freshness is needed; no scheduled download, paid hosting or infinite-free resource claim is configured.
