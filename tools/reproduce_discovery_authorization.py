"""Offline engine-level RED/GREEN transcript, synthetic fixtures/native model stub only."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT/'backend'))
from app.discovery.engine import handle
from app.discovery.state import State
from app.discovery.tools import Tools
from app.planner.interfaces import StraightLineEstimator
from backend.tests.discovery.test_discovery import fixture
from backend.tests.discovery.test_upgrade import SCREENSHOT, ScreenshotModel

baseline = subprocess.check_output(['git', 'show', '200405a:backend/app/discovery/engine.py'], cwd=ROOT).decode('utf-8')
namespace = {'__name__': 'app.discovery.engine_baseline', '__package__': 'app.discovery'}
exec(compile(baseline, '200405a:engine.py', 'exec'), namespace)
evidence = {'scope': 'engine-level RED/GREEN; current synthetic State/Tools used for both; no HTTP or provider transport',
            'input': SCREENSHOT, 'cases': []}
for label, implementation in [('baseline_engine_200405a', namespace['handle']), ('current_engine', handle)]:
    state = State()
    state.patch({'area': 'Phố cổ', 'origin': {'lat': 21.0285, 'lon': 105.8522}})
    state.selection = [{'id': '1', 'locked': True}]
    result, provider = implementation(SCREENSHOT, Tools(state, fixture(), StraightLineEstimator()), model=ScreenshotModel())
    evidence['cases'].append({'engine': label, 'status': result['status'], 'reply': result['text'],
        'area': state.profile.area, 'foods': state.profile.foods,
        'selected_count': len(state.selection), 'selection_lock_preserved': state.selection[0]['locked'],
        'automatic_tour': state.plan_requested, 'provider_transport': 'stub only'})
assert 'chưa được người dùng cho phép' in evidence['cases'][0]['reply']
assert 'chưa được người dùng cho phép' not in evidence['cases'][1]['reply']
(ROOT/'docs/reports/discovery-upgrade-authorization.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print('Engine-level RED/GREEN reproduced; zero provider requests')
