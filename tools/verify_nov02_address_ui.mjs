/** Independent real UI + real synthetic backend acceptance. No provider probes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn, execFileSync} from 'node:child_process';
const web=process.env.DISCOVERY_WEB||'http://127.0.0.1:3330';
const api=process.env.DISCOVERY_API||'http://127.0.0.1:8240';
const port=Number(process.env.DISCOVERY_CDP||19790);
const out=process.env.DISCOVERY_EVIDENCE||'docs/reports/continuation-20261102-final-address';
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
let ws,seq=0,view=null,posts=0,addressFixture=null,fixtureRequests=0;const pending=new Map(),requestMethods=new Map();
try{
 let target;await until(async()=>{target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x=>x.type==='page');return target;});
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP deadline '+method));},8000);pending.set(id,{resolve:x=>{clearTimeout(timer);resolve(x)},reject:x=>{clearTimeout(timer);reject(x)}});ws.send(JSON.stringify({id,method,params}));});
 ws.onmessage=e=>{const m=JSON.parse(e.data);
   if(m.method==='Fetch.requestPaused'){
     const p=m.params;
     (async()=>{
       if(p.responseStatusCode){
         if(addressFixture&&p.request.method==='POST'){
           const raw=await cdp('Fetch.getResponseBody',{requestId:p.requestId});
           const b=JSON.parse(raw.base64Encoded?Buffer.from(raw.body,'base64').toString('utf8'):raw.body);
           if(b.location?.source==='gps'){
             b.location={...b.location,label:addressFixture==='resolved'?'Phố giả lập, Hà Nội':'Vị trí GPS chưa có địa chỉ',approximate:true,address_status:addressFixture,address_provider:addressFixture==='resolved'?'photon':null,address_reason:addressFixture==='resolved'?null:'rate_limited',attribution:addressFixture==='resolved'?'(c) OpenStreetMap contributors':null};
             await cdp('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:p.responseStatusCode,responseHeaders:p.responseHeaders.filter(x=>!['content-length','content-encoding'].includes(x.name.toLowerCase())),body:Buffer.from(JSON.stringify(b)).toString('base64')});return;
           }
         }
       }else if(p.request.method==='POST'&&p.request.postData){
         const body=JSON.parse(p.request.postData);
         const args=body.action?.arguments;
         if(args?.operation==='coordinates'&&args.source==='gps'){
           fixtureRequests++;
           evidence.gpsResolveRequested=args.resolve_address===true;
           args.resolve_address=false; // prevent remote geocoding; test UI contract only
           await cdp('Fetch.continueRequest',{requestId:p.requestId,postData:Buffer.from(JSON.stringify(body)).toString('base64')});return;
         }
       }
       await cdp('Fetch.continueRequest',{requestId:p.requestId});
     })().catch(error=>{evidence.errors.push(error.message);cdp('Fetch.continueRequest',{requestId:p.requestId}).catch(()=>{});});return;
   }
if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);return;}
   if(m.method==='Network.requestWillBeSent'){
     requestMethods.set(m.params.requestId,m.params.request.method);
     const u=new URL(m.params.request.url);if(/^https?:$/.test(u.protocol)&&![new URL(web).origin,new URL(api).origin].includes(u.origin)&&!evidence.remoteOrigins.includes(u.origin))evidence.remoteOrigins.push(u.origin);
   }
   if(m.method==='Network.responseReceived'){
     const r=m.params.response;
     if(/\/assistant$/.test(r.url)){const isPost=requestMethods.get(m.params.requestId)==='POST';evidence.statuses.push(r.status);cdp('Network.getResponseBody',{requestId:m.params.requestId}).then(x=>{try{const b=JSON.parse(x.body);if(b.contract==='discovery-v1'&&(!view||b.revision>=view.revision))view=b;}catch{}if(isPost)posts++;}).catch(()=>{if(isPost)posts++;});}
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

 await cdp('Fetch.enable',{patterns:[{urlPattern:'*/assistant',requestStage:'Request'},{urlPattern:'*/assistant',requestStage:'Response'}]});
 await ev(`window.__gpsMode='success';navigator.geolocation.getCurrentPosition=(ok,fail)=>{window.__gpsCalls++;setTimeout(()=>window.__gpsMode==='denied'?fail({code:1}):window.__gpsMode==='timeout'?fail({code:3}):ok({coords:{latitude:21.0285,longitude:105.8522}}),20)}`);
 record('visible disclosure before GPS click',await exists('origin-gps-disclosure'));
 addressFixture='resolved';await action('origin-gps-button');
 record('click requests address resolution (upstream stubbed)',fixtureRequests===1&&evidence.gpsResolveRequested===true);
 record('resolved approximate address and attribution shown',await exists('origin-status-resolved')&&await exists('origin-attribution')&&await ev(`document.querySelector('[data-testid="origin-current-tag"]').textContent.includes('Phố giả lập')&&document.body.innerText.includes('Gần đúng')`));
 record('completed GPS address clears stale progress notice',!await exists('origin-geo-notice'));
 record('raw GPS coordinates absent from visible label',await ev(`!document.querySelector('[data-testid="origin-current-tag"]').textContent.includes('21.0285')`));
 await shot('address-resolved');
 await action('origin-clear-button');addressFixture='unavailable';await action('origin-gps-button');
 record('unavailable address allows manual label',await exists('origin-address-unavailable')&&await exists('origin-edit-label-btn'));
 record('unavailable copy does not invent missing map data',await ev(`!document.querySelector('[data-testid="origin-address-unavailable"]').textContent.includes('chưa có dữ liệu OpenStreetMap')`));
 await click(sel('origin-edit-label-btn'));await click(sel('origin-label-input'));await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2});await cdp('Input.insertText',{text:'Public fixture gate'});addressFixture=null;await action('origin-save-label-btn');
 record('manual label backed by real API retains origin',view.location.address_status==='manual'&&view.location.label==='Public fixture gate'&&view.profile.origin.lat===21.0285&&view.profile.origin.lon===105.8522);
 await shot('address-manual');
 await action('origin-clear-button');await ev(`window.__gpsMode='denied'`);await click(sel('origin-gps-button'));await until(()=>ev(`document.querySelector('[data-testid="origin-geo-notice"]')?.textContent.includes('từ chối')`));record('GPS denied keeps origin unset',view.profile.origin===null);
 await ev(`window.__gpsMode='timeout'`);await click(sel('origin-gps-button'));await until(()=>ev(`document.querySelector('[data-testid="origin-geo-notice"]')?.textContent.toLowerCase().includes('quá')`));record('GPS timeout keeps origin unset',view.profile.origin===null);
 record('no remote network / geocoder / model request',evidence.remoteOrigins.length===0);
 record('no uncaught browser exception',evidence.errors.length===0);
 evidence.addressEvidence='GPS hardware and address responses simulated via CDP; outgoing resolve_address stripped before real synthetic API; no upstream geocoder/model call';
}catch(error){evidence.blocker=String(error.message).slice(0,200);record('journey completed',false);}
finally{fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(evidence,null,2));ws?.close();if(chrome.pid)try{execFileSync('taskkill',['/pid',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}}
process.exitCode=evidence.checks.some(x=>!x.pass)?1:0;

