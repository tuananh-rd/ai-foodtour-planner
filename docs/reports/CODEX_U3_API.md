# Codex U3 API delivery

Date: 2026-10-17. Author: Codex. Reviewer: Claude (review and integration pending).
Task `task_44bd88a8963f`, dispatch `ctx_e58f6104c80c`, Run `run_4cd95f8d40ed`.
Initially merged `1fff26f`; subsequently merged Claude's U2 and clarify correction
through `6285b8b`. No chat-engine, planner, LLM, or frontend files were authored
by Codex in this task.

## Changes

- Client config exposes `guided_ui`, default false and dependent on `chat_v2`.
  The cached ChatEngine includes the effective guided flag in its cache key.
- Guided `/chat` returns allow-listed trigger/coverage metadata, calls limited to
  integer 0/1, and bounded nonnegative session counts. Unknown metadata becomes
  null/zero; extra metadata keys never reach the response. Daily status is
  exhausted at remaining <= reserve, low at <= reserve+2, otherwise ok;
  unavailable has zero session counts. Exact top-level daily budget is omitted
  only on guided `/chat`. Legacy `/messages` and flag-off `/chat` retain it.
- OpenAPI describes understood cards and additive clarify fields. Options accept
  eight entries. Unknown block types and keys survive; malformed additive fields
  do not cause a 500. Guided public budget scope is explicitly null when unknown,
  both in `/chat` and session reads; private state serialization is unchanged.
- API checks `obligation_open(result.state)` plus the incoming persisted unresolved
  allergy flag before executing plan or replacement requests. It returns the
  engine reply with a normal revision update and invokes neither planner nor
  replacement logic while blocked. No obligation-specific 409 is introduced.
- Existing private ChatState storage already round-trips allergy_unresolved,
  goal, stops and day_part. SQLite reload and old JSON defaults are tested;
  no migration or changes to state.py were needed.
- Thin ledger_record/ledger_remaining helpers share DailyLLMBudget's SQLite row,
  transactional locking, Pacific-day reset, exhausted status, and environment
  path precedence. App admissions and external smoke accounting see one counter.
  Already-made calls can be recorded beyond the limit; negative/non-integer
  counts and unknown sources are rejected. Durable helpers require a configured
  persisted path and cannot silently create an unrelated memory counter.
- RUNNING documents flags, privacy, status thresholds and ledger usage. The old
  client-config equality regression now includes the approved additive flag.

## Fail-before evidence

The final 16 U3 test methods were run against merged base `1fff26f` by temporarily
substituting only the three owned production files with `git show` bytes, running
the tests in a fresh process, and restoring the implementation in `finally`.
No Git history or engine files were changed. Result: **16 tests, FAILED
(failures=9, errors=9)**; these totals include four failing subcases in the
defence test. Fifteen test methods failed or errored; the golden compatibility
control intentionally passed on the base. Earlier exploratory runs exposed and
corrected test setup issues (SQLite seed writes require a revision increment;
Windows connections require explicit closing); this evidence uses corrected tests.

| Test in tests.api.test_u3_guided | Merged-base observation |
|---|---|
| flag_matrix_and_cache | guided_ui absent (KeyError) |
| guided_wire_and_eight_allergy_options | top-level llm_budget exposed; guided fields absent |
| budget_status_boundaries | turn.llm_budget absent (KeyError) |
| metadata_allowlist_and_malformed_blocks | malformed result returns 500 |
| valid_metadata_strips_extra_keys_and_bounds_counts | trigger_reason absent (KeyError) |
| guided_dialogue_can_plan_after_explicit_resolution | guided pending absent |
| stale_allergy_option_is_not_accepted | unresolved allergy was not recorded by flag-off engine |
| action_sequence_and_reload | edit/request/confirm eventually attempts planning (500 with planner spy) |
| stale_confirm_plan | confirm attempts planning (500 with planner spy) |
| budget_null_scope_then_party_change | public budget.scope missing |
| defence_in_depth_against_engine_plan_and_replace | all four faulty-engine subcases attempt planning (500) |
| private_state_and_old_rows_roundtrip | private fields already persist, but public scope missing |
| flag_off_golden_chat_messages | PASS, unchanged v1.8 compatibility control |
| app_smoke_and_restart_share_atomic_counter | ledger imports absent |
| explicit_db_concurrency_and_overlimit | ledger imports absent |
| reset_exhaustion_and_no_accidental_memory_counter | ledger import absent |

`u3_v18_golden.json` was recorded against those actual base files, using only the
labelled synthetic fixture and an in-memory budget. It compares complete greeting,
clarification and `/messages` structures, including the non-null legacy budget;
these responses contain no nondeterministic IDs or timestamps needing removal.
The recorder is retained alongside the fixture for review, not run during tests.

## Verification

Commands run from the repository root with the existing virtual environment:

```powershell
$env:PYTHONPATH='backend'
.venv/Scripts/python.exe -m unittest tests.api.test_u3_guided -v
.venv/Scripts/python.exe -m unittest discover -s backend/tests -t backend
.venv/Scripts/python.exe tools/export_openapi.py --check
git diff --check
```

- Focused U3 tests: **16, OK** after merging `6285b8b`.
- Full backend gate: **482 tests, OK (skipped=1)**, 115.388 seconds, exit 0.
  U0 S0 contributes 20 tests and U1 guided contributes 22; an explicit combined
  check also passed all 42. The existing optional-data skip remains disclosed.
- OpenAPI export/drift check: **matches server schema**, exit 0.
- `git diff --check`: clean. Tracked `.env`/CSV count: **0**; tracked
  Google/OpenAI credential/private-key pattern matches: **0** (filenames/counts
  only; no credential values or forbidden data were read or printed).
- All provider tests use local stubs; no live Gemini call, Maps call, credential inspection,
  .env read, private CSV read, dev-server interaction, remote publishing or push.

## Findings for Claude and limits

1. The original engine emitted eight allergy options but omitted slot/free_text.
   Reported through Orca and resolved by Claude in `6285b8b`. Claude explicitly
   amended the contract: separate `chips` is dropped; options are the chips.
   API performs pass-through without synthesizing pending data into blocks.
2. Exact S0 with the synthetic fixture and 120-minute duration truthfully produces
   plan_conflict rather than silently dropping a selected venue. A separate
   success test uses an explicit 240-minute request, follows scope/time/vehicle/
   proposal/confirmation, reloads, and returns a checked tour. This is fixture
   feasibility evidence, not a claim about real venues or live routing.
3. Unknown reply extensions deliberately pass through as requested. Fixed turn
   metadata is a separate allow-listed boundary; public chat still omits private
   pending context, history, goal and unresolved-allergy bookkeeping.
4. QA must use the app's actual persisted budget path and daily limit and must
   not double-record an app call already counted by admit(). Source is validated
   as app/smoke; it does not create a second source-specific counter.
5. No browser/mobile acceptance or live DB/provider validation is claimed.
   Antigravity owns independent integration QA; Claude must review this commit
   before integration. No self-approved merge or deployment is requested.
