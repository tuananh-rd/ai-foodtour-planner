'use client';

import React from 'react';
import EvidenceStrip from './EvidenceStrip';
import StopCard from './StopCard';
import Button from '../../ui/Button';

/**
 * ItineraryView for UI_V2 (Scope 3).
 * Rendered FIRST in the viewport after planning.
 * Includes:
 * - Summary line: stops count, ~walk minutes, price range upper sum labelled as a range
 * - One collapsed EvidenceStrip
 * - Ordered StopCard list with connecting leg lines
 * - Action controls (View Map, Reset, Preferences)
 */
export default function ItineraryView({
  tour,
  lockedIds = [],
  onInitiateReplace,
  onResetTour,
  onOpenPreferences,
  onOpenMap,
  busy = false,
  className = '',
  style = {},
}) {
  if (!tour || !tour.stops || tour.stops.length === 0) {
    return null;
  }

  const stops = tour.stops;
  const stopsCount = stops.length;
  const walkMinutes = tour.totals?.walk_minutes || 0;
  const upperSum = tour.totals?.venue_range_upper_sum_vnd || 0;
  const upperSumFormatted = upperSum > 0 ? `${upperSum.toLocaleString('vi-VN')} ₫` : 'chưa rõ';

  return (
    <section
      data-itinerary-view
      className={`ft-itinerary-view ${className}`.trim()}
      aria-label="Hành trình ẩm thực của bạn"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {/* Summary Header Line */}
      <div
        data-itinerary-summary
        style={{
          backgroundColor: 'var(--card-bg, #FFFFFF)',
          border: '1px solid var(--border, #DFD5C6)',
          borderRadius: 'var(--radius-lg, 12px)',
          padding: '14px 16px',
          marginBottom: '14px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(31, 27, 22, 0.08))',
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 'var(--type-18, 18px)',
              fontWeight: 700,
              color: 'var(--text, #1F1B16)',
              margin: '0 0 4px 0',
            }}
          >
            Hành trình của bạn
          </h3>
          <div
            className="ft-tabular-nums"
            style={{
              fontSize: '13px',
              color: 'var(--muted, #6B6259)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              alignItems: 'center',
            }}
          >
            <span>{stopsCount} quán</span>
            <span>·</span>
            <span>~{walkMinutes} phút đi bộ</span>
            <span>·</span>
            <span>≤ {upperSumFormatted} (khoảng giá quán)</span>
          </div>
        </div>

        {/* Secondary Map & Action triggers */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {onOpenMap && (
            <Button
              variant="secondary"
              onClick={onOpenMap}
              style={{ minHeight: '44px', padding: '8px 14px', fontSize: '13px' }}
            >
              📍 Xem bản đồ
            </Button>
          )}
          {onOpenPreferences && (
            <Button
              variant="ghost"
              onClick={onOpenPreferences}
              style={{ minHeight: '44px', padding: '8px 12px', fontSize: '13px' }}
            >
              ⚙️ Tuỳ chọn
            </Button>
          )}
        </div>
      </div>

      {/* ONE collapsed EvidenceStrip */}
      <EvidenceStrip tour={tour} />

      {/* List of StopCards */}
      <div data-stops-list style={{ width: '100%' }}>
        {stops.map((stop, idx) => (
          <StopCard
            key={stop.venue_id || idx}
            stop={stop}
            index={idx}
            totalStops={stopsCount}
            isLocked={lockedIds.includes(stop.venue_id)}
            onInitiateReplace={onInitiateReplace}
            busy={busy}
          />
        ))}
      </div>
    </section>
  );
}
