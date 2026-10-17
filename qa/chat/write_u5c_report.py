"""Assemble review evidence from saved results; never invokes the engine/evaluator."""
import json
from collections import defaultdict
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
def read(name):
    return json.loads((ROOT/f'qa/chat/u5c_{name}.json').read_text(encoding='utf8'))
def cell(s):
    return str(s).replace('|','\\|').replace('\n',' ')
def table(headers,rows):
    return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |',
                      *('| '+' | '.join(cell(c) for c in row)+' |' for row in rows)])+'\n'
def log(name):
    b=(ROOT/f'qa/chat/u5c_backend_{name}.txt').read_bytes()
    return b.decode('utf16' if b.startswith(b'\xff\xfe') else 'utf8')

path=ROOT/'docs/reports/CODEX_U5C.md'
prefix=path.read_text(encoding='utf8').split('\n## Evaluation interpretation')[0]
prefix=prefix.replace('Evaluation and gate evidence pending.','')
first=read('first_run')[0]
review=read('review')
extra=read('extra_review')
mut=read('mutations')
timing=read('timing_isolation')
out=[prefix]
out.append('''
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
''')
causes={
 'Fronted named food / cue': ['041','051','056'],
 'Symptom phrasing without allergy keyword': ['053','093'],
 'Hard-avoid list / synonym propagation': ['058','060','098'],
 'Conservative hold, named term missing': ['067','095'],
 'Additional unnamed substance not asked': ['068'],
 'Absent-person scope': ['072','073','074'],
 'Hypothetical variant': ['075'],
 'Sarcastic allergy': ['081'],
 'Negated proposition': ['085'],
 'Deferred hard avoidance': ['090'],
 'Vague uncertainty becomes bogus substance': ['099'],
 'Scoped named absence erases unrelated allergy': ['216'],
 'Elliptical addition / correction': ['217','225'],
 'Ambiguous followup ownership correction': ['223'],
}
byid={r['id']:r for r in first['failures']}
follow={r['id']:r for r in review['failure_followups']}
for cause, ids in causes.items():
    out.append('\n### '+cause+'\n\n')
    rows=[]
    for short in ids:
        key='v3-'+short;r=byid[key];trace=follow[key]['trace']
        text=('Prior: '+' / '.join(r['prior'])+' → ' if r.get('prior') else '')+r['text']
        rows.append([key,text,', '.join(r['safety']),json.dumps(r['mismatches'],ensure_ascii=False),
                     f"hold={trace[-3]['unresolved']}; plan={bool(trace[-1]['plan_request'])}"])
    out.append(table(['ID','Synthetic minimal input','Safety events','Frozen expected / observed mismatches','Post-merge diagnostic'],rows))
assert sum(len(x) for x in causes.values())==23

out.append('''
## All blind accuracy failures by slot

Each ID below has that exact slot mismatch; overlap is intentional. Together these groups account for **all 111 cases** failing the all-slot conjunction. Every expected/observed value and input text is preserved in `qa/chat/u5c_first_run.json`; no failures were omitted or repaired after scoring. Budget/scope variants, short durations, spelled-out parties, fronted dishes and run-on language account for many extraction misses; these accuracy failures are not all safety failures.

''')
groups=defaultdict(list)
for row in first['failures']:
    for slot in row.get('mismatches',{}):groups[slot].append(row['id'])
out.append(table(['Slot / cause','Mismatch count','Every failed ID'],[[k,len(v),', '.join(v)] for k,v in groups.items()]))
out.append('''
## Diff review scope, injection and privacy

Reviewed the requested `git diff 595bde8..HEAD -- backend/app tools qa/chat/eval_guided.py` after the freeze and scoring, plus the late `cd5f669..HEAD` delta. Production changes are confined to chat understanding/coverage/merge and the rule safety/extraction parser; there is no tools or evaluator production delta in this range. The late merge adds symptom and concrete-description checks; two extra committed green controls kill disabling either one independently.

No dynamic execution or outbound tool dispatch from user text was introduced. The v3 style/injection cases produced no unconfirmed plan or no-LLM-call violations. Mocked numeric/allergy proposals remain constrained by sanitizer/confirmation tests, but the semantic grounding bypass in Major 6 is an open prompt-proposal path, so no blanket injection-resistance claim is made. A poisoned dataset test remains in the inherited suite; this review does not claim exhaustive prompt-injection coverage or live-provider behavior.

`compact()` exposes only phase, pending kind, known-field **names**, result/shortlist counts and an allergy-presence boolean. Synthetic sentinels placed in tastes, raw history and allergy terms do not appear in compact output. It does not include raw history, coordinates, addresses, venue names or free text field values. Raw current user text is still supplied separately to an optional LLM callable; the compact privacy result does not imply that the provider receives no user message. No personal chat/location history is in this report.

Primary growth probes: 2000 repeated allergy/nonanswer turns leave turns=8, allergies=1 and conflicts=0; a separate 1000-nudge session leaves turns=8 and asked=20. Conflict persistence is capped at eight and covered by committed inherited tests and the mutations. Fuzz peaks below are not long-run bounds; the venue-confirmation exception is explicitly recorded above. No new secrets, datasets or private venue identifiers were used; `CHT-*` identifiers refer only to committed synthetic fixtures.

## Seeded fuzz evidence

Seed **5172026**, **3000 sequences per mode**, 1–6 turns per sequence, original committed synthetic/dev corpus plus random structured actions, JSON persistence between turns. The three modes are raw engine actions, API-schema-valid actions, and API-valid actions with randomized mocked provider failures. They are not Gemini calls. All planning checks exercise the reducer's `plan_request` gate; they do not execute live routes or establish planner-tour feasibility.

''')
fuzzrows=[]
for name in ['raw','valid','mixed']:
    r=read('fuzz_'+name)
    fuzzrows.append([name,r['sequences'],r['turns'],r['plan_requests'],r['llm_calls'],
                     len(r['failures']),r['failure_counts'].get('api_rejected_inputs',0),json.dumps(r['max_list_lengths'])])
out.append(table(['Mode','Sequences','Turns','Plan requests','Mock calls','Invariant violations','Expected schema rejects','Observed list peaks'],fuzzrows))
out.append('''
Total **9000 sequences / 31380 turns / 96 plan requests / 364 mocked provider calls**, zero checked invariant violations or exceptions. Numeric ranges, no plan without confirmation, open-obligation rejection, single clarification, call bounds, options and list peaks are checked by the committed harness. The expected 367/366 schema rejections in valid/mixed modes are input validation observations, not invariant failures. The fuzz assertions do not know the human semantics of every random message; therefore zero fuzz violations cannot override the blind or targeted semantic failures.

## Mutation evidence

All **15/15 mutations killed**, zero test errors. Seven original mutations run 61 committed existing tests each; six additional guard/grounding mutations run a separate 77-test baseline-green suite; the two late-merge mutations run six committed green controls each. Both control baselines pass. Newly failing blind regressions are excluded from all mutation baselines so they cannot falsely count as kills. Failure counts can exceed methods because unittest records failing subtests separately. Full failing test IDs/output are preserved in `u5c_mutations.json` and `u5c_extra_review.json`.

''')
rows=[]
for r in [*mut['mutations'],*extra['mutations']]:
    rows.append([r['mutation'],r['tests_run'],len(r['failures']),len(r['errors']),r['failures'][0] if r['failures'] else 'SURVIVED'])
out.append(table(['Mutation','Methods run','Failing assertions/subtests','Errors','Example committed killing test'],rows))
out.append('''
## Timing details

The requested 1000-character inputs are actual 1000-character strings, including the prefix; there are 30 full-engine samples per input in `u5c_review.json`. The regex isolation uses three samples per point and changes only the absent-person guard in memory, never tracked production files.

''')
out.append(table(['Characters','Variant','Median ms','Maximum ms'],[[r['chars'],r['variant'],r['median_ms'],r['max_ms']] for r in timing]))
out.append('''
## Backend gate and test honesty

Commands run from the repository root using the existing interpreter, without dependency upgrades:

```powershell
$env:PYTHONPATH='backend'
.venv/Scripts/python.exe -m unittest discover -s backend/tests -t backend
```

Inherited pre-regression gate on `cd5f669`: **510 tests in 102.704s, OK (skipped=1)** (`u5c_backend_baseline.txt`). After the late merge plus initial independent regression commit: **532 tests in 96.815s, FAILED (failures=15, skipped=1)** (`u5c_backend_final.txt`). The last gate includes all new tests and final review additions:

```text
''')
gate=log('gate')
start=gate.rfind('Ran ')
out.append(gate[start:].strip()+'\n```\n')
out.append('''
The failures are intentional **required-behavior assertions**, not skips, `expectedFailure`, altered production behavior or a claim that the suite passed. Engine fixes are explicitly forbidden for this evaluation task. The full-suite pass requirement is therefore **not met**; this is gate evidence supporting REQUEST-CHANGES, not a reason to hide regressions. The existing skip remains outside this task, and live DB/provider functionality is not established by offline mocks.

Final failing regression methods:

''')
import re
fails=re.findall(r'^FAIL: (test_\S+)',gate,re.M)
out.extend('- `'+x+'`\n' for x in fails)
out.append('''

## Artifacts, ownership and next action

- Frozen synthetic corpus and authoring source: `qa/chat/guided_blind_v3.jsonl`, `qa/chat/build_blind_v3.py`.
- Sole first-run evidence: `qa/chat/u5c_first_run.json`; freeze and score provenance commits above.
- Review/fuzz/mutation/timing/growth evidence: `qa/chat/u5c_*.json`; reusable offline harnesses `review_u5c.py`, `diff_probes_u5c.py`, `timing_u5c.py`, `extra_review_u5c.py`.
- Honest regression assertions: `backend/tests/chat/test_u5c_regressions.py` (all current known failures visible).
- Root-suite logs: `qa/chat/u5c_backend_baseline.txt`, `u5c_backend_final.txt`, `u5c_backend_gate.txt`.
- Reviewer/coordinator: **Claude** via Orca; independent evaluation by Codex. No push, deploy or production fixes. The required follow-on is owner fixes, independent review and a green complete backend suite; a genuinely final-engine blind measurement would need another unseen set/evaluator after engine freeze.
''')
path.write_bytes(''.join(out).replace('\r\n','\n').encode('utf8'))
print('Wrote',path,'with',len(fails),'failing gate methods')
