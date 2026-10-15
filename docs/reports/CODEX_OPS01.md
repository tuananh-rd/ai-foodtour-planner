# OPS-01 — local boot, verification and CI definition

2026-10-15. Author: Codex. Reviewer: Claude.
Task task_eb584ef93b9f / dispatch ctx_ee0253397a49.
Merged coordinator branch first: fast-forward ad815c9..69a2bad.

## Result and entrypoints

PowerShell test and dev scripts work on this Windows machine. A clean staged-source
export with no prior .venv/node_modules also passes the test script. API and
optional Next.js frontend boot together; independent HTTP health succeeds; Ctrl+C
stops both task-owned process trees. No Docker is required. No deployment or remote
workflow run was performed.

From the repository root:

```powershell
# Optional explicit bootstrap interpreter; otherwise reuse .venv, then Python
# on PATH, then the known portable interpreter on this machine.
$env:PYTHON='D:/Downloads/thonny-5.0.0-windows-portable-x64/python.exe'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1 -Frontend
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
```

Default API is 127.0.0.1:8000 and optional frontend is 127.0.0.1:3000. Override
with -Port and -FrontendPort. -SmokeTest verifies readiness and then stops both,
rather than waiting for Ctrl+C. The child PowerShell execution-policy flag is
process-scoped; the script does not change machine policy.

Bash equivalents:

```bash
bash scripts/dev.sh --frontend --port 8000 --frontend-port 3000
bash scripts/test.sh
# Optional: PYTHON=/absolute/path/to/python bash scripts/dev.sh --smoke-test
```

Both Bash files have executable Git modes and pass bash -n. Git Bash dev was also
executed successfully on Windows. Native Linux runtime/signal behavior and the
remote CI matrix have not been executed here.

## Implementation and scope

scripts/local.py is the shared implementation, invoked by the four thin shell
entrypoints. It creates/reuses ignored .venv and installs only the existing
backend/requirements.txt, with no pip upgrade or extra packages. PYTHON selects a
single interpreter executable, not an arbitrary shell fragment. Invalid explicit
overrides fail rather than silently using another interpreter.

Frontend dependencies use npm ci. Dev reuses a matching lockfile installation,
with its fingerprint stored inside ignored .venv; test always runs npm ci, build,
and npm test when defined. NEXT_PUBLIC_API_URL points at the selected local API;
WEB_ORIGIN defaults to the selected frontend origin. The helper invokes node and
npm-cli.js directly on Windows, avoiding command-string interpolation and extra
console windows. No browser is opened. A file lock prevents dev/test from racing
over shared .venv/node_modules/.next state.

When FOODTOUR_DATA_PATH is unset/empty, dev explicitly requests absent-path fallback
using a fresh empty temporary directory, even if a private default file happens
to exist. An explicitly supplied absent path also falls back through DATA-01.
Health output prints the actual dataset_source and SHA-256 dataset_version;
synthetic fallback is announced twice. No private input, venue names/addresses,
tokens or provider credentials are printed. A configured malformed file fails
readiness instead of being replaced silently.

Only task-owned child PIDs/process groups are stopped. Windows cleanup uses
taskkill /PID <recorded-child> /T /F; POSIX cleanup uses the child's process group.
Existing occupied ports are refused, not adopted or terminated. API/frontend
failure or interrupted readiness also enters cleanup. Docker/compose and DB files
were not changed or exercised.

.github/workflows/ci.yml defines Windows/Ubuntu, Python 3.12/3.14 and Node 20 checks
using these same scripts. It contains no deployment, upload, paid-provider or
secret configuration. It was added locally only; nothing was pushed or enabled.

## Explicit expected items, approved by Claude via Orca ask

Claude replied "Both approved" to these exact compatibility decisions:

1. The all-directory unittest runner discovers backend/ including legacy tests.
   Only test_planner.PlannerTests.test_budget_and_source is marked skipped when
   the legacy default data/venues.json is absent. Its reason is printed and
   counted in unittest's summary. Every other failure remains fatal. If that
   file exists, the test runs normally. The legacy test was not edited, and
   FOODTOUR_DATA_PATH is not falsely claimed to affect its hardcoded loader.
2. The current accepted frontend tree has no npm test script: build runs, then
   the script explicitly prints "EXPECTED-SKIP: no npm test script in this tree".
   Once a test script is merged, it runs automatically and failures are fatal.

The synthetic planner fixture cannot satisfy the legacy source-specific test:
it has another row shape and example.invalid URLs, whereas that test requires
private Foody rows/URLs. No fake private URLs or data copies were introduced.

## Real test-script output

Environment: Windows PowerShell, Python 3.14.4, Node v24.19.0/npm 11.17.0; existing
requirements resolve to FastAPI 0.143.1, uvicorn 0.54.0, httpx 0.28.1.

Command from the worktree root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
```

Actual output excerpts, exit 0 (absolute command prefixes shortened):

```text
Bootstrap interpreter: Python 3.14.4
RUN: .../.venv/Scripts/python.exe -m pip install -r .../backend/requirements.txt
Requirement already satisfied: fastapi<1,>=0.115 ... (0.143.1)
Requirement already satisfied: uvicorn<1,>=0.30 ... (0.54.0)
Requirement already satisfied: httpx<1,>=0.27 ... (0.28.1)
RUN: .../.venv/Scripts/python.exe .../scripts/run_unittests.py
EXPECTED-SKIP: legacy data/venues.json absent; this source-specific test requires private Foody rows and URLs, not the synthetic Venue fixture. [test_planner.PlannerTests.test_budget_and_source]
Ran 77 tests in 1.750s
OK (skipped=1)
RUN: .../.venv/Scripts/python.exe .../tools/export_openapi.py --check
OpenAPI matches server schema
RUN: .../node.EXE .../npm-cli.js ci
added 20 packages, and audited 21 packages
2 vulnerabilities (1 moderate, 1 high)
RUN: .../node.EXE .../npm-cli.js run build
> foodtour-web@0.1.0 build
> next build
   ▲ Next.js 15.5.28
 ✓ Compiled successfully in 2.4s
 ✓ Generating static pages (4/4)
Route (app)                                 Size  First Load JS
┌ ○ /                                    1.92 kB         105 kB
└ ○ /_not-found                            995 B         104 kB
EXPECTED-SKIP: no npm test script in this tree
PASS: all available checks passed; expected skips are listed above
test_script_exit=0
```

The known Starlette/httpx deprecation warning remains. Existing npm advisory
counts were not repaired with an unsolicited dependency upgrade. No test failures
are classified as expected except the single specifically approved legacy case.

## Clean first-run verification

Exported the staged source tree fb6ae60bcc6e94d257fade06cf443d4c26a8e640 using
git archive into C:/Users/tuana/AppData/Local/Temp/foodtour-ops-clean-0c17f8a0d6904edfa1b1bc610f9158aa.
Included only backend/, contracts/, frontend/, scripts/, tools/; no .venv,
node_modules, ignored inputs or raw/derived venue data. This is a disposable source
export, not another agent or unmanaged Git worktree. A later executable-mode
adjustment to the two .sh files does not change their tested contents.

Ran the same PowerShell test command there, with PYTHON set to the portable path.
Actual output excerpts, exit 0:

```text
Bootstrap interpreter: Python 3.14.4
Creating ignored .venv
Successfully installed annotated-doc-0.0.5 annotated-types-0.8.0 anyio-4.15.1 certifi-2026.7.22 click-8.5.0 fastapi-0.143.1 h11-0.16.0 httpcore-1.0.9 httpx-0.28.1 idna-3.20 opentelemetry-api-1.45.1 pydantic-2.14.1 pydantic-core-2.50.1 starlette-1.8.0 typing-extensions-4.16.0 typing-inspection-0.4.4 uvicorn-0.54.0
EXPECTED-SKIP: legacy data/venues.json absent; this source-specific test requires private Foody rows and URLs, not the synthetic Venue fixture. [test_planner.PlannerTests.test_budget_and_source]
Ran 77 tests in 2.356s
OK (skipped=1)
OpenAPI matches server schema
 ✓ Compiled successfully in 3.2s
EXPECTED-SKIP: no npm test script in this tree
PASS: all available checks passed; expected skips are listed above
clean_test_exit=0
```

## Real local dev/health/cleanup output

Ran with the PYTHON override set:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1 -Port 18081 -Frontend -FrontendPort 13001 -SmokeTest
```

Actual output excerpts, exit 0:

```text
Frontend dependencies match lockfile; reusing npm ci installation
FOODTOUR_DATA_PATH unset: requesting LABELED SYNTHETIC fallback
Started task-owned process 36348
HEALTH: {"dataset_loaded": true, "dataset_source": "synthetic", "dataset_version": "13a60c746018380f1e5f2930f8561721fb16b94d69aab88c9661e41dd80a7759", "llm": "mock", "routing": "straight_line_estimate", "status": "ok"}
DATASET: SYNTHETIC fixture; not real venues
API: http://127.0.0.1:18081/docs
Started task-owned process 9664
FRONTEND: http://127.0.0.1:13001 HTTP 200
SMOKE PASS: readiness verified; stopping both task-owned servers
Stopped task-owned process 9664
Stopped task-owned process 36348
dev_script_exit=0
```

Then ran without -SmokeTest in a PTY and independently queried:

```powershell
Invoke-RestMethod http://127.0.0.1:18081/health | ConvertTo-Json -Compress
```

Actual response:

```json
{"status":"ok","dataset_loaded":true,"llm":"mock","routing":"straight_line_estimate","dataset_source":"synthetic","dataset_version":"13a60c746018380f1e5f2930f8561721fb16b94d69aab88c9661e41dd80a7759"}
```

The two child PIDs were 11256 (API), 37380 (frontend). While they ran, invoking the
test script exited 1 before installation with:

```text
ERROR: Another dev/test script is active; stop it before running this command
concurrent_test_exit=1
```

Sent Ctrl+C to that PTY. Actual cleanup:

```text
Ctrl+C received; stopping task-owned servers
Stopped task-owned process 37380
Stopped task-owned process 11256
```

The PTY tool marked the interrupted command exit 1; cleanup completed. A subsequent
Get-NetTCPConnection check for 18081/13001 returned zero listeners. No user-owned
process was stopped.

Git Bash checks:

```powershell
& 'C:/Program Files/Git/bin/bash.exe' -n scripts/dev.sh
& 'C:/Program Files/Git/bin/bash.exe' -n scripts/test.sh
& 'C:/Program Files/Git/bin/bash.exe' scripts/dev.sh --smoke-test --port 18083
```

Syntax checks exited 0. Dev printed the same synthetic source/hash, started PID
28176, printed SMOKE PASS, stopped PID 28176 and exited 0. The default-port attempt
correctly failed with "ERROR: Port 8000 is already in use; choose another port";
the existing listener was not touched. Configurable-port success is reported
above. A final port check for 18081/18083/13001 returned zero listeners.

## Initial failure and correction

The first verification accidentally overlapped dev and test npm ci invocations in
the same worktree. Dev failed ENOTEMPTY while removing a Next directory; test
subsequently failed its build with "'next' is not recognized". Both failures
returned nonzero and were not hidden as skips. Added the per-worktree lock, then
reran sequentially with the successful results above. The concurrent-run rejection
was independently verified after that correction.

## Limits and review

Claude reviews this change before integration. Backend/provider semantics and
frontend source are unchanged. The accepted frontend currently uses legacy list/
plan behavior; booting it is not a claim that the reviewed FE-01 feature branch is
fixed or integrated. The backend /health and session API disclose synthetic fallback,
while legacy load/plan still retain their deliberately preserved file semantics.

No real routing, LLM, DB, public-data permission, external browser flow, production
deployment or remote CI result is claimed. Local verification used Python 3.14.4
and Node 24; CI's Python 3.12 and Node 20 combinations remain unexecuted. Fresh
dependency installation may require network access and resolves the project's
existing ranges; the task does not introduce a new lockfile or version upgrade.
