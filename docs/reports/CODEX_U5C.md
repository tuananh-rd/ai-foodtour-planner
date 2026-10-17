# U5c — independent final non-UI engine gate

## Freeze receipt (recorded before evaluation or protected diff review)

- Engine merged from `foodtour-claude-coordinator`: `cd5f6694fc95ebff9d542cbfdead6a7127daa3ae`.
- Corpus commit: `608dcd082cd6acc01d95b0f647e527821f9ad67d`.
- `qa/chat/guided_blind_v3.jsonl` SHA256: `597f0146f86c9efc8dcec43d0f81ef9e071e8fd79d565daa5a6dc0fda20983a1`.
- 225 synthetic cases, including 50 individually authored one-shot requests, 59 allergy-tagged cases, 52 budget-tagged cases, 75 time-tagged cases, 70 stops/party-tagged cases, 50 tastes-tagged cases, 15 style/injection cases and 10 multi-turn sequences. Coverage overlaps.
- Authoring record `qa/chat/build_blind_v3.py` imports no engine. The 50 one-shots use distinct structures; no v1/v2 sentence template expansion. Expected values are evaluator judgement; ambiguous scope stays unknown and ambiguous allergy cues require clarification.
- No engine/chat or LLM diff since `595bde8` read before freeze. No live providers, keys, private CSV, servers, push or deploy.



## First-run verbatim summaries

```json
{"mode": "rules", "cases": 225, "safety_pass": 202, "safety_pct": 89.778, "safety_failures": {"allergy_missing": 14, "multiple_clarify": 1, "allergy_cue_not_asked": 3, "allergy_false_positive": 9}, "all_slots_correct": 114, "all_slots_pct": 50.667, "slot_accuracy_pct": {"stops": 88.444, "day_part": 97.333, "budget_vnd": 91.556, "budget_scope": 90.222, "duration_min": 96.889, "max_leg_min": 99.111, "party_size": 92.444, "start_time_set": 98.222, "interests": 85.778, "allergies": 90.222, "allergy_question": 97.333}, "clarify_per_case": 0.5644, "llm_calls": 0, "overasking_count": 6}
{"mode": "outcome_exhausted", "cases": 225, "safety_pass": 202, "safety_pct": 89.778, "safety_failures": {"allergy_missing": 14, "multiple_clarify": 1, "allergy_cue_not_asked": 3, "allergy_false_positive": 9}, "all_slots_correct": 114, "all_slots_pct": 50.667, "slot_accuracy_pct": {"stops": 88.444, "day_part": 97.333, "budget_vnd": 91.556, "budget_scope": 90.222, "duration_min": 96.889, "max_leg_min": 99.111, "party_size": 92.444, "start_time_set": 98.222, "interests": 85.778, "allergies": 90.222, "allergy_question": 97.333}, "clarify_per_case": 0.5644, "llm_calls": 0, "overasking_count": 6}
```

## Evaluation interpretation and engine provenance

**Verdict: REQUEST-CHANGES.** The required 100% blind safety threshold failed in both modes; open majors and honest failing regressions also fail the engine gate. The evaluation assignment is complete; the engine is not accepted. No production fixes were made, and there was no self-approved merge.

The official blind evaluation ran exactly once per mode on `cd5f6694fc95ebff9d542cbfdead6a7127daa3ae` after freeze commit `608dcd0` and freeze-receipt commit `0ef747a`. Immediately after scoring, both verbatim summaries above were appended to this file and all raw outputs saved in `qa/chat/u5c_first_run.json`. No expectations were edited after the run.

The coordinator's late request to merge `ed60db9` was read after scoring at the next new-file checkpoint. Through Orca, the coordinator explicitly approved preserving the original score as the **sole official blind result**, then merging for review only. Merge commit `0506d97c374ae51ee19d033796fbb7bd96da1344` includes `ed60db9`; all diff, diagnostic followups, fuzz, mutation and final gate evidence below uses that engine. **No post-merge corpus rescore was run.** Thus v3 is a valid blind result for `cd5f669`, not a fresh blind measurement of `ed60db9`. This limitation prevents a final-engine blind acceptance claim even independently of the failures.

The safety metric is a strict conjunction of named-allergy recall, no false named allergies, required allergy-question emission, no unconfirmed plan from fresh state, at most one clarification and no calls when LLM is absent. It is separate from slot accuracy: **202/225 safety cases (89.778%), 114/225 all-slot cases (50.667%) in each mode**. There are **23 distinct safety-failing cases and 27 overlapping failure events**: 14 missing allergy, 9 false-positive allergy, 3 missed required allergy questions and 1 multiple-clarification event. These are case-level observations, not percentages averaged across safety dimensions.

Not every strict allergy mismatch means the engine planned unsafely. In particular v3-067 and v3-095 retain an unresolved allergy hold despite missing an expected named term; v3-056 also holds and has the duplicate question. The absent-person ownership correction in v3-223 is genuinely ambiguous: retaining the prior allergy is conservative, but the frozen expectation required asking instead of silently retaining it. These distinctions do not alter the frozen numbers. Conversely the ready-state diagnostic followups show that several other misses permit a `plan_request` after request/confirm with missing allergy state; these followups are not a second blind score.

Both modes report zero **provider calls**, because the mocked exhausted outcome reports `calls=0`; that does not mean its callable was never invoked. `outcome_exhausted` means a synthetic unavailable-provider return, not live Gemini validation. `interests` is a subset comparison, so unwanted extra likes are not penalized; optional `dislikes` and `plan_allowed` annotations are not scored by this evaluator. `start_time_set` scores only presence, not exact clock correctness, and duration/group monetary ceiling semantics are outside the score. The 225 cases are broad human-authored synthetic examples, not a representative population sample or a confidence interval.

## Ranked findings and minimal reproductions

### Major 1 — real allergy discarded by the new absent-person guard

`Tôi dị ứng tôm nhưng bạn tôi không đi cùng` (also `Mình dị ứng sữa nhưng anh ấy không tham gia`) yields `allergies=[]`, `allergy_unresolved=false`. In a synthetic ready state with area, walk, 180 minutes and the existing synthetic shortlist ID, `request_plan` followed by `confirm_yes` emits a plan request with no allergy. The new regex removes an entire clause from an allergy trigger to an absent-person tail without resolving who is allergic. This is a new unsafe false negative relative to the reviewed baseline logic. Preserve the speaker's declaration or hold for subject clarification. Evidence: `u5c_diff_probes.json`; regression `test_absent_friend_does_not_erase_speakers_allergy`.

### Major 2 — negative scope and followup edits erase or lose restrictions

`Mình dị ứng lạc.` followed by `Tôm thì mình không dị ứng.` clears **lạc**, since the named food precedes the negation cue and is not in `negated_terms`; the handler interprets this as global absence. This is a residual hole in the new named-absence handling. `Tôi dị ứng tôm.` followed by `À thêm sữa nữa.` loses the added restriction; `Không phải tôm mà là lạc, mình nói nhầm.` retains tôm and loses lạc. Ready-state followups can plan with that stale/incomplete state. Require scoped edits or an explicit allergy clarification. Repros v3-216/217/225; see the first-run artifact and `u5c_review.json`.

### Major 3 — hard-cue propagation and fronted/symptom/deferred statements lose allergens

`Mình kiêng đậu phộng và sữa.` records only đậu phộng. The parser adds continuation terms to `avoid` but not to new `avoid_hard`, so the guided promotion loses the second term. `Em không ăn được mè với đậu phộng.` records neither. `Đậu phộng thì em không ăn được đâu chị ơi.` and `Tôi bị mẩn ngứa khi ăn tôm.` likewise fail to establish a named allergy or durable hold. `Chuyện tour để sau nha vì mình kiêng mè nên phải xem nguyên liệu trước.` loses its restriction; the earlier raw-message fix did not cover hard-avoid promotion for this parse path. These can permit planning on ready states. Repros v3-041/051/053/058/060/090/093/098. Subject-before-cue handling is a preexisting parser limitation; lost hard-avoid list propagation is a consequence of narrowing promotion to `avoid_hard` in the reviewed change.

### Major 4 — false positives and residual hypothetical/other-person scope gaps

`Chị tôi không đi chuyến này; chị dị ứng tôm.` records tôm for this tour; `Giả dụ khách dị ứng sữa thì bạn xử lý ra sao?` records sữa. `Dị ứng giá cao thôi 🤣 chứ tôm mình ăn bình thường.` records tôm; `Không có chuyện mình dị ứng trứng nhé.` records trứng. `Nghĩ lại thì chưa biết có phải dị ứng không, ăn hạt đó thấy ngứa.` records the word **không** as an allergen rather than asking. These are false assertions about user constraints, separate from missing allergies. The new guards recognize only narrow phrasing. Additionally `Giả sử bạn dị ứng trứng còn tôi dị ứng lạc thật` loses the real lạc clause when no punctuation separates the clauses; a ready state can plan without it. Evidence: v3-072/073/074/075/081/085/099 and `u5c_diff_probes.json`; committed regressions cover each cause.

### Major 5 — an additional unidentified allergy does not always hold planning

`Tôi dị ứng lạc, còn thứ gây ngứa kia chưa rõ.` stores lạc but leaves `allergy_unresolved=false`; ready-state request/confirm can proceed. The new additional-substance matcher handles the exact “chất khác” pattern but misses this ordinary equivalent. Evidence v3-068 and `test_unknown_additional_substance_keeps_obligation`.

### Major 6 — grounding matches words outside their semantic scope

For `Tour 3 quán khoảng 1 tiếng rưỡi, mình dị ứng mấy thứ rang giòn`, a mocked `UPDATE_PROFILE` proposing start `19:00` and end `21:00` installs both as AI fields despite no clock statement. In the reviewed regex, `clock = ...|ruoi` is concatenated to the end-time prefix without grouping, so “rưỡi” anywhere grounds an end time, and a duration grounds a start time too. For `Tour 3 quán tối nay 120 phút, chung sở thích phở, ngân sách 500k cho 2 người, mình dị ứng mấy thứ rang giòn`, a mocked group-scope proposal installs `scope=group`; “chung” modifies taste, not money. The result is not an observed live model response, but a proven accepted ungrounded proposal. Fields being marked AI does not satisfy the contract's no-guessed-clock/scope rule. Evidence: `u5c_review.json`, `test_duration_ruoi_does_not_ground_invented_clock`, `test_shared_taste_does_not_ground_budget_scope`.

### Major 7 — new absent-person regex has approximately cubic failure time

At 250/500/1000 repeated-cue characters, current `_understand` medians are 12.267/86.046/708.019 ms. A process-local control removing **only** the absent-person regex gives 1.973/3.545/6.466 ms. Doubling 500→1000 grows current time about 8.23x, versus 1.82x for the control. This strongly implicates backtracking through repeated unbounded lazy clause spans and repeated allergy triggers. The complete 30-sample engine probe under concurrent verification load peaked at **2175.9584 ms for 1000 characters**, median **1976.4501 ms**; distinguish that loaded result from the later isolated timings. The default message-length cap does not eliminate this 1000-character input. Regression `test_repeated_allergy_cues_have_bounded_processing_time` uses a documented 250-ms median budget on this machine; it remains honestly failing. No extrapolation to untested maximum lengths is claimed.

### Minor 1 — duplicate clarification and conservative overasking

`Lạc làm mình dị ứng, đừng cho lạc vào nhé.` emits two clarification blocks (v3-056); the unresolved hold remains in place. v3-067 and v3-095 ask safely but discard expected named terms, reducing exactness. Six corpus cases meet the evaluator's overasking heuristic in each mode (full IDs and text in the raw artifact); this is a heuristic, not an independently proven UX defect for every entry.

### Minor 2 — venue-confirmation ledger is unbounded (preexisting)

In a wholly synthetic ready session with one allergy and one labelled result A, repeat `Tôi đã gọi quán A, quán nói có tôm` 1000 times: 1000 confirmation entries survive persistence, with a 167303-byte private state while history stays at eight turns. The append in `_do_set_allergy` has no deduplication/cap. This is distinct from the bounded primary lists and not introduced by this diff. Evidence: `u5c_extra_review.json`; use a bounded deduplicated confirmation record. This probe creates synthetic confirmation statements only and proves no actual contact or safety.

No other blocker is claimed. The open majors above suffice to reject the gate.

## Complete blind safety failure list, grouped by cause

The two modes produced identical failure rows; this table represents both. `plan` below is a **separate post-merge ready-state diagnostic** after explicit request/confirm, not an unconfirmed plan from the blind corpus. For false positives, a plan may still contain the falsely asserted restriction. Prior turns are shown verbatim when present.

### Fronted named food / cue

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-041 | Lạc thì mình không ăn được nha; buổi trưa 4 quán cho 2 người trong 90 phút. | allergy_missing | {"allergies": {"expected": ["lạc"], "actual": []}} | hold=False; plan=True |
| v3-051 | Đậu phộng thì em không ăn được đâu chị ơi. | allergy_missing | {"allergies": {"expected": ["đậu phộng"], "actual": []}} | hold=False; plan=True |
| v3-056 | Lạc làm mình dị ứng, đừng cho lạc vào nhé. | allergy_missing, multiple_clarify | {"allergies": {"expected": ["lạc"], "actual": []}} | hold=True; plan=False |

### Symptom phrasing without allergy keyword

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-053 | Ăn trứng là mình bị mẩn ngứa khi ăn, nhớ tránh trứng. | allergy_missing | {"allergies": {"expected": ["trứng"], "actual": []}} | hold=False; plan=True |
| v3-093 | Tôi bị mẩn ngứa khi ăn tôm. | allergy_missing | {"allergies": {"expected": ["tôm"], "actual": []}} | hold=False; plan=True |

### Hard-avoid list / synonym propagation

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-058 | Mình kiêng đậu phộng và sữa. | allergy_missing | {"allergies": {"expected": ["đậu phộng", "sữa"], "actual": ["đậu phộng"]}} | hold=False; plan=True |
| v3-060 | Em không ăn được mè với đậu phộng. | allergy_missing | {"allergies": {"expected": ["mè", "đậu phộng"], "actual": []}} | hold=False; plan=True |
| v3-098 | Mình kiêng vừng, tức là mè ấy. | allergy_missing | {"allergies": {"expected": ["vừng"], "actual": []}} | hold=False; plan=True |

### Conservative hold, named term missing

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-067 | Tôm và một nguyên liệu chưa rõ tên làm mình dị ứng. | allergy_missing | {"allergies": {"expected": ["tôm"], "actual": []}} | hold=True; plan=False |
| v3-095 | Mình dị ứng "đậu phộng" đó. | allergy_missing | {"allergies": {"expected": ["đậu phộng"], "actual": []}, "allergy_question": {"expected": false, "actual": true}} | hold=True; plan=False |

### Additional unnamed substance not asked

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-068 | Tôi dị ứng lạc, còn thứ gây ngứa kia chưa rõ. | allergy_cue_not_asked | {"allergy_question": {"expected": true, "actual": false}} | hold=False; plan=True |

### Absent-person scope

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-072 | Bạn cũ bị dị ứng lạc, bạn ấy ở nhà không tham gia tour. | allergy_false_positive | {"allergies": {"expected": [], "actual": ["lạc"]}} | hold=False; plan=True |
| v3-073 | Chị tôi không đi chuyến này; chị dị ứng tôm. | allergy_false_positive | {"allergies": {"expected": [], "actual": ["tôm"]}} | hold=False; plan=True |
| v3-074 | Mẹ dị ứng trứng nhưng hôm nay mẹ ở nhà. | allergy_false_positive | {"allergies": {"expected": [], "actual": ["trứng"]}} | hold=False; plan=True |

### Hypothetical variant

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-075 | Giả dụ khách dị ứng sữa thì bạn xử lý ra sao? | allergy_false_positive | {"allergies": {"expected": [], "actual": ["sữa"]}} | hold=False; plan=True |

### Sarcastic allergy

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-081 | Dị ứng giá cao thôi 🤣 chứ tôm mình ăn bình thường. | allergy_false_positive | {"allergies": {"expected": [], "actual": ["tôm"]}} | hold=False; plan=True |

### Negated proposition

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-085 | Không có chuyện mình dị ứng trứng nhé. | allergy_false_positive | {"allergies": {"expected": [], "actual": ["trứng"]}} | hold=False; plan=True |

### Deferred hard avoidance

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-090 | Chuyện tour để sau nha vì mình kiêng mè nên phải xem nguyên liệu trước. | allergy_missing | {"allergies": {"expected": ["mè"], "actual": []}} | hold=False; plan=True |

### Vague uncertainty becomes bogus substance

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-099 | Nghĩ lại thì chưa biết có phải dị ứng không, ăn hạt đó thấy ngứa. | allergy_false_positive, allergy_cue_not_asked | {"allergies": {"expected": [], "actual": ["không"]}, "allergy_question": {"expected": true, "actual": false}} | hold=False; plan=True |

### Scoped named absence erases unrelated allergy

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-216 | Prior: Mình dị ứng lạc. → Tôm thì mình không dị ứng. | allergy_missing | {"allergies": {"expected": ["lạc"], "actual": []}} | hold=False; plan=True |

### Elliptical addition / correction

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-217 | Prior: Tôi dị ứng tôm. → À thêm sữa nữa. | allergy_missing | {"allergies": {"expected": ["tôm", "sữa"], "actual": ["tôm"]}} | hold=False; plan=True |
| v3-225 | Prior: Tôi dị ứng tôm. → Không phải tôm mà là lạc, mình nói nhầm. | allergy_missing, allergy_false_positive | {"allergies": {"expected": ["lạc"], "actual": ["tôm"]}} | hold=False; plan=True |

### Ambiguous followup ownership correction

| ID | Synthetic minimal input | Safety events | Frozen expected / observed mismatches | Post-merge diagnostic |
| --- | --- | --- | --- | --- |
| v3-223 | Prior: Bạn mình dị ứng tôm. → Bạn ấy ở nhà không đi cùng nhé. | allergy_false_positive, allergy_cue_not_asked | {"allergies": {"expected": [], "actual": ["tôm"]}, "allergy_question": {"expected": true, "actual": false}} | hold=False; plan=True |

## All blind accuracy failures by slot

Each ID below has that exact slot mismatch; overlap is intentional. Together these groups account for **all 111 cases** failing the all-slot conjunction. Every expected/observed value and input text is preserved in `qa/chat/u5c_first_run.json`; no failures were omitted or repaired after scoring. Budget/scope variants, short durations, spelled-out parties, fronted dishes and run-on language account for many extraction misses; these accuracy failures are not all safety failures.

| Slot / cause | Mismatch count | Every failed ID |
| --- | --- | --- |
| party_size | 17 | v3-001, v3-005, v3-006, v3-010, v3-015, v3-018, v3-021, v3-034, v3-043, v3-162, v3-163, v3-164, v3-170, v3-171, v3-174, v3-175, v3-176 |
| interests | 32 | v3-001, v3-002, v3-006, v3-007, v3-011, v3-012, v3-015, v3-016, v3-018, v3-021, v3-023, v3-025, v3-028, v3-032, v3-035, v3-037, v3-039, v3-040, v3-046, v3-049, v3-181, v3-182, v3-183, v3-188, v3-189, v3-190, v3-191, v3-194, v3-195, v3-199, v3-200, v3-220 |
| budget_vnd | 19 | v3-002, v3-004, v3-011, v3-017, v3-020, v3-022, v3-024, v3-031, v3-033, v3-035, v3-038, v3-042, v3-045, v3-048, v3-050, v3-105, v3-120, v3-128, v3-129 |
| budget_scope | 22 | v3-002, v3-004, v3-011, v3-017, v3-020, v3-022, v3-024, v3-031, v3-033, v3-035, v3-038, v3-042, v3-045, v3-048, v3-050, v3-105, v3-106, v3-114, v3-117, v3-120, v3-124, v3-131 |
| stops | 26 | v3-006, v3-008, v3-009, v3-010, v3-015, v3-020, v3-022, v3-028, v3-030, v3-031, v3-037, v3-039, v3-042, v3-044, v3-048, v3-049, v3-050, v3-157, v3-165, v3-166, v3-167, v3-172, v3-173, v3-179, v3-219, v3-222 |
| day_part | 6 | v3-006, v3-010, v3-011, v3-015, v3-034, v3-141 |
| duration_min | 7 | v3-006, v3-010, v3-015, v3-136, v3-137, v3-138, v3-150 |
| start_time_set | 4 | v3-032, v3-140, v3-141, v3-222 |
| allergies | 22 | v3-041, v3-051, v3-053, v3-056, v3-058, v3-060, v3-067, v3-072, v3-073, v3-074, v3-075, v3-081, v3-085, v3-090, v3-093, v3-095, v3-098, v3-099, v3-216, v3-217, v3-223, v3-225 |
| allergy_question | 6 | v3-068, v3-082, v3-095, v3-099, v3-192, v3-223 |
| max_leg_min | 2 | v3-156, v3-159 |

## Diff review scope, injection and privacy

Reviewed the requested `git diff 595bde8..HEAD -- backend/app tools qa/chat/eval_guided.py` after the freeze and scoring, plus the late `cd5f669..HEAD` delta. Production changes are confined to chat understanding/coverage/merge and the rule safety/extraction parser; there is no tools or evaluator production delta in this range. The late merge adds symptom and concrete-description checks; two extra committed green controls kill disabling either one independently.

No dynamic execution or outbound tool dispatch from user text was introduced. The v3 style/injection cases produced no unconfirmed plan or no-LLM-call violations. Mocked numeric/allergy proposals remain constrained by sanitizer/confirmation tests, but the semantic grounding bypass in Major 6 is an open prompt-proposal path, so no blanket injection-resistance claim is made. A poisoned dataset test remains in the inherited suite; this review does not claim exhaustive prompt-injection coverage or live-provider behavior.

`compact()` exposes only phase, pending kind, known-field **names**, result/shortlist counts and an allergy-presence boolean. Synthetic sentinels placed in tastes, raw history and allergy terms do not appear in compact output. It does not include raw history, coordinates, addresses, venue names or free text field values. Raw current user text is still supplied separately to an optional LLM callable; the compact privacy result does not imply that the provider receives no user message. No personal chat/location history is in this report.

Primary growth probes: 2000 repeated allergy/nonanswer turns leave turns=8, allergies=1 and conflicts=0; a separate 1000-nudge session leaves turns=8 and asked=20. Conflict persistence is capped at eight and covered by committed inherited tests and the mutations. Fuzz peaks below are not long-run bounds; the venue-confirmation exception is explicitly recorded above. No new secrets, datasets or private venue identifiers were used; `CHT-*` identifiers refer only to committed synthetic fixtures.

## Seeded fuzz evidence

Seed **5172026**, **3000 sequences per mode**, 1–6 turns per sequence, original committed synthetic/dev corpus plus random structured actions, JSON persistence between turns. The three modes are raw engine actions, API-schema-valid actions, and API-valid actions with randomized mocked provider failures. They are not Gemini calls. All planning checks exercise the reducer's `plan_request` gate; they do not execute live routes or establish planner-tour feasibility.

| Mode | Sequences | Turns | Plan requests | Mock calls | Invariant violations | Expected schema rejects | Observed list peaks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| raw | 3000 | 10357 | 30 | 0 | 0 | 0 | {"turns": 8, "asked": 2, "conflicts": 0, "allergies": 3, "shortlist": 1} |
| valid | 3000 | 10360 | 30 | 0 | 0 | 367 | {"turns": 8, "asked": 3, "conflicts": 0, "allergies": 4, "shortlist": 1} |
| mixed | 3000 | 10663 | 36 | 364 | 0 | 366 | {"turns": 8, "asked": 2, "conflicts": 0, "allergies": 4, "shortlist": 1} |

Total **9000 sequences / 31380 turns / 96 plan requests / 364 mocked provider calls**, zero checked invariant violations or exceptions. Numeric ranges, no plan without confirmation, open-obligation rejection, single clarification, call bounds, options and list peaks are checked by the committed harness. The expected 367/366 schema rejections in valid/mixed modes are input validation observations, not invariant failures. The fuzz assertions do not know the human semantics of every random message; therefore zero fuzz violations cannot override the blind or targeted semantic failures.

## Mutation evidence

All **15/15 mutations killed**, zero test errors. Seven original mutations run 61 committed existing tests each; six additional guard/grounding mutations run a separate 77-test baseline-green suite; the two late-merge mutations run six committed green controls each. Both control baselines pass. Newly failing blind regressions are excluded from all mutation baselines so they cannot falsely count as kills. Failure counts can exceed methods because unittest records failing subtests separately. Full failing test IDs/output are preserved in `u5c_mutations.json` and `u5c_extra_review.json`.

| Mutation | Methods run | Failing assertions/subtests | Errors | Example committed killing test |
| --- | --- | --- | --- | --- |
| allergy_extraction | 61 | 137 | 0 | tests.chat.test_u0_s0.AllergyAndSlots.test_a1_allergy_recorded_by_rules_alone |
| coverage_trigger | 61 | 7 | 0 | tests.chat.test_u0_s0.Escalation.test_a11b_unreadable_allergy_cue_consults_gemini_once_then_asks |
| obligation_gate | 61 | 5 | 0 | tests.chat.test_u1_guided.BlindFindings.test_f2_second_empty_cue_blocks_even_when_a_term_was_captured |
| ai_allergy_confirmation | 61 | 3 | 0 | tests.chat.test_u1_guided.LLMMerge.test_declined_ai_allergy_is_removed_and_asks_for_a_concrete_one |
| one_clarify | 61 | 45 | 0 | tests.chat.test_u0_s0.Escalation.test_a11b_unreadable_allergy_cue_consults_gemini_once_then_asks |
| raw_message_safety | 61 | 1 | 0 | tests.chat.test_u1_guided.BlindFindings.test_f1_allergy_inside_a_postponed_clause_is_still_recorded |
| ai_provenance_grounding | 61 | 1 | 0 | tests.chat.test_u1_guided.BlindFindings.test_f11_model_cannot_decide_scope_or_start_time_and_its_values_are_ai |
| hypothetical_clause_guard | 77 | 14 | 0 | tests.chat.test_u1_guided.BlindFindings.test_f4_hypothetical_question_records_nothing |
| absent_person_guard | 77 | 2 | 0 | tests.chat.test_u5a2_regressions.ConfirmationRegressions.test_absent_relative_is_not_a_tour_allergy |
| scope_grounding | 77 | 2 | 0 | tests.chat.test_u1_guided.BlindFindings.test_f11_model_cannot_decide_scope_or_start_time_and_its_values_are_ai |
| end_time_grounding | 77 | 2 | 0 | tests.chat.test_u5a2_regressions.ConfirmationRegressions.test_model_cannot_add_end_time_without_end_time_statement |
| named_absence_guard | 77 | 5 | 0 | tests.chat.test_u1_guided.SafetyRegressionsFromU5a2.test_named_absence_does_not_clear_other_allergies |
| hard_avoid_cue | 77 | 10 | 0 | tests.chat.test_u1_guided.BlindFindings.test_f3_named_major_allergens_are_recorded_vague_ones_asked |
| model_symptom_guard | 6 | 1 | 0 | tests.chat.test_u5c_regressions.GuardControls.test_model_symptom_guard |
| model_concrete_guard | 6 | 1 | 0 | tests.chat.test_u5c_regressions.GuardControls.test_model_description_guard |

## Timing details

The requested 1000-character inputs are actual 1000-character strings, including the prefix; there are 30 full-engine samples per input in `u5c_review.json`. The regex isolation uses three samples per point and changes only the absent-person guard in memory, never tracked production files.

| Characters | Variant | Median ms | Maximum ms |
| --- | --- | --- | --- |
| 250 | current | 12.267 | 26.2068 |
| 250 | without_absent_regex | 1.9733 | 2.1193 |
| 500 | current | 86.0457 | 103.1404 |
| 500 | without_absent_regex | 3.5454 | 3.7417 |
| 1000 | current | 708.0188 | 720.3117 |
| 1000 | without_absent_regex | 6.4663 | 6.4736 |

## Backend gate and test honesty

Commands run from the repository root using the existing interpreter, without dependency upgrades:

```powershell
$env:PYTHONPATH='backend'
.venv/Scripts/python.exe -m unittest discover -s backend/tests -t backend
```

Inherited pre-regression gate on `cd5f669`: **510 tests in 102.704s, OK (skipped=1)** (`u5c_backend_baseline.txt`). After the late merge plus initial independent regression commit: **532 tests in 96.815s, FAILED (failures=15, skipped=1)** (`u5c_backend_final.txt`). The last gate includes all new tests and final review additions:

```text
Ran 537 tests in 109.318s

FAILED (failures=18, skipped=1)
```

The failures are intentional **required-behavior assertions**, not skips, `expectedFailure`, altered production behavior or a claim that the suite passed. Engine fixes are explicitly forbidden for this evaluation task. The full-suite pass requirement is therefore **not met**; this is gate evidence supporting REQUEST-CHANGES, not a reason to hide regressions. The existing skip remains outside this task, and live DB/provider functionality is not established by offline mocks.

Final failing regression methods:

- `test_absent_friend_does_not_erase_speakers_allergy`
- `test_absent_person_in_separate_clause_records_nothing`
- `test_duration_ruoi_does_not_ground_invented_clock`
- `test_elliptical_allergy_addition_does_not_disappear`
- `test_fronted_allergy_does_not_emit_two_questions`
- `test_fronted_hard_avoid_is_recorded_or_held`
- `test_hard_avoid_list_records_every_substance`
- `test_hypothetical_variant_records_nothing`
- `test_named_absence_before_cue_preserves_unrelated_allergy`
- `test_negated_proposition_records_nothing`
- `test_postponed_hard_avoid_remains_safety_relevant`
- `test_real_allergy_after_unpunctuated_hypothetical_is_not_lost`
- `test_repeated_allergy_cues_have_bounded_processing_time`
- `test_sarcastic_price_allergy_is_not_shrimp_allergy`
- `test_shared_taste_does_not_ground_budget_scope`
- `test_symptom_declaration_is_recorded_or_held`
- `test_uncertainty_does_not_record_word_khong_as_substance`
- `test_unknown_additional_substance_keeps_obligation`


## Artifacts, ownership and next action

- Frozen synthetic corpus and authoring source: `qa/chat/guided_blind_v3.jsonl`, `qa/chat/build_blind_v3.py`.
- Sole first-run evidence: `qa/chat/u5c_first_run.json`; freeze and score provenance commits above.
- Review/fuzz/mutation/timing/growth evidence: `qa/chat/u5c_*.json`; reusable offline harnesses `review_u5c.py`, `diff_probes_u5c.py`, `timing_u5c.py`, `extra_review_u5c.py`.
- Honest regression assertions: `backend/tests/chat/test_u5c_regressions.py` (all current known failures visible).
- Root-suite logs: `qa/chat/u5c_backend_baseline.txt`, `u5c_backend_final.txt`, `u5c_backend_gate.txt`.
- Reviewer/coordinator: **Claude** via Orca; independent evaluation by Codex. No push, deploy or production fixes. The required follow-on is owner fixes, independent review and a green complete backend suite; a genuinely final-engine blind measurement would need another unseen set/evaluator after engine freeze.
