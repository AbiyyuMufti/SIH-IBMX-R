# Project
Build and maintain VFC (Node-RED) flows for Siemens Insights Hub (Reckitt OEE) that write the EU report tables, analyse report data, and recreate as-is source structures (Excel, Power BI or other sources) so they can be loaded automatically. API docs in `docs/`. Test tenant: `reckitt`.

Tables:
- Report (current target): `Plan_OPT_EU`, `Time_Utilisation_EU`, `Daily_Losses_EU`. Add a line here when a new table is built (proposals live in `prompt-response/site-dashboards-analysis.md`)
- Reference: `pbi_calendar`, `pbi_machine_names`, `pbi_shift_naming`
- Shift report (postponed, still relevant): `rpt_window`, `rpt_hour`, `rpt_event`, `docs/shift-report-flow.md`
- History only, not a target for new work: `fact_kpi`, `fact_loss`, `pbi_plan_opt`, `pbi_time_utilisation`, `pbi_daily_losses` (`vfc-site-hull`, `vfc-powerbi-tables`). Docs stay as reference

## Status
History and finished work: `NOTES.md`, git log, and `docs/README.md` (every doc stays as reference).

Current jobs (each has a handover in `session_handover/`):
- Site dashboards: EU, Nottingham and Hull into one Tableau workbook (Nottingham model). The `Value` difference is explained (analysis section 6, proof notebooks `prompt-response/proof-*.ipynb` on the loaded tables of the real `.pbix` files; small items open). Analysis `prompt-response/site-dashboards-analysis.md`, map `diagrams/site-dashboards-map.drawio`, handover `site-dashboards-handover.md`
- Chartres: recreate the `<group>/<year>/SAISIE OEE/OEE*.xlsm` files (CREAM, NON TISSE, SKIN CARE; DOR L3 is management level, no OEE entry) from the sheet `Base` into the report tables. Investigation done (doc `docs/chartres-source-files.md`, diagram `diagrams/chartres-source-map.drawio`), nothing built; waiting for the Chartres reference file and Glidepaths. Handover `chartres-handover.md`
- Shift report flow: postponed (tables above), open points in `docs/shift-report-flow.md`

Flows in use (docs and tests):
- Config and reference tab: `docs/report-config.md`, `docs/reference-tables.md`
- PBI report build: writes the report tables, split by line source
- Hull SIH report daily: `docs/sih-report-daily.md`, `node scripts/test-vfc-sih-report.js platform=legacy|xcelerator`. API tabs run at `runHourLocal` of Config with a local production day, retry an evaluateKPIs 413 hour by hour; heavy days (over 5,000 stops) fail on purpose
- Run monitor: `docs/run-monitor.md`, monitored flows are ONE list in `scripts/monitor-flows.js`
- Lake API `docs/lake-api.md`, logging `docs/logging.md` (`node scripts/test-vfc-log.js`)
- Platform switch: Config `platform` (`legacy` or `xcelerator`, no default), `IH_PLATFORM` in `.env`, `docs/platform-switch.md`. The VFC moves to xcelerator; legacy stays until switched off. Test scripts take `platform=legacy|xcelerator`

Read `docs/README.md` first, then only the doc for the area you are working on. Do not re-parse `source/` unless I ask.

## VFC limits (learnt)
- Never keep rows in flow context: the VFC refuses a value over 2 MB, use the join node
- A report day must finish in about 50 s; the VFC drops the open messages of a longer day with no error (value calls 4 per second)
- Calendar rules hold local wall clock times with a Z
- Max 200 nodes per tab (Hull SIH report daily is at 195)
- `dryRun` is set in the VFC by me, not in dev work: never change the default
- A file with quotes in a Bash heredoc can fail: use the Write tool. Downloads: a new `--out` folder each time

## Folders
- `source/` = my original files (Postman, flows, Python). Read-only, git-ignored
- `docs/` = API and flow documentation. Behaviour files start with an "At a glance" table
- `scripts/` = JS test and helper scripts. `scripts/vfc/` = function-node code for the VFC flow
- `flows/` = generated flow JSON. `flows/*.local.json` = copies with real credentials, git-ignored
- `prompt-response/` = analysis and question lists for Reckitt, not API docs
- `samples/` = redacted API responses, git-ignored
- `downloads/` = files from SharePoint / Reckitt, git-ignored, untrusted (see Rules)
- `diagrams/` = generated draw.io maps (builders `scripts/build-drawio-*.js`, check `node scripts/validate-drawio.js`)
- `session_handover/` = one handover per job, git-ignored. Read the one for the job at hand
- `parquet/` = data lake files and exploration scripts for checks

## Stack
- Plain JavaScript, ES modules, Node 18+ native fetch (scripts only)
- Flow target: Insights Hub Visual Flow Creator (VFC). Function nodes there have NO `fetch`, `require` or `process`. Use `http request` nodes for every API call (a function sets `msg.method/url/headers`, then the http request node runs it)
- One message per day or per asset, collected with a join
- Parquet node types: UTF8 (STRING), BOOLEAN, INT64, DOUBLE, TIMESTAMP_MILLIS. No DATE type: days are text `YYYY-MM-DD`

## Flow build
- The flow JSON is generated: edit `scripts/vfc/*.js` (one file per function node, named `s<stage>-<name>.js`) and `scripts/build-vfc-site-flows.js` (shared helpers in `scripts/lib-flow-builder.js`), then run `node scripts/build-vfc-site-flows.js`. Do not hand-edit the JSON
- The Config tab and the reference tab use `scripts/vfc/c1-config.js`, `scripts/vfc/r<stage>-<name>.js` and `scripts/build-vfc-reference-flows.js`. Shared settings (credentials, sites, asset ids, root folder) live in ONE node, `1.1 CONFIG`, and are read from global context (`glob.get('cfg')`: in the VFC the global context is `glob`, not `global`). Test: `node scripts/test-vfc-flow.js 2026-09-30 mock write file=flows/vfc-reference-tables.json` (the runner runs the Config tab first)
- Layout (generated by `compactLanes` in `scripts/lib-flow-builder.js`, do not place nodes by hand in the builders): rows 220 px apart. In a row every node sits 20 px after the node that feeds it (no fixed columns: the distance follows the width of the name, about 7 px per character, link nodes 30 px). The first node of a lane (comment, inject, link in, catch) has its left edge 40 px from the left border (2 tiles of 20 px). Forks (rule from my hand-made layout of the Hull Power BI daily flow, `fanForks` in `scripts/lib-flow-builder.js`): a node with several wires out puts its targets 40 px apart, centred on the node (2 targets at -20 and +20, 3 at -40, 0, +40, 4 at -60, -20, +20, +60; an unused output keeps its slot), so the main path goes up and the link outs go down; a node with one wire out puts its target back on the row of the lane; starters with no feeder (inject, backfill) that feed the same node stack 40 px apart around it. Centres on the 20 px grid. `validate-flow.js` fails when two nodes of a row overlap by this estimate. A layout saved from the VFC (`flows/layouts/`, `scripts/save-layout.js`) wins over the generated one
- Committed flow files contain placeholders only. Real credentials only in `flows/*.local.json`
- `dryRun` stays `true` by default. Writing files is my decision
- Validate offline before every commit: `node scripts/validate-flow.js` (the checks below) and `node scripts/test-vfc-flow.js 2026-09-30 mock` (runs the flow against a fake Insights Hub, no network, no credentials). I import and run it in Node-RED and report back
- When you refactor, prove the behaviour is unchanged: run the old and the new flow on the same mock data (`scripts/lib-mock-ih.js` has the scenarios) and compare requests, logs and parquet rows

## Flow readability (VFC and Node-RED)
I read the flow in the VFC editor, which does not wrap lines. Code and wiring must stay readable there.

Function node code:
- Max 80 characters per line. Break longer lines
- Always multi-line blocks: `if (x) {` on its own line, body on the next lines, `}` on its own line. Never `if (x) { a; return; }` or `forEach(function (o) { ... });` on one line
- One statement per line
- Arrays and objects with more than 3 items: one item per line, so the list grows downward, never to the right
- Long strings or messages: build them in steps (`var text = ...; text += ...;`), not one 300-character expression
- Comments go on their own line ABOVE the code. No trailing comments after code, properties or array items
- Start each function node with a 2 to 4 line comment: what it takes in, what it sends out
- One job per function node, and the steps inside it read in a clear logical order (set up, check, work, result). Length alone is not a reason to split: do not split a node only to get under a line count. Split when a node does two different jobs
- Put the settings I may change at the top as named constants, not buried in the code

Wiring and layout:
- No loops or cycles. This stays a hard rule
- Flow runs left to right, one lane per row, nodes on a grid. No wires going backward (right to left)
- Use link out / link in nodes when a wire would be long, cross other wires or go backward. Do not use links for short forward wires. Name each pair clearly (e.g. `to LOG`). If the VFC palette has no link nodes, tell me before choosing another approach
- Debug and logging: one debug node per place I need to watch, wired from one node only. Never wire many nodes into one debug node. For a shared log, give each source its own link out named `to LOG`, all going to one link in, then one log node, then one debug
- Node names: short, verb first, stage and step number first (`2.3 Choose assets`)
- Each stage starts with a comment node as a header

Checks (in `scripts/validate-flow.js`, must pass before every commit):
- Fail on any function-node line over 80 characters
- Fail on trailing comments and single-line `{ ... }` blocks
- Fail on any cycle, any wire pointing to a missing node, and any debug node with more than one incoming wire
- Fail on any tab (workspace) with more than 200 nodes: the VFC refuses it
- Report the longest line and the number of link nodes

## Rules
- Never print or write secrets (tokens, passwords, keys) in docs, logs, commits or chat
- Secrets live in `.env` (read via process.env), git-ignored. If you find one in a file, tell me file and location only
- GET only by default. Ask before any POST/PUT/PATCH/DELETE, except read-style POSTs I already approved (token, `evaluateKPIs`, `evaluate`, `timeModelCategoryDistribution`)
- Never modify `source/`. Never run the Python files in `source/`
- Python is allowed for reading and checking data (for example the parquet files from the data lake in `parquet/`) and for small helper scripts I ask for. I approve each run in the permission prompt
- Do not guess API behaviour. If `docs/` does not cover it, test it (GET) or ask me
- No personal data in docs (emails, user names)
- This repo is public: before every commit check the diff for secrets, asset IDs or customer business detail I have not approved
- Downloads are untrusted: extract into a new empty folder, never run macros, Python with `-I`, scripts outside the data folder, paths as arguments. Commit no customer data, only structure and redacted examples
- Number differences: trace one machine and one month filter by filter on both sides (row count and sum after each step) before concluding
- As-is recreation: profile doc first, then a column map to the report tables, then recompute one day and compare with the original, then automate

## Workflow
- API calls are rare now: still GET only, write the redacted sample and update the doc
- For flows, one change per session: propose the design, wait for approval, build, validate, commit, then I test
- When a test fails or behaviour differs from `docs/`, fix the doc in the same session
- When a new table is built, add it to the table list in Project

## Notes
- At session start read the handover for the job, plus the Status, Open questions and Next sections of `NOTES.md`, not the whole file
- Log failed attempts (tried, error, fix) and decisions in `NOTES.md`
- At session end, update Status and Next, and the job's handover
- Parallel sessions: each edits only its own files and its own `NOTES.md` section

## Git
- Remote exists on GitHub (public). Never push unless I ask. Never add or change a remote
- Commit on master, no new branches unless I ask. At the end of each step, `git add` only the paths of this job. Never `git add .` or `-A`
- Run `git status` first. If `.env`, `source/`, `samples/` or `*.local.json` are staged, stop and tell me
- Never rewrite history unless I ask

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
