# Fact flows per site (fact_kpi, fact_loss)

| At a glance | |
|---|---|
| **What this is** | One VFC tab per site that writes the two daily tables `fact_kpi` (hourly KPIs per asset) and `fact_loss` (one row per stop) |
| **How they are built** | `scripts/build-vfc-site-flows.js` writes `flows/vfc-site-<name>.json` from `scripts/vfc/s*.js`. Shared settings come from the Config tab (`flows/vfc-config.json`) |
| **Status** | Hull built and tested on the mock only (2026-10-04). The earlier single flow ran in the VFC and wrote files |
| **Output** | `<root>/fact_kpi/<site>/fact_kpi_YYYY-MM-DD.parquet` and `<root>/fact_loss/<site>/fact_loss_YYYY-MM-DD.parquet`. A rerun replaces the day. `dryRun` is true by default |
| **Trigger** | Daily 07:00 UTC for Hull (one hour after the production day ends) and a backfill inject with a day range |

## Settings
- **Config tab** (`1.1 CONFIG`, global context): `root`, credentials, `sites` (`name`, `dayStartHour`, `assetIds`), `excludeNames`, `excludeAncestorNames`, `plannedRoots`.
- **Site tab** (`1.1 SITE SETTINGS`): `SITE_NAME`, `DRY_RUN`, `REBUILD_DAYS`. It finds the site in the Config list and copies the shared settings into flow context. It stops with a red status if the Config tab was not run, the site is not listed, or the site has no `assetIds`.
- The production day D runs from D `dayStartHour` UTC to D+1 `dayStartHour` UTC (Hull 6). The schedule time is the cron of the inject node: day end plus one hour.

## Add a site (for example Nottingham)
1. In `1.1 CONFIG` on the Config tab, add an entry to `sites`: `name`, `dayStartHour`, `assetIds`. Click `Apply`.
2. Create the flow, either way:
   - **No Node needed:** import `flows/vfc-site-hull.json` again, then change `SITE_NAME` in `1.1 SITE SETTINGS`, the tab name, the debug node name and the cron of the schedule inject.
   - **Generated:** add `{ name: 'Nottingham', cron: '...' }` to `SITES` in `scripts/build-vfc-site-flows.js` and run `node scripts/build-vfc-site-flows.js`.
3. Run with `DRY_RUN` true first, then set it to false.
Each site fails on its own: a failed call in one site writes nothing for that site and day, other sites are not touched.

## Rules built into the flow
- **No half days.** If any asset call fails, nothing is written for that day and the log says `FAILED, NOTHING WRITTEN`.
- **Hierarchy columns** (`site`, `area`, `line`, `machine`) come from the Asset Management hierarchy path, the same rule as in the reference tables, so the tables join on `asset_id`.
- **`local_date`** uses a Europe/London offset rule, so it is only right for UK sites. A non-UK site needs a different rule first (open point).
- **Proof of equivalence:** the Hull flow gives the same requests, log lines and parquet rows as the earlier single flow on the mock (scenarios ok, unmapped, stops-paged, empty). Only the file path gained the site subfolder.
