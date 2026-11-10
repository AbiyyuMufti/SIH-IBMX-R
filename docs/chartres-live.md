# Chartres live: Power Automate rows to the report tables

| At a glance | |
|---|---|
| **What** | One VFC tab (`Chartres live`, not built yet) receives one `Base` row per request from Power Automate (hourly), converts it with the rules of [chartres-convert.md](chartres-convert.md) and writes the files of that line and day. |
| **Status** | Step 1 and 2 done 2026-11-10: the conversion as function nodes and the proof. The tab (http in, read lookups, write, log) is step 3, not built |
| **Code** | [`scripts/vfc/y1-read-row.js`](../scripts/vfc/y1-read-row.js) check and read, [`y2-plan-time.js`](../scripts/vfc/y2-plan-time.js) plan and time rows, [`y3-loss-rows.js`](../scripts/vfc/y3-loss-rows.js) loss rows, [`y4-cov-filler.js`](../scripts/vfc/y4-cov-filler.js) Volume CoV and filler |
| **Lookups** | `node scripts/chartres-live-lookups.js <run> <out file>` writes `chartres_lookups.json` (lines, loss names of the run, formats, targets, scope, ~350 KB). To upload to `<root>/chartres_live/lookups/` after the user's go. Rerun it when a run, the targets or the scope change |
| **Proof** | `node scripts/test-chartres-live.js <run> <lookups> filler=<filler folder> [from=YYYY-MM-DD]`: runs y1 to y4 on the Base rows of the run (7,333 days) and compares every column with the stage files and the filler of the run: all equal except IWKA1 2025-02-29 (not a real date, the live node answers 400). One accepted difference: a filler loss row gets `Shift Time` = its shift (the history filler has null where its month had no sibling row) |

## Rules (decisions of the user, 2026-11-10)
- Live starts **2026-11-11**: `FIRST_DAY` in y1. A row of an earlier day is answered 200 and not written (today's days come from the converter, rerun after the day ended).
- The line is `FileName` of the payload: `OEE CLÉOPATRE - 2026.xlsm` gives `CLÉOPATRE`.
- Day = `ANNEE` / `MOIS` / `JOUR`, production day 05:00 to 05:00 local wall clock.
- One file per table, line and day, the same path on every send, so a resend replaces the file: `<root>/report/<table>/site=Chartres/<table>_<YYYY-MM-DD>_<line>_excel.parquet` (planned name, step 3). Several lines cannot overwrite each other.
- No keep-newest rule yet: the last request of a line and day wins (hourly sender). The save time is in the row (`Date et heure de la saisie`) if it is needed later.
- A loss column that is not in the map gets the block rule of its name and a note in the log; a form rule that fails (TOR = TOP - not counted, TU + losses = TOR, sum of Temps = TOR) is a note, the rows are written.

## Found on the way
Four days (CUMULUS and ZEUS, 2026-01-03 and 2026-01-04) sit identically in the 2025 and the 2026 workbook and were loaded twice in run13 (the Good Parts of Jan 2026 CoV doubled). Run14 keeps identical copies once and lists differing ones ([chartres-convert.md](chartres-convert.md), Run14).

## Reference files for the live tab (decision of the user, 2026-11-10)
No copy of reference data in a JSON: the tab reads the lake reference files the other tabs read (`b5-*-lookup`): Machine Names (exists for Chartres), report scope, Format List, Glidepaths. Chartres had no Glidepaths file: `node scripts/chartres-glidepath.js` turns `TARGET 2.xlsx` (sheet `OEE 2025-2026`) into the standard layout (`Site Name`, `Line`, `OEE Bucket`, `01/MM/YYYY` columns, values in percent, 289 rows = 17 lines x 17 buckets, 24 months) at `sharepoint/reference/glidepaths/site=Chartres/Glidepath Chartres V1 <date>.csv`. Upload: `node scripts/datalake-upload-tree.js` (defaults `sharepoint/reference` to `eu_report/reference`, user's go). Only the French-to-English loss names have no reference file yet (CSV `reference/localisation/site=Chartres/chartres-losses.csv`, user's choice 2026-11-10, made by `node scripts/chartres-loss-names.js <run>`; local copy `sharepoint/reference/localisation/...`, not uploaded yet). `chartres-live-lookups.js` and the JSON are replaced by these.
