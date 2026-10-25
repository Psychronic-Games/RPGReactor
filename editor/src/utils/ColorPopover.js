/**
 * RRColorPopover - a color picker in the editor's own theme, opened beside
 * the control that asked for it: a saturation and brightness square, a hue
 * strip, a hex field and the colors picked lately.
 *
 *   RRColorPopover.open(anchorEl, { value: '#aabbcc', onInput(hex), onChange(hex) })
 *
 * `onInput` follows a drag, at most every 90 ms, so a costly repaint behind
 * it never piles up; `onChange` comes once, when the drag ends or a value is
 * typed or chosen. Escape or a click outside closes it.
 */
(function (root) {
    'use strict';

    const tt = text => (root.I18n ? root.I18n.tText(text) : text);
    const recent = [];
    let current = null;

    const clamp01 = x => Math.max(0, Math.min(1, x));
    function hexToHsv(hex) {
        const n = parseInt(String(hex || '#808080').slice(1), 16);
        const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return { h: ((h * 60) + 360) % 360, s: max ? d / max : 0, v: max };
    }
    function hsvToHex({ h, s, v }) {
        const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
        const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
        return '#' + [r, g, b].map(k => Math.round((k + m) * 255).toString(16).padStart(2, '0')).join('');
    }

    function close() {
        if (!current) return;
        current.cleanup();
        current.el.remove();
        current = null;
    }

    function open(anchor, options) {
        close();
        const o = options || {};
        let hsv = hexToHsv(/^#[0-9a-f]{6}$/i.test(o.value || '') ? o.value : '#808080');
        const el = document.createElement('div');
        el.className = 'rr-color-popover';
        el.setAttribute('role', 'dialog');
        el.innerHTML = `
            <div class="rr-color-popover-sv" tabindex="0" aria-label="${tt('Saturation and brightness')}"><div class="rr-color-popover-knob"></div></div>
            <div class="rr-color-popover-hue" tabindex="0" aria-label="${tt('Hue')}"><div class="rr-color-popover-hueknob"></div></div>
            <div class="rr-color-popover-row">
                <span class="rr-color-popover-now"></span>
                <input class="rr-input rr-color-popover-hex" maxlength="7" spellcheck="false" aria-label="${tt('Hex color')}">
            </div>
            <div class="rr-color-popover-recent"></div>`;
        (anchor.ownerDocument || document).body.appendChild(el);
        const sv = el.querySelector('.rr-color-popover-sv'), knob = el.querySelector('.rr-color-popover-knob');
        const hue = el.querySelector('.rr-color-popover-hue'), hueKnob = el.querySelector('.rr-color-popover-hueknob');
        const hexInput = el.querySelector('.rr-color-popover-hex'), now = el.querySelector('.rr-color-popover-now');
        const recentBox = el.querySelector('.rr-color-popover-recent');

        let lastInput = 0, pendingInput = 0;
        const emitInput = () => {
            const wait = 90 - (Date.now() - lastInput);
            clearTimeout(pendingInput);
            if (wait > 0) { pendingInput = setTimeout(emitInput, wait); return; }
            lastInput = Date.now();
            if (o.onInput) o.onInput(hsvToHex(hsv));
        };
        const commit = () => {
            clearTimeout(pendingInput);
            const hex = hsvToHex(hsv);
            const at = recent.indexOf(hex);
            if (at >= 0) recent.splice(at, 1);
            recent.unshift(hex);
            if (recent.length > 12) recent.length = 12;
            paintRecent();
            if (o.onChange) o.onChange(hex);
        };
        const paint = () => {
            sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`;
            knob.style.left = (hsv.s * 100) + '%';
            knob.style.top = ((1 - hsv.v) * 100) + '%';
            hueKnob.style.left = (hsv.h / 360 * 100) + '%';
            const hex = hsvToHex(hsv);
            now.style.background = hex;
            if (document.activeElement !== hexInput) hexInput.value = hex;
        };
        const paintRecent = () => {
            recentBox.innerHTML = recent.map(c => `<button type="button" class="rr-color-popover-swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('');
        };
        const drag = (target, onMove) => target.addEventListener('pointerdown', e => {
            e.preventDefault();
            target.setPointerCapture(e.pointerId);
            const move = ev => { const r = target.getBoundingClientRect(); onMove(clamp01((ev.clientX - r.left) / r.width), clamp01((ev.clientY - r.top) / r.height)); paint(); emitInput(); };
            const up = ev => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); move(ev); commit(); };
            target.addEventListener('pointermove', move);
            target.addEventListener('pointerup', up);
            target.addEventListener('pointercancel', up);
            move(e);
        });
        drag(sv, (x, y) => { hsv = Object.assign({}, hsv, { s: x, v: 1 - y }); });
        drag(hue, x => { hsv = Object.assign({}, hsv, { h: Math.min(359.9, x * 360) }); });
        // Arrow keys nudge, for those who pick by keyboard.
        const keys = (target, apply) => target.addEventListener('keydown', e => {
            const step = e.shiftKey ? 0.1 : 0.02, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
            if (!d) return;
            e.preventDefault(); apply(d[0], d[1]); paint(); emitInput(); commit();
        });
        keys(sv, (dx, dy) => { hsv = Object.assign({}, hsv, { s: clamp01(hsv.s + dx), v: clamp01(hsv.v - dy) }); });
        keys(hue, dx => { hsv = Object.assign({}, hsv, { h: (hsv.h + dx * 360 + 360) % 360 }); });
        hexInput.addEventListener('input', () => {
            let v = hexInput.value.trim();
            if (!v.startsWith('#')) v = '#' + v;
            if (/^#[0-9a-f]{6}$/i.test(v)) { hsv = hexToHsv(v); paint(); emitInput(); }
        });
        hexInput.addEventListener('change', commit);
        recentBox.addEventListener('click', e => {
            const b = e.target.closest('[data-color]');
            if (!b) return;
            hsv = hexToHsv(b.dataset.color); paint(); commit();
        });

        // Placed under the anchor, or above it when there is no room; kept inside the window.
        const view = (anchor.ownerDocument && anchor.ownerDocument.defaultView) || window;
        const r = anchor.getBoundingClientRect();
        const w = 216, h = el.offsetHeight || 260, m = 8;
        let left = Math.min(view.innerWidth - w - m, Math.max(m, r.left));
        let top = r.bottom + 4;
        if (top + h > view.innerHeight - m) top = Math.max(m, r.top - h - 4);
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        // Above whatever window the anchor sits in (the Forge, a dialog): its stack level plus one.
        let z = 10020;
        for (let n = anchor; n && n.nodeType === 1; n = n.parentElement) {
            const v = parseInt(view.getComputedStyle(n).zIndex, 10);
            if (Number.isFinite(v)) z = Math.max(z, v + 1);
        }
        el.style.zIndex = String(z);

        const outside = e => { if (!el.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
        const escape = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.focus && anchor.focus(); } };
        setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
        document.addEventListener('keydown', escape, true);
        current = { el, cleanup: () => { clearTimeout(pendingInput); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); } };
        paint();
        paintRecent();
        sv.focus({ preventScroll: true });
        return { close };
    }

    const api = { open, close, hexToHsv, hsvToHex };
    root.RRColorPopover = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
