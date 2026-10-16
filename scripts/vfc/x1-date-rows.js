// Builds the rows of two parquet date type tests (a spike, no real data).
// In: the inject. Out 1: DATE from days since 1970-01-01. Out 2: epoch ms for
// TIMESTAMP_MILLIS (a time of day on 1899-12-30, a date at midnight).
// Only numbers are sent: the first spike showed text and Date become 2026.
var DAY_MS = 86400000;
var FIRST_DAY_MS = Date.UTC(2026, 8, 1);
var FIRST_DAY = FIRST_DAY_MS / DAY_MS;
var EXCEL_DAY_MS = Date.UTC(1899, 11, 30);
var QUARTER_PAST_NINE_MS = (21 * 60 + 45) * 60000;

function message(name, rows) {
  return {
    spike: name,
    payload: rows
  };
}

var dateRows = [
  {
    id: 1,
    d: FIRST_DAY
  },
  {
    id: 2,
    d: FIRST_DAY + 1
  }
];
var timestampRows = [
  {
    id: 1,
    t: EXCEL_DAY_MS + QUARTER_PAST_NINE_MS,
    dt: FIRST_DAY_MS
  },
  {
    id: 2,
    t: EXCEL_DAY_MS + 15 * 60000,
    dt: FIRST_DAY_MS + DAY_MS
  }
];
node.status({
  fill: 'green',
  shape: 'dot',
  text: '2 test tables sent'
});
return [
  message('a_date_from_day_number', dateRows),
  message('b_timestamps_from_ms', timestampRows)
];
