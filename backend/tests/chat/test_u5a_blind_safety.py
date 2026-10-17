"""Independent frozen v1 SAFETY gate; accuracy remains report-only.

Intentionally no expectedFailure/skip/allowlist: an unsafe gold case must fail.
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'qa/chat'))
from eval_guided import load_cases, new_engine, safety_failures
from app.chat.state import ChatState
from app.chat.llm_understand import Outcome
from app.planner.types import Preferences


class FrozenBlindSafety(unittest.TestCase):
    def test_frozen_v1_safety(self):
        eng=new_engine()
        for provider in ['none','exhausted']:
            llm=None if provider=='none' else lambda *args:Outcome(None,0,'exhausted')
            for case in load_cases():
                with self.subTest(provider=provider,case=case['id'],text=case['text']):
                    st,pr=ChatState(),Preferences()
                    for text in [*case.get('prior',[]),case['text']]:
                        r=eng.handle(st,pr,**({'action':text} if isinstance(text,dict) else {'text':text}),llm=llm)
                        st,pr=r.state,r.prefs
                    self.assertEqual(safety_failures(case,r,provider=='none'),[])
