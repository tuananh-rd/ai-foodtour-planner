# C6-final-2 independent gate

Reviewer: Codex. Coordinator/reviewer: Claude. Merged `foodtour-claude-coordinator` by fast-forward `6544582..7107374`, including frontend C6g `e49007a` and audit redaction `36627d7`. No frontend or backend production source edited. Synthetic local data only; no public deployment, private CSV read, paid provider activation, or history rewrite.

Decision: **REQUEST CHANGES**. Original production-card containment, common budget/vehicle inputs, replacement action encoding and fallback-test sensitivity have improved. The original eight-block hostile boundary still overflows, and adjacent budget/vehicle inputs silently change user meaning or reach the API as 422. The historical audit exposure is a documented residual, not a request to rewrite history.

## Full gate evidence

All repository suites ran **serially**, with each preceding process completed before starting the next. Browser services use **13100 web / 18100 API / 19300 CDP**, production scratch builds and real Chrome. The chat wrapper excludes `.env` from scratch copies, uses mock LLM/template explanations and temporary SQLite, bounds CDP calls, and preserves the author assertions. Fault injection is explicitly identified below; it is not live-provider validation.

| Check | Independent result |
|---|---|
| `PYTHONPATH=<repo>/backend .venv/Scripts/python.exe -m unittest discover -s backend/tests` | 424 tests in 45.006s; OK, one expected private-CSV skip |
| `.venv/Scripts/python.exe tools/export_openapi.py --check` | Server schema matches frozen OpenAPI |
| `node qa/e2e/test_components.mjs` | 48/48, exit 0 |
| `node frontend/lib/contractTest.js` | 18/18, exit 0 |
| `node qa/chat/c6_final_runner.mjs clean` | Real-API chat author assertions 23/23, exit 0 |
| `node qa/chat/c6_final_regressions.mjs` | Serial UI V2 28/28, UI kit 11/11, Maps CDP 61/61; each exit 0 |
| `.venv/Scripts/python.exe qa/chat/run_scenarios.py --report <temp>/c6-final2-scenarios.json` | 26/26 CH+ADV scenarios pass through FastAPI HTTP handlers using TestClient; off/stub understanding as specified in corpus |
| `.venv/Scripts/python.exe qa/chat/c6_final2_security.py` | Session A token on B: 403; captured log records 1, synthetic chat marker occurrences 0, session token occurrences 0; flag off: chat 404 and feature false |
| `node qa/chat/c6_final_runner.mjs flagoff` | Actual unset backend chat flag, production frontend chat flag off; `/` legacy and `/?ui=v2` at 1280 and 390; 5/5, exit 0 |
| `node qa/chat/c6_final2_harness.mjs` | Busy-port preservation probe passes, exit 0; nested author harness refuses as intended with exit 1 |
| `node qa/chat/c6_final2_runner.mjs final2` | Final independent boundary run: **9/21**, exit 1; seven budget cases, two silent vehicle mappings, one missing alias and two hostile viewport checks fail, as detailed below |

Actual author-suite denominator is **23**, rather than the 26 claimed in the C6g report. All original author assertions passed; this report uses observed counts.

Durable synthetic evidence: [condensed API payloads, state and width measurements](../../qa/reports/c6-final2/results.json), [hostile desktop](../../qa/screenshots/c6-final2/hostile-eight-blocks-1280.png), [hostile mobile](../../qa/screenshots/c6-final2/hostile-eight-blocks-390.png), [populated desktop itinerary](../../qa/screenshots/c6-final2/itinerary-1280.png), [populated mobile itinerary](../../qa/screenshots/c6-final2/itinerary-390.png).

## Original six findings

1. Budget scope: **original cases fixed**. Independent real-browser edits and GET state confirm `250k mỗi người` → 250000 `per_person`, `600k cả nhóm` → 600000 `group`, both POST 200. Amount-only `600k` leaves an inline scope error, sends zero requests and preserves 600000 group state. Adjacent inputs remain defective, as detailed below.
2. Vehicle: **original cases fixed, unknown-input validation incomplete**. Independent browser edits → real API and GET state confirm `đi bộ` → `walk`, `xe máy` → `motorbike`, `ô tô` → `car`, `taxi` → `taxi`, all 200. `tàu bay` and `xe đạp` show an inline error with zero requests. Other unsupported text silently maps to supported modes, below.
3. Replacement: **fixed**. Real browser button emits `text:"đổi quán thứ 2", action:null`. Author run changed `[SYNTHETIC] Phở Thử 52` to `[SYNTHETIC] Bún Thử 50`, preserving `[SYNTHETIC] Cà Phê Thử 62`. Independent `node qa/chat/c6_final2_runner.mjs verify2` checks GET state: typed ordinal replacement `[CHT-062,CHT-050]` → `[CHT-062,CHT-061]`; then actual second-stop button → `[CHT-062,CHT-050]`, POST 200 at revision 18. Stop one remains fixed. Both viewport sizes show one evidence strip, two stop cards and one Maps link. That run subsequently fails the separate English-disclosure assertion below; it is not an unqualified passing suite.
4. Hostile strings: **partially fixed**. Author real-response injection changes five synthetic venue names and addresses to 5k hostile strings. Production Explore scroll/client widths are **570/570** at 1280 and **390/390** at 390; document widths 1265/390 remain bounded, XSS false, injected image and javascript-anchor counts zero. The same original eight-block real-component scratch page still fails: `document.scrollWidth=46326` at requested 1280; requested 390 expands `innerWidth` to **1560**, with the same 46326 scrollWidth. Per-section measurements localize the failure to **`tour_ready`**; the other seven sections remain bounded at both widths. Eight blocks exist, XSS false, image count 0, javascript-anchor count 0. Fault injection includes 5k names/addresses and other labels; this is not a claim that the normal API returns such fields. Fix the composed itinerary boundary rather than relying on the narrower venue-card probe.
5. Mutation sensitivity: **all three gates now catch the required mutations**. Removing only `cell.value || 'Chưa rõ'` → `cell.value || ''` in scratch frontend source builds successfully, then author CH-03b fails: `noEmpty:false`, injected cell empty (other cells still contain `Chưa rõ`). Allergy mutation `{hasAllergyUnknown && (` → `{false && (` also builds and fails CH-06 with `cardsWarned:false`. Removing the layout/composer synchronous guards and busy propagation builds, then fails CH-08-DOUBLECLICK with `sentCalls:2`. Commands: `node qa/chat/c6_final_runner.mjs fallback`, then `allergy`, then `guard`; author assertions fail with exit 1, with no author-suite mutation override.
6. Audit provenance: **current tree row removed; historical exposure remains**. Counts-only `git grep -I -l -E` across tracked files finds zero Foody venue-URL reference files; structural inspection of current `docs/audit.json` finds zero venue records with adjacent URL, name and coordinates. The same structural check of `git show 08041a1:docs/audit.json` finds **one**. No row values are reproduced or copied into this report. Redaction addresses the current tree; historical removal was not authorized and was not attempted. Do not publish this history while the exposure remains unresolved.

## Counts-only data/security scan

Google-style keys 0; OpenAI-style keys 0; private-key headers 0; tracked secret `.env` files 0; tracked CSV files 0; tracked private-dataset filenames 0; CSV-row-header reference files 0; Foody venue-URL reference files 0; current audit venue rows 0; baseline `08041a1` audit venue rows 1. This finite scan does not establish absence of every possible secret or arbitrary private-derived value. Audit aggregates, source filename/hash metadata and schema labels remain; no private source CSV was read.

## Additional C6g boundary findings

Reproduce locally with `node qa/chat/c6_final2_runner.mjs final2`: real Chrome, production scratch build, normal Uvicorn API, synthetic session. Open the indicated profile chip, enter the exact value, save, inspect POST `/v1/sessions/{id}/chat`, then GET the session. These tests collect failures so all cases execute; a failing run is expected on this tree. Rejecting unsupported/ambiguous input inline is sufficient; the UI must not silently reinterpret it.

| Input | Actual request / persisted result | Finding |
|---|---|---|
| Budget `1.5 triệu cả nhóm` | `{budget_vnd:15000,budget_scope:"group"}`, 200, persisted 15000 | Amount changed by 100× |
| Budget `1,5 triệu mỗi người` | `{budget_vnd:15000,budget_scope:"per_person"}`, 200, persisted 15000 | Same decimal/unit loss |
| Budget `-250k mỗi người` | `{budget_vnd:250000,budget_scope:"per_person"}`, 200 | Negative amount silently becomes positive |
| Budget `600k cả nhóm 3 người` | `{budget_vnd:6003000,budget_scope:"per_person"}`, 200 | Party digits merged into amount and group scope flipped |
| Budget `250k mỗi người hoặc 600k cả nhóm` | `{budget_vnd:250600,budget_scope:"per_person"}`, 200 | Two alternative amounts/scopes silently merged |
| Budget `999999999999999999999999999999k mỗi người` | `{budget_vnd:1e+30,budget_scope:"per_person"}`, **422** | Client validation still permits rejected numeric representation |
| Budget 400 ASCII `9` characters followed by `k mỗi người` | `{budget_vnd:null,budget_scope:"per_person"}`, **422** | Infinity serializes to null; reject before sending |
| Vehicle `máy bay` | `{vehicle:"motorbike"}`, 200, persisted motorbike | Unsupported airplane silently mapped by `máy` substring |
| Vehicle `bộ đàm` | `{vehicle:"walk"}`, 200, persisted walk | Unsupported text silently mapped by `bộ` substring |

Budget parsing at `ProfileBar.jsx:21` strips all non-digits and gives any `người` substring precedence over group scope. Vehicle parsing at `ProfileBar.jsx:65` uses substring matching. Parse one unambiguous bounded amount/scope and explicit supported vehicle aliases; show an inline error otherwise. `xe hơi` currently gets an inline error, despite the C6g report claiming it maps to car; this is a report/alias discrepancy, not a silent API corruption case.

**English Maps text remains.** On the real populated desktop itinerary at 1280, server notes now render in Vietnamese, but `MapsLinksBlock.jsx:642` also renders a separate privacy disclosure with the English parenthetical beginning `Links contain the origin/venue coordinates or fallback addresses`. `verify2` reaches and fails this exact DOM assertion after 27 successful checks (the 23 author assertions plus ordinal replacement, two evidence-view checks and button identity replacement). Document width remains 1265; this is a localization residual, not a new width failure. The shared component contains the same literal for mobile; the initial failing assertion stops before the mobile localization check, so no independent mobile localization assertion is claimed from that run. The durable runner now collects both localization results on subsequent reproduction.

Busy-port protection **passes**: `node qa/chat/c6_final2_harness.mjs` creates an owned HTTP listener on 18100, then starts the author harness with all three assigned port overrides and without `FORCE_FREE_PORTS`. The harness refuses in **181 ms**, exits 1 with `already in use`, and the owned listener still responds 200; the probe closes it afterward and exits 0. No unrelated process is terminated.

Static harness concern, **not a reproduced blocker**: watchdog globals `globalBackendProc`, `globalFrontendProc` and `globalBrowserProc` are never assigned the local `run()` process handles. Shortened-timeout experiments did not establish a healthy surviving API after harness exit; they are inconclusive and excluded from the gate. No watchdog cleanup success is claimed.

Review-harness corrections are excluded from product findings: an initial extension read budget from the wrong response field, then used a stale inline-error selector; these were corrected before the final 21-check run. A separate fresh-tour setup did not produce a tour and its three dependent assertions were discarded; replacement was rechecked successfully on the populated author tour, with the real API identities recorded above. No frontend/backend product source was changed to obtain any result.

## Residual limitations

This gate does not establish public data reuse permission, live database/provider operation, actual walking routes or ETA, verified hours, per-person meal prices, or allergy safety. Valid synthetic tours remain conditional where required evidence is unknown. No new field-performance or cold-cache benchmark is claimed.
