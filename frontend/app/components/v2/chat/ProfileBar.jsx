'use client';

import React, { useState, useRef, useEffect } from 'react';

/**
 * Top ProfileBar (Workspace Top Row, Contract v1.8, GMAPS-URL-2).
 *
 * Rules:
 * - NO client-side free-text parsing. Structured controls only.
 * - Party size: number input 1..20
 * - Budget: amount number input (digits only, 1..100,000,000 VND) + unit select + REQUIRED scope select
 * - Vehicle: select of the four supported values (walk, motorbike, car, taxi)
 * - Times: <input type=time> -> HH:MM
 * - Max leg: number 3..60
 * - Audience: select
 * - Allergies & tastes: TEXT turns (sent through server parser)
 * - Validate before sending: no NaN, no negatives, no overflow, no 30-digit numbers
 * - Inline error messages in Vietnamese with role="alert"
 * - Labels for every control with matching htmlFor
 * - Focus trap and Escape key handler
 */
export default function ProfileBar({
  chatState,
  onAction,
  busy = false,
}) {
  const [editingField, setEditingField] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Structured field states
  const [partySize, setPartySize] = useState(2);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetUnit, setBudgetUnit] = useState('1000'); // '1' | '1000' | '1000000'
  const [budgetScope, setBudgetScope] = useState(''); // '' | 'per_person' | 'group'
  const [vehicle, setVehicle] = useState('walk'); // 'walk' | 'motorbike' | 'car' | 'taxi'
  const [startTime, setStartTime] = useState('18:00');
  const [maxLeg, setMaxLeg] = useState(15);
  const [audience, setAudience] = useState('friends');
  const [allergiesText, setAllergiesText] = useState('');
  const [tastesText, setTastesText] = useState('');
  const [areaText, setAreaText] = useState('');

  const triggerRef = useRef(null);
  const dialogContainerRef = useRef(null);
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
      whiteSpace: 'normal',
      minWidth: 0,
      maxWidth: '100%',
      overflowWrap: 'anywhere',
      wordBreak: 'break-word',
      boxSizing: 'border-box',
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

  const areaDisplayText = profile.area?.value
    ? (typeof profile.area.value === 'object' ? (profile.area.value.label || profile.area.value.district || 'Hà Nội') : profile.area.value)
    : 'Chưa chọn';

  const partyText = profile.party_size?.value ? `${profile.party_size.value} người` : 'Chưa rõ';
  const budgetText = formatBudgetString(profile.budget);

  const timeText = profile.start_time?.value
    ? `${profile.start_time.value}${profile.end_time?.value ? ` → ${profile.end_time.value}` : profile.duration_min?.value ? ` (${profile.duration_min.value}p)` : ''}`
    : 'Chưa rõ';

  const vehicleText = profile.vehicle?.value === 'walk' || profile.vehicle?.value === 'walking' ? 'Đi bộ'
    : profile.vehicle?.value === 'motorbike' ? 'Xe máy'
    : profile.vehicle?.value === 'car' ? 'Ô tô'
    : profile.vehicle?.value === 'taxi' ? 'Taxi / Grab'
    : profile.vehicle?.value || 'Chưa rõ';

  const tastesDisplayText = profile.tastes?.value
    ? (Array.isArray(profile.tastes.value) ? profile.tastes.value.join(', ') : String(profile.tastes.value))
    : 'Chưa rõ';

  const maxLegText = profile.max_leg_min?.value !== null && profile.max_leg_min?.value !== undefined && profile.max_leg_min?.value !== ''
    ? `${profile.max_leg_min.value} phút`
    : 'chưa đặt';

  const hasAllergies = allergies.length > 0;
  const allergyListText = hasAllergies
    ? allergies.map((a) => a.term).join(', ')
    : 'Không có / Chưa rõ';

  const handleOpenEdit = (fieldKey, currentVal, e) => {
    if (busy) return;
    triggerRef.current = e?.currentTarget || null;
    setEditingField(fieldKey);
    setErrorMsg('');

    if (fieldKey === 'party_size') {
      const existing = profile.party_size?.value;
      setPartySize(typeof existing === 'number' && existing >= 1 && existing <= 20 ? existing : 2);
    } else if (fieldKey === 'budget') {
      const existingVal = profile.budget?.value;
      const existingScope = profile.budget?.scope;
      setBudgetScope(existingScope === 'per_person' || existingScope === 'group' ? existingScope : '');
      if (typeof existingVal === 'number' && existingVal > 0) {
        if (existingVal >= 1000000 && existingVal % 1000000 === 0) {
          setBudgetAmount(String(existingVal / 1000000));
          setBudgetUnit('1000000');
        } else if (existingVal >= 1000 && existingVal % 1000 === 0) {
          setBudgetAmount(String(existingVal / 1000));
          setBudgetUnit('1000');
        } else {
          setBudgetAmount(String(existingVal));
          setBudgetUnit('1');
        }
      } else {
        setBudgetAmount('');
        setBudgetUnit('1000');
      }
    } else if (fieldKey === 'vehicle') {
      const existingVeh = profile.vehicle?.value;
      const valid = ['walk', 'motorbike', 'car', 'taxi'];
      setVehicle(valid.includes(existingVeh) ? existingVeh : 'walk');
    } else if (fieldKey === 'start_time' || fieldKey === 'time') {
      const existingTime = profile.start_time?.value;
      setStartTime(existingTime && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(existingTime) ? existingTime : '18:00');
    } else if (fieldKey === 'max_leg_min') {
      const existingLeg = profile.max_leg_min?.value;
      const num = Number(existingLeg);
      setMaxLeg(!isNaN(num) && num >= 3 && num <= 60 ? num : 15);
    } else if (fieldKey === 'audience') {
      const existingAud = profile.audience?.value;
      setAudience(existingAud || 'friends');
    } else if (fieldKey === 'allergies') {
      setAllergiesText(allergies.length > 0 ? allergies.map((a) => a.term).join(', ') : '');
    } else if (fieldKey === 'tastes') {
      const existingTastes = profile.tastes?.value;
      setTastesText(Array.isArray(existingTastes) ? existingTastes.join(', ') : (existingTastes || ''));
    } else if (fieldKey === 'area') {
      const existingArea = profile.area?.value;
      const str = typeof existingArea === 'object' ? (existingArea.district || existingArea.label || '') : (existingArea || '');
      setAreaText(str);
    }
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

    if (editingField === 'party_size') {
      const raw = String(partySize).trim();
      if (!/^\d+$/.test(raw)) {
        setErrorMsg('Số người phải là số nguyên từ 1 đến 20.');
        return;
      }
      const num = parseInt(raw, 10);
      if (isNaN(num) || num < 1 || num > 20) {
        setErrorMsg('Số người phải là số nguyên từ 1 đến 20.');
        return;
      }
      if (onAction) {
        onAction({ type: 'edit_profile', patch: { party_size: num } });
      }
      handleCloseEdit();
      return;
    }

    if (editingField === 'budget') {
      const raw = String(budgetAmount).trim();
      if (!raw || !/^\d+$/.test(raw)) {
        setErrorMsg('Vui lòng nhập số tiền hợp lệ (chỉ nhập chữ số).');
        return;
      }
      if (raw.length > 15) {
        setErrorMsg('Số tiền vượt quá giới hạn cho phép (tối đa 100.000.000 ₫).');
        return;
      }
      const amountNum = parseInt(raw, 10);
      if (isNaN(amountNum) || amountNum <= 0) {
        setErrorMsg('Số tiền phải lớn hơn 0.');
        return;
      }
      const ALLOWED_BUDGET_UNITS = {
        '1': 1,
        '1000': 1000,
        '1000000': 1000000,
      };
      const rawUnit = String(budgetUnit);
      if (!Object.prototype.hasOwnProperty.call(ALLOWED_BUDGET_UNITS, rawUnit)) {
        setErrorMsg('Đơn vị tiền tệ không hợp lệ. Vui lòng chọn đồng, nghìn hoặc triệu.');
        return;
      }
      const unitNum = ALLOWED_BUDGET_UNITS[rawUnit];
      const totalVnd = amountNum * unitNum;
      if (isNaN(totalVnd) || !isFinite(totalVnd) || totalVnd < 1 || totalVnd > 100000000) {
        setErrorMsg('Ngân sách phải là số từ 1 đến 100.000.000 ₫.');
        return;
      }
      if (!budgetScope || (budgetScope !== 'per_person' && budgetScope !== 'group')) {
        setErrorMsg('Vui lòng chọn phạm vi ngân sách: mỗi người hay cả nhóm.');
        return;
      }
      if (onAction) {
        onAction({
          type: 'edit_profile',
          patch: {
            budget_vnd: totalVnd,
            budget_scope: budgetScope,
          },
        });
      }
      handleCloseEdit();
      return;
    }

    if (editingField === 'vehicle') {
      const valid = ['walk', 'motorbike', 'car', 'taxi'];
      if (!valid.includes(vehicle)) {
        setErrorMsg('Vui lòng chọn phương tiện hợp lệ: Đi bộ, Xe máy, Ô tô hoặc Taxi-Grab.');
        return;
      }
      if (onAction) {
        onAction({ type: 'edit_profile', patch: { vehicle } });
      }
      handleCloseEdit();
      return;
    }

    if (editingField === 'start_time' || editingField === 'time') {
      const raw = String(startTime).trim();
      if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(raw)) {
        setErrorMsg('Định dạng giờ không hợp lệ (ví dụ: 18:30).');
        return;
      }
      if (onAction) {
        onAction({ type: 'edit_profile', patch: { start_time: raw } });
      }
      handleCloseEdit();
      return;
    }

    if (editingField === 'max_leg_min') {
      const raw = String(maxLeg).trim();
      if (!/^\d+$/.test(raw)) {
        setErrorMsg('Thời gian di chuyển tối đa phải từ 3 đến 60 phút.');
        return;
      }
      const num = parseInt(raw, 10);
      if (isNaN(num) || num < 3 || num > 60) {
        setErrorMsg('Thời gian di chuyển tối đa phải từ 3 đến 60 phút.');
        return;
      }
      if (onAction) {
        onAction({ type: 'edit_profile', patch: { max_leg_min: num } });
      }
      handleCloseEdit();
      return;
    }

    if (editingField === 'audience') {
      const valid = ['solo', 'couple', 'friends', 'family'];
      if (!audience || !valid.includes(audience)) {
        setErrorMsg('Vui lòng chọn đối tượng hợp lệ.');
        return;
      }
      if (onAction) {
        onAction({ type: 'edit_profile', patch: { audience } });
      }
      handleCloseEdit();
      return;
    }

    if (editingField === 'allergies') {
      const raw = allergiesText.trim();
      if (!raw) {
        setErrorMsg('Vui lòng nhập dị ứng cần tránh.');
        return;
      }
      if (onAction) {
        onAction({ type: 'text', text: `dị ứng ${raw}` });
      }
      handleCloseEdit();
      return;
    }

    if (editingField === 'tastes') {
      const raw = tastesText.trim();
      if (!raw) {
        setErrorMsg('Vui lòng nhập khẩu vị mong muốn.');
        return;
      }
      if (onAction) {
        onAction({ type: 'text', text: `tôi muốn ăn ${raw}` });
      }
      handleCloseEdit();
      return;
    }

    if (editingField === 'area') {
      const raw = areaText.trim();
      if (!raw) {
        setErrorMsg('Vui lòng nhập khu vực.');
        return;
      }
      if (onAction) {
        onAction({ type: 'set_location', location: { district: raw, label: raw } });
      }
      handleCloseEdit();
      return;
    }
  };

  const handleKeyDownDialog = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCloseEdit();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = Array.from(
        dialogContainerRef.current?.querySelectorAll('input, select, button') || []
      ).filter((el) => !el.disabled && el.tabIndex !== -1);

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
    if (editingField && dialogContainerRef.current) {
      const firstInput = dialogContainerRef.current.querySelector('input, select');
      if (firstInput) {
        firstInput.focus();
      }
    }
  }, [editingField]);

  const getFieldTitle = (key) => {
    switch (key) {
      case 'party_size':
        return 'Số người';
      case 'budget':
        return 'Ngân sách';
      case 'vehicle':
        return 'Phương tiện di chuyển';
      case 'start_time':
      case 'time':
        return 'Giờ khởi hành';
      case 'max_leg_min':
        return 'Thời gian di chuyển tối đa';
      case 'audience':
        return 'Đối tượng';
      case 'allergies':
        return 'Dị ứng cần tránh';
      case 'tastes':
        return 'Khẩu vị mong muốn';
      case 'area':
        return 'Khu vực';
      default:
        return key;
    }
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
        flexWrap: 'wrap',
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
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
        onClick={(e) => handleOpenEdit('area', areaDisplayText, e)}
        style={getChipStyle(profile.area)}
      >
        <span>📍</span>
        <span>Khu vực: <strong>{areaDisplayText}</strong></span>
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

      {/* Max Leg Chip */}
      <button
        type="button"
        disabled={busy}
        data-testid="chip-profile-max-leg"
        data-testid-alt="chip-profile-max_leg_min"
        onClick={(e) => handleOpenEdit('max_leg_min', maxLegText, e)}
        style={getChipStyle(profile.max_leg_min)}
      >
        <span>⏱️</span>
        <span>Đi bộ tối đa mỗi chặng: <strong>{maxLegText}</strong></span>
        {getSourceBadge(profile.max_leg_min?.source)}
      </button>

      {/* Tastes Chip */}
      <button
        type="button"
        disabled={busy}
        data-testid="chip-profile-tastes"
        onClick={(e) => handleOpenEdit('tastes', tastesDisplayText, e)}
        style={getChipStyle(profile.tastes)}
      >
        <span>🍜</span>
        <span>Khẩu vị: <strong>{tastesDisplayText}</strong></span>
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

      {/* Accessible Structured Edit Dialog */}
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
            ref={dialogContainerRef}
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              padding: 20,
              width: 360,
              maxWidth: '90vw',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              boxSizing: 'border-box',
            }}
          >
            <h4
              id="dialog-title-profile"
              style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#1F1B16' }}
            >
              Chỉnh sửa: {getFieldTitle(editingField)}
            </h4>
            <form onSubmit={handleSaveEdit} noValidate>
              {/* PARTY SIZE: Number input 1..20 */}
              {editingField === 'party_size' && (
                <div style={{ marginBottom: 12 }}>
                  <label
                    htmlFor="profile-party-input"
                    id="profile-edit-label"
                    style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1F1B16', marginBottom: 6 }}
                  >
                    Số người trong nhóm (1–20):
                  </label>
                  <input
                    id="profile-party-input"
                    data-testid="profile-edit-input"
                    data-testid-alt="profile-party-input"
                    type="number"
                    min="1"
                    max="20"
                    step="1"
                    value={partySize}
                    onChange={(e) => {
                      setPartySize(e.target.value);
                      setErrorMsg('');
                    }}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: errorMsg ? '1px solid #DC2626' : '1px solid #DFD5C6',
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {/* BUDGET: Amount number + unit select + REQUIRED scope select */}
              {editingField === 'budget' && (
                <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label
                      htmlFor="profile-budget-amount"
                      id="profile-edit-label"
                      style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1F1B16', marginBottom: 6 }}
                    >
                      Số tiền ngân sách (1–100.000.000 ₫):
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        id="profile-budget-amount"
                        data-testid="profile-edit-input"
                        data-testid-alt="profile-budget-amount"
                        type="number"
                        min="1"
                        max="100000000"
                        step="1"
                        value={budgetAmount}
                        onChange={(e) => {
                          setBudgetAmount(e.target.value);
                          setErrorMsg('');
                        }}
                        placeholder="Ví dụ: 250 hoặc 600..."
                        style={{
                          flex: 1,
                          minHeight: 44,
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: errorMsg ? '1px solid #DC2626' : '1px solid #DFD5C6',
                          fontSize: 14,
                          boxSizing: 'border-box',
                        }}
                      />
                      <select
                        id="profile-budget-unit"
                        data-testid="profile-budget-unit"
                        aria-label="Đơn vị tiền tệ"
                        value={budgetUnit}
                        onChange={(e) => {
                          setBudgetUnit(e.target.value);
                          setErrorMsg('');
                        }}
                        style={{
                          minHeight: 44,
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: '1px solid #DFD5C6',
                          fontSize: 13,
                          backgroundColor: '#FBF8F3',
                          boxSizing: 'border-box',
                        }}
                      >
                        <option value="1000">nghìn (k / 1.000 ₫)</option>
                        <option value="1000000">triệu (1.000.000 ₫)</option>
                        <option value="1">đồng (₫)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="profile-budget-scope"
                      style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1F1B16', marginBottom: 6 }}
                    >
                      Phạm vi chi tiêu (bắt buộc):
                    </label>
                    <select
                      id="profile-budget-scope"
                      data-testid="profile-budget-scope"
                      value={budgetScope}
                      onChange={(e) => {
                        setBudgetScope(e.target.value);
                        setErrorMsg('');
                      }}
                      style={{
                        width: '100%',
                        minHeight: 44,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: errorMsg && !budgetScope ? '1px solid #DC2626' : '1px solid #DFD5C6',
                        fontSize: 14,
                        backgroundColor: '#FFFFFF',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">-- Chọn phạm vi (bắt buộc) --</option>
                      <option value="per_person">Mỗi người (per_person)</option>
                      <option value="group">Cả nhóm (group)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* VEHICLE: Select of four allowed values */}
              {editingField === 'vehicle' && (
                <div style={{ marginBottom: 12 }}>
                  <label
                    htmlFor="profile-vehicle-select"
                    id="profile-edit-label"
                    style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1F1B16', marginBottom: 6 }}
                  >
                    Phương tiện di chuyển:
                  </label>
                  <select
                    id="profile-vehicle-select"
                    data-testid="profile-edit-input"
                    data-testid-alt="profile-vehicle-select"
                    value={vehicle}
                    onChange={(e) => {
                      setVehicle(e.target.value);
                      setErrorMsg('');
                    }}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: errorMsg ? '1px solid #DC2626' : '1px solid #DFD5C6',
                      fontSize: 14,
                      backgroundColor: '#FFFFFF',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="walk">Đi bộ (walk)</option>
                    <option value="motorbike">Xe máy (motorbike)</option>
                    <option value="car">Ô tô (car)</option>
                    <option value="taxi">Taxi / Grab (taxi)</option>
                  </select>
                </div>
              )}

              {/* START TIME: <input type=time> -> HH:MM */}
              {(editingField === 'start_time' || editingField === 'time') && (
                <div style={{ marginBottom: 12 }}>
                  <label
                    htmlFor="profile-time-input"
                    id="profile-edit-label"
                    style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1F1B16', marginBottom: 6 }}
                  >
                    Giờ khởi hành (HH:MM):
                  </label>
                  <input
                    id="profile-time-input"
                    data-testid="profile-edit-input"
                    data-testid-alt="profile-time-input"
                    type="time"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      setErrorMsg('');
                    }}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: errorMsg ? '1px solid #DC2626' : '1px solid #DFD5C6',
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {/* MAX LEG: Number 3..60 */}
              {editingField === 'max_leg_min' && (
                <div style={{ marginBottom: 12 }}>
                  <label
                    htmlFor="profile-max-leg-input"
                    id="profile-edit-label"
                    style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1F1B16', marginBottom: 6 }}
                  >
                    Thời gian di chuyển tối đa mỗi chặng (3–60 phút):
                  </label>
                  <input
                    id="profile-max-leg-input"
                    data-testid="profile-edit-input"
                    data-testid-alt="profile-max-leg-input"
                    type="number"
                    min="3"
                    max="60"
                    step="1"
                    value={maxLeg}
                    onChange={(e) => {
                      setMaxLeg(e.target.value);
                      setErrorMsg('');
                    }}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: errorMsg ? '1px solid #DC2626' : '1px solid #DFD5C6',
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {/* AUDIENCE: Select */}
              {editingField === 'audience' && (
                <div style={{ marginBottom: 12 }}>
                  <label
                    htmlFor="profile-audience-select"
                    id="profile-edit-label"
                    style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1F1B16', marginBottom: 6 }}
                  >
                    Đối tượng tham gia:
                  </label>
                  <select
                    id="profile-audience-select"
                    data-testid="profile-edit-input"
                    data-testid-alt="profile-audience-select"
                    value={audience}
                    onChange={(e) => {
                      setAudience(e.target.value);
                      setErrorMsg('');
                    }}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: errorMsg ? '1px solid #DC2626' : '1px solid #DFD5C6',
                      fontSize: 14,
                      backgroundColor: '#FFFFFF',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="solo">Đi một mình</option>
                    <option value="couple">Cặp đôi</option>
                    <option value="friends">Nhóm bạn</option>
                    <option value="family">Gia đình</option>
                  </select>
                </div>
              )}

              {/* ALLERGIES: Text turn */}
              {editingField === 'allergies' && (
                <div style={{ marginBottom: 12 }}>
                  <label
                    htmlFor="profile-allergies-input"
                    id="profile-edit-label"
                    style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1F1B16', marginBottom: 6 }}
                  >
                    Dị ứng cần tránh:
                  </label>
                  <input
                    id="profile-allergies-input"
                    data-testid="profile-edit-input"
                    data-testid-alt="profile-allergies-input"
                    type="text"
                    value={allergiesText}
                    onChange={(e) => {
                      setAllergiesText(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="Ví dụ: lạc, cua, tôm..."
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: errorMsg ? '1px solid #DC2626' : '1px solid #DFD5C6',
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ display: 'block', fontSize: 11, color: '#6B6259', marginTop: 4 }}>
                    Thông tin dị ứng sẽ được gửi để máy chủ xử lý an toàn thực phẩm.
                  </span>
                </div>
              )}

              {/* TASTES: Text turn */}
              {editingField === 'tastes' && (
                <div style={{ marginBottom: 12 }}>
                  <label
                    htmlFor="profile-tastes-input"
                    id="profile-edit-label"
                    style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1F1B16', marginBottom: 6 }}
                  >
                    Khẩu vị mong muốn:
                  </label>
                  <input
                    id="profile-tastes-input"
                    data-testid="profile-edit-input"
                    data-testid-alt="profile-tastes-input"
                    type="text"
                    value={tastesText}
                    onChange={(e) => {
                      setTastesText(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="Ví dụ: phở bò, bún chả, cà phê..."
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: errorMsg ? '1px solid #DC2626' : '1px solid #DFD5C6',
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {/* AREA: Set location */}
              {editingField === 'area' && (
                <div style={{ marginBottom: 12 }}>
                  <label
                    htmlFor="profile-area-input"
                    id="profile-edit-label"
                    style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1F1B16', marginBottom: 6 }}
                  >
                    Khu vực tại Hà Nội:
                  </label>
                  <input
                    id="profile-area-input"
                    data-testid="profile-edit-input"
                    data-testid-alt="profile-area-input"
                    type="text"
                    value={areaText}
                    onChange={(e) => {
                      setAreaText(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="Ví dụ: Hoàn Kiếm, Cầu Giấy..."
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: errorMsg ? '1px solid #DC2626' : '1px solid #DFD5C6',
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {errorMsg && (
                <div role="alert" data-testid="profile-edit-error" style={{ color: '#DC2626', fontSize: 12, marginBottom: 10 }}>
                  ⚠️ {errorMsg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button
                  ref={cancelBtnRef}
                  type="button"
                  data-testid="btn-profile-edit-cancel"
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
                  data-testid="btn-profile-edit-save"
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
