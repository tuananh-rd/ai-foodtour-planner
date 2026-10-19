# Provider and map decisions — verified 2026-10-19

Official documentation governs these choices; the approved proposal remains a scope reference, not a pricing guarantee.

## Retrieval

Tavily Search BASIC costs one credit per request under the documented fixed settings; advanced costs two. Disable auto_parameters and explicitly set basic, include_answer=false, include_raw_content=false, include_images=false, max_results=3 and include_usage=true. The documented free allowance is 1,000 monthly credits, not an unconditional request allowance. No account creation, billing activation or service-plan changes are authorized.

Sources: https://docs.tavily.com/documentation/api-reference/endpoint/search and https://docs.tavily.com/documentation/api-credits.

Implementation must atomically reserve conservative credits per outbound attempt against durable daily and monthly limits, with bounded cache/concurrency and no automatic unreserved retries. Missing credentials, corrupt/unavailable ledger, quota and network failures must fail closed. Local limits cannot establish the account's remaining allowance when another application uses the same key; operator configuration must account for shared usage. Search queries exclude GPS/history. Web content cannot modify planner state or provide allergy clearance. No source-page fetching is needed for citations.

## Existing language model

The existing Gemini client defaults to gemini-3.5-flash-lite, with environment overrides preserved. The current official model/pricing pages distinguish ordinary model use from Search grounding; grounding is not available on this model's free tier. Do not activate grounding or change service tier. Model configuration and a successful mock test are not live-quality evidence. Reuse existing daily/session budgets; keep deterministic state validation authoritative.

Sources: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite and https://ai.google.dev/gemini-api/docs/pricing.

The official unpaid-service terms state that submitted content can be used to improve services and processed by human reviewers, and prohibit submitting sensitive/confidential/personal information. The new conversation path therefore omits health disclosures from context and refuses sensitive current turns before external classification/conversation; deterministic allergy handling remains local. Product disclosure must explain minimized context and discourage private information. Source: https://ai.google.dev/gemini-api/terms.

## Self-hosted pilot map

Choose MapLibre GL JS with the PMTiles protocol rather than the maintenance-mode Leaflet vector plugin. This is within the approved compatible-renderer option. Pin new package versions only after checking published upstream releases. Do not upgrade unrelated dependencies.

Sources: https://docs.protomaps.com/pmtiles/leaflet and https://docs.protomaps.com/pmtiles/maplibre.

Extract a bounded public OSM pilot region from an official Protomaps build; never download the planet archive or send private venue datasets. Record the actual build, bounds, zooms, bytes, hash and license/attribution. Public basemap data is ODbL-derived and requires OpenStreetMap attribution. Verify actual HTTP Range, caching and same-origin/CORS behavior. Resource costs are real; no unlimited-free hosting claim is made. Missing assets show an honest fallback; no public tile fallback, invented route geometry or added OSRM infrastructure.

Sources: https://docs.protomaps.com/basemaps/downloads, https://docs.protomaps.com/pmtiles/cloud-storage and https://docs.protomaps.com/guide/getting-started.


## Read-only account verification addendum

Official current [Usage API](https://docs.tavily.com/documentation/api-reference/endpoint/usage) documents GET /usage, including key usage/limit and account current_plan, plan_usage/plan_limit, paygo_usage/paygo_limit. [Pricing](https://docs.tavily.com/documentation/api-credits) names Researcher as the free plan; [key setup](https://help.tavily.com/articles/9170796666-how-can-i-create-an-api-key) documents provider-side monthly key limits. No authenticated request was made; Tavily key is absent.

The adapter must fail closed before search unless a fresh bounded usage snapshot proves the supported free-plan/no-PAYGO configuration and positive headroom. Codex's pure helper also requires an explicit sane provider key limit. Unknown names/schema are deliberately unsupported rather than inferred free; live response compatibility remains unverified until a locally configured free-only account is available. This gate adds no billing/account-setting mutation and cannot stop a human concurrently changing settings; local atomic daily/monthly accounting remains mandatory.
