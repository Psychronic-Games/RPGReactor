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
            write(POPOUT_KEY, { left: win.x, top: win.y, width: win.width, height: win.height });
        }

        /** The corner grip of a window with no frame: it sizes the window, never under its minimum. */
        function addResizeGrip(doc, win) {
            const grip = doc.createElement('div');
            grip.className = config.gripClass;
            grip.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                event.preventDefault();
                const startX = event.screenX, startY = event.screenY, width = win.width, height = win.height;
                const move = moveEvent => {
                    win.resizeTo(Math.max(MIN_WIDTH, Math.round(width + moveEvent.screenX - startX)), Math.max(MIN_HEIGHT, Math.round(height + moveEvent.screenY - startY)));
                };
                const end = () => {
                    doc.removeEventListener('pointermove', move);
                    doc.removeEventListener('pointerup', end);
                    keepWindowRect(win);
                };
                doc.addEventListener('pointermove', move);
                doc.addEventListener('pointerup', end);
            });
            doc.body.appendChild(grip);
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
                    try { win.setAlwaysOnTop(focus.main || focus.own || RRDetachedWindow.anyFocused()); } catch (error) { /* closed */ }
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
        }

        /** It opens again: its window comes back where it was. */
        function showPopout() {
            if (!popped) return;
            activatePreview(api);
            popped.wantsVisible = true;
            if (!popped.win || !popped.ready) return;
            if (root.RRPopoutBridge && popped.child) root.RRPopoutBridge.setAsleep(popped.child, false);
            try { popped.win.show(); popped.win.focus(); } catch (error) { /* gone */ }
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

        const api = { install, open, place, isOpen, ownsKeys, owns, focused, decideInFront, clamp, defaultRect, windowRect, popOut, dock, isPoppedOut, popoutWindow, hidePopout, showPopout, separateWindows, seeThrough,
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
        onPreviewActivity
    };
    root.RRDetachedWindow = RRDetachedWindow;
    if (typeof module !== 'undefined' && module.exports) module.exports = RRDetachedWindow;
})(typeof window !== 'undefined' ? window : globalThis);
