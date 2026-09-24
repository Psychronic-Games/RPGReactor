/*:
 * @target MZ
 * @plugindesc The languages an imported game switches between while it plays
 * @author RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_Language.js
 *
 * Installed by File › Import Project… with an RPG Maker 2000/2003 game that
 * ships translations (its Language folder) and changes language from its own
 * events, as EasyRPG Player's `@easyrpg_set_language` did.
 *
 * The project's data holds one language: the one chosen in the import
 * dialog, or the game's original text. Every other language the game ships
 * is a pack in data/Languages/<name>.json listing the texts that differ,
 * file by file. The import turned each `@easyrpg_set_language <name>` into
 *
 *   this.rrSetLanguage("<name>")
 *
 * which applies that pack to the database and to each map as it loads, and
 * waits while a pack loads. "default" is the original text. The language is
 * the player's, not the save's, as in EasyRPG: the game's own events set it
 * again after a load.
 *
 * Turning the plugin off leaves the game in the language of its data.
 */
(() => {
    'use strict';

    const DATABASE = {
        'Actors.json': '$dataActors', 'Classes.json': '$dataClasses', 'Skills.json': '$dataSkills',
        'Items.json': '$dataItems', 'Weapons.json': '$dataWeapons', 'Armors.json': '$dataArmors',
        'Enemies.json': '$dataEnemies', 'Troops.json': '$dataTroops', 'States.json': '$dataStates',
        'Animations.json': '$dataAnimations', 'CommonEvents.json': '$dataCommonEvents',
        'MapInfos.json': '$dataMapInfos', 'System.json': '$dataSystem'
    };
    const packs = {};          // name → pack, 'loading' or 'missing'
    let current = null;        // the language in effect; null until the first switch (the data's own)
    let pending = null;        // a language waiting for its pack
    let undo = [];             // [object, ops] that put the database back to its own language
    let mapUndo = null;        // the same for the map on screen: { map, ops }
    let mapFile = '';          // the file $dataMap came from
    const patched = new WeakSet();

    const baseLanguage = () => ($dataSystem && $dataSystem.rrLanguage) || 'default';
    const packFor = (name) => (packs[name] && typeof packs[name] === 'object' ? packs[name] : null);

    function apply(target, ops) {
        const out = [];
        const walk = (path) => { let o = target; for (const k of path) o = o == null ? o : o[k]; return o; };
        for (const op of ops || []) {
            if (op.length === 2) {
                const [path, value] = op;
                if (!path.length) continue;
                const owner = walk(path.slice(0, -1)), key = path[path.length - 1];
                if (owner == null || typeof owner !== 'object') continue;
                out.push([path, owner[key]]);
                owner[key] = value == null ? value : JSON.parse(JSON.stringify(value));
            } else {
                const [path, index, remove, items] = op;
                const list = walk(path);
                if (!Array.isArray(list)) continue;
                const removed = list.splice(index, remove, ...JSON.parse(JSON.stringify(items)));
                out.push([path, index, items.length, removed]);
            }
        }
        return out.reverse();
    }

    function load(name) {
        if (packs[name]) return;
        packs[name] = 'loading';
        const xhr = new XMLHttpRequest();
        xhr.open('GET', 'data/Languages/' + encodeURIComponent(name) + '.json');
        xhr.overrideMimeType('application/json');
        xhr.onload = () => {
            try { packs[name] = xhr.status < 400 ? JSON.parse(xhr.responseText) : 'missing'; }
            catch (e) { packs[name] = 'missing'; }
            if (packs[name] === 'missing') console.warn(`RR_Language: no pack for "${name}"; the text stays as it is`);
            if (pending === name) switchNow(name);
        };
        xhr.onerror = () => { packs[name] = 'missing'; if (pending === name) switchNow(name); };
        xhr.send();
    }

    function revert() {
        for (const [target, ops] of undo.reverse()) apply(target, ops);
        undo = [];
        if (mapUndo && mapUndo.map === window.$dataMap) apply(mapUndo.map, mapUndo.ops);
        mapUndo = null;
    }

    function opsFor(file) {
        const pack = packFor(current);
        return pack && pack.files && pack.files[file] ? pack.files[file] : null;
    }

    function patchDatabase(target, file) {
        const ops = opsFor(file);
        if (target && ops) undo.push([target, apply(target, ops)]);
    }

    function patchMap() {
        patched.add($dataMap);
        const ops = opsFor(mapFile);
        mapUndo = ops ? { map: $dataMap, ops: apply($dataMap, ops) } : null;
    }

    function switchNow(name) {
        pending = null;
        if (name !== baseLanguage() && !packFor(name)) { current = current || baseLanguage(); return; }   // no pack: keep what is shown
        revert();
        current = name;
        if (name === baseLanguage()) return;
        for (const [file, global] of Object.entries(DATABASE)) patchDatabase(window[global], file);
        if (window.$dataMap && mapFile) patchMap();
    }

    /** Switch the game's text to a language it ships ("default" is the original). */
    function setLanguage(name) {
        name = String(name || 'default');
        if (name === (current || baseLanguage()) && !pending) return;
        if (name === baseLanguage() || packFor(name) || packs[name] === 'missing') { switchNow(name); return; }
        pending = name;
        load(name);
    }

    Game_Interpreter.prototype.rrSetLanguage = function(name) {
        setLanguage(name);
        if (pending) this.setWaitMode('rrLanguage');
    };

    const _updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function() {
        if (this._waitMode === 'rrLanguage') {
            if (pending) return true;
            this._waitMode = '';
            return false;
        }
        return _updateWaitMode.call(this);
    };

    const _loadMapData = DataManager.loadMapData;
    DataManager.loadMapData = function(mapId) {
        if (mapId > 0) mapFile = 'Map%1.json'.format(mapId.padZero(3));
        _loadMapData.call(this, mapId);
    };

    // A map loads in the language in effect; the scene waits while a pack is still loading.
    const _isMapLoaded = DataManager.isMapLoaded;
    DataManager.isMapLoaded = function() {
        if (!_isMapLoaded.call(this)) return false;
        if (pending) return false;
        if (window.$dataMap && !patched.has($dataMap)) patchMap();
        return true;
    };

    window.RRLanguage = { set: setLanguage, current: () => current || (window.$dataSystem ? baseLanguage() : 'default') };
})();
