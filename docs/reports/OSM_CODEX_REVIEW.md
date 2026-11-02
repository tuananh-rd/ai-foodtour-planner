# OSM integration review

Current verdict: frontend findings resolved in fb82e66; actual offline acceptance PASS with
backend e8d62f8. Worker settlement and final original-session runtime checks pending.
The initial rejection and its evidence are retained below.
Reviewed current Antigravity working patch after its build-ready status (2026-11-03).
Build success and18contract/7unit passes are worker-reported; browser acceptance is pending.

| Severity | Finding and evidence | Acceptance |
| --- | --- | --- |
| P1 | `buildDiscoveryMapsUrl({origin:null,stops:[{lat:21,lon:105},{lat:21.01,lon:105.01}],vehicle:'car'})` returns a URL. The public per-leg helper resumes from stop1 despite no selected origin. Independently reproduced RED. | Invalid/missing origin yields no directions in all public builders; two valid stops cannot bypass the guard. |
| P1 | PilotMap coerces origin/stops with `Number(...)`; null/empty/boolean input can become invented coordinates while the other coordinate remains valid. | Share strict finite numeric-pair validation with the helper, with no coercion; invalid points never become markers/connectors. |
| P1 | PilotMap still sets exact HoanKiem `maxBounds`; the real menu6 HoangMai journey lies outside that pilot. Fit bounds cannot display the actual origin and stops correctly. | Remove clipping bounds, fit actual origin/stops, disclose limited local tile coverage; show truthful unavailable basemap or policy-compliant OSM layer. |
| P2 | `isValidOsmDirUrl('https://www.openstreetmap.org/directions-evil?engine=fossgis_osrm_car&route=NaN;bad')` returns true. Independently reproduced RED. | Exact path, bounded URL, exactly two strict finite coordinate pairs, supported matching engine, no ambiguous duplicate params or hash. |

Preserve original stop numbering and gaps. Partial links must never silently connect across a
missing-coordinate stop; unsupported motorcycle mode must remain unavailable. The backend has
passing regressions for these contracts and does not call a routing service while building URLs.

Findings sent through the active Dispatch ctx_ee8b6bdb56b6. A one-time terminal attention prompt
was also sent after a non-consuming mailbox peek showed11 undelivered guidance messages; this
did not create a new Task/editor or grant acceptance. No overlapping frontend edits by Codex.

Required after fixes: affected regressions, correct8250 real-mode build, actual3350 private-menu
typed journey plus map mount/resize/toggle/origin/order/mobile/missing-coordinate/unavailable
checks. No additional app AI generation or provider-budget change is authorized.

## Delta review: fb82e66

All four findings were corrected in actual source; independently reproduced null-origin and
malformed-URL cases now GREEN. Strict numeric helper is reused by PilotMap, original stop
orders preserved, restrictive bounds removed, local tile coverage disclosed. Existing worker
build reports exit0; compiled API8250 verified and corrected production UI loaded on3350.

Independent rendered review:12checks PASS on actual3350/API8250 private/mock/rules lane, no
response interception: WebGL map and outside-pilot origin inside canvas; actual marker hide/restore;
visible OSM attribution and coverage notice;1280/1920/390resize without horizontal overflow;
clear/change origin replaces address/marker; no Google navigation/script; blocked local PMTiles
shows usable fallback; no browser exception. Aggregate evidence osm-codex-render/private-evidence.json.
Harness-only failures (hidden-sidebar selector, incomplete chosen-origin helper and an escaped
evaluation expression) were corrected; no product changes were inferred from those failures.
Missing-coordinate gaps/order remain synthetic helper + source-reviewed component validation,
not claimed as missing coordinates returned by the validated private dataset. Full typed menu
journey/worker settlement still pending. No live routing or Gemini quality acceptance.

## Actual typed journey and concurrency fix

The independent real3350 browser journey reproduced HTTP503 immediately after tour confirmation
when entering a new food request. This was a real backend failure, separate from earlier harness
issues: the map-links GET held `BEGIN IMMEDIATE` while SQLite session restoration reloaded the
large validated dataset. The simultaneous chat POST hit SQLite's bounded busy timeout. Sequential
API tests did not overlap the automatic map request and therefore passed.

Fix e8d62f8 adds an authenticated read-only session snapshot for the map endpoint: read one row,
close the database connection, then restore its tour/dataset. It never persists the older read.
Normal mutation transactions and CAS are unchanged; constant-time token checks, expiry and the
same bounded process-local rate gate remain. An event-driven regression blocks map restoration
while a concurrent CAS write commits and verifies that the old map read cannot overwrite it.
The affected map suite has10tests:9passed in the initial run, one test assertion used the wrong
APIError attribute and was corrected; that test plus10repository tests then passed. No product
guard was weakened to make the test pass.

Actual browser rerun on e8d62f8:10checks PASS, no interception, no automatic retries, zero model
calls and no browser exception. Typed food request -> choose local address -> actual menu result
-> selection -> explicit car profile -> confirmation -> tour -> OSM origin/order/car link PASS.
Immediate post-tour food change preserves origin/selection, clears confirmation/tour and removes
the rendered timeline. Literal unavailable food returns no unrelated cards; changing area keeps
that truthful zero-result state and valid selected origin/venues. Evidence:
`osm-codex-journey/private-evidence.json`. The separate real API three-stop check verifies all
three ordered OSM legs; the one-stop browser check does not claim a multi-stop browser route.

Prices remain delivery references. Local PMTiles covers the HoanKiem pilot; outside it the map
honestly shows a basic background with markers/connectors and a coverage warning. External OSM
directions are per leg; motorcycle routing is unavailable and never silently changed to car.
