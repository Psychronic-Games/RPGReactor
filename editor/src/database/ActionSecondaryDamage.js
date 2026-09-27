/**
 * ActionSecondaryDamage - a second resource moved by the same hit, and the
 * row that edits it.
 *
 * `damage.secondary` is written only while the skill or item has one, so
 * every entry authored before this existed is untouched and a plugin that
 * only knows `damage.type` sees the primary as it always did:
 *
 *     { effect: 'damage' | 'recover' | 'drain',
 *       basis: 'rate' | 'formula', rate: 100, formula: '' }
 *
 * It stores an effect, not a type: the resource is always the one the
 * primary does not use. Two effects on one resource (HP Damage with HP
 * Drain) therefore cannot be written, and changing the primary from HP to MP
 * carries an MP Drain over to an HP Drain rather than leaving a pair that
 * contradicts itself. Both `rate` and `formula` are kept whichever basis is
 * chosen, so switching back and forth loses nothing. The runtime reads it
 * in `Game_Action.prototype.secondaryDamage`.
 *
 * Skills and Items write the same shape, so both editors share this module.
 */
class ActionSecondaryDamage {
    static EFFECTS = ['damage', 'recover', 'drain'];
    static BASES = ['rate', 'formula'];
    static DEFAULT_RATE = 100;
    static MAX_RATE = 1000;

    static _t(text) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text;
    }

    /** The stored block when it names a known effect, otherwise null. */
    static read(damage) {
        const secondary = damage && damage.secondary;
        if (!secondary || !ActionSecondaryDamage.EFFECTS.includes(secondary.effect)) return null;
        return secondary;
    }

    /**
     * The damage-type index each effect becomes for this primary: an HP
     * primary (odd types) moves MP (2, 4, 6), an MP primary moves HP. With
     * no primary the row is disabled and shows the MP names.
     */
    static typeFor(primaryType, effect) {
        const index = ActionSecondaryDamage.EFFECTS.indexOf(effect);
        if (index < 0) return 0;
        const primaryIsMp = primaryType > 0 && primaryType % 2 === 0;
        return index * 2 + (primaryIsMp ? 1 : 2);
    }

    static clampRate(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(ActionSecondaryDamage.MAX_RATE, n));
    }

    /**
     * Write one field and return what that field should now show. Choosing
     * None deletes the block; choosing an effect creates it with a 100% rate,
     * so a freshly chosen secondary already does something.
     */
    static write(damage, field, value) {
        if (field === 'effect') {
            if (!ActionSecondaryDamage.EFFECTS.includes(value)) {
                delete damage.secondary;
                return '';
            }
            const prior = damage.secondary || {};
            damage.secondary = {
                effect: value,
                basis: ActionSecondaryDamage.BASES.includes(prior.basis) ? prior.basis : 'rate',
                rate: prior.rate != null ? ActionSecondaryDamage.clampRate(prior.rate) : ActionSecondaryDamage.DEFAULT_RATE,
                formula: typeof prior.formula === 'string' ? prior.formula : ''
            };
            return value;
        }
        const secondary = ActionSecondaryDamage.read(damage);
        if (!secondary) return undefined;
        if (field === 'basis') {
            secondary.basis = value === 'formula' ? 'formula' : 'rate';
            return secondary.basis;
        }
        if (field === 'rate') {
            secondary.rate = ActionSecondaryDamage.clampRate(value);
            return secondary.rate;
        }
        if (field === 'formula') {
            secondary.formula = String(value ?? '');
            return secondary.formula;
        }
        return undefined;
    }

    static _effectOptions(damage, typeNames) {
        const secondary = ActionSecondaryDamage.read(damage);
        const current = secondary ? secondary.effect : '';
        const none = `<option value="" ${current ? '' : 'selected'}>${rrEscapeHtml(typeNames[0])}</option>`;
        return none + ActionSecondaryDamage.EFFECTS.map(effect => {
            const name = typeNames[ActionSecondaryDamage.typeFor(damage.type, effect)];
            return `<option value="${effect}" ${current === effect ? 'selected' : ''}>${rrEscapeHtml(name)}</option>`;
        }).join('');
    }

    /**
     * The Secondary row, to sit under the Type row. Four cells whatever the
     * basis, so its columns line up with the four above: by rate, the rate
     * box and a spacer; by formula, one formula box across both.
     */
    static rowHTML(damage, idAttribute, id, typeNames) {
        const t = ActionSecondaryDamage._t;
        const secondary = ActionSecondaryDamage.read(damage);
        const basis = secondary && secondary.basis === 'formula' ? 'formula' : 'rate';
        const rate = secondary && secondary.rate != null ? secondary.rate : ActionSecondaryDamage.DEFAULT_RATE;
        const formula = secondary && typeof secondary.formula === 'string' ? secondary.formula : '';
        const hint = rrEscapeHtml(t("Also moves the other resource on the same hit. Its amount is its own formula, or a percentage of the primary's calculated value."));
        const idAttr = `${idAttribute}="${rrEscapeHtml(id)}"`;
        return `<div class="db-row-cols" data-rr-secondary-damage>
                        <span class="db-col">
                            <label title="${hint}">${rrEscapeHtml(t('Secondary'))}</label>
                            <select class="database-field-value" data-field="damage.secondary.effect" ${idAttr} title="${hint}">${ActionSecondaryDamage._effectOptions(damage, typeNames)}</select>
                        </span>
                        <span class="db-col" data-rr-secondary-part="basis">
                            <label>${rrEscapeHtml(t('Amount'))}</label>
                            <select class="database-field-value" data-field="damage.secondary.basis" ${idAttr}>
                                <option value="rate" ${basis === 'rate' ? 'selected' : ''}>${rrEscapeHtml(t('% of Primary'))}</option>
                                <option value="formula" ${basis === 'formula' ? 'selected' : ''}>${rrEscapeHtml(t('Formula'))}</option>
                            </select>
                        </span>
                        <span class="db-col" data-rr-secondary-part="rate">
                            <label>${rrEscapeHtml(t('Rate %'))}</label>
                            <input type="number" class="database-field-value" min="0" max="${ActionSecondaryDamage.MAX_RATE}" value="${rrEscapeHtml(rate)}" data-field="damage.secondary.rate" ${idAttr}>
                        </span>
                        <span class="db-col" data-rr-secondary-part="spacer" aria-hidden="true"></span>
                        <span class="db-col" data-rr-secondary-part="formula" style="grid-column: span 2;">
                            <label>${rrEscapeHtml(t('Secondary Formula'))}</label>
                            <input type="text" class="database-field-value" style="font-family: monospace;" value="${rrEscapeHtml(formula)}" data-field="damage.secondary.formula" ${idAttr}>
                        </span>
                    </div>`;
    }

    /**
     * Bring the row in line with the record: option names for the resource
     * the primary does not use, the basis's own fields, and the whole row
     * disabled while the primary is None. Disabled, not cleared - a primary
     * set to None and back finds its secondary where it left it.
     */
    static syncFields(container, record, idAttribute, typeNames) {
        if (!container || !record) return;
        const row = container.querySelector(`[data-rr-secondary-damage] [data-field="damage.secondary.effect"][${idAttribute}="${record.id}"]`)?.closest('[data-rr-secondary-damage]');
        if (!row) return;
        const damage = record.damage || {};
        const secondary = ActionSecondaryDamage.read(damage);
        const effectSelect = row.querySelector('[data-field="damage.secondary.effect"]');
        for (const option of effectSelect.options) {
            if (!option.value) continue;
            const name = typeNames[ActionSecondaryDamage.typeFor(damage.type, option.value)];
            if (option.textContent !== name) option.textContent = name;
        }
        const noPrimary = !(damage.type > 0);
        const inactive = noPrimary || !secondary;
        const byFormula = !!secondary && secondary.basis === 'formula';
        const part = name => row.querySelector(`[data-rr-secondary-part="${name}"]`);
        part('rate').style.display = byFormula ? 'none' : '';
        part('spacer').style.display = byFormula ? 'none' : '';
        part('formula').style.display = byFormula ? '' : 'none';
        effectSelect.disabled = noPrimary;
        for (const field of row.querySelectorAll('[data-field]')) {
            if (field !== effectSelect) field.disabled = inactive;
        }
        row.style.opacity = noPrimary ? '0.5' : '';
        for (const name of ['basis', 'rate', 'formula']) {
            part(name).style.opacity = !noPrimary && inactive ? '0.5' : '';
        }
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.ActionSecondaryDamage = ActionSecondaryDamage;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActionSecondaryDamage;
}
