'use strict';
// star's STR33 Active Time Battle with Thrall's battle screen (the flee gauge's turn order list, read from queue_back, is
// Thrall's own): the battle scene; events reach it through the ordinary battle commands.
module.exports = { key: 'thrallATB', detect: /Cache\.system\("queue_back"\)/, plugin: 'RR_ThrallATB', requires: ['RR_ThrallBattlers', 'RR_ThrallSideview'] };
