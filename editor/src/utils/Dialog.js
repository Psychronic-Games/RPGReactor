/**
 * RRDialog - the editor's own alert, confirm and prompt.
 *
 * The browser's boxes ignore the theme and name their buttons in the system's
 * language. These are built from the editor's modal classes and buttons, and
 * answer through a promise instead of blocking the page:
 *
 *   await RRDialog.confirm(message, { title, ok, cancel, danger })  -> boolean
 *   await RRDialog.alert(message, { title, ok, kind })              -> undefined
 *   await RRDialog.prompt(message, { title, value, placeholder, ok, cancel, validate })
 *                                                                   -> string | null
 *
 * confirm: false on Cancel, Escape, the close button or a click beside the
 *          dialog. `danger` paints the action button in the danger style and
 *          starts the focus on Cancel, so Enter never destroys anything.
 *          The key press or double click that asked for the dialog never
 *          answers it.
 * alert:   kind is "info" (default), "warning" or "error".
 * prompt:  null when cancelled. validate(text) returns a message to show under
 *          the field (the dialog stays open) or "" when the text is acceptable.
 *          A click beside a prompt does not close it: what was typed is kept.
 *
 * One dialog shows at a time: a second request waits for the first to be
 * answered, so two never overlap and none loses its answer. The dialog sits
 * above every modal, picker and popup of the editor, takes every key while it
 * is up (no shortcut behind it runs: Reload, Save and the rest wait for the
 * answer; only full screen and the developer tools stay available), keeps Tab
 * inside itself and gives the focus back to whatever had it.
 *
 * UIManager.showAlert / showConfirm / openThemedDialog are this same dialog,
 * through open().
 */
(function (root) {
    'use strict';

    const translate = text => (root.I18n && typeof root.I18n.tText === 'function') ? root.I18n.tText(text) : text;
    const KIND_TITLES = { info: 'Notice', warning: 'Warning', error: 'Error' };

    // Requests in the order they were made; `current` is the one on screen.
    const waiting = [];
    let current = null;
    // The key handlers of the dialog on screen ({ keydown, keypress, keyup }), or null.
    let onScreen = null;

    // One capturing listener per key event for the life of the page, added when this file loads and
    // so ahead of every other listener on the window. The application's shortcuts listen there too,
    // capturing: a listener added when a dialog shows would hear each key after them.
    if (typeof root.addEventListener === 'function') {
        for (const type of ['keydown', 'keypress', 'keyup']) {
            root.addEventListener(type, event => { if (onScreen) onScreen[type](event); }, true);
        }
    }

    /** The application's shortcuts on keys the browser acts on by itself (reload the page, save the page). */
    const applicationKey = event => event.key === 'F5'
        || ((event.ctrlKey || event.metaKey) && /^[nosr]$/i.test(String(event.key)));

    /**
     * A native modal <dialog> draws above every z-index and makes the rest of
     * the page inert: a question asked from one goes inside it, or it could
     * neither be seen nor answered.
     */
    function hostFor(doc) {
        const open = typeof doc.querySelectorAll === 'function' ? Array.from(doc.querySelectorAll('dialog[open]')) : [];
        for (let index = open.length - 1; index >= 0; index--) {
            const dialog = open[index];
            try { if (typeof dialog.matches === 'function' && dialog.matches(':modal')) return dialog; } catch (error) { /* an engine without :modal */ }
        }
        return doc.body;
    }

    /** Build one dialog, show it and call done({ ok, value }) once with its answer. */
    function show(spec, done) {
        const doc = root.document;
        const keys = root.RRKeyboardNavigation;
        const hasCancel = !!spec.cancelLabel;
        const kind = spec.danger ? 'danger' : (spec.kind || 'info');
        // A question whose default answer is no: the focus starts on Cancel and a stray Enter cancels.
        const safe = hasCancel && (!!spec.danger || spec.focus === 'cancel');

        const overlay = doc.createElement('div');
        overlay.id = 'rr-themed-dialog';
        overlay.className = 'rr-modal-overlay rr-dialog-overlay';

        const modal = doc.createElement('div');
        modal.className = `rr-modal rr-dialog rr-dialog-${kind}`;
        modal.setAttribute('role', spec.input ? 'dialog' : 'alertdialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'rr-themed-dialog-title');
        modal.setAttribute('aria-describedby', 'rr-themed-dialog-message');

        const header = doc.createElement('div');
        header.className = 'rr-modal-header';
        const titleEl = doc.createElement('div');
        titleEl.id = 'rr-themed-dialog-title';
        titleEl.className = 'rr-modal-title';
        titleEl.textContent = spec.title || '';
        const closeButton = doc.createElement('button');
        closeButton.type = 'button';
        closeButton.id = 'rr-themed-dialog-close';
        closeButton.className = 'rr-modal-close';
        closeButton.setAttribute('aria-label', hasCancel ? spec.cancelLabel : translate('Close'));
        closeButton.textContent = '×';
        header.append(titleEl, closeButton);

        const body = doc.createElement('div');
        body.className = 'rr-modal-body';
        if (kind !== 'info') {
            const icon = doc.createElement('div');
            icon.className = 'rr-dialog-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = '!';
            body.appendChild(icon);
        }
        const text = doc.createElement('div');
        text.className = 'rr-dialog-text';
        const messageEl = doc.createElement(spec.input ? 'label' : 'div');
        messageEl.id = 'rr-themed-dialog-message';
        messageEl.className = 'rr-dialog-message';
        messageEl.textContent = String(spec.message == null ? '' : spec.message);
        text.appendChild(messageEl);

        let input = null;
        let errorEl = null;
        if (spec.input) {
            input = doc.createElement('input');
            input.type = 'text';
            input.id = 'rr-themed-dialog-input';
            input.className = 'rr-input rr-dialog-input';
            input.value = String(spec.value == null ? '' : spec.value);
            if (spec.placeholder) input.placeholder = String(spec.placeholder);
            input.setAttribute('autocomplete', 'off');
            input.setAttribute('spellcheck', 'false');
            input.setAttribute('aria-describedby', 'rr-themed-dialog-error');
            messageEl.setAttribute('for', 'rr-themed-dialog-input');
            errorEl = doc.createElement('div');
            errorEl.id = 'rr-themed-dialog-error';
            errorEl.className = 'rr-dialog-problem';
            errorEl.setAttribute('role', 'alert');
            text.append(input, errorEl);
        }
        body.appendChild(text);

        const footer = doc.createElement('div');
        footer.className = 'rr-modal-footer';
        let cancelButton = null;
        if (hasCancel) {
            cancelButton = doc.createElement('button');
            cancelButton.id = 'rr-themed-dialog-cancel';
            cancelButton.type = 'button';
            cancelButton.className = 'rr-btn-secondary';
            cancelButton.textContent = spec.cancelLabel;
            footer.appendChild(cancelButton);
        }
        const okButton = doc.createElement('button');
        okButton.id = 'rr-themed-dialog-ok';
        okButton.type = 'button';
        okButton.className = spec.danger ? 'rr-button-danger' : 'rr-button-primary';
        okButton.textContent = spec.okLabel || translate('OK');
        footer.appendChild(okButton);
        modal.append(header, body, footer);
        overlay.appendChild(modal);

        let settled = false;
        let trap = null;
        let opener = null;

        // Everything show() put in the page, taken out again: when the dialog is answered, and when
        // showing it failed part way.
        const dismantle = () => {
            if (onScreen === handlers) onScreen = null;
            overlay.remove();
            const keyboard = trap;
            trap = null;
            if (keyboard) {
                keyboard.leave();
                keyboard.dispose();
            } else if (opener && opener.isConnected !== false && typeof opener.focus === 'function') {
                opener.focus();
            }
        };
        const finish = answer => {
            if (settled) return;
            settled = true;
            dismantle();
            done(answer);
        };
        const cancel = () => finish({ ok: false, value: null });
        const accept = () => {
            if (!input) { finish({ ok: true, value: null }); return; }
            const problem = typeof spec.validate === 'function' ? String(spec.validate(input.value) || '') : '';
            if (problem) {
                errorEl.textContent = problem;
                input.setAttribute('aria-invalid', 'true');
                input.focus();
                return;
            }
            finish({ ok: true, value: input.value });
        };

        // The key press that asked for the dialog can still be on its way when the dialog takes the
        // focus: its keypress would click the newly focused button, or type into the field. Keys
        // count from the first one that goes down or comes up with the dialog on screen.
        let fresh = false;
        const handlers = {
            keydown(event) {
                if (!event.repeat) fresh = true;
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    // A held key (the Escape that brought the question up, still down) answers nothing.
                    if (!event.repeat) cancel();
                    return;
                }
                // Tab reaches the overlay, where the focus trap turns it round; full screen and the
                // developer tools stay available.
                if (event.key === 'Tab' || event.key === 'F11' || event.key === 'F12') return;
                event.stopImmediatePropagation();
                // Reload, New, Open, Save and Playtest wait for the answer, and the browser does not
                // reload or save the page in their place.
                if (applicationKey(event)) { event.preventDefault(); return; }
                if (event.key !== 'Enter') return;
                // An Enter that ends an input-method composition belongs to the composition.
                if (event.isComposing || event.keyCode === 229) return;
                // A held Enter answers nothing either: the focused button is not clicked.
                if (event.repeat) { event.preventDefault(); return; }
                const target = event.target;
                // A focused button is pressed by the browser's own click.
                if (target === okButton || target === cancelButton || target === closeButton) return;
                event.preventDefault();
                if (safe) cancel(); else accept();
            },
            keypress(event) {
                if (fresh) return;
                event.preventDefault();
                event.stopImmediatePropagation();
            },
            // Not stopped: whatever saw the key go down behind the dialog sees it come up.
            keyup() { fresh = true; }
        };

        // The dialog appears under the pointer of whoever asked: the second click of a double click
        // on what asked lands on the backdrop, on the dialog's text or on one of its buttons. Clicks
        // count from a click sequence that began with the dialog on screen; a click made with a key
        // (detail 0) always counts.
        let ownClicks = false;
        const ownClick = event => !(event && event.detail > 1) || ownClicks;
        closeButton.addEventListener('click', event => { if (ownClick(event)) cancel(); });
        if (cancelButton) cancelButton.addEventListener('click', event => { if (ownClick(event)) cancel(); });
        okButton.addEventListener('click', event => { if (ownClick(event)) accept(); });
        if (input) {
            input.addEventListener('input', () => {
                errorEl.textContent = '';
                input.setAttribute('aria-invalid', 'false');
            });
        }
        // A question closes from a click beside it: pressed and released on the backdrop. A prompt
        // holds typed text and never closes this way.
        let pressedBeside = false;
        overlay.addEventListener('mousedown', event => {
            const onBackdrop = event.target === overlay;
            if (!(event.detail > 1)) ownClicks = true;
            pressedBeside = ownClicks && onBackdrop;
            // A press on the backdrop, or the rest of a double click that asked wherever it lands,
            // would take the focus from the dialog's control and select the nearest text.
            if (onBackdrop || !ownClicks) event.preventDefault();
        });
        overlay.addEventListener('click', event => {
            const beside = event.target === overlay && pressedBeside;
            pressedBeside = false;
            if (beside && !input) cancel();
        });

        try {
            onScreen = handlers;
            hostFor(doc).appendChild(overlay);
            const first = input || (safe && cancelButton) || okButton;
            if (keys && typeof keys.modal === 'function') {
                trap = keys.modal(overlay, { container: () => modal });
                trap.enter(first);
            } else {
                opener = doc.activeElement;
                first.focus();
            }
            if (input && typeof input.select === 'function') input.select();
        } catch (error) {
            settled = true;
            dismantle();
            throw error;
        }
    }

    function showNext() {
        if (current || !waiting.length) return;
        current = waiting.shift();
        const request = current;
        const done = answer => {
            if (current === request) current = null;
            request.resolve(answer);
            showNext();
        };
        try {
            show(request.spec, done);
        } catch (error) {
            console.error('RRDialog could not show a dialog:', error);
            done({ ok: false, value: null });
        }
    }

    /** Queue one dialog. Resolves { ok, value }: ok is false when it was cancelled or dismissed. */
    function request(spec) {
        return new Promise(resolve => {
            waiting.push({ spec, resolve });
            showNext();
        });
    }

    /**
     * The dialog by its parts: { title, message, okLabel, cancelLabel, danger, kind, focus }.
     * With a cancelLabel it is a question and resolves true only from its action
     * button; without one it is a notice and resolves true however it is closed.
     * `focus: 'cancel'` starts a question on Cancel without the danger style.
     */
    function open(options = {}) {
        const question = !!options.cancelLabel;
        return request({
            title: options.title,
            message: options.message,
            okLabel: options.okLabel,
            cancelLabel: options.cancelLabel || '',
            danger: question && !!options.danger,
            kind: options.kind,
            focus: options.focus
        }).then(answer => (question ? answer.ok : true));
    }

    function confirm(message, options = {}) {
        return request({
            title: options.title || translate('Confirm'),
            message,
            okLabel: options.ok || translate('OK'),
            cancelLabel: options.cancel || translate('Cancel'),
            danger: !!options.danger
        }).then(answer => answer.ok);
    }

    function alert(message, options = {}) {
        const kind = Object.hasOwn(KIND_TITLES, options.kind) ? options.kind : 'info';
        return request({
            title: options.title || translate(KIND_TITLES[kind]),
            message,
            okLabel: options.ok || translate('OK'),
            kind
        }).then(() => undefined);
    }

    function prompt(message, options = {}) {
        return request({
            title: options.title || translate('Enter Text'),
            message,
            okLabel: options.ok || translate('OK'),
            cancelLabel: options.cancel || translate('Cancel'),
            input: true,
            value: options.value,
            placeholder: options.placeholder,
            validate: options.validate
        }).then(answer => (answer.ok ? answer.value : null));
    }

    const api = {
        confirm,
        alert,
        prompt,
        open,
        /** True while a dialog is on screen or waiting its turn. */
        get busy() { return !!current || waiting.length > 0; }
    };
    root.RRDialog = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
