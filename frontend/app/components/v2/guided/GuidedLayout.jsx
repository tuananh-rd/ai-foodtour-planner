'use client';

import React, { useState, useEffect, useRef } from 'react';
import UnderstoodCard from './UnderstoodCard';
import ClarifyQuestionCard from './ClarifyQuestionCard';
import ConfirmSummaryCard from './ConfirmSummaryCard';
import GuidedTimeline from './GuidedTimeline';
import TrustDisclosure from './TrustDisclosure';
import ReplaceDiffModal from '../../ReplaceDiffModal';
import { chatTurn, getSession, replaceTourStop } from '../../../../lib/api';
import OnlineSearchResults from './OnlineSearchResults';
import PilotMap from './PilotMap';
import './guided-visual.css';
import './online-assistant.css';

/* Reference glyphs (outlined paths of the design file: 4-point star, send arrow). Decorative only. */
function StarGlyph({ color = '#DFF46A', size = 13.824 }) {
  return (
    <svg width={size} height={size} viewBox="45.918 33.432 13.824 13.824" aria-hidden="true" focusable="false">
      <path d="M52.47 47.256C52.338 46.476 51.99 45.636 51.426 44.736C50.862 43.824 50.058 42.978 49.014 42.198C47.982 41.418 46.95 40.92 45.918 40.704V39.948C46.938 39.708 47.916 39.264 48.852 38.616C49.8 37.956 50.592 37.164 51.228 36.24C51.876 35.292 52.29 34.356 52.47 33.432H53.226C53.334 34.032 53.55 34.65 53.874 35.286C54.198 35.91 54.612 36.51 55.116 37.086C55.632 37.65 56.208 38.16 56.844 38.616C57.792 39.288 58.758 39.732 59.742 39.948V40.704C59.082 40.836 58.398 41.106 57.69 41.514C56.994 41.922 56.346 42.408 55.746 42.972C55.146 43.524 54.654 44.106 54.27 44.718C53.706 45.618 53.358 46.464 53.226 47.256H52.47Z" fill={color} />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg width="16.326" height="12.06" viewBox="449.418 938.57 16.326 12.06" aria-hidden="true" focusable="false">
      <path d="M458.814 950.63C458.538 950.63 458.274 950.546 458.022 950.378C457.77 950.222 457.56 950.018 457.392 949.766C457.236 949.514 457.158 949.262 457.158 949.01C457.158 948.722 457.278 948.416 457.518 948.092C457.758 947.768 458.04 947.45 458.364 947.138C458.7 946.814 458.994 946.538 459.246 946.31H451.812C451.128 946.31 450.642 946.256 450.354 946.148C450.066 946.04 449.838 945.86 449.67 945.608C449.502 945.368 449.418 945.032 449.418 944.6C449.418 944.168 449.496 943.832 449.652 943.592C449.82 943.352 450.048 943.172 450.336 943.052C450.624 942.944 451.116 942.89 451.812 942.89H459.246L458.364 942.044C457.872 941.564 457.548 941.198 457.392 940.946C457.236 940.682 457.158 940.43 457.158 940.19C457.158 939.938 457.236 939.686 457.392 939.434C457.548 939.182 457.752 938.978 458.004 938.822C458.268 938.654 458.538 938.57 458.814 938.57C459.054 938.57 459.312 938.648 459.588 938.804C459.864 938.948 460.188 939.2 460.56 939.56L465.744 944.6L460.668 949.532C460.236 949.94 459.882 950.222 459.606 950.378C459.33 950.546 459.066 950.63 458.814 950.63Z" fill="#FFFFFF" />
    </svg>
  );
}


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
  if (profile.max_leg_min?.value !== null && profile.max_leg_min?.value !== undefined) {
    const status = profile.max_leg_min.source || 'user';
    items.push({ id: 'leg_time', label: 'Đi mỗi chặng tối đa', value: `${profile.max_leg_min.value} phút`, status, editable: true });
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

// One reconstruction path for reload and every revision-conflict recovery.
function sessionBlocks(session) {
  const chat = session.chat;
  if (!chat?.turn_count && !chat?.pending && !session.tour && !chat?.allergies?.length &&
      !Object.values(chat?.profile || {}).some(field => field?.value !== null && field?.value !== undefined)) return [];
  const blocks = [];
  if (chat?.profile) blocks.push({ type: 'understood', items: profileToUnderstoodItems(chat.profile), allergies: chat.allergies || [] });
  const pending = chat?.pending;
  if (pending) {
    if ((pending.kind === 'confirm_plan' || pending.slot === 'propose') && chat.last_results?.length) {
      blocks.push({ type: 'venue_cards', cards: chat.last_results });
    }
    if (pending.kind === 'confirm_plan') {
      blocks.push(pending.summary || { type: 'confirm_summary', items: profileToUnderstoodItems(chat.profile),
        shortlist: chat.shortlist || [], missing: [], warnings: ['Phiên cũ chưa lưu đầy đủ bản xác nhận; hãy kiểm tra lại các tiêu chí và bằng chứng.'] });
    } else {
      blocks.push({ type: 'clarify', pending_id: pending.pending_id,
        question: pending.question || pending.prompt || (pending.slot === 'propose' ? 'Bạn muốn dùng những quán này cho tour không?' : getClarifyQuestionText(pending.slot, chat)),
        options: pending.options || [], slot: pending.slot, free_text: true });
    }
  }
  if (session.tour && !pending) blocks.push({ type: 'tour_ready', revision: session.revision });
  return blocks;
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
  initError = null,
  initializing = false,
  onRetryInit,
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
  const [isDesktop, setIsDesktop] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState('chat'); // 'chat' | 'tour'

  // Online Assistant extensions: web search opt-in and route panel view mode
  const [webSearch, setWebSearch] = useState(false);
  const [viewMode, setViewMode] = useState('schematic'); // 'schematic' | 'map'

  const inputRef = useRef(null);
  const lastFocusedKeyRef = useRef('');
  const restoredRef = useRef(false);
  const focusTimerRef = useRef(null);
  const chatSectionRef = useRef(null);
  const tourSectionRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(document.documentElement.clientWidth >= 1200);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function restoreOwnedSnapshot(session, keepUsers = false) {
    setRevision(session.revision ?? 0);
    setChatState(session.chat || null);
    setTour(session.tour || null);
    setLockedVenueIds(session.tour?.locks || []);
    setLatestTurnMeta(null);
    const blocks = sessionBlocks(session);
    setMessages(previous => blocks.length ? [
      ...(keepUsers ? previous.filter(message => message.role === 'user') : []),
      { role: 'assistant', reply: { blocks }, chat: session.chat, tour: session.tour, timestamp: Date.now() }
    ] : []);
  }

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

  // Load the owned snapshot once the parent (page.js) has created or restored the session.
  // The parent owns session creation and the stored pointer; this component never creates or
  // replaces a session during initialization, so there is no double-init race and a transient
  // failure cannot overwrite the stored credential.
  const [loadNonce, setLoadNonce] = useState(0);
  useEffect(() => {
    const targetId = initialSessionId;
    const targetToken = initialSessionToken || '';
    if (!targetId) return undefined;
    let cancelled = false;
    setBusy(true);
    setBusyMessage('Đang tải phiên làm việc…');
    getSession(targetId, targetToken)
      .then((s) => {
        if (cancelled) return;
        if (s && (s.session_id || targetId)) {
          setSessionId(s.session_id || targetId);
          setSessionToken(s.token || targetToken);
          setRevision(s.revision || 0);
          const hasRestoredContent = Boolean(s.tour || s.chat?.pending);
          restoredRef.current = hasRestoredContent;
          restoreOwnedSnapshot(s);
          setSnapshotFailed(false);
          setErrorMessage(null);
        }
        setBusy(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setBusy(false);
        if ([401, 403, 404, 410].includes(err?.status) && onResetSession) {
          onResetSession();
          return;
        }
        setErrorMessage('Chưa tải lại được phiên của bạn. Phiên cũ vẫn được giữ; bấm Thử lại để khôi phục.');
        setSnapshotFailed(true);
      });
    return () => { cancelled = true; };
  }, [initialSessionId, initialSessionToken, loadNonce]);
  const [snapshotFailed, setSnapshotFailed] = useState(false);

  // Execute turn action or text with Q06 polite live region & draft preservation
  const executeTurn = async ({ text = null, action = null, onFail = null, webSearch = false }) => {
    if (busy || (!text && !action)) return;
    if (initializing || !sessionId) {
      // The parent (page.js) is the single owner of session creation: never create a second session here.
      if (!initializing && initError?.kind === 'start' && onRetryInit) onRetryInit();
      setErrorMessage(initializing
        ? 'Đang khởi tạo phiên, nội dung bạn nhập vẫn được giữ; hãy gửi lại sau giây lát.'
        : 'Phiên chưa sẵn sàng; nội dung bạn nhập vẫn được giữ. Đang thử khởi tạo lại, hãy gửi lại sau giây lát.');
      if (onFail) onFail();
      return;
    }
    if (initError?.kind === 'restore' || snapshotFailed) {
      // The previous session has not been restored yet: keep the draft and ask for a retry instead of acting on it blindly.
      setErrorMessage('Hãy khôi phục phiên trước (bấm Thử lại); nội dung bạn nhập vẫn được giữ.');
      if (onFail) onFail();
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    restoredRef.current = false;

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

    const activeSessionId = sessionId;
    const activeToken = sessionToken;

    try {
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
        if (webSearch) {
          body.web_search = true;
        }
      } else if (action) {
        body.action = action;
      }

      const res = await chatTurn(activeSessionId, body, activeToken);

      if (res) {
        if (res.revision !== undefined) setRevision(res.revision);
        if (res.chat) setChatState(res.chat);
        if (res.tour) {
          setTour(res.tour);
          // Auto switch to tour tab on mobile ONLY when actual generation/replacement returns tour_ready block
          const hasTourReadyBlock = Boolean(res.reply?.blocks?.some((b) => b.type === 'tour_ready'));
          if (!isDesktop && hasTourReadyBlock) {
            setActiveMobileTab('tour');
          }
        }
        if (res.turn) setLatestTurnMeta(res.turn);

        if (typeof window !== 'undefined' && activeSessionId) {
          sessionStorage.setItem('foodtour_chat_session_id', activeSessionId);
          if (activeToken) sessionStorage.setItem('foodtour_chat_session_token', activeToken);
        }

        // Live announcement for screen readers
        const rawReplyBlocks = res.reply?.blocks || [];
        const clarify = rawReplyBlocks.find((b) => b.type === 'clarify');
        const textBlock = rawReplyBlocks.find((b) => b.type === 'text');
        if (clarify?.question) {
          setLiveAnnouncement(clarify.question);
        } else if (textBlock?.text) {
          setLiveAnnouncement(textBlock.text);
        }

        // Ensure web_search blocks retain originating query for per-message retry
        const replyBlocks = rawReplyBlocks.map((b) => {
          if (b.type === 'web_search') {
            return { ...b, query: b.query || (webSearch ? text : null) };
          }
          return b;
        });

        // Append assistant response to stream
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            reply: { ...(res.reply || {}), blocks: replyBlocks },
            chat: res.chat,
            tour: res.tour,
            originating_query: webSearch ? text : null,
            timestamp: Date.now()
          }
        ]);
      }
    } catch (err) {
      setLastFailedTurn({ text, action, webSearch });
      if (onFail) onFail();

      if (err?.status === 409) {
        setErrorMessage('Phiên làm việc đã thay đổi trên máy chủ. Đang tự động đồng bộ lại...');
        try {
          const s = await getSession(activeSessionId, activeToken);
          if (s) {
            restoreOwnedSnapshot(s, true);
            setLastFailedTurn(null);
            setErrorMessage('Đã đồng bộ phiên mới nhất. Hãy kiểm tra câu hỏi và tiêu chí hiện tại trước khi tiếp tục.');
          }
        } catch (_) { setErrorMessage('Chưa tải được phiên mới nhất. Bạn vui lòng tải lại trước khi tiếp tục.'); }
      } else if (err?.status === 422) {
        setErrorMessage('Yêu cầu không hợp lệ hoặc vượt quá độ dài quy định. Bạn vui lòng nhập ngắn gọn hơn.');
      } else if (err?.code === 'provider_unavailable' && err?.details && typeof err.details === 'object' && 'originalError' in err.details) {
        setErrorMessage('Không kết nối được tới máy chủ. Hãy kiểm tra mạng rồi bấm Thử lại; nội dung bạn nhập vẫn được giữ.');
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
    if (initError && onRetryInit) { setErrorMessage(null); onRetryInit(); return; }
    if (snapshotFailed) { setSnapshotFailed(false); setErrorMessage(null); setLoadNonce((n) => n + 1); return; }
    if (!lastFailedTurn) return;
    setErrorMessage(null);
    executeTurn(lastFailedTurn);
  };

  // Real browser geolocation invocation (GPS)
  const triggerGeolocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMessage('Trình duyệt của bạn không hỗ trợ định vị (Geolocation API). Bạn hãy nhập khu vực hoặc chọn quận.');
      return;
    }
    setBusy(true);
    setBusyMessage('Đang lấy toạ độ GPS…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        executeTurn({
          action: {
            type: 'set_location',
            name: 'set_location',
            location: {
              lat,
              lon,
              label: `Toạ độ GPS (${lat.toFixed(4)}, ${lon.toFixed(4)})`
            }
          }
        });
      },
      (err) => {
        setBusy(false);
        setErrorMessage('Không thể lấy vị trí từ trình duyệt (hoặc bạn đã từ chối cấp quyền). Bạn hãy nhập tên khu vực hoặc chọn quận.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Preserves draft on error (Q06)
  const handleSendMessage = (textToSend = null) => {
    const text = (textToSend || inputText).trim();
    if (!text || busy) return;
    const lower = text.toLowerCase();
    if (/^(?:bật định vị|lấy vị trí gps|dùng gps|vị trí của tôi|định vị tôi)$/i.test(lower)) {
      if (!textToSend) setInputText('');
      triggerGeolocation();
      return;
    }
    const currentDraft = inputText;
    const sendWithWebSearch = Boolean(webSearch);
    if (!textToSend) setInputText('');
    setWebSearch(false); // Reset one-turn opt-in immediately upon sending
    executeTurn({
      text,
      webSearch: sendWithWebSearch,
      onFail: () => {
        if (!textToSend) setInputText(currentDraft);
        if (sendWithWebSearch) setWebSearch(true); // Preserve draft and opt-in on failure
      }
    });
  };

  const handlePickOption = (option_id) => {
    if (option_id === 'geo') {
      triggerGeolocation();
      return;
    }
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

  // The editor uses short slot names; the chat API patch uses the contract field names.
  const handleInlineSave = (slotKey, value) => {
    const field = { budget: 'budget_vnd', duration: 'duration_min', party: 'party_size', time: 'start_time', leg_time: 'max_leg_min', stops: 'stops' }[slotKey] || slotKey;
    const patchValue = slotKey === 'vehicle' && value === 'motorcycle' ? 'motorbike' : value;
    executeTurn({
      action: {
        name: 'edit_profile',
        payload: { [field]: patchValue },
        type: 'edit_profile',
        patch: { [field]: patchValue }
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
        restoreOwnedSnapshot(res, true);
        const newStop = res.tour?.stops?.find((s) => s.order === oldStop.order) || null;
        setReplaceResultDiff({ oldStop, newStop });
      }
    } catch (err) {
      setIsReplaceModalOpen(false);
      setReplaceTargetStop(null);
      setReplaceResultDiff(null);
      if (err?.code === 'revision_conflict' || err?.code === 'obligation_open') {
        try {
          const fresh = await getSession(sessionId, sessionToken);
          restoreOwnedSnapshot(fresh, true);
          setLastFailedTurn(null);
          setActiveMobileTab('chat');
          setErrorMessage('Đã đồng bộ phiên mới nhất. Hãy kiểm tra câu hỏi và tiêu chí hiện tại trước khi đổi quán.');
        } catch (_) {
          setErrorMessage('Chưa tải được phiên mới nhất. Bạn vui lòng tải lại trước khi đổi quán.');
        }
      } else if (err?.code === 'no_candidates') {
        setErrorMessage('Không có quán thay thế thoả các ràng buộc. Lịch trình hiện tại được giữ nguyên.');
      } else {
        setErrorMessage('Không thể đổi quán lúc này. Lịch trình được giữ nguyên; bạn có thể thử lại.');
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
    setWebSearch(false);
    setViewMode('schematic');
    restoredRef.current = false;
    lastFocusedKeyRef.current = '';
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('foodtour_chat_session_id');
        sessionStorage.removeItem('foodtour_chat_session_token');
      } catch (_) {}
    }
    // The parent owns session creation (single owner, no duplicate create): clear local ids and let it create the new one.
    setSessionId(null);
    setSessionToken('');
    setRevision(0);
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
  const isTourReady = Boolean(tour && !chatState?.pending && (tourReadyBlock || chatState?.phase === 'planned'));

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
  const showTour = isTourReady;

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
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    if (busy) return undefined;
    if (restoredRef.current && (showTour || confirmSummaryBlock || clarifyBlock)) {
      // Session restored on page load: show it where the user left it, do not steal focus or scroll.
      restoredRef.current = false;
      lastFocusedKeyRef.current = showTour ? 'tour' : confirmSummaryBlock ? 'confirm'
        : `${clarifyBlock.slot || ''}_${clarifyBlock.pending_id || clarifyBlock.question || ''}`;
      return undefined;
    }

    const active = typeof document !== 'undefined' ? document.activeElement : null;
    // Genuinely new typing: user has an active input/textarea and has typed non-empty text,
    // or is focused on the clarify free-text composer.
    const isComposerInput = active && (active === inputRef.current || active.getAttribute('data-testid') === 'guided-input');
    const isClarifyFreeInput = active && active.getAttribute('data-testid') === 'clarify-free-text-input';
    const isUserTypingNewDraft = Boolean(
      (isComposerInput && inputText.trim().length > 0) ||
      (isClarifyFreeInput && active.value && active.value.trim().length > 0) ||
      (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && !isComposerInput && !isClarifyFreeInput && active.value && active.value.trim().length > 0)
    );

    if (showTour) {
      if (lastFocusedKeyRef.current !== 'tour') {
        const mapsCta = document.querySelector('[data-testid="google-maps-cta"]');
        if (mapsCta) {
          mapsCta.focus();
          mapsCta.scrollIntoView({ block: 'nearest' });
          if (document.activeElement === mapsCta) {
            lastFocusedKeyRef.current = 'tour';
          }
        }
      }
      return undefined;
    }

    if (confirmSummaryBlock) {
      if (lastFocusedKeyRef.current !== 'confirm') {
        const confirmYesBtn = document.querySelector('[data-testid="confirm-yes-btn"]');
        if (confirmYesBtn) {
          confirmYesBtn.focus({ preventScroll: true });
          confirmYesBtn.closest('[data-testid="confirm-summary-card"]')?.scrollIntoView({ block: 'start' });
          const headerHeight = document.querySelector('header')?.getBoundingClientRect().height || 0;
          window.scrollBy(0, -headerHeight - 12);
          if (document.activeElement === confirmYesBtn) {
            lastFocusedKeyRef.current = 'confirm';
          }
        }
      }
      return undefined;
    }

    if (clarifyBlock) {
      const clarifyKey = `${clarifyBlock.slot || ''}_${clarifyBlock.pending_id || clarifyBlock.question || ''}`;
      if (lastFocusedKeyRef.current !== clarifyKey && !isUserTypingNewDraft) {
        const tryFocus = () => {
          // If user started typing a new draft while waiting, do not steal focus
          const currentActive = typeof document !== 'undefined' ? document.activeElement : null;
          const currentComposer = currentActive && (currentActive === inputRef.current || currentActive.getAttribute('data-testid') === 'guided-input');
          if (currentComposer && currentActive.value && currentActive.value.trim().length > 0) {
            return true; // cease attempt, keep user focus
          }

          const firstChip = document.querySelector('[data-testid^="clarify-option-"]');
          if (firstChip && !firstChip.disabled) {
            firstChip.focus();
            firstChip.scrollIntoView({ block: 'nearest' });
            if (document.activeElement === firstChip) {
              lastFocusedKeyRef.current = clarifyKey;
              return true;
            }
          }
          const freeInput = document.querySelector('[data-testid="clarify-free-text-input"]');
          if (freeInput && !freeInput.disabled) {
            freeInput.focus();
            freeInput.scrollIntoView({ block: 'nearest' });
            if (document.activeElement === freeInput) {
              lastFocusedKeyRef.current = clarifyKey;
              return true;
            }
          }
          return false;
        };

        const attempt = (retriesLeft = 12) => {
          if (tryFocus()) return;
          if (retriesLeft > 0) {
            focusTimerRef.current = setTimeout(() => attempt(retriesLeft - 1), 25);
          }
        };

        attempt(12);
      }
    }

    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, [clarifyBlock, confirmSummaryBlock, showTour, busy, inputText]);

  // Derived metrics for Right Panel (NFE-01: honest nulls/zeros, no sample 1.8km/450k)
  const stops = tour?.stops || [];
  const knownLegs = stops.length > 0 && stops.every(stop =>
    typeof stop.leg_from_previous?.km === 'number' && Number.isFinite(stop.leg_from_previous.km) &&
    stop.leg_from_previous.km >= 0 && stop.leg_from_previous.source !== 'unknown');
  const distanceKm = knownLegs ? stops.reduce((sum, stop) => sum + stop.leg_from_previous.km, 0)
    .toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : null;
  const budgetVal = chatState?.profile?.budget?.value;
  const budgetScope = chatState?.profile?.budget?.scope;
  const budgetScopeLabel = budgetScope === 'group' ? 'cả nhóm' : budgetScope === 'per_person' ? 'mỗi người' : 'chưa rõ phạm vi';
  const budgetDisplay = (budgetVal !== null && budgetVal !== undefined && !isNaN(Number(budgetVal)))
    ? `${Number(budgetVal).toLocaleString('vi-VN')} đ`
    : null;
  const rawArea = chatState?.profile?.area?.value;
  const areaVal = typeof rawArea === 'object' ? (rawArea?.label || rawArea?.district || null) : (typeof rawArea === 'string' ? rawArea : null);
  const AREA_LABELS = {
    hoan_kiem: 'Hoàn Kiếm, Hà Nội',
    ba_dinh: 'Ba Đình, Hà Nội',
    tay_ho: 'Tây Hồ, Hà Nội',
    dong_da: 'Đống Đa, Hà Nội',
    hai_ba_trung: 'Hai Bà Trưng, Hà Nội',
    cau_giay: 'Cầu Giấy, Hà Nội'
  };
  const areaDisplay = stops[0]?.district || (areaVal ? (AREA_LABELS[areaVal] || areaVal) : null);

  const vehicleLabel = { walk: 'Đi bộ', motorbike: 'Xe máy', car: 'Ô tô', taxi: 'Taxi/Grab' }[chatState?.profile?.vehicle?.value] || null;
  const profileNow = chatState?.profile || {};
  const chipOn = {
    area: String(profileNow.area?.value?.label || '').toLowerCase().includes('hoàn kiếm'),
    tonight: profileNow.day_part?.value === 'evening',
    cheap: Number(profileNow.budget?.value) > 0 && Number(profileNow.budget?.value) <= 300000
  };
  const suggestionChips = [
    { label: 'Ẩm thực đường phố', on: false, text: 'Gợi ý ẩm thực đường phố quanh phố cổ' },
    { label: 'Hẹn hò cuối tuần', on: false, text: 'Lịch trình nhẹ nhàng cho 2 người đi ăn tối cuối tuần' },
    { label: 'Quán local', on: false, text: 'Quán local chuẩn vị Hà Nội' },
    { label: 'Dưới 300K', on: chipOn.cheap, text: 'Ngân sách dưới 300 nghìn cho cả chuyến' },
    { label: '📍 Vị trí GPS', on: false, isGeo: true }
  ];
  const chatVisible = isDesktop || activeMobileTab === 'chat';
  const tourVisible = isDesktop || activeMobileTab === 'tour';

  return (
    <div data-testid="guided-container" aria-busy={busy} className="nn-root">
      {/* Screen Reader Live Announcement Region */}
      <div aria-live="polite" aria-atomic="true" data-testid="guided-aria-live" className="nn-sr">
        {liveAnnouncement}
      </div>

      {/* 1. LEFT RUST SIDEBAR (232px) */}
      <aside className="nn-sidebar" aria-label="Thanh bên điều hướng">
        <div className="nn-sidebar-top">
          <div className="nn-brand-block">
            <h1 className="nn-brand-logo">măm măm.</h1>
            <div className="nn-brand-slogan">ĐI ĐỂ ĂN. ĂN ĐỂ NHỚ.</div>
          </div>

          <button
            type="button"
            data-testid="guided-reset-btn"
            className="nn-new-trip-btn"
            onClick={handleRestart}
            disabled={busy}
            aria-label="Tạo chuyến đi mới"
          >
            <span aria-hidden="true">+</span> Chuyến đi mới
          </button>

          <nav className="nn-sidebar-nav" aria-label="Chức năng chính">
            <button
              type="button"
              data-testid="mobile-tab-chat"
              className={`nn-sidebar-nav-item${activeMobileTab === 'chat' ? ' active' : ''}`}
              aria-pressed={activeMobileTab === 'chat'}
              onClick={() => {
                setActiveMobileTab('chat');
                if (isDesktop) {
                  chatSectionRef.current?.scrollIntoView({ block: 'start' });
                  chatSectionRef.current?.focus({ preventScroll: true });
                }
              }}
            >
              <span className="nn-nav-icon">✦</span> Trò chuyện
            </button>
            <button
              type="button"
              data-testid="mobile-tab-tour"
              className={`nn-sidebar-nav-item${activeMobileTab === 'tour' ? ' active' : ''}`}
              aria-pressed={activeMobileTab === 'tour'}
              onClick={() => {
                setActiveMobileTab('tour');
                if (isDesktop) {
                  tourSectionRef.current?.scrollIntoView({ block: 'start' });
                  tourSectionRef.current?.focus({ preventScroll: true });
                }
              }}
            >
              <span className="nn-nav-icon">◇</span> Lịch trình {stops.length > 0 ? `(${stops.length})` : ''}
            </button>
          </nav>

          <div className="nn-sidebar-recent">
            <div data-testid="sidebar-recent-header" className="nn-recent-header">GỢI Ý NHANH</div>
            <div className="nn-recent-list">
              <button
                type="button"
                className="nn-recent-item"
                onClick={() => {
                  setInputText('Một tối ẩm thực quanh Hồ Gươm');
                  inputRef.current?.focus();
                }}
              >
                Một tối quanh Hồ Gươm
              </button>
              <button
                type="button"
                className="nn-recent-item"
                onClick={() => {
                  setInputText('Food tour phố cổ cho 2 người');
                  inputRef.current?.focus();
                }}
              >
                Food tour phố cổ 2 người
              </button>
              <button
                type="button"
                className="nn-recent-item"
                onClick={() => {
                  setInputText('Cà phê & món tráng miệng');
                  inputRef.current?.focus();
                }}
              >
                Cà phê & món tráng miệng
              </button>
            </div>
          </div>
        </div>

        <div className="nn-sidebar-bottom">
          <div className="nn-promo-card">
            <div className="nn-promo-title">Ăn như người bản địa</div>
            <div className="nn-promo-desc">Những ngõ nhỏ luôn có câu chuyện ngon.</div>
          </div>

          <div className="nn-profile-footer">
            <div className="nn-profile-avatar" aria-label="Khách ẩm thực">K</div>
            <div className="nn-profile-info">
              <div className="nn-profile-name">Phiên cục bộ</div>
              <div className="nn-profile-sub">Lưu trữ trên trình duyệt</div>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CANVAS WRAPPER */}
      <div className="nn-canvas-wrapper">
        {/* Topbar: Breadcrumb + utility chips */}
        <header className="nn-topbar">
          <div className="nn-breadcrumb">
            KHÁM PHÁ / TRỢ LÝ FOOD TOUR
          </div>
          <div className="nn-topbar-utilities">
            <div className="nn-util-chip" title="Khu vực khảo sát">
              <span className="nn-target-icon">⌖</span> {areaDisplay || 'Hà Nội'}
            </div>
            <div className="nn-util-chip" title="Ngôn ngữ giao diện">
              Tiếng Việt
            </div>
          </div>
        </header>

        {/* Main Content Grid: Left Chat Card (668px) + Right Tour Column (452px) */}
        <main className="nn-main-grid">
          {/* LEFT CHAT CARD */}
          <section
            ref={chatSectionRef}
            id="guided-chat-section"
            tabIndex={-1}
            className={`nn-chat-card${chatVisible ? '' : ' nn-hidden'}${confirmSummaryBlock && !isStartScreen ? ' confirming' : (clarifyBlock && !isStartScreen ? ' deciding' : '')}`}
          >
            <div className="nn-chat-card-header">
              <div className="nn-assistant-badge">
                <span>✦</span> MĂM MĂM AI
              </div>
              <span className="nn-assistant-tagline">Người bạn sành ăn của bạn</span>
            </div>

            <h2 className="nn-hero-heading">
              {confirmSummaryBlock
                ? 'Xem lại lịch trình của bạn'
                : (clarifyBlock ? 'Một chút điều chỉnh nữa nhé' : <>Hôm nay, mình<br className="nn-heading-break" />ăn cả Hà Nội nhé?</>)}
            </h2>
            <p className="nn-hero-sub">
              {confirmSummaryBlock
                ? 'Kiểm tra thông tin điểm dừng, lưu ý theo nguồn và xác nhận để tạo lộ trình.'
                : (clarifyBlock
                  ? 'Trả lời câu hỏi bên dưới để mình xếp điểm dừng đúng ý bạn nhất.'
                  : 'Một chút ngẫu hứng, một hành trình đúng gu. Kể mình nghe bạn đang thèm gì nào.')}
            </p>

            {/* Suggestion Chips */}
            <div data-testid="suggestion-chips-container" className="nn-chips-row">
              {suggestionChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="nn-filter-chip"
                  aria-pressed={chip.on}
                  data-testid={`suggestion-chip-${idx}`}
                  onClick={() => chip.isGeo ? triggerGeolocation() : handleSendMessage(chip.text)}
                  disabled={busy}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="nn-chat-divider" role="separator" />

            {(errorMessage || initError) && (
              <div data-testid="guided-error-banner" role="alert" className="nn-alert">
                <span>⚠️ {errorMessage || initError.message}</span>
                <button type="button" data-testid="guided-error-retry-btn" onClick={handleRetryFailed}>Thử lại</button>
              </div>
            )}

            {/* Scrollable Message Stream */}
            <div data-testid={isStartScreen ? 'guided-start-screen' : 'guided-stream'} className="nn-stream">
              {isStartScreen && (
                <div data-testid="guided-welcome-msg" className="nn-editorial-welcome">
                  <div className="nn-editorial-badge">✦ MĂM MĂM</div>
                  <div className="nn-bubble editorial-body">
                    Chào bạn! Bạn muốn ăn gì, ở đâu, đi mấy người? Cứ nói tự nhiên, mình sẽ gợi ý món ngon và xếp một lộ trình chuẩn bài nhất.
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                msg.role === 'user' ? (
                  <div key={idx} data-testid="user-msg-bubble" className="nn-bubble user">
                    {msg.text}
                  </div>
                ) : null
              ))}

              {!isStartScreen && (
                <div className="nn-blocks">
                  {filteredTextBlocks.map((b, idx) => (
                    <div key={idx} className="nn-editorial-assistant">
                      <div className="nn-editorial-badge">✦ MĂM MĂM</div>
                      <div data-testid="assistant-text-bubble" className="nn-bubble editorial-body">
                        {b.text}
                      </div>
                    </div>
                  ))}

                  {noticeBlocks.map((b, idx) => (
                    <div
                      key={idx}
                      data-testid={`notice-block-${b.code || idx}`}
                      className={`nn-bubble notice${b.level === 'safety' ? ' safety' : ''}`}
                    >
                      {b.text}
                    </div>
                  ))}

                  {latestBlocks.filter((b) => b.type === 'web_search').map((b, idx) => (
                    <OnlineSearchResults
                      key={b.block_id || idx}
                      block={b}
                      onRetry={(retryQuery) => {
                        const queryToReplay = retryQuery || b.query || latestAssistantMsg?.originating_query;
                        if (queryToReplay) {
                          executeTurn({ text: queryToReplay, webSearch: true });
                        }
                      }}
                    />
                  ))}

                  {understoodBlock && (
                    <UnderstoodCard
                      items={understoodBlock.items}
                      allergies={understoodBlock.allergies}
                      onInlineSave={handleInlineSave}
                      onFreeFormEdit={handleFreeFormEdit}
                    />
                  )}

                  {venueCardsBlock && (
                    <div data-testid="venue-cards-block" className="nn-venues">
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
                          <div key={v.id || idx} data-testid="venue-card" className="nn-venue">
                            <div>
                              <span className="tag">{card.label || String.fromCharCode(65 + idx)}</span>
                              <strong>{v.name}</strong>
                            </div>
                            <div className="meta">📍 {v.address || v.district || 'Hà Nội'}{distText ? ` · ${distText}` : ''}</div>
                            <div className="meta">🏷️ {priceText}</div>
                            <div className="meta">🕒 {hoursText}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {clarifyBlock && !confirmSummaryBlock && !isStartScreen && (
                <div className="nn-pin">
                  <ClarifyQuestionCard
                    clarify={clarifyBlock}
                    onPickOption={handlePickOption}
                    onSubmitText={(txt) => handleSendMessage(txt)}
                    busy={busy}
                  />
                </div>
              )}

              {confirmSummaryBlock && !isStartScreen && (
                <div className="nn-pin">
                  <ConfirmSummaryCard
                    summary={confirmSummaryBlock}
                    profile={chatState?.profile}
                    onConfirmYes={handleConfirmYes}
                    onConfirmNo={handleConfirmNo}
                    busy={busy}
                  />
                </div>
              )}
            </div>

            {busy && (
              <div data-testid="guided-loading-indicator" role="status" className="nn-busy">
                <i />
                <span>{busyMessage}</span>
              </div>
            )}

            {/* Quick followups row */}
            {!isStartScreen && !confirmSummaryBlock && !clarifyBlock && (
              <div className="nn-quick-followups">
                <button type="button" className="nn-quick-btn" onClick={() => handleSendMessage('Thêm món chay')}>
                  + Thêm món chay
                </button>
                <button type="button" className="nn-quick-btn" onClick={() => handleSendMessage('Ít di chuyển hơn, đi bộ gần')}>
                  Ít di chuyển hơn
                </button>
                <button type="button" className="nn-quick-btn" onClick={() => handleSendMessage('Đổi ngân sách')}>
                  Đổi ngân sách
                </button>
              </div>
            )}

            {/* Footer Composer & Trust */}
            <div className="nn-chat-foot">
              <p className="nn-legal">
                {health?.llm === 'gemini'
                  ? 'Khi cần và còn lượt, nội dung bạn nhập có thể được gửi đến Google Gemini để hiểu yêu cầu.'
                  : 'Yêu cầu đang được đọc theo quy tắc tại máy, không gửi AI bên ngoài trong chế độ này.'}
                {' '}Khi tải lại trang, ứng dụng khôi phục tiêu chí và lịch trình của phiên.
              </p>
              <TrustDisclosure turn={latestTurnMeta} health={health} />

              {!confirmSummaryBlock && (
                <>
                  <div className="nn-web-optin-container">
                    <label className="nn-web-optin-row" data-testid="online-search-toggle">
                      <input
                        type="checkbox"
                        data-testid="web-search-optin-checkbox"
                        className="nn-web-optin-checkbox"
                        checked={webSearch}
                        onChange={(e) => setWebSearch(e.target.checked)}
                        disabled={busy}
                      />
                      <span>Tra web</span>
                      <span className="nn-web-optin-badge">Tavily</span>
                    </label>
                    {webSearch && (
                      <div className="nn-web-optin-explanation" data-testid="web-search-optin-explanation">
                        Chỉ câu hỏi ngắn của lượt này được gửi đến công cụ tìm kiếm Tavily; không gửi vị trí GPS hay lịch sử trò chuyện. Không nhập thông tin cá nhân.
                      </div>
                    )}
                  </div>

                  <form
                    className="nn-composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendMessage();
                    }}
                  >
                    <input
                      ref={inputRef}
                      type="text"
                      data-testid="guided-input"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      disabled={busy}
                      placeholder="Bạn muốn điều chỉnh gì cho chuyến đi?"
                      aria-label="Thêm yêu cầu cho chuyến đi"
                    />
                    <button
                      type="submit"
                      data-testid="guided-send-btn"
                      className="nn-send"
                      disabled={busy || !inputText.trim()}
                      aria-label="Gửi yêu cầu"
                    >
                      <span className="nn-send-label">Gửi tin nhắn</span>
                      <ArrowGlyph />
                    </button>
                  </form>
                </>
              )}
            </div>
          </section>

          {/* RIGHT TOUR COLUMN */}
          <section
            ref={tourSectionRef}
            id="guided-tour-section"
            data-focus-fallback
            tabIndex={-1}
            className={`nn-tour-col${tourVisible ? '' : ' nn-hidden'}`}
          >
            <div className="nn-tour-col-header">
              <h2 className="nn-tour-heading">Chuyến đi của bạn</h2>
              <div className="nn-view-mode-toggle" role="group" aria-label="Chế độ hiển thị tuyến">
                <button
                  type="button"
                  data-testid="view-mode-schematic-btn"
                  className={`nn-view-mode-btn${viewMode === 'schematic' ? ' active' : ''}`}
                  aria-pressed={viewMode === 'schematic'}
                  onClick={() => setViewMode('schematic')}
                >
                  Sơ đồ
                </button>
                <button
                  type="button"
                  data-testid="pilot-map-toggle"
                  data-legacy-testid="view-mode-map-btn"
                  className={`nn-view-mode-btn${viewMode === 'map' ? ' active' : ''}`}
                  aria-pressed={viewMode === 'map'}
                  onClick={() => setViewMode('map')}
                >
                  Bản đồ
                </button>
              </div>
            </div>

            {viewMode === 'map' ? (
              <div className="nn-map-container-wrap">
                <PilotMap
                  stops={stops}
                  onFallbackToSchematic={() => setViewMode('schematic')}
                />
              </div>
            ) : (
              <div className="nn-tour-content-scroll">
                {/* Hero Card */}
                <div className="nn-hero-card">
                  <div className="nn-hero-tag">
                    ✦ {showTour ? (stops[0]?.district ? `HANOI AFTER HOURS · ${stops[0].district.toUpperCase()}` : 'HANOI AFTER HOURS') : 'HANOI AFTER HOURS'}
                  </div>
                  <h3 className="nn-hero-title">
                    {showTour
                      ? (tour.title || 'Đi một vòng, ngon một tối.')
                      : <>Đi một vòng,<br className="nn-hero-break" />ngon một tối.</>}
                  </h3>
                  <div className="nn-hero-meta">
                    {showTour
                      ? `${stops[0]?.district || 'Hà Nội'}${stops[0]?.arrive ? ` • ${stops[0].arrive}` : ''}${stops[stops.length - 1]?.depart ? ` — ${stops[stops.length - 1].depart}` : ''}`
                      : (areaDisplay ? `${areaDisplay} • Đang lên ý tưởng` : 'Hà Nội • Chưa tạo lịch trình')}
                  </div>
                </div>

                {/* 3-Column Metrics Card */}
                <div className="nn-metrics-card">
                  <div className="nn-metric-col">
                    <div data-testid="metric-stops-val" className="nn-metric-val">{showTour ? `${stops.length < 10 ? '0' : ''}${stops.length}` : '—'}</div>
                    <div data-testid="metric-stops-lbl" className="nn-metric-lbl">điểm dừng</div>
                  </div>
                  <div className="nn-metric-divider" />
                  <div className="nn-metric-col">
                    <div data-testid="metric-distance-val" className="nn-metric-val">
                      {showTour ? (distanceKm !== null ? `${distanceKm} km` : '—') : '—'}
                    </div>
                    <div data-testid="metric-distance-lbl" className="nn-metric-lbl">
                      {showTour ? 'ước tính đi bộ' : 'khoảng cách (ước tính đi bộ)'}
                    </div>
                  </div>
                  <div className="nn-metric-divider" />
                  <div className="nn-metric-col">
                    <div data-testid="metric-budget-val" className="nn-metric-val">
                      {showTour ? (budgetDisplay || '—') : (budgetDisplay || '—')}
                    </div>
                    <div data-testid="metric-budget-scope" className="nn-metric-lbl">
                      {budgetScopeLabel}
                    </div>
                  </div>
                </div>

                {/* Stop Cards List or Empty State */}
                {!showTour ? (
                  <div data-testid="tour-empty-panel" className="nn-empty-steps-list">
                    {[
                      ['01', 'BƯỚC 1', 'Trò chuyện & nêu ý', 'Cho biết khu vực, thời gian, số người, món muốn ăn hoặc kiêng ăn.'],
                      ['02', 'BƯỚC 2', 'Xem lại & xác nhận', 'Kiểm tra thông tin đã hiểu, lưu ý về giờ/giá theo nguồn, dị ứng.'],
                      ['03', 'BƯỚC 3', 'Nhận lịch trình & Maps', 'Xem từng điểm dừng, đổi quán, khoá quán và mở chỉ đường Google Maps.']
                    ].map(([badge, stage, title, desc]) => (
                      <div className="nn-editorial-stop-card" key={badge}>
                        <div className="nn-stop-badge">{badge}</div>
                        <div className="nn-stop-body">
                          <div className="nn-stop-stage-row">
                            <span className="nn-stop-stage nn-empty-step-badge">{stage}</span>
                          </div>
                          <h4 className="nn-stop-name">{title}</h4>
                          <p className="nn-stop-desc">{desc}</p>
                        </div>
                      </div>
                    ))}

                    {/* Dark CTA Card in empty state */}
                    <div className="nn-dark-cta-card">
                      <div className="nn-cta-header">
                        <h4 className="nn-cta-title">Sẵn sàng cho một buổi tối ngon?</h4>
                        <p className="nn-cta-desc">Nhập yêu cầu ẩm thực ở khung chat để bắt đầu gợi ý lịch trình.</p>
                      </div>
                      <button
                        type="button"
                        className="nn-cta-btn"
                        onClick={() => {
                          inputRef.current?.focus();
                          chatSectionRef.current?.scrollIntoView({ block: 'start' });
                        }}
                      >
                        Bắt đầu gợi ý →
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            )}
          </section>
        </main>
      </div>

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
