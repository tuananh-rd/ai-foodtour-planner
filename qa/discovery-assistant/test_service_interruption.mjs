/**
 * qa/discovery-assistant/test_service_interruption.mjs
 * Targeted verification for Truthful Single-State Outage UX on Lane 3350
 * Incorporating all coordinator review findings (msg_af6cb3d94a80).
 *
 * Verifies:
 * 1. Timeout classification: ONLY kind === 'timeout' or source === 'turn_deadline'.
 *    Transport alone without timeout is classified as transport, not timeout.
 * 2. HTTP status validation: Requires integer 400..599; null/undefined does not route to HTTP 0.
 * 3. HTTP 429: Human main copy is provider-use-limit, raw numeric status in diagnostics.
 * 4. Daily reserve & turn call cap: Daily reserve indicates temporary pause to protect quota;
 *    turn_call_cap is per-turn limit, distinct from session cap.
 * 5. Benign reasons (private_turn, safe_answer_rejected, health_disclosure) are NOT service outages.
 * 6. Legacy prefix reload: derives neutral legacy status from exact legacy prefix when metadata absent.
 * 7. formatReplySource: prioritizes explicit 'tools' before generic 'mode: rules'.
 * 8. stripLegacyOutagePrefix: strips exact prefix display-only, preserves stored history.
 */

import {
  classifyServiceInterruption,
  stripLegacyOutagePrefix,
  hasLegacyGenericPrefix,
  formatReplySource
} from '../../frontend/lib/discoveryApi.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failed += 1;
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`[PASS] ${message}`);
    passed += 1;
  }
}

console.log('=== RUNNING TARGETED SERVICE INTERRUPTION & OUTAGE UX TESTS ===\n');

// 1. Timeout classification: kind='timeout' or source='turn_deadline'
console.log('[1] Testing Timeout vs Transport Classification (Finding 1)...');
const t1 = classifyServiceInterruption({
  mode: 'rules',
  reply_source: 'rules',
  failure: { kind: 'timeout', source: 'turn_deadline' }
});
assert(t1 !== null, 'Timeout with turn_deadline is active');
assert(t1.category === 'timeout', 'Category is timeout');
assert(t1.message.includes('Hệ thống phản hồi lâu hơn dự kiến'), 'Message has waited-too-long notice');
assert(!t1.message.includes('quota') && !t1.message.includes('giới hạn'), 'No compound diagnosis with quota');

// Transport with kind='timeout' is a timeout
const t2 = classifyServiceInterruption({
  mode: 'rules',
  reply_source: 'rules',
  failure: { kind: 'timeout', source: 'transport' }
});
assert(t2.category === 'timeout', 'Transport with kind=timeout is timeout');

// Transport alone (e.g. unavailable, bad_response) is NOT timeout
const tr1 = classifyServiceInterruption({
  mode: 'rules',
  reply_source: 'rules',
  failure: { kind: 'unavailable', source: 'transport' }
});
assert(tr1.category === 'transport', 'Transport without kind=timeout is category transport, NOT timeout');
assert(tr1.message.includes('Chưa thể sử dụng phản hồi từ AI'), 'Unspecified transport failure does not invent a network root cause');

// 2. HTTP status validation: requires integer 400..599 (Finding 2)
console.log('\n[2] Testing HTTP Status Validation (Finding 2)...');
const nullHttp = classifyServiceInterruption({
  mode: 'rules',
  reply_source: 'rules',
  failure: { kind: 'quota', source: 'session_cap', http_status: null }
});
assert(nullHttp.category === 'session_cap', 'null http_status does not route to HTTP 0');
assert(nullHttp.httpStatus === null, 'httpStatus is null, not 0');

const validHttp503 = classifyServiceInterruption({
  mode: 'rules',
  reply_source: 'rules',
  failure: { kind: 'error', source: 'provider_http', http_status: 503 }
});
assert(validHttp503.category === 'provider_http', 'Valid 503 is provider_http');
assert(validHttp503.httpStatus === 503, 'httpStatus 503 captured');

// 3. HTTP 429 human main copy is provider-use-limit (Finding 3)
console.log('\n[3] Testing HTTP 429 Provider Limit Copy (Finding 3)...');
const p429 = classifyServiceInterruption({
  mode: 'rules',
  reply_source: 'rules',
  failure: { kind: 'rate_limit', source: 'provider_http', http_status: 429 }
});
assert(p429.category === 'provider_429', 'Category is provider_429');
assert(p429.httpStatus === 429, 'Raw numeric status 429 in diagnostics');
assert(p429.message.includes('Đã đạt giới hạn sử dụng từ nhà cung cấp AI'), 'Human copy is provider-use-limit');
assert(!p429.message.includes('bận (429)'), 'Human copy avoids raw status code in body');

// 4. Daily reserve & turn call cap (Finding 4)
console.log('\n[4] Testing Daily Reserve & Turn Call Cap (Finding 4)...');
const d1 = classifyServiceInterruption({
  mode: 'rules',
  reply_source: 'rules',
  failure: { kind: 'quota', source: 'daily_reserve' }
});
assert(d1.category === 'daily_reserve', 'Category is daily_reserve');
assert(d1.message.includes('tạm dừng gọi AI để bảo lưu hạn ngạch sử dụng'), 'Daily reserve explains temporary pause to protect quota');

const turnCap = classifyServiceInterruption({
  mode: 'rules',
  reply_source: 'rules',
  reason: 'turn_call_cap'
});
assert(turnCap.category === 'turn_call_cap', 'turn_call_cap is category turn_call_cap');
assert(turnCap.message.includes('giới hạn số thao tác trong một tin nhắn'), 'turn_call_cap explains per-turn limit, not session cap');

const sessCap = classifyServiceInterruption({
  mode: 'rules',
  reply_source: 'rules',
  reason: 'session_cap'
});
assert(sessCap.category === 'session_cap', 'session_cap is session conversation limit');
assert(sessCap.message.includes('số lượt trò chuyện của phiên'), 'session_cap explains session conversation limit');

// 5. Benign reasons are NOT service outages (Finding 5)
console.log('\n[5] Testing Benign Non-Outage Reasons (Finding 5)...');
assert(classifyServiceInterruption({ mode: 'rules', reply_source: 'rules', reason: 'private_turn' }) === null, 'private_turn is not an outage');
assert(classifyServiceInterruption({ mode: 'rules', reply_source: 'rules', reason: 'safe_answer_rejected' }) === null, 'safe_answer_rejected is not an outage');
assert(classifyServiceInterruption({ mode: 'rules', reply_source: 'rules', reason: 'health_disclosure' }) === null, 'health_disclosure is not an outage');

// 6. Old reload: neutral legacy status from legacy prefix (Finding 6)
console.log('\n[6] Testing Neutral Legacy Status on Old Reload (Finding 6)...');
const oldMessages = [
  { role: 'user', text: 'Tìm quán' },
  { role: 'assistant', text: 'Model chưa phản hồi hoặc đã đạt giới hạn; đang dùng xử lý tại máy. Gợi ý 3 quán ngon...' }
];
const oldReload = classifyServiceInterruption(null, oldMessages);
assert(oldReload !== null, 'Old session reload with legacy prefix detected');
assert(oldReload.category === 'legacy_local', 'Category is legacy_local');
assert(oldReload.message.includes('chế độ quy tắc nội bộ'), 'Message is neutral rules mode notice');
assert(!oldReload.message.includes('timeout') && !oldReload.message.includes('quota'), 'No invented timeout or quota guess');

// Normal messages without legacy prefix
const normalMessages = [
  { role: 'user', text: 'Chào em' },
  { role: 'assistant', text: 'Chào bạn! Em có thể giúp bạn...' }
];
assert(classifyServiceInterruption(null, normalMessages) === null, 'Normal messages return null');

// 7. formatReplySource prioritizes tools before mode rules (Finding 7)
console.log('\n[7] Testing formatReplySource Precedence (Finding 7)...');
assert(formatReplySource('tools', null, 'rules') === 'CÔNG CỤ NỘI BỘ', 'tools prioritized before mode=rules');
assert(formatReplySource('tools', 'gemini', 'gemini') === 'CÔNG CỤ NỘI BỘ', 'tools prioritized');
assert(formatReplySource('rules', null, 'rules') === 'QUY TẮC NỘI BỘ', 'rules -> QUY TẮC NỘI BỘ');
assert(formatReplySource('model', 'gemini-2.0-flash', 'gemini') === 'GEMINI-2.0-FLASH', 'model with gemini -> GEMINI-2.0-FLASH');
assert(formatReplySource('model', 'gemini-2.0-flash', 'rules') === 'QUY TẮC NỘI BỘ', 'mode=rules prevents fake model success');

// 8. stripLegacyOutagePrefix & hasLegacyGenericPrefix
console.log('\n[8] Testing stripLegacyOutagePrefix...');
const raw1 = 'Model chưa phản hồi hoặc đã đạt giới hạn; đang dùng xử lý tại máy. Xin chào bạn!';
assert(hasLegacyGenericPrefix(raw1) === true, 'hasLegacyGenericPrefix detects semicolon prefix');
assert(stripLegacyOutagePrefix(raw1) === 'Xin chào bạn!', 'Semicolon prefix stripped');

const raw2 = 'Model chưa phản hồi hoặc đã đạt giới hạn, đang dùng xử lý tại máy. Gợi ý quán phở';
assert(hasLegacyGenericPrefix(raw2) === true, 'hasLegacyGenericPrefix detects comma prefix');
assert(stripLegacyOutagePrefix(raw2) === 'Gợi ý quán phở', 'Comma prefix stripped');

const raw3 = 'Chào bạn! Em có thể giúp bạn tìm quán ngon.';
assert(hasLegacyGenericPrefix(raw3) === false, 'hasLegacyGenericPrefix false on normal text');
assert(stripLegacyOutagePrefix(raw3) === raw3, 'Normal text without prefix preserved completely');

const unproven429 = classifyServiceInterruption({ mode: 'rules', reason: '429_rules_fallback' });
assert(unproven429.category !== 'provider_429' && unproven429.httpStatus === null, 'Legacy string does not invent retained HTTP status');
const invalidResponse = classifyServiceInterruption({ mode: 'rules', failure: {kind: 'bad_response', source: 'transport'} });
assert(!invalidResponse.message.includes('Kết nối') && !invalidResponse.message.includes('lâu hơn'), 'Invalid AI response is not diagnosed as network error or timeout');
assert(classifyServiceInterruption(null, [...oldMessages, {role: 'assistant', text: 'Phản hồi mới đã hoàn tất.'}]) === null,
  'Historical legacy prefixes do not resurrect an outage after later response and reload');
assert(classifyServiceInterruption({mode: 'rules', reason: 'not_a_timeout_diagnosis'}).category !== 'timeout',
  'Unrecognized legacy text does not invent a timeout');

console.log(`\n========================================`);
console.log(`ALL TESTS PASSED! (${passed} passed, ${failed} failed)`);
console.log(`========================================\n`);
