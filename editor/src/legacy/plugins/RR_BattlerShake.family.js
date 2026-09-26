'use strict';
// "Battler Shakes when hit": a hit battler shakes sideways instead of blinking; no calls from events.
module.exports = { key: 'battlerShake', detect: /alias\s+blink2shake_start\s+start_effect|Shake_X_Max\s*=[\s\S]{0,400}def update_blink/, plugin: 'RR_BattlerShake' };
