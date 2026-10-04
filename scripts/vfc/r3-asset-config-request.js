// Saves the hierarchy of one asset and builds the OEE config request.
// In: the Asset Management response. Out 1: the config request.
// Out 2: the message for stage 3.4 when no config call is needed
// (details failed, asset excluded or asset not configured).
var cfg = flow.get('cfg');

// Names are root first. Tenant layout: [0] tenant, [1] region, [2] site,
// [3] area, [4] line, [5] machine. GT4 has no machine, so it is the line.
function hierarchyFromNames(names) {
  return {
    asset_name: names[names.length - 1] || null,
    site: names[2] || null,
    area: names[3] || null,
    line: names[4] || null,
    machine: names[5] || null
  };
}

var details = msg.payload;
msg.amFail = null;
msg.skip = null;
msg.h = null;
if (msg.statusCode !== 200 || !details || !details.name) {
  var text = msg.asset.name + ': asset details failed, HTTP ';
  msg.amFail = text + msg.statusCode;
} else {
  var names = (details.hierarchyPath || []).map(function (p) {
    return p.name;
  });
  names.push(details.name);
  msg.h = hierarchyFromNames(names);
  var excluded = cfg.excludeNames.indexOf(details.name) >= 0;
  var parentExcluded = names.slice(0, -1).some(function (n) {
    return cfg.excludeAncestorNames.indexOf(n) >= 0;
  });
  if (excluded || parentExcluded) {
    msg.skip = 'excluded';
  } else if (!msg.asset.isConfigured) {
    msg.skip = 'not configured';
  }
}

if (msg.amFail || msg.skip) {
  delete msg.payload;
  return [null, msg];
}
msg.method = 'GET';
msg.url = cfg.gateway + '/api/oee/v3/assets/' +
  encodeURIComponent(msg.asset.id) + '/config';
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Accept': 'application/json'
};
delete msg.payload;
return [msg, null];
