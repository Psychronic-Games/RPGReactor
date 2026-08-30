const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'database', 'DatabaseEffectEditor.js'),
    'utf8'
);
const context = {
    window: {},
    rrEscapeHtml: value => String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
};
vm.runInNewContext(`${source}\nglobalThis.DatabaseEffectEditor = DatabaseEffectEditor;`, context);
const DatabaseEffectEditor = context.DatabaseEffectEditor;

function renderStateTab(effect) {
    const editor = new DatabaseEffectEditor({
        getStates: () => [null, { id: 1, name: 'Knockout' }, { id: 2, name: 'Poison' }]
    }, null);
    editor.setupEffectRadioInputs = () => {};
    const container = { innerHTML: '' };
    editor.createStateTab(container, effect);
    return container.innerHTML;
}

function selectOptions(html, code) {
    const match = new RegExp(`<select[^>]+data-code="${code}"[^>]*>([\\s\\S]*?)<\\/select>`).exec(html);
    assert.ok(match, `state selector ${code} is rendered`);
    return match[1];
}

test('Add State offers Normal Attack before real states', () => {
    const options = selectOptions(renderStateTab({ code: 21, dataId: 0, value1: 1, value2: 0 }), 21);
    assert.match(options, /^<option value="0" selected>Normal Attack<\/option>/);
    assert.ok(options.indexOf('Normal Attack') < options.indexOf('Knockout'));
});

test('Remove State offers only real state ids', () => {
    const options = selectOptions(renderStateTab({ code: 22, dataId: 2, value1: 1, value2: 0 }), 22);
    assert.doesNotMatch(options, /Normal Attack/);
    assert.doesNotMatch(options, /value="0"/);
    assert.match(options, /value="2" selected>Poison/);
});

test('an existing Add State sentinel reopens selected', () => {
    const options = selectOptions(renderStateTab({ code: 21, dataId: 0, value1: 0.75, value2: 0 }), 21);
    assert.match(options, /value="0" selected>Normal Attack/);
});

test('toggling and changing Add State preserves the Normal Attack sentinel', () => {
    const editor = new DatabaseEffectEditor({}, null);
    const effect = { code: 21, dataId: 0, value1: 1, value2: 0 };
    const listeners = {};
    const radio = {
        checked: true,
        value: '21',
        addEventListener: (type, listener) => { listeners[`radio:${type}`] = listener; }
    };
    const select = {
        value: '0',
        addEventListener: (type, listener) => { listeners[`select:${type}`] = listener; },
        closest: () => ({ querySelector: () => radio })
    };
    const value1 = {
        value: '100',
        dataset: { field: 'value1' },
        addEventListener: () => {},
        closest: () => ({ querySelector: () => radio })
    };
    const container = {
        querySelectorAll: selector => selector === 'input[type="radio"]' ? [radio]
            : selector === 'select.effect-sel' ? [select]
                : selector === 'input.effect-val' ? [value1] : [],
        querySelector: selector => selector.startsWith('select.effect-sel') ? select
            : selector.includes('value1') ? value1 : null
    };

    editor.setupEffectRadioInputs(container, effect);
    listeners['radio:click']();
    assert.equal(effect.code, null);
    radio.checked = true;
    listeners['radio:click']();
    assert.equal(effect.code, 21);
    assert.equal(effect.dataId, 0);
    listeners['select:change']();
    assert.equal(effect.dataId, 0);
});

test('only Add State describes dataId zero as Normal Attack', () => {
    assert.equal(
        DatabaseEffectEditor.getEffectValue({ code: 21, dataId: 0, value1: 1, value2: 0 }),
        'Normal Attack (100%)'
    );
    assert.equal(
        DatabaseEffectEditor.getEffectValue({ code: 22, dataId: 0, value1: 1, value2: 0 }),
        'State #0 (100%)'
    );
});
