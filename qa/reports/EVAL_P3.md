# EVAL-P3 — real Gemini runs, geo plausibility, phase-3 checks (2026-10-15)

Author: Claude (phase 3, self-evaluation — **not an independent review**). Aggregate results only; no venue names, addresses, URLs or ids are recorded here.

## Gemini (real API calls)

Setup: model `gemini-3.5-flash-lite` (listed as stable on the official models page on 2026-10-15), REST `models.generateContent`, `responseMimeType=application/json` + `responseSchema`, temperature 0, key from the server environment. Harness: `qa/eval/run_eval.py --extractor gemini --explain gemini` on the private snapshot ds-1 (1702 rows, sha256 prefix `936eb167cf00`), 7 scenarios per run (incl. unaccented input, an impossible budget and a prompt-injection message).

Six runs after the harness fix (interest comparison made diacritic-insensitive, matching the planner):

| Metric | Result |
|---|---|
| Extraction calls | 42 |
| Provider did not answer in time / errored | 3 (1 timeout at 20 s, 2 not reproducible in a follow-up 6/6 probe; the app falls back to rules and says so) |
| Extraction correct when the model answered | **39 / 39** |
| Prompt-injection scenario (mode/budget must not change) | correct in every answered run |
| Tours returned / invalid tours (`validate_tour`) | 22 / **0** |
| LLM explanations accepted by `check_explanation` | 18 / 22; the 4 rejections were all `spelled_number` (numbers written in words) → template text shown instead |
| Extraction latency p50 per run | 1.5 s – 10.5 s; max 20.2 s |

Earlier runs, kept for honesty: before the checker fix, 3 of 4 truthful explanations were wrongly rejected (`route_claim` false positive on the phrase listing unknowns) — fixed by renaming that unknown label and allowing adjacent negation for route/verified wording only. Before the privacy fix, explanation facts included venue names from ds-1; about 4 tours' names were sent to Gemini during these test runs. Facts now contain no venue identity (test `ExplanationPrivacy`).

Changes driven by these runs: one retry for transient 5xx only; explanation retry bounded by a total 12 s budget; prompt example for digit numbers; UI waiting hint during Gemini calls; explicit "(bộ luật cục bộ)" label when the fallback answers.

Not established: behaviour under sustained load or rate limits, cost per day, quality on free-form conversations beyond the 7 scenarios, user-perceived quality.

## Walking routing

Code for openrouteservice (`foot-walking` matrix + directions GeoJSON) and OSRM-compatible (`table` + `route` steps) is tested only against local fake servers (unit tests + `qa/live/routing_smoke.py` against a fake). **No real routing provider was called**: no key/endpoint has been configured for this project. Until then every tour is labelled `straight_line_estimate`.

## Geo plausibility (`qa/eval/geo_audit.py`, ds-1)

| Check | Count |
|---|---|
| Venues / physical (not online-only) | 1702 / 1614 |
| Outside a generous Hà Nội box | 0 |
| Venues sharing exact coordinates with another venue | 11 |
| Farther than 4 km from the median of their own district label (districts with ≥ 5 venues) | 29 of 1605 checked |

These are flags for review, not geoverification.

## Regression suite at the end of phase 3 (this machine)

- Backend: `scripts/run_unittests.py` 175 tests OK (1 documented legacy skip); OpenAPI drift OK.
- Frontend: production build OK, component checks 13/13. Note: during phase 3 several builds ran in the shared `frontend/` directory while the human's `next dev` was running there (both use `.next/`); the dev server still answered HTTP 200 afterwards. The final verification below builds in a scratch copy instead.
- Final run (frontend built in a scratch copy, served on 13000; API on 18000, synthetic data): API E2E 36/36; browser probe `qa/e2e/browser_flow.mjs` **18/18 with the rule extractor and 18/18 with real Gemini** (extraction + explanation, `REPLY_TIMEOUT_MS=60000`); component checks 13/13.
