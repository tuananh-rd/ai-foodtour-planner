// Preserve every UI-v2 assertion, collect failures instead of stopping at first.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const original=path.join(process.cwd(),'qa/e2e/test_ui_v2.mjs');
let s=fs.readFileSync(original,'utf8').replace(/\r\n/g,'\n').replace('fileURLToPath(import.meta.url)',JSON.stringify(original));
if(process.argv.includes('--focus'))s=s.replace("await send('Page.enable');","await send('Page.enable'); await send('Emulation.setFocusEmulationEnabled',{enabled:true});");
s=s.replace('if (!passed && !FAIL_BEFORE) {','if (false) {');
s=s.replace("    record(\n      'TC-V2-05b',",`    await sleep(150); console.log('FINAL DELAYED_FOCUS',JSON.stringify(await ev(\`(()=>{const i=document.querySelector('[data-request-input]');const c=getComputedStyle(i);return {documentFocus:document.hasFocus(),matchesFocus:i.matches(':focus'),active:document.activeElement===i,outline:c.outlineStyle,width:c.outlineWidth,shadow:c.boxShadow}})()\`)));\n    record(\n      'TC-V2-05b',`);
s=s.replace('run().catch(', 'run().then(()=>{if(results.some(r=>!r.passed))process.exitCode=1;}).catch(');
const generated=path.join(os.tmpdir(),'c6-final-ui-probe-'+Date.now()+'.mjs');fs.writeFileSync(generated,s);
const r=spawnSync(process.execPath,[generated],{stdio:'inherit',timeout:300000,env:{...process.env,BROWSER:'C:/Program Files/Google/Chrome/Application/chrome.exe',UI_V2_PORT:'13100',UI_V2_CDP_PORT:'19300'}});process.exit(r.status??2);
