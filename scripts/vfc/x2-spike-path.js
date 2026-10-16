// Sets the file path of a spike test in the data lake.
// In: the output of the parquet node (msg.spike names the test).
// Out: msg.path = Sandbox/spike/<test>.parquet and msg.filename.
var FOLDER = 'Sandbox/spike/';

msg.path = FOLDER + msg.spike + '.parquet';
msg.filename = msg.path.split('/').pop();
return msg;
