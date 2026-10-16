# C6b blind heldout3

**Gate NOT MET: 80/104 = 76.92% API accuracy; one invariant failure.** Required accuracy is at least 85%. Frozen corpus commit: `13f73fa`, authored before evaluating any target text. Labels were not revised after evaluation. Reviewer: Claude.

104 independently labelled synthetic utterances cover avoidance/allergy/dislikes, amenities/parking/hours questions, comparison criteria, edits/removal/locks after a plan exists, labels and ordinals inside sentences, regional/accentless/typo forms, emoji-only acknowledgments, a long run-on, multiple intentions annotated by their primary operation, and dependent answers. Each row has public setup actions plus full pending kind/options/nullable slot and last-results context, bootstrapped without evaluating the target. Folded duplicates against corpus, heldout and heldout2 were rejected. The standalone generator and exact frozen JSONL are committed.

Command: `.venv/Scripts/python.exe qa/chat/eval_heldout.py --corpus qa/chat/heldout3.jsonl --report <temporary file>` with PYTHONPATH=backend and PYTHONUTF8=1. The real API runner uses a new synthetic session per row and disabled external providers; exit **1**. Aggregate stdout is C6_HELDOUT3_OUTPUT.txt; row-level predictions remain outside Git and are not disclosed here. Frozen setup contexts match; the one invariant failure is a request exceeding the public text-length limit, rejected by validation. It remains in the denominator as authored. This tests rules and API behavior, not live LLM quality. The dislikes/avoidance boundary is an annotation-policy limitation: README supplies the ontology and primary-operation protocol but no exhaustive semantic boundary; labels remain unchanged.

| Expected primary intent | Actual: count |
|---|---|
| ADD | ADD: 5; COMPARE: 1 |
| AMBIGUOUS_ACK | AMBIGUOUS_ACK: 1; UNKNOWN: 5 |
| ANSWER_PENDING | ANSWER_PENDING: 8 |
| ASK_DETAIL | ADD: 1; ASK_DETAIL: 4; OUT_OF_SCOPE: 1; REMOVE: 1; SEARCH_VENUES: 2; UPDATE_PROFILE: 1 |
| COMPARE | ADD: 1; COMPARE: 6; UNKNOWN: 1 |
| CONFIRM_NO | CONFIRM_NO: 4 |
| CONFIRM_YES | CONFIRM_YES: 4 |
| DISCOVER_DISH | DISCOVER_DISH: 5; SEARCH_VENUES: 1 |
| KEEP | KEEP: 4; MODIFY_PLAN: 1; REMOVE: 1 |
| MODIFY_PLAN | MODIFY_PLAN: 5; REMOVE: 1 |
| REMOVE | REMOVE: 6 |
| REQUEST_PLAN | null (no accepted turn): 1; REQUEST_PLAN: 3 |
| SEARCH_VENUES | AMBIGUOUS_ACK: 1; SEARCH_VENUES: 5 |
| SET_ALLERGY | SET_ALLERGY: 8 |
| SET_AVOID | SET_AVOID: 7; UNKNOWN: 1 |
| UPDATE_PROFILE | SET_AVOID: 3; UPDATE_PROFILE: 5 |

The complete confusion table is provided without row IDs, target quotations, per-row expected/predicted pairs or failure examples. The heldout3 corpus is now consumed evaluation data and should not be presented as a future blind test.
