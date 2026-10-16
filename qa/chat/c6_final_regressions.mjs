// Run browser suites serially, with Chrome and coordinator-approved ports.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd();
for(const suite of ['test_ui_v2','test_ui_kit','test_maps_links_cdp']){
 const log=path.join(os.tmpdir(),'c6-final-'+suite+'.txt');
 const out=fs.openSync(log,'w');
 const r=spawnSync(process.execPath,[path.join(root,'qa/e2e/'+suite+'.mjs')],{cwd:root,stdio:['ignore',out,out],timeout:300000,env:{...process.env,BROWSER:'C:/Program Files/Google/Chrome/Application/chrome.exe',UI_V2_PORT:'13100',UI_V2_CDP_PORT:'19300',UI_KIT_PORT:'13100',UI_KIT_CDP_PORT:'19300',MAPS_WEB_PORT:'13100',MAPS_CDP_PORT:'19300'}});
 fs.closeSync(out);console.log(suite,'exit',r.status,'error',r.error?.message||'', 'log',log);console.log(fs.readFileSync(log,'utf8').split('\n').slice(-9).join('\n'));
 if(r.status!==0)process.exitCode=1;
}
