'use client';

import React, { useState, useEffect } from 'react';

/**
 * InlineRowEditor
 * Provides clean inline controls to edit whitelisted profile fields.
 * Dispatches onSave(key, value) or onCancel().
 */
export default function InlineRowEditor({ itemKey, currentValue, onSave, onCancel }) {
  // Normalize key
  const normalizedKey = itemKey === 'party' ? 'party_size' : itemKey;

  const [val, setVal] = useState(() => {
    if (normalizedKey === 'party_size') {
      const parsed = parseInt(currentValue, 10);
      return !isNaN(parsed) && parsed > 0 ? parsed : 2;
    }
    if (normalizedKey === 'duration') {
      const parsed = parseInt(currentValue, 10);
      return !isNaN(parsed) && parsed > 0 ? parsed : 120;
    }
    if (normalizedKey === 'stops') {
      const parsed = parseInt(currentValue, 10);
      return !isNaN(parsed) && parsed > 0 ? parsed : 3;
    }
    return currentValue || '';
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel && onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleSave = () => {
    let finalVal = val;
    if (normalizedKey === 'party_size' || normalizedKey === 'duration' || normalizedKey === 'stops') {
      finalVal = Number(val);
    }
    onSave && onSave(normalizedKey, finalVal);
  };

  return (
    <div
      data-testid={`inline-editor-${itemKey}`}
      style={{
        marginTop: 8,
        padding: '10px 12px',
        background: 'var(--chip, #f3ece0)',
        borderRadius: 8,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        fontSize: 14
      }}
    >
      {/* Stepper for party_size (>=44px touch targets for mobile accessibility Q07) */}
      {normalizedKey === 'party_size' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            data-testid="inline-stepper-minus"
            onClick={() => setVal((prev) => Math.max(1, Number(prev) - 1))}
            style={{
              width: 44,
              height: 44,
              minWidth: 44,
              minHeight: 44,
              borderRadius: '50%',
              border: '1px solid var(--line, #e6dfd3)',
              background: '#fff',
              fontSize: 20,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            aria-label="Giảm số người"
          >
            -
          </button>
          <span
            data-testid="inline-stepper-value"
            style={{ fontWeight: 700, minWidth: 32, textAlign: 'center', fontSize: 16 }}
          >
            {val}
          </span>
          <span style={{ color: 'var(--mute, #6b6257)' }}>người</span>
          <button
            type="button"
            data-testid="inline-stepper-plus"
            onClick={() => setVal((prev) => Math.min(20, Number(prev) + 1))}
            style={{
              width: 44,
              height: 44,
              minWidth: 44,
              minHeight: 44,
              borderRadius: '50%',
              border: '1px solid var(--line, #e6dfd3)',
              background: '#fff',
              fontSize: 20,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            aria-label="Tăng số người"
          >
            +
          </button>
        </div>
      )}

      {/* Presets for duration */}
      {normalizedKey === 'duration' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[60, 90, 120, 180].map((mins) => (
            <button
              key={mins}
              type="button"
              onClick={() => setVal(mins)}
              style={{
                padding: '6px 12px',
                borderRadius: 16,
                border: Number(val) === mins ? '2px solid var(--accent, #c2410c)' : '1px solid var(--line, #e6dfd3)',
                background: Number(val) === mins ? '#fff' : 'transparent',
                fontWeight: Number(val) === mins ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              {mins} phút
            </button>
          ))}
        </div>
      )}

      {/* Presets for stops */}
      {normalizedKey === 'stops' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setVal(s)}
              style={{
                padding: '6px 12px',
                borderRadius: 16,
                border: Number(val) === s ? '2px solid var(--accent, #c2410c)' : '1px solid var(--line, #e6dfd3)',
                background: Number(val) === s ? '#fff' : 'transparent',
                fontWeight: Number(val) === s ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              {s} quán
            </button>
          ))}
        </div>
      )}

      {/* Presets for budget */}
      {normalizedKey === 'budget' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { label: '200k', value: 200000 },
            { label: '300k', value: 300000 },
            { label: '500k', value: 500000 },
            { label: '1 triệu', value: 1000000 }
          ].map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => setVal(b.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 16,
                border: Number(val) === b.value ? '2px solid var(--accent, #c2410c)' : '1px solid var(--line, #e6dfd3)',
                background: Number(val) === b.value ? '#fff' : 'transparent',
                fontWeight: Number(val) === b.value ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {/* Presets for time */}
      {normalizedKey === 'time' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['18:00', '18:30', '19:00', '19:30', '20:00'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setVal(t)}
              style={{
                padding: '6px 12px',
                borderRadius: 16,
                border: val === t ? '2px solid var(--accent, #c2410c)' : '1px solid var(--line, #e6dfd3)',
                background: val === t ? '#fff' : 'transparent',
                fontWeight: val === t ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Presets for vehicle */}
      {normalizedKey === 'vehicle' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { label: 'Đi bộ', id: 'walk' },
            { label: 'Xe máy', id: 'motorcycle' },
            { label: 'Ô tô / taxi', id: 'car' }
          ].map((veh) => (
            <button
              key={veh.id}
              type="button"
              onClick={() => setVal(veh.id)}
              style={{
                padding: '6px 12px',
                borderRadius: 16,
                border: val === veh.id ? '2px solid var(--accent, #c2410c)' : '1px solid var(--line, #e6dfd3)',
                background: val === veh.id ? '#fff' : 'transparent',
                fontWeight: val === veh.id ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              {veh.label}
            </button>
          ))}
        </div>
      )}

      {/* Action Buttons: Lưu & Huỷ (>=44px min touch target) */}
      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
        <button
          type="button"
          data-testid="inline-edit-save"
          onClick={handleSave}
          style={{
            minHeight: 44,
            padding: '0 16px',
            background: 'var(--accent, #c2410c)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          Lưu
        </button>
        <button
          type="button"
          data-testid="inline-edit-cancel"
          onClick={onCancel}
          style={{
            minHeight: 44,
            padding: '0 14px',
            background: 'transparent',
            border: '1px solid var(--line, #e6dfd3)',
            color: 'var(--ink, #231f1a)',
            borderRadius: 8,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          Huỷ
        </button>
      </div>
    </div>
  );
}
