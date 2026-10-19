# OA1 / OA1R Module Implementation & Review Remediation Report: Conversational Assistant

- **Date:** 2026-10-19
- **Author:** Antigravity (dispatched worker)
- **Coordinator:** Codex
- **Contract Reference:** `docs/ONLINE_ASSISTANT_CONTRACT.md` (OA1 / OA1R)
- **Base Commit:** `10b8966`
- **Task ID:** `task_b538388a6a4a`
- **Dispatch ID:** `ctx_dbcd66807adb`

---

## 1. Executive Summary

Addressed all review feedback from coordinator messages (`msg_f7e0cd41cc4d`, `msg_27f8fd8ddb97`, and `msg_810db9d60369`) on `backend/app/assistant/conversation.py`. The module now strictly sets the provider label to `gemini`, rejects operational/price/ETA/allergy claims, rejects false action and confirmation/state mutation claims (`Mình đã xác nhận và tạo tour thành công`, `Đã bỏ dị ứng khỏi yêu cầu`), enforces that profile numbers reflect authoritative structured state rather than user text alone, redacts arbitrary low-precision coordinate pairs and sensitive output echoes, sanitizes state strings, whitelists history roles, and enforces zero external LLM calls for health/allergy disclosures with omission of sensitive history and exclusion of `has_allergy` from external prompts per official unpaid Gemini terms. Fallback `ProviderError` import was cleaned up, and finite-guard limitations are documented honestly.

All 24 targeted unit tests pass in 0.004s across both coordinator and local `.venv` environments.

---

## 2. Review Remediations (OA1R)

1. **Provider Label (`gemini`):**
   - Injected provider label property is standardized to `"gemini"` when a provider is present, and `"none"` when provider is `None`.
2. **Rejection of Operational, Price, ETA, and Allergy-Safety Claims:**
   - Regardless of whether numbers were present in input (such as user budget or duration), the assistant explicitly rejects claims asserting:
     - Venue or dish prices (e.g., `'quán này giá 500k mở cửa cả ngày'`, `giá khoảng 45k một bát`).
     - Operational hours (e.g., `mở cửa cả ngày`, `mở cửa từ 6h00 đến 22h00`).
     - Travel duration or ETA (e.g., `'chỉ mất vài phút'`, `đi bộ mất 10 phút là tới`).
     - Allergy safety (e.g., `'ăn lạc được không sao'`, `yên tâm ăn không sao đâu`, `an toàn cho người dị ứng`).
3. **Rejection of False Action Claims & Confirmation/State Mutation:**
   - Per `msg_810db9d60369`, claims asserting that actions have been executed or state has been mutated (e.g., `'Mình đã xác nhận và tạo tour thành công'`, `'Đã bỏ dị ứng khỏi yêu cầu'`, `'đã đặt bàn'`, `'đã chốt kế hoạch'`) are strictly rejected.
4. **Authoritative Structured State for Profile Numbers:**
   - Per `msg_810db9d60369`, slot numbers in replies (party size, duration, stops) must reflect authoritative structured state (`safe_state.profile`), not uncommitted or unverified numbers appearing in user text alone.
5. **Arbitrary Low-Precision Coordinate Redaction & Sensitive Output Echoes:**
   - Redaction regex updated to catch low-precision coordinates (e.g., `21.0, 105.8`, `(21.0, 105.8)`, `lat: 21, lon: 105`) as well as decimal coordinates.
   - Sensitive output echoes (repeating coordinates, phones, emails, secret tokens, or internal redaction tags like `[redacted_coord]`) are rejected.
6. **State Sanitization & History Role Whitelisting:**
   - State strings (`phase`, `pending`, profile strings) are stripped of control characters and bounded in length.
   - History turns are filtered against an allowlist `{"user", "assistant", "bot"}`; unrecognized or injected roles (`system`, `admin`) are excluded.
7. **Zero Calls for Health/Allergy Disclosures & Unpaid Gemini Terms Compliance:**
   - Per official unpaid Gemini terms, any user turn containing health or allergy disclosures is rejected immediately with 0 external LLM calls (`llm_calls = 0`, `status = "rejected"`).
   - Sensitive previous history turns with allergy disclosures are omitted from the prompt.
   - No `has_allergy` cue is included in the external prompt.
8. **Clean ProviderError Import:**
   - Removed fallback `ProviderError` ImportError class; imports cleanly from `app.llm.provider`.

---

## 3. Honest Finite-Guard Limitations

> [!NOTE]
> The regex patterns and structural validation rules implemented in `ConversationalAssistant` provide bounded defenses against known categories of model hallucinations (unsupported prices, operational hours, travel times, allergy safety claims, false action/mutation assertions) and privacy leaks (coordinates, contacts, tokens).
> However, heuristic regex guards cannot constitute an exhaustive mathematical proof of semantic safety across arbitrary natural language variations.
> The architecture relies fundamentally on the deterministic state/planner pipeline as the authoritative source of truth. The conversational assistant serves purely as an untrusted natural language acknowledgement layer; it never mutates state, executes actions, or bypasses deterministic safety gates.

---

## 4. Test Verification Evidence

### 4.1 Test Execution Command (Coordinator Python Interpreter)
```powershell
$env:PYTHONPATH="backend"
C:\Users\tuana\orca\workspaces\ai-foodtour-planner\foodtour-claude-coordinator\.venv\Scripts\python.exe -m unittest discover -s backend/tests/assistant -p "test_*.py" -v
```

### 4.2 Output
```
test_accepted_acknowledgement_when_pending_decision_active (test_conversation.TestConversationalAssistant.test_accepted_acknowledgement_when_pending_decision_active) ... ok
test_current_health_allergy_disclosure_rejected_zero_calls (test_conversation.TestConversationalAssistant.test_current_health_allergy_disclosure_rejected_zero_calls) ... ok
test_deadline_passed_to_generate_json (test_conversation.TestConversationalAssistant.test_deadline_passed_to_generate_json) ... ok
test_disabled_when_provider_is_none (test_conversation.TestConversationalAssistant.test_disabled_when_provider_is_none) ... ok
test_disabled_when_provider_not_configured (test_conversation.TestConversationalAssistant.test_disabled_when_provider_not_configured) ... ok
test_history_role_whitelisting (test_conversation.TestConversationalAssistant.test_history_role_whitelisting) ... ok
test_no_has_allergy_external_prompt (test_conversation.TestConversationalAssistant.test_no_has_allergy_external_prompt) ... ok
test_privacy_redaction_arbitrary_low_precision_coordinates (test_conversation.TestConversationalAssistant.test_privacy_redaction_arbitrary_low_precision_coordinates) ... ok
test_privacy_redaction_phone_email_secrets (test_conversation.TestConversationalAssistant.test_privacy_redaction_phone_email_secrets) ... ok
test_quota_provider_error (test_conversation.TestConversationalAssistant.test_quota_provider_error) ... ok
test_rejection_agent_roleplay_and_instruction_leakage (test_conversation.TestConversationalAssistant.test_rejection_agent_roleplay_and_instruction_leakage) ... ok
test_rejection_allergy_safety_including_an_lac_duoc_khong_sao (test_conversation.TestConversationalAssistant.test_rejection_allergy_safety_including_an_lac_duoc_khong_sao) ... ok
test_rejection_extra_question_when_pending_decision_active (test_conversation.TestConversationalAssistant.test_rejection_extra_question_when_pending_decision_active) ... ok
test_rejection_false_action_and_state_mutation_claims (test_conversation.TestConversationalAssistant.test_rejection_false_action_and_state_mutation_claims) ... ok
test_rejection_operational_price_eta_claims_even_when_numbers_in_input (test_conversation.TestConversationalAssistant.test_rejection_operational_price_eta_claims_even_when_numbers_in_input) ... ok
test_rejection_sensitive_output_echoes (test_conversation.TestConversationalAssistant.test_rejection_sensitive_output_echoes) ... ok
test_schema_rejection_extra_action_or_tool_fields (test_conversation.TestConversationalAssistant.test_schema_rejection_extra_action_or_tool_fields) ... ok
test_sensitive_history_omitted_from_prompt (test_conversation.TestConversationalAssistant.test_sensitive_history_omitted_from_prompt) ... ok
test_state_strings_sanitized_and_bounded (test_conversation.TestConversationalAssistant.test_state_strings_sanitized_and_bounded) ... ok
test_successful_turn_returns_ok_and_preserves_label (test_conversation.TestConversationalAssistant.test_successful_turn_returns_ok_and_preserves_label) ... ok
test_supported_numbers_accepted (test_conversation.TestConversationalAssistant.test_supported_numbers_accepted) ... ok
test_supported_numbers_must_reflect_authoritative_structured_state (test_conversation.TestConversationalAssistant.test_supported_numbers_must_reflect_authoritative_structured_state) ... ok
test_timeout_error (test_conversation.TestConversationalAssistant.test_timeout_error) ... ok
test_unavailable_provider_error (test_conversation.TestConversationalAssistant.test_unavailable_provider_error) ... ok

----------------------------------------------------------------------
Ran 24 tests in 0.004s

OK
```

All 24 unit tests pass in 0.004s without external network calls or credential access.
