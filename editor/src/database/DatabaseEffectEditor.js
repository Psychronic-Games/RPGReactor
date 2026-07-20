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
        const p = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'].map(tt);
        switch (effect.code) {
            case 11: case 12: {
                const pct = Math.round(effect.value1 * 100);
                const flat = effect.value2;
                return `${pct}% + ${flat}`;
            }
            case 13:
                return `+${effect.value1}`;
            case 21: case 22: {
                // dataId 0 = the attacker's normal-attack state
                if (effect.dataId === 0) {
                    return `${tt('Normal Attack')} (${Math.round(effect.value1 * 100)}%)`;
                }
                const state = dbManager ? dbManager.getState(effect.dataId) : null;
                const name = state ? state.name : `${tt('State')} #${effect.dataId}`;
                return `${name} (${Math.round(effect.value1 * 100)}%)`;
            }
            case 31: case 32:
                return `${p[effect.dataId] || tt('Param')} (${effect.value1} ${tt('turns')})`;
            case 33: case 34:
                return `${p[effect.dataId] || tt('Param')}`;
            case 41: {
                const specials = ['Escape'];
                return specials[effect.dataId] ? tt(specials[effect.dataId]) : `${tt('Special')} #${effect.dataId}`;
            }
            case 42:
                return `${p[effect.dataId] || tt('Param')} +${effect.value1}`;
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

    showEffectEditorModal(entry, effectIndex = -1, onSave = null) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        this.currentEntry = entry;
        this.currentEffectIndex = effectIndex;
        this.onSaveCallback = onSave;

        const effect = effectIndex >= 0
            ? { ...entry.effects[effectIndex] }
            : { code: 11, dataId: 0, value1: 0, value2: 0 };

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.7); display: flex;
            align-items: center; justify-content: center; z-index: 10000;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: var(--color-bg-surface); border: 1px solid var(--color-border-subtle); border-radius: 8px;
            width: 600px; max-height: 80vh; display: flex; flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px; border-bottom: 1px solid var(--color-border-subtle);
            display: flex; justify-content: space-between; align-items: center; background: var(--color-bg-panel);
        `;
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong);">${tt('Edit Effect')}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;">&times;</button>
        `;

        const tabBar = document.createElement('div');
        tabBar.style.cssText = 'display: flex; border-bottom: 1px solid var(--color-border-subtle); background: #252525;';

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
        tabContent.style.cssText = 'flex: 1; padding: 20px; overflow-y: auto;';

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
        footer.style.cssText = 'padding: 16px; border-top: 1px solid var(--color-border-subtle); display: flex; justify-content: flex-end; gap: 8px;';
        footer.innerHTML = `
            <button class="cancel-btn rr-btn-secondary">${tt('Cancel')}</button>
            <button class="ok-btn" style="padding: 8px 16px; background: var(--color-accent-bright); border: none; color: var(--color-bg-deep); border-radius: 4px; cursor: pointer; font-weight: bold;">${tt('OK')}</button>
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
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        this.loadEffectTabContent(activeTab, tabContent, effect);
        document.body.appendChild(overlay);
    }

    loadEffectTabContent(tabId, container, effect) {
        container.innerHTML = '';
        const optStyle = 'display: flex; align-items: center; gap: 12px; margin-bottom: 12px;';
        const selStyle = 'flex: 1; padding: 6px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-accent-border); color: var(--color-text-strong); border-radius: 3px; font-weight: 600;';
        const numStyle = 'width: 80px; padding: 5px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-accent-border); color: var(--color-text-strong); border-radius: 3px; font-weight: 600;';

        switch (tabId) {
            case 'recovery':
                this.createRecoveryTab(container, effect, optStyle, selStyle, numStyle);
                break;
            case 'state':
                this.createStateTab(container, effect, optStyle, selStyle, numStyle);
                break;
            case 'buff':
                this.createBuffTab(container, effect, optStyle, selStyle, numStyle);
                break;
            case 'special':
                this.createSpecialTab(container, effect, optStyle, selStyle, numStyle);
                break;
        }
        if (window.I18n) window.I18n.applyText(container);
    }

    createRecoveryTab(container, effect, optStyle, selStyle, numStyle) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        container.innerHTML = `
            <div class="effect-option" style="${optStyle}">
                <input type="radio" name="effect-type" value="11" ${effect.code === 11 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">${tt('HP Recovery')}</span>
                <input type="number" class="effect-val" data-code="11" data-field="value1" value="${effect.code === 11 ? Math.round(effect.value1 * 100) : 0}" style="${numStyle}">
                <span style="color: var(--color-text-muted);">%</span>
                <span style="color: var(--color-text-muted);">+</span>
                <input type="number" class="effect-val" data-code="11" data-field="value2" value="${rrEscapeHtml(effect.code === 11 ? effect.value2 : 0)}" style="${numStyle}">
            </div>
            <div class="effect-option" style="${optStyle}">
                <input type="radio" name="effect-type" value="12" ${effect.code === 12 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">${tt('MP Recovery')}</span>
                <input type="number" class="effect-val" data-code="12" data-field="value1" value="${effect.code === 12 ? Math.round(effect.value1 * 100) : 0}" style="${numStyle}">
                <span style="color: var(--color-text-muted);">%</span>
                <span style="color: var(--color-text-muted);">+</span>
                <input type="number" class="effect-val" data-code="12" data-field="value2" value="${rrEscapeHtml(effect.code === 12 ? effect.value2 : 0)}" style="${numStyle}">
            </div>
            <div class="effect-option" style="${optStyle}">
                <input type="radio" name="effect-type" value="13" ${effect.code === 13 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">${tt('TP Gain')}</span>
                <input type="number" class="effect-val" data-code="13" data-field="value1" value="${rrEscapeHtml(effect.code === 13 ? effect.value1 : 0)}" style="${numStyle}">
            </div>
        `;
        this.setupEffectRadioInputs(container, effect);
    }

    createStateTab(container, effect, optStyle, selStyle, numStyle) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const states = this.databaseManager.getStates() || [];
        const stateOpts = states.filter(s => s && s.id > 0).map(s =>
            `<option value="${s.id}" ${effect.dataId === s.id ? 'selected' : ''}>${rrEscapeHtml(s.name)}</option>`
        ).join('');

        container.innerHTML = `
            <div class="effect-option" style="${optStyle}">
                <input type="radio" name="effect-type" value="21" ${effect.code === 21 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">${tt('Add State')}</span>
                <select class="effect-sel" data-code="21" style="${selStyle}">${stateOpts}</select>
                <input type="number" class="effect-val" data-code="21" data-field="value1" value="${effect.code === 21 ? Math.round(effect.value1 * 100) : 100}" style="${numStyle}">
                <span style="color: var(--color-text-muted);">%</span>
            </div>
            <div class="effect-option" style="${optStyle}">
                <input type="radio" name="effect-type" value="22" ${effect.code === 22 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">${tt('Remove State')}</span>
                <select class="effect-sel" data-code="22" style="${selStyle}">${stateOpts}</select>
                <input type="number" class="effect-val" data-code="22" data-field="value1" value="${effect.code === 22 ? Math.round(effect.value1 * 100) : 100}" style="${numStyle}">
                <span style="color: var(--color-text-muted);">%</span>
            </div>
        `;
        this.setupEffectRadioInputs(container, effect);
    }

    createBuffTab(container, effect, optStyle, selStyle, numStyle) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const paramNames = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'].map(tt);
        const paramOpts = paramNames.map((name, idx) =>
            `<option value="${idx}" ${effect.dataId === idx ? 'selected' : ''}>${name}</option>`
        ).join('');

        container.innerHTML = `
            <div class="effect-option" style="${optStyle}">
                <input type="radio" name="effect-type" value="31" ${effect.code === 31 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">${tt('Add Buff')}</span>
                <select class="effect-sel" data-code="31" style="${selStyle}">${paramOpts}</select>
                <input type="number" class="effect-val" data-code="31" data-field="value1" value="${rrEscapeHtml(effect.code === 31 ? effect.value1 : 5)}" min="1" style="${numStyle}">
                <span style="color: var(--color-text-muted);">${tt('turns')}</span>
            </div>
            <div class="effect-option" style="${optStyle}">
                <input type="radio" name="effect-type" value="32" ${effect.code === 32 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">${tt('Add Debuff')}</span>
                <select class="effect-sel" data-code="32" style="${selStyle}">${paramOpts}</select>
                <input type="number" class="effect-val" data-code="32" data-field="value1" value="${rrEscapeHtml(effect.code === 32 ? effect.value1 : 5)}" min="1" style="${numStyle}">
                <span style="color: var(--color-text-muted);">${tt('turns')}</span>
            </div>
            <div class="effect-option" style="${optStyle}">
                <input type="radio" name="effect-type" value="33" ${effect.code === 33 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">${tt('Remove Buff')}</span>
                <select class="effect-sel" data-code="33" style="${selStyle}">${paramOpts}</select>
            </div>
            <div class="effect-option" style="${optStyle}">
                <input type="radio" name="effect-type" value="34" ${effect.code === 34 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">${tt('Remove Debuff')}</span>
                <select class="effect-sel" data-code="34" style="${selStyle}">${paramOpts}</select>
            </div>
        `;
        this.setupEffectRadioInputs(container, effect);
    }

    createSpecialTab(container, effect, optStyle, selStyle, numStyle) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const paramNames = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'].map(tt);
        const paramOpts = paramNames.map((name, idx) =>
            `<option value="${idx}" ${effect.dataId === idx ? 'selected' : ''}>${name}</option>`
        ).join('');

        const skills = this.databaseManager.getSkills() || [];
        const skillOpts = skills.filter(s => s && s.id > 0).map(s =>
            `<option value="${s.id}" ${effect.code === 43 && effect.dataId === s.id ? 'selected' : ''}>${rrEscapeHtml(s.name)}</option>`
        ).join('');

        const commonEvents = this.databaseManager.getCommonEvents() || [];
        const ceOpts = commonEvents.filter(ce => ce && ce.id > 0).map(ce =>
            `<option value="${ce.id}" ${effect.code === 44 && effect.dataId === ce.id ? 'selected' : ''}>${rrEscapeHtml(ce.name)}</option>`
        ).join('');

        container.innerHTML = `
            <div class="effect-option" style="${optStyle}">
                <input type="radio" name="effect-type" value="41" ${effect.code === 41 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">${tt('Special Effect')}</span>
                <select class="effect-sel" data-code="41" style="${selStyle}">
                    <option value="0" ${effect.code === 41 && effect.dataId === 0 ? 'selected' : ''}>${tt('Escape')}</option>
                </select>
            </div>
            <div class="effect-option" style="${optStyle}">
                <input type="radio" name="effect-type" value="42" ${effect.code === 42 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">${tt('Grow')}</span>
                <select class="effect-sel" data-code="42" style="${selStyle}">${paramOpts}</select>
                <input type="number" class="effect-val" data-code="42" data-field="value1" value="${rrEscapeHtml(effect.code === 42 ? effect.value1 : 1)}" style="${numStyle}">
            </div>
            <div class="effect-option" style="${optStyle}">
                <input type="radio" name="effect-type" value="43" ${effect.code === 43 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">${tt('Learn Skill')}</span>
                <select class="effect-sel" data-code="43" style="${selStyle}">${skillOpts}</select>
            </div>
            <div class="effect-option" style="${optStyle}">
                <input type="radio" name="effect-type" value="44" ${effect.code === 44 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">${tt('Common Event')}</span>
                <select class="effect-sel" data-code="44" style="${selStyle}">${ceOpts}</select>
            </div>
        `;
        this.setupEffectRadioInputs(container, effect);
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
                } else if (code === 21 || code === 22) {
                    effect.value1 = val1Input ? (parseFloat(val1Input.value) || 0) / 100 : 1;
                    effect.value2 = 0;
                } else {
                    effect.value1 = val1Input ? parseFloat(val1Input.value) || 0 : 0;
                    effect.value2 = val2Input ? parseFloat(val2Input.value) || 0 : 0;
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
