/**
 * Enemy action patterns can carry a list of conditions that must all hold.
 * This test evaluates the shipped runtime/editor source so their catalogs,
 * dispatch, compatibility fields, and value conversions cannot drift apart.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const objectsSource = fs.readFileSync(
    path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
const enemyEditorSource = fs.readFileSync(
    path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseEnemyEditor.js'), 'utf8');

function battler(name, states = [], alive = true) {
    return {
        name,
        isAlive: () => alive,
        isDead: () => !alive,
        isStateAffected: id => states.includes(id)
    };
}

function unit(members) {
    return {
        members: () => members,
        aliveMembers: () => members.filter(member => member.isAlive()),
        deadMembers: () => members.filter(member => member.isDead())
    };
}

function makeWorld(overrides = {}) {
    return {
        turn: 1,
        hp: 1,
        mp: 1,
        tp: 0,
        partyLevel: 1,
        states: [],
        switches: {},
        opponents: [],
        friends: [],
        skills: [],
        ...overrides
    };
}

/** Evaluate the runtime's complete condition block against its real hierarchy. */
function loadRuntimeConditions(overrides = {}) {
    const world = makeWorld(overrides);
    const start = objectsSource.indexOf(
        'Game_Enemy.prototype.meetsCondition = function(action) {');
    const end = objectsSource.indexOf(
        'Game_Enemy.prototype.isActionValid = function(action) {');
    assert.ok(start >= 0 && end > start, 'the shipped condition block can be extracted');

    function Game_Battler() {}
    function Game_Enemy() {}
    Game_Enemy.prototype = Object.create(Game_Battler.prototype);
    Game_Enemy.prototype.constructor = Game_Enemy;

    // The candidate walk asks a probe Game_Action, so the shipped scope
    // predicates ride along verbatim; setSkill/item are the only members the
    // probe touches beyond them.
    function Game_Action(subject) { this._subject = subject; this._item = null; }
    Game_Action.prototype.setSkill = function(id) { this._item = world.skills[id] || null; };
    Game_Action.prototype.item = function() { return this._item; };

    const context = {
        Game_Battler,
        Game_Enemy,
        Game_Action,
        BattleManager: { isTpb: () => false },
        $dataSkills: world.skills,
        $gameTroop: { turnCount: () => world.turn - 1 },
        $gameParty: { highestLevel: () => world.partyLevel },
        $gameSwitches: { value: id => !!world.switches[id] }
    };
    vm.runInNewContext(objectsSource.slice(start, end), context);
    const predicateStart = objectsSource.indexOf('Game_Action.prototype.checkItemScope = function');
    const predicateEnd = objectsSource.indexOf('Game_Action.prototype.isForOne = function');
    assert.ok(predicateStart >= 0 && predicateEnd > predicateStart, 'the shipped scope predicates can be extracted');
    vm.runInNewContext(objectsSource.slice(predicateStart, predicateEnd), context);

    const enemy = new context.Game_Enemy();
    Object.assign(enemy, {
        turnCount: () => world.turn,
        hpRate: () => world.hp,
        mpRate: () => world.mp,
        tpRate: () => world.tp,
        isStateAffected: id => world.states.includes(id),
        opponentsUnit: () => unit(world.opponents),
        friendsUnit: () => unit(world.friends)
    });
    return { context, enemy, world };
}

const meets = (action, state = {}) =>
    loadRuntimeConditions(state).enemy.meetsCondition(action);

function loadEnemyEditor(states = [], switches = []) {
    const context = {
        window: {},
        console,
        require,
        rrEscapeHtml: value => String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;'),
        DatabaseTraitEditor: class DatabaseTraitEditor {}
    };
    vm.runInNewContext(
        `${enemyEditorSource}\n;globalThis.__EnemyEditor = DatabaseEnemyEditor;`,
        context
    );
    return new context.__EnemyEditor({
        getStates: () => states,
        getSkills: () => [],
        getSystem: () => ({ switches })
    }, null, null, null);
}

const plain = value => JSON.parse(JSON.stringify(value));

function conditionModal(checkedTypes, values = {}) {
    return {
        querySelector(selector) {
            const type = Number(selector.match(/data-cond-type="(\d+)"/)?.[1]);
            if (selector.startsWith('.action-cond-toggle')) {
                return { checked: checkedTypes.includes(type) };
            }
            const param = Number(selector.match(/data-cond-param="(\d+)"/)?.[1]);
            const key = `${type}:${param}`;
            return Object.hasOwn(values, key) ? { value: values[key] } : null;
        }
    };
}

// ---------------------------------------------------------------------------
// Legacy single-condition data and condition lists
// ---------------------------------------------------------------------------

test('an action with no condition list is still read through its single condition', () => {
    const belowHalfHp = {
        skillId: 1,
        conditionType: 2,
        conditionParam1: 0,
        conditionParam2: 0.5
    };
    assert.equal(meets(belowHalfHp, { hp: 0.4 }), true);
    assert.equal(meets(belowHalfHp, { hp: 0.6 }), false);
    assert.equal(meets({
        skillId: 1,
        conditionType: 0,
        conditionParam1: 0,
        conditionParam2: 0
    }), true, 'legacy Always remains unconditional');
});

test('each original condition type still evaluates its established behavior', () => {
    const single = (type, param1, param2) => ({
        conditionType: type,
        conditionParam1: param1,
        conditionParam2: param2
    });

    assert.equal(meets(single(1, 3, 0), { turn: 3 }), true);
    assert.equal(meets(single(1, 3, 0), { turn: 4 }), false);
    assert.equal(meets(single(1, 1, 2), { turn: 5 }), true);
    assert.equal(meets(single(1, 1, 2), { turn: 4 }), false);
    assert.equal(meets(single(2, 0, 0.5), { hp: 0.5 }), true);
    assert.equal(meets(single(3, 0.25, 1), { mp: 0.2 }), false);
    assert.equal(meets(single(4, 7, 0), { states: [7] }), true);
    assert.equal(meets(single(4, 7, 0), { states: [8] }), false);
    assert.equal(meets(single(5, 10, 0), { partyLevel: 12 }), true);
    assert.equal(meets(single(5, 10, 0), { partyLevel: 9 }), false);
    assert.equal(meets(single(6, 3, 0), { switches: { 3: true } }), true);
    assert.equal(meets(single(6, 3, 0), { switches: { 3: false } }), false);
});

test('every valid list condition must hold and malformed entries fail safely', () => {
    const enraged = {
        conditions: [
            { type: 2, param1: 0, param2: 0.5 },
            { type: 4, param1: 7, param2: 0 }
        ]
    };
    assert.equal(meets(enraged, { hp: 0.4, states: [7] }), true);
    assert.equal(meets(enraged, { hp: 0.4, states: [] }), false);
    assert.equal(meets(enraged, { hp: 0.9, states: [7] }), false);

    const malformed = { conditions: [enraged.conditions[0], null] };
    assert.doesNotThrow(() => meets(malformed, { hp: 0.4 }));
    assert.equal(meets(malformed, { hp: 0.4 }), false,
        'a malformed entry cannot accidentally make an action available');
    assert.equal(meets({ conditions: [{}] }), false, 'a missing type fails closed');
    assert.equal(meets({ conditions: [{ type: 999 }] }), false, 'an unknown type fails closed');
    for (const type of [0, null, '0', false, '', '2']) {
        assert.equal(meets({ conditions: [{ type }] }), false,
            `malformed type ${JSON.stringify(type)} fails closed`);
    }
});

test('an empty condition list is the Always case', () => {
    assert.equal(meets({ conditions: [] }, { hp: 0.1 }), true);
});

test('the list wins over the single-condition fields when both are present', () => {
    const action = {
        conditionType: 2,
        conditionParam1: 0,
        conditionParam2: 0.5,
        conditions: [
            { type: 2, param1: 0, param2: 0.5 },
            { type: 6, param1: 3, param2: 0 }
        ]
    };
    assert.equal(meets(action, { hp: 0.4, switches: { 3: false } }), false);
    assert.equal(meets(action, { hp: 0.4, switches: { 3: true } }), true);
});

// ---------------------------------------------------------------------------
// Reactor TP and Target State bridges
// ---------------------------------------------------------------------------

test('TP is ranged inclusively in the same way as HP and MP', () => {
    const desperate = { conditions: [{ type: 7, param1: 0.5, param2: 1 }] };
    assert.equal(meets(desperate, { tp: 0.75 }), true);
    assert.equal(meets(desperate, { tp: 0.5 }), true);
    assert.equal(meets(desperate, { tp: 1 }), true);
    assert.equal(meets(desperate, { tp: 0.25 }), false);
});

test('actor/plugin-style execution reaches every battler condition method', () => {
    const POISON = 4;
    const poisoned = battler('poisoned opponent', [POISON]);
    const { context } = loadRuntimeConditions({
        turn: 3,
        partyLevel: 12,
        switches: { 3: true },
        skills: { 12: { scope: 1 } }
    });

    class Game_Actor extends context.Game_Battler {}
    const actor = new Game_Actor();
    Object.assign(actor, {
        turnCount: () => 3,
        hpRate: () => 0.4,
        mpRate: () => 0.6,
        tpRate: () => 0.75,
        isStateAffected: id => id === 7,
        opponentsUnit: () => unit([poisoned]),
        friendsUnit: () => unit([])
    });
    const pluginBridge = (condition, action = {}) => actor.meetsActionCondition(
        condition.type, condition.param1, condition.param2, action);

    assert.equal(pluginBridge({ type: 1, param1: 3, param2: 0 }), true);
    assert.equal(pluginBridge({ type: 2, param1: 0, param2: 0.5 }), true);
    assert.equal(pluginBridge({ type: 3, param1: 0.5, param2: 1 }), true);
    assert.equal(pluginBridge({ type: 4, param1: 7 }), true);
    assert.equal(pluginBridge({ type: 5, param1: 10 }), true);
    assert.equal(pluginBridge({ type: 6, param1: 3 }), true);
    assert.equal(pluginBridge({ type: 7, param1: 0.5, param2: 1 }), true);
    assert.equal(pluginBridge({ type: 8, param1: POISON }, { skillId: 12 }), true);
    assert.equal(Object.hasOwn(actor, 'meetsActionCondition'), false,
        'the actor reached the shipped method through Game_Battler inheritance');
});

// ---------------------------------------------------------------------------
// Editor/runtime parity and authored values
// ---------------------------------------------------------------------------

test('the editor catalog and runtime dispatch expose exactly the same type IDs', () => {
    const start = objectsSource.indexOf(
        'Game_Battler.prototype.meetsActionCondition = function');
    const end = objectsSource.indexOf('\n};', start);
    const dispatched = Array.from(
        objectsSource.slice(start, end).matchAll(/case (\d+):/g),
        match => Number(match[1])
    ).sort((a, b) => a - b);
    const offered = plain(loadEnemyEditor().conditionTypeCatalog())
        .map(type => type.id)
        .sort((a, b) => a - b);
    assert.deepEqual(offered, dispatched);
    assert.deepEqual(offered, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('catalog fields are named, defaulted, and unchecked rows are disabled', () => {
    const editor = loadEnemyEditor(
        [null, { id: 1, name: 'Knockout' }],
        [null, 'Gate']
    );
    const catalog = plain(editor.conditionTypeCatalog());
    const unlabelled = catalog.flatMap(type => type.fields
        .filter(field => !field.label && !field.kind)
        .map(field => `${type.label} param ${field.param}`));
    assert.deepEqual(unlabelled, []);
    assert.deepEqual(catalog.find(type => type.id === 1).fields.map(field => field.value), [1, 0]);
    assert.deepEqual(catalog.find(type => type.id === 2).fields.map(field => field.value), [0, 1]);
    assert.equal(catalog.find(type => type.id === 4).fields[0].value, 1);
    assert.equal(catalog.find(type => type.id === 6).fields[0].value, 1);

    const html = editor.buildConditionRowsHTML([]);
    assert.equal((html.match(/ checked/g) || []).length, 0);
    assert.match(html, /data-cond-type="1" data-cond-param="1" value="1"/);
    assert.match(html, /data-cond-type="2" data-cond-param="2" value="100"/);

    const enabledField = {};
    const disabledField = {};
    const rows = [
        {
            style: {},
            querySelector: () => ({ checked: true }),
            querySelectorAll: () => [enabledField]
        },
        {
            style: {},
            querySelector: () => ({ checked: false }),
            querySelectorAll: () => [disabledField]
        }
    ];
    editor.syncConditionRowStates({ querySelectorAll: () => rows });
    assert.deepEqual(
        rows.map(row => row.style.opacity),
        ['1', '0.5']
    );
    assert.equal(enabledField.disabled, false);
    assert.equal(disabledField.disabled, true);
});

test('the editor reads a legacy action as a one-entry condition list', () => {
    const editor = loadEnemyEditor();
    assert.deepEqual(plain(editor.actionConditions({
        conditionType: 2,
        conditionParam1: 0,
        conditionParam2: 0.5
    })), [{ type: 2, param1: 0, param2: 0.5 }]);
    assert.deepEqual(plain(editor.actionConditions({
        conditionType: 0,
        conditionParam1: 0,
        conditionParam2: 0
    })), []);
});

test('the editor mirrors exactly the first condition onto legacy fields', () => {
    const editor = loadEnemyEditor();
    const action = { skillId: 4, rating: 5 };
    const conditions = [
        { type: 2, param1: 0, param2: 0.5 },
        { type: 7, param1: 0.5, param2: 1 }
    ];
    editor.setActionConditions(action, conditions);
    assert.equal(action.conditions, conditions, 'the authored list itself is retained');
    assert.deepEqual(
        {
            type: action.conditionType,
            param1: action.conditionParam1,
            param2: action.conditionParam2
        },
        conditions[0]
    );

    editor.setActionConditions(action, []);
    assert.deepEqual({
        type: action.conditionType,
        param1: action.conditionParam1,
        param2: action.conditionParam2
    }, { type: 0, param1: 0, param2: 0 });
});

test('checklist edits preserve unsupported and extended raw entries', () => {
    const editor = loadEnemyEditor();
    const unsupported = { type: 999, pluginData: 'keep' };
    const action = {
        conditions: [
            unsupported,
            { type: 2, param1: 0, param2: 0.5, pluginData: 'first' },
            null,
            { type: 2, param1: 0.25, param2: 0.75, pluginData: 'second' }
        ]
    };
    const edited = [
        { type: 2, param1: 0.1, param2: 0.6 },
        { type: 7, param1: 0.5, param2: 1 }
    ];
    const merged = editor.mergeEditedActionConditions(action, edited);

    assert.equal(merged[0], unsupported);
    assert.deepEqual(plain(merged), [
        { type: 999, pluginData: 'keep' },
        { type: 2, param1: 0.1, param2: 0.6, pluginData: 'first' },
        null,
        { type: 2, param1: 0.25, param2: 0.75, pluginData: 'second' },
        { type: 7, param1: 0.5, param2: 1 }
    ]);
    editor.setActionConditions(action, merged);
    assert.equal(action.conditionType, 999, 'the first raw condition remains the legacy mirror');
});

test('unsupported legacy triples survive opening and accepting the checklist', () => {
    const editor = loadEnemyEditor();
    const action = {
        conditionType: 999,
        conditionParam1: 12,
        conditionParam2: 34
    };
    const merged = editor.mergeEditedActionConditions(action, []);

    assert.deepEqual(plain(merged), [{ type: 999, param1: 12, param2: 34 }]);
    editor.setActionConditions(action, merged);
    assert.deepEqual({
        type: action.conditionType,
        param1: action.conditionParam1,
        param2: action.conditionParam2
    }, { type: 999, param1: 12, param2: 34 });
});

test('malformed list entries are described as Unknown rather than Always', () => {
    const editor = loadEnemyEditor();
    assert.equal(editor.describeConditions({ conditions: [null] }), 'Unknown');
    assert.equal(editor.describeConditions({ conditions: [{}] }), 'Unknown');
    assert.equal(editor.describeConditions({ conditions: [{ type: '2' }] }), 'Unknown');
    assert.equal(editor.describeConditions({ conditions: [] }), 'Always');
});

test('what the editor writes is what the extracted runtime reads back', () => {
    const editor = loadEnemyEditor();
    const action = { skillId: 4, rating: 5 };
    const conditions = editor.actionConditions({
        conditionType: 3,
        conditionParam1: 0.25,
        conditionParam2: 1
    });
    conditions.push({ type: 1, param1: 2, param2: 2 });
    editor.setActionConditions(action, conditions);
    assert.equal(meets(action, { mp: 0.5, turn: 4 }), true);
    assert.equal(meets(action, { mp: 0.5, turn: 3 }), false);
    assert.equal(meets(action, { mp: 0.1, turn: 4 }), false);
});

test('missing and modal values normalize to finite clamped stored numbers', () => {
    const editor = loadEnemyEditor();
    assert.deepEqual(
        plain(editor.actionConditions({ conditions: [{ type: 5 }] })),
        [{ type: 5, param1: 0, param2: 0 }]
    );
    assert.deepEqual(plain(editor.actionConditions({})), []);
    assert.deepEqual(plain(editor.actionConditions(null)), []);

    const read = plain(editor.readConditionsFromModal(conditionModal(
        [1, 2, 3, 7],
        {
            '1:1': '-2',
            '1:2': '2.6',
            '2:1': '50.25',
            '2:2': '150.005',
            '3:1': '-12.34',
            '3:2': '49.999',
            '7:1': 'Infinity',
            '7:2': 'not-a-number'
        }
    )));
    assert.deepEqual(read, [
        { type: 1, param1: 0, param2: 3 },
        { type: 2, param1: 0.5025, param2: 1 },
        { type: 3, param1: 0, param2: 0.5 },
        { type: 7, param1: 0, param2: 0 }
    ]);
    assert.equal(read[1].param1, 0.5025,
        '50.25 percent is stored without a floating-point tail');
    assert.ok(read.every(condition =>
        Number.isFinite(condition.param1) && Number.isFinite(condition.param2)));
});

// ---------------------------------------------------------------------------
// Labels shown to the author
// ---------------------------------------------------------------------------

test('the action list spells out every condition rather than only the first', () => {
    const editor = loadEnemyEditor([{ id: 7, name: 'Enraged' }]);
    assert.equal(editor.describeConditions({ conditions: [] }), 'Always');
    assert.equal(editor.describeConditions({
        conditions: [{ type: 4, param1: 7, param2: 0 }]
    }), 'User State: Enraged');
    assert.equal(editor.describeConditions({
        conditions: [
            { type: 2, param1: 0, param2: 0.5 },
            { type: 7, param1: 0.5, param2: 1 }
        ]
    }), 'HP 0% ~ 50% and TP 50% ~ 100%');
});

test('a turn condition describes the turns on which it actually fires', () => {
    const editor = loadEnemyEditor();
    assert.equal(editor.describeConditions({
        conditions: [{ type: 1, param1: 3, param2: 0 }]
    }), 'Turn 3');
    assert.equal(editor.describeConditions({
        conditions: [{ type: 1, param1: 1, param2: 2 }]
    }), 'Turn 1 + 2n');
});

// ---------------------------------------------------------------------------
// Target State and every RPG Maker MZ scope
// ---------------------------------------------------------------------------

const POISON = 4;
const skills = Object.fromEntries(
    Array.from({ length: 15 }, (_, scope) => [scope + 100, { scope }])
);
const targetPoisoned = skillId => ({
    skillId,
    conditions: [{ type: 8, param1: POISON, param2: 0 }]
});

test('all scope IDs 0 through 14 produce exactly their intended candidate group', () => {
    const opponentAlive = battler('opponent-alive');
    const opponentDead = battler('opponent-dead', [], false);
    const friendAlive = battler('friend-alive');
    const friendDead = battler('friend-dead', [], false);
    const { enemy } = loadRuntimeConditions({
        skills,
        opponents: [opponentAlive, opponentDead],
        friends: [friendAlive, friendDead]
    });
    enemy.name = 'user';

    const expected = {
        0: [],
        1: ['opponent-alive'],
        2: ['opponent-alive'],
        3: ['opponent-alive'],
        4: ['opponent-alive'],
        5: ['opponent-alive'],
        6: ['opponent-alive'],
        7: ['friend-alive'],
        8: ['friend-alive'],
        9: ['friend-dead'],
        10: ['friend-dead'],
        11: ['user'],
        12: ['friend-alive', 'friend-dead'],
        13: ['friend-alive', 'friend-dead'],
        14: ['opponent-alive', 'friend-alive']
    };
    for (let scope = 0; scope <= 14; scope++) {
        const names = Array.from(enemy.actionTargetCandidates({ skillId: scope + 100 }),
            candidate => candidate.name);
        assert.deepEqual(names, expected[scope], `scope ${scope}`);
    }
});

test('a notetag string scope reaches candidates only through the predicates, and follows their redefinition', () => {
    const opponent = battler('opponent');
    const friend = battler('friend');
    const { context, enemy } = loadRuntimeConditions({
        skills: { 200: { scope: 'ENEMY OR ALLY' } },
        opponents: [opponent],
        friends: [friend]
    });
    enemy.name = 'user';
    // Stock predicates read numeric lists; a string scope matches none, so
    // the skill has no candidates at all...
    assert.deepEqual(Array.from(enemy.actionTargetCandidates({ skillId: 200 })), []);
    // ...until a plugin reroutes a predicate to parse the string, the way
    // BattleCore's <Target: ...> support does. The probe inherits it.
    context.Game_Action.prototype.isForOpponent = function() {
        const scope = this.item().scope;
        return typeof scope === 'string'
            ? scope.indexOf('ENEMY') >= 0
            : this.checkItemScope([1, 2, 3, 4, 5, 6, 14]);
    };
    const names = Array.from(enemy.actionTargetCandidates({ skillId: 200 }),
        candidate => candidate.name);
    assert.deepEqual(names, ['opponent']);
});

test('offensive skills inspect opponents and supportive skills inspect allies', () => {
    const poisoned = [battler('poisoned', [POISON])];
    const clean = [battler('clean')];
    assert.equal(meets(targetPoisoned(101), {
        skills,
        opponents: poisoned,
        friends: clean
    }), true);
    assert.equal(meets(targetPoisoned(101), {
        skills,
        opponents: clean,
        friends: poisoned
    }), false);
    assert.equal(meets(targetPoisoned(107), {
        skills,
        opponents: clean,
        friends: poisoned
    }), true);
    assert.equal(meets(targetPoisoned(107), {
        skills,
        opponents: poisoned,
        friends: clean
    }), false);
});

test('dead battlers are candidates only for scopes that can reach them', () => {
    const deadPoisoned = [battler('dead poisoned', [POISON], false)];
    assert.equal(meets(targetPoisoned(109), { skills, friends: deadPoisoned }), true);
    assert.equal(meets(targetPoisoned(112), { skills, friends: deadPoisoned }), true);
    assert.equal(meets(targetPoisoned(107), { skills, friends: deadPoisoned }), false);
});

test('a user-scoped skill applies Target State to the battler itself', () => {
    assert.equal(meets(targetPoisoned(111), { skills, states: [POISON] }), true);
    assert.equal(meets(targetPoisoned(111), { skills, states: [] }), false);
});

test('an everyone-scoped skill reaches the living battlers on both sides', () => {
    const poisoned = [battler('poisoned', [POISON])];
    const clean = [battler('clean')];
    assert.equal(meets(targetPoisoned(114), {
        skills,
        opponents: poisoned,
        friends: clean
    }), true);
    assert.equal(meets(targetPoisoned(114), {
        skills,
        opponents: clean,
        friends: poisoned
    }), true);
    assert.equal(meets(targetPoisoned(114), {
        skills,
        opponents: clean,
        friends: clean
    }), false);
});

test('a no-target or missing skill has no Target State candidates', () => {
    const poisoned = [battler('poisoned', [POISON])];
    assert.equal(meets(targetPoisoned(100), {
        skills,
        opponents: poisoned,
        friends: poisoned
    }), false);
    assert.equal(meets(targetPoisoned(999), { skills, opponents: poisoned }), false);
});

test('User State still inspects the user rather than a reachable target', () => {
    const userEnraged = {
        skillId: 101,
        conditions: [{ type: 4, param1: 7, param2: 0 }]
    };
    assert.equal(meets(userEnraged, {
        skills,
        states: [7],
        opponents: [battler('clean')]
    }), true);
    assert.equal(meets(userEnraged, {
        skills,
        states: [],
        opponents: [battler('enraged', [7])]
    }), false);
});

test('state conditions stay distinct and orphan state/switch IDs remain selectable', () => {
    const editor = loadEnemyEditor(
        [{ id: 4, name: 'Poison' }, { id: 7, name: 'Enraged' }],
        [null, 'Gate']
    );
    assert.equal(editor.describeConditions({
        conditions: [
            { type: 4, param1: 7, param2: 0 },
            { type: 8, param1: 4, param2: 0 }
        ]
    }), 'User State: Enraged and Target State: Poison');
    assert.equal(editor.describeConditions({
        conditions: [{ type: 8, param1: 99, param2: 0 }]
    }), 'Target State: #99');

    assert.match(editor.getConditionStateOptions(99),
        /^<option value="99" selected>#99<\/option>/);
    assert.match(editor.getConditionSwitchOptions(42),
        /^<option value="42" selected>#42<\/option>/);
    assert.match(editor.getConditionStateOptions(4),
        /<option value="4" selected>#4 Poison<\/option>/);
    assert.match(editor.getConditionSwitchOptions(1),
        /<option value="1" selected>#1 Gate<\/option>/);
});

// ---------------------------------------------------------------------------
// User Lacks State / Target Lacks State (GitHub #32)
// ---------------------------------------------------------------------------

test('a lacks-state condition is the exact inverse of the has-state one', () => {
    const ENRAGED = 7;
    const has = { skillId: 101, conditions: [{ type: 4, param1: ENRAGED, param2: 0 }] };
    const lacks = { skillId: 101, conditions: [{ type: 9, param1: ENRAGED, param2: 0 }] };
    assert.equal(meets(has, { skills, states: [ENRAGED] }), true);
    assert.equal(meets(lacks, { skills, states: [ENRAGED] }), false);
    assert.equal(meets(has, { skills, states: [] }), false);
    assert.equal(meets(lacks, { skills, states: [] }), true);
});

test('has and lacks can gate one action together: enraged, but not silenced', () => {
    const ENRAGED = 7, SILENCE = 9;
    const action = { skillId: 101, conditions: [
        { type: 4, param1: ENRAGED, param2: 0 },
        { type: 9, param1: SILENCE, param2: 0 }
    ] };
    assert.equal(meets(action, { skills, states: [ENRAGED] }), true);
    assert.equal(meets(action, { skills, states: [ENRAGED, SILENCE] }), false);
    assert.equal(meets(action, { skills, states: [] }), false);
    assert.equal(meets(action, { skills, states: [SILENCE] }), false);
});

test('lacks-state reads states through the same method has-state does, once', () => {
    // A plugin that replaces meetsStateCondition (SkillsStatesCore's
    // passive-state-aware version) must move has and lacks together.
    const { enemy } = loadRuntimeConditions({ skills, states: [] });
    let calls = 0;
    enemy.meetsStateCondition = () => { calls++; return true; };
    assert.equal(enemy.meetsCondition({ skillId: 101, conditions: [{ type: 9, param1: 7, param2: 0 }] }), false);
    assert.equal(calls, 1);
    enemy.meetsStateCondition = () => { calls++; return false; };
    assert.equal(enemy.meetsCondition({ skillId: 101, conditions: [{ type: 9, param1: 7, param2: 0 }] }), true);
    assert.equal(calls, 2);
});

test('target-lacks-state holds while nobody the action can reach carries the state', () => {
    const poisoned = battler('sick', [POISON]);
    const healthy = battler('well');
    const lacks = { skillId: 101, conditions: [{ type: 10, param1: POISON, param2: 0 }] };
    assert.equal(meets(lacks, { skills, opponents: [healthy] }), true, 'nobody poisoned: the poison skill is worth using');
    assert.equal(meets(lacks, { skills, opponents: [healthy, poisoned] }), false, 'someone already is');
    let reads = 0;
    const { enemy } = loadRuntimeConditions({ skills, opponents: [healthy] });
    enemy.meetsTargetStateCondition = () => { reads++; return false; };
    assert.equal(enemy.meetsCondition(lacks), true);
    assert.equal(reads, 1, 'routed through meetsTargetStateCondition');
});

test('the action list names the state a lacks condition rules out', () => {
    const editor = loadEnemyEditor([{ id: 7, name: 'Enraged' }, { id: 9, name: 'Silence' }, { id: 4, name: 'Poison' }]);
    assert.equal(editor.describeConditions({ conditions: [
        { type: 4, param1: 7, param2: 0 },
        { type: 9, param1: 9, param2: 0 },
        { type: 10, param1: 4, param2: 0 }
    ] }), 'User State: Enraged and User Lacks State: Silence and Target Lacks State: Poison');
    const ids = Array.from(editor.conditionTypeCatalog(), entry => entry.id);
    assert.deepEqual(ids, [1, 2, 3, 7, 4, 9, 8, 10, 5, 6], 'each lacks row sits beside its has row');
});
