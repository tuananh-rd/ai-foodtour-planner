'use client';

import React, { useState } from 'react';
import Button from '../../ui/Button';
import Chip from '../../ui/Chip';

const SUGGESTION_CHIPS = [
  {
    id: 'breakfast',
    label: '🍜 Ăn sáng 2 giờ',
    text: 'Ăn sáng phở và cà phê quanh Hồ Gươm, 2 giờ',
    prefs: { start_time: '08:00', duration_min: 120, interests: ['phở', 'cà phê'], meal: 'breakfast' },
  },
  {
    id: 'evening',
    label: '🌙 Ăn vặt chiều tối',
    text: 'Ăn vặt nem rán và chè Phố Cổ chiều tối, 2 giờ',
    prefs: { start_time: '18:30', duration_min: 120, interests: ['nem', 'chè'], meal: 'dinner' },
  },
  {
    id: 'family',
    label: '👨‍👩‍👧 Đi gia đình',
    text: 'Đi cùng gia đình, quán rộng rãi, 3 quán',
    prefs: { audience: 'family', duration_min: 150, max_stops: 3 },
  },
  {
    id: 'budget',
    label: '💸 Dưới 100k/người',
    text: 'Ngân sách dưới 100k mỗi người, món bún hoặc bánh mì',
    prefs: { budget_vnd: 100000, budget_scope: 'per_person', interests: ['bún', 'bánh mì'] },
  },
];

/**
 * RequestArea for UI_V2 (Scope 2).
 * Features:
 * - Free text input
 * - 4 one-tap chips that pre-fill the request
 * - 'Tuỳ chọn' button opening PreferencesSheet
 * - 'Lập hành trình' action button
 * - Provenance note: "Dữ liệu cục bộ chưa xác minh"
 */
export default function RequestArea({
  onSendMessage,
  onPlanTour,
  onOpenPreferences,
  onSelectSuggestion,
  busy = false,
  originLabel = 'Hồ Hoàn Kiếm / Phố Cổ',
  className = '',
  style = {},
}) {
  const [inputText, setInputText] = useState('');
  const [selectedChipId, setSelectedChipId] = useState(null);

  const handleSubmit = (e) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (text) {
      onSendMessage(text);
    } else {
      onPlanTour();
    }
  };

  const handleChipClick = (chip) => {
    setSelectedChipId(chip.id);
    setInputText(chip.text);
    if (onSelectSuggestion) {
      onSelectSuggestion(chip);
    }
  };

  return (
    <section
      data-request-area
      className={`ft-request-area ${className}`.trim()}
      aria-label="Nhập nhu cầu ẩm thực của bạn"
      style={{
        backgroundColor: 'var(--card-bg, #FFFFFF)',
        border: '1px solid var(--border, #DFD5C6)',
        borderRadius: 'var(--radius-lg, 12px)',
        padding: '20px',
        marginBottom: '20px',
        boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(31, 27, 22, 0.08))',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <h2
        style={{
          fontSize: 'var(--type-20, 20px)',
          fontWeight: 700,
          color: 'var(--text, #1F1B16)',
          margin: '0 0 8px 0',
        }}
      >
        Hôm nay bạn muốn ăn gì?
      </h2>
      <p style={{ fontSize: '14px', color: 'var(--muted, #6B6259)', margin: '0 0 16px 0' }}>
        Xuất phát từ <strong>{originLabel}</strong>. Nhập tự do hoặc bấm gợi ý bên dưới:
      </p>

      {/* Form Input Area */}
      <form onSubmit={handleSubmit} style={{ width: '100%' }}>
        <div style={{ position: 'relative', width: '100%', marginBottom: '14px' }}>
          <input
            type="text"
            data-request-input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={busy}
            placeholder="Ví dụ: phở và chè quanh Hồ Gươm, 2 giờ..."
            aria-label="Nhu cầu ẩm thực hoặc món bạn muốn thử"
            style={{
              width: '100%',
              minHeight: '48px',
              padding: '12px 16px',
              fontSize: '15px',
              borderRadius: 'var(--radius-md, 8px)',
              border: '1.5px solid var(--border, #DFD5C6)',
              backgroundColor: '#FAFAF8',
              color: 'var(--text, #1F1B16)',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s ease',
            }}
          />
        </div>

        {/* 4 One-tap Chips */}
        <div
          data-suggestion-chips-group
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '18px',
          }}
        >
          {SUGGESTION_CHIPS.map((chip) => (
            <Chip
              key={chip.id}
              data-suggestion-chip
              selected={selectedChipId === chip.id}
              onClick={() => handleChipClick(chip)}
              disabled={busy}
              style={{ minHeight: '44px', fontSize: '13px', padding: '8px 14px' }}
            >
              {chip.label}
            </Chip>
          ))}
        </div>

        {/* Primary Action Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <Button
            type="submit"
            data-plan-tour-button
            variant="primary"
            disabled={busy}
            loading={busy}
            style={{
              minHeight: '44px',
              padding: '10px 24px',
              fontSize: '15px',
              fontWeight: 700,
            }}
          >
            {busy ? 'Đang tạo…' : 'Lập hành trình ▸'}
          </Button>

          {onOpenPreferences && (
            <Button
              type="button"
              variant="secondary"
              onClick={onOpenPreferences}
              disabled={busy}
              style={{
                minHeight: '44px',
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              ⚙️ Tuỳ chọn & Điểm xuất phát
            </Button>
          )}
        </div>
      </form>

      {/* Local Dataset Provenance Note */}
      <div
        style={{
          marginTop: '16px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border, #DFD5C6)',
          fontSize: '12px',
          color: 'var(--muted, #6B6259)',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <span>📍 Dữ liệu: 1.702 quán Hà Nội · Dữ liệu cục bộ chưa xác minh</span>
        <span>🚶 Đi bộ tối ưu trong Phố Cổ</span>
      </div>
    </section>
  );
}
