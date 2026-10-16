"""Capture complete UTF-8 local verification output for the C1 dispatch."""
import os
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[2]
env=dict(os.environ,PYTHONPATH=str(ROOT/'backend'),PYTHONIOENCODING='utf-8')
commands=[
 ('C1_TESTS.txt',['-m','unittest','discover','-s','backend/tests','-v']),
 ('C1_OPENAPI.txt',['tools/export_openapi.py','--check']),
 ('C1_SCENARIOS.txt',['qa/chat/run_scenarios.py','--report','docs/reports/C1_SCENARIOS.json']),
 ('C0HF_C1_probe_output.txt',['docs/reports/c0hf3_probes.py','docs/reports/C0HF_C1_PROBES.json']),
 ('C0HF_C1_FRESH.txt',['docs/reports/c0hf_c1_fresh.py']),
]
codes=[]
for output,args in commands:
 result=subprocess.run([sys.executable,*args],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,encoding='utf-8')
 result.stdout = '\n'.join(line.rstrip() for line in result.stdout.splitlines())+'\n'
 (ROOT/'docs/reports'/output).write_text('Command: python '+ ' '.join(args)+'\n'+result.stdout+'\nExit: '+str(result.returncode)+'\n',encoding='utf-8')
 codes.append(result.returncode)
 print(output,result.returncode,flush=True)

raise SystemExit(1 if any(codes) else 0)
