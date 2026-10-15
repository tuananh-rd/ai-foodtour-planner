'use client';

import { useState, useMemo, useRef, useEffect } from 'react';

// Web Mercator projection formulas
function project(lat, lon, zoom) {
  const siny = Math.sin((lat * Math.PI) / 180);
  const clampedSiny = Math.min(Math.max(siny, -0.9999), 0.9999);
  const scale = 256 * Math.pow(2, zoom);
  const x = scale * (0.5 + lon / 360);
  const y = scale * (0.5 - Math.log((1 + clampedSiny) / (1 - clampedSiny)) / (4 * Math.PI));
  return { x, y };
}

export default function MapView({
  origin,
  stops = [],
  highlightedStopId,
  onSelectStop,
  legSource = 'straight_line_estimate'
}) {
  const [zoomOffset, setZoomOffset] = useState(0);
  const containerRef = useRef(null);
  const [viewportDims, setViewportDims] = useState({ width: 600, height: 380 });

  // Responsive container width measurement to guarantee 1:1 tile & SVG marker alignment
  useEffect(() => {
    if (!containerRef.current) return;
    const updateDims = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        if (w > 0) {
          setViewportDims({ width: w, height: 380 });
        }
      }
    };
    updateDims();
    window.addEventListener('resize', updateDims);
    return () => window.removeEventListener('resize', updateDims);
  }, []);

  const viewWidth = viewportDims.width;
  const viewHeight = viewportDims.height;

  // Compute map center and default zoom based on all points
  const points = useMemo(() => {
    const pts = [];
    if (origin && typeof origin.lat === 'number' && typeof origin.lon === 'number') {
      pts.push({ id: 'origin', lat: origin.lat, lon: origin.lon, isOrigin: true });
    }
    stops.forEach((s) => {
      if (typeof s.lat === 'number' && typeof s.lon === 'number') {
        pts.push({ id: s.venue_id, lat: s.lat, lon: s.lon, order: s.order, name: s.name });
      }
    });
    return pts;
  }, [origin, stops]);

  const { centerLat, centerLon, baseZoom } = useMemo(() => {
    if (points.length === 0) {
      return { centerLat: 21.033, centerLon: 105.850, baseZoom: 15 };
    }
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const cLat = (minLat + maxLat) / 2;
    const cLon = (minLon + maxLon) / 2;
    const latSpan = maxLat - minLat;
    const lonSpan = maxLon - minLon;
    const maxSpan = Math.max(latSpan, lonSpan);

    let z = 15;
    if (maxSpan > 0.1) z = 12;
    else if (maxSpan > 0.05) z = 13;
    else if (maxSpan > 0.02) z = 14;
    else if (maxSpan > 0.01) z = 15;
    else z = 16;

    return { centerLat: cLat, centerLon: cLon, baseZoom: z };
  }, [points]);

  const currentZoom = Math.min(18, Math.max(11, baseZoom + zoomOffset));

  // Center point in world pixels
  const centerWorld = project(centerLat, centerLon, currentZoom);

  // Project any point to container coordinates
  const toLocalPx = (lat, lon) => {
    const wp = project(lat, lon, currentZoom);
    return {
      x: wp.x - centerWorld.x + viewWidth / 2,
      y: wp.y - centerWorld.y + viewHeight / 2
    };
  };

  // Determine tiles to render
  const tiles = useMemo(() => {
    const leftWorld = centerWorld.x - viewWidth / 2;
    const rightWorld = centerWorld.x + viewWidth / 2;
    const topWorld = centerWorld.y - viewHeight / 2;
    const bottomWorld = centerWorld.y + viewHeight / 2;

    const minTileX = Math.floor(leftWorld / 256);
    const maxTileX = Math.floor(rightWorld / 256);
    const minTileY = Math.floor(topWorld / 256);
    const maxTileY = Math.floor(bottomWorld / 256);

    const tileList = [];
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        const left = tx * 256 - centerWorld.x + viewWidth / 2;
        const top = ty * 256 - centerWorld.y + viewHeight / 2;
        tileList.push({
          key: `${currentZoom}-${tx}-${ty}`,
          url: `https://tile.openstreetmap.org/${currentZoom}/${tx}/${ty}.png`,
          left,
          top
        });
      }
    }
    return tileList;
  }, [centerWorld, currentZoom, viewWidth, viewHeight]);

  // Projected points
  const projectedPoints = points.map((p) => ({
    ...p,
    ...toLocalPx(p.lat, p.lon)
  }));

  const osmUrl = `https://www.openstreetmap.org/?mlat=${centerLat}&mlon=${centerLon}#map=${currentZoom}/${centerLat.toFixed(4)}/${centerLon.toFixed(4)}`;

  // Contract v1 has NO route geometry. Never draw a polyline for provider_route!
  // Only for straight_line_estimate, a dashed visual hint with strict caption is permitted.
  const isStraightLine = legSource === 'straight_line_estimate';
  const polylinePoints = projectedPoints.map((p) => `${p.x},${p.y}`).join(' ');

  // List each leg with minutes, km and its source label
  const legs = useMemo(() => {
    if (!stops || stops.length === 0) return [];
    return stops.map((stop, idx) => {
      const fromName = idx === 0 ? 'Điểm xuất phát (S)' : stops[idx - 1].name;
      const toName = stop.name;
      const leg = stop.leg_from_previous || {};
      const src = leg.source || legSource || 'unknown';
      let srcLabel = 'Chưa rõ';
      if (src === 'provider_route') {
        srcLabel = 'Xác minh từ nhà cung cấp';
      } else if (src === 'straight_line_estimate') {
        srcLabel = 'Ước tính đường chim bay';
      }
      return {
        fromName,
        toName,
        order: stop.order,
        minutes: leg.minutes,
        km: leg.km,
        source: src,
        srcLabel
      };
    });
  }, [stops, legSource]);

  return (
    <div
      role="region"
      aria-label="Bản đồ tuyến đường OpenStreetMap"
      style={{
        background: '#fff',
        borderRadius: 16,
        padding: 16,
        boxShadow: 'var(--shadow-sm)',
        marginBottom: 20
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🗺️</span>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Bản Đồ Điểm Dừng (Hà Nội)
          </h3>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a
            href={osmUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 12,
              color: 'var(--accent-primary)',
              textDecoration: 'none',
              fontWeight: 600
            }}
          >
            Mở trên OpenStreetMap ↗
          </a>
        </div>
      </div>

      {/* Map Viewport */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: 380,
          background: '#e5e3df',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--border-color)'
        }}
      >
        {/* OpenStreetMap Tile Images */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {tiles.map((t) => (
            <img
              key={t.key}
              src={t.url}
              alt=""
              loading="lazy"
              style={{
                position: 'absolute',
                left: t.left,
                top: t.top,
                width: 256,
                height: 256,
                userSelect: 'none',
                opacity: 0.95
              }}
            />
          ))}
        </div>

        {/* SVG Overlay for markers and dashed straight-line hint */}
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%'
          }}
        >
          {/* Visual Hint: ONLY dashed line for straight_line_estimate legs. NEVER for provider_route! */}
          {isStraightLine && projectedPoints.length > 1 && (
            <polyline
              points={polylinePoints}
              fill="none"
              stroke="#888"
              strokeWidth={2}
              strokeDasharray="5,5"
              strokeOpacity={0.75}
            />
          )}

          {/* Markers */}
          {projectedPoints.map((p) => {
            const isHighlight = highlightedStopId === p.id;
            return (
              <g
                key={p.id}
                transform={`translate(${p.x},${p.y})`}
                onClick={() => onSelectStop && onSelectStop(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectStop && onSelectStop(p.id);
                  }
                }}
                tabIndex={0}
                style={{ cursor: 'pointer', outline: 'none' }}
                role="button"
                aria-label={p.isOrigin ? 'Điểm xuất phát' : `Điểm dừng ${p.order}: ${p.name}`}
              >
                {p.isOrigin ? (
                  <>
                    <circle r="12" fill="#1565c0" stroke="#fff" strokeWidth="2.5" />
                    <text y="4" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">
                      S
                    </text>
                  </>
                ) : (
                  <>
                    <circle
                      r={isHighlight ? 15 : 12}
                      fill={isHighlight ? '#b84020' : 'var(--accent-primary)'}
                      stroke="#fff"
                      strokeWidth={isHighlight ? 3 : 2}
                    />
                    <text y="4" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">
                      {p.order}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* Dashed line caption banner overlay on map for straight-line hint */}
        {isStraightLine && projectedPoints.length > 1 && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              background: 'rgba(255, 255, 255, 0.92)',
              border: '1px solid #d9d9d9',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              color: '#555',
              fontWeight: 600,
              zIndex: 10,
              pointerEvents: 'none'
            }}
          >
            - - - khoảng cách đường chim bay, không phải tuyến đi
          </div>
        )}

        {/* Zoom Controls */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            zIndex: 10
          }}
        >
          <button
            type="button"
            onClick={() => setZoomOffset((prev) => Math.min(prev + 1, 3))}
            aria-label="Phóng to bản đồ"
            style={{
              width: 36,
              height: 36,
              background: '#fff',
              border: '1px solid #ccc',
              borderRadius: 6,
              fontSize: 18,
              fontWeight: 700,
              boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoomOffset((prev) => Math.max(prev - 1, -3))}
            aria-label="Thu nhỏ bản đồ"
            style={{
              width: 36,
              height: 36,
              background: '#fff',
              border: '1px solid #ccc',
              borderRadius: 6,
              fontSize: 18,
              fontWeight: 700,
              boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            −
          </button>
        </div>

        {/* Attribution Notice */}
        <div
          style={{
            position: 'absolute',
            bottom: 4,
            right: 6,
            background: 'rgba(255, 255, 255, 0.85)',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            color: '#333',
            zIndex: 10
          }}
        >
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: '#0078A8', textDecoration: 'none' }}>OpenStreetMap contributors</a>
        </div>
      </div>

      {/* Geometry disclaimer */}
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
        {legSource === 'provider_route' ? (
          <span style={{ color: '#2e7d32', fontWeight: 600 }}>
            ✓ Nhà cung cấp định tuyến (provider_route) cung cấp thời gian và cự ly đi bộ. Bản đồ hiển thị các điểm dừng được đánh số; Contract v1 chưa hỗ trợ chuỗi tọa độ chi tiết từng tuyến đường phố.
          </span>
        ) : (
          <span style={{ color: '#e65100', fontWeight: 600 }}>
            * Chưa có dữ liệu định tuyến thực tế (đang dùng cự ly đường chim bay ước tính). Đường nét đứt trên bản đồ chỉ thể hiện khoảng cách đường chim bay, không phải tuyến đi.
          </span>
        )}
      </div>

      {/* Leg listing with minutes, km and source label */}
      {legs.length > 0 && (
        <div style={{ marginTop: 14, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
            🚶 Chi tiết các chặng di chuyển ({legs.length} chặng):
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {legs.map((leg, idx) => (
              <div
                key={idx}
                style={{
                  background: '#fafafa',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 6
                }}
              >
                <div>
                  <strong>Chặng {idx + 1}:</strong> {leg.fromName} ➔ {leg.toName}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#555' }}>
                  <span>{leg.minutes != null ? `${leg.minutes} phút` : 'Chưa rõ'}</span>
                  <span>·</span>
                  <span>{leg.km != null ? `${leg.km} km` : 'Chưa rõ'}</span>
                  <span>·</span>
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: leg.source === 'provider_route' ? '#e8f5e9' : '#fff3e0',
                      color: leg.source === 'provider_route' ? '#2e7d32' : '#e65100'
                    }}
                  >
                    {leg.source}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
