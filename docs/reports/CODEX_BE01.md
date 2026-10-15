# BE-01: contract API wiring and preserved legacy boundary

2026-10-15. Author: Codex. Reviewer: Claude; no self-approved integration.
Task task_7634f8a41b2b / dispatch ctx_4e1639c9fd30.

## Delivered

main.py now composes the app, error handlers, repositories and CORS. Legacy
PlanRequest, plan and load remain re-exported from app.main; their function bodies
were moved unchanged into app/api/legacy.py (only ROOT depth changes to keep the
same repository-root path). Legacy GET /v1/venues keeps raw items and reads the
same default file; legacy POST /v1/plans keeps response keys, calculations,
warnings and HTTP statuses. Legacy load intentionally does not adopt the new
fallback/configuration behavior. backend/test_planner.py is untouched.

New session endpoints use the DATA-01 loader and Claude planner/LLM modules.
Read-only VenueRepository reuses snapshots by dataset_version/source with an LRU
bound of four. Each access still invokes the loader to detect changed content;
this is object reuse, not a claim that parsing is eliminated. Current planning
uses the selected snapshot; replacement pins the original tour's snapshot so it
cannot mix versions. No private data was read for this task's API tests or copied.

- GET /health preserves status/dataset_loaded and adds llm, routing,
  dataset_source and dataset_version. Synthetic fallback counts as loaded and is
  explicitly labeled; private loader CSV/JSON sources map to public `private`.
- GET /v1/venues/{venue_id} returns source-backed fields, price semantics/evidence,
  unknown hours and synthetic/version metadata. Unknown identity is 404 no_candidates.
- POST /v1/sessions returns only session_id/token/revision=0. Tokens and session IDs
  use secrets.token_urlsafe; only SHA-256 token digests remain in memory.
- messages validates bounded text, extracts/merges against that session only,
  validates slots again, asks for missing slots and plans only when required slots
  are present and no extracted constraint was rejected. Notes include approximate
  anchor and rejected-input disclosures. Rejected constraints never silently
  generate a new tour with old values.
- preferences replaces the structured preference document and invalidates any old
  tour. tour explicitly plans; replace preserves other stop identities/order/locks.
  These three routes require base_revision, returning 409 revision_conflict when stale.
- Every tour is passed through validate_tour before serialization/commit and
  explain() is called only after validation. Failures return internal_validation_failed
  with no stops or mutation. Replacement also independently checks prior identities,
  positions and lock claims. Midnight clocks outside 00:00..23:59 fail defensively.
- StraightLineEstimator is the only route source, labeled straight_line_estimate;
  loader price evidence remains estimate and hours remain unknown. Strict mode
  therefore returns insufficient_evidence rather than verified success.
- All errors use the contract error envelope. Validation details omit request input,
  and unexpected errors expose no stack, private text, credentials or venue data.

Sessions expire 3,600 seconds after creation, with at most 256 active sessions.
Capacity exhaustion is 429; expired records become at most 256 hash-only tombstones
so a matching expired owner receives 410 session_expired. Older evicted tombstones
receive unauthorized_session. Missing tokens return 401; wrong/unknown tokens
return 403 before expiry information is exposed. Authenticated operations permit
60 requests per token per 60-second fixed window. Rejected operations also count.
One RLock serializes authenticated operations and commits, including message calls
whose contract has no base_revision. No message history is stored. Tokens are
returned only at creation, never inside the session wrapper.

## Approved contract decisions and cross-review

Started with `git merge foodtour-claude-coordinator`: fast-forward 4d3fa1b..f601bef.
Later explicitly merged coordinator fixes through 464a0de, 7a5cbd8, 0aebd7f and
03b674c and 36b79da; all were merge-only fast-forwards, with no rebase/force/reset.

Orca ask msg_9f40a90d6926 approved the common mutation wrapper, serialized messages,
409 no_candidates for failed replacement without mutation, 503 provider_unavailable
for unavailable extraction, legacy list preservation, v1 venue detail, metadata,
and fail-closed checks. Claude updated contracts/v1/CONTRACT.md v1.1. Subsequent
Orca replies approved private/synthetic source mapping, no artificial structured
budget cap, midnight rejection, notes and search-pool assumptions.

The common wrapper is preferences/missing_slots/questions/tour/revision plus
dataset_source/dataset_version/notes. Tour.revision matches wrapper revision.
Tour.assumptions carries pool_truncated/search_pool/eligible_total when supplied by
the planner. POST /v1/sessions remains exactly its three creation fields.

Independent findings, evidence, suggested fixes and disposition are in
CODEX_REVIEW_PLANNER.md. Claude repaired their owned modules; Codex never edited
planner/, llm/, or their tests. A capped nearest-candidate search remains incomplete
but now reports its bound; no global optimality/feasibility-completeness claim is made.

## OpenAPI export and drift

Only generated contracts/v1/openapi.json was added; the contract Markdown and
fixtures were not edited by Codex. The additive script imports a fresh app without
reading a dataset, exports sorted UTF-8 JSON, and can check without writing.

Commands from repository root using existing Python 3.14.4 .venv:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
./.venv/Scripts/python.exe tools/export_openapi.py
./.venv/Scripts/python.exe tools/export_openapi.py --check
```

Actual output, both exit 0:

```text
Exported contracts/v1/openapi.json
OpenAPI matches server schema
```

API drift unittest also compares the generated schema with the versioned file.
No dependency was added, installed or upgraded in BE-01.

## Actual test evidence

From backend/:

```powershell
$env:PYTHONPATH='.'
$env:PYTHONDONTWRITEBYTECODE='1'
../.venv/Scripts/python.exe -m unittest discover -s tests -t .
Write-Output "contract_tests_exit=$LASTEXITCODE"
../.venv/Scripts/python.exe -m unittest discover
Write-Output "all_discovery_exit=$LASTEXITCODE"
```

Final real output (absolute traceback prefix shortened):

```text
StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
........................................................................
----------------------------------------------------------------------
Ran 72 tests in 1.680s

OK
contract_tests_exit=0

StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
F............................................................................
======================================================================
FAIL: test_budget_and_source (test_planner.PlannerTests.test_budget_and_source)
----------------------------------------------------------------------
Traceback (most recent call last):
  File ".../backend/test_planner.py", line 12, in test_budget_and_source
    self.assertTrue(result['stops'])
AssertionError: [] is not true

----------------------------------------------------------------------
Ran 77 tests in 1.842s

FAILED (failures=1)
all_discovery_exit=1
```

Counts are 32 Claude planner/LLM + 16 data + 24 API/drift = 72 passing; full discovery
adds five legacy tests, four passing and the same missing-private-input failure
already accepted at baseline. There are **no new test failures**. This report does
not claim that all default-discovery tests pass. Earlier incremental suites had
62, 67, 69 and 71 passing tests before later coordinator fixes and API regressions were
added; the final result above supersedes those counts. The deprecation warning was
not addressed with an unsolicited dependency change.

The 24 API/drift tests cover create/hash-only credentials; missing/wrong/cross-session
ownership; expiry and bounded tombstones; bounded session capacity; rate limit and
window recovery; concurrent same-revision writes (one succeeds, one conflicts);
missing-slot messages/no tour; message->tour and retained unspecified slots;
strict evidence rejection; replace locks/identity/order plus stale conflict and
failed-replace atomicity; pinned dataset version; fallback labels and repository
cache; malformed snapshot; unavailable LLM status/error/no mutation; original
legacy imports/list/plan responses; input error envelope/redaction; tampered planner
fail-closed/no mutation; extractor output revalidation; rejected constraints/no
silent old-value replan; midnight clock guards; injection budget/mode retention;
search-bound metadata; allowed CORS token header/PUT; generated OpenAPI drift.

All API inputs are labeled synthetic fixtures or temporary synthetic rows. No
outbound network or live provider is involved; TestClient runs in process.

## Remaining limits and review gate

Claude must review this commit; Antigravity owns independent browser/integration QA.
No public deployment, live LLM/routing, Docker/PostGIS, persistence, migration, TLS,
multi-process sessions, restarts/recovery or load benchmark was tested. Session
state is lost on restart and must be served by one process. The coarse lock can
serialize slow planning across sessions. Per-token limits and bounded session
capacity are local safeguards, not a distributed abuse-control system.

The legacy list/plan endpoints intentionally keep their previous file semantics
and can stay empty when the new session API uses synthetic fallback; consumers
must use the new session wrapper/detail for evidence-aware flows. Source prices
remain venue ranges; estimated times are not actual walking routes. No geoverified
locations, operating status, opening hours, ingredients/allergy safety, public
reuse permissions, or full-domain search completeness are claimed.
