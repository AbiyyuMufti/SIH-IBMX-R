# Provideam report mapping to normalized SharePoint sources

For the SharePoint-only folder-to-table map and the numbered JSON candidates,
see [provideam-sharepoint-mapping.md](provideam-sharepoint-mapping.md).

| At a glance | |
|---|---|
| **Goal** | Determine whether Provideam API reports can replace the emailed CSV inputs to the existing report build |
| **Scope** | Layer 1 (Provideam report) or layer 2 (normalized source CSV) only; no redesign of the report tables |
| **Status** | Retimed tests returned HTTP 200 for 30/38 definitions. Reports 15-22 remained HTTP 500 after actual-date retries; successful rows have not been compared with normalized source data |
| **Sites** | Hull is the comparison target. The key can also see Nottingham, but no site-specific report comparison was possible |

## Candidate API call to normalized source

The source column lists below were read from the local normalized Hull CSV
headers. Report 23 has one successful API response summary below; other
response row values were not saved. The 38 saved payloads returned HTTP 500
when sent unchanged; that does not establish that valid, fully populated
requests fail.

| Provideam report | Likely DataSetType from UI label | Route in captured UI definitions | Status | Normalized source type | Observed source columns | API output / normalizer change |
|---|---|---|---|---|---|---|
| Plan OPT (Production Trend, day) | `dsObjectByPeriod` (Production Trend) | `POST /api/v1/Report/ObjectByPeriod` | Report 23: HTTP 200, 30 rows | `plan_opt` | `SiteName`, `YYYY-MM-DD`, `AreaName`, `MachineName`, `ShiftName`, `ShiftStartTime`, `PartName`, `Good Parts`, `Defect Parts`, `Target`, `Capacity`, `OEE`, `Total Time`, `Planned OpT`, `OEE Time`, `Downtime Units` | API keys observed: `fdYYYYMMDD`, `fdAreaName`, `fdMachineName`, `fdShiftName`, `fdShiftStartTime`, `fdPartName`, `fnGoodParts_0`, `fnDefectParts_0`, `fnTarget_0`, `fnCapacity_0`, `fnOEE_0`, `fnTotalTime_0`, `fnPlannedOpT_0`, `fnOEETime_0`, `fnDowntimeUnits_0`; compare rows and measures before changing the normalizer |
| Packing Hourly Run Rates | `dsObjectYieldLog` (Yield Log Report; likely) | `POST /api/v1/Report/ObjectByPeriod` | Related templates returned HTTP 200; see per-report index | `run_rates` | `SiteName`, `AreaName`, `MachineName`, `YYYY-MM-DD HH`, `PartName`, `ShiftName`, `Good Parts`, `Capacity` | Compare hour grain and measures before changing the normalizer |
| OEE Loss (Group by Object) | `dsPeriodByObjectAndLoss` (OEE Loss By Object) | `POST /api/v1/Report/ObjectByPeriod` | Exact saved definition not identified; reports 15-22 returned HTTP 500 | `volume_loss_correction` | `SiteName`, `ShiftStartDate`, `MachineName`, `OEELossLvl3Group`, `OEELossLvl3SubGroup`, `OEELossLvl3Desc`, `Time`, `Loss Units` | Compare loss labels, time units and loss-unit values before changing the normalizer |
| Mode Log | `dsObjectModeLog` (Mode Log Report) | `POST /api/v1/Report/ObjectByPeriod` | Exact saved definition not identified | `line_losses` | `SiteName`, `StartTime`, `MachineName`, `PartName`, `ShiftName`, `OEELossLvl3Group`, `OEELossLvl3SubGroup`, `OEELossLvl3Desc`, `Duration`, `ShiftStartDate`, `Comment` | Compare event grain, time zone, duration and comment text before changing the normalizer |
| Performance Availability | No dedicated DataSetType identified | `POST /api/v1/Report/ObjectByPeriod` | Reports 07 and 31 returned HTTP 200, 43 and 21 rows respectively | No normalized source type found | No local normalized Performance Availability file | Establish whether these are period reports or current snapshots |

The six DataSetType names came from the UI's DataSet Templates list, and
metadata GETs for each returned HTTP 200. The labels suggest the family
associations above, but they do not prove which of the 38 saved report
definitions uses each template or how that definition is scheduled. Thirty
retimed requests returned HTTP 200; six had no rows. No row values were saved,
so source comparisons and schedule mapping remain open.

## Hull comparison checklist

A source day and two candidate machines were selected locally from the overlap
of the four normalized report types. The selection, including real IDs and
names, is in ignored `samples/provideam/probe-targets.json`. A 30-row response
for report 23 is available; row-level and aggregate comparison remains to be
done.

| Check | What the local source says | API comparison |
|---|---|---|
| Row count, columns and numeric sums | Headers are listed above; one day can be selected across all four source types | Report 23 returned 30 rows and the listed API keys; source row/sum comparison not yet done |
| Production-day boundary | Source documentation describes a day as 06:00 to 06:00 | Unknown: report-period behavior was not verified |
| File-date offset | Source documentation says the file date is one day after the production day | Unknown: API date semantics were not verified |
| OEE percentage | Source documentation states OEE = Good Parts / Capacity | Unknown whether the API returns the same numerator, denominator and formatted value |
| Similar machine entries | Local source notes identify two similarly named entries, including an automatic variant | Unknown whether the API includes both and whether one is excluded |
| Mode Log comment | The source has a `Comment` column | Unknown whether the API returns comment text |
| Text versus raw values | The SharePoint source keeps values such as comma-grouped numbers, percentages and `HH:MM:SS` as text | Unknown whether the API returns raw numbers, formatted strings or both |

No values or conclusions have been inferred from operation names. The report
23 response is available for comparison; compare rows and measures before
deciding which columns or normalizer rules should change.

## Nottingham

The API hierarchy confirmed that Nottingham is visible to the key. The report
POST probes used empty bodies and were not specific to a Nottingham machine or
day; they returned HTTP 500. The retimed Nottingham reports 24-28 returned
HTTP 200 (including report 24 with 18,500 rows), but no row values were saved
or compared with the normalized source.

## What is needed to continue

Compare report 23's returned rows with the local Hull source files, then
identify which report definitions feed each Power Automate / SharePoint
destination. Repeat for Nottingham only if the Hull comparison is usable.
