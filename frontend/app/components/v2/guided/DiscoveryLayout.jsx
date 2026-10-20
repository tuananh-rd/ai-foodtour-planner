'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import GuidedTimeline from './GuidedTimeline';
import PilotMap from './PilotMap';
import {
  getDiscoveryAssistant,
  getAssistantCapabilities,
  sendDiscoveryMessage,
  sendDiscoveryAction,
  addSelectionAction,
  removeSelectionAction,
  lockSelectionAction,
  unlockSelectionAction,
  compareRestaurantsAction,
  updatePreferencesAction,
  createItineraryAction,
  reviseItineraryAction,
  confirmAction,
  updateSettingsAction,
  resolveLocationAction,
  chooseLocationCandidateAction,
  setCoordinatesLocationAction,
  clearLocationAction,
  formatDistanceDisplay,
  safeExternalUrl,
  UNKNOWN_LABELS_VI,
  formatUnknownLabel,
  DiscoveryApiError
} from '../../../../lib/discoveryApi';
import { normalizeDisplayText, sanitizeViewForDisplay, sanitizeRestaurantForDisplay } from '../../../../lib/emojiSanitizer';
import './guided-visual.css';
import './discovery-visual.css';

/* Reference glyphs (Warm Editorial) */
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

function CheckGlyph({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M13.5 4.5L6.5 11.5L3 8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseGlyph({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M12 4L4 12M4 4L12 12" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockGlyph({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UnlockGlyph({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function AlertGlyph({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function GearGlyph({ size = 13, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// Strict nullable profile contract according to docs/DISCOVERY_ASSISTANT_CONTRACT.md
const INITIAL_NULLABLE_PROFILE = {
  area: null,
  origin: null,
  party_size: null,
  budget_vnd: null,
  budget_scope: null,
  start_time: null,
  end_time: null,
  duration_min: null,
  vehicle: null,
  tastes: [],
  exclusions: [],
  allergies: [],
  max_leg_min: null
};

const DEFAULT_ASSISTANT_VIEW = {
  contract: 'discovery-v1',
  session_id: null,
  revision: 0,
  profile_version: 0,
  selection_version: 0,
  status: 'ok',
  reply: {
    text: 'Chào bạn! Em có thể giúp bạn khám phá các món ngon Hà Nội, tìm quán phù hợp hoặc gợi ý tour ẩm thực theo ý bạn.',
    question: null
  },
  profile: INITIAL_NULLABLE_PROFILE,
  results: [],
  selection: [],
  comparison: null,
  confirmation: null,
  messages: [],
  tour: null,
  settings: { chat_model: null, web_search_enabled: false },
  location: { status: 'unset', label: null, source: null, approximate: false, candidates: [] },
  web: { enabled: false, status: 'off', reason: null, sources: [] },
  source: null,
  provider: null,
  diagnostics: { tool_calls: 0, elapsed_ms: 0, weather: 'unavailable' }
};

/**
 * Truthfully derives tour duration:
 * 1. From valid confirmed timeline start/last depart explicitly (if available), or
 * 2. Displays user requested profile duration labeled "yêu cầu", or
 * 3. Preserves unknown ("—").
 */
function deriveTourDuration(tour, profile) {
  const stops = tour?.stops || [];
  if (stops.length >= 2 && stops[0]?.arrive && stops[stops.length - 1]?.depart) {
    const p1 = stops[0].arrive.split(':').map(Number);
    const p2 = stops[stops.length - 1].depart.split(':').map(Number);
    if (!isNaN(p1[0]) && !isNaN(p1[1]) && !isNaN(p2[0]) && !isNaN(p2[1])) {
      let diff = (p2[0] * 60 + p2[1]) - (p1[0] * 60 + p1[1]);
      if (diff < 0) diff += 24 * 60;
      if (diff > 0) {
        return { val: `${Math.round(diff / 60 * 10) / 10}h`, lbl: 'lịch trình' };
      }
    }
  }
  if (profile?.duration_min) {
    return { val: `${profile.duration_min}p`, lbl: 'yêu cầu' };
  }
  return { val: '—', lbl: 'thời lượng' };
}

/**
 * Truthfully derives tour price info:
 * TourView.totals schema contains ONLY venue_range_upper_sum_vnd, walk_minutes, leg_source, route_provider.
 * Never fabricates nonexistent totals fields or relabels venue range sum as per-person meal cost.
 * Displays venue_range_upper_sum_vnd labeled "khoảng giá quán", or user budget labeled "ngân sách", or preserves unknown.
 */
function deriveTourPriceInfo(tour, profile) {
  if (tour?.totals?.venue_range_upper_sum_vnd !== undefined && tour?.totals?.venue_range_upper_sum_vnd !== null) {
    return {
      val: `${Math.round(tour.totals.venue_range_upper_sum_vnd / 1000)}K`,
      lbl: 'khoảng giá quán'
    };
  }
  if (profile?.budget_vnd !== undefined && profile?.budget_vnd !== null) {
    return {
      val: `${Math.round(profile.budget_vnd / 1000)}K`,
      lbl: `ngân sách ${profile?.budget_scope === 'per_person' ? 'mỗi người' : 'cả nhóm'}`
    };
  }
  return { val: '—', lbl: 'khoảng giá' };
}

export default function DiscoveryLayout({
  sessionId,
  sessionToken,
  revision: parentRevision,
  health,
  clientConfig,
  initError,
  initializing: parentInitializing,
  onRetryInit,
  onResetSession
}) {
  const [view, setView] = useState(() => ({
    ...DEFAULT_ASSISTANT_VIEW,
    session_id: sessionId,
    revision: parentRevision || 0
  }));

  // Display-only projection with Unicode emojis stripped from human-facing text
  // Preserves raw identity, tokens, coordinates, locks, and revisions identically
  const displayView = useMemo(() => sanitizeViewForDisplay(view), [view]);

  const [sessionError, setSessionError] = useState(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [editingSelectionAfterTour, setEditingSelectionAfterTour] = useState(false);
  const [replaceTargetStop, setReplaceTargetStop] = useState(null);

  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('');
  const [inputText, setInputText] = useState('');
  const [activeMobileTab, setActiveMobileTab] = useState('chat'); // 'chat' | 'tour' | 'map'
  const [viewMode, setViewMode] = useState('schematic'); // 'schematic' | 'map'
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [profileForm, setProfileForm] = useState(INITIAL_NULLABLE_PROFILE);
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [detailVenue, setDetailVenue] = useState(null);
  const displayDetailVenue = useMemo(() => detailVenue ? sanitizeRestaurantForDisplay(detailVenue) : null, [detailVenue]);
  const [errorBanner, setErrorBanner] = useState(null);
  const [geoNotice, setGeoNotice] = useState(null);
  const [gpsPending, setGpsPending] = useState(false);

  // Discovery-v1 assistant capabilities & settings state
  const [capabilities, setCapabilities] = useState(null);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);
  const [originQuery, setOriginQuery] = useState('');
  const [manualCoords, setManualCoords] = useState({ lat: '', lon: '' });
  const [showManualCoords, setShowManualCoords] = useState(false);

  // Load assistant capabilities (chat models, web search status) on mount
  useEffect(() => {
    let active = true;
    async function loadCaps() {
      setCapabilitiesLoading(true);
      try {
        const caps = await getAssistantCapabilities();
        if (active && caps) {
          setCapabilities(caps);
        }
      } catch (_) {
        // Non-blocking fallback; assistant remains functional
      } finally {
        if (active) setCapabilitiesLoading(false);
      }
    }
    loadCaps();
    return () => {
      active = false;
    };
  }, []);

  // Authenticated sessionId/token + parentInitializing false + successful initial GET required
  const sessionReady = Boolean(
    sessionId &&
    sessionToken &&
    !parentInitializing &&
    initialLoaded &&
    !sessionError
  );

  const requestTokenRef = useRef(0);
  const abortControllerRef = useRef(null);
  const chatScrollRef = useRef(null);
  const inputRef = useRef(null);
  const modalRef = useRef(null);
  const triggerElRef = useRef(null);
  const chatSectionRef = useRef(null);
  const tourSectionRef = useRef(null);

  // Sync profile form when backend view profile updates
  useEffect(() => {
    if (view.profile) {
      setProfileForm({
        ...INITIAL_NULLABLE_PROFILE,
        ...view.profile
      });
    }
  }, [view.profile]);

  // Initial load or session change with stale request guarding
  const fetchAssistantView = useCallback(async (sid, token, keepBanner = false) => {
    if (!sid || !token || parentInitializing) {
      setInitialLoaded(false);
      return;
    }

    // Invalidate prior request
    requestTokenRef.current += 1;
    const currentToken = requestTokenRef.current;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const ac = new AbortController();
    abortControllerRef.current = ac;

    setBusy(true);
    setBusyMessage('Đang tải dữ liệu trợ lý…');
    if (!keepBanner) {
      setErrorBanner(null);
    }
    setSessionError(null);

    try {
      const data = await getDiscoveryAssistant(sid, token, { signal: ac.signal });
      if (currentToken !== requestTokenRef.current) return;
      if (data && typeof data === 'object') {
        setView(data);
        setSessionError(null);
        setInitialLoaded(true);
      }
    } catch (err) {
      if (currentToken !== requestTokenRef.current || err.name === 'AbortError') return;
      setInitialLoaded(false);
      if (err instanceof DiscoveryApiError) {
        if (err.status === 401) {
          setSessionError('unauthorized');
          setErrorBanner('Phiên chưa được xác thực (401). Vui lòng nhấn "Chuyến đi mới" để tạo phiên mới.');
        } else if (err.status === 404) {
          setSessionError('session_not_found');
          setErrorBanner('Phiên làm việc không tồn tại hoặc đã hết hạn (404). Vui lòng nhấn "Chuyến đi mới" để tạo phiên mới.');
        } else if (err.status >= 500) {
          setSessionError('server_error');
          setErrorBanner(`Lỗi máy chủ (${err.status}) khi tải dữ liệu phiên. Vui lòng thử lại sau giây lát.`);
        } else {
          setSessionError('fetch_error');
          setErrorBanner(err.message || 'Không thể tải dữ liệu phiên. Vui lòng thử lại.');
        }
      } else {
        setSessionError('network_error');
        setErrorBanner(err.message || 'Không thể kết nối đến máy chủ.');
      }
    } finally {
      if (currentToken === requestTokenRef.current) {
        setBusy(false);
        setBusyMessage('');
      }
    }
  }, [parentInitializing]);

  useEffect(() => {
    // Invalidate stale pending tokens immediately
    requestTokenRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Reset old view/draft/modal on session change
    setView({
      ...DEFAULT_ASSISTANT_VIEW,
      session_id: sessionId,
      revision: parentRevision || 0
    });
    setInputText('');
    setSelectedForCompare([]);
    setDetailVenue(null);
    setProfileDrawerOpen(false);
    setEditingSelectionAfterTour(false);
    setReplaceTargetStop(null);
    setInitialLoaded(false);
    setSessionError(null);
    setErrorBanner(null);

    if (sessionId && sessionToken && !parentInitializing) {
      fetchAssistantView(sessionId, sessionToken);
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [sessionId, sessionToken, parentInitializing, fetchAssistantView]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [view.messages, view.results, view.comparison, view.confirmation, busy]);

  // Accessible Modal Keyboard Trap & Escape Listener
  useEffect(() => {
    if (!detailVenue) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDetailVenue(null);
        triggerElRef.current?.focus();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Initial focus on first element in modal
    setTimeout(() => {
      const firstBtn = modalRef.current?.querySelector('button');
      firstBtn?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [detailVenue]);

  // Handle 409 conflict: refresh view WITHOUT auto-replaying mutation, preserve draft
  const handle409Conflict = async (err) => {
    setErrorBanner('Phiên đã được cập nhật từ phía máy chủ (409 Conflict). Đã đồng bộ lại trạng thái mới nhất.');
    await fetchAssistantView(sessionId, sessionToken, true);
  };

  // Send natural text message
  const handleSendMessage = async (customText = null) => {
    const textToSend = customText !== null ? customText : inputText;
    if (!sessionReady || !textToSend || !textToSend.trim() || busy) return;

    requestTokenRef.current += 1;
    const currentToken = requestTokenRef.current;

    setBusy(true);
    setBusyMessage('Đang xử lý yêu cầu…');
    setErrorBanner(null);

    // Temporarily clear input only if successfully sending
    if (customText === null) {
      setInputText('');
    }

    try {
      const updatedView = await sendDiscoveryMessage(
        sessionId,
        view.revision,
        textToSend,
        sessionToken
      );
      if (currentToken !== requestTokenRef.current) return;
      if (updatedView && typeof updatedView === 'object') {
        setView(updatedView);
      }
    } catch (err) {
      if (currentToken !== requestTokenRef.current) return;
      if (err.status === 409) {
        await handle409Conflict(err);
        // Preserve failed draft in input
        if (customText === null) {
          setInputText(textToSend);
        }
      } else {
        setErrorBanner(err.message || 'Lỗi khi gửi tin nhắn.');
        // Preserve draft on failure
        if (customText === null) {
          setInputText(textToSend);
        }
      }
    } finally {
      if (currentToken === requestTokenRef.current) {
        setBusy(false);
        setBusyMessage('');
        inputRef.current?.focus();
      }
    }
  };

  // Dispatch a discovery action
  const handleDispatchAction = async (action, loadingMsg = 'Đang thực hiện…', onSuccess = null) => {
    if (!sessionReady || busy) return;

    requestTokenRef.current += 1;
    const currentToken = requestTokenRef.current;

    setBusy(true);
    setBusyMessage(loadingMsg);
    setErrorBanner(null);

    try {
      const updatedView = await sendDiscoveryAction(
        sessionId,
        view.revision,
        action,
        sessionToken
      );
      if (currentToken !== requestTokenRef.current) return;
      if (updatedView && typeof updatedView === 'object') {
        setView(updatedView);
      }
      if (updatedView?.tour) {
        setEditingSelectionAfterTour(false);
        setReplaceTargetStop(null);
      }
      if (onSuccess) {
        onSuccess(updatedView);
      }
    } catch (err) {
      if (currentToken !== requestTokenRef.current) return;
      if (err.status === 409) {
        await handle409Conflict(err);
      } else {
        setErrorBanner(err.message || 'Lỗi khi thực hiện thao tác.');
      }
    } finally {
      if (currentToken === requestTokenRef.current) {
        setBusy(false);
        setBusyMessage('');
      }
    }
  };

  // Venue Selection Handlers
  const handleAddVenue = (venue) => {
    if (!sessionReady || busy || !venue?.id) return;
    const action = addSelectionAction(view.selection_version, [venue.id]);
    handleDispatchAction(action, `Đang thêm quán ${venue.name}…`);
  };

  const handleRemoveVenue = (venueId) => {
    if (!sessionReady || busy || !venueId) return;
    const action = removeSelectionAction(view.selection_version, [venueId]);
    handleDispatchAction(action, 'Đang xoá quán khỏi danh sách…');
  };

  const handleToggleLockVenue = (venue) => {
    if (!sessionReady || busy || !venue?.id) return;
    const isLocked = Boolean(venue.locked);
    const action = isLocked
      ? unlockSelectionAction(view.selection_version, [venue.id])
      : lockSelectionAction(view.selection_version, [venue.id]);
    handleDispatchAction(action, isLocked ? 'Đang mở khoá quán…' : 'Đang khoá quán…');
  };

  // Venue Comparison Handlers
  const handleToggleCompareSelect = (venueId) => {
    if (!sessionReady || busy) return;
    setSelectedForCompare((prev) => {
      if (prev.includes(venueId)) {
        return prev.filter((id) => id !== venueId);
      }
      if (prev.length >= 5) return prev; // max 5
      return [...prev, venueId];
    });
  };

  const handleExecuteComparison = (venueIds = null) => {
    if (!sessionReady || busy) return;
    const ids = venueIds || selectedForCompare;
    if (!ids || ids.length < 2) return;
    const action = compareRestaurantsAction(ids);
    handleDispatchAction(action, 'Đang so sánh các quán đã chọn…');
  };

  // Open Detail Modal with keyboard trigger tracking
  const handleOpenDetailModal = (venue, e) => {
    triggerElRef.current = e?.currentTarget || null;
    setDetailVenue(venue ? sanitizeRestaurantForDisplay(venue) : null);
  };

  // Profile Drawer Form Save: patch ONLY modified fields, never convert null to 0
  const handleSaveProfile = (e) => {
    e.preventDefault();
    if (!sessionReady || busy) return;
    const patch = {};

    if (profileForm.area !== undefined && profileForm.area !== view.profile?.area) {
      patch.area = profileForm.area ? profileForm.area.trim() : null;
    }

    if (profileForm.party_size !== undefined && profileForm.party_size !== view.profile?.party_size) {
      patch.party_size = profileForm.party_size === '' || profileForm.party_size === null
        ? null
        : Number(profileForm.party_size);
    }

    if (profileForm.budget_vnd !== undefined && profileForm.budget_vnd !== view.profile?.budget_vnd) {
      patch.budget_vnd = profileForm.budget_vnd === '' || profileForm.budget_vnd === null
        ? null
        : Number(profileForm.budget_vnd);
    }

    if (profileForm.budget_scope !== undefined && profileForm.budget_scope !== view.profile?.budget_scope) {
      patch.budget_scope = profileForm.budget_scope || null;
    }

    if (profileForm.start_time !== undefined && profileForm.start_time !== view.profile?.start_time) {
      patch.start_time = profileForm.start_time || null;
    }

    if (profileForm.duration_min !== undefined && profileForm.duration_min !== view.profile?.duration_min) {
      patch.duration_min = profileForm.duration_min === '' || profileForm.duration_min === null
        ? null
        : Number(profileForm.duration_min);
    }

    if (profileForm.vehicle !== undefined && profileForm.vehicle !== view.profile?.vehicle) {
      patch.vehicle = profileForm.vehicle || null;
    }

    if (profileForm.max_leg_min !== undefined && profileForm.max_leg_min !== view.profile?.max_leg_min) {
      patch.max_leg_min = profileForm.max_leg_min === '' || profileForm.max_leg_min === null
        ? null
        : Number(profileForm.max_leg_min);
    }

    // Tastes, exclusions, allergies
    if (typeof profileForm.tastes === 'string') {
      const arr = profileForm.tastes.split(',').map((s) => s.trim()).filter(Boolean);
      patch.tastes = arr;
    } else if (Array.isArray(profileForm.tastes) && profileForm.tastes !== view.profile?.tastes) {
      patch.tastes = profileForm.tastes;
    }

    if (typeof profileForm.allergies === 'string') {
      const arr = profileForm.allergies.split(',').map((s) => s.trim()).filter(Boolean);
      patch.allergies = arr;
    } else if (Array.isArray(profileForm.allergies) && profileForm.allergies !== view.profile?.allergies) {
      patch.allergies = profileForm.allergies;
    }

    if (Object.keys(patch).length > 0) {
      const action = updatePreferencesAction(patch);
      handleDispatchAction(action, 'Đang lưu tuỳ chỉnh chuyến đi…');
    }
    setProfileDrawerOpen(false);
  };

  // Settings Handlers (chat_model & web_search_enabled)
  const handleModelChange = (e) => {
    const selectedModel = e.target.value;
    if (!sessionReady || busy || !selectedModel) return;
    try {
      const action = updateSettingsAction({ chat_model: selectedModel });
      handleDispatchAction(action, 'Đang cập nhật mô hình AI…');
    } catch (err) {
      setErrorBanner(err.message);
    }
  };

  const handleToggleWebSearch = (e) => {
    const isEnabled = e.target.checked;
    if (!sessionReady || busy) return;
    try {
      const action = updateSettingsAction({ web_search_enabled: isEnabled });
      handleDispatchAction(action, 'Đang cập nhật tùy chọn tìm web…');
    } catch (err) {
      setErrorBanner(err.message);
    }
  };

  // Location Handlers (GPS, resolve query, choose candidate, clear, coordinates)
  const handleTriggerGPS = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGeoNotice('Trình duyệt không hỗ trợ định vị GPS.');
      return;
    }
    if (!sessionReady || busy || gpsPending) return;

    setGpsPending(true);
    setGeoNotice('Đang xin quyền định vị GPS…');

    const capturedSessionId = sessionId;
    const capturedToken = sessionToken;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsPending(false);
        // Verify session hasn't changed while awaiting GPS
        if (capturedSessionId !== sessionId || capturedToken !== sessionToken) return;

        const lat = Number(pos.coords.latitude.toFixed(6));
        const lon = Number(pos.coords.longitude.toFixed(6));
        setGeoNotice(`Đã nhận tọa độ: ${lat}, ${lon}`);

        try {
          const action = setCoordinatesLocationAction(lat, lon, 'gps');
          handleDispatchAction(action, 'Đang cập nhật điểm xuất phát GPS…');
        } catch (err) {
          setErrorBanner(err.message);
        }
      },
      (err) => {
        setGpsPending(false);
        if (err.code === 1) { // PERMISSION_DENIED
          setGeoNotice('Bạn đã từ chối quyền truy cập vị trí GPS.');
        } else if (err.code === 2) { // POSITION_UNAVAILABLE
          setGeoNotice('Không thể xác định vị trí từ thiết bị.');
        } else if (err.code === 3) { // TIMEOUT
          setGeoNotice('Quá thời gian xác định vị trí GPS.');
        } else {
          setGeoNotice(`Lỗi GPS: ${err.message || 'Không thể lấy vị trí'}`);
        }
      },
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  }, [sessionId, sessionToken, sessionReady, busy, gpsPending]);

  const handleResolveOrigin = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const q = originQuery.trim();
    if (!q || !sessionReady || busy) return;
    try {
      const action = resolveLocationAction(q);
      handleDispatchAction(action, 'Đang tìm địa điểm trong danh mục…');
    } catch (err) {
      setErrorBanner(err.message);
    }
  };

  const handleChooseCandidate = (candidateId) => {
    if (!candidateId || !sessionReady || busy) return;
    try {
      const action = chooseLocationCandidateAction(candidateId);
      handleDispatchAction(action, 'Đang chọn điểm xuất phát…');
    } catch (err) {
      setErrorBanner(err.message);
    }
  };

  const handleClearOrigin = () => {
    if (!sessionReady || busy) return;
    try {
      const action = clearLocationAction();
      handleDispatchAction(action, 'Đang xóa điểm xuất phát…', () => {
        setGeoNotice(null);
      });
    } catch (err) {
      setErrorBanner(err.message);
    }
  };

  const handleManualCoordsSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!sessionReady || busy) return;

    const rawLat = String(manualCoords.lat ?? '').trim();
    const rawLon = String(manualCoords.lon ?? '').trim();

    if (!rawLat || !rawLon) {
      setErrorBanner('Tọa độ không được để trống.');
      return;
    }
    const lat = Number(rawLat);
    const lon = Number(rawLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || isNaN(rawLat) || isNaN(rawLon)) {
      setErrorBanner('Tọa độ phải là chữ số hợp lệ.');
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setErrorBanner('Vĩ độ phải từ -90 đến 90, kinh độ từ -180 đến 180.');
      return;
    }

    try {
      const action = setCoordinatesLocationAction(lat, lon, 'coordinates');
      handleDispatchAction(action, 'Đang thiết lập tọa độ…', () => {
        setShowManualCoords(false);
      });
    } catch (err) {
      setErrorBanner(err.message);
    }
  };

  // Trigger Plan / Confirmation
  const handleTriggerPlan = () => {
    if (!sessionReady || busy) return;
    const action = createItineraryAction();
    handleDispatchAction(action, 'Đang chuẩn bị xác nhận lịch trình…');
  };

  // Explicit Confirm Button (Strict gate)
  const handleExplicitConfirm = (confirmationId) => {
    if (!sessionReady || busy || !confirmationId) return;
    const action = confirmAction(confirmationId);
    handleDispatchAction(action, 'Đang tạo lịch trình chính thức…', () => {
      setEditingSelectionAfterTour(false);
      setReplaceTargetStop(null);
    });
  };

  // Post-tour replacement / selection adjustment handlers
  const handleStartStopReplacement = (stop) => {
    setReplaceTargetStop(stop);
    setEditingSelectionAfterTour(true);
    setActiveMobileTab('tour');
  };

  const handleOpenSelectionEditor = () => {
    setReplaceTargetStop(null);
    setEditingSelectionAfterTour(true);
    setActiveMobileTab('tour');
  };

  // Revise Itinerary opens selection editor
  const handleReviseItinerary = () => {
    handleOpenSelectionEditor();
  };

  // Map markers & stops derivation
  const mapStops = useMemo(() => {
    if (view.tour && Array.isArray(view.tour.stops) && view.tour.stops.length > 0) {
      return view.tour.stops;
    }
    if (Array.isArray(view.selection) && view.selection.length > 0) {
      return view.selection.map((s, idx) => ({
        venue_id: s.id,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lon: s.lon,
        order: idx + 1
      }));
    }
    if (Array.isArray(view.results) && view.results.length > 0) {
      return view.results.map((r, idx) => ({
        venue_id: r.id,
        name: r.name,
        address: r.address,
        lat: r.lat,
        lon: r.lon,
        order: idx + 1
      }));
    }
    return [];
  }, [view.tour, view.selection, view.results]);

  const selectedVenueIds = useMemo(() => {
    return new Set((view.selection || []).map((s) => s.id));
  }, [view.selection]);

  const stops = displayView.tour?.stops || [];
  const areaDisplay = displayView.profile?.area || (stops[0]?.district ? stops[0].district : null);

  return (
    <div data-testid="guided-container" aria-busy={busy} className="nn-root">
      {/* Screen Reader Live Region */}
      <div aria-live="polite" aria-atomic="true" className="nn-sr">
        {busy ? busyMessage : ''}
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
            onClick={onResetSession}
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
                chatSectionRef.current?.scrollIntoView({ block: 'start' });
              }}
            >
              <span className="nn-nav-icon"><StarGlyph size={12} color="currentColor" /></span> Trò chuyện
            </button>
            <button
              type="button"
              data-testid="mobile-tab-tour"
              className={`nn-sidebar-nav-item${activeMobileTab === 'tour' ? ' active' : ''}`}
              aria-pressed={activeMobileTab === 'tour'}
              onClick={() => {
                setActiveMobileTab('tour');
                tourSectionRef.current?.scrollIntoView({ block: 'start' });
              }}
            >
              <span className="nn-nav-icon">◇</span> Chuyến đi ({view.selection?.length || 0})
            </button>
            <button
              type="button"
              data-testid="btn-toggle-profile-drawer"
              className="nn-sidebar-nav-item"
              onClick={() => setProfileDrawerOpen((prev) => !prev)}
            >
              <span className="nn-nav-icon"><GearGlyph size={13} color="currentColor" /></span> Tuỳ chỉnh hồ sơ
            </button>
          </nav>

          <div className="nn-sidebar-recent">
            <div className="nn-recent-header">GỢI Ý KHÁM PHÁ</div>
            <div className="nn-recent-list">
              <button
                type="button"
                className="nn-recent-item"
                onClick={() => handleSendMessage('Tìm quán phở ngon Hoàn Kiếm dưới 70k')}
                disabled={!sessionReady || busy}
              >
                Phở ngon Hoàn Kiếm dưới 70k
              </button>
              <button
                type="button"
                className="nn-recent-item"
                onClick={() => handleSendMessage('Gợi ý chè hoặc tráng miệng ít ngọt')}
                disabled={!sessionReady || busy}
              >
                Chè & tráng miệng ít ngọt
              </button>
              <button
                type="button"
                className="nn-recent-item"
                onClick={() => handleSendMessage('Quán ăn vặt chuẩn vị phố cổ')}
                disabled={!sessionReady || busy}
              >
                Quán ăn vặt chuẩn vị phố cổ
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
              <div className="nn-profile-name">Phiên hiện tại</div>
              <div className="nn-profile-sub">
                {sessionId ? `#${sessionId.slice(0, 8)}…` : 'Chưa kết nối'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CANVAS WRAPPER (Warm Golden Yellow Canvas) */}
      <div className="nn-canvas-wrapper" data-testid="discovery-layout">
        {/* Topbar: Breadcrumb + utility chips */}
        <header className="nn-topbar">
          <div className="nn-breadcrumb">
            KHÁM PHÁ / TRỢ LÝ FOOD TOUR
          </div>
          <div className="nn-topbar-utilities">
            <div className="nn-util-chip" title="Khu vực khảo sát">
              <span className="nn-target-icon">⌖</span> {areaDisplay || 'Chưa chọn khu vực'}
            </div>
            <div className="nn-util-chip" title="Ngôn ngữ giao diện">
              Tiếng Việt ⌄
            </div>
          </div>
        </header>

        {/* Assistant Capabilities & Settings Bar (Model Selector & Web Search Toggle) */}
        <div className="nn-settings-bar" data-testid="discovery-settings-bar">
          <div className="nn-settings-group">
            <label htmlFor="chat-model-select" className="nn-settings-label">
              Mô hình AI:
            </label>
            <select
              id="chat-model-select"
              data-testid="chat-model-select"
              className="nn-settings-select"
              value={displayView.settings?.chat_model || capabilities?.default_chat_model || ''}
              onChange={handleModelChange}
              disabled={!sessionReady || busy}
            >
              {Array.isArray(capabilities?.chat_models) && capabilities.chat_models.length > 0 ? (
                capabilities.chat_models.map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.available}>
                    {m.label || m.id}{!m.available ? ` (${m.reason || 'không khả dụng'})` : ''}
                  </option>
                ))
              ) : (
                <option value="">{capabilitiesLoading ? 'Đang tải mô hình…' : 'Mặc định hệ thống'}</option>
              )}
            </select>
          </div>

          <div className="nn-settings-group">
            <label
              className="nn-web-toggle-label"
              title={
                capabilities?.web_search?.available === false
                  ? `Tìm kiếm web chưa khả dụng (${capabilities.web_search.reason || 'chưa kích hoạt'})`
                  : 'Tìm kiếm bổ sung trên web (Tavily)'
              }
            >
              <input
                type="checkbox"
                data-testid="web-search-toggle"
                checked={Boolean(displayView.settings?.web_search_enabled)}
                onChange={handleToggleWebSearch}
                disabled={!sessionReady || busy || (!capabilities?.web_search?.available && !displayView.settings?.web_search_enabled)}
              />
              <span>Tìm kiếm web</span>
            </label>
            {capabilities?.web_search && !capabilities.web_search.available && (
              <span className="nn-web-status-badge">Chưa hỗ trợ</span>
            )}
          </div>
        </div>

        {/* Mobile Tab Navigation for responsive 390px view */}
        <nav className="nn-mobile-tabs" role="tablist" aria-label="Điều hướng trên điện thoại">
          <button
            type="button"
            role="tab"
            aria-selected={activeMobileTab === 'chat'}
            className={`nn-mobile-tab${activeMobileTab === 'chat' ? ' active' : ''}`}
            onClick={() => setActiveMobileTab('chat')}
          >
            Trò chuyện
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeMobileTab === 'tour'}
            className={`nn-mobile-tab${activeMobileTab === 'tour' ? ' active' : ''}`}
            onClick={() => setActiveMobileTab('tour')}
          >
            Chuyến đi ({view.selection?.length || 0})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeMobileTab === 'map'}
            className={`nn-mobile-tab${activeMobileTab === 'map' ? ' active' : ''}`}
            onClick={() => setActiveMobileTab('map')}
          >
            Bản đồ
          </button>
        </nav>

        {/* Main Content Grid: Left Chat Card (668px) + Right Tour Column (476px) */}
        <main className="nn-main-grid">
          {/* LEFT CHAT CARD */}
          <section
            ref={chatSectionRef}
            data-testid="discovery-chat-section"
            className={`nn-chat-card${activeMobileTab !== 'chat' ? ' nn-hidden-mobile' : ''}`}
          >
            <div className="nn-chat-card-header">
              <div className="nn-assistant-badge">
                <StarGlyph size={12} color="#CF542F" /> MĂM MĂM AI
              </div>
              <span className="nn-assistant-tagline">Người bạn sành ăn của bạn</span>
            </div>

            <h2 className="nn-hero-heading">
              Hôm nay, mình<br className="nn-heading-break" />ăn cả Hà Nội nhé?
            </h2>
            <p className="nn-hero-sub">
              Một chút ngẫu hứng, một hành trình đúng gu. Kể mình nghe bạn đang thèm gì nào.
            </p>

            {/* Suggestion Chips */}
            <div data-testid="suggestion-chips-container" className="nn-chips-row">
              <button
                type="button"
                className="nn-filter-chip"
                onClick={() => handleSendMessage('Gợi ý ẩm thực đường phố phố cổ')}
                disabled={!sessionReady || busy}
              >
                Ẩm thực đường phố
              </button>
              <button
                type="button"
                className="nn-filter-chip"
                onClick={() => handleSendMessage('Food tour hẹn hò nhẹ nhàng cho 2 người')}
                disabled={!sessionReady || busy}
              >
                Hẹn hò cuối tuần
              </button>
              <button
                type="button"
                className="nn-filter-chip"
                onClick={() => handleSendMessage('Quán local chuẩn vị')}
                disabled={!sessionReady || busy}
              >
                Quán local
              </button>
              <button
                type="button"
                className="nn-filter-chip"
                onClick={() => handleTriggerGPS()}
                disabled={!sessionReady || busy || gpsPending}
              >
                {gpsPending ? 'Đang định vị…' : 'Vị trí GPS'}
              </button>
            </div>

            <div className="nn-chat-divider" role="separator" />

            {/* Error / Conflict Alert Banner */}
            {(errorBanner || initError || parentInitializing) && (
              <div data-testid="guided-error-banner" role="alert" className="nn-alert" style={{ margin: '8px 0 12px 0' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <AlertGlyph size={14} color="#C44A24" />
                  {parentInitializing
                    ? 'Đang khởi tạo phiên làm việc…'
                    : normalizeDisplayText(errorBanner || initError?.message)}
                </span>
                {!parentInitializing && (
                  sessionError === 'session_not_found' || sessionError === 'unauthorized' ? (
                    <button type="button" onClick={onResetSession}>Tạo phiên mới</button>
                  ) : (
                    <button type="button" onClick={() => fetchAssistantView(sessionId, sessionToken)}>Thử lại</button>
                  )
                )}
              </div>
            )}

            {/* Collapsed Profile Drawer (Lives outside message stream) */}
            {profileDrawerOpen && (
              <div className="nn-profile-drawer" data-testid="discovery-profile-drawer">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#231815' }}>
                    Tuỳ chỉnh tiêu chí chuyến đi
                  </h3>
                  <span style={{ fontSize: '11px', color: '#8C7872' }}>
                    Hồ sơ v#{view.profile_version}
                  </span>
                </div>

                <form onSubmit={handleSaveProfile}>
                  <div className="nn-profile-drawer-grid">
                    <div className="nn-profile-field">
                      <label htmlFor="pref-area">Khu vực</label>
                      <input
                        id="pref-area"
                        type="text"
                        value={profileForm.area || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, area: e.target.value })}
                        placeholder="Hoàn Kiếm, Tây Hồ…"
                      />
                    </div>

                    <div className="nn-profile-field">
                      <label htmlFor="pref-party">Số người</label>
                      <input
                        id="pref-party"
                        type="number"
                        min="1"
                        max="20"
                        value={profileForm.party_size ?? ''}
                        onChange={(e) => setProfileForm({ ...profileForm, party_size: e.target.value })}
                        placeholder="Chưa chọn"
                      />
                    </div>

                    <div className="nn-profile-field">
                      <label htmlFor="pref-budget">Ngân sách (VNĐ)</label>
                      <input
                        id="pref-budget"
                        type="number"
                        step="10000"
                        value={profileForm.budget_vnd ?? ''}
                        onChange={(e) => setProfileForm({ ...profileForm, budget_vnd: e.target.value })}
                        placeholder="Chưa chọn"
                      />
                    </div>

                    <div className="nn-profile-field">
                      <label htmlFor="pref-scope">Phạm vi ngân sách</label>
                      <select
                        id="pref-scope"
                        value={profileForm.budget_scope || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, budget_scope: e.target.value || null })}
                      >
                        <option value="">Chưa chọn</option>
                        <option value="group">Cả nhóm (group)</option>
                        <option value="per_person">Mỗi người (per_person)</option>
                      </select>
                    </div>

                    <div className="nn-profile-field">
                      <label htmlFor="pref-time">Giờ bắt đầu</label>
                      <input
                        id="pref-time"
                        type="time"
                        value={profileForm.start_time || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, start_time: e.target.value || null })}
                      />
                    </div>

                    <div className="nn-profile-field">
                      <label htmlFor="pref-duration">Tổng thời lượng (phút)</label>
                      <input
                        id="pref-duration"
                        type="number"
                        step="15"
                        min="30"
                        max="720"
                        value={profileForm.duration_min ?? ''}
                        onChange={(e) => setProfileForm({ ...profileForm, duration_min: e.target.value })}
                        placeholder="Chưa chọn"
                      />
                    </div>

                    <div className="nn-profile-field">
                      <label htmlFor="pref-vehicle">Phương tiện</label>
                      <select
                        id="pref-vehicle"
                        value={profileForm.vehicle || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, vehicle: e.target.value || null })}
                      >
                        <option value="">Chưa chọn</option>
                        <option value="walk">Đi bộ</option>
                        <option value="motorbike">Xe máy</option>
                        <option value="car">Ô tô</option>
                        <option value="taxi">Taxi / Grab</option>
                      </select>
                    </div>

                    <div className="nn-profile-field">
                      <label htmlFor="pref-leg">Chặng tối đa (phút)</label>
                      <input
                        id="pref-leg"
                        type="number"
                        min="3"
                        max="60"
                        value={profileForm.max_leg_min ?? ''}
                        onChange={(e) => setProfileForm({ ...profileForm, max_leg_min: e.target.value })}
                        placeholder="Chưa chọn"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                    <div className="nn-profile-field">
                      <label htmlFor="pref-tastes">Món thích (cách nhau dấu phẩy)</label>
                      <input
                        id="pref-tastes"
                        type="text"
                        value={Array.isArray(profileForm.tastes) ? profileForm.tastes.join(', ') : (profileForm.tastes || '')}
                        onChange={(e) => setProfileForm({ ...profileForm, tastes: e.target.value })}
                        placeholder="phở, chè, ốc…"
                      />
                    </div>

                    <div className="nn-profile-field">
                      <label htmlFor="pref-allergies">Dị ứng / Kiêng (cách nhau dấu phẩy)</label>
                      <input
                        id="pref-allergies"
                        type="text"
                        value={Array.isArray(profileForm.allergies) ? profileForm.allergies.join(', ') : (profileForm.allergies || '')}
                        onChange={(e) => setProfileForm({ ...profileForm, allergies: e.target.value })}
                        placeholder="hải sản, đậu phộng…"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                    <button
                      type="button"
                      className="nn-action-chip-btn"
                      onClick={() => setProfileDrawerOpen(false)}
                    >
                      Huỷ
                    </button>
                    <button
                      type="submit"
                      data-testid="btn-save-profile"
                      className="nn-action-chip-btn primary"
                      disabled={!sessionReady || busy}
                    >
                      Lưu thay đổi
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Origin Chooser Bar (Click-only GPS, resolve place catalog, manual coordinates, clear) */}
            <div className="nn-origin-chooser" data-testid="discovery-origin-chooser">
              <div className="nn-origin-header">
                <span className="nn-origin-title">
                  <span className="nn-target-icon">⌖</span> Điểm xuất phát của bạn
                </span>
                {(displayView.location?.status === 'chosen' || displayView.profile?.origin) && (
                  <button
                    type="button"
                    data-testid="origin-clear-button"
                    className="nn-origin-clear-btn"
                    onClick={handleClearOrigin}
                    disabled={!sessionReady || busy}
                  >
                    Xoá điểm xuất phát
                  </button>
                )}
              </div>

              {/* Status Row */}
              <div className="nn-origin-status-row">
                {displayView.location?.status === 'chosen' || displayView.profile?.origin ? (
                  <div className="nn-origin-chosen-wrap">
                    <span className="nn-origin-current-tag">
                      {displayView.location?.label || (displayView.profile?.origin ? `${displayView.profile.origin.lat.toFixed(4)}, ${displayView.profile.origin.lon.toFixed(4)}` : 'Đã chọn điểm xuất phát')}
                    </span>
                    {(displayView.location?.approximate || displayView.profile?.origin?.approximate) && (
                      <span className="nn-origin-approx-badge">Gần đúng</span>
                    )}
                    <button
                      type="button"
                      className="nn-origin-text-btn"
                      onClick={() => setShowManualCoords(!showManualCoords)}
                      disabled={!sessionReady || busy}
                    >
                      {showManualCoords ? 'Đóng chỉnh sửa' : 'Đổi vị trí khác'}
                    </button>
                  </div>
                ) : (
                  <div className="nn-origin-unset-wrap">
                    <span className="nn-origin-unset-text">
                      Chưa thiết lập điểm xuất phát (Bạn vẫn có thể trò chuyện tự do).
                    </span>
                  </div>
                )}
              </div>

              {/* Geolocation Notice */}
              {geoNotice && (
                <div className="nn-geo-notice" data-testid="origin-geo-notice">
                  {normalizeDisplayText(geoNotice)}
                </div>
              )}

              {/* Origin Action Controls: Click-only GPS + Place Resolve Query */}
              {(displayView.location?.status !== 'chosen' && !displayView.profile?.origin || showManualCoords) && (
                <div className="nn-origin-controls">
                  <div className="nn-origin-action-buttons">
                    <button
                      type="button"
                      data-testid="origin-gps-button"
                      className="nn-origin-gps-btn"
                      onClick={handleTriggerGPS}
                      disabled={!sessionReady || busy || gpsPending}
                    >
                      {gpsPending ? 'Đang định vị GPS…' : 'Vị trí GPS hiện tại'}
                    </button>
                    <button
                      type="button"
                      className="nn-origin-manual-toggle"
                      onClick={() => setShowManualCoords(!showManualCoords)}
                      disabled={!sessionReady || busy}
                    >
                      {showManualCoords ? 'Ẩn nhập toạ độ' : 'Nhập toạ độ thủ công'}
                    </button>
                  </div>

                  {/* Place query search form */}
                  <form onSubmit={handleResolveOrigin} className="nn-origin-search-form">
                    <input
                      type="text"
                      data-testid="origin-query-input"
                      className="nn-origin-input"
                      value={originQuery}
                      onChange={(e) => setOriginQuery(e.target.value)}
                      placeholder="Tìm phố hoặc địa danh (vd: Chợ Hôm, Hàng Bạc)…"
                      disabled={!sessionReady || busy}
                    />
                    <button
                      type="submit"
                      data-testid="origin-resolve-button"
                      className="nn-origin-resolve-btn"
                      disabled={!sessionReady || busy || !originQuery.trim()}
                    >
                      Tìm
                    </button>
                  </form>

                  {/* Manual Coordinates Form */}
                  {showManualCoords && (
                    <form onSubmit={handleManualCoordsSubmit} className="nn-origin-coords-form">
                      <input
                        type="number"
                        step="0.0001"
                        data-testid="origin-lat-input"
                        className="nn-origin-coord-input"
                        placeholder="Vĩ độ (Lat, vd: 21.0285)"
                        value={manualCoords.lat}
                        onChange={(e) => setManualCoords({ ...manualCoords, lat: e.target.value })}
                      />
                      <input
                        type="number"
                        step="0.0001"
                        data-testid="origin-lon-input"
                        className="nn-origin-coord-input"
                        placeholder="Kinh độ (Lon, vd: 105.8542)"
                        value={manualCoords.lon}
                        onChange={(e) => setManualCoords({ ...manualCoords, lon: e.target.value })}
                      />
                      <button
                        type="submit"
                        data-testid="origin-coords-submit"
                        className="nn-origin-resolve-btn"
                        disabled={!manualCoords.lat || !manualCoords.lon || !sessionReady || busy}
                      >
                        Lưu toạ độ
                      </button>
                    </form>
                  )}

                  {/* Candidate list if status === 'candidates' */}
                  {displayView.location?.status === 'candidates' && Array.isArray(displayView.location?.candidates) && displayView.location.candidates.length > 0 && (
                    <div className="nn-origin-candidates" data-testid="origin-candidates-list">
                      <div className="nn-origin-candidates-title">Chọn địa điểm phù hợp trong danh mục:</div>
                      {displayView.location.candidates.map((cand) => (
                        <div key={cand.id} className="nn-origin-candidate-item">
                          <div>
                            <span className="nn-origin-candidate-label">{cand.label}</span>
                            {cand.approximate && (
                              <span className="nn-origin-approx-badge">Gần đúng</span>
                            )}
                          </div>
                          <button
                            type="button"
                            data-testid={`origin-candidate-${cand.id}`}
                            className="nn-origin-candidate-choose-btn"
                            onClick={() => handleChooseCandidate(cand.id)}
                            disabled={!sessionReady || busy}
                          >
                            Chọn điểm này
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Not found alert */}
                  {displayView.location?.status === 'not_found' && (
                    <div className="nn-origin-not-found" data-testid="origin-not-found-msg">
                      Không tìm thấy địa điểm trong danh mục nội bộ. Vui lòng nhập tên phố / địa danh khác hoặc sử dụng toạ độ GPS.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable Message Stream */}
            <div className="nn-stream" ref={chatScrollRef} data-testid="discovery-messages-list">
              {/* Initial Assistant Welcome */}
              <div className="nn-editorial-welcome">
                <div className="nn-editorial-badge"><StarGlyph size={10} color="#CF542F" /> MĂM MĂM</div>
                <div className="nn-bubble editorial-body">
                  {displayView.reply?.text || DEFAULT_ASSISTANT_VIEW.reply.text}
                </div>
                {displayView.reply?.question && (
                  <div style={{ marginTop: '6px', fontWeight: 600, color: 'var(--nn-accent, #C44A24)', fontSize: '13.5px' }}>
                    {displayView.reply.question}
                  </div>
                )}
              </div>

              {/* Untrusted Web Sources Reference Box */}
              {Array.isArray(displayView.web?.sources) && displayView.web.sources.length > 0 && (
                <div className="nn-web-sources-box" data-testid="web-sources-box">
                  <div className="nn-web-sources-title">
                    Nguồn tham khảo từ web (chưa kiểm chứng thực tế):
                  </div>
                  <div className="nn-web-sources-disclaimer">
                    Thông tin web mang tính tham khảo mở rộng từ công cụ tìm kiếm, chưa được kiểm chứng thực tế tại quán; không bảo đảm an toàn dị ứng, giá hoặc giờ mở cửa.
                  </div>
                  <ul className="nn-web-sources-list">
                    {displayView.web.sources.map((src, sIdx) => {
                      const safeHref = safeExternalUrl(src.url);
                      return (
                        <li key={sIdx} className="nn-web-source-item" data-testid={`web-source-item-${sIdx}`}>
                          {safeHref ? (
                            <a
                              href={safeHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="nn-web-source-link"
                            >
                              {src.title || src.url}
                            </a>
                          ) : (
                            <span className="nn-web-source-link">{src.title || src.url || 'Nguồn web'}</span>
                          )}
                          <div className="nn-web-source-meta" style={{ fontSize: '11px', color: '#8C7872', marginTop: '2px' }}>
                            <span className="nn-web-source-url" style={{ wordBreak: 'break-all' }}>{src.url}</span>
                            {src.retrieved_at && (
                              <span className="nn-web-source-time" style={{ marginLeft: '6px' }}>
                                • Thu thập lúc: {new Date(src.retrieved_at).toLocaleString('vi-VN')}
                              </span>
                            )}
                          </div>
                          {src.snippet && <p className="nn-web-source-snippet">{src.snippet}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Historical Messages */}
              {Array.isArray(displayView.messages) && displayView.messages.map((m, idx) => (
                m.role === 'user' ? (
                  <div key={idx} className="nn-bubble user">
                    {m.text}
                  </div>
                ) : (
                  <div key={idx} className="nn-editorial-assistant">
                    <div className="nn-editorial-badge">
                      <StarGlyph size={10} color="#CF542F" /> MĂM MĂM
                      {displayView.provider?.reply_source === 'rules' && ' · QUY TẮC NỘI BỘ'}
                      {displayView.provider?.reply_source === 'tools' && ' · CÔNG CỤ NỘI BỘ'}
                    </div>
                    <div className="nn-bubble editorial-body">
                      {m.text}
                    </div>
                  </div>
                )
              ))}

              {/* Restaurant Results Cards */}
              {Array.isArray(displayView.results) && displayView.results.length > 0 && (
                <div className="nn-discovery-results">
                  <div className="nn-discovery-results-header">
                    <span>Gợi ý quán phù hợp{displayView.profile?.area ? ` tại ${displayView.profile.area}` : ''}</span>
                    <span className="nn-results-count-badge">{displayView.results.length} địa điểm</span>
                  </div>

                  {displayView.results.map((r, idx) => {
                    const isSelected = selectedVenueIds.has(r.id);
                    const isCompareSelected = selectedForCompare.includes(r.id);
                    const badgeLabel = r.label || String.fromCharCode(65 + (idx % 26));

                    return (
                      <div
                        key={r.id}
                        data-testid={`restaurant-card-${r.id}`}
                        className={`nn-restaurant-card${isSelected ? ' selected' : ''}`}
                      >
                        <div className="nn-restaurant-card-top">
                          <div className="nn-restaurant-badge">{badgeLabel}</div>
                          <div className="nn-restaurant-info">
                            <div className="nn-restaurant-name-row">
                              <h4 className="nn-restaurant-name">{r.name}</h4>
                              {isSelected && (
                                <span style={{ fontSize: '11px', color: '#2E7D32', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <CheckGlyph size={12} color="#2E7D32" /> Đã thêm vào tour
                                </span>
                              )}
                            </div>
                            <p className="nn-restaurant-address">
                              {r.address}{r.district ? ` · ${r.district}` : ''}
                            </p>

                            {/* Dish tags */}
                            {Array.isArray(r.dish_tags) && r.dish_tags.length > 0 && (
                              <div className="nn-dish-tags-row">
                                {r.dish_tags.map((tag, tIdx) => (
                                  <span key={tIdx} className="nn-dish-tag">{tag}</span>
                                ))}
                              </div>
                            )}

                            {/* Price and Hours */}
                            <div className="nn-restaurant-meta-row">
                              {r.price && (r.price.min_vnd || r.price.max_vnd) ? (
                                <span className="nn-restaurant-meta-item" title="Khoảng giá quán">
                                  Giá: {Number(r.price.min_vnd || 0).toLocaleString('vi-VN')} – {Number(r.price.max_vnd || 0).toLocaleString('vi-VN')} đ
                                  <span style={{ fontSize: '10.5px', color: '#8C7872' }}> (khoảng giá quán)</span>
                                </span>
                              ) : (
                                <span className="nn-restaurant-meta-item" style={{ color: '#8C7872' }}>
                                  Giá: Chưa xác minh
                                </span>
                              )}

                              {r.hours?.display ? (
                                <span className="nn-restaurant-meta-item">
                                  Giờ: {r.hours.display}
                                </span>
                              ) : (
                                <span className="nn-restaurant-meta-item" style={{ color: '#8C7872' }}>
                                  Giờ: Chưa xác minh
                                </span>
                              )}
                            </div>

                            {/* Server-computed Distance Display */}
                            <div className="nn-restaurant-meta-row" style={{ marginTop: '2px' }}>
                              <span
                                className="nn-restaurant-meta-item"
                                data-testid={`restaurant-distance-${r.id}`}
                                style={{ color: r.distance_m != null ? '#702914' : '#8C7872', fontWeight: r.distance_m != null ? 600 : 400 }}
                              >
                                Khoảng cách: {formatDistanceDisplay(r)}
                              </span>
                            </div>

                            {/* Unknowns warning pills */}
                            {Array.isArray(r.unknowns) && r.unknowns.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                {r.unknowns.map((u, uIdx) => (
                                  <span
                                    key={uIdx}
                                    style={{
                                      fontSize: '10.5px',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      background: '#FFF3E0',
                                      color: '#E65100'
                                    }}
                                  >
                                    Chưa rõ: {formatUnknownLabel(u)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions Row */}
                        <div className="nn-restaurant-actions-row">
                          <div className="nn-restaurant-btns">
                            <button
                              type="button"
                              data-testid={`btn-select-venue-${r.id}`}
                              className={`nn-action-chip-btn${isSelected ? ' active' : ' primary'}`}
                              onClick={() => isSelected ? handleRemoveVenue(r.id) : handleAddVenue(r)}
                              disabled={!sessionReady || busy}
                            >
                              {isSelected ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <CheckGlyph size={12} color="currentColor" /> Đã chọn
                                </span>
                              ) : '+ Chọn vào tour'}
                            </button>

                            <button
                              type="button"
                              data-testid={`btn-compare-venue-${r.id}`}
                              className={`nn-action-chip-btn${isCompareSelected ? ' active' : ''}`}
                              onClick={() => handleToggleCompareSelect(r.id)}
                              disabled={!sessionReady || busy}
                            >
                              {isCompareSelected ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <CheckGlyph size={12} color="currentColor" /> Đang so sánh
                                </span>
                              ) : 'So sánh'}
                            </button>

                            <button
                              type="button"
                              data-testid={`btn-details-venue-${r.id}`}
                              className="nn-action-chip-btn"
                              onClick={(e) => handleOpenDetailModal(r, e)}
                            >
                              Chi tiết
                            </button>
                          </div>

                          {/* Provenance Link */}
                          {r.source_url && (
                            <a
                              href={r.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="nn-source-link"
                              title="Nguồn thông tin địa điểm (không phải trích dẫn web trực tiếp)"
                            >
                              <span>Nguồn dữ liệu</span>
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Multi-compare trigger bar when 2+ selected */}
                  {selectedForCompare.length >= 2 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9EFE7', padding: '10px 14px', borderRadius: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#4A352F' }}>
                        Đã chọn {selectedForCompare.length} quán để so sánh
                      </span>
                      <button
                        type="button"
                        className="nn-action-chip-btn primary"
                        onClick={() => handleExecuteComparison()}
                        disabled={!sessionReady || busy}
                      >
                        Bắt đầu so sánh →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Comparison View */}
              {displayView.comparison && (
                <div className="nn-comparison-card" data-testid="discovery-comparison-view">
                  <h4 className="nn-comparison-title">
                    <span>So sánh chi tiết các địa điểm</span>
                  </h4>
                  <div className="nn-comparison-grid">
                    {(displayView.comparison.venues || []).map((cv) => (
                      <div key={cv.id} className="nn-comparison-col">
                        <div className="nn-comparison-col-header">
                          <span>{cv.name}</span>
                        </div>
                        <div className="nn-comparison-col-item">
                          <strong>Món:</strong> {(cv.dish_tags || []).join(', ') || 'Chưa rõ'}
                        </div>
                        <div className="nn-comparison-col-item">
                          <strong>Giá:</strong> {cv.price && (cv.price.min_vnd || cv.price.max_vnd) ? `${Number(cv.price.min_vnd || 0).toLocaleString('vi-VN')} – ${Number(cv.price.max_vnd || 0).toLocaleString('vi-VN')} đ` : 'Chưa xác minh'}
                        </div>
                        <div className="nn-comparison-col-item">
                          <strong>Giờ:</strong> {cv.hours?.display || 'Chưa xác minh'}
                        </div>
                        <div className="nn-comparison-col-item">
                          <strong>Khu vực:</strong> {cv.district || cv.address}
                        </div>
                        <div className="nn-comparison-col-item">
                          <strong>Khoảng cách:</strong> {formatDistanceDisplay(cv)}
                        </div>
                        <div style={{ marginTop: '6px' }}>
                          <button
                            type="button"
                            className="nn-action-chip-btn primary"
                            style={{ width: '100%', justifyContent: 'center' }}
                            onClick={() => handleAddVenue(cv)}
                            disabled={!sessionReady || busy || selectedVenueIds.has(cv.id)}
                          >
                            {selectedVenueIds.has(cv.id) ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CheckGlyph size={12} color="currentColor" /> Đã chọn
                              </span>
                            ) : '+ Chọn quán này'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {Array.isArray(displayView.comparison?.unknowns) && displayView.comparison.unknowns.length > 0 && (
                    <div style={{ marginTop: '10px', fontSize: '11.5px', color: '#8A4B12' }}>
                      Lưu ý: Các yếu tố chưa có bằng chứng xác minh: {displayView.comparison.unknowns.map(formatUnknownLabel).join(', ')}.
                    </div>
                  )}
                </div>
              )}

              {/* Versioned Confirmation Card (Strict gate) */}
              {view.confirmation && (
                <div className="nn-discovery-confirmation" data-testid="discovery-confirmation-card">
                  <div className="nn-confirm-header">
                    <div>
                      <h4 className="nn-confirm-title">
                        {displayView.confirmation?.summary?.title || 'Xác nhận trước khi tạo lịch trình'}
                      </h4>
                      <p style={{ fontSize: '12.5px', color: '#6C554E', margin: 0 }}>
                        {displayView.confirmation?.summary?.description || displayView.confirmation?.summary?.notes || 'Vui lòng kiểm tra lại các tiêu chí chuyến đi và danh sách quán đã chọn.'}
                      </p>
                    </div>
                  </div>

                  {/* Summary chips */}
                  <div className="nn-confirm-summary-list">
                    {displayView.profile?.area && (
                      <span className="nn-confirm-summary-chip">Khu vực: {displayView.profile.area}</span>
                    )}
                    {displayView.profile?.party_size && (
                      <span className="nn-confirm-summary-chip">Số người: {displayView.profile.party_size}</span>
                    )}
                    {displayView.profile?.budget_vnd && (
                      <span className="nn-confirm-summary-chip">
                        Ngân sách: {Number(displayView.profile.budget_vnd).toLocaleString('vi-VN')} đ ({displayView.profile.budget_scope === 'per_person' ? 'mỗi người' : 'cả nhóm'})
                      </span>
                    )}
                    {displayView.profile?.start_time && (
                      <span className="nn-confirm-summary-chip">Bắt đầu: {displayView.profile.start_time}</span>
                    )}
                    {displayView.profile?.duration_min && (
                      <span className="nn-confirm-summary-chip">Thời lượng: {displayView.profile.duration_min} phút</span>
                    )}
                    {displayView.profile?.vehicle && (
                      <span className="nn-confirm-summary-chip">
                        Phương tiện: {displayView.profile.vehicle === 'walk' ? 'Đi bộ' : displayView.profile.vehicle}
                      </span>
                    )}
                    {displayView.selection?.length > 0 && (
                      <span className="nn-confirm-summary-chip">
                        Quán đã chọn: {displayView.selection.length}
                      </span>
                    )}
                  </div>

                  {/* Warnings box */}
                  {Array.isArray(displayView.confirmation?.warnings) && displayView.confirmation.warnings.length > 0 && (
                    <div className="nn-confirm-warnings">
                      <div className="nn-confirm-warning-title">
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <AlertGlyph size={14} color="#C44A24" /> Lưu ý an toàn & dữ liệu
                        </span>
                      </div>
                      {displayView.confirmation.warnings.map((w, wIdx) => (
                        <p key={wIdx} className="nn-confirm-warning-text">• {w}</p>
                      ))}
                    </div>
                  )}

                  {/* Explicit Confirmation Action Buttons */}
                  <div className="nn-confirm-actions">
                    <button
                      type="button"
                      data-testid="btn-confirm-itinerary"
                      className="nn-confirm-btn-primary"
                      onClick={() => handleExplicitConfirm(view.confirmation.id)}
                      disabled={!sessionReady || busy}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckGlyph size={14} color="currentColor" /> Xác nhận tạo lịch trình ngay
                      </span>
                    </button>
                    <button
                      type="button"
                      data-testid="btn-edit-itinerary"
                      className="nn-confirm-btn-secondary"
                      onClick={() => setProfileDrawerOpen(true)}
                      disabled={!sessionReady || busy}
                    >
                      Chỉnh sửa thêm tiêu chí
                    </button>
                  </div>
                </div>
              )}

              {/* Busy Status Indicator */}
              {busy && (
                <div className="nn-busy" role="status">
                  <i />
                  <span>{busyMessage}</span>
                </div>
              )}
            </div>

            {/* Quick Followups / Suggestions */}
            <div className="nn-quick-followups">
              <button
                type="button"
                className="nn-quick-btn"
                onClick={() => handleSendMessage('Thêm món chay')}
                disabled={!sessionReady || busy}
              >
                + Thêm món chay
              </button>
              <button
                type="button"
                className="nn-quick-btn"
                onClick={() => handleSendMessage('Ít di chuyển hơn, đi bộ gần')}
                disabled={!sessionReady || busy}
              >
                Ít di chuyển hơn
              </button>
              <button
                type="button"
                className="nn-quick-btn"
                onClick={() => setProfileDrawerOpen(true)}
                disabled={!sessionReady || busy}
              >
                Đổi ngân sách
              </button>
            </div>

            {/* Chat Composer Foot */}
            <div className="nn-chat-foot">
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
                  data-testid="discovery-input"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={!sessionReady || busy}
                  placeholder={sessionReady ? 'Bạn muốn điều chỉnh gì cho chuyến đi?' : (parentInitializing || busy ? 'Đang tải dữ liệu phiên làm việc…' : 'Phiên chưa sẵn sàng...')}
                  aria-label="Nhập yêu cầu khám phá ẩm thực"
                />
                <button
                  type="submit"
                  data-testid="discovery-send-btn"
                  className="nn-send"
                  disabled={!sessionReady || busy || !inputText.trim()}
                  aria-label="Gửi yêu cầu"
                >
                  <span className="nn-send-label">Gửi tin nhắn</span>
                  <ArrowGlyph />
                </button>
              </form>

              {/* Secondary Diagnostics Details */}
              <details className="nn-diagnostics-details" data-testid="discovery-diagnostics">
                <summary>Thông tin kỹ thuật & kiểm định (Diagnostics)</summary>
                <div className="nn-diagnostics-content">
                  <div>Hợp đồng: {view.contract || 'discovery-v1'} | Revision: #{view.revision}</div>
                  <div>Phiên bản hồ sơ: #{view.profile_version} | Phiên bản chọn quán: #{view.selection_version}</div>
                  <div>Nguồn dữ liệu: {view.source?.dataset_source || 'chưa cấp'} ({view.source?.dataset_version || 'n/a'})</div>
                  <div>
                    Chế độ AI: {view.provider?.mode || health?.llm || 'rules'}
                    {view.provider?.model ? ` (${view.provider.model})` : ''}
                    {view.provider?.reply_source ? ` | Nguồn phản hồi: ${
                      view.provider.reply_source === 'model' ? 'Mô hình AI' :
                      view.provider.reply_source === 'tools' ? 'Công cụ nội bộ (Tools)' :
                      'Quy tắc hệ thống (Rules)'
                    }` : ''}
                    {view.provider?.reason ? ` [Lý do: ${view.provider.reason}]` : ''}
                    {` (Gọi: ${view.provider?.calls || 0} lượt)`}
                  </div>
                  <div>Thời gian xử lý: {view.diagnostics?.elapsed_ms || 0}ms | Thời tiết: {view.diagnostics?.weather || 'unavailable'}</div>
                </div>
              </details>
            </div>
          </section>

          {/* RIGHT TOUR / SELECTION / MAP COLUMN */}
          <section
            ref={tourSectionRef}
            className={`nn-tour-col${activeMobileTab === 'chat' ? ' nn-hidden-mobile' : ''}`}
          >
            <div className="nn-tour-col-header">
              <h2 className="nn-tour-heading">Chuyến đi của bạn</h2>
              <div className="nn-view-mode-toggle" role="group" aria-label="Chế độ hiển thị">
                <button
                  type="button"
                  data-testid="view-mode-schematic-btn"
                  className={`nn-view-mode-btn${viewMode === 'schematic' ? ' active' : ''}`}
                  onClick={() => setViewMode('schematic')}
                >
                  Sơ đồ
                </button>
                <button
                  type="button"
                  data-testid="pilot-map-toggle"
                  className={`nn-view-mode-btn${viewMode === 'map' ? ' active' : ''}`}
                  onClick={() => setViewMode('map')}
                >
                  Bản đồ
                </button>
              </div>
            </div>

            {viewMode === 'map' ? (
              <div className="nn-map-container-wrap">
                <PilotMap
                  stops={mapStops}
                  onFallbackToSchematic={() => setViewMode('schematic')}
                />
              </div>
            ) : (
              <div className="nn-tour-content-scroll">
                {/* Hero Card */}
                <div className="nn-hero-card">
                  <div className="nn-hero-tag">
                    <StarGlyph size={10} color="#E8B85C" /> {stops[0]?.district ? `HANOI AFTER HOURS · ${stops[0].district.toUpperCase()}` : 'HANOI AFTER HOURS'}
                  </div>
                  <h3 className="nn-hero-title">
                    {displayView.tour?.title || 'Đi một vòng, ngon một tối.'}
                  </h3>
                  <div className="nn-hero-meta">
                    {stops.length > 0
                      ? `${stops[0]?.district || 'Hà Nội'}${stops[0]?.arrive ? ` • ${stops[0].arrive}` : ''}${stops[stops.length - 1]?.depart ? ` — ${stops[stops.length - 1].depart}` : ''}`
                      : (areaDisplay ? `${areaDisplay} • Đang lên ý tưởng` : 'Hà Nội • Chưa tạo lịch trình')}
                  </div>
                </div>

                {/* 3-Column Metrics Card */}
                {(() => {
                  const durationInfo = deriveTourDuration(view.tour, view.profile);
                  const priceInfo = deriveTourPriceInfo(view.tour, view.profile);
                  return (
                    <div className="nn-metrics-card">
                      <div className="nn-metric-col">
                        <div className="nn-metric-val">
                          {stops.length > 0 ? (stops.length < 10 ? `0${stops.length}` : stops.length) : (view.selection?.length ? `0${view.selection.length}` : '—')}
                        </div>
                        <div className="nn-metric-lbl">điểm dừng</div>
                      </div>
                      <div className="nn-metric-divider" />
                      <div className="nn-metric-col">
                        <div className="nn-metric-val">
                          {durationInfo.val}
                        </div>
                        <div className="nn-metric-lbl">{durationInfo.lbl}</div>
                      </div>
                      <div className="nn-metric-divider" />
                      <div className="nn-metric-col">
                        <div className="nn-metric-val">
                          {priceInfo.val}
                        </div>
                        <div className="nn-metric-lbl">
                          {priceInfo.lbl}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* When Tour has been created and user is not editing selection */}
                {view.tour && !editingSelectionAfterTour ? (
                  <GuidedTimeline
                    tour={displayView.tour || view.tour}
                    allergies={displayView.profile?.allergies || []}
                    lockedStops={(view.selection || []).filter((s) => s.locked).map((s) => s.id)}
                    origin={displayView.profile?.origin || view.profile?.origin}
                    vehicle={displayView.profile?.vehicle || view.profile?.vehicle}
                    onReplaceStop={(stop) => handleStartStopReplacement(stop)}
                    onChangeStop={(stop) => handleStartStopReplacement(stop)}
                    onAdjustStops={() => handleOpenSelectionEditor()}
                    onRestart={onResetSession}
                  />
                ) : (
                  /* When Tour is not created yet OR when user is editing selection after tour */
                  <div className="nn-selection-container" data-testid="discovery-selection-container">
                    {editingSelectionAfterTour && (
                      <div className="nn-edit-selection-banner" data-testid="editing-selection-banner">
                        <div className="nn-edit-selection-header">
                          <span className="nn-edit-badge">ĐIỀU CHỈNH ĐIỂM DỪNG TOUR</span>
                          <button
                            type="button"
                            className="nn-back-tour-btn"
                            onClick={() => {
                              setEditingSelectionAfterTour(false);
                              setReplaceTargetStop(null);
                            }}
                            aria-label="Quay lại xem lịch trình hiện tại"
                          >
                            Xem tour hiện tại
                          </button>
                        </div>
                        <p className="nn-edit-selection-text">
                          {replaceTargetStop
                            ? `Đang chọn thay thế cho quán: "${replaceTargetStop.name}". Chọn quán mới từ gợi ý bên trái, gỡ bỏ quán cũ hoặc khoá quán, sau đó bấm "Lập lại lịch trình" và xác nhận.`
                            : 'Điều chỉnh danh sách quán. Thay đổi cần được lập lại lịch trình và xác nhận tường minh trước khi cập nhật tour.'}
                        </p>
                      </div>
                    )}

                    <div className="nn-selection-header-row">
                      <h3 className="nn-selection-title">
                        {editingSelectionAfterTour ? 'Danh sách điểm dừng đang chọn' : 'Danh sách quán đã chọn'}
                      </h3>
                      <span className="nn-selection-badge">
                        {view.selection?.length || 0}/5 quán
                      </span>
                    </div>

                    {Array.isArray(displayView.selection) && displayView.selection.length > 0 ? (
                      <>
                        {displayView.selection.map((item, idx) => (
                          <div
                            key={item.id}
                            data-testid={`selected-venue-card-${item.id}`}
                            className={`nn-selected-card${replaceTargetStop?.id === item.id ? ' nn-replace-target' : ''}`}
                          >
                            <div className="nn-selected-card-left">
                              <div className="nn-restaurant-badge" style={{ width: '26px', height: '26px', fontSize: '12px' }}>
                                {idx + 1}
                              </div>
                              <div>
                                <h4 className="nn-selected-name">
                                  {item.name}
                                  {replaceTargetStop?.id === item.id && (
                                    <span className="nn-replace-target-tag">Quán cần đổi</span>
                                  )}
                                </h4>
                                <p className="nn-selected-sub">{item.address || item.district}</p>
                                <p
                                  className="nn-selected-sub"
                                  data-testid={`selected-distance-${item.id}`}
                                  style={{
                                    color: item.distance_m != null ? '#702914' : '#8C7872',
                                    fontWeight: item.distance_m != null ? 600 : 400,
                                    marginTop: '2px'
                                  }}
                                >
                                  Khoảng cách: {formatDistanceDisplay(item)}
                                </p>
                              </div>
                            </div>

                            <div className="nn-selected-actions">
                              <button
                                type="button"
                                data-testid={`btn-lock-venue-${item.id}`}
                                className={`nn-icon-action-btn${item.locked ? ' locked' : ''}`}
                                onClick={() => handleToggleLockVenue(item)}
                                title={item.locked ? 'Mở khoá quán' : 'Khoá quán này'}
                                aria-label={item.locked ? 'Mở khoá quán' : 'Khoá quán'}
                                disabled={!sessionReady || busy}
                              >
                                {item.locked ? (
                                  <LockGlyph size={14} color="#CF542F" />
                                ) : (
                                  <UnlockGlyph size={14} color="#7A625A" />
                                )}
                              </button>
                              <button
                                type="button"
                                data-testid={`btn-remove-venue-${item.id}`}
                                className="nn-icon-action-btn"
                                onClick={() => handleRemoveVenue(item.id)}
                                title="Xoá quán khỏi danh sách"
                                aria-label="Xoá quán"
                                disabled={!sessionReady || busy}
                              >
                                <CloseGlyph size={12} color="currentColor" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Plan Trigger Dark CTA Card */}
                        <div className="nn-plan-trigger-card">
                          <h4 className="nn-plan-trigger-title">
                            {editingSelectionAfterTour ? 'Cập nhật lại lịch trình?' : 'Sẵn sàng tạo lịch trình?'}
                          </h4>
                          <p className="nn-plan-trigger-desc">
                            {editingSelectionAfterTour
                              ? 'Hệ thống sẽ tối ưu lại tuyến đường dựa trên danh sách quán mới. Bạn sẽ cần xác nhận trước khi tour cập nhật.'
                              : 'Hệ thống sẽ tối ưu tuyến đường, kiểm tra giờ mở cửa và tính toán chi phí theo ngân sách.'}
                          </p>
                          <button
                            type="button"
                            data-testid="btn-trigger-plan"
                            className="nn-plan-trigger-btn"
                            onClick={handleTriggerPlan}
                            disabled={!sessionReady || busy}
                          >
                            {editingSelectionAfterTour
                              ? `Lập lại lịch trình từ ${view.selection.length} quán →`
                              : `Tạo lịch trình từ ${view.selection.length} quán đã chọn →`}
                          </button>
                        </div>
                      </>
                    ) : (
                      /* Empty Steps Guide */
                      <div className="nn-empty-steps-list">
                        {[
                          ['01', 'BƯỚC 1', 'Trò chuyện & Khám phá quán', 'Nêu sở thích, khẩu vị, khu vực để trợ lý tìm kiếm các địa điểm phù hợp.'],
                          ['02', 'BƯỚC 2', 'Chọn quán & So sánh', 'Thêm quán ưng ý vào danh sách tour (tối đa 5 quán) hoặc so sánh các tiêu chí.'],
                          ['03', 'BƯỚC 3', 'Xác nhận & Nhận lịch trình', 'Xem lại thông tin và xác nhận để tạo lộ trình tối ưu kèm chỉ đường Google Maps.']
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
                            data-testid="start-suggesting-cta-btn"
                            className="nn-cta-btn"
                            onClick={() => {
                              inputRef.current?.focus();
                              chatSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                            }}
                          >
                            Bắt đầu gợi ý →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* Accessible Detail Venue Modal with Focus Trap & Escape Listener */}
      {detailVenue && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-venue-modal-title"
          ref={modalRef}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(35, 24, 21, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'grid',
            placeItems: 'center',
            padding: '16px'
          }}
          onClick={() => {
            setDetailVenue(null);
            triggerElRef.current?.focus();
          }}
        >
          <div
            style={{
              background: '#FFFEFA',
              border: '1px solid #EFE7E0',
              borderRadius: '18px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 id="detail-venue-modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#231815' }}>
                  {displayDetailVenue.name}
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#7A625A' }}>
                  {displayDetailVenue.address} · {displayDetailVenue.district}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailVenue(null);
                  triggerElRef.current?.focus();
                }}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: '#8C7872',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px'
                }}
                aria-label={`Đóng cửa sổ chi tiết ${displayDetailVenue.name}`}
              >
                <CloseGlyph size={14} color="#8C7872" />
              </button>
            </div>

            <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <strong>Món đặc trưng:</strong> {(displayDetailVenue.dish_tags || []).join(', ') || 'Chưa rõ'}
              </div>
              <div>
                <strong>Khoảng giá quán:</strong> {displayDetailVenue.price && (displayDetailVenue.price.min_vnd || displayDetailVenue.price.max_vnd) ? `${Number(displayDetailVenue.price.min_vnd || 0).toLocaleString('vi-VN')} – ${Number(displayDetailVenue.price.max_vnd || 0).toLocaleString('vi-VN')} đ` : 'Chưa xác minh'}
              </div>
              <div>
                <strong>Giờ hoạt động:</strong> {displayDetailVenue.hours?.display || 'Chưa xác minh theo nguồn'}
              </div>
              {Array.isArray(displayDetailVenue.unknowns) && displayDetailVenue.unknowns.length > 0 && (
                <div style={{ background: '#FFF7ED', padding: '8px 12px', borderRadius: '8px', color: '#9A3412' }}>
                  <strong>Yếu tố chưa có bằng chứng:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {displayDetailVenue.unknowns.map((u, idx) => (
                      <li key={idx}>Chưa rõ {formatUnknownLabel(u)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {displayDetailVenue.source_url && (
                <div>
                  <strong>Nguồn dữ liệu:</strong>{' '}
                  <a
                    href={detailVenue.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#CF542F', textDecoration: 'underline' }}
                  >
                    Xem liên kết gốc
                  </a>
                  <span style={{ display: 'block', fontSize: '11px', color: '#8C7872', marginTop: '2px' }}>
                    (Mô tả nguồn gốc địa điểm thực tế, không phải kết quả tra cứu web thời gian thực)
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                className="nn-action-chip-btn"
                onClick={() => {
                  setDetailVenue(null);
                  triggerElRef.current?.focus();
                }}
              >
                Đóng
              </button>
              <button
                type="button"
                className="nn-action-chip-btn primary"
                onClick={() => {
                  handleAddVenue(detailVenue);
                  setDetailVenue(null);
                  triggerElRef.current?.focus();
                }}
                disabled={!sessionReady || busy || selectedVenueIds.has(detailVenue.id)}
              >
                {selectedVenueIds.has(detailVenue.id) ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckGlyph size={12} color="currentColor" /> Đã trong tour
                  </span>
                ) : '+ Thêm vào tour'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
