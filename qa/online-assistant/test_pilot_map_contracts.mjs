/**
 * QA Contract Test: Pilot Interactive Map & Boundaries
 * Task ID: task_529bb1dff2e5
 * Scope: MapLibre 6 + PMTiles 4 integration, pilot bounds contracts, cache headers, lifecycle invariants
 * 
 * Note (msg_a8f9d964e263): Static source assertions are labelled as contract checks.
 * Functional bounds, toggle, and error fallback evidence is captured directly via real browser CDP.
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

// 3. Cache header in frontend/next.config.mjs
console.log('Test 3: Scoped immutable cache-control in next.config.mjs');
const nextConfigPath = path.resolve('frontend/next.config.mjs');
const nextConfigContent = fs.readFileSync(nextConfigPath, 'utf8');
assert.ok(nextConfigContent.includes('/maps/hoankiem-20261018.pmtiles'), 'Must target exact versioned pmtiles file');
assert.ok(nextConfigContent.includes('/maps/maplibre-gl-worker-6.15.0.mjs'), 'Must target exact versioned worker file');
assert.ok(nextConfigContent.includes('Cache-Control'), 'Must set Cache-Control header');
assert.ok(nextConfigContent.includes('immutable'), 'Must specify immutable');
assert.ok(nextConfigContent.includes('max-age=31536000'), 'Must specify max-age=31536000 (1 year)');
console.log('  ✓ Scoped immutable cache-control verified in next.config.mjs');

// 4. Verify PMTiles & Worker assets existence and provenance
console.log('Test 4: PMTiles and Web Worker asset provenance');
const pmtilesFilePath = path.resolve('frontend/public/maps/hoankiem-20261018.pmtiles');
assert.ok(fs.existsSync(pmtilesFilePath), 'Asset file must exist at frontend/public/maps/hoankiem-20261018.pmtiles');
const stat = fs.statSync(pmtilesFilePath);
assert.strictEqual(stat.size, 2138597, 'Exact asset size must match 2,138,597 bytes');

const workerFilePath = path.resolve('frontend/public/maps/maplibre-gl-worker-6.15.0.mjs');
assert.ok(fs.existsSync(workerFilePath), 'Worker file must exist at frontend/public/maps/maplibre-gl-worker-6.15.0.mjs');
const workerStat = fs.statSync(workerFilePath);
assert.strictEqual(workerStat.size, 518806, 'Exact worker asset size must match 518,806 bytes');

const readmePath = path.resolve('frontend/public/maps/README.md');
assert.ok(fs.existsSync(readmePath), 'Provenance README must exist');
const readmeContent = fs.readFileSync(readmePath, 'utf8');
assert.ok(readmeContent.includes('2,138,597') || readmeContent.includes('2138597'), 'README must record exact file size');
assert.ok(readmeContent.includes('SHA256'), 'README must record SHA256 checksum');
assert.ok(readmeContent.includes('maplibre-gl-worker-6.15.0.mjs'), 'README must record versioned worker asset');
console.log('  ✓ PMTiles and Web Worker assets and provenance README verified');

// 5. Verify PilotMap.jsx source implementation contracts
console.log('Test 5: PilotMap component contracts & review gates');
const mapCompPath = path.resolve('frontend/app/components/v2/guided/PilotMap.jsx');
assert.ok(fs.existsSync(mapCompPath), 'PilotMap.jsx must exist');
const mapCompSource = fs.readFileSync(mapCompPath, 'utf8');

// Contract assertions
assert.ok(mapCompSource.includes('/maps/hoankiem-20261018.pmtiles'), 'Must load same-origin pmtiles asset');
assert.ok(mapCompSource.includes('addProtocol'), 'Must register PMTiles protocol');
assert.ok(mapCompSource.includes('setWorkerUrl'), 'Must configure MapLibre worker URL');
assert.ok(mapCompSource.includes('OpenStreetMap') && mapCompSource.includes('contributors'), 'Must attribute OpenStreetMap contributors');
assert.ok(mapCompSource.includes('Protomaps'), 'Must attribute Protomaps');
assert.ok(!mapCompSource.includes('.innerHTML =') && !mapCompSource.includes('setHTML('), 'Must never use innerHTML or setHTML for popups');
assert.ok(mapCompSource.includes('cooperativeGestures: true'), 'Must enable cooperative gestures to prevent scroll hijacking');

// Review gate assertions per msg_1b00b24b7fe4, msg_edbb8aee33c9, msg_bf938d69f59e
assert.ok(mapCompSource.includes('exactPilotMaxBounds'), 'Must use exact pilot maxBounds without expanded offsets');
assert.ok(mapCompSource.includes('PILOT_BOUNDS.west') && mapCompSource.includes('PILOT_BOUNDS.south'), 'Must bound maxBounds to exact pilot coordinates');
assert.ok(mapCompSource.includes('cleanupMap()'), 'Must clean up map and markers on failure or unmount');
assert.ok(mapCompSource.includes('markerGenRef'), 'Must track marker generation to avoid stale/duplicate markers');
assert.ok(mapCompSource.includes('renderMarkersSync'), 'Must render markers synchronously on map creation');
assert.ok(mapCompSource.includes("btn.type = 'button'"), 'Must use native <button> element for markers');
assert.ok(mapCompSource.includes('data-testid="pilot-map-canvas"'), 'Must expose pilot-map-canvas testid');
assert.ok(mapCompSource.includes('data-testid="pilot-markers-toggle"'), 'Must expose pilot-markers-toggle testid');
assert.ok(mapCompSource.includes('data-testid="pilot-map-fallback"'), 'Must expose pilot-map-fallback testid');
console.log('  ✓ PilotMap component contracts and review gates verified');

console.log('🎉 ALL PILOT MAP CONTRACT TESTS PASSED!');
