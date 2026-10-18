'use client';

import React, { useState } from 'react';
import InlineRowEditor from './InlineRowEditor';
import './guided-leaves.css';

const WHITELISTED_INLINE_FIELDS = [
  'party',
  'party_size',
  'budget',
  'duration',
  'time',
  'vehicle',
  'stops',
  'audience',
  'max_leg_min'
];

/**
 * UnderstoodCard
 * "Mình hiểu là…" card conforming to SVG fidelity spec (owner: Antigravity)
 * - Mint assistant bubble style (--nn-mint, r16, padding 16, text 16/1.45, max-width 410)
 * - Clean row layout: label 13 mute left, value 15/600 right, 1px line separators
 * - "Sửa" / "Chọn" buttons with min-height 44px hit area
 * - Dị ứng row is ALWAYS visible
 * - Calm safety note on peach background (--nn-peach)
 * - Preserves ALL testids, handlers, and inline/freeform edit triggers
 */
export default function UnderstoodCard({
  items = [],
  allergies = [],
  onInlineSave,
  onFreeFormEdit
}) {
  const [editingRowKey, setEditingRowKey] = useState(null);

  // Intentional mutation hook: alwaysShowAllergy defaults to true
  const alwaysShowAllergy = true;

  // Build items map
  const itemsMap = {};
  if (Array.isArray(items)) {
    items.forEach((item) => {
      if (item && item.id) {
        itemsMap[item.id] = item;
      }
    });
  }

  // Canonical rows list to display
  const canonicalOrder = [
    { id: 'area', label: 'Khu vực' },
    { id: 'party', label: 'Số người' },
    { id: 'stops', label: 'Số quán' },
    { id: 'duration', label: 'Tổng thời gian' },
    { id: 'day_part', label: 'Buổi' },
    { id: 'time', label: 'Bắt đầu lúc' },
    { id: 'budget', label: 'Ngân sách' },
    { id: 'dish', label: 'Thích' }
  ];

  // Merge items from props with canonical order
  const displayRows = canonicalOrder.map((c) => {
    const fromProps = itemsMap[c.id];
    if (fromProps && fromProps.value !== null && fromProps.value !== undefined && fromProps.value !== '') {
      return fromProps;
    }
    return {
      id: c.id,
      label: c.label,
      value: null,
      status: 'missing',
      editable: true
    };
  });

  // Include any extra items passed in props (e.g. visit_min, vehicle)
  if (Array.isArray(items)) {
    const canonicalIds = new Set(canonicalOrder.map((c) => c.id));
    items.forEach((item) => {
      if (item && item.id && !canonicalIds.has(item.id) && item.value !== null && item.value !== undefined && item.value !== '') {
        displayRows.push(item);
      }
    });
  }

  // Handle Edit Click
  const handleEditClick = (item) => {
    const isWhitelisted = WHITELISTED_INLINE_FIELDS.includes(item.id);
    if (isWhitelisted) {
      setEditingRowKey(editingRowKey === item.id ? null : item.id);
    } else {
      setEditingRowKey(null);
      onFreeFormEdit && onFreeFormEdit(item);
    }
  };

  const handleAllergyEditClick = () => {
    setEditingRowKey(null);
    onFreeFormEdit && onFreeFormEdit({ id: 'allergies', label: 'Dị ứng' });
  };

  return (
    <div
      data-testid="understood-card"
      role="group"
      aria-label="Mình hiểu là"
      className="nn-assistant-bubble"
      style={{ margin: '4px 0' }}
    >
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--nn-ink, #17352B)', lineHeight: 1.3 }}>
        Mình hiểu là…
      </h3>

      {/* Rows List */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {displayRows.map((item, idx) => {
          const hasValue = item.value !== null && item.value !== undefined && item.value !== '';
          const isMissing = item.status === 'missing' || !hasValue;
          const isEditing = editingRowKey === item.id;

          return (
            <div key={item.id || idx}>
              <div
                data-testid={`understood-row-${item.id}`}
                className="nn-row-item"
              >
                <span className="nn-row-label">
                  {item.label}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'right' }}>
                  <span
                    className="nn-row-val"
                    style={{
                      color: isMissing ? 'var(--nn-warn-ink, #8A4B12)' : 'var(--nn-ink, #17352B)',
                      fontWeight: isMissing ? 600 : 500
                    }}
                  >
                    {hasValue ? (
                      <>
                        {item.value}
                        {item.status === 'default' && <span style={{ fontSize: 11, color: 'var(--nn-mute, #62736D)', marginLeft: 4 }}>(mặc định)</span>}
                        {item.status === 'inferred' && <span style={{ fontSize: 11, color: 'var(--nn-mute, #62736D)', marginLeft: 4 }}>(suy luận)</span>}
                      </>
                    ) : 'Chưa chọn'}
                  </span>

                  <button
                    type="button"
                    data-testid={`understood-edit-${item.id}`}
                    onClick={() => handleEditClick(item)}
                    className="nn-row-action"
                  >
                    {isMissing ? 'Chọn' : 'Sửa'}
                  </button>
                </div>
              </div>

              {/* Inline Editor if open for this row */}
              {isEditing && (
                <InlineRowEditor
                  itemKey={item.id}
                  currentValue={item.value}
                  onSave={(k, val) => {
                    setEditingRowKey(null);
                    onInlineSave && onInlineSave(k, val);
                  }}
                  onCancel={() => setEditingRowKey(null)}
                />
              )}
            </div>
          );
        })}

        {/* Dị ứng row is ALWAYS visible */}
        {alwaysShowAllergy && (
          <div
            data-testid="understood-row-allergies"
            className="nn-row-item"
            style={{ borderBottom: 'none' }}
          >
            <span className="nn-row-label">Dị ứng</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'right' }}>
              {Array.isArray(allergies) && allergies.length > 0 ? (
                <span className="nn-row-val" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {allergies.map((a) => (typeof a === 'string' ? a : a.term || a.family || 'dị ứng')).join(', ')}
                  {allergies.some((a) => a && typeof a === 'object' && (a.status === 'ai_unconfirmed' || a.source === 'ai_unconfirmed')) && (
                    <span
                      data-testid="badge-ai-unconfirmed"
                      style={{
                        background: 'var(--nn-warn-bg, #FFF6EC)',
                        color: 'var(--nn-warn-ink, #8A4B12)',
                        border: '1px solid var(--nn-warn-line, #F1D9B8)',
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 12,
                        marginLeft: 6,
                        fontWeight: 600
                      }}
                    >
                      cần xác nhận
                    </span>
                  )}
                </span>
              ) : (
                <span className="nn-row-val" style={{ color: 'var(--nn-mute, #62736D)', fontWeight: 400 }}>
                  Chưa có
                </span>
              )}

              <button
                type="button"
                data-testid="understood-edit-allergies"
                onClick={handleAllergyEditClick}
                className="nn-row-action"
              >
                {Array.isArray(allergies) && allergies.length > 0 ? 'Sửa' : 'Chọn'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Calm Safety Note Below Understood Card on Peach */}
      <div
        data-testid="understood-safety-note"
        className="nn-peach-box"
        style={{ marginTop: 2, fontSize: 12 }}
      >
        Dữ liệu quán không có thông tin nguyên liệu; bạn hãy kiểm tra trực tiếp với quán khi đến.
      </div>
    </div>
  );
}
