/*:
 * @target MZ
 * @plugindesc Display picture-based choices anywhere on screen with smooth zoom transitions and restore default positioning after done.
 * @author
 * @url
 * @help
 * =============================================================================
 * PSYCHRONIC_PictureChoices
 * =============================================================================
 *
 * HOW TO USE:
 * - Use SetChoiceImage or SetMultipleChoiceImages before Show Choices if you want picture-based choices.
 * - If no picture choices are set, normal behavior applies.
 * - After the picture choices are done, the plugin restores $gameMessage settings and calls updatePlacement().
 *
 * @command SetChoiceImage
 * @text Set Choice Image
 * @desc Assign image to a single choice with optional scale/speed.
 *
 * @arg choiceIndex
 * @type number
 * @min 1
 * @desc Choice number (1-based).
 *
 * @arg pictureName
 * @type file
 * @dir img/pictures
 * @desc Image filename (no extension).
 *
 * @arg xOffset
 * @type number
 * @default 0
 *
 * @arg yOffset
 * @type number
 * @default 0
 *
 * @arg selectedScale
 * @type number
 * @decimals 2
 * @default 1.1
 *
 * @arg transitionSpeed
 * @type number
 * @decimals 2
 * @min 0.01
 * @max 1
 * @default 0.1
 *
 * @command SetMultipleChoiceImages
 * @text Set Multiple Choice Images
 * @desc Assign images and parameters to multiple choices.
 *
 * @arg choices
 * @type struct<ChoiceImage>[]
 * @desc A list of choice image entries.
 */

/*~struct~ChoiceImage:
 * @param choiceIndex
 * @type number
 * @min 1
 * @desc 1-based choice index.
 *
 * @param pictureName
 * @type file
 * @dir img/pictures
 *
 * @param xOffset
 * @type number
 * @default 0
 *
 * @param yOffset
 * @type number
 * @default 0
 *
 * @param selectedScale
 * @type number
 * @decimals 2
 * @default 1.1
 *
 * @param transitionSpeed
 * @type number
 * @decimals 2
 * @min 0.01
 * @max 1
 * @default 0.1
 */

var Imported = Imported || {};
Imported.PSYCHRONIC_PictureChoices = true;

var PSYCHRONIC_PictureChoices = PSYCHRONIC_PictureChoices || {};
PSYCHRONIC_PictureChoices.choiceImages = [];

PluginManager.registerCommand("PSYCHRONIC_PictureChoices", "SetChoiceImage", args => {
    const choiceIndex = Number(args.choiceIndex) - 1;
    const pictureName = String(args.pictureName || "");
    const xPos = Number(args.xOffset || 0);
    const yPos = Number(args.yOffset || 0);
    const selectedScale = args.selectedScale ? Number(args.selectedScale) : 1.1;
    const transitionSpeed = args.transitionSpeed ? Number(args.transitionSpeed) : 0.1;
    PSYCHRONIC_PictureChoices.setChoiceImage(choiceIndex, pictureName, xPos, yPos, selectedScale, transitionSpeed);
});

PluginManager.registerCommand("PSYCHRONIC_PictureChoices", "SetMultipleChoiceImages", args => {
    const dataArray = JSON.parse(args.choices || "[]");
    dataArray.forEach(entry => {
        const entryObj = JSON.parse(entry);
        const choiceIndex = Number(entryObj.choiceIndex) - 1;
        const pictureName = String(entryObj.pictureName || "");
        const xPos = Number(entryObj.xOffset || 0);
        const yPos = Number(entryObj.yOffset || 0);
        const selectedScale = entryObj.selectedScale ? Number(entryObj.selectedScale) : 1.1;
        const transitionSpeed = entryObj.transitionSpeed ? Number(entryObj.transitionSpeed) : 0.1;
        PSYCHRONIC_PictureChoices.setChoiceImage(choiceIndex, pictureName, xPos, yPos, selectedScale, transitionSpeed);
    });
});

PSYCHRONIC_PictureChoices.setChoiceImage = function(index, name, x, y, selectedScale, transitionSpeed) {
    if (!PSYCHRONIC_PictureChoices.choiceImages) {
        PSYCHRONIC_PictureChoices.choiceImages = [];
    }
    PSYCHRONIC_PictureChoices.choiceImages[index] = {
        name: name,
        x: x,
        y: y,
        bitmap: null,
        sprite: null,
        selectedScale: selectedScale,
        transitionSpeed: transitionSpeed
    };
};

(() => {
    const NORMAL_SCALE = 1.0;
    const offScreenX = Graphics.width * 3;
    const offScreenY = Graphics.height * 3;

    let originalMessageBackground = null;
    let originalMessagePosition = null;
    let originalChoiceBackground = null;
    let originalChoicePosition = null;

    const _Window_ChoiceList_initialize = Window_ChoiceList.prototype.initialize;
    Window_ChoiceList.prototype.initialize = function() {
        this._choiceSprites = [];
        _Window_ChoiceList_initialize.call(this);
        // Add new properties for animation
        this._animateSelected = null;       // Which choice index is currently being animated on selection
        this._animationDuration = 0;        // How long the animation lasts
    };

    const _Window_ChoiceList_start = Window_ChoiceList.prototype.start;
    Window_ChoiceList.prototype.start = function() {
        if (originalMessageBackground === null) {
            originalMessageBackground = $gameMessage.background();
        }
        if (originalMessagePosition === null) {
            originalMessagePosition = $gameMessage.positionType();
        }
        if (originalChoiceBackground === null) {
            originalChoiceBackground = $gameMessage.choiceBackground();
        }
        if (originalChoicePosition === null) {
            originalChoicePosition = $gameMessage.choicePositionType();
        }

        _Window_ChoiceList_start.call(this);
        this.createChoiceSprites();

        const hasImages = PSYCHRONIC_PictureChoices.choiceImages.some(d => d && d.name);
        const messageWindow = SceneManager._scene ? SceneManager._scene._messageWindow : null;

        if (hasImages) {
            // Move off-screen
            this.opacity = 0;
            this.contentsOpacity = 0;
            this.setBackgroundType(2);
            if (this._windowFrameSprite) this._windowFrameSprite.visible = false;
            if (this._windowBackSprite) this._windowBackSprite.visible = false;
            this.x = offScreenX;
            this.y = offScreenY;

            $gameMessage.setBackground(2);
            $gameMessage.setChoiceBackground(2);

            if (messageWindow) {
                messageWindow.opacity = 0;
                messageWindow.contentsOpacity = 0;
                messageWindow.setBackgroundType(2);
                if (messageWindow._windowFrameSprite) messageWindow._windowFrameSprite.visible = false;
                if (messageWindow._windowBackSprite) messageWindow._windowBackSprite.visible = false;
                messageWindow.x = offScreenX;
                messageWindow.y = offScreenY;
            }
        }

        this.activate();
    };

    Window_ChoiceList.prototype.createChoiceSprites = function() {
        this.clearChoiceSprites();
        if (PSYCHRONIC_PictureChoices.choiceImages && PSYCHRONIC_PictureChoices.choiceImages.length > 0) {
            for (let i = 0; i < this._list.length; i++) {
                const data = PSYCHRONIC_PictureChoices.choiceImages[i];
                if (data && data.name) {
                    data.bitmap = ImageManager.loadPicture(data.name);
                    const sprite = new Sprite(data.bitmap);
                    sprite.anchor.set(0.5, 0.5);
                    sprite.x = data.x;
                    sprite.y = data.y;
                    sprite.scale.set(NORMAL_SCALE);
                    sprite.opacity = 255;
                    SceneManager._scene.addChild(sprite);
                    data.sprite = sprite;
                } else {
                    this._choiceSprites[i] = null;
                }
            }
        }
    };

    Window_ChoiceList.prototype.clearChoiceSprites = function() {
        if (this._choiceSprites && this._choiceSprites.length > 0) {
            for (const sprite of this._choiceSprites) {
                if (sprite && SceneManager._scene && SceneManager._scene.removeChild) {
                    SceneManager._scene.removeChild(sprite);
                }
            }
        }
        this._choiceSprites = [];
    };

    const _Window_ChoiceList_select = Window_ChoiceList.prototype.select;
    Window_ChoiceList.prototype.select = function(index) {
        _Window_ChoiceList_select.call(this, index);
    };

    const _Window_ChoiceList_update = Window_ChoiceList.prototype.update;
    Window_ChoiceList.prototype.update = function() {
        _Window_ChoiceList_update.call(this);
        this.updateChoiceSpritesScale();
        if (!this._animateSelected) {
            // Only update hover if we are not animating a selection
            this.updateHoverSelection();
        }
        this.updateSelectionAnimation();
    };

    Window_ChoiceList.prototype.updateChoiceSpritesScale = function() {
        if (!PSYCHRONIC_PictureChoices.choiceImages) return;
        for (let i = 0; i < PSYCHRONIC_PictureChoices.choiceImages.length; i++) {
            const data = PSYCHRONIC_PictureChoices.choiceImages[i];
            if (data && data.sprite) {
                const targetScale = (i === this.index()) ? data.selectedScale : NORMAL_SCALE;
                const speed = data.transitionSpeed;
                data.sprite.scale.x += (targetScale - data.sprite.scale.x) * speed;
                data.sprite.scale.y += (targetScale - data.sprite.scale.y) * speed;
            }
        }
    };

    Window_ChoiceList.prototype.updateHoverSelection = function() {
        if (!this.isOpenAndActive()) return;
        if (!PSYCHRONIC_PictureChoices.choiceImages || !PSYCHRONIC_PictureChoices.choiceImages.some(d => d && d.name)) {
            return;
        }
        const hoveredIndex = this.spriteHitTest(TouchInput.x, TouchInput.y);
        if (hoveredIndex >= 0 && hoveredIndex !== this.index()) {
            this.select(hoveredIndex);
        }
    };

    // Animation logic: If _animateSelected is set, we are animating the chosen sprite.
Window_ChoiceList.prototype.updateSelectionAnimation = function() {
    // If there's no selected choice to animate, do nothing
    if (this._animateSelected === null) return;

    // We'll animate all sprites over the same duration
    const framesLeft = this._animationDuration;
    if (framesLeft <= 0) {
        // Once the timer is done, finalize
        this.finishSelectionAnimation();
        return;
    }

    // For each choice image, handle fade (and scale if selected)
    for (let i = 0; i < PSYCHRONIC_PictureChoices.choiceImages.length; i++) {
        const data = PSYCHRONIC_PictureChoices.choiceImages[i];
        if (!data || !data.sprite) continue; // skip nonexistent sprites

        const sprite = data.sprite;
        // Fade out by about 8.5 per frame for a 30-frame total fade (255 / 30 ≈ 8.5)
        sprite.opacity = Math.max(0, sprite.opacity - 8.5);

        // If this is the selected choice, also scale it up
        if (i === this._animateSelected) {
            sprite.scale.x += 0.02; // Scale up a bit each frame
            sprite.scale.y += 0.02;
        }
    }

    this._animationDuration--;
};

    Window_ChoiceList.prototype.finishSelectionAnimation = function() {
        // Restore sprite if needed or just leave it
        // Finalize the choice now by calling processOk()
        this._animateSelected = null;
        this._animationDuration = 0;
        this.processOk();
    };

    const _Window_ChoiceList_processOk = Window_ChoiceList.prototype.processOk;
    Window_ChoiceList.prototype.processOk = function() {
        // If no picture images, use default behavior
        if (!PSYCHRONIC_PictureChoices.choiceImages || !PSYCHRONIC_PictureChoices.choiceImages.some(d => d && d.name)) {
            _Window_ChoiceList_processOk.call(this);
            return;
        }

        // If we are already animating a choice, don't start a new one
        if (this._animateSelected !== null) return;

        // Start the animation for the currently selected choice
        this._animateSelected = this.index();
        this._animationDuration = 30; // Same duration as in touch processing

        // We'll call the original processOk in finishSelectionAnimation after animation completes
    };

    // Fix the finishSelectionAnimation method to properly call the original processOk
    Window_ChoiceList.prototype.finishSelectionAnimation = function() {
        this._animateSelected = null;
        this._animationDuration = 0;

        // Store the selected index before calling processOk
        const selectedIndex = this.index();

        // Call the original processOk implementation
        _Window_ChoiceList_processOk.call(this);

        // Ensure the choice is properly processed
        this.callOkHandler();
    };

    function restoreDefaultsAndReposition(windowChoiceList) {
        // Restore $gameMessage parameters
        if (originalMessageBackground !== null) {
            $gameMessage.setBackground(originalMessageBackground);
        }
        if (originalMessagePosition !== null) {
            $gameMessage.setPositionType(originalMessagePosition);
        }
        if (originalChoiceBackground !== null) {
            $gameMessage.setChoiceBackground(originalChoiceBackground);
        }
        if (originalChoicePosition !== null) {
            $gameMessage.setChoicePositionType(originalChoicePosition);
        }

        const scene = SceneManager._scene;
        const messageWindow = scene && scene._messageWindow ? scene._messageWindow : null;

        if (messageWindow && messageWindow.updatePlacement) {
            messageWindow.updatePlacement();
        }
        if (windowChoiceList && windowChoiceList.updatePlacement) {
            windowChoiceList.updatePlacement();
        }

        originalMessageBackground = null;
        originalMessagePosition = null;
        originalChoiceBackground = null;
        originalChoicePosition = null;
    }

    const _Window_ChoiceList_close = Window_ChoiceList.prototype.close;
    Window_ChoiceList.prototype.close = function() {
        _Window_ChoiceList_close.call(this);
        this.clearChoiceSprites();
        PSYCHRONIC_PictureChoices.choiceImages = [];
        restoreDefaultsAndReposition(this);
    };

    const _Window_ChoiceList_terminateMessage = Window_ChoiceList.prototype.terminateMessage;
    Window_ChoiceList.prototype.terminateMessage = function() {
        _Window_ChoiceList_terminateMessage.call(this);
        this.clearChoiceSprites();
        PSYCHRONIC_PictureChoices.choiceImages = [];
        restoreDefaultsAndReposition(this);
    };

    const _Window_ChoiceList_processTouch = Window_ChoiceList.prototype.processTouch || Window_Selectable.prototype.processTouch;

    Window_ChoiceList.prototype.processTouch = function() {
        // If no picture images, use default behavior
        if (!PSYCHRONIC_PictureChoices.choiceImages || !PSYCHRONIC_PictureChoices.choiceImages.some(d => d && d.name)) {
            _Window_ChoiceList_processTouch.call(this);
            return;
        }

        // If we are animating a choice already, do not allow further clicks
        if (this._animateSelected !== null) return;

        if (!this.isOpenAndActive()) return;

        if (TouchInput.isTriggered()) {
            const hitIndex = this.spriteHitTest(TouchInput.x, TouchInput.y);
            if (hitIndex >= 0) {
                // Start animation instead of calling processOk() immediately
                this._animateSelected = hitIndex;
                this._animationDuration = 30; // Adjust as desired
            }
        }
    };

    Window_ChoiceList.prototype.spriteHitTest = function(globalX, globalY) {
        if (!PSYCHRONIC_PictureChoices.choiceImages) return -1;
        for (let i = 0; i < PSYCHRONIC_PictureChoices.choiceImages.length; i++) {
            const data = PSYCHRONIC_PictureChoices.choiceImages[i];
            if (data && data.sprite && data.sprite.bitmap && data.sprite.bitmap.isReady()) {
                const sprite = data.sprite;
                const halfWidth = sprite.width * sprite.scale.x / 2;
                const halfHeight = sprite.height * sprite.scale.y / 2;
                const left = sprite.x - halfWidth;
                const right = sprite.x + halfWidth;
                const top = sprite.y - halfHeight;
                const bottom = sprite.y + halfHeight;
                if (globalX >= left && globalX <= right && globalY >= top && globalY <= bottom) {
                    return i;
                }
            }
        }
        return -1;
    };
})();
