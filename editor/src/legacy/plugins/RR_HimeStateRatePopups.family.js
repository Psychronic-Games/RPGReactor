'use strict';
// Hime's State Rate Popups: "resist" and "immune" popups on a state that did not land; no calls from events.
module.exports = { key: 'himeStateRatePopups', detect: /\$imported\["TH_StateRatePopups"\]\s*=\s*true/, plugin: 'RR_HimeStateRatePopups' };
