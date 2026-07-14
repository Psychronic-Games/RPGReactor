/**
 * DatabaseTraitEditor - Standalone trait editor for database entries
 * Used by Classes, Weapons, Armors, States, and Actors
 */

class DatabaseTraitEditor {
    constructor(databaseManager, commonUI) {
        this.databaseManager = databaseManager;
        this.commonUI = commonUI;
        this.currentEntry = null;
        this.currentTraitIndex = -1;
        this.onSaveCallback = null;
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    /**
     * Show trait editor modal
     * @param {Object} entry - The database entry (class, weapon, armor, state, or actor)
     * @param {Number} traitIndex - Index of trait to edit (-1 for new trait)
     * @param {Function} onSave - Callback when trait is saved
     */
    showTraitEditorModal(entry, traitIndex = -1, onSave = null) {
        this.currentEntry = entry;
        this.currentTraitIndex = traitIndex;
        this.onSaveCallback = onSave;

        // Get existing trait data or create new
        const trait = traitIndex >= 0 ? { ...entry.traits[traitIndex] } : { code: 11, dataId: 1, value: 1.0 };

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'trait-editor-modal';
        modal.style.cssText = `
            background: var(--color-bg-surface);
            border: 1px solid var(--color-border-subtle);
            border-radius: 8px;
            width: 600px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px;
            border-bottom: 1px solid var(--color-border-subtle);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--color-bg-panel);
        `;
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong);">Edit Trait</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;">&times;</button>
        `;

        // Tab bar
        const tabBar = document.createElement('div');
        tabBar.style.cssText = `
            display: flex;
            border-bottom: 1px solid var(--color-border-subtle);
            background: #252525;
        `;

        const tabs = [
            { id: 'rates', label: 'Rates', codes: [11, 12, 13, 14] },
            { id: 'param', label: 'Param', codes: [21, 22, 23] },
            { id: 'attack', label: 'Attack', codes: [31, 32, 33, 34] },
            { id: 'skill', label: 'Skill', codes: [41, 42, 43, 44] },
            { id: 'equip', label: 'Equip', codes: [51, 52, 53, 54, 55] },
            { id: 'other', label: 'Other', codes: [61, 62, 63, 64] }
        ];

        // Determine initial active tab based on trait code
        let activeTab = 'rates';
        for (const tab of tabs) {
            if (tab.codes.includes(trait.code)) {
                activeTab = tab.id;
                break;
            }
        }

        tabs.forEach(tab => {
            const tabBtn = document.createElement('button');
            tabBtn.className = 'trait-tab';
            tabBtn.dataset.tab = tab.id;
            tabBtn.textContent = this._t(tab.label);
            tabBtn.style.cssText = `
                flex: 1;
                padding: 12px;
                background: ${tab.id === activeTab ? 'var(--color-bg-surface)' : 'transparent'};
                border: none;
                border-bottom: 2px solid ${tab.id === activeTab ? 'var(--color-accent-bright)' : 'transparent'};
                color: ${tab.id === activeTab ? 'var(--color-accent-bright)' : 'var(--color-text-muted)'};
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            `;
            tabBtn.addEventListener('click', () => this.switchTab(tabBtn, tabContent, trait));
            tabBar.appendChild(tabBtn);
        });

        // Tab content container
        const tabContent = document.createElement('div');
        tabContent.style.cssText = `
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        `;

        // Footer with buttons
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 16px;
            border-top: 1px solid var(--color-border-subtle);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        `;
        footer.innerHTML = `
            <button class="cancel-btn rr-btn-secondary">Cancel</button>
            <button class="ok-btn" style="padding: 8px 16px; background: var(--color-accent-bright); border: none; color: var(--color-bg-deep); border-radius: 4px; cursor: pointer; font-weight: bold;">OK</button>
        `;

        // Assemble modal
        modal.appendChild(header);
        modal.appendChild(tabBar);
        modal.appendChild(tabContent);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        // Event listeners
        header.querySelector('.close-btn').addEventListener('click', () => overlay.remove());
        footer.querySelector('.cancel-btn').addEventListener('click', () => overlay.remove());
        footer.querySelector('.ok-btn').addEventListener('click', () => {
            const saved = this.saveTrait(trait);
            if (saved) {
                overlay.remove();
            }
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        // Load initial tab content
        const activeTabBtn = tabBar.querySelector(`[data-tab="${activeTab}"]`);
        this.loadTabContent(activeTab, tabContent, trait);

        document.body.appendChild(overlay);
        if (window.I18n) window.I18n.applyText(overlay);
    }

    switchTab(clickedBtn, tabContent, trait) {
        // Update tab button styles
        const tabBar = clickedBtn.parentElement;
        tabBar.querySelectorAll('.trait-tab').forEach(btn => {
            const isActive = btn === clickedBtn;
            btn.style.background = isActive ? 'var(--color-bg-surface)' : 'transparent';
            btn.style.borderBottomColor = isActive ? 'var(--color-accent-bright)' : 'transparent';
            btn.style.color = isActive ? 'var(--color-accent-bright)' : 'var(--color-text-muted)';
        });

        // Load new tab content
        this.loadTabContent(clickedBtn.dataset.tab, tabContent, trait);
    }

    loadTabContent(tabId, container, trait) {
        container.innerHTML = '';

        switch (tabId) {
            case 'rates':
                this.createRatesTab(container, trait);
                break;
            case 'param':
                this.createParamTab(container, trait);
                break;
            case 'attack':
                this.createAttackTab(container, trait);
                break;
            case 'skill':
                this.createSkillTab(container, trait);
                break;
            case 'equip':
                this.createEquipTab(container, trait);
                break;
            case 'other':
                this.createOtherTab(container, trait);
                break;
        }
        if (window.I18n) window.I18n.applyText(container);
    }

    createRatesTab(container, trait) {
        const elements = this.databaseManager.getSystem()?.elements || [];
        const states = this.databaseManager.getStates() || [];

        container.innerHTML = `
            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="11" ${trait.code === 11 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">Element Rate</span>
                <select class="element-select" data-code="11" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${(elements || []).filter((e, i) => i > 0 && e).map((elem, idx) =>
                        `<option value="${idx + 1}" ${trait.code === 11 && trait.dataId === idx + 1 ? 'selected' : ''}>${elem}</option>`
                    ).join('')}
                </select>
                <input type="number" class="rate-value" data-code="11" value="${trait.code === 11 ? Math.round(trait.value * 100) : 100}"
                       style="width: 80px; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                <span style="color: var(--color-text-muted);">%</span>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="12" ${trait.code === 12 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">Debuff Rate</span>
                <select class="debuff-select" data-code="12" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'].map(param => this._t(param)).map((param, idx) =>
                        `<option value="${idx}" ${trait.code === 12 && trait.dataId === idx ? 'selected' : ''}>${param}</option>`
                    ).join('')}
                </select>
                <input type="number" class="rate-value" data-code="12" value="${trait.code === 12 ? Math.round(trait.value * 100) : 100}"
                       style="width: 80px; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                <span style="color: var(--color-text-muted);">%</span>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="13" ${trait.code === 13 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">State Rate</span>
                <select class="state-select" data-code="13" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${(states || []).filter(s => s && s.id > 0).map(state =>
                        `<option value="${state.id}" ${trait.code === 13 && trait.dataId === state.id ? 'selected' : ''}>${state.name}</option>`
                    ).join('')}
                </select>
                <input type="number" class="rate-value" data-code="13" value="${trait.code === 13 ? Math.round(trait.value * 100) : 100}"
                       style="width: 80px; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                <span style="color: var(--color-text-muted);">%</span>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="14" ${trait.code === 14 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">State Resist</span>
                <select class="state-select" data-code="14" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${(states || []).filter(s => s && s.id > 0).map(state =>
                        `<option value="${state.id}" ${trait.code === 14 && trait.dataId === state.id ? 'selected' : ''}>${state.name}</option>`
                    ).join('')}
                </select>
            </div>
        `;

        this.setupRadioInputs(container, trait);
    }

    createParamTab(container, trait) {
        container.innerHTML = `
            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="21" ${trait.code === 21 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">Parameter</span>
                <select class="param-select" data-code="21" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'].map(param => this._t(param)).map((param, idx) =>
                        `<option value="${idx}" ${trait.code === 21 && trait.dataId === idx ? 'selected' : ''}>${param}</option>`
                    ).join('')}
                </select>
                <input type="number" class="rate-value" data-code="21" value="${trait.code === 21 ? Math.round(trait.value * 100) : 100}"
                       style="width: 80px; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                <span style="color: var(--color-text-muted);">%</span>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="22" ${trait.code === 22 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">Ex-Parameter</span>
                <select class="exparam-select" data-code="22" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${['Hit Rate', 'Evasion Rate', 'Critical Rate', 'Critical Evasion', 'Magic Evasion', 'Magic Reflection', 'Counter Attack', 'HP Regeneration', 'MP Regeneration', 'TP Regeneration'].map(param => this._t(param)).map((param, idx) =>
                        `<option value="${idx}" ${trait.code === 22 && trait.dataId === idx ? 'selected' : ''}>${param}</option>`
                    ).join('')}
                </select>
                <span style="color: var(--color-text-muted);">+</span>
                <input type="number" class="rate-value" data-code="22" value="${trait.code === 22 ? Math.round(trait.value * 100) : 0}" step="0.01"
                       style="width: 80px; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                <span style="color: var(--color-text-muted);">%</span>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="23" ${trait.code === 23 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">Sp-Parameter</span>
                <select class="spparam-select" data-code="23" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${['Target Rate', 'Guard Effect', 'Recovery Effect', 'Pharmacology', 'MP Cost Rate', 'TP Charge Rate', 'Physical Damage', 'Magical Damage', 'Floor Damage', 'Experience'].map(param => this._t(param)).map((param, idx) =>
                        `<option value="${idx}" ${trait.code === 23 && trait.dataId === idx ? 'selected' : ''}>${param}</option>`
                    ).join('')}
                </select>
                <input type="number" class="rate-value" data-code="23" value="${trait.code === 23 ? Math.round(trait.value * 100) : 100}"
                       style="width: 80px; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                <span style="color: var(--color-text-muted);">%</span>
            </div>
        `;

        this.setupRadioInputs(container, trait);
    }

    createAttackTab(container, trait) {
        const elements = this.databaseManager.getSystem()?.elements || [];
        const states = this.databaseManager.getStates() || [];
        const skills = this.databaseManager.getSkills() || [];

        container.innerHTML = `
            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="31" ${trait.code === 31 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">Attack Element</span>
                <select class="element-select" data-code="31" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${(elements || []).map((elem, idx) =>
                        elem ? `<option value="${idx}" ${trait.code === 31 && trait.dataId === idx ? 'selected' : ''}>${elem}</option>` : ''
                    ).join('')}
                </select>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="32" ${trait.code === 32 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">Attack State</span>
                <select class="state-select" data-code="32" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${(states || []).filter(s => s && s.id > 0).map(state =>
                        `<option value="${state.id}" ${trait.code === 32 && trait.dataId === state.id ? 'selected' : ''}>${state.name}</option>`
                    ).join('')}
                </select>
                <span style="color: var(--color-text-muted);">+</span>
                <input type="number" class="rate-value" data-code="32" value="${trait.code === 32 ? Math.round(trait.value * 100) : 100}"
                       style="width: 80px; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                <span style="color: var(--color-text-muted);">%</span>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="33" ${trait.code === 33 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">Attack Speed</span>
                <input type="number" class="speed-value" data-code="33" value="${trait.code === 33 ? trait.value : 0}" min="0" max="1000"
                       style="width: 100px; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="34" ${trait.code === 34 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">Attack Times+</span>
                <input type="number" class="times-value" data-code="34" value="${trait.code === 34 ? trait.value : 0}" min="0" max="9"
                       style="width: 80px; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="35" ${trait.code === 35 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">Attack Skill</span>
                <select class="skill-select" data-code="35" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${(skills || []).filter(s => s && s.id > 0).map(skill =>
                        `<option value="${skill.id}" ${trait.code === 35 && trait.dataId === skill.id ? 'selected' : ''}>${skill.name}</option>`
                    ).join('')}
                </select>
            </div>
        `;

        this.setupRadioInputs(container, trait);
    }

    createSkillTab(container, trait) {
        const skillTypes = this.databaseManager.getSystem()?.skillTypes || [];
        const skills = this.databaseManager.getSkills() || [];

        container.innerHTML = `
            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="41" ${trait.code === 41 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">Add Skill Type</span>
                <select class="skilltype-select" data-code="41" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${(skillTypes || []).filter((st, i) => i > 0 && st).map((type, idx) =>
                        `<option value="${idx + 1}" ${trait.code === 41 && trait.dataId === idx + 1 ? 'selected' : ''}>${type}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="42" ${trait.code === 42 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">Seal Skill Type</span>
                <select class="skilltype-select" data-code="42" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${(skillTypes || []).filter((st, i) => i > 0 && st).map((type, idx) =>
                        `<option value="${idx + 1}" ${trait.code === 42 && trait.dataId === idx + 1 ? 'selected' : ''}>${type}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="43" ${trait.code === 43 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">Add Skill</span>
                <select class="skill-select" data-code="43" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${(skills || []).filter(s => s && s.id > 0).map(skill =>
                        `<option value="${skill.id}" ${trait.code === 43 && trait.dataId === skill.id ? 'selected' : ''}>${skill.name}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="44" ${trait.code === 44 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">Seal Skill</span>
                <select class="skill-select" data-code="44" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${(skills || []).filter(s => s && s.id > 0).map(skill =>
                        `<option value="${skill.id}" ${trait.code === 44 && trait.dataId === skill.id ? 'selected' : ''}>${skill.name}</option>`
                    ).join('')}
                </select>
            </div>
        `;

        this.setupRadioInputs(container, trait);
    }

    createEquipTab(container, trait) {
        const weaponTypes = this.databaseManager.getSystem().weaponTypes;
        const armorTypes = this.databaseManager.getSystem().armorTypes;
        const equipTypes = this.databaseManager.getSystem().equipTypes;

        container.innerHTML = `
            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="51" ${trait.code === 51 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">Equip Weapon</span>
                <select class="weapontype-select" data-code="51" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${weaponTypes.filter((wt, i) => i > 0 && wt).map((type, idx) =>
                        `<option value="${idx + 1}" ${trait.code === 51 && trait.dataId === idx + 1 ? 'selected' : ''}>${type}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="52" ${trait.code === 52 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">Equip Armor</span>
                <select class="armortype-select" data-code="52" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${armorTypes.filter((at, i) => i > 0 && at).map((type, idx) =>
                        `<option value="${idx + 1}" ${trait.code === 52 && trait.dataId === idx + 1 ? 'selected' : ''}>${type}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="53" ${trait.code === 53 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">Lock Equip</span>
                <select class="equiptype-select" data-code="53" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${equipTypes.filter((et, i) => i > 0 && et).map((type, idx) =>
                        `<option value="${idx + 1}" ${trait.code === 53 && trait.dataId === idx + 1 ? 'selected' : ''}>${type}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="54" ${trait.code === 54 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">Seal Equip</span>
                <select class="equiptype-select" data-code="54" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    ${equipTypes.filter((et, i) => i > 0 && et).map((type, idx) =>
                        `<option value="${idx + 1}" ${trait.code === 54 && trait.dataId === idx + 1 ? 'selected' : ''}>${type}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="55" ${trait.code === 55 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 100px;">Slot Type</span>
                <select class="slottype-select" data-code="55" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    <option value="0" ${trait.code === 55 && trait.dataId === 0 ? 'selected' : ''}>${this._t('Normal')}</option>
                    <option value="1" ${trait.code === 55 && trait.dataId === 1 ? 'selected' : ''}>${this._t('Dual Wield')}</option>
                </select>
            </div>
        `;

        this.setupRadioInputs(container, trait);
    }

    createOtherTab(container, trait) {
        container.innerHTML = `
            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="61" ${trait.code === 61 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">Action Times+</span>
                <input type="number" class="times-value" data-code="61" value="${trait.code === 61 ? Math.round(trait.value * 100) : 0}" step="0.01"
                       style="width: 100px; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                <span style="color: var(--color-text-muted);">%</span>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="62" ${trait.code === 62 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">Special Flag</span>
                <select class="specialflag-select" data-code="62" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    <option value="0" ${trait.code === 62 && trait.dataId === 0 ? 'selected' : ''}>${this._t('Auto Battle')}</option>
                    <option value="1" ${trait.code === 62 && trait.dataId === 1 ? 'selected' : ''}>${this._t('Guard')}</option>
                    <option value="2" ${trait.code === 62 && trait.dataId === 2 ? 'selected' : ''}>${this._t('Substitute')}</option>
                    <option value="3" ${trait.code === 62 && trait.dataId === 3 ? 'selected' : ''}>${this._t('Preserve TP')}</option>
                </select>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="63" ${trait.code === 63 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">Collapse Effect</span>
                <select class="collapse-select" data-code="63" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    <option value="0" ${trait.code === 63 && trait.dataId === 0 ? 'selected' : ''}>${this._t('Normal')}</option>
                    <option value="1" ${trait.code === 63 && trait.dataId === 1 ? 'selected' : ''}>${this._t('Boss')}</option>
                    <option value="2" ${trait.code === 63 && trait.dataId === 2 ? 'selected' : ''}>${this._t('Instant')}</option>
                    <option value="3" ${trait.code === 63 && trait.dataId === 3 ? 'selected' : ''}>${this._t('No Disappear')}</option>
                </select>
            </div>

            <div class="trait-option" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <input type="radio" name="trait-type" value="64" ${trait.code === 64 ? 'checked' : ''}>
                <span style="color: var(--color-text-strong); min-width: 110px;">Party Ability</span>
                <select class="party-select" data-code="64" style="flex: 1; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px;">
                    <option value="0" ${trait.code === 64 && trait.dataId === 0 ? 'selected' : ''}>${this._t('Encounter Half')}</option>
                    <option value="1" ${trait.code === 64 && trait.dataId === 1 ? 'selected' : ''}>${this._t('Encounter None')}</option>
                    <option value="2" ${trait.code === 64 && trait.dataId === 2 ? 'selected' : ''}>${this._t('Cancel Surprise')}</option>
                    <option value="3" ${trait.code === 64 && trait.dataId === 3 ? 'selected' : ''}>${this._t('Raise Preemptive')}</option>
                    <option value="4" ${trait.code === 64 && trait.dataId === 4 ? 'selected' : ''}>${this._t('Gold Double')}</option>
                    <option value="5" ${trait.code === 64 && trait.dataId === 5 ? 'selected' : ''}>${this._t('Drop Item Double')}</option>
                </select>
            </div>
        `;

        this.setupRadioInputs(container, trait);
    }

    setupRadioInputs(container, trait) {
        const radios = container.querySelectorAll('input[type="radio"]');
        let lastChecked = null;

        // Find initially checked radio
        radios.forEach(radio => {
            if (radio.checked) {
                lastChecked = radio;
            }
        });

        // Allow deselecting radio buttons by clicking them again
        radios.forEach(radio => {
            radio.addEventListener('click', (e) => {
                // If this radio was already checked before the click
                if (radio === lastChecked) {
                    // Uncheck it
                    radio.checked = false;
                    lastChecked = null;
                    // Clear the trait code to indicate no selection
                    trait.code = null;
                    trait.dataId = 0;
                    trait.value = 0;
                } else {
                    // New selection - update lastChecked
                    lastChecked = radio;

                    // Update trait based on selection
                    const code = parseInt(radio.value);
                    trait.code = code;

                    // Find the associated inputs for this trait code
                    const selectWithCode = container.querySelector(`select[data-code="${code}"]`);
                    const inputWithCode = container.querySelector(`input[type="number"][data-code="${code}"]`);

                    // Set dataId from the select if it exists
                    if (selectWithCode) {
                        trait.dataId = parseInt(selectWithCode.value);
                    }

                    // Set default value based on trait type
                    if (code === 14 || code === 31 || code === 35 || code === 41 || code === 42 || code === 43 || code === 44 ||
                        code === 51 || code === 52 || code === 53 || code === 54 || code === 55 ||
                        code === 62 || code === 63 || code === 64) {
                        // These traits don't use value or use it as 0
                        trait.value = 0;
                    } else if (code === 33 || code === 34) {
                        // Attack Speed and Attack Times+ use direct value (not percentage)
                        trait.value = inputWithCode ? parseFloat(inputWithCode.value) : 0;
                    } else if (code === 22) {
                        // Ex-Parameter uses decimal
                        trait.value = inputWithCode ? parseFloat(inputWithCode.value) / 100 : 0;
                    } else {
                        // Most traits use percentage as decimal
                        trait.value = inputWithCode ? parseFloat(inputWithCode.value) / 100 : 1.0;
                    }
                }
            });
        });

        // Setup change listeners for selects
        container.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', (e) => {
                const code = parseInt(e.target.closest('.trait-option').querySelector('input[type="radio"]').value);
                // Only update if this select's radio is checked
                const radio = e.target.closest('.trait-option').querySelector('input[type="radio"]');
                if (radio && radio.checked) {
                    trait.dataId = parseInt(e.target.value);
                }
            });
        });

        // Setup change listeners for number inputs
        container.querySelectorAll('input[type="number"]').forEach(input => {
            input.addEventListener('input', (e) => {
                const radio = e.target.closest('.trait-option').querySelector('input[type="radio"]');
                // Only update if this input's radio is checked
                if (radio && radio.checked) {
                    const code = parseInt(radio.value);
                    if (code === 33 || code === 34) {
                        // Attack Speed and Attack Times+ use direct value
                        trait.value = parseFloat(e.target.value) || 0;
                    } else {
                        // Convert percentage to decimal
                        trait.value = (parseFloat(e.target.value) || 0) / 100;
                    }
                }
            });
        });
    }

    saveTrait(trait) {
        // Validate that a trait type is selected
        if (!trait.code) {
            console.warn('DatabaseTraitEditor.saveTrait - Cannot save trait without a type selected');
            alert(this._t('Please select a trait type before saving.'));
            return false;
        }

        console.log('DatabaseTraitEditor.saveTrait - Saving trait:', trait);
        console.log('DatabaseTraitEditor.saveTrait - Current entry ID:', this.currentEntry?.id);
        console.log('DatabaseTraitEditor.saveTrait - Trait index:', this.currentTraitIndex);

        if (this.currentTraitIndex >= 0) {
            // Update existing trait
            this.currentEntry.traits[this.currentTraitIndex] = trait;
            console.log('DatabaseTraitEditor.saveTrait - Updated existing trait at index', this.currentTraitIndex);
        } else {
            // Add new trait
            if (!this.currentEntry.traits) {
                this.currentEntry.traits = [];
            }
            this.currentEntry.traits.push(trait);
            console.log('DatabaseTraitEditor.saveTrait - Added new trait, total traits now:', this.currentEntry.traits.length);
        }

        console.log('DatabaseTraitEditor.saveTrait - All traits after save:', this.currentEntry.traits);

        // Call save callback if provided
        if (this.onSaveCallback) {
            console.log('DatabaseTraitEditor.saveTrait - Calling save callback with entry:', this.currentEntry);
            this.onSaveCallback(this.currentEntry);
        } else {
            console.warn('DatabaseTraitEditor.saveTrait - No save callback registered!');
        }

        return true;
    }
}
