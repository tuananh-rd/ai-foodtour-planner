'use client';

import React from 'react';
import Sheet from '../../ui/Sheet';
import PreferencesPanel from '../PreferencesPanel';

/**
 * PreferencesSheet for UI_V2 (Scope 2).
 * Wraps the existing PreferencesPanel inside an accessible Sheet.
 * Reuses all origin picker, geolocation, and session guards completely unchanged.
 */
export default function PreferencesSheet({
  isOpen,
  onClose,
  preferences,
  revision,
  onUpdatePreferences,
  onPlanTour,
  busy = false,
  isMock = false,
  clientConfig,
  sessionToken,
  sessionId,
  sessionEpoch,
}) {
  const handleApplyAndPlan = (updatedPrefs) => {
    onClose();
    if (onPlanTour) {
      onPlanTour(updatedPrefs);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Tuỳ chọn hành trình & Điểm xuất phát"
    >
      <div style={{ padding: '4px 0' }}>
        <PreferencesPanel
          preferences={preferences}
          revision={revision}
          onUpdatePreferences={onUpdatePreferences}
          onPlanTour={handleApplyAndPlan}
          busy={busy}
          isMock={isMock}
          clientConfig={clientConfig}
          sessionToken={sessionToken}
          sessionId={sessionId}
          sessionEpoch={sessionEpoch}
        />
      </div>
    </Sheet>
  );
}
