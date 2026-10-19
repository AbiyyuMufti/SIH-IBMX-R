// Keeps a short list of the OEE assets for the machine step (2.5).
// In: the OEE asset list (msg.payload), the message goes on unchanged.
// Out: msg.oeeById = {assetId: {name, isManual, isConfigured}}.
var byId = {};
if (Array.isArray(msg.payload)) {
  msg.payload.forEach(function (o) {
    byId[o.assetId] = {
      name: o.name,
      isManual: o.isManual,
      isConfigured: o.isConfigured
    };
  });
}
msg.oeeById = byId;
return msg;
