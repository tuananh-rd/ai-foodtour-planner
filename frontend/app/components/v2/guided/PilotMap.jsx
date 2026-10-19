'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

const PILOT_BOUNDS = {
  west: 105.835,
  south: 21.018,
  east: 105.866,
  north: 21.046
};

const DEFAULT_CENTER = [105.8505, 21.032];
const DEFAULT_ZOOM = 13.5;

function isInsidePilotBounds(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  return (
    lon >= PILOT_BOUNDS.west &&
    lon <= PILOT_BOUNDS.east &&
    lat >= PILOT_BOUNDS.south &&
    lat <= PILOT_BOUNDS.north
  );
}

/**
 * PilotMap
 * Interactive local map using self-hosted Hoan Kiem PMTiles vector archive and MapLibre GL.
 * 
 * Safety & Privacy constraints:
 * - Dynamic ESM import to prevent SSR/WebGL crashes.
 * - Same-origin asset only (/maps/hoankiem-20261018.pmtiles). Zero external tiles/glyphs/styles.
 * - Bounded viewport restricted to Hoan Kiem pilot area.
 * - Non-clamping of out-of-bounds coordinates; reports out-of-coverage count.
 * - Safe DOM popups without innerHTML.
 * - No GPS request on activation.
 * - Cooperative gestures to prevent page scroll hijacking.
 * - Visible OpenStreetMap & Protomaps attribution with source date.
 */
export default function PilotMap({ stops = [], onFallbackToSchematic }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState(null);
  const [markersVisible, setMarkersVisible] = useState(true);

  // Extract stops with coordinates
  const validStops = (stops || []).map((s, idx) => {
    const lat = s.lat ?? s.venue?.lat ?? null;
    const lon = s.lon ?? s.venue?.lon ?? null;
    return {
      index: idx + 1,
      id: s.venue_id || s.id || `stop-${idx}`,
      name: s.name || s.venue?.name || `Điểm ${idx + 1}`,
      address: s.address || s.venue?.address || '',
      district: s.district || s.venue?.district || '',
      lat: typeof lat === 'number' ? lat : null,
      lon: typeof lon === 'number' ? lon : null,
      inBounds: isInsidePilotBounds(lat, lon)
    };
  });

  const outOfBoundsCount = validStops.filter((s) => s.lat !== null && s.lon !== null && !s.inBounds).length;
  const missingCoordsCount = validStops.filter((s) => s.lat === null || s.lon === null).length;

  useEffect(() => {
    let isCancelled = false;

    async function initMap() {
      if (!mapContainerRef.current) return;

      try {
        const { Protocol } = await import('pmtiles');
        const maplibregl = await import('maplibre-gl');

        if (isCancelled) return;

        // Register pmtiles protocol on maplibre once
        if (typeof window !== 'undefined' && !window._pmtilesProtocolRegistered) {
          const protocol = new Protocol();
          maplibregl.addProtocol('pmtiles', protocol.tile);
          window._pmtilesProtocolRegistered = true;
        }

        const pmtilesUrl = `${window.location.origin}/maps/hoankiem-20261018.pmtiles`;

        // Local vector style with zero remote dependencies
        const localStyle = {
          version: 8,
          sources: {
            protomaps: {
              type: 'vector',
              url: `pmtiles://${pmtilesUrl}`
            }
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#EBF2ED' }
            },
            {
              id: 'earth',
              type: 'fill',
              source: 'protomaps',
              'source-layer': 'earth',
              paint: { 'fill-color': '#E5EDE7' }
            },
            {
              id: 'landuse',
              type: 'fill',
              source: 'protomaps',
              'source-layer': 'landuse',
              paint: { 'fill-color': '#DCE7DF' }
            },
            {
              id: 'water',
              type: 'fill',
              source: 'protomaps',
              'source-layer': 'water',
              paint: { 'fill-color': '#BCE3D5' }
            },
            {
              id: 'buildings',
              type: 'fill',
              source: 'protomaps',
              'source-layer': 'buildings',
              paint: { 'fill-color': '#D8E3DC', 'fill-outline-color': '#C8D6CD' }
            },
            {
              id: 'roads_casing',
              type: 'line',
              source: 'protomaps',
              'source-layer': 'roads',
              paint: { 'line-color': '#CAD8D0', 'line-width': 2 }
            },
            {
              id: 'roads',
              type: 'line',
              source: 'protomaps',
              'source-layer': 'roads',
              paint: { 'line-color': '#FFFFFF', 'line-width': 1.2 }
            },
            {
              id: 'boundaries',
              type: 'line',
              source: 'protomaps',
              'source-layer': 'boundaries',
              paint: { 'line-color': '#88A596', 'line-dasharray': [2, 2] }
            }
          ]
        };

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: localStyle,
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          minZoom: 10,
          maxZoom: 16,
          maxBounds: [
            [PILOT_BOUNDS.west - 0.015, PILOT_BOUNDS.south - 0.01],
            [PILOT_BOUNDS.east + 0.015, PILOT_BOUNDS.north + 0.01]
          ],
          cooperativeGestures: true,
          attributionControl: false
        });

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        map.on('error', (e) => {
          console.warn('MapLibre error:', e);
          if (e?.error?.message?.includes('WebGL') || e?.error?.status === 404) {
            setMapError('Không thể tải dữ liệu bản đồ hoặc WebGL không được hỗ trợ.');
          }
        });

        map.on('load', () => {
          if (!isCancelled) {
            setLoading(false);
          }
        });

        mapInstanceRef.current = map;
      } catch (err) {
        console.error('Failed to initialize map:', err);
        if (!isCancelled) {
          setMapError(err?.message || 'Lỗi khởi tạo bản đồ.');
          setLoading(false);
        }
      }
    }

    initMap();

    return () => {
      isCancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Synchronize stop markers on stop changes or visibility toggle
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!markersVisible) return;

    import('maplibre-gl').then((maplibregl) => {
      validStops.forEach((stop) => {
        if (stop.lat === null || stop.lon === null) return;

        // Create marker element
        const el = document.createElement('div');
        el.className = `nn-map-marker${stop.index === validStops.length && validStops.length > 1 ? ' last' : ''}`;
        el.textContent = String(stop.index);
        el.title = stop.name;
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', `Điểm dừng ${stop.index}: ${stop.name}`);

        // Create safe popup
        const popupContent = document.createElement('div');
        const titleEl = document.createElement('div');
        titleEl.className = 'nn-map-popup-title';
        titleEl.textContent = `${stop.index}. ${stop.name}`;
        popupContent.appendChild(titleEl);

        if (stop.address || stop.district) {
          const addrEl = document.createElement('div');
          addrEl.className = 'nn-map-popup-addr';
          addrEl.textContent = stop.address || stop.district;
          popupContent.appendChild(addrEl);
        }

        const linkEl = document.createElement('a');
        linkEl.className = 'nn-map-popup-link';
        linkEl.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.name} ${stop.address || stop.district || 'Hà Nội'}`)}`;
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
        linkEl.textContent = 'Mở Google Maps ↗';
        popupContent.appendChild(linkEl);

        const popup = new maplibregl.Popup({ offset: 15, closeButton: true }).setDOMContent(popupContent);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([stop.lon, stop.lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });
    });
  }, [validStops, markersVisible, loading]);

  if (mapError) {
    return (
      <div className="nn-pilot-map-container" data-testid="pilot-map-fallback">
        <div className="nn-map-fallback-banner">
          <div className="nn-map-fallback-title">Chưa thể hiển thị bản đồ tương tác</div>
          <p className="nn-map-fallback-desc">
            {mapError}. Bạn vẫn có thể xem sơ đồ các chặng hoặc dùng liên kết chỉ đường Google Maps miễn phí.
          </p>
          {typeof onFallbackToSchematic === 'function' && (
            <button
              type="button"
              className="nn-ghost-pill"
              onClick={onFallbackToSchematic}
              style={{ alignSelf: 'center', marginTop: 8 }}
            >
              Quay lại sơ đồ tuyến
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="nn-pilot-map-container" data-testid="pilot-map-container" role="region" aria-label="Bản đồ ẩm thực Hoàn Kiếm">
      {/* Controls Bar */}
      <div className="nn-map-controls-bar" data-testid="map-controls-bar">
        <button
          type="button"
          className="nn-map-marker-toggle-btn"
          data-testid="map-marker-toggle-btn"
          onClick={() => setMarkersVisible((v) => !v)}
          aria-pressed={markersVisible}
        >
          {markersVisible ? 'Ẩn điểm dừng' : 'Hiện điểm dừng'}
        </button>

        {outOfBoundsCount > 0 && (
          <span className="nn-map-coverage-warning" data-testid="map-coverage-warning">
            ⚠️ {outOfBoundsCount} điểm ngoài khu vực thí điểm
          </span>
        )}

        {missingCoordsCount > 0 && (
          <span className="nn-map-coverage-warning" data-testid="map-missing-coords-warning">
            ℹ️ {missingCoordsCount} điểm chưa có toạ độ
          </span>
        )}
      </div>

      {/* Map Canvas */}
      <div
        ref={mapContainerRef}
        className="nn-map-canvas-wrapper"
        data-testid="map-canvas"
        style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}
      />

      {/* Accessible Screen Reader List */}
      <ol className="sr-only" aria-label="Danh sách điểm dừng trên bản đồ">
        {validStops.map((stop) => (
          <li key={stop.id}>
            {stop.index}. {stop.name} - {stop.address || stop.district || 'Hà Nội'}
            {stop.inBounds ? ' (trong khu vực Hoàn Kiếm)' : ' (ngoài khu vực Hoàn Kiếm)'}
          </li>
        ))}
      </ol>

      {/* Visible Attribution */}
      <div className="nn-map-attribution" data-testid="map-attribution">
        <span>
          ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>{' '}
          contributors, Protomaps
        </span>
        <span>Dữ liệu: 2026-10-18</span>
      </div>
    </div>
  );
}
