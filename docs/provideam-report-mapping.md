# Provideam report mapping to normalized SharePoint sources

| At a glance | |
|---|---|
| **Goal** | Determine whether Provideam API reports can replace the emailed CSV inputs to the existing report build |
| **Scope** | Layer 1 (Provideam report) or layer 2 (normalized source CSV) only; no redesign of the report tables |
| **Status** | All eight report POST routes returned HTTP 500 to an empty `{}` probe. No report rows were returned, so API column mappings and numeric comparisons remain blocked |
| **Sites** | Hull is the comparison target. The key can also see Nottingham, but no site-specific report comparison was possible |

## Candidate API call to normalized source

The source column lists below were read from the local normalized Hull CSV
headers. “API output” is intentionally not filled in: no report response
schema or column set was obtained. The empty-body POST probes did not specify
a site, machine or production day.

| Provideam report | Candidate API call | Status | Normalized source type | Observed source columns | API output / normalizer change |
|---|---|---|---|---|---|
| Plan OPT (Production Trend, day) | `objectbyperiod` or `periodbyobject` | Guess | `plan_opt` | `SiteName`, `YYYY-MM-DD`, `AreaName`, `MachineName`, `ShiftName`, `ShiftStartTime`, `PartName`, `Good Parts`, `Defect Parts`, `Target`, `Capacity`, `OEE`, `Total Time`, `Planned OpT`, `OEE Time`, `Downtime Units` | Unknown. Compare segment grain, dates, numeric values and text formatting before changing the normalizer |
| Packing Hourly Run Rates | `objectyieldlog` | Guess | `run_rates` | `SiteName`, `AreaName`, `MachineName`, `YYYY-MM-DD HH`, `PartName`, `ShiftName`, `Good Parts`, `Capacity` | Unknown. Compare hour grain and measures before changing the normalizer |
| OEE Loss (Group by Object) | `objectbyperiodandloss` or `periodbyobjectandloss` | Guess | `volume_loss_correction` | `SiteName`, `ShiftStartDate`, `MachineName`, `OEELossLvl3Group`, `OEELossLvl3SubGroup`, `OEELossLvl3Desc`, `Time`, `Loss Units` | Unknown. Compare loss labels, time units and loss-unit values before changing the normalizer |
| Mode Log | `objectmodelog` | Guess | `line_losses` | `SiteName`, `StartTime`, `MachineName`, `PartName`, `ShiftName`, `OEELossLvl3Group`, `OEELossLvl3SubGroup`, `OEELossLvl3Desc`, `Duration`, `ShiftStartDate`, `Comment` | Unknown. Compare event grain, time zone, duration and comment text before changing the normalizer |
| Performance Availability | `currentstatus` | Guess based on its operation name only | No normalized source type found | No local normalized Performance Availability file | Unknown. First establish whether this is a period report or a current snapshot |

These are endpoint candidates, not approved mappings. The operation names alone
do not prove which report definition they implement. All listed report routes
were probed with `{}` and returned HTTP 500. These empty-body results do not
prove that a correctly populated request would fail.

## Hull comparison checklist

A source day and two candidate machines were selected locally from the overlap
of the four normalized report types. The selection, including real IDs and
names, is in ignored `samples/provideam/probe-targets.json`. No report response
was available to compare against it.

| Check | What the local source says | API comparison |
|---|---|---|
| Row count, columns and numeric sums | Headers are listed above; one day can be selected across all four source types | Not done: no report call returned data |
| Production-day boundary | Source documentation describes a day as 06:00 to 06:00 | Unknown: report-period behavior was not verified |
| File-date offset | Source documentation says the file date is one day after the production day | Unknown: API date semantics were not verified |
| OEE percentage | Source documentation states OEE = Good Parts / Capacity | Unknown whether the API returns the same numerator, denominator and formatted value |
| Similar machine entries | Local source notes identify two similarly named entries, including an automatic variant | Unknown whether the API includes both and whether one is excluded |
| Mode Log comment | The source has a `Comment` column | Unknown whether the API returns comment text |
| Text versus raw values | The SharePoint source keeps values such as comma-grouped numbers, percentages and `HH:MM:SS` as text | Unknown whether the API returns raw numbers, formatted strings or both |

No values, row counts or conclusions have been inferred from the operation
names. A successful one-machine, one-day response is required before deciding
which columns or normalizer rules should change.

## Nottingham

The API hierarchy confirmed that Nottingham is visible to the key. The report
POST probes used empty bodies and were not specific to a Nottingham machine or
day; they all returned HTTP 500. No report rows or differences from Hull are
established.

## What is needed to continue

Ask the Provideam API owner for the accepted `dataSetType` values, a minimal
working `ReportRequestModel` for each report, and the reason the empty
`objectbyperiod` request returns HTTP 500. Then test one Hull machine and one
production day, compare row count, columns and numeric sums with these local
source files, and repeat the same calls for Nottingham only if the Hull
responses are usable.
