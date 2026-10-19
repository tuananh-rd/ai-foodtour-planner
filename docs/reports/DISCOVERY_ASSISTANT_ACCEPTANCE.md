# Discovery-first assistant delivery evidence

2026-10-19. Requirements: `docs/DISCOVERY_ASSISTANT_REQUIREMENTS.md`; archived reference is input, not authority to add services. Codex coordinates/contracts/backend/reviews/integrates, Antigravity implements bounded frontend and QA, Claude inactive.

## Running version

**http://127.0.0.1:3200** — immutable production frontend built from41b1d33; actual API8200 reports99d64ce. `git diff41b1d33..99d64ce -- frontend backend` is empty: the later commit adds review documentation only. Backend and frontend therefore use the same integrated application source. Existing old/user servers preserved; only positively identified task-owned3200/8200 processes were refreshed. No push/deploy.

Mode: **synthetic venue fixture + deterministic rules**, actual application HTTP/planner/SQLite, external providers disabled. This is NOT live Gemini or private-dataset browser acceptance. Private dataset additionally passed an isolated actual-app smoke (below); no private venue names/IDs/addresses/records or credentials were saved in Git. Existing local credentials/ledgers/caps/accounts untouched. Tavily runtime removed and never called in this work.

## Delivered behavior

- Discovery-first greeting/dish knowledge/search/compare/select without requiring a tour profile; one necessary contextual question at a time, useful local response first. Main chat has no “Mình hiểu là” field matrix; optional trip editing is collapsed.
- Seven backend-validated tools on the existing dataset repository, versioned profile/selection and optimistic revisions. Real-ID/action-success checks, locks, preserved unrelated preferences, budget scope and per-leg semantics. Explicit server confirmation required to plan; edits invalidate tour/confirmation. Unknown allergy evidence never becomes safe and blocks strict planning.
- One bounded native Gemini function-calling adapter on existing configuration/budgets, no full-dataset prompt, health/GPS/contact turns local, preserved in-turn signatures/function IDs. Local fallback remains usable when model allowance is exhausted. No second explanation-model call during discovery restore.
- Local self-hosted PMTiles map, actual geographic tiles/markers/toggle and attribution; free Maps URLs use actual chosen origin, stop order and travel mode. Null coordinates cannot become0,0; invalid selected points fail closed. No real road-routing claim for planner estimates.
- Tavily opt-in/web citations/runtime/provider/probe code retired; venue provenance links retained. No PostGIS migration/weather service/Docker/dependency upgrade introduced. Existing private datasets and historical credit ledgers remain intact.

## Verification matrix

| Evidence | Result | Scope/limits |
|---|---|---|
| Backend broad regression at42d7d7f |652 tests,1 optional private-data skip, exit0 | Before isolated legacy-restore model guard; that guard separately passed targeted HTTP test |
| Integrated backend discovery/session modules on2d54e49 |41/41 PASS | Includes confirmation/render, real temp-SQLite restart, concurrency/CAS, privacy, quota fallback and Unicode storage |
| Frontend HTTP/client targeted smoke on2d54e49 |51/51 PASS, normal exit | Real local HTTP streams, mocked provider/data; no runtime/browser or live Gemini claim |
| Existing frontend contract invariants |18/18 PASS | Retired web removal preserved other legacy behavior |
| OpenAPI drift |PASS | Exported typed request/response schemas match server |
| Production build41b1d33 |PASS,147kB first load | New build required after actual UI defects; earlier successful builds are not final evidence |
| Actual production UI + actual synthetic backend,1440×1024 and390×844 |**63/63 PASS**, exit0,0 uncaught JS exceptions | `discovery-assistant-verified/browser-evidence.json`; no external provider/map origins; actual PMTiles206 |
| Private local dataset isolated app smoke |PASS, limited | Greeting, Xuân Thủy discovery without tour slots, actual comparison/validated selection/taste retention, group budget/per-leg semantics;0 model calls; temporary sessions only, no venue records in report |
| Live Gemini native-tool conversation quality |**NOT TESTED** | No new live probe, no budget/cap increase; configured adapter is not proof of live success |
| Full WCAG/accessibility certification, broad private-data tour coverage |NOT TESTED | Browser checks cover keyboard focus,390px overflow and tested flows, not full certification |

The63 browser checks include greeting → search → compare A/B → add A/find low-sugar chè → group budget500k/2 and patch600k → actual stale-revision409/no replay/draft retained → prepare/explicit confirmation (`ok` does not confirm) → real tour → free Maps origin → visible geographic map/marker toggle → reload → stop lock/remove protection → actual replacement/new confirmation → no-solution/recovery → allergy invalidation/strict block → offline error → reset/new session. All public fixture content is explicitly synthetic. Xuân Thủy grammar/data coverage is separately checked on synthetic unit fixtures and private local smoke; missing pilot fixture hits are never fabricated.

## Actual images and visual limits

Final evidence in `discovery-assistant-verified/`: discovery/confirmed/map screenshots at1440 and390, `reference-side.png` and `reference-overlay.png` against the original Figma PNG. Inspected actual overlay, side comparison and mobile tour/map. Map image shows roads/lake/marker and attribution, supplementing HTTP206; canvas presence alone was explicitly rejected as proof.

Warm editorial232px rust sidebar, yellow canvas,668px chat panel and right trip column retained. **Not pixel-perfect**: heading baselines/font metrics, hero wrapping/vertical spacing, nav contents and composer geometry differ from the reference. Discovery results/selection/unknown-evidence warnings and real controls intentionally replace static sample conversations/tours; no fake saved/share/account feature was added. Mobile has stacked navigation and scrolling. Original static sample facts/times/prices are never product data.

## Failures found and corrected

| ID | Kind | Reproduction/fix | Final evidence |
|---|---|---|---|
| HARNESS-01 |Test infrastructure | QA assertions finished but success path held HTTP/CDP/children open32min; verified QA-only PID stopped, worker recovered, bounded cleanup fixed | Subsequent targeted smoke normal exit; worker lifecycle settled correctly |
| API-01 |P1 product | Select A, then find chè ít ngọt, confirm → render500 from different planner interest context |439980f, real HTTP regression + final browser tour PASS |
| API-02 |P1 product | Confirm discovery tour, restart SQLite app → missing tour metadata |d27b0a9, actual restart regression PASS |
| API-03 |Product resilience | Existing session model cap exhausts → local discovery dead end |42d7d7f,0-call local fallback tests PASS |
| UI-01..04 |Product | Initial failures could enable input; body timeout swallowed; nonexistent totals; replacement only re-prepared same selection |3944aca/cdd4c46 plus final real browser flows |
| MAP-01 |Product + test gap | Removing shared web CSS left map unstyled/zero-height while206 and canvas-existence assertion passed |df4b5df standalone map CSS; visible≥250px canvas + geographic screenshot + final flow PASS |
| UI-05 |Product | Replace click updated state then threw undefined `isDesktop`; functional assertions alone missed exception |41b1d33 removes undefined branch; final63 checks0 exceptions |

Earlier failed/partial evidence remains separate: `discovery-assistant-production/` and `discovery-assistant-final/` record62/63 and console failure; `discovery-assistant-map-retest/` records targeted CSS retest. Their successes must not be presented as final acceptance. No user server or agent process was killed during harness recovery.

## Review gate

Affected-implementer source approvals: Antigravityfe3b39b for2d54e49 anddee9da6 fordf4b5df, integrated702ce92/99d64ce. Final two-handler41b1d33 review task_cea0c5632305/ctx_8b340803589a settled correctly withf13b0bc, APPROVE/0 blockers, integratedc10ff0c. These source reviews complement Codex's independent63/63 production browser evidence and actual screenshot inspection. All current tasks settled, same Antigravity terminal retained idle; reclaimable-resource enumeration returned0. No Claude approval is required under the current direct assignment.
