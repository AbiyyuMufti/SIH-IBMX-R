// Builds the two items of one asset: its machine name row and its calendar.
// In: msg.asset, msg.h, msg.amFail, msg.skip, the OEE config response.
// Out: msg.payload = {machine, calendar}. machine = {name, failed, skipped,
// rows}. calendar = {name, value (the calendar id), failed, skipped}.
var asset = msg.asset;
var config = msg.payload || {};
var machine = {
  name: asset.name,
  failed: null,
  skipped: null,
  rows: []
};
var calendar = {
  name: asset.name,
  value: null,
  failed: null,
  skipped: null
};

if (msg.amFail) {
  machine.failed = msg.amFail;
  calendar.failed = msg.amFail;
} else if (msg.skip === 'excluded') {
  machine.skipped = asset.name + ' excluded';
  calendar.skipped = asset.name + ' excluded';
} else {
  machine.rows.push({
    site_name: msg.h.site,
    area: msg.h.area,
    dept: msg.h.area,
    machine_name: msg.h.asset_name,
    product_type: null,
    unique_machine_name: asset.id,
    loaded_at: msg.loadedAt
  });
  if (msg.skip === 'not configured') {
    calendar.skipped = asset.name + ' not configured';
  } else if (msg.statusCode !== 200) {
    calendar.failed = asset.name + ': config failed, HTTP ' + msg.statusCode;
  } else {
    calendar.value = config.calendarId || null;
  }
}

msg.payload = {
  machine: machine,
  calendar: calendar
};
return msg;
