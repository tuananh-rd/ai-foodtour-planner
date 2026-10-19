'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import StartScreen from './StartScreen';
import ProfileBar from './ProfileBar';
import ChatColumn from './ChatColumn';
import ShortlistColumn from './ShortlistColumn';
import ExploreColumn from './ExploreColumn';
import { useStatusQueue, StatusQueueProvider } from '../../../ui/StatusQueue';
import { BannerQueue } from '../../../ui/Banner';
import { chatTurn, getChatState, getSession, createSession, SYNTHETIC_VENUES, ApiError } from '../../../../lib/api';

/**
 * Main ChatV2 Shell & Layout (TASK C3-1)
 *
 * Requirements:
 * - Active only when features.chat_v2 is true or URL ?chat=v2
 * - Start screen: location prompt, geolocation with fallbacks, district chips, suggestions
 * - Workspace: desktop 3-zone layout (Chat | Shortlist | Explore), mobile tabs <= 1024px
 * - Block renderers: text, notice, dish_suggestions, venue_cards, compare_table, clarify, confirm_summary, tour_ready
 * - In-flight guard: double-click prevention, 409 recovery, stale-response guard
 * - LLM budget chip & exhausted banner
 * - Strict honesty copy
 */
export default function ChatV2Layout({
  sessionId: initialSessionId,
  sessionToken: initialSessionToken,
  revision: initialRevision = 0,
  health,
  clientConfig,
  isMock = false,
  isDevMode = false,
  onResetSession,
}) {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [sessionToken, setSessionToken] = useState(initialSessionToken || '');
  const [revision, setRevision] = useState(initialRevision);

  // Chat conversation state
  const [chatState, setChatState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [latestExploreBlocks, setLatestExploreBlocks] = useState([]);
  const [venuesMap, setVenuesMap] = useState(() => {
    const initial = {};
    if (Array.isArray(SYNTHETIC_VENUES)) {
      SYNTHETIC_VENUES.forEach((v) => {
        if (v?.id) initial[v.id] = v;
      });
    }
    return initial;
  });
  const [tour, setTour] = useState(null);

  // In-flight guard & Status
  const [busy, setBusy] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const inFlightRef = useRef(false);
  const requestTokenRef = useRef(0);
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'shortlist' | 'explore'
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);

  const { enqueue, dismiss, clear } = useStatusQueue();

  // Responsive width listener
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isDesktop = windowWidth >= 1024;

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

    if (targetId && !chatState) {
      setBusy(true);
      getSession(targetId, targetToken)
        .then((s) => {
          setSessionId(s.session_id || targetId);
          setSessionToken(s.token || targetToken);
          setRevision(s.revision || 0);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('foodtour_chat_session_id', s.session_id || targetId);
            if (s.token || targetToken) sessionStorage.setItem('foodtour_chat_session_token', s.token || targetToken);
          }
          if (s.chat) {
            setChatState(s.chat);
            const restoredMessages = [];
            if (Array.isArray(s.chat.turns) && s.chat.turns.length > 0) {
              s.chat.turns.forEach((t) => {
                restoredMessages.push({
                  role: t.role,
                  text: t.text,
                  time: new Date(),
                });
              });
            }
            if (s.chat.pending) {
              restoredMessages.push({
                role: 'assistant',
                reply: {
                  blocks: [
                    {
                      type: 'clarify',
                      prompt: s.chat.pending.kind === 'confirm_plan'
                        ? 'Mình tóm tắt trước khi lập lịch trình. Bạn xem và xác nhận nhé.'
                        : 'Bạn hãy chọn một phương án bên dưới:',
                      options: s.chat.pending.options || [],
                    },
                  ],
                },
                chat: s.chat,
                time: new Date(),
              });
            }
            if (restoredMessages.length > 0) {
              setMessages(restoredMessages);
            }
          }
          if (s.tour) {
            setTour(s.tour);
          }
          setBusy(false);
        })
        .catch(() => {
          if (!sessionId) {
            createSession()
              .then((s) => {
                setSessionId(s.session_id);
                setSessionToken(s.token);
                setRevision(s.revision || 0);
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('foodtour_chat_session_id', s.session_id);
                  sessionStorage.setItem('foodtour_chat_session_token', s.token);
                }
                setBusy(false);
              })
              .catch((err) => {
                setBusy(false);
                enqueue({
                  id: 'init_error',
                  type: 'error',
                  title: 'Lỗi khởi tạo phiên',
                  message: err.message || 'Không thể tạo phiên làm việc mới.',
                });
              });
          } else {
            setBusy(false);
          }
        });
    } else if (!targetId) {
      setBusy(true);
      createSession()
        .then((s) => {
          setSessionId(s.session_id);
          setSessionToken(s.token);
          setRevision(s.revision || 0);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('foodtour_chat_session_id', s.session_id);
            sessionStorage.setItem('foodtour_chat_session_token', s.token);
          }
          setBusy(false);
        })
        .catch((err) => {
          setBusy(false);
          enqueue({
            id: 'init_error',
            type: 'error',
            title: 'Lỗi khởi tạo phiên',
            message: err.message || 'Không thể tạo phiên làm việc mới.',
          });
        });
    } else if (sessionId) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('foodtour_chat_session_id', sessionId);
        if (sessionToken) sessionStorage.setItem('foodtour_chat_session_token', sessionToken);
      }
    }
  }, [sessionId, sessionToken, chatState]);

  // Extract latest LLM budget and last turn understanding
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const llmBudget = lastAssistant?.llm_budget || health?.llm_budget || null;
  const lastUnderstanding = lastAssistant?.turn?.understanding || 'rules';

  // LLM Budget exhausted banner synchronization
  useEffect(() => {
    if (llmBudget?.exhausted || (llmBudget && llmBudget.remaining === 0)) {
      enqueue({
        id: 'llm_exhausted',
        type: 'info',
        title: 'Hạn mức AI hôm nay',
        message: 'AI hết lượt hôm nay, vẫn dùng được nút bấm.',
      });
    } else {
      dismiss('llm_exhausted');
    }
  }, [llmBudget]);

  // Dispatch turn action or message
  const handleTurn = async (body, isRetry = false, overrideRev = null) => {
    if (inFlightRef.current || busy) return;

    inFlightRef.current = true;
    setInFlight(true);
    setBusy(true);
    const token = ++requestTokenRef.current;

    // Optimistically append user message if text is present and not a retry
    if (body.text && !isRetry) {
      setMessages((prev) => [...prev, { role: 'user', text: body.text, time: new Date() }]);
    }

    try {
      const currentRev = overrideRev !== null ? overrideRev : (revisionRef.current ?? revision);
      const payload = {
        text: body.text || null,
        action: body.action || null,
        revision: currentRev,
      };

      const res = await chatTurn(sessionId, payload, sessionToken);

      // Stale response guard
      if (token !== requestTokenRef.current) return;

      // Update revision and state
      if (res.revision !== undefined) {
        setRevision(res.revision);
        revisionRef.current = res.revision;
      }
      if (res.chat) {
        setChatState(res.chat);
      }
      if (res.tour !== undefined) {
        setTour(res.tour);
        if (!res.tour) {
          setLatestExploreBlocks((prev) => prev.filter((b) => b.type !== 'tour_ready'));
        }
      }

      // Record any venues into local venuesMap for fast lookup
      const newVenues = {};
      const blocks = res.reply?.blocks || [];
      blocks.forEach((b) => {
        if (b.type === 'venue_cards' && b.cards) {
          b.cards.forEach((c) => {
            if (c.venue?.id) newVenues[c.venue.id] = c.venue;
          });
        }
      });
      if (Object.keys(newVenues).length > 0) {
        setVenuesMap((prev) => ({ ...prev, ...newVenues }));
      }

      // Partition blocks: explore blocks go to ExploreColumn, all blocks stored in assistant message
      const exploreTypes = ['dish_suggestions', 'venue_cards', 'compare_table', 'confirm_summary', 'tour_ready'];
      const exploreBlocks = blocks.filter((b) => exploreTypes.includes(b.type));
      if (exploreBlocks.length > 0) {
        setLatestExploreBlocks((prev) => {
          const hasVenueCards = exploreBlocks.some((b) => b.type === 'venue_cards');
          const hasCompare = exploreBlocks.some((b) => b.type === 'compare_table');
          if (hasCompare && !hasVenueCards) {
            const prevCards = prev.filter((b) => b.type === 'venue_cards');
            if (prevCards.length > 0) {
              return [...exploreBlocks, ...prevCards];
            }
          }
          return exploreBlocks;
        });
        // On mobile, auto-switch to explore tab if venue cards or compare table arrived
        if (!isDesktop) {
          setActiveTab('explore');
        }
      }

      // Append assistant message
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          reply: res.reply,
          chat: res.chat,
          turn: res.turn,
          llm_budget: res.llm_budget,
          time: new Date(),
        },
      ]);

      dismiss('chat_error');
      dismiss('409_conflict');
    } catch (err) {
      if (token !== requestTokenRef.current) return;

      if (err.status === 409 || err.code === 'revision_conflict') {
        // Revision conflict 409 -> refetch latest session state & adopt server revision
        try {
          const freshSession = await getSession(sessionId, sessionToken);
          let serverRev = revisionRef.current;
          if (freshSession) {
            if (freshSession.revision !== undefined) {
              serverRev = freshSession.revision;
              setRevision(freshSession.revision);
              revisionRef.current = freshSession.revision;
            }
            if (freshSession.chat) setChatState(freshSession.chat);
            if (freshSession.tour !== undefined) {
              setTour(freshSession.tour);
              if (!freshSession.tour) {
                setLatestExploreBlocks((prev) => prev.filter((b) => b.type !== 'tour_ready'));
              }
            }
          }

          // If first attempt, automatically retry ONCE adopting the server revision
          if (!isRetry) {
            inFlightRef.current = false;
            setInFlight(false);
            setBusy(false);
            return await handleTurn(body, true, serverRev);
          }

          // If retry still fails or user interaction desired, show accessible retry banner
          enqueue({
            id: '409_conflict',
            type: 'warning',
            title: 'Dữ liệu phiên đã thay đổi',
            message: 'Dữ liệu đã được đồng bộ với phiên bản mới nhất từ máy chủ.',
            action: {
              label: 'Thử lại',
              onClick: () => {
                dismiss('409_conflict');
                handleTurn(body, true, revisionRef.current);
              },
            },
          });
        } catch (_) {}
      } else {
        enqueue({
          id: 'chat_error',
          type: 'error',
          title: 'Lỗi gửi yêu cầu',
          message: err.message || 'Không thể hoàn tất lượt trao đổi. Vui lòng thử lại.',
          action: {
            label: 'Thử lại',
            onClick: () => {
              dismiss('chat_error');
              handleTurn(body, true, revisionRef.current);
            },
          },
        });
      }
    } finally {
      if (token === requestTokenRef.current) {
        inFlightRef.current = false;
        setInFlight(false);
        setBusy(false);
      }
    }
  };

  const handleSendMessage = (text) => {
    handleTurn({ text, action: null });
  };

  const handleAction = (action) => {
    if (!action) return;
    if (action.type === 'text') {
      handleTurn({ text: action.text, action: null });
    } else {
      handleTurn({ text: null, action });
    }
  };

  // Determine whether to show StartScreen or 3-Zone Workspace
  // Start screen is shown if no location has been selected yet
  const hasArea = Boolean(chatState?.profile?.area?.value);
  const showStartScreen = !hasArea;

  return (
    <div
      data-ui-v2="true"
      data-testid="chat-v2-container"
      aria-busy={busy}
      data-busy={busy ? 'true' : undefined}
      className="ft-v2-container"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#FBF8F3',
        color: '#1F1B16',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minWidth: 0,
        maxWidth: '100%',
        width: '100%',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      {/* Top Header */}
      <header
        style={{
          height: 56,
          background: '#FFFFFF',
          borderBottom: '1px solid #DFD5C6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ fontSize: 16, fontWeight: 800, color: '#C8431A' }}>
            AI FoodTour Planner
          </strong>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: '#F0EAE1',
              color: '#6B6259',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            Chat V2
          </span>
        </div>

        {/* Status / LLM Budget Chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {llmBudget && (
            <span
              data-testid="llm-budget-chip"
              className="llm-budget-chip"
              style={{
                fontSize: 12,
                background: llmBudget.exhausted ? '#FFFBEB' : '#EAF7EC',
                color: llmBudget.exhausted ? '#92400E' : '#195624',
                border: `1px solid ${llmBudget.exhausted ? '#FDE68A' : '#9ED4A7'}`,
                padding: '4px 10px',
                borderRadius: 14,
                fontWeight: 600,
              }}
            >
              {llmBudget.exhausted
                ? 'AI hết lượt hôm nay'
                : `AI còn ${llmBudget.remaining}/${llmBudget.limit} lượt hôm nay`}
            </span>
          )}

          {isMock && (
            <span
              style={{
                fontSize: 11,
                background: '#F0EAE1',
                color: '#6B6259',
                padding: '3px 8px',
                borderRadius: 4,
              }}
            >
              Mock Mode
            </span>
          )}
        </div>
      </header>

      {/* Persistent System Banners (StatusQueue) */}
      <div style={{ padding: '0 16px' }}>
        <BannerQueue />
      </div>

      {/* Main Content Area */}
      {showStartScreen ? (
        <div style={{ flex: 1, padding: '20px 16px' }}>
          <StartScreen
            onAction={handleAction}
            onSendMessage={handleSendMessage}
            busy={busy || inFlight}
            clarifyOptions={chatState?.pending?.options || []}
            outsideNotice={
              lastAssistant?.reply?.blocks?.find(
                (b) => b.type === 'notice' && (b.code === 'outside_hanoi' || b.level === 'warning')
              )?.text || null
            }
          />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
          {/* Top ProfileBar with editable chips */}
          <ProfileBar
            chatState={chatState}
            onAction={handleAction}
            busy={busy || inFlight}
          />

          {/* Mobile Tab Navigation Bar (< 1024px) */}
          {!isDesktop && (
            <nav
              aria-label="Thanh chuyển tab workspace"
              style={{
                display: 'flex',
                background: '#FFFFFF',
                borderBottom: '1px solid #DFD5C6',
                padding: 4,
                gap: 4,
              }}
            >
              <button
                type="button"
                role="tab"
                data-testid="mobile-tab"
                aria-selected={activeTab === 'chat'}
                onClick={() => setActiveTab('chat')}
                style={{
                  flex: 1,
                  minHeight: 44,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === 'chat' ? '#C8431A' : 'transparent',
                  color: activeTab === 'chat' ? '#FFFFFF' : '#6B6259',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Trò chuyện
              </button>
              <button
                type="button"
                role="tab"
                data-testid="mobile-tab"
                aria-selected={activeTab === 'shortlist'}
                onClick={() => setActiveTab('shortlist')}
                style={{
                  flex: 1,
                  minHeight: 44,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === 'shortlist' ? '#C8431A' : 'transparent',
                  color: activeTab === 'shortlist' ? '#FFFFFF' : '#6B6259',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Danh sách ({chatState?.shortlist?.length || 0})
              </button>
              <button
                type="button"
                role="tab"
                data-testid="mobile-tab"
                aria-selected={activeTab === 'explore'}
                onClick={() => setActiveTab('explore')}
                style={{
                  flex: 1,
                  minHeight: 44,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === 'explore' ? '#C8431A' : 'transparent',
                  color: activeTab === 'explore' ? '#FFFFFF' : '#6B6259',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Khám phá
              </button>
            </nav>
          )}

          {/* Workspace Columns Container */}
          <div
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: isDesktop ? '380px 300px minmax(0, 1fr)' : 'minmax(0, 1fr)',
              overflow: 'hidden',
              minWidth: 0,
              maxWidth: '100%',
              width: '100%',
            }}
          >
            {/* Zone 1: Chat Column */}
            <div
              style={{
                display: isDesktop || activeTab === 'chat' ? 'flex' : 'none',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                minWidth: 0,
                maxWidth: '100%',
                width: '100%',
              }}
            >
              <ChatColumn
                messages={messages}
                onSendMessage={handleSendMessage}
                onAction={handleAction}
                shortlist={chatState?.shortlist || []}
                busy={busy || inFlight}
              />
            </div>

            {/* Zone 2: Shortlist Column */}
            <div
              style={{
                display: isDesktop || activeTab === 'shortlist' ? 'flex' : 'none',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                minWidth: 0,
                maxWidth: '100%',
                width: '100%',
              }}
            >
              <ShortlistColumn
                shortlist={chatState?.shortlist || []}
                venuesMap={venuesMap}
                onAction={handleAction}
                busy={busy || inFlight}
              />
            </div>

            {/* Zone 3: Explore Column */}
            <div
              style={{
                display: isDesktop || activeTab === 'explore' ? 'flex' : 'none',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                minWidth: 0,
                maxWidth: '100%',
                width: '100%',
              }}
            >
              <ExploreColumn
                latestExploreBlocks={latestExploreBlocks}
                onAction={handleAction}
                shortlist={chatState?.shortlist || []}
                allergies={chatState?.allergies || []}
                tour={tour}
                sessionId={sessionId}
                sessionToken={sessionToken}
                busy={busy || inFlight}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
