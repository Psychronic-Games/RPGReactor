//=============================================================================
// reactor_features.js - which of Reactor's own additions a game uses
//
// Database > Reactor Features switches off an addition a plugin already
// provides; the game asks here before doing it:
//
//   ReactorFeatures.on("quests")       true unless the project turned it off
//
// The flag each feature reads from System.json and its default (what a
// project that never touched it gets, which is how Reactor always behaved).
// The editor's registry (editor/src/ReactorFeatures.js) has the labels and
// the plugins known to do the same job; a test keeps the two in step. An id
// not listed here is on. docs/REACTOR-FEATURES.md says how one is added.
//=============================================================================

(function(root) {
    "use strict";

    const FLAGS = {
        classEquipSlots: ["rrFeatures.classEquipSlots", true],
        quests: ["rrFeatures.quests", true],
        mapLighting2D: ["rrFeatures.mapLighting2D", true],
        unsellableItems: ["rrFeatures.unsellableItems", true],
        enemyRanges: ["rrFeatures.enemyRanges", true],
        spriteTransforms: ["rrFeatures.spriteTransforms", true],
        mapBattles: ["rrFeatures.mapBattles", true],
        equipSlotLayouts: ["rrFeatures.equipSlotLayouts", true],
        higherLimits: ["rrHigherLimits", false],
        multiFrames: ["rrMultiFrames", false],
        skipTitle: ["rrSkipTitle", false]
    };

    const RF = root.ReactorFeatures = root.ReactorFeatures || {};
    RF.FLAGS = FLAGS;

    /** Whether a feature is on: its System.json flag, else its default. `system` defaults to $dataSystem. */
    RF.on = function(id, system) {
        const entry = FLAGS[id];
        if (!entry) return true;
        let value = system !== undefined ? system : (typeof $dataSystem !== "undefined" ? $dataSystem : null);
        for (const key of entry[0].split(".")) {
            value = value && typeof value === "object" ? value[key] : undefined;
        }
        return value === undefined || value === null ? entry[1] : !!value;
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
