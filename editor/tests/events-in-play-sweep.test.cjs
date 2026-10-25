/**
 * Events authored by hand in the event editor, then played: what the
 * editor's own controls did wrong along the way.
 *
 * - Ctrl+C on a selected command copied the map's selected event instead,
 *   so the next Ctrl+V pasted nothing (the map handler took the key first).
 * - The command list's right-click menu opened below the window for a row
 *   near the bottom, leaving Paste and Delete out of reach.
 * - A new Set Movement Route command started with Repeat on and Wait off:
 *   a two-step player route walked forever.
 * - Control Timer's "(m:ss)" beside the seconds kept the old time while typing.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, 'src', file), 'utf8');

function shortcutHandler({ eventEditorShown }) {
    let keydown = null;
    const editor = { id: 'event-editor-modal', style: { display: eventEditorShown ? 'flex' : 'none' }, getClientRects: () => (eventEditorShown ? [{}] : []) };
    const document = {
        activeElement: { tagName: 'DIV' },
        getElementById: id => (id === 'event-editor-modal' ? editor : null),
        querySelector: () => null,
        querySelectorAll: () => [editor],
        addEventListener() {}, removeEventListener() {}
    };
    const window = { addEventListener(type, handler) { if (type === 'keydown') keydown = handler; } };
    const UIManager = vm.runInNewContext(`${read('UIManager.js')}\nUIManager;`, { console, document, window });
    const calls = [];
    const eventManager = { eventMode: true, selectedEvent: { id: 6 }, copyEvent: event => calls.push(['copy', event.id]) };
    new UIManager({ getEventManager: () => eventManager, getMapEditor: () => null, getBuildHistory: () => null }).setupKeyboardShortcuts();
    const press = key => {
        const event = { key, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, target: document.activeElement,
            preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
        keydown(event);
        return event;
    };
    return { press, calls };
}

test('Ctrl+C with the event editor open is left to its command list', () => {
    const open = shortcutHandler({ eventEditorShown: true });
    const event = open.press('c');
    assert.deepEqual(open.calls, [], 'the map event is not copied');
    assert.notEqual(event.defaultPrevented, true, 'the command list still sees the key');

    const closed = shortcutHandler({ eventEditorShown: false });
    closed.press('c');
    assert.deepEqual(closed.calls, [['copy', 6]], 'on the map, Ctrl+C still copies the selected event');
});

test('the command menu stays inside the window', () => {
    const source = read('event/EventCommandList.js');
    const window = { innerWidth: 1600, innerHeight: 1000 };
    const EventCommandList = vm.runInNewContext(`${source}\nEventCommandList;`, { console, window, document: {} });
    const menu = { offsetWidth: 180, offsetHeight: 290, style: {} };
    EventCommandList.keepMenuOnScreen(menu, 800, 891);
    assert.equal(menu.style.top, '706px', 'opened at the bottom row, the menu rises to fit');
    assert.equal(menu.style.left, '800px');
    EventCommandList.keepMenuOnScreen(menu, 1550, 200);
    assert.equal(menu.style.left, '1416px');
    assert.equal(menu.style.top, '200px');
    assert.match(source, /document\.body\.appendChild\(menu\);\s*EventCommandList\.keepMenuOnScreen\(menu, x, y\);/);
});

test('a new Set Movement Route runs once and waits; an autonomous route still repeats', () => {
    const SetMovementRouteEditor = vm.runInNewContext(`${read('event/commands/SetMovementRouteEditor.js')}\nSetMovementRouteEditor;`, { console, window: {}, document: {} });
    const editor = new SetMovementRouteEditor(null, null);
    editor._openWithRoute = () => {};
    editor.show(null, () => {});
    assert.equal(editor.moveRoute.repeat, false);
    assert.equal(editor.moveRoute.skippable, false);
    assert.equal(editor.moveRoute.wait, true);
    editor.show({ code: 205, parameters: [-1, null] }, () => {});
    assert.equal(editor.moveRoute.repeat, false);
    assert.equal(editor.moveRoute.wait, true);
    editor.showRoute(null, () => {});
    assert.equal(editor.moveRoute.repeat, true, 'a page\'s own route keeps repeating');
    assert.equal(editor.moveRoute.wait, false);
});

function fakeDocument() {
    const make = tag => {
        const el = {
            tagName: tag.toUpperCase(), children: [], style: {}, className: '', listeners: {}, textContent: '',
            appendChild(child) { this.children.push(child); return child; },
            addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
            set innerHTML(value) { this.children = []; },
            get innerHTML() { return ''; },
            querySelector(selector) {
                const cls = selector.replace(/^\./, '');
                const walk = node => {
                    for (const child of node.children) {
                        if (String(child.className).split(/\s+/).includes(cls)) return child;
                        const found = walk(child);
                        if (found) return found;
                    }
                    return null;
                };
                return walk(this) || make('div');
            },
            all() { return [this, ...this.children.flatMap(child => child.all())]; }
        };
        return el;
    };
    const body = make('body');
    return { createElement: make, body };
}

test('Control Timer\'s minutes follow the seconds while typing', () => {
    const document = fakeDocument();
    const ControlTimerEditor = vm.runInNewContext(`${read('event/commands/ControlTimerEditor.js')}\nControlTimerEditor;`, { console, window: {}, document });
    assert.equal(ControlTimerEditor.durationLabel(90), '(1:30)');
    assert.equal(ControlTimerEditor.durationLabel(60), '(1:00)');
    assert.equal(ControlTimerEditor.durationLabel(5), '(0:05)');
    const editor = new ControlTimerEditor(null, null);
    editor.show(null, () => {});
    const nodes = editor.modal.all();
    const input = nodes.find(node => node.tagName === 'INPUT' && node.type === 'number');
    const preview = nodes.find(node => /^\(\d+:\d\d\)$/.test(node.textContent));
    assert.ok(input && preview);
    assert.equal(preview.textContent, '(1:00)');
    input.value = '90';
    for (const fn of input.listeners.input) fn({ target: input });
    assert.equal(editor.seconds, 90);
    assert.equal(preview.textContent, '(1:30)');
});
