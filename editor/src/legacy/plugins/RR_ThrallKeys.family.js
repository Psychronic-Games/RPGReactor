'use strict';
// Thrall's Key Module, Gamepad Module and Read Controls: the game's own key configuration drives MZ's buttons.
// Events ask Config.read_input_A … _Z for the icon of a control's first key or button.
const READ = { A: 0, B: 1, C: 2, L: 3, R: 4, X: 5, Y: 6, Z: 7 };
const GAMEPAD = { dash: 0, cancel: 1, confirm: 2, pgup: 3, pgdn: 4, compare: 5, sort: 6, menu: 7, up: 8, left: 9, down: 10, right: 11 };
const NAMES = ['shift', 'escape', 'ok', 'pageup', 'pagedown', 'rgssX', 'rgssY', 'rgssZ', 'up', 'left', 'down', 'right'];

module.exports = {
    key: 'thrallKeys', detect: /module Gamepad\b[\s\S]*def self\.compare\b[\s\S]*def self\.sort\b/, plugin: 'RR_ThrallKeys',
    modules: {
        Config: Object.fromEntries(Object.entries(READ).map(([k, i]) => [`read_input_${k}`, [`($gameSystem.rrReadInput?.(${i}) ?? 854)`, 'number']])),
        Gamepad: Object.assign(
            { 'press?': ['(Input.rrGamepadPressed?.(%0) ?? false)', 'bool'], 'trigger?': ['(Input.rrGamepadTriggered?.(%0) ?? false)', 'bool'], 'repeat?': ['(Input.rrGamepadRepeated?.(%0) ?? false)', 'bool'] },
            Object.fromEntries(Object.entries(GAMEPAD).map(([k, i]) => [k, [String(i), 'number']]))
        ),
        Keys: {
            'press?': ['(Input.rrKeyPressed?.(%0) ?? false)', 'bool'], 'trigger?': ['(Input.rrKeyTriggered?.(%0) ?? false)', 'bool'],
            'repeat?': ['(Input.rrKeyRepeated?.(%0) ?? false)', 'bool'], 'release?': ['(Input.rrKeyReleased?.(%0) ?? false)', 'bool']
        }
    }
};
// For the other ports: the MZ button each Gamepad control drives.
module.exports.BUTTONS = Object.fromEntries(Object.entries(GAMEPAD).map(([k, i]) => [k, NAMES[i]]));
