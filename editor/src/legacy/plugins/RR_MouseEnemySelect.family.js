'use strict';
// AwesomeCool's Shaz mouse + Yanfly battle patch: enemies chosen by pointing at them; no calls from events.
module.exports = { key: 'mouseEnemySelect', detect: /def enemySelectionSetup\b/, plugin: 'RR_MouseEnemySelect' };
