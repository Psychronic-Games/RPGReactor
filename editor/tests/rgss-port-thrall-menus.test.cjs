const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));

// Snippets of Thrall's own sections, as the game carries them.
const WINDOW_BASE = `class Window_Base < Window
  WLH = 24
  def draw_face(face_name, face_index, x, y, size = 96)
    bitmap = Cache.face(face_name)
    rect = Rect.new(0, 0, 0, 0)
    rect.x = face_index % 4 * 96 + (96 - size) / 2
    rect.y = face_index / 4 * 16 + (16 - 16) / 2
  end
end`;
const REDUX = `module YE
  module REDUX
    module MENU
      START_INDEX = 0
      MENU_COMMANDS =[ # Make sure you've read the instructions above.
         0, # Items
         2, # Equipment
         1, # Skills
         4, # Save
         5, # Settings
      ] # Do not remove this
      ICON_SETS ={ # "Unlisted" must exist for the unlisted commands.
        "Unlisted"      => 0,
      # -----Vocab----- => Icon
        "Equip"         => 298,
        "Items"         => 144,
        "Save"          => 6,
        "Settings"      => 7,
        "Skills"        => 1,
      } # Do not remove this.
      EXP_GAUGE_1   = 18         # Colour 1 for the EXP Gauge
      EXP_GAUGE_2   = 19         # Colour 2 for the EXP Gauge
      PERCENT_EXP   = "%#.1f%%" # Text format used for EXP percentage
    end
  end
end
class Window_Objectives < Window_Base
end
class Window_ReDuxMenuStatus < Window_MenuStatus
end`;
const SSI = `module COZZIEKUNS
  module SSI
    CATEGORY_TEXT = ""
    MOD_ALG_ITEM_CATEGORIES = {  # Make sure they are in order!!!
      0 => [144, "Items", false],
      1 => [298, "Weapons", false],
      2 => [637, "Armors", true],
    }
    MOD_ALG_ITEM_CATEGORY_WIDTH = 456 # How wide you want your text window.
  end
end`;
const OPTIONS = `module YE
  module SYSTEM
    TITLE = "Settings"
    BGM_VOLUME_VAR  = 31    # Variable
    BGM_MUTE_SWITCH = 8    # Switch
    WAIT_MODE_VAR = 10
  end
end
class Window_System < Window_Selectable
end`;
const PARTY_ORDER = `class Scene_Map
  ORDER_FREEZE_SWITCH_ID = 22
  alias modern_algebra_change_leader_modification_updt update
  def update
    modern_algebra_change_leader_modification_updt
    return if $game_switches[ORDER_FREEZE_SWITCH_ID]
    if Gamepad.trigger?(Gamepad.pgdn)
    end
    if Gamepad.trigger?(Gamepad.pgup)
      actors.unshift (actors.pop)
    end
  end
end`;
const OVERDRIVE = `module KGC\nmodule OverDrive\n  GAUGE_MAX = 1000\nend\nend`;

test('Thrall menu families: detected in the game\'s order, windows before the menu, events save through the menu port', () => {
    const scripts = [WINDOW_BASE, SSI, REDUX, OPTIONS, PARTY_ORDER];
    const fam = C.scriptFamilies(scripts);
    for (const key of ['thrallWindows', 'thrallMenu', 'thrallOptions', 'thrallPartyOrder']) assert.ok(fam.has(key), key);
    // Stock VX's Window_Base has no face strips: no Thrall windows for another VX game.
    assert.ok(!C.scriptFamilies(['class Window_Base < Window\n  WLH = 24\n  def draw_face(face_name, face_index, x, y, size = 96)\n    rect.y = face_index / 4 * 96 + (96 - size) / 2\n  end\nend']).has('thrallWindows'));
    const ctx = { constants: C.scriptConstants(scripts), families: fam };
    assert.equal(C.ruby('Auto_Save.new', 'statement', ctx), 'DataManager.rrThrallAutoSave?.();');
    assert.equal(C.ruby('$scene = Scene_Menu.new', 'statement', ctx), 'SceneManager.push(Scene_Menu);');
    const menu = C.FAMILIES.find(f => f.key === 'thrallMenu');
    assert.deepEqual(menu.requires, ['RR_ThrallWindows']);
});

test('settings come from the game\'s copies: menu commands, icons, categories, gauge, locker, YE::SYSTEM', () => {
    const scripts = [WINDOW_BASE, SSI, REDUX, OPTIONS, PARTY_ORDER, OVERDRIVE];
    const constants = C.scriptConstants(scripts);
    const menu = params('RR_ThrallMenu').extract({ scripts, constants, read: () => null });
    assert.deepEqual(JSON.parse(menu.menuCommands), [0, 2, 1, 4, 5]);
    assert.deepEqual(JSON.parse(menu.iconSets), { Unlisted: 0, Equip: 298, Items: 144, Save: 6, Settings: 7, Skills: 1 });
    assert.deepEqual(JSON.parse(menu.categories), { 0: [144, 'Items', false], 1: [298, 'Weapons', false], 2: [637, 'Armors', true] });
    assert.deepEqual([menu.categoryWidth, menu.expGauge1, menu.expGauge2, menu.percentExp, menu.odGaugeMax], ['456', '18', '19', '%#.1f%%', '1000']);
    const options = JSON.parse(params('RR_ThrallOptions').extract({ constants }).system);
    assert.deepEqual([options.TITLE, options.BGM_VOLUME_VAR, options.BGM_MUTE_SWITCH, options.WAIT_MODE_VAR], ['Settings', 31, 8, 10]);
    assert.deepEqual(params('RR_ThrallPartyOrder').extract({ scripts }), { freezeSwitch: '22' });
    // The shipped locker, read from the game's own file when it is there.
    const thrall = path.resolve(__dirname, '..', '..', 'template', 'Thrall', 'Data', 'Validation.rvdata');
    if (fs.existsSync(thrall)) {
        const withLocker = params('RR_ThrallMenu').extract({ scripts, constants, read: (rel) => (rel === 'Data/Validation.rvdata' ? fs.readFileSync(thrall) : null) });
        const locker = JSON.parse(withLocker.locker);
        assert.equal(locker.weapons.length, 3);
        assert.equal(locker.armors.length, 3);
        assert.deepEqual(locker.weapons[0].element_set, [1, 14]);
        assert.equal(locker.weapons[0].name, '', 'an empty locker slot has no name');
    }
});

/** Just enough of MZ for the ports' logic to run. */
function mzContext(extra = {}) {
    const cls = (name, base) => {
        const C = function() { this.initialize && this.initialize(...arguments); };
        if (base) C.prototype = Object.create(base.prototype);
        C.prototype.constructor = C;
        Object.defineProperty(C, 'name', { value: name });
        return C;
    };
    const Window_Base = cls('Window_Base');
    Window_Base.prototype.initialize = function(rect) { Object.assign(this, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }); };
    const Window_Selectable = cls('Window_Selectable', Window_Base);
    const Window_Command = cls('Window_Command', Window_Selectable);
    const scenes = {};
    for (const n of ['Scene_Base', 'Scene_MenuBase', 'Scene_Map', 'Scene_Title', 'Scene_Boot', 'Scene_Menu', 'Scene_Item', 'Scene_Equip', 'Scene_Status', 'Scene_Save', 'Scene_Load', 'Scene_GameEnd', 'Scene_Gameover']) scenes[n] = cls(n);
    scenes.Scene_Boot.prototype.loadSystemImages = function() {};
    scenes.Scene_Boot.prototype.start = function() {};
    scenes.Scene_Title.prototype.start = function() {};
    scenes.Scene_Map.prototype.updateCallMenu = function() {};
    scenes.Scene_Map.prototype.needsFadeIn = function() { return false; };
    scenes.Scene_Map.prototype.update = function() {};
    const vars = [], sws = [];
    const items = [], weapons = [], armors = [];
    const ctx = Object.assign({
        PluginManager: { parameters: () => ({}) },
        Window_Base, Window_Selectable, Window_Command,
        Rectangle: function(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); },
        ImageManager: { loadSystem: (name) => ({ name, isReady: () => true, width: 192 }) },
        ColorManager: { textColor: (n) => '#c' + n },
        Bitmap: function() {},
        DataManager: {
            isItem: (o) => !!o && o._k === 'i', isWeapon: (o) => !!o && o._k === 'w', isArmor: (o) => !!o && o._k === 'a', isSkill: () => false,
            onLoad() {}, makeSaveContents: () => ({}), makeSavefileInfo: () => ({}), extractSaveContents() {}
        },
        ConfigManager: { makeData: () => ({}), applyData() {}, save() {} },
        SceneManager: { _stack: [], goto(S) { this.went = S; }, prepareNextScene() {}, isSceneChanging: () => false, isPreviousScene: () => false, push(S) { this.went = S; } },
        SoundManager: {}, AudioManager: { updateBgmParameters(a) { this.bgm = a; }, updateBgsParameters() {}, updateMeParameters() {}, updateSeParameters(b, a) { this.se = a; } },
        TextManager: {}, Input: { isTriggered: () => false, isPressed: () => false },
        Game_Player: cls('Game_Player'), Game_Party: cls('Game_Party'),
        $gameVariables: { value: (id) => vars[id] || 0, setValue: (id, v) => { vars[id] = v; } },
        $gameSwitches: { value: (id) => !!sws[id], setValue: (id, v) => { sws[id] = v; } },
        $gameParty: { items: () => items.filter(Boolean), weapons: () => weapons.filter(Boolean), armors: () => armors.filter(Boolean), inBattle: () => false, numItems: () => 1 },
        $gameSystem: {}, $gameTemp: {}, $gameMap: {}, $gamePlayer: {}, $gameScreen: {}, $dataWeapons: [], $dataArmors: [], $dataItems: [], $dataSystem: { advanced: { screenScale: 2 } },
        Graphics: { width: 608, height: 480 },
        window: null, vars, sws, items, weapons, armors
    }, scenes, extra);
    ctx.Game_Player.prototype.isDashButtonPressed = function() { return 'mz'; };
    ctx.window = ctx;
    vm.createContext(ctx);
    return ctx;
}
const weapon = (id, name, elements, extra = {}) => Object.assign({ _k: 'w', id, name, iconIndex: 0, description: '1', note: '', price: 5, params: [0, 0, 10, 0, 0, 0, 5, 0],
    traits: elements.map(e => ({ code: 31, dataId: e, value: 0 })).concat([{ code: 22, dataId: 0, value: -0.1 }]) }, extra);
const armor = (id, name, kind, elements) => ({ _k: 'a', id, name, iconIndex: 0, description: '1', note: '', price: 5, etypeId: kind + 2, params: [0, 0, 7, 3, 2, 0, 0, 0],
    traits: elements.map(e => ({ code: 11, dataId: e, value: 0.5 })) });
const item = (id, name, rate, value) => ({ _k: 'i', id, name, iconIndex: 0, description: 'Restores', note: '', price: 10, occasion: 0, scope: 7,
    effects: [{ code: 12, dataId: 0, value1: rate / 100, value2: value }], damage: { elementId: 0 } });

test('the inventory lists by rarity or by type (variable 100), as Window_Item#refresh did', () => {
    const ctx = mzContext();
    vm.runInContext(plugin('RR_ThrallWindows'), ctx);
    const U = ctx.RRThrallUi;
    // Weapons: element 1-5 type, 9-14 rarity. Armour kind 0-3.
    const sword = weapon(1, 'Sword', [1, 14]), club = weapon(2, 'Club', [3, 11]), epicSword = weapon(3, 'Epic Sword', [1, 11]);
    ctx.weapons.push(sword, club, epicSword);
    ctx.items.push(item(1, 'Grape', 28, 2), item(2, 'Grape', 28, 2), item(3, 'Orange', 22, 1));
    const all = () => true;
    const names = (list) => Array.from(list, x => x.name);
    // Rarity: Epic (11) before Common (14); within a rarity, by type.
    assert.deepEqual(names(U.sortedWeapons(all)), ['Epic Sword', 'Club', 'Sword']);
    ctx.vars[100] = 1;
    // Type: slashing (1) before bludgeoning (3); within a type, by rarity.
    assert.deepEqual(names(U.sortedWeapons(all)), ['Epic Sword', 'Sword', 'Club']);
    // Items by MP recovery rate (rarity) or by MP recovery (type), the keys the game abused for it.
    ctx.vars[100] = 0;
    assert.deepEqual(names(U.sortedItems(all)), ['Orange', 'Grape', 'Grape']);
    ctx.vars[100] = 1;
    assert.deepEqual(names(U.sortedItems(all)), ['Orange', 'Grape', 'Grape']);
    // Armour by rarity then kind, or kind then rarity.
    ctx.weapons.length = 0; ctx.items.length = 0;
    ctx.armors.push(armor(1, 'Buckler', 0, [14]), armor(2, 'Shield', 0, [12]), armor(3, 'Helm', 1, [12]));
    ctx.vars[100] = 0;
    assert.deepEqual(names(U.sortedArmors(all)), ['Shield', 'Helm', 'Buckler']);
    ctx.vars[100] = 1;
    assert.deepEqual(names(U.sortedArmors(all)), ['Shield', 'Buckler', 'Helm']);
});

test('item names: rarity colours and marks, favourites by the FAVORITE record, level from the description', () => {
    const ctx = mzContext();
    vm.runInContext(plugin('RR_ThrallWindows'), ctx);
    const U = ctx.RRThrallUi;
    const mythic = weapon(1, 'Axe', [2, 9]);
    ctx.$dataWeapons[527] = weapon(527, 'FAVORITE', [18]);
    ctx.$dataArmors[491] = armor(491, 'FAVORITE', 0, [18]);
    assert.deepEqual(JSON.parse(JSON.stringify(U.itemNameStyle(mythic))), { text: 'Axe', color: 13 });
    ctx.sws[37] = true;
    assert.equal(U.itemNameStyle(mythic).text, 'Axe (M)');
    assert.equal(U.itemNameStyle(weapon(2, 'Stick', [3])).text, 'Stick (C)');
    assert.equal(U.itemNameStyle(item(1, '5 Gold', 0, 0)).color, 15);
    assert.equal(U.itemNameStyle(item(2, 'Orange', 22, 1)).color, 14);
    // A favourite gains element 18 (on the record and in the weapon's traits) and loses it again.
    U.toggleFavorite(mythic);
    assert.ok(U.hasElement(mythic, 18));
    assert.ok(mythic.traits.some(t => t.code === 31 && t.dataId === 18));
    assert.deepEqual(Array.from(U.overlayIcons(mythic)), [766]);
    U.toggleFavorite(mythic);
    assert.ok(!U.hasElement(mythic, 18));
    // Shards: weapons 19-22 (773 …), a legendary shard for 24-39; armour 19-22 (772 …).
    assert.deepEqual(Array.from(U.overlayIcons(weapon(3, 'Blade', [1, 30]))), [782]);
    assert.deepEqual(Array.from(U.overlayIcons(armor(4, 'Robe', 2, [20]))), [774]);
    assert.equal(U.levelReq(weapon(5, 'X', [], { description: '12' })), 12);
    assert.equal(U.levelReq(weapon(6, 'X', [], { description: '' })), 0);
    // The VX fields read back from the database: hit, armour kind, recovery rates.
    assert.equal(U.get(weapon(7, 'Y', []), 'hit'), 85);
    assert.equal(U.armorKind(armor(8, 'Z', 3, [])), 3);
    assert.equal(U.get(item(9, 'G', 28, 2), 'mp_recovery_rate'), 28);
    // The battle port's record wins when it has one.
    ctx.RRThrallVx = { of: (o) => (o.id === 7 ? { element_set: [5], hit: 70 } : null) };
    assert.equal(U.get(weapon(7, 'Y', []), 'hit'), 70);
    assert.deepEqual(Array.from(U.elementSet(weapon(7, 'Y', []))), [5]);
});

test('the menu redirects the engine\'s scenes, formats the EXP percentage, and keeps the game\'s database in the save', () => {
    const ctx = mzContext();
    vm.runInContext(plugin('RR_ThrallWindows'), ctx);
    vm.runInContext(plugin('RR_ThrallMenu'), ctx);
    const U = ctx.RRThrallUi;
    assert.equal(U.sprintf('%#.1f%%', 61.5384), '61.5%');
    assert.equal(U.sprintf('%#.1f%%', 100), '100.0%');
    ctx.SceneManager.goto(ctx.Scene_Menu);
    assert.equal(ctx.SceneManager.went, ctx.Scene_ThrallMenu);
    ctx.SceneManager.goto(ctx.Scene_Save);
    assert.equal(ctx.SceneManager.went, ctx.Scene_ThrallSave);
    // A class the engine wrapped after the plugins loaded is matched by its name.
    const Wrapped = function() {}; Object.defineProperty(Wrapped, 'name', { value: 'Scene_Load' });
    ctx.SceneManager.goto(Wrapped);
    assert.equal(ctx.SceneManager.went, ctx.Scene_ThrallLoad);

    // The shipped records, then the game's changes: only the changes go into the save, and come back on load.
    ctx.$dataWeapons.push(null, weapon(1, 'Sword', [1, 14]), weapon(2, 'Club', [3, 14]));
    ctx.RRThrallUi.capturePristine();
    ctx.$dataWeapons[2].name = 'Fine Club';
    U.setElementSet(ctx.$dataWeapons[2], [3, 11]);
    const contents = ctx.DataManager.makeSaveContents();
    const saved = JSON.parse(JSON.stringify(contents.rrThrallMenu.db.weapons));
    assert.deepEqual(saved.map(e => e[0]), [2], 'only the changed record');
    // The title reads the database again: back to the shipped club.
    U.reloadDatabase();
    assert.equal(ctx.$dataWeapons[2].name, 'Club');
    assert.deepEqual(Array.from(U.elementSet(ctx.$dataWeapons[2])), [3, 14]);
    // Loading the save brings the game's club back.
    ctx.$gameSystem.versionId = () => 1;
    ctx.$dataSystem.versionId = 1;
    ctx.DataManager.extractSaveContents({ rrThrallMenu: { db: { weapons: saved } } });
    assert.equal(ctx.$dataWeapons[2].name, 'Fine Club');
    assert.deepEqual(Array.from(U.elementSet(ctx.$dataWeapons[2])), [3, 11]);
});

test('the locker: the shipped Validation records fill weapons 524-526, and every save keeps them for the next game', () => {
    const locker = { weapons: [{ name: 'Old Axe', icon_index: 300, description: '4', note: '', price: 50, atk: 22, def: 0, spi: 3, agi: 8, hit: 90, element_set: [2, 12], state_set: [] }, null, null], armors: [null, null, null] };
    const ctx = mzContext({ PluginManager: { parameters: (name) => (name === 'RR_ThrallMenu' ? { locker: JSON.stringify(locker) } : {}) } });
    for (let id = 0; id <= 526; id++) ctx.$dataWeapons[id] = id ? weapon(id, '', []) : null;
    for (let id = 0; id <= 490; id++) ctx.$dataArmors[id] = id ? armor(id, '', 0, []) : null;
    vm.runInContext(plugin('RR_ThrallWindows'), ctx);
    vm.runInContext(plugin('RR_ThrallMenu'), ctx);
    const U = ctx.RRThrallUi;
    U.applyLocker();
    const axe = ctx.$dataWeapons[524];
    assert.deepEqual([axe.name, axe.iconIndex, axe.params[2], axe.params[6], U.get(axe, 'hit'), axe.id], ['Old Axe', 300, 22, 8, 90, 524]);
    assert.deepEqual(Array.from(U.elementSet(axe)), [2, 12]);
    // A save stores the locker as it is then; the next title puts it back.
    ctx.$dataWeapons[525].name = 'Stored Bow';
    U.writeValidation(0);
    ctx.$dataWeapons[525].name = '';
    U.applyLocker();
    assert.equal(ctx.$dataWeapons[525].name, 'Stored Bow');
});

test('settings: the volume variables and mute switches, auto dash, and the window sizes from the game\'s scale', () => {
    const ctx = mzContext();
    vm.runInContext(plugin('RR_ThrallWindows'), ctx);
    vm.runInContext(plugin('RR_ThrallOptions'), ctx);
    const U = ctx.RRThrallUi;
    ctx.vars[31] = 30;
    assert.equal(U.volume(90, 31, 8), 63, '90 × 70 / 100');
    ctx.sws[8] = true;
    assert.equal(U.volume(90, 31, 8), 0);
    ctx.AudioManager.updateBgmParameters({ name: 'Town', volume: 100 });
    assert.equal(ctx.AudioManager.bgm.volume, 0);
    ctx.sws[8] = false;
    ctx.vars[32] = 50;
    ctx.AudioManager.updateSeParameters({}, { name: 'Cursor', volume: 80 });
    assert.equal(ctx.AudioManager.se.volume, 40);
    assert.deepEqual(Array.from(U.windowSize(0)), [1216, 960]);
    assert.deepEqual(Array.from(U.windowSize(1)), [1520, 1200]);
    assert.deepEqual(Array.from(U.windowSize(2)), [1824, 1440]);
    assert.equal(ctx.TextManager.gameEnd, 'Settings');
    // Auto dash (switch 11): running unless dash is held.
    const player = new ctx.Game_Player();
    assert.equal(player.isDashButtonPressed(), 'mz');
    ctx.sws[11] = true;
    assert.equal(player.isDashButtonPressed(), true);
    ctx.Input.isPressed = (k) => k === 'shift';
    assert.equal(player.isDashButtonPressed(), false);
});

test('change party order: page down sends the leader to the back, page up brings the last to the front', () => {
    const ctx = mzContext();
    vm.runInContext(plugin('RR_ThrallPartyOrder'), ctx);
    const party = { ids: [1, 2, 3, 4] };
    Object.assign(party, {
        members: () => party.ids.map(id => ({ actorId: () => id })),
        removeActor: (id) => { party.ids = party.ids.filter(x => x !== id); },
        addActor: (id) => { if (!party.ids.includes(id)) party.ids.push(id); }
    });
    ctx.Game_Party.prototype.rrRotateForward.call(party);
    assert.deepEqual(party.ids, [2, 3, 4, 1]);
    ctx.Game_Party.prototype.rrRotateBack.call(party);
    assert.deepEqual(party.ids, [1, 2, 3, 4]);
    ctx.$gameParty = party;
    ctx.Input.isTriggered = (k) => k === 'pagedown';
    ctx.sws[22] = true;
    new ctx.Scene_Map().update();
    assert.deepEqual(party.ids, [1, 2, 3, 4], 'the freeze switch holds the order');
    ctx.sws[22] = false;
    new ctx.Scene_Map().update();
    assert.deepEqual(party.ids, [2, 3, 4, 1]);
});
