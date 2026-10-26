// Builds diagrams/site-dashboards-reconcile.drawio: how the EU report, the Hull
// site report and the Nottingham site report turn the raw Provideam exports
// into the three visualization tables (Daily Losses, Time Utilisation,
// Plan OPT). One page per table, three lanes side by side (EU | Hull |
// Nottingham), one row per logical step, so a difference is on the same row.
// Source: the M steps of the three templates (see
// prompt-response/site-dashboards-analysis.md 1.3 and 4a, and the notebook
// analysis/site-dashboards-reconcile.ipynb).
// The diagram holds SharePoint folder names: keep it out of git.
// Usage: node scripts/build-drawio-reconcile.js
import { writeFileSync } from 'node:fs';

const OUTPUT = 'diagrams/site-dashboards-reconcile.drawio';

const KIND = {
  src: { fill: '#dae8fc', stroke: '#6c8ebf', w: 1 },
  same: { fill: '#f5f5f5', stroke: '#666666', w: 1 },
  diff: { fill: '#ffe6cc', stroke: '#d79b00', w: 2 },
  none: { fill: '#ffffff', stroke: '#b3b3b3', w: 1, dashed: true },
  end: { fill: '#fff2cc', stroke: '#b8860b', w: 4, bold: true },
};
const LANES = ['EU report', 'Hull site report', 'Nottingham site report'];
const LABEL_W = 150;
const LANE_W = 340;
const GAP = 40;
const TOP = 150;
const CHAR_W = 6.1;
const LINE_H = 15;

const NONE = ['none', '(step not in this report)'];

// Row: [label, [kind, text] for EU, Hull, Nottingham]
const PAGES = [];

PAGES.push({
  name: 'Daily Losses',
  title: 'Daily Losses: from Line Losses exports to the visualization table',
  rows: [
    ['RAW SOURCE\n(SharePoint folder)', [
      ['src', 'Line Losses/ of each site (Nottingham: PowerBI/EU OEE Dashboard ASz/, Hull: General/Power BI/OEE Board A Sz/). Every file in the folder, in listing order.'],
      ['src', 'General/Power BI/OEE Board A Sz/Line Losses/. Every file, sorted by Date created, newest first.'],
      ['src', 'PowerBI/EU OEE Dashboard ASz/Line Losses/. Every file in the folder, in listing order.'],
    ]],
    ['Clean names', [
      ['same', 'Sub group Breakdown - Mechanical / Electrical becomes Breakdown (copy kept as Breakdown Types). Drop rows with empty MachineName. Nottingham also: group Planned Losses becomes Planned Loss.'],
      ['same', 'Same: Breakdown - Mechanical / Electrical becomes Breakdown, empty MachineName dropped.'],
      ['same', 'Same, plus group Planned Losses becomes Planned Loss.'],
    ]],
    ['Removed Duplicates', [
      ['same', 'Key = MachineName + stop start time. First row kept, in listing order.'],
      ['diff', 'Key = MachineName + stop start time. First row kept, but files were sorted newest first, so a stop in two files keeps the newest copy.'],
      ['same', 'Key = MachineName + stop start time. First row kept, in listing order.'],
    ]],
    ['Filter rows', [
      ['same', 'Group not empty and not 0.Review Data. Drop machines B1 - Auto, B4 Auto, B5 Auto.'],
      ['same', 'Same.'],
      ['same', 'Same.'],
    ]],
    ['Shift lookup', [
      ['diff', 'Join Shift Naming Provideam (EU OEE Regional ASZ/Shift Coding Provideam/) on ShiftName, gives Shift Time.'],
      ['diff', 'No join: ShiftName split at "-" into Shift Type and Shift Colour (empty becomes Pink).'],
      ['diff', 'Join Shift Naming N (EU OEE Dashboard ASz/Shift Pattern Naming/, has a Day column).'],
    ]],
    ['Volume Loss Correction', [
      ['same', 'Left join on shift-start day + machine + group + sub group + desc, gives Loss Units and Time in Mins. Lookup: Volume Loss Correction/ of the site. A repeated key multiplies rows.'],
      ['same', 'Same lookup: General/Power BI/OEE Board A Sz/Volume Loss Correction/.'],
      ['same', 'Same lookup: PowerBI/EU OEE Dashboard ASz/Volume Loss Correction/ (group names fixed).'],
    ]],
    ['Sub group names (1)', [
      ['same', 'Nottingham: Breaks and Meal becomes Meals & Breaks, Lack of resources becomes Lack of Resource. Hull: also Adjustments becomes Adjustment.'],
      ['same', 'Adjustments becomes Adjustment, Breaks and Meal becomes Meals & Breaks, Lack of resources becomes Lack of Resource.'],
      ['same', 'Breaks and Meal becomes Meals & Breaks, Lack of resources becomes Lack of Resource.'],
    ]],
    ['Equipment Coding', [
      ['same', 'Left join on MachineName + stop description, gives Equipment (empty becomes Unclassed). Lookup: Equipment Coding/ of the site.'],
      ['same', 'Same: General/Power BI/OEE Board A Sz/Equipment Coding/.'],
      ['same', 'Same: PowerBI/EU OEE Dashboard ASz/Equipment Coding/.'],
    ]],
    ['Keep loss groups', [
      ['same', 'Keep only Not Logged, Planned Loss, Unplanned Loss.'],
      ['same', 'Same.'],
      ['same', 'Same.'],
    ]],
    ['Sub group names (2)', [
      ['diff', 'Hull: Text.Proper plus 12 renames (Adjustments, Minor Stops, Breaks / Meals, Product Changeover, In Process Quality ...). Nottingham: 6 renames (same list as the site).'],
      ['diff', 'Raw names kept (Adjustment, Minor Stop, Meals & Breaks ...).'],
      ['same', '6 renames: Minor Stops, Lack Of Resources, Others, Breaks / Meals, In Process Quality, Start up and Sanitisation.'],
    ]],
    ['Loss targets (Value)', [
      ['diff', 'Left join on machine-site + sub group + month (Unique Machine Name) with the regional glidepath (EU OEE Regional ASZ, has Site Name).'],
      ['diff', 'Left join on MachineName + sub group + month with the Hull glidepath (Targets GlidePath/, raw Hull sub group names, in percent).'],
      ['diff', 'Left join on MachineName + sub group + month with the Nottingham glidepath (GlidePath Targets/, downtime rows as fractions).'],
    ]],
    ['Volume Total', [
      ['same', 'Left join on machine + day with the Plan OPT files grouped by day and machine, sum of Capacity (Plan OPT/ of the site).'],
      ['same', 'Same, Plan OPT/ without GT4 - Auto.'],
      ['same', 'Same, Plan OPT/ without N11 Auto.'],
    ]],
    ['Calculated columns', [
      ['diff', 'Duration read as hours:minutes, SECONDS DROPPED. Loss in CUs = Loss Units x Duration / Time in Mins, then renamed Loss Units. Target = Value / 100.'],
      ['diff', 'Duration (Minutes) = h x 60 + m + s / 60. Loss in CUs = Loss Units x Duration / Time in Mins. Target % = Value / 100.'],
      ['diff', 'Same as Hull site: seconds kept.'],
    ]],
    ['Machine filter (last step)', [
      ['diff', 'Hull: drop 19 process machines (4 Tonne, 6 Tonne, 6000L, GG4 to GG7, Senokot Press, ...). Nottingham: drop 9 (Bosch, Fette*, Gran0, S14).'],
      NONE,
      NONE,
    ]],
    ['COMBINE', [
      ['diff', 'Union of the site queries: Daily Losses Provideam = Nottingham + Hull + Weinheim, then + Mira. Adds SiteName and Unique Machine Name.'],
      ['same', 'One site only, no union.'],
      ['same', 'One site only, no union.'],
    ]],
    ['END TABLE\n(visualization)', [
      ['end', 'Daily Losses EU\nMeasures: Duration, Loss Units (= CUs), Value, Volume Total. DAX: Loss % CU, Weighted Target % (per Subloss).'],
      ['end', 'New Daily Line Losses\nMeasures: Duration (Minutes), Loss in CUs, Value / Target %, Volume Total.'],
      ['end', 'Daily Line Losses N\nMeasures: Duration (Minutes), Loss in CUs, Value / Target %, Volume Total. Page filter: not S14 (VSU pages: only S14).'],
    ]],
  ],
});

PAGES.push({
  name: 'Time Utilisation',
  title: 'Time Utilisation: from Plan OPT exports to the visualization table',
  rows: [
    ['RAW SOURCE\n(SharePoint folder)', [
      ['src', 'Plan OPT/ of each site (the same files as the Plan OPT table, read again). Every file in the folder.'],
      ['src', 'General/Power BI/OEE Board A Sz/Plan OPT/. Every file in the folder.'],
      ['src', 'PowerBI/EU OEE Dashboard ASz/Plan OPT/. Every file in the folder.'],
    ]],
    ['Filter rows', [
      ['same', 'Drop rows with empty MachineName.'],
      ['same', 'Same.'],
      ['same', 'Same.'],
    ]],
    ['Minutes', [
      ['same', 'Total Time, Planned OpT, OEE Time (hh:mm:ss) become minutes = h x 60 + m + s / 60. Seconds are KEPT here.'],
      ['same', 'Same.'],
      ['same', 'Same.'],
    ]],
    ['Group', [
      ['same', 'Group by day + machine. Sum of the three minute columns (OEE Time Total, Planned OPT Total, Total Time Total).'],
      ['same', 'Same.'],
      ['same', 'Same.'],
    ]],
    ['Drop machine', [
      ['same', 'Hull: drop GT4 - Auto. Nottingham: drop N11 Auto.'],
      ['same', 'Drop GT4 - Auto.'],
      ['same', 'Drop N11 Auto.'],
    ]],
    ['Machine filter (EU)', [
      ['diff', 'Hull: drop the same 19 process machines. Nottingham: keep a fixed list of 23 lines (N1, N3 to N12, O5, O6, S04 to S13, T2, T7).'],
      NONE,
      NONE,
    ]],
    ['Site columns', [
      ['diff', 'Adds SiteName and Unique Machine Name (machine-site).'],
      NONE,
      NONE,
    ]],
    ['COMBINE', [
      ['diff', 'Union: Time Utilisation N + H + W + M.'],
      ['same', 'One site only.'],
      ['same', 'One site only.'],
    ]],
    ['Calculated columns', [
      ['same', 'Available Time = 1440, Running %, Planned Running %, Utilized Running % (minutes / 1440), hours = minutes / 60.'],
      ['same', 'Same.'],
      ['same', 'Same.'],
    ]],
    ['END TABLE\n(visualization)', [
      ['end', 'Time Utilisation EU\nMeasures: OEE Time Total, Planned OPT Total, Total Time Total (minutes).'],
      ['end', 'Time Utilisation\nMeasures: the same three minute totals.'],
      ['end', 'Time Utilisation N\nMeasures: the same three minute totals.'],
    ]],
  ],
});

PAGES.push({
  name: 'Plan OPT',
  title: 'Plan OPT: from Plan OPT exports to the visualization table',
  rows: [
    ['RAW SOURCE\n(SharePoint folder)', [
      ['src', 'Plan OPT/ of each site. Every file in the folder.'],
      ['src', 'General/Power BI/OEE Board A Sz/Plan OPT/. Every file in the folder.'],
      ['src', 'PowerBI/EU OEE Dashboard ASz/Plan OPT/. Every file in the folder.'],
    ]],
    ['Filter rows', [
      ['same', 'Drop rows with empty MachineName. Nottingham also drops N11 Auto.'],
      ['same', 'Drop rows with empty MachineName.'],
      ['same', 'Drop rows with empty MachineName and N11 Auto.'],
    ]],
    ['Shift lookup', [
      ['diff', 'Join Shift Naming Provideam (EU OEE Regional ASZ/Shift Coding Provideam/), gives Shift Time.'],
      ['diff', 'No join: ShiftName split into Shift Type and Shift Colour.'],
      ['diff', 'Join Shift Naming N (EU OEE Dashboard ASz/Shift Pattern Naming/).'],
    ]],
    ['Helper columns', [
      ['same', 'Product Key, Good Parts - No Zeros (0 becomes empty). Hull: part name fix for one product.'],
      ['same', 'Same, with the part name fix.'],
      ['same', 'Same.'],
    ]],
    ['Drop machine', [
      ['same', 'Hull: drop GT4 - Auto.'],
      ['same', 'Drop GT4 - Auto.'],
      NONE,
    ]],
    ['Targets (UPDT, PDT, OEE)', [
      ['diff', 'Three left joins on machine-site + month with the regional glidepath (percent).'],
      ['diff', 'Three left joins on MachineName + month with the Hull glidepath (Targets GlidePath/).'],
      ['diff', 'Three left joins on MachineName + month with the Nottingham glidepath (GlidePath Targets/, downtime rows as fractions).'],
    ]],
    ['Machine / area filter (EU)', [
      ['diff', 'Hull: drop the 19 process machines. Nottingham: keep areas SD Packing and Strepsils Packing, and not S14.'],
      NONE,
      NONE,
    ]],
    ['COMBINE and times', [
      ['diff', 'Union Plan OPT N + H + W + M. Times split at ":" and read as hours x 60 + minutes, SECONDS DROPPED. Removes Defect Parts, Target, OEE, ShiftStartTime, Good Parts - No Zeros, Targets Key.'],
      ['diff', 'One site. Calculated columns Total Time (Min), Planned Time (Min), OEE Time (Min) = h x 60 + m + s / 60 (seconds kept). Keeps Defect Parts, Target, OEE.'],
      ['diff', 'One site. Same calculated columns as Hull site (seconds kept), plus Week, Year.'],
    ]],
    ['END TABLE\n(visualization)', [
      ['end', 'Plan OPT EU\nMeasures: Good Parts, Capacity, Total Time, Planned OpT, OEE Time, Downtime Units, UPDT / PDT / OEE Target.'],
      ['end', 'New Plan OPT\nMeasures: Good Parts, Capacity, Total / Planned / OEE Time (Min), Downtime Units, targets.'],
      ['end', 'Plan OPT N\nMeasures: Good Parts, Capacity, Total / Planned / OEE Time (Min), Downtime Units, targets. DAX: OEE % (Weighted) = Good Parts / Capacity.'],
    ]],
  ],
});

// ---- Layout ---------------------------------------------------------------
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\n/g, '&#xa;');

const wrapLines = (text, width) => {
  const perLine = Math.max(8, Math.floor((width - 16) / CHAR_W));
  let n = 0;
  for (const para of text.split('\n')) {
    let len = 0;
    let lines = 1;
    for (const word of para.split(' ')) {
      if (len + word.length + 1 > perLine && len > 0) {
        lines += 1;
        len = word.length;
      } else {
        len += word.length + 1;
      }
    }
    n += lines;
  }
  return n;
};

const styleOf = (k, extra = '') => {
  const s = KIND[k];
  let style = 'rounded=0;whiteSpace=wrap;html=0;align=left;verticalAlign=top;spacingLeft=6;';
  style += `fontSize=11;fillColor=${s.fill};strokeColor=${s.stroke};strokeWidth=${s.w};`;
  if (s.dashed) {
    style += 'dashed=1;fontColor=#999999;';
  }
  if (s.bold) {
    style += 'fontStyle=1;';
  }
  return style + extra;
};

const buildPage = (page, index) => {
  let id = 2;
  const cells = [];
  const text = (x, y, w, h, value, style) => {
    cells.push(
      `<mxCell id="${id}" value="${esc(value)}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    );
    id += 1;
    return id - 1;
  };
  const left = 20;
  text(left, 15, 1100, 28, page.title, 'text;html=0;align=left;fontSize=16;fontStyle=1;');
  const legend = [
    ['src', 'raw source folder'],
    ['same', 'same in all reports'],
    ['diff', 'differs: a cause to test'],
    ['end', 'END TABLE for the visuals'],
    ['none', 'step not in this report'],
  ];
  legend.forEach(([k, label], i) => {
    text(left + i * 215, 55, 205, 26, label, styleOf(k) + 'verticalAlign=middle;');
  });
  text(left, 90, 1100, 20, 'Read each row left to right: the orange cells are where the reports ' +
    'do different things. The notebook switches each of them on or off.',
  'text;html=0;align=left;fontSize=11;');
  LANES.forEach((name, i) => {
    text(left + LABEL_W + GAP + i * (LANE_W + GAP), 118, LANE_W, 26, name,
      'rounded=0;whiteSpace=wrap;html=0;fontSize=13;fontStyle=1;fillColor=#333333;' +
      'fontColor=#ffffff;strokeColor=#333333;align=center;verticalAlign=middle;');
  });
  let y = TOP;
  const last = [null, null, null];
  for (const [label, lanes] of page.rows) {
    const h = Math.max(
      ...lanes.map(([, t]) => wrapLines(t, LANE_W) * LINE_H + 14),
      wrapLines(label, LABEL_W) * LINE_H + 14,
    );
    const isEnd = lanes.some(([k]) => k === 'end');
    text(left, y, LABEL_W, h, label,
      'text;html=0;align=left;verticalAlign=middle;fontSize=11;fontStyle=1;' +
        (isEnd ? 'fontColor=#b8860b;' : ''));
    lanes.forEach(([kind, value], i) => {
      const x = left + LABEL_W + GAP + i * (LANE_W + GAP);
      const cid = text(x, y, LANE_W, h, value, styleOf(kind));
      if (kind !== 'none') {
        if (last[i] !== null) {
          cells.push(
            `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;` +
              `endArrow=block;endFill=1;strokeColor=#666666;" edge="1" parent="1" ` +
              `source="${last[i]}" target="${cid}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
          );
          id += 1;
        }
        last[i] = cid;
      }
    });
    y += h + 26;
  }
  return (
    `<diagram name="${esc(page.name)}" id="page${index}"><mxGraphModel dx="1400" dy="800" grid="1" ` +
    `gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" ` +
    `pageScale="1" pageWidth="1400" pageHeight="${y + 40}" math="0" shadow="0"><root>` +
    `<mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel></diagram>`
  );
};

// ---- Overview page ----------------------------------------------------------
const OVERVIEW = {
  name: 'Overview',
  title: 'Which tables the three reports use for the visuals',
  rows: [
    ['THE 3 TABLES\nCOMPARED', [
      ['end', 'EU report (Temp EU Daily OEE Report 2025 V1 1)\n- Plan OPT EU\n- Time Utilisation EU\n- Daily Losses EU'],
      ['end', 'Hull site report (Hull Site OEE Report 2025 V3.1)\n- New Plan OPT\n- Time Utilisation\n- New Daily Line Losses'],
      ['end', 'Nottingham site report (Nottingham Site OEE Report 2025 V1)\n- Plan OPT N\n- Time Utilisation N\n- Daily Line Losses N'],
    ]],
    ['Other fact tables\n(not compared yet)', [
      ['same', 'Run Rates EU, Volume CoV EU (pages By Shift and By Format, hidden in the EU file).'],
      ['same', 'Run Rates, Volume CoV, Historical OEE, Performance Metrics.'],
      ['same', 'Run Rates N, Volume CoV N, Historical OEE N.'],
    ]],
    ['Dimensions and\nlookups', [
      ['same', 'Machine Names EU (packing only), Shift Naming EU, Format List EU, Calendar. Targets: regional glidepath file.'],
      ['same', 'New Machine Names (all machines but GT4 - Auto), Shift Naming, Shift Colours, Format List, Calendar. Targets: Hull glidepath file.'],
      ['same', 'Machine Names N (all machines), Shift Naming N, Format List, Calendar, Period, Metrics. Targets: Nottingham glidepath file.'],
    ]],
    ['Raw folders\n(same for EU and site\nof the same site)', [
      ['src', 'Per site, in each site SharePoint: Plan OPT/, Line Losses/, Volume Loss Correction/, Equipment Coding/, Machine Names. Plus regional: Shift Coding Provideam/, glidepaths.'],
      ['src', 'General/Power BI/OEE Board A Sz/: Plan OPT/, Line Losses/, Volume Loss Correction/, Equipment Coding/, Targets GlidePath/, Shift Pattern Naming/, Machine Names/.'],
      ['src', 'PowerBI/EU OEE Dashboard ASz/: Plan OPT/, Line Losses/, Volume Loss Correction/, Equipment Coding/, GlidePath Targets/, Shift Pattern Naming/, MachineNames/.'],
    ]],
    ['Local copy of the\nraw exports', [
      ['same', 'sharepoint/source_original/<kind>/site=<Site>/ (UTF-16, tab). The notebook reads these. kind = plan_opt, line_losses, volume_loss_correction.'],
      ['same', 'Same, site=Hull.'],
      ['same', 'Same, site=Nottingham.'],
    ]],
    ['Rules that differ\n(the notebook switches)', [
      ['diff', 'machine_filter: EU drops machines and areas. minutes: EU drops seconds (losses duration, plan times). sub_group_names: EU renames Hull sub groups.'],
      ['diff', 'file_order: Hull site sorts losses files by Date created. target_key: machine instead of machine-site. glidepath: site file instead of regional.'],
      ['diff', 'shift_file: site Shift Pattern Naming instead of regional. glidepath: site file (fractions for downtime). target_key: machine.'],
    ]],
  ],
};

PAGES.unshift(OVERVIEW);

const xml =
  '<mxfile host="app.diagrams.net">' + PAGES.map((p, i) => buildPage(p, i)).join('') + '</mxfile>';
writeFileSync(OUTPUT, xml);
console.log(`Wrote ${OUTPUT}: ${PAGES.length} pages`);
