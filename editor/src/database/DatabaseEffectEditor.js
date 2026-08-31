/**
 * DatabaseEffectEditor - Standalone effect editor for database entries
 * Used by Skills and Items for RMMZ effects {code, dataId, value1, value2}
 */

class DatabaseEffectEditor {
    constructor(databaseManager, commonUI) {
        this.databaseManager = databaseManager;
        this.commonUI = commonUI;
        this.currentEntry = null;
        this.currentEffectIndex = -1;
        this.onSaveCallback = null;
    }

    static getEffectName(code) {
        const names = {
            11: 'HP Recovery', 12: 'MP Recovery', 13: 'TP Gain',
            21: 'Add State', 22: 'Remove State',
            31: 'Add Buff', 32: 'Add Debuff', 33: 'Remove Buff', 34: 'Remove Debuff',
            41: 'Special Effect', 42: 'Grow', 43: 'Learn Skill', 44: 'Common Event'
        };
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const name = names[code];
        return name ? tt(name) : `${tt('Effect')} ${code}`;
    }

    static getEffectValue(effect, dbManager) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const p = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck', 'Max TP'].map(tt);
        switch (effect.code) {
            case 11: case 12: {
                const pct = Math.round(effect.value1 * 100);
                const flat = effect.value2;
                return `${pct}% + ${flat}`;
            }
            case 13:
                return `+${effect.value1}`;
            case 21: case 22: {
                // dataId 0 on Add State means the attacker's own attack states.
                if (effect.code === 21 && effect.dataId === 0) {
                    return `${tt('Normal Attack')} (${Math.round(effect.value1 * 100)}%)`;
                }
                const state = dbManager ? dbManager.getState(effect.dataId) : null;
                const name = state ? state.name : `${tt('State')} #${effect.dataId}`;
                return `${name} (${Math.round(effect.value1 * 100)}%)${DatabaseEffectEditor.durationSummary(effect, tt)}`;
            }
            case 31: case 32:
                return `${p[effect.dataId] || tt('Param')} (${effect.value1} ${tt('turns')})`;
            case 33: case 34:
                return `${p[effect.dataId] || tt('Param')}`;
            case 41: {
                const specials = ['Escape'];
                return specials[effect.dataId] ? tt(specials[effect.dataId]) : `${tt('Special')} #${effect.dataId}`;
            }
            case 42: {
                const amount = Math.floor(Number(effect.value1) || 0);
                const other = Math.floor(Number(effect.value2) || 0);
                const signed = n => (n < 0 ? `${n}` : `+${n}`);
                const range = other !== 0 ? `${signed(Math.min(amount, other))}–${Math.max(amount, other)}` : signed(amount);
                return `${p[effect.dataId] || tt('Param')} ${range}`;
            }
            case 43: {
                const skill = dbManager ? dbManager.getSkill(effect.dataId) : null;
                return skill ? skill.name : `${tt('Skill')} #${effect.dataId}`;
            }
            case 44: {
                const ce = dbManager ? dbManager.getCommonEvent(effect.dataId) : null;
                return ce ? ce.name : `${tt('Common Event')} #${effect.dataId}`;
            }
            default:
                return `${tt('Data')}: ${effect.dataId}, V1: ${effect.value1}, V2: ${effect.value2}`;
        }
    }

    /**
     * One row of an effect tab, on the shared trait-row grid (radio | label |
     * control | prefix | value | unit) so every tab's columns align. A row
     * with no dropdown shows its number(s) in the control column instead of
     * leaving it empty.
     */
    _rowHTML(effect, { code, label, control = '', prefix = '', value = '', unit = '' }) {
        if (!control && value) {
            control = `<span class="rr-trait-lone-value">${value}<span class="rr-trait-unit">${unit}</span></span>`;
            value = '';
            unit = '';
        }
        return `
            <div class="effect-option rr-trait-row">
                <input type="radio" name="effect-type" value="${code}" ${effect.code === code ? 'checked' : ''}>
                <span class="rr-trait-label">${label}</span>
                <span class="rr-trait-control">${control}</span>
                <span class="rr-trait-prefix">${prefix}</span>
                <span class="rr-trait-value">${value}</span>
                <span class="rr-trait-unit">${unit}</span>
            </div>`;
    }

    _selectHTML(code, optionsHTML) {
        return `<select class="effect-sel database-field-value" data-code="${code}">${optionsHTML}</select>`;
    }

    _numberHTML(code, field, value, extra = '') {
        return `<input type="number" class="effect-val database-field-value" data-code="${code}" data-field="${field}" value="${value}" ${extra}>`;
    }

    showEffectEditorModal(entry, effectIndex = -1, onSave = null) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        this.currentEntry = entry;
        this.currentEffectIndex = effectIndex;
        this.onSaveCallback = onSave;

        const effect = effectIndex >= 0
            ? { ...entry.effects[effectIndex] }
            : { code: 11, dataId: 0, value1: 0, value2: 0 };

        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'rr-modal effect-editor-modal';
        modal.style.cssText = 'width: 620px; max-width: 92vw;';

        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt(effectIndex >= 0 ? 'Edit Effect' : 'Add Effect')}</div>
            <button class="rr-modal-close close-btn" type="button">&times;</button>
        `;

        const tabBar = document.createElement('div');
        tabBar.style.cssText = 'display: flex; border-bottom: 1px solid var(--color-border-subtle); background: var(--color-bg-panel);';

        const tabs = [
            { id: 'recovery', label: 'Recovery', codes: [11, 12, 13] },
            { id: 'state', label: 'State', codes: [21, 22] },
            { id: 'buff', label: 'Buff', codes: [31, 32, 33, 34] },
            { id: 'special', label: 'Special', codes: [41, 42, 43, 44] }
        ];

        let activeTab = 'recovery';
        for (const tab of tabs) {
            if (tab.codes.includes(effect.code)) { activeTab = tab.id; break; }
        }

        const tabContent = document.createElement('div');
        tabContent.className = 'rr-modal-body';
        tabContent.style.cssText = 'flex: 1; min-height: 0;';

        tabs.forEach(tab => {
            const tabBtn = document.createElement('button');
            tabBtn.className = 'effect-tab';
            tabBtn.dataset.tab = tab.id;
            tabBtn.textContent = tt(tab.label);
            tabBtn.style.cssText = `
                flex: 1; padding: 12px; background: ${tab.id === activeTab ? 'var(--color-bg-surface)' : 'transparent'};
                border: none; border-bottom: 2px solid ${tab.id === activeTab ? 'var(--color-accent-bright)' : 'transparent'};
                color: ${tab.id === activeTab ? 'var(--color-accent-bright)' : 'var(--color-text-muted)'}; cursor: pointer; font-size: 14px; transition: all 0.2s;
            `;
            tabBtn.addEventListener('click', () => {
                tabBar.querySelectorAll('.effect-tab').forEach(btn => {
                    const isActive = btn === tabBtn;
                    btn.style.background = isActive ? 'var(--color-bg-surface)' : 'transparent';
                    btn.style.borderBottomColor = isActive ? 'var(--color-accent-bright)' : 'transparent';
                    btn.style.color = isActive ? 'var(--color-accent-bright)' : 'var(--color-text-muted)';
                });
                this.loadEffectTabContent(tabBtn.dataset.tab, tabContent, effect);
            });
            tabBar.appendChild(tabBtn);
        });

        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        footer.innerHTML = `
            <button class="cancel-btn rr-btn-secondary">${tt('Cancel')}</button>
            <button class="ok-btn rr-button-primary">${tt('OK')}</button>
        `;

        modal.appendChild(header);
        modal.appendChild(tabBar);
        modal.appendChild(tabContent);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        header.querySelector('.close-btn').addEventListener('click', () => overlay.remove());
        footer.querySelector('.cancel-btn').addEventListener('click', () => overlay.remove());
        footer.querySelector('.ok-btn').addEventListener('click', () => {
            if (this.saveEffect(effect)) overlay.remove();
        });
        // A click on the backdrop no longer closes the dialog: close deliberately.

        this.loadEffectTabContent(activeTab, tabContent, effect);
        document.body.appendChild(overlay);
    }

    loadEffectTabContent(tabId, container, effect) {
        container.innerHTML = '';

        switch (tabId) {
            case 'recovery':
                this.createRecoveryTab(container, effect);
                break;
            case 'state':
                this.createStateTab(container, effect);
                break;
            case 'buff':
                this.createBuffTab(container, effect);
                break;
            case 'special':
                this.createSpecialTab(container, effect);
                break;
        }
        if (window.I18n) window.I18n.applyText(container);
    }

    createRecoveryTab(container, effect) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const recoveryGroup = code => `
            <span class="rr-trait-lone-value">
                ${this._numberHTML(code, 'value1', effect.code === code ? Math.round(effect.value1 * 100) : 0)}
                <span class="rr-trait-unit">%</span>
                <span class="rr-trait-prefix">+</span>
                ${this._numberHTML(code, 'value2', rrEscapeHtml(effect.code === code ? effect.value2 : 0))}
            </span>`;

        container.innerHTML = [
            this._rowHTML(effect, { code: 11, label: tt('HP Recovery'), control: recoveryGroup(11) }),
            this._rowHTML(effect, { code: 12, label: tt('MP Recovery'), control: recoveryGroup(12) }),
            this._rowHTML(effect, {
                code: 13, label: tt('TP Gain'),
                value: this._numberHTML(13, 'value1', rrEscapeHtml(effect.code === 13 ? effect.value1 : 0))
            })
        ].join('');
        this.setupEffectRadioInputs(container, effect);
    }

    createStateTab(container, effect) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const states = this.databaseManager.getStates() || [];
        const stateOpts = states.filter(s => s && s.id > 0).map(s =>
            `<option value="${s.id}" ${effect.dataId === s.id ? 'selected' : ''}>${rrEscapeHtml(s.name)}</option>`
        ).join('');
        const addStateOpts = `<option value="0" ${effect.code === 21 && effect.dataId === 0 ? 'selected' : ''}>${tt('Normal Attack')}</option>` + stateOpts;

        container.innerHTML = [
            this._rowHTML(effect, {
                code: 21, label: tt('Add State'),
                control: this._selectHTML(21, addStateOpts),
                value: this._numberHTML(21, 'value1', effect.code === 21 ? Math.round(effect.value1 * 100) : 100),
                unit: '%'
            }),
            // A sibling of the Add State row, not a child: the i18n pass and
            // the radio lookups read `.effect-option > span`.
            this._durationRowHTML(effect),
            this._rowHTML(effect, {
                code: 22, label: tt('Remove State'),
                control: this._selectHTML(22, stateOpts),
                value: this._numberHTML(22, 'value1', effect.code === 22 ? Math.round(effect.value1 * 100) : 100),
                unit: '%'
            })
        ].join('');
        this.setupEffectRadioInputs(container, effect);
        this.setupDurationInputs(container, effect);
    }

    /**
     * Add State's duration override: ticked, the state lasts the turns
     * given here (a range when the two differ) instead of its own Min/Max
     * Turns. Unticked, the boxes show the state's own turns, greyed.
     */
    _durationRowHTML(effect) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const override = effect.code === 21 && Number(effect.value2) > 0;
        const state = this.databaseManager && this.databaseManager.getState ? this.databaseManager.getState(effect.dataId) : null;
        const min = override ? Number(effect.value2) : (state ? state.minTurns : 1);
        const max = override ? Math.max(Number(effect.value2), Number(effect.value3) || 0) : (state ? state.maxTurns : 1);
        const never = !!state && state.autoRemovalTiming === 0;
        return `
            <div class="effect-duration rr-trait-row" data-code="21" style="margin-top: 6px;">
                <input type="checkbox" class="effect-duration-override" style="margin: 0; justify-self: center;" ${override ? 'checked' : ''} ${never ? 'disabled' : ''}>
                <span class="rr-trait-label" style="color: var(--color-text-muted);">${tt('Duration')}</span>
                <span style="grid-column: 3 / -1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <input type="number" class="effect-duration-min database-field-value" min="1" step="1" value="${min}" style="width: 84px; box-sizing: border-box;" ${override ? '' : 'disabled'}>
                    <span style="color: var(--color-text-muted);">–</span>
                    <input type="number" class="effect-duration-max database-field-value" min="1" step="1" value="${max}" style="width: 84px; box-sizing: border-box;" ${override ? '' : 'disabled'}>
                    <span style="color: var(--color-text-muted);">${tt('turns')}</span>
                    <span class="effect-duration-note" style="font-size: 11px; color: var(--color-text-muted); ${never ? '' : 'display: none;'}">${tt('Not removed automatically')}</span>
                </span>
            </div>`;
    }

    /** Read the duration row into the effect (code 21 only). */
    _readDuration(container, effect) {
        const row = container.querySelector ? container.querySelector('.effect-duration') : null;
        if (!row || effect.code !== 21) return;
        const override = row.querySelector('.effect-duration-override');
        const minInput = row.querySelector('.effect-duration-min');
        const maxInput = row.querySelector('.effect-duration-max');
        if (override && override.checked && !override.disabled) {
            const min = Math.max(1, Math.floor(parseFloat(minInput.value) || 1));
            const max = Math.max(min, Math.floor(parseFloat(maxInput.value) || min));
            effect.value2 = min;
            if (max > min) effect.value3 = max;
            else delete effect.value3;
        } else {
            effect.value2 = 0;
            delete effect.value3;
        }
    }

    setupDurationInputs(container, effect) {
        const row = container.querySelector ? container.querySelector('.effect-duration') : null;
        if (!row) return;
        const override = row.querySelector('.effect-duration-override');
        const minInput = row.querySelector('.effect-duration-min');
        const maxInput = row.querySelector('.effect-duration-max');
        const note = row.querySelector('.effect-duration-note');
        const stateSelect = container.querySelector('select.effect-sel[data-code="21"]');
        const refresh = () => {
            const state = this.databaseManager && this.databaseManager.getState && stateSelect
                ? this.databaseManager.getState(parseInt(stateSelect.value) || 0) : null;
            const never = !!state && state.autoRemovalTiming === 0;
            override.disabled = never;
            if (never) override.checked = false;
            if (note) note.style.display = never ? '' : 'none';
            const on = override.checked && !never;
            minInput.disabled = !on;
            maxInput.disabled = !on;
            if (!on && state) { minInput.value = state.minTurns; maxInput.value = state.maxTurns; }
            this._readDuration(container, effect);
        };
        override.addEventListener('change', refresh);
        for (const input of [minInput, maxInput]) input.addEventListener('input', () => this._readDuration(container, effect));
        if (stateSelect) stateSelect.addEventListener('change', refresh);
    }

    createBuffTab(container, effect) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const paramNames = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'].map(tt);
        const paramOpts = paramNames.map((name, idx) =>
            `<option value="${idx}" ${effect.dataId === idx ? 'selected' : ''}>${name}</option>`
        ).join('');

        container.innerHTML = [
            this._rowHTML(effect, {
                code: 31, label: tt('Add Buff'),
                control: this._selectHTML(31, paramOpts),
                value: this._numberHTML(31, 'value1', rrEscapeHtml(effect.code === 31 ? effect.value1 : 5), 'min="1"'),
                unit: tt('turns')
            }),
            this._rowHTML(effect, {
                code: 32, label: tt('Add Debuff'),
                control: this._selectHTML(32, paramOpts),
                value: this._numberHTML(32, 'value1', rrEscapeHtml(effect.code === 32 ? effect.value1 : 5), 'min="1"'),
                unit: tt('turns')
            }),
            this._rowHTML(effect, {
                code: 33, label: tt('Remove Buff'),
                control: this._selectHTML(33, paramOpts)
            }),
            this._rowHTML(effect, {
                code: 34, label: tt('Remove Debuff'),
                control: this._selectHTML(34, paramOpts)
            })
        ].join('');
        this.setupEffectRadioInputs(container, effect);
    }

    createSpecialTab(container, effect) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        // Grow reaches Max TP as paramId 8 (`Game_BattlerBase.PARAM_MAX_TP`),
        // which is its own accumulator in the runtime, never a ninth params entry.
        const paramNames = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck', 'Max TP'].map(tt);
        const paramOpts = paramNames.map((name, idx) =>
            `<option value="${idx}" ${effect.code === 42 && effect.dataId === idx ? 'selected' : ''}>${name}</option>`
        ).join('');

        const skills = this.databaseManager.getSkills() || [];
        const skillOpts = skills.filter(s => s && s.id > 0).map(s =>
            `<option value="${s.id}" ${effect.code === 43 && effect.dataId === s.id ? 'selected' : ''}>${rrEscapeHtml(s.name)}</option>`
        ).join('');

        const commonEvents = this.databaseManager.getCommonEvents() || [];
        const ceOpts = commonEvents.filter(ce => ce && ce.id > 0).map(ce =>
            `<option value="${ce.id}" ${effect.code === 44 && effect.dataId === ce.id ? 'selected' : ''}>${rrEscapeHtml(ce.name)}</option>`
        ).join('');

        container.innerHTML = [
            this._rowHTML(effect, {
                code: 41, label: tt('Special Effect'),
                control: this._selectHTML(41, `<option value="0" ${effect.code === 41 && effect.dataId === 0 ? 'selected' : ''}>${tt('Escape')}</option>`)
            }),
            this._rowHTML(effect, {
                code: 42, label: tt('Grow'),
                control: this._selectHTML(42, paramOpts),
                value: this._numberHTML(42, 'value1', rrEscapeHtml(effect.code === 42 ? effect.value1 : 1))
            }),
            this._growRangeRowHTML(effect),
            this._rowHTML(effect, {
                code: 43, label: tt('Learn Skill'),
                control: this._selectHTML(43, skillOpts)
            }),
            this._rowHTML(effect, {
                code: 44, label: tt('Common Event'),
                control: this._selectHTML(44, ceOpts)
            })
        ].join('');
        this.setupEffectRadioInputs(container, effect);
        this.setupGrowRangeInputs(container, effect);
    }

    /**
     * Grow's random range: ticked, the amount is drawn between the Grow
     * row's number and this one (`value2`, which RPG Maker leaves at 0).
     * A sibling of the Grow row, like the Add State duration row.
     */
    _growRangeRowHTML(effect) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const on = effect.code === 42 && Math.floor(Number(effect.value2) || 0) !== 0;
        const upper = on ? effect.value2 : (effect.code === 42 ? effect.value1 : 1);
        return `
            <div class="effect-grow-range rr-trait-row" data-code="42" style="margin-top: 6px;">
                <input type="checkbox" class="effect-grow-random" style="margin: 0; justify-self: center;" ${on ? 'checked' : ''}>
                <span class="rr-trait-label" style="color: var(--color-text-muted);">${tt('Random')}</span>
                <span style="grid-column: 3 / -1; display: flex; align-items: center; gap: 8px;">
                    <span style="color: var(--color-text-muted);">–</span>
                    <input type="number" class="effect-grow-max database-field-value" step="1" value="${rrEscapeHtml(upper)}" style="width: 84px; box-sizing: border-box;" ${on ? '' : 'disabled'}>
                </span>
            </div>`;
    }

    /** Read the Grow range row into the effect (code 42 only). */
    _readGrowRange(container, effect) {
        const row = container.querySelector ? container.querySelector('.effect-grow-range') : null;
        if (!row || effect.code !== 42) return;
        const random = row.querySelector('.effect-grow-random');
        const maxInput = row.querySelector('.effect-grow-max');
        if (random && random.checked) {
            let a = Math.floor(Number(effect.value1) || 0);
            let b = Math.floor(parseFloat(maxInput.value) || 0);
            // The runtime reads a non-zero value2 as "ranged": keep the
            // non-zero end there when one end is 0.
            if (b === 0 && a !== 0) { const t = a; a = b; b = t; }
            effect.value1 = a;
            effect.value2 = b;
        } else {
            effect.value2 = 0;
        }
    }

    setupGrowRangeInputs(container, effect) {
        const row = container.querySelector ? container.querySelector('.effect-grow-range') : null;
        if (!row) return;
        const random = row.querySelector('.effect-grow-random');
        const maxInput = row.querySelector('.effect-grow-max');
        random.addEventListener('change', () => {
            maxInput.disabled = !random.checked;
            this._readGrowRange(container, effect);
        });
        maxInput.addEventListener('input', () => this._readGrowRange(container, effect));
        const amount = container.querySelector('input.effect-val[data-code="42"][data-field="value1"]');
        if (amount) amount.addEventListener('input', () => this._readGrowRange(container, effect));
    }

    setupEffectRadioInputs(container, effect) {
        const radios = container.querySelectorAll('input[type="radio"]');
        let lastChecked = null;
        radios.forEach(r => { if (r.checked) lastChecked = r; });

        radios.forEach(radio => {
            radio.addEventListener('click', () => {
                if (radio === lastChecked) {
                    radio.checked = false;
                    lastChecked = null;
                    effect.code = null;
                    return;
                }
                lastChecked = radio;
                const code = parseInt(radio.value);
                effect.code = code;

                const sel = container.querySelector(`select.effect-sel[data-code="${code}"]`);
                if (sel) effect.dataId = parseInt(sel.value) || 0;
                else effect.dataId = 0;

                const val1Input = container.querySelector(`input.effect-val[data-code="${code}"][data-field="value1"]`);
                const val2Input = container.querySelector(`input.effect-val[data-code="${code}"][data-field="value2"]`);

                if (code === 11 || code === 12) {
                    effect.value1 = val1Input ? (parseFloat(val1Input.value) || 0) / 100 : 0;
                    effect.value2 = val2Input ? parseFloat(val2Input.value) || 0 : 0;
                } else if (code === 21) {
                    effect.value1 = val1Input ? (parseFloat(val1Input.value) || 0) / 100 : 1;
                    effect.value2 = 0;
                    delete effect.value3;
                    this._readDuration(container, effect);
                } else if (code === 22) {
                    effect.value1 = val1Input ? (parseFloat(val1Input.value) || 0) / 100 : 1;
                    effect.value2 = 0;
                    delete effect.value3;
                } else {
                    effect.value1 = val1Input ? parseFloat(val1Input.value) || 0 : 0;
                    effect.value2 = val2Input ? parseFloat(val2Input.value) || 0 : 0;
                    if (code === 42) this._readGrowRange(container, effect);
                }
            });
        });

        container.querySelectorAll('select.effect-sel').forEach(sel => {
            sel.addEventListener('change', () => {
                const radio = sel.closest('.effect-option').querySelector('input[type="radio"]');
                if (radio && radio.checked) effect.dataId = parseInt(sel.value) || 0;
            });
        });

        container.querySelectorAll('input.effect-val').forEach(input => {
            input.addEventListener('input', () => {
                const radio = input.closest('.effect-option').querySelector('input[type="radio"]');
                if (!radio || !radio.checked) return;
                const code = parseInt(radio.value);
                const field = input.dataset.field;
                const val = parseFloat(input.value) || 0;

                if (field === 'value1') {
                    if (code === 11 || code === 12 || code === 21 || code === 22) {
                        effect.value1 = val / 100;
                    } else {
                        effect.value1 = val;
                    }
                } else if (field === 'value2') {
                    effect.value2 = val;
                }
            });
        });
    }

    saveEffect(effect) {
        if (!effect.code) {
            alert(window.I18n ? window.I18n.tText('Please select an effect type before saving.') : 'Please select an effect type before saving.');
            return false;
        }

        if (this.currentEffectIndex >= 0) {
            this.currentEntry.effects[this.currentEffectIndex] = effect;
        } else {
            if (!this.currentEntry.effects) this.currentEntry.effects = [];
            this.currentEntry.effects.push(effect);
        }

        if (this.onSaveCallback) this.onSaveCallback(this.currentEntry);
        return true;
    }
}

/** ", 3–6 turns" for an Add State effect that overrides the state's duration. */
DatabaseEffectEditor.durationSummary = function(effect, tt) {
    if (!effect || effect.code !== 21) return '';
    const min = Math.floor(Number(effect.value2) || 0);
    if (min <= 0) return '';
    const max = Math.max(min, Math.floor(Number(effect.value3) || 0));
    return `, ${max > min ? `${min}–${max}` : min} ${tt('turns')}`;
};
