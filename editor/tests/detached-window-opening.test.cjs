'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/utils/DetachedWindow.js'), 'utf8');

function opening() {
    let now = 0, openCallback, options, resolveStyles;
    const timers = new Set(), calls = [], store = new Map();
    const styles = new Promise(resolve => { resolveStyles = resolve; });
    const classes = () => {
        const values = new Set();
        return { add: name => values.add(name), remove: name => values.delete(name), contains: name => values.has(name) };
    };
    const panel = { style: { cssText: '' }, querySelector: () => ({ textContent: 'Forge' }) };
    const overlay = { style: { display: 'flex' }, classList: classes(), querySelector: () => panel };
    const doc = {
        readyState: 'loading', documentElement: { style: {}, classList: classes() },
        body: { style: {}, appendChild() {} },
        createElement: () => ({ addEventListener() {} })
    };
    const main = Object.assign(new EventEmitter(), { x: 100, y: 100, width: 1280, height: 720 });
    const win = Object.assign(new EventEmitter(), {
        x: 0, y: 0, width: 1280, height: 720, window: { document: doc },
        setMinimumSize: (...args) => calls.push(['minimum', ...args]),
        moveTo(x, y) { this.x = x; this.y = y; calls.push(['move', x, y]); this.emit('move'); },
        resizeTo(width, height) { this.width = width; this.height = height; calls.push(['resize', width, height]); this.emit('resize'); },
        show() { calls.push(['show', this.width, this.height]); },
        hide: () => calls.push(['hide']), focus: () => calls.push(['focus']),
        close: force => calls.push(['close', force]), setAlwaysOnTop() {}
    });
    const world = {
        document: { getElementById: () => overlay },
        localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
        nw: {
            Window: { get: () => main, open: (page, requested, callback) => { options = requested; openCallback = callback; } },
            Screen: { Init() {}, screens: [{ work_area: { x: 0, y: 0, width: 2560, height: 1400 } }] }
        },
        RRPopoutBridge: { dressLike: () => styles, attach() {}, setAsleep: (child, asleep) => calls.push(['asleep', asleep]) },
        setTimeout(fn, delay) { const timer = { fn, at: now + delay }; timers.add(timer); return timer; },
        clearTimeout: timer => timers.delete(timer)
    };
    world.window = world;
    vm.runInNewContext(source, world);
    const api = world.RRDetachedWindow.create({
        overlayId: 'forge', panelSelector: '.panel', titleSelector: '.title', page: 'forge-panel.html',
        minWidth: 900, minHeight: 560, defaultWidth: 1920, defaultHeight: 1200, sizeToScreen: true,
        storageKey: 'web', popoutKey: 'native', poppedClass: 'popped', gripClass: 'grip',
        isOpen: node => node.style.display !== 'none'
    });
    return {
        api, calls, store, doc, win, overlay, world, options: () => options,
        created: () => openCallback(win),
        loaded() { doc.readyState = 'complete'; win.emit('loaded'); },
        async styled() { resolveStyles(); await styles; await Promise.resolve(); },
        tick(ms) {
            now += ms;
            for (const timer of [...timers]) if (timer.at <= now) { timers.delete(timer); timer.fn(); }
        }
    };
}

test('a native workspace first appears themed, clipped and at its final size', async () => {
    const f = opening();
    f.api.open(f.overlay);
    assert.equal(f.options().show, false);
    assert.equal(f.options().width, 1920);
    f.created();
    f.win.emit('resize');
    assert.equal(f.store.has('native'), false, 'the inherited small startup size is never remembered');
    f.loaded();
    f.api.open(f.overlay);
    f.tick(500);
    assert.equal(f.calls.some(call => call[0] === 'show'), false, 'raising an opening window cannot expose unstyled content');
    await f.styled();
    assert.deepEqual(f.calls.filter(call => ['minimum', 'move', 'resize'].includes(call[0])), [
        ['minimum', 900, 560], ['move', 320, 100], ['resize', 1920, 1200]
    ]);
    assert.equal(f.doc.documentElement.classList.contains('rr-detached-window'), true);
    assert.equal(f.calls.some(call => call[0] === 'show'), false, 'native geometry settles while still hidden');
    f.tick(50);
    assert.deepEqual(f.calls.filter(call => call[0] === 'show'), [['show', 1920, 1200]]);
    const shown = f.calls.length;
    f.tick(1000);
    assert.equal(f.calls.slice(shown).some(call => call[0] === 'resize'), false, 'there is no visible delayed correction');
    f.win.resizeTo(1400, 900);
    assert.equal(JSON.parse(f.store.get('native')).width, 1400, 'a later user resize is remembered');
    f.api.hidePopout();
    f.api.open(f.overlay);
    assert.deepEqual(f.calls.filter(call => call[0] === 'show').at(-1), ['show', 1400, 900], 'reopening keeps the chosen size');
});

test('closing before the native handle arrives prevents a late reveal', async () => {
    const f = opening();
    f.api.open(f.overlay);
    f.api.hidePopout();
    f.overlay.style.display = 'none';
    f.created();
    f.loaded();
    await f.styled();
    f.tick(1000);
    assert.equal(f.calls.some(call => call[0] === 'show'), false);
    f.overlay.style.display = 'flex';
    f.api.open(f.overlay);
    assert.deepEqual(f.calls.filter(call => call[0] === 'show'), [['show', 1920, 1200]]);
});

test('closing during stylesheet loading keeps a mounted workspace hidden', async () => {
    const f = opening();
    f.api.open(f.overlay);
    f.created();
    f.loaded();
    f.api.hidePopout();
    await f.styled();
    f.tick(1000);
    assert.equal(f.calls.some(call => call[0] === 'show'), false, 'hide wins even if the overlay remains in the document');
});

test('native window focus hands preview work back and forth and pauses it outside the application', async () => {
    const fixture = opening();
    fixture.world.document.addEventListener = () => {};
    const helper = fixture.world.RRDetachedWindow;
    let changes = 0;
    const off = helper.onPreviewActivity(() => changes++);
    fixture.api.open(fixture.overlay); fixture.created(); fixture.loaded(); await fixture.styled(); fixture.tick(50);
    const content = { ownerDocument: fixture.doc };
    assert.equal(helper.previewActive(content), true);
    assert.equal(helper.previewActive(), false);
    const main = fixture.world.nw.Window.get();
    main.emit('focus');
    assert.equal(helper.previewActive(), true);
    assert.equal(helper.previewActive(content), false);
    main.emit('blur');
    assert.equal(helper.previewActive(), false);
    fixture.win.emit('focus');
    assert.equal(helper.previewActive(content), true);
    fixture.win.emit('blur');
    assert.equal(helper.previewActive(content), false);
    main.emit('focus');
    assert.equal(helper.previewActive(), true);
    assert.ok(changes >= 5);
    off();
});

function mediaOpening() {
    const f = opening();
    vm.runInNewContext(fs.readFileSync(path.join(root, 'src/event/commands/MediaSurfaceEditor.js'), 'utf8'), f.world);
    const editor = new f.world.MediaSurfaceEditor();
    const body = { style: { gridTemplateColumns: '1fr 1fr' } }, button = { style: {} };
    editor.liveDialog = {
        style: { cssText: 'original' }, getBoundingClientRect: () => ({ width: 600, height: 800 }),
        querySelector: selector => selector === '.vs-pop-out' ? button : body
    };
    editor._t = value => value;
    editor.modal = { isConnected: true, appendChild() {} };
    return { ...f, editor };
}

test('the Media Surface pop-out also reveals at its final size without later corrections', async () => {
    const f = mediaOpening();
    assert.equal(f.editor._popOut(), true);
    assert.equal(f.options().show, false);
    f.created();
    f.loaded();
    f.tick(500);
    assert.equal(f.calls.some(call => call[0] === 'show'), false);
    await f.styled();
    f.tick(50);
    assert.deepEqual(f.calls.filter(call => call[0] === 'show'), [['show', 616, 800]]);
    const shown = f.calls.length;
    f.tick(1000);
    assert.equal(f.calls.slice(shown).some(call => call[0] === 'resize'), false);
});

test('docking Media Surface during loading cancels its pending reveal', async () => {
    const f = mediaOpening();
    f.editor._popOut();
    f.created();
    f.loaded();
    f.editor._dockPanel();
    await f.styled();
    f.tick(1000);
    assert.equal(f.calls.some(call => call[0] === 'show'), false);
    assert.equal(f.editor.liveDialog.style.cssText, 'original');
});

test('rounded clipping covers the native document and every floating frame', () => {
    const css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
    assert.match(css, /html\.rr-detached-window\s*\{[^}]*clip-path: inset\(0 round var\(--radius-lg\)\)/);
    const clipped = css.slice(css.indexOf('/* In-page floating frames'), css.indexOf('.plugin-details-header, .plugin-help-section'));
    for (const selector of ['#event-editor-modal.rr-event-editor-floating > .rr-modal', '#database-viewer.rr-database-floating > .database-window', '#forge-workspace > .rr-forge-window', '#plugin-manager-modal > .rr-plugin-window']) {
        assert.ok(clipped.includes(selector), selector);
    }
    assert.match(clipped, /clip-path: inset\(0 round var\(--radius-lg\)\)/);
});
