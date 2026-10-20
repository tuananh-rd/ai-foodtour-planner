# Discovery location, chat models and optional web - 2026-10-20

Baseline: `200405a` / frontend `4fdfe92`. Direct user instruction supersedes Tavily retirement. Codex owns this contract, backend/AI/runtime and integration; Antigravity owns dispatched frontend/QA. Claude inactive. Preserve existing session token/revision, explicit confirmation, allergy, raw-ID, privacy, free Maps, no-emoji and fluid Warm editorial gates.

## Additive discovery-v1 contract

Existing tools/actions remain compatible. `GET /v1/assistant/capabilities` makes no provider request and returns:

```json
{
  "contract": "discovery-v1",
  "default_chat_model": "verified configured model ID or null",
  "chat_models": [{"id": "verified ID", "label": "display label", "available": true, "reason": null, "native_tools_verified": true}],
  "web_search": {"provider": "tavily", "configured": false, "available": false, "free_only": true, "reason": "unavailable"},
  "location": {"mode": "local_catalog", "coordinates_supported": true, "arbitrary_address_geocoding": false}
}
```

IDs are examples of field shape, never real options to hardcode. Only backend-verified Gemini IDs are listed; Gemini is the chat provider and Tavily is a separate web provider. Default model/caps never increase. Availability also depends on key and shared remaining budget. No automatic model substitution. A model change does not reset session/daily usage or other sessions.

`POST /v1/sessions/{id}/assistant` retains revision/token ownership. In addition to existing text/tool/confirm actions:

- `action:{type:"settings",arguments:{chat_model:"verified ID",web_search_enabled:false}}`; either settings key may be supplied, at least one required. Settings are session-specific, default web off. No model call, venue selection mutation, tour creation or quota reset.
- `action:{type:"location",arguments:{operation:"resolve",query:"typed place"}}` returns candidates from the local catalog. It does not silently choose an origin. No remote arbitrary-address geocoding claim.
- `action:{type:"location",arguments:{operation:"choose",candidate_id:"server-issued candidate"}}` selects a resolved candidate explicitly.
- `action:{type:"location",arguments:{operation:"coordinates",lat:21.0,lon:105.8,source:"gps"}}` selects validated browser coordinates; `source:"coordinates"` is used for manually entered coordinates. GPS is requested only after a user click. No GPS sent to Gemini/Tavily.
- `action:{type:"location",arguments:{operation:"clear"}}` clears the origin and invalidates confirmation/tour.

All actions return the updated AssistantView and increment the optimistic revision. Unknown model/candidate, malformed/out-of-coverage coordinates and extra arguments fail closed, without silent model/location fallback. UI preserves failed drafts and handles conflict/auth/quota errors as before.

AssistantView gains:

```json
{
  "settings": {"chat_model": null, "web_search_enabled": false},
  "location": {"status": "unset", "label": null, "source": null, "approximate": false, "candidates": []},
  "web": {"enabled": false, "status": "off", "reason": null, "sources": []}
}
```

`location.status`: `unset|candidates|chosen|not_found`; candidates contain `{id,label,lat,lon,kind,approximate}`. Local street/district centroids are explicitly approximate. Multiple matches require an explicit candidate choice; old origin remains until a valid choice. The chosen coordinate remains `profile.origin`. Search area and actual starting origin are separate: asking for food in Hai Ba Trung updates the search area and remembered dish intent, without silently moving the chosen origin. No automatic Hoan Kiem origin/default.

`web.status`: `off|ok|unavailable|quota|blocked|no_results`; sources contain `{title,url,retrieved_at,snippet,untrusted:true}`. Sources are bounded, untrusted, never authorize tool mutations or establish opening/allergy safety. Null/malformed provider limits remain blocked by the existing free-only fuse and separate durable Tavily ledger. Web off/private GPS/health turns perform zero search. No live Tavily test until free-only eligibility is proven.

Each Restaurant in results/selection/comparison gains `distance_m:number|null`, `distance_source:"haversine"|null`, `distance_reason:string|null`. Backend computes distance from the actual selected origin and valid venue coordinates. UI labels it “đường chim bay”; unknown coordinates show “Chưa có khoảng cách”. No ETA or road-distance implication and no null-to-0,0 conversion. Origin changes recompute distance/order where relevant, invalidate confirmation/tour, and preserve explicit selection order/locks and IDs.

## Conversation and navigation

General knowledge/greeting works without location onboarding. Venue search asks at most one question to choose location when origin is missing, while retaining the user's new area/dishes. Search/details/compare are read-only: legitimate natural requests do not need mutation permission. Preference updates explicitly expressed by the user are allowed; selected venues change only on valid selection actions/intent. Planning retains the versioned explicit confirmation gate. Distinguish no local data, tool failure, authority denial and missing origin; do not emit a blanket permission denial for ordinary food requests.

Keep local PMTiles markers/toggle. Completed tours show a clear “Xem lịch trình trên Google Maps” CTA. Existing verified URL builder is retained: `https://www.google.com/maps/dir/?api=1`, actual chosen origin, ordered stops/destination/travelmode, bounded/split waypoint and URL-length limits, truthful validated address fallback.

## Verification and live limits

Mock-targeted then actual application E2E: exact screenshot sentence and followups; stale-area correction; read-only search/details/compare and safe selection; GPS click/denied/timeout/unavailable, manual/ambiguous/change; distances known/unknown; model session isolation/invalid/error/quota; web off/on unavailable and source injection; ordered multi-leg Maps; desktop/mobile/fluid/no emoji.

New live Gemini allowance is at most three user turns and six total model requests including continuations, zero automatic retry, and lower existing caps/ledger retained. Model catalog/function compatibility discovery may not invent model names or count HTTP200 alone as conversational quality. Inspect actual returned tools/results/reply; sanitized evidence excludes keys, raw private records, precise user GPS/health. Do not repeat previous smoke or call Tavily live. Stop on actual provider/quota failure and report the blocker; no billing/credit purchase.

Provider evidence adds optional `reply_source: model|tools|rules|null`. Configured provider/model and native request counts are independent of reply authorship: a failed tool-result continuation may retain validated tool output but must not be displayed or reported as a completed natural model answer.
