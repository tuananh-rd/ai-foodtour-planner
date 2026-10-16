"""C4 public API conflict/replacement acceptance, synthetic and offline."""
from unittest.mock import patch
import unittest
from dataclasses import replace
from backend.tests.api import test_chat
from app.planner.types import ReplaceResult


class ChatPlanAPI(unittest.TestCase):
    setUp = test_chat.ChatAPI.setUp
    restart = test_chat.ChatAPI.restart
    post = test_chat.ChatAPI.post
    action = test_chat.ChatAPI.action
    get = test_chat.ChatAPI.get
    prepare = test_chat.ChatAPI.prepare
    def conflict(self, **patch_values):
        self.prepare()
        self.action('edit_profile', patch=patch_values or {'end_time':'10:30'})
        return self.action('confirm_yes')

    def option(self, view, prefix):
        return next(o['option_id'] for o in view['chat']['pending']['options'] if o['option_id'].startswith(prefix))

    def test_time_conflict_vehicle_then_explicit_confirmation(self):
        view = self.conflict(end_time='11:45')
        self.assertIsNone(view['tour'])
        self.assertEqual([b['type'] for b in view['reply']['blocks']], ['notice','clarify'])
        old_revision = view['revision']
        view = self.action('pick_option', option_id=self.option(view,'vehicle:'))
        self.assertEqual(view['revision'], old_revision+1)
        self.assertIsNone(view['tour'])
        self.assertEqual(view['chat']['pending']['kind'],'confirm_plan')
        self.assertIn('confirm_summary', [b['type'] for b in view['reply']['blocks']])
        view = self.action('confirm_yes')
        self.assertTrue(view['tour']['stops'])
        self.assertEqual(view['revision'], old_revision+2)

    def test_preserves_existing_tour_and_conflict_pending_restart(self):
        self.prepare()
        ready = self.action('confirm_yes')
        self.action('edit_profile',patch={'end_time':'11:00'})
        self.action('request_plan')
        conflict = self.action('confirm_yes')
        self.assertEqual(conflict['tour']['stops'],ready['tour']['stops'])
        self.assertNotIn('tour_ready',[b['type'] for b in conflict['reply']['blocks']])
        self.restart()
        restored = self.get()
        for key in ('chat','tour','preferences','revision'):
            self.assertEqual(restored[key],conflict[key])
        view = self.action('pick_option',option_id=self.option(conflict,'time:'))
        self.assertEqual(view['chat']['pending']['kind'],'confirm_plan')
        self.assertEqual(view['tour']['stops'],ready['tour']['stops'])
        view = self.action('confirm_yes')
        self.assertTrue(view['tour']['stops'])

    def test_relax_leg_requires_reconfirmation(self):
        view = self.conflict(max_leg_min=10)
        self.assertIsNone(view['tour'])
        option = self.option(view,'relax_leg:')
        view = self.action('pick_option',option_id=option)
        self.assertIsNone(view['tour'])
        self.assertEqual(view['preferences']['max_leg_min'],int(option.split(':')[1]))
        self.assertEqual(view['chat']['pending']['kind'],'confirm_plan')
        self.assertTrue(self.action('confirm_yes')['tour']['stops'])

    def test_drop_requires_reconfirmation(self):
        view = self.conflict(end_time='10:55')
        option = self.option(view,'drop:')
        view = self.action('pick_option',option_id=option)
        self.assertIsNone(view['tour'])
        self.assertEqual(len(view['chat']['shortlist']),1)
        self.assertEqual(view['chat']['pending']['kind'],'confirm_plan')
        self.assertTrue(self.action('confirm_yes')['tour']['stops'])

    def test_replace_ordinal(self):
        self.prepare()
        before = self.action('confirm_yes')
        view = self.post(text='đổi quán thứ nhất trong tour').json()
        old, new = before['tour']['stops'],view['tour']['stops']
        self.assertNotEqual(old[0]['venue_id'],new[0]['venue_id'])
        self.assertEqual(old[1]['venue_id'],new[1]['venue_id'])
        self.assertEqual(view['revision'],before['revision']+1)
        self.assertEqual(view['tour']['locks'],[old[1]['venue_id']])
        self.assertEqual(set(s['venue_id'] for s in new),set(s['venue_id'] for s in view['chat']['shortlist']))
        self.restart()
        self.assertEqual(self.get()['tour'],view['tour'])

    def test_replace_label(self):
        ids = self.prepare()
        before = self.action('confirm_yes')
        label = next(r['label'] for r in before['chat']['last_results'] if r['venue_id']==ids[0])
        view = self.post(text='đổi quán '+label+' trong tour').json()
        self.assertNotIn(ids[0],[s['venue_id'] for s in view['tour']['stops']])
        self.assertIn('tour_ready',[b['type'] for b in view['reply']['blocks']])

    def test_replace_unknown_ordinal_and_multiple_refs(self):
        self.prepare()
        before = self.action('confirm_yes')
        for text in ('đổi quán thứ 8 trong tour','đổi quán A và B trong tour'):
            response = self.post(text=text)
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.json()['tour']['stops'],before['tour']['stops'])
            self.assertNotIn('tour_ready',[b['type'] for b in response.json()['reply']['blocks']])

    def test_replace_before_tour(self):
        view = self.post(text='đổi quán thứ hai trong tour').json()
        self.assertIsNone(view['tour'])
        self.assertTrue(view['reply']['blocks'])

    def test_replace_kept_or_locked(self):
        ids = self.prepare()
        self.action('keep',venue_id=ids[0])
        self.action('request_plan')
        before = self.action('confirm_yes')
        ordinal = next(i+1 for i,stop in enumerate(before['tour']['stops']) if stop['venue_id']==ids[0])
        view = self.post(text=f'đổi quán thứ {ordinal} trong tour').json()
        self.assertEqual(view['tour']['stops'],before['tour']['stops'])
        self.assertIn('stop_locked',[b.get('code') for b in view['reply']['blocks']])

    def test_replace_failure_keeps_tour(self):
        self.prepare()
        before = self.action('confirm_yes')
        with patch('app.api.routes.engine.replace_stop',return_value=ReplaceResult(False,None,('SYNTHETIC no replacement',))):
            view = self.post(text='đổi quán thứ nhất trong tour').json()
        self.assertEqual(view['tour']['stops'],before['tour']['stops'])
        self.assertIn('replace_failed',[b.get('code') for b in view['reply']['blocks']])

    def test_invalid_replacement_rolls_back(self):
        self.prepare()
        self.action('confirm_yes')
        before = self.get()
        with self.app.state.sessions.owned(self.url.split('/')[-1],self.headers['X-Session-Token']) as session:
            invalid = replace(session.tour,locks=())
        with patch('app.api.routes.engine.replace_stop',return_value=ReplaceResult(True,invalid,())):
            self.assertEqual(self.post(text='đổi quán thứ nhất trong tour').status_code,500)
        self.assertEqual(self.get(),before)
