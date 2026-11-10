/**
 * HoverHelp - a themed hover explanation for anything carrying `data-rr-help`.
 *
 * Why not `title`
 * ---------------
 * The OS tooltip is unstyled, cannot be themed, cannot hold a second dimmer
 * line, and cannot be screenshotted - it is drawn outside the page, so no test
 * and no CDP capture can ever see it. This draws in the page instead, from the
 * same theme variables as everything else, and can therefore be verified.
 *
 * How it behaves
 * --------------
 * Rest on an element for DELAY_MS and a box appears near the pointer; move off
 * and it goes. Anything that means the pointer has moved on - pressing a
 * button, scrolling, typing, the element leaving the DOM - hides it at once, so
 * it can never be left stranded over the UI.
 *
 * A help string may carry a second line after a newline. That line is drawn
 * dimmer, which is where the "Changed by plugins:" note goes.
 *
 * Delegated from `document`, so rows rendered later - every database dialog
 * rebuilds its contents - are covered without re-attaching anything.
 */
(function(root) {
    'use strict';

    if (typeof document === 'undefined') return;
    if (root.__rrHoverHelpInstalled) return;
    root.__rrHoverHelpInstalled = true;

    const ATTRIBUTE = 'data-rr-help';
    const DELAY_MS = 550;
    const GAP = 14;
    const MARGIN = 8;

    let box = null;
    let timer = null;
    let target = null;
    let pointer = { x: 0, y: 0 };

    /** The box in the document `doc` (each window has its own: the Database and the Event Editor are pop-outs). */
    function ensureBox(doc) {
        if (box && box.isConnected && box.ownerDocument === doc) return box;
        if (box && box.isConnected) box.remove();
        box = doc.createElement('div');
        box.className = 'rr-hover-help';
        box.setAttribute('role', 'tooltip');
        box.hidden = true;
        doc.body.appendChild(box);
        return box;
    }

    function hide() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        target = null;
        if (box) box.hidden = true;
    }

    /** Place the box near the pointer, kept whole inside its own window's viewport. */
    function position(el) {
        const view = el.ownerDocument.defaultView || window;
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        let x = pointer.x + GAP;
        let y = pointer.y + GAP;
        if (x + width > view.innerWidth - MARGIN) x = Math.max(MARGIN, pointer.x - GAP - width);
        if (y + height > view.innerHeight - MARGIN) y = Math.max(MARGIN, pointer.y - GAP - height);
        el.style.left = `${Math.round(x)}px`;
        el.style.top = `${Math.round(y)}px`;
    }

    function show(text, doc) {
        const el = ensureBox(doc);
        el.textContent = '';
        const [first, ...rest] = String(text).split('\n');
        const main = doc.createElement('div');
        main.className = 'rr-hover-help-text';
        main.textContent = first;
        el.appendChild(main);
        for (const line of rest) {
            if (!line) continue;
            const note = doc.createElement('div');
            note.className = 'rr-hover-help-note';
            note.textContent = line;
            el.appendChild(note);
        }
        // Measured only once it is laid out, so it is shown before being placed.
        el.hidden = false;
        el.style.left = '-9999px';
        el.style.top = '-9999px';
        position(el);
    }

    /**
     * Listens in one window's document. The main window's at once; each pop-out's as it attaches: the bridge that
     * carries the main document's listeners to a pop-out does not carry `mouseover` or `mouseout`, so in the Database
     * window (always its own window under NW.js) no explanation ever appeared.
     */
    function install(doc, view) {
        const over = event => {
            const found = event.target && event.target.closest
                ? event.target.closest(`[${ATTRIBUTE}]`)
                : null;
            if (found === target) return;
            hide();
            if (!found) return;
            const text = found.getAttribute(ATTRIBUTE);
            if (!text) return;
            target = found;
            timer = setTimeout(() => {
                timer = null;
                // The row can be re-rendered, or the pointer can leave, during the wait.
                if (target !== found || !found.isConnected) return hide();
                show(text, found.ownerDocument || doc);
            }, DELAY_MS);
        };
        const move = event => {
            pointer = { x: event.clientX, y: event.clientY };
            if (target && !target.isConnected) hide();
        };
        const out = event => {
            if (!target) return;
            // Only the pointer leaving THIS element counts. The listener is on
            // document, so it also hears every unrelated mouseout in the editor -
            // acting on those hides help the pointer is still resting on.
            if (!target.contains(event.target)) return;
            const to = event.relatedTarget;
            if (to && target.contains(to)) return;
            hide();
        };
        const names = ['mousedown', 'wheel', 'keydown', 'scroll'];
        doc.addEventListener('mouseover', over, true);
        doc.addEventListener('mousemove', move, true);
        doc.addEventListener('mouseout', out, true);
        for (const name of names) doc.addEventListener(name, hide, true);
        if (view) view.addEventListener('blur', hide);
        return () => {
            hide();
            doc.removeEventListener('mouseover', over, true);
            doc.removeEventListener('mousemove', move, true);
            doc.removeEventListener('mouseout', out, true);
            for (const name of names) doc.removeEventListener(name, hide, true);
            if (view) view.removeEventListener('blur', hide);
        };
    }

    install(document, root);
    const bridge = () => {
        if (!root.RRPopoutBridge || !root.RRPopoutBridge.onAttach || root.__rrHoverHelpBridged) return;
        root.__rrHoverHelpBridged = true;
        root.RRPopoutBridge.onAttach(child => (child && child.document ? install(child.document, child) : null));
    };
    bridge();
    // The bridge's script may load after this one.
    if (!root.__rrHoverHelpBridged && root.addEventListener) root.addEventListener('load', bridge, { once: true });

    root.RRHoverHelp = { hide, ATTRIBUTE, DELAY_MS };
})(typeof window !== 'undefined' ? window : globalThis);
