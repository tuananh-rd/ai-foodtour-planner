'use client';

import React, { useState, useRef, useEffect } from 'react';
import BlockRenderer from './BlockRenderer';
import { normalizeDisplayText } from '../../../../lib/emojiSanitizer';

/**
 * ChatColumn (Workspace Left Column, TASK C3-1)
 *
 * Requirements:
 * - Messages history + scroll to latest
 * - aria-live="polite" for new bot messages
 * - Block renderers for reply blocks (text, notice, clarify, etc.)
 * - Understanding badge: 'bộ luật cục bộ' / 'AI' / 'đã dùng kết quả trước'
 * - Composer input + send button (touch targets >= 44px)
 * - In-flight guard: disable submit during in-flight requests
 */
export default function ChatColumn({
  messages = [],
  onSendMessage,
  onAction,
  shortlist = [],
  busy = false,
}) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!busy) {
      isSubmittingRef.current = false;
    }
  }, [busy]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSubmittingRef.current || busy) return;
    const inputEl = e.currentTarget?.querySelector('input');
    const val = (inputText || inputEl?.value || '').trim();
    if (!val) return;
    isSubmittingRef.current = true;
    if (onSendMessage) {
      onSendMessage(val);
      setInputText('');
      if (inputEl) inputEl.value = '';
    }
  };

  const getUnderstandingLabel = (src) => {
    if (src === 'rules' || src === 'action') return 'bộ luật cục bộ';
    if (src === 'llm') return 'AI';
    if (src === 'cache') return 'đã dùng kết quả trước';
    return 'bộ luật cục bộ';
  };

  return (
    <div
      data-testid="zone-chat"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#FBF8F3',
        borderRight: '1px solid #DFD5C6',
        boxSizing: 'border-box',
      }}
    >
      {/* Messages Scroll Area with ARIA live region */}
      <div
        aria-live="polite"
        aria-label="Lịch sử hội thoại"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#6B6259', padding: '40px 10px', fontSize: 13 }}>
            Hãy bắt đầu bằng cách gõ tin nhắn hoặc chọn gợi ý bên dưới.
          </div>
        )}

        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const isLastAssistant = !isUser && idx === messages.length - 1;

          return (
            <div
              key={idx}
              data-testid={`chat-message-${msg.role}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '100%',
              }}
            >
              {/* Sender Name / Tag */}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#6B6259',
                  marginBottom: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>{isUser ? 'Bạn' : 'AI Trợ lý'}</span>
                {!isUser && msg.turn?.understanding && (
                  <span
                    data-testid="understanding-badge"
                    style={{
                      background: '#EFECE6',
                      color: '#413C36',
                      fontSize: 10,
                      padding: '1px 5px',
                      borderRadius: 4,
                    }}
                  >
                    {getUnderstandingLabel(msg.turn.understanding)}
                  </span>
                )}
              </div>

              {/* Message Bubble */}
              <div
                style={{
                  background: isUser ? '#C8431A' : '#FFFFFF',
                  color: isUser ? '#FFFFFF' : '#1F1B16',
                  borderRadius: isUser ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                  padding: isUser ? '10px 14px' : '12px 14px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  border: isUser ? 'none' : '1px solid #DFD5C6',
                  maxWidth: '85%',
                  wordBreak: 'break-word',
                  fontSize: 14,
                }}
              >
                {isUser ? (
                  <span>{normalizeDisplayText(msg.text)}</span>
                ) : (
                  <div>
                    {/* Render blocks inside assistant message */}
                    {(msg.reply?.blocks || []).map((b, bIdx) => {
                      // Only render inline blocks in chat (text, notice, clarify); explore blocks go to ExploreColumn
                      if (b.type === 'text' || b.type === 'notice' || b.type === 'clarify') {
                        return (
                          <BlockRenderer
                            key={bIdx}
                            block={b}
                            onAction={onAction}
                            shortlist={shortlist}
                            busy={busy}
                            isNew={isLastAssistant}
                          />
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer Form at Bottom */}
      <form
        onSubmit={handleSubmit}
        data-testid="chat-form"
        style={{
          padding: '12px 16px',
          background: '#FFFFFF',
          borderTop: '1px solid #DFD5C6',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Nhập tin nhắn... (hoặc bấm nút gợi ý)"
          aria-label="Tin nhắn"
          data-testid="chat-input"
          disabled={busy}
          style={{
            flex: 1,
            minHeight: 44,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #DFD5C6',
            fontSize: 14,
            color: '#1F1B16',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={busy || !inputText.trim()}
          data-testid="chat-send"
          style={{
            minHeight: 44,
            minWidth: 70,
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: busy || !inputText.trim() ? '#E5E7EB' : '#C8431A',
            color: busy || !inputText.trim() ? '#9CA3AF' : '#FFFFFF',
            fontWeight: 700,
            fontSize: 14,
            cursor: busy || !inputText.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? '…' : 'Gửi'}
        </button>
      </form>
    </div>
  );
}
