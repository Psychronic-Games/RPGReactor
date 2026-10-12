/*:
 * @target MZ
 * @plugindesc H87 Options and Universal Module's settings (VX Ace), for imported games
 * @author Holy87; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_H87Options.js
 *
 * The game's settings screen, from the title and the menu: a help window
 * over a list of the game's options in sections. A choice option shows its
 * values side by side, the current one bright; Left and Right step through
 * them (round from the last to the first). A bar fills by its value (Left
 * and Right, no further than empty or full) with the percentage over it.
 *
 * Settings shared by every save (H87 Universal Module's game settings) are
 * kept with the engine's own options. A first run starts from the settings
 * file the game shipped. The music volume scales music and music effects,
 * the effects volume sounds and ambient sounds: half the volume a step, up
 * to the full volume the sound asks (the default, 2 steps, plays it as
 * asked). "Run: Always" runs without Shift.
 * The language option is not shown: the import wrote the game's text in one
 * language; the setting reads that language.
 *
 * Script calls: $gameSettings.name reads a setting (undefined if never set),
 * $gameSettings.name = value sets and saves it (the game's
 * $game_settings[:name]).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param elements
 * @text Options
 * @desc JSON: the options, as H87Options::ELEMENTS lists them.
 * @default []
 *
 * @param defaults
 * @text First-run settings
 * @desc JSON: { setting: value } as the shipped settings file had them.
 * @default {}
 *
 * @param command
 * @text Title command
 * @default Options
 *
 * @param menuCommand
 * @text Menu command
 * @default Options
 *
 * @param showOnTitle
 * @type boolean
 * @default true
 *
 * @param showOnMenu
 * @type boolean
 * @default true
 *
 * @param offBar
 * @text Bar switched off
 * @default OFF
 *
 * @param toggleSound
 * @text Switch sound
 * @type file
 * @dir audio/se
 * @default Switch2
 *
 * @param hidden
 * @text Hidden settings
 * @desc JSON: the settings not shown.
 * @default ["language"]
 */
(() => {
    'use strict';
    const P = PluginManager.parameters('RR_H87Options');
    const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
    const ELEMENTS = json(P.elements, []);
    const DEFAULTS = json(P.defaults, {});
    const HIDDEN = json(P.hidden, ['language']);
    const OFF_BAR = P.offBar === undefined ? 'OFF' : String(P.offBar);
    const TOGGLE_SOUND = String(P.toggleSound || 'Switch2');
    const SHOW_ON_MENU = P.showOnMenu !== 'false';
    const LANGUAGES = ['Ita', 'Eng'];
    const key = (t) => (window.RRKeyedText ? RRKeyedText.resolve(t) : t);

    //=========================================================================
    // $gameSettings: the settings every save shares, kept with the options
    //=========================================================================
    const store = Object.assign({}, DEFAULTS);
    /** The language the import wrote is the language setting (the game's 0 Italian, 1 English). */
    const language = () => {
        const name = window.RRKeyedText ? RRKeyedText.language() : '';
        const i = LANGUAGES.indexOf(name);
        return i >= 0 ? i : store.language;
    };
    let saving = false;
    const save = () => {
        if (saving) return;
        saving = true;
        Promise.resolve().then(() => { saving = false; ConfigManager.save(); });
    };
    window.$gameSettings = new Proxy(store, {
        get: (t, k) => (k === 'language' ? language() : t[k]),
        set: (t, k, v) => { t[k] = v; applyAudio(); save(); return true; },
        deleteProperty: (t, k) => { delete t[k]; save(); return true; }
    });

    const _makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = _makeData.call(this);
        config.rrH87Settings = Object.assign({}, store);
        return config;
    };
    const _applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        _applyData.call(this, config);
        if (config && config.rrH87Settings && typeof config.rrH87Settings === 'object') Object.assign(store, config.rrH87Settings);
        applyAudio();
    };

    //-------------------------------------------------------------------------
    // Volumes: half a sound's volume a step, never past the volume it asks
    //-------------------------------------------------------------------------
    function applyAudio() {
        if (typeof AudioManager === 'undefined') return;
        const music = Number(store.musicvolume), effects = Number(store.sevolume);
        if (Number.isFinite(music)) { AudioManager.bgmVolume = music * 50; AudioManager.meVolume = music * 50; }
        if (Number.isFinite(effects)) { AudioManager.bgsVolume = effects * 50; AudioManager.seVolume = effects * 50; }
    }
    AudioManager.updateBufferParameters = function(buffer, configVolume, audio) {
        if (buffer && audio) {
            buffer.volume = Math.min(100, (configVolume * (audio.volume || 0)) / 100) / 100;
            buffer.pitch = (audio.pitch || 0) / 100;
            buffer.pan = (audio.pan || 0) / 100;
        }
    };

    // "Run: Always": the player runs without Shift (and Shift runs as well).
    Game_Player.prototype.isDashButtonPressed = function() {
        return Input.isPressed('shift') || Number(store.dash) === 1;
    };

    //=========================================================================
    // An option (H87's Option class)
    //=========================================================================
    class Option {
        constructor(hash) {
            this.type = hash.type;
            this.description = hash.help || '';
            this.name = hash.text || '';
            this.tag = hash.tag;
            this.default = hash.default;
            this.condition = hash.condition;
            this.forGame = !!hash.in_game;
            if (this.type === 'switch') {
                if (this.default == null) this.default = false;
                this.switch = hash.sw;
                this.values = [hash.off, hash.on];
            } else if (this.type === 'variable') {
                this.distance = hash.distance == null ? 1 : hash.distance;
                this.variable = hash.var;
                this.needPopup = !!hash.open_popup;
                if (this.default == null) this.default = 0;
                if (hash.values == null) {
                    this.max = hash.max;
                    this.values = Array.from({ length: (hash.max || 0) + 1 }, (_, i) => i);
                } else {
                    this.values = hash.values;
                    this.values2 = hash.values2;
                    this.max = hash.values.length - 1;
                }
            } else if (this.type === 'bar') {
                this.max = hash.max;
                this.variable = hash.var;
                if (this.default == null) this.default = 0;
                if (hash.sw != null) this.switch = hash.sw;
                this.distance = hash.distance == null ? 1 : hash.distance;
                this.barColor = hash.color;
            }
        }
        get value() {
            if (this.type === 'switch') return this.switchOn;
            if (this.type === 'variable' || this.type === 'bar') return this.variableValue;
            return undefined;
        }
        set value(v) {
            if (this.type === 'switch') this.setSwitch(v);
            else if (this.type === 'variable' || this.type === 'bar') this.setVariable(v);
        }
        get id() { return this.variable != null ? this.variable : this.switch != null ? this.switch : this.tag; }
        get switchOn() {
            if (this.switch == null || this.switch === 0) return true;
            return typeof this.switch === 'number' ? $gameSwitches.value(this.switch) : !!$gameSettings[this.switch];
        }
        setSwitch(v) {
            if (this.switch == null || this.switch === 0) return;
            if (typeof this.switch === 'number') $gameSwitches.setValue(this.switch, v);
            else $gameSettings[this.switch] = v;
        }
        get variableValue() {
            if (this.variable === 0) return 0;
            return typeof this.variable === 'number' ? $gameVariables.value(this.variable) : $gameSettings[this.variable];
        }
        setVariable(v) {
            if (this.variable === 0) return;
            if (typeof this.variable === 'number') $gameVariables.setValue(this.variable, v);
            else $gameSettings[this.variable] = v;
        }
        toggle() { if (this.switch != null) this.setSwitch(!this.switchOn); }
        // The game's `if :variable` is always true: bars step round as well, where they can step at all.
        increment() {
            if (this.type === 'switch') return this.toggle();
            this.setSwitch(true);
            this.value = (Number(this.value) || 0) + this.distance;
            if (this.value > this.max) this.value = 0;
        }
        decrement() {
            if (this.type === 'switch') return this.toggle();
            this.setSwitch(true);
            this.value = (Number(this.value) || 0) - this.distance;
            if (this.value < 0) this.value = this.max;
        }
        isForGame() { return typeof this.variable === 'number' || typeof this.switch === 'number' || this.forGame; }
        isEnabled() {
            if ($gameSystem && this.tag != null && $gameSystem._rrEnablingOptions && $gameSystem._rrEnablingOptions[this.tag] === false) return false;
            return true;
        }
        isSeparator() { return this.type === 'separator'; }
        valueActive(i) {
            if (this.type === 'switch') return i === 1 && !!this.value;
            if (this.type === 'variable') return this.value === i * this.distance;
            return true;
        }
        canDecrement() { return !(this.type === 'bar' && this.value <= 0) && !this.needPopup; }
        canIncrement() { return !(this.type === 'bar' && this.value >= this.max) && !this.needPopup; }
        isToggable() { return this.switch != null; }
    }
    /** The options to show: in a game, all; on the title, the shared ones. A hidden setting takes its empty section with it. */
    const optionList = (inGame) => {
        const all = ELEMENTS.map(h => new Option(h)).filter(o => !(inGame === false && o.isForGame()));
        const shown = all.filter(o => !HIDDEN.includes(o.id));
        return shown.filter((o, i) => !o.isSeparator() || (i + 1 < shown.length && !shown[i + 1].isSeparator()));
    };
    window.RRH87Options = { optionList, Option };

    // Defaults for settings never set (the options' own, as the game's DataManager set them).
    for (const o of ELEMENTS.map(h => new Option(h))) {
        if (o.isForGame() || o.id == null || store[o.id] !== undefined) continue;
        if (o.default != null) store[o.id] = o.default;
    }

    //=========================================================================
    // Window_RRH87Options
    //=========================================================================
    class Window_RRH87Options extends Window_Selectable {
        initialize(rect, inGame) {
            this._data = optionList(inGame);
            super.initialize(rect);
            this.refresh();
            this.select(0);
            if (this.item() && this.item().isSeparator()) this.cursorDown(false);
        }
        maxItems() { return this._data ? this._data.length : 0; }
        item() { return this._data[this.index()]; }
        isEnabled(item) { return item.isEnabled(); }
        drawItem(index) {
            const item = this._data[index];
            if (!item) return;
            const rect = this.itemRect(index);
            rect.width -= 4;
            const lh = this.lineHeight();
            if (!item.isSeparator()) {
                this.resetTextColor();
                this.changePaintOpacity(this.isEnabled(item));
                this.contents.drawText(key(item.name), rect.x, rect.y, 172, lh, 'left');
                this.changePaintOpacity(true);
            }
            if (item.type === 'separator') this.drawSeparator(rect, item);
            else if (item.type === 'switch') this.drawSwitch(rect, item);
            else if (item.type === 'variable') this.drawVariable(rect, item);
            else if (item.type === 'bar') this.drawBar(rect, item);
        }
        drawSeparator(rect, item) {
            this.contents.paintOpacity = 128;
            this.contents.fillRect(rect.x, rect.y + 2, rect.width, rect.height - 4, ColorManager.gaugeBackColor());
            this.contents.paintOpacity = 255;
            this.resetTextColor();
            this.contents.drawText(key(item.name), rect.x, rect.y, rect.width, this.lineHeight(), 'center');
        }
        stateX(rect) { return rect.x + Math.floor(rect.width / 3); }
        drawSwitch(rect, item) {
            const x = this.stateX(rect), width = Math.floor((rect.width - x) / item.values.length);
            for (const [i, on] of [[0, !item.value], [1, !!item.value]]) {
                this.resetTextColor();
                this.changePaintOpacity(this.isEnabled(item) && on);
                this.contents.drawText(key(String(item.values[i])), x + width * i, rect.y, width, this.lineHeight(), 'center');
            }
            this.changePaintOpacity(true);
        }
        drawVariable(rect, item) {
            const x = this.stateX(rect), width = Math.floor((rect.width - x) / item.values.length);
            for (let i = 0; i <= item.max; i++) {
                if (item.values[i] == null) continue;
                this.changeTextColor(item.values2 && item.values2[i] != null ? ColorManager.textColor(item.values2[i]) : ColorManager.normalColor());
                this.changePaintOpacity(this.isEnabled(item) && item.valueActive(i));
                this.contents.drawText(key(String(item.values[i])), x + width * i, rect.y, width, this.lineHeight(), 'center');
            }
            this.changePaintOpacity(true);
        }
        drawBar(rect, item) {
            const x = this.stateX(rect), width = rect.width - x, lh = this.lineHeight();
            const b = this.contents;
            b.paintOpacity = this.isEnabled(item) ? 255 : 128;
            const color = ColorManager.textColor(item.barColor || 0);
            b.fillRect(x, rect.y + 5, width, lh - 10, color);
            b.clearRect(x + 1, rect.y + 6, width - 2, lh - 12);
            const rate = (Number(item.value) || 0) / item.max;
            b.fillRect(x, rect.y + 5, Math.floor(width * rate), lh - 10, color);
            b.paintOpacity = 255;
            let text;
            if (item.switchOn) {
                this.resetTextColor();
                text = String(Math.floor(rate * 100)).padStart(2, ' ') + '%';
            } else {
                this.changeTextColor(ColorManager.powerDownColor());
                text = OFF_BAR;
            }
            this.changePaintOpacity(this.isEnabled(item));
            b.drawText(text, x, rect.y, width, lh, 'center');
            this.changePaintOpacity(true);
        }
        cursorDown(wrap) {
            super.cursorDown(wrap);
            if (this.item() && this.item().isSeparator()) super.cursorDown(wrap);
        }
        cursorUp(wrap) {
            super.cursorUp(wrap);
            if (this.item() && this.item().isSeparator()) super.cursorUp(wrap);
        }
        // Left and Right change the value, not the selection.
        cursorRight() {}
        cursorLeft() {}
        updateHelp() {
            this._helpWindow.setItem(this.item());
            this._helpWindow.refresh();
        }
        update() {
            super.update();
            if (!this.active || !this.isCursorMovable()) return;
            const item = this.item();
            if (!item) return;
            if (Input.isRepeated('left') && item.canDecrement() && this.isEnabled(item)) this.shift(-1);
            if (Input.isRepeated('right') && item.canIncrement() && this.isEnabled(item)) this.shift(1);
            if (Input.isTriggered('ok') && this.isEnabled(item) && (item.type === 'switch' || item.type === 'bar') && item.isToggable()) {
                item.toggle();
                AudioManager.playSe({ name: TOGGLE_SOUND, volume: 100, pitch: 100, pan: 0 });
                this.refresh();
                this.updateHelp();
            }
        }
        shift(direction) {
            const item = this.item();
            if (direction < 0) item.decrement(); else item.increment();
            SoundManager.playCursor();
            if (AudioManager._currentBgm) AudioManager.updateBgmParameters(AudioManager._currentBgm);
            this.refresh();
            this.updateHelp();
        }
    }
    window.Window_RRH87Options = Window_RRH87Options;

    //=========================================================================
    // Scene_RRH87Options
    //=========================================================================
    class Scene_RRH87Options extends Scene_MenuBase {
        create() {
            super.create();
            const from = SceneManager._previousClass;
            const inGame = !(from && from.name === 'Scene_Title');
            this._helpWindow = new Window_Help(new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(2, false)));
            this.addWindow(this._helpWindow);
            const y = this._helpWindow.y + this._helpWindow.height;
            this._optionWindow = new Window_RRH87Options(new Rectangle(0, y, Graphics.boxWidth, Graphics.boxHeight - y), inGame);
            this._optionWindow.setHelpWindow(this._helpWindow);
            this._optionWindow.setHandler('cancel', this.popScene.bind(this));
            this._optionWindow.activate();
            this.addWindow(this._optionWindow);
        }
        helpAreaHeight() { return 0; }
        needsCancelButton() { return false; }
    }
    window.Scene_RRH87Options = Scene_RRH87Options;

    //-------------------------------------------------------------------------
    // The Settings command in the menu (the title's is the title's port's)
    //-------------------------------------------------------------------------
    if (SHOW_ON_MENU) {
        const _addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
        Window_MenuCommand.prototype.addOriginalCommands = function() {
            _addOriginalCommands.call(this);
            this.addCommand(String(P.menuCommand || 'Options'), 'options', true);
        };
        // MZ's own Options command would come twice.
        Window_MenuCommand.prototype.addOptionsCommand = function() {};
    }
    Scene_Menu.prototype.commandOptions = function() { SceneManager.push(Scene_RRH87Options); };

    // $game_system.option_enable(tag, state)
    Game_System.prototype.rrOptionEnable = function(tag, state) {
        if (!this._rrEnablingOptions) this._rrEnablingOptions = {};
        this._rrEnablingOptions[tag] = state;
    };
})();
