'use strict';
// Yami's Hospital (with its Hospital Prizes add-on): its scene, opened by YES.hospital or by class (Yanfly Shop
// Options' Hospital command, SceneManager.call(Scene_Hospital)).

const OPEN = '(typeof Scene_RRHospital === "function" && SceneManager.push(Scene_RRHospital))';

module.exports = {
    key: 'yesHospital', detect: /\$imported\["YES-Hospital"\]\s*=\s*true/, plugin: 'RR_YamiHospital',
    modules: { YES: { hospital: OPEN } },
    classes: { Scene_Hospital: 'Scene_RRHospital' }
};
