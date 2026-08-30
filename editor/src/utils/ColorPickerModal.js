/**
 * RRColorPickerModal - the `\C[n]` palette, read from the project's own skin.
 *
 * MZ calls this Dialog_ColorSelector and the editor had no equivalent, so an
 * author picking a text colour had to know the index by heart. The grid is 8x4
 * because that is the shape of the palette block in the windowskin: 32 swatches
 * laid out eight per row, which is exactly what `ColorManager.readTextColor`'s
 * `n % 8` and `floor(n / 8)` walk over.
 *
 * The colours come from RRWindowskin rather than a table, so a project with a
 * custom skin sees its own palette. When the skin cannot be read the grid still
 * opens, on the stock fallback palette, with a line saying so - an author who
 * only needs the index is not helped by a modal that refuses to appear.
 */
(function (root) {
    'use strict';

    const COLUMNS = 8;
    const SWATCH = 46;

    const tt = text => (root.I18n ? root.I18n.tText(text) : text);

    /**
     * @param {object} options
     *   skin      an RRWindowskin record, or null to use the fallback palette
     *   current   currently selected index, highlighted on open
     *   onPick    called with the chosen index
     */
    function open(options) {
        const settings = options || {};
        const skin = settings.skin || null;
        const current = Number(settings.current);
        const selected = Number.isFinite(current) ? current : -1;

        const colors = root.RRWindowskin
            ? root.RRWindowskin.palette(skin)
            : Array.from({ length: 32 }, () => '#ffffff');

        const overlay = document.createElement('div');
        overlay.className = 'rr-color-picker-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.8); z-index: 10010;
            display: flex; justify-content: center; align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'rr-modal';
        container.style.cssText =
            `width: min(${COLUMNS * SWATCH + 60}px, calc(100vw - 24px)); max-height: 85vh;`;

        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('div');
        title.className = 'rr-modal-title';
        title.textContent = tt('Select a Color');
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = '×';
        closeButton.style.cssText =
            'background:none;border:none;color:var(--color-text-strong);font-size:20px;cursor:pointer;';
        header.appendChild(title);
        header.appendChild(closeButton);

        const grid = document.createElement('div');
        grid.style.cssText = `
            padding: 12px; display: grid; gap: 4px;
            grid-template-columns: repeat(${COLUMNS}, ${SWATCH}px); justify-content: center;
        `;

        const status = document.createElement('div');
        status.style.cssText = `
            padding: 8px 16px; border-top: 1px solid var(--color-border);
            color: var(--color-text-muted); font-size: 11px;
        `;

        let closed = false;
        function close() {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKey, true);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
        function onKey(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                close();
            }
        }

        colors.forEach((color, index) => {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.title = `\\C[${index}]`;
            cell.style.cssText = `
                width: ${SWATCH}px; height: ${SWATCH}px; padding: 0; cursor: pointer;
                border-radius: 3px; background-color: ${color};
                border: ${index === selected ? '3px solid var(--color-accent)' : '1px solid var(--color-border)'};
                color: ${color}; position: relative;
                display: flex; align-items: flex-end; justify-content: center;
            `;

            // The index has to be legible on top of an arbitrary colour, so it
            // rides on its own dark strip rather than trying to pick a
            // contrasting foreground for a swatch we cannot predict.
            const badge = document.createElement('span');
            badge.textContent = String(index);
            badge.style.cssText = `
                width: 100%; font-size: 10px; line-height: 14px; text-align: center;
                background: rgba(0, 0, 0, 0.6); color: #fff;
                border-radius: 0 0 2px 2px;
            `;
            cell.appendChild(badge);

            cell.addEventListener('mouseenter', () => {
                status.textContent = `\\C[${index}]  ${color}`;
            });
            cell.addEventListener('click', () => {
                close();
                if (typeof settings.onPick === 'function') settings.onPick(index);
            });
            grid.appendChild(cell);
        });

        status.textContent = skin
            ? tt('Colors are read from this project’s windowskin.')
            : tt('Windowskin could not be read — showing default colors.');

        container.appendChild(header);
        container.appendChild(grid);
        container.appendChild(status);
        overlay.appendChild(container);
        document.body.appendChild(overlay);

        document.addEventListener('keydown', onKey, true);
        closeButton.addEventListener('click', close);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) close();
        });

        return { close };
    }

    const api = { open, COLUMNS };
    root.RRColorPickerModal = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
