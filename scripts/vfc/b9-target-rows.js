// Builds Site_PDT_Targets and Site_UPDT_Targets of one site from its
// Glidepaths file: one row per line and month column. In: msg.payload =
// parsed rows. Out 1: PDT table, out 2: UPDT table, out 3: a check log line.
var TABLES = [
  {
    table: 'Site_PDT_Targets',
    bucket: 'Planned Downtime (Total)',
    column: 'PDT Target'
  },
  {
    table: 'Site_UPDT_Targets',
    bucket: 'Unplanned Downtime (Total)',
    column: 'UPDT Target'
  }
];
var site = msg.site;
var rows = Array.isArray(msg.payload) ? msg.payload : [];

// The file starts with a byte order mark: it sits in the first column name.
function clean(row) {
  var out = {};
  Object.keys(row).forEach(function (column) {
    out[column.replace(/﻿/g, '')] = row[column];
  });
  return out;
}

// Days since 1970-01-01 of a month column 01/MM/YYYY (a DATE column value).
function dayNumber(text) {
  var parts = text.split('/');
  return Date.UTC(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])) /
    86400000;
}

// 25.9 (percent in the file) -> 0.259; an empty cell is empty.
function fraction(value) {
  var text = value === undefined || value === null ? '' : String(value).trim();
  if (text === '' || isNaN(Number(text))) {
    return null;
  }
  return Math.round(Number(text) * 100) / 10000;
}

function tableRows(spec) {
  var out = [];
  rows.map(clean).forEach(function (row) {
    if (row['OEE Bucket'] !== spec.bucket || !row.Line) {
      return;
    }
    Object.keys(row).forEach(function (column) {
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(column)) {
        return;
      }
      var item = {
        'Site': site,
        'Line': row.Line,
        'OEE Bucket': spec.bucket,
        'Date': dayNumber(column)
      };
      item[spec.column] = fraction(row[column]);
      item['Volume Key'] = row.Line + ' ' + column;
      item['loaded_at'] = msg.loadedAt;
      out.push(item);
    });
  });
  return out;
}

var messages = TABLES.map(function (spec) {
  if (msg.job.tables.indexOf(spec.table) === -1) {
    return null;
  }
  return {
    table: spec.table,
    rows: tableRows(spec),
    failed: [],
    skipped: [],
    itemCount: 1,
    site: site,
    day: msg.day,
    mode: msg.mode,
    loadedAt: msg.loadedAt,
    job: msg.job
  };
});
var text = site + ': read ' + rows.length + ' glidepath rows';
messages.forEach(function (item) {
  if (item) {
    text += ', ' + item.table + ' ' + item.rows.length + ' rows';
  }
});
node.status({
  fill: 'green',
  shape: 'dot',
  text: text.slice(0, 60)
});
return [
  messages[0],
  messages[1],
  {
    topic: 'log',
    payload: msg.day + ' [' + msg.mode + '] CHECK ' + text
  }
];
