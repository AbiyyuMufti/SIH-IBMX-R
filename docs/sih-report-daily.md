# SIH report daily: the three Tableau tables from the Insights Hub API

| At a glance | |
|---|---|
| **What** | One VFC tab per site, `<Site> SIH report daily` (Hull now), that writes `Plan_OPT_EU`, `Time_Utilisation_EU` and `Daily_Losses_EU` straight from the Insights Hub API, one file per production day, with the report columns of the PBI report build and `Data Source` = `SIH` |
| **Where** | Rows of a Config line whose source is `sih` (line `reportSource`, else site) go to `<root>/report/<table>/site=<Site>/<table>_<YYYY-MM-DD>_sih.parquet` (Tableau reads them next to the Provideam month files); all other rows to the same path below `<root>/candidate/sih/`. See [report-config.md](report-config.md) |
| **Flow** | `flows/vfc-pbi-daily-hull.json` (160 nodes, tab renamed from `Hull Power BI daily`: importing it replaces that tab). Generator `scripts/build-vfc-pbi-flows.js` (`SITES`), code `scripts/vfc/d*.js`, `s*.js` (API part, unchanged), `b5-*` / `b3-*` (site setup, shared with the PBI report build), `d8-report-rows.js` (report columns), `d8-day-path.js` |
| **Schedule** | A tick every hour (minute 7). Node 1.1 goes on only in the hour `sihRunHourUtc` of the site in `1.1 CONFIG` (Hull: 7); a site without it runs only by its backfill button. A run builds yesterday and the 2 days before it (`REBUILD_DAYS`) |
| **Status** | Built and tested offline on 2026-10-21 (`node scripts/test-vfc-sih-report.js platform=legacy\|xcelerator`, the platform proof `node scripts/test-platform-switch.js`). Not run in the VFC yet. `DRY_RUN` is `true` by default |
| **Needs** | The Config tab and the reference files of the site in `<root>/reference/`: Glidepaths (`glidepaths/site=<Site>/`), Machine Names (`machine_names/site=<Site>/`), Shift Patterns (`shift_naming/site=All/`). A missing or empty file stops the run before any API call (log `FAILED, NOTHING WRITTEN: glidepaths Hull ...`) |

## Stages
1. Triggers: hourly tick and backfill (`{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}`), `1.1 SITE SETTINGS` (site, `DRY_RUN`, `REBUILD_DAYS`).
2. Site setup (the nodes of the PBI report build): target lookup from Glidepaths, machine lookup from Machine Names (without the report filters of the site: the Config lines choose the machines), shift lookup from Shift Patterns. Then the day list, one day every 5 s.
3. Per day and asset, the API part of the earlier Hull daily flow, unchanged: token, OEE asset list, asset hierarchy, `evaluateKPIs`, calendar shifts, products and orders, value KPIs, `downtimeReasons` (see [powerbi-direct.md](powerbi-direct.md) steps 2 to 8).
4. Join, collect, **Build report columns** (`d8-report-rows.js`), decide (no half days, dry run), one message per table and folder, parquet, path, write. Log `<root>/logs/sih-<site>/log_YYYY-MM.csv`.

## Column rules (Build report columns)
| Column | Rule |
|---|---|
| `MachineName` | the `report` name of the Config line of the asset (B2 Line: `B2 Auto`). An asset that is not a Config line keeps its Insights Hub name (log: `not a CONFIG line`) and follows the site's source |
| `Unique Machine Name` | `MachineName-Site` (was the asset id in the old daily tables) |
| `ShiftName`, `Shift Time` | the calendar event name when it is a report shift (Red, Green, Gold, Blue, Day, Night, Afternoon), else its Shift in the Shift Patterns file, else the name as it is (log: `shift not in the report`) |
| `PartName` | product description, else name (as before); `Product Key` = `Unique Machine Name` + space + `PartName` |
| `Good Parts`, `Total Time`, `Planned OpT`, `OEE Time` | whole numbers (INT64 like the report): parts rounded, minutes cut |
| `OEE Target`, `PDT Target`, `UPDT Target` | Glidepaths, by `Unique Machine Name` and month |
| `AreaName` | empty (no Provideam area in Insights Hub; Tableau has `Area`) |
| `Dept`, `Area`, `Product Type` | Machine Names, by `MachineName` |
| `OEELossLvl3Group`, `OEELossLvl3Desc`, `Lvl 3 Loss Name`, `Loss Final Level` | as Insights Hub gives them |
| `OEELossLvl3SubGroup` | the reason category, `Not Logged` when empty |
| `Equipment` | the reason sub group, `Unclassed` when empty |
| `Value`, `target` | Glidepaths bucket of the sub group and month, where the names agree |
| `Loss Units` | design speed per minute x duration (as before) |
| `Volume Total` | sum of `Capacity` of the machine and day |
| `Volume Key`, `Loss Target Key`, `Equipment Loss Key` | built the report way (`DD/MM/YYYY machine group sub desc`, `unique sub 01/MM/YYYY`, `machine desc`) |
| `Comment` | empty (Insights Hub gives only `comment_count`) |
| `Date`, `ShiftStartDate` | DATE (day number): the local date of the stop, the production day |
| `Time`, `Duration` | ms of the day on 1970-01-01, ms |

## Proof that the API part did not change (2026-10-21)
The flow before this change and the new flow on the same mock data (scenarios `ok`, `products`, `no-collection`): the same API calls in the same order, and every value that carries over equal (parts, minutes cut, capacity, downtime units, source hours, shift, part, stop time, duration, loss units, group, sub group, description, equipment, breakdown type, order, comment count). The platform proof compares the API calls of the new tab with the flow of commit `da968fc` on both platforms.

## SIH and Provideam: known differences (to discuss)
Found on the Hull SIH files of Sep and Oct 2026 (`candidate/sih/pbi_*`) against the Provideam rows of the same machines. The user decided on 2026-10-21 to build with these rules and discuss later.
1. **Loss reasons are different data.** Provideam has operator reasons ("Functionality Checks", "Component Quality", sub groups Adjustments, Quality Issues, Minor Stops, ...). Insights Hub has machine alarm texts ("117 CAPPER NOT RUNNING", "001 PRESSED EMERGENCY ...") and 68 % of the stops are `Not Logged` / `Unplanned Downtime` with no category. The loss tables will not match stop by stop: compare on totals per group and sub group. Glidepaths loss targets (`Value`) only fill where a SIH category has a report sub group name (Breakdown, Quality Issues, ...).
2. **Equipment.** Provideam uses the Equipment Coding file (machine + description); SIH uses its reason sub group (Capper, Infeed, Calibration, ...). The Equipment Coding lookup is not used.
3. **Shift names.** SIH calendars use Red, Gold, Blue, Green but also `Yellow`, `Morning Shift`, `Second Shift`, which are not report shifts; they are kept as they are (and logged).
4. **Report filters per site not applied.** The PBI report build leaves machines out per site (Hull: `GT4 - Auto` out of Plan OPT, Dept Dries Pack / Liquids Pack only in Machine Names; Nottingham: areas). The SIH tab takes every Config line and gives every line its Machine Names entry.
5. **`AreaName` empty**; Provideam has texts like `Hull Dries`.
6. **Minutes and parts.** SIH times come from KPIs in ms (cut to whole minutes in Plan OPT); Provideam from `H:MM:SS` text. SIH good parts can be fractional on manual lines; rounded per row.
7. **Plan grain.** SIH: machine x day x shift x product (from the product of each hour). Provideam: one row per run in the file.
8. **No comments.** SIH gives a comment count only.
9. **Unique Machine Name** changed from the asset id (old daily tables) to `MachineName-Site`, as in the report.
10. **Weinheim part names**: the PBI report build cuts the first 8 characters (part code); the SIH tab does not. Only matters when a Weinheim line is added.
