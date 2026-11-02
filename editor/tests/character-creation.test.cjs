'use strict';
// Character Creation: single-player and online alike, on the Forge's own modules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { followerWorld } = require('./helpers/follower-world.cjs');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');
const Controls = require('../src/forge/Character3D/CharacterControls.js');
const Targets = require('../src/forge/Character3D/HumanTargets.js');
const Hair = require('../src/forge/Character3D/CharacterHair.js');
const Wardrobe = require('../src/forge/Character3D/CharacterWardrobe.js');
const Species = require('../src/forge/Character3D/CharacterSpecies.js');
const deploy = require('../build-scripts/online-deploy.cjs');

const appRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(appRoot, file), 'utf8');
const scratch = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-character-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };

function creatorWorld(character, system = {}) {
    const world = followerWorld({ system });
    world.$dataReactorCharacters = character;
    world.localStorage = { store: {}, getItem(key) { return this.store[key] ?? null; }, setItem(key, value) { this.store[key] = value; } };
    world.TextEncoder = TextEncoder; world.TextDecoder = TextDecoder;
    vm.runInContext(`
        for (const name of ["Scene_Map", "Scene_Title", "Scene_Load", "Scene_MenuBase", "Scene_Base", "Window_Selectable"]) {
            if (typeof globalThis[name] === "undefined") globalThis[name] = ({ [name]: function() {} })[name];
        }
        Scene_Title.prototype.commandNewGame = function() { DataManager.setupNewGame(); SceneManager.goto(Scene_Map); };
        PluginManager = typeof PluginManager === "undefined" ? { registerCommand(plugin, name, run) { (this.commands = this.commands || {})[name] = run; } } : PluginManager;
        DataManager.setupNewGame = function() {};
    `, world);
    vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'reactor_character_creator.js'), 'utf8') + '\nObject.assign(globalThis, { ReactorCharacters, Scene_CharacterChoice, Scene_CharacterCreator });', world);
    return world;
}

test('the controls are the Forge\'s own: everything it adds, the game gains', () => {
    const tabs = Object.fromEntries(Controls.tabs({ species: 'all' }).map(tab => [tab.id, tab.controls]));
    const shapes = [...tabs.body, ...tabs.face].filter(control => control.path.startsWith('shapes.')).map(control => control.path.slice(7)).sort();
    assert.deepEqual(shapes, Targets.SLIDERS.map(slider => slider.key).sort(), 'every Forge slider, once');
    assert.equal(tabs.hair.find(control => control.path === 'hair.style').options.length, Hair.STYLES.length);
    assert.equal(tabs.outfit[0].options.length, Wardrobe.PRESETS.length);
    assert.equal(tabs.species[0].options.length, Species.SPECIES.length);
    for (const file of ['../runtime/reactor_character_creator.js', 'src/database/DatabaseCharacterCreationEditor.js']) {
        assert.equal(/longWavy|sidePart|torsoLength|tshirt/.test(read(file)), false, `${file} lists none of the Forge's catalog`);
    }
});

test('rules choose what a player sees', () => {
    assert.deepEqual(Controls.tabs({}).map(tab => tab.id), ['body', 'face', 'hair', 'outfit', 'colors'], 'one species needs no choice');
    assert.deepEqual(Controls.tabs({ face: false, outfit: false }).map(tab => tab.id), ['body', 'hair', 'colors']);
    const natural = Controls.tabs({}).find(tab => tab.id === 'body').controls.find(c => c.path === 'weight');
    const extreme = Controls.tabs({ extreme: true }).find(tab => tab.id === 'body').controls.find(c => c.path === 'weight');
    assert.ok(extreme.max > natural.max);
});

test('a recipe is held to the rules whatever sent it, and starts dressed', () => {
    const held = Controls.enforce({ species: 'orc', age: 12, weight: 5, anatomy: { detail: true }, shapes: { torsoLength: 9 } }, {});
    assert.equal(held.species, 'human');
    assert.equal(held.age, 18);
    assert.equal(held.weight, 1);
    assert.equal(held.anatomy.detail, false);
    assert.equal(held.shapes.torsoLength, 1);
    assert.ok(held.outfit.length > 0);
    const open = Controls.enforce({ species: 'orc', weight: 5, anatomy: { detail: true } }, { species: 'all', extreme: true, anatomy: true });
    assert.equal(open.species, 'orc');
    assert.equal(open.weight, 5);
    assert.equal(open.anatomy.detail, true);
    assert.equal(open.outfit, undefined, 'a project that allows it decides for itself');
});

test('a game with creation off plays as authored', () => {
    const world = creatorWorld(null);
    world.Scene_Title.prototype.commandNewGame.call({});
    assert.equal(world.SceneManager.pushed.at(-1), 'goto:Scene_Map');
    assert.equal(world.ReactorCharacters.open(), false);
    assert.equal(creatorWorld({ mode: 'off' }).ReactorCharacters.config(), null);
});

test('New Game opens the chosen way, single player included, and only when asked to', () => {
    for (const [mode, scene] of [['choose', 'Scene_CharacterChoice'], ['build', 'Scene_CharacterCreator']]) {
        const world = creatorWorld({ mode });
        world.Scene_Title.prototype.commandNewGame.call({});
        assert.equal(world.SceneManager.pushed.at(-1), 'goto:' + scene);
        assert.equal(world.ReactorCharacters.starting, true);
        assert.equal(world.$dataSystem.reactorOnline, undefined);
    }
    const eventOnly = creatorWorld({ mode: 'build', onNewGame: false });
    eventOnly.Scene_Title.prototype.commandNewGame.call({});
    assert.equal(eventOnly.SceneManager.pushed.at(-1), 'goto:Scene_Map');
    assert.equal(eventOnly.ReactorCharacters.open(), true, 'the event command still can');
    assert.equal(eventOnly.SceneManager.pushed.at(-1), 'Scene_CharacterCreator');
});

test('the boot and intro setup of a game is not a New Game', () => {
    const world = creatorWorld({ mode: 'build' });
    world.DataManager.setupNewGame();
    world.SceneManager.goto(world.Scene_Map);
    assert.equal(world.SceneManager.pushed.at(-1), 'goto:Scene_Map');
});

test('a single-player character leads the party as authored; finishing returns to where it was called', () => {
    const world = creatorWorld({ mode: 'choose' }), party = world.$gameParty;
    world.ReactorCharacters.applyActor(3, 'Solo');
    assert.equal(party._actors[0], 3);
    assert.ok(party._actors.length > 1, 'single player keeps the party');
    assert.equal(world.$gameActors.actor(3).name(), 'Solo');
    let popped = 0;
    world.SceneManager.pop = () => popped++;
    world.ReactorCharacters.finish();
    assert.equal(popped, 1);
});

test('returning from the name screen starts the game, though it arrives at a fresh scene', () => {
    const world = creatorWorld({ mode: 'choose' }), characters = world.ReactorCharacters, played = [];
    characters.namingActor = 2;
    characters.finish = () => played.push('finish');
    const scene = Object.create(world.Scene_CharacterChoice.prototype);
    world.Scene_MenuBase.prototype.start = () => {};
    scene._listWindow = { refresh() { played.push('list again'); } };
    scene.start();
    assert.deepEqual(played, ['finish']);
    assert.equal(characters.namingActor, 0);
    assert.equal(characters.profile().actorId, 2);
});

test('a character package carries its model, rig, motions and recipe, and refuses anything else', () => {
    const { ReactorCharacters: characters } = creatorWorld({ mode: 'build' });
    const glb = Uint8Array.from([1, 2, 3, 4, 5]).buffer, rig = Uint8Array.from([9, 8]).buffer;
    const out = characters.unpack(characters.pack({ recipe: { gender: 1 }, sidecar: { rig: {} }, height: 1.8, glb, rig }));
    assert.equal(out.recipe.gender, 1);
    assert.equal(out.height, 1.8);
    assert.deepEqual([...new Uint8Array(out.glb)], [1, 2, 3, 4, 5]);
    assert.deepEqual([...new Uint8Array(out.rig)], [9, 8]);
    assert.throws(() => characters.unpack(new ArrayBuffer(32)), /Not a character/);
});

test('a built character is that actor\'s model everywhere; other actors stay as authored', () => {
    const world = creatorWorld({ mode: 'build' }), characters = world.ReactorCharacters, spec = { name: 'Characters/Character-1' };
    characters.models.set('one', spec);
    characters.setCurrent({ actorId: 2, id: 'one', name: 'Ada' });
    assert.equal(world.Reactor3D.databaseModelSpec('actors', 2), spec);
    assert.notEqual(world.Reactor3D.databaseModelSpec('actors', 3), spec);
    assert.notEqual(world.Reactor3D.databaseModelSpecOfProject(2), spec);
});

test('a map waits for this save\'s character, and a missing one falls back to the actor', async () => {
    const world = creatorWorld({ mode: 'build' }), characters = world.ReactorCharacters;
    let finish;
    characters.fetch = () => new Promise(done => { finish = done; });
    characters.setCurrent({ actorId: 2, id: 'gone', name: 'Ada' });
    characters.prepareCurrent();
    assert.equal(characters.isCurrentReady(), false);
    finish(null);
    await new Promise(done => setTimeout(done, 5));
    assert.equal(characters.isCurrentReady(), true);
    assert.equal(characters.models.has('gone'), false);
});

test('the event command opens it, with nothing to set', () => {
    const Editor = vm.runInNewContext(read('src/event/commands/CharacterCommandEditor.js') + '\nCharacterCommandEditor;', { window: {} });
    assert.equal(Editor.supports('CharacterCreation'), true);
    let built;
    new Editor().show({ indent: 2 }, command => { built = command; });
    assert.deepEqual(JSON.parse(JSON.stringify(built)), { code: 357, indent: 2, parameters: ['RPGReactor', 'CharacterCreation', 'Character Creation', {}] });
    assert.match(read('src/event/EventCommandPicker.js'), /name: 'Character Creation', code: 357, reactor: 'CharacterCreation'/);
    assert.match(fs.readFileSync(path.join(runtimeRoot, 'reactor_character_creator.js'), 'utf8'), /registerCommand\("RPGReactor", "CharacterCreation"/);
});

test('the Database page keeps its settings in a file of their own, each project its own', () => {
    const Editor = vm.runInNewContext(read('src/database/DatabaseCharacterCreationEditor.js') + '\nDatabaseCharacterCreationEditor;', { window: {} });
    const settings = new Editor({}).settings(null);
    assert.equal(settings.mode, 'off');
    assert.equal(settings.rules.anatomy, false);
    settings.actors.push(5); settings.rules.face = false;
    assert.equal(Editor.RULES.face, true, 'the defaults are not shared');
    assert.equal(new Editor({}).settings({ mode: 'build' }).actors.length, 0);
    assert.match(read('src/DatabaseManager.js'), /\['characterCreation', 'ReactorCharacters\.json'\]/);
});

test('a game that builds characters ships the Forge from the editor\'s own source', t => {
    const stage = scratch(t);
    fs.mkdirSync(path.join(stage, 'data'));
    fs.mkdirSync(path.join(stage, 'js'));
    fs.copyFileSync(path.join(runtimeRoot, 'reactor_3d_motions.js'), path.join(stage, 'js/reactor_3d_motions.js'));
    fs.copyFileSync(path.join(runtimeRoot, 'reactor_3d_motions.bin'), path.join(stage, 'js/reactor_3d_motions.bin'));
    fs.writeFileSync(path.join(stage, 'data/ReactorCharacters.json'), JSON.stringify({ mode: 'choose' }));
    assert.equal(deploy.stageCharacterBuilder(stage, appRoot), false);
    assert.equal(fs.existsSync(path.join(stage, 'reactor-builder')), false, 'a game that does not build carries none of it');
    fs.writeFileSync(path.join(stage, 'data/ReactorCharacters.json'), JSON.stringify({ mode: 'build' }));
    assert.equal(deploy.stageCharacterBuilder(stage, appRoot), true);
    for (const name of ['CharacterGameWorker.js', 'CharacterControls.js', 'CharacterPreviewBrowserEntry.js', 'HumanBody.js']) {
        const shipped = path.join(stage, 'reactor-builder/src/forge/Character3D', name);
        assert.equal(fs.readFileSync(shipped, 'utf8'), read('src/forge/Character3D/' + name), name + ' is the Forge\'s file, unchanged');
    }
    assert.ok(fs.existsSync(path.join(stage, 'reactor-builder/src/forge/Character3D/data/reactor_3d_motions.bin')));
});

test('the server holds a character to the project\'s rules and to a real, self-contained model', () => {
    const php = read('build-scripts/online-server/api.php') + read('build-scripts/online-server/common.php');
    for (const rule of [/This game does not allow that species/, /This game does not allow that setting/, /Characters must be adults/, /needs characters to be dressed/, /A model must carry its own pictures/, /no room for more characters/, /That character is too large/]) {
        assert.match(php, rule);
    }
    const upload = php.slice(php.indexOf("if ($action === 'upload')"), php.indexOf("if ($action === 'model')"));
    assert.ok(upload.indexOf('player($secret)') < upload.indexOf('file_get_contents'), 'an upload names its player first');
    assert.ok(upload.indexOf('checkPackage') < upload.indexOf('rename('), 'nothing is kept before it is checked');
    assert.match(php, /preg_match\('\/\^\[a-f0-9\]\{64\}\$\/'/, 'a model is asked for by its hash alone');
});

test('a character finished in the game can talk: its model carries mouth shapes', () => {
    const worker = fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/CharacterGameWorker.js'), 'utf8');
    assert.match(worker, /message\.final && !result\.morphs\?\.length\) result\.morphs = [^\n]*morphTargets\(pack, result, MOUTH_SHAPES\)/);
    assert.match(worker, /'viseme_' \+ viseme\.id/);
});
