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
