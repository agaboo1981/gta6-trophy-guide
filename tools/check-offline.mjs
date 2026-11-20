import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
const problems = [];

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const files = walk(app);
for (const full of files) {
  const rel = relative(root, full);
  const text = readFileSync(full, 'utf8');
  if (/\.html$/i.test(full)) {
    for (const m of text.matchAll(/<(script|link|img|source|iframe)\b[^>]*>/gi)) {
      const tag = m[0];
      const attr = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(tag);
      if (!attr) continue;
      const ref = attr[1];
      if (/^(https?:)?\/\//i.test(ref)) problems.push(`${rel}: external ${m[1]} reference ${ref}`);
      if (/@import/i.test(tag)) problems.push(`${rel}: @import inside tag`);
    }
    for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+["']/gi)) {
      problems.push(`${rel}: network URL ${m[0]}`);
    }
  }
  if (/\.css$/i.test(full)) {
    for (const m of text.matchAll(/@import\s+(?:url\()?["']?([^"')\s;]+)/gi)) {
      if (!/^data:/i.test(m[1]) && !m[1].startsWith('#')) problems.push(`${rel}: CSS @import ${m[1]}`);
    }
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      const ref = m[1].trim();
      if (/^(https?:)?\/\//i.test(ref)) problems.push(`${rel}: external CSS url(${ref})`);
    }
  }
  if (/\.(js|mjs)$/i.test(full)) {
    for (const m of text.matchAll(/\bimport\s*(?:\([^)]*\)|\s+[^;]*?from\s*)["']([^"']+)["']/gi)) {
      if (/^(https?:)?\/\//i.test(m[1])) problems.push(`${rel}: external module import ${m[1]}`);
    }
    const forbidden = [
      ['fetch(', 'fetch call'],
      ['XMLHttpRequest', 'XMLHttpRequest'],
      ['WebSocket', 'WebSocket'],
      ['EventSource', 'EventSource'],
      ['serviceWorker', 'service worker'],
      ['document.cookie', 'cookie access'],
      ['eval(', 'eval'],
      ['new Function', 'new Function'],
    ];
    for (const [needle, label] of forbidden) {
      if (text.includes(needle)) problems.push(`${rel}: ${label}`);
    }
  }
}

if (problems.length) {
  console.error(`check-offline: ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`check-offline OK: ${files.length} app files, no network refs, fetch, cookie, service worker, eval or new Function`);
