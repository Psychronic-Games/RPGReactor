'use strict';
// A slider's value typed in (src/utils/SliderNumbers.js), in the Animation and Effekseer generators: the number box
// sets its slider within the slider's limits and sends the slider's own events, so the tool hears a drag.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const Numbers = require('../src/utils/SliderNumbers.js');
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

function fakeRange(min, max) {
    const events = [];
    return { min: String(min), max: String(max), value: '0', events, dispatchEvent(e) { events.push(e.type); } };
}

test('a typed value is held to the slider\'s limits; nonsense is not a value', () => {
    const range = fakeRange(-1, 2.5);
    assert.equal(Numbers.clamp(range, '1.25'), 1.25);
    assert.equal(Numbers.clamp(range, 9), 2.5);
    assert.equal(Numbers.clamp(range, '-7'), -1);
    assert.ok(Number.isNaN(Numbers.clamp(range, 'abc')));
    assert.ok(Number.isNaN(Numbers.clamp(range, '')));
});

test('Enter or leaving the box moves the slider and sends its input and change events', () => {
    global.Event = class { constructor(type) { this.type = type; } };
    const range = fakeRange(0, 10);
    const parent = { querySelector: () => range, parentElement: null };
    const listeners = {};
    const rootEl = { addEventListener: (type, fn) => { listeners[type] = fn; } };
    const box = { value: '7.5', dataset: { digits: '2' }, parentElement: parent, classList: { contains: c => c === Numbers.CLASS }, select() {} };
    Numbers.bind(rootEl);
    Numbers.bind(rootEl);
    listeners.change({ target: box });
    assert.equal(range.value, '7.5');
    assert.deepEqual(range.events, ['input', 'change']);
    assert.equal(box.value, '7.50');
    box.value = '99';
    let prevented = false;
    listeners.keydown({ target: box, key: 'Enter', preventDefault() { prevented = true; }, stopPropagation() {} });
    assert.ok(prevented);
    assert.equal(range.value, '10', 'held to the slider\'s max');
    delete global.Event;
});

test('both generators draw a number box beside every slider and load the helper', () => {
    const ag = read('src/forge/AnimationGenerator/AnimationGenerator.js');
    assert.match(ag, /<input type="number" class="rr-ag-param-val rr-gen-param-val rr-slider-num"/);
    assert.match(ag, /globalThis\.RRSliderNumbers\?\.bind\(root\)/);
    const efk = read('src/forge/EffekseerGenerator/EffekseerGenerator.js');
    assert.match(efk, /<input type="number" data-param-value="\$\{s\.key\}" class="rr-gen-param-val rr-slider-num"/);
    assert.match(efk, /<input type="number" data-lval="\$\{idx\}:\$\{s\.key\}" class="rr-gen-param-val rr-slider-num"/);
    assert.match(efk, /globalThis\.RRSliderNumbers\?\.bind\(host\)/);
    assert.ok(read('index.html').includes('<script src="src/utils/SliderNumbers.js"></script>'));
});
