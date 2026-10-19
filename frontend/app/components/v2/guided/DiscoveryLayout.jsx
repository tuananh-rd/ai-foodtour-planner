'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import GuidedTimeline from './GuidedTimeline';
import PilotMap from './PilotMap';
import {
  getDiscoveryAssistant,
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
  DiscoveryApiError
} from '../../../../lib/discoveryApi';
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
  profile: {
    area: 'Hoàn Kiếm',
    origin: null,
    party_size: 2,
    budget_vnd: null,
    budget_scope: null,
    start_time: '18:30',
    end_time: null,
    duration_min: 120,
    vehicle: 'walk',
    tastes: [],
    exclusions: [],
    allergies: [],
    max_leg_min: 20
  },
  results: [],
  selection: [],
  comparison: null,
  confirmation: null,
  messages: [],
  tour: null,
  source: { dataset_source: 'synthetic', dataset_version: 'pilot-1' },
  provider: { mode: 'rules', calls: 0 },
  diagnostics: { tool_calls: 0, elapsed_ms: 0, weather: 'unavailable' }
};

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

  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('');
  const [inputText, setInputText] = useState('');
  const [activeMobileTab, setActiveMobileTab] = useState('chat'); // 'chat' | 'tour' | 'map'
  const [viewMode, setViewMode] = useState('schematic'); // 'schematic' | 'map'
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [profileForm, setProfileForm] = useState(view.profile || {});
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [detailVenue, setDetailVenue] = useState(null);
  const [errorBanner, setErrorBanner] = useState(null);

  const chatScrollRef = useRef(null);
  const inputRef = useRef(null);

  // Sync profile form when backend view profile updates
  useEffect(() => {
    if (view.profile) {
      setProfileForm(view.profile);
    }
  }, [view.profile]);

  // Initial load or session change
  const fetchAssistantView = useCallback(async (sid, token, keepBanner = false) => {
    if (!sid) return;
    setBusy(true);
    setBusyMessage('Đang tải dữ liệu trợ lý…');
    if (!keepBanner) {
      setErrorBanner(null);
    }
    try {
      const data = await getDiscoveryAssistant(sid, token);
      if (data) {
        setView(data);
      }
    } catch (err) {
      if (err instanceof DiscoveryApiError && err.status === 404) {
        // Fresh session without saved state, retain default
        setView((prev) => ({ ...prev, session_id: sid, revision: parentRevision || 0 }));
      } else {
        setErrorBanner(err.message || 'Không thể tải dữ liệu phiên. Vui lòng thử lại.');
      }
    } finally {
      setBusy(false);
      setBusyMessage('');
    }
  }, [parentRevision]);

  useEffect(() => {
    if (sessionId) {
      fetchAssistantView(sessionId, sessionToken);
    }
  }, [sessionId, sessionToken, fetchAssistantView]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [view.messages, view.results, view.comparison, view.confirmation, busy]);

  // Handle 409 conflict: refresh view WITHOUT auto-replaying mutation
  const handle409Conflict = async (err) => {
    setErrorBanner('Phiên đã được cập nhật từ phía máy chủ (409 Conflict). Đã đồng bộ lại trạng thái mới nhất.');
    await fetchAssistantView(sessionId, sessionToken, true);
  };

  // Send natural text message
  const handleSendMessage = async (customText = null) => {
    const textToSend = customText !== null ? customText : inputText;
    if (!textToSend || !textToSend.trim() || busy) return;

    setBusy(true);
    setBusyMessage('Đang xử lý yêu cầu…');
    setErrorBanner(null);
    setInputText('');

    try {
      const updatedView = await sendDiscoveryMessage(
        sessionId,
        view.revision,
        textToSend,
        sessionToken
      );
      setView(updatedView);
    } catch (err) {
      if (err.status === 409) {
        await handle409Conflict(err);
      } else {
        setErrorBanner(err.message || 'Lỗi khi gửi tin nhắn.');
        // Restore input if message failed
        if (customText === null) {
          setInputText(textToSend);
        }
      }
    } finally {
      setBusy(false);
      setBusyMessage('');
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  // Dispatch a discovery action
  const handleDispatchAction = async (action, loadingMsg = 'Đang thực hiện…') => {
    if (busy) return;
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
      setView(updatedView);
    } catch (err) {
      if (err.status === 409) {
        await handle409Conflict(err);
      } else {
        setErrorBanner(err.message || 'Lỗi khi thực hiện thao tác.');
      }
    } finally {
      setBusy(false);
      setBusyMessage('');
    }
  };

  // Venue Selection Handlers
  const handleAddVenue = (venue) => {
    const action = addSelectionAction(view.selection_version, [venue.id]);
    handleDispatchAction(action, `Đang thêm quán ${venue.name}…`);
  };

  const handleRemoveVenue = (venueId) => {
    const action = removeSelectionAction(view.selection_version, [venueId]);
    handleDispatchAction(action, 'Đang xoá quán khỏi danh sách…');
  };

  const handleToggleLockVenue = (venue) => {
    const isLocked = Boolean(venue.locked);
    const action = isLocked
      ? unlockSelectionAction(view.selection_version, [venue.id])
      : lockSelectionAction(view.selection_version, [venue.id]);
    handleDispatchAction(action, isLocked ? 'Đang mở khoá quán…' : 'Đang khoá quán…');
  };

  // Venue Comparison Handlers
  const handleToggleCompareSelect = (venueId) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(venueId)) {
        return prev.filter((id) => id !== venueId);
      }
      if (prev.length >= 5) return prev; // max 5
      return [...prev, venueId];
    });
  };

  const handleExecuteComparison = (venueIds = null) => {
    const ids = venueIds || selectedForCompare;
    if (!ids || ids.length < 2) return;
    const action = compareRestaurantsAction(ids);
    handleDispatchAction(action, 'Đang so sánh các quán đã chọn…');
  };

  // Profile Drawer Form Save
  const handleSaveProfile = (e) => {
    e.preventDefault();
    const patch = {};
    if (profileForm.area !== undefined) patch.area = profileForm.area || null;
    if (profileForm.party_size !== undefined && profileForm.party_size !== '') {
      patch.party_size = Number(profileForm.party_size);
    }
    if (profileForm.budget_vnd !== undefined && profileForm.budget_vnd !== '') {
      patch.budget_vnd = Number(profileForm.budget_vnd);
    }
    if (profileForm.budget_scope !== undefined) patch.budget_scope = profileForm.budget_scope || null;
    if (profileForm.start_time !== undefined) patch.start_time = profileForm.start_time || null;
    if (profileForm.duration_min !== undefined && profileForm.duration_min !== '') {
      patch.duration_min = Number(profileForm.duration_min);
    }
    if (profileForm.vehicle !== undefined) patch.vehicle = profileForm.vehicle || null;
    if (profileForm.max_leg_min !== undefined && profileForm.max_leg_min !== '') {
      patch.max_leg_min = Number(profileForm.max_leg_min);
    }

    // Tastes, exclusions, allergies parse from comma-separated strings if edited as strings
    if (typeof profileForm.tastes === 'string') {
      patch.tastes = profileForm.tastes.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(profileForm.tastes)) {
      patch.tastes = profileForm.tastes;
    }

    if (typeof profileForm.allergies === 'string') {
      patch.allergies = profileForm.allergies.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(profileForm.allergies)) {
      patch.allergies = profileForm.allergies;
    }

    const action = updatePreferencesAction(patch);
    handleDispatchAction(action, 'Đang lưu tuỳ chỉnh chuyến đi…');
    setProfileDrawerOpen(false);
  };

  // Trigger Plan / Confirmation
  const handleTriggerPlan = () => {
    const action = createItineraryAction();
    handleDispatchAction(action, 'Đang chuẩn bị xác nhận lịch trình…');
  };

  // Explicit Confirm Button (Strict gate)
  const handleExplicitConfirm = (confirmationId) => {
    if (!confirmationId) return;
    const action = confirmAction(confirmationId);
    handleDispatchAction(action, 'Đang tạo lịch trình chính thức…');
  };

  // Revise Itinerary
  const handleReviseItinerary = () => {
    const action = reviseItineraryAction();
    handleDispatchAction(action, 'Đang chuẩn bị điều chỉnh…');
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

  return (
    <div className="nn-guided-root" data-testid="discovery-layout">
      {/* Editorial Header */}
      <header className="nn-header" role="banner">
        <div className="nn-header-inner">
          <div className="nn-header-brand-wrap">
            <span className="nn-brand-star" aria-hidden="true">
              <StarGlyph />
            </span>
            <div className="nn-brand-headings">
              <h1 className="nn-brand-title">MĂM MĂM</h1>
              <p className="nn-brand-sub">ẨM THỰC HÀ NỘI · KHÁM PHÁ THEO CÁCH CỦA BẠN</p>
            </div>
          </div>

          <div className="nn-header-right">
            <button
              type="button"
              data-testid="btn-toggle-profile-drawer"
              className="nn-profile-panel-toggle"
              onClick={() => setProfileDrawerOpen((prev) => !prev)}
              aria-expanded={profileDrawerOpen}
            >
              <span>⚙ Tuỳ chỉnh chuyến đi</span>
              <span>{profileDrawerOpen ? '▲' : '▼'}</span>
            </button>

            <button
              type="button"
              data-testid="reset-session-btn"
              className="nn-header-reset-btn"
              onClick={onResetSession}
              disabled={busy}
            >
              Bắt đầu lại
            </button>
          </div>
        </div>
      </header>

      {/* Collapsed Profile Drawer (Lives outside message stream) */}
      {profileDrawerOpen && (
        <div className="nn-profile-drawer" data-testid="discovery-profile-drawer">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#231815' }}>
              Tuỳ chỉnh tiêu chí chuyến đi
            </h3>
            <span style={{ fontSize: '11px', color: '#8C7872' }}>
              Phiên bản hồ sơ: #{view.profile_version}
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
                  placeholder="2"
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
                  placeholder="300000"
                />
              </div>

              <div className="nn-profile-field">
                <label htmlFor="pref-scope">Phạm vi ngân sách</label>
                <select
                  id="pref-scope"
                  value={profileForm.budget_scope || 'group'}
                  onChange={(e) => setProfileForm({ ...profileForm, budget_scope: e.target.value })}
                >
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
                  onChange={(e) => setProfileForm({ ...profileForm, start_time: e.target.value })}
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
                  placeholder="120"
                />
              </div>

              <div className="nn-profile-field">
                <label htmlFor="pref-vehicle">Phương tiện</label>
                <select
                  id="pref-vehicle"
                  value={profileForm.vehicle || 'walk'}
                  onChange={(e) => setProfileForm({ ...profileForm, vehicle: e.target.value })}
                >
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
                  placeholder="20"
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
                  placeholder="phở, chè, ốc, cà phê trứng"
                />
              </div>

              <div className="nn-profile-field">
                <label htmlFor="pref-allergies">Dị ứng / Kiêng (cách nhau dấu phẩy)</label>
                <input
                  id="pref-allergies"
                  type="text"
                  value={Array.isArray(profileForm.allergies) ? profileForm.allergies.join(', ') : (profileForm.allergies || '')}
                  onChange={(e) => setProfileForm({ ...profileForm, allergies: e.target.value })}
                  placeholder="hải sản, đậu phộng, gluten"
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
                disabled={busy}
              >
                Lưu thay đổi
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Error / Conflict Banner */}
      {errorBanner && (
        <div
          role="alert"
          style={{
            background: '#FDF2F0',
            border: '1px solid #F5C6CB',
            color: '#721C24',
            padding: '10px 16px',
            borderRadius: '10px',
            margin: '0 24px 12px 24px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => fetchAssistantView(sessionId, sessionToken)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #721C24',
              background: '#FFF',
              color: '#721C24',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Đồng bộ lại
          </button>
        </div>
      )}

      {/* Mobile Tab Navigation (390px adaptation) */}
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

      {/* Main Two-Column Layout */}
      <div className="nn-guided-body">
        <main className="nn-guided-main">
          {/* LEFT CHAT & DISCOVERY COLUMN */}
          <section
            data-testid="discovery-chat-section"
            className={`nn-chat-col${activeMobileTab !== 'chat' ? ' nn-hidden-mobile' : ''}`}
          >
            <div className="nn-chat-scroll" ref={chatScrollRef} data-testid="discovery-messages-list">
              {/* Initial Assistant Welcome */}
              <div className="nn-msg-bubble assistant">
                <p style={{ margin: 0 }}>{view.reply?.text || DEFAULT_ASSISTANT_VIEW.reply.text}</p>
                {view.reply?.question && (
                  <p style={{ margin: '6px 0 0 0', fontWeight: 600, color: '#CF542F' }}>
                    {view.reply.question}
                  </p>
                )}
              </div>

              {/* Historical Messages */}
              {Array.isArray(view.messages) && view.messages.map((m, idx) => (
                <div key={idx} className={`nn-msg-bubble ${m.role === 'user' ? 'user' : 'assistant'}`}>
                  <p style={{ margin: 0 }}>{m.text}</p>
                </div>
              ))}

              {/* Restaurant Results Cards */}
              {Array.isArray(view.results) && view.results.length > 0 && (
                <div className="nn-discovery-results">
                  <div className="nn-discovery-results-header">
                    <span>Gợi ý quán phù hợp tại {view.profile?.area || 'Hà Nội'}</span>
                    <span className="nn-results-count-badge">{view.results.length} địa điểm</span>
                  </div>

                  {view.results.map((r, idx) => {
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
                                <span style={{ fontSize: '11px', color: '#2E7D32', fontWeight: 700 }}>
                                  ✓ Đã thêm vào tour
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
                              {r.price ? (
                                <span className="nn-restaurant-meta-item" title="Khoảng giá quán">
                                  💵 {Number(r.price.min_vnd || 0).toLocaleString('vi-VN')} – {Number(r.price.max_vnd || 0).toLocaleString('vi-VN')} đ
                                  <span style={{ fontSize: '10.5px', color: '#8C7872' }}> (khoảng giá quán)</span>
                                </span>
                              ) : (
                                <span className="nn-restaurant-meta-item" style={{ color: '#8C7872' }}>
                                  💵 Giá: Chưa xác minh
                                </span>
                              )}

                              {r.hours ? (
                                <span className="nn-restaurant-meta-item">
                                  🕒 {r.hours.display || 'Giờ mở cửa theo nguồn'}
                                </span>
                              ) : (
                                <span className="nn-restaurant-meta-item" style={{ color: '#8C7872' }}>
                                  🕒 Giờ: Chưa xác minh
                                </span>
                              )}
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
                                    ⚠ {u === 'allergy_ingredients' ? 'Chưa rõ thành phần dị ứng' : u === 'hours' ? 'Chưa rõ giờ mở' : u}
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
                              disabled={busy}
                            >
                              {isSelected ? '✓ Đã chọn' : '+ Chọn vào tour'}
                            </button>

                            <button
                              type="button"
                              data-testid={`btn-compare-venue-${r.id}`}
                              className={`nn-action-chip-btn${isCompareSelected ? ' active' : ''}`}
                              onClick={() => handleToggleCompareSelect(r.id)}
                            >
                              {isCompareSelected ? '✓ Đang so sánh' : 'So sánh'}
                            </button>

                            <button
                              type="button"
                              data-testid={`btn-details-venue-${r.id}`}
                              className="nn-action-chip-btn"
                              onClick={() => setDetailVenue(r)}
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
                              <span>Nguồn dữ liệu ↗</span>
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
                        disabled={busy}
                      >
                        Bắt đầu so sánh →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Comparison View */}
              {view.comparison && (
                <div className="nn-comparison-card" data-testid="discovery-comparison-view">
                  <h4 className="nn-comparison-title">
                    <span>⚖ So sánh chi tiết các địa điểm</span>
                  </h4>
                  <div className="nn-comparison-grid">
                    {(view.comparison.venues || []).map((cv) => (
                      <div key={cv.id} className="nn-comparison-col">
                        <div className="nn-comparison-col-header">
                          <span>{cv.name}</span>
                        </div>
                        <div className="nn-comparison-col-item">
                          <strong>Món:</strong> {(cv.dish_tags || []).join(', ') || 'Chưa rõ'}
                        </div>
                        <div className="nn-comparison-col-item">
                          <strong>Giá:</strong> {cv.price ? `${Number(cv.price.min_vnd || 0).toLocaleString('vi-VN')} – ${Number(cv.price.max_vnd || 0).toLocaleString('vi-VN')} đ` : 'Chưa xác minh'}
                        </div>
                        <div className="nn-comparison-col-item">
                          <strong>Giờ:</strong> {cv.hours?.display || 'Chưa xác minh'}
                        </div>
                        <div className="nn-comparison-col-item">
                          <strong>Khu vực:</strong> {cv.district || cv.address}
                        </div>
                        <div style={{ marginTop: '6px' }}>
                          <button
                            type="button"
                            className="nn-action-chip-btn primary"
                            style={{ width: '100%', justifyContent: 'center' }}
                            onClick={() => handleAddVenue(cv)}
                            disabled={busy || selectedVenueIds.has(cv.id)}
                          >
                            {selectedVenueIds.has(cv.id) ? '✓ Đã chọn' : '+ Chọn quán này'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {Array.isArray(view.comparison.unknowns) && view.comparison.unknowns.length > 0 && (
                    <div style={{ marginTop: '10px', fontSize: '11.5px', color: '#8A4B12' }}>
                      ⚠ Các yếu tố chưa có bằng chứng xác minh: {view.comparison.unknowns.join(', ')}.
                    </div>
                  )}
                </div>
              )}

              {/* Versioned Confirmation Card (Strict gate) */}
              {view.confirmation && (
                <div className="nn-discovery-confirmation" data-testid="discovery-confirmation-card">
                  <div className="nn-confirm-header">
                    <span className="nn-confirm-icon">📋</span>
                    <div>
                      <h4 className="nn-confirm-title">Xác nhận trước khi tạo lịch trình</h4>
                      <p style={{ fontSize: '12.5px', color: '#6C554E', margin: 0 }}>
                        Vui lòng kiểm tra lại các tiêu chí chuyến đi và danh sách quán đã chọn.
                      </p>
                    </div>
                  </div>

                  {/* Summary chips */}
                  <div className="nn-confirm-summary-list">
                    {view.profile?.area && (
                      <span className="nn-confirm-summary-chip">📍 Khu vực: {view.profile.area}</span>
                    )}
                    {view.profile?.party_size && (
                      <span className="nn-confirm-summary-chip">👥 {view.profile.party_size} người</span>
                    )}
                    {view.profile?.budget_vnd && (
                      <span className="nn-confirm-summary-chip">
                        💵 {Number(view.profile.budget_vnd).toLocaleString('vi-VN')} đ ({view.profile.budget_scope === 'per_person' ? 'mỗi người' : 'cả nhóm'})
                      </span>
                    )}
                    {view.profile?.start_time && (
                      <span className="nn-confirm-summary-chip">🕒 Bắt đầu: {view.profile.start_time}</span>
                    )}
                    {view.profile?.duration_min && (
                      <span className="nn-confirm-summary-chip">⏱ {view.profile.duration_min} phút</span>
                    )}
                    {view.profile?.vehicle && (
                      <span className="nn-confirm-summary-chip">
                        🚗 Phương tiện: {view.profile.vehicle === 'walk' ? 'Đi bộ' : view.profile.vehicle}
                      </span>
                    )}
                    {view.selection?.length > 0 && (
                      <span className="nn-confirm-summary-chip">
                        🍽 {view.selection.length} quán đã chọn
                      </span>
                    )}
                  </div>

                  {/* Warnings box */}
                  {Array.isArray(view.confirmation.warnings) && view.confirmation.warnings.length > 0 && (
                    <div className="nn-confirm-warnings">
                      <div className="nn-confirm-warning-title">
                        <span>⚠ Lưu ý an toàn & dữ liệu</span>
                      </div>
                      {view.confirmation.warnings.map((w, wIdx) => (
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
                      disabled={busy}
                    >
                      ✓ Xác nhận tạo lịch trình ngay
                    </button>
                    <button
                      type="button"
                      data-testid="btn-edit-itinerary"
                      className="nn-confirm-btn-secondary"
                      onClick={() => setProfileDrawerOpen(true)}
                      disabled={busy}
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
                onClick={() => handleSendMessage('Tìm quán phở ngon gần đây')}
                disabled={busy}
              >
                + Tìm quán phở
              </button>
              <button
                type="button"
                className="nn-quick-btn"
                onClick={() => handleSendMessage('Gợi ý chè hoặc tráng miệng')}
                disabled={busy}
              >
                + Quán tráng miệng
              </button>
              <button
                type="button"
                className="nn-quick-btn"
                onClick={() => handleSendMessage('Tìm quán ăn dưới 70k')}
                disabled={busy}
              >
                + Món dưới 70k
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
                  disabled={busy}
                  placeholder="Hỏi về món ăn, tìm quán, hoặc yêu cầu điều chỉnh…"
                  aria-label="Nhập yêu cầu khám phá ẩm thực"
                />
                <button
                  type="submit"
                  data-testid="discovery-send-btn"
                  className="nn-send"
                  disabled={busy || !inputText.trim()}
                  aria-label="Gửi yêu cầu"
                >
                  <span className="nn-send-label">Gửi</span>
                  <ArrowGlyph />
                </button>
              </form>

              {/* Secondary Diagnostics Details */}
              <details className="nn-diagnostics-details" data-testid="discovery-diagnostics">
                <summary>Thông tin kỹ thuật & kiểm định (Diagnostics)</summary>
                <div className="nn-diagnostics-content">
                  <div>Hợp đồng: {view.contract || 'discovery-v1'} | Revision: #{view.revision}</div>
                  <div>Phiên bản hồ sơ: #{view.profile_version} | Phiên bản chọn quán: #{view.selection_version}</div>
                  <div>Nguồn dữ liệu: {view.source?.dataset_source || 'synthetic'} ({view.source?.dataset_version || 'pilot'})</div>
                  <div>Chế độ AI: {view.provider?.mode || health?.llm || 'rules'} (Gọi: {view.provider?.calls || 0} lượt)</div>
                  <div>Thời gian xử lý: {view.diagnostics?.elapsed_ms || 0}ms | Thời tiết: {view.diagnostics?.weather || 'unavailable'}</div>
                </div>
              </details>
            </div>
          </section>

          {/* RIGHT TOUR / SELECTION / MAP COLUMN */}
          <section
            className={`nn-tour-col${activeMobileTab === 'chat' ? ' nn-hidden-mobile' : ''}`}
          >
            <div className="nn-tour-col-header">
              <h2 className="nn-tour-heading">
                {view.tour ? 'Lịch trình tour ẩm thực' : 'Quán đã chọn'}
              </h2>
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
                {/* When Tour has been created */}
                {view.tour ? (
                  <GuidedTimeline
                    tour={view.tour}
                    allergies={view.profile?.allergies || []}
                    lockedStops={(view.selection || []).filter((s) => s.locked).map((s) => s.id)}
                    onReplaceStop={(stop) => {
                      // Revision replans through reviseItinerary
                      handleReviseItinerary();
                    }}
                    onChangeStop={() => handleReviseItinerary()}
                    onAdjustStops={() => setProfileDrawerOpen(true)}
                    onRestart={onResetSession}
                  />
                ) : (
                  /* When Tour is not created yet, show Selection list */
                  <div className="nn-selection-container" data-testid="discovery-selection-container">
                    <div className="nn-selection-header-row">
                      <h3 className="nn-selection-title">Danh sách quán đã chọn</h3>
                      <span className="nn-selection-badge">
                        {view.selection?.length || 0}/5 quán
                      </span>
                    </div>

                    {Array.isArray(view.selection) && view.selection.length > 0 ? (
                      <>
                        {view.selection.map((item, idx) => (
                          <div
                            key={item.id}
                            data-testid={`selected-venue-card-${item.id}`}
                            className="nn-selected-card"
                          >
                            <div className="nn-selected-card-left">
                              <div className="nn-restaurant-badge" style={{ width: '26px', height: '26px', fontSize: '12px' }}>
                                {idx + 1}
                              </div>
                              <div>
                                <h4 className="nn-selected-name">{item.name}</h4>
                                <p className="nn-selected-sub">{item.address || item.district}</p>
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
                              >
                                {item.locked ? '🔒' : '🔓'}
                              </button>
                              <button
                                type="button"
                                data-testid={`btn-remove-venue-${item.id}`}
                                className="nn-icon-action-btn"
                                onClick={() => handleRemoveVenue(item.id)}
                                title="Xoá quán khỏi danh sách"
                                aria-label="Xoá quán"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Plan Trigger Dark CTA Card */}
                        <div className="nn-plan-trigger-card">
                          <h4 className="nn-plan-trigger-title">Sẵn sàng tạo lịch trình?</h4>
                          <p className="nn-plan-trigger-desc">
                            Hệ thống sẽ tối ưu tuyến đường đi bộ, kiểm tra giờ mở cửa và tính toán chi phí theo ngân sách.
                          </p>
                          <button
                            type="button"
                            data-testid="btn-trigger-plan"
                            className="nn-plan-trigger-btn"
                            onClick={handleTriggerPlan}
                            disabled={busy}
                          >
                            Tạo lịch trình từ {view.selection.length} quán đã chọn →
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
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* Detail Venue Modal */}
      {detailVenue && (
        <div
          role="dialog"
          aria-modal="true"
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
          onClick={() => setDetailVenue(null)}
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
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#231815' }}>
                  {detailVenue.name}
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#7A625A' }}>
                  {detailVenue.address} · {detailVenue.district}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailVenue(null)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#8C7872'
                }}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <strong>Món đặc trưng:</strong> {(detailVenue.dish_tags || []).join(', ') || 'Chưa rõ'}
              </div>
              <div>
                <strong>Khoảng giá quán:</strong> {detailVenue.price ? `${Number(detailVenue.price.min_vnd || 0).toLocaleString('vi-VN')} – ${Number(detailVenue.price.max_vnd || 0).toLocaleString('vi-VN')} đ` : 'Chưa xác minh'}
              </div>
              <div>
                <strong>Giờ hoạt động:</strong> {detailVenue.hours?.display || 'Chưa xác minh theo nguồn'}
              </div>
              {Array.isArray(detailVenue.unknowns) && detailVenue.unknowns.length > 0 && (
                <div style={{ background: '#FFF7ED', padding: '8px 12px', borderRadius: '8px', color: '#9A3412' }}>
                  <strong>Yếu tố chưa có bằng chứng:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {detailVenue.unknowns.map((u, idx) => (
                      <li key={idx}>{u}</li>
                    ))}
                  </ul>
                </div>
              )}
              {detailVenue.source_url && (
                <div>
                  <strong>Nguồn dữ liệu:</strong>{' '}
                  <a
                    href={detailVenue.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#CF542F', textDecoration: 'underline' }}
                  >
                    Xem liên kết gốc ↗
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
                onClick={() => setDetailVenue(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="nn-action-chip-btn primary"
                onClick={() => {
                  handleAddVenue(detailVenue);
                  setDetailVenue(null);
                }}
                disabled={busy || selectedVenueIds.has(detailVenue.id)}
              >
                {selectedVenueIds.has(detailVenue.id) ? '✓ Đã trong tour' : '+ Thêm vào tour'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
