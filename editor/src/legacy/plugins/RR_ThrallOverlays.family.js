'use strict';
// Thrall's copy of Hanzo Kimura's Ultimate Overlay Mapping, with its second parallax layer (Par2Map "Parall").
// No calls from events: the switches turn the layers on and off.
module.exports = { key: 'thrallOverlays', detect: /module HK_UOM\b[\s\S]*Par2Switch\s*=/, plugin: 'RR_ThrallOverlays' };
