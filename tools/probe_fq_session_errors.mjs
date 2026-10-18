/** Actual preview UI + real synthetic backend. Only failures are intercepted.
 * No session credentials, private data, or response bodies are emitted.
 * Dedicated Chrome profile/port; existing app servers are never stopped.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn, execFileSync} from 'node:child_process';
const web=process.env.FQ_WEB || 'http://127.0.0.1:3050';
const api=process.env.FQ_API || 'http://127.0.0.1:8050';
const port=Number(process.env.FQ_CDP || 19710), checks=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<200;n++){if(await fn())return;await pause(100);}throw Error('Timed out waiting for observable UI state');}
const free=await new Promise(resolve=>{const p=net.createServer();p.once('error',()=>resolve(false));p.listen(port,'127.0.0.1',()=>p.close(()=>resolve(true)));});
if(!free)throw Error('Dedicated browser port occupied; no process stopped');
if((await(await fetch(api+'/health')).json()).dataset_source!=='synthetic')throw Error('Synthetic-only capture guard');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'fq-session-errors-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-background-networking',`--remote-debugging-port=${port}`,`--user-data-dir=${scratch}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let ws, mode=null, id=0; const pending=new Map(), heldCreates=[]; const counts={startupFaults:0,restoreFaults:0,creates:0};
const record=(name,pass)=>{checks.push({name,pass:!!pass});console.log(JSON.stringify(checks.at(-1)));};
try{
  let target;
  await until(async()=>{try{target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x=>x.type==='page');return !!target;}catch{return false;}});
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const msg=++id;pending.set(msg,{resolve,reject});ws.send(JSON.stringify({id:msg,method,params}));});
  ws.onmessage=async e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);return;}
    if(m.method!=='Fetch.requestPaused')return;
    const p=m.params,u=new URL(p.request.url),method=p.request.method;
    if(method==='POST'&&u.pathname==='/v1/sessions')counts.creates++;
    if(mode==='delay_startup'&&method==='POST'&&u.pathname==='/v1/sessions'){
      heldCreates.push(p.requestId);
    }else if(mode==='startup'&&method==='POST'&&u.pathname==='/v1/sessions'){
      counts.startupFaults++;await cdp('Fetch.failRequest',{requestId:p.requestId,errorReason:'ConnectionFailed'});
    }else if(mode==='restore'&&method==='GET'&&/^\/v1\/sessions\/[^/]+$/.test(u.pathname)){
      counts.restoreFaults++;await cdp('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:web},{name:'Access-Control-Allow-Credentials',value:'true'}],body:Buffer.from(JSON.stringify({detail:{code:'temporarily_unavailable'}})).toString('base64')});
    }else await cdp('Fetch.continueRequest',{requestId:p.requestId});
  };
  const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('UI evaluation failed');return r.result.value;};
  const capture=async name=>{if(!process.env.FQ_CAPTURE)return;fs.mkdirSync(process.env.FQ_CAPTURE,{recursive:true});const r=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.FQ_CAPTURE,name+'.png'),Buffer.from(r.data,'base64'));};
  const retry=async()=>{const point=await ev(`(()=>{const b=[...document.querySelectorAll('[role="alert"] button')].find(b=>/Thử lại/.test(b.innerText));if(!b)return null;b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);if(!point)return false;await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});return true;};
  for(const domain of ['Page','Runtime','Network'])await cdp(domain+'.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1024,deviceScaleFactor:1,mobile:false});
  await cdp('Fetch.enable',{patterns:[{urlPattern:api+'/v1/sessions*',requestStage:'Request'}]});
  mode='startup';await cdp('Page.navigate',{url:web});
  await until(async()=>counts.startupFaults>0);await pause(1800);
  record('startup failure is actually injected',counts.startupFaults>0);
  record('startup failure displays recoverable alert',await ev(`!!document.querySelector('[role="alert"]')`));
  await capture('codex-startup-failure');
  mode=null;const retriedStartup=await retry();record('startup failure provides actionable retry',retriedStartup);
  if(!retriedStartup)await cdp('Page.reload');
  await until(()=>ev(`!!sessionStorage.getItem('foodtour_chat_session_id')`));await pause(800);
  const original=await ev(`sessionStorage.getItem('foodtour_chat_session_id')`);
  const originalToken=await ev(`sessionStorage.getItem('foodtour_chat_session_token')`);
  // User-visible text is typed into the actual React input, not injected as API success.
  await ev(`document.querySelector('[data-testid="guided-input"]').focus()`);
  await cdp('Input.insertText',{text:'Tour ba quán Hồ Gươm 90 phút, 500 nghìn cả nhóm cho hai người'});
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});
  await until(()=>ev(`!!document.querySelector('[data-testid="understood-card"]')`));
  const createsBefore=counts.creates;mode='restore';await cdp('Page.reload');
  await until(async()=>counts.restoreFaults>0);await pause(1800);
  record('transient restore 503 actually injected',counts.restoreFaults>0);
  record('transient restore preserves stored session identity',original===await ev(`sessionStorage.getItem('foodtour_chat_session_id')`));
  record('transient restore does not create replacement session',counts.creates===createsBefore);
  record('transient restore shows recoverable alert',await ev(`!!document.querySelector('[role="alert"]')`));
  await capture('codex-restore-failure');
  const retained=await(await fetch(api+'/v1/sessions/'+original,{headers:{'X-Session-Token':originalToken}})).json();
  record('original server session retains parsed preferences',retained.chat?.profile?.duration_min?.value===90);
  mode=null;const retriedRestore=await retry();record('transient restore provides actionable retry',retriedRestore);
  if(retriedRestore){await until(()=>ev(`!!document.querySelector('[data-testid="understood-card"]')`));record('retry restores original identity and preferences',original===await ev(`sessionStorage.getItem('foodtour_chat_session_id')`)&&await ev(`document.querySelector('[data-testid="understood-card"]').innerText.includes('90 phút')`));}
  // Delay only session creation, then attempt a rapid user submit while initialization is pending.
  await ev('sessionStorage.clear()');mode='delay_startup';await cdp('Page.reload');
  await until(async()=>heldCreates.length>0&&await ev(`!!document.querySelector('[data-testid="guided-input"]')`));
  await pause(300);const createsWhileWaiting=counts.creates;
  const canType=await ev(`(()=>{const e=document.querySelector('[data-testid="guided-input"]');e.focus();return !e.disabled&&!e.readOnly;})()`);
  if(canType){await cdp('Input.insertText',{text:'Đang chờ phiên, muốn tour ba quán'});await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});}
  await pause(500);
  record('submit during initialization does not start competing session',counts.creates===createsWhileWaiting);
  record('pending initialization preserves typed draft or disables entry',!canType||await ev(`document.querySelector('[data-testid="guided-input"]').value.includes('Đang chờ phiên')`));
  mode=null;for(const requestId of heldCreates.splice(0))await cdp('Fetch.continueRequest',{requestId});
  await until(()=>ev(`!!sessionStorage.getItem('foodtour_chat_session_id')&&!document.querySelector('[aria-busy="true"]')`));
  record('delayed initialization completes with owned session',await ev(`!!sessionStorage.getItem('foodtour_chat_session_id')`));
  await ev('sessionStorage.clear()');await cdp('Page.reload');
  await until(()=>ev(`!!sessionStorage.getItem('foodtour_chat_session_id')&&!document.querySelector('[aria-busy="true"]')&&!!document.querySelector('[data-testid="guided-input"]')`));await pause(300);
  await ev(`document.querySelector('[data-testid="guided-input"]').focus()`);
  await cdp('Input.insertText',{text:'Tour ba quán Hồ Gươm 90 phút, mỗi chặng tối đa 10 phút'});
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});
  await until(()=>ev(`!!document.querySelector('[data-testid="understood-card"]')`));
  const hasLegRow=()=>ev(`(()=>{const e=document.querySelector('[data-testid="understood-card"]');return !!e&&/Đi mỗi chặng tối đa\\s*10 phút/.test(e.innerText);})()`);
  record('numeric per-leg limit is visibly understood before reload',await hasLegRow());
  await cdp('Page.reload');await until(()=>ev(`!!document.querySelector('[data-testid="understood-card"]')`));
  record('reload visibly restores the stated per-leg limit',await hasLegRow());
  const output={synthetic:true,web,api,method:'Actual Chrome UI; labelled failure-only CDP interception',checks};
  fs.writeFileSync(path.join(os.tmpdir(),'foodtour-fq-session-errors.json'),JSON.stringify(output,null,2));
  console.log(JSON.stringify({checks:checks.length,failed:checks.filter(x=>!x.pass).length}));
  process.exitCode=checks.some(x=>!x.pass)?1:0;
}finally{
  ws?.close();if(chrome.pid)try{execFileSync('taskkill',['/pid',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}
  // Chrome profile remains in OS temp: it contains ephemeral synthetic session credentials.
}
