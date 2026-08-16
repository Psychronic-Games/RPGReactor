const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function loadEventManager(overrides = {}) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'EventManager.js'), 'utf8');
    return vm.runInNewContext(`${source}\nEventManager;`, {
        console: { log() {}, warn() {}, error() {} },
        ...overrides,
    });
}

function loadShortcutHandler(eventManager) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'UIManager.js'), 'utf8');
    let keydownHandler;
    const document = {
        activeElement: null,
        getElementById: () => null,
        querySelector: () => null,
    };
    const window = {
        addEventListener(type, handler) {
            if (type === 'keydown') keydownHandler = handler;
        }
    };
    const UIManager = vm.runInNewContext(`${source}\nUIManager;`, {
        console, document, window,
    });
    new UIManager({ getEventManager: () => eventManager }).setupKeyboardShortcuts();
    return keydownHandler;
}

function keyEvent(key, overrides = {}) {
    return {
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        repeat: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
        ...overrides,
    };
}

test('Event shortcuts accept Meta and Enter activates the outlined event target', () => {
    const calls = [];
    const selectedEvent = { id: 1, x: 4, y: 5 };
    const eventManager = {
        eventMode: true,
        selectedEvent,
        selectedTileX: 4,
        selectedTileY: 5,
        copyEvent: event => calls.push(['copy', event]),
        cutEvent: event => calls.push(['cut', event]),
        pasteEvent: (x, y) => calls.push(['paste', x, y]),
        showFindDialog: () => calls.push(['find']),
        activateEventSelection: () => { calls.push(['activate']); return true; },
    };
    const handler = loadShortcutHandler(eventManager);

    for (const key of ['c', 'x', 'v', 'f']) {
        const event = keyEvent(key, { metaKey: true });
        handler(event);
        assert.equal(event.prevented, true, `Meta+${key.toUpperCase()} is handled`);
    }
    const enter = keyEvent('Enter');
    handler(enter);

    assert.deepEqual(calls, [
        ['copy', selectedEvent],
        ['cut', selectedEvent],
        ['paste', 4, 5],
        ['find'],
        ['activate'],
    ]);
    assert.equal(enter.prevented, true);
    assert.equal(enter.stopped, true);
});

test('Event undo and redo accept Meta without claiming shifted clipboard shortcuts', () => {
    const calls = [];
    const eventManager = {
        eventMode: true,
        selectedEvent: { id: 1 },
        canUndo: () => true,
        canRedo: () => true,
        undo: () => calls.push('undo'),
        redo: () => calls.push('redo'),
        copyEvent: () => calls.push('copy'),
    };
    const handler = loadShortcutHandler(eventManager);

    handler(keyEvent('z', { metaKey: true }));
    handler(keyEvent('z', { metaKey: true, shiftKey: true }));
    handler(keyEvent('C', { metaKey: true, shiftKey: true }));

    assert.deepEqual(calls, ['undo', 'redo']);
});

test('Event selection activation edits occupied targets and creates at empty targets', () => {
    const EventManager = loadEventManager();
    const manager = Object.create(EventManager.prototype);
    const existing = { id: 1, x: 2, y: 3 };
    manager.eventMode = true;
    manager.currentMap = { width: 8, height: 6, events: [null, existing] };
    manager.selectedTileX = 2;
    manager.selectedTileY = 3;
    const calls = [];
    manager.editEvent = event => calls.push(['edit', event]);
    manager.createNewEvent = (x, y) => calls.push(['new', x, y]);

    assert.equal(manager.activateEventSelection(), true);
    manager.selectedTileX = 5;
    manager.selectedTileY = 4;
    assert.equal(manager.activateEventSelection(), true);

    assert.deepEqual(calls, [['edit', existing], ['new', 5, 4]]);
});

test('Map double-click accepts browser click counts and a less strict centralized interval', () => {
    const EventManager = loadEventManager();
    const manager = Object.create(EventManager.prototype);
    manager._lastMapClickTime = 1000;
    manager._lastMapClickX = 3;
    manager._lastMapClickY = 4;

    assert.equal(manager.isMapDoubleClick(3, 4, { detail: 2 }, 1800), true,
        'the browser click count wins even when timing is delayed');
    assert.equal(manager.isMapDoubleClick(3, 4, { detail: 1 }, 1490), true,
        'the fallback allows a 500 ms double-click interval');
    assert.equal(manager.isMapDoubleClick(3, 4, { detail: 1 }, 1510), false);
    assert.equal(manager.isMapDoubleClick(4, 4, { detail: 2 }, 1100), false,
        'clicks still have to target the same map tile');
});

test('Event context menu exposes action shortcut labels', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'EventManager.js'), 'utf8');
    for (const shortcut of [
        "shortcut: 'Enter'",
        'shortcut: `${shortcutPrefix}+X`',
        'shortcut: `${shortcutPrefix}+C`',
        'shortcut: `${shortcutPrefix}+V`',
        "shortcut: 'Delete'",
        'shortcut: `${shortcutPrefix}+F`',
    ]) assert.match(source, new RegExp(shortcut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(source, /shortcut\.textContent = item\.shortcut;/);
});
