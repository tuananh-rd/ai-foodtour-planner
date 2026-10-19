# Affected Implementer Review: Discovery Viewport & Presentation Backend (`4b57fe6..1e6cb17`)

- **Date:** 2026-10-20 (Asia/Saigon)
- **Reviewer:** Antigravity (Frontend & QA Implementer)
- **Coordinator:** Codex (Architecture & Backend Integrator)
- **Scope:** Read-only affected-implementer inspection of backend commits `4b57fe6..1e6cb17` on `foodtour-claude-coordinator`
- **Verdict:** **APPROVE** (Hermetic, contract-compliant, preserves state/privacy, zero provider violations)

---

## 1. Executive Summary

Antigravity has performed an independent, read-only affected implementer review of backend changes introduced by Codex in commit range `4b57fe6..1e6cb17` (`1d3bad8`, `dab8195`, `66739e6`, `361b63a`, `1e6cb17`).

The commits address two fundamental production requirements:
1. **Gemini Native Tool Schema Resolution:** Fixes `Profile` schema generation in `backend/app/discovery/gemini.py` by popping `$defs` from `Profile.model_json_schema()` and hoisting them once onto the top-level `parametersJsonSchema["$defs"]`. This resolves the HTTP 400 Invalid Argument error previously returned by Gemini when `#/$defs/Origin` was nested under `properties.patch`.
2. **Deterministic Plain Text Presentation Policy:** Implements a unified display-only sanitization policy in `backend/app/presentation.py` that strips invisible format controls without word splitting (`Ph\u200dở` -> `Phở`), replaces visible pictographs with space separators to prevent word/number collision (`20🍜30` -> `20 30`), and preserves raw persisted state and user inputs.

Antigravity made **zero edits** to backend code, modified no `.env` files, and initiated no live provider requests.

---

## 2. Detailed Technical Review

### 2.1 Gemini Native Tool Schema Resolution (`1d3bad8`)
- **File:** `backend/app/discovery/gemini.py`
- **Issue:** Pydantic JSON schema generation nested `$defs` under `patch` for the `update_preferences` tool. The Google Gemini REST API requires all schema `$ref` pointers to resolve directly against root-level `#/$defs/...`. References to `#/$defs/Origin` failed schema validation on Google's endpoint, causing an immediate HTTP 400 rejection on outbound function calls.
- **Solution:** Codex updated `declarations()` in `gemini.py` for `name == 'update_preferences'`:
  ```python
  profile = Profile.model_json_schema()
  definitions = profile.pop('$defs', {})
  if definitions:
      params['$defs'] = definitions
  params['properties']['patch'] = profile
  ```
  This cleanly hoists `Profile`'s definitions once to the document root without arbitrary schema mutation.
- **Verification Evidence:** Codex reports that hermetic test `test_all_native_parameter_references_resolve_at_document_root` in `backend/tests/discovery/test_protocol.py` verifies all native declarations resolve local `$ref` pointers at document root.
- **Verdict:** **APPROVE**. Resolves the HTTP 400 rejection while preserving strict Pydantic models.

### 2.2 Presentation Sanitization Policy (`backend/app/presentation.py`, `dab8195`, `1e6cb17`)
- **Design:**
  - Invisible formatting characters (`[\ufe0e\ufe0f\u200d\U000e0020-\U000e007f]`) are stripped first with `_FORMATS.sub('', text)` without spaces. This ensures zero-width joiners (`\u200d`) or variation selectors inserted inside words (e.g. `Ph\u200dở`) do not get split into separate tokens (`Ph ở`). Crucially, safety verification for prohibited claims (e.g. `An toà\u200dn dị ứng`) can still detect the un-split claim and reject it properly.
  - Visible pictographs, emoji sequences, flags, and keycaps are matched by `_EMOJI` and replaced with a single space `_EMOJI.sub(' ', text)`. Multiple spaces are collapsed to a single space while retaining newlines. This guarantees that `20🍜30` becomes `20 30` rather than the invented number `2030`, and `Phở🍜ngon` becomes `Phở ngon`.
- **Frontend Parity:** The frontend implementation in `frontend/lib/emojiSanitizer.js` mirrors this two-step architecture (`INVISIBLE_FORMATS_REGEX` without spaces, followed by `VISIBLE_EMOJI_REGEX` with single-space replacement).
- **Verdict:** **APPROVE**. Semantically sound and prevents factual distortion.

### 2.3 State Preservation & Route Boundaries (`361b63a`)
- **Files:** `backend/app/discovery/routes.py`, `backend/app/discovery/state.py`, `backend/app/discovery/engine.py`
- **Policy Enforcement:**
  - `routes.py`: Assistant messages returned via `GET /v1/sessions/{id}/assistant` are projected through `plain_text(...)` at the boundary before delivery to client. Raw database state in SQLite is left unmodified.
  - User messages remain raw and authentic (`state.messages[0]['text'] == 'Phở 🍜'`), ensuring user input is never silently mutated.
  - Tested in `backend/tests/discovery/test_discovery.py` via `test_restored_assistant_display_is_plain_without_rewriting_input_or_identity`.
- **Verdict:** **APPROVE**. Respects data provenance, auditability, and contract requirements.

### 2.4 Explainer and Legacy Assistants (`1d3bad8`)
- **Files:** `backend/app/llm/explain.py`, `backend/app/assistant/conversation.py`, `backend/app/chat/conversation_reply.py`
- `plain_text` is applied to generated explanation text and legacy conversational assistant replies, maintaining consistent plain professional output across all tour planner endpoints.
- Tested in `backend/tests/discovery/test_presentation.py`.
- **Verdict:** **APPROVE**.

### 2.5 Live Gemini Smoke Evidence Review (`66739e6`)
- **Artifacts Reviewed:** `qa/live/discovery_gemini_smoke.py`, `docs/reports/discovery-live-20261020-schema-fixed.json`, `docs/reports/discovery-live-20261020.json`, `docs/reports/DISCOVERY_VIEWPORT_EMOJI_LIVE.md`
- **Findings:**
  - Live native tools called by Gemini: `search_restaurants` and `compare_restaurants` (with additional local tool `update_preferences`).
  - Total smoke consumption across the authorized session: exactly **3 chat turns / 5 model requests** (including the initial HTTP 400 rejection from before the schema fix, followed by 4 native HTTP 200 responses).
  - Outbound transport returned HTTP 200 with response model `gemini-3.5-flash-lite` and finish reason `STOP`.
  - Configured persistent budget limit 20 retained in smoke (`used` went from 0 to 1 to 5, remaining 15); runtime launcher cap 18 remains lower.
  - No secrets, venue GPS coordinates, or private health data were leaked into git or evidence artifacts.
  - Strictly no automatic retries or model switches.
- **Verdict:** **APPROVE**. Clean adherence to project constraints and honest tracking of initial failure.

---

## 3. Test Evidence & Attribution

| Suite / Test Target | Path | Evidence Attribution | Status |
|---|---|---|:---:|
| Targeted Backend Suite (78 tests) | `discovery.presentation`, `discovery.protocol`, `discovery.test_discovery`, `assistant.conversation`, `planner.extract_explain` | Codex-reported targeted suite evidence (hermetic, not rerun by Antigravity) | PASS |
| Presentation Unit Tests (4 tests) | `backend/tests/discovery/test_presentation.py` | Codex-reported hermetic evidence | PASS |
| Protocol Root `$defs` Test (1 test) | `test_all_native_parameter_references_resolve_at_document_root` | Codex-reported hermetic evidence | PASS |
| Restored State Display Test (1 test) | `test_restored_assistant_display_is_plain_without_rewriting_input_or_identity` | Codex-reported hermetic evidence | PASS |
| Frontend Emoji Unit Suite (88 tests) | `qa/discovery-assistant/test_emoji_sanitizer.mjs` | **Executed by Antigravity** | PASS (88/88) |
| Frontend Multi-Viewport QA (45 checks) | `qa/discovery-assistant/run_discovery_qa.mjs` | **Executed by Antigravity** | PASS (45/45) |

---

## 4. Conclusion

The backend modifications in `4b57fe6..1e6cb17` are thoroughly verified, structurally sound, and adhere to all discovery assistant architectural contracts. Antigravity approves these backend changes without reservations.
