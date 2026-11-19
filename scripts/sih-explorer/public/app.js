// SIH Explorer front end: five pages behind a top menu (hash routes).
// Data comes from the local server (/api/...); no secret reaches the browser.
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v) => (v === null || v === undefined || v === '' ? '<span class="muted">–</span>'
  : typeof v === 'number' ? v.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : esc(v));
const api = async (path, opts) => {
  const r = await fetch(path, opts);
  const body = await r.json();
  if (!r.ok) {
    throw new Error(body.error || 'HTTP ' + r.status);
  }
  return body;
};
const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const STATUS = { ok: 'OK', flow: 'Flow change', lacking: 'Lacking in SIH' };
const TYPES = ['Plan', 'Time Utilisation', 'Loss', 'Run Rate'];

const S = {
  meta: null,
  tree: null,
  asset: null,
  day: yesterday(),
  hour: '',
  step: 'kpis',
  tab: 'answer',
  results: {},
  open: new Set(),
  type: 'Plan',
  picked: new Set(),
  filter: 'all',
  search: '',
  fact: null,
  sih: null,
  notes: {}
};

function table(t) {
  if (!t) {
    return '<p class="muted">No table for this answer.</p>';
  }
  return '<table><thead><tr>' + t.head.map((h) => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
    t.rows.map((r) => '<tr>' + r.map((c) => '<td' + (typeof c === 'number' ? ' class="n"' : '') + '>' + fmt(c) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table>';
}
const nodeById = (id) => S.tree.nodes.find((n) => n.id === id);
const kindPill = (k) => (k ? '<span class="pill ' + (k === 'connected' || k === 'manual' ? k : 'grey') + '">' + esc(k) + '</span>' : '');
function pathNames(id) {
  const out = [];
  for (let n = nodeById(id); n; n = nodeById(n.parentId)) {
    out.unshift(n.name);
  }
  return out;
}
const lineKind = () => (nodeById(S.asset)?.kind === 'manual' ? 'manual' : 'connected');

// ---------------- Overview ----------------
function overview() {
  const steps = S.meta.steps;
  const lacking = (id) => S.meta.columns.filter((c) => c.steps.includes(id) && (c.status.connected === 'lacking' || c.status.manual === 'lacking')).length;
  return `
  <h1>How SIH data becomes EU_OEE_Fact</h1>
  <p class="muted">Per machine and production day.</p>
  <div class="flow" style="margin:14px 0 22px">
    <div class="stage"><b>1 · SIH API</b><span class="muted">calls per machine</span></div><span class="arrow">→</span>
    <div class="stage"><b>2 · SIH tab</b><span class="muted">builds Plan, Time Utilisation, Loss rows</span></div><span class="arrow">→</span>
    <div class="stage"><b>3 · Fact tab</b><span class="muted">maps to the 65 columns, adds the line list</span></div><span class="arrow">→</span>
    <div class="stage"><b>4 · Data lake</b><span class="muted">EU_OEE_Fact day files</span></div><span class="arrow">→</span>
    <div class="stage"><b>5 · Tableau</b><span class="muted">dashboards</span></div>
  </div>
  <h3>Step 1 in detail <span class="muted" style="font-weight:400">· click a call to try it</span></h3>
  <div class="chain">${steps.map((s, i) => `<a href="#/explorer" data-step="${s.id}" class="${s.used ? '' : 'extra'}">
    <div class="k">${i + 1} · ${s.used ? 'used today' : 'not used yet'}</div><b>${esc(s.title)}</b>
    <div class="k">${s.feeds.length} columns${lacking(s.id) ? ' · <span style="color:var(--bad)">' + lacking(s.id) + ' lacking</span>' : ''}</div></a>`).join('')}</div>
  <h3 style="margin-top:22px">Two kinds of line</h3>
  <div class="vs">
    <div class="panel"><span class="pill connected">connected</span> <b>machine signals</b>
      <ul><li>Counters and a state signal feed SIH</li><li>Every stop is an event with exact times</li><li>Stops have no operator reason unless someone sets one</li></ul></div>
    <div class="panel"><span class="pill manual">manual</span> <b>operator entries</b>
      <ul><li>Operators type counts and reasons per shift and hour</li><li>Stop call gives one row per reason and shift</li><li>Hourly entries hold start times and comments</li></ul></div>
  </div>`;
}

// ---------------- Explorer ----------------
function treeHtml() {
  const kids = (id) => S.tree.nodes.filter((n) => n.parentId === id).sort((a, b) => a.name.localeCompare(b.name));
  const hasOee = (n) => n.oee || kids(n.id).some(hasOee);
  const roots = S.tree.nodes.filter((n) => !nodeById(n.parentId));
  const q = S.search.toLowerCase();
  const match = (n) => !q || n.name.toLowerCase().includes(q) || kids(n.id).some(match);
  const li = (n) => {
    if (!match(n)) {
      return '';
    }
    const ch = kids(n.id).filter(match);
    const open = S.open.has(n.id) || (q && ch.length);
    return `<li><div class="row ${n.oee ? 'click' : ''} ${n.id === S.asset ? 'sel' : ''}" data-id="${n.id}">
      <span class="tw" data-tw="${n.id}">${ch.length ? (open ? '▾' : '▸') : ''}</span>
      <span class="nm ${hasOee(n) ? '' : 'dim'}">${esc(n.name)}</span>${n.oee ? kindPill(n.kind) : ''}</div>
      ${open && ch.length ? '<ul>' + ch.map(li).join('') + '</ul>' : ''}</li>`;
  };
  return '<ul>' + roots.map(li).join('') + '</ul>';
}
function explorer() {
  const n = S.asset && nodeById(S.asset);
  const right = !n ? '<p class="muted">Pick a machine with a badge in the tree.</p>' : `
    <div class="toolbar">
      <h1 style="margin:0">${esc(n.name)}</h1>${kindPill(n.kind)}
      <span class="muted">${esc(pathNames(n.id).join(' › '))}</span>
      <span class="grow"></span>
      <label>Day <input type="date" id="day" value="${S.day}"></label>
      <label>Day starts <input id="hour" size="2" placeholder="auto" value="${S.hour}"> h</label>
      <button class="primary" id="runall">Run all</button>
    </div>
    <div class="steps">
      <div class="steplist">${S.meta.steps.map((s, i) => {
        const r = S.results[s.id];
        const st = r ? (r.status < 400 ? 'done' : 'fail') : '';
        return `<button data-step="${s.id}" class="${s.id === S.step ? 'on' : ''}"><span class="num ${st}">${i + 1}</span>
          <span>${esc(s.title)}<div class="sub">${s.used ? 'used by the SIH tab' : 'not used yet'}${r ? ' · ' + r.ms + ' ms' : ''}</div></span></button>`;
      }).join('')}</div>
      <div class="detail panel" id="detail">${detail()}</div>
    </div>`;
  return `<div class="split"><div class="panel tree"><input id="search" placeholder="Search the SIH tree" style="width:100%;margin-bottom:8px" value="${esc(S.search)}">
    <div id="tree">${treeHtml()}</div><p class="muted" style="font-size:12px">Tree as in SIH Asset Management. Badges = OEE assets.</p></div>
    <div class="panel" style="overflow:auto">${right}</div></div>`;
}
function detail() {
  const s = S.meta.steps.find((x) => x.id === S.step);
  const r = S.results[s.id];
  const head = `<h3>${esc(s.title)}</h3><div class="why">${esc(s.why)}</div>
    <div class="feeds">${s.feeds.map((f) => '<span class="pill flow">' + esc(f) + '</span>').join('')}</div>`;
  if (!r) {
    return head + '<p><button class="primary" id="runone">Run this step</button></p>';
  }
  if (r.loading) {
    return head + '<p class="loading">Calling SIH…</p>';
  }
  const tabs = ['answer', 'request', 'raw'].map((t) => `<button class="seg ${S.tab === t ? 'on' : ''}" data-tab="${t}">${{ answer: 'Answer', request: 'Request', raw: 'Raw JSON' }[t]}</button>`).join('');
  let body = '';
  if (r.failed) {
    body = '<p class="err">' + esc(r.failed) + '</p>';
  } else if (S.tab === 'answer') {
    body = (r.error ? '<p class="err">HTTP ' + r.status + ': ' + esc(r.error) + '</p>' : '') + '<div class="tablebox">' + table(r.table) + '</div>';
  } else if (S.tab === 'request') {
    body = `<pre>${esc(r.request.method + ' ' + r.request.url)}${r.request.body ? '\n\n' + esc(JSON.stringify(r.request.body, null, 2)) : ''}</pre>
      <p class="muted">Day window: ${esc(r.window.from)} to ${esc(r.window.to)} (${esc(r.window.tz)}, day starts ${r.window.start}:00 local; SIH asset time zone: ${esc(r.window.sihTz)}). HTTP ${r.status}, ${r.ms} ms.</p>`;
  } else {
    const text = JSON.stringify(r.raw, null, 2);
    body = '<pre class="tablebox">' + esc(text.length > 300000 ? text.slice(0, 300000) + '\n… cut' : text) + '</pre>';
  }
  return head + '<div class="tabs">' + tabs + '</div>' + body;
}
async function runStep(id) {
  S.results[id] = { loading: true };
  render();
  try {
    S.results[id] = await api(`/api/step?asset=${S.asset}&day=${S.day}&hour=${S.hour}&step=${id}`);
  } catch (e) {
    S.results[id] = { failed: e.message, status: 999, ms: 0 };
  }
  render();
}

// ---------------- Fact columns ----------------
function columnsPage() {
  const oee = S.tree.nodes.filter((n) => n.oee && n.configured).sort((a, b) => pathNames(a.id).join('/').localeCompare(pathNames(b.id).join('/')));
  const kind = lineKind();
  const cols = S.meta.columns.filter((c) => c.types.includes(S.type))
    .filter((c) => S.filter === 'all' || c.status[kind] === S.filter)
    .filter((c) => !S.search || c.col.toLowerCase().includes(S.search.toLowerCase()));
  const factRows = (S.fact?.rows || []).filter((r) => r['Record Type'] === S.type);
  const sihRows = (S.sih?.rows || []).filter((r) => r['Record Type'] === S.type);
  const counts = { ok: 0, flow: 0, lacking: 0 };
  S.meta.columns.filter((c) => c.types.includes(S.type)).forEach((c) => counts[c.status[kind]]++);
  return `
  <div class="toolbar">
    <span>${TYPES.map((t) => `<button class="seg ${S.type === t ? 'on' : ''}" data-type="${t}">${t}</button>`).join('')}</span>
    <label>Line <select id="line">${oee.map((n) => `<option value="${n.id}" ${n.id === S.asset ? 'selected' : ''}>${esc(pathNames(n.id).slice(2).join(' › '))} (${n.kind})</option>`).join('')}</select></label>
    <label>Day <input type="date" id="fday" value="${S.day}"></label>
    <button class="primary" id="load">Load data</button>
    <span class="muted">${S.fact ? 'lake: ' + factRows.length + ' rows' + (S.sih ? ' · SIH: ' + sihRows.length + ' rows' : '') : ''}</span>
  </div>
  <div class="cols">
    <div class="panel collist">
      <input id="csearch" placeholder="Find a column" style="width:100%;margin-bottom:6px" value="${esc(S.search)}">
      <div style="margin-bottom:6px">${['all', 'ok', 'flow', 'lacking'].map((f) => `<button class="seg ${S.filter === f ? 'on' : ''}" data-filter="${f}">${f === 'all' ? 'All' : f === 'ok' ? counts.ok + ' OK' : f === 'flow' ? counts.flow + ' Flow' : counts.lacking + ' Lacking'}</button>`).join('')}</div>
      <div><a href="#" id="pickall">tick all shown</a> · <a href="#" id="picknone">none</a></div>
      ${cols.map((c) => `<label><input type="checkbox" data-col="${esc(c.col)}" ${S.picked.has(c.col) ? 'checked' : ''}><span class="dot ${c.status[kind]}"></span>${esc(c.col)}</label>`).join('')}
    </div>
    <div style="overflow:auto">${S.picked.size ? '<div class="cards">' + [...S.picked].map((name) => card(S.meta.columns.find((c) => c.col === name), factRows, sihRows, kind)).join('') + '</div>'
      : '<p class="muted">Tick columns on the left. They open here as cards, side by side.</p>'}</div>
  </div>`;
}
function distinct(rows, col) {
  const count = new Map();
  rows.forEach((r) => {
    const v = r[col];
    const k = v === null || v === undefined || v === '' ? '(empty)' : typeof v === 'number' ? Math.round(v * 100) / 100 : v;
    count.set(k, (count.get(k) || 0) + 1);
  });
  return [...count.entries()].sort((a, b) => b[1] - a[1]);
}
function valuesBox(rows, col, loaded) {
  if (!loaded) {
    return '<span class="muted">press Load data</span>';
  }
  if (!rows.length) {
    return '<span class="muted">no rows</span>';
  }
  const list = distinct(rows, col);
  return list.slice(0, 6).map(([v, n]) => `<div>${fmt(v)} <span class="muted">× ${n}</span></div>`).join('') +
    (list.length > 6 ? `<div class="muted">… ${list.length - 6} more values</div>` : '');
}
function card(c, factRows, sihRows, kind) {
  if (!c) {
    return '';
  }
  const st = c.status[kind];
  const stepTitle = (id) => S.meta.steps.find((s) => s.id === id)?.title || id;
  return `<div class="panel card"><h3>${esc(c.col)} <span class="pill ${st}">${STATUS[st]}</span>
    <span class="pill grey">${c.kind === 'sih' ? 'from SIH' : c.kind === 'ref' ? 'reference file' : 'set by flow'}</span></h3>
    <div class="lbl">How it is built</div><ol>${c.built.map((b) => '<li>' + esc(b) + '</li>').join('')}</ol>
    ${c.steps.length ? '<div class="lbl">SIH calls</div>' + c.steps.map((s) => `<a href="#/explorer" data-step="${s}" class="pill flow" style="text-decoration:none">${esc(stepTitle(s))}</a> `).join('') : ''}
    <div class="lbl">Values this day</div>
    <div class="vals"><div><div class="muted" style="font-size:12px">Live EU_OEE_Fact (lake)</div><div class="box">${valuesBox(factRows, c.col, !!S.fact)}</div></div>
      <div><div class="muted" style="font-size:12px">SIH (as the SIH tab builds it)</div><div class="box">${S.sih ? valuesBox(sihRows, c.col, true) : '<span class="muted">' + (S.fact ? 'this line is not built by the SIH tab yet' : 'press Load data') + '</span>'}</div></div></div>
    <div class="lbl">Connected / manual</div><span class="pill ${c.status.connected}">connected: ${STATUS[c.status.connected]}</span> <span class="pill ${c.status.manual}">manual: ${STATUS[c.status.manual]}</span>
    ${c.gap ? `<div class="gap ${st === 'flow' ? 'flow' : ''}">${esc(c.gap)}</div>` : ''}
    <div class="lbl">Notes: how we bridge it</div><textarea data-note="${esc(c.col)}" placeholder="Your note, saved on leaving the box">${esc(S.notes[c.col] || '')}</textarea></div>`;
}
async function loadData() {
  S.fact = null;
  S.sih = null;
  $('#view').querySelector('.toolbar .muted').textContent = 'loading lake rows…';
  try {
    S.fact = await api(`/api/fact?asset=${S.asset}&day=${S.day}`);
    const name = nodeById(S.asset).name;
    if (S.meta.tabLines.includes(name)) {
      render();
      $('#view').querySelector('.toolbar .muted').textContent += ' · building SIH rows (about 20 s)…';
      S.sih = await api(`/api/sihrows?day=${S.day}&machine=${encodeURIComponent(S.fact.machine)}`);
    }
  } catch (e) {
    alertLine(e.message);
  }
  render();
}
function alertLine(text) {
  const el = $('#view').querySelector('.toolbar .muted');
  if (el) {
    el.innerHTML = '<span class="err">' + esc(text) + '</span>';
  }
}

// ---------------- Gaps ----------------
function gapsPage() {
  const rows = S.meta.steps.map((s) => ({ title: s.title, used: s.used, cols: S.meta.columns.filter((c) => c.steps.includes(s.id)) }))
    .concat([{ title: 'Reference files and flow rules', used: true, cols: S.meta.columns.filter((c) => !c.steps.length) }]);
  const cell = (cols, k) => cols.filter((c) => c.status[k] !== 'ok').map((c) => `<span class="pill ${c.status[k]}" title="${esc(c.gap)}">${esc(c.col)}</span>`).join('') || '<span class="pill ok">all OK</span>';
  return `<h1>Where the process lacks</h1><p class="muted">Each SIH call with the columns it feeds that are not OK yet. Red = lacking in SIH, blue = possible with a flow change. Hover for the reason.</p>
  <div class="panel"><table class="matrix"><thead><tr><th style="width:230px">Step</th><th><span class="pill connected">connected line</span></th><th><span class="pill manual">manual line</span></th></tr></thead><tbody>
  ${rows.filter((r) => r.cols.length).map((r) => `<tr><td><b>${esc(r.title)}</b>${r.used ? '' : '<div class="muted" style="font-size:12px">not used by the SIH tab yet</div>'}</td><td>${cell(r.cols, 'connected')}</td><td>${cell(r.cols, 'manual')}</td></tr>`).join('')}
  </tbody></table></div>`;
}

// ---------------- Summary ----------------
function summaryPage() {
  const bar = (type, k) => {
    const cols = S.meta.columns.filter((c) => c.types.includes(type));
    const n = { ok: 0, flow: 0, lacking: 0 };
    cols.forEach((c) => n[c.status[k]]++);
    return `<div>${type} <span class="muted">${cols.length} columns</span></div><div class="bar">${['ok', 'flow', 'lacking'].map((s) => n[s] ? `<span class="${s}" style="width:${n[s] / cols.length * 100}%">${n[s]}</span>` : '').join('')}</div>`;
  };
  const top = (k) => S.meta.columns.filter((c) => c.status[k] === 'lacking').map((c) => `<li><b>${esc(c.col)}</b> <span class="muted">${esc(c.gap)}</span></li>`).join('');
  return `<h1>Summary</h1>
  <p><span class="pill ok">OK</span> SIH gives it &nbsp; <span class="pill flow">Flow change</span> possible, the flow must change &nbsp; <span class="pill lacking">Lacking</span> SIH has no data for it</p>
  <div class="grid2">
    <div class="panel bars"><h3><span class="pill connected">connected line</span></h3>${TYPES.map((t) => bar(t, 'connected')).join('')}</div>
    <div class="panel bars"><h3><span class="pill manual">manual line</span></h3>${TYPES.map((t) => bar(t, 'manual')).join('')}</div>
    <div class="panel"><h3>Lacking on a connected line</h3><ul>${top('connected')}</ul></div>
    <div class="panel"><h3>Lacking on a manual line</h3><ul>${top('manual')}</ul></div>
  </div>`;
}

// ---------------- router and events ----------------
async function render() {
  const page = (location.hash.replace('#/', '') || 'overview');
  document.querySelectorAll('nav.top a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#/' + page));
  const view = $('#view');
  if (!S.meta) {
    view.innerHTML = '<p class="loading">Loading…</p>';
    return;
  }
  if (!S.tree && (page === 'explorer' || page === 'columns')) {
    view.innerHTML = '<p class="loading">Reading the SIH asset tree (first time about 30 s)…</p>';
    return;
  }
  const html = { overview, explorer, columns: columnsPage, gaps: gapsPage, summary: summaryPage }[page] || overview;
  view.innerHTML = html();
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-step],[data-tab],[data-id],[data-tw],[data-type],[data-filter],#runall,#runone,#load,#pickall,#picknone');
  if (!t) {
    return;
  }
  if (t.dataset.tw) {
    S.open.has(t.dataset.tw) ? S.open.delete(t.dataset.tw) : S.open.add(t.dataset.tw);
    return render();
  }
  if (t.dataset.id) {
    const n = nodeById(t.dataset.id);
    if (n.oee) {
      S.asset = n.id;
      S.results = {};
      S.fact = null;
      S.sih = null;
    } else {
      S.open.has(n.id) ? S.open.delete(n.id) : S.open.add(n.id);
    }
    return render();
  }
  if (t.dataset.step) {
    S.step = t.dataset.step;
    S.tab = 'answer';
    if (location.hash !== '#/explorer') {
      return;
    }
    return render();
  }
  if (t.dataset.tab) {
    S.tab = t.dataset.tab;
    return render();
  }
  if (t.dataset.type) {
    S.type = t.dataset.type;
    S.picked.clear();
    return render();
  }
  if (t.dataset.filter) {
    S.filter = t.dataset.filter;
    return render();
  }
  if (t.id === 'runone') {
    return runStep(S.step);
  }
  if (t.id === 'runall') {
    return (async () => {
      for (const s of S.meta.steps) {
        S.step = s.id;
        await runStep(s.id);
      }
    })();
  }
  if (t.id === 'load') {
    return loadData();
  }
  if (t.id === 'pickall' || t.id === 'picknone') {
    e.preventDefault();
    if (t.id === 'picknone') {
      S.picked.clear();
    } else {
      document.querySelectorAll('[data-col]').forEach((c) => S.picked.add(c.dataset.col));
    }
    return render();
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'day' || t.id === 'fday') {
    S.day = t.value;
    S.results = {};
    S.fact = null;
    S.sih = null;
    return render();
  }
  if (t.id === 'hour') {
    S.hour = t.value.trim();
    S.results = {};
    return render();
  }
  if (t.id === 'line') {
    S.asset = t.value;
    S.results = {};
    S.fact = null;
    S.sih = null;
    return render();
  }
  if (t.dataset.col) {
    t.checked ? S.picked.add(t.dataset.col) : S.picked.delete(t.dataset.col);
    return render();
  }
  if (t.dataset.note !== undefined) {
    S.notes[t.dataset.note] = t.value;
    api('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ col: t.dataset.note, text: t.value }) });
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'search' || e.target.id === 'csearch') {
    S.search = e.target.value;
    const pos = e.target.selectionStart;
    const id = e.target.id;
    render();
    const el = document.getElementById(id);
    el.focus();
    el.setSelectionRange(pos, pos);
  }
});
window.addEventListener('hashchange', render);

(async () => {
  render();
  S.meta = await api('/api/meta');
  S.notes = await api('/api/notes');
  $('#platform').textContent = 'platform ' + S.meta.platform;
  render();
  S.tree = await api('/api/tree');
  const b2 = S.tree.nodes.find((n) => n.name === 'B2 Line' && n.oee);
  S.asset = b2 ? b2.id : null;
  for (let n = b2 && nodeById(b2.parentId); n; n = nodeById(n.parentId)) {
    S.open.add(n.id);
  }
  render();
})();
