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
