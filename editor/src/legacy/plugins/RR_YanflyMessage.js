/*:
 * @target MZ
 * @plugindesc Ace Message System window and font (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyMessage.js
 *
 * The message window of Yanfly's Ace Message System: as many rows as a game
 * variable says (4 when it is 0), as wide as another variable says (the
 * screen when it is 0), resized at each new page and centred. With more than
 * four rows, messages that follow one another fill the same window. Messages
 * draw in their own font, and holding the skip button shows the text at once.
 *
 * Yanfly's text codes: \NI[n] \NW[n] \NA[n] \NS[n] \NT[n] \NC[n] names, and
 * \II[n] \IW[n] \IA[n] \IS[n] \IT[n] icons with names, of database entries;
 * \AC[n] and \AN[n] an actor's class and nickname (0 or less: a party member);
 * \FB \FI \FO toggle bold, italic and outline, \FR resets the font; \FZ[n]
 * sets its size, \FN[name] its face; \OC[n] and \OO[n] the outline colour
 * and opacity; \PIC[name] draws a picture; \W[n] waits n frames.
 *
 * The name window: \n<Name> (also \n1<> to \n5<>, \nc<> and \nr<>) anywhere in
 * a message shows Name in a window of its own over the message, at the left,
 * 3/10, centre, 7/10 or right of it, in the message font and the name colour.
 * The import moves names it can see into the message's speaker name; names a
 * game only puts together while it runs are read here.
 *
 * Script calls: RRYanflyMessage.rows() and RRYanflyMessage.width() are the
 * message window's rows and width (Variable.message_rows / message_width).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param rowsVariable
 * @text Rows variable
 * @type variable
 * @default 0
 *
 * @param widthVariable
 * @text Width variable
 * @type variable
 * @default 0
 *
 * @param defaultRows
 * @text Rows when the variable is 0
 * @type number
 * @default 4
 *
 * @param rowsAlsoDefault
 * @text Values that also mean the default rows
 * @desc Comma-separated, e.g. 4.
 * @default
 *
 * @param continueAbove
 * @text Join following messages above this many rows
 * @type number
 * @default 4
 *
 * @param faceIndent
 * @text Text indent beside a face
 * @type number
 * @default 112
 *
 * @param fontFace
 * @text Message font (CSS family)
 * @default
 * @desc Blank uses the game's font.
 *
 * @param fontSize
 * @text Message font size (px)
 * @type number
 * @decimals 1
 * @default 0
 * @desc 0 uses the game's size.
 *
 * @param bold
 * @text Bold
 * @type boolean
 * @default false
 *
 * @param italic
 * @text Italic
 * @type boolean
 * @default false
 *
 * @param outline
 * @text Outline
 * @type boolean
 * @default true
 *
 * @param textSkip
 * @text Show-text-at-once button (held)
 * @desc An input name (shift, control …); blank for none.
 * @default
 *
 * @param nameWindow
 * @text Name window
 * @type boolean
 * @default false
 *
 * @param nameXBuffer
 * @text Name window X buffer
 * @type number
 * @min -9999
 * @default -20
 *
 * @param nameYBuffer
 * @text Name window Y buffer
 * @type number
 * @min -9999
 * @default 0
 *
 * @param namePadding
 * @text Name window extra width (each side)
 * @type number
 * @default 0
 *
 * @param nameColour
 * @text Name text colour
 * @type number
 * @default 6
 *
 * @param nameLeftBuffer
 * @text X buffer also at the left
 * @type boolean
 * @default true
 *
 * @param nameTextX
 * @text Name text x in its window
 * @type number
 * @default 0
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyMessage');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const ROWS_VARIABLE = num(params.rowsVariable, 0);
    const WIDTH_VARIABLE = num(params.widthVariable, 0);
    const DEFAULT_ROWS = num(params.defaultRows, 4);
    const ALSO_DEFAULT = String(params.rowsAlsoDefault || '').split(',').filter(s => s.trim() !== '').map(Number);
    const CONTINUE_ABOVE = num(params.continueAbove, 4);
    const FACE_INDENT = num(params.faceIndent, 112);
    const FONT_FACE = String(params.fontFace || '');
    const FONT_SIZE = Number(params.fontSize) || 0;
    const BOLD = String(params.bold) === 'true';
    const ITALIC = String(params.italic) === 'true';
    const OUTLINE = String(params.outline) !== 'false';
    const TEXT_SKIP = String(params.textSkip || '');
    const NAME_WINDOW = String(params.nameWindow) === 'true';
    const NAME_X = num(params.nameXBuffer, -20);
    const NAME_Y = num(params.nameYBuffer, 0);
    const NAME_PADDING = num(params.namePadding, 0);
    const NAME_COLOUR = num(params.nameColour, 6);
    const NAME_LEFT_BUFFER = String(params.nameLeftBuffer) !== 'false';
    const NAME_TEXT_X = num(params.nameTextX, 0);

    const variable = (id) => (id > 0 && typeof $gameVariables !== 'undefined' && $gameVariables ? Number($gameVariables.value(id)) || 0 : 0);
    const messageRows = () => {
        const v = variable(ROWS_VARIABLE);
        return ROWS_VARIABLE <= 0 || v <= 0 || ALSO_DEFAULT.includes(v) ? DEFAULT_ROWS : v;
    };
    const messageWidth = () => (variable(WIDTH_VARIABLE) > 0 ? variable(WIDTH_VARIABLE) : Graphics.boxWidth);
    if (typeof window !== 'undefined') window.RRYanflyMessage = { rows: messageRows, width: messageWidth };

    Game_Interpreter.prototype.command101 = function(params) {
        if ($gameMessage.isBusy()) return false;
        $gameMessage.setFaceImage(params[0], params[1]);
        $gameMessage.setBackground(params[2]);
        $gameMessage.setPositionType(params[3]);
        $gameMessage.setSpeakerName(params[4]);
        const rows = messageRows();
        // Past the default rows, the next Show Text continues this window: its lines join, its settings do not.
        const continues = () => this.nextEventCode() === 401 || (this.nextEventCode() === 101 && rows > CONTINUE_ABOVE);
        while (continues()) {
            this._index++;
            const command = this.currentCommand();
            if (command.code === 401) $gameMessage.add(command.parameters[0]);
            if ($gameMessage._texts.length >= rows) break;
        }
        switch (this.nextEventCode()) {
            case 102: this._index++; this.setupChoices(this.currentCommand().parameters); break;
            case 103: this._index++; this.setupNumInput(this.currentCommand().parameters); break;
            case 104: this._index++; this.setupItemChoice(this.currentCommand().parameters); break;
        }
        this.setWaitMode('message');
        return true;
    };

    Window_Message.prototype.rrMessageWidth = function() { return messageWidth(); };
    Window_Message.prototype.rrMessageX = function() { return (Graphics.boxWidth - this.width) / 2; };
    Window_Message.prototype.rrAdjustSize = function() {
        const width = this.rrMessageWidth();
        const height = this.fittingHeight(messageRows());
        if (width !== this.width || height !== this.height) {
            this.move(this.x, this.y, width, height);
            this.createContents();
        }
        this.updatePlacement();
        this.x = this.rrMessageX();
    };

    const _newPage = Window_Message.prototype.newPage;
    Window_Message.prototype.newPage = function(textState) {
        this.rrAdjustSize();
        _newPage.call(this, textState);
    };

    Window_Message.prototype.newLineX = function(textState) {
        const margin = $gameMessage.faceName() !== '' ? FACE_INDENT : 0;
        return textState.rtl ? this.innerWidth - margin : margin;
    };

    // The message font, in the message window and (with the name window) the name box.
    const messageFont = (contents) => {
        if (FONT_FACE) contents.fontFace = FONT_FACE;
        if (FONT_SIZE > 0) contents.fontSize = FONT_SIZE;
        contents.fontBold = BOLD;
        contents.fontItalic = ITALIC;
        if (!OUTLINE) contents.outlineWidth = 0;
    };
    const _resetFontSettings = Window_Message.prototype.resetFontSettings;
    Window_Message.prototype.resetFontSettings = function() {
        _resetFontSettings.call(this);
        messageFont(this.contents);
    };

    // Holding the skip button shows the rest of the page at once.
    const _updateShowFast = Window_Message.prototype.updateShowFast;
    Window_Message.prototype.updateShowFast = function() {
        _updateShowFast.call(this);
        if (TEXT_SKIP && Input.isPressed(TEXT_SKIP)) this._showFast = true;
    };

    // Yanfly's text codes, in every window: names and icons of database entries, an actor's class and
    // nickname, font toggles and sizes, outline colours, a picture, and (in messages) \W[n] frames of wait.
    if (typeof Window_Base !== 'undefined') {
        const lookup = (text) => (typeof window !== 'undefined' && window.RRKeyedText ? window.RRKeyedText.resolve(String(text ?? '')) : String(text ?? ''));
        const actorOf = (id) => {
            const n = Number(id);
            const actor = n <= 0 ? $gameParty.members()[Math.abs(n)] : $gameActors.actor(n);
            return actor || null;
        };
        const TABLES = { C: () => $dataClasses, I: () => $dataItems, W: () => $dataWeapons, A: () => $dataArmors, S: () => $dataSkills, T: () => $dataStates };
        const _convert = Window_Base.prototype.convertEscapeCharacters;
        Window_Base.prototype.convertEscapeCharacters = function(text) {
            let result = _convert.call(this, text);
            result = result.replace(/\x1bFR/gi, '\x1bAMSF[0]').replace(/\x1bFB/gi, '\x1bAMSF[1]').replace(/\x1bFI/gi, '\x1bAMSF[2]')
                .replace(/\x1bFO/gi, '\x1bAMSF[3]').replace(/\x1bFS(?!\[)/gi, '\x1bAMSF[4]');
            result = result.replace(/\x1bAC\[([-+]?\d+)\]/gi, (m, id) => { const a = actorOf(id); return a && a.currentClass() ? a.currentClass().name : ''; });
            result = result.replace(/\x1bAS\[([-+]?\d+)\]/gi, '');
            result = result.replace(/\x1bAN\[([-+]?\d+)\]/gi, (m, id) => { const a = actorOf(id); return a ? a.nickname() : ''; });
            result = result.replace(/\x1bN([CIWAST])\[(\d+)\]/gi, (m, kind, id) => { const r = TABLES[kind.toUpperCase()]()[Number(id)]; return r ? lookup(r.name) : ''; });
            // \IC (a class's icon) needs Yanfly's Class System, which a game without it never drew.
            result = result.replace(/\x1bI([CIWAST])\[(\d+)\]/gi, (m, kind, id) => {
                if (kind.toUpperCase() === 'C') return '';
                const r = TABLES[kind.toUpperCase()]()[Number(id)];
                return r ? '\x1bI[' + r.iconIndex + ']' + lookup(r.name) : '';
            });
            return result;
        };
        const bracket = (textState) => {
            const m = /^\[(.*?)\]/.exec(textState.text.slice(textState.index));
            if (!m) return '';
            textState.index += m[0].length;
            return m[1];
        };
        const fontScale = () => {
            const step = typeof $dataSystem !== 'undefined' && $dataSystem && $dataSystem.advanced && $dataSystem.advanced.fontSizeStep;
            return typeof step === 'number' && step > 0 ? step / 8 : 1;
        };
        const _processEscape = Window_Base.prototype.processEscapeCharacter;
        Window_Base.prototype.processEscapeCharacter = function(code, textState) {
            switch (code) {
                case 'FZ': this.contents.fontSize = Math.round(Number(this.obtainEscapeParam(textState)) * fontScale() * 10) / 10; return;
                case 'FN': { const name = bracket(textState); this.contents.fontFace = name || $gameSystem.mainFontFace(); return; }
                case 'OC': this.contents.outlineColor = ColorManager.textColor(this.obtainEscapeParam(textState)); return;
                case 'OO': { const alpha = Number(this.obtainEscapeParam(textState)) / 255; this.contents.outlineColor = 'rgba(0, 0, 0, ' + alpha + ')'; return; }
                case 'AMSF':
                    switch (Number(this.obtainEscapeParam(textState))) {
                        case 0: this.resetFontSettings(); break;
                        case 1: this.contents.fontBold = !this.contents.fontBold; break;
                        case 2: this.contents.fontItalic = !this.contents.fontItalic; break;
                        case 3: this.contents.outlineWidth = this.contents.outlineWidth > 0 ? 0 : (($dataSystem.advanced || {}).textOutlineWidth ?? 3); break;
                    }
                    return;
                case 'PIC': {
                    const bitmap = ImageManager.loadPicture(bracket(textState));
                    if (textState.drawing) {
                        const draw = () => this.contents && this.contents.blt(bitmap, 0, 0, bitmap.width, bitmap.height, textState.x, textState.y);
                        if (bitmap.isReady()) draw(); else bitmap.addLoadListener(draw);
                    }
                    return;
                }
            }
            _processEscape.call(this, code, textState);
        };
        if (typeof Window_Message !== 'undefined') {
            const _messageEscape = Window_Message.prototype.processEscapeCharacter;
            Window_Message.prototype.processEscapeCharacter = function(code, textState) {
                if (code === 'W') this.startWait(Number(this.obtainEscapeParam(textState)) || 0);
                else _messageEscape.call(this, code, textState);
            };
        }
    }

    if (!NAME_WINDOW || typeof Window_NameBox === 'undefined') return;

    // \n<Name> … \nr<Name>: the codes run in this order and the last one found names the window.
    const NAME_CODES = [['N', 1], ['N1', 1], ['N2', 2], ['NC', 3], ['N3', 3], ['N4', 4], ['N5', 5], ['NR', 5]];
    Window_Message.prototype.convertEscapeCharacters = function(text) {
        let result = Window_Base.prototype.convertEscapeCharacters.call(this, text);
        for (const [code, position] of NAME_CODES) {
            result = result.replace(new RegExp('\\x1b' + code + '<(.+?)>', 'gi'), (m, name) => {
                $gameMessage.setSpeakerName(name);
                $gameMessage._rrNamePosition = position;
                return '';
            });
        }
        return result;
    };
    const _clear = Game_Message.prototype.clear;
    Game_Message.prototype.clear = function() {
        _clear.call(this);
        this._rrNamePosition = 1;
    };

    Window_NameBox.prototype.resetFontSettings = function() {
        Window_Base.prototype.resetFontSettings.call(this);
        messageFont(this.contents);
    };
    Window_NameBox.prototype.windowWidth = function() {
        if (!this._name) return 0;
        return Math.min(Math.ceil(this.textSizeEx(this._name).width) + this.padding * 2 + NAME_PADDING * 2, Graphics.boxWidth);
    };
    Window_NameBox.prototype.windowHeight = function() {
        return this.fittingHeight(1);
    };
    Window_NameBox.prototype.refresh = function() {
        this.contents.clear();
        this.drawTextEx('\\C[' + NAME_COLOUR + ']' + this._name, NAME_TEXT_X, 0, this.innerWidth);
    };
    Window_NameBox.prototype.updatePlacement = function() {
        this.width = this.windowWidth();
        this.height = this.windowHeight();
        const mw = this._messageWindow;
        const position = ($gameMessage && $gameMessage._rrNamePosition) || 1;
        let x = mw.x;
        if (position === 1) x += NAME_LEFT_BUFFER ? NAME_X : 0;
        else if (position === 2) x += Math.floor(mw.width * 3 / 10) - Math.floor(this.width / 2);
        else if (position === 3) x += Math.floor(mw.width / 2) - Math.floor(this.width / 2);
        else if (position === 4) x += Math.floor(mw.width * 7 / 10) - Math.floor(this.width / 2);
        else x += mw.width - this.width - NAME_X;
        this.x = Math.max(Math.min(x, Graphics.boxWidth - this.width), 0);
        this.y = $gameMessage.positionType() === 0 ? mw.height - NAME_Y : mw.y - this.height + NAME_Y;
    };
    // The name window takes the message window's frame opacity, and no dimmed band of its own.
    Window_NameBox.prototype.updateBackground = function() {
        const mw = this._messageWindow;
        this.opacity = mw ? mw.opacity : 255;
        this.backOpacity = mw ? mw.backOpacity : this.backOpacity;
        this.hideBackgroundDimmer();
    };
})();
