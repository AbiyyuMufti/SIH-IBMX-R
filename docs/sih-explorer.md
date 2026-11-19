# SIH explorer (local web app)

| At a glance | |
|---|---|
| **What** | A small web app on your PC to try the SIH API step by step on any OEE asset, and to see per EU_OEE_Fact column how it is built, what the live lake holds and what SIH gives |
| **Run** | `node scripts/sih-explorer/server.js`, then open http://localhost:8780 (needs `.env`, `IH_PLATFORM`, Python with polars). Listens on 127.0.0.1 only |
| **Pages** | Overview (process and the call chain), SIH Explorer (SIH asset tree, one step at a time: Answer, Request, Raw JSON), Fact columns (record type, line, day, tick columns: how built, lake values, SIH values, status, notes), Gaps (per call, what is not OK for a connected and a manual line), Summary |
| **Calls** | Read only: GETs, token, `evaluateKPIs` (approved), lake download URLs. The server refuses any other method. Token and secrets never reach the browser; `ActorEmail` is hidden |
| **Data** | Cache in `samples/sih-explorer/` (git-ignored: tree, lake files). Notes per column in `prompt-response/sih-gap-notes.json` (only your text) |
| **Status** | Built 2026-11-19. Tested on the real API: tree (246 assets), 13 steps on B2 Line, Fact columns on GT4 2026-11-17 |

## Files
- `scripts/sih-explorer/server.js`: http server, tree, day window, steps, lake rows, SIH rows, notes.
- `scripts/sih-explorer/steps.js`: the call chain. One entry per call: request and the small answer table.
- `scripts/sih-explorer/columns.js`: the 65 columns: types, kind, SIH calls, how built, status for a connected and a manual line, gap text. Edit here when a gap is closed.
- `scripts/sih-explorer/read-fact.py`: reads EU_OEE_Fact parquet (day files, else the month file) for one day and machine.
- `scripts/sih-explorer/public/`: the pages (plain HTML, CSS, JS).

## Rules worth knowing
- **Connected or manual** comes from `/assets/{id}/config` (`operandSource.good.mode`: CONNECTED or MANUAL). The `isManual` flag of the OEE asset list is true for B2 Line too.
- **Day window**: the site's start hour (Hull 6, others 6 by default, changeable on the page) in the site time zone (`SITE_TZ` in the server). The SIH asset time zones are not reliable (Hull and its lines say Europe/Berlin, Mira says Europe/London); the Request tab shows both.
- **SIH values** on the Fact columns page exist only for the lines the SIH report daily tab builds (B2 Line, GT4): the server runs that tab locally (lake nodes in memory). Other lines show "not built by the SIH tab yet".
- **Lake values**: the day files `EU_OEE_Fact_<day>_*` of the site, else the month file. Files of the last 3 days are downloaded again each time.
