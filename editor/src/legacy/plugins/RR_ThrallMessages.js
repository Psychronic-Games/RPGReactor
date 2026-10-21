/*:
 * @target MZ
 * @plugindesc STR22 Message Window EXT++ (VX), for imported games
 * @author star (STR, otsu.cool.ne.jp/strcatyou); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallMessages.js
 *
 * The message window of STR22 MWEXT++ with the game's own edits to it.
 *
 * A slim frame (inset 5 × 6 px) that fades in and out instead of opening.
 * The window is as tall as its lines (four at least) and sits at the top,
 * middle or bottom of the screen. "Dim background" lays the MessageBack
 * picture (variable 25 picks it) behind the text; "Transparent" draws no
 * frame. A face is a 96 × 16 strip from the face sheet, shown above the
 * window's left edge beside the speaker's name; the text is not indented.
 * Choices are lines of the message, typed with it, four spaces in; the
 * cursor spans the whole line. In battle the message runs across the top of
 * the screen over a dark band, with no frame and no fade.
 *
 * Holding Shift shows the text at once and passes every pause; holding the
 * cancel key types two characters a frame. Switch 15 turns all skipping off,
 * switch 16 the Shift skip, switch 17 the double speed.
 *
 * Text codes (besides VX's own \V \N \C \G \. \| \! \> \< \^):
 *   \NA[name] name window   \AL[n] line alignment   \IC[n] icon
 *   \IT[k,id] icon + name   \IN[k,id] name   \M[n] macro   \VO[n] term
 *   \MAP map name   \E edge   \CE[n] edge colour   \B bold   \I italic
 *   \FS[n] \FS[D] font size   \F[n] font   \UND \STR lines   \SPIX[n] gap
 *   \W[n] wait   \S[n] speed   \SH[p,s,d] shake   \SW[id,ON|OFF|RV]
 *   \VA[id,n]   \A[ev,anim]   \U[ev,balloon]   \FR \FM \FC[face,i] \FCM
 *   \STOP map stops   \MOVE player may walk (switch 14 on)   \NEXT
 * The pop-up codes (\P, \PP), face animations (\FA \FAL \FLC) and ruby
 * (\R[text,ruby], drawn without its ruby) do nothing here; the game uses
 * none of them.
 *
 * Kept as the original did it:
 * - \U[ev,0] shows no balloon (the script sets balloon 0).
 * - The window with a face and a 96 px strip keeps the text at the left edge
 *   (the game removed the indent).
 * - In battle the window is 640 wide (the script's screen size), so
 *   centred lines sit 16 px right of the middle.
 * - The pause sign stands after the widest line, below the last; the game's
 *   window skin draws it empty.
 * - Holding cancel draws one more character after a \! pause.
 * - Switch 51 turns the arrow keys a quarter turn (up walks left); the player
 *   walks in eight directions.
 *
 * Script calls the importer translates:
 *   $game_message.maxlineex = n   → $gameMessage.rrSetMaxLineEx(n)
 *     (lines a message and its choices may take; 4 by default, 4 in battle)
 *   $game_message.xywh.set(x, y, w, h) → $gameMessage.rrSetXywh(x, y, w, h)
 *   $game_message.unlock / pos_autoset = v
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param windowRect
 * @text Window (x, y, width, height)
 * @default 0,0,608,128
 *
 * @param screen
 * @text Screen size the script assumed
 * @default 640,480
 *
 * @param battleMode
 * @text Battle messages (0 bottom window, 1 top band)
 * @type number
 * @default 1
 *
 * @param fadeType
 * @text Fade (0 open/close, 1 opacity)
 * @type number
 * @default 1
 *
 * @param fadeSpeed
 * @type number
 * @default 48
 *
 * @param slimWindow
 * @type boolean
 * @default true
 *
 * @param slimSize
 * @text Slim frame inset (width, height)
 * @default 10,12
 *
 * @param fontSize
 * @text Font.default_size of the game
 * @type number
 * @default 20
 *
 * @param lineHeight
 * @type number
 * @default 24
 *
 * @param align
 * @text Default alignment (0 left, 1 centre, 2 right)
 * @type number
 * @default 0
 *
 * @param nameColor
 * @default 255,255,255
 *
 * @param nameEdge
 * @type boolean
 * @default true
 *
 * @param nameEdgeColor
 * @default 64,32,128
 *
 * @param nameSize
 * @text Name window size added (width, height)
 * @default 10,6
 *
 * @param nameOffset
 * @default 0,-14
 *
 * @param nameOpacity
 * @type number
 * @default 100
 *
 * @param nameSkin
 * @text Name window skin (img/system)
 * @default WindowS
 *
 * @param pausePlace
 * @text Pause sign (0 bottom centre, 1 bottom right, 2 after the text)
 * @type number
 * @default 2
 *
 * @param pauseOffset
 * @default -24,-24
 *
 * @param pauseSpeed
 * @type number
 * @default 8
 *
 * @param faceSize
 * @default 96,16
 *
 * @param faceOffset
 * @default 0,-28
 *
 * @param faceSpace
 * @type number
 * @default 8
 *
 * @param backVariable
 * @type variable
 * @default 25
 *
 * @param backImages
 * @text MessageBack by variable value (JSON)
 * @default {"0":"MessageBack","1":"","2":""}
 *
 * @param moveSwitch
 * @type switch
 * @default 14
 *
 * @param noSkipSwitch
 * @type switch
 * @default 15
 *
 * @param noDashSwitch
 * @type switch
 * @default 16
 *
 * @param noDoubleSwitch
 * @type switch
 * @default 17
 *
 * @param rotateSwitch
 * @text Switch that turns the arrow keys
 * @type switch
 * @default 51
 *
 * @param endWait
 * @type number
 * @default 0
 *
 * @param autoFast
 * @text Double speed always
 * @type boolean
 * @default false
 *
 * @param edgeColors
 * @default {"0":[64,32,128,255],"1":[128,32,32,255],"2":[96,96,32,255],"3":[32,32,32,255],"4":[64,32,128,128]}
 *
 * @param macros
 * @default {}
 *
 * @param autoNames
 * @default {}
 *
 * @param vocabExtra
 * @default {}
 *
 * @param goldX
 * @type number
 * @default 448
 *
 * @param battleBand
 * @text Battle band (JSON; empty for none)
 * @default {"colors":[[0,0,0,224],[0,0,0,196]],"width":608,"step":96,"speed":1,"move":true}
 */
(() => {
    'use strict';
    const P = PluginManager.parameters('RR_ThrallMessages');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const bool = (v, d) => (v === undefined || v === '' ? d : String(v) === 'true');
    const nums = (v, d) => (v ? String(v).split(',').map(Number) : d);
    const json = (v, d) => { try { return v ? JSON.parse(v) : d; } catch (_) { return d; } };
    const C = {
        rect: nums(P.windowRect, [0, 0, 608, 128]), screen: nums(P.screen, [640, 480]),
        battleMode: num(P.battleMode, 1), fadeType: num(P.fadeType, 1), fadeSpeed: num(P.fadeSpeed, 48),
        slim: bool(P.slimWindow, true), slimSize: nums(P.slimSize, [10, 12]),
        fontSize: num(P.fontSize, 20), lineHeight: num(P.lineHeight, 24), align: num(P.align, 0),
        nameColor: nums(P.nameColor, [255, 255, 255]), nameEdge: bool(P.nameEdge, true), nameEdgeColor: nums(P.nameEdgeColor, [64, 32, 128]),
        nameSize: nums(P.nameSize, [10, 6]), nameOffset: nums(P.nameOffset, [0, -14]), nameOpacity: num(P.nameOpacity, 100),
        nameSkin: P.nameSkin === undefined ? 'WindowS' : String(P.nameSkin),
        pausePlace: num(P.pausePlace, 2), pauseOffset: nums(P.pauseOffset, [-24, -24]), pauseSpeed: num(P.pauseSpeed, 8),
        faceSize: nums(P.faceSize, [96, 16]), faceOffset: nums(P.faceOffset, [0, -28]), faceSpace: num(P.faceSpace, 8),
        backVariable: num(P.backVariable, 25), backImages: json(P.backImages, { 0: 'MessageBack', 1: '', 2: '' }),
        moveSwitch: num(P.moveSwitch, 14), noSkipSwitch: num(P.noSkipSwitch, 15), noDashSwitch: num(P.noDashSwitch, 16),
        noDoubleSwitch: num(P.noDoubleSwitch, 17), rotateSwitch: num(P.rotateSwitch, 51),
        endWait: num(P.endWait, 0), autoFast: bool(P.autoFast, false),
        edgeColors: json(P.edgeColors, { 0: [64, 32, 128, 255] }), macros: json(P.macros, {}), autoNames: json(P.autoNames, {}),
        vocabExtra: json(P.vocabExtra, {}), goldX: num(P.goldX, 448),
        band: P.battleBand === '' ? null : json(P.battleBand, { colors: [[0, 0, 0, 224], [0, 0, 0, 196]], width: 608, step: 96, speed: 1, move: true })
    };
    const LH = C.lineHeight;
    const ICON = 24;            // STR22009
    const sw = (id) => id > 0 && $gameSwitches.value(id);
    const inBattle = () => !!($gameParty && $gameParty.inBattle());
    const fades = () => C.fadeType === 1;
    const css = (c) => (c ? `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${(c[3] === undefined ? 255 : c[3]) / 255})` : 'rgba(64,32,128,1)');
    /** Pixels for an RGSS font size (RGSS sizes a font by its cell, the browser by its em). */
    const fontPx = (ruby) => ruby * $gameSystem.mainFontSize() / C.fontSize;

    // ---- Game_Message ------------------------------------------------------------------------------

    const _gmInitialize = Game_Message.prototype.initialize;
    Game_Message.prototype.initialize = function() {
        _gmInitialize.call(this);
        this._rrMaxLineEx = 4;
        this._rrUnlock = false;
        this._rrPosAutoset = true;
        this._rrXywh = { x: 0, y: 0, width: 32, height: 32 };
        this._rrMapStop = false;
    };
    const _gmClear = Game_Message.prototype.clear;
    Game_Message.prototype.clear = function() {
        _gmClear.call(this);
        this._rrEventId = 0;
        this._rrMesMove = false;
    };
    /** $game_message.maxlineex: the lines one message (with its choices) may hold. */
    Game_Message.prototype.rrMaxLines = function() {
        const n = Math.floor(Number(this._rrMaxLineEx));
        return n > 0 ? n : 4;
    };
    Game_Message.prototype.rrSetMaxLineEx = function(n) { this._rrMaxLineEx = Number(n) || 0; };
    Game_Message.prototype.rrSetXywh = function(x, y, w, h) { this._rrXywh = { x: Number(x) || 0, y: Number(y) || 0, width: Number(w) || 0, height: Number(h) || 0 }; };
    Game_Message.prototype.rrSetUnlock = function(v) { this._rrUnlock = !!v; };
    Game_Message.prototype.rrSetPosAutoset = function(v) { this._rrPosAutoset = !!v; };

    // ---- the interpreter ---------------------------------------------------------------------------

    // Show Text takes the following Show Text too when a line asked for \NEXT, up to maxlineex lines;
    // choices and a number input join the message when they fit in the lines left.
    Game_Interpreter.prototype.command101 = function(params) {
        if ($gameMessage.isBusy()) return false;
        $gameMessage._rrEventId = this._eventId;
        $gameMessage.setFaceImage(params[0], params[1]);
        $gameMessage.setBackground(params[2]);
        $gameMessage.setPositionType(params[3]);
        $gameMessage.setSpeakerName(params[4] || '');
        const list = this._list, max = $gameMessage.rrMaxLines();
        let i = this._index, more = true;
        for (;;) {
            const cmd = list[i];
            if (cmd && cmd.code === 101 && more && max > $gameMessage._texts.length) i++;
            else break;
            more = false;
            while (list[i] && list[i].code === 401) {
                const line = String(list[i].parameters[0]);
                if (/\\NEXT/i.test(line)) more = true;
                if (max > $gameMessage._texts.length) $gameMessage.add(line);
                i++;
            }
        }
        const next = list[i];
        if (next && next.code === 102) {
            if ($gameMessage._texts.length <= max - next.parameters[0].length) { this._index = i; this.setupChoices(next.parameters); i++; }
        } else if (next && next.code === 103) {
            if ($gameMessage._texts.length < max) { this._index = i; this.setupNumInput(next.parameters); i++; }
        }
        this._index = i - 1;
        this.setWaitMode('message');
        return true;
    };
    // A number input takes a line of the message of its own.
    const _setupNumInput = Game_Interpreter.prototype.setupNumInput;
    Game_Interpreter.prototype.setupNumInput = function(params) {
        if ($gameMessage._texts.length >= $gameMessage.rrMaxLines()) return;
        $gameMessage.add('');
        _setupNumInput.call(this, params);
    };

    // Battle messages hold four lines; the map's setting comes back after the battle.
    const _sbCreate = Scene_Battle.prototype.create;
    Scene_Battle.prototype.create = function() {
        this._rrMaxLineEx = $gameMessage._rrMaxLineEx;
        $gameMessage._rrMaxLineEx = 4;
        _sbCreate.call(this);
    };
    const _sbTerminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        _sbTerminate.call(this);
        if (this._rrMaxLineEx !== undefined) $gameMessage._rrMaxLineEx = this._rrMaxLineEx;
    };

    // \STOP: the map stands still while the message shows.
    const _gameMapUpdate = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        if ($gameMessage.isBusy() && $gameMessage._rrMapStop) return;
        _gameMapUpdate.call(this, sceneActive);
    };
    Game_Map.prototype.rrMapNameStrExtPP = function() {
        const info = $dataMapInfos[this._mapId];
        const name = info ? String(info.name) : '';
        return name.includes('#') ? name.replace(/(\S*)#\S*/, '$1') : name;
    };

    // ---- the player --------------------------------------------------------------------------------

    // Eight directions; the rotate switch turns them a quarter (down walks right, up walks left).
    const TURN = { 1: 3, 2: 6, 3: 9, 4: 2, 6: 8, 7: 1, 8: 4, 9: 7 };
    Game_Player.prototype.getInputDirection = function() {
        const d = Input.dir8;
        return d && sw(C.rotateSwitch) ? TURN[d] : d;
    };
    const DIAGONAL = { 1: [4, 2], 3: [6, 2], 7: [4, 8], 9: [6, 8] };
    const _executeMove = Game_Player.prototype.executeMove;
    Game_Player.prototype.executeMove = function(direction) {
        const d = DIAGONAL[direction];
        if (d) this.moveDiagonally(d[0], d[1]);
        else _executeMove.call(this, direction);
    };
    // \MOVE: the player walks while the message and its event run.
    const _canMove = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function() {
        if (!$gameMessage._rrMesMove) return _canMove.call(this);
        if (this.isMoveRouteForcing() || this.areFollowersGathering()) return false;
        if (this._vehicleGettingOn || this._vehicleGettingOff) return false;
        if (this.isInVehicle() && !this.vehicle().canMove()) return false;
        return true;
    };

    // ---- text codes --------------------------------------------------------------------------------

    const E = '\x1b';
    const RECORDS = () => [$dataItems, $dataWeapons, $dataArmors, $dataSkills];
    const record = (k, id) => { const t = RECORDS()[Number(k)]; return t ? t[Number(id)] : null; };
    const vocab = (n) => {
        const T = TextManager;
        const list = [T.buy, T.sell, T.cancel, T.possession, T.expTotal, T.expNext, T.saveMessage, T.loadMessage, 'File',
            T.level, T.levelA, T.hp, T.hpA, T.mp, T.mpA, T.param(2), T.param(3), T.param(4), T.param(6), T.weapon,
            $dataSystem.equipTypes[2], $dataSystem.equipTypes[3], $dataSystem.equipTypes[4], $dataSystem.equipTypes[5],
            T.weapon, T.weapon, T.attack, T.skill, T.guard, T.item, T.equip, T.status, T.save, T.gameEnd, T.currencyUnit];
        if (C.vocabExtra[n] !== undefined) return String(C.vocabExtra[n]);
        return list[n] === undefined ? '' : String(list[n]);
    };

    /** The script's codes as \x1bRR… codes the window reads (its own letters would run into the text after them). */
    const _convert = Window_Message.prototype.convertEscapeCharacters;
    Window_Message.prototype.convertEscapeCharacters = function(text) {
        text = String(text);
        text = text.replace(/\\V\[([0-9]+)\]/gi, (m, n) => $gameVariables.value(Number(n)));
        text = text.replace(/\\M\[([0-9]+)\]/gi, (m, n) => (C.macros[n] === undefined ? '' : String(C.macros[n])));
        // VX's \G is the gold window (MZ's \$); \P[n] is a pop-up, not a party member.
        text = text.replace(/\\G/g, '\\$').replace(/\\g/g, '\\$');
        text = text.replace(/\\P\[([0-9]+)\]/i, '\\RRPOP[$1]').replace(/\\P\[-1+\]/i, '\\RRPOP[-1]');
        text = text.replace(/\\PP\[([0-9]+)\]/i, '\\RRPP[$1]').replace(/\\PP\[-1+\]/i, '\\RRPP[-1]').replace(/\\PP\[-2+\]/i, '\\RRPP[-2]');
        text = _convert.call(this, text);
        const R = (re, f) => { text = text.replace(re, f); };
        R(/\x1bMAP/gi, () => $gameMap.rrMapNameStrExtPP());
        R(/\x1bVO\[([0-9]+)\]/gi, (m, n) => vocab(Number(n)));
        R(/\x1bIT\[([0-9]+),([0-9]+)\]/gi, (m, k, id) => { const r = record(k, id); return r ? `${E}RRIC[${r.iconIndex}]${r.name}` : ''; });
        R(/\x1bIC\[([0-9]+)\]/gi, (m, n) => `${E}RRIC[${n}]`);
        R(/\x1bIN\[([0-9]+),([0-9]+)\]/gi, (m, k, id) => { const r = record(k, id); return r ? r.name : ''; });
        R(/\x1bA\[([0-9]+),([0-9]+)\]/gi, (m, a, b) => `${E}RRA[${a},${b}]`);
        R(/\x1bA\[-1,([0-9]+)\]/gi, (m, b) => `${E}RRA[9999,${b}]`);
        R(/\x1bU\[([0-9]+),([0-9]+)\]/gi, (m, a, b) => `${E}RRU[${a},${b}]`);
        R(/\x1bU\[-1,([0-9]+)\]/gi, (m, b) => `${E}RRU[9999,${b}]`);
        R(/\x1bAL\[([0-9]+)\]/gi, (m, n) => `${E}RRAL[${n}]`);
        R(/\x1bR\[([^[\]\s]+),([^[\]\s]+)\]/gi, (m, base) => base);
        R(/\x1bNA\[([^[\]\s]*)\]/i, (m, name) => `${E}RRNA[${name}]`);
        R(/\x1bFR/gi, `${E}RRFR[]`);
        R(/\x1bFM/gi, `${E}RRFM[]`);
        R(/\x1bFC\[([^[\]\s]+),([0-9]+)\]/gi, (m, f, i) => `${E}RRFC[${f},${i}]`);
        R(/\x1bFCM/gi, `${E}RRFCM[]`);
        R(/\x1bFA\[([0-9]+)\]/gi, (m, n) => `${E}RRFA[${n}]`);
        R(/\x1bFAL\[([0-9]+)\]/gi, (m, n) => `${E}RRFAL[${n}]`);
        R(/\x1bFLC\[([0-9]+)\]/gi, (m, n) => `${E}RRFLC[${n}]`);
        R(/\x1bMOVE/gi, `${E}RRMOVE[]`);
        R(/\x1bSTOP/gi, `${E}RRSTOP[]`);
        R(/\x1bW\[([0-9]+)\]/gi, (m, n) => `${E}RRW[${n}]`);
        R(/\x1bS\[([0-9]+)\]/gi, (m, n) => `${E}RRS[${n}]`);
        R(/\x1bE/gi, `${E}RREDGE[]`);
        R(/\x1bFS\[([0-9]+)\]/gi, (m, n) => `${E}RRFS[${n}]`);
        R(/\x1bFS\[D\]/gi, `${E}RRFSD[]`);
        R(/\x1bB/gi, `${E}RRB[]`);
        R(/\x1bI/gi, `${E}RRI[]`);
        R(/\x1bF\[([0-9]+)\]/gi, (m, n) => `${E}RRF[${n}]`);
        R(/\x1bCE\[([0-9]+)\]/gi, (m, n) => `${E}RRCE[${n}]`);
        R(/\x1bUND/gi, `${E}RRUND[]`);
        R(/\x1bSTR/gi, `${E}RRSTR[]`);
        R(/\x1bSH\[(\d+),(\d+),(\d+)\]/gi, (m, a, b, c) => `${E}RRSH[${a},${b},${c}]`);
        R(/\x1bSW\[(\d+),ON\]/gi, (m, n) => `${E}RRSW[${n},1]`);
        R(/\x1bSW\[(\d+),OFF\]/gi, (m, n) => `${E}RRSW[${n},0]`);
        R(/\x1bSW\[(\d+),RV\]/gi, (m, n) => `${E}RRSW[${n},2]`);
        R(/\x1bVA\[(\d+),(\d+)\]/gi, (m, n, v) => `${E}RRVA[${n},${v}]`);
        R(/\x1bVA\[(\d+),-(\d+)\]/gi, (m, n, v) => `${E}RRVA[${n},-${v}]`);
        R(/\x1bNEXT/gi, '');
        R(/\x1bSPIX\[([0-9]+)\]/gi, (m, n) => `${E}RRSPIX[${n}]`);
        // A second \NA (the script took only the first), or one naming a name with a space, is printed, backslash and all.
        R(/\x1b(NA\[)/gi, (m, rest) => '\\' + rest);
        return text;
    };

    // Codes the script reads without stopping for the frame; the rest end the frame's character as a letter does.
    const GOES_ON = new Set(['C', 'RREDGE', 'RRFS', 'RRFSD', 'RRB', 'RRI', 'RRF', 'RRCE', 'RRPOP', 'RRPP', 'RRNA', 'RRFR', 'RRFM',
        'RRSTOP', 'RRMOVE', 'RRUND', 'RRSTR', 'RRSPIX', 'RRSH', 'RRSW', 'RRVA', 'RRAL', 'RRFC', 'RRFCM']);
    const takeParam = (textState) => {
        const m = /^\[([^\]\n]*)\]/.exec(textState.text.slice(textState.index));
        if (!m) return [];
        textState.index += m[0].length;
        return m[1] === '' ? [] : m[1].split(',');
    };

    // ---- Window_Message ----------------------------------------------------------------------------

    const _wmInitialize = Window_Message.prototype.initialize;
    Window_Message.prototype.initialize = function(rect) {
        _wmInitialize.call(this, rect);
        this._rrW = 0;
        this._rrOpening = this._rrClosing = false;
        this._rrFaceLR = 0;
        this._rrHasFace = false;
        this._rrPsx = 0;
        this._rrContentsY = 0;
        this._rrPageLine = 0;
        this._rrWidths = [0];
        this._rrHeights = [];
        this._rrAligns = [];
        this._rrNameW = 24;
        this._rrNameH = 24;
        this._rrShake = 0; this._rrShakePower = 0; this._rrShakeSpeed = 0; this._rrShakeDuration = 0; this._rrShakeDir = 1;
        this._rrTextSpeed = 0;
        this._rrChoiceStart = 0;
        this.rrResetExt();
        this.rrCreateParts();
    };

    Window_Message.prototype.rrCreateParts = function() {
        if (C.band) {
            const band = C.band, h = 96 + 16;
            const bitmap = new Bitmap(band.width, h);
            bitmap.gradientFillRect(0, 16, band.width, 96, css(band.colors[0]), css(band.colors[1]));
            this._rrBand = new Sprite(bitmap);
            this._rrBand.setFrame(0, 0, band.width, 16);
            this._rrBand.opacity = 0;
            this.addChildAt(this._rrBand, 0);
        }
        if (C.slim) {
            this._rrSlim = new Window_Base(new Rectangle(0, 0, this.width, this.height));
            this._rrSlim.opacity = 0;
            this.addChildAt(this._rrSlim, this._rrBand ? 1 : 0);
        }
        this._rrBack = new Sprite();
        this._rrBack.visible = false;
        this.addChildAt(this._rrBack, (this._rrBand ? 1 : 0) + (this._rrSlim ? 1 : 0));
        this._rrNameBack = new Sprite();
        this._rrNameBack.visible = false;
        this._rrNameSprite = new Sprite();
        this._rrNameSprite.anchor.set(0.5, 0.5);
        this._rrFace = new Sprite();
        this._rrFace.anchor.set(0.5, 0.5);
        this._rrPause = new Sprite(this.windowskin);
        this._rrPause.visible = false;
        this._rrPauseCount = 0;
        this._rrPauseWait = C.pauseSpeed;
        this._rrPause.setFrame(0, 0, 0, 0);
        for (const s of [this._rrNameBack, this._rrNameSprite, this._rrFace, this._rrPause]) this.addChild(s);
        ImageManager.loadSystem(C.nameSkin);
    };

    // VX's message window drew no frame of its own; the slim window under it does.
    Window_Message.prototype._updatePauseSign = function() {
        if (this._pauseSignSprite) this._pauseSignSprite.visible = false;
    };
    Window_Message.prototype.updateBackground = function() {
        this._background = $gameMessage.background();
        this.setBackgroundType(2);
    };
    Window_Message.prototype.updatePlacement = function() {};
    Window_Message.prototype.newLineX = function() { return 0; };
    Window_Message.prototype.drawMessageFace = function() {};
    Window_Message.prototype.updateShowFast = function() {};

    /** The per-line settings a new line starts from (font, size, edge, bold, italic, lines). */
    Window_Message.prototype.rrResetExt = function() {
        this._rrFontRuby = C.fontSize;
        this._rrEdge = false;
        this._rrBold = this._rrItalic = false;
        this._rrBoldOff = this._rrItalicOff = false;
        this._rrUnd = this._rrStr = false;
        if (this.contents) {
            this.contents.fontSize = fontPx(this._rrFontRuby);
            this.contents.fontBold = false;
            this.contents.fontItalic = false;
        }
    };

    // -- message start: the text, the prescan, the window's size and place --

    Window_Message.prototype.canStart = function() {
        return ($gameMessage.hasText() || $gameMessage.isChoice()) && !$gameMessage.scrollMode();
    };
    Window_Message.prototype.doesContinue = function() {
        return ($gameMessage.hasText() || $gameMessage.isChoice()) && !$gameMessage.scrollMode() && !this.areSettingsChanged();
    };
    Window_Message.prototype.areSettingsChanged = function() {
        if (inBattle()) return false;
        return this._rrBg !== $gameMessage.background() || this._rrPos !== $gameMessage.positionType();
    };

    Window_Message.prototype.startMessage = function() {
        const lines = $gameMessage._texts.slice();
        this._rrChoiceStart = lines.length;
        if ($gameMessage.isChoice()) for (const c of $gameMessage.choices()) lines.push('    ' + c);
        const textState = this.createTextState(lines.join('\n'), 0, 0, 0);
        textState.rrMessage = true;
        textState.x = textState.startX = 0;
        this._textState = textState;
        this.rrResetWindow(textState.text);
        this.newPage(textState);
        this.open();
        if (this._nameBoxWindow) this._nameBoxWindow.start();
    };

    /** reset_window: the prescan sets name, face side, alignments, line widths and heights; then size and place. */
    Window_Message.prototype.rrResetWindow = function(text) {
        const max = $gameMessage.rrMaxLines();
        this._rrAligns = [];
        for (let i = 0; i <= max; i++) this._rrAligns[i] = C.align;
        $gameMessage._rrMapStop = false;
        this._rrNoFace = false;
        this._rrFaceLR = 0;
        this._rrFace.scale.x = 1;
        this._rrBg = $gameMessage.background();
        this._rrPos = $gameMessage.positionType();
        this._background = this._rrBg;
        this._positionType = this._rrPos;
        this.setBackgroundType(2);
        if (this._rrBg === 1) {
            const name = C.backImages[$gameVariables.value(C.backVariable)];
            this._rrBack.bitmap = name ? ImageManager.loadSystem(String(name)) : null;
        }
        if (fades()) this.openness = 255;
        else this._rrW = 255;
        this.rrShakeReset();
        // The name a face carries (Actor[n] reads the actor's name), unless \NA names another.
        let name = '';
        if ($gameMessage.faceName() !== '') {
            const auto = C.autoNames[$gameMessage.faceName() + '_' + $gameMessage.faceIndex()];
            if (auto !== undefined) name = String(auto);
            const actor = /Actor\[(\d+)\]/i.exec(name);
            if (actor) name = $gameActors.actor(Number(actor[1])) ? $gameActors.actor(Number(actor[1])).name() : '';
        }
        const scan = this.rrPrescan(text, max);
        if (scan.name !== null) name = scan.name;
        this._rrPsx = 0;
        this._rrHasFace = $gameMessage.faceName() !== '';
        this.rrNameWindowSet(name);
        let h = scan.heights.reduce((s, x) => s + x, 0);
        const face = this._rrHasFace;
        const [rx, , rw, rh] = C.rect;
        if (face && 32 + h < rh) h = rh - 32;
        const xywh = $gameMessage._rrXywh || { width: 0, height: 0 };
        let x, y, width, height;
        const gold = this._goldWindow;
        if (xywh.width > 32 && xywh.height > 32) {
            x = xywh.x; y = xywh.y; width = xywh.width; height = xywh.height;
        } else {
            if (32 + h < rh) h = rh - 32;
            width = rw; height = 32 + h; x = rx;
            if (gold) gold.y = 0;
            y = 0;
            if (this._rrPos === 0 && gold) gold.y = C.screen[1] - 56;
            if (this._rrPos === 1) y = Math.floor(C.screen[1] / 2) - Math.floor(height / 2);
            if (this._rrPos === 2) y = C.screen[1] - height;
        }
        // VX's Window_Gold: 160 × 56 (Thrall moved it to x 448 for its wider screen).
        if (gold) {
            if (gold.width !== 160 || gold.height !== 56) { gold.move(C.goldX, gold.y, 160, 56); gold.createContents(); }
            gold.x = C.goldX;
        }
        if (inBattle()) {
            x = 0; y = 0; this._rrPos = 0;
            width = C.screen[0]; height = 128;
            if (C.battleMode === 0) y = C.screen[1] - 128;
        }
        this.move(x, y, width, height);
        this.createContents();
        this.rrResetExt();
        this._rrWidths = scan.widths;
        this._rrHeights = scan.heights;
        this._rrTops = [0];
        for (let i = 0; i < scan.heights.length; i++) this._rrTops[i + 1] = this._rrTops[i] + scan.heights[i];
    };

    /** The script's look-ahead: each line's width and height and the codes that act when the message starts. */
    Window_Message.prototype.rrPrescan = function(text, max) {
        const widths = [0], heights = [];
        let line = 0, maxH = LH, ruby = C.fontSize, bold = false, italic = false, boldOff = false, italicOff = false;
        let name = null, i = 0, ended = false;
        const b = this.contents;
        const endLine = () => {
            if (italic || italicOff) widths[line] += Math.floor(ruby / 4) + 2;
            heights[line] = maxH;
            line++;
            widths[line] = 0;
            maxH = LH; ruby = C.fontSize; bold = boldOff = false; italic = italicOff = false;
        };
        while (i < text.length) {
            const c = text[i];
            if (c === '\n') {
                endLine();
                i++;
                if (line >= max && i < text.length) { ended = true; break; }
                continue;
            }
            if (c === E) {
                let m = /^([$.|^!><{}\\]|[A-Z]+)(?:\[([^\]\n]*)\])?/i.exec(text.slice(i + 1));
                if (!m) { i++; continue; }
                const code = m[1].toUpperCase();
                if (!/^(RR|C$)/.test(code)) m = [m[1], m[1]];   // only the script's codes and \C take a list
                const args = m[2] === undefined ? [] : m[2].split(',');
                i += 1 + m[0].length;
                switch (code) {
                    case 'RRFS': ruby = Number(args[0]) || ruby; break;
                    case 'RRFSD': ruby = C.fontSize; break;
                    case 'RRB': if (bold) boldOff = true; bold = !bold; break;
                    case 'RRI': if (italic) italicOff = true; italic = !italic; break;
                    case 'RRSPIX': widths[line] += Number(args[0]) || 0; break;
                    case 'RRIC': widths[line] += ICON; break;
                    case 'RRAL': this._rrAligns[line] = Number(args[0]) || 0; break;
                    case 'RRNA': name = m[2] === undefined ? '' : m[2]; break;
                    case 'RRFR': this._rrFaceLR = 1; break;
                    case 'RRFM': this._rrFace.scale.x = -1; break;
                    case 'RRFLC': this._rrNoFace = true; break;
                    case 'RRSTOP': $gameMessage._rrMapStop = true; break;
                    case 'RRMOVE':
                        $gameMessage._rrMesMove = true;
                        if (C.moveSwitch > 0) $gameSwitches.setValue(C.moveSwitch, true);
                        $gameMap.requestRefresh();
                        break;
                }
                continue;
            }
            // A letter (a surrogate pair is one), measured on its own as RGSS drew it, never bold.
            let ch = c;
            const code = c.charCodeAt(0);
            if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) ch += text[i + 1];
            i += ch.length;
            let iw = 0;
            if (italicOff) { iw = Math.floor(ruby / 5); italicOff = false; }
            if (boldOff) { iw += Math.floor(ruby / 8); boldOff = false; }
            if (ruby > maxH) maxH = ruby;
            b.fontSize = fontPx(ruby);
            b.fontBold = false;
            b.fontItalic = italic;
            widths[line] += b.measureTextWidth(ch) + iw;
        }
        if (!ended) endLine();
        b.fontItalic = false;
        b.fontSize = fontPx(C.fontSize);
        return { widths, heights: heights.slice(0, Math.max(1, Math.min(heights.length, max))), name };
    };

    /** The name window: WindowS's background behind the face strip and the name, drawn with an edge. */
    Window_Message.prototype.rrNameWindowSet = function(name) {
        this._rrNameText = name;
        this._rrNameSprite.bitmap = null;
        this._rrNameBack.visible = !!name;
        if (!name) return;
        const px = $gameSystem.mainFontSize();
        const probe = new Bitmap(1, 1);
        probe.fontFace = $gameSystem.mainFontFace();
        probe.fontSize = px;
        const bw = Math.ceil(probe.measureTextWidth(name)) + 8, bh = C.fontSize + 4;
        probe.destroy();
        const bitmap = new Bitmap(bw, bh);
        bitmap.fontFace = $gameSystem.mainFontFace();
        bitmap.fontSize = px;
        bitmap.outlineWidth = 0;
        if (C.nameEdge) {
            bitmap.textColor = css(C.nameEdgeColor);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) bitmap.drawText(name, dx, dy, bw, bh, 'center');
        }
        bitmap.textColor = css(C.nameColor);
        bitmap.drawText(name, 0, 0, bw, bh, 'center');
        this._rrNameSprite.bitmap = bitmap;
        this._rrNameW = bw + C.nameSize[0] + (this._rrHasFace ? 120 : 16);
        this._rrNameH = bh + C.nameSize[1];
        this.rrDrawNameBack();
    };
    Window_Message.prototype.rrDrawNameBack = function() {
        const skin = ImageManager.loadSystem(C.nameSkin);
        const w = this._rrNameW, h = this._rrNameH;
        const draw = () => {
            const back = new Bitmap(w, h);
            if (w > 4 && h > 4 && skin.width >= 64) back.blt(skin, 0, 0, 64, 64, 2, 2, w - 4, h - 4);
            this._rrNameBack.bitmap = back;
        };
        if (skin.isReady()) draw(); else skin.addLoadListener(draw);
    };

    // -- pages and lines --

    // VX's Game_Message#new_page pads the text with blank lines to the next four-line page; MZ's appends "\f",
    // which this window would print (level-up messages call it).
    Game_Message.prototype.newPage = function() {
        while (this._texts.length % 4 > 0) this._texts.push('');
    };

    const _newPage = Window_Message.prototype.newPage;
    Window_Message.prototype.newPage = function(textState) {
        _newPage.call(this, textState);
        if (!textState.rrMessage) return;
        this._rrPageLine = 0;
        this._rrContentsY = 0;
        this._rrTextSpeed = 0;
        this._rrEdgeColor = 0;
        this.rrSetFace($gameMessage.faceName(), $gameMessage.faceIndex());
        this.rrResetExt();
        textState.x = textState.startX + this.rrAlignOffset(0, textState.startX);
        this.rrApplyShake();
    };
    Window_Message.prototype.rrSetFace = function(name, index) {
        const [w, h] = C.faceSize;
        if (!name) { this._rrFace.bitmap = null; return; }
        this._rrFace.bitmap = ImageManager.loadFace(name);
        this._rrFace.setFrame((index % 4) * w, Math.floor(index / 4) * h, w, h);
    };
    Window_Message.prototype.calcTextHeight = function(textState) {
        if (!textState || !textState.rrMessage || !this._rrHeights) return Window_Base.prototype.calcTextHeight.call(this, textState);
        return this._rrHeights[this._rrPageLine] || LH;
    };
    Window_Message.prototype.rrAlignOffset = function(line, x) {
        const w = this._rrWidths[line] || 0;
        switch (this._rrAligns[line]) {
            case 1: return Math.floor((this.width - 32 - x - w) / 2);
            case 2: return this.width - 32 - x - w;
            default: return 0;
        }
    };
    const _processNewLine = Window_Message.prototype.processNewLine;
    Window_Message.prototype.processNewLine = function(textState) {
        if (!textState.rrMessage) return _processNewLine.call(this, textState);
        this._rrPsx = Math.max(this._rrPsx, textState.x);
        this._rrPageLine++;
        this.rrResetExt();
        _processNewLine.call(this, textState);
        this._rrContentsY = textState.y;
        textState.x += this.rrAlignOffset(this._rrPageLine, textState.x);
        this.rrApplyShake();
    };
    // RGSS ended every line with a line break, so the last one moves the pause sign below the text too.
    const _onEndOfText = Window_Message.prototype.onEndOfText;
    Window_Message.prototype.onEndOfText = function() {
        const ts = this._textState;
        if (ts && ts.rrMessage && !ts.rrEnded) {
            ts.rrEnded = true;
            this._rrPsx = Math.max(this._rrPsx, ts.x);
            this._rrContentsY = ts.y + ts.height;
        }
        _onEndOfText.call(this);
        this._waitCount = C.endWait;
    };
    Window_Message.prototype.startPause = function() {
        this.pause = true;
    };

    // -- characters --

    const _processCharacter = Window_Message.prototype.processCharacter;
    Window_Message.prototype.processCharacter = function(textState) {
        if (!textState.rrMessage) return _processCharacter.call(this, textState);
        for (;;) {
            if (textState.index >= textState.text.length) return;
            if (this._waitCount <= 0) this._waitCount = this._rrTextSpeed;
            const c = textState.text[textState.index];
            if (c === E) {
                textState.index++;
                const code = this.obtainEscapeCode(textState);
                this.processEscapeCharacter(code, textState);
                if (GOES_ON.has(code)) continue;
                return;
            }
            if (c.charCodeAt(0) < 0x20) {
                textState.index++;
                this.processControlCharacter(textState, c);
                return;
            }
            let ch = c;
            const code = c.charCodeAt(0);
            if (code >= 0xd800 && code <= 0xdbff && textState.index + 1 < textState.text.length) ch += textState.text[textState.index + 1];
            textState.index += ch.length;
            this.rrDrawCharacter(textState, ch);
            return;
        }
    };
    /** One character as the script drew it: its own box, an edge if on, advanced by its plain width. */
    Window_Message.prototype.rrDrawCharacter = function(textState, ch) {
        let iw = 0;
        if (this._rrItalicOff) { iw = Math.floor(this._rrFontRuby / 5); this._rrItalicOff = false; }
        if (this._rrBoldOff) { iw += Math.floor(this._rrFontRuby / 8); this._rrBoldOff = false; }
        const b = this.contents;
        b.fontSize = fontPx(this._rrFontRuby);
        b.fontBold = this._rrBold;
        b.fontItalic = this._rrItalic;
        const x = textState.x + iw, y = textState.y, h = textState.height;
        const box = Math.ceil(b.measureTextWidth(ch)) + 8;
        if (textState.drawing) {
            if (this._rrEdge) {
                const keep = b.textColor;
                b.textColor = css(C.edgeColors[this._rrEdgeColor] || C.edgeColors[0]);
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.drawText(ch, x + dx, y + dy, box, h);
                b.textColor = keep;
            }
            b.drawText(ch, x, y, box, h);
        }
        b.fontBold = false;
        const advance = b.measureTextWidth(ch) + iw;
        b.fontBold = this._rrBold;
        if (textState.drawing && (this._rrUnd || this._rrStr)) {
            const lineY = this._rrUnd ? y + h - 2 : null, strY = this._rrStr ? y + Math.floor(h / 2) : null;
            for (const ly of [lineY, strY]) {
                if (ly === null) continue;
                b.fillRect(textState.x, ly, advance, 1, b.textColor);
                b.paintOpacity = 64;
                b.fillRect(textState.x, ly + 1, advance, 1, b.textColor);
                b.paintOpacity = 255;
            }
        }
        textState.x += advance;
    };

    const characterOf = (id) => {
        id = Number(id);
        if (id === 9999) return $gamePlayer;
        if (id === 0) return $gameMap.event($gameMessage._rrEventId);
        return $gameMap.event(id);
    };
    const _processEscape = Window_Message.prototype.processEscapeCharacter;
    Window_Message.prototype.processEscapeCharacter = function(code, textState) {
        if (!textState.rrMessage || (!code.startsWith('RR') && code !== '$') || code === 'RRFACE') return _processEscape.call(this, code, textState);
        const a = code === '$' ? [] : takeParam(textState);
        const n = (i) => Number(a[i]) || 0;
        switch (code) {
            case '$':
                if (this._goldWindow) { this._goldWindow.refresh(); this._goldWindow.open(); }
                break;
            case 'RRIC':
                if (textState.drawing) this.drawIcon(n(0), textState.x, textState.y + Math.floor(textState.height / 2) - ICON / 2);
                textState.x += ICON;
                break;
            case 'RRA': { const ch = characterOf(n(0)); if (ch && n(1) > 0) $gameTemp.requestAnimation([ch], n(1)); break; }
            case 'RRU': { const ch = characterOf(n(0)); if (ch && n(1) > 0) $gameTemp.requestBalloon(ch, n(1)); break; }
            case 'RREDGE': this._rrEdge = !this._rrEdge; break;
            case 'RRFS': this._rrFontRuby = n(0); break;
            case 'RRFSD': this._rrFontRuby = C.fontSize; break;
            case 'RRB': if (this._rrBold) this._rrBoldOff = true; this._rrBold = !this._rrBold; break;
            case 'RRI': if (this._rrItalic) this._rrItalicOff = true; this._rrItalic = !this._rrItalic; break;
            case 'RRCE': this._rrEdgeColor = n(0); break;
            case 'RRUND': this._rrUnd = !this._rrUnd; break;
            case 'RRSTR': this._rrStr = !this._rrStr; break;
            case 'RRSPIX': textState.x += n(0); break;
            case 'RRW': this._waitCount = n(0); break;
            case 'RRS': this._rrTextSpeed = n(0); break;
            case 'RRSH': this._rrShakePower = n(0); this._rrShakeSpeed = n(1); this._rrShakeDuration = n(2); break;
            case 'RRSW': {
                const id = n(0);
                $gameSwitches.setValue(id, n(1) === 2 ? !$gameSwitches.value(id) : n(1) === 1);
                $gameMap.requestRefresh();
                break;
            }
            case 'RRVA': $gameVariables.setValue(n(0), n(1)); $gameMap.requestRefresh(); break;
            case 'RRFC':
                if ($gameMessage.faceName() !== '' && a.length >= 2) this.rrSetFace(a.slice(0, -1).join(','), n(a.length - 1));
                break;
            case 'RRFCM': this._rrFace.scale.x = -this._rrFace.scale.x; break;
            default: break;   // RRNA RRAL RRFR RRFM RRSTOP RRMOVE RRPOP RRPP RRF RRFA RRFAL RRFLC: read at the start
        }
    };

    // -- input, speed, fade --

    /** update_show_fast: once a frame. Shift shows the rest at once, the confirm key while held. */
    Window_Message.prototype.rrUpdateShowFast = function() {
        if (sw(C.noSkipSwitch)) return;
        const dash = !sw(C.noDashSwitch);
        const shown = fades() && !inBattle() ? this._rrW : this.openness;
        if (this.pause || shown < 255) this._showFast = false;
        else if (Input.isTriggered('ok') || TouchInput.isTriggered() || (Input.isPressed('shift') && dash)) this._showFast = true;
        else if (!Input.isPressed('ok') && !TouchInput.isPressed()) this._showFast = false;
        if (this._showFast && this._waitCount > 0) this._waitCount = 0;
    };
    Window_Message.prototype.isTriggered = function() {
        return Input.isTriggered('cancel') || Input.isTriggered('ok') || TouchInput.isTriggered() || (Input.isPressed('shift') && !sw(C.noDashSwitch));
    };
    // Held cancel types a second character a frame (the double-speed setting a second always, cancel two more).
    const _updateMessage = Window_Message.prototype.updateMessage;
    Window_Message.prototype.updateMessage = function() {
        const result = _updateMessage.call(this);
        if (!result) return result;
        const fast = !sw(C.noSkipSwitch) && !sw(C.noDoubleSwitch) && Input.isPressed('cancel');
        const extra = C.autoFast ? [true, fast, fast] : [fast];
        for (const go of extra) if (go && this._waitCount <= 0 && this._textState) _updateMessage.call(this);
        return result;
    };

    Window_Message.prototype.open = function() {
        if (inBattle()) { this.openness = 255; this._rrW = 255; return; }
        if (!fades()) { if (this.openness < 255) this._rrOpening = true; this._rrClosing = false; return; }
        this.openness = 255;
        if (this._rrW < 255) this._rrOpening = true;
        this._rrClosing = false;
    };
    Window_Message.prototype.close = function() {
        if (inBattle()) return;
        const shown = fades() ? this._rrW : this.openness;
        if (shown > 0) this._rrClosing = true;
        this._rrOpening = false;
    };
    Window_Message.prototype.isOpening = function() { return this._rrOpening; };
    Window_Message.prototype.isClosing = function() { return this._rrClosing; };
    Window_Message.prototype.updateOpen = function() {
        if (!this._rrOpening) return;
        if (fades()) { this._rrW = Math.min(255, this._rrW + C.fadeSpeed); if (this._rrW >= 255) this._rrOpening = false; }
        else { this.openness += 48; if (this.openness >= 255) this._rrOpening = false; }
    };
    Window_Message.prototype.updateClose = function() {
        if (this._rrOpening || !this._rrClosing) return;
        if (fades()) { this._rrW = Math.max(0, this._rrW - C.fadeSpeed); if (this._rrW <= 0) this._rrClosing = false; }
        else { this.openness -= 48; if (this.openness <= 0) this._rrClosing = false; }
    };

    const _terminateMessage = Window_Message.prototype.terminateMessage;
    Window_Message.prototype.terminateMessage = function() {
        _terminateMessage.call(this);
        this.pause = false;
        $gameMessage._rrMapStop = false;
        if (inBattle()) {
            this.rrSetFace('', 0);
            this._rrNameSprite.bitmap = null;
            this._rrNameBack.visible = false;
            if (this.contents) this.contents.clear();
        }
    };

    // -- every frame: fade, the parts that follow the window, the battle band --

    const _wmUpdate = Window_Message.prototype.update;
    Window_Message.prototype.update = function() {
        this.rrUpdateShowFast();
        _wmUpdate.call(this);
        if (inBattle()) { this.openness = 255; this._rrW = 255; }
        this.rrUpdateShake();
        this.rrUpdateParts();
        // Idle and faded out: \MOVE's switch goes off again.
        if (!this._rrOpening && !this._rrClosing && !$gameMessage.isBusy() && (fades() ? this._rrW : this.openness) === 0) {
            $gameMessage._rrMesMove = false;
            if (C.moveSwitch > 0 && $gameSwitches.value(C.moveSwitch)) { $gameSwitches.setValue(C.moveSwitch, false); $gameMap.requestRefresh(); }
        }
    };

    Window_Message.prototype.rrUpdateParts = function() {
        const battle = inBattle();
        const w = fades() || battle ? this._rrW : 255;
        const frame = battle && C.battleMode === 1 ? 0 : (this._rrBg === 0 ? w : 0);
        this.opacity = 0;
        this.contentsOpacity = w;
        // The slim window: the frame and back, inset.
        const [insetW, insetH] = battle ? [0, 0] : C.slimSize;
        if (this._rrSlim) {
            const s = this._rrSlim;
            const tw = Math.max(0, this.width - insetW), th = Math.max(0, this.height - insetH);
            if (s.width !== tw || s.height !== th) s.move(Math.floor(insetW / 2), Math.floor(insetH / 2), tw, th);
            s.x = Math.floor(insetW / 2);
            s.y = Math.floor(insetH / 2);
            s.update();
            s.opacity = frame;
        }
        // MessageBack, centred on the window.
        const back = this._rrBack;
        back.visible = this._rrBg === 1 && !!back.bitmap && back.bitmap.isReady();
        if (back.visible) {
            back.opacity = fades() || battle ? w : this.openness;
            back.x = Math.floor(this.width / 2) - Math.floor(back.bitmap.width / 2);
            back.y = Math.floor(this.height / 2) - Math.floor(back.bitmap.height / 2);
        }
        // The name window, its name and the face strip above the window (below it at the top).
        const nameY = (this._rrPos === 0 ? C.nameOffset[1] + 133 : C.nameOffset[1] - 5);
        const nb = this._rrNameBack;
        nb.x = C.nameOffset[0];
        nb.y = nameY;
        nb.opacity = Math.round(frame * (C.nameOpacity / 100) * (200 / 255));
        const ns = this._rrNameSprite;
        if (ns.bitmap) {
            ns.x = C.nameOffset[0] + Math.floor(this._rrNameW / 2) + (this._rrHasFace ? 48 : 0) - Math.floor(ns.bitmap.width / 2) + ns.bitmap.width / 2;
            ns.y = nameY + Math.floor(this._rrNameH / 2) - Math.floor(ns.bitmap.height / 2) + ns.bitmap.height / 2;
        }
        ns.visible = !!ns.bitmap;
        ns.opacity = w;
        const f = this._rrFace, [fw] = C.faceSize;
        f.visible = !this._rrNoFace && !!f.bitmap;
        f.x = this._rrFaceLR === 0 ? 16 + Math.floor(fw / 2) + C.faceOffset[0] : this.width - 16 - Math.floor(fw / 2) + C.faceOffset[0];
        f.y = nameY + 15;
        f.opacity = w;
        // The pause sign (the window skin's four frames).
        const p = this._rrPause;
        p.visible = this.pause && this.isOpen();
        if (p.visible) {
            if (p.bitmap !== this.windowskin) p.bitmap = this.windowskin;
            if (--this._rrPauseWait <= 0) { this._rrPauseWait = C.pauseSpeed; this._rrPauseCount = (this._rrPauseCount + 1) % 4; }
            const k = this._rrPauseCount;
            p.setFrame(148 + (k % 2) * 24, 100 + Math.floor(k / 2) * 24, 16, 16);
            if (C.pausePlace === 2) { p.x = this._rrPsx + 8; p.y = this._rrContentsY + 8; }
            else {
                p.x = (C.pausePlace === 0 ? Math.floor(this.width / 2) - 12 : this.width - 12) + C.pauseOffset[0] + 8;
                p.y = this.height - 12 + C.pauseOffset[1] + 8;
            }
        } else { this._rrPauseCount = 0; this._rrPauseWait = C.pauseSpeed; }
        // STR11b's band behind battle messages.
        if (this._rrBand) {
            const band = this._rrBand;
            const showing = battle && C.battleMode === 1 && (this._textState || this.pause || (this._choiceListWindow && this._choiceListWindow.active));
            band.x = -this.x;
            band.y = -this.y;
            band.visible = battle;
            if (showing) {
                band.opacity = Math.min(255, band.opacity + C.band.step);
                const target = 16 + 4 * 24, h = band.height;
                const height = C.band.move === false ? 112 : C.band.speed <= 1 ? target : Math.floor((h + target * (C.band.speed - 1)) / C.band.speed);
                band.setFrame(0, 0, C.band.width, height);
            } else band.opacity = Math.max(0, band.opacity - C.band.step);
        }
    };

    // \SH: the window moves by the shake each time it is placed again (each line), as the script's did.
    Window_Message.prototype.rrShakeReset = function() {
        this._rrShake = this._rrShakePower = this._rrShakeSpeed = this._rrShakeDuration = 0;
        this._rrShakeDir = 1;
    };
    Window_Message.prototype.rrUpdateShake = function() {
        if (this._rrShakeDuration >= 1 || this._rrShake !== 0) {
            const delta = (this._rrShakePower * this._rrShakeSpeed * this._rrShakeDir) / 10;
            if (this._rrShakeDuration <= 1 && this._rrShake * (this._rrShake + delta) < 0) this._rrShake = 0;
            else this._rrShake += delta;
            if (this._rrShake > this._rrShakePower * 2) this._rrShakeDir = -1;
            if (this._rrShake < -this._rrShakePower * 2) this._rrShakeDir = 1;
            if (this._rrShakeDuration >= 1) this._rrShakeDuration--;
        }
    };
    Window_Message.prototype.rrApplyShake = function() {
        if (this._rrShake) this.x += Math.trunc(this._rrShake);
    };

    // ---- choices: lines of the message; the list window only holds the cursor -----------------------

    const choiceInMessage = (win) => !!(win && win._messageWindow && win._messageWindow._rrTops);
    const _choiceUpdatePlacement = Window_ChoiceList.prototype.updatePlacement;
    Window_ChoiceList.prototype.updatePlacement = function() {
        if (!choiceInMessage(this)) return _choiceUpdatePlacement.call(this);
        const mw = this._messageWindow;
        const start = mw._rrChoiceStart || 0;
        const top = mw._rrTops[start] !== undefined ? mw._rrTops[start] : start * LH;
        this.width = mw.width;
        this.height = $gameMessage.choices().length * LH + 32;
        this.x = mw.x;
        this.y = mw.y + top;
    };
    const _choiceUpdateBackground = Window_ChoiceList.prototype.updateBackground;
    Window_ChoiceList.prototype.updateBackground = function() {
        if (!choiceInMessage(this)) return _choiceUpdateBackground.call(this);
        this._background = 2;
        this.setBackgroundType(2);
    };
    const _choiceItemRect = Window_ChoiceList.prototype.itemRect;
    Window_ChoiceList.prototype.itemRect = function(index) {
        if (!choiceInMessage(this)) return _choiceItemRect.call(this, index);
        return new Rectangle(0, index * LH - this.scrollBaseY(), this.innerWidth, LH);
    };
    const _choiceDrawItem = Window_ChoiceList.prototype.drawItem;
    Window_ChoiceList.prototype.drawItem = function(index) {
        if (!choiceInMessage(this)) _choiceDrawItem.call(this, index);
    };
    const _choiceOpen = Window_ChoiceList.prototype.open;
    Window_ChoiceList.prototype.open = function() {
        if (!choiceInMessage(this)) return _choiceOpen.call(this);
        this._opening = this._closing = false;
        this.openness = 255;
    };
    const _choiceClose = Window_ChoiceList.prototype.close;
    Window_ChoiceList.prototype.close = function() {
        if (!choiceInMessage(this)) return _choiceClose.call(this);
        this._opening = this._closing = false;
        this.openness = 0;
    };

    // ---- the number input: frameless, its digits in the message's empty line ------------------------

    const numberInMessage = (win) => !!(win && win._messageWindow && win._messageWindow._rrTops);
    const _numberPlacement = Window_NumberInput.prototype.updatePlacement;
    Window_NumberInput.prototype.updatePlacement = function() {
        if (!numberInMessage(this)) return _numberPlacement.call(this);
        const mw = this._messageWindow;
        this.width = 544;
        this.height = 64;
        this.x = mw.x + (mw._rrFaceLR === 0 && $gameMessage.faceName() !== '' ? C.faceSize[0] + C.faceSpace : 0);
        this.y = mw.y + mw._rrContentsY - 24;
        this.opacity = 0;
    };
    const _numberItemRect = Window_NumberInput.prototype.itemRect;
    Window_NumberInput.prototype.itemRect = function(index) {
        if (!numberInMessage(this)) return _numberItemRect.call(this, index);
        return new Rectangle(24 + index * 16, 0, 16, LH);
    };
    const _numberDrawItem = Window_NumberInput.prototype.drawItem;
    Window_NumberInput.prototype.drawItem = function(index) {
        if (!numberInMessage(this)) return _numberDrawItem.call(this, index);
        const rect = this.itemRect(index);
        const digit = this._number.padZero(this._maxDigits).slice(index, index + 1);
        this.resetTextColor();
        this.drawText(digit, rect.x, rect.y, rect.width, 'center');
    };
    const _numberOpen = Window_NumberInput.prototype.open;
    Window_NumberInput.prototype.open = function() {
        if (!numberInMessage(this)) return _numberOpen.call(this);
        this._opening = this._closing = false;
        this.openness = 255;
    };
    const _numberClose = Window_NumberInput.prototype.close;
    Window_NumberInput.prototype.close = function() {
        if (!numberInMessage(this)) return _numberClose.call(this);
        this._opening = this._closing = false;
        this.openness = 0;
    };
})();
