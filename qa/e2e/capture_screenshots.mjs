import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(os.tmpdir(), 'edge_cdp_profile_' + Date.now());

const edge = spawn(edgePath, [
  '--headless',
  '--remote-debugging-port=9222',
  `--user-data-dir=${userDataDir}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check'
]);

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  try {
    await sleep(2000);
    const verRes = await fetch('http://127.0.0.1:9222/json/version');
    const verData = await verRes.json();
    console.log('Edge CDP connected:', verData.Browser);

    const newRes = await fetch('http://127.0.0.1:9222/json/new?http://localhost:3300', { method: 'PUT' });
    const target = await newRes.json();

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 1;
    const pending = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const curId = id++;
        pending.set(curId, resolve);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    await new Promise(r => ws.onopen = r);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    async function evalScript(expr) {
      const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      return res.result?.value;
    }

    async function captureScreenshot(filepath) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(filepath, Buffer.from(res.result.data, 'base64'));
      console.log('Saved screenshot:', filepath);
    }

    // 1. Desktop 1280x900 setup
    console.log('Setting desktop 1280x900...');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Wait for initial load
    await sleep(2500);

    // Click "🚀 Lập lịch trình"
    console.log('Clicking "🚀 Lập lịch trình"...');
    const clickedPlan = await evalScript(`
      (() => {
        const planBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Lập lịch trình'));
        if (planBtn) {
          planBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log('Plan clicked:', clickedPlan);

    // Wait 4s for tour generation
    await sleep(4000);

    // Check stops
    const stopsCount = await evalScript(`
      (() => {
        const replaceBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Đổi quán'));
        return replaceBtns.length;
      })()
    `);
    console.log('Stops with replace button found:', stopsCount);

    // Click "Đổi quán" on stop 2
    console.log('Clicking "Đổi quán" on stop 2...');
    await evalScript(`
      (() => {
        const replaceBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Đổi quán'));
        if (replaceBtns.length > 1) {
          replaceBtns[1].click();
        } else if (replaceBtns.length > 0) {
          replaceBtns[0].click();
        }
      })()
    `);
    await sleep(1000);

    // Capture Desktop Replace Confirmation Modal
    await captureScreenshot('qa/screenshots/desktop-1280-replace-modal.png');

    // Click "Thay quán này" inside the modal
    console.log('Clicking "Thay quán này" in modal...');
    await evalScript(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Thay quán này'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);

    // Wait 4s for server replace response
    await sleep(4000);

    // Capture Desktop Server Diff Modal
    await captureScreenshot('qa/screenshots/desktop-1280-replace-diff.png');

    // Close modal
    console.log('Closing modal...');
    await evalScript(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const closeBtn = btns.find(b => b.textContent.includes('Hoàn tất') || b.getAttribute('aria-label') === 'Đóng');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(1000);

    // Switch to Map view
    console.log('Switching to Map view...');
    await evalScript(`
      (() => {
        const mapBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Bản đồ'));
        if (mapBtn) mapBtn.click();
      })()
    `);
    await sleep(1500);

    // Capture Desktop Map
    await captureScreenshot('qa/screenshots/desktop-1280-map.png');

    // 2. Mobile 390x844 setup
    console.log('Setting mobile 390x844...');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(1200);

    // Capture Mobile Map
    await captureScreenshot('qa/screenshots/mobile-390-map.png');

    // Switch to Timeline tab on mobile
    console.log('Switching to mobile timeline...');
    await evalScript(`
      (() => {
        const timelineBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Lịch trình'));
        if (timelineBtn) timelineBtn.click();
      })()
    `);
    await sleep(1000);

    // Open Replace Confirmation Modal on mobile
    console.log('Opening Replace Confirmation Modal on mobile...');
    await evalScript(`
      (() => {
        const replaceBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Đổi quán'));
        if (replaceBtns.length > 0) replaceBtns[0].click();
      })()
    `);
    await sleep(1000);

    // Capture Mobile Replace Modal
    await captureScreenshot('qa/screenshots/mobile-390-replace-modal.png');

    console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
    ws.close();
  } finally {
    edge.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

main().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
