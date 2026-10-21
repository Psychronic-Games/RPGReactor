/**
 * Change Enemy HP, MP, TP and State take every enemy at once (-1), as Recover
 * All does. Their dialogs offered only the eight slots, so an Entire Troop
 * command reopened showing "#1", and its list row read "#0".
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const commandsRoot = path.join(editorRoot, 'src', 'event', 'commands');
const RREnemySlotOptions = require(path.join(commandsRoot, 'EnemySlotOptions.js'));
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));

class FakeElement {
    constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.textContent = ''; this.selected = false; }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener() {}
    querySelector() { return new FakeElement('div'); }
}

function withFakeDom(run) {
    const saved = [global.document, global.window, global.RREnemySlotOptions];
    global.document = { createElement: tag => new FakeElement(tag), body: { appendChild() {} } };
    global.window = {};
    global.RREnemySlotOptions = RREnemySlotOptions;
    try { return run(); } finally { [global.document, global.window, global.RREnemySlotOptions] = saved; }
}

const DATABASE = { getEnemies: () => [], getStates: () => [], data: { states: [null] } };

test('the enemy HP, MP, TP and State dialogs offer and keep Entire Troop', () => {
    const cases = { ChangeEnemyHPEditor: [331, [-1, 1, 0, 5, false]], ChangeEnemyMPEditor: [332, [-1, 1, 0, 5]],
        ChangeEnemyTPEditor: [342, [-1, 1, 0, 5]], ChangeEnemyStateEditor: [333, [-1, 0, 3]] };
    withFakeDom(() => {
        for (const [file, [code, parameters]] of Object.entries(cases)) {
            const EditorClass = require(path.join(commandsRoot, `${file}.js`));
            const editor = new EditorClass(DATABASE, {});
            editor.show({ code, indent: 0, parameters }, () => {}, {});
            const options = editor.createEnemyIndexSelector().children[1].children;
            const entire = options.find(option => String(option.value) === '-1');
            assert.ok(entire, `${file} offers Entire Troop`);
            assert.equal(entire.selected, true, `${file} reopens an Entire Troop command on it`);
            assert.equal(options.filter(option => option.selected).length, 1, `${file} selects one option`);
        }
    });
});

test('an Entire Troop command\'s list row names the troop, and a variable operand reads as one', () => {
    const list = Object.create(EventCommandList.prototype);
    const describe = (code, parameters) => list.getCommandInfo({ code, indent: 0, parameters }, { list: [] }, 0).description;
    assert.match(describe(331, [-1, 1, 0, 50, false]), /^Entire Troop -50$/);
    assert.match(describe(332, [0, 0, 1, 7]), /^#1 \+/);
    assert.doesNotMatch(describe(332, [0, 0, 1, 7]), /\+7$/, 'variable 7, not the number 7');
    assert.match(describe(333, [-1, 0, 3]), /^Entire Troop /);
});
