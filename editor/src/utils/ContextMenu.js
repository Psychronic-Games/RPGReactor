/**
 * RRContextMenu - a right-click menu in the editor's own look, for anything
 * that is not an event (the event menu has its own): a list of items, each
 * `{ label, shortcut, action, enabled }` or `{ separator: true }`, shown at
 * a screen point and kept on screen. A click outside, Escape or a pick
 * closes it.
 *
 *   RRContextMenu.show(x, y, [{ label: 'Copy', shortcut: 'Ctrl+C', action: () => ... }])
 */
(function(root) {
    'use strict';

    let open = null;
    const close = () => {
        if (!open) return;
        document.removeEventListener('pointerdown', open.outside, true);
        document.removeEventListener('keydown', open.escape, true);
        open.menu.remove();
        open = null;
    };

    const api = {
        show(x, y, items) {
            close();
            const menu = document.createElement('div');
            menu.className = 'rr-context-menu';
            menu.setAttribute('role', 'menu');
            for (const item of items || []) {
                if (item.separator) {
                    const line = document.createElement('div');
                    line.className = 'rr-context-menu-separator';
                    menu.appendChild(line);
                    continue;
                }
                const row = document.createElement('div');
                row.className = 'rr-context-menu-item';
                row.setAttribute('role', 'menuitem');
                const enabled = item.enabled !== false;
                row.setAttribute('aria-disabled', String(!enabled));
                const label = document.createElement('span');
                label.textContent = item.label;
                row.appendChild(label);
                if (item.shortcut) {
                    const key = document.createElement('span');
                    key.className = 'rr-context-menu-key';
                    key.textContent = item.shortcut;
                    row.appendChild(key);
                }
                if (enabled) row.addEventListener('click', () => { close(); item.action?.(); });
                menu.appendChild(row);
            }
            document.body.appendChild(menu);
            // At the pointer, kept inside the window.
            const w = menu.offsetWidth, h = menu.offsetHeight;
            menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 4))}px`;
            menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - h - 4))}px`;
            const outside = event => { if (!menu.contains(event.target)) close(); };
            const escape = event => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); close(); } };
            setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
            document.addEventListener('keydown', escape, true);
            open = { menu, outside, escape };
            return menu;
        },
        hide: close,
        isOpen: () => !!open
    };

    root.RRContextMenu = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
