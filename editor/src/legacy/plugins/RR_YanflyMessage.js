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
 * draw in their own font. The name box and text codes are converted by the
 * import itself.
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
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyMessage');
    const ROWS_VARIABLE = Number(params.rowsVariable) || 0;
    const WIDTH_VARIABLE = Number(params.widthVariable) || 0;
    const FACE_INDENT = params.faceIndent === undefined || params.faceIndent === '' ? 112 : Number(params.faceIndent);
    const FONT_FACE = String(params.fontFace || '');
    const FONT_SIZE = Number(params.fontSize) || 0;
    const BOLD = String(params.bold) === 'true';
    const ITALIC = String(params.italic) === 'true';

    const variable = (id) => (id > 0 && $gameVariables ? Number($gameVariables.value(id)) || 0 : 0);
    const messageRows = () => (variable(ROWS_VARIABLE) > 0 ? variable(ROWS_VARIABLE) : 4);
    const messageWidth = () => (variable(WIDTH_VARIABLE) > 0 ? variable(WIDTH_VARIABLE) : Graphics.boxWidth);

    Game_Interpreter.prototype.command101 = function(params) {
        if ($gameMessage.isBusy()) return false;
        $gameMessage.setFaceImage(params[0], params[1]);
        $gameMessage.setBackground(params[2]);
        $gameMessage.setPositionType(params[3]);
        $gameMessage.setSpeakerName(params[4]);
        const rows = messageRows();
        // Past four rows, the next Show Text continues this window: its lines join, its settings do not.
        const continues = () => this.nextEventCode() === 401 || (this.nextEventCode() === 101 && rows > 4);
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

    Window_Message.prototype.rrAdjustSize = function() {
        const width = messageWidth();
        const height = this.fittingHeight(messageRows());
        if (width !== this.width || height !== this.height) {
            this.move(this.x, this.y, width, height);
            this.createContents();
        }
        this.updatePlacement();
        this.x = (Graphics.boxWidth - this.width) / 2;
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

    const _resetFontSettings = Window_Message.prototype.resetFontSettings;
    Window_Message.prototype.resetFontSettings = function() {
        _resetFontSettings.call(this);
        if (FONT_FACE) this.contents.fontFace = FONT_FACE;
        if (FONT_SIZE > 0) this.contents.fontSize = FONT_SIZE;
        this.contents.fontBold = BOLD;
        this.contents.fontItalic = ITALIC;
    };
})();
