// Read-only, no network. Which agreed dashboard page uses which column of
// our report tables, read from the EU, Nottingham and Hull Power BI
// templates. A measure or calculated column counts for every base column it
// reads (followed recursively). Site table and column names are mapped to
// ours. Writes diagrams/data/site-column-usage.json for
// scripts/build-drawio-site-dashboards.js.
// Usage: node scripts/helper-site-column-usage.js
// The templates hold customer names and paths: keep them outside git.
import { writeFileSync } from 'node:fs';
import { readPbitModel, readPbixUsage } from './lib-office.js';

const OUTPUT = 'diagrams/data/site-column-usage.json';

// Templates and the agreed pages of each (prefix shown in the diagram).
const REPORTS = [
  {
    prefix: 'EU',
    file: '../ReportReplica/EU Daily OEE Report 2025 V1 1/Temp EU Daily OEE Report 2025 V1 1.pbit',
    pages: [
      'EU-Level Overview',
      'Site-Level Overview',
      'Planned Losses',
      'Unplanned Losses',
    ],
  },
  {
    prefix: 'N',
    file: 'downloads/pbix_template/Nottingham Site OEE Report 2025 V1 (8).pbit',
    pages: [
      'Homepage',
      'Loss Tree',
      'Unplanned Loss Tree',
      'L2/L3 FIT View',
      'Planned Losses',
      'Unplanned Losses',
      'Maintenance (BETA)',
      'Loss Trending',
      'By Shift Breakdown',
      'By Format Breakdown',
      'OEE Trending',
      'Volume Trending',
      'VSU Homepage',
      'VSU Losses',
      'Historical OEE',
    ],
  },
  {
    prefix: 'H',
    file: 'downloads/pbix_template/Hull Site OEE Report 2025 V3.1 (2).pbit',
    pages: [
      'Unplanned Losses Daily Report',
      'OEE/LOSS GRAPH',
      'Monthyly breakdown',
      'Unplanned Losses (frequency)',
    ],
  },
];

// Power BI table -> our table. Lookups go to pseudo tables.
const TABLE_MAP = {
  'Plan OPT N': 'Plan_OPT_EU',
  'New Plan OPT': 'Plan_OPT_EU',
  'Plan OPT EU': 'Plan_OPT_EU',
  'Time Utilisation N': 'Time_Utilisation_EU',
  'Time Utilisation': 'Time_Utilisation_EU',
  'Time Utilisation EU': 'Time_Utilisation_EU',
  'Daily Line Losses N': 'Daily_Losses_EU',
  'New Daily Line Losses': 'Daily_Losses_EU',
  'Daily Losses EU': 'Daily_Losses_EU',
  'Run Rates N': 'Run_Rates_EU',
  'Run Rates': 'Run_Rates_EU',
  'Run Rates EU': 'Run_Rates_EU',
  'Volume CoV N': 'Volume_CoV_EU',
  'Volume CoV': 'Volume_CoV_EU',
  'Volume CoV EU': 'Volume_CoV_EU',
  'Format List': 'Format_List_EU',
  'Format List EU': 'Format_List_EU',
  'Historical OEE N': 'Historical_OEE_EU',
  'Historical OEE': 'Historical_OEE_EU',
  'Machine Names N': 'Machine Names (lookup)',
  'New Machine Names': 'Machine Names (lookup)',
  'Machine Names EU': 'Machine Names (lookup)',
  'Shift Naming N': 'Shift (lookup)',
  'Shift Naming': 'Shift (lookup)',
  'Shift Naming EU': 'Shift (lookup)',
  'Shift Colours': 'Shift (lookup)',
  Calendar: 'Calendar (Tableau)',
};

// Site column name -> our column name (where they differ).
const COLUMN_MAP = {
  PartDesc: 'PartName',
  'ShiftStartDate.1': 'ShiftStartDate',
  'Breakdown Classification': 'Breakdown Types',
  'YYYY-MM-DD': 'Date',
  'Shift Colour': 'Shift',
  'Shift Type': 'ShiftName',
};

// References in DAX: 'Table'[Col], Table[Col], [Name].
function refs(dax) {
  const out = [];
  const re = /(?:'([^']+)'|([A-Za-z_][\w ]*?))?\[([^\]]+)\]/g;
  for (const m of String(dax ?? '').matchAll(re)) {
    out.push({ table: m[1] ?? (m[2] ? m[2].trim() : null), name: m[3] });
  }
  return out;
}

const usage = {};
const add = (table, column, page) => {
  usage[table] = usage[table] ?? {};
  const set = new Set(usage[table][column] ?? []);
  set.add(page);
  usage[table][column] = [...set];
};

for (const report of REPORTS) {
  const model = readPbitModel(report.file);
  const measures = new Map();
  const calc = new Map();
  // Real columns only: DAX variables and stale filters are dropped.
  const columns = new Set();
  for (const t of model.tables) {
    for (const m of t.measures) {
      measures.set(m.name, { table: t.name, expression: m.expression });
    }
    for (const c of t.columns) {
      columns.add(`${t.name}|${c.name}`);
      if (c.calculated) {
        calc.set(`${t.name}|${c.name}`, c.expression);
      }
    }
  }
  // Base columns behind a table|name (column or measure), recursively.
  const base = (table, name, seen = new Set()) => {
    const key = `${table}|${name}`;
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    let expression = null;
    let home = table;
    if (measures.has(name) && (!table || measures.get(name).table === table || !calc.has(key))) {
      expression = measures.get(name).expression;
      home = measures.get(name).table;
    } else if (calc.has(key)) {
      expression = calc.get(key);
    } else {
      return columns.has(key) ? [[table, name]] : [];
    }
    const out = [];
    for (const r of refs(expression)) {
      out.push(...base(r.table ?? home, r.name, seen));
    }
    return out;
  };
  const { columnPages } = readPbixUsage(report.file);
  for (const [key, pages] of columnPages) {
    const [table, name] = key.split('|');
    const agreed = [...pages].filter((p) => report.pages.includes(p));
    if (agreed.length === 0) {
      continue;
    }
    for (const [t, c] of base(table, name)) {
      const ours = TABLE_MAP[t];
      if (!ours) {
        continue;
      }
      for (const page of agreed) {
        add(ours, COLUMN_MAP[c] ?? c, `${report.prefix}: ${page}`);
      }
    }
  }
}

writeFileSync(OUTPUT, `${JSON.stringify(usage, null, 1)}\n`);
for (const [table, cols] of Object.entries(usage)) {
  console.log(`${table}: ${Object.keys(cols).length} columns used`);
}
console.log(`Wrote ${OUTPUT}`);
