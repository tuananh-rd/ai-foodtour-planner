/**
 * qa/discovery-assistant/test_emoji_sanitizer.mjs
 * Comprehensive unit test suite for frontend/lib/emojiSanitizer.js
 *
 * Verifies:
 * 1. Visible pictographs / symbols replaced with space separator so words/numbers do not join (20🍜30 -> 20 30).
 * 2. Invisible formatting characters (VS15/16, ZWJ, tags) removed without inserting spaces (Ph\u200dở -> Phở).
 * 3. Exact parity with Codex backend plain_text tests (Python test_presentation.py).
 * 4. Flags (Regional Indicator pairs) and keycaps with/without VS16.
 * 5. Ordinary numbers, prices, arithmetic, times, arrows, URLs, IDs, and Vietnamese diacritics are 100% preserved.
 * 6. Comprehensive actual-schema projection coverage:
 *    - district, dish_tags, hours.display, price.evidence, details
 *    - confirmation.summary, confirmation.profile, confirmation.warnings
 *    - tour.explanation, tour.reasons, tour.unknowns, proposed_changes, route_warnings
 *    - stops: address, district, why, hours.display, nested venue (stops[].venue)
 * 7. Raw session identity, token, revision, versions, and coordinates preserved identically.
 */

import {
  VISIBLE_EMOJI_REGEX,
  hasEmoji,
  normalizeDisplayText,
  sanitizeRestaurantForDisplay,
  sanitizeStopForDisplay,
  sanitizeConfirmationForDisplay,
  sanitizeProfileForDisplay,
  sanitizeTourForDisplay,
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

console.log('=== RUNNING COMPREHENSIVE EMOJI SANITIZER UNIT TESTS ===\n');

// 1. Boundary Preservation & Separator Replacement (Codex Review Invariant)
console.log('[1] Testing Word & Number Boundary Preservation with Separator...');
assert(normalizeDisplayText('20🍜30') === '20 30', '20🍜30 becomes "20 30", numbers do not join');
assert(normalizeDisplayText('Phở🍜ngon') === 'Phở ngon', 'Phở🍜ngon becomes "Phở ngon", words do not join');
assert(normalizeDisplayText('20🍜30 Phở🍜ngon') === '20 30 Phở ngon', 'Combined phrase preserves word and number boundaries');
assert(normalizeDisplayText('Ph\u200dở \ufe0f') === 'Phở', 'Invisible ZWJ format code removed without splitting "Phở"');

// 2. Exact Parity with Codex Backend Presentation Tests (test_presentation.py)
console.log('\n[2] Testing Exact Parity with Codex Backend test_presentation.py...');
const codexBackendText = 'Phở \U0001f35c 70.000 đ, 2 người\n\U0001f1fb\U0001f1f3 \U0001f469\U0001f3fd\u200d\U0001f373 1\ufe0f\u20e3 \u26a0\ufe0f Chưa rõ giờ'
  .replace(/\\U0001f35c/g, '🍜')
  .replace(/\u{1f35c}/gu, '🍜');
const actualBackendSample = 'Phở 🍜 70.000 đ, 2 người\n🇻🇳 👩🏽‍🍳 1️⃣ ⚠️ Chưa rõ giờ';
assert(normalizeDisplayText(actualBackendSample) === 'Phở 70.000 đ, 2 người\n Chưa rõ giờ', 'Exact backend sample matches expected presentation');
assert(normalizeDisplayText('18:00 → 19:00; 0–5 phút') === '18:00 → 19:00; 0–5 phút', 'Times, arrows and en-dashes preserved unaltered');

// 3. Flags and Complex Sequences
console.log('\n[3] Testing Flags & Complex Sequences...');
assert(normalizeDisplayText('Việt Nam 🇻🇳') === 'Việt Nam', 'VN flag removed, text preserved');
assert(normalizeDisplayText('Flags: 🇻🇳, 🇯🇵, 🇺🇸, 🇫🇷') === 'Flags: , , ,', 'Multiple country flags removed');
assert(normalizeDisplayText('Gia đình 👨‍👩‍👧‍👦 đi ăn') === 'Gia đình đi ăn', 'Family ZWJ sequence removed');
assert(normalizeDisplayText('Tuyệt vời 👍🏽!') === 'Tuyệt vời !', 'Modifier 👍🏽 removed');
assert(normalizeDisplayText('Chào Đại Ca 🫡🏿') === 'Chào Đại Ca', 'Salute with skin modifier removed');

// 4. Keycaps with and without VS16
console.log('\n[4] Testing Keycaps with and without VS16...');
assert(normalizeDisplayText('Điểm số 1️⃣ tại quán') === 'Điểm số tại quán', 'Keycap with VS16 removed as a unit');
assert(normalizeDisplayText('Số 2\u20e3 tiếp theo') === 'Số tiếp theo', 'Keycap without VS16 (2\\u20e3) removed as a unit');
assert(normalizeDisplayText('#️⃣ tag') === 'tag', 'Hash keycap (#️⃣) removed');
assert(normalizeDisplayText('*️⃣ sao') === 'sao', 'Star keycap (*️⃣) removed');

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

// 6. Comprehensive Actual-Schema Projection Coverage
console.log('\n[6] Testing Comprehensive Actual-Schema Projection Coverage...');
const fullSchemaRawView = {
  contract: 'discovery-v1',
  session_id: 'mock-session-full-schema_999',
  token: 'qa-secret-token-xyz!@#',
  revision: 8,
  selection_version: 3,
  profile_version: 4,
  status: 'ok',
  source: { dataset_source: 'private', dataset_version: '2026-10-20' },
  provider: { mode: 'gemini', calls: 1 },
  diagnostics: { tool_calls: 2, elapsed_ms: 120.5, weather: 'unavailable' },

  // Messages
  messages: [
    { role: 'user', text: 'Tìm quán ăn ngon🍜quanh Hoàn Kiếm' },
    { role: 'assistant', text: 'Chào bạn!👋 Đây là danh sách 3 quán tiêu biểu🍲' }
  ],

  // Reply
  reply: {
    text: 'Đã tìm thấy 3 quán phù hợp🍜với ngân sách 50k-100k',
    question: 'Bạn muốn đi bộ🚶hay đi xe máy🏍️?'
  },

  // Results with district, dish_tags, hours.display, price.evidence, details
  results: [
    {
      id: 'VENUE-001',
      name: 'Phở 10 Lý Quốc Sư🍜',
      address: '10 Lý Quốc Sư🍜',
      district: 'Quận Hoàn Kiếm🏛️',
      dish_tags: ['Phở bò tái🥩', 'Quẩy giòn🥖'],
      price: { min_vnd: 50000, max_vnd: 110000, semantics: 'venue_range', evidence: 'Theo menu chụp tại quán📋' },
      hours: { status: 'verified', display: '06:00⏰22:00 hàng ngày' },
      rating: { value: 4.5, count: 120 },
      source_url: 'https://example.com/source/pho10?ref=123',
      source_fetched_at: '2026-10-19T10:00:00Z',
      unknowns: ['Chưa rõ độ ngọt nước dùng🍬'],
      locked: true,
      label: 'A',
      description: 'Quán phở truyền thống🏆nổi tiếng Hà Nội',
      specialties: ['Phở tái lăn🥩', 'Nước dùng thanh ngọt🍲'],
      lat: 21.0305,
      lon: 105.8492,
      details: {
        address: 'Số 10 Lý Quốc Sư🍜, Phường Hàng Trống',
        district: 'Hoàn Kiếm🏛️',
        description: 'Chi tiết không gian quán ấm cúng🏡',
        dish_tags: ['Phở tái🥩', 'Phở chín🍖'],
        specialties: ['Phở bò gia truyền🏆'],
        hours: { display: '06:30⏰21:30' }
      }
    }
  ],

  // Selection
  selection: [
    {
      id: 'VENUE-001',
      name: 'Phở 10 Lý Quốc Sư🍜',
      address: '10 Lý Quốc Sư🍜',
      district: 'Hoàn Kiếm🏛️',
      dish_tags: ['Phở bò🥩'],
      locked: true,
      price: { min_vnd: 50000, max_vnd: 110000, semantics: 'venue_range', evidence: 'Nguồn quán📋' },
      hours: { status: 'verified', display: '06:00⏰22:00' }
    }
  ],

  // Comparison
  comparison: {
    criteria: ['Giá cả💰', 'Khoảng cách🚶', 'Thời gian mở cửa⏰'],
    unknowns: ['Thành phần dị ứng đậu phộng🥜'],
    venues: [
      {
        id: 'VENUE-001',
        name: 'Phở 10🍜',
        address: '10 Lý Quốc Sư🍜',
        district: 'Hoàn Kiếm🏛️',
        dish_tags: ['Phở bò🥩'],
        price: { min_vnd: 50000, max_vnd: 110000, semantics: 'venue_range', evidence: 'Nguồn quán📋' },
        hours: { status: 'verified', display: '06:00⏰22:00' }
      }
    ]
  },

  // Confirmation with summary and profile
  confirmation: {
    id: 'CONF-REV-8-ABC',
    profile_version: 4,
    selection_version: 3,
    warnings: ['Chưa xác minh thành phần dị ứng🥜theo nguồn ghi'],
    summary: {
      title: 'Lịch trình ẩm thực phố cổ🚀',
      notes: 'Lịch trình ưu tiên đi bộ gần🚶',
      description: 'Tóm tắt chuyến đi 3 quán🍲',
      area: 'Khu vực Hoàn Kiếm🏛️',
      missing: ['Chưa rõ phương tiện di chuyển🚗'],
      shortlist: [{ name: 'Phở 10 Lý Quốc Sư🍜' }],
      venues: [{ name: 'Phở 10 Lý Quốc Sư🍜' }],
      items: [
        { id: 'area', label: 'Khu vực🏛️', value: 'Phố Cổ🍜' },
        { id: 'budget', label: 'Ngân sách💰', value: '150.000 đ' }
      ]
    },
    profile: {
      area: 'Hoàn Kiếm🏛️',
      tastes: ['Phở bò🥩', 'Bún chả🍖'],
      exclusions: ['Hành sống🧅'],
      allergies: ['Đậu phộng🥜'],
      party_size: 2,
      budget_vnd: 200000,
      budget_scope: 'group',
      vehicle: 'walk'
    }
  },

  // Profile (top-level)
  profile: {
    area: 'Hoàn Kiếm🏛️',
    tastes: ['Phở bò🥩'],
    exclusions: ['Hành sống🧅'],
    allergies: ['Đậu phộng🥜'],
    party_size: 2,
    budget_vnd: 200000,
    budget_scope: 'group',
    start_time: '18:00',
    duration_min: 120,
    vehicle: 'walk'
  },

  // Tour with explanation, reasons, unknowns, stops, nested venue, address, district, why
  tour: {
    revision: 8,
    status: 'verified_feasible',
    title: 'Tour ẩm thực đêm Hoàn Kiếm🌙',
    explanation: 'Lộ trình đi bộ tối ưu quanh phố cổ🚶, các quán cách nhau dưới 500m.',
    reasons: ['Gần điểm xuất phát📍', 'Thời gian di chuyển ngắn🚶', 'Được đánh giá cao⭐'],
    unknowns: ['Chưa rõ tình trạng đông đúc lúc 19h👥'],
    proposed_changes: ['Có thể đổi quán chè ở chặng cuối🍨'],
    route_warnings: ['Đoạn phố đi bộ đông người lúc cuối tuần🚶'],
    totals: { venue_range_upper_sum_vnd: 150000, walk_minutes: 25, leg_source: 'straight_line_estimate' },
    locks: ['VENUE-001'],
    stops: [
      {
        venue_id: 'VENUE-001',
        name: 'Phở 10 Lý Quốc Sư🍜',
        stage: 'Món khai vị🍲',
        note: 'Ăn nóng với quẩy giòn🥖',
        address: '10 Lý Quốc Sư🍜',
        district: 'Quận Hoàn Kiếm🏛️',
        order: 1,
        arrive: '18:00',
        depart: '18:45',
        lat: 21.0305,
        lon: 105.8492,
        source_url: 'https://example.com/source/pho10?id=1',
        synthetic: false,
        why: [{ code: 'match_interest', text: 'Quán phở bò truyền thống rất ngon🍲' }],
        hours: { status: 'verified', display: '06:00⏰22:00' },
        // Nested venue object (st.venue from StopView schema)
        venue: {
          id: 'VENUE-001',
          name: 'Phở 10 Lý Quốc Sư🍜',
          address: '10 Lý Quốc Sư🍜',
          district: 'Quận Hoàn Kiếm🏛️',
          dish_tags: ['Phở bò tái🥩', 'Quẩy🥖'],
          hours: { display: '06:00⏰22:00' }
        }
      }
    ]
  }
};

const fullSanitized = sanitizeViewForDisplay(fullSchemaRawView);

// Assert raw identity preservation across full schema
console.log('\n[7] Verifying Raw Identity & Contract Integrity...');
assert(fullSanitized.session_id === 'mock-session-full-schema_999', 'raw session_id preserved');
assert(fullSanitized.token === 'qa-secret-token-xyz!@#', 'raw token preserved');
assert(fullSanitized.revision === 8, 'raw revision integer preserved');
assert(fullSanitized.profile_version === 4, 'raw profile_version preserved');
assert(fullSanitized.selection_version === 3, 'raw selection_version preserved');
assert(fullSanitized.status === 'ok', 'status string preserved');
assert(fullSanitized.source.dataset_source === 'private', 'dataset_source preserved');
assert(fullSanitized.results[0].id === 'VENUE-001', 'results[0].id raw equality');
assert(fullSanitized.results[0].lat === 21.0305, 'latitude float preserved');
assert(fullSanitized.results[0].lon === 105.8492, 'longitude float preserved');
assert(fullSanitized.results[0].source_url === 'https://example.com/source/pho10?ref=123', 'source_url preserved');
assert(fullSanitized.results[0].locked === true, 'boolean locked state preserved');
assert(fullSanitized.confirmation.id === 'CONF-REV-8-ABC', 'confirmation id preserved');
assert(fullSanitized.tour.stops[0].venue_id === 'VENUE-001', 'stop venue_id preserved');
assert(fullSanitized.tour.stops[0].lat === 21.0305, 'stop latitude preserved');
assert(fullSanitized.tour.stops[0].source_url === 'https://example.com/source/pho10?id=1', 'stop source_url preserved');
assert(fullSanitized.tour.stops[0].arrive === '18:00', 'arrive time preserved');

// Assert comprehensive text sanitization across newly covered fields
console.log('\n[8] Verifying Full Field Coverage (district, dish_tags, hours, summary, tour, nested venue)...');
// Results fields
assert(fullSanitized.results[0].name === 'Phở 10 Lý Quốc Sư', 'results[0].name sanitized');
assert(fullSanitized.results[0].address === '10 Lý Quốc Sư', 'results[0].address sanitized');
assert(fullSanitized.results[0].district === 'Quận Hoàn Kiếm', 'results[0].district sanitized');
assert(fullSanitized.results[0].dish_tags[0] === 'Phở bò tái', 'results[0].dish_tags[0] sanitized');
assert(fullSanitized.results[0].dish_tags[1] === 'Quẩy giòn', 'results[0].dish_tags[1] sanitized');
assert(fullSanitized.results[0].hours.display === '06:00 22:00 hàng ngày', 'results[0].hours.display sanitized with space separator');
assert(fullSanitized.results[0].price.evidence === 'Theo menu chụp tại quán', 'results[0].price.evidence sanitized');
assert(fullSanitized.results[0].unknowns[0] === 'Chưa rõ độ ngọt nước dùng', 'results[0].unknowns[0] sanitized');
assert(fullSanitized.results[0].details.address === 'Số 10 Lý Quốc Sư , Phường Hàng Trống', 'results[0].details.address sanitized');
assert(fullSanitized.results[0].details.district === 'Hoàn Kiếm', 'results[0].details.district sanitized');
assert(fullSanitized.results[0].details.dish_tags[0] === 'Phở tái', 'results[0].details.dish_tags[0] sanitized');
assert(fullSanitized.results[0].details.hours.display === '06:30 21:30', 'results[0].details.hours.display sanitized');

// Comparison fields
assert(fullSanitized.comparison.criteria[0] === 'Giá cả', 'comparison.criteria[0] sanitized');
assert(fullSanitized.comparison.criteria[1] === 'Khoảng cách', 'comparison.criteria[1] sanitized');
assert(fullSanitized.comparison.unknowns[0] === 'Thành phần dị ứng đậu phộng', 'comparison.unknowns[0] sanitized');
assert(fullSanitized.comparison.venues[0].district === 'Hoàn Kiếm', 'comparison.venues[0].district sanitized');

// Confirmation fields
assert(fullSanitized.confirmation.warnings[0] === 'Chưa xác minh thành phần dị ứng theo nguồn ghi', 'confirmation.warnings[0] sanitized');
assert(fullSanitized.confirmation.summary.title === 'Lịch trình ẩm thực phố cổ', 'confirmation.summary.title sanitized');
assert(fullSanitized.confirmation.summary.notes === 'Lịch trình ưu tiên đi bộ gần', 'confirmation.summary.notes sanitized');
assert(fullSanitized.confirmation.summary.description === 'Tóm tắt chuyến đi 3 quán', 'confirmation.summary.description sanitized');
assert(fullSanitized.confirmation.summary.area === 'Khu vực Hoàn Kiếm', 'confirmation.summary.area sanitized');
assert(fullSanitized.confirmation.summary.shortlist[0].name === 'Phở 10 Lý Quốc Sư', 'confirmation.summary.shortlist[0].name sanitized');
assert(fullSanitized.confirmation.summary.items[0].label === 'Khu vực', 'confirmation.summary.items[0].label sanitized');
assert(fullSanitized.confirmation.summary.items[0].value === 'Phố Cổ', 'confirmation.summary.items[0].value sanitized');
assert(fullSanitized.confirmation.profile.area === 'Hoàn Kiếm', 'confirmation.profile.area sanitized');
assert(fullSanitized.confirmation.profile.tastes[0] === 'Phở bò', 'confirmation.profile.tastes[0] sanitized');
assert(fullSanitized.confirmation.profile.allergies[0] === 'Đậu phộng', 'confirmation.profile.allergies[0] sanitized');

// Profile fields
assert(fullSanitized.profile.area === 'Hoàn Kiếm', 'profile.area sanitized');
assert(fullSanitized.profile.tastes[0] === 'Phở bò', 'profile.tastes[0] sanitized');
assert(fullSanitized.profile.exclusions[0] === 'Hành sống', 'profile.exclusions[0] sanitized');
assert(fullSanitized.profile.allergies[0] === 'Đậu phộng', 'profile.allergies[0] sanitized');

// Tour fields
assert(fullSanitized.tour.title === 'Tour ẩm thực đêm Hoàn Kiếm', 'tour.title sanitized');
assert(fullSanitized.tour.explanation === 'Lộ trình đi bộ tối ưu quanh phố cổ , các quán cách nhau dưới 500m.', 'tour.explanation sanitized');
assert(fullSanitized.tour.reasons[0] === 'Gần điểm xuất phát', 'tour.reasons[0] sanitized');
assert(fullSanitized.tour.reasons[1] === 'Thời gian di chuyển ngắn', 'tour.reasons[1] sanitized');
assert(fullSanitized.tour.reasons[2] === 'Được đánh giá cao', 'tour.reasons[2] sanitized');
assert(fullSanitized.tour.unknowns[0] === 'Chưa rõ tình trạng đông đúc lúc 19h', 'tour.unknowns[0] sanitized');
assert(fullSanitized.tour.proposed_changes[0] === 'Có thể đổi quán chè ở chặng cuối', 'tour.proposed_changes[0] sanitized');
assert(fullSanitized.tour.route_warnings[0] === 'Đoạn phố đi bộ đông người lúc cuối tuần', 'tour.route_warnings[0] sanitized');

// Stop and nested venue fields
assert(fullSanitized.tour.stops[0].name === 'Phở 10 Lý Quốc Sư', 'stop.name sanitized');
assert(fullSanitized.tour.stops[0].stage === 'Món khai vị', 'stop.stage sanitized');
assert(fullSanitized.tour.stops[0].note === 'Ăn nóng với quẩy giòn', 'stop.note sanitized');
assert(fullSanitized.tour.stops[0].address === '10 Lý Quốc Sư', 'stop.address sanitized');
assert(fullSanitized.tour.stops[0].district === 'Quận Hoàn Kiếm', 'stop.district sanitized');
assert(fullSanitized.tour.stops[0].why[0].text === 'Quán phở bò truyền thống rất ngon', 'stop.why[0].text sanitized');
assert(fullSanitized.tour.stops[0].hours.display === '06:00 22:00', 'stop.hours.display sanitized');
assert(fullSanitized.tour.stops[0].venue.name === 'Phở 10 Lý Quốc Sư', 'stop.venue.name (nested) sanitized');
assert(fullSanitized.tour.stops[0].venue.address === '10 Lý Quốc Sư', 'stop.venue.address (nested) sanitized');
assert(fullSanitized.tour.stops[0].venue.district === 'Quận Hoàn Kiếm', 'stop.venue.district (nested) sanitized');
assert(fullSanitized.tour.stops[0].venue.dish_tags[0] === 'Phở bò tái', 'stop.venue.dish_tags[0] (nested) sanitized');
assert(fullSanitized.tour.stops[0].venue.hours.display === '06:00 22:00', 'stop.venue.hours.display (nested) sanitized');

console.log(`\n================================================================`);
console.log(`EMOJI SANITIZER SUITE: Passed: ${passed} | Failed: ${failed}`);
console.log(`================================================================`);
if (failed > 0) process.exit(1);
console.log('ALL COMPREHENSIVE EMOJI SANITIZER TESTS PASSED CLEANLY!');
