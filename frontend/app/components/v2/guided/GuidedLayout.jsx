'use client';

import React, { useState, useEffect, useRef } from 'react';
import UnderstoodCard from './UnderstoodCard';
import ClarifyQuestionCard from './ClarifyQuestionCard';
import ConfirmSummaryCard from './ConfirmSummaryCard';
import GuidedTimeline from './GuidedTimeline';
import TrustDisclosure from './TrustDisclosure';
import { chatTurn, createSession, getSession } from '../../../../lib/api';

/**
 * GuidedLayout (TASK U4a)
 * Visual target: docs/ux/guided-flow-mockup.html
 * Contract: v1.9.1
 *
 * 5 Core Steps:
 * 1. Start: Single large composer + 3-4 suggestion chips
 * 2. Stream & "Mình hiểu là…": Understood card with row-level Sửa/Chọn, always-visible allergy row, calm safety note
 * 3. Single Question: EXACTLY ONE clarify question card at a time with option chips (wrap, min-touch 44px) + free-text input
 * 4. Confirmation: Confirm summary card with ONE primary button "Đúng, lập tour" (confirm_yes) and "Sửa"
 * 5. Tour: Vertical timeline with honest labels (price "theo nguồn", distance "ước tính", hours "nguồn ghi", allergy note), free Maps URL CTA, 3 secondary actions
 *
 * Trust line: Exactly ONE quiet line under stream + "Chi tiết" disclosure
 * Banned words: Zero "bộ luật cục bộ", "Gemini", "intent", "pending", "slot", "llm", "provenance", "JSON", raw UUIDs, "null", "undefined"
 */
export default function GuidedLayout({
  sessionId: initialSessionId,
  sessionToken: initialSessionToken,
  revision: initialRevision = 0,
  health,
  clientConfig,
  onResetSession
}) {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [sessionToken, setSessionToken] = useState(initialSessionToken || '');
  const [revision, setRevision] = useState(initialRevision);

  // Conversation turns stream
  const [messages, setMessages] = useState([]);
  const [chatState, setChatState] = useState(null);
  const [tour, setTour] = useState(null);
  const [latestTurnMeta, setLatestTurnMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  const [inputText, setInputText] = useState('');

  const inputRef = useRef(null);

  // Initialize session if missing
  useEffect(() => {
    if (!sessionId) {
      setBusy(true);
      createSession()
        .then((s) => {
          setSessionId(s.session_id);
          setSessionToken(s.token || '');
          setRevision(s.revision || 0);
          setBusy(false);
        })
        .catch(() => setBusy(false));
    }
  }, [sessionId]);

  // Execute turn action or text
  const executeTurn = async ({ text = null, action = null }) => {
    if (busy || (!text && !action)) return;
    setBusy(true);

    // If user text, append to stream immediately
    if (text) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', text, timestamp: Date.now() }
      ]);
    }

    try {
      const convParam = typeof window !== 'undefined'
        ? (new URLSearchParams(window.location.search).get('conv') || new URLSearchParams(window.location.search).get('scenario'))
        : null;

      const body = {
        text,
        action,
        revision,
        conv: convParam,
        guided: true
      };

      const res = await chatTurn(sessionId, body, sessionToken);

      if (res) {
        if (res.revision !== undefined) setRevision(res.revision);
        if (res.chat) setChatState(res.chat);
        if (res.tour) setTour(res.tour);
        if (res.turn) setLatestTurnMeta(res.turn);

        // Append assistant response to stream
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            reply: res.reply || { blocks: [] },
            chat: res.chat,
            tour: res.tour,
            timestamp: Date.now()
          }
        ]);
      }
    } catch (err) {
      console.error('[GuidedLayout] Turn error:', err);
    } finally {
      setBusy(false);
    }
  };

  const handleSendMessage = (textToSend = null) => {
    const text = (textToSend || inputText).trim();
    if (!text || busy) return;
    setInputText('');
    executeTurn({ text });
  };

  const handlePickOption = (option_id) => {
    executeTurn({
      action: {
        name: 'pick_option',
        payload: { option_id },
        type: 'pick_option',
        option_id
      }
    });
  };

  const handleConfirmYes = () => {
    executeTurn({
      action: {
        name: 'confirm_yes',
        type: 'confirm_yes'
      }
    });
  };

  const handleConfirmNo = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
    executeTurn({
      action: {
        name: 'confirm_no',
        type: 'confirm_no'
      }
    });
  };

  const handleInlineSave = (slotKey, value) => {
    executeTurn({
      action: {
        name: 'edit_profile',
        payload: { [slotKey]: value },
        type: 'edit_profile',
        patch: { [slotKey]: value }
      }
    });
  };

  const handleFreeFormEdit = (field) => {
    const label = field?.label || field?.id || 'thông tin';
    const prompt = `Đổi ${label.toLowerCase()} thành: `;
    setInputText(prompt);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleRestart = () => {
    setMessages([]);
    setChatState(null);
    setTour(null);
    setLatestTurnMeta(null);
    setInputText('');
    onResetSession && onResetSession();
  };

  const isStartScreen = messages.length === 0;

  // Extract latest blocks from stream
  const latestAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
  const latestBlocks = latestAssistantMsg?.reply?.blocks || [];

  const textBlocks = latestBlocks.filter((b) => b.type === 'text');
  const noticeBlocks = latestBlocks.filter((b) => b.type === 'notice');
  const understoodBlock = latestBlocks.find((b) => b.type === 'understood');
  const clarifyBlock = latestBlocks.find((b) => b.type === 'clarify');
  const confirmSummaryBlock = latestBlocks.find((b) => b.type === 'confirm_summary');
  const tourReadyBlock = latestBlocks.find((b) => b.type === 'tour_ready');

  // Tour Gate: Tour is rendered ONLY when tour is available and tour_ready block or planned phase is reached
  const showTour = Boolean(tour && (tourReadyBlock || chatState?.phase === 'planned'));

  // Allergies for display
  const currentAllergies = understoodBlock?.allergies || chatState?.allergies || [];

  return (
    <div
      data-testid="guided-container"
      aria-busy={busy}
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg, #faf7f2)',
        color: 'var(--ink, #231f1a)',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '16px 12px 48px',
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          display: 'grid',
          gap: 16
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: 12,
            borderBottom: '1px solid var(--line, #e6dfd3)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>🍜</span>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 800,
                margin: 0,
                color: 'var(--accent, #c2410c)'
              }}
            >
              AI FoodTour Hà Nội
            </h1>
            <span
              style={{
                fontSize: 11,
                background: 'var(--chip, #f3ece0)',
                color: 'var(--mute, #6b6257)',
                padding: '2px 8px',
                borderRadius: 12,
                fontWeight: 600
              }}
            >
              LUỒNG DẪN DẮT
            </span>
          </div>

          <button
            type="button"
            data-testid="guided-reset-btn"
            onClick={handleRestart}
            disabled={busy}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--line, #e6dfd3)',
              background: '#fff',
              color: 'var(--mute, #6b6257)',
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >
            Làm lại
          </button>
        </header>

        {/* STEP 1: START SCREEN (When 0 messages) */}
        {isStartScreen && (
          <div
            data-testid="guided-start-screen"
            style={{
              background: 'var(--card, #fff)',
              border: '1px solid var(--line, #e6dfd3)',
              borderRadius: 16,
              padding: 20,
              display: 'grid',
              gap: 16
            }}
          >
            {/* Welcome Bot Bubble */}
            <div
              data-testid="guided-welcome-msg"
              style={{
                background: 'var(--chip, #f3ece0)',
                color: 'var(--ink, #231f1a)',
                padding: '12px 16px',
                borderRadius: 14,
                fontSize: 15,
                lineHeight: 1.5,
                fontWeight: 500
              }}
            >
              Bạn muốn ăn gì, ở đâu, đi mấy người? Cứ nói tự nhiên, mình sẽ hỏi thêm nếu thiếu.
            </div>

            {/* 3-4 Suggestion Chips (wrap, min-touch 44px) */}
            <div
              data-testid="suggestion-chips-container"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8
              }}
            >
              {[
                { label: 'Ăn tối 2 người quanh Hồ Gươm', text: 'Tôi muốn ăn tối 2 người quanh Hồ Gươm, ngân sách 500k, thích phở và bún chả.' },
                { label: 'Tour ăn vặt buổi chiều', text: 'Gợi ý tour ăn vặt buổi chiều quanh Phố Cổ khoảng 90 phút.' },
                { label: 'Gợi ý món ngày se lạnh', text: 'Trời lạnh thế này quanh Hồ Gươm có món gì ấm bụng cho 2 người?' },
                { label: '3 quán quanh Phố Cổ 120 phút', text: 'Tour 3 quán quanh Phố Cổ tối nay 120 phút.' }
              ].map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  data-testid={`suggestion-chip-${idx}`}
                  onClick={() => handleSendMessage(chip.text)}
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
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Single Large Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center'
              }}
            >
              <input
                ref={inputRef}
                type="text"
                data-testid="guided-input"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={busy}
                placeholder="Ví dụ: 3 quán quanh Hồ Gươm tối nay…"
                style={{
                  flex: 1,
                  minHeight: 48,
                  border: '1px solid var(--line, #e6dfd3)',
                  borderRadius: 12,
                  padding: '0 16px',
                  fontSize: 15,
                  color: 'var(--ink, #231f1a)',
                  background: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="submit"
                data-testid="guided-send-btn"
                disabled={busy || !inputText.trim()}
                style={{
                  minHeight: 48,
                  padding: '0 22px',
                  borderRadius: 12,
                  border: 'none',
                  background: inputText.trim() && !busy ? 'var(--accent, #c2410c)' : 'var(--chip, #f3ece0)',
                  color: inputText.trim() && !busy ? '#fff' : 'var(--mute, #6b6257)',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: inputText.trim() && !busy ? 'pointer' : 'default'
                }}
              >
                Gửi
              </button>
            </form>

            {/* Exactly ONE quiet trust line */}
            <TrustDisclosure turn={latestTurnMeta} health={health} />
          </div>
        )}

        {/* STREAM VIEW (When messages exist) */}
        {!isStartScreen && (
          <div
            data-testid="guided-stream"
            style={{
              display: 'grid',
              gap: 16
            }}
          >
            {/* Stream turns */}
            {messages.map((msg, idx) => {
              if (msg.role === 'user') {
                return (
                  <div
                    key={idx}
                    data-testid="user-msg-bubble"
                    style={{
                      justifySelf: 'end',
                      background: 'var(--accent, #c2410c)',
                      color: '#fff',
                      padding: '12px 16px',
                      borderRadius: 14,
                      maxWidth: '85%',
                      fontSize: 15,
                      lineHeight: 1.45,
                      wordBreak: 'break-word'
                    }}
                  >
                    {msg.text}
                  </div>
                );
              }
              return null;
            })}

            {/* Assistant Latest Blocks in Order */}
            <div style={{ display: 'grid', gap: 12 }}>
              {/* Text blocks */}
              {textBlocks.map((b, idx) => (
                <div
                  key={idx}
                  data-testid="assistant-text-bubble"
                  style={{
                    background: 'var(--chip, #f3ece0)',
                    color: 'var(--ink, #231f1a)',
                    padding: '12px 16px',
                    borderRadius: 14,
                    maxWidth: '92%',
                    fontSize: 15,
                    lineHeight: 1.45
                  }}
                >
                  {b.text}
                </div>
              ))}

              {/* Notice blocks */}
              {noticeBlocks.map((b, idx) => (
                <div
                  key={idx}
                  data-testid={`notice-block-${b.code || idx}`}
                  style={{
                    background: b.level === 'safety' ? 'var(--warnbg, #fef3c7)' : 'var(--chip, #f3ece0)',
                    color: b.level === 'safety' ? 'var(--warn, #92400e)' : 'var(--ink, #231f1a)',
                    border: '1px solid var(--line, #e6dfd3)',
                    borderRadius: 12,
                    padding: '10px 14px',
                    fontSize: 13,
                    lineHeight: 1.45
                  }}
                >
                  {b.text}
                </div>
              ))}

              {/* UNDERSTOOD BLOCK ("Mình hiểu là…") */}
              {understoodBlock && (
                <UnderstoodCard
                  items={understoodBlock.items}
                  allergies={understoodBlock.allergies}
                  onInlineSave={handleInlineSave}
                  onFreeFormEdit={handleFreeFormEdit}
                />
              )}

              {/* CLARIFY BLOCK (Single Question Rule: EXACTLY ONE question card) */}
              {clarifyBlock && (
                <ClarifyQuestionCard
                  clarify={clarifyBlock}
                  onPickOption={handlePickOption}
                  onSubmitText={(txt) => handleSendMessage(txt)}
                  busy={busy}
                />
              )}

              {/* CONFIRM SUMMARY BLOCK */}
              {confirmSummaryBlock && (
                <ConfirmSummaryCard
                  summary={confirmSummaryBlock}
                  profile={chatState?.profile}
                  onConfirmYes={handleConfirmYes}
                  onConfirmNo={handleConfirmNo}
                  busy={busy}
                />
              )}

              {/* TOUR READY BLOCK */}
              {showTour && (
                <GuidedTimeline
                  tour={tour}
                  allergies={currentAllergies}
                  onChangeStop={() => handleFreeFormEdit({ id: 'change_stop', label: 'quán muốn đổi' })}
                  onAdjustStops={() => handleFreeFormEdit({ id: 'adjust_stops', label: 'số lượng quán' })}
                  onRestart={handleRestart}
                />
              )}
            </div>

            {/* Bottom Stream Composer (available if tour is not ready yet) */}
            {!showTour && !confirmSummaryBlock && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  marginTop: 8
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  data-testid="guided-input"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={busy}
                  placeholder="Gõ trả lời hoặc yêu cầu thêm…"
                  style={{
                    flex: 1,
                    minHeight: 48,
                    border: '1px solid var(--line, #e6dfd3)',
                    borderRadius: 12,
                    padding: '0 16px',
                    fontSize: 15,
                    color: 'var(--ink, #231f1a)',
                    background: '#fff',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="submit"
                  data-testid="guided-send-btn"
                  disabled={busy || !inputText.trim()}
                  style={{
                    minHeight: 48,
                    padding: '0 22px',
                    borderRadius: 12,
                    border: 'none',
                    background: inputText.trim() && !busy ? 'var(--accent, #c2410c)' : 'var(--chip, #f3ece0)',
                    color: inputText.trim() && !busy ? '#fff' : 'var(--mute, #6b6257)',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: inputText.trim() && !busy ? 'pointer' : 'default'
                  }}
                >
                  Gửi
                </button>
              </form>
            )}

            {/* Exactly ONE quiet trust line under stream */}
            <TrustDisclosure turn={latestTurnMeta} health={health} />
          </div>
        )}
      </div>
    </div>
  );
}
