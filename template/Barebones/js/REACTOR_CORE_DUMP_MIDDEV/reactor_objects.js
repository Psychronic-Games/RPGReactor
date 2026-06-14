//=============================================================================
// reactor_objects.js
// RPG Reactor Game Engine - Game Objects Module
//=============================================================================

//-----------------------------------------------------------------------------
// Game_Temp
// The game object class for temporary data that is not included in save data
//-----------------------------------------------------------------------------

class Game_Temp {
    constructor() {
        this.initialize(...arguments);
    }

    initialize() {
        this._isPlaytest = Utils.isOptionValid("test");
        this._destinationX = null;
        this._destinationY = null;
    }

    isPlaytest() {
        return this._isPlaytest;
    }

    setDestination(x, y) {
        this._destinationX = x;
        this._destinationY = y;
    }

    clearDestination() {
        this._destinationX = null;
        this._destinationY = null;
    }

    isDestinationValid() {
        return this._destinationX !== null;
    }

    destinationX() {
        return this._destinationX;
    }

    destinationY() {
        return this._destinationY;
    }
}

//-----------------------------------------------------------------------------
// Game_System
// The game object class for the system data
//-----------------------------------------------------------------------------

class Game_System {
    constructor() {
        this.initialize(...arguments);
    }

    initialize() {
        this._saveEnabled = true;
        this._menuEnabled = true;
        this._encounterEnabled = true;
        this._formationEnabled = true;
        this._battleCount = 0;
        this._winCount = 0;
        this._escapeCount = 0;
        this._saveCount = 0;
        this._versionId = 0;
        this._framesOnSave = 0;
        this._bgmOnSave = null;
        this._bgsOnSave = null;
        this._windowTone = null;
        this._battleBgm = null;
        this._victoryMe = null;
        this._defeatMe = null;
        this._savedBgm = null;
        this._walkingBgm = null;
    }

    isJapanese() {
        return $dataSystem.locale.match(/^ja/);
    }

    isChinese() {
        return $dataSystem.locale.match(/^zh/);
    }

    isKorean() {
        return $dataSystem.locale.match(/^ko/);
    }

    isCJK() {
        return $dataSystem.locale.match(/^(ja|zh|ko)/);
    }

    isSideView() {
        return $dataSystem.optSideView;
    }

    isSaveEnabled() {
        return this._saveEnabled;
    }

    isMenuEnabled() {
        return this._menuEnabled;
    }
}

//-----------------------------------------------------------------------------
// Game_Message
//
// The game object class for the state of the message window

class Game_Message {
    constructor() {
        this.initialize(...arguments);
    }

    initialize() {
        this.clear();
    }

    clear() {
        this._texts = [];
        this._choices = [];
        this._speakerName = "";
        this._faceImage = "";
        this._faceIndex = 0;
        this._background = 0;
        this._positionType = 2;
        this._choiceDefaultType = 0;
        this._choiceCancelType = 0;
        this._choiceBackground = 0;
        this._choicePostionType = 2;
        this._numInputVariableId = 0;
        this._numInputMaxDigits = 0;
        this._itemChoiceVariableId = 0;
        this._itemChoiceItypeId = 0;
        this._scrollMode = false;
        this._scrollSpeed = 2;
        this._scrollNoFast = false;
        this._choiceCallback = null;
    }

    choices() {
        return this._choices;
    }

    speakerName() {
        return this._speakerName;
    }

    faceImage() {
        return this._faceImage;
    }

    faceName() {
        return this._faceImage;
    }

    faceIndex() {
        return this._faceIndex;
    }

    background() {
        return this._background;
    }

    positionType() {
        return this._positionType;
    }

    choiceDefaultType() {
        return this._choiceDefaultType;
    }

    choiceCancelType() {
        return this._choiceCancelType;
    }

    choiceBackground() {
        return this._choiceBackground;
    }

    choicePositionType() {
        return this._choicePositionType;
    }

    numInputVariableId() {
        return this._numInputVariableId;
    }

    numInputMaxDigits() {
        return this._numInputMaxDigits;
    }

    itemChoiceVariableId() {
        return this._itemChoiceVariableId;
    }

    itemChoiceItypeId() {
        return this._itemChoiceItypeId;
    }

    scrollMode() {
        return this._scrollMode;
    }

    scrollSpeed() {
        return this._scrollSpeed;
    }

    scrollNoFast() {
        return this._scrollNoFast;
    }

    add(text) {
        this._texts.push(text);
    }

    setFaceImage(faceName, faceIndex) {
        this._faceImage = faceName;
        this._faceIndex = faceIndex;
    }

    setBackground(background) {
        this._background = background;
    }

    setPositionType(positionType) {
        this._positionType = positionType;
    }

    setSpeakerName(speakerName) {
        this._speakerName = speakerName;
    }

    setChoices(choices, defaultType, cancelType) {
        this._choices = choices;
        this._choiceDefaultType = defaultType;
        this._choiceCancelType = cancelType;
    }

    setChoiceBackground(background) {
        this._choiceBackground = background;
    }

    setChoicePositionType(positionType) {
        this._choicePositionType = positionType;
    }

    setNumberInput(variableId, maxDigits) {
        this._numInputVariableId = variableId;
        this._numInputMaxDigits = maxDigits;
    }

    setItemChoice(variableId, itemType) {
        this._itemChoiceVariableId = variableId;
        this._itemChoiceItypeId = itemType;
    }

    setScroll(speed, noFast) {
        this._scrollMode = true;
        this._scrollSpeed = speed;
        this._scrollNoFast = noFast;
    }

    setChoiceCallback(callback) {
        this._choiceCallback = callback;
    }

    onChoice(n) {
        if (this._choiceCallback) {
            this._choiceCallback(n);
            this._choiceCallback = null;
        }
    }

    hasText() {
        return this._texts.length > 0;
    }

    isChoice() {
        return this._choices.length > 0;
    }

    isNumberInput() {
        return this._numInputVariableId > 0;
    }

    isItemChoice() {
        return this._itemChoiceVariableId > 0;
    }

    isBusy() {
        return this.hasText() || this.isChoice() || this.isNumberInput() || this.isItemChoice();
    }

    newPage() {
        if (this._texts.length > 0) {
            this._texts[this._texts.length - 1] += "\f";
        }
    }

    allText() {
        return this._texts.join("\n");
    }

    isRTL() {
        // Check if text is right-to-left (for Arabic, Hebrew, etc.)
        return false; // Not implemented yet
    }
}

//-----------------------------------------------------------------------------
// Game_Switches
//-----------------------------------------------------------------------------

class Game_Switches {
    constructor() {
        this.initialize(...arguments);
    }

    initialize() {
        this._data = [];
    }

    clear() {
        this._data = [];
    }

    value(switchId) {
        return !!this._data[switchId];
    }

    setValue(switchId, value) {
        if (switchId > 0 && switchId < $dataSystem.switches.length) {
            this._data[switchId] = value;
        }
    }
}

//-----------------------------------------------------------------------------
// Game_Variables
//-----------------------------------------------------------------------------

class Game_Variables {
    constructor() {
        this.initialize(...arguments);
    }

    initialize() {
        this._data = [];
    }

    clear() {
        this._data = [];
    }

    value(variableId) {
        return this._data[variableId] || 0;
    }

    setValue(variableId, value) {
        if (variableId > 0 && variableId < $dataSystem.variables.length) {
            this._data[variableId] = value;
        }
    }
}

//-----------------------------------------------------------------------------
// Game_SelfSwitches
//-----------------------------------------------------------------------------

class Game_SelfSwitches {
    constructor() {
        this.initialize(...arguments);
    }

    initialize() {
        this._data = {};
    }

    clear() {
        this._data = {};
    }

    value(key) {
        return !!this._data[key];
    }

    setValue(key, value) {
        if (value) {
            this._data[key] = true;
        } else {
            delete this._data[key];
        }
    }
}

//-----------------------------------------------------------------------------
// Game_Actors
// The wrapper class for an actor array
//-----------------------------------------------------------------------------

class Game_Actors {
    constructor() {
        this.initialize(...arguments);
    }

    initialize() {
        this._data = [];
    }

    actor(actorId) {
        if ($dataActors[actorId]) {
            if (!this._data[actorId]) {
                this._data[actorId] = new Game_Actor(actorId);
            }
            return this._data[actorId];
        }
        return null;
    }
}

//-----------------------------------------------------------------------------
// Game_Party
// The game object class for the party
//-----------------------------------------------------------------------------

class Game_Party {
    constructor() {
        this.initialize(...arguments);
    }

    initialize() {
        this._actors = [];
        this._gold = 0;
        this._steps = 0;
        this._lastItem = null;
        this._menuActorId = 0;
        this._targetActorId = 0;
        this._armors = {};
        this._weapons = {};
        this._items = {};
    }

    inBattle() {
        // Battle system not implemented yet, always return false
        return false;
    }

    setupStartingMembers() {
        this._actors = [];
        for (const actorId of $dataSystem.partyMembers) {
            this._actors.push(actorId);
        }
    }

    members() {
        return this._actors.map(id => $gameActors.actor(id));
    }

    leader() {
        return this.members()[0];
    }

    size() {
        return this.members().length;
    }
}

//-----------------------------------------------------------------------------
// Game_Actor
// The game object class for an actor
//-----------------------------------------------------------------------------

class Game_Actor {
    constructor(actorId) {
        this.initialize(actorId);
    }

    initialize(actorId) {
        this._actorId = actorId;
        this.setup(actorId);
    }

    setup(actorId) {
        const actor = $dataActors[actorId];
        this._name = actor.name;
        this._nickname = actor.nickname;
        this._profile = actor.profile;
        this._classId = actor.classId;
        this._level = actor.initialLevel;
        this.initImages();
    }

    initImages() {
        const actor = this.actor();
        this._characterName = actor.characterName;
        this._characterIndex = actor.characterIndex;
        this._faceName = actor.faceName;
        this._faceIndex = actor.faceIndex;
        this._battlerName = actor.battlerName;
    }

    actor() {
        return $dataActors[this._actorId];
    }

    name() {
        return this._name;
    }

    characterName() {
        return this._characterName;
    }

    characterIndex() {
        return this._characterIndex;
    }
}

//-----------------------------------------------------------------------------
// Game_Map
// The game object class for a map
//-----------------------------------------------------------------------------

class Game_Map {
    constructor() {
        this.initialize(...arguments);
    }

    initialize() {
        this._interpreter = new Game_Interpreter();
        this._mapId = 0;
        this._tilesetId = 0;
        this._events = [];
        this._commonEvents = [];
        this._displayX = 0;
        this._displayY = 0;
        this._parallaxName = "";
        this._parallaxZero = false;
        this._parallaxLoopX = false;
        this._parallaxLoopY = false;
        this._parallaxSx = 0;
        this._parallaxSy = 0;
        this._parallaxX = 0;
        this._parallaxY = 0;
        this._needsRefresh = false;
    }

    setup(mapId) {
        if (!$dataMap) {
            throw new Error("The map data is not available");
        }
        this._mapId = mapId;
        this._tilesetId = $dataMap.tilesetId;
        this._displayX = 0;
        this._displayY = 0;
        this.setupParallax();
        this.setupEvents();
    }

    setupParallax() {
        this._parallaxName = $dataMap.parallaxName || "";
        this._parallaxZero = ImageManager.isZeroParallax(this._parallaxName);
        this._parallaxLoopX = $dataMap.parallaxLoopX;
        this._parallaxLoopY = $dataMap.parallaxLoopY;
        this._parallaxSx = $dataMap.parallaxSx;
        this._parallaxSy = $dataMap.parallaxSy;
        this._parallaxX = 0;
        this._parallaxY = 0;
    }

    mapId() {
        return this._mapId;
    }

    tilesetId() {
        return this._tilesetId;
    }

    tileset() {
        return $dataTilesets[this._tilesetId];
    }

    width() {
        return $dataMap.width;
    }

    height() {
        return $dataMap.height;
    }

    data() {
        return $dataMap.data;
    }

    isValid(x, y) {
        return x >= 0 && x < this.width() && y >= 0 && y < this.height();
    }

    checkPassage(x, y, bit) {
        const flags = this.tilesetFlags();
        const tiles = this.allTiles(x, y);
        for (const tile of tiles) {
            const flag = flags[tile];
            if ((flag & 0x10) !== 0) {
                // [*] No effect on passage
                continue;
            }
            if ((flag & bit) === 0) {
                // [○] Passable
                return true;
            }
            if ((flag & bit) === bit) {
                // [×] Impassable
                return false;
            }
        }
        return false;
    }

    allTiles(x, y) {
        const tiles = this.tileEventsXy(x, y).map(event => event.tileId());
        return tiles.concat(this.layeredTiles(x, y));
    }

    layeredTiles(x, y) {
        const tiles = [];
        for (let z = 0; z < 4; z++) {
            tiles.push(this.data()[(z * this.height() + y) * this.width() + x] || 0);
        }
        return tiles;
    }

    tileEventsXy(x, y) {
        // No events yet, return empty array
        return [];
    }

    tilesetFlags() {
        const tileset = this.tileset();
        if (tileset) {
            return tileset.flags;
        } else {
            return [];
        }
    }

    isPassable(x, y, d) {
        return this.checkPassage(x, y, (1 << (d / 2 - 1)) & 0x0f);
    }

    tileWidth() {
        return 48;
    }

    tileHeight() {
        return 48;
    }

    screenTileX() {
        return Graphics.width / this.tileWidth();
    }

    screenTileY() {
        return Graphics.height / this.tileHeight();
    }

    adjustX(x) {
        return x - this._displayX;
    }

    adjustY(y) {
        return y - this._displayY;
    }

    roundX(x) {
        return this.isLoopHorizontal() ? x.mod(this.width()) : x;
    }

    roundY(y) {
        return this.isLoopVertical() ? y.mod(this.height()) : y;
    }

    xWithDirection(x, d) {
        return x + (d === 6 ? 1 : d === 4 ? -1 : 0);
    }

    yWithDirection(y, d) {
        return y + (d === 2 ? 1 : d === 8 ? -1 : 0);
    }

    roundXWithDirection(x, d) {
        return this.roundX(x + (d === 6 ? 1 : d === 4 ? -1 : 0));
    }

    roundYWithDirection(y, d) {
        return this.roundY(y + (d === 2 ? 1 : d === 8 ? -1 : 0));
    }

    isLoopHorizontal() {
        return $dataMap.scrollType === 2 || $dataMap.scrollType === 3;
    }

    isLoopVertical() {
        return $dataMap.scrollType === 1 || $dataMap.scrollType === 3;
    }

    displayX() {
        return this._displayX;
    }

    displayY() {
        return this._displayY;
    }

    setDisplayPos(x, y) {
        if (this.isLoopHorizontal()) {
            this._displayX = x.mod(this.width());
            this._parallaxX = x;
        } else {
            const endX = this.width() - this.screenTileX();
            this._displayX = endX < 0 ? endX / 2 : x.clamp(0, endX);
            this._parallaxX = this._displayX;
        }
        if (this.isLoopVertical()) {
            this._displayY = y.mod(this.height());
            this._parallaxY = y;
        } else {
            const endY = this.height() - this.screenTileY();
            this._displayY = endY < 0 ? endY / 2 : y.clamp(0, endY);
            this._parallaxY = this._displayY;
        }
    }

    scrollDown(distance) {
        if (this.isLoopVertical()) {
            this._displayY += distance;
            this._displayY %= $dataMap.height;
            if (this._parallaxLoopY) {
                this._parallaxY += distance;
            }
        } else if (this.height() >= this.screenTileY()) {
            const lastY = this._displayY;
            this._displayY = Math.min(
                this._displayY + distance,
                this.height() - this.screenTileY()
            );
            this._parallaxY += this._displayY - lastY;
        }
    }

    scrollLeft(distance) {
        if (this.isLoopHorizontal()) {
            this._displayX += $dataMap.width - distance;
            this._displayX %= $dataMap.width;
            if (this._parallaxLoopX) {
                this._parallaxX -= distance;
            }
        } else if (this.width() >= this.screenTileX()) {
            const lastX = this._displayX;
            this._displayX = Math.max(this._displayX - distance, 0);
            this._parallaxX += this._displayX - lastX;
        }
    }

    scrollRight(distance) {
        if (this.isLoopHorizontal()) {
            this._displayX += distance;
            this._displayX %= $dataMap.width;
            if (this._parallaxLoopX) {
                this._parallaxX += distance;
            }
        } else if (this.width() >= this.screenTileX()) {
            const lastX = this._displayX;
            this._displayX = Math.min(
                this._displayX + distance,
                this.width() - this.screenTileX()
            );
            this._parallaxX += this._displayX - lastX;
        }
    }

    scrollUp(distance) {
        if (this.isLoopVertical()) {
            this._displayY += $dataMap.height - distance;
            this._displayY %= $dataMap.height;
            if (this._parallaxLoopY) {
                this._parallaxY -= distance;
            }
        } else if (this.height() >= this.screenTileY()) {
            const lastY = this._displayY;
            this._displayY = Math.max(this._displayY - distance, 0);
            this._parallaxY += this._displayY - lastY;
        }
    }
}

//-----------------------------------------------------------------------------
// Game_CharacterBase
// The superclass of Game_Character. It handles basic information such as
// coordinates and images shared by all characters
//-----------------------------------------------------------------------------

class Game_CharacterBase {
    constructor() {
        this.initialize(...arguments);
    }

    get x() {
        return this._x;
    }

    get y() {
        return this._y;
    }

    initialize() {
        this.initMembers();
    }

    initMembers() {
        this._x = 0;
        this._y = 0;
        this._realX = 0;
        this._realY = 0;
        this._moveSpeed = 4;
        this._moveFrequency = 6;
        this._opacity = 255;
        this._blendMode = 0;
        this._direction = 2;
        this._pattern = 1;
        this._priorityType = 1;
        this._tileId = 0;
        this._characterName = "";
        this._characterIndex = 0;
        this._isObjectCharacter = false;
        this._walkAnime = true;
        this._stepAnime = false;
        this._directionFix = false;
        this._through = false;
        this._transparent = false;
        this._bushDepth = 0;
        this._animationId = 0;
        this._balloonId = 0;
        this._animationPlaying = false;
        this._balloonPlaying = false;
        this._animationCount = 0;
        this._stopCount = 0;
        this._jumpCount = 0;
        this._jumpPeak = 0;
        this._movementSuccess = true;
    }

    pos(x, y) {
        return this._x === x && this._y === y;
    }

    posNt(x, y) {
        // Position, not through
        return this.pos(x, y) && !this.isThrough();
    }

    isNormalPriority() {
        return this._priorityType === 1;
    }

    isMoving() {
        return this._realX !== this._x || this._realY !== this._y;
    }

    isJumping() {
        return this._jumpCount > 0;
    }

    jumpHeight() {
        const t = this._jumpCount;
        const p = this._jumpPeak;
        return (p * p - Math.pow(Math.abs(t - p), 2)) / 2;
    }

    isStopping() {
        return !this.isMoving() && !this.isJumping();
    }

    checkStop(threshold) {
        return this._stopCount > threshold;
    }

    resetStopCount() {
        this._stopCount = 0;
    }

    realMoveSpeed() {
        return this._moveSpeed + (this.isDashing() ? 1 : 0);
    }

    distancePerFrame() {
        return Math.pow(2, this.realMoveSpeed()) / 256;
    }

    isDashing() {
        return false;
    }

    isDebugThrough() {
        return false;
    }

    straighten() {
        if (this.hasWalkAnime() || this.hasStepAnime()) {
            this._pattern = 1;
        }
        this._animationCount = 0;
    }

    reverseDir(d) {
        return 10 - d;
    }

    canPass(x, y, d) {
        const x2 = $gameMap.roundXWithDirection(x, d);
        const y2 = $gameMap.roundYWithDirection(y, d);
        if (!$gameMap.isValid(x2, y2)) {
            return false;
        }
        if (this.isThrough() || this.isDebugThrough()) {
            return true;
        }
        if (!this.isMapPassable(x, y, d)) {
            return false;
        }
        if (this.isCollidedWithCharacters(x2, y2)) {
            return false;
        }
        return true;
    }

    isCollidedWithCharacters(x, y) {
        return this.isCollidedWithEvents(x, y) || this.isCollidedWithVehicles(x, y);
    }

    isCollidedWithEvents(x, y) {
        const events = $gameMap.eventsXyNt(x, y);
        return events.some(event => event.isNormalPriority());
    }

    isCollidedWithVehicles(x, y) {
        // No vehicles yet
        return false;
    }

    canPassDiagonally(x, y, horz, vert) {
        const x2 = $gameMap.roundXWithDirection(x, horz);
        const y2 = $gameMap.roundYWithDirection(y, vert);
        if (this.canPass(x, y, vert) && this.canPass(x, y2, horz)) {
            return true;
        }
        if (this.canPass(x, y, horz) && this.canPass(x2, y, vert)) {
            return true;
        }
        return false;
    }

    isMapPassable(x, y, d) {
        const x2 = $gameMap.roundXWithDirection(x, d);
        const y2 = $gameMap.roundYWithDirection(y, d);
        const d2 = this.reverseDir(d);
        return $gameMap.isPassable(x, y, d) && $gameMap.isPassable(x2, y2, d2);
    }

    isThrough() {
        return this._through;
    }

    isTransparent() {
        return this._transparent;
    }

    bushDepth() {
        return this._bushDepth;
    }

    setTransparent(transparent) {
        this._transparent = transparent;
    }

    setDirection(d) {
        if (!this.isDirectionFixed() && d) {
            this._direction = d;
        }
        this.resetStopCount();
    }

    isDirectionFixed() {
        return this._directionFix;
    }

    direction() {
        return this._direction;
    }

    pattern() {
        return this._pattern < 3 ? this._pattern : 1;
    }

    tileId() {
        return this._tileId;
    }

    characterName() {
        return this._characterName;
    }

    characterIndex() {
        return this._characterIndex;
    }

    setImage(characterName, characterIndex) {
        this._tileId = 0;
        this._characterName = characterName;
        this._characterIndex = characterIndex;
        this._isObjectCharacter = ImageManager.isObjectCharacter(characterName);
    }

    setTileImage(tileId) {
        this._tileId = tileId;
        this._characterName = "";
        this._characterIndex = 0;
        this._isObjectCharacter = false;
    }

    setPattern(pattern) {
        this._pattern = pattern;
    }

    setDirectionFix(directionFix) {
        this._directionFix = directionFix;
    }

    setMoveSpeed(moveSpeed) {
        this._moveSpeed = moveSpeed;
    }

    setMoveFrequency(moveFrequency) {
        this._moveFrequency = moveFrequency;
    }

    setPriorityType(priorityType) {
        this._priorityType = priorityType;
    }

    setWalkAnime(walkAnime) {
        this._walkAnime = walkAnime;
    }

    setStepAnime(stepAnime) {
        this._stepAnime = stepAnime;
    }

    setThrough(through) {
        this._through = through;
    }

    screenX() {
        const tw = $gameMap.tileWidth();
        return Math.floor(this.scrolledX() * tw + tw / 2);
    }

    screenY() {
        const th = $gameMap.tileHeight();
        return Math.floor(
            this.scrolledY() * th + th - this.shiftY() - this.jumpHeight()
        );
    }

    screenZ() {
        return this._priorityType * 2 + 1;
    }

    scrolledX() {
        return $gameMap.adjustX(this._realX);
    }

    scrolledY() {
        return $gameMap.adjustY(this._realY);
    }

    shiftY() {
        return this.isObjectCharacter() ? 0 : 6;
    }

    isObjectCharacter() {
        return this._isObjectCharacter;
    }

    isTile() {
        return this._tileId > 0 && this._priorityType === 0;
    }

    hasWalkAnime() {
        return this._walkAnime;
    }

    hasStepAnime() {
        return this._stepAnime;
    }

    opacity() {
        return this._opacity;
    }

    blendMode() {
        return this._blendMode;
    }

    update() {
        if (this.isStopping()) {
            this.updateStop();
        }
        if (this.isJumping()) {
            this.updateJump();
        } else if (this.isMoving()) {
            this.updateMove();
        }
        this.updateAnimation();
    }

    updateStop() {
        this._stopCount++;
    }

    updateJump() {
        this._jumpCount--;
        this._realX = (this._realX * this._jumpCount + this._x) / (this._jumpCount + 1.0);
        this._realY = (this._realY * this._jumpCount + this._y) / (this._jumpCount + 1.0);
        if (this._jumpCount === 0) {
            this._realX = this._x = $gameMap.roundX(this._x);
            this._realY = this._y = $gameMap.roundY(this._y);
        }
    }

    updateMove() {
        if (this._x < this._realX) {
            this._realX = Math.max(this._realX - this.distancePerFrame(), this._x);
        }
        if (this._x > this._realX) {
            this._realX = Math.min(this._realX + this.distancePerFrame(), this._x);
        }
        if (this._y < this._realY) {
            this._realY = Math.max(this._realY - this.distancePerFrame(), this._y);
        }
        if (this._y > this._realY) {
            this._realY = Math.min(this._realY + this.distancePerFrame(), this._y);
        }
        if (!this.isMoving()) {
            this.refreshBushDepth();
        }
    }

    updateAnimation() {
        this.updateAnimationCount();
        if (this._animationCount >= this.animationWait()) {
            this.updatePattern();
            this._animationCount = 0;
        }
    }

    animationWait() {
        return (9 - this.realMoveSpeed()) * 3;
    }

    updateAnimationCount() {
        if (this.isMoving() && this.hasWalkAnime()) {
            this._animationCount += 1.5;
        } else if (this.hasStepAnime() || !this.isOriginalPattern()) {
            this._animationCount++;
        }
    }

    updatePattern() {
        if (!this.hasStepAnime() && this._stopCount > 0) {
            this.resetPattern();
        } else {
            this._pattern = (this._pattern + 1) % 4;
        }
    }

    isOriginalPattern() {
        return this.pattern() === 1;
    }

    resetPattern() {
        this.setPattern(1);
    }

    setPattern(pattern) {
        this._pattern = pattern;
    }

    refreshBushDepth() {
        // Simplified - no bush depth for now
        this._bushDepth = 0;
    }

    locate(x, y) {
        this.setPosition(x, y);
        this.straighten();
        this.refreshBushDepth();
    }

    setPosition(x, y) {
        this._x = Math.round(x);
        this._y = Math.round(y);
        this._realX = x;
        this._realY = y;
    }

    moveStraight(d) {
        this.setMovementSuccess(this.canPass(this._x, this._y, d));
        if (this.isMovementSucceeded()) {
            this.setDirection(d);
            this._x = $gameMap.roundXWithDirection(this._x, d);
            this._y = $gameMap.roundYWithDirection(this._y, d);
            this._realX = $gameMap.xWithDirection(this._x, this.reverseDir(d));
            this._realY = $gameMap.yWithDirection(this._y, this.reverseDir(d));
            this.increaseSteps();
        } else {
            this.setDirection(d);
            this.checkEventTriggerTouchFront(d);
        }
    }

    moveDiagonally(horz, vert) {
        this.setMovementSuccess(this.canPassDiagonally(this._x, this._y, horz, vert));
        if (this.isMovementSucceeded()) {
            this._x = $gameMap.roundXWithDirection(this._x, horz);
            this._y = $gameMap.roundYWithDirection(this._y, vert);
            this._realX = $gameMap.xWithDirection(this._x, this.reverseDir(horz));
            this._realY = $gameMap.yWithDirection(this._y, this.reverseDir(vert));
            this.increaseSteps();
        }
        if (this._direction === this.reverseDir(horz)) {
            this.setDirection(horz);
        }
        if (this._direction === this.reverseDir(vert)) {
            this.setDirection(vert);
        }
    }

    setMovementSuccess(success) {
        this._movementSuccess = success;
    }

    isMovementSucceeded() {
        return this._movementSuccess;
    }

    increaseSteps() {
        // Called when character takes a step
        this.resetStopCount();
    }

    checkEventTriggerTouchFront(d) {
        const x2 = $gameMap.roundXWithDirection(this._x, d);
        const y2 = $gameMap.roundYWithDirection(this._y, d);
        this.checkEventTriggerTouch(x2, y2);
    }

    checkEventTriggerTouch(x, y) {
        return false;
    }
}

//-----------------------------------------------------------------------------
// Game_Character
// The superclass of Game_Player
//-----------------------------------------------------------------------------

class Game_Character extends Game_CharacterBase {
    constructor() {
        super(...arguments);
    }

    initialize() {
        super.initialize();
    }
}

//-----------------------------------------------------------------------------
// Game_Player
// The game object class for the player
//-----------------------------------------------------------------------------

class Game_Player extends Game_Character {
    constructor() {
        super(...arguments);
    }

    initialize() {
        super.initialize();
        this.setTransparent($dataSystem.optTransparent);
    }

    clearTransferInfo() {
        this._newMapId = 0;
        this._newX = 0;
        this._newY = 0;
        this._newDirection = 0;
    }

    setupForNewGame() {
        const mapId = $dataSystem.startMapId;
        const x = $dataSystem.startX;
        const y = $dataSystem.startY;
        this.reserveTransfer(mapId, x, y, 2, 0);
    }

    reserveTransfer(mapId, x, y, d, fadeType) {
        this._newMapId = mapId;
        this._newX = x;
        this._newY = y;
        this._newDirection = d;
        this._fadeType = fadeType;
    }

    isTransferring() {
        return this._newMapId > 0;
    }

    newMapId() {
        return this._newMapId;
    }

    performTransfer() {
        if (this.isTransferring()) {
            this.setDirection(this._newDirection);
            if (this._newMapId !== $gameMap.mapId()) {
                $gameMap.setup(this._newMapId);
            }
            this.locate(this._newX, this._newY);
            this.refresh();
            this.clearTransferInfo();
        }
    }

    refresh() {
        const actor = $gameParty.leader();
        if (actor) {
            this.setImage(actor.characterName(), actor.characterIndex());
        }
    }

    centerX() {
        return ($gameMap.screenTileX() - 1) / 2.0;
    }

    centerY() {
        return ($gameMap.screenTileY() - 1) / 2.0;
    }

    center(x, y) {
        return $gameMap.setDisplayPos(x - this.centerX(), y - this.centerY());
    }

    locate(x, y) {
        super.locate(x, y);
        this.center(x, y);
    }

    x() {
        return this._x;
    }

    y() {
        return this._y;
    }

    update(sceneActive) {
        const lastScrolledX = this.scrolledX();
        const lastScrolledY = this.scrolledY();
        const wasMoving = this.isMoving();
        this.updateDashing();
        if (sceneActive) {
            this.moveByInput();
        }
        super.update();
        this.updateScroll(lastScrolledX, lastScrolledY);
        this.updateVehicle();
        if (!this.isMoving()) {
            this.updateNonmoving(wasMoving, sceneActive);
        }
    }

    updateDashing() {
        if (this.isMoving()) {
            return;
        }
        if (this.canMove() && !this.isInVehicle() && !$gameMap.isDashDisabled()) {
            this._dashing = this.isDashButtonPressed() || $gameTemp.isDestinationValid();
        } else {
            this._dashing = false;
        }
    }

    isDashing() {
        return this._dashing;
    }

    isDashButtonPressed() {
        const shift = Input.isPressed("shift");
        if (ConfigManager.alwaysDash) {
            return !shift;
        } else {
            return shift;
        }
    }

    canMove() {
        if ($gameMap.isEventRunning()) {
            return false;
        }
        if (this.isMoving()) {
            return false;
        }
        return true;
    }

    isInVehicle() {
        return false; // No vehicles yet
    }

    moveByInput() {
        if (!this.isMoving() && this.canMove()) {
            let direction = this.getInputDirection();
            if (direction > 0) {
                $gameTemp.clearDestination();
            } else if ($gameTemp.isDestinationValid()) {
                const x = $gameTemp.destinationX();
                const y = $gameTemp.destinationY();
                direction = this.findDirectionTo(x, y);
            }
            if (direction > 0) {
                this.executeMove(direction);
            }
        }
    }

    getInputDirection() {
        return Input.dir4;
    }

    executeMove(direction) {
        this.moveStraight(direction);
    }

    findDirectionTo(goalX, goalY) {
        const searchLimit = this.searchLimit();
        const mapWidth = $gameMap.width();
        const nodeList = [];
        const openList = [];
        const closedList = [];
        const start = {};
        let best = start;

        if (this.x === goalX && this.y === goalY) {
            return 0;
        }

        start.parent = null;
        start.x = this.x;
        start.y = this.y;
        start.g = 0;
        start.f = $gameMap.distance(start.x, start.y, goalX, goalY);
        nodeList.push(start);
        openList.push(start.y * mapWidth + start.x);

        while (nodeList.length > 0) {
            let bestIndex = 0;
            for (let i = 0; i < nodeList.length; i++) {
                if (nodeList[i].f < nodeList[bestIndex].f) {
                    bestIndex = i;
                }
            }

            const current = nodeList[bestIndex];
            const x1 = current.x;
            const y1 = current.y;
            const pos1 = y1 * mapWidth + x1;
            const g1 = current.g;

            nodeList.splice(bestIndex, 1);
            openList.splice(openList.indexOf(pos1), 1);
            closedList.push(pos1);

            if (current.x === goalX && current.y === goalY) {
                best = current;
                break;
            }

            if (g1 >= searchLimit) {
                continue;
            }

            for (let d = 2; d < 10; d += 2) {
                const x2 = $gameMap.roundXWithDirection(x1, d);
                const y2 = $gameMap.roundYWithDirection(y1, d);
                const pos2 = y2 * mapWidth + x2;

                if (closedList.includes(pos2)) {
                    continue;
                }
                if (!this.canPass(x1, y1, d)) {
                    continue;
                }

                const g2 = g1 + 1;
                const index2 = openList.indexOf(pos2);

                if (index2 < 0 || g2 < nodeList[index2].g) {
                    let neighbor;
                    if (index2 >= 0) {
                        neighbor = nodeList[index2];
                    } else {
                        neighbor = {};
                        nodeList.push(neighbor);
                        openList.push(pos2);
                    }
                    neighbor.parent = current;
                    neighbor.x = x2;
                    neighbor.y = y2;
                    neighbor.g = g2;
                    neighbor.f = g2 + $gameMap.distance(x2, y2, goalX, goalY);
                }
            }
        }

        let node = best;
        while (node.parent && node.parent !== start) {
            node = node.parent;
        }

        const deltaX1 = $gameMap.deltaX(node.x, start.x);
        const deltaY1 = $gameMap.deltaY(node.y, start.y);
        if (deltaY1 > 0) {
            return 2;
        } else if (deltaX1 < 0) {
            return 4;
        } else if (deltaX1 > 0) {
            return 6;
        } else if (deltaY1 < 0) {
            return 8;
        }

        return 0;
    }

    searchLimit() {
        return 12;
    }

    updateScroll(lastScrolledX, lastScrolledY) {
        const x1 = lastScrolledX;
        const y1 = lastScrolledY;
        const x2 = this.scrolledX();
        const y2 = this.scrolledY();
        if (y2 > y1 && y2 > this.centerY()) {
            $gameMap.scrollDown(y2 - y1);
        }
        if (x2 < x1 && x2 < this.centerX()) {
            $gameMap.scrollLeft(x1 - x2);
        }
        if (x2 > x1 && x2 > this.centerX()) {
            $gameMap.scrollRight(x2 - x1);
        }
        if (y2 < y1 && y2 < this.centerY()) {
            $gameMap.scrollUp(y1 - y2);
        }
    }

    updateVehicle() {
        // No vehicles yet
    }

    updateNonmoving(wasMoving, sceneActive) {
        if (!$gameMap.isEventRunning()) {
            if (wasMoving) {
                this.checkEventTriggerHere([1, 2]);
                if ($gameMap.setupStartingEvent()) {
                    return;
                }
            }
            if (sceneActive && this.triggerAction()) {
                return;
            }
            if (wasMoving) {
                this.updateEncounterCount();
            } else {
                $gameTemp.clearDestination();
            }
        }
    }

    checkEventTriggerHere(triggers) {
        if (this.canStartLocalEvents()) {
            this.startMapEvent(this._x, this._y, triggers, false);
        }
    }

    checkEventTriggerThere(triggers) {
        if (this.canStartLocalEvents()) {
            const direction = this.direction();
            const x1 = this._x;
            const y1 = this._y;
            const x2 = $gameMap.roundXWithDirection(x1, direction);
            const y2 = $gameMap.roundYWithDirection(y1, direction);
            this.startMapEvent(x2, y2, triggers, true);
            if (!$gameMap.isAnyEventStarting() && $gameMap.isCounter(x2, y2)) {
                const x3 = $gameMap.roundXWithDirection(x2, direction);
                const y3 = $gameMap.roundYWithDirection(y2, direction);
                this.startMapEvent(x3, y3, triggers, true);
            }
        }
    }

    canStartLocalEvents() {
        return !$gameMap.isEventRunning();
    }

    startMapEvent(x, y, triggers, normal) {
        if (!$gameMap.isEventRunning()) {
            for (const event of $gameMap.eventsXy(x, y)) {
                // For touch triggers (1, 2), ignore priority and trigger regardless
                const isTouchTrigger = triggers.includes(1) || triggers.includes(2);
                const priorityMatches = isTouchTrigger || event.isNormalPriority() === normal;

                if (event.isTriggerIn(triggers) && priorityMatches) {
                    event.start();
                }
            }
        }
    }

    triggerAction() {
        if (this.canMove()) {
            if (this.triggerButtonAction()) {
                return true;
            }
            if (this.triggerTouchAction()) {
                return true;
            }
        }
        return false;
    }

    triggerButtonAction() {
        if (Input.isTriggered("ok")) {
            if (!$gameMap.isEventRunning()) {
                this.checkEventTriggerHere([0]);
                this.checkEventTriggerThere([0, 1, 2]);
            }
            return true;
        }
        return false;
    }

    triggerTouchAction() {
        if ($gameTemp.isDestinationValid()) {
            const direction = this.direction();
            const x1 = this.x;
            const y1 = this.y;
            const x2 = $gameMap.roundXWithDirection(x1, direction);
            const y2 = $gameMap.roundYWithDirection(y1, direction);
            const x3 = $gameMap.roundXWithDirection(x2, direction);
            const y3 = $gameMap.roundYWithDirection(y2, direction);
            const destX = $gameTemp.destinationX();
            const destY = $gameTemp.destinationY();
            if ((destX === x1 && destY === y1) ||
                (destX === x2 && destY === y2)) {
                return true;
            }
            if (destX === x3 && destY === y3) {
                return true;
            }
        }
        return false;
    }

    checkEventTriggerTouch(x, y) {
        if (this.canStartLocalEvents()) {
            this.startMapEvent(x, y, [1, 2], false);
        }
    }

    updateEncounterCount() {
        // No random encounters yet
    }
}

// Extend Game_Map with distance and delta methods needed for pathfinding
Game_Map.prototype.distance = function(x1, y1, x2, y2) {
    return Math.abs(this.deltaX(x1, x2)) + Math.abs(this.deltaY(y1, y2));
};

Game_Map.prototype.deltaX = function(x1, x2) {
    let result = x1 - x2;
    if (this.isLoopHorizontal() && Math.abs(result) > this.width() / 2) {
        if (result < 0) {
            result += this.width();
        } else {
            result -= this.width();
        }
    }
    return result;
};

Game_Map.prototype.deltaY = function(y1, y2) {
    let result = y1 - y2;
    if (this.isLoopVertical() && Math.abs(result) > this.height() / 2) {
        if (result < 0) {
            result += this.height();
        } else {
            result -= this.height();
        }
    }
    return result;
};

Game_Map.prototype.isEventRunning = function() {
    return this._interpreter.isRunning() || this.isAnyEventStarting();
};

Game_Map.prototype.setupStartingEvent = function() {
    this.refreshIfNeeded();
    return this.setupStartingMapEvent();
};

Game_Map.prototype.setupStartingMapEvent = function() {
    for (const event of this.events()) {
        if (event.isStarting()) {
            event.clearStartingFlag();
            this._interpreter.setup(event.list(), event.eventId());
            return true;
        }
    }
    return false;
};

Game_Map.prototype.isDashDisabled = function() {
    return $dataMap.disableDashing;
};

Game_Map.prototype.setupEvents = function() {
    this._events = [];
    if (!$dataMap || !$dataMap.events) return;

    for (const event of $dataMap.events) {
        if (event) {
            this._events[event.id] = new Game_Event(this._mapId, event.id);
        }
    }
};

Game_Map.prototype.events = function() {
    return this._events.filter(event => !!event);
};

Game_Map.prototype.event = function(eventId) {
    return this._events[eventId];
};

Game_Map.prototype.update = function(sceneActive) {
    this.refreshIfNeeded();
    if (sceneActive) {
        this.updateInterpreter();
    }
    this.updateEvents();
};

Game_Map.prototype.updateInterpreter = function() {
    for (;;) {
        this._interpreter.update();
        if (this._interpreter.isRunning()) {
            return;
        }
        if (this._interpreter.eventId() > 0) {
            this.unlockEvent(this._interpreter.eventId());
            this._interpreter.clear();
        }
        if (!this.setupStartingEvent()) {
            return;
        }
    }
};

Game_Map.prototype.unlockEvent = function(eventId) {
    if (this._events[eventId]) {
        this._events[eventId].unlock();
    }
};

Game_Map.prototype.refreshIfNeeded = function() {
    if (this._needsRefresh) {
        this.refresh();
    }
};

Game_Map.prototype.refresh = function() {
    this.events().forEach(event => {
        event.refresh();
    });
    this._needsRefresh = false;
};

Game_Map.prototype.updateEvents = function() {
    this.events().forEach(event => {
        event.update();
    });
};

Game_Map.prototype.eventsXy = function(x, y) {
    return this.events().filter(event => event.pos(x, y));
};

Game_Map.prototype.eventsXyNt = function(x, y) {
    return this.events().filter(event => event.posNt(x, y));
};

Game_Map.prototype.isCounter = function(x, y) {
    // Check if tile at x,y is a counter tile (for over-counter event triggering)
    // Not fully implemented yet - return false for now
    return false;
};

Game_Map.prototype.isAnyEventStarting = function() {
    return this.events().some(event => event.isStarting());
};

//-----------------------------------------------------------------------------
// Game_Event
//
// The game object class for an event. It contains functionality for event page
// switching and running parallel process events.

class Game_Event extends Game_Character {
    constructor() {
        super(...arguments);
    }

    initialize(mapId, eventId) {
        super.initialize();
        this._mapId = mapId;
        this._eventId = eventId;
        this._pageIndex = -2;
        this._starting = false;
        this._erased = false;
        this._locked = false;
        this._prelockDirection = 0;
        this._interpreter = null;
        this.locate(this.event().x, this.event().y);
        this.refresh();
    }

    eventId() {
        return this._eventId;
    }

    event() {
        return $dataMap.events[this._eventId];
    }

    page() {
        return this.event().pages[this._pageIndex];
    }

    list() {
        return this.page().list;
    }

    refresh() {
        const newPageIndex = this.findProperPageIndex();
        if (this._pageIndex !== newPageIndex) {
            this._pageIndex = newPageIndex;
            this.setupPage();
        }
    }

    findProperPageIndex() {
        const pages = this.event().pages;
        for (let i = pages.length - 1; i >= 0; i--) {
            if (this.meetsConditions(pages[i])) {
                return i;
            }
        }
        return -1;
    }

    meetsConditions(page) {
        const c = page.conditions;
        if (c.switch1Valid && !$gameSwitches.value(c.switch1Id)) {
            return false;
        }
        if (c.switch2Valid && !$gameSwitches.value(c.switch2Id)) {
            return false;
        }
        if (c.variableValid) {
            if ($gameVariables.value(c.variableId) < c.variableValue) {
                return false;
            }
        }
        if (c.selfSwitchValid) {
            const key = [this._mapId, this._eventId, c.selfSwitchCh];
            if ($gameSelfSwitches.value(key) !== true) {
                return false;
            }
        }
        if (c.itemValid) {
            const item = $dataItems[c.itemId];
            if (!$gameParty.hasItem(item)) {
                return false;
            }
        }
        if (c.actorValid) {
            const actor = $gameActors.actor(c.actorId);
            if (!$gameParty.members().includes(actor)) {
                return false;
            }
        }
        return true;
    }

    setupPage() {
        if (this._pageIndex >= 0) {
            this.setupPageSettings();
        } else {
            this.clearPageSettings();
        }
        this.checkEventTriggerAuto();
    }

    clearPageSettings() {
        this.setImage("", 0);
        this._moveType = 0;
        this._trigger = null;
        this._list = null;
        this.setThrough(true);
    }

    setupPageSettings() {
        const page = this.page();
        const image = page.image;
        if (image.tileId > 0) {
            this.setTileImage(image.tileId);
        } else {
            this.setImage(image.characterName, image.characterIndex);
        }
        if (this._originalDirection !== image.direction) {
            this._originalDirection = image.direction;
            this._prelockDirection = 0;
            this.setDirectionFix(false);
            this.setDirection(image.direction);
        }
        if (this._originalPattern !== image.pattern) {
            this._originalPattern = image.pattern;
            this.setPattern(image.pattern);
        }
        this.setMoveSpeed(page.moveSpeed);
        this.setMoveFrequency(page.moveFrequency);
        this.setPriorityType(page.priorityType);
        this.setWalkAnime(page.walkAnime);
        this.setStepAnime(page.stepAnime);
        this.setDirectionFix(page.directionFix);
        this.setThrough(page.through);
        this._moveType = page.moveType;
        this._trigger = page.trigger;
        this._list = page.list;
    }

    checkEventTriggerAuto() {
        // Not implemented yet - for autorun/parallel process events
    }

    isTriggerIn(triggers) {
        return triggers.includes(this._trigger);
    }

    start() {
        const list = this.list();
        if (list && list.length > 1) {
            this._starting = true;
            if (this.isTriggerIn([0, 1, 2])) {
                this.lock();
            }
        }
    }

    isCollidedWithPlayerCharacters(x, y) {
        return this.isNormalPriority() && $gamePlayer.pos(x, y);
    }

    isStarting() {
        return this._starting;
    }

    clearStartingFlag() {
        this._starting = false;
    }

    lock() {
        if (!this._locked) {
            this._prelockDirection = this.direction();
            this.turnTowardPlayer();
            this._locked = true;
        }
    }

    unlock() {
        if (this._locked) {
            this._locked = false;
            this.setDirection(this._prelockDirection);
        }
    }

    turnTowardPlayer() {
        const sx = this.deltaXFrom($gamePlayer.x);
        const sy = this.deltaYFrom($gamePlayer.y);
        if (Math.abs(sx) > Math.abs(sy)) {
            this.setDirection(sx > 0 ? 4 : 6);
        } else if (sy !== 0) {
            this.setDirection(sy > 0 ? 8 : 2);
        }
    }

    deltaXFrom(x) {
        return $gameMap.deltaX(this.x, x);
    }

    deltaYFrom(y) {
        return $gameMap.deltaY(this.y, y);
    }

    erase() {
        this._erased = true;
        this.refresh();
    }

    update() {
        super.update();
        this.checkEventTriggerAuto();
        this.updateSelfMovement();
    }

    updateSelfMovement() {
        // Placeholder for autonomous movement
    }
}


//-----------------------------------------------------------------------------
// Game_Interpreter
//
// The interpreter for running event commands.

class Game_Interpreter {
    constructor(depth = 0) {
        this.initialize(depth);
    }

    initialize(depth) {

        this._depth = depth || 0;
        this.checkOverflow();
        this.clear();
        this._branch = {};
        this._indent = 0;
        this._frameCount = 0;
        this._freezeChecker = 0;
    }

    checkOverflow() {

        if (this._depth >= 100) {
            throw new Error("Common event calls exceeded the limit");
        }
    }

    clear() {

        this._mapId = 0;
        this._eventId = 0;
        this._list = null;
        this._index = 0;
        this._waitCount = 0;
        this._waitMode = "";
        this._comments = "";
        this._characterId = 0;
        this._childInterpreter = null;
    }

    setup(list, eventId) {

        this.clear();
        this._mapId = $gameMap.mapId();
        this._eventId = eventId || 0;
        this._list = list;
        this.loadImages();
    }

    loadImages() {

        // [Note] The certain versions of MV had a more complicated preload scheme.
        //   However it is usually sufficient to preload face and picture images.
        const list = this._list.slice(0, 200);
        for (const command of list) {
            switch (command.code) {
                case 101: // Show Text
                    ImageManager.loadFace(command.parameters[0]);
                    break;
                case 231: // Show Picture
                    ImageManager.loadPicture(command.parameters[1]);
                    break;
            }
        }
    }

    eventId() {

        return this._eventId;
    }

    isOnCurrentMap() {

        return this._mapId === $gameMap.mapId();
    }

    setupReservedCommonEvent() {

        if ($gameTemp.isCommonEventReserved()) {
            const commonEvent = $gameTemp.retrieveCommonEvent();
            if (commonEvent) {
                this.setup(commonEvent.list);
                return true;
            }
        }
        return false;
    }

    isRunning() {

        return !!this._list;
    }

    update() {

        while (this.isRunning()) {
            if (this.updateChild() || this.updateWait()) {
                break;
            }
            if (SceneManager.isSceneChanging()) {
                break;
            }
            if (!this.executeCommand()) {
                break;
            }
            if (this.checkFreeze()) {
                break;
            }
        }
    }

    updateChild() {

        if (this._childInterpreter) {
            this._childInterpreter.update();
            if (this._childInterpreter.isRunning()) {
                return true;
            } else {
                this._childInterpreter = null;
            }
        }
        return false;
    }

    updateWait() {

        return this.updateWaitCount() || this.updateWaitMode();
    }

    updateWaitCount() {

        if (this._waitCount > 0) {
            this._waitCount--;
            return true;
        }
        return false;
    }

    updateWaitMode() {

        let character = null;
        let waiting = false;
        switch (this._waitMode) {
            case "message":
                waiting = $gameMessage.isBusy();
                break;
            case "transfer":
                waiting = $gamePlayer.isTransferring();
                break;
            case "scroll":
                waiting = $gameMap.isScrolling();
                break;
            case "route":
                character = this.character(this._characterId);
                waiting = character && character.isMoveRouteForcing();
                break;
            case "animation":
                character = this.character(this._characterId);
                waiting = character && character.isAnimationPlaying();
                break;
            case "balloon":
                character = this.character(this._characterId);
                waiting = character && character.isBalloonPlaying();
                break;
            case "gather":
                waiting = $gamePlayer.areFollowersGathering();
                break;
            case "action":
                waiting = BattleManager.isActionForced();
                break;
            case "video":
                waiting = Video.isPlaying();
                break;
            case "image":
                waiting = !ImageManager.isReady();
                break;
        }
        if (!waiting) {
            this._waitMode = "";
        }
        return waiting;
    }

    setWaitMode(waitMode) {

        this._waitMode = waitMode;
    }

    wait(duration) {

        this._waitCount = duration;
    }

    fadeSpeed() {

        return 24;
    }

    executeCommand() {

        const command = this.currentCommand();
        if (command) {
            this._indent = command.indent;
            const methodName = "command" + command.code;
            if (typeof this[methodName] === "function") {
                if (!this[methodName](command.parameters)) {
                    return false;
                }
            }
            this._index++;
        } else {
            this.terminate();
        }
        return true;
    }

    checkFreeze() {

        if (this._frameCount !== Graphics.frameCount) {
            this._frameCount = Graphics.frameCount;
            this._freezeChecker = 0;
        }
        if (this._freezeChecker++ >= 100000) {
            return true;
        } else {
            return false;
        }
    }

    terminate() {

        this._list = null;
        this._comments = "";
    }

    skipBranch() {

        while (this._list[this._index + 1].indent > this._indent) {
            this._index++;
        }
    }

    currentCommand() {

        return this._list[this._index];
    }

    nextEventCode() {

        const command = this._list[this._index + 1];
        if (command) {
            return command.code;
        } else {
            return 0;
        }
    }

    iterateActorId(param, callback) {

        if (param === 0) {
            $gameParty.members().forEach(callback);
        } else {
            const actor = $gameActors.actor(param);
            if (actor) {
                callback(actor);
            }
        }
    }

    iterateActorEx(param1, param2, callback) {

        if (param1 === 0) {
            this.iterateActorId(param2, callback);
        } else {
            this.iterateActorId($gameVariables.value(param2), callback);
        }
    }

    iterateActorIndex(param, callback) {

        if (param < 0) {
            $gameParty.members().forEach(callback);
        } else {
            const actor = $gameParty.members()[param];
            if (actor) {
                callback(actor);
            }
        }
    }

    iterateEnemyIndex(param, callback) {

        if (param < 0) {
            $gameTroop.members().forEach(callback);
        } else {
            const enemy = $gameTroop.members()[param];
            if (enemy) {
                callback(enemy);
            }
        }
    }

    iterateBattler(param1, param2, callback) {

        if ($gameParty.inBattle()) {
            if (param1 === 0) {
                this.iterateEnemyIndex(param2, callback);
            } else {
                this.iterateActorId(param2, callback);
            }
        }
    }

    character(param) {

        if ($gameParty.inBattle()) {
            return null;
        } else if (param < 0) {
            return $gamePlayer;
        } else if (this.isOnCurrentMap()) {
            return $gameMap.event(param > 0 ? param : this._eventId);
        } else {
            return null;
        }
    }

    operateValue(
    operation, operandType, operand
) {

        const value = operandType === 0 ? operand : $gameVariables.value(operand);
        return operation === 0 ? value : -value;
    }

    changeHp(target, value, allowDeath) {

        if (target.isAlive()) {
            if (!allowDeath && target.hp <= -value) {
                value = 1 - target.hp;
            }
            target.gainHp(value);
            if (target.isDead()) {
                target.performCollapse();
            }
        }
    }

    command101(params) {

        if ($gameMessage.isBusy()) {
            return false;
        }
        $gameMessage.setFaceImage(params[0], params[1]);
        $gameMessage.setBackground(params[2]);
        $gameMessage.setPositionType(params[3]);
        $gameMessage.setSpeakerName(params[4]);
        while (this.nextEventCode() === 401) {
            // Text data
            this._index++;
            $gameMessage.add(this.currentCommand().parameters[0]);
        }
        switch (this.nextEventCode()) {
            case 102: // Show Choices
                this._index++;
                this.setupChoices(this.currentCommand().parameters);
                break;
            case 103: // Input Number
                this._index++;
                this.setupNumInput(this.currentCommand().parameters);
                break;
            case 104: // Select Item
                this._index++;
                this.setupItemChoice(this.currentCommand().parameters);
                break;
        }
        this.setWaitMode("message");
        return true;
    }

    command102(params) {

        if ($gameMessage.isBusy()) {
            return false;
        }
        this.setupChoices(params);
        this.setWaitMode("message");
        return true;
    }

    setupChoices(params) {

        const choices = [...params[0]]; // Use spread to clone array
        const cancelType = params[1] < choices.length ? params[1] : -2;
        const defaultType = params.length > 2 ? params[2] : 0;
        const positionType = params.length > 3 ? params[3] : 2;
        const background = params.length > 4 ? params[4] : 0;
        $gameMessage.setChoices(choices, defaultType, cancelType);
        $gameMessage.setChoiceBackground(background);
        $gameMessage.setChoicePositionType(positionType);
        $gameMessage.setChoiceCallback(n => {
            this._branch[this._indent] = n;
        });
    }

    command402(params) {

        if (this._branch[this._indent] !== params[0]) {
            this.skipBranch();
        }
        return true;
    }

    command403() {

        if (this._branch[this._indent] >= 0) {
            this.skipBranch();
        }
        return true;
    }

    command103(params) {

        if ($gameMessage.isBusy()) {
            return false;
        }
        this.setupNumInput(params);
        this.setWaitMode("message");
        return true;
    }

    setupNumInput(params) {

        $gameMessage.setNumberInput(params[0], params[1]);
    }

    command104(params) {

        if ($gameMessage.isBusy()) {
            return false;
        }
        this.setupItemChoice(params);
        this.setWaitMode("message");
        return true;
    }

    setupItemChoice(params) {

        $gameMessage.setItemChoice(params[0], params[1] || 2);
    }

    command105(params) {

        if ($gameMessage.isBusy()) {
            return false;
        }
        $gameMessage.setScroll(params[0], params[1]);
        while (this.nextEventCode() === 405) {
            this._index++;
            $gameMessage.add(this.currentCommand().parameters[0]);
        }
        this.setWaitMode("message");
        return true;
    }

    command108(params) {

        this._comments = [params[0]];
        while (this.nextEventCode() === 408) {
            this._index++;
            this._comments.push(this.currentCommand().parameters[0]);
        }
        return true;
    }

    command109() {

        this.skipBranch();
        return true;
    }

    command111(params) {

        let result = false;
        let value1, value2;
        let actor, enemy, character;
        switch (params[0]) {
            case 0: // Switch
                result = $gameSwitches.value(params[1]) === (params[2] === 0);
                break;
            case 1: // Variable
                value1 = $gameVariables.value(params[1]);
                if (params[2] === 0) {
                    value2 = params[3];
                } else {
                    value2 = $gameVariables.value(params[3]);
                }
                switch (params[4]) {
                    case 0: // Equal to
                        result = value1 === value2;
                        break;
                    case 1: // Greater than or Equal to
                        result = value1 >= value2;
                        break;
                    case 2: // Less than or Equal to
                        result = value1 <= value2;
                        break;
                    case 3: // Greater than
                        result = value1 > value2;
                        break;
                    case 4: // Less than
                        result = value1 < value2;
                        break;
                    case 5: // Not Equal to
                        result = value1 !== value2;
                        break;
                }
                break;
            case 2: // Self Switch
                if (this._eventId > 0) {
                    const key = [this._mapId, this._eventId, params[1]];
                    result = $gameSelfSwitches.value(key) === (params[2] === 0);
                }
                break;
            case 3: // Timer
                if ($gameTimer.isWorking()) {
                    const sec = $gameTimer.frames() / 60;
                    if (params[2] === 0) {
                        result = sec >= params[1];
                    } else {
                        result = sec <= params[1];
                    }
                }
                break;
            case 4: // Actor
                actor = $gameActors.actor(params[1]);
                if (actor) {
                    const n = params[3];
                    switch (params[2]) {
                        case 0: // In the Party
                            result = $gameParty.members().includes(actor);
                            break;
                        case 1: // Name
                            result = actor.name() === n;
                            break;
                        case 2: // Class
                            result = actor.isClass($dataClasses[n]);
                            break;
                        case 3: // Skill
                            result = actor.hasSkill(n);
                            break;
                        case 4: // Weapon
                            result = actor.hasWeapon($dataWeapons[n]);
                            break;
                        case 5: // Armor
                            result = actor.hasArmor($dataArmors[n]);
                            break;
                        case 6: // State
                            result = actor.isStateAffected(n);
                            break;
                    }
                }
                break;
            case 5: // Enemy
                enemy = $gameTroop.members()[params[1]];
                if (enemy) {
                    switch (params[2]) {
                        case 0: // Appeared
                            result = enemy.isAlive();
                            break;
                        case 1: // State
                            result = enemy.isStateAffected(params[3]);
                            break;
                    }
                }
                break;
            case 6: // Character
                character = this.character(params[1]);
                if (character) {
                    result = character.direction() === params[2];
                }
                break;
            case 7: // Gold
                switch (params[2]) {
                    case 0: // Greater than or equal to
                        result = $gameParty.gold() >= params[1];
                        break;
                    case 1: // Less than or equal to
                        result = $gameParty.gold() <= params[1];
                        break;
                    case 2: // Less than
                        result = $gameParty.gold() < params[1];
                        break;
                }
                break;
            case 8: // Item
                result = $gameParty.hasItem($dataItems[params[1]]);
                break;
            case 9: // Weapon
                result = $gameParty.hasItem($dataWeapons[params[1]], params[2]);
                break;
            case 10: // Armor
                result = $gameParty.hasItem($dataArmors[params[1]], params[2]);
                break;
            case 11: // Button
                switch (params[2] || 0) {
                    case 0:
                        result = Input.isPressed(params[1]);
                        break;
                    case 1:
                        result = Input.isTriggered(params[1]);
                        break;
                    case 2:
                        result = Input.isRepeated(params[1]);
                        break;
                }
                break;
            case 12: // Script
                result = !!eval(params[1]);
                break;
            case 13: // Vehicle
                result = $gamePlayer.vehicle() === $gameMap.vehicle(params[1]);
                break;
        }
        this._branch[this._indent] = result;
        if (this._branch[this._indent] === false) {
            this.skipBranch();
        }
        return true;
    }

    command411() {

        if (this._branch[this._indent] !== false) {
            this.skipBranch();
        }
        return true;
    }

    command112() {

        return true;
    }

    command413() {

        do {
            this._index--;
        } while (this.currentCommand().indent !== this._indent);
        return true;
    }

    command113() {

        let depth = 0;
        while (this._index < this._list.length - 1) {
            this._index++;
            const command = this.currentCommand();
            if (command.code === 112) {
                depth++;
            }
            if (command.code === 413) {
                if (depth > 0) {
                    depth--;
                } else {
                    break;
                }
            }
        }
        return true;
    }

    command115() {

        this._index = this._list.length;
        return true;
    }

    command117(params) {

        const commonEvent = $dataCommonEvents[params[0]];
        if (commonEvent) {
            const eventId = this.isOnCurrentMap() ? this._eventId : 0;
            this.setupChild(commonEvent.list, eventId);
        }
        return true;
    }

    setupChild(list, eventId) {

        this._childInterpreter = new Game_Interpreter(this._depth + 1);
        this._childInterpreter.setup(list, eventId);
    }

    command118() {

        return true;
    }

    command119(params) {

        const labelName = params[0];
        for (let i = 0; i < this._list.length; i++) {
            const command = this._list[i];
            if (command.code === 118 && command.parameters[0] === labelName) {
                this.jumpTo(i);
                break;
            }
        }
        return true;
    }

    jumpTo(index) {

        const lastIndex = this._index;
        const startIndex = Math.min(index, lastIndex);
        const endIndex = Math.max(index, lastIndex);
        let indent = this._indent;
        for (let i = startIndex; i <= endIndex; i++) {
            const newIndent = this._list[i].indent;
            if (newIndent !== indent) {
                this._branch[indent] = null;
                indent = newIndent;
            }
        }
        this._index = index;
    }

    command121(params) {

        for (let i = params[0]; i <= params[1]; i++) {
            $gameSwitches.setValue(i, params[2] === 0);
        }
        return true;
    }

    command122(params) {

        const startId = params[0];
        const endId = params[1];
        const operationType = params[2];
        const operand = params[3];
        let value = 0;
        let randomMax = 1;
        switch (operand) {
            case 0: // Constant
                value = params[4];
                break;
            case 1: // Variable
                value = $gameVariables.value(params[4]);
                break;
            case 2: // Random
                value = params[4];
                randomMax = params[5] - params[4] + 1;
                randomMax = Math.max(randomMax, 1);
                break;
            case 3: // Game Data
                value = this.gameDataOperand(params[4], params[5], params[6]);
                break;
            case 4: // Script
                value = eval(params[4]);
                break;
        }
        for (let i = startId; i <= endId; i++) {
            if (typeof value === "number") {
                const realValue = value + Math.randomInt(randomMax);
                this.operateVariable(i, operationType, realValue);
            } else {
                this.operateVariable(i, operationType, value);
            }
        }
        return true;
    }

    gameDataOperand(type, param1, param2) {

        let actor, enemy, character;
        switch (type) {
            case 0: // Item
                return $gameParty.numItems($dataItems[param1]);
            case 1: // Weapon
                return $gameParty.numItems($dataWeapons[param1]);
            case 2: // Armor
                return $gameParty.numItems($dataArmors[param1]);
            case 3: // Actor
                actor = $gameActors.actor(param1);
                if (actor) {
                    switch (param2) {
                        case 0: // Level
                            return actor.level;
                        case 1: // EXP
                            return actor.currentExp();
                        case 2: // HP
                            return actor.hp;
                        case 3: // MP
                            return actor.mp;
                        case 12: // TP
                            return actor.tp;
                        default:
                            // Parameter
                            if (param2 >= 4 && param2 <= 11) {
                                return actor.param(param2 - 4);
                            }
                    }
                }
                break;
            case 4: // Enemy
                enemy = $gameTroop.members()[param1];
                if (enemy) {
                    switch (param2) {
                        case 0: // HP
                            return enemy.hp;
                        case 1: // MP
                            return enemy.mp;
                        case 10: // TP
                            return enemy.tp;
                        default:
                            // Parameter
                            if (param2 >= 2 && param2 <= 9) {
                                return enemy.param(param2 - 2);
                            }
                    }
                }
                break;
            case 5: // Character
                character = this.character(param1);
                if (character) {
                    switch (param2) {
                        case 0: // Map X
                            return character.x;
                        case 1: // Map Y
                            return character.y;
                        case 2: // Direction
                            return character.direction();
                        case 3: // Screen X
                            return character.screenX();
                        case 4: // Screen Y
                            return character.screenY();
                    }
                }
                break;
            case 6: // Party
                actor = $gameParty.members()[param1];
                return actor ? actor.actorId() : 0;
            case 8: // Last
                return $gameTemp.lastActionData(param1);
            case 7: // Other
                switch (param1) {
                    case 0: // Map ID
                        return $gameMap.mapId();
                    case 1: // Party Members
                        return $gameParty.size();
                    case 2: // Gold
                        return $gameParty.gold();
                    case 3: // Steps
                        return $gameParty.steps();
                    case 4: // Play Time
                        return $gameSystem.playtime();
                    case 5: // Timer
                        return $gameTimer.seconds();
                    case 6: // Save Count
                        return $gameSystem.saveCount();
                    case 7: // Battle Count
                        return $gameSystem.battleCount();
                    case 8: // Win Count
                        return $gameSystem.winCount();
                    case 9: // Escape Count
                        return $gameSystem.escapeCount();
                }
                break;
        }
        return 0;
    }

    operateVariable(
    variableId,
    operationType,
    value
) {

        try {
            const oldValue = $gameVariables.value(variableId);
            switch (operationType) {
                case 0: // Set
                    $gameVariables.setValue(variableId, value);
                    break;
                case 1: // Add
                    $gameVariables.setValue(variableId, oldValue + value);
                    break;
                case 2: // Sub
                    $gameVariables.setValue(variableId, oldValue - value);
                    break;
                case 3: // Mul
                    $gameVariables.setValue(variableId, oldValue * value);
                    break;
                case 4: // Div
                    $gameVariables.setValue(variableId, oldValue / value);
                    break;
                case 5: // Mod
                    $gameVariables.setValue(variableId, oldValue % value);
                    break;
            }
        } catch (e) {
            $gameVariables.setValue(variableId, 0);
        }
    }

    command123(params) {

        if (this._eventId > 0) {
            const key = [this._mapId, this._eventId, params[0]];
            $gameSelfSwitches.setValue(key, params[1] === 0);
        }
        return true;
    }

    command124(params) {

        if (params[0] === 0) {
            // Start
            $gameTimer.start(params[1] * 60);
        } else {
            // Stop
            $gameTimer.stop();
        }
        return true;
    }

    command125(params) {

        const value = this.operateValue(params[0], params[1], params[2]);
        $gameParty.gainGold(value);
        return true;
    }

    command126(params) {

        const value = this.operateValue(params[1], params[2], params[3]);
        $gameParty.gainItem($dataItems[params[0]], value);
        return true;
    }

    command127(params) {

        const value = this.operateValue(params[1], params[2], params[3]);
        $gameParty.gainItem($dataWeapons[params[0]], value, params[4]);
        return true;
    }

    command128(params) {

        const value = this.operateValue(params[1], params[2], params[3]);
        $gameParty.gainItem($dataArmors[params[0]], value, params[4]);
        return true;
    }

    command129(params) {

        const actor = $gameActors.actor(params[0]);
        if (actor) {
            if (params[1] === 0) {
                // Add
                if (params[2]) {
                    // Initialize
                    $gameActors.actor(params[0]).setup(params[0]);
                }
                $gameParty.addActor(params[0]);
            } else {
                // Remove
                $gameParty.removeActor(params[0]);
            }
        }
        return true;
    }

    command132(params) {

        $gameSystem.setBattleBgm(params[0]);
        return true;
    }

    command133(params) {

        $gameSystem.setVictoryMe(params[0]);
        return true;
    }

    command134(params) {

        if (params[0] === 0) {
            $gameSystem.disableSave();
        } else {
            $gameSystem.enableSave();
        }
        return true;
    }

    command135(params) {

        if (params[0] === 0) {
            $gameSystem.disableMenu();
        } else {
            $gameSystem.enableMenu();
        }
        return true;
    }

    command136(params) {

        if (params[0] === 0) {
            $gameSystem.disableEncounter();
        } else {
            $gameSystem.enableEncounter();
        }
        $gamePlayer.makeEncounterCount();
        return true;
    }

    command137(params) {

        if (params[0] === 0) {
            $gameSystem.disableFormation();
        } else {
            $gameSystem.enableFormation();
        }
        return true;
    }

    command138(params) {

        $gameSystem.setWindowTone(params[0]);
        return true;
    }

    command139(params) {

        $gameSystem.setDefeatMe(params[0]);
        return true;
    }

    command140(params) {

        const vehicle = $gameMap.vehicle(params[0]);
        if (vehicle) {
            vehicle.setBgm(params[1]);
        }
        return true;
    }

    command201(params) {

        if ($gameParty.inBattle() || $gameMessage.isBusy()) {
            return false;
        }
        let mapId, x, y;
        if (params[0] === 0) {
            // Direct designation
            mapId = params[1];
            x = params[2];
            y = params[3];
        } else {
            // Designation with variables
            mapId = $gameVariables.value(params[1]);
            x = $gameVariables.value(params[2]);
            y = $gameVariables.value(params[3]);
        }
        $gamePlayer.reserveTransfer(mapId, x, y, params[4], params[5]);
        this.setWaitMode("transfer");
        return true;
    }

    command202(params) {

        let mapId, x, y;
        if (params[1] === 0) {
            // Direct designation
            mapId = params[2];
            x = params[3];
            y = params[4];
        } else {
            // Designation with variables
            mapId = $gameVariables.value(params[2]);
            x = $gameVariables.value(params[3]);
            y = $gameVariables.value(params[4]);
        }
        const vehicle = $gameMap.vehicle(params[0]);
        if (vehicle) {
            vehicle.setLocation(mapId, x, y);
        }
        return true;
    }

    command203(params) {

        const character = this.character(params[0]);
        if (character) {
            if (params[1] === 0) {
                // Direct designation
                character.locate(params[2], params[3]);
            } else if (params[1] === 1) {
                // Designation with variables
                const x = $gameVariables.value(params[2]);
                const y = $gameVariables.value(params[3]);
                character.locate(x, y);
            } else {
                // Exchange with another event
                const character2 = this.character(params[2]);
                if (character2) {
                    character.swap(character2);
                }
            }
            if (params[4] > 0) {
                character.setDirection(params[4]);
            }
        }
        return true;
    }

    command204(params) {

        if (!$gameParty.inBattle()) {
            if ($gameMap.isScrolling()) {
                this.setWaitMode("scroll");
                return false;
            }
            $gameMap.startScroll(params[0], params[1], params[2]);
            if (params[3]) {
                this.setWaitMode("scroll");
            }
        }
        return true;
    }

    command205(params) {

        $gameMap.refreshIfNeeded();
        this._characterId = params[0];
        const character = this.character(this._characterId);
        if (character) {
            character.forceMoveRoute(params[1]);
            if (params[1].wait) {
                this.setWaitMode("route");
            }
        }
        return true;
    }

    command206() {

        $gamePlayer.getOnOffVehicle();
        return true;
    }

    command211(params) {

        $gamePlayer.setTransparent(params[0] === 0);
        return true;
    }

    command212(params) {

        this._characterId = params[0];
        const character = this.character(this._characterId);
        if (character) {
            $gameTemp.requestAnimation([character], params[1]);
            if (params[2]) {
                this.setWaitMode("animation");
            }
        }
        return true;
    }

    command213(params) {

        this._characterId = params[0];
        const character = this.character(this._characterId);
        if (character) {
            $gameTemp.requestBalloon(character, params[1]);
            if (params[2]) {
                this.setWaitMode("balloon");
            }
        }
        return true;
    }

    command214() {

        if (this.isOnCurrentMap() && this._eventId > 0) {
            $gameMap.eraseEvent(this._eventId);
        }
        return true;
    }

    command216(params) {

        if (params[0] === 0) {
            $gamePlayer.showFollowers();
        } else {
            $gamePlayer.hideFollowers();
        }
        $gamePlayer.refresh();
        return true;
    }

    command217() {

        if (!$gameParty.inBattle()) {
            $gamePlayer.gatherFollowers();
            this.setWaitMode("gather");
        }
        return true;
    }

    command221() {

        if ($gameMessage.isBusy()) {
            return false;
        }
        $gameScreen.startFadeOut(this.fadeSpeed());
        this.wait(this.fadeSpeed());
        return true;
    }

    command222() {

        if ($gameMessage.isBusy()) {
            return false;
        }
        $gameScreen.startFadeIn(this.fadeSpeed());
        this.wait(this.fadeSpeed());
        return true;
    }

    command223(params) {

        $gameScreen.startTint(params[0], params[1]);
        if (params[2]) {
            this.wait(params[1]);
        }
        return true;
    }

    command224(params) {

        $gameScreen.startFlash(params[0], params[1]);
        if (params[2]) {
            this.wait(params[1]);
        }
        return true;
    }

    command225(params) {

        $gameScreen.startShake(params[0], params[1], params[2]);
        if (params[3]) {
            this.wait(params[2]);
        }
        return true;
    }

    command230(params) {

        this.wait(params[0]);
        return true;
    }

    command231(params) {

        const point = this.picturePoint(params);
        // prettier-ignore
        $gameScreen.showPicture(
            params[0], params[1], params[2], point.x, point.y,
            params[6], params[7], params[8], params[9]
        );
        return true;
    }

    command232(params) {

        const point = this.picturePoint(params);
        // prettier-ignore
        $gameScreen.movePicture(
            params[0], params[2], point.x, point.y, params[6], params[7],
            params[8], params[9], params[10], params[12] || 0
        );
        if (params[11]) {
            this.wait(params[10]);
        }
        return true;
    }

    picturePoint(params) {

        const point = new Point();
        if (params[3] === 0) {
            // Direct designation
            point.x = params[4];
            point.y = params[5];
        } else {
            // Designation with variables
            point.x = $gameVariables.value(params[4]);
            point.y = $gameVariables.value(params[5]);
        }
        return point;
    }

    command233(params) {

        $gameScreen.rotatePicture(params[0], params[1]);
        return true;
    }

    command234(params) {

        $gameScreen.tintPicture(params[0], params[1], params[2]);
        if (params[3]) {
            this.wait(params[2]);
        }
        return true;
    }

    command235(params) {

        $gameScreen.erasePicture(params[0]);
        return true;
    }

    command236(params) {

        if (!$gameParty.inBattle()) {
            $gameScreen.changeWeather(params[0], params[1], params[2]);
            if (params[3]) {
                this.wait(params[2]);
            }
        }
        return true;
    }

    command241(params) {

        AudioManager.playBgm(params[0]);
        return true;
    }

    command242(params) {

        AudioManager.fadeOutBgm(params[0]);
        return true;
    }

    command243() {

        $gameSystem.saveBgm();
        return true;
    }

    command244() {

        $gameSystem.replayBgm();
        return true;
    }

    command245(params) {

        AudioManager.playBgs(params[0]);
        return true;
    }

    command246(params) {

        AudioManager.fadeOutBgs(params[0]);
        return true;
    }

    command249(params) {

        AudioManager.playMe(params[0]);
        return true;
    }

    command250(params) {

        AudioManager.playSe(params[0]);
        return true;
    }

    command251() {

        AudioManager.stopSe();
        return true;
    }

    command261(params) {

        if ($gameMessage.isBusy()) {
            return false;
        }
        const name = params[0];
        if (name.length > 0) {
            const ext = this.videoFileExt();
            Video.play("movies/" + name + ext);
            this.setWaitMode("video");
        }
        return true;
    }

    videoFileExt() {

        if (Utils.canPlayWebm()) {
            return ".webm";
        } else {
            return ".mp4";
        }
    }

    command281(params) {

        if (params[0] === 0) {
            $gameMap.enableNameDisplay();
        } else {
            $gameMap.disableNameDisplay();
        }
        return true;
    }

    command282(params) {

        const tileset = $dataTilesets[params[0]];
        const allReady = tileset.tilesetNames
            .map(tilesetName => ImageManager.loadTileset(tilesetName))
            .every(bitmap => bitmap.isReady());
        if (allReady) {
            $gameMap.changeTileset(params[0]);
            return true;
        } else {
            return false;
        }
    }

    command283(params) {

        $gameMap.changeBattleback(params[0], params[1]);
        return true;
    }

    command284(params) {

        // prettier-ignore
        $gameMap.changeParallax(
            params[0], params[1], params[2], params[3], params[4]
        );
        return true;
    }

    command285(params) {

        let x, y, value;
        if (params[2] === 0) {
            // Direct designation
            x = params[3];
            y = params[4];
        } else if (params[2] === 1) {
            // Designation with variables
            x = $gameVariables.value(params[3]);
            y = $gameVariables.value(params[4]);
        } else {
            // Designation by a character
            const character = this.character(params[3]);
            x = character.x;
            y = character.y;
        }
        switch (params[1]) {
            case 0: // Terrain Tag
                value = $gameMap.terrainTag(x, y);
                break;
            case 1: // Event ID
                value = $gameMap.eventIdXy(x, y);
                break;
            case 2: // Tile ID (Layer 1)
            case 3: // Tile ID (Layer 2)
            case 4: // Tile ID (Layer 3)
            case 5: // Tile ID (Layer 4)
                value = $gameMap.tileId(x, y, params[1] - 2);
                break;
            default:
                // Region ID
                value = $gameMap.regionId(x, y);
                break;
        }
        $gameVariables.setValue(params[0], value);
        return true;
    }

    command301(params) {

        if (!$gameParty.inBattle()) {
            let troopId;
            if (params[0] === 0) {
                // Direct designation
                troopId = params[1];
            } else if (params[0] === 1) {
                // Designation with a variable
                troopId = $gameVariables.value(params[1]);
            } else {
                // Same as Random Encounters
                troopId = $gamePlayer.makeEncounterTroopId();
            }
            if ($dataTroops[troopId]) {
                BattleManager.setup(troopId, params[2], params[3]);
                BattleManager.setEventCallback(n => {
                    this._branch[this._indent] = n;
                });
                $gamePlayer.makeEncounterCount();
                SceneManager.push(Scene_Battle);
            }
        }
        return true;
    }

    command601() {

        if (this._branch[this._indent] !== 0) {
            this.skipBranch();
        }
        return true;
    }

    command602() {

        if (this._branch[this._indent] !== 1) {
            this.skipBranch();
        }
        return true;
    }

    command603() {

        if (this._branch[this._indent] !== 2) {
            this.skipBranch();
        }
        return true;
    }

    command302(params) {

        if (!$gameParty.inBattle()) {
            const goods = [params];
            while (this.nextEventCode() === 605) {
                this._index++;
                goods.push(this.currentCommand().parameters);
            }
            SceneManager.push(Scene_Shop);
            SceneManager.prepareNextScene(goods, params[4]);
        }
        return true;
    }

    command303(params) {

        if (!$gameParty.inBattle()) {
            if ($dataActors[params[0]]) {
                SceneManager.push(Scene_Name);
                SceneManager.prepareNextScene(params[0], params[1]);
            }
        }
        return true;
    }

    command311(params) {

        const value = this.operateValue(params[2], params[3], params[4]);
        this.iterateActorEx(params[0], params[1], actor => {
            this.changeHp(actor, value, params[5]);
        });
        return true;
    }

    command312(params) {

        const value = this.operateValue(params[2], params[3], params[4]);
        this.iterateActorEx(params[0], params[1], actor => {
            actor.gainMp(value);
        });
        return true;
    }

    command326(params) {

        const value = this.operateValue(params[2], params[3], params[4]);
        this.iterateActorEx(params[0], params[1], actor => {
            actor.gainTp(value);
        });
        return true;
    }

    command313(params) {

        this.iterateActorEx(params[0], params[1], actor => {
            const alreadyDead = actor.isDead();
            if (params[2] === 0) {
                actor.addState(params[3]);
            } else {
                actor.removeState(params[3]);
            }
            if (actor.isDead() && !alreadyDead) {
                actor.performCollapse();
            }
            actor.clearResult();
        });
        return true;
    }

    command314(params) {

        this.iterateActorEx(params[0], params[1], actor => {
            actor.recoverAll();
        });
        return true;
    }

    command315(params) {

        const value = this.operateValue(params[2], params[3], params[4]);
        this.iterateActorEx(params[0], params[1], actor => {
            actor.changeExp(actor.currentExp() + value, params[5]);
        });
        return true;
    }

    command316(params) {

        const value = this.operateValue(params[2], params[3], params[4]);
        this.iterateActorEx(params[0], params[1], actor => {
            actor.changeLevel(actor.level + value, params[5]);
        });
        return true;
    }

    command317(params) {

        const value = this.operateValue(params[3], params[4], params[5]);
        this.iterateActorEx(params[0], params[1], actor => {
            actor.addParam(params[2], value);
        });
        return true;
    }

    command318(params) {

        this.iterateActorEx(params[0], params[1], actor => {
            if (params[2] === 0) {
                actor.learnSkill(params[3]);
            } else {
                actor.forgetSkill(params[3]);
            }
        });
        return true;
    }

    command319(params) {

        const actor = $gameActors.actor(params[0]);
        if (actor) {
            actor.changeEquipById(params[1], params[2]);
        }
        return true;
    }

    command320(params) {

        const actor = $gameActors.actor(params[0]);
        if (actor) {
            actor.setName(params[1]);
        }
        return true;
    }

    command321(params) {

        const actor = $gameActors.actor(params[0]);
        if (actor && $dataClasses[params[1]]) {
            actor.changeClass(params[1], params[2]);
        }
        return true;
    }

    command322(params) {

        const actor = $gameActors.actor(params[0]);
        if (actor) {
            actor.setCharacterImage(params[1], params[2]);
            actor.setFaceImage(params[3], params[4]);
            actor.setBattlerImage(params[5]);
        }
        $gamePlayer.refresh();
        return true;
    }

    command323(params) {

        const vehicle = $gameMap.vehicle(params[0]);
        if (vehicle) {
            vehicle.setImage(params[1], params[2]);
        }
        return true;
    }

    command324(params) {

        const actor = $gameActors.actor(params[0]);
        if (actor) {
            actor.setNickname(params[1]);
        }
        return true;
    }

    command325(params) {

        const actor = $gameActors.actor(params[0]);
        if (actor) {
            actor.setProfile(params[1]);
        }
        return true;
    }

    command331(params) {

        const value = this.operateValue(params[1], params[2], params[3]);
        this.iterateEnemyIndex(params[0], enemy => {
            this.changeHp(enemy, value, params[4]);
        });
        return true;
    }

    command332(params) {

        const value = this.operateValue(params[1], params[2], params[3]);
        this.iterateEnemyIndex(params[0], enemy => {
            enemy.gainMp(value);
        });
        return true;
    }

    command342(params) {

        const value = this.operateValue(params[1], params[2], params[3]);
        this.iterateEnemyIndex(params[0], enemy => {
            enemy.gainTp(value);
        });
        return true;
    }

    command333(params) {

        this.iterateEnemyIndex(params[0], enemy => {
            const alreadyDead = enemy.isDead();
            if (params[1] === 0) {
                enemy.addState(params[2]);
            } else {
                enemy.removeState(params[2]);
            }
            if (enemy.isDead() && !alreadyDead) {
                enemy.performCollapse();
            }
            enemy.clearResult();
        });
        return true;
    }

    command334(params) {

        this.iterateEnemyIndex(params[0], enemy => {
            enemy.recoverAll();
        });
        return true;
    }

    command335(params) {

        this.iterateEnemyIndex(params[0], enemy => {
            enemy.appear();
            $gameTroop.makeUniqueNames();
        });
        return true;
    }

    command336(params) {

        this.iterateEnemyIndex(params[0], enemy => {
            enemy.transform(params[1]);
            $gameTroop.makeUniqueNames();
        });
        return true;
    }

    command337(params) {

        let param = params[0];
        if (params[2]) {
            param = -1;
        }
        const targets = [];
        this.iterateEnemyIndex(param, enemy => {
            if (enemy.isAlive()) {
                targets.push(enemy);
            }
        });
        $gameTemp.requestAnimation(targets, params[1]);
        return true;
    }

    command339(params) {

        this.iterateBattler(params[0], params[1], battler => {
            if (!battler.isDeathStateAffected()) {
                battler.forceAction(params[2], params[3]);
                BattleManager.forceAction(battler);
                this.setWaitMode("action");
            }
        });
        return true;
    }

    command340() {

        BattleManager.abort();
        return true;
    }

    command351() {

        if (!$gameParty.inBattle()) {
            SceneManager.push(Scene_Menu);
            Window_MenuCommand.initCommandPosition();
        }
        return true;
    }

    command352() {

        if (!$gameParty.inBattle()) {
            SceneManager.push(Scene_Save);
        }
        return true;
    }

    command353() {

        SceneManager.goto(Scene_Gameover);
        return true;
    }

    command354() {

        SceneManager.goto(Scene_Title);
        return true;
    }

    command355() {

        let script = this.currentCommand().parameters[0] + "\n";
        while (this.nextEventCode() === 655) {
            this._index++;
            script += this.currentCommand().parameters[0] + "\n";
        }
        eval(script);
        return true;
    }

    command356(params) {

        const args = params[0].split(" ");
        const command = args.shift();
        this.pluginCommand(command, args);
        return true;
    }

    pluginCommand() {

        // deprecated
    }

    command357(params) {

        const pluginName = Utils.extractFileName(params[0]);
        PluginManager.callCommand(this, pluginName, params[1], params[3]);
        return true;
    }

}

//-----------------------------------------------------------------------------
// Game_Timer
//
// The game object class for the timer.

class Game_Timer {
    constructor() {
        this.initialize(...arguments);
    }

    initialize() {
        this._frames = 0;
        this._working = false;
    }

    update(sceneActive) {
        if (sceneActive && this._working && this._frames > 0) {
            this._frames--;
            if (this._frames === 0) {
                this.onExpire();
            }
        }
    }

    start(count) {
        this._frames = count;
        this._working = true;
    }

    stop() {
        this._working = false;
    }

    isWorking() {
        return this._working;
    }

    seconds() {
        return Math.floor(this._frames / 60);
    }

    frames() {
        return this._frames;
    }

    onExpire() {
        // Timer expired - can be used for battle timeouts, etc.
    }
}


class Game_Screen {
    constructor() {
        this.initialize(...arguments);
    }

    initialize() {

        this.clear();
    }

    clear() {

        this.clearFade();
        this.clearTone();
        this.clearFlash();
        this.clearShake();
        this.clearZoom();
        this.clearWeather();
        this.clearPictures();
    }

    onBattleStart() {

        this.clearFade();
        this.clearFlash();
        this.clearShake();
        this.clearZoom();
        this.eraseBattlePictures();
    }

    brightness() {

        return this._brightness;
    }

    tone() {

        return this._tone;
    }

    flashColor() {

        return this._flashColor;
    }

    shake() {

        return this._shake;
    }

    zoomX() {

        return this._zoomX;
    }

    zoomY() {

        return this._zoomY;
    }

    zoomScale() {

        return this._zoomScale;
    }

    weatherType() {

        return this._weatherType;
    }

    weatherPower() {

        return this._weatherPower;
    }

    picture(pictureId) {

        const realPictureId = this.realPictureId(pictureId);
        return this._pictures[realPictureId];
    }

    realPictureId(pictureId) {

        if ($gameParty.inBattle()) {
            return pictureId + this.maxPictures();
        } else {
            return pictureId;
        }
    }

    clearFade() {

        this._brightness = 255;
        this._fadeOutDuration = 0;
        this._fadeInDuration = 0;
    }

    clearTone() {

        this._tone = [0, 0, 0, 0];
        this._toneTarget = [0, 0, 0, 0];
        this._toneDuration = 0;
    }

    clearFlash() {

        this._flashColor = [0, 0, 0, 0];
        this._flashDuration = 0;
    }

    clearShake() {

        this._shakePower = 0;
        this._shakeSpeed = 0;
        this._shakeDuration = 0;
        this._shakeDirection = 1;
        this._shake = 0;
    }

    clearZoom() {

        this._zoomX = 0;
        this._zoomY = 0;
        this._zoomScale = 1;
        this._zoomScaleTarget = 1;
        this._zoomDuration = 0;
    }

    clearWeather() {

        this._weatherType = "none";
        this._weatherPower = 0;
        this._weatherPowerTarget = 0;
        this._weatherDuration = 0;
    }

    clearPictures() {

        this._pictures = [];
    }

    eraseBattlePictures() {

        this._pictures = this._pictures.slice(0, this.maxPictures() + 1);
    }

    maxPictures() {

        return 100;
    }

    startFadeOut(duration) {

        this._fadeOutDuration = duration;
        this._fadeInDuration = 0;
    }

    startFadeIn(duration) {

        this._fadeInDuration = duration;
        this._fadeOutDuration = 0;
    }

    startTint(tone, duration) {

        this._toneTarget = tone.clone();
        this._toneDuration = duration;
        if (this._toneDuration === 0) {
            this._tone = this._toneTarget.clone();
        }
    }

    startFlash(color, duration) {

        this._flashColor = color.clone();
        this._flashDuration = duration;
    }

    startShake(power, speed, duration) {

        this._shakePower = power;
        this._shakeSpeed = speed;
        this._shakeDuration = duration;
    }

    startZoom(x, y, scale, duration) {

        this._zoomX = x;
        this._zoomY = y;
        this._zoomScaleTarget = scale;
        this._zoomDuration = duration;
    }

    setZoom(x, y, scale) {

        this._zoomX = x;
        this._zoomY = y;
        this._zoomScale = scale;
    }

    changeWeather(type, power, duration) {

        if (type !== "none" || duration === 0) {
            this._weatherType = type;
        }
        this._weatherPowerTarget = type === "none" ? 0 : power;
        this._weatherDuration = duration;
        if (duration === 0) {
            this._weatherPower = this._weatherPowerTarget;
        }
    }

    update() {

        this.updateFadeOut();
        this.updateFadeIn();
        this.updateTone();
        this.updateFlash();
        this.updateShake();
        this.updateZoom();
        this.updateWeather();
        this.updatePictures();
    }

    updateFadeOut() {

        if (this._fadeOutDuration > 0) {
            const d = this._fadeOutDuration;
            this._brightness = (this._brightness * (d - 1)) / d;
            this._fadeOutDuration--;
        }
    }

    updateFadeIn() {

        if (this._fadeInDuration > 0) {
            const d = this._fadeInDuration;
            this._brightness = (this._brightness * (d - 1) + 255) / d;
            this._fadeInDuration--;
        }
    }

    updateTone() {

        if (this._toneDuration > 0) {
            const d = this._toneDuration;
            for (let i = 0; i < 4; i++) {
                this._tone[i] = (this._tone[i] * (d - 1) + this._toneTarget[i]) / d;
            }
            this._toneDuration--;
        }
    }

    updateFlash() {

        if (this._flashDuration > 0) {
            const d = this._flashDuration;
            this._flashColor[3] *= (d - 1) / d;
            this._flashDuration--;
        }
    }

    updateShake() {

        if (this._shakeDuration > 0 || this._shake !== 0) {
            const delta =
                (this._shakePower * this._shakeSpeed * this._shakeDirection) / 10;
            if (
                this._shakeDuration <= 1 &&
                this._shake * (this._shake + delta) < 0
            ) {
                this._shake = 0;
            } else {
                this._shake += delta;
            }
            if (this._shake > this._shakePower * 2) {
                this._shakeDirection = -1;
            }
            if (this._shake < -this._shakePower * 2) {
                this._shakeDirection = 1;
            }
            this._shakeDuration--;
        }
    }

    updateZoom() {

        if (this._zoomDuration > 0) {
            const d = this._zoomDuration;
            const t = this._zoomScaleTarget;
            this._zoomScale = (this._zoomScale * (d - 1) + t) / d;
            this._zoomDuration--;
        }
    }

    updateWeather() {

        if (this._weatherDuration > 0) {
            const d = this._weatherDuration;
            const t = this._weatherPowerTarget;
            this._weatherPower = (this._weatherPower * (d - 1) + t) / d;
            this._weatherDuration--;
            if (this._weatherDuration === 0 && this._weatherPowerTarget === 0) {
                this._weatherType = "none";
            }
        }
    }

    updatePictures() {

        for (const picture of this._pictures) {
            if (picture) {
                picture.update();
            }
        }
    }

    startFlashForDamage() {

        this.startFlash([255, 0, 0, 128], 8);
    }

    showPicture(
    pictureId, name, origin, x, y, scaleX, scaleY, opacity, blendMode
) {

        const realPictureId = this.realPictureId(pictureId);
        const picture = new Game_Picture();
        picture.show(name, origin, x, y, scaleX, scaleY, opacity, blendMode);
        this._pictures[realPictureId] = picture;
    }

    movePicture(
    pictureId, origin, x, y, scaleX, scaleY, opacity, blendMode, duration,
    easingType
) {

        const picture = this.picture(pictureId);
        if (picture) {
            // prettier-ignore
            picture.move(origin, x, y, scaleX, scaleY, opacity, blendMode,
                         duration, easingType);
        }
    }

    rotatePicture(pictureId, speed) {

        const picture = this.picture(pictureId);
        if (picture) {
            picture.rotate(speed);
        }
    }

    tintPicture(pictureId, tone, duration) {

        const picture = this.picture(pictureId);
        if (picture) {
            picture.tint(tone, duration);
        }
    }

    erasePicture(pictureId) {

        const realPictureId = this.realPictureId(pictureId);
        this._pictures[realPictureId] = null;
    }

}

class Game_Picture {
    constructor() {
        this.initialize(...arguments);
    }

    initialize() {

        this.initBasic();
        this.initTarget();
        this.initTone();
        this.initRotation();
    }

    name() {

        return this._name;
    }

    origin() {

        return this._origin;
    }

    x() {

        return this._x;
    }

    y() {

        return this._y;
    }

    scaleX() {

        return this._scaleX;
    }

    scaleY() {

        return this._scaleY;
    }

    opacity() {

        return this._opacity;
    }

    blendMode() {

        return this._blendMode;
    }

    tone() {

        return this._tone;
    }

    angle() {

        return this._angle;
    }

    initBasic() {

        this._name = "";
        this._origin = 0;
        this._x = 0;
        this._y = 0;
        this._scaleX = 100;
        this._scaleY = 100;
        this._opacity = 255;
        this._blendMode = 0;
    }

    initTarget() {

        this._targetX = this._x;
        this._targetY = this._y;
        this._targetScaleX = this._scaleX;
        this._targetScaleY = this._scaleY;
        this._targetOpacity = this._opacity;
        this._duration = 0;
        this._wholeDuration = 0;
        this._easingType = 0;
        this._easingExponent = 0;
    }

    initTone() {

        this._tone = null;
        this._toneTarget = null;
        this._toneDuration = 0;
    }

    initRotation() {

        this._angle = 0;
        this._rotationSpeed = 0;
    }

    show(
    name, origin, x, y, scaleX, scaleY, opacity, blendMode
) {

        this._name = name;
        this._origin = origin;
        this._x = x;
        this._y = y;
        this._scaleX = scaleX;
        this._scaleY = scaleY;
        this._opacity = opacity;
        this._blendMode = blendMode;
        this.initTarget();
        this.initTone();
        this.initRotation();
    }

    move(
    origin, x, y, scaleX, scaleY, opacity, blendMode, duration, easingType
) {

        this._origin = origin;
        this._targetX = x;
        this._targetY = y;
        this._targetScaleX = scaleX;
        this._targetScaleY = scaleY;
        this._targetOpacity = opacity;
        this._blendMode = blendMode;
        this._duration = duration;
        this._wholeDuration = duration;
        this._easingType = easingType;
        this._easingExponent = 2;
    }

    rotate(speed) {

        this._rotationSpeed = speed;
    }

    tint(tone, duration) {

        if (!this._tone) {
            this._tone = [0, 0, 0, 0];
        }
        this._toneTarget = tone.clone();
        this._toneDuration = duration;
        if (this._toneDuration === 0) {
            this._tone = this._toneTarget.clone();
        }
    }

    erase() {
        this._name = "";
        this._origin = 0;
        this.initTarget();
        this.initTone();
        this.initRotation();
    }

    updateMove() {
        if (this._duration > 0) {
            const d = this._duration;
            const wd = this._wholeDuration;
            const et = this._easingType;
            const exponent = this._easingExponent;

            this._x = this.applyEasing(this._x, this._targetX, d, wd, et, exponent);
            this._y = this.applyEasing(this._y, this._targetY, d, wd, et, exponent);
            this._scaleX = this.applyEasing(this._scaleX, this._targetScaleX, d, wd, et, exponent);
            this._scaleY = this.applyEasing(this._scaleY, this._targetScaleY, d, wd, et, exponent);
            this._opacity = this.applyEasing(this._opacity, this._targetOpacity, d, wd, et, exponent);
            this._duration--;
        }
    }

    updateTone() {
        if (this._toneDuration > 0) {
            const d = this._toneDuration;
            for (let i = 0; i < 4; i++) {
                this._tone[i] = (this._tone[i] * (d - 1) + this._toneTarget[i]) / d;
            }
            this._toneDuration--;
        }
    }

    updateRotation() {
        if (this._rotationSpeed !== 0) {
            this._angle += this._rotationSpeed / 2;
        }
    }

    applyEasing(current, target, duration, wholeDuration, easingType, exponent) {
        const t = (wholeDuration - duration) / wholeDuration;
        const lt = t - 1;
        let factor;

        switch (easingType) {
            case 0: // Linear
                factor = t;
                break;
            case 1: // Ease In
                factor = Math.pow(t, exponent);
                break;
            case 2: // Ease Out
                factor = 1 - Math.pow(1 - t, exponent);
                break;
            case 3: // Ease In Out
                if (t < 0.5) {
                    factor = Math.pow(t * 2, exponent) / 2;
                } else {
                    factor = (2 - Math.pow((1 - t) * 2, exponent)) / 2;
                }
                break;
            default:
                factor = t;
        }

        return current + (target - current) * factor;
    }

    update() {

        this.updateMove();
        this.updateTone();
        this.updateRotation();
    }

}

class Game_CommonEvent {
    constructor() {
        this.initialize(...arguments);
    }

    initialize(commonEventId) {

        this._commonEventId = commonEventId;
        this.refresh();
    }

    event() {

        return $dataCommonEvents[this._commonEventId];
    }

    list() {

        return this.event().list;
    }

    refresh() {

        if (this.isActive()) {
            if (!this._interpreter) {
                this._interpreter = new Game_Interpreter();
            }
        } else {
            this._interpreter = null;
        }
    }

    isActive() {

        const event = this.event();
        return event.trigger === 2 && $gameSwitches.value(event.switchId);
    }

    update() {

        if (this._interpreter) {
            if (!this._interpreter.isRunning()) {
                this._interpreter.setup(this.list());
            }
            this._interpreter.update();
        }
    }

}

console.log('reactor_objects.js loaded');
