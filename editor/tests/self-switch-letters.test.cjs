const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Self switches run from A to Z. A to D keep their meaning, so projects made
// with four letters play as before.
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const editorRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, 'src', file), 'utf8');

test('the page condition offers every letter and keeps the one stored', () => {
    const source = read('event/EventPageEditor.js');
    const at = source.indexOf('data-field="selfSwitchCh"');
    const select = source.slice(at, source.indexOf('</select>', at));
    const conditions = { selfSwitchValid: true, selfSwitchCh: 'Q' };
    const html = vm.runInNewContext('`' + select.slice(select.indexOf('${\'ABC')) + '`', { conditions });
    const values = [...html.matchAll(/<option value="([A-Z])"/g)].map(m => m[1]);
    assert.deepEqual(values, LETTERS);
    assert.match(html, /<option value="Q" selected>Q<\/option>/);
});

test('Control Self Switch and Conditional Branch offer every letter', () => {
    for (const file of ['event/commands/ControlSelfSwitchEditor.js', 'event/commands/ConditionalBranchEditor.js']) {
        const source = read(file);
        assert.match(source, /'ABCDEFGHIJKLMNOPQRSTUVWXYZ'\.split\(''\)/, file);
        assert.doesNotMatch(source, /\['A', 'B', 'C', 'D'\]/, file);
    }
});

test('a page conditioned on self switch Z appears once Z is on', () => {
    const source = runtimeSource('reactor_objects.js');
    const slice = (start, end) => {
        const at = source.indexOf(start);
        assert.ok(at >= 0, start);
        return source.slice(at, source.indexOf(end, at + start.length));
    };
    const context = { console };
    vm.createContext(context);
    vm.runInContext([
        'function Game_Event() {}',
        slice('function Game_SelfSwitches() {', '\n//-----'),
        slice('Game_Event.prototype.meetsConditions = function', '\n};') + '\n};',
        'this.Game_Event = Game_Event; this.$gameSelfSwitches = new Game_SelfSwitches();',
        '$gameSelfSwitches.onChange = () => {};'
    ].join('\n'), context);
    const event = Object.create(context.Game_Event.prototype);
    event._mapId = 3;
    event._eventId = 7;
    const page = { conditions: { selfSwitchValid: true, selfSwitchCh: 'Z' } };
    assert.equal(event.meetsConditions(page), false);
    context.$gameSelfSwitches.setValue([3, 7, 'Z'], true);
    assert.equal(event.meetsConditions(page), true);
    assert.equal(context.$gameSelfSwitches.value([3, 7, 'A']), false, 'A is its own switch');
});

test('a removed battle unit leaves no self switch of any letter for the next unit with its id', () => {
    const source = runtimeSource('reactor_fight.js');
    assert.doesNotMatch(source, /\["A", "B", "C", "D"\]/);
    assert.match(source, /const prefix = `\$\{map\.mapId\(\)\},\$\{id\},`;/);
});
