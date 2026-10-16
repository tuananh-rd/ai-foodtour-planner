'use client';

import React, { useState, useEffect } from 'react';
import V2Header from './V2Header';
import RequestArea from './RequestArea';
import ItineraryView from './ItineraryView';
import PreferencesSheet from './PreferencesSheet';
import MapSheet from './MapSheet';
import StickyActionBar from './StickyActionBar';
import ReplaceDiffModal from '../ReplaceDiffModal';
import TourStatusBanner from '../TourStatusBanner';
import { BannerQueue } from '../../ui/Banner';
import { useStatusQueue } from '../../ui/StatusQueue';
import Skeleton from '../../ui/Skeleton';

/**
 * Main UI_V2 Shell and Layout (Tasks R1-5 / M1).
 * Features:
 * - Itinerary is FIRST in the viewport after planning (top < viewport height at 390 and 1280).
 * - Developer jargon purged (no CONTRACT, Mock, Explore, Conditional, hours, price_per_person, route) unless ?dev=1.
 * - Single banner visible at any time via StatusQueue.
 * - Mobile bottom sticky action bar with >= 44px touch targets.
 * - Reuses PreferencesPanel, MapView, and ReplaceDiffModal without regressing session invariants.
 */
export default function V2Layout({
  // Session & Preferences
  sessionId,
  sessionToken,
  sessionEpoch,
  revision,
  preferences,
  onUpdatePreferences,
  onResetSession,

  // Tour & Actions
  tour,
  onPlanTour,
  onSendMessage,
  onInitiateReplace,
  onConfirmReplace,
  onCloseReplaceModal,
  isReplaceModalOpen,
  replaceTargetStop,
  replaceResultDiff,
  lockedVenueIds = [],

  // Providers & Provenance
  health,
  clientConfig,
  datasetSource,
  datasetVersion,
  isMock,
  onToggleMockMode,

  // Status & Errors
  busy,
  error,
  conflictError,
  noCandidatesError,
  authError,
  rateLimitError,
  providerUnavailableError,
  notes = [],
  messages = [],
  questions = [],
  missingSlots = [],
  onRetry = null,

  // Dev mode flag (?dev=1)
  isDevMode = false,
}) {
  const [isPrefOpen, setIsPrefOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [highlightedStopId, setHighlightedStopId] = useState(null);

  const { enqueue, dismiss, clear } = useStatusQueue();

  // Extract latest LLM budget and extraction source
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
  const llmBudget = lastAssistantMsg?.llm_budget || health?.llm_budget || null;
  const extractionSource = lastAssistantMsg?.extractionSource || null;

  // Synchronize system banners into StatusQueue (Priority: error > warning > info)
  useEffect(() => {
    // 1. Auth / Session Expired Error
    if (authError) {
      enqueue({
        id: 'auth_error',
        type: 'error',
        title: 'Phiên làm việc đã hết hạn',
        message: authError.message || 'Phiên làm việc của bạn đã hết hạn. Vui lòng bấm tạo phiên mới để tiếp tục.',
        action: {
          label: 'Tạo mới',
          onClick: onResetSession,
        },
      });
      return;
    } else {
      dismiss('auth_error');
    }

    // 2. Conflict Error (409)
    if (conflictError) {
      enqueue({
        id: 'conflict_error',
        type: 'warning',
        title: 'Dữ liệu phiên đã thay đổi',
        message: conflictError.message || 'Dữ liệu hành trình đã được cập nhật từ một nguồn khác. Hệ thống sẽ tự động đồng bộ.',
        action: {
          label: 'Đồng bộ lại',
          onClick: () => {
            dismiss('conflict_error');
            if (onRetry) onRetry();
            else onPlanTour();
          },
        },
      });
      return;
    } else {
      dismiss('conflict_error');
    }

    // 3. No Candidates Error (409)
    if (noCandidatesError) {
      enqueue({
        id: 'no_candidates',
        type: 'warning',
        title: 'Không còn quán thay thế phù hợp',
        message: noCandidatesError.message || 'Không tìm thấy quán thay thế nào thoả mãn thời gian và khu vực. Lịch trình hiện tại vẫn được giữ nguyên.',
      });
      return;
    } else {
      dismiss('no_candidates');
    }

    // 4. Rate Limit (429)
    if (rateLimitError) {
      enqueue({
        id: 'rate_limit',
        type: 'warning',
        title: 'Đang tiếp nhận nhiều yêu cầu',
        message: 'Hệ thống đang phục vụ nhiều người dùng cùng lúc. Vui lòng thử lại sau vài giây.',
      });
      return;
    } else {
      dismiss('rate_limit');
    }

    // 5. Provider Unavailable (503)
    if (providerUnavailableError) {
      enqueue({
        id: 'provider_unavailable',
        type: 'info',
        title: 'Trợ lý AI đang tạm nghỉ',
        message: 'Dịch vụ xử lý câu hỏi tự nhiên đang tạm gián đoạn. Bạn vẫn có thể dùng các gợi ý một chạm hoặc biểu mẫu tuỳ chọn để lập lịch bình thường.',
        action: {
          label: 'Mở Tuỳ chọn',
          onClick: () => setIsPrefOpen(true),
        },
      });
      return;
    } else {
      dismiss('provider_unavailable');
    }

    // 6. Generic Error
    if (error) {
      enqueue({
        id: 'general_error',
        type: 'error',
        title: 'Không thể hoàn thành yêu cầu',
        message: error.message || 'Đã có sự cố khi xử lý dữ liệu. Bạn có thể thử lại.',
        action: {
          label: 'Thử lại',
          onClick: () => {
            dismiss('general_error');
            if (onRetry) onRetry();
            else onPlanTour();
          },
        },
      });
      return;
    } else {
      dismiss('general_error');
    }

    // 7. LLM Budget Exhausted (Neutral warning banner per UPGRADE_PLAN §3.7)
    if (llmBudget?.exhausted) {
      enqueue({
        id: 'llm_exhausted',
        type: 'info',
        title: 'AI đã đạt hạn mức hôm nay',
        message: 'AI hết lượt hôm nay (đặt lại vào nửa đêm giờ Thái Bình Dương) — vẫn dùng được chip gợi ý và biểu mẫu bình thường.',
      });
    } else {
      dismiss('llm_exhausted');
    }
  }, [
    authError,
    conflictError,
    noCandidatesError,
    rateLimitError,
    providerUnavailableError,
    error,
    llmBudget?.exhausted,
    onRetry,
    onPlanTour,
    onResetSession,
  ]);

  const hasTour = Boolean(tour && tour.stops && tour.stops.length > 0);

  return (
    <div
      data-ui-v2="true"
      className="ft-v2-container"
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg, #FBF8F3)',
        color: 'var(--text, #1F1B16)',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      {/* 1. One-line Header (<= 56px) */}
      <V2Header
        health={health}
        llmBudget={llmBudget}
        isDevMode={isDevMode}
        isMock={isMock}
        revision={revision}
        preferences={preferences}
        onResetSession={onResetSession}
        onToggleMockMode={onToggleMockMode}
        busy={busy}
      />

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          maxWidth: '1024px',
          width: '100%',
          margin: '0 auto',
          padding: '16px 16px 80px 16px', // bottom padding for sticky bar
          boxSizing: 'border-box',
        }}
      >
        {/* Guaranteed single status banner queue */}
        <BannerQueue />

        {/* Loading skeleton when creating tour */}
        {busy && !hasTour && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ padding: '16px', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent)', marginBottom: '12px' }}>
                Đang tìm các quán ăn ngon nhất quanh {preferences.origin_label || 'Phố Cổ'}...
              </div>
              <Skeleton count={3} height="70px" style={{ marginBottom: '10px' }} />
            </div>
          </div>
        )}

        {/* Feasibility outcome when tour status returned with empty stops (e.g. no_solution / insufficient_evidence) (F02) */}
        {!hasTour && tour && tour.status && (
          <div data-feasibility-outcome style={{ marginBottom: '20px' }}>
            <TourStatusBanner
              tour={tour}
              onAdjustPreferences={() => setIsPrefOpen(true)}
            />
          </div>
        )}

        {/* 2. ITINERARY VIEW IS FIRST WHEN A TOUR EXISTS (Scope 3, Assertion a) */}
        {hasTour ? (
          <div>
            <ItineraryView
              tour={tour}
              sessionId={sessionId}
              sessionToken={sessionToken}
              sessionEpoch={sessionEpoch}
              revision={revision}
              originLabel={preferences?.origin_label || 'Phố Cổ'}
              lockedIds={lockedVenueIds}
              onInitiateReplace={onInitiateReplace}
              onResetTour={onResetSession}
              onOpenPreferences={() => setIsPrefOpen(true)}
              onOpenMap={() => setIsMapOpen(true)}
              busy={busy}
            />

            {/* Collapsible / Secondary Request Area below itinerary */}
            <div style={{ marginTop: '24px' }}>
              <RequestArea
                onSendMessage={onSendMessage}
                onPlanTour={onPlanTour}
                onOpenPreferences={() => setIsPrefOpen(true)}
                busy={busy}
                originLabel={preferences.origin_label || 'Phố Cổ'}
                questions={questions}
                missingSlots={missingSlots}
                notes={notes}
                messages={messages}
                health={health}
                datasetSource={datasetSource}
                datasetVersion={datasetVersion}
                isMock={isMock}
              />
            </div>
          </div>
        ) : (
          /* Empty / Initial Start Screen (Screen A) */
          <div>
            <RequestArea
              onSendMessage={onSendMessage}
              onPlanTour={onPlanTour}
              onOpenPreferences={() => setIsPrefOpen(true)}
              busy={busy}
              originLabel={preferences.origin_label || 'Phố Cổ'}
              questions={questions}
              missingSlots={missingSlots}
              notes={notes}
              messages={messages}
              health={health}
              datasetSource={datasetSource}
              datasetVersion={datasetVersion}
              isMock={isMock}
            />
          </div>
        )}

        {/* Source provenance label */}
        {extractionSource && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--muted, #6B6259)',
              textAlign: 'center',
              marginTop: '12px',
            }}
          >
            Nguồn xử lý yêu cầu:{' '}
            <strong>
              {extractionSource === 'rules'
                ? 'bộ luật cục bộ'
                : extractionSource === 'cache'
                ? 'đã dùng kết quả trước'
                : 'trí tuệ nhân tạo (AI)'}
            </strong>
          </div>
        )}
      </main>

      {/* 3. Mobile Sticky Bottom Action Bar */}
      <StickyActionBar
        hasTour={hasTour}
        onPlanTour={onPlanTour}
        onResetTour={onResetSession}
        onOpenPreferences={() => setIsPrefOpen(true)}
        onOpenMap={() => setIsMapOpen(true)}
        busy={busy}
      />

      {/* 4. Preferences Sheet (reusing PreferencesPanel unchanged) */}
      <PreferencesSheet
        isOpen={isPrefOpen}
        onClose={() => setIsPrefOpen(false)}
        preferences={preferences}
        revision={revision}
        onUpdatePreferences={onUpdatePreferences}
        onPlanTour={onPlanTour}
        busy={busy}
        isMock={isMock}
        clientConfig={clientConfig}
        sessionToken={sessionToken}
        sessionId={sessionId}
        sessionEpoch={sessionEpoch}
      />

      {/* 5. Map Sheet (secondary sheet view for map) */}
      <MapSheet
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        origin={preferences.origin}
        originLabel={preferences.origin_label}
        stops={tour?.stops || []}
        highlightedStopId={highlightedStopId}
        onSelectStop={(id) => setHighlightedStopId(id)}
        legSource={tour?.totals?.leg_source || 'straight_line_estimate'}
        routingProvider={tour?.totals?.route_provider || health?.routing_provider || 'estimate'}
        routeWarnings={tour?.route_warnings || []}
        clientConfig={clientConfig}
      />

      {/* 6. Replace Stop Diff Modal (server chosen diff, F2) */}
      <ReplaceDiffModal
        isOpen={isReplaceModalOpen}
        oldStop={replaceTargetStop}
        resultDiff={replaceResultDiff}
        lockedStops={lockedVenueIds}
        onConfirm={onConfirmReplace}
        onCancel={onCloseReplaceModal}
        busy={busy}
      />
    </div>
  );
}
