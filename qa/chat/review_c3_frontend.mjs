/** Run the author's suite with real-source mutations confined to its scratch copy. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[2] || 'diagnostics';
const original = path.join(root, 'qa/e2e/test_chat_v2.mjs');
let source = fs.readFileSync(original, 'utf8').replace('fileURLToPath(import.meta.url)', JSON.stringify(original));
source = source.replaceAll('i < 40; i++', 'i < 120; i++');
source = source.replace("{ stdio: 'ignore' }", "{ stdio: ['ignore','ignore','pipe'] }");
source = source.replace('    let wsUrl = null;', "    browserProc.stderr?.on('data', data => process.stderr.write(data)); browserProc.on('exit', (code,signal)=>console.log('Review browser exit',code,signal));\n    let wsUrl = null;");
// Bound lost CDP responses; the original runner has no timeout or close handler.
source = source.replace('return new Promise((res, rej) => pending.set(id, { res, rej }));', "return new Promise((res, rej) => {pending.set(id, { res, rej }); setTimeout(() => { if(pending.has(id)) { pending.delete(id); rej(new Error('CDP response timed out: '+method)); } }, 15000).unref();});");
const mutation = mode === 'allergy' ? `
  const p = path.join(scratchDir,'app/components/v2/chat/BlockRenderer.jsx');
  let s = fs.readFileSync(p,'utf8');
  if(!s.includes('{hasAllergyUnknown && (')) throw Error('mutation anchor missing');
  fs.writeFileSync(p,s.replace('{hasAllergyUnknown && (','{false && ('));
` : mode === 'fallback' ? `
  const p = path.join(scratchDir,'app/components/v2/chat/BlockRenderer.jsx');
  let s = fs.readFileSync(p,'utf8');
  if(!s.includes("cell.value || 'Chưa rõ'")) throw Error('mutation anchor missing');
  fs.writeFileSync(p,s.replace("cell.value || 'Chưa rõ'", "cell.value || ''"));
` : mode === 'guard' ? `
  for(const name of ['ChatV2Layout','ChatColumn','BlockRenderer','ShortlistColumn','ProfileBar','StartScreen']) {
    const p = path.join(scratchDir,'app/components/v2/chat/'+name+'.jsx');
    let s = fs.readFileSync(p,'utf8');
    s = s.replace('if (inFlight || busy) return;', '// in-flight guard deliberately removed');
    s = s.replace('if (busy || !val) return;', 'if (!val) return;');
    s = s.split('disabled={busy}').join('disabled={false}')
      .split('busy={busy || inFlight}').join('busy={false}');
    fs.writeFileSync(p,s);
  }
` : '';
const instrumentation = fs.readFileSync(path.join(root, 'qa/chat/review_c3_scratch.txt'),'utf8');
source = source.replace('    // 2. Build production in scratch directory', mutation + '\n' + (['diagnostics','prechange'].includes(mode) ? instrumentation : '') + '\n    // 2. Build production in scratch directory');
if (['diagnostics','prechange','perf'].includes(mode)) {
  const start = source.indexOf('    // Test 1: Start Screen rendering');
  const end = source.indexOf('\n  } finally {',start);
  source = source.slice(0,start) + fs.readFileSync(path.join(root,'qa/chat/review_c3_browser.txt'),'utf8') + source.slice(end);
}
if(mode === 'prechange') source = source.replace("const FAIL_BEFORE = process.argv.includes('--fail-before');", 'const FAIL_BEFORE = true;');
source = source.replace("    // 3. Start Next.js production server", `    fs.writeFileSync(${JSON.stringify(path.join(root,'docs/reports/C6_FRONTEND_'+mode+'_BUILD.json'))}, JSON.stringify({scratchDir,mode:${JSON.stringify(mode)}}));\n    // 3. Start Next.js production server`);
const generated = path.join(os.tmpdir(), 'c6-frontend-'+mode+'-'+Date.now()+'.mjs');
fs.writeFileSync(generated,source);
const result = spawnSync(process.execPath,[generated], {cwd:root, stdio:'inherit', timeout:240000,
  env:{...process.env,BROWSER:'C:/Program Files/Google/Chrome/Application/chrome.exe', C6_MODE:mode}});
if(result.error) console.error(result.error.message);
fs.unlinkSync(generated);
process.exit(result.status ?? 2);
