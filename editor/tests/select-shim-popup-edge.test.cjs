const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const dom = require('./helpers/mini-dom.cjs');

const shim = fs.readFileSync(path.join(__dirname, '../src/utils/SelectThemingShim.js'), 'utf8');

/** Open the themed popup of one select in a window `innerWidth` wide; every mini-dom box spans x 0..200. */
function openPopup(innerWidth) {
    const context = dom.createContext({ innerWidth });
    const select = dom.createSelect([{ value: 'a', text: 'A starter with a hint' }, { value: 'b', text: 'Another' }], 'a');
    context.document.body.appendChild(select);
    vm.runInNewContext(shim, context);
    context.document.body.querySelector('.rr-shim-trigger').fire('click');
    return context.document.body.querySelector('.rr-shim-popup');
}

test('a popup that would run off the right edge slides back inside the window', () => {
    const popup = openPopup(150);
    assert.ok(popup, 'the popup opened');
    assert.equal(popup.style.left, '8px', 'pulled in to the left margin, since the trigger leaves no room');
});

test('a popup with room to its right stays anchored at its trigger', () => {
    const popup = openPopup(1200);
    assert.ok(popup, 'the popup opened');
    assert.notEqual(popup.style.left, '8px');
    assert.match(popup.style.cssText, /left: 0px;/, 'the trigger’s own left');
});
