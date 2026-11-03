# API Thật chatbot: current local state and403 diagnosis

## Protocol readiness (latest official bot image supplied by the user)

The image confirms Responses is recommended for new integrations at base
`https://apithat.dev/v1`, POST`/responses`; Chat Completions is still supported at
the same base, POST`/chat/completions`. The earlier Chat endpoint was valid.
Anthropic uses base`https://apithat.dev` and its SDK adds`/v1/messages`; this app
does not implement Anthropic. The image specifies Bearer auth for GET`/v1/models`.

Set server-only`APITHAT_API_MODE=responses` (new default) or`chat_completions` to
choose protocol explicitly. No auto fallback or duplicate`/v1` occurs. The private
key file and current runtime are unchanged; absent api_mode defaults to Responses
on future startup. This preparation does not activate the provider.

Responses maps function_call.call_id to function_call_output.call_id, preserving
the exact output/reasoning items in-turn, with store:false and no remote conversation
ID. Flat function tools, completion/refusal validation, bounded payloads, usage
input_tokens/output_tokens and model-first privacy/authority/grounding are covered
offline. Eight Responses regressions passed; the initial combined run passed27
checks, then three affected checks passed after routing refinement (overlapping).

See the contract and primary [Responses mapping](https://developers.openai.com/api/docs/guides/migrate-to-responses)
and [reasoning continuation](https://developers.openai.com/api/docs/guides/reasoning) references.
No live generation, endpoint test or UA change was made. Changing protocol does not
resolve1010; the image contains no approved client header/SDK/WAF remediation.
The last attempt is preserved and native-tool capability remains unverified/disabled.

## Identified blocker: client-signature policy (latest evidence)

The user supplied an unauthenticated public `GET /v1/models` comparison, not a
generation. Default urllib Python User-Agent received Cloudflare403/error1010,
`browser_signature_banned`, `retryable:false`, `owner_action_required:true` at
2026-11-03T02:27:27Z, Ray `a547f0a28ee3fdcf`. A separate reported unauthenticated GET
with the truthful `FoodTourPlanner/1.0` identity reached an application401
`new_api_error`/Invalid token with a request ID. This agent did not repeat either GET.

This identifies a client-signature edge policy before application authentication,
explains why application logs can be empty, and is consistent with the earlier two
generation403 responses. Their exact error codes cannot be reconstructed because
their raw bodies were not retained. Neither comparison proves the saved key is
invalid or valid, or proves the model works. The remaining generation attempt is
not consumed. Capability remains unverified and enabled0.

**Stop retries, User-Agent rotation, browser impersonation and header changes intended
to pass the block.** The adapter's User-Agent was not changed. Searches of public
API Thật documentation found no verifiable official SDK/User-Agent/header policy
authorizing a client change. Generic Chat/Responses compatibility is not that permission.
This is a documentation-search limitation, not proof that no private policy exists.

Required operator action: send the administrator the two public-GET status results,
timestamp and Ray ID above. Ask which **official API hostname and supported SDK/client
identity/header contract** is approved for server-side clients, and request that the
legitimate FoodTour client be permitted under that policy. Ask the administrator to
correlate the1010 edge rule and confirm authorization before changing client headers.
Do not replace the key, buy quota, disable local TLS checks or try more signatures.
[Cloudflare's1010 documentation](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/)
describes an owner-side browser-signature block; provider policy/owner action governs access.
That primary document also recommends descriptive application identities for certain
Pages/workers.dev deployments. The deployment type and API Thật's approved client
contract are not established here; this generic documentation is not treated as
authorization to alter the blocked client's signature. No header or hostname change
is made without the provider-approved policy requested above.

Sanitized provenance: `docs/reports/APITHAT_403_ROOT_CAUSE.json`. Offline diagnostics
now capture bounded integer/string codes in known nested envelopes and canonical
allowlisted titles/types, plus explicit retry/owner-action booleans. Arbitrary
messages/details/titles, credentials and raw bodies remain excluded. Four diagnostic
tests pass with fake HTTP errors; no new generation or endpoint test was made.

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

Earlier local-only conclusion (before the supplied1010 comparison): obvious local key-format/header/URL and explicit proxy/policy construction
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
APITHAT_API_MODE=responses
APITHAT_API_KEY=
FOODTOUR_APITHAT_ENABLED=0
```

`tools/run_online_assistant.py` loads only these five variables from the separate
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

Next action is administrator approval of the API-client/hostname policy described
at the top, not another probe or blind key/quota change. Keep enabled0. The remaining1
attempt is preserved; no automatic continuation is scheduled.
