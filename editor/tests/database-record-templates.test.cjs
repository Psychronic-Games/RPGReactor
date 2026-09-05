const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.resolve(__dirname, '..');
const uiSource = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
const objectsSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');

/**
 * Evaluates just the getDefaultTemplates() literal, which is self-contained.
 */
function defaultTemplates() {
    // Anchor on the definition, not the first mention: call sites appear far
    // earlier in the file, and anchoring on one made this slice swallow any
    // `return {` added in between.
    const at = uiSource.indexOf('getDefaultTemplates() {');
    assert.ok(at >= 0, 'getDefaultTemplates is present');
    const open = uiSource.indexOf('return {', at);
    let depth = 0, i = open + 'return '.length, quote = null;
    const start = i;
    while (i < uiSource.length) {
        const char = uiSource[i];
        if (quote) {
            if (char === '\\') { i += 2; continue; }
            if (char === quote) quote = null;
        } else if (char === '"' || char === "'" || char === '`') quote = char;
        else if ('([{'.includes(char)) depth++;
        else if (')]}'.includes(char)) { depth--; if (depth === 0) { i++; break; } }
        i++;
    }
    // eslint-disable-next-line no-new-func
    return new Function(`return ${uiSource.slice(start, i)};`)();
}

// Shapes observed in RPG Maker-authored project data. The projects themselves
// are mostly private, so the derived table is vendored; regenerate it with
// helpers/derive-authored-data-shapes.cjs.
const authored = require(path.join(__dirname, 'helpers', 'authored-data-shapes.json'));

// Reactor stores troop notes and state descriptions, which the engine's own
// editor does not write.
const REACTOR_EXTRAS = { troops: new Set(['note']), states: new Set(['description']) };

test('a newly created record has every field authored records always carry', () => {
    // A field on 100% of authored records is one the runtime is entitled to
    // read without checking, so a new record has to supply it too.
    const templates = defaultTemplates();
    const gaps = [];
    for (const [type, shape] of Object.entries(authored.records)) {
        for (const field of shape.always) {
            if (!(field in templates[type])) gaps.push(`${type}.${field}`);
        }
    }
    assert.deepEqual(gaps.sort(), [],
        `these fields exist on every authored record but not on a new one:\n${gaps.join('\n')}`);
});

test('a new record does not invent fields the engine never writes', () => {
    const templates = defaultTemplates();
    const invented = [];
    for (const [type, shape] of Object.entries(authored.records)) {
        const seen = new Set(shape.everSeen);
        for (const field of Object.keys(templates[type])) {
            if (seen.has(field) || REACTOR_EXTRAS[type]?.has(field)) continue;
            invented.push(`${type}.${field}`);
        }
    }
    assert.deepEqual(invented.sort(), [], `no authored record has:\n${invented.join('\n')}`);
});

test('a new skill is usable, rather than rejected by the weapon-type gate', () => {
    // isSkillWtypeOk compares with === 0, so an absent requiredWtypeId fails
    // every clause and the skill can never be selected by any actor.
    const skill = defaultTemplates().skills;
    assert.equal(skill.requiredWtypeId1, 0);
    assert.equal(skill.requiredWtypeId2, 0);

    const isSkillWtypeOk = candidate => {
        const wtypeId1 = candidate.requiredWtypeId1;
        const wtypeId2 = candidate.requiredWtypeId2;
        return (wtypeId1 === 0 && wtypeId2 === 0) || wtypeId1 > 0 || wtypeId2 > 0;
    };
    assert.ok(isSkillWtypeOk(skill), 'the new skill passes the gate');
    assert.equal(isSkillWtypeOk({}), false, 'and an unset skill is what used to fail');
    assert.match(objectsSource, /wtypeId1 === 0 && wtypeId2 === 0/, 'the gate still compares strictly');
});

test('a new weapon can be equipped', () => {
    // changeEquip requires equipSlots()[slotId] === item.etypeId; weapons sit
    // in slot 1, so a missing etypeId makes the weapon silently unequippable.
    const weapon = defaultTemplates().weapons;
    assert.equal(weapon.etypeId, 1);
    assert.equal(defaultTemplates().armors.etypeId, 2, 'armors were already correct');
    assert.match(objectsSource, /this\.equipSlots\(\)\[slotId\] === item\.etypeId/);
});

test('using a new item does not turn the user TP into NaN', () => {
    const item = defaultTemplates().items;
    assert.equal(item.tpGain, 0);
    assert.match(objectsSource, /Math\.floor\(this\.item\(\)\.tpGain \* this\.subject\(\)\.tcr\)/);
    assert.ok(Number.isNaN(Math.floor(undefined * 1)), 'which is why the field cannot be absent');
    assert.equal(Math.floor(item.tpGain * 1), 0);
});

test('a new state can drive its battler motion and overlay', () => {
    const state = defaultTemplates().states;
    assert.equal(state.motion, 0);
    assert.equal(state.overlay, 0);
    assert.match(objectsSource, /return states\[0\]\.motion;/);
    assert.match(objectsSource, /return states\[0\]\.overlay;/);
});

test('clearing a record produces the same complete shape as creating one', () => {
    // createBlankDatabaseEntry feeds both the Clear action and the repair pass
    // for null slots, so a gap in the template reaches existing projects too.
    assert.match(uiSource, /createBlankDatabaseEntry\(type, id\) \{[\s\S]{0,220}getDefaultTemplates\(\)\[type\]/);
    assert.match(uiSource, /restoreNullDatabaseEntries[\s\S]{0,400}createBlankDatabaseEntry/);
});
