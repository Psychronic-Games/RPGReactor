/**
 * An editor dialog as a window of its own beside the map, on any monitor, with no title bar but
 * its own: its header drags it, its corner sizes it, its × closes it, and it keeps its place
 * between openings and between sessions. It stays in front of the editor while Reactor is the
 * app in use, and drops behind other apps with it. Previews follow the active window; keys go where the person
 * last worked. EventEditorWindow.js, DatabaseWindow.js, ForgeWindow.js and
 * PluginManagerWindow.js each use one, and all can be open at once.
 *
 * Where the desktop app can open windows (NW.js) that is the only way it shows. Without it (the
 * web editor) the dialog floats inside the page instead: no backdrop, dragged by its header,
 * sized from its corner, its place remembered.
 *
 *   const win = RRDetachedWindow.create(config)
 *   win.install(overlay)   once, on the dialog's overlay
 *   win.open(overlay)      as it opens: its window shows, made the first time
 *   win.place(overlay)     the in-page window's remembered place, or centered
 *   win.isOpen()           the dialog is showing
 *   win.ownsKeys()         open, and the last click or focus landed in it
 *   win.clamp(rect, view)  a rectangle kept wholly on screen
 *   win.isPoppedOut()      it lives in a window of its own now
 *   win.seeThrough()       its window requests transparent pixels outside its rounded panel
 *   win.hidePopout()       it closed: its window hides and keeps its place
 *   win.toggleFit()        its window fills the monitor it is on, or goes back; win.minimize()
 *   win.pinned() / win.setPinned(on)   whether it stays on top of every window, other apps' too (remembered per window)
 *
 * config: overlayId, panelSelector, headerSelector, titleSelector, title (fallback), page (the
 * blank HTML page its window loads), storageKey, popoutKey, minWidth, minHeight, defaultWidth and
 * defaultHeight (the first-open size's cap, 1400 × 1000 unless given), sizeToScreen (use the
 * editor's monitor for the initial size, even when the editor itself is smaller),
 * floatingClass, poppedClass, gripClass, dockedEvent (fired on window when it comes back into
 * the editor window), isOpen(overlay), closeFromFrame() (closed by Alt+F4 or the taskbar: close
 * as its own × does, asking first about unapplied edits; resolves when answered).
 */
(function(root) {
    'use strict';

    // The last place the person worked, in any window: a click, or focus arriving by keyboard
    // (Tab). A click on the map canvas moves no focus, so the focus alone would keep claiming keys
    // for a window. Registered on the main document, so the pop-outs' clicks are heard as well.
    let lastWorkedTarget = null;
    let trackerInstalled = false;
    let previewWindow = null;
    let previewForeground = true;
    const previewListeners = new Set();

    function activatePreview(owner, foreground = true) {
        if (previewWindow === owner && previewForeground === foreground) return;
        previewWindow = owner;
        previewForeground = foreground;
        for (const listener of previewListeners) listener();
    }

    function previewActive(element = null) {
        if (!previewForeground) return false;
        const active = previewWindow?.isOpen() ? previewWindow : null;
        const owner = element ? windows.find(win => win.isOpen() && win.owns(element)) || null : null;
        return active === owner;
    }

    function onPreviewActivity(listener) {
        trackLastWorked();
        previewListeners.add(listener);
        return () => previewListeners.delete(listener);
    }

    function trackLastWorked() {
        if (trackerInstalled || typeof document === 'undefined') return;
        trackerInstalled = true;
        previewForeground = document.hidden !== true && (typeof document.hasFocus !== 'function' || document.hasFocus());
        const worked = event => {
            lastWorkedTarget = event.target;
            activatePreview(windows.find(win => win.isOpen() && win.owns(event.target)) || null);
        };
        document.addEventListener('pointerdown', worked, true);
        document.addEventListener('focusin', worked, true);
        document.addEventListener('wheel', worked, { capture: true, passive: true });
        document.addEventListener('visibilitychange', () => {
            if (!previewWindow) activatePreview(null, !document.hidden && (typeof document.hasFocus !== 'function' || document.hasFocus()));
        });
        root.addEventListener?.('focus', () => activatePreview(null));
        root.addEventListener?.('blur', () => { if (!previewWindow) activatePreview(null, false); });
    }
    function lastWorked() {
        return lastWorkedTarget && lastWorkedTarget.isConnected !== false ? lastWorkedTarget : document.activeElement;
    }

    /**
     * The open windows as a row of chips in the upper left corner of the map's area in the editor's own window: one click brings a window
     * back, minimized or behind something, on any desktop. A taskbar shows the editor's windows as one icon
     * and what a click on it does is the desktop's to decide; this row is the editor's own.
     */
    let dockFrame = 0, dockWatch = null, dockElement = null;
    /**
     * The row, in the editor's own page and nowhere else. While a pop-out has the focus the page's lookups and
     * its body's appendChild are turned to that window (RRPopoutBridge, so a dialog opens in front of the
     * person): asked for that way, the row was put on top of the pop-out it lists and rode along with it.
     */
    function dockIn(doc) {
        if (dockElement && dockElement.ownerDocument !== doc) { dockElement.remove(); dockElement = null; }
        return dockElement && dockElement.isConnected ? dockElement : null;
    }
    /** The row's place: the upper left corner of the map's own area, clear of the toolbars and of the bars along the bottom. */
    function placeDock() {
        const doc = root.document, dock = doc && dockIn(doc);
        if (!dock) return;
        const area = doc.getElementById('canvas-container'), box = area && area.ownerDocument === doc && area.getBoundingClientRect();
        const there = box && box.width > 40 && box.height > 40;
        dock.style.left = Math.round(there ? box.left + 8 : 8) + 'px';
        dock.style.top = Math.round(there ? box.top + 8 : 8) + 'px';
        dock.style.maxWidth = Math.max(160, Math.round((there ? box.width : (root.innerWidth || 1280)) - 16)) + 'px';
        // The map's area moves when a side panel is dragged or the window is sized.
        if (there && !dockWatch && typeof ResizeObserver === 'function') {
            dockWatch = new ResizeObserver(() => placeDock());
            dockWatch.observe(area);
            root.addEventListener('resize', placeDock);
        }
    }
    function refreshDock() {
        const doc = root.document;
        if (!doc || typeof doc.createElement !== 'function' || !doc.body) return;
        if (dockFrame) return;
        const draw = () => {
            dockFrame = 0;
            const shown = windows.filter(win => win.isPoppedOut() && win.isShown());
            let dock = dockIn(doc);
            if (!shown.length) { if (dock) dock.remove(); dockElement = null; return; }
            if (!dock) {
                dock = doc.createElement('div');
                dock.id = 'rr-window-dock';
                dock.setAttribute('role', 'toolbar');
                dock.addEventListener('click', event => {
                    const chip = event.target.closest('[data-window-index]');
                    const win = chip && windows[Number(chip.dataset.windowIndex)];
                    if (win) win.raise();
                });
                // The page's own appendChild, not the one turned to the window in use.
                (root.Node ? root.Node.prototype.appendChild : doc.body.appendChild).call(doc.body, dock);
                dockElement = dock;
            }
            const say = text => (root.I18n && typeof root.I18n.t === 'function' ? root.I18n.t(text) : text);
            const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            dock.setAttribute('aria-label', say('Open windows'));
            dock.innerHTML = `<span class="rr-window-dock-label">${escape(say('Windows'))}</span>` + shown.map(win => {
                const title = win.title(), small = win.isMinimized();
                return `<button type="button" class="rr-window-chip${small ? ' is-minimized' : ''}" data-window-index="${windows.indexOf(win)}" title="${escape(say(small ? 'Minimized. Click to bring it back.' : 'Click to bring this window to the front.'))}"><span class="rr-window-chip-mark"></span><span class="rr-window-chip-title">${escape(title)}</span></button>`;
            }).join('');
            placeDock();
        };
        // A timer, not a frame: a window wholly covered by its own pop-out is given no frames.
        dockFrame = root.setTimeout(draw, 0) || 1;
    }

    function create(config) {
        const MIN_WIDTH = config.minWidth;
        const MIN_HEIGHT = config.minHeight;
        const STORAGE_KEY = config.storageKey;
        const POPOUT_KEY = config.popoutKey;
        let popped = null;
        let sizeObserver = null;
        let globalsInstalled = false;

        function overlayElement() {
            return typeof document !== 'undefined' ? document.getElementById(config.overlayId) : null;
        }

        function panelOf(overlay) {
            return overlay && overlay.querySelector(config.panelSelector);
        }

        /**
         * A rectangle kept wholly on screen, so its OK and Apply stay in reach; it is made smaller
         * from its corner to uncover more of the map.
         */
        function clamp(rect, view) {
            const width = Math.min(view.width, Math.max(MIN_WIDTH, Math.round(rect.width)));
            const height = Math.min(view.height, Math.max(MIN_HEIGHT, Math.round(rect.height)));
            const left = Math.max(view.left || 0, Math.min(Math.round(rect.left), (view.left || 0) + view.width - width));
            const top = Math.max(view.top || 0, Math.min(Math.round(rect.top), (view.top || 0) + view.height - height));
            return { left, top, width, height };
        }

        /** Today's dialog size, centered on the view: what the window is before it has been moved. */
        function defaultRect(view) {
            const width = Math.min(config.defaultWidth || 1400, Math.round(view.width * 0.95));
            const height = Math.min(config.defaultHeight || 1000, Math.round(view.height * 0.97));
            return { left: (view.left || 0) + Math.round((view.width - width) / 2), top: (view.top || 0) + Math.round((view.height - height) / 2), width, height };
        }

        function viewport() {
            return { width: root.innerWidth || 1280, height: root.innerHeight || 720 };
        }

        function read(key) {
            try {
                const value = JSON.parse(root.localStorage.getItem(key) || 'null');
                return value && ['left', 'top', 'width', 'height'].every(name => Number.isFinite(value[name])) ? value : null;
            } catch (error) {
                return null;
            }
        }

        function write(key, rect) {
            try { root.localStorage.setItem(key, JSON.stringify(rect)); } catch (error) { /* a convenience only */ }
        }

        function apply(panel, rect) {
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            panel.style.width = rect.width + 'px';
            panel.style.height = rect.height + 'px';
        }

        function current(panel) {
            const box = panel.getBoundingClientRect();
            return { left: box.left, top: box.top, width: box.width, height: box.height };
        }

        function place(overlay = overlayElement()) {
            const panel = panelOf(overlay);
            if (!panel || popped) return;
            const view = viewport();
            apply(panel, clamp(read(STORAGE_KEY) || defaultRect(view), view));
        }

        function startDrag(overlay, event) {
            const panel = panelOf(overlay);
            if (!panel || event.button !== 0 || event.target.closest('button, input, select, textarea, a')) return;
            event.preventDefault();
            const start = current(panel);
            const originX = event.clientX, originY = event.clientY;
            const move = moveEvent => {
                apply(panel, clamp({ ...start, left: start.left + moveEvent.clientX - originX, top: start.top + moveEvent.clientY - originY }, viewport()));
            };
            const end = () => {
                document.removeEventListener('pointermove', move);
                document.removeEventListener('pointerup', end);
                write(STORAGE_KEY, current(panel));
            };
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', end);
        }

        // --- A window of its own ---------------------------------------------------------------

        function separateWindows() {
            return typeof nw !== 'undefined' && !!(nw.Window && nw.Window.open && nw.Window.get) && !!root.RRPopoutBridge;
        }

        function isPoppedOut() {
            return !!popped;
        }

        /** Request transparent corners on every platform; never substitute an opaque frame. */
        function seeThrough() { return true; }

        /** The work areas of the connected screens, as rectangles. */
        function screens() {
            try {
                if (nw.Screen && !nw.Screen.__rrInit) { nw.Screen.Init(); nw.Screen.__rrInit = true; }
                return (nw.Screen.screens || []).map(screen => {
                    const area = screen.work_area || screen.bounds;
                    return { left: area.x, top: area.y, width: area.width, height: area.height };
                });
            } catch (error) {
                return [];
            }
        }

        /**
         * Where the window opens: where it was left, kept on the screen it is mostly on; if that
         * screen is gone, today's size centered over the editor window.
         */
        function windowRect(main) {
            const shown = screens();
            const saved = read(POPOUT_KEY);
            if (saved) {
                const home = shown.find(area => saved.left + saved.width / 2 >= area.left && saved.left + saved.width / 2 < area.left + area.width
                    && saved.top + 20 >= area.top && saved.top + 20 < area.top + area.height);
                if (home) return clamp(saved, home);
            }
            const editor = { left: main.x, top: main.y, width: main.width, height: main.height };
            if (config.sizeToScreen) {
                const home = shown.find(area => editor.left + editor.width / 2 >= area.left && editor.left + editor.width / 2 < area.left + area.width
                    && editor.top + editor.height / 2 >= area.top && editor.top + editor.height / 2 < area.top + area.height);
                if (home) return clamp(defaultRect(home), home);
            }
            return defaultRect(editor);
        }

        function keepWindowRect(win) {
            // Maximized, the place remembered stays the one it goes back to.
            if (popped && popped.maximized) return;
            write(POPOUT_KEY, { left: win.x, top: win.y, width: win.width, height: win.height });
        }

        // --- The buttons a title bar would have ------------------------------------------------

        /**
         * Pinned, the window stays on top of every window, other apps' too. Not pinned (the default) it is in
         * front of the editor while Reactor is the app in use and drops behind other apps with it.
         */
        function pinned() {
            try { return root.localStorage.getItem(POPOUT_KEY + ':top') === '1'; } catch (error) { return false; }
        }

        function setPinned(on) {
            try { root.localStorage.setItem(POPOUT_KEY + ':top', on ? '1' : '0'); } catch (error) { /* a convenience only */ }
            if (popped && popped.decide) popped.decide();
            pinThroughDesktop(popped);
            showControls();
        }

        /**
         * Fill the monitor the window is on, or go back to its size: the desktop's own maximize. The window
         * manager knows which monitor that is and leaves its panels clear; the app does not always (a Wayland
         * window is told neither its place nor its monitor, and sized from the main monitor's numbers it
         * overflowed a smaller one). Returns whether it is maximized now.
         */
        function toggleFit(state = popped) {
            const win = state && state.win;
            if (!win || !state.ready) return false;
            state.maximized = !state.maximized;
            try { if (state.maximized) win.maximize(); else win.restore(); } catch (error) { state.maximized = false; }
            showControls();
            return !!state.maximized;
        }

        /**
         * Whether the window's place and stacking are the app's to set. Not for a native Wayland window: the
         * desktop tells an app neither where its window is nor lets it move it or keep it on top. There the
         * window is sized only by the sides that grow it without moving it, filling a monitor is the desktop's
         * own maximize, and the pin is asked of the window manager where it can be (KWin, below).
         */
        function placesItself() {
            try {
                const env = (typeof process !== 'undefined' && process.env) || {};
                if (typeof process === 'undefined' || process.platform !== 'linux' || !env.WAYLAND_DISPLAY) return true;
                // Started as an X11 client on a Wayland desktop (--ozone-platform=x11), it is placed as on X11.
                const app = (typeof nw !== 'undefined' && nw.App) || {};
                const args = (app.fullArgv || []).concat(String((app.manifest && app.manifest['chromium-args']) || '').split(/\s+/));
                return args.includes('--ozone-platform=x11');
            } catch (error) { return true; }
        }

        /** A Wayland window on KDE: KWin keeps a window above the others when one of its scripts asks. */
        function onKWin() {
            try { return !placesItself() && /kde/i.test(process.env.XDG_CURRENT_DESKTOP || '') && typeof require === 'function'; } catch (error) { return false; }
        }

        /** Whether the pin can do anything here. */
        function canPin() {
            return placesItself() || onKWin();
        }

        /**
         * Run a script of KWin's (its window manager scripting, over D-Bus): loaded, run, and unloaded at once,
         * or kept until the function returned is called (`keep`). `ready` is told once it runs, or that it
         * could not. Nothing happens where KWin does not answer.
         */
        function kwinScript(source, { keep = false, ready = null } = {}) {
            let stopped = false, loaded = false, stop = () => { stopped = true; };
            try {
                const fs = require('fs'), os = require('os'), path = require('path'), { execFile } = require('child_process');
                const name = 'rr-window-' + process.pid + '-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), file = path.join(os.tmpdir(), name + '.js');
                fs.writeFileSync(file, source);
                const send = (object, method, args, done) => execFile('dbus-send', ['--session', '--print-reply', '--dest=org.kde.KWin', object, method, ...args], { timeout: 4000 }, (error, out) => done(error, String(out || '')));
                const unload = () => { if (loaded) { loaded = false; send('/Scripting', 'org.kde.kwin.Scripting.unloadScript', ['string:' + name], () => {}); } try { fs.unlinkSync(file); } catch (error) { /* gone */ } };
                stop = () => { stopped = true; unload(); };
                send('/Scripting', 'org.kde.kwin.Scripting.loadScript', ['string:' + file, 'string:' + name], (error, out) => {
                    const id = /int32 (\d+)/.exec(out);
                    if (error || !id) { unload(); if (ready) ready(false); return; }
                    loaded = true;
                    send('/Scripting/Script' + id[1], 'org.kde.kwin.Script.run', [], failed => {
                        if (!keep || stopped) unload();
                        if (ready) ready(!failed);
                    });
                });
            } catch (error) { if (ready) ready(false); }
            return () => stop();
        }

        /** Ask KWin to keep the window titled `title` above the others, or to stop. */
        function kwinKeepAbove(title, on) {
            kwinScript(`for (const w of workspace.windowList()) if (w.caption === ${JSON.stringify(title)}) w.keepAbove = ${on ? 'true' : 'false'};\n`);
        }

        /**
         * While a side or corner is dragged, KWin holds the opposite one where it stood. Left to itself it
         * keeps the middle of a window that sizes itself (measured on KWin 6.8: a corner dragged out by
         * 200 x 120 moved the far corner 100 x 60 the other way). The app only sets the size; the script,
         * inside the window manager, puts the window back at each change. Returns what ends it.
         */
        function kwinAnchor(title, edge, ready) {
            return kwinScript(`(function() {
    const w = workspace.windowList().find(x => x.caption === ${JSON.stringify(title)});
    if (!w) return;
    const g = w.frameGeometry, left = g.x, top = g.y, right = g.x + g.width, bottom = g.y + g.height;
    w.frameGeometryChanged.connect(function() {
        const n = w.frameGeometry, x = ${edge.includes('w') ? 'right - n.width' : 'left'}, y = ${edge.includes('n') ? 'bottom - n.height' : 'top'};
        if (Math.abs(n.x - x) > 0.5 || Math.abs(n.y - y) > 0.5) w.frameGeometry = { x: x, y: y, width: n.width, height: n.height };
    });
})();\n`, { keep: true, ready });
        }

        /** The pin as the window manager holds it, asked again only when it changes or the window is shown anew. */
        function pinThroughDesktop(state, force = false) {
            if (!state || !state.win || !onKWin()) return;
            const on = pinned();
            if (!force && state.desktopPin === on) return;
            state.desktopPin = on;
            let title = '';
            try { title = state.child && state.child.document ? state.child.document.title : ''; } catch (error) { /* closed */ }
            if (title) kwinKeepAbove(title, on);
        }

        function minimize(state = popped) {
            if (!state || !state.win) return;
            // Said here as well: not every desktop tells a window it was minimized.
            state.minimized = true;
            refreshDock();
            try { state.win.minimize(); } catch (error) { /* gone */ }
        }

        const CONTROL_ICONS = {
            // The pushpin of Google's Material Icons (Apache License 2.0): filled when pinned, its outline tilted when not.
            pin: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" fill="currentColor"/></svg>',
            unpinned: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path transform="rotate(45 12 12)" d="M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z" fill="currentColor"/></svg>',
            minimize: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 12h10v1.5H3z" fill="currentColor"/></svg>',
            fit: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2.5 2.5h11v11h-11zM4 5v7h8V5z" fill="currentColor" fill-rule="evenodd"/></svg>',
            restore: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M5 2.5h8.5V11H12V4H5zM2.5 5H11v8.5H2.5zM4 7.5V12h5.5V7.5z" fill="currentColor" fill-rule="evenodd"/></svg>'
        };
        const say = text => (root.I18n && typeof root.I18n.t === 'function' ? root.I18n.t(text) : text);

        /** The header's window buttons, made once and kept through every opening, before its ×. */
        function addWindowControls(overlay) {
            const panel = panelOf(overlay), header = panel && panel.querySelector(config.headerSelector);
            if (!header || header.querySelector('.rr-window-controls')) return;
            const box = header.ownerDocument.createElement('span');
            box.className = 'rr-window-controls';
            // No pin where nothing can keep the window on top (a Wayland desktop other than KDE).
            box.innerHTML = (canPin() ? ['pin', 'minimize', 'fit'] : ['minimize', 'fit']).map(name => `<button type="button" class="rr-window-control" data-window="${name}"></button>`).join('');
            box.addEventListener('click', event => {
                const button = event.target.closest('[data-window]');
                if (!button || !popped) return;
                if (button.dataset.window === 'pin') setPinned(!pinned());
                else if (button.dataset.window === 'minimize') minimize();
                else toggleFit();
            });
            const buttons = [...header.querySelectorAll('button')];
            const close = header.querySelector('.rr-modal-close, .modal-close, [data-action="close"]') || buttons[buttons.length - 1];
            if (close) close.parentElement.insertBefore(box, close); else header.appendChild(box);
        }

        /** Each button as things stand: what it would do now, said in its title. */
        function showControls() {
            const overlay = popped && popped.overlay, box = overlay && overlay.querySelector('.rr-window-controls');
            if (!box) return;
            const set = (name, icon, title, on) => {
                const button = box.querySelector(`[data-window="${name}"]`);
                if (!button) return;
                button.innerHTML = CONTROL_ICONS[icon];
                button.title = say(title);
                button.setAttribute('aria-label', say(title));
                if (on === undefined) button.removeAttribute('aria-pressed'); else button.setAttribute('aria-pressed', String(on));
            };
            const on = pinned();
            set('pin', on ? 'pin' : 'unpinned', on ? 'Pinned: stays on top of every window. Click to let other windows cover it.' : 'Pin: keep this window on top of every window, other apps too.', on);
            set('minimize', 'minimize', 'Minimize');
            set('fit', popped.maximized ? 'restore' : 'fit', popped.maximized ? 'Back to its size' : 'Fill this monitor');
        }

        /**
         * The window's place and size set together. Moved and then sized in two calls, the second used the
         * place the window had before the first (seen on KWin: a window sent back from the monitor's size
         * landed in the corner).
         */
        function setBounds(win, rect) {
            const bounds = { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
            try {
                const id = win.cWindow && win.cWindow.id, api = root.chrome && root.chrome.windows;
                if (api && typeof api.update === 'function' && id !== undefined && id !== null) { api.update(id, bounds); return; }
            } catch (error) { /* the two calls below */ }
            win.resizeTo(bounds.width, bounds.height);
            win.moveTo(bounds.left, bounds.top);
        }

        /**
         * A window with no frame is sized by its own edges: the corner grip that shows, and a thin strip along
         * every side and corner. The side or corner dragged follows the pointer and the opposite one stays
         * where it is, the same on every desktop; never under the minimum.
         */
        const EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'sw', 'se'];
        function edgeRect(start, edge, dx, dy) {
            let { left, top, width, height } = start;
            if (edge.includes('e')) width = Math.max(MIN_WIDTH, start.width + dx);
            if (edge.includes('s')) height = Math.max(MIN_HEIGHT, start.height + dy);
            if (edge.includes('w')) { width = Math.max(MIN_WIDTH, start.width - dx); left = start.left + start.width - width; }
            if (edge.includes('n')) { height = Math.max(MIN_HEIGHT, start.height - dy); top = start.top + start.height - height; }
            return { left, top, width, height };
        }
        function addResizeGrip(doc, win) {
            const handle = (edge, className) => {
                const grip = doc.createElement('div');
                grip.className = className;
                grip.dataset.edge = edge;
                grip.addEventListener('pointerdown', event => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    try { grip.setPointerCapture(event.pointerId); } catch (error) { /* the document still hears the moves */ }
                    const startX = event.screenX, startY = event.screenY, start = { left: win.x, top: win.y, width: win.width, height: win.height };
                    // Maximized, its size is the window manager's.
                    if (popped && popped.maximized) return;
                    // On a Wayland desktop the app sets the size alone, and KWin (where it is the window manager)
                    // holds the far side; the moves that arrive before it has begun wait for it.
                    const desktop = !placesItself();
                    let release = null, anchored = !desktop || !onKWin(), waiting = null;
                    const size = rect => { if (desktop) win.resizeTo(Math.round(rect.width), Math.round(rect.height)); else setBounds(win, rect); };
                    if (!anchored) {
                        let title = '';
                        try { title = doc.title; } catch (error) { /* closed */ }
                        release = kwinAnchor(title, edge, () => { anchored = true; if (waiting) { size(waiting); waiting = null; } });
                    }
                    const move = moveEvent => {
                        const rect = edgeRect(start, edge, moveEvent.screenX - startX, moveEvent.screenY - startY);
                        if (anchored) size(rect); else waiting = rect;
                    };
                    const end = () => {
                        doc.removeEventListener('pointermove', move);
                        doc.removeEventListener('pointerup', end);
                        doc.removeEventListener('pointercancel', end);
                        // The last size has to reach the window manager before it lets go of the far side.
                        if (release) root.setTimeout(release, 300);
                        keepWindowRect(win);
                    };
                    doc.addEventListener('pointermove', move);
                    doc.addEventListener('pointerup', end);
                    doc.addEventListener('pointercancel', end);
                });
                doc.body.appendChild(grip);
            };
            // Every side where something can hold the far one: the app itself, or KWin for it.
            const movable = placesItself() || onKWin();
            for (const edge of EDGES) if (edge !== 'se' && (movable || edge === 'e' || edge === 's')) handle(edge, 'rr-window-edge');
            handle('se', config.gripClass);
        }

        /**
         * In front of the editor window while Reactor is the app being used (a click on the map
         * must not bury it), behind other apps when Reactor is not.
         */
        function stayInFrontOfEditor(main, win, state) {
            const focus = { main: true, own: true };
            let settle = null;
            const decide = () => {
                clearTimeout(settle);
                settle = setTimeout(() => {
                    if (popped !== state) return;
                    try { win.setAlwaysOnTop(pinned() || focus.main || focus.own || RRDetachedWindow.anyFocused()); } catch (error) { /* closed */ }
                }, 120);
            };
            const on = (target, name, handler) => { target.on(name, handler); state.unhook.push(() => target.removeListener(name, handler)); };
            // Each window's focus decides for all of them: leaving Reactor from one lets every one drop back.
            on(main, 'focus', () => { focus.main = true; activatePreview(null); RRDetachedWindow.decideAll(); });
            on(main, 'blur', () => { focus.main = false; if (!previewWindow) activatePreview(null, false); RRDetachedWindow.decideAll(); });
            on(win, 'focus', () => { focus.own = true; state.focused = true; activatePreview(api); RRDetachedWindow.decideAll(); });
            on(win, 'blur', () => { focus.own = false; state.focused = false; if (previewWindow === api) activatePreview(api, false); RRDetachedWindow.decideAll(); });
            state.decide = decide;
            decide();
        }

        /** Open the dialog in its window, made the first time; afterwards it only shows again. */
        function popOut(overlay = overlayElement()) {
            const panel = panelOf(overlay);
            if (popped || !panel || !separateWindows()) return false;
            const title = (panel.querySelector(config.titleSelector) || {}).textContent || config.title;
            const main = nw.Window.get();
            const rect = windowRect(main);
            const options = { x: rect.left, y: rect.top, width: rect.width, height: rect.height, min_width: MIN_WIDTH, min_height: MIN_HEIGHT,
                frame: false, transparent: true, show: false, resizable: true, icon: 'images/icon.png', title };
            const state = { win: null, child: null, panelStyle: panel.style.cssText, closing: false, overlay, unhook: [],
                focused: false, ready: false, wantsVisible: true };
            if (sizeObserver) sizeObserver.disconnect();
            popped = state;
            // Not shown in the editor window while its own opens: it appears there, not first over the map.
            overlay.style.visibility = 'hidden';
            nw.Window.open(config.page, options, win => {
                if (popped !== state) { try { win?.close(true); } catch (error) { /* gone */ } return; }
                if (!win) { popped = null; overlay.style.visibility = ''; return; }
                state.win = win;
                const mount = () => {
                    if (popped !== state || state.child) return;
                    const doc = win.window.document;
                    const stylesReady = root.RRPopoutBridge.dressLike(doc);
                    doc.title = title;
                    // Only the rounded panel paints a background. Everything outside it stays clear.
                    doc.documentElement.classList.add('rr-detached-window');
                    doc.documentElement.style.cssText = 'background:transparent !important;';
                    doc.body.style.cssText = 'margin:0;height:100vh;overflow:hidden;background:transparent !important;';
                    state.child = win.window;
                    root.RRPopoutBridge.attach(win.window);
                    root.RRPopoutBridge.setAsleep(win.window, true);
                    overlay.classList.add(config.poppedClass);
                    panel.style.cssText = '';
                    doc.body.appendChild(overlay);
                    addResizeGrip(doc, win);
                    addWindowControls(overlay);
                    showControls();
                    overlay.style.visibility = '';
                    // The manifest can supply the main window's minimum/size during creation.
                    // Load the theme and apply the final geometry while hidden, including the
                    // native window manager's settling turn. No resize runs after we reveal it.
                    Promise.resolve(stylesReady).then(() => {
                        if (popped !== state) return;
                        win.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
                        win.moveTo(rect.left, rect.top);
                        win.resizeTo(rect.width, rect.height);
                        setTimeout(() => {
                            if (popped !== state) return;
                            state.ready = true;
                            if (state.wantsVisible && isOpen()) showPopout();
                            refreshDock();
                        }, 50);
                    });
                };
                const ready = () => win.window && win.window.document && win.window.document.readyState === 'complete';
                if (ready()) mount(); else win.on('loaded', mount);
                // Moved or sized, the whole window is drawn again on its next frame, its clear corners too: on Linux
                // the compositor kept what those pixels last held, and the corners showed square or not by where it stood.
                const repaint = () => {
                    const view = win.window, html = view && view.document && view.document.documentElement;
                    if (!html || !view.requestAnimationFrame) return;
                    if (state.repaintFrame) view.cancelAnimationFrame(state.repaintFrame);
                    state.repaintFrame = view.requestAnimationFrame(() => { state.repaintFrame = 0; html.classList.toggle('rr-repaint'); });
                };
                win.on('move', () => { if (popped === state && state.ready) { keepWindowRect(win); repaint(); } });
                win.on('resize', () => { if (popped === state && state.ready) { keepWindowRect(win); repaint(); } });
                // 'restore' is also a minimized window coming back, which leaves a maximized one maximized.
                // Believed only where the app is told the truth: a Wayland window covered by another was reported
                // minimized (seen on KWin), and there the editor's own button is what says so.
                win.on('minimize', () => { if (placesItself()) { state.minimized = true; refreshDock(); } });
                win.on('maximize', () => { state.maximized = true; showControls(); });
                win.on('restore', () => { if (state.minimized) { state.minimized = false; refreshDock(); } else { state.maximized = false; showControls(); } });
                // A window that has the focus is up, however it came back.
                win.on('focus', () => { if (state.minimized) { state.minimized = false; } refreshDock(); });
                stayInFrontOfEditor(main, win, state);
                // Closing it another way than its × (Alt+F4, the taskbar) closes the dialog as its × does,
                // asking first about unapplied edits; the window hides and waits for the next opening.
                // 'closed' covers a window destroyed without asking (a crash): the dialog comes home.
                win.on('close', () => {
                    if (popped === state && !state.closing) closeFromFrame(state);
                    else { try { win.close(true); } catch (error) { /* gone */ } }
                });
                win.on('closed', () => {
                    if (popped === state && !state.closing) dock({ windowGone: true });
                });
            });
            return true;
        }

        /**
         * Bring the dialog back into the editor window: only when its own window was destroyed under
         * it. Elements back from such a window have lost their handlers: its frame is wired again
         * here, and its owners wire theirs (config.dockedEvent). The next opening is in a window of
         * its own again.
         */
        function dock({ windowGone = false } = {}) {
            const state = popped;
            if (!state) return;
            const overlay = state.overlay;
            popped = null;
            state.closing = true;
            for (const unhook of state.unhook) { try { unhook(); } catch (error) { /* gone */ } }
            if (root.RRPopoutBridge && state.child) root.RRPopoutBridge.detach(state.child);
            if (overlay) {
                overlay.classList.remove(config.poppedClass);
                const panel = panelOf(overlay);
                if (panel) panel.style.cssText = state.panelStyle;
                document.body.appendChild(overlay);
                if (isOpen() && panel) apply(panel, clamp(current(panel), viewport()));
                if (sizeObserver && panel) (root.requestAnimationFrame || setTimeout)(() => sizeObserver.observe(panel));
            }
            try { if (state.win) state.win.close(true); } catch (error) { /* already closed */ }
            refreshDock();
            if (windowGone && overlay) {
                overlay.__rrFloating = false;
                install(overlay);
            }
            if (typeof root.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
                root.dispatchEvent(new CustomEvent(config.dockedEvent, { detail: { windowGone } }));
            }
        }

        async function closeFromFrame(state) {
            if (!isOpen()) { hidePopout(state); return; }
            // Asked in its own window, which raised it.
            const close = () => config.closeFromFrame();
            if (root.RRPopoutBridge) await root.RRPopoutBridge.inPopout(close, state.child); else await close();
            if (!isOpen()) hidePopout(state);
        }

        /** The dialog closed: its window hides and keeps its place for the next opening. */
        function hidePopout(state = popped) {
            if (previewWindow === api) activatePreview(null, previewForeground);
            if (!state || state !== popped) return;
            state.wantsVisible = false;
            state.focused = false;
            if (root.RRPopoutBridge && state.child) root.RRPopoutBridge.setAsleep(state.child, true);
            try { state.win?.hide(); } catch (error) { /* gone */ }
            refreshDock();
        }

        /** Its window is wanted on screen (minimized or not), not hidden with its dialog closed. */
        function isShown() {
            return !!(popped && popped.ready && popped.wantsVisible && isOpen());
        }

        function isMinimized() {
            return !!(popped && popped.minimized);
        }

        function title() {
            try { if (popped && popped.child && popped.child.document && popped.child.document.title) return popped.child.document.title; } catch (error) { /* closed */ }
            return config.title || '';
        }

        /** Up and in front, from wherever it was: minimized, or behind the editor. */
        function raise() {
            if (!popped) return;
            showPopout();
            // A Wayland app may not un-minimize or raise its own window; KWin does it for it.
            if (onKWin()) kwinScript(`(function() { const w = workspace.windowList().find(x => x.caption === ${JSON.stringify(title())}); if (w) { w.minimized = false; workspace.activeWindow = w; } })();\n`);
        }

        /** It opens again: its window comes back where it was. */
        function showPopout() {
            if (!popped) return;
            activatePreview(api);
            popped.wantsVisible = true;
            if (!popped.win || !popped.ready) return;
            if (root.RRPopoutBridge && popped.child) root.RRPopoutBridge.setAsleep(popped.child, false);
            const wasMinimized = !!popped.minimized;
            try { if (wasMinimized) popped.win.restore(); popped.win.show(); popped.win.focus(); } catch (error) { /* gone */ }
            popped.minimized = false;
            refreshDock();
            // Shown again, a Wayland window is a new one to its desktop: a pin is asked for again, once it is up.
            if (pinned() && onKWin()) { const state = popped; root.setTimeout(() => { if (popped === state) pinThroughDesktop(state, true); }, 400); }
            // A dialog first opened while its window was still being made had its focus refused there
            // (hidden): the focus goes into it now that it shows.
            const keys = popped.overlay && popped.overlay._rrModalKeys;
            let active = null;
            try { active = popped.child && popped.child.document ? popped.child.document.activeElement : null; } catch (error) { /* gone */ }
            if (keys && typeof keys.refocus === 'function' && !(active && popped.overlay.contains(active))) keys.refocus();
        }

        /**
         * As the dialog opens: a window of its own where the app can open one (made the first time,
         * shown again after), else the in-page window at its remembered place.
         */
        function open(overlay = overlayElement(), { shownBefore = false } = {}) {
            activatePreview(api);
            if (popped) { showPopout(); return; }
            if (separateWindows()) { popOut(overlay); return; }
            if (!shownBefore) place(overlay);
        }

        /** The window's NW handle while there is one (tests move and close it). */
        function popoutWindow() {
            return popped ? popped.win : null;
        }

        function install(overlay = overlayElement()) {
            const panel = panelOf(overlay);
            if (!overlay || !panel || overlay.__rrFloating) return;
            overlay.__rrFloating = true;
            overlay.classList.add(config.floatingClass);
            const header = panel.querySelector(config.headerSelector);
            if (header) header.addEventListener('pointerdown', event => { if (!popped) startDrag(overlay, event); });
            // In the page, the corner grip resizes (CSS resize); the size it leaves is the one remembered.
            if (typeof ResizeObserver === 'function') {
                if (sizeObserver) sizeObserver.disconnect();
                let settle = null;
                sizeObserver = new ResizeObserver(() => {
                    if (!isOpen() || popped) return;
                    clearTimeout(settle);
                    settle = setTimeout(() => write(STORAGE_KEY, current(panel)), 200);
                });
                sizeObserver.observe(panel);
            }
            trackLastWorked();
            if (!globalsInstalled) {
                globalsInstalled = true;
                root.addEventListener('resize', () => {
                    const shown = panelOf(overlayElement());
                    if (isOpen() && shown && !popped) apply(shown, clamp(current(shown), viewport()));
                });
            }
        }

        function isOpen() {
            const overlay = overlayElement();
            return !!overlay && config.isOpen(overlay);
        }

        /** Whether `element` is part of this dialog: inside it, or anywhere in its own window (a dialog it opened). */
        function owns(element) {
            if (!element) return false;
            const overlay = overlayElement();
            if (popped && popped.child) {
                try { if (element.ownerDocument === popped.child.document) return true; } catch (error) { /* closed */ }
            }
            return !!overlay && overlay.contains(element);
        }

        function ownsKeys() {
            return isOpen() && owns(lastWorked());
        }

        /** Whether its own window has the focus. */
        function focused() {
            return !!(popped && popped.focused);
        }

        function decideInFront() {
            if (popped && popped.decide) popped.decide();
        }

        const api = { install, open, place, isOpen, ownsKeys, owns, focused, decideInFront, clamp, defaultRect, windowRect, popOut, dock, isPoppedOut, popoutWindow, hidePopout, showPopout, separateWindows, seeThrough, pinned, setPinned, canPin, placesItself, toggleFit, minimize, edgeRect, isShown, isMinimized, title, raise,
            MIN_WIDTH, MIN_HEIGHT, STORAGE_KEY, POPOUT_KEY };
        windows.push(api);
        return api;
    }

    const windows = [];

    const RRDetachedWindow = {
        create,
        /** Whether one of the dialogs' own windows has the focus: then they all stay in front of the editor. */
        anyFocused: () => windows.some(win => win.focused()),
        decideAll: () => { for (const win of windows) win.decideInFront(); },
        /** The element the person last clicked or tabbed to, in any window. */
        lastWorked,
        previewActive,
        onPreviewActivity,
        refreshDock
    };
    root.RRDetachedWindow = RRDetachedWindow;
    if (typeof module !== 'undefined' && module.exports) module.exports = RRDetachedWindow;
})(typeof window !== 'undefined' ? window : globalThis);
