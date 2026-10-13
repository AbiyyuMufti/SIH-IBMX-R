# Power BI data map (draw.io diagram)

| At a glance | |
|---|---|
| **What** | One draw.io file that shows, for every Power BI table of the EU report: which columns it has, an example, the column we create for it, and what is different (empty now, assumption, partly filled) |
| **File** | `diagrams/powerbi-data-map.drawio` (plain XML, tracked in git). Open it with draw.io (desktop, web or the VS Code extension) |
| **Pages** | 1 Overview (tables, where used, joins, tables not created), then one page per table (Machine Names, Plan OPT, Time Utilisation, Daily Losses, Shift Naming, Calendar), then "Not created yet" with the columns of each missing table |
| **Colours** | Green = OK. Yellow = partly filled. Orange = assumption or difference to check. Red = empty now or no column. Grey = not needed |
| **Made from** | The Power BI template and report file (outside the repo), the mapping workbook, the sample files of the Power BI local copy, and a profile of our parquet files (`diagrams/data/ours-profile.json`) |
| **Status** | Built 2026-10-13 on the Hull data of 2026-09-01 to 2026-10-12 (38 days). Not reviewed by Reckitt |

## How to refresh it
1. Download the lake files to `parquet/` (`parquet/extractdata.ipynb`). The `.parquet` files are git-ignored.
2. `python scripts/helper-profile-parquet.py parquet diagrams/data/ours-profile.json` reads them (types, filled share, examples; asset ids are shortened).
3. `node scripts/build-drawio.js` writes the diagram. The paths of the Power BI files are constants at the top of the script.
4. `node scripts/validate-drawio.js` checks ids, arrows, overlaps and whether the text fits the boxes.

## Where the text of the "difference" box comes from
- The notes written by hand are in the `NOTE` table of `scripts/build-drawio.js` (key: `Power BI table|column`). They hold what we decided and what we know now, for example the capacity assumption. Change a note there, not in the diagram.
- A column without a hand-written note takes its text from the mapping workbook (sheet "PBI column mapping").
- The colour also follows the data: a column with no values is red, a column below 99.5 % filled gets the "partly filled" label.

## What the first run showed (Hull, 2026-10-13)
- Empty now: `product_type`, the three targets in plan OPT, `value`, `target` and `volume_total` in daily losses.
- Partly filled: product columns (about 73 to 83 %, empty on days with no product), `loss_units`, `oee_time`, `batch_id` (71 %), `equipment` (16 %), `loss_lvl3_sub_group` (35 %), `breakdown_types` (0.2 %).
- Days with no product found: B2 Line 1 to 3 and 8 to 14 Sep; GT4 29 Sep, 3 Oct and 6 to 8 Oct.
- Power BI tables not created yet: 10 (listed on the last page).
