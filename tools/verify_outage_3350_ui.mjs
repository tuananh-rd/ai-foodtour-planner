/** Independent real UI + real synthetic backend acceptance. No provider probes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn, execFileSync} from 'node:child_process';
const web=process.env.DISCOVERY_WEB||'http://127.0.0.1:3350';
const api=process.env.DISCOVERY_API||'http://127.0.0.1:8250';
const port=Number(process.env.DISCOVERY_CDP||19790);
const out=process.env.DISCOVERY_EVIDENCE||'docs/reports/outage-3350-rendered';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=18000){const start=Date.now();while(Date.now()-start<ms){try{if(await fn())return;}catch{}await pause(90);}throw Error('Observable browser state timed out');}
const health=await(await fetch(api+'/health')).json();
if(web!=='http://127.0.0.1:3350'||api!=='http://127.0.0.1:8250'||health.dataset_source!=='private')throw Error('Requires actual3350 private app; all chat POSTs must be intercepted');
const free=await new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});
if(!free)throw Error('CDP port occupied; no process stopped');
fs.mkdirSync(out,{recursive:true});
const evidence={web,api,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),backend_commit:health.build_commit,
  dataset:'private app URL; fixture replies only',provider:'MOCK RESPONSES',liveGemini:'NO GENERATION; all assistant POSTs fulfilled by CDP',checks:[],screenshots:[],errors:[],remoteOrigins:[],ranges:[],statuses:[]};
const record=(name,pass)=>{evidence.checks.push({name,pass:!!pass,...(!pass?{diagnostic:{status:view?.status,reply:view?.reply,tour_status:view?.tour?.status}}:{})});console.log(JSON.stringify({name,pass:!!pass}));};
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking',
  '--enable-unsafe-swiftshader',`--remote-debugging-port=${port}`,`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'discovery-qa-'))}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let ws,seq=0,view=null,posts=0,fixture=null,mockTurns=0,mockActions=0;const pending=new Map(),requestMethods=new Map();
try{
 let target;await until(async()=>{target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x=>x.type==='page');return target;});
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP deadline '+method));},8000);pending.set(id,{resolve:x=>{clearTimeout(timer);resolve(x)},reject:x=>{clearTimeout(timer);reject(x)}});ws.send(JSON.stringify({id,method,params}));});
 ws.onmessage=e=>{const m=JSON.parse(e.data);
   if(m.method==='Fetch.requestPaused'){
     const p=m.params;
     (async()=>{
       if(p.responseStatusCode){
         const raw=await cdp('Fetch.getResponseBody',{requestId:p.requestId});
         const b=JSON.parse(raw.base64Encoded?Buffer.from(raw.body,'base64').toString('utf8'):raw.body);
         if(!fixture||fixture.session_id!==b.session_id){
           fixture={...b,results:[],selection:[],comparison:null,tour:null,confirmation:null,
             profile:{...b.profile,area:'Đống Đa',foods:['phở'],origin:null},
             messages:[{role:'user',text:'Chào bạn'},{role:'assistant',text:'Model chưa phản hồi hoặc đã đạt giới hạn; đang dùng xử lý tại máy. Chào bạn.'},{role:'user',text:'Tôi muốn ăn phở ở Đống Đa'},{role:'assistant',text:'Model chưa phản hồi hoặc đã đạt giới hạn; đang dùng xử lý tại máy. Mình giữ món phở ở Đống Đa. Bạn muốn dùng vị trí hiện tại hay nhập vị trí?'}],
             reply:{text:'Model chưa phản hồi hoặc đã đạt giới hạn; đang dùng xử lý tại máy. Mình giữ món phở ở Đống Đa.',question:'Bạn muốn dùng vị trí hiện tại hay nhập vị trí?'},
             provider:{mode:'gemini',calls:0},location:{status:'unset',label:null,source:null,approximate:false,candidates:[]}};
         }
         await cdp('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:200,responseHeaders:p.responseHeaders.filter(x=>!['content-length','content-encoding'].includes(x.name.toLowerCase())),body:Buffer.from(JSON.stringify(fixture)).toString('base64')});return;
       }
       if(p.request.method==='POST'){
         if(!fixture)throw Error('No fixture baseline; refusing assistant POST');
         const body=JSON.parse(p.request.postData||'{}');fixture.revision++;
         if(body.action){
           mockActions++;
           const args=body.action.arguments||{};
           fixture.profile.origin={lat:args.lat,lon:args.lon};
           fixture.location={status:'chosen',label:'Điểm thử nghiệm',source:'coordinates',approximate:true,candidates:[]};
           fixture.provider={mode:'rules',calls:0,reply_source:'tools'};
           fixture.reply={text:'Đã chọn vị trí thử nghiệm.',question:null};
         }else{
           mockTurns++;
           const recovered=mockTurns===3;
           fixture.provider=recovered?{mode:'gemini',calls:1,reply_source:'model',model:'gemini-3.5-flash-lite'}:{mode:'rules',calls:1,reply_source:'rules',reason:'timeout_rules_fallback',failure:{kind:'timeout',source:'transport'}};
           fixture.reply={text:recovered?'Phản hồi mô phỏng đã hoàn tất.':'Mình giữ món phở và khu vực Đống Đa.',question:null};
           fixture.messages.push({role:'user',text:body.text},{role:'assistant',text:fixture.reply.text});
         }
         await cdp('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:web},{name:'Access-Control-Allow-Credentials',value:'true'}],body:Buffer.from(JSON.stringify(fixture)).toString('base64')});return;
       }
       await cdp('Fetch.continueRequest',{requestId:p.requestId});
     })().catch(error=>{evidence.errors.push(error.message);cdp('Fetch.failRequest',{requestId:p.requestId,errorReason:'Aborted'}).catch(()=>{});});return;
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
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Fetch.enable',{patterns:[{urlPattern:'*/assistant',requestStage:'Request'},{urlPattern:'*/assistant',requestStage:'Response'}]});
 await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`window.__gpsCalls=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(ok,fail)=>{window.__gpsCalls++;setTimeout(()=>fail({code:1,message:'Synthetic denied'}),30)}}});`});
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1024,deviceScaleFactor:1,mobile:false});
 await cdp('Page.navigate',{url:web});await until(()=>exists('discovery-input'));await idle();await until(()=>view!==null);

 record('actual3350 page',await ev('location.origin')===web);
 const countBanner=()=>ev(`document.querySelectorAll('[data-testid="service-interruption-banner"]').length`);
 const cleanMain=()=>ev(`(()=>{const c=document.querySelector('[data-testid="discovery-chat-section"]').cloneNode(true);c.querySelector('[data-testid="discovery-diagnostics"]')?.remove();return c.innerText||c.textContent})()`);
 record('legacy outage status is one neutral notice',await countBanner()===1);
 record('legacy generic prefix removed display-only',!((await cleanMain()).includes('Model chưa phản hồi hoặc đã đạt giới hạn')));
 record('origin question rendered once',await ev(`document.querySelector('[data-testid="discovery-messages-list"]').innerText.split('Bạn muốn dùng vị trí hiện tại hay nhập vị trí?').length-1`)===1);
 await shot('legacy-history-3350');
 await send('Tiếp tục tư vấn');await send('Giữ khu vực này');
 record('repeated timeouts keep one status region',await countBanner()===1&&mockTurns===2);
 record('raw reason absent outside diagnostics',!((await cleanMain()).includes('timeout_rules_fallback')));
 record('source remains local rather than fake model',await ev(`Array.from(document.querySelectorAll('.nn-editorial-badge')).at(-1).textContent.includes('QUY TẮC')`));
 await click('[data-testid="discovery-diagnostics"] summary');
 record('diagnostics retains raw reason and failure origin',await ev(`document.querySelector('[data-testid="discovery-diagnostics"]').innerText.includes('timeout_rules_fallback')&&document.querySelector('[data-testid="discovery-diagnostics"]').innerText.includes('transport')`));
 await click('[data-testid="discovery-diagnostics"] summary');
 for(const [width,height]of [[1440,1024],[390,844]]){
   await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});await pause(100);await ev('window.scrollTo(0,0)');
   record('outage composer stays visible '+width,await ev(`document.querySelector('[data-testid="discovery-input"]').getBoundingClientRect().bottom<=innerHeight`));
   record('outage no horizontal overflow '+width,await ev('document.documentElement.scrollWidth<=innerWidth'));
   await shot('outage-'+width);
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1024,deviceScaleFactor:1,mobile:false});
 await click(sel('origin-expand-controls-btn'));await click('.nn-origin-manual-toggle');
 async function fillValue(id,text){await click(sel(id));await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2});await cdp('Input.insertText',{text});}
 await fillValue('origin-lat-input','21.03');await fillValue('origin-lon-input','105.85');await action('origin-coords-submit');
 record('local origin action does not claim AI recovery',mockActions===1&&await countBanner()===1);
 await send('Mô phỏng phản hồi thành công');
 record('only successful model response clears status',mockTurns===3&&await countBanner()===0);
 const after=await(await fetch(api+'/health')).json();evidence.budget={before_used:health.llm_budget.used,after_used:after.llm_budget.used};
 record('no actual generation and no remote origins',health.llm_budget.used===after.llm_budget.used&&evidence.remoteOrigins.length===0);
 record('no browser exception',evidence.errors.length===0);
 evidence.fixtureExplanation='All assistant POSTs fulfilled by CDP; handler errors abort requests rather than forward. All displayed venue arrays empty; no user session/token exported.';
}catch(error){evidence.blocker=String(error.message).slice(0,200);record('journey completed',false);}
finally{fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(evidence,null,2));ws?.close();if(chrome.pid)try{execFileSync('taskkill',['/pid',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}}
process.exitCode=evidence.checks.some(x=>!x.pass)?1:0;

