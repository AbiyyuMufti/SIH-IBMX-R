# Site test (light UAT) of the Tableau dashboard

Draft v2, 2026-11-03. The sheet for the sites is [uat-site-test-story.xlsx](uat-site-test-story.xlsx): two sheets, `Test` (20 steps in plain words) and `Good to know` (10 normal differences). This note is the background for the reviewer: where the content comes from, the detailed list of differences (appendix, D01 to D28) and what is open. It is not sent to the sites.

## What changed against v1 (and why)
v1 (same day) was written without the Tableau workbook open. Its page names came from the Hull Power BI report and from the earlier analysis, and its reference numbers came from the Power BI EU report and our lake tables, not from Tableau. v2 is written against the real Tableau workbook. The Excel was then cut down to two plain sheets; the detail moved into this note (appendix and the readings below).

## What the Tableau draft is (read 2026-11-03)
- Workbook "Site OEE Report - Draft_Live V0.1" in Insights Hub Business Intelligence (tenant reckitt).
- 11 pages: EU-Level Overview, Site-Level Overview, Planned Losses, Unplanned Losses, Site - L2/L3 FIT View, Site-Loss Trending, Site-Maintenance (BETA), Site-By Shift Breakdown, Site-By Format Breakdown, Site-OEE Trending, Site-Historical OEE.
- Filters: From, To, Site, Line, Product Type, Shift Name (a Department filter was not seen). Default dates 1 Sep 2025 to 30 Jun 2026, Site = All (Hull, Nottingham, Mira, Weinheim).
- Data sources: until 3 Nov 2026 the workbook read the 8 `Site_draft_*` sources (last updated 30 Oct 2026). It was repointed on 3 Nov 2026 to the `Live_*` sources (Run_Rates_EU, Plan_OPT_EU, Volume_CoV_EU, Time_Utilisation_EU, Daily_Losses_EU, Format_List_EU, PDT_Targets, UPDT_Targets, Historical_OEE_EU). They sync from `/eu_report/report/<Table>/` (Subscription; the five report tables overwrote on 3 Nov 13:09, Format List / PDT / UPDT appended 2 Nov 19:43; no errors).
- After the repoint (checked in the browser the same day): the workbook is now named "Site OEE Report - Draft_Live", the EU page lists only Nottingham and Hull (Weinheim and Mira gone), a Department filter appeared, and with To = 3 Nov 2026 the month charts run from Sep 2025 to Nov 2026 (November partial). The date filter still opens on 1 Sep 2025 to 30 Jun 2026.
- Only the top of each page was read; every page needs one scroll-through before the sheet goes out.

## Consequence for the test
The live data is in Tableau, so Periods B and C can be tested (October 2026 and November days). Testers must move the To date, because the filter opens on 30 Jun 2026. First test proposed: 1 to 30 Oct 2026, Hull and Nottingham, against the Power BI reports.

## Test sheet structure
Sections: A get ready, B Europe, C your site, D why did we lose time, E every morning (L2/L3 FIT View), F trends, G shifts and products, H maintenance and history, I your opinion. Each line: Tableau page, what to look at, what to see, and a Yes / No / Cannot compare answer plus notes. The long story version (47 steps in v2) was dropped as too heavy for managers.

## Findings from the first look at Tableau (for Segun, not for the sites yet). D24 to D28 and D17 were seen before the repoint and must be re-checked on the live data
- D29 (new, after the repoint): the Europe page counts the volume of every machine, also those flagged out of the EU report (about 4 to 5 % above Power BI in October). OEE and loss % agree within 0.3 points.
- D24: a "Null" shift row (OEE 39.07 %) and a "Null" brand bar with the highest OEE.
- D26: the "Total Loss (Mins)" card shows `#######` on the Planned and Unplanned Losses pages.
- D27: OEE by year 2025 = 14.49 %, 2026 = 53.28 % (window 1 Sep 2025 to 30 Jun 2026): looks wrong.
- D28: tiny differences between pages (22.31 % and 22.32 %).
- D17: Historical OEE gauge 35.87 % with the dates set to the current window.

## Known differences (appendix below, D01 to D29)
D01 to D21 come from the earlier analysis ([site-dashboards-analysis.md](site-dashboards-analysis.md) sections 1.3, 2.2, 4a, 6) and from the table checks of 2026-11-03: the EU machine filter (D01), machines and loss groups left out in our build (D02), duplicate removal (D03), glidepath targets (D04), whole-minute times (D05), machines with no department (D06), partial and corrected days (D07), sub group spellings (D08) and so on. D22 to D28 are new, from the Tableau reading. Entries about Tableau filters (D01, D09, D10) say "not confirmed" where the Tableau behaviour was not checked.

## Checks of our own build done on 2026-11-03 (not Tableau)
- Plan_OPT_EU, 1 Nov 2026: source file to report row per machine: Good Parts, rows and Total Time equal for Hull and Nottingham; OEE Time up to 1 minute lower (whole minutes). `GT4 - Auto` and `N11 Auto` are dropped by design.
- Daily_Losses_EU, 1 Nov 2026: Hull 431 source rows to 267 (160 micro stoppage and 4 "Production not scheduled" dropped), Nottingham 516 to 481 (35 "Production Not Scheduled" dropped). October has none of these groups either.
- Hull, 1 to 30 Oct 2026, Power BI EU report against our lake tables: volume and run hours equal, loss events and minutes 0.7 to 2.2 % lower in our tables. Not traced yet.

## Open points
1. Segun: apply "In EU Report" to the volume on EU-Level Overview (D29); which pages are planned beyond the 11.
2. Segun: findings D22, D24, D26, D27, D28, D17.
3. Reckitt / sites: whether Auto machines and micro stoppages belong in the report (D02); tolerances; who tests and when.
4. Trace the 1 to 2 % loss gap on one Hull machine (D21).
5. Scroll each Tableau page once and add missing visuals to the Story.

## For you and Segun: decisions and tasks (not in the sheet for the sites)
Decisions (nobody has decided yet):
1. Whole minutes or seconds? Measured on October 2026 (source files, Auto machines left out): Hull loses 316 min of 5,127 h OEE time (0.10 %), Nottingham 756 min of 10,801 h (0.12 %); time utilisation 0.05 to 0.07 points lower. Total Time and Planned OpT hardly change. The Power BI EU report cuts to whole minutes too (D05), so against the EU report there is no difference. Whether the site reports keep seconds is not verified. Recommendation: keep whole minutes (reproduces the old EU report).
2. Hull targets: which glidepath file is the master, the Hull V7 file of 30 Oct (what Tableau reads) or the older regional file inside the Power BI EU report? Checked for September 2026 (EU pbix, data to 18 Sep 2026, against the lake files): Hull OEE target differs on 12 of 20 lines, planned loss target on 5, unplanned on 11 (Enflex OEE 54.0 against 47.0, S1 51.5 against 55.0). Nottingham OEE and unplanned equal, planned under 0.1 point (rounding). Not yet read on the Tableau screen.
3. Micro stoppages and "Production not scheduled": in or out? Ask Hull and Nottingham (D02).
4. "Null" shift and brand: hide or show on purpose? (Segun, D24)
Tasks:
- Segun: apply In EU Report = true to the volume tile on EU-Level Overview (D29); set the default To date to the latest day.
- Trace the 1 to 2 % Hull loss gap (October) on one machine (D21).
- Confirm with Charles (Hull) the machine lists in "Good to know" (EU rules instead of site rules).
- Read the targets on the Tableau EU page next to the Power BI EU report for the same dates (view page only).
- Check the Line filter on Site-Level Overview: are the machines marked out of the EU report hidden? Not verified; the volume tile shows they are not hidden everywhere.

## Data freshness check (2026-11-03, view page and Data Sources console)
- All eight `Live_*` report sources updated on 3 Nov 2026 at 2:03 to 2:04 PM console time (about 07:03 UTC if the console shows UTC+7, not confirmed), 3 minutes after the 07:00 UTC fetch. They are subscriptions in overwrite mode, so no manual refresh is needed. `Live_Historical_OEE_EU` last updated 30 Oct 2026 (one-time archive).
- In the Tableau EU page, 2 Nov 2026 shows data (Nottingham 1.5M, Hull 0.8M volume, OEE 51.2 %); 3 Nov 2026 is empty. The dashboard runs one day behind: day D arrives after the fetch on D+1.
- Unverified: row count of the 2 Nov load (Time_Utilisation_EU grew by 224 rows on the 2:04 PM run), and why there were extra syncs on 2 Nov at 2:47 PM and 7:43 PM.
- Test consequence: tell testers that yesterday is not yet in, and to compare whole days that are at least 4 days old (D07).

Numbers on screen were typed by hand from screenshots on 2026-11-03; re-read them if the dashboards refresh. No customer files were committed.

## First real comparison, Tableau against Power BI EU report (2026-11-03)
Tableau EU-Level Overview, From 1 Oct 2026, To 30 Oct 2026, Site = All (Hull and Nottingham only), after the repoint. Power BI EU Daily OEE Report, same dates, read earlier the same day.

| Measure | Tableau | Power BI EU | Difference |
|---|---|---|---|
| OEE % (Europe) | 53.74 % | 53.69 % | +0.05 pt |
| Unplanned loss % | 22.93 % | 23.21 % | -0.28 pt |
| Planned loss % | 21.56 % | 21.51 % | +0.05 pt |
| OEE Nottingham / Hull | 58.0 % / 48.4 % | 57.9 % / 48.4 % | +0.1 / 0.0 pt |
| Volume Nottingham (CUs) | 36.5M | 35.01M | +4.2 % |
| Volume Hull (CUs) | 24.3M | 23.16M | +4.9 % |

OEE and the two loss percentages agree within 0.3 points (inside the 0.5 point tolerance). Volume is 4 to 5 % higher in Tableau: our tables give the same 24.30M and 36.47M when all Plan_OPT rows are summed, and 23.16M and 35.01M for In EU Report = true, which is what Power BI shows. So the volume tile on the Tableau EU page ignores the EU flag (D29). Only the EU-Level Overview was compared; the other pages are not yet.

## Readings of the old Tableau draft before the repoint (1 Sep 2025 to 30 Jun 2026, Site = All, typed from screen; superseded by the comparison above)
- EU-Level Overview: OEE Europe 54.22 % (target mark 38.79), unplanned loss 22.31 % (17.54), planned loss 21.51 % (15.84). OEE Hull 43.8 %. Volume Hull 158.8M, Mira 72.5M, Weinheim 33.2M. Time utilisation planned / available / run: Hull 73/66/30, Mira 56/56/38, Nottingham 68/61/37, Weinheim 47/46/33. First top loss: Nottingham N3 Product Changeover, 41,416 min, 1,006 events.
- Site-Level Overview: OEE 54.22 %, unplanned 22.32 %, planned 21.52 %; hours in period 251.7K, hours run 85.3K, daily plan average 7.4.
- Planned Losses: 108.98K events, 191 unique, OEE loss 21.54 % (cleans 3.32, changeover 9.61, in-process QC 3.36). Unplanned Losses: 149.66K events, 1,847 unique, 22.32 % (adjustment 6.73, breakdown 4.70, minor stop 6.37).
- OEE Trending by year: 2025 = 14.49 %, 2026 = 53.28 %. Historical OEE: 35.87 %. By Shift: row "Null", AVG volume 22,560, OEE 39.07 %.

## Hull October 2026: Power BI EU report against our lake tables (not Tableau)
Date 1 to 30 Oct, In EU Report = true. Volume 23.16M against 23,163,126; hours run 3.9K against 3,898; planned loss 4,309 events / 119.93K min against 4,280 / 118,953; unplanned loss 6,438 / 108.25K against 6,336 / 105,841 (Unplanned + Not Logged). OEE 48.36 % against 49.28 % (formula of the report not confirmed). Hours in period not comparable.

## Appendix: known differences
| No | What you may notice | Why | Where | What to do | Tell the site? |
|---|---|---|---|---|---|
| D01 | EU report shows less than the site report for the same site | The EU report leaves out machines the site reports keep. Hull: 19 process machines (for example 4 Tonne, 6 Tonne, 6000L, GG4 to GG7, Lemsip Process, Senokot Press). Nottingham: only packing areas count in Plan OPT, 23 lines in utilisation; losses leave out Bosch, Fette, Gran0 and S14. In our tables this is the flag "In EU Report". How Segun's Tableau draft applies it is not confirmed. | EU vs site | Compare the EU page with the EU report, the site page with the site report | Yes |
| D02 | A machine or a type of loss is missing | Left out by design in our build: GT4 - Auto (Hull) and N11 Auto (Nottingham; 55,332 good parts on 1 Nov, close to N11, probably the same line counted twice) in plan data; B1 - Auto, B4 Auto, B5 Auto in losses. Loss groups other than Planned, Unplanned and Not Logged are dropped: micro stoppages (Hull B2 Auto 160 rows on 1 Nov 2026) and "Production not scheduled" (Hull 4, Nottingham 35 on 1 Nov 2026). | Both | Ask the site if Auto machines and micro stoppages should be in. Not decided | Yes, as a question |
| D03 | A few stops fewer than in raw Provideam | Duplicates are removed (same machine and start time, first row kept). Rows without machine or group are removed. Nottingham had 17,737 such repeated rows over all months. | Both | Compare with the Power BI report, not with raw Provideam | No |
| D04 | Target or weighted target differs while loss and hours are the same | The target is looked up from a glidepath file per machine, sub group and month. EU and site reports use different files and keys (Hull site file against the regional file: 524 cells differ in 2026). Hull targets 2 to 6 % apart. Nottingham UPDT and PDT targets in the old site report are 100 times smaller (fractions). Nottingham OEE target equal. The Tableau draft reads its own target tables (Site_PDT_Targets, Site_UPDT_Targets). | Hull, Nottingham | Expect different targets, not different losses | Yes |
| D05 | OEE time or hours a little lower | The old EU report reads times as hours and minutes and drops the seconds (about -0.1 %). Our tables keep whole minutes: up to 1 minute lower per machine and day (checked 1 Nov 2026: parts, rows and total time equal). | Both | Allow 1 minute per machine and day | No |
| D06 | Lines without a department; total higher than the sum of departments | Machines that are not in the Machine Names list (Nottingham keeps only two packing areas: 2,651 stops of 28 machines in September; about 1.2 % of October loss rows; "Kilian" machines in November). They count in a plain total but disappear from views by department, area or machine. | Nottingham mostly | Totals can be higher than the sum of departments | Yes |
| D07 | The last day or two look different | Today and yesterday are partial. Provideam corrects losses for up to 3 days; our daily fetch reads the last 3 production days again. The Power BI reports refresh on their own dates (Hull report: data updated 2 Nov 2026; EU report: 3 Nov 2026). | Both | Test whole days at least 4 days old, against a report refreshed after that day | Yes |
| D08 | The same loss under two names, or a sub group in another order | Spellings such as Minor Stop and Minor Stops, Adjustment and Adjustments. Hull site keeps raw names, the EU report renames them (13 renames). The rename is case sensitive: "Lack of Resources" on 4 T1 stops in 2025 was not renamed. | Hull mostly | Compare at group level first, then sub group | No |
| D09 | Nottingham volume lower than all machines together | The old Nottingham pages leave out S14 (VSU pages show only S14), and the Volume Trending page leaves out 38 manufacturing machines. Not in the Tableau draft as pages; the filter behind the numbers is not confirmed. | Nottingham | Use the same scope on both sides | Yes |
| D10 | A machine cannot be selected | In Power BI the line filters hide GT4 - Auto and Dettol 1, and department / product type filters hide empty values. How the Tableau filters behave is not confirmed. | Both | See D06 | No |
| D11 | Shift numbers or shift names differ | Nottingham uses its own shift naming (has "Day"). Hull splits by shift colour. The EU report uses Provideam shift names. The Tableau shift table shows names such as 1, 2, 3, Afternoon, Blue, Day. A shift crossing midnight belongs to the production day it started in. | Both | Compare per day first, then per shift | No |
| D12 | One day looks shifted, or a night shift on another day | The production day runs 06:00 to 06:00, not midnight to midnight. Run rate hours are 06:00 to 05:00 of the production day. | Both | Compare whole days; check one day boundary | No |
| D13 | A volume total is far too high | "Volume Total" is repeated on every stop of a machine and day, so a plain sum means nothing. Use Good Parts. | Both | Do not test Volume Total | No |
| D14 | Repair time (MTTR) higher than in the old report | The old Power BI weekly MTTR chart averages the minutes part only and drops the hours. A bug in the old report; a new dashboard should not copy it. | Both | MTBF should match; MTTR on long breakdowns will be higher | Yes |
| D15 | Brand and size are empty | Nottingham has no format list: brand, size, count and extra info are empty in every row (as in October). Hull fills them but some Hull rows are blank (16 % of October loss rows). In Tableau these show as "Null". | Nottingham, Hull | Nottingham By Format stays "Null" until the site sends a format list | Yes |
| D16 | Fewer run rate rows than hours | Run rate rows with Good Parts 0 are left out (Hull 1 Nov 2026: 170 of 232 kept). Idle hours do not show. | Both | Expect idle hours not to appear | No |
| D17 | Historical OEE does not match the page dates | Historical OEE is a one-time archive Jan 2022 to Nov 2024 with no overlap with live data. The Tableau page shows 35.87 % with the dates set to Sep 2025 to Jun 2026: which period it reads is not confirmed. | Both | Set the dates to the archive period before comparing | No |
| D18 | Volume target is one fixed number | Hard-coded in the old Nottingham file; no source yet. No Volume Trending page in the Tableau draft. | Nottingham | Not tested | Yes |
| D19 | Planned loss includes more in some visuals | A few Power BI visuals add "NPD / CapEX & Trials" to planned loss. Unplanned = Unplanned Loss plus Not Logged. | Both | Note which visual | No |
| D20 | No target or empty value on a few lines | No OEE target for Symex suite (Hull). 29 B6 "In process Quality Control" stops have an empty Value in both old reports. 3 SP7 stops of 15 Sep 2026 were re-classed after the EU refresh. | Hull | Known; not a new finding | No |
| D21 | October 2026 differs from the old report | October was rebuilt from the Provideam API on 2 Nov 2026. 1 to 28 Oct equal to the SharePoint version on every column; 29 to 31 Oct now final. First check Hull 1 to 30 Oct (Power BI against our lake tables): volume and run hours equal, loss minutes 1 to 2 % lower (sheet Reference numbers). Cause not traced. | Both | Allow 3 % on loss minutes until traced | Yes |
| D22 | Tableau EU page shows 4 sites; Power BI shows 2 | Seen before the repoint (Site = All included Weinheim and Mira). After the repoint the EU page lists Nottingham and Hull only. | EU | Closed | No |
| D23 | Tableau showed old data although new data existed | The workbook read the `Site_draft_*` sources (30 Oct 2026). It was repointed to `Live_*` on 3 Nov 2026; data now runs into November 2026. The date filter still opens on 30 Jun 2026. | All | Testers move the To date | Yes |
| D24 | A "Null" row or bar | Seen on 2026-11-03: By Shift Breakdown has a row "Null" (OEE 39.07 %, plus 1, 2, 3 as shift names); By Format Breakdown has a "Null" brand bar with the highest OEE (about 0.6). A product without a format, or a shift without a name, becomes "Null" and still counts in the totals. | Both | Ask Segun to show or hide Null on purpose; list as finding | Yes |
| D25 | The 24 hour table is empty or old | L2/L3 FIT View shows "Last 24 hrs" relative to today. With data only to June 2026 it shows old rows or none. Power BI does the same relative to its own last refresh. | Both | Only meaningful once live data is in Tableau | No |
| D26 | Total Loss (Mins) shows ######## | On the Planned Losses and Unplanned Losses pages the "Total Loss (Mins)" card shows ####### in the browser: the number does not fit the card. | Both | Display problem; tell Segun. Read the value by widening the card or the table below | Yes |
| D27 | OEE by year: 2025 far lower than 2026 | Tableau OEE Trending, by year: 2025 = 14.49 %, 2026 = 53.28 % (window 1 Sep 2025 to 30 Jun 2026). The monthly OEE and loss bars on other pages look steady, so the 2025 bar looks wrong. Not traced. | All | Treat as a finding unless Power BI shows the same | Yes |
| D28 | Same measure, tiny differences between two Tableau pages | Unplanned loss is 22.31 % on EU-Level Overview and 22.32 % on Site-Level Overview; planned 21.51 % and 21.52 %; Planned Losses page 21.54 %. Rounding or different row sets. | EU vs site | Within tolerance; mention if larger | No |
| D29 | Volume on EU-Level Overview higher than in the Power BI EU report | Tableau counts all Plan_OPT rows; Power BI EU counts only machines in the EU report. Hull 1 to 30 Oct 2026: 24.3M against 23.16M (our tables: 24.30M all rows, 23.16M In EU Report only). Nottingham: 36.5M against 35.01M (36.47M and 35.01M). | EU | Apply In EU Report = true on the EU page volume | Yes |
