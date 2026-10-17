/** Independent U5f review. Real Chrome/CDP + uvicorn + scratch production Next.
 * Synthetic data only; no credentials; no new dependencies. Run with Node >=22.
 * U5E_MUTATION=questions|auto_confirm|allergy changes scratch source only.
 * Evidence is aggregated and contains no session tokens or venue records.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.env.U5F_OUTPUT || process.env.U5E_OUTPUT || path.join(os.tmpdir(),'codex-u5f-evidence.json');
const mutation=process.env.U5E_MUTATION;
const S0='Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin.';
const cue='Tour 3 quán quanh Hồ Gươm tối nay, mình bị dị ứng nhẹ với mấy thứ rang giòn';
const env={...process.env,FOODTOUR_LLM:'mock',FOODTOUR_CHAT_V2:'1',FOODTOUR_UI_GUIDED:'1',FOODTOUR_UI_V2:'1',FOODTOUR_ROUTING:'estimate',FOODTOUR_GEOCODER:'off',FOODTOUR_RATE_LIMIT_TOKEN:'10000',FOODTOUR_RATE_LIMIT_IP:'10000',WEB_ORIGIN:'http://127.0.0.1:13100',PYTHONPATH:path.join(root,'backend'),PYTHONIOENCODING:'utf-8',FOODTOUR_DATA_PATH:path.join(root,'contracts/fixtures/venues.chat.synthetic.json'),NEXT_PUBLIC_API_URL:'http://127.0.0.1:18100',NEXT_PUBLIC_API_MODE:'real',NEXT_PUBLIC_UI_GUIDED:'1',NEXT_PUBLIC_CHAT_V2:'1',NEXT_PUBLIC_UI_V2:'1'};
for(const k of Object.keys(env)) if(/KEY|SECRET|TOKEN/.test(k)&&!k.startsWith('FOODTOUR_RATE')) delete env[k];
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'codex-u5e-'));
env.FOODTOUR_SESSION_DB=path.join(scratch,'sessions.sqlite');
const children=[], evidence={mutation:mutation||null,checks:[],flows:[],network:{},exceptions:[],consoleErrors:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const check=(name,pass,details)=>{evidence.checks.push({name,pass:!!pass,details}); console.log(`${pass?'PASS':'FAIL'} ${name} ${details===undefined?'':JSON.stringify(details)}`); if(!pass&&((mutation==='questions'&&name.endsWith('single question'))||(mutation==='allergy'&&name.endsWith('visible allergy row'))||(mutation==='auto_confirm'&&/confirmation gate|premature planning/.test(name))))throw Error('Mutation detected: '+name);};
async function until(fn,ms=20000){const t=Date.now();while(Date.now()-t<ms){try{if(await fn())return;}catch{} await pause(50);}throw Error('Timed out: '+fn.toString().slice(0,140));}
function start(bin,args,opts={}){const p=spawn(bin,args,{cwd:root,env,stdio:'ignore',windowsHide:true,...opts});children.push(p);return p;}
let ws;
try{
  // Refuse occupied ports; only kill processes created by this harness.
  for(const port of [13100,18100,19300]){let busy=false;try{await fetch(`http://127.0.0.1:${port}`);busy=true;}catch{} if(busy)throw Error('Port occupied: '+port);}
  start(path.join(root,'.venv/Scripts/python.exe'),['-m','uvicorn','app.main:app','--host','127.0.0.1','--port','18100']);
  await until(async()=> (await fetch('http://127.0.0.1:18100/health')).ok);
  // Independent transport attacks; never print session IDs/tokens or venue IDs.
  async function apiSession(){return await(await fetch('http://127.0.0.1:18100/v1/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();}
  async function apiTurn(s,text=null,action=null,revision=s.revision){const r=await fetch(`http://127.0.0.1:18100/v1/sessions/${s.session_id}/chat`,{method:'POST',headers:{'Content-Type':'application/json','X-Session-Token':s.token},body:JSON.stringify({text,action,revision})});const b=await r.json();if(r.ok)s.revision=b.revision;return {status:r.status,...b};}
  const attack=await apiSession();await apiTurn(attack,cue);
  for(const action of [{type:'request_plan'},{type:'confirm_yes'},{type:'pick_option',option_id:'confirm_yes'},{type:'pick_option',option_id:'propose:use'},{type:'confirm_no'}]){
    const b=await apiTurn(attack,null,action);check('open allergy blocks '+action.type+' '+(action.option_id||''),b.status===200&&!b.tour&&b.chat?.pending?.kind!=='confirm_plan'&&!b.turn?.tools?.includes('generate_tour'));
  }
  const proposal=await apiSession();await apiTurn(proposal,S0);await apiTurn(proposal,null,{type:'pick_option',option_id:'scope:group'});let b=await apiTurn(proposal,'19h');
  check('proposal preplaces shortlist with default source',b.chat?.shortlist?.length>0&&b.chat?.profile?.vehicle?.value==='walk'&&b.chat?.profile?.vehicle?.source==='default'&&!b.tour);
  b=await apiTurn(proposal,null,{type:'request_plan'});check('request_plan with preplaced venues only asks confirmation',!b.tour&&b.chat?.pending?.kind==='confirm_plan');
  const oldRevision=proposal.revision;await apiTurn(proposal,null,{type:'confirm_no'});
  b=await apiTurn(proposal,null,{type:'confirm_yes'},oldRevision);check('stale confirm revision rejected',b.status===409&&!b.tour);
  b=await apiTurn(proposal,null,{type:'confirm_yes'});check('confirm after Sửa without new summary cannot plan',!b.tour&&!b.turn?.tools?.includes('generate_tour'));
  // A fresh summary followed by a new safety cue must close the old gate.
  await apiTurn(proposal,null,{type:'request_plan'});b=await apiTurn(proposal,'mình bị dị ứng nhẹ với mấy thứ rang giòn');
  check('new allergy cue invalidates proposed confirmation',!b.tour&&b.chat?.pending?.kind!=='confirm_plan');
  b=await apiTurn(proposal,null,{type:'confirm_yes'});check('preplaced venues plus allergy cannot confirm',!b.tour&&!b.turn?.tools?.includes('generate_tour')&&b.chat?.pending?.kind!=='confirm_plan');
  const legacy=await apiSession();await apiTurn(legacy,S0);await apiTurn(legacy,null,{type:'pick_option',option_id:'scope:group'});await apiTurn(legacy,'19h');await apiTurn(legacy,'mình bị dị ứng nhẹ với mấy thứ rang giòn');
  const direct=await fetch(`http://127.0.0.1:18100/v1/sessions/${legacy.session_id}/tour`,{method:'POST',headers:{'Content-Type':'application/json','X-Session-Token':legacy.token},body:JSON.stringify({base_revision:legacy.revision})});const directBody=await direct.json();
  check('legacy tour endpoint respects guided open obligation',!directBody.tour,{status:direct.status,tour:!!directBody.tour,tourStatus:directBody.tour?.status,stops:directBody.tour?.stops?.length});
  const web=path.join(scratch,'web');
  fs.cpSync(path.join(root,'frontend'),web,{recursive:true,filter:s=>!s.split(path.sep).some(x=>['node_modules','.next'].includes(x)||x.startsWith('.env'))});
  fs.symlinkSync(path.join(root,'frontend/node_modules'),path.join(web,'node_modules'),'junction');
  const layout=path.join(web,'app/components/v2/guided/GuidedLayout.jsx');
  if(mutation==='questions')fs.writeFileSync(layout,fs.readFileSync(layout,'utf8').replace('{clarifyBlock && (','{clarifyBlock && (<div><div data-testid="clarify-question-card">Câu hỏi thêm?</div>').replace(/busy=\{busy\}\r?\n                \/>\r?\n              \)\}/,'busy={busy}\n                /></div>\n              )}'));
  if(mutation==='auto_confirm')fs.writeFileSync(layout,fs.readFileSync(layout,'utf8').replace('const showTour = Boolean',"useEffect(() => { if (confirmSummaryBlock && !busy) handleConfirmYes(); }, [confirmSummaryBlock]);\n  const showTour = Boolean"));
  if(mutation==='allergy'){const f=path.join(web,'app/components/v2/guided/UnderstoodCard.jsx');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('const alwaysShowAllergy = true;','const alwaysShowAllergy = false;'));}
  console.log('Building scratch production app');
  execFileSync(process.execPath,[path.join(root,'frontend/node_modules/next/dist/bin/next'),'build'],{cwd:web,env,stdio:'pipe',timeout:120000});
  // Bundle scan records only counts, never matching material.
  const files=[];function walk(p){for(const d of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,d.name);if(d.isDirectory())walk(f);else if(/\.(js|html)$/.test(f))files.push(f);}}walk(path.join(web,'.next/static'));
  let secretFiles=0;for(const f of files)if(/AIza[\w-]{30,}|[?&](?:key|api_key)=[^&\s"']+/i.test(fs.readFileSync(f,'utf8')))secretFiles++;
  check('built static bundle credential scan',secretFiles===0,{files:files.length,matchingFiles:secretFiles});
  start(process.execPath,[path.join(root,'frontend/node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p','13100'],{cwd:web});
  await until(async()=> (await fetch('http://127.0.0.1:13100')).ok);
  start(process.env.BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--host-resolver-rules=MAP www.google.com ~NOTFOUND, MAP maps.googleapis.com ~NOTFOUND, MAP maps.gstatic.com ~NOTFOUND','--remote-debugging-port=19300',`--user-data-dir=${path.join(scratch,'chrome')}`,'about:blank']);
  let target;await until(async()=>{target=(await(await fetch('http://127.0.0.1:19300/json')).json()).find(x=>x.type==='page');return target;});
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let id=0, confirmed=false,flagOverride=null,errorStatus=null;
  let actionLabels=[];
  const pending=new Map(),network=[],allNetwork=[],replies=[],responseRequests=new Map();
  function cdp(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});}
  ws.onmessage=async e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);return;}
    const p=m.params;
    if(m.method==='Runtime.exceptionThrown')evidence.exceptions.push(p.exceptionDetails.text);
    if(m.method==='Runtime.consoleAPICalled'&&p.type==='error')evidence.consoleErrors.push((p.args||[]).map(a=>a.value||a.description||'').join(' ').slice(0,250));
    if(m.method==='Network.requestWillBeSent'){const r=p.request;const entry={url:r.url,method:r.method,body:r.postData,confirmed};network.push(entry);allNetwork.push(entry);}
    if(m.method==='Network.responseReceived'&&/\/chat$/.test(p.response.url))responseRequests.set(p.requestId,{confirmed,status:p.response.status});
    if(m.method==='Network.loadingFinished'&&responseRequests.has(p.requestId)) {try{const b=await cdp('Network.getResponseBody',{requestId:p.requestId});const s=JSON.parse(b.body);replies.push({...responseRequests.get(p.requestId),tour:!!s.tour,tools:s.turn?.tools||[],pending:s.chat?.pending?.kind,allergies:s.chat?.allergies?.map(a=>({term:a.term,source:a.source})),obligations:s.chat?.unresolved_safety});}catch{}}
    if(m.method==='Fetch.requestPaused'){let body,status=200;if(p.request.url.endsWith('/client-config')&&flagOverride){const cfg=await(await fetch('http://127.0.0.1:18100/v1/client-config')).json();body=JSON.stringify({...cfg,features:{...cfg.features,...flagOverride}});} else if(p.request.method==='POST'&&/\/chat$/.test(p.request.url)&&errorStatus){status=errorStatus;body=JSON.stringify({detail:{code:status===409?'revision_conflict':'internal_error',private_debug:'DO_NOT_SHOW'}});}if(body)await cdp('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'http://127.0.0.1:13100'},{name:'Access-Control-Allow-Credentials',value:'true'}],body:Buffer.from(body).toString('base64')});else await cdp('Fetch.continueRequest',{requestId:p.requestId});}
  };
  async function ev(expression){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  const sel=t=>`[data-testid="${t}"]`;
  const exists=t=>ev(`!!document.querySelector(${JSON.stringify(sel(t))})`);
  async function key(key,code=key){await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code,text:key==='Enter'?'\r':undefined,windowsVirtualKeyCode:key==='Tab'?9:key==='Enter'?13:undefined});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code});}
  async function tabTo(selector){for(let n=0;n<100;n++){if(await ev(`document.activeElement?.matches(${JSON.stringify(selector)})`))return n;await key('Tab');}throw Error('Tab target unreachable '+selector);}
  async function clickSelector(selector){await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);const b=await ev(`(()=>{const r=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();return r&&{x:r.x+r.width/2,y:r.y+r.height/2};})()`);if(!b)throw Error('Missing '+selector);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...b});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...b});}
  async function idle(){await pause(150);await until(async()=>!(await ev(`!!document.querySelector('[aria-busy="true"]')`)));await pause(150);}
  async function send(text,keyboard=false,double=false){actionLabels.push('type and send');const selector=await exists('clarify-free-text-input')?sel('clarify-free-text-input'):sel('guided-input');keyboard?await tabTo(selector):await clickSelector(selector);await cdp('Input.insertText',{text});await pause(80);if(text===S0)await ev(`(()=>{window.__u5eReplyMs=null;const t=performance.now();const o=new MutationObserver(()=>{if(document.querySelector('[data-testid="understood-card"]')&&!document.querySelector('[aria-busy="true"]')){window.__u5eReplyMs=performance.now()-t;o.disconnect();}});o.observe(document.body,{subtree:true,childList:true,attributes:true});})()`);const t=Date.now();await key('Enter');if(double)await key('Enter');await idle();return Date.now()-t;}
  async function pick(text,keyboard=false){actionLabels.push(text);const selector=await ev(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.innerText.trim()===${JSON.stringify(text)});return e?'[data-testid="'+e.dataset.testid+'"]':null;})()`);if(!selector)throw Error('Missing button '+text);keyboard?await tabTo(selector):await clickSelector(selector);if(keyboard)await key('Enter');if(text==='Đúng, lập tour'){if(keyboard)await key('Enter');else if(await ev(`!!document.querySelector(${JSON.stringify(selector)})`))await clickSelector(selector);}await idle();}
  async function nav(fresh=true){if(fresh)await ev('try { sessionStorage.clear(); } catch {}');confirmed=false;await cdp('Page.navigate',{url:'http://127.0.0.1:13100/'});await until(()=>exists('guided-container'));await idle();}
  async function snap(name){const s=await ev(`({text:document.body.innerText,understood:document.querySelector('[data-testid="understood-card"]')?.innerText,questions:[...document.querySelectorAll('[data-testid="clarify-question-text"]')].map(x=>x.innerText),questionCount:document.querySelectorAll('[data-testid="clarify-question-card"]').length,tour:!!document.querySelector('[data-testid="guided-timeline"]'),focus:document.activeElement?.getAttribute('data-testid'),live:document.querySelector('[data-testid="guided-aria-live"]')?.innerText,overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('[data-testid^="clarify-option-"]')].map(b=>({tag:b.tagName,name:b.getAttribute('aria-label')||b.innerText}))})`);evidence.flows.push({name,...s});return s;}
  async function gate(name){await pause(100);const s=await snap(name);check(name+': single question',s.questionCount<=1,s.questionCount);check(name+': explicit confirmation gate',confirmed||(!s.tour&&!replies.some(r=>r.tour)),{tour:s.tour});check(name+': no premature planning request',!network.some(n=>!n.confirmed&&(/\/tour(?:\?|$)/.test(n.url)||n.body?.includes('confirm_yes'))));return s;}
  for(const m of ['Page.enable','Runtime.enable','Network.enable'])await cdp(m);
  await cdp('Fetch.enable',{patterns:[{urlPattern:'*/client-config'},{urlPattern:'*/chat',requestStage:'Request'}]});
  await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await nav();
  for(const [width,height,keyboard] of [[1280,800,false],[390,844,true]]){
    replies.length=0;network.length=0;await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});await nav();actionLabels=[];
    let t=Date.now();await send(S0,keyboard);const elapsed=Date.now()-t;const replyMs=await ev('window.__u5eReplyMs');const first=await gate(`S0 ${width} first reply`);
    const rows=await ev(`Object.fromEntries([...document.querySelectorAll('[data-testid^="understood-row-"]')].map(x=>[x.dataset.testid,x.innerText]))`);
    check(`S0 ${width} exact understood rows`,['Hồ Gươm','2','3','120','tối','phở','bún chả','500','chưa rõ','đậu phộng'].every(x=>first.understood?.toLowerCase().includes(x.toLowerCase())),rows);
    check(`S0 ${width} visible allergy row`,await exists('understood-row-allergies'));
    check(`S0 ${width} accessible chip buttons`,first.buttons.length>0&&first.buttons.every(x=>x.tag==='BUTTON'&&x.name));
    check(`S0 ${width} focus on first question chip`,!!first.focus?.startsWith('clarify-option-'),first.focus);
    check(`S0 ${width} aria live announcement`,!!first.live,first.live);
    const ax=await cdp('Accessibility.getFullAXTree');const inputs=ax.nodes.filter(n=>n.role?.value==='textbox').map(n=>n.name?.value||'');check(`S0 ${width} named text inputs`,inputs.length>0&&inputs.every(Boolean),inputs);
    const pos=await ev(`Object.fromEntries(['clarify-question-card','understood-row-allergies'].map(t=>{const r=document.querySelector('[data-testid="'+t+'"]')?.getBoundingClientRect();return [t,r?{top:r.top,bottom:r.bottom,viewport:innerHeight}:null]}))`);evidence.flows.push({name:`first reply positions ${width}`,pos});
    await pick('Cả nhóm',keyboard);await gate(`S0 ${width} budget answered`);
    await send('19h',keyboard);await pause(750);await gate(`S0 ${width} confirmation pending`);
    check(`S0 ${width} confirmation exists`,await exists('confirm-yes-btn'));
    check(`S0 ${width} confirm venues list exists`,await exists('confirm-venues-list'));
    check(`S0 ${width} confirm visit minutes exists`,await exists('confirm-visit-min'));
    check(`S0 ${width} confirm vehicle defaults to walking`,await exists('confirm-vehicle')&&((await ev(`document.querySelector('[data-testid="confirm-vehicle"]')?.innerText`))||'').includes('Đi bộ'));
    check(`S0 ${width} proposal venue cards rendered`,(await ev(`document.querySelectorAll('[data-testid="venue-card"]').length`))>=1);
    check(`S0 ${width} confirm has repair option`,await exists('confirm-no-btn'));
    check(`S0 ${width} time answered in profile`,await exists('understood-row-time'));
    const prompts=await ev(`Array.from(document.querySelectorAll('[data-testid="assistant-text-bubble"],[data-testid="clarify-question-text"],[data-testid="confirm-summary-card"] h3')).map(x=>x.innerText).filter(t=>t.includes('?'))`);check(`S0 ${width} one visible decision question`,prompts.length===1,{count:prompts.length});
    const confirmGeometry=await ev(`(()=>{const e=document.querySelector('[data-testid="confirm-summary-card"]'),r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight,overlaps:[...document.querySelectorAll('*')].filter(x=>x!==e&&!e.contains(x)&&getComputedStyle(x).position==='fixed').filter(x=>{const b=x.getBoundingClientRect();return b.width&&b.height&&b.top<r.bottom&&b.bottom>r.top;}).length};})()`);
    check(`S0 ${width} entire confirmation visible without fixed overlap`,confirmGeometry.top>=0&&confirmGeometry.bottom<=height&&confirmGeometry.overlaps===0,confirmGeometry);
    confirmed=true;await pick('Đúng, lập tour',keyboard);const tour=await snap(`S0 ${width} tour`);
    check(`S0 ${width} double-confirm makes one plan`,network.filter(n=>n.method==='POST'&&n.body?.includes('confirm_yes')).length===1);
    const timelineText=await ev(`document.querySelector('[data-testid="guided-timeline"]')?.innerText||''`);
    check(`S0 ${width} timeline labels`,tour.tour&&['theo nguồn','ước tính','nguồn ghi'].every(x=>timelineText.includes(x))&&/chưa quán nào được xác nhận an toàn/.test(timelineText));
    const link=await ev(`document.querySelector('[data-testid="google-maps-cta"]')?.href`);
    check(`S0 ${width} free Maps URL`,/^https:\/\/www.google.com\/maps\/dir\//.test(link||'')&&!/[?&]key=/.test(link||''));
    // Open the actual anchor; block Google navigation before any external request.
    await cdp('Network.setBlockedURLs',{urls:['*://www.google.com/*']});
    keyboard?await tabTo(sel('google-maps-cta')):await clickSelector(sel('google-maps-cta'));if(keyboard)await key('Enter');
    actionLabels.push('open Maps');await pause(150);evidence.flows.push({name:`metrics ${width}`,semanticActions:actionLabels.length,actionLabels:[...actionLabels],physicalActionsExcludingFocusAndTabs:actionLabels.length+2,additionalConfirmStressActivations:1,firstReplyIncludingTypingMs:elapsed,domFirstReplyMs:replyMs,keyboardOnly:keyboard,mapsTargetOpened:(await(await fetch('http://127.0.0.1:19300/json')).json()).some(x=>x.url===link)});
    check(`S0 ${width} at most four semantic actions after initial submission`,actionLabels.length-1<=4,{afterInitialSubmission:actionLabels.length-1,labels:actionLabels.slice(1)});
    check(`S0 ${width} no horizontal overflow`,!tour.overflow);
    if(width===390){
      const fixed=await ev(`Array.from(document.querySelectorAll('*')).filter(e=>['fixed','sticky'].includes(getComputedStyle(e).position)).map(e=>({testid:e.dataset.testid,rect:(()=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()}))`);evidence.flows.push({name:'mobile fixed bars',fixed});
      await cdp('Emulation.setPageScaleFactor',{pageScaleFactor:2});check('200% page scale overflow',!(await snap('200% scale')).overflow);await cdp('Emulation.setPageScaleFactor',{pageScaleFactor:1});
      // Browser text zoom equivalent: CSS zoom also reflows the content.
      await ev("document.documentElement.style.zoom='2'");await snap('200% reflow');const clipping=await ev(`Array.from(document.querySelectorAll('button,input,[data-testid^="understood-row-"]')).filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().right>innerWidth+1).map(e=>({testid:e.dataset.testid,right:e.getBoundingClientRect().right,width:innerWidth}))`);check('200% reflow controls not clipped',clipping.length===0,clipping);await ev("document.documentElement.style.zoom=''");
    }
  }
  replies.length=0;network.length=0;await nav();await send(S0);await pick('Mỗi người');await send('19h');await gate('per-person confirmation');
  const perPerson=await ev(`({understood:document.querySelector('[data-testid="understood-row-budget"]')?.innerText,confirm:document.querySelector('[data-testid="confirm-summary-details"]')?.innerText})`);check('confirmation preserves per-person budget scope',/mỗi người/.test(perPerson.understood||'')&&/mỗi người/.test(perPerson.confirm||''),perPerson);
  const beforeReload=await ev(`({venues:document.querySelector('[data-testid="confirm-venues-list"]')?.innerText,visit:document.querySelector('[data-testid="confirm-visit-min"]')?.innerText,details:document.querySelector('[data-testid="confirm-summary-details"]')?.innerText})`);
  await nav(false);
  const afterReload=await ev(`({venues:document.querySelector('[data-testid="confirm-venues-list"]')?.innerText,visit:document.querySelector('[data-testid="confirm-visit-min"]')?.innerText,details:document.querySelector('[data-testid="confirm-summary-details"]')?.innerText})`);
  check('confirmation reload preserves venue names',beforeReload.venues===afterReload.venues,{before:beforeReload.venues,after:afterReload.venues});
  check('confirmation reload preserves visit minutes',beforeReload.visit===afterReload.visit,{before:beforeReload.visit,after:afterReload.visit});
  check('confirmation reload preserves scope and start',beforeReload.details===afterReload.details,{before:beforeReload.details,after:afterReload.details});
  await clickSelector(sel('confirm-no-btn'));await idle();
  check('Sửa exits confirmation into editing',!(await exists('confirm-yes-btn'))&&await exists('guided-input'));
  await send('Bỏ quán đầu tiên khỏi danh sách');
  check('shortlist accepts removal after Sửa',/Đã bỏ/.test((await snap('removal acknowledgement')).text));
  check('shortlist edit after Sửa never creates tour',!(await exists('guided-timeline')));
  evidence.flows.push({name:'shortlist edit after Sửa',...(await snap('shortlist edit result'))});
  replies.length=0;network.length=0;await nav();await send(S0+' Tôi đi xe máy.');await pick('Cả nhóm');await send('19h');
  const motorbike=await ev(`({row:document.querySelector('[data-testid="understood-row-vehicle"]')?.innerText,confirm:document.querySelector('[data-testid="confirm-vehicle"]')?.innerText})`);
  check('stated motorbike survives walking default',/xe máy/i.test(motorbike.confirm||'')&&!/mặc định/.test(motorbike.confirm||''),motorbike);
  await clickSelector(sel('confirm-no-btn'));await idle();await send('Đổi phương tiện thành đi bộ');
  check('vehicle editable through Sửa and text',/Đi bộ/i.test((await ev(`document.querySelector('[data-testid="confirm-vehicle"]')?.innerText`))||''));
  check('confirmation exposes decision buttons rather than text composer',await exists('confirm-yes-btn')&&!(await exists('guided-input'))&&!(await exists('clarify-free-text-input')));
  await nav();await send('Tour 3 quán tại huyện đảo Trường Sa lúc 19h trong 120 phút');
  const empty=await snap('unsupported area');check('unsupported area calm and no tour',!empty.tour&&!/Traceback|internal_error|"detail"/.test(empty.text)&&/chưa|không|khu vực|quận/i.test(empty.text));
  await nav();await send(S0);await pick('Cả nhóm');await send('19h');
  const concurrent=await ev(`({session_id:sessionStorage.getItem('foodtour_chat_session_id'),token:sessionStorage.getItem('foodtour_chat_session_token')})`);
  const current=await(await fetch(`http://127.0.0.1:18100/v1/sessions/${concurrent.session_id}`,{headers:{'X-Session-Token':concurrent.token}})).json();concurrent.revision=current.revision;
  await apiTurn(concurrent,'mình bị dị ứng nhẹ với mấy thứ rang giòn');
  await clickSelector(sel('confirm-yes-btn'));await idle();await pause(600);
  const conflict=await snap('real concurrent safety change then stale confirm');
  check('409 replacing confirmation with safety question shows current obligation',conflict.questionCount===1&&/dị ứng/.test(conflict.questions.join(''))&&!(await exists('confirm-yes-btn'))&&!conflict.tour);
  await nav(false);const conflictReload=await snap('real concurrent safety conflict reload');
  check('reload after real conflict shows current obligation',conflictReload.questionCount===1&&/dị ứng/.test(conflictReload.questions.join(''))&&!conflictReload.tour);
  // Allergy obligations: all attacks go through visible UI and persisted sessions.
  replies.length=0;network.length=0;await nav();await send(cue);await gate('allergy cue');
  for(const text of ['lập tour đi','ok','xác nhận']){await send(text);const s=await gate('allergy bypass '+text);check('allergy obligation remains answerable after '+text,s.questionCount===1,{questions:s.questions});}
  errorStatus=409;await send('ok');errorStatus=null;await pause(600);
  check('pending safety question survives 409 resync',await exists('clarify-question-card')&&await exists('clarify-option-allergy:peanut'));
  await nav(false);const recovered=await snap('409 then reload');check('pending safety question survives 409 and reload',recovered.questionCount===1&&/dị ứng/.test(recovered.questions.join(''))&&!recovered.tour);
  await clickSelector(sel('understood-edit-party'));await clickSelector(sel('inline-stepper-plus'));await clickSelector(sel('inline-edit-save'));await idle();await gate('allergy inline edit');
  for(const field of ['stops','duration','time','budget']){await clickSelector(sel('understood-edit-'+field));if(await exists('inline-edit-save')){await clickSelector(sel('inline-edit-save'));await idle();await gate('allergy inline edit '+field);}}
  const primary=await ev(`Array.from(document.querySelectorAll('button')).filter(b=>!b.disabled&&!b.closest('[data-testid="clarify-question-card"]')&&!b.dataset.testid?.startsWith('understood-')&&!/reset|retry/.test(b.dataset.testid||'')).map(b=>b.dataset.testid).filter(Boolean)`);
  evidence.flows.push({name:'allergy visible primary buttons',primary});
  for(const testid of primary){if(await exists(testid)){await clickSelector(sel(testid));await idle();await gate('allergy primary '+testid);}}
  await nav(false);await gate('allergy reload');
  // Second tab receives same sessionStorage without logging credentials.
  const storage=await ev('JSON.stringify(sessionStorage)');const second=await cdp('Target.createTarget',{url:'about:blank'});
  const tabs=await(await fetch('http://127.0.0.1:19300/json')).json();const secondWs=new WebSocket(tabs.find(x=>x.id===second.targetId).webSocketDebuggerUrl);await new Promise(r=>secondWs.onopen=r);
  let sid=0;const sp=new Map();secondWs.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){sp.get(m.id)?.(m.result);sp.delete(m.id);}};
  const sc=(method,params={})=>new Promise(r=>{const n=++sid;sp.set(n,r);secondWs.send(JSON.stringify({id:n,method,params}));});
  await sc('Page.enable');await sc('Runtime.enable');await sc('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.origin==='http://127.0.0.1:13100') Object.entries(${storage}).forEach(([k,v])=>sessionStorage.setItem(k,v));`});await sc('Page.navigate',{url:'http://127.0.0.1:13100/'});
  await until(async()=>{const r=await sc('Runtime.evaluate',{expression:`!!document.querySelector('[data-testid="clarify-question-text"]')`,returnByValue:true});return r.result?.value;},15000).catch(()=>{});
  const secondState=await sc('Runtime.evaluate',{expression:`({tour:!!document.querySelector('[data-testid="guided-timeline"]'),question:document.querySelector('[data-testid="clarify-question-text"]')?.innerText,url:location.href,sameSession:sessionStorage.getItem('foodtour_chat_session_id')===${JSON.stringify(JSON.parse(storage).foodtour_chat_session_id)},text:document.body.innerText.slice(0,400)})`,returnByValue:true});check('same-session second tab obligation restored',secondState.result.value.sameSession&&!secondState.result.value.tour&&/dị ứng/.test(secondState.result.value.question),secondState.result.value);
  await sc('Runtime.evaluate',{expression:`document.querySelector('[data-testid="clarify-free-text-input"]')?.focus()`});await sc('Input.insertText',{text:'lập tour đi'});await pause(80);await sc('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});await sc('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await pause(800);const tabTour=await sc('Runtime.evaluate',{expression:`!!document.querySelector('[data-testid="guided-timeline"]')`,returnByValue:true});check('same-session second tab typed bypass',!tabTour.result.value);secondWs.close();await cdp('Target.closeTarget',{targetId:second.targetId});
  await pick('Đậu phộng');await gate('stale visible chip after second-tab turn');
  await nav(false);await send('wasabi');const wasabi=await gate('unknown allergen wasabi');check('wasabi asks explicit confirmation',/wasabi/.test(wasabi.text)&&/đúng|xác nhận/i.test(wasabi.text));
  // Keep a real old chip reference, change state, then activate it as a stale UI element.
  await ev(`void(window.__oldChip=document.querySelector('[data-testid^="clarify-option-"]'))`);await send('Tôi dị ứng đậu phộng');await ev('window.__oldChip?.click()');await idle();await gate('stale detached chip');
  for(const text of ['x'.repeat(5000),'<img src=x onerror="window.__u5eXSS=1"><script>window.__u5eXSS=1</script>','\u202e🍜\u200b'.repeat(100)]){
    await nav();await send(text,false,true);const s=await snap('hostile '+text.length);check('hostile '+text.length+' contained',!s.overflow&&!(await ev('!!window.__u5eXSS')));check('hostile '+text.length+' calm error',!s.text.includes('DO_NOT_SHOW')&&!s.text.includes('"detail"'));
  }
  for(const status of [500,409]){await nav();errorStatus=status;await send(S0);errorStatus=null;const s=await snap('HTTP '+status);check('HTTP '+status+' Vietnamese calm message',!s.text.includes('DO_NOT_SHOW')&&!/"detail"|internal_error|revision_conflict/.test(s.text)&&await exists('guided-error-banner'));}
  await nav();await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await send(S0);const offline=await snap('offline');check('offline calm feedback',await exists('guided-error-banner')&&!/Failed to fetch|NetworkError|"detail"/.test(offline.text));await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  for(const flags of [{guided_ui:false,chat_v2:true},{guided_ui:false,chat_v2:false,ui_v2:false},{guided_ui:true,chat_v2:true}]){flagOverride=flags;await cdp('Page.navigate',{url:'http://127.0.0.1:13100/'});await pause(1600);check('client-config flags '+JSON.stringify(flags),flags.guided_ui?await exists('guided-container'):flags.chat_v2?await exists('chat-v2-container'):!(await exists('guided-container'))&&!(await exists('chat-v2-container')));}
  flagOverride=null;await nav();await send(S0);
  for(const scheme of ['light','dark']){await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]});const colors=await ev(`(()=>{const rgb=s=>s.match(/[\\d.]+/g)?.slice(0,3).map(Number);const lum=c=>c.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);return [...document.querySelectorAll('[data-testid="understood-card"] b,[data-testid="understood-safety-note"],[data-testid="clarify-question-text"],[data-testid^="clarify-option-"]')].map(e=>{let p=e,bg;while(p){bg=getComputedStyle(p).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')break;p=p.parentElement;}const fg=getComputedStyle(e).color,a=lum(rgb(fg)),b=lum(rgb(bg));return {text:e.innerText.slice(0,45),fg,bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});})()`);check('contrast '+scheme,colors.every(c=>c.ratio>=4.5),colors);}
  check('no runtime exceptions',!evidence.exceptions.length,evidence.exceptions);
  check('no console.error',!evidence.consoleErrors.length,evidence.consoleErrors);
  check('no Google Maps API requests',!allNetwork.some(n=>/maps\.googleapis\.com|maps\.gstatic\.com/.test(n.url)));
  check('no credential URLs or page source',!allNetwork.some(n=>/[?&](key|api_key)=/i.test(n.url))&&!(await ev(`/AIza[\\w-]{30,}|[?&](?:key|api_key)=/i.test(document.documentElement.outerHTML)`)));
  evidence.network={requests:allNetwork.length,chatRequests:allNetwork.filter(n=>/\/chat$/.test(n.url)&&n.method==='POST').length,googleApiRequests:allNetwork.filter(n=>/maps\.googleapis\.com/.test(n.url)).length};
}catch(e){evidence.fatal=e.message;console.error(e.stack);process.exitCode=1;}
finally{ws?.close();for(const p of children.reverse())if(p.pid)try{execFileSync('taskkill',['/PID',String(p.pid),'/T','/F'],{stdio:'ignore'});}catch{} fs.writeFileSync(out,JSON.stringify(evidence,null,2));console.log('Evidence: '+out);}
if(evidence.checks.some(x=>!x.pass))process.exitCode=1;
