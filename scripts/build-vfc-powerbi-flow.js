// Builds the importable VFC flow flows/vfc-powerbi-tables.json.
// It reads the parquet files the other flows wrote (dim_asset, dim_shift,
// fact_kpi, fact_loss) and writes the tables of the Power BI report:
//   pbi_plan_opt, pbi_time_utilisation, pbi_daily_losses (per day),
//   pbi_machine_names, pbi_shift_naming (per site), pbi_calendar.
// No call to Insights Hub. Usage: node scripts/build-vfc-powerbi-flow.js
// Function code: scripts/vfc/p*.js. Do not edit the JSON by hand.
import { writeFileSync, mkdirSync } from 'node:fs';
import { validateFlow } from './validate-flow.js';
import {
  code, makeBuilder, fn, linkInStep, end, split, delay,
  addLogLanes, pqRead, readStep, joinTimeout
} from './lib-flow-builder.js';
import {
  planSchema, utilSchema, lossSchema, machineSchema, shiftSchema,
  calendarSchema
} from './lib-pbi-schemas.js';

// cron = daily schedule (UTC), 30 minutes after the fact flow (07:00).
const SITES = [{ name: 'Hull', cron: '30 7 * * *' }];

// Parquet, path and write object: the end of a table lane.
const tableEnd = (table, schema) => [
  { t: 'parquet', key: `${table}_pq`, table, schema },
  fn(`${table}_path`, `Set ${table} path`, 's6-set-path.js', ['next'],
    { __TABLE__: table }),
  { t: 'write', key: `${table}_write`, table }
];

const keep = (key, name, keepName, nextName) =>
  fn(key, name, 'p2-keep-next.js', ['next'],
    { __KEEP__: keepName, __NEXT__: nextName });

function buildFlow(site, index) {
  const b = makeBuilder(200 + index);
  const { add, id, col, rowY, comment, lane, linkOut } = b;
  let r = 1;

  const stage1 = b.nextStage();
  comment(
    `[${stage1}] TRIGGERS & SETTINGS`,
    `STAGE ${stage1} - TRIGGERS AND SETTINGS. Site ${site.name}. Schedule: daily at ${site.cron} (UTC), 30 minutes after the fact flow. Backfill: edit the inject payload {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"} (production days) and click the button. 1.1 is the only node to edit: site name, dry-run switch, rebuild days, calendar range. The shared settings come from the Config tab. dryRun is true by default. 1.2 sends ONE MESSAGE PER DAY (one per 5 s). 1.3 builds the calendar table once per run. This flow only READS files from the data lake that the fact flow and the reference flow wrote. It never calls Insights Hub.`,
    r
  );
  const inject = (name, dy, extra) => add({
    id: b.newId(), type: 'inject', name, topic: '', repeat: '',
    repeatEnd: '0', endTime: '0', offset: 'NaN', once: false, properties: '',
    timezone: 'UTC', betweentimesunit: 'm', showNextExecution: false,
    powerMode: false, x: col(0), y: rowY(r) + dy, wires: [[id('settings')]],
    ...extra
  });
  inject(`Schedule ${site.cron}`, -40, {
    payload: '', payloadType: 'date', crontab: site.cron
  });
  inject('Backfill (edit payload)', 40, {
    payload: '{"start":"2026-09-01","end":"2026-09-03"}',
    payloadType: 'json', crontab: ''
  });
  add({
    id: id('settings'), type: 'function',
    name: '1.1 POWER BI SETTINGS (edit here)',
    func: code('p1-settings.js').replace('__SITE__', site.name),
    outputs: 1, language: 'javascript', noerr: 0, x: col(1), y: rowY(r),
    wires: [[id('daysFn'), id('calFn')]]
  });
  add({
    id: id('daysFn'), type: 'function', name: '1.2 Build day list',
    func: code('s1-build-days.js'), outputs: 1, language: 'javascript',
    noerr: 0, x: col(2), y: rowY(r), wires: [[id('dayDelay')]]
  });
  add({
    id: id('dayDelay'), type: 'delay', name: 'One day per 5 s',
    pauseType: 'rate', timeout: '5', timeoutUnits: 'seconds', rate: '1',
    nbRateUnits: '5', rateUnits: 'second', randomFirst: '1', randomLast: '5',
    randomUnits: 'seconds', drop: false, powerMode: false, x: col(3),
    y: rowY(r), wires: [[linkOut('DAY', col(4), rowY(r))]]
  });
  add({
    id: id('calFn'), type: 'function', name: '1.3 Build calendar rows',
    func: code('p1-build-calendar.js'), outputs: 2, language: 'javascript',
    noerr: 0, x: col(2), y: rowY(r) + 100,
    wires: [
      [linkOut('WRITE pbi_calendar', col(3), rowY(r) + 100)],
      [linkOut('LOG', col(3), rowY(r) + 160)]
    ]
  });
  r++;

  lane(r++, 'LOAD REFERENCE',
    'one message per day. 2.1 sets the path of dim_asset, the read object node loads the file and the parquet node turns it into rows. 2.2 keeps the rows and sets the path of dim_shift, 2.3 keeps them and sets the path of the day file of fact_kpi. A file that does not exist only gives a warning in the debug sidebar and the day stops here (the read node sends nothing).',
    [
      linkInStep('DAY'),
      fn('firstFn', 'Set dim_asset path', 'p2-first-path.js', ['next']),
      readStep('rdAsset', 'Read dim_asset'),
      pqRead('pqAsset', 'Parquet read dim_asset'),
      joinTimeout('jnAsset', 'Collect dim_asset rows', 3),
      keep('keepAsset', 'Keep dim_asset', 'dim_asset', 'dim_shift'),
      readStep('rdShift', 'Read dim_shift'),
      pqRead('pqShift', 'Parquet read dim_shift'),
      joinTimeout('jnShift', 'Collect dim_shift rows', 3),
      keep('keepShift', 'Keep dim_shift', 'dim_shift', 'fact_kpi'),
      end('FACTS')
    ]);
  lane(r++, 'LOAD FACTS',
    'reads the day file of fact_kpi and then of fact_loss, with the same pattern. After the last file all four tables of the day are in the message (msg.tables).',
    [
      linkInStep('FACTS'),
      readStep('rdKpi', 'Read fact_kpi'),
      pqRead('pqKpi', 'Parquet read fact_kpi'),
      joinTimeout('jnKpi', 'Collect fact_kpi rows', 3),
      keep('keepKpi', 'Keep fact_kpi', 'fact_kpi', 'fact_loss'),
      readStep('rdLoss', 'Read fact_loss'),
      pqRead('pqLoss', 'Parquet read fact_loss'),
      joinTimeout('jnLoss', 'Collect fact_loss rows', 3),
      keep('keepLoss', 'Keep fact_loss', 'fact_loss', ''),
      end('BUILD')
    ]);
  lane(r++, 'BUILD TABLES',
    'the Power BI rows of the day. 4.1 groups the hourly fact_kpi rows to machine x production day x shift (pbi_plan_opt) and to machine x day (pbi_time_utilisation). 4.2 turns every stop into a row of pbi_daily_losses (local time, loss group, sub group, equipment). 4.3 builds one message per table plus the machine names and shift names of the site; in dry-run mode it writes nothing, only a log line. Columns without data in Insights Hub are written as null.',
    [
      linkInStep('BUILD'),
      fn('planFn', 'Build plan opt rows', 'p3-plan-opt.js', ['next']),
      fn('lossFn', 'Build daily loss rows', 'p3-daily-losses.js', ['next']),
      fn('tablesFn', 'Build table messages', 'p3-table-messages.js',
        [
          'WRITE pbi_plan_opt',
          'WRITE pbi_time_utilisation',
          'WRITE pbi_daily_losses',
          'WRITE pbi_machine_names',
          'WRITE pbi_shift_naming',
          'LOG'
        ], {}, true)
    ]);
  const writes = [
    ['pbi_plan_opt', planSchema, 'Plan OPT EU: machine x production day x shift'],
    ['pbi_time_utilisation', utilSchema, 'Time Utilisation EU: machine x day'],
    ['pbi_daily_losses', lossSchema, 'Daily Losses EU: one row per stop'],
    ['pbi_machine_names', machineSchema, 'Machine Names EU: one row per machine'],
    ['pbi_shift_naming', shiftSchema, 'Shift Naming EU: one row per shift'],
    ['pbi_calendar', calendarSchema, 'Calendar: one row per date']
  ];
  writes.forEach(([table, schema, what]) => {
    lane(r++, `WRITE ${table}`,
      `parquet node, path and write object for ${table} (${what}). A rerun replaces the file. Types: UTF8 (STRING), INT64, DOUBLE, TIMESTAMP_MILLIS. Dates are text YYYY-MM-DD.`,
      [linkInStep(`WRITE ${table}`), ...tableEnd(table, schema)]);
  });
  addLogLanes(b, r, 'powerbi');

  b.nodes.unshift({
    id: b.TAB, type: 'tab', label: 'Power BI tables',
    disabled: false, allowCycles: false,
    info: `Writes the Power BI shaped tables of site ${site.name} to the data lake, from the files of the fact flow and the reference flow. No call to Insights Hub. Needs the Config tab.`
  });
  return b.nodes;
}

mkdirSync(new URL('../flows/', import.meta.url), { recursive: true });
SITES.forEach((site, index) => {
  const file = 'vfc-powerbi-tables.json';
  const nodes = buildFlow(site, index);
  const { errors, warnings, stats } = validateFlow(nodes);
  if (errors.length) {
    throw new Error(`flow check failed for ${file}:\n  ${errors.join('\n  ')}`);
  }
  writeFileSync(new URL(`../flows/${file}`, import.meta.url),
    JSON.stringify(nodes, null, 2) + '\n');
  console.log(
    `written flows/${file}: ${stats.nodes} nodes, ${stats.linkIn} link in / ` +
      `${stats.linkOut} link out, longest line ${stats.longestLine}`
  );
  warnings.forEach((w) => console.log(`warn: ${w}`));
});
