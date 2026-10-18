import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

const PORT_CDP = 19700;
const BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPORT_DIR = path.resolve('docs/reports/functional-qa-20261018');

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

async function checkPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const free = await checkPortFree(PORT_CDP);
  if (!free) throw new Error(`Port ${PORT_CDP} is in use`);

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-bug003-'));
  const profile = path.join(scratch, 'profile');

  const chrome = spawn(BROWSER_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--remote-debugging-port=${PORT_CDP}`,
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  let ws = null;
  let msgId = 0;
  const pending = new Map();

  try {
    let target = null;
    for (let i = 0; i < 60; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json`)).json();
        target = list.find((x) => x.type === 'page');
        if (target) break;
      } catch (_) {}
      await pause(100);
    }
    if (!target) throw new Error('CDP target page not found');

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message));
        else p.resolve(m.result);
      }
    };

    const cdp = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++msgId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });

    const ev = async (expression) => {
      const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('UI evaluation failed: ' + r.exceptionDetails.text);
      return r.result.value;
    };

    for (const d of ['Page', 'Network', 'Runtime', 'DOM']) {
      await cdp(`${d}.enable`);
    }

    await cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1024,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log('Navigating to http://127.0.0.1:3050 ...');
    await cdp('Page.navigate', { url: 'http://127.0.0.1:3050/' });
    await pause(1500);

    await ev(`sessionStorage.clear(); localStorage.clear();`);
    await cdp('Page.reload');
    await pause(1500);

    const promptText = 'Tour ba quán quanh Hồ Gươm cho hai người, 90 phút, 500 nghìn cả nhóm';
    console.log(`Sending prompt: "${promptText}"`);

    await ev(`document.querySelector('[data-testid="guided-input"]')?.focus()`);
    await cdp('Input.insertText', { text: promptText });
    await pause(200);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });

    console.log('Waiting for UnderstoodCard...');
    for (let i = 0; i < 40; i++) {
      if (await ev(`!!document.querySelector('[data-testid="understood-card"]')`)) break;
      await pause(200);
    }

    // Click "Sửa" on budget row
    console.log('Opening inline budget editor...');
    const clickedEdit = await ev(`(() => {
      const row = document.querySelector('[data-testid="understood-row-budget"]');
      if (!row) return false;
      const btn = row.querySelector('button');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    console.log('Clicked edit budget:', clickedEdit);
    await pause(500);

    const hasCustomInput = await ev(`!!document.querySelector('[data-testid="inline-budget-custom"]')`);
    console.log('Has custom budget input field:', hasCustomInput);

    // Test Invalid Input
    console.log('Testing invalid custom budget...');
    await ev(`document.querySelector('[data-testid="inline-budget-custom"]').focus()`);
    await cdp('Input.insertText', { text: 'abc' });
    await pause(200);
    await ev(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const saveBtn = btns.find(b => b.innerText.includes('Lưu') || b.innerText.includes('Xong'));
      if (saveBtn) saveBtn.click();
    })()`);
    await pause(500);

    const invalidError = await ev(`document.querySelector('[data-testid="inline-budget-error"]')?.innerText`);
    console.log('Validation error message:', invalidError);

    let shot = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(REPORT_DIR, 'bug003_custom_budget_invalid.png'), Buffer.from(shot.data, 'base64'));

    // Test Valid Input: 350000
    console.log('Testing valid custom budget 350000...');
    await ev(`(() => {
      const inp = document.querySelector('[data-testid="inline-budget-custom"]');
      inp.value = '';
      inp.focus();
    })()`);
    await cdp('Input.insertText', { text: '350000' });
    await pause(200);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });

    console.log('Waiting for updated UnderstoodCard...');
    await pause(2000);

    const updatedBudgetText = await ev(`(() => {
      const row = document.querySelector('[data-testid="understood-row-budget"]');
      return row ? row.innerText : '';
    })()`);
    console.log('Updated budget row text:', updatedBudgetText);

    shot = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(REPORT_DIR, 'bug003_custom_budget_saved.png'), Buffer.from(shot.data, 'base64'));

    // Verify backend profile
    const sessionId = await ev(`sessionStorage.getItem('foodtour_chat_session_id')`);
    const sessionToken = await ev(`sessionStorage.getItem('foodtour_chat_session_token')`);
    const backendSession = await (await fetch(`http://127.0.0.1:8050/v1/sessions/${sessionId}`, {
      headers: { 'X-Session-Token': sessionToken }
    })).json();

    const backendBudgetValue = backendSession.chat?.profile?.budget?.value;
    console.log('Backend budget value:', backendBudgetValue);

    const pass = hasCustomInput && (invalidError && invalidError.includes('100.000.000')) && updatedBudgetText.includes('350.000') && backendBudgetValue === 350000;

    const result = {
      timestamp: new Date().toISOString(),
      scenario: 'BUG-003 Inline Budget Custom Numeric Input',
      hasCustomInput,
      invalidError,
      updatedBudgetText,
      backendBudgetValue,
      outcome: pass ? 'PASS (BUG-003 FIXED)' : 'FAIL'
    };

    fs.writeFileSync(path.join(REPORT_DIR, 'bug003_custom_budget.json'), JSON.stringify(result, null, 2));
    console.log('Result:', result.outcome);

  } finally {
    if (ws) ws.close();
    if (chrome.pid) {
      try {
        chrome.kill('SIGKILL');
      } catch (_) {}
    }
  }
}

run().catch(err => {
  console.error('Fatal error in BUG-003 test:', err);
  process.exit(1);
});
