import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from qa.chat.run_scenarios import ChatUnavailable, available, scenario_app, run_files


class ConversationScenarios(unittest.TestCase):
    def test_acceptance_corpus(self):
        with scenario_app({}) as (_, client, _):
            session = client.post('/v1/sessions').json()
            headers = {'X-Session-Token': session['token']}
            try:
                available(client, '/v1/sessions/' + session['session_id'], headers, 0)
            except ChatUnavailable as exc:
                self.skipTest(str(exc))
        report = run_files([ROOT / 'qa/chat/scenarios/scenarios.json', ROOT / 'qa/chat/scenarios/adversarial.json'])
        for scenario in report['scenarios']:
            with self.subTest(scenario=scenario['id']):
                self.assertEqual(scenario['status'], 'passed', scenario)
