'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { normalizeDisplayText } from '../../../../lib/emojiSanitizer';
import 'maplibre-gl/dist/maplibre-gl.css';
import './pilot-map.css';

export const PILOT_BOUNDS = {
  west: 105.835,
  south: 21.018,
  east: 105.866,
  north: 21.046
};

const DEFAULT_CENTER = [105.8505, 21.032];
const DEFAULT_ZOOM = 13.5;

/**
 * Authoritative bounds check for Hoan Kiem pilot area.
 * Shared directly with QA test suites.
 */
export function isInsidePilotBounds(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) return false;
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
 * Invariants & review gates:
 * - Exact pilot maxBounds: [[105.835, 21.018], [105.866, 21.046]] (no expanded offsets)
 * - MapLibre 6 web worker setup using official bundler pattern with same-origin fallback
 * - Controlled loading timeout (8s) and failure fallback on all source/Range/network errors
 * - Complete map and marker destruction on error, replace, and unmount
 * - Immediate synchronous marker placement on map creation to eliminate map-ready race
 * - Native <button> markers with keyboard activation (Enter/Space) and safe popup focus management
 * - Stable testids: pilot-map-canvas, pilot-markers-toggle, pilot-map-fallback
 * - Same-origin asset only (/maps/hoankiem-20261018.pmtiles); zero remote tiles or glyphs
 * - Visible OpenStreetMap & Protomaps attribution with map date
 */
export default function PilotMap({ stops = [], onFallbackToSchematic }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const maplibreglRef = useRef(null);
  const markersRef = useRef([]);
  const markerGenRef = useRef(0);
  const mapLoadedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [markersVisible, setMarkersVisible] = useState(true);

  // Memoize valid stops to prevent unneeded effect re-executions
  const validStops = useMemo(() => {
    return (stops || []).map((s, idx) => {
      const lat = s.lat ?? s.venue?.lat ?? null;
      const lon = s.lon ?? s.venue?.lon ?? null;
      return {
        index: idx + 1,
        id: s.venue_id || s.id || `stop-${idx}`,
        name: normalizeDisplayText(s.name || s.venue?.name || `Điểm ${idx + 1}`),
        address: normalizeDisplayText(s.address || s.venue?.address || ''),
        district: normalizeDisplayText(s.district || s.venue?.district || ''),
        lat: typeof lat === 'number' && !isNaN(lat) ? lat : null,
        lon: typeof lon === 'number' && !isNaN(lon) ? lon : null,
        inBounds: isInsidePilotBounds(lat, lon)
      };
    });
  }, [stops]);

  const stopsRef = useRef(validStops);
  stopsRef.current = validStops;

  const markersVisibleRef = useRef(markersVisible);
  markersVisibleRef.current = markersVisible;

  const outOfBoundsCount = useMemo(() => {
    return validStops.filter((s) => s.lat !== null && s.lon !== null && !s.inBounds).length;
  }, [validStops]);

  const missingCoordsCount = useMemo(() => {
    return validStops.filter((s) => s.lat === null || s.lon === null).length;
  }, [validStops]);

  // Synchronous, generation-tracked marker rendering
  const renderMarkersSync = useCallback((map, maplibregl, stopsToRender, isVisible) => {
    const currentGen = ++markerGenRef.current;

    // Clear existing markers immediately
    markersRef.current.forEach((m) => {
      try { m.remove(); } catch (_) {}
    });
    markersRef.current = [];

    if (!isVisible || !map || !maplibregl) return;

    stopsToRender.forEach((stop) => {
      if (stop.lat === null || stop.lon === null) return;

      // Native <button> element for accessible keyboard focus and Enter/Space activation
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `nn-map-marker${stop.index === stopsToRender.length && stopsToRender.length > 1 ? ' last' : ''}`;
      const stopNameClean = normalizeDisplayText(stop.name);
      const stopAddrClean = normalizeDisplayText(stop.address || stop.district);

      btn.textContent = String(stop.index);
      btn.title = stopNameClean;
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', `Điểm dừng ${stop.index}: ${stopNameClean}`);

      // Safe DOM popup with textContent only (no innerHTML)
      const popupContent = document.createElement('div');
      popupContent.className = 'nn-map-popup-card';
      popupContent.setAttribute('tabindex', '-1');

      const titleEl = document.createElement('div');
      titleEl.className = 'nn-map-popup-title';
      titleEl.textContent = `${stop.index}. ${stopNameClean}`;
      popupContent.appendChild(titleEl);

      if (stopAddrClean) {
        const addrEl = document.createElement('div');
        addrEl.className = 'nn-map-popup-addr';
        addrEl.textContent = stopAddrClean;
        popupContent.appendChild(addrEl);
      }

      const linkEl = document.createElement('a');
      linkEl.className = 'nn-map-popup-link';
      linkEl.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.name} ${stop.address || stop.district || 'Hà Nội'}`)}`;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      linkEl.textContent = 'Mở Google Maps';
      popupContent.appendChild(linkEl);

      const popup = new maplibregl.Popup({ offset: 15, closeButton: true }).setDOMContent(popupContent);

      // Safe focus restoration on popup close
      popup.on('close', () => {
        try { btn.focus(); } catch (_) {}
      });

      if (currentGen !== markerGenRef.current) return;

      const marker = new maplibregl.Marker({ element: btn })
        .setLngLat([stop.lon, stop.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, []);

  const cleanupMap = useCallback(() => {
    markersRef.current.forEach((m) => {
      try { m.remove(); } catch (_) {}
    });
    markersRef.current = [];
    if (mapInstanceRef.current) {
      try { mapInstanceRef.current.remove(); } catch (_) {}
      mapInstanceRef.current = null;
    }
    maplibreglRef.current = null;
    mapLoadedRef.current = false;
    setMapReady(false);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    // Bounded loading timeout (8s) per review requirement
    const timeoutId = setTimeout(() => {
      if (!isCancelled && !mapLoadedRef.current) {
        cleanupMap();
        setMapError('Quá thời gian tải bản đồ hoặc kết nối mạng nội bộ bị gián đoạn.');
        setLoading(false);
      }
    }, 8000);

    async function initMap() {
      if (!mapContainerRef.current) return;

      try {
        const { Protocol } = await import('pmtiles');
        const maplibregl = await import('maplibre-gl');

        if (isCancelled) return;

        // Register pmtiles protocol once on client
        if (typeof window !== 'undefined' && !window._pmtilesProtocolRegistered) {
          const protocol = new Protocol();
          maplibregl.addProtocol('pmtiles', protocol.tile);
          window._pmtilesProtocolRegistered = true;
        }

        // Configure MapLibre 6 web worker: official bundler URL with versioned local fallback
        if (typeof window !== 'undefined' && !window._maplibreWorkerConfigured) {
          try {
            const bundlerUrl = new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString();
            maplibregl.setWorkerUrl(bundlerUrl || `${window.location.origin}/maps/maplibre-gl-worker-6.15.0.mjs`);
          } catch (_) {
            maplibregl.setWorkerUrl(`${window.location.origin}/maps/maplibre-gl-worker-6.15.0.mjs`);
          }
          window._maplibreWorkerConfigured = true;
        }

        const pmtilesUrl = `${window.location.origin}/maps/hoankiem-20261018.pmtiles`;

        // Local vector style matching existing visual palette without remote dependencies
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

        // Exact pilot bounds without expanded offsets per review gate (msg_1b00b24b7fe4)
        const exactPilotMaxBounds = [
          [PILOT_BOUNDS.west, PILOT_BOUNDS.south],
          [PILOT_BOUNDS.east, PILOT_BOUNDS.north]
        ];

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: localStyle,
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          minZoom: 10,
          maxZoom: 16,
          maxBounds: exactPilotMaxBounds,
          cooperativeGestures: true,
          attributionControl: false
        });

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        mapInstanceRef.current = map;
        maplibreglRef.current = maplibregl;

        // Immediately attach initial markers to canvas container synchronously
        renderMarkersSync(map, maplibregl, stopsRef.current, markersVisibleRef.current);

        // Controlled fallback for all map errors unconditionally without raw console leaks
        map.on('error', () => {
          if (!isCancelled) {
            clearTimeout(timeoutId);
            cleanupMap();
            setMapError('Không thể tải dữ liệu bản đồ nội bộ hoặc WebGL không khả dụng.');
            setLoading(false);
          }
        });

        map.on('load', () => {
          if (!isCancelled) {
            clearTimeout(timeoutId);
            mapLoadedRef.current = true;
            setLoading(false);
            setMapReady(true);
            renderMarkersSync(map, maplibregl, stopsRef.current, markersVisibleRef.current);
          }
        });
      } catch (err) {
        if (!isCancelled) {
          clearTimeout(timeoutId);
          cleanupMap();
          setMapError('Lỗi khởi tạo bản đồ nội bộ hoặc WebGL không khả dụng.');
          setLoading(false);
        }
      }
    }

    initMap();

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
      cleanupMap();
    };
  }, [cleanupMap, renderMarkersSync]);

  // Synchronize stop markers on validStops, markersVisible, or mapReady change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const maplibregl = maplibreglRef.current;
    if (!map || !maplibregl) return;
    renderMarkersSync(map, maplibregl, validStops, markersVisible);
  }, [validStops, markersVisible, mapReady, renderMarkersSync]);

  if (mapError) {
    return (
      <div className="nn-pilot-map-container" data-testid="pilot-map-fallback">
        <div className="nn-map-fallback-banner">
          <div className="nn-map-fallback-title">Chưa thể hiển thị bản đồ tương tác</div>
          <p className="nn-map-fallback-desc">
            {mapError} Bạn vẫn có thể xem sơ đồ các chặng hoặc mở chỉ đường Google Maps miễn phí.
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
          data-testid="pilot-markers-toggle"
          data-legacy-testid="map-marker-toggle-btn"
          onClick={() => setMarkersVisible((v) => !v)}
          aria-pressed={markersVisible}
        >
          {markersVisible ? 'Ẩn điểm dừng' : 'Hiện điểm dừng'}
        </button>

        {outOfBoundsCount > 0 && (
          <span className="nn-map-coverage-warning" data-testid="map-coverage-warning">
            Lưu ý: {outOfBoundsCount} điểm ngoài khu vực thí điểm
          </span>
        )}

        {missingCoordsCount > 0 && (
          <span className="nn-map-coverage-warning" data-testid="map-missing-coords-warning">
            Thông tin: {missingCoordsCount} điểm chưa có toạ độ
          </span>
        )}
      </div>

      {/* Map Canvas with stable pilot-map-canvas testid and loading state */}
      <div
        ref={mapContainerRef}
        className="nn-map-canvas-wrapper"
        data-testid="pilot-map-canvas"
        data-legacy-testid="map-canvas"
        style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}
        aria-busy={loading}
      />

      {loading && (
        <div className="sr-only" role="status" aria-live="polite">
          Đang tải bản đồ khu vực Hoàn Kiếm…
        </div>
      )}

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
          (c) 
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
