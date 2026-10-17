'use client';

import React, { useState, useEffect, useRef } from 'react';
import UnderstoodCard from './UnderstoodCard';
import ClarifyQuestionCard from './ClarifyQuestionCard';
import ConfirmSummaryCard from './ConfirmSummaryCard';
import GuidedTimeline from './GuidedTimeline';
import TrustDisclosure from './TrustDisclosure';
import ReplaceDiffModal from '../../ReplaceDiffModal';
import { chatTurn, createSession, getSession, replaceTourStop } from '../../../../lib/api';

/**
 * Helper to transform chat profile object into UnderstoodCard item rows.
 * Preserves null and legitimate zero (Q01).
 */
function profileToUnderstoodItems(profile = {}) {
  const items = [];
  if (profile.area?.value) {
    const areaVal = typeof profile.area.value === 'object' ? profile.area.value.label : profile.area.value;
    const status = profile.area.source || 'user';
    items.push({ id: 'area', label: 'Khu vực', value: areaVal, status, editable: true });
  }
  if (profile.party_size?.value !== null && profile.party_size?.value !== undefined) {
    const status = profile.party_size.source || 'user';
    items.push({ id: 'party', label: 'Số người', value: String(profile.party_size.value), status, editable: true });
  }
  if (profile.stops?.value !== null && profile.stops?.value !== undefined) {
    const status = profile.stops.source || 'user';
    items.push({ id: 'stops', label: 'Số quán', value: String(profile.stops.value), status, editable: true });
  }
  if (profile.duration_min?.value !== null && profile.duration_min?.value !== undefined) {
    const status = profile.duration_min.source || 'user';
    items.push({ id: 'duration', label: 'Tổng thời gian', value: `${profile.duration_min.value} phút`, status, editable: true });
  }
  if (profile.stops?.value && profile.duration_min?.value) {
    const n = Number(profile.stops.value);
    const d = Number(profile.duration_min.value);
    if (n > 0 && d > 0) {
      const vm = Math.floor((d - (n - 1) * 8) / n);
      if (vm > 0) {
        items.push({ id: 'visit_min', label: 'Thời gian mỗi quán (ước tính)', value: `khoảng ${vm} phút`, status: 'inferred', editable: false });
      }
    }
  }
  if (profile.day_part?.value) {
    const dayPartMap = { morning: 'Buổi sáng', noon: 'Buổi trưa', afternoon: 'Buổi chiều', evening: 'Buổi tối', late: 'Đêm muộn' };
    const status = profile.day_part.source || 'user';
    items.push({ id: 'day_part', label: 'Buổi', value: dayPartMap[profile.day_part.value] || profile.day_part.value, status, editable: true });
  }
  if (profile.start_time?.value) {
    const status = profile.start_time.source || 'user';
    items.push({ id: 'time', label: 'Bắt đầu lúc', value: profile.start_time.value, status, editable: true });
  }
  if (profile.budget?.value !== null && profile.budget?.value !== undefined) {
    const status = profile.budget.source || 'user';
    const bScope = profile.budget.scope === 'group' ? 'cả nhóm' : profile.budget.scope === 'per_person' ? 'mỗi người' : 'chưa rõ phạm vi';
    items.push({ id: 'budget', label: 'Ngân sách', value: `${Number(profile.budget.value).toLocaleString('vi-VN')} đ (${bScope})`, status, editable: true });
  }
  if (profile.tastes?.value && Array.isArray(profile.tastes.value) && profile.tastes.value.length > 0) {
    const status = profile.tastes.source || 'user';
    items.push({ id: 'dish', label: 'Thích', value: profile.tastes.value.join(', '), status, editable: true });
  }
  if (profile.vehicle?.value) {
    const status = profile.vehicle.source || 'default';
    const vLabel = profile.vehicle.value === 'walk' ? 'Đi bộ' : profile.vehicle.value;
    items.push({ id: 'vehicle', label: 'Phương tiện', value: vLabel, status, editable: true });
  }
  return items;
}

/**
 * Restore question text dynamically from state (Q04, NFE-05).
 * Never hardcodes 500k; uses actual budget value (150k, 300k, 1m, etc.).
 * Supports newly introduced numeric slots (budget_vnd, duration_min, party_size, stops).
 */
function getClarifyQuestionText(slot, chatState = null, profile = null) {
  if (slot === 'budget_scope') {
    const budgetVal = chatState?.profile?.budget?.value ?? profile?.budget?.value;
    if (budgetVal !== null && budgetVal !== undefined && !isNaN(Number(budgetVal)) && Number(budgetVal) > 0) {
      return `${Number(budgetVal).toLocaleString('vi-VN')} đ là ngân sách cho cả nhóm hay cho mỗi người?`;
    }
    return 'Ngân sách này là cho cả nhóm hay cho mỗi người?';
  }
  if (slot === 'budget_vnd') return 'Bạn dự kiến mức ngân sách khoảng bao nhiêu tiền (VNĐ)?';
  if (slot === 'duration_min') return 'Bạn dự kiến đi tour trong khoảng bao nhiêu phút?';
  if (slot === 'party_size') return 'Nhóm của bạn có mấy người cùng tham gia?';
  if (slot === 'stops') return 'Bạn muốn ghé thăm khoảng mấy quán?';
  if (slot === 'start_time') return 'Bạn muốn bắt đầu lúc mấy giờ? Chọn một giờ hoặc gõ giờ khác.';
  if (slot === 'plan_slots' || slot === 'vehicle') return 'Bạn muốn đi bằng phương tiện gì (đi bộ, xe máy, ô tô, taxi/Grab)?';
  if (slot === 'allergy_term') return 'Bạn bị dị ứng với loại nguyên liệu nào?';
  return 'Vui lòng cho biết thêm thông tin về yêu cầu của bạn:';
}

/**
 * GuidedLayout - NgonNgon Tour redesign matching SVG reference (1440x1024)
 * Two-column desktop shell (Chat left, Tour right) with 390px responsive adaptation.
 * Fully compliant with Q01, Q02, Q04, Q05, Q06, Q07.
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
  const [busyMessage, setBusyMessage] = useState('Đang đọc yêu cầu…');
  const [inputText, setInputText] = useState('');
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastFailedTurn, setLastFailedTurn] = useState(null);

  // Stop Replacement Modal & Locks state
  const [replaceTargetStop, setReplaceTargetStop] = useState(null);
  const [replaceResultDiff, setReplaceResultDiff] = useState(null);
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [lockedVenueIds, setLockedVenueIds] = useState([]);

  // Responsive layout state (desktop >= 1024px vs mobile)
  const [isDesktop, setIsDesktop] = useState(true);
  const [activeMobileTab, setActiveMobileTab] = useState('chat'); // 'chat' | 'tour'

  const inputRef = useRef(null);
  const lastFocusedKeyRef = useRef('');
  const chatSectionRef = useRef(null);
  const tourSectionRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(typeof window !== 'undefined' && window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Initialize session or restore existing session on reload (Q04 restore check)
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
      setBusyMessage('Đang tải phiên làm việc…');
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

            // Reconstruct stream messages only if session has active dialogue
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
                  if (s.chat.last_results && s.chat.last_results.length > 0) {
                    restoredAssistantBlocks.push({
                      type: 'venue_cards',
                      cards: s.chat.last_results
                    });
                  }
                  if (s.chat.pending.summary) {
                    restoredAssistantBlocks.push(s.chat.pending.summary);
                  } else {
                    restoredAssistantBlocks.push({
                      type: 'confirm_summary',
                      items: profileToUnderstoodItems(s.chat.profile),
                      shortlist: s.chat.shortlist || [],
                      missing: [],
                      warnings: []
                    });
                  }
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
                    question: s.chat.pending.question || s.chat.pending.prompt || getClarifyQuestionText(s.chat.pending.slot, s.chat),
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
      setBusyMessage('Đang khởi tạo phiên mới…');
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

  // Execute turn action or text with Q06 polite live region & draft preservation
  const executeTurn = async ({ text = null, action = null, onFail = null }) => {
    if (busy || (!text && !action)) return;
    setBusy(true);
    setErrorMessage(null);

    // Polite live announcement immediately when action begins (Q06)
    if (action?.name === 'confirm_yes') {
      setBusyMessage('Đang lập lịch trình tối ưu…');
      setLiveAnnouncement('Đang lập lịch trình ẩm thực tối ưu dựa trên lựa chọn của bạn…');
    } else {
      setBusyMessage('Đang đọc yêu cầu…');
      setLiveAnnouncement('Đang đọc yêu cầu và cập nhật dữ liệu…');
    }

    // Append user text immediately
    if (text) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', text, timestamp: Date.now() }
      ]);
    }

    let activeSessionId = sessionId;
    let activeToken = sessionToken;
    if (!activeSessionId && typeof window !== 'undefined') {
      activeSessionId = sessionStorage.getItem('foodtour_chat_session_id');
      activeToken = sessionStorage.getItem('foodtour_chat_session_token') || activeToken;
    }

    try {
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
        if (res.tour) {
          setTour(res.tour);
          // Auto switch to tour tab on mobile
          if (!isDesktop) setActiveMobileTab('tour');
        }
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
      setLastFailedTurn({ text, action });
      if (onFail) onFail();

      if (err?.status === 409) {
        setErrorMessage('Phiên làm việc đã thay đổi trên máy chủ. Đang tự động đồng bộ lại...');
        try {
          const s = await getSession(activeSessionId, activeToken);
          if (s) {
            setRevision(s.revision || 0);
            if (s.chat) setChatState(s.chat);
            if (s.tour) setTour(s.tour);

            // Sync stream with refreshed session
            const restoredBlocks = [];
            if (s.chat?.profile) {
              restoredBlocks.push({
                type: 'understood',
                items: profileToUnderstoodItems(s.chat.profile),
                allergies: s.chat.allergies || []
              });
            }
            if (s.chat?.pending) {
              if (s.chat.pending.kind === 'confirm_plan') {
                if (s.chat.last_results && s.chat.last_results.length > 0) {
                  restoredBlocks.push({
                    type: 'venue_cards',
                    cards: s.chat.last_results
                  });
                }
                if (s.chat.pending.summary) {
                  restoredBlocks.push(s.chat.pending.summary);
                } else {
                  restoredBlocks.push({
                    type: 'confirm_summary',
                    items: profileToUnderstoodItems(s.chat.profile),
                    shortlist: s.chat.shortlist || [],
                    missing: [],
                    warnings: []
                  });
                }
              } else if (s.chat.pending.slot === 'propose') {
                if (s.chat.last_results && s.chat.last_results.length > 0) {
                  restoredBlocks.push({
                    type: 'venue_cards',
                    cards: s.chat.last_results
                  });
                }
                restoredBlocks.push({
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
                restoredBlocks.push({
                  type: 'clarify',
                  question: s.chat.pending.question || s.chat.pending.prompt || getClarifyQuestionText(s.chat.pending.slot, s.chat),
                  options: s.chat.pending.options || [],
                  slot: s.chat.pending.slot,
                  free_text: true
                });
              }
            }
            if (s.tour) {
              restoredBlocks.push({
                type: 'tour_ready',
                revision: s.revision
              });
            }
            if (restoredBlocks.length > 0) {
              setMessages((prev) => [
                ...prev.filter((m) => m.role === 'user'),
                {
                  role: 'assistant',
                  reply: { blocks: restoredBlocks },
                  chat: s.chat,
                  tour: s.tour,
                  timestamp: Date.now()
                }
              ]);
            }
          }
        } catch (_) {}
      } else if (err?.status === 422) {
        setErrorMessage('Yêu cầu không hợp lệ hoặc vượt quá độ dài quy định. Bạn vui lòng nhập ngắn gọn hơn.');
      } else if (err?.status >= 500) {
        setErrorMessage('Máy chủ đang bận xử lý. Bạn vui lòng thử lại sau giây lát.');
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

  // Preserves draft on error (Q06)
  const handleSendMessage = (textToSend = null) => {
    const text = (textToSend || inputText).trim();
    if (!text || busy) return;
    const currentDraft = inputText;
    if (!textToSend) setInputText('');
    executeTurn({
      text,
      onFail: () => {
        if (!textToSend) setInputText(currentDraft);
      }
    });
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

  // Stop Replacement flow with ReplaceDiffModal & locks
  const handleInitiateReplace = (stop) => {
    if (busy) return;
    setReplaceTargetStop(stop);
    setReplaceResultDiff(null);
    setIsReplaceModalOpen(true);
  };

  const handleConfirmReplace = async () => {
    if (!replaceTargetStop || !sessionId || busy) return;
    setBusy(true);
    setBusyMessage('Đang tìm quán thay thế phù hợp…');
    setErrorMessage(null);
    const oldStop = replaceTargetStop;
    try {
      const res = await replaceTourStop(sessionId, revision, oldStop.venue_id, sessionToken);
      if (res) {
        if (res.revision !== undefined) setRevision(res.revision);
        if (res.tour) setTour(res.tour);
        if (res.chat) setChatState(res.chat);
        const newStop = res.tour?.stops?.find((s) => s.order === oldStop.order) || null;
        setReplaceResultDiff({ oldStop, newStop });
        const otherStops = (res.tour?.stops || []).filter((s) => s.venue_id !== newStop?.venue_id);
        setLockedVenueIds(otherStops.map((s) => s.venue_id));
      }
    } catch (err) {
      const errCode = err?.code || err?.data?.code || (err?.data?.detail?.code) || '';
      const errMsg = err?.message || err?.data?.message || err?.data?.detail?.message || '';
      if (errCode === 'revision_conflict' || (err?.status === 409 && (errCode === 'revision_conflict' || String(errMsg).includes('thay đổi') || String(errMsg).includes('revision')))) {
        setErrorMessage('Phiên làm việc đã có cập nhật mới hơn trên máy chủ. Đã cập nhật lại thông tin mới nhất.');
        try {
          const fresh = await getSession(sessionId, sessionToken);
          if (fresh) {
            if (fresh.revision !== undefined) setRevision(fresh.revision);
            if (fresh.chat) setChatState(fresh.chat);
            if (fresh.tour) setTour(fresh.tour);
          }
        } catch (_) {}
      } else if (errCode === 'no_candidates' || (err?.status === 409 && (String(errMsg).includes('phương án') || String(errMsg).includes('điểm dừng') || String(errMsg).includes('thay thế')))) {
        setErrorMessage(errMsg || 'Không có phương án thay thế thoả ràng buộc trong khu vực. Giữ nguyên tour hiện tại.');
      } else if (errCode === 'obligation_open' || (err?.status === 409 && String(errMsg).includes('câu hỏi'))) {
        setErrorMessage(errMsg || 'Còn câu hỏi về dị ứng hoặc ngân sách chưa được trả lời trong khung trò chuyện.');
      } else {
        setErrorMessage(errMsg || 'Không thể đổi quán lúc này. Bạn vui lòng thử lại.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCloseReplaceModal = () => {
    if (busy) return;
    setIsReplaceModalOpen(false);
    setReplaceTargetStop(null);
    setReplaceResultDiff(null);
  };

  const handleRestart = async () => {
    setMessages([]);
    setChatState(null);
    setTour(null);
    setLatestTurnMeta(null);
    setInputText('');
    setErrorMessage(null);
    setLastFailedTurn(null);
    setLockedVenueIds([]);
    setIsReplaceModalOpen(false);
    setActiveMobileTab('chat');
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('foodtour_chat_session_id');
        sessionStorage.removeItem('foodtour_chat_session_token');
      } catch (_) {}
    }
    setBusy(true);
    setBusyMessage('Đang tạo phiên mới…');
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
  const venueCardsBlock = (!chatState?.pending || chatState?.pending?.kind === 'confirm_plan' || chatState?.pending?.slot === 'propose') ? latestBlocks.find((b) => b.type === 'venue_cards') : null;
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

  const tourReadyBlock = latestBlocks.find((b) => b.type === 'tour_ready');
  const isTourReady = Boolean(tour && (tourReadyBlock || chatState?.phase === 'planned'));

  // Active Decision: strictly derived from current chatState.pending!
  let confirmSummaryBlock = null;
  let clarifyBlock = null;

  if (!isTourReady) {
    if (chatState?.pending) {
      if (chatState.pending.kind === 'confirm_plan') {
        if (chatState.pending.summary) {
          confirmSummaryBlock = chatState.pending.summary;
        } else {
          const latestConfirm = latestBlocks.find((b) => b.type === 'confirm_summary');
          if (latestConfirm) {
            confirmSummaryBlock = latestConfirm;
          } else {
            const previousConfirm = [...messages]
              .reverse()
              .map((m) => m.reply?.blocks?.find((b) => b.type === 'confirm_summary'))
              .find(Boolean);
            if (previousConfirm) {
              confirmSummaryBlock = previousConfirm;
            } else {
              confirmSummaryBlock = {
                type: 'confirm_summary',
                items: profileToUnderstoodItems(chatState.profile),
                shortlist: chatState.shortlist || [],
                missing: [],
                warnings: []
              };
            }
          }
        }
      } else {
        // Pending is a clarify question (clarify_slot)
        const latestClarify = latestBlocks.find((b) => b.type === 'clarify');
        if (latestClarify && (!chatState.pending.slot || latestClarify.slot === chatState.pending.slot)) {
          clarifyBlock = latestClarify;
        } else {
          const previousClarify = [...messages]
            .reverse()
            .map((m) => m.reply?.blocks?.find((b) => b.type === 'clarify'))
            .find(Boolean);
          if (previousClarify && (!chatState.pending.slot || previousClarify.slot === chatState.pending.slot)) {
            clarifyBlock = previousClarify;
          } else {
            clarifyBlock = {
              type: 'clarify',
              pending_id: chatState.pending.pending_id || 'p_restored',
              question: chatState.pending.question || chatState.pending.prompt || getClarifyQuestionText(chatState.pending.slot, chatState),
              options: chatState.pending.options || [],
              slot: chatState.pending.slot,
              free_text: true
            };
          }
        }
      }
    } else {
      // Fallback when chatState.pending is null/undefined
      confirmSummaryBlock = latestBlocks.find((b) => b.type === 'confirm_summary') || null;
      if (!confirmSummaryBlock) {
        clarifyBlock = latestBlocks.find((b) => b.type === 'clarify') || null;
      }
    }
  }

  // Tour Gate: Tour is rendered ONLY when tour is available and tour_ready block or planned phase is reached
  const showTour = Boolean(tour && (tourReadyBlock || chatState?.phase === 'planned'));

  // Filter text blocks to enforce EXACTLY ONE visible decision question across DOM
  const filteredTextBlocks = textBlocks.filter((b) => {
    if (!b?.text) return false;
    if ((confirmSummaryBlock || clarifyBlock) && b.text.trim().endsWith('?')) {
      return false;
    }
    return true;
  });

  const currentAllergies = understoodBlock?.allergies || chatState?.allergies || [];

  // Focus and viewport management
  useEffect(() => {
    if (busy) return;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const isUserTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

    if (showTour) {
      if (lastFocusedKeyRef.current !== 'tour') {
        lastFocusedKeyRef.current = 'tour';
        const mapsCta = document.querySelector('[data-testid="google-maps-cta"]');
        if (mapsCta) {
          mapsCta.focus();
          mapsCta.scrollIntoView({ block: 'nearest' });
        }
      }
      return;
    }

    if (confirmSummaryBlock) {
      if (lastFocusedKeyRef.current !== 'confirm') {
        lastFocusedKeyRef.current = 'confirm';
        const confirmYesBtn = document.querySelector('[data-testid="confirm-yes-btn"]');
        if (confirmYesBtn) {
          confirmYesBtn.focus();
          confirmYesBtn.scrollIntoView({ block: 'nearest' });
        }
      }
      return;
    }

    if (clarifyBlock) {
      const clarifyKey = `${clarifyBlock.slot || ''}_${clarifyBlock.pending_id || clarifyBlock.question || ''}`;
      if (lastFocusedKeyRef.current !== clarifyKey) {
        lastFocusedKeyRef.current = clarifyKey;
        if (!isUserTyping) {
          const tryFocus = () => {
            const firstChip = document.querySelector('[data-testid^="clarify-option-"]');
            if (firstChip) {
              firstChip.focus();
              firstChip.scrollIntoView({ block: 'nearest' });
              return true;
            }
            const freeInput = document.querySelector('[data-testid="clarify-free-text-input"]');
            if (freeInput) {
              freeInput.focus();
              freeInput.scrollIntoView({ block: 'nearest' });
              return true;
            }
            return false;
          };
          if (!tryFocus()) {
            const timer = setTimeout(tryFocus, 20);
            return () => clearTimeout(timer);
          }
        }
      }
    }
  }, [clarifyBlock, confirmSummaryBlock, showTour, busy]);

  // Derived metrics for Right Panel (NFE-01: honest nulls/zeros, no sample 1.8km/450k)
  const stops = tour?.stops || [];
  const distanceKm = (tour?.totals?.distance_m !== null && tour?.totals?.distance_m !== undefined)
    ? (Math.round(tour.totals.distance_m / 100) / 10).toLocaleString('vi-VN')
    : null;
  const budgetVal = chatState?.profile?.budget?.value;
  const budgetScope = chatState?.profile?.budget?.scope;
  const budgetScopeLabel = budgetScope === 'group' ? 'cả nhóm' : 'mỗi người';
  const budgetDisplay = (budgetVal !== null && budgetVal !== undefined && !isNaN(Number(budgetVal)))
    ? `≈ ${Math.round(Number(budgetVal) / 1000)}K`
    : null;

  return (
    <div
      data-testid="guided-container"
      aria-busy={busy}
      style={{
        minHeight: '100vh',
        backgroundColor: '#F7F8F2',
        color: '#17352B',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: 'flex',
        flexDirection: 'column',
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

      {/* 80px SVG-Inspired Header */}
      <header
        style={{
          height: 80,
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #DDE7E1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          boxSizing: 'border-box',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        {/* Brand Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              backgroundColor: '#166B52',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#DFF46A',
              fontSize: 22,
              fontWeight: 800,
              boxShadow: '0 2px 6px rgba(22, 107, 82, 0.25)'
            }}
          >
            ✦
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#17352B', lineHeight: 1.2 }}>
              NgonNgon Tour
            </div>
            <div style={{ fontSize: 12, color: '#62736D', fontWeight: 500 }}>
              Ăn ngon • Đi đúng gu
            </div>
          </div>
        </div>

        {/* Center Navigation Pills */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
          aria-label="Điều hướng chính"
        >
          <button
            type="button"
            role="tab"
            aria-selected={isDesktop || activeMobileTab === 'chat'}
            aria-current={(isDesktop || activeMobileTab === 'chat') ? 'page' : undefined}
            onClick={() => {
              if (isDesktop) {
                chatSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                inputRef.current?.focus();
              } else {
                setActiveMobileTab('chat');
              }
            }}
            style={{
              padding: '8px 20px',
              borderRadius: 20,
              backgroundColor: (isDesktop || activeMobileTab === 'chat') ? '#166B52' : '#FFFFFF',
              color: (isDesktop || activeMobileTab === 'chat') ? '#FFFFFF' : '#62736D',
              border: (isDesktop || activeMobileTab === 'chat') ? 'none' : '1px solid #DDE7E1',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 44
            }}
          >
            Khám phá
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isDesktop && activeMobileTab === 'tour'}
            aria-current={(!isDesktop && activeMobileTab === 'tour') ? 'page' : undefined}
            onClick={() => {
              if (isDesktop) {
                tourSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
              } else {
                setActiveMobileTab('tour');
              }
            }}
            style={{
              padding: '8px 20px',
              borderRadius: 20,
              backgroundColor: (!isDesktop && activeMobileTab === 'tour') ? '#166B52' : '#FFFFFF',
              color: (!isDesktop && activeMobileTab === 'tour') ? '#FFFFFF' : '#62736D',
              border: '1px solid #DDE7E1',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 44
            }}
          >
            Lịch trình {stops.length > 0 ? `(${stops.length})` : ''}
          </button>
        </nav>

        {/* Right Anonymous Profile & Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            data-testid="guided-reset-btn"
            onClick={handleRestart}
            disabled={busy}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: '1px solid #DDE7E1',
              backgroundColor: '#FFFFFF',
              color: '#62736D',
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <span>🔄</span>
            <span>Làm lại</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 6 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                backgroundColor: '#E8EFEA',
                color: '#166B52',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                border: '1px solid #DDE7E1'
              }}
              aria-label="Khách khám phá Hà Nội"
            >
              🍜
            </div>
            <div style={{ lineHeight: 1.25, display: isDesktop ? 'block' : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#17352B' }}>Khách ẩm thực</div>
              <div style={{ fontSize: 11, color: '#62736D' }}>Hà Nội</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Two-Column Desktop Shell */}
      <main
        style={{
          maxWidth: 1440,
          width: '100%',
          margin: '0 auto',
          padding: isDesktop ? '32px' : '16px',
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateColumns: isDesktop ? '460px 1fr' : '1fr',
          gap: isDesktop ? 40 : 20,
          alignItems: 'start',
          flex: 1
        }}
      >
        {/* LEFT COLUMN: Chat & Guided Interaction Card */}
        <section
          ref={chatSectionRef}
          id="guided-chat-section"
          tabIndex={-1}
          style={{
            display: (isDesktop || activeMobileTab === 'chat') ? 'flex' : 'none',
            flexDirection: 'column',
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            border: '1px solid #DDE7E1',
            boxShadow: '0 4px 20px rgba(22, 107, 82, 0.04)',
            padding: 24,
            boxSizing: 'border-box',
            minHeight: isDesktop ? 780 : 'auto',
            maxHeight: isDesktop ? 'calc(100vh - 144px)' : 'none',
            position: isDesktop ? 'sticky' : 'static',
            top: 104,
            gap: 16
          }}
        >
          {/* Assistant Header Banner */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid #F0F4EE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: '#DFF46A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  color: '#166B52'
                }}
              >
                ✦
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#17352B' }}>
                  Lên food tour cùng Măm Măm
                </div>
                <div style={{ fontSize: 12, color: '#62736D' }}>
                  Trợ lý ẩm thực địa phương
                </div>
              </div>
            </div>

            <span
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 12,
                backgroundColor: '#F0F6F2',
                color: '#166B52',
                border: '1px solid #DDE7E1',
                fontWeight: 600
              }}
            >
              Hà Nội
            </span>
          </div>

          {/* Heading & Subtitle */}
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#17352B', margin: '0 0 6px 0', lineHeight: 1.3 }}>
              Bạn muốn ăn gì hôm nay?
            </h2>
            <p style={{ fontSize: 13, color: '#62736D', margin: 0, lineHeight: 1.45 }}>
              Cho mình biết khu vực, thời gian và khẩu vị — mình sẽ xếp một hành trình vừa ngon vừa tiện đường.
            </p>
          </div>

          {/* Quick Preference / Suggestion Pills */}
          <div
            data-testid="suggestion-chips-container"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8
            }}
          >
            {[
              { label: 'Hoàn Kiếm', text: 'Tôi muốn ăn tour 3 quán quanh Hoàn Kiếm tối nay' },
              { label: 'Tối nay', text: 'Đi tour vào tối nay khoảng 120 phút' },
              { label: 'Món Việt', text: 'Thích các món Việt truyền thống như phở và chè' },
              { label: 'Dưới 300K', text: 'Ngân sách dưới 300 nghìn cho cả chuyến' }
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
                  border: '1px solid #DDE7E1',
                  backgroundColor: '#FFFFFF',
                  color: '#17352B',
                  fontSize: 13,
                  fontWeight: 600,
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

          {/* Error Banner if turn failed */}
          {errorMessage && (
            <div
              data-testid="guided-error-banner"
              role="alert"
              style={{
                backgroundColor: '#FEF3C7',
                color: '#92400E',
                border: '1px solid #FDE68A',
                borderRadius: 12,
                padding: '10px 14px',
                fontSize: 13,
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
                  backgroundColor: '#92400E',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                  minHeight: 40
                }}
              >
                Thử lại
              </button>
            </div>
          )}

          {/* Scrollable Conversation Stream Area */}
          <div
            data-testid={isStartScreen ? 'guided-start-screen' : 'guided-stream'}
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              paddingRight: 4
            }}
          >
            {/* Start Welcome Bubble when 0 messages */}
            {isStartScreen && (
              <div
                data-testid="guided-welcome-msg"
                style={{
                  backgroundColor: '#F0F4EE',
                  color: '#17352B',
                  padding: '14px 18px',
                  borderRadius: 16,
                  fontSize: 14,
                  lineHeight: 1.5,
                  fontWeight: 500
                }}
              >
                Chào bạn! Bạn muốn ăn gì, ở đâu, đi mấy người? Cứ nói tự nhiên, mình sẽ hỏi thêm nếu thiếu thông tin để xếp lịch trình chuẩn nhất.
              </div>
            )}

            {/* Stream turns */}
            {messages.map((msg, idx) => {
              if (msg.role === 'user') {
                return (
                  <div
                    key={idx}
                    data-testid="user-msg-bubble"
                    style={{
                      alignSelf: 'flex-end',
                      backgroundColor: '#166B52',
                      color: '#FFFFFF',
                      padding: '10px 16px',
                      borderRadius: '16px 16px 4px 16px',
                      maxWidth: '85%',
                      fontSize: 14,
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
            {!isStartScreen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredTextBlocks.map((b, idx) => (
                  <div
                    key={idx}
                    data-testid="assistant-text-bubble"
                    style={{
                      alignSelf: 'flex-start',
                      backgroundColor: '#F0F4EE',
                      color: '#17352B',
                      padding: '10px 16px',
                      borderRadius: '16px 16px 16px 4px',
                      maxWidth: '90%',
                      fontSize: 14,
                      lineHeight: 1.45,
                      border: '1px solid #DDE7E1',
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
                      backgroundColor: b.level === 'safety' ? '#FEF3C7' : '#F0F4EE',
                      color: b.level === 'safety' ? '#92400E' : '#17352B',
                      border: '1px solid #DDE7E1',
                      borderRadius: 12,
                      padding: '8px 12px',
                      fontSize: 12,
                      lineHeight: 1.4
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
                  <div data-testid="venue-cards-block" style={{ display: 'grid', gap: 10, margin: '6px 0' }}>
                    {(venueCardsBlock.cards || []).map((card, idx) => {
                      const v = card.venue || {};
                      const priceText = v.price?.min_vnd && v.price?.max_vnd
                        ? `Khoảng giá: ${Number(v.price.min_vnd).toLocaleString('vi-VN')} – ${Number(v.price.max_vnd).toLocaleString('vi-VN')} đ (theo nguồn)`
                        : 'Khoảng giá: chưa rõ (theo nguồn)';
                      const hoursText = v.hours?.display
                        ? `Giờ mở cửa theo nguồn: ${v.hours.display}`
                        : 'Giờ mở cửa theo nguồn: chưa rõ';
                      const distText = card.distance_m !== null && card.distance_m !== undefined
                        ? `cách ~${card.distance_m} m (ước tính)`
                        : null;

                      return (
                        <div
                          key={v.id || idx}
                          data-testid="venue-card"
                          style={{
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #DDE7E1',
                            borderRadius: 14,
                            padding: 12,
                            display: 'grid',
                            gap: 4
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={{
                                backgroundColor: '#166B52',
                                color: '#FFFFFF',
                                fontWeight: 700,
                                fontSize: 12,
                                width: 22,
                                height: 22,
                                borderRadius: 11,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {card.label || String.fromCharCode(65 + idx)}
                            </span>
                            <strong style={{ fontSize: 14, color: '#17352B' }}>
                              {v.name}
                            </strong>
                          </div>
                          <div style={{ fontSize: 12, color: '#62736D' }}>
                            📍 {v.address || v.district || 'Hà Nội'}{distText ? ` · ${distText}` : ''}
                          </div>
                          <div style={{ fontSize: 12, color: '#17352B' }}>
                            🏷️ {priceText}
                          </div>
                          <div style={{ fontSize: 11, color: '#62736D' }}>
                            🕒 {hoursText}
                          </div>
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

                {/* CONFIRM SUMMARY BLOCK (with warnings & status) */}
                {confirmSummaryBlock && (
                  <ConfirmSummaryCard
                    summary={confirmSummaryBlock}
                    profile={chatState?.profile}
                    onConfirmYes={handleConfirmYes}
                    onConfirmNo={handleConfirmNo}
                    busy={busy}
                  />
                )}
              </div>
            )}
          </div>

          {/* Tangible Polite Loading Indicator (Q06) */}
          {busy && (
            <div
              data-testid="guided-loading-indicator"
              role="status"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                backgroundColor: '#F0F6F2',
                color: '#166B52',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid #DDE7E1',
                alignSelf: 'flex-start'
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid #166B52',
                  borderTopColor: 'transparent',
                  animation: 'spin 0.8s linear infinite'
                }}
              />
              <span>{busyMessage}</span>
            </div>
          )}

          {/* Pinned Bottom Composer with Orange Send Button */}
          <div style={{ paddingTop: 8, borderTop: '1px solid #F0F4EE', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                backgroundColor: '#F4F6F0',
                border: '1px solid #DDE7E1',
                borderRadius: 24,
                padding: '4px 6px 4px 16px'
              }}
            >
              <input
                ref={inputRef}
                type="text"
                data-testid="guided-input"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={busy}
                placeholder="Thêm yêu cầu cho chuyến đi…"
                style={{
                  flex: 1,
                  minHeight: 40,
                  border: 'none',
                  backgroundColor: 'transparent',
                  fontSize: 14,
                  color: '#17352B',
                  outline: 'none',
                  padding: 0
                }}
              />
              <button
                type="submit"
                data-testid="guided-send-btn"
                disabled={busy || !inputText.trim()}
                aria-label="Gửi yêu cầu"
                style={{
                  width: 44,
                  height: 44,
                  minWidth: 44,
                  minHeight: 44,
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: inputText.trim() && !busy ? '#FF6B4A' : '#DDE7E1',
                  color: '#FFFFFF',
                  fontSize: 18,
                  fontWeight: 700,
                  cursor: inputText.trim() && !busy ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.15s ease',
                  flexShrink: 0
                }}
              >
                ➔
              </button>
            </form>

            {/* Early AI Privacy Disclosure (Q05) */}
            <div style={{ fontSize: 11, color: '#62736D', lineHeight: 1.4, padding: '0 4px' }}>
              🔒 Yêu cầu bằng ngôn ngữ tự nhiên được chuyển tới trợ lý AI để trích xuất tiêu chí tour. Không lưu thông tin cá nhân.
            </div>

            {/* Trust line */}
            <TrustDisclosure turn={latestTurnMeta} health={health} />
          </div>
        </section>

        {/* RIGHT COLUMN: Tour Itinerary & Route Overview Panel */}
        <section
          ref={tourSectionRef}
          id="guided-tour-section"
          tabIndex={-1}
          style={{
            display: (isDesktop || activeMobileTab === 'tour') ? 'flex' : 'none',
            flexDirection: 'column',
            gap: 20
          }}
        >
          {/* Top Eyebrow, Title & Meta */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '1px',
                  color: '#166B52',
                  textTransform: 'uppercase',
                  marginBottom: 4
                }}
              >
                FOOD TOUR ĐỀ XUẤT
              </div>
              <h1
                style={{
                  fontSize: isDesktop ? 32 : 24,
                  fontWeight: 800,
                  color: '#17352B',
                  margin: '0 0 6px 0',
                  lineHeight: 1.2
                }}
              >
                {showTour ? (tour.title || (stops[0]?.district ? `Lịch trình ẩm thực ${stops[0].district}` : 'Lịch trình ẩm thực')) : 'Hành trình ẩm thực Hà Nội'}
              </h1>
              <div style={{ fontSize: 13, color: '#62736D' }}>
                {showTour
                  ? `${stops[0]?.arrive ? `${stops[0].arrive}${stops[stops.length - 1]?.depart ? `–${stops[stops.length - 1].depart}` : ''}` : 'Thời gian linh hoạt'}${stops[0]?.district ? ` • ${stops[0].district}` : ''}`
                  : 'Chưa có lịch trình được tạo • Vui lòng chọn hoặc nhập yêu cầu ở cột bên trái'}
              </div>
            </div>
          </div>

          {/* 3 Metric Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16
            }}
          >
            {/* Metric 1 */}
            <div
              style={{
                backgroundColor: '#F0F6F2',
                border: '1px solid #DDE7E1',
                borderRadius: 16,
                padding: '16px 20px',
                display: 'grid',
                gap: 4
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, color: '#17352B' }}>
                {showTour ? `${stops.length} điểm` : '0 điểm'}
              </div>
              <div style={{ fontSize: 13, color: '#62736D' }}>
                Quán được chọn
              </div>
            </div>

            {/* Metric 2 */}
            <div
              style={{
                backgroundColor: '#FAF2EA',
                border: '1px solid #E8E2D8',
                borderRadius: 16,
                padding: '16px 20px',
                display: 'grid',
                gap: 4
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, color: '#17352B' }}>
                {showTour ? (distanceKm ? `${distanceKm} km` : 'Chưa tính') : '0 km'}
              </div>
              <div style={{ fontSize: 13, color: '#62736D' }}>
                Tổng di chuyển
              </div>
            </div>

            {/* Metric 3 */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #DDE7E1',
                borderRadius: 16,
                padding: '16px 20px',
                display: 'grid',
                gap: 4
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, color: '#17352B' }}>
                {showTour ? (budgetDisplay || 'Chưa đặt') : 'Theo ngân sách'}
              </div>
              <div style={{ fontSize: 13, color: '#62736D' }}>
                {budgetScopeLabel ? `Ngân sách (${budgetScopeLabel})` : 'Ngân sách'}
              </div>
            </div>
          </div>

          {/* HONEST EMPTY STATE (When tour is not generated yet) */}
          {!showTour && (
            <div
              data-testid="tour-empty-panel"
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 24,
                border: '1px solid #DDE7E1',
                padding: 32,
                display: 'grid',
                gap: 24
              }}
            >
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#17352B', margin: '0 0 8px 0' }}>
                  Lộ trình của bạn sẽ hiển thị tại đây
                </h3>
                <p style={{ fontSize: 14, color: '#62736D', margin: 0, lineHeight: 1.5 }}>
                  Ứng dụng tuân thủ nguyên tắc trung thực bằng chứng: không hiển thị lịch trình giả định hoặc tự ý tạo tour trước khi bạn kiểm tra và xác nhận các điều kiện mong muốn.
                </p>
              </div>

              {/* 3 Step Guide Box */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : '1fr',
                  gap: 16
                }}
              >
                <div style={{ backgroundColor: '#F0F6F2', borderRadius: 16, padding: 18, border: '1px solid #DDE7E1' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
                  <strong style={{ fontSize: 14, color: '#17352B', display: 'block', marginBottom: 4 }}>
                    1. Trò chuyện & Nêu ý
                  </strong>
                  <p style={{ fontSize: 12, color: '#62736D', margin: 0, lineHeight: 1.45 }}>
                    Cho AI biết khu vực, thời gian, số người, món muốn ăn hoặc kiêng ăn.
                  </p>
                </div>

                <div style={{ backgroundColor: '#F0F6F2', borderRadius: 16, padding: 18, border: '1px solid #DDE7E1' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                  <strong style={{ fontSize: 14, color: '#17352B', display: 'block', marginBottom: 4 }}>
                    2. Xem lại & Xác nhận
                  </strong>
                  <p style={{ fontSize: 12, color: '#62736D', margin: 0, lineHeight: 1.45 }}>
                    Kiểm tra các thông tin đã hiểu, lưu ý về giờ/giá theo nguồn và bấm xác nhận.
                  </p>
                </div>

                <div style={{ backgroundColor: '#F0F6F2', borderRadius: 16, padding: 18, border: '1px solid #DDE7E1' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🗺️</div>
                  <strong style={{ fontSize: 14, color: '#17352B', display: 'block', marginBottom: 4 }}>
                    3. Nhận lịch trình & Maps
                  </strong>
                  <p style={{ fontSize: 12, color: '#62736D', margin: 0, lineHeight: 1.45 }}>
                    Xem chi tiết từng điểm dừng, đổi quán linh hoạt và mở chỉ đường Google Maps miễn phí.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TOUR ITINERARY & ROUTE OVERVIEW (When tour is ready) */}
          {showTour && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isDesktop ? '1fr 300px' : '1fr',
                gap: 24,
                alignItems: 'start'
              }}
            >
              {/* Timeline Column */}
              <div>
                <GuidedTimeline
                  tour={tour}
                  allergies={currentAllergies}
                  lockedStops={lockedVenueIds}
                  onReplaceStop={handleInitiateReplace}
                  onChangeStop={() => {
                    if (stops.length > 0) handleInitiateReplace(stops[0]);
                  }}
                  onAdjustStops={() => handleFreeFormEdit({ id: 'adjust_stops', label: 'số lượng quán' })}
                  onRestart={handleRestart}
                />
              </div>

              {/* Secondary Route Overview Panel ("Bản đồ tuyến") */}
              <aside
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 20,
                  border: '1px solid #DDE7E1',
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  position: isDesktop ? 'sticky' : 'static',
                  top: 104
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#17352B' }}>
                    Bản đồ tuyến
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      backgroundColor: '#F0F6F2',
                      color: '#166B52',
                      padding: '2px 10px',
                      borderRadius: 12,
                      fontWeight: 600,
                      border: '1px solid #DDE7E1'
                    }}
                  >
                    Đi bộ
                  </span>
                </div>

                {/* Ordered Stops Subway-like List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', paddingLeft: 8 }}>
                  {stops.map((stop, idx) => (
                    <div
                      key={stop.venue_id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 0',
                        position: 'relative'
                      }}
                    >
                      {/* Connecting vertical line */}
                      {idx < stops.length - 1 && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 13,
                            top: 26,
                            bottom: -10,
                            width: 3,
                            backgroundColor: '#166B52',
                            zIndex: 1
                          }}
                        />
                      )}
                      {/* Number circle */}
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          backgroundColor: idx === stops.length - 1 ? '#FF6B4A' : '#166B52',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 12,
                          zIndex: 2,
                          flexShrink: 0
                        }}
                      >
                        {idx + 1}
                      </div>
                      <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#17352B' }}>
                          {stop.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#62736D' }}>
                          {stop.arrive ? `${stop.arrive} • ` : ''}{stop.district || 'Hà Nội'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Local tip card */}
                <div
                  style={{
                    backgroundColor: '#166B52',
                    color: '#FFFFFF',
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 12,
                    lineHeight: 1.45
                  }}
                >
                  <strong style={{ display: 'block', marginBottom: 4, color: '#DFF46A' }}>
                    Lưu ý:
                  </strong>
                  Giờ mở cửa và mức giá thực tế của quán có thể thay đổi tùy thời điểm; bạn nên kiểm tra lại trước khi đến.
                </div>
              </aside>
            </div>
          )}
        </section>
      </main>

      {/* Stop Replacement Modal (Server Diff & Lock support) */}
      <ReplaceDiffModal
        isOpen={isReplaceModalOpen}
        oldStop={replaceTargetStop}
        resultDiff={replaceResultDiff}
        lockedStops={lockedVenueIds}
        onConfirm={handleConfirmReplace}
        onCancel={handleCloseReplaceModal}
        busy={busy}
      />
    </div>
  );
}
