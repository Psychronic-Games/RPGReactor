/**
 * NumberSteppers - the themed ▲▼ stepper on every number field.
 *
 * The browser's own spinner ignores the theme. Map Properties and the Video
 * Surface editor wrap their number inputs in `.rr-number-stepper` by hand;
 * this does the same for every other `<input type="number">` in the app,
 * including ones created later by dialogs and panels, by watching the
 * document. The input keeps its id, classes, value, listeners and size —
 * the wrapper takes over the input's width and flex so layouts hold — and
 * the buttons step through `stepUp`/`stepDown` and dispatch `input` and
 * `change`, so existing handlers see a normal edit.
 *
 * Opt out per field with `data-no-stepper`.
 */
(function(root) {
    'use strict';

    const CLASS = 'rr-number-stepper';
    const AUTO = 'rr-number-stepper-auto';

    function wants(input) {
        if (!input || input.tagName !== 'INPUT' || input.type !== 'number') return false;
        if (input.dataset && input.dataset.noStepper !== undefined) return false;
        if (input.classList.contains('rr-number-stepper-input')) return false;
        const parent = input.parentElement;
        if (!parent || parent.classList.contains(CLASS)) return false;
        return true;
    }

    function enhance(input) {
        if (!wants(input)) return null;
        const doc = input.ownerDocument;
        const wrapper = doc.createElement('div');
        wrapper.className = `${CLASS} ${AUTO}`;
        // The wrapper stands where the input stood, at the input's size.
        const style = input.style;
        const carried = ['width', 'minWidth', 'maxWidth', 'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'margin', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom', 'gridColumn', 'alignSelf'];
        for (const property of carried) {
            if (style[property]) {
                wrapper.style[property] = style[property];
                style[property] = '';
            }
        }
        if (!wrapper.style.width && !wrapper.style.flex) wrapper.style.width = `${Math.max(56, input.offsetWidth || 72)}px`;
        input.classList.add('rr-number-stepper-input');
        style.width = '100%';
        style.minWidth = '0';
        style.flex = '1';
        style.border = '0';
        style.background = 'transparent';
        style.margin = '0';
        style.boxSizing = 'border-box';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
        const buttons = doc.createElement('div');
        buttons.className = 'rr-number-stepper-buttons';
        for (const [direction, glyph] of [[1, '▲'], [-1, '▼']]) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.tabIndex = -1;
            button.textContent = glyph;
            button.setAttribute('aria-label', direction > 0 ? '+' : '-');
            button.addEventListener('click', event => {
                event.preventDefault();
                if (input.disabled || input.readOnly) return;
                try {
                    direction > 0 ? input.stepUp() : input.stepDown();
                } catch (error) {
                    const step = Number(input.step) || 1;
                    input.value = (Number(input.value) || 0) + direction * step;
                }
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.focus({ preventScroll: true });
            });
            buttons.appendChild(button);
        }
        wrapper.appendChild(buttons);
        return wrapper;
    }

    function enhanceAll(scope) {
        const target = scope || root.document;
        if (!target || !target.querySelectorAll) return 0;
        let count = 0;
        for (const input of target.querySelectorAll('input[type="number"]')) {
            if (enhance(input)) count++;
        }
        return count;
    }

    let observer = null;
    function install() {
        if (observer || typeof MutationObserver === 'undefined' || !root.document) return;
        const run = () => {
            enhanceAll(root.document);
            observer = new MutationObserver(records => {
                for (const record of records) {
                    for (const node of record.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        if (node.tagName === 'INPUT') enhance(node);
                        else enhanceAll(node);
                    }
                }
            });
            observer.observe(root.document.body, { childList: true, subtree: true });
        };
        if (root.document.body) run();
        else root.document.addEventListener('DOMContentLoaded', run, { once: true });
    }

    const api = { CLASS, AUTO, wants, enhance, enhanceAll, install };
    root.RRNumberSteppers = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root.document && !root.RR_NUMBER_STEPPERS_MANUAL) install();
})(typeof globalThis !== 'undefined' ? globalThis : window);
