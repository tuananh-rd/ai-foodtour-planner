'use client';

import React from 'react';
import Button from '../../ui/Button';

/**
 * One-line header for UI_V2 (<= 56px on mobile).
 * Strictly removes all developer jargon (CONTRACT, Mock, Explore, Conditional, raw revisions)
 * unless ?dev=1 is explicitly set in the URL (Scope 1).
 */
export default function V2Header({
  health,
  llmBudget,
  isDevMode = false,
  isMock = false,
  revision = 0,
  preferences,
  onResetSession,
  onToggleMockMode,
  busy = false,
}) {
  const budget = llmBudget || health?.llm_budget;

  return (
    <header
      className="ft-v2-header"
      style={{
        height: '52px',
        maxHeight: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        backgroundColor: 'var(--card-bg, #FFFFFF)',
        borderBottom: '1px solid var(--border, #DFD5C6)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxSizing: 'border-box',
      }}
    >
      {/* Left: App Logo & Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '20px', lineHeight: 1 }}>🍜</span>
        <span
          style={{
            fontSize: 'var(--type-16, 16px)',
            fontWeight: 700,
            color: 'var(--text, #1F1B16)',
            letterSpacing: '-0.01em',
          }}
        >
          FoodTour Hà Nội
        </span>

        {/* Developer controls ONLY with ?dev=1 */}
        {isDevMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: '#EFF6FF',
                color: '#1E40AF',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid #BFDBFE',
              }}
            >
              DEV CONTRACT V1.6 #{revision}
            </span>
            <button
              type="button"
              onClick={onToggleMockMode}
              disabled={busy}
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                minHeight: '28px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                background: isMock ? '#FEF3C7' : '#FFFFFF',
                color: isMock ? '#92400E' : '#4B5563',
                cursor: 'pointer',
              }}
            >
              {isMock ? 'Mock Mode' : 'Live Mode'}
            </button>
          </div>
        )}
      </div>

      {/* Right: AI budget status chip & Reset Action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* LLM Budget Chip (hide when null / undefined) */}
        {budget && typeof budget.limit === 'number' && (
          <div
            className="ft-tabular-nums"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: 500,
              padding: '4px 10px',
              borderRadius: '9999px',
              backgroundColor: budget.exhausted ? '#FEE2E2' : '#F0EAE1',
              color: budget.exhausted ? '#991B1B' : '#413C36',
              border: `1px solid ${budget.exhausted ? '#FCA5A5' : '#DFD5C6'}`,
            }}
            title={
              budget.exhausted
                ? 'AI hết lượt hôm nay, chuyển sang bộ luật cục bộ'
                : `Hạn mức AI: còn ${budget.remaining}/${budget.limit} lượt hôm nay (đặt lại vào nửa đêm giờ Thái Bình Dương)`
            }
          >
            <span>✨</span>
            <span>
              {budget.exhausted
                ? 'AI: Hết lượt'
                : `AI còn ${budget.remaining}/${budget.limit} lượt`}
            </span>
          </div>
        )}

        {/* New Session / Reset Button */}
        <button
          type="button"
          onClick={onResetSession}
          disabled={busy}
          aria-label="Tạo chuyến đi mới"
          style={{
            minHeight: '44px',
            minWidth: '44px',
            padding: '8px 12px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--border, #DFD5C6)',
            backgroundColor: 'transparent',
            color: 'var(--text, #1F1B16)',
            cursor: busy ? 'not-allowed' : 'pointer',
            gap: '4px',
          }}
          title="Bắt đầu lại chuyến đi mới"
        >
          <span>↺</span>
          <span className="hidden-mobile" style={{ fontSize: '13px' }}>
            Tạo mới
          </span>
        </button>
      </div>
    </header>
  );
}
