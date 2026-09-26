/*:
 * @target MZ
 * @plugindesc CSCA Game Over Options! (VX Ace), for imported games
 * @author Casper Gaming; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_CscaGameoverOptions.js
 *
 * The game over screen opens a small command window under the middle of the
 * screen once it has faded in: Load (greyed out with no save to load), back
 * to the title, and Quit, which closes the game. Confirming no longer skips
 * to the title by itself. Cancelling the load screen comes back here.
 *
 * With a variable set for them, its value picks the game over music (ME
 * "Gameover<n>") and picture (system "GameOver<n>"); 0 keeps the database's
 * music and the usual picture. No script calls.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param titleText
 * @default Main Menu
 *
 * @param loadText
 * @default Load
 *
 * @param quitText
 * @default Quit
 *
 * @param musicVariable
 * @type variable
 * @default 0
 *
 * @param imageVariable
 * @type variable
 * @default 0
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_CscaGameoverOptions');
    const TEXT = { title: String(params.titleText ?? 'Main Menu'), load: String(params.loadText ?? 'Load'), quit: String(params.quitText ?? 'Quit') };
    const MUSIC_VAR = Number(params.musicVariable) || 0;
    const IMAGE_VAR = Number(params.imageVariable) || 0;
    const value = (id) => (id > 0 && $gameVariables ? $gameVariables.value(id) : 0);

    function Window_RRCscaGameoverCommand() { this.initialize(...arguments); }
    Window_RRCscaGameoverCommand.prototype = Object.create(Window_Command.prototype);
    Window_RRCscaGameoverCommand.prototype.constructor = Window_RRCscaGameoverCommand;
    window.Window_RRCscaGameoverCommand = Window_RRCscaGameoverCommand;
    Window_RRCscaGameoverCommand.prototype.initialize = function() {
        const w = 160, h = 3 * 24 + $gameSystem.windowPadding() * 2;
        // Centred, its middle at 0.8 of the screen height.
        Window_Command.prototype.initialize.call(this, new Rectangle(Math.floor((Graphics.boxWidth - w) / 2), Math.floor((Graphics.boxHeight * 1.6 - h) / 2), w, h));
        this.openness = 0;
    };
    Window_RRCscaGameoverCommand.prototype.makeCommandList = function() {
        this.addCommand(TEXT.load, 'load', DataManager.isAnySavefileExists());
        this.addCommand(TEXT.title, 'title');
        this.addCommand(TEXT.quit, 'shutdown');
    };

    const _create = Scene_Gameover.prototype.create;
    Scene_Gameover.prototype.create = function() {
        _create.call(this);
        this.createWindowLayer();
        this._commandWindow = new Window_RRCscaGameoverCommand();
        this._commandWindow.setHandler('load', this.rrCommandLoad.bind(this));
        this._commandWindow.setHandler('title', this.gotoTitle.bind(this));
        this._commandWindow.setHandler('shutdown', this.rrCommandShutdown.bind(this));
        this.addWindow(this._commandWindow);
    };
    const _playGameoverMusic = Scene_Gameover.prototype.playGameoverMusic;
    Scene_Gameover.prototype.playGameoverMusic = function() {
        _playGameoverMusic.call(this);
        const n = value(MUSIC_VAR);
        if (n >= 1) AudioManager.playMe({ name: 'Gameover' + n, volume: 100, pitch: 100, pan: 0 });
    };
    const _createBackground = Scene_Gameover.prototype.createBackground;
    Scene_Gameover.prototype.createBackground = function() {
        _createBackground.call(this);
        const n = value(IMAGE_VAR);
        if (n > 0) this._backSprite.bitmap = ImageManager.loadSystem('GameOver' + n);
    };
    // The window opens once the screen has faded in; the load and quit commands wait for it to close.
    Scene_Gameover.prototype.update = function() {
        Scene_Base.prototype.update.call(this);
        const w = this._commandWindow;
        if (!this._rrOpened && !this.isBusy()) { this._rrOpened = true; w.open(); }
        if (this._rrPending === 'load' && w.isClosed()) {
            this._rrPending = null;
            this._rrToLoad = true;
            SceneManager.push(Scene_Load);
        } else if (this._rrPending === 'shutdown' && w.isClosed()) {
            this._rrPending = 'exit';
            this.fadeOutAll();
        } else if (this._rrPending === 'exit' && !this.isBusy()) {
            this._rrPending = null;
            SceneManager.exit();
        }
    };
    Scene_Gameover.prototype.rrCommandLoad = function() {
        this._commandWindow.close();
        this._rrPending = 'load';
    };
    Scene_Gameover.prototype.rrCommandShutdown = function() {
        this._commandWindow.close();
        this._rrPending = 'shutdown';
    };
    // Going to the load screen is a quick fade, and the music plays on.
    const _stop = Scene_Gameover.prototype.stop;
    Scene_Gameover.prototype.stop = function() {
        if (!this._rrToLoad) return _stop.call(this);
        Scene_Base.prototype.stop.call(this);
        this.startFadeOut(this.fadeSpeed());
    };
    const _terminate = Scene_Gameover.prototype.terminate;
    Scene_Gameover.prototype.terminate = function() {
        if (!this._rrToLoad) return _terminate.call(this);
        Scene_Base.prototype.terminate.call(this);
    };
})();
