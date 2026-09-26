'use strict';
// CSCA's recovery on level up snippet: no calls from events.
module.exports = { key: 'cscaLevelUpRecovery', detect: /alias\s+csca_snippets_lvlup\s+level_up\b/, plugin: 'RR_CscaLevelUpRecovery' };
