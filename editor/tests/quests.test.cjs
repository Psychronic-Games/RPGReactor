/**
 * Quests (GitHub #9): a Reactor database tab, the runtime's saved progress
 * and rules, the quest log, and the import from VisuStella's Quest System.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

/** The runtime module over stubs of everything it aliases. */
function loadRuntime(dataQuests, world = {}) {
    const registered = {};
    const stub = () => function() {};
    const proto = { prototype: {} };
    const context = {
        console,
        window: null,
        $dataReactorQuests: undefined,
        $dataSystem: world.system || { reactorQuests: {} },
        $gameSwitches: { value: id => !!(world.switches || {})[id] },
        $gameVariables: { value: id => (world.variables || {})[id] || 0 },
        Utils: { isNwjs: () => false },
        XMLHttpRequest: function() { this.open = () => {}; this.overrideMimeType = () => {}; this.send = () => this.onload && this.onload(); this.status = 404; },
        PluginManager: { registerCommand: (plugin, name, fn) => { registered[name] = fn; } },
        Game_System: { prototype: {} },
        Game_Map: { prototype: { update: stub() } },
        Window_MenuCommand: { prototype: { makeCommandList: stub() } },
        Scene_Menu: { prototype: { createCommandWindow: stub() } },
        Scene_MenuBase: { prototype: { create: stub(), update: stub() } },
        Scene_Boot: { prototype: { create: stub(), isReady: () => true, start: stub() } },
        Window_HorzCommand: { prototype: { initialize: stub(), update: stub() } },
        Window_Selectable: { prototype: { initialize: stub(), refresh: stub(), select: stub() } },
        Rectangle: stub(),
        SceneManager: { push: scene => { context.__pushed = scene; } },
        Input: { isRepeated: () => false },
        Graphics: { boxWidth: 816 },
        Bitmap: stub()
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(read('runtime/reactor_quests.js'), context);
    context.$dataReactorQuests = dataQuests;
    context.ReactorQuests._state = 'done';
    const system = Object.create(context.Game_System.prototype);
    context.$gameSystem = system;
    return { context, system, quests: system.quests(), registered, run: (name, args) => registered[name].call({}, args) };
}

const DATA = [null,
    { id: 1, key: 'welcome', name: 'Welcome', category: 'Main', objectives: [{ text: 'Talk', hidden: false, switchId: 0 }, { text: 'Secret', hidden: true, switchId: 0 }, { text: 'Flip', hidden: false, switchId: 7 }], rewards: [{ text: 'Potion', hidden: false }, { text: 'Ether', hidden: true }], activation: { type: 'command' }, completion: { type: 'objectives' } },
    { id: 2, key: 'auto', name: 'At start', category: 'Side', objectives: [], rewards: [], activation: { type: 'start' }, completion: { type: 'command' } },
    { id: 3, key: 'flag', name: 'By switch', category: 'Side', objectives: [{ text: 'x', hidden: false, switchId: 0 }], rewards: [], activation: { type: 'switch', switchId: 5 }, completion: { type: 'switch', switchId: 6 } },
    { id: 4, key: 'count', name: 'By variable', category: 'Main', objectives: [], rewards: [], activation: { type: 'variable', variableId: 2, operator: '>=', value: 3 }, completion: { type: 'command' } }
];

test('progress lives on Game_System, a quest is hidden until discovered, and objectives keep their authored visibility', () => {
    const { quests, context } = loadRuntime(DATA);
    assert.equal(quests.status(1), 'hidden');
    assert.equal(quests.isKnown(1), false);
    assert.equal(quests.discover('welcome'), true, 'by key as well as by id');
    assert.equal(quests.discover(1), false, 'a second discovery changes nothing');
    assert.equal(quests.status(1), 'known');
    assert.deepEqual([...quests.objectiveStates(1)], ['open', 'hidden', 'open']);
    assert.deepEqual([...quests.rewardsShown(1)], [true, false]);
    assert.deepEqual([...quests.known().map(q => q.id)], [1]);
    assert.equal(context.$gameSystem.quests(), quests, 'the same record every time');
    assert.equal(quests instanceof context.Game_Quests, true, 'a named class, so JsonEx restores it from a save');
});

test('objectives and rewards change one at a time or all at once, and "every shown objective" completes the quest', () => {
    const { quests } = loadRuntime(DATA);
    quests.setObjective(1, 0, 'complete');
    assert.deepEqual([...quests.objectiveStates(1)], ['done', 'hidden', 'open']);
    assert.equal(quests.status(1), 'known', 'the third objective is still open');
    quests.setObjective(1, 2, 'complete');
    assert.equal(quests.status(1), 'completed', 'the hidden one does not count');
    quests.reset(1);
    assert.equal(quests.status(1), 'hidden');
    quests.setObjective(1, 'all', 'show');
    assert.deepEqual([...quests.objectiveStates(1)], ['open', 'open', 'open'], 'showing every objective discovers the quest first');
    quests.setObjective(1, 1, 'fail');
    assert.deepEqual([...quests.objectiveStates(1)], ['open', 'failed', 'open']);
    quests.setReward(1, 1, true);
    assert.deepEqual([...quests.rewardsShown(1)], [true, true]);
    quests.setReward(1, 'all', false);
    assert.deepEqual([...quests.rewardsShown(1)], [false, false]);
    assert.equal(quests.setObjective(1, 9, 'complete'), false, 'an index past the list is refused');
});

test('the rules run on the map: start, switch and variable activation; switch-driven objectives and completion', () => {
    const world = { switches: {}, variables: {} };
    const { quests } = loadRuntime(DATA, world);
    quests.update();
    assert.deepEqual([...quests.known().map(q => q.id)], [2], 'only the start-of-game quest appears');
    world.switches[5] = true;
    quests.update();
    assert.deepEqual([...quests.known().map(q => q.id)], [2, 3], 'the switch quest appears when its switch is on');
    world.variables[2] = 2;
    quests.update();
    assert.equal(quests.isKnown(4), false);
    world.variables[2] = 3;
    quests.update();
    assert.equal(quests.isKnown(4), true, 'at or past the value');
    quests.discover(1);
    world.switches[7] = true;
    quests.update();
    assert.deepEqual([...quests.objectiveStates(1)], ['open', 'hidden', 'done'], 'an objective bound to a switch completes on its own');
    assert.equal(quests.status(1), 'known', 'but the first objective is still open');
    world.switches[6] = true;
    quests.update();
    assert.equal(quests.status(3), 'completed', 'a quest completing by switch');
});

test('tracking follows one active quest and lets go when it ends', () => {
    const { quests } = loadRuntime(DATA);
    quests.setTracked(1);
    assert.equal(quests.tracked(), 0, 'a hidden quest cannot be tracked');
    quests.discover(1);
    quests.setTracked(1);
    assert.equal(quests.tracked(), 1);
    quests.complete(1);
    assert.equal(quests.tracked(), 0);
    assert.deepEqual([...quests.completed().map(q => q.id)], [1]);
    quests.fail(3);
    assert.deepEqual([...quests.failed().map(q => q.id)], [3]);
});

test('the plugin commands drive the record and open the log', () => {
    const { quests, run, context } = loadRuntime(DATA);
    run('QuestSet', { questId: '1', action: 'discover' });
    assert.equal(quests.status(1), 'known');
    run('QuestObjective', { questId: 'welcome', objective: '1', state: 'complete' });
    assert.equal(quests.objectiveStates(1)[0], 'done');
    run('QuestObjective', { questId: '1', objective: 'all', state: 'show' });
    assert.equal(quests.objectiveStates(1)[1], 'open');
    run('QuestReward', { questId: '1', reward: '2', state: 'show' });
    assert.equal(quests.rewardsShown(1)[1], true);
    run('QuestSet', { questId: '1', action: 'track' });
    assert.equal(quests.tracked(), 1);
    run('QuestSet', { questId: '1', action: 'untrack' });
    assert.equal(quests.tracked(), 0);
    run('OpenQuestLog', { questId: '1' });
    assert.equal(context.__pushed, context.Scene_Quest);
    assert.equal(context.Scene_Quest.openOn, 1);
    run('QuestSet', { questId: '99', action: 'discover' });
    assert.equal(quests.known().length, 1, 'an unknown quest is ignored');
});

test('the main menu offers the log only when the project has quests and has not turned it off', () => {
    const { context } = loadRuntime(DATA, { system: { reactorQuests: { menuCommand: true, commandName: 'Journal' } } });
    assert.equal(context.ReactorQuests.menuEnabled(), true);
    assert.equal(context.ReactorQuests.settings().commandName, 'Journal');
    context.$dataSystem.reactorQuests.menuCommand = false;
    assert.equal(context.ReactorQuests.menuEnabled(), false);
    const { context: empty } = loadRuntime([null]);
    assert.equal(empty.ReactorQuests.menuEnabled(), false, 'nothing to show');
    assert.deepEqual([...context.ReactorQuests.categoriesOf(DATA.filter(Boolean))], ['Main', 'Side']);
});

test('the runtime file is in the manifest between the interfaces and compatibility, and the boot waits for its data', () => {
    const main = read('runtime/reactor_main.js');
    const scripts = main.match(/const\s+scriptUrls\s*=\s*(\[[\s\S]*?\]);/)[1];
    const at = name => scripts.indexOf(`"js/${name}"`);
    assert.ok(at('reactor_ui.js') < at('reactor_quests.js') && at('reactor_quests.js') < at('reactor_mv_compat.js'));
    for (const file of ['editor/build-scripts/build.js', 'editor/build-scripts/build-worker.js', 'editor/build-scripts/dist-editor-worker.js']) {
        assert.match(read(file), /'reactor_quests\.js'/, `${file} ships it`);
    }
    const runtime = read('runtime/reactor_quests.js');
    assert.match(runtime, /Scene_Boot\.prototype\.isReady = function\(\) \{\n\s*return _Scene_Boot_isReady\.apply\(this, arguments\) && ReactorQuests\.isReady\(\);/);
    assert.match(runtime, /Game_Map\.prototype\.update = function\(sceneActive\)/);
});

// --- the importer --------------------------------------------------------

function loadImporter() {
    const context = { console, module: undefined, globalThis: undefined, require };
    context.globalThis = context;
    vm.runInNewContext(read('editor/src/database/QuestImporter.js') + '\n;globalThis.__Q = QuestImporter;', context);
    return context.__Q;
}

/** A Categories parameter built the way the plugin stores it: JSON in JSON in JSON. */
function visustellaParameter(categories) {
    const note = text => JSON.stringify(text);
    return JSON.stringify(categories.map(category => JSON.stringify({
        'CategoryName:str': category.name,
        'Quests:arraystruct': JSON.stringify(category.quests.map(quest => JSON.stringify({
            'Key:str': quest.key, 'Header': '', 'Title:str': quest.title, 'Difficulty:str': quest.difficulty || '',
            'From:str': quest.from || '', 'Location:str': quest.location || '',
            'Description:arrayjson': JSON.stringify((quest.descriptions || []).map(note)),
            'Lists': '', 'Objectives:arrayjson': JSON.stringify((quest.objectives || []).map(note)),
            'VisibleObjectives:arraynum': JSON.stringify((quest.visibleObjectives || []).map(String)),
            'Rewards:arrayjson': JSON.stringify((quest.rewards || []).map(note)),
            'VisibleRewards:arraynum': JSON.stringify((quest.visibleRewards || []).map(String)),
            'Footer': '', 'Subtext:arrayjson': JSON.stringify((quest.subtexts || ['']).map(note)),
            'Quotes:arrayjson': JSON.stringify((quest.quotes || ['']).map(note)),
            'JavaScript': '', 'OnLoadQuestJS:func': JSON.stringify(quest.onLoad || '// Insert JavaScript code here.')
        })))
    })));
}

test('VisuStella quests come out layer by layer: keys, categories, hidden objectives and rewards, the spare texts kept in the note', () => {
    const QuestImporter = loadImporter();
    const raw = visustellaParameter([
        { name: '\\\\C[5]Main Quests', quests: [
            { key: 'Welcome', title: '\\\\i[87]Welcome Quest', difficulty: 'Easy', from: 'VisuStella', location: 'RPG Maker MZ',
              descriptions: ['Thank you for using the \\\\c[4]Quest System\\\\c[0].', 'A second description.'],
              objectives: ['First objective', 'Second, hidden', 'Third'], visibleObjectives: [1, 3],
              rewards: ['\\\\i[176]Potion x5', 'Secret'], visibleRewards: [1],
              subtexts: ['', 'Subtext here'], quotes: ['', 'Quote'], onLoad: 'console.log(1);' }
        ] },
        { name: 'Side', quests: [{ key: 'Errand', title: 'Errand', objectives: ['Go'], visibleObjectives: [1] }] }
    ]);
    const quests = QuestImporter.fromVisustellaCategories(raw);
    assert.equal(quests.length, 2);
    const [welcome, errand] = quests;
    assert.equal(welcome.key, 'Welcome');
    assert.equal(welcome.name, 'Welcome Quest', 'the title\'s leading icon code is lifted out of the name...');
    assert.equal(welcome.iconIndex, 87, '...into the icon Reactor draws in front of it');
    assert.equal(welcome.category, '\\C[5]Main Quests');
    assert.equal(welcome.difficulty, 'Easy');
    assert.equal(welcome.description, 'Thank you for using the \\c[4]Quest System\\c[0].');
    assert.deepEqual([...welcome.objectives.map(o => [...[o.text, o.hidden]])], [['First objective', false], ['Second, hidden', true], ['Third', false]]);
    assert.deepEqual([...welcome.rewards.map(r => [...[r.text, r.hidden]])], [['\\i[176]Potion x5', false], ['Secret', true]]);
    assert.equal(welcome.subtext, 'Subtext here', 'the first non-empty subtext');
    assert.equal(welcome.quotes, 'Quote');
    assert.match(welcome.note, /<Import: other descriptions>\nA second description\.\n<\/Import>/);
    assert.match(welcome.note, /<Import: on-load script>\nconsole\.log\(1\);\n<\/Import>/);
    assert.equal(welcome.activation.type, 'command', 'VisuStella quests appear by command; nothing else is known about them');
    assert.equal(errand.category, 'Side');
    assert.equal(errand.note, '', 'nothing spare, nothing noted');
    assert.equal(errand.objectives[0].switchId, 0);
});

test('a manifest is read the way the runtime resolves it, and a project without the plugin reads as none', () => {
    const QuestImporter = loadImporter();
    const manifest = `// Generated by RPG Maker.\nvar $plugins =\n[\n{"name":"VisuMZ_2_QuestSystem","status":true,"description":"","parameters":{"Categories:arraystruct":${JSON.stringify(visustellaParameter([{ name: 'A', quests: [{ key: 'k', title: 'T', objectives: ['o'], visibleObjectives: [1] }] }]))}}}\n];\n`;
    const plugins = QuestImporter.parseManifest(manifest);
    assert.equal(plugins.length, 1);
    const entry = QuestImporter.visustellaEntry(plugins);
    assert.ok(entry);
    assert.equal(QuestImporter.fromVisustellaCategories(entry.parameters['Categories:arraystruct']).length, 1);
    assert.equal(QuestImporter.visustellaEntry(QuestImporter.parseManifest('var $plugins = [{"name":"Other"}];')), null);
    assert.equal(QuestImporter.uniqueKey('k', new Set(['k', 'k2'])), 'k3');
    assert.equal(QuestImporter.uniqueKey('', new Set()), 'quest');
});

test('Yanfly quests come out of their numbered slots: category from Type, hidden objectives and rewards, untouched slots skipped', () => {
    const QuestImporter = loadImporter();
    const note = text => JSON.stringify(text);
    const slot = quest => JSON.stringify({
        'Title': quest.title || '', 'Type': quest.type || '', 'Difficulty': quest.difficulty || '', 'From': quest.from || '',
        'Location': quest.location || '', 'Description': JSON.stringify((quest.descriptions || []).map(note)),
        'Objectives List': JSON.stringify((quest.objectives || []).map(note)),
        'Visible Objectives': quest.visibleObjectives ? JSON.stringify(quest.visibleObjectives.map(String)) : '',
        'Rewards List': JSON.stringify((quest.rewards || []).map(note)),
        'Visible Rewards': quest.visibleRewards ? JSON.stringify(quest.visibleRewards.map(String)) : '',
        'Subtext': quest.subtexts ? JSON.stringify(quest.subtexts.map(note)) : ''
    });
    const params = {
        '---Main Menu---': '', 'Quest Command': 'Quests',
        'Quest 1': slot({ title: '\\i[677]Serious Questions', type: 'Primary Missions', difficulty: '\\c[6]Easy\\c[0]', from: 'Central Command', location: 'Osiris',
            descriptions: ['A drone is loose.\n<br>\nStop it.', 'Later description'], objectives: ['Get past the drones.', 'Eliminate the rest'], visibleObjectives: [1],
            rewards: ['Reputation +5', 'A secret'], visibleRewards: [1], subtexts: ['', 'Sub'] }),
        'Quest 2': slot({}),
        'Quest 3': slot({ title: 'Third', type: 'Side' }),
        'Quest 10': slot({ objectives: ['Only an objective'] })
    };
    const quests = QuestImporter.fromYanflyParameters(params);
    assert.deepEqual([...quests.map(q => q.key)], ['yep1', 'yep3', 'yep10'], 'slot order, empty slot 2 skipped, 10 sorts after 3');
    const [first, third, tenth] = quests;
    assert.equal(first.name, 'Serious Questions');
    assert.equal(first.iconIndex, 677, 'the leading icon code becomes the quest icon');
    assert.equal(first.category, 'Primary Missions');
    assert.equal(first.difficulty, '\\c[6]Easy\\c[0]');
    assert.equal(first.from, 'Central Command');
    assert.equal(first.description, 'A drone is loose.\n<br>\nStop it.');
    assert.deepEqual([...first.objectives.map(o => [...[o.text, o.hidden]])], [['Get past the drones.', false], ['Eliminate the rest', true]]);
    assert.deepEqual([...first.rewards.map(r => [...[r.text, r.hidden]])], [['Reputation +5', false], ['A secret', true]]);
    assert.equal(first.subtext, 'Sub');
    assert.match(first.note, /^<Import: YEP_QuestJournal quest 1>\n<Import: other descriptions>\nLater description\n<\/Import>/);
    assert.equal(third.name, 'Third');
    assert.deepEqual([...third.objectives], []);
    assert.equal(tenth.name, 'Quest 10', 'a quest with text but no title is named by its slot');
    assert.equal(QuestImporter.fromYanflyParameters(null).length, 0);
});

test('GS quests come out of their file: categories by index, later steps hidden, rewards named from the database', () => {
    const QuestImporter = loadImporter();
    const data = [
        ['Main Story', 'Side Quest'],
        { id: 1, icon: 77, cat: 0, name: 'Take Down Bertha', desc: 'A drone must be destroyed.',
          steps: [['Use the entrance.', true, 1, 1, false, 'default', true], ['Shut down the signal.', true, 1, 1, false, 'default', false], ['Defeat Bertha.', false]],
          rewards: [['xp', 50, 1, false], ['gold', 200, 1, true], ['item', 3, 2, false], ['weapon', 9, 1, false]] },
        null,
        { id: 3, cat: 1, name: 'Errand', desc: '', steps: [['Go']], rewards: [] }
    ];
    const names = (kind, id) => ({ 'item:3': 'Potion', 'weapon:9': 'Sword' })[`${kind}:${id}`] || '';
    assert.equal(QuestImporter.isGsData(data), true);
    assert.equal(QuestImporter.isGsData([null, { id: 1 }]), false, 'an MZ-shaped file is not GS');
    assert.equal(QuestImporter.isGsData([]), false);
    const quests = QuestImporter.fromGsData(data, names);
    assert.deepEqual([...quests.map(q => q.key)], ['gs1', 'gs3']);
    const [bertha, errand] = quests;
    assert.equal(bertha.name, 'Take Down Bertha');
    assert.equal(bertha.iconIndex, 77);
    assert.equal(bertha.category, 'Main Story');
    assert.equal(bertha.description, 'A drone must be destroyed.');
    assert.deepEqual([...bertha.objectives.map(o => [...[o.text, o.hidden]])], [['Use the entrance.', false], ['Shut down the signal.', true], ['Defeat Bertha.', true]],
        'the plugin shows only the first step at the start, whatever the file says');
    assert.deepEqual([...bertha.rewards.map(r => [...[r.text, r.hidden]])], [['50 EXP', false], ['200 Gold', true], ['Potion x2', false], ['Sword', false]]);
    assert.match(bertha.note, /^<Import: GS_QuestSystem quest 1>\n<Import: objective 1 tracks variable 1 to 1>\n<Import: objective 2 tracks variable 1 to 1>$/);
    assert.equal(errand.category, 'Side Quest');
    assert.equal(errand.note, '<Import: GS_QuestSystem quest 3>');
    assert.equal(QuestImporter.gsRewardText(['item', 4, 1], () => ''), 'item #4', 'no database, no name');
    assert.equal(QuestImporter.gsRewardText(['custom', 'Unknown', 'A medal', false]), 'A medal');
});

test('the dialog learns every source, present or not, from one project folder', () => {
    const QuestImporter = loadImporter();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-quests-'));
    try {
        fs.mkdirSync(path.join(dir, 'js'));
        fs.mkdirSync(path.join(dir, 'data'));
        const yanfly = JSON.stringify({ 'Title': 'One', 'Type': 'T', 'Objectives List': '["\"Go\""]', 'Visible Objectives': '["1"]' });
        fs.writeFileSync(path.join(dir, 'js', 'plugins.js'), `var $plugins =\n[\n{"name":"YEP_QuestJournal","status":false,"parameters":{"Quest 1":${JSON.stringify(yanfly)},"Quest 2":"{\\"Title\\":\\"\\"}"}}\n];\n`);
        fs.writeFileSync(path.join(dir, 'data', 'Quests.json'), JSON.stringify([['Cat'], { id: 1, cat: 0, name: 'A', steps: [['s']], rewards: [['item', 1, 1]] }, { id: 2, cat: 0, name: 'B', steps: [], rewards: [] }]));
        fs.writeFileSync(path.join(dir, 'data', 'Items.json'), JSON.stringify([null, { id: 1, name: 'Herb' }]));
        const available = QuestImporter.available(dir);
        assert.deepEqual(JSON.parse(JSON.stringify(available.map(entry => [entry.source, entry.present, entry.enabled, entry.count]))), [
            ['visustella', false, false, 0],
            ['yanfly', true, false, 1],
            ['gs', true, false, 2]
        ]);
        assert.equal(QuestImporter.read(dir, 'gs').quests[0].rewards[0].text, 'Herb', 'the reward is named from the project database');
        assert.equal(QuestImporter.read(dir, 'visustella'), null);
        assert.equal(QuestImporter.read(dir, 'nonsense'), null);
        fs.writeFileSync(path.join(dir, 'data', 'Quests.json'), JSON.stringify([null, { id: 1, name: 'Reactor-shaped' }]));
        assert.equal(QuestImporter.read(dir, 'gs'), null, 'a file that is not GS\'s is not offered as GS');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('a title\'s leading icon becomes the quest icon, and the enabled quest systems are read from the manifest alone', () => {
    const QuestImporter = loadImporter();
    assert.deepEqual({ ...QuestImporter.leadingIcon('\\I[87]Welcome') }, { iconIndex: 87, text: 'Welcome' });
    assert.deepEqual({ ...QuestImporter.leadingIcon('\\i[5] Spaced') }, { iconIndex: 5, text: ' Spaced' }, 'what follows the code is kept as written');
    assert.deepEqual({ ...QuestImporter.leadingIcon('Find the \\I[3]gem') }, { iconIndex: 0, text: 'Find the \\I[3]gem' }, 'an icon inside the title stays put');
    const yanfly = QuestImporter.fromYanflyQuest({ 'Title': '\\i[12]Slot quest', 'Objectives List': '["\\"Go\\""]' }, 4);
    assert.equal(yanfly.name, 'Slot quest');
    assert.equal(yanfly.iconIndex, 12);
    const iconOnly = QuestImporter.fromVisustellaQuest({ 'Key:str': 'bare', 'Title:str': '\\i[9]' }, 'Main');
    assert.equal(iconOnly.name, 'bare', 'a title that was only an icon falls back to the key');
    assert.equal(iconOnly.iconIndex, 9);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-quest-systems-'));
    try {
        fs.mkdirSync(path.join(dir, 'js'));
        fs.writeFileSync(path.join(dir, 'js', 'reactor_main.js'), '');
        const manifest = list => `var $plugins =\n${JSON.stringify(list)};\n`;
        const file = path.join(dir, 'js', 'reactor_plugins.js');
        fs.writeFileSync(file, manifest([{ name: 'VisuMZ_2_QuestSystem', status: true, parameters: {} }, { name: 'GS_QuestSystem', status: false, parameters: {} }]));
        assert.deepEqual(JSON.parse(JSON.stringify(QuestImporter.enabledSystems(dir))), [{ source: 'visustella', label: 'VisuStella Quest System' }]);
        fs.writeFileSync(file, manifest([{ name: 'VisuMZ_2_QuestSystem', status: false, parameters: {} }]));
        const later = Date.now() / 1000 + 5;
        fs.utimesSync(file, later, later);
        assert.deepEqual(JSON.parse(JSON.stringify(QuestImporter.enabledSystems(dir))), [], 'turning it off in the Plugin Manager is seen');
        assert.deepEqual(JSON.parse(JSON.stringify(QuestImporter.enabledSystems(path.join(dir, 'nope')))), []);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the quest icon opens the picker on the project\'s own IconSet, and a re-render wires the text codes again', () => {
    const calls = { picker: [], decorate: [], detached: 0 };
    const window = {
        RRIconPicker: { iconSetPathFor: projectPath => `${projectPath}/img/system/IconSet.png` },
        RRDatabaseTextCodes: { decorate: (container, options) => { calls.decorate.push([container, options.projectPath()]); return () => { calls.detached++; }; } }
    };
    const context = { console, module: undefined, globalThis: undefined, window, rrEscapeHtml: v => String(v) };
    context.globalThis = context;
    vm.runInNewContext(read('editor/src/database/DatabaseQuestEditor.js') + '\n;globalThis.__D = DatabaseQuestEditor;', context);
    const Editor = context.__D;
    const quest = Editor.normalize({ id: 1, name: 'Q', iconIndex: 3 });
    const parent = { currentProject: { path: 'D:/Game' }, showIconPicker: (...args) => calls.picker.push(args), refreshDatabaseListEntry: () => {}, _textCodeDetach: () => { calls.detached++; } };
    const editor = new Editor({ updateQuest: () => {}, getQuest: () => quest }, {}, null, parent);
    const handlers = {};
    const icon = { innerHTML: '', addEventListener: (type, fn) => { handlers[type] = fn; } };
    const container = { querySelectorAll: () => [], querySelector: selector => (selector === '.quest-icon' ? icon : null) };
    editor.attachListeners(container, quest);
    handlers.click();
    assert.equal(calls.picker.length, 1);
    assert.equal(calls.picker[0][0], 3);
    assert.equal(calls.picker[0][2], 'D:/Game/img/system/IconSet.png', 'the sheet the picker loads is the project\'s');
    calls.picker[0][1](42);
    assert.equal(quest.iconIndex, 42);
    editor.decorateTextCodes(container);
    assert.equal(calls.detached, 1, 'the previous wiring is released first');
    assert.deepEqual(calls.decorate.map(([node, projectPath]) => [node === container, projectPath]), [[true, 'D:/Game']]);
    parent._textCodeDetach();
    assert.equal(calls.detached, 2, 'and the new handle is the parent\'s to release');
    assert.match(read('editor/src/database/DatabaseQuestEditor.js'), /const rerender = \(\) => \{\n\s*this\.showQuestDetail\([^\n]*\n\s*this\.decorateTextCodes\(container\);/);
});

test('objectives and rewards are boxes that keep their line breaks, and every text the log draws previews its codes', () => {
    const context = { console, module: undefined, globalThis: undefined, window: {}, rrEscapeHtml: v => String(v), document: { createElement: () => ({ dataset: {}, innerHTML: '' }) } };
    context.globalThis = context;
    vm.runInNewContext(read('editor/src/database/DatabaseQuestEditor.js') + '\n;globalThis.__D = DatabaseQuestEditor;', context);
    const Editor = context.__D;
    const editor = new Editor({ getSystem: () => ({ switches: [], variables: [] }) }, {}, null, null);
    const quest = Editor.normalize({ id: 2, objectives: [{ text: 'Describe each objective\nhere.', hidden: false, switchId: 0 }] });
    const html = editor.listSection(quest, 'objectives', 'Objectives', 'Add').innerHTML;
    assert.match(html, /<textarea class="database-field-value quest-row-text" rows="2"[^>]*data-rr-textcodes="help" data-rr-textcodes-preview>Describe each objective\nhere\.<\/textarea>/);
    assert.doesNotMatch(html, /<input type="text"[^>]*data-prop="text"/, 'a text input would strip the break');
    assert.equal(editor.rowsFor(''), 1);
    assert.equal(editor.rowsFor('a\nb\nc\nd\ne\nf\ng\nh\ni\nj'), 8, 'past eight lines the box scrolls');
    const source = read('editor/src/database/DatabaseQuestEditor.js');
    for (const field of ['name', 'category', 'difficulty', 'from', 'location', 'description', 'subtext', 'quotes']) {
        assert.match(source, new RegExp(`data-field="${field}" data-quest-id="\\$\\{quest\\.id\\}" data-rr-textcodes="help" data-rr-textcodes-preview`), field);
    }
    assert.doesNotMatch(source, /data-field="(key|note)"[^>]*data-rr-textcodes/, 'the key and the note are never drawn in game');
    assert.match(source, /importer\.installedSystems\(project\.path\)/);
    assert.match(source, /class="quest-other-system" style="grid-column:1 \/ -1;/, 'the notice spans the form rather than squeezing into its first column');
});

test('the Quests list draws a name\'s codes the way the log does; every other tab keeps the name as typed', () => {
    const ui = read('editor/src/DatabaseEditorUI.js');
    const at = ui.indexOf('    paintDatabaseListName(span, text, type) {');
    assert.ok(at > 0, 'one helper writes list names');
    const body = ui.slice(at, ui.indexOf('\n    }\n', at));
    const painted = [];
    const helper = new Function('window', `return function${body.slice(body.indexOf('('))}\n}`)({ RRIconCodes: { paint: (span, text) => painted.push(text) } });
    const quest = {};
    helper.call(null, quest, '\\i[87]Welcome Quest', 'quests');
    assert.deepEqual(painted, ['\\i[87]Welcome Quest']);
    const skill = {};
    helper.call(null, skill, '\\I[64]Fire', 'skills');
    assert.equal(skill.textContent, '\\I[64]Fire', 'a skill name is left as typed');
    assert.equal(painted.length, 1);
    assert.equal((ui.match(/this\.paintDatabaseListName\(nameSpan, labels\.primary, (type|reference\.type)\)/g) || []).length, 3, 'the list, a refreshed row and a Referenced by row');
});

// --- which quest log the game uses ----------------------------------------

const plain = value => JSON.parse(JSON.stringify(value));

test('the menu command goes in as the list is built, after Formation, with its own handler; once, not in a submenu, not when VisuStella\'s log is the game\'s', () => {
    const { context } = loadRuntime(DATA);
    const base = context.Window_MenuCommand.prototype.makeCommandList;
    context.Scene_Boot.prototype.start.call({});
    const wrapped = context.Window_MenuCommand.prototype.makeCommandList;
    assert.notEqual(wrapped, base, 'wrapped at boot, once every plugin has loaded');
    context.Scene_Boot.prototype.start.call({});
    assert.equal(context.Window_MenuCommand.prototype.makeCommandList, wrapped, 'a second boot does not wrap it again');
    const menu = (subcategory = '') => ({
        _list: [], handlers: {},
        addCommand(name, symbol, enabled) { this._list.push({ name, symbol, enabled }); },
        findSymbol(symbol) { return this._list.findIndex(entry => entry.symbol === symbol); },
        setHandler(symbol, fn) { this.handlers[symbol] = fn; },
        currentSubcategory: () => subcategory
    });
    const top = menu();
    for (const symbol of ['item', 'skill', 'formation', 'options', 'save']) top.addCommand(symbol, symbol, true);
    wrapped.call(top);
    wrapped.call(top);
    assert.deepEqual(plain(top._list.map(entry => entry.symbol)), ['item', 'skill', 'formation', 'reactorQuest', 'options', 'save']);
    top.handlers.reactorQuest();
    assert.equal(context.__pushed, context.Scene_Quest, 'the handler comes with the command, since MainMenuCore replaces createCommandWindow');
    const submenu = menu('datalog');
    wrapped.call(submenu);
    assert.equal(submenu._list.length, 0, 'a MainMenuCore submenu keeps its own list');
    context.$dataSystem.reactorQuests.log = 'visustella';
    context.Imported = { VisuMZ_2_QuestSystem: true };
    context.Game_System.prototype.setQuestStatus = () => {};
    const other = menu();
    other.addCommand('formation', 'formation', true);
    wrapped.call(other);
    assert.equal(other.findSymbol('reactorQuest'), -1, 'VisuStella\'s log is on the menu instead');
});

test('with VisuStella\'s log chosen, progress made here is passed on to it by key; before the plugin runs, nothing is', () => {
    const world = { system: { reactorQuests: { log: 'visustella' } }, switches: {} };
    const { context, quests, run } = loadRuntime(DATA, world);
    const calls = [];
    const questData = { objectives: { WELCOME: [1] }, objectivesCompleted: {}, objectivesFailed: {}, rewards: { WELCOME: [1] }, rewardsClaimed: {}, rewardsDenied: {} };
    quests.discover(2);
    assert.equal(context.ReactorQuests.logMode(), 'reactor', 'chosen, but the plugin is not running');
    context.Imported = { VisuMZ_2_QuestSystem: true };
    Object.assign(context.Game_System.prototype, {
        setQuestStatus: (key, status) => calls.push(['status', key, status]),
        setQuestObjectives: (key, ids, status) => calls.push(['objectives', key, ids, status]),
        setQuestRewards: (key, ids, status) => calls.push(['rewards', key, ids, status]),
        setTrackedQuest: key => calls.push(['tracked', key]),
        questData: () => questData
    });
    assert.equal(context.ReactorQuests.logMode(), 'visustella');
    run('QuestSet', { questId: 'welcome', action: 'discover' });
    run('QuestObjective', { questId: '1', objective: '1', state: 'complete' });
    run('QuestObjective', { questId: '1', objective: 'all', state: 'show' });
    run('QuestReward', { questId: '1', reward: '2', state: 'show' });
    run('QuestSet', { questId: '1', action: 'track' });
    run('QuestSet', { questId: '1', action: 'fail' });
    run('QuestSet', { questId: '1', action: 'reset' });
    assert.deepEqual(plain(calls), [
        ['status', 'welcome', 'known'],
        ['objectives', 'welcome', [1], 'complete'],
        ['objectives', 'welcome', [1], 'complete'], ['objectives', 'welcome', [2, 3], 'show'],
        ['rewards', 'welcome', [2], 'show'],
        ['tracked', 'welcome'],
        ['status', 'welcome', 'failed'],
        ['status', 'welcome', 'remove']
    ]);
    assert.equal(questData.objectives.WELCOME, undefined, 'a reset quest\'s objectives start over in the plugin too');
    calls.length = 0;
    quests.discover(1);
    world.switches[7] = true;
    quests.update();
    assert.deepEqual(plain(calls), [
        ['status', 'welcome', 'known'],
        ['objectives', 'welcome', [1], 'show'], ['objectives', 'welcome', [2], 'remove'], ['objectives', 'welcome', [3], 'complete']
    ], 'an objective a switch completes is passed on as well');
    const visuScene = function VisuStellaSceneQuest() {};
    context.Scene_Quest = visuScene;
    run('OpenQuestLog', { questId: '1' });
    assert.equal(context.__pushed, visuScene, 'Open Quest Log opens the plugin\'s log');
    assert.equal(context.ReactorQuests.keyOf({ id: 5, key: '' }), 'ReactorQuest5');
});

test('quests written back into VisuStella\'s Quest System come out as they went in, keeping what Reactor has no field for', () => {
    const QuestImporter = loadImporter();
    const raw = visustellaParameter([
        { name: '\\C[5]Main Quests', quests: [
            { key: 'Welcome', title: '\\i[87]Welcome Quest', difficulty: 'Easy', from: 'NPC', location: 'Town',
              descriptions: ['First \\c[4]text\\c[0].', 'Second description.'],
              objectives: ['Talk\nto Reid', 'Hidden one'], visibleObjectives: [1],
              rewards: ['\\i[176]Potion'], visibleRewards: [1],
              subtexts: ['', 'Sub'], quotes: [''], onLoad: 'console.log(1);' }
        ] },
        { name: 'Side', quests: [{ key: 'Errand', title: 'Errand', objectives: ['Go'], visibleObjectives: [1], subtexts: [], quotes: [] }] }
    ]);
    assert.equal(QuestImporter.fromVisustellaCategories(raw, ['WELCOME'])[0].activation.type, 'start', 'known at the start there, appears at the start here');
    const quests = QuestImporter.fromVisustellaCategories(raw).map((quest, index) => Object.assign(quest, { id: index + 1 }));
    assert.equal(QuestImporter.toVisustellaCategories(quests, raw), raw, 'untouched quests write back byte for byte');

    quests[0].name = 'Welcome Home';
    quests[0].iconIndex = 0;
    quests[0].objectives[1].hidden = false;
    quests[0].category = 'Side';
    quests.push({ id: 3, key: '', name: 'Fresh', category: 'New', iconIndex: 5, description: 'D', objectives: [], rewards: [], subtext: '', quotes: '' });
    const written = JSON.parse(QuestImporter.toVisustellaCategories(quests, raw)).map(category => JSON.parse(category));
    assert.deepEqual(written.map(category => category['CategoryName:str']), ['Side', 'New'], 'an emptied category is dropped; a new one follows those the plugin had');
    const side = JSON.parse(written[0]['Quests:arraystruct']).map(struct => JSON.parse(struct));
    assert.deepEqual(side.map(struct => struct['Key:str']), ['Welcome', 'Errand']);
    assert.equal(side[0]['Title:str'], 'Welcome Home');
    assert.equal(side[0]['VisibleObjectives:arraynum'], '["1","2"]');
    assert.deepEqual(plain(QuestImporter.noteList(side[0]['Description:arrayjson'])), ['First \\c[4]text\\c[0].', 'Second description.'], 'the alternate description is kept');
    assert.deepEqual(plain(QuestImporter.noteList(side[0]['Subtext:arrayjson'])), ['', 'Sub'], 'the subtext goes back where it came from');
    assert.equal(side[0]['OnLoadQuestJS:func'], JSON.stringify('console.log(1);'));
    const fresh = JSON.parse(JSON.parse(written[1]['Quests:arraystruct'])[0]);
    assert.equal(fresh['Key:str'], 'ReactorQuest3', 'no key: the one the runtime passes on');
    assert.equal(fresh['Title:str'], '\\i[5]Fresh');
    assert.equal(fresh['Subtext:arrayjson'], '[]');
    assert.equal(fresh['OnLoadQuestJS:func'], JSON.stringify('// Insert JavaScript code here.'));
});

test('saving carries the quest log choice into the manifest, only once one was made and only when something changes', () => {
    const QuestImporter = loadImporter();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-quest-log-'));
    try {
        fs.mkdirSync(path.join(dir, 'js'));
        fs.writeFileSync(path.join(dir, 'js', 'reactor_main.js'), '');
        const file = path.join(dir, 'js', 'reactor_plugins.js');
        const general = JSON.stringify({ 'KnownQuests:arraystr': '["Old"]', 'TrackedQuest:str': 'Old' });
        const plugins = [
            { name: 'VisuMZ_0_CoreEngine', status: true, description: '', parameters: {} },
            { name: 'VisuMZ_2_QuestSystem', status: false, description: 'd', parameters: { 'General:struct': general, 'Categories:arraystruct': visustellaParameter([{ name: 'Main', quests: [{ key: 'Old', title: 'Old', objectives: [] }] }]) } }
        ];
        const header = '// Generated by RPG Reactor Plugin Manager\n// Do not edit this file directly - use the Plugin Manager instead\n\n';
        const original = header + 'var $plugins =\n' + JSON.stringify(plugins, null, 4) + ';\n';
        fs.writeFileSync(file, original);
        const quests = [
            { id: 1, key: 'Hero', name: 'Hero', category: 'Main', objectives: [], rewards: [], activation: { type: 'start' } },
            { id: 2, key: 'Later', name: 'Later', category: 'Main', objectives: [], rewards: [], activation: { type: 'command' } }
        ];
        assert.deepEqual(plain(QuestImporter.syncQuestLog(dir, quests, {})), { ok: true, changed: false }, 'no choice made, nothing written');
        assert.equal(fs.readFileSync(file, 'utf8'), original);
        assert.equal(QuestImporter.syncQuestLog(dir, quests, { log: 'visustella' }).changed, true);
        const text = fs.readFileSync(file, 'utf8');
        assert.ok(text.startsWith(header + 'var $plugins =\n'), 'written the way the Plugin Manager writes it');
        const written = QuestImporter.parseManifest(text);
        assert.equal(written[0].name, 'VisuMZ_0_CoreEngine', 'every other plugin is left as it was');
        assert.equal(written[1].status, true, 'the plugin is turned on');
        const back = QuestImporter.fromVisustellaCategories(written[1].parameters['Categories:arraystruct'], QuestImporter.visustellaKnownKeys(written[1].parameters));
        assert.deepEqual(plain(back.map(quest => [quest.key, quest.activation.type])), [['Hero', 'start'], ['Later', 'command']], 'the quest list is these quests, and a start-of-game quest is known at the start');
        assert.equal(JSON.parse(written[1].parameters['General:struct'])['TrackedQuest:str'], 'Old', 'the rest of General is left alone');
        assert.equal(QuestImporter.syncQuestLog(dir, quests, { log: 'visustella' }).changed, false, 'nothing new, no rewrite');
        assert.equal(QuestImporter.syncQuestLog(dir, quests, { log: 'reactor' }).changed, true);
        assert.equal(QuestImporter.parseManifest(fs.readFileSync(file, 'utf8'))[1].status, false, 'Reactor\'s log chosen: the plugin is turned off');
        assert.equal(fs.existsSync(file + '.tmp'), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the database save carries the choice, and a failure there fails the save', () => {
    const manager = read('editor/src/DatabaseManager.js');
    assert.match(manager, /if \(failed\.length === 0 && !this\.syncQuestLog\(projectPath\)\) \{\n\s*failed\.push\('js\/reactor_plugins\.js'\);/);
    const at = manager.indexOf('    syncQuestLog(projectPath) {');
    assert.ok(at > 0);
    const body = manager.slice(at, manager.indexOf('\n    }\n', at));
    const make = importer => new Function('QuestImporter', 'console', `return function${body.slice(body.indexOf('('))}\n}`)(importer, { error: () => {} });
    const self = setting => ({ getSystem: () => ({ reactorQuests: setting }), getQuests: () => ['q'] });
    const calls = [];
    const working = make({ syncQuestLog: (projectPath, quests, setting) => { calls.push([projectPath, quests, setting.log]); return { ok: true }; } });
    assert.equal(working.call(self({}), 'P'), true);
    assert.equal(calls.length, 0, 'no choice made, the plugin list is not asked');
    assert.equal(working.call(self({ log: 'visustella' }), 'P'), true);
    assert.deepEqual(calls, [['P', ['q'], 'visustella']]);
    const broken = make({ syncQuestLog: () => { throw new Error('disk full'); } });
    assert.equal(broken.call(self({ log: 'reactor' }), 'P'), false);
});

test('choosing VisuStella\'s log in the Quests tab brings in the quests it lacks here and keeps its start-of-game quests starting', () => {
    const importer = {
        SOURCES: { visustella: { label: 'VS' } },
        installedSystems: () => [{ source: 'visustella', label: 'VS', enabled: true }],
        read: () => ({ quests: [{ key: 'Welcome', name: 'W', activation: { type: 'start' } }, { key: 'ReactorQuest3', name: 'K', activation: { type: 'command' } }, { key: 'Fresh', name: 'F', activation: { type: 'command' } }] }),
        readManifest: () => [{}],
        visustellaEntry: () => ({ parameters: {} }),
        visustellaKnownKeys: () => ['welcome'],
        visustellaKeyOf: quest => quest.key || 'ReactorQuest' + quest.id,
        uniqueKey: wanted => wanted
    };
    const store = [null, { id: 1, key: 'Welcome', name: 'W', activation: { type: 'command' } }, { id: 2, key: 'Side', name: 'S', activation: { type: 'command' } }, { id: 3, key: '', name: 'K', activation: { type: 'command' } }];
    const system = {};
    const questions = [];
    const opened = [];
    const window = { confirm: text => { questions.push(text); return true; }, alert: () => {} };
    const context = { console, module: undefined, globalThis: undefined, window, rrEscapeHtml: v => String(v), QuestImporter: importer };
    context.globalThis = context;
    vm.runInNewContext(read('editor/src/database/DatabaseQuestEditor.js') + '\n;globalThis.__D = DatabaseQuestEditor;', context);
    const manager = {
        mutationGeneration: 0,
        getSystem: () => system,
        getQuests: () => store.filter(Boolean),
        getQuest: id => store[id],
        updateQuest: (id, data) => { store[id] = data; },
        addQuest: record => { const quest = Object.assign({}, record, { id: store.length }); store.push(quest); return quest; }
    };
    const parent = { currentProject: { path: 'P' }, openDatabase: type => opened.push(type), showDatabaseDetail: () => {} };
    const editor = new context.__D(manager, {}, null, parent);

    assert.equal(plain(editor.questLogState(editor.settings())).notes[0].startsWith('VS is also enabled.'), true, 'no choice yet: the two logs are described as separate');
    assert.equal(editor.chooseQuestLog('visustella'), true, 'an import happened, and it re-rendered');
    assert.equal(system.reactorQuests.log, 'visustella');
    assert.equal(store[1].activation.type, 'start', 'known at the start in the plugin');
    assert.equal(store[2].activation.type, 'command', 'a quest the plugin does not know stays as it was');
    assert.deepEqual(plain(store.slice(4).map(quest => quest.key)), ['Fresh'], 'only the quest this database lacked: a key-less quest read back under its id-made key is the same quest');
    assert.doesNotMatch(read('editor/src/database/DatabaseQuestEditor.js'), /\? '' : 'hidden'/, 'a bare hidden attribute loses to .db-col\'s display, so columns hide with DatabaseQuestEditor.HIDDEN');
    assert.match(questions[0], /^Saving will replace the quests in VS with the ones here\. /);
    assert.deepEqual(opened, ['quests']);
    assert.match(plain(editor.questLogState(editor.settings())).notes[0], /^Saving writes these quests into VS and turns it on\./);
    assert.equal(editor.chooseQuestLog('reactor'), false);
    assert.equal(system.reactorQuests.log, 'reactor');
    assert.match(plain(editor.questLogState(editor.settings())).notes[0], /^Saving turns VS off in the Plugin Manager/);
});

test('the quest log\'s category tabs draw their names through drawTextEx, so a coloured category shows its colour, not its code', () => {
    const { context } = loadRuntime(DATA);
    const drawn = [];
    const tab = {
        itemLineRect: () => ({ x: 10, y: 4, width: 200, height: 36 }),
        commandName: () => '\\C[5]Main Quests',
        textSizeEx: () => ({ width: 100, height: 36 }),
        resetTextColor: () => {},
        changePaintOpacity: () => {},
        isCommandEnabled: () => true,
        drawTextEx: (text, x, y, width) => drawn.push([text, x, y, width])
    };
    context.Window_QuestCategory.prototype.drawItem.call(tab, 1);
    assert.deepEqual(plain(drawn), [['\\C[5]Main Quests', 60, 4, 200]], 'centred on the width it measures, codes left for drawTextEx');
});

test('the Quests tab imports through one button and a source picker, not a plugin-named button', () => {
    const editor = read('editor/src/database/DatabaseQuestEditor.js');
    assert.match(editor, /quest-import"[^>]*>\$\{tt\('Import…'\)\}<\/button>/);
    assert.match(editor, /importButton\.addEventListener\('click', \(\) => this\.importQuests\(\)\)/);
    assert.match(editor, /QuestImporter\.available\(project\.path\)/);
    assert.match(editor, /showImportDialog\(sources, source => this\.importFrom\(source\)\)/);
    assert.match(editor, /QuestImporter\.read\(project\.path, source\)/);
    assert.doesNotMatch(editor, /'VisuStella Quest System'|VisuMZ_2_QuestSystem/, 'plugin names and labels come from QuestImporter.SOURCES, never from the editor');
    for (const key of ['Import Quests', 'not in this project', '{count} quest(s) found', 'Import {count} quest(s) from {source}?']) {
        assert.ok(editor.includes(`'${key}'`), key);
    }
});

// --- the editor ------------------------------------------------------------

test('the Quests tab is wired like every other Reactor tab, with its own file that a project only gains once it authors one', () => {
    const manager = read('editor/src/DatabaseManager.js');
    assert.match(manager, /\['quests', 'ReactorQuests\.json'\],\n\s*\['system', 'System\.json'\]/);
    assert.match(manager, /if \(!Array\.isArray\(loaded\.quests\) \|\| loaded\.quests\.length === 0\) loaded\.quests = \[null\];/);
    assert.match(manager, /if \(key === 'quests' && !this\.hasQuests\(\)\n\s*&& !this\.fs\.existsSync/);
    for (const method of ['getQuests()', 'getQuest(id)', 'hasQuests()', 'addQuest(record)', 'updateQuest(id, data)']) assert.ok(manager.includes(`    ${method} {`), method);
    const ui = read('editor/src/DatabaseEditorUI.js');
    assert.match(ui, /\{ name: 'Quests', type: 'quests' \},/);
    assert.match(ui, /case 'quests':\n\s*data = this\.databaseManager\.getQuests\(\);/);
    assert.match(ui, /else if \(type === 'quests' && this\.questEditor\) \{\n\s*this\.questEditor\.showQuestDetail\(detailEl, entry\);/);
    assert.match(ui, /quests: \{ name: 'New Quest', key: '', category: ''/);
    assert.match(ui, /'actors', 'enemies', 'quests'\]/, 'the list shows quest icons');
    assert.match(read('editor/src/I18nManager.js'), /quests: 'menu\.quests',/);
    assert.match(read('editor/src/ProjectManager.js'), /'ReactorQuests\.json': \[null\],/);
    const index = read('editor/index.html');
    for (const script of ['src/database/QuestImporter.js', 'src/database/DatabaseQuestEditor.js', 'src/event/commands/QuestCommandEditor.js']) assert.ok(index.includes(script), script);
});

test('the quest event commands are offered under Reactor > Game Flow and build the stored shape', () => {
    const picker = read('editor/src/event/EventCommandPicker.js');
    for (const name of ['QuestSet', 'QuestObjective', 'QuestReward', 'OpenQuestLog']) assert.match(picker, new RegExp(`code: 357, reactor: '${name}'`));
    const list = read('editor/src/event/EventCommandList.js');
    assert.match(list, /QuestCommandEditor\.supports\(name\)\) return this\.questCommandEditor;/);
    const context = { console, module: undefined, globalThis: undefined, window: {} };
    context.globalThis = context;
    vm.runInNewContext(read('editor/src/event/commands/QuestCommandEditor.js') + '\n;globalThis.__E = QuestCommandEditor;', context);
    const Editor = context.__E;
    assert.equal(Editor.supports('QuestSet'), true);
    assert.equal(Editor.supports('ShowVideoSurface'), false);
    const built = Editor.build('QuestObjective', { questId: '3', objective: '2', state: 'complete' }, 1);
    assert.equal(built.code, 357);
    assert.equal(built.indent, 1);
    assert.deepEqual([...built.parameters.slice(0, 2)], ['RPGReactor', 'QuestObjective']);
    assert.match(built.parameters[2], /^Quest Objective: #3 #2 → complete$/);
    assert.deepEqual({ ...built.parameters[3] }, { questId: '3', objective: '2', state: 'complete' });
    const log = Editor.build('OpenQuestLog', {}, 0);
    assert.equal(log.parameters[2], 'Open Quest Log');
});

test('the quest form normalizes an old record and writes nested fields and lists', () => {
    const context = { console, module: undefined, globalThis: undefined, window: {}, rrEscapeHtml: v => String(v) };
    context.globalThis = context;
    vm.runInNewContext(read('editor/src/database/DatabaseQuestEditor.js') + '\n;globalThis.__D = DatabaseQuestEditor;', context);
    const Editor = context.__D;
    const quest = Editor.normalize({ id: 4, name: 'Old' });
    assert.deepEqual({ ...quest.activation }, { type: 'command', switchId: 0, variableId: 0, operator: '>=', value: 0 });
    assert.deepEqual({ ...quest.completion }, { type: 'command', switchId: 0 });
    assert.deepEqual([...quest.objectives], []);
    const store = { 4: quest };
    const editor = new Editor({ getQuest: id => store[id], updateQuest: (id, data) => { store[id] = data; }, getSystem: () => ({ switches: [], variables: [] }) }, {}, null, null);
    editor.updateQuestField(4, 'activation.type', 'switch');
    editor.updateQuestField(4, 'activation.value', '12');
    editor.updateQuestField(4, 'key', '  hero-1 ');
    assert.equal(store[4].activation.type, 'switch');
    assert.equal(store[4].activation.value, 12);
    assert.equal(store[4].key, 'hero-1');
    editor.writePath(store[4], 'objectives.0.switchId', 9);
    assert.equal(store[4].objectives[0].switchId, 9, 'a list entry is created on the way');
});

test("Reactor's quest file and global never shadow a plugin's", () => {
    const runtime = read('runtime/reactor_quests.js');
    const editor = read('editor/src/DatabaseManager.js') + read('editor/src/ProjectManager.js');
    // YEP_QuestJournal and GS_QuestSystem both declare $dataQuests, and
    // GS_QuestSystem stores its quests in data/Quests.json: five of the
    // bundled MV projects carry that file. Reactor must neither read it as
    // its own nor let the editor rewrite it.
    assert.doesNotMatch(runtime, /\$dataQuests\b/);
    assert.doesNotMatch(runtime, /["']data\/Quests\.json["']/);
    assert.match(runtime, /data\/ReactorQuests\.json/);
    assert.doesNotMatch(editor, /['"]Quests\.json['"]/);
    assert.match(editor, /ReactorQuests\.json/);
});

for (const name of ['QuestSet', 'QuestObjective', 'QuestReward', 'OpenQuestLog']) {
    test(`${name} has an explicit unavailable state when the database has no quests`, () => {
        const node = () => ({ style: {}, value: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
        const quest = node(), index = node(), ok = node(), action = node();
        const modal = { style: {}, querySelector: selector => ({ '.qc-quest': quest, '.qc-index': index, '.qc-ok': ok, '.qc-action': action })[selector], querySelectorAll: () => [] };
        const context = { window: {}, document: { createElement: () => modal, body: { appendChild() {} } } };
        vm.runInNewContext(read('editor/src/event/commands/QuestCommandEditor.js') + '\n;globalThis.Editor = QuestCommandEditor;', context);
        const editor = new context.Editor({ getQuests: () => [null] });
        editor.show(null, () => {}, name);
        assert.equal(ok.disabled, name !== 'OpenQuestLog');
        assert.match(modal.innerHTML, name === 'OpenQuestLog' ? /the log itself/ : /No quests in the database yet/);
        quest.value = '1';quest.listeners.change();assert.equal(ok.disabled,false);
    });
}
