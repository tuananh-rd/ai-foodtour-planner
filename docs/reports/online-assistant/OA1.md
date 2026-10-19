# OA1 Module Implementation Report: Conversational Assistant

- **Date:** 2026-10-19
- **Author:** Antigravity (dispatched worker)
- **Coordinator:** Codex
- **Contract Reference:** `docs/ONLINE_ASSISTANT_CONTRACT.md` (OA1)
- **Task ID:** `task_6470a24ebdd6`
- **Dispatch ID:** `ctx_c420f30a25d2`

---

## 1. Executive Summary

Implemented the new bounded Vietnamese conversational assistant module (`app.assistant`) adhering strictly to the frozen OA1 contract. The module wraps the conversational layer around the deterministic state/planner pipeline via dependency injection of `GeminiClient.generate_json`. It strictly protects data privacy, enforces state/block immutability, guards against allergy clearance claims and factual hallucinations, and fails over safely to deterministic responses with honest status reporting.

All 21 targeted unit tests pass cleanly in both coordinator and local `.venv` environments.

---

## 2. File Ownership & Boundary Verification

The changes strictly adhere to the dispatched ownership boundaries:
- **Created Modules:**
  - `backend/app/assistant/__init__.py`: Exports `ConversationalAssistant` and `AssistantReply`.
  - `backend/app/assistant/conversation.py`: Core logic for context projection, privacy redaction, provider invocation, schema validation, safety guards, and deterministic fallback.
- **Created Unit Tests:**
  - `backend/tests/assistant/__init__.py`
  - `backend/tests/assistant/test_conversation.py`: 21 comprehensive test cases.
- **Documentation:**
  - `docs/reports/online-assistant/OA1.md`: This durable report.
- **Untouched:**
  - `backend/app/main.py`, `backend/app/api/*`, `backend/app/chat/*`, `backend/app/planner/*`, `backend/app/providers/*`, `contracts/*`, frontend, and existing tests remain completely untouched and owned by Codex.

---

## 3. Technical Implementation Details

### 3.1 Interface & Contracts
- **`ConversationalAssistant(provider=None)`**:
  - `provider` is injected; no hardcoded credentials or HTTP transport inside the module.
  - Exposes `provider_label` (model name or label, never secret keys) and `is_configured`.
- **`AssistantReply`**:
  - Immutable frozen dataclass with attributes:
    - `status`: One of `{"ok", "disabled", "unavailable", "quota", "rejected"}`.
    - `text`: Optional nullable string.
    - `provider`: Provider label string.
    - `llm_calls`: Integer indicating actual attempted calls (0 or 1).
- **`respond(user_text, recent_turns, state, reply_blocks, *, deadline_s=8.0) -> AssistantReply`**:
  - Read-only processing of inputs; never mutates supplied `state` or `reply_blocks`.

### 3.2 Privacy & Context Bounding
- **Redaction (`redact_sensitive`)**:
  - Coordinate pairs (e.g., `(21.0285, 105.8542)`, lat/lon patterns) replaced with `[redacted_coord]`.
  - Phone numbers (Vietnamese patterns) replaced with `[redacted_phone]`.
  - Emails replaced with `[redacted_email]`.
  - API keys, bearer tokens, hex secrets replaced with `[redacted_secret]`.
- **Minimal Context Projection**:
  - Only the last 4 text turns are included; each turn is bounded to at most 250 characters.
  - Safe state projection: Includes `phase`, `pending` (kind/slot), safe `profile` slots (`party_size`, `budget`, `duration_min`, `vehicle`, `max_leg_min`, `stops`), and `has_allergy`.
  - Coordinates, raw GPS, private venue IDs, and session tokens are excluded.

### 3.3 Safety, Schema & Content Guards
- **Strict Schema Enforcement**:
  - The model must return valid JSON strictly conforming to `{"reply": "..."}`.
  - Any extra fields (e.g., `action`, `tool`, `patch`, `commands`, `state`) trigger immediate rejection (`status="rejected"`).
- **Allergy Clearance Guard**:
  - Statements asserting allergy safety or guaranteeing absence of allergens (e.g., "an toàn cho người dị ứng", "không lo dị ứng", "cam kết an toàn") are rejected immediately.
- **Instruction Leakage & Roleplay Guard**:
  - Leaks referencing "system prompt", "system instruction", or prompt injection are rejected.
  - Internal agent persona language (e.g., "Đại Ca", "tiểu đệ", "đàn em") is rejected; replies to end users must remain professional Vietnamese.
- **Active Decision & Question Preservation**:
  - When `state` contains an active pending decision (`pending` is not None), the assistant strictly forbids extra questions (`?` triggers rejection) to ensure the user is not confused by conflicting questions.
  - When no decision is pending, at most one clarifying question is allowed.
- **Hallucinated Numeric Facts & Venues**:
  - Specific prices (e.g., `60.000đ`, `50k`), specific hours (e.g., `6h30`), and ratings (e.g., `4.8 sao`) not present in context are rejected.
  - Invented named venues not present in context are rejected.

### 3.4 Fallback Strategy
- When disabled, unavailable (timeout/connection failure), quota-exhausted (HTTP 429), or rejected by validation guards:
  - Deterministic text is extracted from `reply_blocks` (e.g. text blocks, notices, or clarify questions) without mutating the original blocks.
  - The honest status (`disabled`, `unavailable`, `quota`, `rejected`) is returned.

---

## 4. Test Execution & Verification

### 4.1 Test Suite
All 21 test cases in `backend/tests/assistant/test_conversation.py` were run against both available Python interpreters.

### 4.2 Exact Commands & Output
1. **Coordinator venv interpreter:**
   ```powershell
   $env:PYTHONPATH="backend"
   C:\Users\tuana\orca\workspaces\ai-foodtour-planner\foodtour-claude-coordinator\.venv\Scripts\python.exe -m unittest discover -s backend/tests/assistant -p "test_*.py" -v
   ```
   **Output:**
   ```
   test_accepted_acknowledgement_when_pending_decision_active ... ok
   test_clarify_block_question_as_fallback ... ok
   test_context_bounding_last_4_turns_and_length_limit ... ok
   test_deadline_passed_to_generate_json ... ok
   test_disabled_when_provider_is_none ... ok
   test_disabled_when_provider_not_configured ... ok
   test_immutability_of_state_and_blocks ... ok
   test_privacy_redaction_coordinates ... ok
   test_privacy_redaction_phone_email_secrets ... ok
   test_quota_provider_error ... ok
   test_rejection_agent_roleplay_and_instruction_leakage ... ok
   test_rejection_allergy_clearance ... ok
   test_rejection_extra_question_when_pending_decision_active ... ok
   test_rejection_hallucinated_price_and_hours ... ok
   test_schema_rejection_extra_action_or_tool_fields ... ok
   test_schema_rejection_malformed_json_or_missing_reply ... ok
   test_state_projection_excludes_gps_and_tokens ... ok
   test_successful_turn_returns_ok_and_preserves_label ... ok
   test_supported_numbers_accepted ... ok
   test_timeout_error ... ok
   test_unavailable_provider_error ... ok

   ----------------------------------------------------------------------
   Ran 21 tests in 0.004s

   OK
   ```

2. **Workspace venv interpreter:**
   ```powershell
   $env:PYTHONPATH="backend"
   .venv\Scripts\python.exe -m unittest discover -s backend/tests/assistant -p "test_*.py" -v
   ```
   **Output:**
   ```
   Ran 21 tests in 0.004s
   OK
   ```

---

## 5. Limitations & Future Integration (OA2)

1. **Stubbed Provider in Tests:**
   - In accordance with the contract, unit tests use injected in-memory mock providers. Zero external network requests were made during testing, protecting live quotas and credentials.
2. **Wiring to API & Session State:**
   - Codex owns `backend/app/main.py` and `backend/app/api/` and will wire `ConversationalAssistant` into the FastAPI chat loop (OA2) with shared session/daily call caps.
3. **No UI Changes:**
   - As instructed, no frontend changes were introduced during this backend module phase.
