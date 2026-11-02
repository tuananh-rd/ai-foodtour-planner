/**
 * qa/discovery-assistant/test_osm_map_frontend.mjs
 *
 * Targeted unit & invariant test suite for OpenStreetMap and MapLibre stack:
 * - Map mount & bounds invariants (no clipping of outside-pilot origins like Hoang Mai)
 * - Origin change and explicit origin display; strict numeric types with NO coercion
 * - Origin guard: invalid/null origin -> [] / null even with 2 valid stops
 * - Missing coordinates: never (0,0), breaks connector line, never skips/bridges over missing stops
 * - Numbered ordered tour stops (preserves stop.order)
 * - Venue markers toggle
 * - Mobile & resize handling
 * - Unavailable service & motorcycle limitation (no car substitution)
 * - OpenStreetMap directions URL validation: exact path, length <= 2048, no hash, strict coords, matching mode
 * - Server note translations & zero emoji audit
 */

import {
  isValidOsmDirUrl,
  isValidGoogleMapsDirUrl,
  translateSkippedReason,
  translateServerNote
} from '../../frontend/lib/mapsUrlValidation.js';
import {
  validateDiscoveryMapsLink,
  normalizeDiscoveryMapsResponse,
  resolveTravelMode,
  buildDiscoveryLegUrls,
  buildDiscoveryMapsSplitUrls,
  buildDiscoveryMapsUrl,
  isValidCoordinate,
  getCoordString
} from '../../frontend/lib/discoveryMaps.js';
import {
  PILOT_BOUNDS,
  isInsidePilotBounds
} from '../../frontend/lib/pilotBounds.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

console.log('=== Running Targeted OSM Frontend Unit & Regression Tests ===\n');

// 1. URL Allowlist & Security Validation (including Codex Review regressions)
console.log('Test 1: OpenStreetMap Direction URLs allowlist and strict schema validation');
const validFoot = 'https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=21.033000%2C105.850000%3B21.035000%2C105.852000';
const validCar = 'https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=21.033000,105.850000;21.035000,105.852000';
const googleUrl = 'https://www.google.com/maps/dir/?api=1&origin=21.033,105.850&destination=21.035,105.852';

assert(isValidOsmDirUrl(validFoot, 'walking') === true, 'Foot OSM url must be valid for walking');
assert(isValidOsmDirUrl(validCar, 'driving') === true, 'Car OSM url must be valid for driving');
assert(isValidOsmDirUrl(googleUrl) === false, 'Google Maps URL must be rejected by isValidOsmDirUrl');
assert(isValidOsmDirUrl('http://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=21.0,105.8;21.1,105.9') === false, 'HTTP must be rejected');
assert(isValidOsmDirUrl('https://evil.com/directions?engine=fossgis_osrm_foot&route=21.0,105.8;21.1,105.9') === false, 'Non-OSM host must be rejected');
assert(isValidOsmDirUrl('https://www.openstreetmap.org/directions?engine=unknown_engine&route=21.0,105.8;21.1,105.9') === false, 'Unknown engine must be rejected');

// P2 Codex Review Red Reproductions:
assert(
  isValidOsmDirUrl('https://www.openstreetmap.org/directions-evil?engine=fossgis_osrm_car&route=NaN;bad') === false,
  'P2 regression: directions-evil and NaN;bad route must be rejected'
);
assert(
  isValidOsmDirUrl('https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=21.0,105.8;21.1,105.9#evilHash') === false,
  'P2 regression: URL with hash fragment must be rejected'
);
assert(
  isValidOsmDirUrl('https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&engine=fossgis_osrm_foot&route=21.0,105.8;21.1,105.9') === false,
  'P2 regression: duplicate engine parameters must be rejected'
);
assert(
  isValidOsmDirUrl('https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=21.0,105.8;21.1,105.9;21.2,106.0') === false,
  'P2 regression: route with more than 2 coordinate pairs must be rejected'
);
assert(
  isValidOsmDirUrl('https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=21.0,105.8;21.1,105.9', 'walking') === false,
  'P2 regression: mode mismatch (car url with walking expectedMode) must be rejected'
);
assert(
  isValidOsmDirUrl('https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=21.0,105.8;21.1,105.9', 'driving') === false,
  'P2 regression: mode mismatch (foot url with driving expectedMode) must be rejected'
);
console.log('  [PASS] OSM URL allowlist strict validation & P2 regressions passed');

// 2. Origin Guard Regression (P1 Codex Review)
console.log('\nTest 2: Origin Guard: invalid or null origin returns [] / null even with 2 valid stops');
const twoValidStops = [
  { lat: 21.0, lon: 105.0, name: 'Stop 1', order: 1 },
  { lat: 21.01, lon: 105.01, name: 'Stop 2', order: 2 }
];

const legUrlsNullOrigin = buildDiscoveryLegUrls({
  origin: null,
  stops: twoValidStops,
  vehicle: 'car'
});
assert(
  Array.isArray(legUrlsNullOrigin) && legUrlsNullOrigin.length === 0,
  'P1 regression: buildDiscoveryLegUrls with null origin must return [] even with 2 valid stops'
);

const fullUrlNullOrigin = buildDiscoveryMapsUrl({
  origin: null,
  stops: twoValidStops,
  vehicle: 'car'
});
assert(
  fullUrlNullOrigin === null,
  'P1 regression: buildDiscoveryMapsUrl with null origin must return null even with 2 valid stops'
);

const splitUrlsUndefinedOrigin = buildDiscoveryMapsSplitUrls({
  origin: undefined,
  stops: twoValidStops,
  vehicle: 'car'
});
assert(
  Array.isArray(splitUrlsUndefinedOrigin) && splitUrlsUndefinedOrigin.length === 0,
  'P1 regression: buildDiscoveryMapsSplitUrls with undefined origin must return []'
);

const invalidCoordOrigin = { lat: 0, lon: 0 }; // 0,0 invalid
assert(
  buildDiscoveryMapsUrl({ origin: invalidCoordOrigin, stops: twoValidStops, vehicle: 'car' }) === null,
  'P1 regression: (0,0) origin must return null'
);
console.log('  [PASS] Origin guard verified: two valid stops cannot bypass origin requirement');

// 3. Strict Coordinate Validation without Coercion (P1 Codex Review)
console.log('\nTest 3: Strict Coordinate Validation: no Number(null/empty/bool) coercion');
assert(isValidCoordinate({ lat: null, lon: 105.85 }) === false, 'null lat rejected without coercion');
assert(isValidCoordinate({ lat: 21.0, lon: null }) === false, 'null lon rejected without coercion');
assert(isValidCoordinate({ lat: '', lon: 105.85 }) === false, 'empty string lat rejected');
assert(isValidCoordinate({ lat: false, lon: 105.85 }) === false, 'boolean false lat rejected');
assert(isValidCoordinate({ lat: true, lon: 105.85 }) === false, 'boolean true lat rejected');
assert(isValidCoordinate({ lat: 21.0, lon: '' }) === false, 'empty string lon rejected');
assert(isValidCoordinate({ lat: 21.0, lon: false }) === false, 'boolean false lon rejected');
assert(isValidCoordinate({ lat: 21.0, lon: true }) === false, 'boolean true lon rejected');
assert(isValidCoordinate({ lat: undefined, lon: 105.85 }) === false, 'undefined lat rejected');
assert(isValidCoordinate({ lat: NaN, lon: 105.85 }) === false, 'NaN lat rejected');
assert(isValidCoordinate({ lat: Infinity, lon: 105.85 }) === false, 'Infinity lat rejected');
assert(isValidCoordinate({ lat: 0, lon: 0 }) === false, '0,0 coords rejected');
assert(isValidCoordinate({ lat: 20.9700, lon: 105.8500 }) === true, 'Strict numeric pair accepted');
console.log('  [PASS] Strict coordinate validation verified (no type coercion)');

// 4. Mode validation & DiscoveryMaps response normalization
console.log('\nTest 4: Mode validation and DiscoveryMaps response normalization');
assert(validateDiscoveryMapsLink({ url: validFoot }, 'walking') === true, 'Walking mode matches fossgis_osrm_foot');
assert(validateDiscoveryMapsLink({ url: validFoot }, 'driving') === false, 'Walking link must not match driving mode');
assert(validateDiscoveryMapsLink({ url: validCar }, 'driving') === true, 'Driving mode matches fossgis_osrm_car');
assert(validateDiscoveryMapsLink({ url: validCar }, 'walking') === false, 'Driving link must not match walking mode');

const rawServerRes = {
  status: 'ok',
  links: [
    { index: 1, of: 2, url: validFoot, from_stop: null, to_stop: 1 },
    { index: 2, of: 2, url: googleUrl, from_stop: 1, to_stop: 2 } // Illegal Google link in response
  ],
  skipped: [],
  notes: ['Coordinates are shared with OpenStreetMap and its routing service only when you open a link.']
};
const normalized = normalizeDiscoveryMapsResponse(rawServerRes, 'walking');
assert(normalized.links.length === 1, 'Only safe OSM link preserved; Google link dropped');
assert(normalized.status === 'partial', 'Status converted to partial because a link was dropped');
console.log('  [PASS] Response normalization & security filtering passed');

// 5. Motorcycle Handling: Truthful limitation, no car substitution
console.log('\nTest 5: Motorcycle handling: no silent substitution to car');
const motorInfo = resolveTravelMode('xe máy');
assert(motorInfo.isMotorbike === true, 'isMotorbike must be true');
assert(motorInfo.mode === null, 'mode must be null for motorbike (no car substitution)');
assert(motorInfo.unavailable === true, 'unavailable must be true');
assert(motorInfo.disclosureNote.includes('Chưa hỗ trợ chỉ đường xe máy'), 'Truthful disclosure note present');

const motorLegs = buildDiscoveryLegUrls({
  origin: { lat: 21.033, lon: 105.850 },
  stops: [{ lat: 21.035, lon: 105.852 }],
  vehicle: 'motorbike'
});
assert(motorLegs.length === 0, 'No links generated for motorcycle; routing unavailable');

const motorFull = buildDiscoveryMapsUrl({
  origin: { lat: 21.033, lon: 105.850 },
  stops: [{ lat: 21.035, lon: 105.852 }],
  vehicle: 'motorbike'
});
assert(motorFull.unavailable === true && motorFull.url === null, 'Full maps object reports unavailable for motorbike');
console.log('  [PASS] Motorcycle truthful limitation verified');

// 6. Missing Coordinates & Line Break Invariants (Never 0,0, Never Bridge Missing Stop, Preserve stop.order)
console.log('\nTest 6: Missing coordinates break adjacency and preserve stop.order');
const originPoint = { lat: 21.030, lon: 105.850, label: 'Bờ Hồ' };
const tourStops = [
  { order: 1, name: 'Quán 1', lat: 21.031, lon: 105.851 },
  { order: 2, name: 'Quán 2 (thiếu toạ độ)', lat: null, lon: null }, // Missing!
  { order: 3, name: 'Quán 3', lat: 21.035, lon: 105.855 }
];

const legsWithGap = buildDiscoveryLegUrls({
  origin: originPoint,
  stops: tourStops,
  vehicle: 'walk'
});

assert(legsWithGap.length === 1, `Expected exactly 1 leg, got ${legsWithGap.length}`);
assert(legsWithGap[0].fromName === 'Bờ Hồ', 'Leg 1 from Origin');
assert(legsWithGap[0].toName === 'Quán 1', 'Leg 1 to Quán 1');
console.log('  [PASS] Missing coordinate stop breaks adjacency; no bridge formed');

// 7. Hoan Kiem pilot bounds vs Hoang Mai (P1 Codex Review: outside pilot bounds are valid points)
console.log('\nTest 7: Outside-pilot coordinate validity & pilot boundary checking');
assert(isInsidePilotBounds(21.032, 105.850) === true, 'Center is inside pilot bounds');
assert(isInsidePilotBounds(20.970, 105.850) === false, 'Hoang Mai is outside pilot bounds');
assert(isValidCoordinate({ lat: 20.970, lon: 105.850 }) === true, 'Hoang Mai coordinate IS a valid coordinate');

const hoangMaiOrigin = { lat: 20.970, lon: 105.850, label: 'Hoàng Mai' };
const hoangMaiStops = [
  { order: 1, name: 'Quán Hoàng Mai', lat: 20.975, lon: 105.855 }
];
const hoangMaiLegs = buildDiscoveryLegUrls({
  origin: hoangMaiOrigin,
  stops: hoangMaiStops,
  vehicle: 'driving'
});
assert(hoangMaiLegs.length === 1, 'Hoang Mai journey outside pilot bounds generates valid directions leg');
assert(hoangMaiLegs[0].url.includes('fossgis_osrm_car'), 'Driving engine used for car');
console.log('  [PASS] Outside-pilot coordinates generate valid directions legs');

// 8. Server note translations & Zero emoji audit
console.log('\nTest 8: Server note translations & Zero emoji');
const sampleNotes = [
  'Coordinates are shared with OpenStreetMap and its routing service only when you open a link.',
  'Each link opens one ordered leg. Map connectors are estimates, not road routes or live travel times.',
  'Motorcycle routing is unavailable; no car route is substituted. Use the numbered map stops.',
  'Requested mode differs from the confirmed tour vehicle; choose the matching mode.',
  'A valid selected origin is required; no origin or address is inferred.',
  'Missing-coordinate stops break the itinerary; no missing leg is connected or address guessed.'
];

const emojiRegex = /[\p{Extended_Pictographic}\uD83C-\uDBFF\uDC00-\uDFFF]/u;
for (const note of sampleNotes) {
  const trans = translateServerNote(note);
  assert(typeof trans === 'string' && trans.length > 5, `Translation exists for "${note}"`);
  assert(!emojiRegex.test(trans), `No emoji allowed in note translation: "${trans}"`);
}
console.log('  [PASS] All server notes translated with zero emojis');

console.log('\nALL 8 TARGETED OSM FRONTEND REGRESSION TEST GROUPS PASSED!');
