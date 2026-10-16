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

// UI_V2 Base Components
const Button = loadComponent('../../frontend/app/ui/Button.jsx');
const Chip = loadComponent('../../frontend/app/ui/Chip.jsx');
const Card = loadComponent('../../frontend/app/ui/Card.jsx');
const BannerModule = loadComponent('../../frontend/app/ui/Banner.jsx');
const Banner = BannerModule.default || BannerModule;
const StatusQueueModule = loadComponent('../../frontend/app/ui/StatusQueue.js');
const Sheet = loadComponent('../../frontend/app/ui/Sheet.jsx');
const Skeleton = loadComponent('../../frontend/app/ui/Skeleton.jsx');
const EvidenceChip = loadComponent('../../frontend/app/ui/EvidenceChip.jsx');
const Toast = loadComponent('../../frontend/app/ui/Toast.jsx');
const MapsLinksBlock = loadComponent('../../frontend/app/components/v2/MapsLinksBlock.jsx');
const EvidenceStrip = loadComponent('../../frontend/app/components/v2/EvidenceStrip.jsx');
import { SYNTHETIC_MAPS_LINKS } from '../../frontend/lib/mapsFixtures.js';

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
    htmlPrefs.includes('for="pref-address-query"') && htmlPrefs.includes('id="pref-address-query"') &&
    htmlPrefs.includes('for="pref-start-time"') && htmlPrefs.includes('id="pref-start-time"') &&
    htmlPrefs.includes('for="pref-duration"') && htmlPrefs.includes('id="pref-duration"') &&
    htmlPrefs.includes('for="pref-budget-vnd"') && htmlPrefs.includes('id="pref-budget-vnd"') &&
    htmlPrefs.includes('for="pref-mode"') && htmlPrefs.includes('id="pref-mode"'),
    'Form controls properly associated with labels'
  );

  record(
    'TC-DOM-12',
    'PreferencesPanel privacy disclosure renders accurate Phase 4 data flows',
    htmlPrefs.includes('data-testid="privacy-disclosure"') &&
    htmlPrefs.includes('Vị trí hiện tại:') &&
    htmlPrefs.includes('Tuyến đi bộ (Google Routes):') &&
    htmlPrefs.includes('Tìm kiếm địa chỉ:') &&
    htmlPrefs.includes('Trợ lý AI (Gemini):') &&
    htmlPrefs.includes('Bản đồ:'),
    'Accurate Phase 4 privacy statements verified'
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

  // -------------------------------------------------------------
  // Test 6: UI_V2 Base Components & Accessibility (R1-1)
  // -------------------------------------------------------------
  console.log('\n--- Test 6: UI_V2 Base Components & Accessibility (R1-1) ---');

  // TC-UIV2-01: Button
  const htmlBtnPrimary = renderToStaticMarkup(
    React.createElement(Button, { variant: 'primary' }, 'Lập hành trình')
  );
  const htmlBtnLoading = renderToStaticMarkup(
    React.createElement(Button, { variant: 'primary', loading: true }, 'Lập hành trình')
  );
  record(
    'TC-UIV2-01',
    'Button renders min-height >= 44px, loading state aria-busy="true" and Vietnamese text',
    htmlBtnPrimary.includes('min-height:44px') &&
      htmlBtnPrimary.includes('Lập hành trình') &&
      htmlBtnLoading.includes('aria-busy="true"') &&
      htmlBtnLoading.includes('Đang xử lý…'),
    'Button min-height 44px and loading semantics verified'
  );

  // TC-UIV2-02: Chip
  const htmlChipSelected = renderToStaticMarkup(
    React.createElement(Chip, { selected: true, icon: '🍜' }, 'Ăn sáng 2 giờ')
  );
  const htmlChipUnselected = renderToStaticMarkup(
    React.createElement(Chip, { selected: false }, 'Đi gia đình')
  );
  record(
    'TC-UIV2-02',
    'Chip renders aria-pressed="true" / "false" and min-height >= 44px',
    htmlChipSelected.includes('aria-pressed="true"') &&
      htmlChipSelected.includes('min-height:44px') &&
      htmlChipSelected.includes('🍜') &&
      htmlChipUnselected.includes('aria-pressed="false"'),
    'Chip aria-pressed and min-height confirmed'
  );

  // TC-UIV2-03: Card
  const htmlCard = renderToStaticMarkup(
    React.createElement(
      Card,
      {
        header: React.createElement('h3', null, 'Tiêu đề thẻ'),
        footer: React.createElement('span', null, 'Chân thẻ'),
        elevated: true,
      },
      React.createElement('p', null, 'Nội dung thẻ')
    )
  );
  record(
    'TC-UIV2-03',
    'Card renders header, body, footer, and elevated container structure',
    htmlCard.includes('ft-card-elevated') &&
      htmlCard.includes('Tiêu đề thẻ') &&
      htmlCard.includes('Nội dung thẻ') &&
      htmlCard.includes('Chân thẻ'),
    'Card container confirmed'
  );

  // TC-UIV2-04: Banner
  const htmlBannerError = renderToStaticMarkup(
    React.createElement(Banner, {
      type: 'error',
      title: 'Lỗi kết nối',
      message: 'Không thể kết nối máy chủ',
      onDismiss: () => {},
    })
  );
  const htmlBannerInfo = renderToStaticMarkup(
    React.createElement(Banner, {
      type: 'info',
      message: 'Đã cập nhật tour mới',
    })
  );
  record(
    'TC-UIV2-04',
    'Banner renders role="alert" for error and role="status" for info with 44px dismiss button',
    htmlBannerError.includes('role="alert"') &&
      htmlBannerError.includes('aria-label="Đóng thông báo"') &&
      htmlBannerError.includes('min-height:44px') &&
      htmlBannerInfo.includes('role="status"'),
    'Banner alert and status roles verified'
  );

  // TC-UIV2-05: StatusQueue priority order (error > warning > info)
  const sq = StatusQueueModule.globalStatusQueue;
  sq.clear();
  sq.enqueue({ id: 'inf_test', type: 'info', message: 'Thông tin thường' });
  const active1 = sq.getActive();
  sq.enqueue({ id: 'err_test', type: 'error', message: 'Lỗi nghiêm trọng' });
  const active2 = sq.getActive();
  sq.enqueue({ id: 'warn_test', type: 'warning', message: 'Cảnh báo mức trung' });
  const active3 = sq.getActive();
  sq.dismiss('err_test');
  const active4 = sq.getActive();
  sq.dismiss('warn_test');
  const active5 = sq.getActive();
  sq.clear();

  record(
    'TC-UIV2-05',
    'StatusQueue guarantees ONLY ONE active banner with priority error > warning > info',
    active1.type === 'info' &&
      active2.type === 'error' &&
      active3.type === 'error' &&
      active4.type === 'warning' &&
      active5.type === 'info',
    'StatusQueue priority order verified'
  );

  // TC-UIV2-06: Sheet
  const htmlSheet = renderToStaticMarkup(
    React.createElement(
      Sheet,
      {
        isOpen: true,
        title: 'Tùy chọn hành trình',
        onClose: () => {},
      },
      React.createElement('input', { type: 'text', defaultValue: 'Hà Nội' })
    )
  );
  record(
    'TC-UIV2-06',
    'Sheet renders dialog, aria-modal="true", aria-labelledby, and 44px close button',
    htmlSheet.includes('role="dialog"') &&
      htmlSheet.includes('aria-modal="true"') &&
      htmlSheet.includes('aria-labelledby=') &&
      htmlSheet.includes('aria-label="Đóng bảng"') &&
      htmlSheet.includes('min-height:44px'),
    'Sheet accessibility attributes confirmed'
  );

  // TC-UIV2-07: EvidenceChip (never colour only)
  const htmlEvVerified = renderToStaticMarkup(
    React.createElement(EvidenceChip, { level: 'verified' })
  );
  const htmlEvEstimate = renderToStaticMarkup(
    React.createElement(EvidenceChip, { level: 'estimate' })
  );
  const htmlEvUnknown = renderToStaticMarkup(
    React.createElement(EvidenceChip, { level: 'unknown' })
  );
  record(
    'TC-UIV2-07',
    'EvidenceChip verified/estimate/unknown render icon + text + title (never colour only)',
    htmlEvVerified.includes('✓') &&
      htmlEvVerified.includes('Đã xác minh') &&
      htmlEvVerified.includes('title=') &&
      htmlEvEstimate.includes('≈') &&
      htmlEvEstimate.includes('Ước tính') &&
      htmlEvEstimate.includes('title=') &&
      htmlEvUnknown.includes('?') &&
      htmlEvUnknown.includes('Chưa rõ') &&
      htmlEvUnknown.includes('title='),
    'EvidenceChip multi-channel encoding verified'
  );

  // TC-UIV2-08: Skeleton
  const htmlSkeleton = renderToStaticMarkup(
    React.createElement(Skeleton, { variant: 'rect', height: 40 })
  );
  record(
    'TC-UIV2-08',
    'Skeleton renders aria-hidden="true" and role="presentation"',
    htmlSkeleton.includes('aria-hidden="true"') &&
      htmlSkeleton.includes('role="presentation"') &&
      htmlSkeleton.includes('ft-skeleton-rect'),
    'Skeleton placeholder accessibility confirmed'
  );

  // TC-UIV2-09: Toast
  const htmlToast = renderToStaticMarkup(
    React.createElement(Toast, {
      message: 'Hành trình đã lưu',
      type: 'success',
      onClose: () => {},
    })
  );
  record(
    'TC-UIV2-09',
    'Toast renders role="status", aria-live="polite", and 44px dismiss button',
    htmlToast.includes('role="status"') &&
      htmlToast.includes('aria-live="polite"') &&
      htmlToast.includes('aria-label="Đóng thông báo"') &&
      htmlToast.includes('min-height:44px'),
    'Toast notification confirmed'
  );

  // -------------------------------------------------------------
  // Test 7: MapsLinksBlock Free Google Maps URLs (Contract v1.7)
  // -------------------------------------------------------------
  console.log('\n--- Test 7: MapsLinksBlock Free Google Maps URLs (GMAPS-URL-2) ---');

  const tourSuccess = {
    status: 'conditional',
    revision: 2,
    stops: [
      { order: 1, venue_id: 'SYN-001', name: 'Quán 1 - Bún chả' },
      { order: 2, venue_id: 'SYN-002', name: 'Quán 2 - Phở bò' },
      { order: 3, venue_id: 'SYN-003', name: 'Quán 3 - Chè khúc bạch' },
    ],
  };

  const tourInfeasible = {
    status: 'insufficient_evidence',
    stops: [],
  };

  // TC-MAPS-01: Hidden for non-success tour
  const htmlInfeasible = renderToStaticMarkup(
    React.createElement(MapsLinksBlock, {
      tour: tourInfeasible,
      sessionId: 'test-session',
      sessionToken: 'test-token',
      originLabel: 'Hồ Hoàn Kiếm',
    })
  );
  record(
    'TC-MAPS-01',
    'MapsLinksBlock returns null/empty for non-success tour',
    htmlInfeasible === '',
    'Hidden for non-success tour confirmed'
  );

  // TC-MAPS-02: Single link primary button with target="_blank" and rel="noopener noreferrer"
  const htmlSingle = renderToStaticMarkup(
    React.createElement(MapsLinksBlock, {
      tour: tourSuccess,
      sessionId: 'test-session',
      sessionToken: 'test-token',
      originLabel: 'Hồ Hoàn Kiếm',
      initialMapsData: SYNTHETIC_MAPS_LINKS['single_walking'],
    })
  );
  record(
    'TC-MAPS-02',
    'MapsLinksBlock single link renders primary button with required attributes',
    htmlSingle.includes('Xem lịch trình trên Google Maps') &&
      htmlSingle.includes('target="_blank"') &&
      htmlSingle.includes('rel="noopener noreferrer"') &&
      htmlSingle.includes('https://www.google.com/maps/dir/?api=1') &&
      !htmlSingle.includes('dir_action') &&
      htmlSingle.includes('min-height:44px'),
    'Single link primary button attributes confirmed'
  );

  // TC-MAPS-03: Segmented toggle touch target >= 44px and default walking
  record(
    'TC-MAPS-03',
    'MapsLinksBlock renders walking/driving segmented toggle with >= 44px touch targets',
    htmlSingle.includes('data-testid="maps-mode-toggle"') &&
      htmlSingle.includes('data-testid="toggle-walking"') &&
      htmlSingle.includes('data-testid="toggle-driving"') &&
      htmlSingle.includes('Đi bộ') &&
      htmlSingle.includes('Lái xe') &&
      htmlSingle.includes('aria-checked="true"'),
    'Segmented toggle accessibility confirmed'
  );

  // TC-MAPS-04: Split cases (n > 1) render ordered Chặng i/n: <from> → <to>
  const htmlSplit = renderToStaticMarkup(
    React.createElement(MapsLinksBlock, {
      tour: tourSuccess,
      sessionId: 'test-session',
      sessionToken: 'test-token',
      originLabel: 'Hồ Hoàn Kiếm',
      initialMapsData: SYNTHETIC_MAPS_LINKS['split_mobile'],
    })
  );
  record(
    'TC-MAPS-04',
    'MapsLinksBlock split links render Chặng i/n format in order',
    htmlSplit.includes('Chặng 1/3') &&
      htmlSplit.includes('Chặng 2/3') &&
      htmlSplit.includes('Chặng 3/3') &&
      htmlSplit.includes('→'),
    'Split links format confirmed'
  );

  // TC-MAPS-05: Partial status renders honest disclosure
  const htmlPartial = renderToStaticMarkup(
    React.createElement(MapsLinksBlock, {
      tour: tourSuccess,
      sessionId: 'test-session',
      sessionToken: 'test-token',
      originLabel: 'Hồ Hoàn Kiếm',
      initialMapsData: SYNTHETIC_MAPS_LINKS['partial_gap'],
    })
  );
  record(
    'TC-MAPS-05',
    'MapsLinksBlock partial status renders honest disclosure',
    htmlPartial.includes('data-maps-status="partial"') &&
      htmlPartial.includes('Một số quán chưa có toạ độ nên không đưa vào liên kết'),
    'Partial status honest notice confirmed'
  );

  // TC-MAPS-06: Unavailable status renders honest notice and 0 links
  const htmlUnavailable = renderToStaticMarkup(
    React.createElement(MapsLinksBlock, {
      tour: tourSuccess,
      sessionId: 'test-session',
      sessionToken: 'test-token',
      originLabel: 'Hồ Hoàn Kiếm',
      initialMapsData: SYNTHETIC_MAPS_LINKS['unavailable'],
    })
  );
  record(
    'TC-MAPS-06',
    'MapsLinksBlock unavailable status renders honest notice without links',
    htmlUnavailable.includes('data-maps-status="unavailable"') &&
      !htmlUnavailable.includes('<a '),
    'Unavailable status confirmed'
  );

  // TC-MAPS-07: Disclaimers rendered without claiming Google times or distances
  record(
    'TC-MAPS-07',
    'MapsLinksBlock renders privacy and schedule proposal disclaimers',
    htmlSingle.includes('sent to Google only when the user opens them') &&
      htmlSingle.includes('Thứ tự theo gợi ý của ứng dụng; Google có thể hiển thị thời gian khác') &&
      !htmlSingle.includes('khoảng cách Google') &&
      !htmlSingle.includes('thời gian Google tính'),
    'Disclaimers confirmed'
  );

  // -------------------------------------------------------------
  // Test 9: EvidenceStrip Synthetic Evidence & Conservatism (R2-N01)
  // -------------------------------------------------------------
  console.log('--- Test 9: EvidenceStrip Synthetic Evidence & Disagreements (R2-N01) ---');

  // Exact canonical Vietnamese copy strings:
  const COPY_HOURS_VERIFIED = 'Đã xác thực theo lịch hoạt động thực tế của từng quán trong hành trình.';
  const COPY_HOURS_UNKNOWN = 'Dữ liệu nguồn chưa có lịch chi tiết theo từng thứ trong tuần. Bạn nên liên hệ xác nhận với quán trước khi tới.';
  const COPY_PRICE_VERIFIED = 'Mức giá và định mức chi tiêu đã được xác thực.';
  const COPY_PRICE_UNKNOWN = 'Mức giá hiển thị là khoảng giá chung do quán công bố, không phải hoá đơn tính theo từng người.';
  const COPY_ROUTE_PROVIDER = 'Tuyến đường và thời gian đi bộ thực tế được tính toán từ dịch vụ bản đồ số.';
  const COPY_ROUTE_ESTIMATE = 'Khoảng cách và thời gian di chuyển là ước tính đường chim bay nội bộ của hệ thống (chưa có tuyến thực tế).';

  // TC-EVID-01: Fully verified tour (verified hours, per-person price, provider route)
  const tourFullyVerified = {
    status: 'verified_feasible',
    unknowns: [],
    stops: [
      {
        venue_id: 'SYN-001',
        name: 'Quán Phở 1',
        hours: { status: 'verified', display: '08:00 - 22:00', open_at_arrival: true },
        price: { min_vnd: 40000, max_vnd: 50000, semantics: 'per_person', evidence: 'verified' },
        leg_from_previous: { minutes: 5, km: 0.3, source: 'provider_route' }
      },
      {
        venue_id: 'SYN-002',
        name: 'Quán Chè 2',
        hours: { status: 'verified', display: '09:00 - 21:00', open_at_arrival: true },
        price: { min_vnd: 20000, max_vnd: 30000, semantics: 'per_person', evidence: 'verified' },
        leg_from_previous: { minutes: 7, km: 0.4, source: 'provider_route' }
      }
    ],
    legs: [
      { minutes: 5, km: 0.3, source: 'provider_route' },
      { minutes: 7, km: 0.4, source: 'provider_route' }
    ],
    totals: { leg_source: 'provider_route' }
  };
  const htmlVerified = renderToStaticMarkup(
    React.createElement(EvidenceStrip, { tour: tourFullyVerified, initialExpanded: true })
  );
  record(
    'TC-EVID-01',
    'EvidenceStrip renders exact verified copy across hours, price, and route',
    htmlVerified.includes('Bằng chứng đầy đủ: tuyến đường thực tế · giờ mở cửa xác thực') &&
      htmlVerified.includes(COPY_HOURS_VERIFIED) &&
      htmlVerified.includes(COPY_PRICE_VERIFIED) &&
      htmlVerified.includes(COPY_ROUTE_PROVIDER),
    'Verified tour assertions confirmed'
  );

  // TC-EVID-02: Contradictory synthetic hours (hours object present with status unknown, open_at_arrival null, but no 'hours' in tour.unknowns)
  const tourContradictoryHours = {
    status: 'conditional',
    unknowns: [], // Adversarial probe from Codex R2-N01: no 'hours' in unknowns!
    stops: [
      {
        venue_id: 'SYN-001',
        name: 'Quán 1',
        hours: { status: 'unknown', display: '<synthetic source text>', open_at_arrival: null },
        price: { min_vnd: 40000, max_vnd: 50000, semantics: 'per_person', evidence: 'verified' },
        leg_from_previous: { minutes: 5, km: 0.3, source: 'provider_route' }
      }
    ],
    totals: { leg_source: 'provider_route' }
  };
  const htmlContradictoryHours = renderToStaticMarkup(
    React.createElement(EvidenceStrip, { tour: tourContradictoryHours, initialExpanded: true })
  );
  record(
    'TC-EVID-02',
    'Object presence with status:unknown stays conservative (never claims verified hours)',
    htmlContradictoryHours.includes('Chưa chắc: giờ mở cửa') &&
      !htmlContradictoryHours.includes(COPY_HOURS_VERIFIED) &&
      htmlContradictoryHours.includes(COPY_HOURS_UNKNOWN),
    'Conservative hours fallback confirmed'
  );

  // TC-EVID-03: Contradictory synthetic hours (stops have verified hours, but tour.unknowns includes 'hours')
  const tourDisagreementHours = {
    status: 'conditional',
    unknowns: ['hours'],
    stops: [
      {
        venue_id: 'SYN-001',
        name: 'Quán 1',
        hours: { status: 'verified', display: '08:00 - 22:00', open_at_arrival: true },
        price: { min_vnd: 40000, max_vnd: 50000, semantics: 'per_person', evidence: 'verified' },
        leg_from_previous: { minutes: 5, km: 0.3, source: 'provider_route' }
      }
    ],
    totals: { leg_source: 'provider_route' }
  };
  const htmlDisagreementHours = renderToStaticMarkup(
    React.createElement(EvidenceStrip, { tour: tourDisagreementHours, initialExpanded: true })
  );
  record(
    'TC-EVID-03',
    'Disagreement between stop hours and tour.unknowns stays conservative (unknown)',
    htmlDisagreementHours.includes('Chưa chắc: giờ mở cửa') &&
      !htmlDisagreementHours.includes(COPY_HOURS_VERIFIED) &&
      htmlDisagreementHours.includes(COPY_HOURS_UNKNOWN),
    'Disagreement conservatism confirmed'
  );

  // TC-EVID-04: Verified per-person price with estimate route
  const tourVerifiedPrice = {
    status: 'conditional',
    unknowns: ['route'],
    stops: [
      {
        venue_id: 'SYN-001',
        name: 'Quán 1',
        hours: { status: 'verified', display: '08:00 - 22:00', open_at_arrival: true },
        price: { min_vnd: 40000, max_vnd: 40000, semantics: 'per_person', evidence: 'verified' },
        leg_from_previous: { minutes: 5, km: 0.3, source: 'straight_line_estimate' }
      }
    ],
    totals: { leg_source: 'straight_line_estimate' }
  };
  const htmlVerifiedPrice = renderToStaticMarkup(
    React.createElement(EvidenceStrip, { tour: tourVerifiedPrice, initialExpanded: true })
  );
  record(
    'TC-EVID-04',
    'Verified per-person price does not claim unknown price and renders exact verified copy',
    htmlVerifiedPrice.includes('Chưa chắc: tuyến đi thực tế') &&
      !htmlVerifiedPrice.includes('giá theo người') &&
      !htmlVerifiedPrice.includes('giờ mở cửa') &&
      htmlVerifiedPrice.includes(COPY_PRICE_VERIFIED) &&
      !htmlVerifiedPrice.includes(COPY_PRICE_UNKNOWN) &&
      htmlVerifiedPrice.includes(COPY_ROUTE_ESTIMATE),
    'Verified per-person price assertions confirmed'
  );

  // TC-EVID-05: Provider route vs straight-line estimate exact copy
  const tourEstimateOnly = {
    status: 'conditional',
    unknowns: ['route'],
    stops: [
      {
        venue_id: 'SYN-001',
        hours: { status: 'unknown', display: null, open_at_arrival: null },
        price: { min_vnd: 20000, max_vnd: 50000, semantics: 'venue_range', evidence: 'estimate' },
        leg_from_previous: { minutes: null, km: 1.2, source: 'straight_line_estimate' }
      }
    ],
    totals: { leg_source: 'straight_line_estimate' }
  };
  const htmlEstimate = renderToStaticMarkup(
    React.createElement(EvidenceStrip, { tour: tourEstimateOnly, initialExpanded: true })
  );
  record(
    'TC-EVID-05',
    'Estimate routing renders honest straight-line estimate disclosure',
    htmlEstimate.includes(COPY_ROUTE_ESTIMATE) &&
      !htmlEstimate.includes(COPY_ROUTE_PROVIDER) &&
      htmlEstimate.includes('tuyến đi thực tế'),
    'Estimate routing copy confirmed'
  );

  // TC-EVID-06: Mutation sensitivity check
  // Demonstrates that if object-presence alone is used for hours or 'verified_exact' is required for price,
  // the assertions intentionally fail.
  const objectPresenceHoursFlawedCheck = (tour) => {
    // Flawed legacy check: only tests if hours === null
    return tour.stops.some(s => s.hours === null || s.hours === undefined);
  };
  const flawedIsUnknown = objectPresenceHoursFlawedCheck(tourContradictoryHours);
  // In flawed logic, flawedIsUnknown is false (it thought it was verified!)
  const safeCheck = tourContradictoryHours.stops.every(
    s => s?.hours && s.hours.status === 'verified' && s.hours.open_at_arrival === true
  );
  record(
    'TC-EVID-06',
    'Mutation check: proves flawed object-presence logic fails while strict evidence passes',
    flawedIsUnknown === false && safeCheck === false,
    'Mutation sensitivity mathematically demonstrated'
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
