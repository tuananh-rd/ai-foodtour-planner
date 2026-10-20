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
 * - Bounded waypoints (<= 3 waypoints per Google Maps URL, <= 2048 chars).
 * - Multi-run split chaining when stops exceed 5 points so NO STOPS ARE DROPPED ("không rơi chặng").
 */

import { isValidGoogleMapsDirUrl } from './mapsUrlValidation.js';

export function validateDiscoveryMapsLink(link, expectedMode) {
  if (!link || typeof link !== 'object' || typeof link.url !== 'string' || link.url.length > 2048) return false;
  if (!isValidGoogleMapsDirUrl(link.url)) return false;
  try {
    const url = new URL(link.url);
    if (url.searchParams.get('api') !== '1') return false;
    if (expectedMode && url.searchParams.get('travelmode') !== expectedMode) return false;
    const waypoints = url.searchParams.get('waypoints');
    return !waypoints || waypoints.split('|').length <= 3;
  } catch {
    return false;
  }
}

export function normalizeDiscoveryMapsResponse(response, expectedMode) {
  if (!response || typeof response !== 'object') return null;
  const links = (Array.isArray(response.links) ? response.links : [])
    .filter((link) => validateDiscoveryMapsLink(link, expectedMode))
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  const skipped = Array.isArray(response.skipped) ? response.skipped : [];
  const notes = Array.isArray(response.notes) ? response.notes : [];
  let status = ['ok', 'partial', 'unavailable'].includes(response.status)
    ? response.status
    : (links.length ? 'ok' : 'unavailable');
  if (status === 'ok' && skipped.length) status = 'partial';
  if (!links.length && status !== 'partial') status = 'unavailable';
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
  const lat = point.lat;
  const rawLon = point.lon !== undefined ? point.lon : point.lng;
  const lon = rawLon;
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function getCoordString(point) {
  const lat = typeof point.lat === 'number' ? point.lat : Number(point.lat);
  const rawLon = point.lon !== undefined ? point.lon : point.lng;
  const lon = typeof rawLon === 'number' ? rawLon : Number(rawLon);
  return `${lat},${lon}`;
}

/**
 * Builds multi-run split Google Maps URLs ensuring NO STOPS ARE DROPPED ("không rơi chặng").
 * Public Google Maps direction URLs limit to at most 3 waypoints (5 points total: origin + 3 waypoints + dest).
 * When points exceed 5, the route is partitioned into ordered contiguous runs where run[k].destination === run[k+1].origin.
 */
export function buildDiscoveryMapsSplitUrls({ origin, stops, vehicle }) {
  if (!isValidCoordinate(origin)) return [];
  if (!Array.isArray(stops) || stops.length === 0) return [];
  const validStops = stops.filter(isValidCoordinate);
  if (validStops.length === 0 || validStops.length !== stops.length) return [];

  const { mode: travelmode } = resolveTravelMode(vehicle);
  const points = [
    { label: origin.label || 'Điểm xuất phát', coord: getCoordString(origin) }
  ];
  validStops.forEach((s, idx) => {
    points.push({ label: s.name || `Điểm ${idx + 1}`, coord: getCoordString(s) });
  });

  if (points.length === 0) return [];

  if (points.length === 1) {
    const q = new URLSearchParams({ api: '1', destination: points[0].coord, travelmode });
    const u = `https://www.google.com/maps/dir/?${q.toString()}`;
    if (isValidGoogleMapsDirUrl(u)) {
      return [{
        index: 1,
        of: 1,
        url: u,
        fromName: points[0].label,
        toName: points[0].label,
        waypointCount: 0,
        label: 'Toàn bộ lộ trình'
      }];
    }
    return [];
  }

  const links = [];
  let start = 0;
  while (start < points.length - 1) {
    const end = Math.min(start + 4, points.length - 1);
    const runPoints = points.slice(start, end + 1);

    const q = new URLSearchParams({
      api: '1',
      origin: runPoints[0].coord,
      destination: runPoints[runPoints.length - 1].coord,
      travelmode
    });

    if (runPoints.length > 2) {
      const waypoints = runPoints.slice(1, -1).map((p) => p.coord).join('|');
      q.set('waypoints', waypoints);
    }

    const u = `https://www.google.com/maps/dir/?${q.toString()}`;
    if (isValidGoogleMapsDirUrl(u)) {
      links.push({
        index: links.length + 1,
        of: 1,
        url: u,
        fromName: runPoints[0].label,
        toName: runPoints[runPoints.length - 1].label,
        waypointCount: Math.max(0, runPoints.length - 2),
        label: ''
      });
    }

    if (end === start) break;
    start = end;
  }

  links.forEach((l) => {
    l.of = links.length;
    l.label = links.length > 1
      ? `Chặng ${l.index}/${l.of}: ${l.fromName} → ${l.toName}`
      : 'Toàn bộ lộ trình';
  });

  return links;
}

/**
 * Builds the complete multi-stop Google Maps directions URL.
 * Automatically delegates to buildDiscoveryMapsSplitUrls to ensure bounded waypoints (<= 3)
 * without dropping any stop.
 */
export function buildDiscoveryMapsUrl({ origin, stops, vehicle }) {
  if (!isValidCoordinate(origin)) return null;
  if (!Array.isArray(stops) || stops.length === 0) return null;
  const validStops = stops.filter(isValidCoordinate);
  if (validStops.length === 0 || validStops.length !== stops.length) return null;

  const modeInfo = resolveTravelMode(vehicle);
  const splitLinks = buildDiscoveryMapsSplitUrls({ origin, stops, vehicle });
  if (!splitLinks || splitLinks.length === 0) return null;

  return {
    url: splitLinks[0].url,
    splitLinks,
    isSplit: splitLinks.length > 1,
    travelmode: modeInfo.mode,
    isMotorbike: modeInfo.isMotorbike,
    disclosureNote: modeInfo.disclosureNote || null,
    modeLabel: modeInfo.label
  };
}

/**
 * Builds per-leg Google Maps URLs (mobile fallback / detailed navigation).
 * Includes user origin -> first stop if origin is provided, plus all inter-stop legs.
 */
export function buildDiscoveryLegUrls({ origin, stops, vehicle }) {
  if (!Array.isArray(stops) || stops.length === 0) return [];
  const validStops = stops.filter(isValidCoordinate);
  if (validStops.length === 0 || validStops.length !== stops.length) return [];

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
