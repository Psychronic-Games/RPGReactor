const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const api = require(path.join(editorRoot, 'src', 'database', 'PassiveStatesSection.js'));

// ---------------------------------------------------------------- helpers

function manifest(entries) {
    return entries.map(([name, status, parameters]) => ({ name, status, description: '', parameters: parameters || {} }));
}

const STATES = [
    null,
    { id: 1, name: 'Poison', iconIndex: 2, note: '' },
    { id: 2, name: 'Regen', iconIndex: 0, note: '<Passive Stackable>' },
    { id: 3, name: 'Haste', iconIndex: 5, note: '' },
    { id: 4, name: 'Guard Up', iconIndex: 0, note: '' },
    { id: 5, name: 'regen', iconIndex: 0, note: '' }
];

const CORE_ON = ['VisuMZ_1_SkillsStatesCore', true];
const EQUIP_ON = ['VisuMZ_2_EquipPassiveSys', true];

/** An ElementStatusCore manifest entry with one Element set carrying passives. */
function elementStatusCore(options = {}) {
    const set = (name, passives, extra = {}) => JSON.stringify(Object.assign({
        'Name:str': name,
        'PassiveStates:arraynum': JSON.stringify(passives.map(String)),
        'RandomValid:eval': 'true',
        'RandomWeight:num': '1'
    }, extra));
    const type = (label, defaultName, defaultPassives, list, randomize = {}) => JSON.stringify({
        'Name:str': label, 'Label:str': label, 'Visible:eval': 'true',
        'RandomizeActor:eval': randomize.actor ? 'true' : 'false',
        'RandomizeEnemy:eval': randomize.enemy ? 'true' : 'false',
        'Default:struct': set(defaultName, defaultPassives),
        'List:arraystruct': JSON.stringify(list.map(([name, passives, extra]) => set(name, passives, extra)))
    });
    const parameters = {
        'TraitSetSettings:struct': JSON.stringify({ 'Enable:eval': options.enabled === false ? 'false' : 'true' })
    };
    for (const name of api.TRAIT_TYPES) parameters[`${name}:struct`] = type(name, 'Default', [], []);
    parameters['Element:struct'] = type('Element', 'Neutral', options.defaultPassives || [], [
        ['Fire', [3]],
        ['Ice', [4], { 'RandomValid:eval': 'false' }]
    ], options.randomize);
    parameters['Variant:struct'] = type('Variant', 'Normal', [], [['Mighty', [1]]]);
    return ['VisuMZ_1_ElementStatusCore', true, parameters];
}

// --------------------------------------------------------------- detection

test('the section is gated on Skills and States Core being enabled', () => {
    assert.equal(api.detect(null).skillsStatesCore, false);
    assert.equal(api.detect(manifest([['VisuMZ_1_SkillsStatesCore', false]])).skillsStatesCore, false);
    assert.equal(api.detect(manifest([CORE_ON])).skillsStatesCore, true);
    assert.deepEqual(api.availableKinds('enemy', api.detect(manifest([['VisuMZ_1_SkillsStatesCore', false], EQUIP_ON]))), []);
});

test('kinds follow the record type and the plugins the manifest enables', () => {
    const core = api.detect(manifest([CORE_ON]));
    for (const type of api.OBJECT_TYPES) assert.deepEqual(api.availableKinds(type, core), ['passive'], type);

    const equip = api.detect(manifest([CORE_ON, EQUIP_ON]));
    assert.deepEqual(api.availableKinds('actor', equip), ['passive', 'learnable', 'learned', 'already']);
    assert.deepEqual(api.availableKinds('class', equip), ['passive', 'learnable']);
    assert.deepEqual(api.availableKinds('weapon', equip), ['passive']);

    const battle = api.detect(manifest([CORE_ON, ['VisuMZ_2_EquipBattleSkills', true]]));
    assert.deepEqual(api.availableKinds('skill', battle), ['passive', 'equipState']);
    assert.deepEqual(api.availableKinds('actor', battle), ['passive']);
});

test('trait sets count as on only when ElementStatusCore enables them', () => {
    assert.equal(api.detect(manifest([CORE_ON, elementStatusCore()])).traitSets, true);
    assert.equal(api.detect(manifest([CORE_ON, elementStatusCore({ enabled: false })])).traitSets, false);
    assert.equal(api.detect(manifest([CORE_ON])).traitSets, false);
});

// ----------------------------------------------------------------- parsing

test('parsing mirrors SkillsStatesCore: ids, case-insensitive names, every tag, unknowns dropped', () => {
    const note = '<Passive State: 1>\n<Passive States: regen, 3 , Nobody>\n<PASSIVE STATE: Guard Up>';
    const entries = api.parseKind(note, 'passive', STATES);
    assert.deepEqual(entries.map(e => [e.token, e.id, e.resolved, e.ignored]), [
        ['1', 1, true, false],
        // "regen" resolves to the later state with that upper-cased name, as
        // DataManager.getStateIdWithName's cache does.
        ['regen', 5, true, false],
        ['3', 3, true, false],
        ['Nobody', 0, false, false],
        ['Guard Up', 4, true, false]
    ]);
});

test('a same-line pair of tags reads as the plugin reads it: one unknown name', () => {
    const entries = api.parseKind('<Passive State: 1> <Passive State: 2>', 'passive', STATES);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].token, '1> <Passive State: 2');
    assert.equal(entries[0].resolved, false);
});

test('a numeric id keeps its place even when no state has it', () => {
    const [entry] = api.parseKind('<Passive State: 99>', 'passive', STATES);
    assert.equal(entry.resolved, true);
    assert.equal(entry.exists, false);
});

test('empty tokens are not entries', () => {
    assert.deepEqual(api.parseKind('<Passive State: >\n<Passive States: 1,,2, >', 'passive', STATES).map(e => e.id), [1, 2]);
});

test('EquipPassiveSys kinds read only the first line tag, plus the block form', () => {
    const note = [
        '<Learnable Equip Passives: 1, 2>',
        '<Learnable Equip Passive: 3>',
        '<Learnable Equip Passive>',
        'Guard Up',
        ' 1',
        '</Learnable Equip Passives>'
    ].join('\n');
    const entries = api.parseKind(note, 'learnable', STATES);
    assert.deepEqual(entries.map(e => [e.token, e.id, e.ignored, e.form]), [
        ['1', 1, false, 'line'],
        ['2', 2, false, 'line'],
        ['3', 3, true, 'line'],
        ['Guard Up', 4, false, 'block'],
        // The plugin tests the raw line against /^\d+$/ before trimming, so
        // an indented number is looked up as a name and is not found.
        [' 1', 0, false, 'block']
    ]);
    assert.equal(api.parseKind('<Learned Equipped Passives: Haste>', 'learned', STATES)[0].id, 3);
    assert.equal(api.parseKind('<Already Equip Passive: 2>', 'already', STATES)[0].id, 2);
});

test('Equip State uses EquipBattleSkills\' lazy pattern and its Passive alias', () => {
    assert.deepEqual(api.parseKind('<Equip State: 1> <Equip Passive States: 2, 3>', 'equipState', STATES).map(e => [e.id, e.ignored]),
        [[1, false], [2, true], [3, true]]);
});

// ----------------------------------------------------------------- writing

test('writing consolidates a kind into one tag where the first one stood', () => {
    const note = 'a\n<Passive State: 1>\nb\n<Passive States: 2, 3>\nc';
    assert.equal(api.writeKind(note, 'passive', ['1', '2', '3', 'Haste']), 'a\n<Passive States: 1, 2, 3, Haste>\nb\nc');
    assert.equal(api.writeKind(note, 'passive', ['1']), 'a\n<Passive State: 1>\nb\nc');
    assert.equal(api.writeKind(note, 'passive', []), 'a\nb\nc');
});

test('writing appends when the note had no tag, and leaves other kinds alone', () => {
    assert.equal(api.writeKind('', 'passive', ['1']), '<Passive State: 1>');
    assert.equal(api.writeKind('<Level: 2>\n', 'passive', ['1', '2']), '<Level: 2>\n<Passive States: 1, 2>');
    const both = '<Learnable Equip Passive: 1>\n<Passive State: 2>';
    assert.equal(api.writeKind(both, 'learnable', ['3']), '<Learnable Equip Passive: 3>\n<Passive State: 2>');
    assert.equal(api.writeKind(both, 'learnable', []), '<Passive State: 2>');
});

test('removing the last tag of the note removes its line break too', () => {
    assert.equal(api.writeKind('<Level: 2>\n<Passive State: 1>', 'passive', []), '<Level: 2>');
    assert.equal(api.writeKind('<Passive State: 1>\n<Level: 2>', 'passive', []), '<Level: 2>');
    assert.equal(api.writeKind('<Passive State: 1>', 'passive', []), '');
});

test('a tag sharing its line with other text is replaced in place, not as a line', () => {
    assert.equal(api.writeKind('x <Passive State: 1> y', 'passive', ['2']), 'x <Passive State: 2> y');
    assert.equal(api.writeKind('x <Passive State: 1> y', 'passive', []), 'x  y');
});

test('addToken and removeEntry keep the tokens the author typed', () => {
    const note = '<Passive States: Regen, 3>';
    assert.equal(api.addToken(note, 'passive', '4', STATES), '<Passive States: Regen, 3, 4>');
    assert.equal(api.removeEntry(note, 'passive', 0, STATES), '<Passive State: 3>');
    assert.equal(api.removeEntry(note, 'passive', 5, STATES), note);
    // The block form is folded into the line form on the first edit.
    const block = '<Learnable Equip Passive>\nHaste\n</Learnable Equip Passives>';
    assert.equal(api.addToken(block, 'learnable', '1', STATES), '<Learnable Equip Passives: Haste, 1>');
});

test('the written tag is what the plugin regex reads back', () => {
    for (const kind of api.KIND_ORDER) {
        const note = api.writeKind('', kind, ['1', 'Haste']);
        assert.deepEqual(api.parseKind(note, kind, STATES).map(e => e.id), [1, 3], kind);
    }
});

// -------------------------------------------------------------- trait sets

test('trait set grants follow the singular tag, defaulting when it is absent or unknown', () => {
    const m = manifest([CORE_ON, elementStatusCore({ defaultPassives: [2] })]);
    const grants = note => api.traitSetGrants(m, note, 'enemy').map(g => `${g.type}:${g.setName}:${g.stateId}${g.random ? ':random' : ''}`);
    assert.deepEqual(grants('<Element: Fire>'), ['Element:Fire:3']);
    assert.deepEqual(grants('<element: fire>'), ['Element:Fire:3']);
    assert.deepEqual(grants(''), ['Element:Neutral:2']);
    assert.deepEqual(grants('<Element: Plasma>'), ['Element:Neutral:2']);
    assert.deepEqual(grants('<Element: Fire>\n<Variant: Mighty>'), ['Element:Fire:3', 'Variant:Mighty:1']);
});

test('the <Trait Sets> block, the a/b pair and <Random type> blocks resolve as the runtime does', () => {
    const m = manifest([CORE_ON, elementStatusCore()]);
    const grants = note => api.traitSetGrants(m, note, 'actor').map(g => `${g.type}:${g.setName}:${g.stateId}${g.random ? ':random' : ''}`);
    assert.deepEqual(grants('<Trait Sets>\n Element: Fire\n Variant: Mighty\n</Trait Sets>'), ['Element:Fire:3', 'Variant:Mighty:1']);
    // A singular tag written later overrides the block, as the runtime's
    // order of application does.
    assert.deepEqual(grants('<Trait Sets>\n Element: Fire\n</Trait Sets>\n<Element: Ice>'), ['Element:Ice:4']);
    assert.deepEqual(grants('<Element: Fire/Ice>'), ['Element:Fire:3']);
    assert.deepEqual(grants('<Element: Fire, Ice>'), ['Element:Fire:3:random', 'Element:Ice:4:random']);
    assert.deepEqual(grants('<Random Element>\n Fire: 70\n Ice: 30\n</Random Element>'), ['Element:Fire:3:random', 'Element:Ice:4:random']);
    assert.deepEqual(grants('<Random Element>\n Fire: 1\n</Random Element>'), ['Element:Fire:3']);
});

test('a Randomize flag draws from the valid sets unless the note opts out', () => {
    const m = manifest([CORE_ON, elementStatusCore({ randomize: { enemy: true }, defaultPassives: [2] })]);
    const enemy = note => api.traitSetGrants(m, note, 'enemy').map(g => `${g.setName}:${g.stateId}:${g.random}`);
    // Ice is RandomValid false, so only Neutral (the default) and Fire can come up.
    assert.deepEqual(enemy(''), ['Neutral:2:true', 'Fire:3:true']);
    assert.deepEqual(enemy('<No Random Trait Sets>'), ['Neutral:2:false']);
    assert.deepEqual(enemy('<Element: Ice>'), ['Ice:4:false']);
    // The flag is per side: the actor side of the same manifest is not randomised.
    assert.deepEqual(api.traitSetGrants(m, '', 'actor').map(g => g.setName), ['Neutral']);
});

test('trait set grants are empty for records without trait sets and when the feature is off', () => {
    assert.deepEqual(api.traitSetGrants(manifest([CORE_ON, elementStatusCore()]), '<Element: Fire>', 'weapon'), []);
    assert.deepEqual(api.traitSetGrants(manifest([CORE_ON, elementStatusCore({ enabled: false })]), '<Element: Fire>', 'enemy'), []);
    assert.deepEqual(api.traitSetGrants(manifest([CORE_ON]), '<Element: Fire>', 'enemy'), []);
});

// -------------------------------------------------------------- parameters

test('plugin parameter grants: Global for all, Actor and Enemy lists per side, EXT lists per record', () => {
    const core = ['VisuMZ_1_SkillsStatesCore', true, {
        'PassiveStates:struct': JSON.stringify({ 'Global:arraynum': '["1"]', 'Actor:arraynum': '["2"]', 'Enemy:arraynum': '["3"]' })
    }];
    const ext = ['DA_EquipPassiveSys_EXT', true, {
        'ActorPassives:arraystruct': JSON.stringify([JSON.stringify({ 'ActorID:num': '7', 'PassiveIDs:arraynum': '["4"]' })]),
        'ClassPassives:arraystruct': JSON.stringify([JSON.stringify({ 'ClassID:num': '2', 'LearnableIDs:arraynum': '["3"]', 'SkillLearnIDs:arraynum': '["1"]' })])
    }];
    const m = manifest([core, EQUIP_ON, ext]);
    const grants = (type, id) => api.parameterGrants(m, type, id).map(g => `${g.plugin}:${g.name}:${g.kind}:${g.stateId}`);
    assert.deepEqual(grants('actor', 7), [
        'VisuMZ_1_SkillsStatesCore:Global:passive:1',
        'VisuMZ_1_SkillsStatesCore:Actor:passive:2',
        'DA_EquipPassiveSys_EXT:Actor Passives:learnable:4'
    ]);
    assert.deepEqual(grants('actor', 8), ['VisuMZ_1_SkillsStatesCore:Global:passive:1', 'VisuMZ_1_SkillsStatesCore:Actor:passive:2']);
    assert.deepEqual(grants('enemy', 1), ['VisuMZ_1_SkillsStatesCore:Global:passive:1', 'VisuMZ_1_SkillsStatesCore:Enemy:passive:3']);
    assert.deepEqual(grants('class', 2), ['DA_EquipPassiveSys_EXT:Class Passives:learnable:3']);
    assert.deepEqual(grants('weapon', 1), []);
    // The EXT lists need the plugin they extend.
    assert.deepEqual(api.parameterGrants(manifest([core, ext]), 'class', 2), []);
});

test('an actor inherits its class passives and an enemy its action skills\' passives', () => {
    const database = {
        states: STATES,
        classes: [null, { id: 1, name: 'Warrior', note: '<Passive State: 1>' }],
        skills: [null, { id: 1, name: 'Attack', note: '' }, { id: 2, name: 'Fireball', note: '<Passive States: 3, Nobody>' }]
    };
    assert.deepEqual(api.objectGrants('actor', { classId: 1 }, database).map(g => [g.objectType, g.objectName, g.stateId]), [['class', 'Warrior', 1]]);
    assert.deepEqual(api.objectGrants('actor', { classId: 9 }, database), []);
    const enemy = { actions: [{ skillId: 1 }, { skillId: 2 }, { skillId: 2 }] };
    assert.deepEqual(api.objectGrants('enemy', enemy, database).map(g => [g.objectType, g.objectName, g.stateId]), [['skill', 'Fireball', 3]]);
    assert.deepEqual(api.objectGrants('weapon', {}, database), []);
});

// ---------------------------------------------------------------- analysis

test('analysis flags duplicates, stackable repeats, missing ids, unknown names and ignored tags', () => {
    const m = manifest([CORE_ON, EQUIP_ON]);
    const record = { id: 1, note: '<Passive States: 1, 1, 2, 2, 99, Nobody>\n<Learnable Equip Passive: 3>\n<Learnable Equip Passive: 4>' };
    const result = api.analyze({ objectType: 'actor', record, manifest: m, database: { states: STATES } });
    const codes = result.entries.map(e => `${e.kind}:${e.token}:${e.flags.map(f => `${f.level}/${f.code}`).join('+') || '-'}`);
    assert.deepEqual(codes, [
        'passive:1:-',
        'passive:1:warn/duplicate',
        'passive:2:-',
        'passive:2:info/stackable',
        'passive:99:error/missing',
        'passive:Nobody:error/unknown',
        'learnable:3:-',
        'learnable:4:warn/ignored'
    ]);
    assert.equal(result.entries[7].flags[0].tag, '<Learnable Equip Passive>');
});

test('analysis flags a passive the battler already gets from a trait set, a parameter, or its class', () => {
    const core = ['VisuMZ_1_SkillsStatesCore', true, { 'PassiveStates:struct': JSON.stringify({ 'Global:arraynum': '["2"]' }) }];
    const m = manifest([core, elementStatusCore()]);
    const database = { states: STATES, classes: [null, { id: 1, name: 'Warrior', note: '<Passive State: 4>' }] };
    const record = { id: 1, classId: 1, note: '<Element: Fire>\n<Passive States: 3, 2, 4, 1>' };
    const result = api.analyze({ objectType: 'actor', record, manifest: m, database });
    const granted = result.entries.map(e => e.flags.filter(f => f.code === 'granted').map(f => `${f.level}:${f.grant.source}`));
    assert.deepEqual(granted, [['warn:traitSet'], ['info:parameter'], ['warn:object'], []]);
    assert.deepEqual(result.inherited.map(g => [g.source, g.stateId, g.state && g.state.name]), [
        ['traitSet', 3, 'Haste'], ['parameter', 2, 'Regen'], ['object', 4, 'Guard Up']
    ]);
});

test('a skill listing one state as both Passive State and Equip State is told so', () => {
    const m = manifest([CORE_ON, ['VisuMZ_2_EquipBattleSkills', true]]);
    const result = api.analyze({ objectType: 'skill', record: { id: 1, note: '<Passive State: 1>\n<Equip State: 1>' }, manifest: m, database: { states: STATES } });
    assert.deepEqual(result.entries.map(e => e.flags.map(f => `${f.code}:${f.kind}`)), [['crossKind:equipState'], ['crossKind:passive']]);
});

test('analysis offers nothing and shows nothing when Skills and States Core is off', () => {
    const result = api.analyze({ objectType: 'enemy', record: { id: 1, note: '<Passive State: 1>' }, manifest: manifest([EQUIP_ON]), database: { states: STATES } });
    assert.deepEqual(result.kinds, []);
    assert.deepEqual(result.entries, []);
});

// ------------------------------------------------------------------ wiring

test('every editor that owns a passive-capable record mounts the section, and index.html loads it', () => {
    const index = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    const position = name => index.indexOf(`src/database/${name}.js`);
    assert.ok(position('PassiveStatesSection') > 0);
    for (const [file, type] of [
        ['DatabaseActorEditor', 'actor'], ['DatabaseClassEditor', 'class'], ['DatabaseSkillEditor', 'skill'],
        ['DatabaseWeaponEditor', 'weapon'], ['DatabaseArmorEditor', 'armor'], ['DatabaseEnemyEditor', 'enemy']
    ]) {
        const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', `${file}.js`), 'utf8');
        assert.match(source, new RegExp(`RRPassiveStates\\?\\.createSection\\(\\{\\s*objectType: '${type}'`), file);
        assert.ok(position('PassiveStatesSection') < position(file), `${file} loads after the section module`);
    }
    // Items and States carry no <Passive State: x> of their own.
    for (const file of ['DatabaseItemEditor', 'DatabaseStateEditor']) {
        assert.doesNotMatch(fs.readFileSync(path.join(editorRoot, 'src', 'database', `${file}.js`), 'utf8'), /RRPassiveStates/, file);
    }
});

test('createSection returns null outside a document and when the core plugin is off', () => {
    assert.equal(typeof document, 'undefined');
    assert.equal(api.createSection({ objectType: 'enemy', record: { id: 1, note: '' }, manifest: manifest([CORE_ON]) }), null);
});
