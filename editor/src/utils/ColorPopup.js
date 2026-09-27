/**
 * RRColorPopup - the editor's own colour picker, in the theme: a swatch
 * button showing the colour and its hex, and on a click a popup with the
 * hex field, a saturation/brightness square and a hue strip. It is the
 * Forge's picker made shareable; its look is in theme.css (.rr-color-*).
 *
 *   html:  RRColorPopup.swatch('my-tint', '#ffcc55')
 *   bind:  RRColorPopup.bind(button, hex => ...)   (called as the colour changes)
 */
(function(root) {
    'use strict';

    const hexToRgb = hex => { const s = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(s.substr(i, 2), 16)); };
    const rgbToHex = (r, g, b) => '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
    const rgbToHsv = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
        return [h, max ? d / max : 0, max];
    };
    const hsvToRgb = (h, s, v) => {
        const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
        const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
        return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
    };
    const valid = hex => typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex);
    const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    let open = null;
    const close = () => {
        if (!open) return;
        document.removeEventListener('pointerdown', open.outside, true);
        document.removeEventListener('keydown', open.escape, true);
        open.popup.remove();
        open = null;
    };

    const api = {
        swatch(cls, value) {
            const hex = valid(value) ? value.toLowerCase() : '#ffffff';
            return `<button type="button" class="rr-color-swatch-btn ${escape(cls)}" data-value="${hex}" style="background:${hex};"><span class="rr-color-swatch-hex">${hex.toUpperCase()}</span></button>`;
        },

        /** Make a swatch button open the popup; `onInput(hex)` runs as the colour changes. */
        bind(button, onInput) {
            if (!button) return;
            button.addEventListener('click', event => {
                event.stopPropagation();
                if (open && open.anchor === button) { close(); return; }
                api.open(button, button.dataset.value, hex => {
                    button.dataset.value = hex;
                    button.style.background = hex;
                    const label = button.querySelector('.rr-color-swatch-hex');
                    if (label) label.textContent = hex.toUpperCase();
                    onInput(hex);
                });
            });
        },

        open(anchor, value, onInput) {
            close();
            let [h, s, v] = rgbToHsv(...hexToRgb(valid(value) ? value : '#ffffff'));
            const popup = document.createElement('div');
            popup.className = 'rr-color-popup';
            popup.innerHTML = `
                <div class="rr-color-popup-row">
                    <div class="rr-color-popup-preview"></div>
                    <input type="text" class="rr-color-popup-hex" maxlength="7" spellcheck="false">
                </div>
                <div class="rr-color-popup-sv"><div class="rr-color-popup-sv-cursor"></div></div>
                <div class="rr-color-popup-hue"><div class="rr-color-popup-hue-cursor"></div></div>`;
            document.body.appendChild(popup);
            const hexInput = popup.querySelector('.rr-color-popup-hex'), preview = popup.querySelector('.rr-color-popup-preview');
            const sv = popup.querySelector('.rr-color-popup-sv'), svCursor = popup.querySelector('.rr-color-popup-sv-cursor');
            const hue = popup.querySelector('.rr-color-popup-hue'), hueCursor = popup.querySelector('.rr-color-popup-hue-cursor');
            const paint = fromHex => {
                const hex = rgbToHex(...hsvToRgb(h, s, v));
                sv.style.background = `linear-gradient(to bottom,transparent,#000),linear-gradient(to right,#fff,hsl(${h},100%,50%))`;
                svCursor.style.left = `${s * 100}%`; svCursor.style.top = `${(1 - v) * 100}%`;
                hueCursor.style.left = `${(h / 360) * 100}%`;
                preview.style.background = hex;
                if (!fromHex) hexInput.value = hex.toUpperCase();
                return hex;
            };
            paint(false);
            const drag = (element, move) => element.addEventListener('pointerdown', event => {
                event.preventDefault();
                element.setPointerCapture?.(event.pointerId);
                move(event);
                const onMove = e => move(e);
                const onUp = () => { element.removeEventListener('pointermove', onMove); element.removeEventListener('pointerup', onUp); };
                element.addEventListener('pointermove', onMove);
                element.addEventListener('pointerup', onUp);
            });
            drag(sv, event => {
                const r = sv.getBoundingClientRect();
                s = Math.max(0, Math.min(1, (event.clientX - r.left) / r.width));
                v = 1 - Math.max(0, Math.min(1, (event.clientY - r.top) / r.height));
                onInput(paint(false));
            });
            drag(hue, event => {
                const r = hue.getBoundingClientRect();
                h = Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)) * 360;
                onInput(paint(false));
            });
            hexInput.addEventListener('input', () => {
                let text = hexInput.value.trim();
                if (text && text[0] !== '#') text = '#' + text;
                if (!valid(text)) return;
                const [nh, ns, nv] = rgbToHsv(...hexToRgb(text));
                if (ns > 0.01) h = nh;
                s = ns; v = nv;
                paint(true);
                onInput(text.toLowerCase());
            });
            // Beside the swatch, kept on screen.
            const rect = anchor.getBoundingClientRect(), w = popup.offsetWidth || 232, ph = popup.offsetHeight || 220;
            popup.style.left = `${Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8))}px`;
            popup.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - ph - 8))}px`;
            const outside = event => { if (!popup.contains(event.target) && event.target !== anchor && !anchor.contains(event.target)) close(); };
            const escapeKey = event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
            setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
            document.addEventListener('keydown', escapeKey, true);
            open = { popup, anchor, outside, escape: escapeKey };
        },

        close
    };

    root.RRColorPopup = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
