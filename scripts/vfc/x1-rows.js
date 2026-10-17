// Builds the rows of the parquet spike v4 (no real data), one message per
// case in the order of the case lanes. msg.spike names the case and its file.
// Cases: column names with spaces and dots in the real types, a null in each
// type, and a row with missing keys. Dates are day numbers, times are ms.
var DAY_MS = 86400000;
var FIRST_DAY = Date.UTC(2026, 8, 1) / DAY_MS;
var TIME_OF_DAY_MS = (21 * 60 + 45) * 60000;
var QUARTER_HOUR_MS = 15 * 60000;
var EPOCH_MS = Date.UTC(2026, 8, 1);

function message(name, rows) {
  return {
    spike: name,
    payload: rows
  };
}

// One value and one null, in the column x, for the null cases.
function withNull(value) {
  return [
    {
      id: 1,
      x: value
    },
    {
      id: 2,
      x: null
    }
  ];
}

var names = [
  {
    'Good Parts': 9996,
    'Planned OpT': 480,
    'Capacity': 13500.5,
    'Date': FIRST_DAY,
    'ShiftStartDate.1': FIRST_DAY,
    'Time': TIME_OF_DAY_MS,
    'Duration': QUARTER_HOUR_MS,
    'Time in Mins': 15.5,
    'Value': '3.9',
    'Volume Key.1': 'Fybogel 30s 16/01/2025',
    'ShiftName - Copy': 'ThurNight',
    'Unique Machine Name': 'B2 Line-Hull'
  },
  {
    'Good Parts': null,
    'Planned OpT': null,
    'Capacity': null,
    'Date': FIRST_DAY + 1,
    'ShiftStartDate.1': null,
    'Time': null,
    'Duration': null,
    'Time in Mins': null,
    'Value': null,
    'Volume Key.1': null,
    'ShiftName - Copy': null,
    'Unique Machine Name': 'B2 Line-Hull'
  }
];
var missing = [
  {
    id: 1,
    i: 5,
    s: 'a'
  },
  {
    id: 2
  }
];
node.status({
  fill: 'green',
  shape: 'dot',
  text: '8 cases sent'
});
return [
  message('names_and_types_with_nulls', names),
  message('null_int64', withNull(7)),
  message('null_double', withNull(7.5)),
  message('null_date', withNull(FIRST_DAY)),
  message('null_text', withNull('abc')),
  message('null_timestamp', withNull(EPOCH_MS)),
  message('missing_keys', missing),
  message('timestamp_1970_time_of_day', withNull(TIME_OF_DAY_MS))
];
