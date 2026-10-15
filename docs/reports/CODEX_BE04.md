# BE-04 — persistent sessions and security hardening

Author: Codex; reviewer/integration owner: Claude. 2026-10-15.

## Part 1 / U3

Merged coordinator `c9c110c` first, then `2a1c089` following Claude's recorded Orca answer. Claude approved GET /v1/sessions/{id} in contract v1.2 and supplied public planner.engine.build_tour; the implementation uses that public function and validate_tour, with no planner/LLM edits by Codex. The initially missing ROADMAP arrived in that merge.

SessionStoreInterface is a structural protocol; the existing SessionStore remains the compatible in-memory default. FOODTOUR_SESSION_DB selects SQLite only when set to an absolute path. SQLite lazily initializes schema version 1, uses WAL and per-operation connections, and holds BEGIN IMMEDIATE across authorization, revision checks and commit. Errors roll back. Wall-clock TTL survives restart; active capacity and expired hash-only tombstones are bounded. Existing tokens are SHA-256 digests and compared with secrets.compare_digest.

Persisted session columns: random identity, token hash, preferences, revision, expiry, and JSON tour metadata containing only dataset_version plus venue_id/order pairs. Names, addresses, raw messages, source URLs and token plaintext are not stored as tour data. Preferences are intentionally persisted and may themselves contain sensitive location/free-form interests; database filesystem protection remains necessary. Expired payloads are purged on session activity. SQLite deletion is logical deletion, not forensic erasure of WAL/pages/backups.

GET rebuilds from current data and validates the reconstructed exact order. Changed dataset or invalid venue yields tour=null, preserves preferences/revision and returns `dữ liệu đã đổi, hãy lập lại lịch trình`; repeated reads keep that note. Read-only recovery does not revise stored metadata. Historical lock lists/free-form diagnoses are not persisted under the requested minimal record format; valid stop claims are recomputed, failure diagnoses regenerated. Subsequent replacement always locks the other current stops as before. No API returns an unchecked reconstructed tour.

Tests use only TemporaryDirectory databases outside the repository. Added checks cover new-app restart, exact order/validation, raw-token/name/address exclusion, WAL, two independent stores/threads with one 409, rollback, isolation, restart expiry, bounded tombstones/capacity, stale/invalid venue recovery, environment selection, corrupted schema/rows/files and locked-database redacted 503 responses.

Commands and actual results:

```powershell
# from backend/
$env:PYTHONPATH='.'
../.venv/Scripts/python.exe -m unittest tests.repositories.test_sessions -v
# Initial 9-test run: cleanup errors exposed test connections not explicitly closed.
# Fixed the test helper to close connections; 9 tests then passed in 0.746s.

# from repository root, after the approved read endpoint was added:
./.venv/Scripts/python.exe tools/export_openapi.py
# Exported contracts/v1/openapi.json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
```

Full U3 run captured at `C:/Users/tuana/AppData/Local/Temp/foodtour-be04-u3-test.log`:

```text
Ran 101 tests in 3.444s
OK (skipped=1)
OpenAPI matches server schema
Compiled successfully in 1447ms
ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
PASS: all available checks passed; expected skips are listed above
script_exit=0
```

The expected skip is legacy test_budget_and_source, requiring absent private venue/source data. An earlier discovery attempt ran before regenerating OpenAPI and reported the expected schema drift; regeneration followed by the full script above resolved it.

Real two-process uvicorn restart smoke (synthetic data; temporary absolute DB outside repository):

```powershell
./.venv/Scripts/python.exe C:/Users/tuana/AppData/Local/Temp/foodtour-be04-restart.py
```

The local probe starts uvicorn on 127.0.0.1:18150 with FOODTOUR_SESSION_DB set to a temporary file, creates a session and message-based tour, stops/waits for that process, starts a new process with the same database and reads the authenticated session. It asserts preferences/revision/order equality and terminates both servers. Output contains aggregates only:

```text
before_restart: source=synthetic revision=1 stop_count=3
after_restart: source=synthetic revision=1 stop_count=3 same_order=True same_preferences=True
restart_smoke=PASS; raw tokens and database paths omitted
```

## Part 2 / U4

Security implementation, evidence and residual risks will be appended in the second task commit; SEC01.md is the accompanying threat model and offline dependency inventory.
