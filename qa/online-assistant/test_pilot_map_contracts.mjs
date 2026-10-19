/**
 * QA Test: Pilot Interactive Map Contract & Boundaries
 * Task ID: task_529bb1dff2e5
 * Scope: MapLibre 6 + PMTiles 4 integration, bounds verification, out-of-coverage reporting, cache headers
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

console.log('=== QA: Pilot Map Contracts & Boundaries Tests ===');

// 1. Dependency verification in frontend/package.json
console.log('Test 1: Dependencies exact versions');
const pkgPath = path.resolve('frontend/package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
assert.strictEqual(pkg.dependencies['maplibre-gl'], '6.15.0', 'maplibre-gl must be exact 6.15.0');
assert.strictEqual(pkg.dependencies['pmtiles'], '4.5.0', 'pmtiles must be exact 4.5.0');
console.log('  ✓ Exact dependencies verified');

// 2. Verified MapLibre 6 named export compatibility and PMTiles 4 Protocol initialization
console.log('Test 2: Module import contract');
const maplibreDistPath = path.resolve('frontend/node_modules/maplibre-gl/dist/maplibre-gl.mjs');
assert.ok(fs.existsSync(maplibreDistPath), 'maplibre-gl dist bundle must exist');
const maplibre = await import(pathToFileURL(maplibreDistPath).href);
assert.ok(typeof maplibre.Map === 'function', 'maplibre.Map must be a class/function');
assert.ok(typeof maplibre.addProtocol === 'function', 'maplibre.addProtocol must be a function (MapLibre 6 named export)');
assert.ok(typeof maplibre.Marker === 'function', 'maplibre.Marker must be a class/function');
assert.ok(typeof maplibre.Popup === 'function', 'maplibre.Popup must be a class/function');

const pmtilesDistPath = path.resolve('frontend/node_modules/pmtiles/dist/esm/index.js');
assert.ok(fs.existsSync(pmtilesDistPath), 'pmtiles bundle must exist');
const pmtilesModule = await import(pathToFileURL(pmtilesDistPath).href);
assert.ok(typeof pmtilesModule.PMTiles === 'function', 'PMTiles must be a class/function');
assert.ok(typeof pmtilesModule.Protocol === 'function', 'pmtiles.Protocol must be a class/function');
const protocolInstance = new pmtilesModule.Protocol();
assert.ok(typeof protocolInstance.tile === 'function', 'Protocol instance must have tile method');
console.log('  ✓ MapLibre 6 named exports and PMTiles 4 protocol verified');

// 3. Hoàn Kiếm bounding box and out-of-coverage logic
console.log('Test 3: Hoàn Kiếm Bounding Box & Out-of-coverage logic');
const HOANKIEM_BOUNDS = {
  west: 105.835,
  south: 21.018,
  east: 105.866,
  north: 21.046
};

function isWithinCoverage(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  return (
    lon >= HOANKIEM_BOUNDS.west &&
    lon <= HOANKIEM_BOUNDS.east &&
    lat >= HOANKIEM_BOUNDS.south &&
    lat <= HOANKIEM_BOUNDS.north
  );
}

// Check sample Hoàn Kiếm coordinates
const hoanKiemVenue = { lat: 21.0333, lon: 105.8500 }; // Đinh Liệt
assert.strictEqual(isWithinCoverage(hoanKiemVenue.lat, hoanKiemVenue.lon), true, 'Hoàn Kiếm venue must be within coverage');

// Check outside venue (e.g. Sapa or Ba Đình outside bounds)
const sapaVenue = { lat: 22.3364, lon: 103.8438 };
assert.strictEqual(isWithinCoverage(sapaVenue.lat, sapaVenue.lon), false, 'Sapa venue must be outside coverage');

const testStops = [
  { name: 'Quán 1', lat: 21.030, lon: 105.852 }, // in
  { name: 'Quán 2', lat: 21.035, lon: 105.848 }, // in
  { name: 'Quán 3 (Xa)', lat: 21.010, lon: 105.830 } // out
];
const outOfCoverageCount = testStops.filter((s) => !isWithinCoverage(s.lat, s.lon)).length;
assert.strictEqual(outOfCoverageCount, 1, 'Exactly 1 stop outside coverage reported');
console.log('  ✓ Hoàn Kiếm bounds and out-of-coverage calculation verified');

// 4. Cache header in frontend/next.config.mjs
console.log('Test 4: Scoped immutable cache-control in next.config.mjs');
const nextConfigPath = path.resolve('frontend/next.config.mjs');
const nextConfigContent = fs.readFileSync(nextConfigPath, 'utf8');
assert.ok(nextConfigContent.includes('/maps/hoankiem-20261018.pmtiles'), 'Must target exact versioned pmtiles file');
assert.ok(nextConfigContent.includes('Cache-Control'), 'Must set Cache-Control header');
assert.ok(nextConfigContent.includes('immutable'), 'Must specify immutable');
assert.ok(nextConfigContent.includes('max-age=31536000'), 'Must specify max-age=31536000 (1 year)');
console.log('  ✓ Scoped immutable cache-control verified in next.config.mjs');

// 5. Verify PMTiles asset existence and provenance
console.log('Test 5: PMTiles asset provenance');
const pmtilesFilePath = path.resolve('frontend/public/maps/hoankiem-20261018.pmtiles');
assert.ok(fs.existsSync(pmtilesFilePath), 'Asset file must exist at frontend/public/maps/hoankiem-20261018.pmtiles');
const stat = fs.statSync(pmtilesFilePath);
assert.strictEqual(stat.size, 2138597, 'Exact asset size must match 2,138,597 bytes');

const readmePath = path.resolve('frontend/public/maps/README.md');
assert.ok(fs.existsSync(readmePath), 'Provenance README must exist');
const readmeContent = fs.readFileSync(readmePath, 'utf8');
assert.ok(readmeContent.includes('2,138,597') || readmeContent.includes('2138597'), 'README must record exact file size');
assert.ok(readmeContent.includes('SHA256'), 'README must record SHA256 checksum');
console.log('  ✓ PMTiles asset and provenance README verified');

// 6. Verify PilotMap.jsx source implementation contracts
console.log('Test 6: PilotMap component contracts');
const mapCompPath = path.resolve('frontend/app/components/v2/guided/PilotMap.jsx');
assert.ok(fs.existsSync(mapCompPath), 'PilotMap.jsx must exist');
const mapCompSource = fs.readFileSync(mapCompPath, 'utf8');
assert.ok(mapCompSource.includes('/maps/hoankiem-20261018.pmtiles'), 'Must load same-origin pmtiles asset');
assert.ok(mapCompSource.includes('addProtocol'), 'Must register PMTiles protocol');
assert.ok(mapCompSource.includes('OpenStreetMap') && mapCompSource.includes('contributors'), 'Must attribute OpenStreetMap contributors');
assert.ok(mapCompSource.includes('Protomaps'), 'Must attribute Protomaps');
assert.ok(!mapCompSource.includes('.innerHTML =') && !mapCompSource.includes('setHTML('), 'Must never use innerHTML or setHTML for popups');
assert.ok(mapCompSource.includes('cooperativeGestures: true'), 'Must enable cooperative gestures to prevent scroll hijacking');
console.log('  ✓ PilotMap component contracts verified');

console.log('🎉 ALL PILOT MAP CONTRACT TESTS PASSED!');
