'use client';

import React, { useState, useEffect, useRef } from 'react';
import UnderstoodCard from './UnderstoodCard';
import ClarifyQuestionCard from './ClarifyQuestionCard';
import ConfirmSummaryCard from './ConfirmSummaryCard';
import GuidedTimeline from './GuidedTimeline';
import TrustDisclosure from './TrustDisclosure';
import { chatTurn, createSession, getSession } from '../../../../lib/api';

/**
 * Helper to transform chat profile object into UnderstoodCard item rows.
 */
function profileToUnderstoodItems(profile = {}) {
  const items = [];
  if (profile.area?.value) {
    const areaVal = typeof profile.area.value === 'object' ? profile.area.value.label : profile.area.value;
    items.push({ id: 'area', label: 'Khu vực', value: areaVal, status: 'user', editable: true });
  }
  if (profile.party_size?.value) {
    items.push({ id: 'party', label: 'Số người', value: String(profile.party_size.value), status: 'user', editable: true });
  }
  if (profile.stops?.value) {
    items.push({ id: 'stops', label: 'Số quán', value: String(profile.stops.value), status: 'user', editable: true });
  }
  if (profile.duration_min?.value) {
    items.push({ id: 'duration', label: 'Tổng thời gian', value: `${profile.duration_min.value} phút`, status: 'user', editable: true });
  }
  if (profile.day_part?.value) {
    const dayPartMap = { morning: 'Buổi sáng', noon: 'Buổi trưa', afternoon: 'Buổi chiều', evening: 'Buổi tối', late: 'Đêm muộn' };
    items.push({ id: 'day_part', label: 'Buổi', value: dayPartMap[profile.day_part.value] || profile.day_part.value, status: 'user', editable: true });
  }
  if (profile.start_time?.value) {
    items.push({ id: 'time', label: 'Bắt đầu lúc', value: profile.start_time.value, status: 'user', editable: true });
  }
  if (profile.budget?.value) {
    const bScope = profile.budget.scope === 'group' ? 'cả nhóm' : profile.budget.scope === 'per_person' ? 'mỗi người' : 'chưa rõ phạm vi';
    items.push({ id: 'budget', label: 'Ngân sách', value: `${Number(profile.budget.value).toLocaleString('vi-VN')} đ (${bScope})`, status: 'user', editable: true });
  }
  if (profile.tastes?.value && Array.isArray(profile.tastes.value) && profile.tastes.value.length > 0) {
    items.push({ id: 'dish', label: 'Thích', value: profile.tastes.value.join(', '), status: 'user', editable: true });
  }
  return items;
}

function getClarifyQuestionText(slot) {
  if (slot === 'budget_scope') return '500.000 đ là ngân sách cho cả nhóm hay cho mỗi người?';
  if (slot === 'start_time') return 'Bạn muốn bắt đầu lúc mấy giờ (buổi tối)? Chọn một giờ hoặc gõ giờ khác.';
  if (slot === 'plan_slots' || slot === 'vehicle') return 'Bạn muốn đi bằng phương tiện gì (đi bộ, xe máy, ô tô, taxi/Grab)?';
  if (slot === 'allergy_term') return 'Bạn bị dị ứng với loại nguyên liệu nào?';
  return 'Bạn hãy chọn một phương án bên dưới:';
}

/**
 * GuidedLayout (TASK U4a & U4b)
 * Visual target: docs/ux/guided-flow-mockup.html
 * Contract: v1.9.1
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
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastFailedTurn, setLastFailedTurn] = useState(null);

  const inputRef = useRef(null);

  // Synchronize prop changes from page.js
  useEffect(() => {
    if (initialSessionId && initialSessionId !== sessionId) {
      setSessionId(initialSessionId);
      if (initialSessionToken) setSessionToken(initialSessionToken);
      if (initialRevision !== undefined) setRevision(initialRevision);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('foodtour_chat_session_id', initialSessionId);
        if (initialSessionToken) sessionStorage.setItem('foodtour_chat_session_token', initialSessionToken);
      }
    }
  }, [initialSessionId, initialSessionToken, initialRevision]);

  // Initialize session or restore existing session on reload
  useEffect(() => {
    const storedId = typeof window !== 'undefined'
      ? (sessionStorage.getItem('foodtour_chat_session_id') || new URLSearchParams(window.location.search).get('session_id'))
      : null;
    const storedToken = typeof window !== 'undefined'
      ? (sessionStorage.getItem('foodtour_chat_session_token') || '')
      : '';

    const targetId = sessionId || storedId;
    const targetToken = sessionToken || storedToken;

    if (targetId) {
      setBusy(true);
      getSession(targetId, targetToken)
        .then((s) => {
          if (s && (s.session_id || targetId)) {
            const activeId = s.session_id || targetId;
            const activeToken = s.token || targetToken;
            setSessionId(activeId);
            setSessionToken(activeToken);
            setRevision(s.revision || 0);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('foodtour_chat_session_id', activeId);
              if (activeToken) sessionStorage.setItem('foodtour_chat_session_token', activeToken);
            }
            if (s.chat) setChatState(s.chat);
            if (s.tour) setTour(s.tour);

            // Reconstruct stream messages only if session has active dialogue (turn_count > 0 or pending or non-empty profile)
            const hasActiveDialogue = Boolean(
              (s.chat?.turn_count && s.chat.turn_count > 0) ||
              s.chat?.pending ||
              s.tour ||
              (s.chat?.allergies && s.chat.allergies.length > 0) ||
              Object.values(s.chat?.profile || {}).some((v) => v?.value !== null && v?.value !== undefined)
            );

            if (hasActiveDialogue) {
              const restoredAssistantBlocks = [];
              if (s.chat?.profile) {
                const items = profileToUnderstoodItems(s.chat.profile);
                const allergies = s.chat.allergies || [];
                restoredAssistantBlocks.push({
                  type: 'understood',
                  items,
                  allergies
                });
              }
              if (s.chat?.pending) {
                if (s.chat.pending.kind === 'confirm_plan') {
                  restoredAssistantBlocks.push({
                    type: 'confirm_summary',
                    items: profileToUnderstoodItems(s.chat.profile),
                    shortlist: s.chat.shortlist || [],
                    missing: [],
                    warnings: []
                  });
                } else if (s.chat.pending.slot === 'propose') {
                  if (s.chat.last_results && s.chat.last_results.length > 0) {
                    restoredAssistantBlocks.push({
                      type: 'venue_cards',
                      cards: s.chat.last_results
                    });
                  }
                  restoredAssistantBlocks.push({
                    type: 'clarify',
                    question: 'Bạn muốn dùng những quán này cho tour không?',
                    options: s.chat.pending.options || [
                      { option_id: 'propose:use', label: 'Dùng những quán này' },
                      { option_id: 'propose:self', label: 'Mình tự chọn' }
                    ],
                    slot: 'propose',
                    free_text: true
                  });
                } else {
                  restoredAssistantBlocks.push({
                    type: 'clarify',
                    question: s.chat.pending.question || s.chat.pending.prompt || getClarifyQuestionText(s.chat.pending.slot),
                    options: s.chat.pending.options || [],
                    slot: s.chat.pending.slot,
                    free_text: true
                  });
                }
              }
              if (s.tour) {
                restoredAssistantBlocks.push({
                  type: 'tour_ready',
                  revision: s.revision
                });
              }
              if (restoredAssistantBlocks.length > 0) {
                setMessages([
                  {
                    role: 'assistant',
                    reply: { blocks: restoredAssistantBlocks },
                    chat: s.chat,
                    tour: s.tour,
                    timestamp: Date.now()
                  }
                ]);
              }
            }
          }
          setBusy(false);
        })
        .catch(() => {
          createSession()
            .then((fresh) => {
              setSessionId(fresh.session_id);
              setSessionToken(fresh.token || '');
              setRevision(fresh.revision || 0);
              if (typeof window !== 'undefined') {
                sessionStorage.setItem('foodtour_chat_session_id', fresh.session_id);
                if (fresh.token) sessionStorage.setItem('foodtour_chat_session_token', fresh.token);
              }
              setBusy(false);
            })
            .catch(() => setBusy(false));
        });
    } else {
      setBusy(true);
      createSession()
        .then((s) => {
          setSessionId(s.session_id);
          setSessionToken(s.token || '');
          setRevision(s.revision || 0);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('foodtour_chat_session_id', s.session_id);
            if (s.token) sessionStorage.setItem('foodtour_chat_session_token', s.token);
          }
          setBusy(false);
        })
        .catch(() => setBusy(false));
    }
  }, []);

  // Execute turn action or text
  const executeTurn = async ({ text = null, action = null }) => {
    if (busy || (!text && !action)) return;
    setBusy(true);
    setErrorMessage(null);

    // If user text, append to stream immediately
    if (text) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', text, timestamp: Date.now() }
      ]);
    }

    try {
      let activeSessionId = sessionId;
      let activeToken = sessionToken;
      if (!activeSessionId && typeof window !== 'undefined') {
        activeSessionId = sessionStorage.getItem('foodtour_chat_session_id');
        activeToken = sessionStorage.getItem('foodtour_chat_session_token') || activeToken;
      }
      if (!activeSessionId) {
        const fresh = await createSession();
        activeSessionId = fresh.session_id;
        activeToken = fresh.token || '';
        setSessionId(activeSessionId);
        setSessionToken(activeToken);
        setRevision(fresh.revision || 0);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('foodtour_chat_session_id', activeSessionId);
          if (activeToken) sessionStorage.setItem('foodtour_chat_session_token', activeToken);
        }
      }

      const convParam = typeof window !== 'undefined'
        ? (new URLSearchParams(window.location.search).get('conv') || new URLSearchParams(window.location.search).get('scenario'))
        : null;

      const body = {
        revision,
        conv: convParam,
        guided: true
      };
      if (text) {
        body.text = text;
      } else if (action) {
        body.action = action;
      }

      const res = await chatTurn(activeSessionId, body, activeToken);

      if (res) {
        if (res.revision !== undefined) setRevision(res.revision);
        if (res.chat) setChatState(res.chat);
        if (res.tour) setTour(res.tour);
        if (res.turn) setLatestTurnMeta(res.turn);

        if (typeof window !== 'undefined' && activeSessionId) {
          sessionStorage.setItem('foodtour_chat_session_id', activeSessionId);
          if (activeToken) sessionStorage.setItem('foodtour_chat_session_token', activeToken);
        }

        // Live announcement for screen readers
        const replyBlocks = res.reply?.blocks || [];
        const clarify = replyBlocks.find((b) => b.type === 'clarify');
        const textBlock = replyBlocks.find((b) => b.type === 'text');
        if (clarify?.question) {
          setLiveAnnouncement(clarify.question);
        } else if (textBlock?.text) {
          setLiveAnnouncement(textBlock.text);
        }

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
      setLastFailedTurn({ text, action });
      if (err?.status === 409) {
        setErrorMessage('Phiên làm việc đã thay đổi trên máy chủ. Đang tự động đồng bộ lại...');
        getSession(sessionId, sessionToken)
          .then((s) => {
            if (s) {
              setRevision(s.revision || 0);
              if (s.chat) setChatState(s.chat);
              if (s.tour) setTour(s.tour);
            }
          })
          .catch(() => {});
      } else {
        setErrorMessage('Không thể kết nối tới máy chủ lúc này. Bạn vui lòng thử lại sau ít phút.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRetryFailed = () => {
    if (!lastFailedTurn) return;
    setErrorMessage(null);
    executeTurn(lastFailedTurn);
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
    const draft = `Đổi ${label.toLowerCase()} thành: `;
    setInputText(draft);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleRestart = async () => {
    setMessages([]);
    setChatState(null);
    setTour(null);
    setLatestTurnMeta(null);
    setInputText('');
    setErrorMessage(null);
    setLastFailedTurn(null);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('foodtour_chat_session_id');
        sessionStorage.removeItem('foodtour_chat_session_token');
      } catch (_) {}
    }
    setBusy(true);
    try {
      const fresh = await createSession();
      setSessionId(fresh.session_id);
      setSessionToken(fresh.token || '');
      setRevision(fresh.revision || 0);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('foodtour_chat_session_id', fresh.session_id);
        if (fresh.token) sessionStorage.setItem('foodtour_chat_session_token', fresh.token);
      }
    } catch (_) {}
    setBusy(false);
    onResetSession && onResetSession();
  };

  const isStartScreen = messages.length === 0;

  // Extract latest blocks from stream
  const latestAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
  const latestBlocks = latestAssistantMsg?.reply?.blocks || [];

  const textBlocks = latestBlocks.filter((b) => b.type === 'text');
  const noticeBlocks = latestBlocks.filter((b) => b.type === 'notice');
  const venueCardsBlock = latestBlocks.find((b) => b.type === 'venue_cards');
  const latestUnderstoodBlock = latestBlocks.find((b) => b.type === 'understood');
  const previousUnderstoodBlock = [...messages]
    .reverse()
    .map((m) => m.reply?.blocks?.find((b) => b.type === 'understood'))
    .find(Boolean);

  let understoodBlock = latestUnderstoodBlock || previousUnderstoodBlock;
  if (!understoodBlock && (chatState?.profile || chatState?.allergies)) {
    understoodBlock = {
      type: 'understood',
      items: profileToUnderstoodItems(chatState.profile),
      allergies: chatState.allergies || []
    };
  } else if (understoodBlock) {
    if (chatState?.allergies && chatState.allergies.length > 0) {
      understoodBlock = {
        ...understoodBlock,
        allergies: chatState.allergies
      };
    }
    if (chatState?.profile) {
      const updatedItems = profileToUnderstoodItems(chatState.profile);
      if (updatedItems.length > 0) {
        const itemMap = new Map((understoodBlock.items || []).map((it) => [it.id, it]));
        for (const u of updatedItems) {
          itemMap.set(u.id, { ...(itemMap.get(u.id) || {}), ...u });
        }
        understoodBlock = {
          ...understoodBlock,
          items: Array.from(itemMap.values())
        };
      }
    }
  }
  const clarifyBlock = latestBlocks.find((b) => b.type === 'clarify');
  const confirmSummaryBlock = latestBlocks.find((b) => b.type === 'confirm_summary');
  const tourReadyBlock = latestBlocks.find((b) => b.type === 'tour_ready');

  // Tour Gate: Tour is rendered ONLY when tour is available and tour_ready block or planned phase is reached
  const showTour = Boolean(tour && (tourReadyBlock || chatState?.phase === 'planned'));

  // Allergies for display
  const currentAllergies = understoodBlock?.allergies || chatState?.allergies || [];

  // Focus management: when a clarify block appears, gently focus the first option chip
  useEffect(() => {
    if (clarifyBlock && !busy) {
      const timer = setTimeout(() => {
        const firstChip = document.querySelector('[data-testid="clarify-option-0"]');
        if (firstChip) {
          firstChip.focus();
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [clarifyBlock?.pending_id, clarifyBlock?.question, busy]);

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
      {/* Screen Reader Live Announcement Region */}
      <div
        aria-live="polite"
        aria-atomic="true"
        data-testid="guided-aria-live"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0
        }}
      >
        {liveAnnouncement}
      </div>

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
              cursor: busy ? 'not-allowed' : 'pointer',
              minHeight: 44
            }}
          >
            Làm lại
          </button>
        </header>

        {/* Calm Error Banner if turn failed */}
        {errorMessage && (
          <div
            data-testid="guided-error-banner"
            role="alert"
            style={{
              background: 'var(--warnbg, #fef3c7)',
              color: 'var(--warn, #92400e)',
              border: '1px solid var(--warn, #92400e)',
              borderRadius: 12,
              padding: '10px 14px',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8
            }}
          >
            <span>⚠️ {errorMessage}</span>
            <button
              type="button"
              data-testid="guided-error-retry-btn"
              onClick={handleRetryFailed}
              style={{
                background: 'var(--warn, #92400e)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '6px 12px',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                minHeight: 44
              }}
            >
              Thử lại
            </button>
          </div>
        )}

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
                fontWeight: 500,
                overflowWrap: 'anywhere',
                wordBreak: 'break-word'
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
                alignItems: 'center',
                minWidth: 0,
                maxWidth: '100%'
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
                  boxSizing: 'border-box',
                  minWidth: 0
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
                  cursor: inputText.trim() && !busy ? 'pointer' : 'default',
                  flexShrink: 0
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
              gap: 16,
              minWidth: 0,
              maxWidth: '100%'
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
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere'
                    }}
                  >
                    {msg.text}
                  </div>
                );
              }
              return null;
            })}

            {/* Assistant Latest Blocks in Order */}
            <div style={{ display: 'grid', gap: 12, minWidth: 0, maxWidth: '100%' }}>
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
                    lineHeight: 1.45,
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere'
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
                    lineHeight: 1.45,
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere'
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

              {/* VENUE CARDS BLOCK (When proposed venues are offered) */}
              {venueCardsBlock && (
                <div data-testid="venue-cards-block" style={{ display: 'grid', gap: 12, margin: '8px 0', minWidth: 0, maxWidth: '100%' }}>
                  {(venueCardsBlock.cards || []).map((card, idx) => {
                    const v = card.venue || {};
                    const priceText = v.price?.min_vnd && v.price?.max_vnd
                      ? `Khoảng giá quán: ${Number(v.price.min_vnd).toLocaleString('vi-VN')} – ${Number(v.price.max_vnd).toLocaleString('vi-VN')} đ (theo nguồn)`
                      : 'Khoảng giá quán: chưa rõ (theo nguồn)';
                    const hoursText = v.hours?.display
                      ? `giờ mở cửa theo nguồn ghi: ${v.hours.display}`
                      : 'giờ mở cửa theo nguồn ghi: chưa rõ';
                    const ratingText = v.rating && v.rating.count >= 5 && v.rating.value !== null
                      ? `⭐ ${v.rating.value} (${v.rating.count} đánh giá, theo nguồn)`
                      : 'ít đánh giá (theo nguồn)';
                    const distText = card.distance_m !== null && card.distance_m !== undefined
                      ? `cách ~${card.distance_m} m (ước tính)`
                      : null;

                    return (
                      <div
                        key={v.id || idx}
                        data-testid="venue-card"
                        style={{
                          background: 'var(--card, #fff)',
                          border: '1px solid var(--line, #e6dfd3)',
                          borderRadius: 14,
                          padding: 14,
                          display: 'grid',
                          gap: 6,
                          minWidth: 0,
                          maxWidth: '100%',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                          boxSizing: 'border-box'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' }}>
                          <span
                            style={{
                              background: 'var(--accent, #c2410c)',
                              color: '#fff',
                              fontWeight: 700,
                              fontSize: 12,
                              width: 24,
                              height: 24,
                              borderRadius: 12,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {card.label || String.fromCharCode(65 + idx)}
                          </span>
                          <strong style={{ fontSize: 15, color: 'var(--ink, #231f1a)', minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            {v.name}
                          </strong>
                        </div>

                        <div style={{ fontSize: 13, color: 'var(--mute, #6b6257)' }}>
                          📍 {v.address || v.district || 'Hà Nội'}{distText ? ` · ${distText}` : ''}
                        </div>

                        <div style={{ fontSize: 13, color: 'var(--ink, #231f1a)' }}>
                          🏷️ {priceText}
                        </div>

                        <div style={{ fontSize: 12, color: 'var(--mute, #6b6257)' }}>
                          🕒 {hoursText} · {ratingText}
                        </div>

                        {(card.flags || []).some((f) => f.code === 'allergy_unknown') && (
                          <div
                            style={{
                              background: 'var(--warnbg, #fef3c7)',
                              color: 'var(--warn, #92400e)',
                              borderRadius: 8,
                              padding: '6px 10px',
                              fontSize: 12,
                              marginTop: 4
                            }}
                          >
                            ⚠️ Chưa đủ thông tin về dị ứng; hãy hỏi quán trước khi ăn
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
                  marginTop: 8,
                  minWidth: 0,
                  maxWidth: '100%'
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
                    boxSizing: 'border-box',
                    minWidth: 0
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
                    cursor: inputText.trim() && !busy ? 'pointer' : 'default',
                    flexShrink: 0
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
