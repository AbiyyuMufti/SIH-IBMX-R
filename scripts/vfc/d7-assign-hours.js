// Gives every hour of the day a product and an order.
// In: msg.hours, msg.valueHours, msg.productList (absent when no values).
// Out: hour.product and hour.order on every hour, and msg.hourInfo (hour
// start in ms -> product and order) for the stop rows.
var valueHours = msg.valueHours || { PRODUCT: {}, ORDER: {} };
var master = msg.productList || [];

// The value (a product name or an order) that has parts in this hour.
function valueAt(kind, ms) {
  var names = Object.keys(valueHours[kind]);
  var found = null;
  names.forEach(function (n) {
    if (found === null && valueHours[kind][n].indexOf(ms) >= 0) {
      found = n;
    }
  });
  return found;
}

// An hour without parts takes the value of the hour before it. Hours
// before the first value take the first value that follows.
function fill(list) {
  var last = null;
  list.forEach(function (item, i) {
    if (item === null) {
      list[i] = last;
    } else {
      last = item;
    }
  });
  var next = null;
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i] === null) {
      list[i] = next;
    } else {
      next = list[i];
    }
  }
  return list;
}

// Part name: the description when there is one, else the name. The key is
// the product code, else the name.
function productOf(productName) {
  if (productName === null) {
    return null;
  }
  var record = master.filter(function (p) {
    return p.name === productName;
  })[0];
  var rec = record || {};
  return {
    part_name: rec.description || productName,
    product_key: rec.code || productName,
    per_minute: rec.perMinute === undefined ? null : rec.perMinute
  };
}

var times = msg.hours.map(function (h) {
  return Date.parse(h.time);
});
var products = fill(times.map(function (ms) {
  return valueAt('PRODUCT', ms);
}));
var orders = fill(times.map(function (ms) {
  return valueAt('ORDER', ms);
}));

msg.hourInfo = {};
msg.hours.forEach(function (hour, i) {
  hour.product = productOf(products[i]);
  hour.order = orders[i];
  msg.hourInfo[String(times[i])] = {
    product: hour.product,
    order: hour.order
  };
});
delete msg.valueHours;
delete msg.productList;
delete msg.values;
return msg;
