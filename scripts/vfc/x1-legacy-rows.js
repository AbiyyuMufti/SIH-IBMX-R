// Builds the rows of the LEGACY engine cases of the date type spike (no real
// data), one message per case in the order of the case lanes. msg.spike names
// the case and its result file. Only numbers are sent (legacy reads text and
// Date objects as numbers). Out 5 starts the modern cases.
var DAY_MS = 86400000;
var FIRST_DAY_MS = Date.UTC(2026, 8, 1);
var FIRST_DAY = FIRST_DAY_MS / DAY_MS;
var EXCEL_DAY_MS = Date.UTC(1899, 11, 30);
var TIME_OF_DAY_MS = (21 * 60 + 45) * 60000;

// Two rows per case: 2026-09-01 and the next day (the time of day case:
// 21:45:00 and 00:15:00).
function rows(first, second) {
  return [
    {
      id: 1,
      x: first
    },
    {
      id: 2,
      x: second
    }
  ];
}

function message(name, list) {
  return {
    spike: name,
    payload: list
  };
}

var dates = [
  new Date(FIRST_DAY_MS),
  new Date(FIRST_DAY_MS + DAY_MS)
];
var times = [
  new Date(EXCEL_DAY_MS + TIME_OF_DAY_MS),
  new Date(EXCEL_DAY_MS + 15 * 60000)
];
node.status({
  fill: 'green',
  shape: 'dot',
  text: '4 legacy cases sent'
});
return [
  message('legacy_date_day_number', rows(FIRST_DAY, FIRST_DAY + 1)),
  message('legacy_timestamp_ms', rows(FIRST_DAY_MS, FIRST_DAY_MS + DAY_MS)),
  message('legacy_timestamp_ms_1899', rows(times[0].getTime(),
    times[1].getTime())),
  message('legacy_time_millis', rows(TIME_OF_DAY_MS, 15 * 60000)),
  {
    topic: 'start modern cases'
  }
];
