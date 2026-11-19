// Builds the Daily_Losses_EU rows of one line and day: one row per Template
// row and loss column with minutes above 0. In: msg of t2 (rows, tables).
// Out 1: msg.tables with Daily_Losses_EU, msg.notes. Out 2: a log line.
var SITE = 'Tuzla';
var DATA_SOURCE = 'Excel';
var PLANNED = 'Planned Loss';
var UNPLANNED = 'Unplanned Loss';
// Turkish loss column -> group, EU subgroup, English name, machine.
// PROPOSAL of 2026-11-19, to confirm with the site (docs/tuzla-live.md).
var LOSSES = {
  'Formül Değişikliği': [PLANNED, 'Product Changeover', 'Formula Change'],
  'Ebat Değişikliği': [PLANNED, 'Product Changeover', 'Size Change'],
  'Yemek': [PLANNED, 'Breaks / Meals', 'Meal'],
  'Çay': [PLANNED, 'Breaks / Meals', 'Tea Break'],
  'Analiz ve Kontroller': [
    PLANNED,
    'In Process Quality',
    'Analysis and Checks'
  ],
  'Planlı Bakım': [PLANNED, 'Planned Maintenance', 'Planned Maintenance'],
  'Genel Temizlik & Hat Kontrol': [
    PLANNED,
    'Operator Asset Care',
    'General Cleaning and Line Check'
  ],
  'Temizlik & Sanitasyon': [
    PLANNED,
    'Start up and Sanitisation',
    'Cleaning and Sanitisation'
  ],
  'Ambalaj, Etiket vs. Besleme': [
    PLANNED,
    'Refilling Materials',
    'Packaging Feeding'
  ],
  'Yarı Mamül Besleme': [PLANNED, 'Refilling Materials', 'Bulk Feeding'],
  'Elektrik/Hava Kesintisi': [
    UNPLANNED,
    'Lack Of Resources',
    'Power / Air Cut'
  ],
  'Personel Bekleme': [UNPLANNED, 'Lack Of Resources', 'Waiting for Staff'],
  'Üretim Planı Bekleme': [
    UNPLANNED,
    'Lack Of Resources',
    'Waiting for Plan'
  ],
  'Acil Durum Tahliye': [UNPLANNED, 'Others', 'Emergency Evacuation'],
  'Yarı Mamül Bekleme': [UNPLANNED, 'Lack Of Resources', 'Waiting for Bulk'],
  'Ambalaj, Etiket vs. Bekleme': [
    UNPLANNED,
    'Lack Of Resources',
    'Waiting for Packaging'
  ],
  'Bitmiş Ürün Kalite Problemi': [
    UNPLANNED,
    'Quality Issues',
    'Finished Product Quality'
  ],
  'Yarı Mamül Kalite Problemi': [
    UNPLANNED,
    'Quality Issues',
    'Bulk Quality'
  ],
  'Ambalaj, Etiket vs. Kalite Problemi': [
    UNPLANNED,
    'Quality Issues',
    'Packaging Quality'
  ],
  'Makine Ayarı': [UNPLANNED, 'Adjustments', 'Machine Set-up'],
  'Şişe Dizme Makine Arızası': [
    UNPLANNED,
    'Breakdown',
    'Bottle Unscrambler',
    'Bottle Unscrambler'
  ],
  'Dolum Makinesi Arızası': [
    UNPLANNED,
    'Breakdown',
    'Filler',
    'Filler'
  ],
  'Tarih Kodlama Makinesi Arızası': [
    UNPLANNED,
    'Breakdown',
    'Date Coder',
    'Date Coder'
  ],
  'Etiket Makinesi Arızası': [
    UNPLANNED,
    'Breakdown',
    'Labeller',
    'Labeller'
  ],
  'Kolileme Makinesi Arızası': [
    UNPLANNED,
    'Breakdown',
    'Case Packer',
    'Case Packer'
  ],
  'Koli Barkod Basma Makinesi Arızası': [
    UNPLANNED,
    'Breakdown',
    'Case Barcode Printer',
    'Case Barcode Printer'
  ],
  'Diğer Arızalar': [UNPLANNED, 'Breakdown', 'Other Breakdown'],
  'Kısa Duruşlar': [UNPLANNED, 'Minor Stops', 'Short Stops'],
  'Hat Hızı Düşürme/Eksik Personel': [
    UNPLANNED,
    'Reduced Speed',
    'Line Slowed / Short Staff'
  ],
  'Diğer Duruşlar': [UNPLANNED, 'Others', 'Other Stops'],
  'Fire (dk)': [UNPLANNED, 'Quality Issues', 'Rejects']
};
// Diğer (remainder) holds Düşük Hızda Çalışma (speed loss): split it so
// that the minutes of a row add up to the net operation time once.
var SPEED = 'Düşük Hızda Çalışma';
var REST = 'Diğer';
var SPEED_LOSS = [UNPLANNED, 'Reduced Speed', 'Low Speed Running'];
var REST_LOSS = [UNPLANNED, 'Not Logged', 'Not Logged'];
var FORMAT_COLUMNS = [
  'Brand',
  'Unit Size',
  'Unit Count/Format',
  'Extra Info'
];

var iso = msg.iso;
var machine = msg.machine;
var unique = msg.unique;
var info = msg.info;
var dayNumber = Date.parse(iso + 'T00:00:00Z') / 86400000;
var monthKey = '01/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
var dmy = iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
var loadedAt = msg.loadedAt || Date.now();
var targets = ((flow.get('targets_' + SITE) || {})[unique] || {})[
  monthKey
] || {};
var buckets = targets.b || {};
var notes = [];

function lossRow(r, loss, minutes) {
  var group = loss[0];
  var sub = loss[1];
  var name = loss[2];
  var part = r.product || r.code;
  var target = buckets[sub];
  var row = {
    Date: dayNumber,
    Time: r.start,
    MachineName: machine,
    PartName: part || null,
    ShiftName: r.shift,
    OEELossLvl3Group: group,
    OEELossLvl3SubGroup: sub,
    OEELossLvl3Desc: name,
    Duration: Math.round(minutes),
    SiteName: SITE,
    'Unique Machine Name': unique,
    'Breakdown Types': sub,
    ShiftStartDate: dayNumber,
    Comment: null,
    'Product Key': part ? unique + ' ' + part : null,
    'Volume Key': dmy + ' ' + machine + ' ' + group + ' ' + sub + ' ' + name,
    'Loss Units': r.speed * minutes / 60,
    Equipment: loss[3] || 'Unclassed',
    'Loss Target Key': unique + ' ' + sub + ' ' + monthKey,
    Value: null,
    'Volume Total': msg.capacityDay,
    'Loss Final Level': name,
    'Batch ID': r.order || null,
    Dept: info.Dept,
    Area: info.Area,
    'Product Type': info['Product Type'],
    'Equipment Loss Key': machine + ' ' + name,
    'Lvl 3 Loss Name': name,
    'Shift colour': null,
    'Time in Mins': minutes,
    'Shift Time': r.shift,
    'Data Source': DATA_SOURCE,
    'In EU Report': msg.inEuLosses,
    target: target === undefined ? null : Math.round(target * 1e4) / 1e6,
    comment_count: null,
    loaded_at: loadedAt
  };
  FORMAT_COLUMNS.forEach(function (column) {
    row[column] = null;
  });
  return row;
}

var losses = [];
var minutesDay = 0;
msg.rows.forEach(function (r) {
  var label = r.shift + ' ' + (r.order || r.code);
  var sum = 0;
  Object.keys(LOSSES).forEach(function (column) {
    var minutes = r.losses[column];
    if (minutes < 0) {
      notes.push(label + ': negative ' + column + ' ' + minutes);
    }
    if (minutes > 0) {
      losses.push(lossRow(r, LOSSES[column], minutes));
      sum += minutes;
    }
  });
  var rest = r.losses[REST];
  // Below 1 minute is rounding of cases x units per case / speed.
  if (rest < -1) {
    notes.push(label + ': negative remainder ' + Math.round(rest));
  }
  var total = Math.max(rest, 0);
  var speed = Math.min(Math.max(r.losses[SPEED], 0), total);
  if (speed > 0) {
    losses.push(lossRow(r, SPEED_LOSS, speed));
  }
  if (total - speed > 0) {
    losses.push(lossRow(r, REST_LOSS, total - speed));
  }
  sum += total;
  minutesDay += sum;
  // The rule of the workbook: run time + all losses = net operation time.
  if (Math.abs(r.runTime + sum - r.net) > 1) {
    var check = label + ': run time ' + Math.round(r.runTime);
    check += ' + losses ' + Math.round(sum) + ' <> net time ' + r.net;
    notes.push(check);
  }
});

msg.tables.Daily_Losses_EU = losses;
msg.notes = notes;
var log = machine + ' ' + iso + ': plan ' + msg.tables.Plan_OPT_EU.length;
log += ', losses ' + losses.length + ' (' + Math.round(minutesDay);
log += ' min)';
if (notes.length) {
  log += ', notes: ' + notes.join(' / ');
}
return [
  msg,
  {
    topic: 'log',
    payload: log
  }
];
