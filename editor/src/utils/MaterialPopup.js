/**
 * MaterialPopup - a material shown large, and chosen from pictures.
 *
 * A panel shows the material in use as a tile (`tile`): its picture, its
 * name, and a mark that it can be swapped. A click on the tile opens the
 * project's materials as a grid (`open`); a click there chooses one, the
 * pointer over one may show it first (`onHover`), and Escape or a click
 * elsewhere closes the grid with what was shown taken back
 * (`onHover(null)`). Used by the Build bar's panel and Database >
 * Structures, so a material is picked the same way in both.
 */
(function(root) {
    'use strict';

    const escape = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const face = url => url ? ` style="background-image:url('${escape(url)}');"` : '';
    const SWAP = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4-4 4 4M4 10l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    let live = null;

    /**
     * The material in use, large: `value` its name ('' is none), `url` its picture,
     * `blank` what none is called here, `cls` and `attrs` the caller's own.
     */
    function tile({ cls = '', value = '', url = '', blank = '', attrs = '' } = {}) {
        return `<button type="button" class="rr-material-tile ${cls}" data-value="${escape(value)}" data-blank="${escape(blank)}" aria-haspopup="listbox" ${attrs}>`
            + `<span class="rr-material-tile-face${value && url ? '' : ' is-plain'}"${value ? face(url) : ''}></span>`
            + `<span class="rr-material-tile-name">${escape(value || blank)}</span>`
            + `<span class="rr-material-tile-swap">${SWAP}</span></button>`;
    }

    /** Close the grid. `kept` is false when nothing was chosen: what the pointer was showing is taken back. */
    function close(kept = false) {
        const popup = live;
        if (!popup) return;
        live = null;
        document.removeEventListener('pointerdown', popup.away, true);
        document.removeEventListener('keydown', popup.key, true);
        popup.grid.remove();
        popup.anchor.setAttribute('aria-expanded', 'false');
        if (!kept && popup.onHover) popup.onHover(null);
    }

    /**
     * The grid under (or over) `anchor`: `materials` as `[{ name, url }]`, `current` lit,
     * `blank` the name of the empty choice (left out when not given), `note` a line under the grid.
     */
    function open(anchor, { materials = [], current = '', blank = null, note = '', onPick, onHover = null } = {}) {
        close();
        const grid = document.createElement('div');
        grid.className = 'rr-material-popup';
        grid.setAttribute('role', 'listbox');
        const option = (name, url, label) => `<button type="button" class="rr-material-option" role="option" data-name="${escape(name)}" aria-selected="${name === current}" title="${escape(label)}">`
            + `<span class="rr-material-option-face${name && url ? '' : ' is-plain'}"${name ? face(url) : ''}></span><span class="rr-material-option-name">${escape(label)}</span></button>`;
        // Every name and address is escaped in `option`.
        const options = (blank === null ? '' : option('', '', blank)) + materials.map(entry => option(entry.name, entry.url, entry.name)).join('');
        grid.innerHTML = `<div class="rr-material-options">${options}</div>` + (note ? `<div class="rr-material-popup-note">${escape(note)}</div>` : '');
        document.body.appendChild(grid);
        // Under the tile when there is room, else over it; never off the window.
        const rect = anchor.getBoundingClientRect(), box = grid.getBoundingClientRect();
        const left = Math.max(8, Math.min(window.innerWidth - box.width - 8, rect.left));
        const below = rect.bottom + 4 + box.height <= window.innerHeight - 8;
        const top = below ? rect.bottom + 4 : Math.max(8, rect.top - 4 - box.height);
        grid.style.left = Math.round(left) + 'px';
        grid.style.top = Math.round(top) + 'px';
        anchor.setAttribute('aria-expanded', 'true');
        const popup = { grid, anchor, onHover, away: null, key: null };
        for (const el of grid.querySelectorAll('.rr-material-option')) {
            el.addEventListener('click', () => { const name = el.dataset.name; close(true); if (onHover) onHover(null); if (onPick) onPick(name); });
            if (onHover) { el.addEventListener('pointerenter', () => onHover(el.dataset.name)); el.addEventListener('focus', () => onHover(el.dataset.name)); }
        }
        if (onHover) grid.addEventListener('pointerleave', () => onHover(null));
        popup.away = event => { if (!grid.contains(event.target) && !anchor.contains(event.target)) close(); };
        popup.key = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); anchor.focus?.({ preventScroll: true }); } };
        live = popup;
        // After this click has finished, so the click that opened it does not close it.
        setTimeout(() => { if (live !== popup) return; document.addEventListener('pointerdown', popup.away, true); document.addEventListener('keydown', popup.key, true); }, 0);
        return grid;
    }

    const api = { tile, open, close, isOpen: () => !!live };
    root.RRMaterialPopup = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
