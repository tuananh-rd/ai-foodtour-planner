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
          restoredRef.current = true;
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
    if (busy) return;
    if (restoredRef.current && (showTour || confirmSummaryBlock || clarifyBlock)) {
      // Session restored on page load: show it where the user left it, do not steal focus or scroll.
      restoredRef.current = false;
      lastFocusedKeyRef.current = showTour ? 'tour' : confirmSummaryBlock ? 'confirm'
        : `${clarifyBlock.slot || ''}_${clarifyBlock.pending_id || clarifyBlock.question || ''}`;
      return;
    }
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
          confirmYesBtn.focus({ preventScroll: true });
          confirmYesBtn.closest('[data-testid="confirm-summary-card"]')?.scrollIntoView({ block: 'start' });
          const headerHeight = document.querySelector('header')?.getBoundingClientRect().height || 0;
          window.scrollBy(0, -headerHeight - 12);
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

  const vehicleLabel = { walk: 'Đi bộ', motorbike: 'Xe máy', car: 'Ô tô', taxi: 'Taxi/Grab' }[chatState?.profile?.vehicle?.value] || null;
  const profileNow = chatState?.profile || {};
  const chipOn = {
    area: String(profileNow.area?.value?.label || '').toLowerCase().includes('hoàn kiếm'),
    tonight: profileNow.day_part?.value === 'evening',
    cheap: Number(profileNow.budget?.value) > 0 && Number(profileNow.budget?.value) <= 300000
  };
  const suggestionChips = [
    { label: 'Hoàn Kiếm', on: chipOn.area, text: 'Tôi muốn ăn tour 3 quán quanh Hoàn Kiếm tối nay' },
    { label: 'Tối nay', on: chipOn.tonight, text: 'Đi tour vào tối nay khoảng 120 phút' },
    { label: 'Món Việt', on: false, text: 'Thích các món Việt truyền thống như phở và chè' },
    { label: 'Dưới 300K', on: chipOn.cheap, text: 'Ngân sách dưới 300 nghìn cho cả chuyến' },
    { label: '📍 Vị trí GPS', on: false, isGeo: true }
  ];
  const chatVisible = isDesktop || activeMobileTab === 'chat';
  const tourVisible = isDesktop || activeMobileTab === 'tour';
  const resetButton = (
    <button type="button" data-testid="guided-reset-btn" className="nn-btn" onClick={handleRestart} disabled={busy}>
      <span aria-hidden="true">↻</span>
      <span>Làm lại</span>
    </button>
  );
  const nodeTop = (idx, n) => (n <= 1 ? 45.8 : 12.6 + idx * (66.4 / (n - 1)));

  return (
    <div data-testid="guided-container" aria-busy={busy} className="nn-root">
      {/* Screen Reader Live Announcement Region */}
      <div aria-live="polite" aria-atomic="true" data-testid="guided-aria-live" className="nn-sr">
        {liveAnnouncement}
      </div>

      {/* 80px header: brand · nav pills · anonymous local context (reference y0-80) */}
      <header className="nn-header">
        <div className="nn-brand">
          <div className="nn-brand-tile" aria-hidden="true"><StarGlyph color="#DFF46A" /></div>
          <div>
            <div className="nn-brand-name">NgonNgon Tour</div>
            <div className="nn-brand-sub">Ăn ngon • Đi đúng gu</div>
          </div>
        </div>

        <nav className="nn-nav" aria-label="Điều hướng chính">
          <button
            type="button"
            data-testid="mobile-tab-chat"
            className="nn-pill"
            aria-pressed={activeMobileTab === 'chat'}
            aria-controls="guided-chat-section"
            onClick={() => {
              setActiveMobileTab('chat');
              if (isDesktop) {
                chatSectionRef.current?.scrollIntoView({ block: 'start' });
                chatSectionRef.current?.focus({ preventScroll: true });
              }
            }}
          >
            Khám phá
          </button>
          <button
            type="button"
            data-testid="mobile-tab-tour"
            className="nn-pill"
            aria-pressed={activeMobileTab === 'tour'}
            aria-controls="guided-tour-section"
            onClick={() => {
              setActiveMobileTab('tour');
              if (isDesktop) {
                tourSectionRef.current?.scrollIntoView({ block: 'start' });
                tourSectionRef.current?.focus({ preventScroll: true });
              }
            }}
          >
            Lịch trình {stops.length > 0 ? `(${stops.length})` : ''}
          </button>
        </nav>

        <div className="nn-header-spacer" />
        {!isDesktop && resetButton}
        <div className="nn-profile">
          <div className="nn-avatar" aria-label="Phiên ẩn danh tại Hà Nội">K</div>
          <div className="nn-profile-text">
            <div className="nn-profile-name">Khách</div>
            <div className="nn-profile-sub">Hà Nội</div>
          </div>
        </div>
      </header>

      <main className="nn-main">
        {/* LEFT: chat panel (reference x32-512, y108-996) */}
        <section ref={chatSectionRef} id="guided-chat-section" tabIndex={-1} className={`nn-chat${chatVisible ? '' : ' nn-hidden'}${confirmSummaryBlock && !isStartScreen ? ' confirming' : (clarifyBlock && !isStartScreen ? ' deciding' : '')}`}>
          <div className="nn-chat-head">
            <div className="nn-assistant-tile" aria-hidden="true"><StarGlyph color="#166B52" /></div>
            <div className="nn-chat-title-wrap">
              <div className="nn-chat-title">Lên food tour cùng Măm Măm</div>
              <div className="nn-chat-sub">Trợ lý ẩm thực địa phương</div>
            </div>
            <span className="nn-status">Hà Nội</span>
          </div>

          <h2 className="nn-h2">Bạn muốn ăn gì hôm nay?</h2>
          <p className="nn-lead">Cho mình biết khu vực, thời gian và khẩu vị — mình sẽ xếp một hành trình vừa ngon vừa tiện đường.</p>

          <div data-testid="suggestion-chips-container" className="nn-chips">
            {suggestionChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                className="nn-chip"
                aria-pressed={chip.on}
                data-testid={`suggestion-chip-${idx}`}
                onClick={() => chip.isGeo ? triggerGeolocation() : handleSendMessage(chip.text)}
                disabled={busy}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="nn-rule" role="separator" />

          {(errorMessage || initError) && (
            <div data-testid="guided-error-banner" role="alert" className="nn-alert">
              <span>⚠️ {errorMessage || initError.message}</span>
              <button type="button" data-testid="guided-error-retry-btn" onClick={handleRetryFailed}>Thử lại</button>
            </div>
          )}

          <div data-testid={isStartScreen ? 'guided-start-screen' : 'guided-stream'} className="nn-stream">
            {isStartScreen && (
              <div data-testid="guided-welcome-msg" className="nn-bubble">
                Chào bạn! Bạn muốn ăn gì, ở đâu, đi mấy người? Cứ nói tự nhiên, mình sẽ hỏi thêm nếu thiếu thông tin để xếp lịch trình chuẩn nhất.
              </div>
            )}

            {messages.map((msg, idx) => (
              msg.role === 'user' ? (
                <div key={idx} data-testid="user-msg-bubble" className="nn-bubble user">{msg.text}</div>
              ) : null
            ))}

            {!isStartScreen && (
              <div className="nn-blocks">
                {filteredTextBlocks.map((b, idx) => (
                  <div key={idx} data-testid="assistant-text-bubble" className="nn-bubble">{b.text}</div>
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
                    onRetry={() => {
                      if (lastFailedTurn?.text) {
                        executeTurn({ text: lastFailedTurn.text, webSearch: true });
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

          <div className="nn-foot">
            <p className="nn-legal">
              {health?.llm === 'gemini'
                ? 'Khi cần và còn lượt, nội dung bạn nhập cùng tiêu chí cần thiết có thể được gửi đến Google Gemini để hiểu yêu cầu.'
                : 'Yêu cầu đang được đọc theo quy tắc tại máy, không gửi đến AI bên ngoài trong chế độ này.'}
              {' '}Khi tải lại trang, ứng dụng khôi phục tiêu chí và lịch trình của phiên, không hiện lại từng tin nhắn.
            </p>
            <TrustDisclosure turn={latestTurnMeta} health={health} />
            {!confirmSummaryBlock && (
              <>
                <div className="nn-web-optin-container" style={{ marginTop: 8 }}>
                  <label className="nn-web-optin-row">
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
                  style={{ marginTop: 6 }}
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
                  placeholder="Thêm yêu cầu cho chuyến đi…"
                  aria-label="Thêm yêu cầu cho chuyến đi"
                />
                <button type="submit" data-testid="guided-send-btn" className="nn-send" disabled={busy || !inputText.trim()} aria-label="Gửi yêu cầu">
                  <ArrowGlyph />
                </button>
              </form>
            </>
          )}
          </div>
        </section>

        {/* RIGHT: tour column (reference x560-1384) */}
        <section ref={tourSectionRef} id="guided-tour-section" data-focus-fallback tabIndex={-1} className={`nn-tour${tourVisible ? '' : ' nn-hidden'}`}>
          <div className="nn-tour-head">
            <div>
              <div className="nn-eyebrow">FOOD TOUR ĐỀ XUẤT</div>
              <h1 className="nn-title">
                {showTour ? (tour.title || (stops[0]?.district ? `Lịch trình ẩm thực ${stops[0].district}` : 'Lịch trình ẩm thực')) : 'Hành trình ẩm thực Hà Nội'}
              </h1>
              <div className="nn-subtitle">
                {showTour
                  ? `${stops[0]?.arrive ? `${stops[0].arrive}${stops[stops.length - 1]?.depart ? `–${stops[stops.length - 1].depart}` : ''}` : 'Chưa rõ giờ đến'}${stops[0]?.district ? ` • ${stops[0].district}` : ''}`
                  : 'Chưa có lịch trình được tạo • Vui lòng chọn hoặc nhập yêu cầu ở cột bên trái'}
              </div>
            </div>
            {isDesktop && resetButton}
          </div>

          <div className="nn-metrics">
            <div className="nn-tile mint">
              <div className="nn-tile-value">{showTour ? `${stops.length} điểm` : '0 điểm'}</div>
              <div className="nn-tile-label">Quán được chọn</div>
            </div>
            <div className="nn-tile peach">
              <div className="nn-tile-value">{showTour ? (distanceKm !== null ? `${distanceKm} km` : 'Chưa rõ') : '—'}</div>
              <div className="nn-tile-label">{tour?.totals?.leg_source === 'provider_route' ? 'Quãng đường theo nguồn' : 'Khoảng cách ước tính'}</div>
            </div>
            <div className="nn-tile">
              <div className="nn-tile-value">{showTour ? (budgetDisplay || 'Chưa đặt') : 'Theo ngân sách'}</div>
              <div className="nn-tile-label">
                {budgetVal !== null && budgetVal !== undefined ? `Mức muốn chi (${budgetScopeLabel})` : 'Ngân sách chưa đặt'}
              </div>
            </div>
          </div>

          <div className="nn-row">
            <div className="nn-left">
              {!showTour ? (
                <div data-testid="tour-empty-panel">
                  <h3 className="nn-section-h">Lộ trình sẽ hiện ở đây</h3>
                  {[
                    ['Bước 1', 'Trò chuyện & nêu ý', 'Cho biết khu vực, thời gian, số người, món muốn ăn hoặc kiêng ăn.'],
                    ['Bước 2', 'Xem lại & xác nhận', 'Kiểm tra điều mình hiểu, lưu ý về giờ/giá theo nguồn, dị ứng, rồi bấm xác nhận.'],
                    ['Bước 3', 'Nhận lịch trình & Maps', 'Xem từng điểm dừng, đổi quán, khoá quán và mở chỉ đường Google Maps miễn phí.']
                  ].map(([pill, title, desc]) => (
                    <div className="nn-step" key={pill}>
                      <div className="nn-step-pills"><span className="nn-time">{pill}</span></div>
                      <div className="nn-card"><h3>{title}</h3><p>{desc}</p></div>
                    </div>
                  ))}
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

            <aside className="nn-route" aria-label={viewMode === 'map' ? 'Bản đồ tương tác Hoàn Kiếm' : 'Sơ đồ tuyến'}>
              <div className="nn-route-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 className="nn-route-title">{viewMode === 'map' ? 'Bản đồ' : 'Sơ đồ tuyến'}</h3>
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
                      data-testid="view-mode-map-btn"
                      className={`nn-view-mode-btn${viewMode === 'map' ? ' active' : ''}`}
                      aria-pressed={viewMode === 'map'}
                      onClick={() => setViewMode('map')}
                    >
                      Bản đồ
                    </button>
                  </div>
                </div>
                {vehicleLabel && <span className="nn-meta" style={{ height: 35 }}>{vehicleLabel}</span>}
              </div>
              {viewMode === 'map' ? (
                <PilotMap
                  stops={stops}
                  onFallbackToSchematic={() => setViewMode('schematic')}
                />
              ) : (
                <div className="nn-canvas">
                  {[40, 118, 196, 274, 352].map((top, i) => (
                    <div key={top} className={`nn-road${i % 2 ? ' short' : ''}`} style={{ top }} />
                  ))}
                  {showTour && stops.length > 0 ? (
                    <>
                      <div className="nn-line" style={{ left: '45.2%', top: `calc(${nodeTop(0, stops.length)}% + 20px)`, height: stops.length > 1 ? `${nodeTop(stops.length - 1, stops.length) - nodeTop(0, stops.length)}%` : 0 }} />
                      {stops.map((stop, idx) => {
                        const top = nodeTop(idx, stops.length);
                        const left = idx % 2 === 0;
                        return (
                          <React.Fragment key={stop.venue_id || idx}>
                            <div className={`nn-node${idx === stops.length - 1 && stops.length > 1 ? ' last' : ''}`} style={{ left: '45.2%', top: `${top}%` }}>{idx + 1}</div>
                            <div
                              className="nn-tag"
                              title={stop.name}
                              style={{ top: `calc(${top}% + 6px)`, ...(left ? { right: 'calc(54.8% + 26px)' } : { left: 'calc(45.2% + 26px)' }) }}
                            >
                              {stop.name}
                            </div>
                          </React.Fragment>
                        );
                      })}
                      <ol className="nn-sr">
                        {stops.map((stop, idx) => (
                          <li key={stop.venue_id || idx}>{idx + 1}. {stop.name}{stop.arrive ? `, ${stop.arrive}` : ''}</li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <div className="nn-canvas-note">Sơ đồ thứ tự điểm dừng sẽ hiện sau khi bạn xác nhận lịch trình.</div>
                  )}
                  <p className="nn-caption">Sơ đồ thứ tự điểm dừng, không phải bản đồ thật.</p>
                </div>
              )}
              <div className="nn-tip">
                <b>Lưu ý</b>
                <span>Giá, giờ mở cửa lấy theo nguồn, chưa kiểm chứng; hãy kiểm tra lại.</span>
              </div>
            </aside>
          </div>
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
