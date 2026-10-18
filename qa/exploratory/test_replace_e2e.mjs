import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const PORT_CDP = 19700;
const BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function main() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-m6b-'));
  const profile = path.join(scratch, 'profile');
  const chromeProc = spawn(BROWSER_PATH, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', `--remote-debugging-port=${PORT_CDP}`,
    `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  const cleanup = () => {
    try { execFileSync('taskkill', ['/pid', String(chromeProc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  };
  process.on('exit', cleanup);

  try {
    let target = null;
    for (let i = 0; i < 40; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json`)).json();
        target = list.find((x) => x.type === 'page');
        if (target) break;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 100));
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let msgId = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message));
        else p.resolve(m.result);
      }
    };
    function cdp(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++msgId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    for (const d of ['Page', 'Runtime', 'DOM']) await cdp(`${d}.enable`);

    const ev = async (expr) => {
      const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return r.result?.value;
    };
    const click = async (sel) => {
      await ev(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({block:'center'})`);
      const box = await ev(`(()=>{ const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r && {x: r.x+r.width/2/2, y: r.y+r.height/2}; })()`);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...box });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...box });
    };

    console.log('Navigating to 3040...');
    await cdp('Page.navigate', { url: 'http://127.0.0.1:3040/' });
    await new Promise(r => setTimeout(r, 2000));

    const promptS0 = 'Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin.';
    await ev(`(()=>{
      const el = document.querySelector('[data-testid="guided-input"]');
      el.focus();
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (s) s.call(el, ${JSON.stringify(promptS0)}); else el.value = ${JSON.stringify(promptS0)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await click('[data-testid="guided-send-btn"]');
    await new Promise(r => setTimeout(r, 1500));

    await click('[data-testid="clarify-option-scope:group"]');
    await new Promise(r => setTimeout(r, 1000));

    await click('[data-testid="clarify-option-time:19:00"]');
    await new Promise(r => setTimeout(r, 1000));

    await click('[data-testid="confirm-yes-btn"]');
    await new Promise(r => setTimeout(r, 2000));

    const initialStops = await ev(`Array.from(document.querySelectorAll('[data-testid^="timeline-stop-card-"] h3')).map(h => h.innerText)`);
    console.log('Initial stops:', initialStops);

    await click('[data-testid="stop-replace-btn-0"]');
    await new Promise(r => setTimeout(r, 1500));

    // Click "Thay quán này"
    const hasThayBtn = await ev(`Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Thay quán này'))`);
    console.log('Has Thay quán này button:', hasThayBtn);

    if (hasThayBtn) {
      await ev(`(()=>{
        const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes('Thay quán này'));
        b?.click();
      })()`);
      await new Promise(r => setTimeout(r, 2500));

      const updatedStops = await ev(`Array.from(document.querySelectorAll('[data-testid^="timeline-stop-card-"] h3')).map(h => h.innerText)`);
      console.log('Updated stops after replacement:', updatedStops);

      const res = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync('docs/reports/functional-qa-20261018/m6_after_replacement_success.png', Buffer.from(res.data, 'base64'));
      console.log('Saved m6_after_replacement_success.png');
    }

    ws.close();
  } finally {
    cleanup();
  }
}
main().catch(console.error);
