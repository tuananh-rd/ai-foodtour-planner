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

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-bug009-'));
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
      if (r.exceptionDetails) throw new Error('UI evaluation failed');
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

    // Clear session storage for a guaranteed clean session
    await ev(`sessionStorage.clear(); localStorage.clear();`);
    await cdp('Page.reload');
    await pause(1500);

    const promptText = 'Tour ba quán quanh Hồ Gươm cho hai người, một tiếng rưỡi, năm trăm nghìn cả hội, mỗi chặng đi bộ tối đa mười phút';
    console.log(`Sending prompt: "${promptText}"`);

    await ev(`document.querySelector('[data-testid="guided-input"]')?.focus()`);
    await cdp('Input.insertText', { text: promptText });
    await pause(200);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });

    console.log('Waiting for response...');
    await pause(2500);

    // Take screenshot
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(REPORT_DIR, 'bug009_written_leg_3050.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved bug009_written_leg_3050.png');

    // UI UnderstoodCard inspections
    const uiInspection = await ev(`(() => {
      const card = document.querySelector('[data-testid="understood-card"]');
      const text = document.body.innerText;
      const rows = Array.from(document.querySelectorAll('[data-testid^="understood-row-"], .understood-item')).map(r => r.innerText.trim());
      const hasLegTime = text.includes('chặng') || text.includes('10 phút') || text.includes('mười phút');
      const hasUnderstood = !!card;
      return { hasUnderstood, rows, hasLegTime, fullTextSnippet: text.slice(0, 500) };
    })()`);

    console.log('UI Inspection:', uiInspection);

    // Backend state inspection
    const sessionId = await ev(`sessionStorage.getItem('foodtour_chat_session_id')`);
    const sessionToken = await ev(`sessionStorage.getItem('foodtour_chat_session_token')`);
    console.log('Session ID:', sessionId);

    let backendInspection = null;
    if (sessionId) {
      const res = await fetch(`http://127.0.0.1:8050/v1/sessions/${sessionId}`, {
        headers: { 'X-Session-Token': sessionToken }
      });
      backendInspection = await res.json();
    }

    const durationMin = backendInspection?.chat?.profile?.duration_min;
    const maxLegMin = backendInspection?.chat?.profile?.max_leg_min;
    const unparsedSlots = backendInspection?.chat?.unparsed_slots || [];
    const pendingIntent = backendInspection?.chat?.pending;

    console.log('Backend Profile Inspection:');
    console.log('  duration_min:', durationMin);
    console.log('  max_leg_min:', maxLegMin);
    console.log('  unparsed_slots:', unparsedSlots);
    console.log('  pending:', pendingIntent);

    const isMaxLegOmitted = !maxLegMin || maxLegMin.value === null;
    const isUnparsedOmitted = !unparsedSlots.includes('max_leg_min');

    const result = {
      timestamp: new Date().toISOString(),
      scenario: 'BUG-009 Written Per-Leg Walking Limit (mười phút)',
      url: 'http://127.0.0.1:3050',
      prompt: promptText,
      ui_has_understood_card: uiInspection.hasUnderstood,
      ui_rows: uiInspection.rows,
      ui_mentions_leg_time: uiInspection.hasLegTime,
      backend: {
        duration_min: durationMin,
        max_leg_min: maxLegMin,
        unparsed_slots: unparsedSlots,
        pending: pendingIntent
      },
      outcome: (isMaxLegOmitted && isUnparsedOmitted) ? 'FAIL (BUG-009 CONFIRMED)' : 'PASS',
      bug_analysis: {
        bug_id: 'BUG-009',
        severity: 'P1',
        description: 'Written Vietnamese walking per-leg limit ("mỗi chặng đi bộ tối đa mười phút") is silently omitted by the parser on current 3050/8050 build. max_leg_min is neither extracted into profile nor added to unparsed_slots.',
        reproduced: (isMaxLegOmitted && isUnparsedOmitted)
      }
    };

    fs.writeFileSync(path.join(REPORT_DIR, 'bug009_written_leg.json'), JSON.stringify(result, null, 2));
    console.log('Wrote bug009_written_leg.json');
    console.log('Outcome:', result.outcome);

  } finally {
    if (ws) ws.close();
    if (chrome.pid) {
      try {
        chrome.kill('SIGKILL');
      } catch (_) {}
    }
  }
}

run().catch((err) => {
  console.error('Fatal error in BUG-009 test:', err);
  process.exit(1);
});
