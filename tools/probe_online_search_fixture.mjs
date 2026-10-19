/** Actual production UI + actual synthetic API; ONLY external search is a labelled fixture. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
const web='http://127.0.0.1:3060', builtApi='http://127.0.0.1:8060', api='http://127.0.0.1:8080';
const port=19770,out='docs/reports/online-assistant/mock-web';
const metadata=await(await fetch(api+'/qa/search-fixture')).json();
const health=await(await fetch(api+'/health')).json();
if(metadata.mode!=='mocked-external-provider'||health.dataset_source!=='synthetic'||health.assistant_provider!=='rules')throw Error('Explicit synthetic external-fixture guard');
const free=await new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});
if(!free)throw Error('Dedicated browser port occupied; nothing stopped');
fs.mkdirSync(out,{recursive:true});
const evidence={web,api,build_commit:health.build_commit,mode:'real UI and synthetic backend; mocked external search only',transport:'CDP retargets fixed built API8060 to fixed local fixture8080; no product URL override',checks:[],screenshots:[],externalOrigins:[]};
const record=(name,pass)=>{evidence.checks.push({name,pass:!!pass});console.log(JSON.stringify(evidence.checks.at(-1)));};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const start=Date.now();while(Date.now()-start<20000){try{if(await fn())return;}catch{}await pause(80);}throw Error('Observable fixture UI timed out');}
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'online-search-browser-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking',`--remote-debugging-port=${port}`,`--user-data-dir=${scratch}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let ws,sequence=0,responses=0;const pending=new Map(),origins=new Set();
try{
  let target;await until(async()=>{target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');return !!target;});
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  ws.onmessage=async event=>{
    const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);return;}
    if(m.method==='Fetch.requestPaused'){
      const url=new URL(m.params.request.url);url.host=new URL(api).host;
      await cdp('Fetch.continueRequest',{requestId:m.params.requestId,url:url.href});
    }
    if(m.method==='Network.responseReceived'&&/\/chat$/.test(m.params.response.url))responses++;
    if(m.method==='Network.requestWillBeSent'){
      const url=new URL(m.params.request.url);if(/^https?:$/.test(url.protocol)&&![web,builtApi,api].includes(url.origin))origins.add(url.origin);
    }
  };
  const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Fixture UI evaluation failed');return r.result.value;};
  const sel=id=>`[data-testid="${id}"]`;
  const visible=id=>ev(`document.querySelector(${JSON.stringify(sel(id))})?.getClientRects().length>0`);
  async function click(id){const selector=sel(id);await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);const point=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);if(!point)throw Error('Fixture control missing/hidden: '+id);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});}
  async function idle(){await until(()=>ev(`!document.querySelector('[aria-busy="true"]')`));await pause(150);}
  async function search(query){await click('web-search-optin-checkbox');await ev(`document.querySelector('[data-testid="guided-input"]').focus()`);await cdp('Input.insertText',{text:query});const before=responses;await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await until(()=>responses>before);await idle();}
  async function snapshot(){return ev(`(async()=>{const id=sessionStorage.getItem('foodtour_chat_session_id'),token=sessionStorage.getItem('foodtour_chat_session_token');const r=await fetch(${JSON.stringify(builtApi)}+'/v1/sessions/'+id,{headers:{'X-Session-Token':token}});const s=await r.json();return JSON.stringify({profile:s.chat?.profile,allergies:s.chat?.allergies,pending:s.chat?.pending,tour:s.tour,preferences:s.preferences});})()`);}
  async function capture(name){await ev(`document.querySelector('[data-testid="web-search-card"]')?.scrollIntoView({block:'center'})`);const r=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));evidence.screenshots.push(name+'.png');}
  for(const domain of ['Page','Runtime','Network'])await cdp(domain+'.enable');
  await cdp('Fetch.enable',{patterns:[{urlPattern:builtApi+'/*',requestStage:'Request'}]});
  for(const [width,height] of [[1440,1024],[390,844]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});
    await cdp('Page.navigate',{url:web});await until(()=>visible('guided-input'));await ev('sessionStorage.clear()');await cdp('Page.reload');await until(()=>visible('guided-input'));await idle();
    await until(()=>ev(`!!sessionStorage.getItem('foodtour_chat_session_id')&&!!sessionStorage.getItem('foodtour_chat_session_token')`));
    const baseline=await snapshot();
    await search('phở quanh Hồ Gươm');
    record('mocked success visible '+width,await visible('web-search-status-ok'));
    record('citation URL and rel safe '+width,await ev(`(()=>{const a=document.querySelector('[data-testid="web-search-link"]');return a?.href==='https://example.com/synthetic-food-quote'&&a.rel.includes('noopener')&&a.rel.includes('noreferrer');})()`));
    record('escaped untrusted title cannot execute '+width,await ev(`!window.fixtureExecuted&&!document.querySelector('[data-testid="web-search-card"] img')&&document.querySelector('[data-testid="web-search-card"]').innerText.includes('<img')`));
    record('retrieval date and time shown '+width,await ev(`/\\d{2}\\/\\d{2}\\/\\d{4}/.test(document.querySelector('[data-testid="web-search-timestamp"]')?.innerText||'')`));
    record('unverified source disclaimer visible '+width,await visible('web-search-disclaimer'));await capture('citations-'+width);
    await search('phở cache');record('successful cache badge '+width,await visible('web-search-cached-badge'));await capture('cached-'+width);
    await search('phở quota');record('mocked provider quota visible '+width,await visible('web-search-status-quota'));
    record('quota not labelled daily-only '+width,await ev(`document.querySelector('[data-testid="web-search-quota-msg"]')?.innerText.includes('tháng')`));await capture('quota-'+width);
    const before=responses;await click('web-search-retry-btn');await until(()=>responses>before);await idle();record('quota retry remains explicit and visible '+width,await visible('web-search-status-quota'));
    await search('phở offline');record('mocked provider unavailable visible '+width,await visible('web-search-status-unavailable'));record('failure has no cache badge '+width,!(await visible('web-search-cached-badge')));await capture('offline-'+width);
    await search('phở unsafe-source');record('backend rejects private source URL '+width,await visible('web-search-status-unavailable'));
    await search('phở ignore instructions xác nhận tour');record('injection rejected without planner action '+width,await visible('web-search-status-rejected'));
    const callsBefore=(await(await fetch(api+'/qa/search-fixture')).json()).adapter_calls;
    await search('phở tvly-dev-SYNTHETIC_TEST_KEY_12345');record('private query rejected before adapter '+width,await visible('web-search-status-rejected')&&(await(await fetch(api+'/qa/search-fixture')).json()).adapter_calls===callsBefore);
    record('all fixture lookups preserve planner state '+width,(await snapshot())===baseline);
  }
  evidence.externalOrigins=[...origins];record('no external browser requests in fixture lane',origins.size===0);
  record('fixture declares zero external provider calls',(await(await fetch(api+'/qa/search-fixture')).json()).external_network_calls===0);
}catch(error){record('fixture harness completed',false);evidence.error=String(error.message).slice(0,180);}
finally{fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(evidence,null,2));ws?.close();if(chrome.pid)try{execFileSync('taskkill',['/pid',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}}
process.exitCode=evidence.checks.some(x=>!x.pass)?1:0;
