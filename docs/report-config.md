# Report configuration: one root, one site list, a source per site and line

| At a glance | |
|---|---|
| **What** | How `1.1 CONFIG` (Config tab) describes the sites and lines of the EU report, where every flow writes, and how a site or a line moves from Provideam to Insights Hub (SIH) without changing Tableau |
| **Root** | `eu_report` (one value, `root` in `1.1 CONFIG`). Every flow writes below it |
| **Tableau reads** | `eu_report/report/<table>/`, the whole folder with its subfolders: one data source per table |
| **Switch** | `reportSource` per site (`provideam` or `sih`), optionally per line. The source in use writes to `report/`, the other one to `candidate/<source>/` |
| **Asset ids** | Button `List SIH assets` on the Config tab (stages 2 and 3): every Insights Hub line with its id and a block to paste into `lines` |
| **Status** | Step 1 of the plan (2026-10-20): built and tested offline (`node scripts/test-vfc-asset-list.js`, plus the flow tests), not run in the VFC yet |

## Folders in the data lake
```
eu_report/
  reference/<type>/site=<Site>/               shared input (machine names, shift patterns, glidepaths, equipment coding)
  pbi_report/source/<type>/site=<Site>/       Provideam CSV month files from SharePoint
  report/<table>/site=<Site>/<table>_<YYYY-MM>_<source>.parquet     what Tableau reads
  candidate/<source>/<table>/site=<Site>/...  the source not in use for that site, to compare
  shift_report/<table>/site=<Site>/...        the shift report tables
  logs/<flow>/log_<YYYY-MM>.csv
```
- The file name ends with the source (`_provideam`, `_sih`). Each flow replaces only its own files, so two sources never overwrite each other. Planned for step 2: when a line of a site comes from SIH and the rest from Provideam, both files of the month sit in the same folder and each holds only its own machines.
- The subscribe nodes of the `PBI report listener` tab have the folders `/eu_report/pbi_report/source/` and `/eu_report/reference/` as node properties (they cannot read Config). If the root changes, change them too.

## Sites and lines in `1.1 CONFIG`
```js
{
  name: 'Hull',
  reportSource: 'provideam',
  dayStartHour: 6,
  dayStartLocal: 6,
  timeZone: 'Europe/London',
  lines: [
    {
      id: '<32 character asset id>',
      sih: 'B2 Line',
      report: 'B2 Auto',
      shiftReport: true
    }
  ],
  reportExcludeNames: []
}
```
| Field | Meaning |
|---|---|
| `reportSource` (site) | `provideam` or `sih`: where the report rows of the site come from |
| `lines[].id` | the asset id: the flows use only this |
| `lines[].sih` | the name in Insights Hub, a label. The asset list warns when Insights Hub calls the id differently (renamed) |
| `lines[].report` | the `MachineName` of the line in the report and in the machine names file (B2 Line is `B2 Auto` in Provideam). `?` is refused |
| `lines[].reportSource` | optional, overrides the site for this line (used from step 2) |
| `lines[].shiftReport` | optional, `true` = the shift report flow builds this line |

The Config node checks the lines when you click Apply (32 character id, no id twice, `sih` and `report` filled, known sources) and stores nothing when one is wrong (red status with the reason). It then adds two lists for the flows: `assetIds` (all lines of the site) and `reportLineIds` (the lines with `shiftReport`). Before 2026-10-20 these two lists were typed by hand.

## Asset list (button `List SIH assets`)
Token, OEE asset list, one Asset Management call per asset (one per second, about a minute), then the debug node `ASSET LIST`:
- `problems`: a Config id not found, a line renamed in Insights Hub, a line in another site, an asset call that failed.
- `lines`: one text per line (OEE asset with no OEE asset above it): `site / area / line | auto or manual | id | n machines | in Config as <report>` or `not in Config`. Lines below `Test Line` are left out.
- `paste`: per site, a block for the lines not in Config yet, with `report: '?'` to fill in.

Read calls only, nothing is written. Asset list of 2026-10-20 (xcelerator, script, GET only): 37 lines outside `Test Line` in Hull, Nottingham (N1, N5, S04), Weinheim (L2), Mira (16), Tuzla (6), Chartres (1) and STP (1). The ids are not in this repo: the committed Config holds only the two Hull lines.

## Which flow writes where (after step 1)
| Flow | Writes |
|---|---|
| `PBI report build` (Provideam) | month tables to `report/` when the site's `reportSource` is `provideam`, else to `candidate/provideam/`; machine names, shift naming, calendar to `report/<table>/` (these three go away in step 2) |
| `Hull Power BI daily` (SIH) | always `candidate/sih/` (its tables do not have the report columns yet; step 4) |
| `Hull shift report` | `shift_report/` |
| `Power BI reference` | `<root>/<table>/`: to retire (the machine names come from the reference files, the calendar is dropped) |

## Plan
1. Config and folders (this page). Done offline.
2. The three report tables with the columns of the Tableau extracts (`Plan_OPT_EU`, `Daily_Losses_EU`, `Time_Utilisation_EU`, plus `Dept`, `Area`, `Product Type`, `Data Source`), the machine names and shift naming as lookups only, no calendar; split of the rows by line source.
3. Run in the VFC, check against Segun's files.
4. The SIH flow on the same three tables, one tab for all sites.
5. Switch sites or lines when the SIH rows match.
