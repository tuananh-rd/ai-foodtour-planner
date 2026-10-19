# Online assistant implementation contract — OA1 (2026-10-19)

Approved scope: contextual LLM conversation around the existing deterministic state/planner, bounded Tavily BASIC retrieval, and interactive self-hosted OSM PMTiles display. Codex coordinates/reviews/integrates; Antigravity implements explicit task scopes. Historical full-ownership and Claude-required approvals are superseded for this initiative. No paid activation, remote publishing, autonomous tools or venue-data writes.

## OA1 conversation module: frozen internal interface

`backend/app/assistant/conversation.py` exports `ConversationalAssistant(provider=None)` and `AssistantReply`.

`respond(user_text, recent_turns, state, reply_blocks, *, deadline_s=8.0) -> AssistantReply` accepts plain Python structures; callers pass a private-free, bounded projection where necessary. `AssistantReply` exposes `status` (`ok`, `disabled`, `unavailable`, `quota`, `rejected`), `text` (nullable), `provider` (label, not a secret), and `llm_calls` (actual attempted calls). Existing configured `GeminiClient.generate_json(system, user_text, schema, *, deadline_s, max_output_tokens, retry=False)` is injected; the module must never instantiate credentials, enable providers, enlarge budgets or make its own HTTP requests.

The model adds bounded Vietnamese conversation, never a planner command, structured-state patch, confirmation, allergy clearance or evidence assertion. All inputs/outputs are untrusted. Use minimal context (last4 relevant text turns, bounded lengths; phase, pending slot, preferences excluding GPS/coordinates/private venue records/tokens). Redact coordinate pairs, contact details and secret-like strings. No prompt/history logging. Do not apply agent roleplay to product replies.

Validate strict JSON output and reject extra action/tool/patch fields. Reject invented venue/operational/price/time/allergy-safety claims, unsupported numeric facts and instruction leakage; rejected/provider/quota output falls back to the deterministic response with honest provider status. Preserve exactly one active decision question and every existing safety/confirmation warning. Never mutate supplied state/blocks. Tests use injected provider stubs; label external quality unverified unless actual bounded live evidence exists.

## Integration gates

OA1 is followed by state/API/UI wiring under separately listed ownership, then retrieval and map tasks. API OpenAPI export remains authoritative; additive public changes require Codex contract review and affected implementer review. New fields must survive revision conflict, reload and replacement without altering hard constraints.

Tavily requests are BASIC only with explicit fixed settings, durable daily AND monthly credit limits, atomic concurrent admission, bounded cache and no unaccounted retries. Missing key/network/quota returns unavailable honestly. Search does not receive GPS/history or write venue/evidence data. Citation URLs/timestamps refer to actual supported source snippets, not model-created sources. Reject private-IP/redirect/unsafe outbound URLs.

Map assets are local/self-hosted, licensed and attributed with measured bytes/source freshness and HTTP Range/CORS/cache tests. Display markers synchronized to actual tour state and a real toggle. No in-app real-routing claims; keep free Google Maps URLs for navigation. Missing assets produce honest fallback. Public OSM tile services, paid Maps APIs, billing, Docker and self-hosted OSRM are not enabled by this contract.

## OA3 retrieval interface (frozen for next bounded task)

New `app/providers/tavily.py` exports `TavilySearch` with `search(query, *, deadline_s=6.0)` returning a plain dict: `status` (ok/disabled/unavailable/quota/rejected), `sources` (at most3 objects with title/url/snippet), `fetched_at` (UTC ISO timestamp or null), `credits` (0 or1), `cached` (boolean). No history/GPS/state input. `from_env()` reads credentials internally only, requires explicit `FOODTOUR_TAVILY_ENABLED=1`, `FOODTOUR_TAVILY_FREE_ONLY=1`, a key in `TAVILY_API_KEY`, and an absolute persistent `FOODTOUR_TAVILY_BUDGET_DB`; invalid configuration disables/fails closed. No service/account setup.

Consume Codex-owned `app.repositories.search_budget.SearchCreditBudget(...,daily_limit=20,monthly_limit=500).admit()` before every attempted POST. Caps must not exceed monthly900 or existing configured daily/monthly values. No retries; failed requests remain charged conservatively. Fixed official HTTPS443 endpoint only; never fetch URLs from user/results, redirect, proxy or accept endpoint override. DNS must resolve entirely to global IPs; literal/private/loopback/link-local/reserved destinations and credentials in source URLs are rejected. Mitigate rebinding with a transport whose actual connected peer is validated/pinned, not merely a preflight DNS check.

If reported usage is missing, malformed or differs from exactly one BASIC credit, call `budget.block_current_month()` before failing closed; this persistent guard survives service restart and day rollover. Do not keep sending requests against an unexpected charging contract. Cache hits reserve no additional credit and return credits=0.

Use explicit BASIC settings documented in the provider verification report; validate actual response usage/size/schema and reject unexpected charges without attempting again. Bounded single-flight concurrency and bounded TTL cache; no query/history/key logging or persisted plaintext query. Inject a transport for hermetic tests. Redact or reject GPS/contact/secret/health details; reject instruction/URL payloads, keep only an explicit short food/area search query, not the complete chat message. Unsafe or empty projection returns rejected without admission. Treat snippets as untrusted quoted web text; strip markup/control characters/instructions, cap lengths, validate public HTTPS source URLs. Never claim current opening or allergy safety from snippets. No LLM synthesis of unsupported sources.

Public API wiring is Codex-owned: opt-in `ChatRequest.web_search` flag (defaultfalse, text-only), additive `web_search` reply block with the exact result shape; structured planner does not consume this block. UI must explain that only the explicit sanitized query goes to Tavily and show status/failure rather than pretend a search happened. Sources use ordinary escaped text/links with no HTML execution; a retrieval timestamp is not a verification timestamp. No automatic source-page scraping.
