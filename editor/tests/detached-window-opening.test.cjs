'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/utils/DetachedWindow.js'), 'utf8');

function opening(extra = {}) {
    let now = 0, openCallback, options, resolveStyles;
    const timers = new Set(), calls = [], store = new Map();
    const styles = new Promise(resolve => { resolveStyles = resolve; });
    const classes = () => {
        const values = new Set();
        return { add: name => values.add(name), remove: name => values.delete(name), contains: name => values.has(name) };
    };
    const part = { textContent: 'Forge', querySelector: () => part, setAttribute() {}, removeAttribute() {} };
    const panel = { style: { cssText: '' }, querySelector: () => part };
    const overlay = { style: { display: 'flex' }, classList: classes(), querySelector: () => panel };
    const doc = {
        readyState: 'loading', documentElement: { style: {}, classList: classes() },
        body: { style: {}, appendChild() {} },
        createElement: () => ({ addEventListener() {}, dataset: {} })
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
    Object.assign(world, extra);
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

async function shownWindow() {
    const f = opening();
    f.api.open(f.overlay);
    f.created(); f.loaded();
    await f.styled();
    f.tick(50);
    return f;
}

test('filling the monitor is the desktop\'s own maximize, and the place remembered stays the one to go back to', async () => {
    const f = await shownWindow(), asked = [];
    f.win.maximize = () => { asked.push('maximize'); f.win.width = 2560; f.win.height = 1396; f.win.emit('maximize'); f.win.emit('resize'); };
    f.win.restore = () => { asked.push('restore'); f.win.emit('restore'); };
    f.win.minimize = () => f.win.emit('minimize');
    f.win.moveTo(400, 260); f.win.resizeTo(1000, 600);
    const kept = f.store.get('native');
    assert.equal(f.api.toggleFit(), true);
    assert.equal(f.store.get('native'), kept, 'the monitor\'s size is not what the next opening uses');
    // Minimized and brought back, it is still maximized: the next press goes back to its size.
    f.api.minimize();
    f.api.open(f.overlay);
    assert.equal(f.api.toggleFit(), false);
    assert.deepEqual(asked, ['maximize', 'restore', 'restore']);
    // Maximized by the desktop itself (a double click on the header, a keyboard shortcut), the button knows.
    f.win.emit('maximize');
    assert.equal(f.api.toggleFit(), false);
});

test('a side or corner dragged moves and the opposite one stays, never under the minimum', async () => {
    const f = await shownWindow(), start = { left: 400, top: 260, width: 1000, height: 600 };
    const same = (actual, expected) => assert.deepEqual({ ...actual }, expected);
    same(f.api.edgeRect(start, 'se', 120, 80), { left: 400, top: 260, width: 1120, height: 680 });
    same(f.api.edgeRect(start, 'w', -100, 0), { left: 300, top: 260, width: 1100, height: 600 });
    same(f.api.edgeRect(start, 'n', 0, -60), { left: 400, top: 200, width: 1000, height: 660 });
    same(f.api.edgeRect(start, 'nw', 60, 40), { left: 460, top: 300, width: 940, height: 560 });
    // Dragged past the minimum (900 x 560), the far side still stands where it was: right at 1400, bottom at 860.
    same(f.api.edgeRect(start, 'nw', 900, 900), { left: 500, top: 300, width: 900, height: 560 });
});

test('pinned, a window stays on top when Reactor is not the app in use; the choice is remembered', async () => {
    const f = await shownWindow(), top = [];
    f.win.setAlwaysOnTop = on => top.push(on);
    assert.equal(f.api.pinned(), false, 'not pinned until asked');
    const leave = () => { f.world.nw.Window.get().emit('blur'); f.win.emit('blur'); f.tick(200); };
    leave();
    assert.equal(top.at(-1), false, 'as before: behind other apps with the editor');
    f.api.setPinned(true);
    f.tick(200);
    assert.equal(top.at(-1), true);
    assert.equal(f.store.get('native:top'), '1');
    leave();
    assert.equal(top.at(-1), true, 'still on top with another app in use');
    f.api.setPinned(false);
    f.tick(200);
    assert.equal(top.at(-1), false);
});

/** A Wayland desktop: the app is told neither where its window is nor may it move it or keep it on top. */
function wayland(desktop) {
    const sent = [], files = new Map();
    const modules = {
        fs: { writeFileSync: (file, text) => files.set(file, text), unlinkSync: file => files.delete(file) },
        os: { tmpdir: () => '/tmp' }, path: require('node:path'),
        child_process: { execFile(command, args, options, done) { sent.push([command, args[3], args[4], files.get(String(args[5] || '').replace('string:', ''))]); done(null, 'method return\n   int32 7\n'); } }
    };
    const f = opening({ process: { platform: 'linux', pid: 1, env: { WAYLAND_DISPLAY: 'wayland-0', XDG_CURRENT_DESKTOP: desktop } }, require: name => modules[name] });
    const made = [];
    f.doc.createElement = () => { const node = { addEventListener(type, fn) { (node.on ||= {})[type] = fn; }, dataset: {}, setPointerCapture() {} }; made.push(node); return node; };
    f.doc.addEventListener = (type, fn) => { (f.doc.on ||= {})[type] = fn; };
    f.doc.removeEventListener = () => {};
    f.doc.title = 'Forge';
    return Object.assign(f, { sent, made });
}
async function shownOn(f) { f.api.open(f.overlay); f.created(); f.loaded(); await f.styled(); f.tick(50); return f; }

test('on a Wayland desktop with KWin the pin and the far side of a drag are asked of the window manager', async () => {
    const f = await shownOn(wayland('KDE'));
    assert.equal(f.api.placesItself(), false);
    assert.equal(f.api.canPin(), true);
    assert.deepEqual(f.made.map(node => node.dataset.edge).sort(), ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
    f.api.setPinned(true);
    const load = f.sent.find(call => call[2] === 'org.kde.kwin.Scripting.loadScript');
    assert.match(load[3], /w\.caption === "Forge"\) w\.keepAbove = true/);
    assert.deepEqual(f.sent.map(call => call[2].split('.').pop()), ['loadScript', 'run', 'unloadScript'], 'loaded, run and unloaded at once');
    // The left side dragged out: the app sets the size alone, and the script holds the right side for as long as the drag lasts.
    f.sent.length = 0; f.calls.length = 0;
    const west = f.made.find(node => node.dataset.edge === 'w');
    west.on.pointerdown({ button: 0, screenX: 500, screenY: 400, pointerId: 1, preventDefault() {} });
    assert.match(f.sent[0][3], /right - n\.width/);
    assert.deepEqual(f.sent.map(call => call[2].split('.').pop()), ['loadScript', 'run'], 'kept while the drag lasts');
    f.doc.on.pointermove({ screenX: 400, screenY: 400 });
    assert.deepEqual(f.calls.filter(call => call[0] === 'resize' || call[0] === 'move'), [['resize', f.win.width, f.win.height]], 'sized, never moved');
    f.doc.on.pointerup({});
    f.tick(400);
    assert.equal(f.sent.at(-1)[2], 'org.kde.kwin.Scripting.unloadScript');
});

test('a window is brought back from its chip: restored where the app can, and by the window manager where it cannot', async () => {
    const f = await shownOn(wayland('KDE')), seen = [];
    f.win.minimize = () => seen.push('minimize');
    f.win.restore = () => seen.push('restore');
    assert.equal(f.api.isShown(), true);
    f.api.minimize();
    assert.equal(f.api.isMinimized(), true, 'known without the desktop saying so');
    f.sent.length = 0;
    f.api.raise();
    assert.deepEqual(seen, ['minimize', 'restore']);
    assert.equal(f.api.isMinimized(), false);
    assert.match(f.sent.find(call => call[3])[3], /w\.minimized = false; workspace\.activeWindow = w/);
    f.api.hidePopout();
    assert.equal(f.api.isShown(), false, 'a closed dialog has no chip');
});

test('on another Wayland desktop there is no pin, and only the sides that grow the window without moving it', async () => {
    const f = await shownOn(wayland('GNOME'));
    assert.equal(f.api.canPin(), false);
    assert.deepEqual(f.made.map(node => node.dataset.edge).sort(), ['e', 's', 'se']);
    assert.equal(f.sent.length, 0);
});

test('a minimized window comes back when its dialog is opened again', async () => {
    const f = await shownWindow(), seen = [];
    f.win.minimize = () => { seen.push('minimize'); f.win.emit('minimize'); };
    f.win.restore = () => { seen.push('restore'); f.win.emit('restore'); };
    f.api.minimize();
    f.api.open(f.overlay);
    assert.deepEqual(seen, ['minimize', 'restore']);
    f.api.open(f.overlay);
    assert.deepEqual(seen, ['minimize', 'restore'], 'a window already up is not restored again');
});

test('a dialog first opened while its window was being made takes the focus as the window shows it', async () => {
    const f = opening();
    const inside = { id: 'first field' };
    let refocused = 0;
    f.overlay.contains = node => node === inside;
    f.overlay._rrModalKeys = { refocus() { refocused++; f.doc.activeElement = inside; } };
    f.doc.activeElement = f.doc.body;
    f.api.open(f.overlay);
    f.created(); f.loaded(); await f.styled();
    assert.equal(refocused, 0, 'not while it is hidden');
    f.tick(50);
    assert.equal(refocused, 1, 'shown: the focus goes into it');
    f.api.hidePopout();
    f.api.open(f.overlay);
    assert.equal(refocused, 1, 'opened again with the focus already inside: left alone');
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
