'use client';

import React, { useState } from 'react';

const UNKNOWN_LABELS = {
  hours: 'giờ mở cửa',
  price_per_person: 'giá theo người',
  route: 'tuyến đường đi bộ',
  party_size: 'số lượng người',
  origin: 'điểm xuất phát',
  duration_min: 'thời lượng tour',
  budget_scope: 'phạm vi ngân sách',
};

/**
 * Collapsed EvidenceStrip for UI_V2 (Scope 3, F02).
 * Derives evidence and routing disclosures from actual tour evidence:
 * - provider routes vs straight-line estimates
 * - verified hours vs missing weekday schedule
 * - price range vs per-person bill
 * Zero raw developer field names in user-facing text.
 */
export default function EvidenceStrip({
  tour,
  className = '',
  style = {},
  initialExpanded = false,
}) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const unknowns = Array.isArray(tour?.unknowns) ? tour.unknowns : [];
  const stops = Array.isArray(tour?.stops) ? tour.stops : [];
  // Route evidence evaluation:
  // Reconcile canonical totals.leg_source AND every stop's leg_from_previous.source (including origin leg).
  // Provider route claims are allowed ONLY when total (if present) and ALL stop legs are 'provider_route',
  // and aggregate unknowns do not include 'route'.
  // Any explicit estimate/unknown source or disagreement => conservative fallback (never verified).
  // Ignore non-frozen tour.legs fallback for verification claims.
  const totalLegSource = tour?.totals?.leg_source;
  const totalIsPresent = totalLegSource != null && totalLegSource !== '';
  const totalIsProvider = totalLegSource === 'provider_route';
  const totalMatches = !totalIsPresent || totalIsProvider;

  const allStopsLegProvider =
    stops.length > 0 &&
    stops.every((s) => s?.leg_from_previous?.source === 'provider_route');

  const aggregateRouteUnknown = unknowns.includes('route');

  const hasProviderRoute =
    !aggregateRouteUnknown &&
    totalMatches &&
    allStopsLegProvider;

  const routeUnknown = !hasProviderRoute;

  // Hours evidence evaluation:
  // Never claim verified from object presence.
  // Must have verified status and open_at_arrival === true for all stops, and no 'hours' in tour.unknowns.
  // On any disagreement stay conservative (unknown).
  const allStopsHoursVerified =
    stops.length > 0 &&
    stops.every((s) => {
      const h = s?.hours;
      return Boolean(h && h.status === 'verified' && h.open_at_arrival === true);
    });

  const hoursUnknown = unknowns.includes('hours') || !allStopsHoursVerified;

  // Price evidence evaluation:
  // Must have verified per-person pricing for all stops, and no 'price_per_person' in tour.unknowns.
  // API evidence enum is verified|estimate|unknown, semantics is per_person|venue_range.
  // 'verified_exact' is NOT an API enum value.
  // On any disagreement stay conservative (unknown).
  const allStopsPriceVerified =
    stops.length > 0 &&
    stops.every((s) => {
      const evidence = s?.price?.evidence || s?.price_evidence;
      const semantics = s?.price?.semantics || s?.price_semantics;
      return evidence === 'verified' && semantics === 'per_person';
    });

  const priceUnknown = unknowns.includes('price_per_person') || !allStopsPriceVerified;

  const isVerified =
    tour?.status === 'verified_feasible' &&
    unknowns.length === 0 &&
    !hoursUnknown &&
    !priceUnknown &&
    hasProviderRoute;

  // Build human-friendly unknown list for the header
  const unknownTerms = [];
  if (hoursUnknown) unknownTerms.push('giờ mở cửa');
  if (priceUnknown) unknownTerms.push('giá theo người');
  if (!hasProviderRoute) {
    unknownTerms.push('tuyến đi thực tế');
  }

  // Fallback if none of the standard ones triggered but unknowns has items
  if (unknownTerms.length === 0 && unknowns.length > 0) {
    unknowns.forEach((u) => {
      if (UNKNOWN_LABELS[u] && !unknownTerms.includes(UNKNOWN_LABELS[u])) {
        unknownTerms.push(UNKNOWN_LABELS[u]);
      }
    });
  }

  const titleText = isVerified
    ? `Bằng chứng đầy đủ: ${hasProviderRoute ? 'tuyến đường thực tế' : 'lộ trình tối ưu'} · giờ mở cửa xác thực`
    : `Chưa chắc: ${unknownTerms.length > 0 ? unknownTerms.join(' · ') : 'giờ mở cửa · giá theo người'}`;

  const theme = isVerified
    ? {
        bg: '#EAF7EC',
        border: '#9ED4A7',
        textColor: '#195624',
        accentColor: '#166534',
        icon: '✅',
      }
    : {
        bg: '#FFFBEB',
        border: '#FDE68A',
        textColor: '#78350F',
        accentColor: '#92400E',
        icon: '⚠️',
      };

  return (
    <div
      data-evidence-strip
      className={`ft-evidence-strip ${className}`.trim()}
      style={{
        backgroundColor: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: 'var(--radius-md, 8px)',
        marginBottom: '16px',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Header button (Toggle) with min-height >= 44px */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded ? 'true' : 'false'}
        aria-controls="evidence-strip-details"
        style={{
          width: '100%',
          minHeight: '44px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: theme.textColor,
          fontSize: '13px',
          fontWeight: 600,
          textAlign: 'left',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{theme.icon}</span>
          <span>{titleText}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: theme.accentColor }}>
          <span>{isExpanded ? 'Thu gọn' : 'Xem chi tiết'}</span>
          <span style={{ fontSize: '14px', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            ▼
          </span>
        </div>
      </button>

      {/* Expanded detailed notes derived from tour evidence */}
      {isExpanded && (
        <div
          id="evidence-strip-details"
          style={{
            padding: '10px 14px 14px 14px',
            borderTop: `1px solid ${theme.border}`,
            backgroundColor: isVerified ? '#F4FBF5' : '#FEFDF8',
            fontSize: '13px',
            color: isVerified ? '#14532D' : '#451A03',
            lineHeight: 1.6,
          }}
        >
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li style={{ marginBottom: '6px' }}>
              <strong>Giờ mở cửa:</strong>{' '}
              {hoursUnknown
                ? 'Dữ liệu nguồn chưa có lịch chi tiết theo từng thứ trong tuần. Bạn nên liên hệ xác nhận với quán trước khi tới.'
                : 'Đã xác thực theo lịch hoạt động thực tế của từng quán trong hành trình.'}
            </li>
            <li style={{ marginBottom: '6px' }}>
              <strong>Khoảng giá:</strong>{' '}
              {priceUnknown
                ? 'Mức giá hiển thị là khoảng giá chung do quán công bố, không phải hoá đơn tính theo từng người.'
                : 'Mức giá và định mức chi tiêu đã được xác thực.'}
            </li>
            <li>
              <strong>Đường đi:</strong>{' '}
              {hasProviderRoute
                ? 'Tuyến đường và thời gian đi bộ thực tế được tính toán từ dịch vụ bản đồ số.'
                : 'Khoảng cách và thời gian di chuyển là ước tính đường chim bay nội bộ của hệ thống (chưa có tuyến thực tế).'}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
