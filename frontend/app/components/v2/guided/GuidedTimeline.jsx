'use client';

import React from 'react';
import { isValidGoogleMapsDirUrl } from '../../../../lib/mapsUrlValidation';
import { formatWarningMessage } from './ConfirmSummaryCard';
import './guided-leaves.css';

/**
 * GuidedTimeline
 * Step 5 Vertical Timeline conforming to SVG fidelity spec (owner: Antigravity)
 * - 500px width on desktop (responsive on mobile)
 * - Reference stop pair: pill row (34h green time pill + 35h meta pill) + 8px radius card
 * - Audited colors: titles #1E1E1E, descriptions #757575, borders #D9D9D9
 * - Ghost pill buttons (min-height 44 hit area, visual 34)
 * - Preserves ALL testids, handlers, allergy disclaimers, status badges, and Google Maps CTA
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
      className="nn-timeline"
      style={{ margin: 0, padding: 0 }}
    >
      {/* Top Header & Tour Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--nn-ink, #17352B)' }}>
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
          className="nn-peach-box"
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

      {/* Vertical Stops List conforming to reference geometry */}
      <div style={{ display: 'grid', gap: 13 }}>
        {stops.map((stop, idx) => {
          const leg = stop.leg_from_previous;
          const priceMinK = stop.price?.min_vnd ? `${Math.round(stop.price.min_vnd / 1000)}k` : null;
          const priceMaxK = stop.price?.max_vnd ? `${Math.round(stop.price.max_vnd / 1000)}k` : null;
          const priceStr = priceMinK && priceMaxK ? `${priceMinK}–${priceMaxK}` : priceMaxK ? `tối đa tham khảo ${priceMaxK}` : 'chưa rõ khoảng giá';
          const priceShortForm = priceMinK && priceMaxK ? `${priceMinK}–${priceMaxK}` : priceMaxK ? `<=${priceMaxK}` : null;

          const dishStr = Array.isArray(stop.venue?.cuisine_styles) && stop.venue.cuisine_styles.length > 0
            ? stop.venue.cuisine_styles.join(' • ')
            : 'Chưa có thông tin món cụ thể';

          // Q01: Preserve legitimate 0; do not turn null or 0 into 5!
          const legMinText = typeof leg?.minutes === 'number'
            ? (leg.minutes === 0 ? '0 phút' : `~${leg.minutes} phút (ước tính)`)
            : null;

          // Meta pill text: leg duration + price short form
          const metaParts = [];
          if (idx > 0 && legMinText) {
            metaParts.push(legMinText);
          }
          if (priceShortForm) {
            metaParts.push(`${priceShortForm} (theo nguồn)`);
          } else {
            metaParts.push('giá theo nguồn: ' + priceStr);
          }
          const metaDisplay = metaParts.length > 0 ? metaParts.join(' • ') : 'Thông tin theo nguồn';

          // Q01: Preserve null arrive; do NOT fall back to '19:00'!
          const arriveDisplay = stop.arrive
            ? stop.arrive
            : (stop.depart ? `đến trước ${stop.depart}` : 'Chưa rõ giờ');

          const isLocked = lockedStops.includes(stop.venue_id) || stop.locked;

          return (
            <div
              key={stop.venue_id || idx}
              data-testid={`guided-stop-${idx}`}
              className="nn-timeline-step"
            >
              {/* Dual Pill Row: 34px Green Time Pill + 35px Meta Pill */}
              <div className="nn-timeline-pills">
                <span className="nn-time-pill">
                  {arriveDisplay}
                </span>
                <span className="nn-meta-pill">
                  {metaDisplay}
                </span>
              </div>

              {/* Stop Card with 8px radius and #D9D9D9 border */}
              <div
                data-testid={`timeline-stop-card-${idx}`}
                className="nn-timeline-card"
              >
                <div className="nn-timeline-card-header">
                  <h3 className="nn-timeline-card-title">
                    {stop.name}
                  </h3>
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

                <p className="nn-timeline-card-desc">
                  {dishStr}
                </p>

                <div className="nn-timeline-card-hours">
                  <span>giá theo nguồn: {priceStr}</span>
                  {idx > 0 && legMinText && <span> • đi bộ {legMinText}</span>}
                  <span> • giờ mở cửa theo nguồn ghi: {stop.hours?.display || 'chưa rõ'}</span>
                </div>

                {/* Stop-level action buttons: Ghost Pill "Đổi quán này" */}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    data-testid={`stop-replace-btn-${idx}`}
                    onClick={() => onReplaceStop ? onReplaceStop(stop) : onChangeStop && onChangeStop(stop)}
                    className="nn-ghost-pill"
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
        className="nn-peach-box"
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
            className="nn-maps-pill"
          >
            Mở lộ trình trong Google Maps
          </a>
          <p
            data-testid="google-maps-disclosure"
            style={{
              fontSize: 12,
              color: 'var(--nn-mute, #62736D)',
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
            background: 'var(--nn-bg, #F7F8F2)',
            border: '1px solid var(--nn-line, #DDE7E1)',
            borderRadius: 12,
            padding: '10px 14px',
            fontSize: 13
          }}
        >
          <summary style={{ fontWeight: 600, color: 'var(--nn-ink, #17352B)', cursor: 'pointer' }}>
            Xem từng chặng riêng trên Google Maps ({legUrls.length} chặng)
          </summary>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            <p style={{ margin: '0 0 6px 0', fontSize: 12, color: 'var(--nn-mute, #62736D)', lineHeight: 1.4 }}>
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
                  backgroundColor: 'var(--nn-card, #FFFFFF)',
                  borderRadius: 8,
                  border: '1px solid var(--nn-line, #DDE7E1)',
                  color: 'var(--nn-green, #166B52)',
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

      {/* Three Secondary Actions as Ghost Pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid="action-change-stop"
          onClick={onChangeStop}
          className="nn-ghost-pill"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          Đổi quán
        </button>

        <button
          type="button"
          data-testid="action-adjust-stops"
          onClick={onAdjustStops}
          className="nn-ghost-pill"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          Bớt / thêm quán
        </button>

        <button
          type="button"
          data-testid="action-restart"
          onClick={onRestart}
          className="nn-ghost-pill"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          Làm lại từ đầu
        </button>
      </div>

      {/* Calm disclosure */}
      <details
        style={{
          fontSize: 13,
          color: 'var(--nn-mute, #62736D)',
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
