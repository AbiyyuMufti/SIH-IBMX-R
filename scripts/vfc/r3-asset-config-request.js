// Works out the hierarchy of one asset and builds the OEE config request.
// In: the Asset Management response. Out 1: the config request.
// Out 2: an item for the join when the asset failed or is excluded.
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

function toJoin(failed, skipped) {
  msg.payload = {
    name: msg.asset.name,
    failed: failed,
    skipped: skipped,
    rows: []
  };
  return [null, msg];
}

var details = msg.payload;
if (msg.statusCode !== 200 || !details || !details.name) {
  var text = msg.asset.name + ': asset details failed, HTTP ';
  return toJoin(text + msg.statusCode, null);
}

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
  return toJoin(null, msg.h.asset_name + ' excluded');
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
