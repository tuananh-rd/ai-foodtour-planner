const fs = require('fs');
const path = require('path');

// Comprehensive Unicode Emoji pattern using modern Unicode property escapes
// Exclude ordinary text/ASCII/digits, strictly detect emoji code points, flags, modifiers, keycaps
const strictEmojiRegex = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\u2600-\u26ff]|[\u2700-\u27bf]|[\u231a\u231b\u23e9-\u23ec\u23f0\u23f3]|[\u2b50\u2b55]|\u20e3|\u200d|\ufe0f)/u;

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.next' || file === '.git') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, fileList);
    } else if (/\.(jsx?|tsx?|css|html|json)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const targetDirs = ['frontend/app', 'frontend/lib', 'frontend/public'];
let allFiles = [];
for (const d of targetDirs) {
  if (fs.existsSync(d)) {
    allFiles = allFiles.concat(walk(d));
  }
}

const fileMap = {};
for (const f of allFiles) {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (strictEmojiRegex.test(line)) {
      const matches = line.match(new RegExp(strictEmojiRegex.source, 'gu')) || [];
      const rel = f.replace(/\\/g, '/');
      if (!fileMap[rel]) fileMap[rel] = [];
      fileMap[rel].push({ line: idx + 1, matches, text: line.trim() });
    }
  });
}

console.log('=== FILES WITH EMOJIS ===');
for (const [file, entries] of Object.entries(fileMap)) {
  console.log(`- ${file}: ${entries.length} lines`);
}
fs.writeFileSync('qa/discovery-assistant/emoji_audit_summary.json', JSON.stringify(fileMap, null, 2));
