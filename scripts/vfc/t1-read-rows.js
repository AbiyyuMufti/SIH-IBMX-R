// Reads the rows of the Tuzla workbook table (sheet Template, one row per
// line, day, shift and order) as Power Automate sends them, a list.
// Out 1: one message per line and day (msg.line, msg.iso, msg.rows).
// Out 2: 400 for a bad payload, else a log line with the counts.
var SITE = 'Tuzla';
// Days before this day come from the history load (scripts/tuzla-convert.js).
var FIRST_DAY = '2026-11-20';
// Most rows in one request (the last 7 days of 6 lines are about 100).
var MAX_ROWS = 2000;
// Shift names of the workbook (column Vardiya) to the report names.
var SHIFTS = {
  'gunduz': 'Day',
  'gece': 'Night'
};
// Table columns read (Excel table names; Power Automate keys are these).
var FIELDS = {
  line: 'Üretim Hattı',
  order: 'Sipariş Numarası',
  date: 'Tarih',
  shift: 'Vardiya',
  code: 'Ürün Kodu',
  product: 'Ürün Adı',
  speed: 'Teorik Hat Hızı (adet/saat)',
  start: 'Başlangıç Saati',
  total: 'Toplam Operasyon Süresi (dk)',
  good: 'Üretilen Miktar (adet)',
  net: 'Net Operasyon Süresi',
  runTime: 'Gerçekleşen Üretim Süresi (dk)'
};
// The loss columns in minutes, Formül Değişikliği to Fire (dk).
var LOSS_COLUMNS = [
  'Formül Değişikliği',
  'Ebat Değişikliği',
  'Yemek',
  'Çay',
  'Analiz ve Kontroller',
  'Planlı Bakım',
  'Genel Temizlik & Hat Kontrol',
  'Temizlik & Sanitasyon',
  'Ambalaj, Etiket vs. Besleme',
  'Yarı Mamül Besleme',
  'Elektrik/Hava Kesintisi',
  'Personel Bekleme',
  'Üretim Planı Bekleme',
  'Acil Durum Tahliye',
  'Yarı Mamül Bekleme',
  'Ambalaj, Etiket vs. Bekleme',
  'Bitmiş Ürün Kalite Problemi',
  'Yarı Mamül Kalite Problemi',
  'Ambalaj, Etiket vs. Kalite Problemi',
  'Makine Ayarı',
  'Şişe Dizme Makine Arızası',
  'Dolum Makinesi Arızası',
  'Tarih Kodlama Makinesi Arızası',
  'Etiket Makinesi Arızası',
  'Kolileme Makinesi Arızası',
  'Koli Barkod Basma Makinesi Arızası',
  'Diğer Arızalar',
  'Kısa Duruşlar',
  'Hat Hızı Düşürme/Eksik Personel',
  'Diğer Duruşlar',
  'Düşük Hızda Çalışma',
  'Diğer',
  'Fire (dk)'
];
var DAY_MS = 86400000;
var EXCEL_DAY_0 = Date.UTC(1899, 11, 30);

// Column names compared without case, accents, spaces or the Excel newline.
function key(name) {
  return String(name)
    .replace(/_x000a_/gi, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function text(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

function num(value) {
  var t = text(value).replace(',', '.');
  if (t === '') {
    return 0;
  }
  var n = Number(t);
  return isNaN(n) ? 0 : n;
}

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

// A day: Excel serial number, ISO text or DD.MM.YYYY (DD/MM/YYYY).
function isoDay(value) {
  var t = text(value);
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return m[1] + '-' + m[2] + '-' + m[3];
  }
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) {
    return m[3] + '-' + pad(Number(m[2])) + '-' + pad(Number(m[1]));
  }
  if (/^\d+(\.\d+)?$/.test(t)) {
    var ms = EXCEL_DAY_0 + Math.floor(Number(t)) * DAY_MS;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

// A time of day as ms on 1970-01-01: Excel fraction, ISO text or HH:MM.
function timeMs(value) {
  var t = text(value);
  var m = t.match(/T(\d{2}):(\d{2})/) ||
    t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (m) {
    var hour = Number(m[1]) % 24;
    if (m[3] && m[3].toUpperCase() === 'PM' && hour < 12) {
      hour += 12;
    }
    if (m[3] && m[3].toUpperCase() === 'AM' && hour === 12) {
      hour = 0;
    }
    return (hour * 60 + Number(m[2])) * 60000;
  }
  if (/^\d+(\.\d+)?$/.test(t)) {
    var part = Number(t) % 1;
    return Math.round(part * 1440) * 60000;
  }
  return null;
}

function reject(detail) {
  msg.statusCode = 400;
  msg.payload = {
    status: 'rejected',
    detail: detail
  };
  msg.logLevel = 'warn';
  msg.logText = 'rejected: ' + detail;
  return [null, msg];
}

var input = msg.payload;
if (input && !Array.isArray(input) && Array.isArray(input.value)) {
  input = input.value;
}
if (!Array.isArray(input) || !input.length) {
  return reject('payload must be a list of Template rows');
}
if (input.length > MAX_ROWS) {
  return reject('more than ' + MAX_ROWS + ' rows in one request');
}

// One lookup of normalised names per row (keys of Power Automate or Excel).
function reader(row) {
  var byKey = {};
  Object.keys(row).forEach(function (name) {
    byKey[key(name)] = row[name];
  });
  return function (name) {
    return byKey[key(name)];
  };
}

var groups = {};
var order = [];
var skipped = {
  empty: 0,
  noDate: 0,
  beforeFirstDay: 0
};
input.forEach(function (raw) {
  var get = reader(raw || {});
  var line = text(get(FIELDS.line));
  if (!line) {
    skipped.empty++;
    return;
  }
  var iso = isoDay(get(FIELDS.date));
  if (!iso) {
    skipped.noDate++;
    return;
  }
  if (iso < FIRST_DAY) {
    skipped.beforeFirstDay++;
    return;
  }
  var shiftText = text(get(FIELDS.shift));
  var losses = {};
  LOSS_COLUMNS.forEach(function (column) {
    losses[column] = num(get(column));
  });
  var row = {
    line: line,
    iso: iso,
    order: text(get(FIELDS.order)),
    shift: SHIFTS[key(shiftText)] || shiftText || null,
    code: text(get(FIELDS.code)),
    product: text(get(FIELDS.product)),
    speed: num(get(FIELDS.speed)),
    start: timeMs(get(FIELDS.start)),
    total: num(get(FIELDS.total)),
    good: num(get(FIELDS.good)),
    net: num(get(FIELDS.net)),
    runTime: num(get(FIELDS.runTime)),
    losses: losses
  };
  var id = line + '|' + iso;
  if (!groups[id]) {
    groups[id] = [];
    order.push(id);
  }
  groups[id].push(row);
});

var out = order.map(function (id) {
  var rows = groups[id];
  return {
    site: SITE,
    line: rows[0].line,
    iso: rows[0].iso,
    rows: rows,
    _msgid: msg._msgid
  };
});

var log = SITE + ': ' + input.length + ' rows, ' + out.length;
log += ' line-days; skipped empty ' + skipped.empty + ', no date ';
log += skipped.noDate + ', before ' + FIRST_DAY + ' ';
log += skipped.beforeFirstDay;
node.status({
  fill: 'green',
  shape: 'dot',
  text: out.length + ' line-days'
});
msg.statusCode = 200;
msg.payload = {
  status: 'accepted',
  lineDays: out.length
};
msg.logLevel = 'info';
msg.logText = log;
return [out, msg];
