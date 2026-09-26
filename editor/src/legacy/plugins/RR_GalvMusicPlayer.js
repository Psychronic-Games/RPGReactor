/*:
 * @target MZ
 * @plugindesc Galv's Basic Music Player (VX Ace), for imported games
 * @author Galv; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_GalvMusicPlayer.js
 *
 * A screen listing the music the player knows, in two columns, each track
 * with a note icon (the battle music's with its own icon). Choosing a track
 * opens a small list of what to do with it: play it, stop the music (the
 * map's own music comes back when the map plays one), or make it the battle
 * music. The list starts as every track in the music folder when a new game
 * begins, in the order Windows lists the folder, or empty; events add to it.
 * Tracks play at volume 100, pitch 100. Getting on a vehicle plays the
 * vehicle's track at 100/100.
 *
 *   SceneManager.push(Scene_RRMusicPlayer)
 *   this.rrAddMusic(name)        add a track to the list
 *   this.rrKnowMusic(name)       true when the track is in the list
 *   this.rrPlayLast()            play the track last chosen on the screen
 *   this.rrRestoreBgm()          battle music back to the player's choice
 *
 * (the importer writes these for the game's SceneManager.call(Scene_MusicPlayer),
 * add_music, know_music?, play_last and restore_bgm; System Options' Open
 * Music Menu opens the screen).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param fromFolder
 * @text List the music folder
 * @type boolean
 * @default true
 * @desc A new game starts with every track in audio/bgm in its list.
 *
 * @param tracks
 * @type multiline_string
 * @default []
 * @desc JSON list of track names to start with instead of reading the folder (for a browser build).
 *
 * @param mapBgmSwitch
 * @type switch
 * @default 0
 * @desc While ON, entering a map keeps the current music (its background sound still plays).
 *
 * @param addToMenu
 * @type boolean
 * @default false
 *
 * @param menuVocab
 * @default Music
 *
 * @param enableMenuSwitch
 * @type switch
 * @default 0
 * @desc While ON, the menu command is disabled.
 *
 * @param musicIcon
 * @type number
 * @default 4550
 *
 * @param battleBgmIcon
 * @type number
 * @default 52
 *
 * @param vehicleBgmIcon
 * @type number
 * @default 0
 *
 * @param vehicleIcons
 * @type multiline_string
 * @default [0,0,0]
 * @desc JSON [boat, ship, airship] icons.
 *
 * @param optionsWidth
 * @type number
 * @default 280
 *
 * @param commands
 * @type multiline_string
 * @default ["play_track","stop_music","set_battle_music"]
 * @desc JSON: the options list in order (play_track, stop_music, set_battle_music, restore_defaults, set_vehicle_music).
 *
 * @param vocab
 * @type multiline_string
 * @default {}
 * @desc JSON: the texts of the options (PLAY_SELECTED, SET_BATTLE, SET_VEHICLE, SET_BOAT, SET_SHIP, SET_AIRSHIP, SET_ALL, RESTORE_DEFAULTS, STOP_MUSIC).
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_GalvMusicPlayer');
    const json = (text, d) => { try { return JSON.parse(text) ?? d; } catch (_) { return d; } };
    const FROM_FOLDER = String(params.fromFolder) !== 'false';
    const TRACKS = json(params.tracks || '[]', []);
    const MAP_BGM_SWITCH = Number(params.mapBgmSwitch) || 0;
    const ADD_TO_MENU = String(params.addToMenu) === 'true';
    const MENU_VOCAB = String(params.menuVocab ?? 'Music');
    const ENABLE_MENU_SWITCH = Number(params.enableMenuSwitch) || 0;
    const MUSIC_ICON = Number(params.musicIcon) || 0;
    const BATTLE_BGM_ICON = Number(params.battleBgmIcon) || 0;
    const VEHICLE_BGM_ICON = Number(params.vehicleBgmIcon) || 0;
    const VEHICLE_ICONS = json(params.vehicleIcons || '[0,0,0]', [0, 0, 0]);
    const OPTIONS_WIDTH = Number(params.optionsWidth) || 280;
    const COMMANDS = json(params.commands || '[]', ['play_track', 'stop_music', 'set_battle_music']);
    const VOCAB = Object.assign({ PLAY_SELECTED: 'Play track', SET_BATTLE: 'Set as battle music', SET_VEHICLE: 'Set as vehicle music', SET_BOAT: 'Boat', SET_SHIP: 'Ship',
        SET_AIRSHIP: 'Airship', SET_ALL: 'Use for all', RESTORE_DEFAULTS: 'Restore defaults', STOP_MUSIC: 'Stop music' }, json(params.vocab || '{}', {}));
    const OPTION_TEXT = { play_track: 'PLAY_SELECTED', stop_music: 'STOP_MUSIC', set_battle_music: 'SET_BATTLE', restore_defaults: 'RESTORE_DEFAULTS', set_vehicle_music: 'SET_VEHICLE' };

    const bgm = (name) => ({ name: String(name ?? ''), volume: 100, pitch: 100, pan: 0 });
    // Switch 0 does not exist: always OFF.
    const switchOn = (id) => id > 0 && $gameSwitches.value(id);

    //-------------------------------------------------------------------------
    // The music folder, as a new game lists it
    //-------------------------------------------------------------------------
    // Windows lists a folder in upper-case order; the list keeps each name up to its last dot.
    const ntfsOrder = (a, b) => { const x = a.toUpperCase(), y = b.toUpperCase(); return x < y ? -1 : x > y ? 1 : 0; };
    function folderTracks() {
        let files = [];
        try {
            if (Utils.isNwjs()) {
                const fs = require('fs'), path = require('path');
                const dir = path.join(path.dirname(process.mainModule.filename), 'audio', 'bgm');
                files = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && !e.name.startsWith('.')).map(e => e.name);
            } else {
                if (Utils.loadWebFileIndex) Utils.loadWebFileIndex();
                const index = Utils._webFileIndex;
                if (index) for (const [lower, file] of index) if (lower.startsWith('audio/bgm/') && !lower.slice(10).includes('/')) files.push(file.slice(10));
            }
        } catch (_) { files = []; }
        const names = [];
        // One track in several formats (.ogg and .m4a) is one entry.
        for (const f of files.sort(ntfsOrder)) {
            const name = f.includes('.') ? f.slice(0, f.lastIndexOf('.')) : f;
            if (!names.includes(name)) names.push(name);
        }
        return names;
    }
    const startingList = () => (TRACKS.length ? TRACKS.slice() : FROM_FOLDER ? folderTracks() : []);

    //-------------------------------------------------------------------------
    // Game_System: the list, the last choice and the vehicle tracks (in the save)
    //-------------------------------------------------------------------------
    const _systemInitialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _systemInitialize.call(this);
        this._rrMusicList = startingList();
        this._rrLastTrack = '';
        this._rrStoredBgm = null;
        this._rrVehicleTrack = null;
        this._rrVehiclesMusic = $dataSystem ? [$dataSystem.boat.bgm.name, $dataSystem.ship.bgm.name, $dataSystem.airship.bgm.name] : [null, null, null];
    };
    Game_System.prototype.rrMusicList = function() { return this._rrMusicList || (this._rrMusicList = []); };

    //-------------------------------------------------------------------------
    // Map music held by a switch; vehicle music
    //-------------------------------------------------------------------------
    const _autoplay = Game_Map.prototype.autoplay;
    Game_Map.prototype.autoplay = function() {
        if (switchOn(MAP_BGM_SWITCH)) {
            if ($dataMap.autoplayBgs) AudioManager.playBgs($dataMap.bgs);
            return;
        }
        _autoplay.call(this);
    };
    Game_Map.prototype.rrPlayMapMusic = function() {
        if ($dataMap && $dataMap.autoplayBgm) AudioManager.playBgm($dataMap.bgm);
    };

    const _getOn = Game_Vehicle.prototype.getOn;
    Game_Vehicle.prototype.getOn = function() {
        _getOn.call(this);
        const s = $gameSystem;
        if (s._rrVehicleTrack !== null && s._rrVehicleTrack !== undefined) AudioManager.playBgm(bgm(s._rrVehicleTrack));
        const i = ['boat', 'ship', 'airship'].indexOf(this._type);
        const music = s._rrVehiclesMusic || [];
        if (i >= 0 && music[i] !== null && music[i] !== undefined) AudioManager.playBgm(bgm(music[i]));
    };

    //-------------------------------------------------------------------------
    // The screen
    //-------------------------------------------------------------------------
    function Window_RRMusicOptions() { this.initialize(...arguments); }
    Window_RRMusicOptions.prototype = Object.create(Window_Command.prototype);
    Window_RRMusicOptions.prototype.constructor = Window_RRMusicOptions;
    Window_RRMusicOptions.prototype.initialize = function(symbols, lift) {
        this._rrSymbols = symbols;
        const height = symbols.length * 24 + 24;
        // Centred across, and below the middle: (height × 1.6 − window) / 2, less `lift`.
        const x = (Graphics.boxWidth - OPTIONS_WIDTH) / 2;
        const y = Math.floor((Graphics.boxHeight * 1.6 - height) / 2) - (lift ? height : 0);
        Window_Command.prototype.initialize.call(this, new Rectangle(x, y, OPTIONS_WIDTH, height));
    };
    Window_RRMusicOptions.prototype.makeCommandList = function() {
        for (const s of this._rrSymbols) this.addCommand(String(s.text), s.symbol);
    };

    function Window_RRMusicList() { this.initialize(...arguments); }
    Window_RRMusicList.prototype = Object.create(Window_Selectable.prototype);
    Window_RRMusicList.prototype.constructor = Window_RRMusicList;
    Window_RRMusicList.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        // The count is taken when the screen opens.
        this._rrItemMax = $gameSystem.rrMusicList().length;
        this.refresh();
        this.select(0);
        this.activate();
    };
    Window_RRMusicList.prototype.maxItems = function() { return this._rrItemMax || 0; };
    Window_RRMusicList.prototype.maxCols = function() { return 2; };
    Window_RRMusicList.prototype.drawItem = function(index) {
        const name = $gameSystem.rrMusicList()[index];
        if (name === undefined || name === null) return;
        const s = $gameSystem, rect = this.itemRect(index);
        const x = index % 2 ? Graphics.boxWidth / 2 + 4 : 0, y = rect.y;
        const music = s._rrVehiclesMusic || [];
        const free = s._rrVehicleTrack === null || s._rrVehicleTrack === undefined;
        let icon = MUSIC_ICON;
        if (String(name) === s.battleBgm().name) icon = BATTLE_BGM_ICON;
        else if (String(name) === s._rrVehicleTrack) icon = VEHICLE_BGM_ICON;
        else if (String(name) === music[0] && free) icon = VEHICLE_ICONS[0] || 0;
        else if (String(name) === music[1] && free) icon = VEHICLE_ICONS[1] || 0;
        else if (String(name) === music[2] && free) icon = VEHICLE_ICONS[2] || 0;
        this.resetTextColor();
        this.drawIcon(icon, x, y);
        this.contents.drawText(String(name), x + 30, y, 238, 24, 'left');
    };
    Window_RRMusicList.prototype.processOk = function() {
        const name = $gameSystem.rrMusicList()[this.index()];
        if (name === undefined || name === null) return SoundManager.playBuzzer();
        $gameSystem._rrLastTrack = name;
        Window_Selectable.prototype.processOk.call(this);
    };

    function Scene_RRMusicPlayer() { this.initialize(...arguments); }
    Scene_RRMusicPlayer.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRMusicPlayer.prototype.constructor = Scene_RRMusicPlayer;
    window.Scene_RRMusicPlayer = Scene_RRMusicPlayer;

    Scene_RRMusicPlayer.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this._musicWindow = new Window_RRMusicList(new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight));
        this._musicWindow.setHandler('ok', this.onMusicOk.bind(this));
        this._musicWindow.setHandler('cancel', this.popScene.bind(this));
        this.addWindow(this._musicWindow);
        this._musicOptionWindow = new Window_RRMusicOptions(COMMANDS.map(symbol => ({ symbol, text: VOCAB[OPTION_TEXT[symbol]] ?? '' })), false);
        this._musicOptionWindow.setHandler('ok', this.onMusicOptionOk.bind(this));
        this._musicOptionWindow.setHandler('cancel', this.onMusicOptionCancel.bind(this));
        this._musicOptionWindow.hide();
        this._musicOptionWindow.deactivate();
        this.addWindow(this._musicOptionWindow);
        const vehicles = [['set_boat', 'SET_BOAT'], ['set_ship', 'SET_SHIP'], ['set_airship', 'SET_AIRSHIP'], ['set_all', 'SET_ALL']];
        this._vehicleOptionWindow = new Window_RRMusicOptions(vehicles.map(([symbol, key]) => ({ symbol, text: VOCAB[key] })), true);
        this._vehicleOptionWindow.setHandler('ok', this.onVehicleOptionOk.bind(this));
        this._vehicleOptionWindow.setHandler('cancel', this.onVehicleOptionCancel.bind(this));
        this._vehicleOptionWindow.hide();
        this._vehicleOptionWindow.deactivate();
        this.addWindow(this._vehicleOptionWindow);
    };
    // The list takes the whole screen; no touch buttons over it.
    Scene_RRMusicPlayer.prototype.createButtons = function() {};
    Scene_RRMusicPlayer.prototype.backToList = function(refresh) {
        this._musicWindow.activate();
        this._musicOptionWindow.hide();
        this._musicOptionWindow.deactivate();
        this._vehicleOptionWindow.hide();
        this._vehicleOptionWindow.deactivate();
        if (refresh) this._musicWindow.refresh();
    };
    Scene_RRMusicPlayer.prototype.onMusicOk = function() {
        this._musicWindow.deactivate();
        this._musicOptionWindow.select(0);
        this._musicOptionWindow.show();
        this._musicOptionWindow.activate();
    };
    Scene_RRMusicPlayer.prototype.onMusicOptionCancel = function() {
        this._musicWindow.activate();
        this._musicOptionWindow.hide();
        this._musicOptionWindow.deactivate();
    };
    Scene_RRMusicPlayer.prototype.onMusicOptionOk = function() {
        const s = $gameSystem;
        switch (this._musicOptionWindow.currentSymbol()) {
            case 'play_track':
                AudioManager.playBgm(bgm(s._rrLastTrack));
                this._musicWindow.activate();
                this._musicOptionWindow.hide();
                this._musicOptionWindow.deactivate();
                break;
            case 'set_battle_music':
                s.setBattleBgm(bgm(s._rrLastTrack));
                s._rrStoredBgm = s.battleBgm();
                if ($gameParty.inBattle()) AudioManager.playBgm(s._rrStoredBgm);
                this.backToList(true);
                break;
            case 'set_vehicle_music':
                this._musicOptionWindow.deactivate();
                this._vehicleOptionWindow.select(0);
                this._vehicleOptionWindow.show();
                this._vehicleOptionWindow.activate();
                break;
            case 'restore_defaults':
                s.setBattleBgm($dataSystem.battleBgm);
                s._rrVehicleTrack = null;
                s._rrVehiclesMusic = [$dataSystem.boat.bgm.name, $dataSystem.ship.bgm.name, $dataSystem.airship.bgm.name];
                this.backToList(true);
                break;
            case 'stop_music':
                AudioManager.stopBgm();
                this._musicWindow.activate();
                this._musicOptionWindow.hide();
                this._musicOptionWindow.deactivate();
                $gameMap.rrPlayMapMusic();
                break;
        }
    };
    Scene_RRMusicPlayer.prototype.onVehicleOptionCancel = function() {
        this._musicOptionWindow.activate();
        this._vehicleOptionWindow.hide();
        this._vehicleOptionWindow.deactivate();
    };
    Scene_RRMusicPlayer.prototype.onVehicleOptionOk = function() {
        const s = $gameSystem;
        const i = ['set_boat', 'set_ship', 'set_airship'].indexOf(this._vehicleOptionWindow.currentSymbol());
        if (i >= 0) {
            s._rrVehicleTrack = null;
            (s._rrVehiclesMusic || (s._rrVehiclesMusic = [null, null, null]))[i] = s._rrLastTrack;
        } else s._rrVehicleTrack = s._rrLastTrack;
        this.backToList(true);
    };

    //-------------------------------------------------------------------------
    // The menu command
    //-------------------------------------------------------------------------
    if (ADD_TO_MENU) {
        const _addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
        Window_MenuCommand.prototype.addOriginalCommands = function() {
            this.addCommand(MENU_VOCAB, 'rrPlayMusic', !switchOn(ENABLE_MENU_SWITCH) && $gameSystem.rrMusicList().length > 0);
            _addOriginalCommands.call(this);
        };
        const _createCommandWindow = Scene_Menu.prototype.createCommandWindow;
        Scene_Menu.prototype.createCommandWindow = function() {
            _createCommandWindow.call(this);
            this._commandWindow.setHandler('rrPlayMusic', () => SceneManager.push(Scene_RRMusicPlayer));
        };
    }

    //-------------------------------------------------------------------------
    // Script calls
    //-------------------------------------------------------------------------
    Object.assign(Game_Interpreter.prototype, {
        rrAddMusic(name) {
            const list = $gameSystem.rrMusicList();
            if (!list.includes(name)) list.push(name);
        },
        rrKnowMusic(name) { return $gameSystem.rrMusicList().includes(name); },
        rrPlayLast() { AudioManager.playBgm(bgm($gameSystem._rrLastTrack)); },
        // With no choice made yet the game's own battle music plays.
        rrRestoreBgm() { $gameSystem.setBattleBgm($gameSystem._rrStoredBgm || null); }
    });
})();
