/** Independent real UI + real synthetic backend acceptance. No provider probes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn, execFileSync} from 'node:child_process';
const web=process.env.DISCOVERY_WEB||'http://127.0.0.1:3320';
const api=process.env.DISCOVERY_API||'http://127.0.0.1:8230';
const port=Number(process.env.DISCOVERY_CDP||19790);
const out=process.env.DISCOVERY_EVIDENCE||'docs/reports/discovery-upgrade-integrated';
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
 await send('Chào bạn');record('general greeting without origin question',view.reply.question===null&&view.profile.origin===null);
 await send('tôi muốn ăn phở với tráng miệng ở hai bà trưng');
 record('exact screenshot no deny; remembers compound food; asks origin once',view.profile.area==='Hai Bà Trưng'&&view.profile.foods.includes('phở')&&view.profile.foods.includes('tráng miệng')&&view.profile.origin===null&&!!view.reply.question&&!/chưa được người dùng cho phép/.test(view.reply.text));
 await click(sel('origin-gps-button'));await until(()=>ev(`document.querySelector('[data-testid="origin-geo-notice"]')?.textContent.includes('từ chối')`));
 record('GPS click-only denied handled without default',await ev('window.__gpsCalls===1')&&view.profile.origin===null);
 async function fill(id,text){await click(sel(id));await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2});await cdp('Input.insertText',{text});}
 await fill('origin-query-input','Hồ');await action('origin-resolve-button');
 record('manual ambiguous candidates not autochosen',view.location.candidates.length>1&&view.profile.origin===null);
 const candidate=view.location.candidates.find(x=>x.label==='Hồ Gươm');if(!candidate)throw Error('Public landmark candidate absent');
 await action('origin-candidate-'+candidate.id);
 record('explicit origin resumes real district results',view.location.status==='chosen'&&view.results.length>0&&view.results.every(x=>x.district==='Hai Bà Trưng'&&x.distance_m!==null));
 await send('Tìm phở và chè quanh Hồ Gươm');record('new area and actual local results',view.profile.area==='Hồ Gươm'&&view.results.length>=2);
 await send('So sánh A với B và thêm A vào chuyến đi');record('compares two and adds exactly A',view.comparison?.venues.length===2&&view.selection.length===1);
 record('selected distance visibly labeled Haversine',await ev(`document.querySelector('[data-testid^="selected-distance-"]')?.textContent.includes('đường chim bay')`));
 await shot('discovery-1440');
 await send('600 nghìn cả nhóm cho 2 người, 20 phút mỗi chặng');
 await send('Bắt đầu lúc 18h, tổng 120 phút, đi bộ');await send('Tạo lịch trình');
 record('real confirmation before tour',!!view.confirmation&&view.tour===null);
 await send('ok');record('ok does not consume confirmation',!!view.confirmation&&view.tour===null);
 await action('btn-confirm-itinerary');record('actual planner completed tour',!!view.tour?.stops?.length&&view.confirmation===null);
 await until(()=>exists('google-maps-cta'));
 const maps=await ev(`(()=>{const a=document.querySelector('[data-testid="google-maps-cta"]');return{href:a.href,text:a.textContent}})()`);
 const mapsUrl=new URL(maps.href);
 record('explicit Maps CTA, free URL actual origin/order',maps.text.includes('Xem lịch trình trên Google Maps')&&mapsUrl.origin==='https://www.google.com'&&mapsUrl.pathname==='/maps/dir/'&&mapsUrl.searchParams.get('api')==='1'&&mapsUrl.searchParams.get('origin')===view.profile.origin.lat.toFixed(6)+','+view.profile.origin.lon.toFixed(6)&&mapsUrl.searchParams.get('travelmode')==='walking'&&!mapsUrl.searchParams.has('key'));
 await shot('confirmed-1440');
 await click(sel('pilot-map-toggle'));await until(()=>exists('pilot-map-canvas'));await pause(1500);await shot('map-1440');
 await click(sel('pilot-markers-toggle'));record('local map marker toggle retained',await ev(`document.querySelector('[data-testid="pilot-markers-toggle"]').getAttribute('aria-pressed')==='false'`));await click(sel('pilot-markers-toggle'));
 for(const [width,height]of [[1280,800],[1440,1024],[1920,1080],[2560,1440],[390,844]]){
   await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});
   if(width===390)await tab('tour');await pause(130);
   const fit=await ev(`(()=>{const e=document.querySelector('[data-testid="discovery-layout"]');return{overflow:document.documentElement.scrollWidth>innerWidth,right:e?.getBoundingClientRect().right||0,viewport:innerWidth}})()`);
   record('fluid fit '+width,!fit.overflow&&(width===390||fit.right>=width-24));
   record('no emoji DOM '+width,await ev(`!/[\\p{Extended_Pictographic}\\u{1F1E6}-\\u{1F1FF}\\uFE0F\\u20E3]/u.test(document.body.innerText)`));
   await shot('viewport-'+width);
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1024,deviceScaleFactor:1,mobile:false});
 await cdp('Page.reload');await until(()=>exists('discovery-input'));await idle();record('reload retains tour and selection',!!view.tour?.stops?.length&&view.selection.length===1);
 await action('origin-clear-button');record('clear origin invalidates confirmation/tour without losing selection',view.profile.origin===null&&view.tour===null&&view.confirmation===null&&view.selection.length===1);
 record('selected unknown distance shown without raw enum',await ev(`(()=>{const text=document.querySelector('[data-testid^="selected-distance-"]')?.textContent||'';return text.includes('Chưa có khoảng cách')&&!text.includes('origin_missing')})()`));
 await click('.nn-origin-manual-toggle');await fill('origin-lat-input','21.032');await fill('origin-lon-input','105.856');await action('origin-coords-submit');
 record('manual coordinates update backend actual origin',view.profile.origin.lat===21.032&&view.profile.origin.lon===105.856&&view.selection.length===1);
 const beforeConcurrent=posts;
 const concurrentStatus=await ev(`(async()=>{const id=sessionStorage.getItem('foodtour_chat_session_id'),token=sessionStorage.getItem('foodtour_chat_session_token');const r=await fetch(${JSON.stringify(api)}+'/v1/sessions/'+encodeURIComponent(id)+'/assistant',{method:'POST',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({revision:${view.revision},text:'Chào bạn'})});await r.json();return r.status})()`);
 await until(()=>posts>beforeConcurrent);await send('Đổi ngân sách thành 700 nghìn cả nhóm');
 record('real409 recovery does not replay mutation',concurrentStatus===200&&evidence.statuses.includes(409)&&view.profile.budget_vnd===600000&&await ev(`document.querySelector('[data-testid="discovery-input"]').value.includes('700')`));
 await send('Dị ứng đậu phộng');await send('Tạo lịch trình');record('allergy safety gate remains',view.profile.allergies.length>0&&view.confirmation===null&&view.tour===null);
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab'});record('keyboard focus exists',await ev('document.activeElement!==document.body'));
 await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await send('Tìm chè').catch(()=>{});record('offline readable error',await exists('guided-error-banner'));
 await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 record('no external network origins',evidence.remoteOrigins.length===0);record('actual PMTiles206',evidence.ranges.includes(206));record('no uncaught JS exception',evidence.errors.length===0);
}catch(error){evidence.blocker=String(error.message).slice(0,200);record('journey completed',false);}
finally{fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(evidence,null,2));ws?.close();if(chrome.pid)try{execFileSync('taskkill',['/pid',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}}
process.exitCode=evidence.checks.some(x=>!x.pass)?1:0;
