# Provideam Swagger endpoint inventory

Generated from `samples/provideam/swagger.json` by
`node scripts/helper-swagger-markdown.js`.

| Method | Path | Tag | Summary | Parameters | Allowlisted | Status |
|---|---|---|---|---|---|---|
| GET | `/api/v1/account/getinfo` | Account |  | token (query, string) | No | inferred only |
| GET | `/api/v1/account/getsamlsettings` | Account |  |  | No | inferred only |
| POST | `/api/v1/account/login` | Account |  |  | No | inferred only |
| POST | `/api/v1/account/refresh` | Account |  | token (query, string) | No | inferred only |
| GET | `/api/v1/area/get` | Area | Get Areas | PlantID (query, required, integer (int32)); FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)); Active (query, boolean) | Yes | verified live |
| GET | `/api/v1/area/getoperators` | Area | Get Operators | AreaID (query, integer (int32)); FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)); Active (query, boolean) | No | inferred only |
| GET | `/api/v1/area/getparts` | Area | Get Parts | AreaID (query, required, integer (int32)); FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)); Active (query, boolean) | No | inferred only |
| GET | `/api/v1/area/gettools` | Area | Get Tools | AreaID (query, required, integer (int32)); FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)); Active (query, boolean) | No | inferred only |
| POST | `/api/v1/area/setpart` | Area | Set Part | areaID (query, required, integer (int32)) | No | inferred only |
| GET | `/api/v1/color/getcolorpalettes` | Color | Get Color Palettes by Plant | PlantID (query, required, integer (int32)); FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)) | No | inferred only |
| GET | `/api/v1/contactlist/get` | ContactList | Get Contacts List by Plant | PlantID (query, integer (int32)); FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)) | No | inferred only |
| GET | `/api/v1/contactlist/getbymachine` | ContactList | Get Contacts List by Machine | MachineID (query, integer (int32)); FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)) | No | inferred only |
| GET | `/api/v1/dictionary/get` | Dictionary | Get Dictionary by ID | dictionaryId (query, integer (int32)) | Yes | verified live |
| GET | `/api/v1/licence/get` | Licence | Get License |  | No | inferred only |
| GET | `/api/v1/machine/get` | Machine | Get Machines | AreaID (query, required, integer (int32)); FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)); Active (query, boolean) | Yes | verified live |
| GET | `/api/v1/machine/getmachinecurrentvalues` | Machine | Get Machine Current Values. Requires Machine access. | machineID (query, integer (int32)) | Yes | verified live |
| GET | `/api/v1/machine/getmachineparts` | Machine | Get Machine Parts | MachineID (query, integer (int32)); FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)); Active (query, boolean); ReturnMacPartRef (query, boolean) | Yes | verified live |
| GET | `/api/v1/machine/getmachineschdowntimes` | Machine | Get Machine ScheduledDowntimes | MachineID (query, integer (int32)); UTCStartDateTime (query, string (date-time)); UTCEndDateTime (query, string (date-time)); FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)); Active (query, boolean) | Yes | verified live |
| GET | `/api/v1/machine/getmachinesettings` | Machine | Get Machine Settings | machineID (query, integer (int32)) | Yes | verified live |
| GET | `/api/v1/machine/getmachinestations` | Machine | Get Machine Stations | MachineID (query, integer (int32)); FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)); Active (query, boolean) | Yes | verified live |
| GET | `/api/v1/machine/getmachinetools` | Machine | Get Machine Tools | MachineID (query, integer (int32)); partID (query, integer (int32)); FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)); Active (query, boolean) | Yes | verified live |
| GET | `/api/v1/machine/getmodegroups` | Machine | Get Mode Groups | MachineID (query, integer (int32)); FilterName (query, string) | Yes | verified live |
| GET | `/api/v1/machine/getmodes` | Machine | Get Modes | MachineID (query, integer (int32)); FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)); Active (query, boolean) | Yes | verified live |
| GET | `/api/v1/machine/getmodesbymodegroup` | Machine | Get Modes filtered by Mode Group | MachineID (query, required, integer (int32)); Grouping (query, required, string); FilterDescription (query, string); Active (query, boolean) | No | inferred only |
| GET | `/api/v1/machine/getmodesbymodesubgroup` | Machine |  | MachineID (query, required, integer (int32)); Grouping (query, required, string); FilterDescription (query, string); Active (query, boolean) | No | inferred only |
| GET | `/api/v1/machine/getmodesubgroups` | Machine |  | MachineID (query, integer (int32)); FilterName (query, string) | Yes | verified live |
| GET | `/api/v1/machine/getprodshifts` | Machine | Get Prod Shifts | machineId (query, integer (int32)) | Yes | verified live |
| GET | `/api/v1/machine/getshifts` | Machine | Get Shifts | machineId (query, integer (int32)) | Yes | verified live |
| POST | `/api/v1/machine/setmachinepartstdtime` | Machine | Set Machine Part StdTime | machineID (query, required, integer (int32)) | No | inferred only |
| POST | `/api/v1/machine/setmachineschdowntime` | Machine | Set Machine Scheduled Downtime | machineID (query, required, integer (int32)) | No | inferred only |
| POST | `/api/v1/machine/setmachinesettings` | Machine | Set Machine Settings | machineID (query, required, integer (int32)) | No | inferred only |
| POST | `/api/v1/machine/updatemachinecurrentvalues` | Machine | Update Machine Current Values. Requires Machine Admin access. |  | No | inferred only |
| GET | `/api/v1/mode/getmodetypes` | Mode | Get Mode Types |  | Yes | verified live |
| GET | `/api/v1/plant/getall` | Plant |  | FilterName (query, string); Skip (query, integer (int32)); Take (query, integer (int32)); Active (query, boolean) | Yes | verified live |
| POST | `/api/v1/report/currentstatus` | Report | Current Status Report |  | No | inferred only |
| GET | `/api/v1/report/getavailablefields` | Report | Get Available Fields | dataSetType (query, string) | Yes | verified live |
| GET | `/api/v1/report/getavailablefunctions` | Report | Get Available Functions | dataSetType (query, string) | Yes | verified live |
| GET | `/api/v1/report/getavailablelosses` | Report | Get Available Losses | dataSetType (query, string) | Yes | verified live |
| GET | `/api/v1/report/getavailableobjects` | Report | Get Available Objects | dataSetType (query, string) | Yes | verified live |
| GET | `/api/v1/report/getavailableperiods` | Report | Get Available Periods | dataSetType (query, string) | Yes | verified live |
| POST | `/api/v1/report/objectbyperiod` | Report | Object By Period Report |  | Yes | inferred only |
| POST | `/api/v1/report/objectbyperiodandloss` | Report | Object By Period And Loss Report |  | Yes | inferred only |
| POST | `/api/v1/report/objectmodelog` | Report | Object Mode Log Report |  | Yes | inferred only |
| POST | `/api/v1/report/objectyieldlog` | Report | Object Yield Log Report |  | Yes | inferred only |
| POST | `/api/v1/report/periodbyobject` | Report | Period By Object Report |  | Yes | inferred only |
| POST | `/api/v1/report/periodbyobjectandloss` | Report | Period By Object And Loss Report |  | Yes | inferred only |
| POST | `/api/v1/report/userview/userview` | Report | User View Report |  | No | inferred only |
| POST | `/api/v1/services/get` | Services |  |  | No | inferred only |
| POST | `/api/v1/services/start` | Services |  | serviceId (query, integer (int32)) | No | inferred only |
| POST | `/api/v1/services/stop` | Services |  | serviceId (query, integer (int32)) | No | inferred only |
| GET | `/api/v1/shift/getshift` | Shift | Get Shift | shiftProfileId (query, integer (int32)); active (query, boolean) | Yes | verified live |
| GET | `/api/v1/shift/getshiftstartdate` | Shift | Get Shift Start Date | machineId (query, integer (int32)) | Yes | verified live |
| GET | `/api/v1/tool/gettoolpart` | Tool |  | partId (query, integer (int32)) | No | inferred only |
| GET | `/api/v1/workcell/get` | WorkCell |  | plantId (query, integer (int32)); areaId (query, integer (int32)) | Yes | verified live |
