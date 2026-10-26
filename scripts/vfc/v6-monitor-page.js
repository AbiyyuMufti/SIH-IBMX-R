// Builds the self-contained monitor page: four tabs (live status, run log
// history, backfill, configuration), each with a visual and a raw view.
// In: an authenticated GET for the base monitor route.
// Out: HTML that polls status and lets the user inspect one month's log.

// Set once after the import: the access key of "Post backfill command".
// Filled: the page uses it and hides the key field. Empty: type it in the
// page. Anyone who can open this page can then queue a backfill.
var COMMAND_KEY = '';
// The key goes into the page script as a JSON string (no markup in it).
var presetKey = JSON.stringify(COMMAND_KEY).replace(/</g, '\\u003c');
// The browser code lives in scripts/browser/monitor-client.js. The builder
// puts it here as text, so this node only builds a string: nothing of the
// browser API is used by this node itself.
var clientScript = __CLIENT_SCRIPT__;
// The monitored flows: the builder fills in scripts/monitor-flows.js.
var MONITOR_FLOWS = __MONITOR_FLOWS__;

// One <option> per flow and line (value = flow id, text = label).
function options(list) {
  return list.map(function (item) {
    return '<option value="' + item.id + '">' + item.label + '</option>';
  }).join('\n');
}
// History: the flows with a run log, plus the command log of this monitor.
var historyOptions = options(MONITOR_FLOWS.filter(function (item) {
  return item.log;
}).concat([
  {
    id: 'run-monitor',
    label: 'Monitor command log'
  }
]));
var commandOptions = options(MONITOR_FLOWS.filter(function (item) {
  return item.backfill === 'days' || item.backfill === 'months';
}));

var css = [
  ':root{--bg:#f4f5f8;--card:#fff;--ink:#1b2230;--mute:#667085;',
  '--line:#e2e5ec;--accent:#2457d6;--ok:#13663f;--okbg:#dff3e7;',
  '--warn:#7a5200;--warnbg:#fdf0cf;--bad:#a8231a;--badbg:#fde3e0;',
  '--run:#1c47b8;--runbg:#e0e9ff;--idle:#475467;--idlebg:#eceef3}',
  '@media(prefers-color-scheme:dark){:root{--bg:#10141b;--card:#1a202a;',
  '--ink:#e7eaf0;--mute:#98a2b3;--line:#2b3340;--accent:#86a8ff;',
  '--ok:#74dba3;--okbg:#14372a;--warn:#f4c45e;--warnbg:#3b2e10;',
  '--bad:#ff8f86;--badbg:#44201c;--run:#93b4ff;--runbg:#1c2d55;',
  '--idle:#b6beca;--idlebg:#2a313d}}',
  '*{box-sizing:border-box}[hidden]{display:none!important}',
  'body{margin:0;background:var(--bg);color:var(--ink);',
  'font:14px/1.45 system-ui,sans-serif}',
  'header.top{display:flex;align-items:baseline;gap:1rem;flex-wrap:wrap;',
  'padding:1rem 1.25rem .25rem;max-width:1200px;margin:0 auto}',
  'h1{font-size:1.35rem;margin:0}',
  'h2{font-size:1.05rem;margin:1.5rem 0 .6rem}',
  'h3{font-size:1rem;margin:0}',
  '.mute{color:var(--mute)}.nw{white-space:nowrap}',
  '.wrap{word-break:break-word;min-width:14rem}',
  'nav.tabs{position:sticky;top:0;z-index:2;background:var(--bg);',
  'border-bottom:1px solid var(--line);display:flex;gap:.25rem;',
  'padding:0 1.25rem;max-width:1200px;margin:0 auto;overflow-x:auto}',
  '.tab{font:inherit;font-weight:600;color:var(--mute);background:none;',
  'border:0;border-bottom:3px solid transparent;padding:.7rem 1rem;',
  'cursor:pointer;white-space:nowrap}',
  '.tab:hover{color:var(--ink)}',
  '.tab.on{color:var(--accent);border-bottom-color:var(--accent)}',
  'main{max-width:1200px;margin:0 auto;padding:1rem 1.25rem 3rem}',
  '.toolbar{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;',
  'margin-bottom:.9rem}',
  '.spacer{flex:1}',
  'button,select,input{font:inherit;color:var(--ink);background:var(--card);',
  'border:1px solid var(--line);border-radius:6px;padding:.4rem .6rem}',
  'button{cursor:pointer}',
  'button.primary{background:var(--accent);border-color:var(--accent);',
  'color:#fff;font-weight:600}',
  'button.ghost:hover{border-color:var(--accent)}',
  '.sw{display:inline-flex;align-items:center;gap:.4rem;cursor:pointer}',
  '.sw input{padding:0}',
  '.cards{display:flex;flex-direction:column;gap:.7rem}',
  '.card{background:var(--card);border:1px solid var(--line);',
  'border-left:5px solid var(--idle);border-radius:8px;padding:.9rem 1rem;',
  'min-width:0}',
  '.card.run{border-left-color:var(--run)}',
  '.card.ok{border-left-color:var(--ok)}',
  '.card.warn{border-left-color:var(--warn)}',
  '.card.bad{border-left-color:var(--bad)}',
  '.card summary{display:flex;align-items:center;gap:.7rem;',
  'flex-wrap:wrap;cursor:pointer;list-style:none}',
  '.card summary::-webkit-details-marker{display:none}',
  '.card summary::before{content:"\\25B8";color:var(--mute)}',
  '.card[open] summary::before{content:"\\25BE"}',
  '.card summary .title{font-weight:700;font-size:1rem}',
  '.card summary .chips{margin:0;flex:1}',
  '.card .body{margin-top:.7rem;border-top:1px solid var(--line);',
  'padding-top:.7rem}',
  '.card.static header{display:flex;justify-content:space-between;',
  'align-items:center;gap:.5rem;margin-bottom:.5rem}',
  '.badge{display:inline-block;border-radius:999px;padding:.05rem .6rem;',
  'font-size:.78rem;font-weight:700;text-transform:uppercase;',
  'letter-spacing:.03em;white-space:nowrap}',
  '.badge.ok{color:var(--ok);background:var(--okbg)}',
  '.badge.run{color:var(--run);background:var(--runbg)}',
  '.badge.warn{color:var(--warn);background:var(--warnbg)}',
  '.badge.bad{color:var(--bad);background:var(--badbg)}',
  '.badge.idle{color:var(--idle);background:var(--idlebg)}',
  '.kv{display:grid;grid-template-columns:max-content 1fr;',
  'gap:.2rem .9rem;margin:0 0 .6rem}',
  '.kv dt{color:var(--mute)}.kv dd{margin:0;word-break:break-word}',
  '.last{background:var(--bg);border-radius:6px;padding:.5rem .7rem;',
  'margin:.4rem 0;word-break:break-word}',
  '.chips{display:flex;gap:.6rem;flex-wrap:wrap;margin:.5rem 0;',
  'align-items:center}',
  '.scroll{overflow:auto;border:1px solid var(--line);border-radius:6px;',
  'background:var(--card)}',
  '.scroll.short{max-height:300px}.scroll.tall{max-height:70vh}',
  'table{border-collapse:collapse;width:100%}',
  'th{position:sticky;top:0;background:var(--card);text-align:left;',
  'font-size:.75rem;text-transform:uppercase;color:var(--mute);',
  'letter-spacing:.04em}',
  'th,td{padding:.4rem .65rem;border-bottom:1px solid var(--line);',
  'vertical-align:top}',
  'tr:last-child td{border-bottom:0}',
  'tr.lv-bad td:first-child{box-shadow:inset 4px 0 var(--bad)}',
  'tr.lv-warn td:first-child{box-shadow:inset 4px 0 var(--warn)}',
  '.sub{font-size:.75rem}',
  '.meter{display:flex;align-items:center;gap:.5rem;font-size:.75rem}',
  '.track{flex:1;min-width:60px;max-width:140px;height:6px;',
  'background:var(--idlebg);border-radius:3px;overflow:hidden}',
  '.track i{display:block;height:100%;background:var(--run)}',
  'form.row{display:flex;gap:.9rem;flex-wrap:wrap;align-items:flex-end}',
  'form.row label{display:flex;flex-direction:column;gap:.2rem;',
  'font-weight:600;font-size:.85rem}',
  'form.row label.check{flex-direction:row;align-items:center;gap:.4rem;',
  'font-weight:400}',
  '.fields{display:contents}',
  '#keyRow{flex-basis:100%}',
  '#keyRow input{width:100%;max-width:34rem}',
  '.error{color:var(--bad);font-weight:600;margin:.5rem 0}',
  '.error:empty{display:none}',
  '.empty{padding:1.5rem;text-align:center;color:var(--mute)}',
  'pre{background:var(--card);border:1px solid var(--line);',
  'border-radius:6px;padding:1rem;overflow:auto;max-height:70vh;',
  'font:12.5px/1.45 ui-monospace,Consolas,monospace}',
  '@media(max-width:600px){main,nav.tabs,header.top{padding-left:.75rem;',
  'padding-right:.75rem}.kv{grid-template-columns:1fr}',
  '.kv dd{margin-bottom:.3rem}}'
].join('\n');

function rawBar(name, note, extra) {
  return [
    '<div class="toolbar"><span class="mute" id="' + name + 'Note">',
    note + '</span><span class="spacer"></span>' + (extra || ''),
    '<label class="sw"><input id="raw-' + name + '" type="checkbox">',
    'Raw JSON</label>',
    '<button id="copy-' + name + '" type="button" class="ghost">',
    'Copy JSON</button></div>'
  ].join('');
}

var html = [
  '<!doctype html>',
  '<html lang="en">',
  '<head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>Report run monitor</title>',
  '<style>' + css + '</style></head>',
  '<body>',
  '<header class="top"><h1>Report run monitor</h1></header>',
  '<nav class="tabs" role="tablist">',
  '<button id="tab-status" class="tab on" role="tab" type="button">',
  'Live status</button>',
  '<button id="tab-history" class="tab" role="tab" type="button">',
  'Run log history</button>',
  '<button id="tab-command" class="tab" role="tab" type="button">',
  'Backfill</button>',
  '<button id="tab-config" class="tab" role="tab" type="button">',
  'Configuration</button></nav>',
  '<main>',
  '<section id="panel-status" role="tabpanel">',
  rawBar(
    'status',
    'Refreshes every 10 seconds.',
    '<button id="clearStuck" type="button" class="ghost">Clear stuck</button>'
  ),
  '<p id="statusError" class="error"></p>',
  '<p id="statusInfo" class="mute"></p>',
  '<div id="statusView">Loading status...</div>',
  '<pre id="statusRaw" hidden></pre>',
  '</section>',
  '<section id="panel-history" role="tabpanel" hidden>',
  '<form id="historyForm" class="row">',
  '<label>Flow <select id="flow">',
  historyOptions,
  '</select></label>',
  '<label>Month <input id="month" type="month" required></label>',
  '<button type="submit" class="primary">Load history</button>',
  '<label>Level <select id="levelFilter">',
  '<option value="">All</option>',
  '<option value="failed">failed</option>',
  '<option value="error">error</option>',
  '<option value="warn">warn</option>',
  '<option value="info">info</option>',
  '</select></label>',
  '<label>Search <input id="textFilter" type="search"',
  ' placeholder="message, site, day"></label>',
  '</form>',
  rawBar('history', 'Choose a flow and month.'),
  '<p id="historyError" class="error"></p>',
  '<div id="historyView"></div>',
  '<pre id="historyRaw" hidden></pre>',
  '</section>',
  '<section id="panel-command" role="tabpanel" hidden>',
  '<p class="mute">The POST endpoint has its own key. Caps: 31 days or',
  ' 12 months. Force may run a second backfill concurrently.</p>',
  '<form id="commandForm" class="row">',
  '<label>Flow <select id="commandFlow">',
  commandOptions,
  '</select></label>',
  '<div id="dateFields" class="fields">',
  '<label>Start <input id="start" type="date"></label>',
  '<label>End <input id="end" type="date"></label></div>',
  '<div id="monthFields" class="fields" hidden>',
  '<label>From <input id="fromMonth" type="month"></label>',
  '<label>To <input id="toMonth" type="month"></label></div>',
  '<label class="check"><input id="force" type="checkbox">',
  'Force if busy</label>',
  '<button type="submit" class="primary">Queue backfill</button>',
  '<div id="keyRow">',
  '<label>Command key <input id="commandKey" type="text" size="50"',
  ' autocomplete="off"></label>',
  '<p class="mute">Paste the key of "Post backfill command" (the text',
  ' after key=; a pasted URL also works), or set COMMAND_KEY in node',
  ' 2.1.</p></div></form>',
  '<p id="commandError" class="error"></p>',
  rawBar('command', 'Answer of the last command.'),
  '<div id="commandView"><p class="mute">No command sent.</p></div>',
  '<pre id="commandResult" hidden>No command sent.</pre>',
  '</section>',
  '<section id="panel-config" role="tabpanel" hidden>',
  rawBar(
    'config',
    'Config tab settings and the report scope file.',
    '<button id="reloadConfig" type="button" class="ghost">Reload</button>'
  ),
  '<p id="configError" class="error"></p>',
  '<div id="configView"></div>',
  '<pre id="configRaw" hidden></pre>',
  '</section></main>',
  '<script>',
  '(function () {',
  'var presetKey = ' + presetKey + ';',
  clientScript,
  '})();',
  '</script></body></html>'
].join('\n');

msg.statusCode = 200;
msg.headers = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store'
};
msg.payload = html;
return msg;
