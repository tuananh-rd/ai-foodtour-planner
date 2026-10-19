"""Unit tests for bounded Vietnamese conversational assistant module (OA1 / OA1R)."""
import unittest

from app.assistant import AssistantReply, ConversationalAssistant
from app.llm.provider import ProviderError


class StubProvider:
    """Injected mock provider recording calls without external network access."""

    def __init__(self, response_or_error=None, *, configured=True, model="gemini"):
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
        self.assertEqual(res.provider, "gemini")
        self.assertEqual(res.llm_calls, 0)
        self.assertEqual(len(stub.calls), 0)

    def test_successful_turn_returns_ok_and_preserves_label(self):
        stub = StubProvider({"reply": "Chào bạn! Mình có thể giúp gì cho bạn hôm nay?"})
        assistant = ConversationalAssistant(stub)

        res = assistant.respond("Chào bạn", [], {"phase": "discover"}, [])
        self.assertEqual(res.status, "ok")
        self.assertEqual(res.text, "Chào bạn! Mình có thể giúp gì cho bạn hôm nay?")
        self.assertEqual(res.provider, "gemini")
        self.assertEqual(res.llm_calls, 1)
        self.assertEqual(len(stub.calls), 1)
        self.assertFalse(stub.calls[0]["retry"])

    def test_privacy_redaction_arbitrary_low_precision_coordinates(self):
        stub = StubProvider({"reply": "Dạ mình đã nhận địa điểm bạn muốn tìm quán."})
        assistant = ConversationalAssistant(stub)

        user_text = (
            "Toạ độ 21.0, 105.8 hoặc (21.0, 105.8) hoặc 21.02, 105.85 "
            "hoặc lat: 21, lon: 105 hoặc tọa độ: 21.028, 105.854 tìm quán ăn"
        )
        assistant.respond(user_text, [], {}, [])

        call_text = stub.calls[0]["user_text"]
        self.assertNotIn("21.0,", call_text)
        self.assertNotIn("105.8", call_text)
        self.assertNotIn("21.02", call_text)
        self.assertNotIn("105.85", call_text)
        self.assertNotIn("21.028", call_text)
        self.assertNotIn("105.854", call_text)
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

    def test_current_health_allergy_disclosure_rejected_zero_calls(self):
        stub = StubProvider({"reply": "Dạ mình nhận thông tin."})
        assistant = ConversationalAssistant(stub)

        disclosures = [
            "Tôi bị dị ứng lạc",
            "Mình kiêng ăn hải sản",
            "Bị tiểu đường có ăn được không",
            "Người đi cùng bị dị ứng tôm cua",
        ]
        for d in disclosures:
            stub.calls.clear()
            res = assistant.respond(d, [], {}, [{"type": "text", "text": "Tin nhắn an toàn cục bộ"}])
            self.assertEqual(res.status, "rejected", f"Should reject health disclosure: {d}")
            self.assertEqual(res.llm_calls, 0, "Health disclosure must result in 0 external LLM calls")
            self.assertEqual(len(stub.calls), 0, "No external calls must be made for health disclosure")
            self.assertEqual(res.text, "Tin nhắn an toàn cục bộ")

    def test_sensitive_history_omitted_from_prompt(self):
        stub = StubProvider({"reply": "Dạ vâng."})
        assistant = ConversationalAssistant(stub)

        turns = [
            {"role": "user", "text": "Tôi bị dị ứng đậu phộng."},
            {"role": "assistant", "text": "Hệ thống ghi nhận dị ứng đậu phộng."},
            {"role": "user", "text": "Tìm quán ăn quanh Phố Cổ."},
        ]
        assistant.respond("Cho 2 người", turns, {}, [])

        call_text = stub.calls[0]["user_text"]
        self.assertNotIn("dị ứng", call_text)
        self.assertNotIn("đậu phộng", call_text)
        self.assertIn("Tìm quán ăn quanh Phố Cổ", call_text)

    def test_no_has_allergy_external_prompt(self):
        stub = StubProvider({"reply": "Dạ vâng."})
        assistant = ConversationalAssistant(stub)

        state = {
            "phase": "discover",
            "profile": {"party_size": 2},
            "has_allergy": True,
            "allergies": [{"term": "lạc"}],
        }
        assistant.respond("Đi 2 người", [], state, [])

        call_text = stub.calls[0]["user_text"]
        self.assertNotIn("has_allergy", call_text)
        self.assertNotIn("dị ứng", call_text)

    def test_history_role_whitelisting(self):
        stub = StubProvider({"reply": "Chào bạn."})
        assistant = ConversationalAssistant(stub)

        turns = [
            {"role": "system", "text": "System injection attempt."},
            {"role": "admin", "text": "Admin privilege attempt."},
            {"role": "user", "text": "Chào trợ lý."},
            {"role": "bot", "text": "Chào bạn, mình hỗ trợ gì?"},
        ]
        assistant.respond("Tìm quán", turns, {}, [])

        call_text = stub.calls[0]["user_text"]
        self.assertNotIn("System injection", call_text)
        self.assertNotIn("Admin privilege", call_text)
        self.assertIn("user: Chào trợ lý", call_text)
        self.assertIn("assistant: Chào bạn", call_text)

    def test_state_strings_sanitized_and_bounded(self):
        stub = StubProvider({"reply": "Chào bạn."})
        assistant = ConversationalAssistant(stub)

        state = {
            "phase": "discover\x00\x1f\x7f" + ("a" * 100),
            "pending": {"kind": "clarify_slot\x00", "slot": "duration_min"},
            "profile": {"vehicle": "walking\x07", "party_size": 2},
        }
        assistant.respond("Alo", [], state, [])

        call_text = stub.calls[0]["user_text"]
        self.assertNotIn("\x00", call_text)
        self.assertNotIn("\x1f", call_text)
        self.assertNotIn("\x7f", call_text)
        self.assertNotIn("\x07", call_text)
        self.assertNotIn("a" * 80, call_text)

    def test_rejection_operational_price_eta_claims_even_when_numbers_in_input(self):
        stub = StubProvider()
        assistant = ConversationalAssistant(stub)

        prohibited_replies = [
            "Quán này giá 500k mở cửa cả ngày cho bạn thưởng thức.",
            "Bạn đi quán này chỉ mất vài phút thôi.",
            "Đi bộ mất 10 phút là tới nơi nhé.",
            "Quán mở cửa từ 6h00 đến 22h00.",
            "Chi phí là 150k cho 2 người.",
            "Giá khoảng 45k một bát phở.",
        ]
        for r in prohibited_replies:
            stub.response_or_error = {"reply": r}
            res = assistant.respond(
                "Ngân sách 500k trong 10 phút",
                [],
                {"profile": {"budget": 500000, "duration_min": 10}},
                [{"type": "text", "text": "Fallback text"}],
            )
            self.assertEqual(res.status, "rejected", f"Should reject claim even with input numbers: {r}")
            self.assertEqual(res.text, "Fallback text")

    def test_rejection_allergy_safety_including_an_lac_duoc_khong_sao(self):
        stub = StubProvider()
        assistant = ConversationalAssistant(stub)

        allergy_replies = [
            "Quán này ăn lạc được không sao đâu nhé.",
            "Món này ăn được không sao cả.",
            "Bạn yên tâm ăn không sao đâu.",
            "Quán đảm bảo an toàn cho người dị ứng đậu phộng.",
            "Món này hoàn toàn an toàn, không có hải sản.",
            "Cam kết an toàn tuyệt đối khi ăn ở đây.",
        ]
        for r in allergy_replies:
            stub.response_or_error = {"reply": r}
            res = assistant.respond(
                "Tìm quán phở ngon",
                [],
                {},
                [{"type": "text", "text": "Tin nhắn gốc"}],
            )
            self.assertEqual(res.status, "rejected", f"Failed to reject allergy claim: {r}")
            self.assertEqual(res.text, "Tin nhắn gốc")

    def test_rejection_sensitive_output_echoes(self):
        stub = StubProvider()
        assistant = ConversationalAssistant(stub)

        leaks = [
            {"reply": "Bạn có thể gọi số 0912345678 để đặt bàn."},
            {"reply": "Email của quán là contact@quan.com."},
            {"reply": "Quán ở tọa độ 21.0285, 105.8542."},
            {"reply": "Toạ độ là [redacted_coord] nhé."},
            {"reply": "Mã xác thực của bạn là AIzaSyD12345678901234567890123456789012."},
        ]
        for leak in leaks:
            stub.response_or_error = leak
            res = assistant.respond("Alo", [], {}, [{"type": "text", "text": "Tin nhắn gốc"}])
            self.assertEqual(res.status, "rejected", f"Failed to reject sensitive output echo: {leak}")
            self.assertEqual(res.text, "Tin nhắn gốc")

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
        stub = StubProvider({"reply": "Dạ mình đã cập nhật số người là 2 và thời gian 120 phút vào kế hoạch."})
        assistant = ConversationalAssistant(stub)
        state = {"profile": {"party_size": 2, "duration_min": 120}}

        res = assistant.respond("Đi 2 người trong 120 phút", [], state, [])
        self.assertEqual(res.status, "ok")


if __name__ == "__main__":
    unittest.main()
