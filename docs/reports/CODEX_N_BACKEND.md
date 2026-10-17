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
- Targeted API metadata/legacy chat planning regressions: **27 OK**. Broad intermediate run caught three compatibility failures (extra legacy block and telemetry mishandling malformed test counters); both were fixed and targeted tests rerun. Final broad results are recorded on task closure.
- `tools/export_openapi.py --check`: **matches server schema**.
- Isolated real HTTP guided API suite, port 18267, mock LLM: **26/26 PASS**. No live Google/Gemini calls.

## Measurement and data limitations

Synthetic benchmark, Windows, Python 3.14.4, 20 logical CPUs, 100 warm samples per workload/concurrency plus separate cold sample:

| Workload | Concurrency | Errors / n | p50 ms | p95 ms | Cold ms |
|---|---|---|---|---|---|
| rules API in-process, includes new session setup | 1 | 0/100 | 18.877 | 26.163 | 118.044 |
| rules API in-process, includes new session setup | 5 | 0/100 | 99.381 | 119.931 | 118.044 |
| direct selected-pool planner + constraint check | 1 | 0/100 | 0.415 | 0.531 | 0.661 |
| direct selected-pool planner + constraint check | 5 | 0/100 | 0.426 | 0.643 | 0.661 |

This does not measure browser/network latency, whole-city optimisation, live provider SLO, or real-world tour feasibility. These workloads provide no evidence that cache/index changes are needed; P2 performance optimisation is deferred rather than adding speculative cache complexity.

Private local count-only audit: 36 input/loaded rows, 0 rejected, 2 online-only, 36 unknown hours, 1 unknown price; overlay verified hours/prices both 0. Ten anonymous district clusters have dine-in candidate counts 6/6/5/4/3/3/3/2/1/1. These counts do not prove walkability/operating status/ingredients or authorise public reuse. The audit source remains ignored/local; no raw or derived venue records, IDs, names or coordinates are copied here. No routing or ingredient verification is claimed. Strict certification is blocked on actual evidence, not implementation work that can manufacture it.

## Remaining review/gates

Antigravity independently checks backend integration after the backend commit. Codex reviews its frontend diff and performs final integrated module/contract/build/browser checks with fresh desktop/mobile screenshots. Live Gemini quality at scale, external route evidence, licensed/fresh field verification, real participant usability and DB backup/restore remain explicitly unverified unless separately tested. No secrets read/printed, paid API activation, scraping, push or deploy.
