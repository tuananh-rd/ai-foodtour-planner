/** Real UI/real synthetic backend probe. No external LLM/search calls or private captures. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn, execFileSync} from 'node:child_process';
const web=process.env.OA_WEB||'http://127.0.0.1:3060';
const api=process.env.OA_API||'http://127.0.0.1:8060';
const port=Number(process.env.OA_CDP||19760);
const out=process.env.OA_EVIDENCE||'docs/reports/online-assistant/integrated';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=30000){const start=Date.now();while(Date.now()-start<ms){try{if(await fn())return;}catch{}await pause(80);}throw Error('Observable UI state timed out');}
const health=await(await fetch(api+'/health')).json();
if(health.dataset_source!=='synthetic'||health.assistant_provider!=='rules'||health.web_search_configured)throw Error('Explicit synthetic/rules/search-disabled browser QA required');
const free=await new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});
if(!free)throw Error('Browser port occupied; no process stopped');
fs.mkdirSync(out,{recursive:true});
const evidence={web,api,ui_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),build_commit:health.build_commit,dataset:'synthetic',provider:'rules',checks:[],screenshots:[],consoleErrors:[],network:{remoteOrigins:[],pmtilesRanges:[]},limitations:['Canvas creation alone does not prove geographic tiles rendered; inspect screenshots and tile requests.','Tavily success/429 require separate explicitly mocked-provider checks; no live Tavily key.','This probe supplements the independent full regression suite.']};
const record=(name,pass,details)=>{const entry={name,pass:!!pass,...(details===undefined?{}:{details})};evidence.checks.push(entry);console.log(JSON.stringify(entry));};
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'foodtour-online-ui-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking','--enable-unsafe-swiftshader',`--remote-debugging-port=${port}`,`--user-data-dir=${scratch}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let ws,seq=0;const pending=new Map(),origins=new Set();let chatResponses=0;const chatRequests=[];
try{
  let target;await until(async()=>{target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');return target;});
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);return;}
    if(m.method==='Fetch.requestPaused'){cdp('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'InternetDisconnected'}).catch(()=>{});return;}
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')evidence.consoleErrors.push((m.params.args||[]).map(a=>typeof a.value==='string'?a.value:a.description||'').join(' ').replace(/[a-f0-9]{32,64}/gi,'[redacted]').slice(0,700));
    if(m.method==='Runtime.exceptionThrown')evidence.consoleErrors.push(String(m.params.exceptionDetails?.exception?.description||m.params.exceptionDetails?.text||'Browser exception').slice(0,700));
    if(m.method==='Network.requestWillBeSent'){if(/\/chat$/.test(m.params.request.url)&&m.params.request.postData){try{chatRequests.push(JSON.parse(m.params.request.postData));}catch{}}const u=new URL(m.params.request.url);if(/^https?:$/.test(u.protocol)&&![new URL(web).origin,new URL(api).origin].includes(u.origin))origins.add(u.origin);}
    if(m.method==='Network.responseReceived'){
      if(/\/chat$/.test(m.params.response.url)){chatResponses++;(evidence.network.chatStatuses??=[]).push(m.params.response.status);}
      if(m.params.response.url.endsWith('.pmtiles'))evidence.network.pmtilesRanges.push({status:m.params.response.status,range:Object.entries(m.params.response.headers).find(([k])=>k.toLowerCase()==='content-range')?.[1]||null});
    }
  };
  const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('UI evaluation failed');return r.result.value;};
  const aliases={'online-search-toggle':'web-search-optin-checkbox','online-search-results':'web-search-card',
    'pilot-map-toggle':'view-mode-map-btn','pilot-map-canvas':'map-canvas','pilot-markers-toggle':'map-marker-toggle-btn'};
  const sel=id=>`[data-testid="${id}"]${aliases[id]?`,[data-testid="${aliases[id]}"]`:''}`;
  const exists=id=>ev(`!!document.querySelector(${JSON.stringify(sel(id))})`);
  async function click(selector){await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);const point=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);if(!point)throw Error('Missing, hidden or disabled control '+selector);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});}
  async function idle(){await pause(120);await until(()=>ev(`!document.querySelector('[aria-busy="true"]')`));await pause(250);}
  async function send(text){const before=chatResponses;const input=await exists('clarify-free-text-input')?'clarify-free-text-input':'guided-input';await ev(`document.querySelector(${JSON.stringify(sel(input))}).focus()`);await cdp('Input.insertText',{text});await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await until(()=>chatResponses>before);await idle();}
  async function capture(name,keepScroll=false){if(!keepScroll)await ev('window.scrollTo(0,0)');const shot=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));evidence.screenshots.push(name+'.png');return shot.data;}
  async function compareReference(actual,name){
    const reference=fs.readFileSync(process.env.OA_REFERENCE||'docs/design/ngonngon-tour-reference.png').toString('base64');
    const pictures=await ev(`(async()=>{const load=async s=>{const i=new Image();i.src='data:image/png;base64,'+s;await i.decode();return i;};const ref=await load(${JSON.stringify(reference)}),actual=await load(${JSON.stringify(actual)});const side=document.createElement('canvas');side.width=2880;side.height=1024;const sc=side.getContext('2d');sc.drawImage(ref,0,0,1440,1024);sc.drawImage(actual,1440,0,1440,1024);const overlay=document.createElement('canvas');overlay.width=1440;overlay.height=1024;const oc=overlay.getContext('2d');oc.drawImage(ref,0,0,1440,1024);oc.globalAlpha=.5;oc.drawImage(actual,0,0,1440,1024);return {side:side.toDataURL().split(',')[1],overlay:overlay.toDataURL().split(',')[1]};})()`);
    for(const [kind,data] of Object.entries(pictures)){const filename=name+'-'+kind+'.png';fs.writeFileSync(path.join(out,filename),Buffer.from(data,'base64'));evidence.screenshots.push(filename);}
    evidence.visualMeasurements=await ev(`(()=>{const result={};for(const selector of ['.nn-sidebar','.nn-topbar','.nn-main-grid','.nn-chat-card','.nn-tour-col','.nn-hero-heading','.nn-hero-card','.nn-metrics-card','.nn-header','.nn-main','.nn-chat','.nn-tour','.nn-title','.nn-route']){const e=document.querySelector(selector);if(e){const r=e.getBoundingClientRect(),s=getComputedStyle(e);result[selector]={x:r.x,y:r.y,width:r.width,height:r.height,font:s.fontFamily,fontSize:s.fontSize,color:s.color,background:s.backgroundColor};}}return result;})()`);
  }
  async function mobileChat(){if(await exists('mobile-tab-chat'))await click(sel('mobile-tab-chat'));}
  for(const domain of ['Page','Runtime','Network'])await cdp(domain+'.enable');
  await cdp('Network.setCacheDisabled',{cacheDisabled:true});
  const range=await fetch(web+'/maps/hoankiem-20261018.pmtiles',{headers:{Range:'bytes=0-126'}});
  record('real PMTiles HTTP Range206/header',range.status===206&&(await range.arrayBuffer()).byteLength===127&&range.headers.get('content-range')==='bytes 0-126/2138597');
  const initial='tour3 quán quanh Hồ Gươm tối nay120 phút,500nghìn cho2người,thích phở và bún chả,dị ứng đậu phộng';
  for(const [width,height] of (process.env.OA_MAP_ONLY?[[1440,1024]]:[[1440,1024],[390,844]])){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});
    await cdp('Page.navigate',{url:web});await until(()=>exists('guided-input'));
    await ev('sessionStorage.clear()');await cdp('Page.reload');await until(()=>exists('guided-input'));await idle();
    await capture('empty-'+width);
    record('desktop/mobile no horizontal overflow '+width,await ev('document.documentElement.scrollWidth<=innerWidth'));
    if(process.env.OA_MAP_ONLY){await click(sel('pilot-map-toggle'));await pause(5000);await capture('map-runtime-diagnostic');break;}
    await send(initial);await until(()=>exists('clarify-question-card'));
    record('attached Vietnamese request preserves allergy and slots '+width,await ev(`(()=>{const t=document.querySelector('[data-testid="understood-card"]')?.innerText||'';return ['Hồ Gươm','120','500','đậu phộng','phở','bún chả'].every(x=>t.includes(x));})()`));
    record('no tour before confirmation '+width,!(await exists('guided-timeline')));
    await capture('clarify-'+width);
    await click(sel('online-search-toggle'));await send('phở quanh Hồ Gươm');await until(()=>exists('online-search-results'));
    record('read-only search keeps active clarification '+width,await exists('clarify-option-scope:group'));
    record('read-only search keeps allergy '+width,await ev(`document.querySelector('[data-testid="understood-card"]')?.innerText.includes('đậu phộng')`));
    await capture('clarify-search-disabled-'+width);
    await click(sel('clarify-option-scope:group'));await idle();await send('19h');
    await until(()=>exists('confirm-yes-btn'));record('allergy warning before confirm '+width,await exists('confirm-summary-warnings'));
    await capture('confirm-'+width);await click(sel('confirm-yes-btn'));await idle();await until(()=>exists('guided-timeline'));
    record('actual three-stop tour '+width,await ev(`document.querySelectorAll('[data-testid^="timeline-stop-card-"]').length===3`));
    record('free Maps URL actual navigation '+width,await ev(`(()=>{const a=document.querySelector('[data-testid="google-maps-cta"]');if(!a)return false;const u=new URL(a.href);return ['google.com','www.google.com'].includes(u.hostname)&&u.pathname==='/maps/dir/'&&u.searchParams.get('api')==='1'&&!u.searchParams.has('key');})()`));
    const schematic=await capture('tour-schematic-'+width);if(width===1440)await compareReference(schematic,process.env.OA_REFERENCE?'figma-comparison-1440':'svg-comparison-1440');
    await click(sel('pilot-map-toggle'));await until(()=>exists('pilot-map-canvas'));await pause(3500);
    record('MapLibre canvas created (tile rendering requires visual review) '+width,await ev(`!!document.querySelector('[data-testid="pilot-map-canvas"] canvas,[data-testid="map-canvas"] canvas')`));
    record('attribution visible '+width,await ev(`(()=>{const t=document.querySelector('[data-testid="pilot-map-container"]')?.innerText||document.querySelector('.nn-route')?.innerText||'';return /OpenStreetMap/.test(t)&&/Protomaps/.test(t);})()`));
    const markerCount=()=>ev(`document.querySelectorAll('.maplibregl-marker').length`);
    record('markers match tour '+width,(await markerCount())===3);
    await click(sel('pilot-markers-toggle'));await pause(200);record('marker toggle off '+width,(await markerCount())===0);
    await click(sel('pilot-markers-toggle'));await pause(200);record('marker toggle on '+width,(await markerCount())===3);
    record('map no mobile overflow '+width,await ev('document.documentElement.scrollWidth<=innerWidth'));
    const buttonMarker=await ev(`document.querySelector('.maplibregl-marker')?.tagName==='BUTTON'`);
    record('native keyboard marker '+width,buttonMarker);
    if(buttonMarker){await ev(`document.querySelector('.maplibregl-marker').focus()`);await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await pause(200);record('keyboard marker opens popup '+width,await ev(`!!document.querySelector('.maplibregl-popup')`));}
    await capture('tour-map-'+width);
    if(width===390){await ev(`document.querySelector('[data-testid="pilot-map-container"]')?.scrollIntoView({block:'center'})`);await capture('tour-map-region-'+width,true);}
    const names=()=>ev(`Array.from(document.querySelectorAll('.nn-timeline-card-title')).map(e=>e.textContent.trim())`);
    const originalNames=await names();
    await click(sel('stop-replace-btn-0'));await until(()=>exists('replace-modal-cancel-btn'));
    await click(sel('replace-modal-cancel-btn'));record('cancel replacement preserves tour '+width,JSON.stringify(await names())===JSON.stringify(originalNames));
    await click(sel('stop-replace-btn-0'));await click(sel('replace-modal-confirm-btn'));await idle();
    const replaced=await exists('replace-modal-done-btn');
    if(replaced){await click(sel('replace-modal-done-btn'));await pause(300);const changed=await names();record('replace changes only requested stop '+width,changed.length===3&&changed[0]!==originalNames[0]&&changed.slice(1).every((n,i)=>n===originalNames[i+1]));}
    else record('replace returns explicit failure preserving tour '+width,JSON.stringify(await names())===JSON.stringify(originalNames)&&await ev(`!!document.querySelector('[role="alert"]')`));
    const currentNames=await names();record('map markers synchronize replacement '+width,await ev(`(()=>{const labels=Array.from(document.querySelectorAll('.maplibregl-marker')).map(e=>e.getAttribute('aria-label'));return ${JSON.stringify(currentNames)}.every(name=>labels.some(label=>label?.endsWith(name)));})()`));
    await cdp('Page.reload');await until(()=>exists('guided-timeline'));record('tour reload retained '+width,await ev(`document.querySelectorAll('[data-testid^="timeline-stop-card-"]').length===3`));
    await mobileChat();await until(()=>exists('guided-input'));await click(sel('online-search-toggle'));
    await send('giờ mở cửa phở quanh Hồ Gươm');await until(()=>exists('online-search-results'));
    record('missing Tavily key honest disabled '+width,await exists('web-search-status-disabled'));
    record('web result remains in visible chat panel '+width,await ev(`document.querySelector('[data-testid="online-search-results"],[data-testid="web-search-card"]')?.getClientRects().length>0`));
    record('lookup keeps tour '+width,await exists('guided-timeline'));
    await capture('web-disabled-'+width);
    const retrySelector='[data-testid="web-search-retry-btn"]';
    const retryVisible=await ev(`!!document.querySelector(${JSON.stringify(retrySelector)})`);
    record('disabled result offers retry '+width,retryVisible);
    if(retryVisible){const before=chatResponses;await click(retrySelector);await until(()=>chatResponses>before);await idle();const request=chatRequests.at(-1);record('retry keeps originating query and web flag '+width,request?.text==='giờ mở cửa phở quanh Hồ Gươm'&&request?.web_search===true);}

    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab'});
    record('keyboard focus exists '+width,await ev('document.activeElement!==document.body'));
    await cdp('Fetch.enable',{patterns:[{urlPattern:'*.pmtiles*',requestStage:'Request'}]});
    await cdp('Page.reload');await until(()=>exists('guided-timeline'));
    if(width===390){await click(sel('mobile-tab-tour'));await pause(150);}
    await click(sel('pilot-map-toggle'));await until(()=>exists('pilot-map-fallback'),14000);
    record('map offline has bounded fallback '+width,await exists('pilot-map-fallback'));
    record('map offline preserves tour '+width,await exists('guided-timeline'));
    await capture('map-offline-'+width);await cdp('Fetch.disable');
  }
  evidence.network.remoteOrigins=[...origins];
  record('no external map/provider requests in deterministic UI lane',origins.size===0);
  record('map made real partial-content requests',evidence.network.pmtilesRanges.some(x=>x.status===206));
  record('real chat requests completed HTTP200',evidence.network.chatStatuses?.length>0&&evidence.network.chatStatuses.every(status=>status===200));
}catch(error){record('probe completed without harness/product blocker',false,String(error.message).slice(0,180));}
finally{
  fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(evidence,null,2));
  ws?.close();if(chrome.pid)try{execFileSync('taskkill',['/pid',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}
}
process.exitCode=evidence.checks.some(check=>!check.pass)?1:0;
