'use client';

import React from 'react';
import { normalizeDisplayText } from '../../../../lib/emojiSanitizer';
import './guided-leaves.css';

export function formatWarningMessage(w) {
  if (!w) return '';
  if (typeof w === 'string') {
    const raw = w.trim();
    const fields = {
      allergy_ingredients: 'Chưa xác minh thành phần để đánh giá dị ứng',
      hours: 'Chưa xác minh giờ mở cửa',
      price_per_person: 'Chưa có giá theo người đã xác minh',
      route: 'Chưa có tuyến đường thực đã xác minh',
      route_time: 'Chưa rõ thời gian di chuyển',
      budget: 'Chưa xác minh chi phí theo ngân sách'
    };
    if (fields[raw]) return fields[raw];
    if (raw === 'conditional') return 'Lịch trình có điều kiện (cần đối chiếu thông tin thực tế).';
    if (raw === 'verified_feasible') return 'Đã xác minh đầy đủ tính khả thi.';
    if (raw === 'insufficient_evidence') return 'Thiếu bằng chứng xác thực hoạt động của quán.';
    if (raw === 'unknown_opening_hours' || raw === 'unknown_hours') return 'Chưa rõ giờ mở cửa chính xác của một số quán theo nguồn ghi.';
    if (raw === 'unknown_price' || raw === 'price_unknown') return 'Chưa có khoảng giá cụ thể của một số quán.';
    return /^[a-z_]+$/.test(raw) ? 'Còn thông tin cần kiểm chứng trước khi khởi hành.' : normalizeDisplayText(raw);
  }
  if (typeof w === 'object') {
    if (w.message) return normalizeDisplayText(w.message);
    if (w.reason) return normalizeDisplayText(w.reason);
    if (w.text) return normalizeDisplayText(w.text);
    if (w.code) {
      const codeMap = {
        unknown_opening_hours: 'Chưa rõ giờ mở cửa chính xác của một số quán.',
        unknown_hours: 'Chưa rõ giờ mở cửa của quán theo nguồn ghi.',
        unknown_price: 'Chưa có khoảng giá cụ thể của một số quán.',
        conditional: 'Lịch trình có điều kiện (cần kiểm tra lại giờ hoặc giá thực tế).',
        insufficient_evidence: 'Thiếu bằng chứng xác thực về địa điểm.',
        unreachable: 'Khoảng cách giữa các quán có thể khó đi bộ.',
        traffic: 'Đoạn đường di chuyển có thể đông đúc.'
      };
      if (codeMap[w.code]) return codeMap[w.code];
    }
    if (w.field) return `Chưa xác định thông tin: ${normalizeDisplayText(w.field)}`;
    return 'Cần lưu ý kiểm tra lại thông tin quán trước khi khởi hành.';
  }
  return normalizeDisplayText(String(w));
}

/**
 * ConfirmSummaryCard
 * Step 4 Confirmation Card conforming to SVG fidelity spec (owner: Antigravity)
 * - Mint assistant bubble style (--nn-mint, r16, padding 16, max-width 410)
 * - Summary details with dynamic budget scope label
 * - Venue names shortlist
 * - Calm warnings in peach (--nn-peach)
 * - Primary green pill (44h, white 14/600) + secondary outline pill (44h)
 * - Preserves ALL testids, handlers, and confirmation gates
 */
export default function ConfirmSummaryCard({
  summary,
  profile,
  onConfirmYes,
  onConfirmNo,
  busy = false
}) {
  const item = (...ids) => summary?.items?.find((entry) => ids.includes(entry.id))?.value;
  const stops = profile?.stops?.value ?? (summary?.shortlist?.length || summary?.venues?.length || item('stops') || null);
  const duration = profile?.duration_min?.value ?? item('duration_min', 'duration');
  const stopsText = stops == null ? 'chưa rõ số quán' : /quán/.test(String(stops)) ? stops : `${stops} quán`;
  const durationText = duration == null ? 'chưa rõ thời lượng' : /phút/.test(String(duration)) ? duration : `${duration} phút`;
  const area = typeof profile?.area?.value === 'string'
    ? profile.area.value
    : (profile?.area?.value?.label || item('area') || 'chưa rõ khu vực');
  const party = profile?.party_size?.value ?? item('party_size', 'party');
  const partyText = party == null ? 'Chưa rõ số người' : /người/.test(String(party)) ? party : `${party} người`;
  const time = profile?.start_time?.value || item('start_time', 'time') || 'chưa rõ giờ';
  const budget = profile?.budget?.value !== null && profile?.budget?.value !== undefined
    ? `${Number(profile.budget.value).toLocaleString('vi-VN')} đ`
    : (item('budget') || 'chưa đặt ngân sách');

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

  const statusLabel = summary?.status === 'verified_feasible'
    ? 'Đã xác minh khả thi'
    : summary?.status === 'conditional'
    ? 'Gợi ý có điều kiện'
    : summary?.status === 'insufficient_evidence'
    ? 'Thiếu bằng chứng'
    : null;

  return (
    <div
      data-testid="confirm-summary-card"
      className="nn-assistant-bubble"
      style={{ margin: '8px 0' }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, margin: '0 0 6px 0' }}>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--nn-ink, #17352B)',
              lineHeight: 1.3
            }}
          >
            Lập tour {stopsText}, {durationText}, {area}?
          </h3>
          {statusLabel && (
            <span
              data-testid="confirm-status-badge"
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 10,
                backgroundColor: summary?.status === 'verified_feasible' ? '#E8F5E9' : '#FEF3C7',
                color: summary?.status === 'verified_feasible' ? '#2E7D32' : '#92400E',
                border: `1px solid ${summary?.status === 'verified_feasible' ? '#C8E6C9' : '#FDE68A'}`,
                whiteSpace: 'nowrap'
              }}
            >
              {statusLabel}
            </span>
          )}
        </div>

        <div
          data-testid="confirm-summary-details"
          style={{
            fontSize: 14,
            color: 'var(--nn-mute, #62736D)',
            lineHeight: 1.45
          }}
        >
          {partyText} • từ {time} • mức bạn muốn chi: {cleanBudget} ({scopeText})
          {summary?.notes ? ` • ${normalizeDisplayText(summary.notes)}` : ''}
        </div>

        {/* Proposed Venues List */}
        {Array.isArray(summary?.shortlist) && summary.shortlist.length > 0 && (
          <div
            data-testid="confirm-venues-list"
            style={{
              fontSize: 13,
              color: 'var(--nn-ink, #17352B)',
              marginTop: 6
            }}
          >
            <b>Quán đề xuất:</b> {summary.shortlist.map((s) => normalizeDisplayText(s.name) || 'Quán chưa rõ tên').join(', ')}
          </div>
        )}

        {/* Visit Minutes per Stop */}
        {visitMinText && (
          <div
            data-testid="confirm-visit-min"
            style={{
              fontSize: 13,
              color: 'var(--nn-mute, #62736D)',
              marginTop: 4
            }}
          >
            <b>Thời gian mỗi quán:</b> {visitMinText}
          </div>
        )}

        {/* Vehicle Row */}
        <div
          data-testid="confirm-vehicle"
          style={{
            fontSize: 13,
            color: 'var(--nn-mute, #62736D)',
            marginTop: 4
          }}
        >
          <b>Phương tiện:</b> {vehicleLabel}{isDefaultVehicle ? ' (mặc định)' : ''}
        </div>

        {/* Budget distinction note (Q02) */}
        <div
          style={{
            fontSize: 12,
            color: 'var(--nn-mute, #62736D)',
            marginTop: 4,
            fontStyle: 'italic'
          }}
        >
          Lưu ý: Ngân sách là mức trần mong muốn của bạn; giá theo quán là khoảng giá tham khảo theo nguồn, không bảo đảm tổng chi phí món ăn theo người.
        </div>

        {/* Conditional / Warnings / Missing Info in Peach Box (Q02) */}
        {((Array.isArray(summary?.warnings) && summary.warnings.length > 0) ||
          (Array.isArray(summary?.missing) && summary.missing.length > 0) ||
          (Array.isArray(summary?.route_warnings) && summary.route_warnings.length > 0) ||
          summary?.status === 'conditional') && (
          <div
            data-testid="confirm-summary-warnings"
            className="nn-peach-box"
            style={{ marginTop: 8 }}
          >
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span>Lưu ý & thông tin chưa xác minh (Gợi ý có điều kiện):</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {[
                ...(summary?.warnings || []),
                ...(summary?.missing || []),
                ...(summary?.route_warnings || [])
              ].map((w, idx) => (
                <li key={idx}>{formatWarningMessage(w)}</li>
              ))}
              {summary?.status === 'conditional' && (!summary?.warnings || summary.warnings.length === 0) && (
                <li>Một số giờ mở cửa hoặc khoảng giá chưa được kiểm chứng thực tế tại quán.</li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Button Group: ONE primary green pill, ONE secondary outline pill */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
        <button
          type="button"
          data-testid="confirm-yes-btn"
          onClick={onConfirmYes}
          disabled={busy}
          className="nn-confirm-primary"
        >
          {busy ? 'Đang tạo tour…' : 'Đúng, lập tour'}
        </button>

        <button
          type="button"
          data-testid="confirm-no-btn"
          onClick={onConfirmNo}
          disabled={busy}
          className="nn-confirm-secondary"
        >
          Sửa
        </button>
      </div>

      <div
        style={{
          fontSize: 12,
          color: 'var(--nn-mute, #62736D)',
          marginTop: -2
        }}
      >
        Chỉ lập tour sau khi bạn bấm xác nhận.
      </div>
    </div>
  );
}
