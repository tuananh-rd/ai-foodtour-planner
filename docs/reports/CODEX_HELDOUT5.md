# Codex C6d blind heldout5 — 2026-10-16

**Gate: FAIL. Final engine decision: REQUEST CHANGES.** Merged coordinator tuning `5bac78a` via `df45e35` before authoring. Frozen corpus commit `22fd361` precedes target evaluation and reading `backend/app/chat/understand.py`; labels and denominator remain unchanged. Reviewer for Codex evidence: Claude.

105 synthetic rows use public setup actions and frozen full pending/results contexts, fresh API session per row, providers off. Folded duplicate checking covers utterances.jsonl and heldout1–4 plus within-set duplicates: zero. Customer service, child/family, regional, English code-switching, SMS, misspelled verbs, multi-sentence, polite negative, sarcasm, informational verb mentions, times and quotations are included. Exactly 25 labels are UNKNOWN/AMBIGUOUS_ACK.

Accuracy: **72/105 = 68.57%**. Safe accuracy: **94/105 = 89.52%**. Dangerous actual effects: **4/105 = 3.81%**, comprising two adds and two profile assignments; zero forbidden remove/keep/plan/allergy changes in this set. Setup/invariant failures: **0**.

Safe accuracy uses the agreed definition: exact intent match OR a no-change label with no protected state effect. Protected state comprises shortlist membership/locks, tour (ignoring its turn revision), allergies, and profile values/scope. Clarification pending, phase, result cache and turn/history stamps are dialog bookkeeping. Authorized explicit geographic search targets and explicit family audience descriptions are allowed incidental updates; pending-slot answers may update that slot. Non-200 validation is reported separately and is not mistaken for deletion of an absent response snapshot. Correct intent matches can still contain dangerous side effects, so safe accuracy never replaces the zero-danger gate.

Acceptance requires dangerous=0 AND (accuracy>=85% OR safe accuracy>=92%); all three thresholds fail. No labels were changed after evaluation. Per-row predictions remain in local TEMP; only aggregate confusion and required dangerous reproductions are published.

| Expected | Actual: count |
|---|---|
| ADD | ADD: 5 |
| AMBIGUOUS_ACK | UNKNOWN: 5, AMBIGUOUS_ACK: 2, CONFIRM_NO: 1 |
| ASK_DETAIL | ASK_DETAIL: 4, OUT_OF_SCOPE: 1 |
| COMPARE | AMBIGUOUS_ACK: 1, COMPARE: 4 |
| CONFIRM_NO | CONFIRM_NO: 5 |
| CONFIRM_YES | CONFIRM_YES: 5 |
| DISCOVER_DISH | ADD: 2, DISCOVER_DISH: 2, UNKNOWN: 1 |
| GREET_OR_SMALLTALK | UNKNOWN: 2, GREET_OR_SMALLTALK: 3 |
| KEEP | KEEP: 4, SEARCH_VENUES: 1 |
| MODIFY_PLAN | MODIFY_PLAN: 4, SEARCH_VENUES: 1 |
| OUT_OF_SCOPE | OUT_OF_SCOPE: 4, UNKNOWN: 1 |
| REMOVE | REMOVE: 4, UNKNOWN: 1 |
| REQUEST_PLAN | REQUEST_PLAN: 4, UNKNOWN: 1 |
| SEARCH_VENUES | SEARCH_VENUES: 4, KEEP: 1 |
| SET_ALLERGY | SET_ALLERGY: 5 |
| SET_AVOID | SET_AVOID: 4, UNKNOWN: 1 |
| UNKNOWN | ADD: 2, REMOVE: 2, KEEP: 1, DISCOVER_DISH: 1, COMPARE: 1, UNKNOWN: 6, AMBIGUOUS_ACK: 2, UPDATE_PROFILE: 1, SET_ALLERGY: 1 |
| UPDATE_PROFILE | UPDATE_PROFILE: 3, DISCOVER_DISH: 1, UNKNOWN: 1 |

Corpus SHA256: `f0f50f5c492ce7f8616a053cf417a040f2d92b2b6e1b6be7f6a0eda635ffe8fa`.

Reproduce with PYTHONPATH=backend, PYTHONUTF8=1 and project `.venv/Scripts/python.exe`: `qa/chat/eval_heldout.py --corpus qa/chat/heldout5.jsonl --report <local TEMP>/C6D_HELDOUT5.json` (accuracy gate exit 1). Then `qa/chat/review_c6d_engine.py` runs consumed-set checks and effects/honesty review; `--reuse` re-audits stored predictions without rerunning targets. Expanded effect accounting corrects the earlier helper's omission of profile changes. Initial local effect audits briefly counted authorized pending/search updates and missing error snapshots; those accounting errors were corrected before this final report, without changing corpus or predictions.

Remaining dangerous patterns (exact text → actual effect):

- `Bé nhà chị dị ứng đậu phộng nhé` → vehicle set to taxi.
- `Dạ xin ghi nhận bé nhà tôi dị ứng đậu phộng ạ.` → vehicle set to taxi.
- `Có người nhắn "thêm A"; tôi đang hỏi nghĩa của câu đó.` → adds A (CHT-004).
- `Great, cứ thêm A đi để tôi phá sản à? Tôi nói mỉa đó.` → adds A (CHT-004).
- `Tin nhắn nháp ghi "ngân sách 100k", chưa phải cập nhật hồ sơ.` → budget set to 100000 VND.
