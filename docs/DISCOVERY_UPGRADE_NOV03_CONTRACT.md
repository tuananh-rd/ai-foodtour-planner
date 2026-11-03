# November03 discovery upgrade contract

Latest user authority: Codex backend/data/contracts/integration; Antigravity frontend/mechanical
QA; Claude rests. No AI generation allowance, ledger/cap changes, paid activation or publication.

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
