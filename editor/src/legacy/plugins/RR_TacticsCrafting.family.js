'use strict';
// Mr. Bubble's Tactics Ogre PSP Crafting System: its script call, and its scene where events or other scripts
// (Yanfly Shop Options' Build command) call it by class.

module.exports = {
    key: 'bubsTOCrafting', detect: /\$imported\["BubsTOCrafting"\]\s*=/, plugin: 'RR_TacticsCrafting',
    event: { call_tocrafting_scene: 'this.rrCallTOCrafting?.(%*)', open_tocrafting_shop: 'this.rrCallTOCrafting?.(%*)' },
    classes: { Scene_TOCrafting: 'Scene_RRTOCrafting' }
};
