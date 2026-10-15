# SEC01 — local prototype security review

2026-10-15. Author: Codex. Independent reviewer/integration owner: Claude.
Scope: BE-04 U3/U4, local loopback API, default mock extractor and straight-line estimator. No deployment, credentials, new dependencies or provider calls. This is a threat model and local test record, not a penetration-test or vulnerability-free certification.

## Assets and boundaries

Assets are bearer session tokens, preference/location information, current revision and checked tour integrity, local experimental venue input, SQLite file/WAL/backups, and availability of the local server. Boundaries are HTTP client → ASGI guard → authenticated session unit of work → deterministic planner/current dataset, plus the host filesystem. CORS controls browser response access; it is not authentication and does not stop direct HTTP clients.

## STRIDE-lite

| Threat | Mitigation tested | Residual risk |
| --- | --- | --- |
| Spoofing: guess/cross-use session credentials | secrets-generated tokens; SHA-256 hashes only at rest; secrets.compare_digest; header ownership checks; uniform missing/wrong-token handling without revealing expiry to a wrong token; session isolation tests | Tokens are bearer credentials. XSS, browser extensions, malware or a local user can steal them; no account identity, revocation endpoint or TLS for a remote deployment. |
| Tampering: lost updates, forged/stale tours, malicious input | SQLite BEGIN IMMEDIATE transaction across auth/revision/write, parameterized SQL, two-writer conflict test, typed HTTP models, body cap, public build_tour plus validate_tour on restore; stale data invalidates tour while retaining preferences | Host filesystem owner can alter/delete DB or input. A matching hash is an identity/version signal, not proof of venue truth. No signed records or backup integrity service. |
| Repudiation: inability to correlate a failure | Server-generated random X-Request-ID returned on responses and allowlisted JSON access logs with same ID | Logs are local and editable, with no durable audit retention or authentication attribution. Client-provided IDs are deliberately replaced, not trusted/logged. |
| Information disclosure: token/content/path leakage | Access logs contain only request_id, route template, status, latency_ms; no URL/query/identity/body/IP/token. Default uvicorn raw-URL access logger is disabled. Error envelopes for 404/405/413/422/500 omit input values and traces; DB failures redact paths. Session responses have no-store and all responses nosniff/no-referrer. Stored tours contain only IDs/order/version | Preferences necessarily contain sensitive location and free-form user choices. SQLite is unencrypted and deletion is not forensic erasure of WAL/free pages/backups. OS permissions, disk encryption, retention and local log rotation remain operator responsibilities. Public venue endpoints expose allowed venue details to local clients by existing design. |
| Denial of service: oversized input/session flooding/contention | Session bodies capped at 8192 bytes by default, including declared and streamed bodies; bounded IP/token windows and session capacity/tombstones; SQLite timeout maps lock contention to 503; no shared DB connection across threads | Rate limits are process-local, reset on restart and have bounded-key eviction. They are not distributed or robust against many source IPs/token churn. Body cap applies to /v1/sessions*, not the legacy planner. No app-level slow-client deadline, planner CPU deadline, worker quota or global disk quota. SQLite serializes writers, including read recovery, so long planning can cause safe 503s. |
| Elevation: injection into LLM/planner/storage/configuration | Parameterized SQL, contract validation, deterministic plan checking, no code execution from content; session endpoints require token; exact WEB_ORIGIN only, wildcard/credential/path origins fail closed | Mock extraction is not a live-model prompt-injection audit. Filesystem/configuration access already grants substantial local authority. No sandbox, RBAC, OS-user isolation, remote transport security or paid/live provider validation. |

## Configuration and behavior

- `FOODTOUR_SESSION_DB`: unset/empty/whitespace → existing bounded in-memory default; absolute file → SQLite/WAL schema v1. FOODTOUR_DATA_PATH likewise treats blank environment values as unset, preserving labelled fallback. Parent directory must already exist. A relative/unreadable/corrupt/locked database fails safely with 503 provider_unavailable on use; no path returned. Tests and smoke use temporary directories outside Git.
- `FOODTOUR_BODY_LIMIT_BYTES`: default 8192 for session paths, including GET bodies; checked before parsing/creating a session. 413 uses existing validation_error code/envelope.
- `FOODTOUR_RATE_LIMIT_TOKEN`: default 60 authenticated-header attempts per window; `FOODTOUR_RATE_LIMIT_IP`: default 240 /v1 requests per connection client address/window, including session creation. Both guards also count rejected attempts; OPTIONS preflight is exempt. `FOODTOUR_RATE_WINDOW_SECONDS`: default 60. Invalid/out-of-range settings fall back to defaults. Maximum numeric setting is 1,000,000. Custom injected stores can retain stricter store limits.
- Guard maps are bounded to 4096 entries; hashes, not raw tokens/IPs, are used as process-local keys. Forwarded headers are not read by this guard. A future proxy must be explicitly configured with trustworthy transport/client-address handling; forwarded-client spoofing at an upstream server is outside this app's guarantee.
- `WEB_ORIGIN`: comma-separated exact http(s) origins, default http://localhost:3000. Invalid entries (credentials, paths, wildcards) are ignored, never expanded; an all-invalid list allows no origins. `localhost` and `127.0.0.1` are different browser origins: for both local forms set `WEB_ORIGIN=http://localhost:3000,http://127.0.0.1:3000`. CORS allows GET/POST/PUT with content type/session token/request ID and exposes response X-Request-ID. Early 413/429/500 guard responses retain CORS only for a member of that configured list.
- IDs are generated by the server for every HTTP request and emitted as X-Request-ID. Caller-supplied text is not reflected into correlation logs. Unknown/unmatched paths log `<unmatched>`; matched requests log their declared route template with placeholders.
- JSON access logging uses logger `foodtour.access` and four fields only: `request_id`, `route`, `status`, `latency_ms`. The app configures a message-only stream handler and disables `uvicorn.access` because its default formatter includes full URLs. Startup/shutdown logs remain server operational messages. No exception text is included in the access event.
- TTL is fixed at creation, with lazy purge on store activity. SQLite uses wall-clock expiry for restart compatibility, so a host clock rollback may prolong expiry. Bounded expired rows retain token digests to distinguish authorized expired sessions. Token/IP counters intentionally do not survive process restart.

## Evidence

Full acceptance command: scripts/test.ps1 with PIP_NO_INDEX=1, PIP_DISABLE_PIP_VERSION_CHECK=1, npm_config_offline=true, npm_config_audit=false, npm_config_fund=false and NEXT_TELEMETRY_DISABLED=1. Twelve dedicated security tests exercise uniform errors, no input echo, declared/streamed limits before state mutation, headers, IDs/log correlation, template-only logging, token comparison, exact/list/wildcard CORS, blank environment defaults, per-IP/per-token limits, window expiry and bounded maps. Repository tests cover persistence/atomicity/isolation/TTL/corruption/locks; a real two-process uvicorn restart preserved preference/revision/stop-order aggregates. See CODEX_BE04.md for the final full test output and commands.

No network vulnerability lookup was run. No pip-audit/npm audit/network vulnerability service was invoked as a security assessment; versions below are inventory only, not a claim that dependencies are current or safe. The cached frontend build does not establish dependency vulnerability closure. Existing TestClient deprecation warning was observed; dependency changes are outside this task.

## Installed Python dependency inventory

Captured locally with `./.venv/Scripts/python.exe -m pip freeze`:

```text
annotated-doc==0.0.5
annotated-types==0.8.0
anyio==4.15.1
certifi==2026.7.22
click==8.5.0
fastapi==0.143.1
h11==0.16.0
httpcore==1.0.9
httpx==0.28.1
idna==3.20
opentelemetry-api==1.45.1
pydantic==2.14.1
pydantic_core==2.50.1
starlette==1.8.0
typing-inspection==0.4.4
typing_extensions==4.16.0
uvicorn==0.54.0
```

Python is 3.14.4. sqlite3, hashing, threading, JSON and logging are standard-library facilities; no dependency was added. Before any remote use, a separate approved phase must address TLS/authentication/authorization, encrypted storage and retention, distributed limits, provider deadlines, dependency vulnerability lookup and deployment hardening.
