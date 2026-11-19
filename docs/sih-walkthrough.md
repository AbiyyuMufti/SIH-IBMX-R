# SIH walkthrough page

| At a glance | |
|---|---|
| **What** | One scrolling local page for one production day: the call chain, every OEE asset set up in SIH with its data of the day (good parts, OEE, stops), each call with a small table of what it returned (B2 Line, GT4), SIH result against live `EU_OEE_Fact`, the 65 columns as coloured chips, and the findings in three columns. No tabs, no collapsed parts (user, 2026-11-19: less text, more picture) |
| **Why** | Learn the calls and the data before the SIH flow is finished, and list what SIH can and cannot give for `EU_OEE_Fact` (no flow change) |
| **Run** | `node scripts/sih-walkthrough.js day=YYYY-MM-DD [focus=B2 Line,GT4]` (needs `.env`, `IH_PLATFORM`, Python with polars). Rebuild the page only: `node scripts/sih-walkthrough-page.js samples/sih-walkthrough/<day>` |
| **Out** | `samples/sih-walkthrough/<day>/index.html` (git-ignored, real data, open in a browser). Next to it: `data.json` (every call), `fact/` (live day files), `fact.json`, and `findings.json` (findings written by hand, optional) |
| **Calls** | Read only. GETs, the token POST, `evaluateKPIs` (approved read-style POST) and the lake download URLs. A guard in the script refuses any other method or path |
| **Status** | Built 2026-11-19, first run on 2026-11-17 (209 calls, 84 OEE assets) |

## How it works
1. The script copies the Hull reference files (glidepaths, machine names, shift patterns) from the lake into memory and runs the real `Hull SIH report daily` tab (`flows/legacy_report_generator_v0/vfc-pbi-daily-hull.json`) with `scripts/lib-vfc-runner.js` on the real API. Its lake writes stay in memory. Every call is recorded with its response (token and `ActorEmail` masked).
2. For every OEE asset: Asset Management hierarchy and the day totals of `evaluateKPIs` (same window for all sites: the Hull production day).
3. Extra calls for the focus machines that the tab does not make: `config`, `productSource`, `orderSource`, `designSpeedSource`, `stateTableSource`, `manualInputs`, `OEE_Hourly_Entry`, `comment`, the reason tree, `timeModel`.
4. The live `EU_OEE_Fact_<day>_*.parquet` files of Hull and `Dim/Machine_Names_EU.csv` are downloaded; `scripts/helper-sih-walkthrough-fact.py` turns the parquet into JSON.
5. `scripts/sih-walkthrough-page.js` maps the tab rows to the fact columns (rules of `e2-fact-rows.js`: loss renames, `In EU Report` from the line list) and fills `scripts/sih-walkthrough-template.html`. Asset ids are replaced by the asset name.

## Comparison rules
- Plan: the n-th shift of the machine (time order). Time Utilisation: the machine. Loss: machine + start minute; a machine whose SIH loss rows all carry a shift start (GT4) pairs on the loss name.
- Numbers within 1 % and clock times within 60 s count as "close".
- The column kinds (API field, derived, reference file, set by flow, not in SIH) and the manual input / variable notes are written by hand in `COL` of the page script.

## Gotchas
- `isManual` in the OEE asset list is `true` for B2 Line too; the page does not use it to tell manual from automatic assets.
- The day window is Hull winter time (06:00 UTC). A summer day needs 05:00 UTC (marked `shortcut:` in the script).
- The page shows client data: keep it local. A shareable copy would need the data redacted.
