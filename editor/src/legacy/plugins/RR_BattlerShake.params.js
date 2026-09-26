'use strict';
// Plugin parameters for RR_BattlerShake from the game's copy of "Battler Shakes when hit" (Sprite_Battler's
// Shake_X_Max, Shake_Y_Max, Shake_Diminish).

function extract({ constants = {} } = {}) {
    const k = (name, d) => (constants['Sprite_Battler::' + name] === undefined ? d : constants['Sprite_Battler::' + name]);
    return {
        shakeX: String(Number(k('Shake_X_Max', 30))),
        shakeY: String(Number(k('Shake_Y_Max', 0))),
        diminish: String(k('Shake_Diminish', true) !== false && k('Shake_Diminish', true) !== null)
    };
}

module.exports = { extract };
