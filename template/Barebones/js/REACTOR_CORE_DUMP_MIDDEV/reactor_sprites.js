//=============================================================================
// reactor_sprites.js
// RPG Reactor Game Engine - Sprites Module
//=============================================================================

//-----------------------------------------------------------------------------
// Tilemap
// Handles tilemap rendering using Pixi.js, compatible with RPG Maker MZ format
//-----------------------------------------------------------------------------

class Tilemap extends PIXI.Container {
    constructor() {
        super();

        // Tilemap constants (RPG Maker MZ compatible)
        this.TILE_WIDTH = 48;
        this.TILE_HEIGHT = 48;

        // Tile ID ranges (RPG Maker MZ format)
        this.TILE_ID_A1 = 2048;  // Animated autotiles
        this.TILE_ID_A2 = 2816;  // Ground autotiles
        this.TILE_ID_A3 = 4352;  // Building/wall autotiles
        this.TILE_ID_A4 = 5888;  // Wall top autotiles
        this.TILE_ID_A5 = 1536;  // Normal tiles
        this.TILE_ID_MAX = 8192;

        // Map data
        this._mapData = null;
        this._tilesetTextures = [];
        this._mapWidth = 0;
        this._mapHeight = 0;

        // Create layers
        this._layers = {
            ground: new PIXI.Container(),
            lower1: new PIXI.Container(),
            lower2: new PIXI.Container(),
            lower3: new PIXI.Container(),
            upper4: new PIXI.Container(),
            upper5: new PIXI.Container(),
            shadow: new PIXI.Container()
        };

        // Add layers in correct rendering order
        this.addChild(this._layers.ground);
        this.addChild(this._layers.shadow);
        this.addChild(this._layers.lower1);
        this.addChild(this._layers.lower2);
        this.addChild(this._layers.lower3);
        this.addChild(this._layers.upper4);
        this.addChild(this._layers.upper5);

        // Animation state for A1 autotiles
        this.waterAnimationFrame = 0;
        this.waterfallAnimationFrame = 0;
        this.waterAnimationDirection = 1;
        this._animationCount = 0;

        // Autotile tables from RPG Maker MZ
        this.FLOOR_AUTOTILE_TABLE = [
            [[2, 4], [1, 4], [2, 3], [1, 3]], [[2, 0], [1, 4], [2, 3], [1, 3]],
            [[2, 4], [3, 0], [2, 3], [1, 3]], [[2, 0], [3, 0], [2, 3], [1, 3]],
            [[2, 4], [1, 4], [2, 3], [3, 1]], [[2, 0], [1, 4], [2, 3], [3, 1]],
            [[2, 4], [3, 0], [2, 3], [3, 1]], [[2, 0], [3, 0], [2, 3], [3, 1]],
            [[2, 4], [1, 4], [2, 1], [1, 3]], [[2, 0], [1, 4], [2, 1], [1, 3]],
            [[2, 4], [3, 0], [2, 1], [1, 3]], [[2, 0], [3, 0], [2, 1], [1, 3]],
            [[2, 4], [1, 4], [2, 1], [3, 1]], [[2, 0], [1, 4], [2, 1], [3, 1]],
            [[2, 4], [3, 0], [2, 1], [3, 1]], [[2, 0], [3, 0], [2, 1], [3, 1]],
            [[0, 4], [1, 4], [0, 3], [1, 3]], [[0, 4], [3, 0], [0, 3], [1, 3]],
            [[0, 4], [1, 4], [0, 3], [3, 1]], [[0, 4], [3, 0], [0, 3], [3, 1]],
            [[2, 2], [1, 2], [2, 3], [1, 3]], [[2, 2], [1, 2], [2, 3], [3, 1]],
            [[2, 2], [1, 2], [2, 1], [1, 3]], [[2, 2], [1, 2], [2, 1], [3, 1]],
            [[2, 4], [3, 4], [2, 3], [3, 3]], [[2, 4], [3, 4], [2, 1], [3, 3]],
            [[2, 0], [3, 4], [2, 3], [3, 3]], [[2, 0], [3, 4], [2, 1], [3, 3]],
            [[2, 4], [1, 4], [2, 5], [1, 5]], [[2, 0], [1, 4], [2, 5], [1, 5]],
            [[2, 4], [3, 0], [2, 5], [1, 5]], [[2, 0], [3, 0], [2, 5], [1, 5]],
            [[0, 4], [3, 4], [0, 3], [3, 3]], [[2, 2], [1, 2], [2, 5], [1, 5]],
            [[0, 2], [1, 2], [0, 3], [1, 3]], [[0, 2], [1, 2], [0, 3], [3, 1]],
            [[2, 2], [3, 2], [2, 3], [3, 3]], [[2, 2], [3, 2], [2, 1], [3, 3]],
            [[2, 4], [3, 4], [2, 5], [3, 5]], [[2, 0], [3, 4], [2, 5], [3, 5]],
            [[0, 4], [1, 4], [0, 5], [1, 5]], [[0, 4], [3, 0], [0, 5], [1, 5]],
            [[0, 2], [3, 2], [0, 3], [3, 3]], [[0, 2], [1, 2], [0, 5], [1, 5]],
            [[0, 4], [3, 4], [0, 5], [3, 5]], [[2, 2], [3, 2], [2, 5], [3, 5]],
            [[0, 2], [3, 2], [0, 5], [3, 5]], [[0, 0], [1, 0], [0, 1], [1, 1]]
        ];

        this.WALL_AUTOTILE_TABLE = [
            [[2, 2], [1, 2], [2, 1], [1, 1]], [[0, 2], [1, 2], [0, 1], [1, 1]],
            [[2, 0], [1, 0], [2, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]],
            [[2, 2], [3, 2], [2, 1], [3, 1]], [[0, 2], [3, 2], [0, 1], [3, 1]],
            [[2, 0], [3, 0], [2, 1], [3, 1]], [[0, 0], [3, 0], [0, 1], [3, 1]],
            [[2, 2], [1, 2], [2, 3], [1, 3]], [[0, 2], [1, 2], [0, 3], [1, 3]],
            [[2, 0], [1, 0], [2, 3], [1, 3]], [[0, 0], [1, 0], [0, 3], [1, 3]],
            [[2, 2], [3, 2], [2, 3], [3, 3]], [[0, 2], [3, 2], [0, 3], [3, 3]],
            [[2, 0], [3, 0], [2, 3], [3, 3]], [[0, 0], [3, 0], [0, 3], [3, 3]]
        ];

        this.WATERFALL_AUTOTILE_TABLE = [
            [[2, 0], [1, 0], [2, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]],
            [[2, 0], [3, 0], [2, 1], [3, 1]], [[0, 0], [3, 0], [0, 1], [3, 1]]
        ];
    }

    setData(width, height, data) {
        this._mapWidth = width;
        this._mapHeight = height;
        this._mapData = data;
    }

    setBitmaps(bitmaps) {
        this._tilesetTextures = bitmaps;
    }

    refresh() {
        this._clearLayers();
        this._renderAllLayers();
    }

    update() {
        // Update A1 tile animation
        this._animationCount++;
        if (this._animationCount >= 30) {  // Update every 30 frames (~0.5 seconds at 60fps)
            this._animationCount = 0;

            // Water: ping-pong pattern (0→1→2→1→0)
            this.waterAnimationFrame += this.waterAnimationDirection;
            if (this.waterAnimationFrame === 2 || this.waterAnimationFrame === 0) {
                this.waterAnimationDirection *= -1;
            }

            // Waterfall: straight loop (0→1→2→0)
            this.waterfallAnimationFrame = (this.waterfallAnimationFrame + 1) % 3;

            // Update A1 tiles
            this._updateA1Tiles();
        }
    }

    _clearLayers() {
        for (const key in this._layers) {
            this._layers[key].removeChildren();
        }
    }

    _renderAllLayers() {
        if (!this._mapData || !this._mapWidth || !this._mapHeight) {
            return;
        }

        const layerSize = this._mapWidth * this._mapHeight;

        // Layer 0 - Ground
        for (let y = 0; y < this._mapHeight; y++) {
            for (let x = 0; x < this._mapWidth; x++) {
                const index = 0 * layerSize + y * this._mapWidth + x;
                const tileId = this._mapData[index];
                if (tileId > 0) {
                    this._renderTile(tileId, x, y, this._layers.ground);
                }
            }
        }

        // Layer 1 - Lower
        for (let y = 0; y < this._mapHeight; y++) {
            for (let x = 0; x < this._mapWidth; x++) {
                const index = 1 * layerSize + y * this._mapWidth + x;
                const tileId = this._mapData[index];
                if (tileId > 0) {
                    this._renderTile(tileId, x, y, this._layers.lower1);
                }
            }
        }

        // Layer 2 - Lower decoration
        for (let y = 0; y < this._mapHeight; y++) {
            for (let x = 0; x < this._mapWidth; x++) {
                const index = 2 * layerSize + y * this._mapWidth + x;
                const tileId = this._mapData[index];
                if (tileId > 0) {
                    this._renderTile(tileId, x, y, this._layers.lower2);
                }
            }
        }

        // Layer 3 - Lower decoration
        for (let y = 0; y < this._mapHeight; y++) {
            for (let x = 0; x < this._mapWidth; x++) {
                const index = 3 * layerSize + y * this._mapWidth + x;
                const tileId = this._mapData[index];
                if (tileId > 0) {
                    this._renderTile(tileId, x, y, this._layers.lower3);
                }
            }
        }

        // Layer 4 - Shadow bits
        for (let y = 0; y < this._mapHeight; y++) {
            for (let x = 0; x < this._mapWidth; x++) {
                const index = 4 * layerSize + y * this._mapWidth + x;
                const shadowBits = this._mapData[index];
                if (shadowBits > 0) {
                    this._renderShadowTile(shadowBits, x, y);
                }
            }
        }
    }

    _renderTile(tileId, x, y, layer) {
        if (tileId <= 0) return;

        // A2/A3/A4 tiles should not render if there's ANY A1 at this position
        const isA2orHigher = tileId >= 2816 && tileId < 8192;
        if (isA2orHigher && this._mapData) {
            const layerSize = this._mapWidth * this._mapHeight;

            // Check ALL layers for A1 at this position
            for (let checkLayer = 0; checkLayer < 4; checkLayer++) {
                const checkIndex = checkLayer * layerSize + y * this._mapWidth + x;
                const checkTileId = this._mapData[checkIndex];
                if (checkTileId >= 2048 && checkTileId < 2816) {
                    // Found A1 at this position - don't render A2/A3/A4
                    return;
                }
            }
        }

        // Route to appropriate rendering method
        if (this._isAutotile(tileId)) {
            this._renderAutotile(tileId, x, y, layer);
        } else {
            this._renderNormalTile(tileId, x, y, layer);
        }
    }

    _renderNormalTile(tileId, x, y, layer) {
        if (tileId === 0) return;

        let setNumber = 0;

        // Determine which tileset image to use
        if (this._isTileA5(tileId)) {
            setNumber = 4; // A5
        } else if (tileId < 1536) {
            // B-E tilesets (0-1535)
            setNumber = 5 + Math.floor(tileId / 256);
        } else {
            return; // Invalid tile ID
        }

        const texture = this._tilesetTextures[setNumber];
        if (!texture || !texture.texture) return;

        const w = this.TILE_WIDTH;
        const h = this.TILE_HEIGHT;
        let sx, sy;

        if (this._isTileA5(tileId)) {
            // A5 tiles (1536-1791)
            const localTileId = tileId - this.TILE_ID_A5;
            const tilesPerRow = 8;
            sx = (localTileId % tilesPerRow) * w;
            sy = Math.floor(localTileId / tilesPerRow) * h;
        } else if (tileId < 1536) {
            // B-E tiles (0-1535)
            const localTileId = tileId % 256;
            sx = ((Math.floor(localTileId / 128) % 2) * 8 + (localTileId % 8)) * w;
            sy = (Math.floor((localTileId % 256) / 8) % 16) * h;
        }

        const tileTexture = new PIXI.Texture({
            source: texture.texture.source,
            frame: new PIXI.Rectangle(sx, sy, w, h)
        });

        const sprite = new PIXI.Sprite(tileTexture);
        sprite.x = x * this.TILE_WIDTH;
        sprite.y = y * this.TILE_HEIGHT;
        sprite.blendMode = 'normal';

        layer.addChild(sprite);
    }

    _renderAutotile(tileId, x, y, layer) {
        const kind = this._getAutotileKind(tileId);
        const shape = this._getAutotileShape(tileId);
        const tx = kind % 8;
        const ty = Math.floor(kind / 8);
        let setNumber = 0;
        let bx = 0;
        let by = 0;
        let autotileTable = this.FLOOR_AUTOTILE_TABLE;

        // Determine tileset image and position based on tile type
        if (this._isTileA1(tileId)) {
            setNumber = 0; // A1
            const waterAnimationOffset = this.waterAnimationFrame * 2;

            const kindToBlock = [
                [0, 0], [0, 1], [3, 0], [3, 1], [4, 0], [7, 0], [4, 1], [7, 1],
                [0, 2], [0, 3], [3, 2], [3, 3], [4, 2], [7, 2], [4, 3], [7, 3]
            ];

            const [block, sourceRow] = kindToBlock[kind];
            const isWaterfall = (kind === 2 || kind === 3 || kind === 5 || kind === 7 ||
                               kind === 10 || kind === 11 || kind === 13 || kind === 15);

            if (isWaterfall) {
                bx = block * 2;
                by = sourceRow * 3 + this.waterfallAnimationFrame;
                autotileTable = this.WATERFALL_AUTOTILE_TABLE;
            } else {
                bx = block * 2 + waterAnimationOffset;
                by = sourceRow * 3;
                autotileTable = this.FLOOR_AUTOTILE_TABLE;
            }
        } else if (this._isTileA2(tileId)) {
            setNumber = 1; // A2
            bx = tx * 2;
            by = (ty - 2) * 3;
            autotileTable = this.FLOOR_AUTOTILE_TABLE;
        } else if (this._isTileA3(tileId)) {
            setNumber = 2; // A3
            bx = tx * 2;
            by = (ty - 6) * 2;
            autotileTable = this.WALL_AUTOTILE_TABLE;
        } else if (this._isTileA4(tileId)) {
            setNumber = 3; // A4
            bx = tx * 2;
            const rowInA4 = ty - 10;
            const pairIndex = Math.floor(rowInA4 / 2);
            const isWall = rowInA4 % 2 === 1;
            by = pairIndex * 5 + (isWall ? 3 : 0);
            autotileTable = isWall ? this.WALL_AUTOTILE_TABLE : this.FLOOR_AUTOTILE_TABLE;
        }

        const texture = this._tilesetTextures[setNumber];
        if (!texture || !texture.texture) return;

        const table = autotileTable[shape];
        if (!table) return;

        const w1 = this.TILE_WIDTH / 2;
        const h1 = this.TILE_HEIGHT / 2;

        // Render all 4 sub-tiles
        for (let i = 0; i < 4; i++) {
            const qsx = table[i][0];
            const qsy = table[i][1];
            const sx1 = (bx * 2 + qsx) * w1;
            const sy1 = (by * 2 + qsy) * h1;
            const dx1 = x * this.TILE_WIDTH + (i % 2) * w1;
            const dy1 = y * this.TILE_HEIGHT + Math.floor(i / 2) * h1;

            const tileTexture = new PIXI.Texture({
                source: texture.texture.source,
                frame: new PIXI.Rectangle(sx1, sy1, w1, h1)
            });

            const sprite = new PIXI.Sprite(tileTexture);
            sprite.x = dx1;
            sprite.y = dy1;
            sprite.blendMode = 'normal';

            layer.addChild(sprite);
        }
    }

    _renderShadowTile(shadowBits, x, y) {
        if (shadowBits & 0x0f) {
            const w1 = this.TILE_WIDTH / 2;
            const h1 = this.TILE_HEIGHT / 2;

            for (let i = 0; i < 4; i++) {
                if (shadowBits & (1 << i)) {
                    const dx1 = x * this.TILE_WIDTH + (i % 2) * w1;
                    const dy1 = y * this.TILE_HEIGHT + Math.floor(i / 2) * h1;

                    const shadow = new PIXI.Graphics();
                    shadow.rect(dx1, dy1, w1, h1);
                    shadow.fill({ color: 0x000000, alpha: 0.48 });

                    this._layers.shadow.addChild(shadow);
                }
            }
        }
    }

    _updateA1Tiles() {
        if (!this._mapData) return;

        const layerSize = this._mapWidth * this._mapHeight;

        // Check all tile layers for A1 tiles
        for (let layerIndex = 0; layerIndex < 4; layerIndex++) {
            const pixiLayer = [this._layers.ground, this._layers.lower1,
                             this._layers.lower2, this._layers.lower3][layerIndex];

            for (let y = 0; y < this._mapHeight; y++) {
                for (let x = 0; x < this._mapWidth; x++) {
                    const index = layerIndex * layerSize + y * this._mapWidth + x;
                    const tileId = this._mapData[index];

                    if (this._isTileA1(tileId)) {
                        this._clearTileSpritesAt(x, y, pixiLayer);
                        this._renderAutotile(tileId, x, y, pixiLayer);
                    }
                }
            }
        }
    }

    _clearTileSpritesAt(x, y, layer) {
        if (!layer) return;

        const tileX = x * this.TILE_WIDTH;
        const tileY = y * this.TILE_HEIGHT;

        for (let i = layer.children.length - 1; i >= 0; i--) {
            const child = layer.children[i];
            if (child.x >= tileX && child.x < tileX + this.TILE_WIDTH &&
                child.y >= tileY && child.y < tileY + this.TILE_HEIGHT) {
                layer.removeChild(child);
                child.destroy();
            }
        }
    }

    _isAutotile(tileId) {
        return tileId >= this.TILE_ID_A1;
    }

    _isTileA1(tileId) {
        return tileId >= this.TILE_ID_A1 && tileId < this.TILE_ID_A2;
    }

    _isTileA2(tileId) {
        return tileId >= this.TILE_ID_A2 && tileId < this.TILE_ID_A3;
    }

    _isTileA3(tileId) {
        return tileId >= this.TILE_ID_A3 && tileId < this.TILE_ID_A4;
    }

    _isTileA4(tileId) {
        return tileId >= this.TILE_ID_A4 && tileId < this.TILE_ID_MAX;
    }

    _isTileA5(tileId) {
        return tileId >= this.TILE_ID_A5 && tileId < this.TILE_ID_A5 + 256;
    }

    _getAutotileKind(tileId) {
        return Math.floor((tileId - this.TILE_ID_A1) / 48);
    }

    _getAutotileShape(tileId) {
        return (tileId - this.TILE_ID_A1) % 48;
    }
}

//-----------------------------------------------------------------------------
// Sprite_Character
// The sprite for displaying a character
//-----------------------------------------------------------------------------

class Sprite_Character extends PIXI.Sprite {
    constructor(character) {
        super();
        this.initialize(character);
    }

    initialize(character) {
        this.anchor.set(0.5, 1);
        this._character = null;
        this._balloonDuration = 0;
        this._tilesetId = 0;
        this._characterName = "";
        this._characterIndex = 0;
        this._isBigCharacter = false;
        this._bushDepth = 0;
        this._tileId = 0;
        this._baseTexture = null; // Store the full spritesheet texture
        this.setCharacter(character);
    }

    setCharacter(character) {
        this._character = character;
    }

    update() {
        this.updateBitmap();
        this.updateFrame();
        this.updatePosition();
        this.updateVisibility();
    }

    updateBitmap() {
        if (this.isImageChanged()) {
            this._tilesetId = $gameMap.tilesetId();
            this._tileId = this._character.tileId();
            this._characterName = this._character.characterName();
            this._characterIndex = this._character.characterIndex();
            if (this._tileId > 0) {
                this.setTileBitmap();
            } else {
                this.setCharacterBitmap();
            }
        }
    }

    isImageChanged() {
        return (
            this._tilesetId !== $gameMap.tilesetId() ||
            this._tileId !== this._character.tileId() ||
            this._characterName !== this._character.characterName() ||
            this._characterIndex !== this._character.characterIndex()
        );
    }

    setTileBitmap() {
        // Tile character - not implemented yet
    }

    setCharacterBitmap() {
        // Load the character bitmap (async, but we'll handle it in updateCharacterFrame)
        this._isBigCharacter = ImageManager.isBigCharacter(this._characterName);
        this._loadCharacterBitmap();
    }

    async _loadCharacterBitmap() {
        try {
            console.log(`[Sprite_Character] Loading character: "${this._characterName}"`);
            const bitmap = await ImageManager.loadBitmap('img/characters/', this._characterName);
            console.log(`[Sprite_Character] Bitmap loaded (sprite):`, bitmap);

            // PIXI v8: Get the base texture from the sprite, then extract source
            if (bitmap && bitmap.texture) {
                const baseTexture = bitmap.texture;
                console.log(`[Sprite_Character] Base texture:`, baseTexture);

                // Store the texture source (not the texture itself!)
                this._textureSource = baseTexture.source;
                this._bitmapReady = true;

                console.log(`[Sprite_Character] Texture source:`, this._textureSource);
                console.log(`[Sprite_Character] Source dimensions:`, this._textureSource?.width, 'x', this._textureSource?.height);
                console.log(`[Sprite_Character] Pattern size:`, this.patternWidth(), 'x', this.patternHeight());

                // Initial frame update
                this.updateCharacterFrame();
            } else {
                console.error(`[Sprite_Character] No texture in bitmap`);
                this._bitmapReady = false;
            }
        } catch (error) {
            console.error(`[Sprite_Character] Failed to load character: ${this._characterName}`, error);
            this._bitmapReady = false;
        }
    }

    updateFrame() {
        if (this._tileId > 0) {
            this.updateTileFrame();
        } else {
            this.updateCharacterFrame();
        }
    }

    updateTileFrame() {
        // Tile character - not implemented yet
    }

    updateCharacterFrame() {
        // Only update if texture source is loaded
        if (!this._textureSource) return;

        const pw = this.patternWidth();
        const ph = this.patternHeight();
        const sx = (this.characterBlockX() + this.characterPatternX()) * pw;
        const sy = (this.characterBlockY() + this.characterPatternY()) * ph;

        // PIXI v8: Create texture from source with frame rectangle
        // This matches the working EventManager code
        const croppedTexture = new PIXI.Texture({
            source: this._textureSource,
            frame: new PIXI.Rectangle(sx, sy, pw, ph)
        });

        this.texture = croppedTexture;
    }

    characterBlockX() {
        if (this._isBigCharacter) {
            return 0;
        } else {
            const index = this._character.characterIndex();
            return (index % 4) * 3;
        }
    }

    characterBlockY() {
        if (this._isBigCharacter) {
            return 0;
        } else {
            const index = this._character.characterIndex();
            return Math.floor(index / 4) * 4;
        }
    }

    characterPatternX() {
        return this._character.pattern();
    }

    characterPatternY() {
        return (this._character.direction() - 2) / 2;
    }

    patternWidth() {
        if (this._tileId > 0) {
            return $gameMap.tileWidth();
        } else if (this._isBigCharacter) {
            return this._baseTexture ? this._baseTexture.width / 3 : 48;
        } else {
            return this._baseTexture ? this._baseTexture.width / 12 : 48;
        }
    }

    patternHeight() {
        if (this._tileId > 0) {
            return $gameMap.tileHeight();
        } else if (this._isBigCharacter) {
            return this._baseTexture ? this._baseTexture.height / 4 : 48;
        } else {
            return this._baseTexture ? this._baseTexture.height / 8 : 48;
        }
    }

    updatePosition() {
        this.x = this._character.screenX();
        this.y = this._character.screenY();
        this.z = this._character.screenZ();
    }

    updateVisibility() {
        if (this._character.isTransparent()) {
            this.visible = false;
        } else {
            this.visible = true;
            this.alpha = this._character.opacity() / 255;
        }
    }
}

//-----------------------------------------------------------------------------
// Spriteset_Map
// The set of sprites on the map screen
//-----------------------------------------------------------------------------

class Spriteset_Map extends PIXI.Container {
    constructor() {
        super();
        this._parallax = null;
        this._tilemap = null;
        this._characterSprites = [];
        this._pictureContainer = null;
        this._pictureSprites = [];
        this._parallaxX = 0;
        this._parallaxY = 0;

        this.createParallax();
        this.createTilemap();
        this.createCharacters();
        this.createPictures();
    }

    createParallax() {
        this._parallax = new PIXI.Container();
        this.addChild(this._parallax);
    }

    async loadParallax() {
        if (!$dataMap) return;

        const { parallaxName, parallaxShow, parallaxLoopX, parallaxLoopY, parallaxSx, parallaxSy } = $dataMap;

        // Clear existing parallax
        this._parallax.removeChildren();

        if (!parallaxShow || !parallaxName || parallaxName === '') {
            return;
        }

        try {
            const bitmap = await ImageManager.loadBitmap('img/parallaxes/', parallaxName);
            if (!bitmap || !bitmap.texture) return;

            const mapPixelWidth = $dataMap.width * 48;
            const mapPixelHeight = $dataMap.height * 48;

            if (parallaxLoopX || parallaxLoopY) {
                // Use TilingSprite for looping parallax
                const sprite = new PIXI.TilingSprite({
                    texture: bitmap.texture,
                    width: Graphics.width,
                    height: Graphics.height
                });
                sprite.tilePosition = { x: 0, y: 0 };
                this._parallaxSprite = sprite;
                this._parallax.addChild(sprite);
            } else {
                // Use regular sprite for non-looping parallax
                const sprite = new PIXI.Sprite(bitmap.texture);
                this._parallaxSprite = sprite;
                this._parallax.addChild(sprite);
            }

            this._parallaxLoopX = parallaxLoopX;
            this._parallaxLoopY = parallaxLoopY;
            this._parallaxSx = parallaxSx || 0;
            this._parallaxSy = parallaxSy || 0;

            console.log(`Loaded parallax: ${parallaxName}`);
        } catch (error) {
            console.error(`Failed to load parallax: ${parallaxName}`, error);
        }
    }

    createTilemap() {
        this._tilemap = new Tilemap();
        this.addChild(this._tilemap);
        this.loadTileset();
    }

    async loadTileset() {
        if (!$dataMap || !$dataTilesets) return;

        const tilesetId = $dataMap.tilesetId;
        const tileset = $dataTilesets[tilesetId];
        if (!tileset) return;

        // Load tileset images
        const bitmaps = [];
        for (let i = 0; i < tileset.tilesetNames.length; i++) {
            const name = tileset.tilesetNames[i];
            if (name) {
                try {
                    const bitmap = await ImageManager.loadBitmap('img/tilesets/', name);
                    bitmaps[i] = bitmap;
                } catch (error) {
                    console.error(`Failed to load tileset: ${name}`);
                }
            }
        }

        this._tilemap.setBitmaps(bitmaps);
        this._tilemap.setData($dataMap.width, $dataMap.height, $dataMap.data);
        this._tilemap.refresh();

        // Also load parallax
        await this.loadParallax();
    }

    createCharacters() {
        this._characterSprites = [];

        // Create event sprites
        if ($gameMap && $gameMap.events) {
            for (const event of $gameMap.events()) {
                const sprite = new Sprite_Character(event);
                this._characterSprites.push(sprite);
                this.addChild(sprite);
            }
        }

        // Create player sprite (on top of events)
        if ($gamePlayer) {
            const sprite = new Sprite_Character($gamePlayer);
            this._characterSprites.push(sprite);
            this.addChild(sprite);
        }
    }

    createPictures() {
        // Create picture container (pictures go on top of everything else on the map)
        this._pictureContainer = new PIXI.Container();
        this.addChild(this._pictureContainer);

        // Create sprites for all possible pictures
        this._pictureSprites = [];
        for (let i = 1; i <= $gameScreen.maxPictures(); i++) {
            const sprite = new Sprite_Picture(i);
            this._pictureSprites.push(sprite);
            this._pictureContainer.addChild(sprite);
        }
    }

    update() {
        if (this._tilemap) {
            this._tilemap.update();
            // Apply camera scroll to tilemap
            this.updateTilemapPosition();
        }

        // Update parallax scrolling
        if (this._parallaxSprite && (this._parallaxSx !== 0 || this._parallaxSy !== 0)) {
            if (this._parallaxLoopX && this._parallaxSx !== 0) {
                this._parallaxX += this._parallaxSx;
            }
            if (this._parallaxLoopY && this._parallaxSy !== 0) {
                this._parallaxY += this._parallaxSy;
            }

            if (this._parallaxSprite.tilePosition) {
                this._parallaxSprite.tilePosition.x = Math.round(this._parallaxX);
                this._parallaxSprite.tilePosition.y = Math.round(this._parallaxY);
            }
        }

        // Update character sprites
        for (const sprite of this._characterSprites) {
            sprite.update();
        }

        // Update picture sprites
        for (const sprite of this._pictureSprites) {
            sprite.update();
        }
    }

    updateTilemapPosition() {
        // Move the tilemap based on camera scroll (Game_Map display position)
        const tileWidth = 48;
        const tileHeight = 48;
        this._tilemap.x = -$gameMap.displayX() * tileWidth;
        this._tilemap.y = -$gameMap.displayY() * tileHeight;
    }
}

//-----------------------------------------------------------------------------
// Sprite_Picture
//
// The sprite for displaying a picture.

class Sprite_Picture extends PIXI.Sprite {
    constructor(pictureId) {
        super();
        this._pictureId = pictureId;
        this._pictureName = "";
        this._isPicture = true;
        this.anchor.set(0, 0);
        this.update();
    }

    picture() {
        return $gameScreen.picture(this._pictureId);
    }

    update() {
        this.updateBitmap();
        if (this.visible) {
            this.updateOrigin();
            this.updatePosition();
            this.updateScale();
            this.updateTone();
            this.updateOther();
        }
    }

    updateBitmap() {
        const picture = this.picture();
        if (picture) {
            const pictureName = picture.name();
            if (this._pictureName !== pictureName) {
                this._pictureName = pictureName;
                this.loadBitmap();
            }
            this.visible = true;
        } else {
            this._pictureName = "";
            this.texture = PIXI.Texture.EMPTY;
            this.visible = false;
        }
    }

    async loadBitmap() {
        const bitmap = await ImageManager.loadPicture(this._pictureName);
        if (bitmap && bitmap.texture) {
            this.texture = bitmap.texture;
        }
    }

    updateOrigin() {
        const picture = this.picture();
        if (picture.origin() === 0) {
            // Upper-left origin
            this.anchor.set(0, 0);
        } else {
            // Center origin
            this.anchor.set(0.5, 0.5);
        }
    }

    updatePosition() {
        const picture = this.picture();
        this.x = Math.round(picture.x());
        this.y = Math.round(picture.y());
    }

    updateScale() {
        const picture = this.picture();
        this.scale.x = picture.scaleX() / 100;
        this.scale.y = picture.scaleY() / 100;
    }

    updateTone() {
        const picture = this.picture();
        const tone = picture.tone();
        if (tone && (tone[0] !== 0 || tone[1] !== 0 || tone[2] !== 0 || tone[3] !== 0)) {
            // Apply color tone filter if needed
            // For now, we'll skip tone implementation as it requires ColorMatrixFilter
            // TODO: Implement tone with PIXI.ColorMatrixFilter
        }
    }

    updateOther() {
        const picture = this.picture();
        this.alpha = picture.opacity() / 255;
        this.blendMode = picture.blendMode();
        this.rotation = (picture.angle() * Math.PI) / 180;
    }
}

console.log('reactor_sprites.js loaded');
