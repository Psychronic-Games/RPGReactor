'use strict';
// Pinnacle's title: its Scene_Title (the Tutorial command) and Window_TitleCommand edits. No event calls.
module.exports = {
    key: 'pinnacleTitle', detect: /def command_tutorial\s*\n\s*DataManager\.setup_new_game\(/, plugin: 'RR_PinnacleTitle',
    requires: ['RR_PinnacleWindows']
};
