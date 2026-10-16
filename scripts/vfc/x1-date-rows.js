// Builds the rows of three parquet date type tests (a spike, no real data).
// In: the inject. Out 1: DATE from JS Date objects. Out 2: DATE from ISO
// text. Out 3: TIMESTAMP_MILLIS for a time of day (Excel day 1899-12-30)
// and for a date at midnight. msg.spike names the test file.
var DAY_MS = 86400000;
var FIRST_DAY = Date.UTC(2026, 8, 1);
var EXCEL_DAY = Date.UTC(1899, 11, 30);
var QUARTER_PAST_NINE = (21 * 60 + 45) * 60000;

function message(name, rows) {
  return {
    spike: name,
    payload: rows
  };
}

var dateObjects = [
  {
    id: 1,
    d: new Date(FIRST_DAY)
  },
  {
    id: 2,
    d: new Date(FIRST_DAY + DAY_MS)
  }
];
var dateTexts = [
  {
    id: 1,
    d: '2026-09-01'
  },
  {
    id: 2,
    d: '2026-09-02'
  }
];
var timestamps = [
  {
    id: 1,
    t: new Date(EXCEL_DAY + QUARTER_PAST_NINE),
    dt: new Date(FIRST_DAY)
  },
  {
    id: 2,
    t: new Date(EXCEL_DAY + 15 * 60000),
    dt: new Date(FIRST_DAY + DAY_MS)
  }
];
node.status({
  fill: 'green',
  shape: 'dot',
  text: '3 test tables sent'
});
return [
  message('a_date_from_date_object', dateObjects),
  message('b_date_from_text', dateTexts),
  message('c_timestamps', timestamps)
];
