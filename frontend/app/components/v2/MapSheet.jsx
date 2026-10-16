'use client';

import React from 'react';
import Sheet from '../../ui/Sheet';
import MapView from '../MapView';

/**
 * MapSheet for UI_V2 (Scope 3).
 * Opens MapView inside an accessible Sheet.
 */
export default function MapSheet({
  isOpen,
  onClose,
  origin,
  originLabel,
  stops = [],
  highlightedStopId,
  onSelectStop,
  legSource,
  routingProvider,
  routeWarnings = [],
  clientConfig,
}) {
  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Bản đồ hành trình ẩm thực"
    >
      <div data-map-view style={{ padding: '8px 0' }}>
        <MapView
          origin={origin}
          originLabel={originLabel}
          stops={stops}
          highlightedStopId={highlightedStopId}
          onSelectStop={onSelectStop}
          legSource={legSource}
          routingProvider={routingProvider}
          routeWarnings={routeWarnings}
          clientConfig={clientConfig}
        />
      </div>
    </Sheet>
  );
}
