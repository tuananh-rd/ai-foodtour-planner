'use client';

import { useState, useEffect } from 'react';
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
  getVenues,
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
  const [notes, setNotes] = useState([]);

  // Chat & Questions
  const [messages, setMessages] = useState([]);
  const [missingSlots, setMissingSlots] = useState([]);
  const [questions, setQuestions] = useState([]);

  // Tour data
  const [tour, setTour] = useState(null);
  const [highlightedStopId, setHighlightedStopId] = useState(null);

  // Replace modal state
  const [replaceTargetStop, setReplaceTargetStop] = useState(null);
  const [replaceCandidate, setReplaceCandidate] = useState(null);
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);

  // Async UI & error states
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [conflictError, setConflictError] = useState(null);
  const [noCandidatesError, setNoCandidatesError] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [rateLimitError, setRateLimitError] = useState(null);
  const [providerUnavailableError, setProviderUnavailableError] = useState(null);

  // Initialize session on mount
  useEffect(() => {
    const mock = isMockMode();
    setIsMock(mock);
    initSession();
  }, []);

  function clearAllErrors() {
    setError(null);
    setConflictError(null);
    setNoCandidatesError(null);
    setAuthError(null);
    setRateLimitError(null);
    setProviderUnavailableError(null);
  }

  function handleApiError(err) {
    if (err instanceof ApiError) {
      if (err.status === 409) {
        if (err.code === 'no_candidates') {
          setNoCandidatesError(err);
        } else {
          setConflictError(err);
        }
      } else if (err.status === 401 || err.status === 403) {
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

  async function initSession() {
    try {
      setBusy(true);
      clearAllErrors();
      setTour(null); // Reset tour on new session / mode toggle
      setNotes([]);
      setMissingSlots([]);
      setQuestions([]);
      setHighlightedStopId(null);

      const session = await createSession();
      setSessionId(session.session_id);
      setSessionToken(session.token);
      setRevision(session.revision);

      try {
        const health = await getHealth();
        if (health.dataset_source) setDatasetSource(health.dataset_source);
        if (health.dataset_version) setDatasetVersion(health.dataset_version);
      } catch (_) {}

      // Add welcoming assistant message
      setMessages([
        {
          role: 'assistant',
          text: 'Xin chào! Tôi là trợ lý AI FoodTour Hà Nội. Bạn muốn tìm hành trình ẩm thực như thế nào (khu vực Phố Cổ, thời gian, ngân sách, món yêu thích)?'
        }
      ]);
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  }

  // Handle natural language chat message
  async function handleSendMessage(text) {
    if (!sessionId || busy) return;
    setBusy(true);
    clearAllErrors();

    // Add user message to UI immediately
    const userMsg = { role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await sendMessage(sessionId, text, sessionToken);
      applySessionWrapper(res);

      let assistantText = 'Đã cập nhật thông tin chuyến đi của bạn.';
      if (res.missing_slots && res.missing_slots.length > 0) {
        assistantText = 'Tôi đã ghi nhận các thông tin trên. Tuy nhiên còn thiếu một số thông tin bắt buộc để tối ưu tour:';
      } else if (res.tour) {
        assistantText = res.tour.explanation || 'Đã tạo xong hành trình ẩm thực tối ưu dựa trên sở thích của bạn!';
        if (typeof window !== 'undefined' && window.innerWidth < 900) {
          setActiveTab('timeline');
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: assistantText,
          extracted: res.preferences
        }
      ]);
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  }

  // Quick answer helper for chat questions
  function handleQuickAnswer(slot, val) {
    if (slot === 'duration_min') {
      handleSendMessage(`Thời lượng chuyến đi là ${val} phút`);
    } else if (slot === 'budget_scope') {
      handleSendMessage(val === 'per_person' ? 'Ngân sách tính cho mỗi người' : 'Ngân sách tính cho cả nhóm');
    } else if (slot === 'origin') {
      handleSendMessage(val === 'hoankiem' ? 'Bắt đầu từ Hồ Hoàn Kiếm' : 'Bắt đầu từ Phố Cổ');
    }
  }

  // Handle structured preferences update (PUT)
  async function handleUpdatePreferences(newPrefs) {
    if (!sessionId || busy) return;
    setBusy(true);
    clearAllErrors();

    try {
      const res = await updatePreferences(sessionId, revision, newPrefs, sessionToken);
      applySessionWrapper(res);
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  }

  // Handle plan tour (POST /v1/sessions/{id}/tour)
  async function handlePlanTour(newPrefs = null) {
    if (!sessionId || busy) return;
    setBusy(true);
    clearAllErrors();

    try {
      let baseRev = revision;
      if (newPrefs) {
        const updateRes = await updatePreferences(sessionId, revision, newPrefs, sessionToken);
        applySessionWrapper(updateRes);
        baseRev = updateRes.revision;
      }

      const tourRes = await planTour(sessionId, baseRev, sessionToken);
      applySessionWrapper(tourRes);
      if (typeof window !== 'undefined' && window.innerWidth < 900) {
        setActiveTab('timeline');
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  }

  // Initiate replace one stop flow
  async function handleInitiateReplace(stop) {
    setReplaceTargetStop(stop);
    try {
      const venuesRes = await getVenues({ limit: 10 });
      const list = venuesRes.items || venuesRes.venues || [];
      const currentIds = (tour?.stops || []).map((s) => s.venue_id);
      const candidate = list.find(
        (v) => !currentIds.includes(v.id) && !v.online_only && v.geo_ok
      );
      setReplaceCandidate(candidate || null);
      setIsReplaceModalOpen(true);
    } catch (err) {
      handleApiError(err);
    }
  }

  // Confirm replace one stop
  async function handleConfirmReplace() {
    if (!replaceTargetStop || !sessionId || busy) return;
    setBusy(true);
    clearAllErrors();

    try {
      const updatedRes = await replaceTourStop(
        sessionId,
        revision,
        replaceTargetStop.venue_id,
        sessionToken
      );
      applySessionWrapper(updatedRes);
      setIsReplaceModalOpen(false);
      setReplaceTargetStop(null);
      setReplaceCandidate(null);
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  }

  const handleToggleMockMode = () => {
    const nextMode = !isMock;
    setIsMock(nextMode);
    setRuntimeMockMode(nextMode);
    setTour(null);
    initSession();
  };

  const stops = tour?.stops || [];
  const lockedVenueIds = (stops.filter((s) => s.venue_id !== replaceTargetStop?.venue_id) || []).map(
    (s) => s.name || s.venue_id
  );

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '16px' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>🍜</span>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              AI FoodTour Planner
            </h1>
            <span
              style={{
                fontSize: 11,
                background: '#e8f5e9',
                color: '#2e7d32',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 12
              }}
            >
              HÀ NỘI · PILOT
            </span>
            <span
              style={{
                fontSize: 11,
                background: '#ede7f6',
                color: '#512da8',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 12
              }}
            >
              CONTRACT V1.1
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Trợ lý lập lịch trình ẩm thực Phố Cổ minh bạch bằng chứng · Đi bộ tối ưu
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={initSession}
            style={{
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--border-color)',
              background: '#fff',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
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
      />

      {/* Revision Conflict Alert (409) */}
      <RevisionConflictAlert
        conflictError={conflictError}
        onReloadSession={initSession}
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
            style={{ background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', color: '#8c8c8c' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 401 / 403 Unauthorized Session Alert */}
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
            <strong style={{ color: '#cf1322' }}>🔒 Lỗi xác thực phiên (401/403):</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#434343' }}>
              {authError.message || 'Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng tạo phiên làm việc mới.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setAuthError(null); initSession(); }}
            style={{ padding: '6px 14px', background: '#ff4d4f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
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
            <strong style={{ color: '#d46b08' }}>⏳ Đã vượt quá giới hạn yêu cầu (429 Rate Limited):</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#595959' }}>
              {rateLimitError.message || 'Hệ thống đang bận. Vui lòng thử lại sau giây lát.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRateLimitError(null)}
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

      {/* General / Validation Error Banner */}
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
            <strong>⚠️ Lỗi hệ thống:</strong> {error.message || 'Không thể xử lý yêu cầu.'}
          </div>
          <button
            type="button"
            onClick={() => handlePlanTour()}
            style={{
              padding: '6px 12px',
              background: '#c62828',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
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
          display: 'flex',
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

      {/* Main Responsive Grid Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 20,
          alignItems: 'start'
        }}
      >
        {/* Left Column: Chat, Preferences, Tour Status & Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Chat Panel */}
          <div
            style={{
              display: activeTab === 'chat' || (typeof window !== 'undefined' && window.innerWidth >= 1024) ? 'block' : 'none'
            }}
          >
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              busy={busy}
              missingSlots={missingSlots}
              questions={questions}
              onQuickAnswer={handleQuickAnswer}
              isMock={isMock}
            />
          </div>

          {/* Structured Preferences Panel */}
          <div
            style={{
              display: activeTab === 'preferences' || (typeof window !== 'undefined' && window.innerWidth >= 1024) ? 'block' : 'none'
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

          {/* Tour Status Banner & Timeline */}
          <div
            style={{
              display: activeTab === 'timeline' || (typeof window !== 'undefined' && window.innerWidth >= 1024) ? 'block' : 'none'
            }}
          >
            {/* Pool truncated assumption indicator */}
            {tour?.assumptions?.pool_truncated && (
              <div
                style={{
                  background: '#fffbe6',
                  border: '1px solid #ffe58f',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginBottom: 14,
                  fontSize: 13,
                  color: '#d46b08',
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
                onSwitchToExplore={() => handlePlanTour({ mode: 'explore' })}
                onAdjustPreferences={() => setActiveTab('preferences')}
              />
            )}

            <TourTimeline
              tour={tour}
              highlightedStopId={highlightedStopId}
              onSelectStop={(id) => setHighlightedStopId(id)}
              onInitiateReplace={handleInitiateReplace}
              busy={busy}
            />

            {!tour && (
              <div
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  padding: 30,
                  textAlign: 'center',
                  boxShadow: 'var(--shadow-sm)',
                  color: 'var(--text-secondary)'
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 8 }}>🥣</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Chưa có lịch trình nào được lập
                </h3>
                <p style={{ fontSize: 13, maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>
                  Hãy gửi yêu cầu trong khung <strong>Chat</strong> hoặc bấm <strong>Lập lịch trình</strong> trong mục <strong>Tùy chọn</strong> để nhận tour 3–5 quán tối ưu.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Interactive Map & Highlights */}
        <div
          style={{
            display: activeTab === 'map' || (typeof window !== 'undefined' && window.innerWidth >= 1024) ? 'block' : 'none',
            position: typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'sticky' : 'static',
            top: 20
          }}
        >
          <MapView
            origin={preferences.origin}
            stops={stops}
            highlightedStopId={highlightedStopId}
            onSelectStop={(id) => setHighlightedStopId(id)}
            legSource={tour?.totals?.leg_source || 'straight_line_estimate'}
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

      {/* Replace Stop Diff Modal */}
      <ReplaceDiffModal
        isOpen={isReplaceModalOpen}
        oldStop={replaceTargetStop}
        candidate={replaceCandidate}
        lockedStops={lockedVenueIds}
        onConfirm={handleConfirmReplace}
        onCancel={() => {
          setIsReplaceModalOpen(false);
          setReplaceTargetStop(null);
          setReplaceCandidate(null);
        }}
        busy={busy}
      />
    </div>
  );
}
