// Checks and reads one Base row from Power Automate. In: msg.payload (JSON).
// Out 1: msg.row {fileLine, iso, saved, base}. Out 2: the answer for a bad
// row (400) or a day before FIRST_DAY (200, not written).

// First production day written by this tab (the days before stay in the
// month files of the history load).
var FIRST_DAY = '2026-11-11';
var SAVED_COLUMN = 'Date et heure de la saisie';

function norm(value) {
  var text = value === undefined || value === null ? '' : String(value);
  return text.replace(/\s+/g, ' ').trim();
}

function reply(code, tag, detail) {
  msg.statusCode = code;
  msg.payload = {
    status: tag,
    detail: detail
  };
  msg.logLevel = code === 200 ? 'info' : 'warn';
  msg.logText = tag + ': ' + detail;
  return [null, msg];
}

var body = msg.payload;
if (!body || typeof body !== 'object' || Array.isArray(body)) {
  return reply(400, 'rejected', 'the body is not a JSON object');
}

// Same header spelling as the workbook sheet Base.
var base = {};
Object.keys(body).forEach(function (name) {
  base[norm(name).replace('Week-end', 'Weekend')] = body[name];
});

// The line is the workbook name: OEE <line> - <year>.xlsm
var fileName = norm(base.FileName);
var fileLine = fileName
  .replace(/^OEE /, '')
  .replace(/ - \d{4}\.xlsm?$/i, '');
if (!fileName || !fileLine) {
  return reply(400, 'rejected', 'FileName is missing');
}

// The day is ANNEE / MOIS / JOUR (the stored Date is off by a day on
// some rows).
var year = Number(base.ANNEE) || 0;
var month = Number(base.MOIS) || 0;
var dayOfMonth = Number(base.JOUR) || 0;
var iso = String(year) + '-' + ('0' + month).slice(-2) + '-' +
  ('0' + dayOfMonth).slice(-2);
var valid = year > 2000 && month >= 1 && month <= 12 && dayOfMonth >= 1;
if (valid) {
  var check = new Date(iso + 'T00:00:00Z');
  valid = !isNaN(check.getTime()) &&
    check.toISOString().slice(0, 10) === iso;
}
if (!valid) {
  return reply(400, 'rejected', fileLine + ': no valid ANNEE/MOIS/JOUR');
}
if (iso < FIRST_DAY) {
  return reply(200, 'ignored', fileLine + ' ' + iso + ' is before ' +
    FIRST_DAY);
}

msg.row = {
  fileLine: fileLine,
  iso: iso,
  saved: Number(base[SAVED_COLUMN]) || 0,
  base: base
};
node.status({
  fill: 'green',
  shape: 'dot',
  text: fileLine + ' ' + iso
});
return [msg, null];
