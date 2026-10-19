'use client';

import React from 'react';
import { isValidGoogleMapsDirUrl } from '../../../../lib/mapsUrlValidation';
import { formatWarningMessage } from './ConfirmSummaryCard';
import './guided-leaves.css';

// One short sentence for the evidence gaps; every distinct unknown is kept, unrecognised ones keep their full readable text.
const COMPACT_UNKNOWN = {
  allergy_ingredients: 'thành phần để đánh giá dị ứng',
  hours: 'giờ mở cửa',
  price_per_person: 'giá theo người',
  route: 'tuyến đường thực',
  route_time: 'thời gian di chuyển',
  budget: 'chi phí theo ngân sách'
};

function compactUnknowns(unknowns) {
  const known = [];
  const other = [];
  for (const u of unknowns) {
    const key = typeof u === 'string' ? u.trim() : '';
    if (COMPACT_UNKNOWN[key]) known.push(COMPACT_UNKNOWN[key]);
    else if (u) other.push(formatWarningMessage(u));
  }
  const parts = [];
  if (known.length) parts.push(`Chưa xác minh: ${known.join(' · ')}.`);
  parts.push(...other);
  return parts.join(' ');
}

/**
 * GuidedTimeline
 * Step 5 Vertical Timeline conforming to Figma Frame 1:145 Warm Editorial
 * - Stop Card with peach circle number badges (01, 02, 03)
 * - Stage eyebrow in terracotta (#CF542F): arrive time + stage label (MỞ ĐẦU, MÓN CHÍNH, TRÁNG MIỆNG)
 * - Venue name & rich details (price range, hours, address according to source)
 * - Lock badge & replace stop controls
 * - Dark CTA card with Free Google Maps Walking Directions URL
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
  const hasUnknowns = Array.isArray(tour.unknowns) && tour.unknowns.length > 0;

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
      {/* Top Heading Row with status right */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          marginBottom: 2
        }}
      >
        <h3
          className="nn-section-h"
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            lineHeight: '26px',
            color: 'var(--nn-ink, #231815)'
          }}
        >
          Lộ trình ẩm thực
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

      {/* Warnings / Notices Section */}
      {(tour.status === 'conditional' || (Array.isArray(tour.route_warnings) && tour.route_warnings.length > 0) || (Array.isArray(tour.unknowns) && tour.unknowns.length > 0)) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
          {(tour.status === 'conditional' || hasUnknowns) && (
            <div
              data-testid={tour.status === 'conditional' ? 'timeline-conditional-status' : undefined}
              className="nn-peach-box nn-warn-one"
            >
              ⚠️ <b>{tour.status === 'conditional' ? 'Lịch trình có điều kiện:' : 'Thông tin chưa xác minh:'}</b>{' '}
              {hasUnknowns ? (
                <span data-testid="timeline-unknowns">{compactUnknowns(tour.unknowns)}</span>
              ) : (
                'Còn bằng chứng chưa được xác minh; hãy kiểm tra lại trước khi đi.'
              )}
            </div>
          )}

          {Array.isArray(tour.route_warnings) && tour.route_warnings.length > 0 && (
            <div
              data-testid="timeline-route-warnings"
              style={{
                margin: 0,
                background: '#fffbe6',
                border: '1px solid #ffe58f',
                borderLeft: '4px solid #faad14',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12.5,
                color: '#873800'
              }}
            >
              <b>Cảnh báo tuyến đường:</b>
              <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                {tour.route_warnings.map((rw, i) => (
                  <li key={i}>{formatWarningMessage(rw)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Vertical Stops List conforming to Figma Warm Editorial cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
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

          const dishStr = Array.isArray(stop.venue?.cuisine_styles) && stop.venue.cuisine_styles.length > 0
            ? stop.venue.cuisine_styles.join(' • ')
            : (stop.dish || 'Chưa có thông tin món cụ thể');

          const legMinText = typeof leg?.minutes === 'number'
            ? (leg.minutes === 0 ? '0 phút' : `~${leg.minutes} phút (ước tính)`)
            : null;

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

          const arriveDisplay = stop.arrive
            ? stop.arrive
            : (stop.depart ? `đến trước ${stop.depart}` : 'Chưa rõ giờ');

          const isLocked = lockedStops.includes(stop.venue_id) || stop.locked;

          const hoursNote = stop.hours?.display
            ? ` · nguồn ghi giờ mở cửa: ${stop.hours.display}`
            : ' · giờ mở cửa theo nguồn: chưa rõ';
          const fullDesc = `${dishStr}${hoursNote}`;

          const stageLabel = stop.role || stop.category || `ĐIỂM DỪNG ${idx + 1}`;
          const badgeNumber = idx + 1 < 10 ? `0${idx + 1}` : String(idx + 1);

          return (
            <div
              key={stop.venue_id || idx}
              data-testid={`guided-stop-${idx}`}
              className="nn-editorial-stop-card"
            >
              <div className="nn-stop-badge">{badgeNumber}</div>
              <div className="nn-stop-body">
                <div className="nn-stop-stage-row">
                  <span className="nn-stop-stage">
                    {arriveDisplay} · {stageLabel}
                  </span>
                  <div className="nn-stop-actions">
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

                <h4
                  data-testid={`timeline-stop-card-${idx}`}
                  className="nn-stop-name nn-timeline-card-title"
                >
                  {stop.name}
                </h4>

                <p className="nn-stop-desc nn-timeline-card-desc">
                  {fullDesc}
                </p>

                {/* Visible compact source-labeled price and estimated leg info */}
                <div className="nn-timeline-pills nn-stop-meta-line" data-testid={`stop-meta-line-${idx}`}>
                  <span className="nn-meta-pill" data-testid={`stop-price-pill-${idx}`}>
                    🏷️ {priceShortForm ? `Khoảng giá ≈${priceShortForm} (theo nguồn)` : (stop.price?.price_range ? `${stop.price.price_range} (theo nguồn)` : 'giá theo nguồn: chưa rõ')}
                  </span>
                  {idx > 0 && legMinText && (
                    <span className="nn-meta-pill nn-leg-pill" data-testid={`stop-leg-pill-${idx}`}>
                      🚶 {legMinText}
                    </span>
                  )}
                  {/* Semantic time pill for test backwards-compatibility */}
                  <span className="nn-time-pill nn-sr">{arriveDisplay}</span>
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
        style={{ marginTop: 4 }}
      >
        {hasAllergies
          ? `Dị ứng ${allergyTerms}: chưa quán nào được xác nhận an toàn dị ứng. Bạn hãy hỏi trực tiếp nhân viên quán về thành phần trước khi gọi món.`
          : 'Dị ứng: chưa quán nào được xác nhận an toàn dị ứng. Bạn hãy hỏi trực tiếp nhân viên quán về thành phần trước khi gọi món.'}
      </div>

      {/* Primary CTA: Dark Card with Free Google Maps Walking URL */}
      {mapsUrl && (
        <div className="nn-dark-cta-card">
          <div className="nn-cta-header">
            <h4 className="nn-cta-title">Sẵn sàng cho một buổi tối ngon?</h4>
            <p className="nn-cta-desc">Lịch trình đã sẵn sàng. Mở Google Maps để bắt đầu di chuyển.</p>
          </div>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="google-maps-cta"
            className="nn-cta-btn"
          >
            Mở lộ trình trên Google Maps →
          </a>
          <p
            data-testid="google-maps-disclosure"
            className="nn-maps-disclosure"
          >
            ℹ️ Mở liên kết chỉ đường trên Google Maps miễn phí. Danh sách điểm đến được gắn vào URL; không sử dụng API trả phí.
          </p>
        </div>
      )}

      {/* Per-leg fallback links for mobile / multi-stop tours (NFE-07) */}
      {legUrls.length > 0 && stops.length > 3 && (
        <details
          style={{
            background: 'var(--nn-card, #FFFEFA)',
            border: '1px solid var(--nn-card-line, #EFE7E0)',
            borderRadius: 12,
            padding: '10px 14px',
            fontSize: 13,
            marginTop: 4
          }}
        >
          <summary style={{ fontWeight: 600, color: 'var(--nn-ink, #231815)', cursor: 'pointer' }}>
            Xem từng chặng riêng trên Google Maps ({legUrls.length} chặng)
          </summary>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            <p style={{ margin: '0 0 6px 0', fontSize: 12, color: 'var(--nn-mute, #7A625A)', lineHeight: 1.4 }}>
              Nếu ứng dụng Google Maps trên điện thoại không hỗ trợ nhiều điểm dừng cùng lúc, bạn có thể bấm mở từng chặng:
            </p>
            {legUrls.map((leg) => (
              <a
                key={leg.order}
                href={leg.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: '#FDF9F5',
                  fontSize: 12,
                  color: 'var(--nn-accent, #CF542F)',
                  textDecoration: 'none',
                  border: '1px solid #EAE3DC'
                }}
              >
                <span>Chặng {leg.order}: {leg.fromName} → {leg.toName}</span>
                <span>Mở Maps ↗</span>
              </a>
            ))}
          </div>
        </details>
      )}

      {/* Adjust stops & Restart buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onAdjustStops}
          className="nn-ghost-pill"
          aria-label="Điều chỉnh danh sách điểm dừng"
        >
          ✏️ Điều chỉnh điểm dừng
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="nn-ghost-pill"
          aria-label="Làm mới lịch trình"
        >
          ↻ Lên food tour mới
        </button>
      </div>
    </div>
  );
}
