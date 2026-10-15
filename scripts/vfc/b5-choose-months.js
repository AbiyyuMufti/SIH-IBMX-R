// Chooses the month files to build: the months of the job that exist.
// In: msg.payload = objects of a folder, msg.filePrefix, msg.job.months.
// Out 1: msg.payload = list of {month, key} (a split follows). Out 2: a log
// line for months without a file. A missing file would stop a read node.
var items = Array.isArray(msg.payload) ? msg.payload : [];
var found = [];
var missing = [];
msg.job.months.forEach(function (month) {
  var wanted = msg.filePrefix + '_' + month + '.csv';
  var item = items.filter(function (entry) {
    return String(entry.key).slice(-wanted.length) === wanted;
  })[0];
  if (item) {
    found.push({
      month: month,
      key: item.key
    });
  } else {
    missing.push(month);
  }
});

var line = null;
if (missing.length) {
  line = {
    topic: 'log',
    payload: msg.day + ' [' + msg.mode + '] ' + msg.site +
      ': no ' + msg.filePrefix + ' file for ' + missing.join(', ') + ', skipped'
  };
}
node.status({
  fill: found.length ? 'green' : 'yellow',
  shape: 'dot',
  text: msg.site + ': ' + found.length + ' month(s), ' + missing.length +
    ' missing'
});
if (!found.length) {
  return [null, line];
}
msg.payload = found;
return [msg, line];
