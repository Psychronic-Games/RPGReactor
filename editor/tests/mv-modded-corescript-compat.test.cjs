// The hand-edited MV corescript some released games ship (Braver 1.6.5)
// lives in the compatibility layer as additive shims: a stock game must
// see stock behaviour, and the game that needs them must get each one.
const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const compat = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');
const objects = runtimeSource('reactor_objects.js');
// Values built inside the sandbox carry another realm's prototypes; compare their shape.
const plain = value => JSON.parse(JSON.stringify(value));

function installerSource() {
    const start = compat.indexOf('    var BRAVER_FAMILIAR_TROOPS = ');
    const end = compat.indexOf('\n    function installPromiseRejectionCompatibility', start);
    assert.ok(start >= 0 && end > start, 'the installer is locatable');
    return compat.slice(start, end);
}

function makeWorld() {
    const mk = () => { const F = function() {}; return F; };
    const Scene_MenuBase = mk();
    const Game_Action = mk();
    Game_Action.prototype.apply = function(target) { this.applied = target; return 'stock-apply'; };
    const Game_BattlerBase = mk();
    Object.assign(Game_BattlerBase.prototype, {
        meetsUsableItemConditions: () => true, isSkillWtypeOk: () => true, canPaySkillCost: () => true,
        isSkillSealed: () => false, isSkillTypeSealed() { return this.sealedType; }
    });
    const Game_Enemy = mk();
    Game_Enemy.prototype.dropItemRate = () => 1;
    Game_Enemy.prototype.itemObject = (kind, id) => ({ kind, id });
    Game_Enemy.prototype.makeDropItems = function() { return 'stock-drops'; };
    const Game_Unit = mk();
    Game_Unit.prototype.isAllDead = function() { return this.aliveMembers().length === 0; };
    const Game_Event = mk();
    Game_Event.prototype.page = function() { return this.event().pages[this._pageIndex]; };
    Game_Event.prototype.list = function() { return this.page().list; };
    Game_Event.prototype.findProperPageIndex = function() { return 'stock-find'; };
    const Game_Interpreter = mk();
    Game_Interpreter.prototype.command301 = function(params) { this.received = params; return true; };
    Game_Interpreter.prototype.currentCommand = function() { return this.command; };
    const global = { Scene_MenuBase, Game_Action, Game_BattlerBase, Game_Enemy, Game_Unit, Game_Event, Game_Interpreter };
    const ctx = { global, Object, Array, Math, ...global };
    vm.runInNewContext(installerSource() + '\ninstallModdedCorescriptCompatibility();', ctx);
    return { global, ctx };
}

test('a stock MV game keeps stock behaviour through every shim', () => {
    const { global } = makeWorld();
    const { Game_Action, Game_BattlerBase, Game_Enemy, Game_Unit, Game_Event, Game_Interpreter } = global;
    // apply: the stock body still runs, and the result gained an invisible target.
    const result = {};
    const target = { result: () => result };
    const action = new Game_Action();
    assert.equal(action.apply(target), 'stock-apply');
    assert.equal(action.applied, target);
    assert.equal(result.target, target, 'the result remembers its target');
    assert.deepEqual(Object.keys(result), [], 'and JsonEx (Object.keys) never sees it');
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {}, 'so a save cannot loop through it');
    result.target = undefined;
    assert.deepEqual(Object.keys(result), [], "a plugin's own clear keeps it invisible");
    // skill conditions: a sealed type still seals an untagged skill.
    const battler = new Game_BattlerBase(); battler.sealedType = true;
    assert.equal(battler.meetsSkillConditions({ id: 1, stypeId: 2, meta: {} }), false);
    battler.sealedType = false;
    assert.equal(battler.meetsSkillConditions({ id: 1, stypeId: 2 }), true, 'no meta at all is fine');
    // drops: the editor's denominator rolls exactly as stock.
    const enemy = new Game_Enemy();
    enemy.enemy = () => ({ dropItems: [{ kind: 1, dataId: 7, denominator: 1 }, { kind: 0, dataId: 0, denominator: 1 }, { kind: 2, dataId: 3 }] });
    assert.deepEqual(plain(enemy.makeDropItems()), [{ kind: 1, id: 7 }], 'kind 0 and a drop with neither rate nor denominator never drop');
    // all dead: no Braver namespace, no reinforcement counter → stock.
    const unit = new Game_Unit(); unit.aliveMembers = () => [1];
    assert.equal(unit.isAllDead(), false);
    global.$gameTroop = { numTroopEnemiesAlive: () => 1 };
    assert.equal(unit.isAllDead(), false, 'HIME alone (no Braver) does not turn on the familiar rule');
    // event pages: a real page reads as before.
    const event = new Game_Event(); event._pageIndex = 0; event.event = () => ({ pages: [{ list: ['cmd'] }] });
    assert.deepEqual(plain(event.list()), ['cmd']);
    event.meetsConditions = page => page.ok;
    event.event = () => ({ pages: [{ ok: false }, { ok: true }] });
    assert.equal(event.findProperPageIndex(), 1);
    // battle processing: a parameter list passes straight through.
    const interpreter = new Game_Interpreter();
    interpreter.command301([1, 5, true, false]);
    assert.deepEqual(plain(interpreter.received), [1, 5, true, false]);
});

test("the modded corescript's contracts are supplied to the game that ships them", () => {
    const { global } = makeWorld();
    const { Scene_BattlePrep, Scene_MenuBase, Game_BattlerBase, Game_Enemy, Game_Unit, Game_Event, Game_Interpreter } = global;
    // Scene_BattlePrep is a Scene_MenuBase shell with its own name.
    assert.equal(typeof Scene_BattlePrep, 'function');
    assert.equal(Scene_BattlePrep.name, 'Scene_BattlePrep');
    assert.ok(Scene_BattlePrep.prototype instanceof Scene_MenuBase);
    assert.equal(Scene_BattlePrep.prototype.constructor, Scene_BattlePrep);
    // Skilltype Seal Immunity ignores a sealed type.
    const battler = new Game_BattlerBase(); battler.sealedType = true;
    assert.equal(battler.meetsSkillConditions({ id: 1, stypeId: 2, meta: { 'Skilltype Seal Immunity': true } }), true);
    // A drop with a rate, and a reducer a plugin can replace.
    const enemy = new Game_Enemy();
    enemy.enemy = () => ({ dropItems: [{ kind: 1, dataId: 7, rate: 1 }] });
    assert.deepEqual(plain(enemy.makeDropItems()), [{ kind: 1, id: 7 }], 'rate 1 always drops');
    enemy.enemy = () => ({ dropItems: [{ kind: 1, dataId: 7, rate: 0.000001 }] });
    assert.deepEqual(plain(enemy.makeDropItems()), [], 'a tiny rate practically never does');
    Game_Enemy.prototype.dropItemsReducer = (r, di) => r.concat('pity:' + di.dataId);
    enemy.enemy = () => ({ dropItems: [{ kind: 1, dataId: 9, denominator: 1000000 }] });
    assert.deepEqual(plain(enemy.makeDropItems()), ['pity:9'], 'the reducer is the extension point');
    // Familiar troops do not keep a battle going, in a Braver game.
    global.Braver = {};
    global.$gameParty = {};
    const counted = [];
    global.$gameTroop = { numTroopEnemiesAlive(id, alive) { counted.push(id); return id === 205 ? 2 : 0; } };
    const troop = new Game_Unit(); troop.aliveMembers = () => [1, 2];
    assert.equal(troop.isAllDead(), true, 'two living familiars are no living enemies');
    assert.deepEqual(counted.slice(0, 3), [202, 203, 204], "Braver 1.6.5's troop list by default");
    global.Braver.familiarTroops = [300];
    troop.aliveMembers = () => [1];
    assert.equal(troop.isAllDead(), false, 'a game that declares its own list is read instead');
    assert.equal(counted.at(-1), 300);
    const party = global.$gameParty; Object.setPrototypeOf(party, Game_Unit.prototype); party.aliveMembers = () => [];
    assert.equal(party.isAllDead(), true, 'the party is judged by the stock rule');
    // Null-safe pages.
    const event = new Game_Event(); event._pageIndex = -1; event.event = () => ({ pages: [] });
    const empty = event.page();
    assert.deepEqual(plain(empty.list), [], 'a whole empty page: plugins guard with if (page) and walk its list');
    assert.equal(empty.image.characterName, '');
    assert.deepEqual(plain(empty.moveRoute.list), [{ code: 0, parameters: [] }]);
    empty.list.push({ code: 108, parameters: ['<step_se>'] });
    assert.deepEqual(plain(event.page().list), [], 'what a plugin wrote into it does not stay');
    assert.deepEqual(plain(event.list()), []);
    event.event = () => null;
    assert.equal(event.findProperPageIndex(), -1);
    assert.deepEqual(plain(event.list()), []);
    // Battle Processing given a troop id reads escape/defeat from the command.
    const interpreter = new Game_Interpreter();
    interpreter.command = { parameters: [0, 1, true, false] };
    interpreter.command301(42);
    assert.deepEqual(plain(interpreter.received), [0, 42, true, false]);
    interpreter._params = [2, 0, false, true];
    interpreter.command301(43);
    assert.deepEqual(plain(interpreter.received), [0, 43, false, true], "MV's _params wins when a plugin set it");
});

test('installing twice is a no-op, and a game that defines Scene_BattlePrep first keeps its own', () => {
    const { global, ctx } = makeWorld();
    const before = { ...Object.fromEntries(['Game_Action', 'Game_Enemy', 'Game_Unit', 'Game_Event', 'Game_Interpreter'].map(n => [n, { ...global[n].prototype }])) };
    vm.runInNewContext('installModdedCorescriptCompatibility();', ctx);
    for (const name of Object.keys(before)) {
        for (const key of Object.keys(before[name])) assert.equal(global[name].prototype[key], before[name][key], `${name}.${key} is not wrapped again`);
    }
    const own = function() {};
    const world = makeWorld.toString(); // keep the helper honest about its shape
    assert.ok(world.includes('Scene_MenuBase'));
    const ctx2 = { global: { Scene_MenuBase: function() {}, Scene_BattlePrep: own }, Object, Array, Math };
    ctx2.Scene_MenuBase = ctx2.global.Scene_MenuBase; ctx2.Scene_BattlePrep = own;
    vm.runInNewContext(installerSource() + '\ninstallModdedCorescriptCompatibility();', ctx2);
    assert.equal(ctx2.global.Scene_BattlePrep, own);
});

test('the stock engine skips item effects on a dodged result and clears the flag with the result', () => {
    assert.match(objects, /Game_ActionResult\.prototype\.clear = function\(\) \{[\s\S]*?this\.dodged = false;/);
    const apply = objects.slice(objects.indexOf('Game_Action.prototype.apply = function(target) {'), objects.indexOf('};', objects.indexOf('Game_Action.prototype.apply = function(target) {')));
    assert.match(apply, /if \(!result\.dodged\) \{\s*for \(const effect of this\.item\(\)\.effects\)/, 'effects and the user effect sit behind the flag');
    assert.match(apply, /this\.updateLastTarget\(target\);\s*ReactorEvents\.emit\("actionApplied"/, 'the observer feed still fires');
});
