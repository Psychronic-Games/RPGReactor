'use strict';
// Strak's Trinket Interface (the trinket cabinet): an event opens it with $scene = Scene_Trinket.new.
module.exports = {
    key: 'thrallTrinkets', detect: /module CABINET\b[\s\S]*class Scene_Trinket < Scene_Base/, plugin: 'RR_ThrallTrinkets',
    scenes: { Scene_Trinket: '(typeof Scene_RRThrallTrinkets === "function" && SceneManager.push(Scene_RRThrallTrinkets))' },
    classes: { Scene_Trinket: 'Scene_RRThrallTrinkets' }
};
