'use strict';
// Thrall's copy of Falcao's Fog Effects (VX): $game_map.fog(name, opacity, zoom, sx, sy), the double scroll on a switch.
module.exports = {
    key: 'thrallFog', detect: /alias falcaofogSini initialize[\s\S]*\$game_switches\[\d+\]\s*#Fog Scroll/, plugin: 'RR_ThrallFog',
    members: { 'map.fog': ['$.rrFog?.(%*)', 'any'] }
};
