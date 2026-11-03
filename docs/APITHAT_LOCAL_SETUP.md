# API Thật: current app readiness and local operation

## Current state - daily200/session30, reviewed native Luna Responses

Serving UI: **http://127.0.0.1:3350**, API: **http://127.0.0.1:8250**.
Code: `1644e48` (approved limits) and `5fdb85c` (native tools/grounding).
The user explicitly approved daily200 calls and session30, with reserve3,
max_output_tokens512, a two-request/six-tool turn bound, Responses60s and client75s.
The original shared ledger was retained at used20; no reset/new ledger, account-key
money limit/group/model change, billing action or retry/failover was performed.
Lower explicitly configured limits still win. Existing session counters remain used;
only a new disposable session starts with the full30-call allowance.

API Thật is enabled1 for **gpt-6-luna / Responses using the official OpenAI Python
SDK3.42.1**. Gemini remains an option/default; existing sessions keep their model.
Catalog distinguishes configured, selectable, available, direct-chat proof and
native-tool proof. Selection itself consumes no model call and never resets quota.

Real native QA: two public search/continuation journeys, **four HTTP attempts**,
all HTTP200/completed with response model `gpt-6-luna`. Each model initiated native
`search_restaurants`; real menu6 backend results contained5 venues and12 matching
menu rows. Each second request included the actual function_call_output under its
original call_id, preserving native reasoning items. Selection/tour stayed unchanged.
The original responses were withheld by the output privacy guard: a verified
currency range was mistaken for GPS. The fix masks only independently evidence-backed
currency spans/ranges during output checking, rejects unsupported amounts/ranges,
and retains coordinate/contact/key/allergy/authority checks. The captured real
continuation then passed offline revalidation with **zero new HTTP attempts**.
Raw venue records, answers and native opaque items remain private outside Git.

Evidence: `APITHAT_NATIVE200_PROOF.json`, `APITHAT_NATIVE200_GROUNDING.json`,
`APITHAT_GROUNDING_DIAGNOSTIC.json`, `APITHAT_GROUNDING_REVALIDATION.json` under
`docs/reports/`. Provider did not return cost; charged cost is unknown. Final rendered app acceptance and current ledger are recorded in the checkpoint
below after the bounded browser journey; no further automatic calls beyond six QA
HTTP attempts are authorized. Concurrent user app calls share the same ledger and
are reported separately rather than being attributed to QA.

Historical direct-chat proof remains valid: Nov3 10:41:21 Vietnam, HTTP200/completed,
11,997ms,327 input+70 output=397 tokens. Earlier20/20 quota and direct-only UI evidence
were historical snapshots, superseded by this approved200/30 native integration.
This is not blanket acceptance of every model answer or the whole application.

## Final bounded QA checkpoint - partial acceptance, not a full chat-quality pass

Code/build `5fdb85c`; configured private3350/API8250 build exited0.33 affected
backend regressions and client75s/backend60s timeout contract passed. The actual
browser typed a public food request, selected API Thật and used real backend data:
**10/11 checks passed** at1440/390. Search returned5 venues/15 matching menu rows;
selection/tour stayed unchanged. Its two-call native flow finished in49,804ms but
final reply_source remained **tools**, reason **safe_answer_rejected**, no provider
failure. Therefore this actual app grounded-answer check **failed**. Native wire
capability is proven; general natural conversation quality is not fully accepted.
Do not hide this failure behind HTTP200 or the earlier offline revalidation pass.

This QA episode used **exactly6 HTTP generation attempts** (four diagnostic/proof,
two browser), no retries/failover. No further automatic generation is being made.
The shared ledger also includes concurrent ordinary user app traffic; see timestamped
`docs/reports/APITHAT_200_30_CHECKPOINT.json` for the current count/remaining and
`docs/reports/apithat-native200-ui/private-evidence.json` for the failed check.
The model remains selectable for the user's explicitly approved ordinary app use;
existing budgets/session counters continue enforcing admission. Follow-up work must
capture sanitized rejection diagnostics or retain the output privately for offline
analysis before another explicitly bounded QA episode. No key/account change or
blind extra generation is required to explain this local output-guard failure.

## Exact configuration and deadlines

Private ignored file:
`C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-claude-coordinator/backend/.env.apithat.local`.
The key is already present and must not be printed, pasted, logged or committed.
Public variable names/values below describe current configuration, not a key file:

```dotenv
APITHAT_BASE_URL=https://apithat.dev/v1
APITHAT_MODEL=gpt-6-luna
APITHAT_API_MODE=responses
APITHAT_API_KEY=
FOODTOUR_APITHAT_ENABLED=1
```

The launcher allowlists these five variables; process environment takes precedence.
`backend/.env` now has the user-approved `FOODTOUR_LLM_DAILY_BUDGET=200`; prior bytes
are backed up privately outside Git. The existing ledger path/session namespace
remain in use. Session cap is now30; reserve3/output512/tool bounds/account funds are unchanged.

Only API Thật Responses has a bounded60second backend turn/SDK deadline. Frontend
chat waits75seconds for this mode. Gemini and legacy Chat deadlines are unchanged;
Photon is unchanged. Luna Responses uses the officially documented low reasoning
effort and max_output_tokens512. The app stays with its existing JSON response
contract; SSE streaming was not added because partial output would require a
separate state/CAS/error contract. This timeout fix does not retry a slow request.

The SDK uses its unchanged default identity, retries0, TLS verification, trust_envfalse,
no proxy or redirects, and bounded response reads. `hostapi.apithat.dev` is not used
for chat. Header/body/key values are not logged. Safe diagnostics retain only
status, content type, bounded request IDs/codes/types and fixed message categories.

## How to test without misreading readiness

1. Open3350 and choose **API Thật · gpt-6-luna (trò chuyện)** in the model selector.
   This can be checked now without sending a message; the quota warning is expected.
2. After ordinary admission is available, greeting/general food advice uses the
   actual SDK-backed direct model. Exact public current text and permitted native-role
   history are sent through the backend; private GPS/health disclosures stay local.
3. Do not treat a direct answer as restaurant search/menu or native-tool proof.
   Native search→real tool result→continuation needs a separately authorized bounded
   QA run and adequate existing daily/session admission. Capability cannot be enabled
   by relabelling models.list or the greeting.

User-selected venues, confirmation/CAS/allergy checks, private data and OSM remain
backend-owned. Direct mode has no model mutation tool. Existing deterministic user
actions remain validated; labelled rules fallback is not reported as model output.

## Verified provider docs and account action provenance

Read directly in a separate owned headless Chrome, never the user's active browser:
[Base URL and endpoints](https://docs.apithat.dev/huong-dan/base-url/), Python(OpenAI)
tab demonstrates the official SDK and client.responses.create at base`/v1`.
Responses is recommended for new integrations; Chat Completions remains supported
at the same base with`/chat/completions`. Client api_mode selects protocol; base alone
does not. No automatic protocol fallback is implemented. Anthropic uses another
documented base/SDK route, outside app scope.

[Groups and prices](https://docs.apithat.dev/huong-dan/nhom-va-he-so/) says the key's
group determines model access and price, and outside-group requests can return
No available channel/model not found. [Public pricing](https://apithat.dev/pricing)
lists gpt-6-luna and openai-response. Public price listings are not actual charges.
The root/coordinator, not this worker, reported changing the key group in Chrome
from default to GPT-pro0.0429x, keeping limit100000 and one-model restriction.
A post-change authenticated SDK models.list then returned200/one model with
gpt-6-luna present; it did not consume a generation call.

OpenAI primary [Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna)
confirms low reasoning support. [Responses function calling](https://developers.openai.com/api/docs/guides/function-calling)
and [reasoning continuation](https://developers.openai.com/api/docs/guides/reasoning)
validate the prepared native mapping: call_id, not item id, pairs outputs; exact
reasoning/native items stay in-turn only with storefalse, never session/log storage.

## Historical probe timeline — not current blockers

| Probe | Result | Generation ledger |
|---|---|---|
| Two urllib attempts |403; later public GET comparison identifies1010 client-signature policy|15→17 of18|
| First official SDK model listing and raw-shape check |200/data list0; SDK parse also0|17 unchanged|
| Final original allowance: SDK Responses greeting,10:29:14 |503/model_not_found/new_api_error,755ms|17→18|
| Coordinator changes key group; one SDK models.list,10:33:05 |200/one model; Luna present|18 unchanged|
| First new native-tool QA attempt,10:37:06 |12,922ms timeout under old12s deadline; no native tool response|18→19 of20|
| Second new allowance:60s-bounded simple greeting,10:41:21 |200/completed/Luna,397tokens; no tool calls|19→20|

The old403 is not the current SDK blocker. Empty models.list was never used as an
indefinite POST prohibition; a user-approved direct POST exposed the503 routing
failure. Group correction fixed read-only model access; the final greeting proves
actual generation. The timed-out native request's provider usage/cost remains unknown;
fallback rules after timeout are not native proof. No request was retried, no UA
rotation/browser impersonation/borrowed cookies or alternate API host was used.

Targeted evidence includes SDK/Responses/model-first tests, timeout unit checks,
39 affected backend checks PASS, successful final configured build, and the9 UI
settings checks. Counts across runs overlap. The final greeting's console print
hit a Windows encoding error after the sanitized artifact was saved; the artifact
was read directly, not regenerated. No additional request was made to reprint it.

## Remaining work

Full model-led restaurant search/tool continuation remains unverified. It needs
explicit bounded QA after ordinary budget admission; do not silently broaden direct
mode or increase20 again. App is open and model selection is accepted, while current
quota exhaustion is stated honestly. No new generations run automatically.
