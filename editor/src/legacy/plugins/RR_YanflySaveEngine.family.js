'use strict';
// Yanfly's Ace Save Engine (with Galv's confirmation add-on and the add-on naming the first slot, read by its
// .params.js): no calls, the plugin lays out Scene_Save and Scene_Load.
module.exports = { key: 'yeaSaveEngine', detect: /\$imported\["YEA-SaveEngine"\]\s*=\s*true/, plugin: 'RR_YanflySaveEngine' };
