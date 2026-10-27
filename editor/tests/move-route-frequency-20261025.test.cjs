'use strict';
// Set Movement Route keeps a route's own frequency (route.rrFrequency, 1-8) where the project moves as RPG Maker
// 2000/2003 did: the import keeps it, the runtime times the route by it, and the dialog now shows and sets it.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function el(tag) {
    const node = { tagName: tag.toUpperCase(), children: [], style: {}, listeners: {}, value: '', selected: false, title: '', className: '',
        appendChild(c) { this.children.push(c); if (this.tagName === 'SELECT' && c.selected) this.value = c.value; return c; },
        addEventListener(t, f) { this.listeners[t] = f; }, setAttribute() {} };
    return node;
}
global.document = { createElement: el, createTextNode: t => ({ text: t }) };
const SetMovementRouteEditor = require('../src/event/commands/SetMovementRouteEditor.js');

function editor(system, route) {
    const e = Object.create(SetMovementRouteEditor.prototype);
    e._t = s => s; e.autonomous = false;
    e.databaseManager = { getSystem: () => system };
    e.moveRoute = route;
    return e;
}
const select = section => section.children.map(c => c.children && c.children.find(x => x.tagName === 'SELECT')).find(Boolean);

test('a 2000/2003 project shows a route\'s frequency and sets it', () => {
    const route = { list: [{ code: 0 }], repeat: false, skippable: false, wait: true, rrFrequency: 8 };
    const e = editor({ rrLegacyMotion: true }, route), parent = el('div');
    e.renderOptions(parent);
    const pick = select(parent.children[0]);
    assert.ok(pick, 'the Frequency field is there');
    assert.equal(pick.value, '8');
    assert.deepEqual(pick.children.map(o => o.value), ['0', '8', '7', '6', '5', '4', '3', '2', '1']);
    pick.value = '3'; pick.listeners.change();
    assert.equal(route.rrFrequency, 3);
    pick.value = '0'; pick.listeners.change();
    assert.equal('rrFrequency' in route, false, 'Not set leaves it to MZ timing');
});

test('an MZ project shows no frequency unless the route already carries one', () => {
    const parent = el('div');
    editor({}, { list: [{ code: 0 }], repeat: false, skippable: false, wait: true }).renderOptions(parent);
    assert.equal(select(parent.children[0]), undefined);
    const kept = el('div');
    editor({}, { list: [{ code: 0 }], repeat: false, skippable: false, wait: true, rrFrequency: 5 }).renderOptions(kept);
    assert.equal(select(kept.children[0]).value, '5');
});

test('the dialog\'s strings are translated in every language', () => {
    const sandbox = { window: { dispatchEvent() {} }, document: { readyState: 'complete', documentElement: {}, addEventListener() {}, querySelectorAll() { return []; } }, localStorage: { getItem() { return null; }, setItem() {} }, CustomEvent: class {} };
    sandbox.window.document = sandbox.document; sandbox.window.localStorage = sandbox.localStorage;
    const src = ['I18nDeepTranslations.js', 'I18nReviewedTranslations.js', 'I18nManager.js'].map(f => path.join(__dirname, '../src', f)).filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const text = vm.runInNewContext(`${src}\nRR_TEXT_TRANSLATIONS;`, sandbox);
    const missing = [];
    for (const l of ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'])
        for (const k of ['Frequency:', 'Not set', 'Highest', 'Lowest', 'How long the character pauses after each step and turn on this route (RPG Maker 2000/2003 timing)'])
            if (!text[l] || !text[l][k] || text[l][k] === k) missing.push(l + ': ' + k);
    assert.deepEqual(missing, []);
});
