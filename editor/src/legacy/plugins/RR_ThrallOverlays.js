/*:
 * @target MZ
 * @plugindesc Ultimate Overlay Mapping (VX), for imported games
 * @author Hanzo Kimura; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallOverlays.js
 *
 * Painted maps: pictures the size of a map, locked to it as it scrolls,
 * from img/overlays and named after the map's id (Ground12, Par12, …).
 *
 *   Ground<id>  under the tiles (the painted floor)
 *   Par<id>     over everything on the map
 *   Parall<id>  over that
 *   Shadow<id>  over that, at 96 opacity
 *   Light<id>   over that, at 96 opacity, added to what is below
 *
 * Each shows only while its switch is on. The pictures over the map take
 * the screen's tint. A map without a picture of a kind has none.
 *
 * For the game's other scripts: $gameMap.rrUomBitmap(kind) is the bitmap
 * a kind of overlay shows on the current map (null when it has none, or
 * none yet); a script that composes overlays (Procedural Dungeon Gen.)
 * replaces it.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param folder
 * @text Overlay folder
 * @default img/overlays/
 *
 * @param files
 * @text Overlay files
 * @type multiline_string
 * @default []
 * @desc JSON: the overlay pictures the game ships (names without .png). Empty: looked up on disk.
 *
 * @param groundName
 * @default Ground
 * @param parName
 * @default Par
 * @param par2Name
 * @default Parall
 * @param shadowName
 * @default Shadow
 * @param lightName
 * @default Light
 *
 * @param groundSwitch
 * @type switch
 * @default 34
 * @param parSwitch
 * @type switch
 * @default 33
 * @param par2Switch
 * @type switch
 * @default 35
 * @param shadowSwitch
 * @type switch
 * @default 32
 * @param lightSwitch
 * @type switch
 * @default 31
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallOverlays');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const FOLDER = String(params.folder || 'img/overlays/').replace(/\/?$/, '/');
    let FILES = [];
    try { FILES = JSON.parse(params.files || '[]') || []; } catch (_) { FILES = []; }
    const KNOWN = new Set(FILES.map(f => String(f).toLowerCase()));
    const NAMES = {
        ground: params.groundName || 'Ground', par: params.parName || 'Par', par2: params.par2Name || 'Parall',
        shadow: params.shadowName || 'Shadow', light: params.lightName || 'Light'
    };
    const SWITCHES = {
        ground: num(params.groundSwitch, 34), par: num(params.parSwitch, 33), par2: num(params.par2Switch, 35),
        shadow: num(params.shadowSwitch, 32), light: num(params.lightSwitch, 31)
    };
    // Over the map, bottom to top, with the original's opacity and blend.
    const OVER = [
        { kind: 'par', opacity: 255, blend: 0 },
        { kind: 'par2', opacity: 255, blend: 0 },
        { kind: 'shadow', opacity: 96, blend: 0 },
        { kind: 'light', opacity: 96, blend: 1 }
    ];

    // FileTest.exist?: the list the importer wrote, or the disk when it wrote none.
    const onDisk = new Map();
    function exists(name) {
        if (KNOWN.size) return KNOWN.has(name.toLowerCase());
        if (onDisk.has(name)) return onDisk.get(name);
        let found = false;
        try {
            if (typeof require === 'function' && typeof process === 'object') {
                const fs = require('fs'), path = require('path');
                const base = path.dirname(process.mainModule.filename);
                found = fs.existsSync(path.join(base, FOLDER, name + '.png'));
            }
        } catch (_) { found = false; }
        onDisk.set(name, found);
        return found;
    }

    Game_Map.prototype.rrUomName = function(kind) {
        return NAMES[kind] + this.mapId();
    };
    Game_Map.prototype.rrUomHas = function(kind) {
        return exists(this.rrUomName(kind));
    };
    /** The bitmap an overlay kind shows on this map, or null. */
    Game_Map.prototype.rrUomBitmap = function(kind) {
        return this.rrUomHas(kind) ? ImageManager.loadBitmap(FOLDER, this.rrUomName(kind)) : null;
    };
    Game_Map.prototype.rrUomFolder = () => FOLDER;

    // A filter takes PIXI's own name for the blend (v8 does not read MZ's numbers there).
    const blendName = (n) => (typeof PIXI !== 'undefined' && PIXI.__reactorBlendModeName ? PIXI.__reactorBlendModeName(n) : n);
    const scrollX = () => Math.ceil($gameMap.displayX() * $gameMap.tileWidth());
    const scrollY = () => Math.ceil($gameMap.displayY() * $gameMap.tileHeight());

    const _createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
    Spriteset_Map.prototype.createLowerLayer = function() {
        _createLowerLayer.call(this);
        this.rrCreateUom();
    };

    Spriteset_Map.prototype.rrCreateUom = function() {
        // Ground: a plane under the tiles (between the parallax and the tilemap).
        this._rrUomGround = null;
        if ($gameMap.rrUomHas('ground')) {
            const ground = new TilingSprite();
            ground.move(0, 0, Graphics.width, Graphics.height);
            ground._rrKind = 'ground';
            const at = this._baseSprite.children.indexOf(this._tilemap);
            this._baseSprite.addChildAt(ground, at >= 0 ? at : this._baseSprite.children.length);
            this._rrUomGround = ground;
        }
        // The rest: one layer right above the map, under the weather and pictures.
        const layer = new Sprite();
        this.addChildAt(layer, this.children.indexOf(this._baseSprite) + 1);
        this._rrUomLayer = layer;
        this._rrUomSprites = [];
        for (const o of OVER) {
            if (!$gameMap.rrUomHas(o.kind)) continue;
            const sprite = new Sprite();
            sprite._rrKind = o.kind;
            sprite.opacity = o.opacity;
            sprite.blendMode = o.blend;
            sprite._rrBlend = o.blend;
            layer.addChild(sprite);
            this._rrUomSprites.push(sprite);
        }
        this.rrUpdateUom();
    };

    const resolve = (sprite) => {
        if (!sprite.bitmap) {
            const bitmap = $gameMap.rrUomBitmap(sprite._rrKind);
            if (bitmap) sprite.bitmap = bitmap;
        }
    };

    Spriteset_Map.prototype.rrUpdateUom = function() {
        const ground = this._rrUomGround;
        if (ground) {
            resolve(ground);
            ground.visible = $gameSwitches.value(SWITCHES.ground);
            ground.origin.x = scrollX();
            ground.origin.y = scrollY();
        }
        if (!this._rrUomSprites) return;
        const tone = $gameScreen.tone();
        for (const sprite of this._rrUomSprites) {
            resolve(sprite);
            sprite.visible = $gameSwitches.value(SWITCHES[sprite._rrKind]);
            sprite.x = -scrollX();
            sprite.y = -scrollY();
            sprite.setColorTone(tone);
            // A tinted sprite draws through its colour filter, which then does the adding.
            if (sprite._colorFilter && sprite._colorFilter._rrUomBlend !== sprite._rrBlend) {
                sprite._colorFilter.blendMode = blendName(sprite._rrBlend);
                sprite._colorFilter._rrUomBlend = sprite._rrBlend;
            }
        }
    };

    const _update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _update.call(this);
        this.rrUpdateUom();
    };

    // The first frame a map shows already has its overlays.
    const _start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _start.call(this);
        if (this._spriteset && this._spriteset.rrUpdateUom) this._spriteset.rrUpdateUom();
    };
})();
