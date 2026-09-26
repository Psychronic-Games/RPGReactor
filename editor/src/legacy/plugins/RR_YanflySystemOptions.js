/*:
 * @target MZ
 * @plugindesc Ace System Options (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflySystemOptions.js
 *
 * Yanfly's System Options screen replaces Options (on the title with Theo's
 * add-on, and in the menu): a help line over a list of volumes, toggles, the
 * game's own option switches and variables, and actions. Left and right
 * change a value (Shift for steps of 10).
 *
 * With Global options on (Theo's Global System Options), the volumes,
 * toggles and the option switches and variables belong to the install, not
 * to a save: they are kept with the other options, and start from the values
 * the game shipped with.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param commands
 * @type multiline_string
 * @default []
 * @desc JSON: the list in order; each { kind, name, help, … } (see the importer).
 *
 * @param global
 * @text Global options
 * @type boolean
 * @default false
 *
 * @param defaults
 * @type multiline_string
 * @default {}
 * @desc JSON: { bgm, bgs, sfx, autodash, instantmsg, animations, switches: {id: bool}, variables: {id: n} }.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflySystemOptions');
    const json = (text, d) => { try { return JSON.parse(text) ?? d; } catch (_) { return d; } };
    const COMMANDS = json(params.commands || '[]', []);
    const GLOBAL = String(params.global) === 'true';
    const DEFAULTS = Object.assign({ bgm: 100, bgs: 100, sfx: 100, autodash: false, instantmsg: false, animations: true, switches: {}, variables: {} }, json(params.defaults || '{}', {}));
    // Global options own their switches and variables; without them they are the save's, as usual.
    const OPTION_SWITCHES = GLOBAL ? COMMANDS.filter(c => c.kind === 'switch').map(c => Number(c.id)) : [];
    const OPTION_VARIABLES = GLOBAL ? COMMANDS.filter(c => c.kind === 'variable') : [];

    //-------------------------------------------------------------------------
    // Where the options live: the options file (global) or the save
    //-------------------------------------------------------------------------
    const store = () => {
        if (GLOBAL) {
            if (!ConfigManager.rrYeaOptions) ConfigManager.rrYeaOptions = { switches: {}, variables: {} };
            return ConfigManager.rrYeaOptions;
        }
        if (!$gameSystem._rrYeaOptions) $gameSystem._rrYeaOptions = { switches: {}, variables: {} };
        return $gameSystem._rrYeaOptions;
    };
    const option = (key) => (key === 'autodash' ? !!ConfigManager.alwaysDash : store()[key] !== undefined ? store()[key] : DEFAULTS[key]);
    const setOption = (key, value) => {
        store()[key] = value;
        if (GLOBAL) ConfigManager.save();
    };
    const _makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = _makeData.call(this);
        if (GLOBAL) config.rrYeaOptions = this.rrYeaOptions || { switches: {}, variables: {} };
        return config;
    };
    const _applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        _applyData.call(this, config);
        if (!GLOBAL) return;
        const saved = config && config.rrYeaOptions;
        this.rrYeaOptions = saved && typeof saved === 'object' ? Object.assign({ switches: {}, variables: {} }, saved) : { switches: {}, variables: {} };
        // The game's shipped volumes are the first volumes; after that the player's are kept.
        if (!saved) {
            this.bgmVolume = this.meVolume = DEFAULTS.bgm;
            this.bgsVolume = DEFAULTS.bgs;
            this.seVolume = DEFAULTS.sfx;
            this.alwaysDash = !!DEFAULTS.autodash;
        }
    };

    const volume = (type) => (type === 'bgm' ? ConfigManager.bgmVolume : type === 'bgs' ? ConfigManager.bgsVolume : ConfigManager.seVolume);
    const setVolume = (type, value) => {
        const v = Math.min(Math.max(value, 0), 100);
        if (type === 'bgm') { ConfigManager.bgmVolume = v; ConfigManager.meVolume = v; }
        else if (type === 'bgs') ConfigManager.bgsVolume = v;
        else ConfigManager.seVolume = v;
        ConfigManager.save();
    };

    // Option switches and variables read and write the option store.
    const _switchValue = Game_Switches.prototype.value;
    Game_Switches.prototype.value = function(id) {
        if (OPTION_SWITCHES.includes(id)) {
            const v = store().switches[id];
            return v !== undefined ? !!v : !!DEFAULTS.switches[id];
        }
        return _switchValue.call(this, id);
    };
    const _switchSet = Game_Switches.prototype.setValue;
    Game_Switches.prototype.setValue = function(id, value) {
        if (OPTION_SWITCHES.includes(id)) {
            store().switches[id] = !!value;
            if (GLOBAL) ConfigManager.save();
            this.onChange();
            return;
        }
        _switchSet.call(this, id, value);
    };
    const clampVariable = (id, value) => {
        const c = OPTION_VARIABLES.find(x => Number(x.id) === id);
        return c ? Math.min(Math.max(value, Number(c.min)), Number(c.max)) : value;
    };
    const _variableValue = Game_Variables.prototype.value;
    Game_Variables.prototype.value = function(id) {
        if (OPTION_VARIABLES.some(c => Number(c.id) === id)) {
            const v = store().variables[id];
            return clampVariable(id, Number(v !== undefined ? v : DEFAULTS.variables[id] || 0));
        }
        return _variableValue.call(this, id);
    };
    const _variableSet = Game_Variables.prototype.setValue;
    Game_Variables.prototype.setValue = function(id, value) {
        if (OPTION_VARIABLES.some(c => Number(c.id) === id)) {
            store().variables[id] = clampVariable(id, Number(value) || 0);
            if (GLOBAL) ConfigManager.save();
            this.onChange();
            return;
        }
        _variableSet.call(this, id, value);
    };

    // Instant text and battle animations.
    const _clearFlags = Window_Message.prototype.clearFlags;
    Window_Message.prototype.clearFlags = function() {
        _clearFlags.call(this);
        if (option('instantmsg')) this._showFast = true;
    };
    const _requestAnimation = Game_Temp.prototype.requestAnimation;
    Game_Temp.prototype.requestAnimation = function(targets, animationId, mirror) {
        if ($gameParty.inBattle() && !option('animations')) return;
        _requestAnimation.call(this, targets, animationId, mirror);
    };

    //-------------------------------------------------------------------------
    // The screen
    //-------------------------------------------------------------------------
    function Window_RRSystemOptions() { this.initialize(...arguments); }
    Window_RRSystemOptions.prototype = Object.create(Window_Command.prototype);
    Window_RRSystemOptions.prototype.constructor = Window_RRSystemOptions;

    Window_RRSystemOptions.prototype.makeCommandList = function() {
        for (const c of COMMANDS) this.addCommand(String(c.name || ''), c.kind, true, c);
    };
    Window_RRSystemOptions.prototype.isOkEnabled = function() {
        return this.currentSymbol() === 'action';
    };
    Window_RRSystemOptions.prototype.updateHelp = function() {
        const c = this.currentExt();
        this._helpWindow.setText(c ? String(c.help || '') : '');
    };
    Window_RRSystemOptions.prototype.gauge = function(x, y, width, rate, c1, c2) {
        const h = 16, gy = y + this.lineHeight() - 2 - h;
        const fill = Math.min(Math.floor(width * Math.min(Math.max(rate, 0), 1)), width);
        this.contents.fillRect(x, gy, width, h, ColorManager.gaugeBackColor());
        this.contents.gradientFillRect(x, gy, fill, h, c1, c2);
    };
    Window_RRSystemOptions.prototype.toggle = function(rect, off, on, enabled) {
        const half = this.innerWidth / 2, quarter = this.innerWidth / 4;
        this.changeTextColor(ColorManager.normalColor());
        this.changePaintOpacity(!enabled);
        this.drawText(off, rect.x + half, rect.y, quarter);
        this.changePaintOpacity(enabled);
        this.drawText(on, rect.x + half + quarter, rect.y, quarter);
        this.changePaintOpacity(true);
    };
    Window_RRSystemOptions.prototype.drawItem = function(index) {
        const c = (this._list[index] && this._list[index].ext) || {};
        // Ace draws option rows from the item's left edge, and actions 4 px in (item_rect_for_text).
        const rect = this.itemRect(index);
        if (c.kind === 'action') { rect.x += 4; rect.width -= 8; }
        this.resetFontSettings();
        const half = this.innerWidth / 2;
        const barWidth = this.innerWidth - half - 48;
        switch (c.kind) {
            case 'volume': {
                const v = volume(c.type);
                this.drawText(c.name, rect.x, rect.y, half);
                this.gauge(half, rect.y, barWidth, v / 100, ColorManager.textColor(c.color1 || 0), ColorManager.textColor(c.color2 || 0));
                this.drawText(v + '%', half, rect.y, barWidth, 'right');
                break;
            }
            case 'tone': {
                const i = { red: 0, grn: 1, blu: 2 }[c.type] ?? 0;
                const v = Math.round($gameSystem.windowTone()[i]);
                const dark = [[128, 0, 0], [0, 128, 0], [0, 0, 128]][i], bright = [[255, 0, 0], [0, 255, 0], [0, 0, 255]][i];
                this.drawText(c.name, rect.x, rect.y, half, 'center');
                this.gauge(half, rect.y, barWidth, (v + 255) / 510, `rgb(${dark})`, `rgb(${bright})`);
                this.drawText(String(v), half, rect.y, barWidth, 'right');
                break;
            }
            case 'toggle':
                this.drawText(c.name, rect.x, rect.y, half);
                this.toggle(rect, c.off, c.on, !!option(c.type));
                break;
            case 'switch':
                this.drawText(c.name, rect.x, rect.y, half);
                this.toggle(rect, c.off, c.on, $gameSwitches.value(Number(c.id)));
                break;
            case 'variable': {
                const v = $gameVariables.value(Number(c.id));
                const min = Number(c.min), max = Number(c.max);
                this.drawText(c.name, rect.x, rect.y, half);
                this.gauge(half, rect.y, barWidth, (v - min) / Math.max(max - min, 0.01), ColorManager.textColor(c.color1 || 0), ColorManager.textColor(c.color2 || 0));
                this.drawText(String(v), half, rect.y, barWidth, 'right');
                break;
            }
            case 'action':
                this.drawText(c.name, rect.x, rect.y, rect.width);
                break;
            default:
                this.drawText(c.name || '', rect.x, rect.y, rect.width);
        }
    };
    Window_RRSystemOptions.prototype.cursorRight = function(wrap) {
        this.change(1);
        Window_Command.prototype.cursorRight.call(this, wrap);
    };
    Window_RRSystemOptions.prototype.cursorLeft = function(wrap) {
        this.change(-1);
        Window_Command.prototype.cursorLeft.call(this, wrap);
    };
    Window_RRSystemOptions.prototype.change = function(dir) {
        const c = this.currentExt();
        if (!c) return;
        const step = dir * (Input.isPressed('shift') ? 10 : 1);
        if (c.kind === 'volume') { SoundManager.playCursor(); setVolume(c.type, volume(c.type) + step); }
        else if (c.kind === 'tone') {
            SoundManager.playCursor();
            const tone = $gameSystem.windowTone().slice();
            const i = { red: 0, grn: 1, blu: 2 }[c.type] ?? 0;
            tone[i] = Math.min(Math.max(tone[i] + step, -255), 255);
            $gameSystem.setWindowTone(tone);
        }
        else if (c.kind === 'toggle') {
            const value = dir > 0;
            if (option(c.type) !== value) SoundManager.playCursor();
            if (c.type === 'autodash') { ConfigManager.alwaysDash = value; ConfigManager.save(); }
            else setOption(c.type, value);
        } else if (c.kind === 'switch') {
            const value = dir > 0;
            if ($gameSwitches.value(Number(c.id)) !== value) SoundManager.playCursor();
            $gameSwitches.setValue(Number(c.id), value);
        } else if (c.kind === 'variable') {
            SoundManager.playCursor();
            $gameVariables.setValue(Number(c.id), $gameVariables.value(Number(c.id)) + step);
        } else return;
        this.redrawCurrentItem();
    };

    function Scene_RRSystemOptions() { this.initialize(...arguments); }
    Scene_RRSystemOptions.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRSystemOptions.prototype.constructor = Scene_RRSystemOptions;
    window.Scene_RRSystemOptions = Scene_RRSystemOptions;

    Scene_RRSystemOptions.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        const y = this._helpWindow.y + this._helpWindow.height;
        this._optionsWindow = new Window_RRSystemOptions(new Rectangle(0, y, Graphics.boxWidth, Graphics.boxHeight - y));
        this._optionsWindow.setHelpWindow(this._helpWindow);
        this._optionsWindow.setHandler('cancel', this.popScene.bind(this));
        this._optionsWindow.setHandler('action', this.onAction.bind(this));
        this.addWindow(this._optionsWindow);
    };
    Scene_RRSystemOptions.prototype.helpAreaTop = function() { return 0; };
    Scene_RRSystemOptions.prototype.helpAreaHeight = function() { return this.calcWindowHeight(2, false); };
    Scene_RRSystemOptions.prototype.onAction = function() {
        const c = this._optionsWindow.currentExt() || {};
        const scene = { difficulty: 'Scene_RRCscaDifficulty', music: 'Scene_RRMusicPlayer', photo: 'Scene_RRScreenshots' }[c.type];
        if (c.type === 'to_title') { this.fadeOutAll(); SceneManager.goto(Scene_Title); return; }
        if (c.type === 'shutdown') { this.fadeOutAll(); SceneManager.exit(); return; }
        if (c.type === 'mouse') {
            $gameSwitches.setValue(2, !$gameSwitches.value(2));
            this._optionsWindow.activate();
            return;
        }
        if (scene && typeof window[scene] === 'function') { SceneManager.push(window[scene]); return; }
        SoundManager.playBuzzer();
        this._optionsWindow.activate();
    };
    Scene_RRSystemOptions.prototype.terminate = function() {
        Scene_MenuBase.prototype.terminate.call(this);
        ConfigManager.save();
    };

    // The Options command, on the title and in the menu, opens this screen instead.
    Scene_Title.prototype.commandOptions = function() {
        this._commandWindow.close();
        SceneManager.push(Scene_RRSystemOptions);
    };
    Scene_Menu.prototype.commandOptions = function() {
        SceneManager.push(Scene_RRSystemOptions);
    };
})();
