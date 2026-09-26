'use strict';
// Yami's Equipment Learning: an actor's el_gain from a Script command.
module.exports = {
    key: 'yamiEquipLearning', detect: /\$imported\["YES-EquipmentLearning"\]\s*=\s*true/, plugin: 'RR_YamiEquipLearning',
    objects: { actor: { el_gain: '$?.rrElGain?.(%*)' } }
};
