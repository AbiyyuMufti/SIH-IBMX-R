# Project
Build and maintain Node-RED flows for Siemens Insights Hub (Reckitt OEE), based on the API documentation in `docs/`. Test tenant: `reckitt`.

## Status
- API exploration is done. All read-style OEE endpoints are tested; write calls are skipped on purpose
- Done: one VFC flow per site that writes `fact_kpi` and `fact_loss` parquet tables (`flows/vfc-site-hull.json`, see `docs/fact-flows.md`). Hull is checked on the mock only
- Done (mock only): Config tab `flows/vfc-config.json` and the single reference tab `flows/vfc-reference-tables.json` (see `docs/reference-tables.md`)
- Current work: the user checks the Config, reference and Hull flows in the VFC; then the other flows planned from the dashboard design (group 2)
- Read `docs/README.md` first, then only the doc for the area you are working on. Do not re-parse `source/` unless I ask

## Folders
- `source/` = my original files (Postman, flows, Python). Read-only, git-ignored
- `docs/` = API documentation. Behaviour files start with an "At a glance" table
- `scripts/` = JS test and helper scripts. `scripts/vfc/` = function-node code for the VFC flow
- `flows/` = generated flow JSON. `flows/*.local.json` = copies with real credentials, git-ignored
- `prompt-response/` = analysis and question lists for Reckitt, not API docs
- `samples/` = redacted API responses, git-ignored

## Stack
- Plain JavaScript, ES modules, Node 18+ native fetch (scripts only)
- Flow target: Insights Hub Visual Flow Creator (VFC). Function nodes there have NO `fetch`, `require` or `process`. Use `http request` nodes for every API call (a function sets `msg.method/url/headers`, then the http request node runs it)
- One message per day or per asset, collected with a join
- Parquet node types: UTF8 (STRING), BOOLEAN, INT64, DOUBLE, TIMESTAMP_MILLIS. No DATE type: days are text `YYYY-MM-DD`

## Flow build
- The flow JSON is generated: edit `scripts/vfc/*.js` (one file per function node, named `s<stage>-<name>.js`) and `scripts/build-vfc-site-flows.js` (shared helpers in `scripts/lib-flow-builder.js`), then run `node scripts/build-vfc-site-flows.js`. Do not hand-edit the JSON
- The Config tab and the reference tab use `scripts/vfc/c1-config.js`, `scripts/vfc/r<stage>-<name>.js` and `scripts/build-vfc-reference-flows.js`. Shared settings (credentials, sites, asset ids, root folder) live in ONE node, `1.1 CONFIG`, and are read from global context (`glob.get('cfg')`: in the VFC the global context is `glob`, not `global`). Test: `node scripts/test-vfc-flow.js 2026-09-30 mock write file=flows/vfc-reference-tables.json` (the runner runs the Config tab first)
- Layout: columns 260 px, rows 220 px, all positions multiples of 20, side link outs below their node. `validate-flow.js` does not check overlaps yet: check them with the estimate in NOTES.md before commit
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
- Report the longest line and the number of link nodes

## Rules
- Never print or write secrets (tokens, passwords, keys) in docs, logs, commits or chat
- Secrets live in `.env` (read via process.env), git-ignored. If you find one in a file, tell me file and location only
- GET only by default. Ask before any POST/PUT/PATCH/DELETE, except read-style POSTs I already approved (token, `evaluateKPIs`, `evaluate`, `timeModelCategoryDistribution`)
- Never modify `source/`. Never execute Python files
- Do not guess API behaviour. If `docs/` does not cover it, test it (GET) or ask me
- No personal data in docs (emails, user names)
- This repo is public: before every commit check the diff for secrets, asset IDs or customer business detail I have not approved

## Workflow
- Iterate: after each API call or small group, write the redacted sample and update the doc for it, then continue
- For flows, one change per session: propose the design, wait for approval, build, validate, commit, then I test
- When a test fails or behaviour differs from `docs/`, fix the doc in the same session

## Notes
- Read the Status, Open questions and Next sections of `NOTES.md` at the start of a session, not the whole file
- Log failed attempts (tried, error, fix) and decisions in `NOTES.md`
- At session end, update Status and Next

## Git
- Remote exists on GitHub (public). Never push unless I ask. Never add or change a remote
- Commit at the end of each step with specific paths: `git add docs scripts flows NOTES.md CLAUDE.md`. Never `git add .` or `-A`
- Run `git status` first. If `.env`, `source/`, `samples/` or `*.local.json` are staged, stop and tell me
- Never rewrite history unless I ask
