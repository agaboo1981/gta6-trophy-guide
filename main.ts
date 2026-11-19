import { cpSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath as toPath } from 'node:url';
import {
  buildDossier,
  cssReferences,
  dynamicImports,
  htmlFacts,
  isJavaScriptType,
  isLocalRef,
  resolveAppPath,
  sourceImports,
} from './vendor/makefun-frontend.ts';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
};

const MAX_INDEX_BYTES = 1024 * 1024;
const MAX_TROPHY_BYTES = 2 * 1024 * 1024;
const MAX_APP_PATH_BYTES = 1000;
const MIN_SCREENSHOTS = 3;
const MAX_IMAGE_SIDE = 1280;
const MIN_IMAGE_SIDE = 480;
const PLATFORM_MAX_ENTRIES = 1000;
const PLATFORM_MAX_BYTES = 64 * 1024 * 1024;
const DOSSIER_BUDGET = 1536 * 1024;
const EXPECTED_GRADES = { platinum: 1, gold: 2, silver: 6, bronze: 46 };

const SCREENSHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const LOADING_RELS = new Set([
  'stylesheet',
  'modulepreload',
  'preload',
  'prefetch',
  'icon',
  'apple-touch-icon',
  'mask-icon',
  'manifest',
]);
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_END = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

function abort(issues) {
  if (issues.length === 0) return;
  console.error(`Entry audit failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues.slice(0, 24)) console.error(`  - ${issue}`);
  if (issues.length > 24) console.error(`  - ...and ${issues.length - 24} more`);
  process.exit(1);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inside(child, parent) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function walkPlain(base, label, issues) {
  const files = new Map();
  const directories = new Set();
  let entries = 0;
  let bytes = 0;

  const visit = (rel) => {
    const here = rel === '' ? base : join(base, rel);
    let listed;
    try {
      listed = readdirSync(here, { withFileTypes: true });
    } catch (err) {
      issues.push(`${label}${rel === '' ? '' : `/${rel}`}: cannot list directory (${err.message})`);
      return;
    }
    for (const item of listed) {
      const path = rel === '' ? item.name : `${rel}/${item.name}`;
      if (Buffer.byteLength(path, 'utf8') > MAX_APP_PATH_BYTES) {
        issues.push(`${label}/${path}: path is over ${MAX_APP_PATH_BYTES} UTF-8 bytes`);
      }
      entries++;
      const full = join(base, path);
      let st;
      try {
        st = lstatSync(full);
      } catch (err) {
        issues.push(`${label}/${path}: cannot stat (${err.message})`);
        continue;
      }
      if (st.isDirectory()) {
        directories.add(path);
        visit(path);
      } else if (st.isFile()) {
        bytes += st.size;
        files.set(path, st.size);
      } else {
        issues.push(`${label}/${path}: not a plain file or directory`);
      }
    }
  };

  visit('');
  return { files, directories, entries, bytes };
}

function readAppText(root, rel) {
  return readFileSync(join(root, 'app', rel), 'utf8');
}

function checkTrophyData(root, app, issues) {
  const rel = 'data/trophies.json';
  if (!app.files.has(rel)) {
    issues.push(`app/${rel}: required trophy data is missing`);
    return [];
  }
  const trophyBytes = app.files.get(rel);
  if (trophyBytes > MAX_TROPHY_BYTES) {
    issues.push(`app/${rel}: over ${MAX_TROPHY_BYTES} bytes`);
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(readAppText(root, rel));
  } catch (err) {
    issues.push(`app/${rel}: not valid UTF-8 JSON (${err.message})`);
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.trophies)
      ? parsed.trophies
      : null;
  if (list === null) {
    issues.push(`app/${rel}: expected a "trophies" array or an array of trophies`);
    return [];
  }
  if (list.length !== 55) issues.push(`app/${rel}: ${list.length} trophies, expected 55`);

  const grades = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  const ids = new Set();
  const names = [];
  list.forEach((raw, index) => {
    const where = `app/${rel} item ${index}`;
    if (!isRecord(raw)) {
      issues.push(`${where}: not an object`);
      return;
    }
    if (typeof raw.name !== 'string' || raw.name.trim() === '') {
      issues.push(`${where}: no official name`);
    } else {
      names.push(raw.name);
    }
    if (typeof raw.description !== 'string' || raw.description.trim() === '') {
      issues.push(`${where}: no official description`);
    }
    if (typeof raw.grade !== 'string' || !Object.hasOwn(grades, raw.grade)) {
      issues.push(`${where}: grade is not platinum, gold, silver or bronze`);
    } else {
      grades[raw.grade]++;
    }
    if (typeof raw.guide !== 'string' || raw.guide.trim() === '') {
      issues.push(`${where}: blank guide`);
    }
    if (!Array.isArray(raw.refs) || raw.refs.length === 0) {
      issues.push(`${where}: guide cites no source`);
    }
    if (!Number.isInteger(raw.id) || ids.has(raw.id)) {
      issues.push(`${where}: missing or repeated trophy id`);
    } else {
      ids.add(raw.id);
    }
  });

  for (const [grade, expected] of Object.entries(EXPECTED_GRADES)) {
    if (grades[grade] !== expected) {
      issues.push(`app/${rel}: ${grade} count is ${grades[grade]}, expected ${expected}`);
    }
  }
  return names;
}

function checkRuntimeModule(root, app, names, issues) {
  const rel = 'data/trophies.js';
  if (!app.files.has(rel)) {
    issues.push(`app/${rel}: module loaded by the page is missing`);
    return;
  }
  const module = readAppText(root, rel);
  if (!/\bexport\s+const\s+trophies\b/.test(module)) {
    issues.push(`app/${rel}: does not export trophies`);
  }
  for (const name of names) {
    if (!module.includes(JSON.stringify(name))) {
      issues.push(`app/${rel}: trophy ${JSON.stringify(name)} is absent from the data the page loads`);
    }
  }
  const page = readAppText(root, 'app.js');
  if (!page.includes('./data/trophies.js')) {
    issues.push('app/app.js: does not import the trophy data module');
  }
}

function auditRefs(root, app, issues) {
  const html = htmlFacts(readAppText(root, 'index.html'));
  for (const base of html.bases) {
    if (!isLocalRef(base)) issues.push(`app/index.html: base href is not local: ${base}`);
  }

  const checkRef = (from, ref, kind, allowData) => {
    if (allowData && ref.toLowerCase().startsWith('data:')) return;
    if (!isLocalRef(ref)) {
      issues.push(`app/${from}: ${kind} is not local: ${ref}`);
      return;
    }
    const target = resolveAppPath(ref, from);
    if (target === null || target === '' || !app.files.has(target)) {
      issues.push(`app/${from}: ${kind} names no file in app/: ${ref}`);
    }
  };

  for (const script of html.scripts) {
    if (script.src === null) {
      for (const spec of [...sourceImports(script.text), ...dynamicImports(script.text)]) {
        if (spec !== null) checkRef('index.html', spec, 'inline script import', false);
      }
      continue;
    }
    if (!isJavaScriptType(script.type)) continue;
    checkRef('index.html', script.src, 'script src', false);
    const target = resolveAppPath(script.src, 'index.html');
    if (target !== null && !/\.(js|mjs)$/i.test(target)) {
      issues.push(`app/index.html: script src is not a JavaScript file: ${script.src}`);
    }
  }

  for (const link of html.links) {
    if (!link.rel.split(/\s+/).some((token) => LOADING_RELS.has(token))) continue;
    checkRef('index.html', link.href, 'link href', link.rel.includes('icon'));
  }
  for (const resource of html.resources) {
    checkRef('index.html', resource.src, `${resource.tag} src`, true);
  }
  for (const style of html.styles) {
    for (const css of cssReferences(style)) {
      checkRef('index.html', css.ref, `inline style ${css.kind}`, css.kind !== 'import');
    }
  }

  for (const path of app.files.keys()) {
    if (/\.(js|mjs)$/i.test(path)) {
      const source = readAppText(root, path);
      for (const spec of [...sourceImports(source), ...dynamicImports(source)]) {
        if (spec !== null) checkRef(path, spec, 'module import', false);
      }
    } else if (/\.css$/i.test(path)) {
      for (const css of cssReferences(readAppText(root, path))) {
        checkRef(path, css.ref, `CSS ${css.kind}`, css.kind !== 'import');
      }
    }
  }
}

function pngSize(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_MAGIC) || !bytes.subarray(-8).equals(PNG_END)) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegSize(bytes) {
  if (bytes.length < 8 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    while (bytes[i] === 0xff && i < bytes.length) i++;
    const marker = bytes[i++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(i);
    if (length < 2 || i + length > bytes.length) break;
    if (SOF_MARKERS.has(marker)) {
      if (length < 8) break;
      return { width: bytes.readUInt16BE(i + 5), height: bytes.readUInt16BE(i + 3) };
    }
    i += length;
  }
  return null;
}

function auditScreenshots(root, issues) {
  const dir = join(root, 'screenshots');
  let st;
  try {
    st = lstatSync(dir);
  } catch {
    issues.push('screenshots/: required directory is missing');
    return { names: [], bytes: 0 };
  }
  if (!st.isDirectory()) {
    issues.push('screenshots/: not a directory');
    return { names: [], bytes: 0 };
  }

  const names = [];
  let total = 0;
  let listed;
  try {
    listed = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    issues.push(`screenshots/: cannot list directory (${err.message})`);
    return { names: [], bytes: 0 };
  }
  for (const item of listed) {
    if (item.name.startsWith('.')) continue;
    if (!item.isFile()) {
      issues.push(`screenshots/${item.name}: not a regular file`);
      continue;
    }
    names.push(item.name);
    const full = join(dir, item.name);
    let shotStat;
    try {
      shotStat = lstatSync(full);
    } catch (err) {
      issues.push(`screenshots/${item.name}: cannot stat (${err.message})`);
      continue;
    }
    total += shotStat.size;
    if (!SCREENSHOT_NAME.test(item.name)) {
      issues.push(`screenshots/${item.name}: name is not 1 to 128 of letters, digits, dot, underscore or dash`);
    }
    if (shotStat.size > CAPS.screenshots.max_bytes) {
      issues.push(`screenshots/${item.name}: ${shotStat.size} bytes, over ${CAPS.screenshots.max_bytes}`);
      continue;
    }
    const bytes = readFileSync(full);
    const size = pngSize(bytes) ?? jpegSize(bytes);
    if (size === null) {
      issues.push(`screenshots/${item.name}: not a whole PNG or JPEG`);
      continue;
    }
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    if (long > MAX_IMAGE_SIDE) issues.push(`screenshots/${item.name}: long side ${long} is over ${MAX_IMAGE_SIDE}`);
    if (short < MIN_IMAGE_SIDE) issues.push(`screenshots/${item.name}: short side ${short} is under ${MIN_IMAGE_SIDE}`);
  }

  names.sort();
  if (names.length < MIN_SCREENSHOTS || names.length > CAPS.screenshots.max) {
    issues.push(`screenshots/: ${names.length} images, expected ${MIN_SCREENSHOTS} to ${CAPS.screenshots.max}`);
  }
  return { names, bytes: total };
}

function audit(root) {
  const issues = [];
  const app = walkPlain(join(root, 'app'), 'app', issues);
  if (app.entries > CAPS.app_max_files) {
    issues.push(`app/: ${app.entries} entries, over ${CAPS.app_max_files}`);
  }
  if (app.bytes > CAPS.app_max_bytes) {
    issues.push(`app/: ${app.bytes} bytes, over ${CAPS.app_max_bytes}`);
  }

  if (!app.files.has('index.html')) {
    issues.push('app/index.html: required page is missing');
  } else if (app.files.get('index.html') > MAX_INDEX_BYTES) {
    issues.push(`app/index.html: over ${MAX_INDEX_BYTES} bytes`);
  }
  if (!app.files.has('app.js')) issues.push('app/app.js: required module is missing');
  if (!app.files.has('data/trophies.json')) issues.push('app/data/trophies.json: required trophy data is missing');
  if (issues.filter((issue) => issue.includes('required')).length === 0) {
    const names = checkTrophyData(root, app, issues);
    checkRuntimeModule(root, app, names, issues);
    auditRefs(root, app, issues);
  }
  const shots = auditScreenshots(root, issues);
  if (app.entries + shots.names.length + 1 > PLATFORM_MAX_ENTRIES) {
    issues.push('output: app/, screenshots/ and dossier.json would pass 1000 entries');
  }
  if (app.bytes + shots.bytes + DOSSIER_BUDGET > PLATFORM_MAX_BYTES) {
    issues.push('output: app/, screenshots/ and dossier.json would pass 64 MiB');
  }
  return { app, shots, issues };
}

const repo = resolve(toPath(new URL('.', import.meta.url)));
const destination = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

if (inside(repo, destination)) {
  abort(['output directory contains the source repository; refusing to clear it']);
}
if (inside(destination, join(repo, 'app')) || inside(destination, join(repo, 'screenshots'))) {
  abort(['output must not sit inside app/ or screenshots/']);
}

const source = audit(repo);
abort(source.issues);

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(join(repo, 'app'), join(destination, 'app'), { recursive: true, dereference: false });
cpSync(join(repo, 'screenshots'), join(destination, 'screenshots'), { recursive: true, dereference: false });

const copied = audit(destination);
abort(copied.issues);

const dossier = buildDossier(destination, CAPS);
writeFileSync(join(destination, 'dossier.json'), dossier);
console.log(
  `Build OK: ${copied.app.entries} app entries (${copied.app.bytes} bytes), ` +
    `${copied.shots.names.length} screenshots (${copied.shots.bytes} bytes), ` +
    `dossier.json ${dossier.length} bytes.`,
);
