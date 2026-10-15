/**
 * Independent React Component Render & Accessibility Probe Suite
 * Tests DOM rendering, accessibility attributes, and visual gates for:
 * - ReplaceDiffModal (F2: Neutral confirmation before replace, server diff after replace)
 * - MapView (F6: Provider route suppression, dashed straight-line caption, leg list; F8, F9)
 * - TourTimeline (N2: visit_minutes_per_stop dynamic rendering; F9)
 * - PreferencesPanel (F4: Null resets; F9: Form label/id associations)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const React = require('../../frontend/node_modules/react');
const { renderToStaticMarkup } = require('../../frontend/node_modules/react-dom/server');
const swc = require('../../frontend/node_modules/next/dist/build/swc');

// Helper to compile and import a JSX component
function loadComponent(relativePath) {
  const fullPath = path.resolve(__dirname, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const transformed = swc.transformSync(source, {
    filename: fullPath,
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } }
    },
    module: { type: 'commonjs' }
  });

  const customRequire = (id) => {
    if (id === 'react') return React;
    if (id === 'react/jsx-runtime') return require('../../frontend/node_modules/react/jsx-runtime');
    if (id === 'react/jsx-dev-runtime') return require('../../frontend/node_modules/react/jsx-dev-runtime');
    if (id.startsWith('./') || id.startsWith('../')) {
      const target = path.resolve(path.dirname(fullPath), id);
      const candidates = [target, target + '.js', target + '.jsx', target + '/index.js', target + '/index.jsx'];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          return loadComponent(path.relative(__dirname, c));
        }
      }
    }
    try {
      return require(id);
    } catch (_) {
      return require(path.resolve(__dirname, '../../frontend/node_modules', id));
    }
  };

  const m = { exports: {} };
  const fn = new Function('require', 'module', 'exports', 'React', transformed.code);
  fn(customRequire, m, m.exports, React);
  return m.exports.default || m.exports;
}

const ReplaceDiffModal = loadComponent('../../frontend/app/components/ReplaceDiffModal.jsx');
const MapView = loadComponent('../../frontend/app/components/MapView.jsx');
const TourTimeline = loadComponent('../../frontend/app/components/TourTimeline.jsx');
const PreferencesPanel = loadComponent('../../frontend/app/components/PreferencesPanel.jsx');

const results = [];
function record(id, title, passed, details = '') {
  results.push({ id, title, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [${id}] ${title}${details ? ` -> ${details}` : ''}`);
  if (!passed) {
    throw new Error(`Assertion failed in [${id}] ${title}: ${details}`);
  }
}

async function runComponentTests() {
  console.log('\n===============================================================');
  console.log('   AI FOODTOUR PLANNER — COMPONENT DOM & ACCESSIBILITY TESTS');
  console.log('===============================================================\n');

  // -------------------------------------------------------------
  // Test 1: ReplaceDiffModal Neutral Confirmation (Before Replace)
  // -------------------------------------------------------------
  console.log('--- Test 1: ReplaceDiffModal Neutral Confirmation (F2) ---');
  const oldStop = {
    venue_id: 'SYN-002',
    name: 'Phở Gia Truyền Bát Đàn',
    address: '49 Bát Đàn, Hoàn Kiếm',
    order: 2,
    price: { min_vnd: 50000, max_vnd: 70000, semantics: 'venue_range', evidence: 'estimate' }
  };

  const htmlBefore = renderToStaticMarkup(
    React.createElement(ReplaceDiffModal, {
      isOpen: true,
      oldStop,
      resultDiff: null,
      lockedStops: ['Quán 1', 'Quán 3'],
      onConfirm: () => {},
      onCancel: () => {},
      busy: false
    })
  );

  record(
    'TC-DOM-01',
    'ReplaceDiffModal renders current stop and explicit "Thay quán này" action',
    htmlBefore.includes('Phở Gia Truyền Bát Đàn') &&
    htmlBefore.includes('Thay quán này') &&
    htmlBefore.includes('Quán hiện tại cần thay'),
    'Current stop and explicit action button confirmed'
  );

  record(
    'TC-DOM-02',
    'ReplaceDiffModal before replacement contains NO fabricated candidate preview',
    !htmlBefore.includes('Quán đề xuất mới') &&
    !htmlBefore.includes('Điểm dừng thay thế tối ưu') &&
    htmlBefore.includes('Lựa chọn từ Máy chủ (Server-selected)') &&
    htmlBefore.includes('không hiển thị quán suy đoán giả lập'),
    'No candidate fabrication confirmed; server-selection disclosed'
  );

  record(
    'TC-DOM-03',
    'ReplaceDiffModal renders accessibility attributes (role=dialog, aria-modal, aria-label on close)',
    htmlBefore.includes('role="dialog"') &&
    htmlBefore.includes('aria-modal="true"') &&
    htmlBefore.includes('aria-label="Đóng hộp thoại"'),
    'Accessibility attributes present'
  );

  // -------------------------------------------------------------
  // Test 2: ReplaceDiffModal Server Diff (After Replace)
  // -------------------------------------------------------------
  console.log('\n--- Test 2: ReplaceDiffModal Server Before/After Diff (F2) ---');
  const newStop = {
    venue_id: 'SYN-008',
    name: 'Cà phê Trứng Giảng',
    address: '39 Nguyễn Hữu Huân, Hoàn Kiếm',
    order: 2,
    price: { min_vnd: 35000, max_vnd: 65000, semantics: 'venue_range', evidence: 'estimate' }
  };

  const htmlAfter = renderToStaticMarkup(
    React.createElement(ReplaceDiffModal, {
      isOpen: true,
      oldStop,
      resultDiff: { oldStop, newStop },
      lockedStops: ['Quán 1', 'Quán 3'],
      onConfirm: () => {},
      onCancel: () => {},
      busy: false
    })
  );

  record(
    'TC-DOM-04',
    'ReplaceDiffModal after replacement displays server-chosen before/after diff',
    htmlAfter.includes('Phở Gia Truyền Bát Đàn') &&
    htmlAfter.includes('Cà phê Trứng Giảng') &&
    htmlAfter.includes('Quán mới (Máy chủ chọn)') &&
    htmlAfter.includes('Hoàn tất &amp; xem lịch trình'),
    'Server before/after diff displayed correctly'
  );

  // -------------------------------------------------------------
  // Test 3: MapView Google Maps Platform & Geometry Gate (Phase 4)
  // -------------------------------------------------------------
  console.log('\n--- Test 3: MapView Google Maps Platform & Geometry Gate (Phase 4) ---');
  const origin = { lat: 21.0285, lon: 105.8522 };
  const stops = [
    {
      venue_id: 'SYN-001',
      name: 'Bún chả Phố Cổ',
      lat: 21.031,
      lon: 105.850,
      order: 1,
      leg_from_previous: { minutes: 5, km: 0.35, source: 'straight_line_estimate' }
    },
    {
      venue_id: 'SYN-002',
      name: 'Phở Bát Đàn',
      lat: 21.034,
      lon: 105.852,
      order: 2,
      leg_from_previous: { minutes: 8, km: 0.52, source: 'straight_line_estimate' }
    }
  ];

  // Probe A: straight_line_estimate mode
  const htmlMapEstimate = renderToStaticMarkup(
    React.createElement(MapView, {
      origin,
      stops,
      highlightedStopId: 'SYN-001',
      legSource: 'straight_line_estimate'
    })
  );

  record(
    'TC-DOM-05',
    'MapView straight_line_estimate renders mandatory caption without drawing route',
    htmlMapEstimate.includes('không phải tuyến đi') &&
    htmlMapEstimate.includes('không vẽ trên bản đồ') &&
    !htmlMapEstimate.includes('tile.openstreetmap.org'),
    'Caption rendered, estimated legs never drawn as routes, no OSM tiles'
  );

  record(
    'TC-DOM-06',
    'MapView lists each leg with minutes, km and source label',
    htmlMapEstimate.includes('Chi tiết các chặng di chuyển (2 chặng)') &&
    htmlMapEstimate.includes('Chặng 1:') &&
    htmlMapEstimate.includes('5 phút') &&
    htmlMapEstimate.includes('0.35 km'),
    'Legs detail list confirmed'
  );

  record(
    'TC-DOM-07',
    'MapView renders restaurant toggle button with aria-pressed="false" and keyboard support',
    htmlMapEstimate.includes('aria-pressed="false"') &&
    htmlMapEstimate.includes('Hiện quán ăn trên bản đồ') &&
    htmlMapEstimate.includes('data-testid="venue-toggle"'),
    'Restaurant markers toggle button confirmed'
  );

  record(
    'TC-DOM-08',
    'MapView unconfigured state renders labelled Vietnamese explanation with manual coordinate reassurance',
    htmlMapEstimate.includes('Bản đồ Google Maps chưa khả dụng') &&
    htmlMapEstimate.includes('Google Maps chưa được cấu hình') &&
    htmlMapEstimate.includes('Chế độ toạ độ thủ công vẫn hoạt động bình thường'),
    'Unavailable map state properly labelled in Vietnamese without fake map'
  );

  // Probe B: provider_route WITH route warnings renders Google walking warning alert
  const htmlMapWarnings = renderToStaticMarkup(
    React.createElement(MapView, {
      origin,
      stops: [
        { ...stops[0], leg_from_previous: { ...stops[0].leg_from_previous, source: 'provider_route',
          geometry: [[origin.lat, origin.lon], [stops[0].lat, stops[0].lon]] } }
      ],
      legSource: 'provider_route',
      routingProvider: 'google_routes',
      routeWarnings: [
        'Chỉ đường đi bộ đang trong giai đoạn thử nghiệm. Hãy cẩn thận – tuyến đường này có thể không có vỉa hè hoặc lối dành riêng cho người đi bộ.'
      ]
    })
  );

  record(
    'TC-DOM-08b',
    'MapView renders mandatory Google walking route warning when present (contract v1.5)',
    htmlMapWarnings.includes('data-testid="route-warnings"') &&
    htmlMapWarnings.includes('Cảnh báo tuyến đi bộ (Google Routes)') &&
    htmlMapWarnings.includes('giai đoạn thử nghiệm'),
    'Google walking route warnings properly rendered'
  );

  // Probe C: PreferencesPanel origin controls and privacy text
  const htmlPrefsOrigin = renderToStaticMarkup(
    React.createElement(PreferencesPanel, {
      preferences: {
        city: 'Hà Nội',
        origin: { lat: 21.0285, lon: 105.8522 },
        origin_label: 'Hồ Gươm',
        origin_source: 'landmark'
      },
      revision: 1,
      onUpdatePreferences: () => {},
      onPlanTour: () => {},
      busy: false,
      isMock: true
    })
  );

  record(
    'TC-DOM-08c',
    'PreferencesPanel renders "Dùng vị trí hiện tại" button, geocoding fallback, and Google privacy disclosure',
    htmlPrefsOrigin.includes('Dùng vị trí hiện tại') &&
    htmlPrefsOrigin.includes('data-testid="use-current-location-btn"') &&
    htmlPrefsOrigin.includes('Tìm toạ độ') &&
    htmlPrefsOrigin.includes('Dữ liệu gửi tới Google:') &&
    htmlPrefsOrigin.includes('id="pref-custom-lat"') &&
    htmlPrefsOrigin.includes('id="pref-custom-lon"'),
    'Origin selection controls and privacy disclosure verified'
  );

  // -------------------------------------------------------------
  // Test 4: TourTimeline Dynamic Dwell Time (N2, F9)
  // -------------------------------------------------------------
  console.log('\n--- Test 4: TourTimeline Assumptions & Keyboard Accessibility (N2, F9) ---');
  const mockTour = {
    revision: 2,
    status: 'conditional',
    assumptions: { visit_minutes_per_stop: 45, pool_truncated: false },
    totals: { walk_minutes: 25, venue_range_upper_sum_vnd: 150000, leg_source: 'straight_line_estimate' },
    stops,
    locks: []
  };

  const htmlTimeline = renderToStaticMarkup(
    React.createElement(TourTimeline, {
      tour: mockTour,
      highlightedStopId: null,
      onSelectStop: () => {},
      onInitiateReplace: () => {},
      busy: false
    })
  );

  record(
    'TC-DOM-09',
    'TourTimeline renders dynamic visit_minutes_per_stop (45p) instead of hardcoded 30p',
    htmlTimeline.includes('(ước tính 45p dừng)') &&
    !htmlTimeline.includes('(ước tính 30p dừng)'),
    'Dynamic 45p dwell time confirmed'
  );

  record(
    'TC-DOM-10',
    'TourTimeline stop articles have role=button, tabIndex=0, and aria-label',
    htmlTimeline.includes('role="button"') &&
    htmlTimeline.includes('tabindex="0"') &&
    htmlTimeline.includes('aria-label="Điểm dừng 1: Bún chả Phố Cổ"'),
    'Timeline article keyboard accessibility confirmed'
  );

  // -------------------------------------------------------------
  // Test 5: PreferencesPanel Form Labels & IDs (F9)
  // -------------------------------------------------------------
  console.log('\n--- Test 5: PreferencesPanel Form Label/ID Associations (F9) ---');
  const htmlPrefs = renderToStaticMarkup(
    React.createElement(PreferencesPanel, {
      preferences: {
        city: 'Hà Nội',
        origin: { lat: 21.033, lon: 105.850 },
        start_time: '08:30',
        weekday: 0,
        duration_min: 120,
        budget_vnd: 150000,
        budget_scope: 'per_person',
        party_size: 1,
        interests: ['phở'],
        exclusions: [],
        max_stops: 3,
        mode: 'explore'
      },
      revision: 1,
      onUpdatePreferences: () => {},
      onPlanTour: () => {},
      busy: false,
      isMock: false
    })
  );

  record(
    'TC-DOM-11',
    'PreferencesPanel connects form labels and controls with htmlFor and id',
    htmlPrefs.includes('for="pref-origin-preset"') && htmlPrefs.includes('id="pref-origin-preset"') &&
    htmlPrefs.includes('for="pref-start-time"') && htmlPrefs.includes('id="pref-start-time"') &&
    htmlPrefs.includes('for="pref-duration"') && htmlPrefs.includes('id="pref-duration"') &&
    htmlPrefs.includes('for="pref-budget-vnd"') && htmlPrefs.includes('id="pref-budget-vnd"') &&
    htmlPrefs.includes('for="pref-mode"') && htmlPrefs.includes('id="pref-mode"'),
    'Form controls properly associated with labels'
  );

  // v1.3: only verified overlay prices may be labelled per-person; estimates stay venue ranges.
  const EvidenceBadges = loadComponent('../../frontend/app/components/EvidenceBadge.jsx');
  const htmlPerPerson = renderToStaticMarkup(
    React.createElement(EvidenceBadges.PriceBadge, { minVnd: 30000, maxVnd: 45000, evidence: 'verified', semantics: 'per_person' })
  );
  const htmlRange = renderToStaticMarkup(
    React.createElement(EvidenceBadges.PriceBadge, { minVnd: 30000, maxVnd: 45000, evidence: 'estimate', semantics: 'venue_range' })
  );
  const htmlSpoof = renderToStaticMarkup(
    React.createElement(EvidenceBadges.PriceBadge, { minVnd: 30000, maxVnd: 45000, evidence: 'estimate', semantics: 'per_person' })
  );
  record(
    'TC-PP',
    'Per-person label only for verified per_person prices; estimates and spoofed semantics stay venue ranges',
    htmlPerPerson.includes('Giá theo người (đã xác minh') &&
      htmlRange.includes('Khoảng giá quán, không bảo đảm') &&
      htmlSpoof.includes('Khoảng giá quán, không bảo đảm') && !htmlSpoof.includes('Giá theo người'),
    'verified per_person / estimate range / estimate-with-per_person'
  );

  console.log('\n===============================================================');
  console.log(`   COMPONENT TESTS SUMMARY: ${results.filter((r) => r.passed).length}/${results.length} PASSED`);
  console.log('===============================================================\n');

  return results;
}

runComponentTests().catch((err) => {
  console.error('\n❌ COMPONENT TEST SUITE FAILED:', err.message);
  process.exit(1);
});
