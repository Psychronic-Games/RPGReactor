const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function loadUIManager() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'UIManager.js'), 'utf8');
    let keydownHandler = null;
    let reloads = 0;
    let fullscreenToggles = 0;
    const documentListeners = new Map();
    class FakeElement {
        constructor(tagName) {
            this.tagName = tagName.toUpperCase();
            this.children = [];
            this.listeners = new Map();
            this.style = {};
            this.parentNode = null;
            this.textContent = '';
        }
        append(...children) { children.forEach(child => this.appendChild(child)); }
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
        setAttribute(name, value) { this[name] = String(value); }
        addEventListener(type, handler) { this.listeners.set(type, handler); }
        dispatch(type, event = {}) { this.listeners.get(type)?.({ target: this, ...event }); }
        focus() { document.activeElement = this; }
        remove() {
            if (!this.parentNode) return;
            this.parentNode.children = this.parentNode.children.filter(child => child !== this);
            this.parentNode = null;
        }
    }
    const findById = (element, id) => {
        if (element.id === id) return element;
        for (const child of element.children) {
            const match = findById(child, id);
            if (match) return match;
        }
        return null;
    };
    const body = new FakeElement('body');
    const document = {
        body,
        activeElement: null,
        createElement: tagName => new FakeElement(tagName),
        getElementById: id => findById(body, id),
        addEventListener(type, handler) { documentListeners.set(type, handler); },
        removeEventListener(type, handler) {
            if (documentListeners.get(type) === handler) documentListeners.delete(type);
        },
    };
    const context = {
        console,
        document,
        window: {
            location: { reload: () => { reloads++; } },
            addEventListener(type, handler) {
                if (type === 'keydown') keydownHandler = handler;
            }
        },
        nw: {
            Window: { get: () => ({
                reloadIgnoringCache: () => { reloads++; },
                toggleFullscreen: () => { fullscreenToggles++; },
            }) }
        }
    };
    const UIManager = vm.runInNewContext(`${source}\nUIManager;`, context);
    return {
        UIManager,
        getKeydownHandler: () => keydownHandler,
        getReloads: () => reloads,
        getFullscreenToggles: () => fullscreenToggles,
        getElementById: id => document.getElementById(id),
        dispatchDocumentKey: key => documentListeners.get('keydown')?.({ key, preventDefault() {} }),
    };
}

test('application shortcuts dispatch New, Open, Save, and Playtest', () => {
    const { UIManager, getKeydownHandler } = loadUIManager();
    const calls = [];
    const manager = new UIManager({
        newProject: () => calls.push('new'),
        openProject: () => calls.push('open'),
        saveProject: () => calls.push('save'),
        playtest: () => calls.push('playtest')
    });
    manager.setupKeyboardShortcuts();
    const handler = getKeydownHandler();

    for (const [key, expected] of [['n', 'new'], ['o', 'open'], ['s', 'save'], ['r', 'playtest']]) {
        let prevented = false;
        let stopped = false;
        handler({
            key,
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            repeat: false,
            preventDefault: () => { prevented = true; },
            stopPropagation: () => { stopped = true; }
        });
        assert.equal(calls.at(-1), expected);
        assert.equal(prevented, true, `Ctrl+${key.toUpperCase()} prevents Chromium behavior`);
        assert.equal(stopped, true, `Ctrl+${key.toUpperCase()} stops lower-level handlers`);
    }
    assert.deepEqual(calls, ['new', 'open', 'save', 'playtest']);
});

test('File menu exposes all application commands and shortcut indicators', () => {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    const fileMenu = html.match(/<div class="html-submenu" id="submenu-file"[\s\S]*?<\/div>\s*<\/div>\s*<div class="html-menu-item" data-menu="database"/);
    assert.ok(fileMenu, 'File submenu is present');
    for (const [action, shortcut] of [
        ['new-project', 'Ctrl+N'],
        ['open-project', 'Ctrl+O'],
        ['save-project', 'Ctrl+S'],
        ['playtest', 'Ctrl+R']
    ]) {
        assert.match(fileMenu[0], new RegExp(`data-action="${action}"[\\s\\S]*?${shortcut.replace('+', '\\+')}`));
    }
});

test('F5 confirms before performing an uncached application reload', async () => {
    const harness = loadUIManager();
    const manager = new harness.UIManager({});
    manager.setupKeyboardShortcuts();
    const handler = harness.getKeydownHandler();
    const event = (overrides = {}) => ({
        key: 'F5', keyCode: 116,
        ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
        repeat: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
        ...overrides,
    });

    const cancelled = event();
    handler(cancelled);
    assert.equal(cancelled.prevented, true);
    assert.equal(cancelled.stopped, true);
    const overlay = harness.getElementById('rr-reload-confirm');
    assert.equal(overlay.className, 'rr-modal-overlay');
    assert.equal(overlay.children[0].className, 'rr-modal');
    assert.equal(harness.getElementById('rr-reload-cancel').className, 'rr-btn-secondary');
    assert.equal(harness.getElementById('rr-reload-accept').className, 'rr-button-primary');
    assert.equal(harness.getElementById('rr-reload-cancel').tagName, 'BUTTON');
    assert.equal(harness.getReloads(), 0);

    handler(event());
    assert.equal(harness.getElementById('rr-reload-confirm'), overlay, 'repeated F5 does not stack modals');
    harness.getElementById('rr-reload-cancel').dispatch('click');
    assert.equal(harness.getElementById('rr-reload-confirm'), null);
    assert.equal(harness.getReloads(), 0, 'cancelling leaves the editor running');

    handler(event());
    harness.getElementById('rr-reload-accept').dispatch('click');
    assert.equal(harness.getReloads(), 1, 'confirmation performs one uncached reload');

    handler(event());
    harness.dispatchDocumentKey('Escape');
    assert.equal(harness.getElementById('rr-reload-confirm'), null, 'Escape cancels the modal');

    handler(event({ repeat: true }));
    handler(event({ shiftKey: true }));
    assert.equal(harness.getReloads(), 1, 'held or modified F5 does not trigger another reload');

    const discardDecision = manager.promptUnsavedChanges('the project');
    assert.equal(manager.promptUnsavedChanges('the project'), discardDecision,
        'repeated close requests share one unsaved-changes prompt');
    assert.equal(harness.getElementById('rr-unsaved-confirm').className, 'rr-modal-overlay');
    assert.equal(harness.getElementById('rr-unsaved-cancel').className, 'rr-btn-secondary');
    assert.equal(harness.getElementById('rr-unsaved-discard').className, 'rr-button-danger');
    assert.equal(harness.getElementById('rr-unsaved-save').className, 'rr-button-primary');
    harness.getElementById('rr-unsaved-discard').dispatch('click');
    assert.equal(await discardDecision, 'discard');
    assert.equal(harness.getElementById('rr-unsaved-confirm'), null);

    const cancelDecision = manager.promptUnsavedChanges('the project');
    harness.dispatchDocumentKey('Escape');
    assert.equal(await cancelDecision, 'cancel');

    const saveDecision = manager.promptUnsavedChanges('the project');
    harness.getElementById('rr-unsaved-save').dispatch('click');
    assert.equal(await saveDecision, 'save');
});

test('F11 toggles native fullscreen without repeating while held', () => {
    const harness = loadUIManager();
    const manager = new harness.UIManager({});
    manager.setupKeyboardShortcuts();
    const handler = harness.getKeydownHandler();
    const event = (overrides = {}) => ({
        key: 'F11', keyCode: 122,
        ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
        repeat: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
        ...overrides,
    });

    const first = event();
    handler(first);
    assert.equal(first.prevented, true);
    assert.equal(first.stopped, true);
    assert.equal(harness.getFullscreenToggles(), 1);

    handler(event({ repeat: true }));
    handler(event({ ctrlKey: true }));
    assert.equal(harness.getFullscreenToggles(), 1, 'held or modified F11 is ignored');

    handler(event());
    assert.equal(harness.getFullscreenToggles(), 2, 'a later F11 exits fullscreen');
});
