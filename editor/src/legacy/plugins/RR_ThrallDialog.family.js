'use strict';
// Zeriab's Dialog System (VX): a frame for dialogs; nothing in the events opens one.
module.exports = () => ({ key: 'thrallDialog', detect: /class Dialog\b[\s\S]*STARTING_Z_VALUE = \d+/, plugin: 'RR_ThrallDialog' });
