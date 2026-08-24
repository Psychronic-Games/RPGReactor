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
     * One row of a trait tab. Every row shares the same grid columns
     * (radio | label | control | prefix | value | unit) so the tabs stay
     * symmetrical whatever mix of selects and numbers a row carries.
     * A row with no dropdown puts its number (and unit) where the dropdown
     * would sit, so the control column never yawns empty.
     */
    _rowHTML(trait, { code, label, control = '', prefix = '', value = '', unit = '' }) {
        if (!control && value) {
            control = `<span class="rr-trait-lone-value">${value}<span class="rr-trait-unit">${unit}</span></span>`;
            value = '';
            unit = '';
        }
        return `
            <div class="trait-option rr-trait-row">
                <input type="radio" name="trait-type" value="${code}" ${trait.code === code ? 'checked' : ''}>
                <span class="rr-trait-label">${label}</span>
                <span class="rr-trait-control">${control}</span>
                <span class="rr-trait-prefix">${prefix}</span>
                <span class="rr-trait-value">${value}</span>
                <span class="rr-trait-unit">${unit}</span>
            </div>`;
    }

    _selectHTML(cssClass, code, optionsHTML) {
        return `<select class="${cssClass} database-field-value" data-code="${code}">${optionsHTML}</select>`;
    }

    _numberHTML(cssClass, code, value, extra = '') {
        return `<input type="number" class="${cssClass} database-field-value" data-code="${code}" value="${value}" ${extra}>`;
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
        overlay.className = 'rr-modal-overlay';

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'rr-modal trait-editor-modal';
        modal.style.cssText = 'width: 620px; max-width: 92vw;';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${this._t(traitIndex >= 0 ? 'Edit Trait' : 'Add Trait')}</div>
            <button class="rr-modal-close close-btn" type="button">&times;</button>
        `;

        // Tab bar
        const tabBar = document.createElement('div');
        tabBar.style.cssText = `
            display: flex;
            border-bottom: 1px solid var(--color-border-subtle);
            background: var(--color-bg-panel);
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
        tabContent.className = 'rr-modal-body';
        tabContent.style.cssText = 'flex: 1; min-height: 0;';

        // Footer with buttons
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        footer.innerHTML = `
            <button class="cancel-btn rr-btn-secondary">${this._t('Cancel')}</button>
            <button class="ok-btn rr-button-primary">${this._t('OK')}</button>
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

    _paramOptions(code, trait) {
        return ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck']
            .map(param => this._t(param))
            .map((param, idx) => `<option value="${idx}" ${trait.code === code && trait.dataId === idx ? 'selected' : ''}>${param}</option>`)
            .join('');
    }

    _stateOptions(code, trait) {
        const states = this.databaseManager.getStates() || [];
        return states.filter(s => s && s.id > 0).map(state =>
            `<option value="${state.id}" ${trait.code === code && trait.dataId === state.id ? 'selected' : ''}>${rrEscapeHtml(state.name)}</option>`
        ).join('');
    }

    _skillOptions(code, trait) {
        const skills = this.databaseManager.getSkills() || [];
        return skills.filter(s => s && s.id > 0).map(skill =>
            `<option value="${skill.id}" ${trait.code === code && trait.dataId === skill.id ? 'selected' : ''}>${rrEscapeHtml(skill.name)}</option>`
        ).join('');
    }

    createRatesTab(container, trait) {
        const elements = this.databaseManager.getSystem()?.elements || [];
        const elementOptions = code => (elements || []).filter((e, i) => i > 0 && e).map((elem, idx) =>
            `<option value="${idx + 1}" ${trait.code === code && trait.dataId === idx + 1 ? 'selected' : ''}>${rrEscapeHtml(elem)}</option>`
        ).join('');

        container.innerHTML = [
            this._rowHTML(trait, {
                code: 11, label: this._t('Element Rate'),
                control: this._selectHTML('element-select', 11, elementOptions(11)),
                value: this._numberHTML('rate-value', 11, trait.code === 11 ? Math.round(trait.value * 100) : 100),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 12, label: this._t('Debuff Rate'),
                control: this._selectHTML('debuff-select', 12, this._paramOptions(12, trait)),
                value: this._numberHTML('rate-value', 12, trait.code === 12 ? Math.round(trait.value * 100) : 100),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 13, label: this._t('State Rate'),
                control: this._selectHTML('state-select', 13, this._stateOptions(13, trait)),
                value: this._numberHTML('rate-value', 13, trait.code === 13 ? Math.round(trait.value * 100) : 100),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 14, label: this._t('State Resist'),
                control: this._selectHTML('state-select', 14, this._stateOptions(14, trait))
            })
        ].join('');

        this.setupRadioInputs(container, trait);
    }

    createParamTab(container, trait) {
        const exParams = ['Hit Rate', 'Evasion Rate', 'Critical Rate', 'Critical Evasion', 'Magic Evasion', 'Magic Reflection', 'Counter Attack', 'HP Regeneration', 'MP Regeneration', 'TP Regeneration']
            .map(param => this._t(param))
            .map((param, idx) => `<option value="${idx}" ${trait.code === 22 && trait.dataId === idx ? 'selected' : ''}>${param}</option>`)
            .join('');
        const spParams = ['Target Rate', 'Guard Effect', 'Recovery Effect', 'Pharmacology', 'MP Cost Rate', 'TP Charge Rate', 'Physical Damage', 'Magical Damage', 'Floor Damage', 'Experience']
            .map(param => this._t(param))
            .map((param, idx) => `<option value="${idx}" ${trait.code === 23 && trait.dataId === idx ? 'selected' : ''}>${param}</option>`)
            .join('');

        container.innerHTML = [
            this._rowHTML(trait, {
                code: 21, label: this._t('Parameter'),
                control: this._selectHTML('param-select', 21, this._paramOptions(21, trait)),
                value: this._numberHTML('rate-value', 21, trait.code === 21 ? Math.round(trait.value * 100) : 100),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 22, label: this._t('Ex-Parameter'),
                control: this._selectHTML('exparam-select', 22, exParams),
                prefix: '+',
                value: this._numberHTML('rate-value', 22, trait.code === 22 ? Math.round(trait.value * 100) : 0, 'step="0.01"'),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 23, label: this._t('Sp-Parameter'),
                control: this._selectHTML('spparam-select', 23, spParams),
                value: this._numberHTML('rate-value', 23, trait.code === 23 ? Math.round(trait.value * 100) : 100),
                unit: '%'
            })
        ].join('');

        this.setupRadioInputs(container, trait);
    }

    createAttackTab(container, trait) {
        const elements = this.databaseManager.getSystem()?.elements || [];
        const attackElementOptions = (elements || []).map((elem, idx) =>
            elem ? `<option value="${idx}" ${trait.code === 31 && trait.dataId === idx ? 'selected' : ''}>${rrEscapeHtml(elem)}</option>` : ''
        ).join('');

        container.innerHTML = [
            this._rowHTML(trait, {
                code: 31, label: this._t('Attack Element'),
                control: this._selectHTML('element-select', 31, attackElementOptions)
            }),
            this._rowHTML(trait, {
                code: 32, label: this._t('Attack State'),
                control: this._selectHTML('state-select', 32, this._stateOptions(32, trait)),
                prefix: '+',
                value: this._numberHTML('rate-value', 32, trait.code === 32 ? Math.round(trait.value * 100) : 100),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 33, label: this._t('Attack Speed'),
                value: this._numberHTML('speed-value', 33, trait.code === 33 ? trait.value : 0, 'min="0" max="1000"')
            }),
            this._rowHTML(trait, {
                code: 34, label: this._t('Attack Times+'),
                value: this._numberHTML('times-value', 34, trait.code === 34 ? trait.value : 0, `min="0" max="${globalThis.RR_LIMITS?.ACTION_REPEATS || 100}"`)
            }),
            this._rowHTML(trait, {
                code: 35, label: this._t('Attack Skill'),
                control: this._selectHTML('skill-select', 35, this._skillOptions(35, trait))
            })
        ].join('');

        this.setupRadioInputs(container, trait);
    }

    createSkillTab(container, trait) {
        const skillTypes = this.databaseManager.getSystem()?.skillTypes || [];
        const skillTypeOptions = code => (skillTypes || []).filter((st, i) => i > 0 && st).map((type, idx) =>
            `<option value="${idx + 1}" ${trait.code === code && trait.dataId === idx + 1 ? 'selected' : ''}>${rrEscapeHtml(type)}</option>`
        ).join('');

        container.innerHTML = [
            this._rowHTML(trait, {
                code: 41, label: this._t('Add Skill Type'),
                control: this._selectHTML('skilltype-select', 41, skillTypeOptions(41))
            }),
            this._rowHTML(trait, {
                code: 42, label: this._t('Seal Skill Type'),
                control: this._selectHTML('skilltype-select', 42, skillTypeOptions(42))
            }),
            this._rowHTML(trait, {
                code: 43, label: this._t('Add Skill'),
                control: this._selectHTML('skill-select', 43, this._skillOptions(43, trait))
            }),
            this._rowHTML(trait, {
                code: 44, label: this._t('Seal Skill'),
                control: this._selectHTML('skill-select', 44, this._skillOptions(44, trait))
            })
        ].join('');

        this.setupRadioInputs(container, trait);
    }

    createEquipTab(container, trait) {
        const system = this.databaseManager.getSystem();
        const typeOptions = (types, code) => types.map((type, id) => ({ type, id })).filter(entry => entry.id > 0 && entry.type).map(entry =>
            `<option value="${entry.id}" ${trait.code === code && trait.dataId === entry.id ? 'selected' : ''}>${rrEscapeHtml(entry.type)}</option>`
        ).join('');
        const fixedOptions = (pairs, code) => pairs.map(([value, label]) =>
            `<option value="${value}" ${trait.code === code && trait.dataId === value ? 'selected' : ''}>${this._t(label)}</option>`
        ).join('');

        container.innerHTML = [
            this._rowHTML(trait, {
                code: 51, label: this._t('Equip Weapon'),
                control: this._selectHTML('weapontype-select', 51, typeOptions(system.weaponTypes, 51))
            }),
            this._rowHTML(trait, {
                code: 52, label: this._t('Equip Armor'),
                control: this._selectHTML('armortype-select', 52, typeOptions(system.armorTypes, 52))
            }),
            this._rowHTML(trait, {
                code: 53, label: this._t('Lock Equip'),
                control: this._selectHTML('equiptype-select', 53, typeOptions(system.equipTypes, 53))
            }),
            this._rowHTML(trait, {
                code: 54, label: this._t('Seal Equip'),
                control: this._selectHTML('equiptype-select', 54, typeOptions(system.equipTypes, 54))
            }),
            this._rowHTML(trait, {
                code: 55, label: this._t('Slot Type'),
                control: this._selectHTML('slottype-select', 55, fixedOptions([[0, 'Normal'], [1, 'Dual Wield']], 55))
            })
        ].join('');

        this.setupRadioInputs(container, trait);
    }

    createOtherTab(container, trait) {
        const fixedOptions = (pairs, code) => pairs.map(([value, label]) =>
            `<option value="${value}" ${trait.code === code && trait.dataId === value ? 'selected' : ''}>${this._t(label)}</option>`
        ).join('');

        container.innerHTML = [
            this._rowHTML(trait, {
                code: 61, label: this._t('Action Times+'),
                value: this._numberHTML('times-value', 61, trait.code === 61 ? Math.round(trait.value * 100) : 0, 'step="0.01"'),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 62, label: this._t('Special Flag'),
                control: this._selectHTML('specialflag-select', 62, fixedOptions([[0, 'Auto Battle'], [1, 'Guard'], [2, 'Substitute'], [3, 'Preserve TP']], 62))
            }),
            this._rowHTML(trait, {
                code: 63, label: this._t('Collapse Effect'),
                control: this._selectHTML('collapse-select', 63, fixedOptions([[0, 'Normal'], [1, 'Boss'], [2, 'Instant'], [3, 'No Disappear']], 63))
            }),
            this._rowHTML(trait, {
                code: 64, label: this._t('Party Ability'),
                control: this._selectHTML('party-select', 64, fixedOptions([[0, 'Encounter Half'], [1, 'Encounter None'], [2, 'Cancel Surprise'], [3, 'Raise Preemptive'], [4, 'Gold Double'], [5, 'Drop Item Double']], 64))
            })
        ].join('');

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
                        // Attack Speed and Attack Times+ use direct value.
                        trait.value = parseFloat(e.target.value) || 0;
                        if (code === 34) {
                            trait.value = Math.max(0, Math.min(globalThis.RR_LIMITS?.ACTION_REPEATS || 100, trait.value));
                            e.target.value = String(trait.value);
                        }
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
            alert(this._t('Please select a trait type before saving.'));
            return false;
        }

        if (this.currentTraitIndex >= 0) {
            // Update existing trait
            this.currentEntry.traits[this.currentTraitIndex] = trait;
        } else {
            // Add new trait
            if (!this.currentEntry.traits) {
                this.currentEntry.traits = [];
            }
            this.currentEntry.traits.push(trait);
        }

        // Call save callback if provided
        if (this.onSaveCallback) {
            this.onSaveCallback(this.currentEntry);
        }

        return true;
    }
}
