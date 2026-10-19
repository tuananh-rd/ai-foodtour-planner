/**
 * QA Test: Web Search Assistant UI & Client Contract Invariants
 * Task ID: task_529bb1dff2e5
 * Scope: Online Assistant Tavily BASIC chat integration, honest statuses, link safety, state short-circuit
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { chatTurn, setRuntimeMockMode, isMockMode } from '../../frontend/lib/api.js';

console.log('=== QA: Web Search Assistant UI & Contract Tests ===');

setRuntimeMockMode(true);
assert.strictEqual(isMockMode(), true, 'Must be in mock mode');

// Test 1: Mock mode web_search returns honest unavailable status, never fabricated search results
console.log('Test 1: Mock mode web_search returns honest unavailable status and retains originating query');
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
assert.strictEqual(webSearchBlock.query, 'Quán cà phê trứng nào ngon ở Hoàn Kiếm?', 'Must retain originating query');
console.log('  ✓ Mock mode returned honest unavailable block and preserved originating query');

// Test 2: Action turns must NOT include web_search
console.log('Test 2: Action turns omit web_search');
const mockActionRes = await chatTurn('mock-session-test', {
  revision: 0,
  guided: true,
  action: { name: 'confirm_yes' },
  web_search: true
});
const actionWebBlock = mockActionRes.reply?.blocks?.find((b) => b.type === 'web_search');
assert.strictEqual(actionWebBlock, undefined, 'Action turns must not contain web_search blocks');
console.log('  ✓ Action turn properly omitted web_search block');

// Test 3: Mock web_search short-circuits state mutation per review requirement (msg_9b93380962c7)
console.log('Test 3: Mock web_search short-circuit state mutation check');
const sessionKey = 'mock-session-shortcircuit-' + Date.now();
// Setup initial session with baseline text
const initRes = await chatTurn(sessionKey, { revision: 0, text: 'Ăn sáng phở' });
const profileSnapBefore = JSON.stringify(initRes.chat.profile);
const tourSnapBefore = JSON.stringify(initRes.tour || null);

// Send turn with web_search: true containing numbers/budget that would normally mutate slots
const webTurnRes = await chatTurn(sessionKey, {
  revision: initRes.revision,
  text: 'Quán ăn ngon giá 500k cho 4 người',
  web_search: true
});

assert.ok(webTurnRes.reply.blocks.some((b) => b.type === 'web_search'), 'Must return web_search block');
assert.strictEqual(JSON.stringify(webTurnRes.chat.profile), profileSnapBefore, 'Profile slots MUST NOT be mutated by web_search turn');
assert.strictEqual(JSON.stringify(webTurnRes.tour || null), tourSnapBefore, 'Tour MUST NOT be mutated by web_search turn');
console.log('  ✓ Mock web search cleanly short-circuited without mutating profile slots or tour');

// Test 4: OnlineSearchResults.jsx source code and contract invariant checks
console.log('Test 4: OnlineSearchResults source code contract assertions');
const compPath = path.resolve('frontend/app/components/v2/guided/OnlineSearchResults.jsx');
assert.ok(fs.existsSync(compPath), 'OnlineSearchResults.jsx must exist');
const compSource = fs.readFileSync(compPath, 'utf8');

// Assert mandatory disclaimer
assert.ok(
  compSource.includes('Nguồn web chưa được xác minh; không xác nhận quán đang mở hoặc an toàn dị ứng.'),
  'Must include exact mandatory safety disclaimer'
);

// Assert stable selectors
assert.ok(compSource.includes('data-testid="online-search-results"'), 'Must have online-search-results testid');
assert.ok(compSource.includes('data-testid="web-search-card"'), 'Must have web-search-card testid');

// Assert all OpenAPI statuses handled
const statuses = ['ok', 'disabled', 'quota', 'rejected', 'unavailable'];
for (const st of statuses) {
  assert.ok(compSource.includes(`web-search-status-${st}`), `Must handle status: ${st}`);
}

// Assert HTTPS safety check logic and text escaping
assert.ok(compSource.includes("protocol !== 'https:'"), 'Must strictly enforce HTTPS protocol');
assert.ok(compSource.includes('rel="noopener noreferrer"'), 'Must have safe rel attributes');
assert.ok(compSource.includes('target="_blank"'), 'Must open links in new tab');
assert.ok(!compSource.includes('dangerouslySetInnerHTML='), 'Must never use dangerouslySetInnerHTML attribute');

// Behavioral execution of isSafeHttpsUrl logic against backend search_safety.py vectors
const isSafeFnMatch = compSource.match(/export function isSafeHttpsUrl\([\s\S]*?\n\}/);
assert.ok(isSafeFnMatch, 'Must find isSafeHttpsUrl function');
const isSafeHttpsUrl = new Function(isSafeFnMatch[0].replace('export function', 'function') + '; return isSafeHttpsUrl;')();

const rejectedVectors = [
  'javascript:alert(1)',
  'http://example.com',
  'https://127.0.0.1/',
  'https://127.000.000.001/',
  'https://0x7f.0.0.1/',
  'https://2130706433/',
  'https://[::1]/',
  'https://example.local/',
  'https://example.internal/',
  'https://example.lan/',
  'https://u:p@example.com/',
  'https://example.com:8443/',
  'https://example.com/\nhello'
];
for (const u of rejectedVectors) {
  assert.strictEqual(isSafeHttpsUrl(u), false, `Must reject unsafe URL: ${u}`);
}
assert.strictEqual(isSafeHttpsUrl('https://example.com/food?q=pho'), true, 'Must accept valid public HTTPS URL');
console.log('  ✓ Component source enforces disclaimer, all 5 statuses, HTTPS, escaping, and stable testids');
console.log('  ✓ Runtime isSafeHttpsUrl behavior strictly aligned with backend search_safety.py vectors');

// Test 5: TrustDisclosure includes minimized context and free-tier privacy notice
console.log('Test 5: TrustDisclosure assertions');
const trustPath = path.resolve('frontend/app/components/v2/guided/TrustDisclosure.jsx');
const trustSource = fs.readFileSync(trustPath, 'utf8');
assert.ok(trustSource.includes('giản lược ngữ cảnh'), 'Must disclose context minimization');
assert.ok(trustSource.includes('Tra web'), 'Must mention web search opt-in behavior');
assert.ok(trustSource.includes('Quyền riêng tư dịch vụ bên thứ ba'), 'Must disclose free-tier privacy');
console.log('  ✓ TrustDisclosure disclosures verified');

// Test 6: GuidedLayout contains opt-in checkbox with stable testids
console.log('Test 6: GuidedLayout integration & stable selectors');
const guidedPath = path.resolve('frontend/app/components/v2/guided/GuidedLayout.jsx');
const guidedSource = fs.readFileSync(guidedPath, 'utf8');
assert.ok(guidedSource.includes('data-testid="online-search-toggle"'), 'Must have online-search-toggle testid');
assert.ok(guidedSource.includes('data-testid="web-search-optin-checkbox"'), 'Must have web-search-optin-checkbox testid');
assert.ok(guidedSource.includes('data-testid="pilot-map-toggle"'), 'Must have pilot-map-toggle testid');
assert.ok(guidedSource.includes('OnlineSearchResults'), 'Must import and use OnlineSearchResults');
assert.ok(guidedSource.includes('PilotMap'), 'Must import and use PilotMap');
console.log('  ✓ GuidedLayout integration and stable selectors verified');

console.log('🎉 ALL WEB SEARCH UI TESTS PASSED!');
