const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
// Loading the shared resolver first is what the editor does, and it is the
// branch _equipBindings takes in the app -- the fallback is only for callers
// that pull the finder in on its own.
require(path.join(editorRoot, 'src', 'utils', 'EquipSlots.js'));
const DatabaseReferenceFinder = require(path.join(editorRoot, 'src', 'database', 'DatabaseReferenceFinder.js'));

const uiSource = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');

/**
 * A small database with one reference of every supported shape. Ids are
 * deliberately not sequential so an off-by-one index/id mix-up shows up.
 */
function fixture() {
    const data = {
        actors: [null, {
            id: 1, name: 'Harold', classId: 2,
            equips: [3, 0, 0, 7, 0],
            traits: [{ code: 43, dataId: 5, value: 0 }]
        }],
        classes: [null, null, {
            id: 2, name: 'Hero',
            learnings: [{ level: 1, skillId: 5 }, { level: 5, skillId: 5 }, { level: 9, skillId: 11 }],
            traits: [{ code: 13, dataId: 4, value: 1 }]
        }],
        skills: [null, null, null, null, null, {
            id: 5, name: 'Fire', animationId: 12,
            effects: [
                { code: 21, dataId: 4, value1: 1 },
                { code: 21, dataId: 0, value1: 1 },   // normal-attack state, not state 0
                { code: 44, dataId: 3 }
            ]
        }],
        items: [null, { id: 1, name: 'Potion', animationId: 12, effects: [{ code: 43, dataId: 11 }] }],
        weapons: [null, null, null, {
            id: 3, name: 'Sword', animationId: 1, traits: [{ code: 32, dataId: 4, value: 0.1 }]
        }],
        armors: [null, null, null, null, null, null, null, {
            id: 7, name: 'Hat', traits: [{ code: 14, dataId: 4, value: 1 }]
        }],
        enemies: [null, null, {
            id: 2, name: 'Bat',
            actions: [{ skillId: 5, rating: 5 }],
            dropItems: [{ kind: 1, dataId: 1, denominator: 2 }, { kind: 0, dataId: 1, denominator: 1 }],
            traits: []
        }],
        troops: [null, {
            id: 1, name: 'Bats',
            members: [{ enemyId: 2 }, { enemyId: 2 }],
            pages: [{
                conditions: { actorValid: true, actorId: 1, enemyValid: false, switchValid: false, turnValid: false },
                list: [
                    { code: 117, indent: 0, parameters: [3] },
                    { code: 311, indent: 0, parameters: [1, 1, 0, 0, 10, false] } // actor from a variable
                ]
            }]
        }],
        states: [null, null, null, null, { id: 4, name: 'Poison', traits: [] }],
        animations: [null, { id: 1, name: 'Slash' }, null, null, null, null, null, null, null, null, null,
            null, { id: 12, name: 'Fire' }],
        tilesets: [null, { id: 1, name: 'Outside' }],
        commonEvents: [null, null, null, {
            id: 3, name: 'Heal',
            list: [
                { code: 126, indent: 0, parameters: [1, 0, 0, 1] },
                { code: 129, indent: 0, parameters: [1, 0, true] },
                { code: 319, indent: 0, parameters: [1, 1, 3] },
                { code: 337, indent: 0, parameters: [0, 12, false] },
                { code: 117, indent: 0, parameters: [3] }   // calls itself
            ]
        }]
    };
    const system = {
        equipTypes: ['', 'Weapon', 'Shield', 'Head', 'Body', 'Accessory'],
        partyMembers: [1]
    };
    return {
        data,
        getSystem: () => system,
        getClass: id => data.classes[id] || null
    };
}

function finder() {
    return new DatabaseReferenceFinder(fixture());
}

/** Comparable, order-independent view of a result set. */
function summarize(references) {
    return references
        .map(r => `${r.type}#${r.id} ${r.where}${r.page ? ` p${r.page}` : ''}${r.count > 1 ? ` x${r.count}` : ''}`)
        .sort();
}

test('a skill is found through traits, class learnings, and enemy actions', () => {
    assert.deepEqual(summarize(finder().findReferences('skills', 5)), [
        'actors#1 Add Skill',
        'classes#2 Learnable Skills x2',   // two learnings of the same skill collapse
        'enemies#2 Action Patterns'
    ]);
});

test('a state is found through every trait and effect code that carries one', () => {
    // dataId 0 on Add State means the attacker's own normal-attack state, so
    // it must not be reported as a reference to state 0 -- or to anything.
    assert.deepEqual(summarize(finder().findReferences('states', 4)), [
        'armors#7 State Resist',
        'classes#2 State Rate',
        'skills#5 Add State',
        'weapons#3 Attack State'
    ]);
});

test('an animation is found through skills, items, and event commands', () => {
    assert.deepEqual(summarize(finder().findReferences('animations', 12)), [
        'commonEvents#3 Show Battle Animation',
        'items#1 Animation',
        'skills#5 Animation'
    ]);
});

test('an actor is found through troop conditions, commands, and the starting party', () => {
    // Change HP here selects its actor from a variable, so no id is in the
    // data to report -- claiming one would be a guess.
    assert.deepEqual(summarize(finder().findReferences('actors', 1)), [
        'commonEvents#3 Change Equipment',
        'commonEvents#3 Change Party Member',
        'system#0 Starting Party',
        'troops#1 Conditions p1'
    ]);
});

test('equipment ids resolve to weapons or armors by the slot equip type', () => {
    // equips[0] sits in the Weapon slot, and Change Equipment names equip
    // type 1, so both resolve to $dataWeapons rather than $dataArmors.
    assert.deepEqual(summarize(finder().findReferences('weapons', 3)), [
        'actors#1 Equipment',
        'commonEvents#3 Change Equipment'
    ]);
    assert.deepEqual(summarize(finder().findReferences('armors', 7)), ['actors#1 Equipment']);
});

test('enemies, items, classes, and common events resolve through their own fields', () => {
    const f = finder();
    assert.deepEqual(summarize(f.findReferences('enemies', 2)), ['troops#1 Members x2']);
    assert.deepEqual(summarize(f.findReferences('items', 1)), [
        'commonEvents#3 Change Items',
        'enemies#2 Drop Items'
    ]);
    assert.deepEqual(summarize(f.findReferences('classes', 2)), ['actors#1 Class']);
    // The common event calls itself as well; a self-reference is not something
    // the author can navigate to, so it is dropped.
    assert.deepEqual(summarize(f.findReferences('commonEvents', 3)), [
        'skills#5 Common Event',
        'troops#1 Common Event p1'
    ]);
});

test('an unreferenced entry and an out-of-range id both come back empty', () => {
    const f = finder();
    assert.deepEqual(f.findReferences('tilesets', 1), []);
    assert.deepEqual(f.findReferences('skills', 999), []);
    assert.deepEqual(f.findReferences('skills', 0), []);
    assert.deepEqual(f.findReferences('mapInfos', 1), []);
});

test('conditional branch reads the id only from the sub-conditions that carry one', () => {
    const refs = (params) => DatabaseReferenceFinder.commandReferences(111, params);
    assert.deepEqual(refs([4, 1, 2, 6]), [{ type: 'actors', id: 1 }, { type: 'classes', id: 6 }]);
    assert.deepEqual(refs([4, 1, 3, 6]), [{ type: 'actors', id: 1 }, { type: 'skills', id: 6 }]);
    assert.deepEqual(refs([4, 1, 6, 6]), [{ type: 'actors', id: 1 }, { type: 'states', id: 6 }]);
    // "In the Party" has no second id, and Name compares a string.
    assert.deepEqual(refs([4, 1, 0]), [{ type: 'actors', id: 1 }]);
    assert.deepEqual(refs([4, 1, 1, 'Harold']), [{ type: 'actors', id: 1 }]);
    assert.deepEqual(refs([5, 0, 1, 4]), [{ type: 'states', id: 4 }]);
    assert.deepEqual(refs([5, 0, 0]), []);
    assert.deepEqual(refs([8, 2]), [{ type: 'items', id: 2 }]);
    assert.deepEqual(refs([0, 3, 0]), []);   // switch
});

test('shop goods read both the command and its continuation rows', () => {
    assert.deepEqual(DatabaseReferenceFinder.commandReferences(302, [1, 4, 0, 0, false]),
        [{ type: 'weapons', id: 4 }]);
    assert.deepEqual(DatabaseReferenceFinder.commandReferences(605, [2, 9, 0, 0]),
        [{ type: 'armors', id: 9 }]);
});

test('battle processing reads a troop id only when it is designated directly', () => {
    assert.deepEqual(DatabaseReferenceFinder.commandReferences(301, [0, 5, false, false]),
        [{ type: 'troops', id: 5 }]);
    assert.deepEqual(DatabaseReferenceFinder.commandReferences(301, [1, 5, false, false]), []);
    assert.deepEqual(DatabaseReferenceFinder.commandReferences(301, [2, 0, false, false]), []);
});

test('every phrase the finder emits already has a translation', () => {
    // The finder returns English phrases for the UI to translate. One that is
    // not in the tables renders English in all 17 locales and no test would
    // otherwise notice, because the phrase is not a literal at the call site.
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'I18nDeepTranslations.js'), 'utf8') +
        '\n' + fs.readFileSync(path.join(editorRoot, 'src', 'I18nManager.js'), 'utf8');
    const context = {};
    vm.createContext(context);
    vm.runInContext(
        source.slice(0, source.indexOf('class I18nManager')) +
        ';__t = { text: RR_TEXT_TRANSLATIONS, commands: RR_EVENT_COMMAND_NAMES };',
        context
    );
    const { text, commands } = context.__t;

    const fieldPhrases = [
        ...Object.values(DatabaseReferenceFinder.traitRefs).map(ref => ref.where),
        ...Object.values(DatabaseReferenceFinder.effectRefs).map(ref => ref.where),
        // The phrases scan() passes literally.
        'Class', 'Equipment', 'Learnable Skills', 'Animation', 'Action Patterns',
        'Drop Items', 'Members', 'Conditions', 'Starting Party',
        // Composed into the row by _referenceRow.
        'Page', 'Referenced by', 'Nothing in the database references this entry.', 'Close'
    ];
    assert.deepEqual(fieldPhrases.filter(phrase => !text.ja[phrase]), []);

    // Command names go through tEventCommandName, which falls back to tText.
    const commandPhrases = Object.values(DatabaseReferenceFinder.commandNames);
    assert.deepEqual(commandPhrases.filter(name => !commands.ja[name] && !text.ja[name]), []);
});

test('scan() only reports ids that are really there', () => {
    const hits = [];
    finder().scan(hit => hits.push(hit));
    for (const hit of hits) {
        assert.ok(Number.isInteger(hit.refId) && hit.refId > 0, `${hit.where} -> ${hit.refId}`);
        assert.ok(hit.type === 'system' || Number.isInteger(hit.id), `${hit.type}#${hit.id}`);
        assert.ok(['text', 'eventCommand'].includes(hit.whereKind));
    }
});

test('the list context menu offers Referenced by and the modal can navigate', () => {
    assert.match(uiSource, /tText\('Referenced by'\)/);
    assert.match(uiSource, /showReferencesModal\(/);
    assert.match(uiSource, /navigateToDatabaseEntry\(/);
    // The menu item is hidden for a section the finder cannot answer for.
    assert.match(uiSource, /DatabaseReferenceFinder\.targetTypes\.includes\(type\)/);
});

test('the modal uses the shared modal chrome', () => {
    const at = uiSource.indexOf('showReferencesModal(entry, type) {');
    assert.ok(at >= 0);
    const body = uiSource.slice(at, uiSource.indexOf('\n    /** One clickable row', at));
    for (const cls of ['rr-modal-overlay', 'rr-modal-header', 'rr-modal-title',
        'rr-modal-close', 'rr-modal-body', 'rr-modal-footer']) {
        assert.ok(body.includes(cls), `uses ${cls}`);
    }
    // Author-supplied entry names must not go through the generic text pass.
    assert.match(body, /data-rr-i18n-skip/);
});

test('reference rows are reachable without a mouse', () => {
    const at = uiSource.indexOf('_referenceRow(reference, translateWhere, close) {');
    const body = uiSource.slice(at, uiSource.indexOf('\n    /**', at + 10));
    assert.match(body, /row\.tabIndex = 0/);
    assert.match(body, /setAttribute\('role', 'button'\)/);
    assert.match(body, /event\.key !== 'Enter' && event\.key !== ' '/);
});

test('jumping to an entry selects it even past the rendered batch', () => {
    // The list renders 250 rows at a time, so selecting alone would leave a
    // far entry with no row; reveal() repopulates before scrolling to it.
    const at = uiSource.indexOf('reveal: (id) => {');
    assert.ok(at >= 0, 'the list session exposes reveal');
    const body = uiSource.slice(at, uiSource.indexOf('};', at));
    assert.match(body, /selectIds\(\[id\], id\)/);
    assert.match(body, /populateList\(searchInput\.value, false, \{ preserveScroll: true \}\)/);
    assert.match(body, /scrollIntoView/);
});

test('the finder source carries no invisible control characters', () => {
    // The dedupe key was first written with literal NUL bytes where spaces
    // were meant. Node parsed it, every test passed, and the only symptom was
    // grep calling the file binary -- so nothing else here would catch it.
    const bytes = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseReferenceFinder.js'));
    const control = [...bytes].filter(byte => byte < 0x20 && byte !== 0x0a && byte !== 0x09);
    assert.deepEqual(control, [], 'only newlines and tabs below 0x20');
});

test('the finder loads before the UI that constructs it', () => {
    const finderTag = indexHtml.indexOf('src/database/DatabaseReferenceFinder.js');
    const uiTag = indexHtml.indexOf('src/DatabaseEditorUI.js');
    const equipTag = indexHtml.indexOf('src/utils/EquipSlots.js');
    assert.ok(finderTag >= 0, 'the finder is on the page');
    assert.ok(finderTag < uiTag, 'and before DatabaseEditorUI.js');
    assert.ok(equipTag < finderTag, 'EquipSlots.js is available to it');
});
