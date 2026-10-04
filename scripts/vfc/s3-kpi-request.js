// Works out the asset hierarchy and builds the evaluateKPIs request.
// In: the Asset Management response. Out 1: the KPI request.
// Out 2: the asset result for the join when the asset failed or is excluded.
var cfg = flow.get('cfg');
var DAY_MS = 86400000;
var HOUR_MS = 3600000;

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

function toJoin(note) {
  msg.payload = {
    assetId: msg.asset.id,
    name: msg.asset.name,
    failed: note.failed || null,
    skipped: note.skipped || null,
    kpiRows: [],
    lossRows: []
  };
  return [null, msg];
}

var details = msg.payload;
if (msg.statusCode !== 200 || !details || !details.name) {
  return toJoin({
    failed: msg.asset.name + ': asset details failed, HTTP ' + msg.statusCode
  });
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
  return toJoin({ skipped: msg.h.asset_name + ' excluded' });
}

// A production day D runs from D start hour to D+1 start hour (UTC).
var from = Date.parse(msg.day + 'T00:00:00.000Z') + cfg.dayStartHour * HOUR_MS;
msg.method = 'POST';
msg.url = cfg.gateway + '/api/oee/v3/expressions/evaluateKPIs';
msg.headers = {
  'Authorization': 'Bearer ' + msg.token,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};
msg.payload = {
  assetId: msg.asset.id,
  scope: {
    from: new Date(from).toISOString(),
    to: new Date(from + DAY_MS).toISOString(),
    filter: [{ key: 'PRODUCT', value: [] }],
    recursive: false,
    groupedByDateTime: true
  }
};
return [msg, null];
