'use client';

import React from 'react';
import Button from '../../ui/Button';
import { normalizeDisplayText } from '../../../lib/emojiSanitizer';

/**
 * StopCard for UI_V2 (Scope 3).
 * Renders:
 * - Order index badge
 * - Venue name & district
 * - Rating line strictly from venue.rating (value + count, labelled 'theo nguồn'; count < 5 -> 'ít đánh giá', score hidden)
 * - why[] reasons as chips/lines
 * - Price as a RANGE chip (never per-person unless verified)
 * - Hours chip (unknown -> 'Giờ: chưa rõ'; hours_display -> 'nguồn ghi …, chưa rõ áp dụng ngày nào')
 * - Leg line 'ước tính ~N phút'
 * - 'Đổi quán' button and locked badge
 */
function StarGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function WalkGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="2" />
      <path d="m9 20 3-6 3 2v4" />
      <path d="m6 10 4-1 2 3 3-1" />
    </svg>
  );
}

function PinGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function LightGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
    </svg>
  );
}

function PriceGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export default function StopCard({
  stop,
  index,
  totalStops,
  isLocked = false,
  onInitiateReplace,
  busy = false,
  className = '',
  style = {},
}) {
  const venue = stop.venue || {};
  const rating = venue.rating || stop.rating;
  const whyReasons = stop.why || [];

  // Leg info
  const leg = stop.leg_from_previous || {};
  const legMinutes = leg.minutes != null ? leg.minutes : null;
  const legKm = leg.km != null ? leg.km : null;

  // Rating presentation
  // Spec: rating line ONLY from venue.rating (value + count, labelled 'theo nguồn'; hide when count < 5 -> 'ít đánh giá')
  let ratingDisplay = null;
  const ratingVal = rating ? (rating.value != null ? rating.value : rating.score) : null;
  if (rating && typeof rating.count === 'number' && rating.count >= 5 && ratingVal != null) {
    const formattedScore = Number(ratingVal).toFixed(1).replace('.', ',');
    const formattedCount = rating.count >= 1000 ? `${(rating.count / 1000).toFixed(1).replace('.', ',')}k` : rating.count;
    ratingDisplay = (
      <span data-venue-rating className="ft-tabular-nums" style={{ color: '#D97706', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
        <StarGlyph /> {formattedScore} <span style={{ color: 'var(--muted, #6B6259)', fontWeight: 400 }}>({formattedCount} đánh giá theo nguồn)</span>
      </span>
    );
  } else {
    ratingDisplay = (
      <span data-venue-rating style={{ color: 'var(--muted, #6B6259)', fontStyle: 'italic', fontSize: '12px' }}>
        Ít đánh giá theo nguồn
      </span>
    );
  }

  // Price presentation
  // Spec: price as a RANGE chip (never per-person unless semantics per_person+verified)
  const price = stop.price || {};
  const isVerifiedPerPerson = price.semantics === 'per_person' && price.evidence === 'verified';
  let priceText = 'Giá: chưa rõ';
  if (price.min_vnd && price.max_vnd) {
    const minK = Math.round(price.min_vnd / 1000);
    const maxK = Math.round(price.max_vnd / 1000);
    priceText = isVerifiedPerPerson
      ? `${minK}k–${maxK}k/người (xác minh)`
      : `≈ ${minK}k–${maxK}k (khoảng giá quán)`;
  } else if (price.max_vnd) {
    const maxK = Math.round(price.max_vnd / 1000);
    priceText = isVerifiedPerPerson
      ? `≤ ${maxK}k/người (xác minh)`
      : `≤ ${maxK}k (khoảng giá quán)`;
  }

  // Hours presentation
  // Spec: hours chip (unknown -> 'Giờ: chưa rõ'; show hours_display only as 'nguồn ghi …, chưa rõ áp dụng ngày nào')
  const hours = stop.hours || {};
  let hoursText = 'Giờ: chưa rõ';
  if (hours.display) {
    hoursText = `Nguồn ghi ${hours.display}, chưa rõ áp dụng ngày nào`;
  }

  return (
    <div
      data-stop-card
      data-testid="stop-card"
      className={`ft-stop-card ${className}`.trim()}
      style={{
        backgroundColor: 'var(--card-bg, #FFFFFF)',
        border: '1px solid var(--border, #DFD5C6)',
        borderRadius: 'var(--radius-lg, 12px)',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(31, 27, 22, 0.08))',
        position: 'relative',
        boxSizing: 'border-box',
        minWidth: 0,
        maxWidth: '100%',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        ...style,
      }}
    >
      {/* Leg line from previous stop (when index > 0 or origin leg exists) */}
      {legMinutes != null && (
        <div
          data-leg-line
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--muted, #6B6259)',
            marginBottom: '10px',
            backgroundColor: '#F8F6F0',
            padding: '4px 10px',
            borderRadius: 'var(--radius-full, 9999px)',
            border: '1px solid var(--border, #DFD5C6)',
            minWidth: 0,
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            whiteSpace: 'normal',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}><WalkGlyph /></span>
          <span style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {index === 0 ? 'Từ điểm xuất phát: ' : ''}
            Ước tính ~{legMinutes} phút {legKm ? `(${legKm} km)` : ''}
          </span>
        </div>
      )}

      {/* Main Stop Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', minWidth: 0, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: '1 1 auto', minWidth: 0, maxWidth: '100%' }}>
          {/* Order Badge */}
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent, #C8431A)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 700,
              flexShrink: 0,
              marginTop: '2px',
            }}
          >
            {stop.order || index + 1}
          </div>

          {/* Name & District & Rating */}
          <div style={{ flex: '1 1 auto', minWidth: 0, maxWidth: '100%' }}>
            <h4
              style={{
                fontSize: 'var(--type-16, 16px)',
                fontWeight: 700,
                color: 'var(--text, #1F1B16)',
                margin: '0 0 4px 0',
                lineHeight: 1.3,
                minWidth: 0,
                maxWidth: '100%',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              {normalizeDisplayText(stop.name)}
            </h4>
            <div style={{ fontSize: '13px', color: 'var(--muted, #6B6259)', marginBottom: '4px', minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {stop.district ? `${normalizeDisplayText(stop.district)} · ` : ''}
              {ratingDisplay}
            </div>
            {stop.address && (
              <div style={{ fontSize: '12px', color: 'var(--muted, #6B6259)', marginBottom: '8px', minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <PinGlyph /> {normalizeDisplayText(stop.address)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Locked badge or Replace Button */}
        <div style={{ flexShrink: 0, maxWidth: '100%' }}>
          {isLocked ? (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 'var(--radius-full, 9999px)',
                backgroundColor: '#F3F4F6',
                color: '#4B5563',
                border: '1px solid #D1D5DB',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              <LockGlyph /> Giữ nguyên
            </span>
          ) : (
            <Button
              variant="secondary"
              data-replace-button
              onClick={() => onInitiateReplace && onInitiateReplace(stop, stop?.order || index + 1)}
              disabled={busy}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                minHeight: '44px',
                fontWeight: 600,
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                minWidth: 0,
                maxWidth: '100%',
              }}
            >
              Đổi quán
            </Button>
          )}
        </div>
      </div>

      {/* Why reasons chips */}
      {whyReasons.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0', minWidth: 0, maxWidth: '100%' }}>
          {whyReasons.map((why, wIdx) => (
            <span
              key={wIdx}
              data-why-chip
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: '#F0F9FF',
                color: '#0369A1',
                border: '1px solid #BAE6FD',
                borderRadius: 'var(--radius-sm, 6px)',
                padding: '3px 8px',
                lineHeight: 1.3,
                minWidth: 0,
                maxWidth: '100%',
                boxSizing: 'border-box',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                whiteSpace: 'normal',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}><LightGlyph /></span>
              <span style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{why.text}</span>
            </span>
          ))}
        </div>
      )}

      {/* Price and Hours Info Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px', minWidth: 0, maxWidth: '100%' }}>
        {/* Price range chip */}
        <span
          data-price-chip
          className="ft-tabular-nums"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            fontWeight: 500,
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm, 6px)',
            backgroundColor: '#FFF7ED',
            color: '#9A3412',
            border: '1px solid #FED7AA',
            minWidth: 0,
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            whiteSpace: 'normal',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}><PriceGlyph /></span>
          <span style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{priceText}</span>
        </span>

        {/* Hours chip */}
        <span
          data-hours-chip
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            fontWeight: 500,
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm, 6px)',
            backgroundColor: '#F9FAFB',
            color: '#4B5563',
            border: '1px solid #E5E7EB',
            minWidth: 0,
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            whiteSpace: 'normal',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}><ClockGlyph /></span>
          <span style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{hoursText}</span>
        </span>
      </div>
    </div>
  );
}
