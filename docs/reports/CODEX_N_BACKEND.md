# N-series backend implementation evidence

18/10/2026. User-approved Codex lead override, Claude resting. Base `348b594` (application baseline `228ea0e`). Frontend implementation/QA is assigned separately to Antigravity through Orca; no frontend edits here.

## Implemented

- Q03 / P1-01: Vietnamese written amounts (including hundreds/tens, millions plus thousands, half million), “cả hội”, “hàng ăn” stops, 90-minute “một tiếng rưỡi chiều nay”; corrected fractional million arithmetic. Synthetic regression matrix includes 20 duration variants, 16 budget/scope variants and stop/party variants.
- Coverage now observes written-number cues and cannot count an old session budget/party value as capturing a new unread constraint. Unparsed numeric cues are persisted privately as planning obligations and asked explicitly; confirm/legacy plan entry points share the obligation gate. Recognised edits resolve the obligation. Allergy gates remain higher priority.
- P1-02: guided no-solution avoids default motorcycle offers and repeated adjustment options. Bounded speculative checks use the same local estimator and constraints, require a complete checked result, preserve locked stops, and do not add provider calls. If no helpful supported adjustment exists, show an explicit end state and ask the user to review area/selection. No constraints are silently changed.
- P1-06: existing random request ID/access log receives allowlisted understanding, attempted vs validated provider counts, algorithm label, extraction/planning duration and checked planner status. No prompts, identities, coordinates, tokens or free-form exceptions enter those fields. Public API remains unchanged; OpenAPI drift passes.
- P1-03 / P1-07: `tools/evidence_gap.py` produces count-only evidence gaps; `tools/benchmark_upgrade.py` measures synthetic rules API and direct checked planning with 100 samples each at concurrency 1 and 5, cold sample separate and errors retained in denominator.

## Verification checkpoints

- Correct baseline command is `PYTHONPATH=backend .venv/Scripts/python.exe -X utf8 -m unittest discover -s backend/tests -q`: **559 tests OK, 1 documented skip**. The first invocation without PYTHONPATH had 18 import errors; that was a test invocation error, corrected without dependency changes.
- New language/obligation/no-solution suite: **9 tests OK**, with many table-driven variants; API telemetry privacy test: **1 OK**.
- Targeted API metadata/legacy chat planning regressions: **27 OK**. Broad intermediate run caught three compatibility failures (extra legacy block and telemetry mishandling malformed test counters); both were fixed and targeted tests rerun. Final backend run: **569 tests OK, 1 documented skip** (46.513 seconds).
- `tools/export_openapi.py --check`: **matches server schema**.
- Full CI backend runner `scripts/run_unittests.py`: **574 tests OK, 1 documented skip** (47.191 seconds), including the 5 synthetic legacy checks. Its old private-data skip was removed and repository root import path retained after chdir so legacy `backend.tests` imports work; the initial CI runner pass exposed this pre-existing import-path failure before correction.
- Isolated real HTTP guided API suite, port 18267, mock LLM: **26/26 PASS**. No live Google/Gemini calls.

## Measurement and data limitations

Synthetic benchmark, Windows, Python 3.14.4, 20 logical CPUs, 100 warm samples per workload/concurrency plus separate cold sample:

| Workload | Concurrency | Errors / n | p50 ms | p95 ms | Cold ms |
|---|---|---|---|---|---|
| rules API in-process, includes new session setup | 1 | 0/100 | 19.993 | 24.069 | 108.189 |
| rules API in-process, includes new session setup | 5 | 0/100 | 105.195 | 123.462 | 108.189 |
| direct selected-pool planner + constraint check | 1 | 0/100 | 0.425 | 0.612 | 0.662 |
| direct selected-pool planner + constraint check | 5 | 0/100 | 0.426 | 0.598 | 0.662 |

Benchmark rerun explicitly enables FOODTOUR_UI_GUIDED (correct flag); the final values above supersede the first baseline run. This does not measure browser/network latency, whole-city optimisation, live provider SLO, or real-world tour feasibility. These workloads provide no evidence that cache/index changes are needed; P2 performance optimisation is deferred rather than adding speculative cache complexity.

Private local count-only audit: 36 input/loaded rows, 0 rejected, 2 online-only, 36 unknown hours, 1 unknown price; overlay verified hours/prices both 0. Ten anonymous district clusters have dine-in candidate counts 6/6/5/4/3/3/3/2/1/1. These counts do not prove walkability/operating status/ingredients or authorise public reuse. The audit source remains ignored/local; no raw or derived venue records, IDs, names or coordinates are copied here. No routing or ingredient verification is claimed. Strict certification is blocked on actual evidence, not implementation work that can manufacture it.

Private-local API follow-up after `0c66d8a`, isolated in-memory sessions and all live providers off: original S02 reaches explicit confirmation then returns `notice + text`, no tour and no pending relaxation loop; original S04 reaches explicit confirmation and returns **3 conditional stops**, independently rechecked with `validate_tour` against the session's stored tour preferences/snapshot and local estimator, no violations. No private venue details are included in this evidence. This is an in-process API result, not browser completion or verified real routing. Initial ad hoc probe attempts had a PowerShell stdin Unicode issue and an incorrect session-store method name; those probes were corrected (UTF-8 stdin and `owned`) before recording these outcomes and are not product failures.

The running preview API was separately tested over real localhost HTTP at port 8020 using a new test-owned session: S04 → clarification/confirmation → 3 conditional stops; Maps links endpoint returns free HTTPS Google URLs without keys (structure checked, **0 Google URLs opened**); a stale revision returns real **409 revision_conflict**; replacing the middle stop returns **409 no_candidates**, and reload returns 200 with the original tour unchanged. This proves the negative replacement/revision distinction at the API boundary for that private-local case, not a successful private-data replacement or browser interaction. Synthetic browser QA must separately cover successful replacement with identity/order locks.

## Remaining review/gates

Final source verification: `scripts/run_unittests.py` **575 tests OK, 1 skip**, 47.887 seconds. The single skip is `LoadedGazetteer.test_configured_private_csv_aggregates_only` because the optional private CSV is absent; it is not a timezone skip. OpenAPI drift passes. Browser-found regression `687396b` additionally ensures profile quick chips/budget edits cannot resolve a pending ambiguous allergy (including the Vietnamese ngân/ngan alias collision); “cả chuyến” retains group semantics. Telemetry contract/dataset version and error-code privacy tests are included in the final suite. This final result supersedes the earlier574-test checkpoint, not the measured benchmark workload.

Bounded Gemini smoke: `qa/live/guided_gemini_smoke.py --max-calls 1 --only vo_cung,control_s0,control_covered`, synthetic sentences, existing configured credentials consumed by the provider without printing/inspecting values. The first daily cap of 1 was below the existing reserve of 3 and made **0 calls**; it is a reserve-gate check, not live validation. A cap of 4 with the same maximum-one-call run allowed **1 attempted call**, left reserve 3, reported 0 transport errors and 0 safety violations; both covered controls made 0 calls. The ambiguous allergy case remained `understanding=rules`, `allergy_term` unresolved and no plan. This does **not** establish validated LLM understanding or general Gemini quality. No further live calls were made; no billing/service was activated.

Antigravity independently checks backend integration after the backend commit. Codex reviews its frontend diff and performs final integrated module/contract/build/browser checks with fresh desktop/mobile screenshots. Live Gemini quality at scale, external route evidence, licensed/fresh field verification, real participant usability and DB backup/restore remain explicitly unverified unless separately tested. No secrets read/printed, paid API activation, scraping, push or deploy.
