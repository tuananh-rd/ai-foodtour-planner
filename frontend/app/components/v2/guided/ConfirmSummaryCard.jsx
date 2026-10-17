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

  const budgetScopeItem = summary?.items?.find((i) => i.id === 'budget_scope');
  const scopeFromProfile = profile?.budget?.scope;
  let scopeText = 'chưa rõ cả nhóm hay mỗi người';
  if (scopeFromProfile === 'per_person' || budgetScopeItem?.value === 'mỗi người' || String(budget).includes('mỗi người')) {
    scopeText = 'mỗi người';
  } else if (scopeFromProfile === 'group' || budgetScopeItem?.value === 'cả nhóm' || String(budget).includes('cả nhóm')) {
    scopeText = 'cả nhóm';
  }
  const cleanBudget = String(budget).replace(/\s*\(?(mỗi người|cả nhóm|chưa rõ[^)]*)\)?/gi, '').trim();

  const visitMinItem = summary?.items?.find((i) => i.id === 'visit_min');
  const visitMinText = visitMinItem?.value || (summary?.visit_min ? `khoảng ${summary.visit_min} phút` : '');

  const vehicleItem = summary?.items?.find((i) => i.id === 'vehicle');
  const vehicleVal = vehicleItem?.value || profile?.vehicle?.value || 'đi bộ';
  const isDefaultVehicle = vehicleItem?.status === 'default' || profile?.vehicle?.source === 'default' || !profile?.vehicle?.confirmed;
  const vehicleLabel = (vehicleVal === 'walk' || vehicleVal === 'đi bộ') ? 'Đi bộ' : vehicleVal;

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
          {party} người • từ {time} • tối đa {cleanBudget} {scopeText}
          {summary?.notes ? ` • ${summary.notes}` : ''}
        </div>

        {/* Proposed Venues List */}
        {Array.isArray(summary?.shortlist) && summary.shortlist.length > 0 && (
          <div
            data-testid="confirm-venues-list"
            style={{
              fontSize: 13,
              color: 'var(--ink, #231f1a)',
              marginTop: 6
            }}
          >
            <b>Quán đề xuất:</b> {summary.shortlist.map((s) => s.name || 'Quán chưa rõ tên').join(', ')}
          </div>
        )}

        {/* Visit Minutes per Stop */}
        {visitMinText && (
          <div
            data-testid="confirm-visit-min"
            style={{
              fontSize: 13,
              color: 'var(--mute, #6b6257)',
              marginTop: 4
            }}
          >
            ⏱️ <b>Thời gian mỗi quán:</b> {visitMinText}
          </div>
        )}

        {/* Vehicle Row (default walking, editable) */}
        <div
          data-testid="confirm-vehicle"
          style={{
            fontSize: 13,
            color: 'var(--mute, #6b6257)',
            marginTop: 4
          }}
        >
          🚶 <b>Phương tiện:</b> {vehicleLabel}{isDefaultVehicle ? ' (mặc định)' : ''}
        </div>

        {/* Budget distinction note (Q02) */}
        <div
          style={{
            fontSize: 12,
            color: 'var(--mute, #6b6257)',
            marginTop: 4,
            fontStyle: 'italic'
          }}
        >
          💡 Ngân sách là mức trần mong muốn của bạn; giá theo quán là khoảng giá tham khảo theo nguồn, không bảo đảm tổng chi phí món ăn theo người.
        </div>

        {/* Conditional / Warnings / Missing Info (Q02) */}
        {((Array.isArray(summary?.warnings) && summary.warnings.length > 0) ||
          (Array.isArray(summary?.missing) && summary.missing.length > 0) ||
          (Array.isArray(summary?.route_warnings) && summary.route_warnings.length > 0) ||
          summary?.status === 'conditional') && (
          <div
            data-testid="confirm-summary-warnings"
            style={{
              background: 'var(--warnbg, #fef3c7)',
              border: '1px solid var(--warn, #92400e)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 13,
              color: 'var(--warn, #92400e)',
              display: 'grid',
              gap: 4,
              marginTop: 8
            }}
          >
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚠️</span>
              <span>Lưu ý & thông tin chưa xác minh (Gợi ý có điều kiện):</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {[
                ...(summary?.warnings || []),
                ...(summary?.missing || []),
                ...(summary?.route_warnings || [])
              ].map((w, idx) => (
                <li key={idx}>{typeof w === 'string' ? w : w.message || JSON.stringify(w)}</li>
              ))}
              {summary?.status === 'conditional' && (!summary?.warnings || summary.warnings.length === 0) && (
                <li>Một số giờ mở cửa hoặc khoảng giá chưa được kiểm chứng thực tế tại quán.</li>
              )}
            </ul>
          </div>
        )}
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
