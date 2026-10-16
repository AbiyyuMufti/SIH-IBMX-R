// Turns an error of a spike case into a small text file in the data lake.
// In: the message of a catch node (msg.spike names the case).
// Out: msg.payload = the error text, msg.path = Sandbox/spike/<case>_ERROR.txt.
var FOLDER = 'Sandbox/spike/';
var err = msg.error || {};
var name = msg.spike || 'unknown_case';
var source = (err.source && err.source.name) || 'unknown node';

msg.payload = name + ' failed in ' + source + ': ' + String(err.message);
msg.path = FOLDER + name + '_ERROR.txt';
msg.filename = name + '_ERROR.txt';
return msg;
