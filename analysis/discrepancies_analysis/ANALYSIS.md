# EU Daily OEE Report: Hidden Machine Filter and Query Transformations

This directory contains screenshots from the EU Daily OEE Report `.pbix` Power Query Editor, documenting the hidden filtering and transformations that explain data discrepancies between EU and site reports.

---

## Screenshot 1: `01-hull-machine-filter-formula.png`

**What it shows:** The Power Query formula bar displaying the **`#"Filtered Rows"`** step from the Daily Losses H (Hull) query. This is the **hidden filter** that removes machines from the EU report.

**Key insight:** The formula contains a list of machine names excluded from the EU report:
- 4 Tonne
- 6 Tonne
- G800L
- Analgesics Processing
- Analgesics X Press
- Bosch Capsulator
- Dettol 1
- Evolution
- Fitten
- Gaviscon TPR
- Gaviscon XP700(A)
- GG4, GG5, GG6, GG7
- Lemsip Process
- Senokot Press
- Symex suite
- Vacumix

**Impact:** These 19 machines are removed **only in the EU report**, not in the Hull site report. This is the single largest cause of the row count and volume difference between EU and site dashboards (Hull +14,272 stops, +1.98M minutes).

**Where to find it:** EU Daily OEE Report → Transform data → Queries → Hull Files → Daily Line Losses H → View tab → Advanced Editor → search for "Filtered Rows"

---

## Screenshot 2: `02-daily-losses-h-full-query.png`

**What it shows:** The complete Advanced Editor view of the **Daily Line Losses H** query, showing all transformation steps from source to final output.

**Key stages visible:**
1. **Data combination:** Multiple columns are combined and transformed
2. **Type conversions and custom columns:** Duration converted to minutes, custom fields added
3. **Lookups and expansions:** Equipment coding, glidepath targets, expanded columns for equipment loss keys
4. **Text replacements:** Multiple `#"Replaced Value"` steps that rename loss sub-group names (e.g., "Lack of Resources" → "Lack Of Resources", using Text.Proper case conversion)
5. **Duplication and reordering:** Column duplication for transformed values, then reordering for final output
6. **Final filter step:** The `#"Filtered Rows"` at the bottom (see Screenshot 1)

**Impact on discrepancies:**
- The **text replacements** (step 4) affect the glidepath lookup key: EU renames sub-groups before the key, site reports keep raw names
- This is why the same stop can find different target rows and get different `Value` numbers

**Where it matters:** This is also present in Daily Losses N (Nottingham) and in the Plan OPT EU query. Nottingham keeps the area filter instead of the machine filter, but the glidepath lookup differences still apply.

---

## Screenshot 3: `03-daily-losses-provideam-union.png`

**What it shows:** The **Daily Losses Provideam** query, which unions (combines) multiple site daily loss queries into one EU dataset.

**Key observation - the union step:**
```
Source = Table.Combine({"#Daily Line Losses N", "#Daily Line Losses H", "#Daily Line Losses W"})
```

This combines:
- **Daily Line Losses N** (Nottingham)
- **Daily Line Losses H** (Hull)
- **Daily Line Losses W** (likely Weinheim or another site)

**Why this matters:**
- Each site query (N, H, W) applies its own transformations and lookups before the union
- The union step then applies additional global transformations (rename, reorder, custom calculations)
- The final step: `#"Renamed Columns1"` ensures all three sites output the same schema

**Discrepancy impact:**
- The union happens **after** each site applies its own glidepath and sub-group renaming
- Then the union step in the Provideam query does its own transformations (visible in the Advanced Editor)
- This is why `Daily Losses Provideam` may read differently from the source `Daily Line Losses H` even before the final `Filtered Rows` step in the reporting queries

---

## Summary: Where the Differences Come From

| Stage | Hull | Nottingham | Impact |
|-------|------|-----------|--------|
| **Machine filter** | 19 machines removed | 9 machines removed | Row count and volume (only cause of row difference) |
| **Glidepath lookup key** | Machine-site + sub-group + month | Machine + sub-group + month | `Value` targets differ; Hull ~7% gap |
| **Sub-group renaming** | Text.Proper + 12 explicit renames | Raw names kept | Different target rows matched; affects `Value` |
| **Target file** | Regional (EU) | Site-specific (V7 for Hull) | `Value` numbers; Hull 1,136,945 (EU) vs 1,210,571 (site) |
| **Time precision** | Hours:minutes (seconds dropped) | Full timestamp | Plan OPT OEE Time ~−0.1% |
| **Refresh date** | 16 Sep 2026 | Later (~23 Sep) | Affects only 7–15 Sep data |

---

## Screenshot 12: `12-eu-vs-hull-daily-losses-asis.png`

**What it shows:** Side-by-side Power BI matrices, built live on 2026-10-27, both cut at 15 Sep 2026:
- **Left — EU Daily OEE Report, Hull only** ("EU on HULL FILTER"): the EU report's own Daily Losses table, filtered to Site = Hull. This already has the 19-machine exclusion baked in (it's the EU report's native query).
- **Right — Hull Site OEE Report, as-is** ("HULL DATA FILTER"): the Hull site report's own Daily Losses table, no extra filter applied — this is what the site sees natively.

**Totals (both ≤ 15 Sep 2026):**

| Measure | EU (Hull) | Hull site (as-is) | Δ | Δ % |
|---|---|---|---|---|
| Sum of Duration (min) | 4,919,662 | 6,889,755 | **+1,970,093** | +40% |
| Sum of Value | 1,136,962.00 | 1,209,017.60 | +72,055.60 | +6.3% |
| Count of stops | 223,564 | 237,567 | +14,003 | +6.3% |

**Reading it:** This is the raw, unexplained gap — the number Segun originally flagged. It matches the order of magnitude from the earlier proof-on-loaded-data exercise (section 6 of `prompt-response/site-dashboards-analysis.md`: Hull losses +14,272 stops, +1.98M min, `Value` EU 1,136,945 vs site 1,210,571 — this live export is consistent with those figures, small differences from refresh timing).

**What it does NOT yet show:** this is the "before" state only — EU vs. site with no machine filter applied on the site side. The next export (site data with the EU's 19-machine filter applied) is what proves the gap is explained by the filter: Duration and Count should converge close to the EU numbers, while Value stays apart (different target file/key, a separate and smaller cause).

**For the meeting:** this screenshot is the "look how different these are" opener. Pair it with Screenshot 1 (the hidden filter formula) as the "and here's why" closer, and the upcoming filtered export as the "and once we align the scope, it matches" proof.

---

## Screenshot 13: `13-eu-vs-nottingham-daily-losses-asis.png`

**What it shows:** Same side-by-side exercise as Screenshot 12, for Nottingham, both cut at 15 Sep 2026:
- **Left — EU Daily OEE Report, Nottingham only:** the EU report's own Daily Losses table, Site = Nottingham, EU's 9-machine exclusion already baked in.
- **Right — Nottingham Site OEE Report, as-is:** no extra filter.

**Totals (both ≤ 15 Sep 2026):**

| Measure | EU (Nottingham) | Nottingham site (as-is) | Δ | Δ % |
|---|---|---|---|---|
| Sum of Duration (min) | 6,830,487 | 7,752,773 | +922,286 | +13.5% |
| Sum of Value | 536,579.70 | 536,954.80 | +375.10 | **+0.07%** |
| Count of stops | 332,252 | 346,532 | +14,280 | +4.3% |

**Reading it — Nottingham behaves differently from Hull:**
- Duration and Count still diverge (+13.5% and +4.3%), confirming the machine filter effect applies here too, though the gap is proportionally smaller than Hull's +40%/+6.3%.
- **Value is almost identical** (0.07% apart) — a sharp contrast with Hull's 6.3% Value gap. This matches the earlier finding in section 6 of `prompt-response/site-dashboards-analysis.md`: for Nottingham, the sub-group renaming / glidepath-key mismatch that drives Hull's Value gap mostly doesn't apply — Nottingham's OEE target and Value track closely between EU and site. Only the UPDT/PDT targets differ there (by exactly 100×, a units issue, not shown in this plain-sum matrix).

**Takeaway for the meeting:** the machine/area filter explains the row-count and Duration gap at both sites. The Value gap is Hull-specific (different target file + key + sub-group renaming); Nottingham's Value number is already close to matching as-is.

---

## Screenshots 14–15: Hull, filtered and date-corrected — the proof lands

**14-hull-site-filtered-value-field-check.png:** Confirms `Value` in the Hull site file has the **Σ icon** (plain column/measure that should respond to filters), ruling out the simplest "it's a disconnected measure" explanation. The field list also shows the matrix is built on the right table (MachineName, Value, Volume Total, Weighted Target % (per SubLoss) all present together).

**15-eu-vs-hull-after-filter-final.png:** Same side-by-side as Screenshot 12, but now with the date filter corrected to **"is on or before 15/09/2026"** (advanced filtering, not the basic "is before" which silently excludes the 15th itself) and the 19-machine EU filter applied on the right.

**Totals (both ≤ 15 Sep 2026 inclusive, EU machine list excluded on both sides):**

| Measure | EU (Hull, native) | Hull site + EU filter + corrected date | Δ | Δ % |
|---|---|---|---|---|
| Sum of Duration (min) | 4,919,662 | 4,920,879.00 | +1,217 | **+0.02%** |
| Count of stops | 223,564 | 223,658 | +94 | **+0.04%** |
| Sum of Value | 1,136,962.00 | 1,211,173.40 | +74,211.40 | +6.5% |

**This is the money-shot proof.** Once scope is aligned (same machines, same date cutoff):
- **Duration and Count converge to within 0.05%** — essentially a perfect match. This proves the row/volume gap Segun originally saw is **fully explained by the hidden machine filter**, nothing else.
- **Value stays apart by ~6.5%** — almost exactly the same gap as before any filtering was applied (was 6.3% unfiltered, now 6.5% filtered). This is the key finding: **the machine filter does not touch the Value gap at all.** It's driven by a separate cause — the glidepath lookup (different target file, machine-site vs. machine key, and sub-group renaming before the key — see Screenshot 2 and section 4a/6 of `prompt-response/site-dashboards-analysis.md`). Filtering out the extra machines doesn't change which target each remaining stop matches, so the lookup-driven gap is untouched.

**Why `Value`'s Σ icon doesn't contradict this:** it's a plain column, and it *did* respond to the filter (it moved between Screenshot 12's as-is export and here) — just not in the direction/amount expected from a pure row-count effect, because each stop's Value is itself a looked-up number that depends on which target row it hits, not a fixed quantity tied 1:1 to the stop. Removing 14,000+ stops removes their Duration and count cleanly, but the remaining stops' Value numbers are still computed from a different file/key than the EU's, so the two totals don't converge.

**For the meeting, this is a clean two-part message:**
1. **Row/volume gap → 100% explained by the hidden machine filter** (Duration, Count: Screenshots 1, 12→15, now matching to <0.1%)
2. **Value/target gap → a separate, smaller, and already-understood cause** (different glidepath file and lookup key — Screenshot 2), independent of the machine filter

---

## Screenshots 16–18: Nottingham — filter mistake found and corrected

**16-eu-vs-nottingham-filtered-overshoot.png:** First filtered attempt overshot — site ended up *lower* than EU (Duration −3.0%, Count −4.1%), a near-mirror flip from the +13.5%/+4.3% gap seen unfiltered. Root cause: the tick list in the filter panel excluded an extra machine not on the official list (`Fette 10`, 2,780 rows) alongside the 9 genuine ones, confusingly similar-named to `Fette12`/`Fette20` on the real list.

**17-nottingham-filter-exact-9-list.png:** Confirms the official Nottingham Daily Losses exclusion list, read from the query's `Filtered Rows` step (same list documented in Screenshot 8 and section 4a): **`Bosch, Fette 23, Fette12, Fette2, Fette20, Fette4, Fette5, Gran0, S14`** — exactly 9 names, no `Fette 10`.

**18-eu-vs-nottingham-filtered-final.png:** Re-run with exactly those 9 machines excluded, date "is on or before 15/09/2026".

**Totals (both ≤ 15 Sep 2026 inclusive, correct 9-machine list applied on both sides):**

| Measure | EU (Nottingham, native) | Nottingham site + correct filter | Δ | Δ % |
|---|---|---|---|---|
| Sum of Duration (min) | 6,830,487 | 6,832,409.00 | +1,922 | **+0.03%** |
| Count of stops | 332,252 | 332,361 | +109 | **+0.03%** |
| Sum of Value | 536,579.70 | 536,954.80 | +375.10 | +0.07% |

**Result: Nottingham now converges exactly as cleanly as Hull did** (Screenshot 15: Duration +0.02%, Count +0.04%). All three measures — including Value this time, since Nottingham's glidepath lookup doesn't diverge from the EU's the way Hull's does (see Screenshot 13's annotation) — land within a tenth of a percent once the correct machine filter and date cutoff are applied.

**Lesson for next time:** when manually re-applying a machine exclusion list in a Power BI filter panel, re-verify the exact tick list against the query's own `Filtered Rows` step text (or search-and-check each name individually) rather than scrolling and unticking by eye — near-duplicate names (`Fette 10` vs `Fette12`/`Fette20`) are an easy miss.

**Bottom line for the meeting, both sites now proven:**
- **Hull:** Duration/Count converge to <0.05% after the filter; Value stays ~6.5% apart (separate, known cause: different glidepath file + lookup key).
- **Nottingham:** Duration/Count/Value **all** converge to <0.1% after the filter — no separate Value-lookup issue here.
- In both cases, the row/volume gap Segun originally flagged is **fully explained by the hidden machine filter** in the EU report's Power Query step.

---

## Screenshots 19–21: where each report reads its glidepath (targets)

**19-oee-targets-eu-regional-source.png — EU report, query `OEE Targets EU`:** `SharePoint.Contents` on the **NottinghamCI** site, then folders `Shared Documents` → `PowerBI` → **`EU OEE Regional ASZ`** → **`Glidepaths`**. One regional folder for all sites; the files there carry a `Site Name` column (the unpivot step keeps `Site Name, Line, OEE Bucket`).

**20-oee-targets-n-nottingham-source.png — Nottingham site report, query `OEE Targets N`:** `SharePoint.Files` on NottinghamCI, folder `Shared Documents/PowerBI/EU OEE Dashboard ASz/GlidePath Targets/`. Nottingham's own folder, different from the regional one.

**21-oee-targets-hull-source.png — Hull site report, query `OEE Targets`:** `SharePoint.Files` on **X-seedHull**, folder `Shared Documents/General/Power BI/OEE Board A Sz/Targets GlidePath/`. Hull's own folder, on Hull's own SharePoint site.

**Reading it:** three reports, three glidepath folders. The EU report never reads the site files, so any update a site makes to its own glidepath does not reach the EU report unless someone copies it into the regional folder too.

---

## Glidepath vs glidepath: `compare_glidepaths.ipynb`

Cell-by-cell comparison (line + OEE bucket + month) of the regional file against each site file. Regional files: `sharepoint/reference/glidepaths/site=<site>/` (assumed to be the regional folder of Screenshot 19: same `Site Name` column, EU bucket names). Site files: `downloads/`. Hull bucket names renamed to the regional names first, so only the numbers are compared.

| | Same | Different | Only regional | Only site |
|---|---|---|---|---|
| Hull 2025 | 5,148 | 0 | 0 | 0 |
| Hull 2026 | 3,807 | **818** | 204 | 475 |
| Nottingham 2025 | 0 | 0 | 24 | 0 |
| Nottingham 2026 | 4,152 | 540 | 0 | 0 |

- **Nottingham: same targets, different units.** All 540 differences are the two total buckets (`Unplanned Downtime (Total)`, `Planned Downtime (Total)`): site holds 0.147, regional 14.7, exactly 100×. Every loss sub-bucket and `% OEE` matches. This is why Nottingham `Value` matched (Screenshot 18) and why UPDT/PDT targets are "100 times apart" in the earlier analysis.
- **Hull: identical in 2025, split in 2026.** 818 targets differ, not by one factor (e.g. T1 `% OEE` Jan 2026: regional 44.7, site 47.7). The site file has targets for **SP1** (5,094 stops in 2026) and **SP2** (2,135 stops) and extra Foiler 2 buckets from July; the regional file has none of these but still has **Saloon** (225 stops, last 27 Mar 2026). This is the Hull `Value` gap (cause 3 in `proof-eu-site-config-daily-losses.ipynb`).
- **Which is more valid (a guess, Reckitt decides):** for Hull, the site file. It covers the lines that actually run in 2026; the regional copy looks like the 2025 file that did not get the 2026 revisions. For Nottingham, the content is the same; only the unit of the two totals has to be agreed.

---

## Screenshots 22–25: Hull site Plan OPT and Time Utilisation (2026-10-27)

All four are the Hull site report. 22 and 24 are as-is (date ≤ 15/09/2026). 23 and 25 add the EU machine filter, but the date was changed to **≤ 13/09/2026**.

| Screenshot | Table | Filter | Visual total | Same total from the loaded data | Check |
|---|---|---|---|---|---|
| 22 | New Plan OPT | ≤ 15/09 | Good Parts 522,256,881, Capacity 1,358,576,635 | 522,256,881 / 1,358,576,635 | ✅ matches |
| 23 | New Plan OPT | ≤ 13/09 + machine filter | Good Parts 520,781,480 | expected about **366.8M** | ❌ machine filter had no effect |
| 24 | Time Utilisation | ≤ 15/09 | OEE 5,505,570 / Total 14,283,142 / Planned 13,337,437 | same | ✅ matches |
| 25 | Time Utilisation | ≤ 13/09 + machine filter | OEE 5,488,581 | expected about **3.86M** | ❌ machine filter had no effect |

**What went wrong in 23 and 25:**
- **The machine filter did nothing.** Jan–Aug and 2024–2025 are identical to 22 and 24, and only September moved, from the date change. The data has 6,922 Plan OPT rows (Good Parts 155.4M, mostly Senokot Press 109M) and 4,726 Time Utilisation rows on the 19 machines, so the filter should have cut them. Most likely cause: `MachineName` was dragged from another table (for example the losses table or a machine names table) that does not filter these tables. Use the `MachineName` of the same table as the values (`New Plan OPT`, `Time Utilisation`).
- **The date moved to 13/09.** Keep 15/09 on both sides, as for the Daily Losses checks.

**Expected result once fixed (Hull site, ≤ 15/09, 19 machines out), against the EU report's Hull part:**

| Measure | Site with EU filter | EU (Plan OPT H / Time Utilisation H) | Gap |
|---|---|---|---|
| Good Parts | 366,808,946 | 366,808,946 | 0 |
| Capacity | 885,416,597 | 885,452,497 | 0.004% (refresh date) |
| OEE Time Total | 3,864,430 | 3,864,430 | 0 |
| Total Time Total | 9,734,724 | 9,734,724 | 0 |
| Planned OPT Total | 9,038,634 | 9,038,794 | 0.002% (refresh date) |

So for Hull Plan OPT and Time Utilisation, the machine filter explains the whole gap, as it did for Daily Losses.

**23b / 25b (re-done):** `23b-hull-site-plan-opt-eu-filter-fixed.png`, `25b-hull-site-time-util-eu-filter-fixed.png`. The machine filter now works: Jan–Aug equal the EU visuals (26, 27) row for row. The date is still ≤ 13/09/2026, so September is two days short. The totals are exactly the loaded data cut at 13/09 (Good Parts 365,336,392, Capacity 882,057,923, OEE Time 3,848,942; Time Utilisation 3,848,942 / 9,695,184 / 9,005,528). Set the date to 15/09 to compare with 26 and 27.

**23c / 25c (final):** date ≤ 15/09 and the machine filter from the right table. Plan OPT: 366,808,946 / 885,416,597.21 / 9,735,444.13 / 9,038,813.88 / 3,864,430.10. Time Utilisation: 3,864,430.10 / 9,734,724.13 / 9,038,633.88. Both exactly the expected values. Hull is done for all three tables.

## Screenshots 28–29: Nottingham site Plan OPT N and Time Utilisation N, as-is (≤ 15/09)

Both match the loaded data: Plan OPT Good Parts 651,114,265, Capacity 1,144,561,423.42; Time Utilisation OEE 11,982,183.85 / Total 21,068,664 / Planned 20,078,948.

**The EU rule for these two tables is not the Daily Losses rule** (Screenshots 9, 10):

| Table | EU rule (query) | Machines left |
|---|---|---|
| Daily Losses N | remove 9 names (Bosch, Fette 23, Fette12, Fette2, Fette20, Fette4, Fette5, Gran0, S14) | everything else, manufacturing included |
| Plan OPT N | keep `AreaName` = `" Strepsils Packing"` (leading space) or `"SD Packing"`, and `MachineName` ≠ `S14` | 23 packing machines |
| Time Utilisation N | keep 23 named machines: N1, N3–N8, N9 Auto, N10–N12, O5, O6, S04, S05, S06, S08, S10–S13, T2, T7 | the same 23 |

The two rules of Plan OPT and Time Utilisation are written differently but keep the **same 23 machines**. Only Daily Losses differs: it keeps the manufacturing machines too.

**Expected after the EU filter (site, ≤ 15/09) against the EU report:**

| Measure | Site + EU filter | EU | Gap |
|---|---|---|---|
| Plan OPT Good Parts | 621,276,541 | 621,276,541 | 0 |
| Capacity | 1,095,278,673.52 | 1,095,225,033.52 | 0.005% (refresh) |
| Total Time (Min) | 9,962,700 | 9,962,700 | 0 |
| Planned Time (Min) | 9,090,882 | 9,091,122 | 0.003% (refresh) |
| OEE Time (Min) | 5,281,793.65 | 5,276,230 (Plan OPT EU) | −0.1% (seconds dropped) |
| Time Utilisation OEE Time Total | 5,281,793.65 | 5,282,267.52 | 0.009% (refresh) |
| Total Time Total | 9,962,700 | 9,962,700 | 0 |
| Planned OPT Total | 9,090,882 | 9,091,122 | 0.003% (refresh) |

**Screenshots 30–31 (Nottingham site, 23-machine filter, ≤ 15/09):** Time Utilisation 5,281,793.65 / 9,962,700 / 9,090,882; Plan OPT 621,276,541 / 1,095,278,673.52 / 9,962,700 / 9,090,882 / 5,281,793.65. Exactly the expected values in the table above. Filter set from `MachineName` of the same table, `is` the 23 names.

## Screenshots 26–27: the EU side for Hull (Plan OPT EU, Time Utilisation EU)

Both: EU report, `SiteName` = Hull, date ≤ 15/09/2026. Rows 16,640 (Plan OPT) and 9,141 (Time Utilisation), the same row counts as the loaded EU tables.

| Measure | EU visual | Hull site + EU filter (expected, from the loaded data) | Gap |
|---|---|---|---|
| **26 Plan OPT EU** Good Parts | 366,808,946 | 366,808,946 | 0 |
| Capacity | 885,452,497.21 | 885,416,597 | 0.004% (refresh date) |
| Total Time | 9,735,147 | 9,735,444 | −0.003% |
| Planned OpT | 9,038,580 | 9,038,814 | −0.003% |
| OEE Time | 3,859,252 | 3,864,430 | **−0.13%** |
| **27 Time Utilisation EU** OEE Time Total | 3,864,430.10 | 3,864,430.10 | 0 |
| Total Time Total | 9,734,724.13 | 9,734,724.13 | 0 |
| Planned OPT Total | 9,038,793.88 | 9,038,633.88 | 0.002% (refresh date) |

**Reading it:**
- **Time Utilisation EU** matches the Hull site table to the decimal once the 19 machines are out.
- **Plan OPT EU**: counts (Good Parts, Capacity) match. The three times are whole minutes and a little lower. That is the `Plan OPT Provideam` union step (Screenshot 11): it turns each time into text, splits on `:` and keeps hours × 60 + minutes, so the seconds are lost. OEE Time loses the most (−0.13%) because its values carry seconds, while Total Time and Planned OpT are mostly whole hours. A formula difference, not a data difference. (The exact rounding of that step is not reproduced to the minute yet: truncating the seconds gives 9,730,690 and rounding gives 9,735,444, against 9,735,147 in the visual. Small, left open.)

---

## Next Steps

- **For the slides:** Screenshot 1 (the hidden filter) is the key visual proof that the EU and site reports use different machines.
- **For detailed reconciliation:** Compare the three matrices (EU / Site as-is / Site with EU filter applied) from Part 2 of the Power BI guide.
- **For a full audit trail:** The proof notebooks in `analysis/proof-*.ipynb` (local, git-ignored) reproduce these transformations on the loaded data and show which ones matter most.
