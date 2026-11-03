# API Thật: current app readiness and local operation

## Current state — accepted direct chat, native tools unverified

Serving UI: **http://127.0.0.1:3350**, API: **http://127.0.0.1:8250**.
Source: `992d8ae`. The official OpenAI Python SDK3.42.1 has produced a real completed
Responses answer from `gpt-6-luna`. At **2026-11-03 10:41:21 Vietnam time**, the
short greeting/advice request returned **HTTP200**, response model `gpt-6-luna`,
latency **11,997ms**, usage **327 input +70 output =397 tokens**, reasoning tokens0.
Provider did not return a cost, so charged cost is unknown rather than inferred.
Its public answer recommended bún chả and explained it naturally. No tools were used.
Evidence: `docs/reports/APITHAT_60S_LAST_GREETING.json`.

The local provider is now **enabled1 for reviewed direct chat only**. Catalog:
`direct_chat_verified:true`, `native_tools_verified:false`, `selectable:true`,
`available:false`, `reason:quota`. Native tools are omitted from actual direct-chat
requests; unexpected provider function calls are rejected. Searching/confirming a
tour with model-led native tools has **not** passed live acceptance. The app explains
this direct-only limitation. Gemini remains an option and the existing default;
user sessions are not silently switched.

Current shared ledger: **used20/daily20, remaining0**. The user explicitly approved
18→20 for two additional QA calls; no ledger reset or new budget was created.
Session cap6 and runtime reserve3 remain unchanged. The ordinary reset is
**2026-11-03T08:00:00Z /15:00 Vietnam time**. No generation allowance remains.
Model selection is a zero-generation settings action; choosing it does not refill
session or daily budgets. Actual chat still enforces daily/session admission and
reserve. Until ordinary admission is available, the app truthfully reports the limit.

UI acceptance:9 actual browser settings-only checks passed at1440 and390px. They
verified API Thật selection, direct-only disclosure, retained Gemini, exhausted-quota
copy, unchanged session allowance, and unchanged20/20 ledger/reserve3. A CDP request
guard blocked any potential text POST; none occurred. Build exited0. Evidence:
`docs/reports/apithat-settings-ui/private-evidence.json`. OSM/data/session flows were
preserved; no unrelated broad suites were repeated and user Word files were untouched.

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
`backend/.env` now has the user-approved `FOODTOUR_LLM_DAILY_BUDGET=20`; prior bytes
are backed up privately outside Git. The existing ledger path/session namespace
remain in use. No other caps or account funds were changed by code.

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
