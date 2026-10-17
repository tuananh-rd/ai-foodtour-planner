# U5d independent evaluation

Freeze receipt (recorded before scoring): dataset `qa/chat/guided_blind_v4.jsonl`, 220 synthetic cases, SHA256 `88bfb7627ede1e19b1b60163ef0e8eda2f044f3f4ddd8f513b10a6b8e32e8c91`; freeze commit `08dd4d7fc0853371cd6aa8dd3c5fe85a48d43c84`.

Engine commit `0dde2116c6d5d2421000bb3afa90c158e081b350`. Restricted engine diffs were not read before freeze. Only v3 schema/first-row expected values were inspected, with text/prior omitted. New structures and dishes were authored without reading previous sentences. Mix: 88 one-shot / 55 allergy / 33 numeric / 22 preference / 22 adversarial. Ambiguous cases expect hold/question; exact accuracy and safety are separate. No live providers, servers, private CSV, keys, or deployment.

First-run results pending.

Verbatim first-run numbers:
`json
[
  {
    "mode": "rules",
    "cases": 220,
    "safety_pass": 173,
    "safety_pct": 78.636,
    "safety_failures": {
      "allergy_missing": 29,
      "allergy_false_positive": 28,
      "allergy_cue_not_asked": 17
    },
    "all_slots_correct": 71,
    "all_slots_pct": 32.273,
    "slot_accuracy_pct": {
      "stops": 98.636,
      "day_part": 76.364,
      "budget_vnd": 100.0,
      "budget_scope": 100.0,
      "duration_min": 98.182,
      "max_leg_min": 100.0,
      "party_size": 99.091,
      "start_time_set": 100.0,
      "interests": 55.455,
      "allergies": 82.727,
      "allergy_question": 90.0
    },
    "clarify_per_case": 0.2091,
    "llm_calls": 0,
    "overasking_count": 7
  },
  {
    "mode": "outcome_exhausted",
    "cases": 220,
    "safety_pass": 173,
    "safety_pct": 78.636,
    "safety_failures": {
      "allergy_missing": 29,
      "allergy_false_positive": 28,
      "allergy_cue_not_asked": 17
    },
    "all_slots_correct": 71,
    "all_slots_pct": 32.273,
    "slot_accuracy_pct": {
      "stops": 98.636,
      "day_part": 76.364,
      "budget_vnd": 100.0,
      "budget_scope": 100.0,
      "duration_min": 98.182,
      "max_leg_min": 100.0,
      "party_size": 99.091,
      "start_time_set": 100.0,
      "interests": 55.455,
      "allergies": 82.727,
      "allergy_question": 90.0
    },
    "clarify_per_case": 0.2091,
    "llm_calls": 0,
    "overasking_count": 7
  }
]
`
