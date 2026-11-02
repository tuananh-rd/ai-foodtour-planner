/**
 * discoveryMaps.js
 * Helpers to construct OpenStreetMap Directions and Per-Leg URLs.
 *
 * Requirements:
 * - OpenStreetMap public directions URLs only; no paid API keys or billable endpoints.
 * - Require an explicit, valid selected origin in all public builders.
 * - Invalid/null origin -> [] or null even if stops has 2 valid coordinates.
 * - Per-leg links: engine=fossgis_osrm_foot for walking, engine=fossgis_osrm_car for driving.
 * - No motorcycle-to-car silent substitution; motorcycle links return unavailable with truthful limitation.
 * - Conforms strictly to isValidOsmDirUrl allowlist.
 * - Strict numeric coordinates without coercion; missing coordinates break leg connectivity.
 * - UI text contains zero emojis.
 */

import { isValidOsmDirUrl } from './mapsUrlValidation.js';

export function isValidCoordinate(point) {
  if (!point || typeof point !== 'object') return false;
  const lat = point.lat;
  const rawLon = point.lon !== undefined ? point.lon : point.lng;
  const lon = rawLon;
  // Strict numeric validation: no coercion of null, boolean, string, or undefined
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false; // Missing coordinates are NEVER 0,0
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function validateDiscoveryMapsLink(link, expectedMode) {
  if (!link || typeof link !== 'object' || typeof link.url !== 'string' || link.url.length > 2048) return false;
  return isValidOsmDirUrl(link.url, expectedMode);
}

export function normalizeDiscoveryMapsResponse(response, expectedMode) {
  if (!response || typeof response !== 'object') return null;
  const sourceLinks = Array.isArray(response.links) ? response.links : [];
  let links = sourceLinks
    .filter((link) => validateDiscoveryMapsLink(link, expectedMode))
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  const skipped = Array.isArray(response.skipped) ? response.skipped : [];
  const notes = Array.isArray(response.notes) ? response.notes : [];
  let status = ['ok', 'partial', 'unavailable'].includes(response.status)
    ? response.status
    : (links.length ? 'ok' : 'unavailable');
  const filteringDroppedLinks = links.length < sourceLinks.length;
  if (status === 'ok' && (skipped.length || filteringDroppedLinks)) status = links.length ? 'partial' : 'unavailable';
  if (!links.length) status = 'unavailable';
  if (status === 'unavailable') links = [];
  return { status, links, skipped, notes };
}

export function getDiscoveryMapsRequestIdentity({ sessionId, sessionToken, revision, origin, travelMode, stops }) {
  return JSON.stringify([
    sessionId,
    sessionToken,
    revision,
    origin?.id ?? origin?.candidate_id ?? null,
    origin?.source ?? null,
    origin?.status ?? null,
    origin?.lat ?? null,
    origin?.lon ?? origin?.lng ?? null,
    origin?.address ?? null,
    origin?.label ?? null,
    travelMode,
    (Array.isArray(stops) ? stops : []).map((stop) => stop?.venue_id ?? stop?.id ?? null)
  ]);
}

export function resolveEffectiveDiscoveryMapsLinks({ serverMaps, origin, stops, vehicle }) {
  if (serverMaps) return Array.isArray(serverMaps.links) ? serverMaps.links : [];
  if (!isValidCoordinate(origin)) return [];
  return buildDiscoveryMapsSplitUrls({ origin, stops, vehicle });
}

export function resolveTravelMode(vehicle) {
  if (!vehicle) {
    return { mode: 'walking', isMotorbike: false, label: 'Đi bộ', engine: 'fossgis_osrm_foot' };
  }
  const v = String(vehicle).toLowerCase().trim();
  if (v === 'car' || v === 'taxi' || v === 'oto' || v === 'ô tô' || v === 'driving') {
    return { mode: 'driving', isMotorbike: false, label: 'Ô tô / Taxi', engine: 'fossgis_osrm_car' };
  }
  if (v === 'motorbike' || v === 'xe_may' || v === 'xe máy' || v === 'motor') {
    return {
      mode: null,
      isMotorbike: true,
      label: 'Xe máy',
      unavailable: true,
      disclosureNote: 'Chưa hỗ trợ chỉ đường xe máy; không tự động thay bằng đường ô tô. Bạn hãy theo dõi các điểm dừng được đánh số trên bản đồ.'
    };
  }
  return { mode: 'walking', isMotorbike: false, label: 'Đi bộ', engine: 'fossgis_osrm_foot' };
}

export function getCoordString(point) {
  const lat = point.lat;
  const lon = point.lon !== undefined ? point.lon : point.lng;
  return `${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/**
 * Builds per-leg OpenStreetMap direction links.
 * Each leg connects consecutive valid points:
 * (Origin -> Stop 1), (Stop 1 -> Stop 2), etc.
 *
 * Invariant: Must require an explicit valid selected origin.
 * Invalid or missing origin -> returns [] even if stops has valid coordinates.
 * Any missing stop coordinate breaks adjacency and is NEVER bridged.
 */
export function buildDiscoveryLegUrls({ origin, stops, vehicle }) {
  // Guard 1: Require an explicit, valid origin
  if (!isValidCoordinate(origin)) return [];
  // Guard 2: Must have at least one stop
  if (!Array.isArray(stops) || stops.length === 0) return [];

  const modeInfo = resolveTravelMode(vehicle);
  if (modeInfo.isMotorbike || !modeInfo.mode) {
    // Motorcycle routing unavailable; no car substitution
    return [];
  }

  const engine = modeInfo.engine;
  const legUrls = [];
  let previousPoint = { label: origin.label || 'Điểm xuất phát', coord: getCoordString(origin) };

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const isStopValid = isValidCoordinate(s);
    if (!isStopValid) {
      // Missing coordinate breaks adjacency: missing legs are not connected
      previousPoint = null;
      continue;
    }

    const stopOrder = (typeof s.order === 'number' && s.order > 0) ? s.order : ((typeof s.index === 'number' && s.index > 0) ? s.index : i + 1);
    const currentPoint = {
      label: s.name || `Điểm ${stopOrder}`,
      coord: getCoordString(s)
    };

    if (previousPoint !== null) {
      const q = new URLSearchParams({
        engine,
        route: `${previousPoint.coord};${currentPoint.coord}`
      });
      const u = `https://www.openstreetmap.org/directions?${q.toString()}`;
      if (isValidOsmDirUrl(u, modeInfo.mode)) {
        legUrls.push({
          order: legUrls.length + 1,
          fromName: previousPoint.label,
          toName: currentPoint.label,
          url: u
        });
      }
    }

    previousPoint = currentPoint;
  }

  return legUrls;
}

/**
 * Builds ordered list of OpenStreetMap links for the tour.
 * Guard: Requires explicit valid origin; returns [] otherwise.
 */
export function buildDiscoveryMapsSplitUrls({ origin, stops, vehicle }) {
  if (!isValidCoordinate(origin)) return [];
  if (!Array.isArray(stops) || stops.length === 0) return [];

  const legs = buildDiscoveryLegUrls({ origin, stops, vehicle });
  const total = legs.length;
  return legs.map((leg, idx) => ({
    index: idx + 1,
    of: total,
    url: leg.url,
    fromName: leg.fromName,
    toName: leg.toName,
    waypointCount: 0,
    label: total > 1 ? `Chặng ${idx + 1}/${total}: ${leg.fromName} → ${leg.toName}` : 'Toàn bộ lộ trình'
  }));
}

/**
 * Builds the complete OpenStreetMap directions object.
 * Guard: Requires explicit valid origin; returns null otherwise.
 */
export function buildDiscoveryMapsUrl({ origin, stops, vehicle }) {
  if (!isValidCoordinate(origin)) return null;
  if (!Array.isArray(stops) || stops.length === 0) return null;

  const modeInfo = resolveTravelMode(vehicle);
  if (modeInfo.isMotorbike || !modeInfo.mode) {
    return {
      url: null,
      splitLinks: [],
      isSplit: false,
      travelmode: null,
      isMotorbike: true,
      disclosureNote: modeInfo.disclosureNote,
      modeLabel: modeInfo.label,
      unavailable: true
    };
  }

  const splitLinks = buildDiscoveryMapsSplitUrls({ origin, stops, vehicle });
  if (!splitLinks || splitLinks.length === 0) return null;

  return {
    url: splitLinks[0]?.url || null,
    splitLinks,
    isSplit: splitLinks.length > 1,
    travelmode: modeInfo.mode,
    isMotorbike: false,
    disclosureNote: null,
    modeLabel: modeInfo.label,
    unavailable: false
  };
}
