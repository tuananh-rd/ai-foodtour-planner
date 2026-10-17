'use client';

import React from 'react';
import { isValidGoogleMapsDirUrl } from '../../../../lib/mapsUrlValidation';

/**
 * GuidedTimeline
 * Step 5 Vertical Timeline matching docs/ux/guided-flow-mockup.html
 * - Honest labels: price "theo nguồn", distance "ước tính", hours "nguồn ghi"
 * - Allergy note: "chưa quán nào được xác nhận an toàn dị ứng"
 * - Primary CTA: "Mở lộ trình trong Google Maps" (free URL)
 * - Three secondary actions: "Đổi quán", "Bớt / thêm quán", "Làm lại từ đầu"
 */
export default function GuidedTimeline({
  tour,
  allergies = [],
  lockedStops = [],
  onReplaceStop,
  onChangeStop,
  onAdjustStops,
  onRestart
}) {
  if (!tour || !Array.isArray(tour.stops) || tour.stops.length === 0) {
    return null;
  }

  const stops = tour.stops;

  // Build Free Google Maps Directions URL
  let mapsUrl = null;
  if (stops.length > 0) {
    const origin = `${stops[0].lat},${stops[0].lon}`;
    const destination = `${stops[stops.length - 1].lat},${stops[stops.length - 1].lon}`;
    const waypoints = stops.length > 2
      ? stops.slice(1, -1).map((s) => `${s.lat},${s.lon}`).join('|')
      : null;

    const query = new URLSearchParams({
      api: '1',
      origin,
      destination,
      travelmode: 'walking'
    });
    if (waypoints) {
      query.set('waypoints', waypoints);
    }
    const candidateUrl = `https://www.google.com/maps/dir/?${query.toString()}`;
    if (isValidGoogleMapsDirUrl(candidateUrl)) {
      mapsUrl = candidateUrl;
    }
  }

  // Allergy label display
  const hasAllergies = Array.isArray(allergies) && allergies.length > 0;
  const allergyTerms = hasAllergies
    ? allergies.map((a) => a.term || a.family || 'dị ứng').join(', ')
    : '';

  return (
    <div
      data-testid="guided-timeline"
      style={{
        background: 'var(--card, #fff)',
        border: '1px solid var(--line, #e6dfd3)',
        borderRadius: 16,
        padding: 16,
        display: 'grid',
        gap: 16,
        margin: '16px 0'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink, #231f1a)' }}>
          📍 Lịch trình gợi ý ({stops.length} quán)
        </div>
        {tour.status === 'conditional' && (
          <span
            data-testid="timeline-status-badge"
            style={{
              fontSize: 12,
              background: '#fef3c7',
              color: '#92400e',
              border: '1px solid #fde68a',
              borderRadius: 12,
              padding: '2px 8px',
              fontWeight: 600
            }}
          >
            Gợi ý có điều kiện
          </span>
        )}
      </div>

      {/* Tour Status & Conditional Notice (Q02) */}
      {tour.status === 'conditional' && (
        <div
          data-testid="timeline-conditional-status"
          style={{
            background: 'var(--warnbg, #fef3c7)',
            color: 'var(--warn, #92400e)',
            border: '1px solid var(--warn, #92400e)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            lineHeight: 1.45
          }}
        >
          ⚠️ <b>Lịch trình có điều kiện:</b> Một số thông tin về giờ mở cửa và giá theo người chưa được xác minh trực tiếp tại quán.
        </div>
      )}

      {/* Route Warnings (Q02) */}
      {Array.isArray(tour.route_warnings) && tour.route_warnings.length > 0 && (
        <div
          data-testid="timeline-route-warnings"
          style={{
            background: '#fffbe6',
            border: '1px solid #ffe58f',
            borderLeft: '4px solid #faad14',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            color: '#873800'
          }}
        >
          <b>Cảnh báo tuyến đường:</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {tour.route_warnings.map((rw, i) => (
              <li key={i}>{typeof rw === 'string' ? rw : rw.message || JSON.stringify(rw)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Unknowns (Q02) */}
      {Array.isArray(tour.unknowns) && tour.unknowns.length > 0 && (
        <div
          data-testid="timeline-unknowns"
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: '#475569'
          }}
        >
          <b>Thông tin chưa xác minh:</b> {tour.unknowns.join(', ')}
        </div>
      )}

      {/* Vertical Stops List */}
      <div style={{ display: 'grid', gap: 0 }}>
        {stops.map((stop, idx) => {
          const leg = stop.leg_from_previous;
          const priceMin = stop.price?.min_vnd ? `${Math.round(stop.price.min_vnd / 1000)}k` : null;
          const priceMax = stop.price?.max_vnd ? `${Math.round(stop.price.max_vnd / 1000)}k` : null;
          const priceStr = priceMin && priceMax ? `${priceMin}–${priceMax}` : priceMax || 'theo nguồn';

          const dishStr = Array.isArray(stop.venue?.cuisine_styles) && stop.venue.cuisine_styles.length > 0
            ? stop.venue.cuisine_styles.join(' • ')
            : 'Món ngon Hà Nội';

          // Q01: Preserve legitimate 0; do not turn null or 0 into 5!
          const legMinText = typeof leg?.minutes === 'number'
            ? (leg.minutes === 0 ? '0 phút' : `~${leg.minutes} phút (ước tính)`)
            : 'chưa tính khoảng cách';

          // Q01: Preserve null arrive; do NOT fall back to '19:00'!
          const arriveDisplay = stop.arrive
            ? stop.arrive
            : (stop.depart ? `đến trước ${stop.depart}` : 'Chưa rõ giờ');

          const isLocked = lockedStops.includes(stop.venue_id) || stop.locked;

          return (
            <div
              key={stop.venue_id || idx}
              data-testid={`guided-stop-${idx}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr',
                gap: 12,
                padding: '12px 0',
                borderTop: idx > 0 ? '1px solid var(--line, #e6dfd3)' : 'none',
                alignItems: 'start'
              }}
            >
              {/* Arrive Time (Honest: no fake 19:00) */}
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: 'var(--accent, #c2410c)',
                  paddingTop: 2
                }}
              >
                {arriveDisplay}
              </div>

              {/* Stop Info with Honest Labels */}
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <b style={{ fontSize: 15, color: 'var(--ink, #231f1a)' }}>
                    {stop.name}
                  </b>
                  {isLocked && (
                    <span
                      data-testid={`stop-lock-badge-${idx}`}
                      style={{
                        fontSize: 11,
                        background: '#e0f2fe',
                        color: '#0369a1',
                        borderRadius: 6,
                        padding: '1px 6px',
                        fontWeight: 600
                      }}
                    >
                      🔒 Đã khóa
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 13, color: 'var(--mute, #6b6257)', lineHeight: 1.45 }}>
                  <span>{dishStr}</span>
                  <span> • giá theo nguồn: {priceStr}</span>
                  {idx > 0 && <span> • đi bộ {legMinText}</span>}
                  <span> • giờ mở cửa theo nguồn ghi: {stop.hours?.display || 'chưa rõ'}</span>
                </div>

                {/* Stop-level action buttons: Đổi quán */}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    data-testid={`stop-replace-btn-${idx}`}
                    onClick={() => onReplaceStop ? onReplaceStop(stop) : onChangeStop && onChangeStop(stop)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--line, #e6dfd3)',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--ink, #231f1a)',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 Đổi quán này
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Allergy Safety Disclaimer */}
      <div
        data-testid="timeline-allergy-note"
        style={{
          background: 'var(--warnbg, #fef3c7)',
          color: 'var(--warn, #92400e)',
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 13,
          lineHeight: 1.45
        }}
      >
        {hasAllergies
          ? `Dị ứng ${allergyTerms}: chưa quán nào được xác nhận an toàn dị ứng. Bạn hãy hỏi trực tiếp nhân viên quán về thành phần trước khi gọi món.`
          : 'Dị ứng: chưa quán nào được xác nhận an toàn dị ứng. Bạn hãy hỏi trực tiếp nhân viên quán về thành phần trước khi gọi món.'}
      </div>

      {/* Primary CTA: Mở lộ trình trong Google Maps (Free URL, NO API Key) with Q05 Disclosure */}
      {mapsUrl && (
        <div style={{ display: 'grid', gap: 6 }}>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="google-maps-cta"
            style={{
              minHeight: 48,
              borderRadius: 12,
              background: 'var(--accent, #c2410c)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(194, 65, 12, 0.2)',
              cursor: 'pointer'
            }}
          >
            Mở lộ trình trong Google Maps
          </a>
          <p
            data-testid="google-maps-disclosure"
            style={{
              fontSize: 12,
              color: 'var(--mute, #6b6257)',
              margin: 0,
              lineHeight: 1.45
            }}
          >
            ℹ️ Mở liên kết chỉ đường trên Google Maps. Danh sách điểm đến được gắn vào URL; Google có thể tính thời gian và đường đi thực tế khác với ứng dụng.
          </p>
        </div>
      )}

      {/* Three Secondary Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid="action-change-stop"
          onClick={onChangeStop}
          style={{
            flex: 1,
            minHeight: 44,
            padding: '0 12px',
            borderRadius: 10,
            border: '1px solid var(--line, #e6dfd3)',
            background: 'transparent',
            color: 'var(--ink, #231f1a)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'center'
          }}
        >
          Đổi quán
        </button>

        <button
          type="button"
          data-testid="action-adjust-stops"
          onClick={onAdjustStops}
          style={{
            flex: 1,
            minHeight: 44,
            padding: '0 12px',
            borderRadius: 10,
            border: '1px solid var(--line, #e6dfd3)',
            background: 'transparent',
            color: 'var(--ink, #231f1a)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'center'
          }}
        >
          Bớt / thêm quán
        </button>

        <button
          type="button"
          data-testid="action-restart"
          onClick={onRestart}
          style={{
            flex: 1,
            minHeight: 44,
            padding: '0 12px',
            borderRadius: 10,
            border: '1px solid var(--line, #e6dfd3)',
            background: 'transparent',
            color: 'var(--ink, #231f1a)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'center'
          }}
        >
          Làm lại từ đầu
        </button>
      </div>

      {/* Calm disclosure */}
      <details
        style={{
          fontSize: 13,
          color: 'var(--mute, #6b6257)',
          marginTop: 4,
          cursor: 'pointer'
        }}
      >
        <summary style={{ outline: 'none' }}>Chi tiết (dữ liệu & cách hiểu)</summary>
        <div style={{ paddingTop: 6, lineHeight: 1.45 }}>
          Nguồn: bộ dữ liệu Foody. Giờ mở cửa theo nguồn ghi, chưa kiểm chứng. Khoảng cách là ước tính đường chim bay.
        </div>
      </details>
    </div>
  );
}
