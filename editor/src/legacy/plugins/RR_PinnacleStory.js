/*:
 * @target MZ
 * @plugindesc Pinnacle's messages, choices and story values (VX Ace), for imported games
 * @author Pinnacle's developer; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_PinnacleStory.js
 *
 * The message system as Pinnacle - The Five Kingdoms changed it:
 *   - the message window slides up 120 pixels into place as it opens and
 *     back down before it closes; its lines are 20 pixels apart (a line with
 *     bigger text is as tall as that text);
 *   - with the Options' fast text on, a page appears at once; holding Ctrl
 *     goes on from a finished page;
 *   - choices sit at the right, above the message when it reaches the bottom
 *     of the screen and below it otherwise, never taller than the screen less
 *     a row per message row; a choice of more than 60 characters takes two
 *     rows (three past 120 …), and more than 12 choices make two columns.
 * The game's text codes (\R[n]<a|b|c>, \S{…}, \G) are RR_PinnacleWindows'.
 *
 * The story values the events keep on actors: affection (0 at the start,
 * kept within the maximum, 100, whenever the actor refreshes), flags (a
 * list of words), homeland and gender (from the first line of the actor's
 * note: "male" 1, "female" 2, anything else 3; a note whose first line ends
 * in a stray carriage return reads as 3, as it did in the game). Setting an
 * actor up again clears its flags and gender.
 *
 * Messages the game keeps in its language file (Use Item, Next Level) read
 * Ruby's %s; they are shown as %1, %2.
 *
 * Other edits, kept as the game had them: Set Event Location's exchange
 * moves the event onto the other one without moving that one; Shake Screen
 * always waits its speed in frames, whatever its Wait box says; pictures
 * moved "with acceleration" approach their x in a curve and keep moving that
 * way afterwards, even when shown again.
 *
 * Script calls (the import writes the game's Ruby as these):
 *   window.RRPinnacleStory.resetMessageSettings()   Variable.reset_message_settings
 *   this.rrCheckFlag(actorId, flag)                  check_flag
 *   this.rrInRoom()                                  in_room? (map note "room")
 *   actor.rrAffection() / rrSetAffection(n)          affection
 *   actor.rrMaxAffection() / rrSetMaxAffection(n)    maxaffection
 *   actor.rrFlags() / rrSetFlags(list)               flags
 *   actor.rrHomeland() / rrSetHomeland(text)         homeland
 *   actor.rrGender() / rrSetGender(n)                gender, set_gender
 *   $gameTemp.rrLastChoice()                         $game_temp.last_choice
 *   character.rrProminentTile() / rrCanReach([x, y]) / rrDirDistance([x, y])
 *     / rrEventClear(x, y, d) / rrTileInFront() …    the wolf-and-rabbit hunt
 *   $gameScreen.rrMovePictureWithAccel(id, origin, x, y, zoomX, zoomY,
 *     opacity, blend, duration)                     move_with_accel
 *
 * Installed by File › Import Project… when the imported game carried the
 * original scripts; their settings were read from the game's copies.
 *
 * @param resetVariables
 * @text Variables reset_message_settings sets
 * @desc JSON list of [variable, value].
 * @default [[21,5],[22,0]]
 *
 * @param slide
 * @text Message slide distance
 * @type number
 * @default 120
 *
 * @param slideStep
 * @text Message slide per frame
 * @type number
 * @default 6
 *
 * @param lineHeight
 * @text Message line height
 * @type number
 * @default 20
 *
 * @param fastTextSetting
 * @text Fast-text option name
 * @default fasttext
 *
 * @param choiceRowsVariable
 * @text Choice height limit variable
 * @type variable
 * @default 21
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_PinnacleStory');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const json = (v, d) => { try { return JSON.parse(v); } catch (_) { return d; } };
    const RESET = json(params.resetVariables, [[21, 5], [22, 0]]);
    const SLIDE = num(params.slide, 120);
    const STEP = num(params.slideStep, 6) || 6;
    const LINE_HEIGHT = num(params.lineHeight, 20);
    const FAST_SETTING = params.fastTextSetting === undefined ? 'fasttext' : String(params.fastTextSetting);
    const CHOICE_ROWS_VARIABLE = num(params.choiceRowsVariable, 21);

    const variable = (id) => (id > 0 && typeof $gameVariables !== 'undefined' && $gameVariables ? Number($gameVariables.value(id)) || 0 : 0);
    const resolve = (text) => (typeof window !== 'undefined' && window.RRKeyedText ? window.RRKeyedText.resolve(text) : text);
    // The game's own settings ($game_settings, RR_H87Options' $gameSettings).
    const setting = (name) => {
        const settings = typeof window !== 'undefined' ? window.$gameSettings : null;
        return settings ? settings[name] : undefined;
    };

    const api = {
        resetMessageSettings() { for (const [id, value] of RESET) $gameVariables.setValue(id, value); },
        messageRows() { return typeof RRYanflyMessage !== 'undefined' ? RRYanflyMessage.rows() : 5; },
        messageWidth() { return typeof RRYanflyMessage !== 'undefined' ? RRYanflyMessage.width() : Graphics.boxWidth; },
        setting
    };
    if (typeof window !== 'undefined') window.RRPinnacleStory = api;

    //--------------------------------------------------------------------------
    // Story values on battlers (actors use them; enemies carry them as the game's Game_Battler did)

    const _initMembers = Game_Battler.prototype.initMembers;
    Game_Battler.prototype.initMembers = function() {
        _initMembers.call(this);
        this._affection = 0;
        this._maxaffection = 100;
        this._flags = [];
        this._homeland = '';
    };
    Game_Battler.prototype.rrAffection = function() { return this._affection ?? 0; };
    Game_Battler.prototype.rrSetAffection = function(value) { this._affection = value; };
    Game_Battler.prototype.rrMaxAffection = function() { return this._maxaffection ?? 100; };
    Game_Battler.prototype.rrSetMaxAffection = function(value) { this._maxaffection = value; };
    Game_Battler.prototype.rrFlags = function() {
        if (!Array.isArray(this._flags)) this._flags = [];
        return this._flags;
    };
    Game_Battler.prototype.rrSetFlags = function(list) { this._flags = list; };
    Game_Battler.prototype.rrHomeland = function() { return this._homeland ?? ''; };
    Game_Battler.prototype.rrSetHomeland = function(text) { this._homeland = text; };

    // The first line of the note decides: the game split on "\n" alone and returned after the first line.
    const defaultGender = (actorId) => {
        const actor = typeof $dataActors !== 'undefined' && $dataActors ? $dataActors[actorId] : null;
        const first = String((actor && actor.note) || '').split('\n')[0];
        return first === 'male' ? 1 : first === 'female' ? 2 : 3;
    };
    const _setup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) {
        _setup.call(this, actorId);
        this._gender = defaultGender(actorId);
        this._flags = [];
    };
    Game_Actor.prototype.rrGender = function() {
        if (this._gender === undefined) this._gender = defaultGender(this.actorId());
        return this._gender;
    };
    Game_Actor.prototype.rrSetGender = function(value) { this._gender = value; };
    const _refresh = Game_Actor.prototype.refresh;
    Game_Actor.prototype.refresh = function() {
        if (this._maxaffection == null) this._maxaffection = 100;
        this._affection = Math.min(this.rrAffection(), this._maxaffection);
        _refresh.call(this);
    };

    Game_Temp.prototype.rrLastChoice = function() { return this._rrLastChoice ?? null; };
    Game_Temp.prototype.rrSetLastChoice = function(value) { this._rrLastChoice = value; };

    //--------------------------------------------------------------------------
    // Vocab: the game keeps some messages in its language file, where they still read Ruby's "%s used %s!"

    if (typeof TextManager !== 'undefined' && TextManager.message) {
        const _message = TextManager.message;
        TextManager.message = function(messageId) {
            const text = _message.call(this, messageId);
            if (typeof text !== 'string' || !text.includes('%s')) return text;
            let n = 0;
            return text.replace(/%s/g, () => '%' + (++n));
        };
    }

    //--------------------------------------------------------------------------
    // Interpreter

    Game_Interpreter.prototype.rrCheckFlag = function(actorId, flag) {
        const actor = $gameActors.actor(actorId);
        return !!actor && actor.rrFlags().includes(flag);
    };
    Game_Interpreter.prototype.rrInRoom = function() {
        return typeof $dataMap !== 'undefined' && !!$dataMap && $dataMap.note === 'room';
    };

    // Set Event Location, exchange: the event moves onto the other's place; the other stays.
    const _command203 = Game_Interpreter.prototype.command203;
    Game_Interpreter.prototype.command203 = function(params) {
        if (params[1] === 0 || params[1] === 1) return _command203.call(this, params);
        const character = this.character(params[0]);
        if (character) {
            const other = this.character(params[2]);
            if (other) character.locate(other.x, other.y);
            if (params[4] > 0) character.setDirection(params[4]);
        }
        return true;
    };
    // Shake Screen waits its speed (params[1]) whenever a duration is given, and Ruby counts 0 as given.
    Game_Interpreter.prototype.command225 = function(params) {
        $gameScreen.startShake(params[0], params[1], params[2]);
        this.wait(params[1]);
        return true;
    };

    //--------------------------------------------------------------------------
    // Characters: the tiles around one, and the hunt's helpers

    const CLOCKWISE = [null, 4, 8, 2, 6], COUNTERCLOCKWISE = [null, 6, 2, 8, 4];
    Game_CharacterBase.prototype.rrClockwiseDir = function(d) { return CLOCKWISE[Math.floor(d / 2)]; };
    Game_CharacterBase.prototype.rrCounterclockwiseDir = function(d) { return COUNTERCLOCKWISE[Math.floor(d / 2)]; };
    Game_CharacterBase.prototype.rrTileToward = function(d) { return [$gameMap.xWithDirection(this.x, d), $gameMap.yWithDirection(this.y, d)]; };
    Game_CharacterBase.prototype.rrTileInFront = function() { return this.rrTileToward(this.direction()); };
    Game_CharacterBase.prototype.rrTileInBack = function() { return this.rrTileToward(this.reverseDir(this.direction())); };
    Game_CharacterBase.prototype.rrTileToRight = function() { return this.rrTileToward(this.rrClockwiseDir(this.direction())); };
    Game_CharacterBase.prototype.rrTileToLeft = function() { return this.rrTileToward(this.rrCounterclockwiseDir(this.direction())); };
    // The tile a cornered character makes for: the nearest of the arena's key tiles if free, else the way ahead,
    // left, right, back (the first passable); null when boxed in.
    Game_CharacterBase.prototype.rrProminentTile = function() {
        const x = this.x, y = this.y, d = this.direction();
        let important = null;
        if (x < 8) important = [6, 6];
        if (y < 6) important = [8, 4];
        if (y > 8) important = [8, 8];
        if (x > 10) important = [10, 6];
        if (x > 8 && y > 6) important = [10, 8];
        if (x < 8 && y < 6) important = [6, 4];
        if (x < 8 && y > 6) important = [6, 8];
        if (x > 8 && y < 6) important = [10, 4];
        const tiles = [];
        if (important && !this.isCollidedWithCharacters(important[0], important[1])) tiles.push(important);
        if (this.canPass(x, y, d)) tiles.push(this.rrTileInFront());
        if (this.canPass(x, y, this.rrCounterclockwiseDir(d))) tiles.push(this.rrTileToLeft());
        if (this.canPass(x, y, this.rrClockwiseDir(d))) tiles.push(this.rrTileToRight());
        if (this.canPass(x, y, this.reverseDir(d))) tiles.push(this.rrTileInBack());
        return tiles[0] || null;
    };
    // Whether walking straight on reaches the tile without being blocked.
    Game_CharacterBase.prototype.rrCanReach = function(destination) {
        const same = (a, b) => Array.isArray(a) && a[0] === b[0] && a[1] === b[1];
        if (same(destination, [this.x, this.y])) return false;
        const at = [this.x, this.y], d = this._direction;
        for (let guard = 0; !same(destination, at) && guard < 1000; guard++) {
            if (d === 2) at[1] += 1;
            if (d === 8) at[1] -= 1;
            if (d === 6) at[0] += 1;
            if (d === 4) at[0] -= 1;
            if (!this.canPass(at[0], at[1], d)) return false;
        }
        return true;
    };
    Game_CharacterBase.prototype.rrDirDistance = function(destination) {
        const d = this._direction;
        return d === 4 || d === 6 ? Math.abs(this.x - destination[0]) : Math.abs(this.y - destination[1]);
    };
    Game_CharacterBase.prototype.rrEventClear = function(x, y, d) {
        return !this.isCollidedWithCharacters($gameMap.roundXWithDirection(x, d), $gameMap.roundYWithDirection(y, d));
    };

    //--------------------------------------------------------------------------
    // Pictures: move_with_accel

    Game_Picture.prototype.rrMoveWithAccel = function(origin, x, y, scaleX, scaleY, opacity, blendMode, duration) {
        this.move(origin, x, y, scaleX, scaleY, opacity, blendMode, duration, 0);
        this._rrAccel = true;
        // The game kept its picture objects, so a picture once accelerated stays so when shown again.
        const screen = typeof $gameScreen !== 'undefined' ? $gameScreen : null;
        const index = screen && Array.isArray(screen._pictures) ? screen._pictures.indexOf(this) : -1;
        if (index >= 0) (screen._rrAccelPictures = screen._rrAccelPictures || {})[index] = true;
    };
    Game_Screen.prototype.rrMovePictureWithAccel = function(pictureId, ...args) {
        const picture = this.picture(pictureId);
        if (picture) picture.rrMoveWithAccel(...args);
        (this._rrAccelPictures = this._rrAccelPictures || {})[this.realPictureId(pictureId)] = true;
    };
    const _showPicture = Game_Screen.prototype.showPicture;
    Game_Screen.prototype.showPicture = function(pictureId, ...args) {
        _showPicture.call(this, pictureId, ...args);
        const picture = this.picture(pictureId);
        if (picture && this._rrAccelPictures && this._rrAccelPictures[this.realPictureId(pictureId)]) picture._rrAccel = true;
    };
    const _updateMove = Game_Picture.prototype.updateMove;
    Game_Picture.prototype.updateMove = function() {
        if (!this._rrAccel || !(this._duration > 0)) return _updateMove.call(this);
        const d = this._duration;
        this._x = (this._x * (d - 1) + this._targetX) / Math.pow(d, 1.08);
        this._y = (this._y * (d - 1) + this._targetY) / d;
        this._scaleX = (this._scaleX * (d - 1) + this._targetScaleX) / d;
        this._scaleY = (this._scaleY * (d - 1) + this._targetScaleY) / d;
        this._opacity = (this._opacity * (d - 1) + this._targetOpacity) / d;
        this._duration--;
    };

    //--------------------------------------------------------------------------
    // The message window

    Window_Message.prototype.lineHeight = function() {
        return LINE_HEIGHT > 0 ? LINE_HEIGHT : Window_Base.prototype.lineHeight.call(this);
    };
    // A line is as tall as the line height or its largest text, whichever is more (sizes in the game's units).
    Window_Message.prototype.calcTextHeight = function(textState) {
        const advanced = ($dataSystem && $dataSystem.advanced) || {};
        const scale = typeof advanced.fontSizeStep === 'number' && advanced.fontSizeStep > 0 ? advanced.fontSizeStep / 8 : 1;
        const last = this.contents.fontSize;
        const line = textState.text.slice(textState.index).split('\n')[0];
        const largest = this.maxFontSizeInLine(line);
        this.contents.fontSize = last;
        return Math.max(this.lineHeight(), Math.round(largest / scale));
    };

    const _updatePlacement = Window_Message.prototype.updatePlacement;
    Window_Message.prototype.updatePlacement = function() {
        _updatePlacement.call(this);
        this.y += this._rrOffset || 0;
    };
    Window_Message.prototype.rrPlaceAtOffset = function() {
        this.y = (this._positionType * (Graphics.boxHeight - this.height)) / 2 + (this._rrOffset || 0);
    };

    // A message session: slide in (the text waits), the messages, one frame for a message that continues the
    // window, slide out, close; the next message starts a new session.
    const _update = Window_Message.prototype.update;
    Window_Message.prototype.update = function() {
        if (SLIDE > 0 && this.rrUpdateSession()) {
            Window_Base.prototype.update.call(this);
            this.synchronizeNameBox();
            return;
        }
        _update.call(this);
    };
    Window_Message.prototype.rrUpdateSession = function() {
        switch (this._rrPhase) {
            case 'in':
                this._rrOffset = Math.max(0, this._rrOffset - STEP);
                this.rrPlaceAtOffset();
                if (this._rrOffset <= 0) this._rrPhase = 'run';
                return true;
            case 'run':
                return false;
            case 'end':
                if (this.doesContinue()) { this._rrPhase = 'run'; return false; }
                this._rrPhase = 'out';
                return this.rrUpdateSession();
            case 'out':
                if (this._rrOffset >= SLIDE) {
                    this._rrPhase = 'closing';
                    this.close();
                    this._nameBoxWindow.close();
                    return true;
                }
                this._rrOffset = Math.min(SLIDE, this._rrOffset + STEP);
                this.rrPlaceAtOffset();
                return true;
            case 'closing':
                if (!this.isClosed()) return true;
                this._rrPhase = null;
                this._rrOffset = 0;
                return true;
            default: {
                if (this.openness > 0 || this.isOpening() || this.isClosing()) return false;
                if (!$gameMessage.isBusy() || $gameMessage.scrollMode()) return false;
                // fiber_main's start: the window's size, centred, below its place by the slide.
                this._rrPhase = 'in';
                this._rrOffset = SLIDE;
                const width = this.rrMessageWidth ? this.rrMessageWidth() : this.width;
                const height = this.fittingHeight(api.messageRows());
                if (width !== this.width || height !== this.height) {
                    this.move(this.x, this.y, width, height);
                    this.createContents();
                }
                this.x = (Graphics.boxWidth - this.width) / 2;
                this.updatePlacement();
                this.contents.clear();
                this.updateBackground();
                if ($gameMessage.hasText()) this.open();
                return this.rrUpdateSession();
            }
        }
    };
    const _terminateMessage = Window_Message.prototype.terminateMessage;
    Window_Message.prototype.terminateMessage = function() {
        if (SLIDE <= 0 || this._rrPhase !== 'run') return _terminateMessage.call(this);
        this._goldWindow.close();
        $gameMessage.clear();
        this._rrPhase = 'end';
        this._rrNameClose = 4;
    };
    // The name window closes four frames after its message, on its own.
    const _synchronizeNameBox = Window_Message.prototype.synchronizeNameBox;
    Window_Message.prototype.synchronizeNameBox = function() {
        if (!(this._rrNameClose >= 0)) return _synchronizeNameBox.call(this);
        if (this._rrNameClose > 0 && --this._rrNameClose === 0) this._nameBoxWindow.close();
    };
    const _startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function() {
        this._rrNameClose = -1;
        _startMessage.call(this);
    };

    // Fast text (the game's option) shows each page at once.
    const _updateShowFast = Window_Message.prototype.updateShowFast;
    Window_Message.prototype.updateShowFast = function() {
        _updateShowFast.call(this);
        if (FAST_SETTING && Number(setting(FAST_SETTING)) === 1) this._showFast = true;
    };
    // Holding Ctrl goes on from a finished page.
    const _updateInput = Window_Message.prototype.updateInput;
    Window_Message.prototype.updateInput = function() {
        this._rrInput = true;
        try { return _updateInput.call(this); } finally { this._rrInput = false; }
    };
    const _isTriggered = Window_Message.prototype.isTriggered;
    Window_Message.prototype.isTriggered = function() {
        return _isTriggered.call(this) || (!!this._rrInput && Input.isPressed('control'));
    };

    //--------------------------------------------------------------------------
    // The choice list

    Window_ChoiceList.prototype.rrChoiceLines = function() {
        if (!this._rrLines) {
            let longest = 0;
            for (const choice of $gameMessage.choices()) longest = Math.max(longest, this.convertEscapeCharacters(resolve(choice)).length);
            this._rrLines = Math.floor(longest / 60) + 1;
        }
        return this._rrLines;
    };
    Window_ChoiceList.prototype.maxCols = function() {
        return $gameMessage.choices().length > 12 && variable(CHOICE_ROWS_VARIABLE) !== 1 ? 2 : 1;
    };
    Window_ChoiceList.prototype.itemHeight = function() {
        return this.lineHeight() * this.rrChoiceLines();
    };
    Window_ChoiceList.prototype.rrMaxChoiceWidth = function() {
        this.resetFontSettings();
        const widths = $gameMessage.choices().map(choice => Math.round(this.textWidth(resolve(choice))));
        return (widths.length ? Math.max(...widths) : 0) * ($gameMessage.choices().length > 12 ? 3 : 1);
    };
    Window_ChoiceList.prototype.updatePlacement = function() {
        this._rrLines = null;
        const count = $gameMessage.choices().length;
        const padding = $gameSystem.windowPadding();
        const fitting = (rows) => rows * this.lineHeight() + padding * 2;
        this.width = Math.min(Math.max(this.rrMaxChoiceWidth() + 12, 96) + padding * 2, Graphics.boxWidth);
        this.height = Math.min(this.rrChoiceLines() * fitting(Math.floor(count / this.maxCols())), Graphics.boxHeight - (variable(CHOICE_ROWS_VARIABLE) * 24 + 24));
        this.x = Graphics.boxWidth - this.width;
        const mw = this._messageWindow;
        this.y = mw.y + mw.height >= Graphics.boxHeight ? mw.y - this.height : mw.y + mw.height;
    };
    // A choice's text starts at the top of its row (several lines when long).
    Window_ChoiceList.prototype.itemLineRect = function(index) {
        return this.itemRectWithPadding(index);
    };
    // $game_temp.last_choice: the row picked (0 for the cancel choice's own row), -1 when cancelled.
    const aceCancelType = () => {
        const type = $gameMessage.choiceCancelType();
        return type === -1 ? 0 : type === -2 ? $gameMessage.choices().length + 1 : type + 1;
    };
    const _callOkHandler = Window_ChoiceList.prototype.callOkHandler;
    Window_ChoiceList.prototype.callOkHandler = function() {
        const index = this.index();
        $gameTemp.rrSetLastChoice(index === aceCancelType() ? 0 : index);
        _callOkHandler.call(this);
    };
    const _callCancelHandler = Window_ChoiceList.prototype.callCancelHandler;
    Window_ChoiceList.prototype.callCancelHandler = function() {
        $gameTemp.rrSetLastChoice(-1);
        _callCancelHandler.call(this);
    };
})();
