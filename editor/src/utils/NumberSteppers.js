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
 * `change`, so existing handlers see a normal edit. Holding an arrow keeps
 * stepping, as the browser's own spinner does.
 *
 * Opt out per field with `data-no-stepper`.
 */
(function(root) {
    'use strict';

    const CLASS = 'rr-number-stepper';
    const AUTO = 'rr-number-stepper-auto';
    // A native spinner steps once, pauses, then repeats while the arrow is
    // held. These are the two halves of that, in ms.
    const HOLD_DELAY = 400;
    const HOLD_INTERVAL = 60;

    function wants(input) {
        if (!input || input.tagName !== 'INPUT' || input.type !== 'number') return false;
        if (input.dataset && input.dataset.noStepper !== undefined) return false;
        if (input.classList.contains('rr-number-stepper-input')) return false;
        const parent = input.parentElement;
        if (!parent || parent.classList.contains(CLASS)) return false;
        return true;
    }

    // `measuredWidth` is the input's offsetWidth when the caller read it ahead
    // of time (see enhanceList); read live otherwise.
    function enhance(input, measuredWidth) {
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
        if (!wrapper.style.width && !wrapper.style.flex) {
            const width = measuredWidth !== undefined && measuredWidth !== null ? measuredWidth : input.offsetWidth;
            wrapper.style.width = `${Math.max(56, width || 72)}px`;
        }
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
            const step = () => {
                if (input.disabled || input.readOnly) return false;
                try {
                    direction > 0 ? input.stepUp() : input.stepDown();
                } catch (error) {
                    const amount = Number(input.step) || 1;
                    input.value = (Number(input.value) || 0) + direction * amount;
                }
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.focus({ preventScroll: true });
                return true;
            };
            // Held, the arrow keeps stepping, the way the browser's own spinner
            // does. Stepping moves to the press so that the hold has something
            // to continue; the click handler is left for the activations that
            // send no pointer press at all (keyboard, or a scripted .click()),
            // which report detail 0.
            let delay = null;
            let repeat = null;
            const stop = () => {
                if (delay) { delay = clearTimeout(delay) || null; }
                if (repeat) { repeat = clearInterval(repeat) || null; }
            };
            button.addEventListener('mousedown', event => {
                if (event.button !== 0) return;
                event.preventDefault();
                stop();
                if (!step()) return;
                delay = setTimeout(() => { repeat = setInterval(step, HOLD_INTERVAL); }, HOLD_DELAY);
                doc.addEventListener('mouseup', stop, { once: true });
            });
            button.addEventListener('mouseleave', stop);
            button.addEventListener('click', event => {
                event.preventDefault();
                if (event.detail === 0) step();
            });
            buttons.appendChild(button);
        }
        wrapper.appendChild(buttons);
        return wrapper;
    }

    // Every input that needs measuring is measured before the first wrapper
    // is inserted. Each insertion dirties layout and the next offsetWidth
    // forces a recalculation of the whole page, so enhancing one input at a
    // time cost one full recalculation per input: on a database page with a
    // 250-row list beside it, a quarter of a second per click.
    function enhanceList(inputs) {
        const pending = [];
        for (const input of inputs) {
            if (!wants(input)) continue;
            const needsMeasure = !input.style.width && !input.style.flex;
            pending.push([input, needsMeasure ? input.offsetWidth : null]);
        }
        let count = 0;
        for (const [input, width] of pending) {
            if (enhance(input, width)) count++;
        }
        return count;
    }

    function enhanceAll(scope) {
        const target = scope || root.document;
        if (!target || !target.querySelectorAll) return 0;
        return enhanceList(target.querySelectorAll('input[type="number"]'));
    }

    let observer = null;
    function install() {
        if (observer || typeof MutationObserver === 'undefined' || !root.document) return;
        const run = () => {
            enhanceAll(root.document);
            observer = new MutationObserver(records => {
                const inputs = [];
                for (const record of records) {
                    for (const node of record.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        if (node.tagName === 'INPUT') inputs.push(node);
                        else if (node.querySelectorAll) for (const input of node.querySelectorAll('input[type="number"]')) inputs.push(input);
                    }
                }
                if (inputs.length) enhanceList(inputs);
            });
            observer.observe(root.document.body, { childList: true, subtree: true });
        };
        if (root.document.body) run();
        else root.document.addEventListener('DOMContentLoaded', run, { once: true });
    }

    const api = { CLASS, AUTO, wants, enhance, enhanceList, enhanceAll, install };
    root.RRNumberSteppers = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root.document && !root.RR_NUMBER_STEPPERS_MANUAL) install();
})(typeof globalThis !== 'undefined' ? globalThis : window);
