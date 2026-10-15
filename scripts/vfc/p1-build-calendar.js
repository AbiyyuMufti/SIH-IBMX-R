// Builds the pbi_calendar table: one row per date, Monday week start, week
// number like the report (DAX WEEKNUM(date, 2): week 1 holds 1 January).
// Out 1: msg.payload = the rows (topic pbi_calendar). Out 2: a log line.
var DAY_MS = 86400000;
var cfg = flow.get('cfg');
var MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

// Week number as DAX WEEKNUM(date, 2): weeks start on Monday and the week
// that holds 1 January of the year is week 1 (not the ISO week number).
function weekNumber(ms) {
  var year = new Date(ms).getUTCFullYear();
  var jan1 = Date.UTC(year, 0, 1);
  var jan1Offset = (new Date(jan1).getUTCDay() + 6) % 7;
  var dayOfYear = Math.round((ms - jan1) / DAY_MS);
  return Math.floor((dayOfYear + jan1Offset) / 7) + 1;
}

var rows = [];
var start = Date.parse(cfg.calendarStart + 'T00:00:00Z');
var end = Date.parse(cfg.calendarEnd + 'T00:00:00Z');
for (var t = start; t <= end; t += DAY_MS) {
  var d = new Date(t);
  var month = d.getUTCMonth();
  var year = d.getUTCFullYear();
  var quarter = Math.floor(month / 3) + 1;
  var mondayOffset = (d.getUTCDay() + 6) % 7;
  rows.push({
    date: d.toISOString().slice(0, 10),
    year: year,
    month_number: month + 1,
    month: MONTHS[month],
    month_short_name: MONTHS[month].slice(0, 3),
    month_year: MONTHS[month].slice(0, 3) + ' ' + year,
    month_year_number: pad(month + 1) + ' ' + String(year).slice(2),
    quarter: 'QTR' + quarter,
    quarter_number: quarter,
    week_number: weekNumber(t),
    week_start: new Date(t - mondayOffset * DAY_MS).toISOString().slice(0, 10)
  });
}

var text = 'pbi_calendar ' + rows.length + ' rows';
if (cfg.dryRun) {
  var line = {
    topic: 'log',
    payload: 'calendar [setup] DRY RUN: ' + text
  };
  return [null, line];
}
var table = {
  topic: 'pbi_calendar',
  day: '',
  payload: rows
};
return [table, null];
