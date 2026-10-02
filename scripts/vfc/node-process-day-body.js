
// ===== Process one production day: token, hierarchy, KPIs and stops per asset, then build both tables =====
// Reads only. All calls use fetch with promise chains (no async/await, no loops in the wiring).
// Nothing is sent downstream unless EVERY call for the day succeeded (no half days).
var cfg = flow.get('cfg');
var day = msg.payload;
var mode = msg.mode;
var fromMs = Date.parse(day + 'T06:00:00.000Z');
var toMs = fromMs + 86400000;
var from = new Date(fromMs).toISOString(), to = new Date(toMs).toISOString();
var loadedAt = Date.now();

function http(method, url, token, body, hal) {
  var attempt = 0;
  function once() {
    attempt++;
    var headers = { Authorization: 'Bearer ' + token, Accept: hal ? 'application/hal+json' : 'application/json' };
    var opt = { method: method, headers: headers };
    if (body) { headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(url, opt).then(function (r) {
      return r.text().then(function (t) {
        var b; try { b = JSON.parse(t); } catch (e) { b = t; }
        if ((r.status === 429 || r.status >= 500) && attempt < 3) return new Promise(function (ok) { setTimeout(ok, 1500 * attempt); }).then(once);
        return { status: r.status, body: b };
      });
    });
  }
  return once();
}
function mustOk(r, what) { if (r.status !== 200) throw new Error(what + ' failed: HTTP ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 200)); return r.body; }

function getToken() {
  var basic = Buffer.from(cfg.clientId + ':' + cfg.clientSecret).toString('base64');
  var url = 'https://' + cfg.tenantName + '.piam.eu1.mindsphere.io/oauth/token?grant_type=client_credentials';
  return fetch(url, { method: 'POST', headers: { Authorization: 'Basic ' + basic, Accept: 'application/json' } }).then(function (r) {
    return r.json().then(function (b) {
      if (r.status !== 200 || !b.access_token) throw new Error('token request failed: HTTP ' + r.status);
      return b.access_token;
    });
  });
}

function loadAssets(token) {
  var all = [];
  function page(p) {
    return http('GET', cfg.gateway + '/api/assetmanagement/v3/assets?size=200&page=' + p, token, null, true).then(function (r) {
      var b = mustOk(r, 'asset list page ' + p);
      all = all.concat((b._embedded && b._embedded.assets) || []);
      return p + 1 < ((b.page && b.page.totalPages) || 1) ? page(p + 1) : all;
    });
  }
  return page(0);
}

function isExcluded(id, byId) {
  var a = byId[id], guard = 0;
  if (a && cfg.excludeNames.indexOf(a.name) >= 0) return true;
  var cur = a && byId[a.parentId];
  while (cur && guard++ < 20) { if (cfg.excludeAncestorNames.indexOf(cur.name) >= 0) return true; cur = byId[cur.parentId]; }
  return false;
}

function lossPages(token, id) {
  var rows = [];
  function page(p) {
    var url = cfg.gateway + '/api/oee/v3/assets/' + id + '/downtimeReasons?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&size=300&page=' + p;
    return http('GET', url, token).then(function (r) {
      var b = mustOk(r, 'downtimeReasons page ' + p);
      rows = rows.concat((b._embedded && b._embedded.downtimeReasons) || []);
      return p + 1 < ((b.page && b.page.totalPages) || 1) ? page(p + 1) : rows;
    });
  }
  return page(0);
}

var kpiRows = [], lossRows = [], unmapped = [], skipped = [], done = [];

getToken().then(function (token) {
  return Promise.all([loadAssets(token), http('GET', cfg.gateway + '/api/oee/v3/assets', token)]).then(function (res) {
    var byId = {};
    res[0].forEach(function (a) { byId[a.assetId] = a; });
    var oee = mustOk(res[1], 'OEE asset list');
    var oeeById = {};
    oee.forEach(function (o) { oeeById[o.assetId] = o; });
    var ids = cfg.assetIds && cfg.assetIds.length ? cfg.assetIds.slice() : oee.map(function (o) { return o.assetId; });
    var targets = [];
    ids.forEach(function (id) {
      if (!oeeById[id]) { skipped.push(id + ' not an OEE asset'); return; }
      var nm = byId[id] ? byId[id].name : id;
      if (isExcluded(id, byId)) { skipped.push(nm + ' excluded'); return; }
      if (oeeById[id].isConfigured === false) { skipped.push(nm + ' not configured'); return; }
      targets.push(id);
    });
    // one asset after the other (sequential promise chain)
    return targets.reduce(function (chain, id) {
      return chain.then(function () {
        var h = hierarchy(id, byId), nm = h.asset_name;
        var body = { assetId: id, scope: { from: from, to: to, filter: [{ key: 'PRODUCT', value: [] }], recursive: false, groupedByDateTime: true } };
        return http('POST', cfg.gateway + '/api/oee/v3/expressions/evaluateKPIs', token, body).then(function (r) {
          if (r.status === 400 && /configuration not finished/i.test(JSON.stringify(r.body))) { skipped.push(nm + ' configuration not finished'); return; }
          var b = mustOk(r, 'evaluateKPIs ' + nm);
          if (!b.results || !b.results.length) { skipped.push(nm + ' no data'); return; }
          var k = buildKpiRows(b, { assetId: id, isManual: oeeById[id].isManual, h: h, loadMode: mode, loadedAt: loadedAt, unmapped: unmapped });
          return lossPages(token, id).then(function (dr) {
            var l = buildLossRows(dr, { assetId: id, h: h, fromMs: fromMs, toMs: toMs, plannedRoots: cfg.plannedRoots, loadMode: mode, loadedAt: loadedAt });
            kpiRows = kpiRows.concat(k); lossRows = lossRows.concat(l);
            var sum = k.reduce(function (s, x) { return s + (x.total_time_ms || 0); }, 0);
            done.push(nm + ': ' + k.length + ' kpi rows, ' + l.length + ' stops, sum total_time ' + (sum / 3600000).toFixed(2) + ' h' + (l.droppedOutsideWindow ? ', ' + l.droppedOutsideWindow + ' stops outside the day ignored' : ''));
          });
        });
      });
    }, Promise.resolve());
  });
}).then(function () {
  var summary = day + ' [' + mode + '] ' + done.join(' | ') + (skipped.length ? ' | skipped: ' + skipped.join('; ') : '') + (unmapped.length ? ' | KPI without column: ' + unmapped.join(', ') : '');
  var logMsg = { topic: 'log', payload: summary };
  if (!kpiRows.length && !lossRows.length) {
    logMsg.payload += ' | NOTHING TO WRITE';
    node.status({ fill: 'grey', shape: 'ring', text: day + ' nothing to write' });
    node.send([null, null, logMsg]);
    return;
  }
  if (cfg.dryRun) {
    logMsg.payload += ' | DRY RUN: fact_kpi ' + kpiRows.length + ' rows, fact_loss ' + lossRows.length + ' rows. First rows: ' + JSON.stringify({ fact_kpi: kpiRows.slice(0, 2), fact_loss: lossRows.slice(0, 2) });
    node.status({ fill: 'yellow', shape: 'dot', text: day + ' dry run ' + kpiRows.length + '/' + lossRows.length });
    node.send([null, null, logMsg]);
    return;
  }
  var kpiMsg = kpiRows.length ? { topic: 'fact_kpi', day: day, payload: kpiRows, path: cfg.paths.fact_kpi.replace('YYYY-MM-DD', day) } : null;
  var lossMsg = lossRows.length ? { topic: 'fact_loss', day: day, payload: lossRows, path: cfg.paths.fact_loss.replace('YYYY-MM-DD', day) } : null;
  logMsg.payload += ' | WRITING fact_kpi ' + kpiRows.length + ' rows, fact_loss ' + lossRows.length + ' rows';
  node.status({ fill: 'green', shape: 'dot', text: day + ' ' + kpiRows.length + '/' + lossRows.length });
  node.send([kpiMsg, lossMsg, logMsg]);
}).catch(function (e) {
  // any failure: nothing is written for this day
  node.status({ fill: 'red', shape: 'ring', text: day + ' FAILED, nothing written' });
  node.send([null, null, { topic: 'log', payload: day + ' [' + mode + '] FAILED, NOTHING WRITTEN: ' + e.message }]);
});
return null;
