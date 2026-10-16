# C1-API — Codex backend delivery

2026-10-16. Reviewer: Claude coordinator. Backend delivery commit: see the accompanying Git commit / worker_done receipt. No self-approved merge.

Integrated Claude engine through `239f28b`. **Ran 385 tests in 53.035s**; see `C1_TESTS.txt` for full output and exit status. **Scenarios: 26/26 passed, 90 turns**, all in a live in-process FastAPI app with SQLite and synthetic fixtures; OpenAPI drift check output is `C1_OPENAPI.txt`.

## Implementation

- Feature-gated `/v1/sessions/{id}/chat`, `features.chat_v2`, strict text/action models and the eight-way discriminated reply-block union. Disabled chat yields a standard 404 even for schema-invalid bodies. `venue_count` permits null.
- Each turn authenticates and rate-limits inside `owned()`, checks revision, validates preferences, checks the full response, and commits exactly one revision. Engine failures, invalid outputs and oversized private JSON roll back both memory and SQLite. No user text is logged.
- Private ChatState is stored in a migrated `chat TEXT` column, bounded by 32768 UTF-8 bytes. Old sessions begin with empty state; pending context, shortlist, results and allergies survive restart. Expiry removes chat alongside preferences/tour.
- One ChatEngine cache per dataset snapshot; snapshot replacement rebuilds it. Confirmed planning uses only the selected IDs and fails closed if any selected ID is dropped. Existing render_tour enforces the hard checker. Strict mode, exclusions, allergy and max-leg limits remain enforced.
- Existing tours survive exploration/profile edits with their original preferences, vehicle and selection context saved for restart. This also prevents a prior no_solution from turning into an unconfirmed smaller tour on restart. Only plan_selected may create a chat tour.
- `FOODTOUR_LLM_SESSION_CAP` and `FOODTOUR_LLM_RESERVE` are read at startup and exposed as health-budget extras when a budget exists. `chat_understanding_provider` remains a C5 seam; C1 always passes llm=None and passes exhausted status when the daily budget is exhausted.
- Added `PreferencesSchema.max_leg_min` (strict 3..60, default20) to prevent the existing domain value disappearing during round-trip/persistence; Claude approved and documented this extension in contract v1.8.

## Verification and fail-before

`python docs/reports/c1_verify.py` captures the complete backend suite, OpenAPI check, both scenario files, all prior C0-HF reproductions and fresh parser probes. The new API tests cover feature/auth/input/revision/rate controls, privacy, restart/migration/expiry, state cap and exception rollback for both stores, concurrent requests, snapshot cache changes, exact shortlist confirmation, stale tours, non-walking restart and strict/exclusion conflicts.

`python docs/reports/c1_fail_before.py` exports untouched production commit `3e9423a` with git archive, copies only the new API test file and runs six behavioural tests. **All six fail with route 404**; full output and exit1 are preserved in `C1_FAIL_BEFORE_TESTS.txt`. No historical production files or other worktrees were edited.

## Scenario results

| Scenario | Result | Turns |
|---|---|---|
| CH-01 | PASSED | 2 |
| CH-02 | PASSED | 3 |
| CH-03 | PASSED | 3 |
| CH-04 | PASSED | 6 |
| CH-05 | PASSED | 5 |
| CH-06 | PASSED | 5 |
| CH-07 | PASSED | 1 |
| CH-08 | PASSED | 4 |
| CH-09 | PASSED | 8 |
| CH-10 | PASSED | 3 |
| CH-11 | PASSED | 2 |
| CH-12 | PASSED | 3 |
| ADV-01 | PASSED | 3 |
| ADV-02 | PASSED | 2 |
| ADV-03 | PASSED | 2 |
| ADV-04 | PASSED | 3 |
| ADV-05 | PASSED | 7 |
| ADV-06 | PASSED | 5 |
| ADV-07 | PASSED | 2 |
| ADV-08 | PASSED | 3 |
| ADV-09 | PASSED | 8 |
| ADV-10 | PASSED | 1 |
| ADV-11 | PASSED | 1 |
| ADV-12 | PASSED | 2 |
| ADV-13 | PASSED | 2 |
| ADV-14 | PASSED | 4 |

## Triage and owner fixes

Initial exact synthetic request/response evidence is preserved in `C1_TRIAGE.txt`; final runner evidence is `C1_SCENARIOS.json`. Every issue was sent through Orca and owner fixes merged; Codex did not rewrite chat/LLM/planner modules.

| Failure | Classification and resolution |
|---|---|
| Confirmation summary 500 in CH-09 / ADV-05 / ADV-09 | Engine/contract mismatch: status user_said/ui_form versus user. Claude fixed mapping and regenerated turns. |
| CH-01 false temperature match | Runner bug: folded độ C matched the start of đồ chiên. Word-boundary phrase matching fixed and independently regression-tested. |
| CH-03 unknown comparison value | Engine: unsupported/unknown rating cell contained Ít đánh giá. Claude changed value to Chưa rõ and put explanation in note. |
| ADV-01 repeated unchanged clarification | Engine: Claude now keeps pending and nudges without repeating the clarify block. |
| ADV-04 generic add | Engine: thêm một quán now opens pick_venue rather than a search with no pending. |
| ADV-14 empty-result reference | Engine: stale/empty Thêm A now clarifies. |
| ADV-09 tour after vehicle edit | DSL bug: tour none contradicted explicit dispatch rule; updated to present while retaining stale-notice assertion. Engine lacked notice; Claude fixed phase retention and hard-profile stale notices. |
| plan_selected cleared strict/exclusions | Engine safety gap found during review: Claude preserves all hard prefs and returns insufficient_evidence in strict mode. API validation uses that same approved context; API regressions pass. |

## C0-HF review

Final independent scoped verdict: **ACCEPT** after R3-H1, R3-H2 and R3-M1 owner fixes. The requested Addendum on the latest integrated engine commit is appended to `CODEX_REVIEW_C0HF_3.md`, with every prior exact reproduction and fresh safety_parse probes; original round-3 JSON evidence remains intact and new evidence is `C0HF_C1_PROBES.json`.

## Limits

C5 understanding invocation/admission remains intentionally unwired; there were zero LLM-understanding calls. No paid or live providers, private dataset, new scraping, publishing, frontend edits or dependency upgrades were used. Estimated routing and source-only venue data do not establish verified opening, meal cost or allergy safety; known finite-vocabulary/typo/accent-folding/example-clarification limits are unchanged. Installed Starlette/httpx emits its existing deprecation warning. SQLite remains a local prototype store; no external DB validation is claimed.
