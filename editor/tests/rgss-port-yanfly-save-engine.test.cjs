'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));

// Snippets of Dreamwalker's copies (the settings as the game shipped them).
const YEA = `$imported = {} if $imported.nil?
$imported["YEA-SaveEngine"] = true
module YEA
  module SAVE
    MAX_FILES = 100       # Maximum saves a player can make. Default: 16
    SLOT_NAME = "Save %s"  # How the file slots will be named. "Save %s"
    SAVE_ICON  = 4545       # Icon used to indicate a save is present.
    EMPTY_ICON = 0       # Icon used to indicate an empty file.
    ACTION_LOAD   = "Load"           # Text used for loading games.
    ACTION_SAVE   = "Save"           # Text used for saving games.
    ACTION_DELETE = "Delete"         # Text used for deleting games.
    DELETE_SOUND  = RPG::SE.new("", 100, 100) # Sound for deleting.
    SELECT_HELP = "Please select a save slot."
    LOAD_HELP   = "Loads the data from the saved game."
    SAVE_HELP   = "Saves the current progress in your game. You may save in an empty slot or overwrite an existing one."
    DELETE_HELP = "Deletes all data from this save file. Once the file is deleted, it's gone forever."
    EMPTY_TEXT = ""      # Text used when no save data is present.
    PLAYTIME   = "Playtime:"          # Text used for total playtime.
    TOTAL_SAVE = "Saves: "     # Text used to indicate total saves.
    TOTAL_GOLD = "Zenar: "      # Text used to indicate total gold.
    LOCATION   = "Location: "        # Text used to indicate current location.
    COLUMN1_VARIABLES = [1,2]
    COLUMN2_VARIABLES = [81,82,88,83,84,87]
  end # SAVE
end # YEA
class Window_FileList < Window_Selectable
  def draw_item(index)
    text = sprintf(YEA::SAVE::SLOT_NAME, (index + 1).group)
  end
end`;
const VLUE = `#Basic Autosave v1.1
NAME_AUTOSAVE_FILE = true
AUTOSAVE_FILE_NAME = "Autosave"
AUTOSAVE_ON_MAP = true
AUTOSAVE_AFTER_BATTLE = false

$auto_save = true

class Scene_Map
  alias auto_post_transfer post_transfer
  def post_transfer
    auto_post_transfer
    return unless AUTOSAVE_ON_MAP
    DataManager.save_game(0) if $auto_save
  end
end`;
const FILENAME = `class Window_FileList
  def draw_item(index)
    if index == 0
      text = AUTOSAVE_FILE_NAME
    else
      text = sprintf(YEA::SAVE::SLOT_NAME, (index + 1).group)
    end
  end
end`;
const GALV = `module YEA
  module SAVE
    CONFIRM_DELETE = "ATTENTION: are you sure you want to delete this save file?"
    CONFIRM_SAVE = "ATTENTION: are you sure you want to overwrite this save file?"
    CONFIRM_LOAD = "ATTENTION: are you sure you want to load this save file?"
    CONFIRM_NEW_GAME_PLUS = "Restart this game?"
  end
end
class Scene_File < Scene_MenuBase
  def confirm_choice
  end
end
class Window_Confirm < Window_Command
end`;
const FONT = 'module YEA\n  module CORE\n    FONT_SIZE = 18\n  end\nend\nFont.default_size = YEA::CORE::FONT_SIZE';
const GAME = [FONT, YEA, VLUE, FILENAME, GALV];

test('Save Engine and Basic Autosave: detected; $auto_save and save_game translate', () => {
    const families = C.scriptFamilies(GAME);
    assert.ok(families.has('yeaSaveEngine') && families.has('vlueAutosave'));
    assert.ok(!C.scriptFamilies(['class Scene_Map\n  def post_transfer\n  end\nend']).has('vlueAutosave'));
    const ctx = { constants: C.scriptConstants(GAME), families: new Set(['vlueAutosave']) };
    assert.equal(C.ruby('$auto_save = false', 'statement', ctx), 'window.rrAutoSave = false;');
    assert.equal(C.ruby('DataManager.save_game(0)', 'statement', ctx), '(window.rrSaveGame?.(0) ?? false);');
    assert.equal(C.ruby('$auto_save', 'expression', ctx), '("rrAutoSave" in window ? window.rrAutoSave : true)');
    assert.equal(C.ruby('DataManager.save_file_exists?', 'expression', ctx), 'DataManager.isAnySavefileExists()');
});

test('Save Engine: settings, the confirmation and the first slot\'s name come from the game\'s copies', () => {
    const p = params('RR_YanflySaveEngine').extract({ scripts: GAME, constants: C.scriptConstants(GAME) });
    assert.equal(p.maxFiles, '100');
    assert.equal(p.saveIcon, '4545');
    assert.equal(p.emptyIcon, '0');
    assert.equal(p.totalGold, 'Zenar: ');
    assert.equal(p.column1, '[1,2]');
    assert.equal(p.column2, '[81,82,88,83,84,87]');
    assert.equal(p.deleteSound, '{"name":"","volume":100,"pitch":100}');
    assert.equal(p.autosaveName, 'Autosave');
    assert.equal(p.confirm, 'true');
    assert.equal(p.confirmSave, 'ATTENTION: are you sure you want to overwrite this save file?');
    assert.equal(p.rgssFontSize, '18');
    // Without the add-ons: no confirmation, the first slot is "Save 1".
    const bare = params('RR_YanflySaveEngine').extract({ scripts: [YEA], constants: C.scriptConstants([YEA]) });
    assert.equal(bare.confirm, 'false');
    assert.equal(bare.autosaveName, '');
    const v = params('RR_VlueAutosave').extract({ scripts: GAME, constants: C.scriptConstants(GAME) });
    assert.deepEqual(v, { onMap: 'true', afterBattle: 'false', autoSave: 'true', nameFile: 'true', fileName: 'Autosave' });
});

/** Small MZ stand-ins: windows record what they draw. */
function world(parameters = {}) {
    const events = [];
    function Rectangle(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
    const bitmap = (w, h) => ({ width: w, height: h, fontSize: 16.1, paintOpacity: 255, texts: [], fills: [], clear() { this.texts = []; this.fills = []; }, fillRect(...a) { this.fills.push(a); } });
    function Window_Base() {}
    Object.assign(Window_Base.prototype, {
        initialize(rect) { Object.assign(this, { x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: true, active: false, _color: 'normal', _opacity: true, icons: [], chars: [] }); this.contents = bitmap(rect.width - 24, rect.height - 24); },
        lineHeight: () => 24, update() {}, translucentOpacity: () => 160,
        resetFontSettings() { this.contents.fontSize = 16.1; this._color = 'normal'; },
        changeTextColor(c) { this._color = c; }, resetTextColor() { this._color = 'normal'; }, changePaintOpacity(e) { this._opacity = e; },
        textWidth(t) { return String(t).length * 8; },
        drawText(t, x, y, w, a) { this.contents.texts.push({ t: String(t), x, y, w, a: a || 'left', color: this._color, faint: !this._opacity, size: this.contents.fontSize }); },
        drawIcon(i, x, y, enabled) { this.icons.push([i, x, y, enabled]); },
        drawCharacter(name, index, x, y) { this.chars.push([name, index, x, y]); },
        show() { this.visible = true; }, hide() { this.visible = false; },
        activate() { this.active = true; }, deactivate() { this.active = false; }
    });
    function Window_Selectable() {}
    Window_Selectable.prototype = Object.create(Window_Base.prototype);
    Object.assign(Window_Selectable.prototype, {
        initialize(rect) { Window_Base.prototype.initialize.call(this, rect); this._index = -1; this._handlers = {}; },
        index() { return this._index; }, maxItems: () => 0, maxCols: () => 1,
        select(i) { this._index = i; this.callUpdateHelp(); }, deselect() { this.select(-1); }, ensureCursorVisible() {},
        itemRect(i) { const cols = this.maxCols(), w = Math.floor((this.width - 24 + 8) / cols - 8); return new Rectangle((i % cols) * (w + 8), Math.floor(i / cols) * 24, w, 24); },
        refresh() { this.contents.clear(); this.icons = []; this.chars = []; for (let i = 0; i < this.maxItems(); i++) this.drawItem(i); },
        drawItem() {}, setHandler(k, f) { this._handlers[k] = f; }, isHandled(k) { return !!this._handlers[k]; }, callHandler(k) { this._handlers[k](); },
        setHelpWindow(w) { this._helpWindow = w; this.callUpdateHelp(); }, callUpdateHelp() { if (this.active && this._helpWindow) this.updateHelp(); }, updateHelp() {},
        isCurrentItemEnabled: () => true,
        // Enter on the list: the handler for the command's symbol, else ok; a disabled row buzzes.
        processOk() {
            if (!this.isCurrentItemEnabled()) return events.push('buzzer');
            events.push('ok'); this.deactivate();
            const s = this.currentSymbol && this.currentSymbol();
            if (s && this.isHandled(s)) this.callHandler(s); else this.callHandler('ok');
        }
    });
    function Window_Command() {}
    Window_Command.prototype = Object.create(Window_Selectable.prototype);
    Object.assign(Window_Command.prototype, {
        initialize(rect) { Window_Selectable.prototype.initialize.call(this, rect); this.refresh(); this.select(0); this.activate(); },
        maxItems() { return this._list.length; }, addCommand(name, symbol, enabled = true) { this._list.push({ name, symbol, enabled }); },
        refresh() { this._list = []; this.makeCommandList(); Window_Selectable.prototype.refresh.call(this); },
        drawItem(i) { this.drawText(this._list[i].name, 0, 0, 0); }, currentSymbol() { return this._list[this._index] ? this._list[this._index].symbol : null; },
        isCurrentItemEnabled() { return !!(this._list[this._index] && this._list[this._index].enabled); }
    });
    function Window_HorzCommand() {}
    Window_HorzCommand.prototype = Object.create(Window_Command.prototype);
    function Window_Help() {}
    Window_Help.prototype = Object.create(Window_Base.prototype);
    Window_Help.prototype.setText = function(t) { this.text = t; };
    function Window_MenuCommand() {}
    function Window_SavefileList() {}
    Window_SavefileList.prototype.drawTitle = function(id) { events.push('stock title ' + id); };
    function Scene_MenuBase() {}
    Object.assign(Scene_MenuBase.prototype, {
        create() { this.windows = []; }, start() {}, terminate() {}, addWindow(w) { this.windows.push(w); },
        calcWindowHeight: (n) => n * 24 + 24, popScene() { events.push('pop'); }, fadeOutAll() { events.push('fadeout'); },
        createHelpWindow() { this._helpWindow = new Window_Help(); this._helpWindow.initialize(this.helpWindowRect()); this.addWindow(this._helpWindow); }
    });
    function Scene_File() {} Scene_File.prototype = Object.create(Scene_MenuBase.prototype);
    function Scene_Save() {} Scene_Save.prototype = Object.create(Scene_File.prototype);
    function Scene_Load() {} Scene_Load.prototype = Object.create(Scene_File.prototype);
    Scene_Load.prototype.onLoadSuccess = function() { events.push('Scene_Load success'); };
    Scene_Load.prototype.reloadMapIfUpdated = function() {};
    function Scene_Map() {} function Scene_Battle() {}
    const files = {};   // savefileId -> info
    const DataManager = {
        PLAYTEST_CHECKPOINT_ID: 99, _globalInfo: [], isPlaytestCheckpointEnabled: () => false, isBattleTest: () => false, isEventTest: () => false,
        savefileInfo(id) { return this._globalInfo[id] || null; }, savefileExists(id) { return !!this._globalInfo[id]; }, makeSavename: (id) => 'file' + id,
        makeSavefileInfo: () => ({ playtime: '01:02:03', timestamp: Date.now() }), saveGlobalInfo() { events.push('global'); }, loadAllSavefileImages() {},
        saveGame(id) { events.push('save ' + id); this._globalInfo[id] = this.makeSavefileInfo(); return Promise.resolve(0); },
        loadGame(id) { events.push('load ' + id); return Promise.resolve(0); },
        setupNewGame() { events.push('new game'); }
    };
    const sys = { mainFontSize: () => 16.1, saveEnabled: true, count: 3, isSaveEnabled() { return this.saveEnabled; }, saveCount() { return this.count; }, onBeforeSave() { this.count++; events.push('before save'); }, setSavefileId(id) { this.id = id; }, onAfterLoad() { events.push('after load'); } };
    const ctx = {
        Rectangle, Window_Base, Window_Selectable, Window_Command, Window_HorzCommand, Window_Help, Window_MenuCommand, Window_SavefileList,
        Scene_MenuBase, Scene_File, Scene_Save, Scene_Load, Scene_Map, Scene_Battle, DataManager, window: {},
        PluginManager: { parameters: (name) => (name === 'RR_VlueAutosave' ? Object.assign({ onMap: 'true', afterBattle: 'false', autoSave: 'true', nameFile: 'true', fileName: 'Autosave' }, parameters) : Object.assign(params('RR_YanflySaveEngine').extract({ scripts: GAME, constants: C.scriptConstants(GAME) }), parameters)) },
        StorageManager: { remove: (name) => events.push('remove ' + name) },
        Graphics: { boxWidth: 640, boxHeight: 480 },
        SceneManager: { goto: (s) => events.push('goto ' + (s === Scene_Map ? 'map' : '?')) },
        SoundManager: { playSave: () => events.push('save sound'), playLoad: () => events.push('load sound'), playBuzzer: () => events.push('buzzer') },
        AudioManager: { playSe: (se) => events.push('se ' + se.name) },
        ImageManager: { loadCharacter: () => ({ isReady: () => true }) },
        ColorManager: { systemColor: () => 'system', normalColor: () => 'normal' },
        TextManager: { currencyUnit: 'Ƶ', levelA: 'LV' },
        $gameSystem: sys, $gameParty: { gold: () => 12345, maxBattleMembers: () => 4, battleMembers: () => [{ name: () => 'Jay', level: 7, characterName: () => '$jay', characterIndex: () => 0 }] },
        $gameMap: { mapId: () => 73, displayName: () => '' }, $dataMap: {}, $gameVariables: { value: (id) => (id === 81 ? 4200 : id === 2 ? 'Rookie' : 0) },
        $dataSystem: { variables: Object.assign([], { 1: 'Difficulty: ', 2: 'Title:', 81: 'Zenar Spent', 82: 'Zenar Gained', 83: 'Items Purchased', 84: 'Items Sold', 87: 'Items Consumed', 88: 'Zenar Looted' }) },
        $dataMapInfos: Object.assign([], { 73: { name: 'Friedentown' } })
    };
    ctx.window = ctx;
    vm.runInNewContext(plugin('RR_YanflySaveEngine'), ctx);
    const open = (Scene) => { const s = new Scene(); s.create(); return s; };
    const flush = () => new Promise(r => setImmediate(r));
    return { ctx, events, open, flush, DataManager, sys, Scene_Save, Scene_Load, Scene_Map, Scene_Battle };
}

test('Save Engine: the windows sit where the original put them on a 640×480 screen', () => {
    const { open, Scene_Save } = world();
    const s = open(Scene_Save);
    const at = (w) => [w.x, w.y, w.width, w.height];
    assert.deepEqual(at(s._helpWindow), [0, 0, 640, 72]);
    assert.deepEqual(at(s._fileWindow), [0, 72, 128, 408]);
    assert.deepEqual(at(s._actionWindow), [128, 72, 512, 48]);
    assert.deepEqual(at(s._statusWindow), [128, 120, 512, 360]);
    assert.deepEqual(at(s._confirmWindow), [220, 240, 200, 72]);
    assert.equal(s._helpWindow.text, 'Please select a save slot.');
    assert.ok(s._fileWindow.active && !s._actionWindow.active && s._actionWindow.index() === -1 && !s._confirmWindow.visible);
    assert.equal(s._fileWindow.maxItems(), 100);
    assert.deepEqual(s._actionWindow._list.map(c => c.name), ['Load', 'Save', 'Delete']);
});

test('Save Engine: the list names the first slot Autosave, the rest "Save n"; empty slots are faint', () => {
    const { open, Scene_Save, DataManager } = world();
    DataManager._globalInfo[0] = { playtime: '00:00:02' };
    const list = open(Scene_Save)._fileWindow;
    assert.deepEqual(list.contents.texts.slice(0, 3).map(t => [t.t, t.x, t.w, t.faint]), [['Autosave', 24, 76, false], ['Save 2', 24, 76, true], ['Save 3', 24, 76, true]]);
    assert.deepEqual(list.icons.slice(0, 2).map(i => [...i]), [[4545, 0, 0, true], [0, 0, 24, false]]);
    const bare = world({ autosaveName: '' });
    assert.equal(bare.open(bare.Scene_Save)._fileWindow.contents.texts[0].t, 'Save 1');
});

test('Save Engine: the status window shows the slot, playtime, saves, gold, location, party and variables', async () => {
    const { open, Scene_Save, DataManager, flush } = world();
    const s = open(Scene_Save);
    const status = s._statusWindow;
    assert.deepEqual(status.contents.fills.map(f => [...f]), [[0, 0, 488, 336, 'rgba(0, 0, 0, 0.3137254901960784)']], 'an empty slot is shaded');
    s._fileWindow.processOk(); s._actionWindow.processOk();
    await flush();
    const info = DataManager.savefileInfo(0);
    assert.deepEqual(JSON.parse(JSON.stringify(info.rrYea)), { saveCount: 4, gold: 12345, mapId: 73, displayName: '', maxBattleMembers: 4, variables: { 1: 0, 2: 'Rookie', 81: 4200, 82: 0, 88: 0, 83: 0, 84: 0, 87: 0 }, members: [{ name: 'Jay', level: 7, characterName: '$jay', characterIndex: 0 }] });
    const texts = status.contents.texts.map(t => [t.t, t.x, t.y, t.a, t.color]);
    for (const row of [['Save ', 4, 0, 'left', 'system'], ['1', 44, 0, 'left', 'normal'], ['Playtime:', 248, 0, 'left', 'system'], ['01:02:03', 248, 0, 'right', 'normal'],
        ['Saves: ', 4, 24, 'left', 'system'], ['4', 60, 24, 'left', 'normal'], ['Zenar: ', 248, 24, 'left', 'system'], ['Ƶ', 248, 24, 'right', 'system'], ['12345', 248, 24, 'right', 'normal'],
        ['Location: ', 4, 48, 'left', 'system'], ['Friedentown', 84, 48, 'left', 'normal'],
        ['Jay', 0, 128, 'center', 'normal'], ['7', 0, 104, 'right', 'normal'], ['LV', 0, 104, 'right', 'system'],
        ['Difficulty: ', 16, 168, 'left', 'system'], ['Rookie', 16, 192, 'right', 'normal'], ['Zenar Spent', 260, 168, 'left', 'system'], ['4200', 260, 168, 'right', 'normal']]) {
        assert.ok(texts.some(t => JSON.stringify(t) === JSON.stringify(row)), 'drew ' + JSON.stringify(row));
    }
    assert.deepEqual([...status.chars.at(-1)], ['$jay', 0, 61, 128]);
    const jay = status.contents.texts.find(t => t.t === 'Jay');
    assert.ok(Math.abs(jay.size - 16.1 * 10 / 18) < 1e-9, 'the party is drawn 8 smaller than the size-18 default');
    assert.equal(status.contents.texts.find(t => t.t === 'Difficulty: ').size, 16.1);
});

test('Save Engine: saving to an empty slot at once, over a save after Yes; the screen stays open', async () => {
    const { open, Scene_Save, events, flush, sys } = world();
    const s = open(Scene_Save);
    s._fileWindow.select(1); s._actionWindow.update();
    s._fileWindow.processOk();
    assert.equal(s._actionWindow.currentSymbol(), 'save');
    assert.match(s._helpWindow.text, /^Saves the current progress/);
    s._actionWindow.processOk();
    await flush();
    assert.deepEqual(events.filter(e => e !== 'ok'), ['before save', 'save 1', 'save sound']);
    assert.equal(sys.id, 1);
    assert.ok(s._actionWindow.active);
    events.length = 0;
    s._actionWindow.processOk();
    assert.ok(s._confirmWindow.visible && s._confirmWindow.active && !s._actionWindow.active);
    assert.equal(s._helpWindow.text, 'ATTENTION: are you sure you want to overwrite this save file?');
    s._confirmWindow.select(1); s._confirmWindow.processOk();    // No
    assert.deepEqual(events.filter(e => e !== 'ok'), []);
    assert.ok(!s._confirmWindow.visible && s._actionWindow.active);
    assert.match(s._helpWindow.text, /^Saves the current progress/, 'the command help comes back');
    s._actionWindow.processOk(); s._confirmWindow.processOk();    // Yes
    await flush();
    assert.deepEqual(events.filter(e => e !== 'ok'), ['before save', 'save 1', 'save sound']);
    assert.ok(!events.includes('pop'));
});

test('Save Engine: Save is off where the game turned saving off, and on the load screen', () => {
    const w = world();
    w.sys.saveEnabled = false;
    assert.equal(w.open(w.Scene_Save)._actionWindow._list[1].enabled, false);
    const l = world();
    assert.equal(l.open(l.Scene_Load)._actionWindow._list[1].enabled, false);
    assert.equal(l.ctx.Window_MenuCommand.prototype.isSaveEnabled(), true, 'the menu command always opens the screen');
});

test('Save Engine: delete after Yes removes the file and its entry', async () => {
    const { open, Scene_Save, events, DataManager } = world();
    DataManager._globalInfo[3] = { playtime: '00:00:05' };
    const s = open(Scene_Save);
    s._fileWindow.select(3); s._actionWindow.update(); s._fileWindow.processOk();
    s._actionWindow.select(2); s._actionWindow.processOk();
    assert.equal(s._helpWindow.text, 'ATTENTION: are you sure you want to delete this save file?');
    events.length = 0;
    s._confirmWindow.processOk();
    assert.deepEqual(events.filter(e => e !== 'ok'), ['remove file3', 'global']);
    assert.equal(DataManager.savefileInfo(3), null);
    assert.equal(s._actionWindow._list[2].enabled, false);
});

test('Save Engine: the load screen loads at once, starts on the newest file and refuses empty slots', async () => {
    const { open, Scene_Load, events, DataManager, flush } = world();
    DataManager._globalInfo[0] = { timestamp: 10 };
    DataManager._globalInfo[5] = { timestamp: 30 };
    DataManager._globalInfo[7] = { timestamp: 20 };
    const s = open(Scene_Load);
    assert.equal(s._fileWindow.index(), 5);
    s._fileWindow.select(4); s._fileWindow.processOk();
    assert.deepEqual(events, ['buzzer']);
    s._fileWindow.select(0); s._fileWindow.processOk();
    assert.equal(s._actionWindow.currentSymbol(), 'load');
    s._actionWindow.processOk();
    await flush();
    assert.deepEqual(events.slice(2), ['ok', 'load 0', 'Scene_Load success']);
    assert.equal(DataManager.rrYeaLastSavefileId(), 0);
});

test('Save Engine: loading from the menu asks first, then loads without the load screen\'s extras', async () => {
    const { open, Scene_Save, events, DataManager, flush } = world();
    DataManager._globalInfo[2] = { timestamp: 1 };
    await DataManager.loadGame(2);
    const s = open(Scene_Save);
    assert.equal(s._fileWindow.index(), 2, 'the save screen starts on the file last saved or loaded');
    s._fileWindow.processOk();
    s._actionWindow.select(0); s._actionWindow.processOk();
    assert.equal(s._helpWindow.text, 'ATTENTION: are you sure you want to load this save file?');
    events.length = 0;
    s._confirmWindow.processOk();
    await flush();
    s.terminate();
    assert.deepEqual(events.filter(e => e !== 'ok'), ['load 2', 'load sound', 'fadeout', 'goto map', 'after load']);
});

test('Basic Autosave: after transfers (not a new game or a load), whatever Save Access; $auto_save stops it', async () => {
    const w = world();
    const ctx = w.ctx;
    ctx.Scene_Map.prototype.start = function() {};
    ctx.Scene_File.prototype.needsAutosave = () => false;
    vm.runInNewContext(plugin('RR_VlueAutosave'), ctx);
    const map = new ctx.Scene_Map();
    map._lastMapWasNull = false;
    ctx.$gameSystem.saveEnabled = false;
    assert.equal(map.isAutosaveEnabled() && map.shouldAutosave(), true);
    ctx.DataManager.setupNewGame();
    assert.equal(map.shouldAutosave(), false, 'the new game\'s first map');
    map.start();
    assert.equal(map.shouldAutosave(), true);
    await ctx.DataManager.loadGame(1);
    assert.equal(map.shouldAutosave(), false, 'a load');
    map.start();
    ctx.rrAutoSave = false;
    assert.equal(map.shouldAutosave(), false);
    ctx.rrAutoSave = null;
    assert.equal(map.shouldAutosave(), false, 'nil is false');
    ctx.rrAutoSave = 0;
    assert.equal(map.shouldAutosave(), true, 'Ruby truth: 0 is true');
    assert.equal(new ctx.Scene_Battle().shouldAutosave(), false, 'not after battles in this game');
    assert.equal(ctx.Scene_File.prototype.needsAutosave(), true);
    w.events.length = 0;
    assert.equal(ctx.rrSaveGame(0), true);
    assert.deepEqual(w.events, ['before save', 'save 0']);
});
