// Shared by the builder and the test of the tab Chartres live: the text that
// replaces __COLUMNS__ in scripts/vfc/y5-route-tables.js (column names of the
// four tables, one per line, so the function node stays readable).
import {
  pbiPlanSchema,
  reportUtilSchema,
  pbiLossSchema,
  reportCovSchema,
} from './lib-pbi-report-schemas.js';

export const LIVE_TABLES = {
  Plan_OPT_EU: pbiPlanSchema,
  Time_Utilisation_EU: reportUtilSchema,
  Daily_Losses_EU: pbiLossSchema,
  Volume_CoV_EU: reportCovSchema,
};

export function columnsSource() {
  const tables = Object.entries(LIVE_TABLES).map(([table, schema]) => {
    const names = schema.map(([name]) => `    '${name.replace(/'/g, "\'")}'`).join(',\n');
    return `  ${table}: [\n${names}\n  ]`;
  });
  return `var COLUMNS = {\n${tables.join(',\n')}\n};`;
}

// The function code of a node with its tokens replaced (builder and test).
export function liveCode(file, code) {
  return code(file).replace('var COLUMNS = {};', columnsSource());
}
