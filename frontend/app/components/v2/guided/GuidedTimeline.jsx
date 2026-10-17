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
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink, #231f1a)' }}>
        📍 Lịch trình gợi ý ({stops.length} quán)
      </div>

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

          const legMin = leg?.minutes || 5;

          return (
            <div
              key={stop.venue_id || idx}
              data-testid={`guided-stop-${idx}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr',
                gap: 12,
                padding: '12px 0',
                borderTop: idx > 0 ? '1px solid var(--line, #e6dfd3)' : 'none',
                alignItems: 'start'
              }}
            >
              {/* Arrive Time */}
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: 'var(--accent, #c2410c)',
                  paddingTop: 2
                }}
              >
                {stop.arrive || '19:00'}
              </div>

              {/* Stop Info with Honest Labels */}
              <div style={{ display: 'grid', gap: 4 }}>
                <b style={{ fontSize: 15, color: 'var(--ink, #231f1a)' }}>
                  {stop.name}
                </b>
                <div style={{ fontSize: 13, color: 'var(--mute, #6b6257)', lineHeight: 1.45 }}>
                  <span>{dishStr}</span>
                  <span> • giá theo nguồn: {priceStr}</span>
                  {idx > 0 && <span> • đi bộ ~{legMin} phút (ước tính)</span>}
                  <span> • giờ mở cửa theo nguồn ghi: {stop.hours?.display || 'chưa rõ'}</span>
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

      {/* Primary CTA: Mở lộ trình trong Google Maps (Free URL, NO API Key) */}
      {mapsUrl && (
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
