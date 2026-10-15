# Independent frontend review — REVIEW-FE

Date: 2026-10-15. Reviewer: Codex. Review owner: Claude.
Task task_996788d6f968 / dispatch ctx_83cbcef21782.
**Recommendation: merge after fixes.** Blocking findings: F1–F6 below. Installation,
build and mock-test success do not establish live integration compatibility.

## Scope and evidence

Ran `git merge foodtour-claude-coordinator`: Already up to date.
Reviewed `git diff 08041a1 foodtour-antigravity-web -- frontend qa` and the complete
changed component/client/test source. Target branch resolved to
27fe6ebc700f764f8a4fe7781b706b71605c2007 (coordinator/backend merge). Ran
`git diff --quiet 9ebe3b4 27fe6eb -- frontend qa`: exit 0, so the reviewed frontend
and QA tree is exactly the requested FE-01 tree. No checkout of that branch,
frontend edits, private venue input, dependency upgrades or remote publishing.

References below are file:line in that frozen tree. Compared against the current
contracts/v1/CONTRACT.md including v1.1 and generated backend OpenAPI.

## Ranked findings

### F1 — High / blocking: live plan and replace wrappers are stored as tours

Evidence: frontend/app/page.js:201–203 and :243–250;
frontend/lib/api.js:697, :714, :776, :793;
frontend/lib/contractTest.js:62 and :116–132.

Scenario: real POST .../tour returns
`{preferences,missing_slots,questions,tour,revision,dataset_source,dataset_version}`.
The client returns it unchanged and Home calls setTour(wrapper). TourTimeline
expects tour.stops and returns null, and TourStatusBanner expects tour.status.
Thus a successful live plan disappears. Replace has the same mismatch. Mocks
return a bare Tour instead, so npm test passes while asserting the wrong shape;
it also asserts creation revision=1 whereas the contract requires 0.

Fix: normalize every mutation through a single wrapper consumer, using res.tour,
res.preferences, missing_slots/questions, revision, metadata and notes. Make mocks
return the actual wrapper and creation revision 0, invalidate mock tours on PUT,
and add tests against actual server-shaped responses instead of only mock output.

### F2 — High / blocking: live replacement crashes; preview is not the committed candidate

Evidence: frontend/app/page.js:223–227, :243–247;
frontend/lib/api.js:408–437; frontend/app/components/ReplaceDiffModal.jsx:14–16,
:122–141.

Scenario: the deliberately legacy GET /v1/venues returns `{items:[...]}`; the UI
unconditionally calls venuesRes.venues.find, causing TypeError before opening the
replace modal. Legacy rows also have venue_types/geo_status/*_norm fields, not
the mock's online_only/geo_ok/price_max_vnd shape. Even if this shape is adapted,
the client chooses its own first candidate for the before/after preview, but
sends only the old venue_id: the server deterministically selects its own
replacement, which can differ. A missing candidate becomes fabricated
"Quán đề xuất tối ưu", a default address and zero-based price difference, while
the confirm button remains enabled. The modal promises guaranteed duration even
though routing is estimated.

Fix: adapt legacy list fields only if the list is actually needed; let the server
choose. Do not claim a specific replacement/price saving before a server-confirmed
result. Present the actual returned diff, or coordinate a real preview contract
before offering candidate-specific confirmation. Keep missing values unknown and
replace the guaranteed-duration wording with the server's evidence qualification.

### F3 — High / blocking: session/mode transitions retain old tours and lose provenance

Evidence: frontend/app/page.js:74–95, :265–269, :365, :333;
frontend/app/components/MockBanner.jsx:4; frontend/app/page.js:110–137.

Scenario: create a mock tour, then click "Chuyển sang Backend Thật". isMock changes
and the warning banner disappears immediately, but initSession resets only
credentials/revision/messages; the old synthetic tour/preferences/modal/highlight
remain. If the live request fails, the stale tour still appears under live mode.
"Tạo phiên mới" likewise leaves a tour belonging to a different session visible.
The reset button is enabled during requests, with no generation/cancellation
guard, so older replies can also overwrite the new session's state. In live
transport, backend synthetic fallback is not recognized: dataset_source/version
and stop.synthetic are never consumed, and labels depend only on transport mode.

Fix: clear all session-owned state atomically when starting/resetting/switching,
block competing transitions or discard replies from old request generations,
and derive provenance banners from server metadata/per-stop synthetic flags as
well as transport mode. Commit the mode/credential transition only with coherent
new-session state; retain explicit loading/failure status during transition.

### F4 — High / blocking: authoritative null tours and rejected-input notes are ignored

Evidence: frontend/app/page.js:115–128, :168–173, :195–202;
frontend/app/components/PreferencesPanel.jsx:39–54; frontend/app/page.js:553.

Scenario: after a valid tour, saving new structured constraints returns tour=null
because the server invalidates the previous tour. The UI only sets a tour when
truthy, so the old itinerary remains beside new preferences and revision. A
rejected request such as "5 phút" returns notes and tour=null, but the UI hides
notes and retains the previous tour. Missing-slot responses have the same issue.
The strict-to-explore button also sends only {mode:'explore'} even though PUT
replaces the preference document, resetting the origin/duration/budget to defaults
or missing values. Local form fields refuse to clear when server values are null,
so displayed input can also diverge from authoritative preferences.

Fix: apply res.tour even when null, replace missing/questions/notes and preferences
on every wrapper, explicitly represent rejected constraints and clear nullable
form controls. For a mode-only UI edit, merge the complete current document before
PUT; do not assume a PATCH contract.

### F5 — High / blocking: missing hours are replaced by an invented interval

Evidence: frontend/app/components/EvidenceBadge.jsx:63–88.

Scenario: every current backend stop supplies hours={status:'unknown',display:null,
open_at_arrival:null}. HoursBadge renders "07:00–22:00 (tham khảo)" despite there
being no source interval. Independent server-render probe confirmed this. The
null open flag itself is correctly left as "Chưa rõ theo giờ đến"; that does not
justify inventing the adjacent hours.

Fix: render missing display as "Chưa rõ" with the existing unknown badge; only
show a supplied source string. Add a render assertion that unknown/null hours
cannot contain an invented interval. Price badges correctly reserve verified
styling for evidence==='verified' and disclose venue-range semantics.

### F6 — High / blocking: map connects markers without geometry and can call it a provider route

Evidence: frontend/app/components/MapView.jsx:119–120, :201–210, :324–330.

Scenario: polylinePoints is always just origin/stop coordinates. A polyline is
rendered whenever there are two points, including legSource='unknown' and
straight_line_estimate. Changing only legSource to provider_route switches those
same straight segments to solid and says they came from actual routing. No
provider geometry is accepted by the component. The independent render probe
produced identical points for all three sources; only dash style changed.

Fix: under this review's route-line gate, use marker-only rendering without
provider_route and actual geometry. A provider source enum alone is not geometry:
only draw a verified supplied route after the provider/contract supplies it.
Never upgrade endpoint connectors to actual street geometry.

### F7 — Medium: error recovery routes every failure to the wrong operation

Evidence: frontend/app/page.js:138–143, :175–178, :208–211, :255–258,
:392–408; frontend/app/components/RevisionConflictAlert.jsx:22–46.

Scenario: failed replacement returns 409 no_candidates, but every 409 is displayed
as revision_conflict and "Đồng bộ lại" creates a fresh session instead of syncing.
Unavailable LLM (503), rate limit (429), initial session failure, and expired
session share a generic Retry that calls handlePlanTour, not the failed action.
After createSession fails, sessionId is null, so Retry does nothing. A rejected
message can be lost while Retry instead plans with old preferences.

Fix: branch on error.code as well as HTTP status; preserve the failed operation
and user draft for deliberate retry. Offer create-new-session recovery for expiry,
appropriate wait/retry state for rate limits and structured-input fallback for
unavailable extraction. Treat no_candidates as an unchanged tour with reasons,
not a revision conflict. Client ApiError does preserve real code/status for these
cases; the defect is in the page consumer.

### F8 — Medium: projected markers and tile pixels use different responsive coordinate systems

Evidence: frontend/app/components/MapView.jsx:68–69, :98–104, :163,
:179–183, :192–199; frontend/app/page.js:504.

Scenario: tile positions are fixed CSS pixels for a 600x400 view, while SVG points
are scaled into a width:100%, height:380 viewport. At a mobile viewport narrower
than 600px, tile locations stay unscaled but SVG markers/lines scale and letterbox;
markers no longer represent the same map locations as the tile beneath them.
The outer grid's 360px minimum plus 32px page padding also exceeds a 390px viewport
by at least 2px (and more on 320px). This is static coordinate/layout analysis,
not an executed browser screenshot.

Fix: measure the viewport and project tiles/markers in the same pixel space, or
scale the entire tile/overlay layer together; use a grid minimum that fits the
available width. Verify at 320/390/1280px and on resize. Replace direct
window.innerWidth branches during render with CSS media queries or reactive,
hydration-safe viewport state.

### F9 — Medium: keyboard and form labeling are incomplete

Evidence: frontend/app/components/MapView.jsx:217–224;
frontend/app/components/TourTimeline.jsx:77–94;
frontend/app/components/ReplaceDiffModal.jsx:19–22, :50–62;
frontend/app/components/PreferencesPanel.jsx:145–360.

Scenario: SVG markers and clickable timeline articles have pointer handlers but
no tabIndex/keyboard handler. The modal declares aria-modal without initial-focus
management, focus trap, Escape close or restoration; keyboard focus can remain
behind it. Form labels are siblings without htmlFor/id associations, so controls
do not receive their visible labels as accessible names. Icon-only close buttons
also lack descriptive labels.

Fix: native buttons or focusable Enter/Space controls, connected label/id pairs,
and full modal focus lifecycle. Give close buttons accessible names and announce
chat updates. Several primary controls already use native buttons and chat input
has aria-label; this is a targeted gap, not a claim that all controls are unusable.
No screen-reader/browser execution was performed in this task.

### F10 — Medium: scope quick answers do not resolve the live missing slot

Evidence: frontend/app/page.js:150–156; frontend/lib/api.js:515–523;
backend/app/llm/extract.py (budget_scope update is conditional on parsing money).

Scenario: send "ngân sách 150k" and then press the "mỗi người" quick answer. The
page sends only "Ngân sách tính cho mỗi người". The current extractor updates
budget_scope only in a message that also has a money value, so the scope remains
missing and the question repeats. The frontend mock has the same dependency.

Fix: use a full structured preference update for explicit slot chips, preserving
all existing values, or repeat the known amount in that clarification while
coordinating an extractor fix with Claude. Test this as a two-message flow.

## Security, mock and dependency checks

Session token lives only in React state (page.js:45, :81) and is passed through
X-Session-Token headers; no token-in-URL, localStorage/sessionStorage persistence
or production console logging was found. Mock tokens are weak by design and
must never authenticate live requests; reset isolation in F3 is essential. No
dangerouslySetInnerHTML/innerHTML/eval was found; chat, explanations, names and
addresses render as React text. Source links and OSM links opened with target
_blank all carry rel=noreferrer. Source URLs are passed directly to href
(TourTimeline.jsx:209), so allowlisting http/https at ingestion/render remains
sensible hardening; no executable-XSS browser exploit was demonstrated here.

Null open_at_arrival is never rendered as open in HoursBadge (confirmed by render).
Unknown evidence does not get verified styling. These positives coexist with F5's
invented hours. Map attribution is present. Frontend mock mode is explicitly
labeled by default, and live request failures do not automatically switch to mock;
F3 describes stale-state/provenance leakage across the explicit switch.

No dependencies or lockfile changes relative to baseline. package.json adds
type=module and the test script only; next/react/react-dom declarations are
unchanged. npm ci reports two vulnerabilities. Additional read-only npm audit
--json exits 1 and reports next=moderate (via postcss), postcss=high, totals:
1 moderate / 1 high / 0 critical. These are existing locked dependencies, not
introduced by FE-01. No audit fix, forced upgrade or dependency mutation was run.
A separate dependency assessment is required before any broader release claim.

## External scratch verification — actual commands and output

Reviewed checkout content exported without switching branches:

```powershell
$scratchRoot=Join-Path ([IO.Path]::GetTempPath()) ('foodtour-review-fe-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratchRoot | Out-Null
git archive --format=tar --output="$scratchRoot/frontend.tar" foodtour-antigravity-web frontend
tar -xf "$scratchRoot/frontend.tar" -C $scratchRoot
node --version
npm --version
```

Scratch root: C:/Users/tuana/AppData/Local/Temp/foodtour-review-fe-46b5ec33659d4786b5523ffb66c8bd03.
Node v24.19.0, npm 11.17.0. From its frontend/ directory ran:

```powershell
npm ci
Write-Output "npm_ci_exit=$LASTEXITCODE"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build
Write-Output "build_exit=$LASTEXITCODE"
npm test
Write-Output "test_exit=$LASTEXITCODE"
```

Actual install/build output:

```text
added 20 packages, and audited 21 packages in 11s
5 packages are looking for funding
2 vulnerabilities (1 moderate, 1 high)
npm_ci_exit=0

> foodtour-web@0.1.0 build
> next build
   ▲ Next.js 15.5.28
   Creating an optimized production build ...
 ✓ Compiled successfully in 2.7s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/4) ...
 ✓ Generating static pages (4/4)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ○ /                                    17.2 kB         120 kB
└ ○ /_not-found                            993 B         104 kB
+ First Load JS shared by all             103 kB
○  (Static)  prerendered as static content
build_exit=0
```

Actual npm test output excerpts (all twelve labeled mock cases ran, exit 0):

```text
> foodtour-web@0.1.0 test
> node lib/contractTest.js
=== Testing API Client in MOCK MODE against CONTRACT v1 ===
Test 1: GET /health
  ✓ Health passed: { status: 'ok', dataset_loaded: true, llm: 'mock',
    routing: 'straight_line_estimator', is_mock: true }
Test 2: GET /v1/venues
  ✓ Venues list passed: 5 items
Test 3: GET /v1/venues/{id}
Test 4: POST /v1/sessions
  ✓ Session created: mock-session-1792057478813 revision: 1
Test 5: POST /v1/sessions/{id}/messages (missing slot)
Test 6: POST /v1/sessions/{id}/messages (full preferences -> Tour)
Test 7: PUT /v1/sessions/{id}/preferences (409 Revision Conflict)
Test 7b: PUT /v1/sessions/{id}/preferences (Valid update)
  ✓ Preferences updated successfully. Revision: 4
Test 8: POST /v1/sessions/{id}/tour
  ✓ Plan tour succeeded. Revision: 5
Test 9: POST /v1/sessions/{id}/tour/replace
  ✓ Replace stop succeeded with locks!
    Before: [ 'SYN-001', 'SYN-002', 'SYN-005' ]
    After:  [ 'SYN-001', 'SYN-003', 'SYN-005' ]
    Locks:  [ 'SYN-001', 'SYN-005' ]
Test 10: Impossible budget request check
Test 11: Strict mode insufficient evidence check
Test 12: POST /v1/plans (legacy)
  ✓ Legacy endpoint passed: 3 stops
🎉 ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
test_exit=0
```

These tests force mock mode. They do not test live wrappers, ownership/expiry,
server error recovery, DOM behavior or the map geometry condition. Their current
initial-revision/list/bare-tour expectations disagree with v1.1; the success
message is not an integration acceptance result. The FE01 QA report's broad
desktop/mobile claims were not independently reproduced here.

## Independent targeted probes

Created review-probe.mjs only in the external scratch copy. It imports the frozen
API module, stubs fetch with synthetic contract-shaped wrappers/errors (no real
token or network), compiles unchanged JSX using the installed Next SWC, and renders
HoursBadge and MapView through ReactDOMServer. Command: `node review-probe.mjs`,
exit 0. Exact script:

```javascript
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as api from './lib/api.js';
const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
function component(relative) {
  const filename = path.resolve(relative);
  const transformed = swc.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, jsc: {parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},
    module:{type:'commonjs'}
  });
  const m = new Module(filename, undefined);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  m._compile(transformed.code, filename);
  return m.exports;
}
const {HoursBadge} = component('app/components/EvidenceBadge.jsx');
const hours = renderToStaticMarkup(React.createElement(HoursBadge,{hours:{status:'unknown',display:null,open_at_arrival:null}}));
console.log('unknownHoursInvents0700To2200=', hours.includes('07:00'));
console.log('nullOpenRenderedAsOpen=', hours.includes('Đang mở cửa'));
const MapView=component('app/components/MapView.jsx').default;
const stops=[{venue_id:'TEST',order:1,name:'[SYNTHETIC]',lat:21.03,lon:105.85}];
for (const source of ['unknown','straight_line_estimate','provider_route']) {
 const html=renderToStaticMarkup(React.createElement(MapView,{origin:{lat:21.029,lon:105.851},stops,legSource:source}));
 console.log('mapSource=',source,'polyline=',html.includes('<polyline'),'points=',html.match(/<polyline points="([^"]*)"/)?.[1],
             'dash=',html.match(/stroke-dasharray="([^"]*)"/)?.[1]);
}
api.setRuntimeMockMode(false);
const wrapper={preferences:{mode:'explore'},missing_slots:[],questions:[],tour:{status:'conditional',stops:[{venue_id:'TEST'}]},revision:2,dataset_source:'synthetic',dataset_version:'a'.repeat(64)};
global.fetch=async()=>({ok:true,json:async()=>wrapper});
const planned=await api.planTour('test-session',1,'test-only-dummy-token');
console.log('livePlanConsumerStoredTourHasStops=',Array.isArray(planned.stops),'nestedTourHasStops=',Array.isArray(planned.tour?.stops));
global.fetch=async()=>({ok:true,json:async()=>({items:[]})});
try {const list=await api.getVenues();list.venues.find(()=>true);} catch(e){console.log('liveReplacementListFailure=',e.name+': '+e.message);}
for(const [status,code] of [[409,'no_candidates'],[503,'provider_unavailable'],[429,'rate_limited']]){
 global.fetch=async()=>({ok:false,status,json:async()=>({error:{code,message:'synthetic error'}})});
 try{await api.planTour('test-session',1,'test-only-dummy-token');}catch(e){console.log('propagated=',e.status,e.code);}
}
api.setRuntimeMockMode(true);
console.log('mockInitialRevision=',(await api.createSession()).revision);
```

Actual output (coordinate point strings shortened; equality checked by inspection):

```text
unknownHoursInvents0700To2200= true
nullOpenRenderedAsOpen= false
mapSource= unknown polyline= true points= [same two projected endpoints] dash= 6,5
mapSource= straight_line_estimate polyline= true points= [same two projected endpoints] dash= 6,5
mapSource= provider_route polyline= true points= [same two projected endpoints] dash= none
livePlanConsumerStoredTourHasStops= false nestedTourHasStops= true
liveReplacementListFailure= TypeError: Cannot read properties of undefined (reading 'find')
propagated= 409 no_candidates
propagated= 503 provider_unavailable
propagated= 429 rate_limited
mockInitialRevision= 1
```

## Merge gate

**Merge after fixes**, with F1–F6 blocking: authoritative v1.1 wrapper handling;
server-driven truthful replacement; isolated session/mode state and provenance;
null/rejected-state handling; unknown-hours rendering; geometry/source gating.
Address F7–F10 before claiming reliable recovery, mobile map accuracy or keyboard
acceptance. Re-run installation/build, genuine server-shaped client tests and
independent desktop/mobile flows after fixes. This review task changes only this
report and does not implement or approve frontend fixes.
