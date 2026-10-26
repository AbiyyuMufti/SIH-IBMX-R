// Checks on every day row of every Chartres OEE file the rules the entry form enforces
// (read from the VBA of BSAISIE, see docs/chartres-source-files.md):
//   I1 TOR = TOP - not-counted time (LR to LW)
//   I2 TU + NR + the eight loss totals = TOR
//   I3 sum of Temps over the 20 product slots = TOR
//   I4 TU = round(OEE x TOR)
//   I5 TU is about (sum of (Volume - Déchets) / Vitesse) over the slots   [our own test]
// Usage: node scripts/helper-chartres-invariants.js [downloads/Chartres]. Read only.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsx } from './lib-office.js';

const ROOT = process.argv[2] ?? 'downloads/Chartres';
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p.split('\\').join('/')];
  });
const num = (v) => (v === '' || v === undefined || v === null ? 0 : Number(v));
const SHIFTS = ['Semaine Matin', 'Semaine Après Midi', 'Semaine Nuit', 'Weekend Matin', 'Weekend Nuit'];
const TOTALS = [
  'Total Organisation', 'Total Changement', 'Total Rupture', 'Total Qualité',
  'Total Dysfonctionnement', 'Total Panne', 'Total Réglage', 'Total Maintenance Planifiée',
];

const out = [];
for (const path of walk(ROOT).filter((p) => /\/\d{4}\/SAISIE OEE\/OEE [^/]+\.xlsm$/.test(p))) {
  const x = readXlsx(path);
  const h = x.Base[0].map((n) => String(n).replace(/\s+/g, ' ').trim());
  const col = (n) => h.indexOf(n);
  const dateCol = col('Date');
  const rows = x.Base.slice(2).filter((r) => num(r[dateCol]) > 40000);
  const bad = { I1: 0, I2: 0, I3: 0, I4: 0, I5: 0 };
  for (const r of rows) {
    const top = num(r[col('TOP')]);
    const tor = num(r[col('TOR')]);
    const tu = num(r[col('TU')]);
    const nr = num(r[col('NR')]);
    const closed = ['TownHall - Réunion', 'Essais Planifiés', 'Formation', 'Validation / Qualification']
      .reduce((s, n) => s + num(r[col(n)]), 0);
    const losses = TOTALS.reduce((s, n) => s + num(r[col(n)]), 0);
    let time = 0;
    let real = 0;
    let theo = 0;
    let slotUseful = 0;
    for (const s of SHIFTS) {
      for (let k = 1; k <= 4; k += 1) {
        const t = num(r[col(`Temps PF${k} ${s}`)]);
        const v = num(r[col(`Volume PF${k} ${s}`)]);
        const w = num(r[col(`Déchets PF${k} ${s}`)]);
        const sp = num(r[col(`Vitesse PF${k} ${s}`)]);
        time += t;
        real += v - w;
        theo += sp * t;
        if (sp) {
          slotUseful += (v - w) / sp;
        }
      }
    }
    const oee = num(r[col('OEE')]);
    if (tor !== top - closed) bad.I1 += 1;
    if (tu + nr + losses !== tor) bad.I2 += 1;
    if (time !== tor) bad.I3 += 1;
    if (Math.round(oee * tor) !== tu) bad.I4 += 1;
    if (Math.abs(slotUseful - tu) > 1) bad.I5 += 1;
  }
  out.push({ file: path.slice(ROOT.length + 1).replace('/SAISIE OEE', ''), days: rows.length, ...bad });
}
console.table(out);
const total = out.reduce((a, o) => ({ days: a.days + o.days, I1: a.I1 + o.I1, I2: a.I2 + o.I2, I3: a.I3 + o.I3, I4: a.I4 + o.I4, I5: a.I5 + o.I5 }), { days: 0, I1: 0, I2: 0, I3: 0, I4: 0, I5: 0 });
console.log('TOTAL', JSON.stringify(total));
