# BE-05 — independent review and local-only HTTP adapters

2026-10-15. Codex implementation/review; Claude is review and integration owner.

## Commits and coordination

Part A was committed first as `c59144410fc7ddd93e5e86051a5123386a5db58c`, changing only CODEX_REVIEW_P2.md. It records review findings and actual browser/evaluation output against `2d3b262`. After Claude's decision `msg_16661a876155`, merged coordinator `11cd31f`, including Claude fix `d2390da` and the integration of that review report. Codex did not edit planner, LLM, frontend, QA or the prose contract.

Claude approved the environment names below, additive llm_configured/routing_configured health fields, source values and loopback-only transport for this phase. Part B is the subsequent adapter/wiring/test/OpenAPI/report commit; its hash is reported through Orca after creation.

Review follow-up probes at the merged fix:

```text
input='ngan sach -10k moi nguoi' budget=200000 rejected=['budget_vnd']
input='ngan sach 0k moi nguoi' budget=200000 rejected=['budget_vnd']
input='10 quan' rejected=['max_stops']
input='nhom 21 nguoi' rejected=['party_size']
oversized_rebuild_rejected=True reason='more stops than max_stops'
```

R1/R2 from part A are closed for these reproduced cases. R3 (generic CheckedRouteProvider malformed-input guard), R4 (harness proof gaps) and R5 (model-key reflection/prior context) remain documented follow-ups in Claude-owned files. The HTTP route adapter independently handles malformed coordinates before any provider call, so R3 does not make this adapter raise. Do not interpret passing harnesses as resolution of all review findings.

## Adapter behavior

- `HttpExtractionProvider.complete(text, prior, deadline_s=...)` POSTs JSON `{text, prior}` to the explicitly configured endpoint and returns raw JSON-object text to the existing LLMExtractor. It uses FOODTOUR_LLM_API_KEY as a Bearer header when present; no key is stored in the instance or returned/logged. The existing LLM boundary applies its strict slot allowlist/ranges; the adapter does not replace that validation with trust in model output.
- Transport uses stdlib urllib with proxies disabled, redirects refused, bounded bytes (8192 for extraction, 16384 for OSRM), UTF-8/JSON validation, socket timeout and a monotonic body deadline. Slow-drip reads update the remaining socket deadline. ProviderError kinds are timeout, quota (429), unavailable (server/connect/redirect failures) and bad_response (invalid/oversized content). No endpoint/error body/key is included in ProviderError text. Compressed responses are refused rather than decompressed without a cap.
- Only explicit-port literal loopback IP URLs are configured (`127.0.0.1`, other literal loopback addresses or bracketed ::1); hostnames, non-loopback IPs, URL credentials, query configuration and fragments are refused before socket creation. There is no DNS resolution to decide whether a hostname is safe, no proxy fallback and no vendor/default endpoint. The sole generated query is OSRM's fixed overview=false. This hard restriction requires a separately approved change before any external provider use.
- `HttpRouteProvider.leg` requests `/route/v1/foot/{lon},{lat};{lon},{lat}?overview=false`. It accepts only finite nonnegative numeric duration/distance and code=Ok with a nonempty routes list, rounds seconds upward to integer minutes and converts meters to km. Invalid/unreachable/timeout/quota responses yield Leg(minutes=None, km=0, source='unknown'), never a fabricated ETA or verified source. The zero km is an unknown sentinel; no successful tour can use the unreachable leg.
- Each process-local provider instance has a directed 512-entry LRU and 256 uncached-call budget by default, configurable by constructor; failed attempts consume budget, cache hits do not. Fetch/quota admission is serialized under a lock. No symmetric-route assumption or route geometry is created. Quota/cache reset with a new app/process; failures are not cached. A large search can exhaust quota and return no feasible tour rather than silently use estimated evidence. Cross-process quota aggregation and cache freshness are outside this phase.

## Wiring and health

`FOODTOUR_LLM=mock|live|off`, default mock; `FOODTOUR_ROUTING=estimate|osrm`, default estimate. Live requires FOODTOUR_LLM_ENDPOINT, OSRM requires FOODTOUR_ROUTING_ENDPOINT. Missing/blank/invalid/non-loopback endpoint disables that provider without opening a socket. Unknown mode values also fail unavailable instead of silently becoming a live or mock success. API key is optional for credential-free local fakes and read only when completing an extraction call.

Health exposes no URL or credential:

| Selection/state | llm / llm_configured | routing / routing_configured |
| --- | --- | --- |
| defaults | mock / true | straight_line_estimate / true |
| off / OSRM without endpoint | unavailable / false | unknown / false |
| configured local live / configured OSRM before a successful leg | live / true | unknown / true |
| configured OSRM after a successful local leg | unchanged | provider_route / true |

Health performs no provider network probe. Route reachability is the last uncached-call observation, not a continuous liveness guarantee; a later failure/quota exhaustion marks it unknown. A cached route is previously validated provider output, not evidence of current server liveness. Strict mode still relies on the hard checker and never becomes verified_feasible on unknown/estimated route legs; verified prices/hours remain independently required. Fake-server success validates the adapter contract, not real walking coverage or a real model/vendor.

## Tests and actual output

Twelve provider tests use ephemeral ThreadingHTTPServer instances bound only to 127.0.0.1. Ambient API-key/session/provider environment values are overridden with empty/default test values; only a deliberately fake key is used in one header test. Tests cover successful POST/foot units, provider-slot validation of injection-like output, header timeout and slow drip, 429, 500, malformed/non-object/invalid-number/invalid-UTF8/oversized/truncated responses (including absent Content-Length), redacted errors, redirects/proxies, directed cache eviction/hits, concurrent quota admission, missing-endpoint health, API live/503 wiring and strict-mode rejection on unavailable routes. A socket.connect guard asserts every attempted connection is literal loopback and verifies non-loopback endpoint construction makes zero connections; an external redirect makes only the initial local connection.

An initial no-socket health test incorrectly blocked Windows asyncio's internal loopback socketpair. The corrected test blocks transport opener construction while TestClient runs and explicitly checks it is never invoked; the separate actual-socket guard remains in the network tests. This was a test-fixture issue, not an external socket attempt.

```powershell
# repository root, regenerated only via the existing exporter:
./.venv/Scripts/python.exe tools/export_openapi.py
./.venv/Scripts/python.exe tools/export_openapi.py --check
# OpenAPI matches server schema

# backend directory:
$env:PYTHONPATH='.'
../.venv/Scripts/python.exe -m unittest tests.providers.test_http -v
../.venv/Scripts/python.exe -m unittest discover -s tests -t .
```

```text
Ran 12 tests in 1.734s
OK
provider_tests_exit=0

# final discovery including environment isolation, cache-hit and truncated-response assertions:
Ran 131 tests in 5.450s
OK
discovery_exit=0
```

Full integration, with package installation/telemetry explicitly offline, from repository root:

```powershell
$env:PIP_NO_INDEX='1'
$env:PIP_DISABLE_PIP_VERSION_CHECK='1'
$env:npm_config_offline='true'
$env:npm_config_audit='false'
$env:npm_config_fund='false'
$env:NEXT_TELEMETRY_DISABLED='1'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
```

Actual captured output (`C:/Users/tuana/AppData/Local/Temp/foodtour-be05-full.log`):

```text
Ran 136 tests in 5.480s
OK (skipped=1)
OpenAPI matches server schema
Compiled successfully in 860ms
ALL 12 CONTRACT INVARIANT TESTS PASSED SUCCESSFULLY!
PASS: all available checks passed; expected skips are listed above
script_exit=0
```

The full script includes five legacy tests beyond discovery; its one expected skip is test_budget_and_source requiring absent private Foody rows/source URLs. Both final runs include environment isolation, the cache-hit assertion and the final HTTP truncation guard. No runtime code changed after the passing integration run.

Part A independently ran the required unchanged browser_flow.mjs (16/16, desktop/mobile) against its own production-built scratch frontend/API and run_eval.py (7/7 extraction, 4 returned tours, 0 invalid; PASS; synthetic 13 venues). Exact commands, ports, latency and limitations are in CODEX_REVIEW_P2.md. All own review servers and CDP listeners on 18160/13360/9360 were stopped; the human's coordinator-worktree dev process was not touched.

No dependency changes, credentials, external provider calls, private-data copies or deployment. Real endpoint interoperability, live model grounding, actual walking-route accuracy, remote quotas/TLS deployment and paid-provider validation remain untested and behind the human gate. Deadline reads use CPython HTTPResponse socket plumbing, tested on this Windows/Python 3.14.4 environment; portability beyond the tested runtime needs verification. Claude reviews and integrates the two task commits.
