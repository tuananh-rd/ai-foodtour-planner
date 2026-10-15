'use client';

import { useState, useEffect, useRef } from 'react';
import MockBanner from './components/MockBanner';
import TourStatusBanner from './components/TourStatusBanner';
import ChatPanel from './components/ChatPanel';
import PreferencesPanel from './components/PreferencesPanel';
import TourTimeline from './components/TourTimeline';
import MapView from './components/MapView';
import ReplaceDiffModal from './components/ReplaceDiffModal';
import RevisionConflictAlert from './components/RevisionConflictAlert';
import {
  isMockMode,
  setRuntimeMockMode,
  getHealth,
  createSession,
  sendMessage,
  updatePreferences,
  planTour,
  replaceTourStop,
  ApiError
} from '../lib/api';

const DEFAULT_PREFERENCES = {
  city: 'Hà Nội',
  origin: { lat: 21.033, lon: 105.850 },
  start_time: '08:30',
  weekday: 0,
  duration_min: 120,
  budget_vnd: 150000,
  budget_scope: 'per_person',
  party_size: 1,
  interests: ['phở', 'chè'],
  exclusions: [],
  max_stops: 3,
  mode: 'explore'
};

export default function Home() {
  const [isMock, setIsMock] = useState(false);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'preferences' | 'timeline' | 'map'
  
  // Session & revision state
  const [sessionId, setSessionId] = useState(null);
  const [sessionToken, setSessionToken] = useState('');
  const [revision, setRevision] = useState(0);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  
  // Data provenance & server notes
  const [datasetSource, setDatasetSource] = useState('synthetic');
  const [datasetVersion, setDatasetVersion] = useState('');
  // Provider status from /health (no secrets): which LLM/routing services are actually in use.
  const [health, setHealth] = useState(null);
  const [notes, setNotes] = useState([]);

  // Chat & Questions
  const [messages, setMessages] = useState([]);
  const [missingSlots, setMissingSlots] = useState([]);
  const [questions, setQuestions] = useState([]);

  // Tour data
  const [tour, setTour] = useState(null);
  const [highlightedStopId, setHighlightedStopId] = useState(null);

  // Replace modal state (F2: server-chosen replacement, no client preview)
  const [replaceTargetStop, setReplaceTargetStop] = useState(null);
  const [replaceResultDiff, setReplaceResultDiff] = useState(null);
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);

  // Async UI & error states
  // Starts true: the session is being created on mount, so input must not be accepted yet.
  const [busy, setBusy] = useState(true);
  const [lastFailedAction, setLastFailedAction] = useState(null);
  const [error, setError] = useState(null);
  const [conflictError, setConflictError] = useState(null);
  const [noCandidatesError, setNoCandidatesError] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [rateLimitError, setRateLimitError] = useState(null);
  const [providerUnavailableError, setProviderUnavailableError] = useState(null);

  // F3 Race Condition Guards: Request token & AbortController
  const requestTokenRef = useRef(0);
  const abortControllerRef = useRef(null);

  function startAsyncAction(actionType = '', payload = null) {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch (_) {}
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const token = ++requestTokenRef.current;
    if (actionType) {
      setLastFailedAction({ type: actionType, payload });
    }
    return { token, signal: controller.signal };
  }

  function cancelAllPendingActions() {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch (_) {}
      abortControllerRef.current = null;
    }
    return ++requestTokenRef.current;
  }

  const [isDesktop, setIsDesktop] = useState(false);

  // Synchronize responsive layout on window resize (F8)
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(typeof window !== 'undefined' && window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize session on mount
  useEffect(() => {
    const mock = isMockMode();
    setIsMock(mock);
    initSession();
  }, []);

  function clearAllErrors() {
    setLastFailedAction(null);
    setError(null);
    setConflictError(null);
    setNoCandidatesError(null);
    setAuthError(null);
    setRateLimitError(null);
    setProviderUnavailableError(null);
  }

  function handleApiError(err, actionContext = null) {
    if (actionContext) {
      setLastFailedAction(actionContext);
    }
    if (err instanceof ApiError) {
      if (err.status === 409) {
        if (err.code === 'no_candidates') {
          setNoCandidatesError(err);
        } else {
          setConflictError(err);
        }
      } else if (err.status === 401 || err.status === 403 || err.status === 410) {
        setAuthError(err);
      } else if (err.status === 429) {
        setRateLimitError(err);
      } else if (err.status === 503) {
        setProviderUnavailableError(err);
      } else {
        setError(err);
      }
    } else {
      setError(err);
    }
  }

  function handleRetry() {
    if (!lastFailedAction) {
      handlePlanTour();
      return;
    }
    const { type, payload } = lastFailedAction;
    if (type === 'plan') {
      handlePlanTour(payload);
    } else if (type === 'message') {
      handleSendMessage(payload);
    } else if (type === 'preferences') {
      handleUpdatePreferences(payload);
    } else if (type === 'replace') {
      handleConfirmReplace();
    } else if (type === 'init') {
      initSession();
    } else {
      handlePlanTour();
    }
  }

  function applySessionWrapper(res) {
    if (!res) return;
    if (res.revision !== undefined) setRevision(res.revision);
    if (res.preferences) setPreferences(res.preferences);
    if (res.missing_slots !== undefined) setMissingSlots(res.missing_slots || []);
    if (res.questions !== undefined) setQuestions(res.questions || []);
    if (res.notes !== undefined) setNotes(res.notes || []);
    if (res.tour !== undefined) setTour(res.tour);
    if (res.dataset_source) setDatasetSource(res.dataset_source);
    if (res.dataset_version) setDatasetVersion(res.dataset_version);
  }

  // Atomically create or reset session, clearing all session-owned state
  async function initSession() {
    const token = cancelAllPendingActions();
    setBusy(true);
    clearAllErrors();
    // Synchronously reset all session-owned state
    setSessionId(null);
    setSessionToken('');
    setRevision(0);
    setPreferences(DEFAULT_PREFERENCES);
    setTour(null);
    setMessages([]);
    setMissingSlots([]);
    setQuestions([]);
    setNotes([]);
    setHighlightedStopId(null);
    setIsReplaceModalOpen(false);
    setReplaceTargetStop(null);
    setReplaceResultDiff(null);

    try {
      const session = await createSession();
      if (token !== requestTokenRef.current) return;
      setSessionId(session.session_id);
      setSessionToken(session.token);
      setRevision(session.revision);

      try {
        const health = await getHealth();
        if (token !== requestTokenRef.current) return;
        setHealth(health);
        if (health.dataset_source) setDatasetSource(health.dataset_source);
        if (health.dataset_version) setDatasetVersion(health.dataset_version);
      } catch (_) {}

      if (token !== requestTokenRef.current) return;
      setMessages([
        {
          role: 'assistant',
          text: 'Xin chào! Tôi là trợ lý AI FoodTour Hà Nội. Bạn muốn tìm hành trình ẩm thực như thế nào (khu vực Phố Cổ, thời gian, ngân sách, món yêu thích)?'
        }
      ]);
    } catch (err) {
      if (token !== requestTokenRef.current) return;
      if (err.name === 'AbortError') return;
      handleApiError(err, { type: 'init' });
    } finally {
      if (token === requestTokenRef.current) {
        setBusy(false);
      }
    }
  }

  // Handle natural language chat message
  async function handleSendMessage(text) {
    if (!sessionId || busy) return;
    const { token, signal } = startAsyncAction('message', text);
    setBusy(true);
    clearAllErrors();

    // Add user message to UI immediately
    const userMsg = { role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await sendMessage(sessionId, text, sessionToken, { signal });
      if (token !== requestTokenRef.current) return;
      applySessionWrapper(res);

      let assistantText = 'Đã cập nhật thông tin chuyến đi của bạn.';
      if (res.missing_slots && res.missing_slots.length > 0) {
        assistantText = 'Tôi đã ghi nhận các thông tin trên. Tuy nhiên còn thiếu một số thông tin bắt buộc để tối ưu tour:';
      } else if (res.tour) {
        assistantText = res.tour.explanation || 'Đã tạo xong hành trình ẩm thực tối ưu dựa trên sở thích của bạn!';
        if (!isDesktop) {
          setActiveTab('timeline');
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: assistantText,
          extracted: res.preferences,
          extractionSource: res.extraction_source || null
        }
      ]);
    } catch (err) {
      if (token !== requestTokenRef.current) return;
      if (err.name === 'AbortError') return;
      handleApiError(err, { type: 'message', payload: text });
    } finally {
      if (token === requestTokenRef.current) {
        setBusy(false);
      }
    }
  }

  // Quick answer helper for chat questions
  function handleQuickAnswer(slot, val) {
    if (slot === 'duration_min') {
      handleSendMessage(`Thời lượng chuyến đi là ${val} phút`);
    } else if (slot === 'budget_scope') {
      // Coordinator item (a) / F10:
      // Perform full merged structured update for budget_scope so the slot is directly resolved!
      const text = val === 'per_person' ? 'Ngân sách tính cho mỗi người' : 'Ngân sách tính cho cả nhóm';
      setMessages((prev) => [...prev, { role: 'user', text }]);
      handleUpdatePreferences({ budget_scope: val });
    } else if (slot === 'origin') {
      handleSendMessage(val === 'hoankiem' ? 'Bắt đầu từ Hồ Hoàn Kiếm' : 'Bắt đầu từ Phố Cổ');
    }
  }

  // Handle structured preferences update (PUT)
  // F4: Always send full merged preferences so all slots are preserved
  async function handleUpdatePreferences(newPrefs) {
    if (!sessionId || busy) return;
    const { token, signal } = startAsyncAction('preferences', newPrefs);
    setBusy(true);
    clearAllErrors();

    try {
      const merged = { ...preferences, ...newPrefs };
      const res = await updatePreferences(sessionId, revision, merged, sessionToken, { signal });
      if (token !== requestTokenRef.current) return;
      applySessionWrapper(res);
    } catch (err) {
      if (token !== requestTokenRef.current) return;
      if (err.name === 'AbortError') return;
      handleApiError(err, { type: 'preferences', payload: newPrefs });
    } finally {
      if (token === requestTokenRef.current) {
        setBusy(false);
      }
    }
  }

  // Handle plan tour (POST /v1/sessions/{id}/tour)
  // F4: Merge full preferences before planning if new preferences are provided
  async function handlePlanTour(newPrefs = null) {
    if (!sessionId || busy) return;
    const { token, signal } = startAsyncAction('plan', newPrefs);
    setBusy(true);
    clearAllErrors();

    try {
      let baseRev = revision;
      if (newPrefs) {
        const merged = { ...preferences, ...newPrefs };
        const updateRes = await updatePreferences(sessionId, revision, merged, sessionToken, { signal });
        if (token !== requestTokenRef.current) return;
        applySessionWrapper(updateRes);
        baseRev = updateRes.revision;
      }

      const tourRes = await planTour(sessionId, baseRev, sessionToken, { signal });
      if (token !== requestTokenRef.current) return;
      applySessionWrapper(tourRes);
      if (!isDesktop) {
        setActiveTab('timeline');
      }
    } catch (err) {
      if (token !== requestTokenRef.current) return;
      if (err.name === 'AbortError') return;
      handleApiError(err, { type: 'plan', payload: newPrefs });
    } finally {
      if (token === requestTokenRef.current) {
        setBusy(false);
      }
    }
  }

  // F2: Initiate replace one stop flow (No client candidate preview!)
  function handleInitiateReplace(stop) {
    if (busy) return;
    setReplaceTargetStop(stop);
    setReplaceResultDiff(null);
    setIsReplaceModalOpen(true);
  }

  // F2: Confirm replace one stop (Server-selected replacement)
  async function handleConfirmReplace() {
    if (!replaceTargetStop || !sessionId || busy) return;
    const { token, signal } = startAsyncAction('replace', replaceTargetStop);
    setBusy(true);
    clearAllErrors();

    const oldStop = replaceTargetStop;
    try {
      const updatedRes = await replaceTourStop(
        sessionId,
        revision,
        oldStop.venue_id,
        sessionToken,
        { signal }
      );
      if (token !== requestTokenRef.current) return;
      applySessionWrapper(updatedRes);
      const newStop = updatedRes.tour?.stops?.find((s) => s.order === oldStop.order) || null;
      setReplaceResultDiff({ oldStop, newStop });
    } catch (err) {
      if (token !== requestTokenRef.current) return;
      if (err.name === 'AbortError') return;
      handleApiError(err, { type: 'replace', payload: oldStop });
    } finally {
      if (token === requestTokenRef.current) {
        setBusy(false);
      }
    }
  }

  function handleCloseReplaceModal() {
    if (busy) return;
    setIsReplaceModalOpen(false);
    setReplaceTargetStop(null);
    setReplaceResultDiff(null);
  }

  const handleToggleMockMode = () => {
    if (busy) return;
    const nextMode = !isMock;
    setIsMock(nextMode);
    setRuntimeMockMode(nextMode);
    initSession();
  };

  const stops = tour?.stops || [];
  const lockedVenueIds = (stops.filter((s) => s.venue_id !== replaceTargetStop?.venue_id) || []).map(
    (s) => s.name || s.venue_id
  );

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '12px' }}>
      {/* Top Header */}
      <header
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '16px 20px',
          marginBottom: 16,
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🍜</span>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--accent-primary)' }}>
              AI FoodTour Hà Nội
            </h1>
            <span
              style={{
                fontSize: 11,
                background: '#e0f2fe',
                color: '#0284c7',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 12
              }}
            >
              CONTRACT V1.4
            </span>
            {health && (
              <span data-provider-status style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                AI: {health.llm_provider === 'gemini' ? `Gemini (${health.llm_model || 'model?'})` : health.llm_provider === 'off' ? 'tắt' : 'bộ luật cục bộ'}
                {' · '}Tuyến: {health.routing_provider === 'ors' ? 'openrouteservice' : health.routing_provider === 'osrm' ? 'OSRM' : 'ước tính chim bay'}
                {health.routing_provider !== 'estimate' && health.routing !== 'provider_route' ? ' (chưa phản hồi)' : ''}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Trợ lý lập lịch trình ẩm thực Phố Cổ minh bạch bằng chứng · Đi bộ tối ưu
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={initSession}
            disabled={busy}
            style={{
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--border-color)',
              background: '#fff',
              color: 'var(--text-secondary)',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontWeight: 600
            }}
            title="Khởi tạo phiên làm việc mới"
          >
            🔄 Tạo phiên mới
          </button>

          <span
            style={{
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 8,
              background: preferences.mode === 'strict' ? '#e8f5e9' : '#fff3e0',
              color: preferences.mode === 'strict' ? '#2e7d32' : '#e65100',
              fontWeight: 700
            }}
          >
            {preferences.mode === 'strict' ? 'Chế độ Nghiêm ngặt' : 'Khám phá có điều kiện'}
          </span>
        </div>
      </header>

      {/* Prominent Provenance / Mock Data Banner */}
      <MockBanner
        isMock={isMock}
        datasetSource={datasetSource}
        datasetVersion={datasetVersion}
        onToggleMode={handleToggleMockMode}
        busy={busy}
      />

      {/* Revision Conflict Alert (409) */}
      <RevisionConflictAlert
        conflictError={conflictError}
        onReloadSession={initSession}
        onReplan={() => { setConflictError(null); handlePlanTour(); }}
        onDismiss={() => setConflictError(null)}
      />

      {/* 409 No Candidates (Replace) Alert */}
      {noCandidatesError && (
        <div
          role="alert"
          style={{
            padding: '14px 18px',
            background: '#fffbe6',
            border: '1px solid #ffe58f',
            borderLeft: '5px solid #faad14',
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <strong style={{ color: '#d46b08' }}>⚠️ Không còn quán thay thế phù hợp (409 No Candidates):</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#595959' }}>
              {noCandidatesError.message || 'Không tìm được quán thay thế nào thỏa mãn ràng buộc trong khu vực. Lịch trình hiện tại vẫn được giữ nguyên.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNoCandidatesError(null)}
            aria-label="Đóng cảnh báo"
            style={{ background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', color: '#8c8c8c' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 401 / 403 / 410 Auth / Session Expired Alert */}
      {authError && (
        <div
          role="alert"
          style={{
            padding: '14px 18px',
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            borderLeft: '5px solid #ff4d4f',
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <strong style={{ color: '#cf1322' }}>🔒 Lỗi xác thực hoặc phiên hết hạn (401/403/410):</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#434343' }}>
              {authError.message || 'Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng tạo phiên làm việc mới.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setAuthError(null); initSession(); }}
            disabled={busy}
            style={{ padding: '6px 14px', background: '#ff4d4f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}
          >
            Tạo phiên mới
          </button>
        </div>
      )}

      {/* 429 Rate Limited Alert */}
      {rateLimitError && (
        <div
          role="alert"
          style={{
            padding: '14px 18px',
            background: '#fff7e6',
            border: '1px solid #ffd591',
            borderLeft: '5px solid #fa8c16',
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <strong style={{ color: '#d46b08' }}>⏳ Đã đạt giới hạn yêu cầu (429 Rate Limited):</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#595959' }}>
              {rateLimitError.message || 'Hệ thống đang tiếp nhận nhiều yêu cầu. Vui lòng đợi trong giây lát rồi thử lại.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRateLimitError(null)}
            aria-label="Đóng cảnh báo"
            style={{ background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', color: '#8c8c8c' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 503 Provider Unavailable Alert */}
      {providerUnavailableError && (
        <div
          role="alert"
          style={{
            padding: '14px 18px',
            background: '#f6ffed',
            border: '1px solid #b7eb8f',
            borderLeft: '5px solid #52c41a',
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <strong style={{ color: '#237804' }}>ℹ️ Dịch vụ tạm thời không khả dụng (503 Provider Unavailable):</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#389e0d' }}>
              {providerUnavailableError.message || 'Dịch vụ xử lý ngôn ngữ tự nhiên đang tạm gián đoạn. Bạn có thể sử dụng trực tiếp tab "Tùy chọn" để chọn địa điểm và lập lịch.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setProviderUnavailableError(null); setActiveTab('preferences'); }}
            style={{ padding: '6px 14px', background: '#52c41a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Mở tab Tùy chọn
          </button>
        </div>
      )}

      {/* General / Validation Error Banner with targeted Retry */}
      {error && !conflictError && !noCandidatesError && !authError && !rateLimitError && !providerUnavailableError && (
        <div
          role="alert"
          style={{
            padding: '14px 18px',
            background: '#ffebee',
            border: '1px solid #ffcdd2',
            color: '#c62828',
            borderRadius: 12,
            marginBottom: 16,
            fontSize: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <strong>⚠️ Lỗi:</strong> {error.message || 'Không thể xử lý yêu cầu.'}
          </div>
          <button
            type="button"
            onClick={handleRetry}
            disabled={busy}
            style={{
              padding: '6px 12px',
              background: '#c62828',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Notes / Rejected Fields Notice from Extractor */}
      {notes.length > 0 && (
        <div
          role="note"
          style={{
            background: '#f0f5ff',
            border: '1px solid #adc6ff',
            borderLeft: '5px solid #2f54eb',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: 13,
            color: '#1d39c4'
          }}
        >
          <strong>💬 Lưu ý từ hệ thống trích xuất yêu cầu:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
            {notes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Mobile Tab Navigation Bar (<= 900px) */}
      <nav
        style={{
          display: isDesktop ? 'none' : 'flex',
          background: '#fff',
          borderRadius: 12,
          padding: 4,
          marginBottom: 16,
          boxShadow: 'var(--shadow-sm)',
          gap: 4
        }}
        aria-label="Thanh chuyển đổi giao diện mobile"
      >
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          style={{
            flex: 1,
            minHeight: 44,
            padding: '8px 10px',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13,
            background: activeTab === 'chat' ? 'var(--accent-primary)' : 'transparent',
            color: activeTab === 'chat' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          💬 Chat
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('preferences')}
          style={{
            flex: 1,
            minHeight: 44,
            padding: '8px 10px',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13,
            background: activeTab === 'preferences' ? 'var(--accent-primary)' : 'transparent',
            color: activeTab === 'preferences' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          ⚙️ Tùy chọn
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('timeline')}
          style={{
            flex: 1,
            minHeight: 44,
            padding: '8px 10px',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13,
            background: activeTab === 'timeline' ? 'var(--accent-primary)' : 'transparent',
            color: activeTab === 'timeline' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          📍 Lịch trình {stops.length > 0 ? `(${stops.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('map')}
          style={{
            flex: 1,
            minHeight: 44,
            padding: '8px 10px',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13,
            background: activeTab === 'map' ? 'var(--accent-primary)' : 'transparent',
            color: activeTab === 'map' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          🗺️ Bản đồ
        </button>
      </nav>

      {/* Main Responsive Grid Layout - minmax fits 320/390px screens without overflow */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          gap: 20,
          alignItems: 'start'
        }}
      >
        {/* Left Column: Chat, Preferences, Tour Status & Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Chat Panel */}
          <div
            style={{
              display: activeTab === 'chat' || isDesktop ? 'block' : 'none'
            }}
          >
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              busy={busy}
              missingSlots={missingSlots}
              questions={questions}
              onQuickAnswer={handleQuickAnswer}
              llmProvider={health?.llm_provider || 'rules'}
            />
          </div>

          {/* Preferences Panel */}
          <div
            style={{
              display: activeTab === 'preferences' || isDesktop ? 'block' : 'none'
            }}
          >
            <PreferencesPanel
              preferences={preferences}
              revision={revision}
              onUpdatePreferences={handleUpdatePreferences}
              onPlanTour={handlePlanTour}
              busy={busy}
              isMock={isMock}
            />
          </div>

          {/* Tour Status & Timeline */}
          <div
            style={{
              display: activeTab === 'timeline' || isDesktop ? 'block' : 'none'
            }}
          >
            {/* Pool truncated assumption banner */}
            {tour && tour.assumptions?.pool_truncated && (
              <div
                role="status"
                style={{
                  background: '#fffbe6',
                  border: '1px solid #ffe58f',
                  borderLeft: '5px solid #faad14',
                  borderRadius: 10,
                  padding: '12px 16px',
                  marginBottom: 16,
                  fontSize: 13,
                  color: '#873800',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <span>⚠️</span>
                <span>
                  <strong>Giới hạn tập tìm kiếm:</strong> Đang xét {tour.assumptions.search_pool} quán gần nhất (trên tổng số {tour.assumptions.eligible_total} quán phù hợp) để đảm bảo thời gian phản hồi.
                </span>
              </div>
            )}

            {tour && (
              <TourStatusBanner
                tour={tour}
                onSwitchToExplore={() => handlePlanTour({ ...preferences, mode: 'explore' })}
                onAdjustPreferences={() => setActiveTab('preferences')}
              />
            )}

            {/* Focus fallback target when a replaced stop's control disappears (keyboard users keep context). */}
            <div data-focus-fallback tabIndex={-1} aria-label="Lịch trình" style={{ outline: 'none' }}>
            <TourTimeline
              tour={tour}
              highlightedStopId={highlightedStopId}
              onSelectStop={(id) => setHighlightedStopId(id)}
              onInitiateReplace={handleInitiateReplace}
              busy={busy}
            />
            </div>

            {!tour && (
              <div
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  padding: 32,
                  textAlign: 'center',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <span style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>🧭</span>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
                  Chưa có lịch trình được tạo
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 360, margin: '0 auto 16px' }}>
                  Hãy trò chuyện với AI hoặc chọn địa điểm bắt đầu từ tab Tùy chọn để tạo hành trình ẩm thực tối ưu.
                </p>
                <button
                  type="button"
                  onClick={() => handlePlanTour()}
                  disabled={busy}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: busy ? '#aaa' : 'var(--accent-primary)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  {busy ? 'Đang tạo…' : 'Tạo lịch trình ngay'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Interactive Map & Highlights */}
        <div
          style={{
            display: activeTab === 'map' || isDesktop ? 'block' : 'none',
            position: isDesktop ? 'sticky' : 'static',
            top: 20
          }}
        >
          <MapView
            origin={preferences.origin}
            stops={stops}
            highlightedStopId={highlightedStopId}
            onSelectStop={(id) => setHighlightedStopId(id)}
            legSource={tour?.totals?.leg_source || 'straight_line_estimate'}
            routingProvider={health?.routing_provider || 'estimate'}
          />

          {/* Quick highlight venue preview card */}
          {highlightedStopId && (
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: 14,
                boxShadow: 'var(--shadow-sm)',
                border: '1px solid var(--accent-primary)',
                fontSize: 13
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 4 }}>
                📍 Điểm đang chọn trên bản đồ:
              </div>
              {(() => {
                const s = stops.find((stop) => stop.venue_id === highlightedStopId);
                if (!s) return <div>Không tìm thấy thông tin quán.</div>;
                return (
                  <div>
                    <strong style={{ fontSize: 14 }}>{s.name}</strong>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 6px' }}>
                      {s.address} · {s.district}
                    </p>
                    <div style={{ fontSize: 12 }}>
                      Giờ đến: <strong>{s.arrive}</strong> → Rời đi: <strong>{s.depart}</strong>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Replace Stop Diff Modal (F2: Neutral confirmation before replace, server diff after replace) */}
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
