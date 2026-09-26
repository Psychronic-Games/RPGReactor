'use strict';
// FSE's HP Color Controller: no calls, the plugin colours HP text and bars.
module.exports = { key: 'hpColorController', detect: /module HPCONTROL\b[\s\S]*def hpbar_color1/, plugin: 'RR_HpColorController' };
