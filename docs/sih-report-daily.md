# SIH report daily: the three Tableau tables from the Insights Hub API

| At a glance | |
|---|---|
| **What** | One VFC tab per site, `<Site> SIH report daily` (Hull now), that writes `Plan_OPT_EU`, `Time_Utilisation_EU` and `Daily_Losses_EU` straight from the Insights Hub API, one file per production day, with the report columns of the PBI report build and `Data Source` = `SIH` |
| **Where** | Rows of a Config line whose source is `sih` (line `reportSource`, else site) go to `<root>/report/<table>/site=<Site>/<table>_<YYYY-MM-DD>_sih.parquet` (Tableau reads them next to the Provideam month files); all other rows to the same path below `<root>/candidate/sih/`. See [report-config.md](report-config.md) |
| **Flow** | `flows/vfc-pbi-daily-hull.json` (160 nodes, tab renamed from `Hull Power BI daily`: importing it replaces that tab). Generator `scripts/build-vfc-pbi-flows.js` (`SITES`), code `scripts/vfc/d*.js`, `s*.js` (API part, unchanged), `b5-*` / `b3-*` (site setup, shared with the PBI report build), `d8-report-rows.js` (report columns), `d8-day-path.js` |
| **Schedule** | A tick every hour (minute 7). Node 1.1 goes on only when the local hour of the site is `runHourLocal` in `1.1 CONFIG` (Hull: 6, so 06:07 local in summer and winter); a site without it runs only by its backfill button. A run builds the production days that have ended and the 2 days before them (`REBUILD_DAYS`) |
| **Production day** | `dayStartLocal` local time of the site's `timeZone` (Hull 06:00 to 06:00 local, 23 to 25 hours on the clock change days), see "Local time" below |
| **Status** | Built and tested offline on 2026-10-21 (`node scripts/test-vfc-sih-report.js platform=legacy\|xcelerator`, the platform proof `node scripts/test-platform-switch.js`). First run in the VFC on 2026-10-21 (Sep 2026, dry run then write): normal days fine; heavy days see "evaluateKPIs 413" below. `DRY_RUN` is `true` by default. Since 2026-10-21 the tab also writes live day checkpoints to global context `runStatus_sih-hull`; the monitor is described in [run-monitor.md](run-monitor.md). |
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

## Local time: the same local day and run time all year (2026-10-21)
Decision of the user (2026-10-21): the report must cover the same local time range for every site and arrive at the same local time, in summer and in winter (Hull: 06:00 to 06:00 local). This replaces the decision of 2026-10-19 that left the Power BI flows on UTC.
- **Production day.** Starts at `dayStartLocal` local time of the site's `timeZone`, so it is 23, 24 or 25 hours long (29 Mar and 25 Oct 2026). Hull in summer: 05:00 to 05:00 UTC, in winter 06:00 to 06:00 UTC. The shift of a stop or an hour is looked up on the local clock (the calendar rules hold local wall clock times). `All Time` stays 1440 on every day (decision of the user).
- **Run time.** Both tabs have a tick every hour (SIH report daily at minute 7, shift report at minute 17); node 1.1 goes on only when the local hour of the site is `runHourLocal` (Hull: 6, so 06:07 local all year). A run builds the days that have ended and the 2 days before them, so a day is built 3 times: data that arrives late is picked up by the next runs. Whether the API data is complete at 06:07 is a question for Reckitt (`runHourLocal` is a setting).
- **Time zones.** `TIME_ZONES` in `1.1 CONFIG`: Europe/London, Paris, Berlin, Rome, Warsaw, Sarajevo (EU summer time: every EU country changes at 01:00 UTC on the last Sunday of March and October) and Europe/Istanbul (UTC+3, no summer time). Config refuses another zone; add it to the list first. `dayStartLocal` must be 4 to 23 (an earlier start would fall on the clock change).
- **Proof (mock).** Against the commit before the change: a winter day (10 Dec 2026) gives the same requests, rows and log of the SIH tab; a summer day (16 Sep) moves the window from 06:00-06:00 UTC to 05:00-05:00 UTC; the shift report is the same on both days. Tests: `test-vfc-sih-report.js` (windows in summer, winter, 23 and 25 hour days, run hour, a UTC+3 zone), `test-vfc-rpt.js` (Europe/Berlin window, unknown zone refused, tick outside the run hour).

## evaluateKPIs 413 on heavy days: hourly fallback (2026-10-21)
Both tabs (SIH report daily and shift report) use the same rule. In the VFC every backfill day of Sep 2026 ended with `ERROR in POST evaluateKPIs: Error: Request Entity Too Large` (HTTP 413, "Too many status changes"); Siemens says a setup error causes it and will be fixed, date unknown. The probe of 2026-10-19 (7 Sep, B2 Line) failed for 24 h and 12 h windows and worked for 6 h and 3 h.
- **Rule.** The day call stays first. Node `Check day size` sends only an HTTP 413 to the lane `KPI PARTS`: one call per hour of the day window (24, or 23 / 25 on the clock change days; `PART_HOURS` in `Build hour requests`), one per second, a join, `Merge hour answers` builds one day answer (the hourly groups of every KPI, the same shape as the day call), which goes on to `KPI CHECK` as if the day call had worked. Any other error fails the day as before.
- **Product and order calls** (`VALUE PARTS`, `VALUE CHECK`) have the same fallback in their own lane (one shared lane would make a loop).
- **Log.** A day that needed it: `B2 Line: ... KPIs in 24 hourly parts (413 on the day)`. When an hourly call fails too, the day fails: `FAILED, NOTHING WRITTEN: B2 Line: evaluateKPIs failed, HTTP 413: also on 1 h windows: ...`.
- **Proof (mock).** Scenarios `kpi-413-day` (the day call answers 413, the hourly calls their hours) and `value-413-day` (the same for product 1002): the rows equal the normal run (`ok`, `products`) in both tabs; `kpi-413` (413 on every call): nothing written. Normal days: requests, rows and log identical to the commit before (2 tabs x 2 days x 5 scenarios).
- **First VFC run (2026-10-21, SIH report daily, 5 to 7 Sep, write mode).** The fallback works on the real tenant: the VFC http request node reports the 413 of the day call as an error (log `ERROR in POST evaluateKPIs: Error: Request Entity Too Large`, one line per heavy day) and still passes the answer on, so the hourly parts ran and the day went on to the stops. No `also on 1 h windows`. The days then failed on the stops: `B2 Line: downtimeReasons has more than one page` with 28,424 rows (5 Sep) and 78,710 rows (6 Sep); a normal day has 200 to 500 (4 Sep: 3,765). The same setup error as the 413 (the status of the line flips all the time). 7 Sep was still running when checked.
- **Decision of the user (2026-10-21): leave these days failing** (no paging of `downtimeReasons`), rerun them after Siemens fixes the setup. The ERROR line of the day call stays as a sign the fallback was needed.
- **Not covered (option A of the user):** time segments (shift report, machines; 413 for 24 h on 04 Cartoner in the probe) and `downtimeReasons` over 5,000 rows (one page). Rerun the heavy days and add them only if they show up.
- **Cost.** Only a day that answers 413: about 24 extra calls (and seconds) per asset, and per product or order that hits it.

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
