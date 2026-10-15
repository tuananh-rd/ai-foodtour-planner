'use client';

import { useState, useMemo } from 'react';

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

  // Dimensions of map viewport
  const viewWidth = 600;
  const viewHeight = 400;

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

  const isProviderRoute = legSource === 'provider_route';
  const polylinePoints = projectedPoints.map((p) => `${p.x},${p.y}`).join(' ');

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
            Bản Đồ Tuyến Đi Bộ (Hà Nội)
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

        {/* SVG Overlay for markers and routes */}
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%'
          }}
        >
          {/* Route Line: Solid only if provider_route, Dashed with disclaimer if straight_line_estimate */}
          {projectedPoints.length > 1 && (
            <polyline
              points={polylinePoints}
              fill="none"
              stroke="var(--accent-primary)"
              strokeWidth={isProviderRoute ? 4 : 3}
              strokeDasharray={isProviderRoute ? 'none' : '6,5'}
              strokeOpacity={0.85}
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
                style={{ cursor: 'pointer' }}
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
              justifyContent: 'center'
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
              justifyContent: 'center'
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
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
        {isProviderRoute ? (
          <span style={{ color: '#2e7d32' }}>
            ✓ Đường nối hiển thị theo dữ liệu định tuyến thực tế từ provider.
          </span>
        ) : (
          <span>
            * Đường nét đứt biểu thị cự ly chim bay ước tính. Hệ thống không tự ý suy diễn hay bịa đặt hình học đường sá khi chưa có dữ liệu dẫn đường thực tế.
          </span>
        )}
      </div>
    </div>
  );
}
