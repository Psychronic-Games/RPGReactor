'use strict';
// RR_VxCompat is every VX game's base: its window rules and rrVx drawing methods come before the ports that
// replace them. The detection matches at the very start of the scripts (so it installs first) when they carry
// VX's own Window_Base, with its WLH constant (XP and VX Ace have none).
module.exports = {
    key: 'vxBase', detect: /^(?=[\s\S]*class Window_Base < Window\b[\s\S]{0,400}?\bWLH\s*=\s*24\b)/, plugin: 'RR_VxCompat'
};
