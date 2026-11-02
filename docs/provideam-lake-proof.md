# Provideam API: one-report VFC proof

| At a glance | |
|---|---|
| **Goal** | Prove the VFC can call the Provideam API directly and get report rows back. Writing to the lake comes later |
| **Scope** | One report (saved body 23, New Plan OPT, built into the flow), one day, rows shown in the debug sidebar. No schedule, no lake write |
| **Provideam call** | `POST https://rb-api.provideam.com/api/v1/Report/ObjectByPeriod`, header `apiKey`, `Content-Type: application/json-patch+json`, period `pdDay` = `[<day>T00:00:00]` |
| **Flow** | `flows/vfc-provideam-lake-proof.json`, tab `Provideam API proof` (file name kept from the lake version) |
| **Build** | `node scripts/build-vfc-provideam-proof.js` |
| **Offline check** | `node scripts/validate-flow.js flows/vfc-provideam-lake-proof.json` and `node scripts/test-vfc-provideam-proof.js` (checks the built-in body equals `docs/provideam-samples/23-new-plan-opt-report.md`) |

## Settings

In `1.1 Load proof settings`:

- `PROVIDEAM_API_KEY`: the only value you must fill in.
- `DAY`: `YYYY-MM-DD`, empty = yesterday (UTC date).

No Config tab run is needed. Do not commit or share a filled-in export: the
key is in the function code.

## Run

Import the flow, click `Run Provideam proof`. Success: `Show report rows` in
the debug sidebar shows `{report, day, rowCount, rows}` (about 30 rows for a
normal Hull day), and the node status of `1.3` shows the row count.

Failures show `FAILED <stage> <report> <day>: <reason>` in `Proof failure`
(no API key).

## What this proves and what it does not

- Proves: the VFC `http request` node can reach `rb-api.provideam.com` with
  the API key and gets the report back.
- Not proven offline: whether the VFC allows outbound calls to this host. Only
  the run in the VFC shows it.
- Gotchas:
  - A body with more than 18 `functions` returns HTTP 500 (reports 15-22).
    Report 23 has 9.
  - Large reports (Nottingham monthly run rates: 19,906 rows) have not been
    tried in the VFC; keep the 2 MB context limit and the about-50 s per
    message limit in mind for the real flow.
