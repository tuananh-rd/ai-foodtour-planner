"""Append analysis to the preserved one-shot stdout; reads artifacts, never evaluates v2."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def read(name):
    return json.loads((ROOT/'qa/chat'/name).read_text(encoding='utf8'))

report = ROOT/'docs/reports/CODEX_U5A2.md'
original = report.read_text(encoding='utf8').split('\n## Verdict')[0]
lines = [original, '''
## Verdict

**REQUEST-CHANGES.** Held-out v2 meets its measured safety gate in rules and exhausted-provider modes (also literal-None robustness), but fresh probes expose an allergy-deletion blocker and open major safety/grounding gaps. No production fix, gold-label edit, server, live Gemini call, key access, private CSV access, push, deployment, or publishing was performed. Claude is the fix author and required cross-reviewer; Antigravity still owns independent integration acceptance.

The baseline was merged first with `git merge foodtour-claude-coordinator`, fast-forwarding to `364eb7e` (contains `de95f98`). Read the original report and `git diff 8b8467a..HEAD -- backend/app tools qa/chat/eval_guided.py` before evaluation. The v2 bytes were SHA256-checked before one evaluation in each of rules/`llm=None`, literal-None callable, and contract-valid `Outcome(None,0,'exhausted')`; exact summaries were written above before any follow-up probe or edit. `qa/chat/u5a2_v2.json` retains every mismatch. The exhausted provider has zero charged calls by contract; the corpus does not validate live provider behavior.

## The original 11 findings

| # | Status | Independent confirmation evidence |
| --- | --- | --- |
| 1 deferred-clause safety | FIXED | `u5a2_targeted.json`: deferred shrimp is recorded; request/confirm preserves it. A second allergy after a deferred clause is also captured in `u5a2_hunt.json`. Raw-safety mutant killed by committed f1. |
| 2 additional unresolved cue | PARTIAL | Original repeated `dị ứng` now sets unresolved and blocks request/confirm. `Tôi dị ứng tôm và một chất khác` still leaves unresolved=false and permits planning. |
| 3 aversion, vague cues, typo | FIXED | All frozen v1 cases pass safety. Named major allergens with `không ăn được/kiêng` recorded; vague descriptions prompt allergy_term; `di ứng` captures shrimp. Non-allergen phở/beef remain aversions. Broader `ghét` promotion is a new regression below. |
| 4 false-positive/vague allergy | PARTIAL | Original `Nếu ... thì sao?` records nothing; `thứ rang giòn` remains unresolved. Other hypothetical advice and absent-relative statements still create allergies. |
| 5 explicit absence | PARTIAL | Exact global absence clears prior peanut and emits allergy_cleared. Named shrimp absence incorrectly clears prior peanut too (new blocker). |
| 6 conflict persistence | FIXED | Independent repeated conflicting provider: peak=5, reload=5; explicit 8-entry reload test passes. Bound in from_json=8. |
| 7 asked growth | FIXED | 600 non-answers: turns=8, asked=20; reload truncates to 20. Other venue-confirmation list growth was not exhaustively loaded. |
| 8 hostile hours | FIXED | `u5a2_targeted.json`: hostile hours display becomes empty. Name/address sanitization remains effective; no browser exploit is claimed. |
| 9 action ranges | FIXED | All three fuzz modes report zero numeric invariant failures; bad direct edit_profile values return invalid_action. API rejection counts are inputs, not engine failures. |
| 10 None provider robustness | FIXED | Rules, literal-None and Outcome-exhausted v1/v2 finish with no exception; committed f10 passes. Outcome is the actual provider contract. |
| 11 provenance/grounding | PARTIAL | Original guessed scope/time dropped; added taste is source=ai, confirmed=false, card status=ai. AI-only shrimp stays ai_unconfirmed and blocks planning until confirmation. Grounding checks only broad cue presence: a start clock admits invented end clock, and total-duration `tổng` admits invented group budget with user provenance. |

## Ranked new or newly exposed findings

Ready state in the following repros is synthetic: Hoàn Kiếm, duration=180, walk, shortlist=[CHT-001]. A returned `plan_request` is an engine handoff, not proof of a feasible final tour; no route, ETA, allergy safety or provider success is inferred.

1. **BLOCKER — named absence erases unrelated allergies (introduced by global-clear fix).** In a ready state send `Tôi dị ứng lạc`, then `Tôi không bị dị ứng tôm` (or `Tôi chưa từng dị ứng tôm`), then request_plan/confirm_yes. Actual: allergies=[], `allergy_cleared`, unresolved=false, plan_request returned. Expected: peanut remains; absence of shrimp cannot retract peanut. `_understand` turns any negated allergy into no_allergy, and `_do_greet_or_smalltalk` clears the whole list. Tests: `test_named_absence_preserves_unrelated_allergy` (two failing subtests). Evidence: `u5a2_hunt.json`.

2. **MAJOR — unnamed additional substance still dropped (residual original #2).** `Tôi dị ứng tôm và một chất khác` records only shrimp, unresolved=false; request_plan/confirm_yes returns plan_request. Must ask the additional substance before planning. Test: `test_additional_unnamed_substance_blocks_planning`. Evidence: original targeted repro rerun in `u5a2_targeted.json` and hunt.

3. **MAJOR — global hypothetical/sarcasm guard discards adjacent real safety declarations.** `Giả sử bạn dị ứng trứng, còn tôi dị ứng lạc thật` records nothing and no unresolved obligation. The hunt variant `Tôi thích phở, giả sử bạn dị ứng trứng, tôi dị ứng lạc` permits ready-state request/confirm with no allergy. `Tôi dị ứng lạc, đùa thôi là nói về giá, tôi dị ứng tôm thật` similarly drops both declarations. Mixed scope must preserve the explicit real clause or ask; do not silently pass. Test: `test_real_clause_survives_adjacent_hypothetical`. This broad guard predates much of the current fix; newly exposed, not asserted to be wholly newly introduced.

4. **MAJOR — cue presence is insufficient grounding and scope provenance is still wrong.** With deterministic sanitized Outcome patch `{'end_time':'21:00'}`, text `Tour 3 quán quanh Hồ Gươm lúc 19h, mình dị ứng mấy thứ rang giòn` accepts end_time=21:00 (ai/unconfirmed) although only the start clock was stated. With patch `{'budget_scope':'group'}`, text `Tour 3 quán quanh Hồ Gươm tổng 120 phút ngân sách 500k cho 2 người, mình dị ứng mấy thứ rang giòn` accepts scope=group because `tổng` describes duration; budget/card remain source=user_said/status=user. Tests: `test_start_clock_does_not_ground_invented_end_clock`, `test_total_duration_does_not_ground_budget_scope`. `u5a2_grounding.json` also confirms ai_unconfirmed allergy blocks planning; absence of grounding and provenance is the finding, not an AI-allergy gate bypass.

5. **MINOR — allergy promotion exceeds the approved named-aversion policy (introduced).** `Tôi ghét trứng` becomes user_said egg allergy because every sp.avoid term is promoted, including `ghét`. The stated safer policy covers `không ăn được/kiêng`; explicit dislike should remain dislike (or be clarified), not a factual allergy claim. `Tôi không thích sữa` remains an aversion. Test: `test_explicit_dislike_is_not_a_claimed_allergy`.

6. **MINOR — contextual false positives remain.** `Nếu tôi dị ứng trứng thì phải tránh gì?` records egg allergy although it is advice about a hypothetical; `Bạn tôi dị ứng tôm nhưng không đi cùng` records shrimp as tour allergy despite explicitly absent subject. Tests: `test_hypothetical_advice_is_not_an_allergy_declaration`, `test_absent_relative_is_not_a_tour_allergy`. These are conservative false positives, not demonstrated missing-allergy bypasses.

Quote checks: a fully quoted declaration records nothing; `Tôi nói "dị ứng tôm", thực ra tôi dị ứng lạc` keeps only peanut; `Tôi dị ứng "tôm"` becomes unresolved and blocks planning (safe but loses the quoted food). Simple positive/negative clause `Tôi dị ứng lạc nhưng không bị dị ứng tôm` keeps peanut. All hunt strings are synthetic. An initial ad hoc PowerShell stdin attempt corrupted accented literals; that output was discarded and replaced by the UTF-8 source-file runner before interpreting any hunt result. No held-out run was affected.

## Non-blind v1 development-set rerun

These are **NON-BLIND** results after the author saw v1; they are regression evidence, not held-out generalization.

```json''']
lines.extend(json.dumps(x['summary'], ensure_ascii=False) for x in read('u5a2_v1_nonblind.json'))
lines += ['```', '\n## Seeded safety nets\n', '2,500 sequences per mode, seed=5172026, persistence round-trip every turn; no live provider. Tracked invariants include confirmation/obligation gates, at most one clarify/call, numeric bounds and options limits. Fuzz cannot detect an allergy silently omitted from state; targeted tests are essential.\n', '```json']
for name in ['raw', 'valid', 'mixed']:
    data = read(f'u5a2_fuzz_{name}.json')
    lines.append(json.dumps(dict(mode=name, **{k:v for k,v in data.items() if k!='failures'}), ensure_ascii=False))
lines += ['```', '\n`api_rejected_inputs` is not an engine invariant failure. No exception, numeric bound violation, unauthorized plan, plan with represented obligation, multiple clarifies/calls or excess options was reported. Independent probes: privacy sentinel absent from compact(); 600-turn asked bound=20; 5/5 queued conflicts persist. Timing p95 and long-input measurements in `u5a2_probes.json` are local, concurrent-process measurements, not performance guarantees.\n', '## Mutation checks\n', 'Executed initially before adding the new regressions and repeated with the same frozen 55 baseline-green committed methods (test_u0_s0, test_u1_guided, test_u5a_blind_safety, test_utterances); newly exposed failures are excluded from mutation accounting. Process-local monkeypatches only, no production edits. Every mutant has at least one ordinary committed test failure independent of FrozenBlindSafety/corpus subtests. Failure counts include corpus subtests where present; these are not counts of distinct methods. Full traces: `u5a2_mutations.json`.\n', '| Disabled behavior | Result | Failure entries / errors | Ordinary committed detector |', '| --- | --- | ---: | --- |']
for x in read('u5a2_mutations.json'):
    ordinary = [i for i in x['failures'] if 'FrozenBlindSafety' not in i]
    lines.append(f"| {x['mutation']} | {'KILLED' if ordinary else 'SURVIVED'} | {len(x['failures'])} / {len(x['errors'])} | `{ordinary[0] if ordinary else ''}` |")
lines += ['\n## Every v2 failing case grouped by cause\n', 'All three modes have the same 40 failures and zero safety failures. All fail only `interests`: the `Món mình khoái:` / `Mon minh khoai:` phrase is not captured by the preference rules. Each row below applies to all three modes; no label was changed, and no case was removed. Expected interests=[phở, bún chả]; actual=[]. The full synthetic input and pending slot for every mode are retained in `u5a2_v2.json`.\n', '| Case | Synthetic input | Difference |', '| --- | --- | --- |']
for row in read('u5a2_v2.json')[0]['failures']:
    lines.append(f"| {row['id']} | {row['text'].replace('|', '/')} | `{json.dumps(row.get('mismatches',{}), ensure_ascii=False)}` |")
lines += ['\n## Backend suite and change boundary\n', 'Required command from repository root (PowerShell sets PYTHONPATH first):\n', '```text', 'PYTHONPATH=backend .venv/Scripts/python.exe -m unittest discover -s backend/tests -t backend', '```', '\nBASELINE_RESULT_PLACEHOLDER\n', 'FINAL_RESULT_PLACEHOLDER\n', 'Independent tests contain no skip, expectedFailure, allowlist or weakened gold assertions. The green-suite acceptance requirement cannot be met with these exposed failures while obeying the instruction not to fix production code; Claude must remediate them. A failed safety review is not a failed evaluation execution. No frontend/planner/LLM production files were changed. New tests and offline runners/evidence/report are the only authored changes; merge content remains author-owned.']
report.write_text('\n'.join(lines)+'\n', encoding='utf8')

# Raw unittest logs include unrelated synthetic API traces; quote the terminal summary.
import re
for marker, name, label in [
    ('BASELINE_RESULT_PLACEHOLDER', 'u5a2_backend_baseline.txt', 'Merged baseline before new regressions'),
    ('FINAL_RESULT_PLACEHOLDER', 'u5a2_backend_suite.txt', 'Final suite including all 12 independent regression methods'),
]:
    log = ROOT/'qa/chat'/name
    raw = log.read_text(encoding='utf16' if log.read_bytes().startswith(b'\xff\xfe') else 'utf8')
    matches = re.findall(r'Ran \d+ tests in [0-9.]+s|OK \(skipped=\d+\)|FAILED \([^\n\r]+\)', raw)
    if len(matches) >= 2:
        body = report.read_text(encoding='utf8').replace(marker, label+': `'+matches[-2]+'`, `'+matches[-1]+'`. Raw output: `qa/chat/'+name+'`.')
        report.write_text(body, encoding='utf8')
