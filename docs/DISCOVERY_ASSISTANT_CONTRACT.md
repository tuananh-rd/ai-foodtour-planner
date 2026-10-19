# Discovery assistant HTTP contract — discovery-v1

Status: frozen initial implementation contract. Codex owns backend/schema; Antigravity reviews consumed shape. Session creation/auth stays existing POST /v1/sessions and X-Session-Token. Existing page passes sessionId/sessionToken/revision/health/initializing/initError/onRetryInit/onResetSession to the new layout. Do not seed parent legacy DEFAULT_PREFERENCES into discovery.

GET /v1/sessions/{id}/assistant returns current discovery view; POST same URL sends exactly `{revision:integer,text:string}` OR `{revision:integer,action:object}`. Text1..1000 characters; no Tavily/web_search field. Stale revision409 includes latest revision; re-fetch view without replaying mutation. No silent session replacement on transport failure. Every successful turn advances session revision; state mutation additionally advances its respective profile_version/selection_version. Snapshot restore uses the same view and bounded messages.

Actions (strict allowlist):

- `{type:"tool",name:"search_restaurants",arguments:{dish?:string,area?:string,max_price_vnd?:integer}}`
- `{type:"tool",name:"get_restaurant_details",arguments:{venue_id:string}}`
- `{type:"tool",name:"compare_restaurants",arguments:{venue_ids:string[]}}` (2..5)
- `{type:"tool",name:"update_preferences",arguments:{patch:object}}`
- `{type:"tool",name:"update_foodtour_selection",arguments:{operation:"add"|"remove"|"lock"|"unlock",venue_ids:string[],selection_version:integer}}`
- `{type:"tool",name:"create_itinerary",arguments:{}}` prepares confirmation/missing-context response, never skips the gate.
- `{type:"tool",name:"revise_itinerary",arguments:{}}` invalidates prior confirmation and prepares a revised summary.
- `{type:"confirm",confirmation_id:string}` explicit current-confirmation button. Never manufacture a confirmation_id; model tool calls cannot confirm themselves.

Preference patch keys: area(string|null), origin({lat,lon}|null), party_size(int1..20|null), budget_vnd(positive int|null), budget_scope(group|per_person|null), start_time(HH:MM|null), end_time(HH:MM|null), duration_min(int30..720|null), vehicle(walk|motorbike|car|taxi|null), tastes(string[]), exclusions(string[]), allergies(string[]), max_leg_min(int3..60|null). Omitted fields stay unchanged. “500k cho2người” explicitly implies group unless contradictory per-person language. Search max_price_vnd is a per-venue discovery filter, not trip budget. Selection bound5; no unchecked ID or positional guesses.

Response view (also POST response):

```
{
 contract:"discovery-v1",session_id,revision,profile_version,selection_version,
 status:"ok"|"unknown"|"no_results"|"tool_error"|"unavailable"|"no_solution",
 reply:{text:string,question:string|null},
 profile:{area,origin,party_size,budget_vnd,budget_scope,start_time,end_time,duration_min,vehicle,tastes:[],exclusions:[],allergies:[],max_leg_min},
 results:[Restaurant], selection:[Restaurant],
 comparison:null|{venues:[Restaurant],criteria:[string],unknowns:[string]},
 confirmation:null|{id,profile_version,selection_version,summary:object,warnings:[string]},
 messages:[{role:"user"|"assistant",text:string}],
 tour:null|existing TourView,
 source:{dataset_source:"synthetic"|"private",dataset_version:string},
 provider:{mode:"rules"|"gemini"|"mock",calls:int,reason?:string},
 diagnostics:{tool_calls:int,elapsed_ms:number,weather:"unavailable"}
}
Restaurant={id,name,address,district,lat:number|null,lon:number|null,dish_tags:[],price:null|{min_vnd,max_vnd,semantics:"venue_range",evidence},hours:null|{display,status},source_url:string|null,source_fetched_at:string|null,unknowns:[string],label?:"A".."E",locked:boolean}
```

Source URLs describe venue provenance, not live-web citations. Unknown taste/ingredient/price/amenity coverage is displayed, never asserted as a match. Stored state contains IDs/preferences/versioned confirmation and bounded sanitized messages, not copies of the dataset. Data-version changes invalidate confirmation/tour and revalidate IDs. Model receives no full dataset or exact GPS/private raw records. Relevant sanitized tool results only, bounded projection; no key/prompt/history logs. Natural model text must not establish backend mutation success or make unsupported numerical/venue/allergy claims.

Frontend main chat is natural text/results/comparison, with optional single clarification; no placeholder field matrix. Collapsed optional trip editing/selection lives outside the message stream. Confirmation only when provided by backend; render warnings, send current ID on explicit confirm. Selection list/map markers derive backend selection/tour, not optimistic claims. Existing GuidedTimeline/PilotMap may be reused; replacement/edit replans through the new endpoint and confirmation gate, not stale legacy shortlist actions. All controls functional or omitted. No mock fallback on actual network/provider failure. Keep current Warm editorial layout/spacing/type and desktop/mobile accessibility. Diagnostics in secondary details.

Official integration references verified2026-10-19: https://ai.google.dev/gemini-api/docs/function-calling and https://ai.google.dev/gemini-api/docs/thought-signatures. Reuse existing generateContent REST/model, not a model migration or SDK addition; preserve full returned model parts/signatures within bounded tool loop. No live-probe acceptance is implied.

Implementation clarification: Restaurant additionally includes optional `rating:null|{value:number,count:int|null}` from the existing venue source. HTTP request and response schemas are exported in `contracts/v1/openapi.json` from Pydantic; this is the machine-readable source of truth. Preference string terms are bounded to80 characters, allergy terms40. Native REST definitions use `parametersJsonSchema`; function-call IDs are echoed in function responses and exact model parts/thought signatures retained only inside the current turn (https://ai.google.dev/api/generate-content).

The conversation loop permits at most2 model attempts,6 tools,12 seconds and512 output tokens per generation, further restricted by existing daily/session caps and reserve. Each concurrent text turn conservatively reserves up to2 existing session attempts before transport, without refunds; this can exhaust session allowance earlier but cannot increase it. Private health/contact/precise personal location turns use deterministic tools locally with0 model calls. Public user turns are bounded to4 for contextual projection; no record-derived assistant history is sent. No Tavily, external weather, new database service or migration is introduced. Existing local ledger files and credentials remain untouched; historical web probes/configuration instructions are retired and must not be run.

2026-10-20 presentation/protocol clarification: product text contains no Unicode emoji, including model output and restored assistant replay. Display normalization must preserve Vietnamese, ordinary numbers, safety/uncertainty wording and authoritative IDs. It must not rewrite raw user input, private datasets, credentials or session identifiers. Existing SVG icons or professional text replace decorative emoji; this is not a change to the HTTP schema, confirmation authority or stored venue facts. Native function parameter JSON schemas resolve Pydantic `$ref` from the function parameter document root, with `$defs` at that root. The explicitly authorized three-chat/six-request live smoke is a bounded exception to the prior no-probe delivery; details and retained failure/success evidence are in `reports/DISCOVERY_VIEWPORT_EMOJI_LIVE.md`.
