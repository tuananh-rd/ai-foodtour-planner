import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from qa.chat.run_scenarios import ChatUnavailable, available, scenario_app, run_files


class ConversationScenarios(unittest.TestCase):
    def test_acceptance_corpus(self):
        report = run_files([ROOT / 'qa/chat/scenarios/scenarios.json', ROOT / 'qa/chat/scenarios/adversarial.json'])
        for scenario in report['scenarios']:
            with self.subTest(scenario=scenario['id']):
                self.assertEqual(scenario['status'], 'passed', scenario)
