'use strict';
// What a battle start no longer does in its first frames. EffectManager.preloadMap
// loads the effects a map can play behind the map's loading fade (the scene
// waits for them), gathered from the map's commands, the party and the enemies
// the map can bring; a file that fails or stalls is let go. Reactor UI windows
// are built through the class the PIXI compatibility layer put on `window`
// (built(cls) in reactor_ui.js), so they skip the stand-in copy.
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');

const managers = runtimeSource('reactor_managers.js'), scenes = runtimeSource('reactor_scenes.js'), ui = runtimeSource('reactor_ui.js');
const between = (source, from, to) => {
    const start = source.indexOf(from), end = source.indexOf(to, start);
    assert.ok(start >= 0 && end > start, 'found ' + from);
    return source.slice(start, end);
};

const command = (code, parameters) => ({ code, indent: 0, parameters });
const animation = (id, effectName) => ({ id, name: 'A' + id, effectName });
const skill = (id, animationId) => ({ id, animationId });

/** EffectManager on an Effekseer stand-in whose loads finish when the test says; timers run when the test says. */
function effects({ effekseer = true, party = null, records = null } = {}) {
    const loads = [], released = [], timers = [];
    const Graphics = {
        effekseer: effekseer ? {
            loadEffect(url, scale, onLoad, onError) {
                const effect = { url, isLoaded: false, onLoad, onError };
                loads.push(effect);
                return effect;
            },
            releaseEffect(effect) { released.push(effect); }
        } : null
    };
    const $dataAnimations = [null];
    for (let id = 1; id <= 20; id++) $dataAnimations.push(animation(id, 'fx' + id));
    $dataAnimations[13] = animation(13, '');
    $dataAnimations[14] = animation(14, 'fx4');
    const $dataSkills = [null, skill(1, 1)];
    for (let id = 2; id <= 40; id++) $dataSkills.push(skill(id, id <= 20 ? id : 0));
    const $dataEnemies = [null,
        { id: 1, actions: [{ skillId: 5 }] }, { id: 2, actions: [{ skillId: 8 }] }, { id: 3, actions: [{ skillId: 9 }] },
        { id: 4, actions: [{ skillId: 15 }] }, { id: 5, actions: [{ skillId: 16 }] }, { id: 6, actions: [{ skillId: 17 }] }];
    const $dataTroops = [null, { members: [{ enemyId: 1 }] }, { members: [{ enemyId: 2 }, null] }, { members: [{ enemyId: 6 }] }];
    const context = {
        Graphics, $dataAnimations, $dataSkills, $dataEnemies, $dataTroops, console,
        Utils: { encodeURI: str => encodeURIComponent(str).replace(/%2F/g, '/') },
        setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
        $gameParty: party === false ? undefined : { battleMembers: () => party || [] },
        ReactorFight: records ? { Stage: { mapRecords: () => records } } : undefined
    };
    vm.createContext(context);
    vm.runInContext(between(managers, 'function EffectManager()', '//-----------------------------------------------------------------------------\n// AudioManager'), context);
    const E = vm.runInContext('EffectManager', context);
    return { E, loads, released, timers, context, urls: () => loads.map(effect => effect.url) };
}

const mapData = (lists, encounters = []) => ({
    events: [null, ...lists.map((list, i) => ({ id: i + 1, pages: [{ list: list.concat(command(0, [])) }, null] })), null],
    encounterList: encounters.map(troopId => ({ troopId, weight: 5, regionSet: [] }))
});

test('the animations a map can show: its commands, the party, and the enemies of its troops, records and encounters', () => {
    const actor = { attackAnimationId1: () => 10, skills: () => [11, 12].map(id => ({ id })) };
    const { E } = effects({ party: [actor, null], records: [{ record: 'enemy', id: 4 }, { record: 'actor', id: 9 }] });
    const map = mapData([
        [command(212, [-1, 2, false]), command(337, [0, 3])],
        [command(301, [0, 1, true, false]), command(301, [1, 7, false, false]), command(301, [2, 0, false, false])],
        [command(357, ['Plugin', 'Battle', '', { troopId: '2' }]), command(357, ['Plugin', 'Show', '', { record: 'enemy', id: '3' }])]
    ], [3]);
    const ids = Array.from(E.mapAnimationIds(map)).sort((a, b) => a - b);
    // 2, 3 shown; 10 the attack, 11, 12 skills; enemies 1 (troop 1), 2 (plugin troop), 3 (plugin record),
    // 4 (staged record), 6 (encounter troop 3) each attack with skill 1 (animation 1) and their own skill.
    assert.deepEqual(ids, [1, 2, 3, 5, 8, 9, 10, 11, 12, 15, 17]);
    assert.ok(!ids.includes(16), 'an enemy the map cannot bring is not read');
    // A skill that plays the normal attack (-1) and one with none (0) name no file.
    const none = effects({ party: [{ attackAnimationId1: () => 0, skills: () => [{ id: 25 }] }] }).E;
    assert.deepEqual(Array.from(none.mapAnimationIds(mapData([]))), []);
});

test('at most PRELOAD_SKILLS of each actor\'s skills are read', () => {
    const many = Array.from({ length: 19 }, (_, i) => ({ id: i + 2 }));
    const { E } = effects({ party: [{ attackAnimationId1: () => 0, skills: () => many }] });
    assert.equal(E.PRELOAD_SKILLS, 12);
    assert.deepEqual(Array.from(E.mapAnimationIds(mapData([]))).sort((a, b) => a - b), many.slice(0, 12).map(s => s.id));
});

test('each effect file loads once, behind the fade: the scene waits until it is in', () => {
    const { E, loads, urls } = effects();
    const map = mapData([[command(212, [-1, 4, false]), command(212, [-1, 14, false]), command(212, [-1, 13, false]), command(337, [0, 6])]]);
    assert.equal(E.preloadMap(map), 2, 'two files: animation 14 shares 4\'s file, 13 has none');
    assert.deepEqual(urls(), ['effects/fx4.efkefc', 'effects/fx6.efkefc']);
    assert.equal(E.isReady(), false, 'the map waits for them');
    assert.equal(E.preloadMap(map), 0, 'loaded or loading already: not again');
    assert.equal(E.load('fx4'), loads[0], 'a play finds the loaded effect');
    for (const effect of loads) { effect.isLoaded = true; effect.onLoad(); }
    assert.equal(E.isReady(), true);
    assert.equal(loads.length, 2);
});

test('a missing file is let go at once, a stalled one after PRELOAD_WAIT_MS; one that loads after all is released', () => {
    const { E, loads, released, timers } = effects();
    assert.equal(E.preloadMap(mapData([[command(212, [-1, 2, false]), command(212, [-1, 3, false]), command(212, [-1, 5, false])]])), 3);
    assert.ok(timers.every(t => t.ms === E.PRELOAD_WAIT_MS) && E.PRELOAD_WAIT_MS === 8000);
    const [missing, stalled, late] = loads;
    missing.onError('not found', missing.url);
    assert.equal(E._cache[missing.url], undefined, 'the missing file is let go');
    assert.doesNotThrow(() => E.isReady(), 'and is no load error for the map');
    assert.equal(E._errorUrls.length, 0);
    assert.equal(E.isReady(), false, 'the other two are still waited for');
    for (const timer of timers) timer.fn();
    assert.equal(E.isReady(), true, 'past the wait the map goes on');
    // The stalled one is played meanwhile: loaded again as a play loads it; then the first copy arrives and is released.
    const played = E.load('fx3');
    assert.notEqual(played, stalled);
    assert.equal(E._cache[stalled.url], played);
    stalled.isLoaded = true; stalled.onLoad();
    late.isLoaded = true; late.onLoad();
    assert.deepEqual(released, [stalled, late], 'the copies nobody holds are released');
    assert.equal(E._cache[stalled.url], played, 'the played one is kept');
    // An effect that loads in time is kept, never released.
    const fresh = effects();
    fresh.E.preloadMap(mapData([[command(212, [-1, 7, false])]]));
    fresh.loads[0].isLoaded = true; fresh.loads[0].onLoad();
    fresh.timers[0].fn();
    assert.deepEqual(fresh.released, []);
    assert.equal(fresh.E._cache['effects/fx7.efkefc'], fresh.loads[0]);
});

test('a load that fails as it is asked for is not waited for', () => {
    const { E, context } = effects();
    context.Graphics.effekseer.loadEffect = (url, scale, onLoad, onError) => { onError('gone', url); return { url, isLoaded: false }; };
    assert.equal(E.preload('fx1'), false);
    assert.equal(E.isReady(), true);
    context.Graphics.effekseer.loadEffect = () => { throw new Error('no context'); };
    assert.equal(E.preload('fx2'), false);
    assert.equal(E.isReady(), true);
});

test('preloadWithMap off, or no Effekseer, loads nothing ahead; the map\'s scene asks once its display is made', () => {
    const off = effects();
    off.E.preloadWithMap = false;
    assert.equal(off.E.preloadMap(mapData([[command(212, [-1, 2, false])]])), 0);
    assert.equal(off.loads.length, 0);
    const bare = effects({ effekseer: false });
    assert.equal(bare.E.preloadMap(mapData([[command(212, [-1, 2, false])]])), 0);
    assert.equal(bare.E.preloadMap(null), 0);
    const loaded = between(scenes, 'Scene_Map.prototype.onMapLoaded = function', 'Scene_Map.prototype.onTransfer = function');
    assert.ok(loaded.indexOf('this.createDisplayObjects()') < loaded.indexOf('EffectManager.preloadMap($dataMap)'), 'after the display is made');
    assert.match(loaded, /try \{ EffectManager\.preloadMap\(\$dataMap\); \} catch/, 'a failure leaves the map as it was');
    assert.match(between(scenes, 'Scene_Base.prototype.isReady = function', 'Scene_Base.prototype.start'), /EffectManager\.isReady\(\)/, 'the scene waits for the effects');
});

test('Reactor UI windows are built through the class on window when it is the same class upgraded, the file\'s own otherwise', () => {
    const source = between(ui, 'const built = cls => {', '\n    Window_ReactorUINode.prototype = ');
    const context = vm.createContext({});
    const built = vm.runInContext('(function() { ' + source + '\n return built; })()', context);
    const made = [];
    const make = name => vm.runInContext(`(function ${name}() { this.made = "${name}"; })`, context);
    // The compatibility layer's wrapper: same prototype, same name, builds the real container first.
    const Window_Upgraded = make('Window_Upgraded');
    const upgraded = vm.runInContext('(orig, made) => { const wrapped = function(...args) { made.push(orig.name); const self = Object.create(orig.prototype); orig.apply(self, args); self.real = true; return self; }; wrapped.prototype = orig.prototype; Object.defineProperty(wrapped, "name", { value: orig.name }); return wrapped; }', context)(Window_Upgraded, made);
    context.Window_Upgraded = upgraded;
    assert.equal(built(Window_Upgraded), upgraded);
    const window = new (built(Window_Upgraded))();
    assert.ok(window.real && window instanceof Window_Upgraded && window.made === 'Window_Upgraded');
    assert.deepEqual(made, ['Window_Upgraded']);
    // Nothing on window (no PIXI 8 layer), or another class under the name: the file's own.
    const Window_Plain = make('Window_Plain');
    assert.equal(built(Window_Plain), Window_Plain);
    const Window_Taken = make('Window_Taken');
    context.Window_Taken = make('Window_Taken');
    assert.equal(built(Window_Taken), Window_Taken, 'a different class of the same name is not used');
    context.Window_Plain = Window_Plain;
    assert.equal(built(Window_Plain), Window_Plain);
    // Both places the scene makes its windows go through it.
    assert.match(ui, /new \(built\(WindowClass\)\)\(ReactorUI\.windowRect\(rect, this, fit\), this, node\)/);
    assert.match(ui, /this\._measureWindow = new \(built\(Window_ReactorUINode\)\)\(/);
});

test('the Demo\'s MegaSkills pays the same costs and prints nothing while a battle runs (LOG_SKILL_COSTS off)', () => {
    const fs = require('node:fs'), path = require('node:path');
    const file = path.join(__dirname, '..', '..', 'template', 'Demo', 'js', 'plugins', 'PSYCHRONIC_MegaSkillsMZ.js');
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /const LOG_SKILL_COSTS = false;/);
    const printed = [];
    const klass = () => { const f = function() {}; f.prototype = {}; return f; };
    const context = vm.createContext({
        console: { log: (...args) => printed.push(args), warn() {}, error() {} },
        PluginManager: { parameters: () => ({}) },
        DataManager: { isDatabaseLoaded: () => true }, ColorManager: {}, TextManager: {}, ImageManager: {},
        Window_Base: klass(), Window_SkillList: klass(), Window_SkillType: klass(), Game_Battler: klass(), Game_BattlerBase: klass()
    });
    const B = context.Game_BattlerBase.prototype;
    B.skillMpCost = skill => skill.mpCost; B.skillTpCost = skill => skill.tpCost;
    B.canPaySkillCost = function(skill) { return this._mp >= this.skillMpCost(skill) && this._tp >= this.skillTpCost(skill); };
    B.paySkillCost = function(skill) { this._mp -= this.skillMpCost(skill); this._tp -= this.skillTpCost(skill); };
    B.maxTp = () => 100;
    vm.runInContext(source, context, { filename: 'PSYCHRONIC_MegaSkillsMZ.js' });
    const battler = Object.assign(Object.create(B), { _hp: 500, _mp: 200, _tp: 80, mhp: 500, mmp: 200, get hp() { return this._hp; } });
    const pay = skill => { battler.paySkillCost(Object.assign({ name: 'S', id: 1, mpCost: 0, tpCost: 0, hpCostPercent: 0, mpCostPercent: 0, tpCostPercent: 0 }, skill)); return [battler._hp, battler._mp, battler._tp]; };
    assert.deepEqual(pay({ mpCost: 10 }), [500, 190, 80], 'a plain cost');
    assert.deepEqual(pay({ hpCostPercent: 10 }), [450, 190, 80], 'ten percent of max HP');
    assert.deepEqual(pay({ mpCostPercent: 25, mpCost: 99 }), [450, 140, 80], 'a quarter of max MP, in place of the flat cost');
    assert.deepEqual(pay({ tpCostPercent: 50, tpCost: 5 }), [450, 140, 30], 'half of max TP');
    assert.deepEqual(printed, [], 'nothing printed');
});
