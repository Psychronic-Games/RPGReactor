/**
 * RREnemyEquipment - an enemy's equipment: the shared model, and the window
 * Database > Enemies > Equipment... opens.
 *
 * An enemy's loadout is its optional `rrEquipment` list of rows
 * `{ etypeId, kind, itemId }`, in slot order. `kind` is the drop-item numbering
 * (2 weapon, 3 armor, 0 an empty slot). The game reads the same rows through
 * Game_Enemy.equips (runtime/reactor_objects_battlers.js), while Database >
 * Reactor Features has Enemy Equipment on.
 *
 * The window edits a draft. Nothing reaches the enemy until OK, and opening it
 * and pressing OK without changing anything writes nothing.
 *
 * The parameter columns here and on the enemy's page both come from preview().
 * It is the engine's own sum, base plus each item's parameter, and leaves out
 * what only exists in a running game: plugin processing, JavaScript, battle
 * states and random variance. No project code ever runs in the editor.
 */
(function(root) {
    'use strict';

    const PARAM_COUNT = 8;
    const WEAPON = 2;
    const ARMOR = 3;
    const tt = text => (root.I18n ? root.I18n.tText(text) : text);
    const rrEscapeHtml = root.rrEscapeHtml || require('../utils/HtmlEscape.js');

    /** Whether Database > Reactor Features has Enemy Equipment on. */
    function on(databaseManager) {
        const features = root.ReactorFeatures;
        return !!features && features.on('enemyEquipment', databaseManager?.getSystem?.() || {});
    }

    function equipTypes(system) {
        const names = Array.isArray(system?.equipTypes) ? system.equipTypes : [];
        const types = [];
        names.forEach((name, id) => {
            if (id > 0 && String(name || '').trim()) types.push({ id, name: String(name) });
        });
        return types;
    }

    function typeName(system, etypeId) {
        const found = equipTypes(system).find(type => type.id === etypeId);
        return found ? found.name : `#${etypeId}`;
    }

    function normalizedRow(row) {
        const etypeId = Math.max(0, Math.floor(Number(row?.etypeId)) || 0);
        const itemId = Math.max(0, Math.floor(Number(row?.itemId)) || 0);
        const kind = Number(row?.kind) === WEAPON || Number(row?.kind) === ARMOR ? Number(row.kind) : 0;
        return { etypeId, kind: itemId > 0 ? kind : 0, itemId: kind ? itemId : 0 };
    }

    /** The enemy's rows, as a copy that can be edited freely. */
    function rows(enemy) {
        return (Array.isArray(enemy?.rrEquipment) ? enemy.rrEquipment : []).filter(Boolean).map(normalizedRow);
    }

    /** A new loadout: one empty slot for each named equipment type. */
    function defaultRows(system) {
        return equipTypes(system).map(type => ({ etypeId: type.id, kind: 0, itemId: 0 }));
    }

    /** Writes rows to the enemy; an enemy with no slots carries no field at all. */
    function store(enemy, list) {
        const next = (list || []).map(normalizedRow);
        if (next.length) enemy.rrEquipment = next; else delete enemy.rrEquipment;
    }

    function entries(kind, databaseManager) {
        if (kind === WEAPON) return databaseManager?.getWeapons?.() || [];
        if (kind === ARMOR) return databaseManager?.getArmors?.() || [];
        return [];
    }

    /**
     * What a row holds. `problem` is 'missing' for an entry that no longer
     * exists and 'type' for one no longer of the slot's equipment type; either
     * way the game gives it no effect (Game_Enemy.rrEquipItem).
     */
    function resolve(row, databaseManager) {
        if (!row || !row.kind || row.itemId <= 0) return { item: null, problem: '' };
        const item = entries(row.kind, databaseManager).find(entry => entry && entry.id === row.itemId) || null;
        if (!item) return { item: null, problem: 'missing' };
        return { item, problem: item.etypeId === row.etypeId ? '' : 'type' };
    }

    function problemText(row, problem) {
        if (problem === 'missing') return tt('Missing item #{n}').replace('{n}', row.itemId);
        if (problem === 'type') return tt('Item #{n} no longer fits this slot').replace('{n}', row.itemId);
        return '';
    }

    function total(base, bonus) {
        return Math.max(0, (Number(base) || 0) + (Number(bonus) || 0));
    }

    /** One `{ base, bonus, total }` per parameter, the two pages' one calculation. */
    function preview(params, list, databaseManager) {
        const bonus = new Array(PARAM_COUNT).fill(0);
        for (const row of list || []) {
            const { item, problem } = resolve(row, databaseManager);
            if (!item || problem) continue;
            for (let id = 0; id < PARAM_COUNT; id++) bonus[id] += Number(item.params?.[id]) || 0;
        }
        return bonus.map((value, id) => {
            const base = Number(params?.[id]) || 0;
            return { base, bonus: value, total: total(base, value) };
        });
    }

    function signed(value) {
        return value > 0 ? `+${value}` : String(value);
    }

    /** The items a slot of this type can hold, weapons first, filtered by name or #id. */
    function matches(etypeId, databaseManager, query) {
        const needle = String(query || '').trim().toLowerCase();
        const found = [];
        for (const kind of [WEAPON, ARMOR]) {
            for (const item of entries(kind, databaseManager)) {
                // A nameless entry is a list separator, not equipment.
                if (!item || item.id <= 0 || item.etypeId !== etypeId || !String(item.name || '').trim()) continue;
                const label = `#${item.id} ${item.name || ''}`;
                if (!needle || label.toLowerCase().includes(needle)) found.push({ kind, id: item.id, item, label });
            }
        }
        return found;
    }

    /**
     * Opens the window for an enemy. `onSave()` runs after OK has stored a
     * changed loadout. Returns the overlay element.
     */
    function open({ enemy, databaseManager, commonUI, onSave }) {
        const system = databaseManager.getSystem?.() || {};
        const configured = rows(enemy);
        const state = {
            rows: configured.length ? configured : defaultRows(system),
            selected: 0,
            query: '',
            active: -1,
            shown: [],
            dirty: false
        };

        const title = `${tt('Equipment')} — ${enemy.name || `#${enemy.id}`}`;
        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay rr-enemy-equip-overlay';
        overlay.style.zIndex = '21000';
        overlay.innerHTML = `
            <div class="rr-modal rr-enemy-equip" role="dialog" aria-label="${rrEscapeHtml(title)}">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${rrEscapeHtml(title)}</div>
                    <button type="button" class="rr-modal-close ee-cancel">&times;</button>
                </div>
                <div class="rr-modal-body rr-enemy-equip-body">
                    <section class="ee-col">
                        <div class="ee-heading">${rrEscapeHtml(tt('Slots'))}</div>
                        <div class="ee-list ee-slots" tabindex="0" role="listbox" aria-label="${rrEscapeHtml(tt('Slots'))}"></div>
                        <div class="ee-tools">
                            <select class="ee-add-type" aria-label="${rrEscapeHtml(tt('Equipment Type'))}">
                                ${equipTypes(system).map(type => `<option value="${type.id}">${rrEscapeHtml(type.name)}</option>`).join('')}
                            </select>
                            <button type="button" class="rr-btn-chip ee-add">${rrEscapeHtml(tt('Add Slot'))}</button>
                        </div>
                        <div class="ee-tools">
                            <button type="button" class="rr-btn-chip ee-repeat">${rrEscapeHtml(tt('Repeat'))}</button>
                            <button type="button" class="rr-btn-chip ee-up">${rrEscapeHtml(tt('Move Up'))}</button>
                            <button type="button" class="rr-btn-chip ee-down">${rrEscapeHtml(tt('Move Down'))}</button>
                            <button type="button" class="rr-btn-chip ee-remove">${rrEscapeHtml(tt('Remove'))}</button>
                        </div>
                    </section>
                    <section class="ee-col">
                        <div class="ee-heading">${rrEscapeHtml(tt('Item'))}</div>
                        <input type="search" class="ee-search" placeholder="${rrEscapeHtml(tt('Search...'))}" aria-label="${rrEscapeHtml(tt('Search...'))}" spellcheck="false">
                        <div class="ee-list ee-items" tabindex="0" role="listbox" aria-label="${rrEscapeHtml(tt('Item'))}"></div>
                    </section>
                    <section class="ee-col ee-info">
                        <div class="ee-heading">${rrEscapeHtml(tt('Details'))}</div>
                        <div class="ee-details"></div>
                        <div class="ee-heading">${rrEscapeHtml(tt('Parameters'))}</div>
                        <table class="traits-table ee-totals">
                            <thead><tr>
                                <th>${rrEscapeHtml(tt('Parameter'))}</th>
                                <th>${rrEscapeHtml(tt('Base'))}</th>
                                <th>${rrEscapeHtml(tt('Equipment Bonus'))}</th>
                                <th>${rrEscapeHtml(tt('Equipped Total'))}</th>
                            </tr></thead>
                            <tbody></tbody>
                        </table>
                        <div class="ee-note">${rrEscapeHtml(tt('Totals leave out plugin processing, JavaScript, battle states and random variance.'))}</div>
                    </section>
                </div>
                <div class="rr-modal-footer">
                    <button type="button" class="rr-btn-secondary ee-cancel">${rrEscapeHtml(tt('Cancel'))}</button>
                    <button type="button" class="rr-button-primary ee-ok">${rrEscapeHtml(tt('OK'))}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const q = selector => overlay.querySelector(selector);
        const slotsEl = q('.ee-slots');
        const itemsEl = q('.ee-items');
        const searchEl = q('.ee-search');
        const detailsEl = q('.ee-details');

        const close = () => { keys?.leave?.(); overlay.remove(); };
        const keys = typeof RRKeyboardNavigation !== 'undefined' && RRKeyboardNavigation.modal
            ? RRKeyboardNavigation.modal(overlay, { onEscape: () => close() }) : null;

        const currentRow = () => state.rows[state.selected] || null;
        const clampSelection = () => {
            state.selected = Math.min(Math.max(0, state.selected), Math.max(0, state.rows.length - 1));
        };

        function renderSlots() {
            clampSelection();
            if (!state.rows.length) {
                slotsEl.innerHTML = `<div class="ee-empty">${rrEscapeHtml(tt('No equipment slots'))}</div>`;
            } else {
                slotsEl.innerHTML = state.rows.map((row, index) => {
                    const { item, problem } = resolve(row, databaseManager);
                    const body = problem
                        ? `<span class="ee-warning">⚠ ${rrEscapeHtml(problemText(row, problem))}</span>`
                        : rrEscapeHtml(item ? item.name : tt('None'));
                    return `<div class="ee-row${index === state.selected ? ' is-selected' : ''}" role="option" aria-selected="${index === state.selected}" data-index="${index}">
                        <span class="ee-number">${index + 1}</span>
                        <span class="ee-type">${rrEscapeHtml(typeName(system, row.etypeId))}</span>
                        <span class="ee-value">${body}</span>
                    </div>`;
                }).join('');
                slotsEl.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
            }
            const has = state.rows.length > 0;
            q('.ee-repeat').disabled = !has;
            q('.ee-remove').disabled = !has;
            q('.ee-up').disabled = !has || state.selected === 0;
            q('.ee-down').disabled = !has || state.selected >= state.rows.length - 1;
            q('.ee-add').disabled = equipTypes(system).length === 0;
        }

        function renderItems() {
            const row = currentRow();
            state.shown = row ? [{ kind: 0, id: 0, item: null, label: tt('None') }]
                .concat(matches(row.etypeId, databaseManager, state.query)) : [];
            if (state.active >= state.shown.length) state.active = state.shown.length - 1;
            searchEl.disabled = !row;
            itemsEl.innerHTML = state.shown.map((match, index) => {
                const held = row.kind === match.kind && row.itemId === match.id;
                return `<div class="ee-row${held ? ' is-held' : ''}${index === state.active ? ' is-active' : ''}" role="option" aria-selected="${held}" data-index="${index}">
                    <span class="ee-value">${rrEscapeHtml(match.label)}</span>
                </div>`;
            }).join('');
            itemsEl.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
            renderDetails();
        }

        function renderDetails() {
            const row = currentRow();
            const hovered = state.shown[state.active];
            const held = row ? resolve(row, databaseManager) : { item: null, problem: '' };
            const item = hovered ? hovered.item : held.item;
            if (!hovered && held.problem) {
                detailsEl.innerHTML = `<div class="ee-warning">⚠ ${rrEscapeHtml(problemText(row, held.problem))}</div>`;
                return;
            }
            if (!item) {
                detailsEl.innerHTML = `<div class="ee-empty">${rrEscapeHtml(tt('No item selected'))}</div>`;
                return;
            }
            const names = globalThis.rrParamNames ? globalThis.rrParamNames(tt) : [];
            const params = (item.params || [])
                .map((value, id) => (value ? `${names[id] || id} ${signed(value)}` : ''))
                .filter(Boolean).join(', ');
            const traits = (item.traits || []).map(trait => `<li>${rrEscapeHtml(commonUI?.getTraitName?.(trait.code) ?? trait.code)}: ${commonUI?.getTraitValueHtml?.(trait) ?? ''}</li>`).join('');
            detailsEl.innerHTML = `
                <div class="ee-item-name">${rrEscapeHtml(item.name || '')}</div>
                ${item.description ? `<div class="ee-item-description">${rrEscapeHtml(item.description)}</div>` : ''}
                ${params ? `<div class="ee-item-params">${rrEscapeHtml(params)}</div>` : ''}
                ${traits ? `<ul class="ee-item-traits">${traits}</ul>` : ''}`;
        }

        function renderTotals() {
            const names = globalThis.rrParamNames ? globalThis.rrParamNames(tt) : [];
            q('.ee-totals tbody').innerHTML = preview(enemy.params, state.rows, databaseManager).map((entry, id) => `
                <tr>
                    <td>${rrEscapeHtml(names[id] || id)}</td>
                    <td>${entry.base}</td>
                    <td>${signed(entry.bonus)}</td>
                    <td>${entry.total}</td>
                </tr>`).join('');
        }

        function renderAll() {
            renderSlots();
            renderItems();
            renderTotals();
        }

        function selectSlot(index) {
            state.selected = index;
            state.active = -1;
            renderAll();
        }

        function applyMatch(match) {
            const row = currentRow();
            if (!row || !match) return;
            if (row.kind !== match.kind || row.itemId !== match.id) state.dirty = true;
            row.kind = match.kind;
            row.itemId = match.id;
            renderAll();
        }

        function moveSlot(step) {
            const target = state.selected + step;
            if (target < 0 || target >= state.rows.length) return;
            const [row] = state.rows.splice(state.selected, 1);
            state.rows.splice(target, 0, row);
            state.selected = target;
            state.dirty = true;
            renderAll();
        }

        function removeSlot() {
            if (!state.rows.length) return;
            state.rows.splice(state.selected, 1);
            state.dirty = true;
            state.active = -1;
            renderAll();
        }

        function insertSlot(etypeId, at) {
            state.rows.splice(at, 0, { etypeId, kind: 0, itemId: 0 });
            state.selected = at;
            state.active = -1;
            state.dirty = true;
            renderAll();
        }

        slotsEl.addEventListener('click', event => {
            const row = event.target.closest('.ee-row');
            if (row) selectSlot(Number(row.dataset.index));
        });
        itemsEl.addEventListener('click', event => {
            const row = event.target.closest('.ee-row');
            if (!row) return;
            state.active = Number(row.dataset.index);
            applyMatch(state.shown[state.active]);
        });
        itemsEl.addEventListener('mouseover', event => {
            const row = event.target.closest('.ee-row');
            if (!row || Number(row.dataset.index) === state.active) return;
            itemsEl.querySelector('.is-active')?.classList.remove('is-active');
            row.classList.add('is-active');
            state.active = Number(row.dataset.index);
            renderDetails();
        });
        itemsEl.addEventListener('mouseleave', () => {
            state.active = -1;
            itemsEl.querySelector('.is-active')?.classList.remove('is-active');
            renderDetails();
        });

        const swallow = event => { event.preventDefault(); event.stopPropagation(); };
        slotsEl.addEventListener('keydown', event => {
            const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
            if (step) {
                swallow(event);
                if (event.altKey) moveSlot(step);
                else if (state.selected + step >= 0 && state.selected + step < state.rows.length) selectSlot(state.selected + step);
            } else if (event.key === 'Delete') {
                swallow(event);
                removeSlot();
            } else if (event.key === 'Enter') {
                swallow(event);
                searchEl.focus();
            }
        });
        searchEl.addEventListener('input', () => {
            state.query = searchEl.value;
            state.active = -1;
            renderItems();
        });
        searchEl.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown') {
                swallow(event);
                state.active = Math.min(state.shown.length - 1, Math.max(0, state.active));
                renderItems();
                itemsEl.focus();
            } else if (event.key === 'Enter') {
                swallow(event);
                // With a filter typed, Enter takes the first match rather than None.
                applyMatch(state.shown[state.active >= 0 ? state.active : (state.query.trim() && state.shown.length > 1 ? 1 : 0)]);
            }
        });
        itemsEl.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                swallow(event);
                const step = event.key === 'ArrowDown' ? 1 : -1;
                if (step < 0 && state.active <= 0) {
                    state.active = -1;
                    renderItems();
                    searchEl.focus();
                    return;
                }
                state.active = Math.min(state.shown.length - 1, state.active + step);
                renderItems();
            } else if (event.key === 'Enter') {
                swallow(event);
                applyMatch(state.shown[state.active]);
            }
        });

        q('.ee-add').addEventListener('click', () => {
            insertSlot(Number(q('.ee-add-type').value), state.rows.length);
        });
        q('.ee-repeat').addEventListener('click', () => {
            const row = currentRow();
            if (row) insertSlot(row.etypeId, state.selected + 1);
        });
        q('.ee-up').addEventListener('click', () => moveSlot(-1));
        q('.ee-down').addEventListener('click', () => moveSlot(1));
        q('.ee-remove').addEventListener('click', removeSlot);
        overlay.querySelectorAll('.ee-cancel').forEach(button => button.addEventListener('click', close));
        q('.ee-ok').addEventListener('click', () => {
            if (state.dirty) {
                store(enemy, state.rows);
                databaseManager.updateEnemy?.(enemy.id, enemy);
            }
            const saved = state.dirty;
            close();
            if (saved) onSave?.();
        });

        renderAll();
        slotsEl.focus();
        return overlay;
    }

    const api = { on, equipTypes, typeName, rows, defaultRows, store, resolve, preview, total, signed, matches, open };
    root.RREnemyEquipment = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
