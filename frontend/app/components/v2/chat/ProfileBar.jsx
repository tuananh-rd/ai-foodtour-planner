'use client';

import React, { useState } from 'react';

/**
 * Formats budget value to display string
 */
function formatBudgetString(budgetField) {
  if (!budgetField || budgetField.value === null) return 'chưa rõ';
  const vnd = typeof budgetField.value === 'object' ? budgetField.value.vnd : budgetField.value;
  if (!vnd) return 'chưa rõ';
  const scope = typeof budgetField.value === 'object' ? budgetField.value.scope : null;
  return `${Number(vnd).toLocaleString('vi-VN')} ₫${scope === 'per_person' ? ' (mỗi người)' : scope === 'group' ? ' (cả nhóm)' : ''}`;
}

/**
 * ProfileBar (TASK C3-1)
 *
 * Top bar displaying profile chips:
 * - area, party, budget (+scope), time, vehicle, tastes, allergies
 * - source styling: user_said vs inferred/default vs missing
 * - allergies chip is visually prominent (safety)
 * - clicking chips allows quick editing / actions
 */
export default function ProfileBar({
  chatState,
  onAction,
  busy = false,
}) {
  const [editingField, setEditingField] = useState(null);
  const [editVal, setEditVal] = useState('');

  const profile = chatState?.profile || {};
  const allergies = chatState?.allergies || [];

  const getSourceBadge = (source) => {
    if (source === 'user_said') return null;
    if (source === 'inferred') return <span style={{ fontSize: 10, opacity: 0.8 }}>(gợi ý)</span>;
    if (source === 'default') return <span style={{ fontSize: 10, opacity: 0.8 }}>(mặc định)</span>;
    return <span style={{ fontSize: 10, color: '#DC2626' }}>(thiếu)</span>;
  };

  const getChipStyle = (field, isProminent = false) => {
    const source = field?.source || 'missing';
    const isMissing = source === 'missing' || field?.value === null;

    let bg = '#FFFFFF';
    let border = '1px solid #DFD5C6';
    let textCol = '#1F1B16';

    if (isProminent) {
      bg = '#FEF2F2';
      border = '2px solid #EF4444';
      textCol = '#991B1B';
    } else if (isMissing) {
      bg = '#FBF8F3';
      border = '1px dashed #C8C1B7';
      textCol = '#6B6259';
    } else if (source === 'user_said') {
      bg = '#FFFFFF';
      border = '1px solid #C8431A';
      textCol = '#C8431A';
    }

    return {
      minHeight: 44,
      padding: '6px 12px',
      borderRadius: 22,
      background: bg,
      border,
      color: textCol,
      fontSize: 12,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      cursor: busy ? 'not-allowed' : 'pointer',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      fontWeight: isProminent || source === 'user_said' ? 700 : 500,
    };
  };

  const areaText = profile.area?.value 
    ? (typeof profile.area.value === 'object' ? (profile.area.value.label || profile.area.value.district || 'Hà Nội') : profile.area.value) 
    : 'Chưa chọn';

  const partyText = profile.party_size?.value ? `${profile.party_size.value} người` : 'Chưa rõ';
  const budgetText = formatBudgetString(profile.budget);
  
  const timeText = profile.start_time?.value 
    ? `${profile.start_time.value}${profile.end_time?.value ? ` → ${profile.end_time.value}` : profile.duration_min?.value ? ` (${profile.duration_min.value}p)` : ''}`
    : 'Chưa rõ';

  const vehicleText = profile.vehicle?.value === 'walk' ? 'Đi bộ' 
    : profile.vehicle?.value === 'motorbike' ? 'Xe máy' 
    : profile.vehicle?.value === 'car' ? 'Ô tô' 
    : profile.vehicle?.value || 'Chưa rõ';

  const tastesText = profile.tastes?.value 
    ? (Array.isArray(profile.tastes.value) ? profile.tastes.value.join(', ') : String(profile.tastes.value)) 
    : 'Chưa rõ';

  const hasAllergies = allergies.length > 0;
  const allergyListText = hasAllergies 
    ? allergies.map((a) => a.term).join(', ') 
    : 'Không có / Chưa rõ';

  const handleOpenEdit = (fieldKey, currentVal) => {
    if (busy) return;
    setEditingField(fieldKey);
    setEditVal(currentVal === 'Chưa rõ' || currentVal === 'Chưa chọn' ? '' : currentVal);
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editingField || busy) return;
    if (onAction) {
      if (editingField === 'area') {
        onAction({
          type: 'set_location',
          location: { district: editVal.trim(), label: editVal.trim() },
        });
      } else {
        const patch = {};
        patch[editingField] = editVal.trim();
        onAction({ type: 'edit_profile', patch });
      }
    }
    setEditingField(null);
  };

  return (
    <div
      data-testid="profile-bar"
      style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #DFD5C6',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: '#6B6259', display: 'flex', alignItems: 'center', gap: 4 }}>
        ⚙️ Hồ sơ:
      </span>

      {/* Area Chip */}
      <button
        type="button"
        disabled={busy}
        data-testid="chip-profile-area"
        onClick={() => handleOpenEdit('area', areaText)}
        style={getChipStyle(profile.area)}
      >
        <span>📍</span>
        <span>Khu vực: <strong>{areaText}</strong></span>
        {getSourceBadge(profile.area?.source)}
      </button>

      {/* Party Size Chip */}
      <button
        type="button"
        disabled={busy}
        data-testid="chip-profile-party"
        onClick={() => handleOpenEdit('party_size', partyText)}
        style={getChipStyle(profile.party_size)}
      >
        <span>👥</span>
        <span>Số người: <strong>{partyText}</strong></span>
        {getSourceBadge(profile.party_size?.source)}
      </button>

      {/* Budget Chip */}
      <button
        type="button"
        disabled={busy}
        data-testid="chip-profile-budget"
        onClick={() => handleOpenEdit('budget', budgetText)}
        style={getChipStyle(profile.budget)}
      >
        <span>💰</span>
        <span>Ngân sách: <strong>{budgetText}</strong></span>
        {getSourceBadge(profile.budget?.source)}
      </button>

      {/* Time Chip */}
      <button
        type="button"
        disabled={busy}
        data-testid="chip-profile-time"
        onClick={() => handleOpenEdit('start_time', timeText)}
        style={getChipStyle(profile.start_time)}
      >
        <span>🕒</span>
        <span>Thời gian: <strong>{timeText}</strong></span>
        {getSourceBadge(profile.start_time?.source)}
      </button>

      {/* Vehicle Chip */}
      <button
        type="button"
        disabled={busy}
        data-testid="chip-profile-vehicle"
        onClick={() => handleOpenEdit('vehicle', vehicleText)}
        style={getChipStyle(profile.vehicle)}
      >
        <span>🚶</span>
        <span>Phương tiện: <strong>{vehicleText}</strong></span>
        {getSourceBadge(profile.vehicle?.source)}
      </button>

      {/* Tastes Chip */}
      <button
        type="button"
        disabled={busy}
        data-testid="chip-profile-tastes"
        onClick={() => handleOpenEdit('tastes', tastesText)}
        style={getChipStyle(profile.tastes)}
      >
        <span>🍜</span>
        <span>Khẩu vị: <strong>{tastesText}</strong></span>
        {getSourceBadge(profile.tastes?.source)}
      </button>

      {/* Prominent Allergies Chip (SAFETY CRITICAL) */}
      <button
        type="button"
        disabled={busy}
        data-testid="chip-profile-allergies"
        data-prominent={hasAllergies ? 'true' : 'false'}
        className="chip-allergies"
        onClick={() => handleOpenEdit('allergies', allergyListText)}
        style={getChipStyle(null, hasAllergies)}
      >
        <span>🛡️</span>
        <span>Dị ứng: <strong>{allergyListText}</strong></span>
        {hasAllergies && (
          <span style={{ fontSize: 10, background: '#DC2626', color: '#FFFFFF', padding: '1px 5px', borderRadius: 4 }}>
            Lưu ý quan trọng
          </span>
        )}
      </button>

      {/* Simple Inline Edit Modal */}
      {editingField && (
        <div
          role="dialog"
          aria-label="Chỉnh sửa thông tin hồ sơ"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              padding: 20,
              width: 320,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1F1B16' }}>
              Chỉnh sửa: {editingField}
            </h4>
            <form onSubmit={handleSaveEdit}>
              <input
                type="text"
                autoFocus
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                placeholder="Nhập giá trị mới..."
                style={{
                  width: '100%',
                  minHeight: 44,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #DFD5C6',
                  fontSize: 14,
                  marginBottom: 12,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setEditingField(null)}
                  style={{
                    minHeight: 44,
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #DFD5C6',
                    background: '#FFFFFF',
                    color: '#6B6259',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  style={{
                    minHeight: 44,
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#C8431A',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
