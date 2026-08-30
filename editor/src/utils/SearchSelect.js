/**
 * SearchSelect - a grouped, searchable dropdown.
 *
 * A button shows the current choice; opening it drops a panel with a filter
 * box and the entries under their group headings. Built for lists that can
 * run long (every part, bone and effect of a model), where a native select
 * offers no search and no headings. Keyboard: type to filter, Enter picks
 * the first match, Escape closes.
 *
 *   RRSearchSelect.create({
 *       groups: [{ label: 'Parts', items: [{ id: 'Head', label: 'Head' }] }],
 *       value: 'Head',
 *       placeholder: '—',
 *       onChange: id => {}
 *   }) → { element, setValue(id), setGroups(groups) }
 */
(function(root) {
    'use strict';

    function escape(text) {
        return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function create(options) {
        const state = {
            groups: options.groups || [],
            value: options.value == null ? '' : String(options.value),
            placeholder: options.placeholder || '—',
            onChange: typeof options.onChange === 'function' ? options.onChange : () => {}
        };
        const tt = text => (root.I18n ? root.I18n.tText(text) : text);
        const element = document.createElement('div');
        element.className = 'rr-search-select';
        element.style.cssText = 'position:relative;flex:1;min-width:0;';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rr-search-select-button';
        button.style.cssText = 'width:100%;display:flex;align-items:center;gap:6px;padding:3px 6px;font-weight:bold;font-size:12px;'
            + 'background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:4px;cursor:pointer;text-align:left;';
        const label = document.createElement('span');
        label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        const caret = document.createElement('span');
        caret.textContent = '▾';
        caret.style.cssText = 'flex:0 0 auto;color:var(--color-text-muted);';
        button.appendChild(label);
        button.appendChild(caret);
        element.appendChild(button);

        const panel = document.createElement('div');
        panel.className = 'rr-search-select-panel';
        panel.style.cssText = 'position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:40;display:none;max-height:280px;'
            + 'background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:5px;box-shadow:0 6px 20px rgba(0,0,0,0.4);'
            + 'flex-direction:column;overflow:hidden;';
        const search = document.createElement('input');
        search.type = 'text';
        search.placeholder = tt('Search files...');
        search.style.cssText = 'margin:6px;padding:4px 6px;font-size:11px;background:var(--color-bg-input);color:var(--color-text);'
            + 'border:1px solid var(--color-border-input);border-radius:3px;outline:none;';
        const list = document.createElement('div');
        list.style.cssText = 'overflow-y:auto;min-height:0;flex:1;padding-bottom:4px;';
        panel.appendChild(search);
        panel.appendChild(list);
        element.appendChild(panel);

        const findItem = id => {
            for (const group of state.groups) {
                for (const item of group.items || []) if (String(item.id) === String(id)) return item;
            }
            return null;
        };
        const renderButton = () => {
            const item = findItem(state.value);
            label.textContent = item ? item.label : state.placeholder;
            label.style.color = item ? 'var(--color-text)' : 'var(--color-text-muted)';
        };
        const renderList = () => {
            const filter = search.value.trim().toLowerCase();
            list.innerHTML = '';
            let any = false;
            for (const group of state.groups) {
                const items = (group.items || []).filter(item => !filter || String(item.label).toLowerCase().includes(filter));
                if (!items.length) continue;
                any = true;
                const heading = document.createElement('div');
                heading.textContent = group.label;
                heading.style.cssText = 'padding:5px 8px 2px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;'
                    + 'color:var(--color-text-muted);border-left:3px solid var(--color-accent);margin-top:2px;';
                list.appendChild(heading);
                for (const item of items) {
                    const row = document.createElement('div');
                    row.className = 'rr-search-select-item';
                    row.dataset.id = String(item.id);
                    row.innerHTML = escape(item.label);
                    const chosen = String(item.id) === state.value;
                    row.style.cssText = 'padding:4px 8px 4px 14px;font-size:12px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
                        + `color:${chosen ? 'var(--color-accent-bright)' : 'var(--color-text)'};background:${chosen ? 'var(--color-accent-tint-15)' : 'transparent'};`;
                    row.addEventListener('mouseenter', () => { if (!chosen) row.style.background = 'var(--color-bg-hover)'; });
                    row.addEventListener('mouseleave', () => { row.style.background = chosen ? 'var(--color-accent-tint-15)' : 'transparent'; });
                    row.addEventListener('click', () => pick(String(item.id)));
                    list.appendChild(row);
                }
            }
            if (!any) {
                const empty = document.createElement('div');
                empty.textContent = root.I18n ? root.I18n.t('search.noMatches') : 'No matches';
                empty.style.cssText = 'padding:8px;font-size:11px;color:var(--color-text-muted);';
                list.appendChild(empty);
            }
        };
        const close = () => {
            panel.style.display = 'none';
            document.removeEventListener('pointerdown', onOutside, true);
        };
        const onOutside = event => {
            if (!element.contains(event.target)) close();
        };
        const open = () => {
            search.value = '';
            renderList();
            panel.style.display = 'flex';
            document.addEventListener('pointerdown', onOutside, true);
            setTimeout(() => search.focus(), 0);
        };
        const pick = id => {
            close();
            if (id === state.value) return;
            state.value = id;
            renderButton();
            state.onChange(id);
        };
        button.addEventListener('click', () => {
            if (panel.style.display === 'flex') close();
            else open();
        });
        search.addEventListener('input', renderList);
        search.addEventListener('keydown', event => {
            if (event.key === 'Escape') { close(); button.focus(); }
            if (event.key === 'Enter') {
                const first = list.querySelector('.rr-search-select-item');
                if (first) pick(first.dataset.id);
            }
        });
        renderButton();
        return {
            element,
            setValue(id) { state.value = id == null ? '' : String(id); renderButton(); },
            setGroups(groups) { state.groups = groups || []; renderButton(); },
            close
        };
    }

    const api = { create, escape };
    root.RRSearchSelect = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
