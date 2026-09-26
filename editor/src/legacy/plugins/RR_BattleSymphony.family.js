'use strict';
// Yami's Battle Symphony (with its add-ons Enemy Charset, Visual Effect, Holder Battlers, Fancy Death, ShadowLurk's
// Battler Orientation and the durability damage scale, which the port carries) and Soulpour's Animated Battlers:
// battle presentation only, no calls from events.
module.exports = [
    { key: 'yamiBattleSymphony', detect: /\$imported\["YES-BattleSymphony"\]\s*=\s*true/, plugin: 'RR_BattleSymphony' },
    { key: 'soulpourAnimatedBattlers', detect: /module\s+Soulpour\s*\n\s*module\s+AnimatedBattlers\b/, plugin: 'RR_SoulpourAnimatedBattlers' }
];
