'use strict';
// Thrall's title: Discovery Title Screen (with the Erase and Settings commands Thrall added), the game's
// Scene_Title edits (its config, font and window size) and Main.
module.exports = {
    key: 'thrallTitle', detect: /module CustomTitle\b[\s\S]*ERASE_GRAPHICS[\s\S]*SETTINGS_GRAPHICS/, plugin: 'RR_ThrallTitle'
};
