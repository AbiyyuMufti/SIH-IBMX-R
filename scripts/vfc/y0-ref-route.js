// Sends the parsed file to the lookup node of its type.
// In: msg.type, msg.payload = the parsed rows. Out 1: machines, 2: glidepaths,
// 3: format list, 4: report scope, 5: loss names.
var ORDER = [
  'machines',
  'glidepaths',
  'formats',
  'scope',
  'losses'
];

var out = [
  null,
  null,
  null,
  null,
  null
];
var index = ORDER.indexOf(msg.type);
if (index !== -1) {
  out[index] = msg;
}
return out;
