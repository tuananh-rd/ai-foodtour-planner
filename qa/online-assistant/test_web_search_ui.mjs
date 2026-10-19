/**
 * QA Test: Web Search Assistant UI & Client Contract Invariants
 * Task ID: task_529bb1dff2e5
 * Scope: Online Assistant Tavily BASIC chat integration, honest statuses, link safety
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { chatTurn, setRuntimeMockMode, isMockMode } from '../../frontend/lib/api.js';

console.log('=== QA: Web Search Assistant UI & Contract Tests ===');

// Test 1: Mock mode web_search returns honest unavailable status, never fabricated search results
console.log('Test 1: Mock mode web_search returns honest unavailable status');
setRuntimeMockMode(true);
assert.strictEqual(isMockMode(), true, 'Must be in mock mode');

const mockTurnRes = await chatTurn('mock-session-test', {
  revision: 0,
  guided: true,
  text: 'Quán cà phê trứng nào ngon ở Hoàn Kiếm?',
  web_search: true
});

assert.ok(mockTurnRes, 'Must return turn response');
const webSearchBlock = mockTurnRes.reply?.blocks?.find((b) => b.type === 'web_search');
assert.ok(webSearchBlock, 'Must include web_search block when requested');
assert.strictEqual(webSearchBlock.status, 'unavailable', 'Mock mode must return honest status="unavailable"');
assert.strictEqual(webSearchBlock.cached, false, 'cached must be false');
assert.strictEqual(webSearchBlock.credits, 0, 'credits must be 0');
assert.strictEqual(webSearchBlock.fetched_at, null, 'fetched_at must be null in mock mode');
assert.deepStrictEqual(webSearchBlock.sources, [], 'sources must be empty in mock mode');
console.log('  ✓ Mock mode returned honest unavailable block without fabrication');

// Test 2: Action turns must NOT include web_search
console.log('Test 2: Action turns omit web_search');
const mockActionRes = await chatTurn('mock-session-test', {
  revision: 1,
  guided: true,
  action: { name: 'confirm_yes' },
  web_search: true
});
const actionWebBlock = mockActionRes.reply?.blocks?.find((b) => b.type === 'web_search');
assert.strictEqual(actionWebBlock, undefined, 'Action turns must not contain web_search blocks');
console.log('  ✓ Action turn properly omitted web_search block');

// Test 3: OnlineSearchResults.jsx source code and contract invariant checks
console.log('Test 3: OnlineSearchResults source code contract assertions');
const compPath = path.resolve('frontend/app/components/v2/guided/OnlineSearchResults.jsx');
assert.ok(fs.existsSync(compPath), 'OnlineSearchResults.jsx must exist');
const compSource = fs.readFileSync(compPath, 'utf8');

// Assert mandatory disclaimer
assert.ok(
  compSource.includes('Nguồn web chưa được xác minh; không xác nhận quán đang mở hoặc an toàn dị ứng.'),
  'Must include exact mandatory safety disclaimer'
);

// Assert all OpenAPI statuses handled
const statuses = ['ok', 'disabled', 'quota', 'rejected', 'unavailable'];
for (const st of statuses) {
  assert.ok(compSource.includes(`web-search-status-${st}`), `Must handle status: ${st}`);
}

// Assert HTTPS safety check logic
assert.ok(compSource.includes("protocol === 'https:'"), 'Must strictly enforce HTTPS protocol');
assert.ok(compSource.includes('rel="noopener noreferrer"'), 'Must have safe rel attributes');
assert.ok(compSource.includes('target="_blank"'), 'Must open links in new tab');
assert.ok(!compSource.includes('dangerouslySetInnerHTML='), 'Must never use dangerouslySetInnerHTML attribute');
console.log('  ✓ Component source enforces disclaimer, all 5 statuses, HTTPS and escaping');

// Test 4: TrustDisclosure includes minimized context and free-tier privacy notice
console.log('Test 4: TrustDisclosure assertions');
const trustPath = path.resolve('frontend/app/components/v2/guided/TrustDisclosure.jsx');
const trustSource = fs.readFileSync(trustPath, 'utf8');
assert.ok(trustSource.includes('giản lược ngữ cảnh'), 'Must disclose context minimization');
assert.ok(trustSource.includes('Tra web'), 'Must mention web search opt-in behavior');
assert.ok(trustSource.includes('Quyền riêng tư dịch vụ bên thứ ba'), 'Must disclose free-tier privacy');
console.log('  ✓ TrustDisclosure disclosures verified');

// Test 5: GuidedLayout contains opt-in checkbox with testid
console.log('Test 5: GuidedLayout opt-in integration');
const guidedPath = path.resolve('frontend/app/components/v2/guided/GuidedLayout.jsx');
const guidedSource = fs.readFileSync(guidedPath, 'utf8');
assert.ok(guidedSource.includes('data-testid="web-search-optin-checkbox"'), 'Must have web-search-optin-checkbox testid');
assert.ok(guidedSource.includes('OnlineSearchResults'), 'Must import and use OnlineSearchResults');
assert.ok(guidedSource.includes('PilotMap'), 'Must import and use PilotMap');
assert.ok(guidedSource.includes('view-mode-schematic-btn'), 'Must have schematic view toggle button');
assert.ok(guidedSource.includes('view-mode-map-btn'), 'Must have map view toggle button');
console.log('  ✓ GuidedLayout integration verified');

console.log('🎉 ALL WEB SEARCH UI TESTS PASSED!');
