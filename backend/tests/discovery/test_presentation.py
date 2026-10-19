"""Display policy, including generated content; no provider calls."""
import unittest
from app.presentation import plain_text
from app.discovery.state import State
from app.discovery.engine import safe_answer
from app.discovery.tools import Tools
from app.planner.interfaces import StraightLineEstimator
from backend.tests.discovery.test_discovery import fixture


class PresentationTests(unittest.TestCase):
    def test_sequences_and_vietnamese_numeric_integrity(self):
        text = 'Phở \U0001f35c 70.000 đ, 2 người\n\U0001f1fb\U0001f1f3 \U0001f469\U0001f3fd\u200d\U0001f373 1\ufe0f\u20e3 \u26a0\ufe0f Chưa rõ giờ'
        self.assertEqual(plain_text(text), 'Phở 70.000 đ, 2 người\n Chưa rõ giờ')
        self.assertEqual(plain_text('18:00 → 19:00; 0–5 phút'), '18:00 → 19:00; 0–5 phút')
        self.assertEqual(plain_text('20\U0001f35c30 Phở\U0001f35cngon'), '20 30 Phở ngon')

    def test_generated_text_cleaned_before_validation(self):
        tools = Tools(State(), fixture(), StraightLineEstimator())
        self.assertEqual(safe_answer('Chào bạn \U0001f35c', tools, []), 'Chào bạn')
        self.assertIsNone(safe_answer('\U0001f35c', tools, []))
        self.assertIsNone(safe_answer('Đã thêm quán \U0001f35c', tools, []))
        self.assertIsNone(safe_answer('An toàn dị ứng \u2705', tools, []))

    def test_assistant_replay_plain_user_input_preserved(self):
        state = State()
        state.remember('assistant', 'Chào bạn \U0001f35c')
        state.remember('user', 'Phở \U0001f35c')
        self.assertEqual(state.messages[0]['text'], 'Chào bạn')
        self.assertEqual(state.messages[1]['text'], 'Phở \U0001f35c')

    def test_legacy_conversation_uses_same_policy(self):
        from app.assistant.conversation import ConversationalAssistant
        assistant = ConversationalAssistant()
        self.assertEqual(assistant._validate_reply({'reply': 'Chào bạn \U0001f35c'}, 'Chào bạn', {}, [], []),
                         (True, 'Chào bạn'))
        self.assertEqual(assistant._validate_reply({'reply': '\U0001f35c'}, 'Chào bạn', {}, [], []),
                         (False, None))
