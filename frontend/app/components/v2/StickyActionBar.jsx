'use client';

import React from 'react';
import Button from '../../ui/Button';

/**
 * Mobile Sticky Bottom Action Bar for UI_V2 (Scope 5).
 * Positioned sticky at bottom of viewport (< 600px).
 * Touch targets guaranteed >= 44px.
 */
export default function StickyActionBar({
  hasTour = false,
  onPlanTour,
  onResetTour,
  onOpenPreferences,
  onOpenMap,
  busy = false,
  className = '',
  style = {},
}) {
  return (
    <div
      data-sticky-bottom-bar
      className={`ft-sticky-action-bar ${className}`.trim()}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'var(--card-bg, #FFFFFF)',
        borderTop: '1px solid var(--border, #DFD5C6)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: '8px',
        zIndex: 40,
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.08)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {!hasTour ? (
        <>
          <Button
            variant="primary"
            onClick={onPlanTour}
            disabled={busy}
            loading={busy}
            style={{ flex: 2, minHeight: '44px', fontWeight: 700 }}
          >
            {busy ? 'Đang tạo…' : 'Lập hành trình ▸'}
          </Button>
          <Button
            variant="secondary"
            onClick={onOpenPreferences}
            disabled={busy}
            style={{ flex: 1, minHeight: '44px' }}
          >
            Tuỳ chọn
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="primary"
            onClick={onOpenMap}
            style={{ flex: 1.5, minHeight: '44px', fontWeight: 700 }}
          >
            Xem bản đồ
          </Button>
          <Button
            variant="secondary"
            onClick={onOpenPreferences}
            disabled={busy}
            style={{ flex: 1, minHeight: '44px' }}
          >
            Tuỳ chọn
          </Button>
          <Button
            variant="ghost"
            onClick={onResetTour}
            disabled={busy}
            style={{ flex: 1, minHeight: '44px' }}
          >
            ↺ Làm lại
          </Button>
        </>
      )}
    </div>
  );
}
