import { trophies, sources, roadmapStages, stageNotes } from './data/trophies.js';

const KEY = 'gta6-trophy-checklist-v2';
const TOTAL = trophies.length;

const params = new URLSearchParams(location.search);
const VIEWS = ['checklist', 'roadmap', 'sources'];

function loadEarned() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    const known = new Set(trophies.map((t) => t.name));
    return new Set((Array.isArray(raw) ? raw : []).filter((n) => known.has(n)));
  } catch (e) {
    return new Set();
  }
}

let earned = loadEarned();
let spoilerMode = params.get('spoiler') === '1';
let kindFilter = params.get('kind') || 'all';
let gradeFilter = params.get('grade') || 'all';
let view = VIEWS.includes(params.get('view')) ? params.get('view') : VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'checklist';
let selected = (() => {
  const fromUrl = Number(params.get('t'));
  if (Number.isInteger(fromUrl) && trophies.some((t) => t.id === fromUrl)) return fromUrl;
  const firstMissable = trophies.find((t) => t.missable);
  return (firstMissable || trophies[0]).id;
})();

const $ = (id) => document.getElementById(id);
const rowsEl = $('rows');
const detailEl = $('detail');
const sourcerailEl = $('sourcerail');
const roadmapEl = $('roadmap-content');
const sourcesEl = $('sources-content');
const chipsEl = $('kindchips');
const gradeEl = $('grade');
const spoilerEl = $('spoiler');
const progressEl = $('progress');
const progressPctEl = $('progressPct');
const progressFillEl = $('progressfill');
const gradeCountsEl = $('gradecounts');
const auditEl = $('audit');
const listCountEl = $('listcount');
const savedEl = $('saved');

const KINDS = [
  { key: 'all', label: 'All' },
  { key: 'story', label: 'Story' },
  { key: 'missable', label: 'Missable' },
  { key: 'collectible', label: 'Collectibles' },
  { key: 'activity', label: 'Activities' },
];

const GRADE_ORDER = ['platinum', 'gold', 'silver', 'bronze'];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...earned]));
    savedEl.textContent = 'Progress saved in this browser';
    savedEl.classList.add('flash');
    setTimeout(() => savedEl.classList.remove('flash'), 900);
  } catch (e) {
    savedEl.textContent = 'Progress not saved (storage blocked)';
  }
}

function isHidden(t) {
  return spoilerMode && t.kind === 'story' && !earned.has(t.name);
}

function matchesKind(t) {
  if (kindFilter === 'all') return true;
  if (kindFilter === 'missable') return t.missable === true;
  return t.kind === kindFilter;
}

function refsOf(t) {
  return t.refs.map((n) => `[${n}]`).join(' ');
}

function gradeColor(g) {
  return 'g-' + g;
}

function sourceName(n) {
  return sources[n] ? sources[n].name : 'source';
}

function citeInto(parent, text) {
  const re = /\[(\d+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parent.append(document.createTextNode(text.slice(last, m.index)));
    const c = el('span', 'cite', '[' + m[1] + ']');
    c.title = sourceName(m[1]);
    parent.append(c);
    last = m.index + m[0].length;
  }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
}

function counts() {
  const by = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  for (const t of trophies) by[t.grade]++;
  const earnedBy = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  for (const t of trophies) if (earned.has(t.name)) earnedBy[t.grade]++;
  return { by, earnedBy };
}

function renderHeader() {
  const done = trophies.filter((t) => earned.has(t.name)).length;
  const pct = Math.round((done / TOTAL) * 100);
  progressEl.textContent = done + ' / ' + TOTAL;
  progressPctEl.textContent = pct + '%';
  progressFillEl.style.width = pct + '%';

  const { by, earnedBy } = counts();
  const frag = document.createDocumentFragment();
  for (const g of GRADE_ORDER) {
    const chip = el('div', 'gc ' + gradeColor(g));
    const dot = el('span', 'dot');
    const label = el('span', 'gc-label', g.charAt(0).toUpperCase() + g.slice(1));
    const num = el('span', 'gc-num', earnedBy[g] + '/' + by[g]);
    chip.append(dot, label, num);
    frag.append(chip);
  }
  gradeCountsEl.replaceChildren(frag);
}

function renderAudit() {
  const { by } = counts();
  const missable = trophies.filter((t) => t.missable).length;
  const cited = trophies.filter((t) => t.refs.length > 0).length;
  const srcCount = Object.keys(sources).length;
  const stages = new Set(trophies.map((t) => t.roadmap_stage)).size;

  const bits = [
    ['55', 'official trophies'],
    ['1P 2G 6S 46B', 'grade split'],
    [String(missable), 'missable flagged'],
    [cited + '/55', 'guides cite a source'],
    [String(srcCount), 'sources'],
    [String(stages), 'roadmap stops'],
  ];
  const frag = document.createDocumentFragment();
  bits.forEach(([strong, weak], i) => {
    if (i > 0) frag.append(el('span', 'audit-sep', '·'));
    const b = el('span', 'audit-bit');
    b.append(el('b', null, strong), document.createTextNode(' ' + weak));
    frag.append(b);
  });
  auditEl.replaceChildren(frag);
}

function renderChips() {
  const frag = document.createDocumentFragment();
  for (const k of KINDS) {
    const n = k.key === 'all' ? trophies.length : k.key === 'missable' ? trophies.filter((t) => t.missable).length : trophies.filter((t) => t.kind === k.key).length;
    const b = el('button', 'chip' + (kindFilter === k.key ? ' active' : ''));
    b.type = 'button';
    b.dataset.kind = k.key;
    b.append(document.createTextNode(k.label + ' '), el('span', 'chip-n', String(n)));
    b.addEventListener('click', () => {
      kindFilter = k.key;
      render();
    });
    frag.append(b);
  }
  chipsEl.replaceChildren(frag);
}

function renderList() {
  const frag = document.createDocumentFragment();
  let shown = 0;
  for (const t of trophies) {
    if (!matchesKind(t)) continue;
    if (gradeFilter !== 'all' && t.grade !== gradeFilter) continue;
    shown++;
    const hidden = isHidden(t);
    const row = el('div', 'trow');
    if (earned.has(t.name)) row.classList.add('earned');
    if (hidden) row.classList.add('hidden');
    if (t.id === selected) row.classList.add('selected');
    if (t.missable) row.classList.add('missable');

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'tick';
    box.checked = earned.has(t.name);
    box.setAttribute('aria-label', 'Mark ' + t.name + ' earned');
    box.addEventListener('click', (e) => e.stopPropagation());
    box.addEventListener('change', () => {
      if (box.checked) earned.add(t.name);
      else earned.delete(t.name);
      save();
      render();
    });

    const main = el('div', 'trow-main');
    const name = el('div', 'tname');
    name.append(el('span', 'gdot ' + gradeColor(t.grade)), document.createTextNode(hidden ? 'Hidden story trophy' : t.name));
    const meta = el('div', 'tmeta');
    const hm = el('span', 'tkind', t.kind);
    meta.append(hm);
    if (t.missable) meta.append(el('span', 'missable-badge', 'Missable'));
    if (earned.has(t.name)) meta.append(el('span', 'earned-badge', 'Earned'));
    meta.append(el('span', 'trefs', refsOf(t)));
    main.append(name, meta);

    row.append(box, main);
    row.addEventListener('click', () => {
      selected = t.id;
      render();
    });
    frag.append(row);
  }

  listCountEl.textContent = shown + ' shown';
  if (shown === 0) frag.append(el('p', 'empty', 'No trophies match these filters.'));
  rowsEl.replaceChildren(frag);
}

function renderDetail() {
  const t = trophies.find((x) => x.id === selected) || trophies[0];
  const hidden = isHidden(t);
  const frag = document.createDocumentFragment();

  frag.append(el('div', 'eyebrow', (roadmapStages[t.roadmap_stage] || 'Stage ' + t.roadmap_stage)));

  const titleRow = el('div', 'detail-titlerow');
  const title = el('h2', 'detail-title', hidden ? 'Hidden story trophy' : t.name);
  const grade = el('span', 'grade-pill ' + gradeColor(t.grade), t.grade);
  const toggle = el('button', 'mark' + (earned.has(t.name) ? ' on' : ''), earned.has(t.name) ? 'Earned ✓' : 'Mark earned');
  toggle.type = 'button';
  toggle.addEventListener('click', () => {
    if (earned.has(t.name)) earned.delete(t.name);
    else earned.add(t.name);
    save();
    render();
  });
  titleRow.append(grade, title, toggle);
  frag.append(titleRow);

  const pills = el('div', 'pills');
  pills.append(el('span', 'pill', 'Kind: ' + t.kind));
  if (t.count != null) pills.append(el('span', 'pill', 'Target: ' + t.count));
  if (t.missable) pills.append(el('span', 'pill warnpill', 'Missable'));
  frag.append(pills);

  const desc = el('div', 'official');
  desc.append(el('span', 'official-label', 'Official description'));
  desc.append(el('p', null, hidden ? 'Hidden while the spoiler shield is on.' : t.description));
  frag.append(desc);

  if (t.missable && !hidden) {
    const warn = el('div', 'warn');
    warn.append(el('strong', null, 'Missable - do this early. '));
    warn.append(document.createTextNode('This trophy can become unavailable if the story or a strand moves on. Clear it before the late game. [3]'));
    frag.append(warn);
  }

  if (hidden) {
    frag.append(el('p', 'hidden-note', 'The spoiler shield is hiding this story trophy\'s name, description and guide. Turn it off in the toolbar to reveal them.'));
  } else {
    const short = el('div', 'block');
    short.append(el('h3', 'block-title', 'In short'));
    short.append(el('p', 'short', t.short));
    frag.append(short);

    const how = el('div', 'block');
    how.append(el('h3', 'block-title', 'How to get it'));
    const ol = el('ol', 'steps');
    for (const step of t.steps) {
      const li = document.createElement('li');
      citeInto(li, step);
      ol.append(li);
    }
    how.append(ol);
    frag.append(how);
  }

  const srcLine = el('div', 'detail-sources');
  srcLine.append(el('span', 'detail-sources-label', 'Cites'));
  for (const n of t.refs) {
    const s = el('span', 'src-chip', '[' + n + '] ' + sourceName(n));
    srcLine.append(s);
  }
  frag.append(srcLine);

  detailEl.replaceChildren(frag);
}

function renderSourceRail() {
  const t = trophies.find((x) => x.id === selected) || trophies[0];
  const used = new Set(t.refs);
  const frag = document.createDocumentFragment();

  frag.append(el('h2', 'pane-title', 'Sources'));
  frag.append(el('p', 'pane-sub', 'The numbered citations that every guide step points to.'));

  const usage = {};
  for (const tr of trophies) for (const n of tr.refs) usage[n] = (usage[n] || 0) + 1;

  for (const key of Object.keys(sources).sort()) {
    const s = sources[key];
    const card = el('article', 'source-card' + (used.has(Number(key)) ? ' used' : ''));
    card.append(el('span', 'refnum', '[' + key + ']'));
    const body = el('div', 'src-body');
    body.append(el('div', 'src-name', s.name));
    body.append(el('div', 'src-url', s.url ? s.url.replace(/^https?:\/\//, '') : 'in-game text'));
    card.append(body);
    card.append(el('span', 'src-count', String(usage[key] || 0)));
    frag.append(card);
  }

  frag.append(el('p', 'rail-note', 'Guide prose is written for this codex. Official names, descriptions and grades come from the published PS5 list; counts and progress targets come from the trophy tracker. No third-party guide text is copied.'));
  sourcerailEl.replaceChildren(frag);
}

function renderRoadmap() {
  const frag = document.createDocumentFragment();
  const done = trophies.filter((t) => earned.has(t.name)).length;
  const pct = Math.round((done / TOTAL) * 100);

  const banner = el('div', 'goal-banner');
  const left = el('div', 'goal-left');
  left.append(el('div', 'goal-kicker', 'Goal'));
  left.append(el('h2', 'goal-title', '100% completion + the platinum'));
  left.append(el('p', 'goal-sub', 'Finish the chapters in order, clear the time-sensitive strands early, then sweep the world and save 100% for last.'));
  const right = el('div', 'goal-right');
  right.append(el('div', 'goal-num', done + ' / ' + TOTAL));
  const bar = el('div', 'goal-bar');
  const fill = el('span');
  fill.style.width = pct + '%';
  bar.append(fill);
  right.append(bar, el('div', 'goal-pct', pct + '% earned'));
  banner.append(left, right);
  frag.append(banner);

  const missables = trophies.filter((t) => t.missable);
  const watch = el('section', 'watch');
  watch.append(el('h3', 'watch-title', 'Missable watch - ' + missables.length + ' trophies to do early'));
  const wgrid = el('div', 'watch-grid');
  for (const t of missables) {
    const card = el('button', 'watch-card');
    card.type = 'button';
    card.append(el('span', 'watch-name', isHidden(t) ? 'Hidden story trophy' : t.name));
    card.append(el('span', 'watch-stage', roadmapStages[t.roadmap_stage] || ''));
    card.addEventListener('click', () => {
      selected = t.id;
      switchView('checklist');
    });
    wgrid.append(card);
  }
  watch.append(wgrid);
  frag.append(watch);

  const stages = [...new Set(trophies.map((t) => t.roadmap_stage))].sort((a, b) => a - b);
  for (const stage of stages) {
    const list = trophies.filter((t) => t.roadmap_stage === stage);
    const sd = list.filter((t) => earned.has(t.name)).length;
    const section = el('section', 'stage');
    const head = el('div', 'stage-head');
    const h = el('div', 'stage-heading');
    h.append(el('h3', 'stage-title', roadmapStages[stage] || 'Stage ' + stage));
    h.append(el('p', 'stage-note', stageNotes[stage] || ''));
    const cnt = el('div', 'stage-count', sd + ' / ' + list.length);
    const sbar = el('div', 'stage-bar');
    const sfill = el('span');
    sfill.style.width = Math.round((sd / list.length) * 100) + '%';
    sbar.append(sfill);
    head.append(h, cnt, sbar);
    section.append(head);

    const grid = el('div', 'stage-grid');
    for (const t of list) {
      const card = el('button', 'rcard' + (earned.has(t.name) ? ' earned' : '') + (t.missable ? ' missable' : ''));
      card.type = 'button';
      const top = el('div', 'rcard-top');
      top.append(el('span', 'grade-pill ' + gradeColor(t.grade), t.grade));
      if (t.missable) top.append(el('span', 'missable-badge', 'Missable'));
      if (earned.has(t.name)) top.append(el('span', 'earned-badge', 'Earned'));
      card.append(top);
      card.append(el('div', 'rcard-name', isHidden(t) ? 'Hidden story trophy' : t.name));
      const meta = el('div', 'rcard-meta');
      meta.append(el('span', 'tkind', t.kind), el('span', 'trefs', refsOf(t)));
      card.append(meta);
      card.addEventListener('click', () => {
        selected = t.id;
        switchView('checklist');
      });
      grid.append(card);
    }
    section.append(grid);
    frag.append(section);
  }

  roadmapEl.replaceChildren(frag);
}

function renderSourcesView() {
  const frag = document.createDocumentFragment();

  const head = el('div', 'sources-head');
  head.append(el('h2', 'sources-title', 'Source ledger'));
  head.append(el('p', 'sources-sub', 'Every guide step carries one or more numbered citations. This is what each number means, and how often it backs a trophy.'));

  const usage = {};
  for (const t of trophies) for (const n of t.refs) usage[n] = (usage[n] || 0) + 1;

  const cards = el('div', 'source-cards');
  for (const key of Object.keys(sources).sort()) {
    const s = sources[key];
    const card = el('article', 'source-card big');
    card.append(el('span', 'refnum', '[' + key + ']'));
    const body = el('div', 'src-body');
    body.append(el('div', 'src-name', s.name));
    body.append(el('div', 'src-url', s.url ? s.url : 'In-game trophy description (no public URL)'));
    card.append(body);
    card.append(el('span', 'src-count', (usage[key] || 0) + ' trophies'));
    cards.append(card);
  }
  head.append(cards);
  frag.append(head);

  const matrix = el('div', 'matrix');
  const table = el('table');
  const thead = el('thead');
  const hr = el('tr');
  hr.append(el('th', 'm-name', 'Trophy'));
  for (const key of Object.keys(sources).sort()) hr.append(el('th', 'm-ref', '[' + key + ']'));
  hr.append(el('th', 'm-kind', 'Kind'));
  thead.append(hr);
  const tbody = el('tbody');
  for (const t of trophies) {
    const tr = el('tr');
    const nameCell = el('td', 'm-name');
    nameCell.append(el('span', 'gdot ' + gradeColor(t.grade)), document.createTextNode(t.name));
    tr.append(nameCell);
    for (const key of Object.keys(sources).sort()) {
      const cell = el('td', 'm-ref');
      if (t.refs.includes(Number(key))) cell.append(el('span', 'm-dot'));
      tr.append(cell);
    }
    tr.append(el('td', 'm-kind', t.kind));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  matrix.append(table);
  frag.append(matrix);

  frag.append(el('p', 'rail-note', 'Citations are applied from the official PS5 list [1], the trophy tracker [2] and the in-game description [3]. Where no official location is published, the guide says so instead of inventing one.'));

  sourcesEl.replaceChildren(frag);
}

function render() {
  renderHeader();
  renderAudit();
  renderChips();
  if (view === 'roadmap') renderRoadmap();
  else if (view === 'sources') renderSourcesView();
  else {
    renderList();
    renderDetail();
    renderSourceRail();
  }
}

function switchView(name) {
  if (!VIEWS.includes(name)) return;
  view = name;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === name));
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (location.hash.slice(1) !== name) {
    try {
      history.replaceState(null, '', '#' + name);
    } catch (e) {
      /* file:// may refuse; ignore */
    }
  }
  render();
}

$('export').addEventListener('click', () => {
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([JSON.stringify({ earned: [...earned] }, null, 2)], { type: 'application/json' }));
  a.href = url;
  a.download = 'gta6-trophy-progress.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('import').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.earned) ? parsed.earned : null;
    if (!list) throw new Error('shape');
    const known = new Set(trophies.map((t) => t.name));
    earned = new Set(list.filter((n) => known.has(n)));
    save();
    render();
  } catch (err) {
    alert('That file is not a valid progress export.');
  }
});

gradeEl.value = gradeFilter;
gradeEl.addEventListener('change', () => {
  gradeFilter = gradeEl.value;
  render();
});

spoilerEl.checked = spoilerMode;
spoilerEl.addEventListener('change', () => {
  spoilerMode = spoilerEl.checked;
  render();
});

document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (VIEWS.includes(h) && h !== view) switchView(h);
});

switchView(view);
