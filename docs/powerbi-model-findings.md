# Power BI model: what the existing EU report expects (findings)

| At a glance | |
|---|---|
| **What** | How the existing EU Power BI report ("the copy") is built, read from its template (`.pbit`, model without data) and report file (`.pbix`) on 2026-10-12/13. It tells us what shape our SIH-native tables must have so the report can use them |
| **Where the files are** | Outside the repo, on the user's computer (they hold customer names, paths and in the `.pbix` real data). Never commit them |
| **How to read them again** | `node scripts/helper-pbit-outline.js file.pbit` (tables, relationships, which query feeds which), `--table "<name>"` (columns and load query), `--measures [text]` (DAX), `file.pbix --report` (columns and measures per page). Read-only, no network |
| **Result in one line** | The report joins everything through three keys (machine, product, shift) and a date. Our tables work only when those keys exist and match in a table of their own |
| **Status** | Findings only. Nothing in the flows is changed because of this page yet |

## How the copy loads its data
- Every EU table is a union (`Table.Combine`) of regional queries (several regions plus one per site). All come from files in shared folders (tab or comma separated exports, a few Excel files). No API.
- The EU tables used by the report: daily losses (one row per stop), plan OPT (day x machine x shift x part), time utilisation (day x machine), run rates, volume variation.
- Dimensions: machine names, shift naming (distinct list of shift names), product master ("format list"), calendar.
- Targets: loss targets, OEE targets, UPDT targets, PDT targets. Supporting tables: equipment coding, volume loss correction, volume targets.
- This is why a new source fits: add one more query to each union with the same column names. A site moves from the copy to SIH by removing it from the old query.

## Relationships (many side to one side)
| From (fact) | To (dimension) | Notes |
|---|---|---|
| each fact table, `Unique Machine Name` | machine names, `Unique Machine Name` | Five fact tables use it. It is never shown in a visual, a filter or a measure. It is the hidden key that lets the machine, site, department and product type slicers filter the facts. It must be unique per machine. In the copy it is machine name + "-" + site, because machine names repeat across sites |
| plan OPT, daily losses, run rates, `Product Key` | product master, `Product Key` | In the copy the key is unique machine name + " " + product name. Our `product_key` = product code does not match it, so we build our own product table |
| plan OPT, daily losses, run rates, volume variation, `ShiftName` or `Shift` | shift naming, `Shift` | Every shift name in the facts must exist in the shift naming table |
| every fact table, `Date` | calendar, `Date` | Daily losses join the calendar on the shift start date, not on the stop date |

## Measures that fix the meaning of our columns
- Loss % of capacity = sum(`Loss Units`) / sum(`Capacity`). Both are in product units. Our `loss_units` (design speed x stop minutes) and `capacity` (design speed x planned minutes) fit this.
- Weighted OEE = sum(`Good Parts`) / sum(`Capacity`).
- Running % and planned running % = time utilisation totals / 1440 minutes (a constant `All Time` column per row).
- Duration and the time columns are whole minutes (integers) in the copy. Ours are decimals.
- Targets are looked up by machine key + start of month (plan OPT) and by a loss target key (daily losses). Our `loss_target_key` has a different format.

## What the report really uses
- 11 pages: EU and site overview, planned and unplanned losses, loss trending, by shift, by format, OEE trending, a maintenance beta page, a quick start guide.
- Machine slicers use machine name, site, department. Product type is used on 4 pages. Product master columns (brand, product name, unit size, unit count) are used by the "by format" page.
- Capacity and part name are read directly on one page each (the older regional tables).
- Columns that exist in the model but no visual reads are not a priority.

## Decisions (user, 2026-10-13)
1. Build our own product table with the native Insights Hub columns (name, code, description, design speed, interval, unit, speed type). Adding columns that are native to SIH is allowed. `product_key` = product code, with a read-only check that codes are unique across all product collections (if not, the key becomes machine + code).
2. Two data sources side by side: the copy (as reference and for what SIH cannot give yet) and SIH native (when the configuration is done). The same structure on both sides makes the migration seamless: SIH rows are one more query in each union.
3. Product type: no source in SIH. Plan: a per-asset text value in the Config node that flows into `pbi_machine_names`, once the values are known.

## Open points
| Point | Needs |
|---|---|
| Machine key: keep the SIH asset ID, or follow the copy's "machine-site" form so history from the copy and new SIH rows join under one machine? | User decision |
| Product type values for the Hull machines | User (from the machine names table) |
| Shift names of the SIH calendars (several naming schemes) must all exist in the shift naming table | Check `pbi_shift_naming` |
| Product master columns that are not native (brand, unit size, unit count) | Reckitt, or a parse of the description (a guess; confirm first) |
| Targets (glidepaths), equipment coding, volume loss correction, volume targets, `volume_total` | Files from Reckitt |
| Cutover per site: avoid the same machine and day in both sources | Decide with the colleague who owns the report |
| Reason tree columns (`equipment`, `loss_lvl3_sub_group`, `breakdown_types`) | Mapping from the real reason tree |
