'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { loadGoogleMaps, isAuthFailed } from '../../lib/googleMapsLoader';
import { getVenuesMap } from '../../lib/api';
import { clusterVenues } from '../../lib/clusterer';

export default function MapView({
  origin,
  originLabel,
  stops = [],
  highlightedStopId,
  onSelectStop,
  legSource = 'straight_line_estimate',
  routingProvider = 'estimate',
  routeWarnings = [],
  clientConfig = null
}) {
  const containerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const venueMarkersRef = useRef([]);

  // Map state: 'loading' | 'ready' | 'unavailable' | 'key_rejected' | 'blocked'
  const [mapState, setMapState] = useState('loading');
  const [unavailableReason, setUnavailableReason] = useState(null);

  // Restaurant venues toggle & state
  const [showVenues, setShowVenues] = useState(false);
  const [venues, setVenues] = useState([]);
  const [isVenuesLoading, setIsVenuesLoading] = useState(false);
  const [isVenuesTruncated, setIsVenuesTruncated] = useState(false);
  const [venuesError, setVenuesError] = useState(null);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(15);
  const venueAbortControllerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Determine provider display name
  const providerName = routingProvider === 'google_routes' || routingProvider === 'google'
    ? 'Google Routes'
    : routingProvider === 'ors'
    ? 'openrouteservice'
    : routingProvider === 'osrm'
    ? 'máy chủ OSRM'
    : 'nhà cung cấp định tuyến';

  // Legs detail data
  const legs = useMemo(() => {
    if (!stops || stops.length === 0) return [];
    return stops.map((stop, idx) => {
      const fromName = idx === 0 ? (originLabel || 'Điểm xuất phát (S)') : stops[idx - 1].name;
      const toName = stop.name;
      const leg = stop.leg_from_previous || {};
      const src = leg.source || legSource || 'unknown';
      let srcLabel = 'Chưa rõ';
      let routeDrawn = false;

      if (src === 'provider_route') {
        srcLabel = `Tuyến đi bộ từ ${providerName}`;
        routeDrawn = Array.isArray(leg.geometry) && leg.geometry.length >= 2;
      } else if (src === 'straight_line_estimate') {
        srcLabel = 'Ước tính đường chim bay, không phải tuyến đi (không vẽ trên bản đồ)';
        routeDrawn = false;
      }

      return {
        order: stop.order || idx + 1,
        fromName,
        toName,
        minutes: leg.minutes,
        km: leg.km,
        source: src,
        srcLabel,
        routeDrawn,
        geometry: leg.geometry || null
      };
    });
  }, [stops, legSource, providerName, originLabel]);

  // Check auth failure listener
  useEffect(() => {
    const handleAuthFailure = () => {
      setMapState('key_rejected');
      setUnavailableReason('key_rejected');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('google-maps-auth-failure', handleAuthFailure);
      return () => window.removeEventListener('google-maps-auth-failure', handleAuthFailure);
    }
  }, []);

  // Initialize Google Maps
  useEffect(() => {
    let active = true;

    async function initMap() {
      const isTestFake = typeof window !== 'undefined' && Boolean(window.__TEST_FAKE_GOOGLE_MAPS__);
      const mapsConfig = clientConfig?.maps;
      const isConfigReady = mapsConfig && mapsConfig.status === 'ready' && mapsConfig.js_api_key;

      if (!isConfigReady && !isTestFake) {
        if (!active) return;
        setMapState('unavailable');
        setUnavailableReason(mapsConfig?.reason || 'not_configured');
        return;
      }

      if (isAuthFailed()) {
        if (!active) return;
        setMapState('key_rejected');
        setUnavailableReason('key_rejected');
        return;
      }

      try {
        const { maps } = await loadGoogleMaps({
          apiKey: mapsConfig?.js_api_key || 'TEST_KEY',
          language: mapsConfig?.language || 'vi',
          region: mapsConfig?.region || 'VN'
        });
        const { Map } = maps || {};
        if (!Map) {
          throw new Error('Google Maps Map constructor not found in loaded maps library');
        }

        if (!active) return;

        if (containerRef.current && !mapInstanceRef.current) {
          const defaultCenter = mapsConfig?.default_center || { lat: 21.0285, lon: 105.8522 };
          const map = new Map(containerRef.current, {
            center: { lat: defaultCenter.lat, lng: defaultCenter.lon },
            zoom: mapsConfig?.default_zoom || 15,
            mapId: mapsConfig?.map_id || 'DEMO_MAP_ID',
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true
          });
          mapInstanceRef.current = map;

          if (map.addListener) {
            map.addListener('zoom_changed', () => {
              if (active && mapInstanceRef.current) {
                const z = typeof mapInstanceRef.current.getZoom === 'function' ? mapInstanceRef.current.getZoom() : 15;
                setCurrentZoom(z);
              }
            });
          }
        }

        setMapState('ready');
      } catch (err) {
        if (!active) return;
        console.warn('[MapView] initMap failed');
        if (err.code === 'KEY_REJECTED' || isAuthFailed()) {
          setMapState('key_rejected');
          setUnavailableReason('key_rejected');
        } else if (err.code === 'SCRIPT_BLOCKED') {
          setMapState('blocked');
          setUnavailableReason('blocked');
        } else {
          setMapState('unavailable');
          setUnavailableReason(err.code || 'error');
        }
      }
    }

    initMap();

    const handleTestInit = () => initMap();
    if (typeof window !== 'undefined') {
      window.addEventListener('__TEST_INIT_FAKE_MAPS__', handleTestInit);
    }

    return () => {
      active = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('__TEST_INIT_FAKE_MAPS__', handleTestInit);
      }
    };
  }, [clientConfig]);

  // Update Tour Markers & Route Polylines
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (mapState !== 'ready' || !map || typeof window === 'undefined') return;

    let isSubscribed = true;

    async function renderTourObjects() {
      try {
        const { AdvancedMarkerElement } = await window.google.maps.importLibrary('marker');
        const { LatLngBounds, Polyline } = await window.google.maps.importLibrary('maps');

        if (!isSubscribed) return;

        // Clean previous tour markers
        markersRef.current.forEach((m) => {
          if (m && typeof m.setMap === 'function') m.setMap(null);
          else if (m) m.map = null;
        });
        markersRef.current = [];

        // Clean previous route polylines
        polylinesRef.current.forEach((p) => {
          if (p && typeof p.setMap === 'function') p.setMap(null);
          else if (p) p.map = null;
        });
        polylinesRef.current = [];

        const bounds = new LatLngBounds();
        let hasBounds = false;

        // 1. Origin Marker
        if (origin && typeof origin.lat === 'number' && typeof origin.lon === 'number') {
          const originPin = document.createElement('div');
          originPin.className = 'gmp-origin-marker';
          originPin.setAttribute('role', 'button');
          originPin.setAttribute('tabindex', '0');
          originPin.setAttribute('aria-label', `Điểm xuất phát: ${originLabel || 'Vị trí bắt đầu'}`);
          originPin.innerHTML = `
            <div style="background:#10b981;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid #fff;">
              S
            </div>
          `;

          const originMarker = new AdvancedMarkerElement({
            map,
            position: { lat: origin.lat, lng: origin.lon },
            title: `Điểm xuất phát: ${originLabel || 'Vị trí bắt đầu'}`,
            content: originPin
          });
          markersRef.current.push(originMarker);
          bounds.extend({ lat: origin.lat, lng: origin.lon });
          hasBounds = true;
        }

        // 2. Tour Stop Markers
        stops.forEach((stop, idx) => {
          if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') return;
          const isHighlighted = highlightedStopId === stop.venue_id;

          const stopPin = document.createElement('div');
          stopPin.className = 'gmp-stop-marker';
          stopPin.setAttribute('role', 'button');
          stopPin.setAttribute('tabindex', '0');
          stopPin.setAttribute('aria-label', `Điểm dừng ${stop.order || idx + 1}: ${stop.name}`);
          const bg = isHighlighted ? '#c2410c' : '#e05315';
          const scale = isHighlighted ? 'scale(1.15)' : 'scale(1)';
          stopPin.innerHTML = `
            <div style="background:${bg};transform:${scale};transition:transform 0.15s ease;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid #fff;">
              ${stop.order || idx + 1}
            </div>
          `;

          const stopMarker = new AdvancedMarkerElement({
            map,
            position: { lat: stop.lat, lng: stop.lon },
            title: `${stop.order || idx + 1}. ${stop.name}`,
            content: stopPin
          });

          const onSelect = () => onSelectStop && onSelectStop(stop.venue_id);
          stopPin.addEventListener('click', onSelect);
          stopPin.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect();
            }
          });

          markersRef.current.push(stopMarker);
          bounds.extend({ lat: stop.lat, lng: stop.lon });
          hasBounds = true;
        });

        // 3. Draw Route Polylines: ONLY for provider_route legs with geometry
        // Estimated legs are NEVER drawn as routes.
        stops.forEach((stop) => {
          const leg = stop.leg_from_previous;
          if (leg && leg.source === 'provider_route' && Array.isArray(leg.geometry) && leg.geometry.length >= 2) {
            const path = leg.geometry.map(([lat, lon]) => ({ lat, lng: lon }));
            const polyline = new Polyline({
              path,
              geodesic: true,
              strokeColor: '#e05315',
              strokeOpacity: 0.85,
              strokeWeight: 5,
              map
            });
            polylinesRef.current.push(polyline);
            path.forEach((pt) => bounds.extend(pt));
            hasBounds = true;
          }
        });

        // Fit map bounds to encompass origin, stops and route geometry
        if (hasBounds && !bounds.isEmpty()) {
          map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
        }
      } catch (err) {
        console.warn('[MapView] tour objects rendering error');
      }
    }

    renderTourObjects();

    return () => {
      isSubscribed = false;
    };
  }, [mapState, origin, originLabel, stops, highlightedStopId, onSelectStop]);

  // Load restaurant venues for viewport when toggle is ON
  useEffect(() => {
    const map = mapInstanceRef.current;

    const cancelInFlight = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (venueAbortControllerRef.current) {
        venueAbortControllerRef.current.abort();
        venueAbortControllerRef.current = null;
      }
    };

    if (!showVenues) {
      cancelInFlight();
      setVenues([]);
      setIsVenuesTruncated(false);
      setVenuesError(null);
      setIsVenuesLoading(false);
      return;
    }

    if (mapState !== 'ready' || !map) {
      return;
    }

    async function fetchVenuesForBounds() {
      if (!map) return;
      let min_lat, min_lon, max_lat, max_lon;

      const bounds = typeof map.getBounds === 'function' ? map.getBounds() : null;
      if (bounds && typeof bounds.getSouthWest === 'function' && typeof bounds.getNorthEast === 'function') {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        min_lat = typeof sw.lat === 'function' ? sw.lat() : sw.lat;
        min_lon = typeof sw.lng === 'function' ? sw.lng() : (sw.lon || sw.lng);
        max_lat = typeof ne.lat === 'function' ? ne.lat() : ne.lat;
        max_lon = typeof ne.lng === 'function' ? ne.lng() : (ne.lon || ne.lng);
      } else {
        const center = typeof map.getCenter === 'function' ? map.getCenter() : null;
        const cLat = center ? (typeof center.lat === 'function' ? center.lat() : center.lat) : 21.0285;
        const cLon = center ? (typeof center.lng === 'function' ? center.lng() : (center.lon || center.lng)) : 105.8522;
        min_lat = cLat - 0.03;
        max_lat = cLat + 0.03;
        min_lon = cLon - 0.03;
        max_lon = cLon + 0.03;
      }

      if (!Number.isFinite(min_lat) || !Number.isFinite(min_lon) || !Number.isFinite(max_lat) || !Number.isFinite(max_lon)) {
        return;
      }

      // Abort previous in-flight request when viewport changes
      if (venueAbortControllerRef.current) {
        venueAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      venueAbortControllerRef.current = controller;

      setIsVenuesLoading(true);
      setVenuesError(null);

      try {
        const res = await getVenuesMap({
          min_lat: Math.round(min_lat * 1e6) / 1e6,
          min_lon: Math.round(min_lon * 1e6) / 1e6,
          max_lat: Math.round(max_lat * 1e6) / 1e6,
          max_lon: Math.round(max_lon * 1e6) / 1e6,
          limit: 500
        }, { signal: controller.signal });

        if (!controller.signal.aborted) {
          const items = Array.isArray(res?.items) ? res.items.filter((v) => !v.online_only) : [];
          setVenues(items);
          setIsVenuesTruncated(Boolean(res?.truncated));
          setVenuesError(null);
        }
      } catch (err) {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          return;
        }
        console.warn('[VenuesMap] fetch failed');
        setVenues([]);
        setIsVenuesTruncated(false);
        setVenuesError(err.message || 'Không thể tải danh sách quán ăn trong vùng nhìn hiện tại.');
      } finally {
        if (!controller.signal.aborted) {
          setIsVenuesLoading(false);
        }
      }
    }

    const scheduleFetch = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        fetchVenuesForBounds();
      }, 400);
    };

    // Initial fetch on toggle ON
    fetchVenuesForBounds();

    // Listen to map 'idle' event for viewport changes while toggle is ON
    let idleListener = null;
    if (typeof map.addListener === 'function') {
      idleListener = map.addListener('idle', () => {
        scheduleFetch();
      });
    }

    return () => {
      cancelInFlight();
      if (idleListener) {
        if (typeof idleListener.remove === 'function') idleListener.remove();
        else if (typeof window !== 'undefined' && window.google?.maps?.event?.removeListener) {
          window.google.maps.event.removeListener(idleListener);
        }
      }
    };
  }, [showVenues, mapState]);

  // Render Clustered Restaurant Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (mapState !== 'ready' || !map || typeof window === 'undefined') return;

    // Remove existing venue markers
    venueMarkersRef.current.forEach((m) => {
      if (m && typeof m.setMap === 'function') m.setMap(null);
      else if (m) m.map = null;
    });
    venueMarkersRef.current = [];

    if (!showVenues || venues.length === 0) return;

    let active = true;

    async function renderClusteredVenues() {
      try {
        const { AdvancedMarkerElement } = await window.google.maps.importLibrary('marker');
        const { LatLngBounds } = await window.google.maps.importLibrary('maps');
        if (!active) return;

        // Apply spatial clustering
        const clustered = clusterVenues(venues, currentZoom);

        clustered.forEach((clusterItem) => {
          if (clusterItem.isCluster) {
            // Cluster Marker: circular badge showing count
            const clusterPin = document.createElement('div');
            clusterPin.className = 'gmp-venue-cluster';
            clusterPin.setAttribute('role', 'button');
            clusterPin.setAttribute('tabindex', '0');
            clusterPin.setAttribute('aria-label', `Cụm ${clusterItem.count} quán ăn`);
            clusterPin.innerHTML = `
              <div style="background:#2563eb;color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid #fff;cursor:pointer;">
                ${clusterItem.count}
              </div>
            `;

            const onZoomCluster = () => {
              if (clusterItem.bounds) {
                const b = new LatLngBounds(
                  { lat: clusterItem.bounds.minLat, lng: clusterItem.bounds.minLon },
                  { lat: clusterItem.bounds.maxLat, lng: clusterItem.bounds.maxLon }
                );
                map.fitBounds(b);
              } else {
                const nextZoom = (typeof map.getZoom === 'function' ? map.getZoom() : currentZoom) + 2;
                if (typeof map.setCenter === 'function') map.setCenter({ lat: clusterItem.lat, lng: clusterItem.lon });
                if (typeof map.setZoom === 'function') map.setZoom(nextZoom);
              }
            };

            clusterPin.addEventListener('click', onZoomCluster);
            clusterPin.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onZoomCluster();
              }
            });

            const marker = new AdvancedMarkerElement({
              map,
              position: { lat: clusterItem.lat, lng: clusterItem.lon },
              title: `Cụm ${clusterItem.count} quán ăn`,
              content: clusterPin
            });
            venueMarkersRef.current.push(marker);
          } else {
            // Individual Restaurant Marker: visually distinct from tour stops (blue/teal with food icon)
            const venue = clusterItem.item;
            const venuePin = document.createElement('div');
            venuePin.className = 'gmp-venue-marker';
            venuePin.setAttribute('role', 'button');
            venuePin.setAttribute('tabindex', '0');
            venuePin.setAttribute('aria-label', `Quán ăn: ${venue.name}`);
            venuePin.innerHTML = `
              <div style="background:#0284c7;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,0.3);border:2px solid #fff;cursor:pointer;">
                🍜
              </div>
            `;

            const onSelect = () => {
              setSelectedVenue(venue);
            };

            venuePin.addEventListener('click', onSelect);
            venuePin.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect();
              }
            });

            const marker = new AdvancedMarkerElement({
              map,
              position: { lat: venue.lat, lng: venue.lon },
              title: venue.name,
              content: venuePin
            });
            venueMarkersRef.current.push(marker);
          }
        });
      } catch (err) {
        console.warn('[MapView] venue markers rendering error');
      }
    }

    renderClusteredVenues();

    return () => {
      active = false;
    };
  }, [mapState, showVenues, venues, currentZoom]);

  const handleToggleVenues = () => {
    setShowVenues((prev) => !prev);
  };

  return (
    <div
      role="region"
      aria-label="Bản đồ Google Maps tuyến đường ẩm thực"
      style={{
        background: '#fff',
        borderRadius: 16,
        padding: 16,
        boxShadow: 'var(--shadow-sm)',
        marginBottom: 20
      }}
    >
      {/* Header with Title and Restaurant Toggle */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🗺️</span>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Bản Đồ Tuyến Đường (Google Maps)
          </h3>
        </div>

        {/* Restaurant Markers Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={handleToggleVenues}
            aria-pressed={showVenues ? 'true' : 'false'}
            data-testid="venue-toggle"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: showVenues ? '1px solid #0284c7' : '1px solid var(--border-color)',
              background: showVenues ? '#e0f2fe' : '#fff',
              color: showVenues ? '#0369a1' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <span>🍜</span>
            <span>{showVenues ? 'Đang hiện quán ăn' : 'Hiện quán ăn trên bản đồ'}</span>
          </button>
        </div>
      </div>

      {/* Labelled Error Notice when map venues fetch fails */}
      {showVenues && venuesError && (
        <div
          role="alert"
          data-testid="venues-error-banner"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: '#991b1b',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span>⚠️</span>
          <span>{venuesError}</span>
        </div>
      )}

      {/* Truncated Venues Notice */}
      {showVenues && isVenuesTruncated && (
        <div
          role="status"
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: '#92400e',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span>🔍</span>
          <span>Khu vực có quá nhiều quán ăn (đã đạt giới hạn 500 quán); hãy phóng to bản đồ để xem chi tiết hơn.</span>
        </div>
      )}

      {/* Map Viewport or Unavailable View */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: 380,
          background: '#f1f5f9',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--border-color)'
        }}
      >
        {/* Real Google Map container element */}
        <div
          ref={containerRef}
          data-testid="google-map-container"
          style={{
            width: '100%',
            height: 380,
            display: mapState === 'ready' ? 'block' : 'none'
          }}
        />

        {/* Unavailable state view (Labelled Vietnamese, no fake map, no OSM tiles) */}
        {mapState !== 'ready' && (
          <div
            data-testid="map-unavailable-banner"
            role="alert"
            style={{
              padding: 24,
              minHeight: 380,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              background: '#f8fafc',
              color: 'var(--text-primary)'
            }}
          >
            <span style={{ fontSize: 40, marginBottom: 12 }}>📍</span>
            <h4 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
              Bản đồ Google Maps chưa khả dụng
            </h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460, margin: '0 0 16px 0', lineHeight: 1.5 }}>
              {unavailableReason === 'key_rejected'
                ? 'Khoá Google Maps bị từ chối hoặc hết hạn. Vui lòng kiểm tra lại cấu hình khoá API.'
                : unavailableReason === 'blocked'
                ? 'Không thể tải Google Maps (kết nối mạng bị chặn hoặc tiện ích mở rộng trình duyệt đang chặn script).'
                : 'Google Maps chưa được cấu hình trên hệ thống. Tuyến đường và các điểm dừng vẫn được liệt kê chi tiết bên dưới. Bạn có thể tự nhập toạ độ hoặc địa chỉ để tiếp tục lập lịch trình.'}
            </p>
            <div
              style={{
                fontSize: 12,
                background: '#e2e8f0',
                color: '#475569',
                padding: '6px 12px',
                borderRadius: 6,
                fontWeight: 600
              }}
            >
              Chế độ toạ độ thủ công vẫn hoạt động bình thường
            </div>
          </div>
        )}
      </div>

      {/* Selected Restaurant Detail Card */}
      {selectedVenue && (
        <div
          role="dialog"
          aria-label={`Thông tin quán ăn ${selectedVenue.name}`}
          style={{
            marginTop: 14,
            padding: 14,
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            position: 'relative'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h4 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                🍜 {selectedVenue.name}
              </h4>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Khu vực: {selectedVenue.district || 'Hà Nội'}
              </div>
              {selectedVenue.dish_tags && selectedVenue.dish_tags.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--accent-primary)', marginBottom: 6, fontWeight: 600 }}>
                  Món ăn: {selectedVenue.dish_tags.join(', ')}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedVenue(null)}
              aria-label="Đóng thông tin quán ăn"
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 16,
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: 4
              }}
            >
              ✕
            </button>
          </div>

          {/* Evidence Caveat (strictly required: no opening claims, no per-person claims) */}
          <div
            role="note"
            style={{
              background: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 11,
              color: '#92400e',
              lineHeight: 1.4
            }}
          >
            ⚠️ Lưu ý bằng chứng: Giờ mở cửa theo ngày chưa được xác minh (không khẳng định quán đang mở cửa).
            Khoảng giá quán (nếu có) là khoảng giá tham khảo, không bảo đảm chi phí cho mỗi người.
          </div>
        </div>
      )}

      {/* Mandatory Google Walking Route Warnings (Google Routes Platform Requirement) */}
      {routeWarnings && routeWarnings.length > 0 && (
        <div
          data-testid="route-warnings"
          role="alert"
          style={{
            marginTop: 14,
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 12,
            color: '#9a3412',
            lineHeight: 1.5
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚠️</span>
            <span>Cảnh báo tuyến đi bộ (Google Routes):</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {routeWarnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Legs Detail Listing */}
      {legs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Chi tiết các chặng di chuyển ({legs.length} chặng)
          </h4>
          <div style={{ display: 'grid', gap: 8 }}>
            {legs.map((leg) => (
              <div
                key={leg.order}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc',
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  border: '1px solid var(--border-color)'
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    Chặng {leg.order}:
                  </span>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {leg.fromName} → {leg.toName}
                  </span>
                  <div style={{ fontSize: 11, color: leg.routeDrawn ? '#0369a1' : 'var(--text-muted)', marginTop: 2 }}>
                    Nguồn: {leg.srcLabel}
                  </div>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    {leg.minutes != null ? `${leg.minutes} phút` : 'Chưa rõ tg'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {leg.km != null ? `${leg.km} km` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
