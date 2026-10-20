/** Focused Maps/GPS lifecycle checks; all endpoint responses are mocked. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getDiscoveryMapsLinks } from '../../frontend/lib/discoveryApi.js';
import {
  getDiscoveryMapsRequestIdentity,
  normalizeDiscoveryMapsResponse,
  resolveEffectiveDiscoveryMapsLinks
} from '../../frontend/lib/discoveryMaps.js';

const validUrl = (origin = '21.0,105.0', destination = '21.1,105.1', mode = 'walking', waypoints = '') => {
  const query = new URLSearchParams({ api: '1', origin, destination, travelmode: mode });
  if (waypoints) query.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?${query}`;
};

const stops = [
  { venue_id: 'a', lat: 21.01, lon: 105.01 },
  { venue_id: 'b', lat: 21.02, lon: 105.02 }
];
const origin = { id: 'manual-1', source: 'coordinates', lat: 21, lon: 105, label: 'Hà Nội' };
const identityArgs = { sessionId: 'session-a', sessionToken: 'token-a', revision: 3, origin, travelMode: 'walking', stops };
const identity = getDiscoveryMapsRequestIdentity(identityArgs);
for (const changed of [
  { ...identityArgs, sessionId: 'session-b' },
  { ...identityArgs, sessionToken: 'token-b' },
  { ...identityArgs, revision: 4 },
  { ...identityArgs, origin: { ...origin, id: 'manual-2' } },
  { ...identityArgs, travelMode: 'driving' }
]) {
  assert.notEqual(getDiscoveryMapsRequestIdentity(changed), identity, 'identity changes with session, token, revision, origin, and mode');
}

const complete = normalizeDiscoveryMapsResponse({
  status: 'ok', skipped: [], notes: ['mock note'],
  links: [{ index: 1, of: 1, url: validUrl('12 Nguyễn Huệ', '21.02,105.02') }]
}, 'walking');
assert.equal(complete.status, 'ok');
assert.equal(complete.links.length, 1, 'valid fallback-address link survives');
assert.equal(complete.notes[0], 'mock note');
assert.equal(resolveEffectiveDiscoveryMapsLinks({ serverMaps: complete, origin, stops, vehicle: 'walk' }).length, 1);

const partial = normalizeDiscoveryMapsResponse({
  status: 'partial',
  skipped: [{ stop_order: 2, venue_id: 'b', reason: 'no_usable_point' }],
  notes: ['Skipped stops break the itinerary into separate usable runs; missing legs are not connected.'],
  links: [
    { index: 2, of: 2, url: validUrl('21.01,105.01', '21.03,105.03') },
    { index: 1, of: 2, url: validUrl('21.0,105.0', '21.01,105.01') }
  ]
}, 'walking');
assert.equal(partial.status, 'partial');
assert.deepEqual(partial.links.map((link) => link.index), [1, 2], 'server link order is retained');
assert.deepEqual(resolveEffectiveDiscoveryMapsLinks({ serverMaps: partial, origin, stops, vehicle: 'walk' }), partial.links,
  'partial server links are used as contiguous runs without client-side bridging');

const unavailable = normalizeDiscoveryMapsResponse({ status: 'unavailable', links: [], skipped: [], notes: ['none'] }, 'walking');
assert.equal(unavailable.status, 'unavailable');
assert.equal(resolveEffectiveDiscoveryMapsLinks({ serverMaps: unavailable, origin, stops, vehicle: 'walk' }).length, 0,
  'unavailable server result suppresses client route fallback');
assert.equal(resolveEffectiveDiscoveryMapsLinks({ serverMaps: null, origin, stops, vehicle: 'walk' }).length, 1,
  'client fallback remains available after a transport error');

assert.equal(normalizeDiscoveryMapsResponse({ status: 'partial', links: [], skipped: [{ reason: 'url_too_long' }] }, 'walking').status, 'partial');
assert.equal(normalizeDiscoveryMapsResponse({ status: 'ok', links: [], skipped: [], notes: [] }, 'walking').status, 'unavailable',
  'empty successful response is surfaced as unavailable');
assert.equal(normalizeDiscoveryMapsResponse({ status: 'ok', links: [{ index: 1, url: validUrl() + 'x'.repeat(2100) }] }, 'walking').links.length, 0,
  'encoded URL length over 2048 is rejected');
assert.equal(normalizeDiscoveryMapsResponse({ status: 'ok', links: [{ index: 1, url: validUrl('a', 'b', 'walking', '1|2|3|4') }] }, 'walking').links.length, 0,
  'URLs with more than three waypoints are rejected');
assert.equal(normalizeDiscoveryMapsResponse({ status: 'ok', links: [{ index: 1, url: validUrl('a', 'b', 'driving') }] }, 'walking').links.length, 0,
  'wrong travel mode is rejected');

const originalFetch = globalThis.fetch;
let requestedUrl;
let requestedSignal;
let mockFetchResponse;
globalThis.fetch = async (url, init) => {
  requestedUrl = String(url);
  requestedSignal = init.signal;
  return mockFetchResponse;
};
try {
  const controller = new AbortController();
  mockFetchResponse = { ok: true, json: async () => ({ status: 'partial', links: [], skipped: [], notes: ['mocked'] }) };
  const response = await getDiscoveryMapsLinks('session/a', 'secret-session-token', 'driving', { signal: controller.signal });
  assert.equal(new URL(requestedUrl).searchParams.get('mode'), 'driving');
  assert.match(new URL(requestedUrl).pathname, /session%2Fa/);
  assert.equal(requestedSignal, controller.signal, 'request forwards effect abort signal');
  assert.equal(response.status, 'partial', 'mock endpoint response is passed through');
  mockFetchResponse = { ok: true, json: async () => ({ status: 'ok', links: [], skipped: [], notes: [] }) };
  assert.equal((await getDiscoveryMapsLinks('session/a', 'token', 'walking')).links.length, 0, 'empty mock response is handled');
  mockFetchResponse = { ok: false, status: 503, statusText: 'Unavailable', json: async () => ({ message: 'mock failure' }) };
  await assert.rejects(() => getDiscoveryMapsLinks('session/a', 'token', 'walking'), /mock failure/, 'mock endpoint errors reject for client fallback');
} finally {
  globalThis.fetch = originalFetch;
}

// React component source checks cover the effect cleanup and lock cleanup paths
// without introducing a new renderer dependency into the project.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const timelineSource = fs.readFileSync(path.join(root, 'frontend/app/components/v2/guided/GuidedTimeline.jsx'), 'utf8');
const layoutSource = fs.readFileSync(path.join(root, 'frontend/app/components/v2/guided/DiscoveryLayout.jsx'), 'utf8');
assert.ok(timelineSource.indexOf('useEffect(() => {') < timelineSource.indexOf('if (!tour || stops.length === 0) {'), 'timeline hooks run before conditional return');
assert.match(timelineSource, /ac\.abort\(\)/, 'Maps effect aborts during cleanup');
assert.match(timelineSource, /mapsIdentityRef\.current !== requestedIdentity/, 'stale Maps responses are ignored');
assert.match(layoutSource, /gpsRequestRef\.current !== gpsRequestId/, 'stale GPS callbacks are ignored');
assert.match(layoutSource, /invokedRevision !== liveSession\.revision/, 'GPS callbacks are discarded after a revision change');
assert.match(layoutSource, /setGpsPending\(false\)[\s\S]*operationLockRef\.current = false/, 'session changes release pending GPS lock');
assert.ok((layoutSource.match(/gpsRequestRef\.current \+= 1/g) || []).length >= 3, 'GPS completion/error/sync-error invalidate duplicate callbacks');
assert.match(layoutSource, /if \(err\.code === 1\)[\s\S]*else if \(err\.code === 2\)[\s\S]*else if \(err\.code === 3\)/,
  'denied, unavailable, and timeout callback outcomes are handled');
assert.match(layoutSource, /catch \(syncErr\)[\s\S]*operationLockRef\.current = false[\s\S]*setGpsPending\(false\)/,
  'synchronous geolocation errors release GPS state and the operation lock');

console.log('PASS: focused Maps/GPS lifecycle checks (mock endpoint, identity, response coverage, URL bounds, abort, GPS lock guards).');
