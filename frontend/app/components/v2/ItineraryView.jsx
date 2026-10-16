'use client';

import React from 'react';
import EvidenceStrip from './EvidenceStrip';
import StopCard from './StopCard';
import Button from '../../ui/Button';
import MapsLinksBlock from './MapsLinksBlock';

/**
 * ItineraryView for UI_V2 (Scope 3).
 * Rendered FIRST in the viewport after planning.
 * Includes:
 * - Summary line: stops count, ~walk minutes, price range upper sum labelled as a range
 * - One collapsed EvidenceStrip
 * - Free Google Maps URLs (GMAPS-URL-2)
 * - Ordered StopCard list with connecting leg lines
 * - Action controls (View Map, Reset, Preferences)
 */
export default function ItineraryView({
  tour,
  sessionId = null,
  sessionToken = '',
  sessionEpoch = 0,
  revision = 0,
  originLabel = null,
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
  const walkMinutes = tour.totals?.walk_minutes;
  const walkText = typeof walkMinutes === 'number'
    ? `~${walkMinutes} phút đi bộ`
    : 'chưa rõ thời gian đi bộ';

  const upperSum = tour.totals?.venue_range_upper_sum_vnd;
  const priceText = typeof upperSum === 'number' && upperSum > 0
    ? `≤ ${upperSum.toLocaleString('vi-VN')} ₫ (khoảng giá quán)`
    : 'chưa rõ khoảng giá quán';

  return (
    <section
      data-itinerary-view
      className={`ft-itinerary-view ${className}`.trim()}
      aria-label="Hành trình ẩm thực của bạn"
      style={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
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
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        <div style={{ minWidth: 0, maxWidth: '100%', flex: '1 1 auto' }}>
          <h3
            style={{
              fontSize: 'var(--type-18, 18px)',
              fontWeight: 700,
              color: 'var(--text, #1F1B16)',
              margin: '0 0 4px 0',
              minWidth: 0,
              maxWidth: '100%',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
            Hành trình của bạn
          </h3>
          <div
            data-itinerary-summary
            className="ft-tabular-nums"
            style={{
              fontSize: '13px',
              color: 'var(--muted, #6B6259)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              alignItems: 'center',
              minWidth: 0,
              maxWidth: '100%',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
            <span style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{stopsCount} quán</span>
            <span>·</span>
            <span style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{walkText}</span>
            <span>·</span>
            <span style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{priceText}</span>
          </div>
        </div>

        {/* Secondary Map & Action triggers */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
          {onOpenMap && (
            <Button
              variant="secondary"
              onClick={onOpenMap}
              style={{ minHeight: '44px', padding: '8px 14px', fontSize: '13px', minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'normal' }}
            >
              📍 Xem bản đồ
            </Button>
          )}
          {onOpenPreferences && (
            <Button
              variant="ghost"
              onClick={onOpenPreferences}
              style={{ minHeight: '44px', padding: '8px 12px', fontSize: '13px', minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'normal' }}
            >
              ⚙️ Tuỳ chọn
            </Button>
          )}
        </div>
      </div>

      {/* ONE collapsed EvidenceStrip */}
      <EvidenceStrip tour={tour} />

      {/* Free Google Maps URLs Itinerary Block (Contract v1.7, GMAPS-URL-2) */}
      <MapsLinksBlock
        tour={tour}
        sessionId={sessionId}
        sessionToken={sessionToken}
        sessionEpoch={sessionEpoch}
        revision={revision}
        originLabel={originLabel}
      />

      {/* List of StopCards */}
      <div data-stops-list style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
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
