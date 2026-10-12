'use strict';
// Thrall's Fast Travel: the world map scene the World Map's event opens with $scene = Scene_Travel.new.
module.exports = {
    key: 'thrallTravel', detect: /class Window_Travel < Window_Selectable[\s\S]*class Scene_Travel < Scene_Base/, plugin: 'RR_ThrallTravel',
    scenes: { Scene_Travel: '(typeof Scene_RRThrallTravel === "function" && SceneManager.push(Scene_RRThrallTravel))' },
    classes: { Scene_Travel: 'Scene_RRThrallTravel' }
};
