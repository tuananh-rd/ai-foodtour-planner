'use client';

import React from 'react';
import PilotMap from './v2/guided/PilotMap';

/**
 * MapView
 * Unified MapLibre PMTiles interactive map.
 * Replaces retired Google Maps API stack with self-hosted PMTiles vector archive.
 * Displays explicitly selected origin with human-readable label,
 * numbered ordered tour stops, dashed straight-line estimated connectors,
 * venue markers toggle, bounds fitting, and auto-resize.
 * Zero Google CTA, branding, or external key dependencies.
 */
export default function MapView({
  origin,
  originLabel,
  stops = [],
  highlightedStopId,
  onSelectStop,
  legSource = 'straight_line_estimate',
  routingProvider = 'estimate',
  routeWarnings = [],
  clientConfig = null
}) {
  return (
    <div data-testid="map-view-wrapper" style={{ width: '100%', minHeight: 360 }}>
      <PilotMap
        stops={stops}
        origin={origin}
        originLabel={originLabel}
      />
    </div>
  );
}
