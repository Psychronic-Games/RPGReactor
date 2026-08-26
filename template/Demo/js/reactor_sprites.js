//=============================================================================
// reactor_sprites.js v1.7.0
//=============================================================================

//-----------------------------------------------------------------------------
// Sprite_Clickable
//
// The sprite class with click handling functions.

function Sprite_Clickable() {
    this.initialize(...arguments);
}

Sprite_Clickable.prototype = Object.create(Sprite.prototype);
Sprite_Clickable.prototype.constructor = Sprite_Clickable;

Sprite_Clickable.prototype.initialize = function() {
    Sprite.prototype.initialize.call(this);
    this._pressed = false;
    this._hovered = false;
};

Sprite_Clickable.prototype.update = function() {
    Sprite.prototype.update.call(this);
    this.processTouch();
};

Sprite_Clickable.prototype.processTouch = function() {
    if (this.isClickEnabled()) {
        if (this.isBeingTouched()) {
            if (!this._hovered && TouchInput.isHovered()) {
                this._hovered = true;
                this.onMouseEnter();
            }
            if (TouchInput.isTriggered()) {
                this._pressed = true;
                this.onPress();
            }
        } else {
            if (this._hovered) {
                this.onMouseExit();
            }
            this._pressed = false;
            this._hovered = false;
        }
        if (this._pressed && TouchInput.isReleased()) {
            this._pressed = false;
            this.onClick();
        }
    } else {
        this._pressed = false;
        this._hovered = false;
    }
};

Sprite_Clickable.prototype.isPressed = function() {
    return this._pressed;
};

Sprite_Clickable.prototype.isClickEnabled = function() {
    return this.worldVisible;
};

Sprite_Clickable.prototype.isBeingTouched = function() {
    const touchPos = new Point(TouchInput.x, TouchInput.y);
    const localPos = this.worldTransform.applyInverse(touchPos);
    return this.hitTest(localPos.x, localPos.y);
};

Sprite_Clickable.prototype.hitTest = function(x, y) {
    const rect = new Rectangle(
        -this.anchor.x * this.width,
        -this.anchor.y * this.height,
        this.width,
        this.height
    );
    return rect.contains(x, y);
};

Sprite_Clickable.prototype.onMouseEnter = function() {
    //
};

Sprite_Clickable.prototype.onMouseExit = function() {
    //
};

Sprite_Clickable.prototype.onPress = function() {
    //
};

Sprite_Clickable.prototype.onClick = function() {
    //
};

//-----------------------------------------------------------------------------
// Sprite_Button
//
// The sprite for displaying a button.

function Sprite_Button() {
    this.initialize(...arguments);
}

Sprite_Button.prototype = Object.create(Sprite_Clickable.prototype);
Sprite_Button.prototype.constructor = Sprite_Button;

Sprite_Button.prototype.initialize = function(buttonType) {
    Sprite_Clickable.prototype.initialize.call(this);
    this._buttonType = buttonType;
    this._clickHandler = null;
    this._coldFrame = null;
    this._hotFrame = null;
    this.setupFrames();
};

Sprite_Button.prototype.setupFrames = function() {
    const data = this.buttonData();
    const x = data.x * this.blockWidth();
    const width = data.w * this.blockWidth();
    const height = this.blockHeight();
    this.loadButtonImage();
    this.setColdFrame(x, 0, width, height);
    this.setHotFrame(x, height, width, height);
    this.updateFrame();
    this.updateOpacity();
};

Sprite_Button.prototype.blockWidth = function() {
    return 48;
};

Sprite_Button.prototype.blockHeight = function() {
    return 48;
};

Sprite_Button.prototype.loadButtonImage = function() {
    this.bitmap = ImageManager.loadSystem("ButtonSet");
};

Sprite_Button.prototype.buttonData = function() {
    const buttonTable = {
        cancel: { x: 0, w: 2 },
        pageup: { x: 2, w: 1 },
        pagedown: { x: 3, w: 1 },
        down: { x: 4, w: 1 },
        up: { x: 5, w: 1 },
        down2: { x: 6, w: 1 },
        up2: { x: 7, w: 1 },
        ok: { x: 8, w: 2 },
        menu: { x: 10, w: 1 }
    };
    return buttonTable[this._buttonType];
};

Sprite_Button.prototype.update = function() {
    Sprite_Clickable.prototype.update.call(this);
    this.checkBitmap();
    this.updateFrame();
    this.updateOpacity();
    this.processTouch();
};

Sprite_Button.prototype.checkBitmap = function() {
    if (this.bitmap.isReady() && this.bitmap.width < this.blockWidth() * 11) {
        // Probably MV image is used
        throw new Error("ButtonSet image is too small");
    }
};

Sprite_Button.prototype.updateFrame = function() {
    const frame = this.isPressed() ? this._hotFrame : this._coldFrame;
    if (frame) {
        this.setFrame(frame.x, frame.y, frame.width, frame.height);
    }
};

Sprite_Button.prototype.updateOpacity = function() {
    this.opacity = this._pressed ? 255 : 192;
};

Sprite_Button.prototype.setColdFrame = function(x, y, width, height) {
    this._coldFrame = new Rectangle(x, y, width, height);
};

Sprite_Button.prototype.setHotFrame = function(x, y, width, height) {
    this._hotFrame = new Rectangle(x, y, width, height);
};

Sprite_Button.prototype.setClickHandler = function(method) {
    this._clickHandler = method;
};

Sprite_Button.prototype.onClick = function() {
    if (this._clickHandler) {
        this._clickHandler();
    } else {
        Input.virtualClick(this._buttonType);
    }
};

//-----------------------------------------------------------------------------
// Sprite_Character
//
// The sprite for displaying a character.

function Sprite_Character() {
    this.initialize(...arguments);
}

Sprite_Character.prototype = Object.create(Sprite.prototype);
Sprite_Character.prototype.constructor = Sprite_Character;

Sprite_Character.prototype.initialize = function(character) {
    Sprite.prototype.initialize.call(this);
    this.initMembers();
    this.setCharacter(character);
};

Sprite_Character.prototype.initMembers = function() {
    this.anchor.x = 0.5;
    this.anchor.y = 1;
    this._character = null;
    this._balloonDuration = 0;
    this._tilesetId = 0;
    this._upperBody = null;
    this._lowerBody = null;
};

Sprite_Character.prototype.setCharacter = function(character) {
    this._character = character;
};

Sprite_Character.prototype.checkCharacter = function(character) {
    return this._character === character;
};

Sprite_Character.prototype.update = function() {
    // Set per-frame by Spriteset_Map.updateOffscreenCulling: sprites far
    // outside the viewport skip their entire update and don't render.
    // updateVisibility recomputes `visible` on the first un-culled frame,
    // so hiding here never sticks.
    if (this._rrCulled) {
        this.visible = false;
        return;
    }
    Sprite.prototype.update.call(this);
    this.updateBitmap();
    this.updateFrame();
    this.updatePosition();
    this.updateOther();
    this.updateVisibility();
};

Sprite_Character.prototype.updateVisibility = function() {
    Sprite.prototype.updateVisibility.call(this);
    if (this.isEmptyCharacter() || this._character.isTransparent()) {
        this.visible = false;
    }
};

Sprite_Character.prototype.isTile = function() {
    return this._character.isTile();
};

Sprite_Character.prototype.isObjectCharacter = function() {
    return this._character.isObjectCharacter();
};

Sprite_Character.prototype.isEmptyCharacter = function() {
    return this._tileId === 0 && !this._characterName;
};

Sprite_Character.prototype.tilesetBitmap = function(tileId) {
    const tileset = $gameMap.tileset();
    const setNumber = 5 + Math.floor(tileId / 256);
    return ImageManager.loadTileset(tileset.tilesetNames[setNumber]);
};

Sprite_Character.prototype.updateBitmap = function() {
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
};

Sprite_Character.prototype.isImageChanged = function() {
    return (
        this._tilesetId !== $gameMap.tilesetId() ||
        this._tileId !== this._character.tileId() ||
        this._characterName !== this._character.characterName() ||
        this._characterIndex !== this._character.characterIndex()
    );
};

Sprite_Character.prototype.setTileBitmap = function() {
    this.bitmap = this.tilesetBitmap(this._tileId);
};

Sprite_Character.prototype.setCharacterBitmap = function() {
    this.bitmap = ImageManager.loadCharacter(this._characterName);
    this._isBigCharacter = ImageManager.isBigCharacter(this._characterName);
};

Sprite_Character.prototype.updateFrame = function() {
    if (this._tileId > 0) {
        this.updateTileFrame();
    } else {
        this.updateCharacterFrame();
    }
};

Sprite_Character.prototype.updateTileFrame = function() {
    const tileId = this._tileId;
    const pw = this.patternWidth();
    const ph = this.patternHeight();
    const sx = ((Math.floor(tileId / 128) % 2) * 8 + (tileId % 8)) * pw;
    const sy = (Math.floor((tileId % 256) / 8) % 16) * ph;
    this.setFrame(sx, sy, pw, ph);
};

Sprite_Character.prototype.updateCharacterFrame = function() {
    const pw = this.patternWidth();
    const ph = this.patternHeight();
    const sx = (this.characterBlockX() + this.characterPatternX()) * pw;
    const sy = (this.characterBlockY() + this.characterPatternY()) * ph;
    this.updateHalfBodySprites();
    if (this._bushDepth > 0) {
        const d = this._bushDepth;
        this._upperBody.setFrame(sx, sy, pw, ph - d);
        this._lowerBody.setFrame(sx, sy + ph - d, pw, d);
        this.setFrame(sx, sy, 0, ph);
    } else {
        this.setFrame(sx, sy, pw, ph);
    }
};

Sprite_Character.prototype.characterBlockX = function() {
    if (this._isBigCharacter) {
        return 0;
    } else {
        const index = this._character.characterIndex();
        return (index % 4) * 3;
    }
};

Sprite_Character.prototype.characterBlockY = function() {
    if (this._isBigCharacter) {
        return 0;
    } else {
        const index = this._character.characterIndex();
        return Math.floor(index / 4) * 4;
    }
};

Sprite_Character.prototype.characterPatternX = function() {
    return this._character.pattern();
};

Sprite_Character.prototype.characterPatternY = function() {
    return (this._character.direction() - 2) / 2;
};

Sprite_Character.prototype.patternWidth = function() {
    if (this._tileId > 0) {
        return $gameMap.tileWidth();
    } else if (this._isBigCharacter) {
        return this.bitmap.width / 3;
    } else {
        return this.bitmap.width / 12;
    }
};

Sprite_Character.prototype.patternHeight = function() {
    if (this._tileId > 0) {
        return $gameMap.tileHeight();
    } else if (this._isBigCharacter) {
        return this.bitmap.height / 4;
    } else {
        return this.bitmap.height / 8;
    }
};

Sprite_Character.prototype.updateHalfBodySprites = function() {
    if (this._bushDepth > 0) {
        this.createHalfBodySprites();
        this._upperBody.bitmap = this.bitmap;
        this._upperBody.visible = true;
        this._upperBody.y = -this._bushDepth;
        this._lowerBody.bitmap = this.bitmap;
        this._lowerBody.visible = true;
        this._upperBody.setBlendColor(this.getBlendColor());
        this._lowerBody.setBlendColor(this.getBlendColor());
        this._upperBody.setColorTone(this.getColorTone());
        this._lowerBody.setColorTone(this.getColorTone());
        this._upperBody.blendMode = this.blendMode;
        this._lowerBody.blendMode = this.blendMode;
    } else if (this._upperBody) {
        this._upperBody.visible = false;
        this._lowerBody.visible = false;
    }
};

Sprite_Character.prototype.createHalfBodySprites = function() {
    if (!this._upperBody) {
        this._upperBody = new Sprite();
        this._upperBody.anchor.x = 0.5;
        this._upperBody.anchor.y = 1;
        this.addChild(this._upperBody);
    }
    if (!this._lowerBody) {
        this._lowerBody = new Sprite();
        this._lowerBody.anchor.x = 0.5;
        this._lowerBody.anchor.y = 1;
        this._lowerBody.opacity = 128;
        this.addChild(this._lowerBody);
    }
};

Sprite_Character.prototype.updatePosition = function() {
    if (this.updateReactor3DPosition()) return;
    this.x = this._character.screenX();
    this.y = this._character.screenY();
    this.z = this._character.screenZ();
};

/**
 * Place the sprite by projecting its grid cell through the 3D camera.
 *
 * Characters stay ordinary 2D sprites over the 3D ground — the HD-2D
 * arrangement — so their position cannot come from the 2D scroll, which knows
 * nothing about the camera's pitch. Returns false in 2D, leaving the stock path
 * untouched.
 *
 * The sprite's anchor is its feet, so the projected point is the base of the
 * cell rather than its centre in Y.
 */
Sprite_Character.prototype.updateReactor3DPosition = function() {
    if (typeof Reactor3D === "undefined") return false;
    const viewport = Reactor3D.viewport();
    const camera = viewport && viewport.camera();
    if (!camera || !Reactor3D.shouldRender3D($dataMap)) return false;

    const character = this._character;
    const gx = character._realX;
    const gy = character._realY;
    // Where this character is standing, which is not always its own cell:
    // a cell whose art was stood into a wall has moved onto that wall, and
    // a sign hanging on it has to move with it.
    const stand = Reactor3D.standingPlaceFor(character);
    const at = Reactor3D.pointOf(camera, gx + 0.5, stand);
    const point = Reactor3D.projectToScreen(camera, at.x, at.y, at.z,
        this._reactor3dPoint || (this._reactor3dPoint = {}));
    if (!point) return false;

    this.x = point.x;
    this.y = point.y;
    // Painter's order along the view direction: further cells draw first, so a
    // character behind a taller one is overlapped rather than punched through.
    this.z = character.screenZ();
    this._reactor3dBehindCamera = !point.visible;
    return true;
};

/**
 * How much bigger than its 2D self this sprite has to be drawn.
 *
 * The 3D camera frames about half the map a 2D screen does, so a tile that
 * covers 48 pixels flat covers nearer a hundred here. A character left at its
 * own size is then half the height of the doorway it is standing in, and a
 * sign no longer travels with the pole it is nailed to. Returns null on a flat
 * map, where nothing should be touched at all.
 */
/**
 * An event whose tile now stands in the scene must not be drawn again over it.
 *
 * Hidden here rather than while positioning, because `update` calls
 * `updatePosition` and *then* `updateVisibility`, so a hide applied during
 * positioning was recomputed away a moment later. The door was drawn twice —
 * once as geometry standing in the world, once as a flat sprite over it — and
 * because the flat one returned before it was ever placed, it kept whatever
 * position it last had and slid about the screen as the camera moved. Six of
 * them on Moletown looked exactly like sprites trailing the party.
 */
Sprite_Character.prototype._reactor3dBaseVisibility = Sprite_Character.prototype.updateVisibility;
Sprite_Character.prototype.updateVisibility = function() {
    this._reactor3dBaseVisibility();
    if (typeof Reactor3D === "undefined") return;
    const character = this._character;
    if (!character) return;
    const isEvent = typeof character.eventId === "function";
    if (isEvent && Reactor3D.isEventProp(character.eventId())) {
        this.visible = false;
        return;
    }
    if (Reactor3D.hasCharacterModel(character)) this.visible = false;
    if (typeof $dataMap !== "undefined" && Reactor3D.hasEventModels($dataMap)) {
        this.visible = false;
    }
};

Sprite_Character.prototype.reactor3DScale = function() {
    if (typeof Reactor3D === "undefined") return null;
    const viewport = Reactor3D.viewport();
    const camera = viewport && viewport.camera();
    if (!camera || !Reactor3D.shouldRender3D($dataMap)) return null;
    const character = this._character;
    if (!character) return null;
    const gx = character._realX;
    const gy = character._realY;
    const stand = Reactor3D.standingPlaceFor(character);
    // The whole transform a declared 3D object gets on this cell: width,
    // height and shear. All three come off the same two projected axes, so a
    // sprite anchored at its feet, sheared by the lean and stretched by the
    // two scales, has its corners where the billboard's corners are.
    //
    // The three only work together. Foreshortening without the lean leaves the
    // top of a tall sign sideways of where it belongs; leaning without the
    // foreshortening overshoots it the other way by about as much.
    // Measured across this sprite's own frame rather than across one tile: a
    // three-tile sign sized from a one-tile sample lands its top edge tens of
    // pixels out, and the error moves with the camera.
    const tileWidth = $gameMap.tileWidth();
    const tileHeight = $gameMap.tileHeight();
    const wide = this.patternWidth() / tileWidth;
    const tall = this.patternHeight() / tileHeight;
    const at = Reactor3D.pointOf(camera, gx + 0.5, stand);
    return Reactor3D.standScaleAt(camera, at.x, at.y, at.z, wide, tall);
};

/**
 * Apply it around everything else, rather than inside `updatePosition`.
 *
 * Setting the scale there did nothing visible, because plugins that scale
 * character sprites — EventCustomizer's zoom, among others — assign
 * `sprite.scale` from their own `update`, which runs afterwards and wins. So
 * the sprite kept its flat size over a map drawn at twice that, and the whole
 * change was invisible.
 *
 * Last frame's factor is taken back off first and this one multiplied on
 * afterwards, which is how UltraMode7 does the same job here: a plugin that
 * assigns an absolute scale still gets the scale it asked for, a plugin that
 * multiplies still multiplies, and nothing compounds frame over frame.
 */
Sprite_Character.prototype._reactor3dBaseUpdate = Sprite_Character.prototype.update;
Sprite_Character.prototype.update = function() {
    const was = this._reactor3dStand;
    if (was) {
        this.scale.x /= was.x;
        this.scale.y /= was.y;
        this.skew.x -= was.skew;
        this._reactor3dStand = null;
    }
    this._reactor3dBaseUpdate();
    const stand = this.reactor3DScale();
    if (!stand) return;
    this.scale.x *= stand.x;
    this.scale.y *= stand.y;
    // Sheared about the anchor, which is already the middle of the feet: the
    // ground line stays level and the top leans, which is the parallelogram a
    // standing billboard actually projects to.
    this.skew.x += stand.skew;
    this._reactor3dStand = stand;
};

Sprite_Character.prototype.updateOther = function() {
    this.opacity = this._character.opacity();
    if (this._reactor3dBehindCamera) this.opacity = 0;
    this.blendMode = this._character.blendMode();
    this._bushDepth = this._character.bushDepth();
};

//-----------------------------------------------------------------------------
// Sprite_Battler
//
// The superclass of Sprite_Actor and Sprite_Enemy.

function Sprite_Battler() {
    this.initialize(...arguments);
}

Sprite_Battler.prototype = Object.create(Sprite_Clickable.prototype);
Sprite_Battler.prototype.constructor = Sprite_Battler;

Sprite_Battler.prototype.initialize = function(battler) {
    Sprite_Clickable.prototype.initialize.call(this);
    this.initMembers();
    this.setBattler(battler);
};

Sprite_Battler.prototype.initMembers = function() {
    this.anchor.x = 0.5;
    this.anchor.y = 1;
    this._battler = null;
    this._damages = [];
    this._homeX = 0;
    this._homeY = 0;
    this._offsetX = 0;
    this._offsetY = 0;
    this._targetOffsetX = NaN;
    this._targetOffsetY = NaN;
    this._movementDuration = 0;
    this._selectionEffectCount = 0;
};

Sprite_Battler.prototype.setBattler = function(battler) {
    this._battler = battler;
};

Sprite_Battler.prototype.checkBattler = function(battler) {
    return this._battler === battler;
};

Sprite_Battler.prototype.mainSprite = function() {
    return this;
};

Sprite_Battler.prototype.setHome = function(x, y) {
    this._homeX = x;
    this._homeY = y;
    this.updatePosition();
};

Sprite_Battler.prototype.update = function() {
    Sprite_Clickable.prototype.update.call(this);
    if (this._battler) {
        this.updateMain();
        this.updateDamagePopup();
        this.updateSelectionEffect();
        this.updateVisibility();
    } else {
        this.bitmap = null;
    }
};

Sprite_Battler.prototype.updateVisibility = function() {
    Sprite_Clickable.prototype.updateVisibility.call(this);
    if (!this._battler || !this._battler.isSpriteVisible()) {
        this.visible = false;
    }
};

Sprite_Battler.prototype.updateMain = function() {
    if (this._battler.isSpriteVisible()) {
        this.updateBitmap();
        this.updateFrame();
    }
    this.updateMove();
    this.updatePosition();
};

Sprite_Battler.prototype.updateBitmap = function() {
    //
};

Sprite_Battler.prototype.updateFrame = function() {
    //
};

Sprite_Battler.prototype.updateMove = function() {
    if (this._movementDuration > 0) {
        const d = this._movementDuration;
        this._offsetX = (this._offsetX * (d - 1) + this._targetOffsetX) / d;
        this._offsetY = (this._offsetY * (d - 1) + this._targetOffsetY) / d;
        this._movementDuration--;
        if (this._movementDuration === 0) {
            this.onMoveEnd();
        }
    }
};

Sprite_Battler.prototype.updatePosition = function() {
    this.x = this._homeX + this._offsetX;
    this.y = this._homeY + this._offsetY;
};

Sprite_Battler.prototype.updateDamagePopup = function() {
    this.setupDamagePopup();
    if (this._damages.length > 0) {
        for (const damage of this._damages) {
            damage.update();
        }
        if (!this._damages[0].isPlaying()) {
            this.destroyDamageSprite(this._damages[0]);
        }
    }
};

Sprite_Battler.prototype.updateSelectionEffect = function() {
    const target = this.mainSprite();
    if (this._battler.isSelected()) {
        this._selectionEffectCount++;
        if (this._selectionEffectCount % 30 < 15) {
            target.setBlendColor([255, 255, 255, 64]);
        } else {
            target.setBlendColor([0, 0, 0, 0]);
        }
    } else if (this._selectionEffectCount > 0) {
        this._selectionEffectCount = 0;
        target.setBlendColor([0, 0, 0, 0]);
    }
};

Sprite_Battler.prototype.setupDamagePopup = function() {
    if (this._battler.isDamagePopupRequested()) {
        if (this._battler.isSpriteVisible()) {
            this.createDamageSprite();
        }
        this._battler.clearDamagePopup();
        this._battler.clearResult();
    }
};

Sprite_Battler.prototype.createDamageSprite = function() {
    const last = this._damages[this._damages.length - 1];
    const sprite = new Sprite_Damage();
    if (last) {
        sprite.x = last.x + 8;
        sprite.y = last.y - 16;
    } else {
        sprite.x = this.x + this.damageOffsetX();
        sprite.y = this.y + this.damageOffsetY();
    }
    sprite.setup(this._battler);
    this._damages.push(sprite);
    this.parent.addChild(sprite);
};

Sprite_Battler.prototype.destroyDamageSprite = function(sprite) {
    this.parent.removeChild(sprite);
    this._damages.remove(sprite);
    sprite.destroy();
};

Sprite_Battler.prototype.damageOffsetX = function() {
    return 0;
};

Sprite_Battler.prototype.damageOffsetY = function() {
    return 0;
};

Sprite_Battler.prototype.startMove = function(x, y, duration) {
    if (this._targetOffsetX !== x || this._targetOffsetY !== y) {
        this._targetOffsetX = x;
        this._targetOffsetY = y;
        this._movementDuration = duration;
        if (duration === 0) {
            this._offsetX = x;
            this._offsetY = y;
        }
    }
};

Sprite_Battler.prototype.onMoveEnd = function() {
    //
};

Sprite_Battler.prototype.isEffecting = function() {
    return false;
};

Sprite_Battler.prototype.isMoving = function() {
    return this._movementDuration > 0;
};

Sprite_Battler.prototype.inHomePosition = function() {
    return this._offsetX === 0 && this._offsetY === 0;
};

Sprite_Battler.prototype.onMouseEnter = function() {
    $gameTemp.setTouchState(this._battler, "select");
};

Sprite_Battler.prototype.onPress = function() {
    $gameTemp.setTouchState(this._battler, "select");
};

Sprite_Battler.prototype.onClick = function() {
    $gameTemp.setTouchState(this._battler, "click");
};

//-----------------------------------------------------------------------------
// Sprite_Actor
//
// The sprite for displaying an actor.

function Sprite_Actor() {
    this.initialize(...arguments);
}

Sprite_Actor.prototype = Object.create(Sprite_Battler.prototype);
Sprite_Actor.prototype.constructor = Sprite_Actor;

Sprite_Actor.MOTIONS = {
    walk: { index: 0, loop: true },
    wait: { index: 1, loop: true },
    chant: { index: 2, loop: true },
    guard: { index: 3, loop: true },
    damage: { index: 4, loop: false },
    evade: { index: 5, loop: false },
    thrust: { index: 6, loop: false },
    swing: { index: 7, loop: false },
    missile: { index: 8, loop: false },
    skill: { index: 9, loop: false },
    spell: { index: 10, loop: false },
    item: { index: 11, loop: false },
    escape: { index: 12, loop: true },
    victory: { index: 13, loop: true },
    dying: { index: 14, loop: true },
    abnormal: { index: 15, loop: true },
    sleep: { index: 16, loop: true },
    dead: { index: 17, loop: true }
};

Sprite_Actor.prototype.initialize = function(battler) {
    Sprite_Battler.prototype.initialize.call(this, battler);
    this.moveToStartPosition();
};

Sprite_Actor.prototype.initMembers = function() {
    Sprite_Battler.prototype.initMembers.call(this);
    this._battlerName = "";
    this._motion = null;
    this._motionCount = 0;
    this._pattern = 0;
    this.createShadowSprite();
    this.createWeaponSprite();
    this.createMainSprite();
    this.createStateSprite();
};

Sprite_Actor.prototype.mainSprite = function() {
    return this._mainSprite;
};

Sprite_Actor.prototype.createMainSprite = function() {
    this._mainSprite = new Sprite();
    this._mainSprite.anchor.x = 0.5;
    this._mainSprite.anchor.y = 1;
    this.addChild(this._mainSprite);
};

Sprite_Actor.prototype.createShadowSprite = function() {
    this._shadowSprite = new Sprite();
    this._shadowSprite.bitmap = ImageManager.loadSystem("Shadow2");
    this._shadowSprite.anchor.x = 0.5;
    this._shadowSprite.anchor.y = 0.5;
    this._shadowSprite.y = -2;
    this.addChild(this._shadowSprite);
};

Sprite_Actor.prototype.createWeaponSprite = function() {
    this._weaponSprite = new Sprite_Weapon();
    this.addChild(this._weaponSprite);
};

Sprite_Actor.prototype.createStateSprite = function() {
    this._stateSprite = new Sprite_StateOverlay();
    this.addChild(this._stateSprite);
};

Sprite_Actor.prototype.setBattler = function(battler) {
    Sprite_Battler.prototype.setBattler.call(this, battler);
    if (battler !== this._actor) {
        this._actor = battler;
        if (battler) {
            this.setActorHome(battler.index());
        } else {
            this._mainSprite.bitmap = null;
            this._battlerName = "";
        }
        this.startEntryMotion();
        this._stateSprite.setup(battler);
    }
};

Sprite_Actor.prototype.moveToStartPosition = function() {
    this.startMove(300, 0, 0);
};

Sprite_Actor.prototype.setActorHome = function(index) {
    this.setHome(600 + index * 32, 280 + index * 48);
};

Sprite_Actor.prototype.update = function() {
    Sprite_Battler.prototype.update.call(this);
    this.updateShadow();
    if (this._actor) {
        this.updateMotion();
    }
};

Sprite_Actor.prototype.updateShadow = function() {
    this._shadowSprite.visible = !!this._actor;
};

Sprite_Actor.prototype.updateMain = function() {
    Sprite_Battler.prototype.updateMain.call(this);
    if (this._actor.isSpriteVisible() && !this.isMoving()) {
        this.updateTargetPosition();
    }
};

Sprite_Actor.prototype.setupMotion = function() {
    if (this._actor.isMotionRequested()) {
        this.startMotion(this._actor.motionType());
        this._actor.clearMotion();
    }
};

Sprite_Actor.prototype.setupWeaponAnimation = function() {
    if (this._actor.isWeaponAnimationRequested()) {
        this._weaponSprite.setup(this._actor.weaponImageId());
        this._actor.clearWeaponAnimation();
    }
};

Sprite_Actor.prototype.startMotion = function(motionType) {
    const newMotion = Sprite_Actor.MOTIONS[motionType];
    if (this._motion !== newMotion) {
        this._motion = newMotion;
        this._motionCount = 0;
        this._pattern = 0;
    }
};

Sprite_Actor.prototype.updateTargetPosition = function() {
    if (this._actor.canMove() && BattleManager.isEscaped()) {
        this.retreat();
    } else if (this.shouldStepForward()) {
        this.stepForward();
    } else if (!this.inHomePosition()) {
        this.stepBack();
    }
};

Sprite_Actor.prototype.shouldStepForward = function() {
    return this._actor.isInputting() || this._actor.isActing();
};

Sprite_Actor.prototype.updateBitmap = function() {
    Sprite_Battler.prototype.updateBitmap.call(this);
    const name = this._actor.battlerName();
    if (this._battlerName !== name) {
        this._battlerName = name;
        this._mainSprite.bitmap = ImageManager.loadSvActor(name);
    }
};

Sprite_Actor.prototype.updateFrame = function() {
    Sprite_Battler.prototype.updateFrame.call(this);
    const bitmap = this._mainSprite.bitmap;
    if (bitmap) {
        const motionIndex = this._motion ? this._motion.index : 0;
        const pattern = this._pattern < 3 ? this._pattern : 1;
        const cw = bitmap.width / 9;
        const ch = bitmap.height / 6;
        const cx = Math.floor(motionIndex / 6) * 3 + pattern;
        const cy = motionIndex % 6;
        this._mainSprite.setFrame(cx * cw, cy * ch, cw, ch);
        this.setFrame(0, 0, cw, ch);
    }
};

Sprite_Actor.prototype.updateMove = function() {
    const bitmap = this._mainSprite.bitmap;
    if (!bitmap || bitmap.isReady()) {
        Sprite_Battler.prototype.updateMove.call(this);
    }
};

Sprite_Actor.prototype.updateMotion = function() {
    this.setupMotion();
    this.setupWeaponAnimation();
    if (this._actor.isMotionRefreshRequested()) {
        this.refreshMotion();
        this._actor.clearMotion();
    }
    this.updateMotionCount();
};

Sprite_Actor.prototype.updateMotionCount = function() {
    if (this._motion && ++this._motionCount >= this.motionSpeed()) {
        if (this._motion.loop) {
            this._pattern = (this._pattern + 1) % 4;
        } else if (this._pattern < 2) {
            this._pattern++;
        } else {
            this.refreshMotion();
        }
        this._motionCount = 0;
    }
};

Sprite_Actor.prototype.motionSpeed = function() {
    return 12;
};

Sprite_Actor.prototype.refreshMotion = function() {
    const actor = this._actor;
    if (actor) {
        const stateMotion = actor.stateMotionIndex();
        if (actor.isInputting() || actor.isActing()) {
            this.startMotion("walk");
        } else if (stateMotion === 3) {
            this.startMotion("dead");
        } else if (stateMotion === 2) {
            this.startMotion("sleep");
        } else if (actor.isChanting()) {
            this.startMotion("chant");
        } else if (actor.isGuard() || actor.isGuardWaiting()) {
            this.startMotion("guard");
        } else if (stateMotion === 1) {
            this.startMotion("abnormal");
        } else if (actor.isDying()) {
            this.startMotion("dying");
        } else if (actor.isUndecided()) {
            this.startMotion("walk");
        } else {
            this.startMotion("wait");
        }
    }
};

Sprite_Actor.prototype.startEntryMotion = function() {
    if (this._actor && this._actor.canMove()) {
        this.startMotion("walk");
        this.startMove(0, 0, 30);
    } else if (!this.isMoving()) {
        this.refreshMotion();
        this.startMove(0, 0, 0);
    }
};

Sprite_Actor.prototype.stepForward = function() {
    this.startMove(-48, 0, 12);
};

Sprite_Actor.prototype.stepBack = function() {
    this.startMove(0, 0, 12);
};

Sprite_Actor.prototype.retreat = function() {
    this.startMove(300, 0, 30);
};

Sprite_Actor.prototype.onMoveEnd = function() {
    Sprite_Battler.prototype.onMoveEnd.call(this);
    if (!BattleManager.isBattleEnd()) {
        this.refreshMotion();
    }
};

Sprite_Actor.prototype.damageOffsetX = function() {
    return Sprite_Battler.prototype.damageOffsetX.call(this) - 32;
};

Sprite_Actor.prototype.damageOffsetY = function() {
    return Sprite_Battler.prototype.damageOffsetY.call(this);
};

//-----------------------------------------------------------------------------
// Sprite_Enemy
//
// The sprite for displaying an enemy.

function Sprite_Enemy() {
    this.initialize(...arguments);
}

Sprite_Enemy.prototype = Object.create(Sprite_Battler.prototype);
Sprite_Enemy.prototype.constructor = Sprite_Enemy;

Sprite_Enemy.prototype.initialize = function(battler) {
    Sprite_Battler.prototype.initialize.call(this, battler);
};

Sprite_Enemy.prototype.initMembers = function() {
    Sprite_Battler.prototype.initMembers.call(this);
    this._enemy = null;
    this._appeared = false;
    this._battlerName = null;
    this._battlerHue = 0;
    this._effectType = null;
    this._effectDuration = 0;
    this._shake = 0;
    this.createStateIconSprite();
};

Sprite_Enemy.prototype.createStateIconSprite = function() {
    this._stateIconSprite = new Sprite_StateIcon();
    this.addChild(this._stateIconSprite);
};

Sprite_Enemy.prototype.setBattler = function(battler) {
    Sprite_Battler.prototype.setBattler.call(this, battler);
    this._enemy = battler;
    this.setHome(battler.screenX(), battler.screenY());
    this._stateIconSprite.setup(battler);
};

Sprite_Enemy.prototype.update = function() {
    Sprite_Battler.prototype.update.call(this);
    if (this._enemy) {
        this.updateEffect();
        this.updateStateSprite();
    }
};

Sprite_Enemy.prototype.updateBitmap = function() {
    Sprite_Battler.prototype.updateBitmap.call(this);
    const name = this._enemy.battlerName();
    const hue = this._enemy.battlerHue();
    if (this._battlerName !== name || this._battlerHue !== hue) {
        this._battlerName = name;
        this._battlerHue = hue;
        this.loadBitmap(name);
        this.setHue(hue);
        this.initVisibility();
    }
};

Sprite_Enemy.prototype.loadBitmap = function(name) {
    if ($gameSystem.isSideView()) {
        this.bitmap = ImageManager.loadSvEnemy(name);
    } else {
        this.bitmap = ImageManager.loadEnemy(name);
    }
};

Sprite_Enemy.prototype.setHue = function(hue) {
    Sprite_Battler.prototype.setHue.call(this, hue);
    for (const child of this.children) {
        if (child.setHue) {
            child.setHue(-hue);
        }
    }
};

Sprite_Enemy.prototype.updateFrame = function() {
    Sprite_Battler.prototype.updateFrame.call(this);
    if (this._effectType === "bossCollapse") {
        this.setFrame(0, 0, this.bitmap.width, this._effectDuration);
    } else {
        this.setFrame(0, 0, this.bitmap.width, this.bitmap.height);
    }
};

Sprite_Enemy.prototype.updatePosition = function() {
    Sprite_Battler.prototype.updatePosition.call(this);
    this.x += this._shake;
};

Sprite_Enemy.prototype.updateStateSprite = function() {
    this._stateIconSprite.y = -Math.round((this.bitmap.height + 40) * 0.9);
    if (this._stateIconSprite.y < 20 - this.y) {
        this._stateIconSprite.y = 20 - this.y;
    }
};

Sprite_Enemy.prototype.initVisibility = function() {
    this._appeared = this._enemy.isAlive();
    if (!this._appeared) {
        this.opacity = 0;
    }
};

Sprite_Enemy.prototype.setupEffect = function() {
    if (this._appeared && this._enemy.isEffectRequested()) {
        this.startEffect(this._enemy.effectType());
        this._enemy.clearEffect();
    }
    if (!this._appeared && this._enemy.isAlive()) {
        this.startEffect("appear");
    } else if (this._appeared && this._enemy.isHidden()) {
        this.startEffect("disappear");
    }
};

Sprite_Enemy.prototype.startEffect = function(effectType) {
    this._effectType = effectType;
    switch (this._effectType) {
        case "appear":
            this.startAppear();
            break;
        case "disappear":
            this.startDisappear();
            break;
        case "whiten":
            this.startWhiten();
            break;
        case "blink":
            this.startBlink();
            break;
        case "collapse":
            this.startCollapse();
            break;
        case "bossCollapse":
            this.startBossCollapse();
            break;
        case "instantCollapse":
            this.startInstantCollapse();
            break;
    }
    this.revertToNormal();
};

Sprite_Enemy.prototype.startAppear = function() {
    this._effectDuration = 16;
    this._appeared = true;
};

Sprite_Enemy.prototype.startDisappear = function() {
    this._effectDuration = 32;
    this._appeared = false;
};

Sprite_Enemy.prototype.startWhiten = function() {
    this._effectDuration = 16;
};

Sprite_Enemy.prototype.startBlink = function() {
    this._effectDuration = 20;
};

Sprite_Enemy.prototype.startCollapse = function() {
    this._effectDuration = 32;
    this._appeared = false;
};

Sprite_Enemy.prototype.startBossCollapse = function() {
    this._effectDuration = this.bitmap.height;
    this._appeared = false;
};

Sprite_Enemy.prototype.startInstantCollapse = function() {
    this._effectDuration = 16;
    this._appeared = false;
};

Sprite_Enemy.prototype.updateEffect = function() {
    this.setupEffect();
    if (this._effectDuration > 0) {
        this._effectDuration--;
        switch (this._effectType) {
            case "whiten":
                this.updateWhiten();
                break;
            case "blink":
                this.updateBlink();
                break;
            case "appear":
                this.updateAppear();
                break;
            case "disappear":
                this.updateDisappear();
                break;
            case "collapse":
                this.updateCollapse();
                break;
            case "bossCollapse":
                this.updateBossCollapse();
                break;
            case "instantCollapse":
                this.updateInstantCollapse();
                break;
        }
        if (this._effectDuration === 0) {
            this._effectType = null;
        }
    }
};

Sprite_Enemy.prototype.isEffecting = function() {
    return this._effectType !== null;
};

Sprite_Enemy.prototype.revertToNormal = function() {
    this._shake = 0;
    this.blendMode = 0;
    this.opacity = 255;
    this.setBlendColor([0, 0, 0, 0]);
};

Sprite_Enemy.prototype.updateWhiten = function() {
    const alpha = 128 - (16 - this._effectDuration) * 8;
    this.setBlendColor([255, 255, 255, alpha]);
};

Sprite_Enemy.prototype.updateBlink = function() {
    this.opacity = this._effectDuration % 10 < 5 ? 255 : 0;
};

Sprite_Enemy.prototype.updateAppear = function() {
    this.opacity = (16 - this._effectDuration) * 16;
};

Sprite_Enemy.prototype.updateDisappear = function() {
    this.opacity = 256 - (32 - this._effectDuration) * 10;
};

Sprite_Enemy.prototype.updateCollapse = function() {
    this.blendMode = 1;
    this.setBlendColor([255, 128, 128, 128]);
    this.opacity *= this._effectDuration / (this._effectDuration + 1);
};

Sprite_Enemy.prototype.updateBossCollapse = function() {
    this._shake = (this._effectDuration % 2) * 4 - 2;
    this.blendMode = 1;
    this.opacity *= this._effectDuration / (this._effectDuration + 1);
    this.setBlendColor([255, 255, 255, 255 - this.opacity]);
    if (this._effectDuration % 20 === 19) {
        SoundManager.playBossCollapse2();
    }
};

Sprite_Enemy.prototype.updateInstantCollapse = function() {
    this.opacity = 0;
};

Sprite_Enemy.prototype.damageOffsetX = function() {
    return Sprite_Battler.prototype.damageOffsetX.call(this);
};

Sprite_Enemy.prototype.damageOffsetY = function() {
    return Sprite_Battler.prototype.damageOffsetY.call(this) - 8;
};

//-----------------------------------------------------------------------------
// Sprite_Animation
//
// The sprite for displaying an animation.

function Sprite_Animation() {
    this.initialize(...arguments);
}

Sprite_Animation.prototype = Object.create(Sprite.prototype);
Sprite_Animation.prototype.constructor = Sprite_Animation;

Sprite_Animation.prototype.initialize = function() {
    Sprite.prototype.initialize.call(this);
    this.initMembers();
};

Sprite_Animation.prototype.initMembers = function() {
    this._targets = [];
    this._animation = null;
    this._mirror = false;
    this._delay = 0;
    this._previous = null;
    this._effect = null;
    this._handle = null;
    this._playing = false;
    this._started = false;
    this._frameIndex = 0;
    this._maxTimingFrames = 0;
    this._flashColor = [0, 0, 0, 0];
    this._flashDuration = 0;
    this._viewportSize = 4096;
    this.z = 8;
};

Sprite_Animation.prototype.destroy = function(options) {
    Sprite.prototype.destroy.call(this, options);
    if (this._handle) {
        this._handle.stop();
    }
    this._effect = null;
    this._handle = null;
    this._playing = false;
    this._started = false;
};

// prettier-ignore
Sprite_Animation.prototype.setup = function(
    targets, animation, mirror, delay, previous
) {
    this._targets = targets;
    this._animation = animation;
    this._mirror = mirror;
    this._delay = delay;
    this._previous = previous;
    this._effect = EffectManager.load(animation.effectName);
    this._playing = true;
    const timings = animation.soundTimings.concat(animation.flashTimings);
    for (const timing of timings) {
        if (timing.frame > this._maxTimingFrames) {
            this._maxTimingFrames = timing.frame;
        }
    }
};

Sprite_Animation.prototype.update = function() {
    Sprite.prototype.update.call(this);
    if (this._delay > 0) {
        this._delay--;
    } else if (this._playing) {
        if (!this._started && this.canStart()) {
            if (this._effect) {
                if (this._effect.isLoaded) {
                    this._handle = Graphics.effekseer.play(this._effect);
                    this._started = true;
                } else {
                    EffectManager.checkErrors();
                }
            } else {
                this._started = true;
            }
        }
        if (this._started) {
            this.updateEffectGeometry();
            this.updateMain();
            this.updateFlash();
        }
    }
};

Sprite_Animation.prototype.canStart = function() {
    if (this._previous && this.shouldWaitForPrevious()) {
        return !this._previous.isPlaying();
    } else {
        return true;
    }
};

Sprite_Animation.prototype.shouldWaitForPrevious = function() {
    // [Note] Older versions of Effekseer were very heavy on some mobile
    //   devices. We don't need this anymore.
    return false;
};

/**
 * How much bigger an animation has to be drawn than its 2D self.
 *
 * An animation is not a child of the sprite it plays on — it lives in the
 * spriteset's effects container — so it did not inherit the scaling that puts
 * a character in proportion with a 3D map. A looping effect on a shopfront was
 * drawn at flat size over a world drawn larger, and the mismatch grew with
 * distance because the map is in perspective and the effect was not.
 *
 * The average over the targets, so an animation on a group of them sits at one
 * consistent size rather than picking whichever target happens to be first.
 * Returns 1 anywhere the question does not apply, including every battle.
 */
Sprite_Animation.prototype.reactor3DScale = function() {
    let total = 0;
    let count = 0;
    for (const target of this._targets || []) {
        const scale = target && target.reactor3DScale && target.reactor3DScale();
        // An animation is round; it takes one number. The vertical is the one
        // the eye reads against the world.
        if (scale && scale.y > 0) { total += scale.y; count++; }
    }
    return count ? total / count : 1;
};

Sprite_Animation.prototype.updateEffectGeometry = function() {
    const scale = (this._animation.scale / 100) * this.reactor3DScale();
    const r = Math.PI / 180;
    // Compensate for the projection's y-flip by rotating the effect 180° on
    // the x-axis (AnimationPicker's recipe). Without this, particle motion
    // designed to go "up" instead appears to go "down" on screen.
    const rx = (180 - this._animation.rotation.x) * r;
    const ry = this._animation.rotation.y * r;
    const rz = this._animation.rotation.z * r;
    if (!this._handle) return;
    // The effect stays at the world origin; positioning happens by centering
    // a square viewport on the target (setViewport). Moving the effect off
    // the camera axis via setLocation put it far off-axis in one shared
    // wide-FOV frustum (eye ≈ 10.8 world units out), and off-axis perspective
    // stretches shapes radially — a sphere at 300px from screen center
    // rendered 50% wider than tall (measured 471×314). On-axis in its own
    // viewport, it stays round at every screen position — this is MZ's own
    // approach (4096² viewport at the target), adapted to the overlay recipe.
    this._handle.setLocation(0, 0, 0);
    this._handle.setRotation(rx, ry, rz);
    this._handle.setScale(scale, scale, scale);
    this._handle.setSpeed(this._animation.speed / 100);
};

// Target position in overlay-canvas pixels (shared by setViewport).
Sprite_Animation.prototype.effekseerScreenPosition = function(renderer) {
    const pos = this.targetPosition(renderer);
    return {
        x: pos.x + (this._animation.offsetX || 0),
        y: pos.y + (this._animation.offsetY || 0),
    };
};

Sprite_Animation.prototype.updateMain = function() {
    this.processSoundTimings();
    this.processFlashTimings();
    this._frameIndex++;
    this.checkEnd();
};

Sprite_Animation.prototype.processSoundTimings = function() {
    for (const timing of this._animation.soundTimings) {
        if (timing.frame === this._frameIndex) {
            AudioManager.playSe(timing.se);
        }
    }
};

Sprite_Animation.prototype.processFlashTimings = function() {
    for (const timing of this._animation.flashTimings) {
        if (timing.frame === this._frameIndex) {
            this._flashColor = timing.color.clone();
            this._flashDuration = timing.duration;
        }
    }
};

Sprite_Animation.prototype.checkEnd = function() {
    if (
        this._frameIndex > this._maxTimingFrames &&
        this._flashDuration === 0 &&
        !(this._handle && this._handle.exists)
    ) {
        this._playing = false;
    }
};

Sprite_Animation.prototype.updateFlash = function() {
    if (this._flashDuration > 0) {
        const d = this._flashDuration--;
        this._flashColor[3] *= (d - 1) / d;
        for (const target of this._targets) {
            target.setBlendColor(this._flashColor);
        }
    }
};

Sprite_Animation.prototype.isPlaying = function() {
    return this._playing;
};

Sprite_Animation.prototype.setRotation = function(x, y, z) {
    if (this._handle) {
        this._handle.setRotation(x, y, z);
    }
};

// v8: queue of Sprite_Animation instances that need an Effekseer draw on the
// current frame. Populated by _render (via the onRender bridge), drained by
// Graphics._onTick after _app.render() so Effekseer draws on TOP of the v8
// scene instead of being overwritten by v8's later batch draws.
Sprite_Animation._pendingRenders = [];
Sprite_Animation._effekseerDrawWarned = false;

Sprite_Animation.renderActive = function(renderer) {
    // Clear the Effekseer overlay canvas EVERY frame, regardless of whether
    // animations are queued. If we only clear when there's an animation, the
    // last-frame pixels of a finished animation stay on the overlay and block
    // view of the game canvas underneath -- hiding MOG_BattleCursor and
    // anything else PIXI draws into the game canvas in those areas.
    const efxGL = Graphics._effekseerGL;
    if (efxGL && Graphics._effekseerCanvas) {
        efxGL.viewport(0, 0,
            Graphics._effekseerCanvas.width,
            Graphics._effekseerCanvas.height);
        efxGL.clearColor(0, 0, 0, 0);
        efxGL.clear(efxGL.COLOR_BUFFER_BIT | efxGL.DEPTH_BUFFER_BIT);
    }
    const list = Sprite_Animation._pendingRenders;
    if (list.length === 0) return;
    // While effects play, the overlay carries a copy of the whole rendered
    // scene and the effects draw ON that copy — the same shared-framebuffer
    // semantics the stock runtime has. On a transparent overlay every blend
    // mode broke a different way: additive layers wrote alpha into empty
    // pixels so black-backed textures composited as opaque black squares,
    // and multiply layers darkened nothing into solid black. The copy is
    // pixel-identical to what it covers, so it is invisible in itself.
    const composited = !!(Graphics.blitSceneBehindEffects && Graphics.blitSceneBehindEffects());
    for (const inst of list) {
        try {
            inst._doEffekseerDraw(renderer, composited);
        } catch (e) {
            // The draw runs every frame, so a throw here is reported once.
            // Swallowing it outright hid every effect in a game while the
            // animation's sounds and flashes kept playing.
            if (!Sprite_Animation._effekseerDrawWarned) {
                Sprite_Animation._effekseerDrawWarned = true;
                console.warn("[Sprite_Animation] Effekseer draw threw; effects " +
                    "will not render until this is fixed:", e);
            }
        }
    }
    list.length = 0;
};

Sprite_Animation.prototype._render = function(renderer) {
    if (this._targets.length > 0 && this._handle && this._handle.exists) {
        if (PIXI.TextureSource) {
            // v8: defer to post-render flush; just queue self. Actual Effekseer
            // draw runs in Graphics._onTick after _app.render() returns so it
            // doesn't compete with v8's internal render passes. See
            // _doEffekseerDraw for the per-frame draw logic and the FBO-rebind
            // that makes Effekseer's pixels actually land on the canvas.
            if (Sprite_Animation._pendingRenders.indexOf(this) === -1) {
                Sprite_Animation._pendingRenders.push(this);
            }
            return;
        }
        // v5/6/7: original inline draw.
        this.onBeforeRender(renderer);
        this.setProjectionMatrix(renderer);
        this.setCameraMatrix(renderer);
        this.setViewport(renderer);
        Graphics.effekseer.beginDraw();
        Graphics.effekseer.drawHandle(this._handle);
        Graphics.effekseer.endDraw();
        this.resetViewport(renderer);
        this.onAfterRender(renderer);
    }
};

// One-shot overlay diagnostic. Fires the first time _doEffekseerDraw runs after
// page-load. Confirms the overlay canvas exists in the DOM, that we have its
// WebGL1 context, and that Effekseer actually writes pixels to it. Reset via

Sprite_Animation.prototype._doEffekseerDraw = function(renderer, composited) {
    // Draws to the Effekseer overlay canvas's WebGL1 context (Graphics._effekseerGL).
    // The overlay canvas sits absolutely positioned over the game canvas with
    // pointer-events:none, so the browser compositor layers our effects on top
    // of the v8-rendered scene. This bypasses v8/WebGL2 entirely for Effekseer.
    // Called from Sprite_Animation.renderActive after the overlay has been
    // cleared once for this frame.
    if (!(this._targets.length > 0 && this._handle && this._handle.exists)) {
        return;
    }
    const efxGL = Graphics._effekseerGL;
    const overlay = Graphics._effekseerCanvas;
    // Distortion layers additionally sample a captured backdrop; with the
    // scene composited into the framebuffer the capture takes it from
    // there, covering this effect's own square viewport — Effekseer maps
    // background UVs across the viewport, so a canvas-sized capture would
    // read back misaligned, smeared scenery.
    const efxContext = Graphics.effekseer;
    if (composited && efxGL && overlay && efxContext && efxContext.captureBackground) {
        const rect = this.effekseerViewportRect(renderer);
        efxContext.captureBackground(rect.x, rect.y, rect.side, rect.side);
    }
    this.setProjectionMatrix(renderer);
    this.setCameraMatrix(renderer);
    this.setViewport(renderer);
    Graphics.effekseer.beginDraw();
    Graphics.effekseer.drawHandle(this._handle);
    Graphics.effekseer.endDraw();
    this.resetViewport(renderer);
};

// Square per-effect viewport side. Distortion is zero at the viewport
// center regardless of size; the side only bounds how far an effect can
// extend from its target before clipping at the viewport edge (±ch here).
Sprite_Animation.effekseerViewportSide = function() {
    const canvas = Graphics._effekseerCanvas;
    return canvas ? canvas.height * 2 : 1440;
};

Sprite_Animation.prototype.setProjectionMatrix = function(renderer) {
    // AnimationPicker recipe (proven good): p = -1.2 with camera z = -10.
    // (The MZ original's p ≈ -5.69 silently produced zero pixels through
    // Effekseer's WebGL1 wrapper on the overlay context.)
    //
    // The viewport is a SQUARE of side S centered on the target
    // (setViewport), so the projection is aspect-neutral; the ch/S factor
    // keeps one world unit = ch/26 pixels on both axes — the same on-screen
    // effect scale as the editor previews. The effect itself sits at the
    // world origin (camera axis), so shapes stay undistorted at every
    // screen position; mirroring flips the x-axis around the target.
    const canvas = Graphics._effekseerCanvas || renderer.view;
    const q = canvas.height / Sprite_Animation.effekseerViewportSide();
    const x = (this._mirror ? -1 : 1) * q;
    const y = -q;
    const p = -1.2;
    Graphics.effekseer.setProjectionMatrix([
        x, 0, 0, 0,
        0, y, 0, 0,
        0, 0, 1, p,
        0, 0, 0, 1,
    ]);
};

Sprite_Animation.prototype.setCameraMatrix = function(/*renderer*/) {
    // prettier-ignore
    Graphics.effekseer.setCameraMatrix([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, -10, 1
    ]);
};

Sprite_Animation.prototype.effekseerViewportRect = function(renderer) {
    const canvas = Graphics._effekseerCanvas || renderer.view;
    const side = Sprite_Animation.effekseerViewportSide();
    const pos = this.effekseerScreenPosition(renderer);
    return {
        x: Math.round(pos.x - side / 2),
        y: Math.round((canvas.height - pos.y) - side / 2),
        side
    };
};

Sprite_Animation.prototype.setViewport = function(renderer) {
    // Square viewport centered on the target: the effect renders on the
    // camera axis wherever the target is on screen (see updateEffectGeometry
    // for why). GL viewport origin is bottom-left, canvas pixels are
    // top-down, hence the ch - py flip. Rects extending past the canvas are
    // legal; fragments outside the framebuffer are simply clipped.
    const efxGL = Graphics._effekseerGL || renderer.gl;
    const rect = this.effekseerViewportRect(renderer);
    efxGL.viewport(rect.x, rect.y, rect.side, rect.side);
};

Sprite_Animation.prototype.targetPosition = function(renderer) {
    const pos = new Point();
    if (this._animation.displayType === 2) {
        // Graphics dimensions, not renderer.view: on v8, renderer.view is a
        // ViewSystem (no width/height) — screen-center animations computed
        // NaN and the GL viewport call silently kept its previous rect.
        pos.x = Graphics.width / 2;
        pos.y = Graphics.height / 2;
    } else {
        for (const target of this._targets) {
            const tpos = this.targetSpritePosition(target);
            pos.x += tpos.x;
            pos.y += tpos.y;
        }
        pos.x /= this._targets.length;
        pos.y /= this._targets.length;
    }
    return pos;
};

Sprite_Animation.prototype.targetSpritePosition = function(sprite) {
    // Anchor unconditionally to sprite ORIGIN (typically the bottom for battle
    // sprites with anchor.y=1). Conditional alignBottom check was leaving
    // effects ~h/2 too high. If a future animation explicitly needs center-
    // anchor, restore the conditional later.
    const point = new Point(0, 0);
    // v5/6/7: sprite.updateTransform() forced an immediate worldTransform
    // recompute. v8 repurposed updateTransform as an opts-setter (no-args
    // throws). Skip the call on v8 -- v8's transform system has already
    // computed worldTransform by the time onRender fires.
    if (!PIXI.TextureSource) {
        sprite.updateTransform();
    }
    const out = sprite.worldTransform.apply(point);
    // A hidden sprite never reaches v8's render pass, so its
    // worldTransform is stale — a 3D model event's stand-in sprite is
    // exactly that, and an animation anchored through it landed wherever
    // the transform last froze. Compose its local position through the
    // parent, whose transform stays live.
    if ((!sprite.visible || !Number.isFinite(out.x) || !Number.isFinite(out.y))
        && sprite.parent && sprite.parent.worldTransform) {
        return sprite.parent.worldTransform.apply(new Point(sprite.x, sprite.y));
    }
    return out;
};

Sprite_Animation.prototype.resetViewport = function(renderer) {
    // Reset Effekseer overlay's viewport (NOT v8's). v8 manages its own
    // viewport every frame via beginRenderPass, so we don't need to touch it.
    const efxGL = Graphics._effekseerGL || renderer.gl;
    const w = Graphics._effekseerCanvas
        ? Graphics._effekseerCanvas.width
        : renderer.view.width;
    const h = Graphics._effekseerCanvas
        ? Graphics._effekseerCanvas.height
        : renderer.view.height;
    efxGL.viewport(0, 0, w, h);
};

Sprite_Animation.prototype.onBeforeRender = function(renderer) {
    // v8 dropped renderer.batch / renderer.geometry as legacy subsystems.
    // Effekseer is configured with setRestorationOfStatesFlag(true) on v8 so
    // it handles GL state save/restore itself -- no manual flush needed here.
    if (PIXI.TextureSource) {
        // Still finish any pending v8 render pass so Effekseer draws on top
        // of (not interleaved with) v8's batched draws.
        if (renderer.renderTarget &&
            typeof renderer.renderTarget.finishRenderPass === "function") {
            try { renderer.renderTarget.finishRenderPass(); } catch (e) {}
        }
        return;
    }
    renderer.batch.flush();
    renderer.geometry.reset();
};

Sprite_Animation.prototype.onAfterRender = function(renderer) {
    // v8: Effekseer's setRestorationOfStatesFlag(true) handles GL state
    // restoration. Resetting v8's removed legacy subsystems would do nothing.
    if (PIXI.TextureSource) {
        return;
    }
    renderer.texture.reset();
    renderer.geometry.reset();
    renderer.state.reset();
    renderer.shader.reset();
    renderer.framebuffer.reset();
};

//-----------------------------------------------------------------------------
// Sprite_AnimationMV
//
// The sprite for displaying an old format animation.

function Sprite_AnimationMV() {
    this.initialize(...arguments);
}

Sprite_AnimationMV.prototype = Object.create(Sprite.prototype);
Sprite_AnimationMV.prototype.constructor = Sprite_AnimationMV;

Sprite_AnimationMV.prototype.initialize = function() {
    Sprite.prototype.initialize.call(this);
    this.initMembers();
};

Sprite_AnimationMV.prototype.initMembers = function() {
    this._targets = [];
    this._animation = null;
    this._mirror = false;
    this._delay = 0;
    this._rate = 4;
    this._duration = 0;
    this._flashColor = [0, 0, 0, 0];
    this._flashDuration = 0;
    this._screenFlashDuration = 0;
    this._hidingDuration = 0;
    this._hue1 = 0;
    this._hue2 = 0;
    this._bitmap1 = null;
    this._bitmap2 = null;
    this._cellSprites = [];
    this._screenFlashSprite = null;
    this.z = 8;
};

// prettier-ignore
Sprite_AnimationMV.prototype.setup = function(
    targets, animation, mirror, delay
) {
    this._targets = targets;
    this._animation = animation;
    this._mirror = mirror;
    this._delay = delay;
    if (this._animation) {
        this.setupRate();
        this.setupDuration();
        this.loadBitmaps();
        this.createCellSprites();
        this.createScreenFlashSprite();
    }
};

Sprite_AnimationMV.prototype.setupRate = function() {
    this._rate = 4;
};

// Draw the first frame the moment the sprite enters the tree (sheets are
// already cached for anything that has played before), instead of leaving
// it invisible until its first update one tick later. Looping animations
// retriggered right at the end of the previous pass ("show, wait
// duration-1, repeat" flags) hand off without a blank tick. Visuals only:
// frame timings (SEs, flashes) still fire on the first real update.
Sprite_AnimationMV.prototype._rrPrimeFirstFrame = function() {
    if (this._delay > 0 || !this._animation) return;
    const frames = this._animation.frames;
    if (!frames || frames.length === 0) return;
    if (!this.isReady()) return;
    try {
        this.updatePosition();
        this.updateAllCellSprites(frames[0]);
    } catch (e) { /* first update draws it instead */ }
};

Sprite_AnimationMV.prototype.setupDuration = function() {
    this._duration = this._animation.frames.length * this._rate + 1;
};

Sprite_AnimationMV.prototype.update = function() {
    Sprite.prototype.update.call(this);
    this.updateMain();
    this.updateFlash();
    this.updateScreenFlash();
    this.updateHiding();
};

Sprite_AnimationMV.prototype.updateFlash = function() {
    if (this._flashDuration > 0) {
        const d = this._flashDuration--;
        this._flashColor[3] *= (d - 1) / d;
        for (const target of this._targets) {
            target.setBlendColor(this._flashColor);
        }
    }
};

Sprite_AnimationMV.prototype.updateScreenFlash = function() {
    if (this._screenFlashDuration > 0) {
        const d = this._screenFlashDuration--;
        if (this._screenFlashSprite) {
            this._screenFlashSprite.x = -this.absoluteX();
            this._screenFlashSprite.y = -this.absoluteY();
            this._screenFlashSprite.opacity *= (d - 1) / d;
            this._screenFlashSprite.visible = this._screenFlashDuration > 0;
        }
    }
};

Sprite_AnimationMV.prototype.absoluteX = function() {
    let x = 0;
    let object = this;
    while (object) {
        x += object.x;
        object = object.parent;
    }
    return x;
};

Sprite_AnimationMV.prototype.absoluteY = function() {
    let y = 0;
    let object = this;
    while (object) {
        y += object.y;
        object = object.parent;
    }
    return y;
};

Sprite_AnimationMV.prototype.updateHiding = function() {
    if (this._hidingDuration > 0) {
        this._hidingDuration--;
        if (this._hidingDuration === 0) {
            for (const target of this._targets) {
                target.show();
            }
        }
    }
};

Sprite_AnimationMV.prototype.isPlaying = function() {
    return this._duration > 0;
};

Sprite_AnimationMV.prototype.loadBitmaps = function() {
    const name1 = this._animation.animation1Name;
    const name2 = this._animation.animation2Name;
    this._hue1 = this._animation.animation1Hue;
    this._hue2 = this._animation.animation2Hue;
    this._bitmap1 = ImageManager.loadAnimation(name1);
    this._bitmap2 = ImageManager.loadAnimation(name2);
};

Sprite_AnimationMV.prototype.isReady = function() {
    return (
        this._bitmap1 &&
        this._bitmap1.isReady() &&
        this._bitmap2 &&
        this._bitmap2.isReady()
    );
};

Sprite_AnimationMV.prototype.createCellSprites = function() {
    this._cellSprites = [];
    for (let i = 0; i < 16; i++) {
        const sprite = new Sprite();
        sprite.anchor.x = 0.5;
        sprite.anchor.y = 0.5;
        this._cellSprites.push(sprite);
        this.addChild(sprite);
    }
};

Sprite_AnimationMV.prototype.createScreenFlashSprite = function() {
    this._screenFlashSprite = new ScreenSprite();
    this.addChild(this._screenFlashSprite);
};

Sprite_AnimationMV.prototype.updateMain = function() {
    if (this.isPlaying() && this.isReady()) {
        if (this._delay > 0) {
            this._delay--;
        } else {
            this._duration--;
            this.updatePosition();
            if (this._duration % this._rate === 0) {
                this.updateFrame();
            }
            if (this._duration <= 0) {
                this.onEnd();
            }
        }
    }
};

Sprite_AnimationMV.prototype.updatePosition = function() {
    if (this._animation.position === 3) {
        this.x = this.parent.width / 2;
        this.y = this.parent.height / 2;
    } else if (this._targets.length > 0) {
        const target = this._targets[0];
        const parent = target.parent;
        const grandparent = parent ? parent.parent : null;
        this.x = target.x;
        this.y = target.y;
        if (this.parent === grandparent) {
            this.x += parent.x;
            this.y += parent.y;
        }
        if (this._animation.position === 0) {
            this.y -= target.height;
        } else if (this._animation.position === 1) {
            this.y -= target.height / 2;
        }
    }
};

Sprite_AnimationMV.prototype.updateFrame = function() {
    if (this._duration > 0) {
        const frameIndex = this.currentFrameIndex();
        this.updateAllCellSprites(this._animation.frames[frameIndex]);
        for (const timing of this._animation.timings) {
            if (timing.frame === frameIndex) {
                this.processTimingData(timing);
            }
        }
    }
};

Sprite_AnimationMV.prototype.currentFrameIndex = function() {
    return (
        this._animation.frames.length -
        Math.floor((this._duration + this._rate - 1) / this._rate)
    );
};

Sprite_AnimationMV.prototype.updateAllCellSprites = function(frame) {
    if (this._targets.length > 0) {
        for (let i = 0; i < this._cellSprites.length; i++) {
            const sprite = this._cellSprites[i];
            if (i < frame.length) {
                this.updateCellSprite(sprite, frame[i]);
            } else {
                sprite.visible = false;
            }
        }
    }
};

Sprite_AnimationMV.prototype.updateCellSprite = function(sprite, cell) {
    const pattern = cell[0];
    if (pattern >= 0) {
        const sx = (pattern % 5) * 192;
        const sy = Math.floor((pattern % 100) / 5) * 192;
        const mirror = this._mirror;
        sprite.bitmap = pattern < 100 ? this._bitmap1 : this._bitmap2;
        sprite.setHue(pattern < 100 ? this._hue1 : this._hue2);
        sprite.setFrame(sx, sy, 192, 192);
        sprite.x = cell[1];
        sprite.y = cell[2];
        sprite.rotation = (cell[4] * Math.PI) / 180;
        sprite.scale.x = cell[3] / 100;

        if (cell[5]) {
            sprite.scale.x *= -1;
        }
        if (mirror) {
            sprite.x *= -1;
            sprite.rotation *= -1;
            sprite.scale.x *= -1;
        }

        sprite.scale.y = cell[3] / 100;
        sprite.opacity = cell[6];
        sprite.blendMode = cell[7];
        sprite.visible = true;
    } else {
        sprite.visible = false;
    }
};

/**
 * The same for an MV animation, applied to the whole sprite rather than to its
 * cells: a cell carries a pixel offset as well as a size, and scaling only the
 * art would leave the parts of an explosion spread at flat distances.
 */
Sprite_AnimationMV.prototype.reactor3DScale = Sprite_Animation.prototype.reactor3DScale;

Sprite_AnimationMV.prototype._reactor3dBaseUpdate = Sprite_AnimationMV.prototype.update;
Sprite_AnimationMV.prototype.update = function() {
    this._reactor3dBaseUpdate();
    const scale = this.reactor3DScale();
    this.scale.x = scale;
    this.scale.y = scale;
};

Sprite_AnimationMV.prototype.processTimingData = function(timing) {
    const duration = timing.flashDuration * this._rate;
    switch (timing.flashScope) {
        case 1:
            this.startFlash(timing.flashColor, duration);
            break;
        case 2:
            this.startScreenFlash(timing.flashColor, duration);
            break;
        case 3:
            this.startHiding(duration);
            break;
    }
    if (timing.se) {
        AudioManager.playSe(timing.se);
    }
};

Sprite_AnimationMV.prototype.startFlash = function(color, duration) {
    this._flashColor = color.clone();
    this._flashDuration = duration;
};

Sprite_AnimationMV.prototype.startScreenFlash = function(color, duration) {
    this._screenFlashDuration = duration;
    if (this._screenFlashSprite) {
        this._screenFlashSprite.setColor(color[0], color[1], color[2]);
        this._screenFlashSprite.opacity = color[3];
    }
};

Sprite_AnimationMV.prototype.startHiding = function(duration) {
    this._hidingDuration = duration;
    for (const target of this._targets) {
        target.hide();
    }
};

Sprite_AnimationMV.prototype.onEnd = function() {
    this._flashDuration = 0;
    this._screenFlashDuration = 0;
    this._hidingDuration = 0;
    for (const target of this._targets) {
        target.setBlendColor([0, 0, 0, 0]);
        target.show();
    }
};

//-----------------------------------------------------------------------------
// Sprite_Battleback
//
// The sprite for displaying a background image in battle.

function Sprite_Battleback() {
    this.initialize(...arguments);
}

Sprite_Battleback.prototype = Object.create(TilingSprite.prototype);
Sprite_Battleback.prototype.constructor = Sprite_Battleback;

Sprite_Battleback.prototype.initialize = function(type) {
    TilingSprite.prototype.initialize.call(this);
    if (type === 0) {
        this.bitmap = this.battleback1Bitmap();
    } else {
        this.bitmap = this.battleback2Bitmap();
    }
};

Sprite_Battleback.prototype.adjustPosition = function() {
    this.width = Math.floor((1000 * Graphics.width) / 816);
    this.height = Math.floor((740 * Graphics.height) / 624);
    this.x = (Graphics.width - this.width) / 2;
    if ($gameSystem.isSideView()) {
        this.y = Graphics.height - this.height;
    } else {
        this.y = 0;
    }
    const ratioX = this.width / this.bitmap.width;
    const ratioY = this.height / this.bitmap.height;
    const scale = Math.max(ratioX, ratioY, 1.0);
    this.scale.x = scale;
    this.scale.y = scale;
};

Sprite_Battleback.prototype.battleback1Bitmap = function() {
    return ImageManager.loadBattleback1(this.battleback1Name());
};

Sprite_Battleback.prototype.battleback2Bitmap = function() {
    return ImageManager.loadBattleback2(this.battleback2Name());
};

Sprite_Battleback.prototype.battleback1Name = function() {
    if (BattleManager.isBattleTest()) {
        return $dataSystem.battleback1Name;
    } else if ($gameMap.battleback1Name() !== null) {
        return $gameMap.battleback1Name();
    } else if ($gameMap.isOverworld()) {
        return this.overworldBattleback1Name();
    } else {
        return "";
    }
};

Sprite_Battleback.prototype.battleback2Name = function() {
    if (BattleManager.isBattleTest()) {
        return $dataSystem.battleback2Name;
    } else if ($gameMap.battleback2Name() !== null) {
        return $gameMap.battleback2Name();
    } else if ($gameMap.isOverworld()) {
        return this.overworldBattleback2Name();
    } else {
        return "";
    }
};

Sprite_Battleback.prototype.overworldBattleback1Name = function() {
    if ($gamePlayer.isInVehicle()) {
        return this.shipBattleback1Name();
    } else {
        return this.normalBattleback1Name();
    }
};

Sprite_Battleback.prototype.overworldBattleback2Name = function() {
    if ($gamePlayer.isInVehicle()) {
        return this.shipBattleback2Name();
    } else {
        return this.normalBattleback2Name();
    }
};

Sprite_Battleback.prototype.normalBattleback1Name = function() {
    return (
        this.terrainBattleback1Name(this.autotileType(1)) ||
        this.terrainBattleback1Name(this.autotileType(0)) ||
        this.defaultBattleback1Name()
    );
};

Sprite_Battleback.prototype.normalBattleback2Name = function() {
    return (
        this.terrainBattleback2Name(this.autotileType(1)) ||
        this.terrainBattleback2Name(this.autotileType(0)) ||
        this.defaultBattleback2Name()
    );
};

Sprite_Battleback.prototype.terrainBattleback1Name = function(type) {
    switch (type) {
        case 24:
        case 25:
            return "Wasteland";
        case 26:
        case 27:
            return "DirtField";
        case 32:
        case 33:
            return "Desert";
        case 34:
            return "Lava1";
        case 35:
            return "Lava2";
        case 40:
        case 41:
            return "Snowfield";
        case 42:
            return "Clouds";
        case 4:
        case 5:
            return "PoisonSwamp";
        default:
            return null;
    }
};

Sprite_Battleback.prototype.terrainBattleback2Name = function(type) {
    switch (type) {
        case 20:
        case 21:
            return "Forest";
        case 22:
        case 30:
        case 38:
            return "Cliff";
        case 24:
        case 25:
        case 26:
        case 27:
            return "Wasteland";
        case 32:
        case 33:
            return "Desert";
        case 34:
        case 35:
            return "Lava";
        case 40:
        case 41:
            return "Snowfield";
        case 42:
            return "Clouds";
        case 4:
        case 5:
            return "PoisonSwamp";
    }
};

Sprite_Battleback.prototype.defaultBattleback1Name = function() {
    return "Grassland";
};

Sprite_Battleback.prototype.defaultBattleback2Name = function() {
    return "Grassland";
};

Sprite_Battleback.prototype.shipBattleback1Name = function() {
    return "Ship";
};

Sprite_Battleback.prototype.shipBattleback2Name = function() {
    return "Ship";
};

Sprite_Battleback.prototype.autotileType = function(z) {
    return $gameMap.autotileType($gamePlayer.x, $gamePlayer.y, z);
};

//-----------------------------------------------------------------------------
// Sprite_Damage
//
// The sprite for displaying a popup damage.

function Sprite_Damage() {
    this.initialize(...arguments);
}

Sprite_Damage.prototype = Object.create(Sprite.prototype);
Sprite_Damage.prototype.constructor = Sprite_Damage;

Sprite_Damage.prototype.initialize = function() {
    Sprite.prototype.initialize.call(this);
    this._duration = 90;
    this._flashColor = [0, 0, 0, 0];
    this._flashDuration = 0;
    this._colorType = 0;
};

Sprite_Damage.prototype.destroy = function(options) {
    for (const child of this.children) {
        if (child.bitmap) {
            child.bitmap.destroy();
        }
    }
    Sprite.prototype.destroy.call(this, options);
};

Sprite_Damage.prototype.setup = function(target) {
    const result = target.result();
    if (result.missed || result.evaded) {
        this._colorType = 0;
        this.createMiss();
    } else if (result.hpAffected) {
        this._colorType = result.hpDamage >= 0 ? 0 : 1;
        this.createDigits(result.hpDamage);
    } else if (target.isAlive() && result.mpDamage !== 0) {
        this._colorType = result.mpDamage >= 0 ? 2 : 3;
        this.createDigits(result.mpDamage);
    }
    if (result.critical) {
        this.setupCriticalEffect();
    }
};

Sprite_Damage.prototype.setupCriticalEffect = function() {
    this._flashColor = [255, 0, 0, 160];
    this._flashDuration = 60;
};

Sprite_Damage.prototype.fontFace = function() {
    return $gameSystem.numberFontFace();
};

Sprite_Damage.prototype.fontSize = function() {
    return $gameSystem.mainFontSize() + 4;
};

Sprite_Damage.prototype.damageColor = function() {
    return ColorManager.damageColor(this._colorType);
};

Sprite_Damage.prototype.outlineColor = function() {
    return "rgba(0, 0, 0, 0.7)";
};

Sprite_Damage.prototype.outlineWidth = function() {
    return 4;
};

Sprite_Damage.prototype.createMiss = function() {
    const h = this.fontSize();
    const w = Math.floor(h * 3.0);
    const sprite = this.createChildSprite(w, h);
    sprite.bitmap.drawText("Miss", 0, 0, w, h, "center");
    sprite.dy = 0;
};

Sprite_Damage.prototype.createDigits = function(value) {
    const string = Math.abs(value).toString();
    const h = this.fontSize();
    const w = Math.floor(h * 0.75);
    for (let i = 0; i < string.length; i++) {
        const sprite = this.createChildSprite(w, h);
        sprite.bitmap.drawText(string[i], 0, 0, w, h, "center");
        sprite.x = (i - (string.length - 1) / 2) * w;
        sprite.dy = -i;
    }
};

Sprite_Damage.prototype.createChildSprite = function(width, height) {
    const sprite = new Sprite();
    sprite.bitmap = this.createBitmap(width, height);
    sprite.anchor.x = 0.5;
    sprite.anchor.y = 1;
    sprite.y = -40;
    sprite.ry = sprite.y;
    this.addChild(sprite);
    return sprite;
};

Sprite_Damage.prototype.createBitmap = function(width, height) {
    const bitmap = new Bitmap(width, height);
    bitmap.fontFace = this.fontFace();
    bitmap.fontSize = this.fontSize();
    bitmap.textColor = this.damageColor();
    bitmap.outlineColor = this.outlineColor();
    bitmap.outlineWidth = this.outlineWidth();
    return bitmap;
};

Sprite_Damage.prototype.update = function() {
    Sprite.prototype.update.call(this);
    if (this._duration > 0) {
        this._duration--;
        for (const child of this.children) {
            this.updateChild(child);
        }
    }
    this.updateFlash();
    this.updateOpacity();
};

Sprite_Damage.prototype.updateChild = function(sprite) {
    sprite.dy += 0.5;
    sprite.ry += sprite.dy;
    if (sprite.ry >= 0) {
        sprite.ry = 0;
        sprite.dy *= -0.6;
    }
    sprite.y = Math.round(sprite.ry);
    sprite.setBlendColor(this._flashColor);
};

Sprite_Damage.prototype.updateFlash = function() {
    if (this._flashDuration > 0) {
        const d = this._flashDuration--;
        this._flashColor[3] *= (d - 1) / d;
    }
};

Sprite_Damage.prototype.updateOpacity = function() {
    if (this._duration < 10) {
        this.opacity = (255 * this._duration) / 10;
    }
};

Sprite_Damage.prototype.isPlaying = function() {
    return this._duration > 0;
};

//-----------------------------------------------------------------------------
// Sprite_Gauge
//
// The sprite for displaying a status gauge.

function Sprite_Gauge() {
    this.initialize(...arguments);
}

Sprite_Gauge.prototype = Object.create(Sprite.prototype);
Sprite_Gauge.prototype.constructor = Sprite_Gauge;

Sprite_Gauge.prototype.initialize = function() {
    Sprite.prototype.initialize.call(this);
    this.initMembers();
    this.createBitmap();
};

Sprite_Gauge.prototype.initMembers = function() {
    this._battler = null;
    this._statusType = "";
    this._value = NaN;
    this._maxValue = NaN;
    this._targetValue = NaN;
    this._targetMaxValue = NaN;
    this._duration = 0;
    this._flashingCount = 0;
};

Sprite_Gauge.prototype.destroy = function(options) {
    this.bitmap.destroy();
    Sprite.prototype.destroy.call(this, options);
};

Sprite_Gauge.prototype.createBitmap = function() {
    const width = this.bitmapWidth();
    const height = this.bitmapHeight();
    this.bitmap = new Bitmap(width, height);
};

Sprite_Gauge.prototype.bitmapWidth = function() {
    return 128;
};

Sprite_Gauge.prototype.bitmapHeight = function() {
    return 32;
};

Sprite_Gauge.prototype.textHeight = function() {
    return 24;
};

Sprite_Gauge.prototype.gaugeHeight = function() {
    return 12;
};

Sprite_Gauge.prototype.gaugeX = function() {
    if (this._statusType === "time") {
        return 0;
    } else {
        return this.measureLabelWidth() + 6;
    }
};

Sprite_Gauge.prototype.labelY = function() {
    return 3;
};

Sprite_Gauge.prototype.labelFontFace = function() {
    return $gameSystem.mainFontFace();
};

Sprite_Gauge.prototype.labelFontSize = function() {
    return $gameSystem.mainFontSize() - 2;
};

Sprite_Gauge.prototype.valueFontFace = function() {
    return $gameSystem.numberFontFace();
};

Sprite_Gauge.prototype.valueFontSize = function() {
    return $gameSystem.mainFontSize() - 6;
};

Sprite_Gauge.prototype.setup = function(battler, statusType) {
    this._battler = battler;
    this._statusType = statusType;
    this._value = this.currentValue();
    this._maxValue = this.currentMaxValue();
    this.updateBitmap();
};

Sprite_Gauge.prototype.update = function() {
    Sprite.prototype.update.call(this);
    this.updateBitmap();
};

Sprite_Gauge.prototype.updateBitmap = function() {
    const value = this.currentValue();
    const maxValue = this.currentMaxValue();
    if (value !== this._targetValue || maxValue !== this._targetMaxValue) {
        this.updateTargetValue(value, maxValue);
    }
    this.updateGaugeAnimation();
    this.updateFlashing();
};

Sprite_Gauge.prototype.updateTargetValue = function(value, maxValue) {
    this._targetValue = value;
    this._targetMaxValue = maxValue;
    if (isNaN(this._value)) {
        this._value = value;
        this._maxValue = maxValue;
        this.redraw();
    } else {
        this._duration = this.smoothness();
    }
};

Sprite_Gauge.prototype.smoothness = function() {
    return this._statusType === "time" ? 5 : 20;
};

Sprite_Gauge.prototype.updateGaugeAnimation = function() {
    if (this._duration > 0) {
        const d = this._duration;
        this._value = (this._value * (d - 1) + this._targetValue) / d;
        this._maxValue = (this._maxValue * (d - 1) + this._targetMaxValue) / d;
        this._duration--;
        this.redraw();
    }
};

Sprite_Gauge.prototype.updateFlashing = function() {
    if (this._statusType === "time") {
        this._flashingCount++;
        if (this._battler.isInputting()) {
            if (this._flashingCount % 30 < 15) {
                this.setBlendColor(this.flashingColor1());
            } else {
                this.setBlendColor(this.flashingColor2());
            }
        } else {
            this.setBlendColor([0, 0, 0, 0]);
        }
    }
};

Sprite_Gauge.prototype.flashingColor1 = function() {
    return [255, 255, 255, 64];
};

Sprite_Gauge.prototype.flashingColor2 = function() {
    return [0, 0, 255, 48];
};

Sprite_Gauge.prototype.isValid = function() {
    if (this._battler) {
        if (this._statusType === "tp" && !this._battler.isPreserveTp()) {
            return $gameParty.inBattle();
        } else {
            return true;
        }
    }
    return false;
};

Sprite_Gauge.prototype.currentValue = function() {
    if (this._battler) {
        switch (this._statusType) {
            case "hp":
                return this._battler.hp;
            case "mp":
                return this._battler.mp;
            case "tp":
                return this._battler.tp;
            case "time":
                return this._battler.tpbChargeTime();
        }
    }
    return NaN;
};

Sprite_Gauge.prototype.currentMaxValue = function() {
    if (this._battler) {
        switch (this._statusType) {
            case "hp":
                return this._battler.mhp;
            case "mp":
                return this._battler.mmp;
            case "tp":
                return this._battler.maxTp();
            case "time":
                return 1;
        }
    }
    return NaN;
};

Sprite_Gauge.prototype.label = function() {
    switch (this._statusType) {
        case "hp":
            return TextManager.hpA;
        case "mp":
            return TextManager.mpA;
        case "tp":
            return TextManager.tpA;
        default:
            return "";
    }
};

Sprite_Gauge.prototype.gaugeBackColor = function() {
    return ColorManager.gaugeBackColor();
};

Sprite_Gauge.prototype.gaugeColor1 = function() {
    switch (this._statusType) {
        case "hp":
            return ColorManager.hpGaugeColor1();
        case "mp":
            return ColorManager.mpGaugeColor1();
        case "tp":
            return ColorManager.tpGaugeColor1();
        case "time":
            return ColorManager.ctGaugeColor1();
        default:
            return ColorManager.normalColor();
    }
};

Sprite_Gauge.prototype.gaugeColor2 = function() {
    switch (this._statusType) {
        case "hp":
            return ColorManager.hpGaugeColor2();
        case "mp":
            return ColorManager.mpGaugeColor2();
        case "tp":
            return ColorManager.tpGaugeColor2();
        case "time":
            return ColorManager.ctGaugeColor2();
        default:
            return ColorManager.normalColor();
    }
};

Sprite_Gauge.prototype.labelColor = function() {
    return ColorManager.systemColor();
};

Sprite_Gauge.prototype.labelOutlineColor = function() {
    return ColorManager.outlineColor();
};

Sprite_Gauge.prototype.labelOutlineWidth = function() {
    return 3;
};

Sprite_Gauge.prototype.valueColor = function() {
    switch (this._statusType) {
        case "hp":
            return ColorManager.hpColor(this._battler);
        case "mp":
            return ColorManager.mpColor(this._battler);
        case "tp":
            return ColorManager.tpColor(this._battler);
        default:
            return ColorManager.normalColor();
    }
};

Sprite_Gauge.prototype.valueOutlineColor = function() {
    return "rgba(0, 0, 0, 1)";
};

Sprite_Gauge.prototype.valueOutlineWidth = function() {
    return 2;
};

Sprite_Gauge.prototype.redraw = function() {
    this.bitmap.clear();
    const currentValue = this.currentValue();
    if (!isNaN(currentValue)) {
        this.drawGauge();
        if (this._statusType !== "time") {
            this.drawLabel();
            if (this.isValid()) {
                this.drawValue();
            }
        }
    }
};

Sprite_Gauge.prototype.drawGauge = function() {
    const gaugeX = this.gaugeX();
    const gaugeY = this.textHeight() - this.gaugeHeight();
    const gaugewidth = this.bitmapWidth() - gaugeX;
    const gaugeHeight = this.gaugeHeight();
    this.drawGaugeRect(gaugeX, gaugeY, gaugewidth, gaugeHeight);
};

Sprite_Gauge.prototype.drawGaugeRect = function(x, y, width, height) {
    const rate = this.gaugeRate();
    const fillW = Math.floor((width - 2) * rate);
    const fillH = height - 2;
    const color0 = this.gaugeBackColor();
    const color1 = this.gaugeColor1();
    const color2 = this.gaugeColor2();
    this.bitmap.fillRect(x, y, width, height, color0);
    this.bitmap.gradientFillRect(x + 1, y + 1, fillW, fillH, color1, color2);
};

Sprite_Gauge.prototype.gaugeRate = function() {
    if (this.isValid()) {
        const value = this._value;
        const maxValue = this._maxValue;
        return maxValue > 0 ? value / maxValue : 0;
    } else {
        return 0;
    }
};

Sprite_Gauge.prototype.drawLabel = function() {
    const label = this.label();
    const x = this.labelOutlineWidth() / 2;
    const y = this.labelY();
    const width = this.bitmapWidth();
    const height = this.textHeight();
    this.setupLabelFont();
    this.bitmap.paintOpacity = this.labelOpacity();
    this.bitmap.drawText(label, x, y, width, height, "left");
    this.bitmap.paintOpacity = 255;
};

Sprite_Gauge.prototype.setupLabelFont = function() {
    this.bitmap.fontFace = this.labelFontFace();
    this.bitmap.fontSize = this.labelFontSize();
    this.bitmap.textColor = this.labelColor();
    this.bitmap.outlineColor = this.labelOutlineColor();
    this.bitmap.outlineWidth = this.labelOutlineWidth();
};

Sprite_Gauge.prototype.measureLabelWidth = function() {
    this.setupLabelFont();
    const labels = [TextManager.hpA, TextManager.mpA, TextManager.tpA];
    const widths = labels.map(str => this.bitmap.measureTextWidth(str));
    return Math.ceil(Math.max(...widths));
};

Sprite_Gauge.prototype.labelOpacity = function() {
    return this.isValid() ? 255 : 160;
};

Sprite_Gauge.prototype.drawValue = function() {
    const currentValue = this.currentValue();
    const width = this.bitmapWidth();
    const height = this.textHeight();
    this.setupValueFont();
    this.bitmap.drawText(currentValue, 0, 0, width, height, "right");
};

Sprite_Gauge.prototype.setupValueFont = function() {
    this.bitmap.fontFace = this.valueFontFace();
    this.bitmap.fontSize = this.valueFontSize();
    this.bitmap.textColor = this.valueColor();
    this.bitmap.outlineColor = this.valueOutlineColor();
    this.bitmap.outlineWidth = this.valueOutlineWidth();
};

//-----------------------------------------------------------------------------
// Sprite_Name
//
// The sprite for displaying a status gauge.

function Sprite_Name() {
    this.initialize(...arguments);
}

Sprite_Name.prototype = Object.create(Sprite.prototype);
Sprite_Name.prototype.constructor = Sprite_Name;

Sprite_Name.prototype.initialize = function() {
    Sprite.prototype.initialize.call(this);
    this.initMembers();
    this.createBitmap();
};

Sprite_Name.prototype.initMembers = function() {
    this._battler = null;
    this._name = "";
    this._textColor = "";
};

Sprite_Name.prototype.destroy = function(options) {
    this.bitmap.destroy();
    Sprite.prototype.destroy.call(this, options);
};

Sprite_Name.prototype.createBitmap = function() {
    const width = this.bitmapWidth();
    const height = this.bitmapHeight();
    this.bitmap = new Bitmap(width, height);
};

Sprite_Name.prototype.bitmapWidth = function() {
    return 128;
};

Sprite_Name.prototype.bitmapHeight = function() {
    return 24;
};

Sprite_Name.prototype.fontFace = function() {
    return $gameSystem.mainFontFace();
};

Sprite_Name.prototype.fontSize = function() {
    return $gameSystem.mainFontSize();
};

Sprite_Name.prototype.setup = function(battler) {
    this._battler = battler;
    this.updateBitmap();
};

Sprite_Name.prototype.update = function() {
    Sprite.prototype.update.call(this);
    this.updateBitmap();
};

Sprite_Name.prototype.updateBitmap = function() {
    const name = this.name();
    const color = this.textColor();
    if (name !== this._name || color !== this._textColor) {
        this._name = name;
        this._textColor = color;
        this.redraw();
    }
};

Sprite_Name.prototype.name = function() {
    return this._battler ? this._battler.name() : "";
};

Sprite_Name.prototype.textColor = function() {
    return ColorManager.hpColor(this._battler);
};

Sprite_Name.prototype.outlineColor = function() {
    return ColorManager.outlineColor();
};

Sprite_Name.prototype.outlineWidth = function() {
    return 3;
};

Sprite_Name.prototype.redraw = function() {
    const name = this.name();
    const width = this.bitmapWidth();
    const height = this.bitmapHeight();
    this.setupFont();
    this.bitmap.clear();
    this.bitmap.drawText(name, 0, 0, width, height, "left");
};

Sprite_Name.prototype.setupFont = function() {
    this.bitmap.fontFace = this.fontFace();
    this.bitmap.fontSize = this.fontSize();
    this.bitmap.textColor = this.textColor();
    this.bitmap.outlineColor = this.outlineColor();
    this.bitmap.outlineWidth = this.outlineWidth();
};

//-----------------------------------------------------------------------------
// Sprite_StateIcon
//
// The sprite for displaying state icons.

function Sprite_StateIcon() {
    this.initialize(...arguments);
}

Sprite_StateIcon.prototype = Object.create(Sprite.prototype);
Sprite_StateIcon.prototype.constructor = Sprite_StateIcon;

Sprite_StateIcon.prototype.initialize = function() {
    Sprite.prototype.initialize.call(this);
    this.initMembers();
    this.loadBitmap();
};

Sprite_StateIcon.prototype.initMembers = function() {
    this._battler = null;
    this._iconIndex = 0;
    this._animationCount = 0;
    this._animationIndex = 0;
    this.anchor.x = 0.5;
    this.anchor.y = 0.5;
};

Sprite_StateIcon.prototype.loadBitmap = function() {
    this.bitmap = ImageManager.loadSystem("IconSet");
    this.setFrame(0, 0, 0, 0);
};

Sprite_StateIcon.prototype.setup = function(battler) {
    if (this._battler !== battler) {
        this._battler = battler;
        this._animationCount = this.animationWait();
    }
};

Sprite_StateIcon.prototype.update = function() {
    Sprite.prototype.update.call(this);
    this._animationCount++;
    if (this._animationCount >= this.animationWait()) {
        this.updateIcon();
        this.updateFrame();
        this._animationCount = 0;
    }
};

Sprite_StateIcon.prototype.animationWait = function() {
    return 40;
};

Sprite_StateIcon.prototype.updateIcon = function() {
    const icons = [];
    if (this.shouldDisplay()) {
        icons.push(...this._battler.allIcons());
    }
    if (icons.length > 0) {
        this._animationIndex++;
        if (this._animationIndex >= icons.length) {
            this._animationIndex = 0;
        }
        this._iconIndex = icons[this._animationIndex];
    } else {
        this._animationIndex = 0;
        this._iconIndex = 0;
    }
};

Sprite_StateIcon.prototype.shouldDisplay = function() {
    const battler = this._battler;
    return battler && (battler.isActor() || battler.isAlive());
};

Sprite_StateIcon.prototype.updateFrame = function() {
    const pw = ImageManager.iconWidth;
    const ph = ImageManager.iconHeight;
    const sx = (this._iconIndex % 16) * pw;
    const sy = Math.floor(this._iconIndex / 16) * ph;
    this.setFrame(sx, sy, pw, ph);
};

//-----------------------------------------------------------------------------
// Sprite_StateOverlay
//
// The sprite for displaying an overlay image for a state.

function Sprite_StateOverlay() {
    this.initialize(...arguments);
}

Sprite_StateOverlay.prototype = Object.create(Sprite.prototype);
Sprite_StateOverlay.prototype.constructor = Sprite_StateOverlay;

Sprite_StateOverlay.prototype.initialize = function() {
    Sprite.prototype.initialize.call(this);
    this.initMembers();
    this.loadBitmap();
};

Sprite_StateOverlay.prototype.initMembers = function() {
    this._battler = null;
    this._overlayIndex = 0;
    this._animationCount = 0;
    this._pattern = 0;
    this.anchor.x = 0.5;
    this.anchor.y = 1;
};

Sprite_StateOverlay.prototype.loadBitmap = function() {
    this.bitmap = ImageManager.loadSystem("States");
    this.setFrame(0, 0, 0, 0);
};

Sprite_StateOverlay.prototype.setup = function(battler) {
    this._battler = battler;
};

Sprite_StateOverlay.prototype.update = function() {
    Sprite.prototype.update.call(this);
    this._animationCount++;
    if (this._animationCount >= this.animationWait()) {
        this.updatePattern();
        this.updateFrame();
        this._animationCount = 0;
    }
};

Sprite_StateOverlay.prototype.animationWait = function() {
    return 8;
};

Sprite_StateOverlay.prototype.updatePattern = function() {
    this._pattern++;
    this._pattern %= 8;
    if (this._battler) {
        this._overlayIndex = this._battler.stateOverlayIndex();
    } else {
        this._overlayIndex = 0;
    }
};

Sprite_StateOverlay.prototype.updateFrame = function() {
    if (this._overlayIndex > 0) {
        const w = 96;
        const h = 96;
        const sx = this._pattern * w;
        const sy = (this._overlayIndex - 1) * h;
        this.setFrame(sx, sy, w, h);
    } else {
        this.setFrame(0, 0, 0, 0);
    }
};

//-----------------------------------------------------------------------------
// Sprite_Weapon
//
// The sprite for displaying a weapon image for attacking.

function Sprite_Weapon() {
    this.initialize(...arguments);
}

Sprite_Weapon.prototype = Object.create(Sprite.prototype);
Sprite_Weapon.prototype.constructor = Sprite_Weapon;

Sprite_Weapon.prototype.initialize = function() {
    Sprite.prototype.initialize.call(this);
    this.initMembers();
};

Sprite_Weapon.prototype.initMembers = function() {
    this._weaponImageId = 0;
    this._animationCount = 0;
    this._pattern = 0;
    this.anchor.x = 0.5;
    this.anchor.y = 1;
    this.x = -16;
};

Sprite_Weapon.prototype.setup = function(weaponImageId) {
    this._weaponImageId = weaponImageId;
    this._animationCount = 0;
    this._pattern = 0;
    this.loadBitmap();
    this.updateFrame();
};

Sprite_Weapon.prototype.update = function() {
    Sprite.prototype.update.call(this);
    this._animationCount++;
    if (this._animationCount >= this.animationWait()) {
        this.updatePattern();
        this.updateFrame();
        this._animationCount = 0;
    }
};

Sprite_Weapon.prototype.animationWait = function() {
    return 12;
};

Sprite_Weapon.prototype.updatePattern = function() {
    this._pattern++;
    if (this._pattern >= 3) {
        this._weaponImageId = 0;
    }
};

Sprite_Weapon.prototype.loadBitmap = function() {
    const pageId = Math.floor((this._weaponImageId - 1) / 12) + 1;
    if (pageId >= 1) {
        this.bitmap = ImageManager.loadSystem("Weapons" + pageId);
    } else {
        this.bitmap = ImageManager.loadSystem("");
    }
};

Sprite_Weapon.prototype.updateFrame = function() {
    if (this._weaponImageId > 0) {
        const index = (this._weaponImageId - 1) % 12;
        const w = 96;
        const h = 64;
        const sx = (Math.floor(index / 6) * 3 + this._pattern) * w;
        const sy = Math.floor(index % 6) * h;
        this.setFrame(sx, sy, w, h);
    } else {
        this.setFrame(0, 0, 0, 0);
    }
};

Sprite_Weapon.prototype.isPlaying = function() {
    return this._weaponImageId > 0;
};

//-----------------------------------------------------------------------------
// Sprite_Balloon
//
// The sprite for displaying a balloon icon.

function Sprite_Balloon() {
    this.initialize(...arguments);
}

Sprite_Balloon.prototype = Object.create(Sprite.prototype);
Sprite_Balloon.prototype.constructor = Sprite_Balloon;

Sprite_Balloon.prototype.initialize = function() {
    Sprite.prototype.initialize.call(this);
    this.initMembers();
    this.loadBitmap();
};

Sprite_Balloon.prototype.initMembers = function() {
    this._target = null;
    this._balloonId = 0;
    this._duration = 0;
    this.anchor.x = 0.5;
    this.anchor.y = 1;
    this.z = 7;
};

Sprite_Balloon.prototype.loadBitmap = function() {
    this.bitmap = ImageManager.loadSystem("Balloon");
    this.setFrame(0, 0, 0, 0);
};

Sprite_Balloon.prototype.setup = function(targetSprite, balloonId) {
    this._target = targetSprite;
    this._balloonId = balloonId;
    this._duration = 8 * this.speed() + this.waitTime();
};

Sprite_Balloon.prototype.update = function() {
    Sprite.prototype.update.call(this);
    if (this._duration > 0) {
        this._duration--;
        if (this._duration > 0) {
            this.updatePosition();
            this.updateFrame();
        }
    }
};

Sprite_Balloon.prototype.updatePosition = function() {
    this.x = this._target.x;
    this.y = this._target.y - this._target.height;
};

Sprite_Balloon.prototype.updateFrame = function() {
    const w = 48;
    const h = 48;
    const sx = this.frameIndex() * w;
    const sy = (this._balloonId - 1) * h;
    this.setFrame(sx, sy, w, h);
};

Sprite_Balloon.prototype.speed = function() {
    return 8;
};

Sprite_Balloon.prototype.waitTime = function() {
    return 12;
};

Sprite_Balloon.prototype.frameIndex = function() {
    const index = (this._duration - this.waitTime()) / this.speed();
    return 7 - Math.max(Math.floor(index), 0);
};

Sprite_Balloon.prototype.isPlaying = function() {
    return this._duration > 0;
};

//-----------------------------------------------------------------------------
// Sprite_Picture
//
// The sprite for displaying a picture.

function Sprite_Picture() {
    this.initialize(...arguments);
}

Sprite_Picture.prototype = Object.create(Sprite_Clickable.prototype);
Sprite_Picture.prototype.constructor = Sprite_Picture;

Sprite_Picture.prototype.initialize = function(pictureId) {
    Sprite_Clickable.prototype.initialize.call(this);
    this._pictureId = pictureId;
    this._pictureName = "";
    this.update();
};

Sprite_Picture.prototype.picture = function() {
    return $gameScreen.picture(this._pictureId);
};

Sprite_Picture.prototype.update = function() {
    Sprite_Clickable.prototype.update.call(this);
    this.updateBitmap();
    if (this.visible) {
        this.updateOrigin();
        this.updatePosition();
        this.updateScale();
        this.updateTone();
        this.updateOther();
    }
};

Sprite_Picture.prototype.updateBitmap = function() {
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
        this.bitmap = null;
        this.visible = false;
    }
};

Sprite_Picture.prototype.updateOrigin = function() {
    const picture = this.picture();
    if (picture.origin() === 0) {
        this.anchor.x = 0;
        this.anchor.y = 0;
    } else {
        this.anchor.x = 0.5;
        this.anchor.y = 0.5;
    }
};

Sprite_Picture.prototype.updatePosition = function() {
    const picture = this.picture();
    this.x = Math.round(picture.x());
    this.y = Math.round(picture.y());
};

Sprite_Picture.prototype.updateScale = function() {
    const picture = this.picture();
    this.scale.x = picture.scaleX() / 100;
    this.scale.y = picture.scaleY() / 100;
};

Sprite_Picture.prototype.updateTone = function() {
    const picture = this.picture();
    if (picture.tone()) {
        this.setColorTone(picture.tone());
    } else {
        this.setColorTone([0, 0, 0, 0]);
    }
};

Sprite_Picture.prototype.updateOther = function() {
    const picture = this.picture();
    this.opacity = picture.opacity();
    this.blendMode = picture.blendMode();
    this.rotation = (picture.angle() * Math.PI) / 180;
};

Sprite_Picture.prototype.loadBitmap = function() {
    this.bitmap = ImageManager.loadPicture(this._pictureName);
};

//-----------------------------------------------------------------------------
// Sprite_Timer
//
// The sprite for displaying the timer.

function Sprite_Timer() {
    this.initialize(...arguments);
}

Sprite_Timer.prototype = Object.create(Sprite.prototype);
Sprite_Timer.prototype.constructor = Sprite_Timer;

Sprite_Timer.prototype.initialize = function() {
    Sprite.prototype.initialize.call(this);
    this._seconds = 0;
    this.createBitmap();
    this.update();
};

Sprite_Timer.prototype.destroy = function(options) {
    this.bitmap.destroy();
    Sprite.prototype.destroy.call(this, options);
};

Sprite_Timer.prototype.createBitmap = function() {
    this.bitmap = new Bitmap(96, 48);
    this.bitmap.fontFace = this.fontFace();
    this.bitmap.fontSize = this.fontSize();
    this.bitmap.outlineColor = ColorManager.outlineColor();
};

Sprite_Timer.prototype.fontFace = function() {
    return $gameSystem.numberFontFace();
};

Sprite_Timer.prototype.fontSize = function() {
    return $gameSystem.mainFontSize() + 8;
};

Sprite_Timer.prototype.update = function() {
    Sprite.prototype.update.call(this);
    this.updateBitmap();
    this.updatePosition();
    this.updateVisibility();
};

Sprite_Timer.prototype.updateBitmap = function() {
    if (this._seconds !== $gameTimer.seconds()) {
        this._seconds = $gameTimer.seconds();
        this.redraw();
    }
};

Sprite_Timer.prototype.redraw = function() {
    const text = this.timerText();
    const width = this.bitmap.width;
    const height = this.bitmap.height;
    this.bitmap.clear();
    this.bitmap.drawText(text, 0, 0, width, height, "center");
};

Sprite_Timer.prototype.timerText = function() {
    const min = Math.floor(this._seconds / 60) % 60;
    const sec = this._seconds % 60;
    return min.padZero(2) + ":" + sec.padZero(2);
};

Sprite_Timer.prototype.updatePosition = function() {
    this.x = (Graphics.width - this.bitmap.width) / 2;
    this.y = 0;
};

Sprite_Timer.prototype.updateVisibility = function() {
    this.visible = $gameTimer.isWorking();
};

//-----------------------------------------------------------------------------
// Sprite_Destination
//
// The sprite for displaying the destination place of the touch input.

function Sprite_Destination() {
    this.initialize(...arguments);
}

Sprite_Destination.prototype = Object.create(Sprite.prototype);
Sprite_Destination.prototype.constructor = Sprite_Destination;

Sprite_Destination.prototype.initialize = function() {
    Sprite.prototype.initialize.call(this);
    this.createBitmap();
    this._frameCount = 0;
};

Sprite_Destination.prototype.destroy = function(options) {
    if (this.bitmap) {
        this.bitmap.destroy();
    }
    Sprite.prototype.destroy.call(this, options);
};

Sprite_Destination.prototype.update = function() {
    Sprite.prototype.update.call(this);
    if ($gameTemp.isDestinationValid()) {
        this.updatePosition();
        this.updateAnimation();
        this.visible = true;
    } else {
        this._frameCount = 0;
        this.visible = false;
    }
};

Sprite_Destination.prototype.createBitmap = function() {
    const tileWidth = $gameMap.tileWidth();
    const tileHeight = $gameMap.tileHeight();
    this.bitmap = new Bitmap(tileWidth, tileHeight);
    this.bitmap.fillAll("white");
    this.anchor.x = 0.5;
    this.anchor.y = 0.5;
    this.blendMode = 1;
};

Sprite_Destination.prototype.updatePosition = function() {
    const tileWidth = $gameMap.tileWidth();
    const tileHeight = $gameMap.tileHeight();
    const x = $gameTemp.destinationX();
    const y = $gameTemp.destinationY();
    this.x = ($gameMap.adjustX(x) + 0.5) * tileWidth;
    this.y = ($gameMap.adjustY(y) + 0.5) * tileHeight;
};

Sprite_Destination.prototype.updateAnimation = function() {
    this._frameCount++;
    this._frameCount %= 20;
    this.opacity = (20 - this._frameCount) * 6;
    this.scale.x = 1 + this._frameCount / 20;
    this.scale.y = this.scale.x;
};

//-----------------------------------------------------------------------------
// Spriteset_Base
//
// The superclass of Spriteset_Map and Spriteset_Battle.

function Spriteset_Base() {
    this.initialize(...arguments);
}

Spriteset_Base.prototype = Object.create(Sprite.prototype);
Spriteset_Base.prototype.constructor = Spriteset_Base;

Spriteset_Base.prototype.initialize = function() {
    Sprite.prototype.initialize.call(this);
    this.setFrame(0, 0, Graphics.width, Graphics.height);
    this.loadSystemImages();
    this.createLowerLayer();
    this.createUpperLayer();
    this._animationSprites = [];
};

Spriteset_Base.prototype.destroy = function(options) {
    this.removeAllAnimations();
    Sprite.prototype.destroy.call(this, options);
};

Spriteset_Base.prototype.loadSystemImages = function() {
    //
};

Spriteset_Base.prototype.createLowerLayer = function() {
    this.createBaseSprite();
    this.createBaseFilters();
};

Spriteset_Base.prototype.createUpperLayer = function() {
    this.createPictures();
    this.createTimer();
    this.createOverallFilters();
};

Spriteset_Base.prototype.update = function() {
    Sprite.prototype.update.call(this);
    this.updateBaseFilters();
    this.updateOverallFilters();
    this.updatePosition();
    this.updateAnimations();
};

Spriteset_Base.prototype.createBaseSprite = function() {
    this._baseSprite = new PIXI.Container();
    this._blackScreen = new ScreenSprite();
    this._blackScreen.opacity = 255;
    this.addChild(this._baseSprite);
    this._baseSprite.addChild(this._blackScreen);
};

Spriteset_Base.prototype.createBaseFilters = function() {
    this._baseColorFilter = new ColorFilter();
    // v8: assign the full array in one go (the setter stores a frozen copy
    // so .push on it afterwards fails).
    this._baseSprite.filters = [this._baseColorFilter];
};

Spriteset_Base.prototype.createPictures = function() {
    const rect = this.pictureContainerRect();
    this._pictureContainer = new PIXI.Container();
    this._pictureContainer.setFrame(rect.x, rect.y, rect.width, rect.height);
    for (let i = 1; i <= $gameScreen.maxPictures(); i++) {
        this._pictureContainer.addChild(new Sprite_Picture(i));
    }
    this.addChild(this._pictureContainer);
};

Spriteset_Base.prototype.pictureContainerRect = function() {
    return new Rectangle(0, 0, Graphics.width, Graphics.height);
};

Spriteset_Base.prototype.createTimer = function() {
    this._timerSprite = new Sprite_Timer();
    this.addChild(this._timerSprite);
};

Spriteset_Base.prototype.createOverallFilters = function() {
    this._overallColorFilter = new ColorFilter();
    // v8: assign the full array in one go (the setter stores a frozen copy
    // so .push on it afterwards fails).
    this.filters = [this._overallColorFilter];
};

Spriteset_Base.prototype.updateBaseFilters = function() {
    const filter = this._baseColorFilter;
    filter.setColorTone($gameScreen.tone());
};

Spriteset_Base.prototype.updateOverallFilters = function() {
    const filter = this._overallColorFilter;
    filter.setBlendColor($gameScreen.flashColor());
    filter.setBrightness($gameScreen.brightness());
};

Spriteset_Base.prototype.updatePosition = function() {
    const screen = $gameScreen;
    const scale = screen.zoomScale();
    this.scale.x = scale;
    this.scale.y = scale;
    this.x = Math.round(-screen.zoomX() * (scale - 1));
    this.y = Math.round(-screen.zoomY() * (scale - 1));
    this.x += Math.round(screen.shake());
};

Spriteset_Base.prototype.findTargetSprite = function(/*target*/) {
    return null;
};

Spriteset_Base.prototype.updateAnimations = function() {
    for (const sprite of this._animationSprites) {
        if (!sprite.isPlaying()) {
            // MV-format animations get one grace tick before removal. MV
            // removes finished animations on the tick AFTER their duration
            // hits zero (the owner sprite checks isPlaying at the start of
            // its next update), so a looping animation retriggered exactly
            // at its duration hands off seamlessly: the old sprite still
            // shows its last frame on the tick the fresh sprite hasn't
            // drawn yet. Removing eagerly leaves that tick blank — flags
            // animated via "show, wait duration-1, repeat" blink. The
            // grace is stamped with the frame count, not a boolean:
            // updateAnimations runs twice per tick on the map (once via
            // Spriteset_Base.update, once from Spriteset_Map.update, as in
            // stock MZ), and a boolean would be consumed within one tick.
            // The sprite stops running updatePosition once finished, so
            // keep it glued to its (possibly scrolling) target during the
            // grace tick to avoid a one-frame position jump.
            if (window.Sprite_AnimationMV &&
                sprite instanceof Sprite_AnimationMV &&
                sprite._rrEndGraceTick === undefined) {
                sprite._rrEndGraceTick = Graphics.frameCount;
                if (sprite.updatePosition) {
                    try { sprite.updatePosition(); } catch (e) { /* keep last position */ }
                }
            } else if (sprite._rrEndGraceTick === Graphics.frameCount) {
                // Same tick as the grace mark: keep for this render.
            } else {
                this.removeAnimation(sprite);
            }
        }
    }
    this.processAnimationRequests();
};

Spriteset_Base.prototype.processAnimationRequests = function() {
    for (;;) {
        const request = $gameTemp.retrieveAnimation();
        if (request) {
            this.createAnimation(request);
        } else {
            break;
        }
    }
};

Spriteset_Base.prototype.createAnimation = function(request) {
    const animation = $dataAnimations[request.animationId];
    const targets = request.targets;
    const mirror = request.mirror;
    let delay = this.animationBaseDelay();
    const nextDelay = this.animationNextDelay();
    if (this.isAnimationForEach(animation)) {
        for (const target of targets) {
            this.createAnimationSprite([target], animation, mirror, delay);
            delay += nextDelay;
        }
    } else {
        this.createAnimationSprite(targets, animation, mirror, delay);
    }
};

// prettier-ignore
Spriteset_Base.prototype.createAnimationSprite = function(
    targets, animation, mirror, delay
) {
    const mv = this.isMVAnimation(animation);
    const sprite = new (mv ? Sprite_AnimationMV : Sprite_Animation)();
    const targetSprites = this.makeTargetSprites(targets);
    const baseDelay = this.animationBaseDelay();
    const previous = delay > baseDelay ? this.lastAnimationSprite() : null;
    if (this.animationShouldMirror(targets[0])) {
        mirror = !mirror;
    }
    sprite.targetObjects = targets;
    sprite.setup(targetSprites, animation, mirror, delay, previous);
    this._effectsContainer.addChild(sprite);

    /*
     * An event may say for itself which layer its animations play on.
     *
     * Where an animation belongs is a question about the *scene*, not about
     * the engine: a spell cast over a character should be in front of the
     * furniture, and a glow on a console set into a table should be behind the
     * table's own top. One map will want both, so the answer cannot be a
     * setting — it is written on the event the animation is played on, which is
     * the only place that knows.
     *
     *   <animation z: 6>   put this event's animations on layer 6
     *   <animation over>   put them where RPG Maker puts them, above everything
     *
     * The layers are the tilemap's own: 0 the ground tiles, 3 the characters,
     * 4 the tiles drawn over characters — which in 3D is the star-flagged pass
     * — and 8 where an animation goes by default. A half above a layer sits
     * clear of everything on it.
     *
     * Read in both views. 2D has the same question and no way to answer it,
     * since an animation there is always at 8 and so always over everything.
     */
    const authored = this.authoredAnimationZ(targets);
    if (authored !== null) sprite.z = authored;

    /*
     * In 3D, an animation played *on* something belongs where that thing is.
     *
     * An animation carries no `z`, so the tilemap's sort leaves it wherever it
     * was added — which is last, and therefore in front of everything. In 2D
     * that is the convention and it is fine: the map is flat, and an effect
     * over the top of it reads as an effect.
     *
     * 3D draws the world in two passes, one below the characters and one above
     * them, and an animation floating over both is in front of the entire map
     * however far away the thing playing it is. A banner animating on a wall
     * at the back of a street drew over the sign standing in front of it.
     *
     * But only for animations that have somewhere to be. Head, centre and feet
     * are all positions on a target, so they take the target's own place in the
     * sort and are covered by whatever covers it. Screen animations are not on
     * the map at all — they are played over the whole view, and clipping one
     * behind a building would be a bug rather than a fix. The author has
     * already said which of the two this is.
     *
     * Only on a map with a 3D scene: `_reactor3d` is a Spriteset_Map field, so
     * battle animations keep the convention they have always had.
     */
    if (authored === null && this._reactor3d && !this.isScreenAnimation(animation)) {
        const host = targetSprites && targetSprites[0];
        const hostZ = host && typeof host.z === "number" ? host.z : null;
        // 3 is where an ordinary character sits, which is what an animation
        // with no host to ask should be treated as.
        //
        // A hair in front of its host, never level with it. The tilemap breaks
        // a tie in `z` on `y`, and an animation's `y` moves while a pass
        // sprite's is fixed at zero, so an animation given exactly its host's
        // z crosses that comparison mid-playback and flips from in front of
        // the thing it is playing on to behind it, frame by frame. The half
        // is invisible to every other `z` in the tilemap, which are whole
        // numbers a layer apart, and says the thing that is actually meant:
        // an animation played *on* something is in front of it.
        sprite.z = hostZ === null ? 3 : hostZ + 0.5;
    }
    /*
     * Sorted whichever way the `z` was decided, the default included.
     *
     * The holder sorts its children inside its own update, and MZ creates
     * animation sprites *after* the spriteset has updated its children — so a
     * sprite added this frame is still wherever `addChild` left it, which is
     * last, and last means in front of everything. It takes its proper place
     * on the frame after.
     *
     * One frame is enough to see. A looping animation restarts every few
     * frames, so three of them on a table flickered continuously between in
     * front of it and behind it, and no amount of getting the `z` right could
     * settle it: on the frame it appeared the sprite was not being sorted by
     * `z` at all.
     */
    const holder = this._effectsContainer;
    if (holder && typeof holder._sortChildren === "function") holder._sortChildren();
    this._animationSprites.push(sprite);
    if (mv && sprite._rrPrimeFirstFrame) {
        sprite._rrPrimeFirstFrame();
    }
};

/**
 * The layer an event asks its animations to play on, or null for the default.
 *
 *   <animation z: 6>   an exact layer
 *   <animation over>   where RPG Maker puts one, above everything
 *
 * Read off the *event*, because that is the thing the animation is played on
 * and the only thing that knows what it is. A map-wide setting cannot answer
 * it: one room will hold a console whose glow belongs under the table top it is
 * set into and a brazier whose flame belongs over everything, and both are
 * right.
 *
 * The first target that has asked wins. An animation played on several targets
 * at once is one sprite on one layer, so there is a single answer to give, and
 * taking the first stated one is at least predictable — where averaging or
 * refusing would be neither.
 *
 * `Game_Player`, followers and vehicles carry no note, so they never answer and
 * never need to: an animation on the player is on the thing the camera is
 * following, which is exactly the case the default already suits.
 */
Spriteset_Base.prototype.authoredAnimationZ = function(targets) {
    if (!targets) return null;
    for (const target of targets) {
        // `event()` is the *data* record, which is where a note lives; the
        // Game_Event beside it is the running state and has none.
        const data = target && typeof target.event === "function" ? target.event() : null;
        const note = data && typeof data.note === "string" ? data.note : "";
        if (!note) continue;
        const stated = note.match(/<\s*anim(?:ation)?\s+z\s*:\s*(-?\d+(?:\.\d+)?)\s*>/i);
        if (stated) {
            const z = Number(stated[1]);
            if (Number.isFinite(z)) return z;
        }
        // The shorthand for the one layer that has a name worth using.
        if (/<\s*anim(?:ation)?\s+over\s*>/i.test(note)) return Spriteset_Base.ANIMATION_Z;
    }
    return null;
};

/** Where RPG Maker puts an animation: above the tiles drawn over characters. */
Spriteset_Base.ANIMATION_Z = 8;

Spriteset_Base.prototype.isMVAnimation = function(animation) {
    return !!animation.frames;
};

Spriteset_Base.prototype.makeTargetSprites = function(targets) {
    const targetSprites = [];
    for (const target of targets) {
        const targetSprite = this.findTargetSprite(target);
        if (targetSprite) {
            targetSprites.push(targetSprite);
        }
    }
    return targetSprites;
};

Spriteset_Base.prototype.lastAnimationSprite = function() {
    return this._animationSprites[this._animationSprites.length - 1];
};

/**
 * Whether an animation is played across the screen rather than on a target.
 *
 * The author already said which. MZ's `displayType` is 2 for screen — 0 is
 * each target, 1 the centre of them all — and MV says the same thing with
 * `position` 3. Nothing here is inferred.
 */
Spriteset_Base.prototype.isScreenAnimation = function(animation) {
    if (!animation) return false;
    return this.isMVAnimation(animation)
        ? animation.position === 3
        : animation.displayType === 2;
};

Spriteset_Base.prototype.isAnimationForEach = function(animation) {
    const mv = this.isMVAnimation(animation);
    return mv ? animation.position !== 3 : animation.displayType === 0;
};

Spriteset_Base.prototype.animationBaseDelay = function() {
    return 8;
};

Spriteset_Base.prototype.animationNextDelay = function() {
    return 12;
};

Spriteset_Base.prototype.animationShouldMirror = function(target) {
    return target && target.isActor && target.isActor();
};

Spriteset_Base.prototype.removeAnimation = function(sprite) {
    this._animationSprites.remove(sprite);
    this._effectsContainer.removeChild(sprite);
    for (const target of sprite.targetObjects) {
        if (target.endAnimation) {
            target.endAnimation();
        }
    }
    sprite.destroy();
};

Spriteset_Base.prototype.removeAllAnimations = function() {
    for (const sprite of this._animationSprites.clone()) {
        this.removeAnimation(sprite);
    }
};

Spriteset_Base.prototype.isAnimationPlaying = function() {
    return this._animationSprites.length > 0;
};

//-----------------------------------------------------------------------------
// Spriteset_Map
//
// The set of sprites on the map screen.

function Spriteset_Map() {
    this.initialize(...arguments);
}

Spriteset_Map.prototype = Object.create(Spriteset_Base.prototype);
Spriteset_Map.prototype.constructor = Spriteset_Map;

Spriteset_Map.prototype.initialize = function() {
    Spriteset_Base.prototype.initialize.call(this);
    this._balloonSprites = [];
};

// (Spriteset_Map.prototype.destroy is defined once below — it folds the
// culled sprites back in AND removes balloons before the destroy cascade.)

Spriteset_Map.prototype.loadSystemImages = function() {
    Spriteset_Base.prototype.loadSystemImages.call(this);
    ImageManager.loadSystem("Balloon");
    ImageManager.loadSystem("Shadow1");
};

Spriteset_Map.prototype.createLowerLayer = function() {
    Spriteset_Base.prototype.createLowerLayer.call(this);
    this.createParallax();
    this.createTilemap();
    this.createCharacters();
    this.createShadow();
    this.createDestination();
    this.createWeather();
};

Spriteset_Map.prototype.update = function() {
    // Aim the camera before anything projects through it.
    //
    // Character sprites place themselves during the child update below, and
    // the 3D world is rendered from the camera in `updateReactor3D` after it.
    // Aiming in between meant the sprites used last frame's camera and the
    // world used this frame's — a frame apart. Standing still the two agree,
    // which is why this looked fine until something moved; walking, everything
    // drawn away from the focus slid by a frame of camera motion, and the
    // further up the screen it was the more it slid, because perspective
    // moves a distant point further per unit of camera travel than a near one.
    // A sign over a shopfront drifted against its own building.
    if (this._reactor3d) this.updateReactor3DCamera();
    // Tilemap.update() drives its PIXI 8 transform and mesh synchronization.
    // Give it this frame's camera before the child cascade; assigning the
    // origin afterwards made the update path process the previous frame and
    // left correctness to a render callback that culling can detach.
    this.updateTilemap();
    Spriteset_Base.prototype.update.call(this);
    this.updateReactor3D();
    this.updateTileset();
    this.updateParallax();
    this.updateShadow();
    this.updateWeather();
    this.updateAnimations();
    this.updateBalloons();
    // Runs AFTER child updates: plugin windows (event mini labels) force
    // visible=true inside their own update, so hiding must win afterwards
    // — the render pass is what the hide targets. Character-sprite flags
    // are consumed on the NEXT frame's update; the margin absorbs the lag.
    this.updateOffscreenCulling();
};

// Viewport culling. Big maps can carry hundreds of events, each with a
// character sprite and often a plugin overlay window (event mini labels),
// yielding 10k+ display objects of which only a small fraction is on
// screen. PIXI v8 spends real time on every object IN THE TREE each frame
// — measured ~1.3µs/object even when invisible (visibility only gates
// drawing, not tree processing) — so culled objects must be DETACHED from
// the stage, not just hidden. Detached objects are parked in an off-stage
// holder; culled windows keep their update() running (called manually) so
// their own show/fade logic can bring them back, and character sprites
// re-enter exactly where their game object says. The margin keeps
// oversized sprites and fast scrolls safe. Set
// `window.$reactorDisableCulling` to true to turn this off for debugging.
Spriteset_Map.prototype.updateOffscreenCulling = function() {
    const disabled = typeof window !== "undefined" && window.$reactorDisableCulling;
    if (!this._rrCullHolder) {
        // Deliberately NOT part of the display tree (that is the point).
        // destroy() below folds it back in so teardown cascades normally.
        this._rrCullHolder = new PIXI.Container();
    }
    const margin = 384;
    const minX = -margin;
    const maxX = Graphics.width + margin;
    const minY = -margin;
    const maxY = Graphics.height + margin;
    let reattachedToTilemap = false;
    for (const sprite of this._characterSprites) {
        const character = sprite._character;
        let culled = false;
        if (!disabled && character && character !== $gamePlayer) {
            const sx = character.screenX();
            const sy = character.screenY();
            // Cull on the drawn extent, not the anchor point: large event
            // graphics (parallax-mapping roof pieces spanning many tiles)
            // stay visible long after their anchor (bottom-center) leaves
            // the margin. Width/height are 0 until the bitmap loads, which
            // degrades to the old point test.
            const halfW = (sprite.width || 0) / 2;
            const spriteH = sprite.height || 0;
            culled =
                sx + halfW < minX || sx - halfW > maxX ||
                sy < minY || sy - spriteH > maxY;
        }
        // Never park a sprite that hasn't completed a first update: its z
        // is still undefined, and one undefined z NaN-poisons the tilemap's
        // sort comparator — JavaScript sorts with inconsistent comparators
        // produce ARBITRARY order (characters over roofs, layer flips).
        // Let it update once; it can cull next frame.
        if (culled && sprite.z === undefined) {
            culled = false;
        }
        if (culled && !sprite._rrCulled) {
            sprite._rrCullParent = sprite.parent;
            this._rrCullHolder.addChild(sprite);
        } else if (!culled && sprite._rrCulled) {
            const parent = sprite._rrCullParent || this._tilemap;
            parent.addChild(sprite);
            if (parent === this._tilemap) reattachedToTilemap = true;
            sprite._rrCullParent = null;
        }
        sprite._rrCulled = culled;
    }
    // Reattachment appends at the end of the tilemap's children — AFTER
    // this frame's z-sort already ran. Without an immediate re-sort the
    // render draws the appended sprites above the upper tile layer for a
    // frame (and continuously while walking keeps sprites crossing the
    // margin), which reads as characters standing on top of roofs.
    if (reattachedToTilemap && this._tilemap && this._tilemap._sortChildren) {
        this._tilemap._sortChildren();
    }
    // Plugin overlays attached directly to the spriteset (YEP event mini
    // labels and the like). Only windows are considered — core containers
    // (tilemap, parallax, weather, ...) are never touched. A window is
    // parked when it contributes no pixels: hidden, positioned far
    // offscreen, or fully transparent (opacity AND contentsOpacity 0 with
    // no pause sign showing — e.g. hundreds of dormant textless mini
    // labels). The pause sign is judged by the window's `pause` flag, not
    // its sprite's `visible` (the sprite stays visible with alpha 0 on
    // every open window).
    for (let i = this.children.length - 1; i >= 0; i--) {
        const child = this.children[i];
        if (!(child instanceof Window_Base)) continue;
        if (disabled) continue;
        if (this._rrWindowDormant(child, minX, maxX, minY, maxY)) {
            // Parked this tick. The display-tree cascade in Spriteset_Base
            // .update already ran its update() a moment ago, so the catch-up
            // loop below must skip it or it steps twice on the transition
            // frame — a doubled openness/animation step, and a repeat of any
            // side effect a plugin's update() performs.
            child._rrCulled = true;
            child._rrParkedThisTick = true;
            this._rrCullHolder.addChild(child);
        }
    }
    // Parked windows: keep their logic alive and bring them back the frame
    // they have something to show.
    for (let i = this._rrCullHolder.children.length - 1; i >= 0; i--) {
        const child = this._rrCullHolder.children[i];
        if (!(child instanceof Window_Base)) continue;
        if (child._rrParkedThisTick) {
            child._rrParkedThisTick = false;
            continue;
        }
        child._rrCulled = false;   // let update() run normally
        if (child.update) child.update();
        if (disabled || !this._rrWindowDormant(child, minX, maxX, minY, maxY)) {
            this.addChild(child);
        } else {
            child._rrCulled = true;
        }
    }
};

Spriteset_Map.prototype._rrWindowDormant = function(child, minX, maxX, minY, maxY) {
    if (!child.visible) return true;
    // Cull on the drawn extent, not the anchor point — the same correction the
    // character-sprite branch above already carries. Window.move assigns x/y as
    // the TOP-LEFT corner with width/height extending right and down, so a
    // window wider than the margin can still overlap the viewport while its
    // corner sits outside it. Culled objects are detached from the display
    // tree, so getting this wrong makes them disappear rather than flicker.
    const width = child.width || 0;
    const height = child.height || 0;
    if (child.x + width < minX || child.x > maxX ||
        child.y + height < minY || child.y > maxY) {
        return true;
    }
    // A transparent frame and transparent contents do not mean the window
    // draws nothing: _contentsBackSprite and anything added through
    // addInnerChild (Sprite_Gauge, Sprite_Name, Sprite_StateIcon) are siblings
    // in the client area with their own alpha, which contentsOpacity never
    // touches. Only park on opacity when there is nothing else drawing.
    if (child.opacity !== 0 || child.contentsOpacity !== 0 || child.pause) return false;
    const innerChildren = child._clientArea ? child._clientArea.children.length : 0;
    const contentsSprite = child._contentsSprite ? 1 : 0;
    const contentsBack = child._contentsBackSprite ? 1 : 0;
    return innerChildren <= contentsSprite + contentsBack;
};

// Culled objects live outside the display tree; fold them back in before
// teardown so the normal destroy cascade reaches them (no leaked textures
// on map transfer). Balloons must end here too: a balloon-wait interpreter
// polls the character's _balloonPlaying flag, and only removeAllBalloons
// clears it — skipping it soft-locks the event after a mid-balloon scene
// change.
Spriteset_Map.prototype.destroy = function(options) {
    this.removeAllBalloons();
    // Geometry, materials and textures are GPU allocations the collector cannot
    // reclaim; leaving them behind leaks a whole map's worth per transfer. The
    // viewport itself outlives the map and is only hidden.
    if (this._reactor3d) {
        this._reactor3d.scene.destroy();
        this._reactor3d.viewport.setVisible(false);
        this._reactor3d = null;
        this.destroyReactor3DSprite();
        // Whatever this map borrowed from the lighting plugin is given back.
        if (this._reactor3dLit) {
            Reactor3D.suppressFlatLighting(false);
            Reactor3D.setLights([]);
            Reactor3D.setAmbient(null);
            this._reactor3dLit = false;
        }
    }
    if (this._rrCullHolder) {
        for (const child of this._rrCullHolder.children.slice()) {
            this.addChild(child);
        }
        this._rrCullHolder.destroy();
        this._rrCullHolder = null;
    }
    Spriteset_Base.prototype.destroy.call(this, options);
};

Spriteset_Map.prototype.hideCharacters = function() {
    for (const sprite of this._characterSprites) {
        if (!sprite.isTile() && !sprite.isObjectCharacter()) {
            sprite.hide();
        }
    }
};

Spriteset_Map.prototype.createParallax = function() {
    this._parallax = new TilingSprite();
    this._parallax.move(0, 0, Graphics.width, Graphics.height);
    this._baseSprite.addChild(this._parallax);
};

Spriteset_Map.prototype.createTilemap = function() {
    const tilemap = new Tilemap();
    tilemap.tileWidth = $gameMap.tileWidth();
    tilemap.tileHeight = $gameMap.tileHeight();
    tilemap.setData($gameMap.width(), $gameMap.height(), $gameMap.data());
    tilemap.horizontalWrap = $gameMap.isLoopHorizontal();
    tilemap.verticalWrap = $gameMap.isLoopVertical();
    this._baseSprite.addChild(tilemap);
    this._effectsContainer = tilemap;
    this._tilemap = tilemap;
    this.loadTileset();
    this.createReactor3D();
};

/**
 * Swap the ground for a 3D scene, keeping everything else as it is.
 *
 * The Tilemap object stays: characters, the shadow sprite, the destination
 * marker and every plugin-authored sprite parent to it, and the effects
 * container is it. Only its two ground layers are hidden, so what disappears is
 * the drawn tiles rather than the machinery around them. The 3D ground renders
 * on its own canvas underneath, which is what leaves character sprites as
 * ordinary PIXI sprites drawn over it — the HD-2D arrangement, and the reason
 * plugins that touch Sprite_Character keep working.
 */
/**
 * Whether every tileset sheet this map draws from has finished loading.
 *
 * `createTilemap` starts the sheet loads and builds the 3D scene in the same
 * breath, but the textures come from those bitmaps — so building immediately
 * reads them empty and the map comes up blank. The 2D tilemap has no such
 * problem: it redraws itself as each sheet arrives.
 */
Spriteset_Map.prototype.isReactor3DTilesetReady = function() {
    const bitmaps = this._tilemap && this._tilemap.bitmaps;
    if (!bitmaps || !bitmaps.length) return false;
    return bitmaps.every(bitmap => !bitmap || !bitmap.isReady || bitmap.isReady());
};

Spriteset_Map.prototype.createReactor3D = function() {
    this._reactor3d = null;
    if (typeof Reactor3D === "undefined") return;
    // Every map starts by covering the 3D canvas again. A 2D map must draw on
    // an opaque canvas as it always has, and leaving the previous map's
    // transparency behind would show the page through it.
    Reactor3D.setGameCanvasTransparent(false);
    if (!Reactor3D.shouldRender3D($dataMap)) {
        // A map that asked for 3D and did not get it looks exactly like a map
        // that never asked, so the reason is said out loud rather than left to
        // be guessed at. Only for maps that asked: an ordinary 2D map is not a
        // problem and must not print anything.
        const blocker = Reactor3D.renderBlocker($dataMap);
        if (blocker && Reactor3D.isMap3D($dataMap)) {
            console.warn(`Reactor3D: this map is not being drawn in 3D — ${blocker}.`);
        }
        return;
    }

    // Wait for the sheets. `update` tries again each frame until they land,
    // which costs nothing and is how the 2D tilemap already behaves.
    if (!this.isReactor3DTilesetReady()) {
        this._reactor3dPending = true;
        return;
    }
    this._reactor3dPending = false;

    const viewport = Reactor3D.acquireViewport();
    if (!viewport) return;   // acquireViewport has already said why

    // Building the scene must not be able to take the map down with it.
    //
    // This runs inside `createTilemap`, which runs inside `onMapLoaded`, which
    // the scene calls from `isReady` — and `isReady` only marks the map loaded
    // *after* it returns. So a throw in here left the scene retrying the whole
    // map load every frame forever: a white screen, and a fresh WebGL context
    // each time until the browser began evicting live ones. 3D is a view of the
    // map; it can fail, and the map still has to draw.
    try {
        const scene = new Reactor3D.MapScene($dataMap, this._tilemap.bitmaps);
        const settings = ($dataMap.reactor3d && $dataMap.reactor3d.camera) || {};
        const camera = Reactor3D.createCamera(settings);
        viewport.setScene(scene.scene(), camera);
        viewport.setVisible(true);

        this._reactor3d = { viewport, scene, camera, settings };
        this._tilemap.lowerLayerVisible = false;
        if (this._tilemap._lowerLayer) this._tilemap._lowerLayer.visible = false;
        if (this._tilemap._upperLayer) this._tilemap._upperLayer.visible = false;
        // Aim it before anything is drawn. `createCamera` leaves the camera at
        // the origin and only the frame update moves it, so the first frame
        // was rendered from the map's corner looking off the edge.
        this.updateReactor3DCamera();

        // One line per map on the debug (Verbose) channel, because an empty
        // 3D view has several causes that look identical on screen and none
        // of them throw. `bounds` against `camera` is what tells "nothing was
        // built" from "nothing is in view".
        console.debug("Reactor3D: 3D scene built.", Object.assign(scene.report(), {
            bounds: scene.extent ? scene.extent() : "n/a",
            camera: [camera.position.x, camera.position.y, camera.position.z]
                .map(n => Math.round(n * 10) / 10).join(", ")
        }));
        // A parallax would sit over the 3D ground and hide it. 3D maps do not
        // draw one yet; this is why, rather than an oversight.
        if (this._parallax) this._parallax.visible = false;
        // The 3D ground is drawn *into* the PIXI scene rather than onto a
        // canvas behind it, so everything that composites against the map —
        // the screen tone, fog, lighting overlays, blend modes — reaches it
        // the way it reaches the 2D tilemap. Stacked canvases put it out of
        // their reach: a MULTIPLY fog had nothing to multiply against and
        // composited as a flat wash, which is why fog read heavier in 3D.
        this.createReactor3DSprite(viewport, scene);
    } catch (error) {
        console.error("Reactor3D: building the 3D scene failed; "
            + "the map is being drawn in 2D instead.", error);
        this._reactor3d = null;
        // Failed for a reason that will not change by trying again next frame.
        this._reactor3dPending = false;
        this._reactor3dFailed = true;
        // The ground layers were never hidden if we threw before that, but say
        // so plainly rather than relying on where the throw landed.
        this._tilemap.lowerLayerVisible = true;
        if (this._tilemap._lowerLayer) this._tilemap._lowerLayer.visible = true;
        if (this._tilemap._upperLayer) this._tilemap._upperLayer.visible = true;
        if (this._parallax) this._parallax.visible = true;
        this.suppressReactor3DGroundParallaxes(false);
        this.destroyReactor3DSprite();
        Reactor3D.viewport()?.setVisible(false);
    }
};

/**
 * Put the 3D render into the PIXI scene, underneath everything else.
 *
 * The three.js canvas becomes a texture on a full-screen sprite sitting where
 * the tilemap's ground used to be. It costs one full-canvas texture upload per
 * frame — what a video sprite costs — and it buys back every effect that
 * assumed the map was in the scene.
 */
Spriteset_Map.prototype.createReactor3DSprite = function(viewport, scene) {
    this.destroyReactor3DSprite();
    const shared = !!(viewport.isShared && viewport.isShared());
    const canvas = viewport.canvas ? viewport.canvas() : null;
    if ((!canvas && !shared) || typeof PIXI === "undefined") return;

    viewport.detachFromPage();

    // Two sprites, sandwiching the characters, mirroring what the 2D tilemap
    // does with its lower and upper layers: the ground goes below them and the
    // star-flagged tiles above, so a character can walk behind a tree or
    // through a doorway here as well. On a shared context each shows the
    // render target its pass draws into; on the canvas path each takes its
    // own copy of the canvas, because both are read from it in the same frame.
    const make = (holder, index, slot) => {
        if (shared) {
            const texture = viewport.passTexture(slot);
            const sprite = new PIXI.Sprite(texture);
            sprite.width = Graphics.width;
            sprite.height = Graphics.height;
            holder.addChildAt(sprite, Math.min(index, holder.children.length));
            return { sprite, texture, shared: true, generation: viewport.generation() };
        }
        const surface = document.createElement("canvas");
        surface.width = canvas.width;
        surface.height = canvas.height;
        const texture = PIXI.Texture.from(surface);
        const sprite = new PIXI.Sprite(texture);
        sprite.width = Graphics.width;
        sprite.height = Graphics.height;
        holder.addChildAt(sprite, Math.min(index, holder.children.length));
        return { sprite, texture, surface, context: surface.getContext("2d") };
    };

    /*
     * Inside the tilemap, at the layer it stands in for.
     *
     * The ground pass replaces the tilemap's *lower* layer exactly as the pass
     * below replaces its upper one, so it belongs in the same place: a child of
     * the tilemap sorted to `z` 0. Parked outside the tilemap instead, anything
     * a plugin adds *inside* it draws over the 3D ground — and parallax plugins
     * do exactly that. MultiParallax adds a TilingSprite per layer to the
     * tilemap, so the world vanished beneath them while the star-flagged pass,
     * sorted to 4, came through untouched. The symptom reads as a Reactor bug
     * with no obvious cause: tiles marked `*` appear in 3D and tiles marked `X`
     * or `O` do not.
     *
     * Sorting rather than suppressing is what keeps a backdrop a backdrop. A
     * layer the author put behind the map — MultiParallax documents `z: -1` for
     * exactly this — is still behind it, so a starfield or a warp-speed streak
     * shows around and beneath the world instead of being turned off with it.
     */
    this._reactor3dBelow = make(this._tilemap, 0, "below");
    this._reactor3dBelow.sprite.z = 0;
    // The upper pass goes *inside* the tilemap, as its last child — which is
    // exactly the place the tilemap's own upper layer occupied, above the
    // characters and below everything a plugin hangs off the spriteset. Made a
    // sibling of the tilemap instead, it floated over fog and weather that
    // ought to cover it.
    // The pass also exists when any event page is "Above characters": on a
    // map with event models those events render as billboards in this pass,
    // and it is created once here — a page switch must not need it later.
    this._reactor3dAbove = scene && ((scene.hasAbove && scene.hasAbove())
        || (typeof Reactor3D !== "undefined" && Reactor3D.mapHasAboveEvents
            && Reactor3D.mapHasAboveEvents(typeof $dataMap !== "undefined" ? $dataMap : null)))
        ? make(this._tilemap, this._tilemap.children.length, "above")
        : null;
    if (this._reactor3dAbove) {
        // The tilemap re-sorts its children by `z` every frame, so the index
        // it was added at means nothing. With no `z` it sorted as 0 — under
        // every character at 3 — and you walked in front of everything the
        // pass contained however carefully the geometry was routed into it.
        // Four is where the 2D tilemap's own upper layer sits, which is the
        // job this pass is doing.
        this._reactor3dAbove.sprite.z = 4;
    }
    // And the lights above all of it, added rather than drawn: light does not
    // cover what is beneath it, and fog and weather are things light falls on.
    // On the spriteset itself rather than the base sprite, so the screen tone
    // does not dim the lights along with the world.
    this._reactor3dLights = Reactor3D.wantsLights3D($dataMap)
        ? make(this, this.children.length, "lights")
        : null;
    if (this._reactor3dLights) {
        const sprite = this._reactor3dLights.sprite;
        // v8 names blend modes, v5-v7 number them.
        const modes = typeof PIXI !== "undefined" && PIXI.BLEND_MODES;
        sprite.blendMode = modes && modes.ADD !== undefined ? modes.ADD : "add";
    }
};

Spriteset_Map.prototype.destroyReactor3DSprite = function() {
    for (const key of ["_reactor3dBelow", "_reactor3dAbove", "_reactor3dLights"]) {
        const pass = this[key];
        if (!pass) continue;
        if (pass.sprite.parent) pass.sprite.parent.removeChild(pass.sprite);
        pass.sprite.destroy({ texture: false, baseTexture: false });
        // A shared pass texture belongs to the viewport, which reuses it for
        // the next map; only the canvas path owns its copies.
        if (!pass.shared) pass.texture.destroy(false);
        this[key] = null;
    }
};

/**
 * Hand this frame's 3D render to PIXI.
 *
 * The canvas is the texture's source, so only the upload has to be asked for;
 * v8 keeps that on `source`, v5-v7 on `baseTexture`.
 */
Spriteset_Map.prototype.updateReactor3DTexture = function(pass, from) {
    // A shared pass is already where PIXI reads it.
    if (!pass || pass.shared) return;
    // Copied off the three canvas rather than pointed at it: the second pass
    // overwrites the first on that canvas within the same frame, so each needs
    // its own surface to hold.
    pass.context.clearRect(0, 0, pass.surface.width, pass.surface.height);
    pass.context.drawImage(from, 0, 0);
    const source = pass.texture.source || pass.texture.baseTexture;
    if (source && source.update) source.update();
    else if (source) source.needsUpdate = true;
};

Spriteset_Map.prototype.reactor3D = function() {
    return this._reactor3d;
};

/**
 * Follow the player and draw the 3D pass.
 *
 * Runs before the 2D updates so character sprites, which project through this
 * camera, read a camera already aimed at this frame's position rather than the
 * previous one — otherwise they trail the ground by a frame while scrolling.
 */
Spriteset_Map.prototype.updateReactor3D = function() {
    // The sheets may have landed since `createTilemap` ran. Retried here rather
    // than waited for up front, because the scene must not stall on a sheet
    // that never arrives — a missing file leaves a 2D map, not a hung game.
    if (this._reactor3dPending && !this._reactor3dFailed) {
        this.createReactor3D();
    }

    const state = this._reactor3d;
    if (!state) return;

    // _realX/_realY interpolate between cells, so the camera glides rather than
    // stepping a whole tile at a time.
    this.updateReactor3DCamera();
    this.updateReactor3DLights(state);
    // Warm any template that landed after the scene started (the pass
    // marks each template once, so steady-state this is a no-op scan).
    if (Reactor3D.warmLoadedTemplates) Reactor3D.warmLoadedTemplates();
    if (state.scene.syncCharacterModels && typeof $gameMap !== "undefined" && $gameMap) {
        // The player and visible followers ride the same instance pool as
        // events: an actor bound to a model in the database sidecar walks
        // the map as that model.
        const characters = $gameMap.events().filter(Boolean);
        if (typeof $gamePlayer !== "undefined" && $gamePlayer) {
            characters.push($gamePlayer);
            const followers = $gamePlayer.followers && $gamePlayer.followers();
            if (followers && followers.visibleFollowers) {
                for (const follower of followers.visibleFollowers()) characters.push(follower);
            }
        }
        state.scene.syncCharacterModels(characters);
    }
    if (state.scene.syncCharacterBillboards) {
        state.scene.syncCharacterBillboards(this._characterSprites);
    }
    if (state.scene.setAnimationFrame) {
        const frame = this._tilemap && Number.isFinite(this._tilemap.animationFrame)
            ? this._tilemap.animationFrame : 0;
        state.scene.setAnimationFrame(frame);
    }
    // The flat copy of whatever the ground was built from, every frame: a
    // parallax plugin rebuilds its layers on its own schedule.
    this.suppressReactor3DGroundParallaxes(true);
    const canvas = state.viewport.canvas ? state.viewport.canvas() : null;

    // Ground first, then — if the map has anything the 2D tilemap would have
    // drawn over the characters — the upper pass. Both come off the same
    // canvas, one after the other. On a map with event models the characters
    // are billboards inside the scene, so the star-flagged tiles render WITH
    // them under one depth buffer ("world") and the upper texture carries
    // only the above-characters event overlay; split passes there would
    // stamp a structure's top flat over a character standing in front of it.
    const modelsInWorld = typeof Reactor3D !== "undefined" && Reactor3D.hasEventModels
        && typeof $dataMap !== "undefined" && Reactor3D.hasEventModels($dataMap);
    // A resize replaced the shared pass textures; the sprites follow.
    if (this._reactor3dBelow && this._reactor3dBelow.shared && state.viewport.generation
        && this._reactor3dBelow.generation !== state.viewport.generation()) {
        this.createReactor3DSprite(state.viewport, state.scene);
    }
    const split = this._reactor3dAbove || this._reactor3dLights;
    state.viewport.renderPass(state.scene,
        modelsInWorld ? "world" : (split ? "below" : "all"), "below");
    this.updateReactor3DTexture(this._reactor3dBelow, canvas);
    if (this._reactor3dAbove) {
        state.viewport.renderPass(state.scene, modelsInWorld ? "overlay" : "above", "above");
        this.updateReactor3DTexture(this._reactor3dAbove, canvas);
    }
    if (this._reactor3dLights) {
        state.viewport.renderPass(state.scene, "lights", "lights");
        this.updateReactor3DTexture(this._reactor3dLights, canvas);
        this.keepReactor3DLightsOnTop();
    }

};

/**
 * Point the camera at the player.
 *
 * Split out so the scene can be aimed the moment it is built rather than on
 * the first frame update — otherwise the first frame is drawn from wherever
 * `createCamera` left the camera, which is the origin.
 */
/**
 * Give the scene this frame's lights, if the map asked for them.
 *
 * Collected from whichever lighting plugin is installed and translated into map
 * coordinates by a shim, so a lantern becomes a sphere of light pooling on the
 * ground and a torch a cone down a corridor, rather than a circle painted flat
 * over the world.
 *
 * A map that has not asked keeps the plugin's own 2D lightmap and a fully lit
 * scene, which is exactly what it had before.
 */
Spriteset_Map.prototype.updateReactor3DLights = function(state) {
    const wants = Reactor3D.wantsLights3D($dataMap);
    if (wants !== this._reactor3dLit) {
        this._reactor3dLit = wants;
        Reactor3D.setAmbient(wants ? Reactor3D.ambientFor($dataMap) : null);
    }
    // The plugin's flat lightmap goes away while its lights are being drawn for
    // real, and comes straight back otherwise. Applied every frame rather than
    // on the change, because a plugin is entitled to rebuild its own overlay
    // whenever it likes -- and because walking from one lit 3D map to another
    // never crosses this boundary at all, so a one-shot would leave the second
    // map's freshly built overlay covering it.
    Reactor3D.suppressFlatLighting(wants);
    Reactor3D.setLights(wants ? Reactor3D.collectLights() : []);
    // Around the player, because that is what the camera is looking at: the
    // scene can only carry so many lights before the shader that samples them
    // stops compiling, so the budget goes to the ones that can be seen.
    const focus = $gamePlayer
        ? { x: $gamePlayer._realX, y: $gamePlayer._realY }
        : null;
    if (state.scene.syncLights) state.scene.syncLights(focus);
};

/**
 * Keep the light pass the last thing drawn.
 *
 * Plugins add their own layers to the spriteset long after it is built — fog,
 * weather, overlays — and each one lands on top of whatever is already there.
 * Light is the one thing that should be over all of it, so its place is
 * re-asserted rather than claimed once. Only when something has actually got
 * above it, so an ordinary frame costs a comparison.
 */
/**
 * Put away the flat copy of a parallax the 3D ground has already drawn.
 *
 * A parallax plugin adds a TilingSprite per layer to the tilemap, and the 3D
 * ground pass sits inside the tilemap too — sorted above them, so a backdrop
 * stays a backdrop. That is right for a starfield and wrong for the layer the
 * ground was *built from*: the same picture is then on screen twice, once laid
 * on the world and once pasted flat over it, at slightly different depths.
 *
 * Only the ones the ground took. `parallaxGroundLayers` is the same list the
 * ground was built from — map-pinned layers, the `!` ones — so a layer that
 * scrolls or loops is untouched and keeps drawing exactly as it did.
 *
 * `renderable` rather than `visible`, and every frame, for the same reason as
 * the lighting overlays: the plugin owns `visible` and rebuilds its layers
 * whenever it likes.
 */
Spriteset_Map.prototype.suppressReactor3DGroundParallaxes = function(hide) {
    if (!this._tilemap || typeof TilingSprite === "undefined") return;
    const taken = hide ? this.reactor3DGroundParallaxNames() : null;
    for (const child of this._tilemap.children) {
        if (!(child instanceof TilingSprite)) continue;
        if (!hide) {
            child.renderable = true;
            continue;
        }
        const name = Reactor3D.parallaxNameOf(child.bitmap);
        if (name && taken.has(name)) child.renderable = false;
    }
};

/** The parallaxes this map's 3D ground was built from, by name. */
Spriteset_Map.prototype.reactor3DGroundParallaxNames = function() {
    const names = new Set();
    for (const layer of Reactor3D.parallaxGroundLayers($dataMap)) names.add(layer.name);
    return names;
};

Spriteset_Map.prototype.keepReactor3DLightsOnTop = function() {
    const pass = this._reactor3dLights;
    const sprite = pass && pass.sprite;
    const parent = sprite && sprite.parent;
    if (!parent) return;
    const last = parent.children.length - 1;
    if (parent.children[last] !== sprite) parent.setChildIndex(sprite, last);
};

/**
 * Point the camera at what the map says it is showing.
 *
 * Not at the player. Following the player is what the map *usually* does, and
 * taking it as the rule welds the camera to them: Scroll Map, Set Zoom, and
 * every camera plugin move `displayX`/`displayY` and the zoom, and a 3D map
 * ignored all of it — the view simply would not leave the player's shoulder.
 *
 * `displayX`/`displayY` is the same number the 2D tilemap draws from, so the
 * two views agree about where the camera is by construction rather than by
 * being kept in step, and following the player still happens for free because
 * that is what moves the display in the first place.
 */
Spriteset_Map.prototype.updateReactor3DCamera = function() {
    const state = this._reactor3d;
    if (!state) return;
    const focus = this.reactor3DCameraFocus();
    const height = Reactor3D.elevationAt(
        $dataMap, Math.round(focus.x), Math.round(focus.y));
    // Zoom is a scale on the 2D screen, and a distance in three dimensions:
    // zooming in halves how far away the camera stands rather than making the
    // picture bigger, which is the same thing on a flat map and the right thing
    // on this one.
    const zoom = typeof $gameScreen !== "undefined" && $gameScreen
        && typeof $gameScreen.zoomScale === "function"
        ? Number($gameScreen.zoomScale()) || 1
        : 1;
    const settings = zoom === 1
        ? state.settings
        : Object.assign({}, state.settings, {
            distance: (state.settings.distance
                || Reactor3D.defaultCameraDistance(state.camera)) / zoom
        });
    Reactor3D.aimCamera(state.camera, { x: focus.x, y: height, z: focus.y }, settings);
};

/**
 * The centre of what the map is displaying, in map coordinates.
 *
 * `displayX` is the left-hand edge, so half a screen is added to reach the
 * middle — the point the 2D view has at its centre, which is the point the 3D
 * camera should be looking at.
 */
Spriteset_Map.prototype.reactor3DCameraFocus = function() {
    if (typeof $gameMap === "undefined" || !$gameMap || !$gameMap.displayX) {
        return { x: $gamePlayer ? $gamePlayer._realX : 0,
                 y: $gamePlayer ? $gamePlayer._realY : 0 };
    }
    const wide = $gameMap.screenTileX ? $gameMap.screenTileX() : 0;
    const tall = $gameMap.screenTileY ? $gameMap.screenTileY() : 0;
    /*
     * Given as a cell index, because that is what `aimCamera` is given.
     *
     * It adds half a tile to whatever it receives, to turn the *corner* of a
     * character's cell into the middle of it. `displayX + screenTileX / 2` is
     * not a cell corner though — it is already the exact point at the centre of
     * the view — so handing it over as-is bought a second half tile and the
     * camera looked half a cell past the middle of the screen. On screen that
     * is everything sitting slightly left of where it belongs, by a margin just
     * small enough to doubt.
     */
    return {
        x: $gameMap.displayX() + wide / 2 - 0.5,
        y: $gameMap.displayY() + tall / 2 - 0.5
    };
};

Spriteset_Map.prototype.loadTileset = function() {
    this._tileset = $gameMap.tileset();
    if (this._tileset) {
        const bitmaps = [];
        const tilesetNames = this._tileset.tilesetNames;
        for (const name of tilesetNames) {
            bitmaps.push(ImageManager.loadTileset(name));
        }
        this._tilemap.setBitmaps(bitmaps);
        this._tilemap.flags = $gameMap.tilesetFlags();
    }
};

Spriteset_Map.prototype.createCharacters = function() {
    this._characterSprites = [];
    for (const event of $gameMap.events()) {
        this._characterSprites.push(new Sprite_Character(event));
    }
    for (const vehicle of $gameMap.vehicles()) {
        this._characterSprites.push(new Sprite_Character(vehicle));
    }
    for (const follower of $gamePlayer.followers().reverseData()) {
        this._characterSprites.push(new Sprite_Character(follower));
    }
    this._characterSprites.push(new Sprite_Character($gamePlayer));
    for (const sprite of this._characterSprites) {
        this._tilemap.addChild(sprite);
    }
};

Spriteset_Map.prototype.createShadow = function() {
    this._shadowSprite = new Sprite();
    this._shadowSprite.bitmap = ImageManager.loadSystem("Shadow1");
    this._shadowSprite.anchor.x = 0.5;
    this._shadowSprite.anchor.y = 1;
    this._shadowSprite.z = 6;
    this._tilemap.addChild(this._shadowSprite);
};

Spriteset_Map.prototype.createDestination = function() {
    this._destinationSprite = new Sprite_Destination();
    this._destinationSprite.z = 9;
    this._tilemap.addChild(this._destinationSprite);
};

Spriteset_Map.prototype.createWeather = function() {
    this._weather = new Weather();
    this.addChild(this._weather);
};

Spriteset_Map.prototype.updateTileset = function() {
    if (this._tileset !== $gameMap.tileset()) {
        this.loadTileset();
    }
};

Spriteset_Map.prototype.updateParallax = function() {
    if (this._parallaxName !== $gameMap.parallaxName()) {
        this._parallaxName = $gameMap.parallaxName();
        this._parallax.bitmap = ImageManager.loadParallax(this._parallaxName);
    }
    if (this._parallax.bitmap) {
        const bitmap = this._parallax.bitmap;
        this._parallax.origin.x = $gameMap.parallaxOx() % bitmap.width;
        this._parallax.origin.y = $gameMap.parallaxOy() % bitmap.height;
    }
};

Spriteset_Map.prototype.updateTilemap = function() {
    this._tilemap.origin.x = $gameMap.displayX() * $gameMap.tileWidth();
    this._tilemap.origin.y = $gameMap.displayY() * $gameMap.tileHeight();
};

Spriteset_Map.prototype.updateShadow = function() {
    const airship = $gameMap.airship();
    this._shadowSprite.x = airship.shadowX();
    this._shadowSprite.y = airship.shadowY();
    this._shadowSprite.opacity = airship.shadowOpacity();
};

Spriteset_Map.prototype.updateWeather = function() {
    this._weather.type = $gameScreen.weatherType();
    this._weather.power = $gameScreen.weatherPower();
    this._weather.origin.x = $gameMap.displayX() * $gameMap.tileWidth();
    this._weather.origin.y = $gameMap.displayY() * $gameMap.tileHeight();
};

Spriteset_Map.prototype.updateBalloons = function() {
    for (const sprite of this._balloonSprites) {
        if (!sprite.isPlaying()) {
            this.removeBalloon(sprite);
        }
    }
    this.processBalloonRequests();
};

Spriteset_Map.prototype.processBalloonRequests = function() {
    for (;;) {
        const request = $gameTemp.retrieveBalloon();
        if (request) {
            this.createBalloon(request);
        } else {
            break;
        }
    }
};

Spriteset_Map.prototype.createBalloon = function(request) {
    const targetSprite = this.findTargetSprite(request.target);
    if (targetSprite) {
        const sprite = new Sprite_Balloon();
        sprite.targetObject = request.target;
        sprite.setup(targetSprite, request.balloonId);
        this._effectsContainer.addChild(sprite);
        this._balloonSprites.push(sprite);
    }
};

Spriteset_Map.prototype.removeBalloon = function(sprite) {
    this._balloonSprites.remove(sprite);
    this._effectsContainer.removeChild(sprite);
    if (sprite.targetObject.endBalloon) {
        sprite.targetObject.endBalloon();
    }
    sprite.destroy();
};

Spriteset_Map.prototype.removeAllBalloons = function() {
    for (const sprite of this._balloonSprites.clone()) {
        this.removeBalloon(sprite);
    }
};

Spriteset_Map.prototype.findTargetSprite = function(target) {
    return this._characterSprites.find(sprite => sprite.checkCharacter(target));
};

Spriteset_Map.prototype.animationBaseDelay = function() {
    return 0;
};

//-----------------------------------------------------------------------------
// Spriteset_Battle
//
// The set of sprites on the battle screen.

function Spriteset_Battle() {
    this.initialize(...arguments);
}

Spriteset_Battle.prototype = Object.create(Spriteset_Base.prototype);
Spriteset_Battle.prototype.constructor = Spriteset_Battle;

Spriteset_Battle.prototype.initialize = function() {
    Spriteset_Base.prototype.initialize.call(this);
    this._battlebackLocated = false;
};

Spriteset_Battle.prototype.loadSystemImages = function() {
    Spriteset_Base.prototype.loadSystemImages.call(this);
    ImageManager.loadSystem("Shadow2");
    ImageManager.loadSystem("Weapons1");
    ImageManager.loadSystem("Weapons2");
    ImageManager.loadSystem("Weapons3");
};

Spriteset_Battle.prototype.createLowerLayer = function() {
    Spriteset_Base.prototype.createLowerLayer.call(this);
    this.createBackground();
    this.createBattleback();
    this.createBattleField();
    this.createEnemies();
    this.createActors();
};

Spriteset_Battle.prototype.createBackground = function() {
    this._backgroundFilter = new PIXI.BlurFilter();
    this._backgroundSprite = new Sprite();
    this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
    this._backgroundSprite.filters = [this._backgroundFilter];
    this._baseSprite.addChild(this._backgroundSprite);
};

Spriteset_Battle.prototype.createBattleback = function() {
    this._back1Sprite = new Sprite_Battleback(0);
    this._back2Sprite = new Sprite_Battleback(1);
    this._baseSprite.addChild(this._back1Sprite);
    this._baseSprite.addChild(this._back2Sprite);
};

Spriteset_Battle.prototype.createBattleField = function() {
    const width = Graphics.boxWidth;
    const height = Graphics.boxHeight;
    const x = (Graphics.width - width) / 2;
    const y = (Graphics.height - height) / 2;
    this._battleField = new Sprite();
    this._battleField.setFrame(0, 0, width, height);
    this._battleField.x = x;
    this._battleField.y = y - this.battleFieldOffsetY();
    this._baseSprite.addChild(this._battleField);
    this._effectsContainer = this._battleField;
};

Spriteset_Battle.prototype.battleFieldOffsetY = function() {
    return 24;
};

Spriteset_Battle.prototype.update = function() {
    Spriteset_Base.prototype.update.call(this);
    this.updateActors();
    this.updateBattleback();
    this.updateAnimations();
};

Spriteset_Battle.prototype.updateBattleback = function() {
    if (!this._battlebackLocated) {
        this._back1Sprite.adjustPosition();
        this._back2Sprite.adjustPosition();
        this._battlebackLocated = true;
    }
};

Spriteset_Battle.prototype.createEnemies = function() {
    const enemies = $gameTroop.members();
    const sprites = [];
    for (const enemy of enemies) {
        sprites.push(new Sprite_Enemy(enemy));
    }
    sprites.sort(this.compareEnemySprite.bind(this));
    for (const sprite of sprites) {
        this._battleField.addChild(sprite);
    }
    this._enemySprites = sprites;
};

Spriteset_Battle.prototype.compareEnemySprite = function(a, b) {
    if (a.y !== b.y) {
        return a.y - b.y;
    } else {
        return b.spriteId - a.spriteId;
    }
};

Spriteset_Battle.prototype.createActors = function() {
    this._actorSprites = [];
    if ($gameSystem.isSideView()) {
        for (let i = 0; i < $gameParty.maxBattleMembers(); i++) {
            const sprite = new Sprite_Actor();
            this._actorSprites.push(sprite);
            this._battleField.addChild(sprite);
        }
    }
};

Spriteset_Battle.prototype.updateActors = function() {
    const members = $gameParty.battleMembers();
    for (let i = 0; i < this._actorSprites.length; i++) {
        this._actorSprites[i].setBattler(members[i]);
    }
};

Spriteset_Battle.prototype.findTargetSprite = function(target) {
    return this.battlerSprites().find(sprite => sprite.checkBattler(target));
};

Spriteset_Battle.prototype.battlerSprites = function() {
    return this._enemySprites.concat(this._actorSprites);
};

Spriteset_Battle.prototype.isEffecting = function() {
    return this.battlerSprites().some(sprite => sprite.isEffecting());
};

Spriteset_Battle.prototype.isAnyoneMoving = function() {
    return this.battlerSprites().some(sprite => sprite.isMoving());
};

Spriteset_Battle.prototype.isBusy = function() {
    return this.isAnimationPlaying() || this.isAnyoneMoving();
};

// A database-sidecar enemy renders as a live 3D model: its battler bitmap
// is an offscreen Three render refreshed here every frame. Wrapped after
// the class body above so the assignment lands on the final prototype.
const _reactorSpriteEnemyUpdate = Sprite_Enemy.prototype.update;
Sprite_Enemy.prototype.update = function() {
    _reactorSpriteEnemyUpdate.call(this);
    if (typeof Reactor3D !== "undefined" && Reactor3D.updateEnemyModelSprite) {
        Reactor3D.updateEnemyModelSprite(this);
    }
};

// A character shown as a 3D model needs no walking sheet on disk: the
// stale 2D characterName an actor kept from before going 3D would 404
// the map. Track the names so isImageChanged stays quiet, load nothing.
const _reactorSpriteCharacterUpdateBitmap = Sprite_Character.prototype.updateBitmap;
Sprite_Character.prototype.updateBitmap = function() {
    if (typeof Reactor3D !== "undefined" && Reactor3D.characterModelSpec && this._character
        && !this._character.tileId()) {
        // Whether the party is 2D or 3D comes from the async database
        // sidecar; until it answers, don't commit the player or a
        // follower to a sheet that may not exist. Leaving the tracked
        // names untouched keeps isImageChanged true, so this retries
        // every frame until the answer arrives.
        const isPartySprite =
            (typeof Game_Player !== "undefined" && this._character instanceof Game_Player)
            || (typeof Game_Follower !== "undefined" && this._character instanceof Game_Follower);
        if (isPartySprite && Reactor3D.isDatabaseSidecarReady && !Reactor3D.isDatabaseSidecarReady()) {
            if (!this.bitmap) this.bitmap = new Bitmap(1, 1);
            return;
        }
        if (Reactor3D.characterModelSpec(this._character)) {
            this._tilesetId = $gameMap.tilesetId();
            this._tileId = 0;
            this._characterName = this._character.characterName();
            this._characterIndex = this._character.characterIndex();
            if (!this.bitmap) this.bitmap = new Bitmap(1, 1);
            return;
        }
    }
    _reactorSpriteCharacterUpdateBitmap.call(this);
};

// A battler-slot actor binding renders the actor as a live 3D model in
// side view, the same way a bound enemy renders. The wrappers sit here,
// after every class body, for the same prototype-replacement reason.
const _reactorSpriteActorUpdate = Sprite_Actor.prototype.update;
Sprite_Actor.prototype.update = function() {
    _reactorSpriteActorUpdate.call(this);
    if (typeof Reactor3D !== "undefined" && Reactor3D.updateActorModelSprite) {
        Reactor3D.updateActorModelSprite(this);
    }
};

const _reactorSpriteActorUpdateBitmap = Sprite_Actor.prototype.updateBitmap;
Sprite_Actor.prototype.updateBitmap = function() {
    if (typeof Reactor3D !== "undefined" && Reactor3D.actorSlotSpec && this._actor
        && Reactor3D.actorSlotSpec(this._actor.actorId(), "battler")) {
        if (this._mainSprite && !this._mainSprite.bitmap) {
            this._mainSprite.bitmap = new Bitmap(1, 1);
        }
        return;
    }
    _reactorSpriteActorUpdateBitmap.call(this);
};

const _reactorSpriteActorUpdateFrame = Sprite_Actor.prototype.updateFrame;
Sprite_Actor.prototype.updateFrame = function() {
    const state = this._reactorBattler;
    if (state && state.ready) {
        // The model render is one full-bitmap frame, never motion cells.
        Sprite_Battler.prototype.updateFrame.call(this);
        this._mainSprite.setFrame(0, 0, state.size, state.size);
        this.setFrame(0, 0, state.size, state.size);
        return;
    }
    _reactorSpriteActorUpdateFrame.call(this);
};

// A bound enemy needs no battler art on disk: the model render owns the
// sprite's bitmap, so skip the stock image load entirely rather than
// fetch (or crash on) a file the project never shipped.
const _reactorSpriteEnemyUpdateBitmap = Sprite_Enemy.prototype.updateBitmap;
Sprite_Enemy.prototype.updateBitmap = function() {
    if (typeof Reactor3D !== "undefined" && Reactor3D.databaseModelSpec && this._enemy
        && Reactor3D.databaseModelSpec("enemies", this._enemy.enemyId())) {
        // Plugins freely read this.bitmap (state icon placement, overlays),
        // so hold an empty one until the model render replaces it.
        if (!this.bitmap) this.bitmap = new Bitmap(1, 1);
        if (!this._reactorVisibilityInit) {
            this._reactorVisibilityInit = true;
            this.initVisibility();
        }
        return;
    }
    _reactorSpriteEnemyUpdateBitmap.call(this);
};

//-----------------------------------------------------------------------------

// A live map scene can outlast its world: loading a save from a map-based
// title screen replaces $gameMap while the old scene still updates through
// its fade-out frames, and every plugin sprite keyed by map id (layer
// graphics, parallax stores) then reads the wrong map's data — a per-frame
// TypeError storm that stalls the scene transition. A spriteset serves
// exactly the map it was built for; once $gameMap moves on, it holds still
// until the new scene replaces it.
const _reactorSpritesetMapInitialize = Spriteset_Map.prototype.initialize;
Spriteset_Map.prototype.initialize = function() {
    this._reactorBuiltForMapId = typeof $gameMap !== "undefined" && $gameMap ? $gameMap.mapId() : 0;
    _reactorSpritesetMapInitialize.apply(this, arguments);
};

const _reactorSpritesetMapStaleUpdate = Spriteset_Map.prototype.update;
Spriteset_Map.prototype.update = function() {
    if (this._reactorBuiltForMapId && typeof $gameMap !== "undefined" && $gameMap
        && $gameMap.mapId() !== this._reactorBuiltForMapId) {
        return;
    }
    _reactorSpritesetMapStaleUpdate.apply(this, arguments);
};

//-----------------------------------------------------------------------------
// A 3D battler's render target is GPU memory; it goes with its sprite. Kept at
// the end of the file: Sprite_Enemy's prototype is replaced above, and a
// wrapper installed earlier would wrap the wrong object.

(function() {
    if (typeof Sprite_Battler === "undefined") return;
    const _destroy = Sprite_Battler.prototype.destroy;
    Sprite_Battler.prototype.destroy = function() {
        if (typeof Reactor3D !== "undefined" && Reactor3D.releaseBattlerState) {
            Reactor3D.releaseBattlerState(this._reactorBattler);
            if (this._mainSprite) Reactor3D.releaseBattlerState(this._mainSprite._reactorBattler);
        }
        return _destroy.apply(this, arguments);
    };
})();
