'use strict';
// Thrall's menu: Scene Menu ReDux (with its Objectives window), Simple Sort Inventory, and the game's own Scene_Item,
// Scene_Equip, Scene_Status, Scene_File (accounts, the save's database, the locker) and Scene_End's return.
// Events save with Auto_Save.new.
module.exports = () => ({
    key: 'thrallMenu', detect: /class Window_Objectives < Window_Base[\s\S]*class Window_ReDuxMenuStatus < Window_MenuStatus/, plugin: 'RR_ThrallMenu',
    requires: ['RR_ThrallWindows'],
    modules: { Auto_Save: { new: 'DataManager.rrThrallAutoSave?.()' } }
});
