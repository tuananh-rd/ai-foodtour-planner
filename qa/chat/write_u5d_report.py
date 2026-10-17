"""Assemble evidence without evaluating the held-out dataset again."""
import json
from pathlib import Path
from collections import defaultdict
R=Path(__file__).resolve().parents[2]
def read(name):
    tag='' if name=='first_run' else 'postmerge_'
    return json.loads((R/f'qa/chat/u5d_{tag}{name}.json').read_text(encoding='utf8'))
report=R/'docs/reports/CODEX_U5D.md'
receipt=report.read_text(encoding='utf8').split('\n## Verdict')[0]
receipt=receipt.replace('\n`json\n','\n```json\n').replace('\n`\n','\n```\n')
out=[receipt,'''\n## Verdict

**REQUEST-CHANGES.** Open blocker: unrelated absent-person declarations erase a present child's allergy and permit a plan. Other confirmed major findings permit plans with a missed, invented, or unresolved allergy. No production changes were made; reviewer/integrator is Claude. The evaluation task is complete even though the engine fails acceptance.

## Confirmed findings and minimal reproductions

For all ready-state reproductions, construct `ready(new_engine())` from `qa/chat/adversarial_guided.py` (synthetic area, 180 minutes, walking, one synthetic shortlisted venue), send each quoted message in order, then actions `request_plan`, `confirm_yes`. Every listed failing regression is committed in `backend/tests/chat/test_u5d_review.py` without skip/xfail. The full JSON traces are in `qa/chat/u5d_review.json`; these diagnostic followups are not a second score.

| Severity | Finding | Minimal messages / actual result | Regression |
|---|---|---|---|
| BLOCKER | Third-party identity is a single `who=other` bit; absence clears all companions | `Con tôi dị ứng vừng, cháu đi cùng.` → `Đồng nghiệp tôi không đi.` → empty allergies, unresolved=false, planned | `test_absent_colleague_cannot_clear_present_child` |
| BLOCKER | Global absence predicate drops unrelated third-party sentences | `Con tôi dị ứng vừng. Ông bà không đi.` → empty allergies, unresolved=false, planned | `test_absent_grandparents_cannot_drop_present_child_sentence` |
| MAJOR | Unknown substance becomes a concrete allergy rather than an obligation | `Tôi có dị ứng thực phẩm mà chưa rõ thủ phạm.` → allergy `thực phẩm`, no hold, planned | `test_unnamed_food_cannot_be_concrete_allergy` |
| MAJOR | Another person's unnamed allergy becomes invented text | `Mình dị ứng hạt điều và bạn có dị ứng chưa chẩn đoán.` → `hạt điều`, `chưa chẩn đoán`, no hold, planned | `test_unnamed_extra_cannot_be_concrete_allergy` |
| MAJOR | Symptom scan mistakes Southern particle `hen` for an allergen and loses shrimp | `Tôm khô ăn vào là nổi mề đay hen.` → allergy `hen`, no hold, planned | `test_southern_hen_not_mussel` |
| MAJOR | Bare conditional is not recognized unless it matches question-shaped hypothetical patterns | `Nếu dị ứng bột mì thì hỏi sau; hiện tôi dị ứng hạt điều.` → invented `bột mì` alongside `hạt điều`, planned | `test_hypothetical_first_clause_not_invented` |
| MAJOR | Uncertainty vocabulary misses `chưa chắc` | `Tui chưa chắc dị ứng hạt điều hay sữa bò.` → concrete `sữa`, no hold, planned | `test_uncertain_cashew_or_milk_held` |

The two person-identity findings are introduced by the reviewed absent-person changes. The new symptom path causes the `hen` substitution. The remaining findings expose uncovered wording in the expanded safety paths; this report does not claim each was newly introduced without a historical runtime comparison. Plan emission means the planning request gate proceeded; this is not a claim that a provider-backed or verified-safe itinerary was produced.

## Interpretation of frozen numbers

The raw evaluator reports 47 distinct safety-failing cases per mode, with overlapping counters: 29 missing, 28 false positives, 17 unasked cues. These counters are **not** 74 independent unsafe plans. Exact term scoring treats `sữa bò`→`sữa`, `tôm khô`→`tôm`, and `hải sản có vỏ`→`hải sản` as both missing and invented; those often preserve or broaden a relevant family. They are retained verbatim rather than silently normalized after observation. Fronted unknown cashew cases that ask an allergy question are safe holds despite the exact-extraction miss.

Gold limitations discovered after freeze: v4-209/210 expect an ambiguous hold for zero-width spelling, but normalization correctly recovers explicit vừng. v4-140 expects party_size=None after a prior message explicitly said two people; state retention is correct. Several explicitly hypothetical, quoted, joking, or absent-person examples use deliberately conservative ask expectations: a nonacting reply can be safe even without opening the precise `allergy_term` obligation. The 78.636% is the frozen **scorer invariant** result, not a calibrated estimate of medical safety. No corrected score or second blind run is substituted. New failures and gold issues make v4 a DEV set after this receipt.

The set uses 22 new one-shot structures crossed with four dishes, so observations are correlated. Cases are synthetic author judgments, not a random population sample; no confidence interval is claimed. The inherited evaluator checks positive interests, but has no dislike-output slot, so these 22 preference cases cannot fully establish dislike accuracy. `outcome_exhausted` received a local exhausted stub but triggered zero calls on this corpus; this score does not exercise a live or exhausted Gemini provider. Mixed-provider fuzz separately exercised local error outcomes.

## Gate evidence

From repository root: `.venv/Scripts/python.exe -X utf8 -m unittest discover -s backend/tests -t backend` ran **552 tests**, **7 confirmed finding failures**, **1 pre-existing skip** (private CSV not configured). The 538 inherited tests introduce no additional failures under that command; 7 new green mutation controls pass and 7 finding regressions fail honestly. Full output: `qa/chat/u5d_backend_final.txt`. Thus the backend acceptance gate is RED, under the task's explicit allowance for committed confirmed findings.

A broader preliminary command, `-m unittest discover -s backend -p test*.py`, ran 543 tests before U5d tests existed, with one failure in legacy `backend/test_planner.py::test_budget_and_source` and one skip (`qa/chat/u5d_backend_baseline.txt`). That legacy test assumes private Foody-backed stops/source URLs and is outside the canonical 538-test suite; no private data was configured to make it green. No new test is skipped or marked expected failure.

## Diff review, privacy, provenance, and growth

Reviewed `git diff 1bb36f4..HEAD -- backend/app qa/live tools` only after freeze and first-run numbers. Production changes are in chat coverage/engine/state/understand, LLM safety parsing/extraction, and allergen family mapping; no qa/live or tools changes in that range. The previous cubic absent-person regex is replaced by sentence processing, but scope/identity remains unsafe as above. Existing obligation checks themselves held across seeded fuzz; language extraction can erase or fail to create the obligation before that gate.

`compact()` contains phase, pending kind, names of known slots, result/shortlist counts, and a has-allergy boolean. Injected synthetic names, message text, and allergy sentinels did not leak. Grounding probes preserve user-clock provenance, discard invented group scope and time, mark model tastes `ai` and unconfirmed, mark proposed allergies `ai_unconfirmed`, and block planning until confirmation; full traces are in the review JSON. Existing prompt-injection refusals and local malformed action checks produced no bypass in fuzz; this is offline coverage, not a live model jailbreak claim.
''']
review=read('review');extra=read('extra')
out.append('Observed growth after 2000 turns: `'+json.dumps(review['growth_2000'])+'`. After 1000 venue confirmations: `'+json.dumps(extra['confirmations'])+'` (deduplicated both live and persisted). After 1000 nonanswer nudges: `'+json.dumps(extra['nudge_1000'])+'`. Persistence caps conflicts at eight; inherited tests cover conflicts. No unbounded growth observed in these probes.\n')
out.append('\n## Seeded fuzz\n\nSeed 5172026; original action/text generator retained for comparability, including older DEV text. API-rejected malformed generated actions are counted separately and replaced as documented by the inherited harness. This is why clean fuzz does not invalidate the fresh-language findings.\n\n| Mode | Sequences | Turns | Plans | Stub calls | API rejects | Invariant failures |\n|---|---:|---:|---:|---:|---:|---|')
for mode in ['raw','valid','mixed']:
    f=read('fuzz_'+mode);counts=f['failure_counts'].copy();rejects=counts.pop('api_rejected_inputs',0)
    out.append(f"| {mode} | {f['sequences']} | {f['turns']} | {f['plan_requests']} | {f['llm_calls']} | {rejects} | {json.dumps(counts)} |")
out.append('\n## Mutation evidence\n\nAll mutation controls were committed before execution. Known-red U5d finding tests are excluded, so they cannot falsely kill a mutant. Baseline-green inherited and U5d controls are used; each row names committed failure tests. A harness-only missing `re` import interrupted the first attempt before saving results, was corrected, committed, and rerun; no corpus rescoring occurred.\n\n| Mutant | Tests | Result | Committed killing tests |\n|---|---:|---|---|')
if (R/'qa/chat/u5d_postmerge_mutations.json').exists():
    mut=read('mutations');rs=mut['mutations']+extra['mutations']
    for m in rs:
        state='KILLED' if m['failures'] else 'SURVIVED' if not m['errors'] else 'ERROR (not kill)'
        out.append(f"| {m['mutation']} | {m['tests_run']} | {state} | "+'<br>'.join(m['failures']+m['errors'])+' |')
    out.append('\nThe original `one_clarify` mutation changes intermediate handlers; the newer `_finish` guard can mask it. A separate `final_one_question` mutant removes that final guard and is tested behaviorally. Surviving prior mutants, if any, remain explicitly visible and prevent a claim that every requested mutant was killed.\n')
else: out.append('Mutation run still pending.\n')
out.append('\n## Timing evidence\n\n`u5d_timing_final.json` records each actual assembled runtime pattern and module-level compiled regex (310 entries), with maximum milliseconds at 250/500/1000/2000 characters over 17 adversarial cue families, including repeated allergy/absence/conditional/uncertainty cues, whitespace, tags, numbers, and correction near-misses. It covers new parse_slots expressions, hypothetical splitting, third-party/absence patterns, symptom/uncertainty/unnamed patterns, dish scanning, and LLM grounding; this is dynamic branch coverage, not a proof against all regex inputs. Raw earlier timing passes are retained.\n\nThe standalone stress table intentionally uses full `finditer` for every pattern, even patterns used as anchored `match` in production; it can overstate reachable cost and must not be mistaken for end-to-end latency. End-to-end medians below use the actual engine and three samples per prefix/length, including normalization and short-circuit behavior.\n\n| Repeated input | 250 chars ms | 500 chars ms | 1000 chars ms | 2000 chars ms |\n|---|---:|---:|---:|---:|')
if (R/'qa/chat/u5d_postmerge_timing_final.json').exists():
    timing=read('timing_final');by=defaultdict(dict)
    for row in timing['engine']: by[row['prefix']][row['chars']]=row['median_ms']
    for cue,vals in by.items():out.append('| '+repr(cue)+' | '+' | '.join(str(vals[n]) for n in [250,500,1000,2000])+' |')
    out.append('\nLargest standalone regex stress values (ms; full per-pattern timing table is in JSON):\n\n| Pattern | 250 | 500 | 1000 | 2000 |\n|---|---:|---:|---:|---:|')
    for row in sorted(timing['regexes'],key=lambda x:x['times'][-1]['max_ms'],reverse=True)[:8]:
        out.append('| `'+row['pattern'].replace('|','&#124;')+'` | '+' | '.join(str(t['max_ms']) for t in row['times'])+' |')
else: out.append('Final timing run pending.\n')
out.append('\n## Every frozen failure, grouped by observable cause\n\nBoth modes have identical failed cases and mismatches, so rows below appear once. For a minimal cold-state reproduction, call `new_engine().handle(ChatState(), Preferences(), text=sentence)`; when prior turns appear, send those first carrying returned state/preferences. Numeric mismatches, day-part gaps, and dish vocabulary/truncation are accuracy failures separate from allergy invariants. For safety-state effects add the ready-state request/confirm sequence above; all 47 traces are retained in review JSON.\n')
groups=defaultdict(list)
for row in read('first_run')[0]['failures']:
    safety=row['safety'];mm=row.get('mismatches',{})
    if safety: cause='Safety: '+', '.join(safety)
    elif set(mm)<= {'interests'}: cause='Accuracy: dish vocabulary / interest extraction'
    elif 'day_part' in mm: cause='Accuracy: day-part vocabulary, sometimes with other slots'
    else:cause='Accuracy: numeric / retained prior slots / extra obligation'
    groups[cause].append(row)
for cause,rows in groups.items():
    out.append('\n### '+cause+' ('+str(len(rows))+')\n\n| Case | Sentence (minimal text repro) | Prior turns | Expected → actual |\n|---|---|---|---|')
    for row in rows:
        esc=lambda v:json.dumps(v,ensure_ascii=False).replace('|','&#124;').replace('\n',' ')
        out.append('| '+row['id']+' | '+esc(row['text'])+' | '+esc(row.get('prior',[]))+' | '+esc(row.get('mismatches',{}))+' |')
out.append('\n## Reproduction commands and limits\n\nFirst-run scoring used `eval_guided.evaluate(mode, load_cases(Path("qa/chat/guided_blind_v4.jsonl")))` once each for rules and outcome_exhausted; the CLI defaults to v1/failed_provider, so it was deliberately not used to mislabel this measurement. Output-file existence was checked before writing. Do not rerun or overwrite `u5d_first_run.json`. Diagnostics: `qa/chat/review_u5d.py review`, `raw`, `valid`, `mixed`, `timing`; mutations: `qa/chat/mutations_u5d.py` and `qa/chat/extra_u5d.py`. Evidence scripts use local synthetic fixtures and in-process provider stubs. No live Gemini calls, remote publishing, servers, keys, .env, or private CSV were used. DB/live provider validation was not attempted. The present verdict requires fixes and independent review; it does not authorize a self-approved merge.\n')
late=read('late')
out.append('''\n## Coordinator-requested late merge: separate review revision

The frozen first run remains on `0dde2116c6d5d2421000bb3afa90c158e081b350`. After coordinator delivery `msg_d07d24a3d243`, merged production revision **66326402fe56a9e1bd7351ea36c0347fef44396f** in merge commit `c4a17599ea7e7b4e176f3080f0a6f1e015156b1a`. All STEP 3 evidence was repeated against that production revision, using `U5D_EVIDENCE_TAG=postmerge_` so original evidence is preserved. The tables above use the **postmerge** JSON for fuzz/mutations/timing/privacy/growth/ready-state diagnostics, while frozen numbers/failure sentences remain original. The baseline 552-test gate paragraph above describes the original engine; the final postmerge gate receipt below supersedes it for final acceptance. No second v4 score was run.

Reviewed the additional engine stale-pending cleanup ordering, `_answer` free-text filter, low-confidence/no obligation handling, and `routes.py` visit-minute application. Existing semantic findings remain. New major repro in the late revision: `Tôi dị ứng một thứ chưa rõ.` → `lên đường` → actions `request_plan`, `confirm_yes` stores `lên đường` as a concrete allergy, clears unresolved, and emits a plan. `duyệt luôn`, `go ahead`, `tiến hành`, and `được nha` have the same result (full traces in `qa/chat/u5d_postmerge_late.json`). Committed failing test `ConfirmedFindings.test_command_answer_cannot_resolve_unknown_allergy` preserves this finding. This shows the command denylist blocks the specific fixed phrase but still accepts other commands as an unnamed substance.

MINOR: `_to_prefs` retains a previously inferred 34-minute visit when the duration changes from 120 to 240 minutes; `_visit_minutes` then returns None and the summary omits that assumption. The API hook applies only bounded integer values (20..45), and real selected-tour planning still checks actual routing/time constraints; no fabricated route or ETA is introduced by this hook. The hardcoded eight-minute leg is an internal heuristic for estimating a visit, not verified walking evidence. The stale assumption should be reconciled with displayed summary state. Probe trace:
''')
out.append('Postmerge mutation totals: **21 killed, 1 survived, 0 errors** across 22 mutants (including the two supplementary model guards). The survivor is the old intermediate `one_clarify` mutant masked by the newer final guard; the behavioral final-guard mutant is killed. Therefore the literal requirement that every prior mutant be killed is not met, and no all-mutants-killed claim is made. Post-freeze corpus integrity check: 220 unique texts, zero exact sentence overlaps with v1/v2/v3, longest input 846 characters. Timing was measured while local tests/fuzz could contend for CPU; measurements are observed costs, not an isolated benchmark or complexity proof. The previous cubic absent regex is gone; repeated-cue engine growth still deserves profiling (see timing table), and a universal linear-time bound has not been established.\n')
out.append('```json\n'+json.dumps(late['visit_update'],ensure_ascii=False,indent=2)+'\n```')
gate=R/'qa/chat/u5d_postmerge_backend_gate.txt'
if gate.exists():
    blob=gate.read_bytes()
    log=blob.decode('utf16' if blob.startswith((b'\xff\xfe',b'\xfe\xff')) else 'utf8',errors='replace'); lines=log.splitlines()
    receipt_lines=[line for line in lines if line.startswith(('Ran ','FAILED (','OK','FAIL:','ERROR:'))]
    out.append('\nFinal postmerge gate, canonical command from repository root:\n```text\n'+'\n'.join(receipt_lines)+'\n```\nFull log: `qa/chat/u5d_postmerge_backend_gate.txt`. The one skip remains the pre-existing unconfigured private CSV check. New confirmed regressions are neither skipped nor xfailed.')
text='\n'.join(out).replace('First-run results pending.','')
text=text.replace('`u5d_timing_final.json`','`u5d_postmerge_timing_final.json`')
text=text.replace('in `qa/chat/u5d_review.json`','in `qa/chat/u5d_postmerge_review.json`')
report.write_text(text,encoding='utf8')
print('report written')
