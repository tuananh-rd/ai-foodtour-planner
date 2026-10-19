'use client';

import React from 'react';
import BlockRenderer from './BlockRenderer';

/**
 * ExploreColumn (Workspace Right Column, TASK C3-1)
 *
 * Requirements:
 * - Displays latest exploration content:
 *   - dish_suggestions
 *   - venue_cards
 *   - compare_table
 *   - confirm_summary
 *   - tour_ready (ItineraryView + MapsLinksBlock)
 * - Touch targets >= 44px
 */
function SearchGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: '#8C827A' }}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export default function ExploreColumn({
  latestExploreBlocks = [],
  onAction,
  shortlist = [],
  allergies = [],
  tour = null,
  sessionId = null,
  sessionToken = '',
  busy = false,
}) {
  const hasBlocks = latestExploreBlocks && latestExploreBlocks.length > 0;

  return (
    <div
      data-testid="zone-explore"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#FBF8F3',
        padding: '16px',
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        minWidth: 0,
        maxWidth: '100%',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1F1B16' }}>
          Khám phá quán ăn & So sánh
        </h3>
      </div>

      {!hasBlocks && !tour && (
        <div
          style={{
            padding: '40px 16px',
            textAlign: 'center',
            color: '#6B6259',
            fontSize: 13,
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px dashed #DFD5C6',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><SearchGlyph /></div>
          <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#1F1B16' }}>Chưa có thẻ quán nào</p>
          <p style={{ margin: 0 }}>
            Kết quả tìm kiếm, thẻ quán, bảng so sánh hoặc bản xác nhận lịch trình sẽ hiển thị ở đây.
          </p>
        </div>
      )}

      {/* Render latest explore blocks */}
      {latestExploreBlocks.map((block, idx) => (
        <BlockRenderer
          key={idx}
          block={block}
          onAction={onAction}
          shortlist={shortlist}
          allergies={allergies}
          tour={tour}
          sessionId={sessionId}
          sessionToken={sessionToken}
          busy={busy}
        />
      ))}
    </div>
  );
}
