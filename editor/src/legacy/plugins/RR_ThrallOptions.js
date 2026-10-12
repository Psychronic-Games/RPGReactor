/*:
 * @target MZ
 * @plugindesc Menu System Options, Accessibility System and Controls Config (VX), for imported games
 * @author Yanfly (Menu System Options), Strak; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallOptions.js
 *
 * The Settings screen, from the menu and from the title: BGM, SFX and BGS
 * volume bars (left and right by 1, by 10 with dash held; the page keys
 * mute), ATB speed and mode, the predictive turn display, auto kill, auto
 * dash, auto save, the font (A the game's, B the readable one), the
 * window size (Default, x1.25, x1.5 of the size the game opened at),
 * Accessibility and Controls. Leaving it keeps the settings for every
 * game (the player's config file).
 *
 * The settings are the game's variables and switches: volumes 31, 32, 33
 * (higher is quieter) with mute switches 8, 9, 10, ATB speed 9, ATB mode
 * 10, turn display 56, auto kill 7, auto dash 11, auto save 67, font 87,
 * window size 90. Music and sounds play at the volume they set; with auto
 * dash on the player runs unless dash is held.
 *
 * Accessibility: the colour-blind window skins (variable 80: Window,
 * Window1-3, the skin every window takes) and the rarity symbols (switch
 * 37). Controls: the keyboard keys (up to five a control) or the gamepad
 * buttons, whichever was used last (switch 59), and the button glyphs
 * (switch 60).
 *
 * Settings is Scene_ThrallOptions (SceneManager.prepareNextScene(true)
 * from the title); the engine's Game End screen opens it too.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param system
 * @text Settings
 * @desc JSON: YE::SYSTEM's texts, variables and switches.
 * @type note
 * @default ""
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallOptions');
    const json = (text, fallback) => { try { const v = JSON.parse(text); return v == null || v === '' ? fallback : v; } catch (_) { return fallback; } };
    const U = window.RRThrallUi;
    if (!U) return;
    const { v, s, define, rect: R, vxSelectable, WLH } = U;
    const DEFAULTS = {
        TITLE: 'Settings',
        BGM_HELP: 'Adjust Background Music volume.', SFX_HELP: 'Adjust Sound Effects volume.', BGS_HELP: 'Adjust ambient Background Sound volume. (Birds, Crickets, etc)',
        BSPD_HELP: 'Adjust Active Time Battle Speed.', BGM_TITLE: 'BGM Volume', SFX_TITLE: 'SFX Volume', BGS_TITLE: 'BGS Volume', BSPD_TITLE: 'ATB Speed', VOL_MUTE: 'Mute',
        BGM_VOLUME_VAR: 31, SFX_VOLUME_VAR: 32, BGS_VOLUME_VAR: 33, BSPD_VAR: 9, BGM_MUTE_SWITCH: 8, SFX_MUTE_SWITCH: 9, BGS_MUTE_SWITCH: 10,
        BGM_COLOUR1: 16, BGM_COLOUR2: 17, SFX_COLOUR1: 16, SFX_COLOUR2: 17, BGS_COLOUR1: 16, BGS_COLOUR2: 17, BSPD_COLOUR1: 16, BSPD_COLOUR2: 17,
        AUTO_DASH_TITLE: 'Auto Dash', AUTO_DASH_HELP: 'Toggles automatic dashing.', AUTO_DASH_ON: 'On', AUTO_DASH_OFF: 'Off', AUTO_DASH_SWITCH: 11,
        AUTO_SAVE_TITLE: 'Auto Save', AUTO_SAVE_HELP: 'Toggles automatic saving upon returning to the Keep.', AUTO_SAVE_ON: 'On', AUTO_SAVE_OFF: 'Off', AUTO_SAVE_SWITCH: 67,
        AUTO_KILL_TITLE: 'Auto Kill', AUTO_KILL_HELP: 'Automatically kills underleveled enemies in dungeons.', AUTO_KILL_ON: 'On', AUTO_KILL_OFF: 'Off', AUTO_KILL_SWITCH: 7,
        TURN_TITLE: 'Predictive Turn Display', TURN_HELP: 'Displays a prediction of the order that battlers will act.', TURN_ON: 'On', TURN_OFF: 'Off', TURN_SWITCH: 56,
        COLOR_TITLE: 'Accessibility', COLOR_HELP: 'Select to change accessibility settings.',
        SIZE_TITLE: 'Window Size', SIZE_HELP: 'Picture quality may decrease with larger sizes. Press ALT+ENTER for Full Screen.', SIZE_1: 'Default', SIZE_2: 'x1.25', SIZE_3: 'x1.5', SIZE_VAR: 90,
        FONT_TITLE: 'Font', FONT_HELP: 'Changes font between stylish and readable.', FONT_1: 'A', FONT_2: 'B', FONT_VAR: 87,
        WAIT_MODE_TITLE: 'ATB Mode', WAIT_MODE_HELP: 'Adjust Active Time Battle Mode.', WAIT_MODE_1: 'Active', WAIT_MODE_2: 'Wait', WAIT_MODE_VAR: 10,
        CONTROLLER_TITLE: 'Controls', CONTROLLER_HELP: 'Select to configure keyboard settings.'
    };
    const raw = params.system && params.system.startsWith('"') ? json(params.system, {}) : params.system;
    const Y = Object.assign({}, DEFAULTS, typeof raw === 'string' ? json(raw, {}) : raw || {});
    U.optionsSettings = Y;

    // Vocab.game_end is the Settings screen's title.
    Object.defineProperty(TextManager, 'gameEnd', { get: () => Y.TITLE, configurable: true });

    //=========================================================================
    // Every window takes the colour-blind skin (Accessibility System's Window_Base)
    //=========================================================================
    U.skinName = () => { const mode = v(80); return mode > 0 ? 'Window' + mode : 'Window'; };
    Window_Base.prototype.loadWindowskin = function() { this.windowskin = U.windowskin(U.skinName()); };
    Window_Base.prototype.rrUpdateWindowskin = function() { this.windowskin = U.windowskin(U.skinName()); };

    //=========================================================================
    // RPG::BGM / ME / SE / BGS #play: the volume variables and mute switches
    //=========================================================================
    /** vol * (100 - variable) / 100, 0 to 100, 0 when muted. */
    U.volume = (volume, variable, mute) => {
        if (typeof $gameVariables === 'undefined' || !$gameVariables) return volume;
        let vol = Math.floor((Number(volume) || 0) * (100 - v(variable)) / 100);
        vol = Math.min(Math.max(vol, 0), 100);
        return s(mute) ? 0 : vol;
    };
    const scaled = (audio, variable, mute) => (audio ? Object.assign({}, audio, { volume: U.volume(audio.volume, variable, mute) }) : audio);
    const _bgm = AudioManager.updateBgmParameters, _bgs = AudioManager.updateBgsParameters, _me = AudioManager.updateMeParameters, _se = AudioManager.updateSeParameters;
    AudioManager.updateBgmParameters = function(bgm) { _bgm.call(this, scaled(bgm, Y.BGM_VOLUME_VAR, Y.BGM_MUTE_SWITCH)); };
    AudioManager.updateBgsParameters = function(bgs) { _bgs.call(this, scaled(bgs, Y.BGS_VOLUME_VAR, Y.BGS_MUTE_SWITCH)); };
    AudioManager.updateMeParameters = function(me) { _me.call(this, scaled(me, Y.BGM_VOLUME_VAR, Y.BGM_MUTE_SWITCH)); };
    AudioManager.updateSeParameters = function(buffer, se) { _se.call(this, buffer, scaled(se, Y.SFX_VOLUME_VAR, Y.SFX_MUTE_SWITCH)); };
    /** RPG::BGM.last.play / RPG::BGS.last.play: what is playing, at the volume now set. */
    U.replayMusic = () => {
        if (AudioManager._currentBgm) AudioManager.updateBgmParameters(AudioManager._currentBgm);
        if (AudioManager._currentBgs) AudioManager.updateBgsParameters(AudioManager._currentBgs);
    };

    // Auto dash: the player runs unless dash is held.
    const _isDashButtonPressed = Game_Player.prototype.isDashButtonPressed;
    Game_Player.prototype.isDashButtonPressed = function() {
        if (s(Y.AUTO_DASH_SWITCH)) return !Input.isPressed('shift');
        return _isDashButtonPressed.call(this);
    };

    //=========================================================================
    // Window_System, Window_Volume, Scene_End (137)
    //=========================================================================
    const helpWindow = () => {
        const w = new Window_Base(R(0, 0, 608, 56));
        w.rrText = function(text) {
            this.contents.clear();
            this.resetFontSettings();
            this.rrVxDrawText(4, 0, 572, 24, text);
        };
        return w;
    };
    U.optionsHelpWindow = helpWindow;

    define('Window_ThrallSystem', Window_Selectable, Object.assign({}, vxSelectable, {
        initialize() {
            Window_Selectable.prototype.initialize.call(this, R(0, 56, 608, 424));
            this.refresh();
            this.select(0);
            this.activate();
        },
        maxCols() { return 1; },
        maxItems() { return 13; },
        paint() {
            if (!this.contents) return;
            this.contents.clear();
            for (let i = 0; i <= 13; i++) this.rrDrawRow(i);
        },
        rrDrawRow(index) {
            const sw = this.width - 32, dw = sw, col = this.rrVxTextColor(8);
            const head = (y, text) => { this.changeTextColor(this.rrVxSystemColor()); this.rrVxDrawText(0, y, dw, WLH, text); };
            const label = (dy, text, half) => { this.changeTextColor(this.rrVxNormalColor()); this.rrVxDrawText(20, dy, Math.floor(half ? dw / 2 : dw / 3) - 20, WLH, text); };
            const option = (x, dy, on, text) => { this.changeTextColor(on ? this.rrVxNormalColor() : col); this.rrVxDrawText(x, dy, Math.floor(dw / 3), WLH, text, 1); };
            const pair = (dy, title, sw2, off, on) => {
                label(dy, title, true);
                option(Math.floor(sw / 3), dy, !s(sw2), off);
                option(Math.floor(sw * 2 / 3), dy, s(sw2), on);
            };
            switch (index) {
            case 0: head(0, 'Volume Settings'); label(WLH, Y.BGM_TITLE); break;
            case 1: label(WLH * 2, Y.SFX_TITLE); break;
            case 2: label(WLH * 3, Y.BGS_TITLE); break;
            case 3: head(WLH * 4, 'Battle Settings'); label(WLH * 5, Y.BSPD_TITLE); break;
            case 4: {
                const dy = WLH * 6, active = v(Y.WAIT_MODE_VAR) === 2;
                label(dy, Y.WAIT_MODE_TITLE);
                option(Math.floor(sw / 3), dy, active, Y.WAIT_MODE_1);
                option(Math.floor(sw * 2 / 3), dy, !active, Y.WAIT_MODE_2);
                break;
            }
            case 5: pair(WLH * 7, Y.TURN_TITLE, Y.TURN_SWITCH, Y.TURN_OFF, Y.TURN_ON); break;
            case 6: head(WLH * 8, 'System Settings'); pair(WLH * 9, Y.AUTO_KILL_TITLE, Y.AUTO_KILL_SWITCH, Y.AUTO_KILL_OFF, Y.AUTO_KILL_ON); break;
            case 7: pair(WLH * 10, Y.AUTO_DASH_TITLE, Y.AUTO_DASH_SWITCH, Y.AUTO_DASH_OFF, Y.AUTO_DASH_ON); break;
            case 8: pair(WLH * 11, Y.AUTO_SAVE_TITLE, Y.AUTO_SAVE_SWITCH, Y.AUTO_SAVE_OFF, Y.AUTO_SAVE_ON); break;
            case 9: {
                const dy = WLH * 12, font = v(Y.FONT_VAR);
                label(dy, Y.FONT_TITLE, true);
                option(Math.floor(sw / 3), dy, font === 0, Y.FONT_1);
                option(Math.floor(sw * 2 / 3), dy, font === 1, Y.FONT_2);
                break;
            }
            case 10: {
                const dy = WLH * 13, size = v(Y.SIZE_VAR);
                label(dy, Y.SIZE_TITLE, true);
                option(Math.floor(sw / 3), dy, size === 0, Y.SIZE_1);
                option(sw * 1.5 / 3, dy, size === 1, Y.SIZE_2);
                option(Math.floor(sw * 2 / 3), dy, size === 2, Y.SIZE_3);
                break;
            }
            case 11: label(WLH * 14, Y.COLOR_TITLE, true); break;
            case 12: label(WLH * 15, Y.CONTROLLER_TITLE); break;
            }
        },
        refreshCursor() {
            const i = this._index, w = this.width - 32;
            if (i < 0) this.setCursorRect(0, 0, 0, 0);
            else if (i <= 2) this.setCursorRect(0, i * 24 + 24, w, 24);
            else if (i <= 5) this.setCursorRect(0, i * 24 + 48, w, 24);
            else this.setCursorRect(0, i * 24 + 72, w, 24);
        },
        // The rows sit between headings: scrolling would move them under the cursor.
        ensureCursorVisible() {}
    }));

    define('Window_ThrallVolume', Window_Base, {
        initialize(x, y, w, h, variable) {
            Window_Base.prototype.initialize.call(this, R(x, y, w, h));
            this._rrVar = variable;
            const colours = { [Y.BGM_VOLUME_VAR]: ['BGM', Y.BGM_MUTE_SWITCH], [Y.SFX_VOLUME_VAR]: ['SFX', Y.SFX_MUTE_SWITCH], [Y.BGS_VOLUME_VAR]: ['BGS', Y.BGS_MUTE_SWITCH] }[variable];
            const key = colours ? colours[0] : 'BSPD';
            this._rrGc1 = this.rrVxTextColor(Y[key + '_COLOUR1']);
            this._rrGc2 = this.rrVxTextColor(Y[key + '_COLOUR2']);
            this._rrMute = colours ? colours[1] : 0;
            this.opacity = 0;
            if (colours) this.refresh(); else this.rrRefreshTwo();
        },
        /** A volume: the bar is what is left of 100 (the variable counts down). */
        refresh() {
            this.contents.clear();
            const sw = this.width - 32;
            this.contents.fillRect(40, 15, sw - 100, 18, this.rrVxGaugeBackColor());
            let gw = Math.floor((sw - 104) * (100 - v(this._rrVar)) / 100);
            gw = Math.min(Math.max(gw, 0), sw - 104);
            this.contents.gradientFillRect(42, 17, gw, 14, this._rrGc1, this._rrGc2);
            const text = s(this._rrMute) ? Y.VOL_MUTE : `${100 - v(this._rrVar)}%`;
            this.resetTextColor();
            this.rrVxDrawText(sw - 50, 0, 50, WLH * 2, text);
        },
        /** ATB speed: the bar is the variable itself (up to 100). */
        rrRefreshTwo() {
            this.contents.clear();
            const sw = this.width - 32;
            this.contents.fillRect(40, 15, sw - 100, 18, this.rrVxGaugeBackColor());
            let gw = Math.floor((sw - 104) * Math.min(v(this._rrVar), 100) / 100);
            gw = Math.min(Math.max(gw, 0), sw - 104);
            this.contents.gradientFillRect(42, 17, gw, 14, this._rrGc1, this._rrGc2);
            this.resetTextColor();
            this.rrVxDrawText(sw - 50, 0, 50, WLH * 2, `${v(this._rrVar)}%`);
        }
    });

    const sceneBase = {
        createButtons() {},
        rrIdle() { return !this.isBusy() && !SceneManager.isSceneChanging() && !(this._rrWait > 0); },
        prepare(fromTitle = false) { this._rrFromTitle = !!fromTitle; }
    };
    const goto = (S, ...args) => { SceneManager.goto(S); if (args.length) SceneManager.prepareNextScene(...args); };
    /** The window size: Default is the size the game opened at (its whole-number scale), then 1.25 and 1.5 times it. */
    U.windowSize = (choice) => {
        const scale = Number($dataSystem.advanced && $dataSystem.advanced.screenScale) || 1;
        const factor = [1, 1.25, 1.5][choice] || 1;
        return [Math.round(Graphics.width * scale * factor), Math.round(Graphics.height * scale * factor)];
    };

    define('Scene_ThrallOptions', Scene_MenuBase, Object.assign({}, sceneBase, {
        create() {
            Scene_MenuBase.prototype.create.call(this);
            this._helpWindow = helpWindow();
            this._helpWindow.rrText(Y.BGM_HELP);
            this.addWindow(this._helpWindow);
            this._systemWindow = new Window_ThrallSystem();
            this.addWindow(this._systemWindow);
            this._bgmWindow = new Window_ThrallVolume(192, 68, 416, 80, Y.BGM_VOLUME_VAR);
            this._sfxWindow = new Window_ThrallVolume(192, 92, 416, 80, Y.SFX_VOLUME_VAR);
            this._bgsWindow = new Window_ThrallVolume(192, 116, 416, 80, Y.BGS_VOLUME_VAR);
            this._bspdWindow = new Window_ThrallVolume(192, 164, 416, 80, Y.BSPD_VAR);
            for (const w of [this._bgmWindow, this._sfxWindow, this._bgsWindow, this._bspdWindow]) this.addWindow(w);
            this._rrLastIndex = 100;
        },
        rrUpdateHelp() {
            const keys = ['BGM_HELP', 'SFX_HELP', 'BGS_HELP', 'BSPD_HELP', 'WAIT_MODE_HELP', 'TURN_HELP', 'AUTO_KILL_HELP', 'AUTO_DASH_HELP', 'AUTO_SAVE_HELP', 'FONT_HELP', 'SIZE_HELP', 'COLOR_HELP', 'CONTROLLER_HELP'];
            this._helpWindow.rrText(Y[keys[this._systemWindow.index()]] || '');
        },
        update() {
            Scene_MenuBase.prototype.update.call(this);
            if (this._rrWait > 0) { this._rrWait--; return; }
            if (!this.rrIdle()) return;
            const index = this._systemWindow.index();
            if (this._rrLastIndex !== index) { this._rrLastIndex = index; this.rrUpdateHelp(); }
            if (Input.isTriggered('cancel')) { U.sound('cancel'); this.rrReturnScene(); return; }
            const left = Input.isRepeated('left'), right = Input.isRepeated('right');
            const step = Input.isPressed('shift') ? 10 : 1;
            const volume = (variable, mute, win, music) => {
                if (left || right) {
                    U.setV(variable, Math.min(100, Math.max(0, v(variable) + (left ? step : -step))));
                    U.sound('cursor');
                } else if (Input.isTriggered('pageup') || Input.isTriggered('pagedown')) {
                    U.setS(mute, !s(mute));
                    U.sound('decision');
                } else return;
                win.refresh();
                if (music) U.replayMusic();
            };
            const toggle = (sw) => {
                if (!left && !right) return;
                U.setS(sw, right);
                U.sound('decision');
                this._systemWindow.refresh();
            };
            switch (index) {
            case 0: volume(Y.BGM_VOLUME_VAR, Y.BGM_MUTE_SWITCH, this._bgmWindow, true); break;
            case 1: volume(Y.SFX_VOLUME_VAR, Y.SFX_MUTE_SWITCH, this._sfxWindow, false); break;
            case 2: volume(Y.BGS_VOLUME_VAR, Y.BGS_MUTE_SWITCH, this._bgsWindow, true); break;
            case 3:
                if (left || right) {
                    U.setV(Y.BSPD_VAR, left ? Math.max(10, v(Y.BSPD_VAR) - step) : Math.min(100, v(Y.BSPD_VAR) + step));
                    U.sound('cursor');
                    this._bspdWindow.rrRefreshTwo();
                }
                break;
            case 4:
                if (left || right) {
                    U.setV(Y.WAIT_MODE_VAR, left ? Math.max(2, v(Y.WAIT_MODE_VAR) - 1) : Math.min(3, v(Y.WAIT_MODE_VAR) + 1));
                    U.sound('decision');
                    this._systemWindow.refresh();
                }
                break;
            case 5: toggle(Y.TURN_SWITCH); break;
            case 6: toggle(Y.AUTO_KILL_SWITCH); break;
            case 7: toggle(Y.AUTO_DASH_SWITCH); break;
            case 8: toggle(Y.AUTO_SAVE_SWITCH); break;
            case 9:
                if (left || right) {
                    const before = v(Y.FONT_VAR);
                    U.setV(Y.FONT_VAR, left ? Math.max(before - 1, 0) : Math.min(before + 1, 1));
                    if (v(Y.FONT_VAR) !== before) {
                        this.rrChangeFont();
                        U.sound('decision');
                        this._systemWindow.refresh();
                        this.rrUpdateHelp();
                    }
                }
                break;
            case 10:
                if (left || right) {
                    const before = v(Y.SIZE_VAR);
                    U.setV(Y.SIZE_VAR, left ? Math.max(before - 1, 0) : Math.min(before + 1, 2));
                    if (v(Y.SIZE_VAR) !== before) {
                        this.rrResizeScreen();
                        U.sound('decision');
                        this._systemWindow.refresh();
                        this._rrWait = 10;
                    }
                }
                break;
            case 11:
                if (Input.isTriggered('ok')) { U.sound('decision'); goto(Scene_ThrallAccess, this._rrFromTitle); }
                break;
            case 12:
                if (Input.isTriggered('ok')) { U.sound('decision'); goto(Scene_ThrallKeyboard, this._rrFromTitle); }
                break;
            }
        },
        rrResizeScreen() {
            const [w, h] = U.windowSize(v(Y.SIZE_VAR));
            if (Graphics.rrResolutionResize) Graphics.rrResolutionResize(w, h);
        },
        /** change_font: the font variable picks the face; these two windows take it now. */
        rrChangeFont() {
            this._systemWindow.resetFontSettings();
            this._helpWindow.resetFontSettings();
        },
        /** return_scene: the settings into the player's config, then the title or the menu at Settings. */
        rrReturnScene() {
            if (ConfigManager.rrThrallSaveConfig) ConfigManager.rrThrallSaveConfig();
            if (this._rrFromTitle) U.toTitle ? U.toTitle() : SceneManager.goto(Scene_Title);
            else if (window.Scene_ThrallMenu) goto(Scene_ThrallMenu, 4);
            else SceneManager.goto(Scene_Map);
        }
    }));
    if (U.redirectScene) U.redirectScene('Scene_GameEnd', () => Scene_ThrallOptions);

    //=========================================================================
    // Accessibility System (136)
    //=========================================================================
    define('Window_ThrallHpColor', Window_Base, {
        initialize() {
            Window_Base.prototype.initialize.call(this, R(0, 56, 608, 424));
            this.opacity = 0;
            this.refresh();
        },
        refresh() {
            this.contents.clear();
            const x = 216, w = 224, h = 10;
            [[3, 5], [24, 25], [26, 27], [28, 29], [30, 31]].forEach(([c1, c2], i) => {
                const y = 272 + i * 24;
                this.contents.fillRect(x, y, w, h, this.rrVxGaugeBackColor());
                this.contents.gradientFillRect(x + 1, y + 1, w - 2, h - 2, this.rrVxTextColor(c1), this.rrVxTextColor(c2));
            });
        }
    });

    define('Window_ThrallAccessibility', Window_Selectable, Object.assign({}, vxSelectable, {
        initialize() {
            Window_Selectable.prototype.initialize.call(this, R(0, 56, 608, 424));
            this.refresh();
            this.select(0);
            this.activate();
        },
        maxCols() { return 1; },
        maxItems() { return 2; },
        paint() {
            if (!this.contents) return;
            this.contents.clear();
            this.rrDrawRow(0);
            this.rrDrawRow(1);
        },
        rrDrawRow(index) {
            const sw = this.width - 32, dw = sw, dx = 0, col = this.rrVxTextColor(16);
            let dy = WLH;
            const option = (x, on, text) => { this.changeTextColor(on ? this.rrVxNormalColor() : col); this.rrVxDrawText(x, dy, Math.floor(dw / 4), WLH, text, 1); };
            if (index === 0) {
                this.changeTextColor(this.rrVxSystemColor());
                this.rrVxDrawText(0, 0, dw, WLH, 'Accessibility Settings');
                this.changeTextColor(this.rrVxNormalColor());
                this.rrVxDrawText(dx + 20, dy, Math.floor(dw / 3) - 20, WLH, 'Colorblind Mode');
                const mode = v(80);
                const on = [mode === 0, mode === 1, mode === 2, ![0, 1, 2].includes(mode)];
                ['Default', 'Prot.', 'Deut.', 'Trit.'].forEach((text, i) => option(Math.floor(sw * (2 + i) / 7), on[i], text));
                return;
            }
            dy += 24;
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(dx + 20, dy, Math.floor(dw / 3) - 20, WLH, 'Rarity Symbols');
            option(Math.floor(sw * 2 / 7), !s(37), 'Off');
            option(Math.floor(sw * 5 / 7), s(37), 'On');
            const rows = [['Common Loot', ' (C)', 0], ['Uncommon Loot', ' (U)', 9], ['Rare Loot', ' (R)', 10], ['Epic Loot', ' (E)', 11], ['Legendary Loot', ' (L)', 12],
                ['Mythic Loot', ' (M)', 13], ['Consumable Items', null, 14], ['Gold', null, 15]];
            for (const [text, mark, color] of rows) {
                dy += 24;
                this.changeTextColor(this.rrVxTextColor(color));
                this.rrVxDrawText(20, dy, sw, WLH, mark && s(37) ? text + mark : text);
            }
            for (const text of ['Normal HP:', 'Fire Resistant HP:', 'Ice Resistant HP:', 'Shock Resistant HP:', 'Weak Resistant HP:']) {
                dy += 24;
                this.changeTextColor(this.rrVxNormalColor());
                this.rrVxDrawText(20, dy, sw, WLH, text);
            }
        },
        refreshCursor() {
            if (this._index < 0) this.setCursorRect(0, 0, 0, 0);
            else this.setCursorRect(0, this._index * 24 + 24, this.width - 32, 24);
        },
        ensureCursorVisible() {}
    }));

    const MODE_NAMES = ['Default', 'Protanopia', 'Deuteranopia', 'Tritanopia'];
    define('Scene_ThrallAccess', Scene_MenuBase, Object.assign({}, sceneBase, {
        create() {
            Scene_MenuBase.prototype.create.call(this);
            this._helpWindow = helpWindow();
            this.addWindow(this._helpWindow);
            this.rrUpdateHelp(0);
            this._accessWindow = new Window_ThrallAccessibility();
            this.addWindow(this._accessWindow);
            this._hpWindow = new Window_ThrallHpColor();
            this.addWindow(this._hpWindow);
            this._rrLastIndex = 100;
        },
        rrUpdateHelp(index) {
            const text = index === 1 ? 'Display rarity symbols next to item names.' : MODE_NAMES[v(80)] ? `Change colorblind mode. Current: ${MODE_NAMES[v(80)]}` : '';
            this._helpWindow.contents.clear();
            this._helpWindow.resetFontSettings();
            this._helpWindow.rrVxDrawText(4, 0, 504, 24, text);
        },
        update() {
            Scene_MenuBase.prototype.update.call(this);
            if (!this.rrIdle()) return;
            const index = this._accessWindow.index();
            if (this._rrLastIndex !== index) { this._rrLastIndex = index; this.rrUpdateHelp(index); }
            if (Input.isTriggered('cancel')) { U.sound('cancel'); goto(Scene_ThrallOptions, this._rrFromTitle); return; }
            const left = Input.isTriggered('left'), right = Input.isTriggered('right');
            if (index === 0 && (left || right)) {
                const next = v(80) + (left ? -1 : 1);
                if (next < 0 || next > 3) return;
                U.setV(80, next);
                this._accessWindow.rrUpdateWindowskin();
                this._hpWindow.rrUpdateWindowskin();
                this._accessWindow.refresh();
                this.rrUpdateHelp(index);
                this._hpWindow.refresh();
                U.sound('cursor');
            } else if (index === 1 && left && s(37)) { U.setS(37, false); this._accessWindow.refresh(); U.sound('cursor'); }
            else if (index === 1 && right && !s(37)) { U.setS(37, true); this._accessWindow.refresh(); U.sound('cursor'); }
        }
    }));

    //=========================================================================
    // Controls Config (115)
    //=========================================================================
    /** VX's Input buttons as a standard pad's (as RR_ThrallKeys reads them). */
    const PAD_BUTTON = { 11: 0, 12: 1, 13: 2, 14: 3, 15: 4, 16: 5, 17: 8, 18: 9 };
    const VX_BUTTONS = [11, 12, 13, 14, 15, 17, 18, 16];   // A, B, C, X, Y, L, R, Z: the order the scene tries them
    const KEY_CODES = [32, 27].concat(Array.from({ length: 26 }, (_, i) => 65 + i), [49, 50, 51, 52, 53, 54, 55, 56, 57, 48]);
    const findButton = (b) => ($gameSystem.rrFindButton ? $gameSystem.rrFindButton(b) : 854);
    const controls = () => ($gameSystem.rrControls ? $gameSystem.rrControls() : [[67], [88, 27], [90, 32], [65], [83], [81], [87], [68], [38], [37], [40], [39]]);
    const controlsPad = () => ($gameSystem.rrControlsGamepad ? $gameSystem.rrControlsGamepad() : [13, 12, 11, 15, 16, 14, 17, 18, 8, 4, 2, 6]);

    define('Window_ThrallKeyboard', Window_Selectable, Object.assign({}, vxSelectable, {
        initialize(controller, buttons) {
            this._rrController = controller;
            this._rrButtons = buttons;
            Window_Selectable.prototype.initialize.call(this, R(0, 56, 608, 424));
            this.select(0);
            this.activate();
            this.refresh();
        },
        maxCols() { return 1; },
        maxItems() { return this._rrController ? 11 : 15; },
        rrSetButtons(buttons) { this._rrButtons = buttons; this.refresh(); },
        paint() {
            if (!this.contents) return;
            this.contents.clear();
            for (let i = 0; i <= this.maxItems(); i++) this.rrDrawRow(i);
        },
        rrDrawRow(index) {
            const sw = this.width - 32, dw = sw, controller = this._rrController, buttons = this._rrButtons;
            const half = Math.floor(sw / 2);
            const label = (dy, text) => { this.changeTextColor(this.rrVxNormalColor()); this.rrVxDrawText(20, dy, half, WLH, text); };
            const keys = (dy, control) => {
                let dx = half;
                const list = controller ? [buttons[control]] : buttons[control] || [];
                for (const b of list) { this.rrVxDrawIcon(findButton(b), dx, dy - 2, true); dx += 24; }
            };
            const LABELS = ['Select/Interact:', 'Cancel/Deselect, Open Menu:', 'Hold to Dash/Walk, Favorite Loot:', 'Scroll Menu Left:', 'Scroll Menu Right:',
                'Compare Loot, Open Pain Menu:', 'Sort Loot, Open Guide:', 'Open Menu:'];
            const CONTROL = [2, 1, 0, 3, 4, 5, 6, 7];
            if (index === 0) {
                this.changeTextColor(this.rrVxSystemColor());
                this.rrVxDrawText(0, 0, half, WLH, controller ? 'Gamepad Settings' : 'Keyboard Settings');
                this.rrVxDrawIcon(857, half, -2, true);
                this.rrVxDrawText(half + 24, 0, half, WLH, 'Button Prompt Display');
                this.changeTextColor(this.rrVxNormalColor());
                if (controller) {
                    this.rrVxDrawText(0, WLH * 13, sw, WLH, 'NOTE: Controller configurations rely on default RMVX Gamepad settings.', 1);
                    this.rrVxDrawText(0, WLH * 14, sw, WLH, 'Set controls to default by pressing F1, going to "Gamepad" and clicking "Reset".', 1);
                    this.rrVxDrawText(0, WLH * 15, sw, WLH, 'A hard reset may be required after to properly display button prompts.', 1);
                }
            }
            if (index <= 7) { label(WLH * (index + 1), LABELS[index]); keys(WLH * (index + 1), CONTROL[index]); }
            else if (index === 8) {
                if (controller) {
                    label(WLH * 9, 'Button Display Type:');
                    const glyphs = s(60);
                    this.changeTextColor(!glyphs ? this.rrVxNormalColor() : this.rrVxTextColor(8));
                    this.rrVxDrawText(half - 12, WLH * 9, Math.floor(dw / 3), WLH, 'Letters');
                    this.changeTextColor(glyphs ? this.rrVxNormalColor() : this.rrVxTextColor(8));
                    this.rrVxDrawText(Math.floor(sw / 4) * 3 - 12, WLH * 9, Math.floor(dw / 3), WLH, 'Symbols');
                } else { label(WLH * 9, 'Move Up:'); keys(WLH * 9, 8); }
            } else if (index === 9) {
                if (controller) label(WLH * 10, 'Save and Exit');
                else { label(WLH * 10, 'Move Left:'); keys(WLH * 10, 9); }
            } else if (index === 10) {
                if (controller) label(WLH * 11, 'Exit Without Saving');
                else { label(WLH * 11, 'Move Down:'); keys(WLH * 11, 10); }
            } else if (!controller) {
                if (index === 11) { label(WLH * 12, 'Move Right:'); keys(WLH * 12, 11); }
                else if (index === 12) label(WLH * 13, 'Clear All Configurations');
                else if (index === 13) label(WLH * 14, 'Save and Exit');
                else if (index === 14) label(WLH * 15, 'Exit Without Saving');
            }
            // Every row draws the key slots again over the list (the original's own order).
            const z = controller ? 8 : 12;
            for (let i = 1; i <= z; i++) this.rrVxDrawIcon(856, half, WLH * i, true);
        },
        refreshCursor() {
            if (this._index < 0) this.setCursorRect(0, 0, 0, 0);
            else this.setCursorRect(0, this._index * 24 + 24, this.width - 32, 24);
        },
        ensureCursorVisible() {}
    }));

    define('Scene_ThrallKeyboard', Scene_MenuBase, Object.assign({}, sceneBase, {
        create() {
            Scene_MenuBase.prototype.create.call(this);
            this._helpWindow = helpWindow();
            this.addWindow(this._helpWindow);
            this._rrController = !!s(59);
            this._rrButtons = this._rrController ? controlsPad().slice() : controls().map(k => (Array.isArray(k) ? k.slice() : [k]));
            this._helpWindow.rrText(this.rrKeyHelp());
            this._keyWindow = new Window_ThrallKeyboard(this._rrController, this._rrButtons);
            this.addWindow(this._keyWindow);
            this._rrLastIndex = 100;
            this._rrPad = new Set();
        },
        rrKeyHelp() {
            return this._rrController ? 'Press a button to swap controls. Not all buttons can be configured.' : 'Press any Letter or Number to assign keys. Use Arrow keys to change selection.';
        },
        rrUpdateHelp() {
            const i = this._keyWindow.index(), c = this._rrController;
            let text;
            if ([0, 1, 2, 3, 4, 5, 6, 7, 11].includes(i)) text = this.rrKeyHelp();
            else if (i === 8) text = c ? 'Switch button display type.' : this.rrKeyHelp();
            else if (i === 9) text = c ? 'Save configurations.' : this.rrKeyHelp();
            else if (i === 10) text = c ? 'Exit and reset configurations.' : this.rrKeyHelp();
            else if (i === 12) text = 'Clear all configurations.';
            else if (i === 13) text = 'Save configurations. Must assign at least one key to each.';
            else if (i === 14) text = 'Exit and reset configurations.';
            this._helpWindow.rrText(text || '');
        },
        /** The pad buttons pressed this frame and not the last (VX's Input.trigger?(Input::A) …). */
        rrPadTriggered() {
            const now = new Set();
            for (const state of Input._gamepadStates || []) if (state) state.forEach((on, b) => on && now.add(b));
            const out = new Set();
            for (const [vx, b] of Object.entries(PAD_BUTTON)) if (now.has(b) && !this._rrPad.has(b)) out.add(Number(vx));
            this._rrPad = now;
            return out;
        },
        update() {
            Scene_MenuBase.prototype.update.call(this);
            const pad = this.rrPadTriggered();
            if (!this.rrIdle()) return;
            const index = this._keyWindow.index();
            if (this._rrLastIndex !== index) { this._rrLastIndex = index; this.rrUpdateHelp(); }
            const anyKey = Input.rrKeyPressed ? Input.rrKeyPressed(256) : false;
            if (this._rrController) {
                if (!anyKey && index < 8) { for (const b of VX_BUTTONS) if (pad.has(b)) { this.rrUpdateKeys(b); return; } }
                if (!anyKey && index === 8 && Input.isTriggered('left')) { U.setS(60, false); U.sound('decision'); this._keyWindow.rrSetButtons(this._rrButtons); }
                else if (!anyKey && index === 8 && Input.isTriggered('right')) { U.setS(60, true); U.sound('decision'); this._keyWindow.rrSetButtons(this._rrButtons); }
                else if (!anyKey && index === 9 && pad.has(controlsPad()[2])) {
                    if ($gameSystem.rrSetControls) $gameSystem.rrSetControls(null, this._rrButtons);
                    U.sound('decision');
                    this.rrReturnScene();
                } else if (index === 10 && Input.isTriggered('ok')) { U.sound('cancel'); this.rrReturnScene(); }
                return;
            }
            const triggered = (code) => (Input.rrKeyTriggered ? Input.rrKeyTriggered(code) : false);
            if (index < 12) { for (const code of KEY_CODES) if (triggered(code)) { this.rrUpdateKeys(code); return; } }
            if (index === 12 && triggered(controls()[2])) {
                this._rrButtons = [[], [], [], [], [], [], [], [], [38], [37], [40], [39]];
                this._keyWindow.rrSetButtons(this._rrButtons);
                U.sound('decision');
            } else if (index === 13 && triggered(controls()[2])) {
                if (this._rrButtons.every(b => b.length > 0)) {
                    if ($gameSystem.rrSetControls) $gameSystem.rrSetControls(this._rrButtons, null);
                    U.sound('decision');
                    this.rrReturnScene();
                } else U.sound('buzzer');
            } else if (index === 14 && Input.isTriggered('ok')) { U.sound('cancel'); this.rrReturnScene(); }
        },
        /** update_keys: the control of the row (rows 0 and 2 swapped) takes the key; a pad button swaps with the control that had it. */
        rrUpdateKeys(key) {
            const row = this._keyWindow.index();
            const ind = row === 0 ? 2 : row === 2 ? 0 : row;
            const buttons = this._rrButtons;
            if (this._rrController) {
                let temp = key;
                for (let i = 0; i < buttons.length; i++) if (buttons[i] === key) { temp = buttons[i]; buttons[i] = buttons[ind]; break; }
                buttons[ind] = temp;
                this._keyWindow.rrSetButtons(buttons);
                U.sound('decision');
                return;
            }
            if (buttons[ind].length >= 5 || buttons[ind].includes(key)) { U.sound('buzzer'); return; }
            buttons[ind].push(key);
            buttons.forEach((list, i) => { if (i !== ind) { const at = list.indexOf(key); if (at >= 0) list.splice(at, 1); } });
            this._keyWindow.rrSetButtons(buttons);
            U.sound('decision');
        },
        rrReturnScene() { goto(Scene_ThrallOptions, this._rrFromTitle); }
    }));
})();
