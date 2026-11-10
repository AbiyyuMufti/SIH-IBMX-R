# Chartres live: Power Automate rows to the report tables

| At a glance | |
|---|---|
| **What** | VFC tab `Chartres live` ([flows/vfc-chartres-live.json](../flows/vfc-chartres-live.json), 117 nodes): Power Automate sends one `Base` row of a Chartres OEE workbook per request (hourly), the tab turns it into the report rows with the rules of [chartres-convert.md](chartres-convert.md) and writes the files of that line and day |
| **Status** | Built and tested offline 2026-11-10 (`node scripts/test-chartres-live.js downloads/chartres-convert/run15 filler=downloads/chartres-filler-20261110c`), not imported in the VFC yet. `DRY_RUN` is `true` in node `1.1 SETTINGS (edit here)` (the user sets it to `false`) |
| **Build** | `node scripts/build-vfc-chartres-live.js` (do not edit the JSON). Code: [`y0-*.js`](../scripts/vfc/) settings and reference, [`y1-read-row.js`](../scripts/vfc/y1-read-row.js), [`y2-plan-time.js`](../scripts/vfc/y2-plan-time.js), [`y3-loss-rows.js`](../scripts/vfc/y3-loss-rows.js), [`y4-cov-filler.js`](../scripts/vfc/y4-cov-filler.js), [`y5-route-tables.js`](../scripts/vfc/y5-route-tables.js), [`y5-set-path.js`](../scripts/vfc/y5-set-path.js), [`y6-answer.js`](../scripts/vfc/y6-answer.js); `b3-pick-file.js` and `b5-*-lookup.js` are the nodes of the PBI report build |
| **Endpoint** | `POST /chartres-data`, access key generated on the `http in` node after the import (never in the repo). Delete or disable the old test tab `Excel Power Automate` first (same endpoint) |
| **Writes** | `<root>/report/<table>/site=Chartres/<table>_<YYYY-MM-DD>_<line>_excel.parquet` for `Plan_OPT_EU`, `Time_Utilisation_EU`, `Daily_Losses_EU`, `Volume_CoV_EU`. Same path on every resend of a line and day: the resend replaces the file, two lines never overwrite each other |

## Rules (decisions of the user, 2026-11-10)
- Live starts **2026-11-11** (`FIRST_DAY` in y1). A row of an earlier day is answered 200 and not written. Days up to 2026-11-10 come from the converter (rerun after the day ended, upload November).
- The line is `FileName` of the payload: `OEE CLÉOPATRE - 2026.xlsm` gives `CLÉOPATRE`, matched to the Machine Names list without accents, spaces or hyphens. A line that is not in Machine Names (CUPIDON, DAISY) gets 400.
- Day = `ANNEE` / `MOIS` / `JOUR`, production day 05:00 to 05:00 local wall clock. Good Parts = Volume - Déchets. Shift `Morning`, `Afternoon`, `Night`.
- No keep-newest rule: the last request of a line and day wins (the sender is hourly). The save time is in the row (`Date et heure de la saisie`) if it is needed later.
- A loss column that is not in the loss names file gets the block rule of its name and a note in the log; a form rule that fails (TOR = TOP - not counted, TU + losses = TOR, sum of Temps = TOR) is a note, the rows are written.

## Reference files (no copy in the flow; edit the file, the tab reloads it hourly)
| Need | File in `<root>/reference/` | Node |
|---|---|---|
| Dept, Area, Product Type | `machine_names/site=Chartres/Chartres_MachineNames.csv` | `b5-machine-lookup.js` |
| In EU Report (SACHA1, SACHA2 out) | `report_scope/site=All/report_scope.csv` | `b5-scope-lookup.js` |
| OEE, PDT, UPDT, loss targets | `glidepaths/site=Chartres/Glidepath Chartres V1 20261110.csv` (percent), made by `node scripts/chartres-glidepath.js` from `TARGET 2.xlsx` | `b5-target-lookup.js` |
| Brand, unit size, case | `format_list/site=Chartres/Format List Chartres 2026.csv`, made by `node scripts/chartres-format-list.js <run>`. A new product: add a row | `b5-format-lookup.js` |
| French loss column to English names | `localisation/site=Chartres/chartres-losses.csv` (1,257 rows), made by `node scripts/chartres-loss-names.js <run>`. To change a name: edit the CSV | `y0-loss-lookup.js` |

The newest `.csv` of each folder is used (upload time decides). The tab is ready when the five files came in (5 s after a deploy, then every hour at minute 7); a request before that gets 503 and Power Automate sends it again.

## Proof
`node scripts/test-chartres-live.js <run> filler=<filler folder> [from=YYYY-MM-DD]` loads the real reference CSV files through the lookup nodes, runs the function nodes on the Base rows of the run (7,046 days) and compares every row and column with the stage files of the run and its filler: all equal. Not equal: IWKA1 2025-02-29 (not a date, answered 400) and CUPIDON / DAISY (288 days, not in Machine Names). One accepted difference: a filler loss row gets `Shift Time` = its shift (the history filler has null where its month had no sibling row). The same test checks the style of every node, the 400 / 200 / 503 answers, the dry run, the file path and the reference counter.

## Open
- **Answer after the write:** the answer (200) is sent when the rows are built, not after the files are written (the write node has no output); a failed write is only in the log (ERRORS lane), the sender is not told.
- **AreaName** of the history rows was the workbook folder (CUMULUS sits in `CREAM Chartres`); since run15 it is the Area of the Machine Names list (CUMULUS = NON WOVEN), as in the live tab. Run15 differs from run14 only there (Plan_OPT_EU and its filler); upload with the user's go.
- Found on the way: four days in two workbooks (CUMULUS, ZEUS 2026-01-03 / 04) were loaded twice in run13 (fixed in run14, uploaded 2026-11-10).
