/**
 * PopoutBridge - lets editor UI built for the main window live in other OS windows (another
 * monitor) unchanged: the event editor and the Database each in a window of their own. Their
 * code finds its fields through the main `document`, opens dialogs on `document.body`, and hears
 * keys through listeners on `document` and `window`. While pop-outs are attached:
 *
 *   - getElementById / querySelector / querySelectorAll on the main document also search them
 *     (the main document first, then the one with the focus, then the rest);
 *   - document and window listeners for input events also hear them (recorded from load, so the
 *     ones added before a pop-out opened are there too);
 *   - document.activeElement is the focused pop-out's focused element;
 *   - an element appended to the main body while a pop-out has the focus (a dialog, a picker, a
 *     menu) goes to its body instead, so a dialog opens where the person is working.
 *
 * Load this before any other script that adds listeners.
 *
 *   RRPopoutBridge.attach(childWindow)        start bridging to that window
 *   RRPopoutBridge.detach(childWindow)        stop bridging to it (every one, with no argument)
 *   RRPopoutBridge.inPopout(task, childWindow) run task with that pop-out taken as the window in use
 *   RRPopoutBridge.active()                   the window last attached, or null
 *   RRPopoutBridge.windows()                  every attached window
 *   RRPopoutBridge.setAsleep(childWindow, on) hidden: it is never the window in use
 *   RRPopoutBridge.bringToWindowInUse(el)     move a dialog kept in index.html to the window in use
 */
(function(root) {
    'use strict';
    if (typeof document === 'undefined' || root.RRPopoutBridge) return;

    const INPUT_EVENTS = new Set(['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'pointermove', 'pointercancel',
        'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu', 'wheel', 'focusin', 'focusout',
        'input', 'change', 'copy', 'cut', 'paste', 'dragover', 'drop']);
    const recorded = { document: [], window: [] };
    // Work other modules do for each pop-out (the select shim themes its dropdowns): run on attach,
    // their returned cleanups on detach.
    const attachHooks = [];
    // Each attached window, in the order attached, with the cleanups its attach hooks returned.
    const children = new Map();

    function record(kind, target) {
        const add = target.addEventListener, remove = target.removeEventListener;
        target.addEventListener = function(type, listener, options) {
            // A library's own listeners (PIXI's pointer tracking for the map, three's controls) hear
            // only the window they were made for: relayed, the editor window's moves and clicks
            // moved the map's tile cursor and clicked the map.
            if (INPUT_EVENTS.has(type) && listener && !fromLibrary()) {
                recorded[kind].push({ type, listener, options });
                for (const child of children.keys()) mirrorTarget(kind, child).addEventListener(type, listener, options);
            }
            return add.call(this, type, listener, options);
        };
        target.removeEventListener = function(type, listener, options) {
            if (INPUT_EVENTS.has(type)) {
                const list = recorded[kind];
                const at = list.findIndex(entry => entry.type === type && entry.listener === listener && capture(entry.options) === capture(options));
                if (at >= 0) list.splice(at, 1);
                for (const child of children.keys()) {
                    try { mirrorTarget(kind, child).removeEventListener(type, listener, options); } catch (error) { /* closed */ }
                }
            }
            return remove.call(this, type, listener, options);
        };
    }
    const capture = options => !!(typeof options === 'boolean' ? options : options && options.capture);
    // The registering code is a bundled library when the frame that called addEventListener is one:
    // a file under node_modules or libs, or code injected as script text (the editor loads PIXI so,
    // and its frames read "<anonymous>"). The editor's own scripts all load from files.
    const LIBRARY = /[\\/](node_modules|libs)[\\/]|<anonymous>:\d/;
    function fromLibrary() {
        const stack = String(new Error().stack || '').split('\n');
        // [0] "Error", [1] this function, [2] the addEventListener wrapper, [3] its caller.
        return LIBRARY.test(stack[3] || '');
    }
    const mirrorTarget = (kind, child) => (kind === 'document' ? child.document : child);
    record('document', document);
    record('window', root);

    const native = {
        getElementById: document.getElementById,
        querySelector: document.querySelector,
        querySelectorAll: document.querySelectorAll
    };
    const nativeActive = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement');

    // While set, that pop-out counts as the window being worked in, whatever has the focus: a
    // question its own frame raises (its close button) opens there.
    const preferred = [];
    // Hidden pop-outs (the event editor between events): never the window in use, whatever hasFocus says.
    const asleep = new Set();

    /** The pop-out being worked in: the one a task named, else the one with the focus; or null. */
    function focusedChild() {
        for (let i = preferred.length - 1; i >= 0; i--) if (children.has(preferred[i])) return preferred[i];
        for (const child of children.keys()) {
            if (asleep.has(child)) continue;
            try { if (child.document.hasFocus() && child.document.visibilityState !== 'hidden') return child; } catch (error) { /* closed */ }
        }
        return null;
    }

    function setAsleep(childWindow, on) {
        if (on) asleep.add(childWindow); else asleep.delete(childWindow);
    }

    /**
     * A dialog that lives in index.html (the image picker, the audio player) opened from a pop-out:
     * moved into the window in use, so it opens in front of the person; back to the editor window
     * when that is the one in use.
     */
    function bringToWindowInUse(element) {
        if (!element) return element;
        const child = focusedChild();
        const body = child ? child.document.body : document.body;
        if (body && element.ownerDocument !== body.ownerDocument) {
            if (child) child.document.body.appendChild(element);
            else (body.__rrPopout_appendChild ? body.__rrPopout_appendChild.original : body.appendChild).call(body, element);
        }
        return element;
    }

    /** The attached documents, the focused one first. */
    function childDocuments() {
        const first = focusedChild();
        const list = first ? [first] : [];
        for (const child of children.keys()) if (child !== first) list.push(child);
        const docs = [];
        for (const child of list) { try { if (child.document) docs.push(child.document); } catch (error) { /* closed */ } }
        return docs;
    }

    /** Run `task` (sync or async) with `childWindow` (else the last attached) taken as the window being worked in. */
    async function inPopout(task, childWindow = active()) {
        preferred.push(childWindow);
        try { return await task(); } finally { preferred.splice(preferred.lastIndexOf(childWindow), 1); }
    }

    function patchDocument() {
        document.getElementById = function(id) {
            const own = native.getElementById.call(document, id);
            if (own) return own;
            for (const doc of childDocuments()) { const found = doc.getElementById(id); if (found) return found; }
            return null;
        };
        document.querySelector = function(selector) {
            const own = native.querySelector.call(document, selector);
            if (own) return own;
            for (const doc of childDocuments()) { const found = doc.querySelector(selector); if (found) return found; }
            return null;
        };
        document.querySelectorAll = function(selector) {
            let all = Array.from(native.querySelectorAll.call(document, selector));
            for (const doc of childDocuments()) all = all.concat(Array.from(doc.querySelectorAll(selector)));
            return all;
        };
        Object.defineProperty(document, 'activeElement', {
            configurable: true,
            get() {
                const child = focusedChild();
                return child ? child.document.activeElement : nativeActive.get.call(document);
            }
        });
        const body = document.body;
        for (const method of ['appendChild', 'append']) {
            const original = body[method];
            body['__rrPopout_' + method] = { original, own: Object.prototype.hasOwnProperty.call(body, method) };
            body[method] = function(...nodes) {
                const child = focusedChild();
                if (child) return child.document.body[method](...nodes);
                return original.apply(body, nodes);
            };
        }
    }

    function unpatchDocument() {
        delete document.getElementById;
        delete document.querySelector;
        delete document.querySelectorAll;
        delete document.activeElement;
        const body = document.body;
        for (const method of ['appendChild', 'append']) {
            const saved = body['__rrPopout_' + method];
            if (!saved) continue;
            if (saved.own) body[method] = saved.original; else delete body[method];
            delete body['__rrPopout_' + method];
        }
    }

    function attach(childWindow) {
        if (!childWindow || children.has(childWindow)) return;
        const cleanups = [];
        children.set(childWindow, cleanups);
        for (const kind of ['document', 'window']) {
            for (const { type, listener, options } of recorded[kind]) mirrorTarget(kind, childWindow).addEventListener(type, listener, options);
        }
        if (children.size === 1) patchDocument();
        for (const hook of attachHooks) {
            try {
                const cleanup = hook(childWindow);
                if (typeof cleanup === 'function') cleanups.push(cleanup);
            } catch (error) { console.warn('PopoutBridge: an attach hook failed', error); }
        }
    }

    /** Run `hook(childWindow)` for each pop-out as it attaches (and now, for those already attached); a function it returns runs on its detach. */
    function onAttach(hook) {
        attachHooks.push(hook);
        for (const [child, cleanups] of children) {
            const cleanup = hook(child);
            if (typeof cleanup === 'function') cleanups.push(cleanup);
        }
    }

    function detach(childWindow) {
        if (childWindow === undefined) { for (const child of Array.from(children.keys())) detach(child); return; }
        const cleanups = children.get(childWindow);
        if (!cleanups) return;
        for (const cleanup of cleanups) { try { cleanup(); } catch (error) { /* the window is gone */ } }
        try {
            for (const kind of ['document', 'window']) {
                for (const { type, listener, options } of recorded[kind]) mirrorTarget(kind, childWindow).removeEventListener(type, listener, options);
            }
        } catch (error) { /* the window is already gone */ }
        children.delete(childWindow);
        asleep.delete(childWindow);
        if (!children.size) unpatchDocument();
    }

    /** The attached window last attached, or null. */
    function active() {
        let last = null;
        for (const child of children.keys()) last = child;
        return last;
    }

    /** Copy the theme and resolve once its stylesheets have loaded, before a new window shows. */
    function dressLike(childDoc) {
        const loading = [];
        for (const link of native.querySelectorAll.call(document, 'link[rel="stylesheet"], style')) {
            const copy = link.cloneNode(true);
            if (copy.tagName === 'LINK' && !copy.disabled) {
                loading.push(new Promise(resolve => {
                    copy.addEventListener('load', resolve, { once: true });
                    copy.addEventListener('error', resolve, { once: true });
                }));
            }
            childDoc.head.appendChild(copy);
        }
        for (const name of ['data-theme', 'lang', 'dir']) {
            const value = document.documentElement.getAttribute(name);
            if (value) childDoc.documentElement.setAttribute(name, value);
        }
        // The theme follows the main window while the pop-out is open.
        if (typeof MutationObserver === 'function') {
            const observer = new MutationObserver(() => {
                const theme = document.documentElement.getAttribute('data-theme');
                if (theme) childDoc.documentElement.setAttribute('data-theme', theme);
                else childDoc.documentElement.removeAttribute('data-theme');
            });
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
            childDoc.defaultView?.addEventListener('unload', () => observer.disconnect(), { once: true });
        }
        return Promise.all(loading);
    }

    root.RRPopoutBridge = { attach, detach, dressLike, inPopout, onAttach, active, setAsleep, bringToWindowInUse, windows: () => Array.from(children.keys()), recordedCount: () => recorded.document.length + recorded.window.length };
})(typeof window !== 'undefined' ? window : globalThis);
