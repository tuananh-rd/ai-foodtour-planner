'use client';

import { useState } from 'react';
import { normalizeDisplayText } from '../../lib/emojiSanitizer';

const QUICK_PROMPTS = [
  'Ăn sáng phở và cà phê quanh Hồ Gươm 2 tiếng, 150k mỗi người',
  'Ăn vặt Phố Cổ chiều nay 3 quán: bún chả, nem rán, chè',
  'Tour ẩm thực nghiêm ngặt kiểm tra bằng chứng giờ và tuyến',
  'Yêu cầu bất khả thi: ngân sách 10k đi 5 quán trong 15 phút'
];

export default function ChatPanel({
  messages,
  onSendMessage,
  busy,
  missingSlots = [],
  questions = [],
  onQuickAnswer,
  isMock,
  llmProvider = 'rules'
}) {
  const [inputText, setInputText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim() || busy) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleChipClick = (text) => {
    if (busy) return;
    setInputText(text);
  };

  return (
    <div
      role="region"
      aria-label="Khung trò chuyện với trợ lý FoodTour"
      style={{
        background: '#fff',
        borderRadius: 16,
        padding: 16,
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 460
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid #f0ede4', paddingBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Trợ lý Lập Tour Tiếng Việt
          </h2>
        </div>
        {isMock && (
          <span
            style={{
              fontSize: 10,
              background: '#fff3cd',
              color: '#856404',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid #ffeeba'
            }}
          >
            DỮ LIỆU GIẢ LẬP
          </span>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          paddingRight: 4,
          marginBottom: 12,
          maxHeight: 380
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 'auto 0', padding: 20 }}>
            <p style={{ fontSize: 14, marginBottom: 8 }}>
              Chào bạn! Hãy miêu tả chuyến đi ẩm thực mong muốn tại Hà Nội bằng ngôn ngữ tự nhiên.
            </p>
            <p style={{ fontSize: 12 }}>
              Ví dụ: <em>"Tìm tour ăn sáng quanh Hoàn Kiếm 2 tiếng khoảng 150k mỗi người thích phở và chè"</em>
            </p>
          </div>
        )}

        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={idx}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                background: isUser ? 'var(--accent-primary)' : '#f5f3ec',
                color: isUser ? '#fff' : 'var(--text-primary)',
                padding: '10px 14px',
                borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                fontSize: 14,
                lineHeight: 1.45,
                boxShadow: 'var(--shadow-sm)',
                wordBreak: 'break-word'
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75, marginBottom: 4 }}>
                {isUser ? 'Bạn' : 'Trợ lý AI FoodTour'}
              </div>
              <div style={{ whiteSpace: 'pre-line' }}>{normalizeDisplayText(m.text)}</div>

              {/* Display extracted preferences tags if assistant message */}
              {m.extracted && (
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.08)', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                    Trích xuất thông tin
                    {m.extractionSource && (
                      <span data-extraction-source={m.extractionSource} style={{ fontWeight: 500, opacity: 0.8 }}>
                        {m.extractionSource === 'llm' ? ' (Gemini, đã kiểm tra theo schema)' : ' (bộ luật cục bộ)'}
                      </span>
                    )}:
                  </div>
                  <ul style={{ paddingLeft: 16, margin: 0 }}>
                    {m.extracted.duration_min && <li>Thời lượng: {m.extracted.duration_min} phút</li>}
                    {m.extracted.budget_vnd && (
                      <li>
                        Ngân sách: {m.extracted.budget_vnd.toLocaleString('vi-VN')} ₫ ({m.extracted.budget_scope === 'group' ? 'cả nhóm' : m.extracted.budget_scope === 'per_person' ? 'mỗi người' : 'chưa rõ mỗi người hay cả nhóm'})
                      </li>
                    )}
                    {m.extracted.interests && m.extracted.interests.length > 0 && (
                      <li>Món quan tâm: {m.extracted.interests.map(normalizeDisplayText).join(', ')}</li>
                    )}
                    {m.extracted.mode && <li>Chế độ: {m.extracted.mode === 'strict' ? 'Nghiêm ngặt' : 'Khám phá'}</li>}
                  </ul>
                </div>
              )}
            </div>
          );
        })}

        {/* Questions from backend when required slots are missing */}
        {questions.length > 0 && (
          <div
            style={{
              background: '#fff9e6',
              border: '1px solid #ffe082',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 13,
              color: '#8d6e63'
            }}
          >
            <strong style={{ display: 'block', marginBottom: 6, color: '#e65100' }}>
              Cần thêm thông tin để lập lịch trình:
            </strong>
            <ul style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 4 }}>
              {questions.map((q, idx) => (
                <li key={idx}>{normalizeDisplayText(q)}</li>
              ))}
            </ul>

            {/* Quick response chips for missing slots */}
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {missingSlots.includes('duration_min') && (
                <>
                  <button
                    type="button"
                    onClick={() => onQuickAnswer ? onQuickAnswer('duration_min', 60) : setInputText('Đi trong 60 phút')}
                    style={chipStyle}
                  >
                    60 phút
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuickAnswer ? onQuickAnswer('duration_min', 120) : setInputText('Đi trong 120 phút')}
                    style={chipStyle}
                  >
                    120 phút
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuickAnswer ? onQuickAnswer('duration_min', 180) : setInputText('Đi trong 180 phút')}
                    style={chipStyle}
                  >
                    180 phút
                  </button>
                </>
              )}
              {missingSlots.includes('budget_scope') && (
                <>
                  <button
                    type="button"
                    onClick={() => onQuickAnswer ? onQuickAnswer('budget_scope', 'per_person') : setInputText('Ngân sách mỗi người')}
                    style={chipStyle}
                  >
                    Cho mỗi người
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuickAnswer ? onQuickAnswer('budget_scope', 'group') : setInputText('Ngân sách cả nhóm')}
                    style={chipStyle}
                  >
                    Cho cả nhóm
                  </button>
                </>
              )}
              {missingSlots.includes('origin') && (
                <>
                  <button
                    type="button"
                    onClick={() => onQuickAnswer ? onQuickAnswer('origin', 'hoankiem') : setInputText('Xuất phát từ Hồ Hoàn Kiếm')}
                    style={chipStyle}
                  >
                    Hồ Hoàn Kiếm
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuickAnswer ? onQuickAnswer('origin', 'phoco') : setInputText('Xuất phát từ Phố Cổ')}
                    style={chipStyle}
                  >
                    Phố Cổ
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Prompts Suggestions */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
        {QUICK_PROMPTS.map((prompt, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleChipClick(prompt)}
            disabled={busy}
            style={{
              whiteSpace: 'nowrap',
              fontSize: 11,
              padding: '4px 8px',
              background: '#f2f0e8',
              border: '1px solid #e0ddd3',
              borderRadius: 12,
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Waiting hint: a real LLM call can take several seconds */}
      <div role="status" aria-live="polite" style={{ minHeight: 0, fontSize: 12, color: 'var(--text-secondary)', marginBottom: busy && llmProvider === 'gemini' ? 6 : 0 }}>
        {busy && llmProvider === 'gemini'
          ? 'Gemini đang phân tích yêu cầu… thường mất vài giây, có khi tới 20 giây; nếu quá lâu hệ thống sẽ dùng bộ luật cục bộ và ghi rõ.'
          : ''}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Nhập yêu cầu foodtour bằng tiếng Việt..."
          disabled={busy}
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid var(--border-color)',
            fontSize: 14,
            outline: 'none',
            minHeight: 44
          }}
          aria-label="Nội dung tin nhắn yêu cầu tour"
        />
        <button
          type="submit"
          disabled={busy || !inputText.trim()}
          style={{
            minWidth: 80,
            minHeight: 44,
            padding: '0 16px',
            background: busy ? '#999' : 'var(--accent-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            cursor: busy ? 'not-allowed' : 'pointer'
          }}
          aria-busy={busy}
        >
          {busy ? 'Đang gửi…' : 'Gửi'}
        </button>
      </form>
    </div>
  );
}

const chipStyle = {
  fontSize: 12,
  padding: '5px 10px',
  background: '#fff',
  border: '1px solid #ffb74d',
  borderRadius: 8,
  color: '#e65100',
  fontWeight: 600,
  cursor: 'pointer'
};
