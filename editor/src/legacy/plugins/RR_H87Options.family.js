'use strict';
// Holy87's Options with his Universal Module: the settings screen, and $game_settings, the settings every save
// shares (events and other scripts read and set them).
module.exports = {
    key: 'h87Options', detect: /\$imported\["H87_Options"\]\s*=\s*true/, plugin: 'RR_H87Options',
    globals: { $game_settings: ['(window.$gameSettings || {})', 'any'] },
    classes: { Scene_Options: 'Scene_RRH87Options' },
    objects: { system: { option_enable: '$gameSystem.rrOptionEnable?.(%0, %1)' } }
};
