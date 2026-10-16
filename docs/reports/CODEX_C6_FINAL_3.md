# C6-final-3 independent re-verification

Reviewer: Codex; coordinator/reviewer: Claude. Merged `foodtour-claude-coordinator` first, fast-forward `959f610..9895396`, including C6i `eb26b55`. Changes are confined to QA and this report; no frontend/backend application source was edited.

Decision: **REQUEST CHANGES**. The original hostile eight-block containment and English Maps disclosure findings are fixed. Structured controls block the original malformed/ambiguous input classes before requests, but a tampered unit still silently defaults to thousands, and the advertised max-leg editor has no user-accessible trigger.

## Reproductions and independent browser evidence

Run `node qa/chat/c6_final3_runner.mjs final3` from the repository root. This wraps the unchanged author assertions with independent probes, uses actual Chrome, production scratch Next.js, Uvicorn and temporary SQLite on **13100 / 18100 / 19300**, and collects boundary failures instead of stopping at the first one. Mock LLM/template explanations and synthetic fixtures are explicit; this is not live-provider validation. No `.env` is copied into scratch builds. Exit 1 is expected on the reviewed tree.

1. **Unknown budget unit silently changes meaning.** Open the budget chip, set amount `600` and scope `group`; in DevTools change the first unit option value to `garbage`, select it and dispatch a bubbling `change`. Save. The captured request is `{"text":null,"action":{"type":"edit_profile","patch":{"budget_vnd":600000,"budget_scope":"group"}},"revision":18}`, HTTP **200**, without an alert. `ProfileBar.jsx` uses `parseInt(budgetUnit, 10) || 1000`; unsupported units must be rejected as unsupported vehicles already are. This is a DOM-tampering boundary case, not a value offered by the normal dropdown; normal wrong-unit multiplication beyond the ceiling is correctly rejected.
2. **Max-leg UI coverage unavailable.** Production ProfileBar renders chips for area, party, budget, time, vehicle, tastes and allergies. No chip calls `handleOpenEdit('max_leg_min', ...)`; its number input and 3..60 validation are dormant. Therefore requested production UI attempts `2` and `61` cannot be performed. Add a reachable control if this editor is intended as delivered functionality; do not claim its UI acceptance from source inspection alone.

Boundary results: **37/39** independent checks pass; the two failures above are distinct from the **29/29** passing author assertions in the same run (**66/68** combined). Native HTML constraint validation can block Save before the React handler runs; those cases have an invalid native control and zero requests rather than a custom inline alert.

| Profile probe | Observed result |
|---|---|
| 250 thousand/person; 600 thousand/group; maximum 100 million/group | Exact integer/scope payload, HTTP 200 |
| Decimal `1.5` million; comma `1,5`; negative `-250`; zero | Blocked; zero requests, no 422 |
| Original `600k cả nhóm 3 người` and alternative amount/scope text | Number input becomes empty; Vietnamese alert; zero requests |
| 30-digit and 400-digit numbers; 100000001 VND | Blocked; zero requests, no 422 |
| 600000 with million unit; missing scope | Vietnamese error; zero requests |
| Four supported vehicles | Exact `walk`, `motorbike`, `car`, `taxi` payloads, HTTP 200 |
| Option values tampered to `máy bay`, `bộ đàm`, `tàu bay`, `xe đạp`, `xe hơi` | Explicit Vietnamese validation; zero requests |
| Party 0, 21, -1 / party 1, 20 | Invalid values blocked; valid values sent exactly, HTTP 200 |
| Time 00:00, 23:59 / 24:00, 12:60, empty, 18:30:59 | Valid HH:MM sent exactly; invalid and seconds values blocked |
| Dialog keyboard | Initial focus on amount; Tab from Save wraps to amount; Shift+Tab wraps back; Escape closes and returns focus to budget chip |

Original scratch **eight-block** hostile boundary (not merely production venue cards): all eight sections pass at both widths, each section scroll/client **1265/1265** at 1280 and **390/390** at 390. This includes `tour_ready`; document scroll widths are 1265 and 390, XSS false, injected images and javascript anchors zero. The runner deliberately substitutes the previous independent hostile fixture in scratch so the original failing boundary is exercised again.

Populated production itinerary: scroll/client **553/553** desktop and **358/358** mobile; document widths **1265** and **390**. Full `innerText` is retained in the evidence and reviewed: Maps labels, notes, privacy and schedule disclosures are Vietnamese at both widths; `Google Maps` remains the proper product name and synthetic venue labels remain explicitly labeled. Focused known-English phrase assertions also pass. Core production shell checks pass at both widths (five measured blocks).

Evidence: [payloads, controls, full DOM text](../../qa/reports/c6-final3/boundaries.json), [all assertions](../../qa/reports/c6-final3/results.json), [26 scenario results](../../qa/reports/c6-final3/scenarios.json), [desktop hostile](../../qa/screenshots/c6-final3/14_hostile_eight_blocks_1280.png), [mobile hostile](../../qa/screenshots/c6-final3/14_hostile_eight_blocks_390.png), [desktop Maps](../../qa/screenshots/c6-final3/final3-maps-1280.png), [mobile Maps](../../qa/screenshots/c6-final3/final3-maps-390.png).

## Whole gate

All test processes are serial, with no overlapping browser harnesses. Browser scratch mutations change only scratch sources and do not weaken author assertions.

| Command/check | Result |
|---|---|
| `PYTHONPATH=<repo>/backend .venv/Scripts/python.exe -m unittest discover -s backend/tests` | 424 tests, 46.229s; OK; one expected private-CSV skip |
| `.venv/Scripts/python.exe tools/export_openapi.py --check` | OpenAPI matches server schema |
| `node qa/e2e/test_components.mjs` | 48/48 |
| `node frontend/lib/contractTest.js` | 18/18 |
| Author real-API chat suite embedded in `node qa/chat/c6_final3_runner.mjs final3` | 29/29; independent extension separately 37/39 |
| `node qa/chat/c6_final_regressions.mjs` | UI V2 28/28; UI kit 11/11; Maps CDP 61/61; all exit 0 |
| `.venv/Scripts/python.exe qa/chat/run_scenarios.py --report qa/reports/c6-final3/scenarios.json` | 26/26 CH+ADV; HTTP handlers through TestClient, off/stub understanding per corpus; exit 0 |
| `.venv/Scripts/python.exe qa/chat/c6_final2_security.py` | Cross-session token 403; log records 1, chat-marker 0, token 0; flag off chat 404, feature false; exit 0 |
| Scratch mutations: `node qa/chat/c6_final_runner.mjs allergy/fallback/guard/budget` (separate serial invocations) | All four build successfully and fail the intended assertion, exit 1: CH-06 `cardsWarned:false`; CH-03b `noEmpty:false`, empty injected cell; CH-08-DOUBLECLICK `sentCalls:2`; CH-13a missing scope `noReqSent:false`, no valid request |
| `node qa/chat/c6_final_runner.mjs hostile` | 2/2, exit 0; two real-response synthetic venue labels/addresses replaced with hostile strings; desktop explore scroll/client 570/570, mobile 390/390; XSS/images/javascript anchors zero |
| `node qa/chat/c6_final_runner.mjs flagoff` | 5/5, exit 0; backend flag actually unset, chat 404/feature false; legacy `/` and `/?ui=v2` reachable at 1280 and 390 |
| `node qa/chat/c6_final2_harness.mjs` | Busy-port refusal in 241ms, nested harness exit 1 as intended; owned 18100 listener survives with HTTP 200; probe exit 0 |

Durable [mutation and flag assertion evidence](../../qa/reports/c6-final3/mutations-and-flags.json) records the exact failures and denominators. All required tests have completed; no pending checks are represented as passes. Max-leg UI validation remains explicitly untested because its editor is unreachable.

Counts-only tracked-tree scan: Google-style keys **0**, OpenAI-style keys **0**, private-key headers **0**, tracked secret env files **0**, tracked CSV **0**, private-dataset filenames **0**, CSV-row-header reference files **0**, Foody venue-URL reference files **0**, current audit venue rows **0**. Historical `08041a1:docs/audit.json` still contains **1** adjacent venue record; no values are reproduced and no history rewrite was authorized. This finite scan does not prove the absence of all possible secrets or private-derived values.

No private source CSV was read or published, no services deployed and no paid providers activated. DB/provider live operation, verified walking routes/ETA, hours, meal prices and allergy safety remain unvalidated; synthetic tours remain conditional when evidence is missing.
