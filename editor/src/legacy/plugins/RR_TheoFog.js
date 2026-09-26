/*:
 * @target MZ
 * @plugindesc Fog Screen (VX Ace), for imported games
 * @author TheoAllen; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TheoFog.js
 *
 * Fogs as XP drew them: a picture tiled over the map, above the characters,
 * drifting at its own speed and scrolling with the map. A map's note line
 * <add fog: key> shows that fog while the map is on screen; script calls add
 * fogs that stay until removed:
 *   this.rrTheoAddFog(key, fadeIn = 255)       fade-in speed per frame
 *   this.rrTheoDeleteFog(key, fadeOut = 255)
 *   this.rrTheoClearFogs()
 * Fogs come from the list below (the original's THEO::Fog::List), pictures in
 * img/pictures.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param fogs
 * @type multiline_string
 * @default {}
 * @desc JSON: key → { name, opacity, speedX, speedY, zoomX, zoomY, scrollX, scrollY, blend, switch }.
 *
 * @param battleFog
 * @text Fogs in battle
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_TheoFog');
    let FOGS = {};
    try { FOGS = JSON.parse(params.fogs || '{}') || {}; } catch (_) { FOGS = {}; }
    const BATTLE = String(params.battleFog) !== 'false';
    const data = (key) => Object.assign({ name: '', opacity: 255, speedX: 0, speedY: 0, zoomX: 1, zoomY: 1, scrollX: 1, scrollY: 1, blend: 0, switch: 0 }, FOGS[key] || {});

    const usedFogs = () => {
        if (!$gameSystem._rrTheoFogs) $gameSystem._rrTheoFogs = [];
        return $gameSystem._rrTheoFogs;
    };
    const planes = () => {
        const s = SceneManager._scene && SceneManager._scene._spriteset;
        return s && s._rrTheoFogs;
    };
    Game_Interpreter.prototype.rrTheoAddFog = function(key, speed = 255) {
        key = String(key);
        if (usedFogs().includes(key)) return;
        usedFogs().push(key);
        const p = planes();
        if (p) p.global.get(key).fadeIn(Number(speed));
    };
    Game_Interpreter.prototype.rrTheoDeleteFog = function(key, speed = 255) {
        key = String(key);
        const p = planes();
        const fog = p && p.global.find(key);
        if (!fog) return;
        $gameSystem._rrTheoFogs = usedFogs().filter(k => k !== key);
        fog.fadeOut(Number(speed));
        fog.deleteWhenFaded = true;
    };
    Game_Interpreter.prototype.rrTheoClearFogs = function() {
        $gameSystem._rrTheoFogs = [];
        const p = planes();
        if (p) p.global.clear();
    };

    Game_Map.prototype.rrTheoMapFogs = function() {
        const out = [];
        const note = ($dataMap && $dataMap.note) || '';
        for (const line of note.split(/[\r\n]+/)) {
            const m = /<(?:ADD_FOG|add fog): (.*)>/i.exec(line);
            if (m && !out.includes(m[1])) out.push(m[1]);
        }
        return out;
    };

    function Sprite_RRTheoFog() { this.initialize(...arguments); }
    Sprite_RRTheoFog.prototype = Object.create(TilingSprite.prototype);
    Sprite_RRTheoFog.prototype.constructor = Sprite_RRTheoFog;
    Sprite_RRTheoFog.prototype.initialize = function(key) {
        TilingSprite.prototype.initialize.call(this, ImageManager.loadPicture(data(key).name));
        this._key = key;
        this._data = data(key);
        this.move(0, 0, Graphics.width, Graphics.height);
        // A fog starts somewhere random on its picture, as the original's Plane did.
        this._realOx = Math.random() * Graphics.width;
        this._realOy = Math.random() * Graphics.height;
        this._fade = 0;
        this.opacity = this._data.opacity;
        this.blendMode = [0, 1, 'subtract'][this._data.blend] ?? 0;
        this.deleteWhenFaded = false;
        this.update();
    };
    Sprite_RRTheoFog.prototype.fadeIn = function(speed) { this._fade = speed; this.opacity = 0; };
    Sprite_RRTheoFog.prototype.fadeOut = function(speed) { this._fade = -speed; };
    Sprite_RRTheoFog.prototype.update = function() {
        TilingSprite.prototype.update.call(this);
        const d = this._data;
        this._realOx += d.speedX;
        this._realOy += d.speedY;
        if (this.tileScale) this.tileScale.set(d.zoomX, d.zoomY);
        this.origin.x = ($gameMap.displayX() * $gameMap.tileWidth() * d.scrollX + this._realOx) / d.zoomX;
        this.origin.y = ($gameMap.displayY() * $gameMap.tileHeight() * d.scrollY + this._realOy) / d.zoomY;
        this.visible = !(d.switch > 0 && $gameSwitches.value(d.switch));
        this.opacity = Math.min(Math.max(this.opacity + this._fade, 0), d.opacity);
    };

    // One set of fogs: planes by key in a container, made on first use.
    class FogSet {
        constructor(container) { this.container = container; this.fogs = new Map(); }
        find(key) { return this.fogs.get(key); }
        get(key) {
            if (!this.fogs.has(key)) {
                const fog = new Sprite_RRTheoFog(key);
                this.fogs.set(key, fog);
                this.container.addChild(fog);
            }
            return this.fogs.get(key);
        }
        remove(key) {
            const fog = this.fogs.get(key);
            if (!fog) return;
            this.container.removeChild(fog);
            fog.destroy();
            this.fogs.delete(key);
        }
        clear() { for (const key of [...this.fogs.keys()]) this.remove(key); }
        update() {
            for (const [key, fog] of [...this.fogs]) {
                if (fog.deleteWhenFaded && fog.opacity === 0) this.remove(key);
            }
        }
    }

    function createFogs(spriteset, parent, index) {
        const container = new Sprite();
        parent.addChildAt(container, index);
        spriteset._rrTheoFogs = { container, map: new FogSet(container), global: new FogSet(container), mapKeys: [] };
        for (const key of usedFogs()) spriteset._rrTheoFogs.global.get(key);
    }
    function updateFogs(spriteset) {
        const f = spriteset._rrTheoFogs;
        if (!f) return;
        const keys = $gameMap.rrTheoMapFogs();
        if (keys.join('\n') !== f.mapKeys.join('\n')) {
            f.map.clear();
            for (const key of keys) f.map.get(key);
            f.mapKeys = keys;
        }
        f.map.update();
        f.global.update();
    }

    const _createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
    Spriteset_Map.prototype.createLowerLayer = function() {
        _createLowerLayer.call(this);
        // Above the tilemap and its characters, under pictures, weather and the screen tint.
        createFogs(this, this._baseSprite, this._baseSprite.children.indexOf(this._tilemap) + 1);
    };
    const _updateMap = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _updateMap.call(this);
        updateFogs(this);
    };
    const _createBattleLower = Spriteset_Battle.prototype.createLowerLayer;
    Spriteset_Battle.prototype.createLowerLayer = function() {
        _createBattleLower.call(this);
        if (BATTLE) createFogs(this, this._battleField, this._battleField.children.length);
    };
    const _updateBattle = Spriteset_Battle.prototype.update;
    Spriteset_Battle.prototype.update = function() {
        _updateBattle.call(this);
        if (BATTLE) updateFogs(this);
    };
})();
