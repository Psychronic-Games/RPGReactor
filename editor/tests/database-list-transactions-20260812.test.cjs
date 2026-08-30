const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const databaseDir = path.resolve(__dirname, '..', 'src', 'database');

function loadClass(fileName, className, globals = {}) {
    const source = fs.readFileSync(path.join(databaseDir, fileName), 'utf8');
    return vm.runInNewContext(`${source}\n${className};`, {
        console: { log() {}, warn() {}, error() {} },
        window: { I18n: null },
        ...globals
    });
}

test('class learning Add opens a draft and Delete commits through the database manager', () => {
    const ClassEditor = loadClass('DatabaseClassEditor.js', 'DatabaseClassEditor');
    const editor = Object.create(ClassEditor.prototype);
    const classEntry = { id: 3, learnings: [{ level: 4, skillId: 2, note: 'Starter' }] };
    let modalArgs = null;
    let updated = null;
    let refreshed = null;
    editor.showLearningEditorModal = (...args) => { modalArgs = args; };
    editor.databaseManager = { updateClass: (id, entry) => { updated = [id, entry]; } };
    editor.refreshClassDetail = entry => { refreshed = entry; };

    editor.addLearning(classEntry);
    assert.equal(classEntry.learnings.length, 1, 'opening Add does not insert a row');
    assert.equal(modalArgs[0], classEntry);
    assert.equal(modalArgs[1], -1);

    editor.deleteLearning(classEntry, 0);
    assert.equal(classEntry.learnings.length, 0);
    assert.equal(updated[0], 3);
    assert.equal(updated[1], classEntry);
    assert.equal(refreshed, classEntry);
});

test('enemy Add and modal Cancel leave action data and persistence untouched', () => {
    const created = [];
    const document = {
        body: { appendChild(element) { this.child = element; } },
        createElement(tagName) {
            const listeners = new Map();
            const element = {
                tagName,
                style: {},
                children: [],
                appendChild(child) { this.children.push(child); },
                addEventListener(type, listener) { listeners.set(type, listener); },
                dispatch(type, event = {}) { listeners.get(type)?.(event); },
                remove() { this.removed = true; },
                querySelector() { return null; },
                querySelectorAll() { return []; }
            };
            created.push(element);
            return element;
        }
    };
    const EnemyEditor = loadClass('DatabaseEnemyEditor.js', 'DatabaseEnemyEditor', { document });
    const editor = Object.create(EnemyEditor.prototype);
    const original = {
        skillId: 2,
        conditionType: 2,
        conditionParam1: 0.25,
        conditionParam2: 0.75,
        conditions: [
            { type: 2, param1: 0.25, param2: 0.75 },
            { type: 4, param1: 3, param2: 0 }
        ],
        rating: 5
    };
    const before = JSON.parse(JSON.stringify(original));
    const enemy = { id: 7, actions: [original] };
    let updates = 0;
    editor.databaseManager = {
        getSkills: () => [{ id: 2, name: 'Spark' }],
        getStates: () => [],
        getSystem: () => ({ switches: [] }),
        updateEnemy: () => { updates++; }
    };
    editor.escapeHTML = value => String(value);
    editor.refreshEnemyDetail = () => {};

    let addModal = null;
    editor.showActionEditorModal = (...args) => { addModal = args; };
    editor.addAction(enemy);
    assert.equal(enemy.actions.length, 1, 'Add opens an uncommitted draft');
    assert.equal(updates, 0);
    assert.equal(addModal[1], -1);
    assert.notEqual(addModal[2], original);

    editor.showActionEditorModal = EnemyEditor.prototype.showActionEditorModal;
    editor.showActionEditorModal(enemy, 0, original);
    const cancel = created.find(element => element.tagName === 'button' && element.textContent === 'Cancel');
    assert.ok(cancel, 'the action draft editor has a Cancel button');
    cancel.dispatch('click');
    assert.deepEqual(enemy.actions[0], before);
    assert.equal(enemy.actions[0], original, 'Cancel retains the original action object');
    assert.equal(updates, 0);
});

test('enemy HP and MP condition fractions display as percentages', () => {
    const EnemyEditor = loadClass('DatabaseEnemyEditor.js', 'DatabaseEnemyEditor');
    const editor = Object.create(EnemyEditor.prototype);
    editor.databaseManager = { getSkills: () => [{ id: 1, name: 'Attack' }] };
    editor.escapeHTML = value => String(value);

    assert.equal(editor.formatConditionPercent(0.3), 30);
    assert.equal(editor.formatConditionPercent(0.125), 12.5);
    const html = editor.buildActionsHTML({ actions: [
        { skillId: 1, conditionType: 2, conditionParam1: 0.25, conditionParam2: 0.8, rating: 5 },
        { skillId: 1, conditionType: 3, conditionParam1: 0.1, conditionParam2: 1, rating: 4 }
    ] });
    assert.match(html, /HP 25% ~ 80%/);
    assert.match(html, /MP 10% ~ 100%/);
});
