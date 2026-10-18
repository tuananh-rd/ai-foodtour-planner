'use client';

import React, { useState } from 'react';
import './guided-leaves.css';

/**
 * ClarifyQuestionCard
 * Renders EXACTLY ONE clarify question card at a time conforming to SVG fidelity spec (owner: Antigravity)
 * - Mint assistant bubble style (--nn-mint, r16, padding 16, max-width 410)
 * - Question text 16/600
 * - Options rendered as reference pills (visual 34h / touch 44h, 13/500, selected = filled green)
 * - Free-text composer styled like reference composer (r16, --nn-bg)
 * - Preserves ALL testids, handlers, options, and keyboard submission
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
      className="nn-assistant-bubble"
      style={{ margin: '8px 0' }}
    >
      {/* Bot message question text */}
      <div
        data-testid="clarify-question-text"
        style={{
          fontWeight: 600,
          fontSize: 16,
          lineHeight: 1.45,
          color: 'var(--nn-ink, #17352B)'
        }}
      >
        {clarify.question}
      </div>

      {/* Option Chips (wrap, min-touch 44px, reference pill styling) */}
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
          {options.map((opt, idx) => {
            const isSelected = opt.selected === true;
            return (
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
                  height: 35,
                  padding: '0 16px',
                  borderRadius: 999,
                  border: `1px solid ${isSelected ? 'var(--nn-green, #166B52)' : 'var(--nn-line, #DDE7E1)'}`,
                  background: isSelected ? 'var(--nn-green, #166B52)' : 'var(--nn-card, #FFFFFF)',
                  color: isSelected ? '#FFFFFF' : 'var(--nn-ink, #17352B)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                {opt.label || opt.option_id}
              </button>
            );
          })}
        </div>
      )}

      {/* Free-text input below chips styled like reference composer */}
      {(clarify.free_text !== false) && (
        <form
          onSubmit={handleFormSubmit}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            background: 'var(--nn-bg, #F7F8F2)',
            border: '1px solid var(--nn-line, #DDE7E1)',
            borderRadius: 16,
            padding: '4px 6px 4px 14px',
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
              minHeight: 40,
              border: 'none',
              background: 'transparent',
              fontSize: 14,
              color: 'var(--nn-ink, #17352B)',
              outline: 'none',
              fontFamily: 'inherit'
            }}
          />
          <button
            type="submit"
            data-testid="clarify-free-text-submit"
            disabled={busy || !typedText.trim()}
            style={{
              minHeight: 40,
              height: 40,
              padding: '0 16px',
              borderRadius: 12,
              border: 'none',
              background: typedText.trim() && !busy ? 'var(--nn-green, #166B52)' : 'var(--nn-line, #DDE7E1)',
              color: typedText.trim() && !busy ? '#FFFFFF' : 'var(--nn-mute, #62736D)',
              fontSize: 13,
              fontWeight: 600,
              cursor: typedText.trim() && !busy ? 'pointer' : 'default',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s ease'
            }}
          >
            Gửi
          </button>
        </form>
      )}
    </div>
  );
}
