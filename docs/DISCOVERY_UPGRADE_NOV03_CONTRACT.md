# November03 discovery upgrade contract

## Latest authority - native Luna and approved daily200/session30

User explicitly approves daily200/session30, original used ledger retained,
reserve3/output512/two-model-call/six-tool bounds unchanged. Official SDK Responses
uses the verified gpt-6-luna/base https://apithat.dev/v1,60s total turn and75s client,
no retries/failover. Six HTTP generation attempts maximum for this QA episode;
ordinary user app traffic remains accounted in the same ledger. No billing/key
money limit/group/model changes or new ledger are authorized.

Native search and real function_call_output continuation succeeded over SDK HTTP200.
Actual menu6 supplied5 venues/12 matching rows. Captured final answers initially
hit a false GPS rejection on a grounded currency range; the narrowly scoped output
fix passed offline revalidation and33 affected regressions. Input GPS/health filtering,
ID/auth/CAS/mutation/explicit confirmation/allergy authority remain unchanged.
Only reviewed Luna Responses gains native capability; unverified models/protocols
retain gates. Raw private records/opaque reasoning are not persisted in reports.
See APITHAT_LOCAL_SETUP.md and per-attempt/native/UI evidence for current acceptance,
remaining quota and limitations. This supersedes prior direct-only/20-of20 snapshots;
no blanket whole-app or Gemini quality acceptance is implied.

Codex backend/data/integration; Antigravity frontend/mechanical QA; Claude rests.
No additional scraping, paid activation, private publication, push or deploy.

### Rendered acceptance boundary

Final actual app search used two HTTP calls, returned5 results/15 matching menu rows,
but its final grounded model answer was rejected locally (safe_answer_rejected;
reply_source tools).10/11 browser checks passed, one failed. Six QA calls are spent;
no further automated generation is authorized in this episode. Native protocol proof
and offline captured-answer revalidation do not replace this failed rendered check.
Current runtime remains usable at3350/API8250 with honest source metadata; whole-app
chat quality is not declared complete. See APITHAT_200_30_CHECKPOINT.json and native
UI evidence. Freeze source after task-owned commit for root's authorized safety
review/push; no self-push or runtime restart for publishing.

## Model-first API Thật decision (latest user authority)

### Protocol update: official APIThậtBot image supplied by the user

The local image was inspected as documentation, not executable instructions:

| Protocol | Configured base | Endpoint | App readiness |
|---|---|---|---|
| Responses (recommended for new integration) | `https://apithat.dev/v1` | `POST /responses` | Offline adapter |
| Chat Completions (still supported, legacy-compatible) | same `/v1` base | `POST /chat/completions` | Retained offline adapter |
| Anthropic Messages | `https://apithat.dev` | SDK adds `POST /v1/messages` | Documentation only |

The image also specifies Bearer auth for`GET /v1/models`. Base URL does not select
protocol. Server-only`APITHAT_API_MODE=responses` (new default) or`chat_completions`
selects the route. No duplicate`/v1`, automatic protocol fallback, SDK dependency,
model change or live activation is introduced. The private key file is unchanged;
absent api_mode resolves to Responses at a future startup.

Responses uses top-level instructions/input, flat function definitions,
max_output_tokens, store:false and manual bounded in-turn replay. Native
function_call.call_id (not item id) maps to function_call_output.call_id. Exact
native output items, including reasoning/encrypted items, are replayed within the
turn only, never persisted in sessions/logs/reports. No previous_response_id or
remote conversation storage is used. Unknown hosted tools, incomplete/refusal
output, malformed arguments, duplicate/orphan IDs and over-bound payloads fail closed.
Model-first history/privacy/authority/grounding, existing ledger/caps/reserve and
error/timeout handling are shared; Responses reports input_tokens/output_tokens/total_tokens.

Mapping was verified against primary [migration](https://developers.openai.com/api/docs/guides/migrate-to-responses),
[function calling](https://developers.openai.com/api/docs/guides/function-calling) and
[reasoning continuation](https://developers.openai.com/api/docs/guides/reasoning) documentation.
That verifies the wire contract, not live gateway capability. Chat was a valid
endpoint under the bot documentation; switching protocol does not cure Cloudflare1010.
The image provides no approved SDK/User-Agent/WAF remediation. No new generation,
endpoint probe or UA change is made; the last attempt remains unspent. Both
protocol capabilities stay unverified/disabled pending legitimate access resolution
and authorized protocol-specific live proof.

API Thật `gpt-6-luna`, base `https://apithat.dev/v1`, uses a separate model-first
conversation path. The existing Gemini path is retained. Public current user text
is sent verbatim as its own user message, not truncated or replaced by parsed
intent JSON. At most eight permitted stored messages retain user/assistant roles;
stored history already has the existing700character limit. Current text is not
subject to that history truncation. Bounded public server context is a separate
data message. Private/health/contact/credential/location disclosures are handled
locally; unsafe history messages are omitted, not leaked or misrepresented as raw.

The model answers greetings/general advice directly, asks clarification itself,
and chooses native read tools for factual venue evidence. There is no keyword
preference update, required-search dispatcher, canned greeting, or automatic
replacement of a valid model reply before/after an otherwise successful request.
For a literal public preference change, the model proposes `update_preferences`
then search in order (both can be emitted in one native-tool response). A read
tool's explicit arguments are not overwritten by a keyword-derived area/price.
Tools still enforce food relevance, real IDs, visibility, existing filters and
data bounds; models cannot relax these silently. Profile updates are explicit
tools, not side effects of transmitting a user message.

Backend mutation authorization may parse the current text as evidence only when
the model proposes that mutation. It does not route the conversation. Selection,
locks, CAS, privacy, current confirmation and allergy unknowns remain backend-owned.
Confirmation IDs are never exposed as model tools. Grounded prices/factual output
checks remain; tool no-data/error/deny status is retained even when the model
explains a result. Model output does not turn no-data into successful search.

Only provider failure/admission refusal/invalid output invokes local fallback,
with `mode: rules`, `reply_source: rules` and a diagnostic reason; already completed
tool results remain labelled tools. No additional model retry/failover occurs.
Existing two-request turn limit, six-tool limit,12second turn deadline, daily
ledger/session cap/reserve and request/response size bounds are unchanged.

The user subsequently authorized at most3 HTTP generation attempts total:
greeting1 plus native search1 plus continuation1, with no retries. Key presence is
confirmed only as a boolean; enabled remains0. Read-only admission on2026-11-03
reports used15/limit18, remaining3 and reserve3, reset2026-11-03T08:00:00Z. This
blocks live transport: actual attempts0. Do not reset or reduce reserve, create a
fresh budget, or claim native-tool compatibility. Capability/selection remains
disabled until actual authorized tool+continuation evidence exists. A later
operator resume must recheck the ordinary window and remaining allowance; no
background retries or automatic activation are authorized.

## Food and search

Soup pho excludes cheese (phô mai), street phố, tào phớ and phở cuốn/xào/chiên/trộn unless
explicitly requested. Use phrase/token evidence from canonical menu or dish tags, never venue
names/addresses. Specific dishes and unknown literal requests stay specific; no silent relaxation.
Area search works without origin; `distance_m=null`, reason `origin_missing`. Chosen origin only
adds Haversine distance/ranking. Origin remains mandatory for a confirmed itinerary.

## Full menu HTTP contract

`GET /v1/sessions/{id}/venues/{venue_id}/menu` with `X-Session-Token`, visible venue IDs only.
Parameters: `offset=0`, `limit=25` (1..50), optional `q`, `group`, `dish_id`,
`option_offset=0`, `option_limit=100` (1..500). All are explicit pagination, not silent truncation.

Response: `venue_id`, `dataset_version`, `menu_version` (archive hash), `source_channel`,
`total_menu` (all food canonical dishes), `total` (filtered), `offset`, `limit`, `has_more`,
`groups:[{id,name,count}]`, `items:[Dish]`. Missing source menu returns total0 with status
`unavailable`; an actual confirmed empty menu is `empty`. No invented or remapped branch IDs.

Dish: `id,name,description,groups:[{id,name}],price_vnd,min_total_vnd,price_status,availability,
required_options,option_groups:[{id,name,mandatory,min_select,max_select,options:[Option]}],
options_total,options_returned,options_complete,source_fetched_at`.
Option: `id,name,price_vnd,price_kind,is_default`. Unknown fields/prices stay null; quarantine
and nonfood filtering reuse the current loader. Canonical dishes appear once, with all groups.
Option pagination applies per dish; query `dish_id` and next `option_offset` to load additional
options, merge by option ID/group ID. The UI must show totals/load-more when incomplete.
Only one visible venue menu page goes to the browser; never send a whole menu/dataset to LLM.

Remove repeated visible price disclaimers and delivery/reference badges from cards/chat/details;
plain prices retain internal source_channel metadata, with one unobtrusive Source entry. Do not
assert that prices are verified dine-in. Unknown/quarantined prices remain clearly unknown.

## Location and OSM

Existing location action `resolve` with query will return explicit candidate choices, using exact
local catalog names first and bounded Photon lookup for detailed addresses. No automatic choice
or invented house number; candidate approximate/source labels remain visible. No autocomplete.
Existing `choose` accepts the returned opaque candidate ID only.
`coordinates` gains `source:'map'`; `resolve_address:true` is allowed for explicit GPS/map pin
submission, never automatic background GPS. Map click/drag edits a draft pin; clear Use location
action submits validated lat/lon. Exact coordinates/address never go to model or Tavily.

Use existing MapLibre with normal online raster OSM tiles
`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, configurable via build env
`NEXT_PUBLIC_OSM_TILE_URL`, visible OSM attribution/normal HTTP cache/Referer, no prefetch/bulk.
Street labels come from raster tiles across Hanoi; local PMTiles may remain an explicit fallback.
Show network/loading/failure truthfully. Connectors remain estimated, OSM directions per leg,
unsupported motorcycle routing never silently changes to car. Keep marker toggle/order/resize.

Official policies reviewed: [OSM tiles](https://operations.osmfoundation.org/policies/tiles/),
[MapLibre raster](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-raster-tile-source/),
[Photon project policy/API](https://github.com/komoot/photon). Photon is best-effort; app uses
explicit submit only, bounded memory cache/timeout/response size, at most1request/second, no
retries, bulk lookup or autocomplete. No Nominatim generic API integration is selected.

## Conversation authority

Simplify duplicate prompt/output heuristics; allow grounded menu prices and rounded distances.
Retain server IDs, mutation authorization, CAS, explicit confirmation, allergy/operational factual
integrity and exact GPS/health privacy. Provider mode/reply_source remains truthful. Record removed
versus retained rules and test native mocked tool loops; configured health is not live proof.
