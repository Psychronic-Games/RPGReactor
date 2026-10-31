/**
 * ActionElements - the elements a skill or item carries, and the field that
 * edits them.
 *
 * A damage block always has `elementId`: the one element, or -1 for Normal
 * Attack (the user's own attack elements). Two or more elements are kept in
 * `elementIds`, written only when there are at least two and deleted when
 * the count drops back, with `elementIds[0] === elementId` as an invariant.
 * So every entry authored before this existed is untouched, a single-element
 * entry authored after it is indistinguishable from one authored before, and
 * a plugin that only knows `elementId` sees the first element rather than
 * nothing.
 *
 * Skills and Items write the same shape into the same field, so both editors
 * share this one module rather than keeping a copy each (GitHub #17).
 */
class ActionElements {
    /** How many chosen elements the field names before it counts them instead. */
    static SUMMARY_NAMES = 3;

    static _t(text, params) {
        let value = typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text;
        for (const [key, replacement] of Object.entries(params || {})) {
            value = value.split(`{${key}}`).join(String(replacement));
        }
        return value;
    }

    /** The chosen element ids, in the author's order; empty for Normal Attack. */
    static ids(damage) {
        if (!damage) return [];
        const list = Array.isArray(damage.elementIds) ? damage.elementIds.filter(id => Number(id) > 0).map(Number) : [];
        if (list.length) return list;
        const one = Number(damage.elementId);
        return one > 0 ? [one] : [];
    }

    /** Whether the block means Normal Attack: no element chosen at all. */
    static isNormalAttack(damage) {
        return ActionElements.ids(damage).length === 0;
    }

    /**
     * Write a chosen list back, keeping the invariants: `elementId` is the
     * first element or -1, `elementIds` exists only for two or more, and
     * neither carries a 0, a -1 or a repeat.
     */
    static write(damage, ids) {
        const seen = new Set();
        const list = [];
        for (const raw of Array.isArray(ids) ? ids : []) {
            const id = Number(raw);
            if (!(id > 0) || seen.has(id)) continue;
            seen.add(id);
            list.push(id);
        }
        damage.elementId = list.length ? list[0] : -1;
        if (list.length >= 2) damage.elementIds = list;
        else delete damage.elementIds;
        return damage;
    }

    /** A name with any icon code removed, for matching and for plain text. */
    static plainName(name) {
        const text = String(name == null ? '' : name);
        return typeof window !== 'undefined' && window.RRIconCodes && window.RRIconCodes.strip
            ? window.RRIconCodes.strip(text).trim()
            : text.replace(/\\I\[\d+\]/gi, '').trim();
    }

    /**
     * Elements a `<Multi-Element: ...>` note adds, the way ElementStatusCore
     * reads it: ids or names, comma-separated, the tag repeated as often as
     * the author likes, names compared with their icon codes stripped.
     */
    static fromNote(note, names) {
        const found = [];
        const text = String(note == null ? '' : note);
        const pattern = /<Multi-Element:\s*([^>]+)>/gi;
        let match;
        while ((match = pattern.exec(text))) {
            for (const part of match[1].split(',')) {
                const token = part.trim();
                if (!token) continue;
                let id = /^\d+$/.test(token) ? Number(token) : -1;
                if (!(id > 0)) {
                    const wanted = ActionElements.plainName(token).toLowerCase();
                    id = (names || []).findIndex((name, index) => index > 0 && ActionElements.plainName(name).toLowerCase() === wanted);
                }
                if (id > 0 && !found.includes(id) && (!names || id < names.length)) found.push(id);
            }
        }
        return found;
    }

    /** What the field says: the element, a few of them, or how many. */
    static summary(names, damage, note) {
        const chosen = ActionElements.ids(damage);
        const extra = ActionElements.fromNote(note, names).filter(id => !chosen.includes(id));
        const all = chosen.concat(extra);
        if (!all.length) return ActionElements._t('Normal Attack');
        if (all.length > ActionElements.SUMMARY_NAMES) return ActionElements._t('{count} elements', { count: all.length });
        return all.map(id => ActionElements.plainName((names || [])[id]) || `#${id}`).join(', ');
    }

    /**
     * The field's markup: a button the width of the dropdown it replaces,
     * naming the selection. `kind` is 'skill' or 'item' and carries the
     * record id the editors already key their fields on.
     */
    static fieldHtml(kind, id, names, damage, note) {
        const escape = value => (typeof globalThis.rrEscapeHtml === 'function'
            ? globalThis.rrEscapeHtml(value)
            : String(value == null ? '' : value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'));
        const summary = ActionElements.summary(names, damage, note);
        // Dressed as the themed dropdown every other field here is (the
        // select shim's trigger: panel background, accent border, gold
        // caret), and sized by the same `.rr-shim-wrapper` rules. The label
        // is data (element names), not a phrase: without the skip the
        // editor's translator puts the first text back after every change.
        return `<div class="rr-shim-wrapper rr-elements-field" role="button" tabindex="0" data-elements-kind="${escape(kind)}" data-elements-id="${escape(id)}" data-rr-i18n-skip="1"`
            + ` title="${escape(ActionElements._t('Choose the elements this action carries.'))}" style="position:relative;display:inline-block;min-width:0;">`
            + `<div class="rr-shim-trigger" style="${ActionElements.TRIGGER_CSS}"><span class="rr-shim-label rr-elements-label">${escape(summary)}</span>`
            + `<span style="${ActionElements.CARET_CSS}">▼</span></div></div>`;
    }

    /** The select shim's trigger and caret, so the field cannot drift from the dropdowns beside it. */
    static TRIGGER_CSS = 'position:relative;background:var(--color-bg-panel);border:1px solid var(--color-accent-border);color:var(--color-text-strong);'
        + 'border-radius:var(--radius-md);padding:4px 24px 4px 10px;font-size:var(--font-size-base);font-weight:600;cursor:pointer;user-select:none;'
        + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:border-color var(--ease-base);min-width:60px;';
    static CARET_CSS = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:9px;color:var(--color-accent-bright);pointer-events:none;';

    /**
     * Wire every element field in `container`. `options.names` is the
     * System element list; `options.record(id)` returns `{ damage, note }`
     * for a record; `options.onChange(id, ids)` is told the new list, and
     * the field re-labels itself from `record` afterwards.
     */
    static bindTriggers(container, options) {
        if (!container || !container.querySelectorAll) return;
        container.querySelectorAll('.rr-elements-field').forEach(button => {
            if (button.dataset.rrElementsBound) return;
            button.dataset.rrElementsBound = '1';
            const trigger = button.querySelector('.rr-shim-trigger') || button;
            trigger.addEventListener('mouseenter', () => { trigger.style.borderColor = 'var(--color-accent-border-strong)'; });
            trigger.addEventListener('mouseleave', () => { if (!(ActionElements._open && ActionElements._open.button === button)) trigger.style.borderColor = 'var(--color-accent-border)'; });
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                ActionElements.open(button, options);
            });
            button.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ActionElements.open(button, options); }
            });
        });
    }

    static close() {
        const open = ActionElements._open;
        if (!open) return;
        ActionElements._open = null;
        document.removeEventListener('mousedown', open.onDown, true);
        document.removeEventListener('keydown', open.onKey, true);
        if (open.panel.parentNode) open.panel.parentNode.removeChild(open.panel);
        const trigger = open.button.querySelector('.rr-shim-trigger');
        if (trigger) trigger.style.borderColor = 'var(--color-accent-border)';
    }

    /** The checkbox panel under `button`; a second click on the button closes it. */
    static open(button, options) {
        if (ActionElements._open && ActionElements._open.button === button) { ActionElements.close(); return; }
        ActionElements.close();
        const id = button.dataset.elementsId;
        const record = options.record(id) || {};
        const names = options.names || [];
        const fromNote = ActionElements.fromNote(record.note, names);
        let chosen = ActionElements.ids(record.damage);
        const nameHtml = name => (typeof window !== 'undefined' && window.RRIconCodes
            ? window.RRIconCodes.html(name)
            : (typeof globalThis.rrEscapeHtml === 'function' ? globalThis.rrEscapeHtml(name) : String(name)));

        const label = button.querySelector('.rr-elements-label') || button;
        const trigger = button.querySelector('.rr-shim-trigger');
        if (trigger) trigger.style.borderColor = 'var(--color-accent-border-strong)';

        // The select shim's popup, row for row, with a checkbox in front of
        // each name: a checked row wears the accent tint the shim gives its
        // active option, and hovering tints the rest.
        const rect = button.getBoundingClientRect();
        const view = button.ownerDocument?.defaultView || window;
        const spaceBelow = view.innerHeight - rect.bottom - 10;
        const spaceAbove = rect.top - 10;
        const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
        const maxH = Math.min(360, Math.max(140, openUp ? spaceAbove : spaceBelow));
        const panel = document.createElement('div');
        panel.className = 'rr-shim-popup rr-elements-popover';
        panel.style.cssText = `position:fixed;left:${rect.left}px;${openUp ? `bottom:${view.innerHeight - rect.top + 2}px;` : `top:${rect.bottom + 2}px;`}`
            + `min-width:${Math.max(rect.width, 200)}px;max-height:${maxH}px;display:flex;flex-direction:column;`
            + 'background:var(--color-bg-panel);border:1px solid var(--color-accent-border-strong);border-radius:var(--radius-md);'
            + 'z-index:100000;box-shadow:var(--shadow-popup);font-family:inherit;';
        const list = document.createElement('div');
        list.style.cssText = 'overflow-y:auto;flex:1 1 auto;min-height:0;';
        list.addEventListener('wheel', event => event.stopPropagation());
        panel.appendChild(list);
        const rows = [];
        const row = (labelHtml, checked, fixed, tag) => {
            const line = document.createElement('label');
            line.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 12px;cursor:pointer;'
                + 'font-size:var(--font-size-base);font-weight:600;color:var(--color-text-strong);transition:background var(--ease-fast);white-space:nowrap;';
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.className = 'system-checkbox';
            box.checked = checked;
            box.style.margin = '0';
            if (fixed) {
                // A note-tag element is part of the action but not the
                // editor's to untick; it reads like any other row.
                box.tabIndex = -1;
                box.addEventListener('click', event => event.preventDefault());
            }
            const text = document.createElement('span');
            text.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;';
            text.innerHTML = labelHtml;
            const badge = document.createElement('span');
            badge.className = 'rr-elements-badge';
            badge.style.cssText = 'font-size:var(--font-size-sm);font-weight:400;color:var(--color-text-muted);white-space:nowrap;';
            if (tag) badge.textContent = tag;
            line.append(box, text, badge);
            line.addEventListener('mouseenter', () => { if (!box.checked) line.style.background = 'var(--color-accent-tint-15)'; });
            line.addEventListener('mouseleave', () => { if (!box.checked) line.style.background = 'transparent'; });
            list.appendChild(line);
            return { line, box, badge };
        };

        // Normal Attack is a mode, pinned first: checking it clears the
        // elements, and checking any element clears it.
        const normal = row(nameHtml(ActionElements._t('Normal Attack')), chosen.length === 0, false, '');
        const separator = document.createElement('div');
        separator.style.cssText = 'height:1px;margin:4px 0;background:var(--color-border);';
        list.appendChild(separator);
        names.forEach((name, index) => {
            if (!(index > 0) || !name) return;
            const inNote = fromNote.includes(index);
            const entry = row(nameHtml(name), inNote || chosen.includes(index), inNote, inNote ? ActionElements._t('From the note') : '');
            entry.id = index;
            rows.push(entry);
        });
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:6px 12px;color:var(--color-text-muted);font-size:var(--font-size-sm);';
            empty.textContent = ActionElements._t('No elements are named in Database › Types.');
            list.appendChild(empty);
        }

        const tint = entry => { entry.line.style.background = entry.box.checked ? 'var(--color-accent-tint-25)' : 'transparent'; };
        const paint = () => {
            normal.box.checked = chosen.length === 0;
            tint(normal);
            for (const entry of rows) {
                if (!fromNote.includes(entry.id)) {
                    entry.box.checked = chosen.includes(entry.id);
                    // The first chosen element is what `elementId` mirrors,
                    // and so what an element-unaware plugin sees; say which.
                    entry.badge.textContent = chosen.length > 1 && chosen[0] === entry.id ? ActionElements._t('First') : '';
                }
                tint(entry);
            }
            label.textContent = ActionElements.summary(names, options.record(id).damage, options.record(id).note);
        };
        paint();
        const commit = () => {
            options.onChange(id, chosen.slice());
            paint();
        };
        normal.box.addEventListener('change', () => {
            chosen = [];
            commit();
        });
        for (const entry of rows) {
            if (fromNote.includes(entry.id)) continue;
            entry.box.addEventListener('change', () => {
                // Selection order is the stored order.
                chosen = chosen.filter(v => v !== entry.id);
                if (entry.box.checked) chosen.push(entry.id);
                commit();
            });
        }

        document.body.appendChild(panel);

        const onDown = event => {
            if (panel.contains(event.target) || event.target === button) return;
            ActionElements.close();
        };
        const onKey = event => {
            if (event.key === 'Escape') { event.stopPropagation(); ActionElements.close(); button.focus(); }
        };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey, true);
        ActionElements._open = { button, panel, onDown, onKey };
        const first = panel.querySelector('input:not(:disabled)');
        if (first) first.focus();
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.ActionElements = ActionElements;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActionElements;
}
