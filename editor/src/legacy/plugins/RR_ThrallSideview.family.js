'use strict';
// Enu's Sideview Battle System 3.3 as Thrall set it up (the enemy sprite variants are Thrall's own): battle presentation,
// no calls from events.
module.exports = { key: 'thrallSideview', detect: /names = \["\$ThrallA","\$ThrallB","\$ThrallC","\$ThrallD"/, plugin: 'RR_ThrallSideview', requires: ['RR_ThrallBattlers'] };
