const chrono = require('chrono-node');

console.log(chrono.parseDate('An appointment on Sep 12-13'))
// Fri Sep 12 2014 12:00:00 GMT-0500 (CDT)

console.log(chrono.parse('An appointment on Sep 12-13'))