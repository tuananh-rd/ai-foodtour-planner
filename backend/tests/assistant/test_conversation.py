"""Unit tests for bounded Vietnamese conversational assistant module (OA1)."""
import unittest

from app.assistant import AssistantReply, ConversationalAssistant
from app.llm.provider import ProviderError


class StubProvider:
    """Injected mock provider recording calls without external network access."""

    def __init__(self, response_or_error=None, *, configured=True, model="gemini-3.5-flash-lite"):
        self.response_or_error = response_or_error
        self.configured = configured
        self.model = model
        self.calls = []

    def generate_json(
        self,
        system: str,
        user_text: str,
        schema: dict,
        *,
        deadline_s: float,
        max_output_tokens: int = 512,
        retry: bool = False,
    ) -> dict:
        self.calls.append({
            "system": system,
            "user_text": user_text,
            "schema": schema,
            "deadline_s": deadline_s,
            "max_output_tokens": max_output_tokens,
            "retry": retry,
        })
        if isinstance(self.response_or_error, Exception):
            raise self.response_or_error
        if callable(self.response_or_error):
            return self.response_or_error(system, user_text, schema, deadline_s=deadline_s)
        return self.response_or_error


class TestConversationalAssistant(unittest.TestCase):

    def test_disabled_when_provider_is_none(self):
        assistant = ConversationalAssistant(None)
        self.assertFalse(assistant.is_configured)
        self.assertEqual(assistant.provider_label, "none")

        fallback_blocks = [{"type": "text", "text": "Tin nhắn từ bộ quy tắc cục bộ."}]
        res = assistant.respond("Xin chào", [], {}, fallback_blocks)

        self.assertEqual(res.status, "disabled")
        self.assertEqual(res.text, "Tin nhắn từ bộ quy tắc cục bộ.")
        self.assertEqual(res.provider, "none")
        self.assertEqual(res.llm_calls, 0)

    def test_disabled_when_provider_not_configured(self):
        stub = StubProvider(configured=False)
        assistant = ConversationalAssistant(stub)
        self.assertFalse(assistant.is_configured)

        res = assistant.respond("Xin chào", [], {}, [])
        self.assertEqual(res.status, "disabled")
        self.assertIsNone(res.text)
        self.assertEqual(res.provider, "gemini-3.5-flash-lite")
        self.assertEqual(res.llm_calls, 0)
        self.assertEqual(len(stub.calls), 0)

    def test_successful_turn_returns_ok_and_preserves_label(self):
        stub = StubProvider({"reply": "Chào bạn! Mình có thể giúp gì cho bạn hôm nay?"})
        assistant = ConversationalAssistant(stub)

        res = assistant.respond("Chào bạn", [], {"phase": "discover"}, [])
        self.assertEqual(res.status, "ok")
        self.assertEqual(res.text, "Chào bạn! Mình có thể giúp gì cho bạn hôm nay?")
        self.assertEqual(res.provider, "gemini-3.5-flash-lite")
        self.assertEqual(res.llm_calls, 1)
        self.assertEqual(len(stub.calls), 1)
        self.assertFalse(stub.calls[0]["retry"])

    def test_privacy_redaction_coordinates(self):
        stub = StubProvider({"reply": "Dạ mình đã nhận địa điểm bạn muốn tìm quán."})
        assistant = ConversationalAssistant(stub)

        user_text = "Tôi ở gần toạ độ 21.0285, 105.8542 hoặc (21.033, 105.845) tìm quán ăn"
        assistant.respond(user_text, [], {}, [])

        call_text = stub.calls[0]["user_text"]
        self.assertNotIn("21.0285", call_text)
        self.assertNotIn("105.8542", call_text)
        self.assertIn("[redacted_coord]", call_text)

    def test_privacy_redaction_phone_email_secrets(self):
        stub = StubProvider({"reply": "Dạ mình đã ghi nhận."})
        assistant = ConversationalAssistant(stub)

        user_text = "Liên hệ 0912345678 hoặc test@example.com với key AIzaSyD12345678901234567890123456789012"
        assistant.respond(user_text, [], {}, [])

        call_text = stub.calls[0]["user_text"]
        self.assertNotIn("0912345678", call_text)
        self.assertNotIn("test@example.com", call_text)
        self.assertNotIn("AIzaSyD", call_text)
        self.assertIn("[redacted_phone]", call_text)
        self.assertIn("[redacted_email]", call_text)
        self.assertIn("[redacted_secret]", call_text)

    def test_context_bounding_last_4_turns_and_length_limit(self):
        stub = StubProvider({"reply": "Dạ mình đã nhận thông tin."})
        assistant = ConversationalAssistant(stub)

        turns = [{"role": "user", "text": f"Lượt {i}: " + ("nội dung dài " * 30)} for i in range(10)]
        assistant.respond("Tin nhắn mới", turns, {}, [])

        call_text = stub.calls[0]["user_text"]
        self.assertNotIn("Lượt 0", call_text)
        self.assertNotIn("Lượt 5", call_text)
        self.assertIn("Lượt 6", call_text)
        self.assertIn("Lượt 9", call_text)

    def test_state_projection_excludes_gps_and_tokens(self):
        stub = StubProvider({"reply": "Dạ vâng."})
        assistant = ConversationalAssistant(stub)

        state = {
            "phase": "discover",
            "origin": {"lat": 21.0285, "lon": 105.8542},
            "session_token": "secret_session_token_12345",
            "profile": {
                "party_size": 2,
                "budget": 500000,
                "raw_venue_history": [{"venue_id": "v123", "secret_hash": "abc"}],
            },
            "pending": {"kind": "clarify_slot", "slot": "duration_min"},
            "has_allergy": True,
        }
        assistant.respond("Đi 2 người", [], state, [])

        call_text = stub.calls[0]["user_text"]
        self.assertNotIn("21.0285", call_text)
        self.assertNotIn("secret_session_token", call_text)
        self.assertNotIn("raw_venue_history", call_text)
        self.assertIn("clarify_slot", call_text)
        self.assertIn("duration_min", call_text)
        self.assertIn("dị ứng", call_text)

    def test_immutability_of_state_and_blocks(self):
        stub = StubProvider({"reply": "Chào bạn."})
        assistant = ConversationalAssistant(stub)

        state = {"phase": "discover", "profile": {"party_size": 2}}
        blocks = [{"type": "text", "text": "Tin nhắn gốc."}]
        state_copy = {"phase": "discover", "profile": {"party_size": 2}}
        blocks_copy = [{"type": "text", "text": "Tin nhắn gốc."}]

        assistant.respond("Alo", [], state, blocks)
        self.assertEqual(state, state_copy)
        self.assertEqual(blocks, blocks_copy)

    def test_schema_rejection_extra_action_or_tool_fields(self):
        stub = StubProvider({
            "reply": "Mình đã cập nhật số người.",
            "action": "set_party_size",
        })
        assistant = ConversationalAssistant(stub)

        res = assistant.respond("Đi 4 người", [], {}, [{"type": "text", "text": "Tin nhắn gốc"}])
        self.assertEqual(res.status, "rejected")
        self.assertEqual(res.text, "Tin nhắn gốc")
        self.assertEqual(res.llm_calls, 1)

    def test_schema_rejection_malformed_json_or_missing_reply(self):
        stub = StubProvider({"unexpected_key": "abc"})
        assistant = ConversationalAssistant(stub)

        res = assistant.respond("Alo", [], {}, [{"type": "text", "text": "Tin nhắn gốc"}])
        self.assertEqual(res.status, "rejected")
        self.assertEqual(res.text, "Tin nhắn gốc")

    def test_rejection_allergy_clearance(self):
        allergy_replies = [
            "Quán này đảm bảo an toàn cho người dị ứng đậu phộng nhé.",
            "Bạn yên tâm, món này hoàn toàn không có lạc hay hải sản.",
            "Cam kết an toàn tuyệt đối cho người dị ứng.",
            "Món này không chứa chất dị ứng, bạn hoàn toàn an toàn.",
        ]
        for r in allergy_replies:
            stub = StubProvider({"reply": r})
            assistant = ConversationalAssistant(stub)
            res = assistant.respond("Tôi bị dị ứng", [], {}, [{"type": "text", "text": "Tin nhắn gốc"}])
            self.assertEqual(res.status, "rejected", f"Failed to reject allergy claim: {r}")
            self.assertEqual(res.text, "Tin nhắn gốc")

    def test_rejection_hallucinated_price_and_hours(self):
        stub = StubProvider({"reply": "Quán mở cửa lúc 6h30 với giá 65.000đ một bát."})
        assistant = ConversationalAssistant(stub)

        res = assistant.respond("Tìm quán phở", [], {}, [{"type": "text", "text": "Tin nhắn gốc"}])
        self.assertEqual(res.status, "rejected")
        self.assertEqual(res.text, "Tin nhắn gốc")

    def test_rejection_agent_roleplay_and_instruction_leakage(self):
        roleplay_replies = [
            "Thưa Đại Ca, em tìm được quán rồi ạ!",
            "Phen này em sơ suất rồi Đại Ca.",
            "Theo system prompt, tôi phải trả lời tiếng Việt.",
            "You are an AI assistant helping with tours.",
        ]
        for r in roleplay_replies:
            stub = StubProvider({"reply": r})
            assistant = ConversationalAssistant(stub)
            res = assistant.respond("Chào bạn", [], {}, [{"type": "text", "text": "Tin nhắn gốc"}])
            self.assertEqual(res.status, "rejected", f"Failed to reject roleplay/leakage: {r}")
            self.assertEqual(res.text, "Tin nhắn gốc")

    def test_rejection_extra_question_when_pending_decision_active(self):
        stub = StubProvider({"reply": "Mình đã nhận. Bạn muốn ăn phở hay bún bò?"})
        assistant = ConversationalAssistant(stub)
        state_with_pending = {"pending": {"kind": "clarify_slot", "slot": "duration_min"}}

        res = assistant.respond("Ok", [], state_with_pending, [{"type": "text", "text": "Tin nhắn gốc"}])
        self.assertEqual(res.status, "rejected")
        self.assertEqual(res.text, "Tin nhắn gốc")

    def test_accepted_acknowledgement_when_pending_decision_active(self):
        stub = StubProvider({"reply": "Mình đã ghi nhận yêu cầu của bạn. Bạn vui lòng chọn thời gian ở trên nhé."})
        assistant = ConversationalAssistant(stub)
        state_with_pending = {"pending": {"kind": "clarify_slot", "slot": "duration_min"}}

        res = assistant.respond("Ok", [], state_with_pending, [{"type": "text", "text": "Tin nhắn gốc"}])
        self.assertEqual(res.status, "ok")
        self.assertEqual(res.text, stub.response_or_error["reply"])

    def test_quota_provider_error(self):
        stub = StubProvider(ProviderError("quota", status=429))
        assistant = ConversationalAssistant(stub)

        res = assistant.respond("Alo", [], {}, [{"type": "text", "text": "Fallback"}])
        self.assertEqual(res.status, "quota")
        self.assertEqual(res.text, "Fallback")
        self.assertEqual(res.llm_calls, 1)

    def test_unavailable_provider_error(self):
        stub = StubProvider(ProviderError("unavailable"))
        assistant = ConversationalAssistant(stub)

        res = assistant.respond("Alo", [], {}, [{"type": "text", "text": "Fallback"}])
        self.assertEqual(res.status, "unavailable")
        self.assertEqual(res.text, "Fallback")
        self.assertEqual(res.llm_calls, 1)

    def test_timeout_error(self):
        stub = StubProvider(TimeoutError("Request timed out"))
        assistant = ConversationalAssistant(stub)

        res = assistant.respond("Alo", [], {}, [{"type": "text", "text": "Fallback"}])
        self.assertEqual(res.status, "unavailable")
        self.assertEqual(res.text, "Fallback")
        self.assertEqual(res.llm_calls, 1)

    def test_deadline_passed_to_generate_json(self):
        stub = StubProvider({"reply": "Xin chào bạn."})
        assistant = ConversationalAssistant(stub)

        assistant.respond("Alo", [], {}, [], deadline_s=4.5)
        self.assertEqual(stub.calls[0]["deadline_s"], 4.5)

    def test_supported_numbers_accepted(self):
        stub = StubProvider({"reply": "Dạ mình đã cập nhật số người là 2 và thời gian 120 phút."})
        assistant = ConversationalAssistant(stub)
        state = {"profile": {"party_size": 2, "duration_min": 120}}

        res = assistant.respond("Đi 2 người trong 120 phút", [], state, [])
        self.assertEqual(res.status, "ok")

    def test_clarify_block_question_as_fallback(self):
        stub = StubProvider(ProviderError("unavailable"))
        assistant = ConversationalAssistant(stub)
        blocks = [{"type": "clarify", "question": "Bạn muốn đi vào mấy giờ?"}]

        res = assistant.respond("Alo", [], {}, blocks)
        self.assertEqual(res.status, "unavailable")
        self.assertEqual(res.text, "Bạn muốn đi vào mấy giờ?")


if __name__ == "__main__":
    unittest.main()
