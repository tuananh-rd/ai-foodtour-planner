'use client';

import React from 'react';

/**
 * ConfirmSummaryCard
 * Step 4 Confirmation Card matching docs/ux/guided-flow-mockup.html
 * - Summary of tour to be generated
 * - ONE primary button: "Đúng, lập tour"
 * - ONE secondary button: "Sửa"
 */
export default function ConfirmSummaryCard({
  summary,
  profile,
  onConfirmYes,
  onConfirmNo,
  busy = false
}) {
  const stops = profile?.stops?.value || summary?.shortlist?.length || 3;
  const duration = profile?.duration_min?.value || 120;
  const area = typeof profile?.area?.value === 'string'
    ? profile.area.value
    : (profile?.area?.value?.label || summary?.items?.find((i) => i.id === 'area')?.value || 'quanh Hồ Gươm');
  const party = profile?.party_size?.value || summary?.items?.find((i) => i.id === 'party_size' || i.id === 'party')?.value || 2;
  const time = profile?.start_time?.value || summary?.items?.find((i) => i.id === 'start_time' || i.id === 'time')?.value || '19:00';
  const budget = profile?.budget?.value
    ? `${Number(profile.budget.value).toLocaleString('vi-VN')} đ`
    : (summary?.items?.find((i) => i.id === 'budget')?.value || '500.000 đ');

  return (
    <div
      data-testid="confirm-summary-card"
      style={{
        background: 'var(--card, #fff)',
        border: '1px solid var(--line, #e6dfd3)',
        borderRadius: 14,
        padding: 16,
        display: 'grid',
        gap: 12,
        margin: '12px 0'
      }}
    >
      <div>
        <h3
          style={{
            margin: '0 0 6px 0',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--ink, #231f1a)'
          }}
        >
          Lập tour {stops} quán, ~{duration} phút, {area}?
        </h3>
        <div
          data-testid="confirm-summary-details"
          style={{
            fontSize: 14,
            color: 'var(--mute, #6b6257)',
            lineHeight: 1.45
          }}
        >
          {party} người • từ {time} • tối đa {budget} cả nhóm
          {summary?.notes ? ` • ${summary.notes}` : ''}
        </div>
      </div>

      {/* Button Group: Exactly ONE primary, ONE secondary */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          data-testid="confirm-yes-btn"
          onClick={onConfirmYes}
          disabled={busy}
          style={{
            minHeight: 48,
            padding: '0 20px',
            borderRadius: 12,
            border: 'none',
            background: busy ? 'var(--chip, #f3ece0)' : 'var(--accent, #c2410c)',
            color: busy ? 'var(--mute, #6b6257)' : '#fff',
            fontSize: 15,
            fontWeight: 700,
            cursor: busy ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 4px rgba(194, 65, 12, 0.15)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {busy ? 'Đang tạo tour…' : 'Đúng, lập tour'}
        </button>

        <button
          type="button"
          data-testid="confirm-no-btn"
          onClick={onConfirmNo}
          disabled={busy}
          style={{
            minHeight: 48,
            padding: '0 18px',
            borderRadius: 12,
            border: '1px solid var(--line, #e6dfd3)',
            background: 'transparent',
            color: 'var(--ink, #231f1a)',
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          Sửa
        </button>
      </div>

      <div
        style={{
          fontSize: 12,
          color: 'var(--mute, #6b6257)',
          marginTop: -2
        }}
      >
        Chỉ lập tour sau khi bạn bấm xác nhận.
      </div>
    </div>
  );
}
