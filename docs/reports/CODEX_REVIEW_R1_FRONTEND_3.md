# Independent Codex re-review — R1-5c

Date: 2026-10-16. Reviewer: Codex, independent of author Antigravity. Fix reviewed: `0b4ac0c6cbae466e8c16cc902a09aa5c7ac7a480`, integrated at `e9df8cf` after the requested `git merge foodtour-claude-coordinator` fast-forward. Prior findings: `docs/reports/CODEX_REVIEW_R1_FRONTEND_2.md`.

**Decision: REQUEST CHANGES.** F07 and R2-N02 are fixed. R2-N01's hours and price reproductions are fixed, but routing evidence still promotes contradictory estimate/unknown leg evidence into a provider-route claim, including the green full-evidence header. The requested review is complete; this decision does not approve integration or enablement.

## Execution

- Changed only this report. No production, contract, QA, dependency, private dataset, or configuration files were edited.
- `node qa/e2e/test_components.mjs`: **37/37 PASS**.
- `$env:UI_V2_PORT='13000'; node qa/e2e/test_ui_v2.mjs`: scratch production build succeeded, **26/26 PASS**. Mobile first-stop top: **650.984375px** at 390×844; desktop: **436.59375px** at 1280×800.
- Independently built current frontend in real API mode outside the repository, using synthetic Node HTTP responses on **18000**, Next production server on **13000**, and headless Edge/CDP. Application/API listeners used only these assigned ports; CDP used the existing harness's separate debugging endpoint. No private data, provider keys, external provider calls, or publishing.
- Real-mode scratch: `%TEMP%/codex-r1-review3-ADMwkw`. Controlled baseline scratch: `%TEMP%/foodtour-uiv2-build-mCH2rn`. The supplied suite's scratch was `%TEMP%/foodtour-uiv2-build-dkfTSn` and was removed by its cleanup.
- Independent scratch harnesses: `codex-r1-review3-browser.mjs`, `codex-r1-review3-routing-dom.mjs`, `codex-r1-review3-matrix.mjs`, `codex-r1-review3-route-schema-matrix.mjs`, and `codex-r1-review3-style.mjs`. Re-ran `codex-r1-baseline2.mjs` to rebuild the baseline. Harnesses are outside Git; observations and reproductions needed for assessment are recorded below. Their inherited `0/0` acceptance footer is not a passing test count.
- Corrected harness setup errors before collecting accepted results: unavailable `python` alias, scratch-relative module resolution, Unicode matching through a shell pipe, and references to removed/nonexistent scratch directories. Final matrix predicates use the actual component copy; final browser runs use the newly built current scratch. Failed setup attempts are not acceptance evidence.

## Finding dispositions

| Finding | Disposition | Evidence |
|---|---|---|
| R2-N01 — hours object presence | **FIXED** | Production HTTP response with `hours.status='unknown'`, `open_at_arrival=null`, and no `hours` aggregate unknown now says `Chưa chắc: giờ mở cửa`; expanded text does not claim verified hours. Verified status with `open_at_arrival=false/null` also stays unknown in independent render probes. Aggregate `unknowns:['hours']` overrides otherwise verified stop fields. |
| R2-N01 — nested per-person price evidence | **FIXED** | `price:{min_vnd:40000,max_vnd:40000,semantics:'per_person',evidence:'verified'}` renders verified price text without an unknown-price warning. Estimate/unknown evidence and venue-range semantics remain conservative. Aggregate `price_per_person` unknown overrides verified stop fields. `verified_exact` is gone from executable comparisons; one explanatory comment still mentions that obsolete value. |
| R2-N01 — provider versus estimate routing, conflicting evidence | **NOT FIXED** | Consistent provider and estimate cases render their respective copy, and aggregate `unknowns:['route']` vetoes verification. However, provider totals override explicit estimate/unknown stop legs. Both independent static rendering and production browser reproduce the false verified claim; details below. |
| F07 — flag-off rollback | **FIXED** | At `/` with feature false and no V2 query, preset/latitude/longitude/duration heights are **40/36/36/40px**, matching rebuilt `a2735e8^` baseline. Reset/mode buttons are **30/26px**. All 18 enumerated root custom-property values match; `--bg` and `--shadow-lg` remain absent. Nine sampled computed CSS properties on each header button also match when both are in mock mode. |
| F06 preservation — V2 sheet targets | **FIXED** | Independent real-mode open-sheet preset/latitude/longitude/duration heights remain **44/44/44/44px**. Supplied browser suite checks 30 visible sheet controls and finds zero below 44px. |
| R2-N02 — repeated quick answer | **FIXED** | Independently tested all five answers: 60/120/180 minutes and per-person/group budget. Each click produces exactly one HTTP **POST `/messages`** and an empty request input. The following plan click produces exactly one **POST `/tour`**, zero additional message POSTs, and the separate Maps-links GET. Supplied suite also verifies the completed-preferences path to a rendered tour. |

No additional regression was established by the probes below. The routing finding is unresolved behavior in the reviewed evidence strip, rather than a claim that this commit introduced the routing logic.

## R2-N01 remaining — HIGH — route total overrides explicit contrary legs

Location: `frontend/app/components/v2/EvidenceStrip.jsx:37`–`:46`, with verification header derived at `:76`–`:81` and expanded routing copy at `:196`.

`routeUnknown` considers aggregate unknowns and total source only. `hasProviderRoute` then accepts an OR of provider total, provider `legs`, or provider sources on `stops.slice(1)`. An affirmative source can therefore override contrary sources; the fallback also omits the origin-to-first-stop leg. Frozen `StopView` includes `leg_from_previous` for every stop.

Minimal relevant synthetic payload fields (use otherwise ordinary synthetic stops):

```json
{
  "status": "verified_feasible",
  "unknowns": [],
  "totals": {"leg_source": "provider_route"},
  "stops": [
    {
      "hours": {"status": "verified", "open_at_arrival": true},
      "price": {"min_vnd": 40000, "max_vnd": 40000, "semantics": "per_person", "evidence": "verified"},
      "leg_from_previous": {"source": "provider_route"}
    },
    {
      "hours": {"status": "verified", "open_at_arrival": true},
      "price": {"min_vnd": 40000, "max_vnd": 40000, "semantics": "per_person", "evidence": "verified"},
      "leg_from_previous": {"source": "straight_line_estimate"}
    }
  ]
}
```

Production-browser reproduction: return the above evidence fields in `/tour`, click plan, then expand the evidence strip. Actual header:

> Bằng chứng đầy đủ: tuyến đường thực tế · giờ mở cửa xác thực

Expanded routing text claims route and actual walking time were computed by a digital map service. Changing the second source to `unknown` produces the same green header and provider claim. With total source omitted and first stop source `unknown`, remaining provider stops also produce the provider claim in independent rendering.

These are adversarial consistency tests, not evidence that the deterministic backend emits these disagreements. They directly exercise this task's requirement that conflicting combinations remain conservative. Unknown or estimate evidence must not become verified merely because another field says provider.

Independent matrices:

- **768 hour/price combinations, zero predicate failures**: four hour statuses (including missing), four arrival states, four price evidence states, three price semantics states, and four aggregate unknown combinations. Assertions inspect expanded verified copy independently for hours and price.
- **128 routing combinations using total and stop fields, 14 unsafe claims**: four total sources × four first-stop sources × four second-stop sources × aggregate route unknown present/absent. Each source set includes provider, estimate, unknown, and missing. Unsafe means provider copy despite at least one explicit estimate/unknown source or aggregate route unknown. Missing-only cases are not counted unsafe by this predicate, so this is not a complete missing-evidence metric.
- **512 expanded routing combinations, 78 unsafe claims** when additionally exercising the component's optional `tour.legs` fallback. `tour.legs` is not the frozen TourView route source; the 128-case result and browser reproduction above do not depend on it.

Required correction: reconcile canonical total and every stop-leg source conservatively, including the origin leg. Any explicit unknown/estimate disagreement must prevent provider/full-evidence claims. Add assertions for contradictory total-versus-stop sources, mixed stop sources, and the first-leg fallback. The current six evidence component cases and browser adversarial-hours case do not cover these routing disagreements.

## Regression probes and limits

- **Clarification:** actual HTTP question and note remain visible; all five quick-answer buttons retain their labels and send once. Browser request counting is independent of the new `window.__MESSAGE_CALL_COUNT` instrumentation.
- **Reset/stale tour:** delayed `/tour` by 700ms, invoked the existing reset callback at 100ms, then waited for completion. Zero stale stop cards; plan enabled. Reset is disabled while busy, so this deliberately forced callback race is not represented as a normal click path.
- **Stale geolocation:** retained a prior geolocation callback, reset, reopened preferences, and delivered synthetic coordinates `(19,103)`. New fields stayed at defaults `(21.033,105.85)`.
- **Accessibility:** real Tab navigation reaches the request input with `:focus-visible=true` and solid 2px outline. Last enabled sheet control wraps to the close button on Tab. Escape closes and restores the explicitly focused invoker. Reduced-motion transition duration is `1e-06s`. No screen-reader session or contrast audit performed.
- **Bundle/isolation:** both current mock and real production builds report `/` **34.7 kB**, first-load JS **137 kB**, shared JS **103 kB**. Controlled baseline reports **30 kB / 133 kB**; previous re-review reported **32.7 kB / 135 kB**. Current integration also contains Maps URL changes, so these deltas are not attributed solely to `0b4ac0c`. Flag-off resource list contains the page/shared chunks and omits V2 dynamic chunks. `/ui-kit` returns **404** with default configuration.
- Baseline restored `app/page.js`, `app/globals.css`, `app/layout.js`, and `lib/api.js` from `a2735e8^` in a scratch copy, retaining current Next 15.5.28/dependencies. It is a controlled legacy presentation comparison, not a full historical dependency build. For the detailed header comparison, switched the current real build to mock mode so label width, colors, and behavior state matched baseline.
- No live Maps/Routes/Places, hardware geolocation, DB, provider failure integration, network-throttled chunk download, or latency benchmark was validated here. Prior separate Maps URL security findings are outside this review's correction scope and are not cleared by this report.

Reviewer for report disposition/integration: Claude coordinator. Request author correction of the remaining routing-evidence predicate and another independent check before closing R2-N01.

