'use strict';
// Strak's Shard Interface: an event opens the shard bench with $scene = Scene_Shards.new.
module.exports = {
    key: 'thrallShards', detect: /class Window_Shard_Inventory < Window_Selectable[\s\S]*class Scene_Shards < Scene_Base/, plugin: 'RR_ThrallShards',
    scenes: { Scene_Shards: '(typeof Scene_RRThrallShards === "function" && SceneManager.push(Scene_RRThrallShards))' },
    classes: { Scene_Shards: 'Scene_RRThrallShards' }
};
