/**
 * RRRandomPartsMenu - which parts Randomize rolls, as boxes to tick.
 *
 * Beside a builder's 🎲 Randomize button: a small button naming what is
 * ticked ("Everything", "Face, Hair", "Outfit") that opens a list of the
 * builder's parts, each with a box. Tick any mix (face, hair and body but not
 * the outfit; only the outfit); every box ticked is Everything. The choice is
 * remembered per builder in the browser.
 *
 *   html(t)                          the markup to put beside the button
 *   render(el, parts, chosen, t)     fill it: parts is [[id, label], ...]
 *                                    (no 'all'); chosen a Set of ids
 *   bind(el, onChange)               onChange(Set) whenever a box changes
 *   load(key, parts) / save(key, s)  the remembered choice (all by default)
 *   scopesFor(parts, chosen)         ['all'] when every part is ticked, else
 *                                    the ticked ids in the parts' order
 */
(function(root) {
    'use strict';

    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

    function html(t) {
        return `<span class="rr-random-parts"><button type="button" class="rr-btn-chip rr-random-parts-toggle" title="${esc(t('What Randomize changes'))}" aria-haspopup="true" aria-expanded="false"></button>`
            + `<div class="rr-random-parts-menu" role="menu" hidden></div></span>`;
    }

    function summary(parts, chosen, t) {
        const on = parts.filter(([id]) => chosen.has(id));
        if (on.length === parts.length) return t('Everything');
        if (!on.length) return t('Nothing');
        return on.map(([, label]) => t(label)).join(', ');
    }

    function render(el, parts, chosen, t) {
        if (!el) return;
        const toggle = el.querySelector('.rr-random-parts-toggle'), menu = el.querySelector('.rr-random-parts-menu');
        el._parts = parts;
        el._chosen = chosen;
        el._t = t;
        toggle.textContent = summary(parts, chosen, t) + ' ▾';
        const all = parts.every(([id]) => chosen.has(id));
        menu.innerHTML = `<label class="rr-random-parts-all"><input type="checkbox" data-part="*"${all ? ' checked' : ''}> ${esc(t('Everything'))}</label>`
            + parts.map(([id, label]) => `<label><input type="checkbox" data-part="${esc(id)}"${chosen.has(id) ? ' checked' : ''}> ${esc(t(label))}</label>`).join('');
    }

    function bind(el, onChange) {
        if (!el || el._bound) return;
        el._bound = true;
        const toggle = el.querySelector('.rr-random-parts-toggle'), menu = el.querySelector('.rr-random-parts-menu');
        const close = () => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
        toggle.addEventListener('click', event => {
            event.stopPropagation();
            menu.hidden = !menu.hidden;
            toggle.setAttribute('aria-expanded', String(!menu.hidden));
        });
        menu.addEventListener('click', event => event.stopPropagation());
        menu.addEventListener('change', event => {
            const box = event.target.closest('input[data-part]');
            if (!box) return;
            const parts = el._parts || [], chosen = new Set(el._chosen || []);
            if (box.dataset.part === '*') { chosen.clear(); if (box.checked) for (const [id] of parts) chosen.add(id); }
            else if (box.checked) chosen.add(box.dataset.part); else chosen.delete(box.dataset.part);
            render(el, parts, chosen, el._t || (x => x));
            onChange(chosen);
        });
        el.ownerDocument.addEventListener('click', close);
        el.ownerDocument.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    }

    function load(key, parts) {
        let saved = null;
        try { saved = JSON.parse(root.localStorage.getItem('rr-random-parts:' + key) || 'null'); } catch (_) { saved = null; }
        const ids = parts.map(([id]) => id);
        if (!Array.isArray(saved)) return new Set(ids);
        // A part this builder has now and had not when the choice was kept is ticked.
        const known = new Set(Array.isArray(saved) ? saved.filter(s => typeof s === 'string' && s.startsWith('~')).map(s => s.slice(1)) : []);
        return new Set(ids.filter(id => saved.includes(id) || !known.has(id)));
    }

    function save(key, chosen, parts) {
        try { root.localStorage.setItem('rr-random-parts:' + key, JSON.stringify([...chosen].concat((parts || []).map(([id]) => '~' + id)))); } catch (_) { /* no storage: the choice lasts this session */ }
    }

    function scopesFor(parts, chosen) {
        if (parts.every(([id]) => chosen.has(id))) return ['all'];
        return parts.map(([id]) => id).filter(id => chosen.has(id));
    }

    /**
     * The Randomize button's die, drawn like the editor's own toolbar icons (an outline in the text color, the
     * pips in the accent): an emoji die took the system's colors and looked out of place.
     */
    function icon(size = 14) {
        return `<svg class="rr-random-icon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">`
            // A die face-on with clipped corners: seven pips on a drawn cube were mush at 14 px.
            + '<path d="M7 3.5h10l3.5 3.5v10L17 20.5H7L3.5 17V7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
            + '<g fill="var(--color-accent-bright)"><rect x="6.9" y="6.9" width="2.8" height="2.8" rx=".6"/><rect x="14.3" y="6.9" width="2.8" height="2.8" rx=".6"/>'
            + '<rect x="10.6" y="10.6" width="2.8" height="2.8" rx=".6"/><rect x="6.9" y="14.3" width="2.8" height="2.8" rx=".6"/><rect x="14.3" y="14.3" width="2.8" height="2.8" rx=".6"/></g></svg>';
    }

    const api = { html, render, bind, load, save, scopesFor, summary, icon };
    root.RRRandomPartsMenu = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
