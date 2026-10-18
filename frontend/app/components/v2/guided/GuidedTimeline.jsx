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
 * - Single clean status badge row (coordinating with root's Lộ trình section header)
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
      {/* Top Single Heading Row: ONE heading 'Lộ trình' 18.3px/600 line 28, status right */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: 500,
          width: '100%'
        }}
      >
        <h3
          className="nn-section-h"
          style={{
            margin: 0,
            fontSize: 18.3,
            fontWeight: 600,
            lineHeight: '28px',
            color: 'var(--nn-ink, #17352B)'
          }}
        >
          Lộ trình
        </h3>
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

      {/* Combined Warning Block: ONE peach r8 warning container above first card (padding 8/12, font 13/18) */}
      {(tour.status === 'conditional' || (Array.isArray(tour.unknowns) && tour.unknowns.length > 0) || (Array.isArray(tour.route_warnings) && tour.route_warnings.length > 0)) && (
        <div
          data-testid="timeline-conditional-status"
          className="nn-peach-box"
          style={{
            margin: 0,
            padding: '8px 12px',
            fontSize: 13,
            lineHeight: '18px',
            borderRadius: 8,
            maxWidth: 500,
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          <div>
            {tour.status === 'conditional' && (
              <span>⚠️ <b>Lịch trình có điều kiện:</b> </span>
            )}
            {Array.isArray(tour.unknowns) && tour.unknowns.length > 0 ? (
              <span data-testid="timeline-unknowns">
                {tour.unknowns.map((u) => {
                  const s = typeof u === 'string' ? u.toLowerCase() : '';
                  if (s.includes('allerg')) return 'chưa xác minh thành phần để đánh giá dị ứng';
                  if (s.includes('hour')) return 'chưa xác minh giờ mở cửa';
                  if (s.includes('price')) return 'chưa xác minh giá theo người';
                  if (s.includes('rout')) return 'tuyến đường thực';
                  return formatWarningMessage(u);
                }).join(' – ')}.
              </span>
            ) : (
              <span>Còn bằng chứng chưa được xác minh; hãy xem các thông tin cần kiểm tra bên dưới.</span>
            )}
          </div>
          {Array.isArray(tour.route_warnings) && tour.route_warnings.length > 0 && (
            <div data-testid="timeline-route-warnings" style={{ marginTop: 4, color: '#873800', fontWeight: 500 }}>
              <b>Cảnh báo tuyến đường:</b> {tour.route_warnings.map((rw) => formatWarningMessage(rw)).join(' • ')}
            </div>
          )}
        </div>
      )}

      {/* Vertical Stops List conforming to reference geometry */}
      <div style={{ display: 'grid', gap: 13, maxWidth: 500, width: '100%' }}>
        {stops.map((stop, idx) => {
          const leg = stop.leg_from_previous;
          const hasMin = typeof stop.price?.min_vnd === 'number';
          const hasMax = typeof stop.price?.max_vnd === 'number';
          const priceMinK = hasMin ? `${Math.round(stop.price.min_vnd / 1000)}k` : null;
          const priceMaxK = hasMax ? `${Math.round(stop.price.max_vnd / 1000)}k` : null;
          const priceShortForm = hasMin && hasMax
            ? (priceMinK === priceMaxK ? priceMinK : `${priceMinK}–${priceMaxK}`)
            : hasMax
            ? `≤${priceMaxK}`
            : hasMin
            ? `≥${priceMinK}`
            : null;

          // Neutral dish unknown: never invent specific dish/source claim
          const dishStr = Array.isArray(stop.venue?.cuisine_styles) && stop.venue.cuisine_styles.length > 0
            ? stop.venue.cuisine_styles.join(' • ')
            : (stop.dish || 'Chưa có thông tin món cụ thể');

          // Q01: Preserve legitimate 0; do not turn null or 0 into 5!
          const legMinText = typeof leg?.minutes === 'number'
            ? (leg.minutes === 0 ? '0 phút' : `~${leg.minutes} phút (ước tính)`)
            : null;

          // Price + leg ONLY in metapill per visual owner specification
          const metaParts = [];
          if (priceShortForm) {
            metaParts.push(`≈${priceShortForm} (theo nguồn)`);
          } else if (stop.price?.price_range) {
            metaParts.push(stop.price.price_range);
          } else {
            metaParts.push('giá theo nguồn: chưa rõ');
          }
          if (idx > 0 && legMinText) {
            metaParts.push(legMinText);
          }
          const metaDisplay = metaParts.length > 0 ? metaParts.join(' · ') : 'Thông tin theo nguồn';

          // Q01: Preserve null arrive; do NOT fall back to '19:00'!
          const arriveDisplay = stop.arrive
            ? stop.arrive
            : (stop.depart ? `đến trước ${stop.depart}` : 'Chưa rõ giờ');

          const isLocked = lockedStops.includes(stop.venue_id) || stop.locked;

          // Hours inside desc: preserve explicit 'chưa rõ' when missing
          const hoursNote = stop.hours?.display
            ? ` · giờ mở cửa theo nguồn ghi: ${stop.hours.display}`
            : ' · giờ mở cửa: chưa rõ';
          const fullDesc = `${dishStr}${hoursNote}`;

          return (
            <div
              key={stop.venue_id || idx}
              data-testid={`guided-stop-${idx}`}
              className="nn-timeline-step"
            >
              {/* Dual Pill Row: Left: Time Pill + Meta Pill; Right: Real Lock / Replace Actions */}
              <div className="nn-timeline-pills">
                <div className="nn-timeline-pills-left">
                  <span className="nn-time-pill">
                    {arriveDisplay}
                  </span>
                  <span className="nn-meta-pill">
                    {metaDisplay}
                  </span>
                </div>
                <div className="nn-timeline-pills-right">
                  {isLocked && (
                    <span
                      data-testid={`stop-lock-badge-${idx}`}
                      className="nn-lock-badge"
                    >
                      🔒 Đã khóa
                    </span>
                  )}
                  <button
                    type="button"
                    data-testid={`stop-replace-btn-${idx}`}
                    onClick={() => onReplaceStop ? onReplaceStop(stop) : onChangeStop && onChangeStop(stop)}
                    className="nn-pill-action-btn"
                    aria-label={`Đổi quán ${stop.name}`}
                  >
                    🔄 Đổi quán
                  </button>
                </div>
              </div>

              {/* Stop Card: 500w, r8, border #D9D9D9, padding 24, title 23.7/400 #1E1E1E, desc 16 #757575, target 129h/107h */}
              <div
                data-testid={`timeline-stop-card-${idx}`}
                className="nn-timeline-card"
              >
                <h3 className="nn-timeline-card-title">
                  {stop.name}
                </h3>
                <p className="nn-timeline-card-desc">
                  {fullDesc}
                </p>
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
