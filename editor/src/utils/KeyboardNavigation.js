/**
 * RRKeyboardNavigation - the keys every popup menu and dialog answer to.
 *
 * Menus in the editor are plain divs built by their owners (the menubar, map
 * and event context menus, database and plugin action menus, the text-code
 * popup). Each draws its own rows and closes itself; this helper adds the
 * keyboard on top of whatever is already there without asking the owner to
 * change how it renders:
 *
 *   Up/Down/Home/End move an active row (disabled rows and separators are
 *   skipped, the ends wrap), Enter/Space activate it, Escape closes the
 *   deepest open layer only, Right opens a row's submenu, Left leaves one.
 *   Pointer hover keeps the active row in sync so the two never fight.
 *
 * `modal()` gives a dialog the three things the keyboard audit found missing:
 * focus that enters on open, Tab/Shift+Tab that stay inside, and Escape that
 * returns focus to whatever opened it. The listener lives on the overlay, so a
 * nested dialog appended later in <body> owns its own Escape and its parent
 * never sees it. A dialog that redraws the control holding the focus leaves the
 * focus on <body>, where the overlay hears nothing: one listener on the document
 * hands such a key to the dialog on top (Escape closes it, Tab goes back inside).
 */
(function (root) {
    'use strict';

    const ACTIVE_CLASS = 'rr-menu-key-active';
    const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';
    const tabbable = element => !element.disabled && element.getAttribute?.('tabindex') !== '-1'
        && element.getAttribute?.('type') !== 'hidden';

    const visible = element => !!element && element.getClientRects().length > 0;
    const editable = target => !!target?.closest?.('input, textarea, select, [contenteditable="true"]');
    const connected = element => !!element && element.isConnected !== false;
    const hasClass = (element, name) => String(element.className || '').split(/\s+/).includes(name);

    /** Return focus to `element` when the keyboard would otherwise land on <body>. */
    function restoreFocus(element, within) {
        if (!connected(element) || typeof element.focus !== 'function') return;
        const doc = root.document;
        const active = doc.activeElement;
        const lost = !active || active === doc.body || (within && within.contains(active));
        if (lost) element.focus({ preventScroll: true });
    }

    /**
     * Keyboard for one open popup menu.
     *
     * options.items()       rows in display order (separators may be included;
     *                       they are skipped when `isRow` says so)
     * options.isRow(el)     optional: false for separators (default: any element
     *                       with a non-empty textContent or `data-menu-row`)
     * options.isDisabled(el) optional: row cannot be activated
     * options.activate(el)  run the row (default: el.click())
     * options.close()       remove this layer; the owner's own hide method
     * options.submenu(el)   optional: open the row's submenu and return its
     *                       {element, items, close} so the child layer takes keys
     * options.parent        optional: the parent controller for a submenu
     * options.onLeft/onRight optional: called when Left/Right have no submenu
     *                       meaning (the menubar switches menus with them)
     * options.focus         false to leave focus alone on open (default: the
     *                       menu root takes focus so keys reach it)
     * options.activateFirst true to start with the first row active
     */
    function menu(element, options = {}) {
        if (!element) return null;
        element._rrMenuKeys?.dispose();
        const doc = root.document;
        const opener = options.opener !== undefined ? options.opener : doc.activeElement;
        const isRow = options.isRow || (row => row.dataset?.menuRow !== undefined || String(row.textContent || '').trim() !== '');
        const isDisabled = options.isDisabled || (row => row.disabled === true || row.getAttribute?.('aria-disabled') === 'true');
        const activate = options.activate || (row => row.click());
        let child = null;
        let active = null;
        let disposed = false;

        const rows = () => Array.from(options.items()).filter(row => visible(row) && isRow(row));
        const enabledRows = () => rows().filter(row => !isDisabled(row));

        const closeChild = () => {
            if (!child) return;
            const closing = child;
            child = null;
            closing.dispose();
        };

        const setActive = (row, { focus = true } = {}) => {
            if (active && active !== row) {
                active.classList?.remove(ACTIVE_CLASS);
            }
            if (row && row !== active) closeChild();
            active = row || null;
            if (!active) return;
            active.classList?.add(ACTIVE_CLASS);
            if (focus) {
                if (!active.hasAttribute?.('tabindex') && active.tabIndex !== 0) active.tabIndex = -1;
                active.focus?.({ preventScroll: true });
                active.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
            }
        };

        const move = (step) => {
            const list = enabledRows();
            if (!list.length) return;
            let index;
            if (step === -Infinity) index = 0;
            else if (step === Infinity) index = list.length - 1;
            else {
                const at = list.indexOf(active);
                index = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
            }
            setActive(list[index]);
        };

        const openSubmenu = () => {
            if (!active || !options.submenu) return false;
            const opened = options.submenu(active);
            if (!opened || !opened.element) return false;
            closeChild();
            child = menu(opened.element, {
                items: opened.items || (() => opened.element.children),
                isRow: opened.isRow || options.isRow,
                isDisabled: opened.isDisabled || options.isDisabled,
                activate: opened.activate || options.activate,
                close: () => { opened.close?.(); },
                submenu: opened.submenu,
                parent: controller,
                opener: active,
                activateFirst: true,
                onDispose: closed => { if (child === closed) child = null; }
            });
            return true;
        };

        const close = () => {
            if (disposed) return;
            closeChild();
            options.close?.();
            dispose();
        };

        const onKeyDown = event => {
            if (disposed) return;
            if (!connected(element)) { dispose(); return; }
            // A submenu layer owns the keys while it is open.
            if (child) return;
            if (event.altKey || event.metaKey || event.ctrlKey) return;
            if (editable(event.target) && !element.contains(event.target)) return;
            switch (event.key) {
                case 'ArrowDown': event.preventDefault(); event.stopPropagation(); move(1); return;
                case 'ArrowUp': event.preventDefault(); event.stopPropagation(); move(-1); return;
                case 'Home': event.preventDefault(); event.stopPropagation(); move(-Infinity); return;
                case 'End': event.preventDefault(); event.stopPropagation(); move(Infinity); return;
                case 'Enter':
                case ' ':
                    event.preventDefault(); event.stopPropagation();
                    if (!active) { move(1); return; }
                    if (openSubmenu()) return;
                    activate(active);
                    return;
                case 'ArrowRight':
                    event.preventDefault(); event.stopPropagation();
                    if (active && openSubmenu()) return;
                    if (!active && options.submenu && enabledRows().length) { move(1); if (openSubmenu()) return; }
                    options.onRight?.(event, controller);
                    return;
                case 'ArrowLeft':
                    event.preventDefault(); event.stopPropagation();
                    if (options.parent) { close(); return; }
                    options.onLeft?.(event, controller);
                    return;
                case 'Escape':
                    event.preventDefault(); event.stopPropagation();
                    close();
                    return;
                case 'Tab':
                    // Tab leaves a menu the way it leaves a native one: the
                    // opener gets focus back first, so the default Tab moves
                    // on from there.
                    close();
                    return;
                default:
            }
        };

        const syncActiveTo = target => {
            if (!target) return;
            const hit = rows().find(candidate => candidate === target || candidate.contains?.(target));
            if (hit && hit !== active && !isDisabled(hit)) setActive(hit, { focus: false });
        };
        const onPointerMove = event => syncActiveTo(event.target);
        // A row focused by Tab or by script becomes the active row, so the
        // next arrow moves from it rather than from the top.
        const onFocusIn = event => syncActiveTo(event.target);

        function dispose() {
            if (disposed) return;
            disposed = true;
            openMenus.delete(controller);
            closeChild();
            doc.removeEventListener('keydown', onKeyDown, true);
            element.removeEventListener('mousemove', onPointerMove);
            element.removeEventListener('focusin', onFocusIn);
            active?.classList?.remove(ACTIVE_CLASS);
            active = null;
            if (element._rrMenuKeys === controller) delete element._rrMenuKeys;
            // Focus that leaves with the menu goes back to the opener; focus an
            // action already moved into a dialog is left there.
            restoreFocus(opener, element);
            options.onDispose?.(controller);
        }

        const controller = {
            element,
            get active() { return active; },
            get child() { return child; },
            setActive,
            move,
            openSubmenu,
            close,
            dispose,
            /** Focus lost with the menu goes back to the opener; an action that moved it keeps it. */
            restoreOpenerFocus: () => restoreFocus(opener, element)
        };
        element._rrMenuKeys = controller;
        openMenus.add(controller);

        doc.addEventListener('keydown', onKeyDown, true);
        element.addEventListener('mousemove', onPointerMove);
        element.addEventListener('focusin', onFocusIn);
        if (options.focus !== false) {
            if (!element.hasAttribute?.('tabindex')) element.tabIndex = -1;
            element.focus?.({ preventScroll: true });
        }
        if (options.activateFirst) move(1);
        return controller;
    }

    // Open menus own the keys; every installed dialog, so a key that reaches nobody finds the one on top.
    const openMenus = new Set();
    const modals = new Set();
    let modalSerial = 0;
    let modalsListening = false;

    /** The overlays still in the page (one removed without dispose() is forgotten). */
    function liveModals() {
        for (const trap of Array.from(modals)) if (!connected(trap.overlay)) modals.delete(trap);
        return Array.from(modals).filter(trap => visible(trap.overlay));
    }

    /**
     * The window a key was pressed in: the editor's, or one of its own windows (the event editor's,
     * the Database's), whose document the main one reaches into.
     */
    function keyWindow(event) {
        const doc = event && event.target && (event.target.nodeType === 9 ? event.target : event.target.ownerDocument);
        const view = doc && doc.defaultView;
        return view && view.document ? { doc: view.document, view } : { doc: root.document, view: root };
    }

    /**
     * The dialog on top: the one under the middle of the window, where the page can say; else the one
     * entered last. Null when something that is not one of these dialogs lies on top.
     */
    function topModal(event) {
        const { doc, view } = keyWindow(event);
        const open = liveModals().filter(trap => (trap.overlay.ownerDocument || root.document) === doc);
        if (!open.length) return null;
        if (typeof doc.elementFromPoint === 'function' && view.innerWidth > 0) {
            const hit = doc.elementFromPoint(view.innerWidth / 2, view.innerHeight / 2);
            if (hit) return open.filter(trap => trap.overlay.contains(hit)).sort((a, b) => b.serial - a.serial)[0] || null;
        }
        return open.sort((a, b) => b.serial - a.serial)[0];
    }

    /** A key whose target is no control at all: the page itself, or an element a redraw took away. */
    function strayKey(event, top) {
        const doc = keyWindow(event).doc, target = event.target;
        if (!target || target === doc || target === doc.body || target === doc.documentElement || !connected(target)) return true;
        // Focus left behind in a dialog under the one on top.
        for (const trap of modals) if (trap !== top && trap.overlay.contains(target)) return true;
        return false;
    }

    /** Hand the key to the element as if it had been pressed there, for an owner listening on its dialog. */
    function replayKey(element, event) {
        const Key = root.KeyboardEvent;
        if (typeof Key !== 'function' || typeof element.dispatchEvent !== 'function') return false;
        const copy = new Key('keydown', { key: event.key, code: event.code, shiftKey: !!event.shiftKey, bubbles: true, cancelable: true });
        element.dispatchEvent(copy);
        return copy.defaultPrevented;
    }

    /**
     * An event command's dialog with no keyboard of its own lying on top (a layer in <body> classed
     * `…-editor-modal`, with a `.rr-modal-close` button): Escape presses that button, wherever the focus
     * was left (in it, on the page, on the command list underneath). Returns whether it did. The editors
     * those dialogs open from are not such layers: Escape never closes one of them from here.
     */
    function closeUnkeyedDialog(event) {
        const { doc, view } = keyWindow(event);
        if (typeof doc.elementFromPoint !== 'function' || !(view.innerWidth > 0)) return false;
        let layer = doc.elementFromPoint(view.innerWidth / 2, view.innerHeight / 2);
        while (layer && layer.parentElement && layer.parentElement !== doc.body) layer = layer.parentElement;
        if (!layer || layer.parentElement !== doc.body) return false;
        if (!String(layer.className || '').split(/\s+/).some(name => /-editor-modal$/.test(name))) return false;
        for (const trap of modals) if (trap.overlay === layer) return false;
        const close = Array.from(layer.querySelectorAll('.rr-modal-close')).find(visible);
        if (!close) return false;
        // A key pressed in a control that has since gone was somebody else's, and they have answered it.
        const target = event.target;
        const page = !target || target === doc || target === doc.body || target === doc.documentElement;
        if (!page && (!connected(target) || !visible(target))) return false;
        close.click();
        return true;
    }

    // Always listening, since such a dialog registers nothing, and on the window: a menu, a popup, a dialog
    // with keys of its own and every owner listening on the document have had the key first.
    function onUnkeyedEscape(event) {
        if (event.key !== 'Escape' || event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
        for (const controller of Array.from(openMenus)) if (!connected(controller.element)) openMenus.delete(controller);
        if (openMenus.size || topModal(event)) return;
        if (closeUnkeyedDialog(event)) event.preventDefault();
    }
    if (typeof root.addEventListener === 'function') root.addEventListener('keydown', onUnkeyedEscape);

    // Bubble phase: a menu, a popup or an owner listening on the document has had the key first, and
    // one that took it (preventDefault, or stopPropagation while capturing) is left to it.
    function onStrayModalKey(event) {
        if (event.defaultPrevented || (event.key !== 'Escape' && event.key !== 'Tab')) return;
        if (event.altKey || event.metaKey || event.ctrlKey) return;
        for (const controller of Array.from(openMenus)) if (!connected(controller.element)) openMenus.delete(controller);
        if (openMenus.size) return;
        const top = topModal(event);
        if (!top || top.overlay.contains(event.target) || !strayKey(event, top)) return;
        if (event.key === 'Escape' && !top.options.onEscape) {
            if (replayKey(top.container(), event)) event.preventDefault();
            return;
        }
        top.onKeyDown(event);
    }

    /** The visible controls Tab can reach inside `container`, in DOM order. */
    function focusable(container) {
        return Array.from(container.querySelectorAll(FOCUSABLE)).filter(element => tabbable(element) && visible(element));
    }

    /**
     * Keyboard for one dialog overlay. Installed once per overlay; a dialog that
     * is shown again calls enter() each time and leave() when it closes.
     *
     * options.onEscape(event)  close the dialog; when absent Escape is left to
     *                          the owner's own handler
     * options.initialFocus     element, selector or function for enter()
     */
    function modal(overlay, options = {}) {
        if (!overlay) return null;
        if (overlay._rrModalKeys) {
            overlay._rrModalKeys.options = { ...overlay._rrModalKeys.options, ...options };
            overlay._rrModalKeys.register();
            return overlay._rrModalKeys;
        }
        const doc = root.document;
        const state = { options, opener: null };

        const container = () => state.options.container?.() || overlay;
        const onKeyDown = event => {
            if (event.key === 'Escape' && state.options.onEscape) {
                if (event.defaultPrevented) return;
                event.preventDefault();
                event.stopPropagation();
                // An event command's dialog opened from it lies on top, the focus left behind on its list: the key closes that dialog.
                if (closeUnkeyedDialog(event)) return;
                state.options.onEscape(event);
                return;
            }
            if (event.key !== 'Tab') return;
            const list = focusable(container());
            if (!list.length) { event.preventDefault(); return; }
            const first = list[0];
            const last = list[list.length - 1];
            const current = doc.activeElement;
            const inside = list.includes(current);
            if (event.shiftKey) {
                if (!inside || current === first) { event.preventDefault(); last.focus(); }
            } else if (!inside || current === last) {
                event.preventDefault(); first.focus();
            }
        };
        overlay.addEventListener('keydown', onKeyDown);
        const entry = { overlay, serial: ++modalSerial, onKeyDown, container, get options() { return state.options; } };
        const register = () => {
            liveModals();
            entry.serial = ++modalSerial;
            modals.add(entry);
            if (!modalsListening) { doc.addEventListener('keydown', onStrayModalKey); modalsListening = true; }
        };
        register();

        const resolveInitial = () => {
            const wanted = state.options.initialFocus;
            const target = typeof wanted === 'function' ? wanted()
                : typeof wanted === 'string' ? container().querySelector(wanted)
                : wanted;
            if (target && visible(target)) return target;
            const list = focusable(container());
            // Skip a leading close (×) button when a real control follows it.
            const control = list.find(el => !hasClass(el, 'rr-modal-close') && !hasClass(el, 'modal-close') && !hasClass(el, 'close-btn'));
            return control || list[0] || null;
        };

        const trap = {
            get options() { return state.options; },
            set options(value) { state.options = value; },
            /** Remember the opener and move focus into the dialog. */
            enter(initial) {
                register();
                const active = doc.activeElement;
                if (active && !overlay.contains(active)) state.opener = active;
                const target = initial || resolveInitial();
                if (target) target.focus?.({ preventScroll: true });
                else { if (!overlay.hasAttribute?.('tabindex')) overlay.tabIndex = -1; overlay.focus?.(); }
                // Refused while the dialog is hidden (its own window still being made): refocus() gives it once shown.
                const focused = target || overlay;
                state.refused = (focused.ownerDocument || doc).activeElement !== focused;
                return target;
            },
            /** The focus enter() was refused, given now, the opener kept; null when enter() was not refused. */
            refocus() {
                if (!state.refused) return null;
                state.refused = false;
                const target = resolveInitial();
                if (target) target.focus?.({ preventScroll: true });
                return target;
            },
            /** Give focus back to the opener if the dialog still holds it. */
            leave() {
                state.refused = false;
                const opener = state.opener;
                state.opener = null;
                if (opener) restoreFocus(opener, overlay);
            },
            get opener() { return state.opener; },
            /** Shown again, or put back in the page: on top of the dialogs entered before it. */
            register,
            dispose() {
                overlay.removeEventListener('keydown', onKeyDown);
                delete overlay._rrModalKeys;
                modals.delete(entry);
                if (!modals.size && modalsListening) { doc.removeEventListener('keydown', onStrayModalKey); modalsListening = false; }
            }
        };
        overlay._rrModalKeys = trap;
        return trap;
    }

    /**
     * Roving focus for a strip of tab buttons or a vertical category list:
     * arrows move and select, Home/End jump, the selected item is the one Tab
     * stop. `select(el)` performs the owner's own click behaviour.
     */
    function roving(container, options) {
        container._rrRovingKeys?.();
        const horizontal = options.orientation !== 'vertical';
        const items = () => Array.from(options.items()).filter(visible);
        const current = () => items().find(item => options.isSelected(item)) || null;
        // The Tab stop is assigned over every item, hidden ones included, so a
        // list built while its dialog is still closed is ready when it opens.
        const sync = () => {
            const all = Array.from(options.items());
            const selected = all.find(item => options.isSelected(item)) || all[0] || null;
            for (const item of all) item.tabIndex = item === selected ? 0 : -1;
        };
        const onKeyDown = event => {
            if (event.altKey || event.metaKey || event.ctrlKey) return;
            if (editable(event.target)) return;
            const prev = horizontal ? 'ArrowLeft' : 'ArrowUp';
            const next = horizontal ? 'ArrowRight' : 'ArrowDown';
            const step = { [prev]: -1, [next]: 1, Home: -Infinity, End: Infinity }[event.key];
            if (step === undefined) {
                if ((event.key === 'Enter' || event.key === ' ') && event.target?.closest) {
                    const item = items().find(candidate => candidate === event.target || candidate.contains?.(event.target));
                    // A native button or link activates through its own click;
                    // a plain element is selected here instead.
                    if (item && !/^(BUTTON|A|INPUT)$/.test(item.tagName || '')) {
                        event.preventDefault(); options.select(item, event); sync(); (current() || item).focus?.({ preventScroll: true });
                    }
                }
                return;
            }
            const list = items();
            if (!list.length) return;
            event.preventDefault();
            event.stopPropagation();
            const at = list.indexOf(current());
            const index = step === -Infinity ? 0 : step === Infinity ? list.length - 1
                : at < 0 ? 0 : Math.max(0, Math.min(list.length - 1, at + step));
            options.select(list[index], event);
            sync();
            (current() || list[index]).focus?.({ preventScroll: true });
        };
        container.addEventListener('keydown', onKeyDown);
        sync();
        container._rrRovingKeys = () => {
            container.removeEventListener('keydown', onKeyDown);
            delete container._rrRovingKeys;
            delete container._rrRoving;
        };
        container._rrRoving = { sync, dispose: container._rrRovingKeys };
        return container._rrRoving;
    }

    /**
     * Shift+Tab in a code field removes one level of indentation instead of
     * inserting one. Tab keeps indenting, as the field is for code.
     */
    function outdentLine(field, width = 4) {
        const start = field.selectionStart;
        const end = field.selectionEnd;
        const value = field.value;
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const leading = value.slice(lineStart).match(/^[ \t]*/)[0];
        if (!leading) return false;
        const remove = leading[0] === '\t' ? 1 : Math.min(width, leading.length);
        field.value = value.slice(0, lineStart) + value.slice(lineStart + remove);
        field.selectionStart = Math.max(lineStart, start - remove);
        field.selectionEnd = Math.max(lineStart, end - remove);
        return true;
    }

    const api = { ACTIVE_CLASS, FOCUSABLE, menu, modal, roving, focusable, restoreFocus, outdentLine };
    root.RRKeyboardNavigation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
