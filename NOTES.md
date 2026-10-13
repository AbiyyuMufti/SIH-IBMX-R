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
