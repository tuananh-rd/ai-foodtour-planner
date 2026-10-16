"""Execute pre-wiring API code with only an injection compatibility shim, to prove behavioral failures."""
import subprocess
import sys
import types
import unittest
import app.main
from backend.tests.api import test_chat_llm_wiring as tests
original=types.ModuleType('c5_original_routes')
sys.modules[original.__name__]=original
code=subprocess.run(['git','show','df43e9e:backend/app/api/routes.py'],check=True,capture_output=True,encoding='utf-8').stdout
exec(compile(code,'pre_wiring_routes.py','exec'),original.__dict__)
main=types.ModuleType('c5_original_main')
code=subprocess.run(['git','show','df43e9e:backend/app/main.py'],check=True,capture_output=True,encoding='utf-8').stdout
code=code.replace('from app.api.routes import router','from c5_original_routes import router')
exec(compile(code,'pre_wiring_main.py','exec'),main.__dict__)
def seam_only(*,chat_understander=None,**kw):
    app=main.create_app(**kw)
    app.state.chat_understander=chat_understander
    return app
tests.create_app=seam_only
suite=unittest.TestSuite(tests.ChatLLMWiring(n) for n in ('test_call_cache_and_restart','test_cap_survives_restart','test_reserve_and_exhaustion','test_error_counts'))
print('BEFORE: df43e9e original main/routes, injection shim only; production behavior unchanged.')
result=unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(0 if not result.wasSuccessful() else 1)
