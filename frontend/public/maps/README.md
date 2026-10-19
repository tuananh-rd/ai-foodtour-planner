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

## Versioned MapLibre Web Worker Asset

- File: `maplibre-gl-worker-6.15.0.mjs` (518,806 bytes)
- Source: Direct exact copy from installed licensed dependency `maplibre-gl@6.15.0` (`node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs`).
- License: 3-Clause BSD License (https://github.com/maplibre/maplibre-gl-js/blob/v6.15.0/LICENSE.txt).
- SHA256: `1c69066368331aae63967ed24a9affcf962cf55fcc6d8f532a8b040f736dbcfa`.
- Purpose: Guarantees reliable same-origin Web Worker loading under Next.js and browser environments without remote CDN calls, blob cross-origin restrictions, or bundler URL misresolution.

### MapLibre GL JS 3-Clause BSD License Text

```text
Copyright (c) 2023, MapLibre contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice,
      this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.
    * Neither the name of MapLibre GL JS nor the names of its contributors
      may be used to endorse or promote products derived from this software
      without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```


