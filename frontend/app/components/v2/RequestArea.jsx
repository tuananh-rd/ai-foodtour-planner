'use client';

import React, { useState } from 'react';
import Button from '../../ui/Button';
import Chip from '../../ui/Chip';

// 4 One-tap suggestion chips per UPGRADE_PLAN §3.2
export const SUGGESTION_CHIPS = [
  {
    id: 'pho_cafe',
    label: '🍜 Phở & Cà phê quanh Hồ Gươm',
    text: 'Ăn sáng phở và cà phê quanh Hồ Gươm 2 tiếng, 150k mỗi người',
    prefs: { duration_min: 120, budget_vnd: 150000, budget_scope: 'per_person', interests: ['phở', 'cà phê'] },
  },
  {
    id: 'snack_3stops',
    label: '🍢 Ăn vặt 3 quán chiều nay',
    text: 'Ăn vặt Phố Cổ chiều nay 3 quán: bún chả, nem rán, chè',
    prefs: { duration_min: 150, max_stops: 3, interests: ['bún chả', 'nem rán', 'chè'] },
  },
  {
    id: 'strict_mode',
    label: '🛡️ Nghiêm ngặt đủ bằng chứng',
    text: 'Tour ẩm thực nghiêm ngặt kiểm tra bằng chứng giờ và tuyến',
    prefs: { mode: 'strict' },
  },
  {
    id: 'budget',
    label: '💸 Dưới 100k/người',
    text: 'Ngân sách dưới 100k mỗi người, món bún hoặc bánh mì',
    prefs: { budget_vnd: 100000, budget_scope: 'per_person', interests: ['bún', 'bánh mì'] },
  },
];

const quickChipStyle = {
  minHeight: '44px',
  padding: '6px 12px',
  backgroundColor: '#FFFFFF',
  border: '1px solid #FDE68A',
  borderRadius: '6px',
  color: '#78350F',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
};

/**
 * RequestArea for UI_V2 (Scope 2, F03, F05, F06).
 * Features:
 * - Free text input with visible focus ring (F06)
 * - 4 one-tap chips that pre-fill the request
 * - Clarification & conversation surface for questions/missing slots/notes (F03)
 * - 'Tuỳ chọn' button opening PreferencesSheet
 * - 'Lập hành trình' action button
 * - Real metadata provenance & normal-mode synthetic data disclosure (F05)
 */
export default function RequestArea({
  onSendMessage,
  onPlanTour,
  onOpenPreferences,
  onSelectSuggestion,
  busy = false,
  originLabel = 'Hồ Hoàn Kiếm / Phố Cổ',
  questions = [],
  missingSlots = [],
  notes = [],
  messages = [],
  health = null,
  datasetSource = null,
  datasetVersion = null,
  isMock = false,
  className = '',
  style = {},
}) {
  const [inputText, setInputText] = useState('');
  const [selectedChipId, setSelectedChipId] = useState(null);
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e) => {
    e?.preventDefault();
    const formEl = e?.target;
    const inp =
      formEl?.querySelector?.('input[data-request-input]') ||
      (typeof document !== 'undefined' ? document.querySelector('input[data-request-input]') : null);
    const rawVal = inp ? inp.value : '';
    const text = (inputText || rawVal || '').trim();
    if (text) {
      setInputText('');
      if (inp) inp.value = '';
      if (onSendMessage) {
        onSendMessage(text);
      }
    } else {
      if (onPlanTour) {
        onPlanTour();
      }
    }
  };

  const handleChipClick = (chip) => {
    setSelectedChipId(chip.id);
    setInputText(chip.text);
    if (onSelectSuggestion) {
      onSelectSuggestion(chip);
    }
  };

  const handleQuickAnswer = (answerText) => {
    setInputText('');
    const inp =
      typeof document !== 'undefined'
        ? document.querySelector('input[data-request-input]')
        : null;
    if (inp) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(inp, '');
      } else {
        inp.value = '';
      }
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (onSendMessage) {
      onSendMessage(answerText);
    }
  };

  // Derive provenance metadata (F05)
  const isSynthetic = isMock || datasetSource === 'synthetic';
  const venueCount =
    typeof health?.venues_count === 'number'
      ? health.venues_count
      : typeof health?.dataset_venues === 'number'
      ? health.dataset_venues
      : null;

  let provenanceText = '';
  if (isSynthetic) {
    provenanceText = 'Mẫu thử giả lập (synthetic)';
  } else if (venueCount !== null) {
    provenanceText = `${venueCount.toLocaleString('vi-VN')} quán Hà Nội`;
  } else {
    provenanceText = 'Khu vực Phố Cổ, Hà Nội';
  }

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

      {/* Conversation history surface (F03) */}
      {messages.length > 0 && (
        <div
          data-clarification-conversation
          style={{
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '260px',
            overflowY: 'auto',
            padding: '8px',
            backgroundColor: '#FAF9F5',
            borderRadius: '8px',
            border: '1px solid var(--border, #DFD5C6)',
          }}
        >
          {messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
                backgroundColor: m.role === 'user' ? 'var(--accent, #C8431A)' : '#FFFFFF',
                color: m.role === 'user' ? '#FFFFFF' : 'var(--text, #1F1B16)',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                lineHeight: 1.45,
                border: m.role === 'user' ? 'none' : '1px solid var(--border, #DFD5C6)',
                wordBreak: 'break-word',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '11px', opacity: 0.8, marginBottom: '2px' }}>
                {m.role === 'user' ? 'Bạn' : 'Trợ lý AI'}
              </div>
              <div style={{ whiteSpace: 'pre-line' }}>{m.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* Questions from backend when slots are missing (F03) */}
      {questions.length > 0 && (
        <div
          data-clarification-questions
          role="region"
          aria-label="Cần thêm thông tin để lập lịch trình"
          style={{
            backgroundColor: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '12px 14px',
            marginBottom: '14px',
            color: '#78350F',
            fontSize: '13px',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '6px', color: '#92400E' }}>
            ❓ Cần thêm thông tin để lập lịch trình:
          </strong>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {questions.map((q, idx) => (
              <li key={idx} style={{ marginBottom: '4px' }}>
                {q}
              </li>
            ))}
          </ul>

          {/* Quick response chips for missing slots */}
          {missingSlots && missingSlots.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
              {missingSlots.includes('duration_min') && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleQuickAnswer('Đi trong 60 phút')}
                    style={quickChipStyle}
                  >
                    ⏱️ 60 phút
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleQuickAnswer('Đi trong 120 phút')}
                    style={quickChipStyle}
                  >
                    ⏱️ 120 phút
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleQuickAnswer('Đi trong 180 phút')}
                    style={quickChipStyle}
                  >
                    ⏱️ 180 phút
                  </button>
                </>
              )}
              {missingSlots.includes('budget_scope') && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleQuickAnswer('Ngân sách tính theo mỗi người')}
                    style={quickChipStyle}
                  >
                    👤 Mỗi người
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleQuickAnswer('Ngân sách tính cho cả nhóm')}
                    style={quickChipStyle}
                  >
                    👥 Cả nhóm
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* System notes / notices (F03) */}
      {notes.length > 0 && (
        <div
          data-clarification-notes
          role="note"
          style={{
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '10px 14px',
            marginBottom: '14px',
            color: '#1E3A8A',
            fontSize: '13px',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '4px' }}>
            💬 Lưu ý từ hệ thống trích xuất yêu cầu:
          </strong>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {notes.map((n, idx) => (
              <li key={idx} style={{ marginBottom: '2px' }}>
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Form Input Area */}
      <form onSubmit={handleSubmit} style={{ width: '100%' }}>
        <div style={{ position: 'relative', width: '100%', marginBottom: '14px' }}>
          <input
            type="text"
            data-request-input
            className="ft-request-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={busy}
            placeholder="Ví dụ: phở và chè quanh Hồ Gươm, 2 giờ..."
            aria-label="Nhu cầu ẩm thực hoặc món bạn muốn thử"
            style={{
              width: '100%',
              minHeight: '48px',
              padding: '12px 16px',
              fontSize: '15px',
              borderRadius: 'var(--radius-md, 8px)',
              border: isFocused ? '2px solid var(--accent, #C8431A)' : '1.5px solid var(--border, #DFD5C6)',
              outline: isFocused ? '2px solid var(--accent, #C8431A)' : 'none',
              outlineOffset: isFocused ? '2px' : '0px',
              boxShadow: isFocused ? '0 0 0 3px rgba(200, 67, 26, 0.25)' : 'none',
              backgroundColor: '#FAFAF8',
              color: 'var(--text, #1F1B16)',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
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

      {/* Local Dataset Provenance Note & Synthetic Data Disclosure (F05) */}
      <div
        data-provenance-footer
        style={{
          marginTop: '16px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border, #DFD5C6)',
          fontSize: '12px',
          color: 'var(--muted, #6B6259)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {isSynthetic && (
            <span
              data-synthetic-badge
              style={{
                background: '#D9532F',
                color: '#FFFFFF',
                fontWeight: 800,
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              DỮ LIỆU GIẢ LẬP
            </span>
          )}
          <span>📍 Dữ liệu: {provenanceText} · Dữ liệu cục bộ chưa xác minh</span>
        </div>
        <span>🚶 Đi bộ tối ưu trong Phố Cổ</span>
      </div>
    </section>
  );
}
