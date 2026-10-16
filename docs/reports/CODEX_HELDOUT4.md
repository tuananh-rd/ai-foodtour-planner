# C6c blind heldout4 ? 2026-10-16

**Gates NOT MET: 82/104 = 78.85% accuracy; dangerous errors 2/104 = 1.92% (required ?85% and zero).** Setup/invariant failures: zero. Frozen corpus commit: `e7627d6`; reviewed production tree: `6a1065a`, merged before authoring. Reviewer for this Codex evidence: Claude.

104 fresh synthetic rows were independently authored without reading `backend/app/chat/understand.py`; its merged diff was read only after freezing and evaluation. The authoring generator ran only public setup actions, never target texts. Folded duplicate checks rejected overlap against utterances, heldout, heldout2 and heldout3 and within the new set. Personas include an older accentless typist, teen slang, a tourist mixing English, voice-style run-ons and formal requests. Twenty rows deliberately express unresolved references, competing operations, deferred decisions or acknowledgment without authorization, labelled UNKNOWN or AMBIGUOUS_ACK. Labels and denominator remain unchanged after scoring. This is independent agent-authored synthetic evidence, not human-user research.

Every row runs in a fresh real API session with disabled providers and a frozen full pending/options/slot/last-results context. The ordinary evaluator exits **1** on accuracy. No live LLM, database provider, private dataset or external network was used. Corpus SHA-256: `a6308b31bc2298718f109509c2a68ad3e04adab68a669b0893aa4e7ddc857ab0`.

Dangerous errors measure actual final-response effects against the previous setup response, rather than counting wrong intent names. Count an unauthorized add/remove/lock change, generated/replaced tour or allergy change; ignore routine revision stamps and no-op clarifications. ADD permits addition, REMOVE removal, KEEP locking, MODIFY_PLAN replacement, CONFIRM_YES generation and SET_ALLERGY allergy edits; REQUEST_PLAN permits preparing confirmation but no generation. Existing-tour invalidation after an authorized edit is permitted. There are **one unintended add and one unrequested generation**, affecting two distinct rows; no unauthorized remove/lock/allergy effects observed. These failures are not caught by the runner's narrower confirmation invariant. Full predictions remain under the local temporary directory; no row-level failures or target quotations are disclosed.

| Expected primary intent | Actual: count |
|---|---|
| ADD | ADD: 5; COMPARE: 1 |
| AMBIGUOUS_ACK | AMBIGUOUS_ACK: 2; CONFIRM_YES: 1; UNKNOWN: 3 |
| ASK_DETAIL | ADD: 1; ASK_DETAIL: 5; SEARCH_VENUES: 1; UNKNOWN: 1 |
| COMPARE | COMPARE: 4; DISCOVER_DISH: 1; UNKNOWN: 1 |
| CONFIRM_NO | CONFIRM_NO: 4 |
| CONFIRM_YES | CONFIRM_YES: 4 |
| DISCOVER_DISH | DISCOVER_DISH: 4 |
| KEEP | KEEP: 5; SEARCH_VENUES: 1 |
| MODIFY_PLAN | MODIFY_PLAN: 5; SEARCH_VENUES: 1 |
| OUT_OF_SCOPE | OUT_OF_SCOPE: 5; SEARCH_VENUES: 1 |
| REMOVE | REMOVE: 5; SEARCH_VENUES: 1 |
| REQUEST_PLAN | REQUEST_PLAN: 4 |
| SEARCH_VENUES | SEARCH_VENUES: 5; UPDATE_PROFILE: 1 |
| SET_ALLERGY | SET_ALLERGY: 6 |
| SET_AVOID | SET_AVOID: 4; UNKNOWN: 2 |
| UNKNOWN | AMBIGUOUS_ACK: 1; DISCOVER_DISH: 2; KEEP: 1; SEARCH_VENUES: 1; UNKNOWN: 9 |
| UPDATE_PROFILE | UPDATE_PROFILE: 6 |

Commands (PowerShell, PYTHONPATH=backend, PYTHONUTF8=1):

```text
.venv/Scripts/python.exe qa/chat/build_heldout4.py
# Freeze/commit e7627d6 before the next command.
.venv/Scripts/python.exe qa/chat/eval_heldout.py --corpus qa/chat/heldout4.jsonl --report <local TEMP>/C6C_HELDOUT4.json
.venv/Scripts/python.exe qa/chat/review_c6c_engine.py
```

The final command freshly evaluates heldout2/3 and reads the retained heldout4 result; `--reuse` reuses all temporary evaluations to rebuild only the aggregate/expanded hostile scan. Aggregate stdout: C6C_HELDOUT4_OUTPUT.txt; combined scores, confusion and effect counts: C6C_SUMMARY.json. The set is now consumed evaluation data and cannot be claimed as future blind evidence.
