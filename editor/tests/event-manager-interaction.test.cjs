const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function loadEventManager(overrides = {}) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'EventManager.js'), 'utf8');
    return vm.runInNewContext(`${source}\nEventManager;`, {
        console: { log() {}, debug() {}, warn() {}, error() {} },
        ...overrides
    });
}

test('Event mode double-click creates only on an empty in-bounds map tile', () => {
    let now = 1000;
    const EventManager = loadEventManager({
        Date: { now: () => now }
    });
    const manager = Object.create(EventManager.prototype);
    manager.eventMode = true;
    manager.currentMap = { width: 10, height: 8, events: [null] };
    manager.tilemapManager = { TILE_WIDTH: 48, TILE_HEIGHT: 48, container: {} };
    manager.tilesetPaletteViewer = null;
    manager.eventSprites = new Map();
    manager.undoStack = [];
    manager.redoStack = [];
    manager.maxUndoSteps = 50;
    manager.selectedEvent = null;
    manager._lastMapClickTime = 0;
    manager._lastMapClickX = null;
    manager._lastMapClickY = null;
    manager.notifyUndoStateChange = () => {};
    manager.updateSelectionHighlight = () => {};
    manager.updateEventListSelection = () => {};
    manager.renderEvents = () => {};
    manager.startDragging = () => {};
    const edited = [];
    manager.editEvent = (event, session = {}) => edited.push({ event, session });

    const pointerAt = (x, y, overrides = {}) => ({
        data: {
            button: 0,
            originalEvent: { shiftKey: false },
            getLocalPosition: () => ({ x: x * 48 + 12, y: y * 48 + 12 }),
            ...overrides
        }
    });

    manager.handleMapPointerDown(pointerAt(3, 4));
    assert.equal(manager.getEventAt(3, 4), undefined, 'the first click only selects the tile');
    assert.deepEqual([manager.selectedTileX, manager.selectedTileY], [3, 4],
        'empty ground stays outlined as the target of the second click');
    now += 120;
    manager.handleMapPointerDown(pointerAt(3, 4));

    const created = edited[0].event;
    assert.ok(created);
    assert.equal(created.name, 'EV001');
    assert.equal(created.pages[0].trigger, 0);
    assert.equal(edited.length, 1);
    assert.equal(edited[0].session.isNew, true);
    assert.equal(manager.getEventAt(3, 4), undefined, 'new events stay detached until the editor commits');
    assert.equal(manager.undoStack.length, 0);

    manager.currentMap.events[created.id] = created;

    assert.equal(manager.createNewEvent(3, 4), null, 'an occupied tile cannot gain a duplicate event');
    assert.equal(manager.createNewEvent(-1, 4), null, 'an out-of-bounds tile cannot gain an event');
    assert.equal(manager.undoStack.length, 0, 'rejected creation does not add undo history');

    now += 500;
    manager.handleMapPointerDown(pointerAt(3, 4));
    now += 100;
    manager.handleMapPointerDown(pointerAt(3, 4));
    assert.equal(edited.length, 2, 'double-clicking an occupied tile edits the existing event');
    assert.equal(manager.currentMap.events.filter(Boolean).length, 1);
    assert.equal(edited[1].event, created);
    assert.equal(edited[1].session.isNew, undefined);
});

test('Event mode outlines the hovered map cell without covering the selected one', () => {
    const EventManager = loadEventManager();
    const manager = Object.create(EventManager.prototype);
    const draws = [];
    manager.eventMode = true;
    manager.currentMap = {
        width: 6,
        height: 5,
        events: [null, { id: 1, x: 4, y: 2 }]
    };
    manager.tilemapManager = { TILE_WIDTH: 48, TILE_HEIGHT: 48, container: {} };
    manager.selectedTileX = 1;
    manager.selectedTileY = 1;
    manager.hoverHighlight = {
        visible: false,
        clear() { draws.length = 0; },
        rect(...args) { draws.push({ rect: args }); },
        stroke(style) { draws.push({ stroke: style }); }
    };
    const pointerAt = (x, y) => ({
        data: { getLocalPosition: () => ({ x: x * 48 + 12, y: y * 48 + 12 }) }
    });

    manager.updateHoverHighlight(pointerAt(3, 2));
    assert.equal(manager.hoverHighlight.visible, true);
    assert.deepEqual(draws[0].rect, [144, 96, 48, 48]);
    assert.equal(draws[1].stroke.color, 0xFFD700, 'empty ground gets the event selector color');

    manager.updateHoverHighlight(pointerAt(4, 2));
    assert.equal(draws[1].stroke.color, 0xFFD700, 'existing events use the same event selector color');

    manager.updateHoverHighlight(pointerAt(1, 1));
    assert.equal(manager.hoverHighlight.visible, false,
        'the persistent selected-cell outline is not doubled by the hover outline');

    manager.updateHoverHighlight(pointerAt(7, 2));
    assert.equal(manager.hoverHighlight.visible, false, 'nothing is drawn beyond the map');
});

test('copied events follow the outlined cell moved by arrow keys', async () => {
    const EventManager = loadEventManager();
    const manager = Object.create(EventManager.prototype);
    const source = { id: 1, name: 'Source', x: 2, y: 2, pages: [] };
    manager.eventMode = true;
    manager.currentMap = { width: 5, height: 4, events: [null, source] };
    manager.selectedEvent = source;
    manager.selectedTileX = source.x;
    manager.selectedTileY = source.y;
    manager.clipboard = null;
    manager.hoverHighlight = { visible: true };
    manager.eventSprites = new Map();
    manager.undoStack = [];
    manager.redoStack = [];
    manager.maxUndoSteps = 50;
    manager.notifyEventSelected = () => {};
    manager.notifyUndoStateChange = () => {};
    manager.updateSelectionHighlight = () => {};
    manager.updateEventSpriteBorder = () => {};
    manager.updateEventListSelection = () => {};
    manager.renderEvents = () => {};

    manager.copyEvent(source);
    assert.equal(manager.moveEventSelection(1, 0), true);
    assert.deepEqual([manager.selectedTileX, manager.selectedTileY], [3, 2]);
    assert.equal(manager.selectedEvent, null, 'empty ground is a paste target, not an event selection');
    assert.equal(manager.hoverHighlight.visible, false, 'the persistent outline replaces the hover');

    await manager.pasteEvent();
    const pasted = manager.currentMap.events.filter(Boolean).find(event => event.id !== source.id);
    assert.ok(pasted);
    assert.deepEqual([pasted.x, pasted.y], [3, 2]);
    assert.equal(manager.selectedEvent, pasted, 'the next arrow starts from the pasted event');

    manager.moveEventSelection(9, 9);
    assert.deepEqual([manager.selectedTileX, manager.selectedTileY], [4, 3],
        'keyboard movement remains inside the map');

    manager._lastMapClickTime = 100;
    manager._lastMapClickX = 4;
    manager._lastMapClickY = 3;
    manager.moveEventSelection(-1, 0);
    assert.equal(manager._lastMapClickTime, 0, 'keyboard movement cancels a pending double-click');

    manager.selectionHighlight = { visible: true };
    manager.setCurrentMap({ width: 2, height: 2, events: [] });
    assert.deepEqual([manager.selectedTileX, manager.selectedTileY], [null, null],
        'a new map cannot inherit the previous map paste target');
    assert.equal(manager.selectionHighlight.visible, false);
    assert.equal(manager.hoverHighlight.visible, false);
});

test('event sidebar includes compacted and sparse high-ID map events', () => {
    class FakeElement {
        constructor() {
            this.children = [];
            this.style = {};
            this.dataset = {};
            this.scrollTop = 0;
            this.className = '';
            this.textContent = '';
            this.listeners = new Map();
            this._innerHTML = '';
        }
        set innerHTML(value) {
            this._innerHTML = value;
            this.children = [];
        }
        get innerHTML() { return this._innerHTML; }
        appendChild(child) { this.children.push(child); return child; }
        addEventListener(type, handler) { this.listeners.set(type, handler); }
        querySelector() { return null; }
    }

    const elements = {
        'events-list': new FakeElement(),
        'events-section': new FakeElement(),
        sidebar: new FakeElement()
    };
    const document = {
        getElementById: id => elements[id] || null,
        createElement: () => new FakeElement()
    };
    const EventManager = loadEventManager({ document });
    const manager = Object.create(EventManager.prototype);
    manager.selectedEvent = null;
    manager.sidebarResizer = null;

    manager.currentMap = { events: [{ id: 500, name: 'Compacted Event', x: 1, y: 2 }] };
    manager.updateEventsList();
    assert.equal(elements['events-list'].children.length, 1);
    assert.equal(elements['events-list'].children[0].dataset.eventId, 500);
    assert.match(elements['events-list'].children[0].textContent, /Compacted Event/);

    const sparseEvents = [];
    sparseEvents[5000] = { id: 5000, name: 'High ID Event', x: 3, y: 4 };
    manager.currentMap = { events: sparseEvents };
    manager.updateEventsList();
    assert.equal(elements['events-list'].children.length, 1);
    assert.equal(elements['events-list'].children[0].dataset.eventId, 5000);
});

test('compacted imported events retain safe ID allocation and deletion', () => {
    const EventManager = loadEventManager();
    const manager = Object.create(EventManager.prototype);
    const importedEvent = { id: 500, name: 'Imported Event' };
    manager.currentMap = { events: [importedEvent] };

    assert.equal(manager.getNextEventId(), 1);

    manager.saveState = () => {};
    manager.renderEvents = () => {};
    manager.selectedEvent = importedEvent;
    manager.deleteEvent(importedEvent);

    assert.equal(manager.currentMap.events[0], null);
    assert.equal(manager.currentMap.events.length, 1, 'deletion does not expand the array to the event database ID');
    assert.equal(manager.selectedEvent, null);
});

test('a broken event sprite cannot suppress the complete event sidebar', () => {
    const listed = [];
    const EventManager = loadEventManager();
    const manager = Object.create(EventManager.prototype);
    manager.currentMap = { events: [
        { id: 1, name: 'Broken Graphic' },
        { id: 2, name: 'Valid Graphic' }
    ] };
    manager.eventContainer = {
        removeChildren: () => [],
        addChild: sprite => listed.push(sprite)
    };
    manager.eventSprites = new Map();
    manager.updateEventsList = () => listed.push('sidebar');
    manager.updateSelectionHighlight = () => {};
    manager.createEventSprite = event => {
        if (event.id === 1) throw new Error('bad graphic');
        return { eventId: event.id };
    };

    manager.renderEvents();

    assert.equal(listed[0], 'sidebar', 'the list updates before any sprite can fail');
    assert.deepEqual(listed[1], { eventId: 2 });
    assert.equal(manager.eventSprites.has(2), true);
});

test('leaving event mode preserves unrelated map and panning handlers', () => {
    const listeners = new Map();
    const container = {
        on(name, handler) {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(handler);
        },
        off(name, handler) { listeners.get(name)?.delete(handler); }
    };
    const mapPaintHandler = () => {};
    const panHandler = () => {};
    container.on('pointerdown', mapPaintHandler);
    container.on('pointerdown', panHandler);

    const canvas = { addEventListener() {}, removeEventListener() {} };
    const document = { querySelector: () => canvas };
    const EventManager = loadEventManager({ document });
    const manager = Object.create(EventManager.prototype);
    manager.tilemapManager = { container };
    manager.resetMapClickTracking = () => {};
    manager.selectionHighlight = null;
    manager.setupEventInteraction();
    assert.equal(listeners.get('pointerdown').size, 3);

    manager.removeEventInteraction();

    assert.equal(listeners.get('pointerdown').size, 2);
    assert.equal(listeners.get('pointerdown').has(mapPaintHandler), true);
    assert.equal(listeners.get('pointerdown').has(panHandler), true);
});

test('an event clone carries its 3D model sidecar entry through every operation', async () => {
    const EventManager = loadEventManager();
    const manager = Object.create(EventManager.prototype);
    const model = { '0': { name: 'Tank', file: '', ext: '.glb', size: 9, scale: 1, yaw: 0, pitch: 0, roll: 0 } };
    manager.currentMap = {
        width: 10, height: 8,
        events: [null, { id: 1, name: 'EV001', x: 2, y: 2, pages: [{}] }],
        reactor3d: { version: 1, mode: '3d', events: { '1': JSON.parse(JSON.stringify(model)) } }
    };
    manager.undoStack = [];
    manager.redoStack = [];
    manager.maxUndoSteps = 50;
    manager.selectedEvent = null;
    manager.notifyUndoStateChange = () => {};
    manager.renderEvents = () => {};
    manager.selectEvent = () => {};

    // Copy carries the entry; paste re-keys it under the clone's id.
    manager.copyEvent(manager.currentMap.events[1]);
    const sameAsModel = value => assert.equal(JSON.stringify(value), JSON.stringify(model));
    sameAsModel(manager.clipboardModels);
    await manager.pasteEvent(5, 5);
    const clone = manager.currentMap.events.find(e => e && e.x === 5 && e.y === 5);
    assert.ok(clone, 'the clone exists');
    sameAsModel(manager.currentMap.reactor3d.events[String(clone.id)]);
    sameAsModel(manager.currentMap.reactor3d.events['1']);

    // Deleting an event purges its entry — ids are reused, and a stale
    // entry would hand this model to a future unrelated event.
    manager.deleteEvent(clone);
    assert.equal(manager.currentMap.reactor3d.events[String(clone.id)], undefined);

    // Undo restores the event AND its model entry together.
    manager.undo();
    assert.ok(manager.currentMap.events.find(e => e && e.id === clone.id), 'undo restores the clone');
    sameAsModel(manager.currentMap.reactor3d.events[String(clone.id)]);
    manager.redo();
    assert.equal(manager.currentMap.reactor3d.events[String(clone.id)], undefined,
        'redo removes the model entry again');

    // Cut = copy + delete: the entry travels and the source is purged.
    manager.cutEvent(manager.currentMap.events[1]);
    sameAsModel(manager.clipboardModels);
    assert.equal(manager.currentMap.reactor3d.events, undefined, 'last entry removed cleans the container');
    await manager.pasteEvent(7, 7);
    const moved = manager.currentMap.events.find(e => e && e.x === 7 && e.y === 7);
    sameAsModel(manager.currentMap.reactor3d.events[String(moved.id)]);

    // A model-less event pastes without inventing sidecar scaffolding.
    delete manager.currentMap.reactor3d;
    manager.clipboard = { id: 9, name: 'EV009', x: 1, y: 1, pages: [{}] };
    manager.clipboardModels = null;
    await manager.pasteEvent(1, 1);
    assert.equal(manager.currentMap.reactor3d, undefined, 'no sidecar appears from nowhere');
});
