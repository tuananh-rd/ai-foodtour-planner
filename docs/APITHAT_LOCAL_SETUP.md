# API Thật local chatbot adapter

Status: offline implementation prepared; **no live request made**. Gemini remains the current default. The API Thật model is disabled pending key availability, separately authorized bounded live validation and actual native-tool continuation evidence. Configuration alone is not proof of model availability or response quality.

Latest model-first update: the separate API Thật flow sends permitted current text
verbatim and bounded permitted history with original roles. Parser preferences no
longer mutate state before the model; model-selected native tools provide evidence
and explicit validated changes. Rules run only as a labelled fallback or backend
authority check.20 affected offline tests passed, including original text/history,
model clarification, preference+search continuation, privacy, grounding and denial.

The user has now saved the key locally and authorized at most3 HTTP generation
attempts (greeting1/search1/continuation1). Boolean check: file present, key present,
enabled0. Live preflight is blocked by existing remaining3/reserve3 (used15/18,
ordinary reset2026-11-03T08:00:00Z); actual attempts0. No key/body/header was logged.
Do not change caps/reserve/ledger or activate a new budget to get around this.
Capability stays unverified/disabled; an explicit later resume can recheck normal
admission before consuming any of the unspent allowance. Current serving runtime
is preserved while this unenabled source is prepared.

Implementation: `b6935c2`. Final targeted run:12 adapter tests and3 existing model/session tests PASS (15 total); no project-wide suite was repeated. The earlier endpoint test used a relative fixture path and returned a data-source503; an absolute synthetic fixture path corrected that test setup. Current serving API remains952eb77 so interactive3350 testing is not interrupted; the new adapter/config catalog loads on a later owned restart after the key/setup checkpoint.

Resume update: both local listeners were found stopped and restored without replacing sessions or ledger. API now serves `6e4afeb`; read-only capabilities confirm `apithat:gpt-6-luna` is unavailable with `provider_disabled` and `native_tools_verified: false`. Web3350 returns HTTP200. Gemini remains default. The local API Thật key is still absent and enabled remains0; no generation was used for this verification.

## Local configuration

The ignored file already exists at:

`C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-claude-coordinator/backend/.env.apithat.local`

Open that file locally and fill only the empty `APITHAT_API_KEY=` value. Do not paste the key in chat, terminal commands, screenshots, reports or Git. Keep these settings:

```dotenv
APITHAT_BASE_URL=https://apithat.dev/v1
APITHAT_MODEL=gpt-6-luna
APITHAT_API_KEY=
FOODTOUR_APITHAT_ENABLED=0
```

The base and model above were explicitly confirmed by the user. The adapter appends `/chat/completions` to the base, producing `https://apithat.dev/v1/chat/completions`; it never appends a second `/v1`. Only HTTPS to this explicitly configured gateway is accepted. An invalid base, absent key, disabled provider or absent existing budget fails closed.

`tools/run_online_assistant.py` reads this file through a four-variable allowlist. Process environment takes precedence; the separate file cannot change model caps, ledgers, sessions or public client variables. Existing `backend/.env` and its Gemini configuration remain unchanged. `backend/.env.example` contains public placeholders only. `git check-ignore backend/.env.apithat.local` confirms exclusion.

## Protocol and evidence boundary

The [API Thật public homepage](https://apithat.dev/) advertises Chat/Responses routes and Bearer authentication. Its public [docs route](https://apithat.dev/docs) did not provide readable key/model-specific tool-call documentation during review. The user supplied the exact `gpt-6-luna` identifier from the key's model restriction; it was not guessed from the coordinator's model.

The adapter implements the documented [OpenAI function-calling message contract](https://developers.openai.com/api/docs/guides/function-calling): assistant `tool_calls` carry opaque IDs, each local result uses `role: tool` with the same `tool_call_id`, and continuation messages retain that pairing, including parallel calls. This verifies our offline mapping; it does **not** prove that this gateway/key/model supports it live. Responses API is not an automatic fallback: trying another route would create another potentially billable request.

API Thật is represented separately as `apithat:gpt-6-luna`, with provider `apithat`, actual configured model and response-reported model kept distinct. Its catalog row reports `native_tools_verified: false`; session selection stays unavailable even when a key is present. No operator flag can falsely mark native tools verified. A later explicitly authorized live tool/result continuation must establish evidence before this catalog gate is changed in a reviewed update.

## Limits and safety

- Existing LLM call ledger, session cap, reserve and turn-loop limits are reused; no new ledger or larger allowance is created. Every transport attempt is admitted before HTTP. No automatic retry, provider failover or model upgrade occurs.
- Request/response sizes and output tokens remain bounded; transport uses the existing HTTPS allowlist, no redirects/proxies and a maximum12second provider timeout within the current turn deadline.
- HTTP401/404/429/5xx, timeouts, malformed/truncated output and unsupported calls remain explicit errors. A gateway429 is reported as provider quota/rate failure; it does not fabricate exhaustion of the shared local daily ledger. The attempted call still counts.
- Grounded-price checks, exact IDs, read/mutation authorization, allergy unknowns, explicit confirmation and CAS remain server-owned. Exact origin/GPS, health details and entire menus/datasets are not sent to the gateway.
- Rules fallback remains labelled rules/tools, never relabelled as a successful API Thật answer. No key, Authorization header or raw provider error body is logged or returned to the client.

## Offline verification and next operator step

Targeted synthetic tests cover native search plus continuation, parallel IDs, malformed/orphan results,401/404/429/503/timeout handling without retries, shared admission, unsafe configuration, private-data projection, rejected invented prices/mutations, local-file allowlisting and disabled session selection. No external generation or real credential is used.

Next: enter the key in the local ignored file, leaving `FOODTOUR_APITHAT_ENABLED=0`, then report only that it has been saved. Live validation still needs a specific bounded allowance and usable existing quota/reserve; no ledger reset, credit purchase or cap increase is implied. Until that proof exists, the adapter is prepared but not live-enabled. No frontend change or new worker is required for the current disabled catalog entry; the existing selector already renders server-provided availability and labels.

See `docs/reports/APITHAT_PREPARATION.json` for sanitized configuration/test evidence. At initial QA restoration, original session/budget/cap fingerprints were unchanged. Later interactive app requests legitimately changed session bytes; those live changes were preserved rather than restoring an older snapshot. Budget and caps remain unchanged. No user Word document was modified.
