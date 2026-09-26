'use strict';
// Mr. Bubble's Dismantle Items (with Roninator2's quantity add-on, which the port carries): its script calls, and
// its scene where events or other scripts (Yanfly Shop Options' Dismantle command) call it by class.

module.exports = {
    key: 'bubsDismantle', detect: /\$imported\["BubsDismantle"\]\s*=/, plugin: 'RR_DismantleItems',
    event: {
        call_dismantle_scene: 'this.rrCallDismantle?.()', open_dismantle_shop: 'this.rrCallDismantle?.()',
        remove_dismantle_mask: 'this.rrRemoveDismantleMask?.(%*)', remove_all_dismantle_masks: 'this.rrRemoveAllDismantleMasks?.()',
        get_dismantle_count: ['(this.rrDismantleCount?.(%*) ?? null)', 'number'], get_all_dismantle_count: ['(this.rrAllDismantleCount?.() ?? 0)', 'number']
    },
    classes: { Scene_DismantleShop: 'Scene_RRDismantleShop' }
};
