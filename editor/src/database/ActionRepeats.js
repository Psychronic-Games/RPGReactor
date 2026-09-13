/**
 * ActionRepeats - how many times a skill or item hits, fixed or as a range.
 *
 * `repeats` is the fewest hits and is always present, as it always was. A
 * range adds `repeatsMax`, written only while it is above `repeats` and
 * deleted the moment it is not. So a fixed count is stored exactly as it was
 * before this existed, and a plugin that only knows `repeats` sees the low
 * end rather than nothing. The runtime rolls between the two once per action
 * (`Game_Action.prototype.itemRepeats`).
 *
 * Skills and Items write the same shape into the same fields, so both editors
 * share this one module rather than keeping a copy each.
 */
class ActionRepeats {
    static _t(text) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text;
    }

    static limit() {
        return globalThis.RR_LIMITS?.ACTION_REPEATS || 100;
    }

    /** The low end, clamped the way the Repeats field has always clamped it. */
    static min(record) {
        return Math.max(1, Math.min(ActionRepeats.limit(), parseInt(record?.repeats) || 1));
    }

    /** The high end as the field shows it: never below the low end. */
    static max(record) {
        return Math.max(ActionRepeats.min(record), Math.min(ActionRepeats.limit(), parseInt(record?.repeatsMax) || 0));
    }

    /**
     * Write one end of the range and return what that field should now show.
     * Raising Repeats to or past the maximum collapses the range back to a
     * fixed count, rather than leaving a maximum below the minimum on disk.
     */
    static write(record, field, value) {
        const limit = ActionRepeats.limit();
        if (field === 'repeatsMax') {
            record.repeatsMax = Math.min(limit, parseInt(value) || 0);
        } else {
            record.repeats = Math.max(1, Math.min(limit, parseInt(value) || 0));
        }
        if (!(record.repeatsMax > record.repeats)) delete record.repeatsMax;
        return field === 'repeatsMax' ? ActionRepeats.max(record) : record.repeats;
    }

    /** The Repeats box: the low end, in the cell the single field always had. */
    static minFieldHTML(record, idAttribute) {
        return `<input type="number" class="database-field-value" value="${ActionRepeats.min(record)}" min="1" max="${ActionRepeats.limit()}" data-field="repeats" ${idAttribute}="${rrEscapeHtml(record.id)}">`;
    }

    /**
     * The Max Repeats row, to sit directly under the row holding Repeats. The
     * form's value columns are too narrow for two boxes in one cell, so the
     * high end takes a pair of its own. `underRight` lines it up beneath a
     * Repeats field in the right-hand pair.
     */
    static maxRowHTML(record, idAttribute, underRight = false) {
        const hint = rrEscapeHtml(ActionRepeats._t('Most repeats. Each use rolls a count from Repeats up to this; the same number keeps it fixed.'));
        const placement = underRight ? ' class="db-pair-right"' : '';
        return `<div class="db-row-pair">
                        <label${placement} title="${hint}">${rrEscapeHtml(ActionRepeats._t('Max Repeats'))}</label>
                        <input type="number" class="database-field-value" value="${ActionRepeats.max(record)}" min="1" max="${ActionRepeats.limit()}" data-field="repeatsMax" ${idAttribute}="${rrEscapeHtml(record.id)}" title="${hint}">
                    </div>`;
    }

    /** After either end changes, show both as stored: one can move the other. */
    static syncFields(container, record, idAttribute) {
        if (!container || !record) return;
        const selector = field => `[data-field="${field}"][${idAttribute}="${record.id}"]`;
        const low = container.querySelector(selector('repeats'));
        const high = container.querySelector(selector('repeatsMax'));
        if (low) low.value = String(ActionRepeats.min(record));
        if (high) high.value = String(ActionRepeats.max(record));
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.ActionRepeats = ActionRepeats;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActionRepeats;
}
