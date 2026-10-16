"""Run C4 acceptance against the merged pre-wiring route without changing files."""
import subprocess
import sys
import types
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import app.main
from backend.tests.api import test_chat, test_chat_plan
original = types.ModuleType('c4_original_routes')
sys.modules[original.__name__] = original
code = subprocess.run(['git','show','20294f5:backend/app/api/routes.py'],check=True,capture_output=True,encoding='utf-8').stdout
exec(compile(code,'pre_c4_routes.py','exec'),original.__dict__)
main = types.ModuleType('c4_original_main')
code = subprocess.run(['git','show','20294f5:backend/app/main.py'],check=True,capture_output=True,encoding='utf-8').stdout
exec(compile(code.replace('from app.api.routes import router','from c4_original_routes import router'),'pre_c4_main.py','exec'),main.__dict__)
test_chat.create_app = main.create_app
names = ('test_time_conflict_vehicle_then_explicit_confirmation','test_preserves_existing_tour_and_conflict_pending_restart','test_relax_leg_requires_reconfirmation','test_drop_requires_reconfirmation','test_replace_ordinal','test_replace_label')
result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(test_chat_plan.ChatPlanAPI(n) for n in names))
print('PRE-C4 merged route 20294f5; expected behavioral failures:',len(result.failures)+len(result.errors))
sys.exit(0 if len(result.failures)+len(result.errors)==len(names) else 1)
