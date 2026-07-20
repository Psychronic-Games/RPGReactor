/*:
 * @target MZ
 * @plugindesc Multiple parallax backgrounds via plugin commands or map
 *             note tags. Layers auto-clear when changing maps.
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help
 * =====================================================================
 *  PSYCHRONIC_MultiParallaxMZ
 * =====================================================================
 * Add multiple scrolling parallax layers to any map. Layers can be
 * defined two ways:
 *
 *   1. MAP NOTE TAGS  - Static layers that always appear on a map.
 *   2. PLUGIN COMMANDS - Dynamic layers controlled by events at runtime.
 *
 * All extra parallax layers are automatically removed when the player
 * leaves the map, so you never have to worry about leftover layers
 * bleeding into the next map.
 *
 * =====================================================================
 *  LAYER PROPERTIES
 * =====================================================================
 *   layer / layerId  - Unique numeric ID. Note-tag layers auto-assign
 *                      IDs starting at 9000 if omitted.
 *   image / imageName - File in img/parallaxes/ (no .png extension).
 *                       "!" prefix = fixed to map camera.
 *   startX / startY   - Initial pixel offset (default: 0)
 *   scrollX / scrollY  - Scroll speed in px/frame (default: 0)
 *   z / zIndex         - Draw order (default: 0). Negative = behind
 *                        tiles, positive = above characters.
 *   opacity            - 0-255 (default: 255)
 *   blendMode          - 0=Normal, 1=Add, 2=Multiply, 3=Screen
 *
 * =====================================================================
 *  MAP NOTE TAGS
 * =====================================================================
 *   <MultiParallax>
 *   image: StarField
 *   scrollX: -1
 *   z: -1
 *   </MultiParallax>
 *
 * =====================================================================
 *  PLUGIN COMMANDS
 * =====================================================================
 * Supports both MZ-style (structured) and MV-style (text) commands.
 *
 *  MV-style (text):
 *   AddParallax layerId imageName startX startY scrollX scrollY zIndex [opacity] [blendMode]
 *   RemoveParallax layerId
 *
 * =====================================================================
 *  TERMS OF USE
 * =====================================================================
 * Free to use in commercial/non-commercial projects, with credit
 * "Psychronic Games".
 *
 * =====================================================================
 *  CHANGELOG
 * =====================================================================
 * v2.1 - Fixed note-tag parallaxes not showing on map transfer.
 *       - Fixed plugin-command parallaxes not displaying.
 *       - Added MV-style (code 356) text command support.
 *       - Added opacity and blendMode properties.
 * v2.0 - Added map note tag support (<MultiParallax> blocks).
 * v1.z - Clears all extraParallaxes upon leaving the map.
 * v1.y - Fixed null _parentID crashes.
 * v1.x - Original versions
 *
 * @command AddParallax
 * @text Add Parallax
 * @desc Adds a new parallax layer.
 *
 * @arg layerId
 * @type number
 * @text Layer ID
 * @desc Unique numeric ID for the layer (e.g. -1, 0, 1...)
 * @min -1000
 * @max 1000
 *
 * @arg imageName
 * @type file
 * @dir img/parallaxes
 * @text Image Name
 * @desc The parallax file in img/parallaxes (no extension)
 * @default
 *
 * @arg startX
 * @type number
 * @text Start X
 * @desc Initial X offset
 * @default 0
 * @min -5000
 * @max 5000
 *
 * @arg startY
 * @type number
 * @text Start Y
 * @desc Initial Y offset
 * @default 0
 * @min -5000
 * @max 5000
 *
 * @arg scrollX
 * @type number
 * @text Scroll X
 * @desc Horizontal scroll speed (can be negative)
 * @default 0
 * @min -1000
 * @max 1000
 *
 * @arg scrollY
 * @type number
 * @text Scroll Y
 * @desc Vertical scroll speed (can be negative)
 * @default 0
 * @min -1000
 * @max 1000
 *
 * @arg zIndex
 * @type number
 * @text Z Index
 * @desc Layer's zIndex relative to other sprites
 * @default 0
 * @min -1000
 * @max 1000
 *
 * @arg opacity
 * @type number
 * @text Opacity
 * @desc Layer opacity (0 = invisible, 255 = fully opaque)
 * @default 255
 * @min 0
 * @max 255
 *
 * @arg blendMode
 * @type number
 * @text Blend Mode
 * @desc 0=Normal, 1=Add, 2=Multiply, 3=Screen
 * @default 0
 * @min 0
 * @max 3
 *
 * @command RemoveParallax
 * @text Remove Parallax
 * @desc Removes an existing parallax layer.
 *
 * @arg layerId
 * @type number
 * @text Layer ID
 * @desc Which layer ID to remove?
 * @min -1000
 * @max 1000
 */

(() => {
    const pluginName = "PSYCHRONIC_MultiParallaxMZ";

    //=============================================================================
    // 1) Plugin-command parallax data in Game_System (for save/load)
    //    This is the ORIGINAL v1.z approach — proven to work.
    //=============================================================================
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._extraParallaxes = this._extraParallaxes || {};
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);
        $gameSystem._extraParallaxes = $gameSystem._extraParallaxes || {};
    };

    //=============================================================================
    // 2) Scene_Map — plugin-command sprite management (original v1.z approach)
    //=============================================================================

    const _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    Scene_Map.prototype.createDisplayObjects = function() {
        _Scene_Map_createDisplayObjects.call(this);
        this.reloadParallaxes();
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        this.removeAllParallaxSprites();
        _Scene_Map_terminate.call(this);
    };

    /**
     * Remove all plugin-command parallax sprites and clear data.
     */
    Scene_Map.prototype.removeAllParallaxSprites = function() {
        if (!this._spriteset || !this._spriteset._tilemap) {
            $gameSystem._extraParallaxes = {};
            return;
        }
        const tilemap = this._spriteset._tilemap;
        for (const key in $gameSystem._extraParallaxes) {
            const layer = $gameSystem._extraParallaxes[key];
            if (layer && layer.sprite && tilemap.children.includes(layer.sprite)) {
                tilemap.removeChild(layer.sprite);
            }
        }
        $gameSystem._extraParallaxes = {};
    };

    /**
     * Create sprites for all plugin-command layers and add to tilemap.
     */
    Scene_Map.prototype.reloadParallaxes = function() {
        if (!this._spriteset || !this._spriteset._tilemap) return;
        const tilemap = this._spriteset._tilemap;
        if (tilemap.destroyed) return;

        for (const key in $gameSystem._extraParallaxes) {
            const layer = $gameSystem._extraParallaxes[key];
            if (!layer) continue;

            if (!layer.sprite) {
                layer.sprite = this.makeParallaxSprite(layer);
            }
            if (layer.sprite.destroyed) {
                layer.sprite = this.makeParallaxSprite(layer);
            }
            if (layer.sprite.parent && layer.sprite.parent !== tilemap) {
                layer.sprite.parent.removeChild(layer.sprite);
            }
            if (!tilemap.children.includes(layer.sprite) && !tilemap.destroyed) {
                try {
                    tilemap.addChild(layer.sprite);
                } catch (err) {
                    console.warn("Failed to add parallax sprite to tilemap:", err);
                }
            }
        }
    };

    Scene_Map.prototype.makeParallaxSprite = function(layer) {
        const sprite = new TilingSprite();
        sprite.bitmap = ImageManager.loadParallax(layer.imageName);
        sprite.move(layer.x || 0, layer.y || 0, Graphics.width, Graphics.height);
        sprite.z = layer.zIndex || 0;
        sprite.spriteId = Sprite._counter++;
        if (layer.opacity !== undefined) sprite.opacity = layer.opacity;
        if (layer.blendMode !== undefined) sprite.blendMode = layer.blendMode;
        return sprite;
    };

    //=============================================================================
    // 3) Spriteset_Map — note-tag parallaxes stored on INSTANCE (not $gameSystem)
    //    This avoids the terminate/recreate lifecycle bug. Sprites are created
    //    lazily in the update loop once bitmaps are ready.
    //=============================================================================

    const _Spriteset_Map_createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
    Spriteset_Map.prototype.createLowerLayer = function() {
        _Spriteset_Map_createLowerLayer.call(this);
        this._noteParallaxLayers = {};
        this._parseMapNoteParallaxes();
    };

    Spriteset_Map.prototype._parseMapNoteParallaxes = function() {
        if (!$dataMap || !$dataMap.note) return;
        const note = $dataMap.note;
        const regex = /<MultiParallax>([\s\S]*?)<\/MultiParallax>/gi;
        let match;
        let autoId = 9000;

        while ((match = regex.exec(note)) !== null) {
            const block = match[1];
            const props = {};
            block.split('\n').forEach(line => {
                const kv = line.match(/^\s*(\w+)\s*:\s*(.+)\s*$/);
                if (kv) props[kv[1].toLowerCase()] = kv[2].trim();
            });

            if (!props.image) continue;

            const layerId   = props.layer !== undefined ? Number(props.layer) : autoId++;
            const imageName = props.image;

            this._noteParallaxLayers[layerId] = {
                imageName,
                x:         Number(props.startx || 0),
                y:         Number(props.starty || 0),
                scrollX:   Number(props.scrollx || 0),
                scrollY:   Number(props.scrolly || 0),
                zIndex:    Number(props.z || 0),
                opacity:   props.opacity !== undefined ? Number(props.opacity) : 255,
                blendMode: Number(props.blendmode || 0),
                isFixed:   imageName.startsWith("!"),
                sprite:    null,
                bitmap:    ImageManager.loadParallax(imageName)
            };
        }
    };

    //=============================================================================
    // 4) Spriteset_Map update — handles BOTH plugin-command scroll AND
    //    note-tag sprite creation/scroll in one loop.
    //=============================================================================
    const _Spriteset_Map_update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _Spriteset_Map_update.call(this);
        this._updatePluginCommandParallaxes();
        this._updateNoteParallaxes();
    };

    // Update scroll for plugin-command layers (sprites managed by Scene_Map)
    Spriteset_Map.prototype._updatePluginCommandParallaxes = function() {
        const list = $gameSystem._extraParallaxes;
        for (const key in list) {
            const layer = list[key];
            if (layer && layer.sprite && !layer.sprite.destroyed) {
                if (layer.isFixed) {
                    layer.sprite.origin.x = (layer.x || 0) + Math.floor($gameMap.displayX() * $gameMap.tileWidth());
                    layer.sprite.origin.y = (layer.y || 0) + Math.floor($gameMap.displayY() * $gameMap.tileHeight());
                } else {
                    layer.sprite.origin.x += layer.scrollX;
                    layer.sprite.origin.y += layer.scrollY;
                }
            }
        }
    };

    // Create sprites and update scroll for note-tag layers (instance-owned)
    Spriteset_Map.prototype._updateNoteParallaxes = function() {
        if (!this._tilemap || !this._noteParallaxLayers) return;
        const tilemap = this._tilemap;

        for (const key in this._noteParallaxLayers) {
            const layer = this._noteParallaxLayers[key];
            if (!layer) continue;

            // Wait for bitmap
            if (!layer.bitmap || !layer.bitmap.isReady()) continue;

            // Create sprite once bitmap is ready
            if (!layer.sprite || layer.sprite.destroyed) {
                const sprite = new TilingSprite();
                sprite.bitmap = layer.bitmap;
                sprite.move(layer.x || 0, layer.y || 0, Graphics.width, Graphics.height);
                sprite.z = layer.zIndex || 0;
                sprite.spriteId = Sprite._counter++;
                if (layer.opacity !== undefined) sprite.opacity = layer.opacity;
                if (layer.blendMode !== undefined) sprite.blendMode = layer.blendMode;
                layer.sprite = sprite;
            }

            // Add to tilemap if not present
            if (layer.sprite.parent !== tilemap) {
                if (layer.sprite.parent) {
                    layer.sprite.parent.removeChild(layer.sprite);
                }
                tilemap.addChild(layer.sprite);
            }

            // Update scroll
            if (layer.isFixed) {
                layer.sprite.origin.x = (layer.x || 0) + Math.floor($gameMap.displayX() * $gameMap.tileWidth());
                layer.sprite.origin.y = (layer.y || 0) + Math.floor($gameMap.displayY() * $gameMap.tileHeight());
            } else {
                layer.sprite.origin.x += layer.scrollX;
                layer.sprite.origin.y += layer.scrollY;
            }
        }
    };

    // Clean up note-tag sprites on destroy
    const _Spriteset_Map_destroy = Spriteset_Map.prototype.destroy;
    Spriteset_Map.prototype.destroy = function(options) {
        if (this._noteParallaxLayers) {
            for (const key in this._noteParallaxLayers) {
                const layer = this._noteParallaxLayers[key];
                if (layer && layer.sprite && layer.sprite.parent) {
                    layer.sprite.parent.removeChild(layer.sprite);
                }
            }
            this._noteParallaxLayers = {};
        }
        _Spriteset_Map_destroy.call(this, options);
    };

    //=============================================================================
    // 5) Plugin Commands — MZ-style (code 357)
    //=============================================================================

    function addParallaxLayer(layerId, imageName, startX, startY, scrollX, scrollY, zIndex, opacity, blendMode) {
        const isFixed = imageName.startsWith("!");

        $gameSystem._extraParallaxes[layerId] = {
            imageName,
            x:         startX,
            y:         startY,
            scrollX:   scrollX,
            scrollY:   scrollY,
            zIndex:    zIndex,
            isFixed,
            opacity:   opacity,
            blendMode: blendMode,
            sprite:    null
        };

        const scene = SceneManager._scene;
        if (scene instanceof Scene_Map) {
            scene.reloadParallaxes();
        }
    }

    function removeParallaxLayer(layerId) {
        const layer = $gameSystem._extraParallaxes[layerId];
        if (!layer) return;

        const scene = SceneManager._scene;
        if (scene instanceof Scene_Map && scene._spriteset?._tilemap) {
            const tilemap = scene._spriteset._tilemap;
            if (tilemap && tilemap.children.includes(layer.sprite)) {
                tilemap.removeChild(layer.sprite);
            }
        }
        delete $gameSystem._extraParallaxes[layerId];
    }

    PluginManager.registerCommand(pluginName, "AddParallax", args => {
        addParallaxLayer(
            Number(args.layerId),
            args.imageName || "",
            Number(args.startX || 0),
            Number(args.startY || 0),
            Number(args.scrollX || 0),
            Number(args.scrollY || 0),
            Number(args.zIndex || 0),
            args.opacity !== undefined ? Number(args.opacity) : 255,
            Number(args.blendMode || 0)
        );
    });

    PluginManager.registerCommand(pluginName, "RemoveParallax", args => {
        removeParallaxLayer(Number(args.layerId));
    });

    //=============================================================================
    // 6) Plugin Commands — MV-style (code 356, text-based)
    //=============================================================================
    const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);

        if (command === "AddParallax") {
            addParallaxLayer(
                Number(args[0] || 0),
                args[1] || "",
                Number(args[2] || 0),
                Number(args[3] || 0),
                Number(args[4] || 0),
                Number(args[5] || 0),
                Number(args[6] || 0),
                args[7] !== undefined ? Number(args[7]) : 255,
                Number(args[8] || 0)
            );
        } else if (command === "RemoveParallax") {
            removeParallaxLayer(Number(args[0] || 0));
        }
    };

    //=============================================================================
    // 7) Clear sprites before saving (don't bloat save file)
    //=============================================================================
    const _Game_System_onBeforeSave = Game_System.prototype.onBeforeSave;
    Game_System.prototype.onBeforeSave = function() {
        _Game_System_onBeforeSave.call(this);
        for (const key in this._extraParallaxes) {
            const layer = this._extraParallaxes[key];
            if (layer) {
                layer.sprite = null;
            }
        }
    };

    //=============================================================================
    // 8) (Optional) Integer pixel snapping
    //=============================================================================
    const _Spriteset_Map_createTilemap = Spriteset_Map.prototype.createTilemap;
    Spriteset_Map.prototype.createTilemap = function() {
        _Spriteset_Map_createTilemap.call(this);
    };
})();
