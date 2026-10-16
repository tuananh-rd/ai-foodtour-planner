"""Run C1 behavioural tests against the untouched pre-change git archive."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile
ROOT=Path(__file__).resolve().parents[2]
REV='3e9423a'
with tempfile.TemporaryDirectory() as tmp:
 base=Path(tmp)
 archive=base/'before.zip'
 subprocess.run(['git','archive','--format=zip','--output='+str(archive),REV],cwd=ROOT,check=True)
 checkout=base/'checkout'
 with zipfile.ZipFile(archive) as z: z.extractall(checkout)
 shutil.copyfile(ROOT/'backend/tests/api/test_chat.py',checkout/'backend/tests/api/test_chat.py')
 env=dict(os.environ,PYTHONPATH=str(checkout/'backend'),PYTHONIOENCODING='utf-8')
 cases=['test_revision_once_and_conflict','test_restart_shortlist_pending_results_allergy',
 'test_confirm_exact_selection_and_stale_tour','test_conflicting_plan_never_drops_stop',
 'test_state_cap_and_exception_roll_back','test_no_text_in_logs']
 args=[sys.executable,'-m','unittest','-v',*['test_chat.ChatAPI.'+n for n in cases]]
 result=subprocess.run(args,cwd=checkout/'backend/tests/api',env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,encoding='utf-8')
 output=result.stdout.replace(str(checkout),'<pre-change-archive>')
 (ROOT/'docs/reports/C1_FAIL_BEFORE_TESTS.txt').write_text('Archive '+REV+'; copied test_chat.py only; production untouched.\n'+output+'\nExit: '+str(result.returncode),encoding='utf-8')
 print(result.returncode)
