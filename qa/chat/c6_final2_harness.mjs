// C6g busy-port handling: an owned HTTP listener must survive a refused run.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd(), original=path.join(root,'qa/e2e/test_chat_v2.mjs');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'codex-c6-final2-busy-'));
const source=fs.readFileSync(original,'utf8').replace(/\r\n/g,'\n')
 .replace('fileURLToPath(import.meta.url)',JSON.stringify(original))
 .replace("const SCREENSHOTS_DIR = path.join(REPO_ROOT, 'qa', 'screenshots', 'chat-v2');",`const SCREENSHOTS_DIR = ${JSON.stringify(path.join(scratch,'screenshots'))};`);
const runner=path.join(scratch,'runner.mjs');fs.writeFileSync(runner,source);
const env={...process.env,UI_CHAT_PORT_API:'18100',UI_CHAT_PORT_WEB:'13100',UI_CHAT_PORT_CDP:'19300',BROWSER:'C:/Program Files/Google/Chrome/Application/chrome.exe'};
delete env.FORCE_FREE_PORTS;
const server=http.createServer((req,res)=>{res.end('SYNTHETIC owned busy-port probe');});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(18100,'127.0.0.1',resolve);});
try{
 const started=Date.now(), result=spawnSync(process.execPath,[runner],{env,encoding:'utf8',timeout:15000});
 const health=await fetch('http://127.0.0.1:18100/health').then(r=>r.status).catch(()=>0);
 const summary={exit:result.status,elapsedMs:Date.now()-started,busyReported:result.stderr.includes('already in use'),ownedServerAfterRefusal:health};
 console.log('BUSY_PORT',JSON.stringify(summary));
 if(result.status!==1||!summary.busyReported||health!==200)throw Error('Busy port protection failed: '+result.stderr);
}finally{await new Promise(resolve=>server.close(resolve));}
