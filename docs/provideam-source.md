# Provideam: the real source of the Hull Power BI board

| At a glance | |
|---|---|
| **What** | How the Hull Power BI board gets its data, from the Hull maintenance guide (January 2026) and its screenshots, compared with the load queries of the model |
| **Main finding** | The production and loss data comes from **Provideam** (the Hull production system), not from Insights Hub. Provideam sends daily reports by email. A Power Automate flow puts them as files in SharePoint. Small Excel files, kept by hand, give the rest |
| **Status** | Read 2026-10-13. Hull only. The guide says Nottingham and Weinheim have mirrored reports. Not checked for Mira |

## Data path
1. Provideam runs scheduled "Day" reports (period = previous day, day = 06:00 to 06:00). First run 06:10, then every hour until 17:00, because entries are often edited.
2. Each report is sent as a CSV email. Outlook rules sort the emails into folders by email title.
3. A Power Automate flow per report type writes the file to SharePoint (Hull site, folder "OEE Board A Sz"). One file per day, the day is in the file name. The date on the file is **one day later** than the data (a file dated 20/02 holds 19/02).
4. Power BI reads the folder and builds one table per report.
5. A change after the 24 hour window is not picked up. Someone must run a "CUSTOM" report for the period, delete the old files in SharePoint and upload the new ones.

## Reports and the tables they feed
| Provideam report | Columns seen | Power BI tables (from the model) |
|---|---|---|
| Plan OPT (type "Production Trend", day) | date, AreaName, MachineName, ShiftName, ShiftStartTime, PartName, Good Parts, Defect Parts, Target, Capacity, OEE, Total Time, Planned OpT, OEE Time, Downtime Units | Plan OPT. The same folder also feeds Time Utilisation, Volume CoV and Targets Volume |
| Packing Hourly Run Rates | AreaName, MachineName, date and hour, PartName, ShiftName, Good Parts, Capacity | Run Rates (folder "Packing Run Rates") |
| OEE Loss (Group by Object) | ShiftStartDate, MachineName, loss Group, SubGroup, Desc, Time, Loss Units | Volume Loss Correction (the model columns match these) |
| Mode Log | StartTime, MachineName, PartDesc, ShiftName, loss Group, SubGroup, Desc, Duration, ShiftStartDate, Comment | Daily Line Losses (folder "Line Losses") |
| Performance Availability (Hull only, less important) | date, MachineName, Availability, Performance | Not seen in the model |

Manual Excel files (kept by the site, no automation): Equipment Coding, Format Mapping, Machine Names, Shift Pattern Naming and the Glidepath targets. "Provideam Static Targets" is old and not used. A new line needs: the line added in every Provideam report, a row in Machine Names (required), and rows in Equipment Coding and Glidepath (optional, the board works without them). A line is removed with a filter in the Machine Names visual.

## What the screenshots show (checked)
- OEE % in the Plan OPT report = Good Parts / Capacity. OEE Time = Planned OpT x OEE %. Checked on 3 rows (for example 27,360 / 115,200 = 23.8 %; 8 h x 23.75 % = 1 h 54 min). So Provideam calculates Capacity, Planned OpT, OEE Time and Downtime Units. Power BI only adds them up.
- Loss names in Provideam are three levels: Group (Planned Loss, Unplanned Loss, ...), SubGroup (for example Operator Asset Care, Minor Stop, Quality Issues, Adjustment, Refilling Materials) and Desc (for example Cleaning Area). They differ from our Insights Hub sub group names, so the Glidepaths loss targets need a mapping.
- The Mode Log has the comment text. We only have the comment count.
- The machine list of the Hull reports has two GT4 entries: "GT4" and "GT4 - Auto". The report query removes "GT4 - Auto". This may explain part of the GT4 difference (not checked).
- The guide says the Hull board and the EU board use a copy of the same queries, not a live link. A format change in the files breaks both.

## Differences with what we assumed before
| Before | Now |
|---|---|
| The Plan OPT files are made by "someone or some system" | A system: Provideam daily reports. Only five small config files are made by hand |
| Gap between Insights Hub and the file = Insights Hub is not fully set up | Two different production systems measure the same machines. The gap can also come from different rules, manual entries in Provideam, or the "GT4 - Auto" machine |
| Capacity, Planned OpT, OEE Time are Power BI assumptions | They are calculated by Provideam. We must copy its rules |
| Volume Loss Correction is a correction file with an unknown rule | It is a Provideam report: loss units per day, machine and loss category |
| Targets Volume is a separate file | The Hull query reads the Plan OPT folder |
| Comment text: unknown | Available in the Mode Log |
| Plan OPT files are monthly | The guide describes daily files. Our download had monthly files and a current-month file. Not explained yet |
