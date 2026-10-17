# Local upgrade operations

Codex lead override applies; Claude is not on call for this session. Local prototype only, Google Maps URLs only, no API/embed/key/billing activation.

## Triage without private content

1. Identify the current app URL/commit and whether its input is synthetic/private. Check `/health` for dataset/provider availability; a responding process does not establish usable data or live provider success.
2. Use the random request ID to correlate a failed request with `foodtour.access` events. Logs use route templates, never raw session IDs/query strings or bodies. `understanding=rules` with `provider_attempted=1` is an attempted fallback, not validated LLM success; cache and live success are separate.
3. Inspect `planner_status`, `planner_checked`, `extraction_ms`, `planning_ms`, HTTP status and total latency. A no-solution/insufficient-evidence result is not an outage; preserve warnings and explain the missing requirement. Only a checked tour can be treated as valid.
4. 409 means fetch the latest owned session revision/state and re-present it; never blindly retry a stale mutation. 403 must not reveal the session. 410 requires a new session. Provider 429/timeout/offline uses bounded fallback/clarification; no automatic constraint relaxation or unbounded retries.
5. Do not paste tokens, prompts, location history, venue identities or raw provider payloads into incident reports. Share only enums/counts/timings/commit/request ID. Local logs contain metadata only; avoid retaining them beyond the debugging need, and do not send external telemetry without a user decision.

## Sessions and recoverability

The default in-memory session store expires at 3600 seconds and caps sessions at 256; process restart loses these sessions. Private chat memory is bounded to the last 8 turns and unparsed numeric obligations are stored alongside allergy obligations. SQLite storage is optional; its expiry/ownership/revision behavior is unit-tested, but a real persisted DB backup/restore exercise is not claimed in this upgrade. Do not reset/delete the user's DB or session files. If durable DB mode is selected later, test restore on a disposable DB and document schema/version before touching actual state.

Gemini has bounded existing session/daily budgets and timeouts. Without a configured persistent budget ledger, process restart can reset the in-memory daily count: do not use restart as a quota workaround. Live smoke must have an explicit small call cap and distinguish attempted vs validated outcomes. No new model/provider or paid activation is necessary for the offline prototype.

## Safe validation and recovery

Run tests with `PYTHONPATH=backend`. Use isolated synthetic app instances and unused ports; inspect listeners before start. Never terminate unknown listeners on 3000/8000/3010/8010. Stop only the exact processes started by the current test harness. Build/run on the reviewed commit; an old screenshot is not regression evidence.

For functional regressions, retain the failing case and route to its owner (Codex backend; Antigravity frontend/QA). Revert only an identified local task commit after coordinating dependent frontend/contracts; do not reset worktrees or rewrite shared history. Preserve untracked plans/reviews. No remote deployment or publishing is authorised.

## Reproducible offline preview

From the coordinator checkout, run `tools/run_upgrade_preview.ps1 -Component backend` and `tools/run_upgrade_preview.ps1 -Component frontend` in separate Orca terminals. The explicit synthetic fixture is labelled in the app; API is real local HTTP, LLM is deterministic rules/mock, routing is estimated and no Google API/provider call is activated. Default URL is http://127.0.0.1:3020 and API http://127.0.0.1:8020. The script refuses occupied ports and stops no existing process. Pass `-DataPath` only to the backend for an authorised existing local input; do not put private paths or records in screenshots/reports. Use matching `-WebPort`/`-ApiPort` in both terminals if defaults are occupied. This development preview does not establish production readiness.
