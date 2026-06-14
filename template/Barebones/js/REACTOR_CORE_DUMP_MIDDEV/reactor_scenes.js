//=============================================================================
// reactor_scenes.js
// RPG Reactor Game Engine - Scenes Module
//=============================================================================

//-----------------------------------------------------------------------------
// Scene_Base
// The superclass of all scenes

class Scene_Base {
    constructor() {
        this._started = false;
        this._active = false;
        this._fadeSign = 0;
        this._fadeDuration = 0;
        this._fadeOpacity = 0;
        this._container = null;
    }

    create() {
        this._container = new PIXI.Container();
        Graphics.app.stage.addChild(this._container);
    }

    isActive() {
        return this._active;
    }

    isReady() {
        return true;
    }

    start() {
        this._started = true;
        this._active = true;
    }

    stop() {
        this._active = false;
    }

    isBusy() {
        return this._fadeDuration > 0;
    }

    isStarted() {
        return this._started;
    }

    terminate() {
        if (this._container) {
            Graphics.app.stage.removeChild(this._container);
            this._container.destroy({ children: true });
            this._container = null;
        }
    }

    update() {
        this.updateFade();
        this.updateChildren();
    }

    updateFade() {
        if (this._fadeDuration > 0) {
            const d = this._fadeDuration;
            if (this._fadeSign > 0) {
                this._fadeOpacity -= this._fadeOpacity / d;
            } else {
                this._fadeOpacity += (255 - this._fadeOpacity) / d;
            }
            this._fadeDuration--;
        }
    }

    updateChildren() {
        if (this._container) {
            for (const child of this._container.children) {
                if (child.update) {
                    child.update();
                }
            }
        }
    }

    startFadeIn(duration) {
        this._fadeSign = 1;
        this._fadeDuration = duration || 30;
        this._fadeOpacity = 255;
    }

    startFadeOut(duration) {
        this._fadeSign = -1;
        this._fadeDuration = duration || 30;
        this._fadeOpacity = 0;
    }

    requestUpdate() {
        // Placeholder for scene-specific update requests
    }
}

//-----------------------------------------------------------------------------
// Scene_MenuBase
//
// The superclass of all menu-type scenes (Options, Save, Load, etc)

class Scene_MenuBase extends Scene_Base {
    constructor() {
        super();
        this._windowLayer = null;
        this._backgroundSprite = null;
    }

    create() {
        super.create();
        this.createBackground();
        this.createWindowLayer();
    }

    createBackground() {
        // Use captured snapshot of previous scene with blur filter
        const bgTexture = SceneManager.backgroundTexture();
        if (bgTexture) {
            this._backgroundSprite = new PIXI.Sprite(bgTexture);

            // Apply blur filter
            const blurFilter = new PIXI.BlurFilter();
            blurFilter.strength = 8;
            this._backgroundSprite.filters = [blurFilter];

            // Add dark overlay for better contrast
            this._backgroundSprite.alpha = 0.8;
        } else {
            // Fallback to black background if no snapshot
            const graphics = new PIXI.Graphics();
            graphics.rect(0, 0, Graphics.width, Graphics.height);
            graphics.fill({ color: 0x000000, alpha: 0.6 });
            this._backgroundSprite = new PIXI.Sprite(Graphics.app.renderer.generateTexture(graphics));
        }

        this._container.addChild(this._backgroundSprite);
    }

    createWindowLayer() {
        this._windowLayer = new PIXI.Container();
        if (this._container) {
            this._container.addChild(this._windowLayer);
        }
    }

    addWindow(window) {
        if (this._windowLayer && window._windowContainer) {
            this._windowLayer.addChild(window._windowContainer);
        }
    }

    popScene() {
        SceneManager.pop();
    }

    calcWindowHeight(numLines, selectable) {
        const itemHeight = 48;
        const padding = 12;
        return numLines * itemHeight + padding * 2;
    }
}

//-----------------------------------------------------------------------------
// Scene_Title
// The scene class for the title screen
//
// NOTE: This must be defined before Scene_Boot since Scene_Boot references it

class Scene_Title extends Scene_Base {
    constructor() {
        super();
        this._backgroundSprite = null;
        this._titleSprite1 = null;
        this._titleSprite2 = null;
        this._commandWindow = null;
        this._readyToStart = false;
    }

    async create() {
        super.create();
        this.createBackground();
        await this.createForeground();
        this.createWindowLayer();
        this.createCommandWindow();
        this._readyToStart = true;

        // Listen for resize events to adjust background
        this._resizeHandler = () => {
            // Use requestAnimationFrame to sync with Graphics resize
            requestAnimationFrame(() => {
                this.adjustBackground();
            });
        };
        window.addEventListener('resize', this._resizeHandler);
        document.addEventListener('fullscreenchange', this._resizeHandler);
    }

    isReady() {
        return this._readyToStart && super.isReady();
    }

    start() {
        super.start();
        // Force adjustment after one frame to ensure everything is in sync
        requestAnimationFrame(() => {
            this.adjustBackground();
        });
        this.startFadeIn(30);
        this.playTitleMusic();
    }

    terminate() {
        super.terminate();
        // Clean up resize listener
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            document.removeEventListener('fullscreenchange', this._resizeHandler);
        }
    }

    update() {
        super.update();
        if (!this.isBusy() && this._commandWindow) {
            this._commandWindow.update();
        }
    }

    createBackground() {
        // Create black background
        const graphics = new PIXI.Graphics();
        graphics.rect(0, 0, Graphics.width, Graphics.height);
        graphics.fill(0x000000);
        this._backgroundSprite = new PIXI.Sprite(Graphics.app.renderer.generateTexture(graphics));
        this._container.addChild(this._backgroundSprite);
    }

    async createForeground() {
        const title1Name = $dataSystem.title1Name;
        const title2Name = $dataSystem.title2Name;

        if (title1Name) {
            this._titleSprite1 = await ImageManager.loadTitle1(title1Name);
            this._container.addChild(this._titleSprite1);
        }

        if (title2Name) {
            this._titleSprite2 = await ImageManager.loadTitle2(title2Name);
            this._container.addChild(this._titleSprite2);
        }
    }

    adjustBackground() {
        // Resize black background to fill screen
        if (this._backgroundSprite) {
            this._backgroundSprite.width = Graphics.width;
            this._backgroundSprite.height = Graphics.height;
        }

        // Scale and center title images to fill screen (RMMZ approach)
        if (this._titleSprite1) {
            this.scaleSprite(this._titleSprite1);
            this.centerSprite(this._titleSprite1);
        }
        if (this._titleSprite2) {
            this.scaleSprite(this._titleSprite2);
            this.centerSprite(this._titleSprite2);
        }

        // Update command window placement and size
        if (this._commandWindow && this._commandWindow.updatePlacement) {
            this._commandWindow.updatePlacement();
        }
    }

    scaleSprite(sprite) {
        // Check if sprite and texture are valid
        if (!sprite || !sprite.texture || !sprite.texture.width || sprite.destroyed) {
            return;
        }

        // Get the actual texture dimensions (not the scaled sprite dimensions)
        const textureWidth = sprite.texture.width;
        const textureHeight = sprite.texture.height;

        // Scale to fill the screen (maintains aspect ratio, may crop edges)
        const ratioX = Graphics.width / textureWidth;
        const ratioY = Graphics.height / textureHeight;
        // Use Math.max to ensure image fills screen (RMMZ uses min scale of 1.0)
        const scale = Math.max(ratioX, ratioY, 1.0);
        sprite.scale.x = scale;
        sprite.scale.y = scale;
    }

    centerSprite(sprite) {
        // Comprehensive null/destroyed check
        if (!sprite || sprite.destroyed || !sprite.anchor) {
            return;
        }
        // Center sprite using anchor point
        sprite.x = Graphics.width / 2;
        sprite.y = Graphics.height / 2;
        sprite.anchor.x = 0.5;
        sprite.anchor.y = 0.5;
    }

    createWindowLayer() {
        this._windowLayer = new PIXI.Container();
        this._container.addChild(this._windowLayer);
    }

    createCommandWindow() {
        this._commandWindow = new Window_TitleCommand();
        this._commandWindow.setHandler("newGame", this.commandNewGame.bind(this));
        this._commandWindow.setHandler("continue", this.commandContinue.bind(this));
        this._commandWindow.setHandler("options", this.commandOptions.bind(this));
        this._commandWindow.setHandler("shutdown", this.commandShutdown.bind(this));
        this._windowLayer.addChild(this._commandWindow);
    }

    commandNewGame() {
        DataManager.setupNewGame();
        this._commandWindow.close();
        this.fadeOutAll();
        SceneManager.goto(Scene_Map);
    }

    fadeOutAll() {
        const time = this.slowFadeSpeed() / 60;
        AudioManager.fadeOutBgm(time);
        AudioManager.fadeOutBgs(time);
        AudioManager.fadeOutMe(time);
        this.startFadeOut(this.slowFadeSpeed());
    }

    slowFadeSpeed() {
        return 60;
    }

    commandContinue() {
        // TODO: Implement Scene_Load
        // SceneManager.push(Scene_Load);
    }

    commandOptions() {
        SceneManager.snapForBackground();
        SceneManager.push(Scene_Options);
    }

    commandShutdown() {
        SceneManager.exit();
    }

    playTitleMusic() {
        AudioManager.playBgm($dataSystem.titleBgm);
    }
}

//-----------------------------------------------------------------------------
// Scene_Boot
// The scene class for initializing the game

class Scene_Boot extends Scene_Base {
    constructor() {
        super();
    }

    async create() {
        super.create();
        DataManager.initialize();
        await DataManager.loadDatabase();
        ConfigManager.load();
        Graphics.applySystemSettings();
        this.checkPlayerLocation();
    }

    start() {
        super.start();
        SceneManager.goto(Scene_Title);
    }

    checkPlayerLocation() {
        if (!$dataSystem.startMapId) {
            throw new Error("Player start position is not set");
        }
    }
}

//-----------------------------------------------------------------------------
// Scene_Options
//
// The scene class for the options screen.

class Scene_Options extends Scene_MenuBase {
    constructor() {
        super();
    }

    async create() {
        super.create();
        this.createOptionsWindow();
    }

    terminate() {
        super.terminate();
        ConfigManager.save();
    }

    createOptionsWindow() {
        const rect = this.optionsWindowRect();
        this._optionsWindow = new Window_Options(rect);
        this._optionsWindow.setHandler("cancel", this.popScene.bind(this));
        this.addWindow(this._optionsWindow);
    }

    start() {
        super.start();
        this._optionsWindow.activate();
        this._optionsWindow.select(0);
    }

    update() {
        super.update();
        if (this._optionsWindow) {
            this._optionsWindow.update();
        }
    }

    optionsWindowRect() {
        const n = Math.min(this.maxCommands(), this.maxVisibleCommands());
        const ww = 400;
        const wh = this.calcWindowHeight(n, true);
        const wx = (Graphics.width - ww) / 2;
        const wy = (Graphics.height - wh) / 2;
        return { x: wx, y: wy, width: ww, height: wh };
    }

    maxCommands() {
        return 7; // 3 general options + 4 volume options
    }

    maxVisibleCommands() {
        return 7;
    }
}

//-----------------------------------------------------------------------------
// Scene_Map
// The scene class for the map screen
//
class Scene_Map extends Scene_Base {
    constructor() {
        super();
        this._waitCount = 0;
        this._mapLoaded = false;
        this._transfer = false;
        this._spriteset = null;
    }

    async create() {
        super.create();

        // Check if player is transferring to a new map
        this._transfer = $gamePlayer.isTransferring();

        if (this._transfer) {
            await DataManager.loadMapData($gamePlayer.newMapId());
            $gamePlayer.performTransfer();
        }

        // Create spriteset (includes tilemap and characters)
        await this.createSpriteset();

        // Create message window
        this.createMessageWindow();

        this._mapLoaded = true;
    }

    createMessageWindow() {
        const rect = this.messageWindowRect();
        this._messageWindow = new Window_Message(rect);
        this._container.addChild(this._messageWindow);
        this.createChoiceWindow();
    }

    createChoiceWindow() {
        const rect = { x: 0, y: 0, width: 400, height: 200 };
        this._choiceListWindow = new Window_ChoiceList(rect);
        this._choiceListWindow.setMessageWindow(this._messageWindow);
        this._messageWindow.setChoiceListWindow(this._choiceListWindow);
        this._container.addChild(this._choiceListWindow);
    }

    messageWindowRect() {
        const ww = Graphics.width;
        // Height should match face height (144) + padding (24)
        const wh = 168;
        const wx = 0;
        const wy = 0;
        return { x: wx, y: wy, width: ww, height: wh };
    }

    calcWindowHeight(numLines, selectable) {
        const itemHeight = 48;
        const padding = 12;
        return numLines * itemHeight + padding * 2;
    }

    async createSpriteset() {
        this._spriteset = new Spriteset_Map();
        this._container.addChild(this._spriteset);

        // Wait for tileset to load
        await this._spriteset.loadTileset();

        // Setup touch/mouse input for destination
        this.setupTouch();
    }

    setupTouch() {
        // Add click listener to the container for mouse/touch movement
        this._container.interactive = true;
        this._container.on('pointerdown', this.onMapTouch.bind(this));
    }

    onMapTouch(event) {
        const x = event.data.global.x;
        const y = event.data.global.y;

        // Convert screen coordinates to tile coordinates, accounting for camera scroll
        const tileX = Math.floor($gameMap.displayX() + x / 48);
        const tileY = Math.floor($gameMap.displayY() + y / 48);

        // Check if the position is valid
        if ($gameMap.isValid(tileX, tileY)) {
            $gameTemp.setDestination(tileX, tileY);
        }
    }

    start() {
        super.start();
        SceneManager.clearStack();
        this.startFadeIn(this.fadeSpeed(), false);
    }

    update() {
        super.update();

        // Update game systems
        const active = this.isActive();
        $gameTimer.update(active);
        $gameScreen.update();

        // Update message window FIRST so it can consume input before player checks it
        if (this._messageWindow) {
            this._messageWindow.update();
        }

        // Update choice window
        if (this._choiceListWindow) {
            this._choiceListWindow.update();
        }

        // Update game map and events
        if ($gameMap) {
            $gameMap.update(active);
        }

        // Update game player
        $gamePlayer.update(active);

        // Update spriteset
        if (this._spriteset) {
            this._spriteset.update();
        }

        // Allow pressing Escape or Cancel to return to title (but not during messages)
        if (!$gameMessage.isBusy() && (Input.isTriggered('cancel') || Input.isTriggered('escape'))) {
            this.returnToTitle();
        }
    }

    returnToTitle() {
        this.fadeOutAll();
        SceneManager.goto(Scene_Title);
    }

    fadeOutAll() {
        const time = this.slowFadeSpeed() / 60;
        AudioManager.fadeOutBgm(time);
        AudioManager.fadeOutBgs(time);
        AudioManager.fadeOutMe(time);
        this.startFadeOut(this.slowFadeSpeed());
    }

    slowFadeSpeed() {
        return 60;
    }

    fadeSpeed() {
        return 24;
    }
}

console.log('reactor_scenes.js loaded');
