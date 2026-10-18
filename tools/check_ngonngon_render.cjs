/** Independent component regression probes. Synthetic only; no browser/provider calls.
 * Uses installed Next SWC + React SSR, not a substitute for browser interaction tests.
 */
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const frontend = path.resolve(process.env.NGONNGON_FRONTEND_DIR || path.join(root, 'frontend'));
const frontRequire = createRequire(path.join(frontend, 'package.json'));
const React = frontRequire('react');
const { renderToStaticMarkup } = frontRequire('react-dom/server');
const swc = frontRequire('next/dist/build/swc');
// SSR probes verify content invariants; real browser gates verify the imported visual CSS.
require.extensions['.css'] = () => {};
require.extensions['.jsx'] = (mod, filename) => {
  const result = swc.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022',
                     transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  });
  mod._compile(result.code, filename);
};
const component = name => require(path.join(frontend, 'app/components/v2/guided', name + '.jsx')).default;
const checks = [];
function check(name, ok) { checks.push({ name, pass: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); }
const render = (name, props) => renderToStaticMarkup(React.createElement(component(name), props));
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const noop = () => {};

const empty = text(render('UnderstoodCard', { items: [], allergies: [], onEdit: noop }));
check('empty understood card does not invent location/time/party defaults',
      !/Hồ Gươm|120 phút|Tối nay/.test(empty));

const summary = { type: 'confirm_summary', items: [], venues: [],
                  warnings: ['[SYNTHETIC] Giờ chưa xác minh', '[SYNTHETIC] Giá chưa xác minh'],
                  missing: ['[SYNTHETIC] Thiếu bằng chứng'], vehicle: 'walk' };
const confirmation = text(render('ConfirmSummaryCard', { summary, profile: {}, onConfirmYes: noop, onConfirmNo: noop }));
for (const warning of [...summary.warnings, ...summary.missing]) check('confirmation retains ' + warning, confirmation.includes(warning));

const stops = Array.from({ length: 3 }, (_, i) => ({
  venue_id: 'SYN-NULL-' + i, name: '[SYNTHETIC] Null probe ' + (i + 1), order: i + 1,
  city: 'Hà Nội', district: '', address: '', lat: 21.028 + i * .001, lon: 105.85,
  arrive: null, depart: null, synthetic: true,
  leg_from_previous: { minutes: null, km: 0, source: 'unknown', route_provider: null },
  price: { min_vnd: null, max_vnd: null, semantics: 'venue_range', evidence: 'unknown' },
  hours: { evidence: 'unknown', display: null, open_at_arrival: null },
}));
const tour = { status: 'conditional', stops, reasons: ['[SYNTHETIC] Thiếu dữ liệu tuyến'],
               unknowns: ['routing'], assumptions: {}, route_warnings: ['[SYNTHETIC] Tuyến chưa xác minh'],
               totals: { walk_minutes: null, leg_source: 'unknown', venue_range_upper_sum_vnd: 0 }, locks: [] };
const timeline = render('GuidedTimeline', { tour, allergies: [], onChangeStop: noop, onAdjustStops: noop, onRestart: noop });
check('null timeline never invents 19:00 or five-minute legs', !/19:00|~5\b/.test(text(timeline)));
check('conditional status is explicit', /có điều kiện/i.test(text(timeline)));
check('route warning survives timeline render', text(timeline).includes(tour.route_warnings[0]));
const evidenceTour = structuredClone(tour);
evidenceTour.unknowns = ['allergy_ingredients', 'hours', 'price_per_person', 'route', '[SYNTHETIC] Cầu thang cần xác minh'];
const evidenceTimeline = text(render('GuidedTimeline', { tour: evidenceTour }));
check('compact evidence warning retains all four distinct unknowns',
      /chưa|không/i.test(evidenceTimeline) && /thành phần.*dị ứng/i.test(evidenceTimeline)
      && /giờ mở cửa/i.test(evidenceTimeline) && /giá theo người/i.test(evidenceTimeline)
      && /tuyến đường thực/i.test(evidenceTimeline));
check('unrecognised readable evidence notice is retained', evidenceTimeline.includes('[SYNTHETIC] Cầu thang cần xác minh'));
const zeroTour = structuredClone(tour);
zeroTour.stops[1].leg_from_previous = { minutes: 0, km: 0, source: 'straight_line_estimate', route_provider: null };
const zeroTimeline = text(render('GuidedTimeline', { tour: zeroTour }));
check('zero-minute leg remains zero', /0\s*phút/.test(zeroTimeline));

const freeTour = structuredClone(tour);
for (const stop of freeTour.stops) stop.price = { min_vnd: 0, max_vnd: 0, semantics: 'venue_range', evidence: 'unknown' };
check('explicit zero venue range is not discarded as missing', /(?:^|\W)0[kK](?:\W|$)/.test(text(render('GuidedTimeline', { tour: freeTour }))));

// Known schedule/price removes unrelated "unknown time/price" labels from this hours probe.
const missingHoursTour = structuredClone(tour);
for (const stop of missingHoursTour.stops) {
  stop.arrive = '19:00'; stop.depart = '19:20';
  stop.price = { min_vnd: 45000, max_vnd: 65000, semantics: 'venue_range', evidence: 'unknown' };
}
check('missing venue hours remain explicitly unknown', /giờ[^•\n]*chưa rõ/i.test(text(render('GuidedTimeline', { tour: missingHoursTour }))));

for (const count of [3, 4, 5]) {
  const t = structuredClone(tour);
  while (t.stops.length < count) t.stops.push({ ...t.stops.at(-1), venue_id: 'SYN-URL-' + t.stops.length, order: t.stops.length + 1, lat: 21.03 + t.stops.length * .001 });
  const html = render('GuidedTimeline', { tour: t });
  const urls = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&')).filter(u => u.includes('google.com/maps'));
  check(count + '-stop Maps links are HTTPS walking URLs without keys', urls.length > 0 && urls.every(raw => {
    const u = new URL(raw); return u.protocol === 'https:' && u.hostname === 'www.google.com'
      && u.searchParams.get('travelmode') === 'walking' && !u.searchParams.has('key');
  }));
}
console.log(JSON.stringify({ synthetic: true, method: 'React SSR only; no browser, hydration or provider validation', checks: checks.length, failed: checks.filter(c => !c.pass).length }));
process.exitCode = checks.some(c => !c.pass) ? 1 : 0;
