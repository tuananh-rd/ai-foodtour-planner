/**
 * qa/discovery-assistant/test_emoji_sanitizer.mjs
 * Comprehensive unit test suite for frontend/lib/emojiSanitizer.js
 *
 * Verifies:
 * 1. Flags (Regional Indicator pairs)
 * 2. ZWJ (Zero Width Joiner) complex sequences
 * 3. Skin tone modifiers (Emoji_Modifier)
 * 4. Keycaps with VS16 (\ufe0f\u20e3) and without VS16 (\u20e3)
 * 5. Ordinary numbers, prices, IDs, URLs, and Vietnamese diacritics are 100% preserved.
 * 6. sanitizeViewForDisplay preserves raw session identity, token, revision, coordinates while sanitizing display fields.
 */

import {
  EMOJI_DISPLAY_REGEX,
  hasEmoji,
  normalizeDisplayText,
  sanitizeViewForDisplay
} from '../../frontend/lib/emojiSanitizer.js';

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

console.log('=== RUNNING EMOJI SANITIZER UNIT TESTS ===\n');

// 1. Literal Flags (Regional Indicators)
console.log('[1] Testing Flags (Regional Indicators)...');
const vnFlag = 'Việt Nam 🇻🇳';
assert(normalizeDisplayText(vnFlag) === 'Việt Nam', 'VN flag removed, text preserved');
const multiFlags = 'Flags: 🇻🇳, 🇯🇵, 🇺🇸, 🇫🇷';
assert(normalizeDisplayText(multiFlags) === 'Flags: , , ,', 'Multiple country flags removed');

// 2. ZWJ (Zero-Width Joiner) Complex Sequences
console.log('\n[2] Testing ZWJ sequences...');
const family = 'Gia đình 👨‍👩‍👧‍👦 đi ăn';
assert(normalizeDisplayText(family) === 'Gia đình đi ăn', 'Family ZWJ sequence removed');
const runner = 'Vận động viên 🏃‍♀️';
assert(normalizeDisplayText(runner) === 'Vận động viên', 'Gender ZWJ sequence removed');

// 3. Skin Tone Modifiers
console.log('\n[3] Testing Skin Tone Modifiers...');
const thumbsUpMedium = 'Tuyệt vời 👍🏽!';
assert(normalizeDisplayText(thumbsUpMedium) === 'Tuyệt vời !', 'Modifier 👍🏽 removed');
const saluteDark = 'Chào Đại Ca 🫡🏿';
assert(normalizeDisplayText(saluteDark) === 'Chào Đại Ca', 'Salute with skin modifier removed');

// 4. Keycaps with and without VS16
console.log('\n[4] Testing Keycaps with and without VS16...');
const keycapWithVS16 = 'Điểm số 1️⃣ tại quán';
assert(normalizeDisplayText(keycapWithVS16) === 'Điểm số tại quán', 'Keycap with VS16 removed');
const keycapWithoutVS16 = 'Số 2\u20e3 tiếp theo';
assert(normalizeDisplayText(keycapWithoutVS16) === 'Số tiếp theo', 'Keycap without VS16 (2\\u20e3) removed');
const hashKeycap = '#️⃣ tag';
assert(normalizeDisplayText(hashKeycap) === 'tag', 'Hash keycap (#️⃣) removed');
const starKeycap = '*️⃣ sao';
assert(normalizeDisplayText(starKeycap) === 'sao', 'Star keycap (*️⃣) removed');

// 5. Raw Numbers, Prices, Vietnamese Text, URLs, and IDs Preserved
console.log('\n[5] Testing Preservation of Numbers, Prices, Vietnamese, URLs, IDs...');
const priceStr = 'Giá từ 50.000 đ đến 120.000 đ / người';
assert(normalizeDisplayText(priceStr) === priceStr, 'Ordinary prices preserved');
const numberMath = 'Số 1 + 2 = 3; 100k, 250k';
assert(normalizeDisplayText(numberMath) === numberMath, 'Ordinary digits and arithmetic preserved');
const vietnamese = 'Phở 10 Lý Quốc Sư, Ngõ Tràng Tiền, Cầu Giấy, Hoàn Kiếm, Bún chả Đắc Kim';
assert(normalizeDisplayText(vietnamese) === vietnamese, 'Full Vietnamese text and diacritics preserved');
const rawId = 'SYN-001_item-42';
assert(normalizeDisplayText(rawId) === rawId, 'Raw alphanumeric IDs with dashes/underscores preserved');
const url = 'https://www.google.com/maps/dir/?api=1&origin=21.03,105.85&destination=21.04,105.86';
assert(normalizeDisplayText(url) === url, 'Google Maps URL with query parameters preserved');

// 6. sanitizeViewForDisplay Invariants
console.log('\n[6] Testing sanitizeViewForDisplay view object preservation...');
const mockRawView = {
  contract: 'discovery-v1',
  session_id: 'mock-session-xyz_123',
  token: 'qa-secret-token-abc!@#',
  revision: 5,
  selection_version: 2,
  profile_version: 3,
  messages: [
    { role: 'user', text: 'Tìm quán bún chả ngon 🍜' },
    { role: 'assistant', text: 'Đây là gợi ý quán ngon 👍 tại Hoàn Kiếm' }
  ],
  reply: {
    text: 'Em tìm thấy 3 quán phở 🍲 dưới 70k!',
    question: 'Bạn muốn đi bộ 🚶 hay đi xe?'
  },
  results: [
    {
      id: 'SYN-001',
      name: 'Phở 10 Lý Quốc Sư 🍜',
      address: '10 Lý Quốc Sư, Hoàn Kiếm',
      description: 'Quán gia truyền 🏆 chuẩn vị Bắc',
      specialties: ['Phở bò tái 🥩', 'Quẩy giòn 🥖'],
      lat: 21.0305,
      lon: 105.8492
    }
  ],
  selection: [
    { id: 'SYN-001', name: 'Phở 10 Lý Quốc Sư 🍜', locked: true }
  ],
  tour: {
    title: 'Tour ẩm thực phố cổ 🚀',
    stops: [
      { venue_id: 'SYN-001', name: 'Phở 10 🍜', stage: 'Món chính 🍲', note: 'Ăn nóng ♨️', order: 1 }
    ],
    route_warnings: ['Chú ý thời gian cao điểm ⚠️']
  }
};

const sanitizedView = sanitizeViewForDisplay(mockRawView);

// Verification of raw identity preservation
assert(sanitizedView.session_id === mockRawView.session_id, 'session_id raw equality');
assert(sanitizedView.token === mockRawView.token, 'token raw equality');
assert(sanitizedView.revision === 5, 'revision raw equality');
assert(sanitizedView.results[0].id === 'SYN-001', 'venue id raw equality');
assert(sanitizedView.results[0].lat === 21.0305, 'latitude float preserved');
assert(sanitizedView.results[0].lon === 105.8492, 'longitude float preserved');
assert(sanitizedView.selection[0].locked === true, 'boolean lock state preserved');

// Verification of display text normalization
assert(sanitizedView.messages[0].text === 'Tìm quán bún chả ngon', 'User message emoji stripped');
assert(sanitizedView.messages[1].text === 'Đây là gợi ý quán ngon tại Hoàn Kiếm', 'Assistant message emoji stripped');
assert(sanitizedView.reply.text === 'Em tìm thấy 3 quán phở dưới 70k!', 'Reply text emoji stripped, 70k preserved');
assert(sanitizedView.reply.question === 'Bạn muốn đi bộ hay đi xe?', 'Reply question emoji stripped');
assert(sanitizedView.results[0].name === 'Phở 10 Lý Quốc Sư', 'Restaurant name emoji stripped');
assert(sanitizedView.results[0].description === 'Quán gia truyền chuẩn vị Bắc', 'Description emoji stripped');
assert(sanitizedView.results[0].specialties[0] === 'Phở bò tái', 'Specialty 1 emoji stripped');
assert(sanitizedView.results[0].specialties[1] === 'Quẩy giòn', 'Specialty 2 emoji stripped');
assert(sanitizedView.tour.title === 'Tour ẩm thực phố cổ', 'Tour title emoji stripped');
assert(sanitizedView.tour.stops[0].name === 'Phở 10', 'Stop name emoji stripped');
assert(sanitizedView.tour.stops[0].stage === 'Món chính', 'Stop stage emoji stripped');
assert(sanitizedView.tour.stops[0].note === 'Ăn nóng', 'Stop note emoji stripped');
assert(sanitizedView.tour.route_warnings[0] === 'Chú ý thời gian cao điểm', 'Route warnings emoji stripped');

console.log(`\n================================================================`);
console.log(`EMOJI SANITIZER SUITE: Passed: ${passed} | Failed: ${failed}`);
console.log(`================================================================`);
if (failed > 0) process.exit(1);
console.log('ALL EMOJI SANITIZER TESTS PASSED CLEANLY!');
