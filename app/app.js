import { meta, sources, stages, trophies } from './data/trophies.js';

const KEY = 'tideline55.v2';
const VIEWS = ['checklist', 'roadmap', 'missables', 'sources', 'guide'];
const TOTAL = trophies.length;
const byId = new Map(trophies.map((t) => [t.id, t]));
const stageById = new Map(stages.map((s) => [s.id, s]));
const stageOrder = new Map(stages.map((s, i) => [s.id, i]));
const gradeOrder = ['platinum', 'gold', 'silver', 'bronze'];

const params = new URLSearchParams(location.search);
const hashView = location.hash.replace(/^#/, '');

const KINDS = [
  { key: 'all', label: 'All' },
  { key: 'story', label: 'Story' },
  { key: 'missable', label: 'Missable' },
  { key: 'collectible', label: 'Collectibles' },
  { key: 'activity', label: 'Activities' },
];

const KIND_LABEL = { story: 'Story', collectible: 'Collectible', activity: 'Activity', online: 'Online' };
const STATUS_LABEL = { confirmed: 'Confirmed missable', possible: 'Possible missable', watch: 'Watch', none: '' };

function readURL(name, allowed, fallback) {
  const value = params.get(name);
  return allowed.includes(value) ? value : fallback;
}

let kind = readURL('kind', KINDS.map((k) => k.key), 'all');
let grade = readURL('grade', ['all', ...gradeOrder], 'all');
let spoiler = params.get('spoiler') === '1';
let view = readURL('view', VIEWS, VIEWS.includes(hashView) ? hashView : 'checklist');
let query = params.get('q') || '';
let selected = Number.parseInt(params.get('t') || '', 10);
if (!Number.isInteger(selected) || !byId.has(selected)) selected = 22;

let storageBlocked = false;
const stored = loadStored();
let earned = new Set();
let counts = {};

earned = stored.earned;
counts = stored.counts;
storageBlocked = stored.blocked;

function loadStored() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { earned: new Set(), counts: {}, blocked: false };
    const parsed = JSON.parse(raw);
    const known = new Set(trophies.map((t) => t.id));
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.earned) ? parsed.earned : [];
    const earnedSet = new Set(
      list
        .map((item) => (typeof item === 'number' ? item : byId.get(Number(item)) ? Number(item) : navigateName(item)))
        .filter((id) => known.has(id)),
    );
    const countMap = {};
    if (parsed && typeof parsed.counts === 'object' && parsed.counts !== null) {
      for (const t of trophies) {
        if (!t.count) continue;
        const value = Number(parsed.counts[t.id]);
        if (Number.isFinite(value) && value > 0) countMap[t.id] = Math.min(t.count.target, Math.floor(value));
      }
    }
    return { earned: earnedSet, counts: countMap, blocked: false };
  } catch (e) {
    return { earned: new Set(), counts: {}, blocked: true };
  }
}

function navigateName(value) {
  const found = trophies.find((t) => t.name === value);
  return found ? found.id : -1;
}

function $(id) {
  return document.getElementById(id);
}

const els = {
  rows: $('rows'),
  detail: $('detail'),
  sourcerail: $('sourcerail'),
  chips: $('kindchips'),
  grade: $('grade'),
  search: $('search'),
  spoiler: $('spoilerToggle'),
  spoilerState: $('spoilerState'),
  progress: $('progress'),
  gradecounts: $('gradecounts'),
  sounder: $('sounder'),
  saved: $('saved'),
  evidence: $('evidence-strip'),
  listcount: $('listcount'),
  nextup: $('nextup'),
  tide: $('tide-table'),
  missables: $('missable-flags'),
  sources: $('source-ledger'),
  missablesView: $('missables-view'),
  missableTabCount: $('missableTabCount'),
  spread: $('guide-spread'),
  shieldbanner: $('shieldbanner'),
  toast: $('toast'),
};

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function gradeLetter(g) {
  return { platinum: 'P', gold: 'G', silver: 'S', bronze: 'B' }[g] || '?';
}

function gradeTitle(g) {
  return g.charAt(0).toUpperCase() + g.slice(1);
}

function stageFor(t) {
  return stageById.get(t.stage);
}

function stageLabel(t) {
  const s = stageFor(t);
  return s ? `Lane ${s.numeral} · ${s.name}` : 'Lane';
}

function dateLabel(iso) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${months[m - 1]} ${y}`;
}

function sourceName(n) {
  return sources[n] ? sources[n].name : `Source ${n}`;
}

function sourceLabel(n) {
  const s = sources[n];
  if (!s) return `Source ${n}`;
  return String(s.publisher || s.name).replace(/\s*\([^)]*\)\s*$/, '').trim() || `Source ${n}`;
}

function sourceDomain(n) {
  const s = sources[n];
  if (!s) return `source ${n}`;
  if (!s.url) return 'PlayStation trophy app';
  try {
    return new URL(s.url).hostname.replace(/^www\./, '');
  } catch (e) {
    return String(s.url).replace(/^https?:\/\//, '').split('/')[0];
  }
}

function isHidden(t) {
  return spoiler && t.kind === 'story' && !earned.has(t.id);
}

function visibleTrophies() {
  const q = query.trim().toLowerCase();
  const list = trophies.filter((t) => {
    if (kind === 'missable' && t.missable === 'none') return false;
    if (kind !== 'all' && kind !== 'missable' && t.kind !== kind) return false;
    if (grade !== 'all' && t.grade !== grade) return false;
    if (!q) return true;
    if (isHidden(t)) return 'hidden story trophy'.includes(q);
    const stage = stageFor(t);
    const hay = [t.name, t.description, t.guide, stage ? stage.name : '', t.kind, t.missable].join(' ').toLowerCase();
    return hay.includes(q);
  });
  const byLane = (a, b) => (stageOrder.get(a.stage) ?? 99) - (stageOrder.get(b.stage) ?? 99) || a.id - b.id;
  if (kind === 'story' && spoiler) {
    const rank = (t) => (earned.has(t.id) ? 0 : isHidden(t) ? 1 : 2);
    return list.sort((a, b) => rank(a) - rank(b) || byLane(a, b));
  }
  return list.sort(byLane);
}

function getCount(t) {
  return Math.min(t.count ? t.count.target : 0, Math.max(0, Number(counts[t.id]) || 0));
}

function setSaved(text, state) {
  els.saved.textContent = text;
  els.saved.classList.toggle('is-warn', state === 'warn');
  els.saved.classList.toggle('is-ok', state === 'ok');
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 2, earned: [...earned], counts }));
    storageBlocked = false;
    setSaved('Saved in this browser', 'ok');
  } catch (e) {
    storageBlocked = true;
    setSaved('Storage blocked · progress will not persist', 'warn');
  }
}

function syncURL() {
  try {
    const p = new URLSearchParams();
    p.set('view', view);
    p.set('t', String(selected));
    p.set('spoiler', spoiler ? '1' : '0');
    if (kind !== 'all') p.set('kind', kind);
    if (grade !== 'all') p.set('grade', grade);
    if (query) p.set('q', query);
    history.replaceState(null, '', `?${p.toString()}`);
  } catch (e) {
    /* file:// may refuse; the app still works */
  }
}

function toggleEarned(id, on) {
  if (on) earned.add(id);
  else earned.delete(id);
  save();
  renderAll();
}

function bumpCount(id, delta) {
  const t = byId.get(id);
  if (!t || !t.count) return;
  const next = Math.max(0, Math.min(t.count.target, getCount(t) + delta));
  counts[id] = next;
  if (next >= t.count.target) earned.add(id);
  save();
  renderAll();
}

function renderHeader() {
  els.progress.textContent = `${earned.size} / ${TOTAL}`;
  const total = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  const done = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  for (const t of trophies) {
    total[t.grade]++;
    if (earned.has(t.id)) done[t.grade]++;
  }
  const frag = document.createDocumentFragment();
  for (const g of gradeOrder) {
    const span = el('span', 'gs');
    span.append(el('span', 'gl', gradeLetter(g)), el('b', null, `${done[g]}/${total[g]}`));
    span.title = `${gradeTitle(g)}: ${done[g]} of ${total[g]} earned`;
    frag.append(span);
  }
  els.gradecounts.replaceChildren(frag);

  const sorted = [...trophies].sort((a, b) => (stageOrder.get(a.stage) ?? 99) - (stageOrder.get(b.stage) ?? 99) || a.id - b.id);
  const ticks = document.createDocumentFragment();
  for (const t of sorted) {
    const tick = el('span', 'tick');
    if (earned.has(t.id)) tick.classList.add('is-earned');
    if (t.missable !== 'none') tick.classList.add('is-missable');
    if (t.hidden) tick.classList.add('is-hidden');
    tick.title = isHidden(t) ? 'Hidden story trophy' : `${t.name} · ${gradeTitle(t.grade)}${earned.has(t.id) ? ' · earned' : ''}`;
    ticks.append(tick);
  }
  els.sounder.replaceChildren(ticks);
  els.sounder.setAttribute('aria-label', `${earned.size} of 55 earned; ${trophies.filter((t) => t.missable !== 'none').length} coral missable marks; ${trophies.filter((t) => t.hidden).length} hollow hidden ticks`);

  if (storageBlocked) setSaved('Storage blocked · progress will not persist', 'warn');
  else setSaved('Saved in this browser', 'ok');

  els.spoiler.setAttribute('aria-pressed', String(spoiler));
  els.spoilerState.textContent = spoiler ? 'ON' : 'OFF';
  const showShield = spoiler && kind === 'story';
  els.shieldbanner.hidden = !showShield;
  els.shieldbanner.textContent = showShield ? 'SHIELD ON · unearned story names hidden' : '';
  if (els.missableTabCount) {
    els.missableTabCount.textContent = String(trophies.filter((t) => t.missable !== 'none').length);
  }
}

function renderEvidence() {
  const steps = trophies.reduce((n, t) => n + t.steps.length, 0);
  const citedSteps = trophies.reduce((n, t) => n + t.steps.filter((s) => s.cites && s.cites.length).length, 0);
  const citedGuides = trophies.filter((t) => t.refs && t.refs.length).length;
  const hidden = trophies.filter((t) => t.hidden).length;
  const missable = trophies.filter((t) => t.missable !== 'none').length;
  const conflicts = trophies.filter((t) => t.conflict).length;
  const unconfirmed = trophies.filter((t) => t.unconfirmed).length;
  const bits = [
    ['55', 'official trophies', 'foam'],
    [String(hidden), 'hidden', 'foam'],
    [String(missable), 'missable', 'coral'],
    [`${citedGuides}/55`, 'guides cited', 'kelp'],
    [`${citedSteps}/${steps}`, 'steps cited', 'kelp'],
    [String(Object.keys(sources).length), 'sources', 'foam'],
    [String(conflicts), 'disputes', 'coral'],
    [String(unconfirmed), 'unconfirmed', 'amber'],
    [dateLabel(meta.checked), 'read', 'foam'],
  ];
  const frag = document.createDocumentFragment();
  for (const [strong, weak, tone] of bits) {
    const chip = el('span', `ev-chip ev-${tone}`);
    chip.append(el('b', null, strong), el('span', 'ev-label', weak));
    frag.append(chip);
  }
  els.evidence.replaceChildren(frag);
}

function chipCount(key) {
  if (key === 'all') return trophies.length;
  if (key === 'missable') return trophies.filter((t) => t.missable !== 'none').length;
  return trophies.filter((t) => t.kind === key).length;
}

function renderChips() {
  const frag = document.createDocumentFragment();
  for (const k of KINDS) {
    const b = el('button', 'chip');
    b.type = 'button';
    b.dataset.kind = k.key;
    b.setAttribute('aria-pressed', String(kind === k.key));
    b.append(document.createTextNode(k.label), el('span', 'n', String(chipCount(k.key))));
    b.addEventListener('click', () => {
      kind = k.key;
      syncURL();
      renderAll();
    });
    frag.append(b);
  }
  els.chips.replaceChildren(frag);
}

function nextUp() {
  const sorted = [...trophies].sort((a, b) => (stageOrder.get(a.stage) ?? 99) - (stageOrder.get(b.stage) ?? 99) || a.id - b.id);
  const pool = sorted.filter((t) => !earned.has(t.id));
  return pool.find((t) => t.missable !== 'none') || pool[0] || null;
}

function renderNextUp() {
  const t = nextUp();
  if (!t) {
    els.nextup.textContent = 'All 55 earned — platinum lane closed.';
    return;
  }
  const label = isHidden(t) ? 'Hidden story trophy' : t.name;
  els.nextup.replaceChildren(el('b', null, 'Next'), document.createTextNode(` ${label} · ${stageFor(t).numeral}`));
  els.nextup.title = isHidden(t) ? 'Next unearned trophy in roadmap order' : `Next unearned trophy: ${t.name}, lane ${stageFor(t).numeral}`;
}

function renderList() {
  const list = visibleTrophies();
  const frag = document.createDocumentFragment();
  let done = 0;
  for (const t of list) {
    if (earned.has(t.id)) done++;
    const hidden = isHidden(t);
    const li = el('li', 'trow');
    li.dataset.id = String(t.id);
    if (t.id === selected) li.classList.add('is-selected');
    if (t.missable !== 'none') li.classList.add('is-missable');
    if (earned.has(t.id)) li.classList.add('is-earned');
    if (hidden) li.classList.add('is-locked');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'trow-check';
    check.checked = earned.has(t.id);
    check.setAttribute('aria-label', hidden ? 'Mark hidden story trophy earned' : `Mark ${t.name} earned`);
    check.addEventListener('change', () => toggleEarned(t.id, check.checked));
    check.addEventListener('click', (e) => e.stopPropagation());

    const tile = el('span', `grade-tile g-${t.grade}`, hidden ? '' : gradeLetter(t.grade));
    tile.title = `${gradeTitle(t.grade)} trophy`;
    tile.setAttribute('aria-hidden', 'true');

    const btn = el('button', 'trow-select');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(t.id === selected));
    const name = el('span', 'trow-name', hidden ? 'Hidden story trophy' : t.name);
    const meta = el('span', 'trow-meta');
    meta.append(el('span', 'kind', hidden ? 'story · shielded' : KIND_LABEL[t.kind] || t.kind));
    meta.append(el('span', null, gradeTitle(t.grade)));
    if (t.count && !hidden) meta.append(el('span', null, `${getCount(t)}/${t.count.target} ${t.count.unit}`));
    if (t.missable !== 'none' && !hidden) meta.append(el('span', 'miss', t.missable === 'confirmed' ? 'confirmed missable' : t.missable === 'possible' ? 'possible missable' : 'watch'));
    if (earned.has(t.id)) meta.append(el('span', 'done', 'earned'));
    if (t.hidden && !hidden) meta.append(el('span', 'hid', 'official hidden'));
    meta.append(el('span', 'refs', `cites ${t.refs.map((n) => `[${n}]`).join('')}`));
    btn.append(name, meta);
    btn.addEventListener('click', () => selectTrophy(t.id));

    li.append(check, tile, btn);
    frag.append(li);
  }
  if (list.length === 0) {
    const empty = el('li', 'empty-state');
    empty.append(el('b', null, 'No trophies match these filters. '));
    empty.append(document.createTextNode('Clear the search or switch kind/grade back to All. '));
    const clear = el('button', 'link-btn', 'Clear filters');
    clear.type = 'button';
    clear.addEventListener('click', () => {
      kind = 'all';
      grade = 'all';
      query = '';
      els.search.value = '';
      els.grade.value = 'all';
      syncURL();
      renderAll();
    });
    empty.append(clear);
    frag.append(empty);
  }
  els.rows.replaceChildren(frag);
  els.listcount.textContent = `${list.length} shown · ${done} earned · ${earned.size}/${TOTAL} total`;
  renderNextUp();
  const selectedRow = els.rows.querySelector('.trow.is-selected');
  if (selectedRow) {
    requestAnimationFrame(() => {
      const list = els.rows.getBoundingClientRect();
      const row = selectedRow.getBoundingClientRect();
      const targetTop = list.top + list.height * 0.62;
      els.rows.scrollTop += row.top - targetTop;
      const listTop = els.rows.getBoundingClientRect().top;
      for (const child of els.rows.children) {
        const box = child.getBoundingClientRect();
        if (box.top < listTop && box.bottom > listTop) {
          els.rows.scrollTop += box.top - listTop;
          break;
        }
      }
    });
  }
}

function citationSup(n) {
  const sup = el('span', 'cite');
  sup.append(el('span', 'cite-name', sourceLabel(n)), el('span', 'cite-num', `[${n}]`));
  sup.title = sources[n] ? `${sources[n].name} — ${sourceDomain(n)}` : `Source ${n}`;
  return sup;
}

function appendCited(parent, text, cites) {
  parent.append(document.createTextNode(text));
  for (const n of cites || []) parent.append(citationSup(n));
}

function renderSteps(t, limit, container) {
  const ol = el('ol', 'steps');
  const shown = limit ? t.steps.slice(0, limit) : t.steps;
  shown.forEach((step, i) => {
    const li = document.createElement('li');
    li.append(el('span', 'step-num', String(i + 1).padStart(2, '0')));
    const body = el('span');
    appendCited(body, step.text, step.cites);
    li.append(body);
    ol.append(li);
  });
  container.append(ol);
}

function markButton(t) {
  const on = earned.has(t.id);
  const btn = el('button', 'mark-btn' + (on ? ' is-on' : ''), on ? 'Earned ✓' : 'Mark earned');
  btn.type = 'button';
  btn.setAttribute('aria-pressed', String(on));
  btn.addEventListener('click', () => toggleEarned(t.id, !on));
  return btn;
}

function countRow(t, compact) {
  const row = el('div', compact ? 'spread-count' : 'count-row');
  const value = getCount(t);
  row.append(el('span', 'count-num', String(value)), el('span', 'count-unit', `/ ${t.count.target} ${t.count.unit}`));
  const bar = el('div', compact ? 'count-bar' : 'count-bar');
  const fill = document.createElement('span');
  fill.style.width = `${Math.round((value / t.count.target) * 100)}%`;
  bar.append(fill);
  row.append(bar);
  const minus = el('button', 'count-btn', '−');
  minus.type = 'button';
  minus.setAttribute('aria-label', `Remove one ${t.count.unit.replace(/s$/, '')} from ${t.name}`);
  minus.addEventListener('click', () => bumpCount(t.id, -1));
  const plus = el('button', 'count-btn', '+');
  plus.type = 'button';
  plus.setAttribute('aria-label', `Add one ${t.count.unit.replace(/s$/, '')} to ${t.name}`);
  plus.addEventListener('click', () => bumpCount(t.id, 1));
  row.append(minus, plus);
  row.title = 'This count is saved in this browser and is included in Export and Import.';
  return row;
}

function renderMissableFlag(t) {
  if (t.missable === 'none' || !t.window) return null;
  const box = el('div', 'missable-flag');
  box.append(el('div', 'flag-head', `${STATUS_LABEL[t.missable]} · Lane ${stageFor(t).numeral}`));
  if (t.window.mission) {
    box.append(el('div', 'flag-window', `${t.window.mission}${t.window.chapter ? ` · Chapter ${t.window.chapter}` : ''}`));
  }
  const locks = el('p');
  locks.append(el('b', null, 'Locks: '), document.createTextNode(t.window.locks));
  const save = el('p', 'save');
  save.append(el('b', null, 'Save: '), document.createTextNode(t.window.save));
  box.append(locks, save);
  return box;
}

function renderDetail() {
  const t = byId.get(selected);
  if (!t) return;
  const frag = document.createDocumentFragment();
  const hidden = isHidden(t);

  const head = el('div', 'detail-head');
  const tile = el('span', `grade-tile g-${t.grade}`, gradeLetter(t.grade));
  tile.title = `${gradeTitle(t.grade)} trophy`;
  const titleWrap = el('div');
  titleWrap.append(el('span', 'detail-stage', stageLabel(t)));
  titleWrap.append(el('h2', 'detail-title', hidden ? 'Hidden story trophy' : t.name));
  const actions = el('div', 'detail-actions');
  actions.append(markButton(t));
  head.append(tile, titleWrap, actions);
  frag.append(head);

  if (hidden) {
    const official = el('div', 'official-block');
    official.append(el('span', 'official-label', 'Official PlayStation description'));
    official.append(el('p', 'official-text', 'Hidden while the spoiler shield is ON.'));
    frag.append(official);
    const note = el('div', 'shield-note');
    note.append(el('h3', null, 'This story trophy is shielded'));
    note.append(el('p', null, 'Its official name, description and guide stay hidden until you earn it or turn the shield off. Earned story trophies are always revealed.'));
    const off = el('button', 'link-btn', 'Turn the spoiler shield off');
    off.type = 'button';
    off.addEventListener('click', () => setSpoiler(false));
    note.append(off);
    frag.append(note);
    els.detail.replaceChildren(frag);
    return;
  }

  const official = el('div', 'official-block');
  official.append(el('span', 'official-label', 'Official PlayStation description · verbatim'));
  official.append(el('p', 'official-text', t.description));
  frag.append(official);

  const metaLine = el('div', 'meta-line');
  metaLine.append(el('span', 'meta-tag', KIND_LABEL[t.kind] || t.kind));
  metaLine.append(el('span', 'meta-tag', gradeTitle(t.grade)));
  if (t.hidden) metaLine.append(el('span', 'meta-tag meta-hidden', 'official hidden'));
  if (t.missable !== 'none') metaLine.append(el('span', 'meta-tag meta-miss', STATUS_LABEL[t.missable]));
  metaLine.append(el('span', null, `cites ${t.refs.map((n) => `[${n}]`).join('')}`));
  frag.append(metaLine);

  const grid = el('div', 'detail-grid');
  const main = el('div', 'detail-main');
  const side = el('aside', 'detail-side');

  const headRow = el('div', 'steps-head');
  headRow.append(el('span', null, `Cited steps · ${Math.min(6, t.steps.length)} of ${t.steps.length}`));
  headRow.append(el('b', null, `${t.steps.reduce((n, s) => n + (s.cites ? s.cites.length : 0), 0)} source marks`));
  main.append(headRow);
  renderSteps(t, 6, main);

  const foot = el('div', 'steps-foot');
  foot.append(el('span', null, t.steps.length > 6 ? `+${t.steps.length - 6} more in the logbook spread` : 'Every step carries a named source'));
  const open = el('button', 'link-btn', 'Open logbook spread →');
  open.type = 'button';
  open.addEventListener('click', () => setView('guide'));
  foot.append(open);
  main.append(foot);

  const flag = renderMissableFlag(t);
  if (flag) side.append(flag);
  if (t.count) side.append(countRow(t, false));
  const conflict = renderConflict(t);
  if (conflict) side.append(conflict);
  const next = renderNextPanel(t);
  if (next) side.append(next);
  if (spoiler && kind === 'story') side.append(renderShieldPanel());

  grid.append(main, side);
  frag.append(grid);

  els.detail.replaceChildren(frag);
}

function renderConflict(t) {
  if (!t.conflict) return null;
  const box = el('div', 'conflict-box');
  box.append(el('h3', null, 'Sources disagree'));
  if (Array.isArray(t.conflictSides) && t.conflictSides.length) {
    for (const side of t.conflictSides) {
      const row = el('div', 'conflict-side');
      row.append(el('span', 'conflict-label', side.label));
      row.append(el('span', 'conflict-text', side.text));
      box.append(row);
    }
  } else {
    box.append(el('p', null, t.conflict));
  }
  if (t.conflictCall) {
    const call = el('p', 'conflict-call');
    call.append(el('b', null, 'Our call: '), document.createTextNode(t.conflictCall));
    box.append(call);
  }
  return box;
}

function renderShieldPanel() {
  const story = trophies.filter((t) => t.kind === 'story');
  const earnedStory = story.filter((t) => earned.has(t.id)).length;
  const shielded = story.filter((t) => isHidden(t)).length;
  const panel = el('div', 'shield-panel');
  panel.append(el('h3', null, 'Spoiler shield is ON'));
  panel.append(el('p', null, 'Earned story names stay visible. Unearned story names and descriptions show as “Hidden story trophy” until earned.'));
  const stats = el('div', 'shield-stats');
  stats.append(el('span', null, `${story.length} story`), el('span', null, `${earnedStory} earned`), el('span', null, `${shielded} shielded`));
  panel.append(stats);
  const off = el('button', 'link-btn', 'Turn the spoiler shield off');
  off.type = 'button';
  off.addEventListener('click', () => setSpoiler(false));
  panel.append(off);
  return panel;
}

function renderNextPanel(t) {
  const sorted = [...trophies].sort((a, b) => (stageOrder.get(a.stage) ?? 99) - (stageOrder.get(b.stage) ?? 99) || a.id - b.id);
  const index = sorted.findIndex((x) => x.id === t.id);
  const upcoming = sorted.slice(index + 1).filter((x) => !earned.has(x.id)).slice(0, 3);
  if (!upcoming.length) return null;
  const panel = el('div', 'next-panel');
  const head = el('div', 'next-head');
  head.append(el('h3', null, 'Next in roadmap'));
  const open = el('button', 'link-btn', 'Roadmap →');
  open.type = 'button';
  open.addEventListener('click', () => setView('roadmap'));
  head.append(open);
  panel.append(head);
  for (const x of upcoming) {
    const row = el('button', 'next-row');
    row.type = 'button';
    row.append(el('span', 'next-lane', stageFor(x).numeral));
    const body = el('span', 'next-body');
    body.append(el('span', 'next-name', isHidden(x) ? 'Hidden story trophy' : x.name));
    const tags = el('span', 'next-tags');
    tags.append(el('span', 'next-kind', KIND_LABEL[x.kind] || x.kind));
    if (x.missable !== 'none') tags.append(el('span', 'next-miss', STATUS_LABEL[x.missable]));
    if (x.count) tags.append(el('span', null, `${getCount(x)}/${x.count.target}`));
    body.append(tags);
    row.append(body);
    row.addEventListener('click', () => selectTrophy(x.id));
    panel.append(row);
  }
  return panel;
}

function sourceUsage() {
  const usage = {};
  for (const key of Object.keys(sources)) usage[key] = { trophies: 0, steps: 0 };
  for (const t of trophies) {
    const seen = new Set();
    for (const n of t.refs) {
      if (!usage[n]) usage[n] = { trophies: 0, steps: 0 };
      if (!seen.has(n)) {
        usage[n].trophies++;
        seen.add(n);
      }
    }
    for (const step of t.steps) for (const n of step.cites || []) if (usage[n]) usage[n].steps++;
  }
  return usage;
}

function renderSourceRail() {
  const t = byId.get(selected);
  const used = new Set(t ? t.refs : []);
  const usage = sourceUsage();
  const frag = document.createDocumentFragment();
  const head = el('div', 'rail-head');
  head.append(el('h2', 'rail-title', 'Source ledger'), el('span', 'rail-date', `read ${dateLabel(meta.checked)}`));
  frag.append(head);
  for (const key of Object.keys(sources).sort((a, b) => Number(a) - Number(b))) {
    const s = sources[key];
    const item = el('div', 'source-item' + (used.has(Number(key)) ? ' is-used' : ''));
    item.append(el('span', 'refnum', `[${key}]`));
    const body = el('div');
    body.append(el('div', 'src-name', s.name));
    body.append(el('div', 'src-meta', `${s.publisher} · ${s.type}`));
    body.append(el('div', 'src-domain', sourceDomain(key)));
    item.append(body, el('span', 'src-cover', `${usage[key] ? usage[key].trophies : 0}/55`));
    frag.append(item);
  }
  const note = el('p', 'rail-note');
  note.append(el('b', null, 'How to read it. '));
  note.append(document.createTextNode('Every numbered step points to one of these sources. Official list and official text are separated from method guides; a link opens only when you click it.'));
  frag.append(note);
  els.sourcerail.replaceChildren(frag);
}

function renderRoadmap() {
  const frag = document.createDocumentFragment();
  for (const s of stages) {
    const laneTrophies = s.trophies.map((id) => byId.get(id)).filter(Boolean);
    const done = laneTrophies.filter((t) => earned.has(t.id)).length;
    const lane = el('div', 'lane' + (s.missables.length ? ' is-missable' : '') + (s.id === 90 ? ' is-platinum' : ''));
    lane.append(el('span', 'lane-num', s.numeral));
    const body = el('div', 'lane-body');
    body.append(el('div', 'lane-name', s.name));
    const sub = el('div', 'lane-sub');
    sub.append(el('span', 'why', s.why));
    sub.append(el('span', 'save', s.save));
    body.append(sub);
    lane.append(body);
    const win = el('div', 'lane-window');
    win.append(document.createTextNode(s.window));
    if (s.missables.length) win.append(el('div', null, `coral: ${s.missables.length} flagged`));
    lane.append(win);
    const count = el('div', 'lane-count');
    count.append(document.createTextNode(String(done)), el('span', 'of', ` / ${laneTrophies.length}`));
    lane.append(count);
    const tokens = el('div', 'lane-tokens');
    for (const t of laneTrophies) {
      const b = el('button', `tok g-${t.grade}`);
      b.type = 'button';
      if (earned.has(t.id)) b.classList.add('is-earned');
      if (t.missable !== 'none') b.classList.add('is-missable');
      if (t.hidden) b.classList.add('is-hidden');
      b.title = isHidden(t) ? 'Hidden story trophy' : `${t.name} · ${gradeTitle(t.grade)}${earned.has(t.id) ? ' · earned' : ''}`;
      b.setAttribute('aria-label', b.title);
      b.addEventListener('click', () => openTrophy(t.id, 'guide'));
      tokens.append(b);
    }
    lane.append(tokens);
    frag.append(lane);
  }
  els.tide.replaceChildren(frag);

  const missFrag = document.createDocumentFragment();
  const flagged = [...trophies]
    .filter((t) => t.missable !== 'none')
    .sort((a, b) => (stageOrder.get(a.stage) ?? 99) - (stageOrder.get(b.stage) ?? 99) || a.id - b.id);
  const missCount = (status) => flagged.filter((t) => t.missable === status).length;
  missFrag.append(el('h2', null, 'Missable watch'));
  missFrag.append(el('p', 'panel-sub', `${flagged.length} flagged · ${missCount('confirmed')} confirmed · ${missCount('possible')} possible · ${missCount('watch')} watch`));
  missFrag.append(el('p', 'panel-cite', 'Locks & save buoys: PowerPyx [4] · Push Square [6]'));
  for (const t of flagged) {
    const b = el('button', 'missable-item');
    b.type = 'button';
    b.append(el('span', 'mi-status', `${STATUS_LABEL[t.missable]} · Lane ${stageFor(t).numeral}`));
    b.append(el('span', 'mi-name', isHidden(t) ? 'Hidden story trophy' : t.name));
    if (t.window) {
      b.append(el('span', 'mi-window', `${t.window.mission} · locks: ${t.window.locks} · save: ${t.window.save}`));
    }
    b.title = t.window ? `${t.window.mission} — ${t.window.locks}. ${t.window.save}.` : 'Window not documented';
    b.addEventListener('click', () => openTrophy(t.id, 'guide'));
    missFrag.append(b);
  }
  els.missables.replaceChildren(missFrag);
}

function renderMissablesView() {
  const flagged = [...trophies]
    .filter((t) => t.missable !== 'none')
    .sort((a, b) => (stageOrder.get(a.stage) ?? 99) - (stageOrder.get(b.stage) ?? 99) || a.id - b.id);
  const missCount = (status) => flagged.filter((t) => t.missable === status).length;
  const frag = document.createDocumentFragment();
  const head = el('div', 'ledger-head');
  const left = el('div');
  left.append(el('h2', 'ledger-title', 'Missable watch'));
  left.append(el('p', 'ledger-sub', `${flagged.length} flagged · ${missCount('confirmed')} confirmed · ${missCount('possible')} possible · ${missCount('watch')} watch. Ordered by roadmap lane, then official list id; locks and save buoys come from cited guides [4][6].`));
  const right = el('div');
  right.append(el('div', 'rail-date', `${flagged.length} watched · read ${dateLabel(meta.checked)}`));
  head.append(left, right);
  frag.append(head);

  const list = el('div', 'missables-table');
  for (const t of flagged) {
    const row = el('button', 'missable-row');
    row.type = 'button';
    row.append(el('span', `mr-status mr-${t.missable}`, STATUS_LABEL[t.missable]));
    row.append(el('span', 'mr-lane', `Lane ${stageFor(t).numeral}`));
    const body = el('span', 'mr-body');
    body.append(el('span', 'mr-name', isHidden(t) ? 'Hidden story trophy' : t.name));
    if (t.window) body.append(el('span', 'mr-window', `${t.window.mission} · Chapter ${t.window.chapter}`));
    row.append(body);
    if (t.window) {
      row.append(el('span', 'mr-locks', `Locks: ${t.window.locks}`));
      row.append(el('span', 'mr-save', `Save: ${t.window.save}`));
    }
    row.append(el('span', 'mr-refs', t.refs.map((n) => `[${n}]`).join(' ')));
    row.addEventListener('click', () => openTrophy(t.id, 'checklist'));
    list.append(row);
  }
  frag.append(list);
  els.missablesView.replaceChildren(frag);
}

function renderSourcesView() {
  const usage = sourceUsage();
  const frag = document.createDocumentFragment();
  const head = el('div', 'ledger-head');
  const left = el('div');
  left.append(el('h2', 'ledger-title', 'Source ledger'));
  left.append(el('p', 'ledger-sub', 'Seven places to check a claim. Coverage is computed from this entry’s own step citations, not hard-coded. Official list and official text sit beside method guides and a community wiki.'));
  const right = el('div');
  right.append(el('div', 'rail-date', `${Object.keys(sources).length} sources · read ${dateLabel(meta.checked)}`));
  head.append(left, right);
  frag.append(head);

  const grid = el('div', 'ledger-grid');
  for (const key of Object.keys(sources).sort((a, b) => Number(a) - Number(b))) {
    const s = sources[key];
    const card = el('article', 'ledger-card');
    const top = el('div', 'lc-top');
    top.append(el('span', 'refnum', `[${key}]`), el('span', 'lc-name', s.name), el('span', 'lc-type', s.type));
    card.append(top);
    if (s.url) {
      const a = el('a', 'lc-url', s.url.replace(/^https?:\/\//, ''));
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = `${s.publisher} — opens only when clicked; the app itself fetches nothing`;
      card.append(a);
    } else {
      card.append(el('span', 'lc-url', 'No public URL · official in-game text'));
    }
    card.append(el('p', 'lc-scope', s.scope));
    card.append(el('div', 'lc-meta', `cited by ${usage[key].trophies} of 55 guides · ${usage[key].steps} steps · read ${dateLabel(s.read)}`));
    grid.append(card);
  }
  frag.append(grid);

  const two = el('div', 'ledger-grid-2');
  const disagreements = el('section', 'ledger-block');
  disagreements.append(el('h2', null, 'Disagreement ledger'));
  disagreements.append(el('p', null, 'When cited sources do not agree, both versions stay visible. Nothing is silently flattened.'));
  const conflictList = el('ul', 'note-list');
  for (const t of trophies.filter((x) => x.conflict)) {
    const li = el('li', 'is-conflict');
    li.append(el('b', null, isHidden(t) ? 'Hidden story trophy' : t.name), document.createTextNode(' '));
    li.append(document.createTextNode(t.conflict));
    if (t.refs) li.append(el('span', 'refs', ` ${t.refs.map((n) => `[${n}]`).join('')}`));
    conflictList.append(li);
  }
  disagreements.append(conflictList);
  two.append(disagreements);

  const unconfirmed = el('section', 'ledger-block');
  unconfirmed.append(el('h2', null, 'Unconfirmed list'));
  unconfirmed.append(el('p', null, 'These claims could not be verified against the cited sources. They are labelled rather than invented.'));
  const unconfirmedList = el('ul', 'note-list');
  for (const t of trophies.filter((x) => x.unconfirmed)) {
    const li = el('li', 'is-unconfirmed');
    li.append(el('b', null, isHidden(t) ? 'Hidden story trophy' : t.name), document.createTextNode(' '));
    li.append(document.createTextNode(t.unconfirmed));
    unconfirmedList.append(li);
  }
  unconfirmed.append(unconfirmedList);
  two.append(unconfirmed);
  frag.append(two);

  const legend = el('section', 'legend');
  const legendHead = el('div', 'ledger-head');
  legendHead.append(el('h2', 'ledger-title', 'How to read this chart'));
  legend.append(legendHead);
  const lg = el('div', 'legend-grid');
  const items = [
    ['Official text', 'The name, description and grade are shown exactly as PlayStation publishes them. Official text is labelled and never rewritten.'],
    ['Our logbook', 'The guide prose and numbered steps are written for TIDELINE 55. They add method, order, window and save advice rather than restating the description.'],
    ['Citations', 'Every step carries a bracketed ref. The ledger gives the publisher, URL, read date, scope and computed coverage. A link opens only when clicked.'],
    ['Spoiler shield', 'When ON, unearned story trophies show “Hidden story trophy”. Earning the trophy or turning the shield OFF reveals the official text and guide.'],
    ['Missable status', 'Confirmed means at least one cited source names it missable. Possible means the lock is reported but not documented. Watch means a one-time or partner-based risk.'],
    ['Unconfirmed', 'A claim with no verifiable source is marked unconfirmed and kept out of the main instruction. No location is invented to fill a gap.'],
  ];
  for (const [h, p] of items) {
    const item = el('div', 'legend-item');
    item.append(el('h3', null, h), el('p', null, p));
    lg.append(item);
  }
  legend.append(lg);
  frag.append(legend);
  els.sources.replaceChildren(frag);
}

function renderGuideSpread() {
  const t = byId.get(selected);
  if (!t) return;
  const hidden = isHidden(t);
  const frag = document.createDocumentFragment();
  const left = el('div', 'spread-left');
  const right = el('div', 'spread-right');

  left.append(el('div', 'spread-kicker', `${stageLabel(t)} · ${KIND_LABEL[t.kind] || t.kind}`));
  left.append(el('h2', 'spread-title', hidden ? 'Hidden story trophy' : t.name));
  const spreadMeta = el('div', 'spread-meta');
  spreadMeta.append(el('span', null, `${gradeTitle(t.grade)} trophy`));
  if (t.hidden) spreadMeta.append(el('span', null, 'official hidden'));
  if (t.missable !== 'none') spreadMeta.append(el('span', null, STATUS_LABEL[t.missable]));
  if (t.count) spreadMeta.append(el('span', null, `${getCount(t)} / ${t.count.target} ${t.count.unit}`));
  spreadMeta.append(el('span', null, `cites ${t.refs.map((n) => `[${n}]`).join('')}`));
  left.append(spreadMeta);

  if (hidden) {
    const note = el('div', 'shield-note');
    note.append(el('h3', null, 'Shielded until earned'));
    note.append(el('p', null, 'The logbook keeps unearned story names and descriptions out of sight. Turn the spoiler shield off in the toolbar to read this spread.'));
    left.append(note);
    frag.append(left, right);
    els.spread.replaceChildren(frag);
    return;
  }

  const head = el('div', 'steps-head');
  head.append(el('span', null, `Cited procedure · ${t.steps.length} steps`));
  head.append(el('b', null, `${t.steps.reduce((n, s) => n + (s.cites || []).length, 0)} source marks`));
  left.append(head);
  const steps = el('ol', 'spread-steps');
  t.steps.forEach((step, i) => {
    const li = document.createElement('li');
    li.append(el('span', 'step-num', String(i + 1).padStart(2, '0')));
    const body = el('span');
    appendCited(body, step.text, step.cites);
    li.append(body);
    steps.append(li);
  });
  left.append(steps);

  // right page: official text, method prose, and the source rail
  const railHead = el('div', 'rail-head');
  railHead.append(el('h2', 'rail-title', 'Claims & notes'), el('span', 'rail-date', `read ${dateLabel(meta.checked)}`));
  right.append(railHead);

  const official = el('div', 'spread-official');
  official.append(el('span', 'official-label', 'Official PlayStation description · verbatim'));
  official.append(el('p', null, t.description));
  right.append(official);
  right.append(el('p', 'spread-guide', t.guide));

  if (t.missable !== 'none' && t.window) {
    const lock = el('div', 'spread-lock');
    lock.append(el('b', null, `${STATUS_LABEL[t.missable]} · ${t.window.locks}`));
    lock.append(el('p', null, `Save buoy: ${t.window.save}`));
    right.append(lock);
  }

  if (t.count) right.append(countRow(t, true));

  const conflict = renderConflict(t);
  if (conflict) {
    conflict.classList.add('is-spread');
    right.append(conflict);
  }

  const usage = sourceUsage();
  const sourceHead = el('div', 'rail-head spread-source-head');
  sourceHead.append(el('h2', 'rail-title', 'Sources for this guide'), el('span', 'rail-date', `read ${dateLabel(meta.checked)}`));
  left.append(sourceHead);
  const sourceWrap = el('div', 'spread-sources');
  for (const key of Object.keys(sources).sort((a, b) => Number(a) - Number(b))) {
    const s = sources[key];
    const used = t.refs.includes(Number(key));
    const row = el('div', 'spread-source' + (used ? ' is-used' : ''));
    row.append(el('span', 'refnum', `[${key}]`));
    const body = el('div');
    body.append(el('span', 's-name', s.name));
    body.append(el('span', 's-meta', `${s.publisher} · ${sourceDomain(key)} · read ${dateLabel(s.read)}`));
    row.append(body, el('span', 's-cover', `${usage[key].trophies}/55`));
    sourceWrap.append(row);
  }
  left.append(sourceWrap);

  if (t.unconfirmed) {
    const u = el('div', 'claim-block is-unconfirmed');
    u.append(el('h3', null, 'Unconfirmed'));
    u.append(el('p', null, t.unconfirmed));
    right.append(u);
  }

  const ev = el('div', 'spread-evidence');
  const stepTotal = trophies.reduce((n, x) => n + x.steps.length, 0);
  const citedTotal = trophies.reduce((n, x) => n + x.steps.filter((step) => step.cites && step.cites.length).length, 0);
  const guideTotal = trophies.filter((x) => x.refs && x.refs.length).length;
  ev.append(el('b', null, `${guideTotal}/${TOTAL}`), document.createTextNode(' guides cite · '));
  ev.append(el('b', null, `${citedTotal}/${stepTotal}`), document.createTextNode(' steps cited · '));
  ev.append(el('b', null, String(Object.keys(sources).length)), document.createTextNode(` sources · read ${dateLabel(meta.checked)}`));
  right.append(ev);
  const next = renderNextPanel(t);
  if (next) {
    next.classList.add('is-spread');
    right.append(next);
  }
  right.append(el('p', 'spread-foot', 'Official text is quoted verbatim and attributed; guide prose and step order are this entry’s own. The app fetches nothing.'));

  frag.append(left, right);
  els.spread.replaceChildren(frag);
}

function renderAll() {
  renderHeader();
  renderEvidence();
  renderChips();
  if (view === 'checklist') {
    renderList();
    renderDetail();
    renderSourceRail();
  } else if (view === 'roadmap') {
    renderRoadmap();
  } else if (view === 'missables') {
    renderMissablesView();
  } else if (view === 'sources') {
    renderSourcesView();
  } else if (view === 'guide') {
    renderGuideSpread();
  }
}

function selectTrophy(id) {
  if (!byId.has(id)) return;
  selected = id;
  syncURL();
  renderList();
  renderDetail();
  renderSourceRail();
}

function openTrophy(id, targetView) {
  selected = id;
  setView(targetView || 'checklist');
}

function setView(name) {
  if (!VIEWS.includes(name)) return;
  view = name;
  for (const v of VIEWS) {
    const section = document.getElementById(`view-${v}`);
    if (section) section.classList.toggle('is-active', v === name);
    const tab = document.getElementById(`tab-${v}`);
    if (tab) {
      tab.setAttribute('aria-selected', String(v === name));
      tab.tabIndex = v === name ? 0 : -1;
    }
  }
  syncURL();
  renderAll();
}

function setSpoiler(on) {
  spoiler = Boolean(on);
  els.spoiler.setAttribute('aria-pressed', String(spoiler));
  els.spoilerState.textContent = spoiler ? 'ON' : 'OFF';
  syncURL();
  renderAll();
}

function showToast(message, isError) {
  els.toast.textContent = message;
  els.toast.classList.toggle('is-error', Boolean(isError));
  els.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3800);
}

// ---------- export / import ----------
let pendingImport = null;
let importTrigger = null;

function exportProgress() {
  const payload = {
    app: 'TIDELINE 55',
    version: 2,
    exportedAt: new Date().toISOString(),
    earned: [...earned].sort((a, b) => a - b),
    count: earned.size,
    total: TOTAL,
    counts,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tideline55-progress.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  showToast(`Exported ${earned.size} of ${TOTAL} trophies.`);
}

function openImportDialog(fileData, fileName) {
  const known = new Set(trophies.map((t) => t.id));
  const list = Array.isArray(fileData) ? fileData : Array.isArray(fileData.earned) ? fileData.earned : [];
  const ids = list
    .map((item) => {
      const num = Number(item);
      if (Number.isInteger(num) && byId.has(num)) return num;
      return navigateName(item);
    })
    .filter((id) => known.has(id));
  const unique = [...new Set(ids)];
  const countMap = {};
  if (fileData && typeof fileData.counts === 'object' && fileData.counts !== null) {
    for (const t of trophies) {
      if (!t.count) continue;
      const value = Number(fileData.counts[t.id]);
      if (Number.isFinite(value) && value > 0) countMap[t.id] = Math.min(t.count.target, Math.floor(value));
    }
  }
  pendingImport = { ids: unique, counts: countMap, fileName };
  $('importSummary').textContent = `${unique.length} of ${TOTAL} recognized${list.length > unique.length ? ` · ${list.length - unique.length} unknown or repeated entries ignored` : ''}. Choose Merge to keep the larger count, or Replace to use this file alone.`;
  $('importError').hidden = true;
  $('importDialog').hidden = false;
  $('mergeBtn').focus();
}

$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  importTrigger = e.target;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || (!Array.isArray(parsed) && !Array.isArray(parsed.earned))) throw new Error('shape');
    openImportDialog(parsed, file.name);
  } catch (err) {
    pendingImport = null;
    $('importSummary').textContent = 'This file could not be read.';
    $('importError').textContent = 'Choose a TIDELINE 55 JSON export, or an older export with an “earned” array.';
    $('importError').hidden = false;
    $('importDialog').hidden = false;
    $('mergeBtn').focus();
  } finally {
    e.target.value = '';
  }
});

function finishImport(mode) {
  if (!pendingImport) {
    $('importDialog').hidden = true;
    return;
  }
  const before = earned.size;
  if (mode === 'replace') {
    earned = new Set(pendingImport.ids);
    counts = { ...pendingImport.counts };
  } else {
    for (const id of pendingImport.ids) earned.add(id);
    for (const [id, value] of Object.entries(pendingImport.counts)) {
      counts[id] = Math.max(Number(counts[id]) || 0, value);
    }
  }
  for (const t of trophies) if (counts[t.id] >= (t.count ? t.count.target : Infinity)) earned.add(t.id);
  save();
  $('importDialog').hidden = true;
  pendingImport = null;
  renderAll();
  showToast(`${mode === 'replace' ? 'Replaced' : 'Merged'} progress: ${before} → ${earned.size} of ${TOTAL}.`);
}

$('mergeBtn').addEventListener('click', () => finishImport('merge'));
$('replaceBtn').addEventListener('click', () => finishImport('replace'));
$('cancelImport').addEventListener('click', () => {
  $('importDialog').hidden = true;
  pendingImport = null;
  if (importTrigger) importTrigger.focus();
});

// ---------- reset ----------
let resetTrigger = null;
$('resetBtn').addEventListener('click', (e) => {
  resetTrigger = e.currentTarget;
  $('resetSummary').textContent = `This will clear ${earned.size} of ${TOTAL} earned trophies and every saved count in this browser.`;
  $('resetDialog').hidden = false;
  $('confirmReset').focus();
});
$('confirmReset').addEventListener('click', () => {
  const before = earned.size;
  earned = new Set();
  counts = {};
  save();
  $('resetDialog').hidden = true;
  renderAll();
  showToast(`Reset ${before} earned trophies. Export was untouched.`);
});
$('cancelReset').addEventListener('click', () => {
  $('resetDialog').hidden = true;
  if (resetTrigger) resetTrigger.focus();
});

// ---------- controls ----------
els.spoiler.addEventListener('click', () => setSpoiler(!spoiler));
els.grade.value = grade;
els.grade.addEventListener('change', () => {
  grade = els.grade.value;
  syncURL();
  renderAll();
});
els.search.value = query;
els.search.addEventListener('input', () => {
  query = els.search.value;
  syncURL();
  if (view !== 'checklist') setView('checklist');
  else {
    renderList();
    renderDetail();
    renderSourceRail();
  }
});
$('exportBtn').addEventListener('click', exportProgress);

// tabs
const tabButtons = [...document.querySelectorAll('[data-view]')];
for (const btn of tabButtons) {
  btn.addEventListener('click', () => setView(btn.dataset.view));
  btn.addEventListener('keydown', (e) => {
    const index = tabButtons.indexOf(btn);
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % tabButtons.length;
    if (e.key === 'ArrowLeft') next = (index - 1 + tabButtons.length) % tabButtons.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabButtons.length - 1;
    if (next >= 0) {
      e.preventDefault();
      tabButtons[next].focus();
      setView(tabButtons[next].dataset.view);
    }
  });
}

// dialogs escape
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('importDialog').hidden) {
    $('importDialog').hidden = true;
    pendingImport = null;
  } else if (!$('resetDialog').hidden) {
    $('resetDialog').hidden = true;
    if (resetTrigger) resetTrigger.focus();
  }
});

window.addEventListener('hashchange', () => {
  const h = location.hash.replace(/^#/, '');
  if (VIEWS.includes(h) && h !== view) setView(h);
});

// initial paint
setView(view);
if (storageBlocked) {
  showToast('Storage is blocked in this browser; progress will not persist. Export still works.', true);
}
