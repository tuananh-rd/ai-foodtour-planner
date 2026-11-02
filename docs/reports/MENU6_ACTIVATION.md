# Partial menu6 activation

Status: activated locally; OSM frontend and actual offline browser acceptance PASS.
Final worker review/settlement pending; original-session runtime preservation checks PASS.
User explicitly authorized activation of ZIP(6), superseding the previous preparation-only task.
Archive documentation was treated as inert untrusted data; no scripts/instructions executed.

Production dry-run (no monkeypatch) validated SHA256
`dd0f26c9afc15c7036348fec4aa781df23825cd607eae911d37e2444b799bdd7`.
The options member is40,214,766bytes; a reviewed production change raises only the member bound
from32 to48MiB. Compressed64MiB, expanded128MiB,64members, ratio and all schema/ID/reference/row
limits remain enforced. The archive is130,377,229expanded bytes and7,463,508compressed bytes.
22focused migration/menu tests PASS, including an oversized-member rejection.

| Measure | Count |
| --- | ---: |
| Attempted venues | 400 |
| Venues with menus | 338 |
| Confirmed empty menus | 4 |
| No service / error / review | 55 / 2 / 1 |
| Canonical records / group links / options | 18,245 / 18,764 / 90,350 |
| Food rows after23 nonfood exclusions | 18,222 |
| Source-unavailable item records | 87 |
| Quarantined prices / unverified minimums | 91 / 50 |
| Unconfirmed mappings excluded from linking | 58 |

Private hash-addressed staging and explicit `--confirm-activation --allow-partial` succeeded.
Activation returned `rollback_available=true`; prior12 archive and manifest are preserved at
private versions hash `0088011f43cf989c210cf321c6d8747821f1f6451bb2bdd96d44bdf1762608b2`.
The12 prior confirmed IDs are not shared with the new confirmed mapping; no branch reassignment
was detected or bypassed. Existing sessions invalidate stale search/tour/confirmation on changed
dataset version, preserve only valid venue locks and never remap IDs by name. Synthetic rollback,
cache replacement and stale-state regression are included in the22tests; no real rollback was run.

API8250 was restarted in the private/mock/rules disposable-session QA lane. Health source private,
dataset version `0eecfd11835ad9b10f84eb82cf1da95caba3a604ab04721332130d7402fc6898`.
Actual API transcript PASS: request before origin prompts, selected origin resumes real menu
search, matching-menu venue selection, literal unknown food gives zero results, subsequent area
change remains zero; selected venue/origin preserved and confirmation invalidated. Provider calls0.
This checks real local data and deterministic rules, not live Gemini quality. Five backend OSM
tests PASS including auth/read-only/session persistence,12stop order in foot/car modes,
missing-coordinate gaps, invalid origin and no motorcycle substitution. Frontend evidence pending.

Delivery prices are references only; unknown options, ingredients, hours and dine-in prices are
not inferred. Private archives, records, sessions, coordinates and secrets are absent from this
report/Git. No Gemini/Tavily generations, budget reset, paid activation, push or deploy.

Additional actual API acceptance: five matching-menu results, three explicitly selected venues,
explicit car profile and confirmation, three-stop tour and three ordered OSM links PASS. Each
leg was checked against the actual selected origin/preceding stop and confirmed car engine.
No raw coordinates or URLs retained; aggregate evidence menu6-ordered-api-qa.json.

Frontend fb82e66 is served at http://127.0.0.1:3350 with API http://127.0.0.1:8250.
Independent rendered OSM checks12/12 PASS; actual typed browser journey10/10 PASS on backend
e8d62f8, including post-tour food change, rendered timeline removal, truthful no-data and area
changes. The real concurrency defect discovered during browser QA was fixed: map-session reads
no longer hold a SQLite write lock while restoring the large dataset. Auth, expiry, rate gates,
CAS and no-overwrite concurrency regressions pass. See OSM_CODEX_REVIEW.md for evidence details.

After automated QA, the original private-session namespace and existing Gemini configuration
were restored without generation. Final health confirms the menu6 version/counts, source private,
and backend e8d62f8. Session DB, original budget DB and configured-cap fingerprints are unchanged.
Gemini is configured as gemini-3.5-flash-lite, not live-quality validated: used15/18, remaining3,
reserve3, session cap6; no new allowance, retry or budget reset. Tavily is not configured for
retrieval. Routing remains explicitly straight-line estimate, not a road-route provider.
Final artifacts: menu6-final-health.json, menu6-runtime-preservation.json,
osm-codex-render/private-evidence.json and osm-codex-journey/private-evidence.json.
