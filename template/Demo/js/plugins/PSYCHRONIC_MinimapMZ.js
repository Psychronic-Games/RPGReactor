//=============================================================================
// PSYCHRONIC_MinimapMZ.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc [v 0.6] Mini Map MZ
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help PSYCHRONIC_MinimapMZ.js
 *
 * This plugin adds a minimap to your game that displays the current map
 * with all visual elements including:
 * - Default RPG Maker parallax backgrounds (including fixed "!" parallaxes)
 * - Multi-parallax plugin layers (if using PSYCHRONIC_MultiParallaxMZ)
 * - All map tile layers
 * - Pictures displayed on the map
 * - All events rendered as tiny sprites (they move in real-time!)
 * - Custom marker icons for events
 * - Player position marker
 *
 * Press the configured toggle key (default "M") to toggle the minimap on/off.
 *
 * Optional: Display the minimap in the main menu with its own size,
 * position, and frame by enabling "Show in Menu" in the plugin parameters.
 * You can also control whether the minimap hides when entering submenus
 * (Equipment, Status, etc.) with the "Menu Selection Hides Map" option,
 * and whether it hides during character selection with "Hide On Character Selection".
 *
 * Event Tags:
 * Add <MM-SHOW> to an event's note OR in a comment on an event page to show default marker.
 * Add <MM-SHOW: MarkerName> to use a custom marker style.
 * Page comments take priority over event notes, allowing different markers per page!
 *
 * Example: <MM-SHOW: Entrance-Up> will use the "Entrance-Up" marker style.
 *
 * Use Cases:
 * - Put <MM-SHOW: QuestAvailable> in Page 1 comments (quest not started)
 * - Put <MM-SHOW: QuestActive> in Page 2 comments (quest in progress)
 * - Put no tag in Page 3 (quest completed - marker disappears!)
 *
 * Plugin Commands:
 * - showMinimap: Show the minimap
 * - hideMinimap: Hide the minimap
 * - toggleMinimap: Toggle minimap visibility
 * - refreshMinimap: Refresh all layers (use after adding/removing parallaxes or pictures)
 * - enableToggle: Enable minimap toggle key
 * - disableToggle: Disable minimap toggle key
 *
 * Compatibility:
 * Works with PSYCHRONIC_MultiParallaxMZ - automatically refreshes when parallaxes change.
 * Supports default RPG Maker MZ parallax backgrounds.
 * Shows pictures displayed via "Show Picture" events.
 *
 * @param minimapWidth
 * @text Minimap Width
 * @type number
 * @min 50
 * @max 2000
 * @default 200
 * @desc Width of the minimap in pixels.
 *
 * @param minimapHeight
 * @text Minimap Height
 * @type number
 * @min 50
 * @max 2000
 * @default 150
 * @desc Height of the minimap in pixels.
 *
 * @param minimapX
 * @text Minimap X Position
 * @type number
 * @min 0
 * @max 2000
 * @default 20
 * @desc X position of the minimap on screen.
 *
 * @param minimapY
 * @text Minimap Y Position
 * @type number
 * @min 0
 * @max 2000
 * @default 20
 * @desc Y position of the minimap on screen.
 *
 * @param frameImage
 * @text Frame Image
 * @type file
 * @dir img/pictures/
 * @default
 * @desc Optional frame/background image for the minimap (from img/pictures/).
 *
 * @param markerColor
 * @text Marker Color
 * @type string
 * @default #00FF00
 * @desc Color of the event markers in hex format.
 *
 * @param playerColor
 * @text Player Color
 * @type string
 * @default #FF0000
 * @desc Color of the player marker in hex format.
 *
 * @param minimapOpacity
 * @text Minimap Opacity
 * @type number
 * @min 0
 * @max 255
 * @default 200
 * @desc Opacity of the minimap (0-255).
 *
 * @param defaultVisible
 * @text Default Visible
 * @type boolean
 * @default true
 * @desc Whether the minimap is visible by default.
 *
 * @param stretchToFit
 * @text Stretch to Fit
 * @type boolean
 * @default false
 * @desc If true, stretches the map to fill the entire minimap frame (may distort aspect ratio).
 *
 * @param toggleKey
 * @text Toggle Key
 * @type select
 * @option Q
 * @value 81
 * @option W
 * @value 87
 * @option E
 * @value 69
 * @option R
 * @value 82
 * @option T
 * @value 84
 * @option A
 * @value 65
 * @option S
 * @value 83
 * @option D
 * @value 68
 * @option F
 * @value 70
 * @option G
 * @value 71
 * @option H
 * @value 72
 * @option J
 * @value 74
 * @option K
 * @value 75
 * @option L
 * @value 76
 * @option Z
 * @value 90
 * @option X
 * @value 88
 * @option C
 * @value 67
 * @option V
 * @value 86
 * @option B
 * @value 66
 * @option N
 * @value 78
 * @option M
 * @value 77
 * @option Tab
 * @value 9
 * @option Space
 * @value 32
 * @default 77
 * @desc Key to toggle the minimap. Default is M (77).
 *
 * @param toggleEnabled
 * @text Toggle Enabled
 * @type boolean
 * @default true
 * @desc Whether the player can toggle the minimap with the toggle key.
 *
 * @param customMarkers
 * @text Custom Markers
 * @type struct<MarkerStyle>[]
 * @default []
 * @desc Define custom marker styles with names and images.
 *
 * @param playerMarkerImage
 * @text Player Marker Image
 * @type file
 * @dir img/system/
 * @default
 * @desc Custom image for player marker (from img/system/). Leave blank to use default dot.
 *
 * @param showInMenu
 * @text Show in Menu
 * @type boolean
 * @default false
 * @desc Whether to show the minimap in the main menu.
 *
 * @param menuMinimapWidth
 * @text Menu Minimap Width
 * @type number
 * @min 50
 * @max 2000
 * @default 150
 * @desc Width of the minimap in the menu (in pixels).
 *
 * @param menuMinimapHeight
 * @text Menu Minimap Height
 * @type number
 * @min 50
 * @max 2000
 * @default 150
 * @desc Height of the minimap in the menu (in pixels).
 *
 * @param menuMinimapX
 * @text Menu Minimap X Position
 * @type number
 * @min 0
 * @max 2000
 * @default 500
 * @desc X position of the minimap in the menu.
 *
 * @param menuMinimapY
 * @text Menu Minimap Y Position
 * @type number
 * @min 0
 * @max 2000
 * @default 100
 * @desc Y position of the minimap in the menu.
 *
 * @param menuFrameImage
 * @text Menu Frame Image
 * @type file
 * @dir img/pictures/
 * @default
 * @desc Optional frame/background image for the menu minimap (from img/pictures/).
 *
 * @param menuSelectionHidesMap
 * @text Menu Selection Hides Map
 * @type boolean
 * @default false
 * @desc If true, minimap hides when entering submenus (Equipment, Status, etc.) and reappears when returning to main menu.
 *
 * @param hideOnCharacterSelection
 * @text Hide On Character Selection
 * @type boolean
 * @default false
 * @desc If true, minimap also hides during character selection screens (when choosing which actor for Equipment, Status, etc.).
 *
 * @command showMinimap
 * @text Show Minimap
 * @desc Shows the minimap.
 *
 * @command hideMinimap
 * @text Hide Minimap
 * @desc Hides the minimap.
 *
 * @command toggleMinimap
 * @text Toggle Minimap
 * @desc Toggles the minimap visibility.
 *
 * @command refreshMinimap
 * @text Refresh Minimap
 * @desc Refreshes the minimap parallax layers. Use after dynamically adding/removing parallaxes.
 *
 * @command enableToggle
 * @text Enable Toggle
 * @desc Enables the minimap toggle key functionality.
 *
 * @command disableToggle
 * @text Disable Toggle
 * @desc Disables the minimap toggle key functionality (minimap can only be controlled via plugin commands).
 */

/*~struct~MarkerStyle:
 * @param name
 * @text Marker Name
 * @type string
 * @desc The name to use in event notes (e.g., "Triangle" for <MM-SHOW: Triangle>)
 *
 * @param image
 * @text Marker Image
 * @type file
 * @dir img/system/
 * @desc The image file to use for this marker (from img/system/)
 */

(() => {
    'use strict';

    const pluginName = 'PSYCHRONIC_MinimapMZ';
    const parameters = PluginManager.parameters(pluginName);

    const minimapWidth = Number(parameters['minimapWidth'] || 200);
    const minimapHeight = Number(parameters['minimapHeight'] || 150);
    const minimapX = Number(parameters['minimapX'] || 20);
    const minimapY = Number(parameters['minimapY'] || 20);
    const frameImage = String(parameters['frameImage'] || '');
    const markerColor = String(parameters['markerColor'] || '#00FF00');
    const playerColor = String(parameters['playerColor'] || '#FF0000');
    const minimapOpacity = Number(parameters['minimapOpacity'] || 200);
    const defaultVisible = parameters['defaultVisible'] === 'true';
    const stretchToFit = parameters['stretchToFit'] === 'true';
    const toggleKey = Number(parameters['toggleKey'] || 77);
    const defaultToggleEnabled = parameters['toggleEnabled'] !== 'false';
    const playerMarkerImage = String(parameters['playerMarkerImage'] || '');

    const showInMenu = parameters['showInMenu'] === 'true';
    const menuMinimapWidth = Number(parameters['menuMinimapWidth'] || 150);
    const menuMinimapHeight = Number(parameters['menuMinimapHeight'] || 150);
    const menuMinimapX = Number(parameters['menuMinimapX'] || 500);
    const menuMinimapY = Number(parameters['menuMinimapY'] || 100);
    const menuFrameImage = String(parameters['menuFrameImage'] || '');
    const menuSelectionHidesMap = parameters['menuSelectionHidesMap'] === 'true';
    const hideOnCharacterSelection = parameters['hideOnCharacterSelection'] === 'true';

    // Global toggle enabled state
    let toggleEnabled = defaultToggleEnabled;

    // Parse custom markers
    const customMarkers = {};
    if (parameters['customMarkers']) {
        const markersArray = JSON.parse(parameters['customMarkers']);
        for (const markerData of markersArray) {
            const marker = JSON.parse(markerData);
            if (marker.name && marker.image) {
                customMarkers[marker.name.toUpperCase()] = marker.image;
            }
        }
    }

    //-----------------------------------------------------------------------------
    // Minimap_Window
    //-----------------------------------------------------------------------------

    class Minimap_Window extends Sprite {
        constructor(config = {}) {
            super();

            // Set config AFTER super() - this is the only way to ensure it's available
            this._config = {
                width: config.width !== undefined ? config.width : minimapWidth,
                height: config.height !== undefined ? config.height : minimapHeight,
                x: config.x !== undefined ? config.x : minimapX,
                y: config.y !== undefined ? config.y : minimapY,
                frameImage: config.frameImage !== undefined ? config.frameImage : frameImage,
                isMenu: config.isMenu || false
            };

            this.x = this._config.x;
            this.y = this._config.y;

            // Initialize $gameSystem minimap state if it doesn't exist
            if ($gameSystem._minimapVisible === undefined) {
                $gameSystem._minimapVisible = defaultVisible;
            }
            // Menu minimap is always visible when shown
            this._visible = this._config.isMenu ? true : $gameSystem._minimapVisible;

            this._frameSprite = null;
            this._backgroundBitmap = null;
            this._mapBitmap = null;
            this._foregroundBitmap = null;
            this._markerSprite = new Sprite();
            this._pulsePhase = 0;
            this._lastMapId = 0;
            this._isRendering = false;
            this._renderDelay = 0;

            this.createBitmap();
            this.createFrame();
            this.addChild(this._markerSprite);

            // Set visibility immediately to prevent flash on first frame
            this.visible = this._visible;
        }

        initialize(bitmap) {
            super.initialize(bitmap);
            // Don't do config-dependent initialization here anymore
        }

        createBitmap() {
            this.bitmap = new Bitmap(this._config.width, this._config.height);
            this.opacity = minimapOpacity;
        }

        createFrame() {
            if (this._config.frameImage && this._config.frameImage.length > 0) {
                this._frameSprite = new Sprite();
                this._frameSprite.bitmap = ImageManager.loadPicture(this._config.frameImage);
                this._frameSprite.x = -10;
                this._frameSprite.y = -10;
                this.addChild(this._frameSprite);
            }
        }

        update() {
            super.update();

            // Menu minimaps are always visible when in menu
            if (this._config.isMenu) {
                this.visible = true;
                this.refresh();
                this._pulsePhase += 0.1;
                return;
            }

            // Don't show map minimap if we're not in Scene_Map
            if (SceneManager._scene.constructor !== Scene_Map) {
                this.visible = false;
                return;
            }

            if (!this._visible) {
                this.visible = false;
                return;
            }
            this.visible = true;
            this.refresh();
            this._pulsePhase += 0.1;
        }

        refresh() {
            if (!$gameMap || !$gamePlayer) return;

            // For menu minimaps, ensure we have a valid map loaded
            if (this._config.isMenu && !$gameMap.mapId()) return;

            // Check if we need to redraw static layers (only when map changes)
            if (this._lastMapId !== $gameMap.mapId()) {
                this._lastMapId = $gameMap.mapId();
                this._hasScrollingParallax = this.checkForScrollingParallaxes();
                this._isRendering = true;
                this._renderDelay = 2; // Wait 2 frames before rendering
                // Clear old cached layers
                this._backgroundBitmap = null;
                this._mapBitmap = null;
                this._foregroundBitmap = null;
            }

            // Defer heavy rendering for a couple frames to prevent freezing
            if (this._isRendering && this._renderDelay > 0) {
                this._renderDelay--;
                return;
            }

            // Perform the heavy rendering after the delay. Keep _isRendering=true
            // until all 9 tileset bitmaps for the current map are actually ready;
            // otherwise drawMap() silently skips any tiles whose source bitmap
            // isn't loaded yet, leaving permanent gaps in the minimap (this was
            // a hidden race in v5, made more visible by v8's slower async init).
            if (this._isRendering && this._renderDelay === 0) {
                if (this._areTilesetsReady()) {
                    this.cacheStaticLayers();
                    this._isRendering = false;
                }
            }

            // Skip drawing if we haven't finished initial render
            if (!this._mapBitmap) return;

            // If we have scrolling parallaxes, update them every frame
            if (this._hasScrollingParallax) {
                this.updateScrollingParallaxes();
            }

            this.bitmap.clear();

            // Draw black background first
            this.bitmap.fillRect(0, 0, this._config.width, this._config.height, '#000000');

            // Draw cached background (parallaxes behind map)
            if (this._backgroundBitmap) {
                const context = this.bitmap.context;
                context.drawImage(this._backgroundBitmap.canvas, 0, 0);
            }

            // Draw cached map tiles
            if (this._mapBitmap) {
                const context = this.bitmap.context;
                context.drawImage(this._mapBitmap.canvas, 0, 0);
            }

            // Draw cached foreground (parallaxes in front + pictures)
            if (this._foregroundBitmap) {
                const context = this.bitmap.context;
                context.drawImage(this._foregroundBitmap.canvas, 0, 0);
            }

            // Draw events (dynamic - every frame)
            this.drawEvents();

            // Draw markers for tagged events
            this.drawMarkers();

            // Draw player
            this.drawPlayer();

            this.bitmap._baseTexture.update();
        }

        checkForScrollingParallaxes() {
            // Check default parallax
            const parallaxName = $gameMap.parallaxName();
            if (parallaxName && parallaxName.charAt(0) !== "!") {
                return true; // Non-fixed parallax = scrolling
            }

            // Check multi-parallax layers
            if ($gameSystem && $gameSystem._extraParallaxes) {
                for (const key in $gameSystem._extraParallaxes) {
                    const layer = $gameSystem._extraParallaxes[key];
                    if (layer && (layer.scrollX !== 0 || layer.scrollY !== 0)) {
                        return true;
                    }
                }
            }

            return false;
        }

        updateScrollingParallaxes() {
            // Clear and redraw parallax layers
            this._backgroundBitmap.clear();
            this._foregroundBitmap.clear();

            this.drawDefaultParallax(this._backgroundBitmap);
            this.drawMultiParallaxLayers(true, this._backgroundBitmap);
            this.drawMultiParallaxLayers(false, this._foregroundBitmap);

            this._backgroundBitmap._baseTexture.update();
            this._foregroundBitmap._baseTexture.update();
        }

        /**
         * Returns true once every tileset bitmap referenced by the current
         * map's tileset has finished loading. Each call to ImageManager.loadTileset
         * is cached, so calling this every frame is cheap -- empty/unused
         * tileset slots (tilesetNames[i] === "") are skipped. Used to gate
         * cacheStaticLayers so the minimap doesn't silently render with
         * half-loaded tilesets and produce wrong/missing tiles.
         */
        _areTilesetsReady() {
            if (!$gameMap) return false;
            const tileset = $gameMap.tileset();
            if (!tileset || !tileset.tilesetNames) return false;
            for (let i = 0; i < 9; i++) {
                const name = tileset.tilesetNames[i];
                if (!name) continue;
                const bitmap = ImageManager.loadTileset(name);
                if (!bitmap || !bitmap.isReady()) return false;
            }
            return true;
        }

        cacheStaticLayers() {
            // Create bitmaps for caching
            this._backgroundBitmap = new Bitmap(this._config.width, this._config.height);
            this._foregroundBitmap = new Bitmap(this._config.width, this._config.height);

            // Draw parallaxes
            this.drawDefaultParallax(this._backgroundBitmap);
            this.drawMultiParallaxLayers(true, this._backgroundBitmap);
            this.drawMultiParallaxLayers(false, this._foregroundBitmap);
            this.drawPictures(this._foregroundBitmap);

            // Update textures
            this._backgroundBitmap._baseTexture.update();
            this._foregroundBitmap._baseTexture.update();

            // Draw map tiles
            this.drawMap();
        }

        getScaleAndOffset() {
            const mapWidth = $gameMap.width();
            const mapHeight = $gameMap.height();
            const tileWidth = $gameMap.tileWidth();
            const tileHeight = $gameMap.tileHeight();

            const fullMapWidth = mapWidth * tileWidth;
            const fullMapHeight = mapHeight * tileHeight;

            let scaleX, scaleY, offsetX, offsetY, scaledMapWidth, scaledMapHeight;

            if (stretchToFit) {
                // Stretch to fill entire minimap - use separate scales for X and Y
                scaleX = this._config.width / fullMapWidth;
                scaleY = this._config.height / fullMapHeight;
                scaledMapWidth = this._config.width;
                scaledMapHeight = this._config.height;
                offsetX = 0;
                offsetY = 0;
            } else {
                // Maintain aspect ratio - use same scale for both
                scaleX = this._config.width / fullMapWidth;
                scaleY = this._config.height / fullMapHeight;
                const minScale = Math.min(scaleX, scaleY);
                scaleX = minScale;
                scaleY = minScale;
                scaledMapWidth = Math.floor(fullMapWidth * minScale);
                scaledMapHeight = Math.floor(fullMapHeight * minScale);
                offsetX = Math.floor((this._config.width - scaledMapWidth) / 2);
                offsetY = Math.floor((this._config.height - scaledMapHeight) / 2);
            }

            return {
                scaleX,
                scaleY,
                offsetX,
                offsetY,
                scaledMapWidth,
                scaledMapHeight
            };
        }

        drawDefaultParallax(targetBitmap) {
            const parallaxName = $gameMap.parallaxName();
            if (!parallaxName) return;

            const parallaxBitmap = ImageManager.loadParallax(parallaxName);
            if (!parallaxBitmap || !parallaxBitmap.isReady()) return;

            const { offsetX, offsetY, scaledMapWidth, scaledMapHeight } = this.getScaleAndOffset();

            const context = targetBitmap.context;
            context.save();

            // Draw the full parallax image once, scaled to the minimap's map area.
            // The minimap shows the whole map at a glance, so reproducing the
            // in-game scroll/tile behavior (which only ever shows a single screen
            // worth at a time) would expose seams and looping. Treating the
            // parallax as a single backdrop matches the player's mental model of
            // it as "the background of this map".
            context.drawImage(
                parallaxBitmap.canvas,
                0, 0, parallaxBitmap.width, parallaxBitmap.height,
                offsetX, offsetY, scaledMapWidth, scaledMapHeight
            );

            context.restore();
            targetBitmap._baseTexture.update();
        }

        drawMultiParallaxLayers(drawBehind, targetBitmap) {
            if (!$gameSystem || !$gameSystem._extraParallaxes) return;

            const parallaxes = $gameSystem._extraParallaxes;
            const layers = [];

            for (const key in parallaxes) {
                const layer = parallaxes[key];
                if (layer) {
                    const isBehind = (layer.zIndex || 0) < 0;
                    if (drawBehind === isBehind) {
                        layers.push(layer);
                    }
                }
            }

            layers.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

            for (const layer of layers) {
                this.drawParallaxLayer(layer, targetBitmap);
            }
        }

        drawParallaxLayer(layer, targetBitmap) {
            if (!layer || !layer.imageName) return;

            const parallaxBitmap = ImageManager.loadParallax(layer.imageName);
            if (!parallaxBitmap || !parallaxBitmap.isReady()) return;

            const { offsetX, offsetY, scaledMapWidth, scaledMapHeight } = this.getScaleAndOffset();

            const context = targetBitmap.context;
            context.save();

            // Same approach as drawDefaultParallax: render the parallax once
            // scaled to the minimap's map area, no tiling/scroll math.
            context.drawImage(
                parallaxBitmap.canvas,
                0, 0, parallaxBitmap.width, parallaxBitmap.height,
                offsetX, offsetY, scaledMapWidth, scaledMapHeight
            );

            context.restore();
            targetBitmap._baseTexture.update();
        }

        drawPictures(targetBitmap) {
            if (!$gameScreen) return;

            const { scaleX, scaleY, offsetX, offsetY } = this.getScaleAndOffset();
            const context = targetBitmap.context;

            for (let i = 1; i <= 100; i++) {
                const picture = $gameScreen.picture(i);
                if (!picture) continue;

                const pictureName = picture.name();
                if (!pictureName) continue;

                const pictureBitmap = ImageManager.loadPicture(pictureName);
                if (!pictureBitmap || !pictureBitmap.isReady()) continue;

                const px = picture.x();
                const py = picture.y();
                const pictureScaleX = picture.scaleX() / 100;
                const pictureScaleY = picture.scaleY() / 100;
                const opacity = picture.opacity();

                const minimapPx = offsetX + (px * scaleX);
                const minimapPy = offsetY + (py * scaleY);
                const scaledPictureWidth = pictureBitmap.width * pictureScaleX * scaleX;
                const scaledPictureHeight = pictureBitmap.height * pictureScaleY * scaleY;

                if (minimapPx + scaledPictureWidth > 0 && minimapPx < this._config.width &&
                    minimapPy + scaledPictureHeight > 0 && minimapPy < this._config.height) {

                    context.save();
                context.globalAlpha = opacity / 255;
                context.drawImage(
                    pictureBitmap.canvas,
                    0, 0, pictureBitmap.width, pictureBitmap.height,
                    minimapPx, minimapPy, scaledPictureWidth, scaledPictureHeight
                );
                context.restore();
                    }
            }

            targetBitmap._baseTexture.update();
        }

        drawMap() {
            const mapWidth = $gameMap.width();
            const mapHeight = $gameMap.height();
            const tileWidth = $gameMap.tileWidth();
            const tileHeight = $gameMap.tileHeight();

            const { scaleX, scaleY, offsetX, offsetY, scaledMapWidth, scaledMapHeight } = this.getScaleAndOffset();

            this._mapBitmap = new Bitmap(this._config.width, this._config.height);

            const fullMapWidth = mapWidth * tileWidth;
            const fullMapHeight = mapHeight * tileHeight;
            const tempBitmap = new Bitmap(fullMapWidth, fullMapHeight);

            const tileset = $gameMap.tileset();
            const tilesetBitmaps = [];
            for (let i = 0; i < 9; i++) {
                tilesetBitmaps[i] = ImageManager.loadTileset(tileset.tilesetNames[i]);
            }

            for (let z = 0; z < 4; z++) {
                for (let y = 0; y < mapHeight; y++) {
                    for (let x = 0; x < mapWidth; x++) {
                        const tileId = $gameMap.tileId(x, y, z);
                        if (tileId > 0) {
                            this.drawTileOnBitmap(tempBitmap, tileId, x * tileWidth, y * tileHeight, tilesetBitmaps);
                        }
                    }
                }
            }

            this._mapBitmap.blt(tempBitmap, 0, 0, fullMapWidth, fullMapHeight,
                                offsetX, offsetY, scaledMapWidth, scaledMapHeight);
        }

        drawTileOnBitmap(bitmap, tileId, dx, dy, tilesetBitmaps) {
            if (Tilemap.isVisibleTile(tileId)) {
                if (Tilemap.isAutotile(tileId)) {
                    this.drawAutotile(bitmap, tileId, dx, dy, tilesetBitmaps);
                } else {
                    this.drawNormalTile(bitmap, tileId, dx, dy, tilesetBitmaps);
                }
            }
        }

        // Mirrors Tilemap.prototype._addAutotile from rmmz_core. The earlier
        // version of this method used a simpler `(tx*2 + qsx)` formula that's
        // off by 2x in X for A2+ and always used FLOOR_AUTOTILE_TABLE -- which
        // happened to look OK for A1-only/water maps in MV but produces wrong
        // tiles (or no tiles at all) for A2 ground / A3 building / A4 wall on
        // any modern MZ map. Now uses the same bx/by/setNumber/autotileTable
        // selection as the corescript so every autotile type renders correctly.
        // Note: A1 water animation is rendered using frame 0 only (no per-frame
        // update on the minimap to avoid GC pressure).
        drawAutotile(bitmap, tileId, dx, dy, tilesetBitmaps) {
            const kind = Tilemap.getAutotileKind(tileId);
            const shape = Tilemap.getAutotileShape(tileId);
            const tx = kind % 8;
            const ty = Math.floor(kind / 8);
            const tileWidth = $gameMap.tileWidth();
            const tileHeight = $gameMap.tileHeight();
            const w1 = tileWidth / 2;
            const h1 = tileHeight / 2;

            let setNumber = 0;
            let bx = 0;
            let by = 0;
            let autotileTable = Tilemap.FLOOR_AUTOTILE_TABLE;

            if (Tilemap.isTileA1(tileId)) {
                const waterSurfaceIndex = 0; // freeze animation on minimap
                setNumber = 0;
                if (kind === 0) {
                    bx = waterSurfaceIndex * 2;
                    by = 0;
                } else if (kind === 1) {
                    bx = waterSurfaceIndex * 2;
                    by = 3;
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
                    } else {
                        bx += 6;
                        if (Tilemap.WATERFALL_AUTOTILE_TABLE) {
                            autotileTable = Tilemap.WATERFALL_AUTOTILE_TABLE;
                        }
                    }
                }
            } else if (Tilemap.isTileA2(tileId)) {
                setNumber = 1;
                bx = tx * 2;
                by = (ty - 2) * 3;
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

            const bitmapSource = tilesetBitmaps[setNumber];
            if (!bitmapSource || !bitmapSource.isReady()) return;

            const table = autotileTable[shape];
            if (!table) return;
            for (let i = 0; i < 4; i++) {
                const qsx = table[i][0];
                const qsy = table[i][1];
                const sx1 = (bx * 2 + qsx) * w1;
                const sy1 = (by * 2 + qsy) * h1;
                const dx1 = dx + (i % 2) * w1;
                const dy1 = dy + Math.floor(i / 2) * h1;
                bitmap.blt(bitmapSource, sx1, sy1, w1, h1, dx1, dy1);
            }
        }

        drawNormalTile(bitmap, tileId, dx, dy, tilesetBitmaps) {
            const tileWidth = $gameMap.tileWidth();
            const tileHeight = $gameMap.tileHeight();
            let setNumber = 0;

            if (Tilemap.isTileA5(tileId)) {
                setNumber = 4;
            } else {
                setNumber = 5 + Math.floor(tileId / 256);
            }

            const bitmapSource = tilesetBitmaps[setNumber];
            if (!bitmapSource || !bitmapSource.isReady()) return;

            const sx = (Math.floor(tileId / 128) % 2 * 8 + (tileId % 8)) * tileWidth;
            const sy = (Math.floor((tileId % 256) / 8) % 16) * tileHeight;

            bitmap.blt(bitmapSource, sx, sy, tileWidth, tileHeight, dx, dy);
        }

        drawEvents() {
            const events = $gameMap.events();
            const { scaleX, scaleY, offsetX, offsetY } = this.getScaleAndOffset();
            const tileWidth = $gameMap.tileWidth();
            const tileHeight = $gameMap.tileHeight();

            for (const event of events) {
                if (!event) continue;

                const characterName = event.characterName();
                if (!characterName) continue;

                const bitmap = ImageManager.loadCharacter(characterName);
                if (!bitmap || !bitmap.isReady()) continue;

                const big = ImageManager.isBigCharacter(characterName);
                const pw = bitmap.width / (big ? 3 : 12);
                const ph = bitmap.height / (big ? 4 : 8);
                const n = big ? 0 : event.characterIndex();
                const sx = ((n % 4) * 3 + 1) * pw;
                const sy = (Math.floor(n / 4) * 4) * ph;

                // Calculate the position of the event's tile in minimap coordinates
                const tileX = event.x * tileWidth;
                const tileY = event.y * tileHeight;
                const minimapTileX = offsetX + (tileX * scaleX);
                const minimapTileY = offsetY + (tileY * scaleY);

                // Calculate the scaled tile size for reference
                const scaledTileWidth = tileWidth * scaleX;
                const scaledTileHeight = tileHeight * scaleY;

                // Scale the event sprite proportionally to tile scaling
                const scaledWidth = pw * scaleX;
                const scaledHeight = ph * scaleY;

                // Center the sprite on the tile (horizontally centered, feet at tile bottom)
                const ex = minimapTileX + (scaledTileWidth / 2);
                const ey = minimapTileY + scaledTileHeight;

                this.bitmap.blt(bitmap, sx, sy, pw, ph,
                                ex - scaledWidth / 2,
                                ey - scaledHeight,
                                scaledWidth, scaledHeight);
            }
        }

        drawMarkers() {
            const events = $gameMap.events();
            const { scaleX, scaleY, offsetX, offsetY } = this.getScaleAndOffset();
            const tileWidth = $gameMap.tileWidth();
            const tileHeight = $gameMap.tileHeight();

            for (const event of events) {
                if (!event) continue;

                // Check active page comments first, then fall back to event note
                let match = null;
                const page = event.page();

                if (page && page.list) {
                    // Search through the active page's command list for comments
                    let commentText = '';
                    for (const command of page.list) {
                        // 108 = Comment, 408 = Comment continuation
                        if (command.code === 108 || command.code === 408) {
                            commentText += command.parameters[0] + '\n';
                        }
                    }
                    // Check if the comments contain the marker tag
                    match = commentText.match(/<MM-SHOW(?::\s*([^>]+))?>/i);
                }

                // If no match in page comments, check the event note
                if (!match) {
                    const note = event.event().note;
                    match = note.match(/<MM-SHOW(?::\s*([^>]+))?>/i);
                }

                if (match) {
                    const ex = offsetX + (event.x * tileWidth * scaleX);
                    const ey = offsetY + (event.y * tileHeight * scaleY);

                    const markerName = match[1] ? match[1].trim().toUpperCase() : null;

                    if (markerName && customMarkers[markerName]) {
                        // Draw custom marker image - FIXED SIZE, not scaled with map
                        const markerImage = customMarkers[markerName];
                        const markerBitmap = ImageManager.loadSystem(markerImage);

                        if (markerBitmap && markerBitmap.isReady()) {
                            // Use original image size (or scale it down slightly if too big)
                            const maxSize = 16; // Maximum marker size in pixels
                            const imgScale = Math.min(1, maxSize / Math.max(markerBitmap.width, markerBitmap.height));
                            const markerWidth = markerBitmap.width * imgScale;
                            const markerHeight = markerBitmap.height * imgScale;

                            this.bitmap.blt(
                                markerBitmap,
                                0, 0, markerBitmap.width, markerBitmap.height,
                                ex - markerWidth / 2, ey - markerHeight / 2,
                                markerWidth, markerHeight
                            );
                        }
                    } else {
                        // Draw default glowing dot - also fixed size
                        const pulse = Math.sin(this._pulsePhase) * 0.3 + 0.7;
                        const radius = 4 * pulse;
                        this.bitmap.drawCircle(ex, ey, radius, markerColor);
                    }
                }
            }
        }

        drawPlayer() {
            if (!$gamePlayer) return;

            const { scaleX, scaleY, offsetX, offsetY } = this.getScaleAndOffset();
            const tileWidth = $gameMap.tileWidth();
            const tileHeight = $gameMap.tileHeight();

            const px = offsetX + ($gamePlayer.x * tileWidth * scaleX);
            const py = offsetY + ($gamePlayer.y * tileHeight * scaleY);

            if (playerMarkerImage) {
                // Draw custom player marker image - FIXED SIZE, not scaled with map
                const playerBitmap = ImageManager.loadSystem(playerMarkerImage);

                if (playerBitmap && playerBitmap.isReady()) {
                    // Use original image size (or scale it down slightly if too big)
                    const maxSize = 16; // Maximum marker size in pixels
                    const imgScale = Math.min(1, maxSize / Math.max(playerBitmap.width, playerBitmap.height));
                    const markerWidth = playerBitmap.width * imgScale;
                    const markerHeight = playerBitmap.height * imgScale;

                    this.bitmap.blt(
                        playerBitmap,
                        0, 0, playerBitmap.width, playerBitmap.height,
                        px - markerWidth / 2, py - markerHeight / 2,
                        markerWidth, markerHeight
                    );
                }
            } else {
                // Draw default red dot - also fixed size
                this.bitmap.drawCircle(px, py, 4, playerColor);
            }
        }

        toggle() {
            this._visible = !this._visible;
            $gameSystem._minimapVisible = this._visible;
        }

        show() {
            this._visible = true;
            $gameSystem._minimapVisible = true;
        }

        hide() {
            this._visible = false;
            $gameSystem._minimapVisible = false;
        }

        refreshParallaxes() {
            this._isRendering = true;
            this._renderDelay = 2;
        }
    }

    // Add drawCircle method to Bitmap
    Bitmap.prototype.drawCircle = function(x, y, radius, color) {
        const context = this.context;
        context.save();
        context.fillStyle = color;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2, false);
        context.fill();
        context.restore();
        this._baseTexture.update();
    };

    //-----------------------------------------------------------------------------
    // Scene_Map
    //-----------------------------------------------------------------------------

    const _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    Scene_Map.prototype.createDisplayObjects = function() {
        _Scene_Map_createDisplayObjects.call(this);
        this.createMinimap();
    };

    Scene_Map.prototype.createMinimap = function() {
        this._minimapWindow = new Minimap_Window();
        this.addChild(this._minimapWindow);
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        this.updateMinimapToggle();
    };

    Scene_Map.prototype.updateMinimapToggle = function() {
        if (toggleEnabled && Input.isTriggered('minimapToggle')) {
            if (this._minimapWindow) {
                this._minimapWindow.toggle();
            }
        }
    };

    // Map the configured key to the minimap toggle action
    Input.keyMapper[toggleKey] = 'minimapToggle';

    //-----------------------------------------------------------------------------
    // Scene_Menu
    //-----------------------------------------------------------------------------

    const _Scene_Menu_create = Scene_Menu.prototype.create;
    Scene_Menu.prototype.create = function() {
        _Scene_Menu_create.call(this);
        if (showInMenu) {
            this.createMenuMinimap();
        }
    };

    Scene_Menu.prototype.createMenuMinimap = function() {
        if (!$gameParty.inBattle() && $gameMap && $gameMap.mapId()) {
            this._menuMinimapWindow = new Minimap_Window({
                width: menuMinimapWidth,
                height: menuMinimapHeight,
                x: menuMinimapX,
                y: menuMinimapY,
                frameImage: menuFrameImage,
                isMenu: true
            });
            this.addChild(this._menuMinimapWindow);
        }
    };

    const _Scene_Menu_update = Scene_Menu.prototype.update;
    Scene_Menu.prototype.update = function() {
        _Scene_Menu_update.call(this);
        if (this._menuMinimapWindow) {
            this._menuMinimapWindow.update();

            // Hide minimap during character selection if option is enabled
            if (hideOnCharacterSelection) {
                // Check if we're in character selection mode (command window is not active)
                if (this._commandWindow && !this._commandWindow.active) {
                    this._menuMinimapWindow.visible = false;
                } else if (this._commandWindow && this._commandWindow.active) {
                    this._menuMinimapWindow.visible = true;
                }
            }
        }
    };

    const _Scene_Menu_stop = Scene_Menu.prototype.stop;
    Scene_Menu.prototype.stop = function() {
        _Scene_Menu_stop.call(this);
        // Hide minimap when entering submenus if option is enabled
        if (menuSelectionHidesMap && this._menuMinimapWindow) {
            this._menuMinimapWindow.visible = false;
        }
    };

    const _Scene_Menu_start = Scene_Menu.prototype.start;
    Scene_Menu.prototype.start = function() {
        _Scene_Menu_start.call(this);
        // Show minimap when returning to main menu if option is enabled
        if (menuSelectionHidesMap && this._menuMinimapWindow) {
            this._menuMinimapWindow.visible = true;
        }
    };

    const _Scene_Menu_terminate = Scene_Menu.prototype.terminate;
    Scene_Menu.prototype.terminate = function() {
        _Scene_Menu_terminate.call(this);
        if (this._menuMinimapWindow) {
            this.removeChild(this._menuMinimapWindow);
            this._menuMinimapWindow = null;
        }
    };

    //-----------------------------------------------------------------------------
    // Plugin Commands
    //-----------------------------------------------------------------------------

    PluginManager.registerCommand(pluginName, "showMinimap", args => {
        if (SceneManager._scene._minimapWindow) {
            SceneManager._scene._minimapWindow.show();
        }
    });

    PluginManager.registerCommand(pluginName, "hideMinimap", args => {
        if (SceneManager._scene._minimapWindow) {
            SceneManager._scene._minimapWindow.hide();
        }
    });

    PluginManager.registerCommand(pluginName, "toggleMinimap", args => {
        if (SceneManager._scene._minimapWindow) {
            SceneManager._scene._minimapWindow.toggle();
        }
    });

    PluginManager.registerCommand(pluginName, "refreshMinimap", args => {
        if (SceneManager._scene._minimapWindow) {
            SceneManager._scene._minimapWindow.refreshParallaxes();
        }
    });

    PluginManager.registerCommand(pluginName, "enableToggle", args => {
        toggleEnabled = true;
    });

    PluginManager.registerCommand(pluginName, "disableToggle", args => {
        toggleEnabled = false;
    });

    //-----------------------------------------------------------------------------
    // Hook into Multi-Parallax Plugin Commands
    //-----------------------------------------------------------------------------

    const _PluginManager_callCommand = PluginManager.callCommand;
    PluginManager.callCommand = function(self, pluginName, commandName, args) {
        _PluginManager_callCommand.call(this, self, pluginName, commandName, args);

        if (pluginName === "PSYCHRONIC_MultiParallaxMZ" &&
            (commandName === "AddParallax" || commandName === "RemoveParallax")) {
            if (SceneManager._scene && SceneManager._scene._minimapWindow) {
                SceneManager._scene._minimapWindow.refreshParallaxes();
            }
            }
    };

})();
