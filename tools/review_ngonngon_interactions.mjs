/** Independent browser review. Requires preview web3020 and synthetic API8030.
 * Test-only CDP interception routes this browser's API calls to fixed loopback8030;
 * production client/configuration is unchanged. No private data or credentials in output.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
const web='http://127.0.0.1:3020', api='http://127.0.0.1:8030', port=19310;
const out=path.resolve('docs/reports/ngonngon-codex');fs.mkdirSync(out,{recursive:true});
const checks=[];const pause=ms=>new Promise(r=>setTimeout(r,ms));
function check(name,ok){checks.push({name,pass:!!ok});console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)throw Error(name);}
async function until(fn,ms=20000){const t=Date.now();while(Date.now()-t<ms){try{if(await fn())return;}catch{}await pause(70);}throw Error('Timed out waiting for test state');}
async function request(s,suffix='',body){const r=await fetch(api+(s?'/v1/sessions/'+s.session_id+suffix:'/v1/sessions'),{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(s?{'X-Session-Token':s.token}:{})},...(body?{body:JSON.stringify(body)}:{})});const b=await r.json();if(!r.ok)throw Error('Fixture API status '+r.status);return b;}
async function seed(text){const r=await fetch(api+'/v1/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const s=await r.json();let view=await request(s,'/chat',{revision:s.revision,text});s.revision=view.revision;return {s,view};}
let chrome,ws,mode=null;let messages=0;const pending=new Map();let requests=0;
try{
  const health=await(await fetch(api+'/health')).json();check('synthetic API required before any capture',health.dataset_source==='synthetic');
  let occupied=false;try{await fetch(`http://127.0.0.1:${port}/json/version`);occupied=true;}catch{}check('review browser port unused',!occupied);
  chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking',`--remote-debugging-port=${port}`,`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'ngonngon-review-'))}`,'--host-resolver-rules=MAP www.google.com ~NOTFOUND, MAP maps.googleapis.com ~NOTFOUND, MAP maps.gstatic.com ~NOTFOUND','about:blank'],{stdio:'ignore',windowsHide:true});
  let target;await until(async()=>{const rows=await(await fetch(`http://127.0.0.1:${port}/json`)).json();target=rows.find(x=>x.type==='page');return !!target;});
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++messages;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  ws.onmessage=async event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);return;}
    if(m.method==='Fetch.requestPaused'){
      const p=m.params;requests++;
      if(p.request.url.endsWith('/tour/replace')&&mode==='no_candidates'){
        await cdp('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:409,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:web}],body:Buffer.from(JSON.stringify({error:{code:'no_candidates',message:'[SYNTHETIC] no candidate'}})).toString('base64')});
      }else{
        await cdp('Fetch.continueRequest',{requestId:p.requestId,url:p.request.url.replace('http://127.0.0.1:8020',api)});
      }
    }
  };
  const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
  const click=async selector=>{await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);const p=await ev(`(()=>{const r=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();return r&&{x:r.x+r.width/2,y:r.y+r.height/2};})()`);if(!p)throw Error('Missing test control');await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});};
  const button=async text=>{const found=await ev(`(()=>{document.querySelectorAll('[data-review-action]').forEach(e=>e.removeAttribute('data-review-action'));const b=Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.innerText.trim()===${JSON.stringify(text)});if(!b)return false;b.setAttribute('data-review-action','yes');return true;})()`);if(!found)throw Error('Missing dialog action');await click('[data-review-action="yes"]');};
  const key=async(key,shift=false)=>{await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,modifiers:shift?8:0,windowsVirtualKeyCode:key==='Tab'?9:27});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,modifiers:0});};
  const idle=async()=>{await until(async()=>!(await ev(`!!document.querySelector('[aria-busy="true"]')`)));await pause(200);};
  const capture=async name=>{await pause(250);const r=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));};
  const viewport=async(width,height)=>{await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});await cdp('Emulation.setPageScaleFactor',{pageScaleFactor:1});};
  const prime=async s=>{await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`try{sessionStorage.setItem('foodtour_chat_session_id',${JSON.stringify(s.session_id)});sessionStorage.setItem('foodtour_chat_session_token',${JSON.stringify(s.token)});}catch{}`});await cdp('Page.navigate',{url:web});await until(()=>ev(`!!document.querySelector('[data-testid="guided-container"]')`));await idle();};
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Fetch.enable',{patterns:[{urlPattern:'http://127.0.0.1:8020/*',requestStage:'Request'}]});
  await viewport(1440,1024);
  await cdp('Page.navigate',{url:web});await until(()=>ev(`!!document.querySelector('[data-testid="guided-container"]')`));await idle();await capture('desktop-empty');
  const tourText='Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin.';
  const {s}=await seed(tourText);let view=await request(s,'/chat',{revision:s.revision,action:{type:'pick_option',option_id:'scope:group'}});s.revision=view.revision;view=await request(s,'/chat',{revision:s.revision,text:'19h'});s.revision=view.revision;check('fixture requires explicit confirmation',view.chat.pending?.kind==='confirm_plan'&&!view.tour);await prime(s);await capture('desktop-confirm');
  await viewport(390,844);await cdp('Page.reload');await until(()=>ev(`!!document.querySelector('[data-testid="confirm-yes-btn"]')`));await idle();check('mobile viewport is actual 390px with no horizontal overflow',await ev(`document.documentElement.clientWidth===390&&document.documentElement.scrollWidth<=391`));await capture('mobile-confirm');
  await click('[data-testid="confirm-yes-btn"]');await idle();await click('[aria-controls="guided-tour-section"]');await until(()=>ev(`!!document.querySelector('[data-testid="guided-timeline"]')`)).catch(async e=>{await capture('debug-confirm');console.log(await ev('document.body.innerText'));throw e;});check('real browser confirmation creates three stops',await ev(`document.querySelectorAll('[data-testid^="guided-stop-"]').length===3`));
  await click('[aria-controls="guided-tour-section"]');await ev('window.scrollTo(0,0)');await capture('mobile-tour');
  check('mobile has one visible active panel',await ev(`getComputedStyle(document.querySelector('#guided-chat-section')).display==='none'&&getComputedStyle(document.querySelector('#guided-tour-section')).display!=='none'`));
  await viewport(1440,1024);await idle();await ev('window.scrollTo(0,0)');await capture('desktop-tour');
  const before=await request(s);const old=before.tour.stops.map(x=>x.venue_id);
  await click('[data-testid="stop-replace-btn-1"]');await pause(150);
  check('replacement dialog outside inert tree with initial focus',await ev(`(()=>{const d=document.querySelector('[role="dialog"]');return !!d&&!d.closest('[inert]')&&d.contains(document.activeElement)&&document.querySelector('[data-testid="guided-container"]').inert;})()`));
  await key('Tab');await key('Tab',true);check('replacement Tab remains inside dialog',await ev(`document.querySelector('[role="dialog"]').contains(document.activeElement)`));await capture('desktop-replace');
  await button('Thay quán này');await idle();const after=await request(s);
  check('actual replacement preserves other identities and order',!after.tour.stops.some(x=>x.venue_id===old[1])&&after.tour.stops[0].venue_id===old[0]&&after.tour.stops[2].venue_id===old[2]);
  check('server exposes locked other stops',after.tour.locks.includes(old[0])&&after.tour.locks.includes(old[2]));
  await button('Hoàn tất & xem lịch trình');await pause(150);check('completed dialog returns focus into tour',await ev(`!document.querySelector('[role="dialog"]')&&document.querySelector('#guided-tour-section').contains(document.activeElement)`));
  mode='no_candidates';await click('[data-testid="stop-replace-btn-1"]');await button('Thay quán này');await idle();mode=null;
  check('controlled no-candidate error preserves real server tour',JSON.stringify((await request(s)).tour.stops)===JSON.stringify(after.tour.stops));check('no-candidate closes modal and shows error',await ev(`!document.querySelector('[role="dialog"]')&&!!document.querySelector('[data-testid="guided-error-banner"]')`));
  await click('[data-testid="stop-replace-btn-1"]');const fresh=await request(s);const safety=await request(s,'/chat',{revision:fresh.revision,text:'mình bị dị ứng nhẹ với mấy thứ rang giòn'});check('concurrent safety edit opens allergy obligation',safety.chat?.pending?.slot==='allergy_term');await button('Thay quán này');await idle();
  await until(()=>ev(`!!document.querySelector('[data-testid="clarify-question-text"]')`));check('real replacement409 restores new allergy question and closes old modal',await ev(`!document.querySelector('[role="dialog"]')&&/dị ứng/.test(document.querySelector('[data-testid="clarify-question-text"]')?.innerText||'')&&!document.querySelector('[data-testid="confirm-yes-btn"]')&&!document.querySelector('[data-testid="guided-timeline"]')`));
  await cdp('Page.reload');await until(()=>ev(`!!document.querySelector('[data-testid="clarify-question-text"]')`));await idle();check('reload preserves safety question ahead of retained server tour',await ev(`document.querySelectorAll('[data-testid="clarify-question-text"]').length===1&&/dị ứng/.test(document.querySelector('[data-testid="clarify-question-text"]').innerText)&&!document.querySelector('[data-testid="guided-timeline"]')`));
  await click('[data-testid="trust-disclosure-btn"]');await pause(150);check('trust dialog is interactive outside inert root',await ev(`(()=>{const d=document.querySelector('[role="dialog"]');return !!d&&!d.closest('[inert]')&&d.contains(document.activeElement);})()`));await key('Tab');await key('Tab',true);check('trust Tab is contained',await ev(`document.querySelector('[role="dialog"]').contains(document.activeElement)`));await click('[data-testid="trust-disclosure-close"]');await pause(100);check('trust click close restores opener focus',await ev(`document.activeElement?.dataset.testid==='trust-disclosure-btn'`));
  for(const amount of [150000,300000,1000000]){const x=await seed(`Tour 3 quán quanh Hồ Gươm lúc 19h, 120 phút, ngân sách ${amount/1000} nghìn cho 3 người`);await prime(x.s);await cdp('Page.reload');await idle();await until(()=>ev(`!!document.querySelector('[data-testid="clarify-question-text"]')`));check('budget reload preserves '+amount,await ev(`document.querySelector('[data-testid="clarify-question-text"]').innerText.includes(${JSON.stringify(amount.toLocaleString('vi-VN'))})`));}
  console.log(JSON.stringify({synthetic:true,checks:checks.length,failed:0,apiRequests:requests}));
}catch(error){console.error('Review failed:',error.message);process.exitCode=1;}
finally{ws?.close();if(chrome?.pid)try{execFileSync('taskkill',['/PID',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({synthetic:true,checks},null,2));}
