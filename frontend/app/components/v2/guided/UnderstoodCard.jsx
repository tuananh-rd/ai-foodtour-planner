'use client';

import React, { useState } from 'react';
import InlineRowEditor from './InlineRowEditor';

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
 * "Mình hiểu là…" card matching docs/ux/guided-flow-mockup.html
 * - Row-level "Sửa" / "Chọn" buttons
 * - Dị ứng row is ALWAYS visible
 * - Calm safety note below card
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
      style={{
        background: 'var(--card, #fff)',
        border: '1px solid var(--line, #e6dfd3)',
        borderRadius: 14,
        padding: '10px 14px',
        display: 'grid',
        gap: 2,
        margin: '4px 0'
      }}
    >
      <h3 style={{ margin: '0 0 2px 0', fontSize: 15, fontWeight: 700, color: 'var(--ink, #231f1a)' }}>
        Mình hiểu là…
      </h3>

      {/* Rows */}
      {displayRows.map((item, idx) => {
        const hasValue = item.value !== null && item.value !== undefined && item.value !== '';
        const isMissing = item.status === 'missing' || !hasValue;
        const isEditing = editingRowKey === item.id;

        return (
          <div key={item.id || idx}>
            <div
              data-testid={`understood-row-${item.id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                borderTop: idx > 0 ? '1px solid var(--line, #e6dfd3)' : 'none',
                paddingTop: idx > 0 ? 3 : 2,
                paddingBottom: 2,
                fontSize: 13
              }}
            >
              <b style={{ fontWeight: 600, color: 'var(--ink, #231f1a)' }}>{item.label}</b>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'right' }}>
                <span
                  style={{
                    color: isMissing ? 'var(--warn, #92400e)' : 'var(--ink, #231f1a)',
                    fontWeight: isMissing ? 600 : 400
                  }}
                >
                  {hasValue ? item.value : 'Chưa chọn'}
                </span>
                <button
                  type="button"
                  data-testid={`understood-edit-${item.id}`}
                  onClick={() => handleEditClick(item)}
                  style={{
                    color: 'var(--accent, #c2410c)',
                    background: 'none',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    minHeight: 28,
                    padding: '0 4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
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
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            borderTop: '1px solid var(--line, #e6dfd3)',
            paddingTop: 3,
            paddingBottom: 2,
            fontSize: 13
          }}
        >
          <b style={{ fontWeight: 600, color: 'var(--ink, #231f1a)' }}>Dị ứng</b>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'right' }}>
            {Array.isArray(allergies) && allergies.length > 0 ? (
              <span style={{ color: 'var(--ink, #231f1a)', display: 'inline-flex', alignItems: 'center' }}>
                {allergies.map((a) => (typeof a === 'string' ? a : a.term || a.family || 'dị ứng')).join(', ')}
                {allergies.some((a) => a && typeof a === 'object' && (a.status === 'ai_unconfirmed' || a.source === 'ai_unconfirmed')) && (
                  <span
                    data-testid="badge-ai-unconfirmed"
                    style={{
                      background: 'var(--warnbg, #fef3c7)',
                      color: 'var(--warn, #92400e)',
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
              <span style={{ color: 'var(--mute, #6b6257)' }}>Chưa có</span>
            )}
            <button
              type="button"
              data-testid="understood-edit-allergies"
              onClick={handleAllergyEditClick}
              style={{
                color: 'var(--accent, #c2410c)',
                background: 'none',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'underline',
                cursor: 'pointer',
                minHeight: 28,
                padding: '0 4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {Array.isArray(allergies) && allergies.length > 0 ? 'Sửa' : 'Chọn'}
            </button>
          </div>
        </div>
      )}

      {/* Calm Safety Note Below Understood Card */}
      <div
        data-testid="understood-safety-note"
        style={{
          background: 'var(--warnbg, #fef3c7)',
          color: 'var(--warn, #92400e)',
          borderRadius: 10,
          padding: '6px 10px',
          fontSize: 12,
          marginTop: 4,
          lineHeight: 1.35
        }}
      >
        Dữ liệu quán không có thông tin nguyên liệu; bạn hãy kiểm tra trực tiếp với quán khi đến.
      </div>
    </div>
  );
}
