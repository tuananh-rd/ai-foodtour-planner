import os, subprocess, json, time, re, shutil, sys
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
root=Path.cwd(); out=root/'qa/reports/c6-final4'; env=os.environ.copy();env['PYTHONPATH']=str(root/'backend');env['PYTHONIOENCODING']='utf-8'
out.mkdir(parents=True,exist_ok=True)
py=str(root/'.venv/Scripts/python.exe')
commands=[('backend',[py,'-m','unittest','discover','-s','backend/tests']),('drift',[py,'tools/export_openapi.py','--check']),('components',['node','qa/e2e/test_components.mjs']),('contract',['node','frontend/lib/contractTest.js']),('browser',['node','qa/chat/c6_final4_runner.mjs','final4']),('frontend_regressions',['node','qa/chat/c6_final_regressions.mjs']),('scenarios',[py,'qa/chat/run_scenarios.py','--report',str(out/'scenarios.json')]),('security',[py,'qa/chat/c6_final2_security.py'])]
commands += [(m,['node','qa/chat/c6_final_runner.mjs',m]) for m in ['allergy','fallback','guard','budget','hostile','flagoff']]
commands += [('harness',['node','qa/chat/c6_final2_harness.mjs'])]
results=[]
for name,cmd in commands:
 t=time.time(); log=out/(name+'.log')
 with log.open('w',encoding='utf-8') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,env=env,timeout=700)
 text=log.read_text(encoding='utf-8'); entry=dict(name=name,exit=r.returncode,seconds=round(time.time()-t,2)); results.append(entry)
 expected={'allergy':'[CH-06]', 'fallback':'[CH-03b]', 'guard':'[CH-08-DOUBLECLICK]', 'budget':'[CH-13a-BUDGET-VALIDATION]'}
 entry['passed']=(r.returncode==1 and 'Compiled successfully' in text and ('Assertion failed in '+expected[name]) in text) if name in expected else r.returncode==0
 print(json.dumps(entry),flush=True);print('\n'.join(text.splitlines()[-5:]),flush=True)
 match=re.search(r'C6 evidence scratch: (.*?) mode:',text)
 if match:
  scratch=Path(match[1]); result=scratch/'result.json'
  if result.exists():shutil.copyfile(result,out/(name+'-results.json'))
  if name=='browser':
   for img in (scratch/'screenshots').glob('*.png'):
    if 'final4-maps' in img.name or 'hostile_eight' in img.name:shutil.copyfile(img,out/img.name)
 (out/'gate.json').write_text(json.dumps(results,indent=2),encoding='utf-8')

if any(not r["passed"] for r in results):
 sys.exit(1)
