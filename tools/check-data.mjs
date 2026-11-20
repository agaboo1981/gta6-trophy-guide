import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'app', 'data', 'trophies.json'), 'utf8'));
const snapshot = JSON.parse(readFileSync(join(root, 'docs', 'official-snapshot.json'), 'utf8'));
const loaded = await import(join(root, 'app', 'data', 'trophies.js'));

const errors = [];
const fail = (msg) => errors.push(msg);
const rows = data.trophies;

if (rows.length !== 55) fail(`expected 55 trophies, found ${rows.length}`);
if (snapshot.trophies.length !== 55) fail('official snapshot must contain 55 rows');

const grades = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
const ids = new Set();
const names = new Set();

rows.forEach((t, i) => {
  const where = `trophy ${t.id ?? i}`;
  if (!Number.isInteger(t.id) || ids.has(t.id)) fail(`${where}: id missing or repeated`);
  ids.add(t.id);
  if (typeof t.name !== 'string' || !t.name.trim()) fail(`${where}: blank official name`);
  if (names.has(t.name)) fail(`${where}: repeated name`);
  names.add(t.name);
  if (typeof t.description !== 'string' || !t.description.trim()) fail(`${where}: blank official description`);
  if (!Object.hasOwn(grades, t.grade)) fail(`${where}: invalid grade ${t.grade}`);
  else grades[t.grade]++;
  if (!Number.isInteger(t.stage) || !data.stages.some((s) => s.id === t.stage)) fail(`${where}: stage does not map to a lane`);
  if (!['story', 'collectible', 'activity', 'online'].includes(t.kind)) fail(`${where}: invalid kind ${t.kind}`);
  if (typeof t.hidden !== 'boolean') fail(`${where}: hidden must be boolean`);
  if (!['confirmed', 'possible', 'watch', 'none'].includes(t.missable)) fail(`${where}: invalid missable status ${t.missable}`);
  if (t.missable !== 'none') {
    if (!t.window || !t.window.locks || !t.window.save) fail(`${where}: missable needs a lock window and save advice`);
  }
  if (typeof t.guide !== 'string' || t.guide.trim().length < 80) fail(`${where}: guide is too short`);
  if (t.guide.trim() === t.description.trim()) fail(`${where}: guide restates the description only`);
  if (!Array.isArray(t.steps) || t.steps.length === 0) fail(`${where}: no steps`);
  for (const [k, step] of (t.steps || []).entries()) {
    if (typeof step.text !== 'string' || step.text.trim().length < 12) fail(`${where} step ${k + 1}: blank or too short`);
    if (!Array.isArray(step.cites) || step.cites.length === 0) fail(`${where} step ${k + 1}: no citation`);
    for (const c of step.cites || []) if (!data.sources[c]) fail(`${where} step ${k + 1}: citation [${c}] is not in the ledger`);
  }
  if (!Array.isArray(t.refs) || t.refs.length === 0) fail(`${where}: refs is empty`);
  if (t.count) {
    if (!(t.count.target > 0) || typeof t.count.unit !== 'string' || !t.count.unit.trim()) fail(`${where}: invalid count target`);
  }
});

const expectedGrades = { platinum: 1, gold: 2, silver: 6, bronze: 46 };
for (const [g, n] of Object.entries(expectedGrades)) {
  if (grades[g] !== n) fail(`grade ${g} is ${grades[g]}, expected ${n}`);
}

snapshot.trophies.forEach((s, i) => {
  const t = rows.find((x) => x.id === s.id);
  if (!t) return fail(`snapshot id ${s.id} is missing from the live data`);
  if (t.name !== s.name) fail(`official name changed for id ${s.id}`);
  if (t.description !== s.description) fail(`official description changed for id ${s.id}`);
  if (t.grade !== s.grade) fail(`official grade changed for id ${s.id}`);
});

const hidden = rows.filter((t) => t.hidden).length;
if (hidden !== 28) fail(`hidden flags cover ${hidden} trophies, expected 28`);
const sourceCount = Object.keys(data.sources).length;
if (sourceCount < 7) fail(`only ${sourceCount} sources in the ledger, expected at least 7`);
for (const [key, s] of Object.entries(data.sources)) {
  if (!s.name || !s.read) fail(`source [${key}] needs a name and read date`);
  if (key !== '3' && !/^https?:\/\//.test(s.url || '')) fail(`source [${key}] needs a public URL`);
}
const conflicts = rows.filter((t) => t.conflict).length;
const unconfirmed = rows.filter((t) => t.unconfirmed).length;
if (conflicts < 2) fail(`expected at least 2 disagreement notes, found ${conflicts}`);
if (unconfirmed < 2) fail(`expected at least 2 unconfirmed notes, found ${unconfirmed}`);

if (data.stages.length !== 9) fail(`expected 9 roadmap lanes, found ${data.stages.length}`);
const laneIds = data.stages.flatMap((s) => s.trophies);
if (laneIds.length !== 55 || new Set(laneIds).size !== 55) fail('roadmap lanes must include every trophy exactly once');
for (const s of data.stages) {
  if (!s.numeral || !s.name || !s.window || !s.why || !s.save) fail(`lane ${s.id}: missing numeral, name, window, why or save advice`);
  for (const id of s.trophies) if (!ids.has(id)) fail(`lane ${s.id}: unknown trophy id ${id}`);
}

const jsonSteps = rows.reduce((n, t) => n + t.steps.length, 0);
const jsTrophies = loaded.trophies;
const jsonShape = JSON.stringify(rows);
const jsShape = JSON.stringify(jsTrophies);
if (jsonShape !== jsShape) fail('app/data/trophies.js is out of sync with trophies.json; run node tools/build-data.mjs');
if (JSON.stringify(data.sources) !== JSON.stringify(loaded.sources)) fail('source ledger differs between JSON and JS');
if (JSON.stringify(data.stages) !== JSON.stringify(loaded.stages)) fail('roadmap differs between JSON and JS');

if (errors.length) {
  console.error(`check-data: ${errors.length} problem${errors.length === 1 ? '' : 's'}`);
  for (const e of errors.slice(0, 40)) console.error('  - ' + e);
  process.exit(1);
}

console.log(
  `check-data OK: 55 official trophies · 1P 2G 6S 46B · ${hidden} hidden · ` +
    `${rows.filter((t) => t.missable !== 'none').length} missables (${['confirmed','possible','watch'].map((s) => `${rows.filter((t) => t.missable === s).length} ${s}`).join(' / ')}) · ` +
    `${sourceCount} sources · ${jsonSteps} cited steps · ${conflicts} disagreements · ${unconfirmed} unconfirmed`,
);
