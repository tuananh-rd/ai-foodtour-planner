'use client';

import React from 'react';

/**
 * ShortlistColumn (Workspace Middle Column, TASK C3-1)
 *
 * Requirements:
 * - Title: 'Danh sách food tour'
 * - Count badge: n/5 (e.g. 1/5)
 * - Items with 'Giữ' / 'Bỏ' buttons
 * - 'Xác nhận và tạo lịch trình' button enabled ONLY with >= 1 item,
 *   disabled when 0 items, sends action request_plan
 * - In-flight guard
 * - Min 44px touch targets
 */
export default function ShortlistColumn({
  shortlist = [],
  venuesMap = {},
  onAction,
  busy = false,
}) {
  const count = shortlist.length;
  const canPlan = count >= 1 && !busy;

  return (
    <div
      data-testid="zone-shortlist"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#FFFFFF',
        borderRight: '1px solid #DFD5C6',
        padding: '16px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1F1B16' }}>
          Danh sách food tour
        </h3>
        <span
          data-testid="shortlist-count-badge"
          style={{
            fontSize: 12,
            fontWeight: 700,
            background: count > 0 ? '#EAF7EC' : '#F0EAE1',
            color: count > 0 ? '#195624' : '#6B6259',
            border: `1px solid ${count > 0 ? '#9ED4A7' : '#DFD5C6'}`,
            padding: '3px 8px',
            borderRadius: 12,
          }}
        >
          {count}/5
        </span>
      </div>

      {/* Items List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {count === 0 && (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: '#6B6259',
              fontSize: 13,
              background: '#FBF8F3',
              borderRadius: 12,
              border: '1px dashed #DFD5C6',
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>🥣</div>
            <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#1F1B16' }}>Chưa có quán nào</p>
            <p style={{ margin: 0 }}>
              Hãy tìm quán ở khung Trò chuyện hoặc Khám phá rồi bấm <strong>"Thêm vào food tour"</strong>.
            </p>
          </div>
        )}

        {shortlist.map((item, idx) => {
          const v = venuesMap[item.venue_id] || { id: item.venue_id, name: item.name || `Quán ${item.venue_id}` };
          const isKept = item.status === 'kept';

          return (
            <div
              key={item.venue_id || idx}
              data-testid="shortlist-item"
              style={{
                background: '#FFFFFF',
                border: isKept ? '2px solid #195624' : '1px solid #DFD5C6',
                borderRadius: 10,
                padding: '10px 12px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong style={{ fontSize: 14, color: '#1F1B16' }}>
                  {v.name}
                </strong>
                {isKept && (
                  <span style={{ fontSize: 11, color: '#195624', fontWeight: 700, background: '#EAF7EC', padding: '1px 6px', borderRadius: 4 }}>
                    Đã giữ
                  </span>
                )}
              </div>

              {v.district && (
                <div style={{ fontSize: 12, color: '#6B6259', marginBottom: 8 }}>
                  📍 {v.district}
                </div>
              )}

              {/* Action Buttons >= 44px */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAction && onAction({ type: 'keep', venue_id: item.venue_id })}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid #DFD5C6',
                    background: isKept ? '#EAF7EC' : '#FFFFFF',
                    color: isKept ? '#195624' : '#1F1B16',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isKept ? '✓ Giữ' : 'Giữ'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAction && onAction({ type: 'remove', venue_id: item.venue_id })}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid #DFD5C6',
                    background: '#FFFFFF',
                    color: '#991B1B',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Bỏ
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Plan Button at Bottom (Enabled ONLY with >= 1 item) */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #DFD5C6' }}>
        <button
          type="button"
          disabled={!canPlan}
          data-testid="btn-request-plan"
          onClick={() => onAction && onAction({ type: 'request_plan' })}
          style={{
            width: '100%',
            minHeight: 48,
            padding: '12px 16px',
            borderRadius: 10,
            border: 'none',
            background: canPlan ? '#C8431A' : '#E5E7EB',
            color: canPlan ? '#FFFFFF' : '#9CA3AF',
            fontWeight: 700,
            fontSize: 14,
            cursor: canPlan ? 'pointer' : 'not-allowed',
            boxShadow: canPlan ? '0 2px 6px rgba(200,67,26,0.3)' : 'none',
          }}
        >
          {busy ? 'Đang xử lý…' : 'Xác nhận và tạo lịch trình'}
        </button>
      </div>
    </div>
  );
}
