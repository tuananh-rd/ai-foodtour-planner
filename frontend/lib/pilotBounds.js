/**
 * pilotBounds.js
 * Authoritative bounds and bounds checking for Hoan Kiem pilot area.
 * Pure JavaScript utility safe for Node test runners, SSR, and client.
 */

export const PILOT_BOUNDS = {
  west: 105.835,
  south: 21.018,
  east: 105.866,
  north: 21.046
};

export const DEFAULT_CENTER = [105.8505, 21.032];
export const DEFAULT_ZOOM = 13.5;

/**
 * Authoritative bounds check for Hoan Kiem pilot area.
 */
export function isInsidePilotBounds(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) return false;
  return (
    lon >= PILOT_BOUNDS.west &&
    lon <= PILOT_BOUNDS.east &&
    lat >= PILOT_BOUNDS.south &&
    lat <= PILOT_BOUNDS.north
  );
}
