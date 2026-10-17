# U5a independent guided-engine evaluation

Reviewer: Codex; author/reviewer of fixes: Claude. Synthetic fixtures only; zero live LLM calls.

## Blind freeze (recorded before evaluation or engine inspection)

Engine baseline: `23fc905` (merged `foodtour-claude-coordinator`). Corpus commit:
`305e2f1553a14035b00e2d9eebe0618ad36bd309`.

| Frozen file | Cases | SHA256 (working file bytes) |
| --- | ---: | --- |
| qa/chat/guided_blind_v1.jsonl | 190 | 48f30ebb3bccc5e230f247a2ab2a1a7d2f1e8c78a8bc903b0521842d8cbc68da |
| qa/chat/guided_blind_v2.jsonl | 152 | 998eeab138b5ef07a5f31df9ce7a4891562163d99e9cd06ae1d3bc304e609585 |

Both corpora and the application-independent generator were committed before opening
`backend/app/chat/*.py`. Only the two permitted usage tests were read. v1 contains
48 one-shot multi-clause requests, 32 dedicated allergy examples plus removal sequences,
24 duration/leg examples, 24 dedicated budget examples, 16 dedicated time examples,
16 dedicated stop examples, 16 dislike examples, and 12 slot-injection examples.
Categories overlap with the one-shot requests. v2 is held out and must not be run
until Claude fixes the v1 findings. No gold labels will be changed after first run;
any ambiguous-label caveats will be recorded separately.

## First run

Executed once on baseline `23fc905`, before fixes or engine inspection. Exact stdout summaries:

```json
{"mode": "rules", "cases": 190, "safety_pass": 180, "safety_pct": 94.737, "safety_failures": {"allergy_missing": 5, "allergy_cue_not_asked": 3, "allergy_false_positive": 3}, "all_slots_correct": 127, "all_slots_pct": 66.842, "slot_accuracy_pct": {"stops": 94.737, "day_part": 93.684, "budget_vnd": 96.842, "budget_scope": 100.0, "duration_min": 90.526, "max_leg_min": 90.526, "party_size": 98.421, "start_time_set": 100.0, "interests": 93.158, "allergies": 95.789, "allergy_question": 98.421}, "clarify_per_case": 0.7211, "llm_calls": 0, "overasking_count": 0}
{"mode": "failed_provider", "cases": 190, "safety_pass": 124, "safety_pct": 65.263, "safety_failures": {"exception": 63, "allergy_false_positive": 3, "allergy_cue_not_asked": 1}, "all_slots_correct": 103, "all_slots_pct": 54.211, "slot_accuracy_pct": {"stops": 63.684, "day_part": 65.789, "budget_vnd": 66.842, "budget_scope": 66.842, "duration_min": 63.684, "max_leg_min": 63.684, "party_size": 66.842, "start_time_set": 66.842, "interests": 60.0, "allergies": 65.263, "allergy_question": 66.316}, "clarify_per_case": 0.4579, "llm_calls": 0, "overasking_count": 0}
```

Full per-message failures: `qa/chat/u5a_first_run.json`. These first-run results are immutable. The literal-None fake provider pass is separate from the rules pass; its exceptions will be investigated against the callable boundary rather than hidden.
