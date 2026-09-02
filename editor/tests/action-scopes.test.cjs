/**
 * Action scopes.
 *
 * A skill's Scope is stored as a bare integer, so the dropdown's option order
 * IS the data format: shifting an entry silently rewrites every skill authored
 * after it. These tests evaluate the shipped runtime source and the shipped
 * database editors together, so the two cannot drift apart.
 *
 * They also pin the thing that was wrong before: the runtime reads a random
 * scope's target count out of the scope number itself, and the dropdown used to
 * promise counts that ran the other way, so a skill labelled "3 Random" fired
 * one target.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const objectsSource = fs.readFileSync(
    path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
const skillEditorSource = fs.readFileSync(
    path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseSkillEditor.js'), 'utf8');
const itemEditorSource = fs.readFileSync(
    path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseItemEditor.js'), 'utf8');

/** The Scope dropdown, in stored-value order. Index is the scope integer. */
const SCOPE_LABELS = [
    'None', 'One Enemy', 'All Enemies',
    'One Random Enemy', 'Two Random Enemies', 'Three Random Enemies', 'Four Random Enemies',
    'One Ally', 'All Allies', 'One Ally (Dead)', 'All Allies (Dead)', 'User',
    'One Ally (Unconditional)', 'All Allies (Unconditional)', 'All Enemies & Allies',
    'One Ally or Enemy', 'One Enemy or Ally', 'All Allies or All Enemies',
    'All Allies but User',
    'One Random (Any Side)', 'Two Random (Any Side)', 'Three Random (Any Side)', 'Four Random (Any Side)'
];

// --- runtime harness ------------------------------------------------------

/** Pull one shipped `Game_Action.prototype.<name> = function ... };` verbatim. */
function methodSource(name) {
    const head = `Game_Action.prototype.${name} = function(`;
    const start = objectsSource.indexOf(head);
    assert.ok(start >= 0, `runtime defines Game_Action.prototype.${name}`);
    const end = objectsSource.indexOf('\n};\n', start);
    assert.ok(end > start, `Game_Action.prototype.${name} terminates`);
    return objectsSource.slice(start, end + 4);
}

const SCOPE_METHODS = [
    'checkItemScope', 'isForOpponent', 'isForFriend', 'isForEveryone',
    'isForAliveFriend', 'isForDeadFriend', 'isForUser', 'isForOne', 'isForRandom',
    'isForAll', 'needsSelection', 'isForAnyone', 'isForAnyoneFocusFriends',
    'isForAnyoneFocusOpponents', 'isForOneSide', 'isForRandomAny',
    'isForAllAlliesButUser', 'numTargets', 'numRepeats', 'setTargetBattler',
    'targetSideUnit', 'makeTargets', 'repeatTargets', 'targetsForAnyone',
    'targetsForRandomAny', 'targetsForAlliesButUser', 'targetsForEveryone',
    'targetsForOpponents', 'targetsForFriends', 'randomTargets', 'targetsForDead',
    'targetsForAlive', 'targetsForDeadAndAlive', 'itemTargetCandidates'
];

function battler(name, isActor, alive = true) {
    return {
        name,
        _isActor: isActor,
        _alive: alive,
        isActor: () => isActor,
        isAlive: () => alive,
        isDead: () => !alive,
        index: () => Number(name.slice(-1)),
        tgr: 1
    };
}

function unit(members) {
    const alive = () => members.filter(m => m.isAlive());
    return {
        members: () => members,
        aliveMembers: alive,
        deadMembers: () => members.filter(m => m.isDead()),
        randomTarget: () => alive()[0] || null,
        smoothTarget(index) {
            const m = members[Math.max(0, index)];
            return m && m.isAlive() ? m : alive()[0];
        },
        smoothDeadTarget(index) {
            const m = members[Math.max(0, index)];
            return m && m.isDead() ? m : this.deadMembers()[0];
        }
    };
}

/**
 * Build a Game_Action carrying the shipped scope logic verbatim, with the
 * subject on the actor side.
 */
function makeAction(scope, { enemies, actors, confused = false } = {}) {
    // Math.randomInt is the engine's own extension (runtime/reactor_core.js),
    // not host Math, and the random scopes call it.
    const engineMath = Object.create(Math);
    engineMath.randomInt = max => Math.floor(Math.random() * max);

    const context = {
        Game_Action: function () {},
        Math: engineMath,
        $dataSkills: [],
        console
    };
    // The scope constants the predicates read by name.
    const constStart = objectsSource.indexOf('Game_Action.SCOPE_ONE_ALLY_OR_ENEMY = 15;');
    assert.ok(constStart >= 0, 'runtime defines the Reactor scope constants');
    const constEnd = objectsSource.indexOf('\n\n', objectsSource.indexOf('Game_Action.RANDOM_ANY_SCOPES'));
    vm.runInNewContext(objectsSource.slice(constStart, constEnd), context);
    vm.runInNewContext(SCOPE_METHODS.map(methodSource).join('\n'), context);

    const troop = unit(enemies || [battler('enemy0', false), battler('enemy1', false)]);
    const party = unit(actors || [battler('actor0', true), battler('actor1', true)]);
    const subject = party.members()[0];
    subject.attackTimesAdd = () => 0;
    subject.attackSkillId = () => 0;
    subject.isConfused = () => confused;

    const action = new context.Game_Action();
    Object.assign(action, {
        _targetIndex: -1,
        _targetSideIsFriend: null,
        _forcing: false,
        _scope: scope,
        item: () => ({ scope, repeats: 1 }),
        isAttack: () => false,
        isValid: () => true,
        subject: () => subject,
        friendsUnit: () => party,
        opponentsUnit: () => troop
    });
    return { action, party, troop, subject };
}

// Arrays built inside the vm realm have that realm's Array.prototype, which
// deepStrictEqual compares. Array.from rebuilds them here.
const names = list => Array.from(list).filter(Boolean).map(b => b.name);

// --- the dropdown is the data format --------------------------------------

test('both database editors offer the same scope list in stored-value order', () => {
    const extract = (source, label) => {
        const start = source.indexOf('const scopeNames = [');
        assert.ok(start >= 0, `${label} declares scopeNames`);
        const end = source.indexOf('].map(tt)', start);
        assert.ok(end > start, `${label} scopeNames terminates`);
        return Array.from(vm.runInNewContext(source.slice(source.indexOf('[', start), end + 1)));
    };

    const skills = extract(skillEditorSource, 'DatabaseSkillEditor');
    const items = extract(itemEditorSource, 'DatabaseItemEditor');

    assert.deepEqual(skills, SCOPE_LABELS);
    assert.deepEqual(items, SCOPE_LABELS,
        'Skills and Items must agree: both write the same integer into the same field');
});

test('every scope label is translated in every supported locale', () => {
    const src = ['I18nDeepTranslations.js', 'I18nReviewedTranslations.js', 'I18nManager.js']
        .map(f => path.join(repoRoot, 'editor', 'src', f))
        .filter(p => fs.existsSync(p))
        .map(p => fs.readFileSync(p, 'utf8'))
        .join('\n');

    const sandbox = {
        window: { dispatchEvent() {} },
        document: {
            readyState: 'complete', documentElement: {},
            addEventListener() {}, querySelectorAll() { return []; }
        },
        localStorage: { getItem: () => null, setItem() {} },
        CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } }
    };
    sandbox.window.document = sandbox.document;
    sandbox.window.localStorage = sandbox.localStorage;
    sandbox.window.CustomEvent = sandbox.CustomEvent;

    const { RR_LANGUAGES, text, deep, reviewed } = vm.runInNewContext(`${src}\n({
        RR_LANGUAGES,
        text: RR_TEXT_TRANSLATIONS,
        deep: globalThis.RR_DEEP_TEXT_TRANSLATIONS,
        reviewed: globalThis.RR_REVIEWED_TRANSLATIONS
    });`, sandbox);

    const locales = Array.from(RR_LANGUAGES, l => l.id).filter(id => id !== 'en');
    const missing = [];
    for (const phrase of SCOPE_LABELS) {
        for (const locale of locales) {
            const found = (text[locale] && text[locale][phrase])
                || (deep && deep[locale] && deep[locale][phrase])
                || (reviewed && reviewed.text && reviewed.text[locale] && reviewed.text[locale][phrase]);
            if (!found) missing.push(`${locale}: ${phrase}`);
        }
    }
    assert.deepEqual(missing, []);
});

// --- the random labels tell the truth about their target count ------------

test('each random label promises the count the runtime actually rolls', () => {
    const spelled = { One: 1, Two: 2, Three: 3, Four: 4 };
    let checked = 0;
    for (const [scope, label] of SCOPE_LABELS.entries()) {
        const word = label.split(' ')[0];
        if (!(word in spelled) || !label.includes('Random')) continue;
        const { action } = makeAction(scope);
        assert.equal(action.isForRandom(), true, `${label} is a random scope`);
        assert.equal(action.numTargets(), spelled[word],
            `scope ${scope} labelled "${label}" must roll ${spelled[word]} target(s)`);
        checked++;
    }
    assert.equal(checked, 8, 'all four enemy-random and four any-side-random scopes are covered');
});

// --- the MZ scopes keep their exact meaning -------------------------------

test('scopes 0-14 group exactly as RPG Maker MZ groups them', () => {
    const expected = {
        isForOpponent: [1, 2, 3, 4, 5, 6, 14],
        isForFriend: [7, 8, 9, 10, 11, 12, 13, 14],
        isForEveryone: [14],
        isForAliveFriend: [7, 8, 11, 14],
        isForDeadFriend: [9, 10],
        isForUser: [11],
        isForOne: [1, 3, 7, 9, 11, 12],
        isForRandom: [3, 4, 5, 6],
        isForAll: [2, 8, 10, 13, 14],
        needsSelection: [1, 7, 9, 12]
    };
    for (const [predicate, members] of Object.entries(expected)) {
        for (let scope = 0; scope <= 14; scope++) {
            const { action } = makeAction(scope);
            assert.equal(!!action[predicate](), members.includes(scope),
                `${predicate}() on MZ scope ${scope}`);
        }
    }
});

test('MZ random scopes still read their count as scope - 2', () => {
    for (const [scope, count] of [[3, 1], [4, 2], [5, 3], [6, 4]]) {
        assert.equal(makeAction(scope).action.numTargets(), count);
    }
});

// --- the either-side scopes -----------------------------------------------

test('either-side scopes answer to both sides so nothing filters them out early', () => {
    for (const scope of [15, 16, 17]) {
        const { action } = makeAction(scope);
        assert.equal(!!action.isForOpponent(), true, `scope ${scope} reaches opponents`);
        assert.equal(!!action.isForFriend(), true, `scope ${scope} reaches friends`);
        assert.equal(!!action.isForAnyone(), true, `scope ${scope} is an either-side scope`);
        assert.equal(!!action.needsSelection(), true, `scope ${scope} asks the player to pick`);
        assert.equal(!!action.isForDeadFriend(), false, `scope ${scope} cannot reach the dead`);
        assert.equal(!!action.isForEveryone(), false,
            `scope ${scope} is not scope 14: it reaches one side at a time`);
    }
});

test('the two single-target either-side scopes differ only in focus', () => {
    const ally = makeAction(15).action;
    const enemy = makeAction(16).action;
    assert.equal(!!ally.isForAnyoneFocusFriends(), true);
    assert.equal(!!ally.isForAnyoneFocusOpponents(), false);
    assert.equal(!!enemy.isForAnyoneFocusOpponents(), true);
    assert.equal(!!enemy.isForAnyoneFocusFriends(), false);
    for (const action of [ally, enemy]) {
        assert.equal(!!action.isForOne(), true);
        assert.equal(!!action.isForAll(), false);
    }
});

test('a single either-side scope resolves against the side the player picked', () => {
    for (const scope of [15, 16]) {
        const picked = makeAction(scope);
        picked.action.setTargetBattler(picked.troop.members()[1]);
        assert.deepEqual(names(picked.action.makeTargets()), ['enemy1'],
            `scope ${scope} follows a chosen enemy`);

        const ally = makeAction(scope);
        ally.action.setTargetBattler(ally.party.members()[1]);
        assert.deepEqual(names(ally.action.makeTargets()), ['actor1'],
            `scope ${scope} follows a chosen ally`);
    }
});

test('with no side recorded, an either-side scope falls back to its focus', () => {
    // An AI user never runs the selection window, and a save written before the
    // side was tracked has no value to read.
    assert.deepEqual(names(makeAction(15).action.makeTargets()), ['actor0'],
        'ally-focused falls back to the friendly side');
    assert.deepEqual(names(makeAction(16).action.makeTargets()), ['enemy0'],
        'enemy-focused falls back to the opposing side');
});

test('choosing a battler under scope 17 chooses that battler whole side', () => {
    const picked = makeAction(17);
    picked.action.setTargetBattler(picked.troop.members()[0]);
    assert.deepEqual(names(picked.action.makeTargets()), ['enemy0', 'enemy1']);

    const ally = makeAction(17);
    ally.action.setTargetBattler(ally.party.members()[1]);
    assert.deepEqual(names(ally.action.makeTargets()), ['actor0', 'actor1'],
        'picking any ally takes the whole party, not just that ally');

    assert.equal(!!ally.action.isForAll(), true);
    assert.equal(!!ally.action.isForOne(), false);
});

test('scope 17 skips the dead on the side it lands on', () => {
    const world = {
        actors: [battler('actor0', true), battler('actor1', true, false)]
    };
    const { action, party } = makeAction(17, world);
    action.setTargetBattler(party.members()[0]);
    assert.deepEqual(names(action.makeTargets()), ['actor0']);
});

// --- all allies but user --------------------------------------------------

test('scope 18 hits the party and never the caster', () => {
    const { action, subject } = makeAction(18);
    const targets = action.makeTargets();
    assert.deepEqual(names(targets), ['actor1']);
    assert.equal(targets.includes(subject), false);
    assert.equal(!!action.isForAll(), true);
    assert.equal(!!action.needsSelection(), false, 'it targets a fixed set, so nothing to pick');
    assert.equal(!!action.isForOpponent(), false, 'it never reaches the other side');
});

// --- random across both sides ---------------------------------------------

test('random-any scopes draw from both sides and stop when a side empties', () => {
    const { action } = makeAction(22);
    const targets = action.makeTargets();
    assert.equal(targets.length, 4);
    for (const target of targets) {
        assert.ok(['actor0', 'enemy0'].includes(target.name),
            'each draw lands on a living battler from one side or the other');
    }

    // The side is chosen per draw, so over many single-draw rolls both sides
    // must show up. Two hundred trials makes a one-sided run effectively
    // impossible rather than merely unlikely.
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
        seen.add(names(makeAction(19).action.makeTargets())[0]);
    }
    assert.deepEqual(Array.from(seen).sort(), ['actor0', 'enemy0'],
        'a random-any draw can land on either side');

    const wiped = makeAction(19, {
        enemies: [battler('enemy0', false, false)],
        actors: [battler('actor0', true, false)]
    });
    assert.deepEqual(names(wiped.action.makeTargets()), [],
        'no living battler anywhere yields no targets rather than a null');
});

// --- AI candidate pools ---------------------------------------------------

test('itemTargetCandidates offers both sides for the either-side scopes', () => {
    for (const scope of [15, 16, 17, 19, 22]) {
        const { action } = makeAction(scope);
        assert.deepEqual(names(action.itemTargetCandidates()).sort(),
            ['actor0', 'actor1', 'enemy0', 'enemy1'],
            `scope ${scope} lets the AI weigh every living battler`);
    }
});

test('itemTargetCandidates keeps the caster out of scope 18', () => {
    const { action } = makeAction(18);
    assert.deepEqual(names(action.itemTargetCandidates()), ['actor1']);
});

test('itemTargetCandidates is unchanged for the MZ scopes', () => {
    assert.deepEqual(names(makeAction(1).action.itemTargetCandidates()), ['enemy0', 'enemy1']);
    assert.deepEqual(names(makeAction(7).action.itemTargetCandidates()), ['actor0', 'actor1']);
    assert.deepEqual(names(makeAction(11).action.itemTargetCandidates()), ['actor0']);
});

// --- confusion still wins -------------------------------------------------

test('confusion overrides an either-side scope', () => {
    const { action } = makeAction(15, { confused: true });
    action.confusionTarget = () => ({ name: 'confused', isAlive: () => true });
    assert.deepEqual(names(action.makeTargets()), ['confused']);
});
