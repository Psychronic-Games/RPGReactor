'use strict';
// Thrall's Settings: Menu System Options (Strak's version, with the font and window size), Accessibility System and
// Controls Config. No calls: the title and the menu open it.
module.exports = () => ({
    key: 'thrallOptions', detect: /module SYSTEM\b[\s\S]*WAIT_MODE_VAR\s*=[\s\S]*class Window_System < Window_Selectable/, plugin: 'RR_ThrallOptions',
    requires: ['RR_ThrallWindows']
});
