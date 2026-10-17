'use client';

import React from 'react';
import { isValidGoogleMapsDirUrl } from '../../../../lib/mapsUrlValidation';
import { formatWarningMessage } from './ConfirmSummaryCard';

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

  // Build Free Google Maps Directions URL (Full route up to 5 stops)
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

  // Build Per-Leg Walking URLs (NFE-07 mobile fallback)
  const legUrls = [];
  if (stops.length > 1) {
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i];
      const to = stops[i + 1];
      const q = new URLSearchParams({
        api: '1',
        origin: `${from.lat},${from.lon}`,
        destination: `${to.lat},${to.lon}`,
        travelmode: 'walking'
      });
      const u = `https://www.google.com/maps/dir/?${q.toString()}`;
      if (isValidGoogleMapsDirUrl(u)) {
        legUrls.push({
          order: i + 1,
          fromName: from.name,
          toName: to.name,
          url: u
        });
      }
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
        background: 'transparent',
        border: 'none',
        borderRadius: 16,
        padding: 0,
        display: 'grid',
        gap: 16,
        margin: 0
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink, #231f1a)' }}>
          📍 Lịch trình gợi ý ({stops.length} quán)
        </div>
        {tour.status && (
          <span
            data-testid="timeline-status-badge"
            style={{
              fontSize: 12,
              background: tour.status === 'verified_feasible' ? '#E8F5E9' : tour.status === 'conditional' ? '#FEF3C7' : '#FEE2E2',
              color: tour.status === 'verified_feasible' ? '#2E7D32' : tour.status === 'conditional' ? '#92400E' : '#991B1B',
              border: `1px solid ${tour.status === 'verified_feasible' ? '#C8E6C9' : tour.status === 'conditional' ? '#FDE68A' : '#FECACA'}`,
              borderRadius: 12,
              padding: '2px 8px',
              fontWeight: 600
            }}
          >
            {tour.status === 'verified_feasible' ? 'Đã xác minh khả thi' : tour.status === 'conditional' ? 'Gợi ý có điều kiện' : 'Thiếu bằng chứng'}
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
          ⚠️ <b>Lịch trình có điều kiện:</b> Còn bằng chứng chưa được xác minh; hãy xem các thông tin cần kiểm tra bên dưới.
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
              <li key={i}>{formatWarningMessage(rw)}</li>
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
          <b>Thông tin chưa xác minh:</b> {tour.unknowns.map((u) => formatWarningMessage(u)).join(', ')}
        </div>
      )}

      {/* Vertical Stops List */}
      <div style={{ display: 'grid', gap: 0 }}>
        {stops.map((stop, idx) => {
          const leg = stop.leg_from_previous;
          const priceMin = stop.price?.min_vnd ? `${Math.round(stop.price.min_vnd / 1000)}k` : null;
          const priceMax = stop.price?.max_vnd ? `${Math.round(stop.price.max_vnd / 1000)}k` : null;
          const priceStr = priceMin && priceMax ? `${priceMin}–${priceMax}` : priceMax ? `tối đa tham khảo ${priceMax}` : 'chưa rõ khoảng giá';

          const dishStr = Array.isArray(stop.venue?.cuisine_styles) && stop.venue.cuisine_styles.length > 0
            ? stop.venue.cuisine_styles.join(' • ')
            : 'Chưa có thông tin món cụ thể';

          // Q01: Preserve legitimate 0; do not turn null or 0 into 5!
          const legMinText = typeof leg?.minutes === 'number'
            ? (leg.minutes === 0 ? '0 phút' : `~${leg.minutes} phút (ước tính)`)
            : 'chưa rõ thời gian chặng';

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
                gridTemplateColumns: 'minmax(0, 1fr)',
                gap: 8,
                padding: '10px 0',
                alignItems: 'start'
              }}
            >
              {/* Arrive Time (Honest: no fake 19:00) */}
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: '#FFFFFF',
                  background: '#166B52',
                  borderRadius: 20,
                  padding: '6px 14px',
                  width: 'fit-content'
                }}
              >
                {arriveDisplay}
              </div>

              {/* Stop Info with Honest Labels */}
              <div style={{ display: 'grid', gap: 10, minWidth: 0, padding: 20, background: '#FFFFFF', border: '1px solid #DDE7E1', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <b style={{ fontSize: 20, color: 'var(--ink, #231f1a)' }}>
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
                      padding: '8px 12px',
                      minHeight: 44,
                      color: '#166B52',
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

      {/* Per-leg fallback links for mobile / multi-stop tours (NFE-07) */}
      {legUrls.length > 0 && stops.length > 3 && (
        <details
          style={{
            background: '#F7F8F2',
            border: '1px solid #DDE7E1',
            borderRadius: 12,
            padding: '10px 14px',
            fontSize: 13
          }}
        >
          <summary style={{ fontWeight: 600, color: '#17352B', cursor: 'pointer' }}>
            Xem từng chặng riêng trên Google Maps ({legUrls.length} chặng)
          </summary>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#62736D', lineHeight: 1.4 }}>
              Nếu ứng dụng Google Maps trên điện thoại không hỗ trợ nhiều điểm dừng cùng lúc, bạn có thể bấm mở từng chặng:
            </p>
            {legUrls.map((leg) => (
              <a
                key={leg.order}
                href={leg.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`google-maps-leg-${leg.order}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: 8,
                  border: '1px solid #DDE7E1',
                  color: '#166B52',
                  textDecoration: 'none',
                  fontSize: 12,
                  fontWeight: 600
                }}
              >
                <span>Chặng {leg.order}: {leg.fromName} → {leg.toName}</span>
                <span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        </details>
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
