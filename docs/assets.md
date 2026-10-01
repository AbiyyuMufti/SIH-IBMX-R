# Finding assets and the hierarchy

Behaviour: get the asset IDs every other call needs, and understand how assets are organised (enterprise > region > site > area > line > machine).
Auth: Bearer token for all calls, see [auth.md](auth.md). Gateway: `https://gateway.eu1.mindsphere.io`. Tested 2026-10-02 on the `reckitt` tenant with the API technical user.

## Which call to use
| You want | Use | Service |
|---|---|---|
| The assets that have OEE (lines and machines you can ask OEE questions about) | `GET /api/oee/v3/assets` | OEE |
| The full tree (sites, areas, lines, machines) with parents | `GET /api/assetmanagement/v3/assets` (build the tree from `parentId`) | Asset Management |
| Children of one asset | `GET /api/assetmanagement/v3/assets?filter={"parentId":"<id>"}` | Asset Management |
| Alert thresholds for an OEE asset | `GET /api/oee/v3/assets/{assetId}` | OEE |
| How OEE is set up for an asset | `GET /api/oee/v3/assets/{assetId}/config` | OEE, see [config-and-master-data.md](config-and-master-data.md) |

Numbers in this tenant: **246 assets** in Asset Management, **44 of them** also appear in the OEE list.

## The hierarchy (matches the tree in the Insights Hub UI)
Built from `parentId` in the Asset Management list. `[OEE]` = also in the OEE list.
```
reckitt (basicenterprise)
  EU (basicarea)
    Chartres, Hull, Mira, NMD, Nottingham, Tuzla, Weinheim   (basicsite)
      Hull
        Blisters (basicarea)
          GT4 [OEE]  (GT4_Equipment)
            AntaresVisionSystem, Cartoner, CaseTaper, Checkweigher, DominoCoder,
            FeedEquipment, HeatTunnel, PrintApply, ShrinkWrapper, Thermoformer   (not OEE)
          Foiler 2, S1, T1, T2, Uhlmann   (ProductionLine)
        Bottles (basicarea)
          B1, B4, B5, B6   (ProductionLine)
          B2 Line [OEE]  (ProductionLine)
            01 DePalletiser, 02 Filler, 03 Labeller, 04 Cartoner,
            05 Antares, 06 CasePacker, 07 Palletiser   (all [OEE])
        Sachets, SCD, zzConnectivity   (basicarea; ProductionLines inside)
        Test Line (OEE_Prerequisites)   (test copies: "B2", "GT4", "To Be B2" with 01_ .. 07_ machines, Manual_OEE_* assets)
  NA (basicarea): BMD, SLC, STP, TLPN
```
Asset type names (`typeId`, its last segment): sites `basicsite`, areas `basicarea`, lines `ProductionLine`, B2 machines `B2_Line_<Machine>_Asset_OEE_Automatic`, GT4 machines `GT4_Equipment`.

Things to know about the hierarchy:
- **Names are not unique.** Two assets are called `GT4` (one `basicarea` under Test Line, one `GT4_Equipment` under Blisters). `B2 Line` machines exist twice, as `02 Filler` under `B2 Line` and as `02_Filler` under `Test Line > To Be B2`. Always use `assetId`.
- **Sites are not OEE assets.** `Hull` is only in Asset Management. See "Site level" below.
- Only `GT4` itself is OEE-enabled, not its 10 machines. For `B2 Line`, the line and all 7 machines are.

---

## OEE service

### GET /api/oee/v3/assets (Tested)
| Item | Value |
|---|---|
| Purpose | List the assets set up for OEE |
| Method | `GET` |
| URL | `https://gateway.eu1.mindsphere.io/api/oee/v3/assets` |
| Params | None have an effect. `size` and `page` were tried (`size=5`, `page=0/1/2`) and ignored: always all 44 assets. Not tried: `filter`, `sort` (used in the source flows) |
| Headers | `Authorization: Bearer <token>`, `Accept: application/json` |
| Result | HTTP 200 in about 0.35 s, 44 assets |

**Example request (Node-RED function node, then an `http request` node set to "use `msg.method`", return "a parsed JSON object")**
```js
msg.method = "GET";
msg.url = "https://gateway.eu1.mindsphere.io/api/oee/v3/assets";
msg.headers = {
  "Authorization": "Bearer " + flow.get("access_token_OEE"),
  "Accept": "application/json"
};
msg.payload = null;
return msg;
```

**Example response** (IDs redacted; `msg.payload` is the array itself)
```json
[
  {
    "assetId": "<32-char hex id>",
    "name": "Corniani-3",
    "description": "<free text, may be empty>",
    "isManual": true,
    "isConfigured": true,
    "reasonTreeId": "<32-char hex id>"
  }
]
```
| Field | Type | Meaning |
|---|---|---|
| `assetId` | string (32 hex chars) | Asset ID. Same ID as in Asset Management |
| `name` | string | Asset name (not unique across the tenant, see above) |
| `description` | string | Free text. Empty for 14 of 44 |
| `isManual` | boolean | `true` for 39 of 44. Presumably "accepts manual input"; not confirmed |
| `isConfigured` | boolean | `true` for 38 of 44. Presumably "OEE setup is complete"; not confirmed |
| `reasonTreeId` | string | Reason tree of the asset, see [config-and-master-data.md](config-and-master-data.md). Missing on 6 of 44 |

**Gotchas**
- Plain JSON array, no `_embedded`, no `page`, no total count, and no paging. All assets arrive in one response.
- No parent information. To place an asset in the tree, match its `assetId` against the Asset Management list.

### GET /api/oee/v3/assets/{assetId} (Tested)
| Item | Value |
|---|---|
| Purpose | Per-asset OEE alert thresholds (the only content returned) |
| Method and URL | `GET https://gateway.eu1.mindsphere.io/api/oee/v3/assets/{assetId}` |
| Tested on | `B2 Line`, `GT4`, `02 Filler`: HTTP 200 in about 0.3 s |
| Not an OEE asset (`Hull`) | HTTP **404** `{"errors":[{"code":"mdsp.core.oee.getAsset", ..., "message":"Asset with id <id> not found"}]}` |

**Example response**
```json
{
  "assetId": "<id>",
  "thresholds": {
    "warnings": [ {"name":"OEE","value":70}, {"name":"Availability","value":70}, {"name":"Performance","value":70}, {"name":"Quality","value":70} ],
    "errors":   [ {"name":"OEE","value":30}, {"name":"Availability","value":30}, {"name":"Performance","value":30}, {"name":"Quality","value":30} ]
  }
}
```
Meaning (presumed): KPI percent values below the `warnings` / `errors` value are shown as warning / error in the OEE app. Same values were seen on `B2 Line`.

**Gotchas**
- It does not return the name or the type. Name and flags come from the list call above.
- Error bodies use `{"errors":[{"code","logref","message"}]}`.

---

## Asset Management service

### Required header: `Accept: application/hal+json`
This service **fails with HTTP 500 and "No acceptable representation"** if you send `Accept: application/json`. Send `application/hal+json` (or no `Accept` header). This is different from the OEE service.

### GET /api/assetmanagement/v3/assets (Tested)
| Item | Value |
|---|---|
| Purpose | List all assets in the tenant, with parent and type |
| Method and URL | `GET https://gateway.eu1.mindsphere.io/api/assetmanagement/v3/assets` |
| Params | `size` (page size, 200 used), `page` (0-based), `filter` (JSON string, for example `{"parentId":"<id>"}`, tested), `sort` (not tested) |
| Headers | `Authorization: Bearer <token>`, `Accept: application/hal+json` |
| Result | HTTP 200 in about 1.6 s for `size=200`: 246 assets over **2 pages** |

**Example request**
```js
msg.method = "GET";
msg.url = "https://gateway.eu1.mindsphere.io/api/assetmanagement/v3/assets?size=200&page=" + (msg.page || 0);
msg.headers = {
  "Authorization": "Bearer " + flow.get("access_token_OEE"),
  "Accept": "application/hal+json"
};
msg.payload = null;
return msg;
```
Loop until `msg.payload.page.number + 1 >= msg.payload.page.totalPages`.

**Response shape**
```json
{
  "_embedded": { "assets": [ { "assetId": "...", "name": "...", "parentId": "...", "typeId": "...", "...": "..." } ] },
  "_links": { "first": {}, "self": {}, "next": {}, "last": {} },
  "page": { "size": 200, "totalElements": 246, "totalPages": 2, "number": 0 }
}
```
Fields on each asset: `assetId`, `tenantId`, `name`, `etag`, `externalId`, `t2Tenant`, `subTenant`, `description`, `timezone`, `twinType`, `parentId`, `typeId`, `location`, `fileAssignments`, `variables`, `aspects`, `locks`, `deleted`, `sharing`, `_links`. The ones you need for the tree are `assetId`, `name`, `parentId`, `typeId`.

**Build the tree (function node, after collecting all pages into `msg.assets`)**
```js
const ids = new Set(msg.assets.map(a => a.assetId));
const byParent = {};
for (const a of msg.assets) (byParent[a.parentId] ||= []).push(a);
const build = (a) => ({ id: a.assetId, name: a.name, type: a.typeId, children: (byParent[a.assetId] || []).map(build) });
// top of the tree = assets whose parent is not in the list
msg.payload = msg.assets.filter(a => !ids.has(a.parentId)).map(build);
return msg;
```
(The top asset `reckitt` does have a `parentId` value, but that parent is not in the list, so "parent not in the list" is how the top is found.)

### GET /api/assetmanagement/v3/assets/root (Tested)
HTTP 200. Returns the root asset (`reckitt`, type `basicenterprise`) with its full details. Same fields as above plus `hierarchyPath`.

### GET /api/assetmanagement/v3/assets/{assetId} (Tested on Hull)
HTTP 200. One asset with `hierarchyPath` (the chain of ancestors) and `_links` including `parent` and `children`. Use `hierarchyPath` to get the path of an asset in one call instead of walking the list.

### GET /api/assetmanagement/v3/assets?filter={"parentId":"<id>"} (Tested)
HTTP 200. Children of one asset (`Hull` returned `Blisters, Bottles, Sachets, SCD, Test Line, zzConnectivity`). The filter must be sent URL-encoded. Same response shape as the full list.

### GET /api/assetmanagement/v3/assets/{assetId}/aspects (Tested)
HTTP 200, HAL list (`_embedded.aspects`, `page`). For `B2 Line` it lists 5 aspects: `OEE_Hourly_Entry`, `OEE_MachineState`, `OEE_Prerequisites`, `OEE_Status_Output`, `PlantContext`. `Hull` has 1. Aspect names are what the time series API needs (`/timeseries/{assetId}/{aspect}`).

---

## Site level (Hull)
| Question | Answer (tested) |
|---|---|
| Is `Hull` an OEE asset? | **No.** `GET /api/oee/v3/assets/{hull}` returns 404 "Asset with id ... not found". It is not in the OEE list. |
| What does `GET /api/oee/v3/assets/{hull}/config` return? | HTTP **200** with an empty config `{"operandSource":{},"hasManuals":false}`. Do not read this as "configured". |
| What can I get for `Hull`? | Asset Management only: its details and `hierarchyPath`, its children (6 areas), and its aspects (1). |
| How do I get OEE for a site? | Not available as one number. The source flows (`Line OEE Aggregator`) list the child assets, then ask OEE KPIs per line or machine and combine the results themselves. Whether the KPI call can roll up a whole site with `recursive: true` is not tested. |

Suggested way to work at site level: `Hull` > children (areas) > children (lines) > keep only assets in the OEE list (match `assetId`) > per-line calls.
