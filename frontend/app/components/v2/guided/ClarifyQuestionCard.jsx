'use client';

import React, { useState } from 'react';

/**
 * ClarifyQuestionCard
 * Renders EXACTLY ONE clarify question card at a time.
 * - Options rendered as chip buttons (wrap, min-touch 44px)
 * - Free-text composer below chips
 */
export default function ClarifyQuestionCard({
  clarify,
  onPickOption,
  onSubmitText,
  busy = false
}) {
  const [typedText, setTypedText] = useState('');

  if (!clarify) return null;

  const options = Array.isArray(clarify.options) ? clarify.options : [];

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const val = (typedText || e.target.querySelector('input')?.value || '').trim();
    if (!val || busy) return;
    setTypedText('');
    onSubmitText && onSubmitText(val);
  };

  return (
    <div
      data-testid="clarify-question-card"
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
      {/* Bot message bubble for the question */}
      <div
        data-testid="clarify-question-text"
        style={{
          background: 'var(--chip, #f3ece0)',
          color: 'var(--ink, #231f1a)',
          padding: '12px 14px',
          borderRadius: 12,
          fontWeight: 600,
          fontSize: 15,
          lineHeight: 1.45
        }}
      >
        {clarify.question}
      </div>

      {/* Option Chips (wrap, min-touch 44px) */}
      {options.length > 0 && (
        <div
          data-testid="clarify-options-container"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center'
          }}
        >
          {options.map((opt, idx) => (
            <button
              key={opt.option_id || idx}
              type="button"
              data-testid={`clarify-option-${opt.option_id}`}
              data-option-index={idx}
              data-option-id={opt.option_id}
              onClick={() => !busy && onPickOption && onPickOption(opt.option_id)}
              disabled={busy}
              style={{
                minHeight: 44,
                minWidth: 44,
                padding: '0 16px',
                borderRadius: 22,
                border: '1px solid var(--line, #e6dfd3)',
                background: 'var(--card, #fff)',
                color: 'var(--ink, #231f1a)',
                fontSize: 14,
                fontWeight: 500,
                cursor: busy ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                transition: 'all 0.15s ease'
              }}
            >
              {opt.label || opt.option_id}
            </button>
          ))}
        </div>
      )}

      {/* Free-text input below chips */}
      {(clarify.free_text !== false) && (
        <form
          onSubmit={handleFormSubmit}
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 4
          }}
        >
          <input
            type="text"
            data-testid="clarify-free-text-input"
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const val = (e.target.value || typedText).trim();
                if (val && !busy) {
                  setTypedText('');
                  onSubmitText && onSubmitText(val);
                }
              }
            }}
            disabled={busy}
            placeholder="Hoặc gõ câu trả lời của bạn…"
            style={{
              flex: 1,
              minHeight: 44,
              border: '1px solid var(--line, #e6dfd3)',
              borderRadius: 12,
              padding: '0 14px',
              fontSize: 14,
              color: 'var(--ink, #231f1a)',
              background: '#fff',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            data-testid="clarify-free-text-submit"
            disabled={busy || !typedText.trim()}
            style={{
              minHeight: 44,
              padding: '0 18px',
              borderRadius: 12,
              border: 'none',
              background: typedText.trim() && !busy ? 'var(--accent, #c2410c)' : 'var(--chip, #f3ece0)',
              color: typedText.trim() && !busy ? '#fff' : 'var(--mute, #6b6257)',
              fontSize: 14,
              fontWeight: 600,
              cursor: typedText.trim() && !busy ? 'pointer' : 'default'
            }}
          >
            Gửi
          </button>
        </form>
      )}
    </div>
  );
}
