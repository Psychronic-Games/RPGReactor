/**
 * Database > Types: Slot Layouts. Each layout is named and lists its equipment slots in order, each
 * slot an equipment type, a type as many times as the layout has slots of it (two Accessories, a
 * second Weapon, no Head). Kept in System as `rrSlotLayouts: [{ name, slots: [etypeId, ...] }]`; the
 * Slot Type trait picks one (dataId 2 the first, 3 the second, ...).
 */
(function(root) {
    const plain = name => String(name || '').replace(/\\[iI]\[\d+\]\s*/g, '').trim();
    const escape = text => (typeof rrEscapeHtml === 'function' ? rrEscapeHtml(text) : String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

    /** A new layout: the stock slots that are named (Weapon, Shield, Head, Body, Accessory). */
    const newLayout = (system, name) => {
        const slots = root.RREquipSlots ? root.RREquipSlots.standard(system) : [1, 2, 3, 4, 5];
        return { name, slots: slots.length ? slots : [1] };
    };

    /**
     * Draw the section into `host`. `options`: { data (the database, for the traits a removal renumbers),
     * tt, confirm(message) -> Promise<boolean>, onChange() }.
     */
    const render = (host, system, options = {}) => {
        const tt = options.tt || (text => text);
        const S = root.RREquipSlots;
        // (System gains the list with its first layout: a project that never made one saves as before.)
        const layouts = Array.isArray(system.rrSlotLayouts) ? system.rrSlotLayouts : [];
        const types = system.equipTypes || [];
        const named = S ? S.named(system) : types.map((_, id) => id).filter(id => id > 0);
        const changed = () => { if (options.onChange) options.onChange(); };
        const options_ = chosen => (named.includes(chosen) ? '' : `<option value="${chosen}" selected>${escape(plain(types[chosen]) || '#' + chosen)}</option>`)
            + named.map(id => `<option value="${id}"${id === chosen ? ' selected' : ''}>${escape(plain(types[id]))}</option>`).join('');

        const cards = layouts.map((layout, index) => {
            const slots = Array.isArray(layout.slots) ? layout.slots : (layout.slots = []);
            return `
                <div class="rr-slot-layout" data-layout="${index}">
                    <div class="rr-slot-layout-head">
                        <input type="text" class="database-field-value rr-slot-layout-name" data-layout="${index}" value="${escape(layout.name || '')}" placeholder="${escape(tt('Layout name'))}">
                        <button type="button" class="rr-btn-chip-danger rr-slot-layout-delete" data-layout="${index}" title="${escape(tt('Delete Layout'))}" aria-label="${escape(tt('Delete Layout'))}">&times;</button>
                    </div>
                    <div class="rr-slot-list" data-rr-i18n-skip>${slots.map((id, slot) => `
                        <div class="rr-slot-row" data-index="${slot}">
                            <button type="button" class="rr-slot-grip" data-layout="${index}" data-index="${slot}" title="${escape(tt('Drag to reorder'))}" aria-label="${escape(tt('Drag to reorder'))}"><span aria-hidden="true">⠿</span></button>
                            <span class="rr-slot-number">${slot + 1}</span>
                            <select class="database-field-value rr-slot-type" data-layout="${index}" data-index="${slot}">${options_(id)}</select>
                            <button type="button" class="rr-btn-chip rr-slot-remove" data-layout="${index}" data-index="${slot}" title="${escape(tt('Delete'))}" aria-label="${escape(tt('Delete'))}">&times;</button>
                        </div>`).join('')}</div>
                    <button type="button" class="rr-btn-chip rr-slot-add" data-layout="${index}">+ ${escape(tt('Add Slot'))}</button>
                </div>`;
        }).join('');

        host.innerHTML = `
            <header class="rr-types-panel-header rr-db-fold-header">
                <span>${escape(tt('Slot Layouts'))}</span>
                <span class="rr-types-count">${layouts.length}</span>
            </header>
            <div class="rr-slot-layouts-body">
                <p class="rr-slot-layouts-hint">${escape(tt('Equipment slots in order, a type as often as it is needed. A Slot Type trait picks a layout.'))}</p>
                <div class="rr-slot-layouts-list">${cards}
                    <button type="button" class="rr-btn-chip rr-slot-layout-add">+ ${escape(tt('Add Layout'))}</button>
                </div>
            </div>
        `;

        const redraw = (focus) => {
            const scroll = host.querySelector('.rr-slot-layouts-list')?.scrollLeft || 0;
            render(host, system, options);
            const list = host.querySelector('.rr-slot-layouts-list');
            if (list) list.scrollLeft = scroll;
            if (focus) host.querySelector(focus)?.focus({ preventScroll: true });
            changed();
        };
        const slotsOf = index => layouts[index].slots;

        host.querySelectorAll('.rr-slot-layout-name').forEach(input => input.addEventListener('input', () => {
            layouts[Number(input.dataset.layout)].name = input.value;
            changed();
        }));
        host.querySelectorAll('.rr-slot-type').forEach(select => select.addEventListener('change', () => {
            slotsOf(Number(select.dataset.layout))[Number(select.dataset.index)] = Number(select.value);
            changed();
        }));
        host.querySelectorAll('.rr-slot-remove').forEach(button => button.addEventListener('click', () => {
            slotsOf(Number(button.dataset.layout)).splice(Number(button.dataset.index), 1);
            redraw();
        }));
        // A new slot is of the type of the last one: a second Accessory under the first, ready to be changed.
        host.querySelectorAll('.rr-slot-add').forEach(button => button.addEventListener('click', () => {
            const index = Number(button.dataset.layout), slots = slotsOf(index);
            slots.push(slots.length ? slots[slots.length - 1] : (named[0] || 1));
            redraw(`.rr-slot-add[data-layout="${index}"]`);
        }));
        host.querySelector('.rr-slot-layout-add').addEventListener('click', () => {
            if (system.rrSlotLayouts !== layouts) system.rrSlotLayouts = layouts;
            layouts.push(newLayout(system, `${tt('Slot Layout')} ${layouts.length + 1}`));
            redraw(`.rr-slot-layout-name[data-layout="${layouts.length - 1}"]`);
            const field = host.querySelector(`.rr-slot-layout-name[data-layout="${layouts.length - 1}"]`);
            if (field) field.select();
        });
        host.querySelectorAll('.rr-slot-layout-delete').forEach(button => button.addEventListener('click', async () => {
            const index = Number(button.dataset.layout), layout = layouts[index];
            const uses = S ? S.layoutUses(options.data, index) : 0;
            const name = plain(layout.name) || `${tt('Slot Layout')} ${index + 1}`;
            const message = uses
                ? tt('Delete the slot layout "{name}"? {count} Slot Type traits pick it and go back to Normal.').replace('{name}', name).replace('{count}', uses)
                : tt('Delete the slot layout "{name}"?').replace('{name}', name);
            if (options.confirm && !(await options.confirm(message))) return;
            // The answer can come after the list changed.
            if (layouts[index] !== layout) return;
            if (S) S.removeLayout(options.data || { system }, index);
            else layouts.splice(index, 1);
            if (!layouts.length) delete system.rrSlotLayouts;
            redraw();
        }));

        // Order: a slot is dragged by its grip within its layout (or moved with the arrow keys while the
        // grip has the focus). The row under the pointer shows where it will stand.
        const move = (index, from, to, focus) => {
            const slots = slotsOf(index), next = S ? S.moveSlot(slots, from, to) : slots;
            if (next === slots) return;
            layouts[index].slots = next;
            redraw(focus ? `.rr-slot-grip[data-layout="${index}"][data-index="${Math.max(0, Math.min(next.length - 1, to))}"]` : null);
        };
        host.querySelectorAll('.rr-slot-grip').forEach(grip => {
            const index = Number(grip.dataset.layout), from = Number(grip.dataset.index);
            grip.addEventListener('keydown', event => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                event.preventDefault();
                move(index, from, from + (event.key === 'ArrowUp' ? -1 : 1), true);
            });
            grip.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                event.preventDefault();
                const rows = Array.from(grip.closest('.rr-slot-list').querySelectorAll('.rr-slot-row')), row = rows[from];
                let to = from;
                const placeAt = y => { let at = rows.length - 1; for (let i = 0; i < rows.length; i++) { const box = rows[i].getBoundingClientRect(); if (y < box.top + box.height / 2) { at = i; break; } } return at; };
                const show = () => rows.forEach((other, i) => { other.classList.toggle('is-dragging', other === row); other.classList.toggle('is-drop-before', i === to && to < from); other.classList.toggle('is-drop-after', i === to && to > from); });
                const onMove = moved => { to = placeAt(moved.clientY); show(); };
                const end = done => {
                    document.removeEventListener('pointermove', onMove, true);
                    document.removeEventListener('pointerup', onUp, true);
                    document.removeEventListener('pointercancel', onCancel, true);
                    rows.forEach(other => other.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after'));
                    if (done) move(index, from, to, false);
                };
                const onUp = () => end(true), onCancel = () => end(false);
                document.addEventListener('pointermove', onMove, true);
                document.addEventListener('pointerup', onUp, true);
                document.addEventListener('pointercancel', onCancel, true);
                show();
            });
        });
    };

    const api = { render, newLayout };
    root.RRSlotLayoutsSection = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
