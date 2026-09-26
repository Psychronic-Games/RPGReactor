/*:
 * @target MZ
 * @plugindesc Neon Black Lockpicking (VX Ace), for imported games
 * @author Neon Black, Roninator2; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_NeonLockpick.js
 *
 * A lockpicking screen over the blurred map: a lock picture, a key turned by
 * holding OK and a pick moved around the keyhole with left/right (or the
 * rgssX/rgssZ buttons, A and D). One spot, chosen at random, lets the key
 * turn all the way; the further the pick is from it, the less the key turns
 * (times the difficulty). Holding OK against the stop wears the pick; a worn
 * pick snaps and costs a lockpick item, and every snap wears the lock, which
 * breaks after enough of them. A window in the bottom left counts the picks.
 *   this.rrLockpickStart(difficulty, lockVariable)
 * The event waits for the screen, then reads the result variable:
 *   1 picked, 2 cancelled, 3 out of picks (or none), 4 the lock broke
 * (a broken lock also shows the script's message).
 *
 * As the script does it: with no lock variable the lock still wears (from
 * the lock durability) for that attempt; a pick's own durability resets with
 * each new pick; the count variable drops by one per pick lost. Statements
 * after Lockpick.start in the same Script command run before the screen opens.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param pickItem
 * @type item
 * @default 19
 *
 * @param goldPickItem
 * @type item
 * @default 0
 * @desc A pick that never snaps, used when useGoldPick is on.
 *
 * @param useGoldPick
 * @type boolean
 * @default false
 *
 * @param variable
 * @text Result variable
 * @type variable
 * @default 100
 *
 * @param sounds
 * @type multiline_string
 * @default {"lock":{"name":"GUI_click_01","volume":100,"pitch":100},"unlock":{"name":"Open1","volume":100,"pitch":100},"break":{"name":"GUI_click_06","volume":100,"pitch":200}}
 * @desc JSON: lock (starting to turn), unlock, break (a pick snaps).
 *
 * @param breakPickSwitch
 * @type switch
 * @default 55
 * @desc Picks wear with this switch on (only when a lock has no durability); set to breakPicks at a new game.
 *
 * @param breakPicks
 * @type boolean
 * @default true
 *
 * @param lockDurability
 * @type number
 * @default 200
 *
 * @param pickDurability
 * @type number
 * @default 100
 *
 * @param brokenText
 * @type multiline_string
 * @default
 *
 * @param showRemaining
 * @type boolean
 * @default true
 *
 * @param itemName
 * @default Lockpicks:
 *
 * @param graphics
 * @type multiline_string
 * @default {"lock":{"name":"Lock","x":0,"y":0},"pick":{"name":"Pick","x":0,"y":30},"key":{"name":"Key","x":0,"y":-20}}
 * @desc JSON: pictures and offsets from the middle of the screen.
 *
 * @param countVariable
 * @type variable
 * @default 0
 * @desc Lowered by one for each pick lost (0: none).
 *
 * @param vibrate
 * @type boolean
 * @default false
 * @desc Rumble the gamepad while the key strains (through RR_GamepadExtender).
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_NeonLockpick');
    const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
    const json = (v, d) => { try { return JSON.parse(v) || d; } catch (_) { return d; } };
    const PICK_ITEM = num(params.pickItem, 19);
    const G_PICK_ITEM = num(params.goldPickItem, 0);
    const USE_G_PICK = String(params.useGoldPick) === 'true';
    const VARIABLE = num(params.variable, 100);
    const SOUNDS = json(params.sounds, {});
    const BREAK_SWITCH = num(params.breakPickSwitch, 0);
    const BREAK_PICKS = String(params.breakPicks) !== 'false';
    const LOCK_DURABILITY = num(params.lockDurability, 200);
    const PICK_DURABILITY = num(params.pickDurability, 100);
    const BROKEN = String(params.brokenText || '');
    const SHOW_REMAINING = String(params.showRemaining) !== 'false';
    const ITEM_NAME = String(params.itemName ?? 'Lockpicks:');
    const GRAPHICS = json(params.graphics, { lock: { name: 'Lock', x: 0, y: 0 }, pick: { name: 'Pick', x: 0, y: 30 }, key: { name: 'Key', x: 0, y: -20 } });
    const COUNT_VARIABLE = num(params.countVariable, 0);
    const VIBRATE = String(params.vibrate) === 'true';

    const hasItem = (id) => id > 0 && !!$dataItems[id] && $gameParty.hasItem($dataItems[id]);
    const playSe = (se) => { if (se && se.name) AudioManager.playSe({ name: String(se.name), volume: num(se.volume, 100), pitch: num(se.pitch, 100), pan: 0 }); };
    // The original's mouse script answered Input.trigger? for OK and cancel with the left and right buttons.
    const mouse = (button) => !!(window.rrMouse && window.rrMouse.trigger(button));
    // Sprite angles as RGSS has them: degrees, counterclockwise.
    const setAngle = (sprite, degrees) => { sprite.rotation = -degrees * Math.PI / 180; };
    const place = (sprite, g, originOf) => {
        sprite.x = Math.floor(Graphics.width / 2) + num(g.x, 0);
        sprite.y = Math.floor(Graphics.height / 2) + num(g.y, 0);
        sprite.bitmap.addLoadListener((b) => {
            const [ox, oy] = originOf(b);
            sprite.anchor.x = b.width ? ox / b.width : 0;
            sprite.anchor.y = b.height ? oy / b.height : 0;
        });
    };

    // The script's results, and its broken-lock message.
    function finish(result, doorVar, door) {
        if (doorVar != null) $gameVariables.setValue(doorVar, door);
        $gameVariables.setValue(VARIABLE, result);
        if (result === 4 && door === -1) $gameMessage.add(BROKEN);
    }
    function startingDoor(doorVar) {
        const door = doorVar != null ? $gameVariables.value(doorVar) : null;
        return door == null ? LOCK_DURABILITY : door;
    }

    // A lock already broken (-1 in its variable) reports 4 without opening the screen.
    Game_Interpreter.prototype.rrLockpickStart = function(difficulty, doorVar = null) {
        if (startingDoor(doorVar) === -1) {
            finish(4, doorVar, -1);
            this.wait(1);
            return;
        }
        SceneManager.push(Scene_RRLockpick);
        SceneManager.prepareNextScene(Number(difficulty), doorVar);
    };

    const _createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function() {
        _createGameObjects.call(this);
        if (BREAK_SWITCH > 0) $gameSwitches.setValue(BREAK_SWITCH, BREAK_PICKS);
    };

    function Window_RRPicks() { this.initialize(...arguments); }
    Window_RRPicks.prototype = Object.create(Window_Base.prototype);
    Window_RRPicks.prototype.constructor = Window_RRPicks;
    Window_RRPicks.prototype.initialize = function() {
        const height = Window_Base.prototype.fittingHeight.call(Window_Base.prototype, 1);
        Window_Base.prototype.initialize.call(this, new Rectangle(0, Graphics.boxHeight - height, 160, height));
        this.refresh();
    };
    Window_RRPicks.prototype.refresh = function() {
        this.contents.clear();
        const x = 4, width = this.innerWidth - 8;
        const cx = this.textWidth(ITEM_NAME);
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(String($gameParty.numItems($dataItems[PICK_ITEM])), x + cx + 2, 0, width - cx - 2);
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(ITEM_NAME, x, 0, width);
    };

    function Scene_RRLockpick() { this.initialize(...arguments); }
    Scene_RRLockpick.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRLockpick.prototype.constructor = Scene_RRLockpick;
    window.Scene_RRLockpick = Scene_RRLockpick;

    Scene_RRLockpick.prototype.prepare = function(difficulty, doorVar = null) {
        this._diffi = difficulty;
        this._doorVar = doorVar;
        this._door = startingDoor(doorVar);
        this._keyRotation = 0;
        this._pickRotation = 90;
        this._zone = Math.randomInt(90) * 2;
        this._wobble = 0;
        this._durability = PICK_DURABILITY;
        this._didTurn = false;
        // true with picks; null without (the script left it unset); false for a broken lock.
        this._haspicks = hasItem(PICK_ITEM) || (hasItem(G_PICK_ITEM) && USE_G_PICK) ? true : null;
        if (this._door === -1) this._haspicks = false;
    };
    Scene_RRLockpick.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        if (this._diffi === undefined) this.prepare(1);
        this._field = new Sprite();
        this.addChildAt(this._field, this.children.indexOf(this._windowLayer));
        if (SHOW_REMAINING) {
            this._picksWindow = new Window_RRPicks();
            this.addWindow(this._picksWindow);
        }
        this._lockSprite = this.picture(GRAPHICS.lock, (b) => [Math.floor(b.width / 2), Math.floor(b.height / 2)]);
        this._keySprite = this.picture(GRAPHICS.key, (b) => [Math.floor(b.width / 2), Math.floor(b.height / 2)]);
        this._kRotate = this._keyRotation;
        setAngle(this._keySprite, -this._kRotate);
        if (this._haspicks) this.createPick();
        this.keyMath();
    };
    Scene_RRLockpick.prototype.picture = function(g, originOf) {
        const sprite = new Sprite(ImageManager.loadPicture(String(g.name)));
        place(sprite, g, originOf);
        this._field.addChild(sprite);
        return sprite;
    };
    // The pick turns about a point half its width down from its top (the script's oy = width / 2).
    Scene_RRLockpick.prototype.createPick = function() {
        const sprite = new Sprite(ImageManager.loadPicture(String(GRAPHICS.pick.name)));
        place(sprite, GRAPHICS.pick, (b) => [Math.floor(b.width / 2), Math.floor(b.width / 2)]);
        this._field.addChildAt(sprite, 1);   // between the lock and the key
        this._pickSprite = sprite;
        this._pRotate = this._pickRotation;
        setAngle(sprite, this._pRotate - 90);
    };

    // A step that waited in the original (its update_basic loops) is a generator here: each yield is one frame.
    Scene_RRLockpick.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        if (this._ended) return;
        if (!this._routine) this._routine = this.updatePickCommand();
        if (!this._routine.next().done) return;
        this._routine = null;
        if (this._ended) return;
        this.updateKeyPosition();
        if (this._haspicks) this.updatePickPosition();
    };
    Scene_RRLockpick.prototype.updateKeyPosition = function() {
        if (this._keyRotation === this._kRotate) return;
        this._kRotate = this._keyRotation;
        setAngle(this._keySprite, -this._kRotate);
    };
    Scene_RRLockpick.prototype.updatePickPosition = function() {
        if (this._pickRotation === this._pRotate && this._wobble === this._shake) return;
        this._pRotate = this._pickRotation;
        this._shake = this._wobble;
        setAngle(this._pickSprite, this._pRotate - 90 + this._shake);
    };
    Scene_RRLockpick.prototype.wait = function* (frames) {
        for (let i = 0; i < frames; i++) yield;
    };

    Scene_RRLockpick.prototype.updatePickCommand = function* () {
        if (Input.isTriggered('cancel') || mouse(1)) {
            this.lockStopped();
        } else if (Input.isTriggered('ok') || mouse(0)) {
            this._didTurn = true;
            if (this._haspicks === true && this._door === -1) this.lockBroke();
            else if (this._haspicks === true) playSe(SOUNDS.lock);
            else this.noPicks();
        } else if (Input.isPressed('ok') && this._didTurn) {
            if (!(this._keyRotation > this._maxTurn - 2)) this._keyRotation += 2;
            else yield* this.pickDura();
            if (this._keyRotation === 90) {
                playSe(SOUNDS.unlock);
                yield* this.lockPicked();
            }
        } else {
            this._wobble = 0;
            if (this._keyRotation !== 0) this._keyRotation -= 2;
            if (this._keyRotation < 0) this._keyRotation = 0;
            if (Input.isPressed('right') || Input.isPressed('rgssZ')) {
                if (this._pickRotation !== 180) this._pickRotation += 2;
                this.keyMath();
            } else if (Input.isPressed('left') || Input.isPressed('rgssX')) {
                if (this._pickRotation !== 0) this._pickRotation -= 2;
                this.keyMath();
            }
        }
    };
    Scene_RRLockpick.prototype.keyMath = function() {
        if (this._pickRotation >= this._zone - 4 && this._pickRotation <= this._zone + 4) {
            this._maxTurn = 90;
        } else {
            const off = (Math.abs(this._pickRotation - this._zone) - 4) * this._diffi;
            this._maxTurn = Math.max(90 - off, 0);
        }
    };
    // Each frame the key strains at its stop wears the pick.
    Scene_RRLockpick.prototype.pickDura = function* () {
        this._wobble = Math.randomInt(5) - 2;
        if (VIBRATE && window.rrGamepadVibrate) window.rrGamepadVibrate(0.5, 0.5, 10, 0);
        if (this._door != null) {
            this._durability -= this._diffi;
            if (this._durability < 1 && this._durability > -100) yield* this.snapPick();
        } else if ($gameSwitches.value(BREAK_SWITCH)) {
            if (!(hasItem(G_PICK_ITEM) && USE_G_PICK)) {
                this._durability -= this._diffi;
                if (this._durability < 1) yield* this.snapPick();
            }
        }
    };
    // The pick drops 15 px over 5 frames, holds 10, then the lock wears by three times the difficulty.
    Scene_RRLockpick.prototype.snapPick = function* () {
        playSe(SOUNDS.break);
        for (let i = 0; i < 5; i++) {
            this._pickSprite.y += 3;
            yield;
        }
        yield* this.wait(10);
        if (this._door != null && (this._haspicks === true || this._haspicks === false)) {
            this._door -= this._diffi * 3;
            if (this._door < 1) this._door = -1;
            if (this._door === -1 && this._doorVar != null) $gameVariables.setValue(this._doorVar, -1);
            if (this._haspicks === false) {
                if (!((hasItem(PICK_ITEM) || hasItem(G_PICK_ITEM)) && USE_G_PICK)) this.noPicks();
            } else if (this._door === -1) {
                this.lockBroke();
            } else {
                yield* this.changePick();
            }
        } else {
            yield* this.changePick();
        }
    };
    Scene_RRLockpick.prototype.changePick = function* () {
        $gameParty.loseItem($dataItems[PICK_ITEM], 1);
        if (COUNT_VARIABLE > 0) $gameVariables.setValue(COUNT_VARIABLE, $gameVariables.value(COUNT_VARIABLE) - 1);
        if (this._picksWindow) this._picksWindow.refresh();
        if (hasItem(PICK_ITEM) && this._door !== -1) yield* this.newPick();
        else if (!hasItem(PICK_ITEM)) this.noPicks();
    };
    Scene_RRLockpick.prototype.newPick = function* () {
        this._keyRotation = 0;
        this._pickRotation = 90;
        this._wobble = 0;
        this._durability = PICK_DURABILITY;
        this._field.removeChild(this._pickSprite);
        this._pickSprite.destroy();
        this.createPick();
        this.updateKeyPosition();
        yield* this.wait(10);
    };

    Scene_RRLockpick.prototype.lockPicked = function* () {
        finish(1, this._doorVar, this._door);
        this.updateKeyPosition();
        yield* this.wait(20);
        this.pickingEnd();
    };
    Scene_RRLockpick.prototype.lockStopped = function() {
        SoundManager.playCancel();
        finish(2, this._doorVar, this._door);
        this.pickingEnd();
    };
    Scene_RRLockpick.prototype.noPicks = function() {
        finish(3, this._doorVar, this._door);
        this.pickingEnd();
    };
    Scene_RRLockpick.prototype.lockBroke = function() {
        finish(4, this._doorVar, this._door);
        this.pickingEnd();
    };
    Scene_RRLockpick.prototype.pickingEnd = function() {
        if (this._ended) return;
        this._ended = true;
        this.popScene();
    };
})();
