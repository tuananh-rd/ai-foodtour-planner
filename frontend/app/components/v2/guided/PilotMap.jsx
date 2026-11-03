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
 * Interactive map using standard online OpenStreetMap raster tiles and MapLibre GL.
 * 
 * Invariants & review gates:
 * - Displays explicitly selected origin with human-readable label and distinct marker
 * - Supports explicit map-click and draft draggable origin pin with Use Location callback
 * - Missing coordinates are NEVER placed at 0,0 and NEVER coerced from null/empty/bool
 * - Dashed connectors represent straight-line estimates only (no road route or live ETA claims)
 * - Missing coordinates break adjacency: connectors NEVER bridge or skip over missing stops
 * - Complete map and marker destruction on error, replace, and unmount
 * - Native <button> markers with keyboard activation (Enter/Space) and safe popup focus management
 * - Stable testids: pilot-map-canvas, pilot-markers-toggle, pilot-origin-marker, pilot-map-fallback, pilot-draft-origin-marker, map-use-draft-location
 * - Standard online OSM raster tiles (https://tile.openstreetmap.org/{z}/{x}/{y}.png)
 * - Configurable via process.env.NEXT_PUBLIC_OSM_TILE_URL
 * - Visible OpenStreetMap attribution with copyright link
 * - Normal browser cache and referer; zero unauthorized prefetching
 * - Discloses street/road detail across Hanoi without restrictive viewport clipping
 * - Zero emoji in UI strings
 */
export default function PilotMap({
  stops = [],
  origin = null,
  originLabel = '',
  onFallbackToSchematic,
  onSelectMapOrigin,
  className = '',
  style = {}
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const maplibreglRef = useRef(null);
  const markersRef = useRef([]);
  const draftMarkerRef = useRef(null);
  const markerGenRef = useRef(0);
  const mapLoadedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [markersVisible, setMarkersVisible] = useState(true);
  const [draftOrigin, setDraftOrigin] = useState(null);

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

  // Clear draft origin pin when a new validOrigin is committed
  useEffect(() => {
    if (validOrigin) {
      setDraftOrigin(null);
    }
  }, [validOrigin?.lat, validOrigin?.lon]);

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

    if (draftMarkerRef.current) {
      try { draftMarkerRef.current.remove(); } catch (_) {}
      draftMarkerRef.current = null;
    }

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
      originBtn.className = 'nn-map-marker nn-map-origin-marker';
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

  // Update draft origin draggable marker
  const onSelectMapOriginRef = useRef(onSelectMapOrigin);
  onSelectMapOriginRef.current = onSelectMapOrigin;

  useEffect(() => {
    const map = mapInstanceRef.current;
    const maplibregl = maplibreglRef.current;
    if (!map || !maplibregl) return;

    if (draftMarkerRef.current) {
      try { draftMarkerRef.current.remove(); } catch (_) {}
      draftMarkerRef.current = null;
    }

    if (!draftOrigin || draftOrigin.lat === null || draftOrigin.lon === null) {
      return;
    }

    const draftEl = document.createElement('div');
    draftEl.className = 'nn-map-draft-origin-marker';
    draftEl.setAttribute('data-testid', 'pilot-draft-origin-marker');
    draftEl.setAttribute('title', 'Kéo để chỉnh vị trí hoặc nhấn Sử dụng vị trí này');

    const draftInner = document.createElement('span');
    draftInner.className = 'nn-map-draft-origin-inner';
    draftInner.textContent = 'G';
    draftEl.appendChild(draftInner);

    const popupContent = document.createElement('div');
    popupContent.className = 'nn-map-popup-card';
    popupContent.setAttribute('tabindex', '-1');

    const titleEl = document.createElement('div');
    titleEl.className = 'nn-map-popup-title';
    titleEl.textContent = 'Vị trí đã chọn trên bản đồ';
    popupContent.appendChild(titleEl);

    const addrEl = document.createElement('div');
    addrEl.className = 'nn-map-popup-addr';
    addrEl.textContent = `Chờ xác nhận (tọa độ xấp xỉ: ${draftOrigin.lat.toFixed(5)}, ${draftOrigin.lon.toFixed(5)})`;
    popupContent.appendChild(addrEl);

    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    useBtn.className = 'nn-map-use-location-btn';
    useBtn.setAttribute('data-testid', 'map-use-draft-location');
    useBtn.textContent = 'Sử dụng vị trí này';
    useBtn.onclick = () => {
      if (typeof onSelectMapOriginRef.current === 'function') {
        onSelectMapOriginRef.current({ lat: draftOrigin.lat, lon: draftOrigin.lon });
      }
    };
    popupContent.appendChild(useBtn);

    const popup = new maplibregl.Popup({ offset: 15, closeButton: true }).setDOMContent(popupContent);

    const draftMarker = new maplibregl.Marker({
      element: draftEl,
      draggable: true
    })
      .setLngLat([draftOrigin.lon, draftOrigin.lat])
      .setPopup(popup)
      .addTo(map);

    draftMarker.on('dragend', () => {
      const lngLat = draftMarker.getLngLat();
      setDraftOrigin({
        lat: Number(lngLat.lat.toFixed(6)),
        lon: Number(lngLat.lng.toFixed(6))
      });
    });

    draftMarkerRef.current = draftMarker;

    return () => {
      if (draftMarkerRef.current) {
        try { draftMarkerRef.current.remove(); } catch (_) {}
        draftMarkerRef.current = null;
      }
    };
  }, [draftOrigin]);

  // Fit bounds to all valid points (origin + tour stops + draftOrigin), not clipped to pilot bounds
  const fitMapToBounds = useCallback((map, maplibregl, stopsToFit, originToFit, draftToFit) => {
    if (!map || !maplibregl) return;
    const points = [];
    if (originToFit && originToFit.lat !== null && originToFit.lon !== null) {
      points.push([originToFit.lon, originToFit.lat]);
    } else if (draftToFit && draftToFit.lat !== null && draftToFit.lon !== null) {
      points.push([draftToFit.lon, draftToFit.lat]);
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
        const maplibreglModule = await import('maplibre-gl');
        if (isCancelled) return;

        const maplibregl = maplibreglModule.default || maplibreglModule;

        // Configure MapLibre web worker safely
        if (typeof window !== 'undefined' && !window._maplibreWorkerConfigured) {
          try {
            const bundlerUrl = new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString();
            maplibregl.setWorkerUrl(bundlerUrl || `${window.location.origin}/maps/maplibre-gl-worker-6.15.0.mjs`);
          } catch (_) {
            maplibregl.setWorkerUrl(`${window.location.origin}/maps/maplibre-gl-worker-6.15.0.mjs`);
          }
          window._maplibreWorkerConfigured = true;
        }

        const osmTileUrl = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_OSM_TILE_URL)
          || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

        // Online OpenStreetMap raster style with route connectors
        const osmRasterStyle = {
          version: 8,
          sources: {
            'osm-raster': {
              type: 'raster',
              tiles: [osmTileUrl],
              tileSize: 256,
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
              maxzoom: 19
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
              id: 'osm-raster-layer',
              type: 'raster',
              source: 'osm-raster',
              minzoom: 0,
              maxzoom: 19
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

        const initialCenter = (originRef.current && originRef.current.lat !== null)
          ? [originRef.current.lon, originRef.current.lat]
          : DEFAULT_CENTER;

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: osmRasterStyle,
          center: initialCenter,
          zoom: DEFAULT_ZOOM,
          minZoom: 6,
          maxZoom: 19,
          cooperativeGestures: true,
          attributionControl: false,
          prefetchZoomDelta: 0,
          cancelPendingTileRequestsWhileZooming: true,
          refreshExpiredTiles: false
        });

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        // Handle map click to place draft draggable origin pin
        map.on('click', (e) => {
          if (e.originalEvent?.defaultPrevented) return;
          const { lng, lat } = e.lngLat;
          if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            setDraftOrigin({
              lat: Number(lat.toFixed(6)),
              lon: Number(lng.toFixed(6))
            });
          }
        });

        mapInstanceRef.current = map;
        maplibreglRef.current = maplibregl;

        // Render initial markers synchronously
        renderMarkersSync(map, maplibregl, stopsRef.current, originRef.current, markersVisibleRef.current);

        map.on('error', () => {
          if (!isCancelled) {
            clearTimeout(timeoutId);
            // Non-fatal tile network errors do not tear down the whole map canvas unless critical
            if (!mapLoadedRef.current) {
              cleanupMap();
              setMapError('Lỗi kết nối bản đồ OpenStreetMap.');
              setLoading(false);
            }
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
            fitMapToBounds(map, maplibregl, stopsRef.current, originRef.current, draftOrigin);
          }
        });
      } catch (err) {
        if (!isCancelled) {
          clearTimeout(timeoutId);
          cleanupMap();
          setMapError('Lỗi khởi tạo bản đồ OpenStreetMap hoặc WebGL không khả dụng.');
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
              Khu vực: {outOfBoundsCount} điểm ngoài quận Hoàn Kiếm (đầy đủ bản đồ đường phố)
            </span>
          )}

          {missingCoordsCount > 0 && (
            <span className="nn-map-coverage-warning" data-testid="map-missing-coords-warning">
              Thông tin: {missingCoordsCount} điểm chưa có toạ độ
            </span>
          )}
        </div>
      </div>

      {/* Floating Draft Origin Bar */}
      {draftOrigin && (
        <div className="nn-map-draft-bar" data-testid="map-draft-bar">
          <span className="nn-map-draft-text">
            Vị trí đã chọn trên bản đồ (chờ xác nhận: {draftOrigin.lat.toFixed(4)}, {draftOrigin.lon.toFixed(4)})
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="nn-map-use-location-btn"
              data-testid="map-use-draft-bar-btn"
              onClick={() => {
                if (typeof onSelectMapOrigin === 'function') {
                  onSelectMapOrigin({ lat: draftOrigin.lat, lon: draftOrigin.lon });
                }
              }}
            >
              Sử dụng vị trí này
            </button>
            <button
              type="button"
              className="nn-map-cancel-draft-btn"
              data-testid="map-clear-draft-btn"
              onClick={() => setDraftOrigin(null)}
            >
              Hủy
            </button>
          </div>
        </div>
      )}

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
          Đang tải bản đồ OpenStreetMap khu vực…
        </div>
      )}

      {/* Accessible Screen Reader List */}
      <ol className="sr-only" aria-label="Danh sách điểm dừng trên bản đồ">
        {validOrigin && (
          <li>
            Xuất phát: {validOrigin.label}
          </li>
        )}
        {validStops.map((stop) => (
          <li key={stop.id}>
            {stop.index}. {stop.name} - {stop.address || stop.district || 'Hà Nội'}
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
          contributors
        </span>
        <span>Bản đồ trực tuyến OpenStreetMap</span>
      </div>
    </div>
  );
}
