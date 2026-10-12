'use strict';
// Thrall's Pain System: the Pain menu (Scene_Heat), opened from the map ($scene = Scene_Heat.new replaces the map scene).
module.exports = {
    key: 'thrallPain', detect: /class Scene_Heat < Scene_Base/, plugin: 'RR_ThrallPain',
    scenes: { Scene_Heat: '(typeof Scene_ThrallHeat === "function" && SceneManager.goto(Scene_ThrallHeat))' },
    classes: { Scene_Heat: 'Scene_ThrallHeat' }
};
