/*:
 * @target MZ
 * @plugindesc Simple Message Busts (VX Ace), for imported games
 * @author Hollow; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_HollowMessageBusts.js
 *
 * A Show Text whose face file name contains the bust symbol (§ by default)
 * shows that picture from img/faces whole, standing on the bottom of the
 * screen above the message window, instead of a face inside it.
 *
 * Left layout (the script as published): the bust stands at the left, moved
 * by the bust offset, and the text is indented by the bust indent.
 * Right layout (a game's edit): the message window is narrower by the right
 * width and sits at the left, the bust stands in the space at its right, and
 * the text is not indented.
 *
 * One file per character (a game's edit): the face name's trailing number (or
 * "S" and a number) is replaced by 1, so §Idris3 shows §Idris1.
 *
 * No script calls. Installed by File › Import Project… when the imported game
 * carried the original script; its settings were read from the game's copy.
 *
 * @param symbol
 * @text Bust symbol
 * @default §
 *
 * @param indent
 * @text Text indent beside a bust (left layout)
 * @type number
 * @default 155
 *
 * @param offset
 * @text Bust x offset (left layout)
 * @type number
 * @min -9999
 * @default -90
 *
 * @param rightWidth
 * @text Right layout width
 * @desc 0 for the left layout.
 * @type number
 * @default 0
 *
 * @param singleFile
 * @text One file per character
 * @type boolean
 * @default false
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_HollowMessageBusts');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const SYMBOL = String(params.symbol || '§');
    const INDENT = num(params.indent, 155);
    const OFFSET = num(params.offset, -90);
    const RIGHT = num(params.rightWidth, 0);
    const SINGLE_FILE = String(params.singleFile) === 'true';

    const isBust = () => $gameMessage.faceName().includes(SYMBOL);
    const fileOf = (name) => {
        if (!SINGLE_FILE) return name;
        if (/S\d+$/.test(name)) name = name.slice(0, -2);
        if (/\d+$/.test(name)) name = name.slice(0, -1);
        return name + '1';
    };
    const bustFile = () => fileOf($gameMessage.faceName());

    // An event's Show Text faces load ahead: a bust loads its own file (the others may not exist).
    const _loadImages = Game_Interpreter.prototype.loadImages;
    Game_Interpreter.prototype.loadImages = function() {
        const list = this._list;
        this._list = (list || []).map(c => (c && c.code === 101 && String(c.parameters[0] || '').includes(SYMBOL)
            ? Object.assign({}, c, { parameters: [fileOf(String(c.parameters[0]))].concat(c.parameters.slice(1)) }) : c));
        try { _loadImages.call(this); } finally { this._list = list; }
    };

    // The bust stands over every window, as its sprite sat 1000 above the message window.
    const _createAllWindows = Scene_Message.prototype.createAllWindows;
    Scene_Message.prototype.createAllWindows = function() {
        _createAllWindows.call(this);
        const bust = new Sprite();
        bust.visible = false;
        this.addChild(bust);
        this._messageWindow._rrBust = bust;
    };

    const _update = Window_Message.prototype.update;
    Window_Message.prototype.update = function() {
        _update.call(this);
        this.rrUpdateBust();
    };
    Window_Message.prototype.rrUpdateBust = function() {
        const bust = this._rrBust;
        if (!bust || this.openness <= 0) return;
        if (isBust()) {
            const file = bustFile();
            if (bust._rrFile !== file) {
                bust._rrFile = file;
                bust.bitmap = ImageManager.loadFace(file);
            }
            bust.visible = true;
            bust.x = RIGHT > 0 ? Graphics.boxWidth - RIGHT : OFFSET;
            bust.y = Graphics.boxHeight - (bust.bitmap && bust.bitmap.isReady() ? bust.bitmap.height : 0);
        } else {
            bust.visible = false;
            bust.bitmap = null;
            bust._rrFile = null;
        }
    };

    const _newLineX = Window_Message.prototype.newLineX;
    Window_Message.prototype.newLineX = function(textState) {
        if (!isBust()) return _newLineX.call(this, textState);
        const margin = RIGHT > 0 ? 0 : INDENT;
        return textState.rtl ? this.innerWidth - margin : margin;
    };
    const _drawMessageFace = Window_Message.prototype.drawMessageFace;
    Window_Message.prototype.drawMessageFace = function() {
        if (!isBust()) _drawMessageFace.call(this);
    };
    const _loadMessageFace = Window_Message.prototype.loadMessageFace;
    Window_Message.prototype.loadMessageFace = function() {
        if (isBust()) this._faceBitmap = null;
        else _loadMessageFace.call(this);
    };

    // Right layout: the window gives up the bust's width and sits at the left.
    if (RIGHT > 0) {
        const _messageWidth = Window_Message.prototype.rrMessageWidth;
        Window_Message.prototype.rrMessageWidth = function() {
            if (isBust()) return Graphics.boxWidth - RIGHT;
            return _messageWidth ? _messageWidth.call(this) : Graphics.boxWidth;
        };
        const _messageX = Window_Message.prototype.rrMessageX;
        Window_Message.prototype.rrMessageX = function() {
            if (isBust()) return 0;
            return _messageX ? _messageX.call(this) : (Graphics.boxWidth - this.width) / 2;
        };
        // Without Yanfly's resizing, the window is sized here at each page.
        if (!Window_Message.prototype.rrAdjustSize) {
            const _newPage = Window_Message.prototype.newPage;
            Window_Message.prototype.newPage = function(textState) {
                const width = this.rrMessageWidth();
                if (width !== this.width) { this.move(this.x, this.y, width, this.height); this.createContents(); }
                this.x = this.rrMessageX();
                _newPage.call(this, textState);
            };
        }
    }
})();
