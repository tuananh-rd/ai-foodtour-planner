'use client';

import React, { useState, useRef, useEffect } from 'react';

function parseProfileField(fieldKey, rawVal) {
  const val = rawVal.trim();
  if (!val) return { error: 'Vui lòng nhập giá trị.' };

  if (fieldKey === 'area') {
    return { action: { type: 'set_location', location: { district: val, label: val } } };
  }

  if (fieldKey === 'party_size') {
    const num = parseInt(val.replace(/\D/g, ''), 10);
    if (isNaN(num) || num < 1 || num > 20) {
      return { error: 'Số người phải là số nguyên từ 1 đến 20.' };
    }
    return { action: { type: 'edit_profile', patch: { party_size: num } } };
  }

  if (fieldKey === 'budget') {
    const isPerPerson = val.toLowerCase().includes('người') || val.toLowerCase().includes('mỗi');
    let digits = parseInt(val.replace(/[^\d]/g, ''), 10);
    if (isNaN(digits) || digits <= 0) {
      return { error: 'Ngân sách không hợp lệ (ví dụ: 250k mỗi người).' };
    }
    if (val.toLowerCase().includes('k') && digits < 10000) {
      digits = digits * 1000;
    } else if (digits > 0 && digits < 1000) {
      digits = digits * 1000;
    }
    return {
      action: {
        type: 'edit_profile',
        patch: {
          budget_vnd: digits,
          budget_scope: isPerPerson ? 'per_person' : 'total',
        },
      },
    };
  }

  if (fieldKey === 'start_time' || fieldKey === 'time') {
    const timeMatch = val.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/);
    if (timeMatch) {
      const hh = timeMatch[1].padStart(2, '0');
      const mm = timeMatch[2];
      return { action: { type: 'edit_profile', patch: { start_time: `${hh}:${mm}` } } };
    }
    const digits = parseInt(val.replace(/\D/g, ''), 10);
    if (!isNaN(digits) && digits > 0) {
      const isHours = val.toLowerCase().includes('tiếng') || val.toLowerCase().includes('h');
      const min = isHours ? digits * 60 : digits;
      return { action: { type: 'edit_profile', patch: { max_leg_min: min } } };
    }
    return { error: 'Định dạng giờ không hợp lệ (ví dụ: 18:30 hoặc 45 phút).' };
  }

  if (fieldKey === 'vehicle') {
    const lower = val.toLowerCase();
    let v = 'walking';
    if (lower.includes('máy') || lower.includes('motor')) v = 'motorbike';
    else if (lower.includes('ô tô') || lower.includes('taxi') || lower.includes('car')) v = 'taxi';
    return { action: { type: 'edit_profile', patch: { vehicle: v } } };
  }

  if (fieldKey === 'allergies') {
    // Allergies is NOT an edit_profile key -> send as natural language text turn
    return { action: { type: 'text', text: `dị ứng ${val}` } };
  }

  if (fieldKey === 'tastes') {
    // Tastes is NOT an edit_profile key -> send as natural language text turn
    return { action: { type: 'text', text: `tôi muốn ăn ${val}` } };
  }

  return { action: { type: 'edit_profile', patch: { [fieldKey]: val } } };
}

/**
 * Top ProfileBar (Workspace Top Row, TASK C3-1 & C6a)
 *
 * Requirements:
 * - area, party, budget (+scope), time, vehicle, tastes, allergies
 * - source styling: user_said vs inferred/default vs missing
 * - allergies chip is visually prominent (safety)
 * - clicking chips allows quick editing / actions
 * - accessible modal with focus trap, aria-modal, Escape key, and focus return
 * - client-side validation mapping to Contract v1.8 (party_size int, budget_vnd int, etc.)
 */
export default function ProfileBar({
  chatState,
  onAction,
  busy = false,
}) {
  const [editingField, setEditingField] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const cancelBtnRef = useRef(null);
  const saveBtnRef = useRef(null);

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
      textCol = '#1F1B16';
    }

    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      padding: '6px 12px',
      borderRadius: 20,
      background: bg,
      border: border,
      color: textCol,
      fontSize: 13,
      cursor: busy ? 'not-allowed' : 'pointer',
      whiteSpace: 'nowrap',
      transition: 'all 0.15s ease',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    };
  };

  const formatBudgetString = (budgetField) => {
    if (!budgetField || budgetField.value === null || budgetField.value === undefined) {
      return 'Chưa rõ';
    }
    const val = budgetField.value;
    const scope = budgetField.scope === 'per_person' ? 'mỗi người' : 'cả nhóm';
    if (typeof val === 'number') {
      return `${val.toLocaleString('vi-VN')} ₫ / ${scope}`;
    }
    return String(val);
  };

  const areaText = profile.area?.value 
    ? (typeof profile.area.value === 'object' ? (profile.area.value.label || profile.area.value.district || 'Hà Nội') : profile.area.value) 
    : 'Chưa chọn';

  const partyText = profile.party_size?.value ? `${profile.party_size.value} người` : 'Chưa rõ';
  const budgetText = formatBudgetString(profile.budget);
  
  const timeText = profile.start_time?.value 
    ? `${profile.start_time.value}${profile.end_time?.value ? ` → ${profile.end_time.value}` : profile.duration_min?.value ? ` (${profile.duration_min.value}p)` : ''}`
    : 'Chưa rõ';

  const vehicleText = profile.vehicle?.value === 'walk' || profile.vehicle?.value === 'walking' ? 'Đi bộ' 
    : profile.vehicle?.value === 'motorbike' ? 'Xe máy' 
    : profile.vehicle?.value === 'car' || profile.vehicle?.value === 'taxi' ? 'Ô tô / Taxi' 
    : profile.vehicle?.value || 'Chưa rõ';

  const tastesText = profile.tastes?.value 
    ? (Array.isArray(profile.tastes.value) ? profile.tastes.value.join(', ') : String(profile.tastes.value)) 
    : 'Chưa rõ';

  const hasAllergies = allergies.length > 0;
  const allergyListText = hasAllergies 
    ? allergies.map((a) => a.term).join(', ') 
    : 'Không có / Chưa rõ';

  const handleOpenEdit = (fieldKey, currentVal, e) => {
    if (busy) return;
    triggerRef.current = e?.currentTarget || null;
    setEditingField(fieldKey);
    setErrorMsg('');
    setEditVal(currentVal === 'Chưa rõ' || currentVal === 'Chưa chọn' || currentVal === 'Không có / Chưa rõ' ? '' : currentVal);
  };

  const handleCloseEdit = () => {
    setEditingField(null);
    setErrorMsg('');
    setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editingField || busy) return;

    const result = parseProfileField(editingField, editVal);
    if (result.error) {
      setErrorMsg(result.error);
      return;
    }

    if (onAction && result.action) {
      onAction(result.action);
    }
    handleCloseEdit();
  };

  const handleKeyDownDialog = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCloseEdit();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = [inputRef.current, cancelBtnRef.current, saveBtnRef.current].filter(Boolean);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingField]);

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
        onClick={(e) => handleOpenEdit('area', areaText, e)}
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
        onClick={(e) => handleOpenEdit('party_size', partyText, e)}
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
        onClick={(e) => handleOpenEdit('budget', budgetText, e)}
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
        onClick={(e) => handleOpenEdit('start_time', timeText, e)}
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
        onClick={(e) => handleOpenEdit('vehicle', vehicleText, e)}
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
        onClick={(e) => handleOpenEdit('tastes', tastesText, e)}
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
        onClick={(e) => handleOpenEdit('allergies', allergyListText, e)}
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

      {/* Accessible Inline Edit Dialog */}
      {editingField && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title-profile"
          onKeyDown={handleKeyDownDialog}
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
            <h4
              id="dialog-title-profile"
              style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1F1B16' }}
            >
              Chỉnh sửa: {editingField}
            </h4>
            <form onSubmit={handleSaveEdit}>
              <label
                htmlFor="profile-edit-input"
                id="profile-edit-label"
                style={{ display: 'block', fontSize: 12, color: '#6B6259', marginBottom: 6 }}
              >
                Nhập thông tin mới cho {editingField}:
              </label>
              <input
                id="profile-edit-input"
                aria-labelledby="profile-edit-label"
                ref={inputRef}
                type="text"
                value={editVal}
                onChange={(e) => {
                  setEditVal(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="Nhập giá trị mới..."
                style={{
                  width: '100%',
                  minHeight: 44,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: errorMsg ? '1px solid #DC2626' : '1px solid #DFD5C6',
                  fontSize: 14,
                  marginBottom: errorMsg ? 6 : 12,
                  boxSizing: 'border-box',
                }}
              />
              {errorMsg && (
                <div role="alert" style={{ color: '#DC2626', fontSize: 12, marginBottom: 10 }}>
                  ⚠️ {errorMsg}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  ref={cancelBtnRef}
                  type="button"
                  onClick={handleCloseEdit}
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
                  ref={saveBtnRef}
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
