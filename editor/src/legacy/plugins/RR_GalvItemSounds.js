/*:
 * @target MZ
 * @plugindesc Galv's Item/Equip Sound Effects (VX Ace), for imported games
 * @author Galv; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_GalvItemSounds.js
 *
 * Items, skills, weapons and armors can carry their own sound in the note:
 *   <se: "Heal7",100,100>        name, volume, pitch
 * Using a tagged item from the Item menu, or a tagged skill from the Skill
 * menu, plays that sound in place of the Use Item / Use Skill sound (battle
 * plays neither). Equipping a tagged weapon or armor plays its sound; an
 * untagged one plays the Equip sound. Taking a piece off (the empty entry)
 * is silent. Optimize and Remove All stop the sounds playing, then play their
 * own sound below, or the Equip sound when it has no name. The Equip sound is
 * not played anywhere else.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param optimizeSe
 * @text Optimize sound
 * @default {"name":"","volume":100,"pitch":100}
 * @desc JSON {"name","volume","pitch"} from the sound effects folder. No name: the Equip sound.
 *
 * @param clearSe
 * @text Remove All sound
 * @default {"name":"","volume":100,"pitch":100}
 * @desc JSON {"name","volume","pitch"} from the sound effects folder. No name: the Equip sound.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_GalvItemSounds');
    const json = (t) => { try { return JSON.parse(t); } catch (_) { return null; } };
    const OPTIMIZE_SE = json(params.optimizeSe || 'null');
    const CLEAR_SE = json(params.clearSe || 'null');

    const TAG = /<se: "([^\n]*)",([^\n]*),([^\n]*)>/i;
    const toI = (s) => parseInt(s, 10) || 0;
    const cache = new WeakMap();
    /** The item's tagged sound { name, volume, pitch }, or null. */
    const itemSe = (item) => {
        if (!item || typeof item !== 'object') return null;
        if (!cache.has(item)) {
            const m = TAG.exec(String(item.note || ''));
            cache.set(item, m ? { name: m[1], volume: toI(m[2]), pitch: toI(m[3]) } : null);
        }
        return cache.get(item);
    };
    const play = (se) => AudioManager.playSe({ name: se.name, volume: se.volume, pitch: se.pitch, pan: 0 });

    for (const Scene of [Scene_Item, Scene_Skill]) {
        const _playSeForItem = Scene.prototype.playSeForItem;
        Scene.prototype.playSeForItem = function() {
            const item = this.item();
            if (!item) return;
            const se = itemSe(item);
            if (se) return play(se);
            _playSeForItem.call(this);
        };
    }

    const equipSound = (se) => {
        AudioManager.stopSe();
        if (se && se.name) play({ name: String(se.name), volume: Number(se.volume ?? 100), pitch: Number(se.pitch ?? 100) });
        else SoundManager.playSystemSound(4);
    };
    const _commandOptimize = Scene_Equip.prototype.commandOptimize;
    Scene_Equip.prototype.commandOptimize = function() {
        equipSound(OPTIMIZE_SE);
        _commandOptimize.call(this);
    };
    const _commandClear = Scene_Equip.prototype.commandClear;
    Scene_Equip.prototype.commandClear = function() {
        equipSound(CLEAR_SE);
        _commandClear.call(this);
    };
    const _onItemOk = Scene_Equip.prototype.onItemOk;
    Scene_Equip.prototype.onItemOk = function() {
        const item = this._itemWindow.item();
        if (item) {
            const se = itemSe(item);
            if (se) play(se);
            else SoundManager.playSystemSound(4);
        }
        _onItemOk.call(this);
    };
    // The Equip sound's own call plays nothing; the equip screen plays the sounds above.
    SoundManager.playEquip = function() {};
})();
