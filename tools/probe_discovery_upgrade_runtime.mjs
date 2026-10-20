/** Read-only production bootstrap/resize evidence. Never submits assistant turns. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn, execFileSync} from 'node:child_process';
const web='http://127.0.0.1:3340', api='http://127.0.0.1:8320', port=19791;
const output='docs/reports/discovery-upgrade-private-bootstrap.json';
const before=await(await fetch(api+'/health')).json();
if(before.dataset_source!=='private'||before.llm_provider!=='gemini')throw Error('Expected private/Gemini lane');
await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});
const evidence={frontend:web,api,frontend_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 backend_commit:before.build_commit,dataset:before.dataset_source,configured_provider:before.llm_provider,configured_model:before.llm_model,
 live_proof:'New live smoke BLOCKED on tool-result timeout; bootstrap is not live proof',
 budget_before:before.llm_budget,assistant_post_attempts:0,external_requests:0,js_exceptions:0,checks:[],viewports:[]};
const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking',
 `--remote-debugging-port=${port}`,`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'discovery-runtime-'))}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let socket,seq=0,bootstrap=null,step='attach';const pending=new Map();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const end=Date.now()+18000;while(Date.now()<end){try{if(await fn())return;}catch{}await pause(100);}throw Error('Observable state deadline');}
const record=(name,pass)=>evidence.checks.push({name,pass:!!pass});
try{
 let page;await until(async()=>{page=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x=>x.type==='page');return page;});
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP deadline'));},8000);pending.set(id,{resolve:x=>{clearTimeout(timer);resolve(x)},reject:x=>{clearTimeout(timer);reject(x)}});socket.send(JSON.stringify({id,method,params}));});
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error('CDP command failed')):p?.resolve(m.result);return;}
  if(m.method==='Runtime.exceptionThrown')evidence.js_exceptions++;
  if(m.method==='Fetch.requestPaused'){
   const r=m.params.request,u=new URL(r.url);let block=false;
   if(![web,api].includes(u.origin)){evidence.external_requests++;block=true;}
   if(u.pathname.endsWith('/assistant')&&r.method==='POST'){evidence.assistant_post_attempts++;block=true;}
   call(block?'Fetch.failRequest':'Fetch.continueRequest',{requestId:m.params.requestId,...(block?{errorReason:'BlockedByClient'}:{})}).catch(()=>{});
  }
  if(m.method==='Network.responseReceived'&&m.params.response.url.endsWith('/assistant')){
   call('Network.getResponseBody',{requestId:m.params.requestId}).then(r=>{const v=JSON.parse(r.body);bootstrap={contract:v.contract,dataset:v.source?.dataset_source,status:v.status};}).catch(()=>{});
  }
 };
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Fetch.enable',{patterns:[{urlPattern:'http*',requestStage:'Request'}]});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1024,deviceScaleFactor:1,mobile:false});
 step='bootstrap';await call('Page.navigate',{url:web});
 await until(()=>evaluate(`!!document.querySelector('[data-testid="discovery-input"]')&&!document.querySelector('[data-testid="discovery-input"]').disabled`));
 await until(()=>bootstrap!==null);evidence.bootstrap=bootstrap;
 record('authenticated initial view private discovery-v1',bootstrap.contract==='discovery-v1'&&bootstrap.dataset==='private');
 step='resize';
 for(const [width,height] of [[1280,800],[1440,1024],[1920,1080],[2560,1440],[390,844]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});await pause(180);
  const metrics=await evaluate(`(()=>{const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,canvas:rect('.nn-canvas-wrapper'),chat:rect('.nn-chat-card'),tour:rect('.nn-tour-col'),composer:rect('.nn-composer'),emoji:/[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\p{Emoji_Modifier}\\ufe0f\\u200d\\u20e3]/u.test(document.body.innerText)}})()`);
  evidence.viewports.push({width,height,...metrics});record('no horizontal overflow '+width,metrics.scrollWidth<=width);
  record('canvas fills right edge '+width,Math.abs(metrics.canvas.right-width)<=16);
  record('plain initial UI '+width,!metrics.emoji);
  if(width>=1024){record('tour and composer contained '+width,metrics.tour.right<=width&&metrics.composer.right<=width&&metrics.composer.bottom<=height&&metrics.composer.y>=0);record('chat contained vertically '+width,metrics.chat.y>=0&&metrics.chat.bottom<=height&&metrics.chat.height>height*.5);}
 }
 record('no assistant POST attempted',evidence.assistant_post_attempts===0);record('no external request',evidence.external_requests===0);record('no JavaScript exception',evidence.js_exceptions===0);
 const after=await(await fetch(api+'/health')).json();evidence.budget_after=after.llm_budget;
 record('no model budget consumed by bootstrap',after.llm_budget.used===before.llm_budget.used&&after.llm_budget.limit===before.llm_budget.limit);
}catch{evidence.failed_step=step;record('runtime probe completed',false);}
finally{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(evidence,null,2));socket?.close();if(child.pid)try{execFileSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});}catch{}}
console.log(JSON.stringify({checks:evidence.checks.length,passed:evidence.checks.filter(x=>x.pass).length,failed_step:evidence.failed_step,assistant_posts:evidence.assistant_post_attempts}));
process.exitCode=evidence.checks.some(x=>!x.pass)?1:0;
