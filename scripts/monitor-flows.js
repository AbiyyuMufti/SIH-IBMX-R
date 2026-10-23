// The flows the Run monitor knows: ONE list for the whole monitor. The
// builders copy it into the monitor nodes and the page (__MONITOR_FLOWS__,
// see code() in lib-flow-builder.js), and validate-flow.js checks that every
// flow listed here writes its status and, if it has a backfill, has its
// "<id> BACKFILL" link in. How to add a flow: docs/run-monitor.md.
//   id        the flow name in the status key runStatus_<id>, the log folder
//             logs/<id>/ and the link "<id> BACKFILL"
//   label     the name on the monitor page
//   backfill  'days' (start/end, max 31 days), 'months' (from/to, max 12
//             months) or null (status only, no backfill)
//   log       true when the flow writes a CSV run log (Run log history tab)
//   tables    months flows only: the table names a command may choose
//   queueKey  optional global key of a job queue; a waiting job = busy
export const MONITOR_FLOWS = [
  {
    id: 'sih-hull',
    label: 'SIH report daily',
    backfill: 'days',
    log: true
  },
  {
    id: 'rpt-hull',
    label: 'Shift report',
    backfill: 'days',
    log: true
  },
  {
    id: 'pbi-report',
    label: 'PBI report build',
    backfill: 'months',
    log: true,
    tables: ['Plan_OPT_EU', 'Time_Utilisation_EU', 'Daily_Losses_EU'],
    queueKey: 'jobQueue'
  },
  {
    id: 'pbi-listener',
    label: 'PBI listener',
    backfill: null,
    log: false
  }
];

// The list as ES5 source for the function nodes and the browser page: one
// item per line (objects always, arrays over 3 items), no line over 80.
export function monitorFlowsSource(indent = '') {
  const lit = (value, pad) => {
    const inner = pad + '  ';
    if (Array.isArray(value)) {
      const items = value.map((item) => lit(item, inner));
      if (items.length <= 3 && items.every((item) => !item.includes('\n'))) {
        const flat = `[${items.join(', ')}]`;
        if (flat.length + pad.length < 60) {
          return flat;
        }
      }
      return `[\n${items.map((item) => inner + item).join(',\n')}\n${pad}]`;
    }
    if (value && typeof value === 'object') {
      const lines = Object.entries(value)
        .map(([key, item]) => `${inner}${key}: ${lit(item, inner)}`);
      return `{\n${lines.join(',\n')}\n${pad}}`;
    }
    if (typeof value === 'string') {
      return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    }
    return String(value);
  };
  return lit(MONITOR_FLOWS, indent);
}
