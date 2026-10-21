'use strict';
// Hollow's Simple Message Busts (often filed under Galv's name): busts for § face names; no calls from events.
module.exports = { key: 'hollowMessageBusts', detect: /module HMB\b[\s\S]*BUST_SYMBOL\s*=/, plugin: 'RR_HollowMessageBusts' };
