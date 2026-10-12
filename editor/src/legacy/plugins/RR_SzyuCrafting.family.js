'use strict';
// Szyu's Crafting System: the crafting scene, a book's recipes changed from an event, and the notes read again.
module.exports = {
    key: 'szyuCrafting', detect: /class Scene_Crafting < Scene_ItemBase[\s\S]*def load_crafting_notetags_sz/, plugin: 'RR_SzyuCrafting',
    objects: {
        record: { add_recipe: 'window.RRSzyuCrafting?.addRecipe($, %0)', remove_recipe: 'window.RRSzyuCrafting?.removeRecipe($, %0)' }
    },
    modules: { DataManager: { load_crafting_item_notetags: 'DataManager.rrLoadCraftingNotetags?.()' } },
    classes: { Scene_Crafting: 'Scene_RRSzyuCrafting' }
};
