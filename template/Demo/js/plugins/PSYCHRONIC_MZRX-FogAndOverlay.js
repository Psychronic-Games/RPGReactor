/*:
 * @target MZ
 * @plugindesc v1.07 - Display fogs and overlay on maps and battles (MZ version, no Victor Engine required).
 * @author Originally by Victor Sant; MZ conversion by Psychronic
 *
 * @help
 * ============================================================================
 *  Fog And Overlay (MZ Conversion)
 * ============================================================================
 * This plugin allows you to display multiple fog or overlay images on the map
 * or in battle. Fogs can move, pan, zoom, and change opacity over time.
 *
 * You must place your fog graphics in the folder:
 *   img/fogs/
 * (You need to create this folder manually.)
 *
 * ----------------------------------------------------------------------------
 *  Notetag Instructions (for Maps):
 * ----------------------------------------------------------------------------
 *   <fog effect>
 *    settings
 *   </fog effect>
 *
 * Inside these tags, you can set:
 *   id: n        (fog ID, a number—must be unique per map if used in notetags)
 *   name: 's'    (filename in quotes, e.g. 'Clouds'; use !, $, or % prefixes if needed)
 *   opacity: n   (0..255)
 *   zoom: n%     (e.g. 150%)
 *   hue: n       (0..360)
 *   blend: n     (0: normal, 1: additive, 2: subtractive)
 *   move x: n    (continuous movement horizontally; can be negative)
 *   move y: n    (continuous movement vertically; can be negative)
 *   pan x: n     (pan multiplier horizontally)
 *   pan y: n     (pan multiplier vertically)
 *   depth: n     (1..7; determines whether the fog is displayed above/below certain layers)
 *
 * Example:
 *   <fog effect>
 *    id: 1
 *    name: 'Sky'
 *    opacity: 160
 *    hue: 100
 *    move x: 3
 *    move y: 2
 *   </fog effect>
 *   <fog effect>
 *    id: 2
 *    name: '$BattleFog'
 *    opacity: 80
 *    zoom: 200%
 *    blend: 2
 *    depth: 3
 *   </fog effect>
 *
 * ----------------------------------------------------------------------------
 *  Plugin Commands (Legacy MV-style)
 * ----------------------------------------------------------------------------
 *  FogEffect id name opacity hue blend depth
 *     - Shows or changes a fog with the given ID.
 *       * id: Number
 *       * name: Fog filename (no spaces). Can have prefixes like !, $, %
 *       * opacity: 0..255
 *       * hue: 0..360
 *       * blend: 0..2
 *       * depth: 1..7
 *
 *   Example:
 *    FogEffect 1 Sky 160 100 0 0
 *
 *  FogOpacity id opacity duration
 *     - Changes the opacity of an existing fog with the given ID.
 *       * id: Number
 *       * opacity: 0..255
 *       * duration: frames (0 if instant)
 *
 *   Example:
 *    FogOpacity 1 64 60
 *
 *  FogMove id x y
 *     - Sets continuous movement for a fog.
 *       * id: Number
 *       * x, y: Numbers (can be negative)
 *
 *   Example:
 *    FogMove 1 2 0
 *
 *  FogPan id x y
 *     - Adjusts the panning multiplier for a fog.
 *       * id: Number
 *       * x, y: Numbers (can be negative, default is 1 = normal speed)
 *
 *   Example:
 *    FogPan 1 2 2
 *
 *  FogZoom id zoom duration
 *     - Changes the zoom of a fog over a certain duration.
 *       * id: Number
 *       * zoom: percentage (100 = normal)
 *       * duration: frames (0 if instant)
 *
 *   Example:
 *    FogZoom 1 200 60
 *
 * ----------------------------------------------------------------------------
 *  Special Filename Prefixes
 * ----------------------------------------------------------------------------
 *  - "!" => Fog is fixed to the map display (doesn't parallax scroll).
 *  - "$" => Fog displays in both map and battle.
 *  - "%" => Fog displays only in battle.
 *  (You can combine "!" with "$" or "%"—e.g. "!$Fog" or "!%Fog".)
 *
 * ----------------------------------------------------------------------------
 *  Depth for Map:
 *   1 => Above animations
 *   2 => Above airship / upper characters
 *   3 => Above upper tiles
 *   4 => Above normal characters
 *   5 => Above lower characters
 *   6 => Above lower tiles
 *   7 => Above parallax
 *
 *  Depth for Battle:
 *   0..4 => Above battlers
 *   5 => Above battleback2
 *   6 => Above battleback1
 *   7 => Above background (blurred map image)
 * ----------------------------------------------------------------------------
 *
 * @param Max Fogs
 * @type number
 * @min 1
 * @desc Maximum number of simultaneous fog effects.
 * @default 5
 */

var Imported = Imported || {};
Imported["PSYCHRONIC_MZRX-FogAndOverlay"] = 1.07;

(() => {

    //--------------------------------------------------------------------------
    // Plugin Parameters
    //--------------------------------------------------------------------------

    const pluginName = "PSYCHRONIC_MZRX-FogAndOverlay";
    const parameters = PluginManager.parameters(pluginName);
    const maxFogs = Number(parameters["Max Fogs"] || 5);

    //--------------------------------------------------------------------------
    // Utility for Reading <fog effect> ... </fog effect> Notetags
    //--------------------------------------------------------------------------
    function getFogEffectBlocks(noteString) {
        if (!noteString) return [];
        const regex = /<fog effect>([\s\S]*?)<\/fog effect>/gi;
        const results = [];
        let match;
        while ((match = regex.exec(noteString)) !== null) {
            results.push(match[1]);
        }
        return results;
    }

    function getFogStringValue(block, tag, defaultValue = "") {
        // e.g. tag = "name", we look for  name: '...'  or name: "..."
        const regex = new RegExp(`${tag}\\s*:\\s*(?:'([^']+)'|"([^"]+)")`, "i");
        const match = regex.exec(block);
        if (match) {
            return match[1] || match[2] || defaultValue;
        }
        return defaultValue;
    }

    function getFogNumberValue(block, tag, defaultValue = 0) {
        // e.g. tag = "id", we look for id: 3
        // or for zoom, we may see "zoom: 150%"
        const regex = new RegExp(`${tag}\\s*:\\s*([+-]?\\d+%?)`, "i");
        const match = regex.exec(block);
        if (match) {
            // If it includes '%', parse the numeric portion
            if (match[1].includes("%")) {
                return parseInt(match[1]);
            } else {
                return Number(match[1]);
            }
        }
        return defaultValue;
    }

    //--------------------------------------------------------------------------
    // Overwrite: Tilemap.prototype._compareChildOrder
    // (Needed so we can properly layer sprites by .z property)
    //--------------------------------------------------------------------------
    const _Tilemap_compareChildOrder = Tilemap.prototype._compareChildOrder;
    Tilemap.prototype._compareChildOrder = function(a, b) {
        if ((a.z || 0) !== (b.z || 0)) {
            return (a.z || 0) - (b.z || 0);
        } else if ((a.y || 0) !== (b.y || 0)) {
            return (a.y || 0) - (b.y || 0);
        } else {
            return a.spriteId - b.spriteId;
        }
    };

    //--------------------------------------------------------------------------
    // ImageManager - Additional Fog loading & checks
    //--------------------------------------------------------------------------
    ImageManager.loadFog = function(filename, hue) {
        return this.loadBitmap("img/fogs/", filename, hue, true);
    };

    ImageManager.isBattleOnlyFog = function(filename) {
        const sign = filename.match(/^[!%]+/);
        return sign && sign[0].includes("%");
    };

    ImageManager.isBattleFog = function(filename) {
        const sign = filename.match(/^[!$%]+/);
        return sign && sign[0].includes("$");
    };

    ImageManager.isFixedFog = function(filename) {
        const sign = filename.match(/^[!$%]+/);
        return sign && sign[0].includes("!");
    };

    //--------------------------------------------------------------------------
    // Game_Screen - Store & update fogs
    //--------------------------------------------------------------------------
    const _Game_Screen_clear = Game_Screen.prototype.clear;
    Game_Screen.prototype.clear = function() {
        _Game_Screen_clear.call(this);
        this.clearFogs();
    };

    const _Game_Screen_update = Game_Screen.prototype.update;
    Game_Screen.prototype.update = function() {
        _Game_Screen_update.call(this);
        this.updateFogs();
    };

    Game_Screen.prototype.clearFogs = function() {
        this._fogs = [];
        this._fogScene = "map"; // By default we assume "map" until a battle starts.
    };

    Game_Screen.prototype.updateFogs = function() {
        if (!this._fogs) this._fogs = [];
        this._fogs.forEach(fog => fog && fog.update());
    };

    Game_Screen.prototype.fog = function(fogId) {
        if (!this._fogs) this._fogs = [];
        return this._fogs[fogId];
    };

    Game_Screen.prototype.showFog = function(fogId, name, opacity, hue, blend, depth) {
        if (!this._fogs) this._fogs = [];
        const fog = new Game_Fog();
        fog.show(name, opacity, hue, blend, depth);
        this._fogs[fogId] = fog;
    };

    Game_Screen.prototype.moveFog = function(fogId, x, y) {
        const fog = this.fog(fogId);
        if (fog) fog.move(x, y);
    };

    Game_Screen.prototype.panFog = function(fogId, x, y) {
        const fog = this.fog(fogId);
        if (fog) fog.pan(x, y);
    };

    Game_Screen.prototype.changeFogZoom = function(fogId, zoom, duration) {
        const fog = this.fog(fogId);
        if (fog) fog.changeZoom(zoom, duration);
    };

    Game_Screen.prototype.changeFogOpacity = function(fogId, opacity, duration) {
        const fog = this.fog(fogId);
        if (fog) fog.changeOpacity(opacity, duration);
    };

    Game_Screen.prototype.eraseFog = function(fogId) {
        if (!this._fogs) this._fogs = [];
        this._fogs[fogId] = null;
    };

    Game_Screen.prototype.mapFog = function() {
        this._fogScene = "map";
    };

    Game_Screen.prototype.battleFog = function() {
        this._fogScene = "battle";
    };

    Game_Screen.prototype.fogScene = function() {
        return this._fogScene;
    };

    //--------------------------------------------------------------------------
    // Game_Map - Setup map fogs from notetags
    //--------------------------------------------------------------------------
    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _Game_Map_setup.call(this, mapId);
        this.setupFogs();
    };

    const _Game_Map_setDisplayPos = Game_Map.prototype.setDisplayPos;
    Game_Map.prototype.setDisplayPos = function(x, y) {
        _Game_Map_setDisplayPos.call(this, x, y);
        this._fogX = this.isLoopHorizontal() ? x : this._displayX;
        this._fogY = this.isLoopVertical() ? y : this._displayY;
    };

    const _Game_Map_scrollDown = Game_Map.prototype.scrollDown;
    Game_Map.prototype.scrollDown = function(distance) {
        const lastY = this._displayY;
        _Game_Map_scrollDown.call(this, distance);
        this._fogY += this.isLoopVertical() ? distance : this._displayY - lastY;
    };

    const _Game_Map_scrollLeft = Game_Map.prototype.scrollLeft;
    Game_Map.prototype.scrollLeft = function(distance) {
        const lastX = this._displayX;
        _Game_Map_scrollLeft.call(this, distance);
        this._fogX += this.isLoopHorizontal() ? -distance : this._displayX - lastX;
    };

    const _Game_Map_scrollRight = Game_Map.prototype.scrollRight;
    Game_Map.prototype.scrollRight = function(distance) {
        const lastX = this._displayX;
        _Game_Map_scrollRight.call(this, distance);
        this._fogX += this.isLoopHorizontal() ? distance : this._displayX - lastX;
    };

    const _Game_Map_scrollUp = Game_Map.prototype.scrollUp;
    Game_Map.prototype.scrollUp = function(distance) {
        const lastY = this._displayY;
        _Game_Map_scrollUp.call(this, distance);
        this._fogY += this.isLoopVertical() ? -distance : this._displayY - lastY;
    };

    Game_Map.prototype.fogX = function() {
        return this._fogX || 0;
    };

    Game_Map.prototype.fogY = function() {
        return this._fogY || 0;
    };

    Game_Map.prototype.setupFogs = function() {
        $gameScreen.clearFogs();
        const note = $dataMap ? $dataMap.note : "";
        this._fogX = 0;
        this._fogY = 0;
        // Parse notetags
        getFogEffectBlocks(note).forEach(block => {
            this.setupFogBlock(block);
        });
    };

    Game_Map.prototype.setupFogBlock = function(block) {
        const id     = getFogNumberValue(block, "id", 0);
        if (id <= 0) return;
        const name   = getFogStringValue(block, "name", "");
        const op     = getFogNumberValue(block, "opacity", 192);
        const zoom   = getFogNumberValue(block, "zoom", 100);
        const hue    = getFogNumberValue(block, "hue", 0);
        const blend  = getFogNumberValue(block, "blend", 0);
        const moveX  = getFogNumberValue(block, "move x", 0);
        const moveY  = getFogNumberValue(block, "move y", 0);
        const panX   = getFogNumberValue(block, "pan x", 0);
        const panY   = getFogNumberValue(block, "pan y", 0);
        const depth  = getFogNumberValue(block, "depth", 1);

        $gameScreen.showFog(id, name, op, hue, blend, depth);
        $gameScreen.moveFog(id, moveX, moveY);
        $gameScreen.panFog(id, panX, panY);
        $gameScreen.changeFogZoom(id, zoom, 0);
    };

    //--------------------------------------------------------------------------
    // Game_Interpreter - MV-Style Plugin Commands
    //--------------------------------------------------------------------------
    const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        if (!args) return;

        switch (command.toLowerCase()) {
            case "fogeffect": {
                const id     = Number(args[0]) || 0;
                const name   = String(args[1] || "");
                const op     = Number(args[2]) || 0;
                const hue    = Number(args[3]) || 0;
                const blend  = Number(args[4]) || 0;
                const depth  = Number(args[5]) || 1;
                $gameScreen.showFog(id, name, op, hue, blend, depth);
                break;
            }
            case "fogmove": {
                const id = Number(args[0]) || 0;
                const x  = Number(args[1]) || 0;
                const y  = Number(args[2]) || 0;
                $gameScreen.moveFog(id, x, y);
                break;
            }
            case "fogpan": {
                const id = Number(args[0]) || 0;
                const x  = Number(args[1]) || 0;
                const y  = Number(args[2]) || 0;
                $gameScreen.panFog(id, x, y);
                break;
            }
            case "fogopacity": {
                const id  = Number(args[0]) || 0;
                const op  = Number(args[1]) || 0;
                const dur = Number(args[2]) || 0;
                $gameScreen.changeFogOpacity(id, op, dur);
                break;
            }
            case "fogzoom": {
                const id  = Number(args[0]) || 0;
                const z   = Number(args[1]) || 100;
                const dur = Number(args[2]) || 0;
                $gameScreen.changeFogZoom(id, z, dur);
                break;
            }
        }
    };

    //--------------------------------------------------------------------------
    // Spriteset_Base
    //--------------------------------------------------------------------------
    const _Spriteset_Base_createLowerLayer = Spriteset_Base.prototype.createLowerLayer;
    Spriteset_Base.prototype.createLowerLayer = function() {
        _Spriteset_Base_createLowerLayer.call(this);
        this._fogEffects = [];
    };

    const _Spriteset_Base_update = Spriteset_Base.prototype.update;
    Spriteset_Base.prototype.update = function() {
        _Spriteset_Base_update.call(this);
        for (let i = 1; i < maxFogs; i++) {
            this.updateFogs(i);
        }
    };

    Spriteset_Base.prototype.updateFogs = function(fogId) {
        if (!this._fogEffects[fogId] && this.validFog(fogId)) {
            this.createFog(fogId);
            this.updateFog(fogId);
        } else if (this._fogEffects[fogId] && !this.validFog(fogId)) {
            this.deleteFog(fogId);
        } else if (this._fogEffects[fogId] && this.validFog(fogId)) {
            this.updateFog(fogId);
        }
    };

    Spriteset_Base.prototype.updateFog = function(fogId) {
        const sprite = this._fogEffects[fogId];
        const fog = $gameScreen.fog(fogId);
        if (!sprite || !fog) return;

        // If key properties changed, recreate the sprite
        if (sprite.fogName !== fog.name ||
            sprite.fogHue !== fog.hue ||
            sprite.blendMode !== fog.blend ||
            sprite.z !== fog.z) {
            this.deleteFog(fogId);
            this.createFog(fogId);
        }

        sprite.origin.x = Math.floor(fog.x);
        sprite.origin.y = Math.floor(fog.y);
        sprite.scale.x = fog.zoom;
        sprite.scale.y = fog.zoom;
        sprite.opacity = fog.opacity;
    };

    Spriteset_Base.prototype.setFogSpriteBitmap = function(sprite, bitmap) {
        sprite.bitmap = bitmap;
    };

    //--------------------------------------------------------------------------
    // Spriteset_Map
    //--------------------------------------------------------------------------
    Spriteset_Map.prototype.createFog = function(fogId) {
        const fog = $gameScreen.fog(fogId);
        if (!fog) return;

        const sprite = new TilingSprite();
        const bitmap = ImageManager.loadFog(fog.name, fog.hue);
        sprite.spriteId = sprite.spriteId || Sprite._counter++;
        sprite.bitmap = new Bitmap();
        sprite.fogName = fog.name;
        sprite.fogHue = fog.hue;
        sprite.blendMode = fog.blend;
        sprite.z = fog.z;
        sprite.move(0, 0, Graphics.width, Graphics.height);

        bitmap.addLoadListener(this.setFogSpriteBitmap.bind(this, sprite, bitmap));

        this._fogEffects[fogId] = sprite;
        // Subtractive blend at high depth might need to be above tilemap
        if (fog.blend === 2 && fog.z > 3) {
            this.addChild(sprite);
        } else {
            this._tilemap.addChild(sprite);
        }
    };

    Spriteset_Map.prototype.deleteFog = function(fogId) {
        if (this._fogEffects[fogId]) {
            this._tilemap.removeChild(this._fogEffects[fogId]);
            this.removeChild(this._fogEffects[fogId]);
            this._fogEffects[fogId] = null;
        }
    };

    Spriteset_Map.prototype.validFog = function(fogId) {
        const fog = $gameScreen.fog(fogId);
        // Must exist and not be "battle-only"
        return fog && !fog.isBattleOnlyFog();
    };

    //--------------------------------------------------------------------------
    // Spriteset_Battle
    //--------------------------------------------------------------------------
    const _Spriteset_Battle_createBattleback = Spriteset_Battle.prototype.createBattleback;
    Spriteset_Battle.prototype.createBattleback = function() {
        _Spriteset_Battle_createBattleback.call(this);
        // Lower z on background images
        this._back1Sprite.z = 0;
        this._back2Sprite.z = 1;
    };

    const _Spriteset_Battle_update = Spriteset_Battle.prototype.update;
    Spriteset_Battle.prototype.update = function() {
        _Spriteset_Battle_update.call(this);
        this.sortBattleSprites();
    };

    Spriteset_Battle.prototype.createFog = function(fogId) {
        const fog = $gameScreen.fog(fogId);
        if (!fog) return;

        const sprite = new TilingSprite();
        const bitmap = ImageManager.loadFog(fog.name, fog.hue);
        sprite.spriteId = sprite.spriteId || Sprite._counter++;
        sprite.bitmap = new Bitmap();
        sprite.fogName = fog.name;
        sprite.fogHue = fog.hue;
        sprite.blendMode = fog.blend;
        sprite.z = fog.z;
        sprite.move(0, 0, Graphics.width, Graphics.height);

        bitmap.addLoadListener(this.setFogSpriteBitmap.bind(this, sprite, bitmap));

        this._fogEffects[fogId] = sprite;
        // Subtractive blend above certain depth => place above all
        if (fog.blend === 2 && fog.z > 3) {
            this.addChild(sprite);
        } else {
            // Typically, place on the _battleField with other battler sprites
            this._battleField.addChild(sprite);
        }
    };

    Spriteset_Battle.prototype.deleteFog = function(fogId) {
        if (this._fogEffects[fogId]) {
            this._battleField.removeChild(this._fogEffects[fogId]);
            this.removeChild(this._fogEffects[fogId]);
            this._fogEffects[fogId] = null;
        }
    };

    Spriteset_Battle.prototype.validFog = function(fogId) {
        const fog = $gameScreen.fog(fogId);
        // Must exist and must be a battle fog
        return fog && fog.isBattleFog();
    };

    Spriteset_Battle.prototype.sortBattleSprites = function() {
        // This sorts the children of the battleField by their z property
        // Important for proper layering of fog effects with battlers
        if (this._battleField && this._battleField.children.length > 0) {
            this._battleField.children.sort((a, b) => {
                if ((a.z || 0) !== (b.z || 0)) {
                    return (a.z || 0) - (b.z || 0);
                } else if ((a.y || 0) !== (b.y || 0)) {
                    return (a.y || 0) - (b.y || 0);
                } else {
                    return a.spriteId - b.spriteId;
                }
            });
        }
    };

    //--------------------------------------------------------------------------
    // Game_Fog - Manages individual fog properties
    //--------------------------------------------------------------------------
})();

// ----------------------------------------------------------------------------
// Game_Fog
// ----------------------------------------------------------------------------
function Game_Fog() {
    this.initialize(...arguments);
}

Game_Fog.prototype.initialize = function() {
    this.initBasic();
};

Game_Fog.prototype.initBasic = function() {
    this._name = "";
    this._hue = 0;
    this._blend = 0;
    this._depth = 1;
    this._moveX = 0;
    this._moveY = 0;
    this._panX = 1;
    this._panY = 1;
    this._zoom = 1;
    this._opacity = 192;
    this._battleFog = false;
    this._battleOnly = false;
    this._fixed = false;
    this._x = 0;
    this._y = 0;
    this._sX = 0;
    this._sY = 0;
    this._zoomTarget = 1;
    this._zoomDuration = 0;
    this._opacityTarget = 192;
    this._opacityDuration = 0;
};

Game_Fog.prototype.show = function(name, opacity, hue, blend, depth) {
    this._name = name;
    this._hue = hue;
    this._blend = blend;
    this._depth = depth;
    this._opacity = opacity;
    this._fixed = ImageManager.isFixedFog(name);
    this._battleFog = ImageManager.isBattleFog(name);
    this._battleOnly = ImageManager.isBattleOnlyFog(name);
    this._zoom = 1;
    this._zoomTarget = 1;
    this._opacityTarget = opacity;
};

Game_Fog.prototype.isBattleFog = function() {
    return this._battleFog || this._battleOnly;
};

Game_Fog.prototype.isBattleOnlyFog = function() {
    return this._battleOnly;
};

Object.defineProperties(Game_Fog.prototype, {
    x:        { get: function() { return this._x;      }, configurable: true },
    y:        { get: function() { return this._y;      }, configurable: true },
    hue:      { get: function() { return this._hue;    }, configurable: true },
    name:     { get: function() { return this._name;   }, configurable: true },
    zoom:     { get: function() { return this._zoom;   }, configurable: true },
    blend:    { get: function() { return this._blend;  }, configurable: true },
    opacity:  { get: function() { return this._opacity;}, configurable: true },
    z: {
        get: function() {
            // Depth to z-layers mapping:
            // [9, 9, 6, 4, 3.5, 2, 1, -1]
            // Indices: 0->9,1->9,2->6,3->4,4->3.5,5->2,6->1,7->-1
            const values = [9, 9, 6, 4, 3.5, 2, 1, -1];
            return values[this._depth] ?? 9;
        },
        configurable: true
    }
});

Game_Fog.prototype.erase = function() {
    this.initBasic();
};

Game_Fog.prototype.update = function() {
    this.updateMove();
    this.updateZoom();
    this.updateOpacity();
};

Game_Fog.prototype.pan = function(x, y) {
    // Pan is used as a multiplier to map movement
    // By default it's (1, 1).
    // We do a simple "max(..., 1)" from the original code, but that part is optional.
    // If you want negative or smaller multipliers, remove the clamp if desired.
    // For now, let's keep the original approach or a simpler one:
    this._panX = x !== 0 ? x : 1;
    this._panY = y !== 0 ? y : 1;
};

Game_Fog.prototype.move = function(x, y) {
    this._moveX = x;
    this._moveY = y;
};

Game_Fog.prototype.changeOpacity = function(opacity, duration) {
    this._opacityTarget = opacity;
    this._opacityDuration = duration;
    if (duration === 0) {
        this._opacity = opacity;
    }
};

Game_Fog.prototype.changeZoom = function(zoomPercent, duration) {
    this._zoomTarget = zoomPercent / 100;
    this._zoomDuration = duration;
    if (duration === 0) {
        this._zoom = this._zoomTarget;
    }
};

Game_Fog.prototype.updateMove = function() {
    // Original approach: 
    //  this._sX and _sY track the continuous shift from the movement
    //  Then we combine with map display coords.
    this._sX += this._moveX / $gameMap.tileWidth() / 2;
    this._sY += this._moveY / $gameMap.tileHeight() / 2;
    
    const mapX = $gameMap.fogX();
    const mapY = $gameMap.fogY();
    const tW = $gameMap.tileWidth();
    const tH = $gameMap.tileHeight();

    if (this._fixed) {
        // Moves exactly with map, ignoring pan multipliers
        this._x = (mapX + this._sX) * tW;
        this._y = (mapY + this._sY) * tH;
    } else {
        // Panning offsets
        this._x = (mapX * this._panX + this._sX) * tW / 2;
        this._y = (mapY * this._panY + this._sY) * tH / 2;
    }
};

Game_Fog.prototype.updateOpacity = function() {
    if (this._opacityDuration > 0) {
        const d = this._opacityDuration;
        this._opacity = (this._opacity * (d - 1) + this._opacityTarget) / d;
        this._opacityDuration--;
    }
};

Game_Fog.prototype.updateZoom = function() {
    if (this._zoomDuration > 0) {
        const d = this._zoomDuration;
        this._zoom = (this._zoom * (d - 1) + this._zoomTarget) / d;
        this._zoomDuration--;
    }
};
