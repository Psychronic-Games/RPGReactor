//=============================================================================
// reactor_objects.js v1.7.0
//=============================================================================
// Continued in these parts, which reactor_main.js loads next in this order:
//   reactor_objects_actions.js
//   reactor_objects_battlers.js
//   reactor_objects_map.js
//   reactor_objects_interpreter.js
//   reactor_objects_followers.js
//   reactor_objects_legacy.js

//-----------------------------------------------------------------------------
// Game_Temp
//
// The game object class for temporary data that is not included in save data.

function Game_Temp() {
    this.initialize(...arguments);
}

Game_Temp.prototype.initialize = function() {
    this._isPlaytest = Utils.isOptionValid("test");
    this._destinationX = null;
    this._destinationY = null;
    this._touchTarget = null;
    this._touchState = "";
    this._needsBattleRefresh = false;
    this._commonEventQueue = [];
    this._animationQueue = [];
    this._balloonQueue = [];
    this._lastActionData = [0, 0, 0, 0, 0, 0];
};

Game_Temp.prototype.isPlaytest = function() {
    return this._isPlaytest;
};

Game_Temp.prototype.setDestination = function(x, y) {
    if (x !== this._destinationX || y !== this._destinationY) this._destinationVersion = (this._destinationVersion || 0) + 1;
    this._destinationX = x;
    this._destinationY = y;
};

Game_Temp.prototype.clearDestination = function() {
    if (this.isDestinationValid()) this._destinationVersion = (this._destinationVersion || 0) + 1;
    this._destinationX = null;
    this._destinationY = null;
};

Game_Temp.prototype.isDestinationValid = function() {
    return this._destinationX !== null;
};

Game_Temp.prototype.destinationX = function() {
    return this._destinationX;
};

Game_Temp.prototype.destinationY = function() {
    return this._destinationY;
};

Game_Temp.prototype.setTouchState = function(target, state) {
    this._touchTarget = target;
    this._touchState = state;
};

Game_Temp.prototype.clearTouchState = function() {
    this._touchTarget = null;
    this._touchState = "";
};

Game_Temp.prototype.touchTarget = function() {
    return this._touchTarget;
};

Game_Temp.prototype.touchState = function() {
    return this._touchState;
};

Game_Temp.prototype.requestBattleRefresh = function() {
    if ($gameParty.inBattle()) {
        this._needsBattleRefresh = true;
    }
};

Game_Temp.prototype.clearBattleRefreshRequest = function() {
    this._needsBattleRefresh = false;
};

Game_Temp.prototype.isBattleRefreshRequested = function() {
    return this._needsBattleRefresh;
};

Game_Temp.prototype.reserveCommonEvent = function(commonEventId) {
    this._commonEventQueue.push(commonEventId);
};

Game_Temp.prototype.retrieveCommonEvent = function() {
    return $dataCommonEvents[this._commonEventQueue.shift()];
};

Game_Temp.prototype.clearCommonEventReservation = function() {
    this._commonEventQueue.length = 0;
};

Game_Temp.prototype.isCommonEventReserved = function() {
    return this._commonEventQueue.length > 0;
};

// prettier-ignore
Game_Temp.prototype.requestAnimation = function(
    targets, animationId, mirror = false
) {
    if ($dataAnimations[animationId]) {
        const request = {
            targets: targets,
            animationId: animationId,
            mirror: mirror
        };
        this._animationQueue.push(request);
        for (const target of targets) {
            if (target.startAnimation) {
                target.startAnimation();
            }
        }
    }
};

Game_Temp.prototype.retrieveAnimation = function() {
    return this._animationQueue.shift();
};

Game_Temp.prototype.requestBalloon = function(target, balloonId) {
    const request = { target: target, balloonId: balloonId };
    this._balloonQueue.push(request);
    if (target.startBalloon) {
        target.startBalloon();
    }
};

Game_Temp.prototype.retrieveBalloon = function() {
    return this._balloonQueue.shift();
};

Game_Temp.prototype.lastActionData = function(type) {
    return this._lastActionData[type] || 0;
};

Game_Temp.prototype.setLastActionData = function(type, value) {
    this._lastActionData[type] = value;
};

Game_Temp.prototype.setLastUsedSkillId = function(skillID) {
    this.setLastActionData(0, skillID);
};

Game_Temp.prototype.setLastUsedItemId = function(itemID) {
    this.setLastActionData(1, itemID);
};

Game_Temp.prototype.setLastSubjectActorId = function(actorID) {
    this.setLastActionData(2, actorID);
};

Game_Temp.prototype.setLastSubjectEnemyIndex = function(enemyIndex) {
    this.setLastActionData(3, enemyIndex);
};

Game_Temp.prototype.setLastTargetActorId = function(actorID) {
    this.setLastActionData(4, actorID);
};

Game_Temp.prototype.setLastTargetEnemyIndex = function(enemyIndex) {
    this.setLastActionData(5, enemyIndex);
};

//-----------------------------------------------------------------------------
// Game_System
//
// The game object class for the system data.

function Game_System() {
    this.initialize(...arguments);
}

Game_System.prototype.initialize = function() {
    this._saveEnabled = true;
    this._menuEnabled = true;
    this._encounterEnabled = true;
    this._formationEnabled = true;
    this._battleCount = 0;
    this._winCount = 0;
    this._escapeCount = 0;
    this._saveCount = 0;
    this._versionId = 0;
    this._savefileId = 0;
    this._framesOnSave = 0;
    this._bgmOnSave = null;
    this._bgsOnSave = null;
    this._windowTone = null;
    this._battleBgm = null;
    this._victoryMe = null;
    this._defeatMe = null;
    this._savedBgm = null;
    this._walkingBgm = null;
};

Game_System.prototype.isJapanese = function() {
    return $dataSystem.locale.match(/^ja/);
};

Game_System.prototype.isChinese = function() {
    return $dataSystem.locale.match(/^zh/);
};

Game_System.prototype.isKorean = function() {
    return $dataSystem.locale.match(/^ko/);
};

Game_System.prototype.isCJK = function() {
    return $dataSystem.locale.match(/^(ja|zh|ko)/);
};

Game_System.prototype.isRussian = function() {
    return $dataSystem.locale.match(/^ru/);
};

Game_System.prototype.isSideView = function() {
    return $dataSystem.optSideView;
};

Game_System.prototype.isAutosaveEnabled = function() {
    return $dataSystem.optAutosave;
};

Game_System.prototype.isSaveEnabled = function() {
    return this._saveEnabled;
};

Game_System.prototype.disableSave = function() {
    this._saveEnabled = false;
};

Game_System.prototype.enableSave = function() {
    this._saveEnabled = true;
};

Game_System.prototype.isMenuEnabled = function() {
    return this._menuEnabled;
};

Game_System.prototype.disableMenu = function() {
    this._menuEnabled = false;
};

Game_System.prototype.enableMenu = function() {
    this._menuEnabled = true;
};

Game_System.prototype.isEncounterEnabled = function() {
    return this._encounterEnabled;
};

Game_System.prototype.disableEncounter = function() {
    this._encounterEnabled = false;
};

Game_System.prototype.enableEncounter = function() {
    this._encounterEnabled = true;
};

Game_System.prototype.isFormationEnabled = function() {
    return this._formationEnabled;
};

Game_System.prototype.disableFormation = function() {
    this._formationEnabled = false;
};

Game_System.prototype.enableFormation = function() {
    this._formationEnabled = true;
};

Game_System.prototype.battleCount = function() {
    return this._battleCount;
};

Game_System.prototype.winCount = function() {
    return this._winCount;
};

Game_System.prototype.escapeCount = function() {
    return this._escapeCount;
};

Game_System.prototype.saveCount = function() {
    return this._saveCount;
};

Game_System.prototype.versionId = function() {
    return this._versionId;
};

Game_System.prototype.savefileId = function() {
    return this._savefileId || 0;
};

Game_System.prototype.setSavefileId = function(savefileId) {
    this._savefileId = savefileId;
};

Game_System.prototype.windowTone = function() {
    return this._windowTone || $dataSystem.windowTone;
};

Game_System.prototype.setWindowTone = function(value) {
    this._windowTone = value;
};

Game_System.prototype.battleBgm = function() {
    // Each source is optional: a troop's battle music, then Change Battle BGM,
    // then the map's battle music, then the System track.
    return AudioManager.troopBattleBgm() || this._battleBgm || AudioManager.mapBattleBgm() || $dataSystem.battleBgm;
};

Game_System.prototype.setBattleBgm = function(value) {
    this._battleBgm = value;
};

Game_System.prototype.victoryMe = function() {
    return this._victoryMe || $dataSystem.victoryMe;
};

Game_System.prototype.setVictoryMe = function(value) {
    this._victoryMe = value;
};

Game_System.prototype.defeatMe = function() {
    return this._defeatMe || $dataSystem.defeatMe;
};

Game_System.prototype.setDefeatMe = function(value) {
    this._defeatMe = value;
};

Game_System.prototype.onBattleStart = function() {
    this._battleCount++;
};

Game_System.prototype.onBattleWin = function() {
    this._winCount++;
};

Game_System.prototype.onBattleEscape = function() {
    this._escapeCount++;
};

Game_System.prototype.onBeforeSave = function() {
    this._saveCount++;
    this._versionId = $dataSystem.versionId;
    this._framesOnSave = Graphics.frameCount;
    this._bgmOnSave = AudioManager.saveBgm();
    this._bgsOnSave = AudioManager.saveBgs();
};

Game_System.prototype.onAfterLoad = function() {
    Graphics.frameCount = this._framesOnSave;
    AudioManager.playBgm(this._bgmOnSave);
    AudioManager.playBgs(this._bgsOnSave);
};

Game_System.prototype.playtime = function() {
    return Math.floor(Graphics.frameCount / 60);
};

Game_System.prototype.playtimeText = function() {
    const hour = Math.floor(this.playtime() / 60 / 60);
    const min = Math.floor(this.playtime() / 60) % 60;
    const sec = this.playtime() % 60;
    return hour.padZero(2) + ":" + min.padZero(2) + ":" + sec.padZero(2);
};

Game_System.prototype.saveBgm = function() {
    this._savedBgm = AudioManager.saveBgm();
};

Game_System.prototype.replayBgm = function() {
    if (this._savedBgm) {
        AudioManager.replayBgm(this._savedBgm);
    }
};

Game_System.prototype.saveWalkingBgm = function() {
    this._walkingBgm = AudioManager.saveBgm();
};

Game_System.prototype.replayWalkingBgm = function() {
    if (this._walkingBgm) {
        AudioManager.playBgm(this._walkingBgm);
    }
};

Game_System.prototype.saveWalkingBgm2 = function() {
    this._walkingBgm = AudioManager.mapBgmObject($dataMap, $gameMap.mapId());
};

Game_System.prototype.mainFontFace = function() {
    if (this.legacyFontInfo()) return "rmmz-legacy-font-" + this.legacyFontId() + ", " + $dataSystem.advanced.fallbackFonts;
    return "rmmz-mainfont, " + $dataSystem.advanced.fallbackFonts;
};

Game_System.prototype.numberFontFace = function() {
    if (this.legacyFontInfo()) return this.mainFontFace();
    return "rmmz-numberfont, " + this.mainFontFace();
};

Game_System.prototype.legacyFontId = function() {
    return Number(this._rrFontId ?? this._rrWindowSkin?.font ?? $dataSystem.rrLegacyFontId) === 1 ? 1 : 0;
};

Game_System.prototype.legacyFontInfo = function() {
    const fonts = $dataSystem.rrLegacyFonts;
    return fonts && fonts[this.legacyFontId()] || null;
};

Game_System.prototype.mainFontSize = function() {
    const font = this.legacyFontInfo && this.legacyFontInfo();
    if (font && font.height > 0) return font.height;
    const advanced = $dataSystem.advanced || {};
    return "fontSize" in advanced ? advanced.fontSize : 26;
};

Game_System.prototype.windowPadding = function() {
    const advanced = $dataSystem.advanced || {};
    return "windowPadding" in advanced ? advanced.windowPadding : 12;
};

Game_System.prototype.lineHeight = function() {
    const advanced = $dataSystem.advanced || {};
    return "lineHeight" in advanced ? advanced.lineHeight : 36;
};

Game_System.prototype.windowOpacity = function() {
    // Older MZ data (and MV data given an advanced block) has no entry.
    const advanced = $dataSystem.advanced || {};
    return "windowOpacity" in advanced ? advanced.windowOpacity : 192;
};

/** Saved 2000/2003 Change System Graphics selection; ordinary projects use Window. */
Game_System.prototype.windowSkinName = function() {
    return $dataSystem.rrLegacyWindows && this._rrWindowSkin ? this._rrWindowSkin.name : "Window";
};

Game_System.prototype.windowBackgroundMode = function() {
    return this._rrWindowSkin ? this._rrWindowSkin.stretch : ($dataSystem.rrLegacyWindowStretch || 0);
};

//-----------------------------------------------------------------------------
// Game_Timer
//
// The game object class for the timer.

function Game_Timer() {
    this.initialize(...arguments);
}

Game_Timer.prototype.initialize = function() {
    this._frames = 0;
    this._working = false;
};

Game_Timer.prototype.update = function(sceneActive) {
    if (sceneActive && this._working && this._frames > 0) {
        this._frames--;
        if (this._frames === 0) {
            this.onExpire();
        }
    }
};

Game_Timer.prototype.start = function(count) {
    this._frames = count;
    this._working = true;
};

Game_Timer.prototype.stop = function() {
    this._working = false;
};

Game_Timer.prototype.isWorking = function() {
    return this._working;
};

Game_Timer.prototype.seconds = function() {
    return Math.floor(this._frames / 60);
};

Game_Timer.prototype.frames = function() {
    return this._frames;
};

Game_Timer.prototype.onExpire = function() {
    BattleManager.abort();
};

//-----------------------------------------------------------------------------
// Game_Message
//
// The game object class for the state of the message window that displays text
// or selections, etc.

function Game_Message() {
    this.initialize(...arguments);
}

Game_Message.prototype.initialize = function() {
    this.clear();
};

Game_Message.prototype.clear = function() {
    this._texts = [];
    this._choices = [];
    this._speakerName = "";
    this._faceName = "";
    this._faceIndex = 0;
    this._background = 0;
    this._positionType = 2;
    this._choiceDefaultType = 0;
    this._choiceCancelType = 0;
    this._choiceBackground = 0;
    this._choicePositionType = 2;
    this._numInputVariableId = 0;
    this._numInputMaxDigits = 0;
    this._itemChoiceVariableId = 0;
    this._itemChoiceItypeId = 0;
    this._scrollMode = false;
    this._scrollSpeed = 2;
    this._scrollNoFast = false;
    this._choiceCallback = null;
};

Game_Message.prototype.choices = function() {
    return this._choices;
};

Game_Message.prototype.speakerName = function() {
    return this._speakerName;
};

Game_Message.prototype.faceName = function() {
    return this._faceName;
};

Game_Message.prototype.faceIndex = function() {
    return this._faceIndex;
};

Game_Message.prototype.background = function() {
    return this._background;
};

Game_Message.prototype.positionType = function() {
    return this._positionType;
};

Game_Message.prototype.choiceDefaultType = function() {
    return this._choiceDefaultType;
};

Game_Message.prototype.choiceCancelType = function() {
    return this._choiceCancelType;
};

Game_Message.prototype.choiceBackground = function() {
    return this._choiceBackground;
};

Game_Message.prototype.choicePositionType = function() {
    return this._choicePositionType;
};

Game_Message.prototype.numInputVariableId = function() {
    return this._numInputVariableId;
};

Game_Message.prototype.numInputMaxDigits = function() {
    return this._numInputMaxDigits;
};

Game_Message.prototype.itemChoiceVariableId = function() {
    return this._itemChoiceVariableId;
};

Game_Message.prototype.itemChoiceItypeId = function() {
    return this._itemChoiceItypeId;
};

Game_Message.prototype.scrollMode = function() {
    return this._scrollMode;
};

Game_Message.prototype.scrollSpeed = function() {
    return this._scrollSpeed;
};

Game_Message.prototype.scrollNoFast = function() {
    return this._scrollNoFast;
};

Game_Message.prototype.add = function(text) {
    this._texts.push(text);
};

Game_Message.prototype.setSpeakerName = function(speakerName) {
    this._speakerName = speakerName ? speakerName : "";
};

Game_Message.prototype.setFaceImage = function(faceName, faceIndex) {
    this._faceName = faceName;
    this._faceIndex = faceIndex;
};

Game_Message.prototype.setBackground = function(background) {
    this._background = background;
};

Game_Message.prototype.setPositionType = function(positionType) {
    this._positionType = positionType;
};

Game_Message.prototype.setChoices = function(choices, defaultType, cancelType) {
    this._choices = choices;
    this._choiceDefaultType = defaultType;
    this._choiceCancelType = cancelType;
};

Game_Message.prototype.setChoiceBackground = function(background) {
    this._choiceBackground = background;
};

Game_Message.prototype.setChoicePositionType = function(positionType) {
    this._choicePositionType = positionType;
};

Game_Message.prototype.setNumberInput = function(variableId, maxDigits) {
    this._numInputVariableId = variableId;
    this._numInputMaxDigits = maxDigits;
};

Game_Message.prototype.setItemChoice = function(variableId, itemType) {
    this._itemChoiceVariableId = variableId;
    this._itemChoiceItypeId = itemType;
};

Game_Message.prototype.setScroll = function(speed, noFast) {
    this._scrollMode = true;
    this._scrollSpeed = speed;
    this._scrollNoFast = noFast;
};

Game_Message.prototype.setChoiceCallback = function(callback) {
    this._choiceCallback = callback;
};

Game_Message.prototype.onChoice = function(n) {
    if (this._choiceCallback) {
        this._choiceCallback(n);
        this._choiceCallback = null;
    }
};

Game_Message.prototype.hasText = function() {
    return this._texts.length > 0;
};

Game_Message.prototype.isChoice = function() {
    return this._choices.length > 0;
};

Game_Message.prototype.isNumberInput = function() {
    return this._numInputVariableId > 0;
};

Game_Message.prototype.isItemChoice = function() {
    return this._itemChoiceVariableId > 0;
};

Game_Message.prototype.isBusy = function() {
    return (
        this.hasText() ||
        this.isChoice() ||
        this.isNumberInput() ||
        this.isItemChoice()
    );
};

Game_Message.prototype.newPage = function() {
    if (this._texts.length > 0) {
        this._texts[this._texts.length - 1] += "\f";
    }
};

Game_Message.prototype.allText = function() {
    return this._texts.join("\n");
};

Game_Message.prototype.isRTL = function() {
    return Utils.containsArabic(this.allText());
};

//-----------------------------------------------------------------------------
// Game_Switches
//
// The game object class for switches.

function Game_Switches() {
    this.initialize(...arguments);
}

Game_Switches.prototype.initialize = function() {
    this.clear();
};

Game_Switches.prototype.clear = function() {
    this._data = [];
};

Game_Switches.prototype.value = function(switchId) {
    return !!this._data[switchId];
};

Game_Switches.prototype.setValue = function(switchId, value) {
    if (switchId > 0 && switchId < $dataSystem.switches.length) {
        this._data[switchId] = value;
        this.onChange();
    }
};

Game_Switches.prototype.onChange = function() {
    $gameMap.requestRefresh();
};

//-----------------------------------------------------------------------------
// Game_Variables
//
// The game object class for variables.

function Game_Variables() {
    this.initialize(...arguments);
}

Game_Variables.prototype.initialize = function() {
    this.clear();
};

Game_Variables.prototype.clear = function() {
    this._data = [];
};

Game_Variables.prototype.value = function(variableId) {
    return this._data[variableId] || 0;
};

Game_Variables.prototype.setValue = function(variableId, value) {
    if (variableId > 0 && variableId < $dataSystem.variables.length) {
        if (typeof value === "number") {
            value = Math.floor(value);
        }
        this._data[variableId] = value;
        this.onChange();
    }
};

Game_Variables.prototype.onChange = function() {
    $gameMap.requestRefresh();
};

//-----------------------------------------------------------------------------
// Game_SelfSwitches
//
// The game object class for self switches.

function Game_SelfSwitches() {
    this.initialize(...arguments);
}

Game_SelfSwitches.prototype.initialize = function() {
    this.clear();
};

Game_SelfSwitches.prototype.clear = function() {
    this._data = {};
};

Game_SelfSwitches.prototype.value = function(key) {
    return !!this._data[key];
};

Game_SelfSwitches.prototype.setValue = function(key, value) {
    if (value) {
        this._data[key] = true;
    } else {
        delete this._data[key];
    }
    this.onChange();
};

Game_SelfSwitches.prototype.onChange = function() {
    $gameMap.requestRefresh();
};

//-----------------------------------------------------------------------------
// Game_Screen
//
// The game object class for screen effect data, such as changes in color tone
// and flashes.

function Game_Screen() {
    this.initialize(...arguments);
}

Game_Screen.prototype.initialize = function() {
    this.clear();
};

Game_Screen.prototype.clear = function() {
    this.clearFade();
    this.clearTone();
    this.clearFlash();
    this.clearShake();
    this.clearZoom();
    this.clearWeather();
    this.clearPictures();
};

Game_Screen.prototype.onBattleStart = function() {
    this.clearFade();
    this.clearFlash();
    this.clearShake();
    this.clearZoom();
    this.eraseBattlePictures();
};

Game_Screen.prototype.brightness = function() {
    return this._brightness;
};

Game_Screen.prototype.tone = function() {
    return this._tone;
};

Game_Screen.prototype.flashColor = function() {
    return this._flashColor;
};

Game_Screen.prototype.shake = function() {
    return this._shake;
};

Game_Screen.prototype.zoomX = function() {
    return this._zoomX;
};

Game_Screen.prototype.zoomY = function() {
    return this._zoomY;
};

Game_Screen.prototype.zoomScale = function() {
    return this._zoomScale;
};

Game_Screen.prototype.weatherType = function() {
    return this._weatherType;
};

Game_Screen.prototype.weatherPower = function() {
    return this._weatherPower;
};

Game_Screen.prototype.picture = function(pictureId) {
    const realPictureId = this.realPictureId(pictureId);
    return this._pictures[realPictureId];
};

Game_Screen.prototype.realPictureId = function(pictureId) {
    if ($gameParty.inBattle()) {
        return pictureId + this.maxPictures();
    } else {
        return pictureId;
    }
};

Game_Screen.prototype.clearFade = function() {
    this._brightness = 255;
    this._fadeOutDuration = 0;
    this._fadeInDuration = 0;
};

Game_Screen.prototype.clearTone = function() {
    this._tone = [0, 0, 0, 0];
    this._toneTarget = [0, 0, 0, 0];
    this._toneDuration = 0;
};

Game_Screen.prototype.clearFlash = function() {
    this._flashColor = [0, 0, 0, 0];
    this._flashDuration = 0;
};

Game_Screen.prototype.clearShake = function() {
    this._shakePower = 0;
    this._shakeSpeed = 0;
    this._shakeDuration = 0;
    this._shakeDirection = 1;
    this._shake = 0;
};

Game_Screen.prototype.clearZoom = function() {
    this._zoomX = 0;
    this._zoomY = 0;
    this._zoomScale = 1;
    this._zoomScaleTarget = 1;
    this._zoomDuration = 0;
};

Game_Screen.prototype.clearWeather = function() {
    this._weatherType = "none";
    this._weatherPower = 0;
    this._weatherPowerTarget = 0;
    this._weatherDuration = 0;
};

Game_Screen.prototype.clearPictures = function() {
    this._pictures = [];
};

Game_Screen.prototype.eraseBattlePictures = function() {
    this._pictures = this._pictures.slice(0, this.maxPictures() + 1);
};

Game_Screen.prototype.maxPictures = function() {
    return 100;
};

Game_Screen.prototype.startFadeOut = function(duration) {
    this._fadeOutDuration = duration;
    this._fadeInDuration = 0;
};

Game_Screen.prototype.startFadeIn = function(duration) {
    this._fadeInDuration = duration;
    this._fadeOutDuration = 0;
};

Game_Screen.prototype.startTint = function(tone, duration) {
    this._toneTarget = tone.clone();
    this._toneDuration = duration;
    if (this._toneDuration === 0) {
        this._tone = this._toneTarget.clone();
    }
};

Game_Screen.prototype.startFlash = function(color, duration) {
    this._flashColor = color.clone();
    this._flashDuration = duration;
};

Game_Screen.prototype.startShake = function(power, speed, duration) {
    this._shakePower = power;
    this._shakeSpeed = speed;
    this._shakeDuration = duration;
};

Game_Screen.prototype.startZoom = function(x, y, scale, duration) {
    this._zoomX = x;
    this._zoomY = y;
    this._zoomScaleTarget = scale;
    this._zoomDuration = duration;
};

Game_Screen.prototype.setZoom = function(x, y, scale) {
    this._zoomX = x;
    this._zoomY = y;
    this._zoomScale = scale;
};

Game_Screen.prototype.changeWeather = function(type, power, duration) {
    if (type !== "none" || duration === 0) {
        this._weatherType = type;
    }
    this._weatherPowerTarget = type === "none" ? 0 : power;
    this._weatherDuration = duration;
    if (duration === 0) {
        this._weatherPower = this._weatherPowerTarget;
    }
};

Game_Screen.prototype.update = function() {
    this.updateFadeOut();
    this.updateFadeIn();
    this.updateTone();
    this.updateFlash();
    this.updateShake();
    this.updateZoom();
    this.updateWeather();
    this.updatePictures();
};

Game_Screen.prototype.updateFadeOut = function() {
    if (this._fadeOutDuration > 0) {
        const d = this._fadeOutDuration;
        this._brightness = (this._brightness * (d - 1)) / d;
        this._fadeOutDuration--;
    }
};

Game_Screen.prototype.updateFadeIn = function() {
    if (this._fadeInDuration > 0) {
        const d = this._fadeInDuration;
        this._brightness = (this._brightness * (d - 1) + 255) / d;
        this._fadeInDuration--;
    }
};

Game_Screen.prototype.updateTone = function() {
    if (this._toneDuration > 0) {
        const d = this._toneDuration;
        for (let i = 0; i < 4; i++) {
            this._tone[i] = (this._tone[i] * (d - 1) + this._toneTarget[i]) / d;
        }
        this._toneDuration--;
    }
};

Game_Screen.prototype.updateFlash = function() {
    if (this._flashDuration > 0) {
        const d = this._flashDuration;
        this._flashColor[3] *= (d - 1) / d;
        this._flashDuration--;
    }
};

Game_Screen.prototype.updateShake = function() {
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
};

Game_Screen.prototype.updateZoom = function() {
    if (this._zoomDuration > 0) {
        const d = this._zoomDuration;
        const t = this._zoomScaleTarget;
        this._zoomScale = (this._zoomScale * (d - 1) + t) / d;
        this._zoomDuration--;
    }
};

Game_Screen.prototype.updateWeather = function() {
    if (this._weatherDuration > 0) {
        const d = this._weatherDuration;
        const t = this._weatherPowerTarget;
        this._weatherPower = (this._weatherPower * (d - 1) + t) / d;
        this._weatherDuration--;
        if (this._weatherDuration === 0 && this._weatherPowerTarget === 0) {
            this._weatherType = "none";
        }
    }
};

Game_Screen.prototype.updatePictures = function() {
    for (const picture of this._pictures) {
        if (picture) {
            picture.update();
        }
    }
};

Game_Screen.prototype.startFlashForDamage = function() {
    this.startFlash([255, 0, 0, 128], 8);
};

// prettier-ignore
Game_Screen.prototype.showPicture = function(
    pictureId, name, origin, x, y, scaleX, scaleY, opacity, blendMode
) {
    const realPictureId = this.realPictureId(pictureId);
    const picture = new Game_Picture();
    picture.show(name, origin, x, y, scaleX, scaleY, opacity, blendMode);
    this._pictures[realPictureId] = picture;
};

// prettier-ignore
Game_Screen.prototype.movePicture = function(
    pictureId, origin, x, y, scaleX, scaleY, opacity, blendMode, duration,
    easingType
) {
    const picture = this.picture(pictureId);
    if (picture) {
        // prettier-ignore
        picture.move(origin, x, y, scaleX, scaleY, opacity, blendMode,
                     duration, easingType);
    }
};

Game_Screen.prototype.rotatePicture = function(pictureId, speed) {
    const picture = this.picture(pictureId);
    if (picture) {
        picture.rotate(speed);
    }
};

Game_Screen.prototype.tintPicture = function(pictureId, tone, duration) {
    const picture = this.picture(pictureId);
    if (picture) {
        picture.tint(tone, duration);
    }
};

Game_Screen.prototype.erasePicture = function(pictureId) {
    const realPictureId = this.realPictureId(pictureId);
    this._pictures[realPictureId] = null;
};

//-----------------------------------------------------------------------------
// Game_Picture
//
// The game object class for a picture.

function Game_Picture() {
    this.initialize(...arguments);
}

Game_Picture.prototype.initialize = function() {
    this.initBasic();
    this.initTarget();
    this.initTone();
    this.initRotation();
};

Game_Picture.prototype.name = function() {
    return this._name;
};

Game_Picture.prototype.origin = function() {
    return this._origin;
};

Game_Picture.prototype.x = function() {
    return this._x;
};

Game_Picture.prototype.y = function() {
    return this._y;
};

Game_Picture.prototype.scaleX = function() {
    return this._scaleX;
};

Game_Picture.prototype.scaleY = function() {
    return this._scaleY;
};

Game_Picture.prototype.opacity = function() {
    return this._opacity;
};

Game_Picture.prototype.blendMode = function() {
    return this._blendMode;
};

Game_Picture.prototype.tone = function() {
    return this._tone;
};

Game_Picture.prototype.angle = function() {
    return this._angle;
};

Game_Picture.prototype.initBasic = function() {
    this._name = "";
    this._origin = 0;
    this._x = 0;
    this._y = 0;
    this._scaleX = 100;
    this._scaleY = 100;
    this._opacity = 255;
    this._blendMode = 0;
};

Game_Picture.prototype.initTarget = function() {
    this._targetX = this._x;
    this._targetY = this._y;
    this._targetScaleX = this._scaleX;
    this._targetScaleY = this._scaleY;
    this._targetOpacity = this._opacity;
    this._duration = 0;
    this._wholeDuration = 0;
    this._easingType = 0;
    this._easingExponent = 0;
};

Game_Picture.prototype.initTone = function() {
    this._tone = null;
    this._toneTarget = null;
    this._toneDuration = 0;
};

Game_Picture.prototype.initRotation = function() {
    this._angle = 0;
    this._rotationSpeed = 0;
};

// prettier-ignore
Game_Picture.prototype.show = function(
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
};

// prettier-ignore
Game_Picture.prototype.move = function(
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
};

Game_Picture.prototype.rotate = function(speed) {
    this._rotationSpeed = speed;
};

Game_Picture.prototype.tint = function(tone, duration) {
    if (!this._tone) {
        this._tone = [0, 0, 0, 0];
    }
    this._toneTarget = tone.clone();
    this._toneDuration = duration;
    if (this._toneDuration === 0) {
        this._tone = this._toneTarget.clone();
    }
};

Game_Picture.prototype.update = function() {
    this.updateMove();
    this.updateTone();
    this.updateRotation();
};

Game_Picture.prototype.updateMove = function() {
    if (this._duration > 0) {
        this._x = this.applyEasing(this._x, this._targetX);
        this._y = this.applyEasing(this._y, this._targetY);
        this._scaleX = this.applyEasing(this._scaleX, this._targetScaleX);
        this._scaleY = this.applyEasing(this._scaleY, this._targetScaleY);
        this._opacity = this.applyEasing(this._opacity, this._targetOpacity);
        this._duration--;
    }
};

Game_Picture.prototype.updateTone = function() {
    if (this._toneDuration > 0) {
        const d = this._toneDuration;
        for (let i = 0; i < 4; i++) {
            this._tone[i] = (this._tone[i] * (d - 1) + this._toneTarget[i]) / d;
        }
        this._toneDuration--;
    }
};

Game_Picture.prototype.updateRotation = function() {
    if (this._rotationSpeed !== 0) {
        this._angle += this._rotationSpeed / 2;
    }
};

Game_Picture.prototype.applyEasing = function(current, target) {
    const d = this._duration;
    const wd = this._wholeDuration;
    const lt = this.calcEasing((wd - d) / wd);
    const t = this.calcEasing((wd - d + 1) / wd);
    const start = (current - target * lt) / (1 - lt);
    return start + (target - start) * t;
};

Game_Picture.prototype.calcEasing = function(t) {
    const exponent = this._easingExponent;
    switch (this._easingType) {
        case 1: // Slow start
            return this.easeIn(t, exponent);
        case 2: // Slow end
            return this.easeOut(t, exponent);
        case 3: // Slow start and end
            return this.easeInOut(t, exponent);
        default:
            return t;
    }
};

Game_Picture.prototype.easeIn = function(t, exponent) {
    return Math.pow(t, exponent);
};

Game_Picture.prototype.easeOut = function(t, exponent) {
    return 1 - Math.pow(1 - t, exponent);
};

Game_Picture.prototype.easeInOut = function(t, exponent) {
    if (t < 0.5) {
        return this.easeIn(t * 2, exponent) / 2;
    } else {
        return this.easeOut(t * 2 - 1, exponent) / 2 + 0.5;
    }
};

//-----------------------------------------------------------------------------
// Game_Item
//
// The game object class for handling skills, items, weapons, and armor. It is
// required because save data should not include the database object itself.

function Game_Item() {
    this.initialize(...arguments);
}

Game_Item.prototype.initialize = function(item) {
    this._dataClass = "";
    this._itemId = 0;
    if (item) {
        this.setObject(item);
    }
};

Game_Item.prototype.isSkill = function() {
    return this._dataClass === "skill";
};

Game_Item.prototype.isItem = function() {
    return this._dataClass === "item";
};

Game_Item.prototype.isUsableItem = function() {
    return this.isSkill() || this.isItem();
};

Game_Item.prototype.isWeapon = function() {
    return this._dataClass === "weapon";
};

Game_Item.prototype.isArmor = function() {
    return this._dataClass === "armor";
};

Game_Item.prototype.isEquipItem = function() {
    return this.isWeapon() || this.isArmor();
};

Game_Item.prototype.isNull = function() {
    return this._dataClass === "";
};

Game_Item.prototype.itemId = function() {
    return this._itemId;
};

Game_Item.prototype.object = function() {
    if (this.isSkill()) {
        return $dataSkills[this._itemId];
    } else if (this.isItem()) {
        return $dataItems[this._itemId];
    } else if (this.isWeapon()) {
        return $dataWeapons[this._itemId];
    } else if (this.isArmor()) {
        return $dataArmors[this._itemId];
    } else {
        return null;
    }
};

Game_Item.prototype.setObject = function(item) {
    if (DataManager.isSkill(item)) {
        this._dataClass = "skill";
    } else if (DataManager.isItem(item)) {
        this._dataClass = "item";
    } else if (DataManager.isWeapon(item)) {
        this._dataClass = "weapon";
    } else if (DataManager.isArmor(item)) {
        this._dataClass = "armor";
    } else {
        this._dataClass = "";
    }
    this._itemId = item ? item.id : 0;
};

Game_Item.prototype.setEquip = function(isWeapon, itemId) {
    this._dataClass = isWeapon ? "weapon" : "armor";
    this._itemId = itemId;
};
