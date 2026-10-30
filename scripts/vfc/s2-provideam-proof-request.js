// Builds the Provideam report request (read-style POST).
// In: proof settings. Out: an HTTP request for one report day.
// Provideam answers HTTP 500 to a body with more than 18 functions.
msg.method = 'POST';
msg.url = msg.proof.url;
msg.headers = {
  'apiKey': msg.proof.apiKey,
  'Content-Type': 'application/json-patch+json',
  'Accept': 'application/json'
};
msg.payload = JSON.stringify(msg.proof.body);
msg._proofStage = 'Provideam report';
node.status({ fill: 'blue', shape: 'dot', text: 'calling Provideam' });
return msg;
