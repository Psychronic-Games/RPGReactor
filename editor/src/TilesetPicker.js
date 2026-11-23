/**
 * TilesetPicker - choose a tileset the way a picture is chosen: a searchable list on the left (each tileset with a
 * small picture of its sheets), every sheet of the one selected on the right (A1 to E), Choose to take it.
 *
 *   TilesetPicker.open({ db, projectPath, current, title, onPick(id) })
 *
 * A double-click or Enter chooses, Escape or Cancel leaves without a choice. First used by a 2D structure's tile
 * layers (Structure2DWorkshop.js): a new tile layer opens it, and a layer's tileset is changed with it.
 */
class TilesetPicker {
    static SHEETS = ['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E'];

    static _t(text) { return typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text; }

    static label(tileset) { return `${String(tileset.id).padStart(4, '0')} ${tileset.name || ''}`.trim(); }

    static sheetUrl(projectPath, name) {
        if (!projectPath || !name || typeof RRAssetFiles === 'undefined' || !RRAssetFiles.imageUrlFor) return '';
        try { return RRAssetFiles.imageUrlFor(require('path').join(projectPath, 'img', 'tilesets'), name) || ''; } catch (error) { return ''; }
    }

    /** The sheet that best shows what a tileset is: its B sheet (objects), else its ground, else whatever it has. */
    static coverSheet(tileset) {
        const names = tileset.tilesetNames || [];
        for (const index of [5, 1, 0, 4, 3, 2, 6, 7, 8]) if (names[index]) return names[index];
        return '';
    }

    static open({ db, projectPath, current = null, title = null, onPick } = {}) {
        if (typeof document === 'undefined' || typeof onPick !== 'function') return false;
        // A blank slot (no name, no sheets) has nothing to paint with: left out, unless it is the one in use.
        const tilesets = (db?.getTilesets?.() || []).filter(tileset => tileset && tileset.id
            && (tileset.id === current || tileset.name || (tileset.tilesetNames || []).some(Boolean)));
        if (!tilesets.length) return false;
        TilesetPicker.close();
        const tt = text => rrEscapeHtml(TilesetPicker._t(text));
        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay rr-tileset-picker-overlay';
        overlay.innerHTML = `
            <div class="rr-modal rr-tileset-picker" role="dialog" aria-modal="true" aria-labelledby="rr-tileset-picker-title">
                <div class="rr-modal-header"><div class="rr-modal-title" id="rr-tileset-picker-title">${rrEscapeHtml(title || TilesetPicker._t('Choose a Tileset'))}</div><button type="button" class="rr-modal-close" data-act="cancel" aria-label="${tt('Close')}">×</button></div>
                <div class="rr-tileset-picker-body">
                    <div class="rr-tileset-picker-side">
                        <input type="search" class="rr-tileset-picker-search" placeholder="${tt('Search tilesets...')}" aria-label="${tt('Search tilesets...')}">
                        <div class="rr-tileset-picker-list rr-accent-scrollbar" role="listbox"></div>
                    </div>
                    <div class="rr-tileset-picker-preview rr-accent-scrollbar"></div>
                </div>
                <div class="rr-modal-footer rr-tileset-picker-foot">
                    <button type="button" class="rr-btn-secondary rr-tileset-picker-cancel" data-act="cancel">${tt('Cancel')}</button>
                    <button type="button" class="rr-button-primary" data-act="choose">${tt('Choose')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const list = overlay.querySelector('.rr-tileset-picker-list'), preview = overlay.querySelector('.rr-tileset-picker-preview');
        const search = overlay.querySelector('.rr-tileset-picker-search');
        let selected = tilesets.find(tileset => tileset.id === current)?.id ?? tilesets[0].id;

        const renderList = () => {
            const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
            const shown = tilesets.filter(tileset => words.every(word => TilesetPicker.label(tileset).toLowerCase().includes(word)));
            list.innerHTML = shown.map(tileset => {
                const cover = TilesetPicker.sheetUrl(projectPath, TilesetPicker.coverSheet(tileset));
                return `<div class="rr-tileset-picker-item${tileset.id === selected ? ' is-selected' : ''}${tileset.id === current ? ' is-current' : ''}" role="option" aria-selected="${tileset.id === selected}" data-id="${tileset.id}">
                    <span class="rr-tileset-picker-thumb">${cover ? `<img src="${rrEscapeHtml(cover)}" alt="" loading="lazy">` : ''}</span>
                    <span class="rr-tileset-picker-name">${rrEscapeHtml(TilesetPicker.label(tileset))}${tileset.id === current ? `<small>${tt('In use')}</small>` : ''}</span>
                </div>`;
            }).join('') || `<p class="rr-tileset-picker-none">${tt('No tileset matches.')}</p>`;
        };
        const renderPreview = () => {
            const tileset = tilesets.find(entry => entry.id === selected);
            if (!tileset) { preview.innerHTML = ''; return; }
            const names = tileset.tilesetNames || [];
            const sheets = TilesetPicker.SHEETS.map((sheet, index) => ({ sheet, name: names[index] })).filter(entry => entry.name);
            preview.innerHTML = `<div class="rr-tileset-picker-heading">${rrEscapeHtml(TilesetPicker.label(tileset))}</div>`
                + (sheets.length ? sheets.map(({ sheet, name }) => `
                    <figure class="rr-tileset-picker-sheet"><figcaption><strong>${sheet}</strong> ${rrEscapeHtml(name)}</figcaption><img src="${rrEscapeHtml(TilesetPicker.sheetUrl(projectPath, name))}" alt=""></figure>`).join('')
                    : `<p class="rr-tileset-picker-none">${tt('This tileset has no sheets yet.')}</p>`);
            preview.scrollTop = 0;
        };
        const select = id => {
            selected = id;
            for (const item of list.querySelectorAll('[data-id]')) {
                const on = Number(item.dataset.id) === id;
                item.classList.toggle('is-selected', on);
                item.setAttribute('aria-selected', String(on));
                if (on) item.scrollIntoView({ block: 'nearest' });
            }
            renderPreview();
        };
        const finish = id => {
            TilesetPicker.close();
            if (id != null) onPick(id);
        };
        list.addEventListener('click', event => { const item = event.target.closest('[data-id]'); if (item) select(Number(item.dataset.id)); });
        list.addEventListener('dblclick', event => { const item = event.target.closest('[data-id]'); if (item) finish(Number(item.dataset.id)); });
        search.addEventListener('input', () => {
            renderList();
            const first = list.querySelector('[data-id]');
            if (first && !list.querySelector('.is-selected')) select(Number(first.dataset.id));
        });
        overlay.addEventListener('click', event => {
            const act = event.target.closest('[data-act]')?.dataset.act;
            if (act === 'cancel' || event.target === overlay) finish(null);
            else if (act === 'choose') finish(selected);
        });
        const key = event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(null); return; }
            if (event.key === 'Enter') { event.preventDefault(); finish(selected); return; }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                const ids = [...list.querySelectorAll('[data-id]')].map(item => Number(item.dataset.id));
                const at = ids.indexOf(selected), next = ids[Math.max(0, Math.min(ids.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
                if (next != null) { event.preventDefault(); select(next); }
            }
        };
        document.addEventListener('keydown', key, true);
        TilesetPicker._close = () => { document.removeEventListener('keydown', key, true); overlay.remove(); };
        renderList();
        select(selected);
        search.focus();
        return true;
    }

    static close() {
        const close = TilesetPicker._close;
        TilesetPicker._close = null;
        if (close) close();
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = TilesetPicker;
