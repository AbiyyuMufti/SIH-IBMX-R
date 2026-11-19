// The 65 EU_OEE_Fact columns: where SIH gives the value, how the column is
// built, and its status for a connected line and a manual line.
// status: ok = SIH gives it and it matches live, flow = possible but the
// flow must change, lacking = SIH has no data for it (setup or entry needed).
// kind: sih = from a SIH call, ref = reference file, flow = set by the flow.
// Checked on 2026-11-17 (B2 Line connected, GT4 manual), see docs/sih-explorer.md.

const P = 'Plan';
const T = 'Time Utilisation';
const L = 'Loss';
const R = 'Run Rate';
const ALL = [P, T, L, R];

// [column, types, kind, steps (SIH calls), built (steps), connected, manual, gap]
const ROWS = [
  ['Record Type', ALL, 'flow', [], ['Set per table: Plan, Time Utilisation, Loss, Run Rate'], 'ok', 'ok', ''],
  ['Date', ALL, 'flow', [], ['Production day of the run window (site start hour, local time)'], 'ok', 'ok', ''],
  ['SiteName', ALL, 'sih', ['hierarchy'], ['Level 3 of the asset path'], 'ok', 'ok', ''],
  ['MachineName', ALL, 'flow', ['hierarchy'], ['Asset name', 'Config line renames it (B2 Line → B2 Auto)'], 'ok', 'ok', ''],
  ['Unique Machine Name', ALL, 'flow', [], ['MachineName + "-" + SiteName'], 'ok', 'ok', ''],
  ['ShiftName', [P, L, R], 'sih', ['calendar', 'hourly'], ['Calendar event of the hour', 'Mapped by the Shift Patterns file'], 'lacking', 'flow', 'Calendar names differ from the report (Morning / Second Shift vs Red / Green). Manual lines have the right name in the hourly entries'],
  ['Dept', ALL, 'ref', [], ['Line list Machine_Names_EU.csv by Unique Machine Name'], 'ok', 'ok', ''],
  ['Area', ALL, 'ref', [], ['Line list'], 'ok', 'ok', ''],
  ['Product Type', ALL, 'ref', [], ['Line list'], 'ok', 'ok', ''],
  ['In EU Report', ALL, 'ref', [], ['true when the line is on the line list'], 'ok', 'ok', ''],
  ['AreaName', [P, R], 'flow', [], ['SiteName + " " + Area (as in the live data)'], 'flow', 'flow', 'Not written yet; derivable'],
  ['PartName', [P, L, R], 'sih', ['filtervalues', 'valuekpis', 'products'], ['Product of each hour (KPIs per product)', 'Product description, else name'], 'lacking', 'ok', 'Connected line: product master holds SAP texts, live uses other names'],
  ['Good Parts', [P], 'sih', ['kpis'], ['Good parts per hour', 'Sum per shift and product'], 'ok', 'ok', ''],
  ['Capacity', [P], 'sih', ['products', 'kpis'], ['Design speed per minute', '× Planned OpT'], 'ok', 'ok', ''],
  ['Total Time', [P], 'sih', ['kpis'], ['Total time per hour, minus planned shift stops', 'Sum per shift, whole minutes'], 'ok', 'ok', ''],
  ['Planned OpT', [P], 'sih', ['kpis'], ['Operational time per hour', 'Sum per shift, whole minutes'], 'ok', 'ok', ''],
  ['OEE Time', [P], 'sih', ['kpis'], ['Used operational time per hour', 'Sum per shift, whole minutes'], 'ok', 'ok', ''],
  ['Downtime Units', [P], 'sih', ['kpis', 'products'], ['Downtime minutes × design speed'], 'ok', 'ok', 'Small differences on the connected line'],
  ['Product Key', [P, L, R], 'flow', [], ['Unique Machine Name + " " + PartName'], 'lacking', 'ok', 'Follows PartName'],
  ['UPDT Target', [P], 'ref', [], ['Glidepaths file by line and month'], 'ok', 'ok', ''],
  ['PDT Target', [P], 'ref', [], ['Glidepaths file'], 'ok', 'ok', ''],
  ['OEE Target', [P], 'ref', [], ['Glidepaths file'], 'ok', 'ok', ''],
  ['Defect Parts', [P], 'sih', ['kpis'], ['Rejected parts per hour', 'Sum per shift'], 'flow', 'flow', 'In the KPIs, not written yet'],
  ['OEE', [P], 'flow', [], ['OEE Time / Planned OpT'], 'flow', 'flow', 'Not written yet; derivable'],
  ['Shift Colour', [P, L, R], 'flow', ['calendar'], ['Hull: the crew colour = ShiftName'], 'flow', 'flow', 'Not written yet; needs the right ShiftName first'],
  ['ShiftStartTime', [P], 'sih', ['calendar'], ['Start of the calendar event'], 'flow', 'flow', 'In the calendar, not written yet'],
  ['Target', [P], 'flow', [], ['= Capacity'], 'flow', 'flow', 'Not written yet'],
  ['Targets Key', [P], 'flow', [], ['MachineName + " 01/MM/YYYY"'], 'flow', 'flow', 'Not written yet'],
  ['Brand', [P, L, R], 'ref', [], ['Format_List_EU by Product Key'], 'lacking', 'flow', 'Needs Product Key to match the Format List'],
  ['Unit Size', [P, L, R], 'ref', [], ['Format_List_EU by Product Key'], 'lacking', 'flow', 'Same as Brand'],
  ['Unit Count/Format', [P, L, R], 'ref', [], ['Format_List_EU by Product Key'], 'lacking', 'flow', 'Same as Brand'],
  ['Extra Info', [P, L, R], 'ref', [], ['Format_List_EU by Product Key'], 'lacking', 'flow', 'Same as Brand'],
  ['Data Source', ALL, 'flow', [], ['"SIH"'], 'ok', 'ok', ''],
  ['source_hours', [P], 'flow', ['kpis'], ['Hours behind the row (SIH only)'], 'ok', 'ok', ''],
  ['loaded_at', ALL, 'flow', [], ['Write time'], 'ok', 'ok', ''],
  ['Event Date', [L], 'sih', ['stops'], ['Local date of the stop start'], 'ok', 'ok', ''],
  ['Time', [L], 'sih', ['stops', 'hourly'], ['Stop start, local clock'], 'ok', 'flow', 'Manual line: the stop call stamps the shift start; real start times are in the hourly entries'],
  ['OEELossLvl3Group', [L], 'sih', ['stops'], ['Planned when the reason path starts with a planned root, else Unplanned'], 'lacking', 'flow', 'Connected: stops carry no operator reason. Manual: "PDT - …" reasons must count as planned'],
  ['OEELossLvl3SubGroup', [L], 'sih', ['stops'], ['Reason category of the path', '"Not Logged" when empty'], 'lacking', 'flow', 'SIH category names differ from the report names: needs a map'],
  ['OEELossLvl3Desc', [L], 'sih', ['stops'], ['Reason name'], 'lacking', 'ok', 'Connected: default reason only'],
  ['Duration', [L], 'sih', ['stops'], ['Stop duration', 'Must be minutes (SIH gives ms)'], 'flow', 'flow', 'Unit: ms to minutes'],
  ['Breakdown Types', [L], 'sih', ['reasons'], ['No SIH field; could be a reason tree level'], 'lacking', 'lacking', 'Not in SIH'],
  ['Comment', [L], 'sih', ['hourly'], ['Comment text of the reason (hourly entries)'], 'lacking', 'flow', 'Stop call gives only a count; manual lines have the text in the hourly entries'],
  ['Volume Key', [L], 'flow', [], ['DD/MM/YYYY + machine + group + sub group + desc'], 'lacking', 'flow', 'Follows the loss names'],
  ['Loss Units', [L], 'sih', ['stops', 'products'], ['Stop minutes × design speed'], 'lacking', 'ok', 'Follows the stops'],
  ['Equipment', [L], 'sih', ['stops'], ['Reason sub group, else "Unclassed"'], 'lacking', 'flow', 'Report uses an Equipment Coding list'],
  ['Loss Target Key', [L], 'flow', [], ['Unique Machine Name + sub group + 01/MM/YYYY'], 'lacking', 'flow', 'Follows the sub group names'],
  ['Value', [L], 'ref', [], ['Glidepaths bucket of the sub group'], 'lacking', 'flow', 'Needs report sub group names'],
  ['Volume Total', [L], 'flow', ['products', 'kpis'], ['Sum of Capacity of the machine and day'], 'ok', 'ok', ''],
  ['Loss Final Level', [L], 'sih', ['stops'], ['Reason name'], 'lacking', 'ok', 'Connected: default reason only'],
  ['Batch ID', [L], 'sih', ['filtervalues', 'valuekpis'], ['Order of the hour of the stop'], 'flow', 'flow', 'Written as batch_id and dropped: rename'],
  ['Equipment Loss Key', [L], 'flow', [], ['MachineName + " " + reason name'], 'lacking', 'ok', 'Follows the reason name'],
  ['Lvl 3 Loss Name', [L], 'sih', ['stops'], ['Reason name'], 'lacking', 'ok', 'Connected: default reason only'],
  ['Time in Mins', [L], 'flow', ['stops'], ['Duration in minutes'], 'lacking', 'ok', 'Connected: SIH splits stops, report merges them'],
  ['Shift Time', [L], 'sih', ['calendar'], ['Shift of the stop'], 'lacking', 'flow', 'Same as ShiftName'],
  ['Loss Target', [L], 'ref', [], ['Glidepaths / 100'], 'flow', 'flow', 'Not written on loss rows yet'],
  ['comment_count', [L], 'sih', ['stops'], ['commentCount of the stop (SIH only)'], 'ok', 'ok', ''],
  ['OEE Time Total', [T], 'sih', ['kpis'], ['Used operational time of the day, minutes'], 'ok', 'ok', ''],
  ['Total Time Total', [T], 'sih', ['kpis'], ['Total time of the day, minutes'], 'ok', 'ok', ''],
  ['Planned OPT Total', [T], 'sih', ['kpis'], ['Operational time of the day, minutes'], 'ok', 'ok', ''],
  ['All Time', [T], 'flow', [], ['Length of the day in minutes'], 'ok', 'ok', ''],
  ['In EU Report Source', ALL, 'flow', [], ['Flag of the source table'], 'ok', 'ok', ''],
  ['RR Hours', [R], 'sih', ['kpis'], ['Hours with good parts per shift and product'], 'flow', 'flow', 'Run Rate rows not built for SIH yet'],
  ['RR Good Parts', [R], 'sih', ['kpis'], ['Good parts of those hours'], 'flow', 'flow', 'Run Rate rows not built for SIH yet'],
  ['RR Capacity', [R], 'sih', ['kpis', 'products'], ['Design speed × 60 per hour with parts'], 'flow', 'flow', 'Run Rate rows not built for SIH yet']
];

export const COLUMNS = ROWS.map(([col, types, kind, steps, built, connected, manual, gap]) => ({
  col, types, kind, steps, built, status: { connected, manual }, gap
}));
