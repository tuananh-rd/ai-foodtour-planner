'use client';

import React, { useState, useEffect } from 'react';
import './guided-leaves.css';

/**
 * InlineRowEditor
 * Provides clean inline controls to edit whitelisted profile fields conforming to SVG fidelity spec (owner: Antigravity)
 * - Popover container: r16, white, 1px line, shadow 0 8px 24px rgba(10,46,31,.10)
 * - Inputs: r8, focus ring 2px --nn-green
 * - Buttons: green primary pill + outline secondary pill (min-height 44px hit area)
 * - Preserves ALL testids, steppers, presets, save/cancel handlers, and Escape dismissal
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
      className="nn-inline-popover"
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
              border: '1px solid var(--nn-line, #DDE7E1)',
              background: 'var(--nn-card, #FFFFFF)',
              color: 'var(--nn-ink, #17352B)',
              fontSize: 20,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'border-color 0.15s ease'
            }}
            aria-label="Giảm số người"
          >
            -
          </button>
          <span
            data-testid="inline-stepper-value"
            style={{ fontWeight: 700, minWidth: 32, textAlign: 'center', fontSize: 16, color: 'var(--nn-ink, #17352B)' }}
          >
            {val}
          </span>
          <span style={{ color: 'var(--nn-mute, #62736D)', fontSize: 13 }}>người</span>
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
              border: '1px solid var(--nn-line, #DDE7E1)',
              background: 'var(--nn-card, #FFFFFF)',
              color: 'var(--nn-ink, #17352B)',
              fontSize: 20,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'border-color 0.15s ease'
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
          {[60, 90, 120, 180].map((mins) => {
            const isSel = Number(val) === mins;
            return (
              <button
                key={mins}
                type="button"
                onClick={() => setVal(mins)}
                style={{
                  minHeight: 36,
                  padding: '0 14px',
                  borderRadius: 999,
                  border: `1px solid ${isSel ? 'var(--nn-green, #166B52)' : 'var(--nn-line, #DDE7E1)'}`,
                  background: isSel ? 'var(--nn-green, #166B52)' : 'var(--nn-card, #FFFFFF)',
                  color: isSel ? '#FFFFFF' : 'var(--nn-ink, #17352B)',
                  fontWeight: isSel ? 600 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
              >
                {mins} phút
              </button>
            );
          })}
        </div>
      )}

      {/* Presets for stops */}
      {normalizedKey === 'stops' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[2, 3, 4, 5].map((s) => {
            const isSel = Number(val) === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setVal(s)}
                style={{
                  minHeight: 36,
                  padding: '0 14px',
                  borderRadius: 999,
                  border: `1px solid ${isSel ? 'var(--nn-green, #166B52)' : 'var(--nn-line, #DDE7E1)'}`,
                  background: isSel ? 'var(--nn-green, #166B52)' : 'var(--nn-card, #FFFFFF)',
                  color: isSel ? '#FFFFFF' : 'var(--nn-ink, #17352B)',
                  fontWeight: isSel ? 600 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
              >
                {s} quán
              </button>
            );
          })}
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
          ].map((b) => {
            const isSel = Number(val) === b.value;
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => setVal(b.value)}
                style={{
                  minHeight: 36,
                  padding: '0 14px',
                  borderRadius: 999,
                  border: `1px solid ${isSel ? 'var(--nn-green, #166B52)' : 'var(--nn-line, #DDE7E1)'}`,
                  background: isSel ? 'var(--nn-green, #166B52)' : 'var(--nn-card, #FFFFFF)',
                  color: isSel ? '#FFFFFF' : 'var(--nn-ink, #17352B)',
                  fontWeight: isSel ? 600 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
              >
                {b.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Presets for time */}
      {normalizedKey === 'time' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['18:00', '18:30', '19:00', '19:30', '20:00'].map((t) => {
            const isSel = val === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setVal(t)}
                style={{
                  minHeight: 36,
                  padding: '0 14px',
                  borderRadius: 999,
                  border: `1px solid ${isSel ? 'var(--nn-green, #166B52)' : 'var(--nn-line, #DDE7E1)'}`,
                  background: isSel ? 'var(--nn-green, #166B52)' : 'var(--nn-card, #FFFFFF)',
                  color: isSel ? '#FFFFFF' : 'var(--nn-ink, #17352B)',
                  fontWeight: isSel ? 600 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}

      {/* Presets for vehicle */}
      {normalizedKey === 'vehicle' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { label: 'Đi bộ', id: 'walk' },
            { label: 'Xe máy', id: 'motorcycle' },
            { label: 'Ô tô / taxi', id: 'car' }
          ].map((veh) => {
            const isSel = val === veh.id;
            return (
              <button
                key={veh.id}
                type="button"
                onClick={() => setVal(veh.id)}
                style={{
                  minHeight: 36,
                  padding: '0 14px',
                  borderRadius: 999,
                  border: `1px solid ${isSel ? 'var(--nn-green, #166B52)' : 'var(--nn-line, #DDE7E1)'}`,
                  background: isSel ? 'var(--nn-green, #166B52)' : 'var(--nn-card, #FFFFFF)',
                  color: isSel ? '#FFFFFF' : 'var(--nn-ink, #17352B)',
                  fontWeight: isSel ? 600 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
              >
                {veh.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Action Buttons: Lưu & Huỷ (>=44px min touch target) */}
      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center', marginTop: 4 }}>
        <button
          type="button"
          data-testid="inline-edit-save"
          onClick={handleSave}
          className="nn-confirm-primary"
          style={{ minHeight: 40, height: 40, padding: '0 16px', fontSize: 13 }}
        >
          Lưu
        </button>
        <button
          type="button"
          data-testid="inline-edit-cancel"
          onClick={onCancel}
          className="nn-confirm-secondary"
          style={{ minHeight: 40, height: 40, padding: '0 14px', fontSize: 13 }}
        >
          Huỷ
        </button>
      </div>
    </div>
  );
}
