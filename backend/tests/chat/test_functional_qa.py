"""Fresh functional-QA regressions from actual HTTP/UI exploration; synthetic only."""
import unittest
from pathlib import Path

from app.chat.engine import ChatEngine
from app.chat.coverage import numeric_prefix_spacing
from app.chat.state import ChatState
from app.data.loader import load_dataset
from app.planner.types import Preferences

ROOT = Path(__file__).resolve().parents[3]
EXACT = 'tour3 quán quanh Hồ Gươm tối nay120 phút,500nghìn cho2người,thích phở và bún chả,dị ứng đậu phộng'


class CompactTourConversation(unittest.TestCase):
    def setUp(self):
        self.engine = ChatEngine(load_dataset(ROOT / 'contracts/fixtures/venues.chat.synthetic.json').venues, guided=True)
        self.state, self.preferences = ChatState(), Preferences()

    def turn(self, text):
        result = self.engine.handle(self.state, self.preferences, text=text)
        self.state, self.preferences = result.state, result.prefs
        self.assertIsNone(result.plan_request, 'Text slot entry must not bypass explicit confirmation')
        return result

    def test_exact_attached_input_keeps_goal_stops_and_next_question(self):
        self.turn(EXACT)
        self.assertEqual(self.state.profile['stops'].value, 3)
        self.assertEqual(self.state.goal, 'tour')
        self.assertEqual(self.state.profile['party_size'].value, 2)
        self.assertEqual(self.state.profile['duration_min'].value, 120)
        self.assertEqual(self.state.profile['budget'].value, 500000)
        self.assertTrue(any(a.term == 'đậu phộng' for a in self.state.allergies))
        self.assertEqual(self.state.pending.slot, 'budget_scope')
        self.turn('cả nhóm')
        self.assertEqual(self.state.pending.slot, 'start_time')
        self.turn('19h')
        self.assertEqual(self.state.profile['start_time'].value, '19:00')
        self.assertEqual(self.state.pending.kind, 'confirm_plan')
        self.turn('đổi ngân sách thành 300 nghìn mỗi người')
        self.assertEqual(self.state.profile['budget'].value, 300000)
        self.assertEqual(self.state.profile['budget'].scope, 'per_person')
        self.assertEqual(self.state.profile['stops'].value, 3)
        self.assertEqual(self.state.pending.kind, 'confirm_plan')

    def test_numeric_prefix_variants_are_goals_without_invented_times(self):
        for text in ('tour3 quán Hồ Gươm tối nay120 phút cho2người',
                     'tour4 quán Hồ Gươm trong180 phút cho3người',
                     'tour 3 quán Hồ Gươm tối nay 120 phút cho 2 người'):
            with self.subTest(text=text):
                result = self.engine.handle(ChatState(), Preferences(), text=text)
                self.assertEqual(result.state.goal, 'tour')
                self.assertIsNotNone(result.state.profile['stops'].value)
                self.assertIsNone(result.state.profile['start_time'].value)
                self.assertIsNone(result.plan_request)

    def test_greeting_does_not_discard_the_request_in_same_message(self):
        self.turn('Chào bạn, mình muốn tour 3 quán quanh Hồ Gươm tối nay trong 120 phút, ngân sách 500 nghìn cho 2 người')
        self.assertEqual(self.state.goal, 'tour')
        self.assertEqual(self.state.profile['duration_min'].value, 120)
        self.assertEqual(self.state.profile['stops'].value, 3)
        self.assertEqual(self.state.profile['budget'].value, 500000)
        self.assertEqual(self.state.profile['party_size'].value, 2)
        self.assertEqual(self.state.pending.slot, 'budget_scope')

    def test_numeric_spacing_preserves_capitalised_labels_and_clock(self):
        text = 'Quán Mai2, Tam3, Trong5 lúc 19h30 ở số 12A'
        self.assertEqual(numeric_prefix_spacing(text), text)

    def test_no_allergy_declaration_keeps_compound_tour_goal_and_question(self):
        result = self.turn('Tour ba quán quanh Hồ Gươm tối nay một tiếng rưỡi, năm trăm nghìn cả hội cho hai người, không dị ứng gì')
        self.assertEqual(self.state.goal, 'tour')
        self.assertEqual(self.state.profile['duration_min'].value, 90)
        self.assertEqual(self.state.profile['budget'].value, 500000)
        self.assertEqual(self.state.profile['budget'].scope, 'group')
        self.assertEqual(self.state.profile['party_size'].value, 2)
        self.assertEqual(self.state.pending.slot, 'start_time')
        self.assertTrue(any(b['type'] == 'understood' for b in result.blocks))
        self.turn('19h')
        self.assertEqual(self.state.pending.kind, 'confirm_plan')

    def test_written_per_leg_limit_stays_separate_from_total_duration(self):
        for leg in ('mỗi chặng đi bộ tối đa mười phút', 'không đi bộ quá mười lăm phút mỗi chặng',
                    'hai mươi lăm phút mỗi chặng'):
            with self.subTest(leg=leg):
                result = self.engine.handle(ChatState(), Preferences(), text='Tour ba quán quanh Hồ Gươm cho hai người, một tiếng rưỡi, năm trăm nghìn cả hội, ' + leg)
                self.assertEqual(result.state.profile['duration_min'].value, 90)
                self.assertEqual(result.state.profile['max_leg_min'].value, 10 if leg.startswith('mỗi') else 15 if leg.startswith('không') else 25)
                self.assertIsNone(result.plan_request)

    def test_unread_leg_constraint_blocks_and_survives_state_restore(self):
        self.turn('Tour ba quán Hồ Gươm 90 phút, mỗi chặng tối đa 70 phút')
        self.assertEqual(self.state.profile['duration_min'].value, 90)
        self.assertIsNone(self.state.profile['max_leg_min'].value)
        self.assertIn('max_leg_min', self.state.unparsed_slots)
        self.assertEqual(self.state.pending.slot, 'max_leg_min')
        self.state = ChatState.from_json(self.state.to_json(private=True))
        self.assertIn('max_leg_min', self.state.unparsed_slots)
        self.turn('10 phút')
        self.assertEqual(self.state.profile['duration_min'].value, 90)
        self.assertEqual(self.state.profile['max_leg_min'].value, 10)
        self.assertNotIn('max_leg_min', self.state.unparsed_slots)

    def test_leg_only_never_becomes_total_tour_time(self):
        for phrase in ('mỗi chặng đi bộ tối đa mười phút', 'mỗi chặng tối đa 70 phút'):
            with self.subTest(phrase=phrase):
                result = self.engine.handle(ChatState(), Preferences(), text='Tour ba quán Hồ Gươm, ' + phrase)
                self.assertIsNone(result.state.profile['duration_min'].value)
                self.assertIsNone(result.plan_request)

    def test_explicit_stop_count_edits_accept_digits_and_words(self):
        self.turn(EXACT)
        self.turn('Đổi số quán thành 4')
        self.assertEqual(self.state.profile['stops'].value, 4)
        self.turn('Đổi số quán thành năm')
        self.assertEqual(self.state.profile['stops'].value, 5)
        self.assertEqual(self.state.profile['duration_min'].value, 120)
