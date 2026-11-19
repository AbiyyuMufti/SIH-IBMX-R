// Builds the SIH walkthrough page from one folder of sih-walkthrough.js.
// In: <dir>/data.json and <dir>/fact.json. Out: <dir>/index.html (one file,
// data inline, no network). Asset ids are replaced by the asset name.
// Usage: node scripts/sih-walkthrough-page.js samples/sih-walkthrough/<day>
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] || '.');
const data = JSON.parse(readFileSync(resolve(dir, 'data.json'), 'utf8'));
const fact = JSON.parse(readFileSync(resolve(dir, 'fact.json'), 'utf8'));

// ---------- masking ----------
const names = new Map(data.machines.map((m) => [m.assetId, m.name]));
function mask(text) {
  return String(text)
    // No word boundary: ids also sit inside URL-encoded filters (%22<id>%22).
    .replace(/[0-9a-f]{32}/g, (id) => (names.has(id) ? `<${names.get(id)} id>` : '<id>'))
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '<id>');
}
// Short view of a JSON response: arrays cut to `keep` items, long text cut.
function excerpt(value, keep = 3) {
  if (Array.isArray(value)) {
    const head = value.slice(0, keep).map((v) => excerpt(v, keep));
    if (value.length > keep) {
      head.push(`… ${value.length - keep} more (${value.length} in total)`);
    }
    return head;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, excerpt(v, keep)]));
  }
  if (typeof value === 'string' && value.length > 240) {
    return value.slice(0, 240) + '…';
  }
  return value;
}
function pretty(text, keep) {
  try {
    return mask(JSON.stringify(excerpt(JSON.parse(text), keep), null, 2));
  } catch {
    return mask(String(text).slice(0, 2000));
  }
}

// ---------- the steps of the walkthrough ----------
// match: which recorded call(s) the step shows. tab = the SIH report daily tab
// makes this call today; extra = called only for this page.
const STEPS = [
  {
    id: 'token', part: 'tab', title: 'Get a token',
    match: (c) => /oauth\/token/.test(c.url),
    why: 'Every call needs a Bearer token. The technical user (client id and secret, Basic auth) gets one for about 30 minutes.',
    keep: 'access_token only (masked here).',
    feeds: []
  },
  {
    id: 'assets', part: 'tab', title: 'List the OEE assets',
    match: (c) => /\/oee-\d+\/v3\/assets$/.test(c.url),
    why: 'Every machine that the OEE app knows. The tab picks the Config lines of the site from it (Hull: B2 Line and GT4).',
    keep: 'assetId, name, isManual, reasonTreeId.',
    feeds: ['MachineName (via Config: B2 Line → B2 Auto)']
  },
  {
    id: 'hierarchy', part: 'tab', title: 'Read where the asset sits',
    match: (c) => /assetmanagement-\d+\/v3\/assets\/[0-9a-f]{32}$/.test(c.url),
    why: 'Asset Management gives the path reckitt / EU / site / area / line. The site comes from here.',
    keep: 'hierarchyPath names.',
    feeds: ['SiteName']
  },
  {
    id: 'kpis', part: 'tab', title: 'Hourly KPIs of the day',
    match: (c) => /evaluateKPIs$/.test(c.url) && c.body && !/"ORDER"/.test(c.body),
    why: 'The 30 OEE KPIs for the production day, one value per hour (groupedByDateTime). This is the heart of Plan and Time Utilisation. A read-style POST: it only calculates.',
    keep: 'Good parts, Total parts, Rejected parts, Total time, Planned stops, Operational time, Used operational time, Downtime duration, per hour.',
    feeds: ['Good Parts', 'Total Time', 'Planned OpT', 'OEE Time', 'OEE Time Total', 'Total Time Total', 'Planned OPT Total', 'All Time']
  },
  {
    id: 'config', part: 'tab', title: 'Asset setup',
    match: (c) => /\/assets\/[0-9a-f]{32}\/config$/.test(c.url) && c.part === 'tab',
    why: 'Where counts, product, order, speed and states come from (machine signal or manual), plus the calendar id and the product collection id.',
    keep: 'calendarId, productCollectionId.',
    feeds: []
  },
  {
    id: 'calendar', part: 'tab', title: 'Shift calendar',
    match: (c) => /calendarEvents/.test(c.url),
    why: 'The shift pattern as repeating events (rrule). The tab expands them to the shifts of the day and gives every hour its shift.',
    keep: 'name, duration, rrule (dtstart, interval, until).',
    feeds: ['ShiftName', 'Shift Time']
  },
  {
    id: 'filtervalues', part: 'tab', title: 'Products and orders of the day',
    match: (c) => /filterValues/.test(c.url),
    why: 'The Product and Order lists of the OEE app for the day: which products and orders ran.',
    keep: 'product names, order numbers.',
    feeds: ['PartName (name)', 'batch_id (order)']
  },
  {
    id: 'products', part: 'tab', title: 'Product master',
    match: (c) => /productCollections\/.*\/products/.test(c.url),
    why: 'Name, description, code and design speed of every product of the asset. The design speed gives Capacity and the loss units.',
    keep: 'name, description, designSpeed, designSpeedInterval.',
    feeds: ['PartName (description)', 'Capacity', 'Downtime Units', 'Loss Units', 'Volume Total']
  },
  {
    id: 'valuekpis', part: 'tab', title: 'Hourly KPIs per product and per order',
    match: (c) => /evaluateKPIs$/.test(c.url) && c.body && /"ORDER"/.test(c.body),
    why: 'The same KPI call, filtered on one product or one order. An hour with parts belongs to that product or order. One call per product and per order of the day.',
    keep: 'Total parts / Good parts per hour.',
    feeds: ['PartName per shift', 'Product Key', 'batch_id per stop']
  },
  {
    id: 'stops', part: 'tab', title: 'Stops with reasons',
    match: (c) => /downtimeReasons/.test(c.url),
    why: 'One row per stop (automatic asset) or per reason and shift (manual asset), with its reason. Source of the Loss rows.',
    keep: 'from, to, duration (ms), reason, reasonFullPath, commentCount.',
    feeds: ['Time', 'Duration', 'Time in Mins', 'OEELossLvl3Group', 'OEELossLvl3SubGroup', 'OEELossLvl3Desc', 'Lvl 3 Loss Name', 'Loss Final Level', 'Equipment', 'comment_count']
  },
  {
    id: 'manual', part: 'extra', title: 'Manual inputs (operator shift entries)',
    match: (c) => /manualInputs/.test(c.url),
    why: 'What an operator entered per production period on a manual asset: order, product, counts, reasons with minutes. Today the tab does not call it: the KPIs already contain it.',
    keep: 'Not used today.',
    feeds: []
  },
  {
    id: 'hourly', part: 'extra', title: 'Hourly entries (time series OEE_Hourly_Entry)',
    match: (c) => /OEE_Hourly_Entry/.test(c.url),
    why: 'The hourly form of the operator: shift name as entered, product, counts, reasons and comment texts. Not used by the tab.',
    keep: 'Not used today. ActorEmail is masked.',
    feeds: []
  },
  {
    id: 'comment', part: 'extra', title: 'Status comments',
    match: (c) => /\/comment\?/.test(c.url),
    why: 'Stand-alone comments on statuses.',
    keep: 'Not used today.',
    feeds: []
  },
  {
    id: 'reasons', part: 'extra', title: 'Reason tree',
    match: (c) => /reasontrees\/.*\/reasons/.test(c.url),
    why: 'All reasons an asset can give a stop, as a flat list with parentId. This is the list operators choose from.',
    keep: 'Not used today (the stop row already carries its path).',
    feeds: []
  },
  {
    id: 'sources', part: 'extra', title: 'Where product, order, speed and states come from',
    match: (c) => /(productSource|orderSource|designSpeedSource|stateTableSource)$/.test(c.url),
    why: 'mode CONNECTED = a variable (machine signal), MANUAL = an operator entry, VIA_PRODUCT = the product master, STATUS_RULE = a state table on a signal.',
    keep: 'Not used today. Shows which route (manual input or variable) fills what.',
    feeds: []
  }
];

// ---------- the SIH rows in the shape of EU_OEE_Fact (rules of e2) ----------
const DAY_MS = 86400000;
const isoDay = (n) => (typeof n === 'number' ? new Date(n * DAY_MS).toISOString().slice(0, 10) : n);
const clock = (ms) => (typeof ms === 'number'
  ? '1970-01-01 ' + new Date(ms).toISOString().slice(11, 19) : ms);
const RECORD = { Plan_OPT_EU: 'Plan', Time_Utilisation_EU: 'Time Utilisation', Daily_Losses_EU: 'Loss' };
const LOSS_RENAMES = { Date: 'Event Date', ShiftStartDate: 'Date', 'Shift colour': 'Shift Colour', target: 'Loss Target' };
const COLUMNS = fact.columns;
// Line list Dim/Machine_Names_EU.csv: SiteName,MachineName,Unique Machine Name,...
// shortcut: plain split, no quoted commas in the file today.
const lineList = {};
for (const line of (data.lineListCsv || '').split(/\r?\n/).slice(1)) {
  const cells = line.split(',');
  if (cells.length > 2) {
    lineList[cells[2].trim()] = true;
  }
}
const dropped = {};
const sihRows = [];
for (const [table, rows] of Object.entries(data.tab.rows)) {
  const type = RECORD[table];
  for (const src of rows) {
    const row = { 'Record Type': type };
    for (const [k, v] of Object.entries(src)) {
      const to = type === 'Loss' && LOSS_RENAMES[k] ? LOSS_RENAMES[k] : k;
      if (!COLUMNS.includes(to)) {
        dropped[k] = (dropped[k] || 0) + 1;
        continue;
      }
      row[to] = v;
    }
    // Same value, other type: the parquet writer stores day numbers and ms,
    // the live file reads back as text. Only these are converted here.
    for (const c of ['Date', 'Event Date']) {
      row[c] = isoDay(row[c]);
    }
    if (type === 'Loss') {
      row.Time = clock(row.Time);
    }
    // e2: the table flag moves to In EU Report Source, the line list decides.
    row['In EU Report Source'] = src['In EU Report'] ?? null;
    row['In EU Report'] = Boolean(lineList[row['Unique Machine Name']]);
    sihRows.push(row);
  }
}
const machinesShown = data.focus.map((n) => {
  const line = { 'B2 Line': 'B2 Auto' };
  return line[n] || n;
});
// Machines whose SIH loss rows all carry a shift start (manual reasons per
// shift, GT4): no stop times to pair on, so they pair on the loss name.
// isManual of the asset list is not enough: B2 Line is true there too.
const manualShown = new Set(machinesShown.filter((m) => {
  const losses = sihRows.filter((r) => r.MachineName === m && r['Record Type'] === 'Loss');
  const plans = sihRows.filter((r) => r.MachineName === m && r['Record Type'] === 'Plan');
  return losses.length && new Set(losses.map((r) => r.Time)).size <= plans.length;
}));
const liveRows = fact.rows.filter((r) => machinesShown.includes(r.MachineName));

// ---------- compare ----------
const empty = (v) => v === null || v === undefined || v === '';
function same(a, b) {
  if (empty(a) && empty(b)) {
    return 'both empty';
  }
  if (empty(a)) {
    return 'only SIH';
  }
  if (empty(b)) {
    return 'only live';
  }
  if (typeof a === 'number' && typeof b === 'number') {
    if (Math.abs(a - b) < 1e-6) {
      return 'same';
    }
    return Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b)) ? 'close' : 'differs';
  }
  if (String(a).trim() === String(b).trim()) {
    return 'same';
  }
  // Clock times of one stop: the two systems stamp it a few seconds apart.
  const clockA = Date.parse(String(a).replace(' ', 'T') + 'Z');
  const clockB = Date.parse(String(b).replace(' ', 'T') + 'Z');
  if (/^1970-01-01 /.test(a) && Math.abs(clockA - clockB) <= 60000) {
    return 'close';
  }
  return 'differs';
}
// Pairs: Plan = n-th shift of the machine (time order), TU = machine,
// Loss = machine + start minute (+ order when several start in one minute).
function pairs(type) {
  const live = liveRows.filter((r) => r['Record Type'] === type);
  const sih = sihRows.filter((r) => r['Record Type'] === type);
  const key = (r, i) => {
    if (type === 'Loss') {
      if (manualShown.has(r.MachineName)) {
        return r.MachineName + '|' + r['Lvl 3 Loss Name'];
      }
      return r.MachineName + '|' + String(r.Time).slice(11, 16);
    }
    if (type === 'Time Utilisation') {
      return r.MachineName;
    }
    return r.MachineName + '|#' + i;
  };
  const sortPlan = (rows) => rows.slice().sort((a, b) =>
    String(a.ShiftStartTime || '').localeCompare(String(b.ShiftStartTime || '')));
  const index = (rows) => {
    const map = new Map();
    const counter = {};
    (type === 'Plan' ? sortPlan(rows) : rows).forEach((r) => {
      const n = counter[r.MachineName] = (counter[r.MachineName] || 0) + 1;
      let k = key(r, n);
      let dup = 1;
      while (map.has(k + (dup > 1 ? '~' + dup : ''))) {
        dup++;
      }
      map.set(k + (dup > 1 ? '~' + dup : ''), r);
    });
    return map;
  };
  const L = index(live);
  const S = index(sih);
  const out = [];
  for (const [k, r] of L) {
    if (S.has(k)) {
      out.push([r, S.get(k), k]);
    }
  }
  return { live, sih, pairs: out };
}
const TYPES = ['Plan', 'Time Utilisation', 'Loss', 'Run Rate'];
const comparison = Object.fromEntries(TYPES.map((t) => [t, pairs(t)]));

// Column stats per record type: filled share live / SIH, outcome on pairs.
function colStats(type, col) {
  const c = comparison[type];
  const filled = (rows) => (rows.length ? rows.filter((r) => !empty(r[col])).length / rows.length : null);
  const outcome = {};
  for (const [a, b] of c.pairs) {
    const o = same(a[col], b[col]);
    outcome[o] = (outcome[o] || 0) + 1;
  }
  return { live: filled(c.live), sih: filled(c.sih), outcome, n: c.pairs.length };
}

// ---------- the column map: where each column comes from ----------
// kind: api = an API field, derived = computed from API fields, ref = a
// reference file, flow = set by the flow, none = SIH has nothing for it.
// manual / variable: could a manual input or a variable carry it?
const COL = {
  'Record Type': ['flow', 'Set by the flow per table.', '–', '–'],
  'Date': ['derived', 'Production day of the run window (Hull 06:00 to 06:00).', '–', '–'],
  'SiteName': ['api', 'Asset Management hierarchy (level 3) / Config site.', '–', '–'],
  'MachineName': ['flow', 'Config line: SIH name → report name (B2 Line → B2 Auto).', '–', '–'],
  'Unique Machine Name': ['derived', 'MachineName-Site.', '–', '–'],
  'ShiftName': ['api', 'Calendar event name, mapped by the Shift Patterns file. GT4 calendar says Morning Shift / Second Shift; the operator form (OEE_Hourly_Entry) says Red / Green.', 'yes: the hourly entry already carries ShiftName', 'no: fix the calendar names in SIH'],
  'Dept': ['ref', 'Line list Dim/Machine_Names_EU.csv.', '–', '–'],
  'Area': ['ref', 'Line list.', '–', '–'],
  'Product Type': ['ref', 'Line list.', '–', '–'],
  'In EU Report': ['ref', 'Line list (line on the list).', '–', '–'],
  'AreaName': ['none', 'Provideam area text (Hull Liquids). In the data it equals SiteName + " " + Area, so it can be derived.', '–', '–'],
  'PartName': ['api', 'Product description (else name) of the product of the hour. B2 descriptions are SAP texts, Provideam uses its own names.', 'yes (productName)', 'yes (product signal), but the text is the SIH product master'],
  'Good Parts': ['api', 'evaluateKPIs Good parts, summed per shift and product.', 'yes (good)', 'yes (counter)'],
  'Capacity': ['derived', 'Design speed per minute × Planned OpT.', 'needs design speed in the product master', 'same'],
  'Total Time': ['api', 'evaluateKPIs time KPIs (minutes).', 'yes (period)', 'yes'],
  'Planned OpT': ['api', 'evaluateKPIs Operational time.', 'yes (statuses)', 'yes'],
  'OEE Time': ['api', 'evaluateKPIs Used operational time.', 'yes', 'yes'],
  'Downtime Units': ['derived', 'Design speed × downtime minutes.', 'derived', 'derived'],
  'Product Key': ['derived', 'Unique Machine Name + " " + PartName.', '–', '–'],
  'UPDT Target': ['ref', 'Glidepaths file.', '–', '–'],
  'PDT Target': ['ref', 'Glidepaths file.', '–', '–'],
  'OEE Target': ['ref', 'Glidepaths file.', '–', '–'],
  'Defect Parts': ['api', 'evaluateKPIs Rejected parts exists; the tab does not write it yet.', 'yes (rejected)', 'yes (reject counter)'],
  'OEE': ['derived', 'OEE Time / Planned OpT (or the OEE KPI); the tab does not write it yet.', '–', '–'],
  'Shift Colour': ['derived', 'Hull: the shift colour = ShiftName. Not written by the tab yet.', 'yes (ShiftName)', 'no'],
  'ShiftStartTime': ['api', 'Calendar event start; the tab does not write it on Plan yet.', 'yes (startTime)', 'no'],
  'Target': ['derived', 'Equals Capacity in the live rows. Not written yet.', '–', '–'],
  'Targets Key': ['derived', 'MachineName + " 01/MM/YYYY". Not written yet.', '–', '–'],
  'Brand': ['ref', 'Format_List_EU by Product Key (only works when PartName is the Provideam text).', '–', '–'],
  'Unit Size': ['ref', 'Format_List_EU by Product Key.', '–', '–'],
  'Unit Count/Format': ['ref', 'Format_List_EU by Product Key.', '–', '–'],
  'Extra Info': ['ref', 'Format_List_EU by Product Key.', '–', '–'],
  'Data Source': ['flow', 'SIH or Provideam.', '–', '–'],
  'source_hours': ['flow', 'Hours behind a SIH Plan row (SIH only).', '–', '–'],
  'loaded_at': ['flow', 'Write time.', '–', '–'],
  'Event Date': ['api', 'Local date of the stop start.', 'yes', 'yes'],
  'Time': ['api', 'Stop start (B2: exact; GT4: shift start).', 'shift start only', 'yes (state signal)'],
  'OEELossLvl3Group': ['api', 'Reason path level 1 / planned roots. B2 stops carry the default reason Unplanned Downtime → Not Logged.', 'yes (statuses reasonId)', 'only via state table codes'],
  'OEELossLvl3SubGroup': ['api', 'Reason category, Not Logged when empty.', 'yes (reason tree)', 'via state table'],
  'OEELossLvl3Desc': ['api', 'Reason name.', 'yes', 'via state table'],
  'Duration': ['api', 'Stop duration. SIH gives ms, the live column is minutes: needs a conversion.', 'yes (duration ms)', 'yes'],
  'Breakdown Types': ['none', 'Provideam category (Adjustment, Planned Maintenance). Could be a reason tree level.', 'yes if the tree has the level', 'no'],
  'Comment': ['none', 'downtimeReasons gives only commentCount. GT4 hourly entries carry the comment text (Comments field).', 'yes (hourly entry Comments)', 'no'],
  'Volume Key': ['derived', 'DD/MM/YYYY machine group sub desc.', '–', '–'],
  'Loss Units': ['derived', 'Design speed × stop minutes.', '–', '–'],
  'Equipment': ['api', 'Reason sub group, else Unclassed. Provideam: Equipment Coding file.', 'yes if the tree has equipment', 'no'],
  'Loss Target Key': ['derived', 'Unique Machine Name + sub group + 01/MM/YYYY.', '–', '–'],
  'Value': ['ref', 'Glidepaths bucket of the sub group (only where names agree).', '–', '–'],
  'Volume Total': ['derived', 'Sum of Capacity of the machine and day.', '–', '–'],
  'Loss Final Level': ['api', 'Reason name.', 'yes', 'via state table'],
  'Batch ID': ['api', 'The order of the hour. The tab writes it as batch_id, which the fact mapping drops: rename needed.', 'yes (order)', 'yes (order signal)'],
  'Equipment Loss Key': ['derived', 'machine + desc.', '–', '–'],
  'Lvl 3 Loss Name': ['api', 'Reason name.', 'yes', 'via state table'],
  'Time in Mins': ['derived', 'Duration in minutes.', '–', '–'],
  'Shift Time': ['api', 'Shift of the stop.', 'yes', 'no'],
  'Loss Target': ['ref', 'Glidepaths / 100. The tab does not send it on loss rows.', '–', '–'],
  'comment_count': ['api', 'downtimeReasons commentCount (SIH only).', '–', '–'],
  'OEE Time Total': ['api', 'evaluateKPIs, day total.', 'yes', 'yes'],
  'Total Time Total': ['api', 'evaluateKPIs, day total.', 'yes', 'yes'],
  'Planned OPT Total': ['api', 'evaluateKPIs, day total.', 'yes', 'yes'],
  'All Time': ['derived', 'Length of the day in minutes.', '–', '–'],
  'In EU Report Source': ['flow', 'Flag of the source table.', '–', '–'],
  'RR Hours': ['derived', 'Hours with good parts per shift: possible from the hourly KPIs, not built for SIH.', 'hourly entries', 'yes'],
  'RR Good Parts': ['derived', 'Good parts of those hours: possible from the hourly KPIs, not built.', 'hourly entries', 'yes'],
  'RR Capacity': ['derived', 'Design speed × 60 per hour: possible, not built.', 'needs design speed', 'needs design speed']
};

const usedIn = Object.fromEntries(COLUMNS.map((c) => [c, TYPES.filter((t) =>
  fact.rows.some((r) => r['Record Type'] === t && !empty(r[c])))]));
const columnMap = COLUMNS.map((c) => {
  const [kind, from, manual, variable] = COL[c] || ['?', 'not described', '–', '–'];
  const stats = Object.fromEntries(usedIn[c].map((t) => [t, colStats(t, c)]));
  return { col: c, kind, from, manual, variable, usedIn: usedIn[c], stats };
});

// ---------- machines ----------
const CONFIG_LINES = { 'B2 Line': 'B2 Auto', GT4: 'GT4' };
const machines = data.machines.map((m) => {
  const errorCall = data.calls.find((c) => c.part === 'machines' && c.asset === m.name &&
    /evaluateKPIs/.test(c.url) && c.status >= 400);
  let error = null;
  if (errorCall) {
    try {
      error = JSON.parse(errorCall.response).errors[0].message;
    } catch {
      error = 'HTTP ' + errorCall.status;
    }
  }
  return {
    site: m.path[2] || '',
    area: m.path.slice(3).join(' / '),
    name: m.name,
    manual: m.isManual,
    configured: m.isConfigured,
    configLine: CONFIG_LINES[m.name] || '',
    inEu: Boolean(lineList[(CONFIG_LINES[m.name] || m.name) + '-' + (m.path[2] || '')]),
    good: m.kpi.good,
    total: m.kpi.total,
    oee: m.kpi.oee,
    missing: (m.kpi.missing || []).map((x) => x.value).join('; '),
    error
  };
});

// ---------- steps with their calls ----------
// Calendar and product collection ids belong to the asset whose config named them.
const owner = new Map();
for (const c of data.calls.filter((x) => /\/assets\/[0-9a-f]{32}\/config$/.test(x.url))) {
  const asset = names.get(c.url.match(/assets\/([0-9a-f]{32})/)[1]);
  try {
    const body = JSON.parse(c.response);
    owner.set(body.calendarId, asset);
    owner.set(body.productCollectionId, asset);
  } catch {
    // no JSON body: nothing to learn
  }
}
const steps = STEPS.map((s) => {
  const hits = data.calls.filter((c) => (s.part === 'tab' ? c.part === 'tab' : c.part === 'extra') && s.match(c));
  const byAsset = [];
  const seen = new Set();
  for (const c of hits) {
    const ownId = (c.url.match(/(calendars|productCollections)\/([0-9a-f]{32})/) || [])[2];
    const label = c.asset || owner.get(ownId) ||
      mask(c.url + (c.body || '')).match(/<([^>]+) id>/)?.[1] || '';
    const key = label + '|' + c.url.replace(/\?.*/, '').split('/').pop();
    if (seen.has(key) || byAsset.length >= (s.id === 'sources' ? 8 : 4)) {
      continue;
    }
    seen.add(key);
    byAsset.push({
      label,
      method: c.method,
      url: mask(c.url),
      body: c.body ? mask(JSON.stringify(JSON.parse(c.body), null, 2)) : null,
      status: c.status,
      ms: c.ms,
      response: pretty(c.response, s.id === 'reasons' ? 6 : 3),
      size: c.response.length
    });
  }
  return { ...s, match: undefined, count: hits.length, calls: byAsset };
});

// ---------- what a manual input push needs ----------
const gt4 = data.extras.GT4 || {};
const sample = gt4.manualInputs?.body?.manualInputs?.[0] || null;
const push = {
  fields: sample ? Object.entries(sample).map(([k, v]) => [k, Array.isArray(v) ? `array of ${v.length}` : typeof v, mask(JSON.stringify(excerpt(v, 2))).slice(0, 160)]) : [],
  entries: (gt4.manualInputs?.body?.manualInputs || []).map((e) => ({
    start: e.startTime, end: e.endTime, product: e.productName, order: e.order,
    good: e.good, rejected: e.rejected, statuses: (e.statuses || []).length
  })),
  virtual: (gt4.manualInputs?.body?.virtualPeriods || []).length,
  hourlyFields: gt4.hourly?.body?.[0] ? Object.keys(gt4.hourly.body[0]) : [],
  hourlyCount: (gt4.hourly?.body || []).length,
  reasonCounts: Object.fromEntries(data.focus.map((n) => [n, (data.extras[n]?.reasons?.body?.reasons || []).length])),
  gt4Roots: (gt4.reasons?.body?.reasons || []).filter((r) => !r.parentId).map((r) => r.name),
  sources: Object.fromEntries(data.focus.map((n) => [n, Object.fromEntries(
    ['productSource', 'orderSource', 'designSpeedSource', 'stateTableSource'].map((s) => [s, data.extras[n]?.[s]?.body?.mode || '?'])
      .concat(Object.entries(data.extras[n]?.config?.body?.operandSource || {}).map(([k, v]) => [k + ' parts', v.mode])))]))
};

// ---------- examples side by side ----------
const examples = Object.fromEntries(TYPES.map((t) => [t, comparison[t].pairs.slice(0, 5).map(([a, b, k]) => ({
  key: k,
  cells: COLUMNS.filter((c) => !empty(a[c]) || !empty(b[c])).map((c) => [c, a[c] ?? null, b[c] ?? null, same(a[c], b[c])])
}))]));
const sum = (rows, c) => rows.reduce((t, r) => t + (typeof r[c] === 'number' ? r[c] : 0), 0);
const totals = machinesShown.map((m) => {
  const L = (t) => liveRows.filter((r) => r.MachineName === m && r['Record Type'] === t);
  const S = (t) => sihRows.filter((r) => r.MachineName === m && r['Record Type'] === t);
  const lossMin = (rows, conv) => rows.reduce((t, r) => t + (typeof r['Time in Mins'] === 'number' ? r['Time in Mins'] : (r.Duration || 0) * conv), 0);
  return {
    machine: m,
    rows: TYPES.map((t) => [t, L(t).length, S(t).length]),
    measures: [
      ['Plan Good Parts', sum(L('Plan'), 'Good Parts'), sum(S('Plan'), 'Good Parts')],
      ['Plan Planned OpT (min)', sum(L('Plan'), 'Planned OpT'), sum(S('Plan'), 'Planned OpT')],
      ['Plan OEE Time (min)', sum(L('Plan'), 'OEE Time'), sum(S('Plan'), 'OEE Time')],
      ['Plan Capacity', sum(L('Plan'), 'Capacity'), sum(S('Plan'), 'Capacity')],
      ['TU OEE Time Total (min)', sum(L('Time Utilisation'), 'OEE Time Total'), sum(S('Time Utilisation'), 'OEE Time Total')],
      ['Loss minutes', lossMin(L('Loss'), 1), lossMin(S('Loss'), 1)],
      ['Loss minutes, unplanned', lossMin(L('Loss').filter((r) => /Unplanned/.test(r.OEELossLvl3Group)), 1), lossMin(S('Loss').filter((r) => !/^Planned/.test(r.OEELossLvl3Group)), 1)]
    ],
    lossNames: [
      top(L('Loss')), top(S('Loss'))
    ]
  };
});
function top(rows) {
  const by = {};
  for (const r of rows) {
    const k = [r.OEELossLvl3Group, r.OEELossLvl3SubGroup, r['Lvl 3 Loss Name']].join(' › ');
    by[k] = by[k] || [0, 0];
    by[k][0]++;
    by[k][1] += typeof r['Time in Mins'] === 'number' ? r['Time in Mins'] : 0;
  }
  return Object.entries(by).sort((a, b) => b[1][1] - a[1][1]).slice(0, 8);
}

// Findings written by hand after looking at a run: <dir>/findings.json
// {day, findings: [[group, title, text]]}, groups ok / flow / setup /
// coverage. Kept next to the data (client detail), not in this script.
let findings = { day: null, findings: [] };
try {
  findings = JSON.parse(readFileSync(resolve(dir, 'findings.json'), 'utf8'));
} catch {
  // none yet: the page shows only the generated list
}

const page = {
  findings: findings.findings,
  findingsDay: findings.day,
  day: data.day,
  window: data.window,
  platform: data.platform,
  builtAt: data.builtAt,
  focus: data.focus,
  machinesShown,
  callCount: data.calls.length,
  tabLog: data.tab.logs.map(mask),
  dropped,
  steps,
  machines,
  totals,
  examples,
  columnMap,
  push,
  referenceFiles: data.referenceFiles,
  factFiles: data.factFiles.map((f) => f.path)
};

const template = readFileSync(new URL('./sih-walkthrough-template.html', import.meta.url), 'utf8');
const html = template.replace('/*__DATA__*/null', JSON.stringify(page).replace(/</g, '\\u003c'));
writeFileSync(resolve(dir, 'index.html'), html);
console.log('page:', resolve(dir, 'index.html'), Math.round(html.length / 1024) + ' KB');
