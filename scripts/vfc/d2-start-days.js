// Hands the inject payload back after the site setup.
// In: the message of the site setup, msg.trigger = the payload of the inject.
// Out: msg.payload = that payload, for the day list.
return {
  payload: msg.trigger
};
