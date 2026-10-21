'use strict';
// Strak's Crafting System (the altar on the loot table's windows): an event opens it with $scene = Scene_Crafting.new.
module.exports = {
    key: 'thrallCrafting', detect: /class Scene_Crafting < Scene_Base[\s\S]*Determine Crafting Cost/, plugin: 'RR_ThrallCrafting',
    scenes: { Scene_Crafting: '(typeof Scene_RRThrallCrafting === "function" && SceneManager.push(Scene_RRThrallCrafting))' },
    classes: { Scene_Crafting: 'Scene_RRThrallCrafting' }
};
