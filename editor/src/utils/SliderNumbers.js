/**
 * SliderNumbers - a slider's value as a number box one can type into (owner, 2026-11-22: "I should be able to
 * enter a value directly").
 *
 * A tool draws `<input type="number" class="rr-slider-num">` beside its `<input type="range">` (within a few
 * levels of the same parent) and calls `RRSliderNumbers.bind(root)` once. Typing a value and pressing Enter, or
 * leaving the box, holds it to the slider's min and max, sets the slider, and sends the slider's own `input` and
 * `change` events, so the tool's handlers see an ordinary drag. `RRSliderNumbers.show(box, value, digits)` puts a
 * value in the box when the slider moves (a box being typed into is left alone).
 */
(function(root) {
    'use strict';
    const CLASS = 'rr-slider-num';

    /** The slider a number box stands for: the first range input in its nearest enclosing block that has one. */
    function sliderFor(box) {
        let at = box.parentElement;
        for (let depth = 0; at && depth < 4; depth++, at = at.parentElement) {
            const range = at.querySelector('input[type="range"]');
            if (range) return range;
        }
        return null;
    }

    /** `value` held to the slider's limits; NaN when it is not a number. */
    function clamp(range, value) {
        const n = typeof value === 'number' ? value : (String(value).trim() === '' ? NaN : Number(value));
        if (!Number.isFinite(n)) return NaN;
        const min = Number(range.min), max = Number(range.max);
        return Math.min(Number.isFinite(max) ? max : n, Math.max(Number.isFinite(min) ? min : n, n));
    }

    function format(value, digits) {
        return digits === undefined || digits === null ? String(value) : Number(value).toFixed(digits);
    }

    function commit(box) {
        const range = sliderFor(box);
        if (!range) return;
        const value = clamp(range, box.value);
        if (Number.isNaN(value)) { box.value = format(range.value, box.dataset.digits ? Number(box.dataset.digits) : undefined); return; }
        range.value = String(value);
        range.dispatchEvent(new Event('input', { bubbles: true }));
        range.dispatchEvent(new Event('change', { bubbles: true }));
        box.value = format(range.value, box.dataset.digits ? Number(box.dataset.digits) : undefined);
    }

    /** Listen on `root` (once) for its number boxes. */
    function bind(rootEl) {
        if (!rootEl || rootEl.__rrSliderNumbers) return;
        rootEl.__rrSliderNumbers = true;
        rootEl.addEventListener('change', event => {
            const box = event.target;
            if (box && box.classList && box.classList.contains(CLASS)) commit(box);
        });
        rootEl.addEventListener('keydown', event => {
            const box = event.target;
            if (!box || !box.classList || !box.classList.contains(CLASS)) return;
            if (event.key === 'Enter') { event.preventDefault(); commit(box); box.select(); }
            else if (event.key === 'Escape') {
                const range = sliderFor(box);
                if (range) box.value = format(range.value, box.dataset.digits ? Number(box.dataset.digits) : undefined);
                box.blur();
            }
            event.stopPropagation();
        });
    }

    /** Show `value` in a number box (or a plain element) as the slider moves; leaves a box being typed into. */
    function show(el, value, digits) {
        if (!el) return;
        const text = format(value, digits);
        if (el.tagName === 'INPUT') { if (el.ownerDocument.activeElement !== el) el.value = text; }
        else el.textContent = text;
    }

    const api = { CLASS, bind, show, sliderFor, clamp };
    root.RRSliderNumbers = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
