# Project
Explore the scripts, Postman collection and Node-RED flows in `source/` for a local API, then write documentation for use in another project (Siemens Insights Hub, Node-RED).

## Goal
Final output: markdown docs in `docs/`: the external APIs that the scripts, Postman collection and Node-RED flows call (endpoints, auth, request/response shapes, how to call each one).

## Folders
- `source/` = my original files (read-only, never edit)
- `samples/` = redacted API responses you create when calling endpoints
- `scripts/` = JS scripts you write to explore the API
- `docs/` = final documentation

## Stack
- Plain JavaScript, ES modules, Node 18+ native fetch
- Scripts in `scripts/`, run with `node`
- Doc examples must be pasteable into Node-RED (function node / http request node)

## Inputs (all in `source/`)
- Postman collection JSON (+ environment file if provided)
- Node-RED flows JSON
- Python files
Treat each as sensitive: may contain tokens or credentials.

## Rules
- Never print or write secrets (tokens, passwords, keys) in docs, logs, or chat
- Secrets live in `.env` only, read via process.env; `.env` stays in .gitignore
- If you find a secret in source files: do not copy it into docs, logs, or chat. Tell me the file and location only, then add a placeholder to `.env` (e.g. `API_TOKEN=`) for me to fill in. We test with it locally
- GET only by default. Ask before any POST/PUT/PATCH/DELETE
- Never modify the original Postman, Node-RED or Python files
- Read Python files only. Never execute them. Re-implement useful calls as JS in `scripts/`
- Node-RED as a server is out of scope: ignore `http in` / `http response` nodes and do not document or call the endpoints Node-RED exposes
- Do not guess credentials. If something is missing, list it and ask me

## Workflow
Phase A: offline, can run unattended (no network, no API calls)
1. Preflight check, then first commit
2. Parse everything in `source/` in one go: Postman, Node-RED outbound calls, Python requests -> `docs/inventory.md` (one row per call: source file, name, method, URL, how auth is built)
3. Auth/secrets audit: for each distinct auth mechanism, list where it comes from, which file and location (never the value), and what is missing. Write `docs/auth-checklist.md`
4. Add empty placeholders to `.env` for each secret/variable found (names only, no values)
5. Update NOTES.md, commit, then STOP and wait for me

Phase B: with me, one at a time
6. I fill in `.env`. Test auth with a single GET, report, wait for me
7. Then call safe GET endpoints one by one, grouped by API area; save redacted responses to `samples/`

Phase C: docs
8. Describe responses, write `docs/` (README index, auth.md, one file per API area, Node-RED outbound calls)

Phase D: updates
9. When I say source files changed: diff against `docs/inventory.md`, update only affected docs, note it in NOTES.md

## Doc format (per endpoint)
Purpose, method, URL, params, headers (auth by name only), example request, example response, gotchas. Use tables and bullets, no filler.
- For Node-RED calls, also record: which flow and node makes the call, what triggers it, and what the flow does with the response

## Notes
- Read `NOTES.md` at the start of every session
- Log every failed attempt in `NOTES.md` (tried, error, fix)
- At session end, update `NOTES.md` with status and next steps
- Node-RED credentials may live in a separate `flows_cred.json` (encrypted). If auth values are missing, list them as missing and ask me

## Git
- Repo is local only. Never push, never add a remote
- At the end of each workflow step, commit: `git add docs scripts NOTES.md CLAUDE.md` then `git commit -m "step N: short description"`
- Never use `git add .` or `git add -A`. Add specific paths only
- Run `git status` before committing. If `.env`, `source/` or `samples/` show up as staged, stop and tell me
- Never rewrite history (no reset --hard, rebase, force, amend) unless I ask