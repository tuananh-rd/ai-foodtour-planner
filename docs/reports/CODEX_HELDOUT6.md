# Codex C6e blind heldout6 — 2026-10-16

**Gate: FAIL; FINAL engine verdict: REQUEST CHANGES.** Merged coordinator branch first at `4ed28cb`; frozen corpus commit `4cd4bb9` precedes target evaluation and reading understanding rules/diffs since `5bac78a`. No target utterance was evaluated during authoring; no label, permission, setup or denominator was changed after evaluation. Claude is the independent reviewer for this Codex evidence.

135 clearly synthetic rows cover short fragments, result-dependent choices, pending location/budget-scope answers, corrections, mixed requests, numbers/times, bare dish names and locations. Exactly 25 explicit no-change rows comprise UNKNOWN (10), AMBIGUOUS_ACK (5), ASK_DETAIL (5), COMPARE (5). Every row has public setup actions and frozen full pending/results context; each evaluation creates a fresh API session with providers disabled. Fold-duplicate checking against utterances.jsonl and heldout1–5, and within heldout6, found zero duplicates. Public setup actions alone were executed before freeze.

Accuracy: **101/135 = 74.81%**. Safe accuracy: **109/135 = 80.74%**. Dangerous count: **2/135**, all forbidden audience assignments; no forbidden add/remove/lock/tour/allergy effects found. Setup/invariant failures: **0**. Acceptance requires dangerous=0 AND (accuracy>=85% OR safe accuracy>=92%); all thresholds fail.

Safe accuracy retains the prior definition: exact intent match OR a no-change label with no protected effect. Correct intent can still have a dangerous side effect; zero-danger remains a separate mandatory gate. Effects compare shortlist membership/locks, tour excluding turn revision, allergies, profile values/scope, and nonmirrored preferences (exclusions, interests, meal, weekday, mode, max_stops). Dialog pending/results/phase and revision/history stamps are bookkeeping. Frozen allowed_effects restrict mutations to the specifically authorized fields; no non-confirmation row may generate a tour. Existing tour invalidation is distinct from unauthorized tour generation. Non-200 snapshots are not treated as state deletion; the API runner checks persisted rollback separately.

| Expected | Actual: count |
|---|---|
| ADD | ADD: 7, ASK_DETAIL: 1, UNKNOWN: 2 |
| AMBIGUOUS_ACK | AMBIGUOUS_ACK: 2, CONFIRM_NO: 1, UNKNOWN: 2 |
| ANSWER_PENDING | ANSWER_PENDING: 13, UNKNOWN: 2 |
| ASK_DETAIL | ASK_DETAIL: 5 |
| COMPARE | ASK_DETAIL: 1, COMPARE: 4 |
| CONFIRM_YES | CONFIRM_YES: 5 |
| KEEP | KEEP: 3, SEARCH_VENUES: 1, UNKNOWN: 1 |
| MODIFY_PLAN | MODIFY_PLAN: 4, UNKNOWN: 1 |
| REMOVE | REMOVE: 3, SEARCH_VENUES: 1, SET_AVOID: 1 |
| REQUEST_PLAN | REQUEST_PLAN: 5 |
| SEARCH_VENUES | ADD: 1, SEARCH_VENUES: 8, UNKNOWN: 1 |
| SET_ALLERGY | SET_ALLERGY: 5 |
| SET_AVOID | SET_AVOID: 5 |
| UNKNOWN | AMBIGUOUS_ACK: 1, ASK_DETAIL: 1, COMPARE: 1, SEARCH_VENUES: 1, UNKNOWN: 6 |
| UPDATE_PROFILE | AMBIGUOUS_ACK: 1, DISCOVER_DISH: 1, KEEP: 3, REQUEST_PLAN: 1, SEARCH_VENUES: 2, UNKNOWN: 6, UPDATE_PROFILE: 26 |

Corpus SHA256: `8ea20294564ecf23e77e2dea93aee319bd725e98805daed07d30c73d83bdb1f4`.

Reproduce using PYTHONPATH=backend, PYTHONUTF8=1 and `.venv/Scripts/python.exe`: `qa/chat/eval_heldout.py --corpus qa/chat/heldout6.jsonl --report <local TEMP>/C6E_HELDOUT6.json` (exit 1), then `qa/chat/review_c6e_engine.py` after the original engine/scenario probes. Aggregate evidence: C6E_HELDOUT6_AGGREGATE.json. Row predictions and audit output remain in local TEMP; this report intentionally contains no row-level failure details. Required exact dangerous reproductions appear only in the FINAL engine addendum. Heldout1–6 are now consumed data; no further blind claim is made for them. Offline rules-only results do not measure live LLM quality, DB/provider behavior or frontend/mobile acceptance.
