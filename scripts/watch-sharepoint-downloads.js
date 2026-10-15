// Watches the download folder and moves each new SharePoint file into the local layout:
//   sharepoint/<source_original|reference>/<type>/site=<Site>/<file>
// Only files that appear after the start are handled (existing files are left alone).
// A file is moved when it is complete: no .crdownload/.tmp name and the same size
// on two polls in a row. Chrome's " (1)" suffix is removed.
// Same name already there: identical bytes -> the download is deleted; different
// bytes -> the old file goes to sharepoint/_replaced/<date>/ and the new one takes
// its place (current month files are rewritten every hour on SharePoint).
// Unknown names stay in the download folder and are logged.
// Usage: node scripts/watch-sharepoint-downloads.js [download dir] [target root] [hours] [ignore file]
//   ignore file = names to leave alone (one per line); with it, every other file
//   already in the folder is sorted too (catch-up after a rule change).
import { readdirSync, statSync, readFileSync, mkdirSync, renameSync, unlinkSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const WATCH = process.argv[2] || 'downloads';
const TARGET = process.argv[3] || 'sharepoint';
const HOURS = Number(process.argv[4] || 4);
const POLL_MS = 2000;
const LOG = join(TARGET, 'download-log.csv');

// File name -> site. Hull files often have no site in the name, so Hull is the default
// for Provideam exports. Reference files must name their site.
function siteOf(name) {
  const n = name.toLowerCase();
  if (n.includes('notts') || n.includes('nots') || n.includes('nottingham')) {
    return 'Nottingham';
  }
  if (n.includes('wein')) {
    return 'Weinheim';
  }
  if (n.includes('mira')) {
    return 'Mira';
  }
  if (n.includes('hull')) {
    return 'Hull';
  }
  return null;
}

// File name -> [group, type]. Order matters: "opt" also appears in other words.
function typeOf(name) {
  const n = name.toLowerCase().replace(/[\s-]+/g, '_');
  const rules = [
    [/vol_?corr|volume_?corr|volume_loss_correction|vol_losses|_vc_/, 'source_original', 'volume_loss_correction'],
    [/line_losses|daily_losses|_losses_|_ll_|modelog|event_log/, 'source_original', 'line_losses'],
    [/run_?rates/, 'source_original', 'run_rates'],
    [/opt_volume|current_month_opt|_opt\.csv$|plan_?opt|_opt_/, 'source_original', 'plan_opt'],
    [/equipment/, 'reference', 'equipment_coding'],
    [/machine_?names/, 'reference', 'machine_names'],
    [/glidepath/, 'reference', 'glidepaths'],
    [/format_list/, 'reference', 'format_list'],
    [/shift_pattern/, 'reference', 'shift_naming'],
  ];
  const hit = rules.find((r) => r[0].test(n));
  return hit ? [hit[1], hit[2]] : null;
}

function cleanName(name) {
  return name.replace(/ \(\d+\)(\.[^.]+)$/, '$1');
}

function log(action, file, to = '') {
  const line = `${new Date().toISOString()},${action},"${file}","${to}"`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

function destOf(name) {
  const t = typeOf(name);
  if (!t) {
    return null;
  }
  const [group, type] = t;
  let site = siteOf(name);
  if (type === 'shift_naming') {
    site = 'All';
  }
  let file = cleanName(name);
  const hullPattern = /^([a-z]{3}\d{4}-monthly_|current_month_|\d{8}-daily_|(new )?plan opt \d|line_losses_v2|daily_losses|vol_losses|vol_correction|daily_volume_correction)/i;
  if (!site && group === 'source_original' && hullPattern.test(name)) {
    // Hull exports have no site in the name; the local copies carry "Hull_"
    site = 'Hull';
    file = 'Hull_' + file;
  }
  if (!site) {
    return null;
  }
  if (name.toLowerCase().endsWith('.xlsx')) {
    // Excel stays as the original; convert to CSV afterwards (Python, as for Machine Names).
    return join(TARGET, '_original_xlsx', site, file);
  }
  return join(TARGET, group, type, `site=${site}`, file);
}

function place(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) {
    if (Buffer.compare(readFileSync(src), readFileSync(dest)) === 0) {
      unlinkSync(src);
      log('duplicate-deleted', src, dest);
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    const old = join(TARGET, '_replaced', day, dest.slice(TARGET.length + 1));
    mkdirSync(dirname(old), { recursive: true });
    renameSync(dest, old);
    log('replaced-old-kept', dest, old);
  }
  renameSync(src, dest);
  log('moved', src, dest);
}

if (!existsSync(LOG)) {
  mkdirSync(TARGET, { recursive: true });
  appendFileSync(LOG, 'time,action,file,to\n');
}
const IGNORE = process.argv[5];
const known = IGNORE
  ? new Set(readFileSync(IGNORE, 'utf8').split(/\r?\n/).filter(Boolean))
  : new Set(readdirSync(WATCH));
const sizes = new Map();
const unknown = new Set();
console.log(`watching ${WATCH} (${known.size} existing entries ignored), target ${TARGET}, stops after ${HOURS} h`);

function poll() {
  for (const name of readdirSync(WATCH)) {
    if (known.has(name) || unknown.has(name)) {
      continue;
    }
    if (/\.(crdownload|tmp|part)$/i.test(name) || name.startsWith('Unconfirmed') || name.startsWith('~$')) {
      continue;
    }
    const full = join(WATCH, name);
    let st;
    try {
      st = statSync(full);
    } catch (e) {
      continue;
    }
    if (!st.isFile()) {
      continue;
    }
    // complete = same size as on the last poll and not touched for 3 s
    if (sizes.get(name) !== st.size || Date.now() - st.mtimeMs < 3000) {
      sizes.set(name, st.size);
      continue;
    }
    sizes.delete(name);
    const dest = destOf(name);
    if (!dest) {
      unknown.add(name);
      log('unknown-left', full);
      continue;
    }
    try {
      place(full, dest);
    } catch (e) {
      log('error ' + e.code, full, dest);
    }
  }
}

const timer = setInterval(poll, POLL_MS);
setTimeout(() => {
  clearInterval(timer);
  console.log('time limit reached, stopped');
}, HOURS * 3600 * 1000);
