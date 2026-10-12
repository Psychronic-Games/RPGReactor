/*:
 * @target MZ
 * @plugindesc Pinnacle's title screen (VX Ace), for imported games
 * @author Zoro (Pinnacle - The Five Kingdoms); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_PinnacleTitle.js
 *
 * The title of Pinnacle - The Five Kingdoms: New Game, Continue, Tutorial,
 * Settings and Exit in large serif letters with a black shadow above-left
 * and below-right, centred in the lower half of the screen over a window
 * all but invisible (a frameless skin, background at opacity 25); the
 * skin's cursor is a soft glow behind the chosen command. Continue is picked
 * first when there is a save.
 * Tutorial starts a new game on the tutorial map. Settings opens the game's
 * settings (H87 Options) when that port is on, else the engine's. Exit
 * closes the game.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param commands
 * @text Commands
 * @desc JSON: [[text, symbol], …] in order (symbols: new_game, continue, tutorial, options, shutdown); "" is the database's term.
 * @default [["[2","new_game"],["","continue"],["TUTORIAL","tutorial"],["[4","options"],["","shutdown"]]
 *
 * @param tutorialStart
 * @text Tutorial start
 * @desc JSON: [map id, x, y].
 * @default [43,1,1]
 *
 * @param windowskin
 * @text Window skin
 * @type file
 * @dir img/system
 * @default Empty
 *
 * @param backOpacity
 * @text Background opacity
 * @type number
 * @default 25
 *
 * @param fontFile
 * @text Font file
 * @desc The command font, in fonts/.
 * @default javatext.ttf
 *
 * @param fontSize
 * @text Font size
 * @desc In pixels (the script's size by RGSS's rule for the file).
 * @default 22
 *
 * @param baseline
 * @text Text baseline
 * @desc Pixels from a row's top to the commands' baseline (RGSS's placing of the font); 0 centres them.
 * @default 0
 *
 * @param itemHeight
 * @text Row height
 * @type number
 * @default 35
 *
 * @param shadowOffset
 * @text Shadow offset
 * @type number
 * @default 3
 */
(() => {
    'use strict';
    const P = PluginManager.parameters('RR_PinnacleTitle');
    const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
    const COMMANDS = json(P.commands, [['[2', 'new_game'], ['', 'continue'], ['TUTORIAL', 'tutorial'], ['[4', 'options'], ['', 'shutdown']]);
    const TUTORIAL = json(P.tutorialStart, [43, 1, 1]);
    const SKIN = P.windowskin === undefined ? 'Empty' : String(P.windowskin);
    const BACK = P.backOpacity === undefined || P.backOpacity === '' ? 25 : Number(P.backOpacity);
    const FONT_FILE = String(P.fontFile || '');
    const FONT_SIZE = Number(P.fontSize) || 22;
    const ROW = Number(P.itemHeight) || 35;
    const BASELINE = Number(P.baseline) || 0;
    const SHADOW = P.shadowOffset === undefined || P.shadowOffset === '' ? 3 : Number(P.shadowOffset);
    const FACE = 'rr-pinnacle-title';
    const SYMBOL = { new_game: 'newGame', continue: 'continue', tutorial: 'tutorial', options: 'options', shutdown: 'shutdown' };

    const _loadGameFonts = Scene_Boot.prototype.loadGameFonts;
    Scene_Boot.prototype.loadGameFonts = function() {
        _loadGameFonts.call(this);
        if (FONT_FILE) FontManager.load(FACE, FONT_FILE);
    };

    //-------------------------------------------------------------------------
    // The command window: half the screen wide, the lower half of it high
    //-------------------------------------------------------------------------
    Scene_Title.prototype.commandWindowRect = function() {
        const ww = Math.floor(Graphics.boxWidth / 2), wh = Math.floor(Graphics.boxHeight / 2);
        return new Rectangle(Math.floor(Graphics.boxWidth / 2 - ww / 2), Graphics.boxHeight - wh, ww, wh);
    };
    const _createCommandWindow = Scene_Title.prototype.createCommandWindow;
    Scene_Title.prototype.createCommandWindow = function() {
        _createCommandWindow.call(this);
        const w = this._commandWindow;
        w.setBackgroundType(0);
        w.backOpacity = BACK;
        w.setHandler('tutorial', this.rrPinnacleCommandTutorial.bind(this));
        w.setHandler('options', this.commandOptions.bind(this));
    };
    Scene_Title.prototype.rrPinnacleCommandTutorial = function() {
        DataManager.setupNewGame(TUTORIAL[0], TUTORIAL[1], TUTORIAL[2]);
        this._commandWindow.close();
        this.fadeOutAll();
        SceneManager.goto(Scene_Map);
    };
    Scene_Title.prototype.commandOptions = function() {
        this._commandWindow.close();
        SceneManager.push(typeof Scene_RRH87Options === 'function' ? Scene_RRH87Options : Scene_Options);
    };

    const T = Window_TitleCommand.prototype;
    T.loadWindowskin = function() {
        this.windowskin = ImageManager.rrAceWindowskin ? ImageManager.rrAceWindowskin(SKIN) : ImageManager.loadSystem(SKIN);
    };
    T.updateBackOpacity = function() { this.backOpacity = BACK; };
    T.makeCommandList = function() {
        for (const [text, symbol] of COMMANDS) {
            const s = SYMBOL[symbol] || symbol;
            if (s === 'shutdown' && !Utils.isNwjs()) continue;
            const term = { newGame: TextManager.newGame, continue: TextManager.continue_, options: TextManager.options, shutdown: $dataSystem.rrTitleShutdown || 'Shutdown' }[s];
            const name = text === '' ? term || '' : text;
            this.addCommand(name, s, s === 'continue' ? this.isContinueEnabled() : true);
        }
    };
    // Continue when there is a save, else the first command; the last pick is not remembered.
    T.selectLast = function() {
        if (this.isContinueEnabled()) this.selectSymbol('continue');
        else this.select(0);
    };
    T.itemHeight = function() { return ROW; };
    T.itemTextAlign = function() { return 'center'; };
    T.maxVisibleItems = function() { return 5; };
    T.drawItem = function(index) {
        const rect = this.itemRectWithPadding(index);
        const text = window.RRKeyedText ? RRKeyedText.resolve(this.commandName(index)) : this.commandName(index);
        const b = this.contents;
        // MZ puts the baseline at the row's middle plus 0.35 of the size; RGSS at the font's ascent.
        if (BASELINE) rect.y += BASELINE - (rect.height / 2 + FONT_SIZE * 0.35);
        b.fontFace = FONT_FILE ? FACE + ', ' + $gameSystem.mainFontFace() : $gameSystem.mainFontFace();
        b.fontSize = FONT_SIZE;
        this.changePaintOpacity(true);
        this.changeTextColor('rgba(0,0,0,1)');
        b.drawText(text, rect.x - SHADOW, rect.y - SHADOW, rect.width, rect.height, 'center');
        b.drawText(text, rect.x + SHADOW, rect.y + SHADOW, rect.width, rect.height, 'center');
        this.resetTextColor();
        this.changePaintOpacity(this.isCommandEnabled(index));
        b.drawText(text, rect.x, rect.y, rect.width, rect.height, 'center');
        this.changePaintOpacity(true);
    };
})();
