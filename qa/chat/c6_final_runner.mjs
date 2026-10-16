// Independent C6 final gate: author suite, real services, scratch-only mutations.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd(), mode=process.argv[2]||'clean';
const original=path.join(root,'qa/e2e/test_chat_v2.mjs');
let s=fs.readFileSync(original,'utf8').replace(/\r\n/g,'\n').replace('fileURLToPath(import.meta.url)',JSON.stringify(original));
s=s.replace("FOODTOUR_LLM: 'mock',","FOODTOUR_LLM: 'mock', FOODTOUR_EXPLAIN: 'template',");
s=s.replace("filter: (src) => !src.includes('node_modules') && !src.includes('.next'),","filter: (src) => !src.includes('node_modules') && !src.includes('.next') && !path.basename(src).startsWith('.env'),");
s=s.replace('return new Promise((res, rej) => pendingCalls.set(id, { res, rej }));',"return new Promise((res, rej) => { pendingCalls.set(id,{res,rej}); setTimeout(()=>{if(pendingCalls.has(id)){pendingCalls.delete(id);rej(Error('CDP timeout '+method));}},15000).unref();});");
s=s.replace('attempt <= 15','attempt <= 1');
// Empty composer disables Send even after a turn completes; use the real busy
// container rather than mistaking an empty input for a pending request.
s=s.replace(`document.querySelector('[data-testid="chat-send"]')?.disabled ||`, '');
s=s.replace("      '--disable-gpu',", "      '--disable-gpu', '--disable-crash-reporter', '--disable-extensions',");
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'codex-c6-final-'));
fs.cpSync(path.join(root,'backend'),path.join(scratch,'backend'),{recursive:true,filter:p=>!['.env','__pycache__','reports'].includes(path.basename(p))});
if(mode==='extended'){
 fs.writeFileSync(path.join(scratch,'backend/c6_boot.py'),`from app.main import create_app\nfrom app.chat.llm_understand import Outcome\nclass Budget:\n exhausted=False\n def snapshot(self):\n  return dict(resets_at="2026-10-18T07:00:00Z",limit=18,used=18 if self.exhausted else 0,remaining=0 if self.exhausted else 18,exhausted=self.exhausted)\nbudget=Budget()\nclass Stub:\n def understand(self,text,compact,used_in_session=0):\n  budget.exhausted='EXHAUSTED' in text\n  return Outcome(None,0,'exhausted' if 'EXHAUSTED' in text else 'capped' if 'CAPPED' in text else None)\napp=create_app(chat_understander=Stub())\napp.state.llm_budget=budget\n`);
 s=s.replace("'app.main:app'","'c6_boot:app'");
}
s=s.replace("const BACKEND_DIR = path.join(REPO_ROOT, 'backend');",`const BACKEND_DIR = ${JSON.stringify(path.join(scratch,'backend'))};`);
s=s.replace("const SCREENSHOTS_DIR = path.join(REPO_ROOT, 'qa', 'screenshots', 'chat-v2');",`const SCREENSHOTS_DIR = ${JSON.stringify(path.join(scratch,'screenshots'))};`);
const mutation=mode==='allergy'?`const p=path.join(scratchDir,'app/components/v2/chat/BlockRenderer.jsx'); let t=fs.readFileSync(p,'utf8'); if(!t.includes('{hasAllergyUnknown && ('))throw Error('anchor'); fs.writeFileSync(p,t.replace('{hasAllergyUnknown && (','{false && ('));`:
mode==='fallback'?`const p=path.join(scratchDir,'app/components/v2/chat/BlockRenderer.jsx'); let t=fs.readFileSync(p,'utf8'); if(!t.includes('const displayVal = cell.value ||'))throw Error('anchor');fs.writeFileSync(p,t.replace(/const displayVal = cell.value[^;]*;/,"const displayVal = cell.value || '';"));`:
mode==='guard'?`for(const n of ['ChatV2Layout','ChatColumn','BlockRenderer','ShortlistColumn','ProfileBar','StartScreen']) {const p=path.join(scratchDir,'app/components/v2/chat/'+n+'.jsx');let t=fs.readFileSync(p,'utf8'); t=t.replace('if (inFlightRef.current || busy) return;','').replace('if (isSubmittingRef.current || busy) return;','').replace('if (busy || !val) return;','if (!val) return;').replaceAll('disabled={busy}','disabled={false}').replaceAll('busy={busy || inFlight}','busy={false}');fs.writeFileSync(p,t);}`:'';
let instrumentation='';
if(mode==='extended'){
 const old=fs.readFileSync(path.join(root,'qa/chat/review_c3_scratch.txt'),'utf8');
 instrumentation=old.slice(0,old.indexOf("      fs.mkdirSync(path.join(scratchDir,'app/review/layoutcheck')"))+'\n    }\n';
}
s=s.replace("    console.log(`[Frontend] Building production",mutation+instrumentation+"\n    console.log(`[Frontend] Building production");
s=s.replace('    // =============================================================\n    // Scenario 1:',`    const googleRequests=[]; ws.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.method==='Network.requestWillBeSent' && /^https?:\\/\\/([^/]*\\.)?google\\./.test(d.params.request.url))googleRequests.push(d.params.request.url);});\n    // =============================================================\n    // Scenario 1:`);
if(mode==='extended') {
 const extension=fs.readFileSync(path.join(root,'qa/chat/c6_final_browser.txt'),'utf8');
 s=s.replace('\n  } finally {', '\n'+extension+'\n  } finally {');
}
if(mode==='verify'){
 s=s.replace('\n  } finally {','\n'+fs.readFileSync(path.join(root,'qa/chat/c6_final_verify.txt'),'utf8')+'\n  } finally {');
}
if(mode.startsWith('hostile')){
 const start=s.indexOf('    // Scenario 1:');
 const end=s.indexOf('\n  } finally {',start);
 let probe=fs.readFileSync(path.join(root,'qa/chat/c6_final_hostile.txt'),'utf8');
 if(mode==='hostile-name')probe=probe.replace('card.venue.address=card.venue.name;','');
 s=s.slice(0,start)+probe+s.slice(end);
}
if(mode==='flagoff'){
 s=s.replace("FOODTOUR_CHAT_V2: '1',",'').replace("NEXT_PUBLIC_CHAT_V2: '1',","NEXT_PUBLIC_CHAT_V2: '0',").replace("FOODTOUR_UI_V2: '1',","FOODTOUR_UI_V2: '0',").replace("NEXT_PUBLIC_UI_V2: '1',","NEXT_PUBLIC_UI_V2: '0',");
 s=s.replace('    for (let attempt = 1; attempt <= 1; attempt++) {','    delete backendEnv.FOODTOUR_CHAT_V2;\n    for (let attempt = 1; attempt <= 1; attempt++) {');
 const start=s.indexOf('    // Scenario 1:');const end=s.indexOf('\n  } finally {',start);
 s=s.slice(0,start)+fs.readFileSync(path.join(root,'qa/chat/c6_final_flagoff.txt'),'utf8')+s.slice(end);
}
s=s.replace('    if (ws) {',`    fs.writeFileSync(${JSON.stringify(path.join(scratch,'result.json'))},JSON.stringify(results,null,2));\n    if (ws) {`);
s=s.replace('run().catch(', 'run().then(()=>{if(results.some(r=>!r.passed))process.exitCode=1;}).catch(');
// Coordinator GATE-OPEN explicitly assigns these alternate scratch ports.
s=s.replaceAll('13000','13100').replaceAll('18000','18100').replaceAll('19222','19300');
const generated=path.join(scratch,'runner.mjs'); fs.writeFileSync(generated,s);
console.log('C6 evidence scratch:',scratch,'mode:',mode);
const r=spawnSync(process.execPath,[generated],{stdio:'inherit',timeout:600000,env:{...process.env,BROWSER:'C:/Program Files/Google/Chrome/Application/chrome.exe'}});
if(r.error)console.error(r.error.message);process.exit(r.status??2);
