"""N1: synthetic Vietnamese regressions and durable coverage obligations."""
import unittest
from pathlib import Path

from app.chat import coverage
from app.chat.engine import ChatEngine, open_obligation
from app.chat.state import ChatState
from app.chat.understand import parse_slots
from app.data.loader import load_dataset
from app.planner.relevance import fold_uncached
from app.planner.types import Preferences
from app.planner.types import Tour
from app.planner.interfaces import StraightLineEstimator
from app.chat.state import ShortItem

ROOT = Path(__file__).resolve().parents[3]
S05 = ('Tụi mình đi ba đứa, chỉ rảnh một tiếng rưỡi chiều nay quanh Hồ Gươm, '
       'túi tiền bốn trăm nghìn cho cả hội, muốn ba hàng ăn nhẹ.')


class UpgradeLanguage(unittest.TestCase):
    def parse(self, text):
        return parse_slots(text, fold_uncached(text), Preferences())

    def test_written_duration_variations(self):
        for amount, minutes in [('một tiếng rưỡi', 90), ('hai tiếng rưỡi', 150),
                                ('ba tiếng', 180), ('bốn tiếng', 240), ('2 tiếng rưỡi', 150)]:
            for suffix in ['chiều nay', 'tối nay', 'sáng mai', '']:
                with self.subTest(amount=amount, suffix=suffix):
                    self.assertEqual(self.parse(f'Chỉ rảnh {amount} {suffix}')['duration_min'], minutes)

    def test_written_money_and_scope(self):
        for amount, value in [('bốn trăm nghìn', 400000), ('hai trăm năm mươi nghìn', 250000),
                              ('một triệu', 1000000), ('một triệu rưỡi', 1500000),
                              ('hai triệu ba trăm nghìn', 2300000), ('nửa triệu', 500000),
                              ('1,5 triệu', 1500000), ('2,5 triệu', 2500000)]:
            for suffix, scope in [('cho cả hội', 'group'), ('mỗi người', 'per_person')]:
                with self.subTest(amount=amount, suffix=suffix):
                    p = self.parse(f'Ngân sách {amount} {suffix}')
                    self.assertEqual(p.get('budget_vnd'), value)
                    self.assertEqual(p.get('budget_scope'), scope)

    def test_s05_through_engine_preserves_all_slots(self):
        venues = load_dataset(ROOT / 'contracts/fixtures/venues.chat.synthetic.json').venues
        eng = ChatEngine(venues, guided=True)
        r = eng.handle(ChatState(), Preferences(), text=S05)
        self.assertEqual(r.state.profile['duration_min'].value, 90)
        self.assertEqual(r.state.profile['budget'].value, 400000)
        self.assertEqual(r.state.profile['budget'].scope, 'group')
        self.assertEqual(r.state.profile['party_size'].value, 3)
        self.assertEqual(r.state.profile['stops'].value, 3)
        self.assertTrue(all(s['status'] == 'captured' for s in r.coverage), r.coverage)
        self.assertIsNone(r.plan_request)

    def test_stops_and_party_variants(self):
        for words, n in [('ba', 3), ('bốn', 4), ('năm', 5)]:
            for noun in ['hàng ăn', 'quán', 'điểm dừng']:
                text = f'Mình muốn đi {words} {noun}'
                self.assertEqual(coverage.extras(text, fold_uncached(text))['stops'], n)
            self.assertEqual(self.parse(f'Tụi mình đi {words} đứa')['party_size'], n)

    def test_existing_budget_cannot_mask_new_unread_amount(self):
        text = 'Ngân sách vài trăm nghìn cho cả hội'
        signals = coverage.audit(text, fold_uncached(text), {}, has_budget=True)
        self.assertIn({'kind': 'budget', 'status': 'uncovered'}, signals)

    def test_unread_slot_is_durable_and_confirm_cannot_bypass(self):
        venues = load_dataset(ROOT / 'contracts/fixtures/venues.chat.synthetic.json').venues
        eng = ChatEngine(venues, guided=True)
        r = eng.handle(ChatState(), Preferences(), text='Tour quanh Hồ Gươm, ngân sách vài trăm nghìn')
        self.assertIn('budget_vnd', r.state.unparsed_slots)
        st = ChatState.from_json(r.state.to_json(private=True))
        self.assertTrue(open_obligation(st))
        self.assertEqual(st.pending.slot, 'budget_vnd')
        r = eng.handle(st, r.prefs, action={'type': 'confirm_yes'})
        self.assertIsNone(r.plan_request)
        self.assertTrue(open_obligation(r.state))
        r = eng.handle(r.state, r.prefs, text='400k cho cả nhóm')
        self.assertNotIn('budget_vnd', r.state.unparsed_slots)
        self.assertEqual(r.state.profile['budget'].value, 400000)

    def test_clock_is_not_duration(self):
        p = self.parse('Tour bắt đầu lúc 19h chiều nay')
        self.assertEqual(p['start_time'], '19:00')
        self.assertNotIn('duration_min', p)

    def test_budget_chip_cannot_become_duck_allergy_or_clear_obligation(self):
        venues = load_dataset(ROOT / 'contracts/fixtures/venues.chat.synthetic.json').venues
        eng = ChatEngine(venues, guided=True)
        r = eng.handle(ChatState(), Preferences(), text='Tour quanh Hồ Gươm, mình dị ứng nhưng chưa nhớ tên nguyên liệu')
        for text in ['Tôi muốn ăn tour 3 quán quanh Hoàn Kiếm tối nay', 'Đi tour vào tối nay khoảng 120 phút',
                     'Thích các món Việt truyền thống như phở và chè', 'Ngân sách dưới 300 nghìn cho cả chuyến']:
            r = eng.handle(r.state, r.prefs, text=text)
            self.assertTrue(r.state.allergy_unresolved, text)
            self.assertEqual(r.state.allergies, [], text)
            self.assertEqual(r.state.pending.slot, 'allergy_term', text)
        r = eng.handle(ChatState.from_json(r.state.to_json(private=True)), r.prefs, action={'type': 'confirm_yes'})
        self.assertIsNone(r.plan_request)
        self.assertTrue(r.state.allergy_unresolved)

    def test_guided_conflict_does_not_offer_untested_transport_or_repeat(self):
        venues = load_dataset(ROOT / 'contracts/fixtures/venues.chat.synthetic.json').venues
        eng = ChatEngine(venues, guided=True)
        st = ChatState()
        st.set_field('vehicle', 'walk')
        st.set_field('duration_min', 120)
        st.attempted_adjustments = ['time:+60', 'relax_leg:30']
        blocks = eng.after_plan(st, Tour('no_solution', reasons=('Không đủ dữ liệu',)))
        self.assertFalse(st.pending)
        self.assertTrue(any('Chưa có điều chỉnh' in b.get('text', '') for b in blocks))
        self.assertEqual(st.profile['vehicle'].value, 'walk')

    def test_infeasible_trials_end_without_promise_or_unlocking(self):
        venues = load_dataset(ROOT / 'contracts/fixtures/venues.chat.synthetic.json').venues
        eng = ChatEngine(venues, guided=True)
        st = ChatState()
        st.shortlist = [ShortItem(v.id, 'kept') for v in venues[:3]]
        st.set_field('vehicle', 'walk')
        before = st.to_json(private=True)['shortlist']
        blocks = eng.after_plan(st, Tour('no_solution', reasons=('Thiếu điểm xuất phát',)),
                                prefs=Preferences(), routing=StraightLineEstimator())
        self.assertIsNone(st.pending)
        self.assertEqual(before, st.to_json(private=True)['shortlist'])
        self.assertTrue(any('Chưa có điều chỉnh' in b.get('text', '') for b in blocks))
