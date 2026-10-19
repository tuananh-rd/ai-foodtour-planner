/**
 * discoveryMaps.js
 * Helpers to construct Free Google Maps Directions and Per-Leg URLs (Contract discovery-v1 / GMAPS-URL-2).
 *
 * Requirements:
 * - Free Google Maps URLs only; no paid API keys or billable endpoints.
 * - Start at actual user origin (if provided in profile); do not invent GPS.
 * - When origin is provided, include ALL selected stops in order via waypoints and destination.
 * - When origin is NOT provided, fall back safely without setting origin=destination for single stop.
 * - Travel modes: walking for walk, driving for car/taxi/motorbike with honest motorbike approximation.
 * - Conforms strictly to isValidGoogleMapsDirUrl allowlist.
 */

import { isValidGoogleMapsDirUrl } from './mapsUrlValidation.js';

export function resolveTravelMode(vehicle) {
  if (!vehicle) {
    return { mode: 'walking', isMotorbike: false, label: 'Đi bộ' };
  }
  const v = String(vehicle).toLowerCase().trim();
  if (v === 'car' || v === 'taxi' || v === 'oto' || v === 'ô tô' || v === 'driving') {
    return { mode: 'driving', isMotorbike: false, label: 'Ô tô / Taxi' };
  }
  if (v === 'motorbike' || v === 'xe_may' || v === 'xe máy' || v === 'motor') {
    return {
      mode: 'driving',
      isMotorbike: true,
      label: 'Xe máy',
      disclosureNote: 'Google Maps hiển thị lộ trình ô tô tương đương cho xe máy.'
    };
  }
  return { mode: 'walking', isMotorbike: false, label: 'Đi bộ' };
}

export function isValidCoordinate(point) {
  if (!point || typeof point !== 'object') return false;
  const lat = typeof point.lat === 'number' ? point.lat : Number(point.lat);
  const rawLon = point.lon !== undefined ? point.lon : point.lng;
  const lon = typeof rawLon === 'number' ? rawLon : Number(rawLon);
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function getCoordString(point) {
  const lat = typeof point.lat === 'number' ? point.lat : Number(point.lat);
  const rawLon = point.lon !== undefined ? point.lon : point.lng;
  const lon = typeof rawLon === 'number' ? rawLon : Number(rawLon);
  return `${lat},${lon}`;
}

/**
 * Builds the complete multi-stop Google Maps directions URL.
 */
export function buildDiscoveryMapsUrl({ origin, stops, vehicle }) {
  if (!Array.isArray(stops) || stops.length === 0) return null;
  const validStops = stops.filter(isValidCoordinate);
  if (validStops.length === 0) return null;

  const modeInfo = resolveTravelMode(vehicle);
  const travelmode = modeInfo.mode;
  const hasUserOrigin = isValidCoordinate(origin);

  let candidateUrl = null;

  if (hasUserOrigin) {
    const originStr = getCoordString(origin);
    const destStr = getCoordString(validStops[validStops.length - 1]);

    const query = new URLSearchParams({
      api: '1',
      origin: originStr,
      destination: destStr,
      travelmode
    });

    if (validStops.length > 1) {
      // All intermediate stops (from index 0 up to index n-2) become waypoints
      // ensuring ALL selected stops are visited in exact order
      const waypoints = validStops.slice(0, -1).map(getCoordString).join('|');
      query.set('waypoints', waypoints);
    }

    candidateUrl = `https://www.google.com/maps/dir/?${query.toString()}`;
  } else {
    // Legacy caller without user origin - DO NOT invent GPS
    if (validStops.length === 1) {
      // Single stop: link directly to stop destination without origin=destination
      const destStr = getCoordString(validStops[0]);
      const query = new URLSearchParams({
        api: '1',
        destination: destStr,
        travelmode
      });
      candidateUrl = `https://www.google.com/maps/dir/?${query.toString()}`;
    } else {
      const originStr = getCoordString(validStops[0]);
      const destStr = getCoordString(validStops[validStops.length - 1]);
      const query = new URLSearchParams({
        api: '1',
        origin: originStr,
        destination: destStr,
        travelmode
      });
      if (validStops.length > 2) {
        const waypoints = validStops.slice(1, -1).map(getCoordString).join('|');
        query.set('waypoints', waypoints);
      }
      candidateUrl = `https://www.google.com/maps/dir/?${query.toString()}`;
    }
  }

  if (candidateUrl && isValidGoogleMapsDirUrl(candidateUrl)) {
    return {
      url: candidateUrl,
      travelmode,
      isMotorbike: modeInfo.isMotorbike,
      disclosureNote: modeInfo.disclosureNote || null,
      modeLabel: modeInfo.label
    };
  }

  return null;
}

/**
 * Builds per-leg Google Maps URLs (mobile fallback / detailed navigation).
 * Includes user origin -> first stop if origin is provided, plus all inter-stop legs.
 */
export function buildDiscoveryLegUrls({ origin, stops, vehicle }) {
  if (!Array.isArray(stops) || stops.length === 0) return [];
  const validStops = stops.filter(isValidCoordinate);
  if (validStops.length === 0) return [];

  const { mode: travelmode } = resolveTravelMode(vehicle);
  const hasUserOrigin = isValidCoordinate(origin);
  const legUrls = [];
  let order = 1;

  // Leg 1: User origin -> first stop
  if (hasUserOrigin && validStops.length > 0) {
    const originStr = getCoordString(origin);
    const firstStop = validStops[0];
    const q = new URLSearchParams({
      api: '1',
      origin: originStr,
      destination: getCoordString(firstStop),
      travelmode
    });
    const u = `https://www.google.com/maps/dir/?${q.toString()}`;
    if (isValidGoogleMapsDirUrl(u)) {
      legUrls.push({
        order: order++,
        fromName: origin.label || 'Điểm xuất phát của bạn',
        toName: firstStop.name || 'Điểm dừng 1',
        url: u
      });
    }
  }

  // Inter-stop legs: stop[i] -> stop[i+1]
  if (validStops.length > 1) {
    for (let i = 0; i < validStops.length - 1; i++) {
      const from = validStops[i];
      const to = validStops[i + 1];
      const q = new URLSearchParams({
        api: '1',
        origin: getCoordString(from),
        destination: getCoordString(to),
        travelmode
      });
      const u = `https://www.google.com/maps/dir/?${q.toString()}`;
      if (isValidGoogleMapsDirUrl(u)) {
        legUrls.push({
          order: order++,
          fromName: from.name || `Điểm ${i + 1}`,
          toName: to.name || `Điểm ${i + 2}`,
          url: u
        });
      }
    }
  }

  return legUrls;
}
