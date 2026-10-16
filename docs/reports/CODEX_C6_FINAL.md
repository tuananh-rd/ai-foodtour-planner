# C6 final independent gate

Decision: **REQUEST CHANGES**. Reviewed merged coordinator commit `124eb53` (including C6a `5ad5cbd`). Reviewer: Codex; coordinator/reviewer of this evidence: Claude. Local synthetic prototype only; no deployment or live provider validation.

## Blocking findings

1. **Profile group-budget save still returns 422.** Open the budget chip, enter `600k cả nhóm`, save. `ProfileBar.jsx` emits `edit_profile.patch={budget_vnd:600000,budget_scope:"total"}`; `ChatPatch` accepts only `per_person` or `group`. Real Chrome → real API capture at revision 16 returns 422; server budget remains 250000 per-person. Exact-payload TestClient replay also returns 422. The original `250k mỗi người` case has been corrected, but group semantics remain broken.
2. **Walking profile save returns 422.** Open the vehicle chip, enter `đi bộ`, save. The component emits `vehicle:"walking"`; the real API accepts `walk`, `motorbike`, `car`, `taxi`. Real browser capture at revision 16 and independent exact-payload replay both return 422. Unknown vehicle text also silently maps to walking.
3. **Itinerary replacement button emits an unsupported action.** After the populated two-stop Cầu Giấy tour, click `Đổi quán`. Real browser capture: `{text:null,action:{type:"replace_stop",venue_id:"CHT-062",order:1,text:"đổi quán thứ 1"},revision:13}` → 422. `Action.type` has no `replace_stop`, and `order`/`text` are forbidden action keys. Exact-payload replay also returns 422. Natural-language ordinal replacement is a separate engine route and does not repair this button.
4. **Hostile server labels are only partially contained.** The same eight-block real-source probe used in C3, with 5,000-character names/addresses/other labels, produces `document.scrollWidth=63673` at desktop 1280. Under requested 390×844 mobile emulation the layout viewport expands to 1560 while scrollWidth remains 63673. XSS executed: false; images injected: 0; javascript anchors: 0. The actual production shell also fails when both synthetic card names and addresses are enlarged: its outer document stays bounded (1265/390), but the Explore column scrollWidth is **48913** versus clientWidth 570/390. A second **name-only** probe passes at both widths (Explore 570/570 and 390/390): the new card-name wrapping works, while address/other-label containment remains incomplete. These are explicit response fault injections, not claims that the unmodified API emits 5k fields.
5. **Required fallback mutation gate still survives.** The scratch source line is demonstrably `const displayVal = cell.value || '';` after removing only the `Chưa rõ` fallback. The production build succeeds and the full real-API author suite passes **18/18, exit 0**. CH-03b still reports `chuaRo:true`; the real backend already supplies unknown-value labels elsewhere, so this is insufficient evidence that a null cell gets the client fallback. A focused null-cell renderer or response fixture is needed. This is a test-gate defect, distinct from an observed ordinary API rendering error.
6. **One tracked venue-row candidate needs provenance review/quarantine.** The expanded counts-only Git scan finds one documentation JSON file with one Foody venue URL, an adjacent name and coordinates, no synthetic name/marker, and one CSV path reference. This is an unlabeled private-derived-row **candidate**, not a proven private CSV match: that CSV was never read. Shared rules prohibit raw/derived venue datasets in Git. Establish that this row is explicitly synthetic/authorized or quarantine its values before accepting data hygiene; existing Git history also needs consideration. This review does not reproduce the row, edit the existing artifact, or rewrite history. Exact discovery/classification is reproducible with `qa/chat/c6_final_security.py`; outputs are counts only.

Production frontend/backend files were not edited. All implementation corrections belong to their owners.

## Commands and independent evidence

| Check | Result |
|---|---|
| `git merge foodtour-claude-coordinator` | Fast-forward `91c7883..124eb53` |
| `.venv/Scripts/python.exe -m unittest discover -s backend/tests` with `PYTHONPATH=<repo>/backend` | 424 tests, 53.806s, OK, skipped=1 |
| Same command before setting PYTHONPATH | 276 discovered, 17 import errors; corrected environment above |
| `.venv/Scripts/python.exe tools/export_openapi.py --check` | OpenAPI matches server schema |
| `node qa/e2e/test_components.mjs` | 47/47 PASS |
| `node frontend/lib/contractTest.js` | 18/18 PASS |
| `python -m unittest backend.tests.api.test_chat backend.tests.api.test_security` | 33 tests, 6.485s, OK |
| `python qa/chat/c6_final_security.py` | Exact UI source payload probes and security counts below |
| `node qa/chat/c6_final_runner.mjs extended` | 80/85 checks; five expected review failures: three 422 interactions plus two hostile-width checks |
| `node qa/chat/c6_final_runner.mjs verify` | 21/21, exit 0; normal `uvicorn app.main:app`, real mock-LLM API, no injected understander |
| `node qa/chat/c6_final_regressions.mjs` | UI kit 11/11; Maps links 61/61; raw UI V2 stops on focus precondition, details below |
| `node qa/chat/c6_final_ui_probe.mjs` | All assertions collected: 27/28, exit 1; no focus ring even after 150 ms |
| `node qa/chat/c6_final_ui_probe.mjs --focus` | Same assertions with explicit CDP focus emulation: 28/28, exit 0 |
| `node qa/chat/c6_final_runner.mjs hostile` | Name+address fault injection: 0/2 containment checks, exit 1; zero XSS |
| `node qa/chat/c6_final_runner.mjs hostile-name` | Name-only fault injection: 2/2, exit 0; zero XSS |
| `node qa/chat/c6_final_runner.mjs flagoff` | 5/5, exit 0; unset chat flag, `/chat` 404, feature false, both web routes at both sizes |

Security probes: token from session A on B `/chat` returns 403; 1,001-character input 422; injected top-level `chat.phase` 422; SQL-like text is accepted as text (200), subsequent GET still 200. Captured access-log record count 1, probe-text occurrence count 0, session-token occurrence count 0. Existing focused tests independently rerun rate limits, payload limit, ownership, strict types, persistence corruption, and log redaction. With `FOODTOUR_CHAT_V2` removed, `/chat` returns 404 and `features.chat_v2` is false.

The original four C3 profile payload cases now pass exact real API replays: party integer 3 → 200; per-person budget 250000 → 200; `dị ứng cua` → 200 and allergy recorded; `tôi muốn ăn ít cay` → 200 and `tastes=["it cay"]`. This corrects the original string/schema issue, while the separate group-budget and walking editor defects above still block acceptance.

Tracked tree scan uses `git ls-files` and `git grep -I -l -E`, reporting counts only: Google-style key 0; OpenAI-style key 0; private-key header 0; tracked secret `.env` files 0; CSV files 0; private dataset filenames 0; CSV-row-header references 0; Foody venue URL reference files **1**; unlabeled venue-row candidates **1**; candidate-report CSV references **1**. The Foody hit is in documentation JSON; no row values are included here. This finite pattern scan is not proof of absence of every secret or arbitrary private row. No private CSV or `backend/.env` was read.

The one backend skip is explicitly `private CSV not configured via FOODTOUR_DATA_PATH`, as intended for this synthetic-only gate. No live private-data test is claimed.

## Browser evidence and earlier C3 findings

The first independent scratch run reached CH-01a PASS with desktop/mobile screenshots, then lost CDP. At the next checkpoint the coordinator delivered HOLD because its simultaneous author-suite run also owns/frees ports 13000/18000/19222; the independent retry was stopped and this interruption is not counted as product failure or acceptance success. GATE-OPEN then explicitly assigned scratch ports **13100 web / 18100 API / 19300 CDP**, overriding the original task ports. All subsequent browser suites run serially. Scratch backend excludes `.env`, uses only absolute synthetic fixture path, mock LLM, temporary SQLite; frontend uses a production scratch build. Coordinator C6a results are not substituted for independent execution.

`node qa/chat/c6_final_runner.mjs extended` independently passes all **18 author assertions**, with populated itinerary (2 stops), one Google Maps link and **zero google.* network requests** before clicking external links. It then captures the three browser/API failures above. Original party/per-person/allergy/taste editors now return 200. Explicit null is tested by a public `PUT /preferences` clearing the persisted tour, followed by a real stale-revision UI request and refresh: old tour blocks clear to zero. A separate real concurrent edit advances the server to revision 21: the UI sends revision 20 → 409, refetches, retries revision 21 → 200. Dialog Tab focus remains trapped through seven real CDP Tab events, Escape closes it, and focus returns to its trigger at both 1280×800 and 390×844.

Forced exhausted/capped understanding uses scratch `create_app(chat_understander=Stub())` and a synthetic budget snapshot, with zero provider calls. Both corresponding Vietnamese UI messages and clarification buttons appear. A real browser time conflict (10:00–11:45, walking, two phở stops) offers relax-leg/vehicle/time/drop options; choosing motorbike returns a fresh confirmation without a tour, and explicit confirmation produces 2 stops.

Harness corrections are isolated to the review wrapper: normalize CRLF before injection, bound CDP responses, and wait on actual `aria-busy` rather than disabled Send (which remains disabled for empty input and made each completed turn wait 15 seconds). An initial fake budget omitted required `resets_at` and was corrected before counting a run; a first extension omitted its Google request counter under CRLF and was corrected. These harness failures are not attributed to the product.

The durable `qa/chat/c6_final_*` runners preserve exact probes and scratch-only semantic mutations; no `--mutation` override is passed to the author suite.

The browser corpus pass comprises **CH-01..CH-10 and CH-12 plus ADV-01..ADV-14 at both viewport sizes: 50/50 scenario runs**. CH-11 exhausted and capped paths use the explicit deterministic injection above. The browser corpus checks expected profile state, pending-question kind and tour presence/absence after actual UI submissions; action cases use their UI buttons or equivalent natural-language input, and ADV-13 deliberately replays a stale request from the browser to exercise 409. It does not replace the full engine corpus assertions already executed by the backend suite.

The normal-backend `verify` run also proves ordinal replacement: `[CHT-062,CHT-052]` → `[CHT-062,CHT-050]`, preserving the first stop. Both viewport sizes show exactly one evidence strip, two stop cards and one Maps link; evidence text discloses unknown hours, per-person prices and actual routes. Durable screenshots: [desktop](../../qa/screenshots/c6-final/itinerary-1280.png), [mobile](../../qa/screenshots/c6-final/itinerary-390.png). These are synthetic fixtures, not real venue or personal history.

The production-shell hostile test intercepts a real successful `/chat` response using CDP Fetch and changes only synthetic card names/addresses. Real requests and backend handling still execute, but the fault-injected response is explicitly outside normal API evidence. Screenshots: [desktop](../../qa/screenshots/c6-final/hostile-shell-1280.png), [mobile](../../qa/screenshots/c6-final/hostile-shell-390.png).

Raw `test_ui_v2.mjs` fails `TC-V2-05b` in this Chrome run (`outline:none`, width 3px, shadow none); collecting the remaining assertions yields 27/28. With `Emulation.setFocusEmulationEnabled({enabled:true})`, the same assertion sees `document.hasFocus=true`, `:focus=true`, solid 2px outline and a 3px shadow; all 28 assertions pass. This is an explicit browser-focus setup difference, not an unqualified claim that the raw suite is green or a demonstrated production CSS defect. No product CSS was changed. The passing flag-off regression checks exact legacy control heights 40/36/36/40, reset 30, mode 26 and no root `--bg`; it is a finite initial-layout check, not a fresh whole-page pixel comparison against historical commits.

An additional production build against the real backend with `FOODTOUR_CHAT_V2` actually **unset** passes 5/5: features false, authenticated `/chat` 404, `/` renders legacy and `/?ui=v2` renders UI V2 at 1280×800 and 390×844, with no chat shell. For this compatibility run the independent UI-V2 default is also off so the legacy route can be exercised; the query still activates UI V2. Early smoke attempts from `about:blank` hit expected CORS rejection, and with the UI-V2 default on `/` correctly rendered UI V2; those setup mistakes were corrected before counting this result.

| Original C3 item | Final status and reproduction |
|---|---|
| Original four profile editor 422s | FIXED: actual UI sends integer/typed budget or natural-language allergy/taste, all 200; group budget and walking remain separate failures above |
| 409 retry uses old revision | FIXED: real concurrent server edit, UI 20→409 then 21→200 |
| Duplicate submit | FIXED: Add, composer, confirm each one request; removing guards fails |
| Safety/concurrency test gates | NOT FIXED completely: allergy and guard fail; fallback survives |
| Dialog focus/Escape | FIXED: Tab trap, Escape and return-focus at both viewports |
| Hostile 5k fields | NOT FIXED for original combined-field probe / production card addresses; card names alone FIXED at both sizes; zero XSS verified |
| Explicit `tour=null` clearing | FIXED: real persisted null + UI refresh clears old blocks |
| Evidence props | FIXED: actual tour delegated into one evidence strip, matching unknowns at both sizes |
| Itinerary replace button | NOT FIXED: real click sends unsupported `replace_stop`, 422; typed ordinal works |

| Exact semantic mutation on scratch source | Author suite result |
|---|---|
| `{hasAllergyUnknown && (` → `{false && (` | Exit 1, CH-06 `cardsWarned:false` |
| `cell.value || 'Chưa rõ'` → `cell.value || ''` | **Exit 0, 18/18 PASS: gate failure** |
| Remove synchronous layout/composer guards and busy disable propagation | Exit 1, CH-08-DOUBLECLICK `sentCalls:3` |

All three counted mutations compile successfully. An earlier fallback attempt failed its encoding-corrupted anchor before building and is explicitly excluded from this table.

## Residual risks

Public reuse permission, live DB/provider operation, actual walking geometry, verified operating hours, meal prices and allergy safety remain unvalidated. Synthetic demonstrations cannot establish these facts. Acceptance must distinguish conditional tours from verified feasible tours.

C3's bundle/performance observations were not rebenchmarked: the client still statically imports synthetic fixture data, and the build reports the existing first-load shared chunks. No new cold-cache transfer or field-performance claim is made. Maps disclosures include some English server notes in the otherwise Vietnamese prototype. Neither is a substitute for fixing the six gate findings above.
