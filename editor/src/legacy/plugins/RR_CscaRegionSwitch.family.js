'use strict';
// CSCA RegionSwitch: map note tags only, no calls from events.
module.exports = { key: 'cscaRegionSwitch', detect: /\$imported\["CSCA-RegionSwitch"\]\s*=\s*true/, plugin: 'RR_CscaRegionSwitch' };
