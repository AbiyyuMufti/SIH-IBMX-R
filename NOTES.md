# NOTES

## Status
- Platform switch (2026-10-13): the tenant moved to Xcelerator IAM / siemens.app on 2026-10-12. Config node `platform` (legacy | xcelerator, no default) drives all flows and `IH_PLATFORM` the scripts, see `docs/platform-switch.md`. Mock proof passes (449 checks, old flows vs new flows on both platforms); rebuilt flows NOT yet imported and run in the VFC.
- API exploration done (Phase A and B). VFC flow `fact_kpi` / `fact_loss` built, refactored to the readability rules, tested on the mock.
- Reference tables (`dim_asset`, `dim_reason`, `dim_product`, `dim_shift`, `ref_target_seed`): one tab `flows/vfc-reference-tables.json` plus the Config tab `flows/vfc-config.json` (global context). Tested on the mock (2026-10-04). The first version (five flows) ran in the VFC and wrote files.

## Processing queue (source/, sizes in bytes)
- [x] CADIT Insights Hub Services Testing.postman_collection.json (17,731): 16 calls
- [x] Reckitt OEE.postman_collection.json (379,507): 203 calls
- [x] Paul-Flow.json (135,178): 31 calls
- [x] farhan-flows.json (280,546): 69 calls (+1 scanner flag, no call)
- [x] mei-flows.json (58,826): 22 calls
- [x] AssetFilterFinal.py (5,699): 4 calls

Outputs: `docs/inventory/<file>.md` (6), `docs/inventory.md` (index), `docs/auth-checklist.md`, `.env` (40 empty placeholders, gitignored, not committed).
Helper scripts (read-only, no network): `scripts/helper-postman-outline.js`, `scripts/helper-postman-markdown.js`, `scripts/helper-nodered-outline.js`.

## Failed attempts
- Tried: listing source/ with awk `$NF`. Error: file names with spaces were truncated, so the queue had wrong names and the helper script got ENOENT. Fix: re-listed with `ls`; queue now has full names.
- Tried: a Bash call that included a `python3 --version` check. Error: denied by the deny rule on `python`/`python3`. Fix: removed it, not needed (Python is never executed).
- Tried: first version of the Node-RED helper redacted any 32+ char string including URL paths, hiding endpoint paths. Error: `<LONG>` in place of URLs. Fix: regex no longer matches `/` and `.`; endpoint paths now visible.
- Note: the allow rule `Bash(node scripts/parse-:*)` does not match the helper names required by CLAUDE.md (`scripts/helper-*.js`); those runs prompt unless you add `Bash(node scripts/helper-:*)`.

## Decisions
- 2026-10-02: test tenant is **reckitt** (user decision). Credentials were reused from other projects, which is why they appear in several source files.
- Auth needs one POST (token request); ask the user before sending it in step 6.
- Phase B will add JS call scripts in `scripts/` (one per API area, GET only, secrets from `.env`).
- Placeholder summary of all APIs and what can be tested: `docs/api-summary.md`.

## Phase B log
- Step 6 done (2026-10-02): token POST with the reckitt API technical user (`RECKITT_API_TECHUSER_*`) OK: token_type bearer, expires_in 1799 s (30 min), token about 3.3k chars (JWT). `GET /api/oee/v3/health` -> HTTP 200, empty body, no content-type header, about 1.4 s. Sample: `samples/oee_health.json` (gitignored).
- Iteration 2 (2026-10-02): `GET /version` -> 200 `{version}`; without token -> 403 (Postman says noauth, wrong). `GET /assets` -> 200, plain array of 44 `{assetId,name,description,isManual,isConfigured,reasonTreeId}`, no pagination info. Token response fields: access_token, token_type, expires_in, scope, jti. Script `scripts/test-version-assets.js`; samples `oee_version.json`, `oee_assets.json`. Docs updated (oee-api, auth, README, api-summary).
- Iteration 3 (2026-10-02): OEE `/assets` ignores size/page (always 44). Asset Management needs `Accept: application/hal+json` (json -> HTTP 500 'No acceptable representation'); AM list paged (size 200 -> 246 assets, 2 pages); tree rebuilt from parentId matches the UI; 44 OEE assets. OEE `/assets/{id}` returns only thresholds; `/config` shape varies per asset; Hull (site) not an OEE asset (404; /config gives empty 200). `/reasontrees` -> `{reasonTrees:[22]}`; `/reasontrees/{id}/reasons` -> flat list of 1034 with parentId. Scripts: test-assets-paging-detail.js, test-asset-tree.js, test-hull-reasontrees.js. Docs: assets.md, config-and-master-data.md.
- Older next candidates (done above except the last two): `GET /assets?size=5&page=0` (does paging exist?), `GET /assets/{id}` and `/config` for one asset, `GET /reasontrees`.
- Scripts: `scripts/lib-ih.js` (env loader, getToken, apiGet GET-only, redact, saveSample), `scripts/test-auth-health.js`.
- Note: flows refresh the token every 19 min; real lifetime is 30 min.

## Working agreement (changed 2026-10-02, by the user)
- Iterate: after each API call (or small group) in Phase B, immediately do the Phase C docs for it (redacted sample in `samples/`, endpoint doc in `docs/`), then go back to Phase B. Docs must explain the latest call in plain language.
- CLAUDE.md still lists B then C as separate phases; update it if the user wants the new loop written down.
- User context (2026-10-02): B2 Line = automatic (MindConnect, real assets); GT4 and soon Mira = manual OEE (operators enter data via a digital form in Insights Hub). Test order is a column in docs/api-summary.md (no separate test plan file).
- Iteration 4 (2026-10-02): time series on B2 Line `02 Filler`: 6 aspects; limit max 2000, range max 90 days, 404 [6410] unknown aspect, 400 [6009] limits; OEE_MachineState/MachineSpeed empty (30 d); counters cumulative; sparse records with _qc. Script test-timeseries.js. Doc timeseries.md.
- Iteration 5 (2026-10-02): GT4 manual OEE: manualInputs -> {manualInputs, virtualPeriods} (12h shifts, ms durations, eTag for updates); OEE_Hourly_Entry TS has hourly records (JSON-in-string fields, ActorEmail personal data, minutes); comment -> []; productionTarget/downtimeReasons/topDowntimeReasons/topRejectReasons shapes documented. Windows 24h/48h/7d tried. Script test-manual-inputs.js; docs manual-inputs.md, kpis.md.
- Iteration 6 (2026-10-02): group 3 remaining reports + per-asset sources + 12 master data lists tested on B2 Line/GT4. Findings: mode CONNECTED/MANUAL/STATUS_RULE/CALCULATED, valueType CNT_PROGRESSIVE/CNT_DIFF; distribution duration string (B2) vs number (GT4); /timeModel and /microStops single objects; /measureCollections capped at exactly 100; /application/settings 404; 34 expressions (30 KPI). Scripts test-asset-reports.js, test-master-data.js, lib-probe.js. Docs kpis.md, config-and-master-data.md extended.
- Iteration 7 (2026-10-02): AM assettypes/aspecttypes -> 403 Access Denied for the API tech user (can read assets/aspects only). User approved evaluateKPIs POST (same as Paul-Flow): 200, 30 KPI rows + humanFormula, 51 rows with recursive=true (extra OPERAND rows, same values); B2 Line 24h Performance 2.17 and Rejected > Good (odd data/config); GT4 48h OEE 0.12; missingMapping 1 item on GT4. Scripts test-am-types.js, test-kpi-post.js. Docs kpis.md (POST section), assets.md (403).
- Iteration 8 (2026-10-02): full formula reference of the 34 expressions (30 KPI + 4 AUXILIARY) added to docs/kpis.md, built from GET /expressions and /operands with IDs translated to names (including the conditional in Good parts: subtracts Manual rejected parts when GoodOperandMode==CONNECTED and RejectedOperandMode==MANUAL_CONNECTED).
- Iteration 9 (2026-10-02): the 2 remaining POSTs tested (user approved): /expressions/{id}/evaluate (1 result row; groupedByDateTime -> groups per hour; recursive -> dependency rows; AUXILIARY works) and /assets/{id}/timeModelCategoryDistribution (flat body from/to/filter/force; B2 Line 24h 469 segments; GT4 manual -> 400 "Assets with manual status are not supported"; force no visible effect). Script test-kpi-post2.js. Paul daily report writes all KPIs as Parquet columns. All read-style OEE endpoints are now tested.
- Decision (2026-10-02, user): skip all remaining write calls (about 42 POSTs plus PUT/DELETE: notifications, status merge/split/overwrite, source changes, manual input/comment/assignments, master data creation) for now. Ideas parked: permission probe with an invalid body on POST /productUnits (403 vs 400), throwaway create, use Hull > Test Line as sandbox if confirmed. No docs/write-calls.md written. Postman has no descriptions (0 of 60 POSTs).
- Review pass (2026-10-02): docs restructured for human + AI reading. New: README rewritten as landing page (10 key gotchas, index, repo map), quickstart.md (token + reusable call-API function + 4 examples), endpoints.md (flat reference of all tested calls + conventions), test-log.md (history moved out of README). api-summary.md rewritten (coverage, write-call risk table). Every behaviour file starts with an At a glance table. Automated check (links, secrets, ids, emails) passes; Postman inventory 32-hex id masked.
- Report data cross-check (2026-10-02): user asked to check 25 BI report data items against tested results. Written to prompt-response/report-data-coverage.md (12 FULFILLED, 11 PARTIAL, 2 MISSING). Key gaps: CU definition/factor (blocks 11 components), targets (6), product master (2), site coverage (only Hull has data; N1 and L2 unconfigured). Extra tests (GET + approved evaluateKPIs POST with filters): scripts/test-report-coverage.js. Corrected a wrong claim: reason trees are partly shared (10 trees used by 38 assets, one tree by 21).
- Remaining (old list): Asset Management assettypes/aspecttypes (GET), then KPI POSTs (needs user approval), events low priority. User asked about Remote Control from phone: CLI not on PATH; bundled claude.exe in the VS Code extension; options given.
- Hooks in .claude/settings.local.json: Notification (Exclamation sound) and Stop (Asterisk sound).
- Notification hook added in .claude/settings.local.json (Notification event plays a Windows sound via PowerShell) so the user hears when a prompt needs confirmation.
- Next (old note, time series now done): time series read for a B2 Line machine (aspects OEE_Hourly_Entry, OEE_MachineState, OEE_Prerequisites), then manualInputs / downtimeReasons GETs, then ask approval for evaluateKPIs POST.
- Docs so far: `docs/README.md` (index + worked example of step 6), `docs/auth.md`, `docs/service-status.md`, `docs/assets.md` (docs now grouped by behaviour, not by service; `oee-api.md` removed).

## Open questions
1. Which client(s) to use for `reckitt` (OEE technical user vs supervisor client) and whether a read-only client exists. See `docs/auth-checklist.md`, section "Questions to ask your colleague".
2. Postman environment files were not provided; `HOST`/`PIAM` etc. are blank in the Testing collection and `PIAM` in the OEE collection.
3. Insights Hub SDK nodes (`read-oee`, `write timeseries`, `create event`, `asset-type`, `read aggregates`) have no URL in the flow. Inferred APIs are guesses; ask the colleague for the actual endpoints if they matter.
4. The Testing collection requests `Retrieve Cases` and `Retrieve Event Types` use the same URL as `Retrieve Events`; probably placeholders.
5. `farhan-flows.json` tab `Delete Timeseries`: flow vars `tokenUrl`, `clientID`, `tokenSecret` are never set in the file.
6. Node-RED `DELETE` call in Paul-Flow tab `OEE` (id 8d4e5b58.d17f08) builds a URL without asset ID/aspect in the path as written; looks incomplete.

## Secrets found (location only, values not recorded anywhere)
- Testing Postman: item `Get Token`, `request.auth.basic`.
- OEE Postman: items `techuser / create TU OEEHUB Admin User` and `Get Token`, `request.auth.basic`.
- Paul-Flow.json: tab `OEE`, function `Technical user`.
- farhan-flows.json: tab `OEE`, function `Technical user`; `build token request` functions in tabs `B2 line OEE`, `GT4 line OEE` (x2), `GT4 line losses`, `Delete Timeseries`.
- AssetFilterFinal.py: line 25, variable `decode`.

## Other things to know
- `.claude/` is untracked (settings files). `.claude/settings.local.json` is gitignored; `.claude/settings.json` is not. Left uncommitted.
- Personal data in sources (default `ActorEmail` strings in farhan-flows, a Windows user name in Python file paths) were not copied into docs.
- Many Node-RED calls are copies across tabs; distinct endpoints are far fewer than the call counts.

## Next
- Platform switch: you re-import Config (`flows/vfc-config.local.json`, platform legacy first), BI reference (`flows/vfc-pbi-reference.local.json`) and Hull Power BI daily (`flows/vfc-pbi-daily-hull.json`), run with dryRun on legacy, then set `xcelerator`, Apply, run again and compare log lines and row counts. Add `IH_PLATFORM` (and keep `XC_TENANT_ID`) to `.env` for the scripts. Then confirm with Reckitt: assettypes now 200, OEE assets 55, when the old gateway stops. Layout rule changed (see "Layout rule" below): re-import the rebuilt flows when you enable them.
- Logger (CSV in the data lake, `docs/logging.md`): re-import the Hull and Reference tabs (the first version could not create the file), run once, wait about 1 minute, check `logs/hull/log_2026-10.csv`; then the open points in the doc. Then re-run September to see the 413 and paging errors in the log.
- You: import `flows/vfc-site-hull.json` (needs the Config tab), run with DRY_RUN true, then write. Check the files land in `fact_kpi/Hull/` and `fact_loss/Hull/`.
- Waiting for you: the pasted Siemens page on secret rotation, then adapt the config and secret design.
- Group 2: decide later. Group 3 waits for Reckitt.
- Data completeness (from `docs/powerbi-model-findings.md`): own product table (design to approve), shift naming check, machine key and product type values (user), reason tree columns, files from Reckitt.
- eu_report (decided 2026-10-15): with your confirmation, upload `sharepoint/reference` to `eu_report/reference` (`node scripts/datalake-upload-tree.js`). Then build the 6 tables of `pbi_report` from `sharepoint/source` + `reference` (copy the load queries of the .pbit), staging local only. Decide how much history to download (only Aug, Sep, current month so far).

## VFC flow (fact_kpi, fact_loss) - in progress (2026-10-02)
- Paul-Flow.json is available. Pattern: function builds msg.method/url/headers -> http request (method "use", ret "obj") -> function; parquet node (engine parquetjs, option write, multi, columns [{column,type}]) -> function sets msg.path -> write object (mode object).
- Local run for production day 2026-09-30 done (scripts/test-vfc-local.js, logic in scripts/vfc-transform.js): B2 Line 24 kpi rows + 168 loss rows, GT4 24 + 1; SUM(total_time_ms) = 24.000 h for both. Data depth: B2 Line and GT4 start 2026-08-31 (scripts/test-vfc-depth.js, has asset IDs, not for commit).
- Blocked on: parquet node type names and nullability (not documented where reachable), overwrite behaviour of write object, function-node capabilities. Flow JSON not yet built; asked the user.
- VFC function nodes have NO fetch, require, process (user test 2026-10-02); Buffer and Promise exist, setTimeout is an object. Flow rebuilt with http request nodes, split per asset, join per day, no cycles. downtimeReasons accepts size=5000 (423 stops in one page), GET /assets/{id} gives hierarchyPath (names only). Parquet node types offered: STRING, BOOLEAN, INT64, DOUBLE, TIMESTAMP_MILLIS/MICROS, JSON, no DATE. End-to-end run of the exported JSON: scripts/test-vfc-flow.js.

## Flow readability refactor (2026-10-04)
- Applied the CLAUDE.md "Flow readability" rules to the whole VFC flow. Behaviour is unchanged: the old flow (commit afbe602) and the new one gave identical requests, logs and parquet rows on 240 mock runs (12 scenarios x 5 day ranges x dry run/write x all assets/CONFIG list, incl. both clock-change days). 17 of 17 log branches reached.
- Function code is now one file per node in `scripts/vfc/s<stage>-<name>.js` (80 columns, multi-line blocks, comments above the code, 2-4 line header). `scripts/vfc-transform.js` and `scripts/vfc/n1..n8-*.js`, `node-*.js` are gone; their logic moved into the new files.
- Flow is laid out as 8 stages, one row each, with 7 link in / 13 link out. One debug node ("Day log") fed by one link in (was 3 wires), the join is fed by one link in (was 3 wires, running backwards).
- Split: old step 5/6/7/8 became 3.2-3.5, 4.1-4.4 and 5.1-5.4, each node one clear step. Decision (user, 2026-10-04): splitting by line count is not needed, what matters is that the logical steps are clear and easy to understand. The "about 50 lines" rule and its validator warning were removed; do not split or merge nodes only for length.
- Moved on purpose: production_day and local_date are now added once in node 5.2 (was inside both row builders, so the time code was pasted twice). Row key order changed (day columns last), parquet columns are the same, values identical.
- Changed on purpose: the "more than one page" failure text now says "raise PAGE_SIZE in node 4.1" (the old text pointed at step 6).
- New tooling: `scripts/validate-flow.js` (the CLAUDE.md checks), `scripts/lib-vfc-runner.js` (runner, now with link nodes), `scripts/lib-mock-ih.js` (fake Insights Hub, synthetic data). `node scripts/test-vfc-flow.js 2026-09-30 mock` runs the flow offline. `scripts/test-vfc-days.js` reads the new files.
- Not tested against real Insights Hub or the VFC editor: the VFC palette is assumed to have link in / link out nodes (standard Node-RED). Import the new flow in the VFC and tell Claude if link nodes are missing or anything looks wrong.
- Observed, not changed: KPI column `downtime_ms` is in neither INT_COLUMNS nor the DOUBLE list, so its parquet type is INT64 but the value is not rounded. A fractional downtime duration fails the type check in the test runner; how the real parquet node reacts is unknown. Real data has not shown it yet.

## Reference table flows (2026-10-04)
- Design approved by the user: one flow file per table (to learn from), CONFIG as in the fact flow (same default asset list, set by the user), live check optional.
- Live check **not done**: the cloud session had no `.env` or credentials. The flows follow the shapes in `docs/config-and-master-data.md`. Open items are listed in `docs/reference-tables.md`.
- New files: `scripts/build-vfc-reference-flows.js` (own small layout helpers; the fact flow generator was not touched, its JSON rebuilds byte-identical), `scripts/vfc/r*.js`, `flows/vfc-ref-*.json`. `test-vfc-flow.js` takes `file=<flow json>`. `lib-mock-ih.js` has routes for config, thresholds, reason trees, product collections and calendars, and two scenarios: `ref-config-fail`, `ref-detail-fail`.
- Result: all five flows pass `validate-flow.js`. Mock runs: ok, token-fail, list-fail, empty, only-unconfigured, ref-config-fail, ref-detail-fail behave as intended (nothing written on any failure). Old flow: mock output for ok, unmapped, stops-paged and empty identical to before.
- Decision: the five flows each repeat the setup stage (token, asset list, choose assets). Duplicated on purpose so each file stands alone.

## Config tab and single reference tab (2026-10-04, step 1 and 2 of the agreed plan)
- Decisions by the user: global context (not tenant, other people should not see it), subfolders in the data lake work (confirmed), one flow per site for facts, one shared flow for dims and refs, shared settings in one place, dry run per task.
- New: `flows/vfc-config.json` (node 1.1 CONFIG sets `global.get('cfg')`, sites list), `flows/vfc-reference-tables.json` (129 nodes, was 248 in five flows), `flows/vfc-group-test.json` (import to test group nodes, then delete). Removed the five `flows/vfc-ref-*.json`.
- Per-asset stage now makes one config call per asset for three tables, and reads the hierarchy once for all of them, so Test Line is excluded in every table (intentional change, was dim_asset only). Mock: 35 http calls became 16.
- Proof: new tab vs the five old flows on the mock, 9 scenarios, all/configured asset lists, 5 tables: 90 checks, 0 differences in parquet rows and in what is written (Test Line exclusion switched off in the comparison for the four tables that did not have it).
- Runner: `global` context, join state per join node (was shared by parts id), `dryRun` as an object per table, runs the Config tab first. The fact flow output is unchanged (mock ok, unmapped, stops-paged, empty identical).
- Layout: 260 px columns, 220 px rows, everything on the 20 px grid, side link outs below their node, fan-out link outs stacked to the right. Estimated overlaps in the new tab: 0. The cause of the old overlaps: fixed 190 px columns with node widths that depend on the name, and side link outs placed on top of the next node.
- Secrets: not rotated yet. Siemens has a how-to "OAuth Client Secret Rotation" and a page "Rotating app credentials"; the pages did not load in this session, so no rotation interval or mechanism is recorded here.

## Per-site fact flows (2026-10-04, step 3)
- New: `scripts/lib-flow-builder.js` (shared tab builder and lane steps, the reference generator now imports it and its JSON rebuilds byte-identical), `scripts/build-vfc-site-flows.js` (one flow per entry in `SITES`), `scripts/vfc/s1-site-settings.js`, `docs/fact-flows.md`. `flows/vfc-site-hull.json`: 65 nodes, same grid layout as the reference tab.
- Removed: `scripts/build-vfc-flow.js`, `flows/vfc-fact-kpi-fact-loss.json`.
- Day start (`dayStartHour`) is now a per-site setting read in nodes 1.2, 3.2, 4.1, 4.3 and 5.2; it was fixed at 06:00Z. `plannedRoots` moved to the Config tab.
- Proof: old flow vs Hull flow on the mock, scenarios ok, unmapped, stops-paged, empty: same requests, logs and parquet rows. Only the path gained the `Hull` subfolder.
- Still open: `local_date` uses a London offset rule (UK only). Global context in the VFC is unconfirmed.

## Secret rotation (2026-10-04)
- The user pasted the Siemens how-to. Facts are in `docs/auth.md` (two secrets in parallel, introduce / update clients / remove old, scope `prv.oc.sec.ch`). No expiry period is stated.
- Design proposal (waiting for approval): the secret stays in node `1.1 CONFIG` only, so a rotation is one edit plus `Apply`, for all sites and flows. No automatic rotation inside the VFC.

## VFC check (2026-10-04, by the user)
- Config, reference and Hull flows imported and dry-run in the VFC: all work after one fix. In the VFC the global context is `glob`, not `global` (sources, runner and docs now use `glob`). Group nodes are supported (group test file removed).
- Tab names chosen by the user: `Config`, `Reference tables`, `Hull daily report` (no "Mufti"). The generators use them.
- Decision: group 2 (shift KPIs, manual entries, run rate, derived loss columns) is marked DECIDE LATER (postponed, not dropped, not planned). Group 1 is the base for the first draft of the real dashboard. `fact_kpi_shift` can be derived from `fact_kpi` plus `dim_shift` if needed.
- Next: user checks file content in the data lake; first dashboard draft on group 1 tables.
- `dryRun` is set in the VFC by the user. Dev work never changes the default (`true`).

## Logger (2026-10-04)
- Decision (user): CSV log, one file per month and flow, appended (read, add, write back), always written, errors caught with a `catch` node. Quote-everything CSV, `SEPARATOR` constant.
- Runner extended: catch, in-memory read/write object, custom join (sent when the queue is empty), debug of `msg.line`. New mock scenario `kpi-413`. New test `scripts/test-vfc-log.js`.
- Same logs as before in ok, unmapped, stops-paged, empty (compared with the saved baselines).
- The `3.x` and `4.x` check nodes now put the API message in the FAILED text.
- First VFC run (user imported, I ran Backfill, dry run): the run line showed, but `read object` on the missing file only printed a yellow warning (404) and sent nothing. The catch never saw it, so nothing was written. Tried: read, then catch for the error. Fix (approved): the batch also goes through a 10 s wait to the append step; the append writes once per batch id, assumes a missing file when there is no payload, and writes a time-stamped file instead of replacing a file it knows. Runner: a read of a missing file now only warns; a delay in delay mode sends when the flow is quiet.

## Data lake download (2026-10-05)
- The Data Explorer manual describes no download or zip. The API has `POST /api/datalake/v3/generateDownloadObjectUrls` (body `{paths:[{path}]}`, answer `objectUrls[{path, signedUrl}]`, URLs valid 120 min, no zip).
- User approved this POST. `scripts/datalake-download.js` (probe one path, or all days of a known file name pattern, then zip). Tested only against a local fake server: no credentials in the cloud clone. To confirm on the real tenant: does the technical user have data lake rights, how does the API answer for a path that does not exist.
- Test of `scripts/datalake-download.js` (2026-10-05): the real tenant answers HTTP 403 `mdsp.core.datalake.accessDenied` ("Access denied for this resource.") to `generateDownloadObjectUrls` and also to GET `/api/datalake/v3/objects`, `/objectEventSubscriptions`, `/dataLakes`. The API technical user has NO data lake right, so the script cannot be confirmed on the tenant with it. Need a client/user with a data lake read role (ask the colleague; role name not checked). Still unknown: how the API answers for a path that does not exist.
- Fixes found by the mock test (`scripts/test-datalake-mock.js`, 12 checks, fake server on localhost): `zip` is not installed on this Windows machine (script would crash after downloading), now falls back to Windows `tar.exe`; paths the API does not return are now listed as FAILED (before they were silently missing from the count); a path with `../` from the server can no longer write outside `downloads/`; `import.meta.dirname` (Node 20.11+) replaced so Node 18 works.
- `scripts/test-datalake-403.js` prints only the error body of the 403 (no URLs, no token).
- Data lake retry after the user gave the technical user the `mdl admin` role (2026-10-05): the new token DOES carry `mdsp:core:mdl.mdladmin` (31 scopes, found with `scripts/test-token-scopes.js`, names only), but `generateDownloadObjectUrls` still answers 403 `mdsp.core.datalake.accessDenied` for `fact_loss/site=Hull/fact_loss_2026-09-0[8-10].parquet`. So the role alone is not enough. Not verified: whether the data lake has its own path permissions, whether `mdl.mdladmin` only covers data lake administration and not object read, or whether the path is wrong (a wrong path would normally give 404, not accessDenied). Next: ask which data lake permission the VFC flow identity has, and the exact folder of the files.

## Power BI tables flow (2026-10-08)
- Built from the user's Excel mapping: one flow reads dim_asset, dim_shift, fact_kpi, fact_loss and writes six pbi_* tables, no API call. See `docs/powerbi-tables.md`.
- Open: the parquet READ node settings are a guess (the user's working read node JSON is needed). Plan OPT product, capacity, loss units, targets and volume total stay null.
- The user's VFC copies equal the repo code except settings (write mode, `site=` folders, log folder from cfg.site, arrow functions, Config with real values).

### Parquet read output setting (2026-10-08)
Tried: Power BI flow with `Keep dim_asset` expecting an array. Error: "the file did not give a list of rows". The parquet read node of the VFC outputs one message per row by default. Fix: set the node output to one message with an array in msg.payload (all four parquet read nodes). A join after the node was built and reverted. Exact setting name to be copied from the user's node JSON into `pqread` in `lib-flow-builder.js`.
- Update (11:50): the Power BI flow now works with either parquet output setting: a join (3 s, grouped by msg.topic = the day) after each parquet read collects rows, and `p2-keep-next.js` flattens a list of lists. A parquet file with zero rows sends no message, so the day stops silently there.

## Lake API spike (2026-10-08)
- Plan with the user: Python (polars) GET on an `http in` node of the VFC, `?path=<file>.parquet`, flow reads the file and answers bytes (default) or base64 JSON. Read only. Key = platform key of the `http in` node. Log per request and the existence check are NOT in the spike.
- Palette facts (from the user's node JSON): `list objects` (fields subtenant, path), read/write/delete/subscribe object; `http in` has access `key`.
- Built `flows/vfc-lake-api-spike.json` (`scripts/build-vfc-lake-spike.js`, `scripts/vfc/k*.js`, `scripts/test-vfc-lake-spike.js`). To test in the VFC: bytes vs base64, how the key is sent, output of `list objects`.
- The user pasted a real http in key in chat: advise to regenerate it. Never write it to the repo.
- Spike result (2026-10-08): GET with `?key=<key>&path=<file>` works, bytes open in polars. Missing file did NOT hang: the read gave a non-parquet answer and the spike returned 200 with junk (polars: "must end with PAR1"). `list objects` returns `[{key,lastModified,contentSize,storageClass}]`, msg.path = folder.
- Built `flows/vfc-lake-api.json` (endpoint `/parquet-data-lake`, path or list mode, existence check with 404, log per request, 502 for non-parquet). Offline test `scripts/test-vfc-lake-api.js`. Open: link nodes keep msg.res?; list cap.

## Power BI tables straight from the API (2026-10-09)
- Decision (user, with the Power BI tab view colleague): the data source must be the Power BI format from the first run. No switch for raw facts. Two new tabs written like the original flows: `flows/vfc-pbi-daily-hull.json` (plan opt, time utilisation, daily losses) and `flows/vfc-pbi-reference.json` (machine names, shift naming, calendar). The three older flows (fact, reference, conversion) stay in the repo; the user disables them.
- Shift per hour/stop: two extra GETs per asset and day (OEE config for the calendar id, calendarEvents for the production day), evaluated with the recurrence rule in UTC. Real-tenant behaviour of `calendarEvents?from&to` with a one-day window is not checked.
- Proof: `node scripts/test-vfc-pbi-direct.js` runs the old chain and the new flows on the same mock: equal rows for all five day/site tables. One difference: a stop without duration is null now (old chain: 0).
- Column lists moved to `scripts/lib-pbi-schemas.js` (old generator output unchanged).
- Next: the user imports both tabs (Config tab first), runs with dryRun, checks the log lines, then sets dryRun false per flow. Open: Changeover events in `pbi_shift_naming`, local time for non-UK sites, DST for shifts, targets/product/capacity (Reckitt), single shared engine for several sites.

## Product, order and time model probe (2026-10-12)
- User wants `part_name` / `product_key` (product name and code) and `batch_id` (order) filled from Insights Hub, and asked to re-test the claim that only manual assets have product per time: the dashboard filters Product and Order on B2 Line (connected).
- No credentials in the cloud clone, so the probe could not run here. `scripts/test-product-order.js` (GET plus the two approved read POSTs) is ready; the user runs it and reports back. Docs not changed until the output is known.
- Probe result (2026-10-12, run on the user's machine with `node scripts/test-product-order.js 2026-10-08`): all calls HTTP 200 except GT4 `timeModelCategoryDistribution` = 400 (manual asset, as documented). B2 Line order and product source mode CONNECTED (`source` is one string), GT4 MANUAL; design speed VIA_PRODUCT on both. B2 Line has 2 to 5 orders and products per day; for 2026-10-08 each PRODUCT and each ORDER value claims its own hours (0 overlaps), so product and order per hour can be derived with one hourly KPI call per value. Reasons carry no time category (trees have a timeModelId). Docs updated: config-and-master-data.md, kpis.md. `prompt-response/context-update-targets-products.md` (item 4, run rate per SKU) still says there is no product per hour: now only partly true, not edited.
- Failed attempt (2026-10-12): the first run stopped because `scripts/test-product-order.js` was not on the branch yet (fetch and pull showed no such file in any branch). Fix: the user pushed it, a second fetch and pull brought it (commit 5209437).

## Product, order and unit columns in the daily Power BI flow (2026-10-12)
- Decisions (user): `pbi_plan_opt` per shift AND product; `batch_id` = the order (only in `pbi_daily_losses`, the Power BI copy of Plan OPT has no batch column; the mapping Excel marks it Missing); `product_key` = product code for now ("to clarify"); `unique_machine_name` stays the asset id (mapping Excel: "Direct (our key)"); shift names, area names and the production-day rule may differ from the Power BI copy; `capacity` is an assumption to clarify later (user does the Power BI Desktop check).
- Check against a copy of Plan OPT EU (44,686 rows): details and differences are in `docs/powerbi-direct.md` (section "Differences with the Power BI copy"). The copy builds `product_key` as machine-site text + part name and `unique_machine_name` as machine-site text, which we do NOT follow (user decision above).
- Built: stages 5 to 7 in `flows/vfc-pbi-daily-hull.json` (filterValues, product list, one filtered hourly `evaluateKPIs` per product and order, assign hours, plan rows per shift and product with capacity and downtime units, loss rows with product, order and loss units). Nodes `scripts/vfc/d7-*.js`. No second split: the values of an asset are collected with flow context (`valueRuns`) because a nested split/join behaviour is not known in the VFC. Link outs of a node that has several side outputs are now stacked below it (`lib-flow-builder.js`).
- Proof: `node scripts/test-vfc-pbi-direct.js` (57 checks): on a day without products the rows still equal the old chain; the mock scenario `products` checks the split, the carry-forward of idle hours, speed conversion, part name and key, batch id, loss units and the number of filtered calls; `values-fail`, `products-fail`, `value-kpi-fail` write nothing; `no-collection` keeps names. Layout: 0 overlaps by the estimate.
- Not tested on the real tenant: the whole new lane, filterValues values equal product NAMES, GT4 filtered hourly KPIs.
- Next: the user imports the daily tab, runs the dry run for one day and sends the log line and the first rows; then Reckitt inputs (Glidepaths, product type, volume rules), the Power BI Desktop check (`part_name`, `capacity`, relationship on `unique_machine_name`), the 413 window split.
- Real run 2026-09-15 (user wrote the day, read the parquet): see `docs/powerbi-direct.md` section "Checked on the real tenant". Shifts, part name, product key, capacity and loss units work on B2 Line and GT4. Open: B2 Line `batch_id` empty (check orders of that day), `oee_time` about 9 % above good parts / design speed on B2 Line.
## Platform switch (2026-10-13)
- Why: tenant migrated to Xcelerator IAM and the siemens.app domain on 2026-10-12. A general customer notice from the Siemens reseller says applications must adopt Xcelerator IAM and the new domain and the tenant is migrated once applications are compatible.
- Smoke check (`scripts/smoke-check.js`, `prompt-response/smoke-check-2026-10-13.md`): old host + old token and new host + new token both work (26 of 27 GETs as docs, `evaluateKPIs` 30 results on both); mixed pairs fail (new token on old host 403, old token on new host 401).
- Failed attempts: POST `https://<tenant ID>.eu1.sws.siemens.com/oauth` gave 302 to `http://.../oauth/`, which gave 307 back to `https://.../oauth/`; no token. Fix: `/oauth/token` (200, form body `grant_type=client_credentials`). The credentials went once over plain http to the redirect target, on the user's approval.
- VFC probes by Claude in Chrome (read-only scratch tab, deleted after): old platform and new platform each: token 200, OEE health/assets, Asset Management assets, `evaluateKPIs` 30 results. Dry run of the real flows on legacy worked on 2026-10-12 (user's report, not seen by me). The Chrome baseline of the Reference tab was skipped (tab disabled).
- Decisions (user): `platform` has no default and must be set; the suffix `1000001700` may be in the public repo; the tenant ID is a placeholder in committed files; BI reference keeps the hand-made layout (layout file); Hull Power BI daily is re-imported fresh.
- Built: Config node derives tokenUrl, tokenForm, oeeBase, amBase; token node and 13 request nodes use them; `cfg.gateway` removed (old disabled tabs must be re-imported before enabling). Mock serves both platforms and refuses a token from the other. `scripts/test-platform-switch.js` is the proof (old flows from git commit da968fc).
- Found: assettypes 200 (docs 403), OEE assets 55 (docs 44), Asset Management `tenantId` is the tenant ID on xcelerator. Docs updated with the dates.
- Local files (git-ignored): `flows/vfc-config.local.json` (real values from .env, platform legacy, root reports) and `flows/vfc-pbi-reference.local.json` (same as the build, placement kept).
- Layout question (user): the 260 px column pitch leaves gaps of 0 to 165 px (median 60 px) in the generated Hull daily flow; the user's hand layout of BI reference has a median gap of 20 px and a pitch of 200 px. Cause: fixed pitch, node width depends on the name. Proposal not built.

## Layout rule (2026-10-13, decided by the user after seeing Hull Power BI daily)
- Old rule: fixed 260 px columns. Gaps between nodes were 0 to 165 px (median 60-70) and 4 pairs overlapped by the width estimate in the Hull daily flow.
- New rule: `compactLanes` in `scripts/lib-flow-builder.js` (GAP 20 px, lane start with the left edge 40 px from the left border = 2 tiles, as in the hand-made BI reference). `nodeWidth`: 7 px per character + 57, rounded up to 20, minimum 100, link nodes 30. Checked on the hand layout of BI reference: 0 overlaps, gaps 0 to 40 px, median 30.
- Applied to all generated flows (Config, Reference tables, Hull daily report, Hull Power BI daily, Power BI tables, BI reference without its saved layout). Rebuilt flows differ from the previous commit only in x (ids, y, wires, code unchanged). Not applied: the Lake API flows (their VFC tab differs from the repo file) and the BI reference tab (saved hand layout wins).
- `validate-flow.js` now fails on overlapping nodes of a row by the estimate. The user's exports of the disabled tabs are in `flows/disabled/` (not committed).

## Power BI model findings (2026-10-13)
- Read the existing EU report (`.pbit` and `.pbix`, kept outside the repo). Findings in `docs/powerbi-model-findings.md`, re-read with `scripts/helper-pbit-outline.js` (read-only, no network).
- Keys: every fact joins on the machine key, the product key and the shift name, plus the date. The machine key is a hidden relationship key (not in any visual or measure). The product key in the copy is machine + product name, so we build our own product table.
- Decisions (user): own product table with native SIH columns, `product_key` = code (check uniqueness first); two sources side by side (the copy and SIH native), same structure; product type through a per-asset value in Config.
- Open: machine key (asset ID or the copy's machine-site form), product type values, cutover per site, files from Reckitt for targets and corrections.
- Failed attempt: the `.pbix` data model is compressed (not readable here); the `.pbit` has `DataModelSchema` as UTF-16 JSON without BOM, which is what the helper reads.

## Power BI data map diagram (2026-10-13)
- Built `diagrams/powerbi-data-map.drawio` (8 pages) with `scripts/build-drawio.js`, from the template, the report file, the mapping workbook, the report copy samples and a profile of the downloaded lake files (`scripts/helper-profile-parquet.py`). Doc: `docs/powerbi-diagrams.md`. Checked: `node scripts/validate-drawio.js` and an export of two pages with draw.io desktop.
- Decision (user): examples with real data values are allowed in the repo; the diagram is tracked in git. Python is allowed for data checks (CLAUDE.md and the local settings changed).
- Found in the lake data (38 days of Hull): product columns empty on days with no product (B2 Line 1-3 and 8-14 Sep, GT4 29 Sep, 3 and 6-8 Oct); `equipment` 16 %, `loss_lvl3_sub_group` 35 %, `breakdown_types` 0.2 % filled; `value`, `target`, `volume_total` and the three targets empty; `product_type` empty.
- Failed attempt: `python -I` could not import polars (isolated mode ignores the user site); matplotlib fails to start on this PC. A PNG preview comes from draw.io desktop: `draw.io.exe --export --format png --page-index N`.
- Next: ask whether to add a per-column plan to the "not created" page; keep the diagram in step when a column changes.

## Product type = area (2026-10-13, decision of the user)
- `pbi_machine_names.product_type` now takes the Insights Hub area (like `area` and `dept`), see `scripts/vfc/m4-asset-items.js`. The three columns are redundant until Reckitt gives the real mapping, which Insights Hub does not have. Take note when the report is checked against the Power BI local copy: for Hull the copy has Dept Liquids Pack / Dries Pack, Area Liquids / Dries, Product Type Bottles / Blisters.
- Changed in the generator and in both flow files `flows/vfc-pbi-reference.json` and `flows/vfc-pbi-reference.local.json` (only node 4.1 Build asset items; the local file keeps its layout). The daily flow is unchanged. Test `test-vfc-pbi-direct` now expects product_type = area (legacy and xcelerator pass).
- To do: run the reference flow again with dryRun false, then download the lake files and refresh the diagram (`python scripts/helper-profile-parquet.py`, `node scripts/build-drawio.js`).

## Fork layout rule (2026-10-13, from the user's hand-made layout of the Hull Power BI daily flow)
- Read the layout of `flows/vfc-pbi-daily-hull.local.json` (the node ids are new after the import into the VFC, so nodes were matched by name). Rule found and written as `fanForks` in `scripts/lib-flow-builder.js`, called first by `compactLanes`: a node with several wires out fans its targets 40 px apart, centred on the node (up = main path, down = link outs); one wire out = back to the lane row; starters that feed the same node stack around it.
- Check: regenerated daily flow, 114 of 120 nodes on the same row as the user's file, 94 within 20 px in x (his x are 5 px steps). Not followed: 9.2 Decide day (he used 40 px for two targets), the two "to APPEND" link outs and one log lane.
- All generated flows change layout (site, reference tables, config, Pbi daily). `vfc-pbi-reference` keeps its saved layout (flows/layouts). The old chain flow `vfc-powerbi-tables` keeps the old layout (fork switched off in its builder).
- `test-platform-switch.js` now masks product_type of pbi_machine_names (intended change of the same day), all tests pass: validate-flow, test-vfc-flow, test-vfc-pbi-direct, test-vfc-log, test-vfc-lake-api, test-platform-switch.
- To do (user): import the rebuilt flows and look at them; tell me where the rule is wrong, then I adjust `fanForks` (not the JSON by hand). A layout saved from the VFC (scripts/save-layout.js) still wins.

## Product type checked in the lake (2026-10-13)
- Reference flow run in the VFC, new `pbi_machine_name.parquet` downloaded: 2 rows, `product_type` = `area` (Bottles for B2 Line, Blisters for GT4), no empty column. Diagram refreshed (profile and Machine Names page).

## Real Hull Plan OPT files (2026-10-13)
- Read the data lineage document (SharePoint folders per table, same as the model queries) and 4 downloaded Hull Plan OPT files. Doc: `docs/powerbi-source-files.md`.
- B2: our good parts are 96.6 % of the real file over 38 days (correlation 0.86); differences come from planned stops (real Planned OpT below 1,440). GT4: ours is 43.6 % of the real good parts over 24 days (correlation 0.62), different product on some days. Not explained yet.
- Failed attempts: the zip was in `downloads/` of the repo, not the Windows Downloads folder; the files are UTF-16 with bare CR line endings (first reads gave 1 row, then garbage); a `Total:` row sits in each file.
- Open: ask the file owner how GT4 is filled, whether the files are edited by hand, and for the Hull machine scope (24 of 34 machines after the report filter). Next: decide whether to add a source-location line to every table page of the diagram.

## Diagram: new purple level and file question list (2026-10-13)
- Decision (user): the gaps whose real source is a SharePoint file get their own colour, "needs source file" (purple): Machine Names (Product Type, Dept, Area), the three Plan OPT targets, Daily Losses (Value, Target, Volume Total, Equipment, Loss Units), Shift Naming, and the not-created target and correction tables. Built in `scripts/build-drawio.js`.
- Interim (user): copy the Hull and Nottingham files to the data lake by hand until an integration exists. Question list for Reckitt: `prompt-response/file-integration-questions.md` (access for the other sites is still to request; who grants it is not known).

## Targets page and a correction (2026-10-13)
- New diagram page "Targets (Glidepaths)". Correction of an earlier answer: Daily Losses Value, Target and Volume Total are used by visual 5 (Top 5 Loss Categories), not by 7 and 8. Visuals 7 and 8 use the Plan OPT PDT and UPDT targets. Source: the data lineage document.
- Loss Target Key (Daily Losses) = machine + loss sub group + month (text, en-GB); Loss Key in the file = Line-Site + OEE Bucket + month. Open risk, to check when the Glidepaths file is downloaded: do the category names equal our sub group names (our stand-in is the top reason level, filled for 35% of the stops)?

## Purple level corrected (2026-10-13)
- Mistake: I made 10 more items purple than agreed. User rule: purple = the report takes the value from a file that we looked at (Glidepaths) and the values would be the same if the file is extracted. Reverted Product Type, Dept, Area, Volume Total, Equipment, Loss Units, Shift Naming and the three hidden file tables to their earlier colours (red again for Volume Total and the three hidden tables).
- Sheets: tables are numbered 1 to 6 (also on the overview cards). The Targets sheet and the Not created sheet are explanations and have no number, so they are not mixed up with tables.

## Hull maintenance guide: Provideam is the source (2026-10-13)
- The Hull board gets its production and loss data from Provideam daily reports (email, Power Automate, SharePoint), plus five manual Excel config files. Doc: docs/provideam-source.md.
- Consequences: Capacity, Planned OpT, OEE Time and Downtime Units are Provideam calculations (OEE % = Good Parts / Capacity); Provideam loss names (Group, SubGroup, Desc) differ from ours; the Mode Log has comment text; GT4 has a second machine "GT4 - Auto" that the report query removes; Volume Loss Correction is a Provideam report, not a manual file; Targets Volume reads the Plan OPT folder.
- Open: do the diagram and the file question list need changes (owners are now known, two file types are Provideam reports, not manual files)? Why monthly Plan OPT files if the guide says daily files?

## Provideam sheet in the diagram (2026-10-13)
- New unnumbered sheet "Explanation Provideam vs Insights Hub": the two data paths, a 13 row overlap table (both / only Provideam / only Insights Hub / independent Excel files) and what it means for replacing Provideam. Provideam = OEE software from DTL Systems (vendor listings; its own documentation was not read). Fixed the Volume Total note on the Targets sheet (Hull Targets Volume reads the Plan OPT folder).
- Open question for Reckitt (not yet in the question list): which system is the official OEE source per site, today and after a move.

## First SharePoint download run (2026-10-13 evening)
- Claude in Chrome reported 34 files from the 15 Nottingham site folders (formats, glidepaths, shift coding, equipment coding, machine names, and for Nottingham and Weinheim the 3 newest files of plan OPT, line losses, run rates, volume correction). Hull: all 5 folders "access denied" for the assistant, although the user opened Hull "OEE Board A Sz / Plan OPT" in the browser earlier. The assistant listed folders by SharePoint's listing and did not find "OEE Board A Sz" under Power BI (it saw Labour, New OEE Standard, 3 Month OEE Dashboard, Mapping): a navigation or permission problem of the assistant, not proof that the folder is gone.
- Result on disk: 0 of 34 files arrived. One stray temp file in the Windows Downloads folder (the Weinheim format list, 3,671 bytes, 19:29). Likely cause: Chrome blocks repeated automatic downloads that start without a real click. Fix for the retry: real clicks on the Download button, one folder at a time, and look for the Chrome "download multiple files" bubble.
- From the report (useful anyway): the folders hold monthly files plus a current-month file (for example Sep2026-notts_monthly_line_losses.csv, Notts_Current_Month_OPT.csv), not daily files. Nottingham line losses has 22 files, run rates and volume correction 16 each. The config files are CSV (formats per site, 4 glidepath files for Hull, Mira, Notts, Weinheim, one shift pattern file for all sites, equipment coding CSV per site) and machine names are .xlsx. All current-month and Sep files were modified today between 11:20 and 12:24 UTC (an hourly job rewrites the current and the last month). This answers the earlier open question: monthly files in all sites, the guide's daily files are not what the folders show.

## Diagram as final documentation (2026-10-13)
- Column "Difference" renamed "SIH integration" (status and difference), new column "SIH source" with the API endpoint and field of every Power BI column, endpoint lists on the overview cards and on the "not created" cards. Source of the endpoint text: the flow code (scripts/vfc/d*.js, m*.js) and docs/endpoints.md. Not checked against live calls today.
- Layout (corrected on the user request): no extra column. The SIH source is a teal box inside the SIH integration box, below its last text, on top of it. The validator ignores boxes that are inside another box on purpose.

## Xcelerator is the target platform (2026-10-13)
- Decision (user): the VFC will use xcelerator from now on, imminent. Docs updated: a platform note on 11 docs that showed legacy hosts only (9 usage docs with a table row, 2 history docs with a note), a cutover checklist in docs/platform-switch.md, endpoints.md, README, CLAUDE.md, and the diagram note (paths shown without the suffix, xcelerator named as target).
- Open at the cutover: lake read/write nodes and the http in address on xcelerator (not tested); the host used by parquet/request_data.py; which platform the earlier VFC runs of 2026-10-13 used (not recorded).

## SharePoint download run, result (2026-10-14)
- Correction of the earlier note: the first run did work. The files were saved in the project folder `downloads/` (Chrome profile 5 has that as its download folder), not in the Windows Downloads folder and not in `downloads/sharepoint`, so the first search missed them. 36 files (the assistant reported 34), all complete: sizes match the report, encoding readable, last row complete, both .xlsx valid. No failed download.
- Sorted into `downloads/sharepoint/<site>/<folder>/` (git-ignored, with MANIFEST.md): regional (formats, 4 glidepaths, shift coding), Nottingham and Weinheim (equipment coding, line losses, machine names, plan OPT, run rates, volume loss correction), Hull plan OPT (copy of the first 4 files, prefix Hull_).
- Hull: only the Plan OPT folder opens for the user (access is per folder, not for the parents). The other 5 Hull folders (equipment coding, line losses, machine names, packing run rates, volume loss correction) are not downloaded: access request needed. Mira site: no access. (Outdated: the user downloaded the 5 Hull folders later on 2026-10-14, see below.)
- Next: analyze the content (glidepaths first), then the Provideam and Power Automate integration.

## SharePoint files analysed, diagram updated (2026-10-14)
- Analysis of the 36 files: docs/sharepoint-files.md. Helper: scripts/helper-analyze-sharepoint.py (writes diagrams/data/sharepoint-findings.json). Diagram now 16 sheets: new explanation sheets Format List, Shift names, Machine Names, Equipment Coding, Loss Units, Data collection and conflicts; Targets sheet extended with the 17 name rules of the Hull query.
- Corrections: Volume Total = sum of Plan OPT Capacity per machine and day (not good parts per month; the mapping Excel outside the repo still says per month). Plan OPT EU[ShiftName] holds the mapped Shift value, not the raw name.
- Failed attempts: first read of the Line Losses files failed (unescaped quotes in the comment text): read tab files without a quote character. Python -I and matplotlib problems as before.
- Open: the Mira site needs access (the Hull files arrived later on 2026-10-14); mapping tables do not exist yet; official OEE source per site; Power Automate to VFC not tested.

## Diagram is now edited by hand (2026-10-14)
- The user edits `diagrams/powerbi-data-map.drawio` by hand (re-saved by draw.io). `node scripts/build-drawio.js` would OVERWRITE the whole file: do not run it without telling the user. Changes go into the saved file directly (a yellow box = a comment of the user).
- Added the user comment on sheet "1 Machine Names EU": Insights Hub is overall complete for this table; it covers Machine Name, Area, Site Name and Machine ID; Dept, Area and Product Type can be compiled from a confirmed master mapping on top of it; static reference data, flow stays as it is, compile later. Not committed (the file is in progress).

## Plan sheet and table priority (2026-10-14)
- New sheet "Explanation Plan to get the missing data" (for Asif): Class A reference files and Class B Provideam files; three options (1 Power Automate, 2 direct access, 3 manual copy) with how, what Reckitt must do, tested or not, good, risks; fit per class; sequence; decisions; which missing data first. Untested: Power Automate to VFC (size, key, UTF-16, licence), VFC reaching the Microsoft hosts, IT approval time.
- Overview: panel "Priority of the 6 tables" from Segun lineage: Machine Names 13 of 16 visuals, Plan OPT 9, Daily Losses 6, Calendar 2, Shift Naming 1, Time Utilisation 1. Missing data by visuals affected: Glidepaths 7, loss names and Loss Units 6, Machine Names master 2, Shift 1.
- Method: built to a temporary file (DRAWIO_OUT) and merged only the new parts into the hand-edited file (scripts/helper-merge-drawio-new.py). The user agreed to commit the diagram.

## Priority covers all tables (2026-10-14, correction)
- I had ranked only the 6 created tables. The user meant all tables, including the missing ones. The overview panel now ranks all 16: Machine Names 13 visuals, Plan OPT 9, Daily Losses 6, Volume Loss Correction 6 (feeds Loss Units), OEE / PDT / UPDT Targets 2 each, Calendar 2, Targets Losses 1, Targets Volume 1, Shift Naming 1, Time Utilisation 1, then 0 visuals on this page: Equipment Coding, Format List, Run Rates, Volume CoV. Second key: report pages. Swapped into the hand-edited file with scripts/helper-replace-drawio-panel.py.

## Flow charts of the three options (2026-10-14)
- New sheet "Explanation Three options flow charts": one swim-lane chart per option (1 Power Automate, 2 direct access, 3 manual copy). Purple = Reckitt must do, teal = our step, red diamond = test with a fail arrow to a fallback box, blue = lake result, green = tested. Tests shown: option 1 (premium licence, size up to 6.5 MB, UTF-16 decode), option 2 (VFC reaches Microsoft hosts, permission covers every folder), option 3 (folder access, file complete). Only option 3 is tested.
- Builder: Page.edge now takes a label. Merged into the hand-edited file with scripts/helper-merge-drawio-new.py (now generic: new page name and anchor page as arguments). The saved file has a page Page-18 of the user (34 cells): untouched.

## Farhan's emailed Provideam reports (2026-10-14)
- `downloads/farhansProvReportCsv/` (git-ignored): 2 report types x 2 versions (Day, Shift), GT4, 13 Oct 2026. Same UTF-16, tab, CR format as the SharePoint files.
- Production Trend: MachineName, YYYY-MM-DD HH, Good Parts (hourly, 06:00 to 17:00, 63,576 in total) plus a `Total:` row. OEELossLvl3SubGroup: MachineName, StartTime, ShiftName, BatchName, PartDesc, Duration, OEELossLvl3SubGroup, OEELossLvl3Desc, Comment: a continuous timeline (21 Run rows, 29 stop rows, 15 with a comment), a `SubTotal:GT4` row (12:00:00) and an empty last row.
- Day and Shift versions hold the same rows (GT4 ran only the day shift TueDay - Blue, 06:00 to 18:00); in the loss report the columns ShiftName and StartTime are swapped: read by header name.
- Not in these reports (against the SharePoint files): loss Group, ShiftStartDate, Capacity, Planned OpT, OEE Time, Loss Units. New: BatchName.
- Checks: GT4 part names equal the Insights Hub names (Dada/Straw 16's, 24's ...); batch names (AJT455, AJT406) have the same pattern as the Insights Hub batch ids (AJN564, AJR387 ...). The lake has no GT4 data after 8 Oct, so no direct comparison yet.

## How each table is created in Power BI (2026-10-14)
- Added a blue box to each table sheet 1 to 6 (merged into the hand-edited file with scripts/helper-merge-drawio-cells.py). Findings from the queries: Plan OPT = files of the folder stacked, then sites stacked, left joins to the Shift Pattern file and the three Glidepath tables; time columns to whole minutes (seconds dropped). Time Utilisation = same files, minutes with decimals, grouped per machine and day. Daily Losses = Line Losses files stacked, de-duplicated on machine + start time (the files overlap), about 17 text replacements, left joins to Shift, Volume Loss Correction (Loss Units), Equipment Coding, Targets Losses (Value) and Targets Volume; Duration to whole minutes. Shift Naming = distinct Shift values of the Shift Pattern file plus the Mira file. Calendar = a DAX formula (2011 to 2050). Hull Machine Names keeps only the departments Dries Pack and Liquids Pack.

## Flow charts of the data sources per table (2026-10-14)
- Sheets 1 to 6 of `diagrams/powerbi-data-map.drawio`: the text boxes "How Power BI creates this table" are replaced by flow charts (sources, steps, result). Source status colours: green (Insights Hub replaces it, original used for validation), purple (needed and missing), grey (built inside Power BI).
- Helper `scripts/helper-merge-drawio-cells.py` now adds arrows and can remove cells of an earlier run (`--remove-prefix`).

## Data lake download and upload (2026-10-14)
- Read the data lake OpenAPI file (`downloads/integrated-data-lake-v3-14-0-eu1-xcelerator.yaml`, 3.14.0). Download takes exactly 1 path per request, upload up to 30, both answer 201 (not 200), a missing object answers 404, base path on xcelerator is `/datalake-<id>/v3` (no `/api`).
- The 2026-10-05 script was wrong in three ways that the old mock test hid (batches of 50, success only on 200, old base path). Rewritten: `scripts/datalake-download.js` (list, get, days), `scripts/datalake-upload.js`, `scripts/lib-datalake.js`, `datalakePath()` in `scripts/lib-ih.js`. Mock test rewritten from the real behaviour (15 checks). Removed `scripts/test-datalake-403.js`.
- Real tenant (user approved the two generate POSTs and one test upload): list 200, download of `mufti_test/fact_loss/fact_loss_2026-10-12.parquet` OK (49977 bytes, valid parquet), 404 for missing days, upload of a 58-byte text file OK (PUT 200, no extra header, read back identical). Path must be WITHOUT `data/ten=reckitt/` (with it: 404). Storage is AWS S3. Doc: `docs/datalake-files.md`.
- Why the earlier 403: the token had no `dl.*` scope. Now it carries `dl.dsRead`, `dl.dsUser`, `dl.dsAdmin` (found with `scripts/test-token-scopes.js`). Minimum role not tested.
- Open: replacing an existing object by uploading the same path, legacy platform. (Delete tested and the test objects removed on 2026-10-15.)

## Python reads the data lake directly (2026-10-14)
- `parquet/request_data.py`: `request_parquet(path, token)` now uses the data lake API (signed URLs), `get_token()` for the token. The old VFC call is `request_parquet_vfc`. The user tests it in `parquet/extractdata.ipynb` (calendar read worked). Docs: `docs/datalake-files.md`.
- Hull SharePoint files downloaded by the user to `downloads/sharepoint/hull/` (Machine Names, Equipment Coding, Line Losses, Run Rates, Volume Loss Correction; git-ignored). Request table for Asif: `downloads/asif-request.html` (not in git).

## Data lake folders, table separation, local SharePoint layout (2026-10-15)
- Data lake: a new folder exists as soon as a file is uploaded into it (no create call, no empty folder). Delete works: `DELETE /objects/<path>` answers 204 (`scripts/datalake-delete.js`, `scripts/datalake-delete-tree.js`). `mufti_test/` deleted (19 files). Upload of the SharePoint files to `reports/static-reference/` worked (51 files) and was deleted again on request.
- Decision: new lake folder `eu_report/` with `reference`, `pbi_report` (the data we have now, Provideam exports, so Reckitt can see the dashboard) and `ih_report` (end goal: Insights Hub data enriched with the reference files). Old `reports/` stays. `fact_kpi` / `fact_loss` are outdated.
- Decision: the report needs 6 tables (Machine Names, Plan OPT, Time Utilisation, Daily Losses, Shift Naming, Calendar). Segun's lineage (`downloads/EU Level Overview Data Lineage.docx`) lists 8: the other two, Plan OPT N and Daily Line Losses N, are the Nottingham slice (N = Nottingham) and are not needed. Format List EU is reference (By Format page, not in the lineage). Staging tables are never stored in the lake; their logic runs in the VFC memory. Overview panel "Table separation for eu_report" in the diagram.
- Local layout: `sharepoint/` in the project root (git-ignored), `reference|source|staging|report / <type> / site=<site> /`. Regional group removed: glidepaths and format list split by site from the file name, shift patterns has no site column, so `site=All`. Machine Names xlsx converted to CSV (originals in `sharepoint/_original_xlsx/`), since xlsx is likely not readable in Insights Hub BI. `MANIFEST.md` rewritten. `scripts/helper-analyze-sharepoint.py` paths changed to this layout (not re-run). `scripts/datalake-upload-tree.js` now mirrors any local tree (default `sharepoint/reference` to `eu_report/reference`, not run).
- Only the newest Provideam files were downloaded (Aug, Sep, current; Hull Plan OPT also Jul). Weinheim is on the Nottingham SharePoint site in its own folder. Mira: no access.
