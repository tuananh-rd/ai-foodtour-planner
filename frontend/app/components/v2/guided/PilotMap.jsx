'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { normalizeDisplayText } from '../../../../lib/emojiSanitizer';
import 'maplibre-gl/dist/maplibre-gl.css';
import './pilot-map.css';

import { PILOT_BOUNDS, DEFAULT_CENTER, DEFAULT_ZOOM, isInsidePilotBounds } from '../../../../lib/pilotBounds.js';
import { isValidCoordinate } from '../../../../lib/discoveryMaps.js';
export { PILOT_BOUNDS, DEFAULT_CENTER, DEFAULT_ZOOM, isInsidePilotBounds };

/**
 * PilotMap
 * Interactive local map using self-hosted Hoan Kiem PMTiles vector archive and MapLibre GL.
 * 
 * Invariants & review gates:
 * - Displays explicitly selected origin with human-readable label and distinct marker
 * - Missing coordinates are NEVER placed at 0,0 and NEVER coerced from null/empty/bool
 * - Dashed connectors represent straight-line estimates only (no road route or live ETA claims)
 * - Missing coordinates break adjacency: connectors NEVER bridge or skip over missing stops
 * - Complete map and marker destruction on error, replace, and unmount
 * - Native <button> markers with keyboard activation (Enter/Space) and safe popup focus management
 * - Stable testids: pilot-map-canvas, pilot-markers-toggle, pilot-origin-marker, pilot-map-fallback
 * - Same-origin asset only (/maps/hoankiem-20261018.pmtiles); zero remote tiles or glyphs
 * - Visible OpenStreetMap & Protomaps attribution with map date
 * - Zero emoji in UI strings
 * - Discloses local tile coverage outside Hoan Kiem without restrictive viewport clipping
 */
export default function PilotMap({
  stops = [],
  origin = null,
  originLabel = '',
  onFallbackToSchematic,
  className = '',
  style = {}
}) {
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

  // Validate and memoize explicit origin using strict numeric checks (no coercion)
  const validOrigin = useMemo(() => {
    if (!isValidCoordinate(origin)) return null;
    const lat = origin.lat;
    const lon = origin.lon !== undefined ? origin.lon : origin.lng;
    const label = normalizeDisplayText(origin.label || originLabel || 'Điểm xuất phát');
    return {
      lat,
      lon,
      label,
      inBounds: isInsidePilotBounds(lat, lon)
    };
  }, [origin, originLabel]);

  // Memoize valid stops using strict numeric checks (no coercion of null, bool, or strings)
  const validStops = useMemo(() => {
    return (stops || []).map((s, idx) => {
      const candidate = {
        lat: typeof s.lat === 'number' ? s.lat : (typeof s.venue?.lat === 'number' ? s.venue.lat : null),
        lon: s.lon !== undefined
          ? (typeof s.lon === 'number' ? s.lon : null)
          : (s.lng !== undefined
          ? (typeof s.lng === 'number' ? s.lng : null)
          : (s.venue?.lon !== undefined
          ? (typeof s.venue.lon === 'number' ? s.venue.lon : null)
          : (typeof s.venue?.lng === 'number' ? s.venue.lng : null)))
      };
      const hasCoords = isValidCoordinate(candidate);
      const stopOrder = (typeof s.order === 'number' && s.order > 0)
        ? s.order
        : ((typeof s.index === 'number' && s.index > 0) ? s.index : idx + 1);

      return {
        index: stopOrder,
        order: stopOrder,
        id: s.venue_id || s.id || `stop-${idx}`,
        name: normalizeDisplayText(s.name || s.venue?.name || `Điểm ${stopOrder}`),
        address: normalizeDisplayText(s.address || s.venue?.address || ''),
        district: normalizeDisplayText(s.district || s.venue?.district || ''),
        lat: hasCoords ? candidate.lat : null,
        lon: hasCoords ? candidate.lon : null,
        inBounds: hasCoords ? isInsidePilotBounds(candidate.lat, candidate.lon) : false
      };
    });
  }, [stops]);

  const stopsRef = useRef(validStops);
  stopsRef.current = validStops;

  const originRef = useRef(validOrigin);
  originRef.current = validOrigin;

  const markersVisibleRef = useRef(markersVisible);
  markersVisibleRef.current = markersVisible;

  const outOfBoundsCount = useMemo(() => {
    const stopOut = validStops.filter((s) => s.lat !== null && s.lon !== null && !s.inBounds).length;
    const originOut = validOrigin && !validOrigin.inBounds ? 1 : 0;
    return stopOut + originOut;
  }, [validStops, validOrigin]);

  const missingCoordsCount = useMemo(() => {
    return validStops.filter((s) => s.lat === null || s.lon === null).length;
  }, [validStops]);

  // Compute contiguous connector segments
  // Missing coordinates break adjacency: NEVER bridge or skip over missing stops
  const connectorSegments = useMemo(() => {
    const segments = [];
    let currentSeg = [];

    if (validOrigin && validOrigin.lat !== null && validOrigin.lon !== null) {
      currentSeg.push([validOrigin.lon, validOrigin.lat]);
    }

    for (const stop of validStops) {
      if (stop.lat !== null && stop.lon !== null) {
        if (currentSeg.length > 0) {
          currentSeg.push([stop.lon, stop.lat]);
          segments.push(currentSeg);
        }
        currentSeg = [[stop.lon, stop.lat]];
      } else {
        // Missing coordinate breaks adjacency
        currentSeg = [];
      }
    }

    return segments;
  }, [validOrigin, validStops]);

  // Full cleanup helper to prevent WebGL context leaks
  const cleanupMap = useCallback(() => {
    markerGenRef.current += 1;
    markersRef.current.forEach((m) => {
      try { m.remove(); } catch (_) {}
    });
    markersRef.current = [];

    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch (_) {}
      mapInstanceRef.current = null;
    }
    mapLoadedRef.current = false;
    setMapReady(false);
  }, []);

  // Update connector lines GeoJSON
  const updateConnectors = useCallback((map, segments) => {
    if (!map) return;
    const source = map.getSource('route-connectors');
    if (!source) return;

    const features = segments.map((seg, idx) => ({
      type: 'Feature',
      id: `seg-${idx}`,
      geometry: {
        type: 'LineString',
        coordinates: seg
      },
      properties: {
        estimated: true,
        label: 'Đường nối ước tính'
      }
    }));

    try {
      source.setData({
        type: 'FeatureCollection',
        features
      });
    } catch (_) {}
  }, []);

  // Synchronous marker rendering
  const renderMarkersSync = useCallback((map, maplibregl, stopsToRender, originToRender, isVisible) => {
    markerGenRef.current += 1;
    const currentGen = markerGenRef.current;

    // Remove existing markers
    markersRef.current.forEach((m) => {
      try { m.remove(); } catch (_) {}
    });
    markersRef.current = [];

    if (!map || !maplibregl || !isVisible) return;

    // 1. Explicit Origin Marker
    if (originToRender && originToRender.lat !== null && originToRender.lon !== null) {
      const originBtn = document.createElement('button');
      originBtn.type = 'button';
      originBtn.className = 'nn-map-origin-marker';
      originBtn.setAttribute('data-testid', 'pilot-origin-marker');
      const originLabelClean = normalizeDisplayText(originToRender.label);
      originBtn.textContent = 'S';
      originBtn.title = `Điểm xuất phát: ${originLabelClean}`;
      originBtn.setAttribute('tabindex', '0');
      originBtn.setAttribute('aria-label', `Điểm xuất phát: ${originLabelClean}`);

      const popupContent = document.createElement('div');
      popupContent.className = 'nn-map-popup-card';
      popupContent.setAttribute('tabindex', '-1');

      const titleEl = document.createElement('div');
      titleEl.className = 'nn-map-popup-title';
      titleEl.textContent = `Xuất phát: ${originLabelClean}`;
      popupContent.appendChild(titleEl);

      const descEl = document.createElement('div');
      descEl.className = 'nn-map-popup-addr';
      descEl.textContent = originToRender.inBounds
        ? 'Điểm xuất phát đã chọn'
        : 'Điểm xuất phát (khu vực ngoài trung tâm)';
      popupContent.appendChild(descEl);

      const linkEl = document.createElement('a');
      linkEl.className = 'nn-map-popup-link';
      linkEl.href = `https://www.openstreetmap.org/search?query=${encodeURIComponent(originToRender.label)}`;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      linkEl.textContent = 'Mở OpenStreetMap';
      popupContent.appendChild(linkEl);

      const popup = new maplibregl.Popup({ offset: 15, closeButton: true }).setDOMContent(popupContent);
      popup.on('close', () => {
        try { originBtn.focus(); } catch (_) {}
      });

      if (currentGen !== markerGenRef.current) return;

      const originMarker = new maplibregl.Marker({ element: originBtn })
        .setLngLat([originToRender.lon, originToRender.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(originMarker);
    }

    // 2. Sequential Numbered Tour Stops
    stopsToRender.forEach((stop, idx) => {
      if (stop.lat === null || stop.lon === null) return;

      const stopOrder = stop.order || stop.index || (idx + 1);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `nn-map-marker${idx === stopsToRender.length - 1 && stopsToRender.length > 1 ? ' last' : ''}`;
      btn.setAttribute('data-testid', `pilot-stop-marker-${stopOrder}`);
      const stopNameClean = normalizeDisplayText(stop.name);
      const stopAddrClean = normalizeDisplayText(stop.address || stop.district);

      btn.textContent = String(stopOrder);
      btn.title = stopNameClean;
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', `Điểm dừng ${stopOrder}: ${stopNameClean}`);

      const popupContent = document.createElement('div');
      popupContent.className = 'nn-map-popup-card';
      popupContent.setAttribute('tabindex', '-1');

      const titleEl = document.createElement('div');
      titleEl.className = 'nn-map-popup-title';
      titleEl.textContent = `${stopOrder}. ${stopNameClean}`;
      popupContent.appendChild(titleEl);

      if (stopAddrClean) {
        const addrEl = document.createElement('div');
        addrEl.className = 'nn-map-popup-addr';
        addrEl.textContent = stopAddrClean;
        popupContent.appendChild(addrEl);
      }

      const linkEl = document.createElement('a');
      linkEl.className = 'nn-map-popup-link';
      linkEl.href = `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${stop.name} ${stop.address || stop.district || 'Hà Nội'}`)}`;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      linkEl.textContent = 'Mở OpenStreetMap';
      popupContent.appendChild(linkEl);

      const popup = new maplibregl.Popup({ offset: 15, closeButton: true }).setDOMContent(popupContent);

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

  // Fit bounds to all valid points (origin + tour stops), not clipped to pilot bounds
  const fitMapToBounds = useCallback((map, maplibregl, stopsToFit, originToFit) => {
    if (!map || !maplibregl) return;
    const points = [];
    if (originToFit && originToFit.lat !== null && originToFit.lon !== null) {
      points.push([originToFit.lon, originToFit.lat]);
    }
    stopsToFit.forEach((s) => {
      if (s.lat !== null && s.lon !== null) {
        points.push([s.lon, s.lat]);
      }
    });

    if (points.length === 0) return;

    if (points.length === 1) {
      map.easeTo({ center: points[0], zoom: 14, duration: 200 });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    points.forEach((pt) => bounds.extend(pt));
    try {
      map.fitBounds(bounds, {
        padding: { top: 40, bottom: 40, left: 40, right: 40 },
        maxZoom: 15.5,
        duration: 200
      });
    } catch (_) {}
  }, []);

  // Initialize Map
  useEffect(() => {
    let isCancelled = false;
    const timeoutId = setTimeout(() => {
      if (!mapLoadedRef.current && !isCancelled) {
        setMapError('Tải bản đồ quá thời gian quy định.');
        setLoading(false);
      }
    }, 10000);

    async function initMap() {
      if (!mapContainerRef.current) return;
      cleanupMap();

      try {
        const [maplibreglModule, pmtilesModule] = await Promise.all([
          import('maplibre-gl'),
          import('pmtiles')
        ]);

        if (isCancelled) return;

        const maplibregl = maplibreglModule.default || maplibreglModule;
        const { Protocol } = pmtilesModule;

        // Register PMTiles protocol globally once
        if (typeof window !== 'undefined' && !window._pmtilesProtocolRegistered) {
          const protocol = new Protocol();
          maplibregl.addProtocol('pmtiles', protocol.tile);
          window._pmtilesProtocolRegistered = true;
        }

        // Configure MapLibre web worker
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

        // Local vector style matching warm editorial palette without remote dependencies
        const localStyle = {
          version: 8,
          sources: {
            protomaps: {
              type: 'vector',
              url: `pmtiles://${pmtilesUrl}`
            },
            'route-connectors': {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: []
              }
            }
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#EBF2ED' }
            },
            {
              id: 'water',
              type: 'fill',
              source: 'protomaps',
              'source-layer': 'water',
              paint: { 'fill-color': '#CDE0D8' }
            },
            {
              id: 'earth',
              type: 'fill',
              source: 'protomaps',
              'source-layer': 'earth',
              paint: { 'fill-color': '#DFECE5' }
            },
            {
              id: 'landuse',
              type: 'fill',
              source: 'protomaps',
              'source-layer': 'landuse',
              paint: { 'fill-color': '#E4EFE8' }
            },
            {
              id: 'buildings',
              type: 'fill',
              source: 'protomaps',
              'source-layer': 'buildings',
              paint: {
                'fill-color': '#DFDACF',
                'fill-outline-color': '#CEC8BC',
                'fill-opacity': 0.75
              }
            },
            {
              id: 'roads-casing',
              type: 'line',
              source: 'protomaps',
              'source-layer': 'roads',
              paint: { 'line-color': '#C8D5CD', 'line-width': 2.8 }
            },
            {
              id: 'roads-inner',
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
            },
            {
              id: 'estimated-connectors',
              type: 'line',
              source: 'route-connectors',
              paint: {
                'line-color': '#166B52',
                'line-width': 2.5,
                'line-dasharray': [3, 2]
              }
            }
          ]
        };

        // Initialize MapLibre without restrictive pilot maxBounds so actual tour (e.g. Hoang Mai) fits correctly
        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: localStyle,
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          minZoom: 8,
          maxZoom: 18,
          cooperativeGestures: true,
          attributionControl: false
        });

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        mapInstanceRef.current = map;
        maplibreglRef.current = maplibregl;

        // Render initial markers synchronously
        renderMarkersSync(map, maplibregl, stopsRef.current, originRef.current, markersVisibleRef.current);

        map.on('error', () => {
          if (!isCancelled) {
            clearTimeout(timeoutId);
            cleanupMap();
            setMapError('Lỗi hiển thị bản đồ vector nội bộ.');
            setLoading(false);
          }
        });

        map.on('load', () => {
          if (!isCancelled) {
            clearTimeout(timeoutId);
            mapLoadedRef.current = true;
            setLoading(false);
            setMapReady(true);
            renderMarkersSync(map, maplibregl, stopsRef.current, originRef.current, markersVisibleRef.current);
            updateConnectors(map, connectorSegments);
            fitMapToBounds(map, maplibregl, stopsRef.current, originRef.current);
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

    // Auto-resize observer on container and window
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          try { mapInstanceRef.current.resize(); } catch (_) {}
        }
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    const handleWindowResize = () => {
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.resize(); } catch (_) {}
      }
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      cleanupMap();
    };
  }, [cleanupMap, renderMarkersSync, updateConnectors, fitMapToBounds, connectorSegments]);

  // Synchronize stop markers & origin on changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const maplibregl = maplibreglRef.current;
    if (!map || !maplibregl) return;
    renderMarkersSync(map, maplibregl, validStops, validOrigin, markersVisible);
    updateConnectors(map, connectorSegments);
  }, [validStops, validOrigin, markersVisible, mapReady, renderMarkersSync, updateConnectors, connectorSegments]);

  if (mapError) {
    return (
      <div className={`nn-pilot-map-container ${className}`.trim()} style={style} data-testid="pilot-map-fallback">
        <div className="nn-map-fallback-banner">
          <div className="nn-map-fallback-title">Chưa thể hiển thị bản đồ tương tác</div>
          <p className="nn-map-fallback-desc">
            {mapError} Bạn vẫn có thể xem sơ đồ các chặng hoặc mở chỉ đường OpenStreetMap miễn phí.
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
    <div
      className={`nn-pilot-map-container ${className}`.trim()}
      style={style}
      data-testid="pilot-map-container"
      role="region"
      aria-label="Bản đồ ẩm thực Hà Nội"
    >
      {/* Controls Bar */}
      <div className="nn-map-controls-bar" data-testid="map-controls-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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

          {connectorSegments.length > 0 && (
            <span className="nn-map-estimated-label" data-testid="map-estimated-label" title="Đường nối thẳng ước tính giữa các điểm, không phải lộ trình đường sá thực tế">
              Đường nối ước tính
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {outOfBoundsCount > 0 && (
            <span className="nn-map-coverage-warning" data-testid="map-coverage-warning">
              Thông tin: {outOfBoundsCount} điểm ngoài khu vực Hoàn Kiếm (hiển thị trên nền cơ bản)
            </span>
          )}

          {missingCoordsCount > 0 && (
            <span className="nn-map-coverage-warning" data-testid="map-missing-coords-warning">
              Thông tin: {missingCoordsCount} điểm chưa có toạ độ
            </span>
          )}
        </div>
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
          Đang tải bản đồ khu vực…
        </div>
      )}

      {/* Accessible Screen Reader List */}
      <ol className="sr-only" aria-label="Danh sách điểm dừng trên bản đồ">
        {validOrigin && (
          <li>
            Xuất phát: {validOrigin.label}
            {validOrigin.inBounds ? ' (trong khu vực Hoàn Kiếm)' : ' (ngoài khu vực Hoàn Kiếm)'}
          </li>
        )}
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
          (c){' '}
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
