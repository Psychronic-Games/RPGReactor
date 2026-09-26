'use strict';
// Galv's Keypad Input: keypad_input opens the keypad, and the event waits for it.
module.exports = {
    key: 'galvKeypad', detect: /class Scene_Keypad\b|\$imported\["Keypad"\]/, plugin: 'RR_GalvKeypad',
    event: { keypad_input: 'this.rrKeypadInput?.()' },
    classes: { Scene_Keypad: 'Scene_RRKeypad' }
};
