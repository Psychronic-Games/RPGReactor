'use strict';
// BulletXt's Thomas Edison VX as Thrall carries it: lights from event comments. No calls from events.
module.exports = { key: 'thrallEdisonLights', detect: /alias bulletxt_spriteset_map_initalize initialize[\s\S]*class Light_Effect\b/, plugin: 'RR_ThrallLights' };
