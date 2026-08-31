const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');

test('opening the plugin command dialog does not dump every command schema', () => {
    // One console.log per parse, carrying every plugin's whole command list --
    // enough noise to bury whatever you had the console open for.
    const source = read('src/event/commands/PluginCommandEditor.js');
    assert.equal(source.includes("console.log('Parsed commands:'"), false);
});

test('a list icon that cannot load clears its box and says so', () => {
    // Both image loads had an onload and no onerror, so an unreadable face or
    // battler left a permanently blank ringed box and logged nothing -- which
    // is indistinguishable from the URL bug this function once had.
    const source = read('src/DatabaseEditorUI.js');
    const at = source.indexOf('applyListIcon(span, entry, type) {');
    assert.ok(at >= 0, 'applyListIcon is still declared');
    const body = source.slice(at, source.indexOf('\n    refreshListIcon(', at));

    assert.equal((body.match(/\.onload = /g) || []).length, 2, 'a face and a charset battler load');
    assert.equal((body.match(/\.onerror = /g) || []).length, 2, 'and both now report a failure');

    // Run the handlers rather than trusting the count: each has to undo the
    // ringed box, not merely exist.
    for (const handler of body.match(/\.onerror = \(\) => \{[\s\S]*?\n {12,16}\};/g) || []) {
        const span = { style: {}, classList: { removed: [], remove(name) { this.removed.push(name); } } };
        const warned = [];
        const context = {
            span,
            console: { warn: message => warned.push(message) },
            facePath: 'C:/Project/img/faces/Missing.png',
            battlerPath: 'C:/Project/img/enemies/Missing.png'
        };
        vm.runInNewContext(`const img = {}; img${handler}\nimg.onerror();`, context);
        assert.equal(span.style.backgroundImage, 'none', 'the box is cleared');
        assert.deepEqual(span.classList.removed, ['has-icon']);
        assert.equal(warned.length, 1, 'and the failure is named');
        assert.match(warned[0], /could not load/);
    }
});

test('the icon picker closes on Escape, and stops listening when it does', () => {
    // A picker that only closes through Cancel traps the keyboard habit every
    // other dialog in the editor answers to. The listener is captured so a
    // focused grid cell cannot swallow the key first, and removed on close so
    // a dismissed picker cannot answer for the one still on screen.
    const source = read('src/utils/IconPicker.js');
    assert.match(source, /document\.addEventListener\('keydown', onKey, true\)/);
    assert.match(source, /document\.removeEventListener\('keydown', onKey, true\)/);

    // The handler itself: Escape closes and stops the key, anything else is
    // left for the field underneath.
    const at = source.indexOf('const onKey = event => {');
    const handler = source.slice(at, source.indexOf('\n        };', at) + '\n        };'.length);
    let closed = 0;
    let stopped = 0;
    const context = { close: () => { closed += 1; } };
    vm.runInNewContext(`${handler}\nthis.onKey = onKey;`, context);
    context.onKey({ key: 'Escape', stopPropagation: () => { stopped += 1; } });
    assert.equal(closed, 1);
    assert.equal(stopped, 1, 'the key does not travel on to whatever is behind');
    context.onKey({ key: 'a', stopPropagation: () => { stopped += 1; } });
    assert.equal(closed, 1, 'an ordinary key is left alone');
    assert.equal(stopped, 1);
});

test('the record-template slice anchors on the definition, not the first mention', () => {
    // getDefaultTemplates is called at three sites above the one that defines
    // it, so anchoring on the first textual match and then scanning forward for
    // `return {` reads whichever literal happens to sit in between.
    const testSource = read('tests/database-record-templates.test.cjs');
    assert.match(testSource, /indexOf\('getDefaultTemplates\(\) \{'\)/);

    const uiSource = read('src/DatabaseEditorUI.js');
    assert.ok(uiSource.indexOf('this.getDefaultTemplates()') < uiSource.indexOf('getDefaultTemplates() {'),
        'a call site really does come first, so the old anchor really was wrong');
});
