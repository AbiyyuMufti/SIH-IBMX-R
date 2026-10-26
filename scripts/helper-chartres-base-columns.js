// Lists every column of the sheet Base, one row per column, for the Excel file
// analysis/chartres-base-columns.xlsx (written by helper-chartres-base-columns-xlsx.py).
// Sheet 1: the reference template (CREAM IWKA 2 2026, 383 columns).
// Sheet 2: columns of the other 2026 files whose name is not in the reference.
// Per column: French name, English, example value (newest day with a value), type,
// meaning, formula, which table it feeds, how sure the meaning is.
// Usage: node scripts/helper-chartres-base-columns.js [out.json]
// Read only. The JSON holds product names from the files and stays in downloads/ (git-ignored); the xlsx is tracked in analysis/.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsx } from './lib-office.js';
import { profileFile } from './chartres-profile.js';

const ROOT = 'downloads/Chartres';
const REFERENCE = 'CREAM Chartres/2026/SAISIE OEE/OEE IWKA 2 - 2026.xlsm';
const OUT = process.argv[2] ?? 'downloads/chartres-base-columns.json';
// Output of scripts/helper-chartres-vba-extract.py (the VBA source, read not run).
const VBA_DIR = 'downloads/chartres-vba/run1';
const SPECIAL = {
  360: 'form: date built from ANNEE / MOIS / JOUR',
  361: 'form: ISO week number of that date',
  365: 'form: Round(OEE x TOR), must equal TU or the day is refused',
  366: 'form: date of the day + time of saving',
};

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p.split('\\').join('/')];
  });
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const letters = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
};
const iso = (serial) => new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10);

// ---- English words of the machine part names (French -> English) -------------------
const WORDS = [
  [/Trieuse Pondérale/gi, 'checkweigher'],
  [/Tapis Rétractable/gi, 'retractable conveyor'],
  [/Lecteur code barres/gi, 'barcode reader'],
  [/Point de colle/gi, 'glue spot'],
  [/Étiquettes? Caisses?/gi, 'case labels'],
  [/Courroies Diverg\w*/gi, 'diverging belts'],
  [/Mise en étuis/gi, 'cartoning'],
  [/Distribution Sachets/gi, 'sachet feed'],
  [/Prise Caisses/gi, 'case pick-up'],
  [/Collage Caisses/gi, 'case gluing'],
  [/Débordement Crème \/ Niveau cuve/gi, 'cream overflow / tank level'],
  [/Non identifié/gi, 'unidentified'],
  [/REMPLISSEUSE/gi, 'filler'],
  [/ETUYEUSE|ÉTUYEUSE/gi, 'cartoner'],
  [/ENCAISSEUSE/gi, 'case packer'],
  [/SPATULEUSE/gi, 'spatula dispenser'],
  [/VISSEUSE/gi, 'capper'],
  [/ÉTIQUETEUSE|Étiqueteuse/gi, 'labeller'],
  [/OPERCULEUSE/gi, 'lid sealer'],
  [/SLEEVEUSE/gi, 'sleeving machine'],
  [/SCOTCHEUSE/gi, 'tape sealer'],
  [/Palettiseur/gi, 'palletiser'],
  [/Empileur/gi, 'stacker'],
  [/Embarquetteuse/gi, 'tray packer'],
  [/Coiffeuse/gi, 'cap placer'],
  [/Déviateur/gi, 'diverter'],
  [/Formeuse Barquette/gi, 'tray former'],
  [/VIDE FÛT/gi, 'barrel emptier'],
  [/BAC /gi, 'tank '],
  [/Bol /gi, 'bowl feeder '],
  [/Convoyeur Sortie/gi, 'outfeed conveyor'],
  [/Vérin/gi, 'cylinder'],
  [/Magasin/gi, 'magazine'],
  [/Orientation/gi, 'orientation'],
  [/Scellage/gi, 'sealing'],
  [/Introduction/gi, 'infeed'],
  [/Prise/gi, 'pick-up'],
  [/Fermeture/gi, 'closing'],
  [/Ejection|Éjection|Éjecteur/gi, 'ejection'],
  [/Dépose/gi, 'placing'],
  [/Clapet/gi, 'flap'],
  [/Bourrage/gi, 'jam'],
  [/évacuation/gi, 'discharge'],
  [/Étuis?/gi, 'cartons'],
  [/Caisses?/gi, 'cases'],
  [/Tubes?/gi, 'tubes'],
  [/Bouchons?/gi, 'caps'],
  [/Flacons?/gi, 'bottles'],
  [/Notices?/gi, 'leaflets'],
  [/Sachets?/gi, 'sachets'],
  [/Autres?/gi, 'other'],
];
const tr = (part) => WORDS.reduce((s, [re, en]) => s.replace(re, en), part);

// ---- Fixed names: [English, type, meaning, feeds, certainty] ---------------------------
const FILE = 'from the file';
const CHECK = 'checked on the data';
const INFER = 'inferred, confirm with the site';
const CODE = 'from the macro code';
const LOSS = 'Daily_Losses_EU';
const FIXED = {
  ANNEE: ['Year', 'number', 'Year of the day', 'Date (all tables)', FILE],
  MOIS: ['Month', 'number', 'Month of the day, 1 to 12', 'Date (all tables)', FILE],
  SEMAINE: ['Week', 'number', 'ISO week number of the day', 'not used', FILE],
  JOUR: ['Day', 'number', 'Day of the month', 'Date (all tables)', FILE],
  TOP: ['TOP, planned opening time', 'minutes', "Temps d'Ouverture Planifié, typed in the form (Temp0). The form refuses the day unless TOR + the not-counted time (LR to LW) = TOP", 'Time_Utilisation_EU (Total Time Total, candidate)', CODE],
  TOR: ['TOR, real opening time', 'minutes', "Temps d'Ouverture Réel = TOP minus the four not-counted items (Temp15 to Temp18), computed by the form. Must equal TU + NR + the eight loss totals, and the sum of Temps over the product slots", 'Time_Utilisation_EU (Total Time Total, Planned OPT Total: to decide)', CODE],
  TU: ['TU, useful time', 'minutes', 'Temps Utile, typed in the form (Temp2). The form refuses the day unless TU = Round(OEE x TOR), with OEE = sum of (Volume - Déchets) / sum of (Vitesse x Temps) of the day (sheet OEE, C33)', 'Time_Utilisation_EU (OEE Time Total)', CODE],
  NR: ['NR, not reported', 'minutes', 'Typed in the form (TempsNR1) and counted with the losses (Pertes) that must fill TOR - TU. The macro writes it as loss "Undefined". Can be negative (seen: -1). The name NR is not spelled out in the code (probably Non Renseigné)', LOSS, INFER],
  'Démarrage Ligne': ['Line start-up', 'minutes', 'Time to start the line', LOSS, FILE],
  'Arrêt Ligne': ['Line shut-down', 'minutes', 'Time to stop the line at the end of production', LOSS, FILE],
  Pauses: ['Breaks', 'minutes', 'Meal and break time', LOSS, FILE],
  Nettoyage: ['Cleaning', 'minutes', 'Cleaning of the line', LOSS, FILE],
  Désinfection: ['Sanitization', 'minutes', 'Disinfection of the line', LOSS, FILE],
  'Perte Cadence': ['Reduced speed', 'minutes', 'Minutes lost because the line ran slower than nominal. Unplanned', LOSS, FILE],
  'Organisation Autre': ['Other (organisation)', 'minutes', 'Other organisation time', LOSS, FILE],
  'Changement de Format': ['Format changeover', 'minutes', 'Time to change the pack format', LOSS, FILE],
  'Nbre de changement de format': ['Number of format changes', 'count', 'How many format changes: a COUNT, not minutes, and not in Total Changement', 'not used', FILE],
  'Changement de Formule': ['Formula change', 'minutes', 'Time to change the formula (bulk product)', LOSS, FILE],
  'Nbre de changement formule': ['Number of formula changes', 'count', 'COUNT, not minutes', 'not used', FILE],
  'Changement Composant / Lot / OF': ['Component / batch / work order change', 'minutes', 'Time to change a component, a batch or the work order (OF = Ordre de Fabrication)', LOSS, FILE],
  'Nbre changement composant lot OF': ['Number of component / batch / work order changes', 'count', 'COUNT, not minutes', 'not used', FILE],
  'Changement de consommable': ['Consumable change', 'minutes', 'Time to refill or change a consumable. Category: Refilling Materials', LOSS, FILE],
  'Rupture Formule': ['Lack of formula', 'minutes', 'Waiting for the formula (bulk) to be available', LOSS, FILE],
  'Rupture Composants': ['Lack of materials', 'minutes', 'Waiting for components (packaging)', LOSS, FILE],
  'Rupture Personnel': ['Lack of crew', 'minutes', 'Not enough operators', LOSS, FILE],
  'Rupture Utilité': ['Lack of utilities', 'minutes', 'No utility (air, water, power)', LOSS, FILE],
  'Rupture Technicien': ['Lack of technician', 'minutes', 'Waiting for a technician', LOSS, FILE],
  'Manque Documentation': ['Lack of documents', 'minutes', 'Documentation missing', LOSS, FILE],
  'Évacuation - Alarme Incendie': ['Fire alarm evacuation', 'minutes', 'Building evacuation', LOSS, FILE],
  'Rupture OF / Planning': ['Lack of work order / planning', 'minutes', 'No work order or no plan for the line', LOSS, FILE],
  'Qualité Composants': ['Quality issue: materials', 'minutes', 'Component quality problem', LOSS, FILE],
  'Qualité Formule': ['Quality issue: formula', 'minutes', 'Formula quality problem', LOSS, FILE],
  'Erreur / Retraitement / Recontrôle': ['Error / rework / recheck', 'minutes', 'Rework and re-inspection time', LOSS, FILE],
  'Réglages Camera': ['Camera adjustments', 'minutes', 'Adjusting the vision camera. In the Qualité block (some files count it in the Réglages block)', LOSS, FILE],
  'Auto Maintenance': ['Operator asset care', 'minutes', 'Autonomous maintenance by the operators. Planned', LOSS, FILE],
  'Maintenance Préventive Mensuelle': ['Monthly preventive maintenance', 'minutes', 'Planned monthly maintenance', LOSS, FILE],
  'Maintenance Préventive Annuelle': ['Annual preventive maintenance', 'minutes', 'Planned yearly maintenance', LOSS, FILE],
  'Maintenance Préventive Autre': ['Other preventive maintenance', 'minutes', 'Other planned maintenance', LOSS, FILE],
  'Action Maintenance Planifiée': ['Planned maintenance action', 'minutes', 'A planned maintenance task', LOSS, FILE],
  'TownHall - Réunion': ['Town hall meeting', 'minutes', 'Time not counted: meeting. Group "Production not scheduled"', 'Daily_Losses_EU (decide)', FILE],
  'Essais Planifiés': ['Planned trials', 'minutes', 'Time not counted: trials. Group "NPD/CapEX & Trials"', 'Daily_Losses_EU (decide)', FILE],
  Formation: ['Training', 'minutes', 'Time not counted: training. Group "Production not scheduled"', 'Daily_Losses_EU (decide)', FILE],
  'Validation / Qualification': ['Validation / qualification', 'minutes', 'Time not counted: validation. Group "NPD/CapEX & Trials"', 'Daily_Losses_EU (decide)', FILE],
  'Total Organisation': ['Total organisation', 'minutes', 'Sum of the Organisation block', 'check only', FILE],
  'Total Changement': ['Total changeovers', 'minutes', 'Format + formula + component + consumable changes (the count columns are left out)', 'check only', FILE],
  'Total Rupture': ['Total lack of resources', 'minutes', 'Sum of the Rupture block', 'check only', FILE],
  'Total Qualité': ['Total quality', 'minutes', 'Sum of the Qualité block', 'check only', FILE],
  'Total Dysfonctionnement': ['Total malfunctions', 'minutes', 'Sum of the Dysf block', 'check only', FILE],
  'Total Panne': ['Total breakdowns', 'minutes', 'Sum of the Panne block', 'check only', FILE],
  'Total Réglage': ['Total adjustments', 'minutes', 'Sum of the Réglages block', 'check only', FILE],
  'Total Maintenance Planifiée': ['Total planned maintenance', 'minutes', 'Sum of the Maintenance block', 'check only', FILE],
  'Total Temps Fermeture': ['Total closed time', 'minutes', 'Sum of the time not counted (LR to LW)', 'check only', FILE],
  'Total Volume': ['Total volume', 'units', 'Sum of the Volume of the 20 product slots', 'check only', FILE],
  'Vérification TO': ['Check TO', 'minutes', 'TU + NR + the eight loss totals; must equal TOR', 'check only', CHECK],
  OEE: ['OEE', 'ratio', "OEE of the day, copied by the form from sheet OEE (C33) = sum of (Volume - Déchets) / sum of (Vitesse x Temps) over the product slots. A stored value, not a formula", 'test of our rows', CODE],
  Date: ['Date', 'date', 'The day as an Excel date', 'Date (all tables)', FILE],
  'Vérification Semaine': ['Week check', 'number', 'Week number recomputed from the date', 'check only', FILE],
  'Vérification TOR': ['Check TOR', 'minutes', 'TOR + the time not counted; must equal TOP', 'check only', CHECK],
  'Total Déchets': ['Total waste', 'units', 'Sum of the waste: the Déchets of the 20 product slots (NON TISSE files: the per-machine waste columns)', 'check only', FILE],
  'Total Temps de production': ['Total production time', 'minutes', 'Sum of the Temps of the 20 product slots', 'check only', FILE],
  'Vérification TU': ['Check TU', 'minutes', 'Round(OEE x TOR), computed by the form; must equal TU or the day is refused', 'check only', CODE],
  'Date et heure de la saisie': ['Entry date and time', 'date and time', 'Date of the production day + the clock time when the day was saved (not the real entry date)', 'not used', CODE],
  "Sécurité Nombre d'actions ouvertes": ['Safety: open actions', 'count', 'Number of open safety actions (form field Secu1). Only the first three Sécurité columns are written', 'not used', CODE],
  "Sécurité Nombre d'actions cloturées": ['Safety: closed actions', 'count', 'Number of closed safety actions (form field Secu2)', 'not used', CODE],
  'Sécurité Nombre de "NON" total de la journée': ['Safety: number of "NO" answers', 'count', 'Number of "NO" answers in the safety check of the day (form field Secu3)', 'not used', CODE],
};

const SHIFTS = {
  'Semaine Matin': 'weekday morning',
  'Semaine Après Midi': 'weekday afternoon',
  'Semaine Nuit': 'weekday night',
  'Weekend Matin': 'weekend morning',
  'Weekend Nuit': 'weekend night',
  'Week-end Matin': 'weekend morning',
  'Week-end Nuit': 'weekend night',
};
const PF_FIELD = {
  Code: ['Code', 'code', 'Product code (SKU) typed in the form; it must exist in the sheet Data (column A) or the day is refused. The macro writes it as Batch ID', 'Plan_OPT_EU (Batch ID)'],
  Temps: ['Time', 'minutes', 'Minutes the line ran this product in this shift, typed. The sum over the 20 slots must equal TOR', 'Plan_OPT_EU (Total Time, Capacity)'],
  Volume: ['Volume', 'units', 'Units produced, typed (declared, before waste). The sheet OEE nets the waste: Volume Réel = Volume - Déchets', 'Plan_OPT_EU (Good Parts)'],
  'Déchets': ['Waste', 'units', 'Units wasted, typed. The macro PlanOPT reads it but never writes it (Defect Parts stays empty)', 'Plan_OPT_EU (decide: subtract from Volume)'],
  Nom: ['Name', 'text', 'Product name, filled by the form from the sheet Data (VLOOKUP on the code, column I of Data in the IWKA 2 layout)', 'Plan_OPT_EU (PartName)'],
  'Nom Formule': ['Formula name', 'text', 'Filled by the form from Data (column G in the IWKA 2 layout)', 'not used'],
  Caisse: ['Case', 'text', 'Case pack, for example X6. Filled from Data (column F)', 'not used'],
  Format: ['Format', 'text', 'Pack format, for example 100ml. Filled from Data (column B)', 'not used'],
  Vitesse: ['Speed', 'units per minute', 'Nominal speed of the product. Filled from Data (column J). Used in the OEE; the macro PlanOPT reads the speed from Data again, not from this column', 'Plan_OPT_EU (Capacity = Speed x Time)'],
};
const LOSS_TYPE = {
  Dysf: ['Malfunction', 'minor stop', 'Dysfonctionnement'],
  Panne: ['Breakdown', 'breakdown', 'Panne'],
  Réglages: ['Adjustment', 'adjustment', 'Réglages'],
  Réglage: ['Adjustment', 'adjustment', 'Réglage'],
};

// Returns { en, type, meaning, feeds, certainty, block } for a (normalised) column name.
function describe(name, category) {
  const n = norm(name);
  if (FIXED[n]) {
    const [en, type, meaning, feeds, certainty] = FIXED[n];
    return { en, type, meaning, feeds, certainty };
  }
  let m = n.match(/^(Code|Temps|Volume|Déchets|Nom Formule|Nom|Caisse|Format|Vitesse) PF(\d) (.+)$/);
  if (m && SHIFTS[m[3]]) {
    const [en, type, meaning, feeds] = PF_FIELD[m[1]];
    return { en: `${en} of product ${m[2]}, ${SHIFTS[m[3]]}`, type, meaning: `${meaning}. Slot PF${m[2]} (Produit Fini = finished product) of the ${SHIFTS[m[3]]} shift`, feeds, certainty: CODE };
  }
  m = n.match(/^Déchets (.+) (Semaine Matin|Semaine Après Midi|Semaine Nuit|Week-end Matin|Week-end Nuit)$/);
  if (m) {
    return { en: `Waste of ${tr(m[1])}, ${SHIFTS[m[2]]}`, type: 'units', meaning: `Waste counted at ${m[1]} in the ${SHIFTS[m[2]]} shift (NON TISSE files: Total Déchets sums these)`, feeds: 'not used (decide with Good Parts)', certainty: FILE };
  }
  m = n.match(/^Déchets (Semaine Matin|Semaine Après Midi|Semaine Nuit|Week-end Matin|Week-end Nuit)$/);
  if (m) {
    return { en: `Waste of the shift, ${SHIFTS[m[1]]}`, type: 'units', meaning: `Total waste of the ${SHIFTS[m[1]]} shift (NON TISSE files, next to the per-machine waste)`, feeds: 'not used (decide with Good Parts)', certainty: INFER };
  }
  m = n.match(/^Déchets Libre (\d+)$/);
  if (m) {
    return { en: `Waste, spare ${m[1]}`, type: 'units', meaning: 'Spare waste column', feeds: 'not used', certainty: FILE };
  }
  m = n.match(/^People\s+(Ext\s+)?ZAC\s+(.+)$/);
  if (m) {
    return { en: `People ${m[1] ? 'external ' : ''}ZAC: ${m[2]}`, type: 'person-minutes', meaning: `Labour time${m[1] ? ' of external staff' : ''} in zone ZAC (a plant zone, name kept) for ${m[2]}: people x minutes (values such as 2250 = 5 people x 450 min)`, feeds: 'not used', certainty: INFER };
  }
  m = n.match(/^People (.+)$/);
  if (m) {
    return { en: `People: ${m[1] === 'Journée' ? 'day' : m[1].replace(/^Libre/, 'spare')}`, type: 'person-minutes', meaning: 'Labour time of the shift, typed in the form as MOD (Main d\'Œuvre Directe = direct labour). Values such as 1800, 2250, 2460 look like people x minutes, not a headcount', feeds: 'not used', certainty: INFER };
  }
  m = n.match(/^(Dysf|Panne|Réglages?)\s+(.+)$/);
  if (m) {
    const [en, kind] = LOSS_TYPE[m[1]];
    const rest = m[2];
    if (/Libre \d+$/.test(rest)) {
      return { en: `${en}, spare ${rest.match(/(\d+)$/)[1]}`, type: 'minutes', meaning: `Spare slot of the ${en.toLowerCase()} block, a line can name it`, feeds: LOSS, certainty: FILE };
    }
    const cat = category?.[n];
    const catText = cat ? ` Category: ${cat.l1} / ${cat.l2} / ${cat.l3}` : '';
    return { en: `${en}: ${tr(rest)}`, type: 'minutes', meaning: `Minutes lost to ${kind} (${m[1]} = ${LOSS_TYPE[m[1]][2]}) on ${rest}.${catText}`, feeds: LOSS, certainty: FILE };
  }
  m = n.match(/^(Dysfonctionnement|Panne|Réglages|Orga|Changement|Rupture|Qualité|Maintenance Préventive|Vérification|Sécurité|Temps non compté) Libre (\d+)$/);
  if (m) {
    const kinds = { Dysfonctionnement: 'malfunction', Panne: 'breakdown', Réglages: 'adjustment', Orga: 'organisation', Changement: 'changeover', Rupture: 'lack of resources', Qualité: 'quality', 'Maintenance Préventive': 'maintenance', Vérification: 'check', Sécurité: 'safety', 'Temps non compté': 'time not counted' };
    const minutes = !['Vérification', 'Sécurité'].includes(m[1]);
    return { en: `${kinds[m[1]]}, spare ${m[2]}`, type: minutes ? 'minutes' : 'number', meaning: `Spare slot of the ${kinds[m[1]]} block (empty unless the line named it)`, feeds: minutes ? LOSS : 'not used', certainty: FILE };
  }
  m = n.match(/^Rupture Libre (\d+)$/);
  if (m) {
    return { en: `Lack of resources, spare ${m[1]}`, type: 'minutes', meaning: 'Spare slot', feeds: LOSS, certainty: FILE };
  }
  return { en: '', type: '', meaning: 'NOT DESCRIBED YET', feeds: '', certainty: '' };
}

// Which form field (or formula) writes each Base column, read from the form code BSAISIE.
function formWriters(rel) {
  const indexPath = `${VBA_DIR}/index.json`;
  if (!existsSync(indexPath)) {
    return {};
  }
  const index = JSON.parse(readFileSync(indexPath, 'utf8')).BSAISIE ?? {};
  const hit = Object.values(index).find((v) => v.workbooks.includes(rel));
  if (!hit) {
    return {};
  }
  const writers = { ...SPECIAL };
  const re = /Worksheets\("Base"\)\.Cells\(3, (\d+)\)(?:\.Value)?\s*=\s*(.+?)\s*(?:'(.*))?$/;
  for (const line of readFileSync(`${VBA_DIR}/${hit.file}`, 'utf8').split('\n')) {
    const m = line.match(re);
    if (!m) {
      continue;
    }
    const expr = m[2].trim();
    if (/^Var\w+$/.test(expr)) {
      writers[m[1]] = `form field ${expr.slice(3)}`;
    } else if (/^"=/.test(expr)) {
      writers[m[1]] = `form inserts formula ${expr.split('"')[1]}${m[3] ? ` (${m[3].trim()})` : ''}`;
    } else {
      writers[m[1]] = `form: ${expr.slice(0, 60)}`;
    }
  }
  return writers;
}

// ---- Read one file: header, codes, newest example per column, formulas -----------------
function readFile(rel) {
  const path = `${ROOT}/${rel}`;
  const x = readXlsx(path);
  const header = x.Base[0];
  const dateCol = header.indexOf('Date');
  const body = x.Base.slice(2)
    .filter((r) => Number(r[dateCol]) > 40000)
    .sort((a, b) => Number(b[dateCol]) - Number(a[dateCol]));
  const category = {};
  for (const r of (x.Category ?? []).slice(2)) {
    if (r[0]) {
      category[norm(r[0])] = { l3: r[1], l2: r[3], l1: r[5] };
    }
  }
  const formulas = {};
  for (const c of profileFile(path).sheets.find((s) => s.name === 'Base').cols) {
    formulas[c.col] = c.formula;
  }
  const writers = formWriters(rel);
  const columns = header.map((h, i) => {
    if (h === '' || h === undefined) {
      return null;
    }
    const hit = body.find((r) => r[i] !== '' && r[i] !== undefined && Number(r[i]) !== 0);
    let example = '';
    if (hit) {
      const v = hit[i];
      const isDate = /^Date( et heure de la saisie)?$/.test(norm(h));
      example = isDate ? `${iso(Number(v))}` : String(v).slice(0, 40);
      example += ` (${iso(Number(hit[dateCol]))})`;
    }
    const letter = letters(i);
    return {
      index: i + 1,
      letter,
      french: String(h),
      code: x.Base[1]?.[i] ?? '',
      example,
      formula: formulas[letter] ? `=${formulas[letter]}` : '',
      writtenBy: writers[i + 1] ?? '',
      ...describe(h, category),
    };
  }).filter(Boolean);
  return { columns, category, x };
}

const files2026 = walk(ROOT)
  .map((p) => p.slice(ROOT.length + 1))
  .filter((p) => /^[^/]+\/2026\/SAISIE OEE\/OEE [^/]+\.xlsm$/.test(p));
const ref = readFile(REFERENCE);
const refNames = new Set(ref.columns.map((c) => norm(c.french)));

// In how many of the 18 files each reference column exists.
const presence = {};
const extras = new Map();
for (const rel of files2026) {
  const line = rel.match(/OEE (.+) - 2026/)[1];
  const f = rel === REFERENCE ? ref : readFile(rel);
  for (const c of f.columns) {
    const key = norm(c.french);
    presence[key] = (presence[key] ?? 0) + 1;
    if (!refNames.has(key)) {
      const e = extras.get(key) ?? { ...c, lines: [] };
      e.lines.push(line);
      extras.set(key, e);
    }
  }
}
const refRows = ref.columns.map((c) => ({ ...c, inLines: presence[norm(c.french)] ?? 0, of: files2026.length }));
const extraRows = [...extras.values()]
  .map((e) => ({ ...e, inLines: e.lines.length, lineList: e.lines.join(', ') }))
  .sort((a, b) => a.lineList.localeCompare(b.lineList) || a.index - b.index);

const undescribed = [...refRows, ...extraRows].filter((r) => r.meaning === 'NOT DESCRIBED YET');
console.log(`reference ${refRows.length} columns, other lines ${extraRows.length} extra columns, not described: ${undescribed.length}`);
undescribed.slice(0, 20).forEach((r) => console.log('  ', r.letter, r.french));
writeFileSync(OUT, JSON.stringify({ reference: REFERENCE, files: files2026.length, refRows, extraRows }, null, 1));
console.log(`wrote ${OUT}`);
