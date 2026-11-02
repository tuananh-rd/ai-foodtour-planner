# OSM integration review

Verdict: changes requested before loading the frontend candidate on3350.
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
