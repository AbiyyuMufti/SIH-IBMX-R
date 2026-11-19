// The SIH call chain of one asset and one production day, one step at a
// time. Each step: what it is for, the request, and a small table made from
// the real answer. Steps that need an id from an earlier step (calendar,
// product list, filter values) get it through `ctx.need(stepId)`.
// The order is the order of the SIH report daily tab, then the extra calls.

const hm = (iso) => (iso ? String(iso).slice(11, 16) : '');
const min = (ms) => (ms === null || ms === undefined ? null : Math.round(Number(ms) / 600) / 100);

export const STEPS = [
  {
    id: 'token', title: 'Get a token', used: true,
    why: 'Every call needs a Bearer token. The technical user gets one for about 30 minutes.',
    feeds: [],
    request: (c) => ({ method: 'POST', url: c.tokenUrl, body: 'grant_type=client_credentials' }),
    table: (b) => ({ head: ['field', 'value'], rows: [['access_token', '(hidden)'], ['expires_in', b.expires_in + ' s'], ['token_type', b.token_type]] })
  },
  {
    id: 'hierarchy', title: 'Where the asset sits', used: true,
    why: 'Asset Management gives the path reckitt › EU › site › area › line. The site comes from here.',
    feeds: ['SiteName'],
    request: (c) => ({ method: 'GET', url: `${c.am}/assets/${c.id}`, accept: 'application/hal+json' }),
    table: (b) => ({ head: ['level', 'name'], rows: (b.hierarchyPath || []).map((p, i) => [i + 1, p.name]).concat([[(b.hierarchyPath || []).length + 1, b.name]]) })
  },
  {
    id: 'config', title: 'Asset setup', used: true,
    why: 'Where good parts, product, order and speed come from (machine signal or operator), plus the calendar and the product list.',
    feeds: [],
    request: (c) => ({ method: 'GET', url: `${c.oee}/assets/${c.id}/config` }),
    table: (b) => ({
      head: ['setting', 'value'],
      rows: [
        ['good parts come from', b.operandSource?.good?.mode],
        ['rejected parts come from', b.operandSource?.rejected?.mode],
        ['product comes from', b.productSource?.mode],
        ['order comes from', b.orderSource?.mode],
        ['design speed comes from', b.designSpeedSource?.mode],
        ['calendar', b.calendarId ? 'set' : 'missing'],
        ['product list', b.productCollectionId ? 'set' : 'missing'],
        ['has operator entries', String(b.hasManuals)]
      ]
    })
  },
  {
    id: 'kpis', title: 'KPIs per hour', used: true,
    why: 'The OEE KPIs for the day, one value per hour. Source of Plan and Time Utilisation.',
    feeds: ['Good Parts', 'Total Time', 'Planned OpT', 'OEE Time', 'Defect Parts', 'OEE Time Total', 'Total Time Total', 'Planned OPT Total', 'RR Hours', 'RR Good Parts'],
    request: (c) => ({
      method: 'POST', url: `${c.oee}/expressions/evaluateKPIs`,
      body: { assetId: c.id, scope: { from: c.from, to: c.to, filter: [{ key: 'PRODUCT', value: [] }], recursive: false, groupedByDateTime: true } }
    }),
    table: (b) => {
      const k = (n) => b.results.find((r) => r.name === n) || { groups: [] };
      const good = k('Good parts');
      const cols = ['Good parts', 'Rejected parts', 'Used operational time', 'Operational time', 'Downtime (duration)'];
      const rows = (good.groups || []).map((g, i) => [hm(g.time)].concat(cols.map((n) => {
        const v = (k(n).groups || [])[i]?.value ?? null;
        return /time|duration/i.test(n) ? min(v) : v;
      })));
      rows.push(['day'].concat(cols.map((n) => (/time|duration/i.test(n) ? min(k(n).value) : k(n).value))));
      return { head: ['hour', 'good', 'rejected', 'used op. min', 'op. min', 'down min'], rows };
    }
  },
  {
    id: 'calendar', title: 'Shift calendar', used: true,
    why: 'The shift pattern as repeating events. Each hour gets its shift from here.',
    feeds: ['ShiftName', 'Shift Time', 'ShiftStartTime'],
    request: async (c) => {
      const cfg = await c.need('config');
      return { method: 'GET', url: `${c.oee}/calendars/${cfg.calendarId}/calendarEvents?from=${c.from}&to=${c.to}` };
    },
    table: (b) => ({
      head: ['shift', 'starts', 'hours', 'repeats every'],
      rows: (b.calendarEvents || []).map((e) => [e.name, e.rrule?.dtstart?.slice(0, 16).replace('T', ' '), e.duration / 3600000, (e.rrule?.interval || 1) + ' ' + String(e.rrule?.freq || '').toLowerCase()])
    })
  },
  {
    id: 'filtervalues', title: 'Products, orders, shifts of the day', used: true,
    why: 'Which products, orders and shifts ran in the day.',
    feeds: ['PartName', 'Batch ID'],
    request: (c) => ({ method: 'GET', url: `${c.oee}/assets/${c.id}/filterValues?from=${c.from}&to=${c.to}` }),
    table: (b) => ({ head: ['list', 'values'], rows: (b.filterValues || []).map((f) => [f.key, f.value.join(', ') || '(none)']) })
  },
  {
    id: 'products', title: 'Product master', used: true,
    why: 'Name, description and design speed of the products of the day. Design speed gives Capacity.',
    feeds: ['PartName', 'Product Key', 'Capacity', 'Downtime Units', 'Loss Units', 'Volume Total', 'Target', 'RR Capacity'],
    request: async (c) => {
      const cfg = await c.need('config');
      return { method: 'GET', url: `${c.oee}/productCollections/${cfg.productCollectionId}/products` };
    },
    table: async (b, c) => {
      const fv = await c.need('filtervalues');
      const today = (fv.filterValues || []).find((f) => f.key === 'product')?.value || [];
      const list = (b.products || []).filter((p) => today.includes(p.name));
      return {
        head: ['name', 'description', 'speed', 'per'],
        rows: list.map((p) => [p.name, p.description || '–', p.designSpeedValue, String(p.designSpeedInterval).toLowerCase()])
          .concat([[`${list.length} of ${(b.products || []).length} products ran today`, '', '', '']])
      };
    }
  },
  {
    id: 'valuekpis', title: 'KPIs per product', used: true,
    why: 'The same KPI call filtered on one product. An hour with parts belongs to that product. One call per product and order.',
    feeds: ['PartName', 'Product Key'],
    request: async (c) => {
      const fv = await c.need('filtervalues');
      const product = (fv.filterValues || []).find((f) => f.key === 'product')?.value?.[0] || '';
      return {
        method: 'POST', url: `${c.oee}/expressions/evaluateKPIs`,
        body: { assetId: c.id, scope: { from: c.from, to: c.to, filter: [{ key: 'PRODUCT', value: [product] }, { key: 'ORDER', value: [] }, { key: 'SHIFT', value: [] }], recursive: false, groupedByDateTime: true } }
      };
    },
    table: (b) => {
      const good = b.results.find((r) => r.name === 'Good parts') || { groups: [] };
      const product = b.scope?.filter?.[0]?.value?.[0];
      return { head: ['hour', 'good parts of ' + product], rows: (good.groups || []).filter((g) => g.value).map((g) => [hm(g.time), g.value]).concat([['day', good.value]]) };
    }
  },
  {
    id: 'stops', title: 'Stops with reasons', used: true,
    why: 'One row per stop (connected line) or per reason and shift (manual line). Source of the Loss rows.',
    feeds: ['Time', 'Duration', 'Time in Mins', 'OEELossLvl3Group', 'OEELossLvl3SubGroup', 'OEELossLvl3Desc', 'Lvl 3 Loss Name', 'Loss Final Level', 'Equipment', 'comment_count'],
    request: (c) => ({ method: 'GET', url: `${c.oee}/assets/${c.id}/downtimeReasons?from=${encodeURIComponent(c.from)}&to=${encodeURIComponent(c.to)}&size=5000&page=0` }),
    table: (b) => {
      const list = b._embedded?.downtimeReasons || [];
      const total = list.reduce((t, s) => t + Number(s.duration), 0);
      return {
        head: ['from', 'to', 'min', 'reason path', 'comments'],
        rows: list.slice(0, 60).map((s) => [hm(s.from), hm(s.to), min(s.duration), s.reasonFullPath || s.reason, s.commentCount])
          .concat([[`${list.length} stops`, '', min(total), list.length > 60 ? 'first 60 shown' : '', '']])
      };
    }
  },
  {
    id: 'manual', title: 'Operator shift entries', used: false,
    why: 'What an operator entered per shift: product, order, counts, reasons with minutes.',
    feeds: [],
    request: (c) => ({ method: 'GET', url: `${c.oee}/assets/${c.id}/manualInputs?from=${encodeURIComponent(c.from)}&to=${encodeURIComponent(c.to)}` }),
    table: (b) => ({
      head: ['from', 'to', 'product', 'order', 'good', 'rejected', 'reasons'],
      rows: (b.manualInputs || []).map((e) => [e.startTime.slice(5, 16).replace('T', ' '), e.endTime.slice(5, 16).replace('T', ' '), e.productName, e.order, e.good, e.rejected, (e.statuses || []).map((s) => s.name + ' ' + min(s.duration)).join('; ')])
    })
  },
  {
    id: 'hourly', title: 'Operator hourly entries', used: false,
    why: 'The hourly operator form: shift name as entered, counts, each stop with start and end, comments.',
    feeds: ['Comment', 'ShiftName', 'Time'],
    request: (c) => ({ method: 'GET', url: `${c.ts}/timeseries/${c.id}/OEE_Hourly_Entry?from=${encodeURIComponent(c.from)}&to=${encodeURIComponent(c.to)}&limit=2000` }),
    table: (b) => ({
      head: ['hour end', 'shift', 'product', 'good', 'stops (start–end name)', 'comments'],
      rows: (Array.isArray(b) ? b : []).map((h) => [hm(h.HourEndTime), h.ShiftName, h.ProductName, h.Good,
        JSON.parse(h.Statuses || '[]').map((s) => hm(s.startTime) + '–' + hm(s.endTime) + ' ' + s.name).join('; '),
        JSON.parse(h.Comments || '[]').map((x) => x.comment).join('; ')])
    })
  },
  {
    id: 'comment', title: 'Status comments', used: false,
    why: 'Stand-alone comments on statuses.',
    feeds: [],
    request: (c) => ({ method: 'GET', url: `${c.oee}/assets/${c.id}/comment?from=${encodeURIComponent(c.from)}&to=${encodeURIComponent(c.to)}` }),
    table: (b) => ({ head: ['comments'], rows: [[(Array.isArray(b) ? b.length : 0) + ' rows']] })
  },
  {
    id: 'reasons', title: 'Reason tree', used: false,
    why: 'All reasons a stop can get. Operators choose from this list.',
    feeds: [],
    request: (c) => ({ method: 'GET', url: `${c.oee}/reasontrees/${c.reasonTreeId}/reasons` }),
    table: (b) => {
      const list = b.reasons || [];
      const byId = new Map(list.map((r) => [r.id, r]));
      const kids = (id) => list.filter((r) => r.parentId === id).length;
      return {
        head: ['top level', 'children'],
        rows: list.filter((r) => !r.parentId || !byId.has(r.parentId)).map((r) => [r.name, kids(r.id)]).concat([[`${list.length} reasons in total`, '']])
      };
    }
  }
];
