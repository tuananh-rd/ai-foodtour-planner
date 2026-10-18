import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';

const PORT_CDP = 19700;
const BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function checkPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const free = await checkPortFree(PORT_CDP);
  if (!free) {
    throw new Error(`Port ${PORT_CDP} is not free!`);
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-env-'));
  const chromeProfile = path.join(scratch, 'profile');

  const chromeProc = spawn(BROWSER_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--remote-debugging-port=${PORT_CDP}`,
    `--user-data-dir=${chromeProfile}`,
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  const cleanup = () => {
    try {
      if (chromeProc.pid) {
        execFileSync('taskkill', ['/pid', String(chromeProc.pid), '/T', '/F'], { stdio: 'ignore' });
      }
    } catch (_) {}
    try {
      fs.rmSync(scratch, { recursive: true, force: true });
    } catch (_) {}
  };

  process.on('exit', cleanup);

  try {
    // Wait for CDP
    let target = null;
    for (let i = 0; i < 50; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json`)).json();
        target = list.find((x) => x.type === 'page');
        if (target) break;
      } catch (_) {}
      await pause(100);
    }
    if (!target) throw new Error('CDP target not found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let msgId = 0;
    const pending = new Map();
    const networkRequests = [];
    const consoleMessages = [];

    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Network.requestWillBeSent') {
        networkRequests.push({ url: m.params.request.url, method: m.params.request.method });
      }
      if (m.method === 'Network.responseReceived') {
        const req = networkRequests.find(r => r.url === m.params.response.url);
        if (req) {
          req.status = m.params.response.status;
        }
      }
      if (m.method === 'Runtime.consoleAPICalled') {
        consoleMessages.push(m.params.args.map(a => a.value || a.description).join(' '));
      }
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

    await cdp('Page.enable');
    await cdp('Network.enable');
    await cdp('Runtime.enable');
    await cdp('DOM.enable');

    async function inspectUrl(url, label) {
      console.log(`\n=== Inspecting ${label} (${url}) ===`);
      networkRequests.length = 0;
      consoleMessages.length = 0;

      await cdp('Page.navigate', { url });
      await pause(2500);

      const evalRes = await cdp('Runtime.evaluate', {
        expression: `(() => {
          return {
            title: document.title,
            hasGuidedContainer: !!document.querySelector('[data-testid="guided-container"]'),
            hasChatV2: !!document.querySelector('.chat-v2-container, [data-testid="chat-v2"]'),
            hasV1: !!document.querySelector('.app-container, [data-testid="classic-layout"]'),
            activeLayout: document.querySelector('[data-testid="guided-container"]') ? 'guided' : (document.querySelector('.chat-v2-container') ? 'chat-v2' : 'classic/v1'),
            bodyTextPreview: document.body.innerText.slice(0, 300),
            visibleButtons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean),
            inputs: Array.from(document.querySelectorAll('input, textarea')).map(i => ({ placeholder: i.placeholder, testid: i.getAttribute('data-testid') }))
          };
        })()`,
        returnByValue: true
      });

      console.log('DOM Evaluation:', JSON.stringify(evalRes.result?.value, null, 2));
      console.log('Network Requests:', JSON.stringify(networkRequests, null, 2));
      console.log('Console Messages:', JSON.stringify(consoleMessages, null, 2));
      return { dom: evalRes.result?.value, network: [...networkRequests], console: [...consoleMessages] };
    }

    const env3020 = await inspectUrl('http://127.0.0.1:3020', 'Frontend 3020 (Backend 8020 Private)');
    const env3040 = await inspectUrl('http://127.0.0.1:3040', 'Frontend 3040 (Backend 8040 Synthetic)');

    ws.close();
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('Check env failed:', err);
  process.exit(1);
});
