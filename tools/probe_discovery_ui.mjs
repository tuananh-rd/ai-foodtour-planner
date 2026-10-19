/** Independent real UI + real synthetic backend acceptance. No provider probes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn, execFileSync} from 'node:child_process';
const web=process.env.DISCOVERY_WEB||'http://127.0.0.1:3200';
const api=process.env.DISCOVERY_API||'http://127.0.0.1:8200';
const port=Number(process.env.DISCOVERY_CDP||19780);
const out=process.env.DISCOVERY_EVIDENCE||'docs/reports/discovery-assistant-integrated';
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
   if(m.method==='Runtime.exceptionThrown')evidence.errors.push('Uncaught browser exception');
 };
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
 const sel=id=>`[data-testid="${id}"]`;
 const exists=id=>ev(`!!document.querySelector(${JSON.stringify(sel(id))})`);
 async function click(selector){await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);if(!p)throw Error('Unavailable control '+selector);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});}
 async function idle(){await until(()=>ev(`!!document.querySelector('[data-testid="discovery-input"]')&&!document.querySelector('[data-testid="discovery-input"]').disabled&&!document.querySelector('[aria-busy="true"]')`));await pause(130);}
 async function send(text){await idle();const before=posts;await click(sel('discovery-input'));await cdp('Input.insertText',{text});await click(sel('discovery-send-btn'));await until(()=>posts>before);await idle();}
 async function action(id){const before=posts;await click(sel(id));await until(()=>posts>before);await idle();}
 async function shot(name){await ev('window.scrollTo(0,0)');const x=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(x.data,'base64'));evidence.screenshots.push(name+'.png');return x.data;}
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
 for(const width of (process.env.DISCOVERY_WIDTHS||'1440,390').split(',').map(Number)){
   view=null;await cdp('Emulation.setDeviceMetricsOverride',{width,height:width===1440?1024:844,deviceScaleFactor:1,mobile:width===390});
   await cdp('Page.navigate',{url:web});await until(()=>exists('discovery-input'));await idle();
   if(width===390){await click(sel('guided-reset-btn'));await idle();}
   await until(()=>view!==null);
   record('initial nullable profile '+width,view.profile.party_size===null&&view.profile.duration_min===null&&view.profile.vehicle===null);
   await send('Chào bạn');record('greeting no checklist '+width,view.reply.question===null&&view.confirmation===null&&view.tour===null);
   await send('Tìm phở quanh Xuân Thủy dưới 70k');
   record('discovery does not demand trip fields '+width,view.profile.party_size===null&&view.profile.duration_min===null&&!/số quán|bao nhiêu người|thời lượng/.test(view.reply.question||''));
   await send('Tìm quán quanh Hồ Gươm');record('local search real results '+width,view.results.length>=2&&view.source.dataset_source==='synthetic');
   await send('So sánh A với B');record('compare actual IDs '+width,view.comparison?.venues.length===2);
   await send('Thêm A rồi tìm chè ít ngọt');record('selection and taste survive next search '+width,view.selection.length===1&&view.profile.tastes.includes('ít ngọt'));
   await send('500k cho 2 người, 20 phút mỗi chặng');record('group budget not per person or duration '+width,view.profile.budget_scope==='group'&&view.profile.party_size===2&&view.profile.budget_vnd===500000&&view.profile.max_leg_min===20&&view.profile.duration_min===null);
   await send('Đổi ngân sách thành 600 nghìn cả nhóm');record('patch keeps other fields '+width,view.profile.party_size===2&&view.profile.max_leg_min===20&&view.profile.budget_vnd===600000);
   const discoveryShot=await shot('discovery-'+width);
   if(width===1440){
     const ref=fs.readFileSync('docs/design/figma-warm-editorial-reference.png').toString('base64');
     const images=await ev(`(async()=>{const load=async s=>{const i=new Image();i.src='data:image/png;base64,'+s;await i.decode();return i};const a=await load(${JSON.stringify(discoveryShot)}),r=await load(${JSON.stringify(ref)});const side=document.createElement('canvas');side.width=2880;side.height=1024;let c=side.getContext('2d');c.drawImage(r,0,0,1440,1024);c.drawImage(a,1440,0);const over=document.createElement('canvas');over.width=1440;over.height=1024;c=over.getContext('2d');c.drawImage(r,0,0,1440,1024);c.globalAlpha=.5;c.drawImage(a,0,0);return{side:side.toDataURL(),overlay:over.toDataURL()}})()`);
     for(const [name,data]of Object.entries(images)){fs.writeFileSync(path.join(out,'reference-'+name+'.png'),Buffer.from(data.split(',')[1],'base64'));evidence.screenshots.push('reference-'+name+'.png');}
   }
   await send('Tạo lịch trình');record('planning asks one contextual question '+width,!!view.reply.question&&view.confirmation===null&&view.tour===null);
   await send('Xuất phát từ Hồ Gươm lúc 18h, dành tổng 120 phút, đi bộ');
   record('explicit server confirmation required '+width,!!view.confirmation&&view.tour===null&&view.confirmation.warnings.length>0);
   await send('ok');record('generic ok is not confirmation '+width,!!view.confirmation&&view.tour===null);
   await action('btn-confirm-itinerary');record('confirmed real planner tour '+width,!!view.tour?.stops?.length&&view.confirmation===null);
   if(width===390)await click(sel('mobile-tab-tour'));
   await until(()=>exists('guided-timeline'));await shot('confirmed-'+width);
   record('free Maps URL exists '+width,await ev(`Array.from(document.querySelectorAll('a[href]')).some(a=>/^https:\/\/(?:www\.)?google\.com\/maps\//.test(a.href)&&!a.href.includes('key='))`));
   await click(sel('pilot-map-toggle'));await pause(1800);record('PMTiles map accessible '+width,await exists('pilot-map-canvas')||await exists('map-canvas'));await shot('map-'+width);
   await cdp('Page.reload');await until(()=>exists('discovery-input'));await idle();record('reload preserves selection and tour '+width,view.selection.length===1&&!!view.tour?.stops?.length);
   if(width===390)await click(sel('mobile-tab-chat'));
   await send('Dị ứng đậu phộng');record('allergy edit invalidates tour '+width,view.profile.allergies.length>0&&view.tour===null&&view.confirmation===null);
   await send('Tạo lịch trình');record('unknown allergy never safe '+width,view.status==='unknown'&&view.confirmation===null&&view.tour===null);
   record('no horizontal overflow '+width,await ev('document.documentElement.scrollWidth<=innerWidth'));
   await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab'});
   record('keyboard focus exists '+width,await ev('document.activeElement!==document.body'));
   await cdp('Network.enable');await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
   await send('Tìm chè').catch(()=>{});record('offline exposes readable error '+width,await exists('guided-error-banner'));
   await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 }
 record('no external provider/map origin',evidence.remoteOrigins.length===0);
 record('actual PMTiles Range206',evidence.ranges.includes(206));
 record('no uncaught JS exception',evidence.errors.length===0);
}catch(error){evidence.blocker=String(error.message).slice(0,200);record('journey completed',false);}
finally{fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(evidence,null,2));ws?.close();if(chrome.pid)try{execFileSync('taskkill',['/pid',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}}
process.exitCode=evidence.checks.some(x=>!x.pass)?1:0;
