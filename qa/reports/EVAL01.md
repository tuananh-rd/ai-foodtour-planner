# EVAL-01 — quality evaluation (U1 + U2), 2026-10-15

Harness: `qa/eval/run_eval.py` + `qa/eval/scenarios.json`. Output is aggregate only (no venue names, addresses or URLs).
Run: `PYTHONPATH=backend python qa/eval/run_eval.py [--data <abs csv/json>] [--json out.json]`

| Metric | Synthetic fixture (13 venues) | Private snapshot ds-1 (1702 rows, hash 936eb167cf00) |
|---|---|---|
| Extraction success (scenarios) | 7/7 | 7/7 |
| Tours returned | 4 | 4 |
| Invalid tours (validate_tour) | 0 | 0 |
| Validity gate | PASS | PASS |
| Plan latency p50 / p95 (ms) | 0.2 / 6.9 | 65.7 / 70.5 |
| Expected statuses (incl. impossible budget => no_solution, injection ignored) | all OK | all OK |
| Search pool truncated | no | yes for all four tours (disclosed in tour assumptions) |

Findings that drove changes: unaccented Vietnamese input ("muon an bun", "ho guom", "90 phut") was not parsed; "3 giờ 10k" lost the duration; "nhóm 3 người" could be read as per-person budget scope. Fixed in `backend/app/llm/extract.py` (diacritic-stripped slot parsing, minutes only when followed by phút, scope only from explicit phrases). Interest matching is now whole-word and diacritic-insensitive with relevance-first pool ranking (`backend/app/planner/relevance.py`).

Honest limits: only 7 scenarios; extraction is a rule-based mock, not an LLM; relevance is category-level because source tags are coarse (e.g. one tag covers ~490 venues); with 45-minute dwell, 90-minute requests yield 1 stop (disclosed); tour validity is checked, not "tour quality" as perceived by users (needs human evaluation).
