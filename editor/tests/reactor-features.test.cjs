/**
 * Database › Reactor Features: the registry of Reactor's additions a plugin
 * may also provide (editor/src/ReactorFeatures.js), the game's side of it
 * (runtime/reactor_features.js), plugin detection, defaults that keep every
 * existing project as it was, and a feature turned off leaving the Database
 * and the game.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const Features = require('../src/ReactorFeatures.js');

function runtimeFeatures() {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_features.js'), 'utf8'), ctx);
    return ctx;
}

test('every feature is a complete record, with a unique id and a known tier', () => {
    const ids = new Set();
    for (const f of Features.FEATURES) {
        assert.ok(/^[a-z][A-Za-z0-9]+$/.test(f.id), f.id);
        assert.ok(!ids.has(f.id), `${f.id} twice`);
        ids.add(f.id);
        assert.ok(['basic', 'advanced'].includes(f.tier), f.id);
        assert.equal(typeof f.label, 'string');
        assert.equal(typeof f.description, 'string');
        assert.equal(typeof f.default, 'boolean');
        assert.ok(typeof f.flag === 'string' && f.flag.length, f.id);
        assert.ok(Array.isArray(f.plugins) && f.plugins.every(name => typeof name === 'string' && name), f.id);
        // A new feature's flag lives in rrFeatures under its own id.
        if (f.flag.startsWith('rrFeatures.')) assert.equal(f.flag, `rrFeatures.${f.id}`);
    }
    const listed = Features.listed();
    assert.ok(listed.every(f => !f.pending), 'a feature still being built stays off the page');
    assert.deepEqual(listed.map(f => f.tier), listed.map(f => f.tier).slice().sort((a, b) => (a === 'basic' ? 0 : 1) - (b === 'basic' ? 0 : 1)), 'Basic first');
});

test('the game reads the same flags with the same defaults as the editor', () => {
    const { ReactorFeatures } = runtimeFeatures();
    const runtime = JSON.parse(JSON.stringify(ReactorFeatures.FLAGS));
    const editor = Object.fromEntries(Features.FEATURES.map(f => [f.id, [f.flag, f.default]]));
    assert.deepEqual(runtime, editor);
    // And it is in the game's boot list and in every build's runtime file list.
    assert.match(fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_main.js'), 'utf8'), /"js\/reactor_features\.js"/);
    for (const file of ['build.js', 'build-worker.js', 'dist-editor-worker.js']) {
        assert.match(fs.readFileSync(path.join(editorRoot, 'build-scripts', file), 'utf8'), /'reactor_features\.js'/, file);
    }
});

test('defaults keep what every existing project does today', () => {
    const { ReactorFeatures } = runtimeFeatures();
    // A stock System.json (nothing stored) has every Reactor addition it always had, and no compatibility flag.
    for (const system of [{}, null]) {
        for (const f of Features.FEATURES) {
            assert.equal(Features.on(f.id, system), f.default, f.id);
            assert.equal(ReactorFeatures.on(f.id, system), f.default, f.id);
        }
    }
    for (const id of ['classEquipSlots', 'quests', 'mapLighting2D', 'mapBattles', 'unsellableItems', 'enemyRanges', 'spriteTransforms', 'equipSlotLayouts']) {
        assert.equal(Features.on(id, {}), true, id);
    }
    // Higher Limits was an opt-in box (System 2 › Limits) before it was a feature: the same flag, still off unless ticked.
    assert.equal(Features.on('higherLimits', {}), false);
    assert.equal(Features.on('higherLimits', { rrHigherLimits: true }), true);
    assert.equal(ReactorFeatures.on('higherLimits', { rrHigherLimits: true }), true);
    // Every registered feature is wired now: none is held back from the page.
    assert.deepEqual(Features.FEATURES.filter(f => f.pending).map(f => f.id), []);
    // The older flags keep their own keys and meaning.
    assert.equal(Features.on('multiFrames', { rrMultiFrames: true }), true);
    assert.equal(Features.on('skipTitle', { rrSkipTitle: true }), true);
    assert.equal(ReactorFeatures.on('multiFrames', { rrMultiFrames: true }), true);
    // The Demo project, as shipped, is unchanged by the registry: its stored flags read back as they are.
    const demo = JSON.parse(fs.readFileSync(path.join(repoRoot, 'template', 'Demo', 'data', 'System.json'), 'utf8'));
    assert.equal(Features.on('multiFrames', demo), demo.rrMultiFrames === true);
    assert.equal(Features.on('skipTitle', demo), demo.rrSkipTitle === true);
    // An id nobody registered is never gated.
    assert.equal(Features.on('nothingLikeThis', {}), true);
    assert.equal(ReactorFeatures.on('nothingLikeThis', {}), true);
    // The game reads $dataSystem when no System is given.
    const ctx = runtimeFeatures();
    ctx.$dataSystem = { rrFeatures: { quests: false } };
    assert.equal(vm.runInContext('ReactorFeatures.on("quests")', ctx), false);
});

test('switching stores only what differs from the default, so stock stays stock', () => {
    const system = {};
    assert.equal(Features.set('quests', true, system), false, 'already on');
    assert.deepEqual(system, {});
    assert.equal(Features.set('quests', false, system), true);
    assert.deepEqual(system, { rrFeatures: { quests: false } });
    assert.equal(Features.on('quests', system), false);
    assert.equal(Features.set('mapBattles', false, system), true);
    assert.equal(Features.set('quests', true, system), true);
    assert.deepEqual(system, { rrFeatures: { mapBattles: false } });
    Features.set('mapBattles', true, system);
    assert.deepEqual(system, {}, 'an empty rrFeatures goes too');
    // An older flag: on stores true, off removes it, as System 2's Compatibility card does.
    Features.set('multiFrames', true, system);
    assert.deepEqual(system, { rrMultiFrames: true });
    Features.set('multiFrames', false, system);
    assert.deepEqual(system, {});
});

test('an enabled plugin that does the same job is found, by name or pattern, ignoring case', () => {
    const plugins = [
        { name: 'VisuMZ_0_CoreEngine', status: true },
        { name: 'YEP_EquipCore', status: true },
        { name: 'galv_questlogmz', status: true },
        { name: 'Community_Lighting_MZ', status: false },
        { name: 'SRPG_core_MZ', status: true }
    ];
    assert.deepEqual(Features.providers('classEquipSlots', plugins), ['YEP_EquipCore']);
    assert.deepEqual(Features.providers('quests', plugins), ['galv_questlogmz']);
    assert.deepEqual(Features.providers('mapLighting2D', plugins), [], 'a plugin switched off provides nothing');
    assert.deepEqual(Features.providers('mapBattles', plugins), ['SRPG_core_MZ']);
    assert.deepEqual(Features.providers('quests', [{ name: 'VisuMZ_2_QuestSystem', status: true }]), [],
        "VisuStella's Quest System works with Database › Quests, so it is not offered as a replacement");
    const found = Features.overlaps(plugins).map(entry => entry.feature.id);
    assert.deepEqual(found, ['classEquipSlots', 'quests', 'mapBattles', 'equipSlotLayouts', 'higherLimits']);
    assert.ok(!Features.overlaps(plugins).some(entry => entry.feature.pending), 'pending features are not reported');
});

test("the project's plugin list is read from reactor_plugins.js in a Reactor project, plugins.js otherwise", () => {
    const base = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'rr-features-'));
    try {
        const js = path.join(base, 'js');
        fs.mkdirSync(js);
        assert.deepEqual(Features.readProjectPlugins(base, fs, path), [], 'no list: none');
        fs.writeFileSync(path.join(js, 'plugins.js'), '// MZ\nvar $plugins =\n[\n{"name":"YEP_QuestJournal","status":true,"description":"","parameters":{}}\n];\n');
        assert.deepEqual(Features.readProjectPlugins(base, fs, path).map(p => p.name), ['YEP_QuestJournal']);
        fs.writeFileSync(path.join(js, 'reactor_main.js'), '');
        fs.writeFileSync(path.join(js, 'reactor_plugins.js'), 'var $plugins = [{"name":"VisuMZ_1_ItemsEquipsCore","status":true,"parameters":{"Note":"[a]"}}];');
        const list = Features.readProjectPlugins(base, fs, path);
        assert.deepEqual(list.map(p => p.name), ['VisuMZ_1_ItemsEquipsCore']);
        assert.deepEqual(Features.providers('classEquipSlots', list), ['VisuMZ_1_ItemsEquipsCore']);
        fs.writeFileSync(path.join(js, 'reactor_plugins.js'), 'var $plugins = [ broken');
        assert.deepEqual(Features.readProjectPlugins(base, fs, path), [], 'an unreadable list is none, never an error');
    } finally {
        fs.rmSync(base, { recursive: true, force: true });
    }
});

test('a feature turned off leaves the Database: the Quests page, the class slots card, the combat cards', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    let items = [];
    const el = () => ({ dataset: {}, classList: { add() {}, contains: () => false }, setAttribute() {}, addEventListener() {}, appendChild() {} });
    const nav = Object.assign(el(), { innerHTML: '', querySelector: () => null, querySelectorAll: () => [], appendChild: item => items.push(item) });
    const Editor = vm.runInNewContext(`${source}\nDatabaseEditorUI;`, {
        console, window: { ReactorFeatures: Features }, document: { getElementById: () => nav, createElement: el }
    });
    const pages = Editor.NAV_SECTIONS.flatMap(s => s.pages);
    assert.equal(pages.find(p => p.type === 'quests').feature, 'quests');
    assert.ok(pages.some(p => p.type === 'reactorFeatures'));

    // The sidebar, drawn into a stand-in list.
    const drawn = system => {
        items = [];
        const ui = Object.create(Editor.prototype);
        ui.databaseManager = { getSystem: () => system };
        ui._tt = text => text;
        ui._dbTitle = (_type, fallback) => fallback;
        ui.setupDatabaseNavigation();
        return items.map(item => item.dataset.type).filter(Boolean);
    };
    assert.ok(drawn({}).includes('quests'));
    assert.ok(!drawn({ rrFeatures: { quests: false } }).includes('quests'));
    assert.ok(drawn({ rrFeatures: { quests: false } }).includes('reactorFeatures'));

    // The combat cards are all about battles on the map.
    const tactics = vm.runInNewContext(`${fs.readFileSync(path.join(editorRoot, 'src', 'database', 'TacticsSection.js'), 'utf8')}\nwindow.RRTactics;`,
        { window: { ReactorFeatures: Features }, console });
    const off = { getSystem: () => ({ rrFeatures: { mapBattles: false } }) };
    assert.equal(tactics.createSection({ kind: 'class', record: {}, databaseManager: off }), null);

    // Can't be sold, the enemy ranges, the slot layouts and the turn controls each ask before they are drawn
    // (their own tests draw them both ways), and System 2 has no Higher Limits box of its own.
    const read = file => fs.readFileSync(path.join(editorRoot, 'src', file), 'utf8');
    for (const file of ['DatabaseItemEditor.js', 'DatabaseWeaponEditor.js', 'DatabaseArmorEditor.js']) {
        assert.match(read(`database/${file}`), /ReactorFeatures\.on\('unsellableItems', /, file);
    }
    assert.match(read('database/DatabaseEnemyEditor.js'), /features\.on\('enemyRanges', /);
    assert.match(read('database/DatabaseTraitEditor.js'), /features\.on\('equipSlotLayouts', /);
    assert.match(read('utils/EquipSlots.js'), /featureOn\('equipSlotLayouts', system\)/);
    assert.match(read('utils/EquipSlots.js'), /featureOn\('classEquipSlots', system\)/);
    assert.match(read('DatabaseEditorUI.js'), /ReactorFeatures\.on\('equipSlotLayouts', system\) \? '<section class="rr-types-panel rr-slot-layouts/);
    assert.match(read('event/commands/SetMovementRouteEditor.js'), /features\.on\('spriteTransforms', /);
    assert.match(read('event/EventPageEditor.js'), /features\.on\('spriteTransforms', /);
    assert.doesNotMatch(read('database/DatabaseSystem2Editor.js'), /path: 'rrHigherLimits'/);

    // The class editor asks before drawing its slots.
    const classEditor = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseClassEditor.js'), 'utf8');
    assert.match(classEditor, /features\.on\('classEquipSlots', system\)\) rightColumn\.appendChild\(this\.createEquipSlotsSection/);
});

test('a feature turned off leaves the game: class slots, quests, battles on the map, 2D lights', () => {
    const { fightWorld } = require('./helpers/fight-world.cjs');
    const features = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_features.js'), 'utf8');
    const w = fightWorld({ prepare: ctx => vm.runInContext(features, ctx) });
    const actor = w.$gameActors.actor(1);
    w.$dataClasses[actor._classId].rrEquipSlots = [1, 1, 2];
    assert.deepEqual(Array.from(actor.classEquipSlots()), [1, 1, 2]);
    w.$dataSystem.rrFeatures = { classEquipSlots: false };
    assert.equal(actor.classEquipSlots(), null, "off: MZ's one slot per equipment type");
    assert.equal(actor.equipSlots().length, w.$dataSystem.equipTypes.length - 1);

    const F = w.ReactorFight;
    w.$dataSystem.reactorBattle = { mode: 'tactical' };
    w.$dataSystem.rrFeatures = {};
    assert.equal(F.resolveMode(1), 'tactical');
    w.$dataSystem.rrFeatures = { mapBattles: false };
    assert.equal(F.resolveMode(1), 'classic');
    assert.equal(F.modeInForce(), 'classic');

    // Quests and the flat lights read the same switch (the files are checked by source: each asks ReactorFeatures).
    const quests = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_quests.js'), 'utf8');
    assert.match(quests, /ReactorQuests\.quests = function\(\) \{\n\s+if \(!ReactorQuests\.featureOn\(\)\) return \[\];/);
    assert.match(quests, /ReactorFeatures\.on\("quests"\)/);
    const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /ReactorFeatures\.on\("mapLighting2D"\)/);
});

test('the five later additions turned off leave the game as MZ: selling, enemies, slot layouts, limits, sprite turns', () => {
    const { fightWorld } = require('./helpers/fight-world.cjs');
    const features = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_features.js'), 'utf8');
    const w = fightWorld({ prepare: ctx => vm.runInContext(features, ctx) });
    const sys = w.$dataSystem;

    // Enemy Ranges: base stats, EXP and Gold, and one of each drop.
    w.$dataEnemies[1] = Object.assign({}, w.$dataEnemies[1], { rrStatVariance: 50, exp: 10, rrExpMax: 99, gold: 4, rrGoldMax: 99,
        dropItems: [{ kind: 1, dataId: 1, denominator: 1, rrQtyMin: 3, rrQtyMax: 3 }] });
    sys.rrFeatures = { enemyRanges: false };
    const enemy = new w.Game_Enemy(1, 0, 0);
    assert.equal(enemy.rrRoll(), null);
    assert.equal(enemy.paramBase(0), w.$dataEnemies[1].params[0]);
    assert.equal(enemy.exp(), 10);
    assert.equal(enemy.gold(), 4);
    assert.equal(enemy.makeDropItems().length, 1);
    sys.rrFeatures = {};
    assert.equal(enemy.makeDropItems().length, 3, 'on: the range drops');

    // Equipment Slot Layouts: a Slot Type that picked one is Normal.
    const actor = w.$gameActors.actor(1);
    sys.rrSlotLayouts = [{ name: 'Rings', slots: [1, 1] }];
    actor.slotType = () => 2;
    assert.equal(actor.slotLayout().name, 'Rings');
    sys.rrFeatures = { equipSlotLayouts: false };
    assert.equal(actor.slotLayout(), null);
    assert.equal(actor.ownEquipSlots(), actor.classEquipSlots());
    delete actor.slotType;

    // Higher Limits: one flag, off unless ticked, and MZ's caps while off.
    sys.rrFeatures = {};
    assert.equal(w.$gameParty.maxItems(), 99);
    assert.equal(w.$gameParty.maxGold(), 99999999);
    sys.rrHigherLimits = true;
    assert.equal(w.$gameParty.maxItems(), 9999);
    delete sys.rrHigherLimits;

    // Sprite Transforms and Unsellable Items (their own tests run them; here: each asks the registry).
    const map = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects_map.js'), 'utf8');
    assert.match(map, /Game_CharacterBase\.rrTransformsOn = function\(\) \{\n\s+return typeof ReactorFeatures === "undefined" \|\| ReactorFeatures\.on\("spriteTransforms"\);/);
    for (const head of ['reactorMirror = function(on) {', 'reactorFlip = function(on) {', 'reactorRotate = function(degrees, pivot) {']) {
        assert.ok(map.includes(`${head}\n    if (!Game_CharacterBase.rrTransformsOn()) return;`), head);
    }
    assert.match(map, /reactorSetupPageImage = function\(page\) \{\n\s+if \(!Game_CharacterBase\.rrTransformsOn\(\)\) return;/);
    assert.match(fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'), 'utf8'), /proto\.reactorRotate = function\(degrees, pivot\) \{\n[^\n]*\n\s+if \(typeof ReactorFeatures !== "undefined" && !ReactorFeatures\.on\("spriteTransforms"\)\) return;/);
    for (const file of ['reactor_windows.js', 'reactor_ui.js']) {
        assert.match(fs.readFileSync(path.join(repoRoot, 'runtime', file), 'utf8'), /ReactorFeatures\.on\("unsellableItems"\)/, file);
    }
});
