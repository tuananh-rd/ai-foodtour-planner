# API Thật chatbot: current local state and403 diagnosis

## Current result

API Thật model-first source is implemented (`33560b8`);20 affected offline tests passed.
The exact operator-confirmed configuration is `https://apithat.dev/v1` and `gpt-6-luna`.
The local key is present. `FOODTOUR_APITHAT_ENABLED=0`; native-tool capability remains
unverified and disabled. Gemini remains the app default. Two real HTTP generation
attempts have now been made; neither produced a model answer. This supersedes all
historical key-absent, zero-attempt and initial reserve-blocked checkpoints.

| Probe | Actual attempts | Result | Shared ledger |
|---|---:|---|---|
| Authorized reserved greeting/model-first probe |1|HTTP403, stopped before search/continuation|15 →16 of18|
| Separately authorized short greeting, no tools |1|HTTP403,395ms,2026-11-03 09:22:17 +07:00|16 →17 of18|

Total2/3 authorized attempts have been spent;1 remains unspent. No retry/failover,
ledger reset, fresh live budget, purchased credit or daily/session increase occurred.
The reserve exception applied only to the disposable probe. App reserve remains3,
daily limit18 and session cap6. No further request is scheduled. No response model,
input/output token usage or provider-reported cost was returned; none is inferred.

Evidence: `docs/reports/APITHAT_RESERVED_LIVE_PROBE.json` and
`docs/reports/APITHAT_ONE_SHORT_LIVE_PROBE.json`. Raw error bodies and authentication
headers are not retained. The second response supplied `Content-Type: application/json`
and Cloudflare Ray ID `a547e9150e3e87f9-SIN`; no allowlisted request ID or error code was
captured. A Cloudflare header identifies an intermediary, not the cause of denial.

## What the diagnostic checks establish

- The client builds `Authorization: Bearer <key.strip()>`. Local in-memory Request
  inspection confirms the header contains exactly the normalized effective key;
  no token/header value was printed. This verifies construction, not remote receipt.
- Boolean checks: key present, ASCII, no remaining BOM/whitespace/quotes, effective
  key equals the normalized file value, and no process-environment key override.
  The file is decoded UTF-8 with optional BOM handling. No key rewrite was necessary.
- Base, model and final `/v1/chat/completions` endpoint match the confirmed values;
  `/v1` is not appended twice. The HTTPS destination allowlist accepts it.
- The transport explicitly uses `ProxyHandler({})`; no HTTP(S)/ALL_PROXY environment
  value is present. TLS certificate/hostname verification uses the default SSL context;
  no custom certificate environment is set. Redirects are refused rather than followed.
- The local destination policy rejects before transport with an unavailable error;
  it does not manufacture HTTP403. The observed403 comes from urllib's HTTPError path.
  A redirect refusal also does not create a403 status. A TLS failure would not itself
  be reported as this HTTP response.
- There is no explicit User-Agent override; urllib's default client identity is used.
  A gateway policy concerning that identity is possible but not established. A
  transparent network intermediary or gateway/CDN/upstream policy cannot be excluded
  from local inspection alone. No alternate headers, proxy or endpoint were tried.

Conclusion: obvious local key-format/header/URL and explicit proxy/policy construction
errors were not found. These checks do **not** prove the key has permission, identify
the rejecting component, or establish that the provider/model itself is faulty.

## Exact account-side checks without changing key or buying quota

The public application bundle exposes `/keys` and `/usage-logs` (legacy `/console/log`
maps to `/usage-logs`), and labels `Request ID`, `Request Model` and `Model Limits`.
These routes/labels are verified from public assets; account-specific fields and
permissions cannot be inspected without the operator's authenticated screen.

1. Open [Usage logs](https://apithat.dev/usage-logs). Find the request at
   **2026-11-03 09:22:17 Vietnam time** (`02:22:17Z`), model `gpt-6-luna`, route
   `/v1/chat/completions`. Inspect its Request ID, request model, HTTP status,
   error code/type and denial reason if the detail view exposes them. Check whether
   input/output tokens, charged amount and routing/upstream status are present.
   Do not share key/token, Authorization headers, full prompts or raw private bodies.
2. Open [Keys](https://apithat.dev/keys), select the same key, and inspect its
   enabled/status and Model Limits entry for exact `gpt-6-luna`. If the key detail
   exposes expiration, IP allowlist, group/channel or endpoint restrictions, compare
   those with this request. Do not modify them blindly or replace the key.
3. If Usage logs has no matching entry, this does not prove the request was never
   received: denied traffic may be excluded. Ask API Thật support/admin to correlate
   the timestamp, path and Ray ID `a547e9150e3e87f9-SIN` in access/WAF logs and identify
   whether authentication, model authorization, upstream routing or an edge rule
   returned403. No secret is needed for that correlation.

## Local configuration and operation

Private ignored file:
`C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-claude-coordinator/backend/.env.apithat.local`.
The key is already saved; do not paste or print it again. These are variable names
and public values only, not a replacement for the existing local file:

```dotenv
APITHAT_BASE_URL=https://apithat.dev/v1
APITHAT_MODEL=gpt-6-luna
APITHAT_API_KEY=
FOODTOUR_APITHAT_ENABLED=0
```

`tools/run_online_assistant.py` loads only these four variables from the separate
file, with process environment taking precedence. This file cannot change caps,
ledger paths or public client variables. It remains Git-ignored; no key is in Git,
reports, screenshots or frontend variables. Existing private sessions and Gemini
configuration are preserved. User Word documents are untouched.

## Model-first and safety contract

The API Thật path sends permitted current user text verbatim as a separate native
user message and bounded permitted history with user/assistant roles. Public server
context is separate data. The model leads greeting, advice and clarification; for
venue facts it calls native tools, then explains the actual results. No keyword
preference mutation or required-search dispatcher runs before the model. Parser
evidence is used only to authorize a proposed mutation or labelled rules fallback.

The adapter maps Chat Completions `tool_calls` IDs to matching `role: tool` results
and continuation, including parallel calls. Real IDs, session ownership/CAS,
selection locks, allergy unknowns, factual prices, explicit confirmation and privacy
remain server-owned. Exact GPS/health/private-location disclosures and entire menus
are excluded from model requests. HTTP errors remain honest failures; rules/tools
answers are never called model success. No automatic Responses-route fallback exists.

The gateway's [public homepage](https://apithat.dev/) advertises Chat/Responses and
Bearer authentication. Public [docs](https://apithat.dev/docs) did not establish
key/model-specific native-tool compatibility. The mapping follows the primary
[Chat function-calling contract](https://developers.openai.com/api/docs/guides/function-calling),
but offline compatibility is not live gateway proof. The model catalog remains
unavailable/native_tools_verifiedfalse until real tool+continuation evidence exists.

## Verification and next step

20 model-first/adapter offline checks passed. Two additional safe-diagnostic tests
plus the affected no-retry test pass using fake HTTP errors, without network or
real credentials. Error diagnostics retain only status, normalized content type,
bounded request identifiers and an allowlisted short error code; never error messages,
cookies, Authorization or raw bodies. No new generation is needed to run these tests.

Next action is the targeted account-log correlation above, not another probe or
blind key/quota change. Keep enabled0. The remaining1 attempt is reserved and will
not be spent without explicit steering after the403 cause is narrowed down.
