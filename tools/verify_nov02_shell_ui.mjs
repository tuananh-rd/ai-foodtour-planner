/** Independent real UI + real synthetic backend acceptance. No provider probes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn, execFileSync} from 'node:child_process';
const web=process.env.DISCOVERY_WEB||'http://127.0.0.1:3330';
const api=process.env.DISCOVERY_API||'http://127.0.0.1:8240';
const port=Number(process.env.DISCOVERY_CDP||19790);
const out=process.env.DISCOVERY_EVIDENCE||'docs/reports/continuation-20261102-final-shell';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=18000){const start=Date.now();while(Date.now()-start<ms){try{if(await fn())return;}catch{}await pause(90);}throw Error('Observable browser state timed out');}
const health=await(await fetch(api+'/health')).json();
if(health.dataset_source!=='synthetic'||health.llm_provider!=='rules'||health.web_search_configured)throw Error('Requires explicit synthetic/rules/web-retired lane');
const free=await new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});
if(!free)throw Error('CDP port occupied; no process stopped');
fs.mkdirSync(out,{recursive:true});
const evidence={web,api,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),backend_commit:health.build_commit,
  dataset:'synthetic',provider:'rules',liveGemini:'NOT TESTED',checks:[],screenshots:[],errors:[],remoteOrigins:[],ranges:[],statuses:[]};
const record=(name,pass)=>{evidence.checks.push({name,pass:!!pass,...(!pass?{diagnostic:{status:view?.status,reply:view?.reply,tour_status:view?.tour?.status}}:{})});console.log(JSON.stringify({name,pass:!!pass}));};
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking',
  '--enable-unsafe-swiftshader',`--remote-debugging-port=${port}`,`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'discovery-qa-'))}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let ws,seq=0,view=null,posts=0;const pending=new Map();
try{
 let target;await until(async()=>{target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x=>x.type==='page');return target;});
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP deadline '+method));},8000);pending.set(id,{resolve:x=>{clearTimeout(timer);resolve(x)},reject:x=>{clearTimeout(timer);reject(x)}});ws.send(JSON.stringify({id,method,params}));});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);return;}
   if(m.method==='Network.requestWillBeSent'){
     const u=new URL(m.params.request.url);if(/^https?:$/.test(u.protocol)&&![new URL(web).origin,new URL(api).origin].includes(u.origin)&&!evidence.remoteOrigins.includes(u.origin))evidence.remoteOrigins.push(u.origin);
   }
   if(m.method==='Network.responseReceived'){
     const r=m.params.response;
     if(/\/assistant$/.test(r.url)){evidence.statuses.push(r.status);cdp('Network.getResponseBody',{requestId:m.params.requestId}).then(x=>{try{const b=JSON.parse(x.body);if(b.contract==='discovery-v1')view=b;posts++;}catch{posts++;}}).catch(()=>posts++);}
     if(r.url.includes('.pmtiles'))evidence.ranges.push(r.status);
   }
   if(m.method==='Runtime.exceptionThrown')evidence.errors.push(String(m.params.exceptionDetails?.exception?.description||m.params.exceptionDetails?.text||'Uncaught browser exception').replace(/[a-f0-9]{32,64}/gi,'[redacted]').slice(0,900));
 };
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
 const sel=id=>`[data-testid="${id}"]`;
 const exists=id=>ev(`!!document.querySelector(${JSON.stringify(sel(id))})`);
 async function click(selector){await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);if(!p)throw Error('Unavailable control '+selector);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});}
 async function idle(){await until(()=>ev(`!!document.querySelector('[data-testid="discovery-input"]')&&!document.querySelector('[data-testid="discovery-input"]').disabled&&!document.querySelector('[aria-busy="true"]')`));await pause(130);}
 async function send(text){await idle();const before=posts;await click(sel('discovery-input'));await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2});await cdp('Input.insertText',{text});await click(sel('discovery-send-btn'));await until(()=>posts>before);await idle();}
 const tab=name=>click(`.nn-mobile-tabs button:nth-child(${name==='chat'?1:2})`);
 async function action(id){const before=posts;await click(sel(id));await until(()=>posts>before);await idle();}
 async function shot(name){await ev('window.scrollTo(0,0)');const x=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(x.data,'base64'));evidence.screenshots.push(name+'.png');return x.data;}
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
 await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`window.__gpsCalls=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(ok,fail)=>{window.__gpsCalls++;setTimeout(()=>fail({code:1,message:'Synthetic denied'}),30)}}});`});
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1024,deviceScaleFactor:1,mobile:false});
 await cdp('Page.navigate',{url:web});await until(()=>exists('discovery-input'));await idle();await until(()=>view!==null);
 record('no automatic GPS or HoanKiem origin',await ev('window.__gpsCalls===0')&&view.profile.origin===null);
 record('model and optional web separate; unavailable choices honest',await exists('chat-model-select')&&await exists('web-search-toggle')&&await ev(`!document.querySelector('[data-testid="web-search-toggle"]').checked&&Array.from(document.querySelector('[data-testid="chat-model-select"]').options).every(x=>!x.value.toLowerCase().includes('tavily'))`));

 await send('Chào bạn');
 for(const [width,height]of [[1280,800],[390,844]]){
   await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});
   await pause(200);await ev('window.scrollTo(0,0)');
   const metrics=await ev(`(()=>{const names=['.nn-sidebar','.nn-main','.nn-topbar','.nn-main-grid','.nn-chat-card','.nn-chat-card-header','.nn-hero-heading','.nn-chips-row','.nn-origin-chooser','.nn-stream','.nn-composer','.nn-mobile-tabs'];return Object.fromEntries(names.map(name=>{const e=document.querySelector(name);const r=e?.getBoundingClientRect();return[name,r?{top:r.top,height:r.height,bottom:r.bottom,display:getComputedStyle(e).display}:null]}))})()`);
   (evidence.shellMetrics??=[]).push({width,height,metrics});
   record('general chat stream usable '+width,metrics['.nn-stream'].height>=(width===390?422:320));
   record('general chat composer visible '+width,metrics['.nn-composer'].bottom<=height);
 }
 await click(sel('origin-expand-controls-btn'));await click('.nn-origin-manual-toggle');
 evidence.expandedOrigin=await ev(`(()=>{const s=document.querySelector('.nn-stream'),o=document.querySelector('.nn-origin-chooser'),i=document.querySelector('[data-testid="discovery-input"]');return{originHeight:o.getBoundingClientRect().height,streamHeight:s.getBoundingClientRect().height,composerBottom:i.getBoundingClientRect().bottom}})()`);
 record('mobile manual origin editor retains visible composer',evidence.expandedOrigin.composerBottom<=844&&evidence.expandedOrigin.streamHeight>100);
 record('mobile manual origin submit remains accessible',await ev(`(()=>{const b=document.querySelector('[data-testid="origin-coords-submit"]'),r=b.getBoundingClientRect();return r.height>0&&r.bottom<=844})()`));
 await shot('mobile-origin-editor');
}catch(error){evidence.blocker=String(error.message).slice(0,200);record('journey completed',false);}
finally{fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(evidence,null,2));ws?.close();if(chrome.pid)try{execFileSync('taskkill',['/pid',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}}
process.exitCode=evidence.checks.some(x=>!x.pass)?1:0;

