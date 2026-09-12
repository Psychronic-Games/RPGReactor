const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const dom = require('./helpers/mini-dom.cjs');
const source = name => fs.readFileSync(path.join(__dirname, '../src/utils', name), 'utf8');

function press(target, key, fields = {}) {
    let consumed = false;
    target.fire('keydown', { key, preventDefault() { consumed = true; }, ...fields });
    return consumed;
}

test('list arrows retain focus through row rebuilds and repeated binding', () => {
    const context = dom.createContext();
    vm.runInNewContext(source('PickerIndex.js'), context);
    const list = dom.createElement('div'); context.document.body.appendChild(list);
    let selected = 0, changes = 0;
    const render = () => {
        [...list.children].forEach(row => row.remove());
        for (let id = 0; id < 4; id++) {
            const row = dom.createElement('div'); row.dataset.id = String(id);
            if (id === 1) row.style.display = 'none';
            list.appendChild(row);
        }
    };
    const options = {
        items: () => list.children,
        isSelected: row => Number(row.dataset.id) === selected,
        select: row => { selected = Number(row.dataset.id); changes++; render(); }
    };
    render();
    context.RRPickerIndex.bindListNavigation(list, options);
    context.RRPickerIndex.bindListNavigation(list, options);
    assert.equal(press(list, 'ArrowDown'), true);
    assert.equal(selected, 2, 'hidden rows are skipped');
    assert.equal(changes, 1, 'binding again retires the previous listener');
    assert.equal(context.document.activeElement, list);
    press(list, 'End'); assert.equal(selected, 3);
    press(list, 'Home'); assert.equal(selected, 0);
});

test('list navigation leaves editable controls and modified keys alone', () => {
    const context = dom.createContext();
    vm.runInNewContext(source('PickerIndex.js'), context);
    const list = dom.createElement('div'); context.document.body.appendChild(list);
    const input = dom.createElement('input'); list.appendChild(input);
    let changes = 0;
    context.RRPickerIndex.bindListNavigation(list, { items: () => [input], isSelected: () => false, select: () => changes++ });
    assert.equal(press(list, 'ArrowDown', { target: input }), false);
    assert.equal(press(list, 'ArrowDown', { ctrlKey: true }), false);
    assert.equal(changes, 0);
});

test('short themed dropdowns own arrows, skip disabled choices, and commit on Enter', () => {
    const context = dom.createContext();
    const select = dom.createSelect([{ value: 'a', text: 'A' }, { value: 'b', text: 'B' }, { value: 'c', text: 'C' }], 'a');
    select.options[1].disabled = true;
    context.document.body.appendChild(select);
    vm.runInNewContext(source('SelectThemingShim.js'), context);
    context.document.querySelector('.rr-shim-trigger').click();
    const popup = context.document.querySelector('.rr-shim-popup');
    assert.equal(context.document.activeElement, popup);
    assert.equal(press(context.document, 'ArrowDown', { target: popup }), true);
    assert.equal(popup.querySelector('[aria-selected="true"]').dataset.optionIndex, '2');
    assert.equal(select.value, 'a', 'navigation previews a choice without committing');
    press(context.document, 'Enter', { target: popup });
    assert.equal(select.value, 'c');
    assert.equal(popup.isConnected, false);
    assert.equal(context.document.activeElement, select);
});

test('Escape cancels a dropdown highlight and removes its keyboard listener', () => {
    const context = dom.createContext();
    const select = dom.createSelect([{ value: 'a', text: 'A' }, { value: 'b', text: 'B' }], 'a');
    context.document.body.appendChild(select);
    vm.runInNewContext(source('SelectThemingShim.js'), context);
    assert.equal(press(select, 'ArrowDown'), true);
    const popup = context.document.querySelector('.rr-shim-popup');
    press(context.document, 'ArrowDown', { target: popup });
    assert.equal(press(context.document, 'Escape', { target: popup }), true);
    assert.equal(select.value, 'a');
    assert.equal(context.document.activeElement, select);
    assert.equal(press(context.document, 'ArrowDown', { target: select }), false);
});
