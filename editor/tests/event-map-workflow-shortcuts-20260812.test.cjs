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

function loadShortcutHandler(eventManager, options = {}) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'UIManager.js'), 'utf8');
    let keydownHandler;
    const document = {
        activeElement: options.activeElement || null,
        getElementById: options.getElementById || (() => null),
        querySelector: options.querySelector || (() => null),
    };
    const window = {
        reactor: options.reactor,
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

test('Delete and Backspace target the active object tool and repeated keys never delete its map', () => {
    for (const tool of ['modelPropsManager', 'lightingManager']) {
        for (const key of ['Delete', 'Backspace']) {
            let removed = 0, mapsDeleted = 0;
            const manager = { active: true, selectedId: 7,
                remove(id) { assert.equal(id, 7); removed++; this.selectedId = null; },
                removeSelected() { this.remove(this.selectedId); } };
            const handler = loadShortcutHandler({ eventMode: false }, {
                reactor: { [tool]: manager, projectController: { deleteMap: () => { mapsDeleted++; } } },
                activeElement: { tagName: 'DIV', closest: () => ({}) },
                querySelector: () => ({ getAttribute: () => '1' })
            });
            const event = keyEvent(key);
            handler(event);
            handler(keyEvent(key, { repeat: true }));
            assert.equal(removed, 1);
            assert.equal(mapsDeleted, 0);
            assert.equal(event.prevented, true);
            assert.equal(event.stopped, true);
        }
    }
});

test('Delete removes the event picked in the events column in any mode, and the map only when the map tree has the focus', () => {
    const selectedMapRow = { getAttribute: () => '3' };
    const run = ({ eventMode, focusIn }) => {
        let eventsDeleted = 0, mapsDeleted = 0;
        const eventManager = { eventMode, selectedEvent: { id: 5 }, deleteEvent(event) { assert.equal(event.id, 5); eventsDeleted++; this.selectedEvent = null; } };
        const handler = loadShortcutHandler(eventManager, {
            reactor: { projectController: { deleteMap: () => { mapsDeleted++; } } },
            activeElement: { tagName: 'DIV', closest: selector => (focusIn && selector.includes(focusIn) ? {} : null) },
            querySelector: () => selectedMapRow
        });
        const event = keyEvent('Delete');
        handler(event);
        return { eventsDeleted, mapsDeleted, prevented: event.prevented };
    };
    // Picked in the events column while painting tiles: the event goes, not the map.
    assert.deepEqual(run({ eventMode: false, focusIn: '#events-list' }), { eventsDeleted: 1, mapsDeleted: 0, prevented: true });
    // Picked and then the focus went to the map canvas: still the event.
    assert.deepEqual(run({ eventMode: false, focusIn: null }), { eventsDeleted: 1, mapsDeleted: 0, prevented: true });
    // In event mode as before.
    assert.deepEqual(run({ eventMode: true, focusIn: null }), { eventsDeleted: 1, mapsDeleted: 0, prevented: true });
    // The map tree itself focused: the map, as the tree's own Delete has always meant.
    assert.deepEqual(run({ eventMode: false, focusIn: '#maps-list' }), { eventsDeleted: 0, mapsDeleted: 1, prevented: true });
    // No event selected: the map.
    let mapsDeleted = 0;
    const handler = loadShortcutHandler({ eventMode: false, selectedEvent: null }, { reactor: { projectController: { deleteMap: () => { mapsDeleted++; } } }, activeElement: { tagName: 'DIV', closest: () => null }, querySelector: () => selectedMapRow });
    handler(keyEvent('Delete'));
    assert.equal(mapsDeleted, 1);
});

test('object delete shortcuts leave form fields and modal editors alone', () => {
    for (const tool of ['modelPropsManager', 'lightingManager']) {
        for (const activeElement of [{ tagName: 'INPUT' }, { tagName: 'SELECT' }, { isContentEditable: true }]) {
            let removed = 0;
            const handler = loadShortcutHandler({}, { activeElement,
                reactor: { [tool]: { active: true, selectedId: 1, remove() { removed++; }, removeSelected() { removed++; } } }
            });
            handler(keyEvent('Delete'));
            assert.equal(removed, 0);
        }
    }
});

test('modal Delete and Ctrl+X cannot remove a selected prop', () => {
    let removed = 0;
    const reactor = { modelPropsManager: { active: true, selectedId: 1, remove() { removed++; } } };
    const modalHandler = loadShortcutHandler({}, { reactor,
        getElementById: id => id === 'plugin-manager-modal' ? { style: { display: 'block' } } : null
    });
    modalHandler(keyEvent('Delete'));
    const handler = loadShortcutHandler({}, { reactor });
    handler(keyEvent('x', { ctrlKey: true }));
    assert.equal(removed, 0);
});
