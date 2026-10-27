//=============================================================================
// reactor_core_display.js v1.7.0
//=============================================================================
// Sprite, Tilemap, TilingSprite, ScreenSprite, Window, WindowLayer, Weather, ColorFilter and Stage.
// Part of reactor_core.js; loads after reactor_core.js.

//-----------------------------------------------------------------------------
/**
 * The basic object that is rendered to the game screen.
 *
 * @class
 * @extends PIXI.Sprite
 * @param {Bitmap} bitmap - The image for the sprite.
 */
function Sprite() {
    this.initialize(...arguments);
}

Sprite.prototype = Object.create(PIXI.Sprite.prototype);
Sprite.prototype.constructor = Sprite;

Sprite.prototype.initialize = function(bitmap) {
    if (!Sprite._emptyBaseTexture) {
        Sprite._emptyBaseTexture = new PIXI.BaseTexture();
        Sprite._emptyBaseTexture.setSize(1, 1);
    }
    const frame = new Rectangle();
    const texture = PIXICreateTexture(Sprite._emptyBaseTexture, frame);
    PIXISuper(PIXI.Sprite, this, [texture]);
    this.spriteId = Sprite._counter++;
    this._bitmap = bitmap;
    this._frame = frame;
    this._hue = 0;
    this._blendColor = [0, 0, 0, 0];
    this._colorTone = [0, 0, 0, 0];
    this._colorFilter = null;
    this._blendMode = PIXI.BLEND_MODES.NORMAL;
    this._hidden = false;
    this._onBitmapChange();
};

Sprite._emptyBaseTexture = null;
Sprite._counter = 0;

/**
 * The image for the sprite.
 *
 * @type Bitmap
 * @name Sprite#bitmap
 */
Object.defineProperty(Sprite.prototype, "bitmap", {
    get: function() {
        return this._bitmap;
    },
    set: function(value) {
        if (this._bitmap !== value) {
            this._bitmap = value;
            this._onBitmapChange();
        }
    },
    configurable: true
});

/**
 * The width of the sprite without the scale.
 *
 * @type number
 * @name Sprite#width
 */
Object.defineProperty(Sprite.prototype, "width", {
    get: function() {
        return this._frame.width;
    },
    set: function(value) {
        this._frame.width = value;
        this._refresh();
    },
    configurable: true
});

/**
 * The height of the sprite without the scale.
 *
 * @type number
 * @name Sprite#height
 */
Object.defineProperty(Sprite.prototype, "height", {
    get: function() {
        return this._frame.height;
    },
    set: function(value) {
        this._frame.height = value;
        this._refresh();
    },
    configurable: true
});

/**
 * The opacity of the sprite (0 to 255).
 *
 * @type number
 * @name Sprite#opacity
 */
Object.defineProperty(Sprite.prototype, "opacity", {
    get: function() {
        return this.alpha * 255;
    },
    set: function(value) {
        this.alpha = Math.min(Math.max(value, 0), 255) / 255;
    },
    configurable: true
});

/**
 * The blend mode to be applied to the sprite.
 *
 * @type number
 * @name Sprite#blendMode
 */
// Capture PIXI.Container's blendMode descriptor (if it's a getter/setter on
// the running PIXI version, which it is on v8). MZ's blendMode setter below
// uses this to propagate the assignment to PIXI's render-pipeline state
// (`localBlendMode`); without this, sprite.blendMode = 'multiply' silently
// only updates an internal `_blendMode` field that the v8 batcher never reads,
// so the sprite renders with default ('normal') blending.
const _pixiContainerBlendModeDesc = (function() {
    if (!PIXI.Container || !PIXI.Container.prototype) return null;
    let proto = PIXI.Container.prototype;
    let depth = 0;
    while (proto && proto !== Object.prototype && depth < 10) {
        const desc = Object.getOwnPropertyDescriptor(proto, "blendMode");
        if (desc && (desc.get || desc.set)) return desc;
        proto = Object.getPrototypeOf(proto);
        depth++;
    }
    return null;
})();

// v5/v6 used numeric blend-mode constants (PIXI.BLEND_MODES.ADD === 1).
// MZ data files (animations, plugins) store these numeric values directly --
// e.g. Sprite_AnimationMV.updateCellSprite does `sprite.blendMode = cell[7]`
// where cell[7] is 0..3. v8 expects strings ('normal' | 'add' | 'multiply' |
// 'screen' | ...); a numeric value silently falls back to default 'normal',
// which kills the additive-glow look on animations (visually reads as "no
// transparency" because additive blends naturally fade-edge into the scene
// whereas normal blends look solid).
const _MZ_BLEND_NUM_TO_STR = {
    0: "normal", 1: "add", 2: "multiply", 3: "screen"
};
const _normalizeBlendMode = function(value) {
    if (typeof value === "number" && value in _MZ_BLEND_NUM_TO_STR) {
        return _MZ_BLEND_NUM_TO_STR[value];
    }
    return value;
};

Object.defineProperty(Sprite.prototype, "blendMode", {
    get: function() {
        if (this._colorFilter) {
            return this._colorFilter.blendMode;
        } else {
            return this._blendMode;
        }
    },
    set: function(value) {
        const normalized = _normalizeBlendMode(value);
        this._blendMode = normalized;
        if (this._colorFilter) {
            this._colorFilter.blendMode = normalized;
        }
        // v8: forward to PIXI Container's own blendMode setter so the value
        // reaches localBlendMode and the render group structure flags. The
        // descriptor lookup is null on PIXI versions where blendMode is a
        // plain property (v5/v6/v7), so this is a no-op there.
        if (_pixiContainerBlendModeDesc && _pixiContainerBlendModeDesc.set) {
            _pixiContainerBlendModeDesc.set.call(this, normalized);
        }
    },
    configurable: true
});

/**
 * Destroys the sprite.
 */
Sprite.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.Sprite.prototype.destroy.call(this, options);
};

/**
 * Updates the sprite for each frame.
 */
Sprite.prototype.update = function() {
    if (this.visible && this.worldVisible !== false && this._bitmap) {
        this._bitmap._updateAnimatedImage();
    }
    // Indexed: runs every frame for every node, and allocates nothing.
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.update) {
            child.update();
        }
    }
};

/**
 * Makes the sprite "hidden".
 */
Sprite.prototype.hide = function() {
    this._hidden = true;
    this.updateVisibility();
};

/**
 * Releases the "hidden" state of the sprite.
 */
Sprite.prototype.show = function() {
    this._hidden = false;
    this.updateVisibility();
};

/**
 * Reflects the "hidden" state of the sprite to the visible state.
 */
Sprite.prototype.updateVisibility = function() {
    this.visible = !this._hidden;
};

/**
 * Sets the x and y at once.
 *
 * @param {number} x - The x coordinate of the sprite.
 * @param {number} y - The y coordinate of the sprite.
 */
Sprite.prototype.move = function(x, y) {
    this.x = x;
    this.y = y;
};

/**
 * Sets the rectagle of the bitmap that the sprite displays.
 *
 * @param {number} x - The x coordinate of the frame.
 * @param {number} y - The y coordinate of the frame.
 * @param {number} width - The width of the frame.
 * @param {number} height - The height of the frame.
 */
Sprite.prototype.setFrame = function(x, y, width, height) {
    this._refreshFrame = false;
    const frame = this._frame;
    frame.x = x;
    frame.y = y;
    frame.width = width;
    frame.height = height;
    // Always refresh, even when the frame values are unchanged: the bitmap's
    // base texture can be swapped underneath the sprite (image processing
    // plugins redraw shared bitmaps like the windowskin), leaving the sprite
    // rendering a stale source with a stale frame. _refresh only rebuilds the
    // texture when the source or frame actually differs, so this is cheap.
    this._refresh();
};

/**
 * Sets the hue rotation value.
 *
 * @param {number} hue - The hue value (-360, 360).
 */
Sprite.prototype.setHue = function(hue) {
    if (this._hue !== Number(hue)) {
        this._hue = Number(hue);
        this._updateColorFilter();
    }
};

/**
 * Gets the blend color for the sprite.
 *
 * @returns {array} The blend color [r, g, b, a].
 */
Sprite.prototype.getBlendColor = function() {
    return this._blendColor.clone();
};

/**
 * Sets the blend color for the sprite.
 *
 * @param {array} color - The blend color [r, g, b, a].
 */
Sprite.prototype.setBlendColor = function(color) {
    if (!(color instanceof Array)) {
        throw new Error("Argument must be an array");
    }
    if (!this._blendColor.equals(color)) {
        this._blendColor = color.clone();
        this._updateColorFilter();
    }
};

/**
 * Gets the color tone for the sprite.
 *
 * @returns {array} The color tone [r, g, b, gray].
 */
Sprite.prototype.getColorTone = function() {
    return this._colorTone.clone();
};

/**
 * Sets the color tone for the sprite.
 *
 * @param {array} tone - The color tone [r, g, b, gray].
 */
Sprite.prototype.setColorTone = function(tone) {
    if (!(tone instanceof Array)) {
        throw new Error("Argument must be an array");
    }
    if (!this._colorTone.equals(tone)) {
        this._colorTone = tone.clone();
        this._updateColorFilter();
    }
};

Sprite.prototype._onBitmapChange = function() {
    if (this._bitmap) {
        this._refreshFrame = true;
        this._bitmap.addLoadListener(this._onBitmapLoad.bind(this));
    } else {
        this._refreshFrame = false;
        this.texture.frame = new Rectangle();
    }
};

Sprite.prototype._onBitmapLoad = function(bitmapLoaded) {
    if (bitmapLoaded === this._bitmap) {
        if (this._refreshFrame && this._bitmap) {
            this._refreshFrame = false;
            this._frame.width = this._bitmap.width;
            this._frame.height = this._bitmap.height;
        }
    }
    this._refresh();
};

Sprite.prototype._refresh = function() {
    const texture = this.texture;
    const frameX = Math.floor(this._frame.x);
    const frameY = Math.floor(this._frame.y);
    const frameW = Math.floor(this._frame.width);
    const frameH = Math.floor(this._frame.height);
    const baseTexture = this._bitmap ? this._bitmap.baseTexture : null;
    const baseTextureW = baseTexture ? baseTexture.width : 0;
    const baseTextureH = baseTexture ? baseTexture.height : 0;
    // Number#clamp boxes its number on each call; this runs for every sprite every frame.
    const realX = Math.min(Math.max(frameX, 0), baseTextureW);
    const realY = Math.min(Math.max(frameY, 0), baseTextureH);
    const realW = Math.min(Math.max(frameW - realX + frameX, 0), baseTextureW - realX);
    const realH = Math.min(Math.max(frameH - realY + frameY, 0), baseTextureH - realY);
    if (texture) {
        this.pivot.x = frameX - realX;
        this.pivot.y = frameY - realY;
        if (baseTexture) {
            if (PIXI.TextureSource && baseTexture.source) {
                // v8: REPLACE the whole texture rather than mutating its
                // source. Mutating doesn't invalidate sprite's cached bounds
                // (which were captured from the initial 1x1 empty stub) so
                // the sprite keeps rendering at 1x1 despite the new source.
                // Creating a fresh Texture resets all internal caches.
                // The Rectangle is only built on actual change — setFrame
                // refreshes unconditionally every frame, so the no-change
                // path must stay allocation-free.
                if (this.texture.source !== baseTexture.source ||
                    this.texture.frame.x !== realX ||
                    this.texture.frame.y !== realY ||
                    this.texture.frame.width !== realW ||
                    this.texture.frame.height !== realH) {
                    if (this.texture.__rrSpriteOwned && this.texture.source === baseTexture.source
                        && !this.texture.destroyed) {
                        // The sprite's own texture on the same source: move
                        // its frame. A dynamic texture tells its sprite on
                        // update(), which is what refreshes the bounds that a
                        // silent mutation once left at the 1x1 stub. Walk
                        // cycles and blinking pause signs used to build a
                        // texture per frame change here.
                        const frame = this.texture.frame;
                        frame.x = realX;
                        frame.y = realY;
                        frame.width = realW;
                        frame.height = realH;
                        this.texture.update();
                    } else {
                        // A new source (or the shared initial texture): the
                        // sprite gets a texture of its own. The replaced one
                        // must be destroyed when this path made it: the v8
                        // Texture constructor subscribes to the session-lived
                        // source's resize event and would be retained forever.
                        const old = this.texture;
                        this.texture = new PIXI.Texture({
                            source: baseTexture.source,
                            frame: new Rectangle(realX, realY, realW, realH),
                            dynamic: true
                        });
                        this.texture.__rrSpriteOwned = true;
                        if (old && old.__rrSpriteOwned && !old.destroyed) {
                            old.destroy();
                        }
                    }
                }
            } else {
                // v5/v6/v7 mutation path.
                texture.baseTexture = baseTexture;
                try {
                    texture.frame = new Rectangle(realX, realY, realW, realH);
                } catch (e) {
                    texture.frame = new Rectangle();
                }
            }
        }
        texture._updateID++;
    }
};

Sprite.prototype._createColorFilter = function() {
    this._colorFilter = new ColorFilter();
    if (this._colorFilter.allowNeutralSpriteSkip) this._colorFilter.allowNeutralSpriteSkip(this);
    // v8: container.filters is a setter that may store a frozen copy, so
    // .push() on the existing array can fail. Build a fresh array and assign.
    const filters = this.filters ? this.filters.slice() : [];
    filters.push(this._colorFilter);
    this.filters = filters;
};

Sprite.prototype._updateColorFilter = function() {
    if (!this._colorFilter) {
        this._createColorFilter();
    }
    this._colorFilter.setHue(this._hue);
    this._colorFilter.setBlendColor(this._blendColor);
    this._colorFilter.setColorTone(this._colorTone);
};

//-----------------------------------------------------------------------------
/**
 * The tilemap which displays 2D tile-based game map.
 *
 * @class
 * @extends PIXI.Container
 */
function Tilemap() {
    this.initialize(...arguments);
}

Tilemap.prototype = Object.create(PIXI.Container.prototype);
Tilemap.prototype.constructor = Tilemap;

Tilemap.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);

    this._width = Graphics.width;
    this._height = Graphics.height;
    this._margin = 20;
    this._mapWidth = 0;
    this._mapHeight = 0;
    this._mapData = null;
    this._bitmaps = [];

    /**
     * The width of each tile.
     *
     * @type number
     */
    this.tileWidth = 48;

    /**
     * The height of each tile.
     *
     * @type number
     */
    this.tileHeight = 48;

    /**
     * The origin point of the tilemap for scrolling.
     *
     * @type Point
     */
    this.origin = new Point();

    /**
     * The tileset flags.
     *
     * @type array
     */
    this.flags = [];

    /**
     * The animation count for autotiles.
     *
     * @type number
     */
    this.animationCount = 0;

    /**
     * Whether the tilemap loops horizontal.
     *
     * @type boolean
     */
    this.horizontalWrap = false;

    /**
     * Whether the tilemap loops vertical.
     *
     * @type boolean
     */
    this.verticalWrap = false;

    this._createLayers();
    this.refresh();

    // v8: repaint runs from the update() tail, but a plugin is free to
    // replace Tilemap.prototype.update with a copy of the stock MZ body
    // (MultiTweaks' animation-speed tweak does), which on v5 was fine
    // because PIXI itself invoked updateTransform during render. Self-heal
    // from the per-frame render callback: if this frame's preparation has
    // not happened by render time, do it here, exactly once.
    if (PIXI.TextureSource) {
        this.onRender = () => {
            if (this._v8PreparedFrame !== Graphics.frameCount) {
                this._prepareV8Frame();
            }
        };
    }
};

/**
 * The width of the tilemap.
 *
 * @type number
 * @name Tilemap#width
 */
Object.defineProperty(Tilemap.prototype, "width", {
    get: function() {
        return this._width;
    },
    set: function(value) {
        this._width = value;
    },
    configurable: true
});

/**
 * The height of the tilemap.
 *
 * @type number
 * @name Tilemap#height
 */
Object.defineProperty(Tilemap.prototype, "height", {
    get: function() {
        return this._height;
    },
    set: function(value) {
        this._height = value;
    },
    configurable: true
});

/**
 * Destroys the tilemap.
 */
Tilemap.prototype.destroy = function() {
    if (this._rrChunks) this._rrLeaveChunks();
    const options = { children: true, texture: true };
    PIXI.Container.prototype.destroy.call(this, options);
};

/**
 * Sets the tilemap data.
 *
 * @param {number} width - The width of the map in number of tiles.
 * @param {number} height - The height of the map in number of tiles.
 * @param {array} data - The one dimensional array for the map data.
 */
Tilemap.prototype.setData = function(width, height, data) {
    this._mapWidth = width;
    this._mapHeight = height;
    this._mapData = data;
};

/**
 * Checks whether the tileset is ready to render.
 *
 * @type boolean
 * @returns {boolean} True if the tilemap is ready.
 */
Tilemap.prototype.isReady = function() {
    for (const bitmap of this._bitmaps) {
        if (bitmap && !bitmap.isReady()) {
            return false;
        }
    }
    return true;
};

/**
 * Updates the tilemap for each frame.
 */
Tilemap.prototype.update = function() {
    this.animationCount++;
    this.animationFrame = Math.floor(this.animationCount / (this._rrWater ? this._rrWater.step : 30));
    if (this._rrTileFrames) {
        const step = Math.floor(this.animationCount / 6);
        if (step !== this._rrTileStep) {
            this._rrTileStep = step;
            this._needsRepaint = true;
        }
    }
    // Indexed: runs every frame for every node, and allocates nothing.
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.update) {
            child.update();
        }
    }
    // v8: repaint, sort and plugin layer positioning live in updateTransform.
    // Drive the complete plugin-wrapped chain once from the MZ update path.
    // A second invocation from PIXI's render preparation can reposition and
    // rebuild independently sorted row layers after some render groups have
    // already been prepared, showing moving seams through tall objects.
    // The frame stamp keeps the onRender fallback (see initialize) from
    // running preparation a second time in the same frame.
    if (PIXI.TextureSource) {
        this._prepareV8Frame();
    }
};

Tilemap.prototype._prepareV8Frame = function() {
    this._v8PreparedFrame = Graphics.frameCount;
    // The try/catch matches the onRender bridge's semantics: plugin
    // updateTransform chains that end in the legacy no-args
    // PIXI.Container.updateTransform (UltraMode7 does) throw on v8 after
    // their real work is done, and that throw is expected and non-fatal.
    try {
        this.updateTransform();
    } catch (e) { /* legacy PIXI tail; repaint work already done */ }
    // A plugin's updateTransform that paints by itself (UltraMode7 drawing
    // the map) skips the chunk check: its blocks go, and the stats say why.
    if (this._rrCheckedFrame !== this._v8PreparedFrame) this._rrChunksSkipped();
    this._syncV8TileLayers();
};

Tilemap.prototype._rrChunksSkipped = function() {
    if (this._rrChunks) this._rrLeaveChunks();
    const hidden = this._lowerLayer && this._lowerLayer.visible === false &&
        this._upperLayer && this._upperLayer.visible === false;
    const stats = Tilemap.Layer._v8Stats();
    stats.chunked = false;
    stats.chunkFallback = hidden ? "hidden" : (Tilemap.ChunkPaint.gateReason() || "plugin updateTransform");
};

Tilemap.prototype._syncV8TileLayers = function() {
    // Every child with a mesh backend, then the two canonical layers when a
    // plugin holds them outside the child list; each once. Runs every frame,
    // so it walks the list instead of building a Set and a closure for it.
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child && typeof child._syncV8Backend === "function") child._syncV8Backend();
    }
    const lower = this._lowerLayer;
    const upper = this._upperLayer;
    if (lower && children.indexOf(lower) < 0 && typeof lower._syncV8Backend === "function") {
        lower._syncV8Backend();
    }
    if (upper && upper !== lower && children.indexOf(upper) < 0 && typeof upper._syncV8Backend === "function") {
        upper._syncV8Backend();
    }
};

/**
 * Sets the bitmaps used as a tileset.
 *
 * @param {array} bitmaps - The array of the tileset bitmaps.
 */
Tilemap.prototype.setBitmaps = function(bitmaps) {
    // [Note] We wait for the images to finish loading. Creating textures
    //   from bitmaps that are not yet loaded here brings some maintenance
    //   difficulties. e.g. PIXI overwrites img.onload internally.
    this._bitmaps = bitmaps;
    const listener = this._updateBitmaps.bind(this);
    for (const bitmap of this._bitmaps) {
        if (!bitmap.isReady()) {
            bitmap.addLoadListener(listener);
        }
    }
    this._needsBitmapsUpdate = true;
    this._updateBitmaps();
};

/**
 * Forces to repaint the entire tilemap.
 */
Tilemap.prototype.refresh = function() {
    if (this._rrAllTileFrames) this._rrKeepUsedTileFrames();
    this._needsRepaint = true;
};

/**
 * Updates the transform on all children of this container for rendering.
 */
Tilemap.prototype.updateTransform = function() {
    const ox = Math.ceil(this.origin.x);
    const oy = Math.ceil(this.origin.y);
    const startX = Math.floor((ox - this._margin) / this.tileWidth);
    const startY = Math.floor((oy - this._margin) / this.tileHeight);
    this._lowerLayer.x = startX * this.tileWidth - ox;
    this._lowerLayer.y = startY * this.tileHeight - oy;
    this._upperLayer.x = startX * this.tileWidth - ox;
    this._upperLayer.y = startY * this.tileHeight - oy;
    // Both layers hidden means a 3D map is standing in for them: painting
    // tiles nobody draws, every time the view crosses a tile, cost a mesh
    // rebuild per layer for nothing. The repaint waits until they show.
    const hidden = this._lowerLayer.visible === false && this._upperLayer.visible === false;
    const chunked = !hidden && this._rrChunkBlocker() === null && this._rrPaintChunks(startX, startY);
    if (!chunked && this._rrChunks) this._rrLeaveChunks();
    if (
        !chunked && !hidden && (
        this._needsRepaint ||
        this._lastAnimationFrame !== this.animationFrame ||
        this._lastStartX !== startX ||
        this._lastStartY !== startY)
    ) {
        this._lastAnimationFrame = this.animationFrame;
        this._lastStartX = startX;
        this._lastStartY = startY;
        this._addAllSpots(startX, startY);
        this._needsRepaint = false;
        // Keep direct plugin calls safe too: clear() hides the old mesh, so a
        // repaint must publish every replacement layer before returning.
        if (PIXI.TextureSource) this._syncV8TileLayers();
    }
    this._sortChildren();
    // v8: PIXI.Container.updateTransform is repurposed as a property-setter
    // that throws on no-args. v8 cascades transforms automatically via the
    // render pipeline, so skip the super call entirely there.
    if (!PIXI.TextureSource) {
        PIXI.Container.prototype.updateTransform.call(this);
    }
};

Tilemap.prototype._createLayers = function() {
    /*
     * [Z coordinate]
     *  0 : Lower tiles
     *  1 : Lower characters
     *  3 : Normal characters
     *  4 : Upper tiles
     *  5 : Upper characters
     *  6 : Airship shadow
     *  7 : Balloon
     *  8 : Animation
     *  9 : Destination
     */
    this._lowerLayer = new Tilemap.CombinedLayer();
    this._lowerLayer.z = 0;
    this._upperLayer = new Tilemap.CombinedLayer();
    this._upperLayer.z = 4;
    this.addChild(this._lowerLayer);
    this.addChild(this._upperLayer);
    this._needsRepaint = true;
};

Tilemap.prototype._updateBitmaps = function() {
    if (this._needsBitmapsUpdate && this.isReady()) {
        /*
         * Every tile layer on this tilemap, not only the two it made itself.
         *
         * On v5/v6/v7 the tile textures belonged to the shared renderer
         * plugin: one atlas, uploaded once, addressed by set number, and a
         * layer drew from it whether or not it had ever been handed the
         * tileset. v8 has no shared tile renderer, so each layer builds its
         * tiles out of its own image list -- and a layer that was never given
         * one silently drops every tile it is asked to draw, because there is
         * nothing to make a texture from and nothing to report.
         *
         * Plugins add layers here. TF_Billboard gives every ☆ tile that also
         * carries passage flags a layer of its own, so it can stand it up as a
         * billboard; on a wooded map those are the trees. Its layers are not
         * reachable from _lowerLayer or _upperLayer, so each tree lost exactly
         * the tiles that plugin had taken, in the shape of the tiles
         * themselves, with a clean console and an editor that looked correct
         * -- the editor runs no plugins.
         *
         * This runs behind isReady(), which is the point: handing out bitmaps
         * that have not decoded yet is worse than handing out none. See
         * _addV8Tile.
         */
        for (const child of this.children) {
            if (typeof child.setBitmaps === "function") {
                child.setBitmaps(this._bitmaps);
            }
        }
        // Named explicitly as well: a plugin is free to hold these outside the
        // child list, and they must be set up in that case too.
        if (this._lowerLayer && this._lowerLayer.parent !== this) {
            this._lowerLayer.setBitmaps(this._bitmaps);
        }
        if (this._upperLayer && this._upperLayer.parent !== this) {
            this._upperLayer.setBitmaps(this._bitmaps);
        }
        this._needsBitmapsUpdate = false;
        this._needsRepaint = true;
    }
};

Tilemap.prototype._addAllSpots = function(startX, startY) {
    this._lowerLayer.clear();
    this._upperLayer.clear();
    const widthWithMatgin = this.width + this._margin * 2;
    const heightWithMatgin = this.height + this._margin * 2;
    const tileCols = Math.ceil(widthWithMatgin / this.tileWidth) + 1;
    const tileRows = Math.ceil(heightWithMatgin / this.tileHeight) + 1;
    for (let y = 0; y < tileRows; y++) {
        for (let x = 0; x < tileCols; x++) {
            this._addSpot(startX, startY, x, y);
        }
    }
};

//-----------------------------------------------------------------------------
// Chunked painting (PIXI 8).
//
// The paint above rebuilds the whole view's tile mesh each time the view
// crosses a tile and each water frame. While every painting hook is the one
// this file defines, the map is painted SIZE x SIZE tiles at a time instead,
// each block its own mesh: the blocks the view needs are built at once, the
// ring around them one per frame ahead of time, and blocks far from the view
// are let go. The view moves the blocks; water and waterfalls change frame by
// a UV offset on their quads. A plugin hook anywhere on the painting path
// (other than one that provably hands every call straight on, see
// "Plugin hooks that hand straight on" below), a plugin's own tile layer, or
// tile frames from an import keep the paint above, unchanged. Blocks are
// checked against the map data one per frame, so a tile written without
// refresh() still shows.
//-----------------------------------------------------------------------------

Tilemap.ChunkPaint = {
    enabled: true,
    SIZE: 8,
    PREFETCH: 1,
    KEEP: 2,
    BUILDS_PER_FRAME: 1,
    POOL: 64,
    HOOKS: ["updateTransform", "_addAllSpots", "_addSpot", "_addSpotTile", "_addTile",
        "_addNormalTile", "_addAutotile", "_addTableEdge", "_addShadow", "_readMapData",
        "_isHigherTile", "_isTableTile", "_isOverpassPosition", "_createLayers"],
    stock: null,
    // A method the profiler (F10) wrapped still counts as the original.
    unwrap(fn) {
        while (fn && fn.__rrProfilerOriginal) fn = fn.__rrProfilerOriginal;
        return fn;
    }
};

// The tile layer inside one of the two canonical layers, when both are as
// this file makes them; null otherwise.
Tilemap.ChunkPaint.stockTileLayer = function(combined) {
    const stock = this.stock;
    if (!stock || !(combined instanceof Tilemap.CombinedLayer) ||
        !this.passes(combined.addRect, "combinedAddRect") ||
        !this.passes(combined.clear, "combinedClear")) return null;
    const children = combined.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (typeof child.addRect !== "function") continue;
        if (!(child instanceof Tilemap.Layer) ||
            !this.passes(child.addRect, "layerAddRect") ||
            !this.passes(child.clear, "layerClear")) return null;
    }
    const first = children[0];
    return first instanceof Tilemap.Layer && first._v8TileRoot ? first : null;
};

//-----------------------------------------------------------------------------
// Plugin hooks that hand straight on.
//
// A plugin that draws the map itself only on some maps (UltraMode7) hooks the
// painting path everywhere; on its other maps each hook calls the method it
// replaced, with the same arguments, and does nothing else. Such a hook
// counts as the stock method while all of these hold:
// - a plugin in GATES installed it: its script was running when the method
//   was assigned (the painting methods are watched from this file's load to
//   the first paint; anything assigned later has no known origin),
// - that plugin says it is not drawing the map (asked every frame),
// - run on a stand-in that records every read, write and call made on the
//   tilemap, on the arguments and on whatever those hand back, plus the
//   return value, the hook leaves the same record as the stock method, for
//   every probe call in PROBES.
// Verdicts are worked out again on a new map, and each one RECHECK checks
// after it was made (one per check); with passThrough off every hook keeps
// the full paint. A hook from any other
// source keeps the full paint even when it looks like a pass-through: it may
// count its calls or keep state outside the tilemap, which painting in blocks
// (fewer, different calls) would change.
//-----------------------------------------------------------------------------

Tilemap.ChunkPaint.passThrough = true;
Tilemap.ChunkPaint.RECHECK = 600;
Tilemap.ChunkPaint.PROBE_LIMIT = 5000;
// active(): true while the plugin draws the map itself, null while it is not installed.
Tilemap.ChunkPaint.GATES = [{
    plugin: "UltraMode7",
    active: () => typeof UltraMode7 === "undefined" ? null : !!UltraMode7.isActive(),
    reason: "UltraMode7 active",
    failed: "UltraMode7 check failed",
    state: null
}];
// The calls each painting method is probed with: tile ids of every kind the
// paint treats differently (still and moving water, waterfall, A1 rocks, A2
// table, A3 wall, A4 wall, A5, B, none); LAYER stands for a recorded layer.
Tilemap.ChunkPaint.LAYER = Symbol("layer");
Tilemap.ChunkPaint.PROBES = (L => ({
    updateTransform: [[]],
    _createLayers: [[]],
    _addAllSpots: [[3, 2]],
    _addSpot: [[3, 2, 1, 1]],
    _addSpotTile: [[2053, 24, 48], [5, 24, 48]],
    _addTile: [[L, 2053, 24, 48], [L, 5, 24, 48], [L, 0, 24, 48]],
    _addNormalTile: [[L, 5, 24, 48], [L, 1600, 24, 48]],
    _addAutotile: [[L, 2053, 24, 48], [L, 2101, 24, 48], [L, 2149, 24, 48], [L, 2250, 24, 48],
        [L, 2290, 24, 48], [L, 2967, 24, 48], [L, 4453, 24, 48], [L, 6323, 24, 48]],
    _addTableEdge: [[L, 2967, 24, 48]],
    _addShadow: [[L, 5, 24, 48]],
    _readMapData: [[3, 4, 1]],
    _isHigherTile: [[5]],
    _isTableTile: [[2967]],
    _isOverpassPosition: [[3, 4]],
    layerAddRect: [[1, 48, 96, 24, 0, 24, 24], [-1, 0, 0, 24, 24, 24, 24]],
    layerClear: [[]],
    combinedAddRect: [[1, 48, 96, 24, 0, 24, 24]],
    combinedClear: [[]]
}))(Tilemap.ChunkPaint.LAYER);
Tilemap.ChunkPaint.origins = new WeakMap();
Tilemap.ChunkPaint._verdicts = new Map();
Tilemap.ChunkPaint._verdictMap = null;
Tilemap.ChunkPaint._verdictSwitch = null;
Tilemap.ChunkPaint._checks = 0;
Tilemap.ChunkPaint._rejudged = false;
Tilemap.ChunkPaint._stockTraces = new Map();
Tilemap.ChunkPaint._watched = null;

/** The file name of the script running now ("" outside one): a plugin while it loads. */
Tilemap.ChunkPaint.scriptName = function() {
    const script = typeof document !== "undefined" ? document.currentScript : null;
    const src = script ? String(script._url || script.src || "") : "";
    const match = /([^/\\?#]+?)(?:\.js)?(?:[?#].*)?$/.exec(src);
    if (!match) return "";
    try {
        return decodeURIComponent(match[1]);
    } catch (e) {
        return match[1];
    }
};

// Until settle(), notes which script assigns each of these methods. An
// assignment through an instance or a subclass prototype lands there as its
// own property, as it would on a plain property.
Tilemap.ChunkPaint.watch = function(targets) {
    const C = this;
    const watched = [];
    for (const [proto, names] of targets) {
        for (const name of names) {
            const desc = Object.getOwnPropertyDescriptor(proto, name);
            if (!desc || !("value" in desc) || !desc.configurable) continue;
            const slot = { proto, name, value: desc.value, enumerable: desc.enumerable, get: null };
            slot.get = function() { return slot.value; };
            Object.defineProperty(proto, name, {
                configurable: true,
                enumerable: desc.enumerable,
                get: slot.get,
                set(value) {
                    if (typeof value === "function" && !C.origins.has(value)) {
                        const origin = C.scriptName();
                        if (origin) C.origins.set(value, origin);
                    }
                    if (this === proto) slot.value = value;
                    else Object.defineProperty(this, name, { value, writable: true, configurable: true, enumerable: true });
                }
            });
            watched.push(slot);
        }
    }
    this._watched = watched;
};

/** The watched methods back to plain properties, holding what plugins left there. */
Tilemap.ChunkPaint.settle = function() {
    const watched = this._watched;
    this._watched = null;
    if (!watched) return;
    for (const slot of watched) {
        const desc = Object.getOwnPropertyDescriptor(slot.proto, slot.name);
        if (!desc || desc.get !== slot.get) continue;
        Object.defineProperty(slot.proto, slot.name,
            { value: slot.value, writable: true, configurable: true, enumerable: slot.enumerable });
    }
};

/** The reason while a plugin in GATES draws the map itself, else null. */
Tilemap.ChunkPaint.gateReason = function() {
    const gates = this.GATES;
    for (let i = 0; i < gates.length; i++) {
        const gate = gates[i];
        let state;
        let reason = gate.reason;
        try {
            state = gate.active();
        } catch (e) {
            state = true;
            reason = gate.failed;
        }
        gate.state = state;
        if (state) {
            if (this._verdicts.size) this._verdicts.clear();
            return reason;
        }
    }
    return null;
};

// Verdicts hold for one map and while the switch stays as it was. Each is
// judged again RECHECK checks after it was made, one per check at most, so
// the work never lands on a single frame.
Tilemap.ChunkPaint.ageVerdicts = function() {
    const mapId = typeof $gameMap !== "undefined" && $gameMap && typeof $gameMap.mapId === "function" ?
        $gameMap.mapId() : 0;
    if (mapId !== this._verdictMap || this.passThrough !== this._verdictSwitch) {
        this._verdicts.clear();
        this._verdictMap = mapId;
        this._verdictSwitch = this.passThrough;
    }
    this._checks++;
    this._rejudged = false;
};

/** Whether `fn` stands in for the stock method `name`: { ok, reason }. */
Tilemap.ChunkPaint.verdict = function(fn, name) {
    let verdict = this._verdicts.get(fn);
    if (verdict && verdict.name === name) {
        if (this._checks - verdict.at <= this.RECHECK || this._rejudged) return verdict;
        this._rejudged = true;
    }
    const origin = (typeof fn === "function" && this.origins.get(fn)) || "";
    let ok = false;
    if (this.passThrough && origin) {
        const gates = this.GATES;
        for (let i = 0; i < gates.length; i++) {
            if (gates[i].plugin === origin && gates[i].state === false) {
                ok = this.probe(fn, name);
                break;
            }
        }
    }
    verdict = { name, ok, reason: ok ? "" : "plugin hook " + name + (origin ? " (" + origin + ")" : ""), at: this._checks };
    this._verdicts.set(fn, verdict);
    return verdict;
};

/** `fn` is the stock method `name`, or a plugin hook that stands in for it. */
Tilemap.ChunkPaint.passes = function(fn, name) {
    fn = this.unwrap(fn);
    return fn === this.stock[name] || this.verdict(fn, name).ok;
};

/** Every probe call in PROBES leaves the same record from `fn` as from the stock method. */
Tilemap.ChunkPaint.probe = function(fn, name) {
    const sets = this.PROBES[name];
    const stock = this.stock[name];
    if (!sets || typeof stock !== "function" || typeof fn !== "function") return false;
    for (let i = 0; i < sets.length; i++) {
        const key = name + "/" + i;
        let want = this._stockTraces.get(key);
        const makesLayers = name === "_createLayers";
        if (want === undefined) this._stockTraces.set(key, want = this.trace(stock, sets[i], makesLayers));
        if (want === null || this.trace(fn, sets[i], makesLayers) !== want) return false;
    }
    return true;
};

/**
 * Runs `fn` on a stand-in tilemap and returns, one line each and in order,
 * every read, write, call and number conversion made on the stand-in, on
 * LAYER arguments and on whatever those hand back, then the return value;
 * null when it throws or runs past PROBE_LIMIT. Every stand-in reads as 1.
 * makesLayers: Tilemap.CombinedLayer makes recorded stand-ins meanwhile.
 */
Tilemap.ChunkPaint.trace = function(fn, args, makesLayers) {
    const limit = this.PROBE_LIMIT;
    const log = [];
    const byPath = new Map();
    const pathOf = new WeakMap();
    const note = entry => {
        if (log.length >= limit) throw new Error("probe limit");
        log.push(entry);
    };
    const show = value => {
        if (typeof value === "string") return JSON.stringify(value);
        if (value === null || (typeof value !== "object" && typeof value !== "function")) return String(value);
        if (pathOf.has(value)) return pathOf.get(value);
        if (Array.isArray(value)) {
            return value.length > 64 ? "array " + value.length : "[" + value.map(show).join(", ") + "]";
        }
        return typeof value;
    };
    // One handler for every stand-in; each target knows its path.
    const targetPath = new WeakMap();
    const calls = new Map();
    const handler = {
        get(target, key) {
            const path = targetPath.get(target);
            if (key === Symbol.toPrimitive) return hint => { note(path + " as " + hint); return 1; };
            const name = path + "." + String(key);
            note("get " + name);
            return stand(name);
        },
        set(target, key, value) {
            note("set " + targetPath.get(target) + "." + String(key) + " = " + show(value));
            return true;
        },
        has(target, key) {
            note("has " + targetPath.get(target) + "." + String(key));
            return false;
        },
        deleteProperty(target, key) {
            note("delete " + targetPath.get(target) + "." + String(key));
            return true;
        },
        apply(target, self, callArgs) {
            const path = targetPath.get(target);
            note("call " + path + " on " + show(self) + " (" + callArgs.map(show).join(", ") + ")");
            const n = calls.get(path) || 0;
            calls.set(path, n + 1);
            return stand(path + "()" + n);
        }
    };
    const stand = path => {
        let proxy = byPath.get(path);
        if (proxy) return proxy;
        if (path.length > 512) throw new Error("probe limit");
        const target = () => {};
        targetPath.set(target, path);
        proxy = new Proxy(target, handler);
        byPath.set(path, proxy);
        pathOf.set(proxy, path);
        return proxy;
    };
    const self = stand("this");
    const callArgs = args.map(arg => arg === this.LAYER ? stand("layer") : arg);
    const CombinedLayer = Tilemap.CombinedLayer;
    let made = 0;
    if (makesLayers) {
        Tilemap.CombinedLayer = function() {
            note("new CombinedLayer");
            return stand("CombinedLayer#" + made++);
        };
    }
    try {
        note("return " + show(fn.apply(self, callArgs)));
    } catch (e) {
        return null;
    } finally {
        if (makesLayers) Tilemap.CombinedLayer = CombinedLayer;
    }
    return log.join("\n");
};

/** Why the tilemap's painting methods keep the full paint, or null. */
Tilemap.ChunkPaint.hookBlocker = function(tilemap) {
    const gate = this.gateReason();
    if (gate) return gate;
    this.ageVerdicts();
    const hooks = this.HOOKS;
    for (let i = 0; i < hooks.length; i++) {
        const name = hooks[i];
        const fn = this.unwrap(tilemap[name]);
        if (fn === this.stock[name]) continue;
        const verdict = this.verdict(fn, name);
        if (!verdict.ok) return verdict.reason;
    }
    return null;
};

/** Why this frame keeps the full paint, or null when it paints in chunks. */
Tilemap.prototype._rrChunkBlocker = function() {
    const C = Tilemap.ChunkPaint;
    if (C._watched) C.settle();
    this._rrCheckedFrame = Graphics.frameCount;
    let reason = null;
    if (!C.enabled) reason = "off";
    else if (!PIXI.TextureSource || !C.stock || typeof PIXI.Mesh !== "function") reason = "no PIXI 8 mesh";
    else if (this._rrChunkFailed) reason = this._rrChunkFailed;
    else if (this._rrTileFrames) reason = "tile frames";
    else reason = C.hookBlocker(this);
    if (!reason) {
        const lower = this._lowerLayer;
        const upper = this._upperLayer;
        const lowerTiles = lower !== upper ? C.stockTileLayer(lower) : null;
        const upperTiles = lowerTiles ? C.stockTileLayer(upper) : null;
        if (!lowerTiles || !upperTiles) reason = "plugin tile layers";
        else if (this._needsBitmapsUpdate || !this._bitmaps || !this._bitmaps.length ||
            !lowerTiles._v8Backend || !upperTiles._v8Backend) reason = "tileset loading";
        else if (lowerTiles._v8Backend !== "mesh" || upperTiles._v8Backend !== "mesh") reason = "sprite tiles";
        else {
            const children = this.children;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child !== lower && child !== upper && typeof child.addRect === "function") {
                    reason = "plugin tile layers";
                    break;
                }
            }
        }
    }
    if (PIXI.TextureSource) {
        const stats = Tilemap.Layer._v8Stats();
        stats.chunked = !reason;
        stats.chunkFallback = reason || "";
    }
    return reason;
};

// Collects one chunk's rects as the painting hooks hand them to a layer,
// with the water motion _addAutotile marks them with.
Tilemap.ChunkRecorder = function(tilemap) {
    this._tilemap = tilemap;
    this.rects = new Float32Array(8 * 512);
    this.count = 0;
};

Tilemap.ChunkRecorder.prototype.addRect = function(setNumber, sx, sy, dx, dy, w, h) {
    let rects = this.rects;
    const at = this.count * 8;
    if (at + 8 > rects.length) {
        const grown = new Float32Array(rects.length * 2);
        grown.set(rects);
        rects = this.rects = grown;
    }
    rects[at] = setNumber;
    rects[at + 1] = sx;
    rects[at + 2] = sy;
    rects[at + 3] = dx;
    rects[at + 4] = dy;
    rects[at + 5] = w;
    rects[at + 6] = h;
    rects[at + 7] = this._tilemap._rrPaintAnim || 0;
    this.count++;
};

Tilemap.ChunkRecorder.prototype.clear = function() {
    this.count = 0;
};

Tilemap.ChunkRecorder.prototype.size = function() {
    return this.count;
};

Tilemap.prototype._rrEnterChunks = function() {
    // The layers' own meshes hide; the blocks draw inside their tile roots.
    this._lowerLayer.clear();
    this._upperLayer.clear();
    const C = Tilemap.ChunkPaint;
    const makeRoot = combined => {
        const root = new PIXI.Container();
        root.eventMode = "none";
        C.stockTileLayer(combined)._v8TileRoot.addChild(root);
        return root;
    };
    return {
        chunks: new Map(),
        live: [],
        pool: [],
        lowerRoot: makeRoot(this._lowerLayer),
        upperRoot: makeRoot(this._upperLayer),
        lowerRecorder: new Tilemap.ChunkRecorder(this),
        upperRecorder: new Tilemap.ChunkRecorder(this),
        atlas: null,
        bitmaps: undefined,
        frame: 0,
        verifyAt: 0,
        phase: 0,
        waterShift: 0,
        fallShift: 0
    };
};

Tilemap.prototype._rrLeaveChunks = function() {
    const state = this._rrChunks;
    this._rrChunks = null;
    if (!state) return;
    for (const chunk of state.live) {
        this._rrDestroyChunkPart(chunk.lower);
        this._rrDestroyChunkPart(chunk.upper);
    }
    for (const part of state.pool) this._rrDestroyChunkPart(part);
    for (const root of [state.lowerRoot, state.upperRoot]) {
        if (root.parent) root.parent.removeChild(root);
        if (!root.destroyed) root.destroy({ children: false });
    }
    if (state.atlas) Tilemap.Layer._releaseV8Atlas(state.atlas);
    // The full paint takes over from the next frame on.
    this._needsRepaint = true;
    if (PIXI.TextureSource) Tilemap.Layer._v8Stats().chunksLive = 0;
};

Tilemap.prototype._rrDestroyChunkPart = function(part) {
    if (!part || part.mesh.destroyed) return;
    if (part.mesh.parent) part.mesh.parent.removeChild(part.mesh);
    part.mesh.destroy({ texture: false, textureSource: false });
    part.geometry.destroy(true);
};

// Every block goes back to the pool: the tileset, the map or its flags changed, or refresh() was called.
Tilemap.prototype._rrResetChunks = function(state) {
    while (state.live.length) this._rrReleaseChunk(state, state.live[state.live.length - 1]);
    if (state.bitmaps !== this._bitmaps || !state.atlas) {
        if (state.atlas) Tilemap.Layer._releaseV8Atlas(state.atlas);
        state.atlas = null;
        state.atlas = Tilemap.Layer._acquireV8Atlas(this._bitmaps);
    }
    Object.assign(state, {
        bitmaps: this._bitmaps,
        flags: this.flags,
        mapData: this._mapData,
        mapWidth: this._mapWidth,
        mapHeight: this._mapHeight,
        tileWidth: this.tileWidth,
        tileHeight: this.tileHeight,
        horizontalWrap: this.horizontalWrap,
        verticalWrap: this.verticalWrap,
        size: Tilemap.ChunkPaint.SIZE
    });
};

Tilemap.prototype._rrChunksStale = function(state) {
    return this._needsRepaint || state.bitmaps !== this._bitmaps || state.flags !== this.flags ||
        state.mapData !== this._mapData || state.mapWidth !== this._mapWidth ||
        state.mapHeight !== this._mapHeight || state.tileWidth !== this.tileWidth ||
        state.tileHeight !== this.tileHeight || state.horizontalWrap !== this.horizontalWrap ||
        state.verticalWrap !== this.verticalWrap || state.size !== Tilemap.ChunkPaint.SIZE;
};

Tilemap._rrChunkKey = function(cx, cy) {
    return (cy + 0x8000) * 0x10000 + (cx + 0x8000);
};

/** Paints this frame in chunks; false (after handing back to the full paint) when that fails. */
Tilemap.prototype._rrPaintChunks = function(startX, startY) {
    try {
        const state = this._rrChunks || (this._rrChunks = this._rrEnterChunks());
        if (this._rrChunksStale(state)) {
            this._rrResetChunks(state);
            this._needsRepaint = false;
        }
        Tilemap.Layer._keepV8AtlasPixels(state.atlas);
        const C = Tilemap.ChunkPaint;
        const size = state.size;
        const tileWidth = this.tileWidth;
        const tileHeight = this.tileHeight;
        // The tiles the full paint would cover.
        const tileCols = Math.ceil((this.width + this._margin * 2) / tileWidth) + 1;
        const tileRows = Math.ceil((this.height + this._margin * 2) / tileHeight) + 1;
        const cx0 = Math.floor(startX / size);
        const cy0 = Math.floor(startY / size);
        const cx1 = Math.floor((startX + tileCols - 1) / size);
        const cy1 = Math.floor((startY + tileRows - 1) / size);
        // The canonical layers stand at the view's first tile; the blocks at their map position.
        state.lowerRoot.x = state.upperRoot.x = -startX * tileWidth;
        state.lowerRoot.y = state.upperRoot.y = -startY * tileHeight;
        // The water frame, as _addAutotile picks it.
        const frame = Number.isFinite(this.animationFrame) ? this.animationFrame : 0;
        const water = this._rrWater && this._rrWater.cycle === 3 ? frame % 3 : (frame % 4 === 3 ? 1 : frame % 4);
        const fall = frame % 3;
        state.phase = water * 3 + fall;
        state.waterShift = water * 2 * tileWidth;
        state.fallShift = fall * tileHeight;
        const now = ++state.frame;
        for (let cy = cy0; cy <= cy1; cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const chunk = state.chunks.get(Tilemap._rrChunkKey(cx, cy)) || this._rrBuildChunk(state, cx, cy, true);
                chunk.seen = now;
                if (!chunk.shown) this._rrShowChunk(chunk, true);
                if (chunk.phase !== state.phase) this._rrAnimateChunk(state, chunk);
            }
        }
        const keep = C.KEEP;
        const live = state.live;
        for (let i = live.length - 1; i >= 0; i--) {
            const chunk = live[i];
            if (chunk.seen === now) continue;
            if (chunk.shown) this._rrShowChunk(chunk, false);
            if (chunk.cx < cx0 - keep || chunk.cx > cx1 + keep || chunk.cy < cy0 - keep || chunk.cy > cy1 + keep) {
                this._rrReleaseChunk(state, chunk);
            }
        }
        // Ahead of the view: the ring around it, a few blocks a frame.
        let budget = C.BUILDS_PER_FRAME;
        const ring = C.PREFETCH;
        for (let cy = cy0 - ring; cy <= cy1 + ring && budget > 0; cy++) {
            for (let cx = cx0 - ring; cx <= cx1 + ring && budget > 0; cx++) {
                if (!state.chunks.has(Tilemap._rrChunkKey(cx, cy))) {
                    this._rrBuildChunk(state, cx, cy, false);
                    budget--;
                }
            }
        }
        // One block a frame is compared with the map data it was painted from.
        if (live.length) {
            state.verifyAt = (state.verifyAt + 1) % live.length;
            const chunk = live[state.verifyAt];
            if (this._rrChunkChanged(chunk)) {
                if (chunk.seen === now) {
                    this._rrBuildChunk(state, chunk.cx, chunk.cy, true);
                    this._rrAnimateChunk(state, chunk);
                } else {
                    this._rrReleaseChunk(state, chunk);
                }
            }
        }
        Tilemap.Layer._v8Stats().chunksLive = live.length;
        return true;
    } catch (error) {
        this._rrChunkFailed = "chunk paint failed: " + (error && error.message ? error.message : String(error));
        const stats = Tilemap.Layer._v8Stats();
        stats.chunked = false;
        stats.chunkFallback = this._rrChunkFailed;
        this._rrLeaveChunks();
        return false;
    }
};

Tilemap.prototype._rrShowChunk = function(chunk, shown) {
    chunk.shown = shown;
    if (chunk.lower) chunk.lower.mesh.visible = shown && chunk.lower.count > 0;
    if (chunk.upper) chunk.upper.mesh.visible = shown && chunk.upper.count > 0;
};

Tilemap.prototype._rrReleaseChunk = function(state, chunk) {
    state.chunks.delete(chunk.key);
    const index = state.live.indexOf(chunk);
    if (index >= 0) {
        state.live[index] = state.live[state.live.length - 1];
        state.live.pop();
    }
    for (const part of [chunk.lower, chunk.upper]) {
        if (!part) continue;
        if (part.mesh.parent) part.mesh.parent.removeChild(part.mesh);
        if (state.pool.length < Tilemap.ChunkPaint.POOL) state.pool.push(part);
        else this._rrDestroyChunkPart(part);
    }
    chunk.lower = chunk.upper = null;
};

/**
 * Paints one block through the painting hooks, into recorders standing in
 * for the canonical layers, at water frame 0, and makes its meshes. `now`:
 * the view needs it this frame (shown at once).
 */
Tilemap.prototype._rrBuildChunk = function(state, cx, cy, now) {
    const started = typeof performance !== "undefined" ? performance.now() : 0;
    const size = state.size;
    const x0 = cx * size;
    const y0 = cy * size;
    const lowerRecorder = state.lowerRecorder;
    const upperRecorder = state.upperRecorder;
    lowerRecorder.count = 0;
    upperRecorder.count = 0;
    const lower = this._lowerLayer;
    const upper = this._upperLayer;
    const frame = this.animationFrame;
    this._lowerLayer = lowerRecorder;
    this._upperLayer = upperRecorder;
    this.animationFrame = 0;
    this._rrPaintAnim = 0;
    try {
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                this._addSpot(x0, y0, x, y);
            }
        }
    } finally {
        this._lowerLayer = lower;
        this._upperLayer = upper;
        this.animationFrame = frame;
        this._rrPaintAnim = 0;
    }
    const key = Tilemap._rrChunkKey(cx, cy);
    let chunk = state.chunks.get(key);
    if (!chunk) {
        chunk = { key, cx, cy, size, lower: null, upper: null, shown: false, seen: 0, phase: 0,
            snapshot: new Int32Array(5 * (size + 1) * size) };
        state.chunks.set(key, chunk);
        state.live.push(chunk);
    }
    const left = x0 * this.tileWidth;
    const top = y0 * this.tileHeight;
    chunk.lower = this._rrChunkPart(state, chunk.lower, lowerRecorder, state.lowerRoot, left, top);
    chunk.upper = this._rrChunkPart(state, chunk.upper, upperRecorder, state.upperRoot, left, top);
    chunk.phase = 0;
    this._rrChunkSnapshot(chunk, chunk.snapshot);
    this._rrShowChunk(chunk, now);
    const stats = Tilemap.Layer._v8Stats();
    stats.chunkBuilds = (stats.chunkBuilds || 0) + 1;
    if (now) stats.chunkSyncBuilds = (stats.chunkSyncBuilds || 0) + 1;
    if (started) stats.chunkBuildMs = (stats.chunkBuildMs || 0) + performance.now() - started;
    return chunk;
};

// One layer's mesh of a block, from its recorder: reuses the part it had or a pooled one.
Tilemap.prototype._rrChunkPart = function(state, part, recorder, root, left, top) {
    const count = recorder.count;
    if (!count && !part) return null;
    if (!part) part = state.pool.pop() || null;
    if (!part) {
        const geometry = new PIXI.MeshGeometry({
            positions: new Float32Array(8),
            uvs: new Float32Array(8),
            indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
            shrinkBuffersToFit: false
        });
        geometry.batchMode = "no-batch";
        const mesh = new PIXI.Mesh({ geometry, texture: state.atlas.texture, roundPixels: true });
        mesh.eventMode = "none";
        part = { mesh, geometry, quads: Tilemap.Layer._newV8Quads(), count: 0,
            animCount: 0, anim: null, animBase: null };
    }
    if (part.mesh.texture !== state.atlas.texture) part.mesh.texture = state.atlas.texture;
    if (part.mesh.parent !== root) root.addChild(part.mesh);
    part.mesh.position.set(left, top);
    const quads = part.quads;
    const grew = Tilemap.Layer._ensureV8Quads(quads, count);
    const rects = recorder.rects;
    const atlas = state.atlas;
    let animCount = 0;
    for (let n = 0; n < count; n++) {
        const at = n * 8;
        Tilemap.Layer._writeV8Quad(atlas, quads.positions, quads.uvs, n,
            rects[at], rects[at + 1], rects[at + 2], rects[at + 3], rects[at + 4], rects[at + 5], rects[at + 6]);
        if (rects[at + 7]) animCount++;
    }
    if (animCount) {
        if (!part.anim || part.anim.length < animCount * 2) {
            part.anim = new Int32Array(animCount * 2);
            part.animBase = new Float32Array(animCount * 4);
        }
        const uvs = quads.uvs;
        for (let n = 0, a = 0; n < count; n++) {
            const kind = rects[n * 8 + 7];
            if (!kind) continue;
            const p = n * 8;
            part.anim[a * 2] = n;
            part.anim[a * 2 + 1] = kind;
            part.animBase[a * 4] = uvs[p];
            part.animBase[a * 4 + 1] = uvs[p + 1];
            part.animBase[a * 4 + 2] = uvs[p + 4];
            part.animBase[a * 4 + 3] = uvs[p + 5];
            a++;
        }
    }
    part.animCount = animCount;
    Tilemap.Layer._publishV8Quads(part.geometry, quads, count, grew);
    part.count = count;
    return part;
};

// The water frame on a block's animated quads: water slides along x, falls along y.
Tilemap.prototype._rrAnimateChunk = function(state, chunk) {
    chunk.phase = state.phase;
    const atlas = state.atlas;
    const du = state.waterShift / atlas.width;
    const dv = state.fallShift / atlas.height;
    for (const part of [chunk.lower, chunk.upper]) {
        if (!part || !part.animCount) continue;
        const started = typeof performance !== "undefined" ? performance.now() : 0;
        const uvs = part.quads.uvs;
        const anim = part.anim;
        const base = part.animBase;
        for (let a = 0; a < part.animCount; a++) {
            const p = anim[a * 2] * 8;
            const left = base[a * 4];
            const top = base[a * 4 + 1];
            const right = base[a * 4 + 2];
            const bottom = base[a * 4 + 3];
            if (anim[a * 2 + 1] === 1) {
                uvs[p] = uvs[p + 6] = left + du;
                uvs[p + 2] = uvs[p + 4] = right + du;
            } else {
                uvs[p + 1] = uvs[p + 3] = top + dv;
                uvs[p + 5] = uvs[p + 7] = bottom + dv;
            }
        }
        part.geometry.attributes.aUV.buffer.update(part.quads.used * 8 * 4);
        const stats = Tilemap.Layer._v8Stats();
        stats.animPatches = (stats.animPatches || 0) + 1;
        if (started) stats.animPatchMs = (stats.animPatchMs || 0) + performance.now() - started;
    }
};

// The map data a block was painted from: layers 0-4 of its tiles and of the row above (table edges).
Tilemap.prototype._rrChunkSnapshot = function(chunk, into) {
    const size = chunk.size;
    const x0 = chunk.cx * size;
    const y0 = chunk.cy * size - 1;
    let i = 0;
    for (let z = 0; z < 5; z++) {
        for (let y = 0; y <= size; y++) {
            for (let x = 0; x < size; x++) {
                into[i++] = this._readMapData(x0 + x, y0 + y, z);
            }
        }
    }
};

Tilemap.prototype._rrChunkChanged = function(chunk) {
    const snapshot = chunk.snapshot;
    const scratch = Tilemap._rrChunkScratch && Tilemap._rrChunkScratch.length === snapshot.length ?
        Tilemap._rrChunkScratch : (Tilemap._rrChunkScratch = new Int32Array(snapshot.length));
    this._rrChunkSnapshot(chunk, scratch);
    for (let i = 0; i < snapshot.length; i++) if (scratch[i] !== snapshot[i]) return true;
    return false;
};

Tilemap.prototype._addSpot = function(startX, startY, x, y) {
    const mx = startX + x;
    const my = startY + y;
    const dx = x * this.tileWidth;
    const dy = y * this.tileHeight;
    const tileId0 = this._readMapData(mx, my, 0);
    const tileId1 = this._readMapData(mx, my, 1);
    const tileId2 = this._readMapData(mx, my, 2);
    const tileId3 = this._readMapData(mx, my, 3);
    const shadowBits = this._readMapData(mx, my, 4);
    const upperTileId1 = this._readMapData(mx, my - 1, 1);

    this._addSpotTile(tileId0, dx, dy);
    this._addSpotTile(tileId1, dx, dy);
    this._addShadow(this._lowerLayer, shadowBits, dx, dy);
    if (this._isTableTile(upperTileId1) && !this._isTableTile(tileId1)) {
        if (!Tilemap.isShadowingTile(tileId0)) {
            this._addTableEdge(this._lowerLayer, upperTileId1, dx, dy);
        }
    }
    if (this._isOverpassPosition(mx, my)) {
        this._addTile(this._upperLayer, tileId2, dx, dy);
        this._addTile(this._upperLayer, tileId3, dx, dy);
    } else {
        this._addSpotTile(tileId2, dx, dy);
        this._addSpotTile(tileId3, dx, dy);
    }
};

Tilemap.prototype._addSpotTile = function(tileId, dx, dy) {
    if (this._isHigherTile(tileId)) {
        this._addTile(this._upperLayer, tileId, dx, dy);
    } else {
        this._addTile(this._lowerLayer, tileId, dx, dy);
    }
};

Tilemap.prototype._addTile = function(layer, tileId, dx, dy) {
    if (Tilemap.isVisibleTile(tileId)) {
        if (Tilemap.isAutotile(tileId)) {
            this._addAutotile(layer, tileId, dx, dy);
        } else {
            this._addNormalTile(layer, tileId, dx, dy);
        }
    }
};

/**
 * Tile animation a tileset sets out (an RPG Maker 2000/2003 import): `frames` maps a tile id to the ids it shows
 * in turn, a frame every 6 game frames; `water` gives the water's step in frames and its cycle (4: frames
 * 1-2-3-2, 3: 1-2-3). Only tiles the map uses are kept, so a map without them never repaints for them.
 */
Tilemap.prototype.setTileAnimation = function(frames, water) {
    this._rrAllTileFrames = frames || null;
    this._rrKeepUsedTileFrames();
    this._rrWater = water && water.step > 0 ? water : null;
    this._needsRepaint = true;
};

/** The animated tiles the map shows now. A tile changed after load (a substitution, then `refresh`) is asked for again. */
Tilemap.prototype._rrKeepUsedTileFrames = function() {
    const frames = this._rrAllTileFrames;
    const used = frames ? new Set(this._mapData || []) : null;
    const kept = frames ? Object.entries(frames).filter(([id]) => used.has(Number(id))) : [];
    this._rrTileFrames = kept.length ? Object.fromEntries(kept) : null;
};

Tilemap.prototype._addNormalTile = function(layer, tileId, dx, dy) {
    let setNumber = 0;
    const frames = this._rrTileFrames && this._rrTileFrames[tileId];
    if (frames) tileId = frames[Math.floor(this.animationCount / 6) % frames.length];

    if (Tilemap.isTileA5(tileId)) {
        setNumber = 4;
    } else {
        setNumber = 5 + Math.floor(tileId / 256);
    }

    const w = this.tileWidth;
    const h = this.tileHeight;
    const sx = ((Math.floor(tileId / 128) % 2) * 8 + (tileId % 8)) * w;
    const sy = (Math.floor((tileId % 256) / 8) % 16) * h;

    layer.addRect(setNumber, sx, sy, dx, dy, w, h);
};

Tilemap.prototype._addAutotile = function(layer, tileId, dx, dy) {
    const kind = Tilemap.getAutotileKind(tileId);
    const shape = Tilemap.getAutotileShape(tileId);
    const tx = kind % 8;
    const ty = Math.floor(kind / 8);
    let setNumber = 0;
    let bx = 0;
    let by = 0;
    let autotileTable = Tilemap.FLOOR_AUTOTILE_TABLE;
    let isTable = false;
    // How the quads below move with the water frame, for a chunked paint
    // (Tilemap.ChunkPaint): 1 along x with the surface, 2 along y with the fall.
    let anim = 0;

    if (Tilemap.isTileA1(tileId)) {
        const waterSurfaceIndex = this._rrWater && this._rrWater.cycle === 3 ? this.animationFrame % 3 : [0, 1, 2, 1][this.animationFrame % 4];
        setNumber = 0;
        if (kind === 0) {
            bx = waterSurfaceIndex * 2;
            by = 0;
            anim = 1;
        } else if (kind === 1) {
            bx = waterSurfaceIndex * 2;
            by = 3;
            anim = 1;
        } else if (kind === 2) {
            bx = 6;
            by = 0;
        } else if (kind === 3) {
            bx = 6;
            by = 3;
        } else {
            bx = Math.floor(tx / 4) * 8;
            by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
            if (kind % 2 === 0) {
                bx += waterSurfaceIndex * 2;
                anim = 1;
            } else {
                bx += 6;
                autotileTable = Tilemap.WATERFALL_AUTOTILE_TABLE;
                by += this.animationFrame % 3;
                anim = 2;
            }
        }
    } else if (Tilemap.isTileA2(tileId)) {
        setNumber = 1;
        bx = tx * 2;
        by = (ty - 2) * 3;
        isTable = this._isTableTile(tileId);
    } else if (Tilemap.isTileA3(tileId)) {
        setNumber = 2;
        bx = tx * 2;
        by = (ty - 6) * 2;
        autotileTable = Tilemap.WALL_AUTOTILE_TABLE;
    } else if (Tilemap.isTileA4(tileId)) {
        setNumber = 3;
        bx = tx * 2;
        by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0));
        if (ty % 2 === 1) {
            autotileTable = Tilemap.WALL_AUTOTILE_TABLE;
        }
    }

    const table = autotileTable[shape];
    const w1 = this.tileWidth / 2;
    const h1 = this.tileHeight / 2;
    this._rrPaintAnim = anim;
    for (let i = 0; i < 4; i++) {
        const qsx = table[i][0];
        const qsy = table[i][1];
        const sx1 = (bx * 2 + qsx) * w1;
        const sy1 = (by * 2 + qsy) * h1;
        const dx1 = dx + (i % 2) * w1;
        const dy1 = dy + Math.floor(i / 2) * h1;
        if (isTable && (qsy === 1 || qsy === 5)) {
            const qsx2 = qsy === 1 ? (4 - qsx) % 4 : qsx;
            const qsy2 = 3;
            const sx2 = (bx * 2 + qsx2) * w1;
            const sy2 = (by * 2 + qsy2) * h1;
            layer.addRect(setNumber, sx2, sy2, dx1, dy1, w1, h1);
            layer.addRect(setNumber, sx1, sy1, dx1, dy1 + h1 / 2, w1, h1 / 2);
        } else {
            layer.addRect(setNumber, sx1, sy1, dx1, dy1, w1, h1);
        }
    }
    this._rrPaintAnim = 0;
};

Tilemap.prototype._addTableEdge = function(layer, tileId, dx, dy) {
    if (Tilemap.isTileA2(tileId)) {
        const autotileTable = Tilemap.FLOOR_AUTOTILE_TABLE;
        const kind = Tilemap.getAutotileKind(tileId);
        const shape = Tilemap.getAutotileShape(tileId);
        const tx = kind % 8;
        const ty = Math.floor(kind / 8);
        const setNumber = 1;
        const bx = tx * 2;
        const by = (ty - 2) * 3;
        const table = autotileTable[shape];
        const w1 = this.tileWidth / 2;
        const h1 = this.tileHeight / 2;
        for (let i = 0; i < 2; i++) {
            const qsx = table[2 + i][0];
            const qsy = table[2 + i][1];
            const sx1 = (bx * 2 + qsx) * w1;
            const sy1 = (by * 2 + qsy) * h1 + h1 / 2;
            const dx1 = dx + (i % 2) * w1;
            const dy1 = dy + Math.floor(i / 2) * h1;
            layer.addRect(setNumber, sx1, sy1, dx1, dy1, w1, h1 / 2);
        }
    }
};

Tilemap.prototype._addShadow = function(layer, shadowBits, dx, dy) {
    if (shadowBits & 0x0f) {
        const w1 = this.tileWidth / 2;
        const h1 = this.tileHeight / 2;
        for (let i = 0; i < 4; i++) {
            if (shadowBits & (1 << i)) {
                const dx1 = dx + (i % 2) * w1;
                const dy1 = dy + Math.floor(i / 2) * h1;
                layer.addRect(-1, 0, 0, dx1, dy1, w1, h1);
            }
        }
    }
};

Tilemap.prototype._readMapData = function(x, y, z) {
    if (this._mapData) {
        const width = this._mapWidth;
        const height = this._mapHeight;
        if (this.horizontalWrap) {
            x = x.mod(width);
        }
        if (this.verticalWrap) {
            y = y.mod(height);
        }
        if (x >= 0 && x < width && y >= 0 && y < height) {
            return this._mapData[(z * height + y) * width + x] || 0;
        } else {
            return 0;
        }
    } else {
        return 0;
    }
};

Tilemap.prototype._isHigherTile = function(tileId) {
    return this.flags[tileId] & 0x10;
};

Tilemap.prototype._isTableTile = function(tileId) {
    return Tilemap.isTileA2(tileId) && this.flags[tileId] & 0x80;
};

Tilemap.prototype._isOverpassPosition = function(/*mx, my*/) {
    return false;
};

Tilemap.prototype._sortChildren = function() {
    // Every frame, for every child: an already-sorted list costs one
    // comparison pass and no allocation. Only a list that is out of order
    // is sorted — and then its order has changed by definition, so v8's
    // render group is told without copying the list to find out.
    const children = this.children;
    const baseCompare = this._boundCompareChildOrder
        || (this._boundCompareChildOrder = this._compareChildOrder.bind(this));
    // Plugins can replace the comparator. Preserve their layer rules while
    // giving model sprites their physical depth within the same layer.
    const compare = this._reactorDepthCompare || (this._reactorDepthCompare = (a, b) => {
        if ((a.z || 0) === (b.z || 0)
            && (Number.isFinite(a._reactorSortY) || Number.isFinite(b._reactorSortY))) {
            const ay = Number.isFinite(a._reactorSortY) ? a._reactorSortY : (a.y || 0);
            const by = Number.isFinite(b._reactorSortY) ? b._reactorSortY : (b.y || 0);
            if (ay !== by) return ay - by;
        }
        return baseCompare(a, b);
    });
    let sorted = true;
    for (let i = 1; i < children.length; i++) {
        if (compare(children[i - 1], children[i]) > 0) { sorted = false; break; }
    }
    if (sorted) return;
    children.sort(compare);
    if (PIXI.TextureSource) {
        const renderGroup = this.renderGroup || this.parentRenderGroup;
        if (renderGroup) renderGroup.structureDidChange = true;
    }
};

Tilemap.prototype._compareChildOrder = function(a, b) {
    // Coalesce undefined fields: a single NaN result makes the comparator
    // inconsistent and Array.prototype.sort then returns ARBITRARY order
    // for the whole array (layer flips, characters above upper tiles).
    const az = a.z || 0;
    const bz = b.z || 0;
    if (az !== bz) {
        return az - bz;
    }
    const ay = Number.isFinite(a._reactorSortY) ? a._reactorSortY : (a.y || 0);
    const by = Number.isFinite(b._reactorSortY) ? b._reactorSortY : (b.y || 0);
    if (ay !== by) {
        return ay - by;
    }
    return (a.spriteId || 0) - (b.spriteId || 0);
};

//:::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// Tile type checkers

Tilemap.TILE_ID_B = 0;
Tilemap.TILE_ID_C = 256;
Tilemap.TILE_ID_D = 512;
Tilemap.TILE_ID_E = 768;
Tilemap.TILE_ID_A5 = 1536;
Tilemap.TILE_ID_A1 = 2048;
Tilemap.TILE_ID_A2 = 2816;
Tilemap.TILE_ID_A3 = 4352;
Tilemap.TILE_ID_A4 = 5888;
Tilemap.TILE_ID_MAX = 8192;

Tilemap.isVisibleTile = function(tileId) {
    return tileId > 0 && tileId < this.TILE_ID_MAX;
};

Tilemap.isAutotile = function(tileId) {
    return tileId >= this.TILE_ID_A1;
};

Tilemap.getAutotileKind = function(tileId) {
    return Math.floor((tileId - this.TILE_ID_A1) / 48);
};

Tilemap.getAutotileShape = function(tileId) {
    return (tileId - this.TILE_ID_A1) % 48;
};

Tilemap.makeAutotileId = function(kind, shape) {
    return this.TILE_ID_A1 + kind * 48 + shape;
};

Tilemap.isSameKindTile = function(tileID1, tileID2) {
    if (this.isAutotile(tileID1) && this.isAutotile(tileID2)) {
        return this.getAutotileKind(tileID1) === this.getAutotileKind(tileID2);
    } else {
        return tileID1 === tileID2;
    }
};

Tilemap.isTileA1 = function(tileId) {
    return tileId >= this.TILE_ID_A1 && tileId < this.TILE_ID_A2;
};

Tilemap.isTileA2 = function(tileId) {
    return tileId >= this.TILE_ID_A2 && tileId < this.TILE_ID_A3;
};

Tilemap.isTileA3 = function(tileId) {
    return tileId >= this.TILE_ID_A3 && tileId < this.TILE_ID_A4;
};

Tilemap.isTileA4 = function(tileId) {
    return tileId >= this.TILE_ID_A4 && tileId < this.TILE_ID_MAX;
};

Tilemap.isTileA5 = function(tileId) {
    return tileId >= this.TILE_ID_A5 && tileId < this.TILE_ID_A1;
};

Tilemap.isWaterTile = function(tileId) {
    if (this.isTileA1(tileId)) {
        return !(
            tileId >= this.TILE_ID_A1 + 96 && tileId < this.TILE_ID_A1 + 192
        );
    } else {
        return false;
    }
};

Tilemap.isWaterfallTile = function(tileId) {
    if (tileId >= this.TILE_ID_A1 + 192 && tileId < this.TILE_ID_A2) {
        return this.getAutotileKind(tileId) % 2 === 1;
    } else {
        return false;
    }
};

Tilemap.isGroundTile = function(tileId) {
    return (
        this.isTileA1(tileId) || this.isTileA2(tileId) || this.isTileA5(tileId)
    );
};

Tilemap.isShadowingTile = function(tileId) {
    return this.isTileA3(tileId) || this.isTileA4(tileId);
};

Tilemap.isRoofTile = function(tileId) {
    return this.isTileA3(tileId) && this.getAutotileKind(tileId) % 16 < 8;
};

Tilemap.isWallTopTile = function(tileId) {
    return this.isTileA4(tileId) && this.getAutotileKind(tileId) % 16 < 8;
};

Tilemap.isWallSideTile = function(tileId) {
    return (
        (this.isTileA3(tileId) || this.isTileA4(tileId)) &&
        this.getAutotileKind(tileId) % 16 >= 8
    );
};

Tilemap.isWallTile = function(tileId) {
    return this.isWallTopTile(tileId) || this.isWallSideTile(tileId);
};

Tilemap.isFloorTypeAutotile = function(tileId) {
    return (
        (this.isTileA1(tileId) && !this.isWaterfallTile(tileId)) ||
        this.isTileA2(tileId) ||
        this.isWallTopTile(tileId)
    );
};

Tilemap.isWallTypeAutotile = function(tileId) {
    return this.isRoofTile(tileId) || this.isWallSideTile(tileId);
};

Tilemap.isWaterfallTypeAutotile = function(tileId) {
    return this.isWaterfallTile(tileId);
};

//:::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// Autotile shape number to coordinates of tileset images

// prettier-ignore
Tilemap.FLOOR_AUTOTILE_TABLE = [
    [[2, 4], [1, 4], [2, 3], [1, 3]],
    [[2, 0], [1, 4], [2, 3], [1, 3]],
    [[2, 4], [3, 0], [2, 3], [1, 3]],
    [[2, 0], [3, 0], [2, 3], [1, 3]],
    [[2, 4], [1, 4], [2, 3], [3, 1]],
    [[2, 0], [1, 4], [2, 3], [3, 1]],
    [[2, 4], [3, 0], [2, 3], [3, 1]],
    [[2, 0], [3, 0], [2, 3], [3, 1]],
    [[2, 4], [1, 4], [2, 1], [1, 3]],
    [[2, 0], [1, 4], [2, 1], [1, 3]],
    [[2, 4], [3, 0], [2, 1], [1, 3]],
    [[2, 0], [3, 0], [2, 1], [1, 3]],
    [[2, 4], [1, 4], [2, 1], [3, 1]],
    [[2, 0], [1, 4], [2, 1], [3, 1]],
    [[2, 4], [3, 0], [2, 1], [3, 1]],
    [[2, 0], [3, 0], [2, 1], [3, 1]],
    [[0, 4], [1, 4], [0, 3], [1, 3]],
    [[0, 4], [3, 0], [0, 3], [1, 3]],
    [[0, 4], [1, 4], [0, 3], [3, 1]],
    [[0, 4], [3, 0], [0, 3], [3, 1]],
    [[2, 2], [1, 2], [2, 3], [1, 3]],
    [[2, 2], [1, 2], [2, 3], [3, 1]],
    [[2, 2], [1, 2], [2, 1], [1, 3]],
    [[2, 2], [1, 2], [2, 1], [3, 1]],
    [[2, 4], [3, 4], [2, 3], [3, 3]],
    [[2, 4], [3, 4], [2, 1], [3, 3]],
    [[2, 0], [3, 4], [2, 3], [3, 3]],
    [[2, 0], [3, 4], [2, 1], [3, 3]],
    [[2, 4], [1, 4], [2, 5], [1, 5]],
    [[2, 0], [1, 4], [2, 5], [1, 5]],
    [[2, 4], [3, 0], [2, 5], [1, 5]],
    [[2, 0], [3, 0], [2, 5], [1, 5]],
    [[0, 4], [3, 4], [0, 3], [3, 3]],
    [[2, 2], [1, 2], [2, 5], [1, 5]],
    [[0, 2], [1, 2], [0, 3], [1, 3]],
    [[0, 2], [1, 2], [0, 3], [3, 1]],
    [[2, 2], [3, 2], [2, 3], [3, 3]],
    [[2, 2], [3, 2], [2, 1], [3, 3]],
    [[2, 4], [3, 4], [2, 5], [3, 5]],
    [[2, 0], [3, 4], [2, 5], [3, 5]],
    [[0, 4], [1, 4], [0, 5], [1, 5]],
    [[0, 4], [3, 0], [0, 5], [1, 5]],
    [[0, 2], [3, 2], [0, 3], [3, 3]],
    [[0, 2], [1, 2], [0, 5], [1, 5]],
    [[0, 4], [3, 4], [0, 5], [3, 5]],
    [[2, 2], [3, 2], [2, 5], [3, 5]],
    [[0, 2], [3, 2], [0, 5], [3, 5]],
    [[0, 0], [1, 0], [0, 1], [1, 1]]
];

// prettier-ignore
Tilemap.WALL_AUTOTILE_TABLE = [
    [[2, 2], [1, 2], [2, 1], [1, 1]],
    [[0, 2], [1, 2], [0, 1], [1, 1]],
    [[2, 0], [1, 0], [2, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[2, 2], [3, 2], [2, 1], [3, 1]],
    [[0, 2], [3, 2], [0, 1], [3, 1]],
    [[2, 0], [3, 0], [2, 1], [3, 1]],
    [[0, 0], [3, 0], [0, 1], [3, 1]],
    [[2, 2], [1, 2], [2, 3], [1, 3]],
    [[0, 2], [1, 2], [0, 3], [1, 3]],
    [[2, 0], [1, 0], [2, 3], [1, 3]],
    [[0, 0], [1, 0], [0, 3], [1, 3]],
    [[2, 2], [3, 2], [2, 3], [3, 3]],
    [[0, 2], [3, 2], [0, 3], [3, 3]],
    [[2, 0], [3, 0], [2, 3], [3, 3]],
    [[0, 0], [3, 0], [0, 3], [3, 3]]
];

// prettier-ignore
Tilemap.WATERFALL_AUTOTILE_TABLE = [
    [[2, 0], [1, 0], [2, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[2, 0], [3, 0], [2, 1], [3, 1]],
    [[0, 0], [3, 0], [0, 1], [3, 1]]
];

//:::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// Internal classes

Tilemap.Layer = function() {
    this.initialize(...arguments);
};

Tilemap.Layer.prototype = Object.create(PIXI.Container.prototype);
Tilemap.Layer.prototype.constructor = Tilemap.Layer;

Tilemap.Layer.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);
    this._elements = [];
    this._indexBuffer = null;
    this._indexArray = new Float32Array(0);
    this._vertexBuffer = null;
    this._vertexArray = new Float32Array(0);
    this._vao = null;
    this._needsTexturesUpdate = false;
    this._needsVertexUpdate = false;
    this._images = [];
    this._state = PIXI.State.for2d();
    this._createVao();
    if (PIXI.TextureSource) {
        this._v8Backend = null;
        this._v8Atlas = null;
        this._v8Geometry = null;
        this._v8Mesh = null;
        this._v8MeshDirty = false;
        this._v8TileRoot = new PIXI.Container();
        this._v8TileRoot.eventMode = "none";
        this.addChild(this._v8TileRoot);
        Tilemap.Layer._v8Stats().layers++;
    }
};

Tilemap.Layer.MAX_GL_TEXTURES = 3;
Tilemap.Layer.VERTEX_STRIDE = 9 * 4;
Tilemap.Layer.MAX_SIZE = 16000;
Tilemap.Layer.V8_ATLAS_COLUMNS = 4;
Tilemap.Layer.V8_ATLAS_ROWS = 3;
Tilemap.Layer.V8_ATLAS_SLOT_SIZE = 1024;
Tilemap.Layer._v8AtlasCache = new WeakMap();

Tilemap.Layer._v8Stats = function() {
    const root = typeof globalThis !== "undefined" ? globalThis : window;
    if (!root.$reactorTilemapStats) {
        root.$reactorTilemapStats = {
            requested: String(root.$reactorTilemapBackend || "auto"),
            backend: "pending",
            layers: 0,
            activeMeshes: 0,
            meshBuilds: 0,
            meshBuildMs: 0,
            lastRectCount: 0,
            lastVertexCount: 0,
            spriteAllocations: 0,
            spritePoolHits: 0,
            fallbacks: 0,
            fallbackReason: "",
            // Tilemap.ChunkPaint: whether the last frame painted in chunks, and why not.
            chunked: false,
            chunkFallback: "",
            chunkBuilds: 0,
            chunkSyncBuilds: 0,
            chunkBuildMs: 0,
            chunksLive: 0,
            animPatches: 0,
            animPatchMs: 0
        };
    }
    return root.$reactorTilemapStats;
};

Tilemap.Layer._requestedV8Backend = function() {
    const root = typeof globalThis !== "undefined" ? globalThis : window;
    const requested = String(root.$reactorTilemapBackend || "auto").toLowerCase();
    return requested === "sprites" || requested === "sprite" ? "sprites" :
        requested === "mesh" ? "mesh" : "auto";
};

// The tile sheets packed side by side, sized to the sheets themselves
// (Tilemap.Layer.v8AtlasPacked; off: one 1024px slot per sheet in a
// 4096x3072 atlas). The CPU copy is let go once the GPU has the pixels
// (Tilemap.Layer.v8AtlasDropsCanvas) and drawn again whenever the GPU loses
// them (a lost context, PIXI's texture GC): see _keepV8AtlasPixels.
Tilemap.Layer.v8AtlasPacked = true;
Tilemap.Layer.v8AtlasDropsCanvas = true;
Tilemap.Layer.V8_ATLAS_SHEETS = 11;

Tilemap.Layer._v8AtlasImages = function(bitmaps) {
    const images = [];
    for (let i = 0; i < this.V8_ATLAS_SHEETS; i++) {
        const bitmap = bitmaps[i];
        const image = bitmap && (bitmap.image || bitmap.canvas);
        const width = image ? image.naturalWidth || image.videoWidth || image.width || 0 : 0;
        const height = image ? image.naturalHeight || image.videoHeight || image.height || 0 : 0;
        images.push(width && height ? { image, width, height } : null);
    }
    return images;
};

/**
 * Where each sheet goes. Sheets fill columns as wide as the widest sheet, each
 * placed in the shortest column, tallest sheets first; the column count that
 * gives the smallest atlas within the GPU's texture limit wins. A 2x2 texel
 * block under the shortest column holds the shadow colour. Areas a sheet
 * does not cover are never sampled: a tile rect past its sheet's edge is
 * clipped to it (_writeV8Quad), as the transparent margin of a fixed slot
 * drew it.
 */
Tilemap.Layer._packV8Atlas = function(images, maxSize) {
    const sheets = [];
    let columnWidth = 1;
    images.forEach((entry, index) => {
        if (!entry) return;
        sheets.push({ index, width: entry.width, height: entry.height });
        columnWidth = Math.max(columnWidth, entry.width);
    });
    if (columnWidth > maxSize) throw new Error(`a tileset sheet is wider than the GPU texture limit ${maxSize}`);
    sheets.sort((a, b) => b.height - a.height || a.index - b.index);
    const layouts = [];
    const most = Math.max(1, Math.min(sheets.length || 1, Math.floor(maxSize / columnWidth)));
    for (let columns = 1; columns <= most; columns++) {
        const heights = new Array(columns).fill(0);
        const places = [];
        for (const sheet of sheets) {
            let column = 0;
            for (let c = 1; c < columns; c++) if (heights[c] < heights[column]) column = c;
            places.push({ index: sheet.index, x: column * columnWidth, y: heights[column] });
            heights[column] += sheet.height;
        }
        let shadowColumn = 0;
        for (let c = 1; c < columns; c++) if (heights[c] < heights[shadowColumn]) shadowColumn = c;
        const shadowX = shadowColumn * columnWidth;
        const shadowY = heights[shadowColumn];
        heights[shadowColumn] += 2;
        const width = columns * columnWidth;
        const height = Math.max(...heights);
        if (height > maxSize) continue;
        layouts.push({ width, height, places, shadowX, shadowY });
    }
    if (!layouts.length) throw new Error(`the tileset sheets do not fit the GPU texture limit ${maxSize}`);
    // Near the smallest area, the squarest: a long strip of a texture is legal but needs a high limit.
    const least = Math.min(...layouts.map(l => l.width * l.height));
    let best = null;
    for (const layout of layouts) {
        if (layout.width * layout.height > least * 1.15) continue;
        if (!best || Math.max(layout.width, layout.height) < Math.max(best.width, best.height)) best = layout;
    }
    return best;
};

Tilemap.Layer._v8AtlasLayout = function(images, maxSize) {
    const count = this.V8_ATLAS_SHEETS;
    const layout = { ox: new Array(count).fill(0), oy: new Array(count).fill(0),
        rw: new Array(count).fill(0), rh: new Array(count).fill(0) };
    if (this.v8AtlasPacked) {
        const packed = this._packV8Atlas(images, maxSize);
        for (const place of packed.places) {
            layout.ox[place.index] = place.x;
            layout.oy[place.index] = place.y;
            layout.rw[place.index] = images[place.index].width;
            layout.rh[place.index] = images[place.index].height;
        }
        return Object.assign(layout, { width: packed.width, height: packed.height, shadowX: packed.shadowX, shadowY: packed.shadowY });
    }
    const slot = this.V8_ATLAS_SLOT_SIZE;
    const width = this.V8_ATLAS_COLUMNS * slot;
    const height = this.V8_ATLAS_ROWS * slot;
    if (maxSize < Math.max(width, height)) throw new Error(`GPU texture limit is below ${Math.max(width, height)}`);
    for (let i = 0; i < count; i++) {
        const entry = images[i];
        if (entry && (entry.width > slot || entry.height > slot)) {
            throw new Error(`tileset sheet ${i} exceeds the ${slot}px atlas slot`);
        }
        layout.ox[i] = (i % this.V8_ATLAS_COLUMNS) * slot;
        layout.oy[i] = Math.floor(i / this.V8_ATLAS_COLUMNS) * slot;
        layout.rw[i] = layout.rh[i] = slot;
    }
    const shadowSlot = count;
    return Object.assign(layout, { width, height,
        shadowX: (shadowSlot % this.V8_ATLAS_COLUMNS) * slot,
        shadowY: Math.floor(shadowSlot / this.V8_ATLAS_COLUMNS) * slot });
};

Tilemap.Layer._paintV8Atlas = function(entry) {
    const canvas = entry.canvas;
    if (canvas.width !== entry.width) canvas.width = entry.width;
    if (canvas.height !== entry.height) canvas.height = entry.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create the tile atlas canvas");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, entry.width, entry.height);
    const images = this._v8AtlasImages(entry.bitmaps);
    for (let i = 0; i < images.length; i++) {
        if (images[i]) context.drawImage(images[i].image, entry.ox[i], entry.oy[i]);
    }
    context.fillStyle = "rgba(0,0,0,0.5)";
    context.fillRect(entry.shadowX, entry.shadowY, 2, 2);
    entry.dropped = false;
};

Tilemap.Layer._acquireV8Atlas = function(bitmaps) {
    let entry = this._v8AtlasCache.get(bitmaps);
    if (entry) {
        entry.refs++;
        return entry;
    }
    if (typeof document === "undefined" || !PIXI.CanvasSource || !PIXI.Texture) {
        throw new Error("PIXI 8 canvas textures are unavailable");
    }
    const renderer = typeof Graphics !== "undefined" && Graphics.app && Graphics.app.renderer;
    const gl = renderer && renderer.gl;
    const maxSize = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096 : 4096;
    const images = this._v8AtlasImages(bitmaps);
    const layout = this._v8AtlasLayout(images, maxSize);
    const canvas = document.createElement("canvas");
    entry = Object.assign({ bitmaps, canvas, refs: 1, dropped: false }, layout);
    this._paintV8Atlas(entry);
    entry.source = new PIXI.CanvasSource({
        resource: canvas,
        scaleMode: "nearest",
        addressMode: "clamp-to-edge",
        autoGenerateMipmaps: false
    });
    entry.texture = new PIXI.Texture({ source: entry.source });
    this._v8AtlasCache.set(bitmaps, entry);
    this._v8AtlasLive.add(entry);
    this._watchV8AtlasContext();
    return entry;
};

/**
 * Once a frame per atlas user: lets the CPU copy go after the GPU holds the
 * pixels, and draws it again when the GPU copy is gone (a lost context, or
 * PIXI's texture GC), before the next draw uploads from it.
 */
Tilemap.Layer._keepV8AtlasPixels = function(entry) {
    if (!entry || !entry.source || entry.source.destroyed) return;
    const renderer = typeof Graphics !== "undefined" && Graphics.app && Graphics.app.renderer;
    const gpu = renderer && entry.source._gpuData ? entry.source._gpuData[renderer.uid] : null;
    const uploaded = Boolean(gpu && gpu.width === entry.width && gpu.height === entry.height);
    if (entry.dropped) {
        if (!uploaded) this._paintV8Atlas(entry);
    } else if (uploaded && this.v8AtlasDropsCanvas && renderer.gl && !renderer.gl.isContextLost()) {
        entry.canvas.width = 1;
        entry.canvas.height = 1;
        entry.dropped = true;
    }
};

// A restored context uploads every texture again from its resource: each
// dropped atlas is drawn again first.
Tilemap.Layer._watchV8AtlasContext = function() {
    const canvas = typeof Graphics !== "undefined" && (Graphics._canvas || (Graphics.app && Graphics.app.canvas));
    if (!canvas || typeof canvas.addEventListener !== "function" || canvas.__rrTileAtlasWatched) return;
    canvas.__rrTileAtlasWatched = true;
    canvas.addEventListener("webglcontextrestored", () => {
        const live = Tilemap.Layer._v8AtlasLive;
        for (const entry of live) if (entry.dropped && !entry.source.destroyed) Tilemap.Layer._paintV8Atlas(entry);
    });
};

Tilemap.Layer._v8AtlasLive = new Set();

Tilemap.Layer._releaseV8Atlas = function(entry) {
    if (!entry || --entry.refs > 0) return;
    this._v8AtlasCache.delete(entry.bitmaps);
    this._v8AtlasLive.delete(entry);
    if (entry.texture && !entry.texture.destroyed) {
        Tilemap.Layer._unbindV8AtlasSource(entry.source);
        entry.texture.destroy(true);
    }
    if (entry.canvas) {
        entry.canvas.width = 0;
        entry.canvas.height = 0;
    }
};

// The mesh pipe's shared shader keeps the last-drawn texture source in
// its resources (uTexture/uSampler) after the final draw, so destroying
// the atlas source while it is still bound makes every map transfer warn
// "[BindGroup] a 'textureSource' was destroyed while still bound to a
// shader". Point those slots at the empty texture first. Every access is
// guarded: on a renderer without this shape nothing happens and the
// warning stays cosmetic (PIXI nulls the dead slot itself).
Tilemap.Layer._unbindV8AtlasSource = function(source) {
    try {
        if (!source) return;
        const app = typeof Graphics !== "undefined" ? Graphics.app : null;
        const pipes = app && app.renderer && app.renderer.renderPipes;
        const adaptor = pipes && pipes.mesh && pipes.mesh._adaptor;
        const resources = adaptor && adaptor._shader && adaptor._shader.resources;
        if (!resources) return;
        const empty = PIXI.Texture && PIXI.Texture.EMPTY;
        if (!empty || !empty.source) return;
        if (resources.uTexture === source) resources.uTexture = empty.source;
        if (resources.uSampler === source.style) resources.uSampler = empty.source.style;
    } catch (error) {
        // Cosmetic only — the warning self-heals.
    }
};

// Quad storage a tile mesh keeps between paints: arrays only grow, so a
// repaint allocates nothing. Quads past the ones in use sit at one point
// (no area, nothing drawn) until written.
Tilemap.Layer._newV8Quads = function() {
    return { positions: null, uvs: null, indices: null, capacity: 0, used: 0 };
};

Tilemap.Layer._ensureV8Quads = function(quads, count) {
    if (quads.positions && quads.capacity >= count) return false;
    const capacity = Math.max(64, count, Math.ceil(quads.capacity * 1.5));
    const positions = new Float32Array(capacity * 8);
    const uvs = new Float32Array(capacity * 8);
    const indices = new Uint32Array(capacity * 6);
    for (let n = 0, v = 0, i = 0; n < capacity; n++, v += 4, i += 6) {
        indices[i] = v;
        indices[i + 1] = v + 1;
        indices[i + 2] = v + 2;
        indices[i + 3] = v;
        indices[i + 4] = v + 2;
        indices[i + 5] = v + 3;
    }
    if (quads.positions) {
        positions.set(quads.positions.subarray(0, quads.used * 8));
        uvs.set(quads.uvs.subarray(0, quads.used * 8));
    }
    Object.assign(quads, { positions, uvs, indices, capacity });
    return true;
};

/**
 * Quad n of a tile mesh: the corners and atlas UVs of one tile rect. The
 * part of a rect past its sheet's edge is clipped off, so it draws as the
 * transparent margin around a sheet did; a rect wholly past it is not drawn.
 */
Tilemap.Layer._writeV8Quad = function(atlas, positions, uvs, n, setNumber, sx, sy, dx, dy, w, h) {
    const p = n * 8;
    let left;
    let top;
    let right;
    let bottom;
    if (setNumber < 0) {
        left = right = (atlas.shadowX + 0.5) / atlas.width;
        top = bottom = (atlas.shadowY + 0.5) / atlas.height;
    } else {
        if (!(setNumber < Tilemap.Layer.V8_ATLAS_SHEETS)) {
            throw new Error(`tileset sheet ${setNumber} is outside the mesh atlas`);
        }
        const sheetWidth = atlas.rw[setNumber];
        const sheetHeight = atlas.rh[setNumber];
        if (sx + w > sheetWidth) w = sheetWidth - sx;
        if (sy + h > sheetHeight) h = sheetHeight - sy;
        if (!(w > 0 && h > 0)) {
            positions.fill(0, p, p + 8);
            uvs.fill(0, p, p + 8);
            return;
        }
        const offsetX = atlas.ox[setNumber];
        const offsetY = atlas.oy[setNumber];
        // Inset the UV rect by a hair, not half a texel. Interpolated
        // fragment UVs stay strictly inside the vertex bounds, so a
        // tiny inset is enough to keep a quad edge from ever sampling
        // the neighbouring atlas row; a half-texel inset compresses w
        // texels into a (w - 1) span, and the moment the tilemap sits
        // at a fractional screen position or any zoom, one texel row
        // per tile duplicates or drops — crawling horizontal seams
        // whenever a camera pans or zooms.
        const inset = 1 / 128;
        left = (offsetX + sx + inset) / atlas.width;
        top = (offsetY + sy + inset) / atlas.height;
        right = (offsetX + sx + w - inset) / atlas.width;
        bottom = (offsetY + sy + h - inset) / atlas.height;
    }
    positions[p] = dx;
    positions[p + 1] = dy;
    positions[p + 2] = dx + w;
    positions[p + 3] = dy;
    positions[p + 4] = dx + w;
    positions[p + 5] = dy + h;
    positions[p + 6] = dx;
    positions[p + 7] = dy + h;
    uvs[p] = left;
    uvs[p + 1] = top;
    uvs[p + 2] = right;
    uvs[p + 3] = top;
    uvs[p + 4] = right;
    uvs[p + 5] = bottom;
    uvs[p + 6] = left;
    uvs[p + 7] = bottom;
};

// Hands the written quads to the mesh: new arrays when they grew, otherwise
// an upload of the quads in use (and of any that just fell out of use).
Tilemap.Layer._publishV8Quads = function(geometry, quads, count, grew) {
    if (count < quads.used) {
        quads.positions.fill(0, count * 8, quads.used * 8);
    }
    const written = Math.max(count, quads.used);
    quads.used = count;
    const positionBuffer = geometry.attributes.aPosition.buffer;
    if (grew || positionBuffer.data !== quads.positions) {
        geometry.positions = quads.positions;
        geometry.uvs = quads.uvs;
        geometry.indices = quads.indices;
    } else if (written > 0) {
        positionBuffer.update(written * 8 * 4);
        geometry.attributes.aUV.buffer.update(written * 8 * 4);
    }
};

// v8 tile textures register on their (session-cached) source's resize
// listener list, so dropping the cache without destroying them retains
// every texture for the whole session — one leaked batch per map transfer.
Tilemap.Layer.prototype._destroyV8TexCache = function() {
    if (this._v8TileRoot) {
        for (const child of [...this._v8TileRoot.children]) {
            if (!child._reactorTileSprite) continue;
            this._v8TileRoot.removeChild(child);
            if (!child.destroyed) child.destroy();
        }
    }
    if (this._v8TexCache) {
        for (const texture of this._v8TexCache.values()) {
            if (texture && !texture.destroyed) {
                texture.destroy();
            }
        }
        this._v8TexCache = null;
    }
    if (this._v8SpritePool) {
        for (const sprite of this._v8SpritePool) {
            if (sprite && !sprite.destroyed) {
                sprite.destroy();
            }
        }
        this._v8SpritePool = null;
    }
};

Tilemap.Layer.prototype._destroyV8Mesh = function() {
    if (this._v8Mesh) {
        if (this._v8Mesh.parent) this._v8Mesh.parent.removeChild(this._v8Mesh);
        this._v8Mesh.destroy({ texture: false, textureSource: false });
        this._v8Mesh = null;
        Tilemap.Layer._v8Stats().activeMeshes--;
    }
    if (this._v8Geometry) {
        this._v8Geometry.destroy(true);
        this._v8Geometry = null;
    }
    if (this._v8Atlas) {
        Tilemap.Layer._releaseV8Atlas(this._v8Atlas);
        this._v8Atlas = null;
    }
    this._v8AtlasBitmaps = null;
};

Tilemap.Layer.prototype._setupV8Backend = function(bitmaps) {
    this._destroyV8Mesh();
    this._destroyV8TexCache();
    const stats = Tilemap.Layer._v8Stats();
    const requested = Tilemap.Layer._requestedV8Backend();
    stats.requested = requested;
    if (requested === "sprites") {
        this._v8Backend = "sprites";
        stats.backend = "sprites";
        return;
    }
    try {
        if (typeof PIXI.Mesh !== "function" || typeof PIXI.MeshGeometry !== "function") {
            throw new Error("PIXI 8 mesh classes are unavailable");
        }
        // The atlas (the tileset sheets packed together, about 20 MB on the GPU for a full set
        // of 48px sheets) is made when the first tile is drawn (_syncV8Backend): a layer that draws none, as on a 3D map,
        // never makes one.
        this._v8AtlasBitmaps = bitmaps;
        this._v8Geometry = new PIXI.MeshGeometry({
            positions: new Float32Array(8),
            uvs: new Float32Array(8),
            indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
            shrinkBuffersToFit: false
        });
        this._v8Geometry.batchMode = "no-batch";
        this._v8Mesh = new PIXI.Mesh({
            geometry: this._v8Geometry,
            texture: PIXI.Texture.EMPTY,
            roundPixels: true
        });
        this._v8Mesh.eventMode = "none";
        this._v8Mesh.visible = false;
        this._v8TileRoot.addChild(this._v8Mesh);
        this._v8Backend = "mesh";
        this._v8MeshDirty = true;
        stats.backend = "mesh";
        stats.activeMeshes++;
    } catch (error) {
        this._destroyV8Mesh();
        this._v8Backend = "sprites";
        stats.backend = "sprites";
        stats.fallbacks++;
        stats.fallbackReason = error && error.message ? error.message : String(error);
    }
};

Tilemap.Layer.prototype._switchV8ToSprites = function(reason) {
    const elements = this._elements.slice();
    this._destroyV8Mesh();
    this._destroyV8TexCache();
    this._v8Backend = "sprites";
    const stats = Tilemap.Layer._v8Stats();
    stats.backend = "sprites";
    stats.fallbacks++;
    stats.fallbackReason = reason && reason.message ? reason.message : String(reason || "mesh failed");
    for (const item of elements) this._addV8Tile(...item);
};

Tilemap.Layer.prototype.destroy = function(options) {
    if (this.destroyed) return;
    if (this._vao) {
        this._vao.destroy();
        this._indexBuffer.destroy();
        this._vertexBuffer.destroy();
    }
    this._indexBuffer = null;
    this._vertexBuffer = null;
    this._vao = null;
    this._destroyV8Mesh();
    this._destroyV8TexCache();
    if (this._v8TileRoot) {
        if (this._v8TileRoot.parent) this._v8TileRoot.parent.removeChild(this._v8TileRoot);
        this._v8TileRoot.destroy({ children: true, texture: false, textureSource: false });
        this._v8TileRoot = null;
    }
    PIXI.Container.prototype.destroy.call(this, options);
};

Tilemap.Layer.prototype.setBitmaps = function(bitmaps) {
    this._images = bitmaps.map(bitmap => bitmap.image || bitmap.canvas);
    this._needsTexturesUpdate = true;
    // v8: tile textures are cached per (set, frame); a tileset change
    // invalidates them.
    this._destroyV8TexCache();
    if (PIXI.TextureSource) this._setupV8Backend(bitmaps);
};

Tilemap.Layer.prototype.clear = function() {
    this._elements.length = 0;
    this._needsVertexUpdate = true;
    // v8: park the tile Sprites in a DETACHED pool and reuse them on the
    // next paint. Destroying and recreating ~2k sprites on every repaint
    // (each scroll across the painted-region boundary) cost a 77ms frame
    // spike; pooling makes repaints nearly allocation-free. Parking
    // (instead of in-place cursor reuse) guarantees no stale tiles can
    // ever remain visible: only sprites the current paint explicitly
    // placed are in the tree.
    if (PIXI.TextureSource && this._v8Backend === "mesh") {
        this._v8MeshDirty = true;
        if (this._v8Mesh) this._v8Mesh.visible = false;
    } else if (PIXI.TextureSource) {
        if (!this._v8SpritePool) this._v8SpritePool = [];
        if (this._v8TileRoot && this._v8TileRoot.children.length > 0) {
            for (const child of [...this._v8TileRoot.children]) {
                if (!child._reactorTileSprite) continue;
                this._v8SpritePool.push(child);
                this._v8TileRoot.removeChild(child);
            }
        }
    }
};

Tilemap.Layer.prototype.size = function() {
    return this._elements.length;
};

Tilemap.Layer.prototype.addRect = function(setNumber, sx, sy, dx, dy, w, h) {
    this._elements.push([setNumber, sx, sy, dx, dy, w, h]);
    this._v8MeshDirty = true;
    if (PIXI.TextureSource && this._v8Backend !== "mesh") {
        this._addV8Tile(setNumber, sx, sy, dx, dy, w, h);
    }
};

Tilemap.Layer.prototype._syncV8Backend = function() {
    if (!PIXI.TextureSource || !this._v8TileRoot) return;
    const ultraMode7 = typeof UltraMode7 !== "undefined" &&
        typeof UltraMode7.isActive === "function" && UltraMode7.isActive();
    this._v8TileRoot.visible = !ultraMode7;
    if (ultraMode7 || this._v8Backend !== "mesh") return;
    // Not shown (a 3D map draws the tiles itself): no atlas, and one it holds is
    // given back; the layer is drawn again from its tiles when it shows.
    if (!this.visible || (this.parent && this.parent.visible === false)) {
        if (this._v8Atlas) {
            if (this._v8Mesh) { this._v8Mesh.visible = false; this._v8Mesh.texture = PIXI.Texture.EMPTY; }
            Tilemap.Layer._releaseV8Atlas(this._v8Atlas);
            this._v8Atlas = null;
            this._v8MeshDirty = true;
        }
        return;
    }
    if (this._v8Atlas) Tilemap.Layer._keepV8AtlasPixels(this._v8Atlas);
    if (!this._v8MeshDirty) return;
    try {
        const count = this._elements.length;
        if (!this._v8Atlas) {
            if (!count) {
                if (this._v8Mesh) this._v8Mesh.visible = false;
                this._v8MeshDirty = false;
                return;
            }
            this._v8Atlas = Tilemap.Layer._acquireV8Atlas(this._v8AtlasBitmaps);
            this._v8Mesh.texture = this._v8Atlas.texture;
        }
        const atlas = this._v8Atlas;
        const quads = this._v8Quads || (this._v8Quads = Tilemap.Layer._newV8Quads());
        const grew = Tilemap.Layer._ensureV8Quads(quads, count);
        const positions = quads.positions;
        const uvs = quads.uvs;
        const started = typeof performance !== "undefined" ? performance.now() : 0;
        const elements = this._elements;
        for (let n = 0; n < count; n++) {
            const item = elements[n];
            Tilemap.Layer._writeV8Quad(atlas, positions, uvs, n,
                item[0], item[1], item[2], item[3], item[4], item[5], item[6]);
        }
        Tilemap.Layer._publishV8Quads(this._v8Geometry, quads, count, grew);
        this._v8Mesh.visible = count > 0;
        this._v8MeshDirty = false;
        const stats = Tilemap.Layer._v8Stats();
        stats.meshBuilds++;
        stats.lastRectCount = count;
        stats.lastVertexCount = count * 4;
        if (started) stats.meshBuildMs += performance.now() - started;
    } catch (error) {
        this._switchV8ToSprites(error);
    }
};

Tilemap.Layer.prototype._addV8Tile = function(setNumber, sx, sy, dx, dy, w, h) {
    const isShadow = setNumber < 0;
    const image = isShadow ? null : this._images[setNumber];
    if (!isShadow && !image) return;
    /*
     * An image that has not decoded yet must not become a texture source.
     *
     * The source is cached on the image element and lives for the session, so
     * one built from an image measuring nothing is 1x1 forever -- and every
     * tile drawn from that sheet afterwards samples a single pixel and comes
     * out as one flat colour. A forest turns into plain green squares, and it
     * never recovers, because the sheet finishing loading does not invalidate
     * anything. Paints run every frame from updateTransform, including the
     * frames before the tileset arrives, so this is reachable in normal play
     * and not a theoretical case. Skipping the tile costs one repaint;
     * _updateBitmaps sets _needsRepaint when the images are genuinely ready.
     */
    if (!isShadow && !image.width && !image.naturalWidth && !image.videoWidth) return;
    // Cache a TextureSource per source image to avoid recreating on every tile.
    // scaleMode MUST be 'nearest' for tile sources -- with linear (the v8
    // default) we get sub-texel interpolation across tile edges in the source
    // image, which manifests as vertical/horizontal "garbage seams" between
    // adjacent tiles on screen. Original MZ Tilemap.Renderer._createInternalTextures
    // hardcoded SCALE_MODES.NEAREST for the same reason.
    if (!isShadow && !image.__pixiTilemapSource) {
        try {
            let SourceClass = PIXI.TextureSource;
            if (typeof HTMLImageElement !== "undefined" &&
                image instanceof HTMLImageElement) {
                SourceClass = PIXI.ImageSource || PIXI.TextureSource;
            } else if (typeof HTMLCanvasElement !== "undefined" &&
                       image instanceof HTMLCanvasElement) {
                SourceClass = PIXI.CanvasSource || PIXI.TextureSource;
            }
            image.__pixiTilemapSource = new SourceClass({
                resource: image,
                scaleMode: "nearest"
            });
        } catch (e) {
            return;
        }
    }
    try {
        // Texture cache: tiles repeat heavily, so after warmup repaints
        // create no textures at all.
        let texture = PIXI.Texture.WHITE;
        if (!isShadow) {
            if (!this._v8TexCache) this._v8TexCache = new Map();
            const key = setNumber + ":" + sx + ":" + sy + ":" + w + ":" + h;
            texture = this._v8TexCache.get(key);
            if (!texture) {
                texture = new PIXI.Texture({
                    source: image.__pixiTilemapSource,
                    frame: new PIXI.Rectangle(sx, sy, w, h)
                });
                this._v8TexCache.set(key, texture);
            }
        }
        // Sprite reuse from the detached pool; only allocate when the
        // viewport genuinely needs more tiles than any previous paint.
        let sprite = this._v8SpritePool && this._v8SpritePool.pop();
        if (sprite) {
            if (sprite.texture !== texture) sprite.texture = texture;
            Tilemap.Layer._v8Stats().spritePoolHits++;
        } else {
            sprite = new PIXI.Sprite(texture);
            Tilemap.Layer._v8Stats().spriteAllocations++;
        }
        sprite._reactorTileSprite = true;
        sprite.scale.set(1, 1);
        sprite.tint = 0xffffff;
        sprite.alpha = 1;
        sprite.blendMode = "inherit";
        sprite.position.set(dx, dy);
        if (isShadow) {
            sprite.tint = 0x000000;
            sprite.alpha = 0.5;
            sprite.width = w;
            sprite.height = h;
        }
        this._v8TileRoot.addChild(sprite);
    } catch (e) { /* skip this tile */ }
};

Tilemap.Layer.prototype.render = function(renderer) {
    // v8: renderer.plugins is gone (render-plugin system removed) and our
    // rpgtilemap registration is a no-op; bail out before touching v7-only
    // primitives (renderer.batch, renderer.geometry, renderer.shader, etc.).
    // Tilemap rendering needs Phase 5 v8 rewrite.
    const tilemapRenderer =
        renderer.plugins && renderer.plugins.rpgtilemap;
    if (!tilemapRenderer ||
        typeof tilemapRenderer.getShader !== "function" ||
        !this._vao) {
        this._syncV8Backend();
        return;
    }
    const gl = renderer.gl;
    const shader = tilemapRenderer.getShader();
    const matrix = shader.uniforms.uProjectionMatrix;

    renderer.batch.setObjectRenderer(tilemapRenderer);
    renderer.projection.projectionMatrix.copyTo(matrix);
    matrix.append(this.worldTransform);
    renderer.shader.bind(shader);

    if (this._needsTexturesUpdate) {
        tilemapRenderer.updateTextures(renderer, this._images);
        this._needsTexturesUpdate = false;
    }
    tilemapRenderer.bindTextures(renderer);
    renderer.geometry.bind(this._vao, shader);
    this._updateIndexBuffer();
    if (this._needsVertexUpdate) {
        this._updateVertexBuffer();
        this._needsVertexUpdate = false;
    }
    renderer.geometry.updateBuffers();

    const numElements = this._elements.length;
    if (numElements > 0) {
        renderer.state.set(this._state);
        renderer.geometry.draw(gl.TRIANGLES, numElements * 6, 0);
    }
};

Tilemap.Layer.prototype.isReady = function() {
    if (this._images.length === 0) {
        return false;
    }
    if (PIXI.TextureSource) {
        return this._images.every(image => !image || Boolean(
            image.width || image.naturalWidth || image.videoWidth));
    }
    for (const texture of this._images) {
        if (!texture || !texture.valid) {
            return false;
        }
    }
    return true;
};

Tilemap.Layer.prototype._createVao = function() {
    // v8 rewrote Buffer (object-form constructor) and Geometry (attribute
    // descriptors instead of fluent addAttribute). Full v8 tilemap pipeline
    // is Phase 5; until then, attempt the v5/v6/v7 path and gracefully no-op
    // on v8 so boot proceeds (map will be invisible).
    try {
        const ib = new PIXI.Buffer(null, true, true);
        const vb = new PIXI.Buffer(null, true, false);
        const stride = Tilemap.Layer.VERTEX_STRIDE;
        const type = PIXI.TYPES.FLOAT;
        const geometry = new PIXI.Geometry();
        this._indexBuffer = ib;
        this._vertexBuffer = vb;
        this._vao = geometry
            .addIndex(this._indexBuffer)
            .addAttribute("aTextureId", vb, 1, false, type, stride, 0)
            .addAttribute("aFrame", vb, 4, false, type, stride, 1 * 4)
            .addAttribute("aSource", vb, 2, false, type, stride, 5 * 4)
            .addAttribute("aDest", vb, 2, false, type, stride, 7 * 4);
    } catch (e) {
        this._indexBuffer = null;
        this._vertexBuffer = null;
        this._vao = null;
    }
};

Tilemap.Layer.prototype._updateIndexBuffer = function() {
    const numElements = this._elements.length;
    if (this._indexArray.length < numElements * 6 * 2) {
        this._indexArray = PIXI.utils.createIndicesForQuads(numElements * 2);
        this._indexBuffer.update(this._indexArray);
    }
};

Tilemap.Layer.prototype._updateVertexBuffer = function() {
    const numElements = this._elements.length;
    const required = numElements * Tilemap.Layer.VERTEX_STRIDE;
    if (this._vertexArray.length < required) {
        this._vertexArray = new Float32Array(required * 2);
    }
    const vertexArray = this._vertexArray;
    let index = 0;
    for (const item of this._elements) {
        const setNumber = item[0];
        const tid = setNumber >> 2;
        const sxOffset = 1024 * (setNumber & 1);
        const syOffset = 1024 * ((setNumber >> 1) & 1);
        const sx = item[1] + sxOffset;
        const sy = item[2] + syOffset;
        const dx = item[3];
        const dy = item[4];
        const w = item[5];
        const h = item[6];
        const frameLeft = sx + 0.5;
        const frameTop = sy + 0.5;
        const frameRight = sx + w - 0.5;
        const frameBottom = sy + h - 0.5;
        vertexArray[index++] = tid;
        vertexArray[index++] = frameLeft;
        vertexArray[index++] = frameTop;
        vertexArray[index++] = frameRight;
        vertexArray[index++] = frameBottom;
        vertexArray[index++] = sx;
        vertexArray[index++] = sy;
        vertexArray[index++] = dx;
        vertexArray[index++] = dy;
        vertexArray[index++] = tid;
        vertexArray[index++] = frameLeft;
        vertexArray[index++] = frameTop;
        vertexArray[index++] = frameRight;
        vertexArray[index++] = frameBottom;
        vertexArray[index++] = sx + w;
        vertexArray[index++] = sy;
        vertexArray[index++] = dx + w;
        vertexArray[index++] = dy;
        vertexArray[index++] = tid;
        vertexArray[index++] = frameLeft;
        vertexArray[index++] = frameTop;
        vertexArray[index++] = frameRight;
        vertexArray[index++] = frameBottom;
        vertexArray[index++] = sx + w;
        vertexArray[index++] = sy + h;
        vertexArray[index++] = dx + w;
        vertexArray[index++] = dy + h;
        vertexArray[index++] = tid;
        vertexArray[index++] = frameLeft;
        vertexArray[index++] = frameTop;
        vertexArray[index++] = frameRight;
        vertexArray[index++] = frameBottom;
        vertexArray[index++] = sx;
        vertexArray[index++] = sy + h;
        vertexArray[index++] = dx;
        vertexArray[index++] = dy + h;
    }
    this._vertexBuffer.update(vertexArray);
};

Tilemap.CombinedLayer = function() {
    this.initialize(...arguments);
};

Tilemap.CombinedLayer.prototype = Object.create(PIXI.Container.prototype);
Tilemap.CombinedLayer.prototype.constructor = Tilemap.CombinedLayer;

Tilemap.CombinedLayer.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);
    for (let i = 0; i < 2; i++) {
        this.addChild(new Tilemap.Layer());
    }
};

Tilemap.CombinedLayer.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.Container.prototype.destroy.call(this, options);
};

Tilemap.CombinedLayer.prototype.setBitmaps = function(bitmaps) {
    for (const child of this.children) {
        if (typeof child.size === "function" && typeof child.addRect === "function" &&
            typeof child.setBitmaps === "function") child.setBitmaps(bitmaps);
    }
};

Tilemap.CombinedLayer.prototype.clear = function() {
    for (const child of this.children) {
        if (typeof child.size === "function" && typeof child.addRect === "function" &&
            typeof child.clear === "function") child.clear();
    }
};

Tilemap.CombinedLayer.prototype.size = function() {
    return this.children.reduce((r, child) =>
        r + (typeof child.size === "function" ? Number(child.size()) || 0 : 0), 0);
};

// prettier-ignore
Tilemap.CombinedLayer.prototype.addRect = function(
    setNumber, sx, sy, dx, dy, w, h
) {
    // Runs for every rect of every paint: an indexed walk, and the seven
    // arguments passed as such unless a caller gave more.
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (typeof child.size === "function" && typeof child.addRect === "function" &&
            child.size() < Tilemap.Layer.MAX_SIZE) {
            if (arguments.length > 7) child.addRect.apply(child, arguments);
            else child.addRect(setNumber, sx, sy, dx, dy, w, h);
            break;
        }
    }
};

Tilemap.CombinedLayer.prototype.isReady = function() {
    return this.children.every(child => {
        const isTileLayer = typeof child.size === "function" && typeof child.addRect === "function";
        return !isTileLayer || typeof child.isReady !== "function" || child.isReady();
    });
};

Tilemap.CombinedLayer.prototype._syncV8Backend = function() {
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (typeof child._syncV8Backend === "function") child._syncV8Backend();
    }
};

// The painting path as this file defines it, before any plugin loads: a
// tilemap paints in chunks only while its methods are still these.
if (Tilemap.ChunkPaint) Tilemap.ChunkPaint.stock = (function() {
    const stock = {};
    for (const name of Tilemap.ChunkPaint.HOOKS) stock[name] = Tilemap.prototype[name];
    stock.layerAddRect = Tilemap.Layer.prototype.addRect;
    stock.layerClear = Tilemap.Layer.prototype.clear;
    stock.combinedAddRect = Tilemap.CombinedLayer.prototype.addRect;
    stock.combinedClear = Tilemap.CombinedLayer.prototype.clear;
    return stock;
})();

// Plugins load after this file: note which of them installs each painting method.
if (Tilemap.ChunkPaint) Tilemap.ChunkPaint.watch([
    [Tilemap.prototype, Tilemap.ChunkPaint.HOOKS],
    [Tilemap.Layer.prototype, ["addRect", "clear"]],
    [Tilemap.CombinedLayer.prototype, ["addRect", "clear"]]
]);

Tilemap.Renderer = function() {
    this.initialize(...arguments);
};

Tilemap.Renderer.prototype = Object.create(PIXI.ObjectRenderer.prototype);
Tilemap.Renderer.prototype.constructor = Tilemap.Renderer;

Tilemap.Renderer.prototype.initialize = function(renderer) {
    PIXISuper(PIXI.ObjectRenderer, this, [renderer]);
    this._shader = null;
    this._images = [];
    this._internalTextures = [];
    this._clearBuffer = new Uint8Array(1024 * 1024 * 4);
    this.contextChange();
};

Tilemap.Renderer.prototype.destroy = function() {
    PIXI.ObjectRenderer.prototype.destroy.call(this);
    this._destroyInternalTextures();
    this._shader.destroy();
    this._shader = null;
};

Tilemap.Renderer.prototype.getShader = function() {
    return this._shader;
};

Tilemap.Renderer.prototype.contextChange = function() {
    this._shader = this._createShader();
    this._images = [];
    this._createInternalTextures();
};

Tilemap.Renderer.prototype._createShader = function() {
    const vertexSrc =
        "attribute float aTextureId;" +
        "attribute vec4 aFrame;" +
        "attribute vec2 aSource;" +
        "attribute vec2 aDest;" +
        "uniform mat3 uProjectionMatrix;" +
        "varying vec4 vFrame;" +
        "varying vec2 vTextureCoord;" +
        "varying float vTextureId;" +
        "void main(void) {" +
        "  vec3 position = uProjectionMatrix * vec3(aDest, 1.0);" +
        "  gl_Position = vec4(position, 1.0);" +
        "  vFrame = aFrame;" +
        "  vTextureCoord = aSource;" +
        "  vTextureId = aTextureId;" +
        "}";
    const fragmentSrc =
        "varying vec4 vFrame;" +
        "varying vec2 vTextureCoord;" +
        "varying float vTextureId;" +
        "uniform sampler2D uSampler0;" +
        "uniform sampler2D uSampler1;" +
        "uniform sampler2D uSampler2;" +
        "void main(void) {" +
        "  vec2 textureCoord = clamp(vTextureCoord, vFrame.xy, vFrame.zw);" +
        "  int textureId = int(vTextureId);" +
        "  vec4 color;" +
        "  if (textureId < 0) {" +
        "    color = vec4(0.0, 0.0, 0.0, 0.5);" +
        "  } else if (textureId == 0) {" +
        "    color = texture2D(uSampler0, textureCoord / 2048.0);" +
        "  } else if (textureId == 1) {" +
        "    color = texture2D(uSampler1, textureCoord / 2048.0);" +
        "  } else if (textureId == 2) {" +
        "    color = texture2D(uSampler2, textureCoord / 2048.0);" +
        "  }" +
        "  gl_FragColor = color;" +
        "}";

    return new PIXI.Shader(PIXI.Program.from(vertexSrc, fragmentSrc), {
        uSampler0: 0,
        uSampler1: 1,
        uSampler2: 2,
        uProjectionMatrix: new PIXI.Matrix()
    });
};

Tilemap.Renderer.prototype._createInternalTextures = function() {
    this._destroyInternalTextures();
    for (let i = 0; i < Tilemap.Layer.MAX_GL_TEXTURES; i++) {
        const baseTexture = new PIXI.BaseRenderTexture();
        baseTexture.resize(2048, 2048);
        baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        this._internalTextures.push(baseTexture);
    }
};

Tilemap.Renderer.prototype._destroyInternalTextures = function() {
    for (const internalTexture of this._internalTextures) {
        internalTexture.destroy();
    }
    this._internalTextures = [];
};

Tilemap.Renderer.prototype.updateTextures = function(renderer, images) {
    for (let i = 0; i < images.length; i++) {
        const internalTexture = this._internalTextures[i >> 2];
        renderer.texture.bind(internalTexture, 0);
        const gl = renderer.gl;
        const x = 1024 * (i % 2);
        const y = 1024 * ((i >> 1) % 2);
        const format = gl.RGBA;
        const type = gl.UNSIGNED_BYTE;
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        // prettier-ignore
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, 1024, 1024, format, type,
                         this._clearBuffer);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, format, type, images[i]);
    }
};

Tilemap.Renderer.prototype.bindTextures = function(renderer) {
    for (let ti = 0; ti < Tilemap.Layer.MAX_GL_TEXTURES; ti++) {
        renderer.texture.bind(this._internalTextures[ti], ti);
    }
};

if (
    PIXI.extensions &&
    PIXI.ExtensionType &&
    PIXI.ExtensionType.RendererPlugin
) {
    // v6/v7: extensions API with RendererPlugin type.
    PIXI.extensions.add({
        name: "rpgtilemap",
        type: PIXI.ExtensionType.RendererPlugin,
        ref: Tilemap.Renderer
    });
} else if (PIXI.Renderer && PIXI.Renderer.registerPlugin) {
    // v5: classic registerPlugin (or our v8 compat no-op).
    PIXI.Renderer.registerPlugin("rpgtilemap", Tilemap.Renderer);
}
// v8: render-plugin registration is a compatibility no-op; Tilemap.Layer uses
// native PIXI.Mesh children there and keeps this renderer for v5-v7 plugins.

//-----------------------------------------------------------------------------
/**
 * The sprite object for a tiling image.
 *
 * @class
 * @extends PIXI.TilingSprite
 * @param {Bitmap} bitmap - The image for the tiling sprite.
 */
function TilingSprite() {
    this.initialize(...arguments);
}

TilingSprite.prototype = Object.create(PIXI.TilingSprite.prototype);
TilingSprite.prototype.constructor = TilingSprite;

TilingSprite.prototype.initialize = function(bitmap) {
    if (!TilingSprite._emptyBaseTexture) {
        TilingSprite._emptyBaseTexture = new PIXI.BaseTexture();
        TilingSprite._emptyBaseTexture.setSize(1, 1);
    }
    const frame = new Rectangle();
    const texture = PIXICreateTexture(TilingSprite._emptyBaseTexture, frame);
    PIXISuper(PIXI.TilingSprite, this, [texture]);
    this._bitmap = bitmap;
    this._width = 0;
    this._height = 0;
    this._frame = frame;

    /**
     * The origin point of the tiling sprite for scrolling.
     *
     * @type Point
     */
    this.origin = new Point();

    this._onBitmapChange();
};

TilingSprite._emptyBaseTexture = null;

/**
 * The image for the tiling sprite.
 *
 * @type Bitmap
 * @name TilingSprite#bitmap
 */
Object.defineProperty(TilingSprite.prototype, "bitmap", {
    get: function() {
        return this._bitmap;
    },
    set: function(value) {
        if (this._bitmap !== value) {
            this._bitmap = value;
            this._onBitmapChange();
        }
    },
    configurable: true
});

/**
 * The opacity of the tiling sprite (0 to 255).
 *
 * @type number
 * @name TilingSprite#opacity
 */
Object.defineProperty(TilingSprite.prototype, "opacity", {
    get: function() {
        return this.alpha * 255;
    },
    set: function(value) {
        this.alpha = Math.min(Math.max(value, 0), 255) / 255;
    },
    configurable: true
});

/**
 * Destroys the tiling sprite.
 */
TilingSprite.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.TilingSprite.prototype.destroy.call(this, options);
};

/**
 * Updates the tiling sprite for each frame.
 */
TilingSprite.prototype.update = function() {
    if (this.visible && this.worldVisible !== false && this._bitmap) {
        this._bitmap._updateAnimatedImage();
    }
    // Indexed: runs every frame for every node, and allocates nothing.
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.update) {
            child.update();
        }
    }
};

/**
 * Sets the x, y, width, and height all at once.
 *
 * @param {number} x - The x coordinate of the tiling sprite.
 * @param {number} y - The y coordinate of the tiling sprite.
 * @param {number} width - The width of the tiling sprite.
 * @param {number} height - The height of the tiling sprite.
 */
TilingSprite.prototype.move = function(x, y, width, height) {
    this.x = x || 0;
    this.y = y || 0;
    const w = width || 0;
    const h = height || 0;
    if (this._width === w && this._height === h) return;
    this._width = w;
    this._height = h;
    // v8 redraws a size change only when told; without this a window that
    // shrinks after its first draw (a floating message) keeps its old back.
    if (typeof this.onViewUpdate === "function") {
        this.onViewUpdate();
    }
};

/**
 * Specifies the region of the image that the tiling sprite will use.
 *
 * @param {number} x - The x coordinate of the frame.
 * @param {number} y - The y coordinate of the frame.
 * @param {number} width - The width of the frame.
 * @param {number} height - The height of the frame.
 */
TilingSprite.prototype.setFrame = function(x, y, width, height) {
    this._frame.x = x;
    this._frame.y = y;
    this._frame.width = width;
    this._frame.height = height;
    this._refresh();
};

/**
 * Updates the transform on all children of this container for rendering.
 */
TilingSprite.prototype.updateTransform = function() {
    this.tilePosition.x = Math.round(-this.origin.x);
    this.tilePosition.y = Math.round(-this.origin.y);
    // v8: PIXI.TilingSprite has no own updateTransform; inherits from
    // Container whose v8 updateTransform(opts) is a property-setter that
    // throws on no-args. v8 cascades transforms automatically.
    if (!PIXI.TextureSource) {
        PIXI.TilingSprite.prototype.updateTransform.call(this);
    }
};

TilingSprite.prototype._onBitmapChange = function() {
    if (this._bitmap) {
        this._bitmap.addLoadListener(this._onBitmapLoad.bind(this));
    } else {
        this.texture.frame = new Rectangle();
    }
};

TilingSprite.prototype._onBitmapLoad = function() {
    // v8: REPLACE the whole texture so cached bounds (from the initial 1x1
    // empty stub) get reset. Mutating .source alone leaves the sprite
    // rendering at 1x1. v5/v6/v7 can use the legacy mutation pattern.
    const bt = this._bitmap.baseTexture;
    if (PIXI.TextureSource && bt && bt.source) {
        // Destroy the replaced texture (if this path created it) — the v8
        // constructor subscribes it to the source's resize event, which
        // otherwise retains every orphaned texture for the session.
        const old = this.texture;
        this.texture = new PIXI.Texture({ source: bt.source });
        this.texture.__rrSpriteOwned = true;
        if (old && old.__rrSpriteOwned && !old.destroyed) {
            old.destroy();
        }
    } else {
        this.texture.baseTexture = bt;
    }
    this._refresh();
};

TilingSprite.prototype._refresh = function() {
    const texture = this.texture;
    const frame = this._frame.clone();
    if (frame.width === 0 && frame.height === 0 && this._bitmap) {
        frame.width = this._bitmap.width;
        frame.height = this._bitmap.height;
    }
    if (texture) {
        if (PIXI.TextureSource && texture.source) {
            // v8: REPLACE the texture like Sprite._refresh does. Assigning
            // texture.frame swaps the Rectangle without updateUvs() and
            // leaves `orig` on the old rectangle, so the tiling keeps
            // spanning the whole source -- window skins then tile the entire
            // sheet (cursor, arrows, text palette) instead of the pattern
            // quadrant.
            if (frame.width > 0 && frame.height > 0 &&
                (texture.frame.x !== frame.x ||
                    texture.frame.y !== frame.y ||
                    texture.frame.width !== frame.width ||
                    texture.frame.height !== frame.height)) {
                this.texture = new PIXI.Texture({ source: texture.source, frame });
                this.texture.__rrSpriteOwned = true;
                if (texture.__rrSpriteOwned && !texture.destroyed) {
                    texture.destroy();
                }
            }
        } else if (texture.baseTexture) {
            try {
                texture.frame = frame;
            } catch (e) {
                texture.frame = new Rectangle();
            }
        }
        texture._updateID++;
    }
};

//-----------------------------------------------------------------------------
/**
 * The sprite which covers the entire game screen.
 *
 * @class
 * @extends PIXI.Container
 */
function ScreenSprite() {
    this.initialize(...arguments);
}

ScreenSprite.prototype = Object.create(PIXI.Container.prototype);
ScreenSprite.prototype.constructor = ScreenSprite;

ScreenSprite.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);
    this._graphics = new PIXI.Graphics();
    this.addChild(this._graphics);
    this.opacity = 0;
    this._red = -1;
    this._green = -1;
    this._blue = -1;
    this.setBlack();
};

/**
 * The opacity of the sprite (0 to 255).
 *
 * @type number
 * @name ScreenSprite#opacity
 */
Object.defineProperty(ScreenSprite.prototype, "opacity", {
    get: function() {
        return this.alpha * 255;
    },
    set: function(value) {
        this.alpha = Math.min(Math.max(value, 0), 255) / 255;
    },
    configurable: true
});

/**
 * Destroys the screen sprite.
 */
ScreenSprite.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.Container.prototype.destroy.call(this, options);
};

/**
 * Sets black to the color of the screen sprite.
 */
ScreenSprite.prototype.setBlack = function() {
    this.setColor(0, 0, 0);
};

/**
 * Sets white to the color of the screen sprite.
 */
ScreenSprite.prototype.setWhite = function() {
    this.setColor(255, 255, 255);
};

/**
 * Sets the color of the screen sprite by values.
 *
 * @param {number} r - The red value in the range (0, 255).
 * @param {number} g - The green value in the range (0, 255).
 * @param {number} b - The blue value in the range (0, 255).
 */
ScreenSprite.prototype.setColor = function(r, g, b) {
    if (this._red !== r || this._green !== g || this._blue !== b) {
        r = Math.round(r || 0).clamp(0, 255);
        g = Math.round(g || 0).clamp(0, 255);
        b = Math.round(b || 0).clamp(0, 255);
        this._red = r;
        this._green = g;
        this._blue = b;
        const graphics = this._graphics;
        const color = (r << 16) | (g << 8) | b;
        graphics.clear();
        if (typeof graphics.rect === "function" &&
            typeof graphics.fill === "function") {
            // v8: chained shape + style; beginFill/drawRect/endFill removed.
            graphics.rect(-50000, -50000, 100000, 100000).fill({
                color: color,
                alpha: 1
            });
        } else {
            // v5/v6/v7 imperative API.
            graphics.beginFill(color, 1);
            graphics.drawRect(-50000, -50000, 100000, 100000);
            graphics.endFill();
        }
    }
};

//-----------------------------------------------------------------------------
/**
 * The window in the game.
 *
 * @class
 * @extends PIXI.Container
 */
function Window() {
    this.initialize(...arguments);
}

/** PIXI 8 windows clip their contents with a stencil mask rather than a filter pass. */
Window.clipWithMask = true;

/** System.json advanced.windowMargin (a 2003 window has none); 4 when the data is not loaded. */
Window.defaultMargin = function() {
    const advanced = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.advanced;
    return advanced && typeof advanced.windowMargin === "number" ? advanced.windowMargin : 4;
};

Window.prototype = Object.create(PIXI.Container.prototype);
Window.prototype.constructor = Window;

Window.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);

    this._isWindow = true;
    this._windowskin = null;
    this._width = 0;
    this._height = 0;
    this._cursorRect = new Rectangle();
    this._openness = 255;
    this._animationCount = 0;

    this._padding = 12;
    this._margin = Window.defaultMargin();
    this._colorTone = [0, 0, 0, 0];
    this._innerChildren = [];

    this._container = null;
    this._backSprite = null;
    this._frameSprite = null;
    this._contentsBackSprite = null;
    this._cursorSprite = null;
    this._contentsSprite = null;
    this._downArrowSprite = null;
    this._upArrowSprite = null;
    this._pauseSignSprite = null;

    this._createAllParts();

    /**
     * The origin point of the window for scrolling.
     *
     * @type Point
     */
    this.origin = new Point();

    /**
     * The active state for the window.
     *
     * @type boolean
     */
    this.active = true;

    /**
     * The visibility of the frame.
     *
     * @type boolean
     */
    this.frameVisible = true;

    /**
     * The visibility of the cursor.
     *
     * @type boolean
     */
    this.cursorVisible = true;

    /**
     * The visibility of the down scroll arrow.
     *
     * @type boolean
     */
    this.downArrowVisible = false;

    /**
     * The visibility of the up scroll arrow.
     *
     * @type boolean
     */
    this.upArrowVisible = false;

    /**
     * The visibility of the pause sign.
     *
     * @type boolean
     */
    this.pause = false;
};

/**
 * The image used as a window skin.
 *
 * @type Bitmap
 * @name Window#windowskin
 */
Object.defineProperty(Window.prototype, "windowskin", {
    get: function() {
        return this._windowskin;
    },
    set: function(value) {
        if (this._windowskin !== value) {
            this._windowskin = value;
            this._windowskin.addLoadListener(this._onWindowskinLoad.bind(this));
        }
    },
    configurable: true
});

/**
 * The bitmap used for the window contents.
 *
 * @type Bitmap
 * @name Window#contents
 */
Object.defineProperty(Window.prototype, "contents", {
    get: function() {
        return this._contentsSprite.bitmap;
    },
    set: function(value) {
        this._contentsSprite.bitmap = value;
    },
    configurable: true
});

/**
 * The bitmap used for the window contents background.
 *
 * @type Bitmap
 * @name Window#contentsBack
 */
Object.defineProperty(Window.prototype, "contentsBack", {
    get: function() {
        return this._contentsBackSprite.bitmap;
    },
    set: function(value) {
        this._contentsBackSprite.bitmap = value;
    },
    configurable: true
});

/**
 * The width of the window in pixels.
 *
 * @type number
 * @name Window#width
 */
Object.defineProperty(Window.prototype, "width", {
    get: function() {
        return this._width;
    },
    set: function(value) {
        this._width = value;
        this._refreshAllParts();
    },
    configurable: true
});

/**
 * The height of the window in pixels.
 *
 * @type number
 * @name Window#height
 */
Object.defineProperty(Window.prototype, "height", {
    get: function() {
        return this._height;
    },
    set: function(value) {
        this._height = value;
        this._refreshAllParts();
    },
    configurable: true
});

/**
 * The size of the padding between the frame and contents.
 *
 * @type number
 * @name Window#padding
 */
Object.defineProperty(Window.prototype, "padding", {
    get: function() {
        return this._padding;
    },
    set: function(value) {
        this._padding = value;
        this._refreshAllParts();
    },
    configurable: true
});

/**
 * The size of the margin for the window background.
 *
 * @type number
 * @name Window#margin
 */
Object.defineProperty(Window.prototype, "margin", {
    get: function() {
        return this._margin;
    },
    set: function(value) {
        this._margin = value;
        this._refreshAllParts();
    },
    configurable: true
});

/**
 * The opacity of the window without contents (0 to 255).
 *
 * @type number
 * @name Window#opacity
 */
Object.defineProperty(Window.prototype, "opacity", {
    get: function() {
        return this._container.alpha * 255;
    },
    set: function(value) {
        this._container.alpha = Math.min(Math.max(value, 0), 255) / 255;
    },
    configurable: true
});

/**
 * The opacity of the window background (0 to 255).
 *
 * @type number
 * @name Window#backOpacity
 */
Object.defineProperty(Window.prototype, "backOpacity", {
    get: function() {
        return this._backSprite.alpha * 255;
    },
    set: function(value) {
        this._backSprite.alpha = Math.min(Math.max(value, 0), 255) / 255;
    },
    configurable: true
});

/**
 * The opacity of the window contents (0 to 255).
 *
 * @type number
 * @name Window#contentsOpacity
 */
Object.defineProperty(Window.prototype, "contentsOpacity", {
    get: function() {
        return this._contentsSprite.alpha * 255;
    },
    set: function(value) {
        this._contentsSprite.alpha = Math.min(Math.max(value, 0), 255) / 255;
    },
    configurable: true
});

/**
 * The openness of the window (0 to 255).
 *
 * @type number
 * @name Window#openness
 */
Object.defineProperty(Window.prototype, "openness", {
    get: function() {
        return this._openness;
    },
    set: function(value) {
        if (this._openness !== value) {
            this._openness = Math.min(Math.max(value, 0), 255);
            this._container.scale.y = this._openness / 255;
            this._container.y = (this.height / 2) * (1 - this._openness / 255);
        }
    },
    configurable: true
});

/**
 * The width of the content area in pixels.
 *
 * @readonly
 * @type number
 * @name Window#innerWidth
 */
Object.defineProperty(Window.prototype, "innerWidth", {
    get: function() {
        return Math.max(0, this._width - this._padding * 2);
    },
    configurable: true
});

/**
 * The height of the content area in pixels.
 *
 * @readonly
 * @type number
 * @name Window#innerHeight
 */
Object.defineProperty(Window.prototype, "innerHeight", {
    get: function() {
        return Math.max(0, this._height - this._padding * 2);
    },
    configurable: true
});

/**
 * The rectangle of the content area.
 *
 * @readonly
 * @type Rectangle
 * @name Window#innerRect
 */
Object.defineProperty(Window.prototype, "innerRect", {
    get: function() {
        return new Rectangle(
            this._padding,
            this._padding,
            this.innerWidth,
            this.innerHeight
        );
    },
    configurable: true
});

/**
 * Destroys the window.
 */
Window.prototype.destroy = function() {
    // The RGSS frame's picture belongs to the window (see _refreshRgssFrame); a scene's windows go with it.
    if (this._rrFrameBitmap) {
        this._rrFrameBitmap.destroy();
        this._rrFrameBitmap = null;
    }
    const options = { children: true, texture: true };
    PIXI.Container.prototype.destroy.call(this, options);
};

/**
 * Updates the window for each frame.
 */
Window.prototype.update = function() {
    if (this.active) {
        this._animationCount++;
    }
    // Indexed: runs every frame for every node, and allocates nothing.
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.update) {
            child.update();
        }
    }
};

/**
 * Sets the x, y, width, and height all at once.
 *
 * @param {number} x - The x coordinate of the window.
 * @param {number} y - The y coordinate of the window.
 * @param {number} width - The width of the window.
 * @param {number} height - The height of the window.
 */
Window.prototype.move = function(x, y, width, height) {
    this.x = x || 0;
    this.y = y || 0;
    if (this._width !== width || this._height !== height) {
        this._width = width || 0;
        this._height = height || 0;
        this._refreshAllParts();
    }
};

/**
 * Checks whether the window is completely open (openness == 255).
 *
 * @returns {boolean} True if the window is open.
 */
Window.prototype.isOpen = function() {
    return this._openness >= 255;
};

/**
 * Checks whether the window is completely closed (openness == 0).
 *
 * @returns {boolean} True if the window is closed.
 */
Window.prototype.isClosed = function() {
    return this._openness <= 0;
};

/**
 * Sets the position of the command cursor.
 *
 * @param {number} x - The x coordinate of the cursor.
 * @param {number} y - The y coordinate of the cursor.
 * @param {number} width - The width of the cursor.
 * @param {number} height - The height of the cursor.
 */
Window.prototype.setCursorRect = function(x, y, width, height) {
    const cw = Math.floor(width || 0);
    const ch = Math.floor(height || 0);
    this._cursorRect.x = Math.floor(x || 0);
    this._cursorRect.y = Math.floor(y || 0);
    if (this._cursorRect.width !== cw || this._cursorRect.height !== ch) {
        this._cursorRect.width = cw;
        this._cursorRect.height = ch;
        this._refreshCursor();
    }
};

/**
 * Moves the cursor position by the given amount.
 *
 * @param {number} x - The amount of horizontal movement.
 * @param {number} y - The amount of vertical movement.
 */
Window.prototype.moveCursorBy = function(x, y) {
    this._cursorRect.x += x;
    this._cursorRect.y += y;
};

/**
 * Moves the inner children by the given amount.
 *
 * @param {number} x - The amount of horizontal movement.
 * @param {number} y - The amount of vertical movement.
 */
Window.prototype.moveInnerChildrenBy = function(x, y) {
    for (const child of this._innerChildren) {
        child.x += x;
        child.y += y;
    }
};

/**
 * Changes the color of the background.
 *
 * @param {number} r - The red value in the range (-255, 255).
 * @param {number} g - The green value in the range (-255, 255).
 * @param {number} b - The blue value in the range (-255, 255).
 */
Window.prototype.setTone = function(r, g, b) {
    const tone = this._colorTone;
    if (r !== tone[0] || g !== tone[1] || b !== tone[2]) {
        this._colorTone = [r, g, b, 0];
        this._refreshBack();
    }
};

/**
 * Adds a child between the background and contents.
 *
 * @param {object} child - The child to add.
 * @returns {object} The child that was added.
 */
Window.prototype.addChildToBack = function(child) {
    const containerIndex = this.children.indexOf(this._container);
    return this.addChildAt(child, containerIndex + 1);
};

/**
 * Adds a child to the client area.
 *
 * @param {object} child - The child to add.
 * @returns {object} The child that was added.
 */
Window.prototype.addInnerChild = function(child) {
    this._innerChildren.push(child);
    return this._clientArea.addChild(child);
};

/** The kill switch: false lays out every window every frame, hidden or closed, as before. */
Window.SKIP_UNSEEN_LAYOUT = true;

/**
 * Updates the transform on all children of this container for rendering.
 */
Window.prototype.updateTransform = function() {
    // PIXI v8 asks every window each frame, shown or not: a hidden window has
    // nothing to lay out, nor does a closed one once it was laid out closed
    // (its client area hidden). On a map screen most windows are, and laying
    // them out was a quarter of a millisecond a frame.
    if (Window.SKIP_UNSEEN_LAYOUT && PIXI.TextureSource) {
        if (!this.visible) return;
        const closed = this._openness <= 0;
        if (closed && this._rrLaidClosed) return;
        this._rrLaidClosed = closed;
    }
    this._updateClientArea();
    this._updateFrame();
    this._updateContentsBack();
    this._updateCursor();
    this._updateContents();
    this._updateArrows();
    this._updatePauseSign();
    // v5/v6/v7: PIXI.Container.updateTransform() was the per-frame transform
    // cascade. v8 repurposed this method to a property-setter
    // updateTransform(opts) that THROWS on no-args (reads opts.x). On v8 the
    // render pipeline computes worldTransform automatically, so the super
    // call is both unnecessary and dangerous -- calling it with no args
    // throws before _updateFilterArea() runs below, which means the window
    // never sets its filterArea/boundsArea and content never gets clipped.
    if (!PIXI.TextureSource) {
        PIXI.Container.prototype.updateTransform.call(this);
        this._updateFilterArea();
    } else {
        this._updateFilterArea();
        this._localizeFilterArea();
        if (this._clipMask) this._updateClipMask();
    }
};

/** Clip mask over the visible client rect, rebuilt only when that rect changes. */
Window.prototype._updateClipMask = function() {
    const rect = this._clipRect;
    const x = this.origin.x;
    const y = this.origin.y;
    const width = Math.max(0, this.innerWidth);
    const height = Math.max(0, this.innerHeight);
    if (rect.x === x && rect.y === y && rect.width === width && rect.height === height) return;
    rect.x = x;
    rect.y = y;
    rect.width = width;
    rect.height = height;
    this._clipMask.clear();
    if (width > 0 && height > 0) this._clipMask.rect(x, y, width, height).fill(0xffffff);
};

/**
 * Draws the window shape into PIXI.Graphics object. Used by WindowLayer.
 */
Window.prototype.drawShape = function(graphics) {
    if (graphics) {
        const width = this.width;
        const height = (this.height * this._openness) / 255;
        const x = this.x;
        const y = this.y + (this.height - height) / 2;
        graphics.beginFill(0xffffff);
        graphics.drawRoundedRect(x, y, width, height, 0);
        graphics.endFill();
    }
};

Window.prototype._createAllParts = function() {
    this._createContainer();
    this._createBackSprite();
    this._createFrameSprite();
    this._createClientArea();
    this._createContentsBackSprite();
    this._createCursorSprite();
    this._createContentsSprite();
    this._createArrowSprites();
    this._createPauseSignSprites();
};

Window.prototype._createContainer = function() {
    this._container = new PIXI.Container();
    this.addChild(this._container);
};

Window.prototype._createBackSprite = function() {
    // v8: SpritePipe (pixi.js:47884) does NOT walk children of leaf Sprites.
    // _backSprite is purely a parent for the TilingSprite that fills the
    // window background, so using Container (which IS walked) makes the
    // TilingSprite child actually render. Without this, window backgrounds
    // vanish entirely in v8 -- only the frame border and content text show.
    // _backSprite renders the windowskin's 95x95 corner piece (the solid
    // background fill) AND parents the TilingSprite that overlays the tiled
    // texture pattern. On v8 this needs to be a Sprite, not a Container --
    // a Container has no texture rendering of its own, so the solid 95x95
    // corner would be invisible and windows render with only the (mostly
    // transparent) tile pattern over the scene. Earlier migration work used
    // Container to dodge v8's "Sprite can't have children" deprecation, but
    // the pixi_compat `Sprite.allowChildren=true` shim now makes Sprite-
    // as-parent render its children correctly via Sprite.collectRenderables-
    // Simple.
    this._backSprite = new Sprite();
    this._backSprite.addChild(new TilingSprite());
    this._container.addChild(this._backSprite);
};

Window.prototype._createFrameSprite = function() {
    this._frameSprite = new PIXI.Container();
    for (let i = 0; i < 8; i++) {
        this._frameSprite.addChild(new Sprite());
    }
    this._container.addChild(this._frameSprite);
};

Window.prototype._createClientArea = function() {
    this._clientArea = new PIXI.Container();
    if (Window.clipWithMask && PIXI.TextureSource) {
        // PIXI 8: clip with a stencil mask. An AlphaFilter clips too, but a
        // filter is a render-to-texture pass per window per frame, and a
        // scene with eight windows paid for eight of them; a stencil rect
        // costs a handful of triangles. filterArea is still kept up to date
        // for anything that reads it, and the filter list stays an array.
        this._clientArea.filters = [];
        this._clientArea.filterArea = new Rectangle();
        this._clipMask = new PIXI.Graphics();
        this._clipMask.rect(0, 0, 1, 1).fill(0xffffff);
        // PIXI's mask effect manages the mask's renderable/measurable flags;
        // a mask set non-renderable by hand collects no geometry and clips
        // everything out.
        this._clientArea.addChild(this._clipMask);
        this._clientArea.mask = this._clipMask;
        this._clipRect = { x: -1, y: -1, width: -1, height: -1 };
    } else {
        this._clientArea.filters = [new PIXI.AlphaFilter()];
        this._clientArea.filterArea = new Rectangle();
    }
    this._clientArea.move(this._padding, this._padding);
    this.addChild(this._clientArea);
};

Window.prototype._createContentsBackSprite = function() {
    this._contentsBackSprite = new Sprite();
    this._clientArea.addChild(this._contentsBackSprite);
};

Window.prototype._createCursorSprite = function() {
    this._cursorSprite = new PIXI.Container();
    for (let i = 0; i < 9; i++) {
        this._cursorSprite.addChild(new Sprite());
    }
    this._clientArea.addChild(this._cursorSprite);
};

Window.prototype._createContentsSprite = function() {
    this._contentsSprite = new Sprite();
    this._clientArea.addChild(this._contentsSprite);
};

Window.prototype._createArrowSprites = function() {
    this._downArrowSprite = new Sprite();
    this.addChild(this._downArrowSprite);
    this._upArrowSprite = new Sprite();
    this.addChild(this._upArrowSprite);
};

Window.prototype._createPauseSignSprites = function() {
    this._pauseSignSprite = new Sprite();
    this.addChild(this._pauseSignSprite);
};

Window.prototype._onWindowskinLoad = function() {
    this._refreshAllParts();
};

Window.prototype._refreshAllParts = function() {
    this._refreshBack();
    this._refreshFrame();
    this._refreshCursor();
    this._refreshArrows();
    this._refreshPauseSign();
};

Window.prototype._refreshBack = function() {
    const m = this._margin;
    const w = Math.max(0, this._width - m * 2);
    const h = Math.max(0, this._height - m * 2);
    const sprite = this._backSprite;
    // Plugins can replace the back sprite with a plain Sprite (MV-style
    // window internals) that lacks the tiling child; render what exists
    // instead of crashing the windowskin load listener.
    if (!sprite) {
        return;
    }
    const tilingSprite = sprite.children[0];
    const legacy = typeof $dataSystem !== "undefined" && $dataSystem?.rrLegacyWindows;
    if (legacy) {
        const tiled = $dataSystem.rrLegacySkins && typeof $gameSystem !== "undefined" && $gameSystem?.windowBackgroundMode?.() === 1;
        sprite.bitmap = this._windowskin;
        sprite.move(m, m);
        sprite.setFrame(0, tiled ? 96 : 0, tiled ? 32 : 96, tiled ? 32 : 96);
        sprite.scale.x = tiled ? 1 : w / 96;
        sprite.scale.y = tiled ? 1 : h / 96;
        if (tilingSprite) {
            tilingSprite.bitmap = this._windowskin;
            tilingSprite.setFrame(0, 96, 32, 32);
            tilingSprite.move(0, 0, w, h);
            tilingSprite.scale.x = tilingSprite.scale.y = 1;
            tilingSprite.visible = !!tiled && w > 0 && h > 0;
        }
        if (sprite.setColorTone) sprite.setColorTone(this._colorTone);
        return;
    }
    // [Note] We use 95 instead of 96 here to avoid blurring edges.
    sprite.bitmap = this._windowskin;
    sprite.setFrame(0, 0, 95, 95);
    sprite.move(m, m);
    sprite.scale.x = w / 95;
    sprite.scale.y = h / 95;
    if (tilingSprite) {
        tilingSprite.bitmap = this._windowskin;
        tilingSprite.setFrame(0, 96, 96, 96);
        tilingSprite.move(0, 0, w, h);
        // A window with no width or height (a closed choice list with no margin) has no back to tile:
        // undoing a zero scale gives an infinite one, and a zero-size tiling sprite sends an infinite
        // texture transform, which some GPUs draw as triangles across the whole screen.
        const hasArea = w > 0 && h > 0;
        tilingSprite.scale.x = hasArea ? 95 / w : 1;
        tilingSprite.scale.y = hasArea ? 95 / h : 1;
        if (tilingSprite.visible !== hasArea) tilingSprite.visible = hasArea;
    }
    if (sprite.setColorTone) {
        sprite.setColorTone(this._colorTone);
    }
};

Window.prototype._refreshFrame = function() {
    if (this._refreshRgssFrame()) return;
    const drect = { x: 0, y: 0, width: this._width, height: this._height };
    const srect = { x: 96, y: 0, width: 96, height: 96 };
    const m = 24;
    for (const child of this._frameSprite.children) {
        child.bitmap = this._windowskin;
    }
    this._setRectPartsGeometry(this._frameSprite, srect, drect, m);
};

/**
 * RGSS frames (System.json rrRgssFrames: the skins an import kept the frame cell of, as <skin>_frame.png):
 * the 16 px corners as they are and the edges repeated along the sides every 32 px, where MZ's frame
 * stretches them (a skin with ornaments along its edges smears into streaks). True when it drew one.
 */
Window.prototype._refreshRgssFrame = function() {
    const sprite = this._frameSprite;
    const names = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.rrRgssFrames;
    const skin = this._windowskin;
    const name = names && skin && skin._url ? (/img\/system\/([^/?#]+)\.png$/i.exec(decodeURIComponent(skin._url)) || [])[1] : null;
    const cell = name && names.includes(name) ? ImageManager.loadSystem(name + "_frame") : null;
    if (cell && !cell.isReady() && this._rrFrameCellWait !== cell) {
        this._rrFrameCellWait = cell;
        cell.addLoadListener(() => this._refreshFrame());
    }
    const w = this._width, h = this._height;
    if (!cell || !cell.isReady() || w < 32 || h < 32) {
        if (this._rrFrameBitmap) {
            this._rrFrameSprite.bitmap = null;
            this._rrFrameSprite.visible = false;
            this._rrFrameBitmap.destroy();
            this._rrFrameBitmap = null;
            // MZ's frame parts were hidden for it; the skin's own frame shows again.
            for (const child of sprite.children) child.visible = true;
        }
        return false;
    }
    let frame = this._rrFrameBitmap;
    if (!frame || frame.width !== w || frame.height !== h) {
        if (frame) frame.destroy();
        frame = this._rrFrameBitmap = new Bitmap(w, h);
    } else {
        frame.clear();
    }
    for (let x = 16; x < w - 16; x += 32) {
        const cw = Math.min(32, w - 16 - x);
        frame.blt(cell, 16, 0, cw, 16, x, 0);
        frame.blt(cell, 16, 48, cw, 16, x, h - 16);
    }
    for (let y = 16; y < h - 16; y += 32) {
        const ch = Math.min(32, h - 16 - y);
        frame.blt(cell, 0, 16, 16, ch, 0, y);
        frame.blt(cell, 48, 16, 16, ch, w - 16, y);
    }
    frame.blt(cell, 0, 0, 16, 16, 0, 0);
    frame.blt(cell, 48, 0, 16, 16, w - 16, 0);
    frame.blt(cell, 0, 48, 16, 16, 0, h - 16);
    frame.blt(cell, 48, 48, 16, 16, w - 16, h - 16);
    // The RGSS frame is a sprite beside MZ's frame parts (which are hidden), drawn where they are.
    if (!this._rrFrameSprite) {
        this._rrFrameSprite = new Sprite();
        const parent = sprite.parent || this._container;
        parent.addChildAt(this._rrFrameSprite, parent.children.indexOf(sprite) + 1);
    }
    for (const child of sprite.children) child.visible = false;
    this._rrFrameSprite.visible = true;
    this._rrFrameSprite.bitmap = frame;
    this._rrFrameSprite.setFrame(0, 0, w, h);
    this._rrFrameSprite.move(0, 0);
    return true;
};

// The cursor is clamped to the window's inner rect (MV behavior). Plugins
// set cursor rects that extend past the window — e.g. VE_BattleCommandWindow
// offsets the selected item's rect for its slide effect — and rely on the
// window clipping the highlight instead of letting it bleed outside.
Window.prototype._clampedCursorRect = function() {
    const cr = this._cursorRect;
    const innerW = Math.max(0, this._width - this._padding * 2);
    const innerH = Math.max(0, this._height - this._padding * 2);
    // The cursor rect is in CONTENTS coordinates, and the client area holding
    // the cursor sprite is shifted by -origin (Window._updateClientArea), so
    // the visible band of the contents runs from origin to origin + inner.
    // Clamping against inner alone -- as if origin were always zero -- cuts the
    // bottom-most row short by exactly origin.y pixels.
    //
    // Window_Scrollable.updateOrigin sets origin.y = scrollY % itemHeight, so
    // origin.y is non-zero precisely when innerHeight is not a whole number of
    // rows. Scrolling to the last row lands on scrollMin, whose remainder is
    // itemHeight - (innerHeight % itemHeight); the row is then fully on screen
    // while the old clamp still trimmed the highlight to what would have been
    // visible at scroll origin zero. That is the half-height last-row cursor.
    const origin = this.origin;
    const ox = origin ? origin.x : 0;
    const oy = origin ? origin.y : 0;
    const x = Math.max(cr.x, ox);
    const y = Math.max(cr.y, oy);
    const w = Math.max(0, Math.min(cr.x + cr.width, ox + innerW) - x);
    const h = Math.max(0, Math.min(cr.y + cr.height, oy + innerH) - y);
    // Asked every frame by the cursor refresh; one rectangle per window,
    // reused. Callers read it immediately and never keep it.
    const rect = this._clampedCursorScratch || (this._clampedCursorScratch = new Rectangle(0, 0, 0, 0));
    rect.x = x;
    rect.y = y;
    rect.width = w;
    rect.height = h;
    return rect;
};

Window.prototype._refreshCursor = function() {
    const drect = this._clampedCursorRect();
    this._cursorClampW = drect.width;
    this._cursorClampH = drect.height;
    const srect = { x: 96, y: 96, width: 48, height: 48 };
    const m = 4;
    for (const child of this._cursorSprite.children) {
        child.bitmap = this._windowskin;
    }
    // A 2000/2003 cursor keeps 8 px corners and stretches only between them. The import lays its 32 px
    // cell in at 1.5x, so its corners are the cell's outer 12 px, drawn back at 8. Cut at MZ's 4 px, a
    // game's corner marks fell in the stretched middle and ran across the whole choice as lines.
    if (typeof $dataSystem !== "undefined" && $dataSystem?.rrLegacyWindows) this._setRectPartsGeometry(this._cursorSprite, srect, drect, 12, 8);
    else this._setRectPartsGeometry(this._cursorSprite, srect, drect, m);
};

/** `dm`: the corners' size on screen when it differs from their `m` in the skin. */
Window.prototype._setRectPartsGeometry = function(sprite, srect, drect, m, dm = m) {
    const sx = srect.x;
    const sy = srect.y;
    const sw = srect.width;
    const sh = srect.height;
    const dx = drect.x;
    const dy = drect.y;
    const dw = drect.width;
    const dh = drect.height;
    const smw = sw - m * 2;
    const smh = sh - m * 2;
    const dmw = dw - dm * 2;
    const dmh = dh - dm * 2;
    const k = dm / m;
    const children = sprite.children;
    sprite.setFrame(0, 0, dw, dh);
    sprite.move(dx, dy);
    // corner
    children[0].setFrame(sx, sy, m, m);
    children[1].setFrame(sx + sw - m, sy, m, m);
    children[2].setFrame(sx, sy + sw - m, m, m);
    children[3].setFrame(sx + sw - m, sy + sw - m, m, m);
    children[0].move(0, 0);
    children[1].move(dw - dm, 0);
    children[2].move(0, dh - dm);
    children[3].move(dw - dm, dh - dm);
    for (let i = 0; i < 4; i++) children[i].scale.set(k, k);
    // edge
    children[4].move(dm, 0);
    children[5].move(dm, dh - dm);
    children[6].move(0, dm);
    children[7].move(dw - dm, dm);
    children[4].setFrame(sx + m, sy, smw, m);
    children[5].setFrame(sx + m, sy + sw - m, smw, m);
    children[6].setFrame(sx, sy + m, m, smh);
    children[7].setFrame(sx + sw - m, sy + m, m, smh);
    children[4].scale.set(dmw / smw, k);
    children[5].scale.set(dmw / smw, k);
    children[6].scale.set(k, dmh / smh);
    children[7].scale.set(k, dmh / smh);
    // center
    if (children[8]) {
        children[8].setFrame(sx + m, sy + m, smw, smh);
        children[8].move(dm, dm);
        children[8].scale.x = dmw / smw;
        children[8].scale.y = dmh / smh;
    }
    for (const child of children) {
        child.visible = dw > 0 && dh > 0;
    }
};

Window.prototype._refreshArrows = function() {
    const w = this._width;
    const h = this._height;
    const p = 24;
    const q = p / 2;
    const sx = 96 + p;
    const sy = 0 + p;
    this._downArrowSprite.bitmap = this._windowskin;
    this._downArrowSprite.anchor.x = 0.5;
    this._downArrowSprite.anchor.y = 0.5;
    this._downArrowSprite.setFrame(sx + q, sy + q + p, p, q);
    this._downArrowSprite.move(w / 2, h - q);
    this._upArrowSprite.bitmap = this._windowskin;
    this._upArrowSprite.anchor.x = 0.5;
    this._upArrowSprite.anchor.y = 0.5;
    this._upArrowSprite.setFrame(sx + q, sy, p, q);
    this._upArrowSprite.move(w / 2, q);
};

Window.prototype._refreshPauseSign = function() {
    const sx = 144;
    const sy = 96;
    const p = 24;
    this._pauseSignSprite.bitmap = this._windowskin;
    this._pauseSignSprite.anchor.x = 0.5;
    this._pauseSignSprite.anchor.y = 1;
    this._pauseSignSprite.move(this._width / 2, this._height);
    this._pauseSignSprite.setFrame(sx, sy, p, p);
    this._pauseSignSprite.alpha = 0;
};

Window.prototype._updateClientArea = function() {
    const pad = this._padding;
    this._clientArea.move(pad, pad);
    this._clientArea.x = pad - this.origin.x;
    this._clientArea.y = pad - this.origin.y;
    if (this.innerWidth > 0 && this.innerHeight > 0) {
        this._clientArea.visible = this.isOpen();
    } else {
        this._clientArea.visible = false;
    }
};

Window.prototype._updateFrame = function() {
    this._frameSprite.visible = this.frameVisible;
    if (this._rrFrameSprite) this._rrFrameSprite.alpha = this.frameVisible ? 1 : 0;
};

Window.prototype._updateContentsBack = function() {
    const bitmap = this._contentsBackSprite.bitmap;
    if (bitmap) {
        this._contentsBackSprite.setFrame(0, 0, bitmap.width, bitmap.height);
    }
};

Window.prototype._updateCursor = function() {
    const rect = this._clampedCursorRect();
    // A position-only cursor move can change the clamped size (the rect
    // slides toward an edge), so re-slice the skin parts when it does.
    if (rect.width !== this._cursorClampW || rect.height !== this._cursorClampH) {
        this._refreshCursor();
    }
    this._cursorSprite.alpha = this._makeCursorAlpha();
    this._cursorSprite.visible = this.isOpen() && this.cursorVisible;
    this._cursorSprite.x = rect.x;
    this._cursorSprite.y = rect.y;
};

Window.prototype._makeCursorAlpha = function() {
    const blinkCount = this._animationCount % 40;
    const baseAlpha = this.contentsOpacity / 255;
    if (this.active) {
        if (blinkCount < 20) {
            return baseAlpha - blinkCount / 32;
        } else {
            return baseAlpha - (40 - blinkCount) / 32;
        }
    }
    return baseAlpha;
};

Window.prototype._updateContents = function() {
    const bitmap = this._contentsSprite.bitmap;
    if (bitmap) {
        this._contentsSprite.setFrame(0, 0, bitmap.width, bitmap.height);
    }
};

Window.prototype._updateArrows = function() {
    this._downArrowSprite.visible = this.isOpen() && this.downArrowVisible;
    this._upArrowSprite.visible = this.isOpen() && this.upArrowVisible;
};

Window.prototype._updatePauseSign = function() {
    const sprite = this._pauseSignSprite;
    const x = Math.floor(this._animationCount / 16) % 2;
    const y = Math.floor(this._animationCount / 16 / 2) % 2;
    const sx = 144;
    const sy = 96;
    const p = 24;
    if (!this.pause) {
        sprite.alpha = 0;
    } else if (sprite.alpha < 1) {
        sprite.alpha = Math.min(sprite.alpha + 0.1, 1);
    }
    sprite.setFrame(sx + x * p, sy + y * p, p, p);
    sprite.visible = this.isOpen();
};

Window.prototype._updateFilterArea = function() {
    // World-space, on every PIXI version: that is what v5/v6/v7 consumed
    // directly, and it is what plugins replacing this method normally write.
    // _localizeFilterArea() below converts it for v8 afterwards, so a plugin's
    // version needs no cooperation to land in the right place. Stock-style
    // plugins that leave the dimensions unscaled retain their legacy over-clip.
    // Measured every frame; the origin read and the result written go
    // through two points the window keeps, not two fresh ones.
    if (!this._filterOriginScratch) {
        this._filterOriginScratch = new Point(0, 0);
        this._filterPosScratch = new Point(0, 0);
    }
    const wt = this._clientArea.worldTransform;
    const pos = wt.apply(this._filterOriginScratch, this._filterPosScratch);
    const filterArea = this._clientArea.filterArea;
    filterArea.x = pos.x + this.origin.x;
    filterArea.y = pos.y + this.origin.y;
    filterArea.width = this.innerWidth * (Math.hypot(wt.a, wt.b) || 1);
    filterArea.height = this.innerHeight * (Math.hypot(wt.c, wt.d) || 1);
};

/**
 * Restates the client area's filter rectangle in the coordinates v8 expects.
 *
 * v8's FilterSystem._calculateFilterArea does
 *
 *     bounds.addRect(filterEffect.filterArea);
 *     bounds.applyMatrix(container.worldTransform);
 *
 * so it reads filterArea as container-LOCAL and applies the world transform
 * itself. Handed the world-space rect that v5/v6/v7 wanted, it transforms it a
 * second time and the captured region lands roughly twice as far down the
 * screen as the window — off the edge entirely for a window past the middle.
 * The filter then resolves to nothing, and everything inside the client area
 * silently disappears: the panel and its border still draw (they are not in
 * the client area), so a window renders as an empty box.
 *
 * Correcting it here rather than in _updateFilterArea above is the point. A
 * window's filter rect is computed by whichever _updateFilterArea is installed
 * last, and plugins that reimplement scrolling or window drawing routinely
 * install their own — VisuMZ's CoreEngine among them. Those all write the
 * world-space rect the engine documented, cannot know about v8, and cannot be
 * edited. Removing the client area's world origin and scale afterwards fixes
 * every one of them, including our own, with no version branch above.
 *
 * Position staleness cancels because both methods read the same transform.
 * A plugin can instead scale dimensions from this.scale, so on the first frame
 * its size can be divided by a still-identity world transform; the next frame
 * is correct. Guessing which convention wrote a rectangle is less reliable.
 */
Window.prototype._localizeFilterArea = function() {
    const clientArea = this._clientArea;
    const filterArea = clientArea && clientArea.filterArea;
    if (!filterArea) {
        return;
    }
    // worldTransform applied to (0, 0) is exactly (tx, ty) -- the same origin
    // _updateFilterArea added, so a transform that is momentarily stale
    // cancels out instead of shifting the rect.
    const wt = clientArea.worldTransform;
    filterArea.x -= wt.tx;
    filterArea.y -= wt.ty;
    // Matrix-column lengths handle rotation and negative scales. Degenerate
    // transforms use 1 so a hidden zero-scale window cannot produce Infinity.
    filterArea.width /= (Math.hypot(wt.a, wt.b) || 1);
    filterArea.height /= (Math.hypot(wt.c, wt.d) || 1);
};

//-----------------------------------------------------------------------------
/**
 * The layer which contains game windows.
 *
 * @class
 * @extends PIXI.Container
 */
function WindowLayer() {
    this.initialize(...arguments);
}

WindowLayer.prototype = Object.create(PIXI.Container.prototype);
WindowLayer.prototype.constructor = WindowLayer;

WindowLayer.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);
};

/**
 * Updates the window layer for each frame.
 */
WindowLayer.prototype.update = function() {
    // Indexed: runs every frame for every node, and allocates nothing.
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.update) {
            child.update();
        }
    }
};

/**
 * Renders the object using the WebGL renderer.
 *
 * @param {PIXI.Renderer} renderer - The renderer.
 */
WindowLayer.prototype.render = function render(renderer) {
    if (!this.visible) {
        return;
    }

    // v8: render pipe handles children automatically. v8 removed
    // renderer.framebuffer.forceStencil (stencil buffer is allocated by
    // default at context creation -- see pixi8 `stencil: true` ContextSystem
    // init), and renderer.batch is no longer a global flushable batcher
    // (each render pipe has its own deferred batcher). Interleaving raw GL
    // stencil ops with v8's deferred pipeline also doesn't honor draw order.
    //
    // Skip the custom render on v8 and let the standard render pipe iterate
    // children. Net visual: lower-window pixels under a higher window are
    // drawn, but immediately overdrawn -- no visible regression for normal
    // MZ usage. v5/v6/v7 keep the stock stencil-occlusion behavior below.
    if (PIXI.TextureSource) {
        return;
    }

    const graphics = new PIXI.Graphics();
    const gl = renderer.gl;
    const children = this.children.clone();

    renderer.framebuffer.forceStencil();
    graphics.transform = this.transform;
    renderer.batch.flush();
    gl.enable(gl.STENCIL_TEST);

    while (children.length > 0) {
        const win = children.pop();
        if (win._isWindow && win.visible && win.openness > 0) {
            gl.stencilFunc(gl.EQUAL, 0, ~0);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
            win.render(renderer);
            renderer.batch.flush();
            graphics.clear();
            win.drawShape(graphics);
            gl.stencilFunc(gl.ALWAYS, 1, ~0);
            gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
            gl.blendFunc(gl.ZERO, gl.ONE);
            graphics.render(renderer);
            renderer.batch.flush();
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
    }

    gl.disable(gl.STENCIL_TEST);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.clearStencil(0);
    renderer.batch.flush();

    for (const child of this.children) {
        if (!child._isWindow && child.visible) {
            child.render(renderer);
        }
    }

    renderer.batch.flush();
};

//-----------------------------------------------------------------------------
/**
 * The weather effect which displays rain, storm, or snow.
 *
 * @class
 * @extends PIXI.Container
 */
function Weather() {
    this.initialize(...arguments);
}

Weather.prototype = Object.create(PIXI.Container.prototype);
Weather.prototype.constructor = Weather;

Weather.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);

    this._width = Graphics.width;
    this._height = Graphics.height;
    this._sprites = [];

    this._createBitmaps();
    this._createDimmer();

    /**
     * The type of the weather in ["none", "rain", "storm", "snow"].
     *
     * @type string
     */
    this.type = "none";

    /**
     * The power of the weather in the range (0, 9).
     *
     * @type number
     */
    this.power = 0;

    /**
     * The origin point of the weather for scrolling.
     *
     * @type Point
     */
    this.origin = new Point();
};

/**
 * Destroys the weather.
 */
Weather.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.Container.prototype.destroy.call(this, options);
    this._rainBitmap.destroy();
    this._stormBitmap.destroy();
    this._snowBitmap.destroy();
};

/**
 * Updates the weather for each frame.
 */
Weather.prototype.update = function() {
    this._updateDimmer();
    this._updateAllSprites();
};

Weather.prototype._createBitmaps = function() {
    this._rainBitmap = new Bitmap(1, 60);
    this._rainBitmap.fillAll("white");
    this._stormBitmap = new Bitmap(2, 100);
    this._stormBitmap.fillAll("white");
    this._snowBitmap = new Bitmap(9, 9);
    this._snowBitmap.drawCircle(4, 4, 4, "white");
};

Weather.prototype._createDimmer = function() {
    this._dimmerSprite = new ScreenSprite();
    this._dimmerSprite.setColor(80, 80, 80);
    this.addChild(this._dimmerSprite);
};

Weather.prototype._updateDimmer = function() {
    this._dimmerSprite.opacity = Math.floor(this.power * 6);
};

Weather.prototype._updateAllSprites = function() {
    const maxSprites = Math.floor(this.power * 10);
    while (this._sprites.length < maxSprites) {
        this._addSprite();
    }
    while (this._sprites.length > maxSprites) {
        this._removeSprite();
    }
    for (const sprite of this._sprites) {
        this._updateSprite(sprite);
        sprite.x = sprite.ax - this.origin.x;
        sprite.y = sprite.ay - this.origin.y;
    }
};

Weather.prototype._addSprite = function() {
    const sprite = new Sprite(this.viewport);
    sprite.opacity = 0;
    this._sprites.push(sprite);
    this.addChild(sprite);
};

Weather.prototype._removeSprite = function() {
    this.removeChild(this._sprites.pop());
};

Weather.prototype._updateSprite = function(sprite) {
    switch (this.type) {
        case "rain":
            this._updateRainSprite(sprite);
            break;
        case "storm":
            this._updateStormSprite(sprite);
            break;
        case "snow":
            this._updateSnowSprite(sprite);
            break;
    }
    if (sprite.opacity < 40) {
        this._rebornSprite(sprite);
    }
};

Weather.prototype._updateRainSprite = function(sprite) {
    sprite.bitmap = this._rainBitmap;
    sprite.rotation = Math.PI / 16;
    sprite.ax -= 6 * Math.sin(sprite.rotation);
    sprite.ay += 6 * Math.cos(sprite.rotation);
    sprite.opacity -= 6;
};

Weather.prototype._updateStormSprite = function(sprite) {
    sprite.bitmap = this._stormBitmap;
    sprite.rotation = Math.PI / 8;
    sprite.ax -= 8 * Math.sin(sprite.rotation);
    sprite.ay += 8 * Math.cos(sprite.rotation);
    sprite.opacity -= 8;
};

Weather.prototype._updateSnowSprite = function(sprite) {
    sprite.bitmap = this._snowBitmap;
    sprite.rotation = Math.PI / 16;
    sprite.ax -= 3 * Math.sin(sprite.rotation);
    sprite.ay += 3 * Math.cos(sprite.rotation);
    sprite.opacity -= 3;
};

Weather.prototype._rebornSprite = function(sprite) {
    sprite.ax = Math.randomInt(Graphics.width + 100) - 100 + this.origin.x;
    sprite.ay = Math.randomInt(Graphics.height + 200) - 200 + this.origin.y;
    sprite.opacity = 160 + Math.randomInt(60);
};

//-----------------------------------------------------------------------------
/**
 * The color filter for WebGL.
 *
 * @class
 * @extends PIXI.Filter
 */
function ColorFilter() {
    this.initialize(...arguments);
}

// On v8, extend PIXI.ColorMatrixFilter (which handles its own UBO/uniform
// binding correctly) instead of PIXI.Filter -- v8's filter UBO model made a
// custom-shader port of the v7 ColorFilter unreliable. On v5/v6/v7, keep
// extending PIXI.Filter so the working custom-shader path is preserved.
ColorFilter.prototype = Object.create(
    (PIXI.GlProgram && PIXI.ColorMatrixFilter)
        ? PIXI.ColorMatrixFilter.prototype
        : PIXI.Filter.prototype
);
ColorFilter.prototype.constructor = ColorFilter;

ColorFilter.prototype.initialize = function() {
    if (PIXI.GlProgram && PIXI.ColorMatrixFilter) {
        // v8 path: ColorFilter IS a ColorMatrixFilter. Combine hue/colorTone/
        // blendColor/brightness into a single 5x4 color matrix and assign it
        // via the inherited `.matrix` setter on every state change.
        PIXISuper(PIXI.ColorMatrixFilter, this, []);
        this._hue = 0;
        this._colorTone = [0, 0, 0, 0];
        this._blendColor = [0, 0, 0, 0];
        this._brightness = 255;
        this._rebuildColorMatrix();
        this._defineLegacyUniforms();
        return;
    }
    // v5/v6/v7 path -- custom shader implementation (unchanged from the
    // original corescript).
    PIXISuper(PIXI.Filter, this, [null, this._fragmentSrc()]);
    this.uniforms.hue = 0;
    this.uniforms.colorTone = [0, 0, 0, 0];
    this.uniforms.blendColor = [0, 0, 0, 0];
    this.uniforms.brightness = 255;
};

// Full-screen engine groups start with an opaque ScreenSprite. In that case a
// neutral colour pass can disappear without changing descendant compositing.
// Arbitrary sprite filters retain their original isolation semantics.
ColorFilter.skipNeutralScenePasses = true;
ColorFilter.prototype.allowNeutralSceneSkip = function(owner) {
    if (!PIXI.GlProgram || !this.matrix || this._neutralSceneOwner) return;
    this._neutralSceneOwner = owner;
    this._neutralRequestedEnabled = this.enabled;
    const glProgram = this.glProgram, gpuProgram = this.gpuProgram, apply = this.apply;
    this._neutralSceneShader = { glProgram, gpuProgram, apply };
    Object.defineProperty(this, 'enabled', {
        configurable: true, enumerable: true,
        get() {
            if (!this._neutralRequestedEnabled) return false;
            if (!ColorFilter.skipNeutralScenePasses || this.glProgram !== glProgram ||
                this.gpuProgram !== gpuProgram || this.apply !== apply ||
                !ColorFilter.isNeutralSceneMatrix(this)) return true;
            return !ColorFilter.canSkipScenePass(this._neutralSceneOwner);
        },
        set(value) { this._neutralRequestedEnabled = value; }
    });
};
// A sprite's own colour pass (Sprite._colorFilter: a tone, a flash, a hue)
// stays on the sprite once made. While it changes nothing it is skipped:
// the sprite is drawn straight, as one that never had a tone. Only when it is
// the sprite's one filter, its blend is the sprite's own, and everything
// under the sprite draws with a backdrop-keeping blend, unfiltered and
// unmasked, so drawing straight gives the same pixels as the group pass.
ColorFilter.skipNeutralSpritePasses = true;
ColorFilter.prototype.allowNeutralSpriteSkip = function(owner) {
    if (!PIXI.GlProgram || !this.matrix || this._neutralSceneOwner || this._neutralSpriteOwner) return;
    this._neutralSpriteOwner = owner;
    this._neutralRequestedEnabled = this.enabled;
    const glProgram = this.glProgram, gpuProgram = this.gpuProgram, apply = this.apply;
    Object.defineProperty(this, 'enabled', {
        configurable: true, enumerable: true,
        get() {
            if (!this._neutralRequestedEnabled) return false;
            if (!ColorFilter.skipNeutralSpritePasses || this.glProgram !== glProgram ||
                this.gpuProgram !== gpuProgram || this.apply !== apply) return true;
            return !ColorFilter._spritePassCanSkip(this, this._neutralSpriteOwner);
        },
        set(value) { this._neutralRequestedEnabled = value; }
    });
};
ColorFilter._isIdentityMatrix = function(m) {
    if (!m || m.length !== 20) return false;
    for (let i = 0; i < 20; i++) if (m[i] !== (i === 0 || i === 6 || i === 12 || i === 18 ? 1 : 0)) return false;
    return true;
};
ColorFilter._spritePassCanSkip = function(filter, owner) {
    if (filter._rrLegacySaturationMatrix) return false;
    if (filter.alpha !== 1 || filter.resolution !== 1 || filter.padding !== 0 || filter.blendRequired ||
        !ColorFilter._isIdentityMatrix(filter.matrix)) return false;
    const filters = owner.filters;
    if (!filters || filters.length !== 1 || filters[0] !== filter) return false;
    const own = owner._blendMode === undefined ? 'normal' : _normalizeBlendMode(owner._blendMode);
    if (filter.blendMode !== own && !(filter.blendMode === 'normal' && own === 'inherit')) return false;
    if (owner.mask) return false;
    const children = owner.children;
    if (children && children.length) {
        // Children blend onto the sprite inside the group, onto the screen without it:
        // the same only for plain alpha blending all the way down.
        if (own !== 'normal' && own !== 'inherit') return false;
        for (let i = 0; i < children.length; i++) if (!ColorFilter._drawsStraight(children[i])) return false;
    }
    return true;
};
// A subtree that draws the same on its own as inside its parent's group pass.
ColorFilter._drawsStraight = function(node) {
    if (!node.visible || !node.renderable) return true;
    if (node.mask || (node.filters && node.filters.length) ||
        (node.blendMode !== 'normal' && node.blendMode !== 'inherit')) return false;
    const children = node.children;
    if (children) for (let i = 0; i < children.length; i++) if (!ColorFilter._drawsStraight(children[i])) return false;
    return true;
};
ColorFilter.isNeutralSceneMatrix = function(filter) {
    if (filter._rrLegacySaturationMatrix) return false;
    if (filter.alpha !== 1 || filter.blendMode !== 'normal' || filter.resolution !== 1 ||
        filter.antialias !== 'off' || filter.padding !== 0 || filter.blendRequired) return false;
    const m = filter.matrix;
    if (!m || m.length !== 20) return false;
    for (let i = 0; i < 20; i++) if (m[i] !== (i === 0 || i === 6 || i === 12 || i === 18 ? 1 : 0)) return false;
    return true;
};
ColorFilter._scenePassCanSkip = function(owner) {
    const scene = globalThis.SceneManager?._scene, ss = scene?._spriteset;
    const app = globalThis.Graphics?._app, renderer = app?.renderer;
    if (!ss || !renderer || (owner !== scene && owner !== ss) || app.stage !== scene || scene.parent ||
        renderer.resolution !== 1 || !renderer.background?.clearBeforeRender ||
        renderer.renderTarget?.renderTarget?.colorTexture?.source?.antialias) return false;
    const base = ss._baseSprite, black = ss._blackScreen, graphics = black?._graphics;
    if (scene.children[0] !== ss || ss.children[0] !== base || base?.children[0] !== black ||
        black.children.length !== 1 || black.children[0] !== graphics) return false;
    const chain = [scene, ss, base, black, graphics];
    for (const node of chain) {
        if (!node || !node.visible || !node.renderable || node.alpha !== 1 ||
            (node.tint !== undefined && node.tint !== 0xffffff) || node.mask || node.filterArea ||
            node.x !== 0 || node.y !== 0 || node.rotation !== 0 || node.scale.x !== 1 || node.scale.y !== 1 ||
            node.skew.x !== 0 || node.skew.y !== 0 || node.pivot.x !== 0 || node.pivot.y !== 0 ||
            (node.blendMode !== 'normal' && node.blendMode !== 'inherit')) return false;
        for (const f of node.filters || []) {
            // Every enclosing pass must retain the opaque backdrop. Read the
            // matrix itself so direct plugin edits take effect on this draw.
            const shader = f._neutralSceneShader;
            if (!(f instanceof ColorFilter) || !shader || f.glProgram !== shader.glProgram ||
                f.gpuProgram !== shader.gpuProgram || f.apply !== shader.apply || f.blendMode !== 'normal' || f.alpha !== 1 ||
                f.matrix?.length !== 20 || f.matrix[15] !== 0 || f.matrix[16] !== 0 ||
                f.matrix[17] !== 0 || f.matrix[18] !== 1 || f.matrix[19] !== 0) return false;
        }
    }
    const instructions = graphics.context?.instructions, fill = instructions?.[0];
    const path = fill?.data?.path?.instructions, rect = path?.[0], d = rect?.data, t = d?.[4];
    if (instructions?.length !== 1 || fill.action !== 'fill' || fill.data.style.alpha !== 1 ||
        fill.data.style.texture !== PIXI.Texture.WHITE || path.length !== 1 || rect.action !== 'rect' ||
        d[0] !== -50000 || d[1] !== -50000 || d[2] !== 100000 || d[3] !== 100000 ||
        !t || t.a !== 1 || t.b !== 0 || t.c !== 0 || t.d !== 1 || t.tx !== 0 || t.ty !== 0 ||
        Graphics.width > 50000 || Graphics.height > 50000) return false;
    // Destination-out/erase/custom blending can punch holes in the backdrop.
    // Keep isolation whenever such content is present. Normal, additive,
    // multiply and screen blending all keep an opaque destination opaque.
    return ColorFilter._sceneBlendsKeepBackdrop(scene);
};
// The walk above, once per draw over every visible node of the scene: plain
// functions, and no empty array made for each node without filters or
// children, which was most of them.
ColorFilter._safeSceneBlend = function(mode) {
    return mode === 'normal' || mode === 'inherit' || mode === 'add' || mode === 'multiply' || mode === 'screen';
};
ColorFilter._sceneBlendsKeepBackdrop = function(node) {
    if (!node.visible || !node.renderable) return true;
    if (!ColorFilter._safeSceneBlend(node.blendMode)) return false;
    const filters = node.filters;
    if (filters) for (let i = 0; i < filters.length; i++) if (!ColorFilter._safeSceneBlend(filters[i].blendMode)) return false;
    const children = node.children;
    if (children) for (let i = 0; i < children.length; i++) if (!ColorFilter._sceneBlendsKeepBackdrop(children[i])) return false;
    return true;
};

// PIXI increments renderer.tick for each render, including snapshots. Share
// the scene scan across the three filters only for that draw; colour matrices
// and explicit enabled changes are still checked on every query.
ColorFilter._scenePassChecks = new WeakMap();
ColorFilter.canSkipScenePass = function(owner) {
    const scene = globalThis.SceneManager?._scene, renderer = globalThis.Graphics?._app?.renderer;
    if (!renderer || !scene || (owner !== scene && owner !== scene._spriteset)) return false;
    if (!Number.isFinite(renderer.tick)) return ColorFilter._scenePassCanSkip(owner);
    let cached = ColorFilter._scenePassChecks.get(renderer);
    if (!cached || cached.tick !== renderer.tick || cached.scene !== scene) {
        cached = { tick: renderer.tick, scene, allowed: ColorFilter._scenePassCanSkip(owner) };
        ColorFilter._scenePassChecks.set(renderer, cached);
    }
    return cached.allowed;
};


/**
 * Sets the hue rotation value.
 *
 * @param {number} hue - The hue value (-360, 360).
 */
ColorFilter.prototype.setHue = function(hue) {
    if (PIXI.GlProgram && PIXI.ColorMatrixFilter) {
        this._hue = Number(hue);
        this._rebuildColorMatrix();
    } else {
        this.uniforms.hue = Number(hue);
    }
};

/**
 * Sets the color tone.
 *
 * @param {array} tone - The color tone [r, g, b, gray].
 */
ColorFilter.prototype.setColorTone = function(tone) {
    if (!(tone instanceof Array)) {
        throw new Error("Argument must be an array");
    }
    if (PIXI.GlProgram && PIXI.ColorMatrixFilter) {
        // Copy in place: the legacy `.uniforms.colorTone` view is a Proxy bound
        // to this array object, so replacing it would strand the view.
        ColorFilter._copyInto(this._colorTone, tone);
        this._rebuildColorMatrix();
    } else {
        this.uniforms.colorTone = tone.clone();
    }
};

/**
 * Sets the blend color.
 *
 * @param {array} color - The blend color [r, g, b, a].
 */
ColorFilter.prototype.setBlendColor = function(color) {
    if (!(color instanceof Array)) {
        throw new Error("Argument must be an array");
    }
    if (PIXI.GlProgram && PIXI.ColorMatrixFilter) {
        ColorFilter._copyInto(this._blendColor, color);
        this._rebuildColorMatrix();
    } else {
        this.uniforms.blendColor = color.clone();
    }
};

/**
 * Sets the brightness.
 *
 * @param {number} brightness - The brightness (0 to 255).
 */
ColorFilter.prototype.setBrightness = function(brightness) {
    if (PIXI.GlProgram && PIXI.ColorMatrixFilter) {
        this._brightness = Number(brightness);
        this._rebuildColorMatrix();
    } else {
        this.uniforms.brightness = Number(brightness);
    }
};

ColorFilter._copyInto = function(dest, src) {
    dest.length = src.length;
    for (let i = 0; i < src.length; i++) {
        dest[i] = src[i];
    }
};

// v8 only: PIXI 8 shaders expose `resources`, not `uniforms`, so the MZ-era
// idiom `filter.uniforms.colorTone[i] = x` reads `undefined.colorTone` and
// throws. Every VisuMZ_4_EncounterEffects battle transition writes that way.
// Expose a `uniforms` view whose writes route through the public setters and
// rebuild the color matrix. Array-valued entries hand back a Proxy over the
// backing array so in-place element writes are caught too.
ColorFilter.prototype._defineLegacyUniforms = function() {
    if ("uniforms" in this) {
        return;
    }
    const filter = this;
    const arrayView = function(backing) {
        return new Proxy(backing, {
            set(target, prop, value) {
                target[prop] = value;
                filter._rebuildColorMatrix();
                return true;
            }
        });
    };
    const colorToneView = arrayView(this._colorTone);
    const blendColorView = arrayView(this._blendColor);
    const uniforms = {};
    Object.defineProperties(uniforms, {
        hue: {
            get: () => filter._hue,
            set: value => filter.setHue(value)
        },
        brightness: {
            get: () => filter._brightness,
            set: value => filter.setBrightness(value)
        },
        colorTone: {
            get: () => colorToneView,
            set: value => filter.setColorTone(value)
        },
        blendColor: {
            get: () => blendColorView,
            set: value => filter.setBlendColor(value)
        }
    });
    Object.defineProperty(this, "uniforms", { value: uniforms });
};

// 5x4 color matrix multiply (a * b). Both flat 20-element arrays; row layout
// matches PIXI.ColorMatrixFilter's uColorMatrix (4 rows of 5: r,g,b,a per
// channel followed by the per-channel offset).
ColorFilter._matrixMultiply = function(a, b) {
    const out = new Array(20);
    for (let row = 0; row < 4; row++) {
        const r = row * 5;
        for (let col = 0; col < 5; col++) {
            let v = a[r + 0] * b[0  + col]
                  + a[r + 1] * b[5  + col]
                  + a[r + 2] * b[10 + col]
                  + a[r + 3] * b[15 + col];
            if (col === 4) v += a[r + 4]; // accumulate left-hand offset
            out[r + col] = v;
        }
    }
    return out;
};

// Imported RPG Maker 2000/2003 tones use hard light around 128, rather
// than MZ's additive RGB offsets. Keep their serialized MZ-shaped values
// readable by older runtimes and select the different colour rule per pass.
ColorFilter.prototype.setLegacyTone = function(enabled) {
    enabled = !!enabled;
    if (this._rrLegacyTone === enabled) return;
    this._rrLegacyTone = enabled;
    if (PIXI.GlProgram && PIXI.ColorMatrixFilter) this._rebuildColorMatrix();
};
ColorFilter.legacyToneMatrix = function(tone) {
    const m = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    // EasyRPG Bitmap::ToneBlit: Y'CbCr saturation precedes hard light.
    // The command values retain the source percentage, including >100%.
    const gray = Math.max(0, Math.min(255, 128 - (tone[3] || 0) * 128 / 255));
    const sat = gray > 128 ? 1 + (gray - 128) / 64 : gray / 128;
    const lum = [19595 / 65536, 38470 / 65536, 7471 / 65536];
    for (let row = 0; row < 3; row++) {
        const value = tone[row] || 0;
        // At neutral the old engine bypasses the tone operation entirely.
        const t = Math.max(0, Math.min(255, 128 + value * 128 / 255));
        const scale = value === 0 ? 1 : t <= 128 ? 2 * t / 255 : 2 * (255 - t) / 255;
        for (let col = 0; col < 3; col++) m[row * 5 + col] = scale * ((1 - sat) * lum[col] + (row === col ? sat : 0));
        m[row * 5 + 4] = t > 128 ? 1 - scale : 0;
    }
    return m;
};

// Oversaturation must clamp before hard light. Only that legacy case
// needs a second pass; its temporary target comes from PIXI's texture pool.
// Resolve inherited hooks at call time so plugins loaded afterwards can
// still replace ColorMatrixFilter/Filter behaviour.
const _rrColorFilterApply = function() {
    return Object.getPrototypeOf(ColorFilter.prototype).apply.apply(this, arguments);
};
ColorFilter.prototype.apply = function(manager, input, output, clear) {
    if (!this._rrLegacySaturationMatrix || !PIXI.TexturePool) {
        return _rrColorFilterApply.call(this, manager, input, output, clear);
    }
    const pass = this._rrSaturationPass || (this._rrSaturationPass = new PIXI.ColorMatrixFilter());
    pass._loadMatrix(this._rrLegacySaturationMatrix, false);
    const temp = PIXI.TexturePool.getSameSizeTexture(input);
    try {
        pass.apply(manager, input, temp, true);
        _rrColorFilterApply.call(this, manager, temp, output, clear);
    } finally {
        PIXI.TexturePool.returnTexture(temp);
    }
};
ColorFilter.prototype.destroy = function() {
    this._rrSaturationPass?.destroy();
    this._rrSaturationPass = null;
    return Object.getPrototypeOf(ColorFilter.prototype).destroy?.apply(this, arguments);
};

// v8 only: combine hue/colorTone/blendColor/brightness into one 5x4 matrix
// and push it to the inherited ColorMatrixFilter. Offsets are pre-normalized
// to 0-1 because PIXI.ColorMatrixFilter's matrix setter writes the value to
// `uColorMatrix` verbatim (no division applied).
ColorFilter.prototype._rebuildColorMatrix = function() {
    let m = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 1, 0
    ];

    // 1. Hue rotation (degrees). Luminance-preserving rotation matrix
    // (BT.709 weights). Approximate but visually close to MZ's HSL rotation.
    const hueRad = (this._hue || 0) * Math.PI / 180;
    if (hueRad !== 0) {
        const c = Math.cos(hueRad);
        const s = Math.sin(hueRad);
        const lr = 0.213, lg = 0.715, lb = 0.072;
        const hueM = [
            lr + c * (1 - lr) + s * (-lr),     lg + c * (-lg)     + s * (-lg),    lb + c * (-lb)     + s * (1 - lb), 0, 0,
            lr + c * (-lr)    + s * 0.143,     lg + c * (1 - lg)  + s * 0.140,    lb + c * (-lb)     + s * -0.283,   0, 0,
            lr + c * (-lr)    + s * -(1 - lr), lg + c * (-lg)     + s * lg,       lb + c * (1 - lb)  + s * lb,       0, 0,
            0, 0, 0, 1, 0
        ];
        m = ColorFilter._matrixMultiply(hueM, m);
    }

    this._rrLegacySaturationMatrix = null;
    if (this._rrLegacyTone) {
        if (this._colorTone[3] < 0) {
            this._rrLegacySaturationMatrix = ColorFilter._matrixMultiply(
                ColorFilter.legacyToneMatrix([0, 0, 0, this._colorTone[3]]), m);
            m = ColorFilter.legacyToneMatrix([this._colorTone[0], this._colorTone[1], this._colorTone[2], 0]);
        } else {
            m = ColorFilter._matrixMultiply(ColorFilter.legacyToneMatrix(this._colorTone), m);
        }
    } else {
        // 2. Grayscale (saturation reduction) by colorTone[3] / 255.
        const grayAmount =
            Math.max(0, Math.min(255, this._colorTone[3] || 0)) / 255;
        if (grayAmount > 0) {
            const k = grayAmount;
            const lr = 0.2125, lg = 0.7154, lb = 0.0721;
            const grayM = [
                lr * k + (1 - k), lg * k,            lb * k,            0, 0,
                lr * k,           lg * k + (1 - k),  lb * k,            0, 0,
                lr * k,           lg * k,            lb * k + (1 - k),  0, 0,
                0, 0, 0, 1, 0
            ];
            m = ColorFilter._matrixMultiply(grayM, m);
        }

        // 3. Additive color tone (RGB offsets, 0..255 input normalized to 0..1).
        const r2 = (this._colorTone[0] || 0) / 255;
        const g2 = (this._colorTone[1] || 0) / 255;
        const b2 = (this._colorTone[2] || 0) / 255;
        if (r2 !== 0 || g2 !== 0 || b2 !== 0) {
            m[4]  += r2;
            m[9]  += g2;
            m[14] += b2;
        }

    }

    // 4. Blend color: output = output * (1 - i3) + blend * i3.
    // Used by Scene_Base fade in/out -- blendColor is [c, c, c, fadeOpacity]
    // where c is 0 (black fade) or 255 (white fade).
    const i3 =
        Math.max(0, Math.min(255, this._blendColor[3] || 0)) / 255;
    if (i3 > 0) {
        const i1 = 1 - i3;
        const r3 = (this._blendColor[0] || 0) / 255;
        const g3 = (this._blendColor[1] || 0) / 255;
        const b3 = (this._blendColor[2] || 0) / 255;
        const blendM = [
            i1, 0,  0,  0, r3 * i3,
            0,  i1, 0,  0, g3 * i3,
            0,  0,  i1, 0, b3 * i3,
            0,  0,  0,  1, 0
        ];
        m = ColorFilter._matrixMultiply(blendM, m);
    }

    // 5. Brightness -- uniformly scale RGB rows (offsets included).
    const brt = (this._brightness == null ? 255 : this._brightness) / 255;
    if (brt !== 1) {
        for (let i = 0; i < 15; i++) m[i] *= brt;
    }

    // _loadMatrix(matrix, false) assigns uColorMatrix AND calls update() on
    // the uniform group so the change actually reaches the GPU. Setting
    // `this.matrix` directly only writes the uniform value without flagging
    // the uniform group dirty, which can leave the GPU side stale on v8.
    if (this._loadMatrix) {
        this._loadMatrix(m, false);
    } else {
        this.matrix = new Float32Array(m);
    }
};

ColorFilter.prototype._fragmentSrc = function() {
    const src =
        "varying vec2 vTextureCoord;" +
        "uniform sampler2D uSampler;" +
        "uniform float hue;" +
        "uniform vec4 colorTone;" +
        "uniform vec4 blendColor;" +
        "uniform float brightness;" +
        "vec3 rgbToHsl(vec3 rgb) {" +
        "  float r = rgb.r;" +
        "  float g = rgb.g;" +
        "  float b = rgb.b;" +
        "  float cmin = min(r, min(g, b));" +
        "  float cmax = max(r, max(g, b));" +
        "  float h = 0.0;" +
        "  float s = 0.0;" +
        "  float l = (cmin + cmax) / 2.0;" +
        "  float delta = cmax - cmin;" +
        "  if (delta > 0.0) {" +
        "    if (r == cmax) {" +
        "      h = mod((g - b) / delta + 6.0, 6.0) / 6.0;" +
        "    } else if (g == cmax) {" +
        "      h = ((b - r) / delta + 2.0) / 6.0;" +
        "    } else {" +
        "      h = ((r - g) / delta + 4.0) / 6.0;" +
        "    }" +
        "    if (l < 1.0) {" +
        "      s = delta / (1.0 - abs(2.0 * l - 1.0));" +
        "    }" +
        "  }" +
        "  return vec3(h, s, l);" +
        "}" +
        "vec3 hslToRgb(vec3 hsl) {" +
        "  float h = hsl.x;" +
        "  float s = hsl.y;" +
        "  float l = hsl.z;" +
        "  float c = (1.0 - abs(2.0 * l - 1.0)) * s;" +
        "  float x = c * (1.0 - abs((mod(h * 6.0, 2.0)) - 1.0));" +
        "  float m = l - c / 2.0;" +
        "  float cm = c + m;" +
        "  float xm = x + m;" +
        "  if (h < 1.0 / 6.0) {" +
        "    return vec3(cm, xm, m);" +
        "  } else if (h < 2.0 / 6.0) {" +
        "    return vec3(xm, cm, m);" +
        "  } else if (h < 3.0 / 6.0) {" +
        "    return vec3(m, cm, xm);" +
        "  } else if (h < 4.0 / 6.0) {" +
        "    return vec3(m, xm, cm);" +
        "  } else if (h < 5.0 / 6.0) {" +
        "    return vec3(xm, m, cm);" +
        "  } else {" +
        "    return vec3(cm, m, xm);" +
        "  }" +
        "}" +
        "void main() {" +
        "  vec4 sample = texture2D(uSampler, vTextureCoord);" +
        "  float a = sample.a;" +
        "  vec3 hsl = rgbToHsl(sample.rgb);" +
        "  hsl.x = mod(hsl.x + hue / 360.0, 1.0);" +
        "  hsl.y = hsl.y * (1.0 - colorTone.a / 255.0);" +
        "  vec3 rgb = hslToRgb(hsl);" +
        "  float r = rgb.r;" +
        "  float g = rgb.g;" +
        "  float b = rgb.b;" +
        "  float r2 = colorTone.r / 255.0;" +
        "  float g2 = colorTone.g / 255.0;" +
        "  float b2 = colorTone.b / 255.0;" +
        "  float r3 = blendColor.r / 255.0;" +
        "  float g3 = blendColor.g / 255.0;" +
        "  float b3 = blendColor.b / 255.0;" +
        "  float i3 = blendColor.a / 255.0;" +
        "  float i1 = 1.0 - i3;" +
        // The tone is added to the straight colour and clamped there, then premultiplied again: clamping after
        // the multiply let a toned, translucent pixel exceed its alpha and draw brighter than white.
        "  r = a > 0.0 ? clamp(r / a + r2, 0.0, 1.0) * a : 0.0;" +
        "  g = a > 0.0 ? clamp(g / a + g2, 0.0, 1.0) * a : 0.0;" +
        "  b = a > 0.0 ? clamp(b / a + b2, 0.0, 1.0) * a : 0.0;" +
        "  r = clamp(r * i1 + r3 * i3 * a, 0.0, 1.0);" +
        "  g = clamp(g * i1 + g3 * i3 * a, 0.0, 1.0);" +
        "  b = clamp(b * i1 + b3 * i3 * a, 0.0, 1.0);" +
        "  r = r * brightness / 255.0;" +
        "  g = g * brightness / 255.0;" +
        "  b = b * brightness / 255.0;" +
        "  gl_FragColor = vec4(r, g, b, a);" +
        "}";
    return src;
};

//-----------------------------------------------------------------------------
/**
 * The root object of the display tree.
 *
 * @class
 * @extends PIXI.Container
 */
function Stage() {
    this.initialize(...arguments);
}

Stage.prototype = Object.create(PIXI.Container.prototype);
Stage.prototype.constructor = Stage;

Stage.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);
};

/**
 * Destroys the stage.
 */
Stage.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.Container.prototype.destroy.call(this, options);
};
