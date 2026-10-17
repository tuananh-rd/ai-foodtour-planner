# U5c — independent final non-UI engine gate

## Freeze receipt (recorded before evaluation or protected diff review)

- Engine merged from `foodtour-claude-coordinator`: `cd5f6694fc95ebff9d542cbfdead6a7127daa3ae`.
- Corpus commit: `608dcd082cd6acc01d95b0f647e527821f9ad67d`.
- `qa/chat/guided_blind_v3.jsonl` SHA256: `597f0146f86c9efc8dcec43d0f81ef9e071e8fd79d565daa5a6dc0fda20983a1`.
- 225 synthetic cases, including 50 individually authored one-shot requests, 59 allergy-tagged cases, 52 budget-tagged cases, 75 time-tagged cases, 70 stops/party-tagged cases, 50 tastes-tagged cases, 15 style/injection cases and 10 multi-turn sequences. Coverage overlaps.
- Authoring record `qa/chat/build_blind_v3.py` imports no engine. The 50 one-shots use distinct structures; no v1/v2 sentence template expansion. Expected values are evaluator judgement; ambiguous scope stays unknown and ambiguous allergy cues require clarification.
- No engine/chat or LLM diff since `595bde8` read before freeze. No live providers, keys, private CSV, servers, push or deploy.

Evaluation and gate evidence pending.

## First-run verbatim summaries

```json
{"mode": "rules", "cases": 225, "safety_pass": 202, "safety_pct": 89.778, "safety_failures": {"allergy_missing": 14, "multiple_clarify": 1, "allergy_cue_not_asked": 3, "allergy_false_positive": 9}, "all_slots_correct": 114, "all_slots_pct": 50.667, "slot_accuracy_pct": {"stops": 88.444, "day_part": 97.333, "budget_vnd": 91.556, "budget_scope": 90.222, "duration_min": 96.889, "max_leg_min": 99.111, "party_size": 92.444, "start_time_set": 98.222, "interests": 85.778, "allergies": 90.222, "allergy_question": 97.333}, "clarify_per_case": 0.5644, "llm_calls": 0, "overasking_count": 6}
{"mode": "outcome_exhausted", "cases": 225, "safety_pass": 202, "safety_pct": 89.778, "safety_failures": {"allergy_missing": 14, "multiple_clarify": 1, "allergy_cue_not_asked": 3, "allergy_false_positive": 9}, "all_slots_correct": 114, "all_slots_pct": 50.667, "slot_accuracy_pct": {"stops": 88.444, "day_part": 97.333, "budget_vnd": 91.556, "budget_scope": 90.222, "duration_min": 96.889, "max_leg_min": 99.111, "party_size": 92.444, "start_time_set": 98.222, "interests": 85.778, "allergies": 90.222, "allergy_question": 97.333}, "clarify_per_case": 0.5644, "llm_calls": 0, "overasking_count": 6}
```
