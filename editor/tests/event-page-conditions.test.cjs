const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.resolve(__dirname, '..');
const editorPath = path.join(editorRoot, 'src', 'event', 'EventPageEditor.js');
const editorSource = fs.readFileSync(editorPath, 'utf8');
const objectsSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');

const EventPageEditor = vm.runInNewContext(`${editorSource}\nEventPageEditor;`, {
    console, process, require, window: {}, rrEscapeHtml: value => String(value ?? ''),
    document: { createElement: () => ({ style: {}, dataset: {} }), getElementById: () => null }
});

const read = (field, raw, current) => EventPageEditor.readConditionValue(field, raw, current);

// Types observed on all 49,371 authored event pages in the bundled projects.
const AUTHORED_TYPES = {
    actorId: 'number', itemId: 'number', switch1Id: 'number', switch2Id: 'number',
    variableId: 'number', variableValue: 'number', selfSwitchCh: 'string'
};

test('a dropdown condition is stored as the number authored data uses', () => {
    // A <select> reports type "select-one", never "number", so the old
    // type-driven conversion left these as strings.
    for (const field of ['actorId', 'itemId']) {
        const stored = read(field, '3', 1);
        assert.equal(typeof stored, AUTHORED_TYPES[field], field);
        assert.equal(stored, 3);
    }
});

test('the self-switch letter stays a string', () => {
    for (const letter of ['A', 'B', 'C', 'D']) {
        assert.equal(read('selfSwitchCh', letter, 'A'), letter);
    }
});

test('clearing a number field does not write a value the engine cannot compare', () => {
    // parseInt('') is NaN, which JSON.stringify writes as null. The runtime then
    // evaluates `$gameVariables.value(id) < null`, i.e. `< 0`, so a page starts
    // meeting a condition that was never satisfied before.
    assert.equal(read('variableValue', '', 25), 25, 'the previous value is kept');
    assert.equal(read('variableValue', 'abc', 25), 25);
    assert.equal(read('variableId', '', 7), 7);
    for (const raw of ['', 'abc', '   ']) {
        assert.ok(Number.isFinite(read('variableValue', raw, 0)), `"${raw}" stays finite`);
    }
});

test('zero and negative thresholds are preserved', () => {
    // variableValue is a real threshold, so 0 and negatives are legitimate.
    assert.equal(read('variableValue', '0', 5), 0);
    assert.equal(read('variableValue', '-10', 5), -10);
});

test('a first-time edit of an unset field still yields a number', () => {
    assert.equal(read('variableValue', '', undefined), 0);
    assert.equal(read('actorId', '', undefined), 0);
});

test('the runtime comparison is what makes the null case matter', () => {
    assert.match(objectsSource,
        /if \(\$gameVariables\.value\(c\.variableId\) < c\.variableValue\) \{/,
        'the variable condition is a bare less-than against the stored value');
    assert.equal(5 < null, false);
    assert.equal(-1 < null, true, 'which is how a cleared field changes behaviour');
});

test('the handler no longer branches on the element type', () => {
    assert.doesNotMatch(editorSource, /if \(e\.target\.type === 'number'\)/,
        'element type does not describe the field, the field does');
    assert.match(editorSource, /EventPageEditor\.readConditionValue\(\s*\n?\s*field, e\.target\.value, page\.conditions\[field\]\)/);
});

test('every numeric condition the form exposes is declared numeric', () => {
    const exposed = new Set(
        [...editorSource.matchAll(/data-field="(\w+)"/g)].map(match => match[1]));
    const missing = Object.entries(AUTHORED_TYPES)
        .filter(([field, type]) => type === 'number' && exposed.has(field))
        .filter(([field]) => !EventPageEditor.NUMERIC_CONDITIONS.includes(field))
        .map(([field]) => field);
    assert.deepEqual(missing, [],
        `these are numbers in authored data but are not converted: ${missing.join(', ')}`);
});

//-----------------------------------------------------------------------------
// Autonomous custom routes

test('a page set to Custom movement can say what the route is', () => {
    /*
     * Choosing Custom was only half of it. The type could be set and there was
     * no way to say what the route actually was — the page kept whatever list
     * it already had, and a new event kept an empty one, so Custom meant
     * "stand still" and could not be made to mean anything else. RPG Maker
     * puts a Route... button beside the dropdown; there was none here.
     */
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'event', 'EventPageEditor.js'), 'utf8');
    assert.match(source, /class="movement-route-btn rr-btn-chip"/, 'the button exists, in app chrome');
    assert.match(source, /page\.moveType === 3 \? '' : 'disabled'/,
        'and only a custom route has a route to edit');
    // The choice and the button stay in step, rather than the button sitting
    // there inviting a click that would do nothing.
    assert.match(source, /if \(field === 'moveType'\) \{[\s\S]*?button\.disabled = page\.moveType !== 3/);
    assert.match(source, /editor\.showRoute\(page\.moveRoute, route => \{ page\.moveRoute = route; \}\)/,
        'and it writes the route back onto the page');
});

test('the route dialog is borrowed, not built a second time', () => {
    /*
     * An autonomous custom route *is* a move route — the same structure built
     * from the same forty-five commands, which is why RPG Maker opens the same
     * dialog for both. Two of them would drift apart a command at a time.
     */
    const page = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'event', 'EventPageEditor.js'), 'utf8');
    assert.match(page, /const owner = this\.parentEditor && this\.parentEditor\.commandList;/);
    assert.match(page, /if \(owner && owner\.setMovementRouteEditor\) return owner\.setMovementRouteEditor;/);

    const dialog = fs.readFileSync(path.join(__dirname, '..', 'src', 'event',
        'commands', 'SetMovementRouteEditor.js'), 'utf8');
    // What the page has already answered is left out: it is always this event,
    // and nothing is waiting on it to finish.
    assert.match(dialog, /if \(!this\.autonomous\) this\.renderCharacterDropdown\(panel\)/);
    assert.match(dialog, /if \(!this\.autonomous\) \{\s*\n\s*section\.appendChild\(this\._checkbox\('Wait for Completion'/);
    // And it hands back the route itself, because that is what a page stores.
    assert.match(dialog, /this\.callback\(this\.autonomous \? this\.moveRoute : this\.buildCommand\(\)\)/);
    // Both ways in share one tail, so the list invariant cannot be enforced in
    // one of them and forgotten in the other.
    assert.equal((dialog.match(/this\._openWithRoute\(\);/g) || []).length, 2);
});
