'use client';

import React, { useState, useEffect, useRef } from 'react';
import { buildDiscoveryMapsUrl, buildDiscoveryLegUrls, getDiscoveryMapsRequestIdentity, isValidCoordinate, normalizeDiscoveryMapsResponse, resolveEffectiveDiscoveryMapsLinks, resolveTravelMode, validateDiscoveryMapsLink } from '../../../../lib/discoveryMaps';
import { getDiscoveryMapsLinks } from '../../../../lib/discoveryApi';
import { translateServerNote } from '../../../../lib/mapsUrlValidation';
import { formatWarningMessage } from './ConfirmSummaryCard';
import { normalizeDisplayText } from '../../../../lib/emojiSanitizer';
import './guided-leaves.css';

// One short sentence for the evidence gaps; every distinct unknown is kept, unrecognised ones keep their full readable text.
const COMPACT_UNKNOWN = {
  allergy_ingredients: 'thành phần để đánh giá dị ứng',
  ingredient_allergy_safety: 'an toàn thành phần dị ứng',
  elderly_access: 'tiếp cận người cao tuổi / đi lại thuận tiện',
  sweetness: 'độ ngọt món ăn',
  dish_price: 'giá từng món ăn',
  current_open_status: 'trạng thái mở cửa hiện tại',
  hours: 'giờ mở cửa',
  price_per_person: 'giá theo người',
  route: 'tuyến đường thực',
  route_time: 'thời gian di chuyển',
  budget: 'chi phí theo ngân sách',
  amenity: 'tiện ích quán',
  parking: 'chỗ đỗ xe',
  taste: 'khẩu vị'
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

const SKIPPED_REASONS_VI = {
  no_usable_point: 'quán thiếu toạ độ hoặc địa chỉ hợp lệ',
  url_too_long: 'độ dài liên kết vượt quá giới hạn 2048 ký tự'
};

export function formatSkippedReason(reason) {
  return SKIPPED_REASONS_VI[reason] || reason || 'không thể xác định toạ độ';
}

export function validateServerLink(link, expectedMode) {
  return validateDiscoveryMapsLink(link, expectedMode);
}

/**
 * GuidedTimeline
 * Step 5 Vertical Timeline conforming to Figma Frame 1:145 Warm Editorial
 * - Stop Card with peach circle number badges (01, 02, 03)
 * - Stage eyebrow in terracotta (#CF542F): arrive time + stage label (MỞ ĐẦU, MÓN CHÍNH, TRÁNG MIỆNG)
 * - Venue name & rich details (price range, hours, address according to source)
 * - Lock badge & replace stop controls
 * - Dark CTA card with Free OpenStreetMap Directions URL (honoring user origin & travel mode)
 * - Numbered ordered tour stops matching map
 * - Zero emoji in UI strings
 */
export default function GuidedTimeline({
  tour,
  allergies = [],
  lockedStops = [],
  origin = null,
  vehicle = null,
  sessionId = null,
  sessionToken = null,
  revision = null,
  onReplaceStop,
  onChangeStop,
  onAdjustStops,
  onRestart
}) {
  // HOOKS FIRST: Unconditional hook calls conforming to React Rules of Hooks
  const [serverMaps, setServerMaps] = useState(null);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState(null);
  const mapsIdentityRef = useRef(null);

  const hasValidOrigin = isValidCoordinate(origin);
  const stops = Array.isArray(tour?.stops) ? tour.stops : [];
  const modeInfo = resolveTravelMode(vehicle);
  const travelMode = modeInfo.mode || 'walking';
  const mapsIdentity = getDiscoveryMapsRequestIdentity({ sessionId, sessionToken, revision, origin, travelMode, stops });
  mapsIdentityRef.current = mapsIdentity;

  useEffect(() => {
    // Clear previous state immediately so stale links never survive across sessions/revisions/mode/origin changes
    setServerMaps(null);
    setMapsError(null);

    // Explicit valid origin gate: if no origin, no auth or no stops, do not fetch and do not render CTA
    if (!sessionId || !sessionToken || !hasValidOrigin || stops.length === 0) {
      setMapsLoading(false);
      return;
    }

    let active = true;
    const ac = new AbortController();
    const requestedIdentity = mapsIdentity;
    setMapsLoading(true);

    getDiscoveryMapsLinks(sessionId, sessionToken, travelMode, { signal: ac.signal })
      .then((res) => {
        if (!active || mapsIdentityRef.current !== requestedIdentity) return;
        if (!res || typeof res !== 'object') {
          setServerMaps({ identity: requestedIdentity, status: 'unavailable', links: [], skipped: [], notes: [] });
          return;
        }

        setServerMaps({ ...normalizeDiscoveryMapsResponse(res, travelMode), identity: requestedIdentity });
      })
      .catch((err) => {
        if (active && mapsIdentityRef.current === requestedIdentity && err?.name !== 'AbortError') {
          setServerMaps(null);
          setMapsError({ identity: requestedIdentity, message: err?.message || 'Không thể lấy liên kết từ máy chủ' });
        }
      })
      .finally(() => {
        if (active && mapsIdentityRef.current === requestedIdentity) setMapsLoading(false);
      });

    return () => {
      active = false;
      ac.abort();
    };
  }, [sessionId, sessionToken, revision, travelMode, mapsIdentity, stops.length, hasValidOrigin]);

  // Early return ONLY after all hooks are evaluated
  if (!tour || stops.length === 0) {
    return null;
  }

  const hasUnknowns = Array.isArray(tour.unknowns) && tour.unknowns.length > 0;

  // Build Free OpenStreetMap Directions URL via discoveryMaps (client fallback, gated by valid origin)
  const mapsUrlInfo = hasValidOrigin ? buildDiscoveryMapsUrl({ origin, stops, vehicle }) : null;

  const currentServerMaps = serverMaps && serverMaps.identity === mapsIdentity ? serverMaps : null;
  const staleServerResponse = Boolean(serverMaps && !currentServerMaps);
  const currentMapsError = mapsError?.identity === mapsIdentity ? mapsError.message : null;
  const serverStatus = currentServerMaps?.status || null;
  const isServerUnavailable = serverStatus === 'unavailable';
  const isServerPartial = serverStatus === 'partial';
  // Effective links: prioritize server split links if available and valid
  const rawEffectiveLinks = resolveEffectiveDiscoveryMapsLinks({
    serverMaps: staleServerResponse ? { status: 'unavailable', links: [] } : currentServerMaps,
    origin: hasValidOrigin ? origin : null,
    stops,
    vehicle
  });
  const effectiveLinks = rawEffectiveLinks.map((sl) => ({
      index: sl.index,
      of: sl.of,
      url: sl.url,
      label: sl.of > 1 ? `Chặng ${sl.index}/${sl.of}` : 'Toàn bộ lộ trình'
  }));

  const primaryUrl = effectiveLinks[0]?.url || null;
  const isMultiLeg = effectiveLinks.length > 1;

  // Build Per-Leg URLs (mobile fallback / detailed segments)
  const legUrls = hasValidOrigin ? buildDiscoveryLegUrls({ origin, stops, vehicle }) : [];
  const showClientLegFallback = !currentServerMaps && !staleServerResponse;

  // Allergy label display
  const hasAllergies = Array.isArray(allergies) && allergies.length > 0;
  const allergyTerms = hasAllergies
    ? allergies.map((a) => a.term || a.family || 'dị ứng').join(', ')
    : '';

  return (
    <div className="nn-guided-timeline" data-testid="guided-timeline">
      {/* Editorial Timeline Header */}
      <div className="nn-timeline-editorial-header">
        <h4 className="nn-editorial-title">Lịch trình đề xuất</h4>
        <div className="nn-editorial-subtitle">
          {stops.length} điểm dừng · {tour.totals?.total_duration_min || 0} phút dự kiến
        </div>
      </div>

      {/* Vertical Steps List */}
      <ol className="nn-timeline-stop-list" style={{ listStyle: 'none', padding: 0, margin: '14px 0 0 0' }}>
        {stops.map((stop, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === stops.length - 1;
          const isLocked = lockedStops.includes(stop.venue_id);
          const stageBadge = String(idx + 1).padStart(2, '0');
          const stageLabel = isFirst ? 'MỞ ĐẦU' : (isLast ? 'TRÁNG MIỆNG' : 'MÓN CHÍNH');

          return (
            <li
              key={stop.venue_id || `stop-${idx}`}
              data-testid={`timeline-stop-${idx + 1}`}
              className="nn-editorial-stop-card"
            >
              <div className="nn-stop-badge-column">
                <span className="nn-stop-badge" aria-label={`Điểm dừng ${idx + 1}`}>
                  {stageBadge}
                </span>
                {!isLast && <div className="nn-stop-connector-line" aria-hidden="true" />}
              </div>

              <div className="nn-stop-body">
                <div className="nn-stop-stage-row">
                  <span className="nn-stop-stage">
                    {stop.arrive ? `${stop.arrive} · ` : ''}{stageLabel}
                  </span>
                  {isLocked && (
                    <span
                      data-testid={`locked-badge-${idx + 1}`}
                      className="nn-locked-pill"
                      title="Điểm này được giữ nguyên khi đổi các quán khác"
                    >
                      Đã khoá
                    </span>
                  )}
                </div>

                <div className="nn-stop-title-row">
                  <h5 className="nn-stop-name">{normalizeDisplayText(stop.name)}</h5>
                  <div className="nn-stop-actions">
                    <button
                      type="button"
                      data-testid={`btn-replace-stop-${idx + 1}`}
                      className="nn-stop-action-btn"
                      onClick={() => {
                        if (typeof onReplaceStop === 'function') {
                          onReplaceStop(stop.venue_id);
                        } else if (typeof onChangeStop === 'function') {
                          onChangeStop(stop.venue_id);
                        }
                      }}
                      aria-label={`Đổi quán ${stop.name}`}
                    >
                      Đổi quán
                    </button>
                  </div>
                </div>

                {stop.address && (
                  <p className="nn-stop-address">{normalizeDisplayText(stop.address)}</p>
                )}

                <div className="nn-stop-meta-pills">
                  {stop.price && stop.price.range_vnd && (
                    <span className="nn-meta-pill">
                      {stop.price.range_vnd}
                    </span>
                  )}
                  {stop.hours && stop.hours.formatted && (
                    <span className="nn-meta-pill">
                      {stop.hours.formatted}
                    </span>
                  )}
                  {stop.district && (
                    <span className="nn-meta-pill">
                      {stop.district}
                    </span>
                  )}
                </div>

                {stop.dishes && stop.dishes.length > 0 && (
                  <div className="nn-stop-dishes">
                    Món nổi bật: {stop.dishes.map((d) => normalizeDisplayText(typeof d === 'string' ? d : d.name)).join(', ')}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Evidence Gaps / Unknowns Compact Box */}
      {hasUnknowns && (
        <div
          data-testid="timeline-unknowns"
          className="nn-peach-box"
          style={{ marginTop: 12 }}
        >
          {compactUnknowns(tour.unknowns)}
        </div>
      )}

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

      {/* Truthful Limitation Banner: Motorcycle */}
      {modeInfo.isMotorbike && (
        <div
          data-testid="osm-maps-coverage"
          data-legacy-testid="google-maps-coverage"
          className="nn-peach-box"
          role="status"
          style={{ marginTop: 8 }}
        >
          <b>Chưa hỗ trợ chỉ đường xe máy:</b> Không tự động thay bằng đường ô tô. Bạn hãy theo dõi các điểm dừng được đánh số trên bản đồ.
        </div>
      )}

      {/* Server Maps Coverage / Skipped Banner */}
      {currentServerMaps && (isServerPartial || (isServerUnavailable && !modeInfo.isMotorbike)) && (
        <div
          data-testid="osm-maps-coverage"
          data-legacy-testid="google-maps-coverage"
          className="nn-peach-box"
          role="status"
        >
          <b>{isServerPartial ? 'Chỉ dẫn chưa đầy đủ:' : 'Máy chủ chưa tạo được chỉ dẫn:'}</b>{' '}
          {isServerPartial
            ? 'Các chặng dưới đây giữ đúng thứ tự; điểm bị bỏ qua không được nối tắt.'
            : 'Không có liên kết điều hướng đầy đủ cho lịch trình này.'}
          {currentServerMaps.skipped?.length > 0 && (
            <ul
              data-testid="osm-maps-skipped"
              data-legacy-testid="google-maps-skipped"
              style={{ margin: '4px 0 0', paddingLeft: 18 }}
            >
              {currentServerMaps.skipped.map((item, index) => (
                <li key={`${item?.stop_order ?? 'stop'}-${index}`}>
                  Điểm {item?.stop_order ?? '?'}: {formatSkippedReason(item?.reason)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Server Notes */}
      {currentServerMaps?.notes?.some((note) => typeof note === 'string' && note.trim()) && (
        <div
          data-testid="osm-maps-notes"
          data-legacy-testid="google-maps-notes"
          className="nn-maps-disclosure"
          role="note"
        >
          {currentServerMaps.notes.filter((note) => typeof note === 'string' && note.trim()).map((note, index) => (
            <p key={`maps-note-${index}`} style={{ margin: index ? '4px 0 0' : 0 }}>
              {normalizeDisplayText(translateServerNote(note))}
            </p>
          ))}
        </div>
      )}

      {/* Loading state */}
      {mapsLoading && (
        <p
          data-testid="osm-maps-loading"
          data-legacy-testid="google-maps-loading"
          className="nn-maps-disclosure"
          role="status"
        >
          Đang đồng bộ liên kết điều hướng từ máy chủ…
        </p>
      )}

      {/* Error state */}
      {currentMapsError && (
        <p
          data-testid="osm-maps-error"
          data-legacy-testid="google-maps-error"
          className="nn-maps-disclosure"
          role="alert"
        >
          {normalizeDisplayText(currentMapsError)}. Đang dùng liên kết dự phòng nếu có.
        </p>
      )}

      {/* Primary CTA: Dark Card with Free OpenStreetMap Directions URL */}
      {primaryUrl && (
        <div className="nn-dark-cta-card">
          <div className="nn-cta-header">
            <h4 className="nn-cta-title">Sẵn sàng cho một buổi tối ngon?</h4>
            <p className="nn-cta-desc">
              {isServerPartial
                ? `Máy chủ chỉ tạo được ${effectiveLinks.length} chặng khả dụng; các điểm bị bỏ qua không được nối tắt.`
                : isMultiLeg
                  ? `Lịch trình có ${stops.length} điểm dừng, được chia thành ${effectiveLinks.length} chặng OpenStreetMap theo đúng thứ tự.`
                  : 'Lịch trình đã sẵn sàng. Mở OpenStreetMap để bắt đầu di chuyển.'}
            </p>
          </div>
          <a
            href={primaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="osm-directions-cta"
            data-legacy-testid="google-maps-cta"
            className="nn-cta-btn"
          >
            {isMultiLeg
              ? `Xem lịch trình trên OpenStreetMap (Chặng 1/${effectiveLinks.length}) →`
              : 'Xem lịch trình trên OpenStreetMap →'}
          </a>
          {isMultiLeg && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {effectiveLinks.slice(1).map((leg) => (
                <a
                  key={leg.index}
                  href={leg.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`osm-directions-cta-${leg.index}`}
                  data-legacy-testid={`google-maps-cta-${leg.index}`}
                  className="nn-cta-btn"
                  style={{ flex: '1 1 140px', textAlign: 'center', background: '#3D3430', color: '#FFF' }}
                >
                  Mở {leg.label || `Chặng ${leg.index}/${leg.of}`} →
                </a>
              ))}
            </div>
          )}
          <p
            data-testid="osm-maps-disclosure"
            data-legacy-testid="google-maps-disclosure"
            className="nn-maps-disclosure"
          >
            Mở liên kết chỉ đường trên OpenStreetMap miễn phí. Tọa độ chỉ được chia sẻ với dịch vụ điều hướng khi bạn nhấn mở liên kết.{mapsUrlInfo?.disclosureNote ? ` ${mapsUrlInfo.disclosureNote}` : ''}
          </p>
        </div>
      )}

      {/* Per-leg fallback links for mobile / multi-stop tours */}
      {showClientLegFallback && legUrls.length > 0 && (
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
            Xem từng chặng riêng trên OpenStreetMap ({legUrls.length} chặng)
          </summary>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            <p style={{ margin: '0 0 6px 0', fontSize: 12, color: 'var(--nn-mute, #7A625A)', lineHeight: 1.4 }}>
              Bạn có thể bấm mở từng chặng:
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
                <span>Mở OpenStreetMap</span>
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
          Điều chỉnh điểm dừng
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="nn-ghost-pill"
          aria-label="Làm mới lịch trình"
        >
          Lên food tour mới
        </button>
      </div>
    </div>
  );
}
