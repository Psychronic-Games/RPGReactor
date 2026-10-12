/*:
 * @target MZ
 * @plugindesc Discovery Title Screen (VX), with Thrall's title and Main, for imported games
 * @author Rekx/TheRexion, HungrySnake; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallTitle.js
 *
 * The title is pictures from img/pictures: the background, the logo at the
 * top, two layers of red particles drifting over it (one under the logo,
 * one over), and the five commands, New Game, Continue, Erase, Settings and
 * Exit, each a picture of its own in a selected, unselected and (New Game,
 * Continue, Erase) disabled look. The commands slide: the selected one out
 * to the right, the others back to the left. There is no window.
 *
 * Continue and Erase are disabled with no saved game, New Game with every
 * save slot taken (four). The cursor starts on Continue when there is a save.
 * Continue opens the load screen (Scene_ThrallLoad when a port gives one,
 * else MZ's), Erase the erase screen (Scene_ThrallErase) and Settings the
 * options (Scene_ThrallOptions, opened from the title); each does nothing
 * when its port is missing. New Game fades the music over 1.5 seconds and
 * the screen over 60 frames, holds black for 40 and starts. Exit fades the
 * sound and closes the game.
 *
 * The game's font follows the accessibility setting (variable 87): 0 is the
 * game's main font, 1 Roboto at the size Ruby called 18. The window size
 * follows variable 90 at the title, as the original resized its window
 * there (1: 760×600, 2: 912×720).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param falling
 * @text Falling particles
 * @type boolean
 * @default true
 *
 * @param background
 * @default title_bg
 *
 * @param logo
 * @default title_image
 *
 * @param fall1
 * @default fall1
 *
 * @param fall2
 * @default fall2
 *
 * @param commands
 * @text Command pictures
 * @desc JSON: [selected, unselected, disabled] for New Game, Continue, Erase, Settings, Exit.
 * @default [["new_game","new_game_off","new_game_disabled"],["continue","continue_off","continue_disabled"],["erase","erase_off","erase_disabled"],["settings","settings_off"],["exit","exit_off"]]
 *
 * @param style
 * @desc 1 side by side, 2 stacked
 * @type number
 * @default 2
 *
 * @param placement
 * @desc 1 left, 2 centred, 3 right (stacked only)
 * @type number
 * @default 1
 *
 * @param slideSpeed
 * @type number
 * @default 3
 *
 * @param allowSlide
 * @type boolean
 * @default true
 *
 * @param titleX
 * @type number
 * @min -9999
 * @default 0
 *
 * @param titleY
 * @type number
 * @min -9999
 * @default 0
 *
 * @param commandX
 * @desc JSON: an offset for each command
 * @default [0,0,0,0,0]
 *
 * @param commandY
 * @desc JSON: an offset for each command
 * @default [0,0,0,0,0]
 *
 * @param commandOpacity
 * @type number
 * @max 255
 * @default 255
 *
 * @param maxSaves
 * @text Save slots
 * @desc New Game is disabled when this many games are saved.
 * @type number
 * @default 4
 *
 * @param fontVariable
 * @type variable
 * @default 87
 *
 * @param fonts
 * @desc JSON: per value of the font variable, [font file in fonts/ ('' for the main font), Ruby size, pixels]
 * @default [["",20,0],["Roboto-Regular.ttf",18,15]]
 *
 * @param sizeVariable
 * @type variable
 * @default 90
 *
 * @param sizes
 * @desc JSON: per value of the size variable, the window's [width, height] at the title (null: unchanged)
 * @default [null,[760,600],[912,720]]
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallTitle');
    const json = (text, fallback) => { try { const v = JSON.parse(text); return v == null ? fallback : v; } catch (_) { return fallback; } };
    const P = {
        falling: params.falling !== 'false',
        background: params.background || 'title_bg', logo: params.logo || 'title_image',
        fall1: params.fall1 || 'fall1', fall2: params.fall2 || 'fall2',
        commands: json(params.commands, [['new_game', 'new_game_off', 'new_game_disabled'], ['continue', 'continue_off', 'continue_disabled'], ['erase', 'erase_off', 'erase_disabled'], ['settings', 'settings_off'], ['exit', 'exit_off']]),
        style: Number(params.style || 2), placement: Number(params.placement || 1),
        slideSpeed: Number(params.slideSpeed || 3), allowSlide: params.allowSlide !== 'false',
        titleX: Number(params.titleX || 0), titleY: Number(params.titleY || 0),
        commandX: json(params.commandX, [0, 0, 0, 0, 0]), commandY: json(params.commandY, [0, 0, 0, 0, 0]),
        commandOpacity: Number(params.commandOpacity ?? 255),
        maxSaves: Number(params.maxSaves || 4),
        fontVariable: Number(params.fontVariable ?? 87), fonts: json(params.fonts, [['', 20, 0], ['Roboto-Regular.ttf', 18, 15]]),
        sizeVariable: Number(params.sizeVariable ?? 90), sizes: json(params.sizes, [null, [760, 600], [912, 720]])
    };
    const NEW_GAME = 0, CONTINUE = 1, ERASE = 2, SETTINGS = 3, EXIT = 4;
    const scene = (name) => (typeof globalThis[name] === 'function' ? globalThis[name] : null);

    //-------------------------------------------------------------------------
    // The font the accessibility setting picks (Font.default_name / default_size)
    //-------------------------------------------------------------------------
    const fontChoice = () => {
        const v = P.fontVariable && typeof $gameVariables !== 'undefined' && $gameVariables ? $gameVariables.value(P.fontVariable) : 0;
        const f = P.fonts[v];
        return Array.isArray(f) && f[0] ? { face: 'rr-thrall-font-' + v, file: f[0], rubySize: Number(f[1]) || 20, px: Number(f[2]) || 0 } : null;
    };
    const _loadGameFonts = Scene_Boot.prototype.loadGameFonts;
    Scene_Boot.prototype.loadGameFonts = function() {
        _loadGameFonts.call(this);
        P.fonts.forEach((f, v) => { if (Array.isArray(f) && f[0]) FontManager.load('rr-thrall-font-' + v, f[0]); });
    };
    const _mainFontFace = Game_System.prototype.mainFontFace;
    Game_System.prototype.mainFontFace = function() {
        const f = fontChoice();
        return f ? f.face + ', ' + $dataSystem.advanced.fallbackFonts : _mainFontFace.call(this);
    };
    const _mainFontSize = Game_System.prototype.mainFontSize;
    Game_System.prototype.mainFontSize = function() {
        const f = fontChoice();
        return f && f.px ? f.px : _mainFontSize.call(this);
    };
    const _defaultFontSize = Game_System.prototype.rrVxDefaultFontSize;
    Game_System.prototype.rrVxDefaultFontSize = function() {
        const f = fontChoice();
        return f ? f.rubySize : _defaultFontSize ? _defaultFontSize.call(this) : 20;
    };

    //-------------------------------------------------------------------------
    // The hidden command list: it takes the keys; the pictures show it
    //-------------------------------------------------------------------------
    function Window_RRThrallTitle() { this.initialize(...arguments); }
    Window_RRThrallTitle.prototype = Object.create(Window_Command.prototype);
    Window_RRThrallTitle.prototype.constructor = Window_RRThrallTitle;
    Window_RRThrallTitle.prototype.initialize = function(rect, enabled) {
        this._rrEnabled = enabled;
        Window_Command.prototype.initialize.call(this, rect);
        this.opacity = 0;
        this.contentsOpacity = 0;
        this.openness = 0;
    };
    Window_RRThrallTitle.prototype.makeCommandList = function() {
        const e = this._rrEnabled;
        this.addCommand(TextManager.newGame, 'newGame', e.newGame);
        this.addCommand(TextManager.continue_, 'continue', e.continue);
        this.addCommand('Erase', 'erase', e.continue);
        this.addCommand('Settings', 'settings');
        this.addCommand($dataSystem.rrTitleShutdown || 'Shutdown', 'shutdown');
    };
    globalThis.Window_RRThrallTitle = Window_RRThrallTitle;

    //-------------------------------------------------------------------------
    // Scene_Title
    //-------------------------------------------------------------------------
    const T = Scene_Title.prototype;
    T.rrSaveCount = function() {
        const info = DataManager._globalInfo || [];
        let count = 0;
        info.forEach((x, id) => { if (x && id !== DataManager.PLAYTEST_CHECKPOINT_ID) count++; });
        return count;
    };
    T.createBackground = function() {
        const saves = this.rrSaveCount();
        this._rrContinueEnabled = saves > 0;
        this._rrNewGameEnabled = saves < P.maxSaves;
        this._backSprite1 = new Sprite(ImageManager.loadPicture(P.background));
        this._backSprite2 = new Sprite();
        this.addChild(this._backSprite1);
        this._rrLayer = new Sprite();
        this.addChild(this._rrLayer);
        // Every look of every command loads now, so a change of look is immediate.
        this._rrCommandBitmaps = P.commands.map(names => names.map(n => ImageManager.loadPicture(n)));
        this._rrCommands = P.commands.map(() => new Sprite());
        this._rrCommands.forEach((s, i) => { s.z = 0; s._rrOrder = 1 + i; s.opacity = P.commandOpacity; this._rrLayer.addChild(s); });
        this._rrLogo = new Sprite(ImageManager.loadPicture(P.logo));
        this._rrLogo.z = 10; this._rrLogo._rrOrder = 6;
        this._rrLayer.addChild(this._rrLogo);
        if (P.falling) {
            this._rrFall1 = new TilingSprite(ImageManager.loadPicture(P.fall1));
            this._rrFall2 = new TilingSprite(ImageManager.loadPicture(P.fall2));
            this._rrFall1.move(0, 0, Graphics.width, Graphics.height);
            this._rrFall2.move(0, 0, Graphics.width, Graphics.height);
            Object.assign(this._rrFall1, { opacity: 130, z: 9, _rrOrder: 7 });
            Object.assign(this._rrFall2, { opacity: 100, z: 11, _rrOrder: 8 });
            this._rrLayer.addChild(this._rrFall1, this._rrFall2);
        }
    };
    T.createForeground = function() {};
    T.adjustBackground = function() {};
    T.createCommandWindow = function() {
        const width = 172, height = this.calcWindowHeight(5, true);
        this._commandWindow = new Window_RRThrallTitle(new Rectangle(-width, 264, width, height), { newGame: this._rrNewGameEnabled, continue: this._rrContinueEnabled });
        const w = this._commandWindow;
        w.setHandler('newGame', this.commandNewGame.bind(this));
        w.setHandler('continue', this.commandContinue.bind(this));
        w.setHandler('erase', this.rrCommandErase.bind(this));
        w.setHandler('settings', this.rrCommandSettings.bind(this));
        w.setHandler('shutdown', this.rrCommandShutdown.bind(this));
        if (this._rrContinueEnabled) w.select(CONTINUE);
        this.addWindow(w);
    };
    // The window size the player chose, as the title set it each time it started.
    const _start = T.start;
    T.start = function() {
        _start.call(this);
        this.rrLayOut();
        // The sizes are the original's, for a 1× window; scaled with the import's whole-number window scale, the
        // way the Settings screen sizes them (RRThrallUi.windowSize), so the two agree.
        const choice = P.sizeVariable ? $gameVariables.value(P.sizeVariable) : 0;
        const size = P.sizes[choice];
        if (Array.isArray(size)) {
            const scaled = window.RRThrallUi && RRThrallUi.windowSize ? RRThrallUi.windowSize(choice)
                : size.map(n => n * (Number($dataSystem.advanced && $dataSystem.advanced.screenScale) || 1));
            Graphics.rrResolutionResize?.(scaled[0], scaled[1]);
        }
    };
    T.rrLayOut = function() {
        const W = Graphics.width;
        const third = Math.floor(W / 3);
        this.rrRefreshCommandSprites(this._commandWindow.index());
        this._rrCommands.forEach((s, i) => {
            const w = s.bitmap ? s.bitmap.width : 0;
            if (P.style === 2) {
                s.y = 288 + 30 * i + (P.commandY[i] || 0);
                if (P.placement === 1) s.x = third - Math.floor(w / 3) * 2;
                else if (P.placement === 2) s.x = third - Math.floor(w / 3);
                else s.x = third * 2 - Math.floor(w / 3);
                s.x += P.commandX[i] || 0;
            } else {
                // Side by side: New Game left, Continue and Erase in the middle, Settings and Exit right.
                s.x = i === NEW_GAME ? third - 165 : i <= ERASE ? third + 19 : W - w - 15;
                s.y = 338 + (i === CONTINUE || i === ERASE ? 0 : P.commandY[i] || 0);
            }
        });
        this._rrLogo.x = Math.floor(W / 2) - Math.floor(this._rrLogo.width / 2) + P.titleX;
        this._rrLogo.y = 3 + P.titleY;
    };
    // Each command's look: selected, unselected, or disabled (New Game with every slot taken; Continue and Erase with none).
    T.rrRefreshCommandSprites = function(index) {
        const look = (i) => {
            if (i === NEW_GAME && !this._rrNewGameEnabled) return 2;
            if ((i === CONTINUE || i === ERASE) && !this._rrContinueEnabled) return 2;
            return i === index ? 0 : 1;
        };
        this._rrCommands.forEach((s, i) => {
            const bitmap = this._rrCommandBitmaps[i][look(i)] || this._rrCommandBitmaps[i][1];
            if (s.bitmap !== bitmap) s.bitmap = bitmap;
            s.z = i === index ? 1 : 0;
        });
        this._rrLayer.children.sort((a, b) => (a.z || 0) - (b.z || 0) || (a._rrOrder || 0) - (b._rrOrder || 0));
    };
    T.rrSlide = function(index) {
        if (P.style !== 2 || !P.allowSlide) return;
        const W = Graphics.width, w = this._rrCommands[0].width;
        let move, stay;
        if (P.placement === 1) { move = Math.floor(W / 3) - 165 - 10; stay = Math.floor(W / 3) - 165 + 30; }
        else if (P.placement === 3) { move = W - w - 15 + 10; stay = W - w - 15 - 30; }
        else { move = stay = Math.floor(W / 3) - Math.floor(w / 3); }
        this._rrCommands.forEach((s, i) => {
            const target = i === index ? stay : move;
            const step = Math.min(P.slideSpeed, Math.abs(target - s.x));
            s.x += Math.sign(target - s.x) * step;
        });
    };
    const _update = T.update;
    T.update = function() {
        _update.call(this);
        if (this._rrHold > 0 && --this._rrHold === 0) AudioManager.stopBgm();
        if (this._rrLeaving) return;
        const index = this._commandWindow.index();
        this.rrSlide(index);
        this.rrRefreshCommandSprites(index);
        if (this._rrFall1) {
            this._rrFall2.origin.x += 2; this._rrFall2.origin.y -= 1;
            this._rrFall1.origin.x -= 1; this._rrFall1.origin.y -= 1;
        }
    };
    const _isBusy = T.isBusy;
    T.isBusy = function() { return this._rrHold > 0 || _isBusy.call(this); };

    T.commandNewGame = function() {
        DataManager.setupNewGame();
        this._rrLeaving = true;
        this._commandWindow.close();
        AudioManager.fadeOutBgm(1.5);
        this.startFadeOut(60, false);
        this._rrHold = 100;
        SceneManager.goto(Scene_Map);
    };
    T.commandContinue = function() {
        this._commandWindow.close();
        SceneManager.push(scene('Scene_ThrallLoad') || Scene_Load);
    };
    T.rrCommandErase = function() {
        const S = scene('Scene_ThrallErase');
        if (!S) { this._commandWindow.activate(); return; }
        this._commandWindow.close();
        SceneManager.push(S);
    };
    T.rrCommandSettings = function() {
        const S = scene('Scene_ThrallOptions');
        if (!S) { this._commandWindow.activate(); return; }
        this._commandWindow.close();
        SceneManager.push(S);
        SceneManager.prepareNextScene(true);
    };
    T.rrCommandShutdown = function() {
        this._rrLeaving = true;
        this._commandWindow.close();
        AudioManager.fadeOutBgm(0.8);
        AudioManager.fadeOutBgs(0.8);
        AudioManager.fadeOutMe(0.8);
        SceneManager.exit();
    };
})();
