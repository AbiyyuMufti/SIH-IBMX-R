# NOTES

## Status
- Phase A (offline) complete: steps 1-5 done. Waiting for you before Phase B. No network calls were made, no Python executed, `source/` untouched.
- Commits: one per inventory, `inventory: index`, `docs: auth checklist`, helper scripts committed separately.

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
- You: fill `.env` (names in `.env`; see auth-checklist), answer open questions.
- Phase B step 6: test auth with one GET, report, wait for you. Then step 7: safe GETs one by one by API area, redacted responses to `samples/`.

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
