'use strict';
// Molegato's Variable Quests (Pinnacle's DIARIO, its Guide): the scene, opened by class.
module.exports = {
    key: 'molegatoQuests', detect: /\$imported\['Molegato-VarQuests'\]\s*=\s*true/, plugin: 'RR_MolegatoQuests',
    classes: { Scene_Quests: 'Scene_RRMolegatoQuests' }
};
